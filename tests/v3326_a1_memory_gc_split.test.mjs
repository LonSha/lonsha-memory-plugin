/* ============================================================
 * tests/v3326_a1_memory_gc_split.test.mjs — v3.326.0 · A1 第九刀(memory-gc.js 外移)
 *
 * 【本档要证明的是「五路回收算法真的搬走了、且搬的是行为而不是形状」,不是「新文件在场」】
 *   刀口:宿主 `MemoryEngine.optimizeMemory()` 修前 164 行的块里塞着**五件互不相干的事**
 *   (向量文本级去重 / 向量按遗忘价值淘汰 / 摘要硬上限 / 孤儿物资 ops 清理 / 图谱同名角色合并),
 *   共同点只有一个:**都会永久删数据** —— 而「哪一路删了多少」只能靠通读 164 行才知道。
 *   本刀把它外移成 `memory-gc.js`,宿主只剩「取库 → 注入 → 写回 → 落账」。
 *
 *   判据分四面(每面都有独立的证伪路径,不是同一条判据换六个写法):
 *     A 结构面:导出面 13 项 / 冻结 / 五路账本键一份真源 / selfCheck 自证 / 零依赖
 *     B 算法面:五路各**真跑**一遍并逐路留数(期望值全部取自 tools/v3326_probe.mjs 的真跑读数)
 *     C 零写与不抛:输入容器一个字节不改 + 返回值是新容器;第 1 路**不额外兜底**(与修前同口径)
 *     D 故障隔离:一路抛异常时**前三路读数不丢**、且「抛了」与「测到 0」严格不同形
 *     E 宿主接线:取库口 / 常量空实现 / 缺席路径与「在场零删除」不同形 / 注入五组键 / 写回五容器 /
 *       落账口径逐字保留(五键 + 80 字符切换 + opLog 真实 API)/ 内联残留为零
 *
 * 【本档刻意不判的一条(诚实边界)】
 *   第 2 路「切掉哪一条」不写死:遗忘价值是 importance × recency × (1+accessFreq) 的**浮点**算式,
 *   几条候选的 ageH 在毫秒量级差下被 log10 抹平 —— 判「切掉的是第 k 条」等于把浮点末位当契约。
 *   故只判「恰好切掉 1 条、其余 4 条仍在」,并在 B2 段头写明这一取舍。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形;
 *   并反向对照「原版同判据必须通过」。工具两向自证(H6)与判据纯度(H5)各一段。
 * 【当版锚点】本档自锚常量 BORN + vnum(锚必须住在当版档案里)。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);

const IDX = read('index.js');
const GC_SRC = read('memory-gc.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const SELF_REL = path.join('tests', 'v3326_a1_memory_gc_split.test.mjs');
const SELF = read(SELF_REL);

/** 与生产同形地在隔离 vm 里加载 IIFE 模块(window 即全局、module 缺席)。 */
function loadIIFE(src, globalName) {
    const ctx = {
        console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math,
        isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError,
    };
    ctx.window = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const GC = loadIIFE(GC_SRC, 'LonShaMemoryGc');

/* 归一化名交给调用方注入(本档注入的这份与宿主同形:trim)。 */
const normName = (s) => String(s || '').trim();
const hash32 = (s) => {
    let h = 0x811c9dc5;
    for (const ch of String(s || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h;
};
const msgFpOf = (m) => 'fp:' + hash32(m.mes);

/* ══════════════ 判据体(纯函数:吃 api / 源码表,返回问题列表) ══════════════ */

/** A. 结构面 15 项导出 + 冻结 + 五键一份真源 + selfCheck。 */
function structureJudge(gc, src) {
    const P = [];
    const want = ['GC_KIND', 'GC_VERSION', 'LEDGER_KEYS', 'blankEvidence', 'blankLedger', 'capByForgetValue', 'capSummaries',
        'cascadeReadout', 'dedupeByText', 'evidenceScreen', 'line', 'mergeDuplicateCharacters', 'orphanOpsOf', 'runGc', 'selfCheck'];
    const got = Object.keys(gc).sort();
    if (got.join(',') !== want.join(',')) P.push('导出面变了:实测 [' + got.join(',') + ']');
    if (!Object.isFrozen(gc)) P.push('导出面未冻结(下游可改 = 面可被就地篡改)');
    if (gc.GC_KIND !== 'memory_gc') P.push('GC_KIND 不是 memory_gc:' + gc.GC_KIND);
    if (gc.GC_VERSION !== 2) P.push('GC_VERSION 应为 2(v3.337.0 证据保护面):' + gc.GC_VERSION);
    const keys = gc.LEDGER_KEYS;
    if (!Array.isArray(keys) || keys.length !== 5) P.push('五路账本键须恰五个,实 ' + (keys || []).length);
    else if (keys.join(',') !== 'vecDup,vecCap,sumCap,orphanOps,graphDup') P.push('五路账本键名变了:' + keys.join(','));
    const blank = gc.blankLedger();
    if (keys.some((k) => blank[k] !== 0)) P.push('blankLedger 五键不齐零:' + JSON.stringify(blank));
    const sc = gc.selfCheck();
    if (!sc || sc.ok !== true) P.push('selfCheck 未通过:' + JSON.stringify(sc));
    if (sc && sc.kind !== 'memory_gc') P.push('selfCheck.kind 不符:' + (sc && sc.kind));
    /* 模块实现体不得读 this:能力一律经 deps 注入(注释里的说明文字不算代码) */
    const implCode = String(src).split('\n').filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l) && l.indexOf('globalThis') < 0).join('\n');
    if (/(^|[^\w.$])this[.)\s=]/.test(implCode)) P.push('模块实现体不得读宿主 this(能力须经 deps 注入)');
    for (const banned of ['require(', 'fetch(', 'localStorage', 'indexedDB']) {
        if (String(src).indexOf(banned) >= 0) P.push('模块不得出现 ' + banned + '(零依赖 / 离线 / 不落盘)');
    }
    return P;
}

