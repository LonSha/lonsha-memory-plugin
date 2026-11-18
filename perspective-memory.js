/* ============================================================
 * perspective-memory.js — R24-X7 多视角记忆：同一件事，不同的人记得不一样
 *
 * 【治的欠债】本仓记忆是**单一客观口径**：视角在抽取时就被抹平，于是角色变得「全知」——
 *   它知道自己不可能知道的事。
 *
 * 【三态证人】witness = 亲历(lived) / 听说(heard) / 推断(inferred)；holder 是谁记得这条。
 * 【听说必须有来源】没有来源的听说记作 `hearsay_unknown`，**不许当成亲历**。
 * 【越界即红】注入时按 holder 过滤；不在场者的召回不得包含该事件（负控制）。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaPerspectiveMemory = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var WITNESS = Object.freeze(["lived", "heard", "inferred"]);

    function arr(v) { return Array.isArray(v) ? v : []; }
    function idOf(m) { return String(m && m.id); }
    function textOf(m) { return String(m && m.text || ""); }
    function holderOf(m) { return String(m && (m.holder || m.owner) || ""); }

    /** 规范化：缺 witness 一律 inferred；heard 无来源 ⇒ hearsay_unknown。 */
    function normalize(m) {
        var w = WITNESS.indexOf(String(m && m.witness)) !== -1 ? String(m.witness) : "inferred";
        var out = Object.assign({}, m, { witness: w, holder: holderOf(m) });
        if (w === "heard") {
            var from = String((m && (m.heardFrom || m.source)) || "");
            out.heardFrom = from;
            out.hearsayUnknown = from.length === 0;
        }
        return out;
    }

    /** 可见性：公开事件人人可见；私密只 holder 可见；听说不因此变成可见。 */
    function visibleTo(m, who) {
        var mem = normalize(m);
        if (mem.public === true) return true;
        return mem.holder === String(who);
    }

    /** 注入文本：听说要带「（听 X 说）」；来源不可考要写明。 */
    function injectionText(m) {
        var mem = normalize(m);
        var t = textOf(mem);
        if (mem.witness === "heard") {
            t = mem.hearsayUnknown ? t + "（听说，来源不可考）" : t + "（听" + mem.heardFrom + "说）";
        } else if (mem.witness === "inferred") {
            t = t + "（推断）";
        }
        return t;
    }

    /** 召回：按 holder 过滤 + 生成带视角标注的注入行。 */
    function recallFor(store, who, options) {
        var o = options && typeof options === "object" ? options : {};
        var list = arr(store && store.memories);
        var k = Number(o.k) > 0 ? Number(o.k) : 10;
        var rows = [];
        list.forEach(function (m) {
            if (!visibleTo(m, who)) return;
            if (o.eventId && String(m.eventId) !== String(o.eventId)) return;
            var mem = normalize(m);
            rows.push({
                id: idOf(mem),
                witness: mem.witness,
                holder: mem.holder,
                hearsayUnknown: mem.hearsayUnknown === true,
                text: injectionText(mem),
                source: String(mem.heardFrom || ""),
            });
        });
        rows.sort(function (x, y) { return x.id < y.id ? -1 : 1; });
        return { ok: true, who: String(who), results: rows.slice(0, k), scanned: list.length };
    }

    /** 越界检查（负控制专用）：某人的召回里不允许出现别人私密的内容。 */
    function leakCheck(store, who) {
        var res = recallFor(store, who, { k: 1000 });
        var list = arr(store && store.memories);
        var leaks = [];
        list.forEach(function (m) {
            if (m.public === true) return;
            if (holderOf(m) === String(who)) return;
            if (res.results.some(function (r) { return r.id === idOf(m); })) leaks.push(idOf(m));
        });
        return { ok: leaks.length === 0, leaks: leaks };
    }

    function fixture() {
        return { memories: [
            { id: "evA", eventId: "rain", public: true, text: "那场雨下在车站", holder: "林夏", witness: "lived" },
            { id: "evB", eventId: "rain", text: "那场雨下在车站（同事）", holder: "陈舟", witness: "heard", heardFrom: "林夏" },
            { id: "evC", eventId: "rain", text: "他们在车站争吵", holder: "陈舟", witness: "inferred" },
            { id: "p1", text: "陈舟的私事", holder: "陈舟", witness: "lived" }
        ] };
    }

    function perspectiveSelfCheck() {
        var bad = [];
        if (WITNESS.length !== 3) bad.push("witness-states");
        var s = fixture();
        var a = recallFor(s, "林夏");
        if (!a.results.some(function (r) { return r.id === "evA"; })) bad.push("a-lost");
        if (a.results.some(function (r) { return r.id === "evB"; })) bad.push("a-sees-b");
        var c = recallFor(s, "小雨");
        if (c.results.length !== 1 || c.results[0].id !== "evA") bad.push("c-should-only-see-public");
        var b = recallFor(s, "陈舟");
        var evB = b.results.filter(function (r) { return r.id === "evB"; })[0];
        if (!evB || evB.text.indexOf("（听林夏说）") === -1) bad.push("heard-annotation");
        var unknown = { memories: [{ id: "h1", text: "听说要下雨", holder: "小雨", witness: "heard" }] };
        var u = recallFor(unknown, "小雨").results[0];
        if (!u.hearsayUnknown || u.text.indexOf("来源不可考") === -1) bad.push("hearsay-unknown");
        var lk = leakCheck(s, "小雨");
        if (!lk.ok) bad.push("leak:" + lk.leaks.join(","));
        return {
            ok: bad.length === 0, bad: bad,
            sample: "witness=3 a=" + a.results.length + " c=" + c.results.length + " leak=" + lk.leaks.length
        };
    }

    return {
        WITNESS: WITNESS, normalize: normalize, visibleTo: visibleTo,
        injectionText: injectionText, recallFor: recallFor, leakCheck: leakCheck,
        fixture: fixture,
        perspectiveSelfCheck: perspectiveSelfCheck
    };
}));
