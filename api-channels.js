/**
 * api-channels.js — [v3.96 缝合] 副 API 通道表
 *
 * 【来源】缝合 Melody-0321/NE-Memory v8.1 的任务解耦副 API 架构：
 *   ne_secondary_api / ne_embedding_api / ne_stm_api / ne_ltm_api / ne_state_api
 *   五个独立通道——不同任务（提取/摘要/嵌入/精选/状态）路由到各自配置的模型端点，
 *   避免所有任务挤占主回复模型，也允许给小任务配便宜模型、给重任务配强模型。
 *
 * 【工程化重写】（非照抄，只取机制）：
 *   - 纯函数：解析通道配置 + 任务路由决策，不直接发请求；实际调用仍走调用方
 *     注入的 llm.callAPI（已有独立API+宿主 generateQuietPrompt 双通道降级链）。
 *   - 通道表：task → { endpoint, apiKey, model, enabled }，缺省回落主通道。
 *   - 降级：副通道未配置/未启用/失败 → 自动回落主通道（与 llm.callAPI 现有降级链兼容）。
 *   - 可测：resolveChannel 是纯函数，route() 接受注入的 callFn。
 *
 * 挂 window.LonShaApiChannels，双导出。
 */
(function() {

// 任务类型枚举（对齐 NE 五通道职责，按记忆插件实际任务重映射）
const TASKS = Object.freeze({
  EXTRACT:   'extract',    // 剧情提取（主任务，默认走主通道）
  SUMMARIZE: 'summarize',  // 滚动摘要 / STM-LTM 巩固
  EMBED:     'embed',      // 向量化
  SELECT:    'select',     // 前置 AI 精选（ai-select）
  RERANK:    'rerank',     // 精排
  REWRITE:   'rewrite',    // 查询重写
  STATE:     'state'       // 状态抽取 / CSE
});

// 通道配置键（存 config.secondaryApis = { [task]: {endpoint,apiKey,model,enabled} }）
const CHANNEL_KEYS = Object.values(TASKS);

// ── 配置归一 ─────────────────────────────────────────────────────────
/**
 * @param {object} cfg 原始 secondaryApis 配置
 * @returns {object} { [task]: {endpoint,apiKey,model,enabled} }
 */
function normalizeChannels(cfg) {
  const src = (cfg && typeof cfg === 'object') ? cfg : {};
  const out = {};
  for (const t of CHANNEL_KEYS) {
    const c = src[t];
    if (c && typeof c === 'object') {
      out[t] = {
        endpoint: String(c.endpoint || '').trim(),
        apiKey: String(c.apiKey || '').trim(),
        model: String(c.model || '').trim(),
        enabled: c.enabled !== false && !!String(c.endpoint || c.model || '').trim()
      };
    } else {
      out[t] = { endpoint: '', apiKey: '', model: '', enabled: false };
    }
  }
  return out;
}

// ── 通道解析：返回某任务应走的通道（副通道优先，未配回落主通道）───────
/**
 * @param {object} channels normalizeChannels 结果
 * @param {string} task TASKS 之一
 * @returns {{ task, useSecondary:bool, channel:object|null }}
 *   channel 为 null 表示走主通道。
 */
function resolveChannel(channels, task) {
  const table = (channels && typeof channels === 'object') ? channels : {};
  const c = table[task];
  if (c && c.enabled && (c.endpoint || c.model)) {
    return { task, useSecondary: true, channel: c };
  }
  return { task, useSecondary: false, channel: null };
}

// ── 任务路由：注入 callFn，按通道表分发，失败回落主通道 ──────────────
/**
 * @param {object} opts {
 *   task: TASKS 之一,
 *   prompt: string,
 *   channels: normalizeChannels 结果,
 *   callMain: async (prompt)=>string,            // 主通道（llm.callAPI）
 *   callSecondary?: async (prompt, channel)=>string  // 副通道（可选，缺省直接走主）
 * }
 * @returns {Promise<{ text:string, source:'secondary'|'main'|'main-fallback', task:string }>}
 */
async function route(opts = {}) {
  const { task, prompt, channels, callMain, callSecondary } = opts;
  if (typeof callMain !== 'function') {
    return { text: '', source: 'main', task: task || 'unknown', error: 'no callMain' };
  }
  const r = resolveChannel(channels, task);
  // 副通道可用且注入了副通道调用器 → 先试副通道
  if (r.useSecondary && typeof callSecondary === 'function') {
    try {
      const text = String(await callSecondary(prompt, r.channel) || '').trim();
      if (text) return { text, source: 'secondary', task };
    } catch (e) { /* 副通道失败 → 回落主通道 */ }
    // 副通道失败回落
    try {
      const text = String(await callMain(prompt) || '').trim();
      return { text, source: 'main-fallback', task };
    } catch (e2) {
      return { text: '', source: 'main-fallback', task, error: e2?.message };
    }
  }
  // 走主通道
  try {
    const text = String(await callMain(prompt) || '').trim();
    return { text, source: 'main', task };
  } catch (e) {
    return { text: '', source: 'main', task, error: e?.message };
  }
}

const api = { TASKS, CHANNEL_KEYS, normalizeChannels, resolveChannel, route };
if (typeof window !== 'undefined') window.LonShaApiChannels = api;
if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();