/** B. 五路算法真跑:逐路留数 + 逐路可归因。 */
function fiveWayJudge(gc) {
    const P = [];
    const mkVec = (text, ts, imp, acc) => ({ text, timestamp: ts, importance: imp, accessCount: acc });
    const vectors = [
        mkVec('甲', 100, 9, 40), mkVec('甲', 200, 9, 40),
        mkVec('乙', 300, 1, 0), mkVec('丙', 400, 1, 0), mkVec('丁', 500, 1, 0), mkVec('戊', 600, 1, 0),
    ];
    const summaries = [
        { floor: 1, folded: true, text: 's1' }, { floor: 2, folded: true, text: 's2' },
        { floor: 3, folded: true, text: 's3' }, { floor: 4, folded: false, text: 's4' },
    ];
    const nodes = new Map([
        ['n1', { id: 'n1', type: 'character', name: '苏晴', timestamp: 10 }],
        ['n2', { id: 'n2', type: 'character', name: '苏晴', timestamp: 20 }],
        ['n3', { id: 'n3', type: 'place', name: '苏晴', timestamp: 5 }],
    ]);
    const edges = new Map([
        ['n2-n1-x', { id: 'n2-n1-x', from: 'n2', to: 'n1', label: 'x' }],
        ['n3-n2-y', { id: 'n3-n2-y', from: 'n3', to: 'n2', label: 'y' }],
    ]);
    const chat = [
        { is_user: false, mes: 'a', send_date: '2026-01-01', swipes: ['a', 'a2'] },
        { is_user: true, mes: 'b', send_date: '2026-01-02', swipes: ['b'] },
    ];
    const realFp = msgFpOf(chat[0]);
    const items = [
        { floor: 0, fp: 'nope' },                    /* 楼层内、fp 不在任何 swipe 取值里 ⇒ 删 */
        { floor: 9, fp: 'nope' },                    /* 楼层越界 ⇒ 删 */
        { floor: 0, fp: 'x', carried: true },        /* carried ⇒ 留(在途物资) */
        { floor: 0 },                                /* 无 fp ⇒ 留(旧档) */
        null,                                        /* 非对象 ⇒ 删 */
        { floor: 0, fp: realFp },                    /* 真取值 ⇒ 留 */
    ];
    const r = gc.runGc({
        vectors, summarySummaries: summaries, itemOps: items,
        graphNodes: nodes, graphEdges: edges,
        vectorMaxCount: 4, summaryMaxCount: 3, nowMs: 1e12,
        chat, msgFpOf, hash32, normalizeName: normName,
        dependencyClosure: { computeCascade: () => ({ keptIds: ['n1', 'n3'] }) },
    });
    const L = r.ledger || {};
    /* 1 第 1 路:同文本只留最新 ⇒ 删 1 */
    if (L.vecDup !== 1) P.push('第 1 路(向量文本去重)留数错:' + L.vecDup);
    if (r.vectors.length !== 4) P.push('第 1 路后长度错:' + r.vectors.length);
    /* 2 第 2 路:上限 4 ⇒ 恰切 1(不判切掉哪一条,见档头边界) */
    if (L.vecCap !== 1) P.push('第 2 路(向量硬上限)留数错:' + L.vecCap);
    /* 3 第 3 路:上限 3、folded 3 条 ⇒ 删 1(floor 1) */
    if (L.sumCap !== 1) P.push('第 3 路(摘要硬上限)留数错:' + L.sumCap);
    if (r.summaries.map((x) => x.floor).join(',') !== '2,3,4') P.push('第 3 路删错条目:' + r.summaries.map((x) => x.floor).join(','));
    /* 4 第 4 路:3 删 3 留 */
    if (L.orphanOps !== 3) P.push('第 4 路(孤儿 ops)留数错:' + L.orphanOps);
    if (r.items.length !== 3) P.push('第 4 路后长度错:' + r.items.length);
    /* 5 第 5 路:同名 character 两个 ⇒ 合并 1(place 同名不参与) */
    if (L.graphDup !== 1) P.push('第 5 路(图谱同名合并)留数错:' + L.graphDup);
    if (r.dupIds.map((x) => x.keepId + '>' + x.dropId).join(',') !== 'n1>n2') P.push('第 5 路保留的不是更早创建的那个:' + JSON.stringify(r.dupIds));
    if ([...r.nodes.keys()].join(',') !== 'n1,n3') P.push('第 5 路后节点集错:' + [...r.nodes.keys()].join(','));
    if ([...r.edges.keys()].join(',') !== 'n3-n1-y') P.push('第 5 路迁边结果错:' + [...r.edges.keys()].join(','));
    /* 总数与单行读数 */
    if (r.removed !== 7) P.push('removed 总数错(五路之和):' + r.removed);
    const ln = gc.line(L);
    for (const k of ['vecDup', 'vecCap', 'sumCap', 'orphanOps', 'graphDup']) {
        if (ln.indexOf(k + '=') < 0) P.push('单行读数缺一路:' + k);
    }
    /* 闭包归因必须读**去重后**的图:merged 1 / nodes 2 / edges 1 */
    if (!r.cascade) P.push('闭包归因缺席(dc 已在场)');
    else {
        if (r.cascade.nodes !== 2 || r.cascade.edges !== 1) P.push('闭包归因读到的图不是去重后的:' + JSON.stringify(r.cascade));
        if (r.cascade.merged !== 1) P.push('闭包归因未带上合并读数:' + r.cascade.merged);
        if (r.cascade.kept !== 2) P.push('闭包归因 kept 不实:' + r.cascade.kept);
    }
    return P;
}

