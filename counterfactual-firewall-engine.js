/* ============================================================
 * counterfactual-firewall-engine.js — [L20-3 · 第二十期史诗级双项目双计划]
 * 反事实假想沙盒防火墙与正史隔离网关 (Counterfactual Branch Firewall Engine)
 * ------------------------------------------------------------
 * 【核心设计】
 *   解决长程叙事中「反事实假设、梦境、平行脑补渗透污染正史事实」的重大痛点：
 *   1. 假想沙盒隔离（Virtual Branch Containment）：
 *      为所有 counterfactual、what-if、dream、hallucination 记忆打上强制虚拟分支标记与沙盒作用域；
 *   2. 正史穿透拦截网关（Canonical Boundary Firewall）：
 *      在进入正史记忆提取、因果推演或世界观事实生成时，严格过滤未坍缩为正史的假想分支；
 *   3. 现实折射与回响投射（Safe Echo Projection）：
 *      仅在符合特定角色心理独白（如深夜自省、醉酒梦呓）且经过严格沙盒安全壳包装后，
 *      才允许以「内心假想/悔恨暗涌」的副文本形式受控透出，绝不修改正史事实图谱。
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCounterfactualFirewall = factory();
        root.CounterfactualFirewallEngine = root.LonShaCounterfactualFirewall;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const BRANCH_STATUS = Object.freeze({
        SANDBOXED: 'sandboxed',       // 沙盒隔离中，禁止进入正史
        COLLAPSED: 'collapsed',       // 已经坍缩为正史事实
        DISCARDED: 'discarded'        // 已证伪并废弃
    });

    /**
     * 创建反事实防火墙隔离沙盒状态
     */
    function createInitialFirewallState() {
        return {
            virtualBranches: new Map(), // branchId -> branchInfo
            canonicalWallActive: true,
            quarantineLog: [],
            updatedAt: Date.now()
        };
    }

    /**
     * 包装反事实假想记忆条目，附加安全隔离壳
     * @param {Object} rawBranch - 原始假想分支数据
     * @returns {Object} 带有沙盒安全壳的分支条目
     */
    function registerSandboxedBranch(state, rawBranch = {}) {
        if (!state || !state.virtualBranches) return null;
        const branchId = String(rawBranch.id || `cf_branch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
        const actor = String(rawBranch.actorId || rawBranch.actor || 'narrator').trim();
        const hypothesis = String(rawBranch.hypothesis || rawBranch.unpickedRoad || rawBranch.imaginedConsequence || '').trim();
        const anchorEventId = rawBranch.anchorEventId || rawBranch.anchorFloor || null;
        
        const branchEntry = {
            id: branchId,
            actorId: actor,
            hypothesis,
            anchorEventId,
            status: BRANCH_STATUS.SANDBOXED,
            isCanonical: false, // 强制非正史
            allowEchoProjection: rawBranch.allowEchoProjection !== false,
            echoKeywords: Array.isArray(rawBranch.echoKeywords) ? rawBranch.echoKeywords.map(k => String(k).trim()).filter(Boolean) : ['如果当初', '后悔', '倘若', '平行线'],
            createdAt: Date.now()
        };

        state.virtualBranches.set(branchId, branchEntry);
        state.updatedAt = Date.now();
        return branchEntry;
    }

    /**
     * 过滤记忆候选集，拦截并隔离反事实条目流入正史上下文
     * @param {Object} state - 防火墙状态
     * @param {Array} candidateMemories - 待召回记忆条目列表
     * @param {Object} queryContext - 当前召回查询上下文
     * @returns {Object} { cleanMemories: Array, quarantinedCount: number, echoDirectives: Array<string> }
     */
    function sanitizeCanonicalCandidates(state, candidateMemories = [], queryContext = {}) {
        if (!Array.isArray(candidateMemories)) {
            return { cleanMemories: [], quarantinedCount: 0, echoDirectives: [] };
        }
        if (!state || state.canonicalWallActive === false) {
            return { cleanMemories: [...candidateMemories], quarantinedCount: 0, echoDirectives: [] };
        }

        const clean = [];
        let quarantinedCount = 0;
        const echoDirectives = [];
        const currentQuery = String(queryContext.query || queryContext.text || '').toLowerCase();
        const currentActor = String(queryContext.actorName || queryContext.speaker || '').trim();

        for (const mem of candidateMemories) {
            const isSandboxed = mem.isSandboxed === true || 
                mem.isCanonical === false || 
                mem.type === 'counterfactual' || 
                mem.type === 'what_if_branch';
            
            if (isSandboxed) {
                quarantinedCount++;
                state.quarantineLog.push({
                    memoryId: mem.id || mem.key || 'unknown',
                    timestamp: Date.now(),
                    reason: 'Contained within virtual branch firewall'
                });

                // 检查是否满足安全折射回响条件（仅限同角色且触发回忆关键词，以心声引导而非客观事实流出）
                const matchActor = !mem.actorId || !currentActor || mem.actorId.toLowerCase() === currentActor.toLowerCase();
                const triggers = Array.isArray(mem.echoKeywords) ? mem.echoKeywords : ['如果当初', '悔恨', '倘若'];
                const matchTrigger = triggers.some(t => currentQuery.includes(t.toLowerCase()));

                if (matchActor && matchTrigger && mem.allowEchoProjection !== false) {
                    echoDirectives.push(`【内心假想折射·非客观事实】${currentActor || '角色'}深层心智正涌现未竟抉择的假想：“${mem.hypothesis || mem.text || '倘若当初有另一重抉择'}”，仅供内心反思与神态流露，绝非已发生的客观正史。`);
                }
            } else {
                clean.push(mem);
            }
        }

        return {
            cleanMemories: clean,
            quarantinedCount,
            echoDirectives
        };
    }

    /**
     * 宽容水合反事实防火墙状态
     */
    function hydrateFirewallState(raw = {}) {
        const state = createInitialFirewallState();
        if (!raw || typeof raw !== 'object') return state;

        state.canonicalWallActive = raw.canonicalWallActive !== false;
        if (Array.isArray(raw.virtualBranches)) {
            for (const b of raw.virtualBranches) {
                if (b && b.id) state.virtualBranches.set(b.id, b);
            }
        } else if (raw.virtualBranches && typeof raw.virtualBranches === 'object') {
            for (const [k, v] of Object.entries(raw.virtualBranches)) {
                if (v && typeof v === 'object') state.virtualBranches.set(k, v);
            }
        }

        if (Array.isArray(raw.quarantineLog)) {
            state.quarantineLog = raw.quarantineLog.slice(-50);
        }

        state.updatedAt = Number(raw.updatedAt) || Date.now();
        return state;
    }

    /**
     * 序列化反事实防火墙状态
     */
    function serializeFirewallState(state) {
        if (!state) return { virtualBranches: [], canonicalWallActive: true, quarantineLog: [], updatedAt: Date.now() };
        const branches = [];
        if (state.virtualBranches instanceof Map) {
            for (const b of state.virtualBranches.values()) {
                branches.push(b);
            }
        }
        return {
            virtualBranches: branches,
            canonicalWallActive: state.canonicalWallActive !== false,
            quarantineLog: Array.isArray(state.quarantineLog) ? state.quarantineLog.slice(-50) : [],
            updatedAt: state.updatedAt || Date.now()
        };
    }

    return {
        BRANCH_STATUS,
        createInitialFirewallState,
        registerSandboxedBranch,
        sanitizeCanonicalCandidates,
        hydrateFirewallState,
        serializeFirewallState
    };
}));
