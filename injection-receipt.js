/* ================================================================
 * injection-receipt.js — [v3.298.0 · M-O3] 预算/裁剪/注入回执的**单一真源派生面**
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   v3.251.0（M-O3 第 ① 轮）把「谁被留下」从文本反推换成裁剪回执（trace），
 *   v3.274.0（O4）把三处消费点（生产聚合数 / 预测 / 面板）统一改为消费同一回执。
 *   但**量纲**这一面仍然是三处各算一遍，且缺两类量：
 *     · `_lastBudgetStats.candidateChars` 自己 `_allB.reduce(长度)`；
 *       cost-ledger 自己累 `tagged` 的字符；cost-forecast 自己累 resident+trigger
 *       —— 同一事实三份实现（本仓点名的头号缺陷形态），任一处漏了空块/分隔符口径就漂移；
 *     · 「裁剪减少的字符」（裁剪前全文 − 载荷，**含**首尾说明与分隔符）与
 *       「被丢块的字符之和」（**不含**封装）在修前被混着叫 `droppedChars` ——
 *       两者实测不等（三触发块场景：124 vs 122，差的是块间分隔符），拿去对账必然假 drift；
 *     · 「预算溢出字符」（载荷 − 预算）只在 `_lastBudgetStats` 有一格，
 *       cost-ledger / cost-forecast 里没有，于是「常驻超预算时载荷超了多少」在预测侧无处可读；
 *     · 判据不可用时（回执缺席 / 内联回落 / 规模不符），**没有任何一格回答**
 *       「这批候选里有多少字符是不可归因的」—— 修前的做法是整组退回 `includes` 反推，
 *       而反推在未裁剪场景恰好偏向「全部留下」，正是要断的谎报形态。
 *
 * 【本模块做什么】
 *   在**同一条 trace** 上派生，一次算清、三处读：
 *     ① `quantities`：**六类量**分列，各自口径写死（见下），互不冒充、互不折算；
 *     ② `identity`：判据来源四态（`no-trim` / `trace` / `trace-span` / `unknown`）
 *        + 自洽核对（三态互斥穷尽 + 字符账），可测性**如实自述**；
 *     ③ `unknown`：不可归因的清单（哪一格是 null、为什么），机器可判、人可读；
 *     ④ `resident`：常驻块超量时的**原因与选择**显式报告（不偷偷裁关键事实，也不静默）；
 *     ⑤ `capacity`：容量口径（预算 / 首尾说明 / 块间分隔符 / token 口径）逐项披露。
 *
 * 【六类量的口径（写死在这里，别处不得再解释一遍）】
 *   candidateChars       Σ 候选块文本长度（**不含**首尾说明与分隔符；空块计 0）
 *   payloadChars         最终注入文本长度（**含**首尾说明与分隔符，即 AI 真见的那串）
 *   droppedBlockChars    Σ 整块被丢的块文本长度（**不含**封装；被切半不计入）
 *   trimReductionChars   裁剪前全文长度 − 载荷长度（**含**封装与分隔符）
 *   budgetOverflowChars  载荷长度 − 预算（≥0；软预算下常驻保护时可 >0）
 *   unknownChars         Σ 判据不可测的块的文本长度（可测且无未知块 ⇒ 0）
 *
 *   ★ `droppedBlockChars` 与 `trimReductionChars` **不相等也不该相等**：
 *     后者多算了首尾说明、块间分隔符与「被切半的块入载荷的那部分」。
 *     修前把两者当同一个 `droppedChars` 用，是本模块要治的那类错。
 *
 * 【纪律（与 cost-ledger / cost-forecast 同规格）】
 *   · **不可测就写不可测**：判据不可用时块级量记 `null` + 来源，
 *     **绝不退回 `includes` 反推**（反推在未裁剪场景偏向「全部留下」）；
 *   · **零 ≠ 未知**：`unknownChars` 可测时是真 0（测了，一块都没漏），不可测时是**全部候选字符**；
 *   · 纯函数、不抛：任何畸形入参退化为可读的降级读数。
 * ================================================================ */