/** C. 零写:输入容器一个字节不改,返回值是新容器。 */
function zeroWriteJudge(gc) {
    const P = [];
    const vectors = [{ text: '甲', timestamp: 1 }, { text: '甲', timestamp: 2 }, { text: '乙', timestamp: 3 }];
    const summaries = [{ floor: 1, folded: true }, { floor: 2, folded: true }];
    const nodes = new Map([['a', { id: 'a', type: 'character', name: '甲' }], ['b', { id: 'b', type: 'character', name: '甲' }]]);
    const edges = new Map([['a-b-z', { id: 'a-b-z', from: 'a', to: 'b', label: 'z' }]]);
    const items = [{ floor: 0, fp: 'x' }, { floor: 0 }];
    const snap = {
        vectors: JSON.stringify(vectors), summaries: JSON.stringify(summaries),
        nodes: JSON.stringify([...nodes.entries()]), edges: JSON.stringify([...edges.entries()]),
        items: JSON.stringify(items),
    };
    const r = gc.runGc({
        vectors, summarySummaries: summaries, itemOps: items, graphNodes: nodes, graphEdges: edges,
        vectorMaxCount: 500, summaryMaxCount: 400, nowMs: 1e12, normalizeName: normName,
    });
    if (JSON.stringify(vectors) !== snap.vectors) P.push('第 1/2 路改了输入向量数组');
    if (JSON.stringify(summaries) !== snap.summaries) P.push('第 3 路改了输入摘要数组');
    if (JSON.stringify([...nodes.entries()]) !== snap.nodes) P.push('第 5 路改了输入节点容器');
    if (JSON.stringify([...edges.entries()]) !== snap.edges) P.push('第 5 路改了输入边容器');
    if (JSON.stringify(items) !== snap.items) P.push('第 4 路改了输入 ops 数组');
    if (r.nodes === nodes || r.edges === edges) P.push('返回值复用了输入容器(写回主权必须在宿主)');
    if (r.zeroWrite !== true) P.push('模块未声明零写');
    /* 第 1 路**不额外兜底**:与修前同口径 —— 畸形元素照样抛,不悄悄吞掉。
     *   (加兜底等于悄悄改行为:修前会抛的地方,这里也必须还抛。) */
    let threw = null;
    try { gc.dedupeByText([{ text: 'a' }, null]); } catch (e) { threw = e && e.constructor && e.constructor.name; }
    if (threw !== 'TypeError') P.push('第 1 路对畸形元素不再按修前口径抛(实 ' + threw + ')');
    return P;
}

