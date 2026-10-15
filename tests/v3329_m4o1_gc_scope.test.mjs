/* ============================================================
 * tests/v3329_m4o1_gc_scope.test.mjs — v3.329.0 · M4-O1 回收去重尊重身份、世界与事件范围
 *
 * 【要证明的:后台回收不再把「不同宇宙/不同事件的同名同文」当成重复永久删掉】
 *   修前实测:`memory-gc.js::mergeDuplicateCharacters` 只按归一化名分组;
 *   `dedupeByText` 只按 trim 后正文取较新一条 —— 事件 / 分支 / 宇宙 / 身份全不参与。
 *   后果是**不可逆**的:两条真实证据被抹成一条,边与出处搬到另一个身份上。
 *
 * 【四组直接跑真实 GC(计划验收口径)】
 *   1 跨宇宙同名   ⇒ **不合**(节点带各自宇宙戳,键上就分开)
 *   2 同宇宙同名异人 ⇒ **不合**(同宇宙 + 各自实体 id ⇒ 键不同)
 *   3 同实体别名(同会话、无 id、同文)⇒ **按身份合**(正常重复仍要能去重)
 *   4 同文不同分支 ⇒ **不互删**(向量带各自楼层 ⇒ 键不同;跨楼同文不是重复)
 *
 * 【三态不得塌格(空类问题)】
 *   未注入范围回调 ⇒ **逐字旧行为**(v3326 的历史套件不许被本刀改红);
 *   `undefined`(节点上无线索)⇒ 并入同名键(旧行为,不做行为突袭);
 *   `null` / 抛(有线索却判不了)⇒ **不参与**,并各留各的读数
 *   (`scope.blockedUnknownScope` / `scopeUnknown`)—— 判不了必须看得见,不得当成「同一件事」。
 *
 * 【宿主接线断言的边界(写清楚免得读成人格担保)】
 *   · 「四层线索兜取」(`metadata` / `data` / `scope`)与「注入两路范围回调」在**源码面**判在场
 *     (它们住在 `_gcScopeKey` / `optimizeMemory` 里,抽出来跑等于把真源抄进本档 —— 两份必然漂);
 *   · 「会话戳真的写进了新建条目」则**真跑**:`_gcScopeKey` 与 `_currentScopeStamp` 是自足方法,
 *     抽取后在**加载了真 memory-gc.js** 的环境里跑真 `runGc`。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 在**破坏副本**上重跑**同款真判据** → 必须现形;
 *   并反向对照「原版同判据必须通过」(H5 判据纯度 + H6 工具两向自证各一段)。
 *
 * 【边界(诚实)】
 *   1 本档判「同宇宙同名异人**在带 id 时**不合」:`entity-semantic` 里同宇宙同名**异人**的
 *      判定需要角色注册表(`resolveEntity`),而 GC 面拿到的只有节点 —— 故**不带 id 的两条同名
 *      节点仍按旧口径合并**(那是修前行为,本刀不偷偷改)。这一条**不**冒充「同宇宙同名异人已全解」。
 *   2 本档**不**声称真实宿主的 UI 操作、真实模型问答或全量门禁已过:`npm test` 全量与 `--audit`
 *      按用户纪律留到计划收口后跑一次;本档为定向复验。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const require_ = createRequire(import.meta.url);

/**
 * 破坏副本**落盘**后再读回(与 v3317 同规)。
 *   ★ 为什么不能直接把 `breakSource` 的返回串喂给判据:本档有两条破坏落**宿主 index.js**,
 *     而判据走「从源码串里抽方法体」这条路 —— 只把破坏串传给抽取器虽然也能翻红,
 *     却和真缺陷(`index.js` 在盘上被改坏)不是同一条路径。落盘 + 语法校验 + 读回,
 *     才证明「真源码破坏 → 真加载 → 真判据」整条链在场。
 */
function loadBroken(tag, rel, anchor, repl) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3329-' + tag + '-'));
    const src = read(rel);
    const broken = breakSource(src, anchor, repl, tag);
    assertSingleHit(src, anchor, tag);
    const fp = path.join(dir, path.basename(rel));
    fs.writeFileSync(fp, broken);
    const chk = require_('node:child_process').spawnSync(process.execPath, ['--check', fp], { encoding: 'utf8' });
    assert.equal(chk.status, 0, '破坏副本必须语法可过(否则归因不成立):' + String(chk.stderr).slice(-300));
    return fs.readFileSync(fp, 'utf8');
}

const IDX = read('index.js');
const GC_SRC = read('memory-gc.js');
const MF = JSON.parse(read('manifest.json'));
const PKG = JSON.parse(read('package.json'));
const SELF = read('tests/v3329_m4o1_gc_scope.test.mjs');
const BORN = '3.329.0';
const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
};

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
const normName = (s) => String(s || '').trim();

/* ══════════════ 抽取宿主自足方法(与 v3317 同一套抽取器) ══════════════ */
function methodBody(src, header) {
    const at = src.indexOf(header);
    if (at < 0) return null;
    const close = src.indexOf(')', at);
    if (close < 0) return null;
    const open = src.indexOf('{', close);
    if (open < 0) return null;
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? src.slice(at, end + 1) : null;
}
const SCOPE_METHODS = ['_gcScopeKey(meta) {', '_currentScopeStamp(msg) {', '_scopeData(extra) {'];
/**
 * 真 `optimizeMemory` 里必须替换的三处(**其余一字不动**)。
 *   ★ 为什么必须抽**真**方法而不是在判据里拼一个:`vectorScopeOf` / `nodeScopeOf` 这两个
 *     注入口就住在真方法体里 —— 判据自己拼一份注入,「注入被摘」的负控制就会被绕过而**假绿**
 *     (本档第一版实测踩到的坑:摘掉真源码里的注入行,判据照旧绿)。
 */
