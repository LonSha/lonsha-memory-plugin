// tests/v3184_changeset.test.mjs
// [v3.184.0] 行级变更集（changeset.js）——移植 nocturne_memory db/snapshot.py 的 ChangesetStore。
//
// 这一面的**真缺陷**（修前实测形态）：
//   CharacterState.applyChanges 只把**入参意图**（{character, field, delta:5}）记进
//   status.ops 与 OpLog。于是「第 12 楼把谁的好感从多少改到多少」无处可查 ——
//   由 delta 反推需要当时的值，而那个值已经不存在了。
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const src = readFileSync(ROOT + 'index.js', 'utf-8');
const mf = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const MOD_SRC = readFileSync(ROOT + 'changeset.js', 'utf-8');
const CS = require_('../changeset.js');
const goodGlobal = globalThis.LonShaChangeset;   // 快照在 require 之后取

const mkStore = (opts) => new CS.ChangesetStore(opts || {});

/* ══════════════ 1. 行键与值归一化 ══════════════ */
test('v3184c 1. makeRowKey / rowsEqual / normVal：同格的判据必须可复现', () => {
    assert.equal(CS.makeRowKey('status', ['张', '好感']), 'status:张|好感');
    assert.equal(CS.makeRowKey('status', '单键'), 'status:单键');
    // undefined 与 null 在「这一格有没有值」的意义上等价 ⇒ 必须同形
    assert.equal(CS.normVal(undefined), null);
    assert.equal(CS.normVal(null), null);
    assert.equal(CS.normVal(0), 0, '0 是合法值，不得被当缺失');
    assert.equal(CS.normVal(false), false, 'false 同上');
    assert.equal(CS.normVal(NaN), null, 'NaN 不是可比较的值');
    // 两边都不存在 ⇒ 相等（这正是 noopCreate 的判据）
    assert.equal(CS.rowsEqual(null, null), true);
    assert.equal(CS.rowsEqual(undefined, null), true);
    assert.equal(CS.rowsEqual(null, 0), false, '「没有值」与「值为 0」不得混同');
    assert.equal(CS.rowsEqual(false, 0), false, '布尔与数字不得混同');
    assert.equal(CS.rowsEqual(3, 3.0000000001), true, '浮点容差');
    assert.equal(CS.rowsEqual('3', 3), true, '序列化前后同值');
    assert.doesNotThrow(() => CS.makeRowKey(null, null));
});

/* ══════════════ 2. 覆盖语义（先冻结 before） ══════════════ */
test('v3184c 2. 覆盖语义：首次冻结 before，之后只更新 after', () => {
    const st = mkStore();
    // 同一格一次写入内的多步改动（先 +5 再 -5）应合成一个 before→after 对
    st.record({ table: 'status', pk: ['甲', '好感'], before: 3, after: 8, floor: 12 });
    st.record({ table: 'status', pk: ['甲', '好感'], before: 8, after: 3, floor: 12 });
    assert.equal(st.getChangeCount(), 1, '同格只占一行（第二次不新增行）');
    // 读池内原始行：净零行**不在展示里**，但池内记录必须如实带冻结的 before
    const row = Array.from(st.rows.values())[0];
    assert.equal(row.before, 3, 'before 必须冻结在最初（不得被第二次的 8 覆盖）');
    assert.equal(row.after, 3, 'after 更新到最新');
    assert.equal(st.overwritten, 1, '覆盖次数可见');
    // 净零判定以「冻结的 before vs 最新 after」为准：先 +5 再 -5 的净效果是白改
    assert.equal(st.counts().noop, 1, '3→3 属净零');
    assert.equal(st.getSnapshotView().length, 0, '净零不进展示（但仍占池，见上 getChangeCount）');
    // 换一个「真变更」的覆盖用例：before 冻结在最值 3，after 落在 8
    const st2 = mkStore();
    st2.record({ table: 'status', pk: ['甲', '好感'], before: 3, after: 8 });
    st2.record({ table: 'status', pk: ['甲', '好感'], before: 8, after: 12 });
    const v2 = st2.getSnapshotView();
    assert.equal(v2.length, 1);
    assert.equal(v2[0].before, 3);
    assert.equal(v2[0].after, 12, '多步改动合成一个 before→after 对');
});