/** D. 故障隔离:一路抛时前三路读数不丢,且「抛了」与「测到 0」不同形。 */
function isolationJudge(gc) {
    const P = [];
    const vectors = [{ text: '甲', timestamp: 1 }, { text: '甲', timestamp: 2 }];
    const summaries = [{ floor: 1, folded: true }, { floor: 2, folded: true }];
    /* 第 5 路抛(输入容器的 values() 抛)⇒ 前三路读数仍在、且零写(取输入原容器) */
    class BadNodes extends Map { values() { throw new Error('graphboom'); } }
    const badNodes = new BadNodes([['a', { id: 'a', type: 'character', name: '甲' }]]);
    const r5 = gc.runGc({
        vectors, summarySummaries: summaries, itemOps: [], graphNodes: badNodes, graphEdges: new Map(),
        vectorMaxCount: 500, summaryMaxCount: 1, nowMs: 1e12, normalizeName: normName,
    });
    if (r5.graphThrew !== 'graphboom') P.push('第 5 路异常未具名留痕:' + r5.graphThrew);
    if (r5.ledger.vecDup !== 1 || r5.ledger.sumCap !== 1) P.push('第 5 路抛把前三路读数一起吞了:' + JSON.stringify(r5.ledger));
    if (r5.ledger.graphDup !== 0) P.push('第 5 路抛时不该编一个「测到 0」以外的数:' + r5.ledger.graphDup);
    if (r5.nodes !== badNodes) P.push('第 5 路抛时未取输入原容器(半截改过的容器不得外流)');
    /* 第 4 路抛(注入原语抛)⇒ 前三路 + 第 5 路读数仍在 */
    const r4 = gc.runGc({
        vectors, summarySummaries: summaries, itemOps: [{ floor: 0, fp: 'x' }],
        graphNodes: new Map(), graphEdges: new Map(),
        vectorMaxCount: 500, summaryMaxCount: 1, nowMs: 1e12,
        chat: [{ is_user: false, mes: 'a' }], msgFpOf: () => { throw new Error('fphoom'); }, hash32,
        normalizeName: normName,
    });
    if (r4.orphanThrew !== 'fphoom') P.push('第 4 路异常未具名留痕:' + r4.orphanThrew);
    if (r4.ledger.vecDup !== 1 || r4.ledger.sumCap !== 1) P.push('第 4 路抛把前两路读数一起吞了:' + JSON.stringify(r4.ledger));
    if (r4.items.length !== 1) P.push('第 4 路抛时 ops 不应被改动:' + r4.items.length);
    /* 闭包归因三态:缺席(null)/ 抛(具名) / 在场 */
    const absent = gc.cascadeReadout(null, new Map(), new Map(), 0);
    if (absent !== null) P.push('dc 缺席须给 null(「没测」不是 0):' + JSON.stringify(absent));
    class BadDC { computeCascade() { throw new Error('dcboom'); } }
    const r3 = gc.runGc({
        vectors: [], summarySummaries: [], itemOps: [], graphNodes: new Map(), graphEdges: new Map(),
        nowMs: 0, dependencyClosure: new BadDC(),
    });
    if (r3.cascade !== null) P.push('dc 抛时不得产出读数:' + JSON.stringify(r3.cascade));
    if (r3.cascadeThrew !== 'dcboom') P.push('dc 抛未具名留痕:' + r3.cascadeThrew);
    /* 零删除与「模块缺席」不同形:零删除是五键全零的账本,缺席是 null */
    const empty = gc.runGc({ vectors: [], summarySummaries: [], itemOps: [], graphNodes: new Map(), graphEdges: new Map(), nowMs: 0 });
    if (empty.removed !== 0) P.push('空输入 removed 应为 0:' + empty.removed);
    if (!empty.ledger || empty.ledger.vecDup !== 0) P.push('空输入须给五键全零账本(与「模块缺席」不同形)');
    if (empty.cascade !== null) P.push('空输入且 dc 缺席 ⇒ cascade 须 null');
    return P;
}

