/**
 * ui-table.js — 数据表格（[v3.480.0]）
 * ------------------------------------------------------------
 * 【为什么不用 ui-kit 的 renderList】
 *   renderList 是「一行一个条目」的列表：适合记忆条目这种长短不一的文本。
 *   而状态变量、物品、楼层这几类账是**同构的行**（几个字段对齐看），
 *   用列表读起来要来回扫，用表格一眼能比。两者不是一回事。
 *
 * 【排序为什么要自己写】
 *   默认 `Array.prototype.sort` 把元素当字符串比：
 *     · `[10, 9]` 会排成 `[10, 9]`（"10" < "9"）
 *     · `null` 与 `''` 与缺失字段混在一起，顺序不可预测
 *     · 中文名用 localeCompare('') 会按 UTF-16 码位排，与读者的语感不符
 *   所以这里显式规定：数字按数值、字符串按 zh 语序、空值一律沉底（位置稳定）。
 *
 * 【分页为什么要独立成纯函数】
 *   页码是用户能直接改的状态，越界（第 9 页 / 共 3 页）必须被**夹紧**而不是渲染空表 ——
 *   渲染空表会让「这一页没有数据」与「数据没了」同形。夹紧逻辑放纯函数里，
 *   判据可以直接打，不需要 DOM。
 */
