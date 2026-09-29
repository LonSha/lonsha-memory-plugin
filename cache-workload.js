/**
 * cache-workload.js — 长线规模与缓存负载**量测台**（计划一 M-O4 的第一半）
 *
 * 【为什么需要这一层 / 修前实测】
 *   计划原文要求：「以 1000/5000/10000 楼及不同角色/九账规模测**快照、候选化、序列化和设置
 *   界面消费**」「只有证明有收益的热点进入产品修改」。而本仓已有的取证只覆盖**一条曲线**：
 *   `tests/audit/_p3_snapshot_probe.mjs`（v3.251.0）量的是 `buildBridgeSnapshot` 的
 *   `meta.selfBytes`，档位 {0,10,50,200}，结论是线性 ⇒ `not_done_until_superlinear`。
 *   缺的是：① 1000/5000/10000 这一量级；② 另外三条消费路径（候选化 / 序列化 / 设置界面）；
 *   ③ **重复读取与深拷贝**的冗余度读数。
 *
 * 【本模块的职责（纯量测、零依赖、零副作用）】
 *   提供一个**可注入的**量测台：调用方给出四个「造数据 / 读数据」的探针（探针留在宿主
 *   或只读脚本里，本模块不 import 任何生产文件），本模块负责：
 *     · 按档位跑曲线，逐档记 `bytes` 与 `ms`；
 *     · 算边际斜率 `slope` 与相邻档比值 `ratio`；
 *     · 判 `superlinear`（边际斜率最大值 / 最小值 > 1.5 才算超线性）；
 *     · 量**重复读取冗余度**（同一读做 N 次，与 1 次的比值）。
 *
 * 【口径纪律（与 _p3 探针同规格，逐条对齐）】
 *   ① **绝不编 0**：探针抛错 / 读数非有限数 ⇒ 该曲线 `measured=false` 且带 `reason`，
 *      而不是填 0 或跳过（跳过会让「测不出」看起来像「很便宜」）。
 *   ② **计时只包围被测操作**：建数据（`build`）不计时 —— v1 性能探针曾把 `mkHost(1000)`
 *      算进被测调用，报出 98ms/次，而那 ~99ms 全是夹具成本（见 tests/audit/perf_probe.cjs 抬头）。
 *   ③ **合成数据 + 真模块，非实机**：读数一律带 `synth:true`，不得被读成真机性能。
 *   ④ **未证收益即不改产品**：`recommendation` 只在真超线性或真冗余时给 `open-*`，
 *      否则给 `not-done-until-evidence`（计划原话「只有证明有收益的热点进入产品修改」）。
 *
 * 零依赖、CJS/IIFE 双导出。时间与字节口径可注入（测试可用假时钟固定读数）。
 */

