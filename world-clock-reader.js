/* ========================================================
 * world-clock-reader.js — [v3.175.0] 世界钟读者面（只读）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   这套三插件体系里，上游有两个**同规格的只读世界桥**：
 *     · window.lonsha_memory_bridge_v1  —— 本插件的剧情记忆/召回账本快照（v3.88 建立）
 *     · window.worldaxis_bridge_v1      —— WorldAxis 的世界状态快照（世界钟/暗流/权威事实/舆情）
 *   而本插件侧实测：全库 grep `WorldAxis` / `worldaxis` / `worldaxis_bridge_v1` —— **零命中**（产品代码）。
 *   后果是一个真现场，不是假设：**同一场剧情里坐着两个「现在」**。
 *     · GameClock 的日期由正文时间标签（bbs_start/bbs_end）、LLM 提取的 story_date、
 *       手机时间管理器回填三条路校准，全部是「从正文/上下文里读」；
 *     · WorldAxis 的世界钟是**推演结果**（决策时间，进存档、参与判定），它就在快照里没人读。
 *   两个钟各走各的，谁也发现不了谁不一致——本插件作为这套体系里**唯一记账的那一个**，
 *   却发现不了「另一个插件认为现在是几号」。
 *
 * 【本模块的职责】
 *   把「读 WorldAxis 世界钟」收敛为单一真源，并**只**做三件事：
 *     ① 只读：只调 bridge.snapshot() / bridge.stat()，绝不写世界状态（上游本就不给写路径）；
 *     ② 不抛：桥未装 / 未启用 / 旧版无字段 / 快照畸形 / 宿主 getter 抛异常，一律降级为
 *        {ok:false, reason}，绝不把异常抛给调用方；
 *     ③ 不猜：把不可用**如实**报出来（reason 可归因），不静默编造一个时间顶替。
 *
 * 【为什么降级必须带 reason（而不是直接返回 null）】
 *   本项目反复治理的缺陷形态就是「静默降级」：拿不到数据与「这个世界没有时间」同形，
 *   调用方只能一律当「没数据」处理，于是「桥没装」「桥装了但没开」「快照畸形」三种
 *   完全不同的处境在界面上长得一模一样。WorldAxis v2.16 的桥**默认休眠**
 *   （settings.enabled === false ⇒ snapshot() 返回 null，由 stat().refused 归因），
 *   故「未启用」必须单独成态——用户能据此知道该去开哪个开关，而不是以为功能坏了。
 *
 * 【与上游规格对齐（本模块判据的全部依据，逐条对上游源码核过）】
 *   · `BRIDGE_ID = 'worldaxis_bridge_v1'` / `BRIDGE_VERSION = 1`（engines/bridge.js:43-44）；
 *   · 外部**读取面只有两个**：`snapshot()`（深拷贝 + 去抖）与 `refresh()`（「我知道世界变了，请重建」），
 *     真正的写侧入口是 `publish` / `invalidate` / `setSettings`——本模块只调读取面，一个写侧入口都不碰；
 *   · `settings()` / `stat()` 也会被外部调用（诊断节、健康分、宿主侧探测），同规格不抛；
 *   · 默认休眠：`settings().enabled === false` ⇒ 两个读取面都返回 null，并累计 `stat().refused`
 *     与 `stat().lastRefusal = { reason: 'disabled', at }`——这就是「未启用」必须单独成态的依据。
 *
 * 【与手机端的规格对齐】
 *   本模块的读者侧口径与 RubyPhone `config/world-bridge.js`（v2.35.0）**同规格**：
 *   同一套 reason 枚举、同一条「只读/不抛/不猜」纪律、同一个「纪元不相容就让路」判定。
 *   两个宿主对同一个桥的读法一致，才不会出现「手机认为桥没开、记忆认为桥没装」。
 *
 * 【本模块**不做**什么（边界）】
 *   不做「用世界钟覆盖本插件时钟」。本插件的既有主张是**正文为最高事实源**
 *   （v3.72 时间标签协议、v3.94 注释回读、v3.130 标签闭环），世界钟是**推演**而非正文事实。
 *   故本模块只交付**读数与对账**：不一致要可见、要能归因，但覆盖与否由调用方决定。
 *   本插件在这套体系里的角色是**记账的那一个**，不是拍板的那一个。
 *
 * 挂 window.LonShaWorldClockReader，供 index.js GameClock / 诊断面使用。
 * ======================================================== */
