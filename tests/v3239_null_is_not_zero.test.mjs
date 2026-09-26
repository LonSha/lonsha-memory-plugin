// tests/v3239_null_is_not_zero.test.mjs — 「没给」不是「给了 0」（v3.239.0）
//
//   本版修的是**同一个根因的第三次出现**：`Number.isFinite(Number(x)) ? Number(x) : null`
//   这条判据在 `x === null` 时**恒真**（`Number(null) === 0`），于是「我不知道这是第几楼」
//   被静默记成「第 0 楼」—— 而 0 在本插件**是合法楼层**（第 0 楼真实存在）。
//
//   前两次（O-1 / R3-D）都是**修单点**：把出问题的那一处改成手写判据。于是同类缺陷
//   在 R2-C 又来一次（`copySegment` 非幂等），这次连同它一起在 `snapshot-checkpoint.js`
//   与 `index.js` 落地。本版不再修单点，改**修判据本体**：
//     全仓只留一个「外部来的数」判据（模块侧 `numOrNull` / 引擎侧 `_numOrNull`
//     + 楼层专用的 `_floorOrNull`），其余调用点一律走它。
//
//   本版抓到并修的三处错读数（每一处都有真判据）：
//     ① `saveCheckpoint({floor: null})` 存成 `floor: 0` —— 「我不知道」变「第 0 楼」；
//     ② `saveCheckpoint({at: null})` 存成 `at: 0` —— 面板显示 1970-01-01；
//     ③ `payloadMeta({schemaVersion: null}).schemaVersion === 0` —— 「未给代际」被
//        v3.238.0 的对照面当成「第 0 代」出「跨代」结论（**给用户一个错读数**）；
//        另加 `index.js` 入口回落 `_currentFloor === -1` 会念出「第 -1 楼」。
//
//   判据面：
//     A 分界口本体（模块 + 引擎，逐个输入真跑；两处同判据）
//     B 三处错读数逐条钉住（floor / at / schemaVersion）
//     C 入口楼层判据（`_floorOrNull` 拒负；`_currentFloor === -1` 不落地）
//     D 展示层同族（4 个文案口不得再把 `null` 念成 1970 / 第 0 楼）
//     E 全仓不得再有第二处旧判据（单真源）
//     F 负控制三条（真源码破坏 → 副本 → 同款判据必须转红 + 原版两向自证）
//     G 版本锚
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { fileURLToPath } from 'node:url';
import CP from '../snapshot-checkpoint.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(p, 'utf8');
const IDX = read(path.join(ROOT, 'index.js'));
const UI = read(path.join(ROOT, 'settings-ui.js'));
const SRC = read(path.join(ROOT, 'snapshot-checkpoint.js'));

/** 内存 store（契约形状 + 写动作日志）。 */
function memStore() {
    const m = new Map();
    const log = [];
    return {
        log,
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { log.push(['set', k]); m.set(k, String(v)); },
        removeItem: (k) => { log.push(['del', k]); m.delete(k); },
        keys: () => Array.from(m.keys())
    };
}
const payloadOf = (o) => Object.assign({
    version: '3.239.0', producerVersion: '3.239.0', schemaVersion: 2, packedAt: '2026-01-01T00:00:00.000Z',
    graph: {}, summaries: {}, diaries: {}
}, o || {});

/* ══════════ A 分界口本体（模块侧） ══════════ */

/** 三态表：「没给」一律 null；「给了 0」必须留 0；「给了但不是数」一律 null（不抛不猜）。 */
const NOT_GIVEN = [null, undefined, '', '   ', true, false];
const IS_A_NUMBER = [[0, 0], [1, 1], [-3, -3], ['0', 0], ['12', 12], [0.5, 0.5]];
const NOT_A_NUMBER = [NaN, {}, [], [1], ['0'], 'abc', '第 3 楼', Infinity, -Infinity, () => 1];

