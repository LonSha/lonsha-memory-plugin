#!/usr/bin/env python3
# lonsha v3.2.0 防御包 DF1-DF4（研究收编：baibai槽位生命周期/fetch外部取消 + anima zod clamp + 诊断裁剪）
# 教训执行：锚点验证后落刀，任一失败立即中止；全程不碰未验证区块
import sys

PATH = '/home/user/lonsha-memory-plugin/index.js'
src = open(PATH, encoding='utf-8').read()

def rep(old, new, tag):
    global src
    n = src.count(old)
    if n != 1:
        print(f'FAIL: {tag} (匹配 {n} 次, 需恰好 1 次)'); sys.exit(1)
    src = src.replace(old, new, 1)
    print(f'ok: {tag}')

# ── DF0: 版本号 ──
rep("    const VERSION = '3.1.0';", "    const VERSION = '3.2.0';", 'DF0 版本号')

# ── DF1-a: CHAT_CHANGED 清空槽位（baibai clearInjection 范式：
#    setExtensionPrompt 持久化，切聊天不清则上一聊天的记忆注入泄漏到新聊天）──
rep("""                if (types.CHAT_CHANGED) {
                    eventSource.on(types.CHAT_CHANGED, async () => {
                        try { this.engine._recallCache = null; } catch (e) { errLog(e, 'events.CHAT_CHANGED缓存清理'); }  // [v2.9] RU-D: 换对话，缓存失效""",
    """                if (types.CHAT_CHANGED) {
                    eventSource.on(types.CHAT_CHANGED, async () => {
                        try { this.engine._recallCache = null; } catch (e) { errLog(e, 'events.CHAT_CHANGED缓存清理'); }  // [v2.9] RU-D: 换对话，缓存失效
                        // [v3.2] DF1: 清空注入槽位（setExtensionPrompt 持久化，旧聊天注入会残留到新聊天；GENERATION_STARTED 若仍活跃会立即重新注入）
                        try {
                            const ccc = window.SillyTavern?.getContext?.();
                            if (ccc?.setExtensionPrompt) {
                                ccc.setExtensionPrompt('lonsha_memory', '', 0, false, 4);
                                ccc.setExtensionPrompt('lonsha_memory_history', '', 9999, false, 4);
                            }
                        } catch (e) { errLog(e, 'events.CHAT_CHANGED槽位清空'); }""",
    'DF1-a CHAT_CHANGED槽位清空')

# ── DF1-b: 生成前注入点——停用状态显式清空并跳过 ──
rep("""                    eventSource.on(types.GENERATION_STARTED, async () => {
                        try {
                            const injection = await this.engine.onBeforeGeneration();
                            if (injection) {""",
    """                    eventSource.on(types.GENERATION_STARTED, async () => {
                        try {
                            // [v3.2] DF1: 引擎停用（总开关关，或提取+向量全关）时清空槽位并跳过——持久化槽位不清则旧注入残留
                            const _cfg = this.engine.config.config;
                            if (_cfg.enabled === false || (_cfg.extractionEnabled === false && _cfg.vectorEnabled === false)) {
                                const c0 = window.SillyTavern?.getContext?.();
                                if (c0?.setExtensionPrompt) {
                                    c0.setExtensionPrompt('lonsha_memory', '', 0, false, 4);
                                    c0.setExtensionPrompt('lonsha_memory_history', '', 9999, false, 4);
                                }
                                return;
                            }
                            const injection = await this.engine.onBeforeGeneration();
                            if (injection) {""",
    'DF1-b 生成前停用清空')

# ── DF1-c: interceptor 兼容入口同语义 ──
rep("""    window.lonsha_memory_interceptor = async (chat, ...args) => {
        try {
            const injection = await plugin.engine.onBeforeGeneration();""",
    """    window.lonsha_memory_interceptor = async (chat, ...args) => {
        try {
            // [v3.2] DF1: 停用时不注入（与 GENERATION_STARTED 主路径同语义）
            const _cfgI = plugin.engine.config.config;
            if (_cfgI.enabled === false || (_cfgI.extractionEnabled === false && _cfgI.vectorEnabled === false)) return chat;
            const injection = await plugin.engine.onBeforeGeneration();""",
    'DF1-c interceptor停用语义')