/* ══════════════ 3. 净零与空建回收 ══════════════ */
test('v3184c 3. 净零过滤 + 空建回收：滤掉 ≠ 没发生（必须计数）', () => {
    const st = mkStore();
    st.record({ table: 'status', pk: ['甲', '好感'], before: 3, after: 3 });   // noop
    st.record({ table: 'status', pk: ['乙', '心情'], before: null, after: null });   // noopCreate
    st.record({ table: 'status', pk: ['丙', '好感'], before: 1, after: 2 });   // change
    const c = st.counts();
    assert.equal(c.change, 1);
    assert.equal(c.noop, 1);
    assert.equal(c.noopCreate, 1);
    assert.equal(st.getChangeCount(), 3, '净零仍占池');
    assert.equal(st.getSnapshotView().length, 1, '但展示只给真变更');
    // 回收（源实现的 _gc_noop_creates）：noop 与 noopCreate 一并回收，且计数增加
    const n = st.gcNoopCreates();
    assert.equal(n, 2);
    assert.equal(st.noop, 1);
    assert.equal(st.noopCreate, 1);
    assert.equal(st.getChangeCount(), 1, '回收后池里只剩真变更（净零不该占满有界窗口）');
    assert.equal(st.counts().change, 1);
    // 回收是幂等的（再跑一次没有可回收的）
    assert.equal(st.gcNoopCreates(), 0);
});

/* ══════════════ 4. 有界与摘除 ══════════════ */
test('v3184c 4. 有界：淘汰必须可见（读者不该把窗口当全集）', () => {
    const st = mkStore({ maxRows: 20 });
    assert.equal(st.maxRows, 20);
    for (let i = 0; i < 25; i++) st.record({ table: 'status', pk: ['r' + i, 'f'], before: 0, after: i + 1 });
    assert.equal(st.getChangeCount(), 20);
    assert.equal(st.evicted, 5, '淘汰数必须记（否则「只有 20 条」会被误读成「只改了 20 处」）');
    assert.ok(st.summarize(true).includes('已淘汰 5'), st.summarize(true));
    // maxRows 下限夹住（防设成 0 导致池恒空）
    assert.ok(mkStore({ maxRows: 0 }).maxRows >= 20);
    assert.ok(mkStore({ maxRows: 'x' }).maxRows >= 20);
});

test('v3184c 5. 摘除：按行键 / 按楼层（回滚联动的前提）', () => {
    const st = mkStore();
    st.record({ table: 'status', pk: ['甲', '好感'], before: 1, after: 2, floor: 5 });
    st.record({ table: 'status', pk: ['乙', '好感'], before: 1, after: 2, floor: 5 });
    st.record({ table: 'status', pk: ['丙', '好感'], before: 1, after: 2, floor: 7 });
    assert.equal(st.removeByFloor(5), 2, '删第 5 楼 ⇒ 该楼行级变更作废');
    assert.equal(st.getChangeCount(), 1);
    assert.equal(st.removeKeys([CS.makeRowKey('status', ['丙', '好感'])]), 1);
    assert.equal(st.getChangeCount(), 0);
    assert.equal(st.removeByFloor(999), 0, '不存在的楼层返回 0（不抛）');
    assert.doesNotThrow(() => st.removeKeys(null));
    assert.doesNotThrow(() => st.removeByFloor(undefined));
    st.record({ table: 'status', pk: ['丁', 'x'], before: 1, after: 2 });
    assert.equal(st.clearAll(), 1);
    assert.equal(st.getChangeCount(), 0);
});

