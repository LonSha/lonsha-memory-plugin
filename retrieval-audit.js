/**
 * retrieval-audit.js — [v3.111 缝合] 召回自检（为什么这条记忆没被想起来）
 *
 * 【来源】缝合 m61-oss/st-bionic-memory（BME）retrieval/recall-candidate-packet.js 的
 *         collectVectorTailCandidates + maintenance/task-graph-stats.js 的
 *         listGraphTypeCounts / buildRelevantNodeReferenceMap / buildGraphOverview，
 *         按本插件工程规范重写为可测纯函数模块（零依赖、IIFE 双导出）。
 *
 * 【机制】本插件的召回链路很长：向量检索 → BM25 → 图谱扩散 → 各源合并 → 分层预算裁剪。
 *   一条记忆没被想起来时，无从判断是「根本没进索引」「进了但向量是降级空心向量」还是
 *   「进了候选但被预算裁掉」。bionic 的做法是先把**候选池的构成与缺陷**摊开：
 *     - vector-tail 候选：把「本该可召回、但因为索引脏/缺 embedding/维度错/未被索引」
 *       而掉出主链路的节点单独捞出来，并逐条标注原因；
 *     - 图谱统计总览：按类型计数 + 「与当前任务最相关的既有节点」引用表
 *       （稳定引用键 G1/G2…，供 prompt 与诊断共用同一套编号）。
 *
 *   本模块把这些重写为纯函数：
 *     auditVectorStore(vectors, opts)     —— 逐条体检 + 归因（missing-embedding /
 *                                            zero-vector / dimension-mismatch /
 *                                            duplicate-text / oversized-text /
 *                                            orphan-chunk / stale-access）
 *     planVectorTail(vault, opts)         —— 掉队候选清单（按 floor/importance 排序，
 *                                            带 channels 归因，可直接进候选池补召回）
 *     summarizeTypeCounts(nodes, schema)  —— 图谱节点按类型计数（schema 顺序优先，
 *                                            无 schema 时按类型名排序，确定性）
 *     createReferenceMap(nodes, opts)     —— 稳定引用键 [G1|事件] label (score=0.812)
 *     buildGraphOverview(...)             —— 统计总览文本（诊断/报告/提示词共用）
 *     summarizeAudit(...)                 —— 体检结论（覆盖率 / 问题分布 / 可恢复数）
 *
 * 【与源码差异】
 *   - 源码直接吃宿主 graph（含 vectorIndexState / archived / embedding 字段）；本实现
 *     只依赖传入数组的显式字段（embedding / text / metadata / floor / importance /
 *     timestamp / accessCount），字段名不匹配一律记入 reasons 而不抛错。
 *   - 源码 reasons 是固定几类；本实现扩展为七类，并且**不修改入参**（投影出新对象）。
 *   - 增加 summarizeAudit（源码无）：一次给出「索引覆盖率 / 问题分布 / 可恢复条数」，
 *     便于在设置面板与审计报告里回答「我的记忆库健康吗」。
 *   - 引用键编号规则与源码一致（prefix + 序号，序号从 1 起，按传入顺序），保证
 *     「同一批节点两次生成同一套编号」——prompt 里写过的 G3，在诊断里仍是同一条。
 */

