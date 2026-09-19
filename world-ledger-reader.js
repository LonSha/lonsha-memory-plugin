/* ========================================================
 * world-ledger-reader.js — [v3.176.0] 世界账本读者面（只读）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   v3.175.0 把「读 WorldAxis 世界钟」这条边接通了（world-clock-reader.js），
 *   但实测**只读了一个字段**：`snapshot.worldClock`。
 *   而 WorldAxis 的快照里（engines/bridge.js:119-205 buildSnapshot）实际有：
 *     worldClock / pulse / digest / currents（暗流）/ echoes（涟漪）/ facts（权威事实）/
 *     people（人物位置）/ opinion{canon,forum,sandbox}（舆情三分）/ counts / filter（过滤归因）
 *   ——**十二条外供面，本插件此前一条都没读**。这不是「通路没通」，是「通路只通了一根线」。
 *
 * 【本模块补的到底是什么（不是「多读几个字段」，是三类结构性缺口）】
 *   ① **不可观测的缺口**（最要紧的一条）：
 *      WorldAxis 的暗流分三档可见性 hidden / trace / public，默认只外供显式标记的那批，
 *      其余落进 `filter.notMarked[]`。于是本插件面对的世界，**连「有多少东西没给我」都读不到**——
 *      它看到的是一个「恰好只有这些」的完美世界，而不是「被过滤过、缺了 N 条」的世界。
 *      本模块把 `filter` 块读出来，把「缺席」变成「有数、有名、有原因」的读数。
 *   ② **两个世界对不上的具体形态**（比时钟更具体）：
 *      时钟对不上只是「数字差几天」；而**人物位置对不上**（本插件记「崔莺莺在邮局」，
 *      推演侧记「崔莺莺在城南车站」）才是剧情真正会崩的地方。
 *      本模块做 `diffPeople`：拿本插件的角色表与推演侧的人物表逐一对读。
 *   ③ **事实强度的分级消费**：
 *      推演侧的舆情分 canon（已核实新闻）/ forum（论坛传闻）/ sandbox（NON-CANON 闲逛）三档，
 *      且每条带 `claim`（claim_status）。「已核实」与「纯传闻」在**能不能当事实引用**上完全相反。
 *      本模块把三档分开报，供调用方按强度取用，而不是一锅端。
 *
 * 【本模块的职责】只做三件事（与 v3.175 世界钟读者面同规格）：
 *   ① 只读：只调 bridge.snapshot() / bridge.stat() 与桥的状态字段，绝不写世界状态；
 *   ② 不抛：任何畸形（桥未装/未启用/旧版无字段/字段类型怪/宿主 getter 抛）一律降级为读数；
 *   ③ 不猜：读数缺席**如实**报出来（present/absent 三态可分辨），不静默编造一本账顶替。
 *
 * 【与上游的规格对齐（逐条对 engines/bridge.js 核过）】
 *   · `currents[]` 每项：{ id, title, summary, visibility, stage, participants[], at }
 *   · `echoes[]`   每项：{ id, refCurrent, result, exposure, at }
 *   · `facts[]`    每项：{ key, value, scope, at }   —— 「已结算的权威事实」，不再变
 *   · `people[]`   每项：{ id, name, location, action, lastSeenAt }
 *   · `opinion`    { canon[{title,body,claim,scope,relatedEvent,at}],
 *                    forum[{board,topic,claim,relatedEvent,replies[],at}],
 *                    sandbox[{kind,text,mood}], updatedAt }
 *   · `filter`     { presumeUnknown, includeHidden, exportedCurrents, notMarkedCount,
 *                    notMarked[], hiddenCount, truncated }
 *   · `counts`     { currents, echoes, facts, people, chronicle, opinionCanon, opinionForum }
 *   ——这些字段**缺失**是常态（旧版推演侧 / 未开启对应引擎），故一律走三态读数，不当作错误。
 *
 * 【本模块**不做**什么（边界）】
 *   不做「用推演侧的世界覆盖本插件的账本」。本插件是这套体系里**记账的那一个**，
 *   主张正文为最高事实源；推演侧是**推演的那一个**。双方只交付读数与对账——
 *   不一致要可见、要能归因，但谁拍板由用户决定。故本模块全部方法均为纯读 + 纯函数。
 *
 * 桥访问复用 v3.175 的 world-clock-reader（单一真源，不重复实现桥访问）。
 * 挂 window.LonShaWorldLedgerReader，供 index.js 诊断面/快照使用。
 * ======================================================== */
