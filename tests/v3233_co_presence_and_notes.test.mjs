// tests/v3233_co_presence_and_notes.test.mjs — F-3 同楼同刻读数 + F-6 口径自述 [v3.232.0]
//
//   F-3：`presence` 一直逐人记着「谁在哪一楼」，但**没有任何出口回答「同一层楼里是不是有两个以上的人」**
//     —— 而那正是剧情冲突的**事实前提**。下游要做这个读数只能自己遍历再分组（同一口径抄 N 份的种子）。
//   F-6：两条观察项（T17 重复调用会再次平移 / T16 未收结局事件时如实 pending）此前只写在注释与文档里。
//
//   ★ 两件事共同的纪律：**只给事实，不给判断**。
//     F-3 只回「同楼同刻有谁」，**不含冲突的激烈程度 / 关系 / 意图 / 后果**；
//     F-6 只回「我们怎么算的」，**不改口径本身**。
//
//   本版探针当场抓到一条真缺陷（三态塌成两态的新形态）：`coPresence('没给')` 与 `coPresence()`
//     同义 —— 「给了但解不出」被当成了「没给」，读数从「空」变成「全量」而调用方看不出差别。
//     与 O-1（`rollbackFrom(null)` 不得当第 0 楼）同族，故修法与判据同款。
//
//   覆盖：A 出口与口径 / B 行为面（含边界与反场景）/ C summary 带出 / D bounding / E 负控制 / F 版本锚
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SB_SRC = read('scene-book.js');
const req = createRequire(import.meta.url);
const SB = req(path.join(ROOT, 'scene-book.js'));

/** 造一个带两处地点 + 三个在场者的场景账本 */
function mk() {
    const s = new SB.SceneBook();
    s.apply([{ action: 'add', path: ['城A', '钟楼'], desc: '钟楼' }], 3);
    s.apply([{ action: 'add', path: ['城A', '集市'], desc: '集市' }], 5);
    s.setPresence('甲', ['城A', '钟楼'], 7);
    s.setPresence('乙', ['城A', '钟楼'], 7);
    s.setPresence('丙', ['城A', '集市'], 7);
    return s;
}

