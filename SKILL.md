---
name: codemac
title: CodeMac · 代码汉堡报告
summary: 输入 GitHub 用户名，把 commit/Star/PR/Issue/Review/粉丝换算成巨无霸、麦乐鸡、薯条等餐品，并用麦当劳 MCP 实时价格算出「巨无霸等价比」，生成分享卡片。
read_when:
  - 用户想查看自己的 GitHub 代码价值多少巨无霸
  - 用户想生成代码餐饮报告卡片
  - 需要基于麦当劳 MCP 做娱乐向数据换算时
---

# CodeMac · 代码汉堡报告

把一个 GitHub 用户的公开数据，换算成「值多少个巨无霸」的趣味报告，并生成可分享的卡片。

## 能力

1. **抓取 GitHub 公开数据**：用户资料、最近 300 个公开事件（commit / PR / Issue / Review 计数）、公开仓库（累计 Star / 语言分布）；
2. **调用麦当劳 MCP 实时取价**：`query-meals` 定位巨无霸等餐品，`calculate-price` 计算券后参考价，`list-nutrition-foods` 取热量，`campaign-calendar` 取进行中活动；
3. **换算与计价**：commit → 巨无霸、Star → 麦乐鸡、PR → 薯条、Issue → 可乐、Review → 玉米杯、粉丝 → 苹果片；汇总餐饮账单与「巨无霸等价比」；
4. **生成卡片**：输出 SVG 卡片（或文字报告 / JSON）。

## 前置条件

- 已配置麦当劳 MCP（见 `mcp-config.example.json`，Token 从 <https://open.mcd.cn/mcp> 申请）；
- 未配置 MCP 时，使用仓库内置数据快照 `data/mcd-snapshot.json` 完成换算，并在结果中注明「快照数据」。

## 使用方式

直接对智能体说：

- 「帮我看看 @torvalds 的代码值多少个巨无霸」
- 「生成我的 GitHub 代码餐饮报告卡片」

或使用命令行：

```bash
export MCD_TOKEN=<MCP Token>
node src/cli.js <github用户名> --out card.svg
```

## 输出说明

- 报告中 commit/PR/Issue/Review 为**最近 300 个公开事件**统计，Star/粉丝为**累计值**；
- 价格为麦当劳 MCP 实时（或快照）数据，纯娱乐换算，不构成营养建议；
- 输出文件：`card.svg`（分享卡片）、文字报告或 JSON。
