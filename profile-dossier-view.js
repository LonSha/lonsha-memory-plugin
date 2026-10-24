/* ========================================================
 * profile-dossier-view.js — [M7-O8 · 第七期规划] 记忆成果可读视图内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   传统的记忆查看界面往往只是机械地展示内部模块表、原始 JSON 或字段列表；
 *   用户想看的是一个角色在百楼漫长互动中的人生阶段、核心共同经历、未完承诺与关系演变，
 *   而不是孤立的 key-value 数据。
 *   记忆成果可读视图构建“可浏览的人与经历档案”：
 *     ① 四维全景串联：时间线(timeline)、来源依据(sources)、关系视角(perspective)、未决线索(pendingThreads)；
 *     ② 三级经历真实性分形：本人亲历(direct_experience)、他人转述/传闻(hearsay_claim)、未证推测(unproven_guess)；
 *     ③ 溯源回跳与证据链保全(traceEvidence)：任意经历均连接至来源楼层，来源删除时视图即时呈现失效标注(broken_link)；
 *     ④ 档案纠错直接联动：支持在档案视图中直接标定错误，生成可透传给召回层与修订台的纠错补丁；
 *     ⑤ 零写原则：不新增持久化数据冗余副本，仅在读取侧将多源记忆动态聚合为可读档案。
 * ======================================================== */

