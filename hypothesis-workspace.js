/**
 * hypothesis-workspace.js — [v3.353.0 · M5-X7] 隔离于正史的假设推演工作集
 * 纯函数 IIFE，零依赖。挂 window.LonShaHypothesisWorkspace。
 *
 * 以指定时点事实快照 + 用户假设，生成可比工作集/约束冲突说明。
 * 允许交给生成通道试写，但不自动落入正史；丢弃即撤临时状态。
 */
(function (root) {
    'use strict';
    var VERSION = 1;
    var MAX_WORKSETS = 8;
    var MAX_ASSUMPTIONS = 20;

    function text(v, max) {
        var s = String(v == null ? '' : v).trim();
        return max && s.length > max ? s.slice(0, max) : s;
    }

    var STATES = Object.freeze(['draft', 'writing', 'completed', 'discarded']);

    function normalize(raw) {
        var o = raw && typeof raw === 'object' ? raw : {};
        var sets = Array.isArray(o.worksets) ? o.worksets : [];
        var out = { version: VERSION, worksets: [], active: null, malformed: 0 };
        for (var i = 0; i < sets.length && out.worksets.length < MAX_WORKSETS; i++) {
            var ws = sets[i];
            if (!ws || typeof ws !== 'object') { out.malformed++; continue; }
            var id = text(ws.id, 60);
            var label = text(ws.label || ws.title, 80);
            var assumptions = Array.isArray(ws.assumptions) ? ws.assumptions : [];
            var cleanAss = [];
            for (var j = 0; j < assumptions.length && cleanAss.length < MAX_ASSUMPTIONS; j++) {
                var a = assumptions[j];
                if (a && typeof a === 'object') {
                    cleanAss.push({
                        factId: text(a.factId, 80),
                        override: text(a.override || a.newValue, 200),
                        reason: text(a.reason, 120)
                    });
                }
            }
            var state = STATES.indexOf(ws.state) >= 0 ? ws.state : 'draft';
            out.worksets.push({
                id: id || ('hypo_' + (out.worksets.length + 1)),
                label: label,
                assumptions: cleanAss,
                state: state,
                snapshotFloor: ws.snapshotFloor != null ? ws.snapshotFloor : null,
                createdAt: ws.createdAt || 0,
                result: ws.result || null
            });
        }
        out.active = out.worksets.length ? out.worksets[out.worksets.length - 1].id : null;
        return out;
    }

    function createWorkspace(rawState, input) {
        var state = normalize(rawState);
        var id = text(input && input.id, 60) || ('hypo_' + (state.worksets.length + 1));
        var label = text(input && (input.label || input.title), 80);
        var assumptions = Array.isArray(input && input.assumptions) ? input.assumptions : [];
        var cleanAss = assumptions.slice(0, MAX_ASSUMPTIONS).map(function(a) {
            return {
                factId: text(a && a.factId, 80),
                override: text(a && (a.override || a.newValue), 200),
                reason: text(a && a.reason, 120)
            };
        });
        if (state.worksets.length >= MAX_WORKSETS) {
            return { ok: false, reason: 'capacity', state: state };
        }
        var ws = {
            id: id, label: label || '未命名假设',
            assumptions: cleanAss, state: 'draft',
            snapshotFloor: input && input.snapshotFloor != null ? input.snapshotFloor : null,
            createdAt: Date.now(), result: null
        };
        state.worksets.push(ws);
        state.active = id;
        return { ok: true, state: state, workspace: ws, changed: true };
    }

    function discardWorkspace(rawState, id) {
        var state = normalize(rawState);
        var found = false;
        for (var i = 0; i < state.worksets.length; i++) {
            if (state.worksets[i].id === id) {
                state.worksets[i].state = 'discarded';
                found = true;
                break;
            }
        }
        if (!found) return { ok: false, reason: 'not-found', state: state };
        if (state.active === id) state.active = null;
        return { ok: true, state: state, changed: true };
    }

    function completeWorkspace(rawState, id, result) {
        var state = normalize(rawState);
        for (var i = 0; i < state.worksets.length; i++) {
            if (state.worksets[i].id === id) {
                state.worksets[i].state = 'completed';
                state.worksets[i].result = text(result, 500);
                return { ok: true, state: state, changed: true };
            }
        }
        return { ok: false, reason: 'not-found', state: state };
    }

    function listWorkspaces(rawState) {
        return normalize(rawState).worksets.filter(function(ws) {
            return ws.state !== 'discarded';
        });
    }

    function line(state) {
        var s = normalize(state);
        if (!s.worksets.length) return '暂无假设工作集';
        var active = s.worksets.length;
        var discarded = 0, draft = 0, completed = 0;
        for (var i = 0; i < s.worksets.length; i++) {
            var st = s.worksets[i].state;
            if (st === 'discarded') discarded++;
            else if (st === 'draft') draft++;
            else if (st === 'completed') completed++;
        }
        return '工作集 ' + active + ' · 草稿 ' + draft + ' · 完成 ' + completed + ' · 丢弃 ' + discarded;
    }

    var api = {
        VERSION: VERSION, MAX_WORKSETS: MAX_WORKSETS, MAX_ASSUMPTIONS: MAX_ASSUMPTIONS,
        STATES: STATES, normalize: normalize,
        createWorkspace: createWorkspace, discardWorkspace: discardWorkspace,
        completeWorkspace: completeWorkspace, listWorkspaces: listWorkspaces,
        line: line
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaHypothesisWorkspace = Object.freeze(api); } catch (_e) {}
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);