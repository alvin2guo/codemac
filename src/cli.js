#!/usr/bin/env node
/**
 * src/cli.js —— CodeMac 命令行入口
 *
 * 用法：
 *   codemac <github用户名> [--mcd-token <token>] [--github-token <token>] [--out card.svg] [--json]
 *   codemac menu                      查看当前菜单数据来源
 *   codemac serve [--port 8787]       启动本地代理（网页演示实时模式用）
 */

import { writeFileSync } from 'node:fs';
import { collectGitHubData } from './github.js';
import { resolveMenu, loadSnapshot, fallbackMenu } from './menu-data.js';
import { computeReport, renderText } from './report.js';
import { renderCardSvg } from './card.js';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

async function cmdReport(args) {
  const login = args._[0];
  if (!login) {
    console.error('用法：codemac <github用户名> [--mcd-token <token>] [--out card.svg]');
    process.exit(1);
  }
  const mcdToken = args['mcd-token'] ?? process.env.MCD_TOKEN ?? null;
  const ghToken = args['github-token'] ?? process.env.GITHUB_TOKEN ?? null;

  console.error(`[codemac] 抓取 GitHub 公开数据：@${login} …`);
  const ghData = await collectGitHubData(login, { token: ghToken });

  console.error(`[codemac] 解析麦当劳 MCP 数据（${mcdToken ? '实时' : '内置快照'}）…`);
  const menu = await resolveMenu(mcdToken);

  const report = computeReport(ghData, menu);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderText(report));
  }

  const out = typeof args.out === 'string' ? args.out : `codemac-${login}.svg`;
  writeFileSync(out, renderCardSvg(report), 'utf8');
  if (!args.quiet) console.error(`[codemac] 分享卡片已生成：${out}`);
}

function cmdMenu() {
  const snapshot = loadSnapshot();
  const menu = snapshot ?? fallbackMenu();
  console.log(`数据来源：${menu.source === 'snapshot' ? '内置快照' : menu.source}`);
  console.log(`生成时间：${menu.generatedAt}`);
  for (const [key, item] of Object.entries(menu.items)) {
    console.log(`  ${item.name}：¥${Number(item.price).toFixed(2)}（${item.kcal ?? '?'} 千卡）`);
  }
  if (menu.bigMacCouponPrice) console.log(`巨无霸券后价：¥${menu.bigMacCouponPrice}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._[0];

  if (args.serve || cmd === 'serve') {
    const { startServer } = await import('./server.js');
    const port = Number(args.port ?? process.env.PORT ?? 8787);
    await startServer({ port });
    return;
  }
  if (cmd === 'menu') return cmdMenu();
  if (!cmd || cmd.startsWith('-')) {
    console.error('用法：codemac <github用户名> | codemac menu | codemac serve');
    process.exit(1);
  }
  await cmdReport(args);
}

main().catch((err) => {
  console.error(`[codemac] 失败：${err.message}`);
  process.exit(1);
});