const OPT_SUBS = [
    ['const GC = _memoryGcLib();', 'const GC = _gcLib();'],
    ["dependencyClosure: _moduleLib(() => window.LonShaDependencyClosure, 'dependency-closure.js'),", 'dependencyClosure: null,'],
    /* ★ 归一化名的真源 `normalizeCharName` 由 `engineFrom` 的 **new Function 形参**按原名注入。
     *   这里**不做**替换 —— 改前那版把它换成测试档模块级的 `normName`,而那个符号不在
     *   new Function 的参数面里,真方法一跑就抛 `ReferenceError`(本档第三版实测踩到的坑):
     *   抽取真方法时**只能注入它原本就有的名字**,换名等于把它挂到不存在的符号上。 */
    ['return _r.removed;', 'this._lastR = _r; return _r.removed;'],
];
/**
 * 宿主回收面(**两个真方法 + 真 optimizeMemory 方法体** + 真 `memory-gc.js`)。
 *   注入的三处替换逐处断言命中恰 1 次 —— 替换打偏时判据面必须失效而非静默放过。
 *   归一化名是**注入**项(v3326 判据面钉住真源),本档给它与那一档同形的 trim 版。
 */
function engineFrom(src, opt) {
    const o = opt || {};
    const NL = String.fromCharCode(10);
    const bodies = SCOPE_METHODS.map((h) => methodBody(src, h));
    if (bodies.some((b) => b === null)) {
        throw new Error('宿主范围方法抽取失败(接线被摘或改名):判据扫描面失效');
    }
    let optBody = methodBody(src, 'optimizeMemory() {');
    if (!optBody) throw new Error('宿主 optimizeMemory 抽取失败:判据扫描面失效');
    for (const [a, b] of OPT_SUBS) {
        const hit = optBody.split(a).length - 1;
        if (hit !== 1) throw new Error('optimizeMemory 替换锚点命中 ' + hit + ' 次(须恰 1 次):' + a.slice(0, 40));
        optBody = optBody.replace(a, b);
    }
    const eng = new Function('_gcLib', 'chatId', 'GC', 'errLog', 'PLUGIN_NAME',
        'normalizeCharName', 'msgFpOf', 'hash32', '_moduleLib',
        'const window = {};'
        + 'const eng = {'
        + bodies.join(',' + NL) + ',' + NL
        + 'getCurrentChatId() { return chatId; },' + NL
        + '_lastProject: null, _lastR: null, _currentFloor: null,' + NL
        + optBody + NL
        + '};' + NL
        + 'return eng;'
    )(() => GC, o.chatId === undefined ? 'chat-A' : o.chatId, GC,
        () => {}, 'v3329', (s) => String(s || '').trim(), () => 'fp', () => 0, () => null);
    eng._lastProject = o.project || null;
    return eng;
}
/**
 * 走**真 `optimizeMemory`** 的回收调用面:输入放进宿主容器 → 跑真方法 → 取回执。
 *   判据只描述「喂进去什么」,「怎么注入范围」一律由真方法体决定。
 */
const gcRun = (e, d) => {
    e.config = e.config || { config: {} };
    e.vector = { vectors: Array.isArray(d.vectors) ? d.vectors : [] };
    e.summary = { summaries: Array.isArray(d.summarySummaries) ? d.summarySummaries : [] };
    e.itemOps = Array.isArray(d.itemOps) ? d.itemOps : [];
    e.graph = {
        nodes: (d.graphNodes instanceof Map) ? d.graphNodes : new Map(),
        edges: (d.graphEdges instanceof Map) ? d.graphEdges : new Map(),
        rebuildNameIndex() {},
    };
    e.optimizeMemory();
    return e._lastR;
};

/* ══════════════ 判据体 ══════════════ */

