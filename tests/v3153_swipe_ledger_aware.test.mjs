/* ============================================================
 * v3.153.0 — ANIMA 感知线补全：swipe 感知（#33）+ 台账臂智能感知（#28 轻量版）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import path from 'node:path';
const ROOT = '/home/user/lonsha-memory-plugin';
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

// ================= 1. 结构接线 =================
test('【1】结构接线：swipe 态标记 + 当前楼层标记 + 两个新开关', () => {
    assert.ok(src.includes('this._swipeRegen'), 'swipe 重绘态标记字段');
    assert.ok(src.includes('this._currentFloor'), '当前楼层标记字段');
    assert.ok(src.includes('swipeAwareRecallEnabled'), 'swipe 感知开关');
    assert.ok(src.includes('ledgerAwareQuotaEnabled'), '台账臂开关');
    assert.ok(src.includes('computeRecallQuota()'), '配额计算器仍在');
});

// ================= 2. swipe 检测落点（onBeforeGeneration 读末楼 swipe_id）==================
test('【2】swipe 检测在生成前路径接线（末楼 swipe_id 判定）', () => {
    const obg = src.indexOf('async onBeforeGeneration(context)');
    assert.ok(obg > 0, 'onBeforeGeneration 存在');
    const seg = src.slice(obg, obg + 2400);
    assert.ok(seg.includes('this._swipeRegen ='), '生成前设 _swipeRegen');
    assert.ok(seg.includes('swipe_id'), '读 swipe_id');
    assert.ok(seg.includes('this._currentFloor ='), '生成前设 _currentFloor');
    // swipe_id>0 语义（重绘态）
    assert.ok(/> 0/.test(seg) || seg.includes('swiped'), 'swipe_id>0 判定');
});

// ================= 3. 台账臂：computeRecallQuota 内消费 itemOps + swipe 臂 =================
test('【3】computeRecallQuota 新增 swipe 臂 + 台账臂（各自门控）', () => {
    const q = src.indexOf('computeRecallQuota() {');
    assert.ok(q > 0, '方法存在');
    const seg = src.slice(q, q + 2600);
    // swipe 臂：受 swipeAwareRecallEnabled 门控，命中 _swipeRegen 上调配额
    assert.ok(seg.includes('swipeAwareRecallEnabled'), 'swipe 臂门控');
    assert.ok(seg.includes('this._swipeRegen'), 'swipe 臂读重绘态');
    // 台账臂：受 ledgerAwareQuotaEnabled 门控，近期 itemOps 上调配额
    assert.ok(seg.includes('ledgerAwareQuotaEnabled'), '台账臂门控');
    assert.ok(seg.includes('this.itemOps') || seg.includes('itemOps'), '台账臂读物品 ops');
    assert.ok(seg.includes('this._currentFloor'), '台账臂按当前楼层窗口');
    // clamp 上界仍守（新增两臂不得突破 [0.7,1.6] 语义，最多微调上界）
    assert.ok(/Math\.min\(1\.[6-9]/.test(seg) && /Math\.max\(0\.[5-7]/.test(seg), '配额仍 clamp');
});

// ================= 4. 默认关行为不变（两臂默认 false → 恒返回 1）==================
test('【4】默认关短路：statusAwareQuotaEnabled 非 true 恒返回 1', () => {
    const q = src.indexOf('computeRecallQuota() {');
    const seg = src.slice(q, q + 400);
    assert.ok(seg.includes('statusAwareQuotaEnabled !== true'), '总门控短路仍在');
    assert.ok(seg.includes('return 1'), '短路返回 1');
});

// ================= 5. UI 登记 + v3113 白名单消解 =================
test('【5】settings-ui 登记两开关 + 卡覆盖白名单', () => {
    const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
    assert.ok(sui.includes("ck('swipeAwareRecallEnabled'"), 'swipe 开关 UI 登记');
    assert.ok(sui.includes("ck('ledgerAwareQuotaEnabled'"), '台账开关 UI 登记');
    // 卡覆盖白名单（_applyCardOverrides 的 CARD_CFG_KEYS）
    const cc = src.indexOf('_applyCardOverrides() {');
    const seg = src.slice(cc, cc + 1600);
    assert.ok(seg.includes('swipeAwareRecallEnabled'), 'swipe 开关进卡覆盖白名单');
    assert.ok(seg.includes('ledgerAwareQuotaEnabled'), '台账开关进卡覆盖白名单');
    // v3113 白名单不新增（两开关均有 UI，不需要白名单豁免）
});

// ================= 6. 版本下限（当版独占断言已交 v3154 接管）=================
test('【6】版本下限 3.153.0（CHANGELOG 头与旧锚点交后续版本接管）', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.ok(vnum(v) >= vnum('3.153.0'), `index.js 版本 ${v} >= 3.153.0`);
    assert.ok(vnum(manifest.version) >= vnum('3.153.0'), 'manifest 版本');
    assert.ok(vnum(pkg.version) >= vnum('3.153.0'), 'package 版本');
});

// ================= 7. 旧版 v3152 测试去当版独占断言 =================
test('【7】v3152 测试已去当版独占（CHANGELOG/旧锚点交本版接管）', () => {
    const t152 = readFileSync(path.join(ROOT, 'tests/v3152_entity_lexicon.test.mjs'), 'utf-8');
    assert.ok(!t152.includes("startsWith('## v3.152.0')"), 'v3152 不再断言 CHANGELOG 头');
    assert.ok(!t152.includes("tests/v3117_diagnostics.test.mjs"), 'v3152 不再断言旧锚点');
});