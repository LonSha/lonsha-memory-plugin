/* vector-backend-ladder.js — [v3.488.0 · 缝合光域·镜忆的「五档向量后端降级链」]
 *
 *   源：镜忆 V0.1 `vectorBackendLadder`（st_local → local_hybrid → browser_onnx → external_api）。
 *   **只搬纪律，不搬实现**：那边二十万字节的运行时代码没有许可证、没有版权头（默认保留所有
 *   权利），本仓 README 自称 MIT，两者不兼容。故这里按同一套判断从头重写，一行代码没抄。
 *
 * 【这一面要解决的问题】
 *   本仓的向量层只有一个出口（`local-ngram-vectorizer.js`），但「现在到底走在第几档」
 *   这件事在面板上从来没有形状。用户看到召回效果变差，看到的是「效果差」，
 *   看不到的是「真嵌入整层已经掉到 ngram 档」。单纯给个 0/1 的「降级了」也没用 ——
 *   掉到 ngram 与掉到 legacy-simple 是两个完全不同的问题。
 *
 * 【它做什么 / 不做什么（边界，先立后破）】
 *   · 做：**把「实际走在哪一档」与「上面几档为什么没走」算成一份可读台账**。
 *   · 不做：不重算分数、不发请求、不探活、不选后端。
 *     探针（probe）与网络（request）的**结果**由调用方给，本模块只按给定结果判定，
 *     并把预算（probeTimeoutMs / requestTimeoutMs）如实回给调用方。
 *     在这里再写一遍「超时重试几次」就是第二个真源 —— 与 `fetchWithTimeoutRetry` 漂移。
 *   · 不做：不定义优先级策略。`order` 由调用方给（本仓给的是自己真实的策略序），
 *     本模块不冒充知道哪一档更好。镜忆的默认链序只作为**未给 order 时的兜底**。
 *   · 不新增配置键：所有阈值都是入参，缺省取本文件 DEFAULTS（纯读数，不改任何行为）。
 *
 * 【三态不同形（本仓老账，务必守住）】
 *   · `absent`   —— 全无观测：这一轮根本没有向量被产出（≠「走了最差档」）
 *   · `unknown`  —— 有观测，但某一档的可用性**没人声明过**（≠「不可用」）
 *       → 未声明的档一律记 unknown，**绝不**记成 failed/absent
 *   · `cooling`  —— 明确声明可用、但正处在冷却窗内（≠「不可用」，窗过了就会回来）
 *   这三种在 readings 里分三个数组给，不许合并成一个 skippedCount。
 *
 * 【纯函数纪律】
 *   本文件没有副作用、不读时钟（`now` 由调用方给）、不碰全局。`plan()` 对同一份入参
 *   必得同一份出参（数组顺序与对象键序都稳定），判据可以直接测。
 */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) module.exports = factory();
    else root.LonShaVectorBackendLadder = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var VERSION = '3.488.0';

    /* 镜忆原链序（未给 order 时的兜底）。注意：这**不是**本仓的策略序 ——
     *   本仓真实策略是「真嵌入有密钥就用，否则本地 ngram，最后 legacy」，
     *   所以 `memory-organs` / 诊断行调用本模块时**必须显式传 order**。 */
    var MIRROR_CHAIN = ['st_local', 'local_hybrid', 'browser_onnx', 'external_api', 'legacy_simple'];

    var STATES = {
        READY: 'ready',          /* 首选档就是当前档 */
        DEGRADED: 'degraded',    /* 当前档在首选之后（有更好的档没用上） */
        ABSENT: 'absent',        /* 全无观测 */
        MALFORMED: 'malformed'
    };

    /* 观测来源 → 档位。本仓 `embedSourceByDoc` 只产出这三个字面量
     *   （memory-organs 的 `embedSource`；另有 `local-ngram-after:<因>` 形态）。
     *   映射表放在这里、**只此一份**：召回侧不许再写第二张表。 */
    var SOURCE_TO_RUNG = {
        'api': 'external_api',
        'local-ngram': 'local_hybrid',
        'legacy-simple': 'legacy_simple'
    };

    /* 本仓**真实**策略序（不是镜忆链序）：真嵌入优先，其次本地 ngram，最后 legacy 兜底。
     *   `st_local` / `browser_onnx` 两档在本宿主里根本没有实现，故**不写进 order**
     *   （写进去就是在谎报优先级），只在 `REPO_DECLARED` 里声明缺席 + 写明理由，
     *   由 `plan()` 汇总进 readings.absent —— 面板上照样看得见「宿主缺哪两档」。 */
    var REPO_ORDER = ['external_api', 'local_hybrid', 'legacy_simple'];
    var REPO_DECLARED = {
        external_api: 'present',   /* 代码在（密钥是配置问题；没密钥时观测会落到下一档，不靠声明猜） */
        local_hybrid: 'present',   /* local-ngram-vectorizer.js 永远可用 */
        legacy_simple: 'present',  /* simpleEmbedding 是最后兜底 */
        st_local: 'absent',
        browser_onnx: 'absent'
    };
    var REPO_WHY = {
        st_local: '宿主未绑定 SillyTavern 原生向量扩展',
        browser_onnx: '宿主无 onnx 运行时'
    };

    var DEFAULTS = {
        probeTimeoutMs: 3500,     /* 一次可用性探针的上限（镜忆同值，本仓沿用） */
        requestTimeoutMs: 8000,   /* 一次真请求的上限 */
        probeCacheMs: 10 * 60 * 1000, /* 探针结果缓存；窗内不重复探 */
        staleMs: 30 * 60 * 1000   /* 观测超过这么久没更新 ⇒ 记 stale（不改判定，只留痕） */
    };

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    /* 来源字面量 → 档位。`local-ngram-after:apiError` 这类带尾巴的形态归到前缀档。 */
    function rungOfSource(src) {
        var s = String(src === undefined || src === null ? '' : src).trim();
        if (!s) return null;
        if (Object.prototype.hasOwnProperty.call(SOURCE_TO_RUNG, s)) return SOURCE_TO_RUNG[s];
        /* 本仓 `embedSourceByDoc` 还会写 `local-ngram-after:<降级因>` 这种带尾巴的形态，
         *   尾巴只说明「为什么落到这一档」，不改档位。 */
        var after = s.indexOf('-after');
        if (after > 0) {
            var base = s.slice(0, after);
            if (Object.prototype.hasOwnProperty.call(SOURCE_TO_RUNG, base)) return SOURCE_TO_RUNG[base];
        }
        var head = s.split(':')[0];
        if (Object.prototype.hasOwnProperty.call(SOURCE_TO_RUNG, head)) return SOURCE_TO_RUNG[head];
        return null;
    }

    /* 把 `embedSourceByDoc`（Map / 普通对象 / {source: count} 三种形态都吃）
     *   数成 per-rung 的分布。**这是唯一的观测入口**，别处不许再自己数。 */
    function observe(sources) {
        var byRung = {};
        var unknownSource = {};
        var total = 0;
        var unclassified = 0;
        var push = function (raw) {
            var r = rungOfSource(raw);
            total += 1;
            if (r === null) {
                unclassified += 1;
                var k = String(raw === undefined || raw === null ? 'null' : raw);
                unknownSource[k] = (unknownSource[k] || 0) + 1;
                return;
            }
            byRung[r] = (byRung[r] || 0) + 1;
        };
        if (sources && typeof sources.forEach === 'function' && !Array.isArray(sources) && typeof sources.size === 'number') {
            /* Map<docHash, source> */
            sources.forEach(function (v) { push(v); });
        } else if (Array.isArray(sources)) {
            for (var i = 0; i < sources.length; i += 1) push(sources[i]);
        } else if (sources && typeof sources === 'object') {
            /* 两种对象形态要分开：
             *   { 'api': 12 }            → 值就是计数
             *   { doc_1: 'api', ... }    → 值还是来源字面量
             * 判法：值全是有限数 ⇒ 计数字典；否则按字面量逐个 push。 */
            var keys = Object.keys(sources);
            var allNum = keys.length > 0;
            for (var j = 0; j < keys.length; j += 1) {
                if (typeof sources[keys[j]] !== 'number') { allNum = false; break; }
            }
            if (allNum) {
                for (var m = 0; m < keys.length; m += 1) {
                    var c = Math.max(0, Math.floor(Number(sources[keys[m]]) || 0));
                    if (c === 0) continue;
                    var rr = rungOfSource(keys[m]);
                    total += c;
                    if (rr === null) {
                        unclassified += c;
                        unknownSource[keys[m]] = (unknownSource[keys[m]] || 0) + c;
                    } else {
                        byRung[rr] = (byRung[rr] || 0) + c;
                    }
                }
            } else {
                for (var n = 0; n < keys.length; n += 1) push(sources[keys[n]]);
            }
        }
        return { byRung: byRung, unclassified: unclassified, unknownSource: unknownSource, total: total };
    }

    /* 探针缓存：窗内可用，窗外过期。**过期 ≠ 失败** —— 过期只表示「该重探了」。 */
    function probeUsable(cache, rung, now, probeCacheMs) {
        var ttl = num(probeCacheMs);
        if (ttl === null) ttl = DEFAULTS.probeCacheMs;
        var rec = cache && typeof cache.get === 'function' ? cache.get(rung) : (cache && cache[rung]);
        if (!rec || typeof rec !== 'object') return { state: 'none', ageMs: null };
        var t = num(now);
        var at = num(rec.at);
        if (t === null || at === null) return { state: 'none', ageMs: null };
        var age = t - at;
        if (age < 0) return { state: 'none', ageMs: null };      /* 时钟回拨 ⇒ 当作没探过，不冒充新鲜 */
        return { state: age <= ttl ? 'fresh' : 'stale', ageMs: age, ok: rec.ok === true, reason: rec.reason || '' };
    }

    /* 记一次探针结果。返回新对象（不改入参），与「纯函数优先」一致；
     *   调用方要就地改 Map 自己 set，本模块不替它决定容器。 */
    function rememberProbe(rec, now) {
        var r = rec && typeof rec === 'object' ? rec : {};
        var t = num(now);
        return {
            at: t === null ? 0 : t,
            ok: r.ok === true,
            reason: String(r.reason || (r.ok === true ? 'ok' : 'failed'))
        };
    }

    /* 核心：给定「观测 + 声明 + 冷却 + 探针」，说清现在在哪一档、上面几档为什么没走。 */
    function plan(input) {
        /* 入参不是对象 ⇒ malformed。**不许**当成「空计划」：
         *   「没给入参」与「给了但这一轮没有向量」两态不同形（后者是 absent）。 */
        var _inputOk = !!(input && typeof input === 'object');
        var c = _inputOk ? input : {};
        /* ★ 空数组**不许**回落成镜忆链：那会让「调用方明确给了个空的档序」与
         *   「根本没给档序」两态同形（本仓老账），而且会静默换成一份调用方没写的优先级。 */
        var order = Array.isArray(c.order) ? c.order.slice() : MIRROR_CHAIN.slice();
        var declared = c.declared && typeof c.declared === 'object' ? c.declared : {};
        var why = c.why && typeof c.why === 'object' ? c.why : {};
        var budgets = c.budgets && typeof c.budgets === 'object' ? c.budgets : {};
        var probeCache = c.probeCache && typeof c.probeCache === 'object' ? c.probeCache : null;
        var now = num(c.now);
        var probeCacheMs = num(c.probeCacheMs);
        if (probeCacheMs === null) probeCacheMs = DEFAULTS.probeCacheMs;
        var cooldownFn = typeof c.cooldown === 'function' ? c.cooldown : null;

        var counts = {
            state: STATES.MALFORMED,
            orderLen: order.length,
            observed: 0,
            current: 0,
            skippedAbsent: 0,
            skippedCooling: 0,
            skippedUnknown: 0,
            unclassified: 0,
            reason: ''
        };

        if (!_inputOk) {
            counts.reason = 'input-not-object';
            return bad(counts, 'input-not-object');
        }
        if (!Array.isArray(c.order) && c.order !== undefined) {
            counts.reason = 'order-not-array';
            return bad(counts, 'order-not-array');
        }
        if (order.length === 0) {
            counts.reason = 'order-empty';
            return bad(counts, 'order-empty');
        }

        var obs = observe(c.observed);
        counts.observed = obs.total;
        counts.unclassified = obs.unclassified;

        /* 当前档 = order 里**最靠前**且观测到的档。观测里出现了 order 外的档
         *   （例如 `local-ngram-after:exception` 归到 local_hybrid，已在 order 内；
         *   真出现纯未知来源时记 unclassified，不猜它是哪一档）。 */
        var current = null;
        var currentIdx = -1;
        for (var i = 0; i < order.length; i += 1) {
            if (obs.byRung[order[i]]) { current = order[i]; currentIdx = i; break; }
        }
        counts.current = currentIdx < 0 ? 0 : currentIdx;

        /* 每个档的可用性判定：声明 > 冷却 > 探针 > 未知。
         *   顺序不能换：冷却说的是「可用但此刻在窗内」，如果先看声明就永远看不到 cooling。 */
        var rungs = [];
        var skippedAbsent = [];
        var skippedCooling = [];
        var skippedUnknown = [];
        for (var k = 0; k < order.length; k += 1) {
            var id = order[k];
            var dRaw = Object.prototype.hasOwnProperty.call(declared, id) ? declared[id] : 'unknown';
            var d = dRaw === true ? 'present' : (dRaw === false ? 'absent' : String(dRaw || 'unknown'));
            if (d !== 'present' && d !== 'absent' && d !== 'unknown') d = 'unknown';
            var cd = null;
            if (cooldownFn) {
                try { cd = cooldownFn(id); } catch (e) { cd = null; }
            }
            var pr = probeCache ? probeUsable(probeCache, id, now, probeCacheMs) : { state: 'none', ageMs: null };
            var code = 'usable';
            var reasonTxt = '';
            if (d === 'absent') {
                code = 'absent';
                reasonTxt = String(why[id] || 'declared-absent');
            } else if (cd === 'cooling') {
                code = 'cooling';
                reasonTxt = String(why[id] || 'cooling-window');
            } else if (d === 'unknown') {
                /* 没声明过 ⇒ 不许当成不可用，也不许当成可用；它只是「没探过」。
                 *   但如果探针刚给出结果，就按探针算 —— 探针是证据，声明只是口头。 */
                if (pr.state === 'fresh' && pr.ok) { code = 'usable'; }
                else if (pr.state === 'fresh' && !pr.ok) {
                    code = 'absent';
                    reasonTxt = 'probe-failed:' + (pr.reason || 'unknown');
                } else { code = 'unknown'; reasonTxt = pr.state === 'stale' ? 'probe-stale' : 'not-declared'; }
            } else if (pr.state === 'fresh' && !pr.ok) {
                /* 声明可用但探针明确失败 ⇒ 这一轮确实没法用（与「没探过」不同形） */
                code = 'absent';
                reasonTxt = 'probe-failed:' + (pr.reason || 'unknown');
            }
            if (code === 'absent') skippedAbsent.push({ rung: id, reason: reasonTxt || 'absent' });
            else if (code === 'cooling') skippedCooling.push({ rung: id, reason: reasonTxt || 'cooling-window' });
            else if (code === 'unknown') skippedUnknown.push({ rung: id, reason: reasonTxt || 'not-declared' });
            rungs.push({
                rung: id,
                index: k,
                declared: d,
                cooldown: cd,
                probe: pr.state,
                code: code,
                reason: reasonTxt,
                /* 预算：档位可覆盖全局；两个值都是**上限**，不是等待时长 */
                probeTimeoutMs: num(budgets[id] && budgets[id].probeTimeoutMs) !== null
                    ? num(budgets[id].probeTimeoutMs)
                    : (num(budgets.probeTimeoutMs) !== null ? num(budgets.probeTimeoutMs) : DEFAULTS.probeTimeoutMs),
                requestTimeoutMs: num(budgets[id] && budgets[id].requestTimeoutMs) !== null
                    ? num(budgets[id].requestTimeoutMs)
                    : (num(budgets.requestTimeoutMs) !== null ? num(budgets.requestTimeoutMs) : DEFAULTS.requestTimeoutMs)
            });
        }
        /* 声明里存在、但不在 order 里的档（本仓的 st_local / browser_onnx）：
         *   它们不是「优先级更低」，而是「宿主根本没有」，所以不能塞进 order 冒充顺序，
         *   但必须照样出现在 readings.absent 上 —— 否则「缺档」这件事在面板上无形状。 */
        Object.keys(declared).forEach(function (id) {
            if (order.indexOf(id) !== -1) return;
            var dv = declared[id] === true ? 'present' : (declared[id] === false ? 'absent' : String(declared[id] || 'unknown'));
            if (dv !== 'absent') return;
            skippedAbsent.push({ rung: id, reason: String(why[id] || 'declared-absent'), outsideOrder: true });
        });
        counts.skippedAbsent = skippedAbsent.length;
        counts.skippedCooling = skippedCooling.length;
        counts.skippedUnknown = skippedUnknown.length;

        /* 状态：全无观测 ⇒ absent（与「走了最差档」不同形）。 */
        var state;
        if (obs.total === 0) state = STATES.ABSENT;
        else if (currentIdx <= 0) state = STATES.READY;
        else state = STATES.DEGRADED;
        counts.state = state;

        var cur = currentIdx >= 0 ? rungs[currentIdx] : null;
        var readings = {
            state: state,
            order: order.slice(),
            orderLen: order.length,
            observedTotal: obs.total,
            byRung: obs.byRung,
            unclassified: obs.unclassified,
            unknownSource: obs.unknownSource,
            current: current,
            currentIndex: currentIdx,
            currentDeclared: cur ? cur.declared : null,
            currentProbe: cur ? cur.probe : null,
            absent: skippedAbsent,
            cooling: skippedCooling,
            unknown: skippedUnknown,
            /* 「更好的档为什么没用上」只看当前档**之前**的那几档：之后的档没走是正常的。 */
            betterNotUsed: currentIdx > 0 ? rungs.slice(0, currentIdx).map(function (x) {
                return { rung: x.rung, code: x.code, reason: x.reason };
            }) : [],
            probeTimeoutMs: cur ? cur.probeTimeoutMs : (num(budgets.probeTimeoutMs) !== null ? num(budgets.probeTimeoutMs) : DEFAULTS.probeTimeoutMs),
            requestTimeoutMs: cur ? cur.requestTimeoutMs : (num(budgets.requestTimeoutMs) !== null ? num(budgets.requestTimeoutMs) : DEFAULTS.requestTimeoutMs),
            probeCacheMs: probeCacheMs,
            /* 探针缓存窗内不重探：这一读数回答「省了几次探」 —— 没有它，缓存是否生效看不出来 */
            probeCacheHits: rungs.filter(function (x) { return x.probe === 'fresh'; }).length,
            rungs: rungs
        };
        return { state: state, current: current, currentIndex: currentIdx, readings: readings, counts: counts };
    }

    function bad(counts, reason) {
        counts.state = STATES.MALFORMED;
        counts.reason = reason;
        return {
            state: STATES.MALFORMED,
            current: null,
            currentIndex: -1,
            readings: {
                state: STATES.MALFORMED, reason: reason, order: [], orderLen: 0,
                observedTotal: 0, byRung: {}, unclassified: 0, unknownSource: {},
                current: null, currentIndex: -1, currentDeclared: null, currentProbe: null,
                absent: [], cooling: [], unknown: [], betterNotUsed: [],
                probeTimeoutMs: DEFAULTS.probeTimeoutMs,
                requestTimeoutMs: DEFAULTS.requestTimeoutMs,
                probeCacheMs: DEFAULTS.probeCacheMs,
                probeCacheHits: 0, rungs: []
            },
            counts: counts
        };
    }

    /* fromSources(sources, opts) —— 宿主侧唯一装配入口。
     *   `sources` 就是 `organs.vectors.embedSourceByDoc`（Map / 对象都吃）。
     *   两个调用点（面板读数、诊断行）都用这一个函数，谁都不许自己写第二份 order。 */
    function fromSources(sources, opts) {
        var o = {};
        var src = opts && typeof opts === 'object' ? opts : {};
        for (var k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) o[k] = src[k]; }
        o.observed = sources;
        if (!Array.isArray(o.order)) o.order = REPO_ORDER.slice();
        if (!o.declared || typeof o.declared !== 'object') o.declared = REPO_DECLARED;
        if (!o.why || typeof o.why !== 'object') o.why = REPO_WHY;
        return plan(o);
    }

    /* summary(res) → 人话。四种状态**用不同句子**（面板上同形就等于没有状态）。 */
    function summary(res) {
        if (!res || res.state === STATES.MALFORMED) {
            return '向量档位：缺量（' + ((res && res.counts && res.counts.reason) || (res && res.readings && res.readings.reason) || 'no-plan') + '）';
        }
        var r = res.readings || {};
        if (res.state === STATES.ABSENT) {
            return '向量档位：这一轮没有任何向量产出（不是「走了最差档」）';
        }
        var head = '向量档位：' + (res.current || '?');
        if (res.state === STATES.DEGRADED) head += '（第 ' + (res.currentIndex + 1) + '/' + (r.orderLen || '?') + ' 档）';
        else head += '（首选档）';
        var tail = [];
        if (r.betterNotUsed && r.betterNotUsed.length) {
            tail.push('更好的档没用上 ' + r.betterNotUsed.length + ' 个：' + r.betterNotUsed.map(function (x) {
                return x.rung + '=' + x.code;
            }).join('、'));
        }
        if (r.cooling && r.cooling.length) tail.push('冷却中 ' + r.cooling.length);
        if (r.unknown && r.unknown.length) tail.push('没声明过 ' + r.unknown.length);
        if (r.absent && r.absent.length) tail.push('宿主缺档 ' + r.absent.length);
        if (r.unclassified) tail.push('认不出的来源 ' + r.unclassified);
        return head + (tail.length ? '｜' + tail.join('·') : '');
    }

    return {
        VERSION: VERSION,
        STATES: STATES,
        MIRROR_CHAIN: MIRROR_CHAIN,
        SOURCE_TO_RUNG: SOURCE_TO_RUNG,
        DEFAULTS: DEFAULTS,
        REPO_ORDER: REPO_ORDER,
        REPO_DECLARED: REPO_DECLARED,
        REPO_WHY: REPO_WHY,
        fromSources: fromSources,
        rungOfSource: rungOfSource,
        observe: observe,
        probeUsable: probeUsable,
        rememberProbe: rememberProbe,
        plan: plan,
        summary: summary
    };
}));
