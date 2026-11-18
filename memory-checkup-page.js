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

    /** [v4.161.0 · R25-X4] 每日体检读数：只留白名单里的数字，一个正文字符都不存。
     *   同一天重复上报是常态（一天体检多次），按日子覆盖，不叠加。
     */
    /* [v4.163.0 · R26-X4] 纠错四类各自进日报：仍然只存数字，只是把 corrections 的总数拆开。
     *   四类跟纠错闭环的 ACTIONS 同名（edit/owner/time/void），换算表只写在这里。 */
    var CORRECTION_KINDS = Object.freeze(["edit", "owner", "time", "void"]);
    var CORRECTION_METRICS = CORRECTION_KINDS.map(function (k) {
        return "correction" + k.charAt(0).toUpperCase() + k.slice(1);
    });
    var DAY_METRICS = Object.freeze(["recallHits", "newMemories", "deleted", "corrections", "hitRate"].concat(CORRECTION_METRICS));

    function recordDay(ledger, day, metrics) {
        var l = ledger && Array.isArray(ledger.days) ? ledger : { days: [] };
        var key = String(day || "").trim();
        if (!key) return { ok: false, bad: ["no-day"], ledger: l };
        var src = metrics && typeof metrics === "object" ? metrics : {};
        var row = { day: key, metrics: {} };
        DAY_METRICS.forEach(function (k) {
            var v = Number(src[k]);
            if (Number.isFinite(v)) row.metrics[k] = v;
        });
        var next = arr(l.days).filter(function (d) { return String(d.day) !== key; }).concat([row]);
        next.sort(function (a, b) { return a.day < b.day ? -1 : 1; });
        return { ok: true, ledger: { days: next }, day: row, overwritten: arr(l.days).some(function (d) { return String(d.day) === key; }) };
    }

    /** 周报：给趋势 —— 每个指标首个读数到末个读数的差值与方向（方向由差值符号派生，不写死）。 */
    function weeklyReport(ledger) {
        var days = arr(ledger && ledger.days).slice().sort(function (a, b) { return a.day < b.day ? -1 : 1; });
        var rows = [];
        DAY_METRICS.forEach(function (k) {
            var pts = days.filter(function (d) { return d.metrics && Number.isFinite(Number(d.metrics[k])); });
            if (!pts.length) return;
            var first = Number(pts[0].metrics[k]);
            var last = Number(pts[pts.length - 1].metrics[k]);
            var delta = Math.round((last - first) * 10000) / 10000;
            rows.push({
                metric: k, first: first, last: last, delta: delta,
                direction: delta > 0 ? "up" : (delta < 0 ? "down" : "flat"),
                points: pts.length
            });
        });
        return {
            ok: true, rows: rows,
            coverage: { from: days.length ? days[0].day : "", to: days.length ? days[days.length - 1].day : "", days: days.length },
            empty: days.length === 0
        };
    }

    /** [v4.163.0 · R26-X4] 上报当天纠错：传动作名数组或 {edit:n,...}；总数由四类相加得出，不由调用方另填。 */
    function recordCorrections(ledger, day, actions) {
        var counts = {};
        CORRECTION_KINDS.forEach(function (k) { counts[k] = 0; });
        if (Array.isArray(actions)) {
            actions.forEach(function (a) {
                var k = String(a);
                if (CORRECTION_KINDS.indexOf(k) !== -1) counts[k] += 1;
            });
        } else if (actions && typeof actions === "object") {
            CORRECTION_KINDS.forEach(function (k) {
                var n = Number(actions[k]);
                if (Number.isFinite(n) && n > 0) counts[k] = n;
            });
        }
        var total = CORRECTION_KINDS.reduce(function (s, k) { return s + counts[k]; }, 0);
        var metrics = { corrections: total };
        CORRECTION_KINDS.forEach(function (k, i) { metrics[CORRECTION_METRICS[i]] = counts[k]; });
        var r = recordDay(ledger, day, metrics);
        return { ok: r.ok, bad: r.bad || [], ledger: r.ledger, day: r.day, overwritten: r.overwritten === true, counts: counts, total: total };
    }

    /** [v4.163.0 · R26-X4] 纠错来源明细：四类之和必等于总数；最大类唯一才点名，平票说平票。
     *   options.day 只算那一天；不给就算整本账。share 一律可复算（count/total 保留四位）。
     */
    function correctionBreakdown(ledger, options) {
        var o = options && typeof options === "object" ? options : {};
        var days = arr(ledger && ledger.days);
        var sel = o.day ? days.filter(function (d) { return String(d.day) === String(o.day); }) : days;
        var counts = {}, total = 0, declared = 0;
        CORRECTION_KINDS.forEach(function (k, i) {
            var sum = 0;
            sel.forEach(function (d) {
                var n = Number(d && d.metrics && d.metrics[CORRECTION_METRICS[i]]);
                if (Number.isFinite(n)) sum += n;
            });
            counts[k] = sum;
            total += sum;
        });
        sel.forEach(function (d) {
            var n = Number(d && d.metrics && d.metrics.corrections);
            if (Number.isFinite(n)) declared += n;
        });
        var share = {};
        CORRECTION_KINDS.forEach(function (k) { share[k] = total > 0 ? Number((counts[k] / total).toFixed(4)) : 0; });
        var max = 0;
        CORRECTION_KINDS.forEach(function (k) { if (counts[k] > max) max = counts[k]; });
        var leaders = CORRECTION_KINDS.filter(function (k) { return counts[k] === max && max > 0; });
        var tie = leaders.length > 1;
        return {
            ok: true, days: sel.length, counts: counts, total: total, declaredTotal: declared,
            consistent: total === declared,
            top: tie || !leaders.length ? "" : leaders[0],
            topCount: max, tie: tie, leaders: leaders,
            share: share, kinds: CORRECTION_KINDS.slice(),
            reason: total === 0
                ? "这段时间没有纠错记录"
                : (tie ? "最多的是并列 " + leaders.join(" / ") + " 各 " + max + " 次（平票不仲裁）"
                       : "最多的是 " + leaders[0] + "，共 " + max + " 次（占 " + Math.round((max / total) * 1000) / 10 + "%）")
        };
    }

    /** 越阈值的指标点名：只报越线的，不越线就不吭声。 */
    function healthAlerts(report, thresholds) {
        var th = thresholds && typeof thresholds === "object" ? thresholds : {};
        var out = [];
        arr(report && report.rows).forEach(function (r) {
            var lim = Number(th[r.metric]);
            if (!Number.isFinite(lim)) return;
            if (Math.abs(r.delta) < lim) return;
            out.push({
                metric: r.metric, delta: r.delta, threshold: lim,
                direction: r.direction,
                reason: r.metric + " 从 " + r.first + " 变到 " + r.last + "（" + (r.delta > 0 ? "+" : "") + r.delta + "），已越过阈值 " + lim
            });
        });
        return { ok: true, alerts: out, count: out.length };
    }

    /** [v4.161.0 · R25-X7] 问诊式问答：为什么没想起来这条。
     *   问到了就报四类原因的人话版 + 三条可操作建议；问不到就明说没找到，**绝不编一条**。
     */
    var ADVICE = Object.freeze({
        "tier-cold": ["放宽到冷层扫一次", "给它补一句描述", "把它标成重要，别让它睡在冷层"],
        "low-salience": ["把它标成重要（提高显著度）", "补一条更具体的描述", "换成当时的人或地点再问一次"],
        expired: ["纠正它的时间（旧时间会让它提前过期）", "把保留期放宽", "把它固定为长期记忆"],
        excluded: ["取消这条的排除", "检查规则是不是误伤", "下次用显式点名找回它"],
        candidate: ["换个说法再问一次", "放宽检索层级", "把当时的人或地点补进描述"],
        "no-match": ["先确认这件事真的被记下来了", "用当时的人或地点当关键词再问", "放宽到冷层与更早时间扫一次"]
    });

    /* ================= R26-X7 问诊建议一键执行 =================
     * 欠债：建议是文字，用户还得自己去找那个开关。
     * 做法：每条建议挂一个动作 id（只在 ACTIONS 白名单内才附），runAction 真去改设置 / 条目，
     *   回执里点名「改了哪一项、从什么变成什么」；query 类动作只给下一步提示，不改状态。
     */
    var ACTIONS = Object.freeze({
        "recall.widen-cold": { id: "recall.widen-cold", label: "放宽到冷层", scope: "config", set: { "recall.tiers": "hot,warm,cold" } },
        "recall.widen-tier": { id: "recall.widen-tier", label: "放宽检索层级", scope: "config", set: { "recall.tiers": "hot,warm,cold" } },
        "correction.fix-time": { id: "correction.fix-time", label: "纠正它的时间", scope: "item", patch: { needsTimeFix: true } },
        "memory.relax-retention": { id: "memory.relax-retention", label: "放宽保留期", scope: "config", set: { "memory.retentionDays": 0 } },
        "memory.pin-longterm": { id: "memory.pin-longterm", label: "固定为长期记忆", scope: "item", patch: { pinned: true } },
        "memory.mark-important": { id: "memory.mark-important", label: "标成重要", scope: "item", patch: { important: true } },
        "memory.describe": { id: "memory.describe", label: "补一句描述", scope: "item", patch: { needsDescription: true } },
        "recall.unexclude": { id: "recall.unexclude", label: "取消这条的排除", scope: "item", patch: { excluded: false } },
        "recall.explicit-name": { id: "recall.explicit-name", label: "显式点名找回", scope: "query", hint: "直接说「上次那件关于 X 的事」把这条点出来" },
        "recall.retry-entity": { id: "recall.retry-entity", label: "换当时的人或地点再问", scope: "query", hint: "用人物名或地点当关键词再问一次" }
    });

    /** 建议 → 动作 id 的对应表（与 ADVICE 同键、同序）。白名单外的 id 会在出口处变成 null。 */
    var ADVICE_ACTIONS = Object.freeze({
        "tier-cold": ["recall.widen-cold", "memory.describe", "memory.mark-important"],
        "low-salience": ["memory.mark-important", "memory.describe", "recall.retry-entity"],
        expired: ["correction.fix-time", "memory.relax-retention", "memory.pin-longterm"],
        excluded: ["recall.unexclude", "recall.check-rule", "recall.explicit-name"],
        candidate: ["recall.retry-entity", "recall.widen-tier", "memory.describe"],
        "no-match": ["recall.widen-cold", "recall.retry-entity", ""],
    });

    /** 一条原因对应的三条建议，逐条带可执行动作（白名单内才附，否则 executable:false 并说清为什么）。 */
    function adviceActions(key) {
        var k = String(key || "");
        var texts = arr(ADVICE[k]);
        if (!texts.length) return { ok: false, bad: ["no-advice"], key: k, items: [] };
        var ids = arr(ADVICE_ACTIONS[k]);
        var items = texts.map(function (text, i) {
            var want = String(ids[i] || "");
            var a = want && ACTIONS[want] ? ACTIONS[want] : null;
            return {
                text: text,
                action: a ? String(a.id) : null,
                label: a ? String(a.label) : "",
                scope: a ? String(a.scope) : "",
                executable: !!a,
                why: a ? "" : "这条建议没有可执行动作（不在白名单内）"
            };
        });
        return { ok: true, key: k, items: items, executable: items.filter(function (x) { return x.executable; }).length };
    }

    /** 按层级预览召回（只用来证明「放宽到冷层」真的有差别，不替代真召回）。 */
    function recallPreview(state, query) {
        var s = state && typeof state === "object" ? state : {};
        var tiers = String((s.settings && s.settings["recall.tiers"]) || "hot,warm").split(",");
        var q = String(query || "");
        var rows = arr(s.memories).filter(function (m) {
            if (m && m.excluded === true) return false;
            if (tiers.indexOf(String(m && m.tier || "hot")) === -1) return false;
            return q.length === 0 || String(m && m.text || "").indexOf(q) !== -1;
        });
        return { ok: true, tiers: tiers, hits: rows.map(function (m) { return String(m.id); }), count: rows.length };
    }

    /** 执行一个动作：config 改设置、item 改条目、query 只给提示。回执里逐项点名改了什么。 */
    function runAction(state, actionId, target) {
        var id = String(actionId || "");
        var a = ACTIONS[id];
        if (!a) return { ok: false, bad: ["not-in-whitelist"], id: id, changed: [] };
        var s = state && typeof state === "object" ? state : {};
        var next = JSON.parse(JSON.stringify({ settings: s.settings || {}, memories: arr(s.memories) }));
        if (a.scope === "query") {
            return { ok: true, id: id, scope: "query", changed: [], hint: String(a.hint || ""), state: next, note: "这类动作不改状态，只给下一步怎么问" };
        }
        var changed = [];
        if (a.scope === "config") {
            Object.keys(a.set || {}).forEach(function (k) {
                var from = next.settings[k] === undefined ? "(未设)" : next.settings[k];
                var to = a.set[k];
                next.settings[k] = to;
                changed.push({ key: k, from: from, to: to });
            });
            return { ok: true, id: id, scope: "config", changed: changed, state: next };
        }
        var tid = String(target === undefined || target === null ? "" : target);
        if (!tid) return { ok: false, bad: ["need-target"], id: id, changed: [] };
        var hit = -1;
        for (var i = 0; i < next.memories.length; i++) if (String(next.memories[i] && next.memories[i].id) === tid) { hit = i; break; }
        if (hit === -1) return { ok: false, bad: ["no-such-memory"], id: id, changed: [] };
        Object.keys(a.patch || {}).forEach(function (k) {
            var from = next.memories[hit][k];
            var to = a.patch[k];
            next.memories[hit][k] = to;
            changed.push({ key: "memories[" + tid + "]." + k, from: from === undefined ? "(未设)" : from, to: to });
        });
        return { ok: true, id: id, scope: "item", target: tid, changed: changed, state: next };
    }

    function askWhy(memories, question, options) {
        var o = options && typeof options === "object" ? options : {};
        var list = arr(memories);
        var terms = tokensOf(question);
        var best = null, bestHit = 0;
        list.forEach(function (m) {
            var toks = tokensOf(String(m && m.text || ""));
            var hit = terms.filter(function (t) { return toks.indexOf(t) !== -1; }).length;
            if (hit > bestHit) { bestHit = hit; best = m; }
        });
        if (!best || bestHit === 0) {
            return {
                ok: true, found: false, fabricated: false,
                answer: "没找到这条记忆：库里没有任何一条能和「" + String(question) + "」对上。",
                code: "no-match", reason: "没记下来或早就被删了",
                suggestions: ADVICE["no-match"].slice(), matched: null
            };
        }
        var why = whyNotRecalled(best, o);
        var code = String(why.code);
        var text = String(best.text || "").slice(0, 24);
        return {
            ok: true, found: true, fabricated: false,
            answer: "找到「" + text + "」这条：" + why.explain,
            code: code, reason: why.reason,
            suggestions: (ADVICE[code] || ADVICE.candidate).slice(),
            matched: { id: String(best.id), text: text, tier: String(best.tier || "") }
        };
    }

    /** 本档自己的分词：CJK 双字 + 拉丁词，够问诊用（不引入跨模块依赖）。 */
    function tokensOf(text) {
        var str0 = String(text || "").toLowerCase();
        var out = [];
        var run = "";
        for (var i = 0; i < str0.length; i += 1) {
            var c = str0.charCodeAt(i);
            var isCjk = c >= 0x3400 && c <= 0x9fff;
            if (isCjk) { run += str0.charAt(i); continue; }
            if (run) { pushRun(out, run); run = ""; }
        }
        if (run) pushRun(out, run);
        str0.split(/[^a-z0-9]+/).forEach(function (w) { if (w.length > 1 && out.indexOf(w) === -1) out.push(w); });
        return out;
    }

    function pushRun(out, run) {
        if (run.length === 1) { if (out.indexOf(run) === -1) out.push(run); return; }
        for (var i = 0; i < run.length - 1; i += 1) {
            var bg = run.substr(i, 2);
            if (out.indexOf(bg) === -1) out.push(bg);
        }
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
        recordDay: recordDay, weeklyReport: weeklyReport, healthAlerts: healthAlerts,
        askWhy: askWhy, DAY_METRICS: DAY_METRICS, ADVICE: ADVICE,
        ACTIONS: ACTIONS, ADVICE_ACTIONS: ADVICE_ACTIONS, adviceActions: adviceActions,
        recallPreview: recallPreview, runAction: runAction,
        CORRECTION_KINDS: CORRECTION_KINDS, CORRECTION_METRICS: CORRECTION_METRICS,
        recordCorrections: recordCorrections, correctionBreakdown: correctionBreakdown,
        checkupSelfCheck: checkupSelfCheck
    };
}));
