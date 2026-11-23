/**
 * ui/mem-workbench-api.js — LoreCodex 工作台的「本仓数据面」适配器（v3.482.0 · stage-2）
 *
 * 【本文件是什么】
 *   ui/vendor/lorecodex/js/api.js 是上游的**服务端 HTTP 客户端**（21 个导出，打 /corpora、
 *   /tree-index、/tree-search 这套 REST）。本仓没有那台服务端，也不该为了一台工作台去起一台。
 *   所以 stage-2 的做法是：**保留上游前端一行不改**，只把这 21 个导出换成「读本插件引擎」的同名同形实现。
 *   接线点在 ui/vendor/lorecodex/index.html 的 importmap（见该文件的 fork 记录）——
 *   上游 api.js 的字节保持原样，漂移闸 tools/verify_lorecodex_vendor.mjs 照旧盯着它。
 *
 * 【数据从哪来】
 *   工作台跑在与酒馆页面**同源的 iframe** 里，所以直接读 `window.parent.LonShaMemory`（插件实例）。
 *   取不到就如实返回空集合 + 一条 console 诊断，**绝不伪造数据**。
 *   数据面只有一个：`engine.graph.nodes`（记忆图谱节点 Map）。这是引擎认的唯一真源，
 *   所有读法都从这里现算，不额外建副本、不写盘、不改引擎状态。
 *
 * 【三级目录怎么映（决定的理由写在每一行旁边）】
 *   corpus  ↔ 当前会话的记忆库（一个 chat 一个库）
 *   series  ↔ 记忆条目的**类型**（人物 / 事件 / 关系 / 其它）—— 这是 lorecodex 的「卷」
 *   arc     ↔ **楼层段**（每 100 楼一篇）—— 这是它的「篇」
 *   scene   ↔ **一条记忆节点** —— 这是它的「幕」
 *   scene.order ↔ **消息楼层号**
 *   为什么这样映：lorecodex 的防剧透口径本来就是 `maxOrder`（序 <= 上限才可见），
 *   而本仓的「防止角色超前认知」正是按楼层来的（`data.floor`）——两边是同一件事，
 *   一个「楼层上限」输入框就能真的锁住剧透，不需要新造概念。
 *
 * 【刻意不做的事】
 *   · 不端上游的 browser_engine / tree_agent / builders：那是「LLM 逐轮翻书」的另一套检索范式，
 *     端进来就是两套记忆同时在线。本仓的召回由自己的引擎负责，工作台只做**只读视图**。
 *   · 不做导入建树 / 删除书库 / 导出 lorepack：这三类在 UI 上会显式报「只读视图」错误，
 *     不静默成功（静默成功比报错更糟：用户会以为真导进去了）。
 *   · 不写回忆录式的「导读」：`runTreeSearch` 的 guide 只写「这一发是什么检索、打了几分、
 *     命中几条」，不生成散文。散文是 LLM 的活，本模块没有 LLM。
 *
 * 【纪律】
 *   ① **只读**：本文件对引擎零写入（不调 addNode/setItem/任何写口）。
 *   ② **fail-open**：取不到宿主、节点畸形、字段缺——一律返回空集合或 0，不抛（除「明确的
 *      只读拒绝」与「剧透拦截」两处，那两处必须让用户看见）。
 *   ③ **数字必须能回源**：stats 的每个数都是当场数出来的，不写死、不估算。
 */

const TAG = '[LonSha:workbench-api]';
const ARC_SPAN = 100;
const RUNS_KEY = 'lonsha_workbench_runs_v1';
const RUNS_MAX = 30;
const READ_ONLY_MSG = '本工作台为只读视图（数据由插件引擎提供），导入建树 / 删除 / 导出请在插件设置面板里操作。';

/* ============================ 宿主探测 ============================ */

function hostWindows() {
    const out = [];
    try { if (window.parent && window.parent !== window) out.push(window.parent); } catch (_e) { /* 跳源 */ }
    try { if (window.top && window.top !== window) out.push(window.top); } catch (_e) { /* 跳源 */ }
    out.push(window);
    return out;
}

