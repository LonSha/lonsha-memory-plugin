/* ========================================================
 * knowledge-network.js — [v3.219.0] 知情网络（「同一件事」的判定与解除）
 *
 * 【为什么需要这一面 / 修前实测后果（逐字重放真源码得到的读数）】
 *   WorldProgress 的认知隔离（Cognitive Horizon）记「某角色还不知道什么」：
 *       markUnaware(char, fact)    登记
 *       revealKnowledge(char, fact) 解除
 *   两者修前都用 **`Array.includes` / `!==` 逐字比较**。而 fact 是 AI 每轮
 *   重新生成的自然语言，措辞**必然逐轮不同**。实测（把真源码抽出来重放）：
 *       markUnaware('帕秋莉','地下室魔法水晶被神秘黑影盗走')
 *       markUnaware('帕秋莉','魔法水晶被盗')
 *       markUnaware('帕秋莉','帕秋莉的水晶被偷了')
 *     ⇒ unaware 堆积 **3 条**（同一件事记了三遍）；
 *       revealKnowledge('帕秋莉','博丽灵梦告知了水晶被盗的事')
 *     ⇒ unaware 仍是 **3 条**，一条都没清掉。
 *   两个后果都是致命的：
 *     · 堆积：`getReEntryNotice` 只取前 3 条，真实新增的认知边界**永远挤不进去**
 *       （前 3 格被同一件事的旧措辞占死）——机制表面在工作，实际已失效；
 *     · 清不掉：**认知隔离永不解除**。角色已经被明确告知了，系统还在每轮注入
 *       「切勿未卜先知、不可主动提起其不知情的事实」——把「已经知道的事」
 *       当成「绝不能说的事」，逼模型演一个不存在的信息差。
 *   这正是本仓反复点名的塌陷形态：**「同一件事的另一种说法」被读成「另一件事」**。
 *
 * 【为什么判定要保守（宁可留冗余，不可误删）】
 *   两个方向的错代价**不对等**：
 *     · 误判为「不同」（漏合并）⇒ 提示区多几条冗余，模型最多啰嗦，**数据不丢**；
 *     · 误判为「相同」（错合并）⇒ 一条真实的信息边界被静默抹掉，
 *       角色会**提前知道他不该知道的事**，而这件事在读数上完全看不见。
 *   故本模块只在高置信时才判「同一件事」，判不开一律判「不同」（fail-closed 到保守边）。
 *   阈值与规则全部是确定性的（无随机、无模型调用），可被逐条复算。
 *
 * 【同一性的三级判据（逐级放宽，每级都必须过各自的长度门）】
 *   ① 归一后逐字相同；
 *   ② 互为子串，且**较短一侧长度 ≥ MIN_SUBSTR**（4 字）——
 *      拦掉「受伤」⊂「左手受伤缠着绷带」这类过短片段误判；
 *   ③ 二元组（bigram）重合率 ≥ SAME_RATIO（0.75），且**较短一侧长度 ≥ MIN_BIGRAM**（6 字）——
 *      应对「加一个『的』」「换个同义词」这类最常见的措辞漂移。
 *   三级都不中 ⇒ 判「不同」。SAME_RATIO 取 0.75 而非更低：实测「加一个『的』」
 *   的重合率在 0.85 以上，而「同一角色的两件不同事」（如「水晶被盗」vs「被下药昏睡」）
 *   重合率低于 0.4 —— 中间留了足够宽的分离带。
 *
 * 【第四档：「疑似」——判不开的那些必须**可见**（本版新增）】
 *   纯字符串判据治不了**告知式措辞**：实测的揭示句「博丽灵梦告知了水晶被盗的事」
 *   与登记句「地下室魔法水晶被神秘黑影盗走」只共享「水晶被」这一个 3 字片段，
 *   重合率 0.17 —— 任何不冒误合并风险的阈值都判不出「同一件事」。
 *   修前这件事**完全不可见**：读数上「没有同事实」与「有同事实但判不出」同形，
 *   于是「认知隔离永不解除」看起来像「本来就没有要解除的」。
 *   故加一档 **near（疑似）**：短侧长度达标且**公共二元组 ≥ NEAR_HITS（2）** 时
 *   判为「疑似同一件事」——**不合并、不改数据、只报读数**，并带出候选原文，
 *   由调用方在注入面如实说明「有 N 条疑似同一件事未合并（措辞不同）」。
 *   这既不给「提前知道」开门（一个字节都不动），又让「清不掉」有了出口：
 *   看到候选原文后可用**登记原措辞**揭示，或据此修正提示词的措辞纪律。
 *   NEAR_HITS 取 2 而非 1：两条无关中文短句共享 2 个连续二字片段的概率极低，
 *   而实测的告知式措辞恰好命中 2（「水晶」「晶被」）—— 分离带落在实测用例上。
 *
 * 【三条纪律（与 relation-mutual.js / relation-disclosure.js 同规格）】
 *   ① 只读判定：不写库（写库仍由 index.js 的 WorldProgress 负责），只回答「是不是同一件事」；
 *   ② 不抛：输入畸形一律降级为读数（malformed 计数），绝不外抛；
 *   ③ 不猜：判不开一律判「不同」，不给冒充值。
 *
 * 【可移植性说明】
 *   机制动机来自「自然语言事实无法逐字比较」这一通用失效形态；实现按本仓规范重写
 *   （零依赖、不抛、判据保守且可复算、读数齐备），未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';
    const KN_VERSION = 1;
    const KN_KIND = 'knowledge_network';
    /** 子串判据的最短长度（低于此长度不参与子串判定：短片段包含关系几乎全是巧合） */
    const MIN_SUBSTR = 4;
    /** 二元组判据的最短长度与重合率门槛 */
    const MIN_BIGRAM = 6;
    const SAME_RATIO = 0.75;
    /** 疑似档：公共二元组个数下限（**只报候选，绝不据此合并**） */
    const NEAR_HITS = 2;
    /** 疑似候选最多带回几条（有界，防长列表灌爆读数与提示） */
    const NEAR_MAX = 3;

    /**
     * 事实文本归一：去空白 + 全角标点折半角 + 去标点 + 小写。
     *   标点与空白是最常见的无意义差异（「水晶被盗」vs「水晶被盗。」），
     *   归一时抹掉它们不会造成误合并（内容字一个不动）。
     */
    function normalizeFact(value) {
        let s = String(value == null ? '' : value);
        s = s.replace(/[\u3000\s]+/g, '');
        // 全角标点 → 半角（只折标点，不折内容字）
        s = s.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
        s = s.replace(/[\u3001\u3002\u300c\u300d\u300e\u300f\u2018\u2019\u201c\u201d\u2026\u2014\uff0c\uff1b\uff1a\uff1f\uff01]/g, '');
        s = s.replace(/[!-/:-@\[-`{-~]/g, '');
        return s.toLowerCase();
    }

    /** 二元组集合（长度不足 2 时返回单元素集合，保证非空） */
    function bigrams(s) {
        const out = new Set();
        if (s.length < 2) { if (s) out.add(s); return out; }
        for (let i = 0; i + 2 <= s.length; i++) out.add(s.slice(i, i + 2));
        return out;
    }

    /**
     * 两条事实的相似读数（纯函数、不抛）：公共二元组个数 / 短侧重合率 / 短侧长度。
     * 三个数**分开报**：「命中 2 个二元组但重合率 0.17」（长句告知式）与
     *   「命中 2 个二元组且重合率 0.9」（加了个『的』）处置不同 ——
     *   压成一个「相似度」数字会让读者无法判断该不该合并。
     * @returns {{hits:number, ratio:number, short:number, same:boolean, near:boolean}}
     */
    function similarity(a, b) {
        const x = normalizeFact(a), y = normalizeFact(b);
        const out = { hits: 0, ratio: 0, short: 0, same: false, near: false };
        if (!x || !y) return out;
        const short = x.length <= y.length ? x : y;
        const long = x.length <= y.length ? y : x;
        out.short = short.length;
        const bs = bigrams(short), bl = bigrams(long);
        let hit = 0;
        for (const g of bs) if (bl.has(g)) hit++;
        out.hits = hit;
        out.ratio = bs.size > 0 ? (hit / bs.size) : 0;
        if (x === y) { out.same = true; out.near = true; out.ratio = 1; return out; }   // ① 归一后逐字相同
        if (short.length >= MIN_SUBSTR && long.includes(short)) { out.same = true; out.near = true; return out; }  // ② 互为子串
        if (short.length >= MIN_BIGRAM && out.ratio >= SAME_RATIO) { out.same = true; out.near = true; return out; }  // ③ 二元组重合率
        if (short.length >= MIN_BIGRAM && hit >= NEAR_HITS) out.near = true;            // ④ 疑似（只报候选）
        return out;
    }

    /**
     * 两个事实是不是「同一件事」（纯函数、不抛、确定性）。
     * 判据保守：判不开一律 false（见文件头「为什么判定要保守」）。
     */
    function sameFact(a, b) {
        return similarity(a, b).same;
    }

    /** 在一串事实里找出与 target 同事实的那条（返回下标，找不到 -1） */
    function indexOfSame(list, target) {
        if (!Array.isArray(list)) return -1;
        for (let i = 0; i < list.length; i++) if (sameFact(list[i], target)) return i;
        return -1;
    }

    /**
     * 在一串事实里找出与 target **疑似**同一件事的那些（**不合并，只报候选**）。
     * 只收 near 且**非** same 的：same 由 indexOfSame 负责，两档不得重叠
     *   （重叠会让「判过了」与「判不开」同时出现，读数自相矛盾）。
     * @returns {Array<{index:number,text:string,hits:number,ratio:number}>}（有界 NEAR_MAX）
     */
    function nearList(list, target) {
        const out = [];
        if (!Array.isArray(list)) return out;
        for (let i = 0; i < list.length; i++) {
            const s = similarity(list[i], target);
            if (s.near && !s.same) out.push({ index: i, text: String(list[i]), hits: s.hits, ratio: Number(s.ratio.toFixed(3)) });
            if (out.length >= NEAR_MAX) break;
        }
        return out;
    }

    /**
     * 认知边界的对账（纯函数、不抛）。
     *
     * @param {object} rec       该角色当前记录 { known:[], unaware:[] }
     * @param {string} fact      本轮这条事实
     * @param {string} action    'unaware' | 'reveal' | 'known'
     * @returns {object} 结构恒定读数：
     *   same      —— 同一件事的已有条目（**下标与来源**，判不开时为 null）
     *   dup       —— 是否「同一件事已登记过」（true 时调用方不该再 push）
     *   already   —— 该条目是否已在目标侧（幂等：已经知道的不重复解除）
     *   verdict   —— 判定结论（供诊断复算）：'same' | 'new' | 'idempotent'
     */
    function reconcile(rec, fact, action) {
        const out = {
            kind: KN_KIND, verdict: 'new', dup: false, already: false,
            same: null, nearList: [], suspect: false, matched: null, degraded: false
        };
        try {
            const r = (rec && typeof rec === 'object') ? rec : {};
            const known = Array.isArray(r.known) ? r.known : [];
            const unaware = Array.isArray(r.unaware) ? r.unaware : [];
            const f = String(fact == null ? '' : fact);
            if (!f.trim()) { out.verdict = 'idempotent'; out.degraded = true; return out; }
            const iu = indexOfSame(unaware, f);
            const ik = indexOfSame(known, f);
            if (action === 'reveal' || action === 'known') {
                /* 解除：两个动作**互相独立**，不是二选一 ——
                 *   ① 同事实若在 unaware 里 ⇒ 该清掉它（用**下标**删，不用值删：值不等于措辞）；
                 *   ② 同事实若已在 known 里 ⇒ 不必重复登记（幂等）。
                 *   两者可**同时成立**：措辞漂移下「既已登记已知、又留着一条同事实的未知」
                 *   是修前就能产生的状态。写成二选一（命中 known 就 return）会把①漏掉，
                 *   那一格上的认知隔离**永不解除** —— 正是本模块要治的病，不能在模块内部复现。 */
                if (iu >= 0) {
                    out.verdict = 'same';
                    out.same = { side: 'unaware', index: iu, text: unaware[iu] };
                    out.matched = unaware[iu];
                }
                if (ik >= 0) out.already = true;
                if (iu < 0 && ik < 0) {
                    const nl = nearList(unaware, f);
                    out.nearList = nl;
                    out.suspect = nl.length > 0;
                    out.verdict = out.suspect ? 'near' : 'new';
                }
                return out;
            }
            // 登记：已知里有同事实 ⇒ 不必登记为「不知道」
            //   （**这是最重要的一条**：修前「已经知道」与「不知道」可以同时存在，
            //     提示区会同时给出「不可主动提起」与正文里的已知内容，两条相反指令并存）
            if (ik >= 0) {
                out.verdict = 'idempotent'; out.already = true;
                out.same = { side: 'known', index: ik, text: known[ik] };
                out.matched = known[ik];
                return out;
            }
            if (iu >= 0) {
                out.verdict = 'same'; out.dup = true;
                out.same = { side: 'unaware', index: iu, text: unaware[iu] };
                out.matched = unaware[iu];
                return out;
            }
            const nl2 = nearList(unaware, f);
            out.nearList = nl2;
            out.suspect = nl2.length > 0;
            out.verdict = out.suspect ? 'near' : 'new';
            return out;
        } catch (_e) {
            return Object.assign({}, out, { degraded: true });
        }
    }

    /**
     * 读数一句话（供诊断/自检行）。
     * 四态必须分开说：「新增」「同事实已登记」「同事实已解除」处置不同；
     *   而**疑似（suspect）必须单独报** —— 它是本模块唯一说不出结论的那一档，
     *   把它并进任何一格都会让读者以为「判过了」。全零读数也不能被读成「机制正常」：
     *   merged 与 released 长期为 0 意味着判据从未命中（阈值过严或措辞从未漂移），
     *   这在读数上与「没有可合并的」同形，故由调用方累计后自行判断（这里如实报计数）。
     */
    function line(read) {
        const r = read || {};
        if (r.moduleMissing) return '模块未加载（knowledge-network.js）';
        if (r.degraded) return '对账异常（已降级，不外抛）';
        const parts = ['登记 ' + (r.marked || 0), '同事实已登记 ' + (r.merged || 0), '解除 ' + (r.released || 0)];
        if (r.suspect) parts.push('**疑似未合并 ' + r.suspect + '**');
        if (r.alreadyKnown) parts.push('已知不再登记 ' + r.alreadyKnown);
        if (r.malformed) parts.push('畸形 ' + r.malformed);
        if (r.owners) parts.push('涉及角色 ' + r.owners);
        return parts.join(' · ');
    }

    const api = {
        KN_VERSION: KN_VERSION,
        KN_KIND: KN_KIND,
        MIN_SUBSTR: MIN_SUBSTR,
        MIN_BIGRAM: MIN_BIGRAM,
        SAME_RATIO: SAME_RATIO,
        NEAR_HITS: NEAR_HITS,
        NEAR_MAX: NEAR_MAX,
        normalizeFact: normalizeFact,
        bigrams: bigrams,
        similarity: similarity,
        sameFact: sameFact,
        indexOfSame: indexOfSame,
        nearList: nearList,
        reconcile: reconcile,
        line: line
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaKnowledgeNetwork = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);