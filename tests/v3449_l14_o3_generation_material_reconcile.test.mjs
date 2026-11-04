import test from 'node:test';
import assert from 'node:assert/strict';
import Plan from '../generation-memory-plan.js';
import Reconcile from '../generation-material-reconcile.js';
import fs from 'node:fs';

const read = (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('L14-O3 生成材料对拍：自检与纯函数边界', () => {
    assert.deepEqual(Reconcile.generationMaterialReconcileSelfCheck().problems, []);
    const plan = Plan.buildGenerationPlan('关系场景', [
        { id: 'public', content: '公共事实', tier: 'essential', tokenCost: 10 },
        { id: 'private', content: '私密事实', tier: 'optional', tokenCost: 10 },
        { id: 'trimmed', content: '背景材料', tier: 'optional', tokenCost: 10 }
    ]);
    const selected = Reconcile.buildSelectionPlan(plan, { excludeIds: new Set(['private']) });
    assert.deepEqual(selected.temporaryExcludedIds, ['private']);
    assert.equal(selected.writes, false);
    const actual = { blocks: [
        { id: 0, materialId: 'public', kept: true, chars: 4, via: 'trace' },
        { id: 1, materialId: 'trimmed', kept: false, reason: 'dropped-budget', chars: 4, via: 'trace' }
    ] };
    const result = Reconcile.reconcileGenerationConsumption(plan, actual, { excludeIds: new Set(['private']) });
    assert.equal(result.status, 'diverged');
    assert.equal(result.writes, false);
    assert.equal(result.counts.injected, 1);
    assert.equal(result.counts['budget-trimmed'], 1);
    assert.equal(result.counts['temporarily-excluded'], 1);
    assert.deepEqual(result.permissionRejectedIds, []);
});

test('L14-O3 区分权限拒绝、计划外进入、未知映射，不用文本猜身份', () => {
    const plan = { sceneGoal: '消歧场景', revision: 'r1', items: [
        { id: 'allowed', content: '相同文本', permission: 'allowed' },
        { id: 'blocked', content: '相同文本', permission: 'blocked' }
    ] };
    const result = Reconcile.reconcileGenerationConsumption(plan, { blocks: [
        { id: 0, materialId: 'allowed', kept: true, chars: 4 },
        { id: 1, materialId: 'blocked', kept: false, reason: 'permission-rejected', chars: 4 },
        { id: 2, materialId: 'not-planned', kept: true, chars: 4 },
        { id: 3, kept: true, chars: 4 }
    ] });
    assert.equal(result.status, 'partially-measurable');
    assert.equal(result.counts.injected, 1);
    assert.equal(result.counts['permission-rejected'], 1);
    assert.equal(result.counts['outside-plan'], 1);
    assert.equal(result.unknown.length, 1);
    assert.equal(result.unknown[0].state, 'unknown');
    assert.match(result.note, /materialId/);
});

test('L14-O3 取消准备零写入，且一次排除不改默认计划', () => {
    const plan = Plan.buildGenerationPlan('取消场景', [
        { id: 'a', content: 'A', tier: 'essential' },
        { id: 'b', content: 'B', tier: 'optional' }
    ]);
    const cancelled = Reconcile.reconcileGenerationConsumption(plan, { blocks: [] }, { cancelled: true });
    assert.equal(cancelled.status, 'cancelled');
    assert.equal(cancelled.writes, false);
    assert.equal(plan.items.find(x => x.id === 'a').removed, false);
    const oneRound = Reconcile.buildSelectionPlan(plan, { excludeIds: new Set(['b']) });
    const nextRound = Reconcile.buildSelectionPlan(plan, {});
    assert.deepEqual(oneRound.temporaryExcludedIds, ['b']);
    assert.deepEqual(nextRound.selectedIds, ['a', 'b']);
});

test('L14-O3 回执接线：真实注入回读可消费逐条状态，宿主不另算文本', () => {
    const manifest = JSON.parse(read('manifest.json'));
    assert.equal(manifest.extra_js.filter(x => x === 'generation-material-reconcile.js').length, 1);
    const index = read('index.js');
    const pipeline = read('engine-injection-pipeline.js');
    const ui = read('settings-ui.js');
    assert.match(index, /LonShaGenerationMaterialReconcile/);
    assert.match(index, /generationMaterialReconcileSelfCheck/);
    assert.match(pipeline, /_generationMaterialReconcileLib/);
    assert.match(pipeline, /materialReconcile/);
    assert.match(ui, /_bs\.materialReconcile/);
    const plan = { sceneGoal: '回执', revision: 'r2', items: [{ id: 'm1', content: 'X' }] };
    const readout = { origin: 'generation', round: 2, blocks: [{ id: 0, materialId: 'm1', kept: true, chars: 1, via: 'trace' }] };
    const receipt = Reconcile.receiptFromInjectionReadout(readout);
    const result = Reconcile.reconcileFromReceipt(plan, receipt);
    assert.equal(result.status, 'matched');
    assert.equal(result.entries[0].state, 'injected');
    assert.equal(result.writes, false);
});
