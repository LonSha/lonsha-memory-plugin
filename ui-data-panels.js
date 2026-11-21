/**
 * ui-data-panels.js — [V4 呈现层] 四个数据面板：NPC 关系 / 在场 / 状态变量 / 物品
 *
 * 【为什么合在一个文件】
 *   这四个面板的形态完全同构：**取一份数组 → 分组 → 每组分卡片 → 卡片内键值 →
 *   搜索过滤 → 空态人话**。柏宝书把它们拆成四个 Vue 页面，是因为每个页面还有
 *   自己的表单与动作；本仓这四个都只是「看」（写入口在引擎侧，面板不写数据），
 *   四个页面会变成四份相同的骨架。合成一个文件后，"分组 + 卡片"只需实现一次。
 *
 * 【一条硬纪律：本文件不写任何数据】
 *   四个面板全部只读。原因不是懒，而是这四个数据源都有各自的真源：
 *     · NPC 关系  = engine.getNpcTiesRecords()（合并 status.npcTies 与 graph 长期羁绊边）
 *     · 在场      = engine.scene.presence（Map: name -> {atFloor}）
 *     · 状态变量  = engine.status.baselines / drifts（人设基线与近期漂移）
 *     · 物品      = engine.items.records（**派生视图**，真源是 itemOps 重放）
 *   面板若就地改这些对象，会绕过真源的失效判定（items._stale / 指纹对账），
 *   表现是「面板上改好了，下一轮又变回去」——本仓已经在物品台账上踩过一次。
 *   所以这里的每个动作按钮只做两件事：跳去真源面板，或明确告诉你「只读」。
 *
 * 【如实标注的两处缺口（不假装有）】
 *   1. worldProg.scenes 是**已声明但无写入方**的槽（只有 export/import 与初始化）。
 *      面板把它单列一节并写明「暂无写入方」，而不是把它渲染成「没有场景」。
 *   2. items.records 有硬上限（只保留最近 25 条派生记录）。面板把 _stale 与
 *      上限都显示出来，避免用户以为「物品就这么多」。
 */