'use strict';
(function (global) {
/** 桥的全局挂载名（与上游 id 常量逐字一致，改一处即两端同时失联） */
const WORLDAXIS_BRIDGE_ID = 'worldaxis_bridge_v1';
/**
 * 本读者面所认的**上游契约版本**（WorldAxis `engines/bridge.js` 的 `BRIDGE_VERSION`）。
 * 上游升版即意味着快照形状可能变（字段改名/语义改），本地若静默按旧契约解读，
 * 会读到「像是对的」的值——这类缺陷两端都不会报错。故显式校验：
 *   · 快照**显式带** version 且不等于本值 ⇒ 降级 reason='contract-mismatch'（可归因）；
 *   · 快照**没有** version 字段 ⇒ 放行（旧版/精简版宿主；与 label/dayIndex 同口径的宽松）。
 */
const BRIDGE_VERSION = 1;
/** 读取用的 window（显式注入，便于无头测试；运行时不传即取全局） */
function resolveWin(win) {
    if (win) return win;
    try { return (typeof global !== 'undefined' && global) || globalThis; } catch (_e) { return null; }
}
/** 安全取桥对象（不存在即 null，绝不因宿主怪异的 getter 抛出去） */
function getBridge(id, win) {
    try {
        const w = resolveWin(win);
        const b = w && w[id];
        return (b && typeof b === 'object') ? b : null;
    } catch (_e) { return null; }
}
/**
 * 桥的**来源归因**读数（只读，不拉快照）。
 * @returns {{ mounted:boolean, enabled:boolean|null, hasSnapshot:boolean, stat:object|null,
 *             refused:boolean, refuses:number, reason:string }}
 *   mounted     —— 桥对象在不在全局上（不在 ⇒ 插件未安装/未加载）
 *   enabled     —— 桥自身开关（null 表示桥没有 settings() 口，无从判断）
 *   hasSnapshot —— 桥是否已经有可外供的快照
 *   refused/refuses —— 桥是否拒绝了读取（WorldAxis 默认休眠就是这条路径）
 *   reason      —— 一句话归因（not-mounted / disabled / refused / no-snapshot / ready）
 */
function bridgeSource(id, win) {
    // 整函数兜底：本函数对调用方的契约是「只读探针，永不抛」。
    //   `stat()` 若返回一个带抛错 getter 的对象，`Number(stat.refused)` 就在无 try 的那行上外抛。
    try { return bridgeSourceInner(id, win); }
    catch (_e) { return { mounted: false, enabled: null, hasSnapshot: false, stat: null, refused: false, refuses: 0, reason: 'probe-threw' }; }
}
function bridgeSourceInner(id, win) {
    const b = getBridge(id, win);
    if (!b) {
        return { mounted: false, enabled: null, hasSnapshot: false, stat: null, refused: false, refuses: 0, reason: 'not-mounted' };
    }
    let enabled = null;
    try {
        if (typeof b.settings === 'function') {
            const s = b.settings();
            enabled = !(s && s.enabled === false);
        }
    } catch (_e) { enabled = null; }
    let stat = null;
    try { stat = (typeof b.stat === 'function') ? (b.stat() || null) : null; } catch (_e) { stat = null; }
    let hasSnapshot = false;
    try { hasSnapshot = !!(b.snapshot !== undefined && b.snapshot !== null); } catch (_e) { hasSnapshot = false; }
    const refused = !!(stat && stat.lastRefusal);
    const refuses = (stat && Number(stat.refused)) || 0;
    let reason = 'ready';
    if (enabled === false) reason = 'disabled';
    else if (refused) reason = 'refused';
    else if (!hasSnapshot) reason = 'no-snapshot';
    return { mounted: true, enabled, hasSnapshot, stat, refused, refuses, reason };
}
/**
 * 取 WorldAxis 的世界状态快照（只读；深拷贝由上游保证）。
 * @param {{reason?:string, win?:object, force?:boolean}} opts
 * @returns {{ ok:boolean, reason:string, source:object, snapshot:object|null }}
 *   永不抛；拿不到快照时 ok=false 且 reason ∈
 *   { not-mounted, disabled, refused, no-snapshot, pull-failed }
 */
function readWorldAxisSnapshot(opts = {}) {
    // 整函数兜底：`opts.win` 若是个带抛错 getter 的宿主对象，取它就已经抛了——
    //   而本方法对调用方的契约是「永不抛」（与上游 snapshot() 同规格）。
    try {
        const win = opts.win;
        const src = bridgeSource(WORLDAXIS_BRIDGE_ID, win);
        if (!src.mounted) return { ok: false, reason: 'not-mounted', source: src, snapshot: null };
        if (src.enabled === false) return { ok: false, reason: 'disabled', source: src, snapshot: null };
        const b = getBridge(WORLDAXIS_BRIDGE_ID, win);
        let snap = null;
        try {
            // 优先 snapshot()（带 debounce 的外供口）；旧版/精简版只有 refresh() 时退而求其次。
            //   注：refresh() 不是写侧入口——上游文档写明「snapshot 与 refresh 是本桥唯一的两个
            //   外部读取面」（snapshot 给外部读、refresh 给外部『我知道世界变了，请重建』）。
            //   真正的写侧入口是 publish / invalidate / setSettings，本模块一个都不碰。
            if (typeof b.snapshot === 'function') snap = b.snapshot({ reason: opts.reason || 'lonsha-pull' });
            else if (opts.force !== false && typeof b.refresh === 'function') snap = b.refresh({ reason: opts.reason || 'lonsha-pull' });
        } catch (_e) { snap = null; }
        if (!snap || typeof snap !== 'object') {
            return { ok: false, reason: src.refused ? 'refused' : 'pull-failed', source: src, snapshot: null };
        }
        // 契约版本：只拦**显式**不匹配（缺失视为旧版/精简版，放行）。
        try {
            if (snap.version !== undefined && snap.version !== null && Number(snap.version) !== BRIDGE_VERSION) {
                return { ok: false, reason: 'contract-mismatch', source: src, snapshot: null };
            }
        } catch (_e) { /* 怪异 getter：不因校验本身把读取搞崩，按放行处理 */ }
        return { ok: true, reason: 'ok', source: src, snapshot: snap };
    } catch (_e) {
        return { ok: false, reason: 'thrown', source: null, snapshot: null };
    }
}
const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2}))?/;
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
/**
 * 把 WorldAxis 快照里的 `worldClock` 解析成可消费的时间对象。
 *
 * 世界钟是**决策时间**（进存档、参与判定），比「从正文里猜」权威；
 * 但它是公历 ISO，故只在能解析出合法日期时才返回；否则返回 null（调用方退回原路径，不猜）。
 */
