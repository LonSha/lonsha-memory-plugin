/* ============================================================
 * memory-checkup-page.js — R24-O7 诊断可读化：一页记忆体检
 *
 * 【治的欠债】engine-diagnostic-lines 6123 行 + engine-self-check 135KB 全是给开发者看的；
 *   用户遇到「角色怎么又忘了」只能看控制台日志。
 *
 * 【同源铁则】六项读数全部由**同一个快照**（`snapshot`）算出，不许各算一遍。
 *   调用方传进来的是什么，页面就是什么；页面不自己去摸引擎。
 *
 * 【人话】每个读数带一句「这意味着什么」，不用术语。
 * 【导出】导出文本不许出现内部对象路径（engine.xxx / [object Object]）。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaMemoryCheckupPage = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var DAY = 86400000;

    function arr(v) { return Array.isArray(v) ? v : []; }
    function tsOf(v) { var n = Date.parse(v && (v.at || v.createdAt) || ""); return Number.isFinite(n) ? n : 0; }

    function rate(a, b) { return b > 0 ? Number((a / b).toFixed(4)) : 0; }

    /**
     * 一页体检。snapshot 是**唯一数据源**：
     *   { memories:[], receipts:[], conflicts:[], forgotten:[], nowMs }
     */
    function buildPage(snapshot) {
        var s = snapshot && typeof snapshot === "object" ? snapshot : {};
        var now = Number(s.nowMs) || Date.parse("2026-11-18T00:00:00Z");
        var mem = arr(s.memories);
        var receipts = arr(s.receipts);
        var recalls = receipts.filter(function (r) { return r && r.kind === "recall"; });
        var recallsHit = recalls.filter(function (r) { return Number(r.hits) > 0; });
        var injects = receipts.filter(function (r) { return r && r.kind === "inject"; });
        var newIn7d = mem.filter(function (m) { var t = tsOf(m); return t > 0 && now - t <= 7 * DAY; });
        var forgotten = arr(s.forgotten);
        var conflicts = arr(s.conflicts);

        var rows = [
            { key: "total", label: "库里有多少条记忆", value: mem.length,
              means: mem.length ? "它记得 " + mem.length + " 件事。数字太大不代表记得好，要看后面的召回命中率。" : "库里还没有记忆。" },
            { key: "newIn7d", label: "近七天新增", value: newIn7d.length,
              means: newIn7d.length ? "最近一周新学会了 " + newIn7d.length + " 件事。" : "最近一周没学到新东西。" },
            { key: "recallHitRate", label: "召回命中率", value: rate(recallsHit.length, recalls.length),
              means: recalls.length ? "每 " + recalls.length + " 次召回里有 " + recallsHit.length + " 次真的找到东西；偏低就是“想不起来”。" : "召回次数太少，还算不出命中率。" },
            { key: "injectCount", label: "注入次数", value: injects.length,
              means: injects.length ? "已向对话里注入过 " + injects.length + " 次记忆。" : "还没向对话注入过记忆。" },
            { key: "conflicts", label: "待裁决冲突", value: conflicts.length,
              means: conflicts.length ? "有 " + conflicts.length + " 处记得不一样，建议看一下。" : "没有互相矛盾的记忆。" },
            { key: "forgotten", label: "已删除 · 已屏蔽", value: forgotten.length,
              means: forgotten.length ? "按你的要求处理了 " + forgotten.length + " 条记忆（丢弃或不再注入）。" : "还没删过任何记忆。" }
        ];

        return { ok: true, at: now, rows: rows, source: "snapshot", index: indexOfRows(rows) };
    }

    function indexOfRows(rows) {
        var m = {};
        rows.forEach(function (r) { m[r.key] = r.value; });
        return m;
    }

    /**
     * 「为什么这条没被召回」。三种原因各给不同答案，不许统一回“不知道”。
     */
    function whyNotRecalled(memory, context) {
        var m = memory && typeof memory === "object" ? memory : {};
        var c = context && typeof context === "object" ? context : {};
        var now = Number(c.nowMs) || Date.parse("2026-11-18T00:00:00Z");
        var sal = Number(m.salience);
        if (!Number.isFinite(sal)) sal = 0.5;
        var t = tsOf(m);
        var ageDays = t ? (now - t) / DAY : 0;
        var excluded = arr(c.excludedIds).map(String);

        if (excluded.indexOf(String(m.id)) !== -1) {
            return {
                code: "excluded", reason: "被显式排除",
                explain: "这条被你（或规则）显式排除了，不是忘了也不是搜不到。"
            };
        }
        if (m.tier === "cold") {
            return {
                code: "tier-cold", reason: "在冷层里睡着",
                explain: "它在冷层，默认不扫。你点它一下就能叫醒。"
            };
        }
        if (sal < 0.3) {
            return {
                code: "low-salience", reason: "印象太淡",
                explain: "它当时就没被记成“重要”，所以召回时排不到前面。"
            };
        }
        if (ageDays > 90) {
            return {
                code: "expired", reason: "太久了",
                explain: "这是 " + Math.round(ageDays) + " 天前的事，已超过保留期。"
            };
        }
        return {
            code: "candidate", reason: "应该能被找到",
            explain: "它没有被番妨；如果还是没出现，大概率是这次的问题没碰到它的词。"
        };
    }

    /** 导出：纯文本，不含内部对象路径。 */
    function exportText(page, extra) {
        var p = page && Array.isArray(page.rows) ? page : { rows: [] };
        var lines = [];
        lines.push("记忆体检 · " + new Date(Number(p.at) || 0).toISOString().slice(0, 10));
        p.rows.forEach(function (r) {
            lines.push("- " + r.label + "：" + r.value);
            lines.push("  " + r.means);
        });
        var e = extra && typeof extra === "object" ? extra : {};
        if (e.why) lines.push("- 为什么没被召回：" + e.why.reason + "（" + e.why.explain + "）");
        return lines.join("\n");
    }

    function checkupSelfCheck() {
        var bad = [];
        var nowMs = Date.parse("2026-11-18T00:00:00Z");
        var snap = {
            nowMs: nowMs,
            memories: [
                { id: "a", at: "2026-11-17T00:00:00Z", salience: 0.9 },
                { id: "b", at: "2026-11-10T00:00:00Z", salience: 0.8 },
                { id: "c", at: "2026-08-01T00:00:00Z", salience: 0.7 }
            ],
            receipts: [
                { kind: "recall", hits: 2 }, { kind: "recall", hits: 0 }, { kind: "inject", ids: ["a"] }
            ],
            conflicts: [{ id: "c1" }],
            forgotten: [{ id: "x", level: "purge" }]
        };
        var page = buildPage(snap);
        if (page.rows.length !== 6) bad.push("rows!=6");
        if (page.index.total !== 3) bad.push("total");
        if (page.index.newIn7d !== 1) bad.push("newIn7d");   // 只有 a 在 7 天内（b 差 8 天，边界不算）
        if (page.index.recallHitRate !== 0.5) bad.push("hitRate");
        if (page.index.injectCount !== 1) bad.push("inject");
        if (page.index.conflicts !== 1) bad.push("conflicts");
        if (page.index.forgotten !== 1) bad.push("forgotten");
        page.rows.forEach(function (r) { if (!r.means || r.means.length < 6) bad.push("means:" + r.key); });
        var codes = [
            whyNotRecalled({ id: "a", tier: "cold" }, { nowMs: nowMs }).code,
            whyNotRecalled({ id: "b", salience: 0.1 }, { nowMs: nowMs }).code,
            whyNotRecalled({ id: "c", salience: 0.9, at: "2026-01-01T00:00:00Z" }, { nowMs: nowMs }).code,
            whyNotRecalled({ id: "d", salience: 0.9, at: "2026-11-17T00:00:00Z" }, { nowMs: nowMs, excludedIds: ["d"] }).code
        ];
        if (new Set(codes).size !== 4) bad.push("reasons-collapsed");
        var txt = exportText(page, { why: whyNotRecalled({ id: "a", tier: "cold" }, { nowMs: nowMs }) });
        if (txt.indexOf("engine.") !== -1 || txt.indexOf("[object") !== -1) bad.push("leak-internal-path");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "rows=6 hitRate=" + page.index.recallHitRate + " reasons=4 no-leak=true"
        };
    }

    return {
        buildPage: buildPage,
        whyNotRecalled: whyNotRecalled,
        exportText: exportText,
        checkupSelfCheck: checkupSelfCheck
    };
}));
