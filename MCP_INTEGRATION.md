# MCP 集成说明（MCP_INTEGRATION.md）

CodeMac 的全部餐品价格、活动与时间数据均来自**麦当劳中国官方 MCP Server**，本文档说明实际使用的 Server、Tool、调用流程与业务价值。

## 1. MCP Server

| 项 | 值 |
|---|---|
| Server 地址 | `https://mcp.mcd.cn` |
| 传输协议 | Streamable HTTP |
| 认证方式 | 请求头 `Authorization: Bearer <MCD_TOKEN>` |
| Token 申请 | <https://open.mcd.cn/mcp>（手机号登录 → 控制台 → 激活） |
| 官方文档 | <https://github.com/M-China/mcd-mcp-server> |
| 限流 | 每 Token 600 次/分钟 |

CodeMac 内置了一个零依赖的最小 MCP 客户端（`src/mcp.js`），实现了 JSON-RPC 2.0 over Streamable HTTP 的完整握手与调用：

```
initialize → notifications/initialized → tools/call
```

客户端同时兼容 `application/json` 与 `text/event-stream` 两种响应体，并按 `MCP-Protocol-Version` 协商协议版本（依次尝试 `2025-03-26` / `2024-11-05` / `2025-06-18`）。

## 2. 实际使用的 Tool

| Tool | 用途 | 在 CodeMac 中的角色 |
|---|---|---|
| `now-time-info` | 获取当前完整时间信息 | 报告时间戳；判断活动日历的季节区间 |
| `query-meals` | 查询当前可售卖餐品列表 | 在菜单中定位巨无霸、麦乐鸡、薯条、可乐、玉米杯、苹果片 |
| `query-meal-detail` | 查询餐品详情与套餐组成 | 核对目标餐品的规格与价格 |
| `calculate-price` | 商品价格计算（含优惠券） | 对「巨无霸单品」试算，得到**券后参考价**，作为「巨无霸等价比」的分母 |
| `list-nutrition-foods` | 餐品营养信息列表 | 获取巨无霸等餐品的热量，用于「热量核算」趣味换算 |
| `campaign-calendar` | 当月营销活动日历 | 提取进行中的活动，作为报告中的「本周活动」文案 |
| `query-my-account` | 我的积分查询（需会员身份） | 可选增强：将账户积分折算为可兑换的巨无霸数量 |
| `available-coupons` / `query-my-coupons` | 麦麦省券列表 / 我的优惠券 | 可选增强：用可领券优化券后价估算 |

## 3. 调用流程

```
┌─────────────┐   GitHub 公开 API    ┌──────────────┐
│  用户输入    │ ───────────────────▶ │  指标归一化   │  commit/Star/PR/Issue/Review/粉丝
│ GitHub 用户名│                      │  (src/github)│
└─────────────┘                      └──────┬───────┘
                                           │
┌─────────────┐   JSON-RPC / SSE      ┌────▼───────┐
│ mcp.mcd.cn  │ ◀─────────────────── │  MCP 客户端 │  initialize → tools/call
│ 麦当劳 MCP   │ ───────────────────▶ │ (src/mcp)   │  菜单价格 / 券后价 / 热量 / 活动
└─────────────┘                      └────┬───────┘
                                           │
                                     ┌─────▼──────┐
                                     │ 报告计算    │  src/report.js
                                     │ 卡片渲染    │  src/card.js（SVG）/ index.html（Canvas PNG）
                                     └────────────┘
```

详细时序：

1. `initialize`：与 `https://mcp.mcd.cn` 握手，记录 `mcp-session-id` 与协议版本；
2. `now-time-info`：取得 MCP 侧当前时间，作为报告生成时间；
3. `query-meals`：拉取可售餐品列表，按名称关键词匹配六种目标餐品；
4. `list-nutrition-foods`：拉取营养数据，提取各餐品热量；
5. `calculate-price`：对「巨无霸 × 1」试算，得到券后参考价；
6. `campaign-calendar`：拉取当月活动，筛出进行中的活动文案；
7. 汇总为菜单数据对象（`source: "live"`），交给 `computeReport()` 完成换算与计价。

## 4. 数据来源分级

为保证演示站（GitHub Pages，纯静态）在任何时候都能打开即用，CodeMac 采用三级数据源：

| 级别 | 来源 | 说明 |
|---|---|---|
| `live` | 用户/服务端提供的 MCD_TOKEN 实时调用 | CLI 与本地演示站默认优先使用 |
| `snapshot` | `data/mcd-snapshot.json`（由 `scripts/snapshot.js` 预生成） | 静态演示页默认使用；快照由真实 MCP 调用生成，原始返回存档于 `docs/mcp-raw/` |
| `fallback` | 代码内置参考价 | 仅在前两者都不可用时兜底，页面会明确标注「未连接 MCP」 |

## 5. 业务价值

- **让 MCP 数据第一次以「个人叙事」的形式出现**：现有参赛作品大多把 MCP 用在点餐、省钱、营养查询上，CodeMac 把 MCP 的实时价格能力包装成开发者之间的社交货币——一张可以晒的「代码餐饮报告」卡片；
- **零门槛传播 MCP 生态**：演示站不需要麦当劳账号、不需要 Token，普通开发者 10 秒就能体验「MCP 实时取价」的结果，降低麦当劳 MCP 的认知门槛；
- **可复用的最小 MCP 客户端**：`src/mcp.js` 是一个约 150 行、零依赖的 Streamable HTTP MCP 客户端，其他开发者可以直接抄走接入自己的项目。

## 6. 安全与合规

- MCP Token 只从环境变量 `MCD_TOKEN` 读取，仓库内不存在任何真实 Token；
- 演示站静态模式不代理任何用户数据；本地代理模式（`src/server.js`）的 Token 仅保存在服务端，不下发浏览器；
- 只读取 GitHub 公开数据，不存储、不转发任何用户信息。
