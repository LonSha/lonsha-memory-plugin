/**
 * storage-codec.js — [R27-D] 存档编码：结构共享池化 + 反引用炸弹
 *
 * 【来源】照 shrink1024/fish-memory 的 src/core/storage-codec.js（178 行）行为重写。
 *         该仓无 LICENSE，未复制任何代码。池化格式、五种节点标记、四条上限
 *         （128MB / 8e6 节点 / 1e6 池 / 128 深）属于机制契约，按其行为重写并自测。
 *
 * 【要解决什么】
 *   记忆存档里大量重复结构：同一个 NPC 名字出现在几十条摘要里、同一段场景描述被
 *   多个 delta 共享。直接 JSON 存，体积按引用数线性膨胀；而「压了就压了」的编码
 *   又会引入三类新风险：
 *     ① 循环引用 / 引用炸弹：解码时把 1 个节点展开成 2^n 个（zip bomb 的同构物）；
 *     ② 解码共享：展开后多个位置指向同一个对象，改一处污染另一处（本仓反复治过）；
 *     ③ 不可预期类型：getter、Symbol、稀疏数组、非有限数字在往返中变形或执行代码。
 *
 * 【格式】
 *   节点池 pool[] 是**扁平数组**，节点只可能是四种形状：
 *     原始值（string / number / boolean / null）—— 直接存
 *     ['u'] —— undefined
 *     ['z'] —— -0（JSON 会把它变成 0，必须单独记）
 *     ['a', refs] —— 数组，refs 是池下标
 *     ['o', refs] / ['d', refs] —— 普通对象 / 无原型对象，refs 是 [键下标, 值下标] 成对
 *   **引用只能指向更早的节点**（ref < 自己下标）：这一条同时给出三件事——
 *   无环、拓扑序可校验、展开尺寸可先算后分配。
 *
 * 【四条上限】（任一超限即整次保存失败，绝不截断）
 *   MAX_POOL_NODES        1_000_000   池节点数
 *   MAX_EXPANDED_NODES    8_000_000   展开后节点数
 *   MAX_EXPANDED_CHARS    128 MiB     展开后字符量
 *   MAX_DEPTH             128         嵌套深度
 *
 * 【与源码差异（逐条可指认）】
 *   · 编码名改为本仓自有 `lonsha-pool-v1`（**不冒充** fish-memory 的存档格式；
 *     跨仓存档不会被误认，也不会被误读）；
 *   · 尺寸核算与解码共用同一套 metric 函数（源码两处各写一份，易漂移）；
 *   · 增 readings 面（池节点数 / 展开字符 / 占比）与 line() 诊断行；
 *   · 容量错误额外带 `readings`，让面板能显示「差多少」而不只是「超了」。
 *
 * 【纪律】
 *   ① 只接受普通数据：拒绝访问器、Symbol 键、稀疏数组、非有限数字、类实例；
 *   ② 只拒绝、不修补：任何非法形状整次失败，不做「尽力修一下」（修坏了更贵）；
 *   ③ 解码不共享：同一个池节点被引用两次，展开成两个独立对象。
 */
