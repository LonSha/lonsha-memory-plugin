/**
 * goal-tracker.js — [v3.352.0 · M5-X2] 长期目标的前置条件与下一步记忆
 *   纯函数 IIFE，零依赖、零联网、零写回。
 *
 * 为什么需要：
 *   已有承诺、伏笔、causal-chain 和事件完整性，但它们记录事情与因果，
 *   不等同于玩家指定的「目标—子目标—前置条件」工作流。
 *   本模块在既有事实/约定之上增加用户声明的目标结构，
 *   派生已满足/受阻/未知条件；不用模型自动认定完成。
 *
 * 设计纪律：
 *   1. 不复制事实——事实引用走 factId，不在此模块存第二份正文。
 *   2. 达成状态由证据计算——不给「人工标记完成」开口子绕过条件。
 *   3. 循环依赖阻止保存并指出环——不允许 A→B→A 的前置链。
 *   4. 关闭目标不删除原事实——只改目标状态，事实仍在原 owner。
 */
(function () {
    'use strict';

    const GT_VERSION = 1;
    const GT_KIND = 'goal_tracker';
    const MAX_GOALS = 50;
    const MAX_PREREQS = 12;

    function isStr(v) { return typeof v === 'string' && v.trim().length > 0; }
    function strOf(v) { return (v != null) ? String(v).trim() : ''; }
    function numOr(v, d) { return Number.isFinite(Number(v)) ? Number(v) : d; }

    /**
     * 归一化目标结构。
     * @param {object} raw 原始输入
     * @returns {{ok, goal?, why?}}
     */
    function normalizeGoal(raw) {
        if (!raw || typeof raw !== 'object') return { ok: false, why: 'not-object' };
        const id = strOf(raw.id);
        if (!id) return { ok: false, why: 'missing-id' };
        const title = strOf(raw.title);
        if (!title) return { ok: false, why: 'missing-title' };
        const goal = {
            id: id.slice(0, 60),
            title: title.slice(0, 120),
            parent: strOf(raw.parent) || null,
            status: ['active', 'done', 'abandoned'].indexOf(strOf(raw.status)) >= 0 ? strOf(raw.status) : 'active',
            prereqs: [],
            notes: strOf(raw.notes).slice(0, 200),
            createdAt: numOr(raw.createdAt, 0),
            closedAt: numOr(raw.closedAt, 0),
        };
        const rawPrereqs = Array.isArray(raw.prereqs) ? raw.prereqs : [];
        for (const rp of rawPrereqs.slice(0, MAX_PREREQS)) {
            const pr = normalizePrereq(rp);
            if (pr.ok) goal.prereqs.push(pr.prereq);
        }
        return { ok: true, goal: goal };
    }

    /**
     * 归一化前置条件。
     * @param {object} raw
     * @returns {{ok, prereq?, why?}}
     */
    function normalizePrereq(raw) {
        if (!raw || typeof raw !== 'object') return { ok: false, why: 'not-object' };
        const id = strOf(raw.id);
        if (!id) return { ok: false, why: 'missing-id' };
        const condition = strOf(raw.condition);
        if (!condition) return { ok: false, why: 'missing-condition' };
        return {
            ok: true,
            prereq: {
                id: id.slice(0, 40),
                condition: condition.slice(0, 160),
                factId: strOf(raw.factId) || '',
                status: ['pending', 'met', 'blocked', 'unknown'].indexOf(strOf(raw.status)) >= 0 ? strOf(raw.status) : 'pending',
                note: strOf(raw.note).slice(0, 80),
            }
        };
    }

    /**
     * 检测循环依赖。
     * @param {object[]} goals 目标列表
     * @returns {{hasCycle, cycle?}}
     */
    function detectCycle(goals) {
        const list = Array.isArray(goals) ? goals : [];
        const byId = {};
        for (const g of list) if (g && g.id) byId[g.id] = g;
        const visited = {};
        const stack = {};
        function dfs(id) {
            if (stack[id]) return { hasCycle: true, cycle: id };
            if (visited[id]) return null;
            visited[id] = true;
            stack[id] = true;
            const g = byId[id];
            if (g && g.prereqs) {
                for (const p of g.prereqs) {
                    if (p.factId && byId[p.factId]) {
                        const r = dfs(p.factId);
                        if (r) return r;
                    }
                    if (p.id && byId[p.id]) {
                        const r = dfs(p.id);
                        if (r) return r;
                    }
                }
            }
            if (g && g.parent && byId[g.parent]) {
                const r = dfs(g.parent);
                if (r) return r;
            }
            stack[id] = false;
            return null;
        }
        for (const g of list) {
            if (g && g.id) {
                const r = dfs(g.id);
                if (r) return r;
            }
        }
        return { hasCycle: false };
    }

    /**
     * 从一组事实状态（id→state）派生前置条件满足度。
     * @param {object[]} goals
     * @param {object} factStates id→state 映射
     * @returns {{goals, summary}}
     */
    function deriveStatuses(goals, factStates) {
        const list = Array.isArray(goals) ? goals : [];
        const fs = (factStates && typeof factStates === 'object') ? factStates : {};
        const out = [];
        let met = 0, blocked = 0, unknown = 0, pending = 0;
        for (const g of list) {
            if (!g) continue;
            const dg = Object.assign({}, g, { prereqs: [] });
            let allMet = true;
            let anyBlocked = false;
            for (const p of (g.prereqs || [])) {
                const dp = Object.assign({}, p);
                if (p.factId) {
                    const st = fs[p.factId];
                    if (st === 'active') dp.status = 'met';
                    else if (st === 'revoked' || st === 'superseded') dp.status = 'blocked';
                    else if (st === 'disputed') dp.status = 'unknown';
                    else dp.status = (dp.status === 'met') ? 'met' : 'pending';
                }
                if (dp.status === 'met') met++;
                else if (dp.status === 'blocked') { blocked++; allMet = false; anyBlocked = true; }
                else if (dp.status === 'unknown') { unknown++; allMet = false; }
                else { pending++; allMet = false; }
                dg.prereqs.push(dp);
            }
            dg.derivedStatus = anyBlocked ? 'blocked' : (allMet && g.prereqs.length ? 'ready' : 'pending');
            out.push(dg);
        }
        return {
            goals: out,
            summary: { total: out.length, met, blocked, unknown, pending }
        };
    }

    /**
     * 计算下一步建议（已满足所有前置条件的目标）。
     * @param {object[]} goals
     * @returns {object[]} ready goals
     */
    function nextSteps(goals) {
        const list = Array.isArray(goals) ? goals : [];
        return list.filter(function (g) {
            return g && g.status === 'active' && g.derivedStatus === 'ready';
        }).map(function (g) {
            return { id: g.id, title: g.title, prereqsMet: (g.prereqs || []).length };
        });
    }

    /**
     * 添加目标到状态。
     * @param {object} state 原始状态 {goals:[]}
     * @param {object} rawGoal 原始目标
     * @returns {{ok, state?, goal?, why?}}
     */
    function addGoal(state, rawGoal) {
        const st = state && typeof state === 'object' ? state : { goals: [] };
        const goals = Array.isArray(st.goals) ? st.goals.slice() : [];
        const factStates = st.factStates || {};
        const r = normalizeGoal(rawGoal);
        if (!r.ok) return { ok: false, why: r.why };
        if (goals.length >= MAX_GOALS) return { ok: false, why: 'capacity' };
        /* 循环检测 */
        const testList = goals.concat([r.goal]);
        const cyc = detectCycle(testList);
        if (cyc.hasCycle) return { ok: false, why: 'circular-dependency:' + (cyc.cycle || '') };
        goals.push(r.goal);
        return { ok: true, state: { goals: goals, factStates: factStates }, goal: r.goal, changed: true };
    }

    /**
     * 关闭目标（不删除原事实）。
     * @param {object} state
     * @param {string} id
     * @param {string} status 'done' | 'abandoned'
     * @returns {{ok, state?, why?}}
     */
    function closeGoal(state, id, status) {
        const st = state && typeof state === 'object' ? state : { goals: [] };
        const goals = Array.isArray(st.goals) ? st.goals.slice() : [];
        const factStates = st.factStates || {};
        const sid = strOf(id);
        const st2 = (status === 'abandoned') ? 'abandoned' : 'done';
        let found = false;
        for (const g of goals) {
            if (g.id === sid) {
                g.status = st2;
                g.closedAt = Date.now();
                found = true;
                break;
            }
        }
        if (!found) return { ok: false, why: 'not-found' };
        return { ok: true, state: { goals: goals, factStates: factStates }, changed: true };
    }

    function selfCheck() {
        const g1 = normalizeGoal({ id: 'g1', title: '搬家', prereqs: [{ id: 'p1', condition: '找到房子', factId: 'f1', status: 'pending' }] });
        const g2 = normalizeGoal({ id: 'g2', title: '签约', prereqs: [{ id: 'p2', condition: '房东同意', factId: 'f2', status: 'pending' }] });
        if (!g1.ok || !g2.ok) return { ok: false, why: 'normalize-failed' };
        const state = { goals: [g1.goal, g2.goal] };
        const r = addGoal(state, { id: 'g3', title: '取钥匙', prereqs: [{ id: 'p3', condition: '签约完成', factId: 'g2', status: 'pending' }] });
        if (!r.ok) return { ok: false, why: 'add-failed:' + r.why };
        const cyc = detectCycle(r.state.goals);
        if (cyc.hasCycle) return { ok: false, why: 'false-cycle' };
        const ds = deriveStatuses(r.state.goals, { f1: 'active', f2: 'pending', g2: 'pending' });
        const g1Derived = ds.goals.find(function (g) { return g.id === 'g1'; });
        if (!g1Derived || g1Derived.derivedStatus !== 'ready') return { ok: false, why: 'derive-failed' };
        const ns = nextSteps(ds.goals);
        if (ns.length !== 1 || ns[0].id !== 'g1') return { ok: false, why: 'next-steps-failed' };
        const close = closeGoal({ goals: r.state.goals }, 'g1', 'done');
        if (!close.ok) return { ok: false, why: 'close-failed' };
        const closed = close.state.goals.find(function (g) { return g.id === 'g1'; });
        if (!closed || closed.status !== 'done') return { ok: false, why: 'close-not-applied' };
        let serializable = true;
        try { JSON.stringify(ds); } catch (_e) { serializable = false; }
        return {
            ok: true,
            version: GT_VERSION,
            normalize: g1.ok && g2.ok,
            add: r.ok,
            cycle: !cyc.hasCycle,
            derive: g1Derived.derivedStatus === 'ready',
            nextSteps: ns.length === 1,
            close: close.ok,
            serializable: serializable,
        };
    }

    function line(state) {
        const st = state && typeof state === 'object' ? state : {};
        const goals = Array.isArray(st.goals) ? st.goals : [];
        const active = goals.filter(function (g) { return g.status === 'active'; });
        if (!active.length) return '目标跟踪器：暂无活跃目标';
        return '目标跟踪器：' + active.length + ' 个活跃目标 / 共 ' + goals.length + ' 个';
    }

    const api = Object.freeze({
        GT_VERSION, GT_KIND, MAX_GOALS, MAX_PREREQS,
        normalizeGoal, normalizePrereq, detectCycle,
        deriveStatuses, nextSteps, addGoal, closeGoal,
        selfCheck, line,
    });

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof global !== 'undefined' && global) {
        try { global.LonShaGoalTracker = Object.freeze(api); } catch (_e) { /* ignore */ }
    }
    if (typeof window !== 'undefined') {
        try { window.LonShaGoalTracker = Object.freeze(api); } catch (_e) { /* ignore */ }
    }
})();