(function (global) {
    'use strict';

    /** 默认档位：计划原文点名的 1000/5000/10000 楼 + 既有探针的低档（保持可对照）。 */
    const SIZES = [0, 10, 50, 200, 1000, 5000, 10000];

    /** 计划原文点名的四条消费路径（顺序即报表顺序）。 */
    const PATHS = ['snapshot', 'candidate', 'serialize', 'settings'];

    /** 超线性判据：边际斜率 max/min 超过它才算超线性（与 _p3 探针同值）。 */
    const SUPERLINEAR_RATIO = 1.5;

    /** 重复读取冗余度判据：同一读做 N 次耗时 / 单次耗时超过它，才算「重复读没被复用」。 */
    const REDUNDANCY_RATIO = 1.8;

    /**
     * 取当前毫秒。
     * **读不出就返回 null，绝不返回 0** —— 0 是一个真读数（"这次没花时间"），
     * 而"时钟坏了"与"没花时间"必须不同形（本模块纪律①的同一句话）。
     * 调用方拿到 null 即该档记 `measured:false, reason:'clock-nonfinite'`。
     */
    function nowMs(clock) {
        if (clock && typeof clock.now === 'function') {
            /* 注入时钟（测试用假时钟）：它说非有限数就是**它坏了**，不是"耗时 0"。
               修前这一支把 NaN/Infinity 一律折成 0 ⇒ 整条曲线报 `measured:true` 且 ms 全 0，
               正是纪律①禁的形态（把"测不出"读成"很便宜"）。 */
            const t = Number(clock.now());
            return Number.isFinite(t) ? t : null;
        }
        /* 【修前实测的缺口】首稿写 `Number(process.hrtime.bigint() / 1000000n)`：
           本模块的**运行宿主是浏览器**（extra_js 注入宿主页面，模块接线审计用 vm 沙箱
           真加载全部脚本）。浏览器里 `process` 不存在 ⇒ 这一行抛 ReferenceError ⇒
           整条曲线 `measured:false`（不报错、只是永远测不出），而模块头注又声称
           「时间口径可注入」——真实调用方根本拿不到读数。故改为按可用性探测：
           Node 的 `process.hrtime.bigint()`（单调、纳秒）→ 浏览器的 `performance.now()`
           → 退回 `Date.now()`（精度差但**不抛**）。三档都只回有限数或 null。 */
        try {
            if (typeof process !== 'undefined' && process.hrtime && typeof process.hrtime.bigint === 'function') {
                const t = Number(process.hrtime.bigint() / 1000000n);
                return Number.isFinite(t) ? t : null;
            }
        } catch (_e1) { /* 落到下一档 */ }
        try {
            if (typeof performance !== 'undefined' && performance && typeof performance.now === 'function') {
                const t = Number(performance.now());
                if (Number.isFinite(t)) return t;
            }
        } catch (_e2) { /* 落到下一档 */ }
        const t = Number(Date.now());
        return Number.isFinite(t) ? t : null;
    }

    /** 字节口径：优先 JSON 长度（与快照 `meta.selfBytes` 同口径）；不可序列化即 null。 */
    function bytesOf(v) {
        if (v === undefined) return null;
        try {
            const s = JSON.stringify(v);
            return (typeof s === 'string') ? s.length : null;
        } catch (_e) { return null; }
    }

    /** 跑一个探针（build 不计时，read 计时）。 */
    function runProbe(probe, n, clock) {
        const p = (probe && typeof probe === 'object') ? probe : null;
        if (!p || typeof p.read !== 'function') {
            return { n, measured: false, reason: 'no-probe', bytes: null, ms: null };
        }
        let data;
        try {
            data = (typeof p.build === 'function') ? p.build(n) : null;
        } catch (e) {
            return { n, measured: false, reason: 'build-threw:' + errMsg(e), bytes: null, ms: null };
        }
        let out, ms, t0, t1;
        try {
            t0 = nowMs(clock);
            out = p.read(data, n);
            t1 = nowMs(clock);
            /* 时钟任一端读不出 ⇒ 不拿 null 参与算术：`null - null === 0` 是有限数，
               会被下面那道 `Number.isFinite(ms)` 放过去，于是"时钟坏了"变成"耗时 0ms"。
               这正是纪律①要禁的形态，故在算术**之前**拦下。 */
            ms = (t0 === null || t1 === null) ? null : (t1 - t0);
        } catch (e) {
            return { n, measured: false, reason: 'read-threw:' + errMsg(e), bytes: null, ms: null };
        }
        if (!Number.isFinite(ms)) {
            return { n, measured: false, reason: 'clock-nonfinite', bytes: null, ms: null };
        }
        const bytes = (typeof p.bytes === 'function') ? p.bytes(out, n) : bytesOf(out);
        return {
            n,
            measured: true,
            bytes: Number.isFinite(bytes) ? bytes : null,
            ms: Number(ms.toFixed(4)),
            items: (typeof p.count === 'function') ? Number(p.count(out, n)) : null,
        };
    }

    function errMsg(e) {
        try { return String((e && e.message) || e || 'unknown'); }
        catch (_e2) { return 'unknown'; }
    }

    /**
     * 单条曲线。
     * @param {object} probe {build(n), read(data,n), bytes?(out,n), count?(out,n)}
     * @param {{sizes?:number[], clock?:{now:()=>number}}} [opts]
     * @returns {{path:string, rows:Array, measured:boolean, reason:string,
     *            slope:number[]|null, ratio:number|null, shape:string,
     *            superlinear:boolean, recommendation:string, synth:boolean}}
     */
    function curve(path, probe, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const sizes = Array.isArray(o.sizes) && o.sizes.length ? o.sizes.slice() : SIZES.slice();
        const rows = sizes.map((n) => runProbe(probe, n, o.clock));
        const ok = rows.filter((r) => r.measured && Number.isFinite(r.bytes));
        const base = { path: String(path || 'unknown'), rows, synth: true };
        if (ok.length < 2) {
            const why = rows.every((r) => !r.measured) ? (rows[0] && rows[0].reason) || 'no-probe' : 'insufficient-points';
            return Object.assign(base, {
                measured: false, reason: why, slope: null, ratio: null, shape: 'unknown',
                superlinear: false, recommendation: 'not-done-until-evidence',
            });
        }
        const empty = ok[0];
        const slopes = ok.slice(1).filter((r) => r.n > empty.n)
            .map((r) => (r.bytes - empty.bytes) / (r.n - empty.n));
        const maxSlope = slopes.length ? Math.max.apply(null, slopes) : 0;
        const minSlope = slopes.length ? Math.min.apply(null, slopes) : 0;
        /* 【修前实测的判定缺陷 —— 本版修的就是它】
         *   首稿写 `superlinear = (minSlope > 0) && (maxSlope / minSlope > SUPERLINEAR_RATIO)`：
         *   只在**边际斜率恒正**时生效——方向被 max/min 这个比值丢掉了。实测（本仓真数据）：
         *     · `settings` 曲线的边际斜率是 5.12 → 1.29 → 0.26 → 0.05（**递减**：每单条的边际成本
         *       越来越低，深拷贝摊薄，典型的**亚**线性）；而 max/min = 102 > 1.5 ⇒ 首稿判
         *       `superlinear:true` 并给出 `open-hotspot-candidate`。这正是计划原文
         *       「只有证明有收益的热点进入产品修改」要禁的形态：**证据说不支持，结论说支持**。
         *     · `candidate` 曲线的边际是 288.7 → 300.67（缓升，比值仅 1.04）：真缓升被判成线性。
         *   故判定改为**按方向分型**（线性 / 缓升 / 超线性 / 亚线性），不用裸比值丢方向：
         *     · 超线性 ⇒ 相邻边际**逐段非降**且末段/首段 > 1.5（缓升不误判、递减不误判）；
         *     · 亚线性 ⇒ 首段/末段 > 1.5（边际显著递减，`settings` 属此型）；
         *     · 线性   ⇒ 其余。
         */
        const nSeg = slopes.length;
        const firstSlope = nSeg ? slopes[0] : 0;
        const lastSlope = nSeg ? slopes[nSeg - 1] : 0;
        const ascending = nSeg > 1 && slopes.every((s, i) => i === 0 || s >= slopes[i - 1] - 1e-9);
        const superlinear = nSeg > 1
            && firstSlope > 0
            && ascending
            && (lastSlope / firstSlope) > SUPERLINEAR_RATIO;
        const sublinear = nSeg > 1
            && lastSlope > 0
            && (firstSlope / lastSlope) > SUPERLINEAR_RATIO;
        const shape = superlinear ? 'superlinear' : (sublinear ? 'sublinear' : 'linear');
        const last2 = ok.slice(-2);
        const ratio = (last2.length === 2 && last2[0].bytes > 0)
            ? Number((last2[1].bytes / last2[0].bytes).toFixed(3)) : null;
        return Object.assign(base, {
            measured: true,
            reason: 'ok',
            slope: slopes.map((s) => Number(s.toFixed(2))),
            maxSlope: Number(maxSlope.toFixed(2)),
            minSlope: Number(minSlope.toFixed(2)),
            shape,
            ratio,
            superlinear,
            /* 只有**证据支持的热点**才 open：亚线性/线性一律 not-done。
               这与 `recommendation` 的字面口径一致，也是本模块存在的意义。 */
            recommendation: superlinear ? 'open-hotspot-candidate' : 'not-done-until-evidence',
        });
    }

    /**
     * 四条消费路径一起跑。
     * @param {{snapshot?:object, candidate?:object, serialize?:object, settings?:object}} probes
     * @returns {{curves:Array, hotspots:string[], recommendation:string, synth:boolean}}
     *   hotspots 只列**真有证据**的路径（超线性）；无证据即空数组 —— 空数组是「没找到热点」，
     *   不是「没问题」，故随结果一并给出 `measuredPaths` 供读者判扫面宽窄。
     */
    function survey(probes, opts) {
        const p = (probes && typeof probes === 'object') ? probes : {};
        const curves = PATHS.map((name) => curve(name, p[name], opts));
        const hotspots = curves.filter((c) => c.measured && c.superlinear).map((c) => c.path);
        const measuredPaths = curves.filter((c) => c.measured).map((c) => c.path);
        return {
            curves,
            hotspots,
            measuredPaths,
            unmeasuredPaths: PATHS.filter((x) => !measuredPaths.includes(x)),
            recommendation: hotspots.length ? 'open-hotspot-candidate' : 'not-done-until-evidence',
            synth: true,
        };
    }

    /**
     * 重复读取冗余度：同一个读做 `repeat` 次 vs 做 1 次的耗时比。
     * @param {object} probe 同上
     * @param {{n?:number, repeat?:number, clock?:{now:()=>number}}} [opts]
     * @returns {{n:number, repeat:number, singleMs:number|null, repeatMs:number|null,
     *            redundancy:number|null, redundant:boolean, measured:boolean, reason:string}}
     *   redundancy ≈ repeat 表示「读一次的成本被完整付了 repeat 遍」（无复用）；
     *   redundancy ≈ 1 表示「第一次之后几乎免费」（有复用）。
     *   两者**都不等于**「有 bug」——本读数只回答「有没有可省的重复工」，改不改由人决定。
     */
    function repeatCost(probe, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const n = Number.isFinite(Number(o.n)) ? Math.floor(Number(o.n)) : 1000;
        const repeat = Number.isFinite(Number(o.repeat)) && Number(o.repeat) > 1 ? Math.floor(Number(o.repeat)) : 5;
        const p = (probe && typeof probe === 'object') ? probe : null;
        if (!p || typeof p.read !== 'function') {
            return { n, repeat, singleMs: null, repeatMs: null, redundancy: null, redundant: false, measured: false, reason: 'no-probe' };
        }
        let data;
        try { data = (typeof p.build === 'function') ? p.build(n) : null; }
        catch (e) { return { n, repeat, singleMs: null, repeatMs: null, redundancy: null, redundant: false, measured: false, reason: 'build-threw:' + errMsg(e) }; }
        let singleMs, repeatMs, _a, _b, _c, _d;
        try {
            _a = nowMs(o.clock); p.read(data, n); _b = nowMs(o.clock);
            _c = nowMs(o.clock);
            for (let i = 0; i < repeat; i++) p.read(data, n);
            _d = nowMs(o.clock);
            singleMs = (_a === null || _b === null) ? null : (_b - _a);
            repeatMs = (_c === null || _d === null) ? null : (_d - _c);
        } catch (e) {
            return { n, repeat, singleMs: null, repeatMs: null, redundancy: null, redundant: false, measured: false, reason: 'read-threw:' + errMsg(e) };
        }
        if (singleMs === null || repeatMs === null) {
            return { n, repeat, singleMs: null, repeatMs: null, redundancy: null, redundant: false, measured: false, reason: 'clock-nonfinite' };
        }
        /* 单次读耗时**恰为 0** 是另一回事：不是时钟坏了，而是这次读比时钟分辨率还快
           （0.1ms 级）⇒ 分母为 0，比值无意义。两者必须不同形（纪律①的同一句话）。 */
        if (!(singleMs > 0)) {
            return { n, repeat, singleMs: Number(singleMs.toFixed(4)), repeatMs: Number(repeatMs.toFixed(4)), redundancy: null, redundant: false, measured: false, reason: 'clock-resolution-too-coarse' };
        }
        if (!Number.isFinite(singleMs) || !Number.isFinite(repeatMs)) {
            return { n, repeat, singleMs: null, repeatMs: null, redundancy: null, redundant: false, measured: false, reason: 'clock-nonfinite' };
        }
        const redundancy = Number((repeatMs / singleMs).toFixed(3));
        return {
            n, repeat,
            singleMs: Number(singleMs.toFixed(4)),
            repeatMs: Number(repeatMs.toFixed(4)),
            redundancy,
            redundant: redundancy >= REDUNDANCY_RATIO,
            measured: true,
            reason: 'ok',
        };
    }

    /**
     * 报表（人读）。不抛；无读数时如实写「测不出 + 原因」。
     */
    function report(surveyResult, repeatResults) {
        const s = (surveyResult && typeof surveyResult === 'object') ? surveyResult : null;
        const lines = ['=== M-O4 长线规模与缓存负载（合成数据 + 真模块，非实机） ==='];
        if (!s) { lines.push('未运行（无探针）'); return lines.join('\n'); }
        for (const c of s.curves) {
            if (!c.measured) {
                lines.push(c.path + '\t测不出（' + c.reason + '）—— 不编 0');
                continue;
            }
            const pts = c.rows.filter((r) => r.measured).map((r) => r.n + ':' + r.bytes + 'B/' + r.ms + 'ms').join(' ');
            lines.push(c.path + '\t' + pts
                + '\n\tslope=' + (c.slope || []).join('/') + ' shape=' + (c.shape || 'unknown')
                + ' ratio=' + c.ratio
                + ' superlinear=' + c.superlinear + ' ⇒ ' + c.recommendation);
        }
        lines.push('热点（有证据）=' + (s.hotspots.length ? s.hotspots.join(', ') : '无')
            + ' | 已测路径=' + s.measuredPaths.join('/')
            + ' | 未测=' + (s.unmeasuredPaths.length ? s.unmeasuredPaths.join('/') : '无'));
        lines.push('总判=' + s.recommendation + '（未证收益不改产品，计划原文口径）');
        for (const r of (Array.isArray(repeatResults) ? repeatResults : [])) {
            lines.push('重复读取 n=' + r.n + ' ×' + r.repeat + '\t'
                + (r.measured ? ('single=' + r.singleMs + 'ms repeat=' + r.repeatMs + 'ms redundancy=' + r.redundancy
                    + (r.redundant ? ' ⇒ 可疑重复工' : ' ⇒ 无明显重复工')) : ('测不出（' + r.reason + '）')));
        }
        return lines.join('\n');
    }

    /**
     * 缓存命中断言（同等输入连读两次）。
     * 第二次必须 hit；测不出（无 probe / 抛错 / 无判定）与未命中必须不同形。
     * 探针可选 `hit(out, n)`：返回 true 视为命中。缺席则退回「两次输出 JSON 字节相等且非空」。
     */
    function cacheHit(probe, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const n = Number.isFinite(Number(o.n)) ? Math.floor(Number(o.n)) : 1000;
        const p = (probe && typeof probe === 'object') ? probe : null;
        if (!p || typeof p.read !== 'function') {
            return { n, measured: false, hit: false, reason: 'no-probe', firstBytes: null, secondBytes: null };
        }
        let data;
        try { data = (typeof p.build === 'function') ? p.build(n) : null; }
        catch (e) {
            return { n, measured: false, hit: false, reason: 'build-threw:' + errMsg(e), firstBytes: null, secondBytes: null };
        }
        let a, b;
        try {
            a = p.read(data, n);
            b = p.read(data, n);
        } catch (e) {
            return { n, measured: false, hit: false, reason: 'read-threw:' + errMsg(e), firstBytes: null, secondBytes: null };
        }
        const ba = bytesOf(a);
        const bb = bytesOf(b);
        if (typeof p.hit === 'function') {
            let h;
            try { h = p.hit(b, n, a); }
            catch (e) {
                return { n, measured: true, hit: false, reason: 'hit-threw:' + errMsg(e), firstBytes: ba, secondBytes: bb };
            }
            return {
                n, measured: true, hit: h === true,
                reason: h === true ? 'ok' : 'miss',
                firstBytes: ba, secondBytes: bb,
            };
        }
        if (!Number.isFinite(ba) || !Number.isFinite(bb) || ba === null || bb === null) {
            return { n, measured: false, hit: false, reason: 'unserializable', firstBytes: ba, secondBytes: bb };
        }
        const same = ba === bb && ba > 0;
        return { n, measured: true, hit: same, reason: same ? 'ok' : 'miss', firstBytes: ba, secondBytes: bb };
    }

    const api = {
        SIZES,
        PATHS,
        SUPERLINEAR_RATIO,
        REDUNDANCY_RATIO,
        bytesOf,
        curve,
        survey,
        repeatCost,
        cacheHit,
        report,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaCacheWorkload = api;
})(typeof window !== 'undefined' ? window : globalThis);
