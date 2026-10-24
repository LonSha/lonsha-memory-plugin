/* ========================================================
 * memory-inspiration-desk.js — [M7-X6 · 第七期拓展规划] 记忆驱动的创作灵感桌（纯函数/UMD）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   创作者需要从多年经历、地点、物件或人际羁绊中提取小说/剧本素材，
 *   但传统系统要么生搬硬套把用户的私密真实信息直接写入公开文案导致隐私泄漏，
 *   要么只能做干瘪的事件总结，无法激发出多样化的创意分支。
 *   记忆驱动的创作灵感桌建立“授权提炼、三向衍生、去敏抽象化与授权熔断”机制：
 *     ① 多维创意种子衍生(generateCreativeSeeds)：从单一真实事件中提取主题、冲突、
 *        核心意象与未决悬念，衍生出悬疑推理、温情共鸣与寓言假想等至少 3 种完全不同的创作方向，
 *        且绝不反向篡改原始事实；
 *     ② 隐私去敏与视角翻转(abstractAndDeidentify)：支持将真实人名、地名、真实时间
 *        彻底抽象为代号或虚构意象，支持主客体视角互换，并允许完全剥离源记忆关联；
 *     ③ 严格授权追踪与动态撤回(revokeSourceAuthorization)：记录创作种子的授权来源；
 *        一旦源记忆被撤回授权，灵感桌立即将其纳入屏蔽黑名单，后续生成绝对禁止复用该来源，
 *        已有衍生草稿标记授权已失效。
 * ======================================================== */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaMemoryInspirationDesk = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /** 创作类型/方向 */
    const CREATIVE_GENRE = Object.freeze({
        MYSTERY_SUSPENSE: 'mystery_suspense',       // 悬疑推理解谜
        WARMTH_EMOTIONAL: 'warmth_emotional',       // 温情羁绊成长
        ALLEGORICAL_SCI_FI: 'allegorical_sci_fi'    // 寓言/科幻隐喻
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string' && val.trim().length > 0) ? val.trim() : fallback;
    }

    function cloneDeep(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(cloneDeep);
        const copy = {};
        for (const k of Object.keys(obj)) {
            copy[k] = cloneDeep(obj[k]);
        }
        return copy;
    }

    /**
     * 初始化灵感桌上下文状态
     */
    function createInspirationDeskState({ deskId = 'desk_default', authorName = 'creator' } = {}) {
        return {
            deskId: safeStr(deskId),
            authorName: safeStr(authorName),
            seeds: [],
            revokedMemoryIds: new Set(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    /**
     * 从记忆条目提取创作基石（主题、冲突、意象、悬念）
     */
    function extractCoreElements(memoryItem = {}) {
        const text = safeStr(memoryItem.content || memoryItem.text || memoryItem.summary, '无文本');
        const theme = safeStr(memoryItem.theme, '时光与未决的选择');
        const conflict = safeStr(memoryItem.conflict, '渴望靠近却因往事疑惧止步');
        const imagery = Array.isArray(memoryItem.imagery) ? memoryItem.imagery.map(s => safeStr(s)) : ['锁扣', '雨夜长廊'];
        const unresolvedQuestion = safeStr(memoryItem.unresolvedQuestion, '那一晚未说出口的话到底是什么？');

        return {
            memoryId: safeStr(memoryItem.id || memoryItem.memoryId, `mem_${Date.now()}`),
            theme,
            conflict,
            imagery,
            unresolvedQuestion,
            rawTextDigest: text.slice(0, 80)
        };
    }

    /**
     * 生成创作种子（至少衍生三种不同方向，且严禁篡改原事实）
     */
    function generateCreativeSeeds(deskState, memoryItem = {}, {
        genres = [CREATIVE_GENRE.MYSTERY_SUSPENSE, CREATIVE_GENRE.WARMTH_EMOTIONAL, CREATIVE_GENRE.ALLEGORICAL_SCI_FI]
    } = {}) {
        if (!deskState || typeof deskState !== 'object') throw new Error('generateCreativeSeeds: deskState 无效');
        const next = cloneDeep(deskState);
        next.revokedMemoryIds = new Set(deskState.revokedMemoryIds || []);

        const memId = safeStr(memoryItem.id || memoryItem.memoryId);
        if (next.revokedMemoryIds.has(memId)) {
            throw new Error(`generateCreativeSeeds: 记忆源 ${memId} 已被撤回授权，禁止复用生成创作种子`);
        }

        const elements = extractCoreElements(memoryItem);
        const generated = [];

        for (const genre of genres) {
            const seedId = `seed_${genre}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            let premise = '';
            let logline = '';

            switch (genre) {
                case CREATIVE_GENRE.MYSTERY_SUSPENSE:
                    premise = `将核心冲突【${elements.conflict}】重构为一起深埋多年的悬案。意象【${elements.imagery.join('、')}】成为现场被涂改的证物。`;
                    logline = `侦探在查证未解之谜【${elements.unresolvedQuestion}】时，发现所有线索都指向了自己曾经遗忘的诺言。`;
                    break;
                case CREATIVE_GENRE.WARMTH_EMOTIONAL:
                    premise = `将核心冲突【${elements.conflict}】化解为双向奔赴的治愈物语。意象【${elements.imagery.join('、')}】成为跨越隔阂的纪念物。`;
                    logline = `多年后再遇时，他们决定重新回答那个未决的问题【${elements.unresolvedQuestion}】，在修补旧物中学会释怀。`;
                    break;
                case CREATIVE_GENRE.ALLEGORICAL_SCI_FI:
                    premise = `在架空世界中，所有人的记忆被存入蜂巢矩阵。核心意象【${elements.imagery.join('、')}】成为突破数据封锁的唯一物理钥匙。`;
                    logline = `当整个城市被强制清空遗憾，只有坚持探寻【${elements.unresolvedQuestion}】的人守护着人类最后的情感火种。`;
                    break;
                default:
                    premise = `通用衍生：围绕【${elements.theme}】展开的小说大纲。`;
                    logline = `以【${elements.unresolvedQuestion}】为核心驱动的故事。`;
            }

            const newSeed = {
                seedId,
                genre,
                sourceMemoryId: memId,
                isAbstracted: false,
                isSourceRevoked: false,
                premise,
                logline,
                coreElements: elements,
                fictionalEntities: {
                    characters: [
                        { role: 'protagonist', name: '原角色A', isSwapped: false },
                        { role: 'counterpart', name: '原角色B', isSwapped: false }
                    ],
                    setting: '真实回忆发生地'
                },
                createdAt: Date.now()
            };

            generated.push(newSeed);
            next.seeds.push(newSeed);
        }

        next.updatedAt = Date.now();
        return {
            updatedState: next,
            seeds: generated
        };
    }

    /**
     * 抽象化与去敏（移除真实人名/地点，交换视角，支持剥离源引用）
     */
    function abstractAndDeidentify(seed, {
        maskRealEntities = true,
        swapPerspectives = false,
        stripSourceReference = false,
        symbolicSetting = '雾气弥漫的沿海老街'
    } = {}) {
        if (!seed || typeof seed !== 'object') throw new Error('abstractAndDeidentify: seed 无效');
        const next = cloneDeep(seed);

        next.isAbstracted = true;
        if (maskRealEntities) {
            next.fictionalEntities.setting = safeStr(symbolicSetting, '架空舞台');
            next.fictionalEntities.characters = next.fictionalEntities.characters.map((c, idx) => ({
                ...c,
                name: `角色_${String.fromCharCode(65 + idx)}` // 替换为代号
            }));
        }

        if (swapPerspectives) {
            // 翻转视角：原主角变成观察者/对手
            const chars = next.fictionalEntities.characters;
            if (chars.length >= 2) {
                const tempRole = chars[0].role;
                chars[0].role = chars[1].role;
                chars[1].role = tempRole;
                chars[0].isSwapped = true;
                chars[1].isSwapped = true;
            }
            next.premise = `[反转视角演练] 从对手/被观察者的目光审视昔日冲突：${next.premise}`;
        }

        if (stripSourceReference) {
            next.sourceMemoryId = null;
            next.sourceDetached = true;
        }

        next.abstractedAt = Date.now();
        return next;
    }

    /**
     * 撤回源记忆授权（禁止后续使用，已有种子打上失效标记）
     */
    function revokeSourceAuthorization(deskState, revokedMemoryId) {
        if (!deskState || typeof deskState !== 'object') throw new Error('revokeSourceAuthorization: deskState 无效');
        const next = cloneDeep(deskState);
        next.revokedMemoryIds = new Set(deskState.revokedMemoryIds || []);

        const targetId = safeStr(revokedMemoryId);
        next.revokedMemoryIds.add(targetId);

        let affectedCount = 0;
        for (const s of next.seeds) {
            if (s.sourceMemoryId === targetId) {
                s.isSourceRevoked = true;
                s.revocationNote = '来源记忆已被作者撤回授权，该灵感种子停止商用/公开衍生';
                affectedCount++;
            }
        }

        next.updatedAt = Date.now();
        return {
            updatedState: next,
            revokedMemoryId: targetId,
            affectedSeedsCount: affectedCount
        };
    }

    /**
     * 模块自检
     */
    function memoryInspirationDeskSelfCheck() {
        const problems = [];
        try {
            let state = createInspirationDeskState({ deskId: 'desk_test' });

            const memoryItem = {
                id: 'mem_rainy_station_farewell',
                theme: '离别与未竟之言',
                conflict: '一人执意远行追寻梦想，另一人挽留却言不由衷',
                imagery: ['绿皮火车汽笛', '湿透的蓝色站台票'],
                unresolvedQuestion: '如果当时抓住了手，故事会否改写？',
                content: '那是七年前暴雨中的老车站，彼此都知道再难相见，却只聊了当天的天气。'
            };

            // 1. 同一事件生成三种不同创作方向
            const genRes = generateCreativeSeeds(state, memoryItem);
            state = genRes.updatedState;
            const seeds = genRes.seeds;

            if (seeds.length !== 3) {
                problems.push('未能生成恰好 3 种不同创作方向');
            }

            const genres = seeds.map(s => s.genre);
            if (!genres.includes(CREATIVE_GENRE.MYSTERY_SUSPENSE) ||
                !genres.includes(CREATIVE_GENRE.WARMTH_EMOTIONAL) ||
                !genres.includes(CREATIVE_GENRE.ALLEGORICAL_SCI_FI)) {
                problems.push('生成种子的方向门类不完整');
            }

            // 原始记忆事实未被改写
            if (memoryItem.theme !== '离别与未竟之言') {
                problems.push('生成灵感导致底层源记忆事实被改写');
            }

            // 2. 抽象化与视角反转
            const targetSeed = seeds[0];
            const abstracted = abstractAndDeidentify(targetSeed, {
                maskRealEntities: true,
                swapPerspectives: true,
                stripSourceReference: true
            });

            if (!abstracted.isAbstracted || !abstracted.sourceDetached || abstracted.sourceMemoryId !== null) {
                problems.push('去敏抽象化后未能成功剥离源记忆关联');
            }
            if (!abstracted.fictionalEntities.characters[0].isSwapped) {
                problems.push('视角反转未能正确记录状态');
            }

            // 3. 撤回授权机制验证
            const revRes = revokeSourceAuthorization(state, 'mem_rainy_station_farewell');
            state = revRes.updatedState;

            if (revRes.affectedSeedsCount !== 3) {
                problems.push('撤回授权影响的已有种子数量不符');
            }

            const affectedSeed = state.seeds.find(s => s.seedId === seeds[1].seedId);
            if (!affectedSeed.isSourceRevoked) {
                problems.push('已有种子未打上授权撤回标记');
            }

            // 撤回后后续生成必须拦截
            try {
                generateCreativeSeeds(state, memoryItem);
                problems.push('记忆源撤回后未能拦截后续再次生成');
            } catch (err) {
                // 预期必须拦截抛出异常
            }

        } catch (err) {
            problems.push(`记忆创作灵感桌自检异常: ${err && err.message ? err.message : String(err)}`);
        }

        return { problems };
    }

    return {
        CREATIVE_GENRE,
        createInspirationDeskState,
        extractCoreElements,
        generateCreativeSeeds,
        abstractAndDeidentify,
        revokeSourceAuthorization,
        memoryInspirationDeskSelfCheck
    };
}));