/** @returns {object|null} 插件实例（window.LonShaMemory） */
function hostPlugin() {
    for (const w of hostWindows()) {
        try {
            const p = w.LonShaMemory;
            if (p && (p.engine || p.VERSION)) return p;
        } catch (_e) { /* 跳源读属性会抛，忽略 */ }
    }
    return null;
}

function hostEngine() {
    const p = hostPlugin();
    try { return (p && p.engine) || null; } catch (_e) { return null; }
}

/** 当前会话标识（只用于 corpus id 与展示；取不到就给 current，不猜） */
function chatKey() {
    const tries = [];
    const eng = hostEngine();
    tries.push(() => hostPlugin()?.chatId, () => eng?.chatId, () => eng?.config?.config?.chatId);
    for (const w of hostWindows()) {
        tries.push(() => w.chat_metadata?.chat_id);
        tries.push(() => w.SillyTavern?.getContext?.().chatId);
        tries.push(() => w.SillyTavern?.getContext?.().chat_metadata?.chat_id);
    }
    for (const t of tries) {
        try { const v = t(); if (v) return String(v); } catch (_e) { /* 忽略 */ }
    }
    return 'current';
}

function corpusIdOf() { return 'mem-' + chatKey(); }

/* ============================ 小工具 ============================ */

function num(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function str(v) { return v === null || v === undefined ? '' : String(v); }

/** 短 id：FNV-1a 32 位再 base36。用它是因为记忆节点 id 形如 node_1763..._k3j9 （太长，目录里读不出版面） */
function shortId(raw) {
    const s = str(raw);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return 'm' + h.toString(36).padStart(6, '0');
}

const TYPE_ZH = {
    character: '人物', person: '人物', npc: '人物',
    event: '事件', quest: '事件', plot: '事件',
    relation: '关系', relation_ship: '关系', faction: '关系',
    location: '地点', scene: '地点', place: '地点',
    item: '物品', object: '物品',
};
function typeZh(t) {
    const k = str(t).toLowerCase();
    if (TYPE_ZH[k]) return TYPE_ZH[k];
    return k ? '其它（' + k + '）' : '未分类';
}

/** 节点的楼层号：优先 data.floor（提取侧写的），再看回填楼层，再退 order */
function nodeOrder(node) {
    const d = (node && node.data) || {};
    const cands = [d.floor, d.backfillFloor, d.order, node && node.floor];
    for (const c of cands) { const n = num(c); if (n > 0) return n; }
    return 0;
}

/** 把一条记忆节点铺成可读正文。为什么要自己写而不直接用召回层的 content：
 *  召回层的 content 是「给 LLM 的摘要」（200 字截断），工作台要看的是**这条记忆到底存了什么**，
 *  截断后的版本会让用户以为引擎只存了这么多。 */
function renderNodeText(node) {
    const d = (node && node.data) || {};
    const lines = [];
    const push = (label, v) => {
        const s = str(v).trim();
        if (s) lines.push(label + '：' + s);
    };
    push('名称', node && node.name);
    const order = nodeOrder(node);
    if (order > 0) lines.push('楼层：' + order);
    push('时间', d.time || d.timeSpan || d.time_span);
    push('地点', d.location || d.place);
    push('描述', d.description || d.desc || d.summary);
    push('正文', d.content || d.text || d.detail);
    push('事件类型', d.type && node && d.type !== node.type ? d.type : '');
    if (Array.isArray(d.characters) && d.characters.length) push('涉及人物', d.characters.map(str).filter(Boolean).join('、'));
    if (Array.isArray(d.aliases) && d.aliases.length) push('别名', d.aliases.map(str).filter(Boolean).join('、'));
    if (Array.isArray(d.tags) && d.tags.length) push('标签', d.tags.map(str).filter(Boolean).join('、'));
    if (Array.isArray(d.status_changes) && d.status_changes.length) {
        const rows = d.status_changes
            .map((c) => {
                if (!c || typeof c !== 'object') return str(c);
                const who = str(c.character || c.name || c.who).trim();
                const field = str(c.field || c.key).trim();
                const val = str(c.value !== undefined ? c.value : c.to).trim();
                return [who, field, val].filter(Boolean).join(' · ');
            })
            .filter(Boolean);
        if (rows.length) lines.push('状态变更：' + rows.join('；'));
    }
    /* data 里剩下的、上面没认领的字段：逐条列出来（宁可多列，也不要把引擎存了的东西藏掉） */
    const claimed = new Set(['floor', 'backfillFloor', 'order', 'time', 'timeSpan', 'time_span', 'location',
        'place', 'description', 'desc', 'summary', 'content', 'text', 'detail', 'type', 'characters',
        'aliases', 'tags', 'status_changes', 'source', 'name', 'title']);
    const rest = [];
    for (const k of Object.keys(d)) {
        if (claimed.has(k)) continue;
        const v = d[k];
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'object') {
            try { rest.push(k + '=' + JSON.stringify(v)); } catch (_e) { /* 循环引用 */ }
        } else rest.push(k + '=' + str(v));
    }
    if (rest.length) lines.push('其它字段：' + rest.join(' ; '));
    return lines.join('\n');
}

