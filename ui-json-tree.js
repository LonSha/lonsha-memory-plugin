/**
 * ui-json-tree.js — 可折叠 JSON 树（[v3.480.0]）
 * ------------------------------------------------------------
 * 【为什么需要它】
 *   面板把引擎里的账摊开后，总有人要问「原始结构长什么样」。
 *   直接 `JSON.stringify(x, null, 2)` 塞进 <pre> 有三个真问题：
 *     ① 引擎状态里有**环**（`scene.owner.plugin.scene`），stringify 直接抛
 *        "Converting circular structure to JSON" —— 面板白屏；
 *     ② 对象一大就是几千行纯文本，找不到某个键只能靠浏览器 Ctrl+F；
 *     ③ 分不清「这个键存在但是空数组」与「这个键根本不存在」。
 *   所以这里先把值**拍平成行**（纯函数，Node 可测），再交给渲染层。
 *
 * 【拍平而不是递归渲染 DOM 的理由】
 *   拍平之后「折叠」只是给某几行加 `data-hidden`，不需要销毁/重建子树；
 *   搜索、计数、深度截断也都能在纯数组上算，判据不需要 DOM 就能验证。
 *
 * 【三条要守住的口径】
 *   ① **环 ≠ 重复引用**：判环用「祖先链」，同一个对象在两个兄弟位置出现
 *      不算环（那只是共享引用，内容照样完整可读）。
 *   ② **截断要明说**：节点数超上限时返回 `truncated:true` 与 `omitted` 计数，
 *      不许静默截断 —— 静默截断会让「只有 500 项」变成事实错误。
 *   ③ **不把 undefined 显示成 null**：对象里值为 undefined 的键照样出行，
 *      类型记为 `undefined`，因为「有键但没值」与「键不存在」是两件事。
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LonShaJsonTree = api;
    if (typeof window !== 'undefined') window.LonShaJsonTree = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const VERSION = '1.0.0';
    const DEFAULT_MAX_NODES = 800;

    /* ── 纯逻辑层（无 DOM，可单测）────────────────────────────── */

    function typeOf(v) {
        if (v === null) return 'null';
        if (Array.isArray(v)) return 'array';
        return typeof v;   // object / string / number / boolean / undefined / function / symbol / bigint
    }

    function isBranch(v) {
        return v !== null && typeof v === 'object';
    }

    /** 一行摘要："[4 项]" / "{3 键}" / "" （叶子没有摘要） */
    function summarize(v) {
        if (Array.isArray(v)) return '[' + v.length + ' 项]';
        if (v !== null && typeof v === 'object') {
            const n = Object.keys(v).length;
            return '{' + n + ' 键}';
        }
        return '';
    }

    /** 值 → 单行文本。字符串加引号、超长截断（截断处带省略号，不是静默丢） */
    function valueText(v, cap) {
        const limit = Number.isFinite(cap) ? cap : 120;
        const t = typeOf(v);
        if (t === 'string') {
            const s = String(v);
            const shown = s.length > limit ? s.slice(0, limit) + '…' : s;
            return JSON.stringify(shown);
        }
        if (t === 'number' || t === 'boolean') return String(v);
        if (t === 'null') return 'null';
        if (t === 'undefined') return 'undefined';
        if (t === 'function') return 'function ' + (v.name || '') + '()';
        if (t === 'symbol') return String(v);
        if (t === 'bigint') return String(v) + 'n';
        return summarize(v);
    }

    /**
     * 把值拍平成行数组。
     * @param {*} value 根值
     * @param {object} opts { maxNodes, maxDepth, keyCap }
     * @returns {{rows:Array, truncated:boolean, omitted:number, depthMax:number}}
     *
     * 行形状：{ depth, key, path, type, text, summary, hasChildren, circular, open }
     */
    function flatten(value, opts) {
        const o = opts || {};
        const maxNodes = Number.isFinite(o.maxNodes) ? o.maxNodes : DEFAULT_MAX_NODES;
        const maxDepth = Number.isFinite(o.maxDepth) ? o.maxDepth : 12;
        const keyCap = Number.isFinite(o.keyCap) ? o.keyCap : 120;

        const rows = [];
        let omitted = 0;
        let depthMax = 0;

        const walk = (v, key, path, depth, ancestors) => {
            depthMax = Math.max(depthMax, depth);
            if (rows.length >= maxNodes) { omitted += 1; return; }

            const t = typeOf(v);
            // 判环只看祖先链：兄弟位重复的同一对象不算环
            const circular = isBranch(v) && ancestors.indexOf(v) >= 0;
            const branch = isBranch(v) && !circular;
            const row = {
                depth,
                key: String(key),
                path,
                type: circular ? 'circular' : t,
                text: circular ? '(环：指回上层)' : valueText(v, keyCap),
                summary: circular ? '' : summarize(v),
                hasChildren: branch,
                circular,
                open: depth < 2,     // 前两层默认展开：多数时候人只看两层
            };
            rows.push(row);

            if (!branch) return;
            if (depth + 1 > maxDepth) return;   // 超深度：不递归，也不谎称没有子节点

            const nextAncestors = ancestors.concat([v]);
            if (Array.isArray(v)) {
                for (let i = 0; i < v.length; i += 1) {
                    walk(v[i], i, path + '[' + i + ']', depth + 1, nextAncestors);
                }
            } else {
                const keys = Object.keys(v);
                for (let i = 0; i < keys.length; i += 1) {
                    const k = keys[i];
                    walk(v[k], k, path + '.' + k, depth + 1, nextAncestors);
                }
            }
        };

        walk(value, '(根)', '$', 0, []);
        return { rows, truncated: omitted > 0, omitted, depthMax };
    }

    /** 折叠：把某行之后、深度更大的子孙全部标为隐藏（返回新数组，不改入参） */
    function applyOpen(rows, openMap) {
        const out = [];
        let hideBelow = Infinity;
        for (const r of rows) {
            const hidden = r.depth > hideBelow;
            if (hidden) {
                out.push(Object.assign({}, r, { hidden: true }));
                continue;
            }
            hideBelow = Infinity;
            const open = openMap && Object.prototype.hasOwnProperty.call(openMap, r.path)
                ? openMap[r.path]
                : r.open;
            if (r.hasChildren && !open) hideBelow = r.depth;
            out.push(Object.assign({}, r, { open: r.hasChildren ? !!open : false, hidden: false }));
        }
        return out;
    }

    /** 搜索：命中键名、路径或值文本；返回命中的 path 集合与计数 */
    function search(rows, needle) {
        const n = String(needle || '').trim().toLowerCase();
        const hit = new Set();
        if (!n) return { hit, count: 0 };
        for (const r of rows) {
            const hay = (r.key + ' ' + r.path + ' ' + r.text + ' ' + r.summary).toLowerCase();
            if (hay.indexOf(n) >= 0) hit.add(r.path);
        }
        return { hit, count: hit.size };
    }

    /** 统计：父节点数 / 叶子数 / 最深 / 环数 —— 给面板顶部的徽章用 */
    function stats(rows) {
        let branch = 0;
        let leaf = 0;
        let circular = 0;
        let depth = 0;
        for (const r of rows) {
            if (r.circular) circular += 1;
            else if (r.hasChildren) branch += 1;
            else leaf += 1;
            if (r.depth > depth) depth = r.depth;
        }
        return { branch, leaf, circular, depth, total: rows.length };
    }

    /* ── 渲染层（需要 DOM；没有 DOM 时明确返回 absent）────────── */

    function doc() {
        try { return (root && root.document) || null; } catch (_e) { return null; }
    }

    function kit() {
        try {
            if (root && root.LonShaUiKit) return root.LonShaUiKit;
        } catch (_e) { /* 忽略 */ }
        try {
            if (typeof require === 'function') return require('./ui-kit-core.js');
        } catch (_e) { /* 忽略 */ }
        return null;
    }

    /**
     * 打开一棵树。opts: { data, title, onClose, maxNodes }
     * 返回 { ok, kind, reason? } —— 没有 DOM 时是 absent，不是「空树」。
     */
    function openJsonTree(opts) {
        const o = opts || {};
        const d = doc();
        if (!d || !d.body) return { ok: false, kind: 'absent', reason: '没有 document（非浏览器环境）' };
        const k = kit();
        if (!k || typeof k.el !== 'function') return { ok: false, kind: 'absent', reason: 'ui-kit-core.js 未加载' };

        const flat = flatten(o.data, { maxNodes: o.maxNodes });
        const el = k.el;
        /* ui-kit 的 el 是 el(tag, props对象, children)。第二参传字符串会走
         * Object.keys('ls-x') → setAttribute('0','l') → InvalidCharacterError，
         * 而且**只在真机上炸**（Node 自检没有 DOM，一路测不到）。
         * 因此渲染层统一走 mk：class 与文本各归各位。 */
        const mk = (tag, cls, text) => el(tag, {
            class: cls || null,
            text: (text === undefined || text === null) ? null : String(text),
        });

        const mask = mk('div', 'ls-confirm-mask');
        mask.setAttribute('data-depth', '1');
        const box = mk('div', 'ls-confirm');
        box.style.width = 'min(560px, 94vw)';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', o.title || '原始结构');

        const title = mk('div', 'ls-confirm-title', o.title || '原始结构');
        box.appendChild(title);

        const bar = mk('div', 'ls-table-bar');
        const st = stats(flat.rows);
        const badge = mk('span', 'ls-table-count',
            st.total + ' 行 · ' + st.branch + ' 支 / ' + st.leaf + ' 叶 · 深 ' + st.depth
            + (st.circular ? ' · 环 ' + st.circular : '')
            + (flat.truncated ? ' · 已截断 ' + flat.omitted : ''));
        const search = mk('input', 'ls-input');
        search.type = 'search';
        search.placeholder = '搜键名 / 值';
        search.style.flex = '1 1 140px';
        bar.appendChild(search);
        bar.appendChild(badge);
        box.appendChild(bar);

        const host = mk('div', 'ls-tree');
        box.appendChild(host);

        const openMap = {};
        const hitState = { hit: new Set(), count: 0 };

        const render = () => {
            while (host.firstChild) host.removeChild(host.firstChild);
            const view = applyOpen(flat.rows, openMap);
            for (const r of view) {
                if (r.hidden) continue;
                const row = mk('div', 'ls-tree-row');
                row.setAttribute('data-depth', String(r.depth));
                if (hitState.hit.has(r.path)) row.setAttribute('data-hit', '1');

                const tg = mk('span', 'ls-tree-toggle', r.hasChildren ? '▸' : '·');
                tg.setAttribute('data-open', r.open ? '1' : '0');
                tg.setAttribute('data-leaf', r.hasChildren ? '0' : '1');
                if (r.hasChildren) {
                    tg.addEventListener('click', () => {
                        openMap[r.path] = !r.open;
                        render();
                    });
                }
                row.appendChild(tg);

                const keyEl = mk('span', 'ls-tree-key', r.key);
                keyEl.title = r.path;
                keyEl.addEventListener('click', () => {
                    try {
                        if (root.navigator && root.navigator.clipboard) root.navigator.clipboard.writeText(r.path);
                    } catch (_e) { /* 剪贴板不可用就算了，不弹错 */ }
                });
                row.appendChild(keyEl);
                row.appendChild(mk('span', 'ls-tree-sep', ':'));

                const val = mk('span', 'ls-tree-val', r.text);
                val.setAttribute('data-type', r.type);
                row.appendChild(val);

                if (r.summary) row.appendChild(mk('span', 'ls-tree-summary', r.summary));
                row.appendChild(mk('span', 'ls-tree-type', r.type));
                host.appendChild(row);
            }
        };

        search.addEventListener('input', () => {
            const s = search(flat.rows, search.value);
            hitState.hit = s.hit;
            hitState.count = s.count;
            // 搜索时强制展开命中路径的祖先，否则命中的行被折叠着看不到
            if (s.count) {
                for (const r of flat.rows) {
                    if (s.hit.has(r.path)) {
                        for (const a of flat.rows) {
                            if (r.path !== a.path && r.path.indexOf(a.path) === 0) openMap[a.path] = true;
                        }
                    }
                }
            }
            render();
        });

        const actions = mk('div', 'ls-confirm-actions');
        const closeBtn = mk('button', '', '关闭');
        closeBtn.type = 'button';
        closeBtn.setAttribute('data-primary', '1');
        actions.appendChild(closeBtn);
        box.appendChild(actions);

        const bye = () => {
            try { mask.remove(); } catch (_e) { /* 已经不在树上 */ }
            try { if (typeof o.onClose === 'function') o.onClose(); } catch (_e) { /* 回调失败不影响关闭 */ }
        };
        closeBtn.addEventListener('click', bye);
        mask.addEventListener('click', (e) => { if (e.target === mask) bye(); });

        render();
        mask.appendChild(box);
        d.body.appendChild(mask);
        return { ok: true, kind: 'ok', stats: st, truncated: flat.truncated };
    }

    /* ── 自检 ─────────────────────────────────────────────────── */
    function selfCheck() {
        const fails = [];
        const checks = [];
        const ok = (name, cond, detail) => {
            checks.push({ name, ok: !!cond, detail });
            if (!cond) fails.push(name + (detail ? '：' + detail : ''));
        };

        const f1 = flatten({ a: 1, b: 'x', c: true, d: null });
        ok('根 + 4 个叶子 = 5 行', f1.rows.length === 5, '实际 ' + f1.rows.length);
        ok('根行 key 固定为 (根)', f1.rows[0].key === '(根)');
        ok('类型识别：number/string/boolean/null',
            f1.rows[1].type === 'number' && f1.rows[2].type === 'string'
            && f1.rows[3].type === 'boolean' && f1.rows[4].type === 'null');
        ok('字符串带引号', f1.rows[2].text === '"x"', f1.rows[2].text);

        const f2 = flatten({ list: [10, 20], obj: { n: 1 } });
        const paths = f2.rows.map((r) => r.path);
        ok('数组路径用 [i]', paths.indexOf('$.list[0]') >= 0, paths.join(','));
        ok('对象路径用 .key', paths.indexOf('$.obj.n') >= 0, paths.join(','));
        ok('分支带摘要', /\[2 项\]/.test(f2.rows[1].summary), f2.rows[1].summary);

        // 环：自己指自己
        const cyc = { name: 'a' };
        cyc.self = cyc;
        const f3 = flatten(cyc);
        const cycRow = f3.rows.filter((r) => r.type === 'circular');
        ok('自指被判环', cycRow.length === 1, '环行 ' + cycRow.length);
        ok('环行不递归（不无限增长）', f3.rows.length <= 4, '总行 ' + f3.rows.length);

        // 兄弟位共享同一对象：不是环，内容要完整
        const shared = { deep: 1 };
        const f4 = flatten({ a: shared, b: shared });
        ok('兄弟共享引用不算环', f4.rows.filter((r) => r.type === 'circular').length === 0);
        ok('共享引用的内容照常展开', f4.rows.some((r) => r.path === '$.b.deep'));

        // undefined 与「键不存在」分开
        const f5 = flatten({ has: undefined, not: 1 });
        const und = f5.rows.filter((r) => r.type === 'undefined');
        ok('值为 undefined 的键照样出行', und.length === 1, '实际 ' + und.length);

        // 截断要明说
        const big = {};
        for (let i = 0; i < 50; i += 1) big['k' + i] = i;
        const f6 = flatten(big, { maxNodes: 10 });
        ok('超上限标记 truncated', f6.truncated === true);
        ok('截断有 omitted 计数', f6.omitted > 0, 'omitted=' + f6.omitted);
        ok('截断后行数不超上限', f6.rows.length <= 10, '行 ' + f6.rows.length);

        // 折叠：父收起后子孙隐藏
        const f7 = flatten({ a: { b: { c: 1 } } });
        const collapsed = applyOpen(f7.rows, { '$.a': false });
        ok('父收起后子孙被隐藏', collapsed.filter((r) => r.hidden).length >= 1);
        const opened = applyOpen(f7.rows, { '$.a': true, '$.a.b': true });
        ok('父展开后子孙可见', opened.filter((r) => r.hidden).length === 0);

        // 搜索
        const f8 = flatten({ alpha: 1, beta: 'needle' });
        const s1 = search(f8.rows, 'needle');
        ok('搜到值文本', s1.count === 1, 'count=' + s1.count);
        ok('空搜索词不算命中', search(f8.rows, '  ').count === 0);

        // 统计
        const st = stats(f8.rows);
        ok('统计：叶子数对', st.leaf === 2, 'leaf=' + st.leaf);
        ok('统计：根算分支', st.branch === 1, 'branch=' + st.branch);

        // 无 DOM 时 open 报 absent，而不是假装成功
        const r = openJsonTree({ data: { a: 1 } });
        ok('无 DOM 时 open 判 absent', r.ok === false && r.kind === 'absent', JSON.stringify(r));

        return { ok: fails.length === 0, version: VERSION, total: checks.length, failed: fails.length, fails, checks };
    }

    return {
        VERSION,
        typeOf, summarize, valueText,
        flatten, applyOpen, search, stats,
        openJsonTree,
        selfCheck,
    };
});