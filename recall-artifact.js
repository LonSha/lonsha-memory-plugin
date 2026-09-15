/**
 * recall-artifact.js — [v3.109 缝合] 逐轮召回产物复用（轮次版本指纹 + 复用判据 + 老化清理）
 *
 * 【来源】缝合 m61-oss/st-bionic-memory（BME）domain/turn-artifact.js 与 domain/memory-id.js，
 *         按本插件工程规范重写为可测纯函数模块（零依赖、IIFE 双导出、时间/指纹可注入）。
 *
 * 【机制】本插件已有 `_recallCache`（v2.9 RU-D）做「同楼同查询重 roll 复用」，判据是
 *   三元组 floor + queryKey + 消息指纹（v3.89）。bionic 的 turn-artifact 把这件事
 *   做成了**可持久化的产物（artifact）**，多出三样东西恰好补上现有实现的三个洞：
 *     ① 复用判据不止「位置 + 文本」，还包含**历史指纹**（historyFingerprint）：
 *        楼层位置与查询都没变，但更早的历史被编辑过（swipe 上游楼 / 删楼回填）时，
 *        现有 cache 会照旧复用陈旧注入——这是真实的错误来源；
 *     ② 复用的是**产物本身**（injectionText / selectedIds / 来源标记），而不是
 *        临时对象；因此可以跨会话持久化、可以审计「这条注入是怎么来的」；
 *     ③ 复用后仍要校验**依据是否还有效**（memoryStateFingerprint）：被引用的记忆
 *        已消失时，产物应当判为不可复用，而不是继续注入不存在的记忆。
 *   本模块把这些做成纯函数：
 *     - createInputFingerprint：把「用户消息 + 近期消息 + 历史指纹」hash 成一个输入指纹
 *     - findReusableArtifact：四重命中（turnId → artifactKind → inputFingerprint →
 *       historyFingerprint），任一不符即视为不可复用；额外要求 stateFingerprint 一致
 *     - planCommitArtifact：命中即复用（reused=true，不产生新条目）；未命中则新建并
 *       替换同 turnId 的旧产物（同轮只保留最新版本）
 *     - invalidateTurn / pruneArtifacts：删楼与容量控制（默认 32 条 / 7 天）
 *     - toRecallResult：产物 → 召回结果形状（与外层消费方契约一致）
 *     - summarizeArtifacts：命中率诊断（复用次数 / 新鲜次数 / 平均注入长度）
 *
 * 【与源码差异】
 *   - 源码把产物写进 ledger 事务（appendMemoryLedgerTransaction）；本实现是纯函数，
 *     存储交给调用方（数组进 chatMetadata），与既有 _recallCache 生命周期解耦。
 *   - 源码的 expectedMemoryStateFingerprint 不匹配时**抛冲突错**；本实现默认返回
 *     reusable=false 并由调用方决定是否重算（缓存路径不该因缓存失效而抛错）。
 *   - 增加 pruneArtifacts / summarizeArtifacts（源码无），用于长期运行的内存控制。
 */

