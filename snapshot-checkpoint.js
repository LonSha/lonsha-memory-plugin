/* ========================================================
 * snapshot-checkpoint.js — [v3.237.0] R4-C 命名检查点 + 分支只读对照
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   R4-B（v3.236.0）已把「快照恢复」的三份手抄清单收成单真源（42 面由 `_imp` 登记）。
 *   但登记出来的仍是**一份**：用户没有「取个名字存下来」这件事可用，于是——
 *     · 想「破坏之前先留一手」只能靠宿主自己的聊天存档（那是整会话级的，粒度不对）；
 *     · 想「对照看看改名前后差了什么」没有对象可对照：`restoreFromPayload` 只有
 *       `opts.dryRun` 一条预检路径，**没有第二个载荷可以并排比**。
 *   本模块把这两件补上，并刻意**不新建存储系统**：检查点落在调用方给的 store 上，
 *   载荷形状就是 `collectExport()` 的出口（同一套契约键，与恢复侧对称）。
 *
 * 【本模块的边界（不做的事）】
 *   · **不写引擎状态**：`saveCheckpoint` 只往 store 写；`readCheckpoint` /
 *     `listCheckpoints` / `previewRestore` / `compareCheckpoints` 全程零写。
 *   · **不执行恢复**：预览只出计划（键面差异 + 代际读数），不调 `restoreFromPayload`。
 *     真正落地仍走引擎那一条恢复管线（单真源，不为检查点另开一条导入路径）。
 *   · **不猜会话身份**：`chatId` 由调用方给；本模块不读全局聊天变量。
 *
 * 【本仓的老账（写进判据，防止再犯）】
 *   ① 「没给」与「给了 0」必须**不同形** —— 无 store / store 形态不合 / 无该会话记录时
 *      一律 `items === null`（并带 reason）；只有「store 在位且真的没有记录」才是 `[]`。
 *      同形正是 O-1 / R3-D / F-8 抓过的缺陷形态。
 *   ② 降级**必须留名** —— 名字非法不静默截断成别的名字，如实报 `name-invalid`。
 *   ③ 覆盖必须**可见** —— 同名再存会覆盖，返回值如实带 `overwritten:true` 与旧读数，
 *      不静默替换（否则「我以为存了两份」与「实际只剩一份」同形）。
 *   ④ 上限淘汰**必须报数** —— 超限淘汰最旧时返回 `evicted` 名单，不静默丢。
 *   ⑤ 读取**绝不抛** —— 宿主 store 的怪 getter / 畸形 JSON 一律降级为 reason，
 *      与 world-clock-reader 同规格（只读 / 不抛 / 不猜）。
 *
 * 【存储形状只此一份】
 *   本模块**是** localStorage 形状的唯一知情者：`fromLocalStorage()` 把
 *   `length` + `key(i)` 包成 `keys()`。其余函数只认
 *   `{ getItem, setItem, removeItem, keys() }`。
 *   为什么：v2.97 的教训是「桥有两种发布方式」被 9 个消费方各抄一遍形态判据；
 *   同一形状的判断只许存在一处。
 *
 * 挂 window.LonShaSnapshotCheckpoint，供 index.js 检查点方法族使用。
 * ======================================================== */