/** E. 宿主接线:取库口 / 缺席路径 / 注入面 / 写回 / 落账口径 / 无内联残留。 */
function hostJudge(idx, mf) {
    const P = [];
    /* E1 取库口(与既有 _memoryLedgersLib 同形)+ 常量空实现 Fallback(不保留第二份内联实现) */
    const libM = /function _memoryGcLib\(\) \{\s*return _moduleLib\(\(\) => window\.LonShaMemoryGc, 'memory-gc\.js'\);\s*\}/.exec(idx);
    if (!libM) P.push('缺取库口 _memoryGcLib()(须与既有取库口同形:一处 _moduleLib + 模块文件名)');
    if (!idx.includes('const GC = _memoryGcLib();')) P.push('方法体未真的取库');
    /* E2 缺席路径与「在场但零删除」不同形 */
    if (!idx.includes('this._lastGcLedger' + ' = null;')) P.push('模块缺席时未把账本置 null(「没跑」与「跑了零删」会同形)');
    if (!/if \(!GC \|\| typeof GC\.runGc !== 'function'\) \{/.test(idx)) P.push('缺席判定未按能力探测(只看对象在场 ⇒ 半截模块会被当成可用)');
    /* E3 注入面五组键齐(全是**数据**,模块不读 this / 不读全局) */
    const callM = /GC\.runGc\(\{([\s\S]{0,1400}?)\}\)/.exec(idx);
    if (!callM) P.push('缺 GC.runGc({...}) 调用');
    else {
        const body = callM[1];
        for (const k of ['vectors:', 'summarySummaries:', 'itemOps:', 'graphNodes:', 'graphEdges:',
            'vectorMaxCount:', 'summaryMaxCount:', 'nowMs:', 'chat:', 'msgFpOf:', 'hash32:',
            'normalizeName:', 'dependencyClosure:',
            // [M4-O7 · v3.337.0] 证据保护注入面:三路判定器 + 预算(缺了判定器=保护静默关闭)
            'evidenceJudgeVec:', 'protectBudgetVec:', 'evidenceJudgeSum:', 'protectBudgetSum:',
            'evidenceJudgeOps:', 'protectBudgetOps:']) {
            if (body.indexOf(k) < 0) P.push('注入面缺 ' + k);
        }
        if (!idx.includes('normalizeName: normalizeCharName' + ',')) P.push('注入面归一化名未接宿主唯一真源(跨模块会静默读旧值)');
        if (/(^|[^\w.$])this\s*[,)}]/.test(body)) P.push('注入面把宿主引擎整只交了出去(模块会跟着宿主内部结构漂)');
    }
    /* E4 写回五容器(主权在宿主) */
    for (const line of ['this.vector.vectors = _r.vectors;', 'this.summary.summaries = _r.summaries;',
        'this.itemOps = _r.items;', 'this.graph.nodes = _r.nodes;', 'this.graph.edges = _r.edges;']) {
        if (!idx.includes(line)) P.push('缺写回:' + line);
    }
    /* E5 落账口径逐字保留(五键 + 80 字符切换 + opLog 真实 API) */
    if (!idx.includes('this._lastGcLedger = _gcLedger;')) P.push('未挂账本(诊断面读不到分路数)');
    for (const k of ['vecDup', 'vecCap', 'sumCap', 'orphanOps', 'graphDup']) {
        if (!idx.includes('_gcLedger.' + k)) P.push('宿主未读这一路读数:' + k);
    }
    if (!idx.includes('_gcFull.length <= 80')) P.push('meta 80 字符切换丢了(长值会产出半截键)');
    if (!idx.includes("'vd=' + _gcLedger.vecDup")) P.push('紧凑键切换丢了');
    if (!/this\.opLog\?\.log\('gc', 'remove', _r\.removed \+ ' items'/.test(idx)) P.push('opLog 落账口径变了(须 log(type, op, ref, floor, meta))');
    if (!/if \(_r\.removed\) \{/.test(idx)) P.push('零删除不留噪的闸丢了(有删除才落账)');
    if (/this\.opLog\?*\.push\(/.test(idx)) P.push('OpLog 没有 push(),只有 log()');
    /* E5b 三处异常具名留痕(与既有埋点惯例同形:独立 tag,不合并) */
    for (const t of ["'GC.缺席'", "'HS.孤儿ops清理'", "'GD.图谱去重'", "'V3173.dependencyClosure'"]) {
        if (!idx.includes(t)) P.push('缺具名埋点:' + t);
    }
    if (!idx.includes("errLog(new Error(_r.orphanThrew), " + "'HS.孤儿ops清理');")) P.push('第 4 路异常未留痕');
    if (!idx.includes("errLog(new Error(_r.graphThrew), 'GD.图谱去重');")) P.push('第 5 路异常未留痕');
    if (!idx.includes("errLog(new Error(_r.cascadeThrew), 'V3173.dependencyClosure');")) P.push('闭包归因异常未留痕');
    /* E5c 调试文案保留(人读面:诊断日志不得退化成 ASCII 代号) */
    if (!idx.includes('图谱去重: 合并 ')) P.push('调试文案「图谱去重: 合并 N 个重复角色节点」丢了');
    if (!idx.includes('记忆优化: 清理 ')) P.push('调试文案「记忆优化: 清理 N 条冗余」丢了');
    /* E6 内联残留为零(两份实现会漂 —— 真源只许一处) */
    for (const inline of ['1 + Math.log10(1 + ageH)', 'const foldedOld = list.filter', 'byName.set(key, keep)',
        'const removeIds = new Set(foldedOld', 'const winners = new Set(seen.values())']) {
        if (idx.indexOf(inline) >= 0) P.push('宿主仍有内联实现残留:' + inline);
    }
    /* E7 manifest 登记面(不登记 = 浏览器不加载 = 面永远缺席) */
    const hits = mf.extra_js.filter((x) => x === 'memory-gc.js').length;
    if (hits !== 1) P.push('memory-gc.js 须在 extra_js 恰一次,实 ' + hits);
    if (mf.extra_js[0] !== 'ledger-entity.js') P.push('ledger-entity.js 仍须在 extra_js 首位(v3.207 不变量)');
    return P;
}

/* ══════════════ 负控制锚点(在判据层只声明一次 —— H5 判据纯度) ══════════════ */
const A_GC1 = 'ledger.vecDup = dedup.dropped;';
const A_GC2 = 'graphThrew = String((e && e.message) || e);';
const A_IDX1 = 'this._lastGcLedger = null;';
const A_IDX2 = 'normalizeName: normalizeCharName,';
const A_IDX3 = "errLog(new Error(_r.orphanThrew), 'HS.孤儿ops清理');";

/* ══════════════ A. 结构面 ══════════════ */
test('v3326 A1. ★★★ 导出面 13 项 / 冻结 / 五路账本键一份真源 / selfCheck 自证', () => {
    assert.deepEqual(structureJudge(GC, GC_SRC), [], '结构面判据');
    ok('13 项导出、导出面冻结、五键一份真源');
});
test('v3326 A2. ★★★ 零依赖纪律:不 require 兄弟模块 / 不联网 / 不落盘', () => {
    assert.deepEqual(structureJudge(GC, GC_SRC), [], '零依赖面');
    ok('模块自足(能力经 deps 注入,不 require 兄弟模块)');
});
test('v3326 A3. ★★★ 登记面:memory-gc.js 在 extra_js 恰一次(不登记 = 面永远缺席)', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('extra_js') >= 0 || x.indexOf('ledger-entity') >= 0), [], '登记面');
    ok('extra_js ' + MF.extra_js.length + ' 项,memory-gc.js 恰一次且非首位');
});

