/**
 * v4-panel-ui.js — [V4] 六条机制的玩家面：书签坠 + 六格面板
 *
 * 【学自谁】柏宝书（ST-BaiBai-Book）的 `FloatingOrb.vue`（书签坠入口）、
 *   `NavBar.vue`（胶囊导航 / 窄屏只图标 / aria 齐备）、`SummaryNode.vue`（卡片 +
 *   底部整条展开开关 + 内容常驻 DOM 的平滑撑开）。本文件**不搬 Vue**：本仓 UI 是原生 JS，
 *   搬到的是三条形态纪律，不是三条源码：
 *     ① **形状即品牌**：入口不是「又一个圆形 fab」，是竖长书签（0.78 宽高比 + 底部燕尾缺口），
 *        任意自定义图也裁进同一轮廓 —— 这样它在宿主页面上「一眼是我们的」。
 *     ② **贴边半隐**：靠边时只露一窄条，hover/聚焦/触摸才整条滑出；停在中间则常显。
 *        这不只是好看：正文是玩家的主视野，常驻按钮会永久占一小块。
 *     ③ **展开不脱流**：卡片底部整条是开关（「展开下层 N 条」），内容**常驻 DOM**，
 *        用 grid-template-rows 0fr↔1fr 撑开 —— 不 display:none、不重建、不闪。
 *
 * 【要解决什么】
 *   v4.0 的六条机制以前只有诊断行（`V4 六条 4/6 · …`）能看见，那是给开发者看的。
 *   玩家需要回答的是三个具体问题：**「现在能不能补记忆」「为什么没补」「我的规则到底锁了什么」**。
 *   本面板只做这三件事，六个格子就是六条的回答，一格一行读数 + 一个可展的细节。
 *
 * 【数据从哪来】
 *   **只从 `LonShaV4PanelBridge.read(host)` 取**（唯一取数口径）。本文件不自己算任何机制读数 ——
 *   否则面板与诊断会说两套话（本仓反复治过的「同一事实两个真源」）。
 *
 * 【纪律】
 *   ① 零依赖、零构建：一个 IIFE，DOM 用原生 API，样式内联注入一次（幂等）。
 *   ② 不改引擎状态：只读 host，只写自己的 DOM 与 localStorage 里的**纯视觉位置**。
 *   ③ 无 DOM 环境（Node 测试）**不抛**：`selfCheck()` 给 `no-dom`，挂载请求静默跳过。
 *   ④ 每条读数都区分「没做过」与「结果是 0」：未运行显示 `未运行`，不显示 `0`。
 */
