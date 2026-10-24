/**
 * src/menu-data.js —— 菜单数据来源解析：MCP 实时 > 内置快照 > 参考价兜底
 *
 * 麦当劳 MCP 的工具返回是「Markdown 包装文本」，真实 JSON 载荷需要提取
 * （见 src/mcp.js 的 extractJson）。本模块封装：
 *   1. 门店发现（query-nearby-stores，优先 24 小时/当前营业门店）
 *   2. 菜单价格（query-meals + calculate-price）
 *   3. 营养热量（list-nutrition-foods 的自定义表格字符串）
 *   4. 活动日历（campaign-calendar 的 Markdown）
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 餐品目录：关键词用于在 MCP 菜单中匹配目标餐品 */
export const CATALOG = [
  { menuKey: 'bigMac', label: '巨无霸', keywords: ['巨无霸'] },
  { menuKey: 'mcNuggets', label: '麦乐鸡', keywords: ['麦乐鸡'] },
  { menuKey: 'fries', label: '薯条', keywords: ['薯条'] },
  { menuKey: 'coke', label: '可乐', keywords: ['可乐'] },
  { menuKey: 'corn', label: '玉米杯', keywords: ['玉米'] },
  { menuKey: 'apple', label: '苹果片', keywords: ['苹果片', '苹果'] },
];

/** 兜底参考价（仅在 MCP 菜单不可用时使用，明确标注为示例数据） */
const FALLBACK_ITEMS = {
  bigMac: { name: '巨无霸', price: 23.0, kcal: 513 },
  mcNuggets: { name: '麦乐鸡', price: 12.5, kcal: 213 },
  fries: { name: '薯条', price: 11.0, kcal: 289 },
  coke: { name: '可乐', price: 10.0, kcal: 147 },
  corn: { name: '玉米杯', price: 8.5, kcal: 87 },
  apple: { name: '苹果片', price: 7.0, kcal: 50 },
};

export function fallbackMenu() {
  return {
    source: 'fallback',
    generatedAt: new Date().toISOString(),
    note: '内置参考价（未连接 MCP 或门店不可用），仅供演示；实时价格请配置 MCP Token。',
    items: structuredClone(FALLBACK_ITEMS),
    bigMacCouponPrice: null,
    campaigns: [],
  };
}