/* ══════════════ B. 五路算法(真跑) ══════════════ */
test('v3326 B1. ★★★★ 五路各留各的数:同一输入下五键逐路可分,总数等于五路之和', () => {
    assert.deepEqual(fiveWayJudge(GC), [], '五路判据');
    ok('vecDup/vecCap/sumCap/orphanOps/graphDup 逐路留数,removed = 5 路之和');
});
test('v3326 B2. ★★★★ 第 2 路只判「恰切 1 条」不判「切掉哪一条」(浮点算式不当契约)', () => {
    const P = fiveWayJudge(GC);
    assert.deepEqual(P, [], '第 2 路判据');
    ok('遗忘价值是浮点算式 ⇒ 只判条数,不拿末位当契约(边界写在档头)');
});
test('v3326 B3. ★★★ 第 3 路只删已折叠的(未折叠的宁可超限也不删 —— 那是没进过卷的正文)', () => {
    const noFold = GC.capSummaries([{ floor: 1, text: 'x' }, { floor: 2, text: 'y' }], 1);
    assert.equal(noFold.removed, 0, '无可折叠条目时一条都不许删');
    assert.equal(noFold.summaries.length, 2, '未折叠条目须原样保留');
    const one = GC.capSummaries([{ floor: 1, folded: true, text: 'x' }, { floor: 2, text: 'y' }], 1);
    assert.equal(one.removed, 1, '有可折叠条目时按差额删');
    assert.deepEqual(one.summaries.map((s) => s.floor), [2], '删的必须是已折叠那条');
    ok('只删已折叠的;未折叠条目超限也不删');
});
test('v3326 B4. ★★★ 第 4 路读不到 chat ⇒ 一律不动(不拿「读不到」当「全废」)', () => {
    const r = GC.orphanOpsOf([{ floor: 0, fp: 'z' }], null, msgFpOf, hash32);
    assert.equal(r.dropped, 0, '读不到 chat 时不许判废');
    assert.equal(r.floorFpsKnown, false, '须如实报「没读到楼层指纹」');
    assert.equal(r.ops.length, 1, 'ops 原样返回');
    ok('读不到 chat ⇒ dropped 0 且如实记「没读到」');
});