(function (root) {
    'use strict';

    const UI_VERSION = 1;
    const UI_KIND = 'v4_panel_ui';
    const ORB_KEY = 'lonsha.v4.orb.v1';
    const SNAP_ZONE = 48;
    const CLICK_SLOP = 6;
    const CSS_ID = 'lonsha-v4-panel-css';
    const HOST_ID = 'lonsha-v4-panel-host';
    const OWNER = 'lonsha-memory';

    /** 六格定义：键、标题、一句人话说明。顺序与 bridge.SIX 一致。 */
    const CELLS = Object.freeze([
        ['maintenance', '维护节奏', '哪一段楼层可以补记忆，以及为什么还不能补'],
        ['window', '窗口撤回', '我隐藏过哪些楼（别人的隐藏我不动）'],
        ['rules', '规则', '你写的规则编译成了什么，锁住了哪些条目'],
        ['codec', '存档', '现在存下来多大、编不编得出来'],
        ['reuse', '选文复用', '这一轮的选文是复用的还是重新选的'],
        ['edits', '摘要改写', '上一次摘要是句级修改还是整段重写']
    ]);

    function doc() { return (root && root.document) ? root.document : null; }

    /** 取面板桥（唯一取数口径）。 */
    function bridge() {
        try { if (root && root.LonShaV4PanelBridge) return root.LonShaV4PanelBridge; } catch (_e) { /* 忽略 */ }
        try { if (typeof require !== 'undefined') return require('./v4-panel-bridge.js'); } catch (_e) { /* 忽略 */ }
        return null;
    }

    /** 取引擎实例（index.js 暴露 `window.LonShaMemory`）。 */
    function hostOf() {
        try {
            if (root && root.LonShaMemory) return root.LonShaMemory;
            const st = root && root.SillyTavern;
            const ctx = st && typeof st.getContext === 'function' ? st.getContext() : null;
            return (ctx && ctx.extensionSettings && ctx.extensionSettings[OWNER]) || null;
        } catch (_e) { return null; }
    }

    /* ---------------- 样式（一次注入，幂等） ---------------- */

    const CSS = [
        '#' + HOST_ID + '{position:fixed;inset:0;z-index:99998;pointer-events:none;}',
        '#lonsha-v4-orb{pointer-events:auto;position:fixed;z-index:99999;display:flex;align-items:center;',
        'justify-content:center;writing-mode:vertical-rl;letter-spacing:.18em;font-size:11px;font-weight:600;',
        'color:var(--ls-fg-1,#e6edf3);background:linear-gradient(160deg,var(--ls-accent,#4c8dff),var(--ls-accent-2,#7c5cff));',
        'border:0;padding:10px 6px;cursor:grab;user-select:none;-webkit-user-select:none;',
        'clip-path:polygon(0 0,100% 0,100% calc(100% - 7px),50% 100%,0 calc(100% - 7px));',
        'box-shadow:var(--ls-sh-2,0 8px 24px rgba(1,4,9,.5));transition:transform .22s var(--ls-ease,ease),opacity .22s ease;}',
        '#lonsha-v4-orb[data-dock="left"]{transform:translateX(-72%);opacity:.72;}',
        '#lonsha-v4-orb[data-dock="right"]{transform:translateX(72%);opacity:.72;}',
        '#lonsha-v4-orb[data-awake="1"],#lonsha-v4-orb:focus-visible{transform:translateX(0)!important;opacity:1;}',
        '#lonsha-v4-orb:active{cursor:grabbing;}',
        '#lonsha-v4-sheet{pointer-events:auto;position:fixed;left:50%;top:50%;transform:translate(-50%,-50%)',
        'width:min(560px,94vw);max-height:82vh;display:none;flex-direction:column;',
        'background:var(--ls-bg-1,#0d1117);color:var(--ls-fg-1,#e6edf3);',
        'border:1px solid var(--ls-line,rgba(240,246,252,.10));border-radius:var(--ls-r-lg,16px);',
        'box-shadow:var(--ls-sh-3,0 24px 64px rgba(1,4,9,.7));overflow:hidden;}',
        '#lonsha-v4-sheet[data-open="1"]{display:flex;}',
        '.v4-head{display:flex;align-items:center;gap:8px;padding:12px 14px;',
        'border-bottom:1px solid var(--ls-line,rgba(240,246,252,.10));}',
        '.v4-title{font-size:14px;font-weight:700;flex:1;}',
        '.v4-sub{font-size:11px;color:var(--ls-fg-3,#8b949e);}',
        '.v4-btn{border:1px solid var(--ls-line,rgba(240,246,252,.14));background:transparent;',
        'color:var(--ls-fg-2,#c9d1d9);border-radius:10px;padding:4px 10px;font-size:11px;cursor:pointer;}',
        '.v4-btn:hover{border-color:var(--ls-accent,#4c8dff);color:var(--ls-accent,#4c8dff);}',
        '.v4-body{overflow-y:auto;padding:10px 12px 16px;display:flex;flex-direction:column;gap:8px;}',
        '.v4-tools{display:flex;gap:8px;padding-top:4px;border-top:1px solid var(--ls-line,rgba(240,246,252,.10));}',
        '.v4-tools .v4-btn{flex:1;padding:8px 10px;font-size:12px;}',
        '.v4-tools .v4-btn:disabled{opacity:.45;cursor:not-allowed;}',
        '.v4-cell{border:1px solid var(--ls-line,rgba(240,246,252,.10));border-radius:12px;overflow:hidden;',
        'background:var(--ls-bg-2,rgba(255,255,255,.02));}',
        '.v4-cell[data-ok="0"]{border-color:rgba(248,81,73,.35);}',
        '.v4-row{display:flex;align-items:center;gap:8px;padding:10px 12px;}',
        '.v4-name{font-size:12px;font-weight:600;flex:none;}',
        '.v4-val{font-size:11px;color:var(--ls-fg-2,#c9d1d9);flex:1;text-align:right;',
        'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
        '.v4-badge{font-size:10px;padding:1px 7px;border-radius:999px;flex:none;',
        'border:1px solid var(--ls-line,rgba(240,246,252,.14));color:var(--ls-fg-3,#8b949e);}',
        '.v4-badge[data-tone="ok"]{border-color:rgba(63,185,80,.5);color:var(--ls-ok,#3fb950);}',
        '.v4-badge[data-tone="warn"]{border-color:rgba(210,153,34,.5);color:var(--ls-warn,#d29922);}',
        '.v4-badge[data-tone="idle"]{border-color:var(--ls-line,rgba(240,246,252,.14));color:var(--ls-fg-3,#8b949e);}',
        '.v4-bar{width:100%;border:0;border-top:1px solid var(--ls-line,rgba(240,246,252,.10));',
        'background:transparent;color:var(--ls-fg-3,#8b949e);font-size:11px;padding:6px 12px;cursor:pointer;text-align:left;}',
        '.v4-bar:hover{color:var(--ls-accent,#4c8dff);}',
        '.v4-fold{display:grid;grid-template-rows:0fr;transition:grid-template-rows .24s var(--ls-ease,ease);}',
        '.v4-fold[data-open="1"]{grid-template-rows:1fr;}',
        '.v4-fold>div{overflow:hidden;}',
        '.v4-detail{padding:0 12px 10px;font-size:11px;line-height:1.6;color:var(--ls-fg-3,#8b949e);white-space:pre-wrap;}',
        '.v4-mask{position:fixed;inset:0;background:rgba(1,4,9,.55);display:none;}',
        '.v4-mask[data-open="1"]{display:block;}'
    ].join('');

    /** 注入样式（幂等：已存在就不重复插）。 */
    function injectCss() {
        const d = doc();
        if (!d) return false;
        if (d.getElementById(CSS_ID)) return true;
        const el = d.createElement('style');
        el.id = CSS_ID;
        el.textContent = CSS;
        (d.head || d.documentElement).appendChild(el);
        return true;
    }

    /* ---------------- 读数 → 人话 ---------------- */

    /**
     * 把 bridge 的一个格子翻译成「一行读数 + 细节 + 色调」。
     * ★ 三态必须分形：`未运行`、`缺席`、`有结果`。把未运行显示成 0 是本仓最贵的错。
     */
    function describe(key, cell) {
        const c = cell && typeof cell === 'object' ? cell : {};
        if (c.ok === false) {
            const reason = String(c.reason || '');
            const map = {
                'not-run': '未运行', 'module-unavailable': '模块未加载', 'no-chat': '还没有对话',
                'not-configured': '未配置', 'no-payload': '没有可编的载荷', 'capacity': '容量超限',
                'compile-error': '编译失败', 'encode-failed': '编码失败', 'thrown': '取数异常',
                'no-intent': '无需动作'
            };
            const tone = (reason === 'capacity' || reason === 'compile-error' || reason === 'encode-failed' || reason === 'thrown')
                ? 'warn' : 'idle';
            let detail = '';
            if (reason === 'compile-error') {
                detail = '第' + (c.line || '?') + '行第' + (c.column || '?') + '列：' + String(c.error || '');
            } else if (reason === 'capacity') {
                detail = String(c.error || '') + (c.readings ? '\n差 ' + (c.readings.overflowChars || '?') + ' 字' : '');
            } else if (reason === 'module-unavailable') {
                detail = '该机制模块没加载进来（manifest.extra_js 未登记或被宿主拦下）';
            } else if (reason === 'not-run') {
                detail = '这次会话还没触发过这一格（未运行 ≠ 结果为 0）';
            } else if (reason === 'no-chat') {
                detail = '当前没有打开的对话，窗口面算不出来';
            } else if (reason === 'not-configured') {
                detail = '还没有写规则。规则是数据不是代码：在设置里写 `when kind == "npc" => lock;` 这样的一行就行。';
            }
            return { tone: tone, value: map[reason] || reason || '未知', detail: detail, ok: false };
        }
        if (key === 'maintenance') {
            const trig = String(c.trigger || '-');
            const tn = { interval: '可维护', waiting: '等攒够', blocked: '等回复稳定', none: '没有待维护' }[trig] || trig;
            return {
                tone: trig === 'interval' ? 'ok' : 'idle', value: tn + ' · 到第' + (c.eligibleEnd || 0) + '楼',
                detail: '可维护区 起' + (c.covered || 0) + ' 止' + (c.eligibleEnd || 0) + '（不含）；暂缓 ' + (c.deferredCount || 0) + ' 条\n'
                    + String(c.deferred || '') + '\n本轮补摘上界截到 ' + (c.cappedTo ?? '-') + ' 楼'
                    + ((c.degraded && c.degraded.length) ? '\n降级读数：' + c.degraded.join('，') : ''),
                ok: true
            };
        }
        if (key === 'window') {
            const n = (Number(c.hide) || 0) + (Number(c.restore) || 0);
            return {
                tone: n ? 'ok' : 'idle', value: '隐' + (c.hide || 0) + ' / 撤' + (c.restore || 0),
                detail: '撤回边界 ' + (c.boundary || 0) + ' 楼（只撤已覆盖前缀）\n外部隐藏 ' + (c.foreignHidden || 0) + ' 条 —— 别人隐的我不动\n'
                    + String(c.reason || ''),
                ok: true
            };
        }
        if (key === 'rules') {
            const ops = c.byOp && typeof c.byOp === 'object' ? Object.keys(c.byOp).map((k) => k + '×' + c.byOp[k]).join('，') : '';
            return {
                tone: (Number(c.rules) || 0) > 0 ? 'ok' : 'idle', value: (c.rules || 0) + ' 条规则',
                detail: '算子：' + (ops || '（无）') + '\n源码 ' + (c.chars || 0) + ' 字 / AST 节点 ' + (c.nodes || 0) + ' 个',
                ok: true
            };
        }
        if (key === 'codec') {
            return {
                tone: 'ok', value: (c.chars || 0) + ' 字符',
                detail: '编码 ' + String(c.encoding || '') + '\n池节点 ' + (c.pool || 0) + ' 个 · 压缩比 ' + (c.ratio || 0),
                ok: true
            };
        }
        if (key === 'reuse') {
            return {
                tone: c.reused ? 'ok' : 'idle', value: c.reused ? ('复用 ' + (c.ids || 0) + ' 条') : '本轮重新选',
                detail: '原因：' + ((c.reasons || []).join('，') || '（无）') + '\n键 ' + String(c.key || '').slice(0, 16),
                ok: true
            };
        }
        if (key === 'edits') {
            return {
                tone: c.rewritten ? 'warn' : 'ok', value: c.rewritten ? '整段重写' : '句级修改',
                detail: '改动跨度 ' + (c.spanChars ?? '-') + ' 字 · 覆盖比 ' + (c.coverage ?? '-') + '\n'
                    + '拒绝码：' + ((c.codes || []).join('，') || '（无）') + (c.line ? '\n' + c.line : ''),
                ok: true
            };
        }
        return { tone: 'idle', value: '-', detail: '', ok: true };
    }

    /* ---------------- DOM ---------------- */

    function el(tag, cls, text) {
        const d = doc();
        const n = d.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined && text !== null) n.textContent = String(text);
        return n;
    }

    /** 建一个格子：行（名称/值/徽章）+ 底部整条开关 + 可展细节（内容常驻 DOM）。 */
    function buildCell(key, title, hint, cell) {
        const info = describe(key, cell);
        const box = el('section', 'v4-cell');
        box.setAttribute('data-ok', info.ok ? '1' : '0');
        box.setAttribute('data-cell', key);

        const row = el('div', 'v4-row');
        row.appendChild(el('span', 'v4-name', title));
        const val = el('span', 'v4-val', info.value);
        val.title = info.value;
        row.appendChild(val);
        const badge = el('span', 'v4-badge', info.ok ? (info.tone === 'ok' ? '就绪' : '待触发') : '未就绪');
        badge.setAttribute('data-tone', info.tone);
        row.appendChild(badge);
        box.appendChild(row);

        const bar = el('button', 'v4-bar', '展开细节');
        bar.type = 'button';
        bar.setAttribute('aria-expanded', 'false');
        const fold = el('div', 'v4-fold');
        fold.setAttribute('data-open', '0');
        const inner = el('div');
        const detail = el('div', 'v4-detail', (hint ? hint + '\n\n' : '') + (info.detail || '（无细节）'));
        inner.appendChild(detail);
        fold.appendChild(inner);
        bar.addEventListener('click', () => {
            const open = fold.getAttribute('data-open') === '1';
            fold.setAttribute('data-open', open ? '0' : '1');
            bar.setAttribute('aria-expanded', open ? 'false' : 'true');
            bar.textContent = open ? '展开细节' : '收起细节';
        });
        box.appendChild(bar);
        box.appendChild(fold);
        return box;
    }

    /** 面板本体（重建内容，保留壳）。 */
    function renderSheet(sheet, host) {
        const body = sheet.querySelector('.v4-body');
        if (!body) return null;
        const PB = bridge();
        let data = null;
        let readErr = '';
        try {
            data = PB && typeof PB.read === 'function' ? PB.read(host || hostOf()) : null;
        } catch (e) { readErr = String((e && e.message) || e); }
        body.textContent = '';
        const sub = sheet.querySelector('.v4-sub');
        if (!PB || !data) {
            if (sub) sub.textContent = '面板桥不可用' + (readErr ? '（' + readErr + '）' : '');
            body.appendChild(el('div', 'v4-detail', '需要 v4-panel-bridge.js 加载后才能取数。'));
            return null;
        }
        if (sub) {
            sub.textContent = '六条 ' + (data.alive || 0) + '/' + (data.total || 6)
                + ((data.missing && data.missing.length) ? ' · 缺 ' + data.missing.join(' ') : '');
        }
        for (const [key, title, hint] of CELLS) {
            body.appendChild(buildCell(key, title, hint, data[key]));
        }
        /* —— 详情入口 ——
         * 【为什么要在这里放入口】六格只说「状态好不好」，不说「具体是哪几层」。
         *   没有这条入口，摘要树与楼层面板就是「已挂载但零消费」的游离件
         *   （本仓 v3.163 有 68 个版本的前科：缝了机制没人调，账本零消费）。
         *   这两个按钮是它们唯一的真实消费点，删掉按钮 = 删掉功能。
         * 【为什么先关抽屉】两者都是 fixed 全屏浮层，叠在一起会让 Esc 关错层。
         *   关抽屉再开面板，点「返回」时回到正文，行为可预测。 */
        const tools = el('div', 'v4-tools');
        const treeMod = root.LonShaSummaryTree || null;
        const floorMod = root.LonShaFloorPanel || null;
        const openTree = el('button', 'v4-btn', '剧情回顾');
        openTree.type = 'button';
        if (treeMod && typeof treeMod.openSummaryTree === 'function') {
            openTree.addEventListener('click', () => {
                close.click();
                try { treeMod.openSummaryTree(); } catch (e) { console.warn('[lonsha] 摘要树打开失败', e); }
            });
        } else {
            openTree.disabled = true;
            openTree.title = 'ui-summary-tree.js 未加载';
        }
        const openFloors = el('button', 'v4-btn', '楼层面板');
        openFloors.type = 'button';
        if (floorMod && typeof floorMod.openFloorPanel === 'function') {
            openFloors.addEventListener('click', () => {
                close.click();
                try { floorMod.openFloorPanel(); } catch (e) { console.warn('[lonsha] 楼层面板打开失败', e); }
            });
        } else {
            openFloors.disabled = true;
            openFloors.title = 'ui-floor-panel.js 未加载';
        }
        tools.appendChild(openTree);
        tools.appendChild(openFloors);
        body.appendChild(tools);
        return data;
    }

    /** 挂载（幂等）。返回 true 表示已挂上。 */
    function mount(host) {
        const d = doc();
        if (!d || !d.body) return false;
        injectCss();
        if (d.getElementById(HOST_ID)) return true;

        const wrapper = el('div');
        wrapper.id = HOST_ID;

        const mask = el('div', 'v4-mask');
        mask.setAttribute('data-open', '0');

        const sheet = el('div');
        sheet.id = 'lonsha-v4-sheet';
        sheet.setAttribute('data-open', '0');
        sheet.setAttribute('role', 'dialog');
        sheet.setAttribute('aria-label', 'LonSha 记忆六条面板');

        const head = el('div', 'v4-head');
        const title = el('div', 'v4-title', '记忆六条');
        const sub = el('div', 'v4-sub', '');
        const refresh = el('button', 'v4-btn', '刷新');
        refresh.type = 'button';
        const close = el('button', 'v4-btn', '关闭');
        close.type = 'button';
        head.appendChild(title);
        head.appendChild(sub);
        head.appendChild(refresh);
        head.appendChild(close);
        const body = el('div', 'v4-body');
        sheet.appendChild(head);
        sheet.appendChild(body);

        const orb = el('button');
        orb.id = 'lonsha-v4-orb';
        orb.type = 'button';
        orb.textContent = '记忆';
        orb.setAttribute('aria-label', '打开记忆六条面板');
        orb.title = '记忆六条（拖动可移动，靠边会自动半隐）';

        wrapper.appendChild(mask);
        wrapper.appendChild(sheet);
        wrapper.appendChild(orb);
        d.body.appendChild(wrapper);

        /* —— 位置：只存纯视觉态（各设备屏幕不同，同步会跑到屏幕外） —— */
        let pos = { dock: 'right', y: Math.round((root.innerHeight || 800) * 0.55) };
        try {
            const raw = root.localStorage && root.localStorage.getItem(ORB_KEY);
            if (raw) {
                const p = JSON.parse(raw);
                if (p && (p.dock === 'left' || p.dock === 'right' || p.dock === 'none')) {
                    pos = { dock: p.dock, x: Number(p.x) || 0, y: Number(p.y) || 0 };
                }
            }
        } catch (_e) { /* 无 localStorage */ }
        const applyPos = () => {
            orb.setAttribute('data-dock', pos.dock);
            orb.style.top = Math.round(pos.y) + 'px';
            if (pos.dock === 'left') { orb.style.left = '0px'; orb.style.right = ''; }
            else if (pos.dock === 'right') { orb.style.right = '0px'; orb.style.left = ''; }
            else { orb.style.left = Math.round(Number(pos.x) || 0) + 'px'; orb.style.right = ''; }
        };
        const savePos = () => { try { root.localStorage && root.localStorage.setItem(ORB_KEY, JSON.stringify(pos)); } catch (_e) { /* 忽略 */ } };
        applyPos();

        /* —— 拖动 / 贴边吸附 / 点开 —— */
        let drag = null;
        const awake = (v) => orb.setAttribute('data-awake', v ? '1' : '0');
        orb.addEventListener('pointerenter', () => awake(true));
        orb.addEventListener('pointerleave', () => { if (!drag) awake(false); });
        orb.addEventListener('focus', () => awake(true));
        orb.addEventListener('blur', () => { if (!drag) awake(false); });

        orb.addEventListener('pointerdown', (ev) => {
            drag = { x: ev.clientX, y: ev.clientY, moved: 0 };
            try { orb.setPointerCapture(ev.pointerId); } catch (_e) { /* 老浏览器 */ }
        });
        orb.addEventListener('pointermove', (ev) => {
            if (!drag) return;
            const dy = ev.clientY - drag.y;
            drag.moved += Math.abs(dy) + Math.abs(ev.clientX - drag.x);
            /* 纵向夹在视口内：换屏/旋转后不至于拖到屏幕外找不回来。 */
            pos.y = Math.max(4, Math.min((root.innerHeight || 800) - 64, pos.y + dy));
            if (pos.dock === 'none') pos.x = Math.max(0, Math.min((root.innerWidth || 400) - 40, (pos.x || 0) + (ev.clientX - drag.x)));
            drag.x = ev.clientX; drag.y = ev.clientY;
            applyPos();
        });
        orb.addEventListener('pointerup', (ev) => {
            if (!drag) return;
            const moved = drag.moved;
            drag = null;
            /* 松手时靠边 ≤ SNAP_ZONE 才吸附；否则保持自由位置（学柏宝书：拖到中间就停在中间）。 */
            if (ev.clientX <= SNAP_ZONE) pos.dock = 'left';
            else if (ev.clientX >= (root.innerWidth || 0) - SNAP_ZONE) pos.dock = 'right';
            else pos.dock = 'none';
            applyPos(); savePos(); awake(false);
            if (moved < CLICK_SLOP) openSheet();
        });
        orb.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openSheet(); }
        });

        function openSheet() {
            renderSheet(sheet, host || hostOf());
            sheet.setAttribute('data-open', '1');
            mask.setAttribute('data-open', '1');
            orb.setAttribute('aria-expanded', 'true');
        }
        function closeSheet() {
            sheet.setAttribute('data-open', '0');
            mask.setAttribute('data-open', '0');
            orb.setAttribute('aria-expanded', 'false');
        }
        refresh.addEventListener('click', () => renderSheet(sheet, host || hostOf()));
        close.addEventListener('click', closeSheet);
        mask.addEventListener('click', closeSheet);
        d.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') closeSheet(); });

        /* 首屏不打扰：只在用户点开时才算读数（算一处要读聊天/存档，别在加载时抢资源）。 */
        return true;
    }

    /** 自检：无 DOM 时也必须给出可读结论（不抛）。 */
    function selfCheck() {
        const checks = [];
        const hasDom = !!doc();
        checks.push(['DOM 环境可挂载', hasDom]);         // Node 下为 false，但**不判失败**
        let descOk = true;
        try {
            /* 六格的「未运行」必须与「结果为 0」不同形 —— 这是本文件最核心的一条。 */
            const nr = describe('reuse', { ok: false, reason: 'not-run' });
            const zero = describe('reuse', { ok: true, reused: false, ids: 0, reasons: [] });
            descOk = nr.value === '未运行' && zero.value === '本轮重新选' && nr.value !== zero.value;
        } catch (_e) { descOk = false; }
        checks.push(['未运行 ≠ 结果为 0', descOk]);
        let toneOk = true;
        try {
            const cap = describe('codec', { ok: false, reason: 'capacity', error: '满了' });
            toneOk = cap.tone === 'warn' && cap.detail.indexOf('满了') >= 0;
        } catch (_e) { toneOk = false; }
        checks.push(['容量超限是真事件（报警，不当未运行）', toneOk]);
        return {
            ok: descOk && toneOk,
            checks: checks.map((x) => ({ name: x[0], ok: !!x[1] })),
            note: hasDom ? '' : 'no-dom'
        };
    }

    const api = {
        UI_VERSION: UI_VERSION,
        UI_KIND: UI_KIND,
        CELLS: CELLS,
        describe: describe,
        injectCss: injectCss,
        mount: mount,
        selfCheck: selfCheck
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaV4PanelUI = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }

    /* 自启动（幂等、可失败）：宿主页面就绪后挂一次。
     *   为什么要自启动：index.js 的显式挂载点可能因为「本模块比引擎晚加载」而错过；
     *   反过来只有自启动也不行（引擎可能在 DOMContentLoaded 之后才建实例）。两条都留着，
     *   `mount` 自身幂等，谁先到谁挂上。
     *   ★ 找不到引擎时**最多重试 3 次**就停 —— 不无限 setInterval 刷屏（那会在出错时安静地烧 CPU）。 */
    function autoMount() {
        if (!doc() || !doc().body) return false;
        let tries = 0;
        const kick = () => {
            tries++;
            let ok = false;
            try { ok = mount(hostOf()); } catch (_e) { ok = false; }
            if (!ok && tries < 3) setTimeout(kick, 1500);
        };
        try {
            if (doc().readyState === 'loading') {
                root.addEventListener('DOMContentLoaded', () => setTimeout(kick, 800), { once: true });
            } else {
                setTimeout(kick, 800);
            }
        } catch (_e) { /* 宿主无 addEventListener */ }
        return true;
    }
    /* 显式宿主挂载：抽屉与书签坠要让产品面（index.js）能主动挂载 / 打开，
     * 而不是只能靠模块自己 autoMount。autoMount 在宿主清理 DOM 后不会重试，
     * 有一个可被产品面调用的 mount() 才是可靠入口。 */
    if (typeof window !== 'undefined') window.LonShaV4PanelUi = api;
    if (root && root.document) autoMount();

    return api;
})(typeof window !== 'undefined' ? window : globalThis);