(function (global) {
    'use strict';
/*
 * memory-organs.js — 记忆器官类集（计划 A1 宿主巨兽第五刀）
 *
 * 【为什么需要这一面 / 修前实测】
 *   第一刀 memory-ledgers.js 剥叶子账本；第二刀 memory-aux.js 剥工具类；第三刀
 *   narrative-generators.js 剥生成侧派生系统；第四刀 memory-books.js 剥书册与时间。
 *   本刀剥的是**器官级**六个类——它们不是叶子：彼此有真依赖边（见下）、依赖主人函数符号、
 *   少数几处还要读宿主全局，是宿主里最大的六个「活体器官」：
 *     · LLMCaller            16 方法 / 357 行 —— 模型取数、查询重写、精排、原生工具回合
 *     · VectorStore          13 方法 / 220 行 —— 向量库、双 hash、热度续命、缓存统计
 *     · CharacterMemoryBank  15 方法 / 102 行 —— 角色记忆银行（核心/近期两层 + 衰减 GC）
 *     · WorldProgress        26 方法 / 507 行 —— 世界推进（承诺/伏笔/知识表 + 不在场推演）
 *     · EntityLexicon         8 方法 /  78 行 —— 术语词典（surface 沉淀 + 查询端归一）
 *     · StorageManager        4 方法 / 209 行 —— 存档写盘（合流 / 乐观锁 / 落盘证据）
 *   合计 1473 行。六个类的公开面（方法名 / 返回形状 / 字段名 / 中文提示字面量）
 *   与抽取前**逐字一致**；唯一形式变化是类外符号的来源（见「依赖收口」）。
 *
 * 【依赖收口：本刀与前四刀最大的不同】
 *   前四刀剥走的类对主人模块级符号**零依赖**（诊断记账改走构造注入 errLog）。本刀六个类
 *   对主人符号有**真依赖**，因此带两层收口：
 *     ① **逐字副本**：hash32 / numOr / sanitizeJson / fetchWithTimeoutRetry / decayScore /
 *        _initEbbingMeta / _moduleLib 七个函数，与 PLUGIN_NAME / VERSION /
 *        ARCHIVE_TOP_LEVEL_KEYS / ARCHIVE_TOP_LEVEL_KEY_SET / STORAGE_FP_FIELDS 五个常量，
 *        各有一份与宿主逐字一致的副本，声明为模块级 `let`（函数）与 `const`（常量）；
 *        errLog 是唯一**非逐字**的一份（见该行上方留痕）。
 *        为什么必须有副本：宿主与历史套件把类抠进 new Function 单独重放（v3147 拼
 *        `new Function('fetch','AbortController','setTimeout','clearTimeout','PLUGIN_NAME',
 *        'localStorage', ...)`；v3168 / v320 抽 getEmbedding / fetchWithTimeoutRetry 同形）。
 *        类内若继续引用宿主自由标识符，那些抽取面**全部当场 ReferenceError**。
 *     ② **活口**：bindDeps(deps) 让宿主在引擎构造期把 errLog / numOr / decayScore /
 *        _initEbbingMeta / fetchWithTimeoutRetry / sanitizeJson / moduleLib / version
 *        换成宿主**现算**的那一份（热更新时也重建，不留旧闭包）；没注过则副本就是真实现。
 *   ★ 唯一真源仍是宿主：副本只服务「宿主不在场」这一种情形。宿主改了，副本必须同步；
 *     对账判据住 tests/v3264_a1_memory_organs.test.mjs（第八节）。
 *
 * 【为什么不把六个类拆成六个模块（PLAN 要求给出理由）】
 *   六类之间有真依赖边：LLMCaller._dispatchMemoryTool 经 window.LonShaMemory.engine
 *   读 bm25 / summary / vector（运行时跨模块读引擎，既有形态）；VectorStore 与
 *   CharacterMemoryBank 共享 decayScore 的续命语义（同一衰减轴两处消费）；StorageManager
 *   的写盘指纹读 STORAGE_FP_FIELDS，与 VectorStore 的 payloadHash 同源。拆成六份要付出
 *   六份前言/边界段 + 六条 manifest 登记 + 六处取库口，而共享的依赖面（七个副本 + 五个
 *   常量）会变成六份或一条新注入链。故同刀搬：一条登记、一个取库口、一个统一构造点。
 *
 * 【本模块不做什么（边界）】
 *   · 不新增第二实现：六个类体逐字搬，不重写任何行为；
 *   · 不持有宿主状态：类只读自己的字段；宿主上下文（SillyTavern 元数据 / engine / 模块库）
 *     只经可选链或 _moduleLib 取；
 *   · 不静默丢诊断：错误一律经 errLog（bindDeps 可换成宿主那份）记下，调用点原有的
 *     console/errLog 形态逐字保留。
 *
 * 【口径纪律】
 *   ① 方法在字段缺失 / 环境不可用时返回空值（0 / false / [] / null / ''），**绝不抛**；
 *      构造签名一字不改（`new Xxx()` 的既有调用点行为不变）；
 *   ② 模块缺席时宿主退到 OrganFallback（常量空实现），如实回报「没有」；
 *   ③ 出口面只给六个类 + bindDeps + PLUGIN_NAME + VERSION，**不做二次导出**——
 *      副本是内部实现细节，暴露出去就会长出第二个真源。
 */
    /* ── 一、逐字副本：宿主函数符号（模块级 let 活口，bindDeps 可覆盖） ── */
    /* ① errLog：宿主那份含 43 条错误提示矩阵（_ERROR_HINTS），逐字副本会把整张矩阵拖进模块；
     *   故这里给的是**同契约的最小实现**（不抛、不递归），而宿主在构造期**必注入**自己的 errLog
     *   （见宿主 index.js 的 bindDeps 调用）—— 唯一真源仍是宿主，这里只保证「宿主不在场」时不炸。 */
let errLog = function (err, tag) {
    try {
        const msg = String(err && err.message || err || '');
        const ints = (typeof console !== 'undefined' && globalThis && globalThis.__lonshaOrganErrLog && globalThis.__lonshaOrganErrLog.ints);
        if (ints) { try { ints.push({ t: Date.now(), tag: String(tag || ''), msg: msg }); if (ints.length > 50) ints.shift(); } catch (_) {} }
        if (typeof console !== 'undefined' && console.warn) console.warn('[LonShaMemoryOrgans][' + String(tag || '') + ']', msg);
    } catch (_) { /* 记录器自身不得再抛 */ }
};
let hash32 = function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(16).padStart(8, '0');
    };
let numOr = function numOr(v, fallback) {
        // [v3.224.0] O-2：`typeof v === 'object'` 一并回退。修前只挡布尔/空串/null/undefined，
        //   而 `Number([]) === 0`、`Number([5]) === 5` —— 宿主删楼事件把 `messageId` 传成数组时，
        //   本函数会把「没给」读成第 0 楼（而 0 是合法楼层，两者处置相反）。
        if (v === undefined || v === null || v === '' || typeof v === 'boolean' || typeof v === 'object') return fallback;
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    };
let sanitizeJson = function sanitizeJson(raw) {
        try {
            if (!raw) return '';
            let s = String(raw).trim();
            if (!s) return '';

            // 1. 全角引号与全角标点归一化
            s = s.replace(/[\u201c\u201d\u201e\u300c\u300d]/g, '"')
                 .replace(/[\u2018\u2019]/g, "'")
                 .replace(/\uff0c/g, ',')
                 .replace(/\uff1a/g, ':')
                 .replace(/\uff1b/g, ';');
            // 单引号键值向双引号转换（保护 don't, it's 等字母间缩写）
            s = s.replace(/([a-zA-Z])'([a-zA-Z])/g, '$1__APOSTROPHE__$2')
                 .replace(/'/g, '"')
                 .replace(/__APOSTROPHE__/g, "'");

            // 2. 剥离外层闲聊废话与 Markdown 围栏
            const firstObj = s.indexOf('{');
            const firstArr = s.indexOf('[');
            let startIdx = -1;
            let isArray = false;
            if (firstObj !== -1 && firstArr !== -1) {
                if (firstObj < firstArr) { startIdx = firstObj; isArray = false; }
                else { startIdx = firstArr; isArray = true; }
            } else if (firstObj !== -1) {
                startIdx = firstObj; isArray = false;
            } else if (firstArr !== -1) {
                startIdx = firstArr; isArray = true;
            }

            if (startIdx === -1) {
                return s.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
            }

            const endToken = isArray ? ']' : '}';
            const endIdx = s.lastIndexOf(endToken);
            if (endIdx > startIdx) {
                s = s.slice(startIdx, endIdx + 1);
            } else {
                s = s.slice(startIdx);
            }

            // 3. 字符流状态机：修复未转义双引号与字符串内部裸引号
            let out = '';
            let inString = false;
            let escaped = false;
            for (let i = 0; i < s.length; i++) {
                const ch = s[i];
                if (escaped) {
                    out += ch;
                    escaped = false;
                    continue;
                }
                if (ch === '\\') {
                    out += ch;
                    escaped = true;
                    continue;
                }
                if (ch === '"') {
                    if (!inString) {
                        inString = true;
                        out += ch;
                    } else {
                        // 前瞻下一个非空白字符
                        let nextNonSpace = '';
                        for (let j = i + 1; j < s.length; j++) {
                            const nc = s[j];
                            if (nc !== ' ' && nc !== '\t' && nc !== '\r' && nc !== '\n') {
                                nextNonSpace = nc;
                                break;
                            }
                        }
                        if (!nextNonSpace || nextNonSpace === ',' || nextNonSpace === ':' || nextNonSpace === '}' || nextNonSpace === ']') {
                            inString = false;
                            out += ch;
                        } else {
                            out += '\\"';
                        }
                    }
                } else {
                    out += ch;
                }
            }

            // 4. 清除对象/数组尾部多余的逗号（悬挂逗号：, } 或 , ]）
            out = out.replace(/,\s*([}\]])/g, '$1');

            // 5. 修复未加引号的纯英文字母对象键（如 { name: "value" } -> { "name": "value" }）
            out = out.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

            return out.trim();
        } catch (e) {
            return String(raw || '').trim();
        }
    };
let fetchWithTimeoutRetry = async function fetchWithTimeoutRetry(url, init, opts) {
        // [v3.260.0 缝合 shujuku] opts.fetchImpl：传输实现注入口（取数面）。
        //   不传 = 直呼全局 fetch（与 v3.259.0 逐字一致，既有判据用 new Function('fetch', ...)
        //   把 mock 作为函数参数注入，本改动不破坏该抽取面）；传了 = 走注入实现
        //   （pristine-fetch.js 的原生绕包装取数，见 LLMCaller._fetchOpts）。
        const { timeoutSec = 30, retries = 2, label = 'API', externalSignal = null, cooldownSec = 1800, fetchImpl = null } = opts || {};
        const credKey = typeof _getCredKey === 'function' ? _getCredKey(url, init, opts) : null;
        if (credKey && _credCooldowns.has(credKey)) {
            const until = _credCooldowns.get(credKey);
            if (Date.now() < until) {
                const rem = Math.ceil((until - Date.now()) / 1000);
                throw new Error(`${label} 凭据在 401/403 冷却中 (剩余 ${rem}s)`);
            } else {
                _credCooldowns.delete(credKey);
            }
        }
        const maxAttempts = Math.max(1, 1 + Math.max(0, retries));
        let lastErr = null;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            // [v3.2] DF2: 外部已取消（用户中止生成）→ 立即抛出，绝不重试
            if (externalSignal?.aborted) throw new Error(`${label} 已取消(外部中止)`);
            const ctrl = new AbortController();
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, Math.max(1000, timeoutSec * 1000));
            if (externalSignal) {
                try { externalSignal.addEventListener('abort', () => { if (!timedOut) ctrl.abort(); }, { once: true }); } catch (e) { errLog(e, 'nonfatal') }
            }
            try {
                const resp = await (fetchImpl || fetch)(url, { ...init, signal: ctrl.signal });
                clearTimeout(timer);
                if (resp.status === 401 || resp.status === 403) {
                    if (credKey) {
                        _credCooldowns.set(credKey, Date.now() + cooldownSec * 1000);
                        console.warn(`[${PLUGIN_NAME}] 捕获 ${label} API ${resp.status} 鉴权/权限错误，已对该凭据启动 ${cooldownSec}s 冷却防护`);
                    }
                }
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
    };
let decayScore = function decayScore(m, conf) {
        if (!m) return 0;
        const lambda = conf?.lambda || 0.03;
        const now = Date.now();
        const lastActive = m.lastActive ? (typeof m.lastActive === 'number' ? m.lastActive : new Date(m.lastActive).getTime()) : (m.ts || now);
        const days = (now - lastActive) / 86400000;
        const hours = (now - lastActive) / 3600000;
        const importance = (m.importance !== undefined && m.importance !== null) ? m.importance : (m._isCore ? 1 : 0.5);   // [v3.20] 修复 ?? 与 ?: 优先级
        const activation = m.activationCount || 1;
        const strength = m.memoryStrength ?? (m._isCore ? 0.8 : 0.4);
        const freshHalfLife = conf?.freshHalfLife || 48;
        const reinforcement = 1 + Math.min((m.reinforcementCount || 0) * 0.15, 1.5);
        const arousal = m.emotion?.arousal ?? 0.5;
        const emotionWeight = 1 + arousal * 0.8;
        const combined = days <= (conf?.shortTermDays || 7)
            ? Math.exp(-0.1 * days) * 0.7 + emotionWeight * 0.3
            : emotionWeight * 0.7 + Math.exp(-0.1 * days) * 0.3;
        const freshness = 1 + Math.exp(-hours / freshHalfLife);
        let score = Math.max(importance, 1) * Math.pow(activation, 0.3) * Math.exp(-lambda * Math.max(days, 0)) * combined * freshness * (0.5 + strength * 0.5) * reinforcement;
        if (m.resolved) score *= 0.05;
        if (m.pinned) score = 999;
        return score;
    };
let _initEbbingMeta = function _initEbbingMeta(m) {
        if (!m.ts) m.ts = Date.now();
        if (m.lastActive === undefined) m.lastActive = m.ts;
        if (m.activationCount === undefined) m.activationCount = 1;
        if (m.importance === undefined) m.importance = 3;   // 1-5 默认3
        if (m.memoryStrength === undefined) m.memoryStrength = 0.5;
        if (m.reinforcementCount === undefined) m.reinforcementCount = 0;
        if (m.emotion === undefined) m.emotion = { valence: 0.5, arousal: 0.5 };
        return m;
    };
let _moduleLib = function _moduleLib(getGlobal, fileName) {
        try {
            const viaGlobal = (typeof getGlobal === 'function') ? getGlobal() : null;
            if (viaGlobal) return viaGlobal;
        } catch (e) { /* 读全局失败按未取到处理，继续回落 */ }
        if (typeof require !== 'undefined') {
            try { return require('./' + fileName); } catch (e) {
                // [v3.209.0] 缺席归因（修前实测的静默吞错）：
                //   此处原为 `catch (e) { return null; }` —— 于是「无此文件」「文件在但语法错」
                //   「全局名写错」三种根因**完全同形**，调用方一律降级为兜底实现，诊断面只能报
                //   「模块未加载」，排查必须手工 require 一遍才知道是哪种。
                //   现在把错误收进登记表（不抛、不改调用方契约：仍返回 null），由诊断面点名根因。
                //   为什么不在取库口抛：取库是热路径且各调用点自有降级逻辑，抛会把降级变成崩溃；
                //   归因的责任交给 module-registry，取库口只负责**不丢证据**。
                //   ★ 登记调用自身必须**判可达 + 自兜**（本版自伤留痕）：首版直接写
                //   `_noteModuleFailure(fileName, e);`，结果在「登记者不可达」的环境里
                //   （v3173·C1 把本函数抽出来用 new Function 单独重放）抛 ReferenceError——
                //   **降级当场变成崩溃**，恰好违反本条注释上一句的纪律，被该套件当场抓住。
                //   「登记的失败不得成为新的失败」：故外层判函数存在、内层 try 兜住。
                try { if (typeof _noteModuleFailure === 'function') _noteModuleFailure(fileName, e); } catch (_) { /* 登记本身失败就作罢：不记、也不抛——取库口的契约是「失败返回 null」，登记是附带的 */ }
                return null;
            }
        }
        return null;
    };

    /* ── 二、逐字副本：宿主常量与冷却族 ── */
const PLUGIN_NAME = 'LonSha记忆引擎';
let VERSION = '3.293.0';
const ARCHIVE_TOP_LEVEL_KEYS = Object.freeze([
'version',
'clock',
'graph',
'charMem',
'worldProg',
'summaries',
'diaries',
'reflection',
'itemOps',
'vectors',
'povs',
'timeline',
'status',
'ledger',
'suspense',
'moneyLedger',
'cards',
'conflicts',
'scene',
'echo',
'prequel',
'supersede',
'narrativeEntropy',
'stmLtm',
'recallArtifacts',
'diaryInjectFloor',
'timelineInjectFloor',
'deltaBook',
'cse',
'pulse',
'opLog',
'outline',
'pairMem',
'lockedFacts',
'recallSourceStats',
'lexicon',
'factVersions',      // [v3.194] 时间与事实版本
'eventThreads',      // [v3.194] 事件完整性
'repairLog',         // [v3.194] 修复闭环
'timelineCursorChatId',
'timelineCursorFingerprint',
'timeWentBack',
'lastSave',
'packedAt',
'schemaVersion',
'producerVersion',
'extensions',
]);
const ARCHIVE_TOP_LEVEL_KEY_SET = new Set(ARCHIVE_TOP_LEVEL_KEYS);
const STORAGE_FP_FIELDS = ['graph', 'summaries', 'characters', 'items', 'status', 'timeline'];
const _credCooldowns = new Map();
function _getCredKey(url, init, opts) {
        const key = opts?.apiKey || (init?.headers?.Authorization || init?.headers?.authorization || '').replace(/^Bearer\s+/i, '');
        return key ? hash32(String(url || '') + '|' + String(key)) : (url ? hash32(String(url)) : null);
    }
function clearApiCooldowns() {
        _credCooldowns.clear();
    }
function getApiCooldownStats() {
        const now = Date.now();
        const active = [];
        for (const [k, until] of _credCooldowns.entries()) {
            if (until > now) active.push({ key: k, remainingSec: Math.ceil((until - now) / 1000) });
        }
        return { totalCount: _credCooldowns.size, activeCount: active.length, active };
    }
fetchWithTimeoutRetry.clearCooldowns = clearApiCooldowns;
fetchWithTimeoutRetry.getCooldownStats = getApiCooldownStats;

    /* ── 三、六个器官类（类体与宿主逐字一致，仅整体去 4 空格缩进） ── */
class LLMCaller {
    constructor(config) { this.config = config; this._lastEventChain = null; this._nativeToolLedger = null; } // [v3.260.0] _nativeToolLedger：原生工具回合读数台账（selfCheck「原生工具回合」一栏的数据源）
    // [v3.108] 事件链库（缝合 bionic memory-contract 的 agent 事件迁移表）：双通道加载 + 降级
    _eventChainLib() {
        try {
            return (typeof window !== 'undefined' ? window.LonShaEventChain : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./event-chain.js'); } catch { return null; } })() : null);
        } catch (e) { return null; }
    }
    // [v3.260.0 缝合 shujuku] 原生函数调用协议库（工具定义 / 响应累积 / 消息锚定）。
    //   双通道取库 + 降级，口径同 _eventChainLib：拿不到就退回文本协议老路径。
    _nativeToolsLib() {
        try {
            return (typeof window !== 'undefined' ? window.LonShaNativeTools : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./native-tools.js'); } catch { return null; } })() : null);
        } catch (e) { return null; }
    }
    // [v3.260.0 缝合 shujuku] 绕包装取数库（宿主第三方脚本会 patch 全局 fetch）。
    _pristineFetchLib() {
        try {
            return (typeof window !== 'undefined' ? window.LonShaPristineFetch : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./pristine-fetch.js'); } catch { return null; } })() : null);
        } catch (e) { return null; }
    }
    /**
     * [v3.260.0 缝合 shujuku] 传输选项：pristineFetchEnabled 打开且模块在场时，
     * 把原生取数实现交给 fetchWithTimeoutRetry（绕开宿主对 fetch 的包装）；
     * 否则返回 {} —— 传下去等价于 v3.259.0 的直呼全局 fetch。
     * 本选项只改「取数」这一层，不改请求体、不改响应解析、不改调用方语义。
     */
    _fetchOpts() {
        try {
            if (this.config.config.pristineFetchEnabled !== true) return {};
            const pf = this._pristineFetchLib();
            if (!pf || typeof pf.pristineFetch !== 'function') return {};
            return { fetchImpl: (url, init) => pf.pristineFetch(url, init) };
        } catch (e) { return {}; }
    }
    /**
     * [v3.108] callAPI 外层审计包装（默认关）：为每次 LLM 调用维护一条事件链
     *   run_started → model_requested → assistant_message | run_failed
     * 校验用的是缝合自 bionic 的迁移不变量——非法迁移不会中断主链路（只记警告），
     * 但能在「请求已失败却又返回了内容」「重试后事件顺序错乱」这类真实故障上留下证据。
     * 关闭时（默认）直接走 _callAPIInner，行为与本版本之前完全一致。
     */
    async callAPI(prompt) {
        if (this.config.config.llmEventChainEnabled !== true) return this._callAPIInner(prompt);
        const EC = this._eventChainLib();
        if (!EC) return this._callAPIInner(prompt);
        let chain = [];
        chain = EC.append(chain, { type: EC.EVENT_TYPES.RUN_STARTED, source: 'callAPI' }).chain;
        chain = EC.append(chain, { type: EC.EVENT_TYPES.MODEL_REQUESTED }).chain;
        try {
            const out = await this._callAPIInner(prompt);
            const next = out
                ? { type: EC.EVENT_TYPES.ASSISTANT_MESSAGE, chars: String(out).length }
                : { type: EC.EVENT_TYPES.RUN_FAILED, reason: 'no-response' };
            const r = EC.append(chain, next);
            this._lastEventChain = r.chain;
            if (!r.ok && this.config.config.debugMode) {
                console.warn(`[${PLUGIN_NAME}] ⚠️ LLM 事件链违规: ${r.reason}（期望后续事件: ${(r.expected || []).join('/') || '无'}）`);
            }
            return out;
        } catch (e) {
            const r = EC.append(chain, { type: EC.EVENT_TYPES.RUN_FAILED, reason: String((e && e.message) || e) });
            this._lastEventChain = r.chain;
            throw e;
        }
    }
    /** [v3.108] 最近一次 LLM 调用的事件链（诊断用；未启用时返回 null） */
    getLastEventChain() { return this._lastEventChain ? this._lastEventChain.slice() : null; }
    async _callAPIInner(prompt) {
        try {
            const cfg = this.config.config;
            // [v1.4] 优先：独立 API（设置面板配置）
            if (cfg.apiProviderCustom && cfg.apiUrl && cfg.apiKey) {
                const result = await this.callOpenAI(prompt, cfg.apiUrl, cfg.apiKey, cfg.apiModel);
                if (result) return result;
                console.warn(`[${PLUGIN_NAME}] 独立API调用失败，降级到宿主接口`);
            }
            // [v1.4.1 关键修复] generateQuietPrompt 只在 getContext() 上，不在 window！
            const ctx = window.SillyTavern?.getContext?.();
            const quiet = ctx?.generateQuietPrompt;
            if (typeof quiet === 'function') {
                const result = await quiet({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false });
                if (result) return result;
                // 兼容旧签名（位置参数）
                return await quiet(prompt, false, false);
            }
            console.warn(`[${PLUGIN_NAME}] 宿主无 generateQuietPrompt，请在设置中配置独立API`);
            return null;
        } catch (err) {
            console.error(`[${PLUGIN_NAME}] API调用失败:`, err);
            return null;
        }
    }
    // [v2.4] RE: 查询重写（抄 baibai rewriteQuery——把最近剧情改写成检索意图，失败返回 null 降级）
    async rewriteQuery(recentText, ctxSnapshot = '') {
        try {
            if (!this.config.config.queryRewrite) return null;
            const cfg = this.config.config;
            // [v3.77] C: 上下文增强（抄 baibai rewrite 上下文构造——状态快照注入，让改写查询指向滚出窗口的实体）
            const snapLine = ctxSnapshot ? `\n[当前状态快照（供指代消解，查询可引用其中人名/地点/物件）]\n${String(ctxSnapshot).substring(0, 400)}\n` : '';
            // [v3.148] INTENT 意图升级（baibai rewrite-query）：首行 INTENT 一句话意图（兼作 rerank query），随后 ≤6 条检索 Q（各 ≤220 字符）
            const prompt = `把下面的剧情进展改写成检索历史记忆的查询。第一行以 INTENT: 开头，用一句话概括当前剧情意图（如"主角寻找寄存武器的方法"）；随后每行一条独立检索查询（只写关键人名/地点/物件/事件词，去掉口语与修饰），最多 6 条。只输出这些行，不要解释。${snapLine}\n${String(recentText || '').substring(0, 600)}`;
            let raw = null;
            if (cfg.apiProviderCustom && cfg.apiUrl && cfg.apiKey) {
                raw = await this.callOpenAI(prompt, cfg.apiUrl, cfg.apiKey, cfg.apiModel);
            } else {
                const ctx = window.SillyTavern?.getContext?.();
                const quiet = ctx?.generateQuietPrompt;
                if (typeof quiet !== 'function') return null;
                raw = await quiet({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false });
                if (!raw) raw = await quiet(prompt, false, false);
            }
            if (!raw) return null;
                            // [v3.148] INTENT 解析：INTENT 行单独摘出存 _lastIntent（供 rerank/诊断），其余行 ≤220 字符、≤6 条（baibai 口径）
            const allLines = String(raw).split('\n').map(s => s.trim()).filter(Boolean);
            let _intent = null;
            const lines = [];
            for (const ln of allLines) {
                const im = ln.match(/^INTENT[:：]\s*(.+)$/i);
                if (im) { _intent = im[1].trim().slice(0, 220); continue; }
                const clean = ln.replace(/^[-•\d.、\s]+/, '').trim();
                if (clean.length >= 2 && clean.length <= 220) lines.push(clean);
            }
            this._lastIntent = _intent;
            const out = lines.length ? lines.slice(0, 6) : null;
            return out;
        } catch (e) { return null; }
    }
    /** [v3.148] 最近一次查询重写的 INTENT（供 rerank 精排与诊断；无则为 null） */
    getLastIntent() { return this._lastIntent || null; }
    // [v2.3] RD: rerank 精排——小模型把候选按与查询的相关度重排。失败返回 null (调用方静默降级)
    async rerank(query, docs) {
        try {
            const cfg = this.config.config;
            const url = cfg.rerankApiUrl || cfg.apiUrl;
            const key = cfg.rerankApiKey || cfg.apiKey;
            const model = cfg.rerankModel || cfg.apiModel;
            if (!cfg.rerankEnabled || !url || !key) return null;
            // [v3.148] 分批评分（shujuku rerank 分批纪律）：300 条/批逐批复用本方法，防超大候选池撑爆上下文
        const _BATCH = 300;
        if (docs.length > _BATCH) {
            const orderParts = [];
            for (let bi = 0; bi < docs.length; bi += _BATCH) {
                const sub = docs.slice(bi, bi + _BATCH);
                const subOrder = await this.rerank(query, sub);
                if (Array.isArray(subOrder)) for (const si of subOrder) if (sub[si]) orderParts.push(bi + si);
            }
            return orderParts.length ? orderParts : null;
        }
        const list = docs.map((d, i) => `[${i + 1}] ${(d.text || d.summary || d.name || '').substring(0, 150)}`).join('\n');
            // [v3.50] 评分式精排：每条 0-10 分（无关 0 分），比排序式更稳——单条失败不影响全局，且可按阈值过滤
            const prompt = `你是检索评分器。给定【查询】和编号候选列表，为每条候选打相关度分（0-10 整数：0=完全无关，1-3=弱相关，4-6=有用，7-8=高度相关，9-10=直接回答查询）。只输出JSON对象（如 {"1":8,"3":4,"7":0}），键为候选编号字符串、值为分数，无关候选可省略（视为0分）。不要解释。
【查询】${String(query || '').substring(0, 300)}
【候选】\n${list}`;
            let raw = null;
            if (cfg.apiProviderCustom && url && key) {
                raw = await this.callOpenAI(prompt, url, key, model);
            } else {
                const ctx = window.SillyTavern?.getContext?.();
                const quiet = ctx?.generateQuietPrompt;
                if (typeof quiet !== 'function') return null;
                raw = await quiet({ quietPrompt: prompt, quietToLoud: false, skipWIAN: false });
                if (!raw) raw = await quiet(prompt, false, false);
            }
            if (!raw) return null;
            const rawStr = String(raw);
            // [v3.50] 优先解析评分对象 {"1":8,...}；兼容旧排序数组 ["3","1"]
            const objM = rawStr.match(/\{[\s\S]*?\}/);
            if (objM) {
                try {
                    const scores = JSON.parse(sanitizeJson(objM[0]));
                    if (scores && typeof scores === 'object') {
                        const scored = docs.map((d, i) => ({ d, i, s: Number(scores[String(i + 1)]) || 0 }))
                            .filter(x => x.s > 0)
                            .sort((a, b) => b.s - a.s);
                        if (scored.length) {
                            // 把分数写回 item（供下游 RRF/预算裁剪参考），返回排序索引
                            for (const x of scored) if (docs[x.i]) docs[x.i]._rerankScore = x.s;
                            return scored.map(x => x.i);
                        }
                    }
                } catch (e) { /* 落入旧格式解析 */ }
            }
            const m = rawStr.match(/\[[\s\S]*?\]/);
            if (!m) return null;
            const order = JSON.parse(sanitizeJson(m[0]));
            if (!Array.isArray(order) || !order.length) return null;
            return order.map(x => Number(x) - 1).filter(i => i >= 0 && i < docs.length);
        } catch (e) { return null; }
    }
    // [v1.4.1] 抓取模型列表（OpenAI 兼容 /models 端点）
    async fetchModels(url, key) {
        let base = url.replace(/\/+$/, '');
        if (base.includes('/chat/completions')) base = base.replace(/\/chat\/completions$/, '');
        const endpoint = base.endsWith('/v1') ? `${base}/models` : `${base}/v1/models`;
        const res = await fetchWithTimeoutRetry(endpoint, { headers: { 'Authorization': `Bearer ${key}` } }, { timeoutSec: 15, retries: 1, label: '模型列表' });
        if (!res.ok) throw new Error(`模型列表 ${res.status}`);
        const data = await res.json();
        return (data.data || data.models || []).map(m => m.id || m.name).filter(Boolean).sort();
    }
    /**
     * [v3.260.0 缝合 shujuku] callOpenAI 分派：原生函数调用路径优先，未开启/失败时逐字节回落旧路径。
     *   旧路径（_callOpenAILegacy）保留 v3.259.0 行为，是本版的门禁兜底面。
     */
    async callOpenAI(prompt, url, key, model) {
        if (this.config.config.nativeToolExtractEnabled === true) {
            const NT = this._nativeToolsLib();
            if (NT && typeof NT.readChatTurn === 'function' && typeof NT.toolMessagesFromCalls === 'function') {
                try {
                    const out = await this._callOpenAINative(prompt, url, key, model, NT);
                    if (out !== null) return out;
                } catch (e) {
                    // 原生回合任何异常都不外抛：记一条非致命日志后回落旧路径（语义与关闭该开关一致）
                    errLog(e, 'nativeToolRound');
                }
            }
        }
        return this._callOpenAILegacy(prompt, url, key, model);
    }
    // [v3.260.0] 旧路径：与 v3.259.0 逐字一致（含 v3.102 响应形状归一化与截断告警）
    async _callOpenAILegacy(prompt, url, key, model) {
        // 端点归一化：兼容 base(https://x.com/v1) 和完整端点两种填法
        let endpoint = url.replace(/\/+$/, '');
        if (!endpoint.includes('/chat/completions')) {
            endpoint = endpoint.endsWith('/v1') ? endpoint + '/chat/completions' : endpoint + '/v1/chat/completions';
        }
        // [v3.1] SF1: 超时+分类重试（5xx/429/超时重试，4xx不重试）
        const res = await fetchWithTimeoutRetry(endpoint, {
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`},
            body: JSON.stringify({model: model || 'gpt-4o-mini', messages: [{role: 'user', content: prompt}], temperature: 0.3, max_tokens: 1000})
        }, this._fetchOpts());
        if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
        const data = await res.json();
        // [v3.102] 缝合 bionic-memory model-protocol：响应形状归一化。
        // 部分网关把 message.content 返回为分片数组（[{text}] / [{content}]），
        // 旧写法 `content || ''` 会静默拿到 ''；同时 finish_reason=length
        // 说明输出被 max_tokens 截断，需显式告警（下游走宽松 JSON 恢复）。
        const msg = data?.choices?.[0]?.message || {};
        const rawResp = {
            content: msg.content,
            tool_calls: msg.tool_calls,
            finish_reason: data?.choices?.[0]?.finish_reason,
            usage: data?.usage,
        };
        const mr = (typeof window !== 'undefined' && window.LonShaModelResponse)
            || (typeof require !== 'undefined' ? (() => { try { return require('./model-response.js'); } catch { return null; } })() : null);
        if (mr) {
            try {
                const norm = mr.normalizeModelResponse(rawResp);
                if (mr.wasTruncated(norm)) {
                    console.warn(`[${PLUGIN_NAME}] LLM 输出被 max_tokens 截断（finish_reason=${norm.finishReason}），下游将走宽松解析`);
                }
                return norm.content || '';
            } catch (e) { /* 归一化异常时退回兼容写法 */ }
        }
        const legacyContent = msg.content;
        return typeof legacyContent === 'string' ? legacyContent : '';
    }
    /**
     * [v3.260.0 缝合 shujuku] 原生工具回合：请求带 tools，回包按协议累积（JSON 与 SSE 同一读取器）；
     *   模型真发起调用时执行并回灌，最多 _nativeToolMaxRounds() 轮，取最后一轮正文。
     *   无工具调用时正常返回正文；连一次回合都没读到则返回 null（交旧路径）。
     */
    async _callOpenAINative(prompt, url, key, model, NT) {
        let endpoint = url.replace(/\/+$/, '');
        if (!endpoint.includes('/chat/completions')) {
            endpoint = endpoint.endsWith('/v1') ? endpoint + '/chat/completions' : endpoint + '/v1/chat/completions';
        }
        const fetchOpts = this._fetchOpts();
        let messages = [{ role: 'user', content: prompt }];
        let round = 0;
        let lastContent = '';
        let sawTurn = false;
        for (;;) {
            const res = await fetchWithTimeoutRetry(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
                body: JSON.stringify({
                    model: model || 'gpt-4o-mini',
                    messages,
                    temperature: 0.3,
                    max_tokens: 1000,
                    tools: NT.MEMORY_TOOL_DEFINITIONS,
                    tool_choice: 'auto',
                }),
            }, Object.assign({ label: '原生工具' }, fetchOpts));
            if (!res.ok) throw new Error(`API ${res.status}: ${await res.text().catch(() => '')}`);
            const turn = (await NT.readChatTurn(res, false)).turn;
            sawTurn = true;
            if (typeof turn.content === 'string' && turn.content) lastContent = turn.content;
            if (!turn.toolCalls.length) break;
            if (round >= this._nativeToolMaxRounds()) break;
            round += 1;
            const results = await this._dispatchMemoryTools(NT, turn.toolCalls);
            messages = NT.withThinkPrefill(messages.concat(NT.toolMessagesFromCalls(turn.content, turn.toolCalls, results)));
        }
        this._nativeToolLedger = Object.assign({}, this._nativeToolLedger, { rounds: round, at: Date.now() });
        return sawTurn ? lastContent : null;
    }
    // [v3.260.0] 工具回合轮数上限（防模型无限调用；默认 3 轮够「检索→精读→作答」）
    _nativeToolMaxRounds() {
        const n = Number(this.config.config.nativeToolMaxRounds);
        return Number.isFinite(n) && n >= 1 ? Math.min(5, Math.floor(n)) : 3;
    }
    /**
     * [v3.260.0] 三工具分发：search_memory → BM25 分支检索 / write_memory → 显式摘要 /
     *   vector_search → 向量库语义检索。每个工具都有真实消费点（模块接线零容忍面）。
     *   参数校验失败或单个工具抛错只影响该条回执（错误文本回灌给模型自纠），不中断回合。
     */
    async _dispatchMemoryTools(NT, calls) {
        let parsed;
        try {
            parsed = NT.toolArguments(calls);
        } catch (e) {
            const note = '参数无效: ' + String((e && e.message) || e);
            return calls.map(() => note);
        }
        const results = [];
        for (const item of parsed) {
            try {
                results.push(await this._dispatchMemoryTool(item.call.name, item.payload || {}));
            } catch (e) {
                results.push('工具执行失败: ' + String((e && e.message) || e));
            }
        }
        return results;
    }
    async _dispatchMemoryTool(name, payload) {
        const eng = (typeof window !== 'undefined' && window.LonShaMemory && window.LonShaMemory.engine) || null;
        const topK = Math.max(1, Math.min(20, Number(payload.topK) || 5));
        const brief = (item) => String((item && (item.text || item.summary || item.name)) || '').slice(0, 200);
        if (name === 'search_memory') {
            if (!eng || !eng.bm25) return '记忆库未就绪：无法检索';
            const hits = eng.bm25.search(String(payload.query || ''), topK, { cliffCut: true });
            this._nativeToolLedger = { tool: name, hits: Array.isArray(hits) ? hits.length : 0, at: Date.now() };
            if (!hits || !hits.length) return '无命中';
            return hits.map((h, i) => `[${i + 1}] ${brief(h)}`).join('\n');
        }
        if (name === 'write_memory') {
            if (!eng || !eng.summary) return '记忆库未就绪：无法写入';
            const saved = eng.summary.addManualSummary(Number(payload.floor), String(payload.text || ''), String(payload.storyTime || ''));
            this._nativeToolLedger = { tool: name, saved: !!saved, at: Date.now() };
            return saved ? `已写入第 ${saved.floor} 楼摘要` : '未写入（同楼层已有摘要或参数无效）';
        }
        if (name === 'vector_search') {
            if (!eng || !eng.vector) return '向量库未就绪：无法检索';
            const hits = await eng.vector.search(String(payload.query || ''), topK);
            this._nativeToolLedger = { tool: name, hits: Array.isArray(hits) ? hits.length : 0, at: Date.now() };
            if (!hits || !hits.length) return '无命中（向量库为空或未启用）';
            return hits.map((h, i) => `[${i + 1}] ${brief(h)}`).join('\n');
        }
        return '未知工具: ' + String(name);
    }
}

class VectorStore {
    constructor(config) {
        this.config = config;
        this.vectors = [];
        this.dimension = 1536;
        this.embedCache = new Map(); // [v3.147] 向量层双 hash 分层对账 cache
    }
    
    // [v3.147] 双 hash 计算（docHash: 文本内容 hash; payloadHash: 状态/元数据 hash）
    _calcHashes(text, metadata) {
        const str = String(text ?? '');
        const docHash = 'doc_' + hash32(str);
        const payloadHash = 'pay_' + hash32(JSON.stringify(metadata || {}));
        return { docHash, payloadHash };
    }
    
    async getEmbedding(text) {
        // [v3.168] 嵌入降级账本：本方法有四条降级路径（无密钥 / API 报错 / 返回体缺 embedding / 异常），
        //   四条都退回 simpleEmbedding（按字符码位的伪向量，与真嵌入的语义空间毫不相干）。
        //   旧实现只 console.warn 一行，而诊断面板看不到任何东西：用户侧表现为
        //   「向量召回效果奇差」却完全不知道向量层早已整层降级——四条路径合计零计数。
        this._embedDegrade = this._embedDegrade || { noKey: 0, apiError: 0, missingVector: 0, exception: 0 };
        try {
            const str = String(text ?? '');
            const docHash = 'doc_' + hash32(str);
            if (this.embedCache.has(docHash)) {
                return this.embedCache.get(docHash);
            }
            // [v1.4] 独立 Embedding 配置优先，Key 可回退到提取 Key
            const cfg = this.config.config;
            const api_key = cfg.embeddingKey || cfg.apiKey || localStorage.getItem('api_key_openai') || '';
            const api_base = (cfg.embeddingUrl || 'https://api.openai.com').replace(/\/+$/, '');
            
            if (!api_key) {
                console.warn(`[${PLUGIN_NAME}] 无Embedding密钥，使用简化向量（可在设置中配置）`);
                this._embedDegrade.noKey++;
                const vec = this.simpleEmbedding(str);
                this.embedCache.set(docHash, vec);
                return vec;
            }
            
            const url = api_base.endsWith('/v1') ? `${api_base}/embeddings` : `${api_base}/v1/embeddings`;
            const res = await fetchWithTimeoutRetry(url, {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'Authorization': `Bearer ${api_key}`},
                body: JSON.stringify({model: this.config.config.embeddingModel, input: str})
            }, { label: 'Embedding', apiKey: api_key });
            
            const data = await res.json();
            if (data.error) {
                console.warn(`[${PLUGIN_NAME}] Embedding API错误，降级`, data.error);
                this._embedDegrade.apiError++;
                const vec = this.simpleEmbedding(str);
                this.embedCache.set(docHash, vec);
                return vec;
            }
            
            if (!data.data?.[0]?.embedding) this._embedDegrade.missingVector++;
            const vec = data.data?.[0]?.embedding || this.simpleEmbedding(str);
            this.embedCache.set(docHash, vec);
            return vec;
        } catch (err) {
            console.warn(`[${PLUGIN_NAME}] Embedding失败，降级:`, err);
            if (this._embedDegrade) this._embedDegrade.exception++;
            const str = String(text ?? '');
            const docHash = 'doc_' + hash32(str);
            const vec = this.simpleEmbedding(str);
            this.embedCache.set(docHash, vec);
            return vec;
        }
    }
    
    simpleEmbedding(text) {
        const vec = new Array(this.dimension).fill(0);
        for (let i = 0; i < text.length && i < this.dimension; i++) {
            vec[i % this.dimension] += text.charCodeAt(i) / 10000;
        }
        const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
        return vec.map(v => v / (norm || 1));
    }
    
    async addVector(text, metadata) {
        const { docHash, payloadHash } = this._calcHashes(text, metadata);
        const embedding = await this.getEmbedding(text);
        const id = `vec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const metaWithHashes = {
            ...(metadata || {}),
            docHash,
            payloadHash,
            importance: metadata?.importance || 5
        };
        this.vectors.push({
            id,
            text,
            embedding,
            metadata: metaWithHashes,
            docHash,
            payloadHash,
            timestamp: Date.now(),
            accessCount: 0,
            importance: metaWithHashes.importance
        });
        return id;
    }

    // [v3.95] 智能分块向量化（缝合 vectors-enhanced）：长文本按语义边界切块+重叠，逐块向量化。
    // 短文本/未开启时等价 addVector。返回主 id（首块 id），块间用 metadata.chunkGroup 串联。
    async addVectorAuto(text, metadata, cfg = {}) {
        try {
            const t = String(text ?? '');
            const enabled = cfg.vectorChunkEnabled && (typeof window !== 'undefined' ? window.LonShaTextChunk : (typeof require !== 'undefined' ? (() => { try { return require('./text-chunk.js'); } catch { return null; } })() : null));
            const threshold = Number(cfg.vectorChunkThreshold) || 1200;
            if (!enabled || t.length <= threshold) {
                return await this.addVector(t, metadata);
            }
            const TC = enabled;
            const chunks = TC.chunkText(t, Number(cfg.vectorChunkSize) || 800, numOr(cfg.vectorChunkOverlap, 10));   // [v3.156] overlap=0 合法
            if (!chunks.length || chunks.length === 1) return await this.addVector(t, metadata);
            const group = `cg_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
            let firstId = null;
            for (let i = 0; i < chunks.length; i++) {
                const id = await this.addVector(chunks[i], {
                    ...(metadata || {}),
                    chunkGroup: group,
                    chunkIndex: i,
                    chunkTotal: chunks.length,
                    isChunk: true
                });
                if (i === 0) firstId = id;
            }
            return firstId;
        } catch (e) { errLog(e, 'VectorStore.addVectorAuto'); return await this.addVector(text, metadata); }
    }
    
    cosineSimilarity(vecA, vecB) {
        if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
        let dot = 0, normA = 0, normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dot += vecA[i] * vecB[i];
            normA += vecA[i] * vecA[i];
            normB += vecB[i] * vecB[i];
        }
        return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
    }
    
    // [v2.7] RS: 按楼层删除向量（rollbackFloor 联动，幂等）
    removeByFloor(floor) {
        const before = this.vectors.length;
        this.vectors = this.vectors.filter(v => v.metadata?.floor !== floor);
        return before - this.vectors.length;
    }

    async search(query, topK = 5) {
        if (this.vectors.length === 0) return [];
        const queryVec = await this.getEmbedding(query);
        const scored = this.vectors.map(v => ({
            ...v,
            score: this.cosineSimilarity(queryVec, v.embedding)
        }));
        scored.sort((a, b) => b.score - a.score);
        // [v3.1] SF3: 召回命中计数（遗忘价值公式的 accessFreq 输入）
        // [v3.31] 切分加热：被想起→激活次数+1 + lastActive 刷新（接 decayScore 的续命轴，打通 accessCount 与 activationCount 双字段）
        for (const v of scored.slice(0, topK)) {
            const src = this.vectors.find(x => x.id === v.id);
            if (src) this._heatEntry(src);
        }
        return scored.slice(0, topK);
    }
    // [v3.31] 单条记忆加热（kiwi-mem 记忆热度「被想起即升温」）：
    // 召回命中 → activationCount++（decayScore 公式的激活次数臂）+ lastActive=now（重置衰减轴=天然续命）
    // 设计点：VectorStore 条目同时承载 accessCount(遗忘价值) 与 activationCount(热度公式)，
    // 过去只有 accessCount 涨、activationCount 永不更新 → 衰减轴越走越老，「常被聊到」却热度不升。
    _heatEntry(v) {
        v.accessCount = (v.accessCount || 0) + 1;
        v.activationCount = (v.activationCount || 1) + 1;
        v.lastActive = Date.now();
        v.metadata = { ...(v.metadata || {}), accessCount: v.accessCount, activationCount: v.activationCount, lastActive: v.lastActive };
        return v;
    }
    // [v3.31] 按文本匹配加热（BM25/摘要碎片被想起但无独立 vector id 时按 text 回找）
    heatByText(text) {
        if (!text) return 0;
        let heated = 0;
        for (const v of this.vectors) {
            if (v.text && v.text === text) {
                this._heatEntry(v);
                heated++;
            }
        }
        return heated;
    }
    
    getCacheStats() {
        return { cacheSize: this.embedCache.size, vectorCount: this.vectors.length };
    }
    export() {
        return this.vectors.map(v => ({
            ...v,
            docHash: v.docHash || (v.text ? 'doc_' + hash32(String(v.text)) : undefined),
            payloadHash: v.payloadHash || (v.metadata ? 'pay_' + hash32(JSON.stringify(v.metadata)) : undefined),
            embedding: Array.from(v.embedding)
        }));
    }
    import(data) {
        this.embedCache.clear();
        this.vectors = (data || []).map(v => {
            const docHash = v.docHash || (v.text ? 'doc_' + hash32(String(v.text)) : null);
            const payloadHash = v.payloadHash || (v.metadata ? 'pay_' + hash32(JSON.stringify(v.metadata)) : null);
            const embedding = new Float32Array(v.embedding || []);
            if (docHash && embedding.length > 0) {
                this.embedCache.set(docHash, embedding);
            }
            return {
                ...v,
                docHash,
                payloadHash,
                embedding
            };
        });
    }
}

class CharacterMemoryBank {
    constructor() {
        this.memories = {};   // { charName: { core: [], recent: [] } }
        this.RECENT_KEEP = 3; // 近期记忆保留最近 3 个版本
    }
    // 追加核心记忆（永久，不自动删）
    _detId(char, text) {
        let h = 0x811c9dc5;
        const s = String(char || '') + '|' + String(text || '');
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
        return (h >>> 0).toString(36);
    }
    addCore(char, text, floor) {
        if (!char || !text) return null;
        const c = this._c(char);
        // [v3.17] 确定性 id（baibai 确定性语义）: 同角色同文本同楼层 → 同 id，swipe 重run 幂等不重复
        const m = { id: 'cm_' + this._detId(char, text) + '_' + (Math.max(0, Math.round(Number(floor) || 0))), text: String(text).slice(0, 200), floor: floor || 0, ts: Date.now() };
        _initEbbingMeta(m);   // [v3.20] Ebbinghaus 字段
        // 三态补丁: 同 id 已存在则更新（幂等），不同文本新增
        const existIdx = c.core.findIndex(x => x.id === m.id);
        if (existIdx >= 0) { c.core[existIdx].text = m.text; c.core[existIdx].ts = m.ts; return c.core[existIdx]; }
        c.core.push(m);
        if (c.core.length > 50) this._gcCore(c, Date.now());   // [v3.17] GC 校准淘汰
        return m;
    }
    // 追加近期记忆（自动更替: 保留最近 RECENT_KEEP 条）
    addRecent(char, text, floor) {
        if (!char || !text) return null;
        const c = this._c(char);
        const m = { id: 'mr_' + this._detId(char, text) + '_' + (Math.max(0, Math.round(Number(floor) || 0))), text: String(text).slice(0, 200), floor: floor || 0, ts: Date.now() };
        _initEbbingMeta(m);   // [v3.20] Ebbinghaus 字段
        const existIdx = c.recent.findIndex(x => x.id === m.id);
        if (existIdx >= 0) { c.recent[existIdx].text = m.text; c.recent[existIdx].ts = m.ts; return c.recent[existIdx]; }
        c.recent.push(m);
        if (c.recent.length > this.RECENT_KEEP) c.recent.shift();
        return m;
    }
    // [v3.17] GC 校准器（anima retention value）: 淘汰「没人在乎的」而非粗暴截断
    _gcCore(c, now) {
        if (!c.core || c.core.length <= 50) return;
        // [v3.20] Ebbinghaus 衰减评分（收编 ruby-phone-work）: 淘汰「没人在乎的」
        // 按 decayScore 保底，淘汰分数最低的（最重要/最常激活/最新鲜的保留）
        const scored = c.core.map(m => ({ m, s: decayScore(m, {}) }));
        scored.sort((a, b) => b.s - a.s);
        c.core = scored.slice(0, 50).map(x => x.m);
    }
    // [v3.17] GC 校准器对外接口（可手动触发，淘汰访问频次最低者）
    gc(char, now) {
        const c = this._c(char);
        this._gcCore(c, now || Date.now());
    }
    // 手动升降级（核心 ↔ 近期）
    promoteToCore(char, id) { const c = this._c(char); const i = c.recent.findIndex(m => m.id === id); if (i < 0) return false; const [m] = c.recent.splice(i, 1); m.ts = Date.now(); c.core.push(m); return true; }
    demoteToRecent(char, id) { const c = this._c(char); const i = c.core.findIndex(m => m.id === id); if (i < 0) return false; const [m] = c.core.splice(i, 1); m.ts = Date.now(); c.recent.push(m); if (c.recent.length > this.RECENT_KEEP) c.recent.shift(); return true; }
    // 删除单条
    deleteMemory(char, id) { const c = this._c(char); c.core = c.core.filter(m => m.id !== id); c.recent = c.recent.filter(m => m.id !== id); return true; }
    // 该角色全部记忆
    of(char) { return this._c(char); }
    // 召回（链1/链2 用）: 匹配查询词，按相关性+时间衰减排序
    search(char, query) {
        const c = this._c(char);
        const q = String(query || '').slice(0, 60);
        const all = [...c.core, ...c.recent].map(m => ({...m, _isCore: c.core.includes(m)}));
        if (!q) return all.slice(-8).reverse();
        // [v3.20] Ebbinghaus 衰减排序（ruby-phone-work）: 核心优先 + 衰减价值 + 时间
        return all.filter(m => m.text.includes(q))
            .sort((a, b) => {
                const sa = decayScore(a, {}) * (a._isCore ? 3 : 1), sb = decayScore(b, {}) * (b._isCore ? 3 : 1);
                return sb - sa || (b.ts || 0) - (a.ts || 0);
            })
            .slice(0, 6);
    }
    _c(char) { if (!this.memories[char]) this.memories[char] = { core: [], recent: [] }; return this.memories[char]; }
    // [v3.22] 按楼层删除（rollbackFloor 联动）: 删楼后该楼记忆不残留
    removeByFloor(floor) {
        const f = Math.max(0, Math.round(Number(floor) || 0));
        let removed = 0;
        for (const char of Object.keys(this.memories)) {
            const c = this.memories[char];
            const beforeCore = c.core.length, beforeRecent = c.recent.length;
            c.core = c.core.filter(x => x.floor !== f);
            c.recent = c.recent.filter(x => x.floor !== f);
            removed += (beforeCore - c.core.length) + (beforeRecent - c.recent.length);
        }
        return removed;
    }
    // [v3.84] A: 角色记忆银行楼层位移——删楼前移后 core/recent 记忆的 floor 指针跟随
    shiftFloorRefs(deleted) {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        let n = 0;
        for (const char of Object.keys(this.memories)) {
            for (const arr of ['core', 'recent']) {
                for (const m of (this.memories[char][arr] || [])) {
                    if (typeof m.floor === 'number' && m.floor > del) { m.floor = m.floor - 1; n++; }
                }
            }
        }
        return n;
    }
    export() { return this.memories; }
    import(data) { this.memories = (data && typeof data === 'object') ? data : {}; for (const k of Object.keys(this.memories)) { if (!this.memories[k].core) this.memories[k].core = []; if (!this.memories[k].recent) this.memories[k].recent = []; } }
}

class EntityLexicon {
    constructor(opts = {}) {
        // [v3.157] 用零值安全内核取值：旧写法 `Number(x) || 40` 会把显式的 0 当缺失
        //   （虽然下方 Math.max(10,..) 仍会托底，但取值语义必须与全仓一致）。
        this.max = Math.max(10, Math.round(numOr(opts?.max, 40)));
        this.items = [];   // [{ canon, terms:[], desc, count, firstFloor, lastFloor }]
    }
    normalizeText(s) {
        return String(s ?? '').normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
    }
    _hitBoundary(hay, needle) {
        // 拉丁 3+ 字表面要求词边界（防 BLADEWORKS 误命中 BLADE）；其余（汉字/短词）substring
        if (!/^[a-z0-9]{3,}$/.test(needle)) return hay.includes(needle);
        try { return new RegExp('(?<![a-z0-9])' + needle + '(?![a-z0-9])').test(hay); }
        catch (e) { return hay.includes(needle); }
    }
    /** 在文本中找已登记术语（NFKC 归一匹配；命中项按最长术语降序，防短词抢配额）。
     *  @returns {Array} 命中项 [{item, terms:[surface]}] */
    match(text) {
        const hay = this.normalizeText(text);
        if (!hay) return [];
        const hits = [];
        for (const it of this.items) {
            const surfaces = it.terms.filter(t => this._hitBoundary(hay, this.normalizeText(t)));
            if (surfaces.length) hits.push({ item: it, terms: surfaces });
        }
        hits.sort((a, b) => b.item.terms.reduce((m, t) => Math.max(m, t.length), 0)
            - a.item.terms.reduce((m, t) => Math.max(m, t.length), 0));
        return hits;
    }
    /** 从文本登记/累积术语。@returns {{item, terms, existed}|null} 无有效新术语为 null */
    resolve(text, floor = 0) {
        const fl = Math.max(0, Math.round(Number(floor) || 0));
        const known = this.match(text);
        for (const h of known) { h.item.count += h.terms.length; h.item.lastFloor = Math.max(h.item.lastFloor, fl); }
        if (known.length) return { item: known[0].item, terms: known[0].terms, existed: true };
        const item = this._register(text, fl);
        return item ? { item, terms: [String(text ?? '').trim()], existed: false } : null;
    }
    _register(text, floor) {
        const canon = this.normalizeText(text);
        if (!canon || canon.length < 2 || canon.length > 40) return null;   // 单字拒绝（bigram 已天然覆盖）
        if (/^[\d\p{P}\p{S}]+$/u.test(canon)) return null;   // 纯数字/标点/符号不入典
        const hit = this.items.find(x => x.canon === canon);
        if (hit) { hit.count += 1; hit.lastFloor = Math.max(hit.lastFloor, floor); return hit; }
        const item = { canon, terms: [String(text ?? '').trim().slice(0, 40)], desc: '', count: 1, firstFloor: floor, lastFloor: floor };
        this.items.push(item);
        if (this.items.length > this.max) {
            // 超限淘汰：count 最少 → lastFloor 最旧
            this.items.sort((a, b) => a.count - b.count || a.lastFloor - b.lastFloor);
            this.items = this.items.slice(-this.max);
        }
        return item;
    }
    /** ANIMA「LLM 自动更新词典」的核心：给提取管线追加 9l（terms 新术语）+ 9m（char_aliases
     *  角色新昵称）两条规则，词典非空时附已知术语清单（新称呼写 alias 字段回灌）。
     *  词典为空时返回引导版（冷启动也能开始沉淀）。 */
    promptRules() {
        const known = this.items.length
            ? '已知术语（正文揭示新称呼时写入 alias 字段）：\n' + this.items.slice(-12).map(it => '- ' + it.terms[0] + (it.desc ? '：' + it.desc : '')).join('\n')
            : '（暂无已知术语）';
        return '9l. terms：本轮对话中新出现的【专有术语】——物品名/地名/招式/组织/概念/称号等（角色名走 characters 不重复登记）。每条 {"name":"术语","desc":"一句话说明","alias":"该术语本轮出现的新称呼（仅当正文用了新叫法时填写，无则省略）"}。'
            + '9m. char_aliases：本轮对话中角色的【新称呼】——昵称/绰号/代称/头衔（已知角色名单之外的新叫法，name 填已知名单中的主名）。每条 {"name":"角色主名","alias":"新称呼"}。没有则填空数组。' + known;
    }
    export() { return JSON.parse(JSON.stringify(this.items)); }
    import(data) {
        if (!Array.isArray(data)) return;
        this.items = data
            .filter(x => x && typeof x === 'object' && x.canon)
            .map(x => ({
                canon: String(x.canon).slice(0, 40),
                terms: Array.isArray(x.terms) ? x.terms.map(t => String(t).slice(0, 40)).filter(Boolean).slice(0, 8) : [String(x.canon)],
                desc: String(x.desc || '').slice(0, 120),
                count: Math.max(1, Math.round(Number(x.count) || 1)),
                firstFloor: Math.max(0, Math.round(Number(x.firstFloor) || 0)),
                lastFloor: Math.max(0, Math.round(Number(x.lastFloor) || 0)),
            })).slice(-this.max);
    }
}

class WorldProgress {
    constructor() {
        this.pendingWrite = null;
        this.revision = 0;
        this.active = {};
        this.pending = false;
        this.EVERY_FLOORS = 2;
        this.MAX_ACTIVE = 2;
        this.HINT_LEVEL = { NONE: 0, TRACE: 1, MESSAGE: 2, ENTER: 3 };

        // [v3.41] 吸收 Stitches: 约定账本 (Promises Ledger)
        this.promises = []; // [{ id, character, deadlineFloor, content, status: 'pending'|'imminent'|'overdue'|'fulfilled'|'broken', floor }]
        this.commitmentLedger = null; // [v3.187] 约定变更/撤销/截止历史，不替代 promises
        this.seedLedger = null; // [v3.195] 伏笔生命周期，不替代 promises / commitmentLedger
        this.parallelLedger = null; // [v3.196] 平行事实账本：别处正在发生的事，audience 区分公开/在场不得知晓
        this.secretLedger = null; // [v3.196] 秘密账本：某角色此刻不该被知晓的事，keeper 点名持有
        this.recallEcho = null; // [v3.197] 前文回扣账本：五回合前的高价值细节候选
        this.echoLedger = null; // [v3.197] 回声账本：角色生活微场景的最近产出
        // [v3.41] 吸收 Stitches: 认知隔离 (Cognitive Horizon)
        this.knowledge = {}; // { [charName]: { known: string[], unaware: string[] } }
        /* [v3.219.0] R2-F 知情网络累计读数（knowledge-network.js 的判定计数）。
         *   为什么是**累计**而不是「本轮」：单轮的「解除 0」与「这一轮本来就没有揭示」同形，
         *   只有跨轮累计才能看出「判据是否长期空转」（merged/released 长期为 0
         *   = 措辞从未命中，阈值过严或提取侧措辞从未对齐）。
         *   suspect 单独成格：「判不开但疑似同一件事」是本模块唯一说不出结论的一档，
         *   并进任何一格都会让读者以为「判过了」。 */
        this._knowledgeRead = { marked: 0, merged: 0, released: 0, alreadyKnown: 0, suspect: 0, malformed: 0, owners: 0 };
        // [v3.41] 吸收 Stitches: 剧情支线生命周期与衰减时钟 (Plot Arcs)
        this.plotArcs = []; // [{ id, title, clue, lastActiveFloor, status: 'active'|'shelved'|'resolved', interestedBy }]
    }

    // ===== 约定账本 (Promises Ledger) =====
    addPromise(p = {}) {
        const character = String(p.character || '通用').trim().slice(0, 40) || '通用';
        const content = String(p.content || '').trim().slice(0, 180);
        if (!content) return null;
        const old = this.promises.find(x => x.character === character && x.content === content && x.status !== 'fulfilled' && x.status !== 'broken');
        if (old) {
            if (Number.isFinite(Number(p.deadlineFloor)) && Number(p.deadlineFloor) > 0) old.deadlineFloor = Number(p.deadlineFloor);
            /* [v3.239.0] 同族：Number(null) 恒为 0 ⇒ 旧判据把「没给楼层」写成第 0 楼。 */
            const _pf = this._numOrNull(p.floor);
            if (_pf !== null) old.floor = _pf;
            return old;
        }
        const id = 'prom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const deadline = Number(p.deadlineFloor);
        const prom = {
            id,
            character,
            content,
            deadlineFloor: Number.isFinite(deadline) && deadline > 0 ? deadline : 9999,
            floor: Number(p.floor) || 0,
            status: 'pending',
            createdAt: Date.now()
        };
        this.promises.push(prom);
        return prom;
    }
    checkPromises(currentFloor) {
        const f = Number(currentFloor) || 0;
        for (const p of this.promises) {
            if (p.status === 'fulfilled' || p.status === 'broken') continue;
            if (f > p.deadlineFloor) {
                p.status = 'overdue';
            } else if (f >= p.deadlineFloor - 2) {
                p.status = 'imminent';
            } else {
                p.status = 'pending';
            }
        }
    }
    fulfillPromise(id) {
        const p = this.promises.find(x => x.id === id);
        if (p) p.status = 'fulfilled';
        return p;
    }
    /** [v3.178] 按 id 履行/违约——提取 prompt 中 promises_resolve 的消费口。
     *  此前只有测试直接调 fulfillPromise（另一条违约入口 breakPromise 已于 v3.229.0 删除），产品运行路径零消费，
     *  导致承诺一旦登记便永不了结（长期滞留在【未竟约定】注入区）。 */
    resolvePromise(id, status = 'fulfilled', floor = 0) {
        const p = this.promises.find(x => x.id === id);
        if (!p) return null;
        if (p.status === 'fulfilled' || p.status === 'broken') return null; // 幂等：已了结不重复
        p.status = (String(status).toLowerCase() === 'broken') ? 'broken' : 'fulfilled';
        p.resolvedFloor = Number(floor) || 0;
        p.resolvedAt = Date.now();
        return p;
    }

    // ===== 认知隔离 (Cognitive Horizon) =====
    /* [v3.219.0] R2-F：知情网络取库口。
     *   模块缺席/取库抛错一律回 null —— 调用方按「逐字比较」的旧口径降级（数据不丢），
     *   并把缺席记进读数（moduleMissing），不把「没装」伪装成「没有可合并的」。 */
    _knowledgeNet() {
        try {
            const KN = _moduleLib(() => window.LonShaKnowledgeNetwork, 'knowledge-network.js');
            return (KN && typeof KN.reconcile === 'function') ? KN : null;
        } catch (e) { errLog(e, 'worldProg._knowledgeNet'); return null; }
    }
    /* [v3.291.0 · X5] 知识轨迹取库口（knowledge-trace.js）。
     *   与 _knowledgeNet 同规格：模块缺席/取库抛错一律回 null，调用方按「不记轨迹」
     *   降级（**数据不丢**：认知侧照旧按 knowledge-network 判定），并把缺席记进读数，
     *   不把「没装」伪装成「没有轨迹」。 */
    _knowledgeTrace() {
        try {
            const KT = _moduleLib(() => window.LonShaKnowledgeTrace, 'knowledge-trace.js');
            return (KT && typeof KT.stateOf === 'function') ? KT : null;
        } catch (e) { errLog(e, 'worldProg._knowledgeTrace'); return null; }
    }
    /* [v3.291.0 · X5] 轨迹写入（**只加轨迹，不改既有认知判定**）。
     *   为什么单独一条路而不是并进 markUnaware/revealKnowledge：
     *     ① 既有两法已各自有一套「同事实判定 + 降级」口径，轨迹是**第三种信息**
     *        （在第几楼、从谁、经哪条证据），并进去会让那两法的分支数翻倍；
     *     ② 角色知识取得/误信/被纠正**不止**这两个动作（doubt / misbelieve / retract
     *        在既有两法里无处落点），必须有一条能收六种动作的口。
     *   计数进 _knowledgeTraceRead（供诊断行）；模块缺席时**不写**但计数可见。 */
    recordKnowledgeTrace(input = {}) {
        const trace = this.knowledgeTraces || (this.knowledgeTraces = { version: 1, traces: [] });
        const KT = this._knowledgeTrace();
        const read = this._knowledgeTraceRead || (this._knowledgeTraceRead = {
            knows: 0, doubts: 0, misled: 0, unknown: 0, notRecorded: 0,
            transmittals: 0, removed: 0, orphaned: 0, malformed: 0, owners: 0, suspect: 0
        });
        if (!KT) {
            /* 模块缺席：不静默吞（计数可见），但不写半截轨迹 —— 半截轨迹比没轨迹更难查。 */
            read.malformed = (Number(read.malformed) || 0) + 1;
            return null;
        }
        const character = String(input.character || input.owner || '').trim().slice(0, 40);
        const fact = String(input.fact || input.content || '').trim().slice(0, 180);
        if (!character || !fact) { read.malformed = (Number(read.malformed) || 0) + 1; return null; }
        /* 轨迹号由账本持有（与六本账同款：调用方不得自编 id 造成撞号）。 */
        const seq = (trace.traces || []).length + 1;
        const row = Object.assign({}, input, {
            traceId: String(input.traceId || ('kt_' + seq)),
            character, fact
        });
        trace.traces.push(row);
        /* 有界：超上限丢最旧，且**丢了多少必须可见**（不静默截断）。 */
        const KT_MAX = Number(KT.MAX_TRACES) || 240;
        if (trace.traces.length > KT_MAX) {
            const dropped = trace.traces.length - KT_MAX;
            trace.traces = trace.traces.slice(-KT_MAX);
            read.truncated = (Number(read.truncated) || 0) + dropped;
        }
        /* 该角色首次产生轨迹 ⇒ owners 计一次（与 _knowledgeTally 同款）。 */
        if (!read._seen) read._seen = {};
        if (!read._seen[character]) { read._seen[character] = true; read.owners = (Number(read.owners) || 0) + 1; }
        if (row.suspect) read.suspect = (Number(read.suspect) || 0) + 1;
        return row;
    }
    /* [v3.291.0 · X5] 轨迹读数刷新（把六态计数与转述/断链数按当前轨迹重算）。
     *   为什么每次重算而不是累加：状态是**由整条时间线决定**的（先误信后被纠正
     *   ⇒ 从 misled 变 knows），累加计数会在状态迁移时留下永不回落的旧值，
     *   读数与实际不一致 —— 那正是本仓点名的「账本自证」形态。 */
    refreshKnowledgeTraceRead() {
        const KT = this._knowledgeTrace();
        const trace = this.knowledgeTraces;
        const read = this._knowledgeTraceRead || (this._knowledgeTraceRead = {
            knows: 0, doubts: 0, misled: 0, unknown: 0, notRecorded: 0,
            transmittals: 0, removed: 0, orphaned: 0, malformed: 0, owners: 0, suspect: 0
        });
        if (!KT) { read.moduleMissing = true; return read; }
        read.moduleMissing = false;
        try {
            const norm = KT.normalize(trace);
            /* 六态按「角色 × 事实」逐格重算 —— 与读取侧同款判定（同一口径，不另写一套）。 */
            const pairs = new Map();
            for (const t of norm.traces) {
                const norm2 = t.character + '\u0000' + KT.normalizeFact(t.fact);
                if (!pairs.has(norm2)) pairs.set(norm2, { character: t.character, fact: t.fact });
            }
            let knows = 0, doubts = 0, misled = 0, unknown = 0, owners = 0;
            for (const p of pairs.values()) {
                const st = KT.stateOf(trace, p.character, p.fact);
                if (st.state === 'knows') knows++;
                else if (st.state === 'doubts') doubts++;
                else if (st.state === 'misled') misled++;
                else if (st.state === 'unknown') unknown++;
                if (st.ambiguousIdentity) read.ambiguousIdentity = (Number(read.ambiguousIdentity) || 0) + 1;
            }
            const letters = new Set();
            for (const t of norm.traces) letters.add(t.character);
            const ps = KT.propagationSet(norm);
            read.knows = knows; read.doubts = doubts; read.misled = misled; read.unknown = unknown;
            read.notRecorded = 0;                       // 逐格重算只在「有轨迹」的格上走，未记录格不计入本读数
            read.transmittals = ps.transmittalCount;
            read.owners = letters.size;
            read.malformed = (Number(read.malformed) || 0) + norm.malformed;
            if (norm.truncated) read.truncated = (Number(read.truncated) || 0) + norm.truncated;
        } catch (e) { errLog(e, 'worldProg.refreshKnowledgeTraceRead'); read.degraded = true; }
        return read;
    }
    /* [v3.293.0 · X6] 分支语义取库口（branch-semantics.js）。
     *   与 _knowledgeNet/_knowledgeTrace 同规格：模块缺席/取库抛错一律回 null，
     *   调用方按「不可比」降级，并把缺席记进读数，不把「没装」伪装成「无差异」。 */
    _branchSemantics() {
        try {
            const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
            return (BS && typeof BS.compareOwners === 'function') ? BS : null;
        } catch (e) { errLog(e, 'worldProg._branchSemantics'); return null; }
    }
    /* [v3.293.0 · X6] 两分支逐 owner 只读对照（**只读**：不切分支、不写任何状态）。
     *   为何放在本器官：对照的两侧正是本器官持有的 knowledge/promises/commitmentLedger 等，
     *   可零拷贝取到「本分支」侧；另一侧由调用方按检查点载荷传入。
     *   读数进 _branchSemanticsRead，供诊断行「分支语义」；模块缺席时**不写**但计数可见。 */
    compareBranchOwners(otherPayload, opts = {}) {
        const BS = this._branchSemantics();
        const read = this._branchSemanticsRead || (this._branchSemanticsRead = {
            owners: 0, incomparable: 0, filtered: 0, absentModules: 0, unknownModules: 0, degraded: false
        });
        if (!BS) { read.degraded = true; return null; }
        try {
            const self = this.export();
            const a = (self && self.owners) ? self : { owners: { __world__: { commitmentLedger: this.commitmentLedger, promises: this.promises } } };
            const cmp = BS.compareOwners(a, otherPayload, opts);
            this.branchComparison = cmp;
            read.owners = cmp.ownerCount || 0;
            read.incomparable = (cmp.incomparableFaces || []).length;
            read.absentModules = (cmp.absentModules || []).length;
            read.unknownModules = (cmp.unknownModules || []).length;
            let filtered = 0;
            for (const rec of (cmp.owners || [])) filtered += Number(rec.hidden) || 0;
            read.filtered = filtered;
            read.degraded = false;
            return cmp;
        } catch (e) { errLog(e, 'worldProg.compareBranchOwners'); read.degraded = true; return null; }
    }
    /* [v3.293.0 · X6] 逐项提案（草稿：只产出提案，不落笔）。 */
    proposeBranchImport(opts = {}) {
        const BS = this._branchSemantics();
        if (!BS) return null;
        try {
            const cmp = this.branchComparison || this.compareBranchOwners(opts.otherPayload, opts);
            if (!cmp) return null;
            return BS.proposeImport(cmp, opts);
        } catch (e) { errLog(e, 'worldProg.proposeBranchImport'); return null; }
    }
    /* [v3.293.0 · X6] 预检（blocked / warn / ok 三档；不许跳过预检直接落笔）。 */
    precheckBranchImport(proposals, ctx = {}) {
        const BS = this._branchSemantics();
        if (!BS) return null;
        try { return BS.precheckImport(proposals, ctx); }
        catch (e) { errLog(e, 'worldProg.precheckBranchImport'); return null; }
    }
    /* [v3.293.0 · X6] 把一条**已过预检**的提案落到本器官**真正拥有**的账本面上。
     *   为什么只落 unfinished 一面：X6 的五面里本器官只持有 `promises`（未了事项）。
     *   其余四面分别落在引擎别的域（事实版本 `factVersion` / 角色状态 `characterState` /
     *   金钱 `money` / 剧情时间 `storyTime`），本器官**不代持** —— 代持会造出第二真源，
     *   且那四面的写入各自有 owner 语义（如金钱要过账本、剧情时间要走时钟）。
     *   故未持有的面一律**如实回报 `not-owned-by-this-organ`**，绝不假装成功
     *   （「没接上」不得说成「已应用」是本仓点名的假绿形态之一）。
     *   落笔形态走既有 promises 结构，不新增字段语义：`source:'branch-import'` 是唯一标记，
     *   供保存后回读按来源计数核对（回读不能只报「有几条」，要报「有几条是这次来的」）。 */
    applyBranchImport(proposal) {
        const p = (proposal && typeof proposal === 'object') ? proposal : null;
        if (!p) return { ok: false, reason: 'no-proposal' };
        if (p.action !== 'add' && p.action !== 'replace') return { ok: false, reason: 'not-applicable' };
        if (p.face !== 'unfinished') return { ok: false, reason: 'not-owned-by-this-organ' };
        try {
            const list = Array.isArray(this.promises) ? this.promises : (this.promises = []);
            const id = String(p.key == null ? '' : p.key);
            if (!id) return { ok: false, reason: 'no-key' };
            const srcFloor = (p.from && Number.isFinite(Number(p.from.b))) ? Number(p.from.b)
                : ((p.from && Number.isFinite(Number(p.from.a))) ? Number(p.from.a) : null);
            const hit = list.find((x) => x && String(x.id) === id);
            if (hit) {
                if (p.action !== 'replace') return { ok: false, reason: 'exists' };
                hit.content = String(p.value == null ? hit.content : p.value);
                if (srcFloor != null) hit.floor = srcFloor;
                hit.importedAt = Date.now();
                hit.source = 'branch-import';
                return { ok: true, reason: 'replaced' };
            }
            if (p.action !== 'add') return { ok: false, reason: 'missing' };
            list.push({
                id,
                character: String(p.owner == null ? '' : p.owner),
                content: String(p.value == null ? '' : p.value),
                status: 'pending',
                floor: srcFloor,
                source: 'branch-import',
                importedAt: Date.now(),
            });
            return { ok: true, reason: 'added' };
        } catch (e) { errLog(e, 'worldProg.applyBranchImport'); return { ok: false, reason: 'threw' }; }
    }
    /* [v3.293.0 · X6] 本次会话经分支导入落下的条数（保存后回读的唯一口径）。
     *   按 `source:'branch-import'` 计数而非按总数：总数把「本来就在的」也算进来，
     *   于是「一条都没落」与「落了两条」在读数上同形（本仓点名的读数塌陷）。 */
    branchImportCount() {
        try {
            const list = Array.isArray(this.promises) ? this.promises : [];
            return list.filter((x) => x && x.source === 'branch-import').length;
        } catch (e) { errLog(e, 'worldProg.branchImportCount'); return 0; }
    }

    /* ══════════════════════════════════════════════════════════════════
     * [v3.293.0 · X7] 长篇剧情分卷与选择性接续（本器官持有「接续落笔」那一环）
     *   为什么归本器官：X7 的落笔终点是**本器官的账本面**（`promises` 用 unfinished，
     *   与 X6 同一支）。面模块（volume-continuation.js）纯函数零依赖，不碰存储；
     *   「真落笔 + 来源计数回读」这一环只能由唯一真源做（与 applyBranchImport 同族）。
     * ══════════════════════════════════════════════════════════════════ */
    /** 取卷接续模块（缺席 ⇒ null，降级不抛）。 */
    _volumeContinuation() {
        try {
            if (typeof _moduleLib === 'function') return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaVolumeContinuation : null), 'volume-continuation.js');
        } catch (_e) { /* 归 null */ }
        try { return (typeof globalThis !== 'undefined' && globalThis.LonShaVolumeContinuation) || null; } catch (_e) { return null; }
    }
    /**
     * [X7] 把一条**已过预检**的接续提案落到本器官真正拥有的账本面上。
     *   与 `applyBranchImport` 同一族纪律：只落自己持有的面（unfinished ⇒ promises），
     *   未持有的面**如实回报 `not-owned-by-this-organ`**，绝不假装成功。
     *   落笔标记用 `source:'volume-continuation'`（与分支导入**分开计数**：两种来源的
     *   「有几条是这次来的」必须能分别读出，否则撤销范围与落笔读数会互相冒充）。
     */
    applyVolumeContinuation(proposal) {
        const p = (proposal && typeof proposal === 'object') ? proposal : null;
        if (!p) return { ok: false, reason: 'no-proposal' };
        if (p.action !== 'add' && p.action !== 'replace') return { ok: false, reason: 'not-applicable' };
        if (p.face !== 'unfinished') return { ok: false, reason: 'not-owned-by-this-organ' };
        try {
            const list = Array.isArray(this.promises) ? this.promises : (this.promises = []);
            const id = String(p.key == null ? '' : p.key);
            if (!id) return { ok: false, reason: 'no-key' };
            const srcFloor = (p.from && Number.isFinite(Number(p.from.b))) ? Number(p.from.b)
                : ((p.from && Number.isFinite(Number(p.from.a))) ? Number(p.from.a) : null);
            const hit = list.find((x) => x && String(x.id) === id);
            if (hit) {
                if (p.action !== 'replace') return { ok: false, reason: 'exists' };
                hit.content = String(p.value == null ? hit.content : p.value);
                if (srcFloor != null) hit.floor = srcFloor;
                hit.importedAt = Date.now();
                hit.source = 'volume-continuation';
                if (p.packId) hit.packId = String(p.packId);
                if (p.volumeId) hit.volumeId = String(p.volumeId);
                return { ok: true, reason: 'replaced' };
            }
            if (p.action !== 'add') return { ok: false, reason: 'missing' };
            const rec = {
                id,
                character: String(p.owner == null ? '' : p.owner),
                content: String(p.value == null ? '' : p.value),
                status: 'pending',
                floor: srcFloor,
                source: 'volume-continuation',
                importedAt: Date.now(),
            };
            /* 撤销寻址素材：packId / volumeId 逐条落条（撤销按来源范围筛时**必须**逐条可比，
             *   只在包级记一次会让「范围外的条目一条不动」无从实现）。 */
            if (p.packId) rec.packId = String(p.packId);
            if (p.volumeId) rec.volumeId = String(p.volumeId);
            if (p.sourceRef && typeof p.sourceRef === 'object') rec.sourceRef = {
                session: p.sourceRef.session || null,
                branch: p.sourceRef.branch || null,
                version: p.sourceRef.version || null,
            };
            list.push(rec);
            return { ok: true, reason: 'added' };
        } catch (e) { errLog(e, 'worldProg.applyVolumeContinuation'); return { ok: false, reason: 'threw' }; }
    }
    /** [X7] 本次会话经接续落下的条数（保存后回读的唯一口径；与分支导入分列）。 */
    volumeContinuationCount() {
        try {
            const list = Array.isArray(this.promises) ? this.promises : [];
            return list.filter((x) => x && x.source === 'volume-continuation').length;
        } catch (e) { errLog(e, 'worldProg.volumeContinuationCount'); return 0; }
    }
    /** [X7] 接续落下的**逐条**记录（撤销/来源核对的输入）。 */
    volumeContinuationEntries() {
        try {
            const list = Array.isArray(this.promises) ? this.promises : [];
            return list.filter((x) => x && x.source === 'volume-continuation').map((x) => ({
                entityId: x.character || null,
                ownerKey: x.character ? ('id:' + x.character) : null,
                face: 'unfinished',
                key: String(x.id == null ? '' : x.id),
                value: x.content,
                from: x.floor,
                packId: x.packId || null,
                volumeId: x.volumeId || null,
                sourceRef: x.sourceRef || null,
                revoked: x.revoked === true,
            }));
        } catch (e) { errLog(e, 'worldProg.volumeContinuationEntries'); return []; }
    }
    /**
     * [X7] 按来源范围撤销接续落笔。**必须有范围**（没范围一律拒绝）。
     *   范围外条目**一条不动**；已撤条重复撤销不再计（幂等）。
     *   为什么撤销要落在器官上：条目是器官的账本条目，改 `revoked` 标记必须由持有者做，
     *   否则会造出「模块说撤了、账本还在」的第二真源。
     */
    revokeVolumeContinuation(scope) {
        const VC = this._volumeContinuation();
        try {
            const list = Array.isArray(this.promises) ? this.promises : [];
            const entries = list.filter((x) => x && x.source === 'volume-continuation');
            const sc = (scope && typeof scope === 'object') ? scope : null;
            const hasScope = !!(sc && (sc.packId || sc.volumeId || (sc.sourceRef && (sc.sourceRef.session || sc.sourceRef.branch || sc.sourceRef.version))));
            if (!hasScope) return { ok: false, reason: 'no-scope', revokedCount: 0, keptCount: entries.length, alreadyRevoked: 0 };
            const match = (x) => {
                if (sc.packId && String(x.packId || '') !== String(sc.packId)) return false;
                if (sc.volumeId && String(x.volumeId || '') !== String(sc.volumeId)) return false;
                const sr = sc.sourceRef;
                if (sr && (sr.session || sr.branch || sr.version)) {
                    const er = (x.sourceRef && typeof x.sourceRef === 'object') ? x.sourceRef : {};
                    if (sr.session && String(er.session || '') !== String(sr.session)) return false;
                    if (sr.branch && String(er.branch || '') !== String(sr.branch)) return false;
                    if (sr.version && String(er.version || '') !== String(sr.version)) return false;
                }
                return true;
            };
            let revoked = 0;
            let already = 0;
            for (const x of entries) {
                if (!match(x)) continue;
                if (x.revoked === true) { already++; continue; }
                x.revoked = true;
                x.revokedAt = Date.now();
                revoked++;
            }
            /* 回读计数只算**未撤**的：撤了却仍计入落笔数，会让「撤销」在读数上不成立。 */
            const live = entries.filter((x) => x.revoked !== true).length;
            return {
                ok: true,
                reason: revoked ? 'revoked' : 'nothing-in-scope',
                revokedCount: revoked,
                keptCount: entries.length - revoked,
                alreadyRevoked: already,
                liveCount: live,
                via: VC ? 'volume-continuation' : 'host-fallback',
            };
        } catch (e) { errLog(e, 'worldProg.revokeVolumeContinuation'); return { ok: false, reason: 'threw', revokedCount: 0, keptCount: 0, alreadyRevoked: 0 }; }
    }
    /* [v3.293.0 · X7] 分卷接续体检读数（诊断行「分卷接续」用；纯读、不抛）。
     *   ★ 「没选项目」必须与「选了但零条」不同形：`selected:false` 单列，读数写
     *   「未选项目（维持隔离）」—— 把两者并成一格会让「完全隔离」被读成「本来就没内容」。 */
    noteVolumeContinuation(read) {
        const r = (read && typeof read === 'object') ? read : null;
        /* ★ 「源侧缺面」必须连**面名**一起存：只存计数时，任何一处调用点少传这一格，
         *   告警条件（`absentFaceCount > 0`）就变成**恒假**——体检行永远不亮（判据永假，
         *   本仓点名过的形态）。存了面名，计数可由名字现算，少传也退化成 0 而不是静默。 */
        const absent = Array.isArray(r && r.absentFaces)
            ? r.absentFaces.map((x) => (x && typeof x === 'object') ? (x.face || null) : String(x || '')).filter(Boolean).slice(0, 12)
            : [];
        this._volumeContinuationRead = r ? {
            selected: r.selected === true,
            projectId: r.projectId || null,
            volumeTitle: r.volumeTitle || null,
            volumeCount: Number(r.volumeCount) || 0,
            chapterCount: Number(r.chapterCount) || 0,
            entryCount: Number(r.entryCount) || 0,
            absentFaceCount: Math.max(Number(r.absentFaceCount) || 0, absent.length),
            absentFaces: absent,
            nameOnlyCount: Number(r.nameOnlyCount) || 0,
            hidden: Number(r.hidden) || 0,
            sourceState: r.sourceState || null,
            navigable: r.navigable === true,
            at: Date.now(),
        } : null;
        return this._volumeContinuationRead;
    }
    /* 累计读数的一格计数（不抛）。owners 按「该角色第一次产生读数」计一次。 */
    _knowledgeTally(charName, key) {
        const r = this._knowledgeRead || (this._knowledgeRead = { marked: 0, merged: 0, released: 0, alreadyKnown: 0, suspect: 0, malformed: 0, owners: 0 });
        r[key] = (Number(r[key]) || 0) + 1;
        if (charName && !r._seen) r._seen = {};
        if (charName && r._seen && !r._seen[charName]) { r._seen[charName] = true; r.owners = (Number(r.owners) || 0) + 1; }
    }
    markUnaware(charName, fact) {
        if (!charName || !fact) return;
        if (!this.knowledge[charName]) this.knowledge[charName] = { known: [], unaware: [] };
        const k = this.knowledge[charName];
        /* [v3.219.0] R2-F：登记前先问「这是不是已经记过的同一件事」。
         *   修前 `includes` 逐字比较：同一件事的另一种措辞会再 push 一条，
         *   而 getReEntryNotice 只取前 3 条 —— 前 3 格被旧措辞占死，真实新增的认知边界
         *   **永远挤不进去**，机制表面在工作、实际已失效。
         *   三态处置各不相同：
         *     dup（同事实已登记）⇒ 不 push，计入 merged；
         *     already（已知侧已有同事实）⇒ **不登记为「不知道」**（修前「已经知道」与
         *       「不知道」可以同时存在，提示区会同时给出两条相反指令），计入 alreadyKnown；
         *     suspect（疑似但判不开）⇒ 照常登记（宁可留冗余），但计入 suspect ——
         *       「判不开」必须可见，否则与「全新的一件事」同形。
         *   模块缺席 ⇒ 回落逐字口径（数据不丢），缺席记进读数。 */
        const KN = this._knowledgeNet();
        if (!KN) {
            this._knowledgeTally(charName, 'malformed');
            if (!k.unaware.includes(fact) && !k.known.includes(fact)) k.unaware.push(fact);
            return;
        }
        const rec = KN.reconcile(k, fact, 'unaware');
        if (rec.degraded) { this._knowledgeTally(charName, 'malformed'); return; }
        if (rec.dup) { this._knowledgeTally(charName, 'merged'); return; }
        if (rec.already) { this._knowledgeTally(charName, 'alreadyKnown'); return; }
        k.unaware.push(fact);
        this._knowledgeTally(charName, 'marked');
        if (rec.suspect) this._knowledgeTally(charName, 'suspect');
    }
    revealKnowledge(charName, fact, source = '') {
        if (!charName || !fact) return;
        if (!this.knowledge[charName]) this.knowledge[charName] = { known: [], unaware: [] };
        const k = this.knowledge[charName];
        /* [v3.219.0] R2-F：解除按**同一件事**而不是按措辞。
         *   修前 `filter(x => x !== fact)` 逐字比较：实测用「博丽灵梦告知了水晶被盗的事」
         *   去解除「地下室魔法水晶被神秘黑影盗走」，**一条都清不掉** —— 认知隔离永不解除，
         *   系统每轮继续注入「切勿未卜先知」，把已经知道的事当成绝不能说的事。
         *   同事实（reconcile 判 same）⇒ 按下标删掉那一条（**用下标不用值**：值不等于措辞）；
         *   疑似（判不开但共享措辞片段）⇒ **不删**（误删 = 角色提前知道他不该知道的事，
         *     且在读数上完全看不见），只计入 suspect，由注入面把候选原文说出来；
         *   模块缺席 ⇒ 回落逐字口径。
         *   known 侧的幂等仍按同事实判（措辞漂移不得在已知里再堆一条）。 */
        const KN = this._knowledgeNet();
        let removed = false;
        if (!KN) {
            this._knowledgeTally(charName, 'malformed');
            const before = k.unaware.length;
            k.unaware = k.unaware.filter(x => x !== fact);
            removed = k.unaware.length < before;
        } else {
            const rec = KN.reconcile(k, fact, 'reveal');
            if (rec.degraded) { this._knowledgeTally(charName, 'malformed'); }
            else {
                if (rec.same && rec.same.side === 'unaware' && Number.isFinite(rec.same.index)) {
                    k.unaware.splice(rec.same.index, 1);
                    removed = true;
                    this._knowledgeTally(charName, 'released');
                } else if (rec.suspect) {
                    this._knowledgeTally(charName, 'suspect');
                }
            }
        }
        if (!k.known.includes(fact)) k.known.push(fact);
        return removed;
    }
    getReEntryNotice(charName) {
        const k = this.knowledge?.[charName];
        if (!k || !k.unaware?.length) return '';
        const unawareList = k.unaware.slice(0, 3).map(u => `尚未得知：${u}`).join('；');
        return `〔认知隔离提示：角色【${charName}】此前不在场，${unawareList}。扮演该角色时切勿未卜先知、不可主动提起其不知情的事实〕`;
    }

    // ===== 剧情支线生命周期 (Plot Arcs) =====
    addPlotArc(arc = {}) {
        const title = String(arc.title || '支线').trim().slice(0, 80) || '支线';
        const clue = String(arc.clue || '').trim().slice(0, 180);
        const currentFloor = Number(arc.currentFloor) || 0;
        const existing = this.plotArcs.find(a => a.title === title && (clue ? a.clue === clue : true));
        if (existing) {
            existing.status = 'active';
            existing.lastActiveFloor = currentFloor || existing.lastActiveFloor;
            if (arc.interestedBy) existing.interestedBy = String(arc.interestedBy).slice(0, 40);
            return existing;
        }
        const id = 'arc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const entry = {
            id,
            title,
            clue,
            lastActiveFloor: currentFloor,
            createdFloor: Number(arc.createdFloor) || currentFloor,
            status: 'active',
            interestedBy: String(arc.interestedBy || '').slice(0, 40)
        };
        this.plotArcs.push(entry);
        return entry;
    }
    touchArc(idOrTitle, currentFloor) {
        const arc = this.plotArcs.find(a => a.id === idOrTitle || a.title === idOrTitle);
        if (arc) {
            arc.status = 'active';
            arc.lastActiveFloor = Number(currentFloor) || arc.lastActiveFloor;
        }
        return arc;
    }
    decayArcs(currentFloor, maxInactiveTurns = 15) {
        const f = Number(currentFloor) || 0;
        for (const a of this.plotArcs) {
            if (a.status === 'resolved') continue;
            if (f - (a.lastActiveFloor || 0) > maxInactiveTurns) {
                a.status = 'shelved';
            }
        }
    }
    // [v3.85] WorldProgress 楼层生命周期：承诺/支线/场外动态随删楼回滚与前移。
    removeByFloor(floor) {
        const f = Number(floor);
        if (!Number.isFinite(f)) return 0;
        let removed = 0;
        const beforePromises = this.promises.length;
        this.promises = this.promises.filter(p => Number(p.floor) !== f);
        removed += beforePromises - this.promises.length;
        for (const key of Object.keys(this.active || {})) {
            if (Number(this.active[key]?.floor) === f) { delete this.active[key]; removed++; }
        }
        const beforeArcs = this.plotArcs.length;
        this.plotArcs = this.plotArcs.filter(a => Number(a.createdFloor) !== f);
        removed += beforeArcs - this.plotArcs.length;
        for (const a of this.plotArcs) {
            if (Number(a.lastActiveFloor) === f) a.lastActiveFloor = Math.max(0, f - 1);
            if (Number(a.resolutionFloor) === f) { a.status = 'active'; delete a.resolutionFloor; delete a.resolutionReason; }
        }
        if (Number(this.pendingWrite?.floor) === f) this.pendingWrite = null;
        return removed;
    }
    shiftFloorRefs(deleted) {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        const dec = (value, allowSentinel = false) => {
            const n = Number(value);
            if (!Number.isFinite(n) || n <= del || (allowSentinel && n >= 9999)) return value;
            return n - 1;
        };
        let shifted = 0;
        for (const p of this.promises) {
            const oldFloor = p.floor;
            p.floor = dec(p.floor);
            if (p.floor !== oldFloor) shifted++;
            p.deadlineFloor = dec(p.deadlineFloor, true);
        }
        for (const a of this.plotArcs) {
            a.lastActiveFloor = dec(a.lastActiveFloor);
            a.createdFloor = dec(a.createdFloor);
            a.resolutionFloor = dec(a.resolutionFloor);
        }
        for (const key of Object.keys(this.active || {})) this.active[key].floor = dec(this.active[key].floor);
        if (this.pendingWrite) this.pendingWrite.floor = dec(this.pendingWrite.floor);
        return shifted;
    }
    markPending() { this.pending = true; }
    candidates(knownChars, presentChars, status, graph) {
        // 不在场 = 已知角色 - 在场角色
        return knownChars.filter(n => !presentChars.includes(n)).slice(0, 8);
    }
    // 选出最多 MAX_ACTIVE 个候选（综合上次互动轮距 / 有无待办）
    // [v3.91] 审计修复：上限原恒取 this.MAX_ACTIVE，config.worldProgressMaxCandidates 全项目零引用。
    //         增加可选 maxCandidates 参数，缺省仍回落 MAX_ACTIVE。
    select(candidates, status, maxCandidates) {
        const scored = candidates.map(c => {
            let score = 0;
            const st = status?.characters?.[c];
            const lastSeen = st?.fields?.['上次互动'] ? Number(st.fields['上次互动']) : 0;
            const floorGap = st ? 0 : 5;
            score = (st?.fields?.['有独立目标'] ? 3 : 0) + lastSeen + (st?.todos?.length ? 2 : 0) + floorGap;
            return { name: c, score };
        }).sort((a, b) => b.score - a.score);
        const mc = Number(maxCandidates);
        const cap = Number.isFinite(mc) && mc >= 1 ? Math.round(mc) : this.MAX_ACTIVE;
        return scored.slice(0, cap).map(s => s.name);
    }
    // [v3.17] 发布确认: 先暂存 pending（detached），宿主确认后 publish 生效
    propose(char, level, memory, floor) {
        this.pendingWrite = { char, level, memory, floor, revision: ++this.revision };
        return this.pendingWrite;
    }
    // 宿主确认（剧情生成成功/楼层稳定后调用）→ 一次性发布
    publish() {
        if (!this.pendingWrite) return null;
        const { char, level, memory, floor } = this.pendingWrite;
        this.active[char] = { level: level || 0, entryHint: level >= 1 && level <= 3 ? memory : null, memory, floor: floor || 0, ts: Date.now() };
        if (Object.keys(this.active).length > 10) {
            const oldest = Object.keys(this.active).sort((a, b) => this.active[a].ts - this.active[b].ts)[0];
            delete this.active[oldest];
        }
        const done = this.pendingWrite; this.pendingWrite = null; return done;
    }
    // 拒绝提交（楼层回滚/重roll 时丢弃 pending，防半提交推进污染）
    discard() { const d = this.pendingWrite; this.pendingWrite = null; return d; }
    // [v3.17] 对账（yuzuki overlay）: 楼层重排后推进过期自动失活
    reconcile(latestFloor) {
        const f = Math.max(0, Math.round(Number(latestFloor) || 0));
        let removed = 0;
        for (const k of Object.keys(this.active)) {
            if (this.active[k].floor > f) { delete this.active[k]; removed++; }
        }
        return removed;
    }
    // [v3.21] 实际推演: 用 charMem 最近记忆 + 图谱位置生成不在场角色动态（零新增 API 调用）
    // 这是 WorldProgress 的核心填充步骤——此前 active 恒空，世界推进空转
    generateFromMemory(engine, knownChars, presentChars, floor) {
        if (!engine || !knownChars?.length) return 0;
        const cands = this.candidates(knownChars, presentChars, null, engine.graph);
        if (!cands.length) return 0;
        const chosen = this.select(cands, engine.status, engine?.config?.config?.worldProgressMaxCandidates);
        if (!chosen.length) return 0;
        let filled = 0;
        for (const name of chosen) {
            const mems = engine.charMem?.search ? engine.charMem.search(name, '') : [];
            if (!mems.length) continue;
            const recent = mems[0]?.text || '';
            if (!recent) continue;
            const memory = `（场外动态）${name}：${recent} —— 其生活仍在继续`;
            this.active[name] = { level: 0, entryHint: null, memory, floor: Number(floor) || 0, ts: Date.now() };
            filled++;
        }
        if (Object.keys(this.active).length > 10) {
            const oldest = Object.keys(this.active).sort((a, b) => this.active[a].ts - this.active[b].ts)[0];
            delete this.active[oldest];
        }
        return filled;
    }
    store(char, level, memory, floor) {
        this.active[char] = { level: level || 0, entryHint: level >= 1 && level <= 3 ? memory : null, memory, floor: floor || 0, ts: Date.now() };
        if (Object.keys(this.active).length > 10) {
            const oldest = Object.keys(this.active).sort((a, b) => this.active[a].ts - this.active[b].ts)[0];
            delete this.active[oldest];
        }
    }
    // 输出注入（buildInjection 调用）: 包含约定账本、活跃支线与不在场推进
    toInjection(knownChars = []) {
        const results = [];
        const names = Array.isArray(knownChars) ? knownChars.filter(Boolean).slice(0, 8) : [];
        const notices = names.map(name => this.getReEntryNotice(name)).filter(Boolean);
        if (notices.length) {
            results.push({
                id: 'wp_knowledge',
                text: '〔认知隔离提示〕\n' + notices.join('\n'),
                source: 'worldprogress+knowledge'
            });
        }
        // 1. 约定账本注入 (高优先级)
        const activePromises = (this.promises || []).filter(p => p.status !== 'fulfilled' && p.status !== 'broken');
        if (activePromises.length) {
            const promLines = activePromises.map(p => {
                const statusDesc = p.status === 'overdue' ? '【已逾期】' : (p.status === 'imminent' ? '【即将到期】' : '【进行中】');
                // [v3.178] 携带 prom_id：AI 才能在 promises_resolve 里按 id 回引了结。
                //   此前格式不含 id，整个「履行/违约」回路无法闭合。
                return `- [${p.id}|约定|${p.character}|截止第${p.deadlineFloor}楼] ${statusDesc} ${p.content}`;
            }).join('\n');
            results.push({
                id: 'wp_promises',
                text: `〔未竟约定与承诺〕\n${promLines}`,
                source: 'worldprogress+promises'
            });
        }
        const commitmentApi = (typeof window !== 'undefined' && window.LonShaCommitmentLedger) || null;
        const commitmentText = commitmentApi?.render?.(this.commitmentLedger, 6) || '';
        if (commitmentText) {
            results.push({
                id: 'wp_commitment_ledger',
                text: commitmentText,
                source: 'worldprogress+commitment-ledger'
            });
        }
        const seedApi = (typeof window !== 'undefined' && window.LonShaSeedLedger) || null;
        const seedText = seedApi?.render?.(this.seedLedger, 5) || '';
        if (seedText) {
            results.push({
                id: 'wp_seed_ledger',
                text: seedText,
                source: 'worldprogress+seed-ledger'
            });
        }
        // [v3.196] 平行事实账本：公开面与隐藏面分开注入，隐藏面标注在场角色不得知晓
        const parallelApi = (typeof window !== 'undefined' && window.LonShaParallelLedger) || null;
        if (parallelApi) {
            const parallelVisible = parallelApi.renderVisible?.(this.parallelLedger, 4) || '';
            if (parallelVisible) {
                results.push({
                    id: 'wp_parallel_visible',
                    text: parallelVisible,
                    source: 'worldprogress+parallel-ledger'
                });
            }
            const parallelHidden = parallelApi.renderHidden?.(this.parallelLedger, 4) || '';
            if (parallelHidden) {
                results.push({
                    id: 'wp_parallel_hidden',
                    text: parallelHidden,
                    source: 'worldprogress+parallel-ledger'
                });
            }
        }
        // [v3.196] 秘密账本：只注入未揭露的（sealed/advancing），已揭露的进历史不再占注入
        const secretApi = (typeof window !== 'undefined' && window.LonShaSecretLedger) || null;
        const secretText = secretApi?.render?.(this.secretLedger, 5) || '';
        if (secretText) {
            results.push({
                id: 'wp_secret_ledger',
                text: secretText,
                source: 'worldprogress+secret-ledger'
            });
        }
        // [v3.197] 前文回扣账本：只给 pending 高价值候选，生成侧自行决定是否重现
        const echoApi = (typeof window !== 'undefined' && window.LonShaRecallEcho) || null;
        const echoText = echoApi?.render?.(this.recallEcho, 3) || '';
        if (echoText) {
            results.push({
                id: 'wp_recall_echo',
                text: echoText,
                source: 'worldprogress+recall-echo'
            });
        }
        // [v3.197] 回声账本：按在场角色给最近回声，仅氛围补全不改写事实
        const lifeApi = (typeof window !== 'undefined' && window.LonShaEchoLedger) || null;
        if (lifeApi) {
            // 在场角色真源是 scene.presence（Map：name → {atFloor}），取最近登场的前 3 个
            let recentChars = [];
            try {
                const presence = this.scene && this.scene.presence;
                if (presence instanceof Map && presence.size) {
                    recentChars = [...presence.entries()]
                        .sort((a, b) => (b[1].atFloor || 0) - (a[1].atFloor || 0))
                        .slice(0, 3)
                        .map(([nm]) => nm);
                }
            } catch (e) { recentChars = []; }
            for (const charName of recentChars) {
                const lifeText = lifeApi.render?.(this.echoLedger, charName, 2) || '';
                if (lifeText) {
                    results.push({
                        id: 'wp_echo_ledger_' + charName,
                        text: lifeText,
                        source: 'worldprogress+echo-ledger'
                    });
                }
            }
        }

        // 2. 活跃剧情支线注入
        const activeArcs = (this.plotArcs || []).filter(a => a.status === 'active');
        if (activeArcs.length) {
            const arcLines = activeArcs.map(a => `- [支线:${a.title}] ${a.clue}${a.interestedBy ? ` (关注者: ${a.interestedBy})` : ''}`).join('\n');
            results.push({
                id: 'wp_arcs',
                text: `〔活跃剧情支线〕\n${arcLines}`,
                source: 'worldprogress+arcs'
            });
        }

        // 3. 场外动态推进注入
        const entries = Object.values(this.active);
        for (const a of entries) {
            results.push({
                id: 'wp_' + a.floor,
                text: `${a.floor != null ? `（第${a.floor}楼待推进）${a.name || ''}` : ''}${a.memory || ''}`,
                source: 'worldprogress'
            });
        }
        return results;
    }
    export() {
        return {
            active: this.active,
            pending: this.pending,
            promises: this.promises || [],
            commitmentLedger: this.commitmentLedger || null,
            seedLedger: this.seedLedger || null,
            parallelLedger: this.parallelLedger || null,
            secretLedger: this.secretLedger || null,
            recallEcho: this.recallEcho || null,
            echoLedger: this.echoLedger || null,
            knowledge: this.knowledge || {},
            /* [v3.291.0 · X5] 知识轨迹随世界推进一并持久化。
             *   为什么不挂在别的账本里：轨迹的键是「角色 × 事实 × 楼层」，
             *   与 knowledge 的「角色 × 事实」同域但**时间维度**不同，
             *   并进去会让既有 knowledge 的结构从 {known,unaware} 二字段变成复合体，
             *   迁移期两边都要兼容 —— 单独一格可独立迁移、独立回滚。 */
            knowledgeTraces: this.knowledgeTraces || { version: 1, traces: [] },
            /* [v3.293.0 · X6] 分支语义读数随世界推进持久化。只存**读数**（不可比面数 / 被过滤条数 / 缺模块数），
             *   不存整个对照结构 —— 对照结构由下一次 compare 重建，存进去只会随分支漂移。 */
            branchSemanticsRead: this._branchSemanticsRead || null,
            /* [v3.293.0 · X7] 分卷接续读数随世界推进持久化。只存**读数**
             *   （卷数 / 可接续条数 / 缺面数 / 同名候选数 / 源状态），不存整包 ——
             *   包由调用方持有（边界：不自建持久化），存进去会变成第二真源。
             *   ★ `selected:false`（没选项目）也照样持久化：默认隔离是**产品状态**，
             *   不是「没有数据」，重启后必须还能读出「它一直是隔离的」。 */
            volumeContinuationRead: this._volumeContinuationRead || null,
            plotArcs: this.plotArcs || []
        };
    }
    import(data) {
        if (data) {
            this.active = data.active || {};
            this.pending = !!data.pending;
            this.promises = Array.isArray(data.promises) ? data.promises : [];
            this.commitmentLedger = data.commitmentLedger || null;
            this.seedLedger = data.seedLedger || null;
            this.parallelLedger = data.parallelLedger || null;
            this.secretLedger = data.secretLedger || null;
            this.recallEcho = data.recallEcho || null;
            this.echoLedger = data.echoLedger || null;
            this.knowledge = (typeof data.knowledge === 'object' && data.knowledge) ? data.knowledge : {};
            /* [v3.291.0 · X5] 轨迹导入：畸形一律回落空账（**不抛、不半截**）。
             *   与 knowledge 同款「类型不对就回落」，但多一步结构核对：
             *   traces 必须是数组（对象/字符串会被后面 normalize 当成空数组而静默丢数据）。 */
            this.knowledgeTraces = (data.knowledgeTraces && typeof data.knowledgeTraces === 'object' && Array.isArray(data.knowledgeTraces.traces))
                ? data.knowledgeTraces : { version: 1, traces: [] };
            this._knowledgeTraceRead = null;   // 导入后读数由 refreshKnowledgeTraceRead 重算，不沿用旧读数
            /* [v3.293.0 · X6] 分支语义读数导入：畸形一律回落 null（与同族口径）。
             *   对照结构**不导入**（导入后无意义 —— 那份 otherPayload 可能已随回档消失）。 */
            this._branchSemanticsRead = (data.branchSemanticsRead && typeof data.branchSemanticsRead === 'object')
                ? data.branchSemanticsRead : null;
            this.branchComparison = null;
            /* [v3.293.0 · X7] 分卷接续读数导入：畸形一律回落 null（与同族口径）。
             *   接续包**不导入**（包由调用方持有；跨会话重新构建才符合「先预览再导入」）。 */
            this._volumeContinuationRead = (data.volumeContinuationRead && typeof data.volumeContinuationRead === 'object')
                ? data.volumeContinuationRead : null;
            this.plotArcs = Array.isArray(data.plotArcs) ? data.plotArcs : [];
        }
    }
}

class StorageManager {
    constructor() {
        this.STORAGE_KEY = 'lonsha_memory';
        this._isWriting = false;
        // [v3.166] 写入合流缓冲：单槽 → **按 chatId 合并**。
        //   旧写法 this._pendingWrite = {...} 是一个全局单槽：下一批无论属于哪个 chat
        //   都会把上一批盖掉。同 chat 的连续快照相互覆盖是**刻意**的合并
        //   （v3.40 Write Coalescing：后一份是前一份的超集，只写最新一份即可），
        //   但补提取（租约捕获的旧 chatId）与删楼（被删 chatId）会带来**不同 chat**
        //   的批次 —— 那才是真丢失：被盖掉的那个 chatId 的数据永久消失，
        //   而调用方收到的是 true。
        //   改为 Map<chatId, batch>：同 chat 合并、异 chat 并存，两个语义各自正确。
        this._pendingWrites = new Map();
        this._mergedBatches = 0;        // 累计因同 chat 合并而被取代的批次数（良性）
        this._coalescedByChat = {};     // 分 chat 的合并次数（诊断用）
        this._lastMergedRevis = 0;
        this._crossChatCoexists = 0;    // 曾同时挂起多个不同 chat 的次数（旧实现会丢一个）
        this._revision = 0; // [v3.44] 乐观并发单调修订号 (Revision-based Optimistic Locking)
        this._confirmed = null;   // [v3.138] CP-L2: 持久化确认状态机（最近一次成功写入的 chatId/revision）
    }
    getRevision() {
        return this._revision;
    }
    setStateIfRevision(expectedRev, updateFn) {
        if (expectedRev != null && expectedRev < this._revision) {
            console.warn(`[${PLUGIN_NAME}] 状态更新被拒绝：版本冲突 (当前 rev: ${this._revision}, 请求 rev: ${expectedRev})`);
            return false;
        }
        if (typeof updateFn === 'function') updateFn();
        return true;
    }
    // [v3.40] 数据库级写入协调器 (Write Coalescing & Serialized Mutex)
    // [v3.44] 乐观并发修订号校验 (opts.expectedRevision)
    async save(chatId, data) {
        const opts = arguments[2] || {};
        if (!chatId || !data) return false;
        // [v3.139] CP-L3: 冻结键契约检查——顶层键漂移（新增/改名未同步契约清单）即刻告警，
        // 防止未知键静默 round-trip 丢失或键命名空间无序膨胀（stbme 宽容解析纪律的写侧卫兵）。
        try {
            for (const _k of Object.keys(data)) {
                if (!ARCHIVE_TOP_LEVEL_KEY_SET.has(_k)) {
                    console.warn(`[${PLUGIN_NAME}] ⚠ 存档顶层键契约违约: "${_k}" 不在 ARCHIVE_TOP_LEVEL_KEYS（将不被 restoreFromPayload 恢复）`);
                    break;
                }
            }
        } catch (e) { /* 非致命 */ }
        if (opts.expectedRevision != null && opts.expectedRevision < this._revision) {
            console.warn(`[${PLUGIN_NAME}] 存储写入被拒绝：检测到修订版本冲突 (当前 rev: ${this._revision}, 请求 rev: ${opts.expectedRevision})，防止旧快照覆盖最新状态`);
            return false;
        }
        // [v3.104] 缝合 bionic-memory changeset/ledger：状态指纹陈旧防护。
        // 修订号只能发现「顺序落后」；若内容被就地改过（导入存档/外部写入/回档），
        // 修订号可能相同而内容已换。调用方若带 expectedStateFingerprint，
        // 则与当前内存状态指纹比对，不符即拒绝（防止旧结论盖在新状态上）。
        try {
            const sgx = (typeof window !== 'undefined' && window.LonShaStaleGuard)
                || (typeof require !== 'undefined' ? (() => { try { return require('./stale-guard.js'); } catch { return null; } })() : null);
            if (sgx && opts.expectedStateFingerprint) {
                const cur = sgx.computeStateFingerprint(data, STORAGE_FP_FIELDS);
                if (String(opts.expectedStateFingerprint) !== cur) {
                    console.warn(`[${PLUGIN_NAME}] 存储写入被拒绝：状态指纹不符（调用方 ${sgx.fingerprintDiff(opts.expectedStateFingerprint, cur)}），防止基于陈旧状态覆盖`);
                    return false;
                }
            }
        } catch (e) { errLog(e, 'DB.指纹防护'); }
        this._revision += 1;
        const currentRev = this._revision;
        // [v3.140] CP: 确认推进点后移。v3.138 在递增修订号后、真实落盘前就推进 _confirmed，
        // 与「数据已安全落地只能由规范主源证明」矛盾——写失败/宿主不可用时内存已自称已保存。
        // 现在此处只登记 queued，落盘循环结束后按证据推进 confirmed / 记录 failed。
        this._lastWrite = { status: 'queued', chatId: String(chatId), revision: currentRev, ts: Date.now() };
        // [v3.166] 待写集合惰性兜底：save 可能被独立于构造函数调用（测试桩/外部脚本/
        //   热更新残留实例只提供部分字段）。缺失时若直接在合流分支或循环尾部访问，
        //   会抛 TypeError —— 把「保存失败」变成「保存崩溃」，调用方连 false 都拿不到，
        //   异常还会穿过事件回调。缺啥补啥，正常路径行为不变。
        if (!(this._pendingWrites instanceof Map)) this._pendingWrites = new Map();
        if (!Number.isFinite(Number(this._mergedBatches))) this._mergedBatches = 0;
        if (!this._coalescedByChat || typeof this._coalescedByChat !== 'object') this._coalescedByChat = {};
        if (!Number.isFinite(Number(this._crossChatCoexists))) this._crossChatCoexists = 0;
        if (this._isWriting) {
            // [v3.166] 按 chatId 合流：同 chat 取最新（=v3.40 的 Write Coalescing 语义），
            //   异 chat 并存（旧单槽在这里会静默丢掉其中一个）。
            const _k = String(chatId);
            const _prev = this._pendingWrites.get(_k);
            if (_prev) {
                this._mergedBatches += 1;
                this._coalescedByChat[_k] = (this._coalescedByChat[_k] || 0) + 1;
            }
            this._pendingWrites.set(_k, { chatId, data, revision: currentRev });
            this._lastMergedRevis = Math.max(this._lastMergedRevis, currentRev);
            if (this._pendingWrites.size > 1) this._crossChatCoexists += 1;
            return true;
        }
        let _persisted = 0, _writeErr = null;
        // [v3.166] 确认推进必须用「实际最后落盘批次」的修订号：合流批次的 rev 高于
        //   首次调用时的 currentRev，用旧的写进 _confirmed 会让确认状态与真实
        //   落盘内容不对应（_confirmed 正是判断「内存是否已有对应存档」的依据）。
        let _lastPersistedRev = currentRev;
        // [v3.166] 落盘身份必须成对：revision 取实际落盘批次，chatId 也必须取
        //   同一批次。只改 revision 会让 _confirmed 描述一个从未同时存在的「对」。
        let _lastPersistedChatId = String(chatId);
        /* [v3.272.0 O1] 目标会话身份保护（**内联**，不新增实例方法）：
         *   历史套件用 extractBraced 把 save 方法体抠进 new Function 重放，体内引用新实例方法
         *   必抛 TypeError —— 「加了个方法」就能打破别人的夹具。故核验逻辑就地展开。
         *   背景：save(chatId) 按 chatId 排队与合流，但真实写入用的是**执行那一刻**的上下文
         *   metadata。不核对就出现「在 B 的元数据里写上 chatId:A 的数据，还回 true、报 confirmed A」
         *   —— A 的存档看起来存了、实际在 B 里；B 的存档被陌生数据覆盖。不报错、只错档。
         *   取不到身份（宿主未给）⇒ 放行：不拦「未知」，否则会把未就绪窗口误判成身份不符而丢写。 */
        const _ctxIdOf = function () {
            try {
                const _st = (typeof window !== 'undefined') ? window.SillyTavern : null;
                const _c = (_st && typeof _st.getContext === 'function') ? _st.getContext() : null;
                const _v = _c ? (_c.chatId || (_c.chatMetadata && _c.chatMetadata.file_name)) : null;
                return (_v === null || _v === undefined || String(_v) === '') ? null : String(_v);
            } catch (_e) { return null; }
        };
        const _liveChatId = _ctxIdOf();
        const _deferredBatches = [];
        this._isWriting = true;
        try {
            let curChatId = chatId;
            let curData = data;
            let curRev = currentRev;
            while (curData) {
                try {
                    const ctx = window.SillyTavern?.getContext?.();
                    if (_liveChatId && curChatId !== null && curChatId !== undefined
                        && String(curChatId) !== '' && String(curChatId) !== String(_liveChatId)) {
                        /* [v3.272.0 O1] 目标不是当前会话 ⇒ **拒绝 / 延期**（绝不写当前 metadata）：
                         *   延期不是丢弃 —— 批次数据在内存里是真的，丢的就是用户的记忆；
                         *   放回挂起集合，等身份回到该会话时自然落盘。 */
                        _deferredBatches.push({ chatId: curChatId, data: curData, revision: curRev });
                        this._lastDeferredAt = Date.now();
                        this._deferredOldSessionCount = (Number(this._deferredOldSessionCount) || 0) + 1;
                        errLog(new Error('目标会话 ' + String(curChatId) + ' 不是当前会话 ' + String(_liveChatId) + '，本批延期不写'), 'DB.会话身份');
                    } else if (ctx?.chatMetadata) {
                        // [v3.4] DB: 摘要骤减保护——存储前对比上一版，总量骤减（>50%且缺口≥20）先紧急备份再写
                        try {
                            const prev = ctx.chatMetadata.extensions?.[this.STORAGE_KEY]?.data;
                            const prevN = Array.isArray(prev?.summaries?.summaries) ? prev.summaries.summaries.length : (Array.isArray(prev?.summaries) ? prev.summaries.length : 0);
                            const nextN = Array.isArray(curData?.summaries?.summaries) ? curData.summaries.summaries.length : (Array.isArray(curData?.summaries) ? curData.summaries.length : 0);
                            if (prevN >= 30 && nextN < prevN * 0.5 && (prevN - nextN) >= 20) {
                                console.warn(`[${PLUGIN_NAME}] 摘要骤减 ${prevN}→${nextN}，写紧急备份`);
                                const eb = window.LonShaMemory?.emergency;
                                if (eb?.save) await eb.save(curChatId, `摘要骤减 ${prevN}→${nextN}`, prev, { summaries: prevN });
                            }
                        } catch (e) { errLog(e, 'DB.骤减检测'); }
                        if (!ctx.chatMetadata.extensions) ctx.chatMetadata.extensions = {};
                        const stats = {
                            nodes: curData?.graph?.nodes?.length || 0,
                            edges: curData?.graph?.edges?.length || 0,
                            summaries: Array.isArray(curData?.summaries?.summaries) ? curData.summaries.summaries.length : (Array.isArray(curData?.summaries) ? curData.summaries.length : 0),
                            ts: Date.now()
                        };
                        ctx.chatMetadata.extensions[this.STORAGE_KEY] = {
                            version: VERSION,
                            revision: curRev,   /* [v3.272.0 O1] 用**本批自己的**修订号：此前写循环外首调 rev，合流批会把自己记错 */
                            chatId: curChatId,
                            stats,
                            data: curData,
                            timestamp: Date.now()
                        };
                        // [v3.166] 宿主否认（明确 false）= 「我没存」。此时不得计入落盘证据：
                        //   旧实现无条件 _persisted += 1，等于替宿主宣布成功并推进确认。
                        let _ret;
                        if (ctx.saveChat) _ret = await ctx.saveChat();
                        else if (window.saveChat) _ret = await window.saveChat();
                        else _ret = true;   // 无 saveChat 钩子：扩展位写入本身即落地（原行为）
                        if (_ret === false) {
                            // 失败原因必须归因到「宿主否认」，否则会落到兜底文案
                            //   「chatMetadata 不可用」——把真实原因掩盖成环境问题。
                            _writeErr = '宿主 saveChat 返回 false（未落地）';
                            errLog(new Error(_writeErr), 'DB.落盘证据');
                        } else {
                            _persisted += 1;   // [v3.140] 真实落盘证据（写扩展位 + saveChat 均完成）
                            _lastPersistedRev = curRev;            // [v3.166] 实际落盘批次的修订号
                            _lastPersistedChatId = String(curChatId);   // [v3.166] 与之配对的 chat
                        }
                    }
                } catch (err) { _writeErr = String(err?.message || err); console.error('保存失败:', err); }
                // [v3.166] 从各 chat 的挂起批次里取下一个（Map 迭代顺序 = 插入顺序）
                //   判空是集合访问的前置条件：未知状态下「没有下一批」比抛错更接近真相。
                const _pk = (this._pendingWrites instanceof Map) ? this._pendingWrites : null;
                const _nxtKey = _pk ? _pk.keys().next() : { done: true };
                if (!_nxtKey.done) {
                    const _nxt = _pk.get(_nxtKey.value);
                    _pk.delete(_nxtKey.value);
                    curChatId = _nxt.chatId;
                    curData = _nxt.data;
                    curRev = _nxt.revision;   // [v3.166] 该批次自己的修订号（确认推进要用它）
                } else {
                    curData = null;
                }
            }
            /* [v3.272.0 O1] 循环结束后把被拒批次放回挂起集合（数据不丢，等身份对上再落） */
            if (_deferredBatches.length && (this._pendingWrites instanceof Map)) {
                for (const _b of _deferredBatches) {
                    this._pendingWrites.set(String(_b.chatId), { chatId: _b.chatId, data: _b.data, revision: _b.revision });
                }
            }
        } finally {
            this._isWriting = false;
        }
        // [v3.140] CP: 真实写入完成后才推进持久化确认（stbme 确认状态机）。无落盘证据不推进，
        // 并把失败显式化——旧实现恒 return true，调用方与诊断面板都无从得知「没写进去」。
        if (_persisted > 0) {
            // [v3.166] 用实际最后落盘批次的修订号（原用首次调用的 currentRev，合流后滞后）
            this._confirmed = { chatId: _lastPersistedChatId, revision: _lastPersistedRev, ts: Date.now() };
            this._lastWrite = {
                status: 'confirmed', chatId: _lastPersistedChatId, revision: _lastPersistedRev, ts: Date.now(),
                persisted: _persisted,
                // [v3.166] 可观测性：这一轮写盘合并了几批（同 chat）、是否出现过异 chat 并存
                mergedBatches: Number(this._mergedBatches) || 0,
                coalescedByChat: { ...(this._coalescedByChat || {}) },
                crossChatCoexists: Number(this._crossChatCoexists) || 0
            };
            return true;
        }
        this._lastWrite = { status: 'failed', chatId: String(chatId), revision: currentRev, ts: Date.now(), error: _writeErr || 'no persistence target (chatMetadata 不可用)' };
        console.warn(`[${PLUGIN_NAME}] ⚠ 保存未落地 (rev ${currentRev})：${this._lastWrite.error}`);
        return false;
    }
    async load(chatId, opts = {}) {
        try {
            const ctx = window.SillyTavern?.getContext?.();
            /* [v3.272.0 O1] 装载身份核验（**内联**，不新增方法 → 历史套件的 new Function 重放照旧可跑）。
             *   为什么这里拦而 save 侧放行：导错档是**把别人的记忆装进你的会话**（错内容），
             *   漏写一次回头还能补（错时机）；两者危害不同形，不可用同一颗宽松尺度。
             *   取不到当前身份（宿主未就绪）⇒ 也不导：既然不知道当前是谁，就没有「该导谁的档」。 */
            let _nowId = null;
            try {
                const _v = ctx ? (ctx.chatId || (ctx.chatMetadata && ctx.chatMetadata.file_name)) : null;
                _nowId = (_v === null || _v === undefined || String(_v) === '') ? null : String(_v);
            } catch (_e) { _nowId = null; }
            const _wantId = (chatId === null || chatId === undefined || String(chatId) === '') ? null : String(chatId);
            if (_wantId && _nowId && _wantId !== String(_nowId)) {
                this._lastLoadRefusal = { at: Date.now(), target: _wantId, current: String(_nowId) };
                return null;
            }
            const extData = ctx?.chatMetadata?.extensions?.[this.STORAGE_KEY];
            const data = extData?.data;
            if (extData?.revision != null) {
                this._revision = Math.max(this._revision, Number(extData.revision) || 0);
            }
            // [v3.12] preserveRuntime=true（生成路径）: 只读返回存档数据，不 import 覆盖运行时——
            //   运行时内存里的自愈/shift/编辑修改是最新状态，被旧存档盖回=回退（v3.7~v3.9 修复成果全被冲掉的经典 bug）
            if (opts.preserveRuntime) return data || null;
            if (data && window.LonShaMemory?.engine) {
                // [v3.138] CP-L2: 恢复管线收编单真源 restoreFromPayload（原 40 余行手写清单，三处副本之一）
                window.LonShaMemory.engine.restoreFromPayload(data, { source: 'storage-load' });
                window.LonShaMemory.engine._loadedChatId = chatId;   // [v3.140] CP: 装载身份登记
            }
            return data;
        } catch (err) { return null; }
    }
}

    /* ── 四、宿主注入口（活口） ── */
    /** [A1 第五刀] 宿主依赖注入口：模块在场时把六个器官的符号换成宿主**现算**的实现。
     *  为什么要有它：副本只在「宿主不在场」（单测/审计把类抠进 new Function 重放）时
     *  是真实现；宿主在场时若继续用副本，宿主修了函数而模块副本未同步就会**静默漂移**。
     *  只接受函数/字符串；非法值忽略（保持副本），不抛、不改语义。返回被换掉的项数。 */
    function bindDeps(deps) {
        const d = deps || {};
        let n = 0;
        if (typeof d.errLog === 'function') { errLog = d.errLog; n++; }
        if (typeof d.numOr === 'function') { numOr = d.numOr; n++; }
        if (typeof d.decayScore === 'function') { decayScore = d.decayScore; n++; }
        if (typeof d.initEbbingMeta === 'function') { _initEbbingMeta = d.initEbbingMeta; n++; }
        if (typeof d.sanitizeJson === 'function') { sanitizeJson = d.sanitizeJson; n++; }
        if (typeof d.moduleLib === 'function') { _moduleLib = d.moduleLib; n++; }
        if (typeof d.fetchWithTimeoutRetry === 'function') {
            fetchWithTimeoutRetry = d.fetchWithTimeoutRetry;
            /* 静态挂载必须跟着换：宿主诊断面读的是 fetchWithTimeoutRetry.clearCooldowns /
             * getCooldownStats（引擎 clearApiCooldowns 代理），漏跟会让诊断读到旧表。 */
            fetchWithTimeoutRetry.clearCooldowns = clearApiCooldowns;
            fetchWithTimeoutRetry.getCooldownStats = getApiCooldownStats;
            n++;
        }
        if (typeof d.version === 'string' && d.version) { VERSION = d.version; n++; }
        return n;
    }
    const api = Object.freeze({ LLMCaller, VectorStore, CharacterMemoryBank, EntityLexicon, WorldProgress, StorageManager, bindDeps, PLUGIN_NAME, VERSION });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryOrgans = api;
})(typeof window !== 'undefined' ? window : globalThis);
