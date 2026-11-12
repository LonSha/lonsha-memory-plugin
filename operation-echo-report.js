/* L21-X8: operation-echo-report. For one OpLog entry, report the full echo of
 * that operation across four facets: graph / summary / injection / timeline.
 * Each facet is one of THREE states — affected / unaffected / UNKNOWN — and
 * unknown must never be merged into unaffected (an unreadable face is not an
 * untouched face). Rules come from an explicit readable table; facet details
 * come from an optional ctx, and a missing ctx makes the facet unknown, never
 * "not affected". */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaOperationEcho = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';
    const VERSION = '1.0.0-L21-X8';

    const FACETS = Object.freeze(['graph', 'summary', 'injection', 'timeline']);
    const STATE = Object.freeze({ AFFECTED: 'affected', UNAFFECTED: 'unaffected', UNKNOWN: 'unknown' });

    /* 显式规则表：type/op 组合 ⇒ 该面「是否应受影响」。可读、可改、一处真源。
     *   graph     — 改事实/图谱/摘要 ⇒ 图谱结构或节点归属被牵动
     *   summary   — 新增/修改/删除/位移 ⇒ 摘要待重建
     *   injection — 改动进入注入面的内容 ⇒ 下次生成会变
     *   timeline  — 时间线类变更或楼层位移 ⇒ 时间线被牵动 */
    const RULES = Object.freeze({
        graph: {
            types: ['graph', 'locked_fact', 'summary', 'delta'],
            ops: ['add', 'update', 'remove', 'forge', 'shift'],
            affectedText: '图谱节点归属被牵动'
        },
        summary: {
            types: ['summary', 'delta', 'locked_fact', 'graph', 'item', 'status', 'cse'],
            ops: ['add', 'update', 'remove', 'forge', 'shift'],
            affectedText: '摘要待重建'
        },
        injection: {
            types: ['locked_fact', 'summary', 'delta', 'graph', 'status', 'cse', 'item'],
            ops: ['add', 'update', 'remove', 'forge'],
            affectedText: '注入面下次生成会变'
        },
        timeline: {
            types: ['timeline', 'summary', 'ledger'],
            ops: ['add', 'update', 'remove', 'shift'],
            affectedText: '时间线被牵动'
        }
    });

    function ruleSays(rule, entry) {
        if (!rule) return false;
        const t = String(entry && entry.type || '');
        const o = String(entry && entry.op || '');
        return rule.types.indexOf(t) >= 0 && rule.ops.indexOf(o) >= 0;
    }

    /* echoForEntry(entry, ctx) — entry: oplog 一条；ctx: 各面读数（可缺）。
     * 每面三态：
     *   规则说不该动               ⇒ unaffected
     *   规则说该动 + ctx 有读数    ⇒ affected（带 detail）
     *   规则说该动 + ctx 没读数    ⇒ unknown（判不了，绝不并进 unaffected） */
    function echoForEntry(entry, ctx) {
        const c = ctx && typeof ctx === 'object' ? ctx : {};
        const facets = {};
        for (let i = 0; i < FACETS.length; i++) {
            const name = FACETS[i];
            const rule = RULES[name];
            if (!ruleSays(rule, entry)) {
                facets[name] = { facet: name, state: STATE.UNAFFECTED, detail: '' };
                continue;
            }
            const read = c[name];
            const detail = (read === undefined || read === null || read === '') ? null
                : (typeof read === 'function' ? (function () { try { return read(entry) || null; } catch (e) { return null; } })() : String(read));
            if (detail === null) {
                facets[name] = { facet: name, state: STATE.UNKNOWN, detail: '该面读数缺席（判不了，不是没牵动）' };
            } else {
                facets[name] = { facet: name, state: STATE.AFFECTED, detail: rule.affectedText + '：' + detail };
            }
        }
        const flat = FACETS.map(function (n) { return facets[n]; });
        return { seq: entry ? entry.seq : null, facets: facets, flat: flat };
    }

    /* 批量：oplog 的 recent 列表全部回声。 */
    function echoAll(entries, ctx) {
        return (Array.isArray(entries) ? entries : []).map(function (e) { return echoForEntry(e, ctx); });
    }

    /* 玩家读面：oplog 每行可展开的「↩️ 这次改动牵动了什么」一行。
     * 四档三态各自的记号不同形：✅ 受影响 / ⚪ 未受影响 / ⚠️ 判不了。 */
    const MARKS = { affected: '✅', unaffected: '⚪', unknown: '⚠️' };
    function formatLine(echo) {
        if (!echo || !echo.flat) return '';
        return '↩️ 这次改动牵动了什么：' + echo.flat.map(function (f) {
            return MARKS[f.state] + ' ' + f.facet + (f.detail ? '(' + f.detail + ')' : '');
        }).join(' · ');
    }

    return { VERSION, FACETS, STATE, RULES, echoForEntry, echoAll, formatLine };
}));