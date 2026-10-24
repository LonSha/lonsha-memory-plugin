/* ============================================================
 * tests/v3372_eighth_cycle_batch_c.test.mjs — [第八期 · 批次 C]
 * 覆盖：
 *   - M8-O7 批量记忆维护流水线（batch-maintenance-pipeline.js）
 *   - M8-O8 跨项目记忆迁移工作台（cross-project-migration-desk.js）
 *   - M8-X6 记忆驱动的角色成长剧（character-growth-drama.js）
 *   - M8-X7 知情边界与秘密戏剧（secret-theater.js）
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const R = process.cwd();

const BatchPipeline = require_(path.join(R, 'batch-maintenance-pipeline.js'));
const CrossProjectDesk = require_(path.join(R, 'cross-project-migration-desk.js'));
const CharacterGrowth = require_(path.join(R, 'character-growth-drama.js'));
const SecretTheater = require_(path.join(R, 'secret-theater.js'));

test('M8-O7 · 批量记忆维护流水线：操作自检、Dry-Run 预览、回执执行与全局撤销', () => {
    const check = BatchPipeline.batchMaintenanceSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = BatchPipeline.normalizeBatchMaintenanceState(null);
    const now = 1700000000000;

    const sampleItems = [
        { id: 'f1', content: '旧情报 1', isArchived: false, securityTier: 'public_known' },
        { id: 'f2', content: '旧情报 2', isArchived: false, securityTier: 'public_known' }
    ];

    // 1. 生成归档 Dry-Run 预览
    const preview = BatchPipeline.createBatchPreview(sampleItems, BatchPipeline.BATCH_ACTIONS.ARCHIVE);
    assert.equal(preview.valid, true);
    assert.equal(preview.targetCount, 2);
    assert.equal(preview.previewItems[0].transformed.isArchived, true);

    // 2. 提交流水线执行
    const execRes = BatchPipeline.executeBatchPipeline(state, preview, now);
    assert.equal(execRes.success, true);
    assert.ok(execRes.receipt.receiptId);
    state = execRes.state;

    // 3. 全局撤销
    const revertRes = BatchPipeline.revertBatchPipeline(state, execRes.receipt.receiptId, now + 1000);
    assert.equal(revertRes.success, true);
    assert.equal(revertRes.restoredCount, 2);
    assert.equal(revertRes.restoredItems[0].isArchived, false); // 成功恢复前态！
});

test('M8-O8 · 跨项目记忆迁移工作台：无 owner 阻断、依赖闭包与私密隔离', () => {
    const check = CrossProjectDesk.crossProjectMigrationSelfCheck();
    assert.deepEqual(check.problems, []);

    // 1. 无 owner 阻断验证
    const badPkg = { sourceProjectId: 'p1', targetProjectId: 'p2', selectedFactIds: ['f1'] };
    const valBad = CrossProjectDesk.validateContinuationPackage(badPkg);
    assert.equal(valBad.valid, false);
    assert.equal(valBad.reason, 'missing-owner-blocked');

    // 2. 依赖闭包分析：f2 依赖 f1 前置事实，如果只选了 f2 则闭包不完整
    const projectFacts = [
        { id: 'f1', content: '祖父在边陲立下的家规', prerequisiteFactIds: [] },
        { id: 'f2', content: '家族第二代遵循家规分家', prerequisiteFactIds: ['f1'] },
        { id: 'f3_secret', content: '分家时私藏了一张藏宝图', prerequisiteFactIds: ['f2'], isSecret: true }
    ];

    const closureCheck = CrossProjectDesk.computeDependencyClosure(['f2'], projectFacts);
    assert.equal(closureCheck.isComplete, false);
    assert.equal(closureCheck.missingPrerequisites[0].missingFactId, 'f1');

    // 3. 跨项目打包：选了 f1, f2, f3_secret，但 f3_secret 被私密隔离保护排除
    const packRes = CrossProjectDesk.packCrossProjectManifest({
        owner: 'author_lonsha',
        sourceProjectId: 'vol_01',
        targetProjectId: 'vol_02',
        selectedFactIds: ['f1', 'f2', 'f3_secret']
    }, projectFacts);

    assert.equal(packRes.success, true);
    assert.equal(packRes.manifest.items.length, 2); // 仅 f1, f2 成功打包
    assert.equal(packRes.manifest.excludedSecrets.length, 1);
    assert.equal(packRes.manifest.excludedSecrets[0].id, 'f3_secret');
});

test('M8-X6 · 记忆驱动的角色成长剧：阶段阶梯、经历锚定与前置失效反冲', () => {
    const check = CharacterGrowth.characterGrowthSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = CharacterGrowth.normalizeGrowthState(null);
    const now = 1700000000000;

    // 1. 开启 Alice 的小提琴演奏技能成长轨迹
    const initRes = CharacterGrowth.initiateGrowthTrajectory(state, 'char_alice', 'violin_performance', '小提琴独奏');
    assert.equal(initRes.success, true);
    state = initRes.state;
    const trajId = initRes.trajectory.id;
    assert.equal(initRes.trajectory.currentStage, CharacterGrowth.GROWTH_STAGES.LEARNING);

    // 2. 推进至 FAILURE（遭遇挫败）：必须提供具体事件 ID
    const stepFailure = CharacterGrowth.recordGrowthMilestone(
        state,
        trajId,
        CharacterGrowth.GROWTH_STAGES.FAILURE,
        'event_broken_string_at_gala',
        '在初次青年节庆典演出中断弦，未能完成合奏',
        now + 100
    );
    assert.equal(stepFailure.success, true);
    state = stepFailure.state;
    assert.equal(state.trajectories[trajId].currentStage, CharacterGrowth.GROWTH_STAGES.FAILURE);

    // 3. 推进至 ADJUSTMENT（反思调适）
    state = CharacterGrowth.recordGrowthMilestone(
        state,
        trajId,
        CharacterGrowth.GROWTH_STAGES.ADJUSTMENT,
        'event_solitary_practice_in_woods',
        '在林中小屋独自练习换弦与盲奏技术',
        now + 200
    ).state;

    // 4. 假设有人回滚了'event_broken_string_at_gala'经历，成长轨迹应标记为证据受损
    const reconcileRes = CharacterGrowth.reconcileGrowthEvidence(state, ['event_broken_string_at_gala'], now + 300);
    assert.equal(reconcileRes.compromisedCount, 1);
    assert.equal(reconcileRes.state.trajectories[trajId].isEvidenceCompromised, true);
});

test('M8-X7 · 知情边界与秘密戏剧：登记机密、受控私下透露与视角隔离观察', () => {
    const check = SecretTheater.secretTheaterSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = SecretTheater.normalizeSecretState(null);
    const now = 1700000000000;

    // 1. 登记一条机密（仅 user 知道）
    const regRes = SecretTheater.registerSecret(state, {
        id: 'sec_vault_code',
        title: '老金库的暗码',
        content: '暗码是当年祖父怀表后盖上刻着的三位数：749',
        surfaceClue: '每次靠近老金库，他总会下意识摸一摸怀表后盖',
        originator: 'user'
    }, now);
    assert.equal(regRes.success, true);
    state = regRes.state;

    // 2. 查看不同角色的感知投影：
    // 知情人 user 能看到完整机密
    const userObs = SecretTheater.renderSecretObservation(state.secrets['sec_vault_code'], 'user');
    assert.equal(userObs.known, true);
    assert.ok(userObs.content.includes('749'));

    // 不知情人 Alice 只能看到表层迹象，绝不泄漏正文
    const aliceObs = SecretTheater.renderSecretObservation(state.secrets['sec_vault_code'], 'char_alice');
    assert.equal(aliceObs.known, false);
    assert.ok(!aliceObs.content.includes('749'));
    assert.ok(aliceObs.content.includes('表象痕迹'));

    // 3. User 私下透露给 Alice
    const disRes = SecretTheater.discloseSecret(state, 'sec_vault_code', 'user', 'char_alice', '立誓绝不告诉第三人', now + 100);
    assert.equal(disRes.success, true);
    state = disRes.state;

    // 现在 Alice 可以看到机密了
    const aliceObsAfter = SecretTheater.renderSecretObservation(state.secrets['sec_vault_code'], 'char_alice');
    assert.equal(aliceObsAfter.known, true);
    assert.ok(aliceObsAfter.content.includes('749'));
});