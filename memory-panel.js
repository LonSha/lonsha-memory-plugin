/* ============================================================
   LonSha 记忆引擎 · 新面板（v6）— 从零重写，不再复用宿主外壳
   ------------------------------------------------------------
   为什么另起一个面板：旧面板是「宿主 settings-ui.js 生成外壳 → dashboard-shell
   再往里塞三个视图 → 五层 CSS 互相盖」，结果是
     · 改了 CSS 看不出变化（窗口件在 .ls-dash 之外、通杀规则带 important）
     · 每次改一项都跳开发者页（dev 默认开 + 重渲染回落到 legacy 页签）
     · 改完还要点「保存并继续」（dirtybar 二次确认）
   本文件不碰旧外壳：自己建 DOM、自己画、自己存盘。旧面板只作为「高级设置」的
   深链接入口，用户不点就永不出现。

   约定
   · 只在用户手势后打开（进酒馆自动弹窗的根因就在「无手势也 open」）
   · 任何开关/档位改动立即写盘（saveConfig），没有保存按钮
   · 不做 tab 跳转：切页只换视图，不重建外壳，不碰 legacy
   ============================================================ */
(function () {
    'use strict';

    const CLS = 'lmp';
    const I = (name) => {
        try { return (window.LonShaIcons && window.LonShaIcons.svg) ? window.LonShaIcons.svg(name) : ''; } catch (_e) { return ''; }
    };
    const esc = (t) => String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&#34;');
    const safe = (fn, d) => { try { const v = fn(); return v === undefined ? d : v; } catch (_e) { return d; } };

    /* ---------- 用户手势门：没有手势就不许开 ---------- */
    let lastGestureAt = 0;
    const markGesture = () => { lastGestureAt = Date.now(); };
    ['pointerdown', 'touchstart', 'keydown', 'click'].forEach((t) => {
        document.addEventListener(t, markGesture, { capture: true, passive: true });
    });
    const hasGesture = () => (Date.now() - lastGestureAt) < 2000;

    /* ---------- 数据 ---------- */
    const cfg = () => safe(() => window.LonShaMemory.engine.config.config, {}) || {};
    const saveCfg = () => safe(() => window.LonShaMemory.engine.config.saveConfig(), null);

    function readState() {
        const p = window.LonShaMemory;
        const s = safe(() => p.engine, null);
        const c = cfg();
        const summaries = safe(() => (Array.isArray(s.summary.summaries) ? s.summary.summaries : null), null);
        const suspense = safe(() => (typeof s.suspense.openItems === 'function' ? (s.suspense.openItems() || []) : null), null);
        const chars = safe(() => (s.status.characters ? Object.keys(s.status.characters) : null), null);
        const timeline = safe(() => (s.timeline && Array.isArray(s.timeline.entries) ? s.timeline.entries : null), null);
        const profileMap = { lite: '轻量', balanced: '均衡', deep: '深读' };
        return {
            enabled: c.enabled !== false,
            auto: c.extractionEnabled !== false,
            profile: c.extractionProfile || 'balanced',
            profileLabel: profileMap[c.extractionProfile] || '均衡',
            count: summaries ? summaries.length : null,
            chars: chars ? chars.length : null,
            suspense: suspense ? suspense.length : null,
            recent: summaries ? summaries.slice(-4).reverse() : null,
            openItems: suspense ? suspense.slice(0, 3) : null,
            timelineCount: timeline ? timeline.length : null,
            running: c.enabled !== false && c.extractionEnabled !== false,
        };
    }

    /* ---------- 视图 ---------- */
    function statusHTML(st) {
        const tone = !st.enabled ? 'off' : (st.auto ? 'ok' : 'warn');
        const title = !st.enabled ? '记忆已关' : (st.auto ? '自动记忆运行中' : '只记你手动要记的');
        const sub = !st.enabled
            ? '打开下面的开关，它才会开始整理你聊过的东西。'
            : (st.auto ? '继续聊天就行，新的剧情它会自己整理。' : '打开「自动记住新剧情」，就不用每次手动点。');
        return `<div class="lmp-status" data-tone="${tone}">
            <span class="lmp-dot" aria-hidden="true"></span>
            <div class="lmp-status-txt"><b>${title}</b><span>${sub}</span></div>
        </div>`;
    }

    function metricsHTML(st) {
        const one = (v, k) => `<div class="lmp-metric"><b>${v == null ? '—' : v}</b><span>${k}</span></div>`;
        return `<div class="lmp-metrics">
            ${one(st.count, '段剧情已记住')}${one(st.chars, '位登场人物')}${one(st.suspense, '条未完约定')}
        </div>`;
    }

    function overviewHTML(st) {
        const rows = st.recent == null
            ? '<p class="lmp-note">读不到记忆数据，重开面板试试。</p>'
            : (st.recent.length === 0
                ? '<p class="lmp-note">还没有记录。继续聊天，这里会自动写下发生过的事。</p>'
                : st.recent.map((m) => {
                    const t = String(m.text || m.summary || '');
                    return `<li class="lmp-row"><span class="lmp-row-main">${esc(t.slice(0, 70))}${t.length > 70 ? '…' : ''}</span><span class="lmp-row-meta">第 ${esc(m.floor ?? '?')} 楼</span></li>`;
                }).join(''));
        const sus = !st.openItems || st.openItems.length === 0
            ? ''
            : `<section class="lmp-sec"><h3>未完的约定</h3><ul class="lmp-list">${st.openItems.map((it) =>
                `<li class="lmp-row"><span class="lmp-row-main">${esc(it.title || it.text || '')}</span><span class="lmp-row-meta">${it.floor ? '第 ' + esc(it.floor) + ' 楼起' : '进行中'}</span></li>`).join('')}</ul></section>`;
        return `<div class="lmp-view" data-view="overview">
            ${statusHTML(st)}
            ${metricsHTML(st)}
            <section class="lmp-sec"><h3>最近记住的事</h3><ul class="lmp-list">${rows === '' ? '' : rows}</ul></section>
            ${sus}
        </div>`;
    }

    const ACTS = [
        ['timeline', 'clock', '故事时间线', '按楼层回看发生过什么', 'showBrowser', 'timeline'],
        ['people', 'people', '人物', '出场过的人，各自记得什么', 'showBrowser', 'people'],
        ['suspense', 'flag', '约定与悬念', '没兑现的承诺', 'showBrowser', 'suspense'],
        ['ckpt', 'bookmark', '检查点', '先存一份再动手', 'showCheckpoints'],
        ['viz', 'graph', '关系图', '谁和谁有关', 'showVisualizer'],
        ['correct', 'pencil', '纠正记忆', '记错了就改', 'showCorrectionPanel'],
    ];
    function memoryHTML(st) {
        const p = window.LonShaMemory || {};
        const rows = ACTS.filter((a) => typeof p[a[4]] === 'function').map(([id, ico, t, s]) => {
            const extra = id === 'people' ? (st.chars != null ? st.chars + ' 人' : '') : (id === 'suspense' ? (st.suspense != null ? st.suspense + ' 条' : '') : '');
            return `<button type="button" class="lmp-row lmp-row-btn" data-act="${id}">
                <span class="lmp-row-ico" aria-hidden="true">${I(ico)}</span>
                <span class="lmp-row-main">${t}<em>${s}</em></span>
                ${extra ? `<span class="lmp-row-meta">${extra}</span>` : ''}
                <span class="lmp-chev" aria-hidden="true">›</span>
            </button>`;
        }).join('');
        return `<div class="lmp-view" data-view="memory"><div class="lmp-stack">${rows || '<p class="lmp-note">这个版本没有可用的浏览入口。</p>'}</div></div>`;
    }

    function switchRow(key, title, sub, on) {
        return `<label class="lmp-row lmp-switch">
            <span class="lmp-row-main">${title}<em>${sub}</em></span>
            <input type="checkbox" data-cfg="${key}" ${on ? 'checked' : ''}>
            <span class="lmp-track" aria-hidden="true"></span>
        </label>`;
    }
    function segRow(key, title, opts, cur) {
        return `<div class="lmp-field"><span class="lmp-field-k">${title}</span>
            <div class="lmp-seg" role="radiogroup" aria-label="${title}" data-seg="${key}">
                ${opts.map(([v, l]) => `<button type="button" role="radio" data-val="${v}" aria-checked="${cur === v}">${l}</button>`).join('')}
            </div></div>`;
    }
    function settingsHTML(st) {
        return `<div class="lmp-view" data-view="settings">
            <div class="lmp-stack">
                ${switchRow('enabled', '启用记忆', '关掉就什么都不记了', st.enabled)}
                ${switchRow('extractionEnabled', '自动记住新剧情', '每轮聊完自己整理，不用你点', st.auto)}
            </div>
            <div class="lmp-group">
                ${segRow('extractionProfile', '记忆档位', [['lite', '轻量'], ['balanced', '均衡'], ['deep', '深读']], st.profile)}
            </div>
            <div class="lmp-stack">
                <button type="button" class="lmp-row lmp-row-btn" data-act="advanced">
                    <span class="lmp-row-main">高级设置<em>接口、实验室、体检详情都在这里</em></span>
                    <span class="lmp-chev" aria-hidden="true">›</span>
                </button>
            </div>
            <p class="lmp-note">改动即时生效，没有保存按钮。</p>
        </div>`;
    }

    /* ---------- 壳 ---------- */
    let root = null;
    let view = 'overview';

    function render() {
        if (!root) return;
        const st = readState();
        const body = root.querySelector('.lmp-body');
        body.innerHTML = view === 'overview' ? overviewHTML(st) : (view === 'memory' ? memoryHTML(st) : settingsHTML(st));
        root.querySelectorAll('.lmp-tabs button').forEach((b) => {
            const on = b.dataset.view === view;
            b.setAttribute('aria-selected', on ? 'true' : 'false');
            b.classList.toggle('on', on);
        });
    }

    function toast(msg) {
        if (!root) return;
        let t = root.querySelector('.lmp-toast');
        if (!t) { t = document.createElement('div'); t.className = 'lmp-toast'; root.appendChild(t); }
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._h);
        t._h = setTimeout(() => t.classList.remove('show'), 1400);
    }

    function openPanel(startView) {
        if (!hasGesture()) return false;
        if (root) { if (startView) { view = startView; render(); } return true; }
        if (!window.LonShaMemory) return false;
        view = startView || 'overview';
        root = document.createElement('div');
        root.className = CLS;
        root.setAttribute('role', 'dialog');
        root.setAttribute('aria-modal', 'true');
        root.setAttribute('aria-label', '记忆引擎');
        root.innerHTML = `
            <div class="lmp-sheet">
                <header class="lmp-head">
                    <span class="lmp-title">记忆引擎<i class="lmp-ver">v6</i></span>
                    <button type="button" class="lmp-x" aria-label="关闭">✕</button>
                </header>
                <div class="lmp-body" tabindex="0"></div>
                <nav class="lmp-tabs" role="tablist" aria-label="分区">
                    <button type="button" role="tab" data-view="overview">${I('rings')}<span>概览</span></button>
                    <button type="button" role="tab" data-view="memory">${I('brain')}<span>记忆</span></button>
                    <button type="button" role="tab" data-view="settings">${I('gear')}<span>设置</span></button>
                </nav>
            </div>`;
        document.body.appendChild(root);
        document.documentElement.classList.add('lmp-lock');

        root.addEventListener('click', (e) => {
            if (e.target === root) return close();
            const tab = e.target.closest('.lmp-tabs button');
            if (tab) { view = tab.dataset.view; render(); return; }
            if (e.target.closest('.lmp-x')) return close();
            const seg = e.target.closest('.lmp-seg button');
            if (seg) {
                const key = seg.parentElement.dataset.seg;
                const c = cfg();
                c[key] = seg.dataset.val;
                saveCfg();
                render();
                toast('已改：' + seg.textContent.trim());
                return;
            }
            const act = e.target.closest('[data-act]');
            if (act) { doAct(act.dataset.act); }
        });
        root.addEventListener('change', (e) => {
            const box = e.target.closest('input[data-cfg]');
            if (!box) return;
            const c = cfg();
            c[box.dataset.cfg] = !!box.checked;
            saveCfg();
            render();
            toast(box.checked ? '已打开' : '已关闭');
        });
        const onKey = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', onKey);
        root._onKey = onKey;
        render();
        return true;
    }

    function doAct(id) {
        const p = window.LonShaMemory || {};
        const close2 = () => close();
        try {
            if (id === 'timeline') { close2(); return p.showBrowser && p.showBrowser('timeline'); }
            if (id === 'people') { close2(); return p.showBrowser && p.showBrowser('people'); }
            if (id === 'suspense') { close2(); return p.showBrowser && p.showBrowser('suspense'); }
            if (id === 'ckpt') { close2(); return p.showCheckpoints && p.showCheckpoints(); }
            if (id === 'viz') {
                close2();
                const fn = ['showVisualizer', 'openVisualizer', 'showVisualPanel', 'showMemoryVisual'].find((k) => typeof p[k] === 'function');
                return fn && p[fn]();
            }
            if (id === 'correct') { close2(); return p.showCorrectionPanel && p.showCorrectionPanel(); }
            if (id === 'advanced') {
                close2();
                return p.__lmpLegacySettings ? p.__lmpLegacySettings() : (p.showSettingsPanel && p.showSettingsPanel());
            }
        } catch (e) {
            try { (window.LonShaMemory.reportError || console.warn)(e, 'memory-panel.act.' + id); } catch (_e) { /* 忽略 */ }
        }
        return null;
    }

    function close() {
        if (!root) return;
        try { document.removeEventListener('keydown', root._onKey); } catch (_e) { /* 忽略 */ }
        root.remove();
        root = null;
        document.documentElement.classList.remove('lmp-lock');
    }

    /* ---------- 接线：把所有入口都指向新面板 ---------- */
    function wire() {
        const p = window.LonShaMemory;
        if (!p) return;
        if (!p.__lmpWired) {
            p.__lmpWired = true;
            /* 旧面板留一份真身，只给「设置 → 高级设置」和开发者面(diag)用 */
            p.__lmpLegacySettings = typeof p.showSettingsPanel === 'function' ? p.showSettingsPanel.bind(p) : null;
            try { console.log('[LonSha] 面板 v6 已加载'); } catch (_e) { /* 忽略 */ }
        }
        /* 入口必须「反复压」：dashboard-shell 会在插件就绪后再包一次 showSettingsPanel，
           只覆盖一次就会被它包回去 —— 用户看到的仍然是旧面板（这就是上一版失效的原因）。 */
        const legacy = p.__lmpLegacySettings;
        p.showPanel = () => { openPanel('overview'); };
        p.showFabMenu = () => { openPanel('overview'); };
        p.showSettingsPanel = function (diag) {
            if (diag === true && legacy) return legacy(true);
            openPanel('overview');
            return true;
        };
        p.__lmpOpen = openPanel;
        p.__lmpClose = close;
    }

    /* 前 16 秒内每 400ms 重压一次；之后停手（不再占 CPU） */
    let tries = 0;
    const boot = setInterval(() => {
        wire();
        if (++tries > 40) clearInterval(boot);
    }, 400);

    window.LonShaPanel = { open: openPanel, close, version: '6.0.0' };
})();