/** 1 跨宇宙同名 ⇒ 不合(节点带各自宇宙戳)。 */
function crossUniverseJudge(eng) {
    const P = [];
    const nodes = new Map([
        ['n1', { id: 'n1', type: 'character', name: '林安', timestamp: 10, data: { universe: 'u1x' } }],
        ['n2', { id: 'n2', type: 'character', name: '林安', timestamp: 20, data: { universe: 'u2x' } }],
    ]);
    const r = gcRun(eng, { graphNodes: nodes, graphEdges: new Map(), normalizeName: normName });
    if (r.ledger.graphDup !== 0) P.push('跨宇宙同名被合并了:' + r.ledger.graphDup);
    if (r.nodes.size !== 2) P.push('跨宇宙同名后节点少了:' + r.nodes.size);
    if (r.scope.nodeKnown !== 2) P.push('两条带宇宙的节点须都算「可判范围」,实 ' + r.scope.nodeKnown);
    return P;
}
/** 2 同宇宙同名异人(各自 id)⇒ 不合;同宇宙同名同一 id ⇒ 合。 */
function sameScopeJudge(eng) {
    const P = [];
    const two = new Map([
        ['a1', { id: 'a1', type: 'character', name: '苏晴', timestamp: 10, data: { universe: 'u1', entityId: 'E1' } }],
        ['a2', { id: 'a2', type: 'character', name: '苏晴', timestamp: 20, data: { universe: 'u1', entityId: 'E2' } }],
    ]);
    const r2 = gcRun(eng, { graphNodes: two, graphEdges: new Map(), normalizeName: normName });
    if (r2.ledger.graphDup !== 0) P.push('同宇宙同名异人(两个 id)被合并了:' + r2.ledger.graphDup);
    if (r2.nodes.size !== 2) P.push('同宇宙同名异人节点少了:' + r2.nodes.size);
    const one = new Map([
        ['b1', { id: 'b1', type: 'character', name: '苏晴', timestamp: 10, data: { universe: 'u1', entityId: 'E9' } }],
        ['b2', { id: 'b2', type: 'character', name: '苏晴', timestamp: 20, data: { universe: 'u1', entityId: 'E9' } }],
    ]);
    const r1 = gcRun(eng, { graphNodes: one, graphEdges: new Map(), normalizeName: normName });
    if (r1.ledger.graphDup !== 1) P.push('同宇宙同 id 的真重复没合:' + r1.ledger.graphDup);
    if (r1.dupIds.map((x) => x.keepId + '>' + x.dropId).join(',') !== 'b1>b2') {
        P.push('同 id 合并保留的不是更早创建的那个:' + JSON.stringify(r1.dupIds));
    }
    return P;
}
/** 3 同实体别名 / 无线索 ⇒ 仍按身份合(不因新面而停止回收)。 */
function mergeStillWorksJudge(eng) {
    const P = [];
    /* 同一会话戳(两条都带同一宇宙)⇒ 键相同 ⇒ 合。 */
    const stamped = new Map([
        ['s1', { id: 's1', type: 'character', name: '玥', timestamp: 10, data: { universe: 'chat:chat-A' } }],
        ['s2', { id: 's2', type: 'character', name: '玥', timestamp: 20, data: { universe: 'chat:chat-A' } }],
    ]);
    const rs = gcRun(eng, { graphNodes: stamped, graphEdges: new Map(), normalizeName: normName });
    if (rs.ledger.graphDup !== 1) P.push('同范围真重复没合(范围面把回收整个关掉了):' + rs.ledger.graphDup);
    /* 无线索(undefined)⇒ 并入同名键:旧行为,不做行为突袭。 */
    const bare = new Map([
        ['t1', { id: 't1', type: 'character', name: '玥', timestamp: 10 }],
        ['t2', { id: 't2', type: 'character', name: '玥', timestamp: 20 }],
    ]);
    const rb = gcRun(eng, { graphNodes: bare, graphEdges: new Map(), normalizeName: normName });
    if (rb.ledger.graphDup !== 1) P.push('无线索条目不再按名合并(行为突袭):' + rb.ledger.graphDup);
    if (rb.scope.nodeUnknown !== 0) P.push('无线索**不得**计入「判不了」:' + rb.scope.nodeUnknown);
    /* 混合:一条带戳、一条不带 ⇒ 不同键 ⇒ 不合(带的按范围、不带的按名键,恰好不同)。 */
    const mixed = new Map([
        ['m1', { id: 'm1', type: 'character', name: '玥', timestamp: 10, data: { universe: 'chat:chat-A' } }],
        ['m2', { id: 'm2', type: 'character', name: '玥', timestamp: 20 }],
    ]);
    const rm = gcRun(eng, { graphNodes: mixed, graphEdges: new Map(), normalizeName: normName });
    if (rm.ledger.graphDup !== 0) P.push('带戳与不带戳的两条不应对撞合并:' + rm.ledger.graphDup);
    return P;
}
/** 4 同文不同分支(楼层)⇒ 不互删;同楼同文 ⇒ 仍去重。 */
function vectorScopeJudge(eng) {
    const P = [];
    const v2 = [
        { text: '她把信折好放回抽屉', timestamp: 100, metadata: { floor: 3, scope: { universe: 'chat:chat-A' } } },
        { text: '她把信折好放回抽屉', timestamp: 200, metadata: { floor: 9, scope: { universe: 'chat:chat-A' } } },
    ];
    const r2 = gcRun(eng, { vectors: v2, graphNodes: new Map(), graphEdges: new Map(), normalizeName: normName });
    if (r2.ledger.vecDup !== 0) P.push('跨楼层同文被互删了:' + r2.ledger.vecDup);
    if (r2.vectors.length !== 2) P.push('跨楼层同文后条数少了:' + r2.vectors.length);
    const v1 = [
        { text: '她把信折好放回抽屉', timestamp: 100, metadata: { floor: 3, scope: { universe: 'chat:chat-A' } } },
        { text: '她把信折好放回抽屉', timestamp: 200, metadata: { floor: 3, scope: { universe: 'chat:chat-A' } } },
    ];
    const r1 = gcRun(eng, { vectors: v1, graphNodes: new Map(), graphEdges: new Map(), normalizeName: normName });
    if (r1.ledger.vecDup !== 1) P.push('同楼同文的重复没去:' + r1.ledger.vecDup);
    if (r1.vectors.length !== 1 || r1.vectors[0].timestamp !== 200) P.push('同楼同文留下的不是较新那条');
    return P;
}
/** 5 三态:未注入 ⇒ 逐字旧行为;null / 抛 ⇒ 不参与且留读数。 */
function threeStateJudge(eng) {
    const P = [];
    /* 未注入范围回调 ⇒ 旧的纯文本去重(不传参就完全不碰新面)。 */
    const legacy = GC.dedupeByText([{ text: '甲', timestamp: 1 }, { text: '甲', timestamp: 2 }]);
    if (legacy.dropped !== 1) P.push('未注入范围时不再按旧口径去重:' + legacy.dropped);
    if (legacy.scopeKnown !== 0 || legacy.scopeUnknown !== 0) P.push('未注入时不该有范围读数');
    /* `undefined` ⇒ 同名键(旧行为);`null` / 抛 ⇒ 各自独立键 + 各自读数。 */
    const undef = GC.dedupeByText(
        [{ text: '甲', timestamp: 1 }, { text: '甲', timestamp: 2 }],
        () => { return undefined; });
    if (undef.dropped !== 1) P.push('undefined 应并入同名键(旧行为),实 dropped=' + undef.dropped);
    const nul = GC.dedupeByText(
        [{ text: '甲', timestamp: 1 }, { text: '甲', timestamp: 2 }], () => null);
    if (nul.dropped !== 0) P.push('判不了范围时不得去重:' + nul.dropped);
    if (nul.scopeUnknown !== 2) P.push('判不了须逐条计数,实 ' + nul.scopeUnknown);
    const boom = GC.dedupeByText([{ text: '甲', timestamp: 1 }], () => { throw new Error('x'); });
    if (boom.scopeUnknown !== 1) P.push('范围回调抛异常须按「判不了」收口,实 ' + boom.scopeUnknown);
    /* 图谱侧同一把尺子:`null` / `''` ⇒ 拒绝合并并计数;`undefined` ⇒ 旧行为。 */
    const nodes = new Map([
        ['p1', { id: 'p1', type: 'character', name: '甲', timestamp: 1 }],
        ['p2', { id: 'p2', type: 'character', name: '甲', timestamp: 2 }],
    ]);
    const blk = GC.mergeDuplicateCharacters(nodes, new Map(), normName, () => null);
    if (blk.merged !== 0) P.push('判不了范围时不得合并同名角色:' + blk.merged);
    if (blk.blockedUnknownScope !== 2) P.push('拒绝合并须逐条计数,实 ' + blk.blockedUnknownScope);
    const emp = GC.mergeDuplicateCharacters(nodes, new Map(), normName, () => '');
    if (emp.merged !== 0 || emp.blockedUnknownScope !== 2) P.push('空串按「判不了」收口(与 null 同规)');
    const un = GC.mergeDuplicateCharacters(nodes, new Map(), normName, () => { return undefined; });
    if (un.merged !== 1) P.push('undefined 应保留旧的按名合并:' + un.merged);
    /* 旧调用签名(三参)逐字不变。 */
    const oldSig = GC.mergeDuplicateCharacters(nodes, new Map(), normName);
    if (oldSig.merged !== 1) P.push('三参旧调用签名行为变了:' + oldSig.merged);
    return P;
}
/** 6 会话戳真写进新建条目 + 边归其主(抽查)。 */
function stampJudge(eng) {
    const P = [];
    const st = eng._currentScopeStamp();
    if (!st || st.universe !== 'chat:chat-A') P.push('会话戳没按会话 id 派生:' + JSON.stringify(st));
    const noChat = engineFrom(IDX, { chatId: '' });
    if (noChat._currentScopeStamp() !== null) P.push('取不到会话 id 时须给 null(不许编一个假宇宙)');
    /* 建节点走**真派生方法**(三处建节点都用的同一个点)。 */
    const data = eng._scopeData({ source: 's' });
    if (data.universe !== 'chat:chat-A') P.push('新建节点未带上会话戳:' + JSON.stringify(data));
    if (data.source !== 's') P.push('派生层丢了原有字段(source 被覆盖)');
    /* 无会话 ⇒ 显式 `scope:null`(不是留空)——否则「判不了」在生产上不可达。 */
    const noneData = noChat._scopeData({ source: 's' });
    if (!Object.prototype.hasOwnProperty.call(noneData, 'scope') || noneData.scope !== null) {
        P.push('无会话时未显式落 scope:null:' + JSON.stringify(noneData));
    }
    const node = { id: 'z1', type: 'character', name: '甲', data };
    /* 带戳节点 ⇒ 回收面认它「可判范围」。 */
    const r = gcRun(eng, { graphNodes: new Map([['z1', node]]), graphEdges: new Map(), normalizeName: normName });
    if (r.scope.nodeKnown !== 1) P.push('打了戳的节点未算「可判范围」:' + r.scope.nodeKnown);
    /* 显式 scope:null 的节点 ⇒ 回收面必须拒绝合并并留读数(生产可达的「判不了」)。 */
    const z1 = { id: 'z1', type: 'character', name: '甲', timestamp: 1, data: noneData };
    const z2 = { id: 'z2', type: 'character', name: '甲', timestamp: 2, data: noneData };
    const ru = gcRun(noChat, {
        graphNodes: new Map([['z1', z1], ['z2', z2]]), graphEdges: new Map(), normalizeName: normName,
    });
    if (ru.ledger.graphDup !== 0) P.push('身份判不了的两条同名节点被合了:' + ru.ledger.graphDup);
    if (ru.scope.nodeUnknown !== 2) P.push('判不了须逐条计数,实 ' + ru.scope.nodeUnknown);
    /* 换会话 ⇒ 同一个名字不再对撞(跨宇宙误合在结构上不可能)。 */
    const engB = engineFrom(IDX, { chatId: 'chat-B' });
    const rb = gcRun(engB, {
        graphNodes: new Map([['z1', node]]), graphEdges: new Map(), normalizeName: normName,
    });
    if (rb.scope.nodeKnown !== 1) P.push('另一会话读同一节点须仍可判范围');
    return P;
}
/** 8 项目轴与分支轴:条目自身的项目出处 / 同楼重生成必须是**两个分开的维度**。 */
function axisJudge(eng) {
    const P = [];
    /* 项目轴:同会话、同名字、**两个项目** ⇒ 不合;同一项目 ⇒ 照旧合。 */
    const two = new Map([
        ['p1', { id: 'p1', type: 'character', name: '林安', timestamp: 10, data: { universe: 'chat:chat-A', projectId: 'P1' } }],
        ['p2', { id: 'p2', type: 'character', name: '林安', timestamp: 20, data: { universe: 'chat:chat-A', projectId: 'P2' } }],
    ]);
    const r2 = gcRun(eng, { graphNodes: two, graphEdges: new Map(), normalizeName: normName });
    if (r2.ledger.graphDup !== 0) P.push('同会话两个项目的同名角色被合了:' + r2.ledger.graphDup);
    const one = new Map([
        ['q1', { id: 'q1', type: 'character', name: '林安', timestamp: 10, data: { universe: 'chat:chat-A', projectId: 'P1' } }],
        ['q2', { id: 'q2', type: 'character', name: '林安', timestamp: 20, data: { universe: 'chat:chat-A', projectId: 'P1' } }],
    ]);
    const r1 = gcRun(eng, { graphNodes: one, graphEdges: new Map(), normalizeName: normName });
    if (r1.ledger.graphDup !== 1) P.push('同一项目内的真重复没合:' + r1.ledger.graphDup);
    /* 分支轴:同楼**重生成**换页 ⇒ 指纹不同 ⇒ 不互删;同楼同页 ⇒ 去重。 */
    const vy = [
        { text: '雨停了她才开口', timestamp: 100, metadata: { floor: 7, fp: 'a|0|h1|t1', scope: { universe: 'chat:chat-A' } } },
        { text: '雨停了她才开口', timestamp: 200, metadata: { floor: 7, fp: 'a|1|h2|t2', scope: { universe: 'chat:chat-A' } } },
    ];
    const ry = gcRun(eng, { vectors: vy, graphNodes: new Map(), graphEdges: new Map(), normalizeName: normName });
    if (ry.ledger.vecDup !== 0) P.push('同楼重生成的同文被互删了:' + ry.ledger.vecDup);
    const vn = [
        { text: '雨停了她才开口', timestamp: 100, metadata: { floor: 7, fp: 'a|0|h1|t1', scope: { universe: 'chat:chat-A' } } },
        { text: '雨停了她才开口', timestamp: 200, metadata: { floor: 7, fp: 'a|0|h1|t1', scope: { universe: 'chat:chat-A' } } },
    ];
    const rn = gcRun(eng, { vectors: vn, graphNodes: new Map(), graphEdges: new Map(), normalizeName: normName });
    if (rn.ledger.vecDup !== 1) P.push('同楼同页的重复没去:' + rn.ledger.vecDup);
    return P;
}
/** 7 边归其主:跨宇宙不合 ⇒ 边一条都不搬。 */
function edgeJudge(eng) {
    const P = [];
    const nodes = new Map([
        ['n1', { id: 'n1', type: 'character', name: '林安', timestamp: 10, data: { universe: 'u1x' } }],
        ['n2', { id: 'n2', type: 'character', name: '林安', timestamp: 20, data: { universe: 'u2x' } }],
    ]);
    const edges = new Map([
        ['e1', { id: 'e1', from: 'n1', to: 'n2', label: 'knows' }],
    ]);
    const r = gcRun(eng, { graphNodes: nodes, graphEdges: edges, normalizeName: normName });
    if (r.edges.size !== 1) P.push('不合时边集变了:' + r.edges.size);
    if ([...r.edges.values()][0].to !== 'n2') P.push('不合时边被重定向了(出世乱了)');
    return P;
}

