// tests/v3237_checkpoint_and_branch_diff.test.mjs — R4-C 命名检查点 + 分支只读对照（v3.237.0）
//
//   本版把 R4-B 登记出来的「一份」变成「可命名留手 / 可并排对照」：
//     · 检查点取名字存下来（覆盖**可见**、上限淘汰**报数**）；
//     · 恢复**只出预览**（键面差异 + 代际读数），真正落地仍走 restoreFromPayload 一条管线；
//     · 两份检查点并排对照 = 分支只读对照（**零写**）。
//
//   ★ 本仓的老账（写进判据，防止再犯）：
//     ① 「没给」与「给了 0」必须**不同形** —— 无 store / 形态不合 / 读取抛 时 `items === null`；
//        只有 store 在位且真没有记录才是 `[]`。同形正是 O-1 / R3-D / F-8 抓过的缺陷形态。
//     ② 降级必须**留名** —— 名字非法 / 缺会话身份如实报，不静默截断或编默认值。
//     ③ 覆盖必须**可见** —— 同名再存带 `overwritten:true` + 旧读数，不静默替换。
//     ④ 上限淘汰**必须报数** —— `evicted` 名单；且 `evicted === null`（没查成）与 `[]`（查了没淘汰）不同形。
//     ⑤ 只读面**零写** —— list/read/preview/compare 全程不得触发 setItem/removeItem。
//     ⑥ 读取**绝不抛** —— 怪 getter / 畸形 JSON 降级为 reason。
//
//   覆盖：
//     A 模块面（导出在场 / 无裸 window / REASONS 齐备 / localStorage 形状唯一知情）
//     B 存读删真跑（往返一致 / 命名空间隔离 / 会话隔离）
//     C 四态分形（无 store / 形态不合 / 空清单 / 有记录）
//     D 覆盖可见 + 淘汰报数
//     E 只读面零写（写动作日志为空）
//     F 预览与对照（键面差异 / 代际跨代标记 / 缺失侧如实报）
//     G 绝不抛（怪 getter / 畸形 JSON）
//     H 负控制三条（真源码破坏 → 加载破坏副本 → 同款真判据必须转红）
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
const SRC = path.join(ROOT, 'snapshot-checkpoint.js');
const SRC_TXT = fs.readFileSync(SRC, 'utf8');

/** 内存 store：契约形状 + 写动作日志（用于证明只读面零写）。 */
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
/** localStorage 形状（length + key(i)）——只用于验证包层，不参与契约。 */
function lsShape(entries) {
    const arr = Object.entries(entries || {});
    return {
        length: arr.length,
        key: (i) => (arr[i] ? arr[i][0] : null),
        getItem: (k) => { const e = arr.find(([kk]) => kk === k); return e ? e[1] : null; },
        setItem: () => {},
        removeItem: () => {}
    };
}
const payloadOf = (o) => Object.assign({
    version: '3.237.0', producerVersion: '3.237.0', schemaVersion: 2, packedAt: '2026-01-01T00:00:00.000Z',
    graph: {}, summaries: {}, diaries: {}
}, o || {});

// ---------------------------------------------------------------- A 模块面
test('A1 导出在场且形状正确', () => {
    const need = ['NAMESPACE', 'CHECKPOINT_LIMIT', 'NAME_MAX', 'REASONS', 'probeStore', 'fromLocalStorage',
        'normalizeName', 'normalizeChatId', 'checkpointKey', 'payloadKeys', 'payloadMeta',
        'saveCheckpoint', 'listCheckpoints', 'readCheckpoint', 'dropCheckpoint', 'diffPayloads',
        'previewRestore', 'compareCheckpoints', 'describe'];
    for (const k of need) assert.ok(k in CP, `导出缺失：${k}`);
    for (const f of ['probeStore', 'fromLocalStorage', 'normalizeName', 'normalizeChatId', 'checkpointKey',
        'payloadKeys', 'payloadMeta', 'saveCheckpoint', 'listCheckpoints', 'readCheckpoint', 'dropCheckpoint',
        'diffPayloads', 'previewRestore', 'compareCheckpoints', 'describe']) {
        assert.equal(typeof CP[f], 'function', `${f} 应为函数`);
    }
});

