/**
 * multi-protagonist-registry.js - 多主角等权动态实体注册台 (Multi-Protagonist Registry)
 * 
 * 机制借鉴与超越：
 * 吸收 SillyTavern 记忆宫殿 (Memory Palace v3.4.0) 的多主角平等体系与名称优先复用原则。
 * 突破“角色卡标题=唯一主角”的固有狭隘设定，依据正文中高频出现、互动深度与情感交织，
 * 动态将核心人物提升为与第一主角平等的独立主体，拥有专属情感轨迹与日记。
 * 强制执行“变体归一（Alias Canonicalization）”，防止带修饰词/外号的重复建档与降级回 NPC。
 */

export class MultiProtagonistRegistry {
    constructor(config = {}) {
        this.minInteractionCountToPromote = config.minInteractionCountToPromote ?? 5;
        this.minBondScoreToPromote = config.minBondScoreToPromote ?? 40;
    }

    /**
     * 规范化角色名（消歧与去修饰词）
     * 例如 "张三（队长）" -> "张三", "小林队长" -> "小林"
     * @param {string} rawName 
     * @param {string[]} existingCanonicals 
     * @returns {string} 归一后的基准角色名
     */
    canonicalizeName(rawName = '', existingCanonicals = []) {
        const cleaned = rawName.trim().replace(/[（\(][^）\)]+[）\)]/g, '').trim();
        // 优先在已有规范名字中寻找包含/匹配
        for (const canon of existingCanonicals) {
            if (cleaned === canon || cleaned.startsWith(canon) || canon.startsWith(cleaned)) {
                return canon;
            }
        }
        return cleaned;
    }

    /**
     * 评估候选实体是否满足升格为主要角色的门槛
     * @param {Object} candidate - 实体统计 { name, role, interactionCount, bondScore, isNpc }
     * @param {Map<string, Object>} currentProtagonists - 当前主要角色表
     * @returns {Object} 判定结论
     */
    evaluatePromotion(candidate, currentProtagonists = new Map()) {
        const canonName = this.canonicalizeName(candidate.name, Array.from(currentProtagonists.keys()));

        if (currentProtagonists.has(canonName)) {
            return {
                shouldPromote: false,
                isAlreadyProtagonist: true,
                canonName,
                reason: 'already_registered'
            };
        }

        const countMet = (candidate.interactionCount || 0) >= this.minInteractionCountToPromote;
        const bondMet = Math.abs(candidate.bondScore || 0) >= this.minBondScoreToPromote;

        if (countMet && bondMet) {
            return {
                shouldPromote: true,
                isAlreadyProtagonist: false,
                canonName,
                reason: 'interaction_and_bond_threshold_met',
                evidence: `高频互动(${candidate.interactionCount}次)且情感羁绊深厚(${candidate.bondScore}分)`
            };
        }

        return {
            shouldPromote: false,
            isAlreadyProtagonist: false,
            canonName,
            reason: 'below_promotion_threshold'
        };
    }

    /**
     * 注册或更新主要角色档案
     * @param {Map<string, Object>} registry
     * @param {Object} protagonistData { name, role, evidence, initialSentiment }
     * @returns {Object} 注册结果
     */
    registerProtagonist(registry, { name, role = '', evidence = '', initialSentiment = 'neutral' }) {
        const canonName = this.canonicalizeName(name, Array.from(registry.keys()));
        
        let record = registry.get(canonName);
        if (!record) {
            record = {
                name: canonName,
                role: role || '核心角色',
                promotedAt: Date.now(),
                evidence: evidence || '正文高频互动升级',
                sentiment: initialSentiment,
                diaryEntries: [],
                emotionHistory: [],
                aliases: new Set([name])
            };
            registry.set(canonName, record);
        } else {
            record.aliases.add(name);
            if (role) record.role = role;
        }

        return {
            success: true,
            canonName,
            protagonist: {
                ...record,
                aliases: Array.from(record.aliases)
            }
        };
    }

    /**
     * 构建适合注入 Prompt 的多主角上下文引导声明
     * @param {Map<string, Object>} registry 
     * @returns {string} 格式化声明文本
     */
    formatProtagonistPromptBlock(registry) {
        if (!registry || registry.size === 0) return '';

        const lines = ['【当前故事等权主要角色（各拥有独立意识与状态）】'];
        for (const [name, p] of registry.entries()) {
            lines.push(`- 《${name}》：身份=${p.role} | 阶段心境=${p.sentiment} | 关系依据=${p.evidence}`);
        }
        lines.push('【铁律】：对以上主要角色的行为与情感必须平等推演，严禁降格为无记忆 NPC。');
        return lines.join('\n');
    }
}