/* ══════════════ 负控制锚点(判据层各只声明一次 —— H5) ══════════════
 *   注意:两条去重路的 `const sc = ...` 首行**逐字相同**,故锚点必须带上各自
 *   下一行(否则锚点在真源里命中 2 次,破坏会打偏。这是本档第一版实测踩到的坑)。 */
const A_GC_VEC = "const sc = (typeof scopeOf === 'function') ? scopeOf : null;\n        const seen = new Map();";
const A_GC_NODE = "const sc = (typeof scopeOf === 'function') ? scopeOf : null;\n        const outNodes = new Map(nodeMap);";
const A_GC_UNK = "scopeUnknown += 1; k = key + '\\u0000~unknown~' + String(scopeUnknown);";
const A_IDX_INJECT = 'vectorScopeOf: _scopeOf, nodeScopeOf: _scopeOf,';
const A_IDX_STAMP = 'scope: this._currentScopeStamp(message),';
/** 项目轴 / 分支轴 / 显式判不了:三条都是 v3.329.0 后补的真实维度,各自配一条负控制。 */
const A_IDX_PROJ = 'if (pid) parts.push(\'p:\' + pid);';
const A_IDX_BRANCH = 'if (fp) parts.push(\'g:\' + fp);';
const A_IDX_UNKNOWN = "if (b && Object.prototype.hasOwnProperty.call(b, 'scope') && b.scope === null) return null;";