function readWorldClock(snapshot) {
    try {
        const wc = snapshot && snapshot.worldClock;
        if (!wc || typeof wc !== 'object') return null;
        const iso = String(wc.iso || '').trim();
        const m = ISO_RE.exec(iso);
        if (!m) return null;
        const year = Number(m[1]);
        const month = Number(m[2]);
        const day = Number(m[3]);
        // \d{1,2} 本就允许 13 月 / 40 日，本行是唯一防线——不可省。
        if (!(year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
        const hh = String(Math.min(23, Math.max(0, m[4] === undefined ? 0 : Number(m[4])))).padStart(2, '0');
        const mm = String(Math.min(59, Math.max(0, m[5] === undefined ? 0 : Number(m[5])))).padStart(2, '0');
        const dt = new Date(year, month - 1, day, Number(hh), Number(mm));
        return Object.freeze({
            date: `${year}年${String(month).padStart(2, '0')}月${String(day).padStart(2, '0')}日`,
            time: `${hh}:${mm}`,
            weekday: WEEKDAYS[dt.getDay()],
            iso,
            dayIndex: Number(wc.dayIndex) || 0,
            label: String(wc.label || ''),
            source: String(wc.source || 'worldaxis'),
            // ISO 形态即公历；走古历纪年的世界钟其 iso 会是空串或非 ISO 串 ⇒ 上面直接返回 null。
            calendar: 'gregorian',
            timestamp: dt.getTime()
        });
    } catch (_e) { return null; }
}
/**
 * 判一个**日期字符串**属于哪种历法形态。
 * 本插件时钟（GameClock.date）可能是 '2026-09-13' / '2026年9月13日'（公历），
 * 也可能是 '天顺三年春' / '霜月3日'（古历或架空历）。
 * @returns {'gregorian'|'unknown'}
 *   unknown 不是「错」，是「本插件无从把它与公历对齐」——恰是让路的依据。
 */
function clockEra(dateStr) {   // [pure] 只做字符串匹配，无任何属性访问风险
    const s = String(dateStr || '').trim();
    if (!s) return 'unknown';
    // 公历形态：以 1~4 位数字年 + 分隔符开头。
    if (/^\d{1,4}\s*[-/年.]\s*\d{1,2}/.test(s)) return 'gregorian';
    return 'unknown';
}
/**
 * 两个钟的对账（纯函数，不读任何全局）。
 *
 * 这是本模块存在的**全部理由**：本插件此前连「另一个插件认为现在是几号」都不知道，
 * 于是「两个世界对不上」这件事在本插件侧**完全不可观测**。
 */
function diffClocks(worldDate, storyDate) {
    try { return diffClocksInner(worldDate, storyDate); }
    catch (_e) { return { comparable: false, verdict: 'unparsable', days: null, worldEra: 'unknown', storyEra: 'unknown' }; }
}
function diffClocksInner(worldDate, storyDate) {
    const worldEra = clockEra(worldDate);
    const storyEra = clockEra(storyDate);
    const parse = (s) => {
        const m = /^(\d{1,4})\s*[-/年.]\s*(\d{1,2})\s*[-/月.]\s*(\d{1,2})/.exec(String(s || '').trim());
        if (!m) return null;
        const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
        if (!(y >= 1 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31)) return null;
        return Date.UTC(y, mo - 1, d) / 86400000;
    };
    const a = parse(worldDate), b = parse(storyDate);
    if (a === null || b === null) {
        // 历法不相容优先于「解析不了」：一侧古历一侧公历，这不是数据缺失，是两个坐标系。
        //   **但缺席不是历法**：某一侧压根没有日期（空串 / 尚未设定）时，那不是「两个坐标系」，
        //   是「没有可比的那一天」。把「空」报成 incompatible-era 会让调用方以为「两边说法不同」，
        //   而真相是「其中一边还没说话」——两种处置（等它 / 报冲突）完全相反。
        const wRaw = String(worldDate || '').trim();
        const sRaw = String(storyDate || '').trim();
        if (wRaw && sRaw && (worldEra === 'gregorian') !== (storyEra === 'gregorian')) {
            return { comparable: false, verdict: 'incompatible-era', days: null, worldEra, storyEra };
        }
        return { comparable: false, verdict: 'unparsable', days: null, worldEra, storyEra };
    }
    if (worldEra !== storyEra) {
        // 两侧都解析成功但历法形态判定不同（如 storyDate 缺年份）——按不相容处理，不硬比。
        return { comparable: false, verdict: 'incompatible-era', days: null, worldEra, storyEra };
    }
    const days = b - a;   // 正 = 世界钟比本插件早（本插件走在前）；负 = 世界钟在前
    let verdict = 'same';
    if (days > 0) verdict = 'world-behind';   // 世界钟落后于本插件
    else if (days < 0) verdict = 'world-ahead';   // 世界钟领跑本插件
    // days 的符号容易被读反（「+3 天」到底是世界钟早还是晚），故把两个纪元日原始值一并给出：
    // 调用方永远可以自己减，不必猜符号口径。
    return { comparable: true, verdict, days, worldEpochDay: a, storyEpochDay: b, worldEra, storyEra };
}
/** 一句话归因（供诊断面念出；纯读） */
function describeRead(read) {
    try { return describeReadInner(read); } catch (_e) { return '未知'; }
}
function describeReadInner(read) {
    if (!read) return '未读';
    if (read.ok) return read.worldClock ? `就绪（${read.worldClock.date}）` : '就绪但快照无世界钟';
    const M = {
        'not-mounted': 'WorldAxis 未安装',
        'disabled': '世界桥未启用（WorldAxis 侧开关）',
        'refused': '世界桥拒绝读取（休眠）',
        'no-snapshot': '桥在但尚无快照',
        'pull-failed': '拉取失败'
    };
    return M[read.reason] || String(read.reason || '未知');
}
const api = {
    WORLDAXIS_BRIDGE_ID,
    getBridge,
    bridgeSource,
    readWorldAxisSnapshot,
    readWorldClock,
    clockEra,
    diffClocks,
    describeRead
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof global !== 'undefined' && global) {
    try { global.LonShaWorldClockReader = Object.freeze(api); } catch (_e) { /* 有些宿主冻结全局会抛，忽略 */ }
}
return api;
})(typeof window !== 'undefined' ? window : globalThis);