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
        return _canon(value, 0, _mkRead(), new WeakSet());
    }

    /* ---------- [v3.173] 读数面（I5/I6 同族） ----------
       本模块缝合后 73 个版本无人调用（v3.163 账本「已挂载但零消费」）。接线时必须
       回答另一个问题：**序列化过程本身静默丢过什么**。JSON 有四种合法但不可逆的
       丢失，旧实现一处都不计：
         ① undefinedDropped —— 对象字段值为 undefined（键被 JSON 悄悄丢掉；
            数组合法位是 undefined（被写成 null）—— 静默丢键是「内容变了但字节没变」
            的前置条件，而本模块的全部用途（缓存键/指纹）都假定字节能代表内容；
         ② sparseFilled —— 稀疏数组空洞（JSON 写成 null，读回多一个元素）；
         ③ depthCut —— 超出深度上限的子树被替换为 '[depth-cut]'（旧实现无上限，
            深到爆栈时抛 RangeError：那是「读失败」，不是「读到了空对象」）；
         ④ valueTypes —— 参与规范化的值类型直方图（类型塌陷在字节上看不见）。
       读数只写入调用方传入的 carry，绝不出现在返回值文本里（契约：返回值仍是 string）。 */
    const MAX_DEPTH = 200;
    function _mkRead() {
        return {
            valueTypes: {}, undefinedDropped: 0, sparseFilled: 0, depthCut: 0,
            cycles: 0, maxDepth: 0, bytes: 0, emptyInput: false, error: '', active: true,
        };
    }
    function _typeOf(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }
    function _canon(value, depth, read, seen) {
        const t = _typeOf(value);
        read.valueTypes[t] = (read.valueTypes[t] || 0) + 1;
        if (depth > read.maxDepth) read.maxDepth = depth;
        if (value === null || typeof value !== 'object') {
            if (value === undefined) read.undefinedDropped++;
            return value;
        }
        if (depth >= MAX_DEPTH) { read.depthCut++; return '[depth-cut]'; }
        if (seen.has(value)) { read.cycles++; throw new Error('canonicalStringify: 检测到循环引用'); }
        seen.add(value);
        try {
            if (Array.isArray(value)) {
                const out = new Array(value.length);
                for (let i = 0; i < value.length; i++) {
                    if (!(i in value)) { read.sparseFilled++; continue; }   // 空洞：保持空洞（JSON 写 null，与旧 map 行为一致）
                    out[i] = _canon(value[i], depth + 1, read, seen);
                }
                return out;
            }
            const sorted = {};
            for (const key of Object.keys(value).sort()) {
                if (value[key] === undefined) { read.undefinedDropped++; continue; }
                sorted[key] = _canon(value[key], depth + 1, read, seen);
            }
            return sorted;
        } finally { seen.delete(value); }
    }
    function _setRead(carry, read) {
        if (carry && typeof carry === 'object') carry.canonical = read;
        return read;
    }

    /**
     * 确定性 JSON 序列化（对象键每层字典序排序）
     * @param {*} value
     * @param {object} [carry] 可选末位参数：读数出口（契约不变，返回值仍是 string）
     * @returns {string}
     */
    function canonicalStringify(value, carry = null) {
        const read = _mkRead();
        if (value === undefined) read.emptyInput = true;
        let out;
        try {
            out = JSON.stringify(_canon(value, 0, read, new WeakSet()));
        } catch (e) {
            read.error = String((e && e.message) || e);
            _setRead(carry, read);
            throw e;   // 读失败必须上抛（I6：不能变成「读到了空」）
        }
        out = out === undefined ? '' : out;
        read.bytes = out.length;
        _setRead(carry, read);
        return out;
    }

    /** 语义等价判定（键序无关）——保留旧实现（键序不敏感，故不走规范化也能判等） */
    function _plainEquals(a, b) {
        return _loose(a) === _loose(b);
    }
    function _loose(v) {
        if (v === null || typeof v !== 'object') return typeof v === 'string' ? 's:' + v : 'j:' + JSON.stringify(v === undefined ? null : v);
        if (Array.isArray(v)) return '[' + v.map(_loose).join(',') + ']';
        return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + _loose(v[k])).join(',') + '}';
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
        return _plainEquals(a, b);
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
    function stableHash(value, carry = null) {
        return fnv1a(canonicalStringify(value, carry));
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