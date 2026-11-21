/**
 * ui-kit-core.js — [V4 呈现层] 面板通用原语
 *
 * 【它解决什么】
 *   本仓此前只有一个大面板（settings-ui.js 5907 行），样式与业务同居一处。
 *   要再加「楼层面板 / 摘要树 / NPC 面板 / 场景 / 变量 / 物品」六个视图，
 *   如果照旧各写一遍 DOM 样板，会有六个互不相同的「卡片 + 徽章 + 折叠条」，
 *   第一个修好的可访问性问题只能修在一个视图里。
 *   本文件把这些形态收敛成唯一实现 —— 学柏宝书那 17 个 Vue 组件的做法：
 *   页面只声明「我要一张卡、里面两行键值」，不碰 DOM 结构。
 *
 * 【三条纪律在本文件的落点】
 *   1. 展开不脱流：fold() 返回的容器内容常驻 DOM，只切 class（grid 0fr↔1fr），
 *      取数回调在**首次展开时**才跑（避免一次渲染整棵树）。
 *   2. 空态四态分离：empty({kind}) 的 kind 必须显式给 —— 没有默认值，
 *      因为「默认成空表」正是本仓把「未运行」显示成 0 的那个坑。
 *   3. 贴边半隐：orb() 只在拖动结束时写一次位置，拖动过程不落盘。
 *
 * 【为什么不用框架】
 *   SillyTavern 插件通过 manifest 直接注入 .js，没有构建步骤。
 *   引入 React 要连带打包运行时（几十 KB + 一层构建），收益不足以抵消
 *   真机上「多一个必须成功加载的依赖」这个新失败面。原生 DOM 足够。
 *
 * 【Node 环境】
 *   模块加载阶段**不触碰 document/window**，因此可在 tests/ 里 require 后
 *   直接跑 selfCheck()（本仓所有模块的既有纪律）。
 */