test('A2 源码不出现裸 window 直读（除 IIFE 收尾的宿主判定）', () => {
    // 注释里的示例（含文档块）不算直读：先剥块注释，再剥行注释。
    const body = SRC_TXT.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const hits = body.match(/\bwindow\./g) || [];
    assert.equal(hits.length, 0, `不得直读 window.<成员>，实测 ${hits.length} 处`);
    // 尾部 IIFE 的宿主判定是该文件唯一的 window 出现处（与既有模块同款）。
    const raw = SRC_TXT.match(/typeof window/g) || [];
    assert.equal(raw.length, 1, `typeof window 只许出现在 IIFE 收尾，实测 ${raw.length} 处`);
    assert.match(SRC_TXT, /typeof window !== 'undefined' \? window : globalThis/);
});

test('A3 REASONS 齐备且 describe 可念出', () => {
    for (const r of ['store-absent', 'store-mismatch', 'store-threw', 'no-chat-id', 'name-invalid', 'not-found', 'corrupt', 'ok']) {
        assert.ok(CP.REASONS[r], `REASONS 缺 ${r}`);
        assert.notEqual(CP.describe(r), r, `${r} 应有一句人话`);
    }
    assert.equal(CP.describe('没这个理由'), '没这个理由');
    assert.equal(CP.describe(null), '未知');
});

test('A4 localStorage 形状是唯一知情者（包层能枚举）', () => {
    const s = CP.fromLocalStorage(lsShape({ a: '1', b: '2' }));
    assert.ok(s, '应符合形态');
    assert.deepEqual(s.keys().sort(), ['a', 'b']);
    assert.equal(s.getItem('a'), '1');
    // 形态不合即 null（不给半个对象）。
    assert.equal(CP.fromLocalStorage({ getItem() {}, setItem() {}, removeItem() {} }), null);
    assert.equal(CP.fromLocalStorage(null), null);
});

test('A5 全仓不得有第二处自写 localStorage 形态判据', () => {
    const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js'));
    const offenders = [];
    for (const f of files) {
        const txt = fs.readFileSync(path.join(ROOT, f), 'utf8');
        // 「length + key(i)」形态判断若出现在本模块以外，即为同一口径被抄两份。
        if (f === 'snapshot-checkpoint.js') continue;
        if (/\.key\(\s*i\s*\)/.test(txt) && /typeof\s+\w+\.key\s*===?\s*['"]function['"]/.test(txt)) offenders.push(f);
    }
    assert.deepEqual(offenders, [], `同口径被抄到第二处：${offenders.join(', ')}`);
});

// ---------------------------------------------------------------- B 存读删
test('B1 存-读-列-删往返一致', () => {
    const st = memStore();
    const r = CP.saveCheckpoint(st, { chatId: 'c1', name: '改名之前', payload: payloadOf(), at: 1000, floor: 12, note: '留手' });
    assert.equal(r.ok, true);
    assert.equal(r.name, '改名之前');
    assert.equal(r.overwritten, false);
    assert.equal(r.key, CP.checkpointKey('c1', '改名之前'));
    assert.equal(r.meta.keyCount, 7);

    const rd = CP.readCheckpoint(st, 'c1', '改名之前');
    assert.equal(rd.ok, true);
    assert.equal(rd.record.floor, 12);
    assert.equal(rd.record.note, '留手');
    assert.equal(rd.record.payload.graph !== undefined, true);

    const ls = CP.listCheckpoints(st, 'c1');
    assert.equal(ls.ok, true);
    assert.equal(ls.items.length, 1);
    assert.equal(ls.items[0].name, '改名之前');
    assert.equal(ls.items[0].at, 1000);

    assert.equal(CP.dropCheckpoint(st, 'c1', '改名之前').existed, true);
    assert.equal(CP.readCheckpoint(st, 'c1', '改名之前').reason, 'not-found');
    // 幂等：再删一次不报错，只报 existed:false。
    const again = CP.dropCheckpoint(st, 'c1', '改名之前');
    assert.equal(again.ok, true);
    assert.equal(again.existed, false);
});

test('B2 会话隔离与命名空间隔离（不串档）', () => {
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: 1 });
    CP.saveCheckpoint(st, { chatId: 'c2', name: '甲', payload: payloadOf({ version: 'x' }), at: 2 });
    assert.equal(CP.listCheckpoints(st, 'c1').items.length, 1);
    assert.equal(CP.listCheckpoints(st, 'c2').items.length, 1);
    assert.equal(CP.readCheckpoint(st, 'c2', '甲').record.payload.version, 'x');
    // 键必须带命名空间前缀（同一个域里有别的插件）。
    for (const k of st.keys()) assert.ok(k.startsWith(CP.NAMESPACE + '::'), `键未加命名空间：${k}`);
});

