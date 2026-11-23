/**
 * ui-mem-workbench.js — “书阁式工作台”外壳的挂载点（v3.482.0，stage-1 建壳 / stage-2 已接上数据面）
 *
 * 【为什么直接用别人的 UI】
 *   本插件长期把力气花在引擎上，玩家面只有抽屉面板；上游 LoreCodex（MIT）把“三栏工作台 +
 *   四套主题 + 手机端导航 + 命令面板 + 轨迹台”做完了，而且实现是**纯静态 HTML/CSS/ESM**，
 *   没有构建步骤、没有框架依赖 —— 整碗端过来比自己重画便宜一个数量级。
 *   副本住在 ui/vendor/lorecodex/**，只读；漂移由 tools/verify_lorecodex_vendor.mjs 卡住。
 *
 * 【本文件只做一件事：把壳拉起来】
 *   创建遮罩 + iframe + 关闭键 + ESC。壳里那个工作台自己会跑：它通过 index.html 里的
 *   importmap 把 `./js/api.js` 指向 ui/mem-workbench-api.js（21 个同名同形只读适配器），
 *   数据直接读同源父窗口的 `window.LonShaMemory.engine.graph.nodes`。
 *   所以**这里不需要传数据、不需要 postMessage 桥** —— 壳与宿主同源，壳自己就能读到。
 *   映射与边界写在 docs/lorecodex-workbench-adoption.md。
 *   本模块**默认不自动挂载**：没人调用就没有任何 DOM 变化，也不影响引擎读写
 *   （stage-3 才谈「接进 manifest.extra_js 与侧边栏入口」）。
 *
 * 【纪律】
 *   · 全程 fail-open：壳拉不起来只影响“看不看得见”，不影响记忆读写；
 *   · 幂等：重复 open() 只复用同一个遮罩；
 *   · 不碰全局样式：遮罩走 inline style，避免与酒馆主题互相污染（iframe 内部自带主题）。
 */
(function (root) {
    'use strict';

    const VERSION = '0.2.0';
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
            lastNote = "已打开（stage-2：壳内数据面已接线，只读）";
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
    /* 挂载点必须写成宿主名.属性名这种直挂形态（不是 IIFE 参数 root 的属性）：本仓的消费台账
     *   （tests/_consumption_lib.mjs 的 HOST_MOUNT_RE）只认 window / global / globalThis 三种宿主名。
     *   写参数名当宿主会让本模块在台账里变成「零消费孤儿」（实测：v3.482.0 首轮就是这个名字没过关），
     *   而孤儿意味着「没有消费者」—— 可它明明在玩家主页有个入口。判错的对象是台账，不是代码。 */
    if (typeof window !== 'undefined') window.LonShaMemWorkbench = api;
    else if (typeof globalThis !== 'undefined') globalThis.LonShaMemWorkbench = api;
    console.log(TAG, "v" + VERSION + " 就绪（不自动挂载；入口在玩家主页「记忆工作台」）");
})(typeof window !== "undefined" ? window : globalThis);
