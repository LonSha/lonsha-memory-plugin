/* ============================================================
 * assembly-layering.js — R24-O3 加载期性能：装配分层与冷启动预算
 *
 * 【治的欠债】装载期就把整台 MemoryEngine 拉起来（8500 行 + 48 个 IIFE 依赖），
 *   而用户可能只是打开设置页。仓库也没有冷启动读数。
 *
 * 【做法】装载期只 register（描述符 + 懒 getter），首次真正需要时才实例化。
 *   两条路都实现：proxy 路（新宿主）与 defineProperty 路（老宿主 / 无 Proxy）。
 *
 * 【铁律】惰性化不得改变可观察行为：懒 getter 取到的对象与急加载逐字段一致。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaAssemblyLayering = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function nowMs() {
        if (typeof process !== "undefined" && process.hrtime && process.hrtime.bigint) {
            return Number(process.hrtime.bigint()) / 1e6;
        }
        return Date.now();
    }

    /** 装配登记表。构造期只存描述符，一个都不实例化。 */
    function createRegistry(options) {
        var o = options && typeof options === "object" ? options : {};
        var desc = {};
        var inst = {};
        var order = [];
        var t0 = nowMs();
        var registerMs = 0;
        var instantiateMs = 0;
        var firstReadyMs = null;

        function materialize(name) {
            if (Object.prototype.hasOwnProperty.call(inst, name)) return inst[name];
            var d = desc[name];
            if (!d) return undefined;
            var a = nowMs();
            inst[name] = d.factory();
            d.built = true;
            instantiateMs += nowMs() - a;
            order.push(name);
            if (firstReadyMs === null) firstReadyMs = nowMs() - t0;
            return inst[name];
        }

        function register(name, factory) {
            var a = nowMs();
            if (typeof name !== "string" || !name) throw new Error("assembly: name required");
            if (typeof factory !== "function") throw new Error("assembly: factory required: " + name);
            desc[name] = { factory: factory, built: false };
            registerMs += nowMs() - a;
            return apiObj;
        }

        function readings() {
            return {
                registerMs: Number(registerMs.toFixed(3)),
                instantiateMs: Number(instantiateMs.toFixed(3)),
                firstReadyMs: firstReadyMs === null ? null : Number(firstReadyMs.toFixed(3)),
                registered: Object.keys(desc).length,
                materialized: order.slice(),
                materializedCount: order.length,
                path: o.noProxy === true ? "defineProperty" : "lazy-getter"
            };
        }

        var apiObj = {};
        if (o.noProxy === true) {
            apiObj.__seal = function () {
                Object.keys(desc).forEach(function (name) {
                    Object.defineProperty(apiObj, name, {
                        enumerable: true, configurable: true,
                        get: function () { return materialize(name); }
                    });
                });
                return apiObj;
            };
            apiObj.__register = register;
            apiObj.__readings = readings;
            apiObj.__has = function (n) { return !!desc[n]; };
        } else {
            apiObj = new Proxy(apiObj, {
                get: function (t, k) {
                    if (typeof k !== "string") return t[k];
                    if (k === "__readings") return readings;
                    if (k === "__register") return register;
                    if (k === "__desc") return desc;
                    if (k === "__has") return function (n) { return !!desc[n]; };
                    if (Object.prototype.hasOwnProperty.call(desc, k)) return materialize(k);
                    return t[k];
                },
                has: function (t, k) { return (typeof k === "string" && Object.prototype.hasOwnProperty.call(desc, k)) ? true : (k in t); }
            });
            apiObj.__register = register;
            apiObj.__readings = readings;
            apiObj.__desc = desc;
            apiObj.__has = function (n) { return !!desc[n]; };
        }
        return apiObj;
    }

    /** 急加载（基线）：全员实例化，用于对拍。 */
    function createEager(specs) {
        var out = {};
        var a = nowMs();
        (Array.isArray(specs) ? specs : []).forEach(function (s) { out[s.name] = s.factory(); });
        return { api: out, ms: Number((nowMs() - a).toFixed(3)) };
    }

    /** 冷启动预算读数：装载耗时 / 实例化耗时 / 首条可用时间。 */
    function coldStart(specs, options) {
        var list = Array.isArray(specs) ? specs : [];
        var o = options && typeof options === "object" ? options : {};
        var reg = createRegistry({ noProxy: o.noProxy === true });
        list.forEach(function (s) { reg.__register(s.name, s.factory); });
        if (o.noProxy === true && typeof reg.__seal === "function") reg.__seal();
        var before = reg.__readings();
        var touched = [];
        var want = Array.isArray(o.touch) ? o.touch : ["settings"];
        want.forEach(function (n) {
            if (reg.__has(n)) { reg[n]; touched.push(n); }
        });
        var after = reg.__readings();
        return {
            ok: true,
            registerMs: before.registerMs,
            instantiateMs: after.instantiateMs,
            firstReadyMs: after.firstReadyMs,
            touched: touched,
            materializedCount: after.materializedCount,
            registered: after.registered,
            path: after.path,
            unusedInstantiated: after.materialized.filter(function (n) { return touched.indexOf(n) === -1; })
        };
    }

    /** 对拍：惰性 vs 急加载，返回值逐字段一致。 */
    function parityCheck(specs) {
        var list = Array.isArray(specs) ? specs : [];
        var reg = createRegistry();
        list.forEach(function (s) { reg.__register(s.name, s.factory); });
        var lazy = {};
        list.forEach(function (s) { lazy[s.name] = reg[s.name]; });
        var eager = createEager(list).api;
        var bad = [];
        list.forEach(function (s) {
            if (JSON.stringify(lazy[s.name]) !== JSON.stringify(eager[s.name])) bad.push(s.name);
        });
        return { ok: bad.length === 0, bad: bad, compared: list.length };
    }

    /** 48 个依赖的模拟装配（读数用，不依赖真仓）。 */
    function makeSpecs(n) {
        var count = Number(n) > 0 ? Number(n) : 48;
        var out = [];
        for (var i = 0; i < count; i++) {
            var name = i === 0 ? "settings" : (i === 1 ? "memoryCore" : "dep" + i);
            out.push({
                name: name,
                factory: (function (k) {
                    return function () {
                        var acc = 0;
                        for (var j = 0; j < 2000; j++) acc += (j * (k + 1)) % 7;
                        return { name: "dep" + k, acc: acc, fields: { a: k, b: String(k), c: [k] } };
                    };
                }(i))
            });
        }
        return out;
    }

    function assemblySelfCheck() {
        var bad = [];
        var specs = makeSpecs(48);
        var r = coldStart(specs, { touch: ["settings"] });
        if (r.materializedCount !== 1) bad.push("settings-only-touched-more");
        if (r.unusedInstantiated.length !== 0) bad.push("eager-leak");
        var p = parityCheck(specs);
        if (!p.ok) bad.push("parity:" + p.bad.join(","));
        var np = coldStart(specs, { touch: ["settings"], noProxy: true });
        if (np.materializedCount !== 1) bad.push("no-proxy-path");
        if (np.path !== "defineProperty") bad.push("no-proxy-label");
        var eager = createEager(specs);
        if (!(eager.ms >= 0)) bad.push("eager-ms");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "lazy=" + r.materializedCount + "/" + r.registered + " eagerMs=" + eager.ms + " parity=" + p.compared + " noProxy=" + np.path
        };
    }

    return {
        createRegistry: createRegistry,
        createEager: createEager,
        coldStart: coldStart,
        parityCheck: parityCheck,
        makeSpecs: makeSpecs,
        assemblySelfCheck: assemblySelfCheck
    };
}));
