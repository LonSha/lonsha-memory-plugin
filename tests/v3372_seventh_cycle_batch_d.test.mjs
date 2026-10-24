// tests/v3372_seventh_cycle_batch_d.test.mjs — [LonSha记忆插件 · 第七期批次 D]
// M7-O9 记忆迁移与项目边界体验
import test from 'node:test';
import assert from 'node:assert/strict';

import boundaryLib from '../memory-migration-boundary.js';

test('LonSha · 第七期批次 D · M7-O9 记忆迁移与项目边界体验', async (t) => {
    await t.test('自检零异常', () => {
        const check = boundaryLib.memoryMigrationBoundarySelfCheck();
        assert.deepEqual(check.problems, [], 'memoryMigrationBoundarySelfCheck 必须零问题');
    });

    await t.test('三项目迁移预览、fail-closed权限阻断、敏感词脱敏、键冲突处理与精准撤销', () => {
        // 1. 构造具有同名实体（林舟）、角色秘密与共享事实的数据
        const sourceFacts = [
            { factKey: 'fact_world_canon', content: '沧澜大陆修仙宗门共有五大正宗', tier: 'public_known' },
            { factKey: 'fact_lin_secret', content: '林舟真实身份为魔界遗失的圣子', tier: 'private_self' },
            { factKey: 'fact_rumor', content: '传闻后山禁地每隔六十年有异兽出没', tier: 'unproven' },
            { factKey: 'fact_joint_pact', content: '林舟与周姐立下密约，瓜分老宅遗宝', tier: 'character_exclusive', sensitiveTokens: ['密约', '老宅遗宝'] }
        ];

        // 2. 生成从 project_src 到 project_target 的迁移预览
        let preview = boundaryLib.generateMigrationPreview('project_src', 'project_target', sourceFacts);
        assert.equal(preview.candidates.length, 4);
        assert.equal(preview.summary.totalCount, 4);

        // 3. 验证 fail-closed 契约：
        // 公开事实 -> 默认 include
        const canonItem = preview.candidates.find(c => c.factKey === 'fact_world_canon');
        assert.equal(canonItem.decision, 'include');

        // 私密自知事实 -> 默认 exclude (严防外带)
        const secretItem = preview.candidates.find(c => c.factKey === 'fact_lin_secret');
        assert.equal(secretItem.decision, 'exclude');

        // 未证实事实 -> 默认 exclude
        const rumorItem = preview.candidates.find(c => c.factKey === 'fact_rumor');
        assert.equal(rumorItem.decision, 'exclude');

        // 4. 用户决策调整：将限定事实标记为 anonymize 脱敏外带
        preview = boundaryLib.updateCandidateDecision(preview, 'fact_joint_pact', 'anonymize', { reason: '去敏后允许跨项目继承' });
        const pactItem = preview.candidates.find(c => c.factKey === 'fact_joint_pact');
        assert.equal(pactItem.decision, 'anonymize');
        assert.equal(preview.summary.anonymizedCount, 1);

        // 5. 执行迁移（假定目标项目已存在 fact_world_canon 发生键名冲突）
        const existingKeysInTarget = ['fact_world_canon'];
        const result = boundaryLib.executeMigration(preview, existingKeysInTarget);

        // 验证迁出与未迁清单
        assert.equal(result.migratedRecords.length, 2, '迁移记录应为 2 条 (公开 + 脱敏)');
        assert.equal(result.unmigratedManifest.length, 2, '未迁移清单应为 2 条 (私密 + 未证实)');

        // 验证键名冲突处理：已存在则自动加 sourceProjectId 前缀
        const canonRecord = result.migratedRecords.find(r => r.originalFactKey === 'fact_world_canon');
        assert.equal(canonRecord.factKey, 'project_src_fact_world_canon', '目标存在同名键时应自动加前缀隔离');

        // 验证脱敏结果：敏感词被替换为 [已脱敏]
        const pactRecord = result.migratedRecords.find(r => r.originalFactKey === 'fact_joint_pact');
        assert.ok(pactRecord.content.includes('[已脱敏]'));
        assert.ok(!pactRecord.content.includes('老宅遗宝'), '敏感原词不得外泄');

        // 6. 事务级撤销迁移测试
        const targetDatabase = [
            ...result.migratedRecords,
            { factKey: 'unrelated_original_item', content: '目标库原本存在的重要设定' }
        ];

        const revertResult = boundaryLib.revertMigration(targetDatabase, result.revertReceipt);
        assert.equal(revertResult.clearedKeyCount, 2, '应清除本次注入的 2 个键');
        assert.equal(revertResult.remainingRecords.length, 1, '目标库应仅留存原有数据');
        assert.equal(revertResult.remainingRecords[0].factKey, 'unrelated_original_item');
    });
});