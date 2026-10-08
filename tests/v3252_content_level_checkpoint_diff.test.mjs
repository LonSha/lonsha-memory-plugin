// tests/v3252_content_level_checkpoint_diff.test.mjs — F7 首阶段：内容级只读对照（v3.252.0）
//
//   计划二 F7 点名的缺口（修前实测，不是推测）：
//     `snapshot-checkpoint.js` 的 `diffPayloads(a, b)` 只出**键面 + 规模 + 代际** ——
//     计划原文给的反例是「余额 100→900」「朋友→仇人」：两侧**同键、同长度**，值变了，
//     而对照面上一字不吽（onlyInA/onlyInB 皆空、shared 相同）。
//     用户拿这份对照只能看到「键一样」，看不出「差了什么」—— 这不是「深比较没做」，
//     而是**把「看不出差异」与「没有差异」做成了同形**（本仓老账 ① 的形态）。
//
//   本版做三件事，且刻意分开（同一处改动静默改掉既有断言，本仓治过多轮）：
//     · 数据层：**并列新出口** `diffPayloadsDeep` —— 键面读数**继承**既有出口，不重算；
//     · 引擎侧：`compareBranchCheckpointsDeep`（读侧唯一出口）+ `checkpointContentDiffLines`（文案口）；
//     · 面板侧：并排对照按钮**真调用**文案口（建好不消费 = 功能级失效，R4-C 的教训）。
//
//   判据面：
//     A 数据层真跑：计划点名反例逐条点名 / 三态可分 / 有界三读数 / 集合对拍四态 / 绝不抛 / 键面继承
//     B 旧契约未被改动：`diffPayloads` 逐字仍是键面出口
//     C 引擎读侧真跑：真模块 + 真 store + 真载荷；三态不同形；只读零写
//     D 产品面真调用（两跳闭包 + 切断自证）
//     E 负控制：真源码破坏 → 同款判据必须转红（三条）+ 工具两向自证
//     F 版本锚 + 判据面自防护
//
//   本仓老账（写进判据，防止再犯）：
//     ① 「没给」/「给了空」/「给了 0」必须不同形；「比了没差异」与「没比」不得同形；
//     ② 判据撒谎比实现撒谎更难发现 —— 破坏必须打在**真源码**上，并观测**同一条真判据**转红；
//     ③ 注释/字符串不得字面引用锚点（v3216 假红的根因）⇒ 源码面判据一律先剥注释。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import CP from '../snapshot-checkpoint.js';
import { breakSource, assertSingleHit } from './_break_kit.mjs';
import { stripComments } from './_audit_lib.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const IDX = read(path.join(ROOT, 'index.js'));
const UI = read(path.join(ROOT, 'settings-ui.js'));
const CP_SRC = read(path.join(ROOT, 'snapshot-checkpoint.js'));
/* 源码面判据一律做在**代码行**上（剥注释走唯一真源 tests/_audit_lib.mjs）。 */
const IDX_CODE = stripComments(IDX);
const UI_CODE = stripComments(UI);
const CP_CODE = stripComments(CP_SRC);


/** 抽取一个方法体（含签名与花括号），与 v3174 / v3238 同款口径。 */
function extractMethod(source, name) {
    /* [v3.296.0 判据自身缺陷修正 · 与 v3239 同款] 原用 `source.indexOf(name + '(')` 取「方法体」——
     *   那命中**首次出现**，包括**调用点**：X1 落地后宿主里出现一处早于定义的
     *   `this._numOrNull(...)` 调用（召回解释读 recall 记录的 floor，index.js:2981），
     *   定义却在 12375 行，抽出来的片段以 `_numOrNull(_rec.floor),` 起头，
     *   `new Function` 解析期直接 SyntaxError —— 把「锚点漂了」误报成「实现坏了」。
     *   改锚**声明形态**（行首缩进 + 名字 + 参数表 + `{`，从该 `{` 起配平取体）：
     *   判据要的一直是方法体，强度不变，且不再受「文件里谁先提到这个名字」影响。 */
    /* [v3.296.0] 声明形态锚：行首缩进 + 可选的 async/function 前缀 + 名字 + 参数表 + `{`。
     *   不含前缀的版本会漏掉模块级 function 声明（v3252 抽 diffPayloads 时即栽在此）。 */
    const decl = new RegExp('(?:^|\\n)([ \\t]*)(?:async[ \\t]+)?(?:function[ \\t]+)?' + name + '\\s*\\([^)]*\\)\\s*\\{');
    const m = decl.exec(source);
    assert.ok(m, '找不到方法 ' + name);
    const start = m.index + (m[0].startsWith('\n') ? 1 : 0) + m[1].length;
    const bodyStart = m.index + m[0].length - 1;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    assert.ok(end > 0, '方法 ' + name + ' 花括号不闭合');
    return source.slice(start, end + 1);
}

