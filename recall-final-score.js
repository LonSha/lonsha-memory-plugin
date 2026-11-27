/* ========================================================
 * recall-final-score.js — [v3.488.0] 召回终分合成（分解留痕 + 邻楼加成 + na 分档）
 *
 * 【为什么需要这一面 / 修前实测（不是估计）】
 *   本仓召回的分是**混合召回直接给的**（`vector-semantic-sparse-hybrid-retrieval.js`
 *   的 `hybridScore`、`recall-inverted-index.js` 的 BM25 分、各器官自己算的 `score`），
 *   此后**只按分数排序、按预算切点**，中间没有任何一层改分。
 *   逐键实测（474 个运行时模块）：`timeFactor` 只在 `graph_algorithms.js` 命中，
 *   且是**图边权**（`edge.weight = timeFactor * frequencyFactor`），与召回排序无关；
 *   `importanceFactor` / `neighborFloor` / 邻楼 在召回侧命中 0。
 *   后果有两类错：
 *     ① **同分不可分**：两条同分记忆，一条是昨天刚发生的、一条是三百楼前的，排序看运气；
 *     ② **老但重要的被一律压掉**：衰减只发生在 `decayScore`（写入侧置信度），
 *        召回侧拿到的仍是原始相似度 —— 于是「重要但不新」与「新但不重要」在排序上同形。
 *
 * 【本模块做什么：只装配因子，不定义衰减曲线】
 *   ★ 这是本模块最重要的一条边界 —— 本仓**已经有**一条衰减曲线（`memory-organs.js`
 *     的 `decayScore`：重要性 / 激活 / 强度 / 新鲜度 / 情绪唤醒五项合一），
 *     而「重复实现第二份相似度公式」正是本报反复治过的漂移源（v3273 C2 刚被咬过一次）。
 *     故这里**不写衰减公式**：时间因子由调用方的 `ctx.decay(ageDays)` 注入。
 *     不注入 ⇒ `timeFactor` 记 `null` 并标 `na.time`，**不冒充 1.0**。
 *
 *   终分 = base × timeFactor × importanceFactor × neighborFactor
 *     base             rrfScore 优先，其次 score（原样，不改）
 *     timeFactor       调用方注入的衰减值，夹在 [timeFloor, 1]
 *     importanceFactor 按档位线性映射到 [impFloor, impCeil]
 *     neighborFactor   与当前楼层相差 ≤ window 的条目给加成（默认 1.15）
 *
 * 【邻楼加成不是因果（本仓正面纪律，必须写在代码旁边）】
 *   `experience-rebuild.js` 开头就写着：「时间接近不是因果：同楼、相邻楼、同一天都
 *   **不**构成合并依据」。所以这里：
 *     · 只**加权**，绝不合并、绝不改 uid、绝不删条目；
 *     · 加成幅度刻意小（默认 1.15，不是 2.0）—— 它只该在同分时决定顺序；
 *     · 读数分列 `neighborHits`，让「这一版末位换了几条」可复算。
 *
 * 【下限是刻意的：不许把一条记忆乘成 0】
 *   一条三百楼前但在正史里的记忆，若被衰到 0.001，它就永远进不了预算切点 ——
 *   而「老但重要」正是记忆系统存在的理由。故 timeFactor 有 `timeFloor`（默认 0.35）、
 *   importanceFactor 有 `impFloor`（默认 0.6）。被下限截断时记 `clamped`，
 *   因为「算出来正好等于下限」与「被下限截断」必须不同形（否则调下限时看不出影响）。
 *
 * 【三态不可混同】
 *   'composed' 至少一条条目的终分与 base **数值不同**（硬读数，不看选项看结果）
 *   'neutral'  全部条目终分 === base ⇒ 排序与 base 完全一致。**与 composed 不同形**：
 *              它是「这一面空转」的证据，不是「一样好」
 *   · 判 composed 不许用「某个选项给了没有」这种间接证据：曲线给了但 `decayFloor`
 *     正好返回 1、`neighborBonus` 被配成 1，都是 ×1 —— 分数没动、序没动，
 *     报成 composed 就是**空转被冒充成生效**（v3.488.0 冒烟抓到的同类缺陷）。
 *   'malformed' 入参不是数组 / 全是非法条目
 *
 * 【不做什么（边界）】
 *   · 不解析日期：`storyTime` 字符串一律不吃（`engine.clock` 是单一口径，
 *     在这里再写一份解析就是第二个真源）。只吃 `ageDays` / `storyDays` 数值。
 *   · 不改条目的任何既有字段：`score` 原样保留，终分只写 `finalScore` 与 `factors`；
 *   · 不裁预算、不定 topK：那是 `prompt-budget-dynamic-allocator.js` 的事；
 *   · 不做归一化（min-max / z-score）：本仓分数口径跨后端不同源，
 *     归一化会把「后端不同」伪装成「相关度不同」。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRecallFinalScore = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    var STATES = {
        COMPOSED: 'composed',
        NEUTRAL: 'neutral',
        MALFORMED: 'malformed'
    };

    var DEFAULTS = {
        timeFloor: 0.35,
        impFloor: 0.6,
        impCeil: 1.4,
        neighborBonus: 1.15,
        neighborWindow: 1,
        neighborEnabled: true
    };

    function num(v) {
        var n = Number(v);
        return isFinite(n) ? n : null;
    }

    function clamp(v, lo, hi) {
        var n = num(v);
        if (n === null) return null;
        if (n < lo) return lo;
        if (n > hi) return hi;
        return n;
    }

    function baseOf(item) {
        var rr = num(item && item.rrfScore);
        if (rr !== null) return rr;
        return num(item && item.score);
    }

    /**
     * 重要性口径归一：本仓并存两套（写入侧 1..5 档、衰减侧 0..1 单位值）。
     *
     * ★ [v3.488.0 首稿自伤] 首版只按值域判「>1 ⇒ 5 档，否则 unit」，于是
     *   `importance: 1` 被当成「unit 最大值」→ 因子 1.4，也就是**最不重要的那条
     *   拿到了最高加成**（冒烟当场抓到：b 的 importance=1 得到 1.4）。
     *   1 这个值是两套口径的**重叠点**，按值域判不出来，必须靠显式字段或本仓主流口径。
     *
     * 修后的判定次序（每一步都留痕，不静默）：
     *   ① `item.importanceScale === 'five'|'unit'` 显式声明 ⇒ 采信（`assumed:false`）
     *   ② 否则按本仓主流口径推断：写入侧 `addVector` 的 `importance: metadata?.importance || 5`
     *      与 `decayScore` 吃 `m.importance` 都是 1..5 档，故 `>= 1 ⇒ 'five'`（`assumed:true`）
     *   ③ 只有 `0 <= raw < 1` 才是明确的单位值（`assumed:true`）
     *   ④ 给不出数 ⇒ 'na'，因子记 null（不冒充 1.0）
     */
    function importanceOf(item) {
        var raw = num(item && (item.importance !== undefined ? item.importance : item.salience));
        if (raw === null) return { value: null, scale: 'na', assumed: false, raw: null };
        var explicit = String((item && item.importanceScale) || '').toLowerCase();
        var scale;
        var assumed;
        if (explicit === 'five' || explicit === 'unit') {
            scale = explicit;
            assumed = false;
        } else if (raw >= 1) {
            scale = 'five';
            assumed = true;
        } else {
            scale = 'unit';
            assumed = true;
        }
        var unit;
        if (scale === 'five') {
            /* 1..5 档 ⇒ (v-1)/4 摊到 0..1：1 档 = 0（最不重要）、5 档 = 1。 */
            unit = (Math.min(5, Math.max(1, raw)) - 1) / 4;
        } else {
            unit = Math.max(0, Math.min(1, raw));
        }
        return { value: unit, scale: scale, assumed: assumed, raw: raw };
    }

    /** 距今天数：`ageDays` 优先，其次 `storyDays`。都给不出 ⇒ null（na）。 */
    function ageOf(item) {
        var a = num(item && item.ageDays);
        if (a !== null) return a;
        return num(item && item.storyDays);
    }

    function floorOf(item) {
        return num(item && item.floor);
    }

    /**
     * compose(items, ctx) -> { state, items, counts, readings }
     *   ctx.decay(ageDays) -> 0..1       时间因子（不传 ⇒ na.time）
     *   ctx.nowFloor                     当前楼层（邻楼加成要用；不传 ⇒ 邻楼全关）
     *   ctx.timeFloor / impFloor / impCeil / neighborBonus / neighborWindow / neighborEnabled
     *   入参不被修改：输出是新对象（原条目浅拷贝 + finalScore / factors / na / clamped）。
     */
    function compose(items, ctx) {
        var c = ctx && typeof ctx === 'object' ? ctx : {};
        var timeFloor = num(c.timeFloor);
        if (timeFloor === null) timeFloor = DEFAULTS.timeFloor;
        var impFloor = num(c.impFloor);
        if (impFloor === null) impFloor = DEFAULTS.impFloor;
        var impCeil = num(c.impCeil);
        if (impCeil === null) impCeil = DEFAULTS.impCeil;
        var neighBonus = num(c.neighborBonus);
        if (neighBonus === null) neighBonus = DEFAULTS.neighborBonus;
        var neighWin = num(c.neighborWindow);
        if (neighWin === null) neighWin = DEFAULTS.neighborWindow;
        var neighOn = c.neighborEnabled === undefined ? DEFAULTS.neighborEnabled : c.neighborEnabled !== false;
        var nowFloor = floorOf({ floor: c.nowFloor });
        var decay = typeof c.decay === 'function' ? c.decay : null;

        var counts = {
            state: STATES.MALFORMED,
            input: 0,
            used: 0,
            malformed: 0,
            withTime: 0,
            timeByFloor: 0,
            timeByDays: 0,
            naTime: 0,
            withImportance: 0,
            naImportance: 0,
            neighborHits: 0,
            clampedTime: 0,
            importanceFive: 0,
            importanceUnit: 0,
            importanceAssumed: 0,
            reorderTop: 0,
            changed: 0,
            reason: ''
        };

        if (!Array.isArray(items)) {
            counts.reason = 'items-not-array';
            return { state: STATES.MALFORMED, items: [], counts: counts, readings: emptyReadings(counts) };
        }
        counts.input = items.length;

        var out = [];
        var baseline = [];   /* 与 base 同序的 id 表，用来算 reorderTop */

        for (var i = 0; i < items.length; i += 1) {
            var it = items[i];
            if (!it || typeof it !== 'object') { counts.malformed += 1; continue; }
            var base = baseOf(it);
            if (base === null) { counts.malformed += 1; continue; }

            var na = { time: false, importance: false, neighbor: false };
            var clamped = [];

            /* 时间因子：**楼层口径优先于天口径**。
             *   [v3.488.0] 本仓 v3.483.0 已明确「日期会随剧情钟回拨、随 dual-time 漂移、
             *   同一日可横跨几十楼」，召回进度门也因此改用楼层而非叙事日期。
             *   这里沿用同一条判断：`ctx.decayFloor(floorAge)` 给了就用楼层，
             *   否则才退 `ctx.decay(ageDays)`。两者**分开计数**（timeByFloor / timeByDays），
             *   因为两种基数的曲线不同源，混在一张表上就分不清「换了口径」与「同一口径变了」。 */
            var timeFactor = null;
            var timeBasis = null;
            var age = ageOf(it);
            if (typeof c.decayFloor === 'function' && nowFloor !== null) {
                var _f = floorOf(it);
                if (_f !== null) {
                    var rawF = num(c.decayFloor(Math.abs(nowFloor - _f)));
                    if (rawF === null) { na.time = true; }
                    else {
                        if (rawF < timeFloor) { clamped.push('time'); counts.clampedTime += 1; }
                        timeFactor = clamp(rawF, timeFloor, 1);
                        timeBasis = 'floor';
                        counts.timeByFloor += 1;
                        counts.withTime += 1;
                    }
                } else { na.time = true; }
            } else if (decay && age !== null && isFinite(age)) {
                var raw = num(decay(age));
                if (raw === null) { na.time = true; }
                else {
                    if (raw < timeFloor) { clamped.push('time'); counts.clampedTime += 1; }
                    timeFactor = clamp(raw, timeFloor, 1);
                    timeBasis = 'days';
                    counts.timeByDays += 1;
                    counts.withTime += 1;
                }
            } else {
                na.time = true;
            }
            if (na.time) counts.naTime += 1;

            /* 重要性因子 */
            var impFactor = null;
            var imp = importanceOf(it);
            if (imp.value === null) { na.importance = true; counts.naImportance += 1; }
            else {
                if (imp.scale === 'five') counts.importanceFive += 1;
                else counts.importanceUnit += 1;
                if (imp.assumed) counts.importanceAssumed += 1;
                /* 映射区间恒落在 [impFloor, impCeil] 内（unit ∈ [0,1]），故这里**不做**截断 ——
                 *   写一段永远不触发的 clamp 就是死代码，本仓有死代码预算审计会记它。
                 *   clamp 只在 timeFactor 那一侧有意义（decay 回调可能返回越界值）。 */
                impFactor = impFloor + (impCeil - impFloor) * imp.value;
                counts.withImportance += 1;
            }

            /* 邻楼因子：只加权，不合并（见头注释的因果纪律） */
            var neighFactor = 1;
            if (neighOn && nowFloor !== null) {
                var f = floorOf(it);
                if (f !== null && Math.abs(f - nowFloor) <= neighWin) {
                    neighFactor = neighBonus;
                    counts.neighborHits += 1;
                }
            } else {
                na.neighbor = true;
            }

            /* 终分：na 的因子不参与相乘（等价 ×1），但 factors 里如实留 null，
             *   并给 incomplete 标记 —— 这样「因子缺失」与「因子正好是 1」不同形。 */
            var finalScore = base;
            if (timeFactor !== null) finalScore *= timeFactor;
            if (impFactor !== null) finalScore *= impFactor;
            if (neighFactor !== 1) finalScore *= neighFactor;

            var rec = {};
            for (var k in it) { if (Object.prototype.hasOwnProperty.call(it, k)) rec[k] = it[k]; }
            if (finalScore !== base) counts.changed += 1;
            rec.finalScore = finalScore;
            rec.factors = {
                base: base,
                time: timeFactor,
                timeBasis: timeBasis,
                importance: impFactor,
                neighbor: neighFactor
            };
            rec.importanceScale = imp.scale;
            rec.importanceAssumed = imp.assumed;   /* true = 口径是按值域推断的，不是调用方声明的 */
            rec.na = na;
            rec.incomplete = na.time || na.importance;
            rec.clamped = clamped;
            out.push(rec);
            counts.used += 1;
        }

        if (counts.used === 0) {
            counts.reason = 'no-usable-item';
            return { state: STATES.MALFORMED, items: [], counts: counts, readings: emptyReadings(counts) };
        }

        /* reorderTop：终分排序 vs base 排序，前 N 位有多少条换了位次。
         *   这是「这一面到底有没有生效」的**唯一硬读数** —— 没有它就等于空转。 */
        var N = Math.min(3, out.length);
        baseline = out.slice().sort(function (x, y) { return (y.factors.base - x.factors.base); }).slice(0, N).map(function (x) { return x.id; });
        var reordered = out.slice().sort(function (x, y) { return (y.finalScore - x.finalScore); });
        var topNow = reordered.slice(0, N).map(function (x) { return x.id; });
        for (var t = 0; t < N; t += 1) if (baseline[t] !== topNow[t]) counts.reorderTop += 1;

        /* 全序：按终分降序，同分保持入参相对次序（稳定排序，靠 index 兜底）。 */
        reordered = reordered.map(function (r, idx) { return { r: r, i: idx }; })
            .sort(function (a, b) {
                var d = b.r.finalScore - a.r.finalScore;
                return d !== 0 ? d : (a.i - b.i);
            })
            .map(function (x) { return x.r; });

        /* 生效判据 = 终分真的变了。`withTime / withImportance / neighborHits` 只当分解读数，
         *   不许拿它们判状态（×1 的因子会把空转报成 composed）。 */
        counts.state = counts.changed > 0 ? STATES.COMPOSED : STATES.NEUTRAL;

        return {
            state: counts.state,
            items: reordered,
            counts: counts,
            readings: {
                state: counts.state,
                n: counts.used,
                withTime: counts.withTime,
                timeByFloor: counts.timeByFloor,
                timeByDays: counts.timeByDays,
                naTime: counts.naTime,
                withImportance: counts.withImportance,
                naImportance: counts.naImportance,
                neighborHits: counts.neighborHits,
                clampedTime: counts.clampedTime,
                importanceAssumed: counts.importanceAssumed,
                reorderTop: counts.reorderTop,
                changed: counts.changed,
                active: counts.state === STATES.COMPOSED
            }
        };
    }

    function emptyReadings(counts) {
        return {
            state: STATES.MALFORMED,
            n: 0,
            withTime: 0,
            timeByFloor: 0,
            timeByDays: 0,
            naTime: 0,
            withImportance: 0,
            naImportance: 0,
            neighborHits: 0,
            clampedTime: 0,
            importanceAssumed: 0,
            reorderTop: 0,
            active: false,
            reason: counts.reason || ''
        };
    }

    /**
     * summary(res) -> 人话。neural 与 composed 用**不同句子**（否则面板上同形）。
     */
    function summary(res) {
        var r = (res && res.readings) || {};
        if (!res || res.state === STATES.MALFORMED) {
            return '终分未合成（' + (r.reason || (res && res.counts && res.counts.reason) || 'malformed') + '）';
        }
        if (res.state === STATES.NEUTRAL) {
            return '终分空转：' + r.n + ' 条全部无可用因子（时间 / 重要性 / 邻楼都缺席），排序与原始分一致';
        }
        var s = '终分 ' + r.n + ' 条：时间 ×' + r.withTime;
        if (r.timeByFloor || r.timeByDays) {
            var _basis = [];
            if (r.timeByFloor) _basis.push('楼' + r.timeByFloor);
            if (r.timeByDays) _basis.push('天' + r.timeByDays);
            s += '（' + _basis.join('/') + '）';
        }
        if (r.naTime) s += '（缺 ' + r.naTime + '）';
        s += ' · 重要性 ×' + r.withImportance;
        if (r.naImportance) s += '（缺 ' + r.naImportance + '）';
        if (r.neighborHits) s += ' · 邻楼 ' + r.neighborHits + ' 条';
        if (r.clampedTime) s += ' · 时间触下限 ' + r.clampedTime;
        if (r.importanceAssumed) s += ' · 口径靠推断 ' + r.importanceAssumed;
        s += ' · 前三位换 ' + r.reorderTop;
        return s;
    }

    return {
        STATES: STATES,
        DEFAULTS: DEFAULTS,
        compose: compose,
        summary: summary,
        importanceOf: importanceOf,
        ageOf: ageOf
    };
}));