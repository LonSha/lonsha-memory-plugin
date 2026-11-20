/* ============================================================
 * memory-health-board.js — L26-X7 记忆健康看板
 *
 * 【治的欠债】用户看得见对话，看不见记忆的健康：多少条、有没有坏、有没有
 *   指向已删记忆的悬空引用 —— 全都没有读数。
 *
 * 【三条硬要求】
 *   1. 一眼看出四件事：增长、异常、损坏、悬空引用；每项带「点进去处理」的动作名；
 *   2. **损坏优先于增长**：坏了的库不该被读成「长得挺快」；
 *   3. 没有基线 ⇒ `unknown`，**不许判 ok**（没量过不等于健康）。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaMemoryHealthBoard = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var STATES = Object.freeze(['broken', 'growing', 'anomaly', 'unknown', 'ok']);
    var DEFAULT_GROWTH_RATIO = 1.2;

    function isNum(v) { return typeof v === 'number' && isFinite(v); }

    /**
     * @param {{records:Array, baseline?:{count:number, at?:number}, relations?:Array, growthRatio?:number}} opts
     */
    function board(opts) {
        var o = opts || {};
        var records = Array.isArray(o.records) ? o.records : [];
        var relations = Array.isArray(o.relations) ? o.relations : [];
        var growthRatio = o.growthRatio === undefined ? DEFAULT_GROWTH_RATIO : o.growthRatio;
        if (!isNum(growthRatio) || growthRatio <= 1) {
            throw new TypeError('[L26-X7] 增长比必须是 >1 的数字（1 会把「没长」也判成增长），收到 ' + String(growthRatio));
        }

        var brokenRows = [];
        var ids = {};
        records.forEach(function (r, i) {
            var rec = r || {};
            var id = rec.id;
            if (typeof id !== 'string' || !id) {
                brokenRows.push({ at: i, why: '记忆没有 id' });
                return;
            }
            if (ids[id]) {
                brokenRows.push({ id: id, why: '同一个 id 出现了两次' });
                return;
            }
            ids[id] = true;
            var text = rec.content === undefined ? rec.text : rec.content;
            if (text === undefined || text === null || String(text).trim() === '') {
                brokenRows.push({ id: id, why: '记忆正文是空的' });
            }
        });
        var dangling = relations.filter(function (rel) {
            var r = rel || {};
            return !r.from || !r.to || !ids[r.from] || !ids[r.to];
        });

        var base = o.baseline;
        var baseCount = base && isNum(base.count) ? base.count : null;
        var growth = null;
        if (baseCount !== null && baseCount > 0) {
            growth = Math.round((records.length / baseCount) * 1000) / 1000;
        }

        var state;
        var action;
        if (brokenRows.length > 0 || dangling.length > 0) {
            state = 'broken';
            action = brokenRows.length ? '打开「修复记忆」逐条处理损坏项' : '打开「关系」清理悬空引用';
        } else if (baseCount === null) {
            state = 'unknown';
            action = '先跑一次「建立基线」，之后才谈得上增长是否健康';
        } else if (growth !== null && growth > growthRatio) {
            state = 'growing';
            action = '打开「记忆体检」按类清理，或调高写入门槛';
        } else if (records.length < baseCount) {
            // 条数比基线少才是异常；growth<0 永远不成立（长度不为负），旧写法等于永不告警。
            state = 'anomaly';
            action = '记忆条数比基线还少，先确认是不是被批量删过';
        } else {
            state = 'ok';
            action = '暂无异常，继续用';
        }

        return {
            state: state,
            states: STATES,
            total: records.length,
            baseline: baseCount,
            growth: growth,
            growthRatio: growthRatio,
            broken: brokenRows,
            dangling: dangling,
            action: action,
            reading: state === 'ok'
                ? 'health-ok'
                : (state === 'unknown'
                    ? 'health-unknown'
                    : (state === 'broken'
                        ? 'health-broken:' + (brokenRows.length + dangling.length)
                        : 'health-' + state + ':' + (growth === null ? 'n/a' : growth)))
        };
    }

    /** 看板条目：给 UI 铺，每项都带动作（「每项可点进去处理」）。 */
    function tiles(opts) {
        var b = board(opts);
        return [
            { key: 'total', label: '记忆条数', value: b.total, action: '打开记忆列表' },
            { key: 'growth', label: '相对基线增长', value: b.growth, action: b.action },
            { key: 'broken', label: '损坏条目', value: b.broken.length, action: '打开「修复记忆」' },
            { key: 'dangling', label: '悬空引用', value: b.dangling.length, action: '打开「关系」清理' }
        ];
    }

    return {
        STATES: STATES,
        DEFAULT_GROWTH_RATIO: DEFAULT_GROWTH_RATIO,
        board: board,
        tiles: tiles
    };
}));