/* ══════════ 夹具：真模块 + 真 localStorage 形状 ══════════ */

/** localStorage 形状（length + key(i)）—— 真模块 fromLocalStorage 的唯一入口形态。 */
function lsLike() {
    const m = new Map();
    const log = [];
    return {
        log,
        get length() { return m.size; },
        key(i) { const ks = Array.from(m.keys()); return ks[i] === undefined ? null : ks[i]; },
        getItem(k) { const kk = String(k); return m.has(kk) ? m.get(kk) : null; },
        setItem(k, v) { log.push('set'); m.set(String(k), String(v)); },
        removeItem(k) { log.push('del'); m.delete(String(k)); },
        has(k) { return m.has(String(k)); },
        raw() { return m; }
    };
}

/** 造一份可控语料：两侧顶层键面**完全相同**，只有值有别 —— 键面出口永远看不出差异的那种。 */
const mkCorpus = () => {
    const base = {
        graph: {
            nodes: [
                { id: 'n1', label: '码头', tags: ['旧', '湿'] },
                { id: 'n2', label: '当铺', tags: ['旧'] },
            ],
            edges: [{ from: 'n1', to: 'n2', weight: 3 }],
        },
        wallet: { balance: 100, friend: '朋友', level: 0 },
        clock: { floor: 12, at: '2026-03-01T00:00:00.000Z' },
    };
    const next = {
        graph: {
            nodes: [
                { id: 'n1', label: '码头', tags: ['旧', '湿'] },
                { id: 'n2', label: '当铺', tags: ['旧', '干'] },
            ],
            edges: [{ from: 'n1', to: 'n2', weight: 4 }],
        },
        wallet: { balance: 900, friend: '仇人', level: 0 },
        clock: { floor: 13, at: '2026-03-02T00:00:00.000Z' },
    };
    return { base, next };
};
const deepClone = (o) => JSON.parse(JSON.stringify(o));

/* ══════════ A 数据层真跑（本版主判据） ══════════ */

test('A1. ★★★ 计划点名反例逐条被点名（键面看不出、长度还相同）', () => {
    const c = mkCorpus();
    /* 先把「修前为什么看不出来」在场：键面完全一致。 */
    const face = CP.diffPayloads(c.base, c.next);
    assert.deepEqual(face.onlyInA, []);
    assert.deepEqual(face.onlyInB, []);
    assert.deepEqual(face.shared, ['clock', 'graph', 'wallet']);
    const deep = CP.diffPayloadsDeep(c.base, c.next);
    assert.equal(deep.ok, true);
    assert.equal(deep.deepContentCompared, true);
    assert.deepEqual(deep.changedKeys.slice().sort(), ['clock', 'graph', 'wallet'], '三个顶层键都必须被点名');
    assert.deepEqual(deep.sameValueKeys, []);
    const paths = deep.changes.map((x) => x.path).sort();
    assert.ok(paths.indexOf('wallet.balance') !== -1, '余额 100→900 必须逐条点名');
    assert.ok(paths.indexOf('wallet.friend') !== -1, '朋友→仇人 必须逐条点名');
    assert.ok(paths.indexOf('clock.floor') !== -1);
    assert.ok(paths.indexOf('graph.edges[0].weight') !== -1);
    assert.ok(paths.indexOf('graph.nodes#n2.tags[1]') !== -1, '集合内元素的深层改动也要点名');
    const bal = deep.changes.filter((x) => x.path === 'wallet.balance')[0];
    assert.equal(bal.from.text, '100');
    assert.equal(bal.to.text, '900');
    assert.equal(bal.kind, 'changed');
    const fri = deep.changes.filter((x) => x.path === 'wallet.friend')[0];
    assert.equal(fri.from.len, 2, '长度读数必须在场');
    assert.equal(fri.to.len, 2, '两侧同为 2 字：只有逐字能分辨');
    assert.equal(fri.from.text, '朋友');
    assert.equal(fri.to.text, '仇人');
    assert.ok(!deep.changes.some((x) => x.path === 'wallet.level'), '值真的相同的键不得混进读数');
});