test('A1. ★★★ 模块分界口 numOrNull：「没给」与「给了 0」必须不同形', () => {
    assert.equal(typeof CP.numOrNull, 'function', '模块必须导出 numOrNull（判据要能直测本体）');
    for (const v of NOT_GIVEN) {
        assert.equal(CP.numOrNull(v), null, '「没给」必须是 null：' + JSON.stringify(v));
    }
    for (const [v, want] of IS_A_NUMBER) {
        assert.equal(CP.numOrNull(v), want, '真给了数就必须留数：' + JSON.stringify(v));
    }
    for (const v of NOT_A_NUMBER) {
        assert.equal(CP.numOrNull(v), null, '给了但不是数 ⇒ null（不抛、不猜）：' + String(v));
    }
    /* 这条单列：0 与 null 是两个不同的东西，混同就是本版要修的病。 */
    assert.notEqual(CP.numOrNull(0), CP.numOrNull(null));
    assert.equal(CP.numOrNull(0), 0);
});

test('A2. ★★★ 两处分界口逐输入等价（引擎 `_numOrNull` ≡ 模块 `numOrNull`）', () => {
    /* 引擎侧刻意各留一份实现（模块不加载时仍要工作），故必须有判据钉住「两份同判据」。
     * 判据形态：**等价**而不是「各自等于一张常量表」—— 后者会在两处同步改进时失效，
     *   那是判据自身缺陷（本仓 E6 形态）。抽方法体真跑：与 v3174 / v3230 同款口径。 */
    const body = extractMethod(IDX, '_numOrNull');
    assert.ok(body, 'index.js 必须有 _numOrNull');
    const fn = new Function('return function ' + body.replace(/^_?numOrNull/, 'f') + ';')();
    for (const v of NOT_GIVEN.concat(NOT_A_NUMBER, IS_A_NUMBER.map((x) => x[0]))) {
        assert.equal(fn(v), CP.numOrNull(v), '两处分界口必须同判据，分歧输入：' + String(v));
    }
    /* 再各钉两条最贵的三态（不依赖常量表，只钉「不同形」这件事本身）。 */
    assert.equal(fn(0), 0, '引擎侧：真给 0 必须留 0');
    assert.equal(fn(null), null, '引擎侧：没给必须是 null');
});

test('A3. ★★ 楼层专用口 `_floorOrNull`：负值不是合法位置', () => {
    /* 取方法体后必须转成**函数表达式**：`{ k: name(v) {...} }` 是非法语法
     *   （冒号后不能跟方法简写，解析期就抛 Unexpected token '{'）——
     *   第一版因此把「语法写错」报成了「实现有问题」，属判据自身缺陷。 */
    const src = 'return { _numOrNull: function ' + extractMethod(IDX, '_numOrNull')
        + ', _floorOrNull: function ' + extractMethod(IDX, '_floorOrNull') + ' };';
    const eng = new Function(src)();
    assert.equal(eng._floorOrNull(0), 0, '第 0 楼是合法楼层（这是本版的分界点）');
    assert.equal(eng._floorOrNull(7), 7);
    assert.equal(eng._floorOrNull(-1), null, '`_currentFloor` 的 -1 表示「还没进楼层」，不是楼');
    assert.equal(eng._floorOrNull(null), null);
    assert.equal(eng._floorOrNull(''), null);
});

/* ══════════ B 三处错读数逐条钉住（模块侧） ══════════ */

test('B1. ★★★ `floor: null` 不得被存成 0（「我不知道第几楼」不是「第 0 楼」）', () => {
    const st = memStore();
    const r = CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), floor: null });
    assert.equal(r.ok, true, '存本身要成功');
    /* 读数取自**存储**（真源）—— `saveCheckpoint` 的返回体按接口形状**不含 floor**
     *   （只带 name / at / meta / overwritten / previousAt / evicted / count）。
     *   第一版拿 `r.floor` 断言，是判据自身缺陷：那个字段从来不存在，
     *   期望值是 `null` 而实际是 `undefined`，判据在正确实现上也失败。 */
    assert.equal(JSON.parse(st.getItem(CP.checkpointKey('c1', '甲'))).floor, null,
        '落到存储里的 floor 必须是 null（不是 0）');
    assert.equal(CP.listCheckpoints(st, 'c1').items[0].floor, null, '清单回读也必须是 null');
    /* 两向自证：真给 0 时必须留 0，否则就是「一刀切把 0 也吞了」。 */
    const st2 = memStore();
    CP.saveCheckpoint(st2, { chatId: 'c1', name: '乙', payload: payloadOf(), floor: 0 });
    assert.equal(JSON.parse(st2.getItem(CP.checkpointKey('c1', '乙'))).floor, 0, '真给 0 必须留 0');
    assert.equal(CP.listCheckpoints(st2, 'c1').items[0].floor, 0);
});