'use strict';
(function (global) {

/** 命名空间前缀：与宿主 localStorage 里的其他键隔离（同一个域会有别的插件）。 */
const NAMESPACE = 'lonsha-snapshot-checkpoint';
/** 单会话保留上限。超限淘汰**最旧**并如实报 evicted（不静默丢）。 */
const CHECKPOINT_LIMIT = 5;
/** 名字长度上限（含）——超过即报 name-invalid，不静默截断。 */
const NAME_MAX = 32;

/** 一句话归因（供诊断面念出；纯读）。 */
const REASONS = Object.freeze({
    'store-absent': '存储未给（无 store）',
    'store-mismatch': '存储形态不合（缺 keys()）',
    'store-threw': '存储读取抛异常',
    'no-chat-id': '缺会话身份',
    'name-invalid': '名字非法',
    'not-found': '没有这份检查点',
    'corrupt': '记录损坏（JSON 不可解析）',
    'ok': '就绪'
});

/** 安全调用（把宿主怪对象统一降级成 null，不抛）。 */
function safe(fn, dflt) {
    try { const v = fn(); return v === undefined ? dflt : v; } catch (_e) { return dflt; }
}

/**
 * [v3.239.0] 「没给」与「给了 0」的**唯一分界口**。
 *
 * 为什么必须有它（本版抓到的真缺陷）：本模块此前一律写 `Number.isFinite(Number(x)) ? Number(x) : null`，
 *   而这条判据在 `x === null` 时**恒真** —— `Number(null) === 0`，于是：
 *     · 调用方显式传 `floor: null`（「我不知道这是第几楼」）被静默存成 `floor: 0`，
 *       而 0 在本插件里**是合法楼层**（第 0 楼存在，见 v3.234.0 的 copySegment 修）；
 *     · 调用方显式传 `at: null` 被存成 `at: 0`（1970-01-01），面板显示与「最旧淘汰」排序一起失真；
 *     · `payloadMeta` 把 `schemaVersion: null`（未给代际）报成 `0`（「第 0 代」）——
 *       而 v3.238.0 的对照面正拿这个数出「跨代」结论，等于**给用户一个错读数**。
 *   这是 O-1 / R3-D / R2-C 同族缺陷的第三次出现，故这一次不修单点、修**判据本体**：
 *   全模块只此一处把「外部来的数值」判成数或 null，其余调用点一律走它。
 *
 * 分界（三态，逐条可证）：
 *   · `null` / `undefined` / `''` / 空白串 ⇒ `null`（「没给」）
 *   · 有限数（含 `0`、负数、数字串 '0'） ⇒ 该数（「给了 0」）
 *   · 其余（NaN / 对象 / 数组 / 非数字串 / 布尔） ⇒ `null`（给了但**不是数**；不抛、不猜）
 * 刻意**不**接受布尔：`true` 与 `1` 在这里是不同的东西，静默折算会让调用方的类型错误隐身。
 * @returns {number|null}
 */
function numOrNull(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'string' && v.trim() === '') return null;
    /* 布尔刻意不接受（true 与 1 不是一回事）；对象/数组/函数一律 null ——
     *   它们能骗过旧判据（`Number([])` 恒为 0），正是本版要断的那条路。
     *   与引擎侧 `_numOrNull` 同判据（A2 逐输入钉住等价）。 */
    if (typeof v === 'boolean' || typeof v === 'object' || typeof v === 'function') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * store 形态裁定（**唯一**一处）。
 * @returns {{ok:boolean, reason:string}}
 *   ok=false 时 reason ∈ { store-absent, store-mismatch }
 */
function probeStore(store) {
    if (store === null || store === undefined) return { ok: false, reason: 'store-absent' };
    if (typeof store !== 'object') return { ok: false, reason: 'store-absent' };
    // 三个动作 + 枚举，缺一不可：缺枚举就没法列清单（宁可报形态不合，也不假装列表为空）。
    // 注：取属性本身**必须**走 safe —— 宿主对象可能是带抛错 getter 的宿主代理
    //   （world-clock-reader 的同款教训），直接 `store[n]` 会在形态裁定这一步就外抛，
    //   而本模块对调用方的契约是「只读面绝不抛」。
    const has = (n) => typeof safe(() => store[n], undefined) === 'function';
    if (!has('getItem') || !has('setItem') || !has('removeItem') || !has('keys')) {
        return { ok: false, reason: 'store-mismatch' };
    }
    return { ok: true, reason: 'ok' };
}

/**
 * 把 localStorage 形状包成唯一契约形状。**本模块是唯一知情者。**
 *   localStorage 的枚举面是 `length` + `key(i)`；别处不得再写这个判断。
 * @returns {{getItem:Function,setItem:Function,removeItem:Function,keys:Function}|null}
 *   ls 形态不合（无 length / key / getItem / setItem / removeItem）即返回 null。
 */
function fromLocalStorage(ls) {
    if (!ls || typeof ls !== 'object') return null;
    if (typeof ls.getItem !== 'function' || typeof ls.setItem !== 'function' || typeof ls.removeItem !== 'function') return null;
    if (typeof ls.key !== 'function') return null;
    return {
        getItem: (k) => ls.getItem(k),
        setItem: (k, v) => ls.setItem(k, v),
        removeItem: (k) => ls.removeItem(k),
        keys: () => {
            const out = [];
            /* length 是**宿主给的**，不是调用方给的：这里接受「读不到就 0 条」（枚举面为空是合理退化）。 */
            const n = Math.max(0, numOrNull(safe(() => ls.length, 0)) || 0);
            for (let i = 0; i < n; i++) {
                const k = safe(() => ls.key(i), null);
                if (typeof k === 'string') out.push(k);
            }
            return out;
        }
    };
}

/** 名字规范化：非法即报非法（**不**静默截断、**不**改名救回）。 */
function normalizeName(raw) {
    const s = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!s) return { ok: false, reason: 'name-invalid', name: null };
    if (s.length > NAME_MAX) return { ok: false, reason: 'name-invalid', name: null };
    return { ok: true, reason: 'ok', name: s };
}

/** 会话身份：非空字符串才认（**不**编造默认值 —— 编了就跨会话串档）。 */
function normalizeChatId(raw) {
    const s = String(raw === undefined || raw === null ? '' : raw).trim();
    if (!s) return { ok: false, reason: 'no-chat-id', chatId: null };
    return { ok: true, reason: 'ok', chatId: s };
}

/** 复合键（会话 + 名字）——键形只此一处产出，防止两处各拼一遍拼不一致。 */
function checkpointKey(chatId, name) {
    return `${NAMESPACE}::${chatId}::${name}`;
}

/** 载荷读出可登记的顶层键面（与 collectExport / restoreFromPayload 同一套契约键）。 */
function payloadKeys(payload) {
    if (!payload || typeof payload !== 'object') return [];
    return Object.keys(payload).sort();
}

/** 载荷摘要读数（不含正文，只出规模与代际；供列表与对照显示）。 */
function payloadMeta(payload) {
    const p = (payload && typeof payload === 'object') ? payload : null;
    let bytes = 0;
    if (p) {
        // 规模用 JSON 长度近似（本插件的载荷是可序列化纯对象；序列化失败即记 0，不抛）。
        bytes = safe(() => JSON.stringify(p).length, 0) || 0;
    }
    return {
        keys: payloadKeys(p),
        keyCount: p ? Object.keys(p).length : 0,
        bytes,
        version: p && typeof p.version === 'string' ? p.version : null,
        producerVersion: p && typeof p.producerVersion === 'string' ? p.producerVersion : null,
        schemaVersion: p ? numOrNull(p.schemaVersion) : null,
        packedAt: p && typeof p.packedAt === 'string' ? p.packedAt : null
    };
}

/** 读一条原始记录（不抛；畸形即 corrupt）。 */
function readRaw(store, key) {
    const txt = safe(() => store.getItem(key), null);
    if (txt === null || txt === undefined) return { ok: false, reason: 'not-found', rec: null };
    let rec = null;
    try { rec = JSON.parse(String(txt)); } catch (_e) { return { ok: false, reason: 'corrupt', rec: null }; }
    if (!rec || typeof rec !== 'object') return { ok: false, reason: 'corrupt', rec: null };
    return { ok: true, reason: 'ok', rec };
}

/** 列本会话已存在的检查点元数据（**只读**）。keys() 抛异常即如实报 store-threw。 */
function listKeys(store, chatId) {
    const prefix = `${NAMESPACE}::${chatId}::`;
    const all = safe(() => store.keys(), null);
    if (!Array.isArray(all)) return { ok: false, reason: 'store-threw', keys: null };
    return { ok: true, reason: 'ok', keys: all.filter((k) => typeof k === 'string' && k.indexOf(prefix) === 0).sort() };
}

/**
 * 存一份检查点。
 * @param {object} store   契约形状（见 fromLocalStorage）
 * @param {{chatId:string,name:string,payload:object,at?:number,floor?:number,note?:string}} o
 * @returns {{
 *   ok:boolean, reason:string, key:string|null, name:string|null, at:number|null,
 *   meta:object|null, overwritten:boolean, previousAt:number|null,
 *   evicted:string[]|null, count:number|null
 * }}
 *   失败一律 `ok:false` 且 `reason` 可归因；**失败时不写任何键**。
 *   `evicted` 为 `null` 表示「淘汰面没查成」（与「查了、淘汰 0 份」的 `[]` 不同形）。
 */
function saveCheckpoint(store, o) {
    const opts = (o && typeof o === 'object') ? o : {};
    const st = probeStore(store);
    if (!st.ok) return { ok: false, reason: st.reason, key: null, name: null, at: null, meta: null, overwritten: false, previousAt: null, evicted: null, count: null };
    const nm = normalizeName(opts.name);
    if (!nm.ok) return { ok: false, reason: nm.reason, key: null, name: null, at: null, meta: null, overwritten: false, previousAt: null, evicted: null, count: null };
    const cid = normalizeChatId(opts.chatId);
    if (!cid.ok) return { ok: false, reason: cid.reason, key: null, name: nm.name, at: null, meta: null, overwritten: false, previousAt: null, evicted: null, count: null };

    const key = checkpointKey(cid.chatId, nm.name);
    /* [v3.239.0] `at` 的缺省**只在真没给时**取现在（与 floor 不同：时间戳可由本模块负责），
     *   但显式 `null` / 空串算「没给」，不得压成 0（1970）。 */
    const atGiven = numOrNull(opts.at);
    const at = atGiven === null ? Date.now() : atGiven;
    const floor = numOrNull(opts.floor);
    const meta = payloadMeta(opts.payload);

    // 覆盖可见：同名已有记录时，如实带出旧读数，不静默替换。
    const prev = readRaw(store, key);
    const overwritten = prev.ok === true;
    const previousAt = overwritten ? numOrNull(prev.rec.at) : null;

    const rec = {
        name: nm.name,
        chatId: cid.chatId,
        at,
        floor,
        note: typeof opts.note === 'string' ? opts.note : '',
        meta,
        payload: opts.payload && typeof opts.payload === 'object' ? opts.payload : null
    };
    const wrote = safe(() => { store.setItem(key, JSON.stringify(rec)); return true; }, false);
    if (!wrote) {
        return { ok: false, reason: 'store-threw', key, name: nm.name, at: null, meta: null, overwritten: false, previousAt: null, evicted: null, count: null };
    }

    // 上限淘汰：先列、后删最旧（按 at 升序，at 相同按名字定序保证确定性）。
    let evicted = null;
    let count = null;
    const listed = listCheckpoints(store, cid.chatId);
    if (listed.items !== null) {
        evicted = [];
        const items = listed.items.slice();
        const over = items.length - CHECKPOINT_LIMIT;
        if (over > 0) {
            const victims = items
                .slice()
                .sort((a, b) => (a.at - b.at) || String(a.name).localeCompare(String(b.name)))
                .slice(0, over);
            for (const v of victims) {
                if (v.name === nm.name) continue;   // 刚存的那份不淘汰（它是本次意图）
                const rk = safe(() => { store.removeItem(checkpointKey(cid.chatId, v.name)); return true; }, false);
                if (rk) evicted.push(v.name);
            }
        }
        count = listed.items.length - evicted.length + (listed.items.some((v) => v.name === nm.name) ? 0 : 1);
    }
    return { ok: true, reason: 'ok', key, name: nm.name, at, meta, overwritten, previousAt, evicted, count };
}

/**
 * 列本会话的检查点（**只读**）。
 * @returns {{ ok:boolean, reason:string, items:Array|null }}
 *   `items === null` 表示「没给 / 形态不合 / 读取抛」；`[]` 表示「store 在位、真的没有记录」。
 *   两者**必须不同形**（本仓老账 ①）。
 */
function listCheckpoints(store, chatId) {
    const st = probeStore(store);
    if (!st.ok) return { ok: false, reason: st.reason, items: null };
    const cid = normalizeChatId(chatId);
    if (!cid.ok) return { ok: false, reason: cid.reason, items: null };
    const ks = listKeys(store, cid.chatId);
    if (!ks.ok) return { ok: false, reason: ks.reason, items: null };
    const items = [];
    for (const k of ks.keys) {
        const r = readRaw(store, k);
        if (!r.ok) continue;   // 损坏条目跳过（不因一条坏记录让整份清单消失）
        const name = typeof r.rec.name === 'string' ? r.rec.name : k.slice(k.lastIndexOf('::') + 2);
        items.push({
            name,
            at: numOrNull(r.rec.at),
            floor: numOrNull(r.rec.floor),
            note: typeof r.rec.note === 'string' ? r.rec.note : '',
            meta: r.rec.meta && typeof r.rec.meta === 'object' ? r.rec.meta : null
        });
    }
    // 新的在前（列表用途是「最近存的那份在哪」）；at 缺失排最后。
    items.sort((a, b) => (b.at === null ? -1 : b.at) - (a.at === null ? -1 : a.at) || String(a.name).localeCompare(String(b.name)));
    return { ok: true, reason: 'ok', items };
}

/** 读一份检查点的完整记录（**只读**）。 */
function readCheckpoint(store, chatId, name) {
    const st = probeStore(store);
    if (!st.ok) return { ok: false, reason: st.reason, record: null };
    const cid = normalizeChatId(chatId);
    if (!cid.ok) return { ok: false, reason: cid.reason, record: null };
    const nm = normalizeName(name);
    if (!nm.ok) return { ok: false, reason: nm.reason, record: null };
    const r = readRaw(store, checkpointKey(cid.chatId, nm.name));
    if (!r.ok) return { ok: false, reason: r.reason, record: null };
    return { ok: true, reason: 'ok', record: r.rec };
}

/**
 * 删一份检查点（**唯一**的破坏性写动作，且只删自己命名空间下的键）。
 * @returns {{ ok:boolean, reason:string, existed:boolean }}
 *   不存在也报 `ok:true` + `existed:false`（幂等：删除不是「找不到就失败」）。
 */
function dropCheckpoint(store, chatId, name) {
    const st = probeStore(store);
    if (!st.ok) return { ok: false, reason: st.reason, existed: false };
    const cid = normalizeChatId(chatId);
    if (!cid.ok) return { ok: false, reason: cid.reason, existed: false };
    const nm = normalizeName(name);
    if (!nm.ok) return { ok: false, reason: nm.reason, existed: false };
    const key = checkpointKey(cid.chatId, nm.name);
    const existed = readRaw(store, key).ok === true;
    const done = safe(() => { store.removeItem(key); return true; }, false);
    if (!done) return { ok: false, reason: 'store-threw', existed };
    return { ok: true, reason: 'ok', existed };
}

/** 两个载荷的键面对照（纯函数，零写零读全局）。 */
function diffPayloads(a, b) {
    const ka = payloadKeys(a);
    const kb = payloadKeys(b);
    const setA = new Set(ka);
    const setB = new Set(kb);
    const onlyInA = ka.filter((k) => !setB.has(k));
    const onlyInB = kb.filter((k) => !setA.has(k));
    const shared = ka.filter((k) => setB.has(k));
    const ma = payloadMeta(a);
    const mb = payloadMeta(b);
    return {
        comparable: true,
        onlyInA, onlyInB, shared,
        sharedCount: shared.length,
        keyCountA: ka.length, keyCountB: kb.length,
        bytesA: ma.bytes, bytesB: mb.bytes, bytesDelta: mb.bytes - ma.bytes,
        versionA: ma.producerVersion || ma.version, versionB: mb.producerVersion || mb.version,
        schemaA: ma.schemaVersion, schemaB: mb.schemaVersion,
        sameSchema: ma.schemaVersion === mb.schemaVersion,
        empty: ka.length === 0 && kb.length === 0
    };
}

/**
 * 恢复预览（**只读**）：把「这份检查点相对当前运行时会带来什么差异」算出来。
 * 刻意**不执行**恢复——真正落地仍走 `restoreFromPayload` 那一条管线（单真源）。
 * @returns {{ ok:boolean, reason:string, diff:object|null, plan:object|null }}
 *   `plan` 只描述键面与代际，不承诺成功；调用方拿它给用户看，再决定是否真恢复。
 */
function previewRestore(store, chatId, name, currentPayload) {
    const got = readCheckpoint(store, chatId, name);
    if (!got.ok) return { ok: false, reason: got.reason, diff: null, plan: null };
    const payload = got.record ? got.record.payload : null;
    if (!payload || typeof payload !== 'object') {
        // 记录在、载荷没了 —— 与「没有这份检查点」是两件事，故单列。
        return { ok: false, reason: 'corrupt', diff: null, plan: null };
    }
    const diff = diffPayloads(currentPayload, payload);
    const plan = {
        name: got.record.name,
        at: numOrNull(got.record.at),
        floor: numOrNull(got.record.floor),
        // 「会新增 / 会缺字段 / 代际是否跨」三句人话，供 UI 直接念。
        willRestoreKeys: payloadKeys(payload),
        willRestoreCount: payloadKeys(payload).length,
        schemaCross: diff.sameSchema ? 'same' : 'cross',
        fromSchema: diff.schemaA,
        toSchema: diff.schemaB,
        dryRun: true
    };
    return { ok: true, reason: 'ok', diff, plan };
}

/**
 * 分支只读对照：两份检查点并排比（**只读**，不切分支、不合并、不写任何东西）。
 * @returns {{ ok:boolean, reason:string, diff:object|null, a:object|null, b:object|null }}
 *   任一侧缺失即如实报（`a-missing` / `b-missing`），不拿空载荷冒充「那边是空的」。
 */
function compareCheckpoints(store, chatId, nameA, nameB) {
    const a = readCheckpoint(store, chatId, nameA);
    if (!a.ok) return { ok: false, reason: a.reason === 'not-found' ? 'a-missing' : a.reason, diff: null, a: null, b: null };
    const b = readCheckpoint(store, chatId, nameB);
    if (!b.ok) return { ok: false, reason: b.reason === 'not-found' ? 'b-missing' : b.reason, diff: null, a: null, b: null };
    const pa = a.record && a.record.payload;
    const pb = b.record && b.record.payload;
    if (!pa || !pb) return { ok: false, reason: 'corrupt', diff: null, a: null, b: null };
    return {
        ok: true,
        reason: 'ok',
        diff: diffPayloads(pa, pb),
        a: { name: a.record.name, at: numOrNull(a.record.at), floor: numOrNull(a.record.floor) },
        b: { name: b.record.name, at: numOrNull(b.record.at), floor: numOrNull(b.record.floor) }
    };
}

/** 一句话归因（供诊断面念出；纯读）。 */
function describe(reason) {
    return REASONS[String(reason)] || String(reason === undefined || reason === null ? '未知' : reason);
}

const api = {
    NAMESPACE,
    CHECKPOINT_LIMIT,
    NAME_MAX,
    REASONS,
    probeStore,
    fromLocalStorage,
    numOrNull,
    normalizeName,
    normalizeChatId,
    checkpointKey,
    payloadKeys,
    payloadMeta,
    saveCheckpoint,
    listCheckpoints,
    readCheckpoint,
    dropCheckpoint,
    diffPayloads,
    previewRestore,
    compareCheckpoints,
    describe
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof global !== 'undefined' && global) {
    try { global.LonShaSnapshotCheckpoint = Object.freeze(api); } catch (_e) { /* 有些宿主冻结全局会抛，忽略 */ }
}
return api;
})(typeof window !== 'undefined' ? window : globalThis);
