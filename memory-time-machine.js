/* ============================================================
 * memory-time-machine.js — R24-X8 记忆时间机器：回到某一轮，看差异
 *
 * 【治的欠债】有快照（snapshot-checkpoint）与回放（ledger-replay），但**用户视角没有
 *   「回到上周三的记忆状态」，也没有「两个时点的差异」。出问题时无法定位哪一轮开始记错。
 *
 * 【历史不可变】回滚不覆盖历史：旧时点仍可访问，回滚只是生成一个新分支。
 * 【四类差异】新增 / 修改 / 删除 / 状态变化（如 voided、tier 变化）。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaTimeMachine = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var KINDS = Object.freeze(["added", "modified", "removed", "status", "unchanged"]);

    function arr(v) { return Array.isArray(v) ? v : []; }
    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function idOf(m) { return String(m && m.id); }
    function stateOf(m) {
        return [String(m && m.voided === true), String(m && m.tier || ""), String(m && m.witness || "")].join("|");
    }

    function createMachine() {
        return { marks: [], branches: [{ id: "main", parent: null, store: { memories: [] } }] };
    }

    /** 打标记：保留该时点的记忆库摘要（快照，不可变）。 */
    function mark(machine, store, options) {
        var m = machine && typeof machine === "object" ? machine : createMachine();
        var o = options && typeof options === "object" ? options : {};
        var snap = clone(store && store.memories ? store.memories : []);
        var rec = {
            round: Number(o.round) || m.marks.length + 1,
            at: String(o.at || ""),
            auto: o.auto === true,
            label: String(o.label || ""),
            store: { memories: snap }
        };
        var next = { marks: arr(m.marks).concat([rec]), branches: arr(m.branches).slice() };
        return { ok: true, machine: next, round: rec.round, count: snap.length };
    }

    function findMark(machine, round) {
        return arr(machine && machine.marks).filter(function (k) { return k.round === Number(round); })[0] || null;
    }

    /** 两时点差异（四类 + 未变）。 */
    function diff(machine, roundA, roundB) {
        var a = findMark(machine, roundA), b = findMark(machine, roundB);
        if (!a || !b) return { ok: false, bad: ["no-such-round"], changes: [] };
        var ma = {}, mb = {};
        arr(a.store.memories).forEach(function (x) { ma[idOf(x)] = x; });
        arr(b.store.memories).forEach(function (x) { mb[idOf(x)] = x; });
        var changes = [];
        Object.keys(mb).forEach(function (id) {
            if (!ma[id]) { changes.push({ kind: "added", id: id }); return; }
            if (JSON.stringify(ma[id]) !== JSON.stringify(mb[id])) {
                if (stateOf(ma[id]) !== stateOf(mb[id])) changes.push({ kind: "status", id: id, before: stateOf(ma[id]), after: stateOf(mb[id]) });
                else changes.push({ kind: "modified", id: id });
            } else changes.push({ kind: "unchanged", id: id });
        });
        Object.keys(ma).forEach(function (id) { if (!mb[id]) changes.push({ kind: "removed", id: id }); });
        changes.sort(function (x, y) { return x.id < y.id ? -1 : 1; });
        var counts = { added: 0, modified: 0, removed: 0, status: 0, unchanged: 0 };
        changes.forEach(function (c) { counts[c.kind] += 1; });
        return { ok: true, from: Number(roundA), to: Number(roundB), changes: changes, counts: counts };
    }

    /** 回滚：生成新分支，历史不动。 */
    function checkout(machine, round, options) {
        var o = options && typeof options === "object" ? options : {};
        var k = findMark(machine, round);
        if (!k) return { ok: false, bad: ["no-such-round"], machine: machine };
        var next = { marks: arr(machine.marks).slice(), branches: arr(machine.branches).slice() };
        var id = String(o.branchId || ("b" + (next.branches.length + 1)));
        next.branches.push({ id: id, parent: String(o.parent || "main"), atRound: Number(round), store: clone(k.store) });
        return { ok: true, machine: next, branch: id, store: clone(k.store) };
    }

    /** 定位辅助：这条记忆第一次出现在第几轮。 */
    function firstSeen(machine, id) {
        var marks = arr(machine && machine.marks).slice().sort(function (x, y) { return x.round - y.round; });
        for (var i = 0; i < marks.length; i++) {
            if (arr(marks[i].store.memories).some(function (m) { return idOf(m) === String(id); })) {
                var m = arr(marks[i].store.memories).filter(function (x) { return idOf(x) === String(id); })[0];
                return { ok: true, round: marks[i].round, text: String(m && m.text || ""), at: marks[i].at };
            }
        }
        return { ok: false, bad: ["not-found"] };
    }

    function machineSelfCheck() {
        var bad = [];
        if (KINDS.length !== 5) bad.push("kinds");
        var m = createMachine();
        var s1 = { memories: [{ id: "m1", text: "一", at: "2026-11-01" }, { id: "m2", text: "二", at: "2026-11-01" }] };
        var a = mark(m, s1, { round: 1, at: "2026-11-01" });
        var s2 = { memories: [{ id: "m1", text: "一改", at: "2026-11-01" }, { id: "m3", text: "三", at: "2026-11-02" }] };
        var b = mark(a.machine, s2, { round: 2, at: "2026-11-02" });
        var d = diff(b.machine, 1, 2);
        if (!d.ok) bad.push("diff-fail");
        if (d.counts.added !== 1 || d.counts.removed !== 1 || d.counts.modified !== 1) bad.push("diff-counts:" + JSON.stringify(d.counts));
        var co = checkout(b.machine, 1, { branchId: "back" });
        if (!co.ok || JSON.stringify(co.store) !== JSON.stringify(s1)) bad.push("rollback-not-equal");
        if (arr(co.machine.marks).length !== 2) bad.push("history-lost");
        if (arr(co.machine.branches).length !== 2) bad.push("branch-missing");
        var fsx = firstSeen(b.machine, "m3");
        if (!fsx.ok || fsx.round !== 2) bad.push("first-seen");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "marks=" + arr(b.machine.marks).length + " added=" + d.counts.added + " removed=" + d.counts.removed + " modified=" + d.counts.modified + " branches=" + arr(co.machine.branches).length
        };
    }

    return {
        KINDS: KINDS, createMachine: createMachine, mark: mark, findMark: findMark,
        diff: diff, checkout: checkout, firstSeen: firstSeen,
        machineSelfCheck: machineSelfCheck
    };
}));