(function (root, factory) {
    const api = factory(root);
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LonShaUiTable = api;
    if (typeof window !== 'undefined') window.LonShaUiTable = api;
})(typeof window !== 'undefined' ? window : globalThis, function (root) {
    'use strict';

    const VERSION = '1.0.0';

    /* ── 纯逻辑层 ─────────────────────────────────────────────── */

    function isBlank(v) {
        return v === null || v === undefined || v === '';
    }

    /** 取字段值：支持 'a.b' 路径与函数取值器 */
    function pluck(row, key) {
        if (typeof key === 'function') return key(row);
        if (row === null || row === undefined) return undefined;
        const parts = String(key).split('.');
        let cur = row;
        for (const p of parts) {
            if (cur === null || cur === undefined) return undefined;
            cur = cur[p];
        }
        return cur;
    }

    /** 单值比较：数字按数值、字符串按 zh 语序、布尔 false<true */
    function compareValues(a, b) {
        const aBlank = isBlank(a);
        const bBlank = isBlank(b);
        if (aBlank && bBlank) return 0;
        if (aBlank) return 1;
        if (bBlank) return -1;

        const an = typeof a === 'number';
        const bn = typeof b === 'number';
        if (an && bn) return a < b ? -1 : (a > b ? 1 : 0);

        const ab = typeof a === 'boolean';
        const bb = typeof b === 'boolean';
        if (ab && bb) return (a === b) ? 0 : (a ? 1 : -1);

        const as = String(a);
        const bs = String(b);
        try {
            return as.localeCompare(bs, 'zh-Hans-CN');
        } catch (_e) {
            return as < bs ? -1 : (as > bs ? 1 : 0);
        }
    }

    /**
     * 排序（不修改入参）。空值无论升降序都沉底 —— 表格通行约定：
     * 「没有这一项」不该因为点了降序就冒到第一行。
     */
    function sortRows(rows, key, dir) {
        const list = Array.isArray(rows) ? rows.slice() : [];
        const desc = String(dir || 'asc').toLowerCase() === 'desc';
        const idx = new Map();
        list.forEach((r, i) => idx.set(r, i));
        list.sort((x, y) => {
            const a = pluck(x, key);
            const b = pluck(y, key);
            const aBlank = isBlank(a);
            const bBlank = isBlank(b);
            if (aBlank && bBlank) return (idx.get(x) - idx.get(y));
            if (aBlank) return 1;
            if (bBlank) return -1;
            const c = compareValues(a, b);
            if (c !== 0) return desc ? -c : c;
            return idx.get(x) - idx.get(y);
        });
        return list;
    }

    /** 过滤：needle 在任一列（或指定列）里出现即命中；空词全通过 */
    function filterRows(rows, needle, keys) {
        const list = Array.isArray(rows) ? rows : [];
        const n = String(needle || '').trim().toLowerCase();
        if (!n) return list.slice();
        const cols = Array.isArray(keys) && keys.length ? keys : null;
        return list.filter((r) => {
            if (cols) {
                for (const c of cols) {
                    const v = pluck(r, c);
                    if (v !== null && typeof v === 'object') continue;
                    if (String(v === undefined || v === null ? '' : v).toLowerCase().indexOf(n) >= 0) return true;
                }
                return false;
            }
            if (r === null || r === undefined) return false;
            const vals = typeof r === 'object' ? Object.keys(r).map((k) => r[k]) : [r];
            for (const v of vals) {
                if (v !== null && typeof v === 'object') continue;
                if (String(v === undefined || v === null ? '' : v).toLowerCase().indexOf(n) >= 0) return true;
            }
            return false;
        });
    }

    /**
     * 分页（页码夹紧）。返回 { rows, page, pages, total, from, to }
     * pages 至少 1：空表也是「第 1 页 / 共 1 页」，不是「第 0 页」。
     */
    function paginate(rows, page, size) {
        const list = Array.isArray(rows) ? rows : [];
        const per = Math.max(1, Math.floor(Number(size) || 20));
        const pages = Math.max(1, Math.ceil(list.length / per));
        let p = Math.floor(Number(page) || 1);
        if (!Number.isFinite(p) || p < 1) p = 1;
        if (p > pages) p = pages;
        const from = (p - 1) * per;
        const slice = list.slice(from, from + per);
        return {
            rows: slice,
            page: p,
            pages,
            total: list.length,
            from: list.length ? from + 1 : 0,
            to: from + slice.length,
        };
    }

    /** 页码窗口：始终显示首尾页，当前页左右各 span 页，中间用 '…' 占位 */
    function pageWindow(page, pages, span) {
        const s = Math.max(1, Math.floor(Number(span) || 1));
        const set = new Set([1, pages]);
        for (let d = -s; d <= s; d += 1) {
            const p = page + d;
            if (p >= 1 && p <= pages) set.add(p);
        }
        const sorted = [...set].sort((a, b) => a - b);
        const out = [];
        for (let i = 0; i < sorted.length; i += 1) {
            if (i > 0 && sorted[i] - sorted[i - 1] > 1) out.push('…');
            out.push(sorted[i]);
        }
        return out;
    }

    /** 列定义归一化：字符串 → {key,label}，并补 align/sortable 默认值 */
    function normalizeColumns(cols) {
        return (Array.isArray(cols) ? cols : []).map((c) => {
            if (typeof c === 'string') return { key: c, label: c, align: 'left', sub: null, render: null, sortable: true };
            const o = c || {};
            return {
                key: o.key !== undefined ? o.key : o.label,
                label: o.label !== undefined ? o.label : String(o.key || ''),
                align: o.align || 'left',
                sub: o.sub || null,
                render: typeof o.render === 'function' ? o.render : null,
                sortable: o.sortable !== false,
            };
        });
    }

    /* ── 渲染层 ───────────────────────────────────────────────── */

    function doc() {
        try { return (root && root.document) || null; } catch (_e) { return null; }
    }

    function kit() {
        try { if (root && root.LonShaUiKit) return root.LonShaUiKit; } catch (_e) { /* ignore */ }
        try { if (typeof require === 'function') return require('./ui-kit-core.js'); } catch (_e) { /* ignore */ }
        return null;
    }

    /**
     * 在容器里画一张表。opts: { container, rows, columns, pageSize, needle, sortKey, sortDir, emptyText }
     * 返回 { ok, kind, reason? } —— 没有 DOM 是 absent；rows 不是数组是 absent（结构漂移）。
     */
    function renderTable(opts) {
        const o = opts || {};
        // [修正] 先判结构漂移，再判环境：两者都是 absent，但**理由**必须准确 ——
        //   在 Node 里（无 document）先返回「没有 document」会把「rows 不是数组」这条
        //   真实的结构缺陷遮住，等于判据永远测不到它。顺序即优先级。
        if (!Array.isArray(o.rows)) {
            return { ok: false, kind: 'absent', reason: 'rows 不是数组（结构漂移，读不出来）' };
        }
        const d = doc();
        if (!d) return { ok: false, kind: 'absent', reason: '没有 document（非浏览器环境）' };
        if (!o.container) return { ok: false, kind: 'absent', reason: '缺少容器' };
        const k = kit();
        if (!k || typeof k.el !== 'function') return { ok: false, kind: 'absent', reason: 'ui-kit-core.js 未加载' };
        const el = k.el;
        /* ui-kit 的 el 是 el(tag, props对象, children)。第二参传字符串会走
         * Object.keys('ls-x') → setAttribute('0','l') → InvalidCharacterError，
         * 而且**只在真机上炸**（Node 自检没有 DOM，一路测不到）。
         * 因此渲染层统一走 mk：class 与文本各归各位。 */
        const mk = (tag, cls, text) => el(tag, {
            class: cls || null,
            text: (text === undefined || text === null) ? null : String(text),
        });

        const cols = normalizeColumns(o.columns);
        const box = o.container;
        while (box.firstChild) box.removeChild(box.firstChild);

        const state = {
            needle: o.needle || '',
            sortKey: o.sortKey || null,
            sortDir: o.sortDir || 'asc',
            page: 1,
            pageSize: Math.max(1, Math.floor(Number(o.pageSize) || 20)),
        };

        const bar = mk('div', 'ls-table-bar');
        const search = mk('input', 'ls-input');
        search.type = 'search';
        search.placeholder = '搜表中内容';
        search.value = state.needle;
        const count = mk('span', 'ls-table-count', '');
        bar.appendChild(search);
        bar.appendChild(count);
        box.appendChild(bar);

        const wrap = mk('div', 'ls-table-wrap');
        const table = mk('table', 'ls-table');
        const thead = el('thead');
        const trh = el('tr');
        const ths = [];
        for (const c of cols) {
            const th = mk('th', '', c.label);
            if (c.align === 'right') th.setAttribute('data-align', 'right');
            if (c.align === 'center') th.setAttribute('data-align', 'center');
            if (c.sortable) {
                th.setAttribute('data-sortable', '1');
                th.setAttribute('tabindex', '0');
                th.addEventListener('click', () => toggleSort(c.key));
                th.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSort(c.key); }
                });
            }
            ths.push(th);
            trh.appendChild(th);
        }
        thead.appendChild(trh);
        table.appendChild(thead);
        const tbody = el('tbody');
        table.appendChild(tbody);
        wrap.appendChild(table);
        box.appendChild(wrap);

        const pager = mk('div', 'ls-pager');
        box.appendChild(pager);

        const emptyLine = mk('div', 'ls-tree-empty', o.emptyText || '这里没有数据');
        box.appendChild(emptyLine);

        function toggleSort(key) {
            if (state.sortKey === key) {
                state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortKey = key;
                state.sortDir = 'asc';
            }
            state.page = 1;
            draw();
        }

        function draw() {
            let view = filterRows(o.rows, state.needle, cols.map((c) => c.key));
            if (state.sortKey) view = sortRows(view, state.sortKey, state.sortDir);
            const pg = paginate(view, state.page, state.pageSize);
            state.page = pg.page;

            cols.forEach((c, i) => {
                if (!c.sortable) return;
                const th = ths[i];
                if (state.sortKey === c.key) {
                    th.setAttribute('aria-sort', state.sortDir === 'asc' ? 'ascending' : 'descending');
                } else {
                    th.setAttribute('aria-sort', 'none');
                }
            });

            while (tbody.firstChild) tbody.removeChild(tbody.firstChild);
            for (const r of pg.rows) {
                const tr = el('tr');
                for (const c of cols) {
                    const td = mk('td', '');
                    if (c.align === 'right') td.setAttribute('data-align', 'right');
                    if (c.align === 'center') td.setAttribute('data-align', 'center');
                    const raw = c.render ? c.render(r) : pluck(r, c.key);
                    const text = (raw === null || raw === undefined || raw === '') ? '—' : String(raw);
                    td.appendChild(d.createTextNode(text));
                    const sub = c.sub ? pluck(r, c.sub) : null;
                    if (sub !== null && sub !== undefined && String(sub).trim() !== '') {
                        const s = mk('span', 'ls-cell-sub', String(sub));
                        s.title = String(sub);
                        td.appendChild(s);
                    }
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }

            count.textContent = pg.total
                ? pg.total + ' 行' + (state.needle ? '（筛后）' : '') + ' · 第 ' + pg.page + '/' + pg.pages + ' 页'
                : '0 行';

            if (!pg.total) {
                emptyLine.style.display = '';
                emptyLine.textContent = o.rows.length
                    ? '筛选条件没有命中任何行（表里有 ' + o.rows.length + ' 行）'
                    : (o.emptyText || '这里没有数据');
            } else {
                emptyLine.style.display = 'none';
            }

            while (pager.firstChild) pager.removeChild(pager.firstChild);
            if (pg.pages > 1) {
                const pgBtn = (label, target, disabled, current) => {
                    const b = mk('button', '', label);
                    b.type = 'button';
                    if (disabled) b.disabled = true;
                    if (current) b.setAttribute('aria-current', 'page');
                    b.addEventListener('click', () => { state.page = target; draw(); });
                    return b;
                };
                pager.appendChild(pgBtn('‹', pg.page - 1, pg.page <= 1, false));
                for (const w of pageWindow(pg.page, pg.pages, 1)) {
                    if (w === '…') {
                        pager.appendChild(mk('span', 'ls-table-count', '…'));
                    } else {
                        pager.appendChild(pgBtn(String(w), w, false, w === pg.page));
                    }
                }
                pager.appendChild(pgBtn('›', pg.page + 1, pg.page >= pg.pages, false));
            }
        }

        search.addEventListener('input', () => {
            state.needle = search.value;
            state.page = 1;
            draw();
        });

        draw();
        return { ok: true, kind: 'ok', total: o.rows.length, columns: cols.length };
    }

    /* ── 自检 ─────────────────────────────────────────────────── */
    function selfCheck() {
        const fails = [];
        const checks = [];
        const ok = (name, cond, detail) => {
            checks.push({ name, ok: !!cond, detail });
            if (!cond) fails.push(name + (detail ? '：' + detail : ''));
        };

        const nums = [{ n: 10 }, { n: 9 }, { n: 100 }];
        const asc = sortRows(nums, 'n', 'asc').map((r) => r.n);
        ok('数字按数值升序（10 不排在 9 前面）', asc.join(',') === '9,10,100', asc.join(','));
        ok('数字降序', sortRows(nums, 'n', 'desc').map((r) => r.n).join(',') === '100,10,9');

        const mixed = [{ v: 'b' }, { v: null }, { v: 'a' }, { v: '' }];
        const mAsc = sortRows(mixed, 'v', 'asc').map((r) => r.v);
        ok('升序时空值沉底', mAsc[0] === 'a' && mAsc[1] === 'b' && mAsc[2] === null && mAsc[3] === '',
            JSON.stringify(mAsc));
        const mDesc = sortRows(mixed, 'v', 'desc').map((r) => r.v);
        ok('降序时空值仍沉底', mDesc[0] === 'b' && mDesc[1] === 'a' && mDesc[2] === null && mDesc[3] === '',
            JSON.stringify(mDesc));

        const src = [{ n: 2 }, { n: 1 }];
        const copy = sortRows(src, 'n', 'asc');
        ok('排序不修改入参', src[0].n === 2 && copy[0].n === 1);

        const st = [{ k: 1, tag: 'x' }, { k: 1, tag: 'y' }, { k: 1, tag: 'z' }];
        ok('同值保持原顺序（稳定）',
            sortRows(st, 'k', 'asc').map((r) => r.tag).join('') === 'xyz');

        ok('支持 a.b 路径取值', pluck({ a: { b: 7 } }, 'a.b') === 7);
        ok('支持函数取值器', pluck({ a: 1 }, (r) => r.a + 1) === 2);

        const rows2 = [{ name: '甲', note: '剑' }, { name: '乙', note: '信' }];
        ok('过滤命中指定列', filterRows(rows2, '剑', ['note']).length === 1);
        ok('过滤空词全通过', filterRows(rows2, '   ').length === 2);
        ok('过滤不命中返回 0', filterRows(rows2, '不存在').length === 0);

        const many = Array.from({ length: 45 }, (_, i) => ({ i }));
        const p1 = paginate(many, 1, 20);
        ok('第 1 页 20 行、共 3 页', p1.rows.length === 20 && p1.pages === 3,
            JSON.stringify({ n: p1.rows.length, p: p1.pages }));
        ok('页码区间读数正确', p1.from === 1 && p1.to === 20, p1.from + '-' + p1.to);
        const pOver = paginate(many, 99, 20);
        ok('越界页被夹到末页（不渲染空页）', pOver.page === 3 && pOver.rows.length === 5,
            JSON.stringify({ page: pOver.page, n: pOver.rows.length }));
        const pZero = paginate([], 1, 20);
        ok('空表仍算第 1/1 页', pZero.page === 1 && pZero.pages === 1 && pZero.rows.length === 0);

        const win = pageWindow(5, 10, 1);
        ok('页码窗口含首尾与当前邻页',
            win[0] === 1 && win[win.length - 1] === 10 && win.indexOf(5) >= 0, JSON.stringify(win));

        const nc = normalizeColumns(['a', { key: 'b', label: 'B', align: 'right' }]);
        ok('字符串列归一化成对象', nc[0].key === 'a' && nc[0].label === 'a');
        ok('列默认左对齐、默认可排序', nc[0].align === 'left' && nc[0].sortable === true);

        const r1 = renderTable({ container: null, rows: [] });
        ok('无容器判 absent', r1.ok === false && r1.kind === 'absent');
        const fake = { firstChild: null, removeChild() {}, appendChild() {} };
        const r2 = renderTable({ container: fake, rows: { not: 'array' } });
        ok('rows 非数组判 absent（结构漂移）',
            r2.kind === 'absent' && /结构漂移/.test(r2.reason), JSON.stringify(r2));

        return { ok: fails.length === 0, version: VERSION, total: checks.length, failed: fails.length, fails, checks };
    }

    return {
        VERSION,
        pluck, compareValues,
        sortRows, filterRows, paginate, pageWindow, normalizeColumns,
        renderTable,
        selfCheck,
    };
});