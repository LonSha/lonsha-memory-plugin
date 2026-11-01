/* ============================================================
 * counterfactual-experiment-bench.js — [L9-X4 · 第九期规划]
 * 受证据约束的反事实实验与推演隔离工作台（纯函数内核）
 * ------------------------------------------------------------
 * 【核心设计】
 *   允许用户或角色探索平行抉择，严格实施三层分离：
 *     1. FACT_BOUND: 由已知事实铁律约束的不可逾越边界
 *     2. PLAUSIBLE_DEDUCTION: 基于证据推演的高合理性走向
 *     3. FREE_PERFORMANCE: 纯演出的戏剧性推测
 *   所有实验强制在隔离分支运行，绝不静默写入正史 (Canon)。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CounterfactualExperimentBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const EXPERIMENT_LAYERS = Object.freeze({
        FACT_BOUND: 'fact_bound',
        PLAUSIBLE_DEDUCTION: 'plausible_deduction',
        FREE_PERFORMANCE: 'free_performance'
    });

    function createExperimentBranch(canonBaseFacts = [], hypothesis = {}) {
        const branchId = `cf_branch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        return {
            branchId,
            hypothesis: String(hypothesis.description || '').trim(),
            premiseChoiceId: hypothesis.choiceId || null,
            baseFactsCount: (Array.isArray(canonBaseFacts) ? canonBaseFacts : []).length,
            records: [],
            isIsolated: true,
            status: 'active'
        };
    }

    function addExperimentOutcome(branch, outcome = {}) {
        if (!branch || !branch.isIsolated) {
            return { success: false, reason: 'branch_not_isolated' };
        }
        const records = Array.isArray(branch.records) ? branch.records.slice() : [];
        const layer = Object.values(EXPERIMENT_LAYERS).includes(outcome.layer)
            ? outcome.layer
            : EXPERIMENT_LAYERS.FREE_PERFORMANCE;

        const record = {
            id: `rec_${Date.now()}`,
            statement: String(outcome.statement || '').trim(),
            layer,
            cannotPromoteToCanon: true, // 铁律门禁：反事实推演绝不可作为确认事实注入正史
            timestamp: Date.now()
        };

        records.push(record);
        return {
            ...branch,
            records
        };
    }

    /* ============================================================
     * [v3.433.0 · L13-X2] 反事实推演面：只读影响面计算（counterfactualImpact）
     * ------------------------------------------------------------
     * 计划 L13-X2 实测结论（读码复算，不是照名字猜）：本模块原有的
     *   createExperimentBranch / addExperimentOutcome 只管「隔离分支记账」，
     *   不回答「给定已发生事实 + 一个改动 -> 受影响的事实/关系/记忆集合」。
     *   本段补的就是这一个纯函数。三条纪律：
     *   ① 全程只读 —— 不写 engine/ctx 的任何槽位，返回体带 writesNothing: true；
     *   ② 推演结果全部标 hypothetical: true（根级 + 每条受影响条目各标一次），
     *      每条受影响条目带真实 id（ref），供面板「点开核对」；
     *   ③ 只回答「谁引用/描述过这条事实」（机制可见性），不编造剧情因果——
     *      因果归 FACT_BOUND / PLAUSIBLE_DEDUCTION 两层，纯戏剧推测层
     *      （FREE_PERFORMANCE）留给 LLM 侧，本函数不产。
     * ============================================================ */
    function cfSafeText(v, cap) {
        const s = String(v == null ? '' : v);
        const c = cap || 120;
        return s.length > c ? s.slice(0, c) + '…' : s;
    }

    function cfIdOf(it) {
        if (!it || typeof it !== 'object') return '';
        if (it.id != null && String(it.id) !== '') return String(it.id);
        if (it.key != null && String(it.key) !== '') return String(it.key);
        return '';
    }

    function cfTextOf(label, it) {
        if (!it || typeof it !== 'object') return '';
        if (label === 'locked') {
            /* [v3.433.0 自纠] lockedFacts 条目文本在 text 字段（settings-ui lockedfacts
             *   视图读 f.text），subject/predicate/value 全 undefined 时 join 出空串
             *   会把整池静默漏扫（首版冒烟实测：lf_9 含锚词却没进受影响集合）。 */
            return [it.text, it.subject, it.predicate, it.value, it.evidence]
                .map(x => String(x == null ? '' : x)).join(' ');
        }
        if (label === 'fact') {
            return [it.subject, it.predicate, it.value, it.evidence, it.source]
                .map(x => String(x == null ? '' : x)).join(' ');
        }
        if (label === 'node') {
            return [it.name, it.type, it.data && it.data.description]
                .map(x => String(x == null ? '' : x)).join(' ');
        }
        return [it.text, it.title, it.content, it.name, it.summary, it.desc]
            .map(x => String(x == null ? '' : x)).join(' ');
    }

    /* 收集全部只读数据池：既有槽位（不新开事实库），条目形态 {label, items} */
    function cfCollectPools(engine, ctx) {
        const pools = [];
        const push = (label, arr) => { if (Array.isArray(arr)) pools.push({ label, items: arr }); };
        const eng = (engine && typeof engine === 'object') ? engine : null;
        push('fact', eng && eng.worldProg && eng.worldProg.facts);
        push('locked', eng && eng.lockedFacts);
        const nodes = eng && eng.graph ? eng.graph.nodes : null;
        if (Array.isArray(nodes)) push('node', nodes);
        else if (nodes && typeof nodes.values === 'function') push('node', Array.from(nodes.values()));
        const mems = eng && eng.memories;
        if (mems && typeof mems === 'object') {
            const flat = [];
            for (const char of Object.keys(mems)) {
                const c = mems[char];
                if (!c || typeof c !== 'object') continue;
                for (const arr of ['core', 'recent']) {
                    if (Array.isArray(c[arr])) for (const m of c[arr]) if (m) flat.push(m);
                }
            }
            push('memory', flat);
        }
        if (ctx && ctx !== engine) {
            push('ctx-fact', ctx.facts);
            push('ctx-item', ctx.items);
        }
        return pools;
    }

    /* 锚点词项：优先用事实的 subject/predicate/value/evidence，自由文本则取最长的几个词 */
    function cfTermsOf(fact) {
        if (fact && typeof fact === 'object') {
            const t = [fact.subject, fact.predicate, fact.value, fact.evidence]
                .map(v => String(v == null ? '' : v).trim())
                .filter(v => v.length >= 2);
            if (t.length) return t;
        }
        const s = String(fact == null ? '' : fact).trim();
        if (s.length < 2) return [];
        const words = s.split(/[\s，。；、！？,.!?;:："'「」『』（）()\[\]【】]+/).filter(w => w.length >= 2);
        words.sort((a, b) => b.length - a.length);
        return words.slice(0, 8);
    }

    function counterfactualImpact(hypothesis, ctx) {
        const C = (ctx && typeof ctx === 'object') ? ctx : {};
        const eng = (C.engine && typeof C.engine === 'object') ? C.engine : null;
        const hyp = (typeof hypothesis === 'string') ? { description: hypothesis } : (hypothesis || {});
        const base = {
            ok: false, reason: '', hypothetical: true, writesNothing: true,
            factId: '', matchedFact: null, terms: [],
            affected: [], poolsScanned: 0, scannedCount: 0,
            layers: { FACT_BOUND: 0, PLAUSIBLE_DEDUCTION: 0, FREE_PERFORMANCE: 0 }
        };
        try {
            const factRef = String(hyp.factId || hyp.fact || '').trim();
            const desc = cfSafeText(hyp.description || '', 300);
            if (!factRef && !desc) return Object.assign(base, { reason: 'hypothesis-required' });
            // 找锚点事实（在既有槽位里找，绝不新建）
            let anchor = null;
            if (factRef) {
                for (const pool of cfCollectPools(eng, C)) {
                    const hit = pool.items.find(it => cfIdOf(it) === factRef);
                    if (hit) { anchor = { id: factRef, label: pool.label, item: hit }; break; }
                }
                if (!anchor) return Object.assign(base, { reason: 'fact-not-found' });
            }
            const terms = cfTermsOf(anchor ? anchor.item : desc);
            if (!terms.length) return Object.assign(base, { reason: 'no-searchable-terms' });
            base.factId = anchor ? anchor.id : '';
            base.matchedFact = anchor ? { id: anchor.id, label: anchor.label, preview: cfSafeText(cfTextOf(anchor.label, anchor.item)) } : null;
            base.terms = terms.slice();
            // 全池扫描：谁提到过锚点词项，谁进受影响集合
            const seen = new Set();
            const affected = [];
            for (const pool of cfCollectPools(eng, C)) {
                base.poolsScanned++;
                base.scannedCount += pool.items.length;
                for (const it of pool.items) {
                    const id = cfIdOf(it);
                    if (!id || seen.has(id)) continue;
                    if (anchor && id === anchor.id) continue; // 锚点自身不算「受影响」
                    const text = cfTextOf(pool.label, it);
                    if (!text) continue;
                    const hitTerm = terms.find(t => text.indexOf(t) >= 0);
                    if (!hitTerm) continue;
                    seen.add(id);
                    const layer = (pool.label === 'fact' || pool.label === 'locked')
                        ? 'fact_bound' : 'plausible_deduction';
                    affected.push({
                        ref: id, id: id, pool: pool.label, layer: layer,
                        term: hitTerm, preview: cfSafeText(text), hypothetical: true
                    });
                }
            }
            for (const a of affected) {
                if (a.layer === 'fact_bound') base.layers.FACT_BOUND++;
                else base.layers.PLAUSIBLE_DEDUCTION++;
            }
            affected.sort((x, y) => (x.layer === y.layer
                ? (y.term.length - x.term.length)
                : (x.layer === 'fact_bound' ? -1 : 1)));
            base.ok = true;
            base.affected = affected;
            return base;
        } catch (e) {
            return Object.assign(base, { reason: 'thrown: ' + ((e && e.message) || e) });
        }
    }

    return {
        EXPERIMENT_LAYERS,
        createExperimentBranch,
        addExperimentOutcome,
        counterfactualImpact
    };
}));