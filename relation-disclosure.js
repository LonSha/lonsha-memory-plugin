/* ========================================================
 * relation-disclosure.js — [v3.184.0] 关系披露条件（按当前情境决定哪条关系进注入）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本插件的图谱关系边（MemoryGraph 的 addEdge，label=关系词、data.attitude=主观态度）
 *   一旦被写入，就**永久无条件**参与注入：buildInjection 的 [角色关系] 块把召回到的
 *   每条关系原样列给模型，不看当前剧情走到哪里。长线对话的后果是：
 *     · 关系边只增不减（时态边只把「已失效」标 active=false，并未移出注入面）；
 *     · 每轮注入固定带上若干条**当期毫无用处**的关系（例如「某人暗恋某人」在
 *       两条线各走各的二十楼里仍然每轮出现），挤占 token 且稀释真正相关的行；
 *     · 模型看到的是「关系清单」而不是「此刻可用的关系」，容易按清单硬扯剧情。
 *
 *   nocturne_memory 的解决方式：关系边上有 disclosure 字段（人类可读的触发条件，
 *   README：「当用户提到项目 X 时」），注入时按当前情境判断是否披露
 *   ——「AI 按当前情境精准注入，而非盲盒抽取」。
 *
 *   本模块取其**机制**，按 LonSha 规范重写：
 *     · 条件是**运行时文本匹配**，不是世界书键位。本仓库不走 ST 世界书
 *       （loadWorldInfo / saveWorldInfo / worldInfo 全库零命中），
 *       故触发条件只能由本模块自己判定，无法挂在世界书条目上。
 *     · 语法：条件串按换行 / 逗号 / 分号 / 顿号切开，每段是一个 JS 正则（i 标志）。
 *       前缀 ! 表示**排除项**（负条件）。
 *       判定序（确定性，不依赖处理顺序）：
 *         ① 有正条件时：任一正条件命中 → 候选命中；再看排除项，任一排除项命中 → 不命中；
 *         ② 只有负条件时：任一负条件命中 → 不命中，否则命中；
 *         ③ 无任何条件（空串 / 只有分隔符）→ 无条件，恒命中。
 *     · **有病句就放行**（fail-open）：条件串写了但一个正则都编译不出来时，
 *       标记 state='invalid' 并**照常注入**。理由：丢一条关系是静默的数据损失，
 *       代价不对等；而「作者写了病句」必须在诊断面被**看见**（invalidPattern 计数），
 *       不能靠丢数据来「显得干净」。
 *     · **没有上下文就放行**：ctxText 为空时无法判定「未触发」，
 *       一律放行并回报 ctxEmpty —— 让宿主能区分「真的没有需要跳过的」与
 *       「筛选根本没跑」（I6：读失败 ≠ 读到了 0）。若这里静默返回全部跳过，
 *       一个恒空的 ctxText 缺陷会表现为「功能正常、就是没跳过什么」。
 *     · 不抛：本模块跑在注入路径上（生成前），抛一次会连坐整轮注入。
 *
 * 【与既有三个模块的分工（互不重叠）】
 *   crosslink.js            记「两个条目文本上共享同一个词」——条目间弱关系候选
 *   summary-provenance.js   答「这条摘要的来源现在还对不对」——事后验真
 *   branch-guard.js         答「现在这一轮该不该往这一楼写」——事前拦写
 *   本模块                  答「这条**已经确认过**的关系，此刻该不该给模型看」——注入侧收口
 *   本模块只做**筛选**：不改边、不删边、不写图。被跳过的关系仍在图里、仍在召回池里，
 *   下一轮情境对了就照常出现（转瞬的过滤，不是永久降级）。
 *
 * 【可移植性说明】
 *   机制出处：nocturne_memory（Dataojitori/nocturne_memory）节点边上的 disclosure 条件披露。
 *   实现按本仓规范重写（零依赖、不抛、fail-open、I6 读数），未复制其代码。
 */
