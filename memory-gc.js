/* ========================================================
 * memory-gc.js — [A1 第九刀 · v3.326.0] 记忆回收(GC)纯算法集
 *
 * 【为什么需要这一面(修前实测,不是「文件太长想搬家」)】
 *   宿主 `MemoryEngine.optimizeMemory()` 修前 163 行里塞着**五件互不相干的事**:
 *     1 向量文本级去重 / 2 向量按遗忘价值淘汰 / 3 摘要硬上限 /
 *     4 孤儿物资 ops 清理 / 5 图谱同名角色合并。
 *   它们的共同点只有一个:**都会永久删数据**。于是「哪一路删了多少」只能靠通读
 *   163 行才知道,而 P-2 宿主体检(host_beast 探针)把它点名在**低耦合**桶里:
 *   163 行、外部引用 0 次、`this.*` 依赖 10 个 —— 是典型的高体量低耦合成员。
 *   A1 的读数轴(成员级预算 + 低耦合外移)正是为这一类成员立的,本刀按同一条轴走。
 *
 * 【本模块的职责(算法 + 单次回收编排)】
 *   五路各一条分路函数(判据面可逐路单独测),外加一条 runGc(deps) 把五路串成**一次**
 *   完整回收。编排放在这里的理由:五路有**严格顺序与相互依赖**(摘要上限受折叠态影响;
 *   图谱去重的闭包归因必须读**去重后**的图)。顺序写在两处就会漂,故只在模块里写一份。
 *   函数输入输出都是**数据**,不读全局、不发请求、不落账:
 *     · `dedupeByText(vectors)`           —— 同文本只留最新一条
 *     · `capByForgetValue(vectors, ...)`  —— 超限按遗忘价值淘汰(importance × recency × (1+accessFreq))
 *     · `capSummaries(summaries, max)`    —— 摘要硬上限(**只删已折叠的**)
 *     · `orphanOpsOf(ops, chat, ...)`     —— fp 不在该楼任何 swipe 取值中的 ops
 *     · `mergeDuplicateCharacters(...)`   —— 同归一化名的角色节点合并 + 边迁移
 *     · `cascadeReadout(...)`             —— 去重后的闭包归因读数(只读,不删不改边)
 *
 * 【三条纪律(与宿主修前行为逐字对齐,不是「重新设计」)】
 *   1 **零写**:一律返回新容器/新数组,不改传入的容器与元素。
 *      宿主修前是就地改 `this.vector.vectors` / `this.graph.nodes` / `this.graph.edges` ——
 *      「改哪一份」的主权收归宿主(本模块只说「结果是什么」,不说「结果放哪儿」)。
 *   2 **不抛**:畸形元素按修前**同一口径**处置 —— 第 1 路对 `v.text` 的访问与修前逐字同构,
 *      **不额外兜底**(加兜底等于悄悄改行为:修前会抛的地方,这里也必须还抛)。
 *   3 **不落账**:`_lastGcLedger` / `opLog` / debug 日志仍由宿主写。
 *      本模块只把五路删除数**算出来**,不决定怎么记、更不决定记到哪。
 *   4 **写回主权在宿主**:全部输出都是**新容器**,由宿主决定放回哪个字段。
 *
 * 【与既有面的分工(互不重叠,逐条可指认)】
 *   memory-organs.js::VectorStore   答「向量怎么存」
 *   memory-core.js::MemoryGraph     答「图怎么建」
 *   本模块                          答「**哪一条该被永久删掉**」
 *   故诊断面沿用宿主既有 `_lastGcLedger` 一行,不新开一行(同一件事两份读数 = 两份真源)。
 *
 * 【可移植性说明】
 *   机制动机来自「回收算法应与状态容器解耦、且每一路删除都必须可计数」这一通用需求;
 *   实现按本仓规范重写(零依赖、IIFE 双导出、词表与档位全部可注入),未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';
    /** 本面结构版本(形状一变必须抬这个数,防「旧下游配新面」静默错读)。 */
    const GC_VERSION = 1;
    /** 读数 kind(消费方可据此判「这是不是本面产出的读数」)。 */
    const GC_KIND = 'memory_gc';
    /**
     * 五路删除的账本键(**形状与宿主修前 `_gcLedger` 逐字一致** —— 改这里就是改下游读数面)。
     *   少一个键 = 那一路的删除**无法被计数**,用户拿不到「鳏了哪些东西」。
     */
    const LEDGER_KEYS = Object.freeze(['vecDup', 'vecCap', 'sumCap', 'orphanOps', 'graphDup']);
    /** 新账本(**五键齐全的零值**):宿主每次回收前取一份,五路各自累加。 */
    function blankLedger() {
        return { vecDup: 0, vecCap: 0, sumCap: 0, orphanOps: 0, graphDup: 0 };
    }
    /**
     * 保序去重:每键只留 timestamp 最大者(平手留后者),**原数组顺序不变**。
     *
     * [M4-O1 · v3.329.0] 第四参 `scopeOf(item)` 是**可选的**范围注入 —— 同一句正文
     *   发生在**两个不同事件 / 分支 / 宇宙**时不是重复,删掉哪一条都是丢证据。
     *   三态口径(与 `mergeDuplicateCharacters` 同规,**不得塌格**):
     *     · 未注入 scopeOf        ⇒ 逐字旧行为(纯文本键);
     *     · `undefined`(无线索)   ⇒ 并入**同一个**键(旧行为:同会话同宇宙的默认);
     *     · 字符串(可判范围)      ⇒ 进 `文本 + NUL + 范围` 键;
     *     · `null` / 抛异常(有线索却判不了)⇒ **不参与去重**(给每条一个独立键),
     *       并计入 `scopeUnknown`(判不了必须看得见,不得静默当成「同一件事」)。
     */
    function dedupeByText(vectors, scopeOf) {
        const list = Array.isArray(vectors) ? vectors : [];
        const sc = (typeof scopeOf === 'function') ? scopeOf : null;
        const seen = new Map();
        let scopeUnknown = 0;
        let scopeKnown = 0;
        for (const v of list) {
            /* 与修前逐字同构:此处**不**为畸形元素兜底(修前会抛,这里也必须还抛)。 */
            const key = String(v.text || '').trim();
            if (!key) continue;
            let k = key;
            if (sc) {
                let s;
                try { s = sc(v); } catch (e) { s = null; }
                if (s === undefined) { k = key; }
                else if (s === null || s === '') { scopeUnknown += 1; k = key + '\u0000~unknown~' + String(scopeUnknown); }
                else { scopeKnown += 1; k = key + '\u0000' + String(s); }
            }
            const prev = seen.get(k);
            if (prev && prev.timestamp <= v.timestamp) seen.set(k, v);
            else if (prev) continue;
            else seen.set(k, v);
        }
        const winners = new Set(seen.values());
        const kept = list.filter(v => winners.has(v));
        return { vectors: kept, dropped: list.length - kept.length, scopeKnown: scopeKnown, scopeUnknown: scopeUnknown };
    }
    /**
     * 按遗忘价值淘汰到上限。
     *   `nowMs` 由调用方给(**本模块不读时钟**:纯函数里读 Date.now 会让同一输入产生两种结果,
     *   判据无法复算)。`max` 非有限或 <= 0 时回退 500(与修前 `|| 500` 同口径)。
     */
    function capByForgetValue(vectors, max, nowMs) {
        const list = Array.isArray(vectors) ? vectors : [];
        const vMax = (Number.isFinite(max) && max > 0) ? max : 500;
        if (list.length <= vMax) return { vectors: list, cut: 0 };
        const now = Number.isFinite(nowMs) ? nowMs : Date.now();
        const rv = (v) => {
            const ageH = Math.max(0.5, (now - (v.timestamp || now)) / 3600000);
            const recency = 1 / (1 + Math.log10(1 + ageH));
            const accessFreq = (v.accessCount || 0) / Math.max(1, ageH / 24);
            return ((v.importance || 5) / 10) * recency * (1 + accessFreq);
        };
        /* 与修前逐字等价:升序排 → 丢掉价值最低的 cut 个 → 保留 value 最高的 vMax 个。 */
        const sorted = list.slice().sort((a, b) => rv(a) - rv(b));
        const cut = sorted.length - vMax;
        return { vectors: sorted.slice(cut), cut };
    }
    /** 摘要硬上限:只删**已折叠**的(未折叠的宁可超限也不删 —— 那是没进过卷的正文)。 */
    function capSummaries(summaries, max) {
        const list = Array.isArray(summaries) ? summaries : [];
        const sMax = (Number.isFinite(max) && max > 0) ? max : 400;
        if (list.length <= sMax) return { summaries: list, removed: 0 };
        const foldedOld = list.filter(s => s && s.folded);
        const foldable = Math.min(list.length - sMax, foldedOld.length);
        if (foldable <= 0) return { summaries: list, removed: 0 };
        const removeIds = new Set(foldedOld.slice(0, foldable).map(s => s.floor));
        const kept = list.filter(s => !removeIds.has(s.floor));
        return { summaries: kept, removed: foldable };
    }
    /**
     * 孤儿物资 ops:fp 不在该楼任何 swipe 取值中的 ops 是**彻底废除的变体**。
     *   读不到 chat / 无 ops ⇒ 一律不动(dropped 0),**不拿「读不到」当「全废」**。
     *   `msgFpOf` / `hash32` 由调用方注入(本模块不引宿主模块级函数)。
     *   三条保留口径与修前逐字一致:
     *     · 非对象 ⇒ 删;`carried === true` 或 无 fp ⇒ **留**(旧档与在途物资不动);
     *     · 该楼无 fps 读数 ⇒ 楼层越界才删(界限内的一律保,那是 pending 不是废除);
     *     · 有读数 ⇒ fp 必须在集合里。
     */
    function orphanOpsOf(ops, chat, msgFpOf, hash32) {
        const list = Array.isArray(ops) ? ops : [];
        if (!Array.isArray(chat) || !list.length) return { ops: list, dropped: 0, floorFpsKnown: Array.isArray(chat) };
        const floorFps = new Map();
        chat.forEach((m, i) => {
            const set = new Set();
            set.add(msgFpOf(m));
            if (Array.isArray(m && m.swipes)) {
                for (let sw = 0; sw < m.swipes.length; sw++) {
                    if (typeof m.swipes[sw] === 'string') {
                        set.add([((m && m.is_user === true) || (m && m.role === 'user')) ? 'u' : 'a', sw,
                            hash32(m.swipes[sw]), String((m && m.send_date) || (m && m.extra && m.extra.send_date) || '')].join('|'));
                    }
                }
            }
            floorFps.set(i, set);
        });
        const kept = list.filter(o => {
            if (!o || typeof o !== 'object') return false;
            if (o.carried === true || !o.fp) return true;
            const set = floorFps.get(o.floor);
            if (!set) return Math.floor(Number(o.floor) || 0) < chat.length;
            return set.has(o.fp);
        });
        return { ops: kept, dropped: list.length - kept.length, floorFpsKnown: true };
    }
    /**
     * 图谱同名角色节点合并 + 边迁移。
     *   保留**更早创建**的那个(timestamp 小者),指向被丢节点的边重定向到保留节点
     *   (去重后复合 id 天然去重)。`normalize` 由调用方注入(归一化名口径**只有一份真源**,
     *   不在这里再抄一份)。
     *
     * [M4-O1 · v3.329.0] 第四参 `scopeOf(node)` 是**可选的**范围注入。
     *   【为什么】修前只按归一化名分组 ⇒ 同一个名字出现在**两个项目 / 两个宇宙**时,
     *   后台优化会把两条真实身份抹成一条(实测:两个不同 project 的同名节点进来、
     *   只有一个出去),而节点上**没有 project / universe 字段** —— 上游从没把「同一个名字
     *   在两个项目里不是同一个人」这件事喂给回收面(全仓 `universe` 在 index.js 命中 0)。
     *   【三态,不得塌格】
     *     · 未注入 scopeOf(旧调用方)      ⇒ 逐字旧行为(只按名分组);
     *     · `undefined`(节点上无线索)      ⇒ 并入**同一个**名键(旧行为);
     *     · 字符串(可判范围)               ⇒ 进 `名 + NUL + 范围` 键;
     *     · `null` / 抛异常(有线索判不了)  ⇒ **拒绝合并**(给该节点一个独立键),
     *       并计入 `blockedUnknownScope` —— 判不了时「不合」是保守正确的方向
     *       (误合不可逆:证据与边会被搬到另一个身份上),且**必须看得见**。
     */
    function mergeDuplicateCharacters(nodes, edges, normalize, scopeOf) {
        const nodeMap = (nodes instanceof Map) ? nodes : new Map();
        const edgeMap = (edges instanceof Map) ? edges : new Map();
        const nk = (typeof normalize === 'function') ? normalize : (s) => String(s || '');
        const sc = (typeof scopeOf === 'function') ? scopeOf : null;
        const outNodes = new Map(nodeMap);
        const outEdges = new Map(edgeMap);
        const byName = new Map();
        const dupIds = [];
        let scopeKnown = 0;
        let blockedUnknownScope = 0;
        for (const node of Array.from(nodeMap.values())) {
            if (!node || node.type !== 'character' || !node.name) continue;
            let key = nk(node.name);
            if (sc) {
                let s;
                try { s = sc(node); } catch (e) { s = null; }
                if (s === undefined) { /* 无线索 ⇒ 并入名键(旧行为) */ }
                else if (s === null || s === '') {
                    blockedUnknownScope += 1;
                    key = key + '\u0000~noscope~' + String(blockedUnknownScope);
                } else { scopeKnown += 1; key = key + '\u0000' + String(s); }
            }
            const prev = byName.get(key);
            if (!prev) { byName.set(key, node); continue; }
            const keep = ((prev.timestamp || 0) <= (node.timestamp || 0)) ? prev : node;
            const drop = (keep === prev) ? node : prev;
            byName.set(key, keep);
            dupIds.push({ keepId: keep.id, dropId: drop.id });
        }
        for (const { keepId, dropId } of dupIds) {
            /* 边迁移逐对进行:前一对写入的新边会被后一对看到(与修前迭代顺序同构)。 */
            for (const [eid, e] of Array.from(outEdges)) {
                if (e && (e.from === dropId || e.to === dropId)) {
                    outEdges.delete(eid);
                    const newFrom = (e.from === dropId) ? keepId : e.from;
                    const newTo = (e.to === dropId) ? keepId : e.to;
                    if (newFrom !== newTo) {
                        outEdges.set(newFrom + '-' + newTo + '-' + (e.label || 'related'),
                            Object.assign({}, e, { from: newFrom, to: newTo, id: newFrom + '-' + newTo + '-' + (e.label || 'related') }));
                    }
                }
            }
            outNodes.delete(dropId);
        }
        return { nodes: outNodes, edges: outEdges, dupIds, merged: dupIds.length,
            scopeKnown: scopeKnown, blockedUnknownScope: blockedUnknownScope };
    }
    /**
     * 去重后的闭包归因读数(**只读**:不删不改任何边)。
     *   接线点必须在**图谱去重之后** —— 去重会删节点、迁移边,而「边指向一个已不存在的节点」
     *   正是幽灵边的来源。`dc` 缺席 ⇒ 返回 null(宿主如实记「没测」,**不编 0**)。
     */
    function cascadeReadout(dc, nodes, edges, merged) {
        if (!dc || typeof dc.computeCascade !== 'function') return null;
        const ids = new Set();
        for (const nid of (nodes instanceof Map ? nodes.keys() : [])) ids.add(String(nid));
        const adj = new Map();
        for (const nid of ids) adj.set(nid, new Set());
        for (const e of (edges instanceof Map ? edges.values() : [])) {
            const f = String((e && e.from) || '');
            const t = String((e && e.to) || '');
            if (!ids.has(f)) continue;
            adj.get(f).add(t);
        }
        const items = [];
        for (const nid of ids) items.push({ id: nid, refs: [], deps: [...adj.get(nid)] });
        const carry = {};
        const res = dc.computeCascade({ items, allowedRefs: null }, carry);
        const r = carry.cascade || {};
        return {
            nodes: ids.size, edges: edges instanceof Map ? edges.size : 0,
            ghostNodes: r.dropped || 0, danglingDeps: r.danglingDeps || 0,
            byReason: r.byReason || {}, merged: merged || 0,
            kept: ((res && res.keptIds) || []).length,
        };
    }
    /**
     * 一次完整回收(**模块里唯一的编排点**,五路顺序只写在这里)。
     *
     * `deps` 一律由宿主注入(**本模块不读 this、不读全局**):
     *   · `vectors` / `summarySummaries` / `itemOps` / `graphNodes` / `graphEdges` —— 现容器
     *   · `vectorMaxCount` / `summaryMaxCount` —— 两个上限(缺省 500 / 400,与修前同口径)
     *   · `nowMs` —— 时钟(**不读 Date.now**:判据要可复算)
     *   · `chat` / `msgFpOf` / `hash32` —— 第 4 路要的楼层读数与两个注入原语
     *   · `normalizeName` —— 第 5 路的归一化名(**唯一真源在宿主**)
     *   · `dependencyClosure` —— 可选;缺席 ⇒ cascade 为 null(如实记「没测」,不编 0)
     *
     * 返回 **新容器 + 五路读数 + removed 总数**(写回由宿主做)。
     * 各路彼此独立:第 4 路抛异常时前三路结果仍然有效(计数不丢)——
     *   与宿主修前「try 只包住第 4 路」同形,不把一路失败升级成整次失败。
     */
    function runGc(deps) {
        const d = deps || {};
        const ledger = blankLedger();
        let removed = 0;
        /* 第 1 路:向量文本级去重(完全相同文本只留最新)。 */
        const dedup = dedupeByText(d.vectors, d.vectorScopeOf);
        ledger.vecDup = dedup.dropped;
        removed += dedup.dropped;
        /* 第 2 路:向量硬上限(超限按遗忘价值淘汰)。 */
        const capped = capByForgetValue(dedup.vectors, d.vectorMaxCount, d.nowMs);
        ledger.vecCap = capped.cut;
        removed += capped.cut;
        /* 第 3 路:摘要硬上限(只删已折叠的)。 */
        const sums = capSummaries(d.summarySummaries, d.summaryMaxCount);
        ledger.sumCap = sums.removed;
        removed += sums.removed;
        /* 第 4 路:孤儿物资 ops。异常不吞掉前三路读数。 */
        let opsKept = Array.isArray(d.itemOps) ? d.itemOps : [];
        let orphanThrew = null;
        try {
            const orph = orphanOpsOf(d.itemOps, d.chat, d.msgFpOf, d.hash32);
            opsKept = orph.ops;
            ledger.orphanOps = orph.dropped;
            removed += orph.dropped;
        } catch (e) { orphanThrew = String((e && e.message) || e); }
        /* 第 5 路:图谱同名角色合并 + 边迁移。
         *   异常**不吞前四路读数**——与修前「第 5 路自带 try」同形:
         *   修前一路失败只落一行 errLog,不升级成「整次回收失败」。
         *   失败时 nodes/edges 取**输入原容器**(本模块零写:不产出「半截改过」的容器。
         *   修前就地改若半途抛会留下部分修改——这是本刀对外声明的**唯一行为变强**,留在 v3326 判据里。 */
        let merged = { nodes: d.graphNodes, edges: d.graphEdges, dupIds: [], merged: 0 };
        let graphThrew = null;
        try {
            merged = mergeDuplicateCharacters(d.graphNodes, d.graphEdges, d.normalizeName, d.nodeScopeOf);
            ledger.graphDup = merged.merged;
            removed += merged.merged;
        } catch (e) { graphThrew = String((e && e.message) || e); }
        /* 闭包归因读数必须读**去重后**的图(顺序是语义,不是风格)。
         *   本段也自带 try(修前它就嵌在图谱段的 try 里)。 */
        let cascade = null;
        let cascadeThrew = null;
        try {
            cascade = cascadeReadout(d.dependencyClosure, merged.nodes, merged.edges, merged.merged);
        } catch (e) { cascadeThrew = String((e && e.message) || e); }
        return {
            vectors: capped.vectors,
            items: opsKept,
            summaries: sums.summaries,
            nodes: merged.nodes,
            edges: merged.edges,
            removed: removed,
            ledger: ledger,
            dupIds: merged.dupIds,
            cascade: cascade,
            orphanThrew: orphanThrew,
            graphThrew: graphThrew,
            cascadeThrew: cascadeThrew,
            zeroWrite: true,
            /* [M4-O1 · v3.329.0] 范围读数(**不得与「零删除」同形**):
             *   两条去重路各自报「按范围分组过多少条 / 因判不了范围而没参与」。
             *   全 0 且有 scopeOf 注入 ⇒ 说明调用方一次都没给出可判范围(配置/接线问题),
             *   而不是「本来就没有同名」。 */
            scope: {
                vecKnown: dedup.scopeKnown || 0,
                vecUnknown: dedup.scopeUnknown || 0,
                nodeKnown: merged.scopeKnown || 0,
                nodeUnknown: merged.blockedUnknownScope || 0,
            },
        };
    }
    /** 单行读数(**必须报五路各自的数**:合成一个「共删 N」等于「鳏了哪些」无从回答)。 */
    function line(readings) {
        const r = readings || {};
        const parts = [];
        for (const k of LEDGER_KEYS) parts.push(k + '=' + (Number(r[k]) || 0));
        return '回收 ' + (Number(r.removed) || 0) + ' 条(' + parts.join(' ') + ')';
    }
    /** 自检:五键齐全 + 六函数在场(**防「导出被清空」与「少一路读数」两种静默**)。 */
    function selfCheck() {
        const problems = [];
        if (!Array.isArray(LEDGER_KEYS) || LEDGER_KEYS.length !== 5) problems.push('五路账本键须齐全(实 ' + (LEDGER_KEYS || []).length + ')');
        const need = ['dedupeByText', 'capByForgetValue', 'capSummaries', 'orphanOpsOf', 'mergeDuplicateCharacters', 'cascadeReadout', 'runGc'];
        for (const n of need) if (typeof api[n] !== 'function') problems.push('缺函数:' + n);
        return { ok: problems.length === 0, problems, version: GC_VERSION, kind: GC_KIND };
    }
    const api = {
        GC_VERSION: GC_VERSION,
        GC_KIND: GC_KIND,
        LEDGER_KEYS: LEDGER_KEYS,
        blankLedger: blankLedger,
        dedupeByText: dedupeByText,
        capByForgetValue: capByForgetValue,
        capSummaries: capSummaries,
        orphanOpsOf: orphanOpsOf,
        mergeDuplicateCharacters: mergeDuplicateCharacters,
        runGc: runGc,
        cascadeReadout: cascadeReadout,
        line: line,
        selfCheck: selfCheck,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaMemoryGc = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛,忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