(function (global) {
    'use strict';

    const DEFAULT_MAX_ENTRIES = 32;
    const DEFAULT_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

    function normStr(v) {
        return String(v == null ? '' : v).trim();
    }

    function normTime(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
    }

    /** 确定性序列化（对象键逐层字典序；undefined 剔除） */
    function stableStringify(value) {
        if (value === null || typeof value !== 'object') {
            if (typeof value === 'bigint') return JSON.stringify(String(value));
            const s = JSON.stringify(value);
            return s === undefined ? 'null' : s;
        }
        if (Array.isArray(value)) {
            return '[' + value.map(stableStringify).join(',') + ']';
        }
        const parts = Object.keys(value).sort().filter(k => value[k] !== undefined)
            .map(k => JSON.stringify(k) + ':' + stableStringify(value[k]));
        return '{' + parts.join(',') + '}';
    }

    /** FNV-1a 32bit（十六进制 8 位） */
    function hash32(input) {
        const s = String(input == null ? '' : input);
        let h = 0x811c9dc5;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
        }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    /**
     * 输入指纹：同一轮次版本（用户消息 + 近期消息 + 历史指纹）→ 同一指纹。
     * CRLF 归一 + trim，避免换行风格差异造成假失效。
     */
    function createInputFingerprint(input) {
        const s = input || {};
        const norm = (t) => String(t == null ? '' : t).replace(/\r\n/g, '\n').trim();
        const recent = Array.isArray(s.recentMessages)
            ? s.recentMessages.map(norm).filter(Boolean)
            : [];
        return hash32(stableStringify({
            turnId: normStr(s.turnId),
            userMessage: norm(s.userMessage),
            recentMessages: recent,
            historyFingerprint: normStr(s.historyFingerprint),
        }));
    }

    /** 新建产物（校验必需字段；输入指纹缺省时按内容派生） */
    function createArtifact(raw) {
        const s = raw || {};
        const turnId = normStr(s.turnId);
        if (!turnId) throw new TypeError('artifact requires turnId');
        const artifactKind = normStr(s.artifactKind) || 'recall';
        const inputFingerprint = normStr(s.inputFingerprint)
            || createInputFingerprint({
                turnId,
                userMessage: s.userMessage,
                recentMessages: s.recentMessages,
                historyFingerprint: s.historyFingerprint,
            });
        const injectionText = String(s.injectionText == null ? '' : s.injectionText);
        const selected = Array.isArray(s.selectedMemoryIds) ? s.selectedMemoryIds.map(normStr).filter(Boolean) : [];
        return {
            artifactId: normStr(s.artifactId) || (artifactKind + '_' + inputFingerprint),
            turnId,
            artifactKind,
            inputFingerprint,
            historyFingerprint: normStr(s.historyFingerprint),
            stateFingerprint: normStr(s.stateFingerprint),
            floor: Number.isFinite(Number(s.floor)) ? Math.floor(Number(s.floor)) : null,
            empty: injectionText.trim().length === 0,
            injectionText,
            selectedMemoryIds: [...new Set(selected)],
            candidateCount: Number.isFinite(Number(s.candidateCount)) ? Math.max(0, Math.floor(Number(s.candidateCount))) : 0,
            source: normStr(s.source) || 'recall',
            createdAt: normTime(s.createdAt, Date.now()),
            reuseCount: Number.isFinite(Number(s.reuseCount)) ? Math.max(0, Math.floor(Number(s.reuseCount))) : 0,
        };
    }

    function listOf(store) {
        if (Array.isArray(store)) return store;
        if (store && Array.isArray(store.artifacts)) return store.artifacts;
        return [];
    }

    function matchKey(a, b) {
        return normStr(a.turnId) === normStr(b.turnId)
            && normStr(a.artifactKind) === normStr(b.artifactKind)
            && normStr(a.inputFingerprint) === normStr(b.inputFingerprint);
    }

    /**
     * 查找可复用产物：四重命中 + 可选状态指纹校验。
     * @returns {{ artifact:object|null, reason:string }}
     * reason: hit | no-turn | no-kind | input-changed | history-changed | state-changed | empty
     */
    function findReusableArtifact(store, want) {
        const w = want || {};
        const list = listOf(store);
        if (!list.length) return { artifact: null, reason: 'no-turn' };
        const candidates = list.filter(a => matchKey(a, w));
        if (!candidates.length) return { artifact: null, reason: 'input-changed' };
        const why = candidates[0];
        const expectHistory = normStr(w.historyFingerprint);
        const expectState = normStr(w.stateFingerprint);
        for (const a of candidates) {
            if (expectHistory && normStr(a.historyFingerprint) !== expectHistory) continue;
            if (expectState && normStr(a.stateFingerprint) !== expectState) continue;
            if (w.allowEmpty === true || !a.empty) return { artifact: a, reason: 'hit' };
        }
        if (expectHistory && candidates.every(a => normStr(a.historyFingerprint) !== expectHistory)) {
            return { artifact: null, reason: 'history-changed' };
        }
        if (expectState && candidates.every(a => normStr(a.stateFingerprint) !== expectState)) {
            return { artifact: null, reason: 'state-changed' };
        }
        return { artifact: null, reason: why.empty ? 'empty' : 'input-changed' };
    }

    /**
     * 规划一次产物提交：命中即复用（不新增），未命中则新建并替换同轮旧版本。
     * 纯函数：返回新数组，入参不被修改。
     * @returns {{ store:Array, artifact:object, reused:boolean, reason:string, replaced:number }}
     */
    function planCommitArtifact(store, input) {
        const s = input || {};
        const candidate = createArtifact(s);
        const found = findReusableArtifact(store, Object.assign({}, s, {
            turnId: candidate.turnId,
            artifactKind: candidate.artifactKind,
            inputFingerprint: candidate.inputFingerprint,
            historyFingerprint: candidate.historyFingerprint,
            stateFingerprint: candidate.stateFingerprint,
        }));
        const list = listOf(store).slice();
        if (found.artifact) {
            const idx = list.indexOf(found.artifact);
            if (idx >= 0) {
                list[idx] = Object.assign({}, found.artifact, {
                    reuseCount: Number(found.artifact.reuseCount || 0) + 1,
                    lastReusedAt: normTime(s.now, Date.now()),
                });
                return { store: list, artifact: list[idx], reused: true, reason: 'hit', replaced: 0 };
            }
            return { store: list, artifact: found.artifact, reused: true, reason: 'hit', replaced: 0 };
        }
        // 同轮同 kind 的旧版本被替换（同轮只保留最新产物）
        let replaced = 0;
        const kept = [];
        for (const a of list) {
            if (a && normStr(a.turnId) === candidate.turnId && normStr(a.artifactKind) === candidate.artifactKind) {
                replaced += 1;
                continue;
            }
            kept.push(a);
        }
        kept.push(candidate);
        return { store: kept, artifact: candidate, reused: false, reason: found.reason, replaced };
    }

    /** 删楼/编辑：作废某轮产物（返回新数组） */
    function invalidateTurn(store, turnId) {
        const id = normStr(turnId);
        const before = listOf(store);
        const after = before.filter(a => !a || normStr(a.turnId) !== id);
        return { store: after, removed: before.length - after.length };
    }

    /** 容量 + 老化清理（默认保留最近 32 条 / 7 天；返回新数组） */
    function pruneArtifacts(store, options) {
        const o = options || {};
        const now = normTime(o.now, Date.now());
        const maxEntries = Number.isFinite(Number(o.maxEntries)) && Number(o.maxEntries) > 0
            ? Math.floor(Number(o.maxEntries)) : DEFAULT_MAX_ENTRIES;
        const maxAgeMs = Number.isFinite(Number(o.maxAgeMs)) && Number(o.maxAgeMs) >= 0
            ? Number(o.maxAgeMs) : DEFAULT_MAX_AGE_MS;
        const list = listOf(store).filter(a => a && (now - Number(a.createdAt || 0)) <= maxAgeMs);
        const removedByAge = listOf(store).length - list.length;
        list.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
        const kept = list.slice(0, maxEntries).slice().sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
        return { store: kept, removedByAge, removedByCap: list.length - kept.length };
    }

    /** 产物 → 召回结果形状（外层消费方契约） */
    function toRecallResult(artifact) {
        if (!artifact) return null;
        return {
            status: 'completed',
            reused: true,
            artifactId: artifact.artifactId,
            turnId: artifact.turnId,
            inputFingerprint: artifact.inputFingerprint,
            historyFingerprint: artifact.historyFingerprint,
            stateFingerprint: artifact.stateFingerprint,
            floor: artifact.floor,
            empty: artifact.empty,
            selectedMemoryIds: (artifact.selectedMemoryIds || []).slice(),
            candidateCount: artifact.candidateCount,
            injectionText: artifact.injectionText,
            source: artifact.source,
        };
    }

    /** 命中率诊断 */
    function summarizeArtifacts(store) {
        const list = listOf(store).filter(Boolean);
        let reuses = 0;
        let chars = 0;
        let empties = 0;
        for (const a of list) {
            reuses += Number(a.reuseCount || 0);
            chars += String(a.injectionText || '').length;
            if (a.empty) empties += 1;
        }
        return {
            total: list.length,
            reuses,
            fresh: list.length,
            empties,
            avgInjectionChars: list.length ? Math.round(chars / list.length) : 0,
            hitRate: (list.length + reuses) > 0 ? Number((reuses / (list.length + reuses)).toFixed(4)) : 0,
        };
    }

    const api = {
        DEFAULT_MAX_ENTRIES,
        DEFAULT_MAX_AGE_MS,
        stableStringify,
        hash32,
        createInputFingerprint,
        createArtifact,
        findReusableArtifact,
        planCommitArtifact,
        invalidateTurn,
        pruneArtifacts,
        toRecallResult,
        summarizeArtifacts,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaRecallArtifact = api;
})(typeof window !== 'undefined' ? window : globalThis);