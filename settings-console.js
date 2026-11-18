/* ============================================================
 * settings-console.js — R24-O6 设置面：从表单堆到可理解的控制台
 *
 * 【治的欠债】settings-ui 5787 行，每个开关只写名字，不写「设了会怎样」，改完没有反馈。
 *
 * 【做法】登记制：{id, group, label, def, effect, impact(values)}
 *   impact 是**算出来的读数**（同一配置必得同一读数），不是写死的文案。
 *   每项同时给「当前生效值 / 默认值 / 是否偏离」，支持分组与全局回默认。
 * ============================================================ */

(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        root.LonShaSettingsConsole = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    var GROUPS = Object.freeze(["memory", "recall", "inject", "privacy", "advanced"]);
    var GROUP_LABELS = Object.freeze({
        memory: "记忉什么",
        recall: "怎么召回",
        inject: "注入多少",
        privacy: "数据与隐私",
        advanced: "高级"
    });

    function num(v, d) { var n = Number(v); return Number.isFinite(n) ? n : d; }

    var REGISTRY = [
        { id: "memory.autoExtract", group: "memory", label: "自动抽取记忆", def: true, effect: "每轮对话后抽一次事实", impact: function (v) { return v ? "每轮增加 1 次抽取" : "不自动抽取"; } },
        { id: "memory.maxPerSession", group: "memory", label: "单会话上限", def: 2000, effect: "超出后转入冷层", impact: function (v) { return "超过 " + num(v, 2000) + " 条后新记忆进冷层"; } },
        { id: "recall.topK", group: "recall", label: "每轮召回条数", def: 5, effect: "候选集大小", impact: function (v) { return "候选集 " + num(v, 5) + " 条"; } },
        { id: "recall.routes", group: "recall", label: "召回路径数", def: 3, effect: "bm25 / ngram / vector", impact: function (v) { return num(v, 3) + " 路融合"; } },
        { id: "recall.rrfK", group: "recall", label: "融合平滑系数", def: 60, effect: "RRF 的 k", impact: function (v) { return "RRF k=" + num(v, 60); } },
        { id: "inject.budget", group: "inject", label: "每轮注入预算", def: 6, effect: "一轮最多注入多少条", impact: function (v) { return "每轮最多注入 " + num(v, 6) + " 条"; } },
        { id: "inject.style", group: "inject", label: "注入形式", def: "list", effect: "列表或叙事", impact: function (v) { return String(v) === "prose" ? "叙事式，占更多 token" : "列表式，省 token"; } },
        { id: "privacy.forgetLevel", group: "privacy", label: "删除级别", def: "purge", effect: "mask / purge / purge_all", impact: function (v) { return "默认删除级别：" + String(v); } },
        { id: "privacy.exportBefore", group: "privacy", label: "删前自动导出", def: false, effect: "删之前先备份", impact: function (v) { return v ? "删前会先导出备份" : "删了就没了"; } },
        { id: "advanced.debugLines", group: "advanced", label: "诊断行输出", def: false, effect: "控制台打印引擎读数", impact: function (v) { return v ? "每轮多写 3 行日志" : "不写诊断日志"; } },
        { id: "advanced.indexWarmup", group: "advanced", label: "启动预建索引", def: true, effect: "启动慢一点，首次快", impact: function (v) { return v ? "启动 +约 90ms" : "启动快，首次现建"; } },
        { id: "advanced.compressOnIdle", group: "advanced", label: "空闲时压缩", def: true, effect: "合并相似记忆", impact: function (v) { return v ? "空闲合并开" : "不合并"; } }
    ];

    function itemsOfGroup(group) {
        return REGISTRY.filter(function (it) { return it.group === group; });
    }

    function defaults() {
        var v = {};
        REGISTRY.forEach(function (it) { v[it.id] = it.def; });
        return v;
    }

    /** 面：当前值 / 默认值 / 是否偏离 / 影响读数。 */
    function view(values) {
        var v = Object.assign({}, defaults(), values || {});
        var rows = REGISTRY.map(function (it) {
            return {
                id: it.id, group: it.group, groupLabel: GROUP_LABELS[it.group] || it.group,
                label: it.label, effect: it.effect,
                current: v[it.id], def: it.def,
                deviated: JSON.stringify(v[it.id]) !== JSON.stringify(it.def),
                impact: it.impact(v[it.id])
            };
        });
        var byGroup = {};
        GROUPS.forEach(function (g) { byGroup[g] = rows.filter(function (r) { return r.group === g; }); });
        return { ok: true, values: v, rows: rows, byGroup: byGroup, deviatedCount: rows.filter(function (r) { return r.deviated; }).length };
    }

    /** 联合读数：同一配置必得同一读数（可复算，不是写死文案）。 */
    function budgetReading(values) {
        var v = Object.assign({}, defaults(), values || {});
        var topK = num(v["recall.topK"], 5);
        var budget = num(v["inject.budget"], 6);
        var routes = num(v["recall.routes"], 3);
        var injected = Math.min(topK, budget);
        return {
            topK: topK, budget: budget, routes: routes, injectPerTurn: injected,
            note: "每轮最多注入 " + injected + " 条（取召回条数与预算小者）"
        };
    }

    function resetGroup(values, group) {
        var v = Object.assign({}, values || {});
        itemsOfGroup(group).forEach(function (it) { v[it.id] = it.def; });
        return v;
    }

    function resetAll() { return defaults(); }

    /** 审计：登记表 vs 现有控件，差异逐条列出。 */
    function audit(controlIds) {
        var controls = Array.isArray(controlIds) ? controlIds.map(String) : [];
        var regIds = REGISTRY.map(function (it) { return it.id; });
        return {
            registryCount: regIds.length,
            controlCount: controls.length,
            missing: controls.filter(function (id) { return regIds.indexOf(id) === -1; }),
            extra: regIds.filter(function (id) { return controls.indexOf(id) === -1; }),
            sameSet: controls.length === regIds.length && controls.every(function (id) { return regIds.indexOf(id) !== -1; })
        };
    }

    /** [v4.160.0 · R25-O9] 诊断包：只带配置与可复算读数，**不带任何记忆正文**。
     *   报障时用户能一键交出「与默认差在哪」，而不是截图让人猜。
     */
    function diagnostics(values, options) {
        var o = options && typeof options === "object" ? options : {};
        var v = view(values);
        var rows = v.rows.filter(function (r) { return r.deviated; }).map(function (r) {
            return { id: r.id, group: r.group, current: r.current, def: r.def, impact: r.impact };
        });
        var pack = {
            kind: "lonsha-settings-diagnostics",
            version: 1,
            at: String(o.at || ""),
            appVersion: String(o.appVersion || ""),
            deviatedCount: rows.length,
            deviations: rows,
            readings: budgetReading(v.values),
            host: String(o.host || ""),
        };
        var scan = scanSensitive(pack, o.needles);
        pack.sensitiveScan = { ok: scan.ok, hits: scan.hits.length };
        return { ok: scan.ok, pack: pack, hits: scan.hits };
    }

    /** 敏感扫描：诊断包里不得出现记忆正文/人名类命中词。 */
    function scanSensitive(pack, needles) {
        var text = JSON.stringify(pack);
        var list = Array.isArray(needles) ? needles.map(String) : [];
        var hits = list.filter(function (n) { return n && text.indexOf(n) !== -1; });
        return { ok: hits.length === 0, hits: hits };
    }

    /** 导入一份诊断包：只回填被点名的控制项（其余保持默认，不偷偷继承）。 */
    function importDiagnostics(pack) {
        var p = pack && typeof pack === "object" ? pack : null;
        if (!p || p.kind !== "lonsha-settings-diagnostics") return { ok: false, bad: ["not-a-diagnostics-pack"], values: defaults() };
        if (Number(p.version) !== 1) return { ok: false, bad: ["version-mismatch"], values: defaults() };
        var v = defaults();
        var applied = [], unknown = [];
        (Array.isArray(p.deviations) ? p.deviations : []).forEach(function (row) {
            var id = String(row && row.id || "");
            if (!REGISTRY.some(function (it) { return it.id === id; })) { unknown.push(id); return; }
            v[id] = row.current;
            applied.push(id);
        });
        return { ok: true, values: v, applied: applied, unknown: unknown };
    }

    /** [v4.162.0 · R26-O9] 导入前置预览：先看会改哪几项，再决定要不要导。
     *   预览与真导入共用同一回填路径，所以「预览说改 3 项」必然等于「导完改 3 项」。
     */
    function previewImport(pack, currentValues) {
        var back = importDiagnostics(pack);
        if (!back.ok) return { ok: false, bad: back.bad, willChange: [], unchanged: [], unknown: [] };
        var v = Object.assign({}, defaults(), currentValues || {});
        var willChange = [], unchanged = [];
        back.applied.forEach(function (id) {
            var from = v[id], to = back.values[id];
            if (JSON.stringify(from) === JSON.stringify(to)) unchanged.push({ id: id, value: to });
            else willChange.push({ id: id, from: from, to: to });
        });
        return { ok: true, willChange: willChange, unchanged: unchanged, unknown: back.unknown.slice(), values: back.values };
    }

    function settingsSelfCheck() {
        var bad = [];
        if (REGISTRY.length < 10) bad.push("registry-thin");
        GROUPS.forEach(function (g) { if (!itemsOfGroup(g).length) bad.push("empty-group:" + g); });
        var d = defaults();
        if (view(d).deviatedCount !== 0) bad.push("default-deviated");
        if (view(Object.assign({}, d, { "recall.topK": 9 })).deviatedCount !== 1) bad.push("deviate-count");
        var b1 = budgetReading(Object.assign({}, d, { "recall.topK": 9 }));
        var b2 = budgetReading(Object.assign({}, d, { "recall.topK": 9 }));
        if (JSON.stringify(b1) !== JSON.stringify(b2)) bad.push("impact-not-recomputable");
        if (b1.injectPerTurn !== 6) bad.push("budget-min");
        var r = resetGroup(Object.assign({}, d, { "recall.topK": 9, "recall.rrfK": 10 }), "recall");
        if (view(r).deviatedCount !== 0) bad.push("reset-group");
        if (!audit(REGISTRY.map(function (it) { return it.id; })).sameSet) bad.push("audit");
        return {
            ok: bad.length === 0, bad: bad,
            sample: "items=" + REGISTRY.length + " groups=" + GROUPS.length + " injectPerTurn=" + b1.injectPerTurn + " audit=same-set"
        };
    }

    return {
        GROUPS: GROUPS, GROUP_LABELS: GROUP_LABELS, REGISTRY: REGISTRY,
        defaults: defaults, view: view, itemsOfGroup: itemsOfGroup,
        budgetReading: budgetReading,
        resetGroup: resetGroup, resetAll: resetAll, audit: audit,
        diagnostics: diagnostics, scanSensitive: scanSensitive, importDiagnostics: importDiagnostics,
        previewImport: previewImport,
        settingsSelfCheck: settingsSelfCheck
    };
}));