test('B3 名字 / 会话身份非法即留名，不静默救回', () => {
    const st = memStore();
    assert.equal(CP.saveCheckpoint(st, { chatId: 'c1', name: '', payload: payloadOf() }).reason, 'name-invalid');
    assert.equal(CP.saveCheckpoint(st, { chatId: 'c1', name: '  ', payload: payloadOf() }).reason, 'name-invalid');
    assert.equal(CP.saveCheckpoint(st, { chatId: 'c1', name: 'x'.repeat(CP.NAME_MAX + 1), payload: payloadOf() }).reason, 'name-invalid');
    assert.equal(CP.saveCheckpoint(st, { chatId: '', name: '甲', payload: payloadOf() }).reason, 'no-chat-id');
    assert.equal(CP.saveCheckpoint(st, { chatId: 'c1', name: '甲' }).reason, 'ok');   // 载荷缺失仍是合法记录（载荷为 null）
    assert.equal(st.keys().length, 1, '失败调用不得写任何键');
    assert.equal(CP.normalizeName(' 甲 ').name, '甲', '两端空白应被裁掉（这是规范化，不是改名救回）');
});

// ---------------------------------------------------------------- C 四态分形
test('C1 「没给」与「给了 0」不同形', () => {
    const absent = CP.listCheckpoints(null, 'c1');
    assert.equal(absent.items, null);
    assert.equal(absent.reason, 'store-absent');
    const mismatch = CP.listCheckpoints({}, 'c1');
    assert.equal(mismatch.items, null);
    assert.equal(mismatch.reason, 'store-mismatch');
    const noChat = CP.listCheckpoints(memStore(), '');
    assert.equal(noChat.items, null);
    assert.equal(noChat.reason, 'no-chat-id');
    // store 在位、真没有记录 ⇒ []（与上面三种 null 明确不同形）。
    const empty = CP.listCheckpoints(memStore(), 'c1');
    assert.equal(empty.ok, true);
    assert.deepEqual(empty.items, []);
});

test('C2 畸形记录不清空整份清单，但读单条时报 corrupt', () => {
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '好', payload: payloadOf(), at: 5 });
    st.setItem(CP.checkpointKey('c1', '坏'), '{不是 JSON');
    const ls = CP.listCheckpoints(st, 'c1');
    assert.equal(ls.ok, true);
    assert.equal(ls.items.length, 1, '坏记录跳过，好记录仍在');
    assert.equal(CP.readCheckpoint(st, 'c1', '坏').reason, 'corrupt');
});

// ---------------------------------------------------------------- D 覆盖与淘汰
test('D1 覆盖可见（带旧读数）', () => {
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: 100 });
    const r = CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf({ graph: { a: 1 } }), at: 200 });
    assert.equal(r.ok, true);
    assert.equal(r.overwritten, true, '同名再存必须自报覆盖');
    assert.equal(r.previousAt, 100, '必须带旧读数，否则「我以为存了两份」与「实际一份」同形');
    assert.equal(CP.listCheckpoints(st, 'c1').items.length, 1);
});

test('D2 超限淘汰报数，且 evicted 的 null 与 [] 不同形', () => {
    const st = memStore();
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    let last = null;
    names.forEach((n, i) => { last = CP.saveCheckpoint(st, { chatId: 'c1', name: n, payload: payloadOf(), at: 100 + i }); });
    assert.equal(last.evicted.length, 1, '第 6 份应淘汰 1 份');
    assert.deepEqual(last.evicted, ['a'], '淘汰最旧');
    assert.equal(CP.listCheckpoints(st, 'c1').items.length, CP.CHECKPOINT_LIMIT);
    assert.equal(CP.readCheckpoint(st, 'c1', 'a').reason, 'not-found');
    assert.equal(CP.readCheckpoint(st, 'c1', 'b').ok, true);
    // 首次存（未超限）⇒ evicted 是 [] 而不是 null：查成了、淘汰 0 份。
    const st2 = memStore();
    assert.deepEqual(CP.saveCheckpoint(st2, { chatId: 'c1', name: 'a', payload: payloadOf() }).evicted, []);
    // store 形态不合 ⇒ 连 `ok` 都不到，evicted 为 null（没查成）。
    assert.equal(CP.saveCheckpoint({}, { chatId: 'c1', name: 'a', payload: payloadOf() }).evicted, null);
});

