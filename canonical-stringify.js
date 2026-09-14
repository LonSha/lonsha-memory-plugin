/**
 * canonical-stringify.js — [v3.100 缝合] 确定性 JSON 序列化引擎
 *
 * 【来源】缝合 FunnyCups/Luker（SillyTavern 分叉）orchestrator 扩展的
 *         canonical-stringify.js，按记忆插件工程规范重写为可测纯函数 IIFE 模块。
 *         保留其完整语义，非照抄。
 *
 * 【机制】
 *   普通 JSON.stringify 保留 V8 插入序，故两个语义相同的对象（{a:1,b:2} 与
 *   {b:2,a:1}）序列化为不同字符串——不同的 cache-prefix 字节——当同一工具调用/
 *   prompt 在不同键序下重放时，会静默使 Anthropic prompt 缓存失效。
 *   本引擎的规范形式：对象键在每一层按字典序排序；数组保留顺序（数组序是语义）；
 *   非对象/非数组值直通；循环引用抛错（同 JSON.stringify 行为）。
 *   用途：向量缓存键、prompt 组装、记忆条目指纹等需要「语义相同→字节相同」的场景。
 *
 * 【与源码差异】
 *   - 源码为 ESM export；本实现 IIFE 双导出（window.LonShaCanonical + module.exports）
 *   - 保留 canonicalStringify / canonicalStringifyArgs 完整契约
 *   - 增加 stableHash：基于规范序列化的稳定字符串指纹（FNV-1a，无依赖）
 *   - 增加 canonicalEquals：语义等价判定（键序无关）
 */

(function (global) {
    'use strict';

    /** 递归规范化：对象键排序，数组保序，其余直通 */
    function canonicalize(value) {
        if (value === null || typeof value !== 'object') return value;
        if (Array.isArray(value)) return value.map(canonicalize);
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = canonicalize(value[key]);
        }
        return sorted;
    }

    /**
     * 确定性 JSON 序列化（对象键每层字典序排序）
     * @param {*} value
     * @returns {string}
     */
    function canonicalStringify(value) {
        return JSON.stringify(canonicalize(value));
    }

    /**
     * 工具调用参数序列化：非对象（含数组/null/原始值）塌陷为 '{}'
     * （对齐源码 safeStringifyArgs 契约——调用方曾把未知形状强制为空对象，
     *   仍看到相同的线上输出）
     * @param {*} value
     * @returns {string}
     */
    function canonicalStringifyArgs(value) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) return '{}';
        return canonicalStringify(value);
    }

    /**
     * 语义等价判定（键序无关）：两值规范序列化后字符串相等
     * @param {*} a
     * @param {*} b
     * @returns {boolean}
     */
    function canonicalEquals(a, b) {
        return canonicalStringify(a) === canonicalStringify(b);
    }

    /**
     * FNV-1a 字符串哈希（32-bit，无依赖，稳定）
     * @param {string} str
     * @returns {string} 8 位十六进制
     */
    function fnv1a(str) {
        let h = 0x811c9dc5;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }

    /**
     * 稳定指纹：对值做规范序列化后取 FNV-1a 哈希
     * 同一语义内容（无论键序）得到同一指纹 —— 适合做缓存键/条目指纹。
     * @param {*} value
     * @returns {string} 8 位十六进制指纹
     */
    function stableHash(value) {
        return fnv1a(canonicalStringify(value));
    }

    const api = {
        canonicalStringify,
        canonicalStringifyArgs,
        canonicalEquals,
        stableHash,
        fnv1a,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaCanonical = api;
})(typeof window !== 'undefined' ? window : globalThis);