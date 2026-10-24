# workbuddy.md —— WorkBuddy 开发对话上下文

> 本文件记录 CodeMac 项目使用**腾讯 WorkBuddy** 智能体完成从选题、开发、联调到交付的全过程，
> 用于麦当劳程序员创意开发大赛「WorkBuddy 专项奖励」核验。
> 开发时间：2026-10-24（报名截止前 25 小时）。
> 开发环境：WorkBuddy（Windows 11）+ Node.js 22 + 无头 Chrome 验证。

---

## 第一阶段：赛事研究与选题（约 40 分钟）

**用户提示词 1：**

> 腾讯云开发者社区 × 麦当劳：程序员创意开发大赛，奖品包括50次巨无霸免费兑换券和10240积分，截止至10月25日 23:59。---帮我参加这个活动，然后尽可能得奖

**WorkBuddy 执行的研究动作：**

1. 检索赛事官方信息，确认规则全文（`github.com/M-China/mcd-developer-innovation-challenge` 的 `activityGuidelines.md`）：
   - 排名 100% 按 GitHub 公开 Star 数，10-26 00:00 定榜；
   - 前 100 名进榜即得实体周边，提交 `workbuddy.md` 再得 3000 积分；
   - 项目必须真实使用麦当劳 MCP，且包含 README.md / CONTEST_DECLARATION.md / MCP_INTEGRATION.md / mcp-config.example.json 等规定文件；
   - 仓库创建时间须在 2025-12-25 ～ 2026-10-25 之间；同一账号多项目只取最高星。
2. 拉取官方 `RANKING.md`（更新于 2026-10-24 22:00）：榜首 1259 stars，**第 100 名门槛 52 stars**——据此把目标定为「冲进前 100」。
3. 解析麦当劳 MCP 官方文档（`github.com/M-China/mcd-mcp-server`），得到 36 个 Tool 的完整清单（`query-meals`、`query-meal-detail`、`calculate-price`、`campaign-calendar`、`list-nutrition-foods`、`now-time-info` 等）与接入方式（Streamable HTTP + Bearer Token）。
4. 通读榜单 104 个已报名项目的命名，判断赛道拥挤度：省钱/优惠券、营养热量、点餐助手、MBTI/性格卡均已严重同质化。
5. 向用户输出结构化决策问卷（GitHub 凭证方式 / MCP Token 状态 / 创意方向三选一），用户确认：
   - 提供 GitHub PAT 走全自动交付；
   - 自行去 open.mcd.cn 申请 MCP Token；
   - 选择 **CodeMac（代码汉堡报告）** 方向。

**选题结论**：做一个「零配置即时 demo + MCP 实时取价 + 可分享卡片」的 GitHub 数据报告工具，
用「你的代码值多少个巨无霸」作为一句话价值主张，避开已饱和的省钱/营养赛道。

---

## 第二阶段：架构设计与编码（约 2 小时）

**用户提示词 2：**

> （无额外提示，WorkBuddy 按既定方案自主完成全部编码）

**WorkBuddy 的架构决策（均向用户说明理由后落地）：**

| 决策点 | 方案 | 理由 |
|---|---|---|
| 技术栈 | 零依赖 Node.js（ESM，仅内置 fetch） | `npx`/`node` 即开即用，评审克隆后零安装成本 |
| MCP 客户端 | 自研 ~150 行 Streamable HTTP + JSON-RPC 2.0 客户端（`src/mcp.js`） | 官方未提供 SDK；同时兼容 `application/json` 与 `text/event-stream` 响应，协议版本依次协商 |
| 数据源分级 | live（MCP 实时）→ snapshot（预生成快照）→ fallback（内置参考价） | GitHub Pages 静态托管无法持有 Token，三级降级保证演示站任何环境可打开 |
| 卡片渲染 | CLI 输出 SVG + 网页 Canvas 输出 PNG | SVG 矢量可缩放；Canvas 保证社交平台分享清晰度 |
| 数字尺度 | 大数字「万/亿」压缩 + 指标时间窗标注 | 初版出现「14.7 万个巨无霸」失控数字，WorkBuddy 自测发现后增加 `compact()` 并在卡片脚注注明统计口径 |

**WorkBuddy 产出的文件（全部由 WorkBuddy 生成）：**

```
src/mcp.js         MCP 客户端（initialize → notifications/initialized → tools/call）
src/github.js      GitHub 公开 API 抓取与指标归一化（资料/事件流/仓库）
src/menu-data.js   菜单数据解析（实时/快照/兜底三级）
src/report.js      指标→餐品映射、计价、段位评定、趣味点评
src/card.js        SVG 卡片渲染（800×1080）
src/cli.js         命令行入口（report / menu / serve 子命令）
src/server.js      本地演示站 + MCP 代理（Token 仅存服务端）
scripts/snapshot.js 预生成 MCP 数据快照
index.html         在线演示页（Canvas 渲染 + PNG/SVG 下载 + 复制文字报告）
```

**联调与验证（WorkBuddy 自主完成）：**

1. CLI 全链路自测：`node src/cli.js ruanyf` 跑通 GitHub 抓取 → 换算 → 计价 → SVG 输出；
2. 发现并修复 3 个问题：`server.js` 缺少直接运行入口、静态目录指向错误（`docs/` → 仓库根）、
   大数字展示失控（新增 `compact()`/`compactMoney()`）；
3. 用无头 Chrome（CDP 协议）真实打开演示页，输入用户名、点击生成、截图验证：
   卡片布局/头像/徽章/中文渲染/Canvas 导出全部正常（存档 `docs/images/`）。

---

## 第三阶段：交付与报名（用户提供凭证后执行）

**用户提示词 3：**

> （用户提供 GitHub PAT 与 MCP Token，授权全自动交付）

**WorkBuddy 待执行动作：**

1. `scripts/snapshot.js` 真实调用 `mcp.mcd.cn` 生成 `data/mcd-snapshot.json`（原始返回存档 `docs/mcp-raw/`）；
2. 创建公开仓库并推送（注入真实仓库地址到 README / 演示页）；
3. 开启 GitHub Pages（root 目录），验证在线演示可访问；
4. 按官方 Issue 模板提交报名申请（标题与正文间无换行、项目地址不用 Markdown 链接），确认系统回复「报名成功」；
5. 产出各平台推广物料（掘金 / V2EX / linux.do / 知乎 / 腾讯云社区 / 微信群）。

---

## 附：WorkBuddy 在本项目中的实际贡献

- 100% 的代码、文档、参赛文件由 WorkBuddy 生成，人工零行代码；
- 赛事规则解析、榜单数据分析、赛道拥挤度判断由 WorkBuddy 完成；
- 架构决策表（上表）为 WorkBuddy 提出并执行；
- 自测发现的问题（服务器入口、静态目录、数字尺度）由 WorkBuddy 自主定位并修复。
