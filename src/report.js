/**
 * src/report.js —— 把 GitHub 公开指标映射成「代码餐饮报告」并用 MCP 真实价格计价
 *
 * 娱乐向换算，仅供 1024 程序员节玩乐：
 *   commit   → 巨无霸      star → 麦乐鸡
 *   PR       → 薯条        Issue → 可乐
 *   Review   → 玉米杯      粉丝 → 苹果片
 */

/** 指标 → 餐品映射表 */
export const FOOD_MAP = [
  { key: 'commits', emoji: '🍔', name: '巨无霸', unit: '个', menuKey: 'bigMac', why: '每一个 commit 都管饱' },
  { key: 'totalStars', emoji: '🍗', name: '麦乐鸡', unit: '份', menuKey: 'mcNuggets', why: 'Star 是社区给你加的鸡腿' },
  { key: 'prsMerged', emoji: '🍟', name: '薯条', unit: '份', menuKey: 'fries', why: '合并的 PR 又长又脆' },
  { key: 'issuesOpened', emoji: '🥤', name: '可乐', unit: '杯', menuKey: 'coke', why: '提 Issue 的人爱冒泡' },
  { key: 'reviews', emoji: '🌽', name: '玉米杯', unit: '杯', menuKey: 'corn', why: 'Code Review 促消化' },
  { key: 'followers', emoji: '🍎', name: '苹果片', unit: '袋', menuKey: 'apple', why: '粉丝是健康的证明' },
];

/** 段位（按巨无霸等价比评定） */
const RANKS = [
  { min: 10000, title: '麦门传说', desc: '你的含堡量已突破大气层' },
  { min: 1000, title: '麦门巨佬', desc: '巨无霸见到你都要鞠躬' },
  { min: 100, title: '麦门长老', desc: '麦籍认证，编号 1024' },
  { min: 30, title: '麦门正式成员', desc: '代码管够，饭也管饱' },
  { min: 10, title: '麦门干饭人', desc: '正在从入门到长胖' },
  { min: 3, title: '麦门学徒', desc: '刚入门，但已经在长胖' },
  { min: 0, title: '麦门见习', desc: 'Hello, 麦门' },
];

/** 大数字压缩显示：147672 → "14.8 万" */
export function compact(n) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)} 亿`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(1)} 万`;
  return v.toLocaleString('zh-CN');
}

/** 金额压缩显示：2781037.5 → "¥278.1 万" */
export function compactMoney(n) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1e8) return `¥${(v / 1e8).toFixed(1)} 亿`;
  if (Math.abs(v) >= 1e4) return `¥${(v / 1e4).toFixed(1)} 万`;
  return `¥${v.toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

function rankOf(burgers) {
  return RANKS.find((r) => burgers >= r.min) ?? RANKS[RANKS.length - 1];
}

/** 趣味点评（确定性选取，同输入同输出） */
function pickFunLines(data, report) {
  const lines = [];
  if (data.commits >= 500) lines.push('commit 管饱：你的提交记录够开一家麦当劳');
  if (data.totalStars >= 100) lines.push(`你收获的 ${data.totalStars} 个 Star，够换一车麦乐鸡`);
  if (data.accountYears >= 8) lines.push(`码龄 ${data.accountYears.toFixed(1)} 年，胃和代码一样稳`);
  if (data.topRepo && data.topRepo.stars >= 50) {
    lines.push(`代表作 ${data.topRepo.name}（${data.topRepo.stars} Star）是你最硬的一口堡`);
  }
  if (data.prsMerged >= 20) lines.push(`${data.prsMerged} 个 PR 被合并，薯条自由达成`);
  if (data.followers >= 100) lines.push(`${data.followers} 个粉丝，苹果片吃到腻`);
  if (!lines.length) lines.push('代码生涯刚开张，巨无霸正在下单中');
  return lines.slice(0, 3);
}

/**
 * 生成报告
 * @param {object} ghData  normalize() 的输出
 * @param {object} menu    MCP 实时或快照菜单数据（见 src/menu-data.js）
 */
export function computeReport(ghData, menu) {
  const foods = FOOD_MAP.map((f) => {
    const count = Number(ghData[f.key] ?? 0);
    const item = menu.items[f.menuKey] ?? { name: f.name, price: 0, kcal: 0 };
    return {
      ...f,
      count,
      unitPrice: Number(item.price ?? 0),
      kcal: Number(item.kcal ?? 0),
      total: count * Number(item.price ?? 0),
    };
  });

  const bill = foods.reduce((sum, f) => sum + f.total, 0);
  const bigMac = menu.items.bigMac ?? { price: 0, kcal: 530 };
  const effectivePrice = Number(menu.bigMacCouponPrice ?? bigMac.price ?? 0) || Number(bigMac.price ?? 0);
  const burgerEquivalent = effectivePrice > 0 ? bill / effectivePrice : 0;
  const kcal = foods.reduce((sum, f) => sum + f.count * f.kcal, 0);
  // 60kg 成年人慢跑约 8 kcal/分钟 → 480 kcal/小时
  const runHours = kcal / 480;

  const rank = rankOf(burgerEquivalent);

  return {
    user: {
      login: ghData.login,
      name: ghData.name,
      avatarUrl: ghData.avatarUrl,
      location: ghData.location,
      bio: ghData.bio,
      topLanguage: ghData.topLanguage,
      accountYears: ghData.accountYears,
    },
    rank,
    burgerEquivalent,
    foods,
    bill,
    billWithCoupon: effectivePrice > 0 && menu.bigMacCouponPrice ? bill * 0.9 : bill,
    effectivePrice,
    kcal,
    runHours,
    funLines: pickFunLines(ghData, { bill, burgerEquivalent }),
    campaignLine: menu.campaigns?.[0]?.title ?? null,
    source: menu.source,
    generatedAt: menu.generatedAt ?? new Date().toISOString(),
  };
}

/** 终端文本报告 */
export function renderText(report) {
  const u = report.user;
  const lines = [
    `🍔 CodeMac · 代码汉堡报告`,
    `──────────────────────────────`,
    `${u.name}（@${u.login}）  ${u.location || '地球'}`,
    `主力语言：${u.topLanguage}｜码龄：${u.accountYears.toFixed(1)} 年`,
    `段位：${report.rank.title} —— ${report.rank.desc}`,
    ``,
    `你的代码值 ${compact(report.burgerEquivalent)} 个巨无霸`,
    ``,
  ];
  for (const f of report.foods) {
    lines.push(
      `  ${f.emoji} ${f.name} × ${compact(f.count).padStart(8)} ≈ ${compactMoney(f.total).padStart(12)}`,
    );
  }
  lines.push(
    `──────────────────────────────`,
    `餐饮账单：${compactMoney(report.bill)}`,
    `热量核算：约 ${compact(Math.round(report.kcal))} 千卡 ≈ 慢跑 ${compact(report.runHours.toFixed(1))} 小时`,
  );
  if (report.campaignLine) lines.push(`本周活动：${report.campaignLine}`);
  lines.push(
    ``,
    `* commit/PR/Issue/Review 按最近 300 个公开事件统计，Star/粉丝为累计值；`,
    `* 价格为麦当劳 MCP（mcp.mcd.cn）${report.source === 'live' ? '实时' : '快照'}数据，纯娱乐换算，不构成营养建议。`,
  );
  return lines.join('\n');
}