// ---------------------------------------------------------------- E 只读面零写
test('E1 list / read / preview / compare 全程零写', () => {
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: 1 });
    CP.saveCheckpoint(st, { chatId: 'c1', name: '乙', payload: payloadOf({ graph: { a: 1 }, clock: {} }), at: 2 });
    st.log.length = 0;   // 只统计只读面
    const before = JSON.stringify(st.keys());
    CP.listCheckpoints(st, 'c1');
    CP.readCheckpoint(st, 'c1', '甲');
    CP.previewRestore(st, 'c1', '甲', payloadOf({ extra: 1 }));
    CP.compareCheckpoints(st, 'c1', '甲', '乙');
    CP.diffPayloads(payloadOf(), payloadOf({ q: 1 }));
    assert.deepEqual(st.log, [], `只读面发生了写动作：${JSON.stringify(st.log)}`);
    assert.equal(JSON.stringify(st.keys()), before, '键集合不得变化');
});

test('E2 取数面零全局污染（不得动别处的键）', () => {
    const st = memStore();
    st.setItem('别的插件::键', '不许动');
    CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf() });
    CP.readCheckpoint(st, 'c1', '甲');
    CP.dropCheckpoint(st, 'c1', '甲');
    assert.equal(st.getItem('别的插件::键'), '不许动');
    assert.deepEqual(st.keys(), ['别的插件::键'], '删除只许删自己命名空间下的键');
});

// ---------------------------------------------------------------- F 预览与对照
test('F1 预览只出计划，不执行恢复', () => {
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf({ schemaVersion: 1 }), at: 7 });
    st.log.length = 0;
    const pv = CP.previewRestore(st, 'c1', '甲', payloadOf({ schemaVersion: 2, brandNew: 1 }));
    assert.equal(pv.ok, true);
    assert.equal(pv.plan.dryRun, true);
    assert.equal(pv.plan.schemaCross, 'cross', '跨代必须标记');
    assert.equal(pv.plan.fromSchema, 2);
    assert.equal(pv.plan.toSchema, 1);
    assert.deepEqual(pv.diff.onlyInA, ['brandNew']);
    assert.deepEqual(pv.diff.onlyInB, []);
    assert.deepEqual(st.log, [], '预览不得有任何写动作');
    // 记录在、载荷没了 ⇒ corrupt（与「没有这份检查点」不同形）。
    const st2 = memStore();
    CP.saveCheckpoint(st2, { chatId: 'c1', name: '甲' });
    assert.equal(CP.previewRestore(st2, 'c1', '甲', payloadOf()).reason, 'corrupt');
    assert.equal(CP.previewRestore(st2, 'c1', '没有这份', payloadOf()).reason, 'not-found');
});

test('F2 分支只读对照：键面差异 + 缺失侧如实报', () => {
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '改前', payload: payloadOf({ schemaVersion: 1, graph: {} }), at: 1 });
    CP.saveCheckpoint(st, { chatId: 'c1', name: '改后', payload: payloadOf({ schemaVersion: 1, graph: {}, cse: {}, pulse: {} }), at: 2 });
    const c = CP.compareCheckpoints(st, 'c1', '改前', '改后');
    assert.equal(c.ok, true);
    assert.deepEqual(c.diff.onlyInB, ['cse', 'pulse']);
    assert.deepEqual(c.diff.onlyInA, []);
    assert.equal(c.diff.sameSchema, true);
    assert.ok(c.diff.bytesDelta > 0, '改后更大 ⇒ 差值为正');
    assert.equal(c.a.name, '改前');
    assert.equal(c.b.name, '改后');
    // 缺失侧：不拿空载荷冒充「那边是空的」。
    assert.equal(CP.compareCheckpoints(st, 'c1', '没有的', '改后').reason, 'a-missing');
    assert.equal(CP.compareCheckpoints(st, 'c1', '改前', '没有的').reason, 'b-missing');
    assert.equal(CP.compareCheckpoints({}, 'c1', '改前', '改后').reason, 'store-mismatch');
});

