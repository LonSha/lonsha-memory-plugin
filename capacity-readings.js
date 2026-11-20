/* ============================================================
 * capacity-readings.js — L26-O7 容量治理（10w / 50w 档）
 *
 * 【治的欠债】大规模下的内存/检索/落界行为未测（路线图 `【待复核】`）。
 *   「数据库能存多少」这件事，今天没人能给用户一个数。
 *
 * 【三条硬要求】
 *   1. 10w / 50w 两个档位**各出读数**（估算占用、是否越界），档位来自常量表不手抄；
 *   2. 触顶时必须给**可执行**的清理建议：按类点名、给出预计释放字节与优先级，不许只说「清理一下」；
 *   3. 数值一律要求真数字：`null` / 字符串 / NaN 直接抛，**不许当 0**（0 会让「没给」看起来像「很空」）。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaCapacityReadings = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var TIERS = Object.freeze([
        Object.freeze({ name: '10w', count: 100000 }),
        Object.freeze({ name: '50w', count: 500000 })
    ]);

    /** 清理优先级：越靠前越该先清（低价值、可再生、有证据副本）。 */
    var CLEANUP_ORDER = Object.freeze([
        Object.freeze({ kind: 'transient', label: '临时/草稿记忆', perItem: 1, priority: 1 }),
        Object.freeze({ kind: 'duplicate', label: '重复记忆（同一事实多份）', perItem: 1, priority: 2 }),
        Object.freeze({ kind: 'expired', label: '过期记忆（时间已过且无引用）', perItem: 1, priority: 3 }),
        Object.freeze({ kind: 'lowSalience', label: '低显著度记忆（长期没被召回）', perItem: 1, priority: 4 })
    ]);

    function strictNumber(v, label) {
        if (typeof v !== 'number' || !isFinite(v)) {
            throw new TypeError('[L26-O7] ' + label + ' 必须是真数字，收到 ' + String(v) +
                '（null/字符串不许当 0：会把「没测」读成「很空」）');
        }
        if (v < 0) throw new TypeError('[L26-O7] ' + label + ' 不许为负，收到 ' + v);
        return v;
    }

    /**
     * 两档读数。
     * @param {{perItemBytes:number, budgetBytes:number, overheadRatio?:number}} opts
     */
    function estimateCapacity(opts) {
        var o = opts || {};
        var per = strictNumber(o.perItemBytes, 'perItemBytes');
        var budget = strictNumber(o.budgetBytes, 'budgetBytes');
        var overhead = o.overheadRatio === undefined ? 1.6 : strictNumber(o.overheadRatio, 'overheadRatio');
        if (per === 0) throw new TypeError('[L26-O7] perItemBytes 不许为 0（除零会把容量读成无穷）');
        var rows = TIERS.map(function (t) {
            var need = Math.round(t.count * per * overhead);
            return {
                tier: t.name,
                count: t.count,
                estimatedBytes: need,
                withinBudget: need <= budget,
                usage: Math.round((need / budget) * 1000) / 10
            };
        });
        var over = rows.filter(function (r) { return !r.withinBudget; });
        return {
            perItemBytes: per,
            budgetBytes: budget,
            overheadRatio: overhead,
            rows: rows,
            overBudgetTiers: over.map(function (r) { return r.tier; }),
            reading: over.length === 0
                ? 'capacity-ok'
                : ('capacity-over:' + over.map(function (r) { return r.tier + '@' + r.usage + '%'; }).join(','))
        };
    }

    /**
     * 触顶时的清理建议：给出「先清哪类、能释放多少、清完还剩多少」。
     * @param {{usedBytes:number, budgetBytes:number, inventory:object, releaseBytes?:object}} opts
     *   inventory: {transient: 条数, duplicate: 条数, ...}
     */
    function adviseCleanup(opts) {
        var o = opts || {};
        var used = strictNumber(o.usedBytes, 'usedBytes');
        var budget = strictNumber(o.budgetBytes, 'budgetBytes');
        var per = o.perItemBytes === undefined ? 240 : strictNumber(o.perItemBytes, 'perItemBytes');
        var inv = o.inventory || {};
        var over = used > budget;
        var need = over ? used - budget : 0;
        var suggestions = [];
        var projected = used;

        CLEANUP_ORDER.forEach(function (rule) {
            var n = inv[rule.kind] === undefined ? 0 : strictNumber(inv[rule.kind], 'inventory.' + rule.kind);
            if (n <= 0) return;
            var releases = Math.round(n * per * rule.perItem);
            projected -= releases;
            suggestions.push({
                kind: rule.kind,
                label: rule.label,
                items: n,
                releasesBytes: releases,
                priority: rule.priority,
                after: projected,
                sufficient: projected <= budget,
                action: '在「记忆体检」里按类清理 ' + n + ' 条' + rule.label + '（预计释放 ' + releases + ' 字节）'
            });
        });

        var suffices = suggestions.some(function (s) { return s.sufficient; });
        return {
            overBudget: over,
            needBytes: need,
            suggestions: suggestions,
            suffices,
            reading: !over
                ? 'capacity-within-budget'
                : (suffices ? 'capacity-relief-planned:' + suggestions.length : 'capacity-needs-archive'),
            message: !over
                ? '还没触顶，继续用'
                : (suffices
                    ? '超出 ' + need + ' 字节；按建议顺序清理即可回到预算内'
                    : '超出 ' + need + ' 字节；只清理可清项不够，需要导出归档（导出后删本地副本）')
        };
    }

    return {
        TIERS: TIERS,
        CLEANUP_ORDER: CLEANUP_ORDER,
        estimateCapacity: estimateCapacity,
        adviseCleanup: adviseCleanup
    };
}));