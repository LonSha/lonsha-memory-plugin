// tests/v3372_seventh_cycle_batch_b.test.mjs — [LonSha记忆插件 · 第七期批次 B]
// M7-O4 视角与权限预览、M7-O5 生成前记忆计划、M7-O6 生成后事实回执
import test from 'node:test';
import assert from 'node:assert/strict';

import perspectiveLib from '../perspective-preview.js';
import memoryPlanLib from '../generation-memory-plan.js';
import factReceiptLib from '../generation-fact-receipt.js';

test('LonSha · 第七期批次 B · M7-O4 记忆权限与视角预览', async (t) => {
    await t.test('自检零异常', () => {
        const check = perspectiveLib.perspectivePreviewSelfCheck();
        assert.deepEqual(check.problems, [], 'perspectivePreviewSelfCheck 必须零问题');
    });

    await t.test('密级评估：公开、专属知悉、角色独知遮蔽、fail-closed阻断', () => {
        const rawFacts = [
            { id: 'f1', content: '红星机械厂成立于1958年', tier: 'public_known' },
            { id: 'f2', content: '林舟与周姐昨晚签署了合伙保密协议', tier: 'character_exclusive', allowedHolders: ['lin_zhou', 'zhou_jie'] },
            { id: 'f3', content: '林舟在老宅暗格藏了一本账本', tier: 'character_exclusive', allowedHolders: ['lin_zhou', 'zhou_jie'], maskedFields: ['暗格', '账本'] }
        ];

        // 1. 公开事实对任何角色均可透传
        const v1 = perspectiveLib.evaluateFactPerspective(rawFacts[0], 'passerby_a');
        assert.equal(v1.verdict, 'accessible');
        assert.equal(v1.known, true);
        assert.equal(v1.content, '红星机械厂成立于1958年');

        // 2. 授权角色查看限定事实 -> accessible
        const v2Auth = perspectiveLib.evaluateFactPerspective(rawFacts[1], 'zhou_jie');
        assert.equal(v2Auth.verdict, 'accessible');
        assert.equal(v2Auth.known, true);

        // 3. 未授权角色查看限定事实 -> blocked (fail-closed)
        const v2NoAuth = perspectiveLib.evaluateFactPerspective(rawFacts[1], 'stranger_b');
        assert.equal(v2NoAuth.verdict, 'blocked');
        assert.equal(v2NoAuth.known, false);

        // 4. 他人查看独知事实 -> masked 脱敏
        const v3Other = perspectiveLib.evaluateFactPerspective(rawFacts[2], 'zhou_jie');
        assert.equal(v3Other.verdict, 'masked');
        assert.equal(v3Other.masked, true);
        assert.ok(v3Other.content.includes('***'), '敏感词必须被替换遮蔽');
        assert.ok(!v3Other.content.includes('暗格'), '遮蔽后不得泄露敏感原词');
    });
});

test('LonSha · 第七期批次 B · M7-O5 生成前记忆计划', async (t) => {
    await t.test('自检零异常', () => {
        const check = memoryPlanLib.generationMemoryPlanSelfCheck();
        assert.deepEqual(check.problems, [], 'generationMemoryPlanSelfCheck 必须零问题');
    });

    await t.test('四层材料计划组织、用户手动移除、Token预算透明裁剪与消费差异', () => {
        const rawItems = [
            { id: 'm1', content: '核心设定：修仙世界观', tier: 'essential', tokenCost: 100 },
            { id: 'm2', content: '当前议题：解决宗门灵脉枯竭', tier: 'essential', tokenCost: 80 },
            { id: 'm3', content: '背景补充：三百年大战遗留阵法', tier: 'optional', tokenCost: 90 },
            { id: 'm4', content: '用户私人标注：此段不要提灵脉旧账', tier: 'optional', tokenCost: 50 }
        ];

        // 1. 构建计划
        let plan = memoryPlanLib.buildGenerationPlan('修仙主线议题', rawItems);
        assert.equal(plan.totalTokenCost, 320);
        assert.equal(plan.items.length, 4);

        // 2. 用户手动移除私密/不合时宜项
        plan = memoryPlanLib.removePlanItem(plan, 'm4', '用户手动剔除');
        assert.equal(plan.items.length, 4);
        assert.equal(plan.totalTokenCost, 270);
        assert.equal(plan.items.find(x => x.id === 'm4').removed, true);

        // 3. 施加预算上限裁剪（假定上限 200 tokens）
        const budgeted = memoryPlanLib.applyBudgetLimit(plan, 200);
        assert.ok(budgeted.totalTokenCost <= 200, '裁剪后总Token不得超标');
        assert.equal(budgeted.budgetTrimmed, true);
        assert.ok(budgeted.trimmedItems.length >= 1, '应记入 trimmedItems');

        // 4. 消费对比
        const comp = memoryPlanLib.comparePlanConsumption(budgeted, ['m1', 'm2']);
        assert.equal(comp.fullyCompliant, true);
        assert.equal(comp.missedInjections.length, 0);
    });
});

test('LonSha · 第七期批次 B · M7-O6 生成后事实回执', async (t) => {
    await t.test('自检零异常', () => {
        const check = factReceiptLib.generationFactReceiptSelfCheck();
        assert.deepEqual(check.problems, [], 'generationFactReceiptSelfCheck 必须零问题');
    });

    await t.test('增量候选生命周期流转、采纳与过滤、拒绝项隔离、楼层回滚', () => {
        const rawEntries = [
            { id: 'e1', text: '林舟将店面转让给了周姐', kind: 'confirmed_fact' },
            { id: 'e2', text: '下周如果周姐有空，林舟打算陪她去挑货', kind: 'conditional_proposal' },
            { id: 'e3', text: '林舟心里觉得周姐是个绝世高人（模型草稿）', kind: 'model_draft' }
        ];

        // 1. 构建回执单
        let receipt = factReceiptLib.buildGenerationReceipt(15, '这是15楼正文', rawEntries);
        assert.equal(receipt.floor, 15);
        assert.equal(receipt.entries.length, 3);
        assert.equal(receipt.entries[0].status, 'pending');

        // 2. 处理各条候选：采纳 e1、拒绝 e3、改写采纳 e2
        const afterAccept = factReceiptLib.acceptReceiptItem(receipt, 'e1');
        const afterReject = factReceiptLib.rejectReceiptItem(afterAccept, 'e3', '纯属模型无端脑补，不予入库');
        const afterEdit = factReceiptLib.editReceiptItem(afterReject, 'e2', '林舟与周姐口头约定下周挑货');

        // 3. 消费过滤：仅采纳和编辑项被准入入库
        const admitted = factReceiptLib.filterAdmittedFacts([afterEdit]);
        assert.equal(admitted.length, 2, '准入名单恰好为 2 条');
        assert.ok(!admitted.some(x => x.id === 'e3'), '被拒绝的模型草稿绝不准入');
        assert.equal(admitted.find(x => x.id === 'e2').content, '林舟与周姐口头约定下周挑货', '改写内容应准确写入');

        // 4. 楼层回滚一致性：15楼被回滚后，对应回执项标记 rolled_back
        const rolledList = factReceiptLib.rollbackFloorReceipts([afterEdit], 15);
        assert.equal(rolledList[0].floorRolledBack, true);
        assert.ok(rolledList[0].entries.every(e => e.status === 'rolled_back'));

        // 5. 回滚后重新提取准入项：应为空
        const admittedAfterRollback = factReceiptLib.filterAdmittedFacts(rolledList);
        assert.equal(admittedAfterRollback.length, 0, '回滚后回执中的事实不被准入');
    });
});
