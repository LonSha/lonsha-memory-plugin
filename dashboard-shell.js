// LonSha记忆引擎 - Dashboard 外壳 (v1.1)
// v1.1（随 Dashboard v2 一起提交）：只新增两个只读扩展事件，渲染 / ID / API 与 v1.0 完全一致：
//   window  'lonsha:dashboard-enhanced'  detail = { dash, overlay, legacy, plugin, state, diag, setView, refreshHealth, isDev }
//   .ls-dash 'ls-dash:view'               detail = { view }
//   ui/dashboard-v2.js 监听它们来升级视觉；没装 v2 时事件无人监听，行为不变。
// ui/dashboard-shell.js —— 在不改 settings-ui.js 一行代码的前提下，把设置面板包装成
// 「概览 / 记忆 / 设置」三入口的玩家 Dashboard；原 general / narrative / health /
// retrieval / advanced 五个页签整体收进「开发者模式」。
//
// 契约（不破坏既有 API）：
//   · plugin.showSettingsPanel / showPlayerHome / showStatsPanel / showBrowser … 签名与行为不变；
//     本文件只在 showSettingsPanel 返回后对已生成的 #lonsha-settings-overlay 做「包装」。
//   · 原有 DOM 节点只「搬家」不重建：所有 id（ls-pane-general、ls-save、data-cfg …）、
//     事件监听、保存 / 未保存计数 / 关闭拦截逻辑全部保持原样。
//   · 原页签切换仍走 settings-ui 自己的 _syncTabs（通过 .click() 触发），不复制它的逻辑。
//   · 主题：<html data-lonsha-theme="light|dark">；auto 时按 SillyTavern 背景亮度决定。
//
// 加载：manifest.json -> extra_js 中紧跟 "settings-ui.js" 之后加入 "ui/dashboard-shell.js"；
//       样式由 css/style.css 顶部 @import 的 dashboard.css 提供。
// 关闭：localStorage.setItem('lonsha.ui.dashboard', 'off') 后刷新，即回到旧面板。
(function () {
    'use strict';
    /* v1.2：图标一律走 LonShaIcons（ui/lonsha-icons.js，原创 SVG）；没加载时退化为空，不再出现任何字符图标 */
    const I = (name, opts) => { try { const L = window.LonShaIcons; return L ? L.svg(name, opts) : ''; } catch (_) { return ''; } };

    const VERSION = '1.2.0';
    const LS_KEYS = {
        enabled: 'lonsha.ui.dashboard',   // 'off' 关闭外壳
        theme: 'lonsha.ui.theme',         // 'auto' | 'light' | 'dark'
        themeSource: 'lonsha.ui.themeSource', // 'brand' | 'st'
        dev: 'lonsha.ui.devMode',         // '1' 开启开发者模式
        fab: 'lonsha.ui.fabTarget',       // 'dashboard'（默认）| 'home'
        view: 'lonsha.ui.lastView',
    };
    const LEGACY_STYLE_MARKER = 'LonSha 设置面板 · 精密档案室微质感';
    const OVERLAY_ID = 'lonsha-settings-overlay';
    const PROFILES = [
        { id: 'balanced', label: '平衡', hint: '推荐' },
        { id: 'quality', label: '细致', hint: '记得更多' },
        { id: 'low-cost', label: '省流', hint: '更少调用' },
    ];

    const store = {
        get(k, d) { try { const v = window.localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } },
        set(k, v) { try { window.localStorage.setItem(k, String(v)); } catch (_) { /* 隐私模式忽略 */ } },
    };
    const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const warn = (tag, e) => { try { (window.LonShaMemory?.reportError || console.warn)(e, 'dashboard-shell.' + tag); } catch (_) { /* 忽略 */ } };

    // ------------------------------------------------------------------
    // 主题
    // ------------------------------------------------------------------
    function parseRgb(str) {
        const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/.exec(String(str || ''));
        if (!m) return null;
        return { r: +m[1], g: +m[2], b: +m[3], a: m[4] == null ? 1 : +m[4] };
    }
    function relLum({ r, g, b }) {
        const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    }
    /** 读取 SillyTavern 主题明暗：优先 --SmartThemeBlurTintColor，其次 body 背景，最后系统偏好 */
    function detectHostScheme() {
        try {
            const root = getComputedStyle(document.documentElement);
            const probe = document.createElement('span');
            probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;color:var(--SmartThemeBlurTintColor, transparent)';
            document.body.appendChild(probe);
            const tint = parseRgb(getComputedStyle(probe).color);
            probe.remove();
            if (tint && tint.a > 0.05) return relLum(tint) < 0.35 ? 'dark' : 'light';
            const bg = parseRgb(getComputedStyle(document.body).backgroundColor);
            if (bg && bg.a > 0.05) return relLum(bg) < 0.35 ? 'dark' : 'light';
            void root;
        } catch (e) { warn('detect-scheme', e); }
        return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    function applyTheme() {
        const pref = store.get(LS_KEYS.theme, 'auto');
        const resolved = pref === 'light' || pref === 'dark' ? pref : detectHostScheme();
        const html = document.documentElement;
        html.setAttribute('data-lonsha-theme', resolved);
        html.setAttribute('data-lonsha-theme-pref', pref);
        if (store.get(LS_KEYS.themeSource, 'brand') === 'st') html.setAttribute('data-lonsha-theme-source', 'st');
        else rmAttr(html, 'data-lonsha-theme-source');
        return resolved;
    }
    function setTheme(pref) {
        store.set(LS_KEYS.theme, ['light', 'dark', 'auto'].includes(pref) ? pref : 'auto');
        return applyTheme();
    }

    // ------------------------------------------------------------------
    // 旧内联样式下线（只在 dashboard.css 确实已加载时才做，避免面板失去样式）
    // ------------------------------------------------------------------
    function cssReady() {
        try { return getComputedStyle(document.documentElement).getPropertyValue('--ls-dash-css').trim() === '1'; }
        catch (_) { return false; }
    }
    /* 属性删除守卫：判据里用假 DOM（没有 removeAttribute），裸调会把整个外壳拖崩。
     * 外壳是「可选增强」—— 它炸掉不该让面板一起不可用，所以这里一律吞掉并继续。 */
    const rmAttr = (el, key) => { try { if (el && typeof el.removeAttribute === 'function') el.removeAttribute(key); } catch (_e) { /* 假 DOM */ } };

    /* 外壳能力探针：把「同伴模块在不在场」写成一份读数（overlay.dataset.lsDashCaps）。
     * 只在装配点汇总一次，避免每个模块各自探测、各自判断降级。 */
    function probeModules() {
        const v = (o) => (o && typeof o.version === 'string' ? o.version : '');
        return ['icons=' + v(window.LonShaIcons), 'v2=' + v(window.LonShaDashboardV2), 'dev=' + v(window.LonShaDevConsole)].join(';');
    }

    function neutralizeLegacyStyle() {
        if (!cssReady()) return false;
        let n = 0;
        document.querySelectorAll('style:not([data-ls-neutralized])').forEach((el) => {
            if ((el.textContent || '').indexOf(LEGACY_STYLE_MARKER) >= 0) {
                el.setAttribute('media', 'not all');
                el.setAttribute('data-ls-neutralized', VERSION);
                n++;
            }
        });
        return n > 0;
    }

    // ------------------------------------------------------------------
    // 数据读取（只读，全部容错；读不到 ≠ 0，用 null 区分）
    // ------------------------------------------------------------------
    function readState(plugin) {
        const s = plugin && plugin.engine;
        const cfg = (s && s.config && s.config.config) || {};
        const summaries = s && s.summary && Array.isArray(s.summary.summaries) ? s.summary.summaries : null;
        let suspense = null;
        try { suspense = s && s.suspense && typeof s.suspense.openItems === 'function' ? (s.suspense.openItems() || []) : null; } catch (e) { warn('suspense', e); }
        const chars = s && s.status && s.status.characters ? Object.keys(s.status.characters) : null;
        const running = cfg.enabled !== false && cfg.extractionEnabled !== false;
        const hasApi = cfg.apiProviderCustom === true ? !!(cfg.apiUrl && cfg.apiKey && cfg.apiModel) : true;
        return {
            cfg,
            running,
            hasApi,
            profile: cfg.extractionProfile || 'balanced',
            memoryCount: summaries ? summaries.length : null,
            recent: summaries ? summaries.slice(-4).reverse() : null,
            suspense,
            chars,
        };
    }

    // ------------------------------------------------------------------
    // 视图模板
    // ------------------------------------------------------------------
    const num = (v) => (v == null ? '—' : String(v));
    function heroHTML(st) {
        const state = !st.running ? 'off' : (st.hasApi ? 'ok' : 'warn');
        const title = state === 'ok' ? '自动记忆运行中' : (state === 'warn' ? '还差一步：填写专用接口' : '自动记忆已暂停');
        const sub = state === 'ok'
            ? '继续聊天就好，新的剧情会自动整理进记忆。'
            : (state === 'warn' ? '去「设置」填好接口地址、密钥和模型。' : '在「设置」里打开「启用记忆」和「自动记住新剧情」。');
        return `<div class="ls-hero" data-state="${state}" role="status">
                <span class="ls-hero-dot" aria-hidden="true"></span>
                <div><div class="ls-hero-title">${title}</div><div class="ls-hero-sub">${sub}</div></div>
            </div>`;
    }
    function profileSegHTML(st, name) {
        return `<div class="ls-seg" role="radiogroup" aria-label="记忆档位" data-dash-profiles="${name}">
            ${PROFILES.map(p => `<button type="button" class="ls-seg-btn" role="radio" data-dash-profile="${p.id}" aria-checked="${st.profile === p.id}" title="${esc(p.hint)}">${esc(p.label)}</button>`).join('')}
        </div>`;
    }
    function overviewHTML(st) {
        const recent = st.recent;
        const sus = st.suspense;
        const susN = sus ? sus.length : null;
        return `<section class="ls-dash-pane" id="ls-dash-overview" role="tabpanel" aria-labelledby="ls-dash-tab-overview" tabindex="0">
            <div class="ls-overview-grid">
                <div class="ls-card ls-card-wide">
                    ${heroHTML(st)}
                    <div class="ls-kpis">
                        <div class="ls-kpi"><div class="ls-kpi-v">${num(st.memoryCount)}</div><div class="ls-kpi-k">段剧情已记住</div></div>
                        <div class="ls-kpi"><div class="ls-kpi-v">${num(st.chars ? st.chars.length : null)}</div><div class="ls-kpi-k">位登场人物</div></div>
                        <div class="ls-kpi" data-tone="${susN ? 'warn' : 'ok'}"><div class="ls-kpi-v">${num(susN)}</div><div class="ls-kpi-k">条未完约定</div></div>
                    </div>
                </div>
                <div class="ls-card">
                    <div class="ls-card-head"><h3 class="ls-card-title">记忆档位</h3><span class="ls-badge" data-tone="muted">切换即保存</span></div>
                    ${profileSegHTML(st, 'overview')}
                    <div class="ls-card-head"><h3 class="ls-card-title">记忆健康</h3><button type="button" class="ls-card-link" data-dash-go="health">详情${I('chevron-right')}</button></div>
                    <div class="ls-meter" id="ls-dash-health-meter" data-tone="ok" role="meter" aria-label="记忆健康度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span style="width:0%"></span></div>
                    <p class="ls-hint" id="ls-dash-health-text">正在体检…</p>
                </div>
                <div class="ls-card">
                    <div class="ls-card-head"><h3 class="ls-card-title">最近记住的事</h3><button type="button" class="ls-card-link" data-dash-act="timeline">时间线${I('chevron-right')}</button></div>
                    ${recent == null
                        ? '<div class="ls-empty" data-kind="error"><span class="ls-empty-ico" aria-hidden="true">' + I('warning') + '</span>暂时读不到记忆数据，重开面板试试。</div>'
                        : (recent.length === 0
                            ? '<div class="ls-empty"><span class="ls-empty-ico" aria-hidden="true">' + I('sparkles') + '</span>还没有记录。继续聊天，这里会自动写下发生过的事。</div>'
                            : `<ul class="ls-list">${recent.map(m => {
                                const text = String(m.text || m.summary || '');
                                return `<li class="ls-list-item"><div class="ls-list-main"><div class="ls-list-text">${esc(text.slice(0, 80))}${text.length > 80 ? '…' : ''}</div><div class="ls-list-meta">第 ${esc(m.floor ?? '?')} 楼</div></div></li>`;
                            }).join('')}</ul>`)}
                </div>
                ${susN ? `<div class="ls-card ls-card-wide">
                    <div class="ls-card-head"><h3 class="ls-card-title">未完的约定与悬念</h3><button type="button" class="ls-card-link" data-dash-act="suspense">全部 ${susN} 条${I('chevron-right')}</button></div>
                    <ul class="ls-list">${sus.slice(0, 3).map(it => `<li class="ls-list-item"><span class="ls-badge" data-tone="warn">约定</span><div class="ls-list-main"><div class="ls-list-text">${esc(it.title || it.text || '')}</div><div class="ls-list-meta">${it.floor ? '第 ' + esc(it.floor) + ' 楼起' : '进行中'}</div></div></li>`).join('')}</ul>
                </div>` : ''}
            </div>
        </section>`;
    }
    function memoryHTML(st, plugin) {
        const has = (fn) => typeof plugin[fn] === 'function';
        const viz = ['showVisualizer', 'openVisualizer', 'showVisualPanel', 'showMemoryVisual'].find(has);
        const tiles = [
            has('showStatsPanel') && { act: 'overview', ico: 'book', t: '记忆总览', s: '所有档案一览' },
            has('showBrowser') && { act: 'timeline', ico: 'clock', t: '故事时间线', s: '按楼层回看' },
            has('showBrowser') && { act: 'people', ico: 'people', t: '人物', s: st.chars ? `${st.chars.length} 位登场` : '登场人物档案' },
            has('showBrowser') && { act: 'suspense', ico: 'flag', t: '约定与悬念', s: st.suspense ? `${st.suspense.length} 条未完` : '未兑现的承诺' },
            viz && { act: 'viz', ico: 'graph', t: '关系图', s: '谁和谁有关', fn: viz },
            has('showCheckpoints') && { act: 'ckpt', ico: 'bookmark', t: '检查点', s: '先存一份再动手' },
            has('showCorrectionPanel') && { act: 'correct', ico: 'pencil', t: '纠正记忆', s: '记错了就改' },
        ].filter(Boolean);
        const chars = st.chars || [];
        return `<section class="ls-dash-pane" id="ls-dash-memory" role="tabpanel" aria-labelledby="ls-dash-tab-memory" tabindex="0">
            <div class="ls-tiles">
                ${tiles.map(x => `<button type="button" class="ls-tile" data-dash-act="${x.act}"${x.fn ? ` data-dash-fn="${x.fn}"` : ''}><span class="ls-tile-ico" aria-hidden="true" data-ico="${x.ico}">${I(x.ico)}</span><span class="ls-tile-title">${x.t}</span><span class="ls-tile-sub">${esc(x.s)}</span></button>`).join('')}
            </div>
            <div class="ls-card u-mt-3">
                <div class="ls-card-head"><h3 class="ls-card-title">这里的人</h3>${chars.length ? `<button type="button" class="ls-card-link" data-dash-act="people">全部${I('chevron-right')}</button>` : ''}</div>
                ${chars.length
                    ? `<div class="ls-chips">${chars.slice(0, 12).map(n => `<button type="button" class="ls-home-chip" data-dash-act="people">${esc(n)}</button>`).join('')}</div>`
                    : '<div class="ls-empty"><span class="ls-empty-ico" aria-hidden="true">' + I('person') + '</span>人物出现后会自动建档。</div>'}
            </div>
        </section>`;
    }
    function settingsExtraHTML(dev) {
        const pref = store.get(LS_KEYS.theme, 'auto');
        const src = store.get(LS_KEYS.themeSource, 'brand');
        return `<div class="ls-dash-settings-extra">
            <div class="ls-group">
                <div class="ls-group-title">外观</div>
                <div class="ls-seg" role="radiogroup" aria-label="主题">
                    ${[['auto', '跟随酒馆'], ['light', '浅色'], ['dark', '深色']].map(([v, l]) => `<button type="button" class="ls-seg-btn" role="radio" data-dash-theme="${v}" aria-checked="${pref === v}">${l}</button>`).join('')}
                </div>
                <label class="ls-row ls-switch"><span class="ls-switch-text"><span class="ls-switch-title">配色跟随酒馆主题</span><br><span class="ls-switch-sub">面板底色和文字色取自当前 SillyTavern 主题</span></span><input type="checkbox" data-dash-themesrc ${src === 'st' ? 'checked' : ''}></label>
            </div>
            <div class="ls-group">
                <div class="ls-group-title">进阶</div>
                <label class="ls-row ls-switch"><span class="ls-switch-text"><span class="ls-switch-title">开发者模式</span><br><span class="ls-switch-sub">显示检索、实验室、体检详情等调参页</span></span><input type="checkbox" data-dash-dev ${dev ? 'checked' : ''}></label>
            </div>
        </div>`;
    }
    /* v1.2：宿主面板（settings-ui.js）的「界面骨架」文字里常带字符图标（页签、标题、按钮）。
       只清理骨架元素的前导 / 独立字符图标，绝不碰记忆正文与用户输入；页签按 data-tab 换成 SVG。
       正则全部用 \u 转义书写，本文件不含任何字符图标本身。 */
    const GLYPH_RE = /[\u{1F000}-\u{1FAFF}\u{2190}-\u{21FF}\u{2300}-\u{23FF}\u{25A0}-\u{25FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}\u{20E3}]+\s*/gu;
    const TAB_ICONS = { general: 'sparkles', narrative: 'book', health: 'heart-pulse', retrieval: 'archive', advanced: 'wand' };
    const CHROME = '.ls-tab-btn, .lonsha-sheet-header > span, .lonsha-sheet-close, .ls-btn, .ls-section-title, .ls-group-title, .ls-card-title, .ls-health-more > summary, .ls-switch-title';
    function scrubChromeGlyphs(root) {
        if (!root || !root.querySelectorAll) return 0;
        let n = 0;
        root.querySelectorAll(CHROME).forEach((el) => {
            if (el.closest('.ls-dash-title') || el.dataset.lsScrubbed) return;
            const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            const texts = [];
            while (walker.nextNode()) texts.push(walker.currentNode);
            let hit = false;
            texts.forEach((t) => { const v = t.nodeValue, nv = v.replace(GLYPH_RE, ''); if (nv !== v) { t.nodeValue = nv; hit = true; n++; } });
            if (!hit) return;
            el.dataset.lsScrubbed = '1';
            const ico = el.classList.contains('lonsha-sheet-close') ? 'xmark'
                : (el.id === 'ls-diag-back' ? 'chevron-left' : (el.id === 'ls-diag-entry' ? 'wand' : TAB_ICONS[el.dataset.tab]));
            if (ico) el.insertAdjacentHTML('afterbegin', I(ico));
        });
        return n;
    }

    function navHTML() {
        const tabs = [['overview', 'rings', '概览'], ['memory', 'brain', '记忆'], ['settings', 'gear', '设置'], ['dev', 'cmd', '开发者']];
        return `<div class="ls-dash-nav" role="tablist" aria-label="记忆引擎" aria-orientation="horizontal">
            ${tabs.map(([id, ico, label]) => `<button type="button" class="ls-dash-tab" role="tab" id="ls-dash-tab-${id}" data-dash-tab="${id}" aria-selected="false" tabindex="-1" aria-controls="${id === 'settings' || id === 'dev' ? 'ls-dash-legacy' : 'ls-dash-' + id}"><span class="ls-dash-tab-ico" aria-hidden="true">${I(ico)}${I(ico, { fill: true, className: 'lt-icon lt-icon-on' })}</span><span class="ls-dash-tab-label">${label}</span></button>`).join('')}
        </div>`;
    }

    // ------------------------------------------------------------------
    // 包装
    // ------------------------------------------------------------------
    let pendingView = null;

    function enhance(overlay, plugin, diag) {
        if (!overlay || overlay.dataset.lsDash === '1') return null;
        const sheet = overlay.querySelector('.lonsha-sheet');
        const body = overlay.querySelector('.lonsha-sheet-body');
        if (!sheet || !body) return null;
        neutralizeLegacyStyle();
        overlay.dataset.lsDash = '1';
        overlay.dataset.lsDashCaps = probeModules();
        sheet.classList.add('ls-dash-sheet');
        const head = overlay.querySelector('.lonsha-sheet-header > span');
        if (head) { head.textContent = ''; head.classList.add('ls-dash-title'); head.insertAdjacentHTML('afterbegin', `<span class="ls-dash-title-ico" aria-hidden="true">${I('brain', { fill: true })}</span><span class="ls-dash-title-text">${diag ? '记忆引擎 · 开发者' : '记忆引擎'}</span>`); }
        scrubChromeGlyphs(overlay);

        /* 默认开（默认值 '0' -> '1'）：做完了却默认关着，用户永远不知道有这一层。
         * 显式关过仍尊重（存 '0' 即关），只是「没存过」时算开。 */
        let dev = diag || store.get(LS_KEYS.dev, '1') === '1';
        const st = readState(plugin);

        // 1. 原 body 内容整体搬入 .ls-dash-legacy（节点搬家，监听器与 id 不变）
        const legacy = document.createElement('div');
        legacy.className = 'ls-dash-legacy';
        legacy.id = 'ls-dash-legacy';
        legacy.setAttribute('role', 'tabpanel');
        while (body.firstChild) legacy.appendChild(body.firstChild);
        legacy.insertAdjacentHTML('afterbegin', '<div class="ls-dash-devnote" role="note"><span aria-hidden="true">' + I('cmd') + '</span><span>开发者模式：以下是引擎的全部原始页签与调参项。普通游玩不需要改动这里。</span></div>');
        legacy.insertAdjacentHTML('beforeend', settingsExtraHTML(dev));

        // 2. 外壳
        const dash = document.createElement('div');
        dash.className = 'ls-dash';
        dash.dataset.dev = dev ? '1' : '0';
        dash.innerHTML = navHTML() + '<div class="ls-dash-main">' + overviewHTML(st) + memoryHTML(st, plugin) + '</div>';
        dash.querySelector('.ls-dash-main').appendChild(legacy);
        body.appendChild(dash);

        const legacyTab = (name) => legacy.querySelector(`.ls-tab-btn[data-tab="${name}"]`);

        // 3. 视图切换
        const setView = (view, focus) => {
            if (view === 'dev' && !dev) view = 'overview';
            if (view === 'settings' && diag) {   // 诊断构建里没有 general 面：回到常规构建再打开设置
                reopen(plugin, overlay, 'settings', false);
                return;
            }
            dash.dataset.view = view;
            store.set(LS_KEYS.view, view);
            dash.querySelectorAll('.ls-dash-tab').forEach((b) => {
                const on = b.dataset.dashTab === view;
                b.setAttribute('aria-selected', on ? 'true' : 'false');
                b.tabIndex = on ? 0 : -1;
                if (on && focus) b.focus();
            });
            legacy.setAttribute('aria-labelledby', 'ls-dash-tab-' + (view === 'dev' ? 'dev' : 'settings'));
            if (view === 'settings') { const g = legacyTab('general'); if (g && g.getAttribute('aria-selected') !== 'true') g.click(); }
            body.scrollTop = 0;
            try { dash.dispatchEvent(new CustomEvent('ls-dash:view', { detail: { view } })); } catch (_) { /* 旧浏览器 */ }
        };
        dash.querySelectorAll('.ls-dash-tab').forEach((b) => b.addEventListener('click', () => setView(b.dataset.dashTab)));
        dash.querySelector('.ls-dash-nav').addEventListener('keydown', (e) => {
            const keys = ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'];
            if (!keys.includes(e.key)) return;
            const list = Array.from(dash.querySelectorAll('.ls-dash-tab')).filter(b => b.offsetParent !== null);
            let i = list.indexOf(document.activeElement);
            if (i < 0) return;
            e.preventDefault(); e.stopPropagation();   // 不让 sheet 骨架的通用页签处理器再处理一次
            if (e.key === 'Home') i = 0; else if (e.key === 'End') i = list.length - 1;
            else i = (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
            setView(list[i].dataset.dashTab, true);
        });

        // 4. 动作：先走原面板的关闭拦截（有未保存改动会弹确认条，不会丢数据）
        const go = (fn) => {
            if (typeof overlay._lsTryClose === 'function' && overlay._lsTryClose() === false) return;
            try { fn(); } catch (e) { warn('action', e); }
        };
        dash.addEventListener('click', (e) => {
            const el = e.target.closest('[data-dash-act],[data-dash-go],[data-dash-profile],[data-dash-theme]');
            if (!el || !dash.contains(el)) return;
            if (el.dataset.dashGo === 'health') {
                if (!dev) { setDev(true); }
                setView('dev');
                const h = legacyTab('health'); if (h) h.click();
                return;
            }
            if (el.dataset.dashProfile) { writeProfile(el.dataset.dashProfile); return; }
            if (el.dataset.dashTheme) {
                setTheme(el.dataset.dashTheme);
                dash.querySelectorAll('[data-dash-theme]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.dashTheme === el.dataset.dashTheme)));
                return;
            }
            const act = el.dataset.dashAct;
            const map = {
                overview: () => plugin.showStatsPanel(),
                timeline: () => plugin.showBrowser('timeline'),
                people: () => plugin.showBrowser('status'),
                suspense: () => plugin.showBrowser('suspense'),
                ckpt: () => plugin.showCheckpoints(),
                correct: () => plugin.showCorrectionPanel(),
                viz: () => plugin[el.dataset.dashFn](),
            };
            if (map[act]) go(map[act]);
        });

        // 5. 档位：优先代理点击原面板的档位按钮（复用它的保存与提示逻辑）
        const writeProfile = (id) => {
            const orig = legacy.querySelector(`#ls-mode-banner [data-profile="${id}"]`);
            if (orig) orig.click();
            else {
                try {
                    plugin.engine.config.config.extractionProfile = id;
                    plugin.engine.config.saveConfig();
                } catch (e) { warn('profile', e); return; }
            }
            dash.querySelectorAll('[data-dash-profile]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.dashProfile === id)));
        };

        // 6. 开发者模式开关 / 跟随 ST 配色
        const setDev = (on) => {
            dev = !!on;
            store.set(LS_KEYS.dev, dev ? '1' : '0');
            dash.dataset.dev = dev ? '1' : '0';
            const box = legacy.querySelector('[data-dash-dev]'); if (box) box.checked = dev;
            if (!dev && dash.dataset.view === 'dev') setView('settings');
        };
        legacy.querySelector('[data-dash-dev]')?.addEventListener('change', (e) => { e.stopPropagation(); setDev(e.target.checked); });
        legacy.querySelector('[data-dash-themesrc]')?.addEventListener('change', (e) => {
            e.stopPropagation();
            store.set(LS_KEYS.themeSource, e.target.checked ? 'st' : 'brand');
            applyTheme();
        });

        // 7. 健康度镜像：settings-ui 异步渲染健康卡，这里只读结果
        const mirrorHealth = () => {
            const grid = legacy.querySelector('#ls-health-grid');
            const meter = dash.querySelector('#ls-dash-health-meter');
            const text = dash.querySelector('#ls-dash-health-text');
            if (!meter || !text) return;
            if (!grid) { text.textContent = '打开开发者模式可查看体检详情。'; return; }
            const cards = Array.from(grid.querySelectorAll('.ls-health-card'));
            const measured = cards.filter(c => ['ok', 'warn', 'crit'].includes(c.dataset.face));
            if (!measured.length) { text.textContent = '还没有足够的数据，多聊几轮再来看。'; return; }
            const warnN = measured.filter(c => c.dataset.face === 'warn').length;
            const critN = measured.filter(c => c.dataset.face === 'crit').length;
            const pct = Math.round(((measured.length - warnN * 0.5 - critN) / measured.length) * 100);
            meter.dataset.tone = critN ? 'crit' : (warnN ? 'warn' : 'ok');
            meter.setAttribute('aria-valuenow', String(pct));
            meter.firstElementChild.style.width = Math.max(4, pct) + '%';
            text.textContent = critN ? `有 ${critN} 项需要处理，点「详情」看看。`
                : (warnN ? `整体正常，有 ${warnN} 项值得留意。` : '一切正常。');
        };
        mirrorHealth();
        try {
            const hg = legacy.querySelector('#ls-health-grid');
            if (hg) { const mo = new MutationObserver(mirrorHealth); mo.observe(hg, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-face'] }); overlay._lsDashHealthMO = mo; }
        } catch (e) { warn('health-mo', e); }

        // 8. 初始视图
        const initial = pendingView || (diag ? 'dev' : store.get(LS_KEYS.view, 'overview'));
        pendingView = null;
        setView(initial === 'dev' && !dev ? 'overview' : initial);

        // 9. v1.1：通知扩展（ui/dashboard-v2.js 等）。只给只读快照与两个回调，不暴露内部可变状态
        try {
            window.dispatchEvent(new CustomEvent('lonsha:dashboard-enhanced', {
                detail: { dash, overlay, legacy, plugin, state: st, diag, setView: (v) => setView(v), refreshHealth: mirrorHealth, isDev: () => dev },
            }));
        } catch (e) { warn('ext-event', e); }
        return dash;
    }

    function reopen(plugin, overlay, view, diag) {
        if (typeof overlay._lsTryClose === 'function' && overlay._lsTryClose() === false) return;
        pendingView = view;
        plugin.showSettingsPanel(diag === true);
    }

    // ------------------------------------------------------------------
    // 挂载
    // ------------------------------------------------------------------
    const mount = () => {
        const plugin = window.LonShaMemory;
        if (!plugin || typeof plugin.showSettingsPanel !== 'function') { setTimeout(mount, 250); return; }
        if (plugin.__lsDashShell) return;
        plugin.__lsDashShell = VERSION;

        applyTheme();
        try {
            const mq = window.matchMedia('(prefers-color-scheme: dark)');
            (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => applyTheme());
        } catch (_) { /* 旧浏览器 */ }
        // ST 切换主题时会改写 <body> 或 :root 的 style / class
        try {
            const mo = new MutationObserver(() => { if (store.get(LS_KEYS.theme, 'auto') === 'auto') applyTheme(); });
            mo.observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });
            mo.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] });
        } catch (_) { /* 非致命 */ }

        neutralizeLegacyStyle();
        if (store.get(LS_KEYS.enabled, 'on') === 'off') return;

        const original = plugin.showSettingsPanel;
        const wrapped = function () {
            const ret = original.apply(this, arguments);
            try { enhance(document.getElementById(OVERLAY_ID), plugin, arguments[0] === true); }
            catch (e) { warn('enhance', e); }   // 包装失败 = 旧面板原样可用
            return ret;
        };
        wrapped.__lsOriginal = original;
        plugin.showSettingsPanel = wrapped;

        // FAB 默认直达 Dashboard 概览；localStorage 'lonsha.ui.fabTarget' = 'home' 可恢复旧主页
        if (typeof plugin.showFabMenu === 'function' && store.get(LS_KEYS.fab, 'dashboard') === 'dashboard') {
            const originalFab = plugin.showFabMenu;
            plugin.showFabMenu = function () { pendingView = 'overview'; return plugin.showSettingsPanel(); };
            plugin.showFabMenu.__lsOriginal = originalFab;
        }
    };

    window.LonShaDashboardShell = {
        version: VERSION,
        scrubGlyphs: scrubChromeGlyphs,
        setTheme,
        getTheme: () => store.get(LS_KEYS.theme, 'auto'),
        applyTheme,
        setDevMode: (on) => store.set(LS_KEYS.dev, on ? '1' : '0'),
        isDevMode: () => store.get(LS_KEYS.dev, '1') === '1',   // 默认开，见上
        open: (view) => { pendingView = view || 'overview'; window.LonShaMemory?.showSettingsPanel(); },
        enhance: (overlay, diag) => enhance(overlay, window.LonShaMemory, diag === true),
        neutralizeLegacyStyle,
        probeModules,
        /* 外壳的 localStorage 取数口：dashboard-v2 复用它，避免第二份同 md5 的 store 副本 */
        _store: store,
        _internals: { detectHostScheme, readState, relLum, parseRgb },
    };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
})();