/** 宿主接线判据(**源码面**):四层线索兜取 / 两路注入 / 会话戳三处写入 / 项目读数带宇宙。
 *   ★ 为什么这四项只在源码面判:`optimizeMemory` 与范围方法体已由 `engineFrom` 抽取真跑,
 *     但「向量写入点打戳」住在消息接收路径(`onMessageReceived`,数千行)里 ——
 *     把它整段抽出来跑等于把宿主主循环抬进判据,且那条路径的依赖面远超本刀主题。
 *     故该项按**在场 + 表达式逐字**判,并配真源码破坏负控制(F1/F2)。 */
function hostJudge(src) {
    const P = [];
    for (const box of ['m.metadata', 'm.scope', 'm.data']) {
        if (src.indexOf(box) < 0) P.push('范围线索未兜取 ' + box);
    }
    if (src.indexOf('const _scopeOf = (o) => this._gcScopeKey(o);') < 0) P.push('未生成共用范围回调');
    if (src.indexOf(A_IDX_INJECT) < 0) P.push('两路范围回调未注入(算法接口悬空 = 产品面仍按旧口径删)');
    const stampUses = src.split('_currentScopeStamp').length - 1;
    if (stampUses < 4) P.push('会话戳写入点不足(定义 1 + 派生层 1 + 向量 1 + 说明),实 ' + stampUses);
    if (src.indexOf(A_IDX_STAMP) < 0) P.push('向量未打会话戳(换会话后第 0 楼会对撞另一个会话的第 0 楼)');
    if (src.indexOf("universe: (np.project && np.project.universe) || '',") < 0) P.push('项目读数未携带宇宙(细界少了唯一的真源)');
    /* v3.329.0 补:三处建角色节点都必须走**同一个派生点**(少一处 ⇒ 那类节点退回按名合)。 */
    const scopeDataUses = src.split('data: this._scopeData(').length - 1;
    if (scopeDataUses !== 3) P.push('三处角色节点须都走 _scopeData,实 ' + scopeDataUses);
    /* 项目轴(条目自身的项目出处)与分支轴(同楼重生成)必须在键里各占一格。 */
    if (src.indexOf(A_IDX_PROJ) < 0) P.push('范围键缺项目轴(同会话内两个项目的同名角色仍会被合)');
    if (src.indexOf(A_IDX_BRANCH) < 0) P.push('范围键缺分支轴(同楼重生成的新旧正文会被当重复永删)');
    if (src.indexOf(A_IDX_UNKNOWN) < 0) P.push('「写戳时无会话」未接成显式判不了(模块侧 null 分支在生产上不可达)');
    return P;
}