/* ══════════ A 出口与口径 ══════════ */
test('v3233 A1. ★★ 两个出口都在，且常量与 api 导出齐备', () => {
    /* 签名不同：coPresence(floor) 带参、observationNotes() 不带。
     *   首版用同一个正则套两个方法（`\(floor\)?`）——对 observationNotes 是**判据写错**，
     *   不是产品缺方法。改按各自的真签名判。 */
    assert.match(SB_SRC, /\n    coPresence\(floor\) \{/, 'coPresence 定义在场（带参）');
    assert.match(SB_SRC, /\n    observationNotes\(\) \{/, 'observationNotes 定义在场（无参）');
    assert.match(SB_SRC, /const MAX_CO_PRESENCE_ROWS = \d+;/, '读数的界必须显式');
    assert.equal(SB.MAX_CO_PRESENCE_ROWS, 120, '常量须经 api 导出（下游要能读到界）');
});

test('v3233 A2. ★★★ ★边界：只给事实，不给判断（不得出现冲突激烈程度类字段）', () => {
    /* 这条是本版的**口径纪律**：账本能回答「两人此刻都在钟楼」，
     *   不能回答「他们会不会打起来」。把后者塞进读数就是拿猜测冒充事实。 */
    const s = mk();
    const r = s.coPresence();
    assert.deepEqual(Object.keys(r.rows[0]).sort(), ['count', 'floor', 'key', 'names', 'path'], 'row 字段面恒定');
    const txt = JSON.stringify(r);
    for (const bad of ['severity', 'tension', 'conflict', 'risk', 'intent', 'relation', 'emotion']) {
        assert.equal(txt.includes(bad), false, '★ 读数里不得出现判断类字段：' + bad);
    }
    assert.match(SB_SRC, /绝不猜冲突的激烈程度/, '源码面须写明这条边界');
});

test('v3233 A3. ★★★ F-6 自述面：两条观察项字段齐备 + 不改口径本身（无副作用）', () => {
    const s = mk();
    const before = JSON.stringify(s.coPresence());
    const n1 = s.observationNotes(), n2 = s.observationNotes();
    assert.equal(n1.count, 2, '两条观察项');
    assert.deepEqual(n1.notes.map((x) => x.id).sort(), ['T16', 'T17'], '须点名 T16 与 T17');
    for (const x of n1.notes) {
        for (const k of ['id', 'subject', 'kind', 'statement', 'reason', 'caller_duty', 'severity']) {
            assert.ok(x[k], x.id + ' 缺字段：' + k);
        }
        assert.ok(x.reason.length >= 15, x.id + ' 的理由不得是空话（要说清为什么这么做）');
        assert.ok(x.caller_duty.length >= 5, x.id + ' 须写明调用方该干什么');
        assert.equal(x.severity, 'observation', x.id + ' 须如实标为观察项（不是缺陷）');
    }
    assert.equal(JSON.stringify(n1), JSON.stringify(n2), '自述面幂等');
    assert.equal(JSON.stringify(s.coPresence()), before, '★ 自述面不得改动任何读数（不改口径本身）');
    /* 源码面：必须写明「不改口径本身」与 T17 为什么不加去重 */
    assert.match(SB_SRC, /不改口径本身/, '须写明不改口径本身');
    assert.match(SB_SRC, /第二个真源/, 'T17 须写明「加去重会引入第二个真源」的理由');
});

/* ══════════ B 行为面 ══════════ */
test('v3233 B1. ★★★ 同楼两人 ⇒ 一条 row；名单按拼音稳定排序（顺序无关）', () => {
    const s = mk();
    const r = s.coPresence();
    assert.equal(r.count, 1, '只有钟楼够两人');
    assert.equal(r.rows[0].floor, 7);
    assert.equal(r.rows[0].key, '城A/钟楼');
    assert.deepEqual(r.rows[0].names, ['甲', '乙'], '★ 按拼音排序（默认码点序会给出「乙 < 甲」这种稳定但不可读的顺序）');
    assert.equal(r.rows[0].count, 2);
    /* 插入顺序无关（读数可复现） */
    const s2 = mk();
    s2.presence = new Map([...s2.presence].reverse());
    assert.deepEqual(s2.coPresence().rows[0].names, ['甲', '乙'], '名单顺序不随插入顺序抖动');
});

test('v3233 B2. ★★★ 单人 ⇒ 零行（≥2 才是「同楼同刻」）；总数仍如实给出', () => {
    const s = mk();
    s.presence.delete('乙');
    const r = s.coPresence();
    assert.equal(r.count, 0, '一人不算同楼同刻');
    assert.equal(r.totalPresent, 2, '总数须如实（有人在场，只是没凑成对）');
});

test('v3233 B3. ★★★★ 「没给楼层」不进任何一层楼，且如实计数（不与别的「没给」凑一组）', () => {
    const s = mk();
    s.presence.set('丁', { key: '城A/钟楼', path: ['城A', '钟楼'], atFloor: null, at: 0 });
    s.presence.set('戊', { key: '城A/钟楼', path: ['城A', '钟楼'], atFloor: null, at: 0 });
    const r = s.coPresence();
    assert.equal(r.skippedUnknownFloor, 2, '★ 「说不出在第几楼」要如实计数');
    assert.equal(r.count, 1, '★ 两个「没给」不得被凑成一组（说不出 ≠ 同楼）');
    assert.deepEqual(r.rows[0].names, ['甲', '乙'], '只有真给了楼层的人才成组');
});

test('v3233 B4. ★★★★ 三态：「没给」与「给了但解不出」不是一回事（本版探针抓到的缺陷）', () => {
    const s = mk();
    /* 没给 ⇒ 算全部（这是有意的：缺省即全量） */
    assert.equal(s.coPresence().count, 1, '不带参数 = 全部楼层');
    /* 给了但解不出 ⇒ **拒绝并返回空**，而不是当作「你没问」 */
    const bad = s.coPresence('没给');
    assert.equal(bad.count, 0, '★ 给了但解不出必须返回空（首版与不带参数同义 ⇒ 读数从空变全量而调用方看不出）');
    assert.equal(bad.rejected, 'floor-unparsable', '须如实说明拒绝原因');
    for (const v of [null, '', {}, [], NaN, 'x']) {
        const r = s.coPresence(v);
        assert.equal(r.count, 0, '解不出的入参一律拒绝：' + JSON.stringify(v));
    }
    /* 而合法楼层照常（0 是合法楼层：真给 0 才该只算第 0 楼） */
    assert.equal(s.coPresence(7).count, 1, '合法楼层照常');
    assert.equal(s.coPresence(0).count, 0, '给了第 0 楼 ⇒ 只算第 0 楼（空），不是「全部」');
    assert.equal(s.coPresence(0).rejected, undefined, '第 0 楼不是拒绝，是如实的空');
});

test('v3233 B5. ★★ 同楼不同地 ⇒ 两条 row（按地点分组，不按楼层合并）', () => {
    const s = mk();
    s.setPresence('己', ['城A', '集市'], 7);
    const r = s.coPresence();
    assert.equal(r.count, 2, '同一层楼的两处地点各成一条');
    /* 比较用与产品同一口径（拼音）：本判据里若用默认 `.sort()`（UTF-16 码点序），
     *   会得到与产品不同的次序 —— 那是**判据自己的口径错**，不是产品错。 */
    /* 两处地点均按拼音序（与产品同口径）：「集市」在「钟楼」前。
     *   ★ 首版这里写裸 `.sort()`（判据此处）而产品写裸 `.sort()`（实现彼处），两边都是码点序、
     *   于是**判据与实现同时错**而全都绿 —— 这正是「判据复制实现口径」的隐蔽形态。
     *   现产品已统一为拼音序，判据按拼音序比较（并额外断言名单与键**同序**）。 */
    assert.deepEqual(r.rows.map((x) => x.key), ['城A/集市', '城A/钟楼']);
    assert.deepEqual(r.rows[0].names, ['丙', '己'], 'keys 与 names 须同序（拼音）');
});

test('v3233 B6. ★★ 绝不抛：坏数据 / 空账本一律降级为空表', () => {
    const s = new SB.SceneBook();
    assert.equal(s.coPresence().count, 0, '空账本 ⇒ 空表（不编造）');
    s.presence = new Map([['坏', null], ['坏2', {}], ['坏3', { key: 'x', atFloor: {} }], ['好', { key: 'x/y', atFloor: 1, at: 0 }]]);
    let threw = false;
    try { s.coPresence(); s.coPresence(null); s.coPresence(1); s.observationNotes(); } catch (_e) { threw = true; }
    assert.equal(threw, false, '坏数据不得外抛');
});

/* ══════════ C summary 带出 ══════════ */
test('v3233 C1. ★★★ summary() 带上两面（下游快照自动获得 + meta.fieldTypes 三态）', () => {
    const s = mk();
    const sum = s.summary();
    assert.ok(sum.coPresence && typeof sum.coPresence.count === 'number', 'summary 须带 coPresence');
    assert.equal(sum.coPresence.count, 1, '读数与直接调用一致（同一读取时刻同一实例）');
    assert.ok(sum.observationNotes && sum.observationNotes.count === 2, 'summary 须带 observationNotes');
    /* 可 JSON 化（外供面要求：不含 Map/函数） */
    let ok = true;
    try { JSON.parse(JSON.stringify(sum)); } catch (_e) { ok = false; }
    assert.equal(ok, true, 'summary 必须可直接序列化');
});

/* ══════════ D bounding ══════════ */
test('v3233 D1. ★★ 有界：条数超过上限时如实截断，而计数仍是截断前的', () => {
    const s = new SB.SceneBook();
    s.apply([{ action: 'add', path: ['城A', '厅'], desc: '厅' }], 1);
    /* 造 MAX+10 个「同楼同刻」的地点：每处两人（分派到不同子地点） */
    const N = SB.MAX_CO_PRESENCE_ROWS + 10;
    for (let i = 0; i < N; i++) {
        s.presence.set('甲' + i, { key: '城A/厅/r' + i, path: ['城A', '厅', 'r' + i], atFloor: 1, at: 0 });
        s.presence.set('乙' + i, { key: '城A/厅/r' + i, path: ['城A', '厅', 'r' + i], atFloor: 1, at: 0 });
    }
    const r = s.coPresence();
    assert.equal(r.rows.length, SB.MAX_CO_PRESENCE_ROWS, 'rows 须被截到上限');
    assert.equal(r.count, N, '★ count 必须是**截断前**的真实条数（不许被截断改写）');
});

/* ══════════ E 负控制（真源码破坏 → 破坏副本上重跑同款真判据） ══════════ */
const isAssertionFailure = (e) => e && e.name === 'AssertionError';

function withBrokenScene(mutate, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3233-'));
    try {
        const broken = mutate(SB_SRC);
        assert.notEqual(broken, SB_SRC, '破坏必须真发生');
        const p = path.join(dir, 'scene-book.js');
        fs.writeFileSync(p, broken);
        const mod = req(p);
        return fn(mod);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('v3233 N1. ★★★★ 破坏「三态」（把「给了但解不出」当「没给」）⇒ B4 同款判据必须转红', () => {
    const anchor = "            const provided = arguments.length > 0;\n            const want = provided ? numOrNull(floor) : null;";
    assert.equal(SB_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenScene((s) => s.replace(anchor,
        "            const provided = false;\n            const want = provided ? numOrNull(floor) : null;"), (M) => {
        const x = new M.SceneBook();
        x.apply([{ action: 'add', path: ['城A', '钟楼'] }], 3);
        x.setPresence('甲', ['城A', '钟楼'], 7);
        x.setPresence('乙', ['城A', '钟楼'], 7);
        assert.throws(() => assert.equal(x.coPresence('没给').count, 0, '解不出的入参必须拒绝'),
            isAssertionFailure, 'B4 同款判据在破坏副本上必须抛');
        assert.equal(x.coPresence('没给').count, 1, '（破坏已生效：给了解不出的值反而拿到了全量读数）');
    });
});

test('v3233 N2. ★★★ 破坏「没给不进任何一层楼」⇒ B3 同款判据必须转红', () => {
    const anchor = "                if (f === null) { skipped += 1; continue; }      // 「没给」不进任何一层楼";
    assert.equal(SB_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenScene((s) => s.replace(anchor, "                if (false) { skipped += 1; continue; }"), (M) => {
        const x = new M.SceneBook();
        x.apply([{ action: 'add', path: ['城A', '钟楼'] }], 3);
        x.setPresence('甲', ['城A', '钟楼'], 7);
        x.presence.set('丁', { key: '城A/钟楼', path: ['城A', '钟楼'], atFloor: null, at: 0 });
        x.presence.set('戊', { key: '城A/钟楼', path: ['城A', '钟楼'], atFloor: null, at: 0 });
        assert.throws(() => assert.deepEqual(x.coPresence().rows[0].names, ['甲'], '「没给」不得与给楼层的人凑一组'),
            isAssertionFailure, 'B3 同款判据在破坏副本上必须抛');
        /* 破坏后的**真形态**（首版这里猜错了）：不是三个人挤在同一组，而是——
         *   「没给」的两个人自己凑成一组（floor=null、count=2），而甲一个人留在第 7 楼。
         *   即破坏的后果是「**凭空多出一组说不出在哪的『同楼同刻』**」——
         *   数字对得上（仍是两条组），但组的内容是编造的。故负控制的观测点必须写成这个形状，
         *   否则「破坏已生效」这句断言本身会被**错误的预期**带红（那是判据自己的问题）。 */
        const rows = x.coPresence().rows;
        assert.equal(rows.length, 1, '（破坏已生效：只剩「没给」那一组）');
        assert.equal(rows[0].floor, null, '（破坏已生效：这组的楼层是 null —— 凭空造出一组说不出在哪的「同楼同刻」）');
        assert.deepEqual(rows[0].names, ['丁', '戊'], '（破坏已生效：两个「没给」被当成同组）');
    });
});

test('v3233 N3. ★★★ 破坏「F-6 无副作用 / 不改口径」⇒ A3 同款判据必须转红', () => {
    const anchor = "    observationNotes() {\n        return {\n            version: SCENE_VERSION,";
    assert.equal(SB_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenScene((s) => s.replace(anchor,
        "    observationNotes() {\n        this.presence.clear();   // 破坏：自述时顺手改了状态\n        return {\n            version: SCENE_VERSION,"), (M) => {
        const x = new M.SceneBook();
        x.apply([{ action: 'add', path: ['城A', '钟楼'] }], 3);
        x.setPresence('甲', ['城A', '钟楼'], 7);
        x.setPresence('乙', ['城A', '钟楼'], 7);
        const before = JSON.stringify(x.coPresence());
        x.observationNotes();
        assert.throws(() => assert.equal(JSON.stringify(x.coPresence()), before, '自述面不得改动读数'),
            isAssertionFailure, 'A3 同款判据在破坏副本上必须抛');
    });
});

/* ══════════ F 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3233 F1. ★ 版本锚（下限形）+ 三源同源', () => {
    const pkg = JSON.parse(read('package.json'));
    const mf = JSON.parse(read('manifest.json'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(read('index.js')) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.equal(pkg.version, codeVer, 'package 同源');
    assert.equal(mf.version, codeVer, 'manifest 同源');
    assert.ok(vnum(codeVer) >= vnum('3.232.0'), '本套件只在 3.232.0 及以后成立；当前 ' + codeVer);
});