'use strict';
(function (global) {
/** 与上游逐字一致的桥名（改一处即两端静默失联） */
const WORLDAXIS_BRIDGE_ID = 'worldaxis_bridge_v1';

/**
 * 取桥访问器：**优先复用** v3.175 世界钟读者面的实现（单一真源）。
 * 让它缺席时回落到本模块内的最小实现——不因为「另一个模块没加载」而整面失效。
 * 这条依赖是**软**的：复用是为了口径一致（同一套 reason 枚举），不是为了功能。
 */
function bridgeKit() {
    try {
        const k = global && global.LonShaWorldClockReader;
        if (k && typeof k.readWorldAxisSnapshot === 'function' && typeof k.getBridge === 'function') return k;
    } catch (_e) { /* 取全局失败：回落 */ }
    return null;
}
/** 回落用的最小桥访问（与 world-clock-reader 同口径：不抛、可归因） */
function fallbackGetBridge(id, win) {
    try {
        const w = win || (typeof global !== 'undefined' ? global : null);
        const b = w && w[id];
        return (b && typeof b === 'object') ? b : null;
    } catch (_e) { return null; }
}
/** 取快照（只读；优先复用世界钟读者面的实现，回落本模块最小实现） */
function readWorldSnapshot(opts) {
    opts = opts || {};
    try {
        const kit = bridgeKit();
        if (kit) return kit.readWorldAxisSnapshot(opts);
        const b = fallbackGetBridge(WORLDAXIS_BRIDGE_ID, opts.win);
        if (!b) return { ok: false, reason: 'not-mounted', source: null, snapshot: null };
        let snap = null;
        try {
            if (typeof b.snapshot === 'function') snap = b.snapshot({ reason: opts.reason || 'lonsha-ledger' });
            else if (opts.force !== false && typeof b.refresh === 'function') snap = b.refresh({ reason: opts.reason || 'lonsha-ledger' });
        } catch (_e) { snap = null; }
        if (!snap || typeof snap !== 'object') return { ok: false, reason: 'pull-failed', source: null, snapshot: null };
        return { ok: true, reason: 'ok', source: null, snapshot: snap };
    } catch (_e) {
        return { ok: false, reason: 'thrown', source: null, snapshot: null };
    }
}

/** 通用小工具（全部防御式：任何一个怪值都不得把读数搞崩） */
function arr(v) { return Array.isArray(v) ? v : []; }
function obj(v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? v : null; }
function txt(v) { return (v === undefined || v === null) ? '' : String(v); }
function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

/**
 * 快照里**某一个账本节**的三态读数。
 * @returns {{present:boolean, kind:'value'|'empty'|'absent', count:number}}
 *   为什么三态：「推演侧这一版没外供 people」与「推演侧的世界里没有人物」处置相反
 *   （前者降级、后者照常），压成一态就再也分不出来。
 *   · absent —— 快照里压根没有这个键（旧版/未开启该引擎）
 *   · empty  —— 有这个键，但值是空数组/空对象/显式 null（对方明确说「没有」）
 *   · value  —— 有内容
 */
function sectionState(snapshot, key) {
    try {
        if (!snapshot || typeof snapshot !== 'object') return { present: false, kind: 'absent', count: 0 };
        if (!Object.prototype.hasOwnProperty.call(snapshot, key)) return { present: false, kind: 'absent', count: 0 };
        const v = snapshot[key];
        if (v === null || v === undefined) return { present: true, kind: 'empty', count: 0 };
        if (Array.isArray(v)) return { present: true, kind: v.length ? 'value' : 'empty', count: v.length };
        if (typeof v === 'object') {
            const n = Object.keys(v).length;
            return { present: true, kind: n ? 'value' : 'empty', count: n };
        }
        // 标量（pulse 之类本可以是 null 也可以是对象）：有值即 value
        return { present: true, kind: 'value', count: 1 };
    } catch (_e) { return { present: false, kind: 'absent', count: 0 }; }
}

/** 本模块认的全账本节（顺序即诊断面的展示顺序） */
const LEDGER_SECTIONS = ['worldClock', 'pulse', 'digest', 'currents', 'echoes', 'facts',
    'people', 'opinion', 'counts', 'filter'];

/**
 * 全账本**形状摘要**：每一节在不在、是空的还是有内容、多少条。
 * 不搬运内容（那由各专项读数负责），只回答「推演侧到底给了我什么」。
 */
function summarizeLedger(snapshot) {
    try {
        const out = {};
        for (const k of LEDGER_SECTIONS) out[k] = sectionState(snapshot, k);
        // opinion 是三档容器，单独展开一层（canon/forum/sandbox 各有自己的在场态）
        const op = obj(snapshot && snapshot.opinion);
        out.opinionParts = {
            canon: op ? arr(op.canon).length : 0,
            forum: op ? arr(op.forum).length : 0,
            sandbox: op ? arr(op.sandbox).length : 0
        };
        return out;
    } catch (_e) {
        const out = {};
        for (const k of LEDGER_SECTIONS) out[k] = { present: false, kind: 'absent', count: 0 };
        out.opinionParts = { canon: 0, forum: 0, sandbox: 0 };
        return out;
    }
}

/**
 * 【核心 ①】**不可观测缺口**（可见性过滤的显式化）。
 *
 * WorldAxis 默认只外供「显式标记 public/public_trace」的暗流，其余落进 filter.notMarked。
 * 修前本插件完全读不到这件事——它面对的世界里，那批暗流**从未存在过**，
 * 而不是「存在、但没给我」。两种世界线的剧情推演完全不同。
 *
 * @returns {{known:boolean, exported:number, hiddenTotal:number, notMarkedCount:number,
 *            notMarked:string[], truncated:boolean, presumeUnknown:string, includeHidden:boolean,
 *            gapRatio:number, verdict:string}}
 *   verdict ∈ { no-filter（旧版无该块，缺口不可知）/ complete（无缺口）/ gapped（有未外供）/ full（全量放行） }
 *   · **no-filter 必须与 complete 分开**：「上游没告诉我有没有缺口」和「上游告诉我没缺口」
 *     是完全不同的信息量，压成一态就等于伪造了一个「没有缺口」的结论。
 */
function visibilityGap(snapshot) {
    try {
        return visibilityGapInner(snapshot);
    } catch (_e) {
        return { known: false, exported: 0, hiddenTotal: 0, notMarkedCount: 0, notMarked: [], truncated: false, presumeUnknown: '', includeHidden: false, gapRatio: 0, verdict: 'no-filter' };
    }
}
function visibilityGapInner(snapshot) {
    const f = obj(snapshot && snapshot.filter);
    if (!f) {
        return { known: false, exported: 0, hiddenTotal: 0, notMarkedCount: 0, notMarked: [], truncated: false, presumeUnknown: '', includeHidden: false, gapRatio: 0, verdict: 'no-filter' };
    }
    const exported = num(f.exportedCurrents);
    const hiddenTotal = num(f.hiddenCount);
    const notMarked = arr(f.notMarked).map(txt).filter(Boolean);
    const notMarkedCount = num(f.notMarkedCount) || notMarked.length;
    const includeHidden = f.includeHidden === true;
    let verdict;
    if (includeHidden) verdict = 'full';
    else if (notMarkedCount > 0) verdict = 'gapped';
    else verdict = 'complete';
    // 缺口率：未被外供的占比。分母用「外供 + 未标记」，避免拿 hiddenCount 当分母时
    //   与 exportedCurrents 口径不一致（两者一个是过滤后、一个是过滤前，混用会算出 >100%）。
    const denom = exported + notMarkedCount;
    const gapRatio = denom > 0 ? Number((notMarkedCount / denom).toFixed(3)) : 0;
    return {
        known: true, exported, hiddenTotal, notMarkedCount, notMarked,
        truncated: f.truncated === true, presumeUnknown: txt(f.presumeUnknown),
        includeHidden, gapRatio, verdict
    };
}

/**
 * 【核心 ②】人物位置对读：本插件的角色表 vs 推演侧的人物表。
 *
 * 这是「两个世界对不上」最具体的形态——时钟差几天只是数字，
 * 而「本插件记崔莺莺在邮局、推演侧记她在城南车站」是剧情立刻会崩的地方。
 *
 * @param {object} snapshot 推演侧快照
 * @param {object} localMap 本地人物位置表 { 角色名: 位置串 }
 * @returns {{hasWorld:boolean, hasLocal:boolean, matched:number, mismatched:Array, worldOnly:string[], localOnly:string[]}}
 *   mismatched 项：{ name, world, local }
 *   位置比对做**归一化**（去空白、取末级场所名），避免「市/城南车站」与「城南车站」被误判为不一致。
 */
function diffPeople(snapshot, localMap) {
    try { return diffPeopleInner(snapshot, localMap); }
    catch (_e) { return { hasWorld: false, hasLocal: false, matched: 0, mismatched: [], worldOnly: [], localOnly: [] }; }
}
function diffPeopleInner(snapshot, localMap) {
    const worldPeople = arr(snapshot && snapshot.people);
    const local = obj(localMap) || {};
    const hasWorld = worldPeople.length > 0;
    const hasLocal = Object.keys(local).length > 0;
    const norm = (s) => {
        const t = txt(s).replace(/\s+/g, '').trim();
        if (!t) return '';
        // 取末级场所名：「临江市/城南车站」与「城南车站」归一为同一条。
        const parts = t.split(/[/\\>»·、]/).filter(Boolean);
        return (parts[parts.length - 1] || t);
    };
    const worldLoc = new Map();
    for (const p of worldPeople) {
        const o = obj(p) || {};
        const name = txt(o.name || o.id).trim();
        if (!name) continue;
        worldLoc.set(name, txt(o.location).trim());
    }
    const localLoc = new Map();
    for (const k of Object.keys(local)) {
        const name = txt(k).trim();
        if (!name) continue;
        localLoc.set(name, txt(local[k]).trim());
    }
    const mismatched = [];
    const worldOnly = [];
    const localOnly = [];
    let matched = 0;
    for (const [name, wl] of worldLoc) {
        if (!localLoc.has(name)) { worldOnly.push(name); continue; }
        const ll = localLoc.get(name);
        const a = norm(wl), b = norm(ll);
        // 两侧都空 ⇒ 无从比对，不算不一致（缺席不是冲突）
        if (!a && !b) { matched++; continue; }
        // 一侧空、一侧有 ⇒ 是「一边没记位置」，不是「位置不同」——单列出来，不混入 mismatched。
        if (!a || !b) { mismatched.push({ name, world: wl, local: ll, kind: 'one-sided' }); continue; }
        if (a === b) { matched++; continue; }
        mismatched.push({ name, world: wl, local: ll, kind: 'conflict' });
    }
    for (const name of localLoc.keys()) {
        if (!worldLoc.has(name)) localOnly.push(name);
    }
    // 读数会被存进快照/存档，故**有界**：明细各留 12 条，另附总数（总数不失真、明细不膨胀）。
    return {
        hasWorld, hasLocal, matched,
        mismatched: mismatched.slice(0, 12), mismatchedTotal: mismatched.length,
        conflicts: mismatched.filter(m => m.kind === 'conflict').slice(0, 12),
        worldOnly: worldOnly.slice(0, 12), worldOnlyTotal: worldOnly.length,
        localOnly: localOnly.slice(0, 12), localOnlyTotal: localOnly.length
    };
}

/**
 * 【核心 ③】舆情**事实强度三分**。
 *
 * canon（已核实新闻）/ forum（论坛传闻）/ sandbox（NON-CANON 闲逛）三档，
 * 每档还带 claim（claim_status：'已核实' / '待核实' / 其它）。「能不能当事实引用」
 * 完全取决于这一档一值，故必须分开报——一锅端会让调用方拿传闻当权威事实写进剧情。
 */
function opinionStrength(snapshot) {
    try {
        const op = obj(snapshot && snapshot.opinion);
        if (!op) return { present: false, canon: 0, forum: 0, sandbox: 0, verified: 0, rumor: 0, unknown: 0, latestAt: 0 };
        const canon = arr(op.canon);
        const forum = arr(op.forum);
        const sandbox = arr(op.sandbox);
        // claim 强度判定：显式「已核实」类词才算 verified；其余非空即 rumor；
        //   空 claim 归 unknown（**不知道强度**，与「知道是传闻」处置不同）。
        let verified = 0, rumor = 0, unknown = 0;
        for (const o of canon.concat(forum)) {
            const oo = obj(o) || {};
            const c = txt(oo.claim).trim();
            if (!c) unknown++;
            else if (/已核实|已确认|确认属实|verified|canonical/i.test(c)) verified++;
            else rumor++;
        }
        return {
            present: true, canon: canon.length, forum: forum.length, sandbox: sandbox.length,
            verified, rumor, unknown, latestAt: num(op.updatedAt)
        };
    } catch (_e) { return { present: false, canon: 0, forum: 0, sandbox: 0, verified: 0, rumor: 0, unknown: 0, latestAt: 0 }; }
}

/**
 * 权威事实对读：推演侧的 `facts[]`（已结算、不再变）vs 本插件侧的事实键集。
 *
 * 「推演侧已经结算为事实」而「本插件的大纲里没有」——两边世界的**既成事实**对不上，
 * 是比时钟更硬的冲突。反之亦然。两侧都只报差集，不合并、不覆盖。
 * @param {object} snapshot
 * @param {string[]} localKeys 本插件侧的事实键（如大纲/世界推进里的条目名）
 */
function diffFacts(snapshot, localKeys) {
    try {
        const facts = arr(snapshot && snapshot.facts);
        const worldKeys = [];
        for (const f of facts) {
            const o = obj(f) || {};
            const k = txt(o.key || o.value).trim();
            if (k) worldKeys.push(k);
        }
        const local = arr(localKeys).map(txt).map(s => s.trim()).filter(Boolean);
        if (!worldKeys.length && !local.length) return { hasWorld: false, hasLocal: false, shared: 0, worldOnly: [], localOnly: [], worldOnlyTotal: 0, localOnlyTotal: 0 };
        const wset = new Set(worldKeys);
        const lset = new Set(local);
        const worldOnly = [...wset].filter(k => !lset.has(k));
        const localOnly = [...lset].filter(k => !wset.has(k));
        // 与 diffPeople 同规格：读数进快照，故明细有界（各 12 条）+ 总数不失真。
        return {
            hasWorld: worldKeys.length > 0, hasLocal: local.length > 0,
            shared: [...wset].filter(k => lset.has(k)).length,
            worldOnly: worldOnly.slice(0, 12), worldOnlyTotal: worldOnly.length,
            localOnly: localOnly.slice(0, 12), localOnlyTotal: localOnly.length
        };
    } catch (_e) { return { hasWorld: false, hasLocal: false, shared: 0, worldOnly: [], localOnly: [], worldOnlyTotal: 0, localOnlyTotal: 0 }; }
}

/**
 * 【总入口】读一份世界账本（快照 + 全部读数），供接线方一次拿全。
 * @returns {{ok:boolean, reason:string, snapshot:object|null, shape:object, gap:object,
 *            opinion:object, counts:object, worldPeople:Array, facts:Array, currents:Array}}
 *   永不抛。ok=false 时 shape/gap 等仍是**结构完整的空读数**（调用方无需判空，读到的
 *   「空」与「没读」由 reason 区分）。
 */
function readLedger(opts) {
    opts = opts || {};
    const EMPTY = {
        ok: false, reason: '', snapshot: null,
        shape: summarizeLedger(null), gap: visibilityGap(null), opinion: opinionStrength(null),
        counts: {}, worldPeople: [], facts: [], currents: []
    };
    try {
        const r = readWorldSnapshot(opts);
        if (!r || !r.ok || !r.snapshot) {
            EMPTY.reason = (r && r.reason) || 'pull-failed';
            return EMPTY;
        }
        const snap = r.snapshot;
        return {
            ok: true, reason: 'ok', snapshot: snap,
            shape: summarizeLedger(snap),
            gap: visibilityGap(snap),
            opinion: opinionStrength(snap),
            counts: obj(snap.counts) || {},
            worldPeople: arr(snap.people),
            facts: arr(snap.facts),
            currents: arr(snap.currents)
        };
    } catch (_e) {
        EMPTY.reason = 'thrown';
        return EMPTY;
    }
}

/** 一句话归因（供诊断面念出；纯读，无副作用） */
function describeLedger(ledger) {
    try {
        if (!ledger) return '未读';
        if (!ledger.ok) {
            const M = {
                'not-mounted': 'WorldAxis 未安装', 'disabled': '世界桥未启用', 'refused': '世界桥休眠',
                'no-snapshot': '桥在但尚无快照', 'pull-failed': '拉取失败',
                'contract-mismatch': '快照契约版本不一致', 'thrown': '读取抛错'
            };
            return M[ledger.reason] || txt(ledger.reason || '未知');
        }
        const c = obj(ledger.counts) || {};
        const gap = obj(ledger.gap) || {};
        const parts = [];
        parts.push('暗流 ' + num(c.currents));
        parts.push('事实 ' + num(c.facts));
        parts.push('人物 ' + num(c.people));
        parts.push('舆情 ' + (num(c.opinionCanon) + num(c.opinionForum)));
        let line = '就绪（' + parts.join(' / ') + '）';
        // 缺口必须念出来——这正是本模块存在的理由：修前「缺了多少」根本读不到。
        if (gap.verdict === 'gapped') line += '｜**未外供 ' + num(gap.notMarkedCount) + ' 条暗流**';
        else if (gap.verdict === 'no-filter') line += '｜缺口不可知（上游无 filter 块）';
        else if (gap.verdict === 'full') line += '｜全量放行';
        return line;
    } catch (_e) { return '未知'; }
}

const api = {
    WORLDAXIS_BRIDGE_ID,
    LEDGER_SECTIONS,
    bridgeKit,
    readWorldSnapshot,
    sectionState,
    summarizeLedger,
    visibilityGap,
    diffPeople,
    opinionStrength,
    diffFacts,
    readLedger,
    describeLedger
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof global !== 'undefined' && global) {
    try { global.LonShaWorldLedgerReader = Object.freeze(api); } catch (_e) { /* 有些宿主冻结全局会抛，忽略 */ }
}
return api;
})(typeof window !== 'undefined' ? window : globalThis);