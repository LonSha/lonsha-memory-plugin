/**
 * evidence-solver.js — [v3.356.0 · M6-O2] 记忆问题求解器：从找相关段落到跨证据回答复杂问题
 *   纯函数 IIFE，零依赖、零联网、零写回。
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓已有的问答面各自都对，但都只答「一句话」：
 *     · evidence-query.js  —— planQuestion 把一句问句拆成**一条**检索计划；
 *     · qa-thread.js       —— 承接**上一轮**的问句条件（代词继承、时点、比较轴）；
 *     · testimony-board.js —— 同一事件的**多方证词**与争议状态。
 *   用户问的却是「为什么先答应又退出，与谁掌握的信息有关」——
 *   这需要三样既有模块都**没有**的能力：
 *     ① 把一个复杂问题拆成**多个子命题**（人物 / 时间范围 / 待比较命题）；
 *     ② 把各子命题的检索结果**连接**起来（连接关系本身要能被回答）；
 *     ③ 加入一条**相反证词**后，解释必须随之改变 —— 而既有面全是「命中即返回」，
 *        多一条反证只会多一行，不会有任何结构变化。
 *   后果三件都不报错：界面读数照样绿，只是答案永远是「几条并列的碎片」。
 *
 * 【本模块的职责（只做求解结构，不产正文、不造因果）】
 *   把一个复杂问题组织成一份**可核查的求解记录**：
 *     · 子命题（claims）逐条独立求证，每条有自己的证据连接与判据；
 *     · 证据按**来源去重**（同一份原文经甲转乙不重复计支持）——
 *       计划原文点名：「不按重复转载数投票」；
 *     · **支持与反证并列**（support / counter 两条线分列，绝不合并成一句结论）；
 *     · 缺关键环节时只给**条件结论**（conditional），不给完整答案；
 *     · 修改时点/范围后，全部依据**按新范围重求**（不增量修补）。
 *
 * 【四条硬纪律（每条都对应一次真会出事的假读数）】
 *   1. **多跳有界**：求解深度上限 SOLVER_LIMITS.maxHops（默认 4）。
 *      无界检索会让「一句复杂问题」变成「扫全库」，且读数里看不出它扫了多少。
 *   2. **不按条数投票**：`support` 段与 `counter` 段**分列**，且支持强度走**档位**
 *      （strong / medium / weak），强度由**来源等级**（一手 > 转述 > 传闻）派生，
 *      绝不用「三条弱源 > 一条一手」的多数票。
 *   3. **缺环节只给条件结论**：连接断裂时结论状态是 `conditional`，
 *      并**具名指出缺哪一环**（missing 逐条列），不给「看起来完整」的答案。
 *   4. **重求而非增补**：范围变了（时点/人物/命题）就**整份重算**，
 *      绝不把旧答案的碎片拼进新答案 —— 拼接会让旧范围的证据在新范围里冒充支撑。
 *
 * 【本模块不做什么（边界）】
 *   · 不产出自然语言答案正文（那是生成侧的事）；只产出**可核查依据**与结论状态。
 *   · 不把「模型说的因果」自动登记成事实（计划原文明写：不做）。
 *   · 不重做 qa-thread 的条件继承（问句线程归它），本模块吃的是**已定范围**。
 *   · 不读宿主 `this`、不碰 storage、不联网。
 *
 * 挂 window.LonShaEvidenceSolver，供 index.js 问答求解面 / 诊断面使用。
 */