/* ══════════════ 四组验收(真跑) ══════════════ */
test('v3329 S1. ★★★★★ 跨宇宙同名**不合**:两条各自宇宙的节点进出仍是两条', () => {
    assert.deepEqual(crossUniverseJudge(engineFrom(IDX)), [], '跨宇宙判据');
    ok('同名跨宇宙:graphDup=0 / 节点 2 条 / nodeKnown=2');
});
test('v3329 S2. ★★★★★ 同宇宙同名异人(各自 id)**不合**;同 id 的真重复仍合', () => {
    assert.deepEqual(sameScopeJudge(engineFrom(IDX)), [], '同宇宙判据');
    ok('E1/E2 不合;E9/E9 合且保留更早创建的那个');
});
test('v3329 S3. ★★★★★ 回收**没有被关掉**:同范围真重复照合、无线索仍按名合(不做行为突袭)', () => {
    assert.deepEqual(mergeStillWorksJudge(engineFrom(IDX)), [], '真重复判据');
    ok('同戳 ⇒ 合 1;无线索 ⇒ 合 1 且不计「判不了」;一戳一无 ⇒ 不对撞');
});
test('v3329 S4. ★★★★★ 同文不同分支**不互删**;同楼同文仍去重(事件范围参与回收)', () => {
    assert.deepEqual(vectorScopeJudge(engineFrom(IDX)), [], '向量范围判据');
    ok('floor 3 vs 9 ⇒ vecDup=0;floor 3 vs 3 ⇒ vecDup=1 且留较新');
});
test('v3329 S5. ★★★★★ 三态不得塌格:未注入=旧行为 / undefined=旧行为 / null 与抛=不参与且留读数', () => {
    assert.deepEqual(threeStateJudge(engineFrom(IDX)), [], '三态判据');
    ok('两条去重路同规:未注入与 undefined 走旧行为;判不了各自计数、不静默当成同一件事');
});
test('v3329 S6. ★★★★ 会话戳真写进新建条目:按会话 id 派生、取不到给 null、换会话即换宇宙', () => {
    assert.deepEqual(stampJudge(engineFrom(IDX)), [], '会话戳判据');
    ok('chat-A ⇒ chat:chat-A;空会话 ⇒ null;打了戳的节点被回收面认作可判范围');
});
test('v3329 S7. ★★★★ 边归其主:跨宇宙不合时一条边都不搬、不重定向', () => {
    assert.deepEqual(edgeJudge(engineFrom(IDX)), [], '边归属判据');
    ok('不合 ⇒ 边集与端点均不变');
});
test('v3329 S8. ★★★★★ 项目轴与分支轴是两个分开的维度:同会话跨项目不合 / 同楼重生成不互删', () => {
    assert.deepEqual(axisJudge(engineFrom(IDX)), [], '轴分离判据');
    ok('P1 vs P2 ⇒ 不合;同项目 ⇒ 合;同楼换页 ⇒ vecDup=0;同楼同页 ⇒ vecDup=1');
});

/* ══════════════ 宿主接线(源码面 + 真跑) ══════════════ */
test('v3329 H1. ★★★★★ 宿主接线:四层线索兜取 + 两路注入同一份口径 + 会话戳写入三处 + 项目读数带宇宙', () => {
    assert.deepEqual(hostJudge(IDX), [], '宿主接线判据');
    ok('四层兜取 / 两路注入 / 三处写入 / 项目读数带宇宙');
});
test('v3329 H2. ★★★★ 登记面与同源:memory-gc.js 仍在 extra_js;六源版本同源', () => {
    assert.equal(MF.extra_js.filter((x) => x === 'memory-gc.js').length, 1, 'memory-gc.js 须恰登记一次');
    assert.equal(MF.extra_js[0], 'ledger-entity.js', 'ledger-entity.js 仍须在 extra_js 首位(v3.207 不变量)');
    ok('分发面 ' + MF.extra_js.length + ' 项,memory-gc.js 恰一次且非首位');
});
test('v3329 H3. ★★★ 历史兼容:未注入范围时两条去重路逐字回到旧行为(v3326 判据面不许被本刀改红)', () => {
    /* 与 v3326 完全相同的输入:期望读数必须与那一档一致。 */
    const vectors = [{ text: '甲', timestamp: 100 }, { text: '甲', timestamp: 200 }, { text: '乙', timestamp: 300 }];
    const nodes = new Map([
        ['n1', { id: 'n1', type: 'character', name: '苏晴', timestamp: 10 }],
        ['n2', { id: 'n2', type: 'character', name: '苏晴', timestamp: 20 }],
    ]);
    const r = GC.runGc({ vectors, graphNodes: nodes, graphEdges: new Map(), normalizeName: normName });
    assert.equal(r.ledger.vecDup, 1, '旧口径:同文本去重');
    assert.equal(r.ledger.graphDup, 1, '旧口径:同名合并');
    assert.equal(r.scope.vecKnown, 0, '未注入时范围读数为 0');
    assert.equal(r.scope.nodeKnown, 0, '未注入时范围读数为 0');
    ok('旧调用方零行为变化(范围读数如实为 0)');
});

