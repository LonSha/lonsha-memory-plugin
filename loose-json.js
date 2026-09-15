/**
 * loose-json.js — [v3.101 缝合] 截断容错 JSON 恢复引擎
 *
 * 【来源】缝合 m61-oss/st-end-component-generator（织幕·外置组件）
 *         generation/anchor-output-protocol.js，按记忆插件工程规范重写为
 *         通用纯函数 IIFE 模块。将其「anchor 插入协议专用」泛化为
 *         「任意对象数组的截断恢复」，非照抄。
 *
 * 【机制】
 *   记忆抽取让 LLM 输出 JSON 数组（如 [{type,content},...]）。当输出被
 *   max_tokens 截断成半截（`[{"a":"1"},{"a":"2"},{"a":"3`）时：
 *   - 现有 sanitizeJson 能修引号/逗号/裸键，但 JSON.parse 仍整体失败 → 全部丢弃
 *   - 本引擎用宽松扫描逐项提取**已完整的对象**，保住已抽取的部分条目
 *     （complete=false 明确标记「这是截断恢复，非完整结果」）
 *   逐项独立校验：单个畸形项被跳过，其余可用项保留（不因一项坏而丢全部）。
 *
 * 【核心函数】
 *   - stripJsonFence：剥 ```json 围栏
 *   - decodeLooseString：宽松字符串解码（\uXXXX + \n\t\" 等转义，失败原样返回）
 *   - recoverObjectItems：从（可能截断的）文本中按给定字段模式逐项恢复对象
 *   - parseLooseArray：严格 JSON.parse → 失败则宽松恢复，返回统一结构
 *
 * 【与源码差异】
 *   - 源码 itemPattern 硬编码 anchor 协议的 position/anchor/content 三字段；
 *     本实现改为「字段名列表 + 提取器」参数化，可恢复任意形状对象数组
 *   - 源码仅返回 {mode,thinking,items,complete,warnings}；本实现保留同结构
 *     但 thinking/附加字段由调用方通过 pickFields 决定
 *   - 增加 tryParseStrict：先严格、再尾逗号修复、再宽松的三段式（复用
 *     已在 v2.10 parseSpeakers / v3.95 分块中验证过的尾逗号修复经验）
 */

(function (global) {
    'use strict';

    /** 转文本（非字符串一律空串） */
    function asText(value) {
        return typeof value === 'string' ? value : '';
    }

    /** 剥离 Markdown JSON 围栏 */
    function stripJsonFence(value) {
        const text = asText(value).trim();
        const match = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
        return match ? match[1].trim() : text;
    }

    /**
     * 宽松字符串解码：优先 JSON 字面量，失败则手工还原 \uXXXX 与常见转义
     * @param {string} value
     * @returns {string}
     */
    function decodeLooseString(value) {
        try {
            return JSON.parse(`"${value}"`);
        } catch {
            return String(value == null ? '' : value)
                .replace(/\\u([0-9a-f]{4})/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
                .replace(/\\(["\\/bfnrt])/g, (_, code) => ({
                    '"': '"', '\\': '\\', '/': '/',
                    b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
                }[code] || code));
        }
    }

    /**
     * 从可能截断的文本中逐项恢复对象。
     * @param {object} options
     * @param {string} options.source 待扫描文本（通常是 "output":[...] 之后的片段）
     * @param {string[]} options.fields 期望字段名（按出现顺序推导正则）；无字段则用通用键值对
     * @param {Array<[string,string]>} [options.enumFields] 枚举字段约束 [[字段名, "a|b|c"], ...]
     * @param {Function} [options.normalize] 单项规范化/过滤（返回 falsy 则跳过该项）
     * @param {number} [options.max] 最多恢复项数（防失控，默认 200）
     * @returns {Array<any>} 恢复出的对象数组
     */
    function recoverObjectItems(options = {}) {
        const source = asText(options.source);
        const fields = Array.isArray(options.fields) ? options.fields : [];
        const enumMap = new Map(options.enumFields || []);
        const normalize = typeof options.normalize === 'function' ? options.normalize : (v) => v;
        const max = Number.isFinite(options.max) ? Math.max(1, options.max) : 200;
        if (!source) return [];

        // 构造字段捕获组：枚举字段限制取值，其余任意（非贪婪）
        const parts = fields.map((f) => {
            const enums = enumMap.get(f);
            if (enums) return `"${f}"\\s*:\\s*"(${enums})"`;
            return `"${f}"\\s*:\\s*"([\\s\\S]*?)"`;
        });
        // 允许 anchor 类可选字段缺失 → 整体用可选包裹不易做，改为宽松：字段可缺
        const itemRe = new RegExp(
            `\\{[^{}]*?${parts.join('\\s*,\\s*')}[^{}]*?\\}` +
            `|\\{\\s*${parts.join('\\s*,\\s*')}\\s*(?=\\}|,|$)`,
            'gi'
        );

        const items = [];
        let match;
        while ((match = itemRe.exec(source)) && items.length < max) {
            const raw = {};
            for (let i = 0; i < fields.length; i++) {
                const captured = match[i + 1];
                if (captured === undefined) continue;
                raw[fields[i]] = enumMap.has(fields[i]) ? captured : decodeLooseString(captured);
            }
            const item = normalize(raw);
            if (item) items.push(item);
        }
        return items;
    }

    /**
     * 三段式严格解析：直接 parse → 尾逗号修复 → 失败返回 null
     * @param {string} text
     * @returns {any|null}
     */
    function tryParseStrict(text) {
        const s = stripJsonFence(text);
        if (!s) return null;
        try { return JSON.parse(s); } catch { /* 继续 */ }
        try { return JSON.parse(s.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
    }

    /**
     * 宽松数组解析：严格优先，失败则逐项恢复
     * @param {string} rawText
     * @param {object} [recoverOptions] 传给 recoverObjectItems（fields/normalize/enumFields/max）
     * @returns {{mode:string, items:Array, complete:boolean, warnings:string[]}}
     */
    function parseLooseArray(rawText, recoverOptions = {}) {
        const source = stripJsonFence(rawText);
        const strict = tryParseStrict(source);
        if (Array.isArray(strict)) {
            return { mode: 'strict-array', items: strict, complete: true, warnings: [] };
        }
        if (strict && typeof strict === 'object' && Array.isArray(strict.output)) {
            return { mode: 'strict-output', items: strict.output, complete: true, warnings: [] };
        }

        // 宽松恢复：定位数组起点（"output":[ 或裸 [）
        let body = source;
        const arrStart = /\[\s*\{|\[/i.exec(source);
        if (arrStart) body = source.slice(arrStart.index);
        const items = recoverObjectItems({ ...recoverOptions, source: body });
        return {
            mode: 'loose-recovery',
            items,
            complete: false,
            warnings: items.length ? [] : ['未能从文本中恢复任何有效条目'],
        };
    }

    const api = {
        asText,
        stripJsonFence,
        decodeLooseString,
        recoverObjectItems,
        tryParseStrict,
        parseLooseArray,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaLooseJson = api;
})(typeof window !== 'undefined' ? window : globalThis);