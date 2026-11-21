/**
 * ui-summary-tree.js — [V4 呈现层] 递归摘要树
 *
 * 【学自柏宝书 SummaryNode.vue 的三件具体手法】
 *   1. 节点是「卡片 + 底部整条展开开关」，不是「一行 + 小三角」。
 *   2. children 按覆盖楼层**倒序** —— 最近发生的事在最近的地方，
 *      玩家往下滚的第一屏应该是还没忘的剧情，不是开局那句。
 *   3. 内容常驻 DOM，用 grid 0fr↔1fr 撑开（非 display:none），折叠不重建。
 *
 * 【本仓与柏宝书的结构差异（不照抄的部分）】
 *   柏宝书是 Vue 应用，摘要节点自带 parentId 树。
 *   本仓的摘要是**按楼层线性**存的（engine.summary.summaries 每条一个 floor），
 *   没有父子关系。硬造 parentId 只会得到一棵假树。
 *   所以这里用**真实存在的第二维**做层级：楼层区间。
 *     顶层 = 每 CHAPTER_SIZE 楼一组（一个「幕」）
 *     子层 = 该幕内的逐楼摘要
 *   这个分层不引入任何新状态，纯由现有 floor 推导 —— 面板关闭后不残留。
 *
 * 【为什么不在这里写逻辑】
 *   取数只走 engine.summary 的既有方法（getActiveSummaries / missingFloors /
 *   addManualSummary / updateSummaryText）。本文件不缓存、不重算、不落盘。
 *   这样「面板看到的」与「引擎用的」永远是同一份数据。
 */
