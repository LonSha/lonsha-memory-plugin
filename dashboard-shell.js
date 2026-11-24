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
    /* 执行探针：证明本文件确实被浏览器执行过（对照 lonsha_boot_settings）。 */
    try { window.localStorage.setItem('lonsha_boot_dash1', String(Date.now())); } catch (_e) { /* 忽略 */ }
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
        homeTarget: 'lonsha.ui.homeTarget',   // 'dashboard'（默认）| 'home'（回落旧主页）
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
    /* 强调色真源在 dashboard-v2.js 的 ACCENTS；这里只放一份同值名单，
       用途是给设置页 schema 生成选项（真源写值、这里只写标签）。 */
    const ACCENT_KEYS = ['ice', 'iris', 'rose', 'jade', 'amber', 'graphite'];
    const ACCENT_LABELS = { ice: '冰蓝', iris: '鸢尾', rose: '蔷薇', jade: '青玉', amber: '琥珀', graphite: '石墨' };

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
            <div class="ls-group">
                <div class="ls-group-title">外观细则</div>
                <button type="button" class="ls-btn" data-ls-open-appearance>打开外观设置面板</button>
                <div class="ls-switch-sub">声明式设置页（ui-settings-panel.js 渲染，lonsha-settings.css 提供视觉）：视觉层 v2 / v3、强调色、开发者模式、外壳总开关。改完重新打开面板即生效。</div>
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
            ${tabs.map(([id, ico, label]) => `<button type="button" class="ls-dash-tab" role="tab" id="ls-dash-tab-${id}" data-dash-tab="${id}" aria-selected="false" tabindex="-1" aria-controls="${id === 'settings' || id === 'dev' ? 'ls-dash-legacy' : 'ls-dash-' + id}"><span class="ls-dash-tab-ico" aria-hidden="true">${I(ico, { fill: true }) || I(ico)}</span><span class="ls-dash-tab-label">${label}</span></button>`).join('')}
        </div>`;
    }

    // ------------------------------------------------------------------
    // 包装
    // ------------------------------------------------------------------
    let pendingView = null;

    /* 接管失败必须是看得见的：修前这里只 console.warn，用户在真机上只能得到
       「和以前一样」，而排查者拿不到任何信号。 */
    function showEnhanceError(overlay, err, stage) {
        try {
            if (!overlay || !overlay.insertAdjacentHTML) return;
            const msg = (err && (err.message || err)) || '未知错误';
            overlay.insertAdjacentHTML('afterbegin',
                '<div class="ls-dash-devnote" role="note" data-ls-enhance-error="1" style="border-left:3px solid #c0392b">'
                + '<span>外壳接管失败（' + esc(String(stage || '')) + '）：' + esc(String(msg).slice(0, 180)) + '</span></div>');
        } catch (_e) { /* 提示失败也不能再抛 */ }
    }

    function enhance(overlay, plugin, diag) {
        if (!overlay || overlay.dataset.lsDash === '1') return null;
        const sheet = overlay.querySelector('.lonsha-sheet');
        const body = overlay.querySelector('.lonsha-sheet-body');
        if (!sheet || !body) return null;
        neutralizeLegacyStyle();
        overlay.dataset.lsDash = '1';
        /* 读数探针失败不许把整个接管拖崩（修前：这里抛错会带着 lsDash='1' 一起留下，
           面板从此再也接管不了，而用户只看到「和以前一样」）。 */
        try { overlay.dataset.lsDashCaps = probeModules(); } catch (_e) { overlay.dataset.lsDashCaps = 'probe-failed'; }
        sheet.classList.add('ls-dash-sheet');
        try { overlay.querySelectorAll('[data-ls-shell-mark]').forEach((n) => n.remove()); } catch (_e) { /* 记号清理失败无妨 */ }
        const head = overlay.querySelector('.lonsha-sheet-header > span');
        if (head) {
            head.textContent = '';
            head.classList.add('ls-dash-title');
            /* 题首两行：主题 + 一句用途（world-axis 顶栏同款）。副标题只在正常面出现，
               开发者面已经有 ‹ 返回 与门禁读数，再塞一句话只会挤掉标题。 */
            const sub = diag ? '' : '<span class="ls-dash-title-sub">你聊过的，它自己整理好了</span>';
            head.insertAdjacentHTML('afterbegin', `<span class="ls-dash-title-ico" aria-hidden="true">${I('brain', { fill: true })}</span><span class="ls-dash-title-text">${diag ? '记忆引擎 · 开发者' : '记忆引擎'}</span>${sub}`);
        }
        scrubChromeGlyphs(overlay);

        /* 默认开（默认值 '0' -> '1'）：做完了却默认关着，用户永远不知道有这一层。
         * 显式关过仍尊重（存 '0' 即关），只是「没存过」时算开。 */
        let dev = diag || store.get(LS_KEYS.dev, '0') === '1';
        const st = readState(plugin);

        // 1. 原 body 内容整体搬入 .ls-dash-legacy（节点搬家，监听器与 id 不变）
        const legacy = document.createElement('div');
        legacy.className = 'ls-dash-legacy';
        legacy.id = 'ls-dash-legacy';
        legacy.setAttribute('role', 'tabpanel');
        while (body.firstChild) legacy.appendChild(body.firstChild);
        legacy.insertAdjacentHTML('afterbegin', '<div class="ls-dash-devnote" role="note"><span aria-hidden="true">' + I('cmd') + '</span><span>开发者模式：以下是引擎的全部原始页签与调参项。普通游玩不需要改动这里。</span></div>');
        /* 外观闸读数：把决定「看起来像不像新 UI」的四道闸印在面板上。
         *   每一道都曾默认关着、且没有任何界面提示 —— 用户只能觉得「做了没效果」。
         *   现在一眼可见：v2 / v3 / dev 是否开、v2 的 CSS 探针是否就绪。 */
        try {
            const gateOn = (k) => (store.get(k, '1') === '1' ? '开' : '关');
            const iconVer = (window.LonShaIcons && window.LonShaIcons.version) || '未加载';
            /* 两个探针是两个变量：主 CSS 看 --ls-dash-css，v2 看 --ls-dash-v2-css。 */
            const v2CssReady = () => {
                try { return getComputedStyle(document.documentElement)
                    .getPropertyValue('--ls-dash-v2-css').trim() === '1'; }
                catch (_e) { return false; }
            };
            const gateLine = '外观闸：v2=' + gateOn('lonsha.ui.v2')
                + ' · v3=' + gateOn('lonsha.ui.v3')
                + ' · dev=' + (dev ? '开' : '关')
                + ' · 主CSS=' + (cssReady() ? '就绪' : '未就绪')
                + ' · v2CSS=' + (v2CssReady() ? '就绪' : '未就绪')
                + ' · 图标=' + iconVer;
            legacy.insertAdjacentHTML('afterbegin',
                '<div class="ls-dash-devnote" role="note" data-ls-gates="1"><span>'
                + esc(gateLine) + '</span></div>');
        } catch (_e) { /* 读数失败不能影响面板 */ }
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

        /* 声明式设置页入口：ui-settings-panel.js 的第一个真实消费者。
           写的是真键（lonsha.ui.v2 / v3 / accent / devMode / dashboard），
           保存成功后才清脏值 —— 由 ui-settings-panel 的 pickSaveState 保证。 */
        legacy.querySelector('[data-ls-open-appearance]')?.addEventListener('click', (e) => {
            e.stopPropagation();
            const P = window.LonShaSettingsPanel;
            if (!P || typeof P.openSettingsPanel !== 'function') {
                warn('settings-panel', new Error('ui-settings-panel.js 未加载（manifest.extra_js 是否登记？）'));
                return;
            }
            const K = { v2: 'lonsha.ui.v2', v3: 'lonsha.ui.v3', accent: 'lonsha.ui.accent', enabled: LS_KEYS.enabled };
            const accentNow = (() => { const a = store.get(K.accent, 'ice'); return ACCENT_KEYS.indexOf(a) < 0 ? 'ice' : a; })();
            const res = P.openSettingsPanel({
                title: '外观设置',
                schema: {
                    title: '外观与开关',
                    sub: '由 ui-settings-panel.js 按 schema 渲染；值写入 lonsha.ui.*，与现网读取点同一份键',
                    version: '1',
                    groups: [
                        {
                            id: 'visual', title: '视觉层',
                            rows: [
                                { key: K.v2, label: 'v2 视觉层', kind: 'switch', default: true, desc: '新概览 / 记忆页骨架。关闭回落 v1 平铺版', effect: '重新打开面板后生效' },
                                { key: K.v3, label: 'v3 精修层', kind: 'switch', default: true, desc: 'iOS 字阶 / 玻璃 / 更密的分组（需 v2 已开）', effect: '重新打开面板后生效' },
                                { key: K.accent, label: '强调色', kind: 'select', default: 'ice', options: ACCENT_KEYS.map((k) => ({ value: k, label: ACCENT_LABELS[k] })), effect: '立即生效' },
                            ],
                        },
                        {
                            id: 'switches', title: '开关',
                            rows: [
                                { key: LS_KEYS.dev, label: '开发者模式', kind: 'switch', default: true, desc: '显示检索、实验室、体检详情等调参页' },
                                { key: K.enabled, label: '面板外壳', kind: 'seg', default: 'on', options: [{ value: 'on', label: '开' }, { value: 'off', label: '关' }], desc: '关闭后不再接管设置面板', effect: '重新打开面板后生效' },
                            ],
                        },
                    ],
                },
                values: {
                    [K.v2]: store.get(K.v2, '1') === '1',
                    [K.v3]: store.get(K.v3, '1') === '1',
                    [K.accent]: accentNow,
                    [LS_KEYS.dev]: dev,
                    [K.enabled]: store.get(K.enabled, 'on') === 'off' ? 'off' : 'on',
                },
                write: (patch) => new Promise((resolve, reject) => {
                    try {
                        const has = (k) => Object.prototype.hasOwnProperty.call(patch, k);
                        if (has(K.v2)) store.set(K.v2, patch[K.v2] ? '1' : '0');
                        if (has(K.v3)) store.set(K.v3, patch[K.v3] ? '1' : '0');
                        if (has(K.accent)) store.set(K.accent, String(patch[K.accent]));
                        if (has(LS_KEYS.dev)) setDev(!!patch[LS_KEYS.dev]);
                        if (has(K.enabled)) store.set(K.enabled, patch[K.enabled] === 'off' ? 'off' : 'on');
                        const V2 = window.LonShaDashboardV2;   // 已开着的面板即时跟随
                        if (V2) {
                            if (typeof V2.enable === 'function') V2.enable(store.get(K.v2, '1') === '1');
                            if (typeof V2.enableV3 === 'function') V2.enableV3(store.get(K.v3, '1') === '1');
                            if (typeof V2.setAccent === 'function') V2.setAccent(store.get(K.accent, 'ice'));
                        }
                        resolve();
                    } catch (err) { reject(err); }
                }),
            });
            if (!res || !res.ok) warn('settings-panel', new Error((res && (res.reason || res.error)) || '设置页渲染失败'));
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
    /* 挂载自诊断：真机上「脚本加载了但界面没变」曾经零痕迹。
       这里把每个阶段与失败原因都写进 localStorage，排查时可读、可复算。 */
    const diagWrite = (stage, err) => {
        try {
            window.localStorage.setItem('lonsha_shell_diag', JSON.stringify({
                v: VERSION, stage: String(stage || ''),
                err: err ? String((err && (err.message || err)) || err).slice(0, 300) : '',
                at: Date.now(),
            }));
        } catch (_e) { /* 写不进也不影响主流程 */ }
    };

    const mount = () => {
        const plugin = window.LonShaMemory;
        if (!plugin || typeof plugin.showSettingsPanel !== 'function') {
            diagWrite('wait-plugin', 'plugin=' + (!!plugin) + ' showSettingsPanel=' + (plugin && typeof plugin.showSettingsPanel));
            setTimeout(mount, 250); return;
        }
        if (plugin.__lsDashShell) { diagWrite('already-mounted', plugin.__lsDashShell); return; }
        try {
            diagWrite('mount-enter');
            mountInner(plugin);
            plugin.__lsDashShell = VERSION;   // 只有装配真的走完才落这个标记
            diagWrite('mounted');
        } catch (e) {
            warn('mount', e);
            diagWrite('mount-failed', e);
        }
    };

    function mountInner(plugin) {

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
        if (store.get(LS_KEYS.enabled, 'on') === 'off') { diagWrite('disabled-by-key', 'lonsha.ui.dashboard=off'); return; }

        const original = plugin.showSettingsPanel;
        const wrapped = function () {
            const diag = arguments[0] === true;
            /* 非开发者面一律交给新面板（v6，独立根 .lmp）。这一步放在包裹层内部，
               所以不管谁调用 showSettingsPanel，都不会再落到旧外壳上。 */
            if (!diag && window.LonShaPanel && typeof window.LonShaPanel.open === 'function') {
                try { window.LonShaPanel.open('overview'); return true; } catch (_e) { /* 失败再走旧路 */ }
            }
            const ret = original.apply(this, arguments);
            /* 宿主可能在 original 返回后才把面板挂进 DOM（异步渲染 / rAF），
               修前只试一次，撞上就是「外壳没接管」而毫无痕迹。改为有限重试。 */
            const attempt = (left) => {
                const ov = document.getElementById(OVERLAY_ID);
                if (!ov) {
                    if (left > 0) setTimeout(() => attempt(left - 1), 50);
                    return;
                }
                /* 自证记号：证明「这条路径确实执行了」。接管成功会被 enhance 一并搬走，
                   失败则留在原地面板上 —— 用户截一张图就能区分「没走这条路 / 走了但失败」。 */
                try {
                    if (!ov.querySelector('[data-ls-shell-mark]')) {
                        ov.insertAdjacentHTML('afterbegin',
                            '<div data-ls-shell-mark="1" class="ls-dash-devnote" role="note">'
                            + '<span>外壳 v' + esc(VERSION) + ' 已进入（尝试接管…）</span></div>');
                    }
                } catch (_e) { /* 记号失败不影响接管 */ }
                try {
                    const out = enhance(ov, plugin, diag);
                    if (!out && left > 0 && ov.dataset.lsDash !== '1') setTimeout(() => attempt(left - 1), 50);
                } catch (e) {
                    warn('enhance', e);
                    delete ov.dataset.lsDash;          // 允许重新尝试
                    showEnhanceError(ov, e, 'enhance');
                }
            };
            attempt(6);
            return ret;
        };
        wrapped.__lsOriginal = original;
        plugin.showSettingsPanel = wrapped;

        /* 日常入口同样接线：showPlayerHome 生成 #lonsha-home-overlay（标题「记忆」），
           这是用户真正停留的那一屏。此前只包了 showSettingsPanel，所以新外壳只在
           「设置」按钮后面，日常界面一点没变 —— 本处补上。存 'home' 可回落旧主页。 */
        if (typeof plugin.showPlayerHome === 'function') {
            const originalHome = plugin.showPlayerHome;
            const wrappedHome = function () {
                if (store.get(LS_KEYS.homeTarget, 'dashboard') === 'home') {
                    return originalHome.apply(this, arguments);
                }
                pendingView = 'overview';
                return plugin.showSettingsPanel();
            };
            /* 注意：这里直接走 plugin.showSettingsPanel（已是包裹版），
               因此增强与重试逻辑只有一份，不在两处维护。 */
            wrappedHome.__lsOriginal = originalHome;
            plugin.showPlayerHome = wrappedHome;
        }

        /* 覆盖「不是经过 plugin.showSettingsPanel」的创建路径（重新渲染、其它入口）。
           修前只包函数，一旦宿主自己重建面板，外壳就再也接不上，且毫无痕迹。 */
        try {
            if (typeof MutationObserver === 'function' && document.body) {
                const mo = new MutationObserver((muts) => {
                    for (const m of muts) {
                        for (const n of m.addedNodes) {
                            if (!n || n.nodeType !== 1) continue;
                            const cand = (n.id === OVERLAY_ID) ? n
                                : (n.querySelector ? n.querySelector('#' + OVERLAY_ID) : null);
                            if (!cand || cand.dataset.lsDash === '1') continue;
                            requestAnimationFrame(() => {
                                if (!cand.isConnected || cand.dataset.lsDash === '1') return;
                                try { enhance(cand, plugin, false); }
                                catch (e) {
                                    warn('enhance-mo', e);
                                    delete cand.dataset.lsDash;
                                    showEnhanceError(cand, e, 'observer');
                                }
                            });
                        }
                    }
                });
                mo.observe(document.body, { childList: true, subtree: true });
            }
        } catch (e) { warn('observer', e); }

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
        isDevMode: () => store.get(LS_KEYS.dev, '0') === '1',   // 默认开，见上
        open: (view) => { pendingView = view || 'overview'; window.LonShaMemory?.showSettingsPanel(); },
        enhance: (overlay, diag) => enhance(overlay, window.LonShaMemory, diag === true),
        neutralizeLegacyStyle,
        probeModules,
        /* 外壳的 localStorage 取数口：dashboard-v2 复用它，避免第二份同 md5 的 store 副本 */
        _store: store,
        _internals: { detectHostScheme, readState, relLum, parseRgb },
    };

    try { window.localStorage.setItem('lonsha_boot_dash2', String(Date.now())); } catch (_e) { /* 忽略 */ }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
    else mount();
})();

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
    /* 已内联进 dashboard-shell.js：不再依赖 manifest.extra_js 是否被请求。 */
    if (window.LonShaPanel) return;

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
        /* 值域取引擎真值：quality / balanced / low-cost。
           曾经这里写成 lite/balanced/deep —— 与引擎不符，读出来永远是「均衡」。 */
        const profileMap = { quality: '细致记录', balanced: '平衡', 'low-cost': '轻量省流' };
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
    /* segRow 已移除（v6.4）：档位改由 laneHowHTML 里的 <select> 承担。
       留着它会成为死代码 —— 本仓对「声明了但没人调」的零件有门禁。 */
    /* ==================================================================
       设置页（v6.4 重构）
       ------------------------------------------------------------------
       治的病（用户原话）：「点高级设置就返回概览，不然没地方输入那个 api」。

       根因不是按钮绑错，而是**v6 面板此前没有承载输入能力的零件**：
       doAct('advanced') 先 close2() 关掉本面板、再打去旧面板 —— 于是用户
       一进高级设置就被踢回概览。旧面板是当时唯一有 input 的地方。

       改法照抄 world-axis 的 lane（动线）模式：
         · 设置仍是**同一页**，用一条分组条切换分组，**不跳页、不关面板**；
         · 分组按「玩家会问的问题」分，不按子系统分；
         · 每页顶部一句 hint 说明「这一页回答什么」；
         · 输入控件就画在页内，改完即存（无保存按钮），与全仓一致。
       旧面板那条路仍然保留（作为「完整设置」的逃生口），但它不再是
       填 API 的唯一入口 —— 也不再把用户从面板里踢出去。

       顺手修掉的真实缺陷：本面板原先把档位写成 lite/balanced/deep，
       而引擎真实值域是 quality/balanced/low-cost（memory-config.js:370、
       gameplay-preset.js，engine-diagnostic-lines-part-a.js:1498）。
       写 lite/deep 进去 = 引擎读不到、静默回落到默认 —— 用户以为改了。
       ================================================================== */
    const LANES = [
        { id: 'conn', label: '接口', hint: '自动整理要用一个 AI 接口。不填也行，默认借用当前对话的接口（零配置）。' },
        { id: 'how', label: '怎么记', hint: '记多细、每次记多少。改这里就够了，不用动下面的。' },
        { id: 'more', label: '更多', hint: '向量检索、精排、完整设置。没配也能用，配了更准。' },
    ];
    let lane = 'conn';
    const PROFILE_OPTS = [
        ['quality', '细致记录', '每楼都抽，最贵'],
        ['balanced', '平衡', '每 3 楼攒批一次（推荐）'],
        ['low-cost', '轻量省流', '每 5 楼攒批，只抽核心类型'],
    ];

    function lanesHTML() {
        return `<div class="lmp-lanes" role="tablist" aria-label="设置分组">
            ${LANES.map((l) => `<button type="button" role="tab" class="lmp-lane" data-lane="${l.id}" aria-selected="${lane === l.id}">${l.label}</button>`).join('')}
        </div>`;
    }
    const laneHintHTML = () => {
        const cur = LANES.find((l) => l.id === lane) || LANES[0];
        return `<p class="lmp-lane-hint">${cur.hint}</p>`;
    };

    /* 一行字段：左标签右控件。
       注意这里用 <div> 而不是 <label>：右侧控件有时本身就是一个 <label>
       （开关），label 嵌 label 是无效 HTML，点击行为在各浏览器上不一致。 */
    function frow(k, sub, ctrl) {
        return `<div class="lmp-frow"><span class="lmp-frow-k">${k}${sub ? `<em>${sub}</em>` : ''}</span>${ctrl}</div>`;
    }
    const textIn = (key, ph, val) =>
        `<input class="lmp-input" type="text" data-cfg-text="${key}" placeholder="${esc(ph)}" value="${esc(val == null ? '' : val)}" autocomplete="off" spellcheck="false">`;
    const pwdIn = (key, ph, val) =>
        `<input class="lmp-input" type="password" data-cfg-text="${key}" placeholder="${esc(ph)}" value="${esc(val == null ? '' : val)}" autocomplete="off">`;
    const numIn = (key, val, min, max, step) =>
        `<input class="lmp-input" type="number" data-cfg-num="${key}" value="${esc(val == null ? '' : val)}" min="${min}" max="${max}" step="${step || 1}" inputmode="numeric">`;
    function selIn(key, opts, cur) {
        return `<select class="lmp-input" data-cfg-text="${key}">${opts.map(([v, l]) =>
            `<option value="${esc(v)}"${String(cur === v) === 'true' || (cur == null && v === '') ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    }

    /* ---------- 接口 ---------- */
    function laneConnHTML(c) {
        const custom = !!c.apiProviderCustom;
        return `${lanesHTML()}${laneHintHTML()}
            <div class="lmp-card">
                <span class="lmp-card-t">用哪个接口</span>
                <span class="lmp-card-s">默认跟着你当前对话走，不用配。想用别的（比如更便宜的模型）再打开下面这个开关。</span>
                ${frow('使用自己的接口', custom ? '已开启，填下面的地址与密钥' : '关着 = 借用当前对话的接口', `<label class="lmp-switch lmp-switch-inrow"><input type="checkbox" data-cfg="apiProviderCustom"${custom ? ' checked' : ''}><span class="lmp-track" aria-hidden="true"></span></label>`)}
            </div>
            <div class="lmp-card" data-conn-fields>
                <span class="lmp-card-t">地址与密钥</span>
                <span class="lmp-card-s">兼容 OpenAI 格式。地址填到 base 就行，会自动补 /chat/completions。<span data-conn-warn${custom ? ' hidden' : ''}>现在开关是关着的，填了也先不用；想用就打开上面那个开关。</span></span>
                ${textIn('apiUrl', 'https://api.xxx.com/v1', c.apiUrl)}
                ${pwdIn('apiKey', 'sk-…（只存在你自己的配置里）', c.apiKey)}
                <div class="lmp-inline">
                    ${textIn('apiModel', '模型名，如 gpt-4o-mini', c.apiModel)}
                    <button type="button" class="lmp-mini" data-act="fetch-models">抓取</button>
                </div>
                <p class="lmp-lane-hint" data-model-status></p>
            </div>`;
    }

    /* ---------- 怎么记 ---------- */
    function laneHowHTML(c) {
        const prof = c.extractionProfile || 'balanced';
        const profLabel = (PROFILE_OPTS.find((p) => p[0] === prof) || PROFILE_OPTS[1])[1];
        return `${lanesHTML()}${laneHintHTML()}
            <div class="lmp-group">
                ${frow('记忆档位', '只影响平淡楼的攒批频率', selIn('extractionProfile', PROFILE_OPTS.map((p) => [p[0], p[1] + '·' + p[2]]), prof))}
                ${frow('单条摘要长度', '超长会截断', numIn('maxSummaryLength', c.maxSummaryLength, 50, 2000, 10))}
                ${frow('召回条数', '每次回忆带几条进上下文', numIn('vectorTopK', c.vectorTopK, 1, 30, 1))}
            </div>
            <p class="lmp-note">当前档位：${esc(profLabel)}。身份、承诺、物品、关系、事件这五类关键信号，任何档位都当场抽，不会被攒批推到后面。</p>`;
    }

    /* ---------- 更多 ---------- */
    function laneMoreHTML(c) {
        return `${lanesHTML()}${laneHintHTML()}
            <div class="lmp-stack">
                <button type="button" class="lmp-row lmp-row-btn" data-act="embedding">
                    <span class="lmp-row-main">语义检索接口<em>不配也能用，配了按含义找回忆更准</em></span>
                    <span class="lmp-chev" aria-hidden="true">›</span>
                </button>
                <button type="button" class="lmp-row lmp-row-btn" data-act="rerank">
                    <span class="lmp-row-main">精排接口<em>召回后再排一次，适合记忆很多的时候</em></span>
                    <span class="lmp-chev" aria-hidden="true">›</span>
                </button>
                <button type="button" class="lmp-row lmp-row-btn" data-act="advanced">
                    <span class="lmp-row-main">完整设置<em>剩下的都在这里；会离开本面板，可随时按返回回来</em></span>
                    <span class="lmp-chev" aria-hidden="true">›</span>
                </button>
            </div>`;
    }

    function settingsHTML(st) {
        const c = cfg();
        const inner = lane === 'how' ? laneHowHTML(c) : (lane === 'more' ? laneMoreHTML(c) : laneConnHTML(c));
        return `<div class="lmp-view" data-view="settings">
            <div class="lmp-stack">
                ${switchRow('enabled', '启用记忆', '关掉就什么都不记了', st.enabled)}
                ${switchRow('extractionEnabled', '自动记住新剧情', '每轮聊完自己整理，不用你点', st.auto)}
            </div>
            ${inner}
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
        /* 每次**新开**面板都把分组条复位到第一组：lane 是模块级状态，
           不复位的话上次停在「更多」，这次进来还停在「更多」——
           用户点的是「设置」，看到的却不是接口页。 */
        lane = 'conn';
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
            /* 分组条：只切 lane，不跳页、不关面板 */
            const ln = e.target.closest('.lmp-lane');
            if (ln) { lane = ln.dataset.lane; render(); return; }
            /* .lmp-seg 的点击分支已移除（v6.4）：档位改用 select，页内已无分段控件。
               CSS 里的 .lmp-seg 规则保留 —— 它是通用件，别处可能需要。 */
            const act = e.target.closest('[data-act]');
            if (act) { doAct(act.dataset.act); }
        });
        root.addEventListener('change', (e) => {
            /* 下拉框（data-cfg-text 的 select）：即时存，不重建 body ——
               重建会把刚聚焦的控件摘掉，真机上表现为「选完弹回去」。 */
            const sel = e.target.closest('select[data-cfg-text]');
            if (sel) {
                const c = cfg();
                c[sel.dataset.cfgText] = sel.value;
                saveCfg();
                toast('已改：' + (sel.options[sel.selectedIndex] || {}).text);
                return;
            }
            const box = e.target.closest('input[data-cfg]');
            if (!box) return;
            const c = cfg();
            c[box.dataset.cfg] = !!box.checked;
            saveCfg();
            /* 打开 / 关掉「使用自己的接口」：地址栏**一直可见**（用户要能随时输入），
               只切换那句「现在没启用」的提示。用 DOM 显隐而不是重渲染：
               重渲染会让键盘收起、焦点丢失。 */
            if (box.dataset.cfg === 'apiProviderCustom') {
                const warn = root.querySelector('[data-conn-warn]');
                if (warn) warn.hidden = box.checked;
                const sub = box.closest('.lmp-frow')?.querySelector('.lmp-frow-k > em');
                if (sub) sub.textContent = box.checked ? '已开启，填下面的地址与密钥' : '关着 = 借用当前对话的接口';
            } else {
                render();
            }
            toast(box.checked ? '已打开' : '已关闭');
        });
        /* 文本 / 数字：失焦即存。不用 input 事件逐字存盘 —— 那会让每个按键
           都触发一次 saveConfig（真机上卡）。也不重建 body，原因同上。
           只在值**真的变了**才写盘并提示：点一下输入框又点走、或者点旁边的
           「抓取」按钮（会先触发失焦）都不该弹「已保存」。 */
        root.addEventListener('focusout', (e) => {
            const t = e.target.closest('[data-cfg-text], [data-cfg-num]');
            if (!t || t.tagName === 'SELECT') return;
            const c = cfg();
            let next;
            if (t.dataset.cfgNum) {
                const raw = parseFloat(t.value);
                /* NaN 不是合法配置：留空时 parseFloat 会给出 NaN，写进 config 会让
                   后续所有数值判据静默失效（NaN 与任何数比较都是 false）。
                   保留原值并跳过，不静默归零。 */
                if (!Number.isFinite(raw)) return;
                const step = parseFloat(t.step) || 1;
                next = Number.isInteger(step) ? Math.round(raw) : raw;
                if (c[t.dataset.cfgNum] === next) return;
                c[t.dataset.cfgNum] = next;
            } else {
                next = String(t.value || '').trim();
                if (String(c[t.dataset.cfgText] == null ? '' : c[t.dataset.cfgText]) === next) return;
                c[t.dataset.cfgText] = next;
            }
            saveCfg();
            toast('已保存');
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
            /* v6.4：抓取模型。此前这个按钮在旧面板里，新面板没入口。
               复用旧面板那套逻辑不划算（它要 overlay 里的一堆 id），
               这里就地按 OpenAI /models 取一次，只做一件事：读回列表填进输入框的候选。 */
            if (id === 'fetch-models') { return fetchModels(); }
            /* 语义检索 / 精排：旧面板里是 <details> 折叠段，没有独立出口可以调，
               所以这里给出可操作的就地结果 —— 而不是让用户点了个没反应的按钮。 */
            if (id === 'embedding' || id === 'rerank') {
                const st = root && root.querySelector('[data-model-status]');
                const which = id === 'embedding' ? '语义检索' : '精排';
                if (st) st.textContent = `${which}接口目前只在「完整设置」里可编辑（本页暂未搬过来）。点下面的「完整设置」即可。`;
                return toast(`${which}接口请在完整设置里改`);
            }
            if (id === 'advanced') {
                /* 「完整设置」= 明确的逃生出口：旧面板还在，剩下的几百项都在那儿。
                   它确实会离开本面板（旧面板是另一个 overlay，两层叠着没法看），
                   但这是用户**主动点的**，不是被系统踢走的。
                   真正修掉的是：填 API、改档位这些日常事已经在本页做完了，
                   没人**必须**走这条路。 */
                close2();
                return p.__lmpLegacySettings ? p.__lmpLegacySettings() : (p.showSettingsPanel && p.showSettingsPanel());
            }
        } catch (e) {
            try { (window.LonShaMemory.reportError || console.warn)(e, 'memory-panel.act.' + id); } catch (_e) { /* 忽略 */ }
        }
        return null;
    }

    /* ---------- 抓取模型列表（v6.4） ---------- */
    function fetchModels() {
        const c = cfg();
        const url = String(c.apiUrl || '').trim();
        const key = String(c.apiKey || '').trim();
        const st = root && root.querySelector('[data-model-status]');
        const say = (t) => { if (st) st.textContent = t; };
        if (!url || !key) { say('先把地址和密钥填上，再点抓取。'); return; }
        say('正在抓取…');
        const base = url.replace(/\/+$/, '');
        const endpoint = /\/v\d+$/.test(base) ? base + '/models' : base + '/v1/models';
        fetch(endpoint, { headers: { Authorization: 'Bearer ' + key } })
            .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
            .then((j) => {
                const list = (j && Array.isArray(j.data) ? j.data : []).map((m) => m && m.id).filter(Boolean);
                if (!list.length) { say('接口回了空列表，手填模型名也行。'); return; }
                const inp = root && root.querySelector('input[data-cfg-text="apiModel"]');
                if (inp) {
                    inp.value = list[0];
                    const cc = cfg();
                    cc.apiModel = list[0];
                    saveCfg();
                }
                say('抓到 ' + list.length + ' 个，已填第一个：' + list[0] + '（想要别的直接改文本框）');
            })
            .catch((e) => say('抓取失败（' + (e && e.message ? e.message : e) + '）。手填模型名一样能用。'));
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
