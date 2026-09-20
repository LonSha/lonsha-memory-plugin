/* ========================================================
 * age-anchor.js — [v3.180.0] 年龄锚点（AI 填岁数，系统盖时间；时间一跳，自动长岁）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件 v3.148 已经在**主角**上做了 ageAnchorTime（`index.js:10905`），
 *   但实测有三处没封口：
 *     ① **没有唯一实现**：锚点的盖章 / 判定 / 推算全写在 index.js 的 setProtagonist /
 *        getEffectiveAge 里，别处想用只能用主角那一份——**角色（NPC）完全没有锚点**：
 *        全库 grep `characters[..].ageAnchor` / NPC 侧锚点字段 —— 零命中；
 *     ② **没有原子对不变式**：`age` 与 `ageAnchorTime` 是两份独立写入。实测形态：
 *        年龄被改成 30，锚点还留着两年前的日期 ⇒ 显示「约32岁」，而用户明明刚写死 30。
 *        柏宝书把这一对做成**原子对**（`applyAge`：写 age 必同时写锚点、清 age 必同时清锚点），
 *        结构上不可能出现「新年龄 + 旧锚点」；
 *     ③ **没有「算不出就不猜」的第三态**：v3.148 的 getEffectiveAge 算不出时**回退静态值**，
 *        与「算出来了，就是这么大」在读数上同形。柏宝书 ageDisplay 的第三态是
 *        `原文(锚点时)`——把「我算不出」如实写在展示里，读者一眼看出这是原值不是推算值。
 *
 * 【本模块的职责（三条不变式，可单测）】
 *   ① **原子对**：`stampAge()` 是唯一写入口。有 age 必同时有锚点；清空 age 必同时清锚点。
 *      「新年龄 + 旧锚点」这种中间态在本模块里**写不出来**。
 *   ② **守恒**：`carryAge()` 供更新路径用——**年龄没变则连旧锚点一起带走**。
 *      不做这一步，重放会把锚点刷成「本次提取的故事时间」，等于**冻龄**
 *      （柏宝书 `apply.ts:2021` 踩过并明确注释了这一点）。
 *   ③ **三态可见**：`ageDisplay()` 返回 `{text, state, age}`，
 *      state ∈ `exact`（不足一年/无锚点，原值即准）| `estimated`（≥一年，已推算）|
 *      `anchor-only`（算不出，原文 + 锚点标注，**不猜**）。
 *
 * 【本模块**不做**什么（边界）】
 *   不做注入格式。展示串由调用方决定（本插件的注入板块有自己的排版）；
 *   本模块只交付「这个年龄现在到底是多少、以及这个数字是怎么来的」。
 *
 * 【与上游规格对齐（逐条对柏宝书源码核过）】
 *   · `applyAge`（src/memory/apply.ts:767）：`n.ageTime = a ? (src.ageTime?.trim() || storyTime || undefined) : undefined;`
 *   · `ageDisplay`（src/memory/timeRel.ts:404）：`days<365 ⇒ raw`；`days>=365 && num!=null ⇒ 约{num+⌊days/365⌋}岁`；
 *     否则 `raw(锚点)`。
 *
 * 挂 window.LonShaAgeAnchor，供 index.js 主角档案 / 角色状态表 / 注入板块使用。
 * ======================================================== */
