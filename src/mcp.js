/**
 * src/mcp.js —— 麦当劳中国 MCP（mcp.mcd.cn）最小客户端
 *
 * 协议：Streamable HTTP + JSON-RPC 2.0
 *   - initialize：握手，协商 protocol version
 *   - notifications/initialized：完成握手
 *   - tools/list：列出全部工具
 *   - tools/call：调用指定工具
 *
 * 零第三方依赖，仅使用 Node >= 18 内置 fetch。
 */

const DEFAULT_URL = 'https://mcp.mcd.cn';

/** 依次尝试的 MCP 协议版本（服务端不支持时按错误提示回退） */
const PROTOCOL_VERSIONS = ['2025-03-26', '2024-11-05', '2025-06-18'];

export class McpError extends Error {
  constructor(message, { code, data } = {}) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.data = data;
  }
}

export class McpClient {
  /**
   * @param {object} opts
   * @param {string} [opts.url]   MCP Server 地址
   * @param {string} opts.token   open.mcd.cn 申请的 MCP Token
   * @param {typeof fetch} [opts.fetchImpl] 可注入的 fetch 实现（测试用）
   */
  constructor({ url = DEFAULT_URL, token, fetchImpl = fetch }) {
    if (!token) throw new McpError('缺少 MCP Token：请先到 https://open.mcd.cn/mcp 用手机号登录申请');
    this.url = url;
    this.token = token;
    this.fetchImpl = fetchImpl;
    this.sessionId = null;
    this.protocolVersion = null;
    this._nextId = 1;
    this._ready = null;
  }

  /** 发送一次 JSON-RPC 请求，返回解析后的结果（自动处理 SSE 与纯 JSON 两种响应体） */
  async _rpc(method, params = {}) {
    const id = this._nextId++;
    const body = { jsonrpc: '2.0', id, method, params };
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.protocolVersion) headers['MCP-Protocol-Version'] = this.protocolVersion;
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;

    const res = await this.fetchImpl(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const sid = res.headers.get('mcp-session-id');
    if (sid) this.sessionId = sid;

    const text = await res.text();
    if (!res.ok) {
      throw new McpError(`MCP 请求失败：HTTP ${res.status} ${text.slice(0, 200)}`, { code: res.status });
    }

    const messages = parseMaybeSse(text);
    const matched = messages.find((m) => m.id === id) ?? messages[messages.length - 1];
    if (!matched) throw new McpError(`MCP 响应为空：${text.slice(0, 200)}`);
    if (matched.error) {
      throw new McpError(`MCP 错误 ${matched.error.code}: ${matched.error.message}`, {
        code: matched.error.code,
        data: matched.error.data,
      });
    }
    return matched.result;
  }

  /** 握手（幂等，可重复调用） */
  async initialize() {
    if (!this._ready) {
      this._ready = (async () => {
        let lastErr;
        for (const version of PROTOCOL_VERSIONS) {
          try {
            const result = await this._rpc('initialize', {
              protocolVersion: version,
              capabilities: {},
              clientInfo: { name: 'codemac', version: '1.0.0' },
            });
            this.protocolVersion = result?.protocolVersion ?? version;
            // 完成握手通知（不需要响应）
            await this._notify('notifications/initialized', {});
            return result;
          } catch (err) {
            lastErr = err;
            // 版本不受支持时尝试下一个版本
            if (!/version/i.test(String(err.message))) break;
          }
        }
        throw lastErr ?? new McpError('MCP initialize 失败');
      })();
    }
    return this._ready;
  }

  async _notify(method, params = {}) {
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    };
    if (this.protocolVersion) headers['MCP-Protocol-Version'] = this.protocolVersion;
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    await this.fetchImpl(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', method, params }),
    }).catch(() => {});
  }

  /** 列出 MCP Server 支持的全部工具 */
  async listTools() {
    await this.initialize();
    const result = await this._rpc('tools/list', {});
    return result.tools ?? [];
  }

  /**
   * 调用一个工具
   * @param {string} name  工具名，如 query-meal-detail
   * @param {object} args  工具参数
   * @returns {Promise<{text: string, json: any}>} 工具返回内容（text 为原始文本，json 为从中提取的内嵌 JSON，无则 null）
   */
  async callTool(name, args = {}) {
    await this.initialize();
    const result = await this._rpc('tools/call', { name, arguments: args });
    const content = Array.isArray(result?.content) ? result.content : [];
    const text = content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    const json = extractJson(text);
    if (result?.isError) {
      throw new McpError(`工具 ${name} 返回错误：${text.slice(0, 300)}`, { data: json });
    }
    return { text, json };
  }

  /** 获取当前时间信息（MCP 工具 now-time-info） */
  async nowTimeInfo() {
    const { json } = await this.callTool('now-time-info', {});
    return json;
  }

  /** 查询门店可售餐品列表（MCP 工具 query-meals） */
  async queryMeals(storeCode) {
    const { json } = await this.callTool('query-meals', storeCode ? { storeCode } : {});
    return json;
  }

  /** 查询餐品详情（MCP 工具 query-meal-detail） */
  async queryMealDetail(mealCode) {
    const { json } = await this.callTool('query-meal-detail', { mealCode });
    return json;
  }

  /** 价格试算（MCP 工具 calculate-price） */
  async calculatePrice(items) {
    const { json } = await this.callTool('calculate-price', { items });
    return json;
  }

  /** 活动日历（MCP 工具 campaign-calendar） */
  async campaignCalendar() {
    const { json } = await this.callTool('campaign-calendar', {});
    return json;
  }

  /** 餐品营养信息（MCP 工具 list-nutrition-foods） */
  async listNutritionFoods() {
    const { json } = await this.callTool('list-nutrition-foods', {});
    return json;
  }
}

/**
 * 解析 MCP 响应体：兼容纯 JSON 与 text/event-stream 两种格式。
 * @param {string} text 原始响应文本
 * @returns {any[]} JSON-RPC 消息数组
 */
export function parseMaybeSse(text) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (!trimmed.startsWith('event:') && !trimmed.includes('\ndata:')) {
    try {
      const single = JSON.parse(trimmed);
      return Array.isArray(single) ? single : [single];
    } catch {
      /* 走 SSE 解析 */
    }
  }
  const messages = [];
  for (const line of trimmed.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      messages.push(JSON.parse(payload));
    } catch {
      /* 忽略无法解析的行 */
    }
  }
  return messages;
}

/**
 * 从 MCP 工具返回的文本中提取嵌入的 JSON。
 * 麦当劳 MCP 的文本形如：
 *   "# API Response Information … ## Response Structure … ## Original Response\n{…}"
 * 部分工具（如 campaign-calendar）直接返回 Markdown，无 JSON 载荷时返回 null。
 */
export function extractJson(text) {
  const t = String(text ?? '');
  if (!t) return null;
  // 1) 整段就是 JSON
  try {
    return JSON.parse(t.trim());
  } catch {
    /* 继续 */
  }
  // 2) 「## Original Response」标记之后
  const marker = t.match(/## Original Response\s*\n([\s\S]*)$/);
  if (marker) {
    try {
      return JSON.parse(marker[1].trim());
    } catch {
      /* 继续 */
    }
  }
  // 3) 扫描文本中第一个可解析的平衡花括号片段
  for (let i = 0; i < t.length; i++) {
    if (t[i] !== '{') continue;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let j = i; j < t.length; j++) {
      const c = t[j];
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(t.slice(i, j + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}
