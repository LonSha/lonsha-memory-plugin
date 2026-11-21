/**
 * ui-panel-seam.js — 呈现层与宿主的**唯一接缝**（[v3.479.0] 从 index.js 搬出）
 *
 * 【为什么生在仓库根、为什么文件名带 ui-】
 *   两根网同时收：① 它是 UI 接线（往 plugin 上挂面板入口 + 挂抽屉），
 *   放进 `index.js` 是错位；② 本仓 `tests/audit/ui_ratio.mjs` 按文件名词表
 *   计呈现层行数，`ui-` 前缀让它如实计入 —— 而不是塞进引擎文件里假装不存在。
 *
 * 【为什么必须搬：index.js 有「行数只降不涨」的 ratchet】
 *   `tests/audit/scan_index_split.mjs` 的 R2 拿 `index_split_ledger.json`
 *   里的天花板卡 `index.js` 行数。v3.478 那批把 `mountV4Ui()` 与两个
 *   `plugin.openXxx` 直接写进入口（+24 行），v3.479 又加了数据面板入口（+8 行），
 *   于是 R2 变红。**红得对**：这些行不是引擎装配，是 UI 接线，本来就不该在入口里。
 *   搬出来之后 index.js 回到天花板以内，接线一条不少 —— 挪位，不是删除。
 *
 * 【时序（搬移的关键前提，写下来免得后人再猜）】
 *   `manifest.extra_js` 里的脚本由宿主在**入口脚本之后**加载，所以本模块执行时
 *   `window.LonShaMemory` 已经赋值。即便如此也不赌：
 *   · 取不到就登记「等待」，并在 DOMContentLoaded 与两次短延时重试（共 3 次）；
 *   · 全程 fail-open：接缝失败只影响面板能不能被叫起来，不影响记忆引擎读写。
 *   这与 `v4-panel-ui.js` 自己的 `autoMount` 同一套纪律，两边都不假设对方先跑。
 */
