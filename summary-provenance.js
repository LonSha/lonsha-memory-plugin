/* ========================================================
 * summary-provenance.js — [v3.183.0] 摘要来源溯源（写入时留证 + 读取时验真）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件的摘要账（SummarySystem.summaries）此前**只存正文**：
 *     `{floor, text, level, timestamp, folded}`
 *   没有任何字段回答「这条摘要当初是从哪一楼的哪一页抽出来的」。
 *   楼层真源（floor-ledger.js v3.180）落地后，归属性做到了「楼在账在、翻页随页走」，
 *   但**摘要数组自己那一格仍然没有来源**：翻 swipe 之后
 *     · 楼层附注 lonsha_ledger.summary 会因指纹不符而失效（这是设计好的， coverage 报缺口）；
 *     · 可 SummarySystem.summaries 里那条旧摘要**照样是 active**，照样进注入、进 BM25、
 *       进时间线衔接 —— 读到的全是对不上正文的账。
 *   floor-ledger.js 的注释把这件事写得很清楚：「下一次 GC 扫到 fp 不在任何 swipe 取值里
 *   才把它清掉，中间这段时间（可能跨很多轮生成）读到的都是对不上正文的账」。
 *   本模块把「事后 GC」改为**事前验真**：摘要落笔时记下它的来源指纹，
 *   读取时当场校验「这一楼这一页现在还是不是当初那一页」。
 *
 * 【本模块只做三件事】
 *   ① 留证：capture 把 {floor, fp, textHash, length, variant, at} 写进摘要记录；
 *   ② 验真：verify 对单条摘要返回四态可分辨结果（不是「有效/无效」两个值）；
 *   ③ 体检：audit 对整份摘要数组给出「哪几条对不上、分别为什么」的有名有数清单。
 *
 * 【四态判定（与 BakemonoMemory 的 summary-provenance 同族，按本仓规范重写）】
 *   'ok'              —— 来源有效，可采信
 *   'no_provenance'   —— 没有来源记录（旧档 / 非本模块产出），**不是**「无效」
 *   'source_missing'  —— 那一楼已经不存在（删楼 / 楼层前移）
 *   'source_changed'  —— 楼还在，但当前显示那一页不是当初那一页（翻 swipe / 编辑）
 *   'text_drift'      —— 指纹对得上但正文长度变了（极端：fp 碰撞或正文被就地改写）
 *
 * 【不做什么（边界）】
 *   · 不做「删除失效摘要」。删是 SummarySystem / GC 的职责，本模块只报数——
 *     报数的好处是逐条可见、可人工决定重提取还是保留；
 *   · 不改注入口径。getActiveSummaries() 保持原语义，是否过滤由调用方决定
 *     （本模块提供 verifiedOnly 便捷判据，但不偷偷改主路径）；
 *   · 不新增插件存储键。来源记录**写在摘要对象自己的字段上**，随 summaries 数组走，
 *     因此自动获得存档/携带/回放的全部既有语义，不触发任何键登记要求。
 *
 * 【与楼层真源的关系】
 *   floor-ledger 管「这一楼产生了什么」（楼 ↔ 账一对一）；
 *   本模块管「这条摘要来自哪一楼哪一页」（摘要 ↔ 来源一对多可追）。
 *   两者共用同一个指纹口径（msgFpOf），故楼层附注失效时本模块也判失效——
 *   **同一个事实在两处得到同一个答案**，这正是把它接在 msgFpOf 上而不是另造一套的理由。
 *
 * 挂 window.LonShaSummaryProvenance，供 index.js 摘要落笔 / 注入前校验 / 诊断面使用。
 * ======================================================== */
