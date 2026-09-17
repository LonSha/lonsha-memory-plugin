/* ============================================================
 * v3.154.0 — 台账写入侧 zod 式校验（anima #30）
 *              + 摘要金字塔显式淘汰与 GC 校准（anima #31）
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

// ===== 提取写入侧校验内核（零依赖纯函数段）并真执行 =====
const _kseg = src.slice(src.indexOf('const LEDGER_ITEM_ACTIONS'), src.indexOf('class MemoryEngine {'));
const K = new Function(_kseg + '\nreturn { LEDGER_ITEM_ACTIONS, LEDGER_REMOVE_STATES, LEDGER_ITEM_LIMITS, LEDGER_HOLDER_PLACEHOLDERS, ledgerItemKey, ledgerClip, validateLedgerItemOp, validateLedgerItemOps, validateCarriedItems };')();

// ================= 1. 内核可执行 + 单条校验宽容转换 =================
test('【1】内核真执行：单条 op 宽容转换（非拒绝）', () => {
    const V = K.validateLedgerItemOp;
    assert.equal(typeof V, 'function', '内核函数已求值');
    assert.deepEqual(K.LEDGER_ITEM_ACTIONS, ['add', 'update', 'remove']);
    assert.equal(K.LEDGER_ITEM_LIMITS.name, 40);
    assert.equal(K.LEDGER_ITEM_LIMITS.batch, 60);
    // action 缺省 → add
    assert.equal(V({ name: '剑' }, {}).op.action, 'add');
    // 别名归一
    assert.equal(V({ action: 'del', name: '剑' }, {}).op.action, 'remove');
    assert.equal(V({ action: 'delete', name: '剑' }, {}).op.action, 'remove');
    assert.equal(V({ action: 'drop', name: '剑' }, {}).op.action, 'remove');
    assert.equal(V({ action: 'gain', name: '剑' }, {}).op.action, 'add');
    assert.equal(V({ action: 'take', name: '剑' }, {}).op.action, 'add');
    assert.equal(V({ action: 'get', name: '剑' }, {}).op.action, 'add');
    assert.equal(V({ action: 'ADD', name: '剑' }, {}).op.action, 'add', '大小写不敏感');
    // 非法 action → 丢弃（唯一硬拒绝路径）
    const bad = V({ action: 'explode', name: '剑' }, {});
    assert.equal(bad.ok, false);
    assert.ok(bad.reason.startsWith('bad_action'), 'reason=' + bad.reason);
    // name 必填 / 非对象
    assert.equal(V({}, {}).reason, 'missing_name');
    assert.equal(V(null, {}).reason, 'not_object');
    assert.equal(V([], {}).reason, 'not_object');
    assert.equal(V('剑', {}).reason, 'not_object');
    // name 截断 40
    const long = '甲'.repeat(60);
    assert.equal(V({ name: long }, {}).op.name.length, 40);
    // 归一键（NFKC + 去括号引号 + 小写）
    assert.equal(V({ name: '《青锋剑》' }, {}).op.key, '青锋剑');
    assert.equal(V({ name: '  IRON   Sword ' }, {}).op.key, 'iron sword');
});

// ================= 2. 字段约束：长度 / holder 占位 / state / 互斥自愈 =================
test('【2】字段约束：长度截断 + holder 占位归位 + carried/location 互斥自愈', () => {
    const V = K.validateLedgerItemOp;
    // desc 截断 80 且记违规
    const d = V({ name: '书', desc: '字'.repeat(100) }, {});
    assert.equal(d.op.desc.length, 80);
    assert.ok(d.reasons.includes('desc_clipped'), 'desc_clipped 记录');
    // holder 占位 → 地上/遗落
    for (const ph of ['无', '地上', 'null', 'none', 'undefined', '', '  ']) {
        const r = V({ name: '包', holder: ph }, {});
        assert.equal(r.op.holder, '地上/遗落', '占位 ' + JSON.stringify(ph) + ' 归位');
        assert.ok(r.reasons.includes('holder_placeholder'));
    }
    // holder 超长截断 20
    const hl = V({ name: '包', holder: '甲'.repeat(30) }, {});
    assert.equal(hl.op.holder.length, 20);
    assert.ok(hl.reasons.includes('holder_clipped'));
    // state：空串 → 完好（非 remove）；remove 不补
    assert.equal(V({ name: '剑', state: '' }, {}).op.state, '完好');
    assert.equal(V({ name: '剑', state: '' }, {}).op.state, '完好');
    const rm = V({ action: 'remove', name: '剑', state: '' }, {});
    assert.equal(rm.op.state, undefined, 'remove 不补 state');
    // state 超长截断 10
    assert.equal(V({ name: '剑', state: '甲'.repeat(20) }, {}).op.state.length, 10);
    // add 无 state → 完好
    assert.equal(V({ name: '剑' }, {}).op.state, '完好');
    // carried 布尔归
    for (const t of [true, 'true', 1, '1', 'yes']) assert.equal(V({ name: 'a', carried: t }, {}).op.carried, true, 'carried ' + t);
    for (const f of [false, 'false', 0, '0', 'no']) assert.equal(V({ name: 'a', carried: f }, {}).op.carried, false, 'carried ' + f);
    // 互斥自愈：carried=true + location → location 清空
    const mx = V({ name: '剑', carried: true, location: '客栈' }, {});
    assert.equal(mx.op.location, '');
    assert.ok(mx.reasons.includes('mutex_carried_wins'));
    // location 占位词归一为空串
    for (const loc of ['null', 'none', '无']) assert.equal(V({ name: 'a', location: loc }, {}).op.location, '');
    // floor：负数/小数/非法值
    assert.equal(V({ name: 'a', floor: -5 }, {}).op.floor, 0);
    assert.equal(V({ name: 'a', floor: 3.7 }, {}).op.floor, 4);
    assert.equal(V({ name: 'a', floor: 'abc' }, {}).op.floor, 0);
    assert.equal(V({ name: 'a' }, { fallbackFloor: 12 }).op.floor, 12, '缺省用 ctx');
    assert.equal(V({ name: 'a', floor: 0 }, { fallbackFloor: 12 }).op.floor, 0, '显式 0 不被 ctx 覆盖');
});

// ================= 3. 批量：逐项独立 + batch 上限 =================
test('【3】批量校验：逐项独立（不因一项脏丢整批）+ batch 上限截断', () => {
    const list = [
        { name: '好剑' },
        null,
        { action: 'explode', name: '坏' },
        { name: '' },
        { name: '盾', holder: '无' }
    ];
    const r = K.validateLedgerItemOps(list, { fallbackFloor: 7 });
    assert.equal(r.items.length, 2, '仅 2 项有效（好剑 + 盾）');
    assert.equal(r.dropped.length, 3, '3 项丢弃');
    assert.equal(r.items[0].name, '好剑');
    assert.equal(r.items[0].floor, 7, '缺省楼层继承');
    assert.equal(r.items[1].holder, '地上/遗落');
    assert.equal(r.violations.length, 4, '2 dropped + 1 dropped + 1 clipped');
    const kinds = r.violations.map(v => v.kind).sort();
    assert.deepEqual(kinds, ['item_clipped', 'item_dropped', 'item_dropped', 'item_dropped']);
    // batch 上限
    const big = Array.from({ length: 100 }, (_, i) => ({ name: 'i' + i }));
    const rb = K.validateLedgerItemOps(big, {});
    assert.equal(rb.items.length, 60, 'batch 上限 60');
    assert.equal(rb.batchTruncated, 40, '截断计数');
    // 空 / 非数组
    assert.equal(K.validateLedgerItemOps(null, {}).items.length, 0);
    assert.equal(K.validateLedgerItemOps([], {}).items.length, 0);
});

// ================= 4. 携带包：默认 add + 主角持有 + floor 0 =================
test('【4】携带包校验：强制 add / 主角持有 / floor 0 / 外部脏值不落真源', () => {
    const list = [
        { name: '旧剑', action: 'remove', carried: false, location: '旧城', floor: 99 },
        { name: '包' },
        null,
        { name: '' }
    ];
    const r = K.validateCarriedItems(list, { fallbackFloor: 500 });
    assert.equal(r.items.length, 2, '2 项有效');
    // 外部 action/carried/location/floor 全部被覆盖
    assert.equal(r.items[0].action, 'add', '强制 add');
    assert.equal(r.items[0].carried, true, '强制持有');
    assert.equal(r.items[0].location, '', 'location 清空');
    assert.equal(r.items[0].floor, 0, '携带包恒 floor 0');
    assert.equal(r.items[1].holder, '主角', '缺省 holder 主角');
    assert.equal(r.items[1].action, 'add');
    assert.equal(r.dropped.length, 2, 'null/空名丢弃');
    assert.ok(r.violations.every(v => v.kind.startsWith('carried_')), '违规 kind 前缀');
});

// ================= 5. 两处写入侧接线（提取 + 携带包）+ 默认值 + 白名单 =================
test('【5】两处写入侧接线：提取入账前 / 携带包入账前（受开关门控）', () => {
    // B1：LLM 提取
    const i1 = src.indexOf('validateLedgerItemOps(extracted.items');
    assert.ok(i1 > 0, 'B1 提取路径接内核');
    const seg1 = src.slice(i1 - 600, i1 + 700);
    assert.ok(seg1.includes('ledgerWriteValidationEnabled === false'), 'B1 开关门控');
    assert.ok(seg1.includes('_recordLedgerViolations'), 'B1 违规入账本');
    assert.ok(seg1.includes("'extract'"), 'B1 来源标记 extract');
    // B2：携带包
    const i2 = src.indexOf('validateCarriedItems(seed.carriedItems)');
    assert.ok(i2 > 0, 'B2 携带包路径接内核');
    const seg2 = src.slice(i2 - 700, i2 + 700);
    assert.ok(seg2.includes('ledgerWriteValidationEnabled === false'), 'B2 开关门控');
    assert.ok(seg2.includes('_recordLedgerViolations'), 'B2 违规入账本');
    assert.ok(seg2.includes("'carryover'"), 'B2 来源标记 carryover');
    // 旧直 push 写法已消失
    assert.ok(!src.includes("action: 'add',\n                            name: it.name"), '旧携带包直 push 已移除');
});

test('【5b】配置默认值 5 键 + 卡覆盖白名单 5 键 + 违规账本字段', () => {
    const d = src.slice(src.indexOf('ledgerWriteValidationEnabled: true'), src.indexOf('ledgerWriteValidationEnabled: true') + 500);
    assert.ok(d.includes('ledgerWriteValidationDebug: false'), 'debug 默认关');
    assert.ok(d.includes('ledgerViolationLogMax: 200'), '环形上限 200');
    assert.ok(d.includes('volumeRetention: 40'), '卷保留 40');
    assert.ok(d.includes('historicalRetention: 24'), '史记保留 24');
    const cc = src.slice(src.indexOf('_applyCardOverrides() {'), src.indexOf('_applyCardOverrides() {') + 2200);
    for (const k of ['ledgerWriteValidationEnabled', 'ledgerWriteValidationDebug', 'ledgerViolationLogMax', 'volumeRetention', 'historicalRetention']) {
        assert.ok(cc.includes(k), '卡覆盖白名单含 ' + k);
    }
    const _ctorSeg = src.slice(src.indexOf('constructor(config) {'), src.indexOf('this.vector = new VectorStore'));
    assert.equal((_ctorSeg.match(/this\._ledgerViolations = \[\];/g) || []).length, 1, '构造函数内违规账本字段仅一处');
    assert.equal((src.match(/this\._ledgerViolations = \[\];/g) || []).length, 2, '方法内另有 1 处防御性初始化');
});

// ================= 6. 违规账本：环形封顶 + 聚合摘要（真执行） =================
test('【6】违规账本：环形封顶 + 按 kind/原因聚合（方法体真执行）', () => {
    const i = src.indexOf('_recordLedgerViolations(violations, source, floor) {');
    const j = src.indexOf('rebuildItems() {', i);
    const body = src.slice(i, j);
    assert.ok(body.includes('_ledgerViolationSummary'), '两方法同段');
    const self = {
        config: { config: { ledgerViolationLogMax: 12, ledgerWriteValidationDebug: false } },
        _ledgerViolations: [],
        opLog: { log() {} }
    };
    const _Mc = new Function('PLUGIN_NAME', 'errLog', 'return class {' + body.replace(/rebuildItems\(\) \{/, '') + '};')(...['LonSha', () => {}]);
    const M = new _Mc();
    // 灌 10 条违规 → 环形封顶 12
    M._recordLedgerViolations.call(self, Array.from({ length: 10 }, () => ({ kind: 'item_dropped', reason: 'missing_name' })), 'extract', 3);
    assert.equal(self._ledgerViolations.length, 10);
    assert.equal(self._ledgerViolations[0].source, 'extract');
    assert.equal(self._ledgerViolations[0].floor, 3);
    assert.ok(typeof self._ledgerViolations[0].ts === 'number', '时间戳');
    // 再灌 10 条 → 封顶 12（丢掉最旧 8）
    M._recordLedgerViolations.call(self, Array.from({ length: 10 }, () => ({ kind: 'item_clipped', reasons: ['desc_clipped'] })), 'carryover', 0);
    assert.equal(self._ledgerViolations.length, 12, '环形封顶');
    // 聚合摘要
    const sum = M._ledgerViolationSummary.call(self);
    assert.ok(/^12 累计/.test(sum), '累计计数: ' + sum);
    assert.ok(sum.includes('item_clipped') && sum.includes('item_dropped'), '按 kind 计数: ' + sum);
    assert.ok(sum.includes('主因'), 'top 原因: ' + sum);
    // 空账本
    assert.equal(M._ledgerViolationSummary.call({ _ledgerViolations: [] }), '0');
    // 空违规不写账本
    assert.equal(M._recordLedgerViolations.call(self, [], 'x', 0), 0);
});

// ================= 7. B4 卷上限：可配置 + 淘汰解折叠回活跃池（行为仿真） =================
test('【7】卷上限：超限逐个淘汰 + 被淘汰卷的源摘要解折叠回活跃池 + op-log 埋点', () => {
    const i = src.indexOf('// [v3.154] 卷上限显式化');
    assert.ok(i > 0, 'B4 落点存在');
    const j = src.indexOf('// [v3.28] 三级金字塔', i);
    const block = src.slice(i, j);
    assert.ok(block.includes('Number(config.volumeRetention) || 40'), '可配置上限（默认 40，旧 20 升级）');
    assert.ok(block.includes('while (this.volumes.length > _volCap)'), '逐个淘汰而非单次 shift');
    assert.ok(block.includes('_s.folded = false'), '源摘要解折叠');
    assert.ok(block.includes('delete') || block.includes('_s.volumeId = undefined'), 'volumeId 解绑');
    assert.ok(block.includes("'evict'"), 'op-log evict 埋点');
    // 行为仿真：5 卷上限 3，卷 0 有 2 条折叠源摘要
    const logs = [];
    const self = {
        volumes: [
            { id: 'v0', floorStart: 1, floorEnd: 2 },
            { id: 'v1', floorStart: 3, floorEnd: 4 },
            { id: 'v2', floorStart: 5, floorEnd: 6 },
            { id: 'v3', floorStart: 7, floorEnd: 8 }
        ],
        summaries: [
            { id: 's1', folded: true, volumeId: 'v0' },
            { id: 's2', folded: true, volumeId: 'v0' },
            { id: 's3', folded: true, volumeId: 'v1' },
            { id: 's4', folded: false }
        ],
        opLog: { log: (...a) => logs.push(a) }
    };
    const body = src.slice(src.indexOf('const _volCap = Math.max(2, Number(config.volumeRetention) || 40);', i), src.indexOf('// [v3.28] 三级金字塔', i));
    const run = new Function('config', 'PLUGIN_NAME', 'with (this) { ' + body + ' }');
    run.call(self, { volumeRetention: 3, debugMode: false }, 'LonSha');
    assert.equal(self.volumes.length, 3, '淘汰到上限 3');
    assert.equal(self.volumes[0].id, 'v1', '淘汰最旧 v0');
    assert.equal(self.summaries.find(s => s.id === 's1').folded, false, 'v0 的 s1 解折叠');
    assert.equal(self.summaries.find(s => s.id === 's2').folded, false, 'v0 的 s2 解折叠');
    assert.equal(self.summaries.find(s => s.id === 's1').volumeId, undefined, 'volumeId 解绑');
    assert.equal(self.summaries.find(s => s.id === 's3').folded, true, '未淘汰卷的摘要不受影响');
    assert.equal(logs.length, 1, 'op-log 一条淘汰记录');
    assert.equal(logs[0][2], 'v0', 'op-log 记录被淘汰卷 id');
    // 未超限不淘汰
    const self2 = { volumes: [{ id: 'a' }, { id: 'b' }], summaries: [], opLog: { log: () => { throw new Error('不应写日志'); } } };
    run.call(self2, { volumeRetention: 40, debugMode: false }, 'LonSha');
    assert.equal(self2.volumes.length, 2, '未超限不动');
});

// ================= 8. B5 史记上限：两路径均可配置 + 显式淘汰日志 =================
test('【8】史记上限：foldHistorical 与 addGrandChronicle 两路径统一口径', () => {
    // foldHistorical 路径
    const i1 = src.indexOf('// [v3.154] 史记上限显式化（anima #31）：同上');
    assert.ok(i1 > 0, 'B5a 落点存在');
    const b1 = src.slice(i1, src.indexOf('// [v3.70] A4', i1));
    assert.ok(b1.includes('Number(config.historicalRetention) || 24'), 'B5a 可配置（默认 24，旧 6 升级）');
    assert.ok(b1.includes('while (this.historical.length > _hisCap)'), 'B5a 逐个淘汰');
    assert.ok(b1.includes("'evict'"), 'B5a op-log 埋点');
    // addGrandChronicle 路径
    const i2 = src.indexOf('// [v3.154] 史记上限显式化（anima #31）：与 foldHistorical 同一口径');
    assert.ok(i2 > 0, 'B5b 落点存在');
    const b2 = src.slice(i2, src.indexOf('return entry;', i2));
    assert.ok(b2.includes('this.config.config.historicalRetention'), 'B5b 读同一配置源');
    assert.ok(b2.includes('while (this.historical.length > _hisCapM)'), 'B5b 逐个淘汰');
    assert.ok(b2.includes("'evict'"), 'B5b op-log 埋点');
    // 行为仿真（B5b）：上限可配 + 逐个淘汰 + op-log
    const i3 = src.indexOf('const _hisCapM = Math.max(1,');
    const e3 = src.indexOf('return entry;', i3);
    const seg3 = src.slice(i3, e3);
    const logs2 = [];
    const self3 = {
        historical: [1, 2, 3, 4, 5].map(n => ({ id: 'h' + n, floorStart: n, floorEnd: n })),
        config: { config: { historicalRetention: 2 } },
        opLog: { log: (...a) => logs2.push(a) }
    };
    const runB = new Function('with (this) { ' + seg3 + ' }');
    runB.call(self3);
    assert.equal(self3.historical.length, 2, 'B5b 淘汰到配置上限 2');
    assert.deepEqual(self3.historical.map(h => h.id), ['h4', 'h5'], 'B5b 保留最新');
    assert.equal(logs2.length, 3, 'B5b 三条淘汰日志');
    assert.equal(logs2[0][2], 'h1', 'B5b 记录被淘汰 id');
    // 上限 24 默认时不淘汰
    const self4 = { historical: [1, 2].map(n => ({ id: 'x' + n })), config: { config: {} }, opLog: { log: () => { throw new Error('不应写日志'); } } };
    runB.call(self4);
    assert.equal(self4.historical.length, 2, 'B5b 未超限不动');
    // 旧静默写法彻底清零
    assert.ok(!src.includes('volumes.length > 20'), '旧 volumes>20 静默已清零');
    assert.ok(!src.includes('historical.length > 6'), '旧 historical>6 静默已清零');
});

// ================= 9. 设置面板登记 =================
test('【9】settings-ui：两开关 + 两滑杆登记（data-cfg 与 data-cfg-num 对齐配置键）', () => {
    assert.ok(sui.includes("ck('ledgerWriteValidationEnabled'"), '写入校验开关');
    assert.ok(sui.includes("ck('ledgerWriteValidationDebug'"), '调试日志开关');
    assert.ok(sui.includes('data-cfg-num="volumeRetention"'), '卷保留滑杆');
    assert.ok(sui.includes('data-cfg-num="historicalRetention"'), '史记保留滑杆');
    assert.ok(sui.includes("id=\"ls-v-volret\"") && sui.includes("id=\"ls-v-hisret\""), '两滑杆数值回显节点');
    // 数值滑杆默认值对齐配置默认
    assert.ok(sui.includes('${c.volumeRetention || 40}'), '卷滑杆默认 40');
    assert.ok(sui.includes('${c.historicalRetention || 24}'), '史记滑杆默认 24');
});

// ================= 10. 诊断面板台账校验行 =================
test('【10】诊断面板：物品台账行后新增台账校验行（可观测）', () => {
    const i = src.indexOf("['物品台账'");
    const j = src.indexOf("['台账校验'");
    assert.ok(i > 0 && j > i, '台账校验行紧跟物品台账行');
    const seg = src.slice(i, j + 120);
    assert.ok(seg.includes('_ledgerViolationSummary'), '行内消费聚合摘要');
    assert.ok(seg.includes('? this._ledgerViolationSummary() : '), '方法缺失时降级显示');
});

// ================= 11. 版本四处同步 + 旧锚点接管 + 旧测试去当版独占 =================
test('【11】版本下限 3.154.0（CHANGELOG 头与旧锚点交后续版本接管）', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.ok(vnum(v) >= vnum('3.154.0'), `index.js 版本 ${v} >= 3.154.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.154.0'), 'manifest 版本');
    assert.ok(vnum(pkg.version) >= vnum('3.154.0'), 'package 版本');
});

test('【11b】v3153 测试已去当版独占（CHANGELOG/旧锚点交本版接管）', () => {
    const t153 = readFileSync(path.join(ROOT, 'tests/v3153_swipe_ledger_aware.test.mjs'), 'utf-8');
    assert.ok(!t153.includes("startsWith('## v3.153.0')"), 'v3153 不再断言 CHANGELOG 头');
    assert.ok(!t153.includes('assert.ok(ts.includes('), 'v3153 不再跑旧锚点循环');
    assert.ok(!t153.includes('版本锚点同步 3.153.0'), 'v3153 不再独占旧锚点断言');
});
