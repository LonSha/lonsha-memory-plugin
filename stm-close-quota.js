/* ============================================================
 * stm-close-quota.js — 主动销项的可销额度护栏（纯函数内核）[v3.421.0 · 缝合 E3]
 * ------------------------------------------------------------
 * 【来源与许可】MIT（zyy0463/rolling-memory `index.js:780-845` 的 close 两道护栏）——
 *   许可允许搬代码，仍按宿主纯函数/双导出约定重写，命名与账本口径全部落地化。
 *
 * 【源实现记录的真实事故（原文注释，非本仓推断）】
 *   模型把「销项」当成了「清理已结束的话题」用：一天里四次大销（4/4/8/5 行，其中两次把
 *   可变区销到 0 行），近两天二十来行话题就此消失。而销项与原容量淘汰**不是一条路**：
 *   淘汰是把行挪进 T2（有副本），销项是直接删（删掉的行不进 T2），等于永久删除。
 *   且销项原先**完全不受保底约束**（保底只保护容量淘汰那一路），可以销到 0 行。
 *
 * 【本仓为什么需要它（等价缺口实测）】
 *   宿主 `stm-ltm.js` 有两条删条目路，一条都没有「本批新增」概念：
 *     · `removeByFloors()`（删楼级联）—— 删多少完全由删了几层楼决定，无上限；
 *     · `_rolloverToLtm()` 的 LTM 滚动窗口 —— 无条件 `length - MAX_LTM_ENTRIES`，
 *       只要一次巩固跨过容量线，可以一口气丢很多条（`ltmEvicted` 只记账、不拦）。
 *   两者共有的病是**同一条**：删除量只由「当前状态」算，与「这一批到底带来了多少新内容」无关。
 *   于是「零新增却大批删除」在结构上无法被察觉 —— 而这正是源实现点名的形态。
 *
 * 【两条护栏（硬拦，不是提示词）】
 *   ① 销项后不得低于 `minKeep`（保底留几条）；
 *   ② 一次销项不得超过本批 `appended` 条数 —— 真结项总伴随「这事办完了」的新行，
 *      只有批量清算旧账才会出现零新增却销一大片。
 *   可销额度 = `max(0, min(存量 - 保底, 本批新增))`。额度为 0 ⇒ **一行不许销**并具名回报
 *   是哪条护栏拦下的（`keep-floor` / `no-append`），不许沉默返回 0。
 *
 * 【与容量淘汰的分工（刻意不合并）】
 *   容量淘汰负责「必须降到容量内」，可以不受本批新增约束（否则会无限增库）；
 *   本模块管的是**主动销项**。调用方要区分这两条路，不得用本模块给容量淘汰兜底。
 *
 * 零依赖、纯函数（不改入参）；命中谓词由调用方注入，本模块不认任何业务字段。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaStmCloseQuota = factory();
        root.StmCloseQuota = root.LonShaStmCloseQuota;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    /** 保底缺省：3（与源实现 DEFAULTS.minKeepT1 同值）。 */
    const DEFAULT_MIN_KEEP = 3;
    /** 拦截原因枚举。顺序即判定序：先无新增、后触底 —— 两条同时成立时报更根因的那条。 */
    const BLOCK_REASONS = Object.freeze(['no-append', 'keep-floor']);
    function numOr(v, fb) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fb;
    }
    /**
     * 算可销额度。**纯算术、零副作用**，调用方据此决定销不销。
     *
     * @param {object} input {before, minKeep, appended, hits}
     *        before   当前存量条数
     *        minKeep  保底留几条（缺省 3；<=0 视为不保底）
     *        appended 本批新增条数
     *        hits     命中待销条数（只用于读数与「命中但销不掉」的缺口，不参与额度）
     * @returns {{quota:number, blocked:boolean, reasons:string[], byKeep:number, byAppend:number,
     *            before:number, minKeep:number, appended:number, hits:number, shortfall:number}}
     *          `shortfall` = 命中但受额度所限销不掉的数量 —— 这个数必须能被看见，
     *          否则「销了 3 行」与「命中 12 行只销了 3 行」同形。
     */
    function closeQuota(input) {
        const i = (input && typeof input === 'object') ? input : {};
        const before = Math.max(0, Math.floor(numOr(i.before, 0)));
        const minKeep = Math.max(0, Math.floor(numOr(i.minKeep, DEFAULT_MIN_KEEP)));
        const appended = Math.max(0, Math.floor(numOr(i.appended, 0)));
        const hits = Math.max(0, Math.floor(numOr(i.hits, 0)));
        /* 两条上限各自独立算，取小者 —— 任一为 0 就已经是 0，不必提前 return（读数要全）。 */
        const byKeep = Math.max(0, before - minKeep);
        const byAppend = appended;
        const quota = Math.max(0, Math.min(byKeep, byAppend));
        const reasons = [];
        if (appended <= 0) reasons.push('no-append');
        if (byKeep <= 0) reasons.push('keep-floor');
        return {
            quota: quota,
            blocked: quota <= 0,
            reasons: reasons,
            byKeep: byKeep,
            byAppend: byAppend,
            before: before,
            minKeep: minKeep,
            appended: appended,
            hits: hits,
            shortfall: Math.max(0, hits - quota)
        };
    }
    /**
     * 在额度内挑出要销的项：**从最旧端开始**（与容量淘汰同向，不打乱时间序）。
     *
     * @param {Array} list 现有条目（顺序即时间序，旧在前）
     * @param {function} isHit 命中谓词，收到 (item, index)
     * @param {number} quota 由 closeQuota 算出的额度
     * @returns {{remove:Set<number>, removed:number, reRead:boolean}}
     *          `remove` 是**下标集合**（用下标而不是值：同值条目会出现多条，按值销会连坐）；
     *          `reRead` 为真表示额度用尽时仍有命中未销，调用方应回报。
     */
    function pickCloseTargets(list, isHit, quota) {
        const arr = Array.isArray(list) ? list : [];
        const q = Math.max(0, Math.floor(numOr(quota, 0)));
        const remove = new Set();
        if (!q || typeof isHit !== 'function') {
            let anyHit = false;
            for (let i = 0; i < arr.length; i++) { if (typeof isHit === 'function' && isHit(arr[i], i)) { anyHit = true; break; } }
            return { remove: remove, removed: 0, reRead: anyHit };
        }
        let left = q;
        for (let i = 0; i < arr.length && left > 0; i++) {
            let hit = false;
            try { hit = !!isHit(arr[i], i); } catch (_e) { hit = false; }
            if (hit) { remove.add(i); left--; }
        }
        return { remove: remove, removed: remove.size, reRead: false };
    }
    /**
     * 一步到位：算额度 + 挑目标，返回新数组与完整读数。**不落账**（账本在调用方，本模块纯）。
     *
     * @param {Array} list 现有条目
     * @param {function} isHit 命中谓词
     * @param {object} input 同 closeQuota 的 {minKeep, appended}
     * @returns {{list:Array, quota:object, removed:number, dropped:Array, line:string}}
     */
    function applyClose(list, isHit, input) {
        const arr = Array.isArray(list) ? list : [];
        const i = (input && typeof input === 'object') ? input : {};
        /* hits 用谓词真跑一遍算，不接受调用方自报（自报与实现不一致是谎的常见来源）。 */
        let hits = 0;
        for (let k = 0; k < arr.length; k++) {
            let hit = false;
            try { hit = (typeof isHit === 'function') ? !!isHit(arr[k], k) : false; } catch (_e) { hit = false; }
            if (hit) hits++;
        }
        const quota = closeQuota({
            before: arr.length, minKeep: i.minKeep, appended: i.appended, hits: hits
        });
        const picked = pickCloseTargets(arr, isHit, quota.quota);
        const kept = [];
        const dropped = [];
        for (let k = 0; k < arr.length; k++) {
            if (picked.remove.has(k)) dropped.push(arr[k]); else kept.push(arr[k]);
        }
        return {
            list: kept,
            quota: quota,
            removed: dropped.length,
            dropped: dropped,
            line: line(quota, dropped.length)
        };
    }
    /**
     * 一行可读读数。额度为 0 时**必须**说明是哪条护栏，否则读日志的人只会看到「销了 0 行」。
     */
    function line(quota, removed) {
        const q = (quota && typeof quota === 'object') ? quota : {};
        const rm = Math.max(0, Math.floor(numOr(removed, 0)));
        const detail = '可销额度 ' + numOr(q.quota, 0) + ' = min(保底留 ' + numOr(q.minKeep, 0) + ' 行 → '
            + numOr(q.byKeep, 0) + ', 本批新增 ' + numOr(q.appended, 0) + ')';
        if (numOr(q.quota, 0) <= 0) {
            return '销项被护栏拦下，一行未销（命中 ' + numOr(q.hits, 0) + ' 行；' + detail
                + '；拦下原因 ' + ((q.reasons || []).join('/') || '未具名') + '）';
        }
        let s = '销项 ' + rm + ' 行（命中 ' + numOr(q.hits, 0) + ' 行；' + detail + '）';
        if (numOr(q.shortfall, 0) > 0) s += '，受额度所限 ' + numOr(q.shortfall, 0) + ' 行未销';
        return s;
    }
    /** 自证：额度公式的四个边界（0 新增 / 触保底 / 双低取小 / 正常放开）。 */
    function selfCheck() {
        const problems = [];
        const c = { before: 10, minKeep: 3, appended: 0, hits: 5 };
        if (closeQuota(c).quota !== 0) problems.push('零新增未拦下');
        c.appended = 4;
        if (closeQuota(c).quota !== 4) problems.push('正常额度被压低');
        c.before = 3;
        if (closeQuota(c).quota !== 0) problems.push('触保底未拦下');
        c.before = 100; c.appended = 50;
        if (closeQuota(c).quota !== 50) problems.push('未取两支最小值');
        const r = applyClose(['a', 'b', 'c', 'd'], (x) => x === 'a' || x === 'c', { minKeep: 1, appended: 4 });
        if (r.removed !== 2 || r.list.length !== 2) problems.push('applyClose 未按下标销');
        if (BLOCK_REASONS.length !== 2) problems.push('BLOCK_REASONS 形状漂移');
        return { ok: problems.length === 0, problems: problems };
    }
    return {
        DEFAULT_MIN_KEEP: DEFAULT_MIN_KEEP,
        BLOCK_REASONS: BLOCK_REASONS,
        closeQuota: closeQuota,
        pickCloseTargets: pickCloseTargets,
        applyClose: applyClose,
        line: line,
        selfCheck: selfCheck
    };
}));