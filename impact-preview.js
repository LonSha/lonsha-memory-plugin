/**
 * impact-preview.js — [v3.353.0 · M5-X6] 有意改设定的影响预览与选择性重算
 * 纯函数 IIFE，零依赖。挂 window.LonShaImpactPreview。
 *
 * 给一个被改事实：追踪哪些约定、人物状态、章节引用和派生结论受影响。
 * 分三类：directlyAffected / possiblyAffected / unaffected。
 * 预览零写；用户确认后经原 owner 应用并重算。
 */
(function (root) {
    'use strict';
    var VERSION = 1;
    var MAX_DEPENDENTS = 100;

    function text(v, max) {
        var s = String(v == null ? '' : v).trim();
        return max && s.length > max ? s.slice(0, max) : s;
    }

    /**
     * @param {object} factState - 事实版本状态（含 facts/versions/superseded）
     * @param {string} factId - 被改事实的 id
     * @param {object} ledgers - 各账本的 {items, promises, commitments, items} 等
     * @param {object} opts - { reason, newContent }
     */
    function previewImpact(factState, factId, ledgers, opts) {
        var out = {
            ok: false, factId: text(factId, 80),
            directlyAffected: [], possiblyAffected: [], unaffected: [],
            changedFact: null, reason: text(opts && opts.reason, 120),
            degraded: false
        };
        try {
            if (!factId) { out.reason = 'no-fact-id'; return out; }
            var dependents = [];
            var direct = [];
            var possible = [];

            // 1. 检查承诺账本中的依赖
            var commitments = (ledgers && ledgers.commitments) || { items: [] };
            var cmtItems = Array.isArray(commitments.items) ? commitments.items : [];
            for (var i = 0; i < cmtItems.length && dependents.length < MAX_DEPENDENTS; i++) {
                var c = cmtItems[i];
                var content = String(c.content || '').toLowerCase();
                var fid = String(factId).toLowerCase();
                if (content.indexOf(fid) >= 0 || c.floor === factId) {
                    direct.push({ type: 'commitment', id: c.id, actor: c.actor, content: c.content, status: c.status });
                }
            }

            // 2. 检查人物物品账本
            var items = (ledgers && ledgers.items) || { records: [] };
            var itemRecords = Array.isArray(items.records) ? items.records : [];
            for (var j = 0; j < itemRecords.length && dependents.length < MAX_DEPENDENTS; j++) {
                var r = itemRecords[j];
                if (r.ownerRef === factId || r.lendTo === factId || r.borrowFrom === factId) {
                    direct.push({ type: 'item', id: r.id, actor: r.actor, content: r.content });
                }
            }

            // 3. 检查事实版本中的派生关系
            if (factState && typeof factState === 'object') {
                var versions = factState.versions || {};
                for (var vid in versions) {
                    if (!versions.hasOwnProperty(vid)) continue;
                    var v = versions[vid];
                    if (v && v.derivedFrom === factId) {
                        possible.push({ type: 'derived-fact', id: vid, content: v.content || '' });
                    }
                }
            }

            out.directlyAffected = direct;
            out.possiblyAffected = possible;
            out.unaffected = [];
            out.changedFact = { id: factId, newContent: text(opts && opts.newContent, 200), reason: out.reason };
            out.ok = true;
            return out;
        } catch (_e) {
            return Object.assign({}, out, { degraded: true });
        }
    }

    function line(result) {
        if (!result || !result.ok) return '影响预览不可用';
        var d = (result.directlyAffected || []).length;
        var p = (result.possiblyAffected || []).length;
        var parts = ['直接受影响 ' + d, '可能受影响 ' + p];
        if (result.changedFact && result.changedFact.newContent) parts.push('新内容: ' + result.changedFact.newContent);
        return parts.join(' · ');
    }

    var api = {
        VERSION: VERSION,
        MAX_DEPENDENTS: MAX_DEPENDENTS,
        previewImpact: previewImpact,
        line: line
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaImpactPreview = Object.freeze(api); } catch (_e) {}
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);