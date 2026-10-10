/* ============================================================
 * repair-settle.js — [v3.311.0 · M-X2] 修复落定面：从「流程完成」到「所有派生面落盘完成」
 * ------------------------------------------------------------
 * 【它补的是哪一格（第二期拓展计划 M-X2 验收原文逐条）】
 *   X2（v3.295.0）已把「登记 → 逐项落笔 → 核原数据 → 落盘回读 → 带证据 settle」这条链
 *   做通了，但**落定之后**还有五格空着：
 *     · 「仅登记」与「事实已纠正」在界面上**同形** —— `applied` 回答的是**流程**
 *       （六类派生件都动过手了），它从来不回答**结果**（改动被证明了）。旧面上界面上
 *       只有 `applied` 一个读数可读，于是「登记了一下」也能被显示成「已纠正」。
 *     · 「全部成功」与「部分成功」在回执上**同形** —— 回执里 `ok:false` 只说「有坏的」，
 *       不区分「一条都没成」与「九成成了、一条没跟上」（计划原文：部分成功显示 partial，
 *       不伪装全成功）。
 *     · 失败项只能**整批重放** —— `applyRepairPlan` 是一次性全量；重试一次就把已成功
 *       的项再落一遍（幂等保得住数据，但回执上的 `applied` 计数会让「第二次什么都没发生」
 *       看起来像「又落了一遍」）。计划原文要求「失败项**单独重试**，不整批重放」。
 *     · 预览票据**不存在** —— `previewRepair` 是纯函数（签名里没有状态，这是对的），
 *       但它不产出任何「这次预览对应的会话 / 代际」凭据，于是**切聊之后**拿旧预览去落笔，
 *       没有任何一道闸认得出来。计划原文：切聊后旧预览被拒绝。
 *     · 召回缓存**不跟随同代变化** —— 事实被撤销后 `_recallArtifacts`（逐轮召回产物）
 *       里那些引用了被撤 id 的产物照旧可复用（`isArtifactStale` 只在调用方主动问时才算）。
 *       计划原文：源、摘要、图谱、时间线、**召回缓存**跟随同代变化。
 *
 * 【本模块的职责：把「落定」从一句话变成四个可读读数】
 *   输入是 repair-loop 的记录（`rec`）+ 当前会话 / 代际 / 修订号，输出：
 *     · `verdict`  —— registered / partial / settled / corrected（**四态互不同形**）
 *     · `coherence`—— same / mixed / unknown（所有派生面是否来自同一 revision）
 *     · `retry`    —— 只挑该重试的项 + 幂等键（不整批重放）
 *     · `ticket`   —— 预览凭据 + 校验三态（切聊 / 换代 / 过期）
 *     · `cache`    —— 哪些召回产物引用了被撤 id（宿主据此作废）
 * 本模块**不写任何账**：它是纯函数面，写口仍归各 owner（与 repair-loop 同一条纪律）。
 *
 * 【三态纪律（本仓反复治理过的那一类，逐条落在这里）】
 *   · 「没尝试」≠「试了失败」：回读结论是 true / false / **null**；
 *   · 「登记了」≠「改完了」≠「被证明了」：verdict 四态，压成一态就是本模块存在的理由；
 *   · 「凭据缺失」≠「凭据过期」：票据校验 reasons 分开写（没给票 ≠ 票作废）。
 * 挂 window.LonShaRepairSettle，供 index.js 修复面 / 诊断面使用。
 * ============================================================ */