test('A2. ★★ 三态可分：未给 / 空 / 0 在值上必须不同形', () => {
    const a1 = CP.diffPayloadsDeep({ x: undefined }, {});
    assert.equal(a1.deepContentCompared, true);
    assert.equal(a1.changes.length, 0, 'A 侧没这项 ⇒ 那是键面增删的事，不在 changes 里重复记');
    const a2 = CP.diffPayloadsDeep({ x: undefined }, { x: null });
    assert.equal(a2.changes.length, 1);
    assert.equal(a2.changes[0].kind, 'type-changed');
    assert.equal(a2.changes[0].from.kind, 'undefined');
    assert.equal(a2.changes[0].to.kind, 'null');
    const a3 = CP.diffPayloadsDeep({ x: null }, { x: 0 });
    assert.equal(a3.changes.length, 1);
    assert.equal(a3.changes[0].kind, 'type-changed');
    assert.equal(a3.changes[0].from.kind, 'null');
    assert.equal(a3.changes[0].to.kind, 'number');
    assert.equal(a3.changes[0].to.text, '0', '给了 0 就要念出 0');
    const a4 = CP.diffPayloadsDeep({ x: 0 }, { x: 0 });
    assert.equal(a4.changes.length, 0, '两侧同为 0 ⇒ 无改动');
    assert.deepEqual(a4.changedKeys, []);
    assert.deepEqual(a4.sameValueKeys, ['x']);
    const a5 = CP.diffPayloadsDeep('甲', '乙');
    assert.equal(a5.deepContentCompared, 'not-applicable', '两侧都非对象 ⇒ 没内容可比（不是「比了没差异」）');
    assert.equal(a5.ok, true);
});

test('A3. ★★ 有界三读数各自单列（截断 / 未下钻 / 循环引用）', () => {
    const arr = [];
    for (let i = 0; i < 20; i++) arr.push(1);
    const arr2 = [];
    for (let i = 0; i < 20; i++) arr2.push(2);
    const t = CP.diffPayloadsDeep({ list: arr }, { list: arr2 }, { maxChanges: 3 });
    assert.equal(t.changes.length, 3, '记录条数必须按上限守住');
    assert.equal(t.changesTruncated, true, '截断必须置位（不得与「没有更多差异」同形）');
    assert.equal(t.limits.maxChanges, 3, '生效的上限必须回读');
    const d = CP.diffPayloadsDeep({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } }, { maxDepth: 2 });
    assert.deepEqual(d.capped, ['a.b'], '未下钻的路径必须具名');
    assert.equal(d.changes.length, 0);
    assert.equal(d.changesTruncated, false, '未下钻不是截断（两件不同的事不得同形）');
    const w = []; const w2 = [];
    for (let i = 0; i < 60; i++) { w.push(i); w2.push(i); }
    const wide = CP.diffPayloadsDeep({ list: w }, { list: w2 }, { maxArray: 10 });
    assert.equal(wide.capped.length, 1, '超宽度上限必须留读数');
    assert.ok(wide.capped[0].indexOf('maxArray') !== -1);
    const cycA = { name: '甲' };
    cycA.self = cycA;
    const cycB = { name: '甲' };
    cycB.self = cycB;
    const cy = CP.diffPayloadsDeep(cycA, cycB);
    assert.deepEqual(cy.cycles, ['self'], '循环引用报**回指发生处**，不得虚高一格');
    assert.equal(cy.changes.length, 0);
    assert.equal(cy.ok, true);
});

