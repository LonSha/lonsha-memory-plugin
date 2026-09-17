/* ============================================================
 * v3.155.0 — 台账写入校验纵深（补 v3.154 遗漏的两条整体替换路径）
 *              + 楼层账本静默淘汰治理
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import path from 'node:path';
const ROOT = '/home/user/lonsha-memory-plugin';
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
// ===== 写入侧校验内核（v3.154 建立，本版复用）零依赖真执行 =====
const _kseg = src.slice(src.indexOf('const LEDGER_ITEM_ACTIONS'), src.indexOf('class MemoryEngine {'));
const K = new Function(_kseg + '\nreturn { validateLedgerItemOp, validateLedgerItemOps, validateCarriedItems, ledgerItemKey };')();
// ===== 切出两条「整体替换」路径的源码块 =====
const _i1 = src.indexOf('if (Array.isArray(pack.itemOps)) {');
const _j1 = src.indexOf("} catch (e) { errLog(e, 'applyCarryover.itemOps'); }", _i1);
const A1_BODY = src.slice(_i1, _j1);
const _i2 = src.indexOf('const _raw = Array.isArray(data.itemOps) ? data.itemOps : [];');
const _j2 = src.indexOf('(engine.reconcileItemOps || engine.rebuildItems)?.call(engine);', _i2);
const A2_BODY = src.slice(_i2, _j2) + '(engine.reconcileItemOps || engine.rebuildItems)?.call(engine);';
const runA1 = new Function('pack', 'validateCarriedItems', 'PLUGIN_NAME', 'errLog', 'with (this) { ' + A1_BODY + ' }');
const runA2 = new Function('engine', 'data', 'validateLedgerItemOps', A2_BODY);
// ================= 1. A1：携带包 itemOps 由「整体替换」改「校验 + 合并去重」 =================
test('【1】A1 携带包：校验 + 合并而非替换（旧语义会静默丢弃本会话已入账 ops）', () => {
    assert.ok(_i1 > 0 && _j1 > _i1, 'A1 源码块已切出');
    const calls = [];
    const self = {
        config: { config: { ledgerWriteValidationEnabled: true, ledgerWriteValidationDebug: false } },
        itemOps: [{ key: '剑', name: '剑', action: 'add' }, { key: '盾', name: '盾', action: 'add' }],
        rebuildItems() { calls.push('rebuild'); }
    };
    runA1.call(self, { itemOps: [{ name: '剑' }, { name: '书' }, null, { name: '' }] }, K.validateCarriedItems, 'LonSha', () => {});
    // 合并：本会话 2 条保留 + 新增 1 条（剑重复跳过、null/空名丢弃）
    assert.equal(self.itemOps.length, 3, '合并后 3 条（而非替换成 2 条）');
    assert.deepEqual(self.itemOps.map(o => o.name), ['剑', '盾', '书'], '本会话已入账项不丢');
    assert.equal(self.itemOps[0].key, '剑', '原对象未被覆盖');
    assert.equal(self.itemOps[2].carried, true, '携带项标 carried');
    assert.equal(calls.length, 1, '有合并才 rebuildItems');
    // 空包 / 非数组：不动真源
    const self2 = { config: { config: {} }, itemOps: [{ key: 'a', name: 'a' }], rebuildItems() { calls.push('x'); } };
    runA1.call(self2, {}, K.validateCarriedItems, 'LonSha', () => {});
    assert.equal(self2.itemOps.length, 1, '无 pack.itemOps 不动真源');
    runA1.call(self2, { itemOps: 'notarray' }, K.validateCarriedItems, 'LonSha', () => {});
    assert.equal(self2.itemOps.length, 1, '非数组不动真源');
    // 全重复：不 rebuild
    const self3 = { config: { config: {} }, itemOps: [{ key: '剑', name: '剑' }], rebuildItems() { calls.push('dup'); } };
    const before = calls.length;
    runA1.call(self3, { itemOps: [{ name: '剑' }] }, K.validateCarriedItems, 'LonSha', () => {});
    assert.equal(self3.itemOps.length, 1, '全重复不追加');
    assert.equal(calls.length, before, '无新增不 rebuildItems');
});
test('【1b】A1 关卡关闭：逐位回退旧行为（仅 filter，不校验）', () => {
    const self = {
        config: { config: { ledgerWriteValidationEnabled: false, ledgerWriteValidationDebug: false } },
        itemOps: [],
        rebuildItems() {}
    };
    runA1.call(self, { itemOps: [{ name: '剑', action: 'remove' }, { name: '' }, null] }, K.validateCarriedItems, 'LonSha', () => {});
    assert.equal(self.itemOps.length, 1, '旧行为只过滤空项');
    assert.equal(self.itemOps[0].action, 'remove', '关卡关闭时不归一 action（旧语义）');
    assert.equal(self.itemOps[0].carried, true, '仍标 carried');
});
// ================= 2. A2：import 存档 itemOps 由「整体赋值」改「校验后落盘」 =================
test('【2】A2 导入：外部存档 ops 先过校验，违规以 source=import 入账本', () => {
    assert.ok(_i2 > 0 && _j2 > _i2, 'A2 源码块已切出');
    const rec = [];
    const built = [];
    const engine = {
        config: { config: { ledgerWriteValidationEnabled: true } },
        itemOps: [{ key: '旧', name: '旧' }],
        _recordLedgerViolations(v, s, f) { rec.push({ v, s, f }); },
        rebuildItems() { built.push('r'); }
    };
    runA2(engine, { itemOps: [{ name: '好剑' }, { action: 'explode', name: '坏' }, null] }, K.validateLedgerItemOps);
    assert.equal(engine.itemOps.length, 1, '脏值不落真源（旧写法会整批赋值）');
    assert.equal(engine.itemOps[0].name, '好剑');
    assert.equal(rec.length, 1, '违规入账本 1 次');
    assert.equal(rec[0].s, 'import', '来源标记 import');
    assert.ok(rec[0].v.length >= 2, '违规明细（explode + null）');
    assert.equal(built.length, 1, '落盘后重建派生层');
    // 非数组兜底
    const e2 = { config: { config: {} }, itemOps: [{ key: 'x', name: 'x' }], _recordLedgerViolations() { throw new Error('不应记违规'); }, rebuildItems() {} };
    runA2(e2, { itemOps: null }, K.validateLedgerItemOps);
    assert.equal(e2.itemOps.length, 0, '非数组兜底为空数组');
    // 关卡关闭：旧 filter 语义
    const e3 = { config: { config: { ledgerWriteValidationEnabled: false } }, itemOps: [], _recordLedgerViolations() { throw new Error('关卡关闭不应记违规'); }, rebuildItems() {} };
    runA2(e3, { itemOps: [{ name: 'a', action: 'drop' }, { name: '' }] }, K.validateLedgerItemOps);
    assert.equal(e3.itemOps.length, 1, '关卡关闭仅 filter');
    assert.equal(e3.itemOps[0].action, 'drop', '不归一（旧语义）');
    // 旧整体赋值写法彻底清零
    assert.ok(!src.includes('engine.itemOps = data.itemOps;'), '旧 import 整体赋值已移除');
    assert.ok(!src.includes('this.itemOps = pack.itemOps.map('), '旧携带包整体替换已移除');
});
// ================= 3. FloorLedger：可配上限 + 逐个淘汰 + 记账 + 回调 =================
test('【3】FloorLedger 真执行：上限可配（下限 20）+ 逐个淘汰 + evicted/水位/回调', () => {
    const _i3 = src.indexOf('class FloorLedger {');
    const _j3 = src.indexOf('class Mutex {', _i3);
    assert.ok(_i3 > 0 && _j3 > _i3, 'FloorLedger 段已切出');
    const FL = new Function(src.slice(_i3, _j3) + '\nreturn FloorLedger;')();
    // 默认值 / 下限保护
    assert.equal(new FL({}).MAX_FLOORS, 400, '默认 400');
    assert.equal(new FL().MAX_FLOORS, 400, '无参兼容');
    assert.equal(new FL({ maxFloors: 200 }).MAX_FLOORS, 200, '可配');
    assert.equal(new FL({ maxFloors: 0 }).MAX_FLOORS, 400, '0 为 falsy → 回退默认 400（防清空）');
    assert.equal(new FL({ maxFloors: -5 }).MAX_FLOORS, 20, '负值同样被下限兜住');
    assert.equal(new FL({ maxFloors: 10 }).MAX_FLOORS, 20, '低于下限被抬到 20');
    assert.equal(new FL({}).evicted, 0, '初始淘汰计数 0');
    assert.equal(new FL({}).onEvict, null, '无回调');
    // 逐个淘汰（while 而非 if：一次超限多条须全部淘汰）
    const ev = [];
    const L = new FL({ maxFloors: 20, onEvict: (f, t) => ev.push([f, t]) });
    for (let f = 1; f <= 25; f++) L.beginFloor(f);
    assert.equal(Object.keys(L.floors).length, 20, '维持在上限 20');
    assert.equal(Math.min(...Object.keys(L.floors).map(Number)), 6, '最旧保留第 6 楼（1-5 被淘汰）');
    assert.equal(L.evicted, 5, '累计淘汰 5');
    assert.equal(L.evictedFloorMax, 5, '淘汰水位为最大被淘汰楼层');
    assert.equal(ev.length, 5, '回调次数 = 淘汰次数');
    assert.deepEqual(ev[0], ['1', 1], '首次回调（楼层字符串 + 累计 1）');
    assert.deepEqual(ev[4], ['5', 5], '末次回调');
    // 一次新增后超限多条 → 区分 while 与旧 if
    const L2 = new FL({ maxFloors: 20 });
    L2.floors = {};
    for (let f = 1; f <= 24; f++) L2.floors[f] = {};
    L2.beginFloor(25);
    assert.equal(Object.keys(L2.floors).length, 20, '批量超限一次淘汰到位（旧 if 写法会残留 24 条）');
    assert.equal(L2.evicted, 5, '批量淘汰计数正确');
    assert.equal(L2.evictedFloorMax, 5, '批量淘汰水位正确');
    // 回调抛错不中断主流程
    const L3 = new FL({ maxFloors: 20, onEvict: () => { throw new Error('boom'); } });
    assert.doesNotThrow(() => { for (let f = 1; f <= 22; f++) L3.beginFloor(f); }, '回调异常被吞');
    assert.equal(Object.keys(L3.floors).length, 20, '淘汰仍生效');
    // 未超限不淘汰、无回调
    const L4 = new FL({ maxFloors: 400, onEvict: () => { throw new Error('不应回调'); } });
    L4.beginFloor(1);
    assert.equal(L4.evicted, 0, '未超限不淘汰');
    // record/get/remove 既有契约未被破坏
    const L5 = new FL({ maxFloors: 20 });
    L5.beginFloor(9);
    L5.record(9, { nodeIds: ['n1'], povIds: ['p1'], timelineIds: ['t1'] });
    const e = L5.get(9);
    assert.deepEqual(e.nodeIds, ['n1']);
    assert.deepEqual(e.povIds, ['p1']);
    assert.ok(L5.remove(9), 'remove 仍返回记录');
    assert.equal(L5.get(9), null, 'remove 后为 null');
});
// ================= 4. rollbackFloor 缺失分支：区分「未提取」与「已淘汰」 =================
test('【4】rollbackFloor 缺失分支真执行：已淘汰才计「回滚失效」，未提取不误计', () => {
    const _i4 = src.indexOf('const _evictedOut = Number(floor) < (this.ledger.evictedFloorMax || -1);');
    const _j4 = src.indexOf('return 0;', _i4);
    assert.ok(_i4 > 0 && _j4 > _i4, '缺失分支已切出');
    const body = src.slice(_i4, _j4);
    const run = new Function('floor', 'PLUGIN_NAME', 'with (this) { ' + body + ' }');
    const mk = (water) => {
        const logs = [];
        return {
            logs,
            ledger: { evictedFloorMax: water },
            _ledgerMissingRollbacks: 0,
            opLog: { log: (...a) => logs.push(a) },
            config: { config: { floorLedgerEvictionDebug: false } }
        };
    };
    // 已被淘汰（水位 5，请求 3）→ 计数 + op-log
    const s1 = mk(5);
    run.call(s1, 3, 'LonSha');
    assert.equal(s1._ledgerMissingRollbacks, 1, '淘汰命中计数 +1');
    assert.equal(s1.logs.length, 1, 'op-log 一条');
    assert.equal(s1.logs[0][0], 'ledger', 'op-log 域');
    assert.equal(s1.logs[0][1], 'rollback-miss', 'op-log 动作');
    // 水位边界：等于水位（该楼未被淘汰）→ 不计数
    const s2 = mk(5);
    run.call(s2, 5, 'LonSha');
    assert.equal(s2._ledgerMissingRollbacks, 0, '等于水位不算淘汰');
    // 从未提取（高于水位）→ 不计数
    const s3 = mk(5);
    run.call(s3, 99, 'LonSha');
    assert.equal(s3._ledgerMissingRollbacks, 0, '未提取不误判为淘汰');
    // 全新账本（水位未定义）→ 任何楼层都不算淘汰
    const s4 = mk(undefined);
    run.call(s4, 0, 'LonSha');
    run.call(s4, 7, 'LonSha');
    assert.equal(s4._ledgerMissingRollbacks, 0, '无淘汰历史时零误报');
    // 累积计数
    const s5 = mk(10);
    run.call(s5, 1, 'LonSha');
    run.call(s5, 2, 'LonSha');
    assert.equal(s5._ledgerMissingRollbacks, 2, '累积计数');
    // 上游接线：缺失分支确实位于 rollbackFloor 内且早于真回滚
    const rb = src.indexOf('rollbackFloor(floor) {');
    assert.ok(rb > 0 && rb < _i4, '缺失分支在 rollbackFloor 内');
    assert.ok(src.slice(rb, _i4).includes('if (!entry) {'), '前置 !entry 守卫仍在');
});
// ================= 5. 接线：实例化注入 + 配置默认值 + 卡白名单 + 构造计数 =================
test('【5】接线：FloorLedger 注入 maxFloors/onEvict + 配置 2 键 + 卡白名单 2 键', () => {
    assert.ok(src.includes('this.ledger = new FloorLedger({'), '实例化改为传 opts');
    assert.ok(src.includes('maxFloors: Number(this.config.config.floorLedgerRetention) || 400'), '上限读配置');
    assert.ok(src.includes("'ledger', 'evict'"), '淘汰写 op-log');
    assert.ok(src.includes("'ledger', 'rollback-miss'"), '回滚失效写 op-log');
    const d = src.slice(src.indexOf('floorLedgerRetention: 400'), src.indexOf('floorLedgerRetention: 400') + 220);
    assert.ok(d.includes('floorLedgerEvictionDebug: false'), '调试开关默认关');
    const cc = src.slice(src.indexOf('_applyCardOverrides() {'), src.indexOf('_applyCardOverrides() {') + 2400);
    for (const k of ['floorLedgerRetention', 'floorLedgerEvictionDebug']) {
        assert.ok(cc.includes(k), '卡覆盖白名单含 ' + k);
    }
    assert.equal((src.match(/this\._ledgerMissingRollbacks = 0;/g) || []).length, 1, '构造函数内计数初始化仅一处');
    const ctor = src.slice(src.indexOf('constructor(config) {'), src.indexOf('this.vector = new VectorStore'));
    assert.ok(ctor.includes('this._ledgerMissingRollbacks = 0;'), '计数在构造函数内');
});
// ================= 6. 诊断面板：楼层账本行带淘汰数 + 新增回滚失效行 =================
test('【6】诊断面板：楼层账本行附「已淘汰 N」+ 新增「回滚失效」行（可观测）', () => {
    const iLed = src.indexOf("['楼层账本'");
    const iMiss = src.indexOf("['回滚失效'");
    const iChk = src.indexOf("['台账校验'");
    const iItem = src.indexOf("['物品台账'");
    assert.ok(iLed > 0 && iMiss > iLed, '回滚失效行紧跟楼层账本行');
    assert.ok(iItem > 0 && iChk > iItem, '台账校验行仍在物品台账行后（v3.154 契约保持）');
    const seg = src.slice(iLed, iMiss + 200);
    assert.ok(seg.includes('this.ledger.evicted'), '楼层账本行消费淘汰计数');
    assert.ok(seg.includes('已淘汰'), '淘汰数可见');
    assert.ok(seg.includes('_ledgerMissingRollbacks'), '回滚失效行消费计数');
    assert.ok(seg.includes('账本已淘汰'), '失效原因可辨');
    assert.ok(seg.includes("? '' : ''") || seg.includes("? `（已淘汰"), '未淘汰时降级不显示');
});
// ================= 7. 设置面板登记 =================
test('【7】settings-ui：保留上限滑杆 + 淘汰调试开关（data-cfg 对齐配置键）', () => {
    assert.ok(sui.includes('data-cfg-num="floorLedgerRetention"'), '保留上限滑杆');
    assert.ok(sui.includes('id="ls-v-flret"'), '数值回显节点');
    assert.ok(sui.includes('${c.floorLedgerRetention || 400}'), '滑杆默认对齐配置默认 400');
    assert.ok(sui.includes('min="50" max="2000" step="50"'), '滑杆量程');
    assert.ok(sui.includes("ck('floorLedgerEvictionDebug'"), '淘汰调试开关');
    assert.ok(sui.includes("ck('floorLedgerEnabled'"), '既有楼层账本开关仍在');
});
// ================= 8. 版本四处同步 + 旧锚点接管 + 旧测试去当版独占 =================
test('【8】版本四处同步 3.155.0 + 旧锚点接管', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.ok(vnum(v) >= vnum('3.155.0'), `index.js 版本 ${v} >= 3.155.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.155.0'), 'manifest 版本');
    assert.ok(vnum(pkg.version) >= vnum('3.155.0'), 'package 版本');
    const cl = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    assert.ok(cl.trimStart().startsWith('## v3.155.0'), 'CHANGELOG 头部 3.155.0');
    for (const t of ['tests/v3117_diagnostics.test.mjs', 'tests/v3130_control_plane.test.mjs', 'tests/v3147_cooldown_and_dual_hash.test.mjs']) {
        const ts = readFileSync(path.join(ROOT, t), 'utf-8');
        assert.ok(ts.includes("'3.155.0'"), `${t} 版本锚点同步 3.155.0`);
    }
});
test('【8b】v3154 测试已去当版独占（CHANGELOG/旧锚点交本版接管）', () => {
    const t154 = readFileSync(path.join(ROOT, 'tests/v3154_ledger_validation_and_tier_gc.test.mjs'), 'utf-8');
    assert.ok(!t154.includes("startsWith('## v3.154.0')"), 'v3154 不再断言 CHANGELOG 头');
    assert.ok(!t154.includes("includes('3.154.0')"), 'v3154 不再跑旧锚点循环');
    assert.ok(!t154.includes('版本锚点同步 3.154.0'), 'v3154 不再独占旧锚点断言');
    assert.ok(t154.includes("vnum('3.154.0')"), 'v3154 仍保留下限断言');
});
