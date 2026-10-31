/* ============================================================
 * tests/audit/_realhost_judge.mjs —— L12-O5 真宿主三块读数的**判定体**（纯函数）
 * ------------------------------------------------------------
 * 【为什么把判定从探针里拆出来】
 *   `_realhost_suite.mjs` 是**探针**：它需要真 Chromium + 真 SillyTavern 才能跑，
 *   而本仓纪律是「真宿主读数不进 npm test」。如果判定逻辑长在探针体内，那么
 *   「判据到底判得对不对」就**只能靠真宿主验证** —— 环境一缺，判据变成不可证伪的死文本。
 *   本仓治过这一类：不是判据，是「写在代码里的能力」。
 *   拆成纯函数后，判据可以在**合成读数**上离线证伪，也可以在**真源码破坏副本**上
 *   证明它真的承重（`v3428_l12_o5_realhost_suite.test.mjs` 的 N 段）。
 *
 * 【三块读数各自的口径（全部来自计划原文的验收条件）】
 *   ① load 装载面：`LonSha*` 全局数 ≥ MIN_GLOBALS、`_extraJsLoad.status === 'ok'`、
 *      面板入口在位。它回答「插件在真宿主里到底装起来没有」—— v3.300.0 之前
 *      宿主根本不加载 `extra_js`，这类失效只有真宿主能看见。
 *   ② write 写盘闭环：同会话真落盘 / await 期间切聊 ⇒ 必须 `false` + `deferred` +
 *      不推进 `_confirmed` + 当前会话不留一个字节 / 任何落盘那一刻
 *      「格子里的 chatId」必须等于「当前会话」。
 *      ★ 错档判据刻意不依赖返回值：返回 true/false 是**声明**，
 *        `slotChatId !== curChatId` 是**字节级事实**。
 *   ③ worldline 世界线纪元：α 1–39 → β 40–46 → 回跳 α 47–87，在第 60 楼看：
 *      第一纪元条目 `blocked`、本纪元 `kept`、中间纪元 `blocked`、
 *      既无楼层也无线标 `undecided`；且 `worldlineStartFloor` **留空**时
 *      宿主必须自动推进（`epochAdvance.applied === true`）。
 *
 * 【纪律】
 *   · 纯函数：不读盘、不读环境、不改入参、不抛（缺字段按「读数不成立」记缺陷，不崩）。
 *   · 每条缺陷都带**可读归因**：说清「哪一格、期望什么、实测什么」。
 *   · 缺读数 ≠ 通过：字段缺席一律记缺陷（`undefined` 与 `false` 都是「没读到」）。
 * ============================================================ */

/** 真宿主装载面下限（计划原文：`moduleGlobalCount ≥ 85`）。 */
export const MIN_GLOBALS = 85;

const isObj = (v) => !!v && typeof v === 'object';
const show = (v) => {
    try { return JSON.stringify(v); } catch (_e) { return String(v); }
};

/**
 * 块 ① 装载面。
 * @param {object} load 读数字段见 `_realhost_suite.mjs` 的 `note('load', …)`
 * @returns {string[]} 缺陷列表（空 = 成立）
 */
export function judgeLoad(load) {
    const bad = [];
    const L = isObj(load) ? load : {};
    if (typeof L.globals !== 'number') {
        bad.push('装载面读数缺 globals（真宿主里一个 LonSha* 全局都没数出来）；实 ' + show(L.globals));
    } else if (!(L.globals >= MIN_GLOBALS)) {
        bad.push('LonSha* 全局数 ' + L.globals + ' < ' + MIN_GLOBALS + ' —— 插件模块没挂齐（真宿主装载面塌陷）');
    }
    if (L.status !== 'ok') {
        bad.push('_extraJsLoad.status = ' + show(L.status) + '（期望 ok）；失败项 ' + show(L.fails || []));
    }
    if (L.hasUI !== true) {
        bad.push('真页面里 showSettingsPanel 不可用 —— 面板入口没挂上');
    }
    return bad;
}

/**
 * 块 ② 写盘闭环。
 * @param {object} write
 * @returns {string[]}
 */