test('A4. ★★★ 集合对拍四态：按 id / 无 id 降级 / 重复 id / 索引长度差', () => {
    const idA = { list: [{ id: 'x', v: 1 }, { id: 'y', v: 1 }] };
    const idB = { list: [{ id: 'x', v: 2 }, { id: 'z', v: 1 }] };
    const r1 = CP.diffPayloadsDeep(idA, idB);
    assert.equal(r1.sets.length, 1);
    const s1 = r1.sets[0];
    assert.equal(s1.byId, true, '能按 id 对齐就必须按 id 对齐');
    assert.equal(s1.idKey, 'id');
    assert.deepEqual(s1.addedIds, ['z']);
    assert.deepEqual(s1.removedIds, ['y']);
    assert.deepEqual(s1.modifiedIds, ['x']);
    assert.equal(s1.unchangedCount, 0);
    assert.equal(s1.countA, 2);
    assert.equal(s1.countB, 2);
    assert.equal(s1.path, 'list');
    const plain = CP.diffPayloadsDeep({ list: [1, 2] }, { list: [1, 3] });
    assert.equal(plain.sets[0].byId, false, '拿不到 id 就**如实**降级，不得假装对齐过');
    assert.equal(plain.sets[0].idKey, null);
    assert.equal(plain.changes.length, 1);
    assert.equal(plain.changes[0].path, 'list[1]');
    const dup = CP.diffPayloadsDeep({ list: [{ id: 'a' }, { id: 'a' }] }, { list: [{ id: 'b' }, { id: 'b' }] });
    assert.equal(dup.sets[0].byId, 'duplicate', '重复 id ⇒ 不按 id 对齐（三值之一，不得压成 true/false）');
    assert.deepEqual(dup.sets[0].duplicateIds, ['A:a', 'B:b'], '重复项必须去重且分侧');
    const lenA = CP.diffPayloadsDeep({ list: [1, 2, 3] }, { list: [1, 2] });
    assert.equal(lenA.changes.length, 1, '第 3 项整个消失却零读数 = 本仓最贵的那类错读数');
    assert.equal(lenA.changes[0].kind, 'removed-index');
    assert.equal(lenA.changes[0].path, 'list[2]');
    const lenB = CP.diffPayloadsDeep({ list: [1] }, { list: [1, 2] });
    assert.equal(lenB.changes.length, 1);
    assert.equal(lenB.changes[0].kind, 'added-index');
    assert.equal(lenB.changes[0].from.kind, 'undefined');
    assert.equal(lenB.changes[0].to.text, '2');
});

test('A5. ★★ 绝不抛：八组畸形输入逐组给读数', () => {
    const fns = [undefined, null, 0, '甲', [], {}, () => {}, Symbol('s')];
    for (const x of fns) {
        const r = CP.diffPayloadsDeep(x, {});
        assert.equal(typeof r, 'object', '输入 ' + String(x) + ' 也要给读数');
        assert.equal(r.ok, true);
        assert.ok(Array.isArray(r.changes));
        assert.ok(Array.isArray(r.sets));
        assert.ok(Array.isArray(r.capped));
        assert.ok(Array.isArray(r.cycles));
    }
    const cyc = {};
    cyc.me = cyc;
    const r = CP.diffPayloadsDeep(cyc, cyc);
    assert.equal(r.ok, true);
    assert.ok(r.cycles.length >= 1, '自指也必须给读数，不得挂死');
    const thrower = Object.defineProperty({}, 'a', { get() { throw new Error('宿主 getter 抛'); }, enumerable: true });
    const bad = CP.diffPayloadsDeep({ a: 1 }, thrower);
    assert.equal(typeof bad.ok, 'boolean', '宿主怪 getter 不得把异常漏出去');
    assert.ok(bad.ok === false || bad.deepContentCompared === 'failed', '比不成要如实报，不得吞成「无差异」');
});

test('A6. ★★ 键面读数**继承**既有出口（同一口径不得两处实现）', () => {
    const c = mkCorpus();
    const face = CP.diffPayloads(c.base, c.next);
    const deep = CP.diffPayloadsDeep(c.base, c.next);
    const keys = ['comparable', 'onlyInA', 'onlyInB', 'shared', 'sharedCount', 'keyCountA', 'keyCountB', 'bytesA', 'bytesB', 'bytesDelta', 'schemaA', 'schemaB', 'sameSchema', 'empty'];
    for (const k of keys) {
        assert.deepEqual(deep[k], face[k], '深出口的 ' + k + ' 必须逐字继承键面出口');
    }
    assert.equal(deep.bytesDelta, face.bytesDelta, '规模读数也不得在深出口重算');
    /* 负向：键面出口不得长出深比较字段（那是两个出口，不是一个）。 */
    for (const k of ['changes', 'sets', 'changedKeys', 'capped', 'cycles', 'deepContentCompared']) {
        assert.equal(Object.prototype.hasOwnProperty.call(face, k), false, '键面出口不得长出 ' + k);
    }
});

