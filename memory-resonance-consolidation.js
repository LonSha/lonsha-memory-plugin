/* ============================================================
 * memory-resonance-consolidation.js
 * [v3.455.0 · V17 记忆能力超级加强：仿生记忆共振巩固与多跳推演召回引擎]
 *
 * 本模块是「记忆越用越强」的仿生生态闭环内核（零外部依赖、纯逻辑可单测）：
 *
 *  机制 1 · PEDSA 多跳激活扩散 (Multi-hop Activation Diffusion)
 *    E(j) = Σ E(i) × W_ij × decay + teleport·E_seed(j)
 *    - 双向关联边 + 时序合成边（相邻楼层弱连接 strength=0.2）
 *    - 抑制/矛盾边（edgeType 255 / contradicts）负能量 ×2.0 放大
 *    - 2 跳、衰减 0.6、teleport 0.15（PPR 式重启），输出归一化激活能
 *    ★ 补齐既有 personalizedPageRank「3 跳、无时序边、无抑制边」的推演深度缺口。
 *
 *  机制 2 · 访问强化生态循环 (Hebbian Access Reinforcement)
 *    被真正注入的记忆 accessCount+1、importance+0.1（上限 10）；
 *    配时间衰减 retention = 0.8 + 0.2/(1+ln(1+天))，旧记忆封底 0.8 不清零。
 *    ★ 补齐「长程记忆衰减正反馈循环欠缺」——形成 召回→注入→强化→下轮更易召回 的闭环。
 *
 *  机制 3 · 混合评分共振重排 (Hybrid Resonance Rescore)
 *    hybrid = 0.6×激活能 + 0.2×访问强化分 + 0.2×时间保留值
 *    只以有界小量叠加到 RRF 名次分（不推翻既有主排序，只动名次边界），就地改序。
 *
 *  状态机 createState / hydrateState：宽容解析、upgrade-on-read、绝不换命名空间
 *    （STBME 快照契约纪律）。状态由宿主经 extensions 命名空间随存档落盘，不改冻结顶层键。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMemoryResonance = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.455.0';

    const DEFAULTS = Object.freeze({
        decay: 0.6,                 // PEDSA 每跳能量衰减
        hops: 2,                    // 多跳扩散步数
        teleport: 0.15,             // PPR 式重启权重
        temporalStrength: 0.2,      // 时序合成边强度
        contradictGain: 2.0,        // 抑制边负能量放大
        wGraph: 0.6, wAccess: 0.2, wRetention: 0.2,   // 混合评分权重
        reinforceImportance: 0.1,   // 每次访问的重要性增量
        importanceMax: 10,
        rescoreBound: 0.01,         // 叠加到 rrfScore 的有界量（只动名次边界）
        maxStateNodes: 400          // 状态上限（防长线膨胀）
    });

    function numOr(v, fallback) {
        const n = Number(v);
        return (typeof v === 'object' || v == null || v === '' || !Number.isFinite(n)) ? fallback : n;
    }

    /** 时间衰减保留值：0.8 封底、永不清零（旧记忆仍可被多跳激活重新捞起）。 */
    function retentionValue(lastTs, nowTs) {
        const now = numOr(nowTs, Date.now());
        const last = numOr(lastTs, now);
        const days = Math.max(0, (now - last) / 86400000);
        return 0.8 + 0.2 / (1 + Math.log(1 + days));
    }

    /** 稳定身份键：优先 id / key，退到文本前 120 字（与宿主 hybridMerge 口径一致）。 */
    function identityOf(item) {
        if (item == null) return '';
        const k = item.id ?? item.key ?? item.name;
        if (k != null && k !== '') return String(k);
        return String(item.text ?? item.content ?? '').trim().slice(0, 120);
    }

    /**
     * 机制 1：PEDSA 多跳激活扩散。
     * @param {string[]} seedIds 引燃种子（图/BM25/角色动态供给，绝不硬编码具体角色名）
     * @param {Array} edges 图边 [{from,to,weight,edgeType?,type?,active?,validTo?}]
     * @param {Array} nodeFloors 时序节点 [{id,floor}]（相邻楼层自动合成弱边）
     * @param {object} opts
     * @returns {Map<string, number>} 归一化激活能（0~1）
     */
    function diffuseActivationEnergy(seedIds, edges, nodeFloors, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const energy = new Map();
        if (!Array.isArray(seedIds) || seedIds.length === 0) return energy;

        const adj = new Map();   // id -> [{to, w}]
        const addEdge = (a, b, w) => {
            if (a == null || b == null) return;
            const ka = String(a), kb = String(b);
            if (!ka || !kb) return;
            if (!adj.has(ka)) adj.set(ka, []);
            adj.get(ka).push({ to: kb, w });
        };

        for (const e of (Array.isArray(edges) ? edges : (edges && typeof edges.values === 'function' ? Array.from(edges.values()) : []))) {
            if (!e) continue;
            const a = e.from ?? e.source;
            const b = e.to ?? e.target;
            if (a == null || b == null) continue;
            let w = numOr(e.weight, 1);
            if (w <= 0) w = 1;
            // 抑制边：矛盾/撤回/已闭合历史关系 → 负能量并放大
            const suppress = (Number(e.edgeType) === 255 || e.type === 'contradicts' || e.superseded === true);
            if (suppress) w = -w * o.contradictGain;
            addEdge(a, b, w);
            addEdge(b, a, w);   // 记忆关联按双向处理（A 想起 B，B 亦可反燃 A）
        }

        // 时序合成边：按楼层排序，相邻记忆建立弱连接（STBME temporal_update 的轻量版）
        if (Array.isArray(nodeFloors) && nodeFloors.length > 1) {
            const sorted = nodeFloors.slice().sort((x, y) => numOr(x && x.floor, 0) - numOr(y && y.floor, 0));
            for (let i = 1; i < sorted.length; i++) {
                const a = sorted[i - 1] && (sorted[i - 1].id ?? sorted[i - 1].key);
                const b = sorted[i] && (sorted[i].id ?? sorted[i].key);
                addEdge(a, b, o.temporalStrength);
                addEdge(b, a, o.temporalStrength);
            }
        }

        const seedSet = new Set(seedIds.map(String).filter(Boolean));
        for (const s of seedSet) energy.set(s, 1.0);
        const base = new Map(energy);           // teleport 基能（种子不随跳数消散）
        let cur = new Map(energy);
        const hops = Math.max(1, Math.min(5, Math.floor(numOr(o.hops, DEFAULTS.hops))));
        const decay = numOr(o.decay, DEFAULTS.decay);
        const teleport = numOr(o.teleport, DEFAULTS.teleport);

        for (let h = 0; h < hops; h++) {
            const next = new Map();
            for (const [id, e] of cur) {
                for (const l of (adj.get(id) || [])) {
                    next.set(l.to, (next.get(l.to) || 0) + e * l.w * decay);
                }
            }
            for (const [id, e] of base) next.set(id, (next.get(id) || 0) + e * teleport);
            for (const [id, v] of next) energy.set(id, (energy.get(id) || 0) + v);
            cur = next;
        }

        // 归一化到 0~1（负能量 clamp 到 0：抑制边只削弱、不产生负分幻觉）
        let max = 0;
        for (const v of energy.values()) if (v > max) max = v;
        if (max > 0) for (const [id, v] of energy) energy.set(id, Math.max(0, v / max));
        return energy;
    }

    function createState() {
        return { version: VERSION, nodes: {}, rounds: 0, totalAccess: 0, lastReinforced: [] };
    }

    /** 宽容解析：未知字段保留、缺字段补默认、坏值不炸（upgrade-on-read，绝不换命名空间）。 */
    function hydrateState(raw) {
        const s = createState();
        if (!raw || typeof raw !== 'object') return s;
        if (raw.nodes && typeof raw.nodes === 'object' && !Array.isArray(raw.nodes)) {
            let count = 0;
            for (const [k, v] of Object.entries(raw.nodes)) {
                if (count >= DEFAULTS.maxStateNodes) break;
                if (!v || typeof v !== 'object') continue;
                s.nodes[String(k).slice(0, 160)] = {
                    accessCount: Math.max(0, numOr(v.accessCount, 0)),
                    lastAccessTs: numOr(v.lastAccessTs, Date.now()),
                    importance: Math.min(DEFAULTS.importanceMax, Math.max(0, numOr(v.importance, 5)))
                };
                count++;
            }
        }
        s.rounds = Math.max(0, numOr(raw.rounds, 0));
        s.totalAccess = Math.max(0, numOr(raw.totalAccess, 0));
        s.lastReinforced = Array.isArray(raw.lastReinforced) ? raw.lastReinforced.slice(0, 20).map(String) : [];
        return s;
    }

    /**
     * 机制 2：访问强化（正反馈回写）。就地更新 state，不做任何 IO。
     * @returns {{touched:number, capped:number, totalAccess:number, rounds:number}}
     */
    function reinforceOnAccess(state, accessedIds, nowTs, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        // 就地补齐：宿主持有的 state 引用永不替换，避免「强化了新对象、引擎仍持旧对象」的假回写。
        const s = (state && typeof state === 'object') ? state : createState();
        if (!s.nodes || typeof s.nodes !== 'object') s.nodes = {};
        if (!Array.isArray(s.lastReinforced)) s.lastReinforced = [];
        const ts = numOr(nowTs, Date.now());
        const ids = Array.isArray(accessedIds) ? accessedIds : [];
        let touched = 0, capped = 0;
        for (const raw of ids) {
            const id = String(raw ?? '').slice(0, 160);
            if (!id) continue;
            let n = s.nodes[id];
            if (!n || typeof n !== 'object') n = s.nodes[id] = { accessCount: 0, lastAccessTs: ts, importance: 5 };
            n.accessCount = Math.max(0, numOr(n.accessCount, 0)) + 1;
            n.lastAccessTs = ts;
            const prev = numOr(n.importance, 5);
            const nv = Math.min(o.importanceMax, prev + numOr(o.reinforceImportance, DEFAULTS.reinforceImportance));
            if (nv >= o.importanceMax && prev < o.importanceMax) capped++;
            n.importance = nv;
            touched++;
        }
        // 有界状态：超过上限时淘汰访问次数最低的节点（保留高频记忆）
        const keys = Object.keys(s.nodes);
        if (keys.length > o.maxStateNodes) {
            keys.sort((a, b) => numOr(s.nodes[a].accessCount, 0) - numOr(s.nodes[b].accessCount, 0));
            for (let i = 0; i < keys.length - o.maxStateNodes; i++) delete s.nodes[keys[i]];
        }
        s.rounds = Math.max(0, numOr(s.rounds, 0)) + 1;
        s.totalAccess = Math.max(0, numOr(s.totalAccess, 0)) + touched;
        s.lastReinforced = ids.slice(0, 20).map(x => String(x ?? ''));
        return { touched, capped, totalAccess: s.totalAccess, rounds: s.rounds };
    }

    function s_nodesOk(s) { return !!s.nodes && typeof s.nodes === 'object'; }

    /**
     * 机制 3：混合评分共振重排。就地叠加有界小分到 rrfScore 并排序（返回同一数组引用）。
     * @returns {{ordered:Array, stats:object}}
     */
    function rescoreByResonance(candidates, energyMap, state, nowTs, opts) {
        const o = Object.assign({}, DEFAULTS, opts || {});
        const list = Array.isArray(candidates) ? candidates : [];
        const E = (energyMap instanceof Map) ? energyMap : new Map();
        const nodes = (state && state.nodes) || {};
        const ts = numOr(nowTs, Date.now());
        const bound = Math.max(0, numOr(o.rescoreBound, DEFAULTS.rescoreBound));
        let boostApplied = 0, energyHits = 0, accessHits = 0;
        for (const c of list) {
            if (!c) continue;
            const id = identityOf(c);
            if (!id) continue;
            const e = E.get(id) || E.get(String(c.id ?? c.key ?? '')) || 0;
            const st = nodes[id];
            const acc = st ? Math.max(0, numOr(st.accessCount, 0)) : 0;
            const ret = st ? retentionValue(st.lastAccessTs, ts) : 1;
            const accessScore = Math.min(1, Math.log1p(acc) / Math.log(11));
            const hybrid = numOr(o.wGraph, 0.6) * Math.max(0, e)
                + numOr(o.wAccess, 0.2) * accessScore
                + numOr(o.wRetention, 0.2) * ret;
            const delta = hybrid * bound;
            if (delta > 0) {
                c.rrfScore = numOr(c.rrfScore, 0) + delta;
                c._resonanceScore = hybrid;
                boostApplied++;
                if (e > 0) energyHits++;
                if (acc > 0) accessHits++;
            }
        }
        if (boostApplied) list.sort((a, b) => numOr(b && b.rrfScore, 0) - numOr(a && a.rrfScore, 0));
        return {
            ordered: list,
            stats: {
                scanned: list.length, boostApplied, energyHits, accessHits,
                seeds: E.size, rounds: (state && state.rounds) || 0, bound
            }
        };
    }

    return Object.freeze({
        VERSION, DEFAULTS,
        numOr, retentionValue, identityOf,
        diffuseActivationEnergy,
        createState, hydrateState,
        reinforceOnAccess,
        rescoreByResonance
    });
}));
