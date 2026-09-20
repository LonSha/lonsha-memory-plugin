/* ========================================================
 * floor-ledger.js — [v3.180.0] 楼层真源（只写自己的那一格，不写全局账）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件的账本（itemOps / summary / opLog）此前全部住在**插件自己的存档位**
 *   （extension_settings.lonsha_memory，经 chatMetadata.extensions 落盘）：
 *     · 真源是**会话级**的：一份账，对应整条对话；
 *     · 楼层只是它里面的一行坐标（`{floor, fp, ...}`）。
 *   于是「同一楼的不同 swipe」只能靠 fp 事后对账（v3.8）来分辨，
 *   而账本的存在本身与楼层无关——**删楼、翻页、编辑都不会自动让账本对不对**，
 *   全靠 stale-guard / GC / 指纹去重这些**事后补丁**把不一致追回来。
 *   实测后果（可复现）：把一楼的 swipe 翻到另一页，楼层的正文已经换了，
 *   而摘要账仍指着旧文本；下一次 GC 扫到 fp 不在任何 swipe 取值里，才把它清掉——
 *   中间这段时间（可能跨很多轮生成）读到的都是**对不上正文的账**。
 *
 * 【本模块的职责（只做三件事）】
 *   ① 把「这一楼产生了什么」写成**该楼自己的附注**（`msg.extra.lonsha_ledger`），
 *      与该楼的正文同生共死：楼在则账在，楼删则账删，翻页则随页走；
 *   ② 给每条附注盖**指纹**（fp），使「这格账是不是属于当前显示的这页」可判定，
 *      而不是「看着像就认」；
 *   ③ 读数三态可分辨（present / valid / why），**绝不**把「没有这格账」与
 *      「有但不属于这页」混成同一个空值——这正是本项目反复治理的缺陷形态。
 *
 * 【本模块**不做**什么（边界）】
 *   不做「用楼层附注取代插件账本」。插件账本是**汇总口**（去重、排序、预算、
 *   注入、跨会话携带都建立在它上面），一次性推倒重来会断掉整条渲染契约。
 *   本模块交付的是**归属性**：账这一格该属于哪一楼哪一页，由楼层自己证明，
 *   插件账本继续做汇总。两者是「源头 + 汇总」的关系，不是替代关系。
 *
 * 【与柏宝书的关系（同一思路，不同落地）】
 *   柏宝书把状态**只**存在 `message.extra` 里，靠楼层重放得到视图——数据不会不一致，
 *   因为它根本不存一份「会过期的账」。本模块吸收的是其中**可迁移的那一条**：
 *   状态应当跟楼层走。但本插件的汇总口（预算/注入/携带）在楼层上做不出来，
 *   故取「源头下沉 + 汇总保留」的中间形态。
 *
 * 挂 window.LonShaFloorLedger，供 index.js 提取落笔 / 摘要落笔 / 覆盖度上报使用。
 * ======================================================== */