test('B1. ★★★ 旧契约逐字未被改动：diffPayloads 仍是键面出口', () => {
    const c = mkCorpus();
    const face = CP.diffPayloads(c.base, c.next);
    assert.equal(face.comparable, true);
    const want = ['bytesA', 'bytesB', 'bytesDelta', 'comparable', 'empty', 'keyCountA', 'keyCountB', 'onlyInA', 'onlyInB', 'sameSchema', 'schemaA', 'schemaB', 'shared', 'sharedCount', 'versionA', 'versionB'] .sort();
    assert.deepEqual(Object.keys(face).sort(), want, '字段面必须恰是修前那一套');
    const onlyA = CP.diffPayloads({ graph: 1, extraA: 2 }, { graph: 1, extraB: 3 });
    assert.deepEqual(onlyA.onlyInA, ['extraA']);
    assert.deepEqual(onlyA.onlyInB, ['extraB']);
    assert.deepEqual(onlyA.shared, ['graph']);
    /* 代际面：未给不得压成 0（R4-E / v3239 B3-B4 的含义不得被本版改掉）。 */
    const nz = CP.diffPayloads({ graph: 1 }, { graph: 1 });
    assert.equal(nz.schemaA, null, '没给代际 ⇒ null，不是 0');
    assert.equal(nz.schemaB, null);
    assert.equal(nz.sameSchema, true, '两侧都没给 ⇒ 同代（如实）');
    assert.equal(nz.bytesDelta, 0);
    /* 源码面：键面出口体内不得出现深比较的机制（剥注释后再看）。 */
    const body = extractMethod(CP_CODE, 'diffPayloads');
    for (const bad of ['maxDepth', 'maxChanges', 'ctx', 'walkDeep', 'kindOf', 'previewOf', 'changesTruncated']) {
        assert.equal(body.indexOf(bad), -1, '键面出口体内不得出现 ' + bad + '（深比较是并列出口，不是就地改造）');
    }
});

/* ══════════ 引擎侧真跑夹具（真模块 + 真 store） ══════════ */

/** 方法名（全部从 index.js 真抽，不做 mock：测到的是真实行为）。 */
const NEEDED = ['checkpointStore', '_checkpointLib', 'saveCheckpoint', 'readCheckpoint', 'listCheckpoints',
    'compareBranchCheckpoints', 'compareBranchCheckpointsDeep', 'checkpointContentDiffLines', '_numOrNull', '_floorOrNull'];
const methodBag = NEEDED.map((n) => extractMethod(IDX, n)).join(',' + String.fromCharCode(10));

/** 真跑工厂：注入真模块（或指定副本）+ 真 localStorage 形状 + 真 _moduleLib 契约。 */
function makeEngine(opts = {}) {
    const o = opts || {};
    const ls = o.ls || lsLike();
    const win = { LonShaSnapshotCheckpoint: (o.cp === undefined ? CP : o.cp) };
    const factory = new Function('window', 'localStorage', '_moduleLib', 'errLog', `
        return ({
            ${methodBag},
            getCurrentChatId() { return 'c1'; }
        });
    `);
    const eng = factory(win, ls, (getGlobal) => { try { return getGlobal(); } catch (_e) { return null; } }, () => {});
    /* 写动作日志必须能被观测到（C2/C3 靠它证明「记录损坏」可构造、只读面零写）。 */
    eng._ls = ls;
    return eng;
}

/* ══════════ C 引擎侧真跑 ══════════ */

test('C1. ★★★ 引擎读侧真跑：键面 + 内容级两层同时给出（真 store 真载荷）', () => {
    const c = mkCorpus();
    const eng = makeEngine();
    eng.saveCheckpoint('A', { payload: deepClone(c.base) });
    eng.saveCheckpoint('B', { payload: deepClone(c.next) });
    const r = eng.compareBranchCheckpointsDeep('A', 'B');
    assert.equal(r.ok, true, '两侧都在 ⇒ 必须真比成（读侧不得自阻）');
    assert.equal(r.reason, 'ok');
    assert.ok(r.face, '键面读数必须在场');
    assert.equal(r.face.sharedCount, 3);
    assert.deepEqual(r.face.onlyInA, []);
    assert.equal(r.deep.deepContentCompared, true, '内容级必须真的比了');
    assert.deepEqual(r.deep.changedKeys.slice().sort(), ['clock', 'graph', 'wallet']);
    const lines = eng.checkpointContentDiffLines('A', 'B');
    assert.equal(typeof lines, 'string', '文案口必须给字符串（不是 null）');
    assert.ok(lines.indexOf('只对照，不改任何一份') !== -1, '只读属性必须写进文案');
    assert.ok(lines.indexOf('wallet.balance') !== -1, '文案必须点名路径（折成计数等于把这件事还回用户）');
    assert.ok(lines.indexOf('900') !== -1, '前后值必须在场');
    assert.ok(lines.indexOf('仇人') !== -1);
});