export function judgeWrite(write) {
    const bad = [];
    const W = isObj(write) ? write : {};
    const same = isObj(W.same) ? W.same : {};
    const swap = isObj(W.swap) ? W.swap : {};
    const drain = isObj(W.drain) ? W.drain : {};

    if (same.ret !== true) bad.push('同会话主流路径必须回 true（实 ' + show(same.ret) + '）');
    if (same.markInCurrentAfter !== true) bad.push('同会话正常落盘必须真的写进当前会话（markInCurrentAfter 实 ' + show(same.markInCurrentAfter) + '）');

    if (swap.ret !== false) bad.push('await 期间切聊 ⇒ 本批不得回 true（实 ' + show(swap.ret) + '）');
    if (swap.markInCurrentAfter !== false) bad.push('await 期间切聊 ⇒ 当前会话里不得留下本批数据（一个字节都没落地）');
    if (swap.confirmed !== null) bad.push('await 期间切聊 ⇒ 不得推进 _confirmed（实 ' + show(swap.confirmed) + '）');
    if (swap.entryStatus !== 'deferred') bad.push('await 期间切聊 ⇒ 批次归宿必须如实记 deferred（实 ' + show(swap.entryStatus) + '）');

    /* 错档的直接形状：任何一次落盘那一刻，格子里的 chatId 必须等于当时的当前会话。 */
    const calls = Array.isArray(drain.calls) ? drain.calls : [];
    if (calls.length === 0) {
        bad.push('排队批读数缺 drain.calls —— 一次落盘点都没观测到（探针没接上观测点，读数不可信）');
    } else {
        const misrouted = calls.filter((c) => isObj(c)
            && c.slotChatId !== null && c.curChatId !== null
            && String(c.slotChatId) !== String(c.curChatId));
        if (misrouted.length) {
            bad.push('出现「写进别的会话」的落盘：' + show(misrouted));
        }
    }
    return bad;
}

/**
 * 块 ③ 世界线纪元。
 * @param {object} wl
 * @returns {string[]}
 */
export function judgeWorldline(wl) {
    const bad = [];
    const D = isObj(wl) ? wl : {};
    const buckets = isObj(D.buckets) ? D.buckets : {};
    /* 四格期望：每格都写清「为什么必须是它」—— 归因面与判据面同源。 */
    const want = [
        ['era1', 'blocked', '第一纪元记忆在第 60 楼必须被挡（同号跨纪元不串）'],
        ['now', 'kept', '本纪元记忆必须放行（修法不得误伤同纪元）'],
        ['beta', 'blocked', '中间纪元记忆必须被挡'],
        ['nolocate', 'undecided', '既无楼层也无线标的条目必须判不了，不许冒充本纪元'],
    ];
    for (const [key, bucket, why] of want) {
        const got = buckets[key];
        if (!isObj(got)) { bad.push(key + ' 没出现在任何桶里 —— ' + why); continue; }
        if (got.bucket !== bucket) {
            bad.push(key + ' 落在 ' + show(got.bucket) + '（期望 ' + bucket + '）—— ' + why
                + '；理由码 ' + show(got.why));
        }
    }
    const adv = isObj(D.epochAdvance) ? D.epochAdvance : {};
    if (adv.applied !== true) {
        bad.push('未填 worldlineStartFloor 时宿主必须自动推进纪元（epochAdvance.applied 实 '
            + show(adv.applied) + '，why=' + show(adv.why) + '）');
    }
    if (adv.conflict) {
        bad.push('层标记与跳跃表冲突：' + show(adv.conflict));
    }
    return bad;
}

/**
 * 收尾：真页面未捕获异常。
 * @param {string[]} pageErrors
 * @returns {string[]}
 */
export function judgePageErrors(pageErrors) {
    const bad = [];
    const list = Array.isArray(pageErrors) ? pageErrors : null;
    if (list === null) {
        bad.push('缺 pageErrors 读数 —— 「没读到」与「没有异常」是两件事，不许同形');
        return bad;
    }
    if (list.length) {
        bad.push('真页面有未捕获异常 ' + list.length + ' 条：' + show(list.slice(0, 3)));
    }
    return bad;
}

/**
 * 顶层：把一份完整报告判一遍（探针与判据单测共用同一个入口）。
 * @param {object} report `realhost_readings.json` 的形状
 * @returns {{block:string, msg:string}[]}
 */
export function judgeReport(report) {
    const R = isObj(report) ? report : {};
    const out = [];
    const push = (block, list) => { for (const m of list) out.push({ block, msg: m }); };
    push('load', judgeLoad(R.load));
    push('write', judgeWrite(R.write));
    push('worldline', judgeWorldline(R.worldline));
    push('tail', judgePageErrors(R.pageErrors));
    return out;
}
