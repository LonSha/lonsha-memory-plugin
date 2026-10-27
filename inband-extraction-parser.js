/**
 * inband-extraction-parser.js - 伴随式零额外开销提取解析器 (In-band Extraction Parser)
 * 
 * 机制借鉴与超越：
 * 吸收 Mneme (v1.0.0) 的伴随式输出与 HTML 注释剥离架构。
 * 允许模型在一次正文回复末尾，以统一声明式注释块输出事实增量、羁绊变动与道具流转；
 * 解析器安全提取结构化数据后，通过高效正则从主正文中剔除该块，保证用户界面的纯净。
 * 彻底消除额外提取 API 调用的并发等待、速率限制风险与 Token 浪费。
 */

/* 单次装载包装（[v3.421.0] 修）：本文件在宿主页是按 extra_js 逐个 eval 的经典脚本，
 *   顶层 `class`/`const` 落在同一个脚本作用域里；同一页重复加载一次就会 `Identifier ...
 *   has already been declared`。故与仓内既有模块同形，收进 IIFE。
 *   导出仍是双通道：IIFE 内 `module.exports` 供 tests 具名 import，`root.*` 供宿主消费。 */
(function (root) {
'use strict';
const DEFAULT_BLOCK_REGEX = /<!--\s*LONSHA_MEM([\s\S]*?)LONSHA_MEM\s*-->/i;

class InbandExtractionParser {
    constructor(config = {}) {
        this.blockRegex = config.blockRegex || DEFAULT_BLOCK_REGEX;
    }

    /**
     * 从生成的原始消息文本中剥离并解析伴随式记忆结构
     * @param {string} rawText - 模型生成的完整文本
     * @returns {Object} { cleanText, hasDelta, delta, parseError }
     */
    extractAndStrip(rawText = '') {
        if (!rawText || typeof rawText !== 'string') {
            return {
                cleanText: '',
                hasDelta: false,
                delta: null
            };
        }

        const match = rawText.match(this.blockRegex);
        if (!match) {
            return {
                cleanText: rawText,
                hasDelta: false,
                delta: null
            };
        }

        const fullBlock = match[0];
        const innerJson = match[1].trim();
        const cleanText = rawText.replace(fullBlock, '').trimEnd();

        try {
            // 容错处理中文字符引号与尾随逗号
            const sanitized = innerJson
                .replace(/[“”]/g, '"')
                .replace(/[‘’]/g, "'")
                .replace(/,\s*([}\\]])/g, '$1');

            const deltaObj = JSON.parse(sanitized);

            return {
                cleanText,
                hasDelta: true,
                delta: {
                    summary: deltaObj.summary || '',
                    storyTime: deltaObj.storyTime || '',
                    location: deltaObj.location || '',
                    characters: Array.isArray(deltaObj.characters) ? deltaObj.characters : [],
                    bonds: Array.isArray(deltaObj.bonds) ? deltaObj.bonds : [],
                    items: Array.isArray(deltaObj.items) ? deltaObj.items : [],
                    importance: ['normal', 'major', 'permanent'].includes(deltaObj.importance) ? deltaObj.importance : 'normal'
                }
            };
        } catch (err) {
            return {
                cleanText,
                hasDelta: false,
                delta: null,
                parseError: err.message
            };
        }
    }

    /**
     * 生成适合注入系统提示词的伴随式输出指令模板
     * @returns {string} 提示词模板说明
     */
    generateInstructionPrompt() {
        return [
            `【伴随式记忆输出规范】`,
            `请在小说正文撰写完毕后，在最末尾附带以下格式的注释块（此块不会展示给用户）：`,
            `<!-- LONSHA_MEM`,
            `{`,
            `  "summary": "本轮一句话剧情梗概",`,
            `  "storyTime": "故事内发生时间（如卯正二刻或2026.10.24）",`,
            `  "location": "当前主要地点",`,
            `  "characters": ["在场主要角色名"],`,
            `  "bonds": [{"name": "角色名", "delta": 1, "reason": "好感微升原因"}],`,
            `  "items": [{"name": "物品名", "status": "held/lost/consumed"}],`,
            `  "importance": "normal/major/permanent"`,
            `}`,
            `LONSHA_MEM -->`
        ].join('\n');
    }
}

root.LonShaInbandExtractionParser = { InbandExtractionParser };
if (typeof module !== 'undefined' && module.exports) module.exports = { InbandExtractionParser };
})(typeof globalThis !== 'undefined' ? globalThis : window);