test('B2. ★★★ `at: null` 不得被存成 0（1970）—— 但真没给时仍由本模块取现在', () => {
    const st = memStore();
    const before = Date.now();
    const r = CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: null });
    assert.equal(r.ok, true);
    assert.ok(r.at >= before, '`at: null` 算「没给」⇒ 取现在（不能是 0）');
    const raw = JSON.parse(st.getItem(CP.checkpointKey('c1', '甲')));
    assert.ok(raw.at >= before, '落到存储的也必须是现在');
    /* 两向自证：显式给时间戳时必须原样留。 */
    const st2 = memStore();
    const r2 = CP.saveCheckpoint(st2, { chatId: 'c1', name: '乙', payload: payloadOf(), at: 1700000000000 });
    assert.equal(r2.at, 1700000000000);
});

test('B3. ★★★ `schemaVersion: null` 不得被报成「第 0 代」', () => {
    const mt = CP.payloadMeta({ schemaVersion: null, version: '3.239.0', graph: {} });
    assert.equal(mt.schemaVersion, null, '「未给代际」必须是 null，不是 0');
    /* 为什么这条最贵：v3.238.0 的对照面拿这个数出 sameSchema / 跨代结论 ——
     * 报 0 就等于**给用户一个错读数**（「跨代 0 → 2」）。 */
    const a = { schemaVersion: null, graph: {} };
    const b = { schemaVersion: 2, graph: {} };
    const d = CP.diffPayloads(a, b);
    assert.equal(d.sameSchema, false, '未给代际 vs 第 2 代 ⇒ 不同代（不能因都读成数而判同代）');
    assert.equal(d.schemaA, null, 'A 侧代际必须是 null');
    /* 两向自证：真给 0 代时必须留 0（0 是合法代际）。 */
    assert.equal(CP.payloadMeta({ schemaVersion: 0 }).schemaVersion, 0, '真给第 0 代必须留 0');
    assert.equal(CP.diffPayloads({ schemaVersion: 0 }, { schemaVersion: 0 }).sameSchema, true);
});

test('B4. ★★ 两条透传面（previewRestore / compareCheckpoints）也不得压 0', () => {
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf({ graph: {} }), at: null, floor: null });
    CP.saveCheckpoint(st, { chatId: 'c1', name: '乙', payload: payloadOf({ diaries: {} }), at: null, floor: null });
    const p = CP.previewRestore(st, 'c1', '甲', payloadOf({ summaries: {} }));
    assert.equal(p.ok, true);
    assert.equal(p.plan.floor, null, '预览的 plan.floor 必须是 null');
    /* `at` 与 floor 的取舍**刻意不同**：时间戳可由本模块负责（真没给就取现在），
     *   故这里断言「是数且不是 0」，而不是「必须是 null」。 */
    assert.ok(typeof p.plan.at === 'number' && p.plan.at > 0, 'plan.at 是现在（不是 1970）');
    const c = CP.compareCheckpoints(st, 'c1', '甲', '乙');
    assert.equal(c.ok, true);
    assert.equal(c.a.floor, null);
    /* `at` 同前：`at: null` 算「没给」⇒ 本模块取现在，故记录里的 at 是**数**而不是 null。
     *   第一版在此断言 null，是判据自身缺陷（把「本模块负责取现在」误当「原样透传 null」）。 */
    assert.ok(typeof c.a.at === 'number' && c.a.at > 0, '对比面的 at 是现在（不是 1970、也不是 null）');
    assert.equal(c.b.floor, null, 'B 侧同样不得压 0');
});

/* ══════════ C 入口楼层判据（index.js） ══════════ */