'use strict';
(function (global) {
/** 附注所在的键（写进 msg.extra，与 lonsha_omit 同层）。改此处即两端同时失联。 */
const EXTRA_KEY = 'lonsha_ledger';
/**
 * 附注结构版本。**不兼容改结构时必须升**：旧附注在新代码里会被判 invalid
 * （而不是被按新结构误读）——附着在用户楼层上的数据无法回收，只能按版本让路。
 */
const EXTRA_VERSION = 1;

/** 与 index.js hash32 逐字同构（FNV-1a 32 位，8 位十六进制）。两端口径必须一致。 */
function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
}
/** 取该楼**当前显示那一页**的正文（与 index.js msgTextOf 同口径，swipe_id 决定页）。 */
function textOf(msg) {
    try {
        if (!msg) return '';
        const sw = Math.max(0, Math.round(Number(msg.swipe_id) || 0));
        if (Array.isArray(msg.swipes) && typeof msg.swipes[sw] === 'string') return msg.swipes[sw];
        return String(msg.mes || msg.content || msg.text || '');
    } catch (_e) { return ''; }
}
/**
 * 楼层指纹（与 index.js msgFpOf 同构：角色 + 页码 + 正文 hash + 时间戳）。
 * ⚠️ 刻意**不含** `send_date` 之外的可变量：`swipe_id` 一变指纹即变，
 *    这正是「翻页后旧账不被认账」的判据来源。
 */
function fpOf(msg) {
    try {
        const isUser = (msg && (msg.is_user === true || msg.role === 'user')) ? 'u' : 'a';
        const sw = Math.max(0, Math.round(Number(msg && msg.swipe_id) || 0));
        const date = String((msg && msg.send_date) || (msg && msg.extra && msg.extra.send_date) || '');
        return [isUser, sw, hash32(textOf(msg)), date].join('|');
    } catch (_e) { return ''; }
}
/** extra 是否可写（ST 宿主给的是普通对象；缺失则本模块整体降级为只读，不抛）。 */
function extraOf(msg, create) {
    try {
        if (!msg || typeof msg !== 'object') return null;
        if (!msg.extra || typeof msg.extra !== 'object') {
            if (!create) return null;
            msg.extra = {};
        }
        return msg.extra;
    } catch (_e) { return null; }
}

/**
 * 写一格附注：把 record 挂到该楼自己身上，并盖当前指纹。
 * 契约：**要么成功写入并返回 record，要么返回 null 且什么都没改**（不写半格）。
 * 不抛——提取管线里任何一处抛都会连坐整楼的写入。
 */
function stamp(msg, record, opts = {}) {
    try {
        if (!msg || typeof record !== 'object' || record === null) return null;
        const ex = extraOf(msg, true);
        if (!ex) return null;                    // extra 不可写 ⇒ 不写，如实返回 null
        const fp = fpOf(msg);
        if (!fp) return null;                    // 指纹取不到（畸形楼）⇒ 不写半格
        // **合并语义**：同页二次落笔（先落物品、后落摘要）不得把前一次的内容冲掉。
        // 判定用「现有附注是否仍属于本页」：属于则继承其字段，不属于则整格换新
        // （翻到新页后落笔 = 新页的新账，旧页的账不继承——那正是「随页走」的含义）。
        // 注意此处**必须走完整指纹校验**（不带 ignoreFp）：ignoreFp 会把翻页后的
        // 旧账也当成有效，于是旧页的物品账被继承到新页上——这正是要杜绝的串账。
        const prev = read(msg);
        const samePage = prev.present && prev.valid;
        const base = samePage ? (prev.record || {}) : {};
        const payload = {
            v: EXTRA_VERSION,
            fp,
            floor: Number.isFinite(Number(record.floor)) ? Number(record.floor)
                : (Number.isFinite(Number(base.floor)) ? Number(base.floor) : (Number(msg.index) || 0)),
            items: Array.isArray(record.items) ? record.items.slice(0, opts.maxItems || 20)
                : (Array.isArray(base.items) ? base.items : undefined),
            summary: (record.summary && typeof record.summary === 'object') ? {
                floor: Number(record.summary.floor) || 0,
                text: String(record.summary.text || '').slice(0, opts.maxSummaryChars || 2000),
                storyTime: String(record.summary.storyTime || ''),
                manual: record.summary.manual === true || undefined
            } : (base.summary ? {
                floor: Number(base.summary.floor) || 0,
                text: String(base.summary.text || '').slice(0, opts.maxSummaryChars || 2000),
                storyTime: String(base.summary.storyTime || ''),
                manual: base.summary.manual === true || undefined
            } : undefined),
            at: Date.now()
        };
        if (!payload.items) delete payload.items;
        if (!payload.summary) delete payload.summary;
        ex[EXTRA_KEY] = payload;
        return payload;
    } catch (_e) { return null; }
}

/**
 * 读一格附注：**三态可分辨**。
 *   {present:false}                     —— 这一楼没有附注（旧楼 / 未提取 / 非本插件产出）
 *   {present:true, valid:false, why}    —— 有附注，但不属于当前显示的这页/已过期
 *   {present:true, valid:true, record}  —— 有效，可直接采信
 * why 枚举：'version-mismatch' | 'fingerprint-mismatch' | 'malformed'
 *   · fingerprint-mismatch 是**正常工况**（翻到没摘过的页），不是错误；
 *   · version-mismatch 是升级工况：留着旧数据不动，只是不认它。
 */
function read(msg, opts = {}) {
    try {
        const ex = extraOf(msg, false);
        if (!ex || !ex[EXTRA_KEY] || typeof ex[EXTRA_KEY] !== 'object') return { present: false, valid: false, record: null, why: 'absent' };
        const rec = ex[EXTRA_KEY];
        if (Number(rec.v) !== EXTRA_VERSION) return { present: true, valid: false, record: null, why: 'version-mismatch', raw: rec };
        const fp = fpOf(msg);
        if (!fp || !rec.fp) return { present: true, valid: false, record: null, why: 'malformed', raw: rec };
        if (opts.ignoreFp !== true && rec.fp !== fp) return { present: true, valid: false, record: null, why: 'fingerprint-mismatch', raw: rec };
        return { present: true, valid: true, record: rec, why: 'ok' };
    } catch (_e) { return { present: false, valid: false, record: null, why: 'thrown' }; }
}

/** 摘掉一格附注（仅本插件自己的键，不碰用户/他插件写在 extra 里的任何东西）。 */
function clear(msg) {
    try {
        const ex = extraOf(msg, false);
        if (!ex || !(EXTRA_KEY in ex)) return false;
        delete ex[EXTRA_KEY];
        return true;
    } catch (_e) { return false; }
}

/**
 * 楼层覆盖度：**把「没有附注的楼」变成有名有数的读数**。
 * 柏宝书对外的 coverage 是 `{complete, missingAiFloors}`；本模块产出同构口径，
 * 使「缺口」这件事在两边是同一种东西（而不是一边「缺摘要」一边「未提取」）。
 * 统计口径：
 *   · floors       —— 参与统计的楼层（AI 楼；番外楼 lonsha_omit 与空楼不计）
 *   · stamped      —— 有有效附注的楼
 *   · missing      —— 无附注或附注已失效的楼（**逐条列出编号，不只给个数**）
 *   · byWhy        —— 失效原因分布（缺口要能归因，不是一句「没有」）
 */
function coverage(chat, opts = {}) {
    const out = { complete: true, total: 0, stamped: 0, missing: [], byWhy: {}, floors: [] };
    try {
        const rows = Array.isArray(chat) ? chat : [];
        const upTo = Number.isFinite(Number(opts.upTo)) ? Number(opts.upTo) : rows.length - 1;
        for (let i = 0; i <= upTo && i < rows.length; i++) {
            const m = rows[i];
            if (!m) continue;
            if (opts.skipFunction && opts.skipFunction(m)) continue;
            const isUser = (m.is_user === true || m.role === 'user');
            if (isUser && opts.assistantOnly !== false) continue;   // 缺省只统计 AI 楼
            if (opts.omitFunction && opts.omitFunction(m)) continue;
            out.total++;
            out.floors.push(i);
            const r = read(m, opts);
            if (r.present && r.valid) { out.stamped++; continue; }
            out.missing.push(i);
            const why = r.present ? r.why : 'absent';
            out.byWhy[why] = (out.byWhy[why] || 0) + 1;
        }
        out.complete = out.missing.length === 0;
    } catch (_e) { out.complete = false; out.error = String((_e && _e.message) || _e); }
    return out;
}

const api = { EXTRA_KEY, EXTRA_VERSION, hash32, textOf, fpOf, stamp, read, clear, coverage };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof global !== 'undefined' && global) {
    try { global.LonShaFloorLedger = Object.freeze(api); } catch (_e) { /* 有些宿主冻结全局会抛，忽略 */ }
}
return api;
})(typeof window !== 'undefined' ? window : globalThis);