'use strict';
(function (global) {
/** 摘要记录上写来源的字段名（v3.183.0 起）。改此处即新旧数据同时失联。 */
const PROV_KEY = 'prov';
/** 来源结构版本。不兼容改结构时必须升：旧来源在新代码里判 invalid 而非按新结构误读。 */
const PROV_VERSION = 1;
/**
 * 召回侧默认剔除集合：**只有** source_changed。
 * 收窄到一条是有意的——no_provenance/malformed 是「判不了」，source_missing 分不清
 * 「删楼」与「楼层前移」（前移时剔除即真丢），text_drift 是用户有意改写。
 * 判不了就放行（同 branch-guard），召回宁多勿少。
 */
const RECALL_DROP_STATUS = ['source_changed'];
/**
 * 与 index.js hash32 逐字同构（FNV-1a 32 位，8 位十六进制）。
 * 两端口径必须一致——本模块不自己造一个 hash，那会让「同一段正文两个指纹」。
 */
function hash32(str) {
    let h = 0x811c9dc5;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0');
}
/** 与 index.js msgTextOf 同口径：取该楼**当前显示那一页**的正文（swipe_id 决定页）。 */
function textOf(msg) {
    try {
        if (!msg) return '';
        const sw = Math.max(0, Math.round(Number(msg.swipe_id) || 0));
        if (Array.isArray(msg.swipes) && typeof msg.swipes[sw] === 'string') return msg.swipes[sw];
        return String(msg.mes || msg.content || msg.text || '');
    } catch (_e) { return ''; }
}
/** 与 index.js msgFpOf 同构：角色 + 页码 + 正文 hash + 时间戳。 */
function fpOf(msg) {
    try {
        const isUser = (msg && (msg.is_user === true || msg.role === 'user')) ? 'u' : 'a';
        const sw = Math.max(0, Math.round(Number(msg && msg.swipe_id) || 0));
        const date = String((msg && msg.send_date) || (msg && msg.extra && msg.extra.send_date) || '');
        return [isUser, sw, hash32(textOf(msg)), date].join('|');
    } catch (_e) { return ''; }
}
/** 楼层号归一（缺失/畸形给 -1，与「不存在」同形）。 */
function floorOf(msg) {
    try {
        const n = Number(msg && (msg.index !== undefined ? msg.index : msg.floor));
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : -1;
    } catch (_e) { return -1; }
}

/**
 * 留证：给一条摘要记下它的来源。
 *
 * 契约：**要么写全并返回来源对象，要么原样返回 summary 且什么都没改**（不写半格）。
 * 不抛——摘要落笔路径上任何一处抛都会连坐整条摘要的写入。
 *
 * @param {object} summary  摘要记录（会被就地补 prov 字段，不新建对象）
 * @param {object} message  来源消息（楼）
 * @returns {object|null}    null = 拒绝留证（入参畸形 / 指纹取不到 / 正文为空）
 */
function capture(summary, message) {
    try {
        if (!summary || typeof summary !== 'object') return null;
        if (!message || typeof message !== 'object') return null;
        const fp = fpOf(message);
        if (!fp) return null;                       // 指纹取不到（畸形楼）⇒ 不写半格
        const text = String(summary.text || '');
        if (!text.trim()) return null;              // 空摘要不留证（没有可追的内容）
        const prov = {
            v: PROV_VERSION,
            floor: floorOf(message),
            fp,
            /** 摘要正文的 hash + 长度：用来发现「同页但摘要被人改过」。 */
            textHash: hash32(text),
            textLen: text.length,
            /** 来源页的页码：与 fp 的页码段冗余，但单独放着便于诊断面直读。 */
            variant: Math.max(0, Math.round(Number(message.swipe_id) || 0)),
            /** 来源正文长度：诊断面回答「摘要压掉了多少」。 */
            sourceLen: textOf(message).length,
            at: Date.now(),
        };
        summary[PROV_KEY] = prov;
        return prov;
    } catch (_e) { return null; }
}

/**
 * 验真：这条摘要的来源现在还有效吗。
 *
 * @returns {{status:string, reason:string, prov:object|null}}
 *   status ∈ ok / no_provenance / source_missing / source_changed / text_drift / malformed
 *   **绝不**把 no_provenance 与 source_changed 混成同一个「无效」——前者是旧档，
 *   后者是真失效，处置方式完全不同（旧档可保留，失效必须重提取）。
 */
function verify(summary, chat) {
    try {
        const prov = summary && typeof summary === 'object' ? summary[PROV_KEY] : null;
        // 数组也是 object，但数组里没有任何来源字段——那是「无记录」而非「版本不符」。
        // 判成 no_provenance 走保留态，比判 malformed 走剔除态更稳：摘要正文本身可能仍有效。
        if (!prov || typeof prov !== 'object' || Array.isArray(prov)) {
            return { status: 'no_provenance', reason: '无来源记录（旧档或非本模块产出）', prov: null };
        }
        if (Number(prov.v) !== PROV_VERSION) {
            return { status: 'malformed', reason: '来源结构版本不符', prov };
        }
        const rows = Array.isArray(chat) ? chat : [];
        const msg = (Number.isFinite(prov.floor) && prov.floor >= 0) ? rows[prov.floor] : null;
        if (!msg) {
            // 楼不存在了。**注意**：楼层号前移会让这条判成 missing，那是**已知代价**——
            // 位置型索引无法区分「删了」与「前移了」。fp 对得上时按 changed 处理（见下），
            // 对不上才判 missing，宁可多报一类也不把「前移」静默当成「还在」。
            return { status: 'source_missing', reason: '第 ' + prov.floor + ' 楼已不存在（删楼或楼层前移）', prov };
        }
        const fp = fpOf(msg);
        if (!fp || !prov.fp) {
            return { status: 'malformed', reason: '来源指纹残缺', prov };
        }
        if (fp !== prov.fp) {
            return { status: 'source_changed', reason: '该楼当前显示页与摘要来源页不一致（翻 swipe 或正文被编辑）', prov };
        }
        // 指纹对得上：再查摘要自己有没有被就地改过（fp 只覆盖来源楼，不覆盖摘要正文）。
        const text = String(summary.text || '');
        if (hash32(text) !== prov.textHash || text.length !== prov.textLen) {
            return { status: 'text_drift', reason: '摘要正文与留证时不一致（被就地修改）', prov };
        }
        return { status: 'ok', reason: '来源有效', prov };
    } catch (_e) {
        return { status: 'malformed', reason: '验真过程异常', prov: null };
    }
}

/** 单条摘要是否可采信（true 仅当 status === 'ok'）。 */
function isValid(result) {
    return !!result && result.status === 'ok';
}

/**
 * 体检：对整份摘要数组给出有名有数的失效清单。
 *
 * 口径（与 floor-ledger.coverage 同族：缺口要能归因，不是一句「没有」）：
 *   · total     —— 参与体检的摘要条数
 *   · ok        —— 来源有效
 *   · legacy    —— 无来源记录（旧档，不参与失效判定，单独一档）
 *   · byStatus  —— 各失效状态的条数分布
 *   · stale     —— **逐条列出** {floor, status, reason, head}，不只给个数
 */
function audit(summaries, chat) {
    const out = {
        total: 0, ok: 0, legacy: 0, stale: [],
        byStatus: {}, complete: true,
    };
    try {
        const rows = Array.isArray(summaries) ? summaries : [];
        for (const s of rows) {
            if (!s || typeof s !== 'object') continue;
            out.total++;
            const r = verify(s, chat);
            if (r.status === 'ok') { out.ok++; continue; }
            if (r.status === 'no_provenance') { out.legacy++; continue; }
            out.byStatus[r.status] = (out.byStatus[r.status] || 0) + 1;
            out.stale.push({
                floor: Number.isFinite(Number(s.floor)) ? Number(s.floor) : null,
                status: r.status,
                reason: r.reason,
                head: String(s.text || '').slice(0, 30),
            });
        }
        out.complete = out.stale.length === 0;
    } catch (_e) {
        out.complete = false;
        out.error = String((_e && _e.message) || _e);
    }
    return out;
}

/**
 * 过滤：只保留来源有效的摘要。
 * **便捷判据，不改变主路径**：调用方显式选择用它（如注入前收紧、诊断面对照），
 * 而不是在 getActiveSummaries 内部偷偷过滤——后者会让「为什么少了几条」无从查起。
 */
function verifiedOnly(summaries, chat) {
    try {
        const rows = Array.isArray(summaries) ? summaries : [];
        // 无来源记录的旧档**保留**：它们是升级前的存量，判失效会一次性清空历史摘要。
        return rows.filter((s) => {
            const r = verify(s, chat);
            return r.status === 'ok' || r.status === 'no_provenance';
        });
    } catch (_e) {
        return Array.isArray(summaries) ? summaries.slice() : [];
    }
}

/** 一行读数（诊断面/报告用；纯读、不抛）。 */
function line(summaries, chat) {
    try {
        const a = audit(summaries, chat);
        if (a.error) return '体检异常 · ' + String(a.error);
        if (!a.total) return '无摘要';
        if (a.complete) return `${a.ok}/${a.total} 条来源有效${a.legacy ? `（旧档 ${a.legacy} 条不参与判定）` : '（无缺口）'}`;
        const why = Object.keys(a.byStatus).map((k) => `${k}×${a.byStatus[k]}`).join(' ');
        const head = a.stale.slice(0, 5).map((x) => `第${x.floor}楼`).join(',');
        return `${a.ok}/${a.total} 条来源有效 · ${a.stale.length} 条对不上（${head}${a.stale.length > 5 ? '…' : ''}）${why ? ' · ' + why : ''}${a.legacy ? ` · 旧档 ${a.legacy}` : ''}`;
    } catch (_e) { return '—（诊断异常）'; }
}

/**
 * 召回侧过滤（分支感知）：把「来源已被翻掉」的摘要挡在注入之前。
 *
 * 与 verifiedOnly 的分工（**两套判据必须分开，不能互相顶替**）：
 *   · verifiedOnly    —— 严格判据（只留 ok / no_provenance），用于审计与收紧视图；
 *   · filterForRecall —— 宽容判据（**只剔** source_changed），用于真实召回路径。
 * 为什么召回要更宽：LonSha 的 recallMemory 是记忆进模型的唯一通道，多注入一条陈旧叙事
 * 只是噪声，少注入一条有效记忆是**丢失**。且 source_missing 无法区分「删楼」与「楼层前移」，
 * 前移时按失效剔掉就是真丢（summary-provenance 注释里写明的已知代价）。
 * 纪律同 branch-guard：**判不了就放行**。
 *
 * @param {Array} summaries
 * @param {Array} chat
 * @param {object} [opts] { dropStatus?: string[] } 可覆盖剔除集合（默认 ['source_changed']）
 * @returns {{kept:Array, dropped:Array<{floor,status,reason}>, counts:object}}
 */
function filterForRecall(summaries, chat, opts = {}) {
    const dropSet = new Set(Array.isArray(opts.dropStatus) ? opts.dropStatus : RECALL_DROP_STATUS);
    const out = {
        kept: [], dropped: [],
        counts: { checked: 0, ok: 0, dropped: 0, keptLegacy: 0, keptMissing: 0, keptDrift: 0, keptOther: 0, errored: 0 },
    };
    try {
        const rows = Array.isArray(summaries) ? summaries : [];
        for (const s of rows) {
            if (!s || typeof s !== 'object') continue;
            out.counts.checked++;
            let v;
            try { v = verify(s, chat); } catch (_e) { v = { status: 'malformed', reason: '验真异常' }; out.counts.errored++; }
            if (dropSet.has(v.status)) {
                out.counts.dropped++;
                out.dropped.push({ floor: Number.isFinite(Number(s.floor)) ? Number(s.floor) : null, status: v.status, reason: v.reason });
                continue;
            }
            if (v.status === 'ok') out.counts.ok++;
            else if (v.status === 'no_provenance' || v.status === 'malformed') out.counts.keptLegacy++;
            else if (v.status === 'source_missing') out.counts.keptMissing++;
            else if (v.status === 'text_drift') out.counts.keptDrift++;
            else out.counts.keptOther++;
            out.kept.push(s);
        }
    } catch (_e) {
        // 模块级异常：整份放行（宁可多注入，不可整批丢）
        return { kept: Array.isArray(summaries) ? summaries.slice() : [], dropped: [], counts: out.counts };
    }
    return out;
}

const api = {
    PROV_KEY, PROV_VERSION, RECALL_DROP_STATUS,
    hash32, textOf, fpOf, floorOf,
    capture, verify, isValid, audit, verifiedOnly, filterForRecall, line,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof global !== 'undefined' && global) {
    try { global.LonShaSummaryProvenance = Object.freeze(api); } catch (_e) { /* 有些宿主冻结全局会抛，忽略 */ }
}
return api;
})(typeof window !== 'undefined' ? window : globalThis);