/* ══════════════ 负控制(真源码破坏) ══════════════ */
test('v3329 F1. ★★★★ 破坏「向量范围注入」⇒ 跨分支同文再次互删,当场现形', () => {
    const broken = loadBroken('F1', 'index.js', A_IDX_INJECT, '/* 范围注入被摘 */');
    const P = vectorScopeJudge(engineFrom(broken));
    assert.notDeepEqual(P, [], '注入被摘后跨楼层同文必须再次互删');
    assert.deepEqual(vectorScopeJudge(engineFrom(IDX)), [], '原版上同判据必须真成立');
    ok('负控制成立:注入被摘即红,原版仍绿');
});
test('v3329 F2. ★★★★ 破坏向量侧会话戳 ⇒ 跨会话第 0 楼相撞的形态当场现形', () => {
    const broken = loadBroken('F2', 'index.js', A_IDX_STAMP, '/* 戳被摘 */');
    assert.notDeepEqual(hostJudge(broken), [], '向量写入点不带戳必须翻红');
    assert.deepEqual(hostJudge(IDX), [], '原版上同判据必须真成立');
    /* 补一条真行为面:有戳/无戳的两种条目在**真 GC** 上确实分得开(判据不是纯文本在场)。 */
    const v = (extra) => Object.assign({ text: '同文', timestamp: 1, metadata: { floor: 0 } }, extra || {});
    const eng = engineFrom(IDX);
    const r0 = gcRun(eng, { vectors: [v(), v()], graphNodes: new Map(), graphEdges: new Map() });
    const r1 = gcRun(eng, {
        vectors: [v({ scope: { universe: 'chat:chat-A' } }), v({ scope: { universe: 'chat:chat-B' } })],
        graphNodes: new Map(), graphEdges: new Map(),
    });
    assert.equal(r0.ledger.vecDup, 1, '同一会话同楼的两条同文须去重(旧口径仍成立)');
    assert.equal(r1.ledger.vecDup, 0, '两个会话的同楼同文不是重复(戳真参与判定)');
    ok('负控制成立:向量戳被摘即红;真行为面证明戳确实改变判定');
});
test('v3329 F3. ★★★★ 破坏「判不了 ⇒ 不参与」⇒ 同名异人再次被抹平,当场现形', () => {
    const broken = loadBroken('F3', 'memory-gc.js', A_GC_VEC, 'const sc = null;\n        const seen = new Map();');
    const G = loadIIFE(broken, 'LonShaMemoryGc');
    const nul = G.dedupeByText([{ text: '甲', timestamp: 1 }, { text: '甲', timestamp: 2 }], () => null);
    assert.notEqual(nul.dropped, 0, '判不了范围时仍去重必须翻红');
    const nodes = new Map([
        ['p1', { id: 'p1', type: 'character', name: '甲', timestamp: 1 }],
        ['p2', { id: 'p2', type: 'character', name: '甲', timestamp: 2 }],
    ]);
    assert.equal(GC.mergeDuplicateCharacters(nodes, new Map(), normName, () => null).merged, 0, '原版上必须真拒绝合并');
    ok('负控制成立:判不了不再是「同一件事」');
});
test('v3329 F4. ★★★★ 破坏「判不了要看得见」⇒ 静默不合(用户拿不到任何读数),当场现形', () => {
    const broken = loadBroken('F4', 'memory-gc.js', A_GC_UNK, 'k = key;');
    const G = loadIIFE(broken, 'LonShaMemoryGc');
    const nul = G.dedupeByText([{ text: '甲', timestamp: 1 }, { text: '甲', timestamp: 2 }], () => null);
    assert.equal(nul.scopeUnknown, 0, '破坏后读数必须归零(才能证明这条判据真绑在读数上)');
    assert.notEqual(GC.dedupeByText([{ text: '甲', timestamp: 1 }], () => null).scopeUnknown, 0, '原版上读数必须非零');
    ok('负控制成立:判不了而不计数 ⇒ 现形');
});
test('v3329 F5. ★★★ 破坏图谱侧范围注入 ⇒ 跨宇宙同名再次被合,当场现形', () => {
    const broken = loadBroken('F5', 'memory-gc.js', A_GC_NODE,
        'const sc = null;\n        const outNodes = new Map(nodeMap);');
    const G = loadIIFE(broken, 'LonShaMemoryGc');
    const nodes = () => new Map([
        ['n1', { id: 'n1', type: 'character', name: '林安', timestamp: 10 }],
        ['n2', { id: 'n2', type: 'character', name: '林安', timestamp: 20 }],
    ]);
    assert.equal(G.mergeDuplicateCharacters(nodes(), new Map(), normName, () => 'u1').merged, 1,
        '破坏后两节点被合(证明该判据真绑图谱侧)');
    assert.equal(GC.mergeDuplicateCharacters(nodes(), new Map(), normName, () => 'u1').merged, 1,
        '原版上同范围两条真重复也必须合(对照非空)');
    /* 真差异在「跨宇宙」这一组:原版不合、破坏版合。 */
    const cross = (G2) => {
        const r = G2.mergeDuplicateCharacters(new Map([
            ['n1', { id: 'n1', type: 'character', name: '林安', timestamp: 10 }],
            ['n2', { id: 'n2', type: 'character', name: '林安', timestamp: 20 }],
        ]), new Map(), normName, (n) => (n.id === 'n1' ? 'u1' : 'u2'));
        return r.merged;
    };
    assert.equal(cross(GC), 0, '原版:跨宇宙不得合');
    assert.equal(cross(G), 1, '破坏后:跨宇宙被合了(判据真绑在注入上)');
    ok('负控制成立:图谱侧范围被摘即退化为按名合');
});

