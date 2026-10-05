/**
 * archive-shift.js — [v3.115 修复] 归档隐藏楼层的位移与剪枝（纯函数）
 *
 * 【背景】shiftFloorsFrom 给 10 个子系统做了楼层 index 位移校正，唯独漏了
 *   _archivedFloorIds；rollbackFloor 则对它一律 .clear()。两处都导致隐藏状态
 *   与真实楼层脱钩：删楼后旧归档指向错楼层（恢复时显示/隐藏错对象），
 *   或更早的有效归档被全清后永远无法恢复。
 *
 * 【规则】
 *   shiftArchivedIds(ids, deleted)：删楼前移
 *     - id > deleted → id - 1（前移）
 *     - id === deleted → 丢弃（楼层已不存在）
 *     - id < deleted  → 不变
 *   pruneArchivedIds(ids, floor)：回滚剪枝
 *     - id >= floor → 丢弃（该楼层记忆已被回滚撤销，隐藏失去依据）
 *     - id < floor  → 保留（仍被有效卷摘要覆盖）
 *
 * 【约束】纯函数：不修改入参；返回新 Set；非法输入安全降级（“没给”与“给了 0”不同形）。
 */
(function (global) {
    'use strict';

    /* [v3.275.0] O5 自纠：入参门收紧。
     *   修前这里是 `Number(v)` —— `Number(null) === 0` / `Number('') === 0` / `Number([]) === 0`，
     *   于是 `shiftArchivedIds([1,3,5], null)` 被读成「删了第 0 楼」，整组**搬掉一格**。
     *   形态与 v3.224 在 ledger-replay 修掉的那处逐字同族：拿原参数比 ⇒ 没给退化成 0。
     *   口径与 `ledger-replay.js` 的 `floorOrNull` **一致**（只认数字与非空数字字符串，
     *   其余 null＝没给；给 0 照常是 0）—— 两处是**各自路径上的门**（纯函数被直接调用时也要挡），
     *   不是同一份事实的两份实现；改口径必须两处同改（v3275 C2 把两者钉在同一批样本上）。 */
    function toNum(v) {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        if (typeof v === 'string') {
            const t = v.trim();
            if (!t) return null;
            const n = Number(t);
            return Number.isFinite(n) ? n : null;
        }
        return null;
    }

    /* [v3.275.0] O5：**归档处置的 provenance**。
     *   修前本模块只回一个新集合，调用方拿到的是一个计数 —— 「剪了哪几楼 / 为什么剪」
     *   在处置发生的**那一刻**就被丢掉，之后再也答不出（本仓 O5 验收：归档或 tombstone
     *   不抹掉审计 provenance）。
     *   形态选择：**explain* 是唯一真源，旧 API 是它的薄投影** —— 不是两份实现。
     *   这样旧调用方行为逐字不变（v3115 判据仍绿），而新调用方能拿到完整处置记录。 */
    function explainShift(ids, deleted) {
        const d = toNum(deleted);
        const src = [];
        for (const v of (ids || [])) { const n = toNum(v); if (n !== null) src.push(n); }
        if (d === null) {
            /* 楼层非法 ⇒ 不动。为什么不算「剪了 0 楼」：那不是一次处置，是一次**未执行**，
             *   两者必须不同形（`why` 直接说清）。 */
            return { next: new Set(src), removed: [], moved: [], kept: src.slice(), deleted: null, why: 'invalid-deleted' };
        }
        const next = new Set();
        const removed = [], moved = [];
        for (const n of src) {
            if (n === d) { removed.push({ from: n, why: 'deleted-floor' }); continue; }
            if (n > d) { next.add(n - 1); moved.push({ from: n, to: n - 1 }); }
            else next.add(n);
        }
        return { next, removed, moved, kept: [...next], deleted: d, why: 'ok' };
    }

    function explainPrune(ids, floor) {
        const f = toNum(floor);
        const src = [];
        for (const v of (ids || [])) { const n = toNum(v); if (n !== null) src.push(n); }
        if (f === null) {
            return { next: new Set(src), removed: [], kept: src.slice(), floor: null, why: 'invalid-floor' };
        }
        const next = new Set();
        const removed = [];
        for (const n of src) {
            if (n < f) next.add(n);
            else removed.push({ from: n, why: 'rolled-back' });
        }
        return { next, removed, kept: [...next], floor: f, why: 'ok' };
    }

    /**
     * 删楼后归档楼层位移。
     * @param {Iterable<number>} ids 已归档隐藏的楼层 index 集合
     * @param {number} deleted 被删除的楼层 index
     * @returns {Set<number>} 校正后的集合（不变则返回原集合的拷贝）
     */
    function shiftArchivedIds(ids, deleted) {
        /* 薄投影：行为与 v3.115 逐字一致（只回新集合）。处置记录走 explainShift。 */
        return explainShift(ids, deleted).next;
    }

    /**
     * 回滚剪枝：丢弃 >= floor 的归档（记忆已被撤销），保留更早的有效归档。
     * @param {Iterable<number>} ids 已归档隐藏的楼层 index 集合
     * @param {number} floor 回滚到的楼层（该楼层及之后的记忆被撤销）
     * @returns {Set<number>} 校正后的集合
     */
    function pruneArchivedIds(ids, floor) {
        /* 薄投影：行为与 v3.115 逐字一致（只回新集合）。处置记录走 explainPrune。 */
        return explainPrune(ids, floor).next;
    }

    const api = { shiftArchivedIds, pruneArchivedIds, explainShift, explainPrune, toNum };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaArchiveShift = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);