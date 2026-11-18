/* ============================================================
 * injection-panel.js — R24-X9 注入面透明化：这一轮到底注入了什么
 *
 * 【治的欠债】injection-receipt / injection-router 记了注入，但**用户看不到**。
 *   用户能感知的只有「角色好像知道 / 好像不知道」。剧透、已作废、别人视角的私密
 *   被塞进上下文时，没有任何面能发现。
 *
 * 【一处计算】面板与真正送进上下文的文本由同一个 `render()` 生成：
 *   面板列多少条，文本就有多少行（不许各算一遍）。
 * 【裁掉要报】因预算被裁的条目必须出现在 `dropped` 里，不许静默丢。
 * 【剧透防护】标记 future 的记忆默认不注入；强制开启后注入且读数可见。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaInjectionPanel = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var REASONS = Object.freeze([
        "相关度高", "近期发生", "被引用多", "共享事件", "用户指定"
    ]);

    function arr(v) { return Array.isArray(v) ? v : []; }
    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function idOf(m) { return String(m && m.id); }
    function textOf(m) { return String(m && m.text || ""); }

    function whyOf(m) {
        if (m && m.reason) return String(m.reason);
        if (m && m.shared) return REASONS[3];
        if (m && m.pinned) return REASONS[4];
        if (m && Number(m.refCount) > 0) return REASONS[2];
        return REASONS[0];
    }

    /**
     * 一轮注入决策。candidates 按优先级排好序；budget 是字符上限。
     * 选项：tempExclude（本轮禁用）、allowFuture（强制开启剧透）。
     */
    /* [v4.160.0 · R25-O5] 裁掉原因枚举：面板与预算侧共用一张表，不许两套字符串。
     *   kind 是机器读数（稳定），why 是人读文本（由 kind 派生，不手写两份）。 */
    var DROP_KINDS = Object.freeze({
        budget: "超预算",
        future: "未来事件",
        tempExclude: "本轮手动排除"
    });

    /** token 估算：CJK 一字一拍，ASCII 四字符一拍（口径写在这里，渲染与预算同一份）。 */
    function tokenEstimate(text) {
        var t = String(text || "");
        var cjk = 0, other = 0;
        for (var i = 0; i < t.length; i++) {
            var c = t.charCodeAt(i);
            if (c >= 0x3400 && c <= 0x9FFF) cjk += 1; else other += 1;
        }
        return cjk + Math.ceil(other / 4);
    }

    function buildRound(candidates, options) {
        var list = arr(candidates);
        var o = options && typeof options === "object" ? options : {};
        var budget = Number(o.budget) > 0 ? Number(o.budget) : 600;
        var tempExclude = arr(o.tempExclude).map(String);
        var allowFuture = o.allowFuture === true;
        var entries = [];
        var dropped = [];
        var blocked = [];
        var tempBlocked = [];
        var used = 0;

        list.forEach(function (m) {
            var id = idOf(m);
            if (tempExclude.indexOf(id) !== -1) { tempBlocked.push({ id: id, kind: "tempExclude", why: DROP_KINDS.tempExclude }); return; }
            if (m && m.future === true && !allowFuture) { blocked.push({ id: id, kind: "future", why: DROP_KINDS.future + "，默认不注入（防剧透）" }); return; }
            var t = textOf(m);
            if (used + t.length > budget) {
                dropped.push({ id: id, kind: "budget", chars: t.length, tokens: tokenEstimate(t), why: DROP_KINDS.budget + "（已用 " + used + "/" + budget + "）" });
                return;
            }
            used += t.length;
            entries.push({
                id: id, text: t, chars: t.length, tokens: tokenEstimate(t),
                source: String(m.sessionId || "") + (m.floor === undefined ? "" : "#" + m.floor),
                why: whyOf(m)
            });
        });

        // usedChars / usedTokens 都从**同一份渲染结果**读（不另算一套）
        var rendered = render({ entries: entries });
        return {
            ok: true,
            entries: entries, dropped: dropped, blocked: blocked, tempBlocked: tempBlocked,
            usedChars: used, renderedChars: rendered.chars, usedTokens: rendered.tokens,
            budget: budget, remaining: budget - used,
            allowFuture: allowFuture
        };
    }

    /** 唯一渲染口：面板与上下文文本同源。 */
    function render(panel) {
        var p = panel && typeof panel === "object" ? panel : { entries: [] };
        var lines = arr(p.entries).map(function (e) { return "- " + e.text; });
        return {
            ok: true,
            text: lines.join("\n"),
            lineCount: lines.length,
            chars: lines.join("\n").length,
            tokens: tokenEstimate(lines.join("\n"))
        };
    }

    /** 本轮临时禁用（只影响本轮，不改库）。 */
    function tempDisable(panel, id) {
        var p = clone(panel || { entries: [] });
        var target = String(id);
        var entry = arr(p.entries).filter(function (e) { return e.id === target; })[0];
        if (!entry) return { ok: false, bad: ["not-in-round"], panel: p };
        p.entries = arr(p.entries).filter(function (e) { return e.id !== target; });
        p.tempBlocked = arr(p.tempBlocked).concat([{ id: target, why: "用户本轮手动排除" }]);
        p.usedChars = arr(p.entries).reduce(function (s, e) { return s + e.chars; }, 0);
        p.remaining = p.budget - p.usedChars;
        return { ok: true, panel: p };
    }

    /* ================= R26-O5 预算按上下文窗口自适应 =================
     * 欠债：token 口径有了，预算还是用户手填字符数。窗口一小就可能超窗——
     * 而超窗时引擎只能硬裁，裁在哪一级没人说得清。
     * 做法：给窗口 ⇒ 算建议条数与可用字符；真超了就按 条数→长度→只留高分 逐级降，
     *   每一级都具名（level + why + detail），回执给 gradeCount 告你降了几级。
     */
    var DEGRADE_STEPS = Object.freeze(["count", "length", "score"]);
    var STEP_WHY = Object.freeze({
        count: "按窗口容量只取前若干条",
        length: "单条过长，逐条截断到本节可容长度",
        score: "仍超窗，只留高优先级条目"
    });

    /** 条目优先级（用于 score 级）：置顶 > 被引用 > 共享事件；同分保持原序。 */
    function scoreOf(m) {
        var s = 0;
        if (m && m.pinned === true) s += 3;
        var r = Number(m && m.refCount);
        if (r > 0) s += r;
        if (m && m.shared === true) s += 1;
        return s;
    }

    /** 给上下文窗口 ⇒ 建议条数与可用字符。只算读数，不改任何东西。 */
    function suggest(candidates, options) {
        var list = arr(candidates);
        var o = options && typeof options === "object" ? options : {};
        var window = Number(o.window) > 0 ? Number(o.window) : 8000;
        var reserve = o.reserve === undefined ? Math.round(window * 0.25) : Math.max(0, Number(o.reserve) || 0);
        var overhead = Number(o.overhead) > 0 ? Number(o.overhead) : 0;
        var maxTopK = Number(o.maxTopK) > 0 ? Number(o.maxTopK) : 8;
        var available = Math.max(0, window - reserve - overhead);
        var usable = list.filter(function (m) { return !(m && (m.future === true && o.allowFuture !== true)) && !(m && m.voided === true); });
        var sumTok = 0, sumCh = 0;
        usable.forEach(function (m) { var x = textOf(m); sumTok += tokenEstimate(x); sumCh += x.length; });
        var avgTokens = usable.length ? Math.ceil(sumTok / usable.length) : 0;
        // 字符/拍 用本批实测比率（不拍常数）：中文多时接近 1，英文多时更大
        var charsPerToken = sumTok > 0 ? Number((sumCh / sumTok).toFixed(4)) : 1.5;
        var byTokens = avgTokens > 0 ? Math.floor(available / avgTokens) : 0;
        var suggestCount = Math.max(0, Math.min(byTokens, usable.length, maxTopK));
        // 用户手填条数时以手填为准（但窗口仍是兜底：超窗还得降）
        if (o.suggestCount !== undefined && Number(o.suggestCount) >= 0) {
            suggestCount = Math.max(0, Math.min(Number(o.suggestCount), usable.length, maxTopK));
        }
        var charBudget = Math.floor(available * charsPerToken);
        return {
            ok: true, window: window, reserve: reserve, overhead: overhead, available: available,
            candidates: list.length, usable: usable.length,
            avgTokens: avgTokens, charsPerToken: charsPerToken,
            suggestCount: suggestCount, charBudget: charBudget, maxTopK: maxTopK
        };
    }

    /** 自适应一轮注入：先在「理想预算」下算，超了才逐级降，每一级都留名。 */
    function adaptiveRound(candidates, options) {
        var list = arr(candidates);
        var o = options && typeof options === "object" ? options : {};
        var plan = suggest(list, o);
        var hardBudget = Number(o.budget) > 0 ? Number(o.budget) : 0;
        // 用户手填的 budget 当上限用（两者取小）：窗口算出来的才是主口径，手填不能超窗
        var budget = hardBudget > 0 ? Math.min(hardBudget, plan.charBudget || hardBudget) : (plan.charBudget || 600);
        if (budget <= 0) budget = 1;

        // 硬排除（作废 / 未来）先摘出去并具名：这两类不算「因预算降级」，不能混进 gradeCount
        var preBlocked = [];
        var working = list.filter(function (m) {
            if (m && m.voided === true) { preBlocked.push({ id: idOf(m), kind: "voided", why: "已作废，不注入" }); return false; }
            if (m && m.future === true && o.allowFuture !== true) { preBlocked.push({ id: idOf(m), kind: "future", why: DROP_KINDS.future + "，默认不注入（防剧透）" }); return false; }
            return true;
        }).map(function (m) { return clone(m); });
        var degraded = [], trimmed = [];
        var levels = { count: false, length: false, score: false };

        if (working.length > plan.suggestCount) {
            var kept = working.slice(0, plan.suggestCount);
            degraded.push({ level: "count", why: STEP_WHY.count, detail: working.length + " → " + kept.length + " 条" });
            levels.count = true;
            working = kept;
        }

        var totalChars = working.reduce(function (s, m) { return s + textOf(m).length; }, 0);
        if (working.length > 0 && totalChars > budget) {
            var perRow = Math.max(20, Math.floor(budget / working.length));
            var before = totalChars;
            working = working.map(function (m) {
                var x = textOf(m);
                if (x.length <= perRow) return m;
                var cut = { id: idOf(m), from: x.length, to: perRow };
                trimmed.push(cut);
                var next = clone(m);
                next.text = x.slice(0, perRow);
                next.trimmedFrom = x.length;
                return next;
            });
            totalChars = working.reduce(function (s, m) { return s + textOf(m).length; }, 0);
            degraded.push({ level: "length", why: STEP_WHY.length, detail: "单条上限 " + perRow + " 字（本节共 " + before + " → " + totalChars + " 字）" });
            levels.length = true;
        }

        if (working.length > 0 && totalChars > budget) {
            var avgCh = totalChars / working.length;
            var topK = Math.max(1, Math.floor(budget / Math.max(1, avgCh)));
            var ranked = working.map(function (m, i) { return { m: m, i: i, s: scoreOf(m) }; });
            ranked.sort(function (a, b) { if (b.s !== a.s) return b.s - a.s; return a.i - b.i; });
            var droppedByScore = ranked.slice(topK).map(function (x) { return { id: idOf(x.m), kind: "score", score: x.s, why: "优先级偏低（" + x.s + " 分），窗口只够 " + topK + " 条" }; });
            working = ranked.slice(0, topK).map(function (x) { return x.m; });
            degraded.push({ level: "score", why: STEP_WHY.score, detail: "留 " + working.length + " 条（按优先级）" });
            levels.score = true;
            var graded = buildRound(working, { budget: budget, tempExclude: o.tempExclude, allowFuture: o.allowFuture });
            return {
                ok: true, plan: plan, window: plan.window, available: plan.available,
                level: "score", gradeCount: degraded.length, degraded: degraded, levels: levels,
                trimmed: trimmed, entries: graded.entries,
                dropped: graded.dropped.concat(droppedByScore),
                blocked: preBlocked.concat(graded.blocked), tempBlocked: graded.tempBlocked,
                usedChars: graded.usedChars, renderedChars: graded.renderedChars, usedTokens: graded.usedTokens,
                budget: budget, remaining: graded.remaining, allowFuture: graded.allowFuture
            };
        }

        var round = buildRound(working, { budget: budget, tempExclude: o.tempExclude, allowFuture: o.allowFuture });
        var lastLevel = levels.score ? "score" : levels.length ? "length" : levels.count ? "count" : "none";
        return {
            ok: true, plan: plan, window: plan.window, available: plan.available,
            level: lastLevel, gradeCount: degraded.length, degraded: degraded, levels: levels,
            trimmed: trimmed,
            entries: round.entries, dropped: round.dropped, blocked: preBlocked.concat(round.blocked), tempBlocked: round.tempBlocked,
            usedChars: round.usedChars, renderedChars: round.renderedChars, usedTokens: round.usedTokens,
            budget: budget, remaining: round.remaining, allowFuture: round.allowFuture
        };
    }

    function makeCandidates(n) {
        var out = [];
        for (var i = 0; i < (Number(n) || 8); i++) {
            out.push({
                id: "m" + i,
                text: "记徆第" + i + "条内容共十八个字的样子",
                sessionId: "s1", floor: i + 1,
                refCount: i === 2 ? 3 : 0,
                future: i === 6
            });
        }
        return out;
    }

    function panelSelfCheck() {
        var bad = [];
        var cand = makeCandidates(8);
        var p = buildRound(cand, { budget: 60 });
        var r = render(p);
        if (r.lineCount !== p.entries.length) bad.push("panel-text-mismatch");
        if (!p.dropped.length) bad.push("no-budget-drop");
        if (!p.blocked.some(function (b) { return b.id === "m6"; })) bad.push("future-not-blocked");
        p.dropped.forEach(function (d) {
            var m = cand.filter(function (x) { return x.id === d.id; })[0];
            if (d.chars !== textOf(m).length) bad.push("drop-chars");
        });
        var forced = buildRound(cand, { budget: 400, allowFuture: true });
        if (!forced.entries.some(function (e) { return e.id === "m6"; })) bad.push("future-forced");
        var t = tempDisable(p, p.entries[0].id);
        if (!t.ok || t.panel.entries.some(function (e) { return e.id === p.entries[0].id; })) bad.push("temp-disable");
        if (t.panel.usedChars !== p.entries.slice(1).reduce(function (s, e) { return s + e.chars; }, 0)) bad.push("temp-recount");
        if (textOf(cand[6]).length > 0 && forced.entries.length <= p.entries.length) bad.push("force-not-more");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "entries=" + p.entries.length + "/" + cand.length + " dropped=" + p.dropped.length + " blocked=" + p.blocked.length + " chars=" + p.usedChars + "/" + p.budget
        };
    }

    return {
        REASONS: REASONS, DROP_KINDS: DROP_KINDS, tokenEstimate: tokenEstimate,
        DEGRADE_STEPS: DEGRADE_STEPS, STEP_WHY: STEP_WHY, scoreOf: scoreOf,
        suggest: suggest, adaptiveRound: adaptiveRound,
        buildRound: buildRound, render: render, tempDisable: tempDisable,
        makeCandidates: makeCandidates,
        panelSelfCheck: panelSelfCheck
    };
}));