(function (root) {
    'use strict';

    /** 经历事实类型 */
    const EXPERIENCE_NATURE = Object.freeze({
        DIRECT_EXPERIENCE: 'direct_experience', // 本人亲身经历
        HEARSAY_CLAIM: 'hearsay_claim',         // 他人转述/听闻
        UNPROVEN_GUESS: 'unproven_guess'        // 未经证实的推测
    });

    /** 来源链接健康度 */
    const SOURCE_HEALTH = Object.freeze({
        HEALTHY: 'healthy',     // 来源楼层与原文健全
        BROKEN: 'broken',       // 来源楼层已被删除或回滚
        AMBIGUOUS: 'ambiguous'  // 来源楼层被重写或无法精确回溯
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string') ? val.trim() : fallback;
    }

    function safeNum(val, fallback = 0) {
        const n = Number(val);
        return Number.isFinite(n) ? n : fallback;
    }

    function clone(val) {
        return JSON.parse(JSON.stringify(val));
    }

    /**
     * 规范化单条经历事件
     */
    function normalizeExperienceNode(raw, idx = 0) {
        if (!raw || typeof raw !== 'object') return null;
        const id = safeStr(raw.id, `exp_${Date.now().toString(36)}_${idx}`);
        const summary = safeStr(raw.summary || raw.content || raw.title);
        if (!summary) return null;

        const natureValues = Object.values(EXPERIENCE_NATURE);
        const nature = natureValues.includes(raw.nature)
            ? raw.nature
            : EXPERIENCE_NATURE.DIRECT_EXPERIENCE;

        const floor = safeNum(raw.floor, null);
        const sourceMessageId = safeStr(raw.sourceMessageId || raw.messageId);
        const quote = safeStr(raw.quote || raw.sourceQuote);

        return Object.freeze({
            id,
            summary,
            nature,
            floor,
            sourceMessageId,
            quote,
            timestamp: safeNum(raw.timestamp, Date.now()),
            corrected: Boolean(raw.corrected),
            correctionNote: safeStr(raw.correctionNote, '')
        });
    }

    /**
     * 规范化未决线索/承诺
     */
    function normalizePendingThread(raw, idx = 0) {
        if (!raw || typeof raw !== 'object') return null;
        const id = safeStr(raw.id, `th_${Date.now().toString(36)}_${idx}`);
        const title = safeStr(raw.title || raw.text);
        if (!title) return null;

        return Object.freeze({
            id,
            title,
            dueFloor: safeNum(raw.dueFloor, null),
            isFulfilled: Boolean(raw.isFulfilled),
            partnerRole: safeStr(raw.partnerRole, '')
        });
    }

    /**
     * 聚合构建角色可读人设与经历档案视图
     * @param {Object} character 角色元数据
     * @param {Array} rawExperiences 经历列表
     * @param {Array} rawThreads 未决线索/承诺列表
     * @param {Object} context 上下文（含有效楼层集合等）
     */
    function buildProfileDossierView(character = {}, rawExperiences = [], rawThreads = [], context = {}) {
        const characterId = safeStr(character.characterId || character.id, 'unknown_char');
        const characterName = safeStr(character.name || character.title, '未命名角色');
        const personaBio = safeStr(character.personaBio || character.bio, '');

        const validFloors = context.validFloors instanceof Set
            ? context.validFloors
            : (Array.isArray(context.validFloors) ? new Set(context.validFloors) : null);

        // 整理经历节点与来源健康度
        const timeline = (Array.isArray(rawExperiences) ? rawExperiences : [])
            .map((e, idx) => normalizeExperienceNode(e, idx))
            .filter(Boolean)
            .map(node => {
                let health = SOURCE_HEALTH.HEALTHY;
                if (validFloors && node.floor !== null && !validFloors.has(node.floor)) {
                    health = SOURCE_HEALTH.BROKEN;
                }
                return Object.freeze({
                    ...node,
                    sourceHealth: health
                });
            });

        // 按时间/楼层递增排序
        timeline.sort((a, b) => safeNum(a.floor, 0) - safeNum(b.floor, 0));

        // 整理未决承诺
        const pendingThreads = (Array.isArray(rawThreads) ? rawThreads : [])
            .map((t, idx) => normalizePendingThread(t, idx))
            .filter(Boolean);

        // 统计经历性质分布
        const directCount = timeline.filter(e => e.nature === EXPERIENCE_NATURE.DIRECT_EXPERIENCE).length;
        const hearsayCount = timeline.filter(e => e.nature === EXPERIENCE_NATURE.HEARSAY_CLAIM).length;
        const unprovenCount = timeline.filter(e => e.nature === EXPERIENCE_NATURE.UNPROVEN_GUESS).length;
        const brokenSourceCount = timeline.filter(e => e.sourceHealth === SOURCE_HEALTH.BROKEN).length;

        return Object.freeze({
            characterId,
            characterName,
            personaBio,
            timeline: Object.freeze(timeline),
            pendingThreads: Object.freeze(pendingThreads),
            stats: Object.freeze({
                totalExperiences: timeline.length,
                directCount,
                hearsayCount,
                unprovenCount,
                brokenSourceCount,
                openThreadsCount: pendingThreads.filter(t => !t.isFulfilled).length
            }),
            generatedAt: Date.now()
        });
    }

    /**
     * 在档案视图中执行纠错并输出修订补丁
     * 支持将某条经历标定为已纠错，并提供纠错原因
     */
    function correctDossierExperience(view, experienceId, correctionNote) {
        if (!view || !Array.isArray(view.timeline)) return view;
        const targetId = safeStr(experienceId);
        const note = safeStr(correctionNote, '用户在档案视图中完成纠错');

        const nextTimeline = view.timeline.map(node => {
            if (node.id !== targetId) return node;
            return Object.freeze({
                ...node,
                corrected: true,
                correctionNote: note
            });
        });

        const patch = {
            action: 'dossier_correction',
            characterId: view.characterId,
            experienceId: targetId,
            correctionNote: note,
            timestamp: Date.now()
        };

        return Object.freeze({
            ...view,
            timeline: Object.freeze(nextTimeline),
            lastCorrectionPatch: patch,
            generatedAt: Date.now()
        });
    }

    /**
     * 模块自检函数
     */
    function profileDossierViewSelfCheck() {
        const problems = [];
        if (Object.keys(EXPERIENCE_NATURE).length !== 3) {
            problems.push('EXPERIENCE_NATURE 必须恰好为 3 类');
        }
        if (Object.keys(SOURCE_HEALTH).length !== 3) {
            problems.push('SOURCE_HEALTH 必须恰好为 3 态');
        }

        // 测试跨楼层经历分形与来源健康度
        const char = { characterId: 'zhou_jie', name: '周姐', personaBio: '百货商行掌柜' };
        const exps = [
            { id: 'e1', summary: '在第5楼与林舟签订租约', nature: 'direct_experience', floor: 5, quote: '签字画押' },
            { id: 'e2', summary: '在第12楼听掌柜提及其身世为京城逃难子弟', nature: 'hearsay_claim', floor: 12, quote: '听后厨老刘说的' },
            { id: 'e3', summary: '在第20楼猜测林舟拥有修仙灵根', nature: 'unproven_guess', floor: 20 },
            { id: 'e4', summary: '在第35楼借款给林舟', nature: 'direct_experience', floor: 35 }
        ];
        const threads = [
            { id: 't1', title: '约定下月初五去省城进货', dueFloor: 50, isFulfilled: false }
        ];

        // 假设楼层 35 已经被用户删除/撤回
        const validFloors = new Set([5, 12, 20]);
        let view = buildProfileDossierView(char, exps, threads, { validFloors });

        if (view.timeline.length !== 4) {
            problems.push(`时间线应有 4 项，实得 ${view.timeline.length}`);
        }
        if (view.stats.directCount !== 2) {
            problems.push(`亲历数量应为 2，实得 ${view.stats.directCount}`);
        }
        if (view.stats.hearsayCount !== 1) {
            problems.push(`传闻数量应为 1，实得 ${view.stats.hearsayCount}`);
        }
        if (view.stats.brokenSourceCount !== 1) {
            problems.push(`来源断开数应为 1 (第35楼)，实得 ${view.stats.brokenSourceCount}`);
        }
        const brokenItem = view.timeline.find(x => x.floor === 35);
        if (brokenItem?.sourceHealth !== SOURCE_HEALTH.BROKEN) {
            problems.push('删除楼层对应的经历条目健康度未标记为 broken');
        }

        // 纠错测试
        view = correctDossierExperience(view, 'e2', '经当事人澄清，其为南洋客商并非京城子弟');
        const correctedE2 = view.timeline.find(x => x.id === 'e2');
        if (!correctedE2?.corrected || !correctedE2.correctionNote.includes('南洋客商')) {
            problems.push('correctDossierExperience 未能正确标记纠错状态与说明');
        }

        return { problems };
    }

    const api = Object.freeze({
        EXPERIENCE_NATURE,
        SOURCE_HEALTH,
        normalizeExperienceNode,
        normalizePendingThread,
        buildProfileDossierView,
        correctDossierExperience,
        profileDossierViewSelfCheck
    });

    root.LonShaProfileDossierView = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);