/* ============================ 采集 ============================ */

function collectNodes() {
    const eng = hostEngine();
    const g = eng && eng.graph;
    const bag = g && g.nodes;
    if (!bag) return { list: [], why: eng ? 'engine.graph.nodes 缺席' : '未找到 window.LonShaMemory.engine' };
    let arr;
    try {
        /* 为什么不用 `bag instanceof Map`：工作台的 iframe 与酒馆页面是两个 realm，
         *   父窗口造的 Map 在子 realm 里 `instanceof Map` **是 false**（也是实测拿不到节点的真因）。
         *   所以这里按**形状**认（有 values() 就是 Map 形），而不是按构造器身份认。 */
        if (typeof bag.values === 'function') arr = Array.from(bag.values());
        else if (Array.isArray(bag)) arr = bag.slice();
        else if (typeof bag === 'object') arr = Object.keys(bag).map((k) => bag[k]);
        else arr = [];
    } catch (_e) { arr = []; }
    return { list: arr.filter((n) => n && typeof n === 'object'), why: null };
}

/** 把节点铺成 scene（含短 id 与所属 arc） */
function buildAll() {
    const { list, why } = collectNodes();
    const scenes = [];
    for (const n of list) {
        const d = n.data || {};
        const order = nodeOrder(n);
        const title = str(n.name || d.title || d.name || '').trim() || '（未命名条目）';
        const text = renderNodeText(n);
        scenes.push({
            rawId: str(n.id),
            nodeId: shortId(n.id || title + '#' + order),
            type: str(n.type || 'unknown'),
            order,
            title,
            text,
            chars: text.length,
        });
    }
    return { scenes, why };
}

/** 楼层段名（arc 的 title） */
function arcLabel(startFloor) {
    if (startFloor <= 0) return '未标楼层';
    return '第 ' + startFloor + '–' + (startFloor + ARC_SPAN - 1) + ' 楼';
}