test('F3 diffPayloads 是纯函数（空载荷不炸、不抛）', () => {
    const d = CP.diffPayloads(null, undefined);
    assert.equal(d.comparable, true);
    assert.equal(d.empty, true);
    assert.equal(d.keyCountA, 0);
    assert.equal(d.keyCountB, 0);
    assert.equal(d.bytesDelta, 0);
});

// ---------------------------------------------------------------- G 绝不抛
test('G1 怪 getter / 抛异常的 store 一律降级为 reason', () => {
    const nasty = {
        getItem: () => { throw new Error('boom'); },
        setItem: () => { throw new Error('boom'); },
        removeItem: () => { throw new Error('boom'); },
        keys: () => { throw new Error('boom'); }
    };
    assert.equal(CP.readCheckpoint(nasty, 'c1', '甲').reason, 'not-found');
    assert.equal(CP.listCheckpoints(nasty, 'c1').reason, 'store-threw');
    assert.equal(CP.saveCheckpoint(nasty, { chatId: 'c1', name: '甲', payload: payloadOf() }).reason, 'store-threw');
    assert.equal(CP.dropCheckpoint(nasty, 'c1', '甲').ok, false);
    // 带抛错 getter 的宿主对象（取属性就抛）也不得外抛。
    const trap = {};
    Object.defineProperty(trap, 'getItem', { get() { throw new Error('trap'); } });
    Object.defineProperty(trap, 'setItem', { get() { throw new Error('trap'); } });
    Object.defineProperty(trap, 'removeItem', { get() { throw new Error('trap'); } });
    Object.defineProperty(trap, 'keys', { get() { throw new Error('trap'); } });
    assert.doesNotThrow(() => CP.listCheckpoints(trap, 'c1'));
    assert.equal(CP.listCheckpoints(trap, 'c1').items, null);
    assert.doesNotThrow(() => CP.saveCheckpoint(trap, { chatId: 'c1', name: '甲', payload: payloadOf() }));
});

test('G2 payloadMeta 面对无法序列化的载荷不抛', () => {
    const circular = {};
    circular.self = circular;
    const m = CP.payloadMeta(circular);
    assert.equal(m.bytes, 0, '序列化失败记 0，不外抛');
    assert.deepEqual(m.keys, ['self']);
    assert.equal(CP.payloadMeta(null).keyCount, 0);
});