/* ══════════════ 5. 非法输入与读数 ══════════════ */
test('v3184c 6. 非法输入必须计数（静默丢弃不可接受）+ 读数齐报', () => {
    const st = mkStore();
    assert.equal(st.record({ table: '', pk: ['甲', '感想'], before: 1, after: 2 }), false);
    assert.equal(st.record({ table: 'status', pk: [], before: 1, after: 2 }), false);
    assert.equal(st.record({ table: 'status', pk: ['  '], before: 1, after: 2 }), false, '纯空白主键等同空');
    assert.equal(st.record(null), false);
    assert.equal(st.badInput, 4, '全部进计数');
    assert.doesNotThrow(() => st.record(undefined));
    assert.equal(st.badInput, 5, 'undefined 也进计数（不静默）');
    assert.doesNotThrow(() => st.recordMany(null));
    assert.doesNotThrow(() => st.recordMany([1, null, { table: 'x', pk: 'y', before: 1, after: 2 }]));
    assert.equal(st.badInput, 7, '批量里的两个非法项同样进计数');
    // 读数：窗口 / 淘汰 / 净零 / 空建 / 覆盖 / 非法输入齐报
    st.record({ table: 's', pk: ['a', 'b'], before: 1, after: 2 });
    const line = st.summarize(true);
    assert.ok(line.includes('变更'), line);
    assert.ok(line.includes('非法输入 7'), line);
    assert.ok(line.includes('1→2'), '明细打样必须含 before→after：' + line);
    // 空值与「不存在」的打样必须可分辨
    st.record({ table: 's', pk: ['c', 'd'], before: null, after: 5 });
    assert.ok(st.summarize(true).includes('∅→5'), st.summarize(true));
});

test('v3184c 7. line()：净零与真变更不得同形', () => {
    const a = CS.line({ rows: 10, change: 10 });
    const b = CS.line({ rows: 10, change: 3, noop: 6, noopCreate: 1 });
    assert.notEqual(a, b, '「10 条都是真改动」与「10 条里只有 3 条是」不得同形');
    assert.ok(b.includes('净零 6'), b);
    assert.ok(b.includes('空建 1'), b);
    assert.ok(CS.line({ moduleMissing: true }).includes('未加载'));
    assert.ok(CS.line({}).includes('尚无变更集'));
    assert.ok(CS.line({ rows: 4, change: 4, evicted: 2, overwritten: 3 }).includes('同格覆盖 3'));
    assert.doesNotThrow(() => CS.line(null));
});

/* ══════════════ 8. 导出/导入往返 ══════════════ */
test('v3184c 8. export/import 往返保真（含累计计数）', () => {
    const st = mkStore({ maxRows: 25 });
    st.record({ table: 'status', pk: ['甲', '好感'], before: 1, after: 2, floor: 3 });
    st.record({ table: 'status', pk: ['乙', '好感'], before: 1, after: 1 });
    for (let i = 0; i < 30; i++) st.record({ table: 't', pk: ['k' + i], before: 0, after: i + 1 });
    st.gcNoopCreates();
    const dumped = st.export();
    assert.equal(dumped.evicted > 0, true, '淘汰过');
    assert.equal(dumped.maxRows, 25);
    const st2 = mkStore();
    assert.equal(st2.import(dumped), true);
    assert.equal(st2.getChangeCount(), st.getChangeCount());
    assert.equal(st2.evicted, st.evicted, '累计淘汰必须一并往返（否则读数回退）');
    assert.equal(st2.noop, st.noop);
    assert.equal(st2.maxRows, 25);
    assert.deepEqual(st2.getSnapshotView().map(r => r.key), st.getSnapshotView().map(r => r.key));
    // 畸形输入不抛
    assert.equal(mkStore().import(null), false);
    assert.equal(mkStore().import('x'), false);
    assert.equal(mkStore().import({ rows: 'not-array' }), true, '行集非法按空处理，不抛');
});

/* ══════════════ 9. 宿主接线自证 ══════════════ */
test('v3184c 9. 宿主在真实写入点取「改前值」并落变更集', () => {
    // 必须**改前先取**：改完再取只能拿到结果，前后值退化成「结果」一个数
    const i = src.indexOf('const _csPrev =');
    assert.ok(i > 0, '改前取值点存在');
    const seg = src.slice(i, i + 1200);
    assert.ok(seg.indexOf('const _csPrev') < seg.indexOf('rec.fields[field] ='), '取前值必须早于写入');
    assert.ok(seg.includes("Object.prototype.hasOwnProperty.call(rec.fields, field)"), '缺字段与值为 null 必须可分辨');
    assert.ok(seg.includes("table: 'status', pk: [name, field]"), '行键 = 角色 + 字段');
    assert.ok(seg.includes('_changeset()?.record('), '真落变更集');
    assert.ok(seg.includes('after: rec.fields[field]'), 'after 取写入后的值');
    assert.ok(seg.includes("errLog(e, 'CharacterState.changeset')"), '异常走 errLog（不空吞）');
});

