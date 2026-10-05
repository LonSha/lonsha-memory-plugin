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

    /* [v3.275.0] O5：产物「依据」（入选条目 id）的**容量上界**与截断自述。
     *   为什么需要这一格：宿主此前把 id 清单 `.slice(0, 200)` 静默截断后落进产物，
     *   产物于是声称「这一轮的入选依据就是这 200 条」—— 而真候选更多时，
     *   多出来的那部分**在产物里根本不存在**，`isArtifactStale` 的 missing/ratio
     *   也只在那 200 条上算。规模上升时这条读数会静默变窄（不是变错，是变窄）。
     *   本模块只负责**如实自述**：`selectedMemoryIdsTotal` 为真总数、
     *   `selectedMemoryIdsTruncated` 为是否被截。两者**不可从保留数倒推** ——
     *   调用方不传总数时记 null（不可测），绝不写成「保留数即总数」。 */
    const MAX_SELECTED_IDS = 200;

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

    /* [v3.275.0] O5 自纠：**「总数未知」只能有一个入口**。
     *   修前本文件三处各写一遍 `Number(x.selectedMemoryIdsTotal)` ——
     *   而 `Number(null) === 0` 是 finite，于是「调用方没给总数」被读成「总数 = 0」，
     *   截断态随之塌陷成 `false`（**不可测被写成「没截」**，方向与本版要治的正好相反）。
     *   形态与 v3.224 在 ledger-replay 修的 `Number(f) || 0`、本轮 archive-shift 的 `toNum`
     *   同族：拿原参数直接 Number()，没给就退化成 0。故口径收进一处，三处调用。
     *   口径：只认非负数字与非空数字字符串（给 0 照常是 0）；其余一律 null＝不可测。
     *   「按面值取、只向上补到保留数」：不静默下调 —— 下调会把「被截」读成「没截」。 */
    function selectedTotalOf(v, keptLen) {
        const raw = (typeof v === 'number') ? v
            : ((typeof v === 'string' && v.trim() !== '') ? Number(v) : null);
        if (raw === null || !Number.isFinite(raw) || raw < 0) return null;
        return Math.max(keptLen || 0, Math.floor(raw));
    }

    /** 截断态：三态（true / false / null＝总数未知，不倒推）。 */
    function selectedTruncOf(v, keptLen) {
        const t = selectedTotalOf(v, keptLen);
        return (t === null) ? null : (t > (keptLen || 0));
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
        /* 去重后再截：先截后去重会让「总数」与「保留数」的口径不一致（重复项算不算占位）。 */
        const _selectedAll = Array.isArray(s.selectedMemoryIds)
            ? [...new Set(s.selectedMemoryIds.map(normStr).filter(Boolean))] : [];
        const selected = _selectedAll.slice(0, MAX_SELECTED_IDS);
        /* 真总数优先取调用方给的（它才知道上游有没有截过）；没给就是**不可测**（null），
         *   不拿保留数冒充总数 —— 那是把「测不了」写成「就这么点」。
         *   给了但比保留数还小时按保留数算（调用方自相矛盾时以**能证实的**下界为准，
         *   且该情形本身由 truncated 如实反映）。 */
        const selectedTotal = selectedTotalOf(s.selectedMemoryIdsTotal, selected.length);
        const selectedTruncated = selectedTruncOf(s.selectedMemoryIdsTotal, selected.length);
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
            selectedMemoryIds: selected,
            selectedMemoryIdsTotal: selectedTotal,
            selectedMemoryIdsTruncated: selectedTruncated,
            sourceKinds: Array.isArray(s.sourceKinds) ? [...new Set(s.sourceKinds.map(normStr).filter(Boolean))] : [],
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

    /** 依据有效性校验（产物引用的记忆若已消失，则产物不应继续复用） */
    function isArtifactStale(artifact, liveIds, options) {
        const o = options || {};
        const art = artifact || {};
        const ids = Array.isArray(art.selectedMemoryIds) ? art.selectedMemoryIds.filter(Boolean) : [];
        /* [v3.275.0] O5：判据的**覆盖范围**必须随读数一起给出。
         *   产物若被截过（清单只剩前 N 条），missing/ratio 就只是「这 N 条里丢了多少」，
         *   不能读成「这一轮的依据丢了多少」—— 规模越大，这条读数越是**窄的**。
         *   故 stale 的判定仍只用现有清单（判据不变），但把覆盖范围与是否截断一并外供；
         *   `selectedTotal` 为 null（调用方没给总数）时同样如实记 null，不倒推。 */
        const _selTotal = selectedTotalOf(art.selectedMemoryIdsTotal, ids.length);
        /* 三态：显式 true 就是 true；其余一律由**总数**派生 ——
         *   总数未知时记 null（**不得塌陷成 false**）。修前这里是
         *   `(field === true) || (_selTotal !== null && _selTotal > ids.length)`：
         *   总数未知时整条为 false —— 「测不了」被读成「没截」，与 O5 要治的方向相反。 */
        const _selTrunc = (art.selectedMemoryIdsTruncated === true) ? true
            : selectedTruncOf(art.selectedMemoryIdsTotal, ids.length);
        const _cover = { checked: ids.length, selectedTotal: _selTotal, truncated: _selTrunc };
        if (!ids.length) return { stale: false, checked: 0, missing: [], ratio: 0, selectedTotal: _selTotal, truncated: _selTrunc }; 
        const live = liveIds instanceof Set ? liveIds
            : new Set((Array.isArray(liveIds) ? liveIds : []).map(normStr).filter(Boolean));
        const missing = ids.filter(id => !live.has(normStr(id)));
        const ratio = Number((missing.length / ids.length).toFixed(4));
        const threshold = Number.isFinite(Number(o.staleRatio)) ? Number(o.staleRatio) : 0.5;
        return {
            stale: missing.length > 0 && ratio >= threshold,
            checked: ids.length,
            missing: missing.slice(0, 64),
            ratio,
            /* 覆盖范围：截断时 ratio 只代表**清单内**的缺失率（窄读数，必须能被读出来）。 */
            selectedTotal: _cover.selectedTotal,
            truncated: _cover.truncated,
        };
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
            selectedMemoryIdsTotal: selectedTotalOf(artifact.selectedMemoryIdsTotal, (artifact.selectedMemoryIds || []).length),
            /* 三态原样传递：字段缺失（旧产物）时从总数派生，总数也没有就记 null。 */
            selectedMemoryIdsTruncated: (artifact.selectedMemoryIdsTruncated === true) ? true
                : ((artifact.selectedMemoryIdsTruncated === false) ? false
                    : selectedTruncOf(artifact.selectedMemoryIdsTotal, (artifact.selectedMemoryIds || []).length)),
            sourceKinds: (artifact.sourceKinds || []).slice(),
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
        /* [v3.275.0] O5：**依据清单被截过的产物**必须能被数出来。
         *   只报「总 N 条」会把「其中 M 条的入选依据只剩前 200 条」藏掉 ——
         *   而规模越大这个 M 越大，正是长线里该被看见的那一类窄读数。 */
        let truncatedCount = 0;
        let selectedKnown = 0;
        let selectedTotal = 0;
        for (const a of list) {
            reuses += Number(a.reuseCount || 0);
            chars += String(a.injectionText || '').length;
            if (a.empty) empties += 1;
            const _n = Array.isArray(a.selectedMemoryIds) ? a.selectedMemoryIds.length : 0;
            const _t = selectedTotalOf(a.selectedMemoryIdsTotal, _n);
            if (_t !== null) { selectedKnown += 1; selectedTotal += _t; }
            else selectedTotal += _n;
            const _tr = (a.selectedMemoryIdsTruncated === true) ? true
                : ((a.selectedMemoryIdsTruncated === false) ? false : (_t !== null && _t > _n));
            if (_tr === true) truncatedCount += 1;
        }
        return {
            total: list.length,
            reuses,
            fresh: list.length,
            empties,
            avgInjectionChars: list.length ? Math.round(chars / list.length) : 0,
            hitRate: (list.length + reuses) > 0 ? Number((reuses / (list.length + reuses)).toFixed(4)) : 0,
            /* 依据清单：被截过的条数 / 总数已知的条数 / 依据条目数合计（截断时是下界）。 */
            selectedTruncatedCount: truncatedCount,
            selectedTotalKnown: selectedKnown,
            selectedIdsSum: selectedTotal,
        };
    }

    const api = {
        DEFAULT_MAX_ENTRIES,
        DEFAULT_MAX_AGE_MS,
        MAX_SELECTED_IDS,
        stableStringify,
        hash32,
        createInputFingerprint,
        createArtifact,
        findReusableArtifact,
        planCommitArtifact,
        invalidateTurn,
        pruneArtifacts,
        isArtifactStale,
        toRecallResult,
        summarizeArtifacts,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaRecallArtifact = api;
})(typeof window !== 'undefined' ? window : globalThis);