test('C2. ★★★ 三态不同形：缺一侧 / 载荷损坏 / 模块过旧', () => {
    const c = mkCorpus();
    const eng = makeEngine();
    eng.saveCheckpoint('A', { payload: deepClone(c.base) });
    eng.saveCheckpoint('B', { payload: deepClone(c.next) });
    /* ① 缺一侧：不拿空载荷冒充「那边是空的」。 */
    const miss = eng.compareBranchCheckpointsDeep('A', '没有');
    assert.equal(miss.ok, false);
    assert.equal(miss.face, null, '缺一侧时不得给出键面读数');
    assert.equal(miss.deep, null);
    assert.equal(eng.checkpointContentDiffLines('A', '没有'), null, '读不到 ⇒ 文案口回 null');
    /* ② 载荷损坏：记录在、载荷空 —— 与「没有这份」**不同形**。 */
    const kC = CP.checkpointKey('c1', 'C');
    eng._ls.setItem(kC, JSON.stringify({ name: 'C', chatId: 'c1', at: 1, floor: null, note: '', meta: {}, payload: null }));
    const bad = eng.compareBranchCheckpointsDeep('A', 'C');
    assert.equal(bad.ok, false);
    assert.equal(bad.reason, CP.describe('corrupt'), '损坏必须报「损坏」，不得报成「没有这份」');
    assert.notEqual(bad.reason, CP.describe('a-missing'), '两种情况的文案必须不同形');
    assert.notEqual(miss.reason, bad.reason);
    /* ③ 模块过旧（无深比较出口）：仍给键面读数，且明说本版没有。 */
    const old = Object.assign({}, CP);
    delete old.diffPayloadsDeep;
    const eng2 = makeEngine({ cp: old });
    eng2.saveCheckpoint('A', { payload: deepClone(c.base) });
    eng2.saveCheckpoint('B', { payload: deepClone(c.next) });
    const un = eng2.compareBranchCheckpointsDeep('A', 'B');
    assert.equal(un.ok, false);
    assert.equal(un.reason, 'deep-unavailable');
    assert.ok(un.face && un.face.sharedCount === 3, '模块过旧是「这面没有」，不是「什么都没读到」—— 键面读数照给');
    assert.equal(un.deep, null);
    const lines2 = eng2.checkpointContentDiffLines('A', 'B');
    assert.equal(typeof lines2, 'string', '模块过旧时文案口仍要给键面文案，不得与「内容一样」同形');
    assert.ok(lines2.indexOf('本版插件没有这个出口') !== -1, '必须明说本版没有深比较');
    assert.ok(lines2.indexOf('键面：共同') !== -1, '键面读数必须仍在');
});

test('C3. ★★ 只读零写：两个新出口全程不得产生写动作', () => {
    const c = mkCorpus();
    const eng = makeEngine();
    eng.saveCheckpoint('A', { payload: deepClone(c.base) });
    eng.saveCheckpoint('B', { payload: deepClone(c.next) });
    const before = eng._ls.log.length;
    eng.compareBranchCheckpointsDeep('A', 'B');
    eng.checkpointContentDiffLines('A', 'B');
    eng.compareBranchCheckpointsDeep('A', '没有');
    assert.equal(eng._ls.log.length, before, '只读面不得产生任何 set / del（增量=' + (eng._ls.log.length - before) + '）');
});

/* ══════════ D 产品面真调用（两跳可达 + 切断自证） ══════════ */

