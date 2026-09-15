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
 * 【约束】纯函数：不修改入参；返回新 Set；非法输入安全降级。
 */
(function (global) {
    'use strict';

    function toNum(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }

    /**
     * 删楼后归档楼层位移。
     * @param {Iterable<number>} ids 已归档隐藏的楼层 index 集合
     * @param {number} deleted 被删除的楼层 index
     * @returns {Set<number>} 校正后的集合（不变则返回原集合的拷贝）
     */
    function shiftArchivedIds(ids, deleted) {
        const d = toNum(deleted);
        if (d === null) return new Set(ids || []);
        const out = new Set();
        for (const v of (ids || [])) {
            const n = toNum(v);
            if (n === null) continue;
            if (n === d) continue;                 // 被删楼本身：丢弃
            out.add(n > d ? n - 1 : n);            // 前移或不变
        }
        return out;
    }

    /**
     * 回滚剪枝：丢弃 >= floor 的归档（记忆已被撤销），保留更早的有效归档。
     * @param {Iterable<number>} ids 已归档隐藏的楼层 index 集合
     * @param {number} floor 回滚到的楼层（该楼层及之后的记忆被撤销）
     * @returns {Set<number>} 校正后的集合
     */
    function pruneArchivedIds(ids, floor) {
        const f = toNum(floor);
        if (f === null) return new Set(ids || []);
        const out = new Set();
        for (const v of (ids || [])) {
            const n = toNum(v);
            if (n === null) continue;
            if (n < f) out.add(n);                 // 仅保留更早的归档
        }
        return out;
    }

    const api = { shiftArchivedIds, pruneArchivedIds, toNum };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaArchiveShift = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);