(function (root) {
    'use strict';

    const VERSION = '1.0.0';
    const TAG = '[LonSha:ui-seam]';
    let attachedTo = null;      // 已接上的 plugin（幂等标记）
    let attachNote = '未尝试';  // 人话读数：这次为什么没接上

    function doc() {
        try { return (root && root.document) || null; } catch (_e) { return null; }
    }

    function pluginOf() {
        try { return (root && root.LonShaMemory) || null; } catch (_e) { return null; }
    }

    /** 取某个 UI 模块（三种出口都认：全局名 / require / 直接没有） */
    function mod(globalName, relPath) {
        try {
            if (root && root[globalName]) return root[globalName];
        } catch (_e) { /* 忽略 */ }
        try {
            if (typeof require === 'function') return require(relPath);
        } catch (_e) { /* 忽略 */ }
        return null;
    }

    function toast(plugin, level, text) {
        try { plugin.lsToast?.(level, text); } catch (_e) { /* ignore */ }
    }

    /** V4 抽屉挂载（原 index.js 的 mountV4Ui） */
    function mountV4(plugin) {
        const ui = mod('LonShaV4PanelUi', './v4-panel-ui.js');
        if (!ui) { attachNote = 'v4-panel-ui.js 未加载'; return false; }
        try {
            if (typeof ui.mount === 'function') { ui.mount(plugin); return true; }
            if (typeof ui.autoMount === 'function') { ui.autoMount(); return true; }
        } catch (e) {
            console.warn(TAG, '抽屉挂载失败（不影响引擎）', e);
        }
        return false;
    }

    /* ── 三个面板入口：都是「模块在就转调，不在就明说」──────────────────
     * 刻意不在这里兜底成空表/空面板：面板缺席要说「模块未加载」，
     * 而不是给一个看起来正常的空壳 —— 那是把「没跑」显示成「没有」。
     * onChanged 一律接 _memPersist：面板里的写操作要落盘，不落盘等于没改。 */

    function makeOpener(plugin, opts) {
        return function () {
            const m = mod(opts.global, opts.path);
            if (!m || typeof m[opts.fn] !== 'function') {
                toast(plugin, 'warn', opts.label + '模块未加载');
                return false;
            }
            try {
                m[opts.fn]({ onChanged: () => { try { plugin._memPersist?.(); } catch (_e) { /* ignore */ } } });
                return true;
            } catch (e) {
                console.warn(TAG, opts.label + '打开失败', e);
                return false;
            }
        };
    }

    /** 数据面板统一入口。kind ∈ npc / scene / vars / items
     *  lookup 可注入（默认走 mod）：自检要能**两向**验证「模块缺席→false / 在场→true 且真调到」，
     *  否则这条断言只会在真宿主里恒假或恒真，等于没测。 */
    function makeDataOpener(plugin, lookup) {
        const pick = (typeof lookup === 'function') ? lookup : mod;
        return function (kind) {
            const m = pick('LonShaDataPanels', './ui-data-panels.js');
            if (!m || typeof m.open !== 'function') {
                toast(plugin, 'warn', '数据面板模块未加载');
                return false;
            }
            try { m.open(kind); return true; } catch (e) {
                console.warn(TAG, '数据面板打开失败 ' + String(kind), e);
                return false;
            }
        };
    }

    /**
     * 接上宿主。幂等：同一个 plugin 只接一次。
     * 返回 true 表示这次真接上了（或早已接上）。
     */
    function attach(plugin) {
        const p = plugin || pluginOf();
        if (!p) { attachNote = 'window.LonShaMemory 尚未就位'; return false; }
        if (attachedTo === p) return true;
        try {
            p.openSummaryTree = makeOpener(p, {
                global: 'LonShaSummaryTree', path: './ui-summary-tree.js',
                fn: 'openSummaryTree', label: '摘要树',
            });
            p.openFloorPanel = makeOpener(p, {
                global: 'LonShaFloorPanel', path: './ui-floor-panel.js',
                fn: 'openFloorPanel', label: '楼层面板',
            });
            p.openDataPanel = makeDataOpener(p);
            p.openUiPanel = function () { return mountV4(p); };  // 抽屉重挂（宿主清过 DOM 时用）
            attachedTo = p;
            attachNote = '已接上';
            mountV4(p);
            return true;
        } catch (e) {
            attachNote = '接上失败：' + ((e && e.message) || e);
            console.warn(TAG, '接线失败（不影响引擎）', e);
            return false;
        }
    }

    /* ── 装载即试接；不成就等 DOM 与两次短延时（共 3 次机会）────────── */
    let tries = 0;
    function tryAttach() {
        tries += 1;
        if (attach()) return true;
        if (tries >= 3) return false;
        const d = doc();
        if (d && typeof d.addEventListener === 'function') {
            d.addEventListener('DOMContentLoaded', () => { attach(); }, { once: true });
        }
        try {
            if (typeof setTimeout === 'function') setTimeout(() => { attach(); }, 400 * tries);
        } catch (_e) { /* 无定时器的宿主：只靠 DOM 事件 */ }
        return false;
    }

    function status() {
        return {
            version: VERSION,
            attached: !!attachedTo,
            note: attachNote,
            tries,
            modules: {
                'v4-panel-ui.js': !!mod('LonShaV4PanelUi', './v4-panel-ui.js'),
                'ui-summary-tree.js': !!mod('LonShaSummaryTree', './ui-summary-tree.js'),
                'ui-floor-panel.js': !!mod('LonShaFloorPanel', './ui-floor-panel.js'),
                'ui-data-panels.js': !!mod('LonShaDataPanels', './ui-data-panels.js'),
            },
        };
    }

    function selfCheck() {
        const fails = [];
        const checks = [];
        const ok = (name, cond, detail) => {
            checks.push({ name, ok: !!cond, detail });
            if (!cond) fails.push(name + (detail ? '：' + detail : ''));
        };
        // 1) 有 plugin 时能接上，且四个入口真的挂成了函数
        const fake = {};
        const a1 = attach(fake);
        ok('有 plugin 时接线成功', a1 === true);
        ok('挂了 openSummaryTree', typeof fake.openSummaryTree === 'function');
        ok('挂了 openFloorPanel', typeof fake.openFloorPanel === 'function');
        ok('挂了 openDataPanel', typeof fake.openDataPanel === 'function');
        ok('挂了 openUiPanel（抽屉重挂）', typeof fake.openUiPanel === 'function');
        // 2) 幂等：同一个对象接两次也只有一个引用
        const before = fake.openDataPanel;
        ok('幂等：重复接线不换实现', attach(fake) === true && fake.openDataPanel === before);
        // 3) 无 plugin 时不抛错，且明确说「未就位」
        const savedAttached = attachedTo;
        attachedTo = null;
        let threw = false;
        try {
            const r = attach(null);
            ok('无 plugin 时 attach 返回 false', r === false);
        } catch (_e) { threw = true; }
        ok('无 plugin 时不抛错', threw === false);
        ok('缺位理由是人话', /未就位/.test(attachNote), attachNote);
        attachedTo = savedAttached;
        // 4) 两向自证：模块缺席 → false；模块在场 → true 且真的调到了 open(kind)
        const openMissing = makeDataOpener({}, () => null);
        ok('模块缺席时 openDataPanel 返回 false', openMissing('npc') === false);
        const hit = [];
        const openPresent = makeDataOpener({}, () => ({ open: (k) => { hit.push(k); } }));
        ok('模块在场时返回 true 且真调到 open(kind)',
            openPresent('items') === true && hit[0] === 'items', '调用记录=' + JSON.stringify(hit));
        const fake2 = {};
        attach(fake2);
        ok('挂上的 openDataPanel 是函数且不抛错', typeof fake2.openDataPanel === 'function' && typeof fake2.openDataPanel('npc') === 'boolean');
        // 5) status 自述形状齐全
        const st = status();
        ok('status 有 attached/note/tries', typeof st.attached === 'boolean' && typeof st.note === 'string' && typeof st.tries === 'number');
        ok('status.modules 覆盖四个 UI 模块', Object.keys(st.modules).length === 4);
        return { ok: fails.length === 0, version: VERSION, total: checks.length, failed: fails.length, fails, checks };
    }

    const api = {
        VERSION,
        attach,
        mountV4,
        status,
        selfCheck,
        /** 面板入口的工厂（给需要在别处复用同一套 fail-open 语态的调用方） */
        _makeOpener: makeOpener,
        _makeDataOpener: makeDataOpener,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LonShaUiSeam = api;
    if (typeof window !== 'undefined') window.LonShaUiSeam = api;

    tryAttach();
})(typeof window !== 'undefined' ? window : globalThis);