(function (root) {
    'use strict';

    const TREE_VERSION = '1.0.0';
    const CHAPTER_SIZE = 10; // 每幕楼层数：10 楼一屏，手机上不至于太长

    /** 取 kit：宿主由 manifest 保证 ui-kit-core.js 先加载 */
    function kit() {
        const k = (typeof window !== 'undefined' && window.LonShaUiKit)
            || (root && root.LonShaUiKit)
            || (typeof require === 'function' ? safeRequire('./ui-kit-core.js') : null);
        if (!k) throw new Error('ui-summary-tree: ui-kit-core.js 未加载');
        return k;
    }

    function safeRequire(p) {
        try { return require(p); } catch (_e) { return null; }
    }

    function plugin() {
        return (root && root.LonShaMemory) || null;
    }

    function engine() {
        const p = plugin();
        return (p && p.engine) || null;
    }

    /* ================================================================
     * 1. 取数（唯一的读入口）
     *    返回 { ok, kind, userStartSet, floors, missing, reason }
     *    kind: 'ok' | 'absent' | 'empty' | 'error'
     *    【纪律】absent 与 empty 必须分开：引擎没装 ≠ 对话还没有摘要。
     * ================================================================ */
    function readSummaries() {
        const eng = engine();
        if (!eng) return { ok: false, kind: 'absent', reason: '引擎未加载（LonShaMemory.engine 不存在）' };
        const sum = eng.summary;
        if (!sum) return { ok: false, kind: 'absent', reason: '摘要服务缺席（engine.summary 不存在）' };
        let list = [];
        try {
            list = typeof sum.getActiveSummaries === 'function'
                ? (sum.getActiveSummaries() || [])
                : (Array.isArray(sum.summaries) ? sum.summaries : []);
        } catch (e) {
            return { ok: false, kind: 'error', reason: '取摘要失败：' + ((e && e.message) || e) };
        }
        if (!Array.isArray(list)) return { ok: false, kind: 'error', reason: '取摘要返回非数组' };

        const items = list
            .filter((s) => s && Number.isFinite(Number(s.floor)))
            .map((s) => ({
                floor: Number(s.floor),
                text: String(s.text || ''),
                edited: !!s.edited,
                rewritten: !!s.rewritten,
                omit: !!s.omit,
            }))
            // 倒序：最近楼层在前
            .sort((a, b) => b.floor - a.floor);

        let missing = [];
        try {
            if (typeof sum.missingFloors === 'function') {
                const chatLen = Number(root.SillyTavern?.getContext?.()?.chat?.length || 0);
                const maxFloor = chatLen > 0 ? chatLen - 1 : (items.length ? items[0].floor : 0);
                missing = sum.missingFloors(maxFloor) || [];
            }
        } catch (_e) { missing = []; }

        return {
            ok: true,
            kind: items.length ? 'ok' : 'empty',
            items,
            missing,
            total: items.length,
            engineHasEdit: typeof sum.updateSummaryText === 'function',
            engineHasAdd: typeof sum.addManualSummary === 'function',
        };
    }

    /* ================================================================
     * 2. 分层：把线性摘要按楼层区间折成「幕」
     *    纯函数，方便在 Node 里单测（selfCheck 会跑）。
     * ================================================================ */
    function buildChapters(items, size) {
        const step = Math.max(1, Number(size) || CHAPTER_SIZE);
        const list = Array.isArray(items) ? items.slice() : [];
        // 已按 floor 倒序传入；这里不再排序，避免把调用方的顺序意图覆盖掉
        const map = new Map();
        list.forEach((it) => {
            const f = Number(it.floor);
            const chapter = Math.floor(f / step);
            if (!map.has(chapter)) map.set(chapter, []);
            map.get(chapter).push(it);
        });
        const chapters = Array.from(map.entries())
            .map(([idx, kids]) => ({
                idx,
                start: idx * step,
                end: idx * step + step - 1,
                items: kids.sort((a, b) => b.floor - a.floor),
                count: kids.length,
            }))
            .sort((a, b) => b.idx - a.idx);
        return chapters;
    }

    /** 楼层区间的人话标签 */
    function chapterLabel(ch) {
        const span = ch.start === ch.end ? String(ch.start) : ch.start + '-' + ch.end;
        return '第 ' + span + ' 楼';
    }

    /* ================================================================
     * 3. 单个楼层节点
     * ================================================================ */
    function floorNode(it, ctx) {
        const k = kit();
        const badges = [];
        if (it.omit) badges.push(k.badge('warn', '番外'));
        if (it.rewritten) badges.push(k.badge('info', '改写'));
        else if (it.edited) badges.push(k.badge('mute', '校正'));

        const meta = k.el('div', { class: 'lsu-node-meta' }, [
            k.el('span', { class: 'lsu-loc', text: '#' + it.floor }),
            k.el('span', { text: String(it.text.length) + ' 字' }),
            badges,
        ]);

        const textNode = k.el('div', {
            class: 'lsu-node-text is-clamp',
            text: it.text || '（空摘要）',
        });

        const acts = k.el('div', { class: 'lsu-node-acts' }, [
            k.link('改', () => ctx.onEdit(it), { title: '编辑这条摘要' }),
            k.link('删', () => ctx.onDelete(it), { danger: true, title: '删除这条摘要' }),
        ]);

        const cardObj = k.card({
            title: '第 ' + it.floor + ' 楼',
            kind: it.rewritten ? 'warn' : (it.omit ? 'mute' : undefined),
            body: k.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, [meta, textNode]),
            foot: acts,
        });
        return cardObj.root;
    }

    /* ================================================================
     * 4. 一幕节点（含子层）
     * ================================================================ */
    function chapterNode(ch, ctx) {
        const k = kit();
        const kids = k.el('div', { class: 'lsu-node-kids' });
        const foldObj = k.fold({
            children: kids,
            labelOpen: '收起本幕 ' + ch.count + ' 条',
            labelClosed: '展开本幕 ' + ch.count + ' 条',
            onFirstOpen: (host) => {
                // 首次展开才建子节点：一部长对话可能有上百条摘要
                ch.items.forEach((it) => host.appendChild(floorNode(it, ctx)));
            },
        });

        const head = k.el('div', { class: 'lsu-card-head' }, [
            k.el('div', { class: 'lsu-card-title', text: chapterLabel(ch) }),
            k.badge('mute', ch.count + ' 条'),
        ]);

        const node = k.el('div', { class: 'lsu-node has-kids' }, [
            k.el('div', { class: 'lsu-card' }, [head, foldObj.root]),
        ]);
        return node;
    }

    /* ================================================================
     * 5. 渲染面板
     *    openSummaryTree({ onChanged }) → { close, refresh }
     * ================================================================ */
    function openSummaryTree(opts) {
        const k = kit();
        const o = opts || {};
        k.ensureStyle();

        let filter = '';
        let data = readSummaries();

        const listHost = k.el('div', { class: 'lsu-tree' });
        const statHost = k.el('div', { class: 'lsu-node-meta' });

        const search = k.searchBox({
            placeholder: '搜摘要内容 / 楼层号…',
            onInput: (v) => { filter = String(v || '').trim().toLowerCase(); paintList(); },
        });

        const refreshAll = () => {
            data = readSummaries();
            paintStat();
            paintList();
        };

        const btnRefresh = k.btn('重读', { small: true, onClick: refreshAll });
        const btnExpandAll = k.btn('全展开', {
            small: true,
            onClick: () => {
                Array.from(listHost.querySelectorAll('.lsu-foldbar')).forEach((bar) => {
                    if (bar.getAttribute('aria-expanded') !== 'true') bar.click();
                });
            },
        });
        const btnCollapseAll = k.btn('全收起', {
            small: true,
            onClick: () => {
                Array.from(listHost.querySelectorAll('.lsu-foldbar')).forEach((bar) => {
                    if (bar.getAttribute('aria-expanded') === 'true') bar.click();
                });
            },
        });

        const p = k.panel({
            title: '剧情回顾 · 摘要树',
            sub: '按楼层区间分层；倒序显示，最近的在最上面。',
            width: '440px',
            foot: k.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } }, [btnRefresh, btnExpandAll, btnCollapseAll]),
        });

        p.body.appendChild(k.toolbar([search.root]));
        p.body.appendChild(statHost);
        p.body.appendChild(listHost);

        function paintStat() {
            statHost.textContent = '';
            if (!data.ok) {
                statHost.appendChild(k.badge('mute', data.kind === 'absent' ? '未加载' : '读取失败'));
                if (data.reason) statHost.appendChild(k.el('span', { text: data.reason }));
                return;
            }
            statHost.appendChild(k.badge('ok', data.total + ' 条'));
            if (data.missing && data.missing.length) {
                statHost.appendChild(k.badge('warn', '缺 ' + data.missing.length + ' 楼'));
            } else {
                statHost.appendChild(k.badge('mute', '无缺失'));
            }
            if (!data.engineHasEdit) statHost.appendChild(k.badge('warn', '引擎不支持改写'));
        }

        function paintList() {
            listHost.textContent = '';
            if (!data.ok) {
                listHost.appendChild(k.empty({
                    kind: data.kind === 'absent' ? 'absent' : 'error',
                    title: data.kind === 'absent' ? '摘要服务未加载' : '读取摘要失败',
                    hint: data.reason || '',
                }));
                return;
            }
            if (!data.items.length) {
                listHost.appendChild(k.empty({
                    kind: 'empty',
                    title: '还没有摘要',
                    hint: '对话推进后引擎会自动落摘要；也可以从楼层面板手动补录一条。',
                }));
                return;
            }
            const filtered = filter
                ? data.items.filter((it) => String(it.floor).indexOf(filter) >= 0 || it.text.toLowerCase().indexOf(filter) >= 0)
                : data.items;
            if (!filtered.length) {
                listHost.appendChild(k.empty({ kind: 'empty', title: '没有匹配项', hint: '试试搜楼层号，或清空搜索框。' }));
                return;
            }
            const chapters = buildChapters(filtered, CHAPTER_SIZE);
            const ctx = {
                onEdit: (it) => editOne(it),
                onDelete: (it) => deleteOne(it),
            };
            chapters.forEach((ch) => listHost.appendChild(chapterNode(ch, ctx)));
        }

        async function editOne(it) {
            const f = k.field({ label: '第 ' + it.floor + ' 楼摘要', value: it.text, multiline: true });
            const sub = k.panel({
                title: '编辑摘要',
                sub: '手工编辑会被记为「校正」；若改动跨度很大，引擎会标记为「改写」。',
                width: '440px',
                foot: k.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } }, [
                    k.btn('保存', {
                        kind: 'primary',
                        onClick: () => {
                            const eng = engine();
                            const sum = eng && eng.summary;
                            const next = String(f.input.value || '');
                            if (!next.trim()) { f.setError('摘要不能为空'); return; }
                            if (!sum || typeof sum.updateSummaryText !== 'function') { f.setError('当前引擎不支持改写摘要'); return; }
                            let okRes = false;
                            try {
                                okRes = sum.updateSummaryText(it.floor, next, { byUser: true });
                            } catch (e) {
                                f.setError('保存失败：' + ((e && e.message) || e));
                                return;
                            }
                            if (okRes === false) {
                                // engine 唯一硬拒：抹掉已锁定事实
                                f.setError('被拒绝：这次编辑会抹掉已锁定的事实');
                                return;
                            }
                            sub.close();
                            k.toast('已保存第 ' + it.floor + ' 楼摘要', 'ok');
                            refreshAll();
                            if (typeof o.onChanged === 'function') { try { o.onChanged(); } catch (_e) { /* ignore */ } }
                        },
                    }),
                    k.btn('取消', { onClick: () => sub.close() }),
                ]),
            });
            sub.body.appendChild(f.root);
        }

        async function deleteOne(it) {
            const yes = await k.modal({
                title: '删除第 ' + it.floor + ' 楼摘要？',
                body: k.el('div', {}, [
                    k.el('div', { text: '删除后该楼层会重新变成「缺失」，下一轮维护可能再次补摘要。' }),
                    k.el('div', { style: { marginTop: '8px', opacity: '0.8' }, text: k.clampText(it.text, 80) }),
                ]),
                confirmText: '删除',
                danger: true,
            });
            if (!yes) return;
            const eng = engine();
            const sum = eng && eng.summary;
            if (!sum || !Array.isArray(sum.summaries)) { k.toast('引擎结构不支持删除', 'bad'); return; }
            const before = sum.summaries.length;
            sum.summaries = sum.summaries.filter((s) => Number(s.floor) !== Number(it.floor));
            const removed = before - sum.summaries.length;
            if (!removed) { k.toast('没找到这条摘要', 'warn'); return; }
            try { if (eng.bm25 && typeof eng.bm25.rebuild === 'function') eng.bm25.rebuild(sum.summaries.map((x) => ({ id: 'sum_' + x.floor, text: x.text, floor: x.floor, source: 'bm25' }))); } catch (_e) { /* ignore */ }
            k.toast('已删除 ' + removed + ' 条', 'ok');
            refreshAll();
            if (typeof o.onChanged === 'function') { try { o.onChanged(); } catch (_e) { /* ignore */ } }
        }

        paintStat();
        paintList();

        return { close: p.close, refresh: refreshAll };
    }

    /* ================================================================
     * 6. 自检
     * ================================================================ */
    function selfCheck() {
        const fails = [];
        const checks = [];
        const ok = (name, cond, detail) => {
            checks.push({ name, ok: !!cond, detail });
            if (!cond) fails.push(name + (detail ? '：' + detail : ''));
        };

        // 分层：倒序 + 区间正确
        const items = [
            { floor: 23, text: 'a' }, { floor: 12, text: 'b' }, { floor: 11, text: 'c' },
            { floor: 3, text: 'd' }, { floor: 0, text: 'e' },
        ];
        const chs = buildChapters(items, 10);
        ok('分层幕数正确', chs.length === 3, 'got ' + chs.length);
        ok('幕按楼层倒序', chs[0].idx > chs[1].idx && chs[1].idx > chs[2].idx);
        ok('幕内条目按楼层倒序', chs[0].items[0].floor === 23);
        ok('区间标签正确', chs[0].start === 20 && chs[0].end === 29);
        ok('首幕含第 0 与第 3 楼', chs[2].start === 0 && chs[2].items.length === 2);
        ok('首幕内同样倒序', chs[2].items[0].floor === 3 && chs[2].items[1].floor === 0);
        ok('chapterLabel 单楼层合并区间', chapterLabel({ start: 5, end: 5 }) === '第 5 楼');
        ok('chapterLabel 多楼层用连字符', chapterLabel({ start: 10, end: 19 }) === '第 10-19 楼');

        // 空输入不炸
        ok('空输入返回空数组', buildChapters(null, 10).length === 0);
        ok('size=0 回落默认幕宽（第 3 楼归首幕）', buildChapters([{ floor: 3 }], 0)[0].start === 0);
        ok('size=1 时每楼自成一幕', buildChapters([{ floor: 3 }, { floor: 4 }], 1).length === 2);

        // 无引擎时是 absent 而不是 empty
        const saved = root.LonShaMemory;
        try {
            root.LonShaMemory = null;
            const r = readSummaries();
            ok('无引擎 → 判 absent', r.ok === false && r.kind === 'absent');
        } finally {
            if (saved !== undefined) root.LonShaMemory = saved;
        }

        return { ok: fails.length === 0, version: TREE_VERSION, total: checks.length, failed: fails.length, fails, checks };
    }

    const api = {
        VERSION: TREE_VERSION,
        CHAPTER_SIZE,
        buildChapters,
        chapterLabel,
        readSummaries,
        openSummaryTree,
        selfCheck,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LonShaSummaryTree = api;
    if (typeof window !== 'undefined') window.LonShaSummaryTree = api;
})(typeof window !== 'undefined' ? window : globalThis);