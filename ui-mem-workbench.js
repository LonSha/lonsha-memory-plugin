/**
 * ui-mem-workbench.js — “书阁式工作台”外壳的挂载点（v3.482.0 引入，stage-1：只有壳）
 *
 * 【为什么直接用别人的 UI】
 *   本插件长期把力气花在引擎上，玩家面只有抽屉面板；上游 LoreCodex（MIT）把“三栏工作台 +
 *   四套主题 + 手机端导航 + 命令面板 + 轨迹台”做完了，而且实现是**纯静态 HTML/CSS/ESM**，
 *   没有构建步骤、没有框架依赖 —— 整碗端过来比自己重画便宜一个数量级。
 *   副本住在 ui/vendor/lorecodex/**，只读；漂移由 tools/verify_lorecodex_vendor.mjs 卡住。
 *
 * 【stage-1 的范围，别把它当成品】
 *   本文件只做“把壳拉起来”：创建遮罩 + iframe + 关闭键 + ESC，别的一律不做。
 *   壳内的工作台读的是它自己的数据契约（corpora/tree/grep/trace），**尚未**接到本插件
 *   的记忆库；接线的落点是 ui/vendor/lorecodex/js/api.js（一份 20 个导出的适配器），
 *   计划与字段映射写在 docs/lorecodex-workbench-adoption.md。
 *   因此本模块**默认不自动挂载**：没人调用就没有任何 DOM 变化，也不影响引擎读写。
 *
 * 【纪律】
 *   · 全程 fail-open：壳拉不起来只影响“看不看得见”，不影响记忆读写；
 *   · 幂等：重复 open() 只复用同一个遮罩；
 *   · 不碰全局样式：遮罩走 inline style，避免与酒馆主题互相污染（iframe 内部自带主题）。
 */
(function (root) {
    'use strict';

    const VERSION = '0.1.0';
    const TAG = '[LonSha:workbench]';
    const ID = "lonsha-mem-workbench-overlay";
    let overlay = null;
    let frame = null;
    let lastNote = "未调用";

    function doc() { try { return (root && root.document) || null; } catch (_e) { return null; } }

    /** 副本入口的绝对 URL：以本脚本自身的 src 为基准（酒馆扩展目录随安装位置变）。 */
    function entryUrl() {
        try {
            const s = doc() && doc().currentScript;
            const base = s && s.src ? s.src : "";
            if (!base) return null;
            return new URL("ui/vendor/lorecodex/index.html", base).href;
        } catch (_e) { return null; }
    }

    function close() {
        try {
            if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
        } catch (_e) { /* 忽略 */ }
        overlay = null; frame = null;
    }

    function open() {
        const d = doc();
        if (!d || !d.body) { lastNote = "无 document.body（无头环境）"; return { ok: false, reason: lastNote }; }
        if (overlay) { lastNote = "已在显示"; return { ok: true, reused: true }; }
        const url = entryUrl();
        if (!url) { lastNote = "取不到脚本自身的 src，无法定位副本"; return { ok: false, reason: lastNote }; }
        try {
            overlay = d.createElement("div");
            overlay.id = ID;
            overlay.setAttribute("style", ["position:fixed", "inset:0", "z-index:2147483000",
                "background:rgba(8,10,14,.72)", "display:flex", "align-items:stretch", "padding:0"].join(";"));
            frame = d.createElement("iframe");
            frame.setAttribute("title", "记忆工作台");
            frame.setAttribute("style", "flex:1;border:0;background:#fff;");
            frame.src = url;
            overlay.appendChild(frame);
            d.body.appendChild(overlay);
            const onKey = (ev) => { if (ev && ev.key === "Escape") { close(); d.removeEventListener("keydown", onKey); } };
            d.addEventListener("keydown", onKey);
            lastNote = "已打开（stage-1：壳内数据面未接线）";
            console.log(TAG, lastNote, url);
            return { ok: true, url };
        } catch (e) {
            overlay = null; frame = null;
            lastNote = "拉起失败：" + (e && e.message);
            console.log(TAG, lastNote);
            return { ok: false, reason: lastNote };
        }
    }

    const api = { VERSION, open, close, toggle: () => (overlay ? (close(), { ok: true, closed: true }) : open()), note: () => lastNote, entryUrl };
    root.LonShaMemWorkbench = api;
    console.log(TAG, "v" + VERSION + " 就绪（不自动挂载）");
})(typeof window !== "undefined" ? window : globalThis);