/** 面板调了谁：`engine.<name>(` / `plugin.<name>(` 里的成员名（真调用才计入）。 */
function uiRoots(ui) {
    const out = new Set();
    const re = /(?:engine|plugin).([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(ui)) !== null) out.add(m[1]);
    return out;
}
/** 方法体内的调用边：`this.<name>(` 集合（剥注释后的源码面）。 */
function methodCalls(srcCode, name) {
    const body = extractMethod(srcCode, name);
    const out = new Set();
    const re = /this.([A-Za-z_$][\w$]*)\s*\(/g;
    let m;
    while ((m = re.exec(body)) !== null) out.add(m[1]);
    return out;
}

test('D1. ★★★ 面板真调用新文案口（建好不消费 = 功能级失效）', () => {
    const roots = uiRoots(UI_CODE);
    assert.ok(roots.has('checkpointContentDiffLines'), '面板必须以 engine.checkpointContentDiffLines( 形态真调（只提名字不算）');
    assert.ok(UI_CODE.indexOf('engine.checkpointContentDiffLines(') !== -1);
    /* 两跳可达：文案口 → 读侧出口 → 键面出口/读取口（每一跳都必须在场）。 */
    const l1 = methodCalls(IDX_CODE, 'checkpointContentDiffLines');
    assert.ok(l1.has('compareBranchCheckpointsDeep'), '文案口必须真调读侧出口，不得自己重拼一份');
    const l2 = methodCalls(IDX_CODE, 'compareBranchCheckpointsDeep');
    assert.ok(l2.has('compareBranchCheckpoints'), '读侧出口必须复用键面出口（同一口径不得两处）');
    const bodyDeep = extractMethod(IDX_CODE, 'compareBranchCheckpointsDeep');
    assert.ok(bodyDeep.indexOf('CP.readCheckpoint(') !== -1, '两侧载荷必须走既有读取口（模块唯一读口 CP.readCheckpoint，不另开一条读法）');
    const l3 = methodCalls(IDX_CODE, 'compareBranchCheckpoints');
    assert.ok(l3.has('checkpointStore') && l3.has('_checkpointLib'), '键面出口必须真调存储与模块口');
    /* 面板不得自己实现深比较（否则同一件事两处真源）。 */
    for (const bad of ['deepEqual(', 'changesTruncated', 'Object.is(', 'changedKeys', 'walkDeep()']) {
        assert.equal(UI_CODE.indexOf(bad), -1, '面板不得内联深比较机制：' + bad);
    }
});

test('D2. ★★ 切断一条边 ⇒ 可达判据必须转红（判据不是恒真）', () => {
    const cut = UI_CODE.replace('engine.checkpointContentDiffLines(', 'engine.checkpointContentDiffLinesX(');
    assert.notEqual(cut, UI_CODE, '替换必须真的生效（否则这条自证是空跑）');
    const roots2 = uiRoots(cut);
    assert.equal(roots2.has('checkpointContentDiffLines'), false, '切断后该文案口必须不可达');
    assert.equal(roots2.has('checkpointBranchesDiffLines'), true, '未动的那条支路必须还在（否则是「一刀切全红」的假判据）');
});

/* ══════════ E 负控制：真源码破坏 → 同款真判据必须转红 ══════════ */

/** 把破坏后的源码加载成**真模块**（写到 os.tmpdir，不污染仓根），返回它的 api。 */
async function loadBrokenApi(brokenSrc) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3252-brk-'));
    const f = path.join(dir, 'snapshot-checkpoint.js');
    fs.writeFileSync(f, brokenSrc, 'utf8');
    const mod = await import(pathToFileURL(f).href + '?t=' + Date.now());
    const api = (mod && mod.default) ? mod.default : mod;
    return { api, dir };
}

test('E0. ★★ 负控制工具两向自证：打偏 / 多命中 / 同值替换都必须拒绝', () => {
    assert.throws(() => breakSource(CP_SRC, '不存在的锚点字符串', 'X', 'E0'), /拒绝破坏/, '锚点不存在 ⇒ 必须拒绝（打偏即假绿第一形）');
    assert.throws(() => breakSource('aaaa', 'aa', 'b', 'E0'), /拒绝破坏/, '锚点命中多次 ⇒ 必须拒绝（不是定点）');
    assert.throws(() => breakSource(CP_SRC, 'const REASONS = Object.freeze({', 'const REASONS = Object.freeze({', 'E0'), /拒绝破坏/, '同值替换 ⇒ 必须拒绝（等价于对原文件断言）');
    assert.equal(assertSingleHit(CP_SRC, 'const REASONS = Object.freeze({', 'E0'), 'const REASONS = Object.freeze({', '恰中 1 次的锚点必须原样返回');
});

test('E1. ★★★ 负控制：把逐值判定改恒假 ⇒ 内容级改动读数必须归零', async () => {
    const anchor = 'if (!Object.is(x, y)) pushChange(ctx, path, ';
    assert.equal(CP_CODE.split(anchor).length - 1, 1, '锚点必须恰中 1 次（剥注释后的代码面）');
    /* 原版上同款判据必须为真（两向自证）。 */
    const ok0 = CP.diffPayloadsDeep({ a: 1 }, { a: 2 });
    assert.equal(ok0.changes.length, 1, '原版：值变了就必须有 1 条读数');
    assert.equal(CP.diffPayloadsDeep({ a: 1 }, { a: 2 }).changedKeys.length, 1);
    const broken = breakSource(CP_SRC, anchor, 'if (false) pushChange(ctx, path, ', 'E1');
    const { api, dir } = await loadBrokenApi(broken);
    try {
        const got = api.diffPayloadsDeep({ a: 1 }, { a: 2 });
        assert.equal(got.changes.length, 0, '破坏后：同一对载荷必须不再出改动读数（转红）');
        assert.equal(got.changedKeys.length, 0);
        assert.equal(api.diffPayloadsDeep({ a: 1 }, { a: 2 }).ok, true, '键面面仍能跑（定点破坏，不是整模块）');
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* 清理失败不影响结论 */ }
    }
});