test('v3184c 10. 单例走统一取库口 + 回滚联动 + 诊断行进 selfCheck', () => {
    assert.ok(src.includes("_moduleLib(() => window.LonShaChangeset, 'changeset.js')"), '统一取库口');
    // 惰性单例（extra_js 在入口脚本之后加载，构造期取不到）
    const i = src.indexOf('let _changesetStore = null;');
    assert.ok(i > 0, '单例变量存在');
    assert.ok(src.slice(i, i + 700).includes('if (_changesetStore) return _changesetStore;'), '惰性缓存');
    // 回滚联动：删楼后该楼行级变更一并作废（否则读数指着被撤销的历史）
    assert.ok(src.includes('_changeset()?.removeByFloor?.(floor)'), 'rollbackFloor 联动');
    assert.ok(src.includes("errLog(e, 'rollbackFloor.变更集回滚')"), '联动异常走 errLog');
    // 诊断行
    const sc = src.indexOf('async selfCheck(');
    const scSrc = src.slice(sc);
    const WARN = ' \u26a0\ufe0f';
    assert.ok(scSrc.includes("['行级变更', line + (bad ? '" + WARN + "' : '')]"), 'rows 条目存在（含告警形状）');
    assert.ok(scSrc.includes('selfCheck.changeset'), '异常走 errLog');
    assert.ok(src.includes('_changesetLine()'), '读数方法存在');
    assert.ok(scSrc.includes('cs.badInput'), '报警归因 = 非法输入');
    assert.ok(mf.extra_js.includes('changeset.js'), 'manifest 登记');
});

test('v3184c 11. 分工声明：与 SnapshotManager / OpLog 不得重复', () => {
    // 模块头必须写清分工（否则下一个人会以为它是重复设施而删掉其中一个）
    assert.ok(MOD_SRC.includes('SnapshotManager'), '点名粗粒度快照');
    assert.ok(MOD_SRC.includes('OpLog'), '点名意图流水');
    assert.ok(MOD_SRC.includes('行级前后值'), '声明的职责');
    assert.ok(MOD_SRC.includes('不同分辨率'), '声明四者是分辨率差异');
    // 刻意不导出（顶层导出键集是冻结契约；改动它会破 v3139 的键集断言）
    assert.ok(!src.includes("changeset: _changeset"), '不得挂进导出对象');
    assert.ok(src.includes('刻意不导出'), '理由必须留档');
});

/* ══════════════ 12. 负控制 ══════════════ */
function loadBroken(mutate) {
    const broken = mutate(MOD_SRC);
    assert.notEqual(broken, MOD_SRC, '破坏必须真的发生');
    const saved = globalThis.LonShaChangeset;
    const tmp = ROOT + '__negctl_cs.tmp.cjs';
    require_('fs').writeFileSync(tmp, broken);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { require_('fs').unlinkSync(tmp); } catch (_e) { /* 忽略 */ }
        if (saved) { try { globalThis.LonShaChangeset = saved; } catch (_e) { /* 忽略 */ } }
    }
    return api;
}

test('v3184c N1. before 冻结被拆（首次也覆盖 before）⇒ 该组翻红', () => {
    // 读池内原始行而非展示（3→3 是净零、不进展示；要观 before 冻结与否必须看池内记录）
    const mk = (S) => {
        const st = new S.ChangesetStore();
        st.record({ table: 'status', pk: ['甲', '好感'], before: 3, after: 8 });
        st.record({ table: 'status', pk: ['甲', '好感'], before: 8, after: 3 });
        return Array.from(st.rows.values())[0];
    };
    assert.equal(mk(CS).before, 3, '原版：before 冻结在最初');
    const B = loadBroken((s) => {
        const a = "                    existing.after = after;";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "                    existing.before = before; existing.after = after;");
    });
    assert.equal(mk(B).before, 8, '破坏后 before 被后一次覆盖（读者拼不出真相）');
    assert.notEqual(mk(CS).before, 8, '原版上同款断言为假');
});