// ---------------------------------------------------------------- I 版本与接线
function vnum(s) {
    const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

test('I1 三源同源且不低于本套件出生版本', () => {
    const idx = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const v = (/const VERSION = '([0-9.]+)'/.exec(idx) || [])[1];
    assert.ok(v, 'index.js 里应有 const VERSION');
    assert.equal(mf.version, v, 'manifest 与 index.js 同源');
    assert.equal(pkg.version, v, 'package.json 与 index.js 同源');
    assert.ok(vnum(v) >= vnum('3.237.0'), `当版 ${v} 不应低于本套件出生版本`);
});

test('I2 index.js 接线在场且取库口按本仓契约写', () => {
    const idx = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');
    for (const name of ['checkpointStore', 'saveCheckpoint', 'listCheckpoints', 'readCheckpoint',
        'dropCheckpoint', 'previewCheckpointRestore', 'compareBranchCheckpoints', '_checkpointLib']) {
        assert.ok(new RegExp('\\n\\s{8}' + name + '\\(').test(idx), `index.js 缺方法 ${name}`);
    }
    assert.match(idx, /return _moduleLib\(\(\) => window\.LonShaSnapshotCheckpoint, 'snapshot-checkpoint\.js'\)/,
        '取库口按本仓契约写（真读表达式 + 文件名）');
    // 存储形状判定不许被抄进引擎（A5 判据的引擎侧镜像）。
    assert.doesNotMatch(idx, /typeof\s+localStorage\.key\s*===?\s*'function'/, '引擎不得自写 localStorage 形态判据');
});

test('I3 manifest 登记了新模块，且 extra_js 无重复', () => {
    const mf = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    assert.ok(mf.extra_js.includes('snapshot-checkpoint.js'), 'extra_js 须登记 snapshot-checkpoint.js');
    assert.equal(new Set(mf.extra_js).size, mf.extra_js.length, 'extra_js 不得重复');
});

// ---------------------------------------------------------------- H 负控制
/** 真源码破坏 → 写破坏副本 → 在副本上重跑同一批真判据（必须转红）。 */
function withBrokenCopy(anchor, replacement, fn) {
    const hits = SRC_TXT.split(anchor).length - 1;
    assert.equal(hits, 1, `破坏锚点必须恰中 1 次，实测 ${hits}：${anchor.slice(0, 60)}`);
    const broken = SRC_TXT.replace(anchor, replacement);
    assert.notEqual(broken, SRC_TXT, '破坏必须真的改变源文本');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3237-neg-'));
    const file = path.join(dir, 'snapshot-checkpoint.cjs');
    fs.writeFileSync(file, broken, 'utf8');
    return import(pathToFileURL(file).href).then((m) => {
        const mod = m.default || m;
        try { return fn(mod); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    });
}

test('H1 负控制：破坏「没给 vs 给了 0 不同形」⇒ 同款判据必须转红', async () => {
    await withBrokenCopy(
        "if (!st.ok) return { ok: false, reason: st.reason, items: null };\n    const cid = normalizeChatId(chatId);\n    if (!cid.ok) return { ok: false, reason: cid.reason, items: null };",
        "if (!st.ok) return { ok: false, reason: st.reason, items: [] };\n    const cid = normalizeChatId(chatId);\n    if (!cid.ok) return { ok: false, reason: cid.reason, items: [] };",
        (mod) => {
            const absent = mod.listCheckpoints(null, 'c1');
            assert.notEqual(absent.items, null, '破坏副本上「无 store」不再是 null ⇒ 真判据「不同形」在此转红');
            const mismatch = mod.listCheckpoints({}, 'c1');
            assert.notEqual(mismatch.items, null, '破坏副本上「形态不合」不再是 null ⇒ 真判据「不同形」在此转红');
            return true;
        }
    );
    // 原版上同款判据必须成立（证明破坏可观测、不是恒真/恒假）。
    assert.equal(CP.listCheckpoints(null, 'c1').items, null);
    assert.equal(CP.listCheckpoints({}, 'c1').items, null);
});

test('H2 负控制：破坏「覆盖可见」⇒ 同款判据必须转红', async () => {
    await withBrokenCopy(
        'const overwritten = prev.ok === true;',
        'const overwritten = false;',
        (mod) => {
            const st = memStore();
            mod.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: 100 });
            const r = mod.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: 200 });
            assert.equal(r.overwritten, false, '破坏副本上覆盖不再可见（判据应在此转红）');
            return true;
        }
    );
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: 100 });
    assert.equal(CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: 200 }).overwritten, true);
});

test('H3 负控制：破坏「只读面零写」⇒ 同款判据必须转红', async () => {
    await withBrokenCopy(
        'function listCheckpoints(store, chatId) {\n    const st = probeStore(store);',
        "function listCheckpoints(store, chatId) {\n    const st = probeStore(store);\n    try { store.setItem(NAMESPACE + '::probe', '1'); } catch (_e) {}",
        (mod) => {
            // 把 E1 的真判据原样搬过来跑 —— 它**必须抛**（破坏可观测）。
            assert.throws(() => {
                const st = memStore();
                mod.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: 1 });
                st.log.length = 0;
                mod.listCheckpoints(st, 'c1');
                assert.equal(st.log.length, 0, '只读面零写：不得有写动作');
            }, /只读面零写/, '真判据在破坏副本上必须转红（否则破坏没被观测到）');
            return true;
        }
    );
    // 原版上同款判据必须真成立（两向自证：破坏可观测 + 原版无反应）。
    const st = memStore();
    CP.saveCheckpoint(st, { chatId: 'c1', name: '甲', payload: payloadOf(), at: 1 });
    st.log.length = 0;
    CP.listCheckpoints(st, 'c1');
    assert.equal(st.log.length, 0);
});