test('v3329 F6. ★★★★ 破坏项目轴 ⇒ 同会话跨项目同名被合,当场现形', () => {
    const broken = loadBroken('F6', 'index.js', A_IDX_PROJ, '/* 项目轴被摘 */');
    const P = axisJudge(engineFrom(broken));
    assert.ok(P.some((x) => x.includes('两个项目')), '项目轴被摘后同会话跨项目必须被合:' + JSON.stringify(P));
    assert.deepEqual(axisJudge(engineFrom(IDX)), [], '原版上同判据必须真成立');
    ok('负控制成立:项目轴被摘即红,原版仍绿');
});
test('v3329 F7. ★★★★ 破坏分支轴 ⇒ 同楼重生成的旧正文被当重复永删,当场现形', () => {
    const broken = loadBroken('F7', 'index.js', A_IDX_BRANCH, '/* 分支轴被摘 */');
    const P = axisJudge(engineFrom(broken));
    assert.ok(P.some((x) => x.includes('重生成')), '分支轴被摘后同楼换页必须被互删:' + JSON.stringify(P));
    assert.deepEqual(axisJudge(engineFrom(IDX)), [], '原版上同判据必须真成立');
    ok('负控制成立:分支轴被摘即红,原版仍绿');
});
test('v3329 F8. ★★★★ 破坏「显式判不了」⇒ 无会话的新条目退回旧口径合并(生产上不再保守)', () => {
    const broken = loadBroken('F8', 'index.js', A_IDX_UNKNOWN, '/* 显式判不了被摘 */');
    const G = engineFrom(broken);
    const noChatB = engineFrom(broken, { chatId: '' });
    const noneData = noChatB._scopeData({ source: 's' });
    /* ★ 写侧(`_scopeData` 的 `else out.scope = null`)不是本锚点破坏的对象:**必须仍在**。
     *   本锚点破坏的是**读侧**(`_gcScopeKey` 里那句「显式 null ⇒ 判不了 ⇒ 返回 null」),
     *   故先证明写侧原样(否则本档会在判错对象时假绿 —— 第一版就是这样写的)。 */
    assert.equal(Object.prototype.hasOwnProperty.call(noneData, 'scope'), true,
        '写侧的 scope:null 不该被读侧锚点的破坏带走(证明破坏打在了读侧)');
    const ru = gcRun(noChatB, {
        graphNodes: new Map([
            ['z1', { id: 'z1', type: 'character', name: '甲', timestamp: 1, data: noneData }],
            ['z2', { id: 'z2', type: 'character', name: '甲', timestamp: 2, data: noneData }],
        ]),
        graphEdges: new Map(), normalizeName: normName,
    });
    assert.equal(ru.ledger.graphDup, 1, '破坏后身份判不了的两条同名节点被合了(旧口径)');
    assert.notDeepEqual(hostJudge(broken), [], '源码面必须翻红');
    /* 对照:原版同输入必须拒绝合并(判据非空)。 */
    const noneOk = engineFrom(IDX, { chatId: '' })._scopeData({ source: 's' });
    const ruOk = gcRun(engineFrom(IDX, { chatId: '' }), {
        graphNodes: new Map([
            ['z1', { id: 'z1', type: 'character', name: '甲', timestamp: 1, data: noneOk }],
            ['z2', { id: 'z2', type: 'character', name: '甲', timestamp: 2, data: noneOk }],
        ]),
        graphEdges: new Map(), normalizeName: normName,
    });
    assert.equal(ruOk.ledger.graphDup, 0, '原版:身份判不了不得合');
    void G;
    ok('负控制成立:显式判不了被摘即红;原版同输入拒绝合并');
});

/* ══════════════ H5 判据纯度 + H6 工具两向自证 ══════════════ */
const ANCHORS = [
    ['A_GC_VEC', A_GC_VEC, GC_SRC], ['A_GC_NODE', A_GC_NODE, GC_SRC], ['A_GC_UNK', A_GC_UNK, GC_SRC],
    ['A_IDX_INJECT', A_IDX_INJECT, IDX], ['A_IDX_STAMP', A_IDX_STAMP, IDX],
    ['A_IDX_PROJ', A_IDX_PROJ, IDX], ['A_IDX_BRANCH', A_IDX_BRANCH, IDX], ['A_IDX_UNKNOWN', A_IDX_UNKNOWN, IDX],
];
test('v3329 G1. ★★★ H5 判据纯度:八个破坏锚点在真源各恰中 1 次,且判据层各只绑定一次', () => {
    /* 两向自证的第一向:锚点在**真源**上必须恰中 1 次(0 次或多次 ⇒ 破坏打偏,判据恒过/乱中)。 */
    for (const [nm, a, src] of ANCHORS) {
        assert.equal(src.split(a).length - 1, 1, nm + ' 在真源上须恰中 1 次(0 次或多次 ⇒ 破坏打偏)');
    }
    /* ★ 第二向(纯度)的**正确形态**不是「串在档里出现几次」:含单引号的双引号字面量会被
     *   JS 转义重写,于是「计数」在源码面恒为 0 —— 那条判据只会空过(本档第一版实测踩到的坑)。
     *   真正要防的是「同一锚点绑了两处、改一处漏一处」,故改为**行为面**:把每个锚点的绑定
     *   各按自己的键登记一次,重复登记即红;并断言八个锚点互不相同(不同键 ⇒ 不会互相顶替)。 */
    const keys = new Map();
    for (const [nm, a] of ANCHORS) {
        assert.ok(a.length > 10, nm + ' 锚点过短(易误中)');
        assert.equal(keys.has(a), false, '锚点重复绑定:' + nm);
        keys.set(a, nm);
    }
    assert.equal(keys.size, ANCHORS.length, '八个锚点须互不相同');
    assert.equal(new Set(ANCHORS.map((p) => p[0])).size, ANCHORS.length, '八个锚点名须互不相同(改一处漏一处即红)');
    ok(ANCHORS.length + ' 个锚点:真源各恰中 1 次 / 判据层一对一绑定且互不相同');
});
test('v3329 G2. ★★★ H6 工具两向自证:锚点不存在 / 不唯一 / 同值替换必须抛', () => {
    assert.throws(() => breakSource(GC_SRC, '__不存在__', 'x'), /恰中 1 次|命中 0 次/);
    assert.throws(() => breakSource(GC_SRC, 'const ', 'x'), /恰中 1 次|要求恰好 1 次/, '多次锚点必抛');
    assert.throws(() => breakSource(GC_SRC, A_GC_VEC, A_GC_VEC), /必须真改|必须真的改变源码|未改变/);
    ok('0 次 / 不唯一 / 同值三形态各抛');
});

/* ══════════════ 自防护 + 当版锚 ══════════════ */
test('v3329 Z1. ★★★ 自防护 + 当版锚 + 六源版本同源(供版本守卫 V4 计数)', () => {
    assert.ok(SELF.length > 8000, '本档自身不得被清空(实 ' + SELF.length + ' 字符)');
    assert.ok(SELF.includes('const BORN = ' + String.fromCharCode(39) + BORN + String.fromCharCode(39) + ';'), '当版锚点必须显式留在本档里');
    assert.equal(vnum(BORN), 3329000, 'vnum 序数必须可数');
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立;当前 ' + codeVer);
    assert.equal(MF.version, codeVer, 'manifest 与入口同源');
    assert.equal(PKG.version, codeVer, 'package.json 与入口同源');
    for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        const mv = (/let VERSION = '([^']+)'/.exec(read(m)) || [])[1];
        assert.equal(mv, codeVer, m + ' 副本须与入口同源(须是 let)');
    }
    ok('自防护 / 六源同源 / 当版锚 v' + BORN);
});