(function (root) {
    'use strict';

    const VERSION = '1.0.0';

    function kit() {
        const k = (typeof window !== 'undefined' && window.LonShaUiKit)
            || (root && root.LonShaUiKit)
            || (typeof require === 'function' ? safeRequire('./ui-kit-core.js') : null);
        if (!k) throw new Error('ui-data-panels: ui-kit-core.js 未加载');
        return k;
    }

    function safeRequire(p) {
        try { return require(p); } catch (_e) { return null; }
    }

    function engine() {
        const p = (root && root.LonShaMemory) || null;
        return (p && p.engine) || null;
    }

    /* 表格视图的库。三级回退：全局（宿主已加载）→ 本仓 require → null。
     * 解析不到时**不抛**：面板要能照常开，只是少了表格能力，并如实提示。 */
    function tableLib() {
        try { if (root && root.LonShaUiTable) return root.LonShaUiTable; } catch (_e) { /* ignore */ }
        try {
            if (typeof window !== 'undefined' && window.LonShaUiTable) return window.LonShaUiTable;
        } catch (_e) { /* ignore */ }
        return typeof require === 'function' ? safeRequire('./ui-table.js') : null;
    }

    /* 原始结构树的库。回退顺序同上。 */
    function jsonLib() {
        try { if (root && root.LonShaJsonTree) return root.LonShaJsonTree; } catch (_e) { /* ignore */ }
        try {
            if (typeof window !== 'undefined' && window.LonShaJsonTree) return window.LonShaJsonTree;
        } catch (_e) { /* ignore */ }
        return typeof require === 'function' ? safeRequire('./ui-json-tree.js') : null;
    }

    /* ================================================================
     * 0. 通用小工具（纯函数，Node 可测）
     * ================================================================ */

    /** 安全取数：任何一步抛错都落成 {ok:false, kind:'error'}，绝不把异常吞成空数组 */
    function safeRead(label, fn) {
        try {
            const v = fn();
            return { ok: true, kind: 'ok', value: v };
        } catch (e) {
            return { ok: false, kind: 'error', reason: label + ' 读取失败：' + ((e && e.message) || e) };
        }
    }

    /** 按某个键把数组分组，保持首次出现顺序（不排序：真源的顺序本身有语义） */
    function groupBy(list, keyOf) {
        const out = new Map();
        (Array.isArray(list) ? list : []).forEach((it) => {
            if (!it) return;
            const k = String(keyOf(it) || '');
            if (!out.has(k)) out.set(k, []);
            out.get(k).push(it);
        });
        return out;
    }

    /** 大小写不敏感的模糊匹配；空串视为「全部通过」 */
    function matches(text, needle) {
        const n = String(needle || '').trim().toLowerCase();
        if (!n) return true;
        return String(text || '').toLowerCase().indexOf(n) >= 0;
    }

    /* ================================================================
     * 1. NPC 关系
     * ================================================================ */
    function readNpcTies() {
        const eng = engine();
        if (!eng) return { ok: false, kind: 'absent', reason: '引擎未加载' };
        if (typeof eng.getNpcTiesRecords !== 'function') {
            return { ok: false, kind: 'absent', reason: '该引擎版本没有 getNpcTiesRecords（关系账未接入）' };
        }
        const r = safeRead('NPC 关系', () => eng.getNpcTiesRecords());
        if (!r.ok) return r;
        const rows = (Array.isArray(r.value) ? r.value : [])
            .filter((x) => x && x.name)
            .map((x) => ({
                name: String(x.name),
                ties: Array.isArray(x.ties) ? x.ties.map((t) => String(t)).filter(Boolean) : [],
            }));
        return { ok: true, kind: rows.length ? 'ok' : 'empty', rows, total: rows.length };
    }

    /* ================================================================
     * 2. 在场角色（scene.presence）+ 场景槽（worldProg.scenes，无写入方）
     * ================================================================ */
    function readPresence() {
        const eng = engine();
        if (!eng) return { ok: false, kind: 'absent', reason: '引擎未加载' };
        const scene = eng.scene || null;
        if (!scene) return { ok: false, kind: 'absent', reason: '场景账缺席（engine.scene 不存在）' };

        const presence = scene.presence;
        let rows = [];
        if (presence && typeof presence.forEach === 'function') {
            presence.forEach((v, k) => {
                rows.push({
                    name: String(k),
                    atFloor: Number(v && v.atFloor) || 0,
                    extra: v && typeof v === 'object' ? v : {},
                });
            });
        }
        // 最近登场在前
        rows.sort((a, b) => b.atFloor - a.atFloor);

        // 场景槽：只报「有没有写入方」，不伪造内容
        let sceneSlots = [];
        try {
            const wp = eng.worldProg;
            if (wp && Array.isArray(wp.scenes)) sceneSlots = wp.scenes;
        } catch (_e) { sceneSlots = []; }

        return {
            ok: true,
            kind: rows.length ? 'ok' : 'empty',
            rows,
            total: rows.length,
            sceneSlots,
            sceneSlotNote: 'worldProg.scenes 只有声明与持久化，当前没有写入方 —— 这一节空着是事实，不是故障。',
        };
    }

    /* ================================================================
     * 3. 状态变量（baselines 人设基线 + drifts 近期漂移）
     * ================================================================ */
    function readStateVars() {
        const eng = engine();
        if (!eng) return { ok: false, kind: 'absent', reason: '引擎未加载' };
        const st = eng.status || null;
        if (!st) return { ok: false, kind: 'absent', reason: '角色状态账缺席（engine.status 不存在）' };
        if (!st.baselines && !st.drifts) {
            return { ok: false, kind: 'absent', reason: '该引擎版本没有 baselines / drifts（状态变量未启用）' };
        }
        const baselines = (st.baselines && typeof st.baselines === 'object') ? st.baselines : {};
        const drifts = (st.drifts && typeof st.drifts === 'object') ? st.drifts : {};
        const names = Array.from(new Set([...Object.keys(baselines), ...Object.keys(drifts)]));
        const rows = names.map((name) => ({
            name,
            baseline: baselines[name] || null,
            drift: drifts[name] || null,
            hasBaseline: !!baselines[name],
            hasDrift: !!drifts[name],
        }));
        return { ok: true, kind: rows.length ? 'ok' : 'empty', rows, total: rows.length };
    }

    /* ================================================================
     * 4. 物品（派生视图 items.records）
     * ================================================================ */
    function readItems() {
        const eng = engine();
        if (!eng) return { ok: false, kind: 'absent', reason: '引擎未加载' };
        const box = eng.items;
        if (!box) return { ok: false, kind: 'absent', reason: '物品台账缺席（engine.items 不存在）' };
        const records = Array.isArray(box.records) ? box.records : null;
        if (records === null) return { ok: false, kind: 'absent', reason: 'engine.items.records 不是数组（结构漂移）' };
        const rows = records.filter(Boolean).map((it) => ({
            name: String(it.name || '（无名）'),
            desc: String(it.desc || ''),
            holder: String(it.holder || '无主'),
            state: String(it.state || '完好'),
            carried: it.carried === true,
            location: String(it.location || ''),
            lendTo: String(it.lendTo || ''),
            borrowFrom: String(it.borrowFrom || ''),
            returnDue: String(it.returnDue || ''),
            floor: Number(it.floor) || 0,
        }));
        // 持有者分组：无主 / 随身 / 某个地点 三类分开，避免名字混成一锅
        const groups = groupBy(rows, (it) => (it.carried ? '随身携带' : (it.location ? '在：' + it.location : it.holder)));
        return {
            ok: true,
            kind: rows.length ? 'ok' : 'empty',
            rows,
            groups,
            total: rows.length,
            stale: Number(box._stale) || 0,
            capped: rows.length >= 25,
        };
    }

    /* ================================================================
     * 5. 通用列表渲染
     *    renderPanel({ title, sub, read, buildRow, emptyHint, summary })
     * ================================================================ */
    function renderPanel(opts) {
        const k = kit();
        const o = opts || {};
        k.ensureStyle();

        let data = o.read();
        let filter = '';

        const listHost = k.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
        const statHost = k.el('div', { class: 'lsu-node-meta' });
        const search = k.searchBox({
            placeholder: o.searchPlaceholder || '搜索…',
            onInput: (v) => { filter = v; paint(); },
        });

        /* 底栏按钮按能力装配：面板没提供 onTable / onRaw 就不出现对应按钮，
         * 避免「按钮在那儿但点了没反应」——那是比不放按钮更差的状态。 */
        const footBtns = [k.btn('重读', { onClick: () => { data = o.read(); paint(); } })];
        if (typeof o.onTable === 'function') {
            footBtns.push(k.btn('表格视图', { onClick: () => o.onTable(data, k) }));
        }
        if (typeof o.onRaw === 'function') {
            footBtns.push(k.btn('原始结构', { onClick: () => o.onRaw(data, k) }));
        }

        const panelObj = k.panel({
            title: o.title,
            sub: o.sub,
            width: o.width || '440px',
            foot: k.el('div', { style: { display: 'flex', gap: '8px', width: '100%', flexWrap: 'wrap' } }, footBtns),
        });

        panelObj.body.appendChild(k.toolbar([search.root]));
        panelObj.body.appendChild(statHost);
        panelObj.body.appendChild(listHost);

        function paintStat() {
            statHost.textContent = '';
            if (!data.ok) {
                statHost.appendChild(k.badge('mute', data.kind === 'absent' ? '未加载' : '读取失败'));
                if (data.reason) statHost.appendChild(k.el('span', { text: data.reason }));
                return;
            }
            (o.summary ? o.summary(data) : []).forEach(([kind, text]) => {
                if (text) statHost.appendChild(k.badge(kind, text));
            });
        }

        function paint() {
            paintStat();
            listHost.textContent = '';
            if (!data.ok) {
                listHost.appendChild(k.empty({
                    kind: data.kind === 'absent' ? 'absent' : 'error',
                    title: o.absentTitle || '数据未加载',
                    hint: data.reason || '',
                }));
                return;
            }
            if (!data.total) {
                listHost.appendChild(k.empty({ kind: 'empty', title: o.emptyTitle || '暂无数据', hint: o.emptyHint || '' }));
                return;
            }
            const built = o.build(data, filter, k);
            if (!built || (Array.isArray(built) ? !built.length : false)) {
                listHost.appendChild(k.empty({ kind: 'empty', title: '没有匹配项', hint: '试试清空搜索框。' }));
                return;
            }
            (Array.isArray(built) ? built : [built]).forEach((n) => n && listHost.appendChild(n));
        }

        paint();
        return { close: panelObj.close, refresh: () => { data = o.read(); paint(); } };
    }

    /* ================================================================
     * 5.1 通用表格视图（消费 ui-table.js）
     *     卡片视图答「这件东西是什么」，表格答「一共多少、怎么排、谁跟谁」。
     *     判定顺序与 ui-table 保持一致：结构漂移 → 环境缺失 → 正常。
     * ================================================================ */
    function openRowsTable(opts) {
        const k = kit();
        const T = tableLib();
        const o = opts || {};
        if (!T || typeof T.renderTable !== 'function') {
            return { ok: false, kind: 'absent', reason: 'ui-table.js 未加载（表格视图不可用）' };
        }
        if (!Array.isArray(o.rows)) {
            return { ok: false, kind: 'absent', reason: 'rows 不是数组（结构漂移，读不出来）' };
        }
        if (typeof document === 'undefined' || !document.body) {
            return { ok: false, kind: 'absent', reason: '没有 document（非浏览器环境）' };
        }
        const host = k.el('div', { class: 'lsu-table-host', style: { minHeight: '140px' } });
        const panelObj = k.panel({ title: o.title || '表格', sub: o.sub || '', width: o.width || '780px' });
        panelObj.body.appendChild(host);
        const r = T.renderTable({
            container: host,
            rows: o.rows,
            columns: o.columns || [],
            pageSize: o.pageSize || 20,
            emptyText: o.emptyText || '这里没有数据',
        });
        return { ok: true, kind: 'ok', close: panelObj.close, render: r };
    }

    /* 打开原始结构树：面板只给派生视图，看不出「真没有」与「读错了」的区别，
     * 所以留一个口子摊开同一份数据。 */
    function openRawTree(data, title, k) {
        const kk = k || kit();
        const J = jsonLib();
        if (!J || typeof J.openJsonTree !== 'function') {
            kk.toast('ui-json-tree.js 未加载，原始结构不可用');
            return { ok: false, kind: 'absent', reason: 'ui-json-tree.js 未加载' };
        }
        const r = J.openJsonTree({ data: data, title: title || '原始结构' });
        if (r && r.ok === false) kk.toast(r.reason || '原始结构打不开');
        return r;
    }

    /* ================================================================
     * 6. 四个面板
     * ================================================================ */
    function openNpcPanel() {
        const k = kit();
        return renderPanel({
            title: 'NPC 关系',
            sub: '来自 getNpcTiesRecords()：status.npcTies 与图谱长期羁绊边的合并结果。只读。',
            read: readNpcTies,
            summary: (d) => [['info', d.total + ' 人'], ['mute', '只读']],
            emptyTitle: '还没有 NPC 关系记录',
            emptyHint: '关系账在 NPC 首次有长期羁绊时落记录（血缘、师徒、宿敌这类「不会变」的边也算）。',
            searchPlaceholder: '搜人名或关系…',
            build: (d, filter, kk) => {
                const rows = d.rows.filter((r) => matches(r.name, filter) || r.ties.some((t) => matches(t, filter)));
                return rows.map((r) => kk.card({
                    title: r.name,
                    badge: { kind: r.ties.length ? 'info' : 'mute', text: r.ties.length + ' 条羁绊' },
                    body: r.ties.length
                        ? kk.el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
                            r.ties.map((t) => kk.badge('mute', t)))
                        : kk.el('div', { class: 'lsu-empty-hint', text: '有记录但没有羁绊词（关系账只落了人名）' }),
                }).root);
            },
        });
    }

    function openScenePanel() {
        const k = kit();
        return renderPanel({
            title: '在场角色',
            sub: '来自 scene.presence（name → {atFloor}）。只读；下面的「场景槽」是已声明但暂无写入方的槽。',
            read: readPresence,
            summary: (d) => [
                ['info', d.total + ' 人在场'],
                d.sceneSlots.length ? ['warn', d.sceneSlots.length + ' 个场景槽有内容'] : ['mute', '场景槽空'],
            ],
            emptyTitle: '当前没有在场记录',
            emptyHint: '在场账在角色登场时写入；空可能是因为这轮还没人登场。',
            searchPlaceholder: '搜人名…',
            build: (d, filter, kk) => {
                const out = [];
                const rows = d.rows.filter((r) => matches(r.name, filter));
                rows.forEach((r) => out.push(kk.card({
                    title: r.name,
                    badge: { kind: 'info', text: '第 ' + r.atFloor + ' 楼登场' },
                    body: kk.kv([['最近登场', r.atFloor, { numeric: true }]]),
                }).root));
                if (!filter) {
                    out.push(kk.card({
                        title: '场景槽（worldProg.scenes）',
                        badge: { kind: 'mute', text: d.sceneSlots.length + ' 项' },
                        body: d.sceneSlots.length
                            ? kk.kv(d.sceneSlots.slice(0, 20).map((s, i) => ['#' + (i + 1), (s && (s.name || s.id)) || '（无名）']))
                            : kk.el('div', { class: 'lsu-empty-hint', text: d.sceneSlotNote }),
                    }).root);
                }
                return out;
            },
        });
    }

    function openVarsPanel() {
        const k = kit();
        return renderPanel({
            title: '状态变量',
            sub: '基线 = 锁定的人设（不会被一句台词改写）；漂移 = 最近的变化（心情/强化/弱化/行为）。只读。',
            read: readStateVars,
            summary: (d) => {
                const withBase = d.rows.filter((r) => r.hasBaseline).length;
                const withDrift = d.rows.filter((r) => r.hasDrift).length;
                return [['info', d.total + ' 人'], ['ok', withBase + ' 有基线'], ['warn', withDrift + ' 有漂移']];
            },
            emptyTitle: '还没有状态变量',
            emptyHint: '基线与漂移在角色被「锁定人设」或出现明显变化时落记录。',
            searchPlaceholder: '搜人名 / 性格词…',
            width: '460px',
            onTable: (d) => openRowsTable({
                title: '状态变量（表格）',
                sub: '与卡片视图同一份 read()：这里看全量、能按列排序；卡片视图看单个人的细节。',
                width: '800px',
                emptyText: '还没有状态变量',
                rows: d.rows.map((r) => ({
                    name: r.name,
                    traits: (r.baseline && Array.isArray(r.baseline.traits)) ? r.baseline.traits.join('、') : '',
                    belief: (r.baseline && r.baseline.coreBelief) || '',
                    mood: (r.drift && r.drift.mood) || '',
                    up: (r.drift && r.drift.reinforced) || '',
                    down: (r.drift && r.drift.weakened) || '',
                    floor: (r.drift && r.drift.floor !== undefined)
                        ? '漂移 ' + r.drift.floor + ' 楼'
                        : ((r.baseline && r.baseline.lockedAtFloor !== undefined)
                            ? '锁定 ' + r.baseline.lockedAtFloor + ' 楼' : ''),
                })),
                columns: [
                    { key: 'name', label: '人名', sortable: true },
                    { key: 'traits', label: '基线性格' },
                    { key: 'belief', label: '核心信念' },
                    { key: 'mood', label: '心情' },
                    { key: 'up', label: '被强化' },
                    { key: 'down', label: '被弱化' },
                    { key: 'floor', label: '楼层' },
                ],
            }),
            onRaw: (d, kk) => openRawTree(d, '状态变量 · 原始结构', kk),
            build: (d, filter, kk) => {
                const rows = d.rows.filter((r) => {
                    if (!filter) return true;
                    const hay = [r.name,
                        r.baseline ? (r.baseline.traits || []).join(' ') + ' ' + (r.baseline.coreBelief || '') + ' ' + (r.baseline.speechStyle || '') : '',
                        r.drift ? [r.drift.mood, r.drift.reinforced, r.drift.weakened, r.drift.behaviorChange].join(' ') : '',
                    ].join(' ');
                    return matches(hay, filter);
                });
                return rows.map((r) => {
                    const body = [];
                    if (r.hasBaseline) {
                        const b = r.baseline;
                        body.push(kk.el('div', { class: 'lsu-sec-title', text: '基线' }));
                        body.push(kk.kv([
                            ['性格', Array.isArray(b.traits) && b.traits.length ? b.traits.join('、') : null],
                            ['核心信念', b.coreBelief || null],
                            ['说话风格', b.speechStyle || null],
                            ['锁定于', b.lockedAtFloor !== undefined ? String(b.lockedAtFloor) + ' 楼' : null],
                        ]));
                    } else {
                        body.push(kk.el('div', { class: 'lsu-empty-hint', text: '没有基线（尚未锁定人设）' }));
                    }
                    if (r.hasDrift) {
                        const dr = r.drift;
                        body.push(kk.hr());
                        body.push(kk.el('div', { class: 'lsu-sec-title', text: '漂移' }));
                        body.push(kk.kv([
                            ['心情', dr.mood || null],
                            ['被强化', dr.reinforced || null],
                            ['被弱化', dr.weakened || null],
                            ['行为变化', dr.behaviorChange || null],
                            ['发生在', dr.floor !== undefined ? String(dr.floor) + ' 楼' : null],
                        ]));
                    }
                    return kk.card({
                        title: r.name,
                        badge: r.hasDrift
                            ? { kind: 'warn', text: '有漂移' }
                            : (r.hasBaseline ? { kind: 'ok', text: '仅基线' } : { kind: 'mute', text: '空壳' }),
                        kind: r.hasDrift ? 'warn' : undefined,
                        body: kk.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, body),
                    }).root;
                });
            },
        });
    }

    function openItemsPanel() {
        const k = kit();
        return renderPanel({
            title: '物品台账',
            sub: '这是 itemOps 重放出来的派生视图（最近 25 条）。真源是 itemOps —— 面板只读。',
            read: readItems,
            width: '460px',
            summary: (d) => {
                const out = [['info', d.total + ' 件']];
                if (d.stale) out.push(['warn', d.stale + ' 条失活']);
                if (d.capped) out.push(['warn', '已达 25 条上限（可能还有更早的）']);
                out.push(['mute', '只读']);
                return out;
            },
            emptyTitle: '台账里还没有物品',
            emptyHint: '物品在剧情里被明确记录（获得 / 转移 / 损坏）时才入账。',
            onTable: (d) => openRowsTable({
                title: '物品台账（表格）',
                sub: '同一份 readItems()：表格看全量与持有者分布，卡片看单件的描述。',
                width: '820px',
                emptyText: '台账里还没有物品',
                rows: d.rows.map((it) => ({
                    name: it.name,
                    holder: it.holder,
                    state: it.state,
                    carried: it.carried ? '是' : '否',
                    location: it.location || '',
                    due: it.returnDue || '',
                    floor: it.floor ? it.floor + ' 楼' : '',
                })),
                columns: [
                    { key: 'name', label: '物品名', sortable: true },
                    { key: 'holder', label: '持有者' },
                    { key: 'state', label: '状态' },
                    { key: 'carried', label: '随身' },
                    { key: 'location', label: '地点' },
                    { key: 'due', label: '归还期限' },
                    { key: 'floor', label: '最近变动' },
                ],
            }),
            onRaw: (d, kk) => openRawTree(d, '物品台账 · 原始结构', kk),
            searchPlaceholder: '搜物品名 / 持有者 / 地点…',
            build: (d, filter, kk) => {
                const out = [];
                const groups = new Map();
                d.rows.forEach((it) => {
                    if (!filter) return;
                    const hay = [it.name, it.desc, it.holder, it.state, it.location, it.lendTo, it.borrowFrom].join(' ');
                    if (!matches(hay, filter)) return;
                    const key = it.carried ? '随身携带' : (it.location ? '在：' + it.location : it.holder);
                    if (!groups.has(key)) groups.set(key, []);
                    groups.get(key).push(it);
                });
                const srcGroups = filter ? groups : d.groups;
                Array.from(srcGroups.entries()).forEach(([groupName, items]) => {
                    const inner = items.map((it) => kk.card({
                        title: it.name,
                        badge: { kind: it.carried ? 'ok' : 'mute', text: it.state },
                        body: kk.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } }, [
                            it.desc ? kk.el('div', { class: 'lsu-node-text is-clamp', text: it.desc }) : null,
                            kk.kv([
                                ['持有者', it.holder],
                                ['随身', it.carried ? '是' : '否'],
                                ['地点', it.location || null],
                                ['借给', it.lendTo || null],
                                ['借自', it.borrowFrom || null],
                                ['归还期限', it.returnDue || null],
                                ['最近变动', it.floor ? it.floor + ' 楼' : null],
                            ]),
                        ].filter(Boolean)),
                    }).root);
                    out.push(kk.card({
                        title: groupName,
                        badge: { kind: 'mute', text: items.length + ' 件' },
                        body: kk.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } }, inner),
                        flat: true,
                    }).root);
                });
                return out;
            },
        });
    }

    /** 统一入口：给 index.js 与 v4 抽屉共用的分发器 */
    function open(kind) {
        switch (String(kind || '')) {
            case 'npc': return openNpcPanel();
            case 'scene': return openScenePanel();
            case 'vars': return openVarsPanel();
            case 'items': return openItemsPanel();
            default: throw new Error('ui-data-panels: 未知面板 ' + kind);
        }
    }

    /* ================================================================
     * 7. 自检（纯函数路径；不碰 DOM）
     * ================================================================ */
    function selfCheck() {
        const fails = [];
        const checks = [];
        const ok = (name, cond, detail) => {
            checks.push({ name, ok: !!cond, detail });
            if (!cond) fails.push(name + (detail ? '：' + detail : ''));
        };

        ok('groupBy 保序', Array.from(groupBy([{ g: 'b' }, { g: 'a' }, { g: 'b' }], (x) => x.g).keys()).join('') === 'ba');
        ok('groupBy 空输入', groupBy(null, (x) => x).size === 0);
        ok('matches 空串全通过', matches('任何内容', '') === true);
        ok('matches 大小写不敏感', matches('Alice', 'ali') === true);
        ok('matches 不命中', matches('Alice', 'bob') === false);
        ok('safeRead 捕获异常', (() => {
            const r = safeRead('x', () => { throw new Error('boom'); });
            return r.ok === false && r.kind === 'error' && r.reason.indexOf('boom') >= 0;
        })());

        const saved = root.LonShaMemory;
        try {
            root.LonShaMemory = null;
            ok('无引擎 → NPC absent', readNpcTies().kind === 'absent');
            ok('无引擎 → 在场 absent', readPresence().kind === 'absent');
            ok('无引擎 → 变量 absent', readStateVars().kind === 'absent');
            ok('无引擎 → 物品 absent', readItems().kind === 'absent');

            // 有引擎但结构不对：必须是 absent 而不是 empty（不假装「没有数据」）
            root.LonShaMemory = { engine: { scene: {}, items: { records: 'nope' } } };
            ok('items.records 非数组 → absent', readItems().kind === 'absent');
            ok('缺 getNpcTiesRecords → absent', readNpcTies().kind === 'absent');

            // 真数据结构：presence 是 Map
            const m = new Map([['甲', { atFloor: 3 }], ['乙', { atFloor: 7 }]]);
            root.LonShaMemory = { engine: { scene: { presence: m }, worldProg: { scenes: [] } } };
            const pr = readPresence();
            ok('presence 转行并按楼层倒序', pr.total === 2 && pr.rows[0].name === '乙');
            ok('场景槽有专用说明', pr.sceneSlotNote.indexOf('没有写入方') >= 0);

            // 变量：基线与漂移合并
            root.LonShaMemory = { engine: { status: { baselines: { 甲: { traits: ['冷静'], lockedAtFloor: 2 } }, drifts: { 乙: { mood: '怒', floor: 5 } } } } };
            const vs = readStateVars();
            ok('基线与漂移并集为 2 人', vs.total === 2);
            ok('甲只有基线', vs.rows.find((x) => x.name === '甲').hasDrift === false);

            // 物品：carried / location / holder 三分
            root.LonShaMemory = { engine: { items: { records: [
                { name: '剑', carried: true, holder: '甲', state: '完好', floor: 1 },
                { name: '灯', location: '客栈', holder: '无主', floor: 2 },
                { name: '书', holder: '乙', floor: 3 },
            ], _stale: 2 } } };
            const it = readItems();
            ok('物品 3 件', it.total === 3);
            ok('失活读数带出', it.stale === 2);
            ok('分组含随身与地点', it.groups.has('随身携带') && it.groups.has('在：客栈'));
        } finally {
            if (saved === undefined) delete root.LonShaMemory;
            else root.LonShaMemory = saved;
        }

        ok('open 未知类型会抛', (() => {
            try { open('nope'); return false; } catch (_e) { return true; }
        })());
        ok('导出四个面板函数', ['openNpcPanel', 'openScenePanel', 'openVarsPanel', 'openItemsPanel']
            .every((n) => typeof api[n] === 'function'));

        /* v3.480.0：两个新消费面必须真的可装配 —— 否则底栏按钮会出现「点了没反应」。
         * 这里只判「能解析到」，不判渲染（没有 DOM）；渲染失败由 openRowsTable
         * 自己返回 absent 并带理由，属于界面侧的事。 */
        ok('导出 openRowsTable', typeof openRowsTable === 'function');
        ok('导出 openRawTree', typeof openRawTree === 'function');
        ok('tableLib 可解析（Node 下走 require 回退）', !!tableLib());
        ok('jsonLib 可解析（Node 下走 require 回退）', !!jsonLib());
        const rt = openRowsTable({ rows: [{ a: 1 }], columns: [{ key: 'a', label: 'A' }] });
        ok('无 DOM 时 openRowsTable 判 absent 且带理由',
            !!rt && rt.ok === false && !!rt.reason, JSON.stringify(rt));
        const rt2 = openRowsTable({ rows: null, columns: [] });
        ok('rows 非数组时 openRowsTable 报结构漂移（不是报环境）',
            !!rt2 && rt2.ok === false && /数组/.test(String(rt2.reason)), JSON.stringify(rt2));

        return { ok: fails.length === 0, version: VERSION, total: checks.length, failed: fails.length, fails, checks };
    }

    const api = {
        VERSION,
        // 纯函数读数（可单测）
        readNpcTies,
        readPresence,
        readStateVars,
        readItems,
        groupBy,
        matches,
        // 视图装配（表格 / 原始结构）—— 导出是为了能在 Node 侧验 absent 口径
        openRowsTable,
        openRawTree,
        tableLib,
        jsonLib,
        // 面板
        openNpcPanel,
        openScenePanel,
        openVarsPanel,
        openItemsPanel,
        open,
        selfCheck,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LonShaDataPanels = api;
    if (typeof window !== 'undefined') window.LonShaDataPanels = api;
})(typeof window !== 'undefined' ? window : globalThis);