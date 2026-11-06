/* ============================================================
 * anti-confusion-matrix-disambiguator.js — [v3.457.0 · V19 记忆专版]
 * 多维防混淆消歧与实体认知锚定矩阵引擎 (Anti-Confusion Matrix & Entity Disambiguator)
 * ------------------------------------------------------------
 * 【核心使命】
 * 解决复杂多角色动态互动、深层剧情与长程交互中常见的记忆混淆痛点：
 *   1. 实体身份漂移与张冠李戴（把A的经历记在B身上，代词“他/她/对方”指代不清）；
 *   2. 时空错位与事件倒置（旧事件与新反转颠倒，过去状态与当前状态混淆）；
 *   3. 冲突事实多头并存与因果打架（同一事实的矛盾版本同时呈现）；
 *   4. 不可逆状态无序穿透（已死亡角色或已毁灭信物被误认为当前可用）。
 *
 * 【核心机制】
 *   - 实体多维指纹提取与多角指代消歧（Contextual Disambiguation）；
 *   - 事实互斥冲突仲裁矩阵（Mutual Exclusion & Invariant Arbitration）；
 *   - 防混淆显式认知锚定前缀（Disambiguation Precision Prefixes）；
 *   - 紧凑型防混淆高阶指令生成（Anti-Confusion Directives Generation）。
 *
 * 挂载：window.LonShaAntiConfusion / CJS / AMD
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaAntiConfusion = factory();
        root.AntiConfusionMatrixDisambiguator = root.LonShaAntiConfusion;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const VERSION = '3.457.0';

    /**
     * 创建干净的防混淆状态机
     */
    function createState() {
        return {
            version: VERSION,
            disambiguatedCount: 0,
            conflictResolvedCount: 0,
            clarifiedEntities: {},
            lastDirectives: '',
            updatedAt: Date.now()
        };
    }

    /**
     * 宽容水合存档状态
     */
    function hydrateState(raw) {
        if (!raw || typeof raw !== 'object') return createState();
        return {
            version: VERSION,
            disambiguatedCount: Number(raw.disambiguatedCount) || 0,
            conflictResolvedCount: Number(raw.conflictResolvedCount) || 0,
            clarifiedEntities: (raw.clarifiedEntities && typeof raw.clarifiedEntities === 'object') ? { ...raw.clarifiedEntities } : {},
            lastDirectives: typeof raw.lastDirectives === 'string' ? raw.lastDirectives : '',
            updatedAt: Number(raw.updatedAt) || Date.now()
        };
    }

    /**
     * 提取文本中的可能实体关键词（支持通用多角色）
     */
    function extractEntityMentions(text, knownCharacters = []) {
        if (!text || typeof text !== 'string') return [];
        const mentions = new Set();
        const cleaned = text.trim();
        for (const char of knownCharacters) {
            if (char && cleaned.includes(char)) {
                mentions.add(char);
            }
        }
        // 通用代词与指代词匹配
        const pronouns = ['我', '你', '他', '她', '它', '我们', '你们', '他们', '她们', '对方', '此人'];
        for (const p of pronouns) {
            if (cleaned.includes(p)) mentions.add(p);
        }
        return Array.from(mentions);
    }

    /**
     * 判定两段记忆是否存在核心属性/时态冲突
     * 简易启发式规则：涉及同一主体，但存在生/死、有/无、知/不知、在/不在等互斥语义
     */
    function detectMutualExclusionConflict(itemA, itemB) {
        const textA = String(itemA.text || itemA.content || '');
        const textB = String(itemB.text || itemB.content || '');
        if (!textA || !textB) return null;

        // 互斥特征对判定
        const conflictPairs = [
            { pos: /(?:死亡|牺牲|阵亡|消亡|遇害|断气|永眠)/, neg: /(?:活|微笑|说话|行动|健在|醒来|站立)/, topic: '生命状态' },
            { pos: /(?:摧毁|焚毁|粉碎|丢失|彻底销毁|化为灰烬)/, neg: /(?:持有|佩戴|完好|递给|取出|握在手中)/, topic: '物品存续' },
            { pos: /(?:背叛|决裂|反目|死敌|宣战|撕毁契约)/, neg: /(?:忠诚|盟友|生死与共|深信不疑|并肩作战)/, topic: '阵营立场' },
            { pos: /(?:秘密泄露|真相大白|人尽皆知|已坦白)/, neg: /(?:暗中保密|无人知晓|深藏心底|未曾吐露)/, topic: '秘密公开' }
        ];

        for (const pair of conflictPairs) {
            const aHasPos = pair.pos.test(textA);
            const bHasPos = pair.pos.test(textB);
            const aHasNeg = pair.neg.test(textA);
            const bHasNeg = pair.neg.test(textB);

            if ((aHasPos && bHasNeg) || (bHasPos && aHasNeg)) {
                // 判断谁是较新/较高楼层
                const floorA = Number(itemA.floor) || 0;
                const floorB = Number(itemB.floor) || 0;
                const winner = floorA >= floorB ? itemA : itemB;
                const loser = winner === itemA ? itemB : itemA;
                return {
                    conflict: true,
                    topic: pair.topic,
                    winnerId: winner.id || winner.key,
                    loserId: loser.id || loser.key,
                    reason: `发现${pair.topic}事实互斥冲突，以较高时序/较新楼层（Floor ${winner.floor || '新'}）为准`
                };
            }
        }
        return null;
    }

    /**
     * 多维消歧与实体认知锚定主处理
     * @param {Array} candidates - 待消歧候选记忆列表
     * @param {Object} options - 消歧环境与已知实体 { knownCharacters, currentSpeaker, userName, activeFloor }
     * @param {Object} state - 防混淆持久化状态
     * @returns {Object} { candidates, disambiguatedCount, resolvedConflicts, directives }
     */
    function disambiguateMemoryCandidates(candidates = [], options = {}, state = null) {
        if (!Array.isArray(candidates) || candidates.length === 0) {
            return { candidates: [], disambiguatedCount: 0, resolvedConflicts: [], directives: '' };
        }

        const knownCharacters = Array.isArray(options.knownCharacters) ? options.knownCharacters : [];
        const currentSpeaker = options.currentSpeaker || '';
        const userName = options.userName || '你';
        const activeFloor = Number(options.activeFloor) || 0;

        let disambiguatedCount = 0;
        const resolvedConflicts = [];
        const droppedCandidateIds = new Set();

        // 1. 冲突消歧与互斥检测 (Conflict Arbitration)
        for (let i = 0; i < candidates.length; i++) {
            for (let j = i + 1; j < candidates.length; j++) {
                const itemA = candidates[i];
                const itemB = candidates[j];
                const conflict = detectMutualExclusionConflict(itemA, itemB);
                if (conflict) {
                    resolvedConflicts.push(conflict);
                    droppedCandidateIds.add(conflict.loserId);
                }
            }
        }

        // 2. 实体认知锚定与前缀赋能 (Entity Precision Attribution)
        const processed = [];
        for (const item of candidates) {
            const itemId = item.id || item.key;
            // 若被冲突检测判定为被淘汰的虚假/过期事实，则降权或剔除
            if (droppedCandidateIds.has(itemId)) {
                continue;
            }

            const rawText = String(item.text || item.content || '');
            const character = item.character || item.owner || '';
            const floor = Number(item.floor) || null;

            let enrichedText = rawText;
            let enriched = false;

            // 自动识别文本中提及的已知角色并消除多角色交叉混淆
            const matchedChars = knownCharacters.filter(c => c && rawText.includes(c));
            if (matchedChars.length >= 2 && !rawText.startsWith('【多角色交互')) {
                // 多角色在场混淆，给它打上关系交织标识
                enrichedText = `【多角色交互·${matchedChars.join('&')}】${rawText}`;
                enriched = true;
                disambiguatedCount++;
            } else if (character && !rawText.startsWith(`【${character}】`)) {
                // 仅针对代词密集或主体不明确的文本强化
                if (/(?:他|她|对方|此人|那人|私密|心声)/.test(rawText) || !rawText.includes(character)) {
                    enrichedText = `【实体锚定·${character}】${rawText}`;
                    enriched = true;
                    disambiguatedCount++;
                }
            }

            processed.push(Object.assign({}, item, {
                text: enrichedText,
                content: enrichedText,
                _disambiguated: enriched
            }));
        }

        // 3. 构建高密度防混淆结构化约束指令 (Anti-Confusion Directives)
        const directives = [];
        if (knownCharacters.length > 0) {
            directives.push(`【身份边界】现场与已知实体：[${knownCharacters.join(', ')}]，当前发言者：${currentSpeaker || '对方'}。`);
            directives.push(`【消歧纪律】严格区分各角色的经历与物品归属，严禁把第三人往事张冠李戴给当前角色或用户（${userName}）。`);
        }
        if (resolvedConflicts.length > 0) {
            const conflictDescs = resolvedConflicts.slice(0, 3).map(c => c.reason);
            directives.push(`【时空一致性】${conflictDescs.join('；')}。`);
        }

        const directivesText = directives.join('\n');

        if (state) {
            state.disambiguatedCount += disambiguatedCount;
            state.conflictResolvedCount += resolvedConflicts.length;
            state.lastDirectives = directivesText;
            state.updatedAt = Date.now();
        }

        return {
            candidates: processed,
            disambiguatedCount,
            resolvedConflicts,
            directives: directivesText
        };
    }

    return {
        VERSION,
        createState,
        hydrateState,
        detectMutualExclusionConflict,
        disambiguateMemoryCandidates
    };
}));