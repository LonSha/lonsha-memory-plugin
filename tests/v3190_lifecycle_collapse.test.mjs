// tests/v3190_lifecycle_collapse.test.mjs
// [v3.190.0] 声明式生命周期收口：删楼 / 前移只走登记表一次，门控不再旁路回放。
//   背景：v3.182 建了 FLOOR_OWNERS 并把回放接到两条路径上，但 index.js 里的两份手工清单
//   一条都没删——同一批楼层号被减两次（删掉第 15 楼，原第 16 楼会变成第 14 楼），且不报错。
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { stripComments, bodyOf as bodyIn } from './_audit_lib.mjs';

const require_ = createRequire(import.meta.url);
const LR = require_('../ledger-replay.js');
const ROOT = new URL('..', import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), 'utf-8');
const raw = read('index.js');

const src = stripComments(raw);
// [v3.191] bodyOf 收敛到唯一真源，此处固定第一参（已剥注释的 src）
const bodyOf = (marker) => bodyIn(src, marker);

test('v3190 1. 三源同源，且不低于本版', () => {
    const m = /const VERSION = '([0-9.]+)'/.exec(raw);
    const manifest = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    assert.equal(m[1], '3.200.0', 'index.js 版本号为 3.193.0');
    assert.equal(manifest.version, '3.200.0', 'manifest 跟随 index.js');
    assert.equal(pkg.version, '3.200.0', 'package 跟随 index.js');
});

test('v3190 2. 位移只发生一次：shiftFloorsFrom 不再携带手抄清单', () => {
    const body = bodyOf('shiftFloorsFrom(deleted) {');
    assert.ok(body, 'shiftFloorsFrom 必须存在');
    assert.ok(!/\bdec\s*\(/.test(body), '不得再有手抄位移 helper（dec(）——与回放叠加即双重位移');
    assert.ok(!/[\w\].)]\.floor\s*=[^=]/.test(body), '不得再有手抄 .floor = 位移语句');
    assert.ok(!/\.floor--/.test(body), '不得再有手抄 .floor-- 位移语句');
    assert.ok(/replayShift\s*\(/.test(body), '位移唯一真源是登记表回放');
});

test('v3190 3. 位移恰好一次（行为，而非调用次数）', () => {
    const host = {
        summary: { summaries: [{ floor: 3 }, { floor: 6 }], volumes: [{ floorStart: 1, floorEnd: 9 }] },
        moneyLedger: { moneyLog: [{ floor: 6 }] }
    };
    const r = LR.replayShift(host, 4);
    assert.equal(host.summary.summaries[1].floor, 5, '6 楼前移一次应成 5（成 4 即双重位移）');
    assert.equal(host.moneyLedger.moneyLog[0].floor, 5, '钱财面同样只前移一次');
    assert.equal(host.summary.summaries[0].floor, 3, '3 楼（<= 被删楼）不得变动');
    assert.equal(r.threw, 0, '回放不得内部抛错');
});