test('v3184c N2. 净零过滤被拆（净零也当变更展示）⇒ 该组翻红', () => {
    const mk = (S) => {
        const st = new S.ChangesetStore();
        st.record({ table: 'status', pk: ['甲', '好感'], before: 3, after: 3 });
        return st.getSnapshotView().length;
    };
    assert.equal(mk(CS), 0, '原版：净零不进展示');
    const B = loadBroken((s) => {
        const a = "            if (this.classify(row) !== 'change') continue;";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "            if (false) continue;");
    });
    assert.equal(mk(B), 1, '破坏后「白改」占满展示位');
    assert.notEqual(mk(CS), 1);
});

test('v3184c N3. 淘汰不记账被拆（静默丢数据）⇒ 该组翻红', () => {
    const mk = (S) => {
        const st = new S.ChangesetStore({ maxRows: 20 });
        for (let i = 0; i < 25; i++) st.record({ table: 't', pk: ['k' + i], before: 0, after: i + 1 });
        return st.summarize(false);
    };
    assert.ok(mk(CS).includes('已淘汰 5'), '原版：淘汰必须可见');
    const B = loadBroken((s) => {
        const a = "                    this.evicted++;";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "                    this.evicted += 0;");
    });
    assert.ok(!mk(B).includes('已淘汰'), '破坏后读者会把窗口当全集：' + mk(B));
    assert.ok(mk(CS).includes('已淘汰'), '原版上同款断言为真');
});

test('v3184c N4. 非法输入不计数被拆（静默丢弃）⇒ 该组翻红', () => {
    const mk = (S) => {
        const st = new S.ChangesetStore();
        st.record({ table: '', pk: ['a'], before: 1, after: 2 });
        return st.badInput;
    };
    assert.equal(mk(CS), 1, '原版：非法输入进计数');
    const B = loadBroken((s) => {
        const a = "                if (!table || pkEmpty) { this.badInput++; return false; }";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "                if (!table || pkEmpty) { return false; }");
    });
    assert.equal(mk(B), 0, '破坏后非法输入静默消失');
    assert.notEqual(mk(CS), 0);
});

test('v3184c N5. 按楼层摘除被拆 ⇒ 该组翻红（回滚联动失效）', () => {
    const mk = (S) => {
        const st = new S.ChangesetStore();
        st.record({ table: 't', pk: ['a'], before: 1, after: 2, floor: 5 });
        st.record({ table: 't', pk: ['b'], before: 1, after: 2, floor: 5 });
        return st.removeByFloor(5);
    };
    assert.equal(mk(CS), 2);
    const B = loadBroken((s) => {
        const a = "                if (row.floor === f) { this.rows.delete(key); n++; }";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "                if (false) { this.rows.delete(key); n++; }");
    });
    assert.equal(mk(B), 0, '破坏后删楼不再作废该楼变更（读数指着已撤销的历史）');
    assert.notEqual(mk(CS), 0);
});

test('v3184c N6. 破坏副本污染全局必须可还原（双向断言）', () => {
    assert.ok(goodGlobal, 'require 之后原版已自挂全局');
    const B = loadBroken((s) => s.replace('CHANGESET_VERSION = 1', 'CHANGESET_VERSION = 77'));
    assert.equal(B.CHANGESET_VERSION, 77);
    assert.notEqual(CS.CHANGESET_VERSION, 77);
    assert.equal(goodGlobal.CHANGESET_VERSION, 1);
});

/* ══════════════ 13. 版权纯度 ══════════════ */
test('v3184c 12. 版权纯度：出处留注释，代码体不含源实现标识符', () => {
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const body = strip(MOD_SRC);
    for (const bad of ['nocturne', 'Dataojitori', 'snapshot.py', '_make_row_key', '_rows_equal', '_remove_changeset', 'TABLE_PKS', 'FileLock']) {
        assert.ok(!body.includes(bad), `代码体不得含 ${bad}`);
    }
    assert.ok(MOD_SRC.includes('nocturne_memory'), '注释留出处');
    assert.ok(MOD_SRC.includes('未复制其代码'), '声明未复制代码');
    assert.ok(!/\}\s*catch\s*\([^)]*\)\s*\{\s*\}/.test(MOD_SRC), '不得有空 catch');
});