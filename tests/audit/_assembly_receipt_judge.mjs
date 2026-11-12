/* ============================================================
 * tests/audit/_assembly_receipt_judge.mjs — 注入面「组装 ↔ 回执」双向对账判定体 [L21-O5 · v3.465.2]
 * ------------------------------------------------------------
 * 【它回答的唯一问题】
 *   「组装进提示词的条目集合，与回执记录下来的条目集合，是不是同一份？」
 *
 * 【三档差异（各答各的话，不许合成一个布尔）】
 *   silent  组装有、回执无 —— 静默条目：真进了提示词却没被记账；
 *   lied    回执有、组装无 —— 谎报：账上记了实际没用的条目；
 *   swapped 条数相同但内容不同 —— 替换：账对不上号但数量巧合相等，最易被「总数对」假绿掩盖。
 *   三档全空 ⇒ verdict 'equal'。
 *
 * 【诚实边界】
 *   本判定体只比对两侧的 id 序列，不解释差异成因；成因由调用现场给。
 * ============================================================ */

const norm = (arr) => (Array.isArray(arr) ? arr.map((x) => String(x)) : []);

/**
 * @param {string[]} assembled 组装面条目序列（按拼装顺序）
 * @param {string[]} receipt   回执面条目序列
 * @returns {{verdict:'equal'|'diff', silent:string[], lied:string[], swapped:boolean, why:string}}
 */
export function judgeParity(assembled, receipt) {
    const a = norm(assembled);
    const r = norm(receipt);
    const rSet = new Set(r);
    const aSet = new Set(a);
    const silent = a.filter((x) => !rSet.has(x));
    const lied = r.filter((x) => !aSet.has(x));
    // swapped：条数相同但 id 不同（同位比对，计划原文「条数同但 id 不同 = 替换」）——
    //   置换与单格替换都算；替换时 silent/lied 可能同时有值（各档各说的话，不互斥）。
    const swapped = a.length === r.length && a.some((x, i) => x !== r[i]);
    const isDiff = silent.length > 0 || lied.length > 0 || swapped;
    let why;
    if (!isDiff) why = '双向相等：组装集合与回执集合逐位一致（' + a.length + ' 条）';
    else {
        const parts = [];
        if (silent.length) parts.push('静默条目 ' + silent.length + '（组装有回执无）');
        if (lied.length) parts.push('谎报 ' + lied.length + '（回执有组装无）');
        if (swapped) parts.push('替换：条数相同但同位不同 id');
        why = '双向不等：' + parts.join('；');
    }
    return { verdict: isDiff ? 'diff' : 'equal', silent, lied, swapped, why };
}