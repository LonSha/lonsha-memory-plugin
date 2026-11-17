/* ══════════ L23-O4：读数「两态不同形」的判定真源 ══════════
 * 计划原文：「`realhost` 读数接门：`available` 必须真有读数过阈值、`unavailable` 必须记 `cause`，
 *   **两态不同形**」。
 *
 * 【为什么必须「不同形」而不是「同一份 JSON 里 ok=false」】
 *   本仓栽过的形态正是后者：`verdict:'environment-unavailable'` 的读数里如果也能带 `readings` /
 *   `blocks` / `ok`，那「跑不了」和「跑过了」在账本上会长成同一个形状 —— 下一版写 CHANGELOG 的人
 *   只看字段在不在，就会把「没跑」读成「跑过」。故本函数把两态的**键面**也判进去：
 *     · 环境态（`environment-unavailable`）**不得**出现跑过态的键（blocks/readings/ok/defects/pageErrors）；
 *     · 跑过态（`success` / `product-defect`）**不得**出现环境态的键（cause/causeAction/causeWhy/env/reason）。
 *   这条不是洁癖：它让「伪造一次跑过」必须**同时**删掉成因面并造出合规读数，代价立刻可见。
 *
 * 【阈值不是新写的常量】跑过态的阈值判定直接调 `judgeLoad` / `judgeWrite` / `judgeWorldline`
 *   （`MIN_GLOBALS` 等唯一真源在本文件上方），本函数只负责「把平铺读数还原成三块」并汇总。
 */

/* 依赖全住 `_realhost_judge.mjs`（三块阈值 + 成因码表 + CAUSE_ACTION 的唯一真源）。
 *   本文件**不重新定义**任何阈值或处置文案：重写一份就是「同一事实两处实现」，
 *   实测栽过（_recallExplainLib 同名两份）。 */
import {
    judgeLoad, judgeWrite, judgeWorldline,
    ENV_CAUSES, NONENV_CAUSES, ALL_CAUSES, CAUSE_ACTION,
} from './_realhost_judge.mjs';

const isObj = (v) => !!v && typeof v === 'object';
const show = (v) => {
    try { return JSON.stringify(v); } catch (_e) { return String(v); }
};

/** 环境态独占键 / 跑过态独占键 —— 两态不同形的形式化定义（判据与负控制共用这一份）。 */
export const ENV_ONLY_KEYS = ['cause', 'causeGroup', 'causeAction', 'causeWhy', 'env', 'reason'];
export const RAN_ONLY_KEYS = ['blocks', 'readings', 'ok', 'defects', 'pageErrors'];

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/**
 * 把 `readings: [{block,key,value,source}]` 平铺读数还原成三块对象（judgeLoad/judgeWrite/judgeWorldline 的入参形状）。
 * 同一 block+key 多次出现 ⇒ 后者覆盖前者（探针在同一块里可能分阶段记同名 key，最后一条才是结论）。
 */
export function regroupReadings(readings) {
    const out = {};
    for (const r of Array.isArray(readings) ? readings : []) {
        if (!isObj(r) || typeof r.block !== 'string' || typeof r.key !== 'string') continue;
        if (!isObj(out[r.block])) out[r.block] = {};
        out[r.block][r.key] = r.value;
    }
    return out;
}

/**
 * L23-O4 的判定体力：一份 `realhost_readings.json` 的「形状 + 内证」。
 * @returns {{ok:boolean, mode:'env'|'ran'|'unknown', problems:string[], checkedBlocks:string[]}}
 */
export function judgeReadingsShape(r) {
    const problems = [];
    const R0 = isObj(r) ? r : {};
    const verdict = R0.verdict;
    let mode = 'unknown';
    let checkedBlocks = [];

    if (verdict === 'environment-unavailable') {
        mode = 'env';
        /* ① 成因面必须齐：没有 cause 的「跑不了」= 没说清为什么跑不了（L21-O3 立项根因）。 */
        if (!ALL_CAUSES.includes(R0.cause)) {
            problems.push('environment-unavailable 必须带合法 cause（ALL_CAUSES 之一），实 ' + show(R0.cause));
        } else {
            const wantGroup = ENV_CAUSES.includes(R0.cause) ? 'env' : 'non-env';
            if (R0.causeGroup !== wantGroup) {
                problems.push('causeGroup 与 cause 不一致：' + show(R0.cause) + ' 应为 ' + wantGroup + '，实 ' + show(R0.causeGroup));
            }
            if (String(R0.causeAction || '').trim() !== CAUSE_ACTION[R0.cause]) {
                problems.push('causeAction 必须逐字等于 CAUSE_ACTION[' + R0.cause + ']（处置不许各写一份），实 ' + show(R0.causeAction));
            }
        }
        if (!String(R0.causeWhy || '').trim()) problems.push('causeWhy 为空 —— 成因面只给码不给现场读数');
        if (!String(R0.reason || '').trim()) problems.push('reason 为空');
        /* ② 不同形：环境态不得混进「跑过了」的键。 */
        const leaked = RAN_ONLY_KEYS.filter((k) => has(R0, k));
        if (leaked.length) {
            problems.push('环境态读数里出现「跑过态」的键：' + leaked.join(',')
                + ' —— 这会把「跑不了」和「跑过了」在账本上长成同一形状（本项要防的正是这个）');
        }
    } else if (verdict === 'success' || verdict === 'product-defect') {
        mode = 'ran';
        /* ① 不同形：跑过态不得借用成因面的键。 */
        const leaked = ENV_ONLY_KEYS.filter((k) => has(R0, k));
        if (leaked.length) {
            problems.push('跑过态读数里出现「环境态」的键：' + leaked.join(',') + ' —— 两态形状必须互斥');
        }
        /* ② 三块真读数 + 阈值（阈值真源不在这里，直接调三个 judge）。 */
        const blocks = isObj(R0.blocks) ? R0.blocks : {};
        const ran = ['load', 'write', 'worldline'].filter((b) => blocks[b] === true);
        checkedBlocks = ran;
        if (ran.length === 0) problems.push('跑过态必须至少跑完一块（blocks 全 false ⇒ 这份读数什么也没回答）');
        const byBlock = regroupReadings(R0.readings);
        const judges = { load: judgeLoad, write: judgeWrite, worldline: judgeWorldline };
        for (const b of ran) {
            for (const m of judges[b](byBlock[b])) problems.push('[' + b + '] ' + m);
        }
        if (typeof R0.ok !== 'boolean') problems.push('跑过态必须给 ok 布尔（缺了等于没结论）');
        const defects = Array.isArray(R0.defects) ? R0.defects : null;
        if (!defects) problems.push('跑过态必须给 defects 数组（空数组也要写，缺字段≠零缺陷）');
        if (defects && verdict === 'success' && defects.length) {
            problems.push('verdict=success 但 defects 非空（' + defects.length + ' 项）—— 结论与读数矛盾');
        }
        if (defects && verdict === 'product-defect' && defects.length === 0) {
            problems.push('verdict=product-defect 但 defects 为空 —— 要么结论错，要么缺陷被吞了');
        }
        if (R0.ok === true && defects && defects.length) problems.push('ok=true 但 defects 非空（矛盾）');
    } else {
        problems.push('verdict 不在三态之内（success / product-defect / environment-unavailable），实 ' + show(verdict));
    }
    return { ok: problems.length === 0, mode, problems, checkedBlocks };
}