test('E2. ★★★ 负控制：破坏键面出口 ⇒ 深出口的继承读数必须跟着变（证明确实同源）', async () => {
    const anchor = '!setB.has(k));';
    assert.equal(CP_CODE.split(anchor).length - 1, 1, '锚点必须恰中 1 次');
    const base = { graph: 1, extraA: 2 };
    const next = { graph: 1, extraB: 3 };
    assert.deepEqual(CP.diffPayloadsDeep(base, next).onlyInA, ['extraA'], '原版：A 独有只应是 extraA');
    const broken = breakSource(CP_SRC, anchor, 'setB.has(k));', 'E2');
    const { api, dir } = await loadBrokenApi(broken);
    try {
        const got = api.diffPayloadsDeep(base, next);
        assert.notDeepEqual(got.onlyInA, ['extraA'], '破坏后：深出口的键面读数必须跟着变（它不是自己重算的）');
        assert.deepEqual(got.onlyInA, ['graph'], '方向被反过来后读数必须如实跟');
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* 同上 */ }
    }
});

test('E3. ★★★ 负控制：把截断位硬改恒假 ⇒ 「截断」读数必须静默消失（转红）', async () => {
    const anchor = 'out.changesTruncated = ctx.truncated === true;';
    assert.equal(CP_CODE.split(anchor).length - 1, 1, '锚点必须恰中 1 次');
    const big = []; const big2 = [];
    for (let i = 0; i < 20; i++) { big.push(1); big2.push(2); }
    const p = { list: big }; const q = { list: big2 };
    assert.equal(CP.diffPayloadsDeep(p, q, { maxChanges: 3 }).changesTruncated, true, '原版：超上限必须置截断位');
    const broken = breakSource(CP_SRC, anchor, 'out.changesTruncated = false;', 'E3');
    const { api, dir } = await loadBrokenApi(broken);
    try {
        assert.equal(api.diffPayloadsDeep(p, q, { maxChanges: 3 }).changesTruncated, false, '破坏后：截断位恒假（必须能被观测到）');
        assert.equal(api.diffPayloadsDeep(p, q, { maxChanges: 3 }).changes.length, 3, '其余读数不受影响（定点破坏）');
    } finally {
        try { fs.rmSync(dir, { recursive: true, force: true }); } catch (_e) { /* 同上 */ }
    }
});

test('E4. ★★ 负控制：镜像树里删掉面板调用 ⇒ 产品面判据必须转红', () => {
    const broken = breakSource(UI, 'engine.checkpointContentDiffLines(', 'engine.checkpointContentDiffLinesGone(', 'E4');
    const roots = uiRoots(broken);
    assert.equal(roots.has('checkpointContentDiffLines'), false, '破坏后该文案口必须从面板可达集里消失');
    assert.equal(uiRoots(UI).has('checkpointContentDiffLines'), true, '原版上同款判据必须为真（两向自证）');
    assert.equal(roots.has('checkpointBranchesDiffLines'), true, '其余支路不受影响（定点破坏）');
});

/* ══════════ F 版本锚 + 判据面自防护 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));
test('F1. ★ 版本锚（当版字面量 + 三源一致）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const mf = JSON.parse(read(path.join(ROOT, 'manifest.json')));
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.ok(vnum(codeVer) >= vnum('3.252.0'), '本套件只在 3.252.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
    assert.equal(mf.version, codeVer);
});

test('F2. ★★ 判据面自防护：关键指纹不得在剥注释后退化', () => {
    assert.ok(CP_CODE.indexOf('function diffPayloadsDeep(a, b, opts) {') !== -1, '数据层新出口必须在场');
    assert.ok(CP_CODE.indexOf('function diffPayloads(a, b) {') !== -1, '键面出口必须仍在（并列而非替换）');
    assert.ok(IDX_CODE.indexOf('compareBranchCheckpointsDeep(nameA, nameB, chatId, opts) {') !== -1, '引擎读侧出口必须在场');
    assert.ok(IDX_CODE.indexOf('checkpointContentDiffLines(nameA, nameB, chatId) {') !== -1, '引擎文案口必须在场');
    assert.ok(UI_CODE.indexOf('engine.checkpointContentDiffLines(') !== -1, '面板真调用必须在场');
    for (const bad of ['walkDeep(', 'kindOf(', 'previewOf(']) {
        assert.equal(IDX_CODE.indexOf(bad), -1, '深比较机制必须只住数据层一处：' + bad);
    }
    assert.ok(CP_CODE.indexOf('const STABLE_ID_KEYS = [') !== -1, '稳定 id 键表必须在场');
});