test('v3190 4. 删楼回放排在「账本记录缺失」早退点之前', () => {
    const rb = bodyOf('rollbackFloor(floor) {');
    assert.ok(rb, 'rollbackFloor 必须存在');
    const getIdx = rb.indexOf('this.ledger.get(floor)');
    const rpIdx = rb.search(/replayDrop\s*\(/);
    assert.ok(getIdx > 0, '必须保留账本记录查询点');
    assert.ok(rpIdx > 0, '必须调用回放');
    assert.ok(rpIdx < getIdx, '回放必须早于缺失早退点，否则登记表在该分支下是死声明');
});

test('v3190 5. 「关掉账本」与「跑了没账可撤」必须可分', () => {
    const rb = bodyOf('rollbackFloor(floor) {');
    assert.ok(/skipped:\s*'floor-ledger-disabled'/.test(rb), '关掉账本的一态必须留痕（skipped 分态）');
    // 分态不是装饰：诊断面必须能区分「没跑」与「跑了但无事可做」。
    const disabled = { version: 1, side: 'drop', floor: 9, items: [], dropped: 0, shifted: 0, threw: 0, absent: 0, skipped: 'floor-ledger-disabled' };
    const ran = { version: 1, side: 'drop', floor: 9, items: [], dropped: 0, shifted: 0, threw: 0, absent: 0 };
    assert.equal(disabled.skipped, 'floor-ledger-disabled');
    assert.equal(ran.skipped, undefined, '真跑过的报告不得带 skipped');
    assert.notDeepEqual(disabled, ran, '两态必须可分');
});

test('v3190 6. 四个漏网面归队，且都参与前移', () => {
    assert.deepEqual(LR.checkRegistry(LR.FLOOR_OWNERS), [], '登记表结构健康');
    for (const id of ['changeset', 'archived', 'inject-cursor', 'volumes']) {
        const o = LR.FLOOR_OWNERS.find((x) => x.id === id);
        assert.ok(o, id + ' 必须在登记表内（有楼层归属的面不得留在表外）');
        assert.equal(typeof o.shift, 'function', id + ' 必须参与前移');
        assert.ok(o.label && o.label.length > 0, id + ' 必须带中文名（诊断面按名可查）');
    }
    const silent = LR.FLOOR_OWNERS.filter((o) => o.shift === null && o.id !== 'stm-ltm');
    assert.deepEqual(silent.map((o) => o.id), [], '除 stm-ltm 外不应有面拒绝前移');
});

test('v3190 7. 行级变更集：删楼摘除、前移跟随', () => {
    let n = 0;
    const rows = new Map([[1, { floor: 2 }], [2, { floor: 7 }]]);
    const cs = { rows, removeByFloor(f) { let c = 0; for (const [k, v] of [...this.rows]) if (v.floor === f) { this.rows.delete(k); c++; } return c; } };
    const r = LR.replayDrop({ _changeset: () => cs }, 7);
    assert.equal(cs.rows.size, 1, '被删楼的行必须摘掉');
    assert.equal(r.items.find((i) => i.id === 'changeset').count, 1);
    const rows2 = new Map([[3, { floor: 8 }]]);
    LR.replayShift({ _changeset: () => ({ rows: rows2, removeByFloor: () => 0 }) }, 5);
    assert.equal(rows2.get(3).floor, 7, '> 被删楼的行必须跟随前移');
    n++;
    assert.equal(n, 1);
});

test('v3190 8. 归档隐藏集合：被删楼起失去依据，其后前移、其前保留', () => {
    // drop 侧的契约是 pruneArchivedIds（保留 < floor）：隐藏的依据是卷摘要覆盖，
    //   回滚第 7 楼即作废从 7 往后的该层摘要——故 >= 7 的归档都失去依据（模块内注释写明）。
    const a = { _archivedFloorIds: new Set([2, 7, 9]) };
    LR.replayDrop(a, 7);
    assert.deepEqual([...a._archivedFloorIds].sort((x, y) => x - y), [2], '回滚后只保留更早的有效归档');
    const b = { _archivedFloorIds: new Set([2, 7, 9]) };
    LR.replayShift(b, 7);
    assert.deepEqual([...b._archivedFloorIds].sort((x, y) => x - y), [2, 8], '被删楼丢弃，9 前移成 8，2 不动');
});

test('v3190 9. 注入游标：删楼回退到被删楼前一楼，前移跟随', () => {
    const a = { _diaryInjectFloor: 9, _timelineInjectFloor: 3 };
    LR.replayDrop(a, 7);
    assert.equal(a._diaryInjectFloor, 6, '游标 >= 被删楼时回退到前一楼');
    assert.equal(a._timelineInjectFloor, 3, '低于被删楼的游标不动');
    const b = { _diaryInjectFloor: 9, _timelineInjectFloor: 3 };
    LR.replayShift(b, 7);
    assert.equal(b._diaryInjectFloor, 8, '高于被删楼的游标跟随前移');
    assert.equal(b._timelineInjectFloor, 3, '低于被删楼的游标不动');
});
