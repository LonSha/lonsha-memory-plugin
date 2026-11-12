/* ============================================================
 * tests/audit/_volatile_container_judge.mjs — v3.465.1 判定体（纯函数，不碰 fs）
 * ------------------------------------------------------------
 * 治什么：本仓有 **9 个心智引擎模块**的状态字段是 `Map` / `Set`。
 *   JSON 落盘时 `JSON.stringify({m:new Map([['a',1]])})` ＝ `{"m":{}}` ——
 *   **「存了 3 条」与「一条都没存」在文件上完全同形**。
 *
 *   这条缺陷在本仓有过**两次现形**，而且是同一条链的两端：
 *     ① 读取端：`hydrateState` 把 JSON 回来的普通对象原样写回字段
 *        ⇒ 此后每次 `.get` / `.has` / `.add` 全是 `TypeError`。
 *     ② 写入端：`collectExport` 把含 Map/Set 的状态对象**原样**塞进存档
 *        ⇒ 存档里那个字段永远是 `{}`，读取端无论怎么写都救不回来。
 *   v3.464.0 只修了 ①，写下「行为已实证：JSON 往返后 Map/Set 真被重建」——
 *   **那句话在当时的写入侧是假的**：真实链路里 Map 根本到不了 JSON。
 *   这正是本仓纪律「未执行不报通过」要拦的形态：探针自己构造 `JSON.stringify(默认状态)`，
 *   而 `JSON.stringify(Map)` 给的是 `{}`，探针读到空 Map 却当成「形状对了」。
 *
 * 本判定体把这条链拆成**三段**，各自可离线证伪：
 *   · 写入段 `flattenIssues`：给定活状态，摊平结果必须**不含任何 Map/Set 实例**
 *     （只要还剩一个，JSON 就会把它规约成 `{}`）；
 *   · 还原段 `unflattenIssues`：摊平 → JSON → 还原，容器形状与**元素**必须完全回来
 *     （只查 instanceof 不够：`new Map()` 也能过，但元素全丢 —— 那是空转的假通过）；
 *   · 读取段 `hydrateIssues`：还原后的载荷交给模块自己的 `hydrateState`，字段仍须是容器。
 *
 * 三分纪律：
 *   1. 摊平函数拿不到（签名漂移）⇒ 报 `probe-missing`，**不许当通过**；
 *   2. 三段各自单列，不合成一个布尔（写入坏 / 还原坏 / 读取坏的处置完全不同）；
 *   3. **元素级**核对，不只 instanceof —— 空 Map 能满足形状、不能满足语义。
 *
 * 诚实边界（写进 BOUNDARY，由判据钉住）：
 *   本判定只覆盖「状态对象的容器形状」这一件事。它**不**证明：
 *   · 这些引擎在真实 SillyTavern 会话里被真正跑过（无真机环境）；
 *   · 落盘/读档链路里没有别的环节再把状态改写（本仓别处还有多条 export/import 路径）；
 *   · 老存档（无 `__map` / `__set` 标记）能被无损迁移 —— 老存档里那些字段本来就是 `{}`，
 *     信息已经丢了，本版只能保证「从现在起不再丢」，不能凭空恢复历史数据。
 * ============================================================ */

export const QUESTION = {
    write: '含 Map/Set 的状态在落盘前必须被摊平成可序列化形态（否则 JSON 把它们规约成 {}，与「空」同形）',
    restore: '摊平 → JSON → 还原 之后，容器的**种类与元素**都必须回来（只查 instanceof 会放过空 Map）',
    read: '还原后的载荷交给模块自己的 hydrateState，字段仍须是容器且非空',
};

export const BOUNDARY = [
    '只覆盖状态对象的容器形状；不证明引擎在真机会话里真被跑到。',
    '不证明落盘/读档链路上没有别处再改写状态。',
    '老存档里那些字段本来就是 {}，信息已丢，本版只能保证「从现在起不再丢」。',
];

/* ---------- 形状探针 ---------- */

/** 递归找对象里残留的 Map/Set 实例，返回其路径（空数组 = 摊平彻底） */
export function leftoverContainers(value, prefix, out, depth) {
    const path = prefix || '';
    const list = out || [];
    const d = depth || 0;
    if (d > 10) return list;
    if (value instanceof Map) { list.push(path + ' (Map)'); return list; }
    if (value instanceof Set) { list.push(path + ' (Set)'); return list; }
    if (Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) leftoverContainers(value[i], path + '[' + i + ']', list, d + 1);
        return list;
    }
    if (value && typeof value === 'object') {
        for (const k of Object.keys(value)) leftoverContainers(value[k], path + '.' + k, list, d + 1);
    }
    return list;
}

/** 描述一个值的容器形状：'Map<n>' / 'Set<n>' / 'plain' / 'array<n>' */
export function containerShape(value) {
    if (value instanceof Map) return 'Map<' + value.size + '>';
    if (value instanceof Set) return 'Set<' + value.size + '>';
    if (Array.isArray(value)) return 'Array<' + value.length + '>';
    if (value && typeof value === 'object') return 'Object<' + Object.keys(value).length + '>';
    return String(typeof value);
}

/** 深比对（只比 JSON 可表达的部分；用于元素级核对） */
export function deepEqualJson(a, b) {
    const sa = stableJson(a);
    const sb = stableJson(b);
    return sa === sb;
}

export function stableJson(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (v instanceof Map) {
        const arr = [];
        for (const [k, val] of v.entries()) arr.push([String(k), stableJson(val)]);
        arr.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
        return 'Map[' + arr.map((p) => JSON.stringify(p[0]) + ':' + p[1]).join(',') + ']';
    }
    if (v instanceof Set) {
        const arr = [];
        for (const val of v.values()) arr.push(stableJson(val));
        arr.sort();
        return 'Set[' + arr.join(',') + ']';
    }
    if (Array.isArray(v)) return '[' + v.map(stableJson).join(',') + ']';
    const keys = Object.keys(v).sort();
    return '{' + keys.map((k) => JSON.stringify(k) + ':' + stableJson(v[k])).join(',') + '}';
}

