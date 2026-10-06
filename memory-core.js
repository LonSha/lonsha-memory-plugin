(function (global) {
    'use strict';
/*
 * memory-core.js — 内核数据模型类集（计划 A1 宿主巨兽第六刀）
 *
 * 【为什么需要这一面 / 修前实测】
 *   第一刀 memory-ledgers.js 剥叶子账本；第二刀 memory-aux.js 剥工具类；第三刀
 *   narrative-generators.js 剥生成侧派生系统；第四刀 memory-books.js 剥书册与时间；
 *   第五刀 memory-organs.js 剥六个器官级类。本刀剥的是宿主里最大的一类「内核数据模型」
 *   —— 它们是引擎字段的**唯一容器**，宿主自身只按字段名与方法名驱动它们：
 *     · CharacterState       46 方法 / 774 行 —— 角色状态（基线/漂移/生活小档案/主角卡/
 *                                             NPC 关系/场所/年龄读数/ops 事件溯源）
 *     · SummarySystem        34 方法 / 658 行 —— 摘要体系（楼层摘要/卷/金字塔折叠/
 *                                              锁定事实/手动摘要/AM 索引/重试队列）
 *     · GameClock            13 方法 / 309 行 —— 剧情时钟（时间标签校准/还原/世界钟对账）
 *     · MemoryGraph          18 方法 / 347 行 —— 关系图谱（节点/边/快照/楼层截断/
 *                                              真空压缩/语义层级汇总/事件溯源重放）
 *   合计 2088 行。四个类的公开面（方法名 / 参数签名 / 返回形状 / 字段名 / 中文提示字面量）
 *   与抽取前**逐字一致**；唯一形式变化是类外符号的来源（见「依赖收口」）。
 *
 * 【依赖收口：与第五刀同型（副本 + 活口），但另有四条坐标必须显式选定】
 *     ① **逐字副本**：normalizeCharName / sanitizeJson / areLabelsInConflict 三个函数
 *        与 RELATION_CONFLICT_GROUPS 一个常量，各有一份与宿主逐字一致的副本；
 *        另有三条**取库链副本**（_moduleLib / _memoryBooksLib / _changeset /
 *        _newRelativeTimeHelper）—— 它们**不复制被取对象的逻辑**，只复制「怎么取到它」
 *        这一层（读全局真表达式 → require 回落），故不构成第二真源。
 *        errLog 是唯一**非逐字**的一份（同契约最小实现，见该行上方留痕）。
 *     ② **活口**：bindDeps(deps) 让宿主在引擎构造期把 errLog / sanitizeJson / moduleLib /
 *        memoryBooksLib / changesetLib / relativeTimeHelperFactory / version 换成宿主
 *        **现算**的那一份；没注过则副本就是真实现。
 *   为什么副本必不可少：宿主与历史套件把这些类抠进 new Function 单独重放
 *   （v315 抽 MemoryGraph 方法、v3166/v3175 抽 GameClock 整段、v382 抽 CharacterState 方法、
 *   v340 抽 SummarySystem 类）。类内若继续引用宿主自由标识符，那些抽取面**全部当场
 *   ReferenceError**。
 *   ★ 唯一真源仍是宿主：副本只服务「宿主不在场」这一种情形。宿主改了，副本必须同步。
 *
 * 【本刀必须显式选定坐标的四条（第四刀踩过的旧坑，均按磁盘实读）】
 *   ① **同名函数有两份，取真源份（或干脆不取）**：宿主里 `parseStoryDateLoose` 与
 *      `storyDayDiff` 各有两份——L1756 / L12626（顶层 indent=0，「相对时间前缀」族）与
 *      L12608 一份 indent=4 的（「v2.2 RC」族，走 `{y,mo,d}` 形状）。按源码实读，本刀四个
 *      类体**只在一条注释里出现这两个名字**（CharacterState 时效过期判断上方那句
 *      「复用全局 parseStoryDateLoose + storyDayDiff 式天数差」），**没有代码引用**。
 *      故本模块**不搬也不取**它们；那条注释逐字保留（它是判断依据的留痕，不是死文字）。
 *   ② **字段名与类名不同名**：宿主四个构造点分别是 `this.status` / `this.summary` /
 *      `this.graph` / `this.clock`（**不是** this.characterState / this.memoryGraph …）。
 *      判据不能按类名推字段名。
 *   ③ **类内已整体去 4 空格缩进**：判据里写死 8 空格的锚点在模块内恒红（v340 旧账）。
 *   ④ **errLog 在模块里是活口形态**：宿主是函数声明，这里写成 `let errLog = function (`；
 *      锚点须认两种形态（v3117 旧账）。
 *   ★ 另有一条形态留痕（不单独列项但是本刀特有）：GameClock 与 CharacterState 里有
 *      `(typeof _newRelativeTimeHelper === 'function') ? _newRelativeTimeHelper() : new
 *      RelativeTimeHelper()` 两分支写法。**RelativeTimeHelper 类本身已在第四刀随
 *      memory-books.js 外移，宿主与模块作用域里都没有它** —— 那两处 else 分支是
 *      「形态在场、永不执行」的遗留（两道调用点都在 try 内，抽取面走到它时被 catch 兜住，
 *      与抽取前的结局逐字相同）。本模块**不造假类来填它**：造了就会长出第二个时间解析真源。
 *
 * 【为什么不把这四个类拆成四个模块】
 *   四类互调近零（唯一命中的是 SummarySystem 里一条注释提到 GameClock 一词），但共享同一
 *   批收口符号（errLog / moduleLib / 相对时间助手取库口），且宿主四个构造点相邻、统一走一个
 *   取库口。拆成四份要付出四份前言/边界段 + 四条 manifest 登记 + 四个退路类（每类各写一遍
 *   同形空实现）。故同刀搬：一条登记、一个取库口、一个统一构造点。
 *
 * 【本模块不做什么（边界）】
 *   · 不新增第二实现：四个类体逐字搬，不重写任何行为；
 *   · 不持有宿主状态：类只读自己的字段；宿主上下文（engine / 配置 / 时钟）只经可选链或
 *     注入口取；
 *   · 不静默丢诊断：错误一律经 errLog（bindDeps 可换成宿主那份）记下，调用点原有的
 *     console/errLog 形态逐字保留；
 *   · 不搬宿主函数：parseStoryDateLoose / storyDayDiff / _moduleLib / _changeset /
 *     _memoryBooksLib / _newRelativeTimeHelper / RelativeTimeHelper 一律留在宿主或它们的
 *     真源模块（搬走会偷改 host_beast 与 dead_code 两条读数轴的基线口径），模块侧只用注入口。
 *
 * 【口径纪律】
 *   ① 方法在字段缺失 / 环境不可用时返回空值（0 / false / [] / null / ''），**绝不抛**；
 *      构造签名一字不改（`new Xxx()` 的既有调用点行为不变）；
 *   ② 模块缺席时宿主退到同形空实现（常量返回），如实回报「没有」；
 *   ③ 出口面只给四个类 + bindDeps + PLUGIN_NAME + VERSION，**不做二次导出** ——
 *      副本是内部实现细节，暴露出去就会长出第二个真源。
 */
    /* ── 一、逐字副本：宿主函数符号（模块级 let 活口，bindDeps 可覆盖） ── */
    /* ① errLog：宿主那份含 43 条错误提示矩阵（_ERROR_HINTS），逐字副本会把整张矩阵拖进
     *   模块；故这里给的是**同契约的最小实现**（不抛、不递归、不发散），而宿主在构造期
     *   **必注入**自己的 errLog（见宿主 index.js 的 _bindCoreDeps 调用）—— 唯一真源仍是
     *   宿主，这里只保证「宿主不在场」时不炸。
     *   ★ 留痕：与 memory-organs.js 同一条纪律；形态刻意一致，便于两模块对账。 */
let errLog = function (err, tag) {
    try {
        const msg = String(err && err.message || err || '');
        if (typeof console !== 'undefined' && console.warn) console.warn('[LonShaMemoryCore][' + String(tag || '') + ']', msg);
    } catch (_) { /* 记录器自身不得再抛 */ }
};

    // ── normalizeCharName（宿主逐字副本；类外引用面与宿主同形） ──
function normalizeCharName(name) {
    try {
        return String(name || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
    } catch (e) { errLog(e, 'SF4.normalizeCharName'); return String(name || ''); }
}
    // ── sanitizeJson（宿主逐字副本；类外引用面与宿主同形） ──
function sanitizeJson(raw) {
    try {
        if (!raw) return '';
        let s = String(raw).trim();
        if (!s) return '';

        // 1. 全角引号与全角标点归一化
        s = s.replace(/[\u201c\u201d\u201e\u300c\u300d]/g, '"')
             .replace(/[\u2018\u2019]/g, "'")
             .replace(/\uff0c/g, ',')
             .replace(/\uff1a/g, ':')
             .replace(/\uff1b/g, ';');
        // 单引号键值向双引号转换（保护 don't, it's 等字母间缩写）
        s = s.replace(/([a-zA-Z])'([a-zA-Z])/g, '$1__APOSTROPHE__$2')
             .replace(/'/g, '"')
             .replace(/__APOSTROPHE__/g, "'");

        // 2. 剥离外层闲聊废话与 Markdown 围栏
        const firstObj = s.indexOf('{');
        const firstArr = s.indexOf('[');
        let startIdx = -1;
        let isArray = false;
        if (firstObj !== -1 && firstArr !== -1) {
            if (firstObj < firstArr) { startIdx = firstObj; isArray = false; }
            else { startIdx = firstArr; isArray = true; }
        } else if (firstObj !== -1) {
            startIdx = firstObj; isArray = false;
        } else if (firstArr !== -1) {
            startIdx = firstArr; isArray = true;
        }

        if (startIdx === -1) {
            return s.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
        }

        const endToken = isArray ? ']' : '}';
        const endIdx = s.lastIndexOf(endToken);
        if (endIdx > startIdx) {
            s = s.slice(startIdx, endIdx + 1);
        } else {
            s = s.slice(startIdx);
        }

        // 3. 字符流状态机：修复未转义双引号与字符串内部裸引号
        let out = '';
        let inString = false;
        let escaped = false;
        for (let i = 0; i < s.length; i++) {
            const ch = s[i];
            if (escaped) {
                out += ch;
                escaped = false;
                continue;
            }
            if (ch === '\\') {
                out += ch;
                escaped = true;
                continue;
            }
            if (ch === '"') {
                if (!inString) {
                    inString = true;
                    out += ch;
                } else {
                    // 前瞻下一个非空白字符
                    let nextNonSpace = '';
                    for (let j = i + 1; j < s.length; j++) {
                        const nc = s[j];
                        if (nc !== ' ' && nc !== '\t' && nc !== '\r' && nc !== '\n') {
                            nextNonSpace = nc;
                            break;
                        }
                    }
                    if (!nextNonSpace || nextNonSpace === ',' || nextNonSpace === ':' || nextNonSpace === '}' || nextNonSpace === ']') {
                        inString = false;
                        out += ch;
                    } else {
                        out += '\\"';
                    }
                }
            } else {
                out += ch;
            }
        }

        // 4. 清除对象/数组尾部多余的逗号（悬挂逗号：, } 或 , ]）
        out = out.replace(/,\s*([}\]])/g, '$1');

        // 5. 修复未加引号的纯英文字母对象键（如 { name: "value" } -> { "name": "value" }）
        out = out.replace(/([{,]\s*)([a-zA-Z0-9_$]+)\s*:/g, '$1"$2":');

        return out.trim();
    } catch (e) {
        return String(raw || '').trim();
    }
}
    // ── areLabelsInConflict（宿主逐字副本；类外引用面与宿主同形） ──
function areLabelsInConflict(l1, l2) {
    if (!l1 || !l2 || l1 === l2) return false;
    for (const group of RELATION_CONFLICT_GROUPS) {
        if (group.has(l1) && group.has(l2)) return true;
    }
    const p1 = `${l1}-${l2}`, p2 = `${l2}-${l1}`;
    if (/恋人-决裂|决裂-恋人|友好-敌对|敌对-友好|盟友-宿敌|宿敌-盟友/i.test(p1)) return true;
    return false;
}

    /* ── 二、逐字副本：宿主常量 ── */

const PLUGIN_NAME = 'LonSha记忆引擎';

let VERSION = '3.283.0';   // [留痕] 必须 let：bindDeps 可换（const 会 TypeError，宿主 catch 吞掉并中断整轮注入）

    // [v3.38] 关系多维共存与互斥演化（Zep/Graphiti 理念）——是 areLabelsInConflict 的判据表

const RELATION_CONFLICT_GROUPS = [
    new Set(['陌生', '相识', '友好', '暧昧', '暗恋', '热恋', '恋人', '夫妻', '冷战', '决裂', '陌路']),
    new Set(['盟友', '同行', '中立', '对立', '敌对', '宿敌', '仇敌', '背叛'])
];

    /* ── 三、逐字副本：取库链（不复制被取对象的逻辑，只复制「怎么取到它」） ── */
    /* 为什么它们是副本而不是注入即可：四个类的取库调用点都在**类内部**，抽取面
     * （单测/审计把类抠进 new Function 重放）下宿主闭包不在作用域。故模块侧自带一条与
     * 宿主同契约的取库链：**读全局真表达式 → require 回落 → 都没有返回 null**。
     * ★ 它们不构成第二真源：取库链不持有任何被取对象的实现；宿主在 bindDeps 里把自己
     *   那一条换上之后，模块用的就是宿主那条（含宿主的失败归因登记 _noteModuleFailure）。 */
let _moduleLib = function _moduleLib(getGlobal, fileName) {
    try {
        const viaGlobal = (typeof getGlobal === 'function') ? getGlobal() : null;
        if (viaGlobal) return viaGlobal;
    } catch (e) { /* 读全局失败按未取到处理，继续回落 */ }
    if (typeof require !== 'undefined') {
        try { return require('./' + fileName); } catch (e) { return null; }
    }
    return null;
};
let _memoryBooksLib = function _memoryBooksLib() {
    return _moduleLib(() => window.LonShaMemoryBooks, 'memory-books.js');
};
let _changeset = function _changeset() {
    try {
        const CS = _moduleLib(() => window.LonShaChangeset, 'changeset.js');
        if (!CS || typeof CS.ChangesetStore !== 'function') return null;
        return new CS.ChangesetStore({});
    } catch (e) { return null; }
};
let _newRelativeTimeHelper = function _newRelativeTimeHelper() {
    const MB = _memoryBooksLib();
    const opt = (MB && typeof MB.bindErrLog === 'function') ? MB.bindErrLog({ errLog }) : {};
    const C = (MB && typeof MB.RelativeTimeHelper === 'function') ? MB.RelativeTimeHelper : null;
    if (!C) return null;
    return new C(opt.errLog || errLog);
};

    /* ── 四、四个内核数据模型类（类体与宿主逐字一致，仅整体去 4 空格缩进） ── */

    // ── MemoryGraph（宿主逐字副本，整体去 4 空格缩进）──

class MemoryGraph {
    constructor() {
        this.nodes = new Map();
        this.edges = new Map();
        this.nameIndex = new Map();
        this._snapshots = [];
        this.SNAP_MAX = 6;
        // [v3.43] 吸收 baibai: 图谱关系事件溯源真源 (Graph Delta Replay)
        this.graphOps = []; // [{ floor, edge, ts }]
        this.MAX_GRAPH_OPS = 500;
    }

    // 记录关系操作事件
    _logGraphOp(floor, edge) {
        try {
            this.graphOps.push({ floor: Number(floor) || 0, edge: { ...edge }, ts: Date.now() });
            if (this.graphOps.length > this.MAX_GRAPH_OPS) this.graphOps.shift();
        } catch (e) { errLog(e, 'MemoryGraph._logGraphOp'); }
    }

    // 事件溯源重放：清空所有边，按楼层顺序幂等重放关系网络
    rebuildGraphFromOps() {
        try {
            this.edges.clear();
            const sorted = [...this.graphOps].sort((a, b) => a.floor - b.floor);
            for (const op of sorted) {
                if (op.edge) this.addEdge(op.edge, true);
            }
        } catch (e) { errLog(e, 'MemoryGraph.rebuildGraphFromOps'); }
    }

    // 楼层回滚/滑动重roll时截断溯源流并重放
    rollbackGraphFrom(cutoffFloor) {
        try {
            const f = Number(cutoffFloor) || 0;
            this.graphOps = this.graphOps.filter(op => op.floor < f);
            this.rebuildGraphFromOps();
        } catch (e) { errLog(e, 'MemoryGraph.rollbackGraphFrom'); }
    }
    // [v3.15] 图谱版本快照（收编 zhino）: 每楼记录楼层起点图状态，最多 SNAP_MAX 张
    snapshotGraph(floor) {
        const f = Math.max(0, Math.round(Number(floor) || 0));
        if (!this._snapshots) this._snapshots = [];
        // 同楼重复拍只更新（swipe/重试时覆盖旧快照，不堆积）
        const idx = this._snapshots.findIndex(s => s.floor === f);
        const snap = { floor: f, nodes: Array.from(this.nodes.values()).map(n => ({...n})), edges: Array.from(this.edges.values()).map(e => ({...e})), ts: Date.now() };
        if (idx >= 0) this._snapshots[idx] = snap; else this._snapshots.push(snap);
        // 最多 6 张，超额淘汰最旧
        if (this._snapshots.length > this.SNAP_MAX) {
            this._snapshots.sort((a, b) => a.floor - b.floor);
            this._snapshots.shift();
        }
        if (typeof window !== 'undefined' && window.LonShaMemory?.engine?.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 图谱快照: 楼层 ${f} (共 ${this._snapshots.length} 张)`);
        return snap;
    }
    // [v3.15] 楼层截断回溯: 删除 floor 及之后的快照，回滚到 floor 前的最近快照重建图
    // （zhino: 重roll某楼层后，该楼层及之后的图谱版本被自动截断，用楼层前状态重建）
    truncateGraphFrom(floor) {
        if (!Array.isArray(this._snapshots) || !this._snapshots.length) return false;
        const f = Math.max(0, Math.round(Number(floor) || 0));
        // 找 floor 前（不含）的最近快照
        const before = this._snapshots.filter(s => s.floor < f).sort((a, b) => b.floor - a.floor)[0];
        // 截断: 删除 floor 及之后的快照
        this._snapshots = this._snapshots.filter(s => s.floor < f);
        if (before) {
            this.nodes.clear();
            this.edges.clear();
            for (const n of before.nodes) this.nodes.set(n.id, n);
            for (const e of before.edges) this.edges.set(e.id, e);
            this.rebuildNameIndex();
            if (typeof window !== 'undefined' && window.LonShaMemory?.engine?.config?.config?.debugMode) console.log(`[${PLUGIN_NAME}] 图谱回溯: 回滚到楼层 ${before.floor} 状态 (删楼 ${f})`);
        }
        return !!before;
    }

    addNode(node) {
        const id = node.id || `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const fullNode = {...node, id, timestamp: Date.now()};
        this.nodes.set(id, fullNode);
        if (node.name) {
            // [v3.1] SF4: 归一化索引键（NFKC+空白折叠+小写），「绫地宁宁」与「绫地 宁宁」同一身份
            const nk = normalizeCharName(node.name);
            if (!this.nameIndex.has(nk)) this.nameIndex.set(nk, []);
            if (!this.nameIndex.get(nk).includes(id)) this.nameIndex.get(nk).push(id);
            // 原名键也保留（兼容未归一化的旧查询）
            if (nk !== node.name) {
                if (!this.nameIndex.has(node.name)) this.nameIndex.set(node.name, []);
                if (!this.nameIndex.get(node.name).includes(id)) this.nameIndex.get(node.name).push(id);
            }
        }
        return id;
    }
    // [v3.37/v3.38] 时态知识图谱（Temporal Graph, Zep/Graphiti 理念）:
    // 记录关系的有效区间 [validFrom, validTo]；仅当同维度冲突时标记 closed；不同维度多维共存
    addEdge(edge, _replaying = false) {
        const from = String(edge.from || '');
        const to = String(edge.to || '');
        const label = String(edge.label || edge.relation || 'related');
        const floor = Math.max(0, Math.round(Number(edge.floor ?? edge.validFrom ?? 0)));
        const id = edge.id || (edge.active === false ? `${from}-${to}-${label}-${edge.validTo ?? floor}` : `${from}-${to}-${label}`);

        if (label !== 'participated_in') {
            for (const [existingId, e] of this.edges) {
                if (e.from === from && e.to === to && e.label !== 'participated_in' && e.active !== false) {
                    // 只有属于同维度冲突谓词时才闭环旧关系；正交维度（如师徒 vs 恋人）和谐并存
                    if (areLabelsInConflict(e.label, label)) {
                        e.active = false;
                        e.validTo = floor;
                    }
                }
            }
        }

        const existing = this.edges.get(id);
        const validFrom = (existing && existing.validFrom != null) ? existing.validFrom : (edge.validFrom != null ? edge.validFrom : floor);
        // 关键修复：保留传入的 validTo（防止 import 恢复历史边时被置空覆盖！）
        const validTo = edge.validTo !== undefined ? edge.validTo : null;
        const active = edge.active !== undefined ? edge.active !== false : (validTo === null);

        const fullEdge = {
            ...edge,
            id,
            from,
            to,
            label,
            validFrom,
            validTo,
            active,
            timestamp: Date.now()
        };
        this.edges.set(id, fullEdge);
        if (!_replaying) this._logGraphOp(floor, fullEdge);
        return id;
    }
    findByNames(names) {
        const results = [];
        for (const name of names) {
            // [v3.1] SF4: 查询键归一化（原名查不到时降级归一化键）
            const ids = this.nameIndex.get(name) || this.nameIndex.get(normalizeCharName(name));
            if (ids) for (const id of ids) { const node = this.nodes.get(id); if (node) results.push(node); }
        }
        return results;
    }
    // [v3.6] 按名查单节点（角色去重用——命中第一个 character 类型的节点）
    findCharacterByName(name) {
        try {
            const nk = normalizeCharName(name);
            const ids = [...(this.nameIndex.get(nk) || []), ...(this.nameIndex.get(name) || [])];
            for (const id of ids) {
                const n = this.nodes.get(id);
                if (n && n.type === 'character') return n;
            }
            return null;
        } catch (e) { errLog(e, 'GD.findCharacterByName'); return null; }
    }
    // [v3.6] 索引全量重建（rollbackFloor 删节点后必须重建——原实现只 clear 不重建，名称查询全失效）
    rebuildNameIndex() {
        try {
            this.nameIndex.clear();
            for (const node of this.nodes.values()) {
                if (!node?.name) continue;
                const nk = normalizeCharName(node.name);
                if (!this.nameIndex.has(nk)) this.nameIndex.set(nk, []);
                if (!this.nameIndex.get(nk).includes(node.id)) this.nameIndex.get(nk).push(node.id);
                if (nk !== node.name) {
                    if (!this.nameIndex.has(node.name)) this.nameIndex.set(node.name, []);
                    if (!this.nameIndex.get(node.name).includes(node.id)) this.nameIndex.get(node.name).push(node.id);
                }
            }
        } catch (e) { errLog(e, 'GD.rebuildNameIndex'); }
    }
    // [v3.39] 数据库级实体倒排索引快速匹配: 代替 O(N) 全量循环
    findNodesMentionedIn(text) {
        if (!text || typeof text !== 'string') return [];
        const hits = new Set();
        for (const [nameKey, ids] of this.nameIndex) {
            if (nameKey.length >= 2 && text.includes(nameKey)) {
                for (const id of ids) {
                    const node = this.nodes.get(id);
                    if (node) hits.add(node);
                }
            }
        }
        return Array.from(hits);
    }
    // [v3.40] 数据库级碎片整理与真空压缩 (Graph Vacuum & Compaction)
    vacuum(options = {}) {
        const maxHistoricalPerPair = Math.max(1, Number(options.maxHistoricalPerPair) || 3);
        const pruneOrphans = options.pruneOrphans !== false;
        let prunedEdges = 0;
        let prunedNodes = 0;

        // 1. 时态历史边压缩 (Historical Edges Compaction)
        const pairHistMap = new Map();
        for (const [id, e] of this.edges) {
            if (e.active === false) {
                const pairKey = `${e.from}->${e.to}`;
                if (!pairHistMap.has(pairKey)) pairHistMap.set(pairKey, []);
                pairHistMap.get(pairKey).push(e);
            }
        }
        for (const [pairKey, histEdges] of pairHistMap) {
            if (histEdges.length > maxHistoricalPerPair) {
                histEdges.sort((a, b) => (Number(b.validTo) || 0) - (Number(a.validTo) || 0));
                const toRemove = histEdges.slice(maxHistoricalPerPair);
                for (const re of toRemove) {
                    this.edges.delete(re.id);
                    prunedEdges++;
                }
            }
        }

        // 2. 孤儿临时节点回收 (Prune Orphan Transient Nodes)
        if (pruneOrphans) {
            const connectedNodeIds = new Set();
            for (const e of this.edges.values()) {
                connectedNodeIds.add(e.from);
                connectedNodeIds.add(e.to);
            }
            for (const [id, node] of this.nodes) {
                if (node && node.type !== 'character' && !connectedNodeIds.has(id)) {
                    this.nodes.delete(id);
                    prunedNodes++;
                }
            }
        }

        // 3. 索引自愈重构
        if (prunedNodes > 0 || prunedEdges > 0) {
            this.rebuildNameIndex();
        }
        return { prunedEdges, prunedNodes, remainingNodes: this.nodes.size, remainingEdges: this.edges.size };
    }
    // [v3.184] 语义汇总（Node Rollup，Luker compactNodes 的 LonSha 映射）：
    //   vacuum 只做减法（历史边压缩 / 孤儿回收），节点数本身没有收敛通道——
    //   长线跑下来同批角色/事件会以几百个平铺节点存在，findNodesMentionedIn 的
    //   返回集越来越大、在召回里互相挤占。本方法做加法：给一批「太散但还有用」的
    //   节点建共同父级 + semantic_contains 边，**不删任何子节点**。
    //   判据本体在 node-rollup.js（纯函数、可单测）；此处只负责写入与记账。
    rollupGroup(childIds, summary, opts = {}) {
        try {
            const RU = _moduleLib(() => window.LonShaNodeRollup, 'node-rollup.js');
            if (!RU || typeof RU.planRollup !== 'function') {
                this._rollupRead = this._rollupRead || { created: 0, rejected: 0, lastReason: 'module-unavailable' };
                this._rollupRead.rejected++;
                this._rollupRead.lastReason = 'module-unavailable';
                return { ok: false, reason: 'module-unavailable' };
            }
            const plan = RU.planRollup(this.nodes, childIds, summary, opts);
            if (!plan.ok) {
                this._rollupRead = this._rollupRead || { created: 0, rejected: 0, lastReason: '' };
                this._rollupRead.rejected++;
                this._rollupRead.lastReason = plan.reason;
                return plan;
            }
            // 写入走 addNode/addEdge 原路径（不走后门）：这样 graphOps 事件溯源、
            //   nameIndex 重建、快照三条记账都自然生效。
            const parentId = this.addNode(plan.parent);
            const children = plan.childIds.map(id => this.nodes.get(id)).filter(Boolean);
            const seqTo = children.reduce((m, c) => Math.max(m, Number(c?.seqTo ?? 0) || 0), 0);
            if (Number.isFinite(seqTo) && seqTo > 0) {
                const pn = this.nodes.get(parentId);
                if (pn) pn.seqTo = seqTo;
            }
            for (const cid of plan.childIds) {
                // 认领标记写在子节点上：一层只能有一个父，重复压缩会互相覆盖。
                const child = this.nodes.get(cid);
                if (child) {
                    child.data = child.data || {};
                    child.data.rollupParent = String(parentId);
                }
                this.addEdge({ from: parentId, to: cid, type: 'semantic_contains', label: 'semantic_contains' });
            }
            this.rebuildNameIndex();
            this._rollupRead = this._rollupRead || { created: 0, rejected: 0, lastReason: '' };
            this._rollupRead.created++;
            this._rollupRead.lastReason = 'ok';
            this._rollupRead.lastCovered = plan.childIds.length;
            return { ok: true, reason: 'ok', parentId, childIds: plan.childIds };
        } catch (e) {
            errLog(e, 'MemoryGraph.rollupGroup');
            return { ok: false, reason: 'threw' };
        }
    }
    // [v3.184] 图维护总入口：先把碎片收进层，再做真空压缩。
    //   为什么两者要一起调：vacuum 的孤儿回收会把「刚被汇总父认领、但原本无父」的节点
    //   误判成孤儿（它只看边不看语义归属），反过来先 vacuum 再 rollup 则会漏掉
    //   本可成组的一批。顺序固定为 rollup → vacuum，且 vacuum 需知道汇总父的存在。
    maintainGraph(options = {}) {
        const out = { rollup: null, vacuum: null };
        try {
            if (options.rollup !== false) {
                out.rollup = this.autoRollup(options);
            }
        } catch (e) { errLog(e, 'MemoryGraph.maintainGraph.rollup'); }
        try {
            if (options.vacuum !== false) {
                out.vacuum = this.vacuum({ maxHistoricalPerPair: options.maxHistoricalPerPair, pruneOrphans: options.pruneOrphans });
            }
        } catch (e) { errLog(e, 'MemoryGraph.maintainGraph.vacuum'); }
        return out;
    }
    // [v3.184] 自动成组：把「同类型、尚未被认领」的节点每 minChildren 个压成一层。
    //   不做任何 LLM 调用：summary 用确定性拼接（节点名 + 楼层），保证同一批输入产出同一结果
    //   （否则每次维护都生成不同的父节点名，图反而更乱）。
    //   排序依据与边界依据**分开**：本仓的事件节点 floor 挂在边上、节点自己没有，
    //   若要求必须有 node.floor 则事件节点全被跳过（接上了但永远空转）。
    //   故：排序用 floor ?? data.floor ?? timestamp（总有值）；边界仍只认真 floor，
    //   缺了就只是这批不写 rollupFloorStart——两件事不能混成一条闸门。
    autoRollup(options = {}) {
        const minChildren = Math.max(2, Number(options.minChildren) || 4);
        const types = Array.isArray(options.types) && options.types.length ? options.types : ['event'];
        const created = [];
        const skipped = [];
        for (const type of types) {
            const pool = [];
            for (const n of this.nodes.values()) {
                if (!n || n.type !== type) continue;
                if (n.data && (n.data.rollupParent || n.data.rollupKind)) continue;   // 已认领 / 自己就是汇总层
                const f = Number.isFinite(Number(n.floor)) ? Number(n.floor)
                    : (n.data && Number.isFinite(Number(n.data.floor)) ? Number(n.data.floor) : null);
                const ts = Number(n.timestamp) || 0;
                if (f === null && !ts) { skipped.push(String(n.id)); continue; }      // 真判不了（无楼层也无时间戳）
                pool.push({ node: n, sortKey: f === null ? ts : f, floor: f });
            }
            pool.sort((a, b) => a.sortKey - b.sortKey);
            for (let i = 0; i + minChildren <= pool.length; i += minChildren) {
                const batch = pool.slice(i, i + minChildren);
                const summary = batch.map(x => x.node.name + (x.floor === null ? '' : '（第' + x.floor + '楼）')).join('；');
                const r = this.rollupGroup(batch.map(x => String(x.node.id)), summary, {
                    type, minChildren, label: type,
                });
                if (r.ok) created.push(r.parentId);
            }
        }
        return { created: created.length, parentIds: created, skipped: skipped.length };
    }
    export() { return {nodes: Array.from(this.nodes.values()), edges: Array.from(this.edges.values()), snapshots: Array.isArray(this._snapshots) ? this._snapshots : [], graphOps: Array.isArray(this.graphOps) ? this.graphOps : []}; }
    import(data) {
        this._snapshots = Array.isArray(data?.snapshots) ? data.snapshots : [];
        this.nodes.clear(); this.edges.clear(); this.nameIndex.clear();
        if (data?.nodes) for (const node of data.nodes) this.nodes.set(node.id, node);
        if (data?.edges) for (const edge of data.edges) this.edges.set(edge.id, edge);
        this.graphOps = Array.isArray(data?.graphOps) ? data.graphOps : [];
        this.rebuildNameIndex();   // [v3.6] 统一走重建（原实现不归一化，SF4 归一化键缺失）
    }
}
    // ── SummarySystem（宿主逐字副本，整体去 4 空格缩进）──
class SummarySystem {
    constructor() { this.summaries = []; this.volumes = []; this.historical = []; this.genericTiers = []; this.folding = false; this.foldingHistorical = false; }
    // 诊断适配层：允许 SummarySystem 在宿主闭包和独立单类测试中都安全记录错误。
    _reportError(error, tag) {
        try {
            if (typeof errLog === 'function') return errLog(error, tag);
        } catch (_) {}
        try {
            globalThis.LonShaMemory?.reportError?.(error, tag);
        } catch (_) {}
    }
    // [v3.62] 用户锁定剧情事实（dsh-nexttavern lockedFacts 理念）：逐字保护，永不因摘要压缩丢失
    addLockedFact(text, floor) {
        const t = String(text || '').trim();
        if (!t) return null;
        this.lockedFacts = this.lockedFacts || [];
        const id = 'lf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        this.lockedFacts.push({ id, text: t, floor: Number(floor) || 0, createdAt: Date.now() });
        return id;
    }
    removeLockedFact(id) {
        this.lockedFacts = this.lockedFacts || [];
        const before = this.lockedFacts.length;
        this.lockedFacts = this.lockedFacts.filter(f => f.id !== id);
        return this.lockedFacts.length < before;
    }
    getLockedFacts() { return this.lockedFacts || []; }
    // 锁定事实注入文本（逐字，带来源楼层）
    // [v3.91] 审计修复：config.lockedFactMaxChars 此前全项目零引用，锁定事实无上限灌入注入。
    //         预算裁剪按条目顺序累加，超出预算的条目整体舍弃（不截断单条，避免语义残缺）。
    lockedFactsForPrompt(maxChars) {
        const list = this.getLockedFacts();
        if (!list.length) return '';
        const cap = Number(maxChars);
        const budget = Number.isFinite(cap) && cap > 0 ? Math.round(cap) : Infinity;
        const lines = [];
        let used = 0;
        for (const f of list) {
            const line = '- ' + f.text + '（第' + f.floor + '楼锁定）';
            if (used + line.length + (lines.length ? 1 : 0) > budget) break;
            lines.push(line);
            used += line.length + (lines.length > 1 ? 1 : 0);
        }
        return lines.join('\n');
    }
    // [v3.28] 三级金字塔（st-memory-wizzard）: summaries(level1日记) → volumes(level2周记/卷) → historical(level3史记)
    // [v3.74] A: 摘要手动操作（柏宝书 editSummary 缝入）——编辑摘要文本 + 手动补摘
    updateSummaryText(floor, newText) {
        const t = String(newText || '').trim();
        if (!t) return false;
        const s = this.summaries.find(x => x.floor === Number(floor));
        if (!s) return false;
        s.text = this.smartTruncate(t, 2000);
        s.edited = true;
        s.editedAt = Date.now();
        // [v3.75] A: OpLog 埋点（summary/update）
        try { this.opLog?.log?.('summary', 'update', 'sum_' + floor, floor, String(t).slice(0, 40)); } catch (e) { this._reportError(e, 'nonfatal') }
        return true;
    }
    /** 手动补摘（柏宝书：任意楼层单独补摘）——为缺失楼层的旧剧情补一条摘要
     *  [v3.80] C: 支持 storyTime 参数（从原文时间标签提取——供相对时间前缀与时间线衔接） */
    addManualSummary(floor, text, storyTime = '') {
        const t = String(text || '').trim();
        const f = Number(floor);
        if (!t || !Number.isFinite(f) || f < 0) return null;
        // 幂等：同楼层已有摘要则拒绝
        if (this.summaries.some(x => x.floor === f)) return null;
        const s = {
            floor: f,
            text: this.smartTruncate(t, 2000),
            timestamp: Date.now(),
            manual: true,
            importance: 5
        };
        // [v3.80] C: 时间标签衔接（补齐摘要也能被相对时间前缀消费）
        const st = String(storyTime || '').trim();
        if (st) s.storyTime = st;
        this.summaries.push(s);
        this.summaries.sort((a, b) => a.floor - b.floor);
        // [v3.75] A: OpLog 埋点（summary/manual）
        try { this.opLog?.log?.('summary', 'manual', 'sum_' + f, f, String(t).slice(0, 40)); } catch (e) { this._reportError(e, 'nonfatal') }
        return s;
    }
    /** 缺失楼层清单（柏宝书：一键把落下的楼层批量补齐的前置）
     *  [v3.79] B: 排除番外楼（lonsha_omit）——番外楼对引擎彻底不存在，不得被扫入批量补齐 */
    missingFloors(maxFloor) {
        const have = new Set(this.summaries.map(s => s.floor));
        const missing = [];
        let chat = null;
        try { chat = window.SillyTavern?.getContext?.()?.chat || null; } catch (e) { this._reportError(e, 'nonfatal') }
        for (let f = 0; f <= (Number(maxFloor) || 0); f++) {
            if (have.has(f)) continue;
            // 番外楼 / 用户楼 / 系统楼不列入缺失（不是「落下的」而是「不该记的」）
            try {
                const m = chat?.[f];
                if (m) {
                    if (m.extra?.lonsha_omit === true) continue;
                    if (m.is_user === true) continue;
                    if (m.is_system === true && m.extra?.type) continue;
                }
            } catch (e) { this._reportError(e, 'nonfatal') }
            missing.push(f);
        }
        return missing;
    }
    /** [v3.76] A: 一键批量补齐（柏宝书「一键把落下的楼层批量补齐」）——异步 LLM 管线，最多补 maxBatch 楼
     *  防重入 _batchCompleting；调用方须传 chatLookup(floor) → 该楼原文（由引擎层注入） */
    async completeMissingFloors(config, llm, chatLookup, maxBatch = 5) {
        if (this._batchCompleting) return { done: 0, skipped: true };
        const maxFloor = (window.SillyTavern?.getContext?.()?.chat?.length || 1) - 1;
        const missing = this.missingFloors(maxFloor);
        if (!missing.length) return { done: 0, missing: 0 };
        this._batchCompleting = true;
        let done = 0;
        try {
            for (const f of missing.slice(0, maxBatch)) {
                const text = typeof chatLookup === 'function' ? (chatLookup(f) || '') : '';
                if (!text || text.length < 10) continue;
                try {
                    const prompt = '你是剧情记忆整理员。以下是第' + f + '楼的对话原文，请用【监控摄像头视角】重写本轮剧情摘要，30-80字，纯叙述句，无markdown。只输出摘要本身。\n\n' + text.slice(0, 1500);
                    const raw = await llm.callAPI(prompt);
                    const clean = String(raw || '').replace(/^[-•\s]+/, '').trim();
                    if (clean && clean.length >= 10) {
                        // [v3.80] C: 从该楼原文提取时间标签（bbs_start/bbs_end → 结束时间作为 storyTime）
                        let stTag = '';
                        try {
                            const dta = _newRelativeTimeHelper().extractDualTimeTags(text);
                            if (dta?.hasDual && dta.end) stTag = String(dta.end).split(/\s+/)[0];
                            else if (dta?.start) stTag = String(dta.start).split(/\s+/)[0];
                        } catch (e) { this._reportError(e, 'nonfatal') }
                        const s = this.addManualSummary(f, clean, stTag);
                        if (s) {
                            done++;
                            try { this.opLog?.log?.('summary', 'manual', 'sum_' + f, f, '批量补齐'); } catch (e) { this._reportError(e, 'nonfatal') }
                        }
                    }
                } catch (e) { /* 单楼失败跳过 */ }
            }
        } finally {
            this._batchCompleting = false;
        }
        return { done, missing: this.missingFloors(maxFloor).length };
    }
    // [v1.4.2] 智能截断：优先在句子边界断开，避免"但那个"式半句截断
    smartTruncate(text, maxLen) {
        text = String(text || '').trim();
        if (text.length <= maxLen) return text;
        const cut = text.substring(0, maxLen);
        let lastEnd = -1;
        for (const ch of ['。', '！', '？', '…', '”', '"']) {
            const i = cut.lastIndexOf(ch);
            if (i > lastEnd) lastEnd = i;
        }
        return lastEnd > maxLen * 0.5 ? cut.substring(0, lastEnd + 1) : cut + '……';
    }

    // [v3.51] 吸收 baibai 摘要纪律: 主干句压缩——抽取「谁+做了什么+结果」，去氛围描写/阅读理解句式。
    // 用于向量/BM25 索引素材（索引质量决定召回质量），正文摘要不改动。
    compressSummary(text, maxLen) {
        text = String(text || '').replace(/\s+/g, ' ').trim();
        if (!text) return '';
        // 按句切分
        const sentences = text.split(/(?<=[。！？…])/).map(s => s.trim()).filter(Boolean);
        if (!sentences.length) return this.smartTruncate(text, maxLen || 120);
        // 氛围/阅读理解句式过滤（抄 baibai 摘要纪律：索引只要事实主干）
        const noise = /(气氛|氛围|空气|安静的|沉默的|仿佛|似乎|让人|令人|体现了|暗示了|意味着|象征着|心态|情绪的|复杂的)/;
        const timeWords = /(然后|接着|随后|之后|最后|同时)/;
        const scored = [];
        for (const s of sentences) {
            let score = 0;
            if (s.length >= 8 && s.length <= 80) score += 2;          // 主干长度带
            if (/[""「」''\u201c\u201d]/.test(s)) score += 1;        // 含台词引用
            if (/(说|问|答|喊|叫|道|告诉|发现|拿|给|走|来|去|杀|死|救|帮助|拒绝|同意)/.test(s)) score += 3;  // 动作/交互主干
            if (noise.test(s)) score -= 4;                            // 氛围句降权
            if (timeWords.test(s) && s.length < 20) score -= 2;       // 纯过渡短句降权
            scored.push({ s, score });
        }
        // [v3.51] 噪声句（负分）直接剔除——氛围/阅读理解句式不入索引素材
        const kept = scored.filter(x => x.score > 0);
        const usable = kept.length ? kept : scored.slice().sort((a, b) => b.score - a.score).slice(0, 1);  // 全噪声时保底留最高分1句
        usable.sort((a, b) => b.score - a.score);
        // 取 top 句子按原文顺序拼接（保持叙事时序）
        const limit = Math.max(1, Math.ceil((maxLen || 120) / 40));
        const picked = usable.slice(0, limit).map(x => x.s);
        // 按原句顺序重排
        const ordered = sentences.filter(s => picked.includes(s));
        const out = (ordered.length ? ordered : picked).join('');
        return this.smartTruncate(out, maxLen || 120);
    }
    async createSummary(message, llmSummary, opts = {}) {
        if (!message && !llmSummary) return null;
        const safeMes = typeof message?.mes === 'string' ? message.mes : (typeof message === 'string' ? message : '');
        // [v3.91] 审计修复：降级截断长度原硬编码 200，绕过 config.maxSummaryLength（UI 有 50-500 滑块但引擎从不读取）。
        //         改由调用方通过 opts.maxLen 传入；缺省仍为 200 保持行为兼容。
        const _maxLen = Number(opts.maxLen);
        const text = llmSummary || this.smartTruncate(safeMes, Number.isFinite(_maxLen) && _maxLen > 0 ? Math.round(_maxLen) : 200);
        const rawFloor = Number(message?.index ?? message?.floor);
        const floor = Number.isFinite(rawFloor) ? Math.max(0, Math.round(rawFloor)) : 0;
        // [v3.7] 同楼去重: 编辑重提取/手动补提时同楼摘要替换而非堆积（原实现 push 不去重——10 次编辑 = 10 条同楼摘要）
        const existIdx = this.summaries.findIndex(s => s.floor === floor);
        if (existIdx >= 0) {
            const old = this.summaries[existIdx];
            // [v3.8] 降级保护: 本地截断摘要（无 LLM 时）不得劣化覆盖已有摘要（提取锁排队超时场景）
            if (opts.degraded && !opts.force) return old;
            // 仅当新文本不同才替换（保 id/timestamp 连续性）
            if (old.text !== text) {
                const _st2 = String(opts.storyTime || '').trim();
                this.summaries[existIdx] = { ...old, text, timestamp: Date.now(), degradedText: !!opts.degraded || undefined, ...(_st2 ? { storyTime: _st2 } : {}) };
            }
            return this.summaries[existIdx];
        }
        const summary = {floor, text, level: 1, timestamp: Date.now(), folded: false};
        // [v3.201] D2: 摘要条目带 storyTime，供 buildInjection 相对时间前缀消费
        const _st = String(opts.storyTime || '').trim();
        if (_st) summary.storyTime = _st;
        this.summaries.push(summary);
        return summary;
    }
    // 活跃（未折叠）摘要
    // 活跃（未折叠且非休眠）摘要
    // [v3.38] 语义级休眠与激活机制（TriviumDB 双区记忆理念）: 长期未涉足的旧摘要自动进入休眠态
    // [v3.41] 吸收 Stitches: 紧凑 AM 记忆地址编码索引 (Memory Address Code)
    generateAMIndex(limit = 25) {
        const active = this.getActiveSummaries().slice(-limit);
        if (!active.length) return '';
        return active.map(s => `[AM${s.floor}] 第${s.floor}楼: ${s.text}`).join('\n');
    }
    // 按 AM 编码快速反解召回完整记忆
    resolveByAMCodes(codesInput) {
        if (!codesInput) return [];
        const codes = Array.isArray(codesInput)
            ? codesInput
            : String(codesInput).match(/AM\d+/gi) || [];
        const floors = new Set(codes.map(c => Number(String(c).replace(/^AM/i, ''))).filter(n => !isNaN(n)));
        return (this.summaries || []).filter(s => floors.has(s.floor));
    }
    getActiveSummaries() { return this.summaries.filter(s => !s.folded && !s.dormant); }
    search(query) { return this.getActiveSummaries().filter(s => s.text.includes(query)).slice(0, 5); }
    
    // [v3.38] 标记休眠：超过 threshold 楼层未提及且非高重要度的已折叠旧摘要进入休眠
    markDormant(currentFloor, threshold = 30) {
        for (const s of (this.summaries || [])) {
            if (!s.folded) continue;
            const dist = currentFloor - (s.floor || 0);
            if (dist > threshold && (s.importance || 5) < 8 && !s.awakened) {
                s.dormant = true;
            }
        }
    }
    // [v3.38] 实体引燃休眠伏笔唤醒：当出现相关实体时，休眠记忆苏醒
    awakenByEntities(entities) {
        const awakened = [];
        if (!Array.isArray(entities) || !entities.length) return awakened;
        for (const s of (this.summaries || [])) {
            if (s.dormant) {
                const hit = entities.some(e => e && e.length >= 2 && s.text && s.text.includes(e));
                if (hit) {
                    s.dormant = false;
                    s.awakened = true;
                    awakened.push(s);
                }
            }
        }
        return awakened;
    }
    // [v1.9] P1: 层级折叠——活跃摘要超过阈值时，把最早一批用 LLM 合并成卷摘要
    async maybeFold(config, llm) {
        if (this.folding || !config?.summaryFoldEnabled) return null;
        const active = this.getActiveSummaries();
        if (active.length < (config.summaryFoldThreshold || 30)) return null;
        const batchSize = config.summaryFoldBatchSize || 20;
        const batch = active.slice(0, batchSize);
        if (batch.length < 5) return null;
        this.folding = true;
        try {
            const list = batch.map(s => '- [第' + s.floor + '楼] ' + s.text).join('\n');
            // [v3.62] 增量摘要（dsh appendDelta 理念）：携带上一卷摘要为基线，只追加新增与更正，不重抄旧事件
            const prevVol = this.volumes.length ? this.volumes[this.volumes.length - 1] : null;
            const baseline = prevVol ? '【既有卷摘要基线】（第' + prevVol.floorStart + '-' + prevVol.floorEnd + '楼，本次输出必须在此基线上追加，不要删除、概括或重新抄写基线中已记录的事件）\n' + prevVol.text + '\n\n' : '';
            // [v3.66] dsh 三合一：text（卷摘要）+ deltas（正史增量）+ conflicts（矛盾核对）一次产出
            const prompt = `你是剧情记忆整理员。${baseline}以下是新一段剧情的${batch.length}条楼层摘要（带楼层指针）。请返回 JSON 对象（只输出 JSON，不要 markdown 代码块）：
{"text":"更新后的完整卷摘要（120-220字，在既有基线上追加，保留关键人物、地点、因果、转折、具体台词与数字，关键事实后附（第N楼）指针）","deltas":[{"evidenceFloor":来源楼层号,"summary":"新增事实一句话","status":"established或uncertain"}],"conflicts":[{"evidenceFloor":来源楼层号,"claim":"新说法","canon":"既有记录","severity":"low或medium或high"}]}
deltas 只列本次新增的重要事实（established=有明确证据，uncertain=存疑待后续佐证）；conflicts 只列新旧说法对不上的矛盾（不把未知情况当冲突）。没有增量或矛盾时对应数组为空。\n\n${list}`;
            const raw = await llm.callAPI(prompt);
            const rawText = String(raw || '').trim();
            // [v3.66] 三通道解析：优先 JSON（text+deltas+conflicts），降级纯文本（只取 text）
            let clean = '';
            let deltasList = null, conflictsList = null;
            const jsonMatch = rawText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(sanitizeJson(jsonMatch[0]));
                    if (typeof parsed.text === 'string' && parsed.text.length >= 20) {
                        clean = parsed.text.trim();
                        deltasList = Array.isArray(parsed.deltas) ? parsed.deltas : [];
                        conflictsList = Array.isArray(parsed.conflicts) ? parsed.conflicts : [];
                    }
                } catch (e) { /* JSON 解析失败降级纯文本 */ }
            }
            if (clean === null) {
                clean = rawText.replace(/^[-•\s]+/, '').trim();
                // 剥离可能残留的 JSON 包装说明
                if (clean.startsWith(String.fromCharCode(96,96,96))) clean = clean.slice(3).trim();
            }
            clean = String(clean || '');
            if (clean && clean.length >= 20) {
                // [v3.66] 双通道消费：deltas 进正史增量账本，conflicts 进矛盾账本
                if (deltasList?.length && this.deltaBook) {
                    const n = this.deltaBook.addFromList(deltasList, batch[0]?.floor);
                    if (n > 0) {
                        if (config.debugMode) console.log(`[${PLUGIN_NAME}] 📒 正史增量 +${n} 条（卷摘要折叠）`);
                        // [v3.69] A2: OpLog delta 埋点（第 15 类型）
                        this.opLog?.log?.('delta', 'add', 'fold_' + (batch[0]?.floor ?? '?'), batch[0]?.floor, '+' + n + '条增量');
                    }
                }
                if (conflictsList?.length && this.conflicts) {
                    for (const c of conflictsList) {
                        this.conflicts.add(c?.claim, c?.canon, String(c?.claim || '').slice(0, 100), c?.note || '摘要核对', batch[0]?.floor, '', c?.severity);
                    }
                }
                const floors = batch.map(s => s.floor).filter(f => f !== undefined && f !== null);
                const _volId = 'vol_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
                // [v3.149] 源楼层指纹快照（柏宝书 #13 intact 判定素材）：折叠时对账当前指纹，任一失效→整卷降级+源摘要回活跃池
                let _srcFps = null;
                try {
                    const _chat = (typeof window !== 'undefined' && window.SillyTavern?.getContext?.()?.chat) || [];
                    _srcFps = batch.map(s => {
                        const _m = _chat[s.floor];
                        const _fp = (this.fpOf ? this.fpOf(_m) : '');
                        return s.floor + ':' + _fp;
                    }).filter(x => !x.endsWith(':'));
                } catch (e) { _srcFps = null; }
                this.volumes.push({
                    id: _volId,
                    text: clean,
                    floorStart: floors.length ? Math.min(...floors) : 0,
                    floorEnd: floors.length ? Math.max(...floors) : 0,
                    count: batch.length,
                    timestamp: Date.now(),
                    level: 2,   // [v3.28] 卷摘要 = 周记层（中层）
                    srcFps: (_srcFps && _srcFps.length) ? _srcFps : undefined,   // [v3.149] 缺省 undefined（引擎类内 window undefined → 快照为 null）
                    degraded: false
                });
                batch.forEach(s => { s.folded = true; s.volumeId = _volId; });
                // [v3.154] 卷上限显式化（anima #31）：旧写法 `> 20 → shift()` 静默丢卷，
                //   被丢的叙事再也回不来。改为可配置 + 淘汰前把该卷折叠的源摘要解折叠回活跃池
                //   （与 verifyVolumesIntact 降级同语义：卷没了，源摘要必须能重新参与召回）。
                const _volCap = Math.max(2, Number(config.volumeRetention) || 40);
                while (this.volumes.length > _volCap) {
                    const _evicted = this.volumes.shift();
                    let _revived = 0;
                    if (_evicted) {
                        for (const _s of (this.summaries || [])) {
                            if (_s && _s.folded && _s.volumeId === _evicted.id) { _s.folded = false; _s.volumeId = undefined; _revived++; }
                        }
                        try { this.opLog?.log?.('summary', 'evict', _evicted.id, _evicted.floorStart, `卷上限(${_volCap})淘汰: 解折叠 ${_revived} 条源摘要`); } catch (e) {}
                        if (config.debugMode) console.warn(`[${PLUGIN_NAME}] 卷摘要淘汰: 第${_evicted.floorStart}-${_evicted.floorEnd}楼（解折叠 ${_revived} 条源摘要回活跃池）`);
                    }
                }
                // [v3.28] 三级金字塔: 卷摘要（周记）积累超阈值 → 继续折叠成史记（最高层）
                if (this.volumes.length >= (config.historicalFoldThreshold || 12)) {
                    try { this.maybeFoldHistorical(config, llm); } catch (e2) { if (config?.debugMode) console.warn(`[${PLUGIN_NAME}] 史记折叠失败:`, e2); }
                }
                if (config.debugMode) console.log(`[${PLUGIN_NAME}] 摘要折叠: ${batch.length}条 → 卷摘要#${this.volumes.length}`);
                return this.volumes[this.volumes.length - 1];
            }
        } catch (e) {
            if (config?.debugMode) console.warn(`[${PLUGIN_NAME}] 摘要折叠失败:`, e);
            // [v3.70] B: 折叠失败入重试队列（结构化重试，指数退避）
            try { this.enqueueRetry('volume', 1, { batchLen: batch?.length }, config); } catch (e2) { this._reportError(e2, 'nonfatal'); }
        } finally {
            this.folding = false;
        }
        return null;
    }
    // [v3.70] 柏宝书 7 层金字塔泛化：史记之上自动生长 tier3（书）/tier4（传奇）
    // genericTiers: [{ tier: 3, name: '书', items: [...] }, { tier: 4, name: '传奇', items: [...] }]
    async foldHigherTiers(config, llm) {
        if (!config?.pyramidAutoExtend) return null;
        const tiers = Array.isArray(config.pyramidTiers) ? config.pyramidTiers : ['日记', '周记', '史记', '书', '传奇'];
        if (!this.genericTiers) this.genericTiers = [];
        // 从 tier3 开始逐层检查：上一层（historical 或上一层 generic）积累超阈值 → 折叠
        let changed = false;
        for (let t = 3; t < tiers.length; t++) {
            const sourceItems = t === 3 ? this.historical : (this.genericTiers.find(g => g.tier === t - 1)?.items || []);
            const threshold = config.historicalFoldThreshold || 12;
            if (sourceItems.length < threshold) break;
            // 当前层是否已存在
            let cur = this.genericTiers.find(g => g.tier === t);
            if (!cur) {
                cur = { tier: t, name: tiers[t], items: [] };
                this.genericTiers.push(cur);
            }
            // 折叠最近 threshold 条源条目
            const batch = sourceItems.slice(0, threshold);
            const list = batch.map(x => (typeof x === 'string' ? x : (x.text || ''))).filter(Boolean).map(s => '- ' + s).join('\n');
            if (!list) break;
            try {
                const prompt = `你是历史学家。以下是同一段长剧情的${batch.length}个${tiers[t - 1]}条目。请把它们合并成一段更高层的${tiers[t]}级总览（250-400字）。记录要求：宁可详细，不可精简；保留关键人物、重要转折、长期伏笔与因果主线；只压缩逐字重复的描述。只输出概括本身，不要编号、不要markdown、不要换行。\n\n${list}`;
                const raw = await llm.callAPI(prompt);
                const clean = String(raw || '').replace(/^[-•\s]+/, '').trim();
                if (clean && clean.length >= 30) {
                    cur.items.push({
                        text: clean,
                        floorStart: batch[0]?.floorStart ?? batch[0]?.floor ?? 0,
                        floorEnd: batch[batch.length - 1]?.floorEnd ?? batch[batch.length - 1]?.floor ?? 0,
                        count: batch.length,
                        timestamp: Date.now(),
                        tier: t
                    });
                    if (cur.items.length > 20) cur.items.shift();
                    // 源条目标记已折叠（避免重复折叠）
                    batch.forEach(x => { if (typeof x === 'object') x.foldedUp = true; });
                    changed = true;
                }
            } catch (e) {
                // 折叠失败静默（下轮再试）
                break;
            }
        }
        return changed;
    }
    // [v3.70] B: 合并任务重试队列（柏宝书 stmbJobs 理念）——折叠失败结构化入队，指数退避重试
    // queue: [{ id, kind: 'volume'|'historical'|'tier', tier, attempts, nextAttemptAt, payload }]
    enqueueRetry(kind, tier, payload, config) {
        this.retryQueue = this.retryQueue || [];
        // 幂等：同 kind 同 tier 只保留一个待重试任务
        const exist = this.retryQueue.find(j => j.kind === kind && j.tier === tier);
        if (exist) { exist.payload = payload; return exist.id; }
        const id = 'rj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        // [v3.107] enqueuedAt：供收件箱视图回答「这个任务等了多久」（新增字段，不改既有消费逻辑）
        this.retryQueue.push({ id, kind, tier, attempts: 0, nextAttemptAt: 0, enqueuedAt: Date.now(), payload });
        if (this.retryQueue.length > 5) this.retryQueue.shift();
        return id;
    }
    /** 尝试消费重试队列（每次摘要折叠周期调用一次；指数退避：30s → 60s → 120s） */
    async processRetryQueue(config, llm) {
        if (!this.retryQueue || !this.retryQueue.length) return 0;
        const now = Date.now();
        const job = this.retryQueue.find(j => now >= j.nextAttemptAt);
        if (!job) return 0;
        if (job.attempts >= 3) {
            this.retryQueue = this.retryQueue.filter(j => j.id !== job.id);
            return 0;
        }
        job.attempts++;
        job.nextAttemptAt = now + 30000 * Math.pow(2, job.attempts - 1);  // 30s/60s/120s
        try {
            if (job.kind === 'volume') {
                const r = await this.maybeFold(config, llm);
                if (r) this.retryQueue = this.retryQueue.filter(j => j.id !== job.id);
            } else if (job.kind === 'historical') {
                const r = await this.maybeFoldHistorical(config, llm);
                if (r) {
                    this.retryQueue = this.retryQueue.filter(j => j.id !== job.id);
                    await this.foldHigherTiers(config, llm);
                }
            } else if (job.kind === 'tier') {
                const r = await this.foldHigherTiers(config, llm);
                if (r) this.retryQueue = this.retryQueue.filter(j => j.id !== job.id);
            }
        } catch (e) { /* 保留任务等待下次 */ }
        return 1;
    }

    // [v3.107] 任务收件箱视图（缝合 bionic memory-inbox 的状态机理念）
    //   既有 retryQueue 用「数组增删」表达任务阶段：一个任务是否已领取、已推迟、已放弃
    //   全靠它在不在数组里推断，出问题时无法回答「它卡在哪一阶段、等了多久」。
    //   本方法把 retryQueue 投影为一个带显式状态的收件箱：把「正在等待退避窗口」的任务
    //   标为 deferred（可见时间 = nextAttemptAt），其余标为 pending，并给出最旧待办等待时长。
    //   纯读视图，不改动 retryQueue 本身（零行为变更）。
    getTaskInbox() {
        try {
            const inboxLib = (typeof window !== 'undefined' ? window.LonShaTaskInbox : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./task-inbox.js'); } catch { return null; } })() : null);
            if (!inboxLib) return [];
            const now = Date.now();
            return (this.summary?.retryQueue || []).map(j => {
                const waiting = Number(j.nextAttemptAt || 0) > now;
                return {
                    itemId: String(j.id || ('rj_' + j.kind + '_' + j.tier)),
                    kind: String(j.kind || 'unknown'),
                    dedupeKey: String(j.kind || '') + '/' + String(j.tier ?? ''),
                    status: waiting ? inboxLib.INBOX_STATUS.DEFERRED : inboxLib.INBOX_STATUS.PENDING,
                    revision: Number(j.attempts || 0),
                    sequence: Number(j.attempts || 0),
                    attempt: Number(j.attempts || 0),
                    availableAt: Number(j.nextAttemptAt || 0),
                    payload: j.payload || {},
                    createdAt: Number(j.enqueuedAt || 0) || now,
                };
            });
        } catch (e) { this._reportError(e, 'getTaskInbox'); return []; }
    }

    /** 收件箱诊断摘要（计数 / 可执行数 / 最旧待办等待时长） */
    getTaskInboxReport() {
        try {
            const inboxLib = (typeof window !== 'undefined' ? window.LonShaTaskInbox : null)
                || (typeof require !== 'undefined' ? (() => { try { return require('./task-inbox.js'); } catch { return null; } })() : null);
            if (!inboxLib || typeof inboxLib.summarizeInbox !== 'function') return null;
            return inboxLib.summarizeInbox(this.getTaskInbox(), { now: Date.now() });
        } catch (e) { this._reportError(e, 'getTaskInboxReport'); return null; }
    }

    // 卷摘要召回（最近 N 卷，低权重）
    // [v3.28] 三级金字塔最高层: 卷摘要（周记）积累超阈值 → 折叠成史记（最高层，跨阶段总览）
    // [v3.29] 修复僵尸链路: 原用 this.folding 防重入——但本方法在 maybeFold 的 try 块内被调（folding=true），
    // 导致永远 return null（史记折叠从不执行）。改用独立 foldingHistorical 标志。
    async maybeFoldHistorical(config, llm) {
        if (this.foldingHistorical) return null;
        const vols = this.volumes;
        const threshold = config?.historicalFoldThreshold || 12;
        if (vols.length < threshold) return null;
        const batch = vols.slice(0, threshold);
        this.foldingHistorical = true;
        try {
            const list = batch.map(v => `[第${v.floorStart}-${v.floorEnd}楼] ${v.text}`).join('\n');
            // [v3.62] 史记详细保留哲学（dsh）：宁可详细不可精简，伏笔与未解决线索全保留，附楼层指针
            const prompt = `你是历史学家。以下是同一段长剧情的${batch.length}个阶段概括（周记）。请把它们合并成一段200-350字的历史总览（史记）。记录要求：宁可详细，不可精简；保留关键人物、重要转折、长期伏笔、已兑现与未兑现的约定、因果主线；保留专名、数字与关键台词；重要事实后附（第N楼）指针；只压缩逐字重复的描述。只输出概括本身，不要编号、不要markdown、不要换行。\n\n${list}`;
            const raw = await llm.callAPI(prompt);
            const clean = String(raw || '').replace(/^[-•\s]+/, '').trim();
            if (clean && clean.length >= 30) {
                this.historical.push({
                    id: 'his_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                    text: clean,
                    floorStart: batch[0]?.floorStart ?? 0,
                    floorEnd: batch[batch.length - 1]?.floorEnd ?? 0,
                    count: batch.length,
                    timestamp: Date.now(),
                    level: 3
                });
                // 已入史记的周记标记归档（不再作为中层单独注入）
                batch.forEach(v => { v.archived = true; });
                // [v3.154] 史记上限显式化（anima #31）：同上，静默 shift 改为可配置 + 显式淘汰日志
                const _hisCap = Math.max(1, Number(config.historicalRetention) || 24);
                while (this.historical.length > _hisCap) {
                    const _hev = this.historical.shift();
                    try { this.opLog?.log?.('summary', 'evict', _hev && _hev.id, _hev && _hev.floorStart, `史记上限(${_hisCap})淘汰`); } catch (e) {}
                    if (config?.debugMode) console.warn(`[${PLUGIN_NAME}] 史记淘汰: 第${_hev && _hev.floorStart}-${_hev && _hev.floorEnd}楼（上限 ${_hisCap}）`);
                }
                if (config?.debugMode) console.log(`[${PLUGIN_NAME}] 史记折叠: ${batch.length}个周记 → 史记#${this.historical.length}`);
                // [v3.70] A4: 折叠链衔接——史记入账后立即检查更高层（书/传奇）是否可折叠
                try { await this.foldHigherTiers(config, llm); } catch (e3) { if (config?.debugMode) console.warn(`[${PLUGIN_NAME}] 高层折叠失败:`, e3); }
                return this.historical[this.historical.length - 1];
            }
        } finally { this.foldingHistorical = false; }
        return null;
    }
    // 活跃周记（未入史记）
    // [v3.149] 卷摘要 intact 判定（柏宝书 #13 缝入，移植 v3.3 rebuildItems 的 leafValid 语义到卷层）:
    //   折叠区下楼层被 swipe/编辑后，卷摘要文本仍嵌着失效叙事却被注入——这是对折叠区完整性的静默违约。
    //   verifyVolumesIntact 对账当前 chat 指纹，任一源指纹失效 → 整卷降级（不再注入）+ 对应源摘要解折叠回活跃池。
    //   活跃摘要是 maybeFold 的天然素材源，回活跃池后由既有阈值逻辑自动重折叠（零新增 LLM 调用，纯机制自愈）。
    verifyVolumesIntact(config = {}) {
        try {
            const vols = this.volumes;
            if (!Array.isArray(vols) || !vols.length) return 0;
            const chat = (typeof window !== 'undefined' && window.SillyTavern?.getContext?.()?.chat) || null;
            if (!chat) return 0;   // 无运行环境（独立测试）：跳过，不误降级
            let degraded = 0;
            for (const v of vols) {
                if (!v || v.degraded || !Array.isArray(v.srcFps) || !v.srcFps.length) continue;
                let broken = false;
                for (const ent of v.srcFps) {
                    const sep = String(ent).indexOf(':');
                    if (sep < 0) continue;
                    const f = Number(String(ent).slice(0, sep));
                    const fp = String(ent).slice(sep + 1);
                    const m = chat[f];
                    const cur = this.fpOf ? this.fpOf(m) : '';
                    if (cur !== fp) { broken = true; break; }
                }
                if (broken) {
                    v.degraded = true;
                    v.degradedAt = Date.now();
                    degraded++;
                    let revived = 0;
                    for (const s of (this.summaries || [])) {
                        if (s && s.folded && s.volumeId === v.id) { s.folded = false; s.volumeId = undefined; revived++; }
                    }
                    // 降级卷未来不再有资格折叠进史记
                    try { v.archived = true; } catch (e) {}
                    try { this.opLog?.log?.('summary', 'degrade', v.id, v.floorStart, `卷摘要失效降级: 展开 ${revived} 条摘要`); } catch (e) {}
                    if (config.debugMode) console.warn(`[LonSha] 卷摘要 intact 判定: 第${v.floorStart}-${v.floorEnd}楼源指纹失效 → 卷降级展开 ${revived} 条`);
                }
            }
            return degraded;
        } catch (e) { this._reportError(e, 'verifyVolumesIntact'); return 0; }
    }
    // [v3.149] 健全卷查询：卷摘要召回/注入/上游折叠一律只消费 intact 卷（降级卷不注入、不入史记）
    getIntactVolumes() {
        return (this.volumes || []).filter(v => v && !v.degraded);
    }
    getActiveVolumes() { return this.getIntactVolumes().filter(v => !v.archived); }
    searchVolumes(limit = 2) { return this.getIntactVolumes().slice(-limit).reverse(); }   // [v3.149] 只召回健全卷（降级卷嵌失效叙事不得注入）
    // [v3.46] 吸收 Bakemono / MemoryWizard: 宏观史记与编年金字塔 (Grand Chronicle)
    addGrandChronicle(text, opts = {}) {
        const clean = String(text || '').replace(/^[-•\s]+/, '').trim();
        if (!clean) return null;
        const entry = {
            id: 'his_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
            text: clean,
            floorStart: Number.isFinite(Number(opts.floorStart)) ? Number(opts.floorStart) : 0,
            floorEnd: Number.isFinite(Number(opts.floorEnd)) ? Number(opts.floorEnd) : 0,
            count: Number.isFinite(Number(opts.count)) ? Number(opts.count) : 1,
            timestamp: Date.now(),
            level: 3,
            source: opts.source || 'manual'
        };
        this.historical.push(entry);
        // [v3.154] 史记上限显式化（anima #31）：与 foldHistorical 同一口径
        const _hisCapM = Math.max(1, Number((this.config && this.config.config && this.config.config.historicalRetention)) || 24);
        while (this.historical.length > _hisCapM) {
            const _hevM = this.historical.shift();
            try { this.opLog?.log?.('summary', 'evict', _hevM && _hevM.id, _hevM && _hevM.floorStart, `史记上限(${_hisCapM})淘汰`); } catch (e) {}
        }
        return entry;
    }
    getGrandChroniclePrompt() {
        if (!this.historical || !this.historical.length) return '';
        const rows = this.historical.map(h => '- ' + h.text);
        return '[宏观世界线·纪元史记]（长程核心脉络与不可变历史大事件）：\n' + rows.join('\n');
    }
    export() { return { summaries: this.summaries, volumes: this.volumes, historical: this.historical, lockedFacts: this.lockedFacts || [], genericTiers: this.genericTiers || [] }; }
    import(data) {
        if (Array.isArray(data)) { this.summaries = data; this.volumes = []; this.historical = []; this.lockedFacts = this.lockedFacts || []; this.genericTiers = this.genericTiers || []; }
        else if (data && typeof data === 'object') {
            this.summaries = Array.isArray(data.summaries) ? data.summaries : [];
            this.volumes = Array.isArray(data.volumes) ? data.volumes : [];
            // [v3.28] 史记层导入对称
            this.historical = Array.isArray(data.historical) ? data.historical : [];
            // [v3.62] 锁定事实导入对称
            this.lockedFacts = Array.isArray(data.lockedFacts) ? data.lockedFacts : [];
            // [v3.70] 金字塔泛化层导入对称
            this.genericTiers = Array.isArray(data.genericTiers) ? data.genericTiers : [];
            // 兼容旧卷摘要数据（无 level/archived）: 自动补默认
            for (const v of this.volumes) { if (v.level === undefined) v.level = 2; if (v.archived === undefined) v.archived = false; }
        }
    }
}
    // ── GameClock（宿主逐字副本，整体去 4 空格缩进）──
class GameClock {
    constructor() {
        this.date = '';             // 绝对日期或架空历法，如 '2026-09-13', '天顺三年春'
        this.label = '';            // 时段/刻度/天气，如 '申时·薄暮·大雪', '清晨'
        this.precision = 'unknown'; // 'day' | 'approximate' | 'unknown'
        this.lastFlashback = null;  // { date, label, floor, recordedAt }
        this.turn = 0;              // 当前所处轮次/楼层
        this.timeTagStats = { total: 0, paired: 0, unparseable: 0, calibrated: 0 };   // [v3.130] 正文时间标签协议健康统计（诊断面板展示）
        this._worldClockRead = null;   // [v3.175] 世界钟读者面读数（读 WorldAxis 桥，只读不掉头）
        this._worldLedgerRead = null;  // [v3.176] 世界账本读者面读数（暗流/事实/人物/舆情/缺口，只读）
    }

    /**
     * [v3.180] 剧情日期解析助手委托（parseStoryDate / calcAge 的真正实现在
     *   RelativeTimeHelper 上）。修前这两条能力**只在相对时间助手里**存在，而
     *   调用方（age-anchor 的 parseFn/calcAge）一律写成 `this.clock?.parseStoryDate?.(...)`
     *   —— 时钟上没有这个方法，Optional Chaining 于是静默返回 undefined：
     *   年龄读数的 estimated 态（唯一会回数字的那一态）在生产路径上永不达成，
     *   且不报错、不进错误日志，只有一片 anchor-only 看不出原因。
     *   委托本身绝不抛：隔离抽取（测试把 GameClock 整段抠进 new Function）时
     *   RelativeTimeHelper 不在作用域，这里要降级成 null/0 而不是连坐。
     */
    parseStoryDate(dateStr) {
        try { return ((typeof _newRelativeTimeHelper === 'function') ? _newRelativeTimeHelper() : new RelativeTimeHelper()).parseStoryDate(dateStr); } catch (e) { errLog(e, 'GameClock.parseStoryDate'); return null; }
    }
    calcAge(birthDateStr, currentStoryDateStr) {
        try { return ((typeof _newRelativeTimeHelper === 'function') ? _newRelativeTimeHelper() : new RelativeTimeHelper()).calcAge(birthDateStr, currentStoryDateStr); } catch (e) { errLog(e, 'GameClock.calcAge'); return 0; }
    }
    // 设置/推进剧情时间
    // opts: { date, label, flashback, floor, relativeDays }
    setTime(opts = {}) {
        const isFlashback = !!opts.flashback;
        const newDate = opts.date ? String(opts.date).trim() : '';
        const newLabel = opts.label ? String(opts.label).trim() : '';
        const floor = Number.isFinite(Number(opts.floor)) ? Math.max(0, Math.round(Number(opts.floor))) : this.turn;

        if (isFlashback) {
            // 回忆时间：严格隔离！绝不修改当前主剧情时钟！
            this.lastFlashback = {
                date: newDate,
                label: newLabel,
                floor,
                recordedAt: Date.now()
            };
            return { updated: false, flashback: true, clock: this.getSnapshot() };
        }

        let changed = false;
        if (newDate && newDate !== this.date) {
            this.date = newDate;
            this.precision = 'day';
            changed = true;
        }
        if (newLabel && newLabel !== this.label) {
            this.label = newLabel;
            if (!this.precision || this.precision === 'unknown') this.precision = 'approximate';
            changed = true;
        }
        if (opts.relativeDays && Number.isInteger(Number(opts.relativeDays))) {
            const days = Number(opts.relativeDays);
            if (this.date) {
                try {
                    const rth = (typeof _newRelativeTimeHelper === 'function') ? _newRelativeTimeHelper() : new RelativeTimeHelper();
                    const parsed = rth.parseStoryDate(this.date);
                    if (parsed && parsed.type === 'standard') {
                        const now = new Date();
                        const y = parsed.year ?? now.getFullYear();
                        const m = parsed.month ?? (now.getMonth() + 1);
                        const d = parsed.day ?? 1;
                        const t = new Date(Date.UTC(y, m - 1, d + days));
                        this.date = `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
                        changed = true;
                    }
                } catch (e) { errLog(e, 'nonfatal') }
            }
        }
        this.turn = floor;
        return { updated: changed, flashback: false, clock: this.getSnapshot() };
    }
    getSnapshot() {
        return {
            date: this.date,
            label: this.label,
            precision: this.precision,
            lastFlashback: this.lastFlashback ? { ...this.lastFlashback } : null,
            turn: this.turn,
            timeTagStats: { ...(this.timeTagStats || { total: 0, paired: 0, unparseable: 0, calibrated: 0 }) },   // [v3.130]
            lastNarrativeAnchor: this.lastNarrativeAnchor ? { ...this.lastNarrativeAnchor } : null,   // [v3.132] 注释回读证据随存档走
            worldClockRead: this._worldClockRead ? { ...this._worldClockRead } : null,   // [v3.175] 世界钟读者面读数（两个钟对不对得上）
            worldLedgerRead: this._worldLedgerRead ? { ...this._worldLedgerRead } : null  // [v3.176] 世界账本读者面读数（含未外供缺口）
        };
    }

    // [v3.94] 缝入 MyriadKnots story-clock 解析核心：从最新正文 HTML 注释回读结构化时钟。
    // 「正文为最高事实源」——若 LLM 按 v3.72 要求在正文首尾写了时间注释，优先用正文
    // 里的实际时间校准当前时钟（而非仅靠事后推断）。纯增量：解析不到完整时钟时不动现状。
    // mesText: 本楼正文；opts.floor: 当前楼层。返回 { synced, clock } 或 { synced:false }。
    syncFromNarrative(mesText, opts = {}) {
        try {
            const parser = window.LonShaStoryClock;
            if (!parser || typeof parser.parseSharedStoryClock !== 'function') return { synced: false, reason: 'parser-unavailable' };
            const found = parser.parseSharedStoryClock(mesText);
            if (!found || found.complete !== true || !found.endMeta) return { synced: false, reason: 'no-complete-clock' };
            // 以「结束时刻」为本楼后的当前时钟（剧情推进到本楼末尾）
            const endDate = String(found.endMeta.date || '').trim();
            const endTime = String(found.endMeta.time || '').trim();
            const weekday = String(found.endMeta.weekday || '').trim();
            if (!endDate) return { synced: false, reason: 'empty-end-date' };
            const floor = Number.isFinite(Number(opts.floor)) ? Math.max(0, Math.round(Number(opts.floor))) : this.turn;
            let changed = false;
            if (endDate !== this.date) { this.date = endDate; this.precision = 'day'; changed = true; }
            const newLabel = [weekday, endTime].filter(Boolean).join(' ');
            if (newLabel && newLabel !== this.label) { this.label = newLabel; changed = true; }
            this.turn = floor;
            // 记录正文时间锚点证据（供审计/调试）
            this.lastNarrativeAnchor = { namespace: found.namespace, start: found.start, end: found.end, floor, at: Date.now() };
            return { synced: changed, clock: this.getSnapshot() };
        } catch (e) { errLog(e, 'GameClock.syncFromNarrative'); return { synced: false, reason: 'error' }; }
    }


    getContextPrompt() {
        const parts = [];
        if (this.date) parts.push(this.date);
        if (this.label) parts.push(this.label);
        if (!parts.length) return '';
        let text = `[当前剧情时间]：${parts.join(' · ')}。回忆不改变当前时钟。`;
        // [v3.72] A: 时间标签生产要求（柏宝书 TIME_TAG_PROMPT 缝入）——时间从事后推断变正文事实
        text += `\n【时间锚点要求(系统强制)】在本次输出正文的最前面和最后面，各放一个时间标签，标明这段剧情的开始时刻与结束时刻：<bbs_start>1988/9/29 21:30</bbs_start>（正文……）<bbs_end>1988/9/29 21:45</bbs_end>。规则：时间要具体可定位，风格与正文世界观一致（现代题材用数字日期时间；古风/奇幻题材用纪年与时辰，但必须保留完整年份或纪年）；禁止"稍后""不久""某天"等无法定位的模糊说法；以上一段的结束时间为基准合理推进（对话约几分钟、用餐约一小时、过夜跨到次日）；若此前没有任何已知时间，请自行设定一个符合世界观的具体起始时刻——这是为记忆系统建立时间锚点所必需的合理设定，不算编造；标签只各出现一次，标签内只有时间。`;
        if (this.lastFlashback && (this.lastFlashback.date || this.lastFlashback.label)) {
            const fb = [this.lastFlashback.date, this.lastFlashback.label].filter(Boolean).join(' · ');
            text += `（前情往事回忆为 ${fb}，非当前时钟）`;
        }
        return text;
    }

    export() { return this.getSnapshot(); }
    /**
     * [v3.175] 世界钟读者面：读 WorldAxis 的只读世界桥，取它的世界钟并与本插件时钟对账。
     * 纯读、不抛、不猜——桥未装/未启用/无快照一律如实报 reason（与 RubyPhone v2.35 同规格的 reader 口径）。
     * **本方法不写 this.date**：本插件的既有主张是「正文为最高事实源」（v3.72 标签协议 / v3.94 注释回读 /
     * v3.130 标签闭环），世界钟是**推演**而非正文事实。故这里只交付读数与对账，覆盖与否由调用方决定。
     * @param {object} reader 可注入 reader（测试用）；不传即取 window.LonShaWorldClockReader
     */
    readWorldAxisClock(reader, opts = {}) {
        try {
            const R = reader || (typeof window !== 'undefined' ? window.LonShaWorldClockReader : null);
            if (!R || typeof R.readWorldAxisSnapshot !== 'function') {
                this._worldClockRead = { ok: false, reason: 'reader-unavailable', describe: '', worldClock: null, diff: null, at: Date.now() };
                return this._worldClockRead;
            }
            const read = R.readWorldAxisSnapshot({ reason: opts.reason || 'lonsha-clock', win: opts.win });
            const wc = (read && read.ok && typeof R.readWorldClock === 'function') ? R.readWorldClock(read.snapshot) : null;
            const diff = (wc && typeof R.diffClocks === 'function') ? R.diffClocks(wc.date, this.date) : null;
            this._worldClockRead = {
                ok: !!(read && read.ok),
                reason: (read && read.reason) || 'unknown',
                describe: (typeof R.describeRead === 'function') ? R.describeRead(read) : '',
                worldClock: wc || null,
                diff: diff || null,
                at: Date.now()
            };
            return this._worldClockRead;
        } catch (e) {
            this._worldClockRead = { ok: false, reason: 'thrown', describe: '', worldClock: null, diff: null, at: Date.now() };
            errLog(e, 'GameClock.readWorldAxisClock');
            return this._worldClockRead;
        }
    }
    /** [v3.175] 世界钟对账的一句话读数（供诊断面/报告；纯读，未读返回 null） */
    worldClockLine() {
        const r = this._worldClockRead;
        if (!r) return null;
        if (!r.ok) return '不可用（' + r.reason + '）' + (r.describe ? ' · ' + r.describe : '');
        const wc = r.worldClock;
        if (!wc) return '桥就绪但快照无世界钟';
        const d = r.diff || { verdict: 'unparsable' };
        const VT = {
            same: '与本插件时钟同日',
            'world-ahead': '世界钟在前 ' + Math.abs(Number(d.days) || 0) + ' 天',
            'world-behind': '世界钟在后 ' + Math.abs(Number(d.days) || 0) + ' 天',
            'incompatible-era': '历法不相容（本插件侧 ' + (d.storyEra || 'unknown') + '）',
            unparsable: '无可比日期'
        };
        return wc.date + ' · ' + (wc.time || '') + ' · ' + (VT[d.verdict] || d.verdict);
    }
    /**
     * [v3.176] 世界账本读者面：读 WorldAxis 世界桥的**全部**账本节并与本插件账本对读。
     *
     * v3.175 只读了 `worldClock` 一个字段——而推演侧外供十二条面（暗流/涟漪/权威事实/
     * 人物位置/舆情三分/counts/filter）。本方法补齐，重点在三件事：
     *   ① **不可观测缺口**（gap）：推演侧默认只外供显式 public 标记的暗流，其余落进
     *      `filter.notMarked[]`。此前本插件连「有多少东西没给我」都读不到——它见到的是一个
     *      「恰好只有这些」的世界。这里把缺口变成有数、有名、有因的读数。
     *   ② **人物位置对读**（peopleDiff）：拿本插件角色表的位置字段与推演侧 people[] 逐一对读。
     *      时钟差几天只是数字；位置对不上是剧情立刻会崩的地方。
     *   ③ **事实强度三分**（opinion）：canon/forum/sandbox 三档 + 每条 claim_status。
     *      「已核实」与「纯传闻」在能否当事实引用上完全相反，绝不混成一锅。
     *
     * 纯读、不抛、不猜（与 v3.175 世界钟读者面同规格）。**不写本插件任何账本**：
     * 本插件是记账的那一个，推演侧是推演的那一个，双方只交付读数与对账。
     * @param {object} reader 可注入 reader（测试用）；不传即取 window.LonShaWorldLedgerReader
     * @param {{reason?:string, win?:object, localPeople?:object, localFacts?:string[]}} opts
     *        localPeople / localFacts —— **本插件侧账本的投影**，由宿主（插件本体）收集后传入。
     *        为什么不由本方法自己去取：本方法挂在 GameClock 上，`this` 是时钟不是插件，
     *        时钟上没有 status/outline/worldProg——在那上面取本地账本只会静默取到 undefined，
     *        于是对读**永远返回空**，且不报错（本项目最忌讳的静默降级形态）。
     */
    readWorldLedger(reader, opts = {}) {
        try {
            const R = reader || (typeof window !== 'undefined' ? window.LonShaWorldLedgerReader : null);
            if (!R || typeof R.readLedger !== 'function') {
                this._worldLedgerRead = { ok: false, reason: 'reader-unavailable', describe: '', shape: null, gap: null, opinion: null, peopleDiff: null, factsDiff: null, counts: null, at: Date.now() };
                return this._worldLedgerRead;
            }
            const led = R.readLedger({ reason: opts.reason || 'lonsha-ledger', win: opts.win });
            // 人物位置对读：宿主给的 { 角色名: 位置 } 映射，交 reader 归一化比对。
            let peopleDiff = null;
            try {
                if (led && led.ok && typeof R.diffPeople === 'function') {
                    peopleDiff = R.diffPeople(led.snapshot, opts.localPeople || {});
                }
            } catch (_e1) { peopleDiff = null; }
            // 权威事实对读：宿主给的事实键集（大纲/世界推进条目名）。
            let factsDiff = null;
            try {
                if (led && led.ok && typeof R.diffFacts === 'function') {
                    factsDiff = R.diffFacts(led.snapshot, opts.localFacts || []);
                }
            } catch (_e2) { factsDiff = null; }
            this._worldLedgerRead = {
                ok: !!(led && led.ok),
                reason: (led && led.reason) || 'unknown',
                describe: (typeof R.describeLedger === 'function') ? R.describeLedger(led) : '',
                shape: (led && led.shape) || null,
                gap: (led && led.gap) || null,
                opinion: (led && led.opinion) || null,
                counts: (led && led.counts) || null,
                peopleDiff, factsDiff,
                at: Date.now()
            };
            return this._worldLedgerRead;
        } catch (e) {
            this._worldLedgerRead = { ok: false, reason: 'thrown', describe: '', shape: null, gap: null, opinion: null, peopleDiff: null, factsDiff: null, counts: null, at: Date.now() };
            errLog(e, 'GameClock.readWorldLedger');
            return this._worldLedgerRead;
        }
    }
    /** [v3.176] 世界账本对读的一句话读数（供诊断面/报告；纯读，未读返回 null） */
    worldLedgerLine() {
        const r = this._worldLedgerRead;
        if (!r) return null;
        if (!r.ok) return '不可用（' + r.reason + '）' + (r.describe ? ' · ' + r.describe : '');
        const c = r.counts || {};
        const parts = ['暗流 ' + (Number(c.currents) || 0), '事实 ' + (Number(c.facts) || 0),
            '人物 ' + (Number(c.people) || 0), '舆情 ' + ((Number(c.opinionCanon) || 0) + (Number(c.opinionForum) || 0))];
        let line = parts.join(' / ');
        const gap = r.gap || {};
        if (gap.verdict === 'gapped') line += '｜**未外供 ' + (Number(gap.notMarkedCount) || 0) + ' 条**';
        else if (gap.verdict === 'no-filter') line += '｜缺口不可知';
        const pd = r.peopleDiff || {};
        if (pd.mismatched && pd.mismatched.length) line += '｜位置冲突 ' + pd.mismatched.length;
        return line;
    }
    import(data) {
        if (!data || typeof data !== 'object') return;
        this.date = String(data.date || '').trim();
        this.label = String(data.label || '').trim();
        this.precision = String(data.precision || 'unknown');
        this.lastFlashback = data.lastFlashback && typeof data.lastFlashback === 'object' ? { ...data.lastFlashback } : null;
        this.turn = Number.isFinite(Number(data.turn)) ? Math.max(0, Math.round(Number(data.turn))) : 0;
        if (data.timeTagStats && typeof data.timeTagStats === 'object') {   // [v3.130] 协议健康统计随存档恢复
            const s = data.timeTagStats;
            this.timeTagStats = {
                total: Number(s.total) || 0, paired: Number(s.paired) || 0,
                unparseable: Number(s.unparseable) || 0, calibrated: Number(s.calibrated) || 0
            };
        }
        if (data.lastNarrativeAnchor && typeof data.lastNarrativeAnchor === 'object') {   // [v3.132]
            this.lastNarrativeAnchor = { ...data.lastNarrativeAnchor };
        }
        if (data.worldClockRead && typeof data.worldClockRead === 'object') {   // [v3.175] 世界钟对账读数随存档恢复
            this._worldClockRead = { ...data.worldClockRead };
        }
        // [v3.176] 世界账本对读读数随存档恢复：**不只是「重建后还能看」**——
        //   缺口（未外供 N 条暗流）与人物位置冲突是**本轮现场证据**，若不落存档，
        //   重开对话后生产者重建，诊断面会把「上一轮发现过缺口」报成「未读」，
        //   读者再也分不清「从没缺过」与「缺口读不到了」。这与 v3.175 世界钟读数同规格。
        if (data.worldLedgerRead && typeof data.worldLedgerRead === 'object') {   // [v3.176]
            this._worldLedgerRead = { ...data.worldLedgerRead };
        }
    }
}
    // ── CharacterState（宿主逐字副本，整体去 4 空格缩进）──
class CharacterState {
    constructor() {
        this.characters = {};   // { 角色名: { fields: {...}, todos: [...], updatedAt, floor } } (派生缓存)
        this.ops = [];
        this.MAX_OPS = 500;
        this.MAX_FIELDS = 24;
        this.MAX_TODOS = 12;

        // [v3.42] 吸收 caikis: 人设基线与短期人设偏移 (Baseline vs Drift)
        this.baselines = {};    // { [name]: { traits: [], speechStyle: '', coreBelief: '', lockedAtFloor, updatedAt } }
        this.drifts = {};       // { [name]: { mood: '', reinforced: '', weakened: '', behaviorChange: '', floor: 0, updatedAt } }
        // [v3.42] 吸收 caikis: NPC 晋升机制 (Promotion Pipeline)
        this.transientNpcs = {};// 轻量路人 { [name]: { identity, firstSeenFloor, lastSeenFloor, meetCount } }
        this.trackedNpcs = new Set(); // 晋升为常驻深度追踪的角色
        // [v3.42] 吸收 caikis: 三级地理空间感知 (3-Tier Geo Context)
        this.geoContext = { majorArea: '', minorArea: '', detailLocation: '', floor: 0, updatedAt: 0 };
        // [v3.45] 吸收 baibai: NPC 长期人伦社会羁绊网 (Long-term NPC Ties)
        this.npcTies = {}; // { [name]: string[] }
        // [v3.45] 吸收 baibai: 主角客观状态 (Protagonist State) 与 生活细节癖好 (Life Details)
        this.protagonist = { gender: '', age: '', identity: '', appearance: '', outfit: '', condition: '', floor: 0, updatedAt: 0 };
        this.lifeDetails = []; // [ { id, text, topics: [], tier: 'active', floor, createdAt } ]
    }

    // ===== [v3.42] 吸收 caikis: 人设基线 (Baseline) vs 人设偏移 (Drift) =====
    setBaseline(name, b = {}) {
        if (!name) return null;
        this.baselines[name] = {
            traits: Array.isArray(b.traits) ? b.traits : (b.traits ? [b.traits] : []),
            speechStyle: b.speechStyle || '',
            coreBelief: b.coreBelief || '',
            lockedAtFloor: Number(b.floor) || 0,
            updatedAt: Date.now()
        };
        return this.baselines[name];
    }
    recordDrift(name, d = {}) {
        if (!name) return null;
        this.drifts[name] = {
            mood: d.mood || '',
            reinforced: d.reinforced || '',
            weakened: d.weakened || '',
            behaviorChange: d.behaviorChange || '',
            floor: Number(d.floor) || 0,
            updatedAt: Date.now()
        };
        return this.drifts[name];
    }
    getEffectivePersona(name, currentFloor = 0) {
        const base = this.baselines[name];
        const drift = this.drifts[name];
        if (!base && !drift) return { name, hasDrift: false, description: '' };
        const f = Number(currentFloor) || 0;
        // 超过 15 楼无新刺激，性格偏移衰减收敛
        const driftAge = drift ? Math.max(0, f - (drift.floor || 0)) : 999;
        const hasActiveDrift = !!(drift && driftAge <= 15);

        const parts = [];
        if (base) {
            if (base.traits.length) parts.push(`核心性格：${base.traits.join('、')}`);
            if (base.speechStyle) parts.push(`用语习惯：${base.speechStyle}`);
            if (base.coreBelief) parts.push(`基线定海神针：${base.coreBelief}`);
        }
        if (hasActiveDrift) {
            parts.push(`【近期人设偏移·第${drift.floor}楼受刺激】`);
            if (drift.mood) parts.push(`当前心境：${drift.mood}`);
            if (drift.reinforced) parts.push(`被强化侧面：${drift.reinforced}`);
            if (drift.weakened) parts.push(`被弱化：${drift.weakened}`);
            if (drift.behaviorChange) parts.push(`行为模式变化：${drift.behaviorChange}`);
        }
        return {
            name,
            hasDrift: hasActiveDrift,
            baseline: base,
            drift: hasActiveDrift ? drift : null,
            description: parts.join('；')
        };
    }

    // ===== [v3.42] 吸收 caikis: NPC 晋升机制 (Promotion Pipeline) =====
    registerTransientNpc(name, info = {}) {
        if (!name || this.trackedNpcs.has(name)) return;
        if (!this.transientNpcs[name]) {
            this.transientNpcs[name] = {
                name,
                identity: info.identity || '路人',
                firstSeenFloor: Number(info.floor) || 0,
                lastSeenFloor: Number(info.floor) || 0,
                meetCount: 1
            };
        } else {
            const rec = this.transientNpcs[name];
            rec.lastSeenFloor = Number(info.floor) || rec.lastSeenFloor;
            rec.meetCount = (rec.meetCount || 1) + 1;
            if (info.identity) rec.identity = info.identity;
        }
        return this.transientNpcs[name];
    }
    promoteNpc(name) {
        if (!name) return false;
        this.trackedNpcs.add(name);
        delete this.transientNpcs[name];
        return true;
    }
    isNpcTracked(name) {
        return this.trackedNpcs.has(name);
    }

    // ===== [v3.42] 吸收 caikis: 三级地理空间感知 (3-Tier Geo Context) =====
    setGeoLocation(geo = {}) {
        this.geoContext = {
            majorArea: geo.majorArea || '',
            minorArea: geo.minorArea || '',
            detailLocation: geo.detailLocation || '',
            floor: Number(geo.floor) || 0,
            updatedAt: Date.now()
        };
        return this.geoContext;
    }
    getGeoLocation() {
        return this.geoContext;
    }
    getGeoPrompt() {
        const g = this.geoContext;
        if (!g || (!g.majorArea && !g.minorArea && !g.detailLocation)) return '';
        return `〔当前地理位置〕主要地区: ${g.majorArea || '未知'} | 次要地区: ${g.minorArea || '未知'} | 详细地点: ${g.detailLocation || '未知'}`;
    }

    // ===== [v3.45] 吸收 baibai: NPC 长期社会人伦羁绊 (NPC Ties) =====
    addNpcTie(name, tie) {
        if (!name || !tie) return null;
        const normName = String(name).trim();
        if (!normName) return null;
        this.npcTies[normName] = this.npcTies[normName] || [];
        const parts = String(tie).split(/[；;]/).map(s => s.trim()).filter(Boolean);
        for (const p of parts) {
            if (!this.npcTies[normName].includes(p)) {
                this.npcTies[normName].push(p);
            }
        }
        return this.npcTies[normName];
    }
    setNpcTies(name, ties) {
        if (!name) return null;
        const normName = String(name).trim();
        const list = Array.isArray(ties) ? ties : String(ties || '').split(/[；;]/);
        this.npcTies[normName] = [];
        for (const t of list) {
            const s = String(t || '').trim();
            if (s && !this.npcTies[normName].includes(s)) {
                this.npcTies[normName].push(s);
            }
        }
        return this.npcTies[normName];
    }
    getNpcTies(name) {
        return this.npcTies[String(name || '').trim()] || [];
    }
    getAllNpcTies() {
        return { ...this.npcTies };
    }
    getNpcTiesRecords() {
        return Object.entries(this.npcTies).map(([name, ties]) => ({ name, ties: [...ties] }));
    }

    // ===== [v3.45] 吸收 baibai: 主角客观档案 (Protagonist) =====
    // [v3.148] age 锚点机制（baibai age-anchor）：AI 提取时只填 age 数值（或出生日期），
    // 系统同时盖 ageAnchorTime = 提取当时的剧情日期锚点；展示时按「锚点→当前」推算，
    // 时间跳跃自动长岁，AI 永不算错年龄。
    setProtagonist(patch = {}, floor = 0, storyDateStr = '') {
        if (!patch || typeof patch !== 'object') return this.protagonist;
        // [v3.180] 锚点守恒（age-anchor.carryAge）：**年龄没变就连旧锚点一起带走**。
        //   修前只要本轮又给了 age（哪怕值与上次一字不差、哪怕只是编辑触发的重提取）就无条件把
        //   锚点刷成「本次的故事时间」——两年前那次提取的年龄于是被钉到今天的锚点上，时间再跳也不长岁。
        const A = this._ageAnchor();
        const _carry = (A && typeof A.carryAge === 'function' && patch.age !== undefined)
            ? A.carryAge(patch, this.protagonist) : null;
        for (const key of ['gender', 'age', 'identity', 'appearance', 'outfit', 'condition']) {
            if (patch[key] !== undefined) {
                this.protagonist[key] = String(patch[key] ?? '').trim();
            }
        }
        // age 锚点：仅当本轮显式提供了 age 且有剧情日期时盖章
        //   （_carry.isNewAge === false 即「年龄与旧值相同」：锚点保持原值，不刷新）
        if (patch.age !== undefined && String(patch.age ?? '').trim() && storyDateStr && !(_carry && _carry.isNewAge === false)) {
            this.protagonist.ageAnchorTime = String(storyDateStr);
            this.protagonist.ageAnchorFloor = Number(floor) || 0;
        }
        // 显式清空年龄 ⇒ 年龄与锚点**成对清掉**（修前只清 age、留下孤儿锚点 = age-anchor I2 致命形态）
        if (patch.age !== undefined && !String(patch.age ?? '').trim() && A && typeof A.stampAge === 'function') {
            A.stampAge(this.protagonist, null, '');
        }
        this.protagonist.floor = Number(floor) || this.protagonist.floor || 0;
        this.protagonist.updatedAt = Date.now();
        return this.protagonist;
    }
    /** [v3.148] 锚点推算年龄：有锚点且时钟可解析时按差值推算，否则回退 AI 填的静态值。
     *  两种口径：① age 字段是出生日期 → calcAge(生日, 当前)；② age 是数字 → 锚点年龄 + 年份差。 */
    getEffectiveAge(currentStoryDateStr = '') {
        const p = this.protagonist;
        if (!p) return '';
        // [v3.180] 优先走 age-anchor 三态读数：**只有 estimated 才交数字**。
        //   anchor-only（时间倒流 / 日期解析不出 / 算不出）不给数字——修前这里一律回落 `p.age`
        //   静态原值，与「原值即准」同形，于是「算不出」被伪装成「原值本来就是准的」。
        //   调用方要文本时走 ageReadingPrompt（带锚点括注），要数字（如注入模板）时走本方法。
        const A = this._ageAnchor();
        if (A && typeof A.ageDisplay === 'function') {
            try {
                const _ch = (typeof this._clockHelpers === 'function') ? this._clockHelpers() : null;
                const d = A.ageDisplay(p.age, p.ageAnchorTime, currentStoryDateStr, {
                    calcAge: _ch ? _ch.calcAge : (a, b) => this.clock?.calcAge?.(a, b),
                    parseFn: _ch ? _ch.parseStoryDate : (s) => this.clock?.parseStoryDate?.(s)
                });
                if (d && d.state === 'estimated' && d.age) return String(d.age);
                if (d && d.state === 'exact') return String(d.text || '');
                return '';
            } catch (e) { errLog(e, 'CharacterState.getEffectiveAge.anchor'); }
        }
        try {
            if (p.ageAnchorTime && currentStoryDateStr && this.clock) {
                // ① age 形如日期（含年份数字串长 ≥3 或含 / - . 分隔）→ 按出生日期推算
                const ageStr = String(p.age || '');
                if (/\d{3,}/.test(ageStr) || /[\/\-\.年]/.test(ageStr)) {
                    const calc = this.clock.calcAge?.(ageStr, currentStoryDateStr);
                    if (calc > 0 && calc < 150) return String(calc);
                } else {
                    // ② 数字年龄：锚点年龄 + 锚点年→当前年的年份差
                    const n = Number(ageStr);
                    const anchor = this.clock.parseStoryDate?.(p.ageAnchorTime);
                    const now = this.clock.parseStoryDate?.(currentStoryDateStr);
                    if (Number.isFinite(n) && anchor?.year && now?.year) {
                        const eff = n + (now.year - anchor.year);
                        if (eff > 0 && eff < 150) return String(eff);
                    }
                }
            }
        } catch (e) { /* 回退静态值 */ }
        return p.age || '';
    }
    /**
     * [v3.180] age-anchor.js 取库口。与 _moduleLib 同契约：传**真读表达式**、**不缓存**
     * （extra_js 后于入口脚本加载，构造期缓存会永久取到 null）。
     * 主角与 NPC 共用同一对字段名（age / ageAnchorTime），锚点盖章/守恒/展示全部走该模块。
     */
    /**
     * [v3.180] 时钟助手取用口（与 _ageAnchor 同契约：**不抛**、不缓存、取不到返回 null）。
     *   优先用调用方/引擎注入的 this.clock（行为不变），缺失时自建一份
     *   RelativeTimeHelper —— 否则 age-anchor 的 parseFn 恒返回 undefined，
     *   年龄三态里的 estimated 永不达成（修前实测就是这一形态）。
     *   CharacterState 的隔离副本里两个符号都不在作用域 ⇒ 返回 null，
     *   调用方各自回落到原表达式（老行为）。
     */
    _clockHelpers() {
        try {
            if (this.clock && typeof this.clock.parseStoryDate === 'function' && typeof this.clock.calcAge === 'function') {
                return { parseStoryDate: (s) => this.clock.parseStoryDate(s), calcAge: (a, b) => this.clock.calcAge(a, b) };
            }
        } catch (e) { /* 注入的时钟不可用 ⇒ 走自建 */ }
        try {
            // [v3.259.0] A1 第四刀：RelativeTimeHelper 已外移到 memory-books.js，不再是本文件
            //   作用域里的类声明。这里按 _ageAnchor 同一条契约回落（闭包取库口 → 全局符号），
            //   两层都取不到时返回 null（与抽取前的 `typeof 类名 === 'function'` 同一结局）。
            const _MB = (typeof _memoryBooksLib === 'function') ? _memoryBooksLib() : null;
            const _RTH = (_MB && typeof _MB.RelativeTimeHelper === 'function')
                ? _MB.RelativeTimeHelper
                : ((typeof window !== 'undefined' && window.LonShaMemoryBooks?.RelativeTimeHelper) || null);
            const rth = _RTH ? new _RTH() : null;
            if (rth && typeof rth.parseStoryDate === 'function' && typeof rth.calcAge === 'function') {
                return { parseStoryDate: (s) => rth.parseStoryDate(s), calcAge: (a, b) => rth.calcAge(a, b) };
            }
        } catch (e) { /* 隔离环境：类与取库口都不在作用域 ⇒ 返回 null */ }
        return null;
    }
    _ageAnchor() {
        // [v3.180] 隔离安全：本方法可能运行在**被抽离的类副本**里（测试把 CharacterState 整段
        //   抠进 new Function 求值，IIFE 闭包里的 _moduleLib 不在其作用域），故闭包取库口只作
        //   首选路径，取不到时按同一契约自包含回落（真读表达式 → 全局符号 → require），
        //   绝不因缺闭包而抛 —— 年龄读数不该让整条管线连坐。
        try {
            if (typeof _moduleLib === 'function') return _moduleLib(() => window.LonShaAgeAnchor, 'age-anchor.js');
        } catch (e) { /* 隔离环境：闭包不在作用域，走回落 */ }
        try {
            const viaGlobal = (typeof window !== 'undefined') ? window.LonShaAgeAnchor : null;
            if (viaGlobal) return viaGlobal;
        } catch (e) { /* 忽略：全局不可读按未取到处理 */ }
        try {
            if (typeof require !== 'undefined') return require('./age-anchor.js');
        } catch (e) { /* 忽略：require 不可用 / 文件缺失 */ }
        return null;
    }
    getProtagonist() {
        return { ...this.protagonist };
    }
    getProtagonistPrompt(currentStoryDateStr = '') {
        const p = this.protagonist;
        if (!p) return '';
        const parts = [];
        if (p.gender) parts.push(`[性别:${p.gender}]`);
        // [v3.148] 优先锚点推算（时间跳跃自动长岁），无锚点回退静态值
        // [v3.180] 改为三态文本读数：exact=原值 / estimated=约X岁(锚点时Y岁) / anchor-only=原文(锚点时)。
        //   注入面是 AI 唯一能看到的年龄，把「算不出」也写成数字会让 AI 把一个猜值当事实用。
        const _ageText = this.ageReadingPrompt(currentStoryDateStr) || this.getEffectiveAge(currentStoryDateStr);
        if (_ageText) parts.push(`年龄:${_ageText}`);
        if (p.identity) parts.push(`身份:${p.identity}`);
        if (p.appearance) parts.push(`体貌:${p.appearance}`);
        if (p.outfit) parts.push(`当前着装:${p.outfit}`);
        if (p.condition) parts.push(`生理/伤病状况:${p.condition}`);
        return parts.length ? parts.join(' | ') : '';
    }

    // ===== [v3.45] 吸收 baibai: 主角生活习惯与癖好档案 (Life Details) =====
    _normalizeDetailText(text) {
        return String(text || '').trim().toLowerCase().replace(/[，。！？!?、；;：:\s]+$/u, '');
    }
    addLifeDetail(detail, floor = 0) {
        const rawText = typeof detail === 'string' ? detail : (detail?.text || '');
        const cleanText = String(rawText || '').trim();
        if (!cleanText || cleanText.length < 2) return null;

        const norm = this._normalizeDetailText(cleanText);
        const topics = Array.isArray(detail?.topics) ? detail.topics.map(t => String(t).trim()).filter(Boolean) : [];
        // [v3.78] C: anchors（原文可检索关键词）+ until（时效到期）——柏宝书 lifeDetails 三投放层选择的数据基础
        const anchors = Array.isArray(detail?.anchors) ? detail.anchors.map(a => String(a).trim()).filter(Boolean).slice(0, 8) : [];
        const until = String(detail?.until || '').trim();
        const tier = ['pinned', 'active', 'archive'].includes(detail?.tier) ? detail.tier : 'active';

        let existing = this.lifeDetails.find(d => this._normalizeDetailText(d.text) === norm);
        if (existing) {
            existing.text = cleanText;
            existing.tier = tier;
            if (topics.length) existing.topics = Array.from(new Set([...(existing.topics || []), ...topics]));
            if (anchors.length) existing.anchors = Array.from(new Set([...(existing.anchors || []), ...anchors]));
            if (until) existing.until = until;
            existing.floor = Number(floor) || existing.floor || 0;
            return existing;
        }

        const item = {
            id: `life_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            text: cleanText,
            topics,
            anchors,
            until,
            tier,
            floor: Number(floor) || 0,
            createdAt: Date.now()
        };
        this.lifeDetails.push(item);
        if (this.lifeDetails.length > 30) this.lifeDetails.shift();
        return item;
    }
    removeLifeDetail(idOrText) {
        if (!idOrText) return false;
        const norm = this._normalizeDetailText(idOrText);
        const idx = this.lifeDetails.findIndex(d => d.id === idOrText || this._normalizeDetailText(d.text) === norm);
        if (idx !== -1) {
            this.lifeDetails.splice(idx, 1);
            return true;
        }
        return false;
    }
    // [v3.82] A: 删楼联动——清除该楼层来源的生活小档案（防幽灵偏好残留）
    removeLifeDetailByFloor(floor) {
        const f = Number(floor);
        if (!Number.isFinite(f)) return 0;
        const before = this.lifeDetails.length;
        this.lifeDetails = this.lifeDetails.filter(d => Number(d.floor) !== f);
        return before - this.lifeDetails.length;
    }
    // [v3.82] B: 楼层位移联动——删楼前移后生活小档案的 floor 指针跟随
    shiftLifeDetailFloors(deleted) {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        let n = 0;
        for (const d of this.lifeDetails) {
            const f = Number(d.floor);
            if (Number.isFinite(f) && f > del) { d.floor = f - 1; n++; }
        }
        return n;
    }
    // [v3.83] A: 主角档案楼层指针回滚——来源楼层被删时指针失效归零（防幽灵楼层；内容为合并态不回滚，仅处理指针）
    removeProtagonistByFloor(floor) {
        const f = Number(floor);
        if (!Number.isFinite(f) || f <= 0) return 0;
        if (this.protagonist && Number(this.protagonist.floor) === f) {
            this.protagonist.floor = 0;
            return 1;
        }
        return 0;
    }
    // [v3.83] B: 主角档案楼层指针位移——删楼前移后 floor 指针跟随
    shiftProtagonistFloor(deleted) {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        const f = Number(this.protagonist?.floor);
        if (Number.isFinite(f) && f > del) { this.protagonist.floor = f - 1; return 1; }
        return 0;
    }
    // [v3.84] B: 人设偏移楼层位移——删楼前移后 drift.floor 指针跟随（15 楼衰减窗口不错位）
    shiftDriftFloors(deleted) {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        let n = 0;
        for (const name of Object.keys(this.drifts || {})) {
            const d = this.drifts[name];
            if (d && typeof d.floor === 'number' && d.floor > del) { d.floor = d.floor - 1; n++; }
        }
        return n;
    }
    // [v3.84] B: 人设偏移楼层回滚——来源楼被删时偏移清空（防幽灵偏移；基线不受影响）
    removeDriftByFloor(floor) {
        const f = Number(floor);
        if (!Number.isFinite(f)) return 0;
        let n = 0;
        for (const name of Object.keys(this.drifts || {})) {
            const d = this.drifts[name];
            if (d && Number(d.floor) === f) { delete this.drifts[name]; n++; }
        }
        return n;
    }
    // [v3.84] C: 人设基线锁定楼层位移（lockedAtFloor 指针跟随）
    shiftBaselineFloors(deleted) {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        let n = 0;
        for (const name of Object.keys(this.baselines || {})) {
            const b = this.baselines[name];
            if (b && typeof b.lockedAtFloor === 'number' && b.lockedAtFloor > del) { b.lockedAtFloor = b.lockedAtFloor - 1; n++; }
        }
        return n;
    }
    // [v3.84] C: 地理上下文楼层位移（geoContext.floor 指针跟随）
    shiftGeoFloor(deleted) {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        const g = this.geoContext;
        if (g && typeof g.floor === 'number' && g.floor > del) { g.floor = g.floor - 1; return 1; }
        return 0;
    }
    getLifeDetailsPrompt(limit = 5, contextText = null, nowTime = null) {
        // [v3.78] B: 三投放层选择算法（柏宝书 selectLifeDetailsForInjection 缝入）
        //   pinned:手动置顶,常驻(≤limit); active:时效层,未过期且与近期上下文相关才注入,
        //   无关键词的长期 active 兜底注入; archive:沉降层,仅 anchors/topics 命中才浮出。
        //   记住 ≠ 每回合必提——只在注入选择层做裁剪,绝不删改真源条目。
        try {
            const PIN_CAP = Math.max(1, limit);
            const TOTAL_CAP = Math.max(2, limit + 1);
            // 上下文文本：未传时从聊天最近几条自动取（指代/关键词命中用）
            let ctx = contextText;
            if (ctx === null) {
                try {
                    const msgs = window.SillyTavern?.getContext?.()?.chat?.slice(-4) || [];
                    ctx = msgs.map(m => m?.mes || '').join(' ');
                } catch (e) { ctx = ''; }
            }
            ctx = String(ctx || '');
            // 当前故事时间：未传时从引擎 clock 取（时效过期判断用）
            let now = nowTime;
            if (now === null) {
                try { now = window.LonShaMemory?.engine?.clock?.date || ''; } catch (e) { now = ''; }
            }
            now = String(now || '');
            // 时效过期判断（复用全局 parseStoryDateLoose + storyDayDiff 式天数差；解析不出宁可不判）
            const isExpired = (d) => {
                if (!d?.until || !now) return false;
                try {
                    const h = _newRelativeTimeHelper();
                    const a = h.parseStoryDate(d.until), b = h.parseStoryDate(now);
                    if (!a || !b || a.type !== 'standard' || b.type !== 'standard') return false;
                    const da = new Date(a.year ?? 2000, (a.month ?? 1) - 1, a.day ?? 1);
                    const db = new Date(b.year ?? 2000, (b.month ?? 1) - 1, b.day ?? 1);
                    const gap = Math.round((da - db) / 86400000);
                    return gap < 0;   // until 早于 now → 已过期
                } catch (e) { return false; }
            };
            const list = Array.isArray(this.lifeDetails) ? this.lifeDetails : [];
            const pinned = list.filter(d => d.tier === 'pinned').slice(0, PIN_CAP);
            const picked = [];
            for (const d of list) {
                if (d.tier === 'pinned') continue;
                if (pinned.length + picked.length >= TOTAL_CAP) break;
                // active 过期不注入（数据保留，可手动沉降/删除）
                if (d.tier === 'active' && isExpired(d)) continue;
                const keys = [...(d.anchors || []), ...(d.topics || [])].map(s => String(s).trim()).filter(Boolean);
                // 命中判定：有关键词+有上下文→需命中；有关键词但无上下文→active 兜底（无依据时宁可不裁）；
                // 无关键词→仅 active 兜底注入（archive 无关键词不浮出）
                const hit = keys.length
                    ? (ctx ? keys.some(k => ctx.includes(k)) : d.tier === 'active')
                    : d.tier === 'active';
                if (hit) picked.push(d);
            }
            return [...pinned, ...picked].map(d => `- ${d.text}${d.topics?.length ? ` [${d.topics.join('/')}]` : ''}`);
        } catch (e) {
            // 兜底：旧行为（不因选择算法失败丢注入）
            const active = this.lifeDetails.filter(d => d.tier !== 'archive').slice(-limit);
            return active.map(d => `- ${d.text}${d.topics?.length ? ` [${d.topics.join('/')}]` : ''}`);
        }
    }
    // [v2.3] ops 记录 (同楼覆盖式: 重复提取同楼时后写覆盖前写, 重放幂等)
    _logOp(floor, kind, items) {
        try {
            if (!items || !items.length) return;
            let op = this.ops.find(o => o.floor === floor);
            if (!op) {
                op = { floor, changes: [], todos: [] };
                this.ops.push(op);
                if (this.ops.length > this.MAX_OPS) this.ops.shift();
            }
            if (kind === 'changes') op.changes = items;
            if (kind === 'todos') op.todos = items;
        } catch (e) { errLog(e, 'CharacterState._logOp'); }
    }
    // [v2.3] 重放重建: 清空派生状态, 按楼层升序重放全部 ops (删楼回滚后调它, 天然一致)
    rebuildFromOps() {
        try {
            const saved = [...this.ops].sort((a, b) => a.floor - b.floor);
            this.characters = {};
            for (const op of saved) {
                if (Array.isArray(op.changes) && op.changes.length) this.applyChanges(op.changes, op.floor, true);
                if (Array.isArray(op.todos) && op.todos.length) this.addTodos(op.todos, op.floor, true);
            }
        } catch (e) { errLog(e, 'CharacterState.rebuildFromOps'); }
    }
    _ensure(name) {
        if (!this.characters[name]) {
            this.characters[name] = { name, fields: {}, todos: [], updatedAt: Date.now(), floor: 0 };
        }
        return this.characters[name];
    }
    /**
     * [v3.180] 主角年龄展示读数（三态文本：原值 / 约X岁(锚点时Y岁) / 原文(锚点时)）。
     *   模块缺失或抛错时回落 getEffectiveAge（v3.148 老实现），调用方无需判空。
     */
    ageReadingPrompt(currentStoryDateStr = '') {
        const p = this.protagonist || {};
        const A = this._ageAnchor();
        if (A && typeof A.ageDisplay === 'function') {
            try {
                const _ch = (typeof this._clockHelpers === 'function') ? this._clockHelpers() : null;
                const d = A.ageDisplay(p.age, p.ageAnchorTime, currentStoryDateStr, {
                    calcAge: _ch ? _ch.calcAge : (a, b) => this.clock?.calcAge?.(a, b),
                    parseFn: _ch ? _ch.parseStoryDate : (s) => this.clock?.parseStoryDate?.(s)
                });
                if (d && d.text) return String(d.text);
                return '';
            } catch (e) { errLog(e, 'CharacterState.ageReadingPrompt'); }
        }
        return this.getEffectiveAge(currentStoryDateStr) || '';
    }
    /**
     * [v3.180] NPC 年龄读数（与主角**同一对字段名** age / ageAnchorTime，三态同规格）。
     *   opts = { now, calcAge, parseFn }——CharacterState 手上没有时钟，故由调用方注入；
     *   不给时钟时不猜（ageDisplay 在缺当前时间时如实返回 exact 原值）。
     */
    ageReading(name, opts = {}) {
        const rec = this.characters[name] || {};
        const ageVal = rec.age || (rec.fields && rec.fields.age) || '';
        if (!ageVal && !rec.ageAnchorTime) return '';
        const A = this._ageAnchor();
        if (!A || typeof A.ageDisplay !== 'function') return String(ageVal || '');
        try {
            const _ch2 = (typeof this._clockHelpers === 'function') ? this._clockHelpers() : null;
            const d = A.ageDisplay(ageVal, rec.ageAnchorTime, opts.now || '', {
                calcAge: opts.calcAge || (_ch2 ? _ch2.calcAge : undefined),
                parseFn: opts.parseFn || (_ch2 ? _ch2.parseStoryDate : undefined)
            });
            return (d && d.text) || '';
        } catch (e) { errLog(e, 'CharacterState.ageReading'); return String(ageVal || ''); }
    }
    /**
     * [v3.180] 年龄锚点导出（携带包专用）：**只导有锚点的**角色，没记过锚点的角色不占位。
     *   刻意**不带年龄**：带过去的年龄配上「新对话当轮的故事时间」就成了「新年龄 + 新锚点」，
     *   ageDisplay 会算出 estimated 而不是 anchor-only——第三态（算不出就不猜）永远不可达。
     *   只带锚点则跨度对得上，读数如实显示「原文(锚点时)」。
     */
    exportAgeAnchors() {
        const out = {};
        try {
            const p = this.protagonist || {};
            if (p.ageAnchorTime) out.__protagonist__ = String(p.ageAnchorTime);
            for (const [name, rec] of Object.entries(this.characters || {})) {
                if (rec && rec.ageAnchorTime) out[name] = String(rec.ageAnchorTime);
            }
        } catch (e) { errLog(e, 'CharacterState.exportAgeAnchors'); }
        return out;
    }
    // 设置/增量修改状态字段 ([v2.3] _replaying=true 表示正在重放, 不再记 op)
    applyChanges(changes, floor, _replaying = false, storyDateStr = '') {
        if (!Array.isArray(changes)) return 0;
        let n = 0;
        const effective = [];
        for (const c of changes) {
            const name = String(c?.character || c?.name || '').trim();
            const field = String(c?.field || '').trim();
            if (!name || !field) continue;
            const rec = this._ensure(name);
            // [v3.184] 行级前后值：**改前先取**（改完再取只能拿到结果，前后值退化成「结果」一个数）。
            //   旧实现只把入参意图（{character, field, delta}）记进 ops 与 OpLog，
            //   于是「这一格从什么变成什么」无处可查——由 delta 反推需要当时的值，而它已不存在。
            const _csPrev = (rec.fields && Object.prototype.hasOwnProperty.call(rec.fields, field)) ? rec.fields[field] : null;
            // 数值增量 / 绝对值 / 文本
            if (c.delta !== undefined && c.delta !== null && !isNaN(Number(c.delta))) {
                const base = Number(rec.fields[field]) || 0;
                rec.fields[field] = Math.round((base + Number(c.delta)) * 100) / 100;
            } else if (c.value !== undefined && c.value !== null) {
                rec.fields[field] = (typeof c.value === 'number') ? c.value : String(c.value).trim();
            }
            // 记入变更集：净零（改了个跟没改一样）与非法输入都进计数、不当变更展示（changeset.js 内部处理）
            try { _changeset()?.record({ table: 'status', pk: [name, field], before: _csPrev, after: rec.fields[field], floor: floor || 0 }); } catch (e) { errLog(e, 'CharacterState.changeset'); }
            if (c.reason) rec.lastReason = String(c.reason).trim();
            rec.updatedAt = Date.now();
            rec.floor = floor || 0;
            // [v3.180] age 字段走锚点原子对（与主角同一对字段名 age / ageAnchorTime）：
            //   写值的同时盖「本轮故事时间」锚点。重放（_replaying）不刷新锚点——补提旧楼时把
            //   两年前的年龄钉到今天的锚点上就是冻龄；但重放也**不得留孤儿锚点**（I2 致命形态），
            //   故年龄为空时成对清除。模块缺失时退回「只写值」的旧行为。
            if (field === 'age') {
                const _A = this._ageAnchor();
                if (_A && typeof _A.stampAge === 'function') {
                    try {
                        const _v = String(rec.fields[field] ?? '').trim();
                        if (_replaying) { if (!_v && rec.ageAnchorTime) _A.stampAge(rec, null, ''); }
                        else _A.stampAge(rec, _v, storyDateStr);
                    } catch (e) { errLog(e, 'CharacterState.applyChanges.stampAge'); }
                }
            }
            // 字段数上限保护
            const keys = Object.keys(rec.fields);
            if (keys.length > this.MAX_FIELDS) delete rec.fields[keys[0]];
            effective.push(c);
            n++;
        }
        if (!_replaying && effective.length) this._logOp(floor, 'changes', effective);
        return n;
    }
    // 待办事项（带去重 + 过期清理）([v2.3] _replaying=true 表示正在重放)
    addTodos(items, floor, _replaying = false) {
        if (!Array.isArray(items)) return 0;
        let n = 0;
        const effective = [];
        for (const t of items) {
            const name = String(t?.character || t?.owner || '').trim();
            const text = String(t?.text || t?.content || '').trim();
            if (!name || !text) continue;
            const rec = this._ensure(name);
            // [v3.31] concern 复发（kiwi-mem/kimi-core 理念）：同一待办被再次提起 = 复发
            const reoccurred = (rec.todos || []).some(x => x.text === text);   // 先查旧件是否存在
            rec.todos = rec.todos.filter(x => x.text !== text);                // 再移除旧件
            rec.todos.push({
                text, date: t.date ? String(t.date).trim() : '', floor: floor || 0, createdAt: Date.now(),
                lastMentionedAt: Date.now(),         // [v3.31] 复发追踪：最近一次被提及
                reoccurred: reoccurred || undefined, // [v3.31] 标记这是复发（历史上有过）
            });
            if (rec.todos.length > this.MAX_TODOS) rec.todos.shift();
            effective.push(t);
            n++;
        }
        if (!_replaying && effective.length) this._logOp(floor, 'todos', effective);
        return n;
    }
    // 过期待办清理（抄 yuzuki todo-manager：剧情时间超过延迟即移除）
    pruneTodos(currentDate, expiryMinutes = 60) {
        if (!currentDate) return 0;
        const cur = this._parseDate(currentDate);
        if (!cur) return 0;
        let removed = 0;
        for (const name of Object.keys(this.characters)) {
            const rec = this.characters[name];
            rec.todos = (rec.todos || []).filter(t => {
                // [v3.31] concern 复发豁免：最近 24h 内被重申的待办即使日期已过也暂不清（延续生命周期）
                if (t.lastMentionedAt && (Date.now() - t.lastMentionedAt < 24 * 3600000)) return true;
                if (!t.date) return true;
                const td = this._parseDate(t.date);
                if (!td) return true;
                const diffMin = (cur - td) / 60000;
                if (diffMin > expiryMinutes) { removed++; return false; }
                return true;
            });
        }
        return removed;
    }
    // [v3.123] Horae 风格状态变化增量读取：复用既有 ops，按楼层和在场角色过滤，返回副本。
    getChangesSince(floor = -1, characters = [], limit = 8) {
        const cursor = Number.isFinite(Number(floor)) ? Number(floor) : -1;
        const cap = Math.min(20, Math.max(0, Number(limit) || 0));
        const allowed = new Set((characters || []).map(x => String(x || '').trim()).filter(Boolean));
        const rows = [];
        for (const op of (this.ops || [])) {
            if (Number(op?.floor) <= cursor) continue;
            for (const c of (op.changes || [])) {
                const name = String(c?.character || c?.name || '').trim();
                if (!name || (allowed.size && !allowed.has(name))) continue;
                rows.push({ id: `status_change_${op.floor}_${name}_${c.field || ''}`, floor: op.floor, name, text: `【状态变化】${name}：${c.field || '状态'} → ${c.value ?? (c.delta !== undefined ? c.delta : '')}${c.reason ? `（${c.reason}）` : ''}`, source: 'status:change' });
            }
        }
        return rows.slice(-cap).map(x => ({ ...x }));
    }
            _parseDate(d) {
        const m = String(d || '').match(/(\d{1,4})\s*[年\/-]\s*(\d{1,2})\s*[月\/-]\s*(\d{1,2})/);
        if (!m) return null;
        let y = Number(m[1]); if (y < 100) y += 2000;
        return new Date(y, Number(m[2]) - 1, Number(m[3]), 0, 0, 0).getTime();
    }
    // 按角色召回（只返回有状态的）
    searchByNames(names, limit = 5) {
        const out = [];
        for (const n of (names || [])) {
            const rec = this.characters[n];
            if (!rec) continue;
            const fields = Object.entries(rec.fields || {});
            const todos = (rec.todos || []);
            if (!fields.length && !todos.length) continue;
            out.push({ name: n, fields, todos });
        }
        return out.slice(0, limit);
    }
    export() {
        return {
            characters: this.characters,
            ops: this.ops,
            baselines: this.baselines || {},
            drifts: this.drifts || {},
            transientNpcs: this.transientNpcs || {},
            trackedNpcs: Array.from(this.trackedNpcs || []),
            geoContext: this.geoContext || {},
            npcTies: this.npcTies || {},
            protagonist: this.protagonist || {},
            lifeDetails: Array.isArray(this.lifeDetails) ? this.lifeDetails : []
        };
    }
    import(data) {
        if (data && typeof data === 'object' && data.characters) {
            this.characters = data.characters;
            this.ops = Array.isArray(data.ops) ? data.ops : [];
            this.baselines = data.baselines || {};
            this.drifts = data.drifts || {};
            this.transientNpcs = data.transientNpcs || {};
            this.trackedNpcs = new Set(Array.isArray(data.trackedNpcs) ? data.trackedNpcs : []);
            this.geoContext = data.geoContext || { majorArea: '', minorArea: '', detailLocation: '', floor: 0, updatedAt: 0 };
            this.npcTies = data.npcTies || {};
            this.protagonist = data.protagonist || { gender: '', age: '', identity: '', appearance: '', outfit: '', condition: '', floor: 0, updatedAt: 0 };
            this.lifeDetails = Array.isArray(data.lifeDetails) ? data.lifeDetails : [];
        } else {
            this.characters = (data && typeof data === 'object') ? data : {};
            this.ops = [];
            this.baselines = {};
            this.drifts = {};
            this.transientNpcs = {};
            this.trackedNpcs = new Set();
            this.geoContext = { majorArea: '', minorArea: '', detailLocation: '', floor: 0, updatedAt: 0 };
            this.npcTies = {};
            this.protagonist = { gender: '', age: '', identity: '', appearance: '', outfit: '', condition: '', floor: 0, updatedAt: 0 };
            this.lifeDetails = [];
        }
    }
}

    /* ── 五、宿主注入口（活口） ── */
    /** [A1 第六刀] 宿主依赖注入口：模块在场时把四个内核数据模型依赖的主人符号换成宿主
     *  **现算**的实现。为什么要有它：副本只在「宿主不在场」（单测/审计把这些类抠进
     *  new Function 重放）时是真实现；宿主在场却继续用副本，则宿主改了函数而副本未同步
     *  就会**静默漂移**（本仓治理过多轮的缺陷形态）。
     *  只接受函数/字符串；非法值忽略（保持副本），不抛、不改语义。返回被换掉的项数（诊断用）。
     *  六个键为什么是这六个：四个类在源码里的类外引用面（按实读）恰好落到它们身上 ——
     *    MemoryGraph     → errLog / _moduleLib / normalizeCharName / areLabelsInConflict / PLUGIN_NAME
     *    SummarySystem   → errLog / _newRelativeTimeHelper / sanitizeJson / PLUGIN_NAME
     *    GameClock       → errLog / _newRelativeTimeHelper
     *    CharacterState  → errLog / _moduleLib / _changeset / _memoryBooksLib / _newRelativeTimeHelper
     *  （三个逐字函数副本与本模块常量不在注入面：它们是逐字相等的副本，注了也是同一串字符。） */
    function bindDeps(deps) {
        const d = deps || {};
        let n = 0;
        if (typeof d.errLog === 'function') { errLog = d.errLog; n++; }
        if (typeof d.sanitizeJson === 'function') { sanitizeJson = d.sanitizeJson; n++; }
        if (typeof d.moduleLib === 'function') { _moduleLib = d.moduleLib; n++; }
        if (typeof d.memoryBooksLib === 'function') { _memoryBooksLib = d.memoryBooksLib; n++; }
        if (typeof d.changesetLib === 'function') { _changeset = d.changesetLib; n++; }
        if (typeof d.relativeTimeHelperFactory === 'function') { _newRelativeTimeHelper = d.relativeTimeHelperFactory; n++; }
        if (typeof d.version === 'string' && d.version) { VERSION = d.version; n++; }
        return n;
    }
    const api = Object.freeze({ MemoryGraph, SummarySystem, GameClock, CharacterState, bindDeps, PLUGIN_NAME, VERSION });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