'use strict';
(function (global) {
/** 锚点与年龄所在的字段名（主角与角色共用同一对名字，避免两套记法）。 */
const AGE_FIELD = 'age';
const ANCHOR_FIELD = 'ageAnchorTime';
/** 一年按 365 天算（与柏宝书 calculaterelativeDays 口径一致：只做「约」的换算，不做历法精确）。 */
const DAYS_PER_YEAR = 365;

/** 从年龄文本里抽出数值（'38' → 38；'约38岁' → 38；'1986-03-02' → 1986（视为年份，不是岁数））。 */
function parseAgeNumber(raw) {
    const m = /(\d{1,3})/.exec(String(raw || ''));
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
}
/** 年龄文本是否形如**日期/年份**（出生日期口径）而非岁数。 */
function looksLikeDate(raw) {
    const s = String(raw || '').trim();
    return /\d{3,}/.test(s) || /[\/\-.]/.test(s) || /年/.test(s);
}
/**
 * 锚点短标（'2024年3月15日' → '2024年3月'）。取不到可辨认的部分则返回 ''，
 * 调用方据此决定要不要带括注——**标注不出来就不标**，不带一个空的括号。
 */
function anchorLabel(anchor) {
    const s = String(anchor || '').trim();
    if (!s) return '';
    const m = /(\d{1,4})\s*[年\-\/.]\s*(\d{1,2})?/.exec(s);
    if (m) return m[2] ? `${m[1]}年${Number(m[2])}月` : `${m[1]}年`;
    const mm = /(\d{1,2})\s*月/.exec(s);
    return mm ? `${Number(mm[1])}月` : '';
}
/**
 * 两个剧情日期之间的天数差（缺省用宿主 RelativeTimeHelper；解析不出返回 null）。
 * parseFn 可注入（单测走纯函数），返回 {year,month,day} 形状或 null。
 */
function dayDiff(from, to, parseFn) {
    try {
        const a = parseFn ? parseFn(from) : null;
        const b = parseFn ? parseFn(to) : null;
        if (!a || !b) return null;
        if (a.type && a.type !== 'standard') return null;
        if (b.type && b.type !== 'standard') return null;
        const da = Date.UTC(a.year ?? 2000, (a.month ?? 1) - 1, a.day ?? 1);
        const db = Date.UTC(b.year ?? 2000, (b.month ?? 1) - 1, b.day ?? 1);
        const d = Math.round((db - da) / 86400000);
        return Number.isFinite(d) ? d : null;
    } catch (_e) { return null; }
}

/**
 * ★唯一写入口：把年龄**连同锚点**写进目标对象（原子对）。
 * 契约（对齐柏宝书 applyAge，逐条）：
 *   · age 有值 → age 落值，锚点 = 显式给的锚点 || storyTime；两者都取不到则**不写锚点**
 *     （宁可没有锚点，也不用一个假的把年龄钉死——这与「不猜」纪律同源）；
 *   · age 为空字符串 / null → **年龄与锚点一起清掉**（用户清空输入＝清空这条信息，
 *     不是「保留旧值」，也不是「留一个孤儿锚点」）；
 *   · age 未提供（undefined）→ 两字段都不动（未提供 ≠ 置空）。
 * 返回 {age, anchor, changed}——changed=false 表示这次调用一个字段都没改（读数可归因）。
 */
function stampAge(target, ageValue, storyTime, opts = {}) {
    const out = { age: undefined, anchor: undefined, changed: false };
    try {
        if (!target || typeof target !== 'object') return out;
        if (ageValue === undefined) {           // 未提供：不动
            out.age = target[AGE_FIELD]; out.anchor = target[ANCHOR_FIELD];
            return out;
        }
        const s = ageValue === null ? '' : String(ageValue).trim();
        if (!s) {                               // 显式置空：成对清掉
            const had = (target[AGE_FIELD] !== undefined && target[AGE_FIELD] !== '') || !!target[ANCHOR_FIELD];
            delete target[AGE_FIELD];
            delete target[ANCHOR_FIELD];
            out.changed = !!had;
            return out;
        }
        const prevAge = target[AGE_FIELD];
        const anchor = String(opts.anchor || storyTime || '').trim();
        target[AGE_FIELD] = s;
        if (anchor) target[ANCHOR_FIELD] = anchor;
        else delete target[ANCHOR_FIELD];       // 取不到锚点：不写假的（也不留旧的）
        out.age = s; out.anchor = target[ANCHOR_FIELD] || '';
        out.changed = (prevAge !== s) || (String(opts.anchor || '') !== '');
        return out;
    } catch (_e) { return out; }
}

/**
 * 更新路径用：**年龄没变就连旧锚点一起带走**（柏宝书 apply.ts:2021 的同一条纪律）。
 * 为什么必须有：重放/重提取会把「本次的故事时间」当成锚点盖上，
 * 若年龄本来就来自两年前那次提取，锚点被刷成今天 ⇒ **冻龄**（年龄永远显示第一次填的值）。
 * 返回 {age, anchor}（anchor 为 undefined 表示「本次真的改了年龄，请盖新锚点」）。
 */
function carryAge(patch, prev) {
    const out = { age: undefined, anchor: undefined, isNewAge: false };
    try {
        const p = patch || {}; const v = prev || {};
        const hasPatch = p[AGE_FIELD] !== undefined;
        const age = hasPatch ? (p[AGE_FIELD] === null ? '' : String(p[AGE_FIELD]).trim()) : String(v[AGE_FIELD] ?? '').trim();
        out.age = age;
        if (!age) { out.anchor = undefined; return out; }
        // 未提供 或 与旧值相同 ⇒ 连旧锚点一起带走；显式提供且不同 ⇒ 是新年龄
        const sameAsPrev = String(v[AGE_FIELD] ?? '').trim() === age;
        if ((!hasPatch || sameAsPrev) && v[ANCHOR_FIELD]) {
            out.anchor = String(v[ANCHOR_FIELD]);
        } else {
            out.isNewAge = true;                 // 留空 ⇒ 由调用方盖当前故事时间
        }
        return out;
    } catch (_e) { return out; }
}

/**
 * 展示读数：**三态可分辨**。
 *   state='exact'        —— 原值即准（无锚点 / 无当前时间 / 不足一年）
 *   state='estimated'    —— 已按锚点推算（跨了 ≥1 年）
 *   state='anchor-only'  —— 算不出，给「原文(锚点)」，**不猜一个数字出来**
 * 返回 { text, state, age, anchor, days }——调用方既能直接展示 text，
 * 也能据 state 决定「要不要加『约』」（错误形态：把估算值当精确值用）。
 */
function ageDisplay(age, anchor, now, opts = {}) {
    const raw = String(age ?? '').trim();
    const out = { text: raw, state: 'exact', age: raw, anchor: String(anchor || '').trim(), days: null };
    if (!raw) { out.text = ''; return out; }
    const a = String(anchor || '').trim();
    const cur = String(now || '').trim();
    if (!a || !cur) return out;                                   // 两态其一缺失：原值即准
    // 出生日期口径：交给调用方的 calcAge（本插件 clock.calcAge 已有实现）
    if (looksLikeDate(raw)) {
        try {
            const n = typeof opts.calcAge === 'function' ? opts.calcAge(raw, cur) : null;
            if (Number.isFinite(n) && n > 0 && n < 200) { out.text = String(n); out.state = 'estimated'; out.age = String(n); }
            else { const lb = anchorLabel(a); out.text = lb ? `${raw}(${lb}时)` : raw; out.state = 'anchor-only'; }
        } catch (_e) { out.state = 'exact'; }
        return out;
    }
    const days = dayDiff(a, cur, opts.parseFn);
    out.days = days;
    const num = parseAgeNumber(raw);
    if (days == null) { const lb = anchorLabel(a); out.text = lb ? `${raw}(${lb}时)` : raw; out.state = 'anchor-only'; return out; }
    if (days < 0) { const lb = anchorLabel(a); out.text = lb ? `${raw}(${lb}时)` : raw; out.state = 'anchor-only'; return out; }  // 时间倒流：不猜
    if (days < DAYS_PER_YEAR) return out;                          // 不足一年：原样
    if (num != null) {
        const est = num + Math.floor(days / DAYS_PER_YEAR);
        const lb = anchorLabel(a);
        out.text = lb ? `约${est}岁(${lb}时${num}岁)` : `约${est}岁`;
        out.state = 'estimated'; out.age = String(est);
        return out;
    }
    const lb = anchorLabel(a);
    out.text = lb ? `${raw}(${lb}时)` : raw; out.state = 'anchor-only';
    return out;
}

/**
 * 不变式检查（供审计与测试）：返回违规清单。
 *   I1 有 age 无锚点（系统本该盖，没盖）——不算致命（锚点缺失时展示仍可用），单列。
 *   I2 有锚点无 age（孤儿锚点）——**致命**：这正是「清空年龄留下旧锚点」的形态。
 *   I3 锚点不是字符串 / 是空串。
 */
function checkInvariants(obj) {
    const bad = [];
    try {
        if (!obj || typeof obj !== 'object') return bad;
        const age = obj[AGE_FIELD];
        const anchor = obj[ANCHOR_FIELD];
        const hasAge = age !== undefined && age !== null && String(age).trim() !== '';
        const hasAnchor = anchor !== undefined && anchor !== null && String(anchor).trim() !== '';
        if (hasAnchor && !hasAge) bad.push('I2:orphan-anchor');
        if (hasAge && !hasAnchor) bad.push('I1:missing-anchor');
        if (anchor !== undefined && typeof anchor !== 'string') bad.push('I3:anchor-not-string');
    } catch (_e) { bad.push('I0:thrown'); }
    return bad;
}

const api = { AGE_FIELD, ANCHOR_FIELD, DAYS_PER_YEAR, parseAgeNumber, looksLikeDate, anchorLabel, dayDiff, stampAge, carryAge, ageDisplay, checkInvariants };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof global !== 'undefined' && global) {
    try { global.LonShaAgeAnchor = Object.freeze(api); } catch (_e) { /* 忽略 */ }
}
return api;
})(typeof window !== 'undefined' ? window : globalThis);