# ── DF2: fetch 外部取消语义（baibai 认知#27：
#    ① 新增 opts.externalSignal 转发；② 外部中止绝不重试；③ AbortError 从无脑重试白名单移除）──
rep("""    async function fetchWithTimeoutRetry(url, init, opts) {
        const { timeoutSec = 30, retries = 2, label = 'API' } = opts || {};
        const maxAttempts = Math.max(1, 1 + Math.max(0, retries));
        let lastErr = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const ctrl = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, Math.max(1000, timeoutSec * 1000));
            try {
                const resp = await fetch(url, { ...init, signal: ctrl.signal });
                clearTimeout(timer);
                if ((resp.status >= 500 || resp.status === 429) && attempt < maxAttempts - 1) {
                    lastErr = new Error(`${label} API ${resp.status}`);
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }
                return resp;
            } catch (err) {
                clearTimeout(timer);
                if ((timedOut || err?.name === 'TypeError' || err?.name === 'AbortError') && attempt < maxAttempts - 1) {
                    lastErr = err;
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }
                throw (lastErr || err);
            }
        }
        throw (lastErr || new Error(`${label} 重试耗尽`));
    }""",
    """    async function fetchWithTimeoutRetry(url, init, opts) {
        const { timeoutSec = 30, retries = 2, label = 'API', externalSignal = null } = opts || {};
        const maxAttempts = Math.max(1, 1 + Math.max(0, retries));
        let lastErr = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // [v3.2] DF2: 外部已取消（用户中止生成）→ 立即抛出，绝不重试
            if (externalSignal?.aborted) throw new Error(`${label} 已取消(外部中止)`);
            const ctrl = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, Math.max(1000, timeoutSec * 1000));
            if (externalSignal) {
                try { externalSignal.addEventListener('abort', () => { if (!timedOut) ctrl.abort(); }, { once: true }); } catch (e) {}
            }
            try {
                const resp = await fetch(url, { ...init, signal: ctrl.signal });
                clearTimeout(timer);
                if ((resp.status >= 500 || resp.status === 429) && attempt < maxAttempts - 1) {
                    lastErr = new Error(`${label} API ${resp.status}`);
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }
                return resp;
            } catch (err) {
                clearTimeout(timer);
                // [v3.2] DF2: 取消来源区分——外部中止(AbortError 且非内部超时)绝不重试；内部超时/网络异常照旧重试
                if (!timedOut && err?.name === 'AbortError' && externalSignal?.aborted) throw new Error(`${label} 已取消(外部中止)`);
                if ((timedOut || err?.name === 'TypeError') && attempt < maxAttempts - 1) {
                    lastErr = err;
                    await new Promise(r => setTimeout(r, 800));
                    continue;
                }
                throw (lastErr || err);
            }
        }
        throw (lastErr || new Error(`${label} 重试耗尽`));
    }""",
    'DF2 fetch外部取消语义')

# ── DF3: 物品 op 清洗 + 派生视图硬上限（anima zod 纪律：
#    action 白名单 + 字段宽度 clamp；真源 itemOps 不动，旧档脏数据兼容，回滚语义不变）──
rep("""        rebuildItems() {
            const map = new Map();
            for (const op of (this.itemOps || [])) {
                const exist = map.get(op.name);""",
    """        // [v3.2] DF3: 物品 op 清洗（LLM 原文直存 ops，desc/holder 无长度上限会撑爆注入与存档）
        _sanitizeItemOp(op) {
            try {
                if (!op || typeof op !== 'object') return null;
                const action = op.action === 'add' ? 'add' : (op.action === 'update' ? 'update' : '');
                const name = String(op.name || '').normalize('NFKC').replace(/\\s+/g, ' ').trim().slice(0, 40);
                if (!action || !name) return null;
                const clean = { action, name, floor: Math.max(0, Math.round(Number(op.floor) || 0)) };
                const desc = String(op.desc || '').trim();
                const holder = String(op.holder || '').trim();
                const state = String(op.state || '').trim();
                if (desc) clean.desc = desc.slice(0, 80);
                if (holder) clean.holder = holder.slice(0, 20);
                if (state) clean.state = state.slice(0, 10);
                return clean;
            } catch (e) { errLog(e, 'DF3.sanitizeItemOp'); return null; }
        }
        rebuildItems() {
            const map = new Map();
            for (const rawOp of (this.itemOps || [])) {
                const op = this._sanitizeItemOp(rawOp);   // [v3.2] DF3: 渲染前清洗（真源不动，旧档兼容）
                if (!op) continue;
                const exist = map.get(op.name);""",
    'DF3 op清洗接入')

rep("""            this.items.records = Array.from(map.values()).slice(-25);
        }
        // 物品回滚（真源过滤+重放）""",
    """            // [v3.2] DF3: 派生视图硬上限（真源 itemOps 不裁剪，回滚语义不受影响）
            this.items.records = Array.from(map.values()).slice(-25);
        }
        // 物品回滚（真源过滤+重放）""",
    'DF3 视图上限注释')

# ── DF4: 诊断面板错误日志裁剪（环形缓冲50条全量塞面板噪音大，只展示最近15条）──
rep("            const report = { time: new Date().toLocaleString(), version: VERSION, stats: [], errors: [..._errBuf], pipeline: null, schema: null };",
    "            const report = { time: new Date().toLocaleString(), version: VERSION, stats: [], errors: _errBuf.slice(-15), pipeline: null, schema: null };   // [v3.2] DF4: 面板只展示最近15条",
    'DF4 诊断错误裁剪')

open(PATH, 'w', encoding='utf-8').write(src)
print(f'\\n全部通过。写入 {PATH}')