/** 构建整棵树（每次调用现算；节点量级是千级，实测 < 5ms） */
function buildIndex(maxOrder) {
    const mo = num(maxOrder);
    const { scenes, why } = buildAll();
    const visible = mo > 0 ? scenes.filter((s) => s.order > 0 && s.order <= mo) : scenes;
    const byArc = new Map();
    for (const s of visible) {
        const typeKey = str(s.type || 'unknown').toLowerCase();
        const cat = typeZh(s.type);
        const start = s.order > 0 ? Math.floor((s.order - 1) / ARC_SPAN) * ARC_SPAN + 1 : 0;
        const arcId = typeKey + '@' + start;
        if (!byArc.has(arcId)) {
            byArc.set(arcId, {
                arc_id: arcId, arc_key: arcId, series: cat, category: cat,
                /* 篇名只写楼层段：卷（series）已经是类型，再拼一次就是每篇都重复「人物 · 」。 */
                title: arcLabel(start), order: start > 0 ? start : null,
                description: '', outline_text: '', tone_tags: [], total_chars: 0,
                characters: [], key_items: [], _llm_done: true, scenes: [],
            });
        }
        const arc = byArc.get(arcId);
        arc.scenes.push({
            node_id: s.nodeId, title: s.title, group: cat, group_title: arcLabel(start),
            chars: s.chars, tone_tags: [], order: s.order > 0 ? s.order : null,
            summary: s.text.replace(/\n/g, ' ').slice(0, 80), _llm_done: true,
        });
        arc.total_chars += s.chars;
    }
    /* 排序：篇按楼层段升序，幕按楼层升序（楼层 0 的条目落在各自类型的首篇） */
    const arcs = Array.from(byArc.values()).sort((a, b) => {
        const ao = a.order === null ? -1 : a.order;
        const bo = b.order === null ? -1 : b.order;
        if (ao !== bo) return ao - bo;
        return a.category.localeCompare(b.category);
    });
    for (const a of arcs) a.scenes.sort((x, y) => (x.order || 0) - (y.order || 0));

    let maxFloor = 0;
    let totalChars = 0;
    for (const s of scenes) { if (s.order > maxFloor) maxFloor = s.order; totalChars += s.chars; }

    return {
        corpus_name: '会话记忆库 · ' + chatKey(),
        corpus_id: corpusIdOf(),
        arcs,
        aliases: [],
        stats: {
            arcs: arcs.length,
            scenes: visible.length,
            total_chars: totalChars,
            max_order: maxFloor,
            llm_arcs: arcs.length,
            llm_scenes: visible.length,
            hidden_by_order: scenes.length - visible.length,
        },
        corpus: {
            spoiler_gate: { enabled: true, order_label: '记忆楼层', default_max_order: 0 },
            prompt_framing: {},
            ui: { presets: [] },
        },
        _why: why,
    };
}

function corpusMetaOf() {
    const idx = buildIndex(0);
    return {
        id: idx.corpus_id,
        name: idx.corpus_name,
        description: '本插件记忆图谱的只读视图（' + idx.stats.scenes + ' 条记忆 · ' + idx.stats.arcs + ' 篇）',
        language: 'zh-CN',
        stats: idx.stats,
        categories: Array.from(new Set(idx.arcs.map((a) => a.category))),
        series: Array.from(new Set(idx.arcs.map((a) => a.series))),
        tone_tags: [],
        spoiler_gate: idx.corpus.spoiler_gate,
        prompt_framing: {},
        ui: { presets: [] },
    };
}

/* ============================ 检索 ============================ */