(function (global) {
    'use strict';

    const RECEIPT_VERSION = 1;

    const _str = (v) => String(v == null ? '' : v);
    const _len = (v) => _str(v).length;
    /* ★ 本函数踩过坑（v3.298.0 实测首轮 8 红里的 2 红）：`Number(null) === 0`、
     *   `Number('') === 0` —— 直接 `Number(v)` 会把「未提供」静默读成 0，于是
     *   「载荷未知」被当成「载荷 0 字符」，连带把判据判成 `no-trim`（谎报整批都在）。
     *   这正是本模块要断的那类错，故 null / undefined / '' 一律先挡掉再转数。 */
    const _numOrNull = (v) => {
        if (v === null || v === undefined || v === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    };

    /** 判据来源四态（与 index.js 的 keptFrom / cost-ledger 的 identity.keptFrom 同口径）。 */
    const FROM = Object.freeze(['no-trim', 'trace', 'trace-span', 'unknown']);

    /**
     * 回执可用性两问（缺一不可）：
     *   ① 规模自证 —— 本批块数必须等于回执描述的批（防「拿别批的回执判本批」）。
     *      两种等价形式都收：宿主填的 `blockCount`（index.js / cost-ledger 口径）
     *      与路由模块填的 `residentKept + triggerTotal`（cost-forecast 口径，因为它
     *      调路由时**拿不到宿主填的字段**）。★ 修前两处各认一种，于是同一份回执
     *      在一处「可用」、在另一处「不可用」——本函数把两者收成一条判据。
     *   ② 来源必须是**路由模块**：内联回落时裁剪真发生了但没有块级清单
     *      （`keptIdxInAll` 为 null），拿它判「谁留下」就是拿一份不存在的清单判。
     *
     * ★ **不得要求 `version`**：那是宿主（index.js 的回执草稿）填的字段，路由模块
     *   本身不填。cost-forecast 的第一版就是这么写的 —— 要求回执带 `version` / `blockCount`，
     *   结果**每一次**精确回执都被判成「未派发」而整组记 null（假不可测，
     *   与「把不可测写成数字」是同一族错，只是方向相反）。本函数按同一教训写：
     *   只要「来源是路由 + 规模自证」两条成立，回执即可用。
     * @returns {{ok:boolean, why:string, scaleFrom:string}}
     */
    function traceUsable(trace, blockCount) {
        const tr = (trace && typeof trace === 'object') ? trace : null;
        const n = Number(blockCount);
        if (!tr) return { ok: false, why: 'no-trace', scaleFrom: '' };
        if (!Number.isFinite(n)) return { ok: false, why: 'no-block-count', scaleFrom: '' };
        const byCount = (Number(tr.blockCount) === n);
        const parts = _numOrNull(tr.residentKept), tparts = _numOrNull(tr.triggerTotal);
        const byParts = (parts !== null && tparts !== null && (parts + tparts) === n);
        if (!byCount && !byParts) return { ok: false, why: 'scale-mismatch', scaleFrom: '' };
        if (tr.traceFrom !== 'router') return { ok: false, why: _str(tr.traceFrom || 'unknown'), scaleFrom: byCount ? 'blockCount' : 'residentKept+triggerTotal' };
        return { ok: true, why: '', scaleFrom: byCount ? 'blockCount' : 'residentKept+triggerTotal' };
    }

    /**
     * 逐块归因（**四态**，互斥且穷尽）。
     *
     * ★ 与 index.js `_injectionBlocksOf` / cost-ledger / cost-forecast 的关键差别：
     *   回执不可用时那三处退回 `injected.includes(块)` 反推（并在自述里标注），
     *   而本模块一律记 `unknown` —— 反推在未裁剪场景恰好把每条块都判成「留下了」，
     *   那正是 M-O3 要断的谎报形态。旧读数保留在那三处（不动既有键），
     *   本模块只提供**更严格**的那一份。
     *
     * @param opts { trace, blocks, preTrimChars, payloadChars }
     * @returns {{ usable, from, why, blocks:[{i,chars,state,via,keptChars}] }}
     */
    function classifyBlocks(opts) {
        const o = opts || {};
        const blocks = Array.isArray(o.blocks) ? o.blocks : [];
        const tr = (o.trace && typeof o.trace === 'object') ? o.trace : null;
        const u = traceUsable(tr, blocks.length);
        const preTrim = _numOrNull(o.preTrimChars);
        const pay = _numOrNull(o.payloadChars);
        /* 未裁剪（早退原样返回）是**真事实**，不是「不可测」：
         *   裁剪发生在 `full.length > budget` 时；未超预算时 trimToBudget 直接返回原文，
         *   连回执都不写（`traceFrom` 停在 undefined）。判据取「裁剪前后同长」，
         *   因为它同时排除了「模块缺席但确实裁过」那一路 —— 那一路 preTrim > payload。 */
        const notTrimmed = (preTrim !== null && pay !== null && preTrim === pay
            && !(tr && tr.trimmed === true));
        if (notTrimmed) {
            const out0 = [];
            for (let i = 0; i < blocks.length; i++) {
                const t = _str(blocks[i]);
                if (!t.length) { out0.push({ i, chars: 0, state: 'empty', via: 'empty', keptChars: 0 }); continue; }
                out0.push({ i, chars: t.length, state: 'kept', via: 'no-trim', keptChars: t.length });
            }
            return { usable: u, from: 'no-trim', why: '', blocks: out0, scaleFrom: u.scaleFrom };
        }

        const idxOk = u.ok && Array.isArray(tr.keptIdxInAll);
        const hardOk = u.ok && (tr.hardTruncated === true);
        const keptSet = idxOk ? new Set(tr.keptIdxInAll) : null;
        const sliceAt = hardOk ? _numOrNull(tr.sliceAt) : null;
        const spans = (hardOk && Array.isArray(tr.blockSpans)) ? tr.blockSpans : null;
        const from = idxOk ? 'trace' : (spans ? 'trace-span' : 'unknown');
        const why = idxOk ? '' : (spans ? '' : (!u.ok
            ? ('裁剪回执不可用（' + u.why + '）⇒ 块级归因不可测，不倒推')
            : '回执形态既不成立块级清单也不是硬截断 ⇒ 块级归因不可测，不倒推'));

        const out = [];
        for (let i = 0; i < blocks.length; i++) {
            const t = _str(blocks[i]);
            const chars = t.length;
            if (!chars) { out.push({ i, chars: 0, state: 'empty', via: 'empty', keptChars: 0 }); continue; }
            if (idxOk) {
                const k = keptSet.has(i);
                out.push({ i, chars, state: k ? 'kept' : 'dropped', via: 'trace', keptChars: k ? chars : 0 });
                continue;
            }
            if (spans) {
                const sp = Array.isArray(spans[i]) ? spans[i] : null;
                if (sp && sliceAt !== null) {
                    const kept = sp[1] <= sliceAt;
                    const partial = (sp[0] < sliceAt && sp[1] > sliceAt);
                    /* 半段块**入载荷的那部分**可精确算（切点 − 块起点）：
                     *   它让「载荷里的块字符」在有半段的场景下也可核算 —— 修前整组不可测。 */
                    const inPay = partial ? Math.max(0, Math.min(sp[1], sliceAt) - sp[0]) : (kept ? chars : 0);
                    out.push({ i, chars, state: partial ? 'partial' : (kept ? 'kept' : 'dropped'), via: 'trace-span', keptChars: inPay });
                    continue;
                }
                /* span 定位不到（互文互子串等）⇒ 该块不可判；**不退回 includes**。 */
                out.push({ i, chars, state: 'unknown', via: 'trace-truncated-nospan', keptChars: null });
                continue;
            }
            out.push({ i, chars, state: 'unknown', via: u.ok ? 'no-kept-idx' : ('no-trace:' + u.why), keptChars: null });
        }
        return { usable: u, from, why, blocks: out, scaleFrom: u.scaleFrom };
    }

    /**
     * 派生回执（**六类量的唯一实现**）。
     * @param opts {
     *   trace          裁剪回执（injection-router.trimToBudget 在判定地点派生）
     *   blocks         候选块全量（与 buildInjection 的 _allB 同源、同顺序）
     *   payloadText    最终注入文本（裁剪后，即 AI 真见的那串）
     *   preTrimChars   裁剪前字符数（缺省时回落 trace.preTrimChars）
     *   budget / tokenBudget / tokenSource / strategy
     *   residentIdx    常驻块在候选里的下标（**由调用方给**：常驻口径的真源在
     *                  index.js 的 RESIDENT_MARKERS，本模块不另立一套；缺失 ⇒ resident:null）
     *   frame          { headLen, tailLen, separatorLen } 容量口径的常量披露（可选，用于交叉核对）
     *   tokensOf / now
     * }
     * @returns {object} 结构恒定（不可测处一律 null + 原因，不用 0 冒充）
     */
    function deriveReceipt(opts) {
        const o = opts || {};
        const blocks = Array.isArray(o.blocks) ? o.blocks : [];
        const tr = (o.trace && typeof o.trace === 'object') ? o.trace : null;
        const payload = _str(o.payloadText);
        const hasPayload = (o.payloadText !== undefined && o.payloadText !== null);
        const preTrim = (_numOrNull(o.preTrimChars) !== null) ? _numOrNull(o.preTrimChars)
            : (tr ? _numOrNull(tr.preTrimChars) : null);
        const budget = _numOrNull(o.budget);
        const ts = Number.isFinite(o.now) ? o.now : Date.now();

        const cls = classifyBlocks({ trace: tr, blocks, preTrimChars: preTrim, payloadChars: hasPayload ? payload.length : null });
        const xs = cls.blocks;
        const from = cls.from;
        const known = (from !== 'unknown');

        /* ---------- 六类量 ---------- */
        const candChars = xs.reduce((a, x) => a + x.chars, 0);
        const payloadChars = hasPayload ? payload.length : null;
        const sumState = (s) => xs.reduce((a, x) => a + ((x.state === s) ? x.chars : 0), 0);
        const _droppedBlockChars = known ? sumState('dropped') : null;
        const _partialBlockChars = known ? sumState('partial') : null;
        const _keptBlockChars = known ? sumState('kept') : null;
        /* 半段入载荷部分：span 态可精确算；其余态无半段 ⇒ 0（可测时）；不可测 ⇒ null */
        const _partialKeptChars = known ? xs.reduce((a, x) => a + ((x.state === 'partial' && Number.isFinite(x.keptChars)) ? x.keptChars : 0), 0) : null;
        const trimReductionChars = (preTrim === null || payloadChars === null) ? null : Math.max(0, preTrim - payloadChars);
        const budgetOverflowChars = (budget === null || payloadChars === null) ? null : Math.max(0, payloadChars - budget);
        /* unknownChars：**不可归因的字符量**。可测且无未知块 ⇒ 真 0；整批不可测 ⇒ 全部候选字符。
         *   修前没有任何一格回答这个问题（只能从「保留数是不是 null」间接猜）。 */
        const unknownChars = xs.reduce((a, x) => a + ((x.state === 'unknown') ? x.chars : 0), 0);

        const quantities = {
            candidateChars: candChars,
            payloadChars: payloadChars,
            droppedBlockChars: _droppedBlockChars,
            trimReductionChars: trimReductionChars,
            budgetOverflowChars: budgetOverflowChars,
            unknownChars: unknownChars,
        };
        const quantitiesWhy = {
            candidateChars: '',
            payloadChars: hasPayload ? '' : '未提供最终注入文本 ⇒ 载荷字符不可测（不写 0：0 是「拼出来是空的」）',
            droppedBlockChars: known ? (unknownChars > 0 ? '本批另有 ' + unknownChars + ' 字符不可归因（见 unknownChars）⇒ 此数只覆盖**已归因**的被丢块' : '') : ('块级归因不可测（' + from + '）⇒ 不写 0、不按总数减保留数倒推'),
            trimReductionChars: (preTrim === null) ? '裁剪前长度未知（回执与入参都没有）⇒ 不可测'
                : ((payloadChars === null) ? '载荷字符不可测 ⇒ 差量不可测' : ''),
            budgetOverflowChars: (budget === null) ? '预算未知 ⇒ 溢出量不可测' : ((payloadChars === null) ? '载荷字符不可测 ⇒ 溢出量不可测' : ''),
            unknownChars: unknownChars > 0 ? '本批有 ' + xs.filter((x) => x.state === 'unknown').length + ' 块不可归因（来源 ' + from + '）' : '判据可用且逐块已归因（这是**测到的 0**，不是「没测」）',
        };

        /* ---------- 可核算的派生量（供对账；不冒充六类量） ---------- */
        const _frameChars = (known && payloadChars !== null && _keptBlockChars !== null && _partialKeptChars !== null)
            ? Math.max(0, payloadChars - _keptBlockChars - _partialKeptChars) : null;
        const derived = {
            keptBlockChars: _keptBlockChars,
            partialBlockChars: _partialBlockChars,
            partialKeptChars: _partialKeptChars,
            emptyBlocks: xs.filter((x) => x.state === 'empty').length,
            countedBlocks: xs.filter((x) => x.state !== 'empty').length,
            /* 载荷里的非块字符：首尾说明 + 块间分隔符。**这就是修前缺的那一格** ——
             *   有了它，「被丢块字符 122」与「裁剪减少 124」的差（两个分隔符）当场可解释。 */
            frameChars: _frameChars,
            frameNote: (_frameChars === null) ? '块级归因不全 ⇒ 载荷内非块字符不可核算' : '',
        };

        /* ---------- identity：判据来源与自洽核对 ---------- */
        const viaCount = {};
        for (const x of xs) viaCount[x.via] = (viaCount[x.via] || 0) + 1;
        const keptN = xs.filter((x) => x.state === 'kept').length;
        const droppedN = xs.filter((x) => x.state === 'dropped').length;
        const partialN = xs.filter((x) => x.state === 'partial').length;
        const unknownN = xs.filter((x) => x.state === 'unknown').length;
        const emptyN = xs.filter((x) => x.state === 'empty').length;
        const identity = {
            from: from,
            why: cls.why,
            scaleFrom: cls.scaleFrom || '',
            blocks: xs.length,
            emptyBlocks: emptyN,
            countedBlocks: derived.countedBlocks,
            keptBlocks: known ? keptN : null,
            droppedBlocks: known ? droppedN : null,
            partialBlocks: known ? partialN : null,
            unknownBlocks: unknownN,
            viaCounts: viaCount,
            /* 分类穷尽（恒真，用于证明没有第五态漏在外面） */
            accounted: (keptN + droppedN + partialN + unknownN + emptyN) === xs.length,
            /* 归因完备：没有一块落在「未知」。★ 这一格是**可分**的 ——
             *   「accounted 但含未知块」与「accounted 且无未知块」是两件事。 */
            fullyAccounted: (unknownN === 0),
            /* 字符账：无未知块时，「保留 + 被丢 + 被切半 = 候选」必须成立。 */
            charsEqual: (known && unknownN === 0)
                ? ((_keptBlockChars + _droppedBlockChars + _partialBlockChars) === candChars) : null,
        };

        /* ---------- resident：常驻块超量时**显式报告原因与选择** ---------- */
        let resident = null;
        if (Array.isArray(o.residentIdx)) {
            const set = new Set(o.residentIdx.map((n) => Number(n)).filter((n) => Number.isFinite(n)));
            const rIdx = xs.filter((x) => set.has(x.i));
            const rChars = rIdx.reduce((a, x) => a + x.chars, 0);
            const rKept = rIdx.filter((x) => x.state === 'kept' || x.state === 'partial').length;
            const ro = (tr && tr.residentOverflow && typeof tr.residentOverflow === 'object') ? tr.residentOverflow : null;
            const roOver = _numOrNull(ro && ro.over);
            resident = {
                provided: true,
                blocks: rIdx.length,
                chars: rChars,
                keptBlocks: known ? rKept : null,
                overflow: ro ? { chars: _numOrNull(ro.chars), over: roOver } : null,
                /* 原因与选择 —— 计划第 ④ 条要的就是这两句在场，而不是一个光秃秃的数字。 */
                reason: (roOver !== null && roOver > 0)
                    ? ('常驻封装 ' + (ro && ro.chars) + ' 字符 > 预算 ' + budget + ' ⇒ 触发可用容量为 0，载荷超预算 ' + roOver + ' 字符')
                    : '',
                decision: '常驻块按设计**全保留**（关键事实保护）：常驻自身超预算时**不偷偷裁**，载荷如实超预算，溢出量记在 overflow（触发侧因此装不下任何块）',
                note: (roOver !== null && roOver > 0) ? '本轮的预算溢出**全部来自常驻保护**，不是触发装满所致' : '',
            };
        } else {
            resident = {
                provided: false,
                blocks: null, chars: null, keptBlocks: null, overflow: null,
                reason: '', decision: '',
                note: '常驻下标未由调用方提供 ⇒ 常驻字符量不可测（常驻口径的真源在 index.js 的 RESIDENT_MARKERS，本模块不另立一套）',
            };
        }

        /* ---------- capacity：容量口径（首尾说明 / 分隔符 / token） ---------- */
        const fr = (o.frame && typeof o.frame === 'object') ? o.frame : null;
        const frame = fr ? {
            headLen: _numOrNull(fr.headLen), tailLen: _numOrNull(fr.tailLen), separatorLen: _numOrNull(fr.separatorLen),
        } : null;
        let frameCheck = null;
        if (frame && derived.frameChars !== null && known) {
            const nInPayload = (known ? xs.filter((x) => x.state === 'kept' || x.state === 'partial').length : null);
            const sepN = (partialN > 0) ? null : Math.max(0, (nInPayload || 0) - 1);
            if (sepN !== null && frame.headLen !== null && frame.tailLen !== null && frame.separatorLen !== null) {
                const expected = frame.headLen + frame.tailLen + frame.separatorLen * sepN;
                frameCheck = { expected: expected, actual: derived.frameChars, equal: expected === derived.frameChars,
                    why: (expected === derived.frameChars) ? '' : '载荷内非块字符与「首尾说明 + 块间分隔符」核算不符（口径漂移或载荷含额外装饰）' };
            }
        }
        const capacity = {
            budget: budget,
            tokenBudget: _numOrNull(o.tokenBudget),
            tokenSource: o.tokenSource ? _str(o.tokenSource) : null,
            strategy: o.strategy ? _str(o.strategy) : (tr && tr.strategy ? _str(tr.strategy) : null),
            frame: frame,
            frameChars: derived.frameChars,
            frameCheck: frameCheck,
            note: '预算判定**含**首尾说明（HEAD/TAIL，常量真源在 index.js 与 injection-router.js）与块间分隔符（1 字符）；'
                + 'token 口径见 tokenSource（host-* = 宿主真 tokenizer，estimate = CJK 估算 ≈1.11 字符/token）——'
                + '估算值不得当精确值摆出去',
        };

        /* ---------- 未知清单（机器可判：哪一格为什么是 null） ---------- */
        const unknown = [];
        for (const k of Object.keys(quantitiesWhy)) if (quantities[k] === null) unknown.push({ field: k, why: quantitiesWhy[k] });
        if (!identity.fullyAccounted) unknown.push({ field: 'blockAttribution', why: unknownN + ' 块不可归因（来源 ' + from + '），其字符 ' + unknownChars + ' 计入 unknownChars' });
        if (!resident.provided) unknown.push({ field: 'residentChars', why: resident.note });
        if (derived.frameChars === null) unknown.push({ field: 'frameChars', why: derived.frameNote });

        return {
            version: RECEIPT_VERSION,
            ts: ts,
            strategy: capacity.strategy,
            quantities: quantities,
            quantitiesWhy: quantitiesWhy,
            derived: derived,
            identity: identity,
            blocks: xs,
            resident: resident,
            capacity: capacity,
            unknown: unknown,
        };
    }

    /**
     * 一行诊断（纯字符串，不抛）。
     * 纪律：坏消息必须在场 —— 不可测、未知字符、常驻溢出都要出现在这一行上，
     * 藏进结构深处等于没说（本仓对诊断行的既有口径）。
     */
    function receiptLine(rc) {
        try {
            if (!rc || !rc.quantities) return '—';
            const q = rc.quantities, d = rc.derived, id = rc.identity;
            const parts = ['候选 ' + q.candidateChars + ' 字符', '载荷 ' + (q.payloadChars === null ? '不可测' : q.payloadChars + ' 字符')];
            if (q.trimReductionChars !== null) parts.push('裁剪减 ' + q.trimReductionChars + ' 字符');
            if (q.droppedBlockChars !== null) parts.push('丢块 ' + q.droppedBlockChars + ' 字符');
            else parts.push('丢块不可测（' + String(id.from) + '）');
            if (q.budgetOverflowChars !== null && q.budgetOverflowChars > 0) parts.push('超预算 ' + q.budgetOverflowChars + ' 字符');
            if (d.frameChars !== null) parts.push('封装 ' + d.frameChars + ' 字符');
            if (q.unknownChars > 0) parts.push('⚠️ 未知 ' + q.unknownChars + ' 字符/' + id.unknownBlocks + ' 块');
            if (rc.resident && rc.resident.overflow && _numOrNull(rc.resident.overflow.over) > 0) {
                parts.push('常驻溢出 ' + rc.resident.overflow.over + ' 字符（关键事实保护）');
            }
            return parts.join(' · ');
        } catch (e) { return '—（回执异常）'; }
    }

    const api = {
        RECEIPT_VERSION,
        FROM,
        traceUsable,
        classifyBlocks,
        deriveReceipt,
        receiptLine,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaInjectionReceipt = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