(function (root) {
    'use strict';
    const RS_VERSION = 1;
    /** 落定判定四态（**穷尽互斥**：任何一条记录恰落一态）。 */
    const VERDICTS = Object.freeze(['registered', 'partial', 'settled', 'corrected']);
    /** 同代一致性三态：same=全来自同一修订 / mixed=混了代 / unknown=判不了（没给修订号）。 */
    const COHERENCE = Object.freeze(['same', 'mixed', 'unknown']);
    /** 重试三态 + 一档「不适用」：ready / none（无可重试）/ exhausted（达上限）/ missing（判不了）。 */
    const RETRY_STATES = Object.freeze(['ready', 'none', 'exhausted', 'missing']);
    /** 票据校验形状（**五种不同形**，不得压成一格布尔）。 */
    const TICKET_REASONS = Object.freeze(['ok', 'no-ticket', 'chat-changed', 'epoch-changed', 'expired']);
    /** 被修复对象的**面**（六类派生件 + 召回缓存）——召回缓存是本刀新增的那一格。 */
    const FACES = Object.freeze(['summary', 'event', 'relation', 'promise', 'fact', 'timeline', 'recall']);
    /** 单次修复的重试上限（超过即 exhausted —— 「一直重试」与「重试到底了」必须不同形）。 */
    const MAX_ATTEMPTS = 3;
    /** 票据默认有效期（毫秒）。过期与切聊不是一件事：前者是时间的，后者是处境的。 */
    const TICKET_TTL_MS = 30 * 60 * 1000;

    /** 依赖面（缺哪一格、缺了会怎样，由 `describe()` 逐条回答）。 */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'KINDS', why: '六类派生件登记表（**单一真源**：本模块不另写一份派生件清单）' },
        { key: 'EVIDENCE', why: '证据三态登记表（unconfirmed / partial / confirmed）' },
        { key: 'now', why: '时钟（可注入，判据才能对过期取证）' }
    ]);

    /* ── 小工具（**不重演账本口径**：只做归一与截断） ── */
    function text(v, max) {
        const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        return max ? (s.length > max ? s.slice(0, max) + '…' : s) : s;
    }
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function itemsOf(rec) {
        return Array.isArray(rec && rec.affected) ? rec.affected : [];
    }

    /**
     * 【验收①】**「仅登记」不得读成「事实已纠正」** —— 判定四态（纯函数）。
     *
     *   为什么必须四态而不是布尔：本仓在 `applied` 上已经吃过一次亏 ——
     *   `status === 'applied'` 只说明**六类派生件都动过手了**（流程完成），
     *   它一个字都没说「改动被证明了」。于是「登记了一下」与「真改对了」在界面上
     *   完全同形，而界面正是用户判断「这条事实还在不在」的地方。
     *
     *   四态的优先级（即处置次序）：
     *     `corrected` —— **流程走完**（无 pending、无 failed/missing）且**逐项** confirmed；
     *     `settled`   —— 流程走完，但并非全部被证实（有 done 却未证实 / 未盖戳的项）；
     *     `partial`   —— 流程**没走完**：有 failed / missing 项，或还有 pending（部分成功）；
     *     `registered`—— 一项都没落定（**这就是「仅登记」**）。
     *   ★ 四条**穷尽互斥**，每一条都可达 —— 少一态就有一类处境无处安放
     *     （本模块存在的理由正是「登记了」与「改对了」曾无处可分）。
     *   ★ 认凭证的**唯一来源是逐项 evidence**，不读 `rec.evidence`
     *     （那是聚合读数；聚合与逐项两处口径会漂移 —— 本仓治理过多轮的「同一形状两个读数」）。
     */
    function verdictOf(rec) {
        const list = itemsOf(rec);
        if (!list.length) return { verdict: 'registered', reason: 'no-items' };
        const pending = list.filter((it) => (it.status || 'pending') === 'pending').length;
        const bad = list.filter((it) => it.status === 'failed' || it.status === 'missing').length;
        const done = list.filter((it) => it.status === 'done').length;
        const unproven = list.filter((it) => it.status === 'done' && it.evidence !== 'confirmed').length;
        const counts = { done: done, bad: bad, unproven: unproven, pending: pending };
        if (pending === list.length) return { verdict: 'registered', reason: 'nothing-settled', counts: counts };
        /* 流程没走完（有坏的 / 还有没动的）⇒ partial。★ 这是「部分成功不伪装全成功」那一格。 */
        if (bad || pending) {
            const why = [];
            if (pending) why.push('pending ' + pending);
            if (bad) why.push('failed ' + bad);
            return { verdict: 'partial', reason: why.join(' · '), counts: counts };
        }
        /* 流程走完了：六类都动了手。剩下唯一的问题是「被证明了没有」。 */
        if (unproven) return { verdict: 'settled', reason: 'settled-unproven ' + unproven, counts: counts };
        return { verdict: 'corrected', reason: 'all-confirmed', counts: counts };
    }

    /**
     * 【验收④】**所有派生面来自同一 revision** —— 同代一致性判定（纯函数）。
     *   `faces` 每项自报 `rev`（它按哪一代的数据算出来的）。
     *
     *   【判定次序（**先找反例，再找证据**）】
     *     ① 已盖戳的项里**出现了两个不同的 rev** ⇒ `mixed`（这是**实证**：确实混代了）；
     *     ② 否则只要有**任何一项没盖戳** ⇒ `unknown`（判不了 —— 「少一个戳」使
     *        「所有面同代」这句话**不成立**，而它既不是实证的混代、也不是同代）；
     *     ③ 全部盖戳且全等 ⇒ `same`。
     *   ★ 为什么 ② 不能并进 ③（首版就是这样，且被自己的判据逼出来）：把「有一项没戳」
     *     读成 `same`，等于**用缺席补上了证据** —— 本仓最忌的形态。而 ② 也不能并进 ①
     *     （`mixed` 是「我看到了两个不同的代」，与「我没看到」处置相反）。
     *   `reason` 把三态各自细分成可读归因（`divergent` / `no-stamps` / `partial-stamps` /
     *   `uniform`），`unstamped` 与 `revs` 如实外供。
     */
    function coherenceOf(faces) {
        const list = Array.isArray(faces) ? faces : [];
        const stamped = list.map((f) => numOrNull(f && f.rev)).filter((v) => v !== null);
        const unstamped = list.length - stamped.length;
        const uniq = Array.from(new Set(stamped)).sort((a, b) => a - b);
        if (uniq.length > 1) return { state: 'mixed', reason: 'divergent', rev: null, unstamped: unstamped, revs: uniq };
        if (!uniq.length) return { state: 'unknown', reason: 'no-stamps', rev: null, unstamped: unstamped, revs: [] };
        if (unstamped > 0) return { state: 'unknown', reason: 'partial-stamps', rev: uniq[0], unstamped: unstamped, revs: uniq };
        return { state: 'same', reason: 'uniform', rev: uniq[0], unstamped: 0, revs: uniq };
    }

    /**
     * 【验收①】**同一 revision 贯穿**：给一批派生件的落定结果盖同一枚戳。
     *   每项带 `sourceRefs`（这条派生件自报依赖哪些源）+ `derivedFrom`（从哪一条派生）。
     *   ★ 为什么 `derivedFrom` 必须落在这里（计划功能③原文「所有派生内容记录
     *     `sourceRefs / derivedFrom`」）：本仓实测 `derivedFrom` 是**死字段** ——
     *     `repair-loop.refsOf()` 读它，而全仓零产出，于是 `basis` 恒 needle、
     *     「按确切引用找影响」在生产上从未生效。落定面把它**写出来**，这条通路才有起点。
     */
    function seal(rev, faces) {
        const r = numOrNull(rev);
        const list = Array.isArray(faces) ? faces : [];
        const sealed = list.map((f) => {
            const id = text(f && (f.key || f.id || f.name), 80) || text(f && f.face, 40);
            /* ★ 自有戳**优先**：本函数是「给没盖戳的补上」，不是「把别人的戳改掉」。
             *   若一律写 `rev: r`，`coherenceOf` 就永远算出 'same' ——
             *   那条「所有派生面来自同一 revision」的判据会**恒过**（判据自己空转）。 */
            const own = numOrNull(f && f.rev);
            return {
                face: text(f && f.face, 24),
                key: id,
                rev: own !== null ? own : r,
                sourceRefs: Array.isArray(f && f.sourceRefs) ? f.sourceRefs.map((x) => text(x, 48)).filter(Boolean).slice(0, 12) : [],
                derivedFrom: text(f && (f.derivedFrom || f.from), 48),
                evidence: text(f && f.evidence, 16)
            };
        });
        return { rev: r, faces: sealed, coherence: coherenceOf(sealed), stamped: r !== null };
    }

    /**
     * 【验收③】**切聊后旧预览被拒绝** —— 预览票据（纯函数，产票）。
     *
     *   【为什么票据必须是独立一格而不是复用 `expectRevision`】
     *     `expectRevision` 只在**桥面**（写命名空间的调用点）比对，且它比的是
     *     `repairRevision()`（变更栅栏号，切聊**不**递增它 —— 切聊只换 chatId）。
     *     于是「切了聊之后拿旧预览去落笔」在桥面上**照样通过**：修订号没变。
     *     票据把「这次预览看的是哪个会话、哪一代、哪一版」三样都记下来，
     *     落笔前逐一比 —— 三样各对应一种拒绝理由（**不同形**）。
     */
    function ticket(input) {
        const i = input || {};
        const now = numOrNull(i.now) || 0;
        const rev = numOrNull(i.rev);
        const chatId = text(i.chatId, 120);
        const epoch = numOrNull(i.epoch);
        /* 键：会话 + 代际 + 修订三样同源拼出 —— 任一样变了，键就变，旧票自然对不上。 */
        const key = [chatId || '?', 'e' + (epoch === null ? '?' : epoch), 'r' + (rev === null ? '?' : rev), text(i.nonce, 24) || 'p'].join('|');
        return {
            kind: 'repair-preview-ticket', version: RS_VERSION,
            key: key, chatId: chatId, epoch: epoch, rev: rev,
            at: now, expiresAt: now + TICKET_TTL_MS, ttlMs: TICKET_TTL_MS
        };
    }
    /**
     * 校验票据：五种形状（**不得压成一格布尔**）。
     *   · 没给票        ⇒ `no-ticket`（「没拿票」与「票作废」处置相反：前者须补票，后者须重预览）
     *   · 会话变了      ⇒ `chat-changed`
     *   · 代际变了      ⇒ `epoch-changed`（回档 / 恢复 / 导入）
     *   · 超过有效期    ⇒ `expired`
     * 顺序：先判「有没有可比的对象」，再判会话、代际，最后判时间 —— 时间判据**最后**，
     *   因为「切了聊」比「放太久」更具体（用户要知道的是「你换会话了」）。
     */
    function checkTicket(t, ctx) {
        const c = ctx || {};
        const tk = (t && typeof t === 'object') ? t : null;
        if (!tk || !text(tk.key, 200)) return { ok: false, reason: 'no-ticket' };
        const nowChat = text(c.chatId, 120);
        if (text(tk.chatId, 120) && nowChat && text(tk.chatId, 120) !== nowChat) {
            return { ok: false, reason: 'chat-changed', from: text(tk.chatId, 120), to: nowChat };
        }
        const nowEpoch = numOrNull(c.epoch);
        if (tk.epoch !== null && nowEpoch !== null && tk.epoch !== nowEpoch) {
            return { ok: false, reason: 'epoch-changed', from: tk.epoch, to: nowEpoch };
        }
        const now = numOrNull(c.now);
        if (now !== null && numOrNull(tk.expiresAt) !== null && now > numOrNull(tk.expiresAt)) {
            return { ok: false, reason: 'expired', at: numOrNull(tk.at), expiresAt: numOrNull(tk.expiresAt), now: now };
        }
        return { ok: true, reason: 'ok' };
    }

    /**
     * 【验收③】**失败项单独重试，不整批重放** —— 重试计划（纯函数）。
     *
     *   【为什么不能整批重放】
     *     已成功的项再落一遍，数据上是幂等的（owner 面同一项改两次结果相同），
     *     但回执上的 `applied` 计数会**从 0 变成 3、从 3 变成 3** —— 用户看到的
     *     「重试前落了 5 条、重试后还是 5 条」与「重试前 5 条、重试后 8 条」不同，
     *     而真实发生的都是同一件事：只有那两条坏的动了。**读数必须只描述这一次动的东西**。
     *
     *   幂等键 `retryKey`：`rec.id + '#' + kind + '#' + key + '#' + attempt`。
     *     为什么带 attempt：同一条项第一次重试与第二次重试是**两次不同的动作**
     *     （第二次是在第一次也失败之后），键相同会让第二次被当成重放而丢掉它的 `attempt` 读数。
     *     为什么又不能让 attempt 无限涨：`MAX_ATTEMPTS` 到了就是 `exhausted` ——
     *     「还能再试」与「试到底了」必须不同形（本仓三态纪律）。
     *
     * @param {boolean} [opts.includeUnproven] 是否把「报了 done 但没证实」的项也纳入重试
     *   （默认 **false**：那些项宿主已经动过手，重试会二次改数据；要重试须显式声明）。
     */
    function retryOf(rec, opts) {
        const o = opts || {};
        const list = itemsOf(rec);
        if (!list.length) return { state: 'missing', items: [], attempted: 0, limit: MAX_ATTEMPTS, reason: 'no-items' };
        const attempt = numOrNull(o.attempt) || 0;
        const wantUnproven = o.includeUnproven === true;
        /* 该项是否「该重试」：failed / missing 是**显式失败**（一定要试）；
         *   done 但 evidence 不足**只有显式声明时**才进（否则会二次改数据 —— 那是数据事故）。 */
        const need = list.filter((it) => {
            if (it.status === 'failed' || it.status === 'missing') return true;
            if (wantUnproven && it.status === 'done' && it.evidence !== 'confirmed') return true;
            return false;
        });
        const exhausted = attempt >= MAX_ATTEMPTS;
        const id = text(rec && rec.id, 48);
        const items = need.map((it) => ({
            kind: text(it.kind, 24),
            key: text(it.key, 80),
            why: text(it.why, 80),
            basis: text(it.basis, 16),
            status: text(it.status, 16),
            /* 幂等键：**只描述这一项的那一次**（不许含整批）。 */
            retryKey: id + '#' + text(it.kind, 24) + '#' + text(it.key, 80) + '#' + (attempt + 1)
        }));
        const state = !need.length ? 'none' : (exhausted ? 'exhausted' : 'ready');
        return {
            state: state, items: exhausted ? [] : items, attempted: attempt, limit: MAX_ATTEMPTS,
            candidate: items.length,
            reason: !need.length ? 'nothing-to-retry' : (exhausted ? 'attempt-limit' : 'has-failed-items'),
            /* ★ 明说「哪些**不**在本次重试里」——不整批重放这件事必须**可读**，
             *   否则调用方只能靠「回执里没出现」来推断，那正是「静默跳过」的形态。 */
            skipped: list.filter((it) => it.status === 'done').map((it) => text(it.key, 80))
        };
    }

    /**
     * 【验收⑤】**召回缓存跟随同代变化** —— 哪些召回产物引用了被撤的 id。
     *
     *   【为什么归本面管】`recall-artifact.isArtifactStale()` 是**被动**的：它只在调用方
     *   主动问「这条产物还新鲜吗」时才算，而落定流程**从不去问** —— 于是事实撤了、
     *   引用它算出来的那几轮注入照旧可复用（产物里 `selectedMemoryIds` 还指着已撤的 id）。
     *   本函数把这件事从「被动查询」变成「落定后主动列出该作废的产物」。
     *   纯函数：只**指出**哪些产物该作废，作废动作仍归 recall-artifact 的 `invalidateTurn`。
     */
    function cacheOf(artifacts, revokedIds) {
        const list = Array.isArray(artifacts) ? artifacts : [];
        const ids = new Set((Array.isArray(revokedIds) ? revokedIds : []).map((x) => text(x, 48)).filter(Boolean));
        const hits = [];
        for (const a of list) {
            if (!a || typeof a !== 'object') continue;
            const sel = Array.isArray(a.selectedMemoryIds) ? a.selectedMemoryIds.map((x) => text(x, 48)) : [];
            const hit = sel.filter((id) => ids.has(id));
            if (!hit.length) continue;
            hits.push({
                turnId: text(a.turnId, 48),
                artifactId: text(a.artifactId, 80),
                touched: hit.slice(0, 12),
                /* 覆盖范围随读数一起给出：产物可能被截过（清单只剩前 N 条），
                 *   此时 `touched` 只是**这一部分里**命中的，不能读成「这一轮的依据全在这」。 */
                checked: sel.length,
                truncated: a.selectedMemoryIdsTruncated === true
            });
        }
        return {
            invalidated: hits, count: hits.length, scanned: list.length,
            revoked: Array.from(ids),
            /* 三态：扫了但没有（`count:0` 且 `scanned>0`）与「没产物可扫」（`scanned:0`）不同形。 */
            state: !list.length ? 'no-artifacts' : (hits.length ? 'has-hits' : 'clean')
        };
    }

    /** 「面」的落定清单（一条修复牵动哪些面 —— 从逐项结果聚合，**不另立清单**）。 */
    function facesOf(rec, rev) {
        const list = itemsOf(rec);
        return seal(rev, list.map((it) => ({
            face: FACES.includes(it.kind) ? it.kind : 'summary',
            key: it.key, rev: rev,
            sourceRefs: Array.isArray(it.sourceRefs) ? it.sourceRefs : [],
            derivedFrom: it.derivedFrom, evidence: it.evidence
        })));
    }

    /** 自述：缺哪一格、缺了会怎样（只读、不抛）。 */
    function describe(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = [];
        for (const need of REQUIRED_DEPS) if (d[need.key] === undefined || d[need.key] === null) missing.push({ key: need.key, why: need.why });
        return {
            kind: 'repair-settle-describe', version: RS_VERSION,
            verdicts: VERDICTS.slice(), coherence: COHERENCE.slice(), retryStates: RETRY_STATES.slice(),
            ticketReasons: TICKET_REASONS.slice(), faces: FACES.slice(),
            maxAttempts: MAX_ATTEMPTS, ttlMs: TICKET_TTL_MS,
            present: REQUIRED_DEPS.length - missing.length, total: REQUIRED_DEPS.length,
            missing: missing,
            /* 面级自述：**四态各自可达**（不是「数组里有四个字符串」——那是对常量自己断言，
             *   本仓定性过的自我指涉判据）。这里拿四条真记录过一遍 `verdictOf`，
             *   要求产出的态集合**恰好**等于词表：少一个态 ⇒ 那类处境无处安放，
             *   多一个态 ⇒ 词表里有骗人的字。 */
            verdictsExhaustive: (function () {
                const probe = [
                    { affected: [{ status: 'pending' }] },
                    { affected: [{ status: 'pending' }, { status: 'done' }] },
                    { affected: [{ status: 'done', evidence: 'unconfirmed' }] },
                    { affected: [{ status: 'done', evidence: 'confirmed' }] }
                ].map((r) => verdictOf(r).verdict);
                return probe.length === VERDICTS.length && probe.every((v, i) => v === VERDICTS[i]);
            })(),
            writesNothing: true,
            note: missing.length ? '依赖缺 ' + missing.length + ' 格（' + missing.map((m) => m.key).join('、') + '）' : '依赖齐备'
        };
    }
    /** 自检（判据套件咬这里；四项各自独立，不合成一个布尔）。 */
    function selfCheck(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = REQUIRED_DEPS.filter((n) => d[n.key] === undefined || d[n.key] === null).map((n) => n.key);
        const dsc = describe(d);
        return {
            ok: missing.length === 0 && dsc.verdictsExhaustive === true,
            version: RS_VERSION,
            depsComplete: missing.length === 0, missing: missing,
            verdictsExhaustive: dsc.verdictsExhaustive === true,
            reasonsDistinct: new Set(TICKET_REASONS).size === TICKET_REASONS.length,
            writesNothing: true
        };
    }
    /** 诊断一行（四态分开报；没有记录时「还没落定过」与「一条都没成」不同形）。 */
    function line(rec) {
        try {
            if (!rec || typeof rec !== 'object') return '尚未落定过（无记录）';
            const v = verdictOf(rec);
            const c = v.counts || { done: 0, bad: 0, unproven: 0, pending: 0 };
            const parts = ['落定 ' + v.verdict];
            if (c.done) parts.push('已改 ' + c.done);
            if (c.pending) parts.push('未动 ' + c.pending);
            if (c.bad) parts.push('异常 ' + c.bad);
            if (c.unproven) parts.push('未证实 ' + c.unproven);
            return parts.join(' · ');
        } catch (_e) { return '—（落定面异常）'; }
    }

    const api = Object.freeze({
        RS_VERSION, VERDICTS, COHERENCE, RETRY_STATES, TICKET_REASONS, FACES, MAX_ATTEMPTS, TICKET_TTL_MS,
        REQUIRED_DEPS,
        verdictOf, coherenceOf, seal, ticket, checkTicket, retryOf, cacheOf, facesOf,
        describe, selfCheck, line
    });
    root.LonShaRepairSettle = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