/** 读取预生成的 MCP 数据快照 */
export function loadSnapshot() {
  try {
    const raw = readFileSync(path.join(ROOT, 'data', 'mcd-snapshot.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/* ------------------------------ 解析工具 ------------------------------ */

/**
 * 解析 list-nutrition-foods 返回的自定义表格字符串：
 * "[160]{productName,nutritionDescription,energyKj,energyKcal,protein,fat,carbohydrate,sodium,calcium}:\n  巨无霸,null,2146,513,27,26,42,961,171\n …"
 * @returns {Map<string, number>} 餐品名 → 千卡
 */
export function parseNutritionTable(dataStr) {
  const map = new Map();
  if (typeof dataStr !== 'string') return map;
  const header = dataStr.match(/^\[(\d+)\]\{([^}]+)\}:/);
  if (!header) return map;
  const cols = header[2].split(',').map((c) => c.trim());
  const kcalIdx = cols.indexOf('energyKcal');
  const nameIdx = cols.indexOf('productName');
  if (kcalIdx < 0 || nameIdx < 0) return map;
  for (const line of dataStr.split('\n').slice(1)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const cells = trimmed.split(',');
    const name = (cells[nameIdx] ?? '').trim();
    const kcal = Number(cells[kcalIdx]);
    if (name && Number.isFinite(kcal)) map.set(name, kcal);
  }
  return map;
}

/**
 * 解析 campaign-calendar 返回的 Markdown，提取「今日」活动标题。
 * 形如："#### 2026年10月24日 今日\n\n- **活动标题**：xxx"
 * @returns {string[]} 今日活动标题列表
 */
export function parseCampaignTitles(text) {
  const t = String(text ?? '');
  if (!t) return [];
  const sections = t.split(/^####\s+/m).slice(1);
  const titles = [];
  for (const section of sections) {
    const head = section.split('\n')[0] ?? '';
    if (!/今日|today/i.test(head)) continue;
    for (const m of section.matchAll(/\*\*活动标题\*\*：(.+)/g)) {
      const title = m[1].trim();
      if (title && !titles.includes(title)) titles.push(title);
    }
  }
  return titles;
}

/** 判断门店当前是否营业（支持 00:00-23:59 视为 24 小时） */
function isStoreOpen(store, now = new Date()) {
  const start = String(store.businessStartTime ?? '');
  const end = String(store.businessEndTime ?? '');
  const hhmm = (s) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  };
  const s = hhmm(start);
  const e = hhmm(end);
  const cur = now.getHours() * 60 + now.getMinutes();
  if (s == null || e == null) return false;
  if (s === 0 && e >= 1439) return true; // 24 小时
  return cur >= s && cur <= e;
}

/** 从附近门店中挑一个当前可用的（优先 24 小时/营业中），返回 { storeCode, beCode, name } */
async function findUsableStore(client) {
  const searches = [
    { beType: 5, searchType: 2, city: '北京市', keyword: '健德桥' },
    { beType: 5, searchType: 2, city: '北京市', keyword: '中关村' },
    { beType: 5, searchType: 2, city: '上海市', keyword: '陆家嘴' },
    { beType: 5, searchType: 2, city: '广州市', keyword: '天河' },
    { beType: 5, searchType: 2, city: '深圳市', keyword: '科技园' },
    { beType: 5, searchType: 2, city: '北京市', keyword: '万柳' },
    { beType: 1, searchType: 2, city: '北京市', keyword: '中关村' },
    { beType: 1, searchType: 2, city: '上海市', keyword: '陆家嘴' },
  ];
  const stores = [];
  for (const q of searches) {
    try {
      const { json } = await client.callTool('query-nearby-stores', q);
      const list = Array.isArray(json?.data) ? json.data : [];
      for (const s of list) {
        if (s?.storeCode) stores.push(s);
      }
    } catch {
      /* 忽略单次搜索失败 */
    }
  }
  if (!stores.length) return null;
  // 优先：当前营业 > 24 小时 > 其他
  const ranked = [...stores].sort((a, b) => {
    const score = (s) => (isStoreOpen(s) ? 2 : s.businessStartTime === '00:00' ? 1 : 0);
    return score(b) - score(a);
  });
  const best = ranked[0];
  return { storeCode: best.storeCode, beCode: best.beCode, name: best.storeName };
}

/* ------------------------------ 实时菜单构建 ------------------------------ */

/**
 * 通过 MCP 实时构建菜单数据
 * @param {import('./mcp.js').McpClient} client
 */
export async function buildLiveMenu(client) {
  const menu = {
    source: 'live',
    generatedAt: new Date().toISOString(),
    note: '麦当劳 MCP（mcp.mcd.cn）实时数据',
    items: {},
    bigMacCouponPrice: null,
    campaigns: [],
    store: null,
  };

  // 1) 当前时间（MCP 侧时间戳）
  try {
    const { json } = await client.callTool('now-time-info', {});
    const iso = json?.data?.datetime ?? json?.data?.utc ?? null;
    if (typeof iso === 'string') menu.generatedAt = iso;
  } catch { /* 用本地时间 */ }

  // 2) 门店 → 菜单价格
  let mealsMap = {};
  let store = null;
  try {
    store = await findUsableStore(client);
  } catch { /* 忽略 */ }
  if (store) {
    menu.store = { name: store.name, storeCode: store.storeCode };
    const params = { storeCode: store.storeCode, orderType: 1, beType: store.beCode ? 5 : 1 };
    if (store.beCode) params.beCode = store.beCode;
    try {
      const { json } = await client.callTool('query-meals', params);
      const data = json?.data ?? {};
      mealsMap = data.meals ?? {};
      // 菜单为空时（如刚过营业时间），尝试不带 beCode 的到店场景
      if (!Object.keys(mealsMap).length) {
        const retry = await client.callTool('query-meals', { storeCode: store.storeCode, orderType: 1, beType: 1 });
        mealsMap = retry.json?.data?.meals ?? {};
      }
    } catch { /* 忽略 */ }
  }

  // 3) 营养热量
  let kcalByName = new Map();
  try {
    const { json } = await client.callTool('list-nutrition-foods', {});
    kcalByName = parseNutritionTable(json?.data);
  } catch { /* 忽略 */ }

  // 4) 汇总餐品
  for (const entry of CATALOG) {
    const hit = Object.values(mealsMap).find((m) =>
      entry.keywords.some((k) => String(m?.name ?? '').includes(k)),
    );
    const price = hit ? Number(hit.currentPrice ?? hit.originalPrice ?? NaN) : NaN;
    menu.items[entry.menuKey] = {
      name: hit?.name ?? entry.label,
      price: Number.isFinite(price) ? price : FALLBACK_ITEMS[entry.menuKey].price,
      kcal: kcalByName.get(entry.label) ?? kcalByName.get(hit?.name ?? '') ?? FALLBACK_ITEMS[entry.menuKey].kcal,
    };
  }

  // 5) 巨无霸试算（calculate-price，得到当前门店的应付价）
  const bigMacEntry = Object.entries(mealsMap).find(([, m]) => String(m?.name ?? '') === '巨无霸');
  if (bigMacEntry && store) {
    try {
      const params = { storeCode: store.storeCode, orderType: 1, beType: store.beCode ? 5 : 1 };
      if (store.beCode) params.beCode = store.beCode;
      const { json } = await client.callTool('calculate-price', {
        ...params,
        items: [{ productCode: bigMacEntry[0], quantity: 1 }],
      });
      const priceFen = json?.data?.price ?? json?.data?.productPrice ?? null;
      if (typeof priceFen === 'number' && priceFen > 0) {
        menu.bigMacCouponPrice = priceFen / 100;
      }
    } catch { /* 忽略，保持菜单价 */ }
  }

  // 6) 今日活动
  try {
    const { text } = await client.callTool('campaign-calendar', {});
    menu.campaigns = parseCampaignTitles(text).map((title) => ({ title }));
  } catch { /* 忽略 */ }

  // 数据完整性备注
  if (!Object.keys(mealsMap).length) {
    menu.note = '麦当劳 MCP 实时数据（当前时段门店菜单不可用，价格为内置参考价）';
  }

  return menu;
}

/**
 * 解析菜单数据：有 Token 走实时，否则用快照/兜底
 * @param {string|null} mcdToken
 */
export async function resolveMenu(mcdToken) {
  if (mcdToken) {
    const { McpClient } = await import('./mcp.js');
    const client = new McpClient({ token: mcdToken });
    return buildLiveMenu(client);
  }
  return loadSnapshot() ?? fallbackMenu();
}
