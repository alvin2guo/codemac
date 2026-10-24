/**
 * src/card.js —— 生成可分享的 SVG 报告卡片（CLI 输出 / OG 图复用）
 */

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString('zh-CN');
}

/** 大数字压缩：147672 → "14.8 万" */
function compact(n) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1e8) return `${(v / 1e8).toFixed(1)} 亿`;
  if (Math.abs(v) >= 1e4) return `${(v / 1e4).toFixed(1)} 万`;
  return v.toLocaleString('zh-CN');
}

/** 金额压缩：2781037.5 → "¥278.1 万" */
function compactMoney(n) {
  const v = Number(n ?? 0);
  if (Math.abs(v) >= 1e8) return `¥${(v / 1e8).toFixed(1)} 亿`;
  if (Math.abs(v) >= 1e4) return `¥${(v / 1e4).toFixed(1)} 万`;
  return `¥${v.toFixed(0)}`;
}

const FONT = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

/**
 * 渲染报告卡片 SVG
 * @param {object} report computeReport() 的输出
 * @returns {string} SVG 源码
 */
export function renderCardSvg(report) {
  const { user, rank, foods, bill, burgerEquivalent, kcal, runHours, funLines, source, generatedAt } = report;
  const dateStr = new Date(generatedAt).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

  const foodRows = foods
    .map((f, i) => {
      const y = 556 + i * 56;
      return `
    <g>
      <text x="72" y="${y}" font-size="30">${f.emoji}</text>
      <text x="118" y="${y}" font-size="24" fill="#2B2B2B" font-weight="600">${esc(f.name)}</text>
      <text x="300" y="${y}" font-size="22" fill="#8A8A8A">× ${compact(f.count)}</text>
      <text x="728" y="${y}" font-size="24" fill="#2B2B2B" text-anchor="end">${compactMoney(f.total)}</text>
    </g>`;
    })
    .join('');

  const funText = funLines.slice(0, 2).map((l) => esc(l)).join('　·　');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1080" viewBox="0 0 800 1080" font-family="${FONT}">
  <defs>
    <clipPath id="avatarClip"><circle cx="128" cy="196" r="46"/></clipPath>
  </defs>
  <rect width="800" height="1080" fill="#FFF9EC"/>

  <!-- 顶部品牌带 -->
  <rect width="800" height="128" fill="#DA291C"/>
  <text x="56" y="60" font-size="40" font-weight="800" fill="#FFFFFF" letter-spacing="2">CODEMAC</text>
  <text x="56" y="98" font-size="22" fill="#FFD9A8">代码汉堡报告 · Code-as-a-Burger</text>
  <text x="744" y="60" font-size="22" fill="#FFFFFF" text-anchor="end">${esc(dateStr)}</text>
  <text x="744" y="98" font-size="18" fill="#FFD9A8" text-anchor="end">${source === 'live' ? 'MCP 实时取价' : 'MCP 数据快照'}</text>

  <!-- 用户信息 -->
  <image href="${esc(user.avatarUrl)}" x="82" y="150" width="92" height="92" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>
  <circle cx="128" cy="196" r="46" fill="none" stroke="#FFC72C" stroke-width="4"/>
  <text x="200" y="182" font-size="34" font-weight="800" fill="#1F1F1F">${esc(user.name)}</text>
  <text x="200" y="218" font-size="22" fill="#8A8A8A">@${esc(user.login)}${user.location ? ' · ' + esc(user.location) : ''}</text>
  <text x="200" y="250" font-size="18" fill="#B8860B">${esc(user.topLanguage)} · 码龄 ${user.accountYears.toFixed(1)} 年</text>

  <!-- 段位徽章 -->
  <g>
    <rect x="560" y="168" width="184" height="56" rx="28" fill="#FFC72C"/>
    <text x="652" y="204" font-size="26" font-weight="800" fill="#3A2A00" text-anchor="middle">${esc(rank.title)}</text>
  </g>

  <!-- 核心数字 -->
  <text x="400" y="368" font-size="26" fill="#8A8A8A" text-anchor="middle">你的 GitHub 代码生涯，价值</text>
  <text x="400" y="452" font-size="96" font-weight="900" fill="#DA291C" text-anchor="middle">${compact(burgerEquivalent)}</text>
  <text x="400" y="496" font-size="30" font-weight="700" fill="#DA291C" text-anchor="middle">个巨无霸（按 MCP 券后价折算）</text>

  <!-- 餐品明细 -->
  <text x="72" y="524" font-size="22" font-weight="700" fill="#1F1F1F">代码餐饮明细</text>
  ${foodRows}

  <!-- 账单 -->
  <rect x="56" y="916" width="688" height="76" rx="16" fill="#FFFFFF" stroke="#F0E3C8"/>
  <text x="88" y="950" font-size="24" font-weight="700" fill="#1F1F1F">餐饮账单</text>
  <text x="88" y="980" font-size="18" fill="#8A8A8A">巨无霸券后单价 ¥${report.effectivePrice.toFixed(2)}</text>
  <text x="712" y="962" font-size="40" font-weight="900" fill="#DA291C" text-anchor="end">${compactMoney(bill)}</text>

  <!-- 趣味点评 -->
  <text x="400" y="1024" font-size="20" fill="#6B5B3E" text-anchor="middle">${funText}</text>
  <text x="400" y="1050" font-size="17" fill="#A99B7F" text-anchor="middle">热量核算 ${compact(Math.round(kcal))} 千卡 ≈ 慢跑 ${compact(runHours.toFixed(1))} 小时（娱乐换算）</text>
  <text x="400" y="1074" font-size="14" fill="#C0B595" text-anchor="middle">GitHub 公开数据（近期 300 事件 + 累计）× 麦当劳 MCP（mcp.mcd.cn） · 纯娱乐 · CodeMac 参赛作品</text>
</svg>`;
}