(function (root) {
    'use strict';

    const SV_VERSION = 1;
    const SV_KIND = 'evidence_solver';

    /** 子命题的求证状态（★ conditional 与 answered 分列：缺环不是「答不出来」的同义词）。 */
    const CLAIM_STATES = Object.freeze({
        ANSWERED: 'answered',
        CONDITIONAL: 'conditional',
        UNDECIDED: 'undecided',
        REFUTED: 'refuted',
    });
    /** 证据立场：支持 / 反证（★ 两条线永远分列，绝不合成一个「结论」）。 */
    const STANCES = Object.freeze({
        SUPPORT: 'support',
        COUNTER: 'counter',
    });
    /** 来源等级（决定强度档位；**不按条数投票**）。 */
    const ORIGIN_GRADES = Object.freeze({
        PRIMARY: 'primary',
        SECONDARY: 'secondary',
        RELAYED: 'relayed',
        UNKNOWN: 'unknown',
    });
    /** 强度档位（★ 不是百分比：计划原文禁止虚构置信度）。 */
    const STRENGTHS = Object.freeze(['strong', 'medium', 'weak', 'none']);
    /** 连接状态（子命题之间的边：接得上 / 接不上 / 无关）。 */
    const LINK_STATES = Object.freeze({
        LINKED: 'linked',
        BROKEN: 'broken',
        UNRELATED: 'unrelated',
    });
    /** 归因（每条可读，不许用 'error' 一锅装）。 */
    const SV_REASONS = Object.freeze({
        OK: 'ok',
        NOT_OBJECT: 'not-object',
        NO_QUESTION: 'no-question',
        NO_CLAIMS: 'no-claims',
        NOT_FOUND: 'not-found',
        BAD_SHAPE: 'bad-shape',
        OVER_LIMIT: 'over-limit',
        NO_EVIDENCE: 'no-evidence',
        DUP_EVIDENCE: 'dup-evidence',
        NO_SOURCE: 'no-source',
    });

    const SOLVER_LIMITS = Object.freeze({
        /** 子命题上限。 */
        claims: 8,
        /** 每条子命题的证据上限。 */
        evidencePerClaim: 12,
        /** 求解深度（跳数）上限。★ 有界：无界检索会让读数失真。 */
        maxHops: 4,
        /** ★ 答一个完整问题所需的**独立原文下限**（计划原文：「至少三处独立原文才可答」）。
         *   计数口径：按 `refId` 去重后的原文数 —— 同一份原文经甲转乙**只算一处**，
         *   所以「三条转载」永远凑不满下限。0 = 不设下限（仅供单元探针，不用于生产判定）。 */
        minIndependent: 3,
        /** 参与连接的最大节点数。 */
        nodes: 24,
        /** 标题长度。 */
        title: 80,
        /** 单条证据摘录长度。 */
        quote: 200,
    });

    /* ---------- 基础归一 ---------- */
    function str(v) { return String(v == null ? '' : v).trim(); }
    function capStr(v, n) {
        const s = str(v);
        return s.length > n ? s.slice(0, n) : s;
    }
    function numOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    function strList(v, cap) {
        const out = [];
        if (!Array.isArray(v)) return out;
        for (const x of v) {
            const s = str(x);
            if (s && out.indexOf(s) < 0) out.push(s);
            if (out.length >= cap) break;
        }
        return out;
    }

    /* ---------- 证据归一（只持引用与读数，不复制正文） ---------- */
    /**
     * 归一一条证据。
     * ★ 双键纪律：有 source 没有 refId（或反之）一律 readable:false ——
     *   挂一个回查不到的引用，等于宣称「这条有出处」而无法核对。
     * ★ stance 必须显式给：support / counter 缺省是 **unknown**，
     *   绝不当成 support（把反证读成支持是最坏的一种错读）。
     */
    function normalizeEvidence(raw) {
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
        if (!o) return { readable: false, source: '', refId: '', stance: 'unknown', grade: ORIGIN_GRADES.UNKNOWN, strength: 'none', quote: '', floor: null, reason: SV_REASONS.NOT_OBJECT };
        const source = capStr(o.source, 60);
        const refId = capStr(o.refId, 80);
        const stanceRaw = str(o.stance);
        const stance = (stanceRaw === STANCES.SUPPORT || stanceRaw === STANCES.COUNTER) ? stanceRaw : 'unknown';
        const gradeRaw = str(o.grade);
        const grade = (Object.values(ORIGIN_GRADES).indexOf(gradeRaw) >= 0) ? gradeRaw : ORIGIN_GRADES.UNKNOWN;
        const floor = numOrNull(o.floor);
        const quote = capStr(o.quote, SOLVER_LIMITS.quote);
        const readable = !!(source && refId && stance !== 'unknown');
        return {
            readable: readable,
            source: source,
            refId: refId,
            stance: stance,
            grade: grade,
            strength: strengthOf(grade),
            quote: quote,
            floor: floor,
            reason: readable ? SV_REASONS.OK : (source && refId ? 'bad-stance' : SV_REASONS.NO_SOURCE),
        };
    }
    /** 来源等级 → 强度档位（**不按条数投票**：三条弱源不敌一条一手）。 */
    function strengthOf(grade) {
        if (grade === ORIGIN_GRADES.PRIMARY) return 'strong';
        if (grade === ORIGIN_GRADES.SECONDARY) return 'medium';
        if (grade === ORIGIN_GRADES.RELAYED) return 'weak';
        return 'none';
    }

    /**
     * 归一一条子命题（claim）。
     * ★ 一个子命题只问一件事：多问就是两个命题，而多问的命题没法判「有没有答上」。
     */
    function normalizeClaim(raw) {
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
        if (!o) return null;
        const text = capStr(o.text || o.title, SOLVER_LIMITS.title);
        if (!text) return null;
        const evidenceIn = Array.isArray(o.evidence) ? o.evidence : [];
        const evidence = [];
        for (const e of evidenceIn.slice(0, SOLVER_LIMITS.evidencePerClaim)) {
            const n = normalizeEvidence(e);
            if (n.readable) evidence.push(n);
        }
        return {
            id: capStr(o.id, 60) || ('c_' + str(text).slice(0, 12)),
            text: text,
            actors: strList(o.actors, 8),
            /** 时间范围（楼层区间；null 段表示未约束，不是 0）。 */
            floorFrom: numOrNull(o.floorFrom),
            floorTo: numOrNull(o.floorTo),
            /** 本命题要求连到哪些其它命题（连接关系的声明侧）。 */
            requires: strList(o.requires, SOLVER_LIMITS.claims),
            evidence: evidence,
        };
    }
    function normalizeClaims(raw) {
        const out = [];
        if (!Array.isArray(raw)) return out;
        for (const c of raw.slice(0, SOLVER_LIMITS.claims)) {
            const n = normalizeClaim(c);
            if (n) out.push(n);
        }
        return out;
    }

    /* ---------- 子命题求证 ---------- */
    /**
     * 求证一条子命题（**只看本命题自己的证据**，不看别的命题的）。
     * ★ 判定序：
     *   1. 有反证且反证强度 ≥ 支持强度 ⇒ refuted（不是「undecided」：
     *      反证更强时结论是「这条被驳倒」，与「判不开」是两件事）。
     *   2. 无支持证据 ⇒ undecided（**不是** refuted：没有支持不等于被驳倒）。
     *   3. 有支持但缺连接（requires 的任一条没有可连接对象）⇒ conditional。
     *   4. 其余 ⇒ answered。
     */
    function judgeClaim(claim, ctx) {
        const support = [];
        const counter = [];
        for (const e of claim.evidence) {
            if (e.stance === STANCES.SUPPORT) support.push(e);
            else if (e.stance === STANCES.COUNTER) counter.push(e);
        }
        /* ★ 来源去重：同一份原文经甲转乙只算一条支持。
         *   去重键用 refId（不是 source+refId、也不是 quote）——
         *   quote 会被引用两次误计；source+refId 会把同一份原文的两种转述算成两份。 */
        const dedup = (arr) => {
            const seen = {};
            const out = [];
            for (const e of arr) {
                const k = e.refId;
                if (seen[k]) continue;
                seen[k] = 1;
                out.push(e);
            }
            return out;
        };
        const sup = dedup(support);
        const cnt = dedup(counter);
        const bestSup = topStrength(sup);
        const bestCnt = topStrength(cnt);
        const missing = [];
        for (const req of claim.requires) {
            if (!ctx.claimById[req]) missing.push({ id: req, why: 'claim-absent' });
        }
        /* ★ 独立原文下限只由**问题整体**施加（见 solve()）。
         *   单命题**不**设独立原文下限：一个子命题连到一处可信原文即可贡献「已答」，
         *   真正卡「至少三处独立原文才可答」的是整道题 ——
         *   子命题层面也设下限会把「各子命题都齐」误判成「整题不足三处」而吞掉答案。 */
        /* ★ 单命题自身独立原文数（诊断用）：此命题去重后连到的独立原文数。
         *   注意它**不是**整题门槛 —— 整题门槛由 solve() 在并集上施加。 */
        const independent = independentCount(sup, cnt);
        if (cnt.length && (!sup.length || rank(bestCnt) >= rank(bestSup))) {
            return {
                state: CLAIM_STATES.REFUTED,
                support: sup, counter: cnt, bestSupport: bestSup, bestCounter: bestCnt,
                missing: missing, strength: bestCnt, independent: independent,
            };
        }
        if (!sup.length) {
            return {
                state: CLAIM_STATES.UNDECIDED,
                support: sup, counter: cnt, bestSupport: bestSup, bestCounter: bestCnt,
                missing: missing, strength: 'none', independent: independent,
            };
        }
        if (missing.length) {
            return {
                state: CLAIM_STATES.CONDITIONAL,
                support: sup, counter: cnt, bestSupport: bestSup, bestCounter: bestCnt,
                missing: missing, strength: bestSup, independent: independent,
            };
        }
        return {
            state: CLAIM_STATES.ANSWERED,
            support: sup, counter: cnt, bestSupport: bestSup, bestCounter: bestCnt,
            missing: missing, strength: bestSup, independent: independent,
        };
    }
    function rank(s) {
        const i = STRENGTHS.indexOf(s);
        return i < 0 ? -1 : STRENGTHS.length - 1 - i;
    }
    function topStrength(arr) {
        let best = 'none';
        for (const e of arr) if (rank(e.strength) > rank(best)) best = e.strength;
        return best;
    }

/**
     * 统计**独立原文**数（★ 不是条数）。
     *
     * ★ 计划原文：「同一问题需连接至少三处独立原文才可答」+
     * 「不按重复转载数投票」。两句话要靠**同一个口径**落地：
     *   一份原文经甲转乙（同一 `refId`）只算**一处**独立原文。
     *   所以「三条转载」既不能投票取胜，也**永远凑不满**三处下限。
     *
     * ★ 计数单位是「独立原文对」而不是「独立来源」——
     *   同一份摘要里不同的两段（不同 refId）是**两处**独立原文，
     *   而同一段话被三家转发（同一 refId）只是**一处**。
     *
     * @param {Array} support 已去重的支持证据
     * @param {Array} counter 已去重的反证证据
     * @returns {number} 独立原文总数（支持 + 反证）
     */
    function independentCount(support, counter) {
        const seen = {};
        let n = 0;
        for (const arr of [support || [], counter || []]) {
            for (const e of arr) {
                /* ★ 去重键只用 refId：同一份原文（同一 refId）经甲转乙仍只算**一处**。
                 *   用 source+refId 会把「同一份原文的两种转述」数成两处，
                 *   正好放跑了计划原文点名的那条反模式。 */
                const k = e.refId;
                if (seen[k]) continue;
                seen[k] = 1;
                n += 1;
            }
        }
        return n;
    }

    /* ---------- 连接关系（★ 连接本身要能被回答） ---------- */
    /**
     * 计算子命题之间的连接。
     * ★ 只承认**显式声明的连接**（requires / links）**或**共享同一组人物的连接 ——
     *   绝不由「文本相似」自动连：相似只是弱信号，而计划原文要求
     *   「答案覆盖连接关系」，自动连出来的关系没法核查。
     *   缺连接 ⇒ broken（**不静默连上**：静默连上会造出一条不存在的因果链）。
     */
    function linkOf(a, b, ctx) {
        if (!a || !b) return { state: LINK_STATES.UNRELATED, why: 'not-found' };
        if (a.requires.indexOf(b.id) >= 0 || b.requires.indexOf(a.id) >= 0) {
            return { state: LINK_STATES.LINKED, why: 'declared' };
        }
        const explicit = ctx.links || {};
        const pair = [a.id, b.id].sort().join('\u0001');
        if (explicit[pair]) return { state: LINK_STATES.LINKED, why: str(explicit[pair]) };
        const shared = a.actors.filter(function (x) { return b.actors.indexOf(x) >= 0; });
        if (shared.length) return { state: LINK_STATES.LINKED, why: 'shared-actor:' + shared.join(',') };
        return { state: LINK_STATES.UNRELATED, why: 'no-link' };
    }

    /* ---------- 主入口：求解 ---------- */
    /**
     * 求解一个复杂问题。
     *
     * @param {object} raw  { question, claims:[...], links:{pair:why}, scope:{floorFrom,floorTo,actors} }
     * @param {object} [opts] { maxHops }
     * @returns {object} { ok, question, claims:[judged], links:[], conclusion:{state,missing}, hops, truncated, reason }
     */
    function solve(raw, opts) {
        const o = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : null;
        if (!o) return fail(SV_REASONS.NOT_OBJECT, o);
        const question = capStr(o.question, SOLVER_LIMITS.title);
        if (!question) return fail(SV_REASONS.NO_QUESTION, o);
        const claims = normalizeClaims(o.claims);
        if (!claims.length) return fail(SV_REASONS.NO_CLAIMS, o);
        const options = (opts && typeof opts === 'object') ? opts : {};
        const maxHops = Math.max(1, Math.min(SOLVER_LIMITS.maxHops, numOrNull(options.maxHops) || SOLVER_LIMITS.maxHops));

        const ctx = { claimById: {}, links: (o.links && typeof o.links === 'object') ? o.links : {} };
        for (const c of claims) ctx.claimById[c.id] = c;
        /* ★ 独立原文下限：默认 3（计划原文），可用 opts.minIndependent 覆写；0 = 不设下限。 */
        const minIndependentOpt = numOrNull(options.minIndependent);
        ctx.minIndependent = minIndependentOpt != null ? minIndependentOpt : SOLVER_LIMITS.minIndependent;

        /* ★ 范围过滤：在**求证之前**按范围裁证据。
         *   范围外的证据不进任何一条子命题的支撑 —— 否则「换时点后旧证据还在」
         *   就是最典型的假读数。 */
        const scope = o.scope && typeof o.scope === 'object' ? o.scope : {};
        const sFrom = numOrNull(scope.floorFrom);
        const sTo = numOrNull(scope.floorTo);
        const sActors = strList(scope.actors, 8);
        let outOfScope = 0;
        const scoped = claims.map(function (c) {
            const evidence = c.evidence.filter(function (e) {
                if (e.floor == null) return true; /* 无楼层证据不受楼层范围约束（不是「0 楼命中」）。 */
                if (sFrom != null && e.floor < sFrom) { outOfScope += 1; return false; }
                if (sTo != null && e.floor > sTo) { outOfScope += 1; return false; }
                return true;
            });
            return Object.assign({}, c, { evidence: evidence });
        });

        /* 多跳：BFS 展开 requires 链，最多 maxHops 跳。 */
        const hops = expandHops(scoped, ctx, maxHops);
        const used = hops.nodes;
        const judged = hops.nodes.map(function (c) { return judgeClaim(c, ctx); });

        /* 连接表：只在被求解到的节点之间算。 */
        const links = [];
        for (let i = 0; i < hops.nodes.length; i += 1) {
            for (let j = i + 1; j < hops.nodes.length; j += 1) {
                const l = linkOf(hops.nodes[i], hops.nodes[j], ctx);
                if (l.state === LINK_STATES.UNRELATED) continue;
                links.push({ from: hops.nodes[i].id, to: hops.nodes[j].id, state: l.state, why: l.why });
            }
        }

        /* 结论：整体状态由各子命题的最弱决定（★ 不按票数，多数票是计划原文点名的反模式）。 */
        const missing = [];
        for (let i = 0; i < judged.length; i += 1) {
            const j = judged[i];
            if (j.state !== CLAIM_STATES.ANSWERED) {
                missing.push({ claim: hops.nodes[i].id, why: j.state });
            }
            for (const m of j.missing) missing.push({ claim: hops.nodes[i].id, why: m.why });
        }
        const brokenLinks = links.filter(function (l) { return l.state === LINK_STATES.BROKEN; });
        const anyRefuted = judged.some(function (j) { return j.state === CLAIM_STATES.REFUTED; });
        const anyUndecided = judged.some(function (j) { return j.state === CLAIM_STATES.UNDECIDED; });
        /* ★ 整体独立原文数：各子命题的独立原文**并集**（跨命题的同一份原文只算一处）。
         *   分列而不相加：两个子命题引用同一份原文时，相加会把一处数成两处。
         *   去重键用 refId（不是 source+refId）：同一份原文经甲转乙仍只算一处。 */
        const unionSeen = {};
        let independentTotal = 0;
        for (const j of judged) {
            for (const arr of [j.support || [], j.counter || []]) {
                for (const e of arr) {
                    const k = e.refId;
                    if (unionSeen[k]) continue;
                    unionSeen[k] = 1;
                    independentTotal += 1;
                }
            }
        }
        const minIndependent = ctx.minIndependent;
        let conclusion;
        if (anyRefuted) {
            conclusion = { state: 'refuted', missing: missing };
        } else if (!judged.length) {
            conclusion = { state: 'no-answer', missing: missing };
        } else if (anyUndecided) {
            conclusion = { state: 'conditional', missing: missing };
        } else if (missing.length || brokenLinks.length) {
            conclusion = { state: 'conditional', missing: missing };
        } else if (minIndependent != null && minIndependent > 0 && independentTotal < minIndependent) {
            /* ★ 整体独立原文不足 ⇒ 条件结论（不给完整答案）。
             *   分列理由：子命题各自都齐 ≠ 这个问题连到了三处独立原文。 */
            conclusion = {
                state: 'conditional',
                missing: missing.concat([{ id: 'independent-sources', why: 'insufficient-independent', need: minIndependent, have: independentTotal }]),
            };
        } else {
            conclusion = { state: 'answered', missing: missing };
        }

        return {
            ok: true,
            reason: SV_REASONS.OK,
            question: question,
            claims: judged.map(function (j, i) {
                return {
                    id: hops.nodes[i].id,
                    text: hops.nodes[i].text,
                    state: j.state,
                    strength: j.strength,
                    support: j.support,
                    counter: j.counter,
                    supportCount: j.support.length,
                    counterCount: j.counter.length,
                    independent: j.independent || 0,
                };
            }),
            links: links,
            conclusion: conclusion,
            hops: hops.hops,
            truncated: hops.truncated,
            outOfScope: outOfScope,
            independent: independentTotal,
            minIndependent: (minIndependent != null && minIndependent > 0) ? minIndependent : 0,
            scope: { floorFrom: sFrom, floorTo: sTo, actors: sActors },
        };
    }
    function fail(reason, raw) {
        return {
            ok: false, reason: reason, question: '', claims: [], links: [],
            conclusion: { state: 'no-answer', missing: [] },
            hops: 0, truncated: false, outOfScope: 0,
            independent: 0, minIndependent: SOLVER_LIMITS.minIndependent,
            scope: { floorFrom: null, floorTo: null, actors: [] },
        };
    }

    /**
     * 多跳展开：从入口命题沿 requires 链 BFS。
     * ★ 上限 maxHops；超出时 truncated=true 且**报出实际跳数**。
     *   静默截断会让读数以为「全都查过了」。
     */
    function expandHops(claims, ctx, maxHops) {
        const byId = {};
        for (const c of claims) byId[c.id] = c;
        const roots = claims.filter(function (c) {
            return !claims.some(function (x) { return x.requires.indexOf(c.id) >= 0; });
        });
        const start = roots.length ? roots : claims.slice(0, 1);
        const seen = {};
        const nodes = [];
        let frontier = start.slice();
        for (const s of start) { seen[s.id] = 1; }
        let hops = 0;
        let truncated = false;
        while (frontier.length) {
            if (hops >= maxHops) { truncated = true; break; }
            const next = [];
            for (const c of frontier) {
                if (nodes.length >= SOLVER_LIMITS.nodes) { truncated = true; break; }
                nodes.push(c);
                for (const req of c.requires) {
                    const t = byId[req];
                    if (t && !seen[t.id]) { seen[t.id] = 1; next.push(t); }
                }
            }
            if (nodes.length >= SOLVER_LIMITS.nodes) { truncated = true; break; }
            frontier = next;
            hops += 1;
        }
        return { nodes: nodes, hops: hops, truncated: truncated };
    }

    /* ---------- 增量修改：改目标而非清空全部工作 ---------- */
    /**
     * 修改求解目标（时点 / 人物 / 命题文本）。
     * ★ 计划原文：「后续追问修改求解目标而非清空全部工作」。
     *   做法：**保留**原始 claims 与证据，只改范围与目标，然后**整份重求**。
     *   绝不把旧答案的**结论**拼进新答案 —— 结论是旧范围的产物。
     */
    function revise(prev, patch) {
        const p = (prev && typeof prev === 'object') ? prev : null;
        const q = (patch && typeof patch === 'object') ? patch : null;
        if (!p || !q) return { ok: false, reason: SV_REASONS.NOT_OBJECT, result: null };
        if (!p.__raw) return { ok: false, reason: SV_REASONS.BAD_SHAPE, result: null };
        const base = p.__raw;
        const next = {
            question: capStr(q.question || base.question, SOLVER_LIMITS.title),
            claims: Array.isArray(base.claims) ? base.claims.slice() : [],
            links: base.links && typeof base.links === 'object' ? base.links : {},
            scope: Object.assign({}, base.scope || {}),
        };
        if (q.floorFrom !== undefined) next.scope.floorFrom = numOrNull(q.floorFrom);
        if (q.floorTo !== undefined) next.scope.floorTo = numOrNull(q.floorTo);
        if (q.actors !== undefined) next.scope.actors = strList(q.actors, 8);
        if (q.claimId && q.claimText) {
            next.claims = next.claims.map(function (c) {
                if (!c || typeof c !== 'object') return c;
                if (str(c.id) !== str(q.claimId)) return c;
                return Object.assign({}, c, { text: capStr(q.claimText, SOLVER_LIMITS.title) });
            });
        }
        const result = solve(next, p.__opts || {});
        result.__raw = next;
        result.__opts = p.__opts || {};
        return { ok: true, reason: SV_REASONS.OK, result: result };
    }
    /** 给 solve 的结果挂上原始输入（revise 才有原料）。 */
    function withRaw(result, raw, opts) {
        if (!result || typeof result !== 'object') return result;
        result.__raw = raw;
        result.__opts = opts && typeof opts === 'object' ? opts : {};
        return result;
    }

    /* ---------- 读数 ---------- */
    /** 一行读数（诊断面）。 */
    function solverLine(raw) {
        try {
            const r = (raw && typeof raw === 'object') ? raw : {};
            if (!r.ok) return '求解器未判（' + str(r.reason || '未判') + '）';
            const claims = Array.isArray(r.claims) ? r.claims : [];
            let answered = 0, conditional = 0, undecided = 0, refuted = 0;
            let support = 0, counter = 0;
            for (const c of claims) {
                if (c.state === CLAIM_STATES.ANSWERED) answered += 1;
                else if (c.state === CLAIM_STATES.CONDITIONAL) conditional += 1;
                else if (c.state === CLAIM_STATES.UNDECIDED) undecided += 1;
                else refuted += 1;
                support += c.supportCount || 0;
                counter += c.counterCount || 0;
            }
            const parts = ['命题 ' + claims.length, '已答 ' + answered];
            if (conditional) parts.push('条件 ' + conditional);
            if (undecided) parts.push('未决 ' + undecided);
            if (refuted) parts.push('被驳 ' + refuted);
            parts.push('支持 ' + support, '反证 ' + counter);
            /* ★ 独立原文读数（不是条数）：转载不计数，故此数小于支持+反证是正常的。 */
            parts.push('独立原文 ' + (r.independent || 0));
            if (r.minIndependent) parts.push('下限 ' + r.minIndependent);
            const links = Array.isArray(r.links) ? r.links.length : 0;
            if (links) parts.push('连接 ' + links);
            parts.push('跳数 ' + (r.hops || 0));
            if (r.truncated) parts.push('（已截断）');
            return parts.join(' · ');
        } catch (e) { return '—（求解器异常）'; }
    }
    /** 自检（供宿主诊断面与判据调用；返回结构恒定）。 */
    function selfCheck() {
        const problems = [];
        /* ★ 基线用**三处独立原文**：默认下限是 3（计划原文「至少三处独立原文才可答」），
         *   用两处原文当基线会把「下限未达」误报成「两段齐备」。 */
        const base = {
            question: '为什么先答应又退出',
            claims: [
                { id: 'c1', text: '甲先答应', actors: ['甲'], evidence: [{ source: 'summary', refId: 's1', stance: 'support', grade: 'primary', floor: 10 }] },
                { id: 'c2', text: '甲随后退出', actors: ['甲'], evidence: [{ source: 'summary', refId: 's2', stance: 'support', grade: 'primary', floor: 20 }], requires: ['c1'] },
                { id: 'c3', text: '乙当时已知情', actors: ['乙'], evidence: [{ source: 'diary', refId: 'd1', stance: 'support', grade: 'primary', floor: 25 }], requires: ['c2'] },
            ],
        };
        const r = solve(base);
        if (!r.ok) problems.push('基本求解失败');
        if (r.conclusion.state !== 'answered') problems.push('三处独立原文齐备应判 answered');
        if (r.independent !== 3) problems.push('独立原文数应为 3（实为 ' + r.independent + '）');
        /* ★ 独立原文下限：只有两处 ⇒ 条件结论，且必须点名缺这一环 */
        const twoOnly = solve({
            question: 'x',
            claims: [{
                id: 'c1', text: 't',
                evidence: [
                    { source: 'summary', refId: 'a', stance: 'support', grade: 'primary' },
                    { source: 'summary', refId: 'b', stance: 'support', grade: 'primary' },
                ],
            }],
        });
        if (twoOnly.conclusion.state !== 'conditional') problems.push('不足三处独立原文必须判 conditional');
        if (!twoOnly.conclusion.missing.some((m) => m.why === 'insufficient-independent')) {
            problems.push('独立原文不足必须具名指出');
        }
        /* ★ 三条转载只算一处 ⇒ 永远凑不满下限（转载不得投票取胜，也不得凑数） */
        const relayed = solve({
            question: 'x',
            claims: [{
                id: 'c1', text: 't',
                evidence: [
                    { source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' },
                    { source: 'diary', refId: 'same', stance: 'support', grade: 'relayed' },
                    { source: 'floor', refId: 'same', stance: 'support', grade: 'relayed' },
                ],
            }],
        });
        if (relayed.independent !== 1) problems.push('三条转载只算一处独立原文（实为 ' + relayed.independent + '）');
        if (relayed.conclusion.state !== 'conditional') problems.push('转载凑不满独立原文下限');
        /* ★ 反证更强 ⇒ refuted，且**不修正**支持侧 */
        const withCounter = solve({
            question: 'x',
            claims: [{
                id: 'c1', text: 't',
                evidence: [
                    { source: 'summary', refId: 's1', stance: 'support', grade: 'secondary' },
                    { source: 'diary', refId: 'd1', stance: 'counter', grade: 'primary' },
                ],
            }],
        });
        if (withCounter.conclusion.state !== 'refuted') problems.push('更强反证应判 refuted');
        if (!withCounter.claims[0].support.length) problems.push('判驳后不许抹掉支持侧');
        /* 同源去重：三条转载只算一条 */
        const dup = solve({
            question: 'x',
            claims: [{
                id: 'c1', text: 't',
                evidence: [
                    { source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' },
                    { source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' },
                    { source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' },
                ],
            }],
        });
        if (dup.claims[0].supportCount !== 1) problems.push('同源转载必须去重');
        /* 无支持 ⇒ undecided（不是 refuted） */
        const none = solve({ question: 'x', claims: [{ id: 'c1', text: 't', evidence: [] }] });
        if (none.claims[0].state !== CLAIM_STATES.UNDECIDED) problems.push('无支持必须判 undecided 而不是 refuted');
        /* 缺环节 ⇒ conditional */
        const cond = solve({
            question: 'x',
            claims: [{ id: 'c1', text: 't', requires: ['nope'], evidence: [{ source: 's', refId: 'r', stance: 'support', grade: 'primary' }] }],
        });
        if (cond.conclusion.state !== 'conditional') problems.push('缺连接必须判 conditional');
        /* 范围外证据不进支撑 */
        const scoped = solve({
            question: 'x',
            scope: { floorFrom: 50 },
            claims: [{ id: 'c1', text: 't', evidence: [{ source: 's', refId: 'r', stance: 'support', grade: 'primary', floor: 10 }] }],
        });
        if (scoped.claims[0].supportCount !== 0) problems.push('范围外证据不得计入支撑');
        /* 缺双键的引用不可读 */
        if (normalizeEvidence({ source: 's', stance: 'support' }).readable !== false) {
            problems.push('缺 refId 的证据必须判不可读');
        }
        if (normalizeEvidence({ source: 's', refId: 'r' }).readable !== false) {
            problems.push('缺 stance 的证据必须判不可读');
        }
        return { ok: problems.length === 0, version: SV_VERSION, problems: problems };
    }

    const api = Object.freeze({
        normalizeEvidence, normalizeClaim, normalizeClaims,
        judgeClaim, linkOf, solve, revise, withRaw,
        solverLine, selfCheck, independentCount,
        CLAIM_STATES, STANCES, ORIGIN_GRADES, STRENGTHS, LINK_STATES, SV_REASONS, SOLVER_LIMITS,
        SV_VERSION, SV_KIND,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaEvidenceSolver = api; } catch (_e) { /* ignore */ }
    }
})(typeof window !== 'undefined' ? window : (typeof global !== 'undefined' ? global : null));
