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
        buildRound: buildRound, render: render, tempDisable: tempDisable,
        makeCandidates: makeCandidates,
        panelSelfCheck: panelSelfCheck
    };
}));