function tokenize(text) {
    const raw = str(text).toLowerCase();
    const parts = raw.split(/[\s,，、。.！!？?；;：:·\/\\|\[\]（）()<>《》"'“”‘’—~]+/).map((x) => x.trim()).filter(Boolean);
    const out = [];
    for (const p of parts) {
        if (p.length >= 2) out.push(p);
        else if (/[0-9]/.test(p)) out.push(p);
    }
    return Array.from(new Set(out));
}

function countHits(hay, needle) {
    if (!needle) return 0;
    let n = 0;
    let i = 0;
    for (;;) {
        const at = hay.indexOf(needle, i);
        if (at < 0) break;
        n += 1;
        i = at + needle.length;
        if (n > 500) break;
    }
    return n;
}

function snippetAround(text, needles, radius) {
    const hay = str(text);
    const lower = hay.toLowerCase();
    let best = -1;
    for (const nd of needles) {
        const at = lower.indexOf(nd);
        if (at >= 0 && (best < 0 || at < best)) best = at;
    }
    if (best < 0) return hay.slice(0, radius * 2);
    const from = Math.max(0, best - radius);
    const to = Math.min(hay.length, best + radius);
    return (from > 0 ? '…' : '') + hay.slice(from, to).replace(/\n/g, ' ') + (to < hay.length ? '…' : '');
}

/* ============================ 运行台账（本地） ============================
 * 这里记的是**本工作台自己发起的检索**，不是引擎的召回回执。
 * 为什么不假装它是引擎回执：引擎的召回发生在生成回合里（onBeforeGeneration），
 * 那一路没有对外暴露的「本次注入了哪几条」的读口；把本地记录画成引擎回执就是造假。
 * 所以界面上的轨迹台只写「工作台检索记录」，且每条都带 note 说明。
 */
function readRuns() {
    try {
        const raw = localStorage.getItem(RUNS_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch (_e) { return []; }
}

function writeRuns(arr) {
    try { localStorage.setItem(RUNS_KEY, JSON.stringify(arr.slice(0, RUNS_MAX))); } catch (_e) { /* 配额满就丢 */ }
}

function recordRun(run) {
    const arr = readRuns();
    arr.unshift(run);
    writeRuns(arr);
    return run;
}

/* ============================ 21 个导出 ============================ */

export async function fetchHealth() {
    const plugin = hostPlugin();
    const meta = corpusMetaOf();
    const why = meta.stats.scenes === 0 ? collectNodes().why : null;
    if (!plugin) console.warn(TAG, '未在宿主窗口找到 window.LonShaMemory —— 工作台将以空库启动（这不是崩溃，是数据面没接上）');
    return {
        ok: true,
        engine: 'lonsha-memory-plugin',
        version: str(plugin && plugin.VERSION) || str(plugin && plugin.version) || 'unknown',
        mode: 'in-page-readonly',
        boot_ms: 1,
        defaultCorpus: meta.id,
        corpora: [meta],
        treeLoaded: meta.stats.scenes > 0,
        treeArcs: meta.stats.arcs,
        treeScenes: meta.stats.scenes,
        config: { chatModel: '本地检索（无 LLM 轮次）', defaultCorpus: meta.id },
        note: why || '',
    };
}

export async function fetchCorpora() {
    const meta = corpusMetaOf();
    return { defaultCorpus: meta.id, corpora: [meta] };
}

export async function reloadCorpora() {
    const res = await fetchCorpora();
    return { ok: true, ...res };
}

export async function fetchCorpusDetail(id) {
    const meta = corpusMetaOf();
    if (id && str(id) !== meta.id) {
        console.warn(TAG, '请求的 corpus 不在本插件数据面里：' + str(id) + '（当前只有 ' + meta.id + '）');
    }
    return { ...meta, config: { name: meta.name, description: meta.description, spoiler_gate: meta.spoiler_gate } };
}

export async function saveCorpusConfig() {
    throw new Error('只读视图：书库配置请在插件设置面板里改（本工作台不写引擎）。');
}

export async function fetchTreeIndex(corpusId, maxOrder = 0) {
    return buildIndex(maxOrder);
}

export async function fetchSceneText(corpusId, nodeId, maxOrder = 0) {
    const idx = buildIndex(maxOrder);
    for (const arc of idx.arcs) {
        const at = arc.scenes.findIndex((s) => s.node_id === nodeId);
        if (at < 0) continue;
        const meta = arc.scenes[at];
        const full = buildAll().scenes.find((s) => s.nodeId === nodeId);
        if (!full) throw new Error('scene not found（节点已不在图谱里：' + str(nodeId) + '）');
        return {
            node_id: meta.node_id,
            arc_id: arc.arc_id,
            arc_title: arc.title,
            category: arc.category,
            title: meta.title,
            group: meta.group,
            group_title: meta.group_title,
            order: meta.order,
            chars: meta.chars,
            tone_tags: [],
            summary: '',
            text: full.text,
        };
    }
    /* 收藏不到就是「被楼层锁拦住了」还是「根本没有」——这两件事必须分开报 */
    const all = buildAll().scenes.find((s) => s.nodeId === nodeId);
    if (all && num(maxOrder) > 0 && all.order > num(maxOrder)) {
        throw new Error('blocked by spoiler gate (order=' + all.order + ' > maxOrder=' + num(maxOrder) + ')');
    }
    throw new Error('scene not found（' + str(nodeId) + '）');
}

export async function fetchGrep(corpusId, opts = {}) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const mo = num(opts.maxOrder);
    const limit = Math.max(1, num(opts.limit) || 40);
    const terms = tokenize(opts.q);
    const idx = buildIndex(mo);
    const arcOf = new Map();
    for (const a of idx.arcs) for (const s of a.scenes) arcOf.set(s.node_id, a);
    const full = buildAll().scenes;
    const catFilter = str(opts.category);
    const hits = [];
    const list = mo > 0 ? full.filter((s) => s.order > 0 && s.order <= mo) : full;
    for (const s of list) {
        const arc = arcOf.get(s.nodeId);
        if (!arc) continue;
        if (catFilter && catFilter !== '全部' && arc.category !== catFilter) continue;
        if (!terms.length) continue;
        const hay = (s.title + '\n' + s.text).toLowerCase();
        let n = 0;
        let allHit = true;
        for (const t of terms) {
            const c = countHits(hay, t);
            if (c === 0) { allHit = false; break; }
            n += c;
        }
        if (!allHit) continue;
        hits.push({
            node_id: s.nodeId, arc_id: arc.arc_id, arc_title: arc.title,
            title: s.title, snippet: snippetAround(s.text, terms, 42),
            match_count: n, cameo: false, order: s.order,
            _score: n + (countHits(s.title.toLowerCase(), terms[0] || '') * 4),
        });
    }
    hits.sort((a, b) => b._score - a._score || b.match_count - a.match_count);
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    return {
        total: hits.length, cameo_count: 0, took_ms: Math.round(t1 - t0),
        hits: hits.slice(0, limit).map(({ _score, ...rest }) => rest),
        scanned: list.length,
        note: mo > 0 ? '仅在楼层 <= ' + mo + ' 的条目里扫描' : '全库扫描（未设楼层上限）',
    };
}

export async function fetchRuns() {
    const runs = readRuns();
    return { runs, note: '本清单是本工作台自己发起的检索记录，不是引擎在生成回合里的召回回执。' };
}

export async function runTreeSearch(payload = {}, { onProgress = null } = {}) {
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const mo = num(payload.maxOrder);
    const want = num(payload.maxScenes);
    const askText = [payload.query, payload.onDemand, ...(payload.sessionRecall || []),
        ...((payload.recentChat || []).map((m) => (m && (m.text || m.name)) || ''))].filter(Boolean).join(' ');
    const terms = tokenize(askText);
    if (typeof onProgress === 'function') onProgress({ turn: 1, toolNames: ['本地扫描'], reasoningChars: 0 });

    const idx = buildIndex(mo);
    const arcOf = new Map();
    for (const a of idx.arcs) for (const s of a.scenes) arcOf.set(s.node_id, a);
    const full = buildAll().scenes;
    const list = mo > 0 ? full.filter((s) => s.order > 0 && s.order <= mo) : full;

    const scored = [];
    for (const s of list) {
        if (!terms.length) break;
        const hayText = s.text.toLowerCase();
        const hayTitle = s.title.toLowerCase();
        let score = 0;
        let matched = 0;
        for (const t of terms) {
            const ct = countHits(hayText, t);
            const ti = countHits(hayTitle, t);
            if (ct === 0 && ti === 0) continue;
            matched += 1;
            score += ct + ti * 6;
        }
        if (!matched) continue;
        /* 覆盖率加权：命中词种越多越靠前（防「一个高频词刷上榜」） */
        score = score * (1 + matched / Math.max(1, terms.length));
        scored.push({ s, score, matched });
    }
    scored.sort((a, b) => b.score - a.score || b.s.order - a.s.order);
    const take = want > 0 ? want : 8;
    const picked = scored.slice(0, take);
    const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());

    const traversedArcs = Array.from(new Set(picked.map((p) => arcOf.get(p.s.nodeId)?.arc_id).filter(Boolean)));
    const out = {
        corpus_id: corpusIdOf(),
        corpus_name: '会话记忆库 · ' + chatKey(),
        max_order: mo,
        skip: scored.length === 0,
        reason: scored.length === 0 ? (terms.length ? '全库没有任何条目命中这些词' : '没有给出检索词') : '',
        took_ms: Math.max(1, Math.round(t1 - t0)),
        turns: 1,
        usage: { prompt: 0, completion: 0 },
        prompts: {
            system: '本工作台不调用 LLM：这里是本插件引擎图谱的直接关键词扫描（AND 语义 + 覆盖加权）。',
            user: '检索词：' + (terms.join(' / ') || '（空）') + '\n扫描条目：' + list.length + ' 条',
        },
        raw_answer: '',
        steps: [{
            turn: 1, kind: 'final', llm_ms: 0, tool_ms: Math.round(t1 - t0),
            reasoning: '',
            calls: [{
                name: 'local_scan',
                args: { terms, maxOrder: mo, scanned: list.length, maxScenes: take },
                summary: '扫描 ' + list.length + ' 条，命中 ' + scored.length + ' 条，取前 ' + picked.length + ' 条',
                result_chars: picked.reduce((acc, p) => acc + p.s.chars, 0),
                result_preview: picked.map((p, i) => (i + 1) + '. [' + p.s.nodeId + '] 楼' + p.s.order + ' · ' + p.s.title + ' · score=' + p.score.toFixed(1)).join('\n') || '（无命中）',
                meta: { arc_ids: traversedArcs, node_ids: picked.map((p) => p.s.nodeId) },
            }],
        }],
        trace: [
            '本地关键词扫描：词 ' + terms.length + ' 个，条目 ' + list.length + ' 条',
            '命中 ' + scored.length + ' 条，按覆盖加权取前 ' + picked.length + ' 条',
            '未调用 LLM —— 这不是「模型翻书」的轨迹，是关键词打分的轨迹',
        ],
        traversal: {
            listed_arcs: idx.arcs.map((a) => a.arc_id),
            expanded_arcs: traversedArcs,
            read_scenes: list.map((s) => s.nodeId),
            selected_nodes: picked.map((p) => p.s.nodeId),
            raw_selected_nodes: picked.map((p) => p.s.nodeId),
        },
        scenes: picked.map((p) => {
            const arc = arcOf.get(p.s.nodeId);
            return {
                node_id: p.s.nodeId, arc_id: arc ? arc.arc_id : '', arc_title: arc ? arc.title : '',
                category: arc ? arc.category : '', title: p.s.title,
                order: p.s.order > 0 ? p.s.order : null, text: p.s.text, chars: p.s.chars,
                score: Math.round(p.score * 10) / 10, matched: p.matched,
            };
        }),
        guide: scored.length
            ? '本地检索命中 ' + picked.length + ' 条（共 ' + scored.length + ' 条命中）。排序依据是关键词覆盖与词频，不是模型判断；不含跨篇章大纲，也不生成散文导读。'
            : '本地检索没有命中。'
            + (terms.length ? '换个词，或者把楼层上限放开（当前 ' + (mo > 0 ? mo : '全开') + '）。' : '先填检索词。'),
        outlines: [],
        relations: [],
        timeline_note: mo > 0 ? '楼层上限 ' + mo : '未设楼层上限',
    };

    const runId = 'wb-' + Date.now().toString(36);
    recordRun({
        id: runId,
        corpus_id: out.corpus_id,
        max_order: mo,
        input: { query: str(payload.query), onDemand: str(payload.onDemand), maxScenes: take },
        output: out,
        note: '工作台本地检索记录（非引擎召回回执）',
        ts: Date.now(),
    });
    return { ...out, run_id: runId };
}

export async function fetchConfig() {
    const eng = hostEngine();
    const cfg = (eng && eng.config && eng.config.config) || {};
    return {
        chatModel: '本地检索（无 LLM 轮次）',
        defaultCorpus: corpusIdOf(),
        readOnly: true,
        engineEnabled: cfg.enabled !== false,
        extractionEnabled: cfg.extractionEnabled !== false,
        vectorEnabled: cfg.vectorEnabled !== false,
        note: '这里只读引擎的开关读数；改配置请回插件设置面板。',
    };
}

export async function saveConfig() {
    throw new Error('只读视图：插件配置请在插件设置面板里改。');
}

export async function fetchModels() {
    return { models: [], data: [], note: '本工作台不调用 LLM，没有模型列表。' };
}

export async function cancelJob() {
    return { ok: false, unsupported: true, reason: '本工作台不起后台任务。' };
}

export async function findRunningJobForCorpus() {
    return null;
}

export async function previewLocalImportFile() {
    throw new Error(READ_ONLY_MSG);
}

export async function importCorpus() {
    throw new Error(READ_ONLY_MSG);
}

export async function upgradeCorpus() {
    throw new Error(READ_ONLY_MSG);
}

export async function fetchJob() {
    return { ok: false, unsupported: true, reason: '本工作台不起后台任务。' };
}

export async function exportCorpusLorepack() {
    throw new Error(READ_ONLY_MSG);
}

export async function deleteCorpus() {
    throw new Error(READ_ONLY_MSG);
}