(function (root) {
    'use strict';
    const DISCLOSURE_VERSION = 1;
    const DISCLOSURE_KIND = 'relation_disclosure';
    // 单条关系最多编译的条件数。注入路径上每条关系都要编译正则，作者若粘贴一整段
    //   提示词进 disclosure 字段（几百行），每轮生成的编译开销会线性膨胀。
    //   超限部分丢弃并计入 truncated（截断必须可见，否则「写了没生效」无从发现）。
    const MAX_PATTERNS = 6;
    // 条件串的分隔符：换行 / 逗号 / 分号 / 顿号，**半角与全角都收**。
    //   为什么全角也要收：中文输入法下打出的 `，` `；` 与 ASCII 的 `,` `;` 是两个码位，
    //   只收半角会把 `!甲；乙` 当成**一个**条件 `甲；乙`（正条件里混进分号），
    //   于是「排除项」与「并列条件」双双错位——而它看起来完全正常，不报错也不留痕。
    //   不用空格切分——正则里空格是合法字符（"项目 X" 这类条件必须保留空格）。
    const SPLIT_RE = /\r?\n|[,，;；、]/;

    function normStr(v) {
        return String(v == null ? '' : v);
    }

    /**
     * 拆条件串（纯函数、不抛）。
     * @returns {{positive:string[], negative:string[], truncated:boolean}}
     */
    function parseDisclosure(raw) {
        const out = { positive: [], negative: [], truncated: false };
        try {
            const all = normStr(raw).split(SPLIT_RE).map(function (s) { return s.trim(); }).filter(Boolean);
            if (all.length > MAX_PATTERNS) out.truncated = true;
            for (const c of all.slice(0, MAX_PATTERNS)) {
                if (c.charAt(0) === '!') {
                    const body = c.slice(1).trim();
                    if (body) out.negative.push(body);
                } else {
                    out.positive.push(c);
                }
            }
        } catch (_e) { /* 拆分是纯字符串操作，失败即视为无条件 */ }
        return out;
    }

    /**
     * 编译条件串，合法与非法分列（非法**不静默**：调用方必须计入读数）。
     * @returns {{ok:RegExp[], invalid:string[]}}
     */
    function compileConditions(list) {
        const ok = [], invalid = [];
        const arr = Array.isArray(list) ? list : [];
        for (const p of arr) {
            try { ok.push(new RegExp(p, 'i')); }
            catch (_e) { invalid.push(p); }
        }
        return { ok: ok, invalid: invalid };
    }

    /**
     * 判定单条关系的披露条件是否被当前上下文触发（纯函数、不抛）。
     * @param {string} raw      disclosure 条件串（空 = 无条件）
     * @param {string} ctxText  当前情境文本（本轮对话正文）
     * @returns {{state:'always'|'match'|'miss'|'invalid', hit:string, invalid:string[],
     *            truncated:boolean, ctxEmpty?:boolean}}
     *   state 四态：always=无条件下注入 / match=条件命中 / miss=条件未命中（唯一会被跳过的一态）
     *               / invalid=条件写了但全非法（**仍注入**，读数里看得见）
     */
    function testDisclosure(raw, ctxText) {
        const res = { state: 'always', hit: '', invalid: [], truncated: false };
        try {
            const cond = parseDisclosure(raw);
            res.truncated = cond.truncated;
            const posC = compileConditions(cond.positive);
            const negC = compileConditions(cond.negative);
            res.invalid = posC.invalid.concat(negC.invalid);
            const hasRaw = (cond.positive.length + cond.negative.length) > 0;
            if (!hasRaw) return res;                       // 无条件：恒命中
            // 有病句：一个合法条件都没有 ⇒ 放行（见文件头「有病句就放行」）
            if (!posC.ok.length && !negC.ok.length) { res.state = 'invalid'; return res; }
            const text = normStr(ctxText);
            if (!text) {                                   // 没有上下文 ⇒ 放行 + 标记未真筛
                res.state = 'match';
                res.ctxEmpty = true;
                return res;
            }
            const hitOf = function (list) {
                for (const re of list) { if (re.test(text)) return re.source; }
                return '';
            };
            if (posC.ok.length) {
                const h = hitOf(posC.ok);
                if (!h) { res.state = 'miss'; return res; }
                if (hitOf(negC.ok)) { res.state = 'miss'; return res; }   // 命中正条件但被排除项否决
                res.state = 'match';
                res.hit = h;
                return res;
            }
            // 只有负条件：除非某个排除项命中，否则命中
            if (hitOf(negC.ok)) { res.state = 'miss'; return res; }
            res.state = 'match';
            return res;
        } catch (e) {
            res.state = 'invalid';                         // 判定自身出错也放行，但如实记因
            res.err = String((e && e.message) || e);
            return res;
        }
    }

    /**
     * 分区：把关系边分成「进注入」与「按披露条件跳过」两堆（纯函数、不抛）。
     * @param {Array} edges   关系边（含 data.disclosure）
     * @param {string} ctxText 当前情境文本
     * @param {{enabled?:boolean}} opts
     * @returns {{kept:Array, gated:Array, counts:object, ctxEmpty:boolean, enabled:boolean}}
     */
    function partition(edges, ctxText, opts) {
        const o = opts || {};
        const list = Array.isArray(edges) ? edges : [];
        const enabled = o.enabled !== false;
        const out = {
            kept: [], gated: [], ctxEmpty: false, enabled: enabled,
            counts: { total: list.length, always: 0, match: 0, miss: 0, invalid: 0, invalidPattern: 0, truncated: 0, gated: 0 },
        };
        if (!enabled) {
            out.kept = list.slice();                       // 关闭开关 = 全部照常注入（零行为变化）
            return out;
        }
        for (const e of list) {
            const raw = normStr(e && e.data && e.data.disclosure).trim();
            if (!raw) { out.counts.always++; out.kept.push(e); continue; }
            const r = testDisclosure(raw, ctxText);
            if (r.invalid && r.invalid.length) out.counts.invalidPattern += r.invalid.length;
            if (r.truncated) out.counts.truncated++;
            if (r.ctxEmpty) out.ctxEmpty = true;
            if (r.state === 'miss') { out.counts.miss++; out.gated.push(e); continue; }
            if (r.state === 'invalid') { out.counts.invalid++; out.kept.push(e); continue; }
            out.counts[r.state] = (out.counts[r.state] || 0) + 1;
            out.kept.push(e);
        }
        out.counts.gated = out.gated.length;
        return out;
    }

    /**
     * 诊断面读数（纯函数、不抛）。宿主传本轮读数的快照。
     * 四态齐报的理由：「无条件 20 条」与「条件全命中 20 条」在只看注入条数时同形，
     *   前者说明谁都没写 disclosure（功能空转），后者说明筛选真在工作。
     */
    function line(read) {
        const r = read || {};
        if (r.moduleMissing) return '模块未加载（relation-disclosure.js）';
        if (r.enabled === false) return '已关闭（关系全部照常注入）';
        const c = r.counts || {};
        if (!c.total) return '本轮无关系边';
        const parts = ['本轮 ' + c.total + ' 条关系', '无条件 ' + (c.always || 0), '条件命中 ' + (c.match || 0), '跳过 ' + (c.miss || 0)];
        if (c.invalid) parts.push('条件非法放行 ' + c.invalid);
        if (c.invalidPattern) parts.push('非法模式 ' + c.invalidPattern);
        if (c.truncated) parts.push('条件超限截断 ' + c.truncated);
        if (r.ctxEmpty) parts.push('上下文为空·未真筛');
        return parts.join(' · ');
    }

    const api = {
        DISCLOSURE_VERSION: DISCLOSURE_VERSION,
        DISCLOSURE_KIND: DISCLOSURE_KIND,
        MAX_PATTERNS: MAX_PATTERNS,
        parseDisclosure: parseDisclosure,
        compileConditions: compileConditions,
        testDisclosure: testDisclosure,
        partition: partition,
        line: line,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaRelationDisclosure = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