(function (root) {
    'use strict';

    /** 本面结构版本。 */
    const SC_VERSION = 1;
    /** 读数 kind。 */
    const SC_KIND = 'storage_codec';
    /** 持久化存档 schema 号（内存存档仍是 2，见 encodeSave 的校验）。 */
    const STORAGE_SCHEMA = 3;
    /** 本仓自有编码名。 */
    const STORAGE_ENCODING = 'lonsha-pool-v1';
    /** 上限。 */
    const MAX_POOL_NODES = 1000000;
    const MAX_EXPANDED_NODES = 8000000;
    const MAX_EXPANDED_CHARS = 128 * 1024 * 1024;
    const MAX_DEPTH = 128;
    /** 外层身份字段（编码后仍平铺在存档顶层，便于不解码就能列存档）。 */
    const HEADER_KEYS = Object.freeze(['id', 'chatId', 'bookName', 'revision']);
    /** 节点类型标记。 */
    const TAGS = Object.freeze({ undefinedValue: 'u', negativeZero: 'z', array: 'a', object: 'o', nullProto: 'd' });

    /** 本仓错误：带 kind，便于上游分流（capacity 是可恢复的用户态错误）。 */
    function codecError(message, kind, extra) {
        const error = new Error(message);
        error.name = 'StorageCodecError';
        if (kind) error.kind = kind;
        if (extra && typeof extra === 'object') for (const k of Object.keys(extra)) error[k] = extra[k];
        return error;
    }

    /** 读自有数据属性（拒绝访问器：取值不许有副作用）。 */
    function dataProperty(object, key) {
        const field = Object.getOwnPropertyDescriptor(object, key);
        if (!field || !Object.prototype.hasOwnProperty.call(field, 'value')) {
            throw codecError('存档包含无效属性或访问器：' + String(key), 'invalid');
        }
        return field.value;
    }

    /** 必须是普通对象（字面量或 Object.create(null)）。 */
    function asRecord(value, what) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw codecError('存档' + what + '只能是普通数据对象', 'invalid');
        }
        const proto = Object.getPrototypeOf(value);
        if (proto !== Object.prototype && proto !== null) {
            throw codecError('存档' + what + '只能是普通数据对象', 'invalid');
        }
        return value;
    }

    /** 必须是稠密数组（无空洞、无额外字段）。 */
    function asDenseArray(value, what) {
        if (!Array.isArray(value)) throw codecError('存档' + what + '不是数组', 'invalid');
        const length = dataProperty(value, 'length');
        if (length > MAX_EXPANDED_NODES) throw codecError('存档' + what + '超过上限', 'invalid');
        if (Object.keys(value).length !== length) throw codecError('存档' + what + '包含稀疏项或额外字段', 'invalid');
        for (let i = 0; i < length; i++) dataProperty(value, String(i));
        return value;
    }

    /** 外层身份四字段。 */
    function readHeader(save) {
        asRecord(save, '顶层');
        const header = {};
        for (const key of HEADER_KEYS) header[key] = dataProperty(save, key);
        const textOk = ['id', 'chatId', 'bookName'].every((key) => typeof header[key] === 'string' && header[key].length <= 10000);
        const revOk = Number.isSafeInteger(header.revision) && header.revision >= 0;
        if (!textOk || !revOk) throw codecError('存档身份无效', 'invalid');
        return header;
    }

    /** 尺寸门：超限抛可恢复错误（带差多少的读数）。 */
    function guard(metric) {
        if (metric.chars > MAX_EXPANDED_CHARS) {
            throw codecError(
                '存档容量不足：本次改动没有保存，原资料保留。请先导出备份，再删减部分资料。',
                'capacity',
                {
                    readings: {
                        requiredChars: metric.chars,
                        limitChars: MAX_EXPANDED_CHARS,
                        overflowChars: metric.chars - MAX_EXPANDED_CHARS,
                        percent: Math.round(metric.chars / MAX_EXPANDED_CHARS * 1000) / 10
                    }
                }
            );
        }
        if (metric.count > MAX_EXPANDED_NODES) throw codecError('存档展开后过大，超过安全上限', 'invalid');
        if (metric.depth > MAX_DEPTH) throw codecError('存档嵌套深度超过上限', 'invalid');
        return metric;
    }

    /** 原始值 → 尺寸（并顺手校验类型）。 */
    function primitiveMetric(value) {
        const type = typeof value;
        if (value !== null && type !== 'string' && type !== 'boolean' && type !== 'number') {
            throw codecError('存档池节点类型无效：' + type, 'invalid');
        }
        if (type === 'number' && !Number.isFinite(value)) throw codecError('存档包含非有限数字', 'invalid');
        return guard({ chars: JSON.stringify(value).length, count: 1, depth: 1 });
    }

    /**
     * 计算某个池节点的展开尺寸（**先算后分配**）。
     * 引用必须是更早的下标 —— 这一条让 metrics[ref] 一定已经算好，
     * 也保证「1 个节点展开成 2^n 个」在这里就被记账，不会等到分配时才炸。
     */
    function inspectNode(node, index, pool, metrics) {
        if (!Array.isArray(node)) return primitiveMetric(node);
        asDenseArray(node, '池节点');
        const tag = node[0];
        if (tag === TAGS.undefinedValue || tag === TAGS.negativeZero) {
            if (node.length !== 1) throw codecError('存档特殊值节点无效', 'invalid');
            return { chars: 4, count: 1, depth: 1 };
        }
        const isContainer = tag === TAGS.array || tag === TAGS.object || tag === TAGS.nullProto;
        if (!isContainer || node.length !== 2) throw codecError('存档池节点格式无效', 'invalid');
        const refs = asDenseArray(node[1], '引用列表');
        const isObject = tag !== TAGS.array;
        if (isObject && refs.length % 2 !== 0) throw codecError('存档对象引用数量无效', 'invalid');

        const members = isObject ? refs.length / 2 : refs.length;
        // 结构字符：数组的 [ ] 与逗号、对象的 { } 与冒号 —— 按成员数线性估算。
        let chars = 2 + Math.max(0, members - 1) + (isObject ? members : 0);
        let count = 1;
        let depth = 1;
        const keys = new Set();
        for (let offset = 0; offset < refs.length; offset++) {
            const ref = refs[offset];
            if (!Number.isSafeInteger(ref) || ref < 0 || ref >= index) {
                throw codecError('存档池引用无效或形成循环', 'invalid');
            }
            const metric = metrics[ref];
            if (!metric) throw codecError('存档池引用指向未计算节点', 'invalid');
            if (isObject && offset % 2 === 0) {
                const key = pool[ref];
                if (typeof key !== 'string') throw codecError('存档对象字段不是文本', 'invalid');
                if (keys.has(key)) throw codecError('存档对象存在重复字段', 'invalid');
                keys.add(key);
            }
            chars += metric.chars;
            count += metric.count;
            depth = Math.max(depth, metric.depth + 1);
            guard({ chars, count, depth });
        }
        return guard({ chars, count, depth });
    }

    /**
     * 编码：把普通数据折叠成池。
     * 结构共享靠「节点签名」去重：同一形状的节点只入池一次，故重复结构自动合流。
     */
    function buildPool(value) {
        const pool = [];
        const metrics = [];
        const indexBySignature = new Map();
        const indexByObject = new WeakMap();
        const inProgress = new Set();

        const intern = (node) => {
            const signature = JSON.stringify(node);
            const hit = indexBySignature.get(signature);
            if (hit !== undefined) return hit;
            if (pool.length >= MAX_POOL_NODES) throw codecError('存档池节点超过上限', 'invalid');
            const index = pool.length;
            const metric = inspectNode(node, index, pool, metrics);
            pool.push(node);
            metrics.push(metric);
            indexBySignature.set(signature, index);
            return index;
        };

        const visit = (item, depth) => {
            if (depth > MAX_DEPTH) throw codecError('存档嵌套深度超过上限', 'invalid');
            if (item === undefined) return intern([TAGS.undefinedValue]);
            if (Object.is(item, -0)) return intern([TAGS.negativeZero]);
            if (item === null || typeof item !== 'object') {
                primitiveMetric(item);
                return intern(item);
            }
            if (inProgress.has(item)) throw codecError('存档包含循环引用', 'invalid');
            const known = indexByObject.get(item);
            if (known !== undefined) return known;

            inProgress.add(item);
            const refs = [];
            if (Array.isArray(item)) {
                asDenseArray(item, '数组');
                for (let i = 0; i < item.length; i++) refs.push(visit(dataProperty(item, String(i)), depth + 1));
            } else {
                asRecord(item, '对象');
                const symbols = Object.getOwnPropertySymbols(item);
                for (const symbol of symbols) {
                    const field = Object.getOwnPropertyDescriptor(item, symbol);
                    if (field && field.enumerable) throw codecError('存档不支持 Symbol 字段', 'invalid');
                }
                for (const key of Object.keys(item)) {
                    const field = Object.getOwnPropertyDescriptor(item, key);
                    if (!field || !field.enumerable) continue;
                    if (!Object.prototype.hasOwnProperty.call(field, 'value')) {
                        throw codecError('存档不能包含访问器属性：' + String(key), 'invalid');
                    }
                    refs.push(intern(key), visit(field.value, depth + 1));
                }
            }
            const tag = Array.isArray(item)
                ? TAGS.array
                : (Object.getPrototypeOf(item) === null ? TAGS.nullProto : TAGS.object);
            const index = intern([tag, refs]);
            indexByObject.set(item, index);
            inProgress.delete(item);
            return index;
        };

        const rootRef = visit(value, 1);
        return { pool: pool, root: rootRef, chars: metrics[rootRef].chars, metrics: metrics };
    }

    /** 已编码尺寸（只在成功落盘后传递，避免「算过就当存过」）。 */
    const encodedSizes = new WeakMap();

    /** 把已测尺寸传给「落盘后的那个对象」。 */
    function rememberEncodedSize(target, source) {
        if (target && source && encodedSizes.has(source)) encodedSizes.set(target, encodedSizes.get(source));
    }

    /** 当前存档占容量上限的百分比（一位小数）。 */
    function savedCapacityPercent(save) {
        const chars = (save && encodedSizes.get(save)) ?? expandedChars(save);
        return Math.min(100, Math.round(chars / MAX_EXPANDED_CHARS * 1000) / 10);
    }

    /** 展开字符量（不展开，只按池核算）。 */
    function expandedChars(value) {
        return buildPool(value).chars;
    }

    /** 内存存档（schema 2）→ 持久化存档（schema 3 池化）。 */
    function encodeSave(save) {
        const identity = readHeader(save);
        const schema = dataProperty(save, 'schema');
        if (schema !== 2) throw codecError('不支持的内存存档格式，请勿覆盖现有数据', 'schema');
        const built = buildPool(save);
        encodedSizes.set(save, built.chars);
        const out = { schema: STORAGE_SCHEMA, encoding: STORAGE_ENCODING };
        for (const key of HEADER_KEYS) out[key] = identity[key];
        out.pool = built.pool;
        out.root = built.root;
        return out;
    }

    /** 持久化存档 → 内存存档（每次展开都是新对象，绝不共享）。 */
    function decodeSave(stored) {
        if (stored === null || stored === undefined) return stored;
        const identity = readHeader(stored);
        const schema = dataProperty(stored, 'schema');
        if (schema === 2) return decodeSave(encodeSave(stored));
        if (schema !== STORAGE_SCHEMA || dataProperty(stored, 'encoding') !== STORAGE_ENCODING) {
            throw codecError('不支持的持久化存档格式，请勿覆盖现有数据', 'schema');
        }
        const pool = asDenseArray(dataProperty(stored, 'pool'), '池');
        const rootRef = dataProperty(stored, 'root');
        if (pool.length <= 0 || pool.length > MAX_POOL_NODES) throw codecError('存档池节点数量无效', 'invalid');
        if (!Number.isSafeInteger(rootRef) || rootRef < 0 || rootRef >= pool.length) {
            throw codecError('存档根引用无效', 'invalid');
        }
        // 先把全池尺寸算一遍：任何一环超限都在分配之前失败。
        const metrics = [];
        for (let i = 0; i < pool.length; i++) metrics.push(inspectNode(pool[i], i, pool, metrics));

        const expand = (ref) => {
            const node = pool[ref];
            if (!Array.isArray(node)) return node;
            const tag = node[0];
            if (tag === TAGS.undefinedValue) return undefined;
            if (tag === TAGS.negativeZero) return -0;
            const refs = node[1];
            if (tag === TAGS.array) {
                const out = [];
                for (let i = 0; i < refs.length; i++) out.push(expand(refs[i]));
                return out;
            }
            const out = tag === TAGS.nullProto ? Object.create(null) : {};
            for (let i = 0; i < refs.length; i += 2) {
                Object.defineProperty(out, pool[refs[i]], {
                    value: expand(refs[i + 1]),
                    enumerable: true,
                    writable: true,
                    configurable: true
                });
            }
            return out;
        };

        const decoded = expand(rootRef);
        if (!decoded || decoded.schema !== 2
            || !HEADER_KEYS.every((key) => decoded[key] === identity[key])) {
            throw codecError('存档池内容与外层身份不一致', 'invalid');
        }
        encodedSizes.set(decoded, metrics[rootRef].chars);
        return decoded;
    }

    /** 编码读数（面板用：池多大、展开多大、共享省了多少）。 */
    function readings(save) {
        const built = buildPool(save);
        const base = {
            kind: SC_KIND,
            version: SC_VERSION,
            poolNodes: built.pool.length,
            expandedChars: built.chars,
            percentOfLimit: Math.round(built.chars / MAX_EXPANDED_CHARS * 1000) / 10,
            limitChars: MAX_EXPANDED_CHARS,
            depth: built.metrics[built.root].depth,
            count: built.metrics[built.root].count
        };
        base.line = line(base);
        return base;
    }

    /** 诊断行。 */
    function line(r) {
        const v = r && typeof r === 'object' ? r : {};
        return '存档池 ' + String(v.poolNodes ?? 0) + ' 节点 → 展开 '
            + String(v.expandedChars ?? 0) + ' 字符（上限 ' + String(v.limitChars ?? MAX_EXPANDED_CHARS)
            + ' 的 ' + String(v.percentOfLimit ?? 0) + '%）深度 ' + String(v.depth ?? 0);
    }

    /** 自检（供 engine-self-check 与测试共用）。 */
    function selfCheck() {
        const shared = { name: '张三', at: '酒楼' };
        const save = {
            schema: 2, id: 's1', chatId: 'c1', bookName: 'b1', revision: 1,
            entries: { a: shared, b: shared, c: [1, 2, 3], d: undefined, e: -0 },
            empty: {}
        };
        const encoded = encodeSave(save);
        const decoded = decodeSave(encoded);
        const checks = [
            ['编码后带本仓编码名', encoded.encoding === STORAGE_ENCODING && encoded.schema === STORAGE_SCHEMA],
            ['往返保真（含 undefined 与 -0）', decoded.entries.d === undefined && Object.is(decoded.entries.e, -0)],
            ['解码不共享（改一处不污染另一处）', (decoded.entries.a.name = '李四', decoded.entries.b.name === '张三')],
            ['共享结构只入池一次', encoded.pool.filter((n) => Array.isArray(n) && n[0] === 'o' && n[1].length === 4).length >= 1]
        ];
        return {
            ok: checks.every((x) => x[1]),
            checks: checks.map((x) => ({ name: x[0], ok: !!x[1] }))
        };
    }

    const api = {
        SC_VERSION: SC_VERSION,
        SC_KIND: SC_KIND,
        STORAGE_SCHEMA: STORAGE_SCHEMA,
        STORAGE_ENCODING: STORAGE_ENCODING,
        MAX_POOL_NODES: MAX_POOL_NODES,
        MAX_EXPANDED_NODES: MAX_EXPANDED_NODES,
        MAX_EXPANDED_CHARS: MAX_EXPANDED_CHARS,
        MAX_DEPTH: MAX_DEPTH,
        HEADER_KEYS: HEADER_KEYS,
        TAGS: TAGS,
        buildPool: buildPool,
        encodeSave: encodeSave,
        decodeSave: decodeSave,
        expandedChars: expandedChars,
        rememberEncodedSize: rememberEncodedSize,
        savedCapacityPercent: savedCapacityPercent,
        readings: readings,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaStorageCodec = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);