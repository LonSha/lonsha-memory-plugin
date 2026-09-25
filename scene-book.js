/* ========================================================
 * scene-book.js — [v3.181.0] 场所图景（Spatial Grounding）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   场景树自 [v2.4] 就在 index.js 里，但它是全库**最薄的一个子系统**：整个 SceneBook
 *   只有 89 行，交付的读法只有 currentKey / chainOf / brief 三个。实测可复现的后果：
 *     · 「主角上一次去『老城›钟楼›顶层』是什么时候」——问不出来（track 只记了 pathKey，
 *       没有到访频率/首次到访/重访次数）；
 *     · 「这一段剧情发生在哪里」——只能读到**当前**一处（track 末位），历史位置被同楼覆盖后
 *       就永久丢了，翻回旧楼也读不到当时的所在；
 *     · 「谁在这个地方」——完全没有。角色在哪只以 status_changes 的 field:"位置"（末级名）
 *       散落在状态表里，地点侧读不到自己的在场名单，于是「同处一室的两个人」不可推算；
 *     · 「这个地点有多大」——没有。树是扁的：登记了几个就是几个，既不知道某个街区下还
 *       藏着多少处场所，也不知道描述写到了第几层（广度/深度都读不出来）；
 *     · 「哪些楼在变更这个树」——没有覆盖度。删楼回滚只靠 opsLog 重放，重放完事后
 *       没有任何读数能说明「这棵树是不是完好的、有没有哪一楼写了却丢了」。
 *
 * 【本模块的职责（把「地点」做成可查询的面）】
 *   ① 场景树（保留并在其上加深）：节点含路径/描述/归属楼层/广度/深度；
 *   ② 到访史（visits）：按场所聚合的首次到访 / 最近到访 / 到访次数 / 近期楼层，
 *      以及主角位置轨迹（track，同楼覆盖、可切片回看）；
 *   ③ 在场索引（presence）：谁在何处（由宿主按在场性写入），支持「某地谁在」与
 *      「两人是否同处」（samePlace）——这是「地点侧」第一次能回答空间共处的谁；
 *   ④ 地点挂账（outlineOf）：某地的广度（子树里有描述的场所数）/ 深度（最深层级）/
 *      自述句——「街道：42 处场所，其中 5 处已细写，最深 3 层」；
 *   ⑤ 覆盖度（coverage）：逐楼列号 + 未登记到访 + 不变量违例，与账本侧的 coverage()
 *      同一口径（列号可对账）；
 *   ⑥ 不变量（checkInvariants）：键与 path 不一致 / 层级断裂 / 到访未登记 / 轨迹失联，
 *      三态如实回报（ok | warn | broken），绝不静默。
 *
 * 【本模块**不做**什么（边界）】
 *   不做「语义地点识别」。scenes 的 path 由提取侧 LLM 给出；本模块只认已经登记进来的路径，
 *   不猜、不外推、不从正文里追认地点。查得到就说查得到，查不到如实说查不到。
 *   `presence` 同理：宿主没写就不编——`whereIs` 返回 null 而不是「大概在主角身边」。
 *
 * 【修前实测的两处真缺陷（随本次抽取一并修掉）】
 *   ① `rebuildFromOps` 的 track 过滤表达式优先级错位：
 *        `t.floor < (this._cutoff || 0) || this._cutoff === undefined ? true : false`
 *      三目是**最低优先级**，实际解析为 `(A || B) ? true : false` —— 于是 `_cutoff === undefined`
 *      时整条恒真（正确），但 `_cutoff` 有值时 A 为假、B 为假 ⇒ 恒假，**把 track 全清空**。
 *      而 `_cutoff` 在 index.js 里**从未被赋值**（全库零写点）——也就是说这个分支永远走
 *      「恒真」，看起来正常，实则是一枚哑雷：哪天有人给 `_cutoff` 赋值，位置轨迹会被无声抹掉。
 *      本模块把该表达式改成显式的 `this.track.filter(t => t.floor < cut)`，并让 `_cutoff`
 *      成为**入参**（不再靠一个没人写的实例字段隐式传达）。
 *   ② `setLocation` 只写 `track`（原本根本没有到访史）。于是「重访率」「首次到访楼层」
 *      「最近一次去是什么时候」这类叙事上很常用的读数无从谈起——`track` 同楼覆盖，
 *      覆盖掉的那次就永久没了，连「去过几次」都数不出来。
 *   ③ `_rebuild()` 只重放 `opsLog`，**不重建位置轨迹/到访**。而 `rollbackFloorOnly`
 *      清 `track` 时既不重算到访、也不清在场——两者都是「清了却没人重建」的半截状态。
 *      本模块把真源收敛成单一出口：`_rebuild()` 同时重放 opsLog（节点）与 track（到访），
 *      到访史只有这一个写源，回滚后读数必然可复现（重建前后 count 不再飘）。
 *
 * 挂 window.LonShaSceneBook，由 index.js 的 MemoryEngine 构造处取库（_moduleLib）。
 * ======================================================== */