/* ══════════════ C. 零写与不抛 ══════════════ */
test('v3326 C1. ★★★★ 零写:输入容器一个字节不改,返回值全是新容器(写回主权在宿主)', () => {
    assert.deepEqual(zeroWriteJudge(GC), [], '零写判据');
    ok('五路输入零改;nodes/edges 返回新容器');
});
test('v3326 C2. ★★★ 第 1 路不额外兜底:修前会抛的地方这里也必须还抛(不悄悄改行为)', () => {
    assert.deepEqual(zeroWriteJudge(GC).filter((x) => x.indexOf('畸形元素') >= 0), [], '不兜底判据');
    ok('畸形元素按修前同口径抛 TypeError(不加兜底)');
});

/* ══════════════ D. 故障隔离 ══════════════ */
test('v3326 D1. ★★★★ 第 5 路抛:前三路读数不丢 + 零写(不产出半截改过的容器)', () => {
    assert.deepEqual(isolationJudge(GC).filter((x) => x.indexOf('第 5 路') >= 0), [], '第 5 路隔离');
    ok('graphThrew 具名;前三路读数仍在;nodes 取输入原容器');
});
test('v3326 D2. ★★★★ 第 4 路抛:前两路读数不丢(一路失败不升级成整次失败)', () => {
    assert.deepEqual(isolationJudge(GC).filter((x) => x.indexOf('第 4 路') >= 0), [], '第 4 路隔离');
    ok('orphanThrew 具名;前三路读数仍在;ops 不被改动');
});
test('v3326 D3. ★★★★ 闭包归因三态互不同形:缺席 null / 抛 具名 / 在场 读数', () => {
    assert.deepEqual(isolationJudge(GC).filter((x) => x.indexOf('dc ') >= 0 || x.indexOf('闭包') >= 0 || x.indexOf('cascade') >= 0), [], '闭包三态');
    ok('缺席 null ≠ 抛具名 ≠ 在场读数(「没测」不编 0)');
});

/* ══════════════ E. 宿主接线 ══════════════ */
test('v3326 E1. ★★★★ 取库口与常量空实现:缺席即如实记「没跑」,不保留第二份内联实现', () => {
    const P = hostJudge(IDX, MF);
    assert.deepEqual(P.filter((x) => x.indexOf('取库口') >= 0 || x.indexOf('缺席') >= 0 || x.indexOf('能力探测') >= 0), [], '取库口与缺席面');
    ok('取库口一处;缺席判能力而非对象在场');
});
test('v3326 E2. ★★★★ 注入面:五组键齐(数据一律注入,不吃宿主 this)', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('注入面') >= 0), [], '注入面');
    ok('五容器 + 两上限 + 时钟 + 楼层读数 + 三原语 + 归一化名 + 可选闭包');
});
test('v3326 E3. ★★★★ 写回与账本:五容器写回 + 五键读侧 + 三处异常具名留痕', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('写回') >= 0 || x.indexOf('账本') >= 0 || x.indexOf('埋点') >= 0 || x.indexOf('异常未留痕') >= 0), [], '写回与账本');
    ok('五容器写回;五键被读;三处异常各带独立 tag');
});
test('v3326 E4. ★★★ 落账口径逐字保留:五键 + 80 字符切换 + opLog 真实 API + 零删除不留噪', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('80 字符') >= 0 || x.indexOf('紧凑键') >= 0 || x.indexOf('opLog') >= 0 || x.indexOf('闸丢了') >= 0 || x.indexOf('零删除') >= 0), [], '落账口径');
    ok('_gcFull/_gcm 切换与 opLog.log(gc, remove, …) 一字未改');
});
test('v3326 E5. ★★★ 人读面:调试文案与缺省标签保留中文(不得退化成 ASCII 代号)', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('调试文案') >= 0 || x.indexOf('GC.缺席') >= 0), [], '人读面');
    ok('图谱去重 / 记忆优化 两处文案与四处标签仍是中文');
});
test('v3326 E6. ★★★★★ 真源唯一:宿主内联实现残留为零(两份实现必然漂)', () => {
    assert.deepEqual(hostJudge(IDX, MF).filter((x) => x.indexOf('内联实现残留') >= 0), [], '无内联残留');
    ok('五路算法体的特征串在宿主里一个都搜不到');
});

