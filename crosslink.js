// crosslink.js — 条目关联（Crosslink），v3.184.0
// ------------------------------------------------------------
// 为什么存在：
//   本仓库的召回是**按查询相关性**取条目的：查询词命中谁，就召回谁。条目之间
//   除了 MemoryGraph 的显式边（participated_in / knows 等，靠提取管线写）之外，
//   没有任何横向联系——A 条目的正文里提到了 B 条目所代表的人/地/事，
//   系统完全不知道，于是同一概念散在不同楼的记忆永远连不起来。
//
//   nocturne_memory 的 Glossary（豆辞典）解决同一问题：把关键词绑定到记忆节点，
//   用 Aho-Corasick 多模式匹配扫描正文，命中即生成跨节点引用
//   ——「写得越多，关联自动越密」。
//
//   本模块取其**机制**，按 LonSha 规范重写：
//     · 手写 Aho-Corasick（trie + BFS fail 链），不引第三方依赖（本仓库零依赖纪律）
//     · 扫描只**报告**命中，不自动写图。写图是提取管线的职责，本模块给候选与证据，
//       由宿主决定要不要建立关联——自动写边会在长线里累积幻觉边，不可逆。
//     · 索引指纹判过期：词表变了才重建自动机（nocturne 用 DB 指纹判，本仓无 DB，
//       改用词表内容指纹）。
//     · 不抛：扫描路径在注入前执行，抛一次会连坐整轮注入。
//
// 与 MemoryGraph 的分工：
//   graph  记「这条边被提取管线确认过」——强关系，语义明确
//   crosslink 记「这两个条目文本上共享同一个词」——弱关系，只作候选
//   弱关系不写图、不进图遍历，只在注入时作为「可能相关」的补充提示。
(function (root) {
    'use strict';
    const CROSSLINK_VERSION = 1;

    // 关键词最短长度。单字关键词误报率极高（「他」「门」「上」都会命中），
    // 且中文单字极少构成可辨的人/地/事名。低于此长度直接拒收。
    const MIN_KEYWORD_LEN = 2;
    // 单次扫描的命中上限。正文里出现几十个已知词时，全量返回会把注入撑爆，
    // 且长尾命中往往是最不相关的那个。
    const DEFAULT_MAX_HITS = 12;

    /** 按 code point 拆分（与 kw.length 口径统一：都用 code point 计数）。 */
    function toChars(str) {
        try { return Array.from(String(str || '')); } catch (_e) { return []; }
    }

    // ------------------------------------------------------------
    // Aho-Corasick：建 trie → BFS 补 fail 链 → 扫描时沿 fail 链取 output。
    // 复杂度 O(文本长度 + 命中数)，与词表规模无关——这是它比逐个 indexOf 好的地方。
    // 节点形如 { next: Map<char, idx>, fail: idx, out: string[] }。
    // ------------------------------------------------------------
    function buildAutomaton(patterns) {
        const nodes = [{ next: new Map(), fail: 0, out: [] }];
        for (const p of patterns) {
            const chars = toChars(p);
            let cur = 0;
            for (const ch of chars) {
                let nxt = nodes[cur].next.get(ch);
                if (nxt === undefined) {
                    nxt = nodes.length;
                    nodes.push({ next: new Map(), fail: 0, out: [] });
                    nodes[cur].next.set(ch, nxt);
                }
                cur = nxt;
            }
            nodes[cur].out.push(p);
        }
        // BFS 补 fail：根的直接子节点 fail 指向根。
        const queue = [];
        for (const child of nodes[0].next.values()) { nodes[child].fail = 0; queue.push(child); }
        let head = 0;
        while (head < queue.length) {
            const cur = queue[head++];
            for (const [ch, child] of nodes[cur].next) {
                let f = nodes[cur].fail;
                while (f !== 0 && !nodes[f].next.has(ch)) f = nodes[f].fail;
                const cand = nodes[f].next.get(ch);
                nodes[child].fail = (cand !== undefined && cand !== child) ? cand : 0;
                // 继承 fail 节点的 output：这样扫描时一次命中就能拿到所有后缀词。
                nodes[child].out = nodes[child].out.concat(nodes[nodes[child].fail].out);
                queue.push(child);
            }
        }
        return nodes;
    }

    /**
     * 在文本里扫全部命中的关键词。
     * @returns {Map<string, number[]>} 关键词 → 出现位置（code point 下标）数组
     */
    function scanText(text, nodes) {
        const hits = new Map();
        const chars = toChars(text);
        let cur = 0;
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            while (cur !== 0 && !nodes[cur].next.has(ch)) cur = nodes[cur].fail;
            const nxt = nodes[cur].next.get(ch);
            cur = (nxt !== undefined) ? nxt : 0;
            const out = nodes[cur].out;
            for (let k = 0; k < out.length; k++) {
                const kw = out[k];
                const pos = i - toChars(kw).length + 1;
                const arr = hits.get(kw);
                if (arr) arr.push(pos); else hits.set(kw, [pos]);
            }
        }
        return hits;
    }

    /** 词表指纹：内容变了才需要重建自动机（顺序无关，故排序后 join）。 */
    function fingerprintOf(keywords) {
        try {
            const list = Array.from(keywords || []).map(String).sort();
            let h = 0x811c9dc5;
            for (const kw of list) {
                for (let i = 0; i < kw.length; i++) { h ^= kw.charCodeAt(i); h = Math.imul(h, 0x01000193); }
                h ^= 0x1f; h = Math.imul(h, 0x01000193);   // 词间分隔，防「ab+c」与「a+bc」同指纹
            }
            return (h >>> 0).toString(16).padStart(8, '0') + ':' + list.length;
        } catch (_e) { return '0:0'; }
    }

    /**
     * 建一个关联索引实例。
     * @param {object} opts
     *   minLength  关键词最短长度（默认 2）
     *   maxHits    单次扫描命中上限（默认 12）
     *   stopwords  停用词表（通用词，命中不计）——避免「主角」「系统」这类词把所有条目串成一团
     */
    function createIndex(opts = {}) {
        const minLen = Number.isFinite(Number(opts.minLength)) ? Math.max(1, Math.round(Number(opts.minLength))) : MIN_KEYWORD_LEN;
        const maxHits = Number.isFinite(Number(opts.maxHits)) ? Math.max(1, Math.round(Number(opts.maxHits))) : DEFAULT_MAX_HITS;
        // stopwords 必须是数组。传字符串（配置面板给的是逗号分隔文本）时**不能**按 Array.from 拆——
        // 那会把「主角」拆成「主」「角」两个停用词，通用词照样进表、用户以为设了其实没设。
        // 这里主动按分隔符切，并在 stats 里留下来源，防静默失效。
        const stopSrc = Array.isArray(opts.stopwords)
            ? opts.stopwords
            : (typeof opts.stopwords === 'string'
                ? opts.stopwords.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
                : []);
        const stop = new Set(stopSrc.map(s => String(s)).filter(Boolean));

        /** keyword -> 引用集合（引用是任意字符串 id：节点 id / 摘要 key / 条目名）。 */
        const refs = new Map();
        let automaton = null;
        let fingerprint = '';
        let dirty = true;
        let rejected = 0;   // 因过短/停用词被拒的词数（诊断用：不静默吞）

        function ensure() {
            if (!dirty && automaton) return;
            const kws = Array.from(refs.keys());
            automaton = kws.length ? buildAutomaton(kws) : null;
            fingerprint = fingerprintOf(kws);
            dirty = false;
        }

        return {
            CROSSLINK_VERSION,

            /**
             * 登记一个关键词 → 引用。
             * 过短 / 停用词直接拒收（返回 false），不建索引——静默收录才是缺陷。
             */
            add(keyword, ref) {
                try {
                    const kw = String(keyword || '').trim();
                    const r = String(ref || '').trim();
                    if (!kw || !r) return false;
                    if (toChars(kw).length < minLen || stop.has(kw)) { rejected++; return false; }
                    let set = refs.get(kw);
                    if (!set) { set = new Set(); refs.set(kw, set); }
                    if (set.has(r)) return false;    // 幂等：重复登记不改指纹
                    set.add(r);
                    dirty = true;
                    return true;
                } catch (_e) { return false; }
            },

            /** 批量登记：entries 形如 [{ keyword, ref }] 或 [ref, keyword] 元组均可。 */
            addAll(entries) {
                let n = 0;
                const list = Array.isArray(entries) ? entries : [];
                for (const e of list) {
                    if (!e) continue;
                    if (Array.isArray(e)) { if (this.add(e[0], e[1])) n++; }
                    else if (this.add(e.keyword, e.ref)) n++;
                }
                return n;
            },

            /** 移除某引用的全部关键词（条目被删/折叠时调用）。 */
            removeRef(ref) {
                const r = String(ref || '');
                if (!r) return 0;
                let n = 0;
                for (const [kw, set] of refs) {
                    if (set.delete(r)) { n++; if (!set.size) refs.delete(kw); dirty = true; }
                }
                return n;
            },

            /** 从节点列表建索引（适配 MemoryGraph.nodes）。节点名即关键词。 */
            loadFromNodes(nodes, refOf) {
                let n = 0;
                const list = Array.isArray(nodes) ? nodes : [];
                for (const node of list) {
                    if (!node) continue;
                    const name = String(node.name || node.title || node.key || '').trim();
                    if (!name) continue;
                    const ref = refOf ? refOf(node) : (node.id || name);
                    if (this.add(name, ref)) n++;
                }
                return n;
            },

            /**
             * 扫描一段文本，返回命中的关联候选。
             * 只报告，不写图——写图是提取管线的职责。
             * @returns {{hits: Array<{keyword:string, refs:string[], positions:number[]}>, total:number, truncated:boolean}}
             */
            scan(text) {
                try {
                    ensure();
                    if (!automaton) return { hits: [], total: 0, truncated: false };
                    const found = scanText(text, automaton);
                    if (!found.size) return { hits: [], total: 0, truncated: false };
                    const all = [];
                    for (const [kw, positions] of found) {
                        const set = refs.get(kw);
                        if (!set || !set.size) continue;
                        all.push({ keyword: kw, refs: Array.from(set), positions });
                    }
                    // 长词优先：越长的关键词越具体，短词往往是被长词包含的通用片段。
                    all.sort((a, b) => (b.keyword.length - a.keyword.length) || (b.refs.length - a.refs.length));
                    const truncated = all.length > maxHits;
                    return { hits: truncated ? all.slice(0, maxHits) : all, total: all.length, truncated };
                } catch (_e) {
                    return { hits: [], total: 0, truncated: false };
                }
            },

            /** 把扫描结果压成「注入用的候选引用」——去重后的引用列表（不含关键词）。 */
            refsFor(text) {
                const r = this.scan(text);
                const set = new Set();
                for (const h of r.hits) for (const ref of h.refs) set.add(ref);
                return Array.from(set);
            },

            /** 体检：词表规模 / 指纹 / 拒收数。 */
            stats() {
                ensure();
                return {
                    version: CROSSLINK_VERSION,
                    keywords: refs.size,
                    fingerprint,
                    minLength: minLen,
                    maxHits,
                    rejected,
                    stopwords: stop.size,
                };
            },

            /** 一句话读数（诊断面用）。 */
            line() {
                const s = this.stats();
                let txt = `关联词表 ${s.keywords} 词（指纹 ${s.fingerprint}）`;
                if (s.stopwords) txt += ` · 停用 ${s.stopwords}`;
                if (s.rejected) txt += ` · 拒收 ${s.rejected}`;
                return txt;
            },
        };
    }

    const api = {
        CROSSLINK_VERSION,
        MIN_KEYWORD_LEN,
        DEFAULT_MAX_HITS,
        toChars,
        buildAutomaton,
        scanText,
        fingerprintOf,
        createIndex,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : root;
    try { g.LonShaCrosslink = Object.freeze(api); } catch (e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);