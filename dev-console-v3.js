// LonSha记忆引擎 - 开发者控制台 v3.1 (ui/dev-console-v3.js)
// ------------------------------------------------------------------
// 把 settings-ui.js 生成的开发者侧面板（五个设置分区、记忆健康、诊断页、注入预览、记忆控制中心、
// 总览、可视化面板）重新排版成一个专业的开发者控制台：左侧分区导航（窄屏收成顶部分段条）、
// 分组内嵌表单（标签 | 说明 | 控件三栏对齐）、统一控件（开关 / 带数值胶囊的滑杆 / 步进器 / 分段控件 /
// 下拉 / 等宽文本框）、粘底保存栏（未保存计数 + 改动表 + Ctrl/Cmd+S）、设置内搜索（也能搜配置键）、
// 分区「恢复默认」、行内校验、带复制的等宽 JSON / 日志 / 载荷查看器、状态列表 + 严重度徽标、
// 注入预算计量条与载荷差异视图。
//
// 契约（与 v1 / v2 / v3 相同）：
//   · 开关默认关：localStorage 'lonsha.ui.v3' = '1' 才生效（与 dashboard v3 精修外观同一个开关）；
//     关掉开关或调用 LonShaDevConsole.enable(false) 时，按撤销日志把 DOM、内联样式、属性全部还原。
//   · 不改任何元素 ID、不改任何 data-cfg / data-cfg-num / data-cfg-text 绑定、不替换任何节点 ——
//     只「搬家」和「加包裹」，且包裹不改变兄弟顺序（上游滑杆读数靠 previousElementSibling 找 .ls-slider-val，
//     档位下拉靠 previousElementSibling 找读数行，这两条都保持成立）。
//   · 所有写配置的动作都走原控件：新加的数值胶囊 / 步进器 / 分段控件只改原 range 的值并派发 input 事件，
//     由上游的未保存计数、保存器、还原器照常处理；「恢复默认」也只改控件，不写 config、不落盘。
//   · 零内联 style：本文件从不写 style 属性；上游节点上的装饰性内联样式在增强期间被移走
//     （语义改记到 data-dc-tone / data-dc-edge / data-dc-strong / data-dc-mono / data-dc-small），
//     display / visibility / 百分比宽高 / 自定义属性这类「功能性」声明保留。还原时原样写回。
//   · 依赖：css/dev-console-v3.css（:root --ls-dc-css: 1）与 v1 的 css/dashboard.css（--ls-dash-css: 1）。
//     任一缺席即不启用（控制台层叠在 @layer 里，旧版注入的未分层 <style> 必须先被停用才能生效）。
// 加载：manifest.json -> extra_js 中放在 "ui/dashboard-v2.js" 之后加入 "ui/dev-console-v3.js"。
(function () {
    'use strict';
    const VERSION = '3.1.0';
    const KEY = 'lonsha.ui.v3';
    const TARGET_KEY = 'lonsha.dc.target';
    const KEYS_KEY = 'lonsha.dc.showKeys';
    const LEGACY_STYLE_MARKER = 'LonSha 设置面板 · 精密档案室微质感';
    const SECTIONS = [
        { id: 'general', title: '开始使用', icon: 'sliders', build: 'player', desc: '记忆总开关、记忆档位、AI 接口与后台处理。' },
        { id: 'narrative', title: '人物与故事', icon: 'book', build: 'player', desc: '人物状态、日记、场景、伏笔与手机联动的提取和注入。' },
        { id: 'health', title: '记忆健康', icon: 'heart-pulse', build: 'player', desc: '当前会话的体检读数与开发者读数，只读不改。' },
        { id: 'retrieval', title: '备份与调校', icon: 'database', build: 'diag', desc: '导入导出、检索、摘要与预算参数。' },
        { id: 'advanced', title: '实验室', icon: 'flask', build: 'diag', desc: '引擎开关、算法参数与实验功能。默认值已调好，非必要不改。' },
    ];

    const store = {
        get(k, d) { try { const v = window.localStorage.getItem(k); return v == null ? d : v; } catch (_) { return d; } },
        set(k, v) { try { window.localStorage.setItem(k, String(v)); } catch (_) { /* 隐私模式忽略 */ } },
        sget(k) { try { return window.sessionStorage.getItem(k); } catch (_) { return null; } },
        sset(k, v) { try { if (v == null) window.sessionStorage.removeItem(k); else window.sessionStorage.setItem(k, String(v)); } catch (_) { /* 忽略 */ } },
    };
    const warn = (tag, e) => { try { (window.LonShaMemory?.reportError || console.warn)(e, 'dev-console.' + tag); } catch (_) { /* 忽略 */ } };
    const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const I = (name, tone) => '<i class="ls-ico" data-i="' + esc(name) + '"' + (tone ? ' data-tone="' + tone + '"' : '') + ' aria-hidden="true"></i>';
    const isOn = () => store.get(KEY, '0') === '1';
    const cssVar = (n) => { try { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); } catch (_) { return ''; } };
    const cssReady = () => cssVar('--ls-dc-css') === '1' && cssVar('--ls-dash-css') === '1';
    const plugin = () => window.LonShaMemory || null;
    const cfg = () => { try { return plugin().engine.config.config || {}; } catch (_) { return {}; } };
    const defaults = () => { try { const t = window.LonShaMemoryConfig?.getConfigDefaultsTemplate?.(); return t && typeof t === 'object' ? t : null; } catch (_) { return null; } };
    const fmtNum = (n) => (Number.isFinite(Number(n)) ? Number(n).toLocaleString('zh-CN') : '—');

    function neutralizeLegacyStyle() {
        let n = 0;
        document.querySelectorAll('style:not([data-ls-neutralized])').forEach((el) => {
            if ((el.textContent || '').indexOf(LEGACY_STYLE_MARKER) >= 0) { el.setAttribute('media', 'not all'); el.setAttribute('data-ls-neutralized', 'dev-console-' + VERSION); n++; }
        });
        return n;
    }

    /* ------------------------------------------------------------------
     * 撤销日志：每个被增强的根节点一份，关闭时倒序执行
     * ------------------------------------------------------------------ */
    const ROOTS = new Map();   // root -> { ops: [], kind, observer, busy }
    function ctxOf(root, kind) {
        let c = ROOTS.get(root);
        if (!c) { c = { ops: [], kind, observer: null, busy: false }; ROOTS.set(root, c); }
        return c;
    }
    function setAttr(c, el, name, value) {
        const had = el.hasAttribute(name), old = el.getAttribute(name);
        el.setAttribute(name, value);
        c.ops.push(() => { if (had) el.setAttribute(name, old); else el.removeAttribute(name); });
    }
    function addClass(c, el, cls) { if (el.classList.contains(cls)) return; el.classList.add(cls); c.ops.push(() => el.classList.remove(cls)); }
    function insert(c, parent, node, before) { parent.insertBefore(node, before || null); c.ops.push(() => node.remove()); return node; }
    function move(c, node, parent, before) {
        const p0 = node.parentNode, n0 = node.nextSibling;
        parent.insertBefore(node, before || null);
        c.ops.push(() => { if (p0) p0.insertBefore(node, n0 && n0.parentNode === p0 ? n0 : null); });
    }
    /** 把 nodes 包进 wrapper（插在第一个节点的位置，节点相对顺序不变） */
    function wrap(c, nodes, wrapper) {
        const first = nodes[0]; const parent = first.parentNode;
        /* 取第一个到最后一个节点之间的连续区间（含中间的空白文本 / 注释节点），还原时才能逐字节一致 */
        const all = Array.prototype.slice.call(parent.childNodes);
        const a = all.indexOf(first), b = all.indexOf(nodes[nodes.length - 1]);
        if (a >= 0 && b >= a) nodes = all.slice(a, b + 1);
        parent.insertBefore(wrapper, first);
        nodes.forEach((n) => wrapper.appendChild(n));
        c.ops.push(() => { nodes.forEach((n) => { if (n.parentNode === wrapper) parent.insertBefore(n, wrapper); }); wrapper.remove(); });
        return wrapper;
    }
    function listen(c, el, type, fn, opt) { el.addEventListener(type, fn, opt); c.ops.push(() => el.removeEventListener(type, fn, opt)); }
    function restore(root) {
        const c = ROOTS.get(root); if (!c) return;
        if (c.observer) { try { c.observer.disconnect(); } catch (_) { /* 忽略 */ } }
        c.busy = true;
        for (let i = c.ops.length - 1; i >= 0; i--) { try { c.ops[i](); } catch (e) { warn('restore', e); } }
        ROOTS.delete(root);
    }

    /* ------------------------------------------------------------------
     * 内联样式归一：装饰性声明移走，语义改记到 data-dc-*；功能性声明保留
     * ------------------------------------------------------------------ */
    const KEEP_PROP = /^(display|visibility|--.*)$/;
    function toneOf(v) {
        const s = String(v || '').toLowerCase();
        if (/warn|gold|d29922|e3b341|fbbf24|f0b72f/.test(s)) return 'warn';
        if (/danger|f85149|f87171|ff7b72/.test(s)) return 'error';
        if (/success|3fb950|34d399|56d364/.test(s)) return 'success';
        if (/accent|info|58a6ff|38bdf8|79c0ff/.test(s)) return 'info';
        if (/text-[234]|6e7681|8b949e|9da7b3|64748b|94a3b8/.test(s)) return 'muted';
        return '';
    }
    function parseDecls(text) {
        const out = []; let depth = 0, cur = '';
        for (const ch of String(text || '')) { if (ch === '(') depth++; else if (ch === ')') depth--; if (ch === ';' && depth === 0) { out.push(cur); cur = ''; } else cur += ch; }
        out.push(cur);
        return out.map((d) => { const i = d.indexOf(':'); return i < 0 ? null : { p: d.slice(0, i).trim().toLowerCase(), v: d.slice(i + 1).trim() }; }).filter((d) => d && d.p);
    }
    function normalizeInline(c, root) {
        const els = root.querySelectorAll('[style]');
        els.forEach((el) => {
            if (el.closest('.dc-side, .dc-head, .dc-code-bar')) return;
            const orig = el.getAttribute('style');
            const decls = parseDecls(orig);
            const keep = []; const sem = {};
            decls.forEach(({ p, v }) => {
                const val = v.replace(/!important/i, '').trim();
                if (KEEP_PROP.test(p) || ((p === 'width' || p === 'height' || p === 'max-width') && /%/.test(val))) { keep.push(p + ':' + v); return; }
                if (p === 'color') { const t = toneOf(val); if (t) sem.tone = t; }
                else if (/^border-left/.test(p) && !/none|^0/.test(val)) sem.edge = toneOf(val) || 'muted';
                else if (p === 'font-weight' && /bold|[6-9]00/.test(val)) sem.strong = '1';
                else if (p === 'font-family' && /mono/.test(val)) sem.mono = '1';
                else if (p === 'font-size') { const n = parseFloat(val); if (n && n <= 12.5) sem.small = '1'; }
            });
            if (keep.join(';') === orig.trim().replace(/;$/, '')) return;
            if (keep.length) el.setAttribute('style', keep.join(';')); else el.removeAttribute('style');
            const added = [];
            Object.keys(sem).forEach((k) => { const a = 'data-dc-' + k; if (!el.hasAttribute(a)) { el.setAttribute(a, sem[k]); added.push(a); } });
            c.ops.push(() => { el.setAttribute('style', orig); added.forEach((a) => el.removeAttribute(a)); });
        });
    }

    /* ------------------------------------------------------------------
     * 小部件
     * ------------------------------------------------------------------ */
    function make(tag, cls, html) { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; }
    async function copyText(text, btn) {
        let ok = false;
        try { await navigator.clipboard.writeText(String(text)); ok = true; } catch (_) {
            try { const ta = make('textarea'); ta.value = String(text); ta.setAttribute('readonly', ''); ta.className = 'dc-vh'; document.body.appendChild(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch (_e) { ok = false; }
        }
        if (btn) {
            const label = btn.querySelector('.dc-btn-label');
            if (label) { const t0 = label.textContent; label.textContent = ok ? '已复制' : '复制失败'; btn.classList.toggle('dc-copied', ok); setTimeout(() => { label.textContent = t0; btn.classList.remove('dc-copied'); }, 1400); }
        }
        return ok;
    }
    function codeBar(title, meta, buttons) {
        const bar = make('div', 'dc-code-bar');
        bar.innerHTML = '<span class="dc-code-title">' + esc(title) + '</span>' + (meta ? '<span class="dc-code-meta">' + esc(meta) + '</span>' : '')
            + (buttons || []).map((b) => '<button type="button" class="ls-btn ls-btn-sm dc-btn-ghost" data-dc-act="' + b.act + '"' + (b.pressed != null ? ' aria-pressed="' + b.pressed + '"' : '') + '>' + I(b.icon) + '<span class="dc-btn-label">' + esc(b.label) + '</span></button>').join('');
        return bar;
    }
    /** JSON 高亮（只在内容能整体解析成 JSON 时使用；返回 HTML） */
    function jsonHTML(text) {
        let obj; try { obj = JSON.parse(text); } catch (_) { return null; }
        const s = JSON.stringify(obj, null, 2);
        return esc(s).replace(/(&quot;(?:[^&]|&(?!quot;))*?&quot;)(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:e[+-]?\d+)?)/gi, (m, str, colon, lit, num) => {
            if (str) return '<span class="' + (colon ? 'dc-json-key' : 'dc-json-str') + '">' + str + '</span>' + (colon || '');
            if (lit) return '<span class="dc-json-lit">' + lit + '</span>';
            return '<span class="dc-json-num">' + num + '</span>';
        });
    }

    /* ------------------------------------------------------------------
     * 设置面板：字段包裹
     * ------------------------------------------------------------------ */
    const STARTER = (n) => n.nodeType === 1 && (n.matches('.ls-slider-label, label.ls-row, .ls-group-title, details, .ls-player-actions, .ls-group, .ls-lab-searchbar, .ls-lab-result, .ls-health-grid, .ls-mode-banner, .ls-player-welcome') || (n.tagName === 'BUTTON' && n.classList.contains('ls-btn')));
    const IS_CTL = (n) => n.nodeType === 1 && (n.matches('input, select, textarea') || !!n.querySelector('input, select, textarea, button'));
    const keyOf = (el) => (el && el.dataset) ? (el.dataset.cfg || el.dataset.cfgNum || el.dataset.cfgText || '') : '';
    const labelOf = (field) => { const s = field.querySelector('.ls-slider-label > span, .ls-row > div > div'); return s ? s.textContent.trim() : ''; };

    function enhanceRange(c, field, range) {
        const min = Number(range.min || 0), max = Number(range.max || 100), step = Number(range.step || 1);
        const count = Math.round((max - min) / step) + 1;
        const label = labelOf(field) || keyOf(range);
        const clamp = (v) => { let x = Math.min(max, Math.max(min, Number(v))); x = min + Math.round((x - min) / step) * step; return Number(x.toFixed(6)); };
        const push = (v) => { range.value = String(clamp(v)); range.dispatchEvent(new Event('input', { bubbles: true })); range.dispatchEvent(new Event('change', { bubbles: true })); };
        const msg = insert(c, field, make('div', 'dc-msg'));
        msg.setAttribute('role', 'status');
        let sync = () => {};
        if (count <= 4) {
            /* 分段控件：0/1/2 这种离散档位 */
            const seg = make('div', 'dc-seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', label);
            for (let i = 0; i < count; i++) { const v = Number((min + i * step).toFixed(6)); const b = make('button', '', esc(String(v))); b.type = 'button'; b.setAttribute('role', 'radio'); b.dataset.v = String(v); seg.appendChild(b); }
            insert(c, field, seg, msg);
            addClass(c, range, 'dc-native-hidden');
            listen(c, seg, 'click', (e) => { const b = e.target.closest('button[data-v]'); if (b) { push(b.dataset.v); sync(); } });
            sync = () => seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(Number(b.dataset.v) === Number(range.value))));
        } else if (Number.isInteger(step) && step === 1 && count <= 12) {
            /* 步进器：小范围整数 */
            const st = make('div', 'dc-stepper', '<button type="button" data-d="-1" aria-label="减少">' + I('minus') + '</button><input type="number" inputmode="numeric" aria-label="' + esc(label) + '"><button type="button" data-d="1" aria-label="增加">' + I('plus') + '</button>');
            const num = st.querySelector('input'); num.min = String(min); num.max = String(max); num.step = String(step);
            insert(c, field, st, msg);
            addClass(c, range, 'dc-native-hidden');
            listen(c, st, 'click', (e) => { const b = e.target.closest('button[data-d]'); if (b) { push(Number(range.value) + Number(b.dataset.d) * step); sync(); } });
            listen(c, num, 'change', () => { validate(num.value, true); push(num.value); sync(); });
            listen(c, num, 'input', () => validate(num.value, false));
            sync = () => { num.value = range.value; st.querySelector('[data-d="-1"]').disabled = Number(range.value) <= min; st.querySelector('[data-d="1"]').disabled = Number(range.value) >= max; };
        } else {
            /* 滑杆 + 数值胶囊（可直接输入） */
            const pill = make('input', 'dc-pill'); pill.type = 'number'; pill.min = String(min); pill.max = String(max); pill.step = String(step);
            pill.setAttribute('aria-label', label + ' 数值'); pill.inputMode = Number.isInteger(step) ? 'numeric' : 'decimal';
            insert(c, field, pill, msg);
            listen(c, pill, 'input', () => { if (validate(pill.value, false)) push(pill.value); });
            listen(c, pill, 'change', () => { validate(pill.value, true); push(pill.value); sync(); });
            sync = () => { if (document.activeElement !== pill) pill.value = range.value; };
        }
        function validate(v, final) {
            const n = Number(v); const bad = v === '' || !Number.isFinite(n) || n < min || n > max;
            const off = !bad && Math.abs((n - min) / step - Math.round((n - min) / step)) > 1e-6;
            const ctl = field.querySelector('.dc-pill, .dc-stepper input');
            if (bad || off) {
                if (ctl) ctl.setAttribute('aria-invalid', 'true');
                msg.dataset.tone = 'error';
                msg.innerHTML = I('warning') + esc(bad ? ('范围 ' + min + ' 到 ' + max + (final ? '，已按边界取值' : '')) : ('步长 ' + step + (final ? '，已对齐到最近的档位' : '')));
                return !bad && !off;
            }
            if (ctl) ctl.removeAttribute('aria-invalid');
            msg.textContent = ''; delete msg.dataset.tone;
            return true;
        }
        listen(c, range, 'input', () => sync());
        sync();
        setAttr(c, field, 'data-dc-kind', count <= 4 ? 'segmented' : (Number.isInteger(step) && step === 1 && count <= 12 ? 'stepper' : 'range'));
    }

    const VALIDATORS = [
        { match: (el) => el.id === 'ls-secondary-apis', check: (v) => { if (!v.trim()) return null; try { const o = JSON.parse(v); return (o && typeof o === 'object' && !Array.isArray(o)) ? null : '必须是 JSON 对象（形如 {"summarize": {...}}）'; } catch (e) { return 'JSON 解析失败：' + String(e.message || e).slice(0, 80) + '（保存时会保留原值）'; } } },
        { match: (el) => el.id === 'ls-pyramid-tiers', check: (v) => (v.split(/[,，\n]/).map((x) => x.trim()).filter(Boolean).length >= 3 ? null : '至少需要 3 层（保存时不足 3 层会保留原值）') },
        { match: (el) => /^(apiUrl|embeddingUrl)$/.test(el.dataset.cfgText || ''), check: (v) => (!v.trim() || /^https?:\/\/\S+$/i.test(v.trim()) ? null : '地址需要以 http:// 或 https:// 开头') },
        { match: (el) => /^(apiModel|embeddingModel)$/.test(el.dataset.cfgText || ''), check: (v) => (/\s/.test(v.trim()) ? '模型名里不应有空格' : null) },
    ];
    function attachValidator(c, field, el) {
        const v = VALIDATORS.find((x) => x.match(el)); if (!v || el.dataset.dcValidated) return;
        setAttr(c, el, 'data-dc-validated', '1');
        /* 字段行里放在行尾；散落在无类容器里的控件（如 #ls-custom-api-fields）紧跟在控件后面 */
        const msg = field ? (field.querySelector(':scope > .dc-msg') || insert(c, field, make('div', 'dc-msg'))) : insert(c, el.parentNode, make('div', 'dc-msg'), el.nextSibling);
        msg.setAttribute('role', 'status');
        const run = () => {
            const err = v.check(String(el.value || ''));
            if (err) { el.setAttribute('aria-invalid', 'true'); msg.dataset.tone = 'error'; msg.innerHTML = I('warning') + esc(err); }
            else { el.removeAttribute('aria-invalid'); msg.textContent = ''; delete msg.dataset.tone; }
        };
        listen(c, el, 'input', run); run();
        c.ops.push(() => el.removeAttribute('aria-invalid'));
    }

    function decorateRow(c, row) {
        const ctl = row.querySelector('input[data-cfg], input[data-cfg-text], select[data-cfg-text]');
        const k = keyOf(ctl);
        if (k) { const txt = row.querySelector(':scope > div'); if (txt) insert(c, txt, make('code', 'dc-key', esc(k))); setAttr(c, row, 'data-dc-key', k); }
        if (ctl && ctl.matches('input.ls-input')) attachValidator(c, row, ctl);
    }

    function wrapFields(c, container) {
        const kids = Array.from(container.children);
        let i = 0;
        while (i < kids.length) {
            const k = kids[i];
            if (k.matches('label.ls-row')) { decorateRow(c, k); i++; continue; }
            if (k.matches('.ls-slider-label')) {
                const nodes = [k]; let j = i + 1; let ctl = null; let hints = 0;
                while (j < kids.length) {
                    const n = kids[j];
                    if (STARTER(n)) break;
                    if (ctl) { if (n.matches('.ls-hint') && hints === 0) { nodes.push(n); hints++; j++; continue; } break; }
                    nodes.push(n); if (IS_CTL(n)) ctl = n; j++;
                }
                const field = wrap(c, nodes, make('div', 'dc-field'));
                const control = ctl && (ctl.matches('input, select, textarea') ? ctl : ctl.querySelector('input[type=range], select, textarea, input'));
                const kind = !control ? 'block' : control.matches('input[type=range]') ? 'range' : control.matches('textarea') ? 'textarea' : (ctl !== control ? 'block' : 'text');
                field.classList.add('dc-field--' + kind);
                const ck = keyOf(control) || (control && control.id ? '#' + control.id : '');
                if (ck) { setAttr(c, field, 'data-dc-key', ck); insert(c, field, make('code', 'dc-key', esc(ck))); }
                if (kind === 'range') enhanceRange(c, field, control);
                if (control && kind !== 'range') attachValidator(c, field, control);
                i = j; continue;
            }
            if (k.matches('.ls-hint, p.ls-hint') && container.classList.contains('ls-group')) { addClass(c, k, 'dc-note'); i++; continue; }
            if (k.tagName === 'BUTTON' && k.classList.contains('ls-btn')) {
                const nodes = [k]; let j = i + 1;
                while (j < kids.length && kids[j].tagName === 'BUTTON' && kids[j].classList.contains('ls-btn')) { nodes.push(kids[j]); j++; }
                wrap(c, nodes, make('div', 'dc-actions'));
                i = j; continue;
            }
            if (k.matches('details')) wrapFields(c, k);
            if (k.matches('div') && !k.className && k.querySelector(':scope > .ls-slider-label')) wrapFields(c, k);
            i++;
        }
    }

    /* ------------------------------------------------------------------
     * 设置面板：控制台骨架
     * ------------------------------------------------------------------ */
    function sideHTML(build) {
        return '<aside class="dc-side" aria-label="开发者设置分区">'
            + '<label class="dc-search">' + I('search') + '<input type="search" data-dc-search placeholder="搜索设置或配置键" autocomplete="off" spellcheck="false" aria-label="搜索设置"><kbd>/</kbd></label>'
            + '<div class="dc-search-result" data-dc-result role="status" aria-live="polite"></div>'
            + '<div class="dc-nav-label">分区</div>'
            + '<ul class="dc-nav" role="list">' + SECTIONS.map((s) => '<li><button type="button" class="dc-nav-item" data-dc-section="' + s.id + '"' + (s.build !== build ? ' data-remote="1" title="位于另一组面板，切换时会重新打开"' : '') + '>'
                + I(s.icon) + '<span>' + esc(s.title) + '</span><span class="dc-nav-meta"><span class="dc-dirty-dot" aria-hidden="true"></span><span data-dc-count></span></span></button></li>').join('') + '</ul>'
            + '<div class="dc-side-foot"><label><span>显示配置键</span><input type="checkbox" data-dc-keys></label>'
            + '<span class="dc-kbd-hint"><kbd>/</kbd> 搜索 · <kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>S</kbd> 保存</span></div>'
            + '</aside>';
    }
    function headHTML() {
        return '<header class="dc-head"><h2 class="dc-head-title" data-dc-title></h2><p class="dc-head-desc" data-dc-desc></p>'
            + '<div class="dc-head-tools"><span class="dc-badge" data-dc-total></span><span class="dc-badge" data-tone="warn" data-dc-dirtyn hidden></span>'
            + '<button type="button" class="ls-btn ls-btn-sm" data-dc-act="reset-section">' + I('reset') + '<span>恢复默认</span></button></div>'
            + '<div class="dc-confirm" data-dc-confirm hidden role="alertdialog" aria-live="assertive"><span class="dc-confirm-text"></span>'
            + '<button type="button" class="ls-btn ls-btn-sm ls-btn-primary" data-dc-act="reset-confirm">恢复默认</button><button type="button" class="ls-btn ls-btn-sm" data-dc-act="reset-cancel">取消</button></div></header>';
    }

    function controlsOf(scope) { return Array.from(scope.querySelectorAll('[data-cfg], [data-cfg-num], [data-cfg-text]')); }
    function isDirty(el) {
        const c0 = cfg();
        if (el.dataset.cfg) return !!c0[el.dataset.cfg] !== !!el.checked;
        if (el.dataset.cfgNum) { const raw = parseFloat(el.value); if (!Number.isFinite(raw)) return false; const st = parseFloat(el.step) || 1; const v = Number.isInteger(st) ? Math.round(raw) : raw; const cur = Number(c0[el.dataset.cfgNum]); return !Number.isFinite(cur) || cur !== v; }
        if (el.dataset.cfgText) { const k = el.dataset.cfgText; const b = (c0[k] === undefined || c0[k] === null) ? '' : String(c0[k]); return b !== String(el.value).trim(); }
        return false;
    }
    const valueOf = (el) => (el.dataset.cfg ? String(!!el.checked) : String(el.value));
    const savedOf = (el) => { const c0 = cfg(); const k = keyOf(el); return el.dataset.cfg ? String(!!c0[k]) : (c0[k] == null ? '' : String(c0[k])); };

    function enhanceSettings(ov, opts) {
        if (ROOTS.has(ov)) return;
        const nav = ov.querySelector('.ls-tabs-nav'); if (!nav) return;
        const host = nav.parentElement;
        const panes = Array.from(host.querySelectorAll(':scope > .ls-tab-pane'));
        if (!panes.length) return;
        const c = ctxOf(ov, 'settings');
        const build = panes.some((p) => p.dataset.tabPane === 'advanced' || p.dataset.tabPane === 'retrieval') ? 'diag' : 'player';
        const sheet = ov.querySelector('.lonsha-sheet');
        setAttr(c, ov, 'data-ls-dc', '3');
        if (sheet) addClass(c, sheet, 'dc-sheet');
        normalizeInline(c, ov);

        const dc = make('div', 'dc'); dc.dataset.dcBuild = build; dc.dataset.dcActive = '1';
        if (store.get(KEYS_KEY, '0') === '1') dc.dataset.dcKeys = '1';
        dc.innerHTML = sideHTML(build) + '<div class="dc-main">' + headHTML() + '<div class="dc-panes"></div>'
            + '<div class="dc-empty">' + I('search') + '<span>没有匹配的设置。可以试试中文名称、说明里的词，或配置键（如 vectorTopK）。</span></div></div>';
        insert(c, host, dc, nav);
        const box = dc.querySelector('.dc-panes');
        move(c, nav, box);
        panes.forEach((p) => { move(c, p, box); const s = SECTIONS.find((x) => x.id === p.dataset.tabPane); if (s) setAttr(c, p, 'data-dc-title', s.title); });
        const footer = host.querySelector(':scope > .ls-settings-footer');
        if (footer) { move(c, footer, box); addClass(c, footer, 'ls-group'); }

        /* 分区级折叠（玩家面的渐进披露）在控制台里一律展开：开发者需要一眼看到全部参数；退出时恢复原状 */
        panes.forEach((p) => {
            const tops = Array.from(p.querySelectorAll(':scope > details'));
            tops.concat(...tops.map((d) => Array.from(d.querySelectorAll(':scope > details')))).forEach((d) => {
                if (d.open) return; d.open = true; c.ops.push(() => { d.open = false; });
            });
        });

        /* 字段包裹 */
        panes.forEach((p) => { p.querySelectorAll('.ls-group').forEach((g) => wrapFields(c, g)); Array.from(p.querySelectorAll(':scope > details')).forEach((d) => wrapFields(c, d)); });
        if (footer) wrapFields(c, footer);

        /* 其余带校验规则的控件（不在字段行 / 开关行里的，例如自定义接口地址） */
        controlsOf(dc).concat(Array.from(dc.querySelectorAll('textarea[id], input[id]'))).forEach((el) => { if (!el.dataset.dcValidated) attachValidator(c, el.closest('.dc-field, .ls-row'), el); });

        /* 开发者读数：等宽查看器 + 复制 */
        const devBody = ov.querySelector('#ls-health-dev-body');
        if (devBody) {
            const frame = make('div', 'dc-code');
            const bar = codeBar('开发者读数', '注入回执 / 模块定性 / 真机判定', [{ act: 'copy-dev', icon: 'copy', label: '复制' }]);
            wrap(c, [devBody], frame);
            insert(c, frame, bar, devBody);
            addClass(c, devBody, 'dc-code-body');
            listen(c, bar, 'click', (e) => { if (e.target.closest('[data-dc-act="copy-dev"]')) copyText(devBody.textContent || '', e.target.closest('button')); });
        }

        /* 保存栏：键盘提示 + 改动表 + 提示行 */
        const bar = ov.querySelector('.ls-dirtybar');
        let pending = null, flash = null;
        if (bar) {
            const save = bar.querySelector('#ls-save');
            if (save) insert(c, bar, make('span', 'dc-kbd', '<kbd>Ctrl</kbd>/<kbd>Cmd</kbd>+<kbd>S</kbd>'), save);
            flash = insert(c, bar, make('div', 'dc-flash')); flash.setAttribute('role', 'status');
            pending = insert(c, bar, make('div', 'dc-pending')); pending.hidden = true;
            const cnt = bar.querySelector('#ls-dirty-count');
            if (cnt) {
                setAttr(c, cnt, 'role', 'button'); setAttr(c, cnt, 'tabindex', '0'); setAttr(c, cnt, 'aria-expanded', 'false'); setAttr(c, cnt, 'title', '查看待保存的改动');
                const toggle = () => { if (bar.dataset.dirty !== '1') return; pending.hidden = !pending.hidden; cnt.setAttribute('aria-expanded', String(!pending.hidden)); if (!pending.hidden) renderPending(); };
                listen(c, cnt, 'click', toggle);
                listen(c, cnt, 'keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
            }
        }
        function renderPending() {
            if (!pending) return;
            const rows = controlsOf(dc).filter(isDirty).map((el) => '<tr><td>' + esc(keyOf(el)) + '</td><td><del>' + esc(savedOf(el)).slice(0, 120) + '</del></td><td><ins>' + esc(valueOf(el)).slice(0, 120) + '</ins></td></tr>');
            pending.innerHTML = rows.length ? '<table class="dc-kv"><thead><tr><th>配置键</th><th>已保存</th><th>当前</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>' : '';
            if (!rows.length) pending.hidden = true;
        }
        const say = (t) => { if (flash) { flash.textContent = t; clearTimeout(flash._t); flash._t = setTimeout(() => { flash.textContent = ''; }, 4200); } };

        /* 分区切换 */
        const btnOf = (id) => nav.querySelector('.ls-tab-btn[data-tab="' + id + '"]');
        const activePane = () => box.querySelector(':scope > .ls-tab-pane.active') || panes[0];
        function renderHead() {
            const p = activePane(); const s = SECTIONS.find((x) => x.id === (p && p.dataset.tabPane)) || SECTIONS[0];
            dc.querySelector('[data-dc-title]').textContent = s.title;
            dc.querySelector('[data-dc-desc]').textContent = s.desc;
            const all = p ? controlsOf(p) : [];
            dc.querySelector('[data-dc-total]').textContent = all.length ? (all.length + ' 项设置') : '只读';
            const nd = all.filter(isDirty).length;
            const dn = dc.querySelector('[data-dc-dirtyn]'); dn.hidden = nd === 0; dn.textContent = '已修改 ' + nd;
            const rs = dc.querySelector('[data-dc-act="reset-section"]');
            rs.hidden = all.length === 0;
            rs.disabled = !defaults() || all.length === 0;
            rs.title = !defaults() ? '读不到默认值模板（宿主尚未提供），无法恢复默认' : '把本分区的设置改回默认值（保存后生效）';
            dc.querySelectorAll('.dc-nav-item').forEach((b) => { const on = b.dataset.dcSection === s.id; if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
        }
        function renderNav() {
            SECTIONS.forEach((s) => {
                const b = dc.querySelector('.dc-nav-item[data-dc-section="' + s.id + '"]'); if (!b) return;
                const p = panes.find((x) => x.dataset.tabPane === s.id);
                const all = p ? controlsOf(p) : null;
                b.querySelector('[data-dc-count]').textContent = all && all.length ? String(all.length) : '';
                b.dataset.dirty = all && all.some(isDirty) ? '1' : '0';
            });
        }
        function markDirty() {
            controlsOf(dc).forEach((el) => {
                const row = el.closest('.dc-field, .ls-row'); if (!row) return;
                const d = isDirty(el); if (d) row.dataset.dcDirty = '1'; else delete row.dataset.dcDirty;
            });
            renderNav(); renderHead();
            if (pending && !pending.hidden) renderPending();
        }
        c.ops.push(() => dc.querySelectorAll('[data-dc-dirty]').forEach((n) => delete n.dataset.dcDirty));
        let raf = 0; const schedule = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; markDirty(); }); };
        listen(c, dc, 'input', schedule); listen(c, dc, 'change', schedule);
        if (bar) { const sv = bar.querySelector('#ls-save'); if (sv) listen(c, sv, 'click', () => setTimeout(markDirty, 60)); const rs = bar.querySelector('#ls-dirty-reset'); if (rs) listen(c, rs, 'click', () => setTimeout(markDirty, 30)); }

        function go(id) {
            const s = SECTIONS.find((x) => x.id === id); if (!s) return;
            clearSearch();
            if (s.build === build) { const b = btnOf(id); if (b && b.getAttribute('aria-selected') !== 'true') b.click(); renderHead(); return; }
            const n = controlsOf(dc).filter(isDirty).length;
            if (n > 0) { say('还有 ' + n + ' 项未保存：先保存或还原，再切换到「' + s.title + '」（它在另一组面板里，切换会重新打开面板）。'); return; }
            const jump = ov.querySelector(build === 'player' ? '#ls-diag-entry' : '#ls-diag-back');
            if (!jump) { say('找不到切换入口，无法打开「' + s.title + '」。'); return; }
            store.sset(TARGET_KEY, id);
            jump.click();
        }
        listen(c, dc.querySelector('.dc-nav'), 'click', (e) => { const b = e.target.closest('.dc-nav-item'); if (b) go(b.dataset.dcSection); });
        listen(c, dc.querySelector('.dc-nav'), 'keydown', (e) => {
            if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
            const list = Array.from(dc.querySelectorAll('.dc-nav-item')); let i = list.indexOf(document.activeElement); if (i < 0) return;
            e.preventDefault(); e.stopPropagation();
            if (e.key === 'Home') i = 0; else if (e.key === 'End') i = list.length - 1; else i = (i + ((e.key === 'ArrowDown' || e.key === 'ArrowRight') ? 1 : -1) + list.length) % list.length;
            list[i].focus();
        });
        nav.querySelectorAll('.ls-tab-btn').forEach((b) => listen(c, b, 'click', () => setTimeout(renderHead, 0)));

        /* 恢复默认（只改控件，不写 config） */
        const confirm = dc.querySelector('[data-dc-confirm]');
        listen(c, dc.querySelector('.dc-head'), 'click', (e) => {
            const a = e.target.closest('[data-dc-act]'); if (!a) return;
            const p = activePane(); const s = SECTIONS.find((x) => x.id === (p && p.dataset.tabPane));
            const d = defaults();
            if (a.dataset.dcAct === 'reset-section') {
                if (!d || !p) return;
                const diff = controlsOf(p).filter((el) => Object.prototype.hasOwnProperty.call(d, keyOf(el)) && String(el.dataset.cfg ? !!d[keyOf(el)] : (d[keyOf(el)] == null ? '' : d[keyOf(el)])) !== valueOf(el));
                confirm.querySelector('.dc-confirm-text').textContent = diff.length
                    ? ('把「' + (s ? s.title : '') + '」中 ' + diff.length + ' 项改回默认值？只改面板里的控件，点「保存」后才生效。')
                    : ('「' + (s ? s.title : '') + '」的设置都已经是默认值。');
                confirm.querySelector('[data-dc-act="reset-confirm"]').hidden = diff.length === 0;
                confirm.hidden = false;
                confirm._diff = diff;
            } else if (a.dataset.dcAct === 'reset-cancel') {
                confirm.hidden = true;
            } else if (a.dataset.dcAct === 'reset-confirm') {
                const diff = confirm._diff || [];
                diff.forEach((el) => {
                    const v = d[keyOf(el)];
                    if (el.dataset.cfg) { el.checked = !!v; el.dispatchEvent(new Event('change', { bubbles: true })); }
                    else { el.value = v == null ? '' : String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
                });
                confirm.hidden = true;
                try { plugin()?.lsToast?.('success', '已把 ' + diff.length + ' 项改回默认值，保存后生效'); } catch (_) { /* toast 是旁路 */ }
                markDirty();
            }
        });

        /* 设置内搜索 */
        const sIn = dc.querySelector('[data-dc-search]'); const sOut = dc.querySelector('[data-dc-result]');
        const openedBySearch = new Set();
        function clearSearch() { if (sIn.value) { sIn.value = ''; runSearch(); } }
        function runSearch() {
            const q = sIn.value.trim().toLocaleLowerCase();
            dc.querySelectorAll('.dc-hit, .dc-miss').forEach((n) => n.classList.remove('dc-hit', 'dc-miss'));
            if (!q) {
                delete dc.dataset.dcSearching; delete dc.dataset.dcEmpty;
                openedBySearch.forEach((d) => { d.open = false; }); openedBySearch.clear();
                sOut.textContent = ''; return;
            }
            dc.dataset.dcSearching = '1';
            let hits = 0; const paneHit = new Set();
            const items = dc.querySelectorAll('.dc-panes .ls-row, .dc-panes .dc-field, .dc-panes .dc-actions, .dc-panes .ls-player-actions, .dc-panes .ls-health-card, .dc-panes .dc-note');
            items.forEach((it) => {
                const hay = ((it.textContent || '') + ' ' + (it.dataset.dcKey || '')).toLocaleLowerCase();
                const ok = !it.classList.contains('dc-note') && hay.includes(q);
                it.classList.add(ok ? 'dc-hit' : 'dc-miss');
                if (ok) { hits++; const p = it.closest('.ls-tab-pane'); if (p) paneHit.add(p); let d = it.closest('details'); while (d) { if (!d.open) { d.open = true; openedBySearch.add(d); } d = d.parentElement && d.parentElement.closest('details'); } }
            });
            dc.querySelectorAll('.dc-panes .ls-group').forEach((g) => {
                const titleHit = (g.querySelector(':scope > .ls-group-title')?.textContent || '').toLocaleLowerCase().includes(q);
                if (titleHit) { g.querySelectorAll('.dc-miss').forEach((n) => { if (!n.classList.contains('dc-note')) n.classList.remove('dc-miss'); }); const p = g.closest('.ls-tab-pane'); if (p) paneHit.add(p); hits += g.querySelectorAll('.ls-row, .dc-field').length ? 0 : 1; }
                if (!titleHit && !g.querySelector('.dc-hit')) g.classList.add('dc-miss');
            });
            dc.querySelectorAll('.dc-panes details').forEach((d) => { if (!d.querySelector('.dc-hit') && !d.closest('.dc-miss')) d.classList.add('dc-miss'); });
            panes.forEach((p) => { if (!paneHit.has(p)) p.classList.add('dc-miss'); });
            const other = SECTIONS.filter((s) => s.build !== build).map((s) => s.title).join('、');
            dc.dataset.dcEmpty = hits === 0 ? '1' : '0';
            sOut.dataset.state = hits ? 'ok' : 'empty';
            sOut.textContent = hits ? ('匹配 ' + hits + ' 项 · ' + paneHit.size + ' 个分区') + (other ? '（' + other + '需切换后搜索）' : '') : '没有匹配项';
        }
        listen(c, sIn, 'input', runSearch);
        listen(c, sIn, 'keydown', (e) => { if (e.key === 'Escape' && sIn.value) { e.preventDefault(); e.stopPropagation(); clearSearch(); } });
        c.ops.push(() => { openedBySearch.forEach((d) => { d.open = false; }); });
        const keysBox = dc.querySelector('[data-dc-keys]'); keysBox.checked = dc.dataset.dcKeys === '1';
        listen(c, keysBox, 'change', () => { store.set(KEYS_KEY, keysBox.checked ? '1' : '0'); if (keysBox.checked) dc.dataset.dcKeys = '1'; else delete dc.dataset.dcKeys; });

        /* 键盘：/ 聚焦搜索；Ctrl/Cmd+S 保存 */
        listen(c, ov, 'keydown', (e) => {
            const typing = e.target && e.target.matches && e.target.matches('input, textarea, select, [contenteditable="true"]');
            if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); sIn.focus(); return; }
            if ((e.metaKey || e.ctrlKey) && (e.key === 's' || e.key === 'S')) { const sv = ov.querySelector('#ls-save'); if (sv) { e.preventDefault(); sv.click(); } }
        });

        /* 打开时定位到目标分区（从另一组面板跳过来） */
        const target = store.sget(TARGET_KEY); store.sset(TARGET_KEY, null);
        if (target && panes.some((p) => p.dataset.tabPane === target)) { const b = btnOf(target); if (b) b.click(); }
        markDirty();
        observe(c, ov, () => normalizeInline(c, ov));
        if (opts && opts.focusSearch) sIn.focus();
    }

    /* ------------------------------------------------------------------
     * 其他面板：诊断页 / 注入预览 / 记忆控制中心 / 总览 / 可视化
     * ------------------------------------------------------------------ */
    function enhancePage(ov) {
        if (ROOTS.has(ov)) { decoratePage(ROOTS.get(ov), ov); return; }
        const body = ov.querySelector('.lonsha-sheet-body'); if (!body) return;
        const c = ctxOf(ov, 'page');
        setAttr(c, ov, 'data-ls-dc', '3');
        addClass(c, body, 'dc-page');
        decoratePage(c, ov);
        observe(c, ov, () => decoratePage(c, ov));
    }
    function decoratePage(c, ov) {
        normalizeInline(c, ov);
        const body = ov.querySelector('.lonsha-sheet-body'); if (!body) return;
        /* 诊断页：严重度汇总 + 日志复制 */
        const dg = body.querySelector('.ls-dg');
        if (dg && !dg.querySelector('.dc-chips')) {
            const n = (sev) => dg.querySelectorAll('.ls-dg-check[data-sev="' + sev + '"]').length;
            const errs = dg.querySelectorAll('.ls-dg-log-row').length;
            const chip = (label, count, tone) => '<span class="dc-badge"' + (count > 0 && tone ? ' data-tone="' + tone + '"' : '') + '>' + label + ' ' + count + '</span>';
            const chips = make('div', 'dc-chips', chip('正常', n('ok'), 'ok') + chip('注意', n('warn'), 'warn') + chip('严重', n('crit'), 'err') + chip('错误记录', errs, errs ? 'err' : ''));
            insert(c, dg, chips, dg.firstChild);
            const log = dg.querySelector('.ls-dg-logbox');
            if (log) {
                const bar = codeBar('最近错误', '环形缓冲 · 最多 50 条', [{ act: 'copy-log', icon: 'copy', label: '复制' }]);
                insert(c, log.parentNode, bar, log);
                listen(c, bar, 'click', (e) => { const b = e.target.closest('[data-dc-act="copy-log"]'); if (b) copyText(Array.from(log.querySelectorAll('.ls-dg-log-row')).map((r) => r.textContent.replace(/\s+/g, ' ').trim()).join('\n') || '无错误记录', b); });
            }
        }
        /* 注入预览：预算计量 + 载荷代码视图 */
        const pay = body.querySelector('[data-inj-payload]');
        if (pay && !body.querySelector('.dc-meter-card')) {
            const eng = plugin()?.engine || {};
            const bs = eng._lastBudgetStats || null; const inj = eng._lastInjection || null;
            const rows = [];
            /* higherIsBetter=false：预算占用（越满越危险，85% 起黄、98% 起红）；true：块留存（越全越好，低于 90% 黄、低于 50% 红） */
            const meter = (label, used, cap, extra, higherIsBetter) => {
                if (!Number.isFinite(Number(used)) || !Number(cap)) return '';
                const pct = Math.round((Number(used) / Number(cap)) * 100);
                const sem = higherIsBetter
                    ? ' low="' + (cap * 0.5) + '" high="' + (cap * 0.9) + '" optimum="' + Number(cap) + '"'
                    : ' low="' + Math.round(cap * 0.85) + '" high="' + Math.round(cap * 0.98) + '" optimum="0"';
                return '<div class="dc-meter-row"><span>' + esc(label) + '</span><meter class="dc-meter" min="0" max="' + Number(cap) + '"' + sem + ' value="' + Math.min(Number(used), Number(cap)) + '"></meter>'
                    + '<span class="dc-meter-val">' + fmtNum(used) + ' / ' + fmtNum(cap) + ' · ' + pct + '%' + (extra ? ' · ' + esc(extra) : '') + '</span></div>';
            };
            if (bs) {
                rows.push(meter('字符预算', bs.afterChars, bs.requested, bs.droppedChars ? ('丢弃 ' + fmtNum(bs.droppedChars)) : ''));
                if (bs.tokenBudget) rows.push(meter('Token 预算', bs.tokens, bs.tokenBudget, '估算'));
                if (Number.isFinite(bs.keptBlocks) && bs.totalBlocks) rows.push(meter('块留存', bs.keptBlocks, bs.totalBlocks, Number.isFinite(bs.partialBlocks) && bs.partialBlocks ? ('切半 ' + bs.partialBlocks) : '', true));
            }
            const chips = [];
            if (inj) {
                if (inj.round != null) chips.push('<span class="dc-badge">第 ' + esc(inj.round) + ' 轮</span>');
                const oc = String(inj.outcome || 'pending');
                chips.push('<span class="dc-badge" data-tone="' + (oc === 'completed' ? 'ok' : oc === 'aborted' ? 'warn' : '') + '">' + (oc === 'completed' ? '已完成' : oc === 'aborted' ? '被中止' : '结局未定') + '</span>');
                if (inj.ts) chips.push('<span class="dc-badge">' + esc(new Date(inj.ts).toLocaleTimeString('zh-CN')) + '</span>');
                if (bs && bs.strategy) chips.push('<span class="dc-badge">策略 ' + esc(bs.strategy) + '</span>');
            }
            const card = make('div', 'ls-item dc-meter-card', '<div class="ls-group-title">' + I('gauge') + '注入预算</div>' + (chips.length ? '<div class="dc-chips">' + chips.join('') + '</div>' : '')
                + (rows.filter(Boolean).join('') || '<div class="ls-hint">本轮没有预算读数（回执缺席或尚未生成）——不等于「没超预算」。</div>'));
            insert(c, body.firstElementChild || body, card, (body.firstElementChild || body).firstChild);
            /* 载荷：代码视图（行号 + 新增行标记） */
            const lines = pay.querySelectorAll('[data-inj-line]');
            const frame = make('div', 'dc-code-body');
            wrap(c, Array.from(pay.childNodes), frame);
            const nNew = pay.querySelectorAll('[data-inj-line="new"]').length;
            const bar = codeBar('载荷（AI 实际所见）', lines.length + ' 行 · ' + fmtNum(inj && inj.html ? inj.html.length : 0) + ' 字符' + (nNew ? ' · 新增 ' + nNew : ''),
                [{ act: 'only-new', icon: 'diff', label: '只看新增', pressed: false }, { act: 'copy-payload', icon: 'copy', label: '复制' }]);
            insert(c, pay, bar, frame);
            listen(c, bar, 'click', (e) => {
                const b = e.target.closest('[data-dc-act]'); if (!b) return;
                if (b.dataset.dcAct === 'copy-payload') copyText(inj && inj.html ? inj.html : frame.textContent, b);
                if (b.dataset.dcAct === 'only-new') { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); if (on) body.dataset.dcOnlyNew = '1'; else delete body.dataset.dcOnlyNew; }
            });
            c.ops.push(() => delete body.dataset.dcOnlyNew);
        }
        /* JSON 片段：<pre> 里能整体解析成 JSON 的，加高亮与复制 */
        body.querySelectorAll('pre:not([data-dc-json])').forEach((pre) => {
            const t = pre.textContent || ''; if (t.length > 200000) return;
            const h = jsonHTML(t.trim()); if (!h) return;
            setAttr(c, pre, 'data-dc-json', '1');
            const orig = pre.innerHTML; pre.innerHTML = h; c.ops.push(() => { pre.innerHTML = orig; });
            addClass(c, pre, 'dc-code-body');
            const frame = wrap(c, [pre], make('div', 'dc-code'));
            const bar = codeBar('JSON', fmtNum(t.length) + ' 字符', [{ act: 'copy-json', icon: 'copy', label: '复制' }]);
            insert(c, frame, bar, pre);
            listen(c, bar, 'click', (e) => { const b = e.target.closest('[data-dc-act="copy-json"]'); if (b) copyText(t, b); });
        });
    }
    function enhanceViz(panel) {
        if (ROOTS.has(panel)) return;
        const c = ctxOf(panel, 'viz');
        setAttr(c, panel, 'data-ls-dc', '3');
        const close = panel.querySelector('.lonsha-viz-close');
        if (close && !close.querySelector('.ls-ico')) {
            const orig = close.innerHTML; close.innerHTML = I('xmark');
            setAttr(c, close, 'aria-label', '关闭');
            c.ops.push(() => { close.innerHTML = orig; });
        }
        normalizeInline(c, panel);
        observe(c, panel, () => normalizeInline(c, panel));
    }
    function observe(c, root, fn) {
        if (typeof MutationObserver !== 'function') return;
        let pendingRaf = 0;
        c.observer = new MutationObserver(() => {
            if (c.busy || pendingRaf) return;
            pendingRaf = requestAnimationFrame(() => { pendingRaf = 0; c.busy = true; try { fn(); } catch (e) { warn('observe', e); } finally { c.busy = false; } });
        });
        c.observer.observe(root, { childList: true, subtree: true });
    }

    /* ------------------------------------------------------------------
     * 分发：决定一个弹层用哪种增强
     * ------------------------------------------------------------------ */
    function shellView(ov) { const d = ov.querySelector('.ls-dash'); return d ? (d.dataset.view || '') : null; }
    function apply(node) {
        if (!node || node.nodeType !== 1 || !isOn()) return;
        if (!cssReady()) { if (!apply._warned) { apply._warned = true; console.info('[LonSha] 开发者控制台 v3.1 未启用：需要 css/dashboard.css 与 css/dev-console-v3.css 都已加载'); } return; }
        neutralizeLegacyStyle();
        if (node.id === 'lonsha-viz-panel') { enhanceViz(node); return; }
        if (!node.classList.contains('lonsha-overlay')) return;
        if (node.id === 'lonsha-settings-overlay') {
            const v = shellView(node);
            if (v === null || v === 'dev') enhanceSettings(node); else restore(node);   // 外壳的「设置」视图是玩家面，交给 dashboard v3
            return;
        }
        if (/^lonsha-(diag|browser|stats|lineage|ckpt)-overlay$/.test(node.id)) enhancePage(node);
    }
    function applyAll() {
        document.querySelectorAll('.lonsha-overlay, #lonsha-viz-panel').forEach((n) => { try { apply(n); } catch (e) { warn('apply', e); } });
    }
    function restoreAll() { Array.from(ROOTS.keys()).forEach((r) => restore(r)); }

    const bodyObserver = typeof MutationObserver === 'function' ? new MutationObserver((list) => {
        list.forEach((m) => m.addedNodes.forEach((n) => { try { apply(n); } catch (e) { warn('added', e); } }));
        ROOTS.forEach((_, r) => { if (!r.isConnected) ROOTS.delete(r); });
    }) : null;
    function start() {
        if (bodyObserver && document.body) bodyObserver.observe(document.body, { childList: true });
        /* 外壳视图切换：进入「开发者」才排成控制台，离开即还原 */
        document.addEventListener('ls-dash:view', (e) => {
            const dash = e.target; const ov = dash && dash.closest ? dash.closest('#lonsha-settings-overlay') : null;
            if (!ov || !isOn()) return;
            if (e.detail && e.detail.view === 'dev') { try { apply(ov); } catch (err) { warn('view', err); } } else restore(ov);
        }, true);
        /* 宿主守卫：判据用假窗口（可能没有 addEventListener），控制台缺席不该让外壳跟着崩。 */
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('lonsha:dashboard-enhanced', (e) => { const ov = e.detail && e.detail.overlay; if (ov) setTimeout(() => apply(ov), 0); });
            window.addEventListener('storage', (e) => { if (e.key === KEY) { if (isOn()) applyAll(); else restoreAll(); } });
        }
        applyAll();
    }

    window.LonShaDevConsole = {
        VERSION,
        isEnabled: isOn,
        /** 开 / 关开发者控制台（与 dashboard v3 精修外观同一个开关 lonsha.ui.v3），即时作用于已打开的面板 */
        enable(on = true) {
            store.set(KEY, on ? '1' : '0');
            try { window.LonShaDashboardV2?.enableV3?.(!!on); } catch (_) { /* v2 未安装时忽略 */ }
            if (on) applyAll(); else restoreAll();
            return isOn();
        },
        refresh() { restoreAll(); applyAll(); },
        _internals: { normalizeInline, parseDecls, toneOf, jsonHTML, SECTIONS, ROOTS },
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