/* ══════════════ F. 真源码破坏负控制 ══════════════ */
test('v3326 F1. ★★★ 破坏 GC 第 1 路留数 ⇒ 五路判据当场现形', () => {
    const broken = breakOnce(GC_SRC, A_GC1, 'ledger.vecDup = 0;', 'F1');
    assert.notEqual(broken, GC_SRC, '破坏必须真改源码');
    assert.notDeepEqual(fiveWayJudge(loadIIFE(broken, 'LonShaMemoryGc')), [], '第 1 路留数被抹平必须翻红');
    assert.deepEqual(fiveWayJudge(GC), [], '原版上同判据必须真成立');
    ok('负控制成立:留数被抹平即红,原版仍绿');
});
test('v3326 F2. ★★★ 破坏第 5 路异常具名 ⇒ 隔离判据当场现形', () => {
    const broken = breakOnce(GC_SRC, A_GC2, 'graphThrew = null;', 'F2');
    assert.notDeepEqual(isolationJudge(loadIIFE(broken, 'LonShaMemoryGc')), [], '异常不再具名必须翻红');
    assert.deepEqual(isolationJudge(GC), [], '原版上同判据必须真成立');
    ok('负控制成立:异常被吞成 null 即红');
});
test('v3326 F3. ★★★ 破坏宿主缺席路径 ⇒ 「没跑」与「跑了零删」同形,当场现形', () => {
    const broken = breakOnce(IDX, A_IDX1, 'this._lastGcLedger = GC.blankLedger();', 'F3');
    assert.notDeepEqual(hostJudge(broken, MF), [], '缺席路径被改成零账本必须翻红');
    assert.deepEqual(hostJudge(IDX, MF), [], '原版上同判据必须真成立');
    ok('负控制成立:两态同形即红');
});
test('v3326 F4. ★★★ 破坏注入面归一化名 ⇒ 跨模块静默读旧值的形态当场现形', () => {
    const broken = breakOnce(IDX, A_IDX2, 'normalizeName: (x) => x,', 'F4');
    assert.notDeepEqual(hostJudge(broken, MF), [], '归一化名不再走唯一真源必须翻红');
    assert.deepEqual(hostJudge(IDX, MF), [], '原版上同判据必须真成立');
    ok('负控制成立:归一化名脱离宿主真源即红');
});
test('v3326 F5. ★★★ 破坏中文埋点 ⇒ 人读面判据当场现形', () => {
    const broken = breakOnce(IDX, A_IDX3, "errLog(new Error(_r.orphanThrew), 'HS.orphan-ops');", 'F5');
    assert.notDeepEqual(hostJudge(broken, MF), [], '埋点退化成 ASCII 代号必须翻红');
    assert.deepEqual(hostJudge(IDX, MF), [], '原版上同判据必须真成立');
    ok('负控制成立:标签退化成代号即红');
});

/* ══════════════ G. H5 判据纯度 + H6 工具两向自证 ══════════════ */
test('v3326 G1. ★★★ H5 判据纯度:五个破坏锚点字面量在本档各只声明一次', () => {
    for (const [nm, a] of [['A_GC1', A_GC1], ['A_GC2', A_GC2], ['A_IDX1', A_IDX1], ['A_IDX2', A_IDX2], ['A_IDX3', A_IDX3]]) {
        const n = SELF.split(a).length - 1;
        assert.equal(n, 1, nm + ' 在本档出现 ' + n + ' 次(纯度要求恰 1 次 —— 两处各写一份时改一处漏一处会恒过)');
    }
    for (const [nm, a, src] of [['A_GC1', A_GC1, GC_SRC], ['A_GC2', A_GC2, GC_SRC],
        ['A_IDX1', A_IDX1, IDX], ['A_IDX2', A_IDX2, IDX], ['A_IDX3', A_IDX3, IDX]]) {
        assert.equal(src.split(a).length - 1, 1, nm + ' 在真源上须恰中 1 次(0 次或多次 ⇒ 破坏打偏)');
    }
    ok('五个锚点:本档各 1 次、真源各恰中 1 次');
});
test('v3326 G2. ★★★ H6 工具两向自证:锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakOnce(GC_SRC, '__不存在__', 'x'), /恰中 1 次|命中 0 次/);
    assert.throws(() => breakOnce(GC_SRC, 'ledger.', 'x'), /恰中 1 次|要求恰好 1 次/, '多次锚点必抛');
    assert.throws(() => breakOnce(GC_SRC, A_GC1, A_GC1), /必须真的改变源码/);
    ok('0 次 / 不唯一 / 同值三形态各抛');
});

/* ══════════════ H. 自防护 + 三源 + 当版锚 ══════════════ */
const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
};
const BORN = '3.326.0';
test('v3326 H1. ★★★ 自防护 + 三源同源 + 当版锚点(供版本守卫 V4 计数)', () => {
    assert.ok(SELF.length > 8000, '本档自身不得被清空(实 ' + SELF.length + ' 字符)');
    assert.ok(SELF.includes('const BORN = ' + String.fromCharCode(39) + BORN + String.fromCharCode(39) + ';'), '当版锚点必须显式留在本档里');
    assert.equal(vnum(BORN), 3326000, 'vnum 序数必须可数');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立;当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源(须是 let)');
    }
    assert.ok(IDX.includes('const VERSION = '), 'index.js 版本常量在场');
    assert.ok(MF.extra_js.includes('memory-gc.js'), '本刀模块仍在分发面');
    ok('自防护 / 六源同源 / 当版锚 v' + BORN);
});