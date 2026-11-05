/* ============================================================
 * past-event-narration-compare.js — [L14-X2] 同一往事的讲述差异逐段对照
 * ------------------------------------------------------------
 * 建立「原始物理证据 → 各角色主观讲述 → 差异句对照」的工作台引擎。
 *
 * 【核心设计与边界约束】
 *   1. 三层证据溯源（Three-tier Evidence Tracing）：
 *      - 原始事实底座（canonicalEvidence）：客观发生并持有证据引用的物理基准。
 *      - 角色多方讲述（narrations）：各人对该事件的主观表述（包含记忆偏差、美化或刻意回避）。
 *      - 逐段/差异句对照（segmentDiffs）：按句切分比对，标记一致（concordant）、分歧（disputed）、回避（evasive）、臆测（unsubstantiated）。
 *   2. 讲述与客观正史严格隔离（Narrations Never Upgrade to Canon）：
 *      - 玩家/角色编辑讲述内容，仅修改角色个人的叙述版本，决不自动篡改 canonicalEvidence。
 *      - 缺乏证据支撑的讲述句明确标为 unsubstantiated，不凭字面一致性升级为事实。
 *   3. 差异句回链与知情边界：
 *      - 每一讲述段落保留 `speaker`、`sourceRef` 与知情边界。
 *      - 点击任一差异句可精准反查其底层引用的物理证据片段 ID。
 *
 * 【数据模型】
 *   - 纯函数设计，不持有可变全局状态；入参校验 fail-closed。
 *   - CJS / IIFE 双导出，挂载至 root.LonShaPastEventNarrationCompare。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaPastEventNarrationCompare = factory();
        root.PastEventNarrationCompare = root.LonShaPastEventNarrationCompare;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const COMPARE_VERSION = '1.0.0';
    const COMPARE_KIND = 'past_event_narration_compare';

    const SEGMENT_STATUS = Object.freeze({
        CONCORDANT: 'concordant',         // 与证据及多方一致
        DISPUTED: 'disputed',             // 存在明确分歧/矛盾
        EVASIVE: 'evasive',               // 避重就轻/刻意隐瞒
        UNSUBSTANTIATED: 'unsubstantiated' // 缺乏原始证据依据
    });

    function text(val, maxLen = 300) {
        if (val == null) return '';
        const s = String(val).trim();
        return s.length > maxLen ? s.slice(0, maxLen) : s;
    }

    function safeArr(val) {
        return Array.isArray(val) ? val : [];
    }

    /**
     * 创建往事讲述对照工作台实例
     * @param {Object} rawEvent - 原始事实 { eventId, title, canonicalEvidence: [{ evidenceId, text, floor }] }
     */
    function createNarrationCompareSession(rawEvent = {}) {
        const eventId = text(rawEvent.eventId || rawEvent.id, 60);
        if (!eventId) {
            return { ok: false, reason: 'event-id-required', session: null };
        }

        const canonical = safeArr(rawEvent.canonicalEvidence).map((e, idx) => ({
            evidenceId: text(e.evidenceId || e.id || ('ev_' + (idx + 1)), 40),
            text: text(e.text || e.content, 500),
            floor: Number.isFinite(Number(e.floor)) ? Number(e.floor) : null
        })).filter(e => e.evidenceId && e.text);

        return {
            ok: true,
            session: {
                version: COMPARE_VERSION,
                kind: COMPARE_KIND,
                eventId: eventId,
                title: text(rawEvent.title || rawEvent.name, 100),
                canonicalEvidence: canonical,
                narrations: [], // [{ narrationId, speaker, stance, segments: [{ segmentId, text, evidenceRef, status }] }]
                segmentsDiff: []
            }
        };
    }

    /**
     * 添加或更新某角色的讲述
     * @param {Object} session - 对照实例
     * @param {Object} narrationInput - { speaker, text, segments, stance }
     */
    function addCharacterNarration(session, narrationInput = {}) {
        if (!session || !Array.isArray(session.canonicalEvidence)) {
            return { ok: false, reason: 'invalid-session' };
        }
        const speaker = text(narrationInput.speaker, 40);
        if (!speaker) {
            return { ok: false, reason: 'speaker-required' };
        }

        const rawSegments = safeArr(narrationInput.segments);
        // 若未提供切分好的 segments，则按句号/分号自动分句
        const segmentTexts = rawSegments.length > 0 
            ? rawSegments 
            : text(narrationInput.text, 2000).split(/[。；;\n]+/).map(s => s.trim()).filter(Boolean);

        const canonicalMap = new Map();
        for (const ev of session.canonicalEvidence) {
            canonicalMap.set(ev.evidenceId, ev);
        }

        const structuredSegments = segmentTexts.map((item, idx) => {
            const segText = typeof item === 'string' ? item : text(item.text, 200);
            const ref = typeof item === 'object' && item.evidenceRef ? text(item.evidenceRef, 40) : null;
            
            let status = SEGMENT_STATUS.UNSUBSTANTIATED;
            if (ref && canonicalMap.has(ref)) {
                // 如果指明了有效的物理证据引用，评估一致性
                const evObj = canonicalMap.get(ref);
                if (typeof item === 'object' && item.isEvasive) {
                    status = SEGMENT_STATUS.EVASIVE;
                } else if (typeof item === 'object' && item.isDisputed) {
                    status = SEGMENT_STATUS.DISPUTED;
                } else {
                    status = SEGMENT_STATUS.CONCORDANT;
                }
            }

            return {
                segmentId: 'seg_' + speaker + '_' + (idx + 1),
                text: segText,
                evidenceRef: ref,
                status: status,
                note: typeof item === 'object' ? text(item.note, 100) : ''
            };
        });

        const newNarration = {
            narrationId: 'narr_' + speaker,
            speaker: speaker,
            stance: text(narrationInput.stance || 'neutral', 30),
            segments: structuredSegments
        };

        const existingIdx = session.narrations.findIndex(n => n.speaker === speaker);
        const nextNarrations = session.narrations.slice();
        if (existingIdx >= 0) {
            nextNarrations[existingIdx] = newNarration;
        } else {
            nextNarrations.push(newNarration);
        }

        const updatedSession = Object.assign({}, session, {
            narrations: nextNarrations,
            segmentsDiff: computeSegmentsMatrix(session.canonicalEvidence, nextNarrations)
        });

        return {
            ok: true,
            narrationId: newNarration.narrationId,
            session: updatedSession
        };
    }

    /**
     * 计算多方讲述之间的差异对照矩阵
     */
    function computeSegmentsMatrix(canonicalEvidence, narrations) {
        if (!narrations || narrations.length === 0) return [];

        const diffRows = [];
        const maxSegments = Math.max(...narrations.map(n => n.segments.length));

        for (let i = 0; i < maxSegments; i++) {
            const row = {
                segmentIndex: i + 1,
                bySpeaker: {},
                hasDispute: false,
                hasUnsubstantiated: false
            };

            for (const n of narrations) {
                const seg = n.segments[i] || null;
                row.bySpeaker[n.speaker] = seg;
                if (seg) {
                    if (seg.status === SEGMENT_STATUS.DISPUTED) row.hasDispute = true;
                    if (seg.status === SEGMENT_STATUS.UNSUBSTANTIATED) row.hasUnsubstantiated = true;
                }
            }
            diffRows.push(row);
        }

        return diffRows;
    }

    /**
     * 尝试根据差异句回溯物理证据
     */
    function traceCanonicalEvidence(session, evidenceRef) {
        if (!session || !Array.isArray(session.canonicalEvidence)) return null;
        const ref = text(evidenceRef, 40);
        return session.canonicalEvidence.find(e => e.evidenceId === ref) || null;
    }

    /**
     * 自检函数
     */
    function pastEventCompareSelfCheck() {
        const sesRes = createNarrationCompareSession({
            eventId: 'ev_1',
            title: '雨夜集会',
            canonicalEvidence: [{ evidenceId: 'ev_101', text: '当晚20:00发生争吵', floor: 12 }]
        });
        if (!sesRes.ok) return { ok: false, reason: 'selfcheck-init-fail' };
        const add1 = addCharacterNarration(sesRes.session, {
            speaker: 'Alice',
            segments: [{ text: '我们在20点赶到并争执', evidenceRef: 'ev_101' }]
        });
        if (!add1.ok) return { ok: false, reason: 'selfcheck-add-fail' };
        return { ok: true, version: COMPARE_VERSION };
    }

    return {
        COMPARE_VERSION: COMPARE_VERSION,
        COMPARE_KIND: COMPARE_KIND,
        SEGMENT_STATUS: SEGMENT_STATUS,
        createNarrationCompareSession: createNarrationCompareSession,
        addCharacterNarration: addCharacterNarration,
        computeSegmentsMatrix: computeSegmentsMatrix,
        traceCanonicalEvidence: traceCanonicalEvidence,
        pastEventCompareSelfCheck: pastEventCompareSelfCheck
    };
}));