/** 抽方法体（含签名与花括号），与 v3174 / v3230 / v3238 同款口径。 */
function extractMethod(source, name) {
    const marker = name + '(';
    const start = source.indexOf(marker);
    if (start <= 0) return null;
    const bodyStart = source.indexOf('{', start);
    if (bodyStart < 0) return null;
    let depth = 0, end = -1;
    for (let i = bodyStart; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    return source.slice(start, end + 1);
}

test('C1. ★★★ 入口 `saveCheckpoint`：`_currentFloor === -1` 不得被念成「第 -1 楼」', () => {
    const NEEDED = ['_numOrNull', '_floorOrNull', 'checkpointStore', '_checkpointLib', 'saveCheckpoint',
        'listCheckpoints', 'readCheckpoint', 'dropCheckpoint'];
    const bag = NEEDED.map((n) => extractMethod(IDX, n)).filter(Boolean).join(',\n');
    assert.equal(NEEDED.filter((n) => !extractMethod(IDX, n)).length, 0, '抽不到方法体说明锚点漂了');
    /* 真 store（内存）+ 真模块 + 真 _moduleLib 契约：整条链真跑。 */
    const mk = (ls) => new Function('window', 'localStorage', '_moduleLib', 'errLog', `
        return ({
            ${bag},
            getCurrentChatId() { return 'c1'; },
            collectExport() { return ${JSON.stringify(payloadOf())}; }
        });
    `)({ LonShaSnapshotCheckpoint: CP }, ls, (g) => { try { return g(); } catch (_e) { return null; } }, () => {});

    const ls = lsLike();
    const eng = mk(ls);
    eng._currentFloor = -1;
    const r = eng.saveCheckpoint('甲', {});
    assert.equal(r.ok, true);
    const rec = JSON.parse(ls.getItem('lonsha-snapshot-checkpoint::c1::甲'));
    assert.equal(rec.floor, null, '「还没进楼层」不得落成 -1，也不得落成 0；必须 null');

    /* 两向自证 ①：真在楼层上时必须原样留。 */
    const ls2 = lsLike();
    const eng2 = mk(ls2);
    eng2._currentFloor = 12;
    eng2.saveCheckpoint('甲', {});
    assert.equal(JSON.parse(ls2.getItem('lonsha-snapshot-checkpoint::c1::甲')).floor, 12, '真进了第 12 楼必须留 12');
    /* 两向自证 ②：显式 `floor: 0` 优先于当前楼层，且 0 是合法楼层。 */
    const ls3 = lsLike();
    const eng3 = mk(ls3);
    eng3._currentFloor = 12;
    eng3.saveCheckpoint('甲', { floor: 0 });
    assert.equal(JSON.parse(ls3.getItem('lonsha-snapshot-checkpoint::c1::甲')).floor, 0,
        '显式第 0 楼必须胜出（0 是合法楼层）');
    /* 两向自证 ③：显式 `floor: null` 算「没给」⇒ 回落当前楼层（这是**有意**的取舍）。 */
    const ls4 = lsLike();
    const eng4 = mk(ls4);
    eng4._currentFloor = 12;
    eng4.saveCheckpoint('甲', { floor: null });
    assert.equal(JSON.parse(ls4.getItem('lonsha-snapshot-checkpoint::c1::甲')).floor, 12,
        '`floor: null` 算没给 ⇒ 回落当前楼层（有意取舍，写进判据防后人当缺陷改）');
});

/** 真 localStorage 形状（length + key(i)）—— 走模块 fromLocalStorage 的唯一形态。 */
function lsLike() {
    const m = new Map();
    return {
        get length() { return m.size; },
        key(i) { return Array.from(m.keys())[i] ?? null; },
        getItem(k) { return m.has(k) ? m.get(k) : null; },
        setItem(k, v) { m.set(String(k), String(v)); },
        removeItem(k) { m.delete(String(k)); },
        has(k) { return m.has(String(k)); }
    };
}

/* ══════════ D 展示层同族（4 个文案口） ══════════ */

test('D1. ★★★ 展示层不得把 `null` 念成 1970 / 第 0 楼（同族第二处）', () => {
    /* 为什么单列：模块层修好了 `null`，展示层若仍写 `Number.isFinite(Number(x))`，
     * 面板照样把 null 显示成「第 0 楼 · 1970/1/1」—— 第一处的病在第二处复发。
     * 判据：文案口体内不得再出现裸 `Number.isFinite(Number(`。 */
    for (const n of ['checkpointMenuItems', 'checkpointDetailLines', 'checkpointRestorePreviewLines', 'checkpointBranchesDiffLines']) {
        const body = extractMethod(IDX, n);
        assert.ok(body, '找不到文案口 ' + n);
        assert.equal(/Number\.isFinite\(Number\(/.test(body), false, n + ' 体内不得再用旧判据（会把 null 念成 0）');
        assert.ok(/_numOrNull\(/.test(body), n + ' 必须走 _numOrNull 分界口');
    }
    /* 真跑：`floor: null` 的记录渲染出来必须说「楼层未记」，不得出现「第 0 楼」。 */
    const NEEDED = ['_numOrNull', '_floorOrNull', 'checkpointStore', '_checkpointLib', 'saveCheckpoint',
        'listCheckpoints', 'readCheckpoint', 'dropCheckpoint', 'previewCheckpointRestore', 'compareBranchCheckpoints',
        'checkpointMenuItems', 'checkpointDetailLines', 'checkpointRestorePreviewLines', 'checkpointBranchesDiffLines'];
    const bag = NEEDED.map((n) => extractMethod(IDX, n)).filter(Boolean).join(',\n');
    const ls = lsLike();
    const mk = () => new Function('window', 'localStorage', '_moduleLib', 'errLog', `
        return ({ ${bag}, getCurrentChatId() { return 'c1'; }, collectExport() { return ${JSON.stringify(payloadOf())}; } });
    `)({ LonShaSnapshotCheckpoint: CP }, ls, (g) => { try { return g(); } catch (_e) { return null; } }, () => {});
    const eng = mk();
    eng._currentFloor = -1;
    assert.equal(eng.saveCheckpoint('甲', {}).ok, true);
    const html = eng.checkpointMenuItems();
    assert.equal(typeof html, 'string');
    assert.ok(html.includes('楼层未记'), '菜单行必须说「楼层未记」：' + html);
    assert.equal(html.includes('第 0 楼'), false, '不得把「没给」念成「第 0 楼」：' + html);
    const detail = eng.checkpointDetailLines('甲');
    assert.ok(detail && detail.includes('楼层未记'), '详情必须说「楼层未记」：' + detail);
    assert.equal(/第 -?\d+ 楼/.test(detail.replace('楼层未记', '')), false, '详情不得出现任何楼层数字：' + detail);
});

/* ══════════ E 单真源（全仓不得有第二处旧判据） ══════════ */

test('E1. ★★ 检查点相关面上，旧判据只能作为「历史注释」出现，不得出现在代码里', () => {
    /* 范围刻意收窄到本版动过的两个文件 + 检查点相关方法：
     * 本仓其余模块（memory-entropy / evidence 等）的历史判据不在本版口径内，
     * 一刀切扫全仓会把「不属于本版」的东西算进来 —— 那是判据越界，不是实现缺陷。 */
    const offenders = [];
    const scan = (txt, label) => {
        const lines = txt.split('\n');
        lines.forEach((l, i) => {
            if (!/Number\.isFinite\(Number\(/.test(l)) return;
            if (/^\s*(\*|\/\/)/.test(l)) return;   // 注释与文档块不算代码
            /* 收窄到**检查点面**的字段名：`p.floor` 这种宽泛模式会命中承诺账本
             *   （`addPromise` 的 floor，另一套数据、与本版无关）—— 判据越界会逼实现
             *   去改不属于本版的地方。改判「检查点面」的具名读数。 */
            if (/checkpoint|it\.at|it\.floor|it\.meta|rec\.at|rec\.floor|mt\.(keyCount|bytes|schemaVersion)|p\.floor|p\.willRestoreCount|d\.bytes/i.test(l)) {
                offenders.push(label + ':' + (i + 1) + ' ' + l.trim().slice(0, 80));
            }
        });
    };
    scan(IDX, 'index.js');
    scan(SRC, 'snapshot-checkpoint.js');
    assert.deepEqual(offenders, [], '检查点面上不得再有旧判据（应走 _numOrNull / numOrNull）：\n' + offenders.join('\n'));
});

test('E2. ★★ 引擎与模块的「数或 null」实现是两份但同判据（各自存在的理由写明）', () => {
    /* 两份是**有意**的（模块不加载时引擎侧仍要工作），故不判「必须一份」，
     * 而判「判据等价」—— A2 已逐输入证明；这里只钉住两处都在场且都被消费。 */
    assert.ok(/_numOrNull\(v\) \{/.test(IDX), 'index.js 的定义在场');
    assert.ok(/function numOrNull\(v\) \{/.test(SRC), '模块的定义在场');
    assert.ok(IDX.includes('this._numOrNull('), '引擎侧定义必须被自己消费（不能只定义不用）');
    assert.ok(SRC.includes('numOrNull('), '模块侧定义必须被自己消费');
    /* 且 `_floorOrNull` 必须建立在 `_numOrNull` 之上（不是再抄一份判据）。 */
    const floorBody = extractMethod(IDX, '_floorOrNull');
    assert.ok(/this\._numOrNull\(v\)/.test(floorBody), '_floorOrNull 必须复用 _numOrNull');
});

/* ══════════ F 负控制（真源码破坏 → 副本 → 同款判据必须转红） ══════════ */

/** 真源码破坏 → 写破坏副本 → 在副本上重跑同一批真判据（必须转红）。 */
async function withBrokenCopy(anchor, replacement, fn) {
    const hits = SRC.split(anchor).length - 1;
    assert.equal(hits, 1, '破坏锚点必须恰中 1 次，实测 ' + hits + '：' + anchor.slice(0, 60));
    const broken = SRC.replace(anchor, replacement);
    assert.notEqual(broken, SRC, '破坏必须真的改变源文本');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3239-neg-'));
    const file = path.join(dir, 'snapshot-checkpoint.cjs');
    fs.writeFileSync(file, broken, 'utf8');
    try {
        const m = await import(pathToFileURL(file).href);
        return fn(m.default || m);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('F1. ★★★ 负控制：把分界口改回旧判据 ⇒ 同款真判据必须转红', async () => {
    /* 破坏形态的选取纪律（本轮实测的教训）：第一版把锚点打在 `null` 守卫上，
     *   而 `numOrNull(null)` 的结果由**最前面的 null 分支**决定 ——
     *   拿掉布尔守卫对 `null` 毫无影响 ⇒ 破坏**不可观测**，F1 报「Missing expected exception」。
     *   正确锚点 = 那条**真的在拦 `[]`** 的判据（对象/函数守卫）。 */
    await withBrokenCopy(
        "    if (typeof v === 'boolean' || typeof v === 'object' || typeof v === 'function') return null;",
        "    if (typeof v === 'boolean') return null;",
        (mod) => {
            /* 原样搬 A1 的真判据：它**必须**在破坏副本上失败（[] 会被 Number() 压成 0）。 */
            assert.throws(() => {
                assert.equal(mod.numOrNull([]), null, '「给了但不是数」必须是 null');
            }, /「给了但不是数」必须是 null/, '真判据在破坏副本上必须转红（否则破坏没被观测到）');
            return true;
        }
    );
    /* 两向自证：原版上同款判据必须真成立。 */
    assert.equal(CP.numOrNull(null), null);
    assert.equal(CP.numOrNull(''), null);
});

test('F2. ★★★ 负控制：把 `floor` 判据改回旧式 ⇒ 「没给 ≠ 给了 0」必须转红', async () => {
    await withBrokenCopy(
        '    const floor = numOrNull(opts.floor);',
        '    const floor = Number.isFinite(Number(opts.floor)) ? Number(opts.floor) : null;',
        (mod) => {
            const st = memStore();
            mod.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), floor: null });
            const rec = JSON.parse(st.getItem(mod.checkpointKey('c1', '甲')));
            assert.notEqual(rec.floor, null, '破坏副本上 `floor: null` 被压成 0 ⇒ 真判据「必须 null」在此转红');
            return true;
        }
    );
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), floor: null });
    assert.equal(JSON.parse(st.getItem(CP.checkpointKey('c1', '甲'))).floor, null);
});

test('F3. ★★★ 负控制：把 `schemaVersion` 判据改回旧式 ⇒ 代际面必须转红', async () => {
    await withBrokenCopy(
        '        schemaVersion: p ? numOrNull(p.schemaVersion) : null,',
        '        schemaVersion: p && Number.isFinite(Number(p.schemaVersion)) ? Number(p.schemaVersion) : null,',
        (mod) => {
            assert.notEqual(mod.payloadMeta({ schemaVersion: null }).schemaVersion, null,
                '破坏副本上「未给代际」被报成 0 ⇒ 真判据「必须是 null」在此转红');
            return true;
        }
    );
    assert.equal(CP.payloadMeta({ schemaVersion: null }).schemaVersion, null);
});

/* ══════════ G 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));
test('G1. ★ 版本锚（本套件只在 3.239.0 及以后成立；三源一致）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const mf = JSON.parse(read(path.join(ROOT, 'manifest.json')));
    const codeVer = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.ok(vnum(codeVer) >= vnum('3.239.0'), '本套件只在 3.239.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer, 'package.json 与 index.js 同源');
    assert.equal(mf.version, codeVer, 'manifest.json 与 index.js 同源');
});