/* ---------- 三段判定（各自返回 issue 数组，空 = 通过） ---------- */

/**
 * 写入段：给定一个活状态与摊平函数，摊平结果不得残留任何 Map/Set。
 * @param {object} state 活状态（含 Map/Set）
 * @param {(v:any)=>any} flatten 真源码里的摊平函数
 * @param {string} label 用例名（用于报错定位）
 */
export function flattenIssues(state, flatten, label) {
    const issues = [];
    if (typeof flatten !== 'function') {
        issues.push({ stage: 'probe-missing', label, why: '摊平函数未注入（签名漂移或未实现）' });
        return issues;
    }
    let flat;
    try {
        flat = flatten(state);
    } catch (e) {
        issues.push({ stage: 'flatten-threw', label, why: String(e && e.message || e) });
        return issues;
    }
    const left = leftoverContainers(flat, '', [], 0);
    for (const p of left) {
        issues.push({ stage: 'write', label, path: p, why: '摊平后仍残留容器实例，JSON 会把它规约成 {}' });
    }
    return issues;
}

/**
 * 还原段：摊平 → JSON 往返 → 还原，形状与元素都要回来。
 * @param {object} state 活状态
 * @param {(v:any)=>any} flatten
 * @param {(v:any)=>any} unflatten
 * @param {object} fields 字段名 -> 'Map'|'Set'（声明哪些字段是容器）
 */
export function unflattenIssues(state, flatten, unflatten, fields, label) {
    const issues = [];
    if (typeof flatten !== 'function' || typeof unflatten !== 'function') {
        issues.push({ stage: 'probe-missing', label, why: '摊平/还原函数未注入' });
        return issues;
    }
    let back;
    try {
        back = unflatten(JSON.parse(JSON.stringify(flatten(state))));
    } catch (e) {
        issues.push({ stage: 'roundtrip-threw', label, why: String(e && e.message || e) });
        return issues;
    }
    for (const [field, kind] of Object.entries(fields || {})) {
        const got = back && back[field];
        const shape = containerShape(got);
        if (kind === 'Map' && !(got instanceof Map)) {
            issues.push({ stage: 'restore', label, field, why: '应为 Map，实际 ' + shape });
            continue;
        }
        if (kind === 'Set' && !(got instanceof Set)) {
            issues.push({ stage: 'restore', label, field, why: '应为 Set，实际 ' + shape });
            continue;
        }
        const want = state && state[field];
        const wantSize = (want instanceof Map || want instanceof Set) ? want.size : 0;
        const gotSize = (got instanceof Map || got instanceof Set) ? got.size : 0;
        if (wantSize !== gotSize) {
            issues.push({
                stage: 'restore-loss', label, field,
                why: '元素数不符：原 ' + wantSize + ' / 回来 ' + gotSize + '（instanceof 对但内容是空的，属假通过）'
            });
            continue;
        }
        if (!deepEqualJson(want, got)) {
            issues.push({ stage: 'restore-loss', label, field, why: '元素内容不符（顺序无关深比对）' });
        }
    }
    return issues;
}

/**
 * 读取段：把还原后的载荷交给模块自己的 hydrateState，字段仍须是容器且元素数不减。
 * @param {object} state 活状态
 * @param {object} mod 模块导出面
 * @param {string} hydrator 该模块在宿主登记表里的水合函数名
 * @param {object} fields 字段名 -> 'Map'|'Set'
 */
export function hydrateIssues(state, mod, hydrator, fields, label, flatten, unflatten) {
    const issues = [];
    if (!mod || typeof mod[hydrator] !== 'function') {
        issues.push({ stage: 'probe-missing', label, why: '模块缺水合函数 ' + hydrator });
        return issues;
    }
    if (typeof flatten !== 'function' || typeof unflatten !== 'function') {
        issues.push({ stage: 'probe-missing', label, why: '摊平/还原函数未注入' });
        return issues;
    }
    let restored;
    try {
        restored = mod[hydrator](unflatten(JSON.parse(JSON.stringify(flatten(state)))));
    } catch (e) {
        issues.push({ stage: 'hydrate-threw', label, why: String(e && e.message || e) });
        return issues;
    }
    for (const [field, kind] of Object.entries(fields || {})) {
        const got = restored && restored[field];
        if (kind === 'Map' && !(got instanceof Map)) {
            issues.push({ stage: 'read', label, field, why: '水合后不是 Map：' + containerShape(got) });
            continue;
        }
        if (kind === 'Set' && !(got instanceof Set)) {
            issues.push({ stage: 'read', label, field, why: '水合后不是 Set：' + containerShape(got) });
            continue;
        }
        const want = state && state[field];
        const wantSize = (want instanceof Map || want instanceof Set) ? want.size : 0;
        const gotSize = (got instanceof Map || got instanceof Set) ? got.size : 0;
        if (gotSize < wantSize) {
            issues.push({
                stage: 'read', label, field,
                why: '水合后元素从 ' + wantSize + ' 掉到 ' + gotSize + '（形状对、内容丢）'
            });
        }
    }
    return issues;
}

/** 把 issue 数组压成一行行可读文本（判据里直接打） */
export function issueLines(issues) {
    return (issues || []).map((i) => '[' + i.stage + '] ' + (i.label || '') + (i.field ? ' .' + i.field : '') +
        ' — ' + (i.why || '') + (i.path ? ' @ ' + i.path : ''));
}