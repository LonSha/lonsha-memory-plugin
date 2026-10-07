// branch-semantics.js — 分支语义对照与受控交接（Branch Semantics），v3.292.0 · X6
// ----------------------------------------------------------------------------
// 为什么存在（修前实测，不是整洁性偏好）：
//   本仓已有三件分支相关的东西，但**都答不了 X6 这一问**：
//     · branch-guard.js        —— 回答「这一楼这一代还算不算数」（生成期归因，三态队列）；
//     · snapshot-checkpoint.js —— 回答「两份检查点键面/规模/代际差在哪」（compareCheckpoints
//                                  + diffPayloads / diffPayloadsDeep）；
//     · ledger-replay.js       —— 回答「楼层归属如何回放」。
//   缺的是**用户能读懂的语义层**：diff 给出的是「键 facts[3].status 由 open 变 closed」，
//   而用户问的是「两个分支之间，**这个角色**的状态、**这些没办完的事**、**钱**、**剧情时间**
//   各差在哪，差异**来自哪一楼的哪一条**，以及**采用它会不会撞车**」。
//   实测后果（三条，各自都能复现）：
//     ① 未知字段与缺模块**同形**：diff 只说「onlyInA」，看不出那一侧是「模块压根没装」
//        还是「装了但这字段就是空的」—— 两者处置完全相反（前者不可比，后者可比）；
//     ② 秘密**跨支混入**：A 支的 keeper/secret 标记条目在对照面与 B 支并排显示，
//        读的人拿 B 支身份就读到 A 支的保密项（X6 验收原话：「A 分支秘密不混入 B」）；
//     ③ 冲突靠「较新一律覆盖」：两个分支同 owner 同字段不同值，导出提案时没有判据，
//        默认谁 floor 大谁赢 —— 而「较新」与「更对」是两件事（回档后的旧值反而正确）。
//
//   本模块**只做语义层**：把上面① ② ③ 各给一条可复算的判定，且
//   **不改** branch-guard / snapshot-checkpoint / ledger-replay 的任何既有判定与出口。
//   diff 仍由 snapshot-checkpoint.diffPayloads* 算（单一真源），本模块只在其上做**归类与过滤**。
//
// 四个口径（一条也不省）：
//   ① 逐 owner 出对照，不外泄未定字段：`compareOwners` 按 owner 实体 id 分组，
//      分五面（factVersion / characterState / unfinished / money / storyTime）出读数；
//      每一面都带 `from`（来源楼层）与 `scope`（有效范围：分支内 / 跨支共用）。
//   ② 缺模块与空字段**不同形**：`modulePresence` 三态（present / absent / unknown）,
//      absent 的面一律 `comparable:false` 且**不参与冲突判定**（不可比 ≠ 相等）。
//   ③ 秘密边界：`filterByKeeper(entries, viewer)` —— 带 keeper 且 viewer 不在 keeper 名单内的
//      条目一律剔除，且**剔除计数可见**（不静默少条）。同名异人按实体 id，不按名字。
//   ④ 冲突不靠「较新」：`classifyConflict` 出四档 —— `same-value` / `newer-wins`（**仅当
//      另一侧无有效回源**）/ `stale-source`（较新的一方来自已回档楼层）/ `undecided`（判不开）。
//      「较新」只是**输入之一**，绝不是默认结论。
//
// 受控交接（导入）三步不可合并，语义各不相同：
//   proposeImport   —— 逐项提案（草稿）：只产出提案，不落笔；
//   precheckImport  —— 预检：把目标侧冲突 / 知识边界 / 派生依赖各查一遍，出 blocked/warn/ok；
//   confirmImport   —— 确认：生成回执（receipt），**幂等**（同 proposalId 重试不重复应用）、
//                      **可回源**（receipt 带 sourceRef）、**保存后回读**（readback 三态）。
//   为什么分三步：合成一个 `importAll` 会让「没预检就落笔」与「预检不过仍落笔」无法区分，
//   而 X6 验收原话正是「避免全档自动合并」—— 自动合并的形态就是这三步被压成一步。
//
// 明确不做（边界，显式声明）：
//   · 不切分支、不写分支、不合并分支：本模块全部出口**只读**，落笔由调用方走既有 owner/epoch；
//   · 不自建持久化：回执与草稿由调用方持有（本仓治理：楼层归属单一真源在 ledger-replay）；
//   · 不判「谁是对的」：`undecided` 就是判不开，**不猜**（猜错比留空更坏）。
//
// 纪律：纯函数、零依赖、IIFE + CJS 双导出；三态归因 ok / absent / threw；绝不外抛。
(function (root) {
    'use strict';
    const BRANCH_SEMANTICS_VERSION = 1;

    // 五面（X6 原话点名的五类：事实版本 / 角色状态 / 未了事项 / 金钱 / 剧情时间）。
    const FACES = Object.freeze(['factVersion', 'characterState', 'unfinished', 'money', 'storyTime']);
    // 模块在场三态。unknown 与 absent 是两件事：
    //   absent  = 已知该侧没装这个模块（面不可比）；
    //   unknown = 压根没告诉我们装没装（同样不可比，但原因不同，读数要分列）。
    const PRESENCE = Object.freeze({ PRESENT: 'present', ABSENT: 'absent', UNKNOWN: 'unknown' });
    // 冲突四档。**没有** `newer` 这一档作为默认结论 —— 见 classifyConflict 档头。
    const CONFLICT = Object.freeze({
        SAME: 'same-value',
        NEWER: 'newer-wins',
        STALE: 'stale-source',
        UNDECIDED: 'undecided',
    });
    // 预检三档。
    const PRECHECK = Object.freeze({ OK: 'ok', WARN: 'warn', BLOCKED: 'blocked' });
    // 回读三态（保存后核对）。
    const READBACK = Object.freeze({ OK: 'ok', MISMATCH: 'mismatch', UNREADABLE: 'unreadable' });
    // 提案动作。
    const ACTION = Object.freeze({ ADD: 'add', REPLACE: 'replace', SKIP: 'skip' });

    /** 有限楼层（缺失给 null，不拿 0 冒充「就是第 0 楼」）。 */
    function floorOf(v) {
        const n = Number(v);
        if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
        return Number.isFinite(n) ? Math.round(n) : null;
    }
    /** 取整有限数（未给给 null）。 */
    function numOf(v) {
        if (v === null || v === undefined || v === '' || typeof v === 'boolean' || Array.isArray(v)) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    /** 名字/键归一（去首尾空白；非串给空串）。 */
    function keyOf(v) {
        return (typeof v === 'string') ? v.trim() : (v === null || v === undefined ? '' : String(v).trim());
    }
    /**
     * 值等价（**值级**，不是引用级）。对象/数组走稳定序列化。
     * 为什么不用 `===`：两分支的同一条事实在不同分支里是两份对象，
     * 引用必然不等 —— 用 `===` 会把「值相同」一律判成冲突（假红）。
     */
    function sameValue(a, b) {
        if (a === b) return true;
        const ta = a === null ? 'null' : typeof a;
        const tb = b === null ? 'null' : typeof b;
        if (ta !== tb) return false;
        if (ta === 'number') return (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b);
        if (ta !== 'object') return false;
        try { return stable(a) === stable(b); } catch (_e) { return false; }
    }
    /** 稳定序列化（键序固定；环与超深标 [~] 而不是抛）。 */
    function stable(v, depth, seen) {
        const d = Number.isFinite(depth) ? depth : 0;
        const s = seen || [];
        if (d > 8) return '[~]';
        if (v === null) return 'null';
        const t = typeof v;
        if (t === 'number') return Number.isNaN(v) ? 'NaN' : String(v);
        if (t === 'string') return JSON.stringify(v);
        if (t === 'boolean') return String(v);
        if (t === 'undefined') return 'undef';
        if (t !== 'object') return String(v);
        if (s.indexOf(v) >= 0) return '[cycle]';
        s.push(v);
        try {
            if (Array.isArray(v)) return '[' + v.map(function (x) { return stable(x, d + 1, s); }).join(',') + ']';
            const keys = Object.keys(v).sort();
            return '{' + keys.map(function (k) {
                return JSON.stringify(k) + ':' + stable(v[k], d + 1, s);
            }).join(',') + '}';
        } finally { s.pop(); }
    }
    /** 三态归因包一层：任何一处抛都降级成一条报告，不阻断调用方。 */
    function safe(fn, fallback) {
        try { return fn(); } catch (e) { return (typeof fallback === 'function') ? fallback(e) : fallback; }
    }

    /* ────────────────────────────────────────
     * ① 模块在场三态
     * ──────────────────────────────────────── */
    /**
     * 判定某一侧某模块的在场状态。
     * @param {*} side 该侧载荷（或它的 modules 表）
     * @param {string} name 模块名（如 'fact-version'）
     * @returns {{state:string, reason:string}}
     *   present —— 表里显式声明为真；
     *   absent  —— 表里显式声明为假 / 缺失该模块**但表本身在**（我们确实知道没装）；
     *   unknown —— 压根没有 modules 表（我们**不知道**装没装，不得当缺席）。
     */
    function presenceOf(side, name) {
        const nm = keyOf(name);
        if (!nm) return { state: PRESENCE.UNKNOWN, reason: 'no-name' };
        const src = (side && typeof side === 'object') ? side : null;
        if (!src) return { state: PRESENCE.UNKNOWN, reason: 'no-side' };
        const mods = (src.modules && typeof src.modules === 'object') ? src.modules : null;
        if (!mods) return { state: PRESENCE.UNKNOWN, reason: 'no-module-table' };
        if (!Object.prototype.hasOwnProperty.call(mods, nm)) {
            // 有表但没这一项：按 absent 报（表是声明，声明里没有就是没装）。
            return { state: PRESENCE.ABSENT, reason: 'not-declared' };
        }
        const v = mods[nm];
        if (v === true) return { state: PRESENCE.PRESENT, reason: 'declared' };
        if (v === false) return { state: PRESENCE.ABSENT, reason: 'declared-absent' };
        if (v && typeof v === 'object' && v.present === true) return { state: PRESENCE.PRESENT, reason: 'object-present' };
        if (v && typeof v === 'object' && v.present === false) return { state: PRESENCE.ABSENT, reason: 'object-absent' };
        return { state: PRESENCE.UNKNOWN, reason: 'unreadable-declaration' };
    }

    /* ────────────────────────────────────────
     * ③ 秘密边界：按 viewer 过滤 keeper 条目
     * ──────────────────────────────────────── */
    /**
     * 把带 keeper 的条目按**观察者**过滤。
     * 口径（X6 验收「A 分支秘密不混入 B」）：
     *   · 条目无 keeper：公开，任何人可见；
     *   · 条目有 keeper 且 viewer 在名单内：可见；
     *   · 条目有 keeper 且 viewer 不在名单内：**剔除**；
     *   · viewer 为空：只见公开条目（**不得**因「不知道看的人是谁」就全放行）。
     * 剔除**计数可见**（hidden），不静默少条 —— 静默少条会让「被过滤」读成「本来就没有」。
     * 名单比较用**实体 id 优先**：条目带 keeperIds 时按 id，否则退到 keeper 名
     * （同名异人风险如实登记在 hiddenBy）。
     * @returns {{visible:Array, hidden:number, hiddenBy:string, total:number}}
     */
    function filterByKeeper(entries, viewer) {
        const list = Array.isArray(entries) ? entries : [];
        const vw = (viewer && typeof viewer === 'object') ? viewer : { id: keyOf(viewer) };
        const vId = keyOf(vw.id);
        const vName = keyOf(vw.name || vw.id);
        const visible = [];
        let hidden = 0;
        let byName = 0;
        /* [v3.292.0] 按名字命中的条数（无论放行还是剔除）：这条路本身有同名异人风险，
         *   必须**数得出来** —— 看不见的匹配风险比看得见的排除更危险。 */
        let nameMatched = 0;
        for (const e of list) {
            if (!e || typeof e !== 'object') { visible.push(e); continue; }
            const ids = Array.isArray(e.keeperIds) ? e.keeperIds.map(keyOf).filter(Boolean) : [];
            const names = Array.isArray(e.keeper) ? e.keeper.map(keyOf).filter(Boolean)
                : (e.keeper === null || e.keeper === undefined ? [] : [keyOf(e.keeper)]);
            const isPublic = ids.length === 0 && names.length === 0;
            if (isPublic) { visible.push(e); continue; }
            if (ids.length) {
                // 有实体 id：严格按 id 比（同名异人不会串）。
                if (vId && ids.indexOf(vId) >= 0) { visible.push(e); continue; }
                hidden++;
                continue;
            }
            // 只有名字：按名比，但这条路本身有同名异人风险，单列计数。
            if (vName && names.indexOf(vName) >= 0) { nameMatched++; visible.push(e); continue; }
            hidden++;
            byName++;
        }
        return {
            visible: visible,
            hidden: hidden,
            hiddenBy: byName ? 'name-only-kept :' + byName : '',
            nameMatched: nameMatched,
            total: list.length,
        };
    }

    /* ────────────────────────────────────────
     * ④ 冲突四档：不靠「较新一律覆盖」
     * ──────────────────────────────────────── */
    /**
     * 两分支同 owner 同字段的差异归类。
     * 为什么**不**写成 `return a.floor > b.floor ? 'a' : 'b'`：
     *   楼层只说明**何时写的**，不说明**哪份对**。回档（swipe 回退 / 撤销 / 读档）之后，
     *   「较早写下的」那一份往往才是当前有效值，而「较新」那份来自一个已经不存在的历史。
     *   把「较新」当默认结论，正是 X6 验收点名要避免的「冲突由较新一律覆盖」。
     * 四档语义：
     *   same-value  —— 值级相同，无冲突（**不同 floor 也算 same**：不是每条差异都是冲突）；
     *   newer-wins  —— 较新一侧**有有效回源**（sourceValid !== false）且较旧一侧没有；
     *   stale-source—— 较新一侧来自**已失效回源**（sourceValid === false）⇒ 旧的反而更可信；
     *   undecided   —— 两侧都有效或都失效、或楼层缺失/相等、或判不开 ⇒ **留空，不猜**。
     * @returns {{verdict:string, winner:string|null, reason:string, aFloor:number|null, bFloor:number|null}}
     */
    function classifyConflict(a, b) {
        const oa = (a && typeof a === 'object') ? a : {};
        const ob = (b && typeof b === 'object') ? b : {};
        const fa = floorOf(oa.floor);
        const fb = floorOf(ob.floor);
        if (sameValue(oa.value, ob.value)) {
            return { verdict: CONFLICT.SAME, winner: null, reason: 'values-equal', aFloor: fa, bFloor: fb };
        }
        // 回源有效性：未声明视为「有效」（本仓 fail-open 面），但一旦声明为假就按失效走。
        const va = (oa.sourceValid === false) ? false : true;
        const vb = (ob.sourceValid === false) ? false : true;
        if (fa === null || fb === null) {
            return { verdict: CONFLICT.UNDECIDED, winner: null, reason: 'floor-unknown', aFloor: fa, bFloor: fb };
        }
        if (fa === fb) {
            return { verdict: CONFLICT.UNDECIDED, winner: null, reason: 'same-floor', aFloor: fa, bFloor: fb };
        }
        const aNewer = fa > fb;
        const newerSide = aNewer ? 'a' : 'b';
        const newerValid = aNewer ? va : vb;
        const olderValid = aNewer ? vb : va;
        if (!newerValid && olderValid) {
            return { verdict: CONFLICT.STALE, winner: aNewer ? 'b' : 'a', reason: 'newer-source-invalid', aFloor: fa, bFloor: fb };
        }
        if (newerValid && !olderValid) {
            return { verdict: CONFLICT.NEWER, winner: newerSide, reason: 'only-newer-valid', aFloor: fa, bFloor: fb };
        }
        // 都有效或都失效：**不靠较新取胜**，如实判不开。
        return {
            verdict: CONFLICT.UNDECIDED,
            winner: null,
            reason: (newerValid && olderValid) ? 'both-valid' : 'both-invalid',
            aFloor: fa, bFloor: fb,
        };
    }

    /* ────────────────────────────────────────
     * ② 逐 owner 语义对照
     * ──────────────────────────────────────── */
    /**
     * 把一份载荷按 owner 实体 id 收成分面读数。
     * 载荷形态（宽容）：`{ owners: { <id>: { factVersion:[...], characterState:{...}, ... } } }`
     *   或直接 `{ <id>: {...} }`（无 owners 包层时按顶层键当 id，但**跳过**保留键）。
     *   owners 项里的每一面容器允许是数组（条目列表）或对象（键值面）。
     * @returns {Map<string, object>} id -> 该项（原样持引用，不深拷贝）
     */
    function ownersOf(side) {
        const out = new Map();
        const src = (side && typeof side === 'object') ? side : null;
        if (!src) return out;
        const bag = (src.owners && typeof src.owners === 'object') ? src.owners : src;
        for (const id of Object.keys(bag)) {
            if (!bag || typeof bag[id] !== 'object') continue;
            out.set(keyOf(id), bag[id]);
        }
        return out;
    }
    /** 取某一面在该 owner 项下的容器（数组/对象都收；缺就给空形态，**并标 present:false**）。 */
    function faceOf(ownerRec, faceName) {
        const rec = (ownerRec && typeof ownerRec === 'object') ? ownerRec : {};
        const v = rec[faceName];
        if (v === undefined || v === null) return { present: false, list: [], map: {}, raw: null };
        if (Array.isArray(v)) return { present: true, list: v, map: {}, raw: v };
        if (typeof v === 'object') return { present: true, list: [], map: v, raw: v };
        return { present: true, list: [], map: {}, raw: v };
    }
    /**
     * 条目身份键优先级：`id` → `factId`/`eventId`/`itemId`/`commitmentId`/`key` → `name` →
     * 位置下标（兜底，并带上 `#i` 标记让读数能看出「这条是按位置对的，不是按身份」）。
     */
    function entryKeyOf(entry, idx) {
        if (!entry || typeof entry !== 'object') return '#i' + idx;
        for (const k of ['id', 'factId', 'eventId', 'itemId', 'commitmentId', 'key']) {
            const v = entry[k];
            if (typeof v === 'string' && v.trim()) return v.trim();
        }
        if (typeof entry.name === 'string' && entry.name.trim()) return entry.name.trim();
        return '#i' + idx;
    }
    /** 单据一条差异（含来源楼层与有效范围）。 */
    function makeDelta(kind, key, aVal, bVal, aEntry, bEntry) {
        const oa = (aEntry && typeof aEntry === 'object') ? aEntry : {};
        const ob = (bEntry && typeof bEntry === 'object') ? bEntry : {};
        return {
            kind: kind,               // only-in-a / only-in-b / changed
            key: key,
            a: aVal, b: bVal,
            from: {
                a: floorOf(oa.floor !== undefined ? oa.floor : oa.sourceFloor),
                b: floorOf(ob.floor !== undefined ? ob.floor : ob.sourceFloor),
            },
            scope: {
                // 有效范围：两侧都带 scope 时如实并列；缺就给 'unknown'（不猜成「同支」）。
                a: typeof oa.scope === 'string' ? oa.scope : 'unknown',
                b: typeof ob.scope === 'string' ? ob.scope : 'unknown',
            },
        };
    }
    /** 数组面逐条对照。 */
    function compareListFace(la, lb) {
        const mapA = new Map(); const mapB = new Map();
        la.forEach(function (e, i) { mapA.set(entryKeyOf(e, i), e); });
        lb.forEach(function (e, i) { mapB.set(entryKeyOf(e, i), e); });
        const deltas = [];
        const keys = [];
        for (const k of mapA.keys()) keys.push(k);
        for (const k of mapB.keys()) if (!mapA.has(k)) keys.push(k);
        keys.sort();
        for (const k of keys) {
            const inA = mapA.has(k); const inB = mapB.has(k);
            if (inA && !inB) { deltas.push(makeDelta('only-in-a', k, mapA.get(k), null, mapA.get(k), null)); continue; }
            if (!inA && inB) { deltas.push(makeDelta('only-in-b', k, null, mapB.get(k), null, mapB.get(k))); continue; }
            const ea = mapA.get(k); const eb = mapB.get(k);
            const va = (ea && typeof ea === 'object' && 'value' in ea) ? ea.value : ea;
            const vb = (eb && typeof eb === 'object' && 'value' in eb) ? eb.value : eb;
            if (!sameValue(va, vb)) deltas.push(makeDelta('changed', k, va, vb, ea, eb));
        }
        return deltas;
    }
    /** 对象面逐键对照。 */
    function compareMapFace(ma, mb) {
        const deltas = [];
        const keys = [];
        for (const k of Object.keys(ma)) keys.push(k);
        for (const k of Object.keys(mb)) if (!Object.prototype.hasOwnProperty.call(ma, k)) keys.push(k);
        keys.sort();
        for (const k of keys) {
            const inA = Object.prototype.hasOwnProperty.call(ma, k);
            const inB = Object.prototype.hasOwnProperty.call(mb, k);
            if (inA && !inB) { deltas.push(makeDelta('only-in-a', k, ma[k], null, ma[k], null)); continue; }
            if (!inA && inB) { deltas.push(makeDelta('only-in-b', k, null, mb[k], null, mb[k])); continue; }
            if (!sameValue(ma[k], mb[k])) deltas.push(makeDelta('changed', k, ma[k], mb[k], ma[k], mb[k]));
        }
        return deltas;
    }

    /**
     * [X6 主出口 ①] 两分支逐 owner 语义只读对照。
     * **只读**：不切分支、不写任何东西、不动全局。
     * @param {*} sideA 侧 A 载荷（含 owners）
     * @param {*} sideB 侧 B 载荷
     * @param {{modules?:object, viewer?:object|string, maxDeltas?:number}} [opts]
     *   viewer  —— 观察者（做秘密边界过滤；不传则只看公开条目）；
     *   maxDeltas —— 每面最多列出多少条（**截断可见**：truncated 报真实条数）。
     * @returns {object} 逐 owner 五面读数 + 不可比面清单 + 缺模块清单 + 截断读数
     */
    function compareOwners(sideA, sideB, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const maxD = (Number.isFinite(o.maxDeltas) && o.maxDeltas >= 1) ? Math.floor(o.maxDeltas) : 200;
        const viewer = o.viewer;
        const mapA = ownersOf(sideA);
        const mapB = ownersOf(sideB);
        const ids = [];
        for (const id of mapA.keys()) ids.push(id);
        for (const id of mapB.keys()) if (!mapA.has(id)) ids.push(id);
        ids.sort();
        const owners = [];
        const incomparableFaces = [];
        for (const id of ids) {
            const ra = mapA.get(id) || {};
            const rb = mapB.get(id) || {};
            const rec = { id: id, present: { a: mapA.has(id), b: mapB.has(id) }, faces: {}, deltas: [], hidden: 0 };
            for (const face of FACES) {
                const fa = faceOf(ra, face);
                const fb = faceOf(rb, face);
                // 缺模块判定：显式声明缺席 ⇒ 该面不可比（**不参与冲突判定**）。
                const pa = presenceOf(sideA, face);
                const pb = presenceOf(sideB, face);
                const absent = pa.state === PRESENCE.ABSENT || pb.state === PRESENCE.ABSENT;
                const unknown = pa.state === PRESENCE.UNKNOWN || pb.state === PRESENCE.UNKNOWN;
                // 秘密边界：条目面先按 viewer 过滤。
                let la = fa.list; let lb = fb.list;
                let hid = 0;
                if (fa.list.length || fb.list.length) {
                    const gA = filterByKeeper(fa.list, viewer);
                    const gB = filterByKeeper(fb.list, viewer);
                    la = gA.visible; lb = gB.visible;
                    hid += gA.hidden + gB.hidden;
                }
                rec.hidden += hid;
                let deltas;
                if (fa.list.length || fb.list.length) deltas = compareListFace(la, lb);
                else deltas = compareMapFace(fa.map, fb.map);
                const truncated = deltas.length > maxD;
                const listed = truncated ? deltas.slice(0, maxD) : deltas;
                rec.faces[face] = {
                    comparable: !absent && !unknown,
                    presence: { a: pa.state, b: pb.state },
                    deltas: listed,
                    deltaCount: deltas.length,
                    truncated: truncated,
                    hidden: hid,
                    // 面本身在这一侧有没有容器（与「模块在不在」是两件事）。
                    containerPresent: { a: fa.present, b: fb.present },
                };
                if (absent || unknown) {
                    incomparableFaces.push({
                        owner: id, face: face,
                        why: absent ? 'module-absent' : 'module-presence-unknown',
                    });
                }
                for (const d of listed) rec.deltas.push(Object.assign({ face: face }, d));
            }
            owners.push(rec);
        }
        // 缺模块清单（去重，按面名）。
        const absentModules = [];
        const unknownModules = [];
        for (const f of FACES) {
            const p = presenceOf(sideA, f);
            const q = presenceOf(sideB, f);
            if (p.state === PRESENCE.ABSENT || q.state === PRESENCE.ABSENT) absentModules.push(f);
            else if (p.state === PRESENCE.UNKNOWN || q.state === PRESENCE.UNKNOWN) unknownModules.push(f);
        }
        return {
            ok: true, reason: 'ok', readOnly: true,
            owners: owners,
            ownerCount: owners.length,
            incomparableFaces: incomparableFaces,
            absentModules: absentModules,
            unknownModules: unknownModules,
        };
    }

    /* ────────────────────────────────────────
     * 受控交接：提案 / 预检 / 确认
     * ──────────────────────────────────────── */
    /**
     * [X6 主出口 ②] 逐项提案（草稿）。**只产出提案，不落笔**。
     * 每条提案带：目标 owner/面/键、动作（add/replace/skip）、来源楼层与 scope、冲突裁定。
     * 无变化的条目不提案（skip 且不计入 proposals，单列 skipped 计数）。
     * @param {object} comparison compareOwners 的产出
     * @param {{targetOwner?:string, includeFaces?:string[], allowStale?:boolean}} [opts]
     * @returns {{ok:boolean, reason:string, proposals:Array, skipped:number, undecided:number}}
     */
    function proposeImport(comparison, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const only = Array.isArray(o.includeFaces) && o.includeFaces.length ? o.includeFaces : null;
        const cmp = (comparison && typeof comparison === 'object') ? comparison : null;
        if (!cmp || !Array.isArray(cmp.owners)) {
            return { ok: false, reason: 'no-comparison', proposals: [], skipped: 0, undecided: 0 };
        }
        const proposals = [];
        let skipped = 0;
        let undecided = 0;
        for (const rec of cmp.owners) {
            if (o.targetOwner && keyOf(o.targetOwner) !== rec.id) continue;
            for (const face of FACES) {
                if (only && only.indexOf(face) < 0) continue;
                const fr = rec.faces[face];
                if (!fr) continue;
                // 不可比的面**不出提案**：不可比 ≠ 可以按现状合并。
                if (!fr.comparable) { skipped += fr.deltaCount || 0; continue; }
                for (const d of fr.deltas) {
                    let action;
                    let verdict = null;
                    let reason = '';
                    if (d.kind === 'only-in-b') { action = ACTION.ADD; reason = 'target-side-absent'; }
                    else if (d.kind === 'only-in-a') { action = ACTION.SKIP; reason = 'source-only-not-imported'; }
                    else {
                        const c = classifyConflict(
                            { value: d.a, floor: d.from.a, sourceValid: (d.scope && d.scope.a !== 'stale') },
                            { value: d.b, floor: d.from.b, sourceValid: (d.scope && d.scope.b !== 'stale') }
                        );
                        verdict = c.verdict; reason = c.reason;
                        if (c.verdict === CONFLICT.UNDECIDED) { action = ACTION.SKIP; undecided++; }
                        else if (c.verdict === CONFLICT.STALE && !o.allowStale) { action = ACTION.SKIP; }
                        else action = ACTION.REPLACE;
                    }
                    if (action === ACTION.SKIP) { skipped++; }
                    proposals.push({
                        owner: rec.id, face: face, key: d.key,
                        action: action, reason: reason, conflict: verdict,
                        from: d.from, scope: d.scope,
                        value: (d.kind === 'only-in-b' ? d.b : d.a),
                    });
                }
            }
        }
        return {
            ok: true, reason: 'ok', draft: true,
            proposals: proposals,
            applied: 0,
            skipped: skipped,
            undecided: undecided,
        };
    }
    /**
     * [X6 主出口 ③] 预检。三分档：blocked / warn / ok。
     * 查三件事（X6 原话：「先识别目标冲突、知识边界与派生依赖」）：
     *   conflict —— 提案里还有 undecided/未决冲突 ⇒ **blocked**（不许自动合并）；
     *   knowledge—— 提案带 keeper 而观察者不在名单内 ⇒ **blocked**（秘密不得越界写入）；
     *   dep     —— 提案目标键在目标侧有派生依赖（dependents 表命中）⇒ **warn**（需人工确认）。
     * 为什么 blocked 与 warn 必须分开：blocked 是「不该做」，warn 是「能做但要知道」。
     * 混成一档会让「秘密越界」与「有个引用要顺手改」同形。
     * @returns {{ok:boolean, verdict:string, blockers:Array, warnings:Array, checked:number}}
     */
    function precheckImport(proposals, ctx) {
        const c = (ctx && typeof ctx === 'object') ? ctx : {};
        const list = Array.isArray(proposals) ? proposals : ((proposals && Array.isArray(proposals.proposals)) ? proposals.proposals : []);
        const blockers = [];
        const warnings = [];
        const viewer = c.viewer;
        const dependents = (c.dependents && typeof c.dependents === 'object') ? c.dependents : {};
        for (const p of list) {
            if (!p || typeof p !== 'object') continue;
            if (p.action === ACTION.SKIP) continue;
            // ① 未决冲突：不许自动合并。
            if (p.conflict === CONFLICT.UNDECIDED) {
                blockers.push({ why: 'undecided-conflict', owner: p.owner, face: p.face, key: p.key });
            }
            // ② 知识边界：提案携带 keeper 而观察者不在名单内。
            const keepers = Array.isArray(p.keeperIds) ? p.keeperIds.map(keyOf).filter(Boolean)
                : (Array.isArray(p.keeper) ? p.keeper.map(keyOf).filter(Boolean) : []);
            if (keepers.length) {
                const g = filterByKeeper([{ keeperIds: p.keeperIds, keeper: p.keeper }], viewer);
                if (g.hidden > 0) blockers.push({ why: 'knowledge-boundary', owner: p.owner, face: p.face, key: p.key });
            }
            // ③ 派生依赖：目标侧有下游引用 ⇒ warn（不是 blocked）。
            const depKey = keyOf(p.owner) + '\u0000' + keyOf(p.face) + '\u0000' + keyOf(p.key);
            if (Object.prototype.hasOwnProperty.call(dependents, depKey) || Object.prototype.hasOwnProperty.call(dependents, keyOf(p.key))) {
                const dn = dependents[depKey] || dependents[keyOf(p.key)];
                warnings.push({ why: 'has-dependents', owner: p.owner, face: p.face, key: p.key, dependents: Array.isArray(dn) ? dn.length : 'unknown' });
            }
        }
        let verdict = PRECHECK.OK;
        if (blockers.length) verdict = PRECHECK.BLOCKED;
        else if (warnings.length) verdict = PRECHECK.WARN;
        return {
            ok: true, reason: 'ok', verdict: verdict,
            blockers: blockers, warnings: warnings,
            checked: list.filter(function (p) { return p && p.action !== ACTION.SKIP; }).length,
        };
    }

    /**
     * [X6 主出口 ④] 确认 + 回执。**幂等、可回源、保存后回读**。
     * 五条口径：
     *   ① 预检不为 ok ⇒ 一律 held（零应用），并把原因带出（**不半截应用**）；
     *   ② 幂等：同 proposalId 第二次调用返回 duplicate:true 且 applied 不变
     *      （重试不增条 —— X6 验收「导入重试幂等」）；
     *   ③ 可回源：回执带 sourceRef（提案来源）与 targetRef（目标写入口）；
     *   ④ 保存后回读：给了 readback 函数就核对，三态 ok/mismatch/unreadable；
     *   ⑤ 判据只用**已应用条数**与回读一致性，不看「函数跑完了」。
     * 落笔本身**不由本模块执行**：applyFn 由调用方注入（走既有 owner/epoch），
     *   本模块只负责「先预检、再幂等记账、最后回读核对」这三件。
     * @param {object} args {proposals, precheck, proposalId, applyFn, readback, sourceRef, targetRef, seen}
     * @returns {object} receipt
     */
    async function confirmImport(args) {
        const a = (args && typeof args === 'object') ? args : {};
        const pid = keyOf(a.proposalId);
        const pre = (a.precheck && typeof a.precheck === 'object') ? a.precheck : null;
        const list = Array.isArray(a.proposals) ? a.proposals : ((a.proposals && Array.isArray(a.proposals.proposals)) ? a.proposals.proposals : []);
        const toApply = list.filter(function (p) { return p && p.action !== ACTION.SKIP; });
        const base = {
            proposalId: pid,
            sourceRef: keyOf(a.sourceRef) || null,
            targetRef: keyOf(a.targetRef) || null,
            applied: 0,
            dropped: 0,
            duplicate: false,
            held: false,
            readback: null,
        };
        // ⑤ 无预检 ⇒ held（**不许**跳过预检直接落笔）。
        if (!pre) return Object.assign({}, base, { ok: false, reason: 'no-precheck' });
        if (pre.verdict !== PRECHECK.OK) {
            return Object.assign({}, base, {
                ok: false, reason: 'precheck-' + String(pre.verdict), held: true,
                blockers: Array.isArray(pre.blockers) ? pre.blockers.length : 0,
            });
        }
        // ② 幂等：调用方通过 seen 表注入「这个 proposalId 是否已应用」。
        //   本模块不持有持久表（边界：不自建持久化），seen 由调用方给。
        const seen = (a.seen && typeof a.seen === 'object') ? a.seen : null;
        if (pid && seen && seen[pid]) {
            return Object.assign({}, base, {
                ok: true, reason: 'duplicate', duplicate: true,
                applied: Number(seen[pid].applied) || 0,
            });
        }
        // ① 有预检 blocker 的场景在上一步已拦下；这里只剩 warn/ok，真落笔。
        let applied = 0;
        let dropped = 0;
        const applyFn = (typeof a.applyFn === 'function') ? a.applyFn : null;
        if (!applyFn) {
            // 没给写入口：不能假装应用成功（「没接上」不得说成「已应用」）。
            return Object.assign({}, base, { ok: false, reason: 'no-apply-fn', applied: 0 });
        }
        for (const p of toApply) {
            let r;
            try { r = applyFn(p); } catch (_e) { r = { ok: false, reason: 'threw' }; }
            if (r === true || (r && r.ok === true)) applied++;
            else dropped++;
        }
        // ④ 保存后回读：给了 readback 就核对。
        //   [v3.292.0 · X6 修] 本出口改为 **async**：真宿主的回读必须 `await storage.save()`
        //     （落盘是异步的），修前是同步函数 —— 于是 `got` 拿到的是一个 **Promise 对象**，
        //     `got === applied` 恒假 ⇒ 三态里的 `ok` **永远不可能出现**（一条恒失效判据）。
        //     修法：函数标 async，回读结果一律 `await`（对非 Promise 值 `await` 是恒等的，
        //     故既有同步用法一字不改仍成立）。applied 计数同理不需要改。
        let rb = null;
        if (typeof a.readback === 'function') {
            /* 先落笔后回读的顺序由调用方保证（readback 内自行先保存再读）；
             *   本模块只做「取一次读数」这件事，不替调用方安排落盘时机。 */
            let got;
            try { got = await a.readback(); } catch (_e) { got = undefined; }
            if (got === undefined || got === null) rb = READBACK.UNREADABLE;
            else if (got === applied || (got && got.applied === applied)) rb = READBACK.OK;
            else rb = READBACK.MISMATCH;
        }
        return Object.assign({}, base, {
            ok: dropped === 0,
            reason: dropped === 0 ? 'applied' : 'partial',
            applied: applied,
            dropped: dropped,
            readback: rb,
        });
    }

    /** 一句话读数（诊断面用）。 */
    function line(comparison) {
        try {
            const c = (comparison && typeof comparison === 'object') ? comparison : null;
            if (!c) return '未对照';
            const parts = ['owner ' + (c.ownerCount || 0)];
            const abs = Array.isArray(c.absentModules) ? c.absentModules.length : 0;
            const unk = Array.isArray(c.unknownModules) ? c.unknownModules.length : 0;
            if (abs) parts.push('缺模块 ' + abs + ' 面');
            if (unk) parts.push('在场未知 ' + unk + ' 面');
            const inc = Array.isArray(c.incomparableFaces) ? c.incomparableFaces.length : 0;
            if (inc) parts.push('不可比 ' + inc);
            return parts.join(' · ');
        } catch (_e) { return '—（分支对照异常）'; }
    }

    const api = Object.freeze({
        BRANCH_SEMANTICS_VERSION,
        FACES, PRESENCE, CONFLICT, PRECHECK, READBACK, ACTION,
        floorOf, numOf, keyOf, sameValue, stable, safe,
        presenceOf, filterByKeeper, classifyConflict,
        ownersOf, faceOf, entryKeyOf, compareListFace, compareMapFace,
        compareOwners, proposeImport, precheckImport, confirmImport, line,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : root;
    try { g.LonShaBranchSemantics = Object.freeze(api); } catch (_e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);