'use strict';
(function (global) {
/** 附注/承接键。改此处即持久化格式变化，须同步 CHANGELOG。 */
const SCENE_KEY = 'lonsha_scene';
/** 本模块的结构版本（与快照里的 scene 面同源）。 */
const SCENE_VERSION = 1;
/** 路径最大层级（提取侧最多给 4 层；超出截断而非报错——截断是有界性，不是失败）。 */
const MAX_PATH_DEPTH = 4;
/** 节点上限（超出按「最旧且无描述」裁剪，防长线无界膨胀）。 */
const MAX_NODES = 600;
/** 描述单条字符上限。 */
const MAX_DESC = 120;
/** 节点子树遍历的**读取预算**（防单次 outlineOf 在畸形深层树上放大成 O(巨大)）。 */
const MAX_SCAN = 4000;
/** 到访史键上限。 */
const MAX_VISIT_KEYS = 400;
/** 单键保留的近期楼层数。 */
const MAX_VISIT_FLOORS = 12;
/** 位置轨迹条数上限。 */
const MAX_TRACK = 300;
/** opsLog 条数上限。 */
const MAX_OPS = 400;
/** 在场索引上限。 */
const MAX_PRESENCE = 400;
/** brief 的行数上限（提取 prompt 的 {{SCENES}} 占用预算）。 */
const MAX_BRIEF_LINES = 15;
/** [v3.220.0] R3-A：层级树外供行数上限（防一次吐整棵树把快照撑爆）。 */
const MAX_TREE_ROWS = 240;
/** [v3.221.0] R3-D：场景头条数上限。
 *   修前形态：上限 400 写在 setHeader 体内（字面量），而 import 路径**没有任何上限** ——
 *   一份手工构造/被改过的存档能把场景头撑到任意规模，且诊断面看不见。
 *   提为常量后，写侧与载入侧消费同一个数。 */
const MAX_HEADERS = 400;
/** [v3.220.0] R3-A：只把**真的是数**的读成数。
 *   为什么不能直接 Number(x)：Number(null) === 0、Number('') === 0 —— 于是
 *   「这一格没给」会被读成「第 0 楼」，正是本仓反复治理的那类塌陷
 *   （0 是合法楼层，与「没给」同形最贵）。取不到一律 null。 */
function numOrNull(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

const trim = (v) => String(v == null ? '' : v).trim();
const oneLine = (v) => trim(v).replace(/[\r\n\t]+/g, ' ').replace(/\s{2,}/g, ' ');
const isArr = (v) => Array.isArray(v);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** 路径规范化：数组或字符串 → 去空、截断到 MAX_PATH_DEPTH。 */
function partsOf(path) {
    const raw = isArr(path) ? path : (path == null ? [] : [path]);
    return raw.map(trim).filter(Boolean).slice(0, MAX_PATH_DEPTH);
}
/** 路径 → 键（'a/b/c'）。键是**派生**的，不是真源；真源始终是 path 数组。 */
function keyOf(path) { return partsOf(path).join('/'); }
/** 键 → 层级数组（不做深度截断，读侧要能读回已存的全长）。 */
function partsOfKey(key) { return String(key == null ? '' : key).split('/').map(trim).filter(Boolean); }
/** 末级名（具体场所名）。 */
function leafOf(path) { const p = partsOf(path); return p.length ? p[p.length - 1] : ''; }
/** 全部祖先键（不含自身），由粗到细。 */
function ancestorsOf(path) {
    const p = partsOf(path);
    const out = [];
    for (let i = 1; i < p.length; i++) out.push(p.slice(0, i).join('/'));
    return out;
}
/**
 * 自述句（地点侧第一次能回答「这个地方有多大」）：
 *   「街道：42 处场所，其中 5 处已细写，最深 3 层」
 * 广度 = 子树里**有描述**的场所数；深度 = 子树最大层级差。
 * 纯读、有预算、绝不抛；路径不存在返回 null（而不是编一个 0）。
 */
function describeShape(book, path) {
    const key = keyOf(path);
    if (!key) return null;
    const node = book.nodes.get(key);
    if (!node) return null;
    const prefix = key + '/';
    let places = 0, detailed = 0, deepest = 0, scanned = 0;
    for (const [k, n] of book.nodes) {
        if (scanned >= MAX_SCAN) break;
        scanned++;
        if (k !== key && !k.startsWith(prefix)) continue;
        places++;
        if (n.desc) detailed++;
        const d = (n.path || []).length - (node.path || []).length;
        if (d > deepest) deepest = d;
    }
    return {
        key,
        leaf: leafOf(node.path),
        places,                       // 子树场所总数（含自身）
        detailed,                     // 其中已写描述的
        depth: deepest,               // 子树最大层级差（0 = 无下级）
        desc: node.desc || '',
        floor: node.floor,
        self: `${leafOf(node.path)}：${places} 处场所，其中 ${detailed} 处已细写，最深 ${deepest} 层`
    };
}

class SceneBook {
    /**
     * @param {object} [opts] 初始数据（与 export() 同形）。构造即可喂存档，
     *   便于「导入一份旧 scene 面」而不必先 new 再 import。
     */
    constructor(opts) {
        /** 场景节点：key → {path[], desc, floor, updatedAt}（派生缓存，真源见 opsLog） */
        this.nodes = new Map();
        /** 位置轨迹：[{floor, pathKey}]，同楼覆盖；末位 = 当前位置 */
        this.track = [];
        /** 变更真源：[{floor, ops}]，回滚按此重放 */
        this.opsLog = [];
        /** 到访史聚合：key → {count, firstFloor, lastFloor, floors[]} */
        this.visits = new Map();
        /** 在场索引：角色主名 → {path, key, atFloor}（由宿主按在场性写入） */
        this.presence = new Map();
        /** [v3.195] 场景头：floor → {date, period, weather}。只记调用方给的快照，不从正文猜。 */
        this.headers = new Map();
        /** 最近一次 apply 的读数（供诊断行/自检读，不参与重建） */
        this.lastApply = null;
        /** 有界性台账：本对象生命周期内裁剪过的节点数（自述用，不进存档） */
        this.capacity = { nodes: 0, dropped: 0, visitsDropped: 0, trackDropped: 0 };
        /** 不变量违例缓存（checkInvariants 填充；import 后清空） */
        this._broken = [];
        if (opts && typeof opts === 'object') {
            try { this.import(opts); } catch (_e) { /* 构造期喂畸形数据不抛：按空书处理 */ }
        }
    }

    /* ---------- 静态口径（index.js 也按 SceneBook.keyOf 引用，保持签名稳定） ---------- */
    static keyOf(path) { return keyOf(path); }
    static leafOf(path) { return leafOf(path); }
    static partsOfKey(key) { return partsOfKey(key); }

    /* ─────────────── 写侧：登记与位置 ─────────────── */

    /**
     * 应用场景 ops。op: {action:'add'|'update', path:[由大到小], desc}
     * 返回**登记/更新条数**（不是 ops 条数——被拒的 update 不计）。
     * 拒绝语义（如实计数，不静默吞）：
     *   · path 为空 → 计 rejected（不登记）
     *   · action 非 add/update → 计 rejected
     *   · action==='update' 而目标不存在 → 计 rejected（update 只改已存在的）
     */
    apply(ops, floor, _replaying = false) {
        const list = isArr(ops) ? ops : (ops ? [ops] : []);
        const f = Number.isFinite(Number(floor)) ? Number(floor) : 0;
        let n = 0, rejected = 0;
        const touched = [];
        for (const op of list) {
            if (!op || typeof op !== 'object') { rejected++; continue; }
            const action = trim(op.action) || 'add';
            if (action !== 'add' && action !== 'update') { rejected++; continue; }
            const path = partsOf(op.path);
            if (!path.length) { rejected++; continue; }
            const k = keyOf(path);
            const exist = this.nodes.get(k);
            if (action === 'update' && !exist) { rejected++; continue; }
            const desc = oneLine(op.desc).slice(0, MAX_DESC);
            if (!exist) {
                // 祖先补齐：登记 'a/b/c' 时把 'a'、'a/b' 一并建出来（保证层级不断裂）
                for (const pk of ancestorsOf(path)) {
                    if (!this.nodes.has(pk)) {
                        this.nodes.set(pk, { path: partsOfKey(pk), desc: '', floor: f, updatedAt: Date.now() });
                    }
                }
                this.nodes.set(k, { path, desc, floor: f, updatedAt: Date.now() });
                n++; touched.push(k);
            } else if (desc && desc !== exist.desc) {
                exist.desc = desc; exist.updatedAt = Date.now(); exist.floor = f;
                n++; touched.push(k);
            } else {
                // 同描述重复提取：不计变更（防「重复提取 = 变更」的虚增）
                rejected++;
            }
        }
        if (!_replaying && n) {
            const i = this.opsLog.findIndex(o => o.floor === f);
            if (i >= 0) this.opsLog[i] = { floor: f, ops: list };
            else this.opsLog.push({ floor: f, ops: list });
            if (this.opsLog.length > MAX_OPS) this.opsLog.shift();
        }
        this._trimNodes();
        this.lastApply = { floor: f, applied: n, rejected, at: Date.now() };
        return n;
    }

    /**
     * 记录**主体位置**（同楼覆盖）。同时并入到访史。
     * 返回 true 表示位置真的变了（值不与末位相同）——调用方可据此判「本轮有无移动」。
     */
    setLocation(floor, path) {
        const key = keyOf(path);
        if (!key) return false;
        const f = Number.isFinite(Number(floor)) ? Number(floor) : 0;
        const i = this.track.findIndex(t => t.floor === f);
        const prev = this.currentKey();
        const entry = { floor: f, pathKey: key };
        if (i >= 0) this.track[i] = entry;
        else this.track.push(entry);
        if (this.track.length > MAX_TRACK) { this.track.shift(); this.capacity.trackDropped++; }
        this._recordVisit(key, f);
        return prev !== key;
    }

    /**
     * 到访史记账（有界：键上限 + 单键楼层上限）。
     * 计数口径：`count` = **到访过的不同楼层数**（同一楼内的多次位置覆盖不重复计——
     * 位置本来就是同楼覆盖语义，把「同楼移动 N 次」算成 N 次到访会虚增重访率）。
     * 于是 `count` 与 `floors` 同源，`_rebuild()` 之后两者仍一致（重建即按 track 去重生成）。
     */
    _recordVisit(key, floor) {
        let v = this.visits.get(key);
        if (!v) {
            if (this.visits.size >= MAX_VISIT_KEYS) {
                // 裁剪：丢「最近到访楼层最小」的那一个（最久没去的先出局）
                let worst = null, worstFloor = Infinity;
                for (const [k, rec] of this.visits) {
                    const lf = Number.isFinite(Number(rec.lastFloor)) ? Number(rec.lastFloor) : -1;
                    if (lf < worstFloor) { worstFloor = lf; worst = k; }
                }
                if (worst !== null) { this.visits.delete(worst); this.capacity.visitsDropped++; }
            }
            v = { count: 0, firstFloor: floor, lastFloor: floor, floors: [] };
            this.visits.set(key, v);
        }
        if (!v.floors.includes(floor)) {
            v.floors.push(floor);
            if (v.floors.length > MAX_VISIT_FLOORS) v.floors.shift();
            v.count++;                       // 去重计数：只有「又去了一个别的楼层」才算再次到访
        }
        if (floor < v.firstFloor) v.firstFloor = floor;
        if (floor > v.lastFloor) v.lastFloor = floor;
        return v;
    }

    /** 超出节点上限时裁剪：只裁「无描述且无子节点」的叶子，且先裁 updatedAt 最旧的。 */
    _trimNodes() {
        this.capacity.nodes = this.nodes.size;
        if (this.nodes.size <= MAX_NODES) return 0;
        const hasChild = new Set();
        for (const k of this.nodes.keys()) {
            const idx = k.lastIndexOf('/');
            if (idx > 0) hasChild.add(k.slice(0, idx));
        }
        const victims = [...this.nodes.entries()]
            .filter(([k, n]) => !n.desc && !hasChild.has(k))
            .sort((a, b) => (a[1].updatedAt || 0) - (b[1].updatedAt || 0));
        let dropped = 0;
        for (const [k] of victims) {
            if (this.nodes.size <= MAX_NODES) break;
            this.nodes.delete(k); dropped++;
        }
        this.capacity.dropped += dropped;
        return dropped;
    }

    /* ─────────────── 写侧：在场索引（谁在何处） ─────────────── */

    /**
     * 写入/更新一个角色的所在。path 为空或角色名为空 → 拒绝（返回 false，不静默建空条目）。
     */
    setPresence(name, path, floor) {
        const nm = trim(name);
        const key = keyOf(path);
        if (!nm || !key) return false;
        const f = Number.isFinite(Number(floor)) ? Number(floor) : 0;
        if (!this.presence.has(nm) && this.presence.size >= MAX_PRESENCE) {
            // 裁剪：丢 atFloor 最小的（最早离场）
            let worst = null, worstFloor = Infinity;
            for (const [k, rec] of this.presence) {
                const af = Number.isFinite(Number(rec.atFloor)) ? Number(rec.atFloor) : -1;
                if (af < worstFloor) { worstFloor = af; worst = k; }
            }
            if (worst !== null) this.presence.delete(worst);
        }
        this.presence.set(nm, { key, path: partsOfKey(key), atFloor: f, at: Date.now() });
        return true;
    }

    /** 移除一个角色的所在（离场）。返回是否确有该条目。 */
    removePresence(name) { return this.presence.delete(trim(name)); }

    /** 清空在场索引（换聊天/清空场景时用）。返回清掉的条数。 */
    clearPresence() { const n = this.presence.size; this.presence.clear(); return n; }

    /**
     * [v3.195] 写入本楼场景头。日期 / 时段 / 天气三者至少给一个，否则拒绝。
     * 同楼覆盖。调用方没给的字段留空，不回退到别的楼，也不从正文推断。
     * [v3.221.0] R3-D：楼层「没给」不得被读成**第 0 楼**。
     *   修前实测：`num(null) === 0`、`num('') === 0`（`Number(null)` 与 `Number('')` 都是 0），
     *   于是 `setHeader(null, {date:'X月X日'})` 返回 true、把场景头写进第 0 楼，
     *   而 0 是**合法楼层** —— 与「没给」同形最贵。取不到一律拒绝写入（返回 false）。
     */
    setHeader(floor, header) {
        const f = numOrNull(floor);
        if (f == null || !header || typeof header !== 'object') return false;
        const date = oneLine(header.date).slice(0, 40);
        const period = oneLine(header.period).slice(0, 20);
        const weather = oneLine(header.weather).slice(0, 40);
        if (!date && !period && !weather) return false;
        this.headers.set(f, { date, period, weather, at: Date.now() });
        if (this.headers.size > MAX_HEADERS) {
            const oldest = [...this.headers.keys()].sort((a, b) => a - b)[0];
            if (oldest !== undefined && oldest !== f) this.headers.delete(oldest);
        }
        return true;
    }

    /**
     * 读本楼场景头。没有就 null，不回退到别的楼。
     * [v3.221.0] R3-D：`` / `''` / `null` 同样算「没给」——修前实测 `headerAt('')` 会读到
     *   第 0 楼的场景头（与本方法「没有就 null」的自述直接矛盾）。
     */
    headerAt(floor) {
        const f = numOrNull(floor);
        if (f == null) return null;
        const rec = this.headers.get(f);
        if (!rec) return null;
        return { floor: f, date: rec.date, period: rec.period, weather: rec.weather };
    }

    /**
     * [v3.221.0] R3-D：撤掉本楼的场景头，返回是否确有条目。
     * 为什么必须有：回滚面（删楼 / 前移）此前只动 opsLog / track / visits / presence，
     *   而 headers 是按楼存的**快照真源**，不在 track/opsLog 的派生范围内 —— 于是删掉第 7 楼后
     *   `headerAt(7)` 照样答得出「8月2日 · 暴雨」：读数指向一个已经不存在的时刻。
     *   那不叫缺读数，叫**读数撒谎**（比没有更糟）。
     */
    clearHeader(floor) {
        const f = numOrNull(floor);
        if (f == null) return false;
        return this.headers.delete(f);
    }

    /** 注入用一行。三字段都空返回空串。 */
    headerLine(floor) {
        const h = this.headerAt(floor);
        if (!h) return '';
        const parts = [];
        if (h.date) parts.push(h.date);
        if (h.period) parts.push(h.period);
        if (h.weather) parts.push(h.weather);
        return parts.length ? '【场景头】' + parts.join(' · ') : '';
    }

    /** 谁在 key（含**其下级**：在『钟楼›顶层』的人，也在『钟楼』这一层）。 */
    presenceAt(key) {
        const k = trim(key);
        if (!k) return [];
        const prefix = k + '/';
        const out = [];
        for (const [name, rec] of this.presence) {
            if (rec.key === k || String(rec.key).startsWith(prefix)) {
                out.push({ name, key: rec.key, path: rec.path || [], atFloor: rec.atFloor, exact: rec.key === k });
            }
        }
        return out.sort((a, b) => (b.exact ? 1 : 0) - (a.exact ? 1 : 0) || String(a.name).localeCompare(String(b.name)));
    }

    /** 某角色在哪（读不到如实 null，不编造）。 */
    whereIs(name) {
        const rec = this.presence.get(trim(name));
        if (!rec) return null;
        return { name: trim(name), key: rec.key, path: rec.path || [], atFloor: rec.atFloor };
    }

    /**
     * 按**末级名**精确定位一个已登记场所（重名时取最近登记的那个）。
     * 用途：状态层的「位置」字段只给末级名（如「钟楼」），要拿到完整路径必须回查场景树；
     * 查不到如实返回 null —— **不做模糊匹配**（猜出来的路径比没有路径更有害：
     * 会把「在钟楼」错记成「在同名的另一座钟楼」，且看不出错）。
     */
    findByLeaf(leaf) {
        const nm = trim(leaf);
        if (!nm) return null;
        let best = null;
        for (const [k, n] of this.nodes) {
            const p = n.path || [];
            if (!p.length || p[p.length - 1] !== nm) continue;
            if (!best || (n.updatedAt || 0) > (best.updatedAt || 0)) best = { key: k, node: n };
        }
        return best ? { key: best.key, path: best.node.path } : null;
    }

    /** 两人是否同处一室（含层级包含：同一街区下也算同处）。任一不在场返回 false。 */
    samePlace(a, b) {
        const ra = this.whereIs(a), rb = this.whereIs(b);
        if (!ra || !rb) return false;
        if (ra.key === rb.key) return true;
        return ra.key.startsWith(rb.key + '/') || rb.key.startsWith(ra.key + '/');
    }

    /* ─────────────── 读侧：位置与轨迹 ─────────────── */

    currentKey() { return this.track.length ? this.track[this.track.length - 1].pathKey : null; }
    /** 当前位置节点链（由粗到细，含描述）。 */
    currentChain() { return this.chainOf(this.currentKey()); }

    /** 某位置的由大到小链（含描述）；键不存在返回 []（不是 [null]）。 */
    chainOf(key) {
        const parts = partsOfKey(key);
        const out = [];
        for (let i = 1; i <= parts.length; i++) {
            const n = this.nodes.get(parts.slice(0, i).join('/'));
            if (n) out.push(n);
        }
        return out;
    }

    /** 位置轨迹切片（倒序，最近在前）。limit 缺省 10。 */
    history(limit = 10) {
        const n = Math.max(1, Math.min(Number(limit) || 10, MAX_TRACK));
        return this.track.slice(-n).reverse().map(t => ({ floor: t.floor, key: t.pathKey, path: partsOfKey(t.pathKey) }));
    }

    /** 轨迹按场所聚合（每个地点最近去过的楼层 + 出现次数）。 */
    trackByPlace() {
        const m = new Map();
        for (const t of this.track) {
            const r = m.get(t.pathKey) || { key: t.pathKey, path: partsOfKey(t.pathKey), count: 0, lastFloor: t.floor };
            r.count++;
            if (t.floor > r.lastFloor) r.lastFloor = t.floor;
            else if (t.floor < r.lastFloor) r.lastFloor = Math.max(r.lastFloor, t.floor);
            m.set(t.pathKey, r);
        }
        return [...m.values()].sort((a, b) => b.lastFloor - a.lastFloor);
    }

    /* ─────────────── 读侧：到访史 ─────────────── */

    /** 某场所的到访读数；从未到访如实返回 null。 */
    visitsOf(path) {
        const key = keyOf(path) || trim(path);
        const v = this.visits.get(key);
        if (!v) return null;
        return {
            key, path: partsOfKey(key),
            count: v.count, firstFloor: v.firstFloor, lastFloor: v.lastFloor,
            floors: [...v.floors],
            revisit: v.count > 1
        };
    }

    /** 到访史列表（按最近到访楼层降序）。 */
    visitsList(limit = 50) {
        const n = Math.max(1, Math.min(Number(limit) || 50, MAX_VISIT_KEYS));
        return [...this.visits.entries()]
            .map(([key, v]) => ({ key, path: partsOfKey(key), count: v.count, firstFloor: v.firstFloor, lastFloor: v.lastFloor, floors: [...v.floors], revisit: v.count > 1 }))
            .sort((a, b) => b.lastFloor - a.lastFloor)
            .slice(0, n);
    }

    /* ─────────────── 读侧：规模与挂账 ─────────────── */

    /** 某地的广/深/细写自述（读不到返回 null）。 */
    outlineOf(path) { return describeShape(this, path); }

    /** 全景规模：节点数、已细写数、最深层级、叶节点数。 */
    scale() {
        let detailed = 0, deepest = 0;
        for (const n of this.nodes.values()) {
            if (n.desc) detailed++;
            const d = (n.path || []).length;
            if (d > deepest) deepest = d;
        }
        return { nodes: this.nodes.size, detailed, depth: deepest, visits: this.visits.size, presence: this.presence.size };
    }

    /** 当前地点的自述行（注入用）：'城 › 街 › 店（描述）'。读不到返回 null。 */
    currentLine() {
        const chain = this.currentChain();
        if (!chain.length) return null;
        return chain.map(n => (n.path[n.path.length - 1] || '') + (n.desc ? `（${n.desc}）` : '')).join(' › ');
    }

    /* ─────────────── 读侧：给提取 prompt 的场景清单 ─────────────── */

    /** 最多 MAX_BRIEF_LINES 行的场景清单（空树返回占位句，与旧行为一致）。 */
    brief(limit = MAX_BRIEF_LINES) {
        const n = Math.max(1, Math.min(Number(limit) || MAX_BRIEF_LINES, 60));
        const arr = [...this.nodes.values()].filter(x => x.desc || (x.path || []).length >= 2).slice(-n);
        if (!arr.length) return '（暂无已登记场景）';
        return arr.map(x => `${x.path.join('/')} — ${x.desc || ''}`).join('\n');
    }

    /**
     * 以某地为中心的清单：其祖先链在前（带上下文），其后是该地下级（细写优先）。
     * 供「当前位置附近」注入用——读不到返回占位句，绝不返回半截。
     */
    briefAt(path, limit = MAX_BRIEF_LINES) {
        const key = keyOf(path);
        if (!key || !this.nodes.has(key)) return null;
        const n = Math.max(1, Math.min(Number(limit) || MAX_BRIEF_LINES, 60));
        const prefix = key + '/';
        const above = this.chainOf(key);                                  // 自身 + 祖先（由粗到细）
        const below = [...this.nodes.values()]
            .filter(x => x.path && x.path.length > above.length && x.path.join('/').startsWith(prefix))
            .sort((a, b) => (b.desc ? 1 : 0) - (a.desc ? 1 : 0) || (b.floor || 0) - (a.floor || 0));
        const lines = [];
        for (const x of above) lines.push(`${x.path.join('/')} — ${x.desc || ''}`);
        for (const x of below) { if (lines.length >= n) break; lines.push(`  ${x.path.join('/')} — ${x.desc || ''}`); }
        return lines.slice(0, n).join('\n');
    }

    /* ─────────────── 覆盖度与不变量 ─────────────── */

    /**
     * 覆盖度：逐楼列号 + 未登记到访 + 不变量违例。
     * 与账本侧 coverage() 同口径（楼层列号可对账），纯读、绝不抛。
     */
    coverage() {
        const floors = [...new Set(this.opsLog.map(o => Number(o.floor)).filter(Number.isFinite))].sort((a, b) => a - b);
        const trackFloors = [...new Set(this.track.map(t => Number(t.floor)).filter(Number.isFinite))].sort((a, b) => a - b);
        // 到访过、但从未登记的键（说明该地点的 scenes 一直没被提取到）
        const unregistered = [...this.visits.keys()].filter(k => k && !this.nodes.has(k));
        const iv = this.checkInvariants();
        return {
            floors,                                   // 有变更的楼层
            floorCount: floors.length,
            steps: this._gaps(floors),                // 逐楼缺口（相邻变更楼之间跳过的楼层）
            trackFloors,
            // [v3.221.0] R3-D：本楼场景头的楼层列号 + 条数。
            //   此前覆盖度只列「有变更的楼层」「有位置轨迹的楼层」两类，而删楼/前移对 headers
            //   的处理**没有任何判据面**：改坏了也看不出来，于是「那天什么天气」可以停在一个
            //   已被删掉的楼层上而诊断面报一切正常。列号照既有口径可逐楼对账。
            headerFloors: [...this.headers.keys()].map(f => Number(f)).filter(Number.isFinite).sort((a, b) => a - b),
            headerCount: this.headers.size,
            nodes: this.nodes.size,
            detailed: [...this.nodes.values()].filter(n => n.desc).length,
            visits: this.visits.size,
            presence: this.presence.size,
            unregistered,                             // 未登记到访（有位置无节点）
            unregisteredCount: unregistered.length,
            state: iv.state,
            broken: iv.broken,
            warnings: iv.warnings
        };
    }

    /** 相邻变更楼层之间跳过的楼层清单（缺口的可读形态）。 */
    _gaps(floors) {
        const out = [];
        for (let i = 1; i < floors.length; i++) {
            const gap = floors[i] - floors[i - 1] - 1;
            if (gap > 0) out.push({ after: floors[i - 1], before: floors[i], missing: gap });
        }
        return out;
    }

    /**
     * 不变量三档：
     *   broken —— 树自身不一致（键与 path 不符 / 层级断裂 / 描述非字符串）
     *   warn   —— 读数可疑但不破坏树（到访未登记 / 轨迹指向不存在的节点）
     *   ok     —— 无违例
     * 本方法**不**修数据，只如实回报（修是 rebuildFromOps 的职责）。
     */
    checkInvariants() {
        const broken = [], warnings = [];
        try {
            for (const [k, n] of this.nodes) {
                if (!n || !isArr(n.path) || !n.path.length) { broken.push({ kind: 'bad-node', key: k }); continue; }
                if (keyOf(n.path) !== k) broken.push({ kind: 'key-path-mismatch', key: k, path: n.path.join('/') });
                if (n.desc != null && typeof n.desc !== 'string') broken.push({ kind: 'bad-desc', key: k });
                // 层级断裂：除根之外，每级祖先都必须在册（apply 会补齐；断裂说明被外部改过）
                const p = n.path;
                for (let i = 1; i < p.length; i++) {
                    const pk = p.slice(0, i).join('/');
                    if (!this.nodes.has(pk)) broken.push({ kind: 'broken-chain', key: k, missing: pk });
                }
            }
            for (const k of this.visits.keys()) {
                if (k && !this.nodes.has(k)) warnings.push({ kind: 'visit-unregistered', key: k });
            }
            for (const t of this.track) {
                if (t && t.pathKey && !this.nodes.has(t.pathKey)) warnings.push({ kind: 'track-unregistered', key: t.pathKey, floor: t.floor });
            }
            for (const [nm, rec] of this.presence) {
                if (!rec || !rec.key) warnings.push({ kind: 'presence-bad', name: nm });
            }
        } catch (e) {
            broken.push({ kind: 'invariant-threw', message: String((e && e.message) || e) });
        }
        this._broken = broken;
        return { state: broken.length ? 'broken' : (warnings.length ? 'warn' : 'ok'), broken, warnings };
    }

    /* ─────────────── 回滚与重建 ─────────────── */

    /**
     * 删楼回滚：过滤真源（opsLog / track）后重放。
     * @param {number} floor 该楼**及以上**全部丢弃
     * @param {number} [cutoff] 可选的地板线：低于它的 track 记录才保留（缺省 = floor）
     * 返回重建后的节点数。
     */
    rollbackFrom(floor, cutoff) {
        const cut = Number.isFinite(Number(cutoff)) ? Number(cutoff) : Number(floor);
        this.opsLog = this.opsLog.filter(o => o.floor < floor);
        this.track = this.track.filter(t => t.floor < cut);
        // [v3.221.0] R3-D：级联回滚是「该楼及以上全弃」，场景头同语义（>= floor 一并撤）。
        for (const hf of [...this.headers.keys()]) if (Number(hf) >= Number(floor)) this.headers.delete(hf);
        return this._rebuild(floor);
    }

    /**
     * 单楼回滚（编辑路径用）：只清该楼的 opsLog / track 并重放——不级联摧毁后续楼层。
     * 返回重建后的节点数。
     */
    rollbackFloorOnly(floor) {
        const f = Number(floor);
        this.opsLog = this.opsLog.filter(o => o.floor !== f);
        this.track = this.track.filter(t => t.floor !== f);
        // visits 不在此手动扣减：本节末尾的 _rebuild() 会整体清空并按 track 重算
        //   （手动扣减会被随后覆盖 ⇒ 那是「写了等于没写」的空转；到场史只能有一个真源）。
        // presence 是宿主写入的、不由 track/opsLog 派生 ⇒ 必须手动清理该楼的在场记录。
        //   注意「清理」的粒度：**只清停在这一楼的人**，不得扩成 clearPresence() 全清 ——
        //   那会把第 9 楼那批人的所在一起抹掉（修前宿主就是这么干的，见 index.js 的 rollbackFloor）。
        for (const [nm, rec] of [...this.presence]) {
            if (Number(rec.atFloor) === f) this.presence.delete(nm);
        }
        // [v3.221.0] R3-D：场景头是按楼存的快照真源，不在 show/track 的派生范围内 ⇒ 同删。
        this.headers.delete(f);
        return this._rebuild(f);
    }

    /**
     * [v3.221.0] R3-D：楼层前移时跟随（登记表只声明意图，动作收在模块内）。
     * 与 drop 侧同一原则，顺序也一样：**先清被删楼的残留，再平移大于它的归属**。
     *   修前实测（登记表 scene 面只手抄 track/opsLog 两条循环）：
     *     ① 被删第 7 楼的 track/opsLog 条目仍在原地 ⇒ 第 8 楼被前移成 7 楼后与残留**撞成两条 7 楼**
     *        （连做两次得 track=[3,7,7]）；
     *     ② `headers` 一格不动 ⇒ 前移后「那天什么天气」继续挂在旧楼层号上；
     *     ③ `presence` 一格不动 ⇒ 「谁在何处」指向前移前的时刻（`atFloor` 是旧号）。
     * 三面都跟，返回跟随/清理的条数。**不抛**（登记项调用方按回放引擎的纪律处理失败）。
     */
    shiftFloorRefs(deleted) {
        const d = Number(deleted);
        if (!Number.isFinite(d)) return 0;
        let n = 0;
        // ① 被删楼自身的残留（前移后该楼已不存在；留着它下一次重放还会把它当「真源」搬回来）
        const bt = this.track.length, bo = this.opsLog.length;
        this.track = this.track.filter(t => Number(t && t.floor) !== d);
        this.opsLog = this.opsLog.filter(o => Number(o && o.floor) !== d);
        n += (bt - this.track.length) + (bo - this.opsLog.length);
        // ② 平移：位置真源
        for (const t of this.track) if (typeof t.floor === 'number' && t.floor > d) { t.floor = t.floor - 1; n++; }
        for (const o of this.opsLog) if (typeof o.floor === 'number' && o.floor > d) { o.floor = o.floor - 1; n++; }
        // ③ 平移：本楼场景头（按楼存的快照，不跟就是「天气挂在错楼层」）
        const nh = new Map();
        for (const [hf, rec] of this.headers) {
            if (hf === d) { n++; continue; }
            const nf = hf > d ? hf - 1 : hf;
            nh.set(nf, rec);
            if (nf !== hf) n++;
        }
        this.headers = nh;
        // ④ 平移：在场（谁在何处）；停在被删那一刻的人出局 —— 与 drop 侧同一粒度（绝不整表全清）
        for (const [nm, rec] of [...this.presence]) {
            if (!rec) continue;
            const af = Number(rec.atFloor);
            if (!Number.isFinite(af)) continue;
            if (af === d) { this.presence.delete(nm); n++; }
            else if (af > d) { rec.atFloor = af - 1; n++; }
        }
        return n;
    }

    /**
     * 重建（真源 = opsLog）。
     * 【修前缺陷②】原实现把 track 过滤写成
     *   `t.floor < (this._cutoff || 0) || this._cutoff === undefined ? true : false`
     * 三目优先级最低 ⇒ 实际是 `(A||B) ? true : false`；`_cutoff` 有值时两项皆假 ⇒ **恒假**，
     * 位置轨迹被无声清空。本实现改为显式入参 + 明确比较。
     * @param {number} [cutoff] 只保留 floor < cutoff 的轨迹记录（缺省 = 全保留）
     */
    rebuildFromOps(cutoff) {
        if (Number.isFinite(Number(cutoff))) this.track = this.track.filter(t => t.floor < Number(cutoff));
        return this._rebuild();
    }

    /** 内部：清派生缓存 → 按 opsLog 重放 → 按 track 回填到访史 → 重算容量台账。
     *  @param {number} [removedFloor] 本次回滚撤掉的楼层（无 opsLog 真源时用于如实摘除该楼登记）。
     */
    _rebuild(removedFloor) {
        // [v3.221.0] R3-D：**没有 opsLog 真源时不得清空式重建**。
        //   修前实测：导入旧格式存档（v3.180 及以前只有 nodes/track、无 opsLog）之后，
        //   第一次单楼编辑就把整棵树清成 0 个节点 —— 先 `this.nodes.clear()`，再「按 opsLog 重放」，
        //   而 opsLog 是空的，于是**没有人重建**。导入存档恰恰是最需要保住数据的地方。
        //   无真源时如实降级：只摘掉被删那楼的登记节点，其余保留（**不假装重建过**）。
        if (!this.opsLog.length) {
            if (Number.isFinite(Number(removedFloor))) {
                for (const [k, rec] of [...this.nodes]) {
                    if (Number(rec && rec.floor) === Number(removedFloor)) this.nodes.delete(k);
                }
            }
            this.visits = new Map();
            const seen0 = new Set();
            for (const t of [...this.track].sort((a, b) => a.floor - b.floor)) {
                if (!t || !t.pathKey || seen0.has(t.floor)) continue;
                seen0.add(t.floor);
                this._recordVisit(t.pathKey, t.floor);
            }
            this.capacity.nodes = this.nodes.size;
            return this.nodes.size;
        }
        this.nodes.clear();
        this.visits.clear();
        const log = [...this.opsLog].sort((a, b) => a.floor - b.floor);
        for (const e of log) this.apply(e.ops, e.floor, true);
        // 位置轨迹回填到访史：按楼层升序去重（与 _recordVisit 的「不同楼层数」口径一致，
        //   否则重建前后 count 会飘——那正是「读数不可复现」这类缺陷的经典形态）
        const seenFloor = new Set();
        for (const t of [...this.track].sort((a, b) => a.floor - b.floor)) {
            if (!t || !t.pathKey || seenFloor.has(t.floor)) continue;
            seenFloor.add(t.floor);
            this._recordVisit(t.pathKey, t.floor);
        }
        this.capacity.nodes = this.nodes.size;
        return this.nodes.size;
    }

    /** 全清（清空场景树）：节点/轨迹/到访/在场一并清，返回清掉的关键数。 */
    clear() {
        const n = this.nodes.size;
        this.nodes.clear(); this.track = []; this.opsLog = []; this.visits.clear(); this.presence.clear(); this.headers.clear();
        this.lastApply = null; this._broken = [];
        this.capacity = { nodes: 0, dropped: 0, visitsDropped: 0, trackDropped: 0 };
        return n;
    }

    /* ─────────────── 持久化 ─────────────── */

    export() {
        return {
            version: SCENE_VERSION,
            nodes: Array.from(this.nodes.values()),
            track: this.track,
            opsLog: this.opsLog,
            visits: Array.from(this.visits.entries()),
            presence: Array.from(this.presence.entries()),
            headers: Array.from(this.headers.entries()),
            capacity: { ...this.capacity }
        };
    }

    /**
     * 导入。兼容**旧格式**（v3.180 及以前只有 nodes/track/opsLog 三个键）——
     * 缺 visits/presence 时按空处理并**回填**（从 track 重建到访史），
     * 于是老存档升上来也有到访读数，而不是一片空白。
     */
    import(data) {
        if (!data || typeof data !== 'object') return;
        this.nodes = new Map(
            (isArr(data.nodes) ? data.nodes : [])
                .filter(n => n && isArr(n.path) && n.path.length)
                .map(n => [keyOf(n.path), { path: partsOfKey(keyOf(n.path)), desc: oneLine(n.desc).slice(0, MAX_DESC), floor: numOrNull(n.floor) ?? 0, updatedAt: numOrNull(n.updatedAt) ?? 0 }])
        );
        this.track = (isArr(data.track) ? data.track : [])
            .filter(t => t && typeof t.pathKey === 'string' && t.pathKey)
            .map(t => ({ floor: numOrNull(t.floor) ?? 0, pathKey: t.pathKey }))
            .slice(-MAX_TRACK);
        this.opsLog = (isArr(data.opsLog) ? data.opsLog : [])
            .filter(o => o && isArr(o.ops))
            .map(o => ({ floor: numOrNull(o.floor) ?? 0, ops: o.ops }))
            .slice(-MAX_OPS);
        this.visits = new Map();
        if (isArr(data.visits) && data.visits.length) {
            for (const [k, v] of data.visits) {
                if (typeof k !== 'string' || !k || !v || typeof v !== 'object') continue;
                this.visits.set(k, {
                    count: Math.max(0, numOrNull(v.count) ?? 0),
                    firstFloor: numOrNull(v.firstFloor) ?? 0,
                    lastFloor: numOrNull(v.lastFloor) ?? 0,
                    floors: (isArr(v.floors) ? v.floors : []).map(x => num(x)).filter(x => x !== null).slice(-MAX_VISIT_FLOORS)
                });
                if (this.visits.size >= MAX_VISIT_KEYS) break;
            }
        } else {
            // 老格式回填：有轨迹就有到访（否则升级后到访史是死的）
            this.visits = new Map();
            for (const t of this.track) { if (t.pathKey) this._recordVisit(t.pathKey, t.floor); }
        }
        this.presence = new Map();
        if (isArr(data.presence)) {
            for (const [k, v] of data.presence) {
                if (typeof k !== 'string' || !k || !v || typeof v !== 'object') continue;
                const key = trim(v.key) || keyOf(v.path);
                if (!key) continue;
                this.presence.set(k, { key, path: partsOfKey(key), atFloor: numOrNull(v.atFloor) ?? 0, at: numOrNull(v.at) ?? 0 });
                if (this.presence.size >= MAX_PRESENCE) break;
            }
        }
        this.headers = new Map();
        if (isArr(data.headers)) {
            for (const pair of data.headers) {
                if (!isArr(pair) || pair.length < 2) continue;
                // [v3.221.0] R3-D：键也要 numOrNull —— 修前 `num(null)` / `num('')` 都读成 0，
                //   于是导出的 `[null, {...}]` / `['', {...}]` 会**静默落成第 0 楼**的场景头
                //   （export 原样写出，往返一次就多出一条谁也没登记过的「第 0 楼天气」）。
                const f = numOrNull(pair[0]);
                const v = pair[1];
                if (f == null || !v || typeof v !== 'object') continue;
                const date = oneLine(v.date).slice(0, 40);
                const period = oneLine(v.period).slice(0, 20);
                const weather = oneLine(v.weather).slice(0, 40);
                if (!date && !period && !weather) continue;
                if (this.headers.has(f)) continue;                 // 同楼重复：先到先得，不静默覆盖已有快照
                if (this.headers.size >= MAX_HEADERS) break;       // 载入侧同受写侧的上限（此前这条路径无上限）
                this.headers.set(f, { date, period, weather, at: numOrNull(v.at) ?? 0 });
            }
        }
        const cap = data.capacity && typeof data.capacity === 'object' ? data.capacity : {};
        this.capacity = {
            nodes: this.nodes.size,
            dropped: num(cap.dropped) ?? 0,
            visitsDropped: num(cap.visitsDropped) ?? 0,
            trackDropped: num(cap.trackDropped) ?? 0
        };
        this.lastApply = null;
        this._broken = [];
    }

    /**
     * 场所层级树（只读；供下游「地点图鉴」渲染）。
     * 与 brief() 那种「给提取提示词的清单」不同：这里给的是**结构化树**，
     * 每级带 key / 名称 / 描述 / 出处楼层 / 下级，且**严格按登记顺序稳定排序**。
     * 只读、有界（MAX_TREE_ROWS）、绝不抛；取不到就是空数组（不编造）。
     */
    tree(limit = MAX_TREE_ROWS) {
        const cap = Math.max(1, Math.min(Number(limit) || MAX_TREE_ROWS, MAX_TREE_ROWS));
        const byParent = new Map();
        for (const [k, n] of this.nodes) {
            const path = n.path || [];
            if (!path.length) continue;
            const parent = path.length > 1 ? path.slice(0, -1).join('/') : '';
            if (!byParent.has(parent)) byParent.set(parent, []);
            byParent.get(parent).push({ key: k, path, node: n });
        }
        for (const arr of byParent.values()) arr.sort((a, b) => a.key.localeCompare(b.key));
        const out = [];
        const walk = (parentKey, depth) => {
            if (out.length >= cap) return;
            const kids = byParent.get(parentKey) || [];
            for (const it of kids) {
                if (out.length >= cap) return;
                const v = this.visits.get(it.key);
                out.push({
                    key: it.key,
                    path: it.path,
                    name: leafOf(it.path),
                    depth,
                    desc: it.node.desc || '',
                    floor: Number.isFinite(Number(it.node.floor)) ? Number(it.node.floor) : null,
                    visited: !!v,
                    visits: v ? v.count : 0
                });
                walk(it.key, depth + 1);
            }
        };
        walk('', 1);
        return out;
    }

    /**
     * 到访史（只读；供下游「到访史」列表）。
     * 与 visitsList() 同源同口径，但**只吐可 JSON 的纯数据**并带预算。
     * 从未到访 ⇒ 空数组（「没去过」不是「去过 0 次」，故不生成条目）。
     */
    visitHistory(limit = MAX_VISIT_KEYS) {
        const cap = Math.max(1, Math.min(Number(limit) || MAX_VISIT_KEYS, MAX_VISIT_KEYS));
        const out = [];
        for (const [key, v] of this.visits) {
            if (!v || typeof v !== 'object') continue;
            out.push({
                key,
                path: partsOfKey(key),
                count: numOrNull(v.count),
                firstFloor: numOrNull(v.firstFloor),
                lastFloor: numOrNull(v.lastFloor),
                revisit: Number(v.count) > 1,
                registered: this.nodes.has(key),
                desc: (this.nodes.get(key) || {}).desc || ''
            });
        }
        // 排序口径与 visitsList 一致（最近到访在前）；null 排最后，不当作 0。
        out.sort((a, b) => {
            const af = a.lastFloor === null ? -Infinity : a.lastFloor;
            const bf = b.lastFloor === null ? -Infinity : b.lastFloor;
            return bf - af;
        });
        return out.slice(0, cap);
    }

    /**
     * 本楼场景头（日期 / 时段 / 天气）。
     * 与 headerLine() 的差别：这里**分字段**给（下游要按字段渲染，不是一行文本），
     * 且没登记就是 null —— 不回退到别的楼，也不从正文推断。
     */
    headerFace(floor) {
        const h = this.headerAt(floor);
        if (!h) return null;
        return { floor: h.floor, date: h.date || '', period: h.period || '', weather: h.weather || '' };
    }

    /** 只读快照（外供/诊断用；不含 Map/函数，可直接 JSON.stringify）。 */
    summary() {
        return {
            version: SCENE_VERSION,
            scale: this.scale(),
            current: this.currentKey(),
            currentLine: this.currentLine(),
            currentChain: this.currentChain().map(n => ({
                key: keyOf(n.path), path: n.path, name: leafOf(n.path), desc: n.desc || '',
                floor: Number.isFinite(Number(n.floor)) ? Number(n.floor) : null
            })),
            presence: [...this.presence.entries()].map(([name, rec]) => ({ name, key: rec.key, atFloor: rec.atFloor })),
            coverage: this.coverage(),
            // [v3.220.0] R3-A：场所层级 / 到访史 / 场景头三面（下游地点图鉴的输入）。
            //   修前实测：summary() 只吐 current（**末级键的字符串**）与规模四数，
            //   于是手机端「地点」只能显示「当前位置 + N 处场所」，说不出「这地方在市里哪一区」、
            //   「去过哪些、去过几次」、「那天什么天气」——而这三样账本内部**早就有**
            //   （tree/visitsList/headerAt），只是从没出过仓。
            //   三者与 current 同一读取时刻、同一实例，故同修订下必然自洽。
            tree: this.tree(),
            visits: this.visitHistory(),
            header: (() => {
                const f = this.track.length ? this.track[this.track.length - 1].floor : null;
                return this.headerFace(f);
            })(),
            empty: this.nodes.size === 0 && this.track.length === 0
        };
    }
}

const api = {
    SCENE_KEY, SCENE_VERSION, MAX_PATH_DEPTH, MAX_NODES, MAX_BRIEF_LINES, MAX_TREE_ROWS, MAX_HEADERS,
    SceneBook, keyOf, partsOfKey, partsOf, leafOf, ancestorsOf, describeShape
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof global !== 'undefined' && global) {
    try { global.LonShaSceneBook = Object.freeze(api); } catch (_e) { /* 有些宿主冻结全局会抛，忽略 */ }
}
})(typeof window !== 'undefined' ? window : globalThis);
