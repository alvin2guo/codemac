#!/usr/bin/env node
/**
 * scripts/snapshot.js —— 连接麦当劳 MCP，预取演示数据快照
 *
 * 用法：
 *   MCD_TOKEN=<token> node scripts/snapshot.js
 *   node scripts/snapshot.js --token <token>
 *
 * 产物：
 *   data/mcd-snapshot.json   网页演示 / CLI 离线模式使用的数据快照
 *   docs/mcp-raw/*.json      各 MCP 工具的原始返回存档（仅公开数据，不含任何账户信息）
 *
 * 隐私说明：本脚本刻意不采集 query-my-account / order-list / delivery-query-addresses
 * 等涉及个人账户与地址的 Tool；存档仅包含菜单、营养、活动、优惠券等公开数据。
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient } from '../src/mcp.js';
import { buildLiveMenu } from '../src/menu-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      args[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const token = args.token ?? process.env.MCD_TOKEN;
  if (!token) {
    console.error('请先申请麦当劳 MCP Token：https://open.mcd.cn/mcp （手机号登录 → 控制台 → 激活）');
    console.error('然后：MCD_TOKEN=<token> node scripts/snapshot.js');
    process.exit(1);
  }

  const client = new McpClient({ token });
  const rawDir = path.join(ROOT, 'docs', 'mcp-raw');
  // 清掉旧存档，避免历史版本里残留个人数据
  if (existsSync(path.join(rawDir, 'mcp-tools-raw.json'))) {
    rmSync(path.join(rawDir, 'mcp-tools-raw.json'));
  }
  mkdirSync(rawDir, { recursive: true });

  console.log('[snapshot] 连接 mcp.mcd.cn …');
  await client.initialize();
  console.log(`[snapshot] 握手成功，协议版本：${client.protocolVersion}`);

  // 仅采集公开数据 Tool（刻意排除账户/地址/订单类 Tool）
  const probes = [
    ['now-time-info', () => client.callTool('now-time-info', {})],
    ['list-nutrition-foods', () => client.callTool('list-nutrition-foods', {})],
    ['campaign-calendar', () => client.callTool('campaign-calendar', {})],
    ['available-coupons', () => client.callTool('available-coupons', {})],
  ];
  const raw = {};
  for (const [name, fn] of probes) {
    try {
      const { text } = await fn();
      // 优惠券文本里带有签名 CDN 图片地址，存档时剔除图片行，仅保留标题与状态
      raw[name] = name === 'available-coupons'
        ? String(text).split('\n').filter((l) => !l.includes('<img')).join('\n')
        : text;
      console.log(`[snapshot] ${name} ✓`);
    } catch (err) {
      raw[name] = { error: String(err.message) };
      console.warn(`[snapshot] ${name} ✗ ${err.message}`);
    }
  }
  writeFileSync(path.join(rawDir, 'mcp-tools-raw.json'), JSON.stringify(raw, null, 2), 'utf8');

  // 构建菜单快照
  const menu = await buildLiveMenu(client);
  const snapshot = {
    ...menu,
    contest: '麦当劳程序员创意开发大赛',
    endpoint: 'https://mcp.mcd.cn',
    disclaimer: '数据由麦当劳中国官方 MCP 实时抓取，仅供 CodeMac 演示与娱乐换算使用。',
  };
  const out = path.join(ROOT, 'data', 'mcd-snapshot.json');
  mkdirSync(path.dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(snapshot, null, 2), 'utf8');
  console.log(`[snapshot] 快照已写入 ${out}`);
  if (menu.store) console.log(`[snapshot] 价格来源门店：${menu.store.name}（${menu.store.storeCode}）`);
  console.log(`[snapshot] 巨无霸价格：¥${menu.items.bigMac?.price}${menu.bigMacCouponPrice ? `（试算应付 ¥${menu.bigMacCouponPrice}）` : ''}`);
  if (menu.campaigns.length) console.log(`[snapshot] 今日活动：${menu.campaigns.map((c) => c.title).join(' / ')}`);
}

main().catch((err) => {
  console.error(`[snapshot] 失败：${err.message}`);
  process.exit(1);
});