(function (global) {
    'use strict';

    const DEFAULT_TYPE_LABELS = {
        event: '事件',
        character: '角色',
        location: '地点',
        rule: '规则',
        thread: '主线',
        synopsis: '全局概要',
        reflection: '反思',
        pov_memory: '主观记忆',
        quest: '任务',
    };

    const DEFAULT_REASONS = Object.freeze([
        'missing-embedding',    // 无向量（或空数组）
        'zero-vector',          // 向量存在但全零（退化向量 → 余弦恒 0，永远不召回）
        'dimension-mismatch',   // 维度与库基准不一致（跨模型换 embedding 后残留）
        'duplicate-text',       // 同文本重复条目（挤占容量）
        'oversized-text',       // 超长文本未分块（单条吃掉大量预算）
        'orphan-chunk',         // 分块组残缺（块数 < 声明总数）
        'stale-access',         // 长期未被访问且重要性低（可淘汰候选）
    ]);

    function normStr(v) {
        return String(v == null ? '' : v).replace(/\r\n/g, '\n').trim();
    }

    function normInt(v, fallback) {
        const n = Math.floor(Number(v));
        return Number.isFinite(n) ? n : fallback;
    }

    function num(v, fallback) {
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
    }

    // ---------- 向量库体检 ----------

    function vectorLength(v) {
        return Array.isArray(v && v.embedding) ? v.embedding.length : 0;
    }

    function isZeroVector(embedding) {
        if (!Array.isArray(embedding) || !embedding.length) return false;
        for (const x of embedding) { if (Number(x) !== 0) return false; }
        return true;
    }

    /**
     * 单条体检（纯函数，返回新对象）
     * @returns {{ id, text, floor, importance, reasons:string[], vectorLength:number, embeddingMissing:boolean }}
     */
    function auditVectorEntry(entry, options) {
        const o = options || {};
        const reasons = [];
        const id = normStr(entry && entry.id);
        const text = String((entry && entry.text) != null ? entry.text : '');
        const embedding = entry && entry.embedding;
        const expectedDim = normInt(o.expectedDimension, 0);
        const maxTextChars = normInt(o.maxTextChars, 0);
        const staleAfterMs = normInt(o.staleAfterMs, 0);
        const now = normInt(o.now, Date.now());
        const minImportance = num(o.staleMinImportance, 4);

        const len = vectorLength(entry);
        if (len === 0) reasons.push('missing-embedding');
        else {
            if (expectedDim > 0 && len !== expectedDim) reasons.push('dimension-mismatch');
            if (isZeroVector(embedding)) reasons.push('zero-vector');
        }
        if (maxTextChars > 0 && text.length > maxTextChars) reasons.push('oversized-text');

        const meta = (entry && entry.metadata) || {};
        const total = normInt(meta.chunkTotal, 0);
        if (total > 1) {
            // 分块组完整性：调用方传 chunkIndexesByGroup（{ chunkGroup: [已存在的 chunkIndex] }）
            // 若该组实际块数 < 声明的 chunkTotal，即视为残缺（丢块 → 语义被腰斩）
            const byGroup = (o.chunkIndexesByGroup && typeof o.chunkIndexesByGroup === 'object')
                ? o.chunkIndexesByGroup : null;
            const group = normStr(meta.chunkGroup);
            const present = byGroup && group && Array.isArray(byGroup[group]) ? byGroup[group].length : 0;
            if (byGroup && group && present > 0 && present < total) reasons.push('orphan-chunk');
        }

        if (staleAfterMs > 0) {
            const ts = normInt(entry && entry.timestamp, 0);
            const acc = normInt(entry && entry.accessCount, 0);
            const imp = num(entry && entry.importance, meta.importance != null ? meta.importance : 5);
            if (ts > 0 && (now - ts) > staleAfterMs && acc === 0 && imp < minImportance) reasons.push('stale-access');
        }

        return {
            id,
            text,
            floor: normInt(entry && (entry.floor != null ? entry.floor : meta.floor), 0),
            importance: num(entry && entry.importance, 5),
            vectorLength: len,
            embeddingMissing: len === 0,
            reasons,
        };
    }

    /**
     * 向量库整体体检
     * @returns {{ entries:Array, issueCounts:object, healthy:number, total:number, duplicateIds:string[] }}
     */
    function auditVectorStore(vectors, options) {
        const o = options || {};
        const list = Array.isArray(vectors) ? vectors : [];
        // 文本重复检测（确定性：「时间戳最早者胜；时间戳相同则先出现者胜」为保留者，
        // 其余同文本条目记 duplicate-text；因此重复集合与输入顺序无关）
        const groups = new Map();
        list.forEach((v, seq) => {
            const key = normStr(v && v.text);
            if (!key) return;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push({ id: normStr(v && v.id), ts: normInt(v && v.timestamp, 0), seq });
        });
        const keepIds = new Set();
        const duplicateIds = [];
        for (const rows of groups.values()) {
            if (rows.length === 1) continue;
            const sorted = rows.slice().sort((l, r) => {
                const lt = l.ts > 0 ? l.ts : Infinity;
                const rt = r.ts > 0 ? r.ts : Infinity;
                if (lt !== rt) return lt - rt;
                return l.seq - r.seq;
            });
            keepIds.add(sorted[0].id);
            for (const row of sorted.slice(1)) duplicateIds.push(row.id);
        }
        const dupSet = new Set(duplicateIds.filter(Boolean));

        const entries = [];
        const issueCounts = {};
        let healthy = 0;
        for (const v of list) {
            const row = auditVectorEntry(v, o);
            if (dupSet.has(row.id)) row.reasons.push('duplicate-text');
            for (const r of row.reasons) issueCounts[r] = (issueCounts[r] || 0) + 1;
            if (!row.reasons.length) healthy += 1;
            entries.push(row);
        }
        return { entries, issueCounts, healthy, total: list.length, duplicateIds: [...dupSet], duplicateKeptIds: [...keepIds].filter(Boolean) };
    }

    // ---------- 掉队候选清单（vector-tail） ----------

    /**
     * 捞出「该进候选池但被卡住」的条目，按 floor 降序 / importance 降序 / id 升序排列。
     * @returns {{ candidates:Array, channels:object }}
     */
    function planVectorTail(vault, options) {
        const o = options || {};
        const limit = Math.max(1, normInt(o.limit, 12));
        const audit = auditVectorStore(Array.isArray(vault) ? vault : (vault && Array.isArray(vault.vectors) ? vault.vectors : []), o);
        const exclude = new Set((Array.isArray(o.excludeIds) ? o.excludeIds : []).map(normStr).filter(Boolean));
        const wanted = new Set(Array.isArray(o.includeReasons) && o.includeReasons.length
            ? o.includeReasons.map(normStr)
            : DEFAULT_REASONS.filter(r => r !== 'duplicate-text' && r !== 'stale-access'));

        const flagged = audit.entries
            .filter((row) => row.reasons.some((r) => wanted.has(r)))
            .filter((row) => !exclude.has(row.id))
            .sort((l, r) => (r.floor - l.floor)
                || (r.importance - l.importance)
                || l.id.localeCompare(r.id, 'en'));

        const channels = {};
        for (const row of flagged) {
            for (const reason of row.reasons) {
                if (wanted.has(reason)) channels[reason] = (channels[reason] || 0) + 1;
            }
        }

        return {
            candidates: flagged.slice(0, limit).map((row, index) => ({
                id: row.id,
                text: row.text,
                floor: row.floor,
                importance: row.importance,
                reasons: row.reasons.slice(),
                channels: ['vector-tail', ...row.reasons.slice()],
                rank: index + 1,
            })),
            channels,
            flaggedTotal: flagged.length,
        };
    }

    // ---------- 图谱统计总览 ----------

    function typeLabelMap(schema) {
        const map = new Map();
        for (const def of (Array.isArray(schema) ? schema : [])) {
            const id = normStr(def && def.id);
            if (!id) continue;
            map.set(id, normStr(def && (def.label != null ? def.label : def.id)) || id);
        }
        return map;
    }

    function resolveTypeLabel(typeId, map) {
        const id = normStr(typeId);
        if (!id) return '节点';
        return map.get(id) || DEFAULT_TYPE_LABELS[id] || id;
    }

    /**
     * 按类型计数：有 schema 时按 schema 顺序（零计数剔除）；无 schema 时按类型名排序（确定性）。
     * @returns {Array<{typeId:string, label:string, count:number}>}
     */
    function summarizeTypeCounts(nodes, schema, options) {
        const list = (Array.isArray(nodes) ? nodes : []).filter((n) => n && !(n.archived === true));
        const o = options || {};
        const map = typeLabelMap(schema);
        const includeTypes = o.includeTypes !== false;
        const unknownLabel = normStr(o.unknownLabel) || '';
        if (Array.isArray(schema) && schema.length) {
            const rows = [];
            for (const def of schema) {
                const typeId = normStr(def && def.id);
                if (!typeId) continue;
                const count = list.filter((n) => normStr(n.type) === typeId).length;
                if (count > 0 || includeTypes === false) rows.push({ typeId, label: resolveTypeLabel(typeId, map), count });
            }
            return rows;
        }
        const counts = new Map();
        for (const n of list) {
            const typeId = normStr(n.type) || unknownLabel;
            if (!typeId) continue;
            counts.set(typeId, (counts.get(typeId) || 0) + 1);
        }
        return [...counts.entries()]
            .map(([typeId, count]) => ({ typeId, label: resolveTypeLabel(typeId, map), count }))
            .sort((l, r) => l.typeId.localeCompare(r.typeId, 'en'));
    }

    /** 标签裁剪：超长截断加省略号（保证引用清单行宽可控） */
    function clipLabel(label, maxLength) {
        const s = normStr(label);
        const cap = normInt(maxLength, 28);
        if (cap <= 0 || s.length <= cap) return s || '—';
        return s.slice(0, Math.max(1, cap - 1)) + '…';
    }

    /**
     * 稳定引用键表：G1/G2…（按传入顺序编号），供 prompt 与诊断共用同一套编号。
     * @param {Array} scoredNodes [{node|memoryId, score|weightedScore|finalScore, label|text}]
     * @returns {{ references:Array<{key,memoryId,label,typeLabel,score}>, byMemoryId:object }}
     */
    function createReferenceMap(scoredNodes, options) {
        const o = options || {};
        const prefix = normStr(o.prefix) || 'G';
        const maxCount = Math.max(1, normInt(o.maxCount, 6));
        const maxLength = normInt(o.maxLength, 28);
        const minScore = num(o.minScore, 0);
        const schemaMap = typeLabelMap(o.schema);

        const picked = (Array.isArray(scoredNodes) ? scoredNodes : [])
            .filter((entry) => {
                if (!entry) return false;
                const node = entry.node || entry;
                if (node.archived === true) return false;
                const score = num(entry.score != null ? entry.score : (entry.weightedScore != null ? entry.weightedScore : entry.finalScore), 0);
                return score > minScore;
            })
            .slice(0, maxCount);

        const references = picked.map((entry, index) => {
            const node = entry.node || entry;
            const score = num(entry.score != null ? entry.score : (entry.weightedScore != null ? entry.weightedScore : entry.finalScore), 0);
            const rawLabel = node.label != null ? node.label : (node.name != null ? node.name : (node.text != null ? node.text : entry.label));
            return {
                key: prefix + (index + 1),
                memoryId: normStr(node.id != null ? node.id : node.memoryId),
                label: clipLabel(rawLabel, maxLength),
                typeLabel: resolveTypeLabel(node.type, schemaMap),
                score: Math.round(score * 1000) / 1000,
            };
        });

        const byMemoryId = {};
        for (const ref of references) {
            if (ref.memoryId && byMemoryId[ref.memoryId] === undefined) byMemoryId[ref.memoryId] = ref.key;
        }
        return { references, byMemoryId };
    }

    /**
     * 图谱总览文本（诊断报告与提示词共用）
     * @returns {string} 空图返回空串
     */
    function buildGraphOverview(nodes, schema, referenceMap, options) {
        const o = options || {};
        const heading = normStr(o.heading) || '图谱节点统计';
        const relevantHeading = normStr(o.relevantHeading) || '与当前任务最相关的既有节点';
        const rows = summarizeTypeCounts(nodes, schema, o);
        if (!rows.length) return '';
        const lines = ['### ' + heading];
        for (const row of rows) lines.push('  - ' + row.label + ': ' + row.count);
        const refs = (referenceMap && Array.isArray(referenceMap.references)) ? referenceMap.references : [];
        if (refs.length) {
            lines.push('', '### ' + relevantHeading);
            for (const ref of refs) {
                lines.push('  - [' + ref.key + '|' + ref.typeLabel + '] ' + ref.label + ' (score=' + ref.score.toFixed(3) + ')');
            }
        }
        return lines.join('\n');
    }

    // ---------- 汇总 ----------

    function summarizeAudit(audit, options) {
        const o = options || {};
        const a = audit || {};
        const total = normInt(a.total, 0);
        const healthy = normInt(a.healthy, 0);
        const issueCounts = a.issueCounts || {};
        const blocksRecall = ['missing-embedding', 'zero-vector', 'dimension-mismatch'];
        let blocking = 0;
        for (const key of blocksRecall) blocking += normInt(issueCounts[key], 0);
        const topIssues = Object.keys(issueCounts)
            .map((reason) => ({ reason, count: normInt(issueCounts[reason], 0) }))
            .sort((l, r) => (r.count - l.count) || l.reason.localeCompare(r.reason, 'en'))
            .slice(0, normInt(o.topN, 6));
        return {
            total,
            healthy,
            unhealthy: Math.max(0, total - healthy),
            coverage: total ? Number((healthy / total).toFixed(4)) : 1,
            issueCounts,
            topIssues,
            blockingRecall: blocking,
            recoverable: blocking,
        };
    }

    const api = {
        DEFAULT_REASONS,
        DEFAULT_TYPE_LABELS,
        auditVectorEntry,
        auditVectorStore,
        planVectorTail,
        summarizeTypeCounts,
        createReferenceMap,
        buildGraphOverview,
        summarizeAudit,
        clipLabel,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaRetrievalAudit = api;
})(typeof window !== 'undefined' ? window : globalThis);