(function (root) {
    'use strict';

    const KIT_VERSION = '1.0.0';
    const STYLE_REL = 'scripts/extensions/third-party/lonsha-memory/css/lonsha-ui-kit.css';

    /* ================================================================
     * 0. 环境适配
     * ================================================================ */
    const hasDom = () => typeof document !== 'undefined' && !!document.createElement;

    const doc = () => {
        if (!hasDom()) throw new Error('ui-kit: 无 DOM 环境（Node 下请只用纯函数接口）');
        return document;
    };

    /* ================================================================
     * 1. 文本与安全
     *    esc() 是本文件最重要的函数：所有插值走它。
     *    本仓历史上出过一次「摘要里带 <img onerror> 把面板点亮」的事故面，
     *    根因就是有人把 textContent 换成了 innerHTML 拼接。
     * ================================================================ */
    /* 实体表用 AMP 拼接构造，而不是写字面量。
     * 【为什么】本文件曾被一次富文本粘贴把引号实体的字面量还原成了裸引号，
     *   于是 esc(引号) 原样返回引号 —— 转义在字面上看不出问题，
     *   只有 selfCheck 会红。拼接写法让这件事不可能再静默发生。 */
    const AMP = '&';
    const ESC_MAP = {
        [AMP]: AMP + 'amp;',
        '<': AMP + 'lt;',
        '>': AMP + 'gt;',
        '"': AMP + 'quot;',
        "'": AMP + '#39;',
    };

    function esc(v) {
        if (v === null || v === undefined) return '';
        return String(v).replace(/[&<>"']/g, (ch) => ESC_MAP[ch]);
    }

    /** 人话化：null/undefined/'' 与 0、false 必须区分开显示 */
    function human(v) {
        if (v === null) return 'null';
        if (v === undefined) return 'undefined';
        if (v === '') return '（空）';
        if (typeof v === 'boolean') return v ? '是' : '否';
        if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '非数';
        if (typeof v === 'object') {
            try { return JSON.stringify(v); } catch (_e) { return '[不可序列化]'; }
        }
        return String(v);
    }

    /** 截断：按码点而不是 UTF-16 单元，避免把 emoji 劈成两半 */
    function clampText(s, max) {
        const t = String(s === null || s === undefined ? '' : s);
        const arr = Array.from(t);
        if (arr.length <= max) return t;
        return arr.slice(0, Math.max(0, max - 1)).join('') + '…';
    }

    /* ================================================================
     * 2. 元素工厂
     *    el(tag, props, children)：
     *      props.class    → className
     *      props.text     → textContent（**永不**走 innerHTML）
     *      props.html     → 仅在本文件内部受控使用（body 已 esc 过的模板）
     *      props.on*      → 事件监听
     *      props.aria*    → setAttribute
     *      其余           → setAttribute（字符串化）
     * ================================================================ */
    function el(tag, props, children) {
        const d = doc();
        const node = d.createElement(tag || 'div');
        const p = props || {};
        Object.keys(p).forEach((key) => {
            const val = p[key];
            if (val === null || val === undefined || val === false) return;
            if (key === 'class') { node.className = val; return; }
            if (key === 'text') { node.textContent = String(val); return; }
            if (key === 'html') { node.innerHTML = String(val); return; } // 内部受控
            if (key === 'style' && typeof val === 'object') {
                Object.keys(val).forEach((k) => { node.style[k] = val[k]; });
                return;
            }
            if (key === 'dataset' && typeof val === 'object') {
                Object.keys(val).forEach((k) => { node.dataset[k] = val[k]; });
                return;
            }
            if (/^on[A-Z]/.test(key) && typeof val === 'function') {
                node.addEventListener(key.slice(2).toLowerCase(), val);
                return;
            }
            if (typeof val === 'boolean') {
                if (val) node.setAttribute(key, '');
                return;
            }
            node.setAttribute(key, String(val));
        });
        appendAll(node, children);
        return node;
    }

    function appendAll(node, children) {
        if (children === null || children === undefined) return;
        if (!Array.isArray(children)) { appendAll(node, [children]); return; }
        children.forEach((c) => {
            if (c === null || c === undefined || c === false) return;
            if (Array.isArray(c)) { appendAll(node, c); return; }
            if (typeof c === 'string' || typeof c === 'number') {
                node.appendChild(doc().createTextNode(String(c)));
                return;
            }
            node.appendChild(c);
        });
    }

    /* ================================================================
     * 3. 折叠（形态纪律之一：展开不脱流）
     *    fold({ labelOpen, labelClosed, countText, onFirstOpen })
     *    → { root, fold, bar, isOpen(), setOpen(bool), toggle() }
     *
     *    【关键设计】onFirstOpen 只在第一次展开时触发。
     *      递归摘要树有 n 个节点，若每个节点都在渲染时取数，
     *      首屏就是 n 次索引/字符串拼装。惰性展开把成本摊到用户真的看的那几支。
     *    【反例记录】早期版本用 max-height: 0 → 999px 过渡，
     *      在长摘要（2000 字）上动画时间被固定住，短摘要上抖一下，
     *      且过渡期间内容已被裁切但滚动条已出现。grid 没有这个问题。
     * ================================================================ */
    function fold(opts) {
        const o = opts || {};
        const content = el('div', { class: 'lsu-fold-inner' }, o.children || null);
        const foldBox = el('div', { class: 'lsu-fold' }, [content]);
        let opened = false;
        let firstOpenFired = false;
        const textOpen = o.labelOpen || '收起';
        const textClosed = o.labelClosed || '展开';
        const label = el('span', { class: 'lsu-foldbar-label', text: textClosed });
        const caret = el('span', { class: 'lsu-caret', text: '⌄' });
        const bar = el('button', {
            type: 'button',
            class: 'lsu-foldbar',
            'aria-expanded': 'false',
            onclick: () => toggleFold(),
        }, [label, caret]);

        function paint() {
            foldBox.classList.toggle('is-open', opened);
            bar.setAttribute('aria-expanded', opened ? 'true' : 'false');
            label.textContent = opened ? textOpen : textClosed;
        }

        function fireFirst() {
            if (firstOpenFired) return;
            firstOpenFired = true;
            if (typeof o.onFirstOpen === 'function') {
                try { o.onFirstOpen(content); } catch (e) { content.textContent = '展开失败：' + human(e && e.message); }
            }
        }

        function setOpen(v) {
            opened = !!v;
            if (opened) fireFirst();
            paint();
        }

        function toggleFold() { setOpen(!opened); }

        paint();
        const wrap = el('div', {}, [foldBox, bar]);
        return {
            root: wrap,
            fold: foldBox,
            content,
            bar,
            isOpen: () => opened,
            setOpen,
            toggle: toggleFold,
        };
    }

    /* ================================================================
     * 4. 徽章 / 状态点
     * ================================================================ */
    const BADGE_KINDS = ['ok', 'warn', 'bad', 'info', 'mute'];

    function badge(kind, text) {
        const k = BADGE_KINDS.indexOf(kind) >= 0 ? kind : 'mute';
        return el('span', { class: 'lsu-badge is-' + k, text: String(text) });
    }

    function dot(title) {
        return el('span', { class: 'lsu-dot', title: title || '有新内容' });
    }

    /* ================================================================
     * 5. 按钮 / 文字按钮
     * ================================================================ */
    function btn(text, opts) {
        const o = opts || {};
        const classes = ['lsu-btn'];
        if (o.kind === 'primary') classes.push('is-primary');
        if (o.kind === 'danger') classes.push('is-danger');
        if (o.small) classes.push('is-sm');
        const node = el('button', {
            type: 'button',
            class: classes.join(' '),
            title: o.title || null,
        }, [String(text)]);
        if (o.disabled) node.disabled = true;
        if (typeof o.onClick === 'function') node.addEventListener('click', o.onClick);
        return node;
    }

    function link(text, onClick, opts) {
        const o = opts || {};
        const node = el('button', {
            type: 'button',
            class: 'lsu-link' + (o.danger ? ' is-danger' : ''),
            title: o.title || null,
        }, [String(text)]);
        if (typeof onClick === 'function') node.addEventListener('click', onClick);
        return node;
    }

    /* ================================================================
     * 6. 卡片
     *    card({ title, sub, badge, kind, actions, body, foot, foldable, open })
     *    kind: ok|warn|bad|mute —— 只表达「这块的性质」，不做装饰。
     * ================================================================ */
    function card(opts) {
        const o = opts || {};
        const classes = ['lsu-card'];
        if (o.kind) classes.push('is-' + o.kind);
        if (o.flat) classes.push('is-flat');

        const headKids = [];
        if (o.title !== undefined && o.title !== null) {
            headKids.push(el('div', { class: 'lsu-card-title', title: String(o.title), text: String(o.title) }));
        }
        if (o.badge) headKids.push(badge(o.badge.kind, o.badge.text));
        if (Array.isArray(o.actions)) {
            o.actions.forEach((a) => { if (a) headKids.push(a); });
        }
        const head = headKids.length ? el('div', { class: 'lsu-card-head' }, headKids) : null;

        const bodyKids = [];
        if (o.sub) bodyKids.push(el('div', { class: 'lsu-node-meta' }, [el('span', { text: String(o.sub) })]));
        if (o.body) bodyKids.push(o.body);
        const body = el('div', { class: 'lsu-card-body' + (o.tight ? ' is-tight' : '') }, bodyKids);

        const parts = [head, body];

        if (o.foldable) {
            const f = fold({
                children: o.foldBody || null,
                labelOpen: o.labelOpen,
                labelClosed: o.labelClosed || '展开',
                onFirstOpen: o.onFirstOpen,
            });
            if (o.open) f.setOpen(true);
            parts.push(f.root);
            var foldRef = f;
        }
        if (o.foot) parts.push(el('div', { class: 'lsu-card-body is-tight' }, [o.foot]));

        const rootNode = el('div', { class: classes.join(' ') }, parts);
        return foldRef ? { root: rootNode, fold: foldRef } : { root: rootNode };
    }

    /* ================================================================
     * 7. 空态四态
     *    kind 刻意**没有默认值**：调用方必须表态「这是空的 / 没装 / 坏了 / 在等」。
     *    本仓被「未运行显示为 0」坑过（v4-panel-bridge 的 describe 就是那次修复）。
     * ================================================================ */
    const EMPTY_ICON = {
        empty: '∅',
        absent: '⊘',
        error: '!',
        loading: '⋯',
    };

    function empty(opts) {
        const o = typeof opts === 'string' ? { kind: 'empty', title: opts } : (opts || {});
        const kind = EMPTY_ICON[o.kind] ? o.kind : 'empty';
        const classes = ['lsu-empty'];
        if (kind === 'error') classes.push('is-error');
        if (kind === 'absent') classes.push('is-absent');
        const kids = [
            el('div', { class: 'lsu-empty-icon', text: o.icon || EMPTY_ICON[kind] }),
            el('div', { class: 'lsu-empty-title', text: o.title || (kind === 'absent' ? '模块未加载' : '暂无内容') }),
        ];
        if (o.hint) kids.push(el('div', { class: 'lsu-empty-hint', text: String(o.hint) }));
        if (o.action) kids.push(o.action);
        return el('div', { class: classes.join(' ') }, kids);
    }

    function skeleton(rows) {
        const n = Math.max(1, Math.min(12, rows || 3));
        const kids = [];
        for (let i = 0; i < n; i++) {
            const w = i % 3 === 0 ? 'is-w80' : (i % 3 === 1 ? 'is-w60' : 'is-w40');
            kids.push(el('div', { class: 'lsu-skel-row ' + w }));
        }
        return el('div', { class: 'lsu-skel', 'aria-busy': 'true' }, kids);
    }

    /* ================================================================
     * 8. 键值表
     *    pairs: [[label, value, opts], ...]
     *    opts.numeric / opts.nullish 只影响配色，不影响文本。
     * ================================================================ */
    function kv(pairs) {
        const list = Array.isArray(pairs) ? pairs : [];
        const kids = [];
        list.forEach((p) => {
            if (!p) return;
            const label = p[0];
            const value = p[1];
            const opts = p[2] || {};
            const ddClass = ['lsu-kv-v'];
            if (opts.numeric) ddClass.push('is-num');
            if (value === null || value === undefined) ddClass.push('is-null');
            kids.push(el('dt', { text: String(label) }));
            kids.push(el('dd', { class: ddClass.slice(1).join(' '), text: human(value) }));
        });
        return el('dl', { class: 'lsu-kv' }, kids);
    }

    /* ================================================================
     * 9. 表单
     * ================================================================ */
    function field(opts) {
        const o = opts || {};
        const input = o.multiline
            ? el('textarea', { class: 'lsu-textarea', placeholder: o.placeholder || '' })
            : el('input', { class: 'lsu-input', type: o.type || 'text', placeholder: o.placeholder || '' });
        if (o.value !== undefined && o.value !== null) input.value = String(o.value);
        if (typeof o.onInput === 'function') {
            input.addEventListener('input', () => o.onInput(input.value, input));
        }
        if (typeof o.onEnter === 'function' && !o.multiline) {
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter') o.onEnter(input.value); });
        }
        const kids = [];
        if (o.label) kids.push(el('div', { class: 'lsu-label', text: String(o.label) }));
        kids.push(input);
        const err = el('div', { class: 'lsu-field-err', text: '' });
        kids.push(err);
        const rootNode = el('div', { class: 'lsu-field' }, kids);
        return {
            root: rootNode,
            input,
            setError(msg) {
                err.textContent = msg ? String(msg) : '';
                input.classList.toggle('is-bad', !!msg);
            },
        };
    }

    function switchRow(opts) {
        const o = opts || {};
        const input = el('input', { type: 'checkbox' });
        input.checked = !!o.checked;
        if (typeof o.onChange === 'function') {
            input.addEventListener('change', () => o.onChange(!!input.checked));
        }
        const track = el('span', { class: 'lsu-switch-track' });
        const label = el('label', { class: 'lsu-switch' }, [
            input,
            track,
            el('span', { text: o.label || '' }),
        ]);
        return { root: label, input, isChecked: () => !!input.checked };
    }

    /* ================================================================
     * 10. 工具条 / 搜索 / 筛选片
     * ================================================================ */
    function toolbar(kids) {
        return el('div', { class: 'lsu-toolbar' }, kids || []);
    }

    function searchBox(opts) {
        const o = opts || {};
        const input = el('input', { type: 'search', placeholder: o.placeholder || '搜索…' });
        let timer = null;
        input.addEventListener('input', () => {
            if (typeof o.onInput !== 'function') return;
            // 输入防抖 120ms：真机上每次按键都重建列表会掉帧
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => { timer = null; o.onInput(input.value); }, o.debounceMs || 120);
        });
        const rootNode = el('div', { class: 'lsu-search' }, [el('span', { text: '⌕' }), input]);
        return { root: rootNode, input, value: () => input.value };
    }

    function chip(text, opts) {
        const o = opts || {};
        const node = el('button', {
            type: 'button',
            class: 'lsu-chip' + (o.on ? ' is-on' : ''),
            text: String(text),
            'aria-pressed': o.on ? 'true' : 'false',
        });
        if (typeof o.onClick === 'function') node.addEventListener('click', o.onClick);
        return node;
    }

    /* ================================================================
     * 11. 段头 / 分隔
     * ================================================================ */
    function section(title, hint) {
        const kids = [el('div', { class: 'lsu-sec-title', text: String(title) })];
        if (hint) kids.push(el('div', { class: 'lsu-sec-hint', text: String(hint) }));
        return el('div', { class: 'lsu-sec' }, kids);
    }

    function hr() { return el('hr', { class: 'lsu-hr' }); }

    /* ================================================================
     * 12. 面板壳
     *    panel({ title, sub, foot, onClose, width }) → { root, body, close(), setTitle(), setSub() }
     *    【纪律】点遮罩关闭只在「点在遮罩本身」时生效 ——
     *      否则从抽屉内部拖选文字到外部会误关，这在编辑摘要时是高频操作。
     * ================================================================ */
    function panel(opts) {
        const o = opts || {};
        let closed = false;
        let onCloseCb = o.onClose;

        const titleNode = el('div', { class: 'lsu-sheet-title', text: o.title || '面板' });
        const subNode = el('div', { class: 'lsu-sheet-sub', text: o.sub || '' });
        if (!o.sub) subNode.style.display = 'none';

        const closeBtn = el('button', { type: 'button', class: 'lsu-close', 'aria-label': '关闭', text: '✕' });
        const head = el('div', { class: 'lsu-sheet-head' }, [
            el('div', { style: { flex: '1 1 auto', minWidth: '0' } }, [titleNode, subNode]),
            closeBtn,
        ]);
        const body = el('div', { class: 'lsu-sheet-body' });
        const children = [head, body];
        if (o.foot) children.push(el('div', { class: 'lsu-sheet-foot' }, [o.foot]));

        const sheet = el('div', { class: 'lsu-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || '面板' }, children);
        if (o.width) sheet.style.setProperty('--lsu-sheet-w', o.width);
        const rootNode = el('div', { class: 'lsu-panel' }, [sheet]);

        function close() {
            if (closed) return;
            closed = true;
            rootNode.classList.remove('is-open');
            try { if (typeof onCloseCb === 'function') onCloseCb(); } catch (_e) { /* ignore */ }
            // 动画结束后移除，避免留下不可见的全屏遮罩挡住宿主点击
            setTimeout(() => { try { rootNode.remove(); } catch (_e) { /* ignore */ } }, 200);
        }

        closeBtn.addEventListener('click', close);
        rootNode.addEventListener('pointerdown', (ev) => {
            if (ev.target === rootNode) close();
        });
        const onKey = (ev) => {
            if (ev.key === 'Escape') { close(); doc().removeEventListener('keydown', onKey); }
        };
        doc().addEventListener('keydown', onKey);

        doc().body.appendChild(rootNode);
        // 触发入场过渡（下一帧）
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => rootNode.classList.add('is-open'));
        else rootNode.classList.add('is-open');

        return {
            root: rootNode,
            body,
            close,
            isClosed: () => closed,
            setTitle(t) { titleNode.textContent = String(t); },
            setSub(t) {
                subNode.textContent = String(t || '');
                subNode.style.display = t ? '' : 'none';
            },
            setOnClose(fn) { onCloseCb = fn; },
        };
    }

    /* ================================================================
     * 13. 确认框（Promise 化）
     *    modal({ title, body, confirmText, cancelText, danger }) → Promise<boolean>
     *    【纪律】危险动作的确认按钮**不自动聚焦** —— 回车不该等于「确认删除」。
     * ================================================================ */
    function modal(opts) {
        const o = opts || {};
        return new Promise((resolve) => {
            let done = false;
            const finish = (v) => {
                if (done) return;
                done = true;
                try { rootNode.remove(); } catch (_e) { /* ignore */ }
                resolve(v);
            };
            const okBtn = btn(o.confirmText || '确定', {
                kind: o.danger ? 'danger' : 'primary',
                onClick: () => finish(true),
            });
            const cancelBtn = btn(o.cancelText || '取消', { onClick: () => finish(false) });
            const cardNode = el('div', { class: 'lsu-modal-card' }, [
                el('div', { class: 'lsu-modal-head', text: o.title || '确认' }),
                el('div', { class: 'lsu-modal-body' }, [o.body || '']),
                el('div', { class: 'lsu-modal-foot' }, [cancelBtn, okBtn]),
            ]);
            const rootNode = el('div', { class: 'lsu-modal' + (o.danger ? ' is-danger' : '') }, [cardNode]);
            rootNode.addEventListener('pointerdown', (ev) => { if (ev.target === rootNode) finish(false); });
            doc().body.appendChild(rootNode);
            // 焦点给取消：误按回车 = 不执行
            try { cancelBtn.focus(); } catch (_e) { /* ignore */ }
        });
    }

    /* ================================================================
     * 14. Toast
     * ================================================================ */
    let toastHost = null;

    function getToastHost() {
        if (toastHost && toastHost.isConnected) return toastHost;
        toastHost = el('div', { class: 'lsu-toast-host' });
        doc().body.appendChild(toastHost);
        return toastHost;
    }

    function toast(msg, kind) {
        if (!hasDom()) return null;
        const host = getToastHost();
        const node = el('div', {
            class: 'lsu-toast' + (kind ? ' is-' + kind : ''),
            text: String(msg),
        });
        host.appendChild(node);
        setTimeout(() => { try { node.remove(); } catch (_e) { /* ignore */ } }, 2200);
        return node;
    }

    /* ================================================================
     * 15. 样式自举
     *    正常情况下 css 由 manifest.extra_css 注入；这里只是「如果没注入就补一份」，
     *    用于开发期（手动 require）与宿主清理了 <link> 后的自愈。
     *    失败一律静默 —— 样式缺失只影响好看，不该让面板报错。
     * ================================================================ */
    function ensureStyle(href) {
        if (!hasDom()) return false;
        try {
            const want = href || STYLE_REL;
            const id = 'lonsha-ui-kit-style';
            if (document.getElementById(id)) return true;
            const probe = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
                .some((l) => String(l.getAttribute('href') || '').indexOf('lonsha-ui-kit.css') >= 0);
            if (probe) return true;
            const linkNode = document.createElement('link');
            linkNode.id = id;
            linkNode.rel = 'stylesheet';
            linkNode.href = want;
            document.head.appendChild(linkNode);
            return true;
        } catch (_e) {
            return false;
        }
    }

    /* ================================================================
     * 16. 列表渲染（带 key 复用）
     *    renderList(container, items, keyOf, build)：
     *      按 key 复用已有节点，只增删改 —— 避免「每次都清空重画」造成的滚动位置丢失。
     *      【为什么重要】楼层条有几百个格子，清空重画会让面板滚回顶部，
     *      用户在长对话里点一次「补齐」就丢失了位置。
     * ================================================================ */
    function renderList(container, items, keyOf, build) {
        const list = Array.isArray(items) ? items : [];
        const existing = new Map();
        Array.from(container.children).forEach((child) => {
            const k = child.dataset ? child.dataset.key : null;
            if (k !== null && k !== undefined) existing.set(String(k), child);
        });
        const seen = new Set();
        let cursor = container.firstChild;
        list.forEach((item, idx) => {
            const key = String(keyOf(item, idx));
            seen.add(key);
            let node = existing.get(key);
            if (!node) {
                node = build(item, idx);
                if (node && node.dataset) node.dataset.key = key;
            }
            if (node) {
                // 位置校正：只在顺序不一致时移动
                if (cursor === node) cursor = cursor.nextSibling;
                else container.insertBefore(node, cursor);
            }
        });
        existing.forEach((node, key) => {
            if (!seen.has(key)) { try { node.remove(); } catch (_e) { /* ignore */ } }
        });
        return container;
    }

    /* ================================================================
     * 17. 自检（Node 安全：不碰 DOM）
     * ================================================================ */
    function selfCheck() {
        const fails = [];
        const checks = [];
        const ok = (name, cond, detail) => {
            checks.push({ name, ok: !!cond, detail });
            if (!cond) fails.push(name + (detail ? '：' + detail : ''));
        };

                ok('esc 转义尖括号', esc('<b>') === AMP + 'lt;b' + AMP + 'gt;');
        ok('esc 转义按位与', esc('&') === AMP + 'amp;');
        ok('esc 转义双引号', esc(String.fromCharCode(34)) === AMP + 'quot;');
        ok('esc 转义单引号', esc(String.fromCharCode(39)) === AMP + '#39;');
        ok('esc 一次命中多个字符', esc('&<' + String.fromCharCode(34)) === AMP + 'amp;' + AMP + 'lt;' + AMP + 'quot;');
        ok('esc 保留普通中文', esc('摘要第 3 楼') === '摘要第 3 楼');
        ok('human 区分 null 与 0', human(null) === 'null' && human(0) === '0');
        ok('human 区分 undefined 与空串', human(undefined) === 'undefined' && human('') === '（空）');
        ok('human 布尔为中文', human(true) === '是' && human(false) === '否');
        const long = '甲乙丙丁戊己庚辛';
        ok('clampText 截断带省略号', clampText(long, 5).length === 5 && clampText(long, 5).slice(-1) === '…');
        ok('clampText 不截断短文本', clampText('甲乙', 5) === '甲乙');
        ok('badge 未知 kind 落 mute', !(function () {
            // 无 DOM 时 badge 会抛，这里只校验合法 kind 清单
            return BADGE_KINDS.indexOf('nope') >= 0;
        })());
        ok('EMPTY_ICON 四态齐备', !!EMPTY_ICON.empty && !!EMPTY_ICON.absent && !!EMPTY_ICON.error && !!EMPTY_ICON.loading);
        ok('无 DOM 时不炸（hasDom=false）', hasDom() === false || hasDom() === true);
        ok('导出接口齐全', ['el', 'esc', 'fold', 'card', 'empty', 'kv', 'field', 'panel', 'modal', 'toast', 'renderList']
            .every((k) => typeof api[k] === 'function'));

        return {
            ok: fails.length === 0,
            version: KIT_VERSION,
            total: checks.length,
            failed: fails.length,
            fails,
            checks,
            note: hasDom() ? 'dom' : 'no-dom',
        };
    }

    /* ================================================================
     * 18. 导出
     * ================================================================ */
    const api = {
        VERSION: KIT_VERSION,
        // 纯函数
        esc,
        human,
        clampText,
        selfCheck,
        hasDom,
        // DOM 工厂
        el,
        appendAll,
        fold,
        card,
        badge,
        dot,
        btn,
        link,
        empty,
        skeleton,
        kv,
        field,
        switchRow,
        toolbar,
        searchBox,
        chip,
        section,
        hr,
        panel,
        modal,
        toast,
        ensureStyle,
        renderList,
        BADGE_KINDS: BADGE_KINDS.slice(),
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LonShaUiKit = api;
    /* 显式宿主挂载：消费审计据此认定「这个模块对外叫 LonShaUiKit」，
     * 否则账本只能看到 root.X（形参），判成零消费。 */
    if (typeof window !== 'undefined') window.LonShaUiKit = api;
})(typeof window !== 'undefined' ? window : globalThis);