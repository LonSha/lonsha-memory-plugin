// LonSha记忆引擎 - Dashboard v2 视觉层 (v2.0)
// ui/dashboard-v2.js —— 在 ui/dashboard-shell.js（v1.1+）生成的 Dashboard 上做「渐进增强」：
//   · 概览：健康三环（Apple 健身式同心环）+ 摘要卡片（大数字 + 迷你趋势）+ 最近记住的事
//   · 记忆：搜索优先工具栏（Raycast）+ 筛选 chip + 列表 / 卡片（Notion Gallery）/ 关系图（Obsidian）/ 时间线 四视图
//   · 全局：Cmd/Ctrl+K 命令面板（Linear / Raycast）、g->o/m/s/d 跳转、/ 聚焦搜索
//   · 设置：外观里追加「强调色」6 色调色板（--lt-* v2 token），以及 v2 开关
//   · 空状态 / 骨架屏：引擎未就绪时先给骨架，读不到才给空 / 错误态（与 memory-center 的四态口径一致）
//
// 契约（与 v1 相同）：
//   · 只读引擎数据，任何写操作都代理到原面板已有的按钮（档位、主题、打开浏览器 / 检查点…）；
//   · 保留 v1 的全部 ID：#ls-dash-overview / #ls-dash-memory / #ls-dash-health-meter / #ls-dash-health-text、
//     data-dash-act / data-dash-go / data-dash-profile / data-dash-theme 的语义与处理器（v1 的事件委托照常接管）；
//   · 灰度开关默认关：localStorage 'lonsha.ui.v2' = '1' 才生效；关 = 完全是 v1。
//   · 依赖 shell v1.1 的 'lonsha:dashboard-enhanced' 事件；检测不到 dashboard-v2.css（--ls-dash-v2-css）时什么也不做。
// 加载：manifest.json -> extra_js 中紧跟 "ui/dashboard-shell.js" 之后加入 "ui/dashboard-v2.js"。
(function () {
    'use strict';

    const VERSION = '2.1.0';
    const KEYS = {
        v2: 'lonsha.ui.v2',            // '1' 开启
        v3: 'lonsha.ui.v3',            // v2.1：'1' 开启 v3 精修外观（data-ui-rev="3"，需先开 v2；默认关）
        accent: 'lonsha.ui.accent',    // ice | iris | rose | jade | amber | graphite
        mode: 'lonsha.ui.memMode',     // list | cards | graph | timeline
        filter: 'lonsha.ui.memFilter',
    };
    const ACCENTS = [['ice', '冰蓝'], ['iris', '鸢尾'], ['rose', '蔷薇'], ['jade', '青玉'], ['amber', '琥珀'], ['graphite', '石墨']];
    const MODES = [['list', 'list', '列表'], ['cards', 'grid', '卡片'], ['graph', 'graph', '关系图'], ['timeline', 'timeline', '时间线']];
    const KINDS = {
        all: { label: '全部' },
        event: { label: '剧情', ico: 'sparkles' },
        timeline: { label: '时间线', ico: 'clock' },
        person: { label: '人物', ico: 'person' },
        promise: { label: '约定', ico: 'flag' },
        conflict: { label: '矛盾', ico: 'bolt' },
        fact: { label: '锁定', ico: 'lock' },
    };
    const PROFILES = [['balanced', '平衡', '推荐'], ['quality', '细致', '记得更多'], ['low-cost', '省流', '更少调用']];
    const PAGE = 60;

    /* 同一张 localStorage 取数口只有一个主人：外壳（dashboard-shell）把它的 store 导出为 _store，
     * v2 复用它，不再自带第二份同 md5 的副本（v3283 B1 点名的形态）。
     * 不留本地兜底是刻意的：v2 的唯一入口是外壳派发的 lonsha:dashboard-enhanced 事件，外壳不在场它根本跑不到；
     * 万一被硬拉起来，空实现也不会写坏用户数据（读回落默认、写丢弃）。 */
    const store = (window.LonShaDashboardShell && window.LonShaDashboardShell._store)
        || { get(k, d) { return d; }, set() { /* 无外壳：不写 */ } };
    const esc = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const warn = (tag, e) => { try { (window.LonShaMemory?.reportError || console.warn)(e, 'dashboard-v2.' + tag); } catch (_) { /* 忽略 */ } };
    const safe = (fn, d) => { try { const v = fn(); return v === undefined ? d : v; } catch (_) { return d; } };
    const enabled = () => store.get(KEYS.v2, '0') === '1';
    const cssReady = () => safe(() => getComputedStyle(document.documentElement).getPropertyValue('--ls-dash-v2-css').trim() === '1', false);
    const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || '');
    /* v2.1：图标统一走 LonShaIcons（原创 SVG）；未加载时退化为空，绝不回退到字符图标 */
    const I = (name, opts) => { try { const L = window.LonShaIcons; return L ? L.svg(name, opts) : ''; } catch (_) { return ''; } };
    const MOD = isMac ? I('cmd') : 'Ctrl';
    const v3On = () => store.get(KEYS.v3, '0') === '1';

    // ------------------------------------------------------------------
    // 强调色（v2 token 调色板）
    // ------------------------------------------------------------------
    function applyAccent() {
        const html = document.documentElement;
        const rmAttr = (el, key) => { try { if (el && typeof el.removeAttribute === 'function') el.removeAttribute(key); } catch (_e) { /* 假 DOM */ } };
        if (!enabled()) { rmAttr(html, 'data-lt-accent'); return null; }
        const a = store.get(KEYS.accent, 'ice');
        const ok = ACCENTS.some(([k]) => k === a) ? a : 'ice';
        html.setAttribute('data-lt-accent', ok);
        return ok;
    }

    // ------------------------------------------------------------------
    // 数据：只读汇总成统一条目（读不到 = null，与「0 条」区分）
    // ------------------------------------------------------------------
    function collect(plugin, base) {
        const s = plugin && plugin.engine;
        const ready = !!(s && s.summary);
        const summaries = safe(() => s.summary.summaries, null);
        const timeline = safe(() => s.timeline.entries, null);
        const conflicts = safe(() => s.conflicts.conflicts, null);
        const locked = safe(() => (typeof s.summary.getLockedFacts === 'function' ? s.summary.getLockedFacts() : null), null);
        const gNodes = safe(() => Array.from(s.graph.nodes.values()), null);
        const gEdges = safe(() => Array.from(s.graph.edges.values()), null);
        const chars = base && base.chars ? base.chars : safe(() => Object.keys(s.status.characters), null);
        const suspense = base && base.suspense ? base.suspense : null;
        const chatLen = safe(() => (window.SillyTavern?.getContext?.().chat || []).length, null);

        const names = (chars || []).filter(n => n && String(n).length >= 1);
        const whoIn = (text) => names.filter(n => String(text).indexOf(n) >= 0).slice(0, 4);
        const items = [];
        (summaries || []).forEach((m, i) => {
            const text = String(m.text || m.summary || '');
            if (text) items.push({ id: 'e' + i, kind: 'event', text, floor: m.floor, ts: m.timestamp, who: whoIn(text) });
        });
        (timeline || []).forEach((e, i) => {
            const text = String(e.text || '');
            if (text) items.push({ id: 't' + i, kind: 'timeline', text, floor: e.floor, date: e.date, imp: +e.importance || 5, who: Array.isArray(e.characters) ? e.characters.slice(0, 4) : whoIn(text) });
        });
        (suspense || []).forEach((it, i) => {
            const text = String(it.title || it.text || '');
            if (text) items.push({ id: 'p' + i, kind: 'promise', text, floor: it.floor, who: whoIn(text) });
        });
        (conflicts || []).forEach((c, i) => {
            const text = String(c.summary || c.text || c.fact || c.title || c.topic || '');
            if (text) items.push({ id: 'c' + i, kind: 'conflict', text, sev: c.severity, floor: c.floor, who: whoIn(text) });
        });
        (Array.isArray(locked) ? locked : []).forEach((f, i) => {
            const text = String(typeof f === 'string' ? f : (f.text || f.fact || ''));
            if (text) items.push({ id: 'f' + i, kind: 'fact', text, floor: f.floor, who: whoIn(text) });
        });
        names.forEach((n, i) => {
            const rec = safe(() => s.status.characters[n], null);
            const fields = rec && rec.fields ? Object.entries(rec.fields).slice(0, 3).map(([k, v]) => `${k}:${v}`).join(' · ') : '';
            items.push({ id: 'n' + i, kind: 'person', text: n, sub: fields, who: [n] });
        });

        // 关系图：优先引擎图谱；没有边时用「同场出现」推导（时间线条目里的 characters 共现）
        let nodes = [], edges = [];
        if (gNodes && gNodes.length) {
            const idOf = new Map();
            gNodes.slice(0, 120).forEach((n, i) => {
                const id = String(n.id ?? n.name ?? i);
                idOf.set(id, true);
                nodes.push({ id, name: String(n.name || id), type: String(n.type || 'unknown').toLowerCase(), desc: n.data && n.data.description ? String(n.data.description) : '' });
            });
            (gEdges || []).forEach((e) => {
                const a = String(e.from), b = String(e.to);
                if (idOf.has(a) && idOf.has(b) && a !== b) edges.push({ a, b, label: String(e.label || '相关') });
            });
        }
        if (!nodes.length && names.length) {
            nodes = names.slice(0, 60).map(n => ({ id: n, name: n, type: 'character', desc: '' }));
            const pair = new Map();
            (timeline || []).forEach((e) => {
                const cs = Array.isArray(e.characters) ? e.characters.filter(c => names.includes(c)) : [];
                for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
                    const k = [cs[i], cs[j]].sort().join('\u0001');
                    pair.set(k, (pair.get(k) || 0) + 1);
                }
            });
            pair.forEach((n, k) => { const [a, b] = k.split('\u0001'); edges.push({ a, b, label: `同场 ${n} 次`, inferred: true }); });
        }

        // 指标（只算真能算的；算不了 = null，界面显示虚线环和「—」）
        // 整理进度 = 已整理到的最高楼层 / 当前聊天楼层数（摘要通常一段覆盖多楼，按「进度」而不是「条数」算）
        const maxFloor = Math.max(-1, ...(summaries || []).map(m => +m.floor).filter(f => isFinite(f)));
        const coverage = chatLen && summaries ? Math.min(100, Math.round(((maxFloor + 1) / chatLen) * 100)) : null;
        const clarity = summaries && conflicts ? Math.max(0, Math.round((1 - conflicts.length / Math.max(1, summaries.length)) * 100)) : null;
        const now = Date.now(), day = 86400000;
        const spark = new Array(7).fill(0);
        (summaries || []).forEach(m => { const d = Math.floor((now - (+m.timestamp || 0)) / day); if (d >= 0 && d < 7) spark[6 - d]++; });

        return {
            ready, items, nodes, edges, names,
            counts: {
                event: summaries ? summaries.length : null,
                person: chars ? chars.length : null,
                relation: gEdges ? gEdges.length : (edges.length || null),
                timeline: timeline ? timeline.length : null,
                promise: suspense ? suspense.length : null,
                conflict: conflicts ? conflicts.length : null,
            },
            coverage, clarity, spark, chatLen,
            recent: (summaries || []).slice(-5).reverse(),
        };
    }

    // ------------------------------------------------------------------
    // 小工具
    // ------------------------------------------------------------------
    const num = (v) => (v == null ? '—' : String(v));
    function relTime(ts) {
        const t = +ts; if (!t) return '';
        const d = (Date.now() - t) / 1000;
        if (d < 60) return '刚刚';
        if (d < 3600) return Math.floor(d / 60) + ' 分钟前';
        if (d < 86400) return Math.floor(d / 3600) + ' 小时前';
        if (d < 86400 * 7) return Math.floor(d / 86400) + ' 天前';
        const x = new Date(t); return (x.getMonth() + 1) + '月' + x.getDate() + '日';
    }
    function highlight(text, q) {
        const t = String(text);
        if (!q) return esc(t);
        const i = t.toLowerCase().indexOf(q.toLowerCase());
        if (i < 0) return esc(t);
        return esc(t.slice(0, i)) + '<mark class="ls-mark">' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
    }
    /** 模糊匹配评分：连续命中 / 词首命中加分；不命中返回 -1（中文按字匹配） */
    function fuzzy(text, q) {
        const t = String(text).toLowerCase(); q = String(q || '').toLowerCase().trim();
        if (!q) return 0;
        const direct = t.indexOf(q);
        if (direct >= 0) return 100 - Math.min(60, direct) + (direct === 0 ? 30 : 0);
        q = q.replace(/\s+/g, '');
        let ti = 0, score = 0, run = 0;
        for (const ch of q) {
            const k = t.indexOf(ch, ti);
            if (k < 0) return -1;
            run = k === ti ? run + 1 : 0;
            score += 1 + run * 2;
            ti = k + 1;
        }
        return score;
    }
    const avatars = (who) => (who && who.length ? `<span class="ls-avatars" aria-label="${esc(who.join('、'))}">${who.slice(0, 3).map(n => `<span class="ls-avatar" title="${esc(n)}">${esc(String(n).slice(0, 1))}</span>`).join('')}</span>` : '');
    const kindBadge = (k) => `<span class="ls-kind" data-kind="${k}" aria-hidden="true">${KINDS[k] && KINDS[k].ico ? I(KINDS[k].ico) : ''}</span>`;
    const emptyHTML = (title, sub, kind) => `<div class="ls-empty2"${kind ? ` data-kind="${kind}"` : ''} role="status"><div class="ls-empty2-art" aria-hidden="true"><span class="ls-empty2-card" data-n="1"></span><span class="ls-empty2-card" data-n="2"></span><span class="ls-empty2-badge">${I(kind === 'error' ? 'warning' : 'sparkles', { fill: kind !== 'error' })}</span></div><div class="ls-empty2-title">${esc(title)}</div><div class="ls-empty2-sub">${esc(sub)}</div></div>`;

    // ------------------------------------------------------------------
    // 概览
    // ------------------------------------------------------------------
    /* 同心活动环（Apple 健身式）：每环一条线性渐变描边 + 圆头 + 末端「渐变帽」（带投影的小圆，压住接缝），
       轨道 = 同色 16% 透明；未知值画虚线轨道、不画进度，与「0」区分 */
    let ringSeq = 0;
    function ringsSVG(data) {
        const id = 'ls-rg' + (++ringSeq);
        const rings = [['health', 50, data.health], ['coverage', 37, data.coverage], ['clarity', 24, data.clarity]];
        const W = 11;
        /* 渐变方向随末端旋转：起点在末端的对径点、终点在末端，保证「帽」与弧末端同色（b 色），弧起点偏 a 色 */
        const geo = rings.map(([k, r, v]) => {
            const unknown = v == null;
            const p = unknown ? 0 : Math.max(0.015, Math.min(1, v / 100));
            const a = -Math.PI / 2 + p * 2 * Math.PI;
            return { k, r, v, unknown, p, cx: 60 + r * Math.cos(a), cy: 60 + r * Math.sin(a) };
        });
        const defs = geo.map(({ k, cx, cy }) => `<linearGradient id="${id}-${k}" gradientUnits="userSpaceOnUse" x1="${(120 - cx).toFixed(2)}" y1="${(120 - cy).toFixed(2)}" x2="${cx.toFixed(2)}" y2="${cy.toFixed(2)}"><stop offset="0" class="ls-ring-stop-a" data-ring="${k}"/><stop offset="1" class="ls-ring-stop-b" data-ring="${k}"/></linearGradient>`).join('')
            + `<filter id="${id}-cap" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="0" stdDeviation="1.4" flood-opacity=".38"/></filter>`;
        const body = geo.map(({ k, r, unknown, p, cx, cy }) => {
            const len = 2 * Math.PI * r;
            const val = unknown ? '' : `<circle class="ls-ring-val" data-ring="${k}" cx="60" cy="60" r="${r}" stroke-width="${W}" stroke="url(#${id}-${k})" stroke-dasharray="${(len * p).toFixed(2)} ${len.toFixed(2)}" transform="rotate(-90 60 60)"/>`
                + (p > 0.06 ? `<circle class="ls-ring-cap" data-ring="${k}" cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="${W / 2}" filter="url(#${id}-cap)"/>` : '');
            return `<circle class="ls-ring-track" data-ring="${k}"${unknown ? ' data-unknown="1"' : ''} cx="60" cy="60" r="${r}" stroke-width="${W}"/>${val}`;
        }).join('');
        return `<svg class="ls-rings-svg" viewBox="0 0 120 120" aria-hidden="true" focusable="false"><defs>${defs}</defs>${body}</svg>`;
    }
    /* 迷你折线（Linear / 健康式）：面积渐变 + 1.5px 折线 + 末端点；数据全 0 时画一条基线 */
    let sparkSeq = 0;
    function sparkSVG(arr) {
        const a = (arr || []).map(Number);
        if (!a.length) return '';
        const id = 'ls-sp' + (++sparkSeq), w = 96, h = 28, mx = Math.max(1, ...a), n = Math.max(1, a.length - 1);
        const pts = a.map((v, i) => [(i / n) * w, h - 3 - (v / mx) * (h - 7)]);
        const line = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');
        const last = pts[pts.length - 1];
        return `<svg class="ls-spark2" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ls-spark-a"/><stop offset="1" class="ls-spark-b"/></linearGradient></defs>`
            + `<path class="ls-spark-area" d="${line}L${w} ${h}L0 ${h}Z" fill="url(#${id})"/><path class="ls-spark-line" d="${line}"/><path class="ls-spark-dot" d="M${last[0].toFixed(1)} ${last[1].toFixed(1)}h0"/></svg>`;
    }
    function ringsLegend(data) {
        const row = (k, name, v, unit) => `<li data-ring="${k}"><span class="ls-rings-key" data-ring="${k}"></span><span class="ls-rings-name">${name}</span><span class="ls-rings-num">${v == null ? '—' : v}<small>${v == null ? '' : unit}</small></span></li>`;
        return `<ul class="ls-rings-legend">${row('health', '体检健康', data.health, '%')}${row('coverage', '整理进度', data.coverage, '%')}${row('clarity', '无矛盾占比', data.clarity, '%')}</ul>`;
    }
    function statusHTML(st) {
        const state = !st.running ? 'off' : (st.hasApi ? 'ok' : 'warn');
        const title = state === 'ok' ? '自动记忆运行中' : (state === 'warn' ? '还差一步：填写专用接口' : '自动记忆已暂停');
        const sub = state === 'ok' ? '继续聊天，新剧情会自动整理进记忆' : (state === 'warn' ? '去「设置」填好接口地址、密钥和模型' : '在「设置」里打开「启用记忆」');
        return `<div class="ls-v2-status" data-state="${state}" role="status"><span class="ls-v2-status-dot" aria-hidden="true"></span><div class="ls-v2-status-text"><div class="ls-v2-status-title">${title}</div><div class="ls-v2-status-sub">${sub}</div></div></div>`;
    }
    const cmdkTrigger = () => `<button type="button" class="ls-cmdk-trigger" data-v2-cmdk aria-keyshortcuts="${isMac ? 'Meta+K' : 'Control+K'}" aria-label="搜索与命令"><span class="ls-cmdk-trigger-ico" aria-hidden="true">${I('search')}</span><span class="ls-cmdk-trigger-label">搜索记忆、人物、设置</span><span class="ls-kbd">${MOD}</span><span class="ls-kbd">K</span></button>`;
    const STAT_ICON = { accent: 'sparkles', green: 'person', violet: 'graph', muted: 'clock', gold: 'flag', red: 'bolt' };
    function statCard(go, tone, label, v, unit, sub, spark) {
        const sp = spark ? sparkSVG(spark) : '';
        return `<button type="button" class="ls-stat2" data-tone="${tone}" data-v2-go="${go}"><span class="ls-stat2-k"><span class="ls-stat2-ico" aria-hidden="true">${I(STAT_ICON[tone] || 'dot')}</span>${label}</span><span class="ls-stat2-v">${num(v)}${v == null ? '' : `<small>${unit}</small>`}</span><span class="ls-stat2-sub">${esc(sub)}</span>${sp}</button>`;
    }
    function overviewHTML(st, d, healthPct) {
        const c = d.counts;
        const ringData = { health: healthPct, coverage: d.coverage, clarity: d.clarity };
        const recent = d.recent;
        const weekN = d.spark.reduce((a, b) => a + b, 0);
        return `<div class="ls-v2-overview ls-v2-stagger">
            <div class="ls-v2-span ls-v2-top">${statusHTML(st)}${cmdkTrigger()}</div>
            <div class="ls-card">
                <div class="ls-card-head"><h3 class="ls-card-title">记忆健康</h3><button type="button" class="ls-card-link" data-dash-go="health">体检详情${I('chevron-right')}</button></div>
                <div class="ls-rings" data-tone="ok">${ringsSVG(ringData)}${ringsLegend(ringData)}</div>
                <div class="ls-meter" id="ls-dash-health-meter" data-tone="ok" role="meter" aria-label="记忆健康度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
                <p class="ls-hint" id="ls-dash-health-text">正在体检…</p>
            </div>
            <div class="ls-card">
                <div class="ls-card-head"><h3 class="ls-card-title">记忆档位</h3><span class="ls-badge" data-tone="muted">切换即保存</span></div>
                <div class="ls-seg" role="radiogroup" aria-label="记忆档位" data-dash-profiles="overview">
                    ${PROFILES.map(([id, l, h]) => `<button type="button" class="ls-seg-btn" role="radio" data-dash-profile="${id}" aria-checked="${st.profile === id}" title="${esc(h)}">${l}</button>`).join('')}
                </div>
                <div class="ls-card-head u-mt-3"><h3 class="ls-card-title">最近记住的事</h3><button type="button" class="ls-card-link" data-v2-go="memory:timeline">时间线${I('chevron-right')}</button></div>
                ${recent == null || !d.ready ? emptyHTML('暂时读不到记忆数据', '引擎还在加载，或当前没有打开聊天。重开面板试试。', 'error')
                    : (recent.length === 0 ? emptyHTML('还没有记录', '继续聊天，这里会自动写下发生过的事。')
                        : `<ul class="ls-v2-recent">${recent.map(m => `<li><span class="ls-v2-bullet" aria-hidden="true">${I('sparkles')}</span><span class="ls-v2-recent-text">${esc(m.text || m.summary || '')}</span><span class="ls-v2-recent-meta">#${esc(m.floor ?? '?')}${m.timestamp ? ' · ' + relTime(m.timestamp) : ''}</span></li>`).join('')}</ul>`)}
            </div>
            <div class="ls-v2-span">
                <div class="ls-stat2-grid ls-v2-stagger">
                    ${statCard('memory:list:event', 'accent', '剧情', c.event, '段', weekN ? `近 7 天 +${weekN}` : '已整理的剧情', d.spark)}
                    ${statCard('memory:cards:person', 'green', '人物', c.person, '位', '登场人物档案')}
                    ${statCard('memory:graph', 'violet', '关系', c.relation, '条', '谁和谁有关')}
                    ${statCard('memory:timeline', 'muted', '时间线', c.timeline, '件', '按时间回看')}
                    ${statCard('memory:list:promise', 'gold', '约定', c.promise, '条', c.promise ? '还没兑现' : '没有悬而未决')}
                    ${statCard('memory:list:conflict', 'red', '矛盾', c.conflict, '处', c.conflict ? '说法对不上' : '前后一致')}
                </div>
            </div>
        </div>`;
    }
    function overviewSkeleton() {
        return `<div class="ls-v2-overview" aria-busy="true">
            <div class="ls-v2-span ls-v2-top"><div class="ls-skel-stack ls-v2-status"><span class="ls-skel" data-w="2"></span><span class="ls-skel" data-w="1"></span></div>${cmdkTrigger()}</div>
            <div class="ls-card"><div class="ls-rings"><span class="ls-skel" data-h="ring"></span><div class="ls-skel-stack"><span class="ls-skel" data-w="3"></span><span class="ls-skel" data-w="3"></span><span class="ls-skel" data-w="2"></span></div></div>
                <div class="ls-meter" id="ls-dash-health-meter" data-tone="ok" role="meter" aria-label="记忆健康度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div><p class="ls-hint" id="ls-dash-health-text">正在体检…</p></div>
            <div class="ls-card"><div class="ls-skel-stack"><span class="ls-skel" data-h="lg" data-w="4"></span><span class="ls-skel" data-w="4"></span><span class="ls-skel" data-w="3"></span><span class="ls-skel" data-w="4"></span><span class="ls-skel" data-w="2"></span></div></div>
        </div>`;
    }

    // ------------------------------------------------------------------
    // 记忆：工具栏 + 四视图
    // ------------------------------------------------------------------
    function memoryShellHTML(mode) {
        return `<div class="ls-v2-toolbar">
                <div class="ls-v2-toolbar-row">
                    <label class="ls-v2-search"><span class="ls-v2-sr">搜索记忆</span><span class="ls-v2-search-ico" aria-hidden="true">${I('search')}</span><input type="search" data-v2-q placeholder="搜索剧情、人物、约定…  按 / 聚焦" autocomplete="off" enterkeyhint="search"></label>
                    <div class="ls-v2-views" role="radiogroup" aria-label="视图">${MODES.map(([k, ico, l]) => `<button type="button" class="ls-v2-view" role="radio" data-v2-mode="${k}" aria-checked="${k === mode}" title="${l}"><span class="ls-v2-view-ico" aria-hidden="true">${I(ico)}</span><span class="ls-v2-view-label">${l}</span></button>`).join('')}</div>
                </div>
                <div class="ls-v2-chips" role="toolbar" aria-label="筛选" data-v2-chips></div>
            </div>
            <div class="ls-v2-body" data-mode="${mode}" aria-live="polite">
                <div data-mode="list"></div><div data-mode="cards"></div><div data-mode="graph"></div><div data-mode="timeline"></div>
            </div>
            <div class="ls-v2-section-title">更多工具</div>`;
    }
    function memorySkeleton() {
        return `<div class="ls-rows" aria-busy="true">${[3, 4, 2, 3, 4].map(w => `<div class="ls-row2"><span class="ls-skel" data-h="lg"></span><div class="ls-skel-stack"><span class="ls-skel" data-w="${w}"></span><span class="ls-skel" data-w="1"></span></div><span></span></div>`).join('')}</div>`;
    }
    function chipsHTML(items, filter) {
        const counts = {};
        items.forEach(it => { counts[it.kind] = (counts[it.kind] || 0) + 1; });
        return Object.keys(KINDS).filter(k => k === 'all' || counts[k]).map(k => `<button type="button" class="ls-chip" data-v2-filter="${k}" aria-pressed="${k === filter}">${k === 'all' ? '' : kindBadge(k)}${KINDS[k].label}<span class="ls-chip-n">${k === 'all' ? items.length : counts[k]}</span></button>`).join('');
    }
    function metaOf(it) {
        const bits = [];
        if (it.date) bits.push(esc(it.date));
        if (it.floor != null) bits.push('#' + esc(it.floor));
        if (it.ts) bits.push(relTime(it.ts));
        if (it.kind === 'conflict' && it.sev) bits.push(it.sev === 'high' ? '严重' : (it.sev === 'low' ? '轻微' : '一般'));
        return bits.join(' · ');
    }
    function listHTML(list, q, limit) {
        if (!list.length) return q ? emptyHTML('没有匹配的记忆', `换个关键词试试，或清空「${q}」。`) : emptyHTML('这里还空着', '继续聊天，剧情、人物和约定会自动出现在这里。');
        return `<ul class="ls-rows" role="list">${list.slice(0, limit).map(it => `<li class="ls-row2" data-kind="${it.kind}" tabindex="-1" data-v2-row="${it.id}">${kindBadge(it.kind)}<div class="ls-row2-main"><div class="ls-row2-text">${highlight(it.text, q)}</div>${it.sub ? `<div class="ls-row2-sub">${esc(it.sub)}</div>` : ''}</div><div class="ls-row2-meta">${it.kind !== 'person' ? avatars(it.who) : ''}<span>${metaOf(it)}</span></div></li>`).join('')}</ul>${list.length > limit ? `<button type="button" class="ls-v2-more" data-v2-more>再显示 ${Math.min(PAGE, list.length - limit)} 条（共 ${list.length}）</button>` : ''}`;
    }
    function cardsHTML(list, q, limit) {
        if (!list.length) return listHTML(list, q, limit);
        return `<div class="ls-gallery ls-v2-stagger">${list.slice(0, limit).map(it => `<article class="ls-gcard" data-kind="${it.kind}"><div class="ls-gcard-head">${kindBadge(it.kind)}<span>${KINDS[it.kind].label}</span></div><div class="ls-gcard-text">${highlight(it.text, q)}${it.sub ? `<div class="ls-row2-sub">${esc(it.sub)}</div>` : ''}</div><div class="ls-gcard-foot"><span>${metaOf(it)}</span>${it.kind !== 'person' ? avatars(it.who) : ''}</div></article>`).join('')}</div>${list.length > limit ? `<button type="button" class="ls-v2-more" data-v2-more>再显示 ${Math.min(PAGE, list.length - limit)} 张（共 ${list.length}）</button>` : ''}`;
    }
    function timelineHTML(items, q) {
        let list = items.filter(it => it.kind === 'timeline');
        if (!list.length) list = items.filter(it => it.kind === 'event');
        if (q) list = list.filter(it => fuzzy(it.text, q) >= 0);
        if (!list.length) return emptyHTML(q ? '时间线上没有匹配项' : '时间线还是空的', q ? '换个关键词试试。' : '剧情推进后，事件会按时间排在这里。');
        list = list.slice().sort((a, b) => (+b.floor || 0) - (+a.floor || 0));
        const groups = new Map();
        list.slice(0, 200).forEach(it => {
            const g = it.date ? String(it.date) : (it.floor != null ? `第 ${Math.floor(+it.floor / 20) * 20 + 1}–${Math.floor(+it.floor / 20) * 20 + 20} 楼` : '未标注时间');
            if (!groups.has(g)) groups.set(g, []);
            groups.get(g).push(it);
        });
        let html = '<ol class="ls-tl2">';
        groups.forEach((arr, g) => {
            html += `<li class="ls-tl2-group" aria-hidden="true">${esc(g)}</li>`;
            arr.forEach(it => { html += `<li class="ls-tl2-item" data-kind="${it.kind}" data-imp="${(it.imp || 5) >= 8 ? 'high' : 'normal'}"><div class="ls-tl2-meta">${it.floor != null ? '#' + esc(it.floor) : ''}${it.imp ? `<span class="ls-tl2-stars" aria-label="重要度 ${it.imp}">${I('star', { fill: true }).repeat(Math.min(3, Math.ceil(it.imp / 3.4)))}</span>` : ''}${avatars(it.who)}</div><div class="ls-tl2-text">${highlight(it.text, q)}</div></li>`; });
        });
        return html + '</ol>';
    }

    // ---- 关系图：确定性力导向布局（同样的数据 -> 同样的图；O(n²)，上限 120 节点） ----
    function layout(nodes, edges, W, H) {
        const n = nodes.length, idx = new Map(nodes.map((x, i) => [x.id, i]));
        const P = nodes.map((_, i) => { const a = (i / Math.max(1, n)) * Math.PI * 2, r = Math.min(W, H) * 0.32; return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r, vx: 0, vy: 0 }; });
        const E = edges.map(e => [idx.get(e.a), idx.get(e.b)]).filter(([a, b]) => a != null && b != null);
        const k = Math.sqrt((W * H) / Math.max(1, n)) * 0.7;
        for (let it = 0; it < 260; it++) {
            const t = 1 - it / 260;
            for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
                let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, d2 = dx * dx + dy * dy + 0.01;
                const f = (k * k) / d2, d = Math.sqrt(d2);
                dx /= d; dy /= d;
                P[i].vx += dx * f; P[i].vy += dy * f; P[j].vx -= dx * f; P[j].vy -= dy * f;
            }
            E.forEach(([a, b]) => {
                const dx = P[b].x - P[a].x, dy = P[b].y - P[a].y, d = Math.sqrt(dx * dx + dy * dy) + 0.01;
                const f = (d - k) * 0.06;
                P[a].vx += (dx / d) * f; P[a].vy += (dy / d) * f; P[b].vx -= (dx / d) * f; P[b].vy -= (dy / d) * f;
            });
            P.forEach(p => {
                p.vx += (W / 2 - p.x) * 0.012; p.vy += (H / 2 - p.y) * 0.012;
                const sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1, cap = 18 * t + 0.5;
                p.x += (p.vx / sp) * Math.min(sp, cap); p.y += (p.vy / sp) * Math.min(sp, cap);
                p.x = Math.max(24, Math.min(W - 24, p.x)); p.y = Math.max(20, Math.min(H - 20, p.y));
                p.vx *= 0.5; p.vy *= 0.5;
            });
        }
        return { P, E };
    }
    function graphHTML(d) {
        if (!d.nodes.length) return emptyHTML('关系图还没有节点', '人物登场、关系被提取后，这里会自动连成一张网。');
        const W = 600, H = 380;
        const { P, E } = layout(d.nodes, d.edges, W, H);
        const deg = new Array(d.nodes.length).fill(0);
        E.forEach(([a, b]) => { deg[a]++; deg[b]++; });
        /* v2.1：连线改为轻微弯曲的二次曲线（避免直线交叉成「蜘蛛网」），端点停在节点圆外；
           节点是带姓名首字的头像圆（半径随度数 9-17），名字放在节点下方，热区 = 圆 + 名字 */
        const R = (i) => 9 + Math.min(8, deg[i] * 1.6);
        const curve = (a, b) => {
            const ax = P[a].x, ay = P[a].y, bx = P[b].x, by = P[b].y, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
            const ux = dx / L, uy = dy / L, bend = Math.min(26, L * 0.12);
            const sx = ax + ux * (R(a) + 3), sy = ay + uy * (R(a) + 3), ex = bx - ux * (R(b) + 3), ey = by - uy * (R(b) + 3);
            const mx = (sx + ex) / 2 - uy * bend, my = (sy + ey) / 2 + ux * bend;
            return { d: `M${sx.toFixed(1)} ${sy.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${ex.toFixed(1)} ${ey.toFixed(1)}`, lx: (sx + 2 * mx + ex) / 4, ly: (sy + 2 * my + ey) / 4 };
        };
        const C = E.map(([a, b]) => curve(a, b));
        const edgesSvg = E.map(([a, b], i) => `<path class="ls-gedge" data-e="${i}" data-a="${a}" data-b="${b}"${d.edges[i] && d.edges[i].inferred ? ' data-inferred="1"' : ''} d="${C[i].d}"/>`).join('');
        const labels = E.map((_, i) => `<text class="ls-gedge-label" data-e="${i}" x="${C[i].lx.toFixed(1)}" y="${(C[i].ly - 4).toFixed(1)}" text-anchor="middle">${esc(d.edges[i] ? d.edges[i].label : '')}</text>`).join('');
        const nodesSvg = d.nodes.map((nd, i) => `<g class="ls-gnode" data-i="${i}" data-type="${esc(nd.type)}" tabindex="0" role="button" aria-label="${esc(nd.name)}，${deg[i]} 条关系" transform="translate(${P[i].x.toFixed(1)} ${P[i].y.toFixed(1)})"><circle class="ls-gnode-halo" r="${(R(i) + 5).toFixed(1)}"/><circle class="ls-gnode-dot" r="${R(i).toFixed(1)}"/><text class="ls-gnode-ini" dy="0.35em" text-anchor="middle">${esc(String(nd.name).slice(0, 1))}</text><text class="ls-gnode-name" y="${(R(i) + 15).toFixed(1)}" text-anchor="middle">${esc(nd.name.slice(0, 10))}</text></g>`).join('');
        const types = Array.from(new Set(d.nodes.map(n => n.type))).slice(0, 4);
        const kindOfType = (t) => (/char|person/.test(t) ? 'event' : /loc|place/.test(t) ? 'person' : /item|obj/.test(t) ? 'promise' : 'timeline');
        return `<div class="ls-graph-wrap">
            <div class="ls-graph" data-v2-graph>
                <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="group" aria-label="关系图：${d.nodes.length} 个节点，${E.length} 条关系"><g data-v2-pan transform="translate(0 0) scale(1)">${edgesSvg}${labels}${nodesSvg}</g></svg>
                <div class="ls-graph-tools"><button type="button" data-v2-zoom="in" aria-label="放大">${I('plus')}</button><button type="button" data-v2-zoom="out" aria-label="缩小">${I('minus')}</button><button type="button" data-v2-zoom="reset" aria-label="复位">${I('refresh')}</button></div>
                <div class="ls-graph-legend" aria-hidden="true">${types.map(t => `<span data-kind="${kindOfType(t)}"><i></i>${esc(t === 'character' ? '人物' : t)}</span>`).join('')}${d.edges.some(e => e.inferred) ? '<span data-inferred="1"><i></i>虚线：由同场出现推导</span>' : ''}</div>
            </div>
            <aside class="ls-backlinks" data-v2-backlinks aria-live="polite"><p class="ls-backlinks-sub">反向链接</p><div class="ls-hint">点一个节点，看看哪些记忆提到了它。</div></aside>
        </div>`;
    }
    function bindGraph(root, d) {
        const box = root.querySelector('[data-v2-graph]');
        if (!box) return;
        const svg = box.querySelector('svg'), pan = box.querySelector('[data-v2-pan]'), side = root.querySelector('[data-v2-backlinks]');
        const lines = Array.from(box.querySelectorAll('.ls-gedge')), labels = Array.from(box.querySelectorAll('.ls-gedge-label')), gs = Array.from(box.querySelectorAll('.ls-gnode'));
        let tx = 0, ty = 0, sc = 1;
        const setT = () => pan.setAttribute('transform', `translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${sc.toFixed(3)})`);
        const focus = (i) => {
            if (i == null) { box.removeAttribute('data-focus'); gs.concat(lines, labels).forEach(el => el.classList.remove('is-hot')); return; }
            box.setAttribute('data-focus', String(i));
            const hot = new Set([String(i)]);
            lines.forEach((l, k) => { const on = l.dataset.a === String(i) || l.dataset.b === String(i); l.classList.toggle('is-hot', on); labels[k].classList.toggle('is-hot', on); if (on) { hot.add(l.dataset.a); hot.add(l.dataset.b); } });
            gs.forEach(g => g.classList.toggle('is-hot', hot.has(g.dataset.i)));
        };
        const select = (i) => {
            const nd = d.nodes[i]; if (!nd || !side) return;
            const mentions = d.items.filter(it => it.kind !== 'person' && it.text.indexOf(nd.name) >= 0).slice(0, 8);
            const rels = d.edges.filter(e => e.a === nd.id || e.b === nd.id).slice(0, 8).map(e => {
                const other = d.nodes.find(x => x.id === (e.a === nd.id ? e.b : e.a));
                return `<li><b>${esc(other ? other.name : '?')}</b> · ${esc(e.label)}</li>`;
            });
            side.innerHTML = `<h4 class="ls-backlinks-title">${kindBadge('person')}${esc(nd.name)}</h4>${nd.desc ? `<p class="ls-hint">${esc(nd.desc)}</p>` : ''}
                <p class="ls-backlinks-sub">关系 ${rels.length}</p>${rels.length ? `<ul>${rels.join('')}</ul>` : '<div class="ls-hint">暂无连线</div>'}
                <p class="ls-backlinks-sub u-mt-3">提到 TA 的记忆 ${mentions.length}</p>${mentions.length ? `<ul>${mentions.map(m => `<li>${highlight(m.text.slice(0, 90), nd.name)}</li>`).join('')}</ul>` : '<div class="ls-hint">还没有记忆提到 TA</div>'}`;
        };
        let sticky = null;
        gs.forEach(g => {
            const i = +g.dataset.i;
            g.addEventListener('pointerenter', () => { if (sticky == null) focus(i); });
            g.addEventListener('pointerleave', () => { if (sticky == null) focus(null); });
            g.addEventListener('focus', () => focus(i));
            g.addEventListener('click', (e) => { e.stopPropagation(); sticky = sticky === i ? null : i; focus(sticky); if (sticky != null) select(i); });
            g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
        });
        // 平移 / 缩放（指针拖动 + 滚轮 + 按钮），只改 SVG transform 属性
        let drag = null;
        svg.addEventListener('pointerdown', (e) => { if (e.target.closest('.ls-gnode')) return; drag = { x: e.clientX, y: e.clientY, tx, ty }; svg.setPointerCapture(e.pointerId); });
        svg.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const r = svg.getBoundingClientRect(), k = 600 / Math.max(1, r.width);
            tx = drag.tx + (e.clientX - drag.x) * k; ty = drag.ty + (e.clientY - drag.y) * k; setT();
        });
        const end = () => { if (drag && Math.abs(tx - drag.tx) + Math.abs(ty - drag.ty) < 2) { sticky = null; focus(null); } drag = null; };
        svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
        const zoom = (f) => { const ns = Math.max(0.5, Math.min(3, sc * f)); tx = 300 - (300 - tx) * (ns / sc); ty = 190 - (190 - ty) * (ns / sc); sc = ns; setT(); };
        svg.addEventListener('wheel', (e) => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.12 : 1 / 1.12); }, { passive: false });
        box.querySelectorAll('[data-v2-zoom]').forEach(b => b.addEventListener('click', () => { const z = b.dataset.v2Zoom; if (z === 'reset') { tx = 0; ty = 0; sc = 1; setT(); } else zoom(z === 'in' ? 1.25 : 0.8); }));
    }

    // ------------------------------------------------------------------
    // 命令面板 Cmd/Ctrl+K
    // ------------------------------------------------------------------
    function createPalette(ctx) {
        const { overlay, dash } = ctx;
        let el = overlay.querySelector('.ls-cmdk');
        if (el) return el._api;
        el = document.createElement('div');
        el.className = 'ls-cmdk';
        el.hidden = true;
        el.innerHTML = `<div class="ls-cmdk-panel" role="dialog" aria-modal="true" aria-label="命令面板">
            <div class="ls-cmdk-head"><span class="ls-cmdk-head-ico" aria-hidden="true">${I('search')}</span><input class="ls-cmdk-input" type="text" role="combobox" aria-expanded="true" aria-controls="ls-cmdk-list" aria-autocomplete="list" placeholder="搜索记忆、人物，或输入命令…" autocomplete="off" spellcheck="false"><span class="ls-kbd">Esc</span></div>
            <div class="ls-cmdk-list" id="ls-cmdk-list" role="listbox" aria-label="结果"></div>
            <div class="ls-cmdk-foot"><span><span class="ls-kbd">${I('arrow-up')}</span><span class="ls-kbd">${I('arrow-down')}</span>选择</span><span><span class="ls-kbd">${I('return')}</span>执行</span><span><span class="ls-kbd">${MOD}</span><span class="ls-kbd">K</span>开关</span></div>
        </div>`;
        overlay.appendChild(el);
        const input = el.querySelector('.ls-cmdk-input'), listEl = el.querySelector('.ls-cmdk-list');
        let results = [], sel = 0, lastFocus = null;

        const click = (selector) => () => { const t = dash.querySelector(selector); if (t) t.click(); };
        const commands = () => {
            const dev = ctx.isDev();
            const c = [
                { g: '跳转', ico: 'rings', label: '概览', hint: 'G O', run: click('.ls-dash-tab[data-dash-tab="overview"]') },
                { g: '跳转', ico: 'brain', label: '记忆', hint: 'G M', run: click('.ls-dash-tab[data-dash-tab="memory"]') },
                { g: '跳转', ico: 'gear', label: '设置', hint: 'G S', run: click('.ls-dash-tab[data-dash-tab="settings"]') },
            ];
            if (dev) c.push({ g: '跳转', ico: 'cmd', label: '开发者', hint: 'G D', run: click('.ls-dash-tab[data-dash-tab="dev"]') });
            MODES.forEach(([k, ico, l]) => c.push({ g: '视图', ico, label: `记忆 · ${l}`, run: () => ctx.go('memory:' + k) }));
            PROFILES.forEach(([id, l]) => c.push({ g: '档位', ico: 'sliders', label: `切到「${l}」档`, run: click(`[data-dash-profile="${id}"]`) }));
            [['auto', '跟随酒馆'], ['light', '浅色'], ['dark', '深色']].forEach(([v, l]) => c.push({ g: '外观', ico: 'moon', label: `主题：${l}`, run: click(`[data-dash-theme="${v}"]`) }));
            ACCENTS.forEach(([k, l]) => c.push({ g: '外观', ico: 'circle', label: `强调色：${l}`, run: () => ctx.setAccent(k) }));
            dash.querySelectorAll('.ls-tiles [data-dash-act]').forEach(b => {
                const t = b.querySelector('.ls-tile-title'); const ico = b.querySelector('.ls-tile-ico');
                c.push({ g: '工具', ico: (ico && ico.dataset.ico) || 'chevron-right', label: t ? t.textContent : b.dataset.dashAct, run: () => b.click() });
            });
            if (dev) c.push({ g: '工具', ico: 'heart-pulse', label: '体检详情', run: click('[data-dash-go="health"]') });
            return c;
        };
        const render = () => {
            const q = input.value.trim();
            const cmds = commands().map(c => ({ ...c, s: q ? fuzzy(c.label + ' ' + c.g, q) : 0 })).filter(c => c.s >= 0);
            const data = ctx.data();
            let mem = [];
            if (q && data) {
                mem = data.items.map(it => ({ it, s: fuzzy(it.text, q) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).slice(0, 7)
                    .map(({ it, s }) => ({ g: it.kind === 'person' ? '人物' : '记忆', ico: KINDS[it.kind].ico, label: it.text.slice(0, 60), sub: metaOf(it), s, run: () => ctx.go(it.kind === 'person' ? 'memory:graph' : 'memory:list', { q: it.kind === 'person' ? '' : q, row: it.id, node: it.kind === 'person' ? it.text : null }) }));
            }
            const all = q ? mem.concat(cmds.sort((a, b) => b.s - a.s)) : cmds;
            results = all.slice(0, 40);
            sel = Math.min(sel, Math.max(0, results.length - 1));
            if (!results.length) { listEl.innerHTML = `<div class="ls-cmdk-empty">没有找到「${esc(q)}」</div>`; input.removeAttribute('aria-activedescendant'); return; }
            let g = null, html = '';
            results.forEach((r, i) => {
                if (r.g !== g) { g = r.g; html += `<div class="ls-cmdk-group" role="presentation">${esc(g)}</div>`; }
                html += `<button type="button" class="ls-cmdk-item" role="option" id="ls-cmdk-opt-${i}" data-i="${i}" aria-selected="${i === sel}" tabindex="-1"><span class="ls-cmdk-ico" aria-hidden="true">${I(r.ico)}</span><span class="ls-cmdk-label">${q ? highlight(r.label, q) : esc(r.label)}${r.sub ? `<small>${esc(r.sub)}</small>` : ''}</span>${r.hint ? `<span class="ls-cmdk-hint">${r.hint.split(' ').map(k => `<span class="ls-kbd">${k}</span>`).join('')}</span>` : ''}</button>`;
            });
            listEl.innerHTML = html;
            input.setAttribute('aria-activedescendant', 'ls-cmdk-opt-' + sel);
        };
        const move = (d) => {
            if (!results.length) return;
            sel = (sel + d + results.length) % results.length;
            listEl.querySelectorAll('.ls-cmdk-item').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.i === sel)));
            const cur = listEl.querySelector(`#ls-cmdk-opt-${sel}`);
            if (cur) cur.scrollIntoView({ block: 'nearest' });
            input.setAttribute('aria-activedescendant', 'ls-cmdk-opt-' + sel);
        };
        const run = (i) => { const r = results[i]; if (!r) return; close(); try { r.run(); } catch (e) { warn('cmdk-run', e); } };
        const open = (q) => {
            lastFocus = document.activeElement;
            if (dash.dataset.uiRev === '3') el.dataset.rev = '3'; else delete el.dataset.rev;
            el.hidden = false; input.value = q || ''; sel = 0; render();
            requestAnimationFrame(() => input.focus());
        };
        const close = () => { if (el.hidden) return; el.hidden = true; if (lastFocus && lastFocus.isConnected) try { lastFocus.focus(); } catch (_) { /* 忽略 */ } };
        input.addEventListener('input', () => { sel = 0; render(); });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
            else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
            else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
            else if (e.key === 'Tab') { e.preventDefault(); move(e.shiftKey ? -1 : 1); }   // 焦点圈在面板内
        });
        listEl.addEventListener('click', (e) => { const b = e.target.closest('.ls-cmdk-item'); if (b) run(+b.dataset.i); });
        listEl.addEventListener('pointermove', (e) => { const b = e.target.closest('.ls-cmdk-item'); if (b && +b.dataset.i !== sel) { sel = +b.dataset.i - 0; move(0); } });
        el.addEventListener('pointerdown', (e) => { if (e.target === el) close(); });
        const api = { open, close, toggle: () => (el.hidden ? open() : close()), isOpen: () => !el.hidden };
        el._api = api;
        return api;
    }

    // ------------------------------------------------------------------
    // 升级一个已增强的 Dashboard
    // ------------------------------------------------------------------
    function upgrade(detail) {
        const { dash, overlay, legacy, plugin, state, refreshHealth, isDev } = detail;
        if (!dash || dash.dataset.ui === 'v2') return;
        dash.dataset.ui = 'v2';
        if (v3On()) dash.dataset.uiRev = '3'; else delete dash.dataset.uiRev;
        dash.dataset.uiVersion = VERSION;
        applyAccent();

        const ov = dash.querySelector('#ls-dash-overview');
        const mem = dash.querySelector('#ls-dash-memory');
        const tiles = mem ? mem.querySelector('.ls-tiles') : null;   // v1 入口按钮：原节点保留（data-dash-act 由 v1 处理）
        let data = null, mode = store.get(KEYS.mode, 'list'), filter = store.get(KEYS.filter, 'all'), q = '', limit = PAGE;
        if (!MODES.some(([k]) => k === mode)) mode = 'list';

        // ---- 骨架 -> 真数据（引擎没就绪时最多重试 8 次 × 250ms，然后给错误态） ----
        if (ov) ov.innerHTML = overviewSkeleton();
        if (mem) { mem.innerHTML = memoryShellHTML(mode); mem.querySelector('.ls-v2-body [data-mode="' + mode + '"]').innerHTML = memorySkeleton(); if (tiles) mem.appendChild(tiles); }
        let tries = 0;
        const load = () => {
            if (!overlay.isConnected) return;
            data = collect(plugin, state);
            if (!data.ready && tries++ < 8) { setTimeout(load, 250); return; }
            renderOverview();
            renderMemory(true);
        };
        requestAnimationFrame(() => setTimeout(load, 0));

        // ---- 概览 ----
        const healthPct = () => {
            const m = dash.querySelector('#ls-dash-health-meter'), t = dash.querySelector('#ls-dash-health-text');
            if (!m || !t || !/一切正常|值得留意|需要处理/.test(t.textContent || '')) return null;
            return +m.getAttribute('aria-valuenow');
        };
        let healthMO = null;
        function syncRings() {
            const rings = dash.querySelector('.ls-rings'), m = dash.querySelector('#ls-dash-health-meter');
            if (!rings || !m) return;
            const pct = healthPct();
            rings.dataset.tone = m.dataset.tone || 'ok';
            const v = rings.querySelector('.ls-ring-val[data-ring="health"]');
            const num = rings.querySelector('.ls-rings-key[data-ring="health"] ~ .ls-rings-num');
            if (pct == null) return;
            const len = 2 * Math.PI * 52;
            v.removeAttribute('data-unknown');
            v.setAttribute('stroke-dasharray', `${(len * Math.max(0.02, pct / 100)).toFixed(1)} ${len.toFixed(1)}`);
            if (num) num.innerHTML = `${pct}<small>%</small>`;
        }
        function renderOverview() {
            if (!ov) return;
            ov.innerHTML = overviewHTML(state, data, null);
            try { refreshHealth && refreshHealth(); } catch (e) { warn('health', e); }   // 让 v1 把体检结果写进新的 meter
            syncRings();
            if (healthMO) healthMO.disconnect();
            const m = dash.querySelector('#ls-dash-health-meter'), t = dash.querySelector('#ls-dash-health-text');
            if (m && t && typeof MutationObserver !== 'undefined') {
                healthMO = new MutationObserver(syncRings);
                healthMO.observe(m, { attributes: true, attributeFilter: ['aria-valuenow', 'data-tone'] });
                healthMO.observe(t, { childList: true, characterData: true, subtree: true });
            }
        }

        // ---- 记忆 ----
        const body = () => mem && mem.querySelector('.ls-v2-body');
        function filtered() {
            let list = data ? data.items : [];
            if (filter !== 'all') list = list.filter(it => it.kind === filter);
            if (q) list = list.map(it => ({ it, s: fuzzy(it.text + ' ' + (it.sub || ''), q) })).filter(x => x.s >= 0).sort((a, b) => b.s - a.s).map(x => x.it);
            else list = list.slice().reverse();   // 新的在上
            return list;
        }
        function renderMemory(all) {
            if (!mem || !data) return;
            const b = body();
            b.dataset.mode = mode;
            mem.querySelectorAll('[data-v2-mode]').forEach(x => x.setAttribute('aria-checked', String(x.dataset.v2Mode === mode)));
            mem.querySelector('[data-v2-chips]').innerHTML = chipsHTML(data.items, filter);
            const chipsEl = mem.querySelector('[data-v2-chips]');
            chipsEl.hidden = mode === 'graph' || mode === 'timeline';
            const list = filtered();
            const slot = (m) => b.querySelector(`[data-mode="${m}"]`);
            if (mode === 'list' || all) slot('list').innerHTML = !data.ready ? emptyHTML('暂时读不到记忆数据', '引擎还在加载，或当前没有打开聊天。', 'error') : listHTML(list, q, limit);
            if (mode === 'cards' || all) slot('cards').innerHTML = !data.ready ? '' : cardsHTML(list, q, limit);
            if (mode === 'timeline') slot('timeline').innerHTML = timelineHTML(data.items, q);
            if (mode === 'graph' && !slot('graph').dataset.built) { slot('graph').innerHTML = graphHTML(data); slot('graph').dataset.built = '1'; bindGraph(slot('graph'), data); }
        }
        function setMode(m) { mode = m; store.set(KEYS.mode, m); limit = PAGE; renderMemory(false); }
        if (mem) {
            mem.addEventListener('click', (e) => {
                const mb = e.target.closest('[data-v2-mode]'); if (mb) { setMode(mb.dataset.v2Mode); return; }
                const fb = e.target.closest('[data-v2-filter]'); if (fb) { filter = fb.dataset.v2Filter; store.set(KEYS.filter, filter); limit = PAGE; renderMemory(false); return; }
                if (e.target.closest('[data-v2-more]')) { limit += PAGE; renderMemory(false); return; }
                const row = e.target.closest('[data-v2-row]'); if (row) { row.dataset.active = row.dataset.active === '1' ? '0' : '1'; row.setAttribute('aria-expanded', String(row.dataset.active === '1')); }
            });
            let tmr = null;
            mem.addEventListener('input', (e) => {
                if (!e.target.matches('[data-v2-q]')) return;
                clearTimeout(tmr);
                tmr = setTimeout(() => { q = e.target.value.trim(); limit = PAGE; renderMemory(false); }, 90);
            });
            // 列表键盘：上下键 / j k 在行间移动（Linear）
            mem.addEventListener('keydown', (e) => {
                const inField = e.target.matches('input, textarea');
                const rows = Array.from(mem.querySelectorAll('.ls-v2-body [data-mode="list"] .ls-row2'));
                if (!rows.length) return;
                const down = e.key === 'ArrowDown' || (!inField && e.key === 'j');
                const up = e.key === 'ArrowUp' || (!inField && e.key === 'k');
                if (!down && !up) return;
                if (inField && !down) return;
                e.preventDefault();
                let i = rows.indexOf(document.activeElement);
                i = inField ? 0 : Math.max(0, Math.min(rows.length - 1, i + (down ? 1 : -1)));
                rows[i].focus();
            });
        }

        // ---- 统一跳转：'memory:graph' / 'memory:list:promise' / { q, row, node } ----
        function go(target, opts) {
            const [tab, m, f] = String(target).split(':');
            if (tab === 'memory') {
                dash.querySelector('.ls-dash-tab[data-dash-tab="memory"]')?.click();
                if (f) { filter = f; store.set(KEYS.filter, f); }
                if (opts && typeof opts.q === 'string') { q = opts.q; const inp = mem.querySelector('[data-v2-q]'); if (inp) inp.value = q; }
                if (opts && opts.row) { filter = 'all'; }
                setMode(m || mode);
                if (opts && opts.row) requestAnimationFrame(() => { const r = mem.querySelector(`[data-v2-row="${opts.row}"]`); if (r) { r.dataset.active = '1'; r.focus(); r.scrollIntoView({ block: 'center' }); } });
                if (opts && opts.node && data) requestAnimationFrame(() => { const i = data.nodes.findIndex(n => n.name === opts.node); const g = mem.querySelector(`.ls-gnode[data-i="${i}"]`); if (g) g.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
            }
        }
        dash.addEventListener('click', (e) => {
            const g = e.target.closest('[data-v2-go]'); if (g && dash.contains(g)) { go(g.dataset.v2Go); return; }
            if (e.target.closest('[data-v2-cmdk]')) palette.open();
        });

        // ---- 设置页：强调色 + v2 开关 ----
        const extra = legacy && legacy.querySelector('.ls-dash-settings-extra');
        const setAccent = (k) => {
            store.set(KEYS.accent, k); applyAccent();
            dash.querySelectorAll('[data-v2-accent]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.v2Accent === k)));
        };
        if (extra && !extra.querySelector('[data-v2-accents]')) {
            const cur = store.get(KEYS.accent, 'ice');
            const grp = document.createElement('div');
            grp.className = 'ls-group';
            grp.innerHTML = `<div class="ls-group-title">强调色</div>
                <div class="ls-swatches" role="radiogroup" aria-label="强调色" data-v2-accents>${ACCENTS.map(([k, l]) => `<button type="button" class="ls-swatch" role="radio" data-lt-accent="${k}" data-v2-accent="${k}" aria-checked="${k === cur}" aria-label="${l}" title="${l}"></button>`).join('')}</div>
                <label class="ls-row ls-switch u-mt-3"><span class="ls-switch-text"><span class="ls-switch-title">新版界面（v2）</span><br><span class="ls-switch-sub">关掉后重新打开面板即回到上一版外观</span></span><input type="checkbox" data-v2-toggle checked></label>
                <label class="ls-row ls-switch"><span class="ls-switch-text"><span class="ls-switch-title">精修外观（v3）</span><br><span class="ls-switch-sub">更克制的排版、活动环、玻璃质感的页头与命令面板，即时生效</span></span><input type="checkbox" data-v3-toggle${v3On() ? ' checked' : ''}></label>`;
            extra.insertBefore(grp, extra.children[1] || null);
            grp.addEventListener('click', (e) => { const b = e.target.closest('[data-v2-accent]'); if (b) setAccent(b.dataset.v2Accent); });
            grp.querySelector('[data-v3-toggle]').addEventListener('change', (e) => { e.stopPropagation(); store.set(KEYS.v3, e.target.checked ? '1' : '0'); if (e.target.checked) dash.dataset.uiRev = '3'; else delete dash.dataset.uiRev; });
            grp.querySelector('[data-v2-toggle]').addEventListener('change', (e) => { e.stopPropagation(); store.set(KEYS.v2, e.target.checked ? '1' : '0'); applyAccent(); });
        }

        // ---- 命令面板 + 快捷键 ----
        const palette = createPalette({ overlay, dash, isDev: isDev || (() => false), data: () => data, go, setAccent });
        let gPending = 0;
        const onKey = (e) => {
            if (!overlay.isConnected) { document.removeEventListener('keydown', onKey, true); return; }
            const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '') || (e.target && e.target.isContentEditable);
            if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); palette.toggle(); return; }
            if (palette.isOpen() || typing || e.metaKey || e.ctrlKey || e.altKey) return;
            if (e.key === '/') { e.preventDefault(); go('memory:' + mode); requestAnimationFrame(() => mem && mem.querySelector('[data-v2-q]')?.focus()); return; }
            if (e.key === 'g') { gPending = Date.now(); return; }
            if (gPending && Date.now() - gPending < 900) {
                const map = { o: 'overview', m: 'memory', s: 'settings', d: 'dev' };
                gPending = 0;
                if (map[e.key]) { e.preventDefault(); dash.querySelector(`.ls-dash-tab[data-dash-tab="${map[e.key]}"]`)?.click(); }
            }
        };
        document.addEventListener('keydown', onKey, true);

        // 切到记忆页时若图谱视图从未渲染，补一次（图谱布局较重，按需计算）
        dash.addEventListener('ls-dash:view', (e) => { if (e.detail && e.detail.view === 'memory' && data) renderMemory(false); });
        return { go, palette };
    }

    // ------------------------------------------------------------------
    // 挂载
    // ------------------------------------------------------------------
    /** 开关关闭时：只在「设置 -> 进阶」里放一个「试用新版界面」开关，其余一律不动（玩家不用开控制台） */
    function injectOptIn(legacy) {
        const extra = legacy && legacy.querySelector('.ls-dash-settings-extra');
        if (!extra || extra.querySelector('[data-v2-optin]')) return;
        const row = document.createElement('label');
        row.className = 'ls-row ls-switch';
        row.innerHTML = '<span class="ls-switch-text"><span class="ls-switch-title">试用新版界面（v2）</span><br><span class="ls-switch-sub">健康圆环、关系图、命令面板（Cmd / Ctrl + K）。打开后重新打开面板生效，随时可关。</span></span><input type="checkbox" data-v2-optin>';
        const groups = extra.querySelectorAll('.ls-group');
        (groups[groups.length - 1] || extra).appendChild(row);
        row.querySelector('input').addEventListener('change', (e) => { e.stopPropagation(); store.set(KEYS.v2, e.target.checked ? '1' : '0'); applyAccent(); });
    }
    /* 宿主守卫：判据用假窗口（可能没有 addEventListener）—— v2 装不上不该让外壳跟着崩。 */
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('lonsha:dashboard-enhanced', (e) => {
            if (!cssReady()) return;
            const detail = e.detail || {};
            if (!enabled()) { try { injectOptIn(detail.legacy); } catch (err) { warn('optin', err); } return; }
            try { upgrade(detail); } catch (err) { warn('upgrade', err); }   // 升级失败 = v1 原样可用
        });
    }
    applyAccent();

    window.LonShaDashboardV2 = {
        version: VERSION,
        enable(on = true) { store.set(KEYS.v2, on ? '1' : '0'); applyAccent(); return enabled(); },
        isEnabled: enabled,
        /** v2.1：v3 精修外观（需 v2 已开）；即时作用于已打开的面板 */
        enableV3(on = true) {
            store.set(KEYS.v3, on ? '1' : '0');
            document.querySelectorAll('.ls-dash[data-ui="v2"]').forEach((el) => { if (on) el.dataset.uiRev = '3'; else delete el.dataset.uiRev; });
            return v3On();
        },
        isV3: v3On,
        setAccent(k) { store.set(KEYS.accent, k); return applyAccent(); },
        accents: ACCENTS.map(([k]) => k),
        _internals: { collect, fuzzy, layout, overviewHTML, ringsSVG, sparkSVG, graphHTML, timelineHTML, listHTML, cardsHTML, chipsHTML, upgrade },
    };
})();
