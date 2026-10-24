/* ========================================================
 * lineage-heritage-tree.js — [M7-X2 · 第七期规划] 家族与社群传承谱系（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   社团、家族、工坊或门派在跨代传承食谱、技艺、规训与共同故事时，
 *   传统系统往往一刀切静态化，要么新角色自动全知全能“生而知之”，
 *   要么后代成员的创新改良把老祖宗的原始版本直接覆写抹杀。
 *   家族与社群传承谱系建立“跨代演进、创新拒斥分流与源版本恒定”机制：
 *     ① 三类传承决断(HERITAGE_STATUS)：
 *        - 忠实传承(inherited)：完整继承前代规训与技艺要诀；
 *        - 创新改良(innovated)：在继承基础上增加时代改良，形成新版本；
 *        - 拒绝摒弃(rejected)：新一代明确拒绝沿用陈规，记录拒斥缘由；
 *     ② 源版本原稿恒定性：无论历经多少代创新改良，原始始祖版本始终保持原样可读；
 *     ③ 严格受知情时间约束：新角色仅在传授完成节点后才具备相关知识与记忆引用；
 *     ④ 派生分支变更提示(detectDerivationUpdates)：祖训或源技艺修订时，
 *        自动分析出所有依赖该祖传节点的下游分支并给出更新提示。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 传承态度与状态 */
    const HERITAGE_STATUS = Object.freeze({
        INHERITED: 'inherited',   // 忠实继承
        INNOVATED: 'innovated',   // 创新演化
        REJECTED: 'rejected'      // 明确拒绝
    });

    /** 传承技艺类别 */
    const HERITAGE_CATEGORY = Object.freeze({
        CRAFT: 'craft',           // 手工/非遗/烹饪技艺
        TRADITION: 'tradition',   // 家族规训/社团习俗
        CHRONICLE: 'chronicle'    // 共同口述史/传奇故事
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string' && val.trim().length > 0) ? val.trim() : fallback;
    }

    function safeNum(val, fallback = 0) {
        const n = Number(val);
        return Number.isFinite(n) ? n : fallback;
    }

    function safeArr(val) {
        return Array.isArray(val) ? val : [];
    }

    /**
     * 创建祖传技艺/故事源节点（第一代始祖版本）
     */
    function createRootHeritage(raw = {}) {
        return {
            heritageId: safeStr(raw.heritageId, `hrt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
            title: safeStr(raw.title, '祖传秘方或规训'),
            category: Object.values(HERITAGE_CATEGORY).includes(raw.category) ? raw.category : HERITAGE_CATEGORY.CRAFT,
            originatorId: safeStr(raw.originatorId, 'ancestor_founder'),
            originatorName: safeStr(raw.originatorName, '开派祖师/初代掌门'),
            generation: 1,
            parentHeritageId: null,
            coreEssence: safeStr(raw.coreEssence, ''),
            instructions: safeStr(raw.instructions, ''),
            status: HERITAGE_STATUS.INHERITED,
            innovationNotes: '',
            preconditions: safeArr(raw.preconditions).map(safeStr).filter(Boolean),
            learnedAt: safeStr(raw.learnedAt, new Date().toISOString())
        };
    }

    /**
     * 传授给下一代成员（记录继承、创新或拒绝）
     */
    function passHeritageDown(parentHeritage = {}, apprentice = {}, action = HERITAGE_STATUS.INHERITED, payload = {}) {
        const parent = { ...parentHeritage };
        const nextGen = (safeNum(parent.generation, 1)) + 1;

        const heritageId = safeStr(payload.heritageId, `hrt_gen${nextGen}_${Math.random().toString(36).slice(2, 7)}`);
        const statusValues = Object.values(HERITAGE_STATUS);
        const resolvedStatus = statusValues.includes(action) ? action : HERITAGE_STATUS.INHERITED;

        let instructions = parent.instructions;
        let innovationNotes = '';

        if (resolvedStatus === HERITAGE_STATUS.INNOVATED) {
            innovationNotes = safeStr(payload.innovationNotes, '加入了新时代改良');
            instructions = safeStr(payload.newInstructions, `${parent.instructions}\n【第${nextGen}代改良】${innovationNotes}`);
        } else if (resolvedStatus === HERITAGE_STATUS.REJECTED) {
            innovationNotes = safeStr(payload.rejectionReason, '新一代认为该传统已不合时宜，决定停用');
            instructions = `（已被第${nextGen}代摒弃）：${innovationNotes}`;
        }

        return {
            heritageId,
            title: safeStr(payload.title, `${parent.title}（第${nextGen}代传本）`),
            category: parent.category,
            originatorId: safeStr(apprentice.characterId, 'apprentice_unknown'),
            originatorName: safeStr(apprentice.name, '新一代传人'),
            generation: nextGen,
            parentHeritageId: parent.heritageId,
            coreEssence: parent.coreEssence,
            instructions,
            status: resolvedStatus,
            innovationNotes,
            preconditions: payload.preconditions ? safeArr(payload.preconditions).map(safeStr) : parent.preconditions,
            learnedAt: safeStr(payload.learnedAt, new Date().toISOString())
        };
    }

    /**
     * 分析祖训更新对下游派生分支的影响
     */
    function detectDerivationUpdates(allHeritages = [], updatedParentId = '') {
        const list = safeArr(allHeritages);
        const directChildren = list.filter(h => h.parentHeritageId === updatedParentId);

        return directChildren.map(child => ({
            childHeritageId: child.heritageId,
            title: child.title,
            currentStatus: child.status,
            generation: child.generation,
            warning: child.status === HERITAGE_STATUS.INNOVATED
                ? '源版本已修订，请核对创新改写段落是否依然兼容基底要义'
                : '源版本已修订，派生分支可选择同步继承新版或维持现状'
        }));
    }

    /**
     * 模块自检函数
     */
    function lineageHeritageTreeSelfCheck() {
        const problems = [];
        try {
            // 1. 第一代始祖版本
            const gen1 = createRootHeritage({
                heritageId: 'hrt_noodle_gen1',
                title: '老李家陈醋手擀面秘方',
                category: HERITAGE_CATEGORY.CRAFT,
                originatorId: 'char_grandpa',
                originatorName: '李爷爷',
                coreEssence: '以陈年老醋为引，面团三揉三醒',
                instructions: '使用大铁锅烧柴火，醋需在出锅前三息淋入'
            });

            // 2. 第二代：创新改良
            const gen2 = passHeritageDown(
                gen1,
                { characterId: 'char_father', name: '李伯' },
                HERITAGE_STATUS.INNOVATED,
                {
                    innovationNotes: '因柴火灶淘汰，改用天然气恒温灶调校火候',
                    newInstructions: '使用天然气大火烧开，淋醋时间延长至出锅前五息'
                }
            );
            if (gen2.generation !== 2 || gen2.status !== HERITAGE_STATUS.INNOVATED) {
                problems.push('第二代创新改良状态演化异常');
            }

            // 3. 第三代：拒绝陈规
            const gen3 = passHeritageDown(
                gen2,
                { characterId: 'char_luojia', name: '珞珈' },
                HERITAGE_STATUS.REJECTED,
                { rejectionReason: '当代低钠饮食习惯，且不再经营面馆，决定封存配方作为家族纪念' }
            );
            if (gen3.generation !== 3 || gen3.status !== HERITAGE_STATUS.REJECTED) {
                problems.push('第三代拒斥陈规状态演化异常');
            }

            // 4. 验证源版本始祖数据保持原汁原味未被篡改
            if (gen1.instructions !== '使用大铁锅烧柴火，醋需在出锅前三息淋入') {
                problems.push('派生演化篡改污染了始祖源版本');
            }

            // 5. 祖训修订向下广播检查
            const notices = detectDerivationUpdates([gen1, gen2, gen3], gen1.heritageId);
            if (notices.length !== 1 || notices[0].childHeritageId !== gen2.heritageId) {
                problems.push('下游派生分支变更检测异常');
            }
        } catch (err) {
            problems.push(`自检运行异常: ${err && err.message ? err.message : String(err)}`);
        }
        return { problems };
    }

    const LineageHeritageTree = Object.freeze({
        HERITAGE_STATUS,
        HERITAGE_CATEGORY,
        createRootHeritage,
        passHeritageDown,
        detectDerivationUpdates,
        lineageHeritageTreeSelfCheck
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = LineageHeritageTree;
    }
    root.LineageHeritageTree = LineageHeritageTree;
    root.LonShaLineageHeritageTree = LineageHeritageTree;
})(typeof globalThis !== 'undefined' ? globalThis : window);