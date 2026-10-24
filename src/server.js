/**
 * src/server.js —— 本地代理：给网页演示提供「实时 MCP 模式」
 *
 * 用法：
 *   MCD_TOKEN=<token> node src/server.js [--port 8787]
 *
 * 作用：
 *   1. 托管 docs/ 下的静态演示页（GitHub Pages 同款）
 *   2. GET  /api/menu    → 通过服务端保存的 MCD_TOKEN 实时获取菜单数据
 *   3. POST /api/report  → { login } 一站式生成报告（GitHub 公开数据 + MCP 实时菜单）
 *
 * 注意：MCP Token 只保存在服务端环境变量中，不会发送到浏览器。
 */

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpClient } from './mcp.js';
import { buildLiveMenu } from './menu-data.js';
import { collectGitHubData } from './github.js';
import { computeReport } from './report.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_ROOT = ROOT; // 演示页在仓库根目录，浏览器还需加载 src/ 下的 ESM 模块
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

export async function startServer({ port = 8787 } = {}) {
  const token = process.env.MCD_TOKEN ?? null;
  let menuCache = null;
  let menuCacheAt = 0;

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    if (url.pathname === '/api/menu') {
      if (!token) return json(res, 400, { error: '服务端未配置 MCD_TOKEN，实时模式不可用；请使用内置快照模式。' });
      try {
        if (!menuCache || Date.now() - menuCacheAt > 5 * 60 * 1000) {
          const client = new McpClient({ token });
          menuCache = await buildLiveMenu(client);
          menuCacheAt = Date.now();
        }
        return json(res, 200, menuCache);
      } catch (err) {
        return json(res, 500, { error: String(err.message) });
      }
    }

    if (url.pathname === '/api/report' && req.method === 'POST') {
      try {
        const body = JSON.parse(await readBody(req) || '{}');
        const login = String(body.login ?? '').trim();
        if (!login) return json(res, 400, { error: '缺少 login 参数' });
        const ghData = await collectGitHubData(login);
        const menu = token ? (menuCache ??= await buildLiveMenu(new McpClient({ token }))) : null;
        if (!menu) return json(res, 400, { error: '服务端未配置 MCD_TOKEN' });
        return json(res, 200, computeReport(ghData, menu));
      } catch (err) {
        return json(res, 500, { error: String(err.message) });
      }
    }

    // 静态文件
    let filePath = path.join(STATIC_ROOT, url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname));
    if (!filePath.startsWith(ROOT) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = path.join(STATIC_ROOT, 'index.html');
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
    res.end(readFileSync(filePath));
  });

  await new Promise((resolve) => server.listen(port, resolve));
  console.log(`[codemac] 演示页已启动：http://localhost:${port}/`);
  console.log(`[codemac] 实时 MCP 模式：${token ? '已启用（服务端持有 Token）' : '未配置 MCD_TOKEN，仅快照模式'}`);
}

// 直接运行（node src/server.js）时自动启动
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const portIdx = process.argv.indexOf('--port');
  const port = portIdx > -1 ? Number(process.argv[portIdx + 1]) : Number(process.env.PORT ?? 8787);
  startServer({ port }).catch((err) => {
    console.error(`[codemac] 服务启动失败：${err.message}`);
    process.exit(1);
  });
}
