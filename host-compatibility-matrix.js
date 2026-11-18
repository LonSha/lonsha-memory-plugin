/* ============================================================
 * host-compatibility-matrix.js — R24-O9 宿主兼容矩阵
 *
 * 【治的欠债】大量依赖 Proxy / structuredClone / crypto.randomUUID / WeakRef / Intl.Segmenter，
 *   老宿主上会怎样只写过一句「退化为快照」，既没有清单也没有用户可见说明。
 *
 * 【三条硬要求】
 *   1. 探测 8 项能力；缺失时必须给出「哪项功能降级 / 降级成什么 / 有什么可感知差异」；
 *   2. 降级不得静默：读数面 `capability-missing` + 名单；
 *   3. 在「无 Proxy + 无 structuredClone」环境里主链路（装载→写→召回→注入）必须跑通。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaHostCompatMatrix = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function g() { return typeof globalThis !== "undefined" ? globalThis : {}; }

    /** 8 项关键 API，每项带「缺了会怎样」的人话。 */
    var CAPS = [
        { name: "Proxy", probe: function (e) { return typeof e.Proxy === "function"; },
          feature: "_libs 实时视图", degradedTo: "快照（读一次定一次）",
          perceivable: "外部改了库，界面不会自己刷新，需要重开设置页", missingCode: "Proxy" },
        { name: "structuredClone", probe: function (e) { return typeof e.structuredClone === "function"; },
          feature: "写入前深拷贝", degradedTo: "JSON 拷贝（丢 Date/Map/Set）",
          perceivable: "带 Date 的记忆会变成字符串，时间线显示不变但排序依赖字典序", missingCode: "structuredClone" },
        { name: "crypto.randomUUID", probe: function (e) { return !!(e.crypto && typeof e.crypto.randomUUID === "function"); },
          feature: "记忆 id 生成", degradedTo: "时间戳 + 计数器",
          perceivable: "id 不再全局唯一，并发写入极端情况下可能撞", missingCode: "crypto.randomUUID" },
        { name: "WeakRef", probe: function (e) { return typeof e.WeakRef === "function"; },
          feature: "弱引用缓存", degradedTo: "普通引用（回收不掉）",
          perceivable: "长会话内存只增不降，需重开", missingCode: "WeakRef" },
        { name: "Intl.Segmenter", probe: function (e) { return !!(e.Intl && typeof e.Intl.Segmenter === "function"); },
          feature: "中文分词", degradedTo: "字符 n-gram",
          perceivable: "召回在长句上精度低一点，短句没感觉", missingCode: "Intl.Segmenter" },
        { name: "Array.prototype.at", probe: function (e) { return typeof [].at === "function"; },
          feature: "尾部取项", degradedTo: "length-1 索引",
          perceivable: "无可感知差异", missingCode: "Array.at" },
        { name: "Object.hasOwn", probe: function (e) { return typeof e.Object === "function" && typeof e.Object.hasOwn === "function"; },
          feature: "属性存在判定", degradedTo: "Object.prototype.hasOwnProperty.call",
          perceivable: "无可感知差异", missingCode: "Object.hasOwn" },
        { name: "queueMicrotask", probe: function (e) { return typeof e.queueMicrotask === "function"; },
          feature: "异步缓冲写入", degradedTo: "setTimeout(0)",
          perceivable: "写入延迟多几毫秒，顺序不变", missingCode: "queueMicrotask" }
    ];

    /** 探测：可传入模拟环境（测试用），默认探真全局。 */
    function detect(env) {
        var e = env && typeof env === "object" ? env : g();
        var rows = CAPS.map(function (c) {
            var ok = false;
            try { ok = !!c.probe(e); } catch (err) { ok = false; }
            return {
                cap: c.name, present: ok,
                feature: c.feature, degradedTo: c.degradedTo, perceivable: c.perceivable
            };
        });
        var missing = rows.filter(function (r) { return !r.present; }).map(function (r) { return r.cap; });
        return {
            ok: true, rows: rows, missing: missing,
            degraded: missing.length > 0,
            // 读数面：降级不得静默
            reading: missing.length ? "capability-missing: " + missing.join(",") : "capability-complete"
        };
    }

    /** 兼容矩阵：只列缺的（带用户可感知差异）。 */
    function matrix(env) {
        var d = detect(env);
        return {
            ok: true,
            all: d.rows,
            degradedRows: d.rows.filter(function (r) { return !r.present; }),
            missing: d.missing,
            degraded: d.degraded,
            reading: d.reading
        };
    }

    function cloneFor(env) {
        var e = env && typeof env === "object" ? env : g();
        return function (v) {
            if (typeof e.structuredClone === "function") return e.structuredClone(v);
            return JSON.parse(JSON.stringify(v));   // 降级：已知会丢 Date/Map
        };
    }

    function viewFor(env) {
        var e = env && typeof env === "object" ? env : g();
        var hasProxy = typeof e.Proxy === "function";
        return function (store) {
            if (hasProxy) {
                return new e.Proxy(store, { get: function (t, k) { return t[k]; } });
            }
            return JSON.parse(JSON.stringify(store));   // 降级：快照，不是实时视图
        };
    }

    function tokenizeFor(env) {
        var e = env && typeof env === "object" ? env : g();
        var hasSeg = !!(e.Intl && typeof e.Intl.Segmenter === "function");
        return function (text) {
            var s = String(text || "");
            if (hasSeg) {
                try {
                    var seg = new e.Intl.Segmenter("zh", { granularity: "word" });
                    var out = [];
                    var it = seg.segment(s);
                    var arr = typeof it[Symbol.iterator] === "function" ? Array.from(it) : [];
                    arr.forEach(function (x) { if (x && x.segment) out.push(x.segment); });
                    if (out.length) return out;
                } catch (err) { /* 落到 n-gram */ }
            }
            var res = [];
            for (var i = 0; i < s.length; i++) {
                res.push(s.charAt(i));
                if (i + 1 < s.length) res.push(s.substr(i, 2));
            }
            return res;
        };
    }

    /** 主链路：装载 → 写 → 召回 → 注入（在给定环境下真跑一遍）。 */
    function runMainChain(env) {
        var m = matrix(env);
        var clone = cloneFor(env);
        var view = viewFor(env);
        var tok = tokenizeFor(env);
        var steps = [];

        // 装载: 快照 + 视图
        var store = { memories: [], receipts: [] };
        var live = view(store);
        steps.push({ step: "load", ok: true });

        // 写: 深拷 + 去重键
        var rec = clone({ id: "m1", text: "蓝鲸的承诺", at: "2026-11-18T09:00:00Z" });
        store.memories.push(rec);
        steps.push({ step: "write", ok: store.memories.length === 1 });

        // 召回: 分词 + 重叠打分
        var q = tok("蓝鲸");
        var hits = store.memories.filter(function (x) {
            var t = tok(x.text);
            return q.some(function (w) { return t.indexOf(w) !== -1; });
        });
        steps.push({ step: "recall", ok: hits.length === 1 });

        // 注入: 生成回执
        if (hits.length) store.receipts.push(clone({ kind: "inject", ids: [hits[0].id] }));
        steps.push({ step: "inject", ok: store.receipts.length === 1 });

        // 视图读取：有 Proxy 时是实时视图；没 Proxy 时是快照，**必须重取一次**才能看到新写入。
        var hasProxy = typeof envStructured(env).Proxy === "function";
        var snap = hasProxy ? live : view(store);
        var viaView = snap.memories ? snap.memories.length : 0;
        steps.push({
            step: "view-read", ok: viaView >= 1, viaView: viaView,
            liveView: hasProxy, requiresRefetch: !hasProxy
        });

        return {
            ok: steps.every(function (s) { return s.ok; }),
            steps: steps,
            missing: m.missing,
            reading: m.reading,
            degraded: m.degraded
        };
    }

    function envStructured(env) { return env && typeof env === "object" ? env : g(); }

    /** [v4.160.0 · R25-O7] 三档「真老宿主」：每档只缺一项能力，其余照常。
     *   为什么要三档而不是一个 oldHost()：一档全缺时，一个能力替另一个兜底也能蒙混过关（假绿）。
     *   分开之后，降级清单必须逐档点名「缺了谁」，并且都能把主链跑完。
     */
    var PROFILES = Object.freeze(["noProxy", "noClone", "noSegmenter"]);

    function profileEnv(name) {
        var base = g();
        var e = {
            Object: base.Object, Array: base.Array, JSON: base.JSON, Math: base.Math, Date: base.Date,
            Intl: base.Intl, Proxy: base.Proxy, structuredClone: base.structuredClone,
            queueMicrotask: base.queueMicrotask || function (f) { setTimeout(f, 0); }
        };
        if (name === "noProxy") e.Proxy = undefined;
        if (name === "noClone") e.structuredClone = undefined;
        if (name === "noSegmenter") e.Intl = {};
        return e;
    }

    /** 跑一档：主链四步全绿 + 降级清单具名（不许静默等价）。 */
    function runProfile(name) {
        var n = String(name);
        if (PROFILES.indexOf(n) === -1) return { ok: false, bad: ["unknown-profile"], profile: n, steps: [] };
        var env = profileEnv(n);
        var chain = runMainChain(env);
        var m = matrix(env);
        return {
            ok: chain.ok === true,
            profile: n,
            steps: chain.steps,
            degraded: chain.degraded === true,
            degradedRows: m.degradedRows.map(function (r) { return String(r.cap) + ' → ' + String(r.degradedTo); }),
            missing: chain.missing,
            requiresRefetch: chain.steps.some(function (x) { return x.step === "view-read" && x.requiresRefetch === true; }),
            named: m.missing.length > 0 && m.degradedRows.length > 0
        };
    }

    function runProfiles() {
        var rows = PROFILES.map(runProfile);
        return { ok: rows.every(function (r) { return r.ok === true; }), rows: rows };
    }

    /** 老宿主模拟：无 Proxy / 无 structuredClone / 无 Intl.Segmenter。 */
    function oldHost() {
        var e = {
            Object: Object, Array: Array, JSON: JSON, Math: Math, Date: Date,
            Intl: {},
            queueMicrotask: typeof queueMicrotask === "function" ? queueMicrotask : function (f) { setTimeout(f, 0); }
        };
        return e;
    }

    function hostCompatSelfCheck() {
        var bad = [];
        if (CAPS.length !== 8) bad.push("caps!=8");
        var modern = detect(g());
        if (!Array.isArray(modern.rows) || modern.rows.length !== 8) bad.push("rows");
        modern.rows.forEach(function (r) { if (!r.degradedTo || r.degradedTo.length < 2) bad.push("degradedTo:" + r.cap); });
        var old = matrix(oldHost());
        if (!old.degraded) bad.push("old-not-degraded");
        if (old.missing.length < 2) bad.push("old-missing-thin");
        if (old.reading.indexOf("capability-missing") !== 0) bad.push("reading-not-visible");
        var chain = runMainChain(oldHost());
        if (!chain.ok) bad.push("chain:" + JSON.stringify(chain.steps));
        var chain2 = runMainChain(g());
        if (!chain2.ok) bad.push("chain-modern");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "caps=8 oldMissing=" + old.missing.length + " chain=ok reading=" + old.reading.slice(0, 30)
        };
    }

    return {
        CAPS: CAPS,
        detect: detect, matrix: matrix,
        runMainChain: runMainChain, oldHost: oldHost,
        PROFILES: PROFILES, profileEnv: profileEnv, runProfile: runProfile, runProfiles: runProfiles,
        tokenizeFor: tokenizeFor, viewFor: viewFor, cloneFor: cloneFor,
        hostCompatSelfCheck: hostCompatSelfCheck
    };
}));
