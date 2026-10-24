// tests/v3372_seventh_cycle_expansion_batch_b.test.mjs — [LonSha记忆插件 · 第七期拓展批次 B]
import test from 'node:test';
import assert from 'node:assert/strict';

import RelationshipRepairTheater from '../relationship-repair-theater.js';
import UnfinishedPledgeTheater from '../unfinished-pledge-theater.js';

test('LonSha · 第七期拓展批次 B · M7-X5 关系修复剧场', async (t) => {
    await t.test('自检零异常', () => {
        const res = RelationshipRepairTheater.relationshipRepairTheaterSelfCheck();
        assert.deepEqual(res.problems, []);
    });

    await t.test('知情不对称保护（未坦白关键隐情不可伪造完全和解）', () => {
        let encounter = RelationshipRepairTheater.createRepairEncounter({
            encounterId: 'enc_secret_demo',
            initiatorId: 'char_a',
            initiatorName: '林深',
            recipientId: 'char_b',
            recipientName: '苏简',
            conflictCore: '项目署名被撤事件',
            initiatorKnowledge: ['撤署名是投资方强加的条件', '自己曾据理力争但未告知对方'],
            recipientKnowledge: ['只知道自己的名字被突然移除了']
        });

        // 尝试求和但不告知隐情
        encounter = RelationshipRepairTheater.executeRepairPath(
            encounter,
            RelationshipRepairTheater.REPAIR_PATH.EXPLAIN_AND_RECONCILE,
            { revealHiddenTruth: false }
        );

        assert.equal(encounter.chosenPath, RelationshipRepairTheater.REPAIR_PATH.EXPLAIN_AND_RECONCILE);
        assert.ok(encounter.unresolvedTensions.includes('尚未坦白的关键隐情'));
    });

    await t.test('推演可撤销还原与拒绝路线留痕', () => {
        let encounter = RelationshipRepairTheater.createRepairEncounter({
            encounterId: 'enc_decline_demo',
            initiatorId: 'char_c',
            recipientId: 'char_d',
            conflictCore: '背弃合伙誓言'
        });

        // 推演并设定边界
        encounter = RelationshipRepairTheater.executeRepairPath(
            encounter,
            RelationshipRepairTheater.REPAIR_PATH.SET_BOUNDARIES,
            { adoptOutcome: false }
        );
        assert.equal(encounter.stage, RelationshipRepairTheater.THEATER_STAGE.RESOLVED);

        // 撤销还原
        encounter = RelationshipRepairTheater.revertRepairOutcome(encounter);
        assert.equal(encounter.stage, RelationshipRepairTheater.THEATER_STAGE.REVERTED);

        // 选择明确拒绝路线
        encounter = RelationshipRepairTheater.executeRepairPath(
            encounter,
            RelationshipRepairTheater.REPAIR_PATH.DECLINE_RECONCILIATION,
            { adoptOutcome: true }
        );
        assert.equal(encounter.chosenPath, RelationshipRepairTheater.REPAIR_PATH.DECLINE_RECONCILIATION);
        assert.equal(encounter.isAdopted, true);
        assert.ok(encounter.unresolvedTensions.includes('未能弥合的决裂隔阂'));
    });
});

test('LonSha · 第七期拓展批次 B · M7-X7 未完成之事的约定剧场', async (t) => {
    await t.test('自检零异常', () => {
        const res = UnfinishedPledgeTheater.unfinishedPledgeTheaterSelfCheck();
        assert.deepEqual(res.problems, []);
    });

    await t.test('约定协商改期版本演进、保留理由且不自动超时判定', () => {
        let pledge = UnfinishedPledgeTheater.createPledge({
            pledgeId: 'pledge_reunion',
            title: '重返海边灯塔看日落',
            pledgerId: 'char_x',
            pledgerName: '小凡',
            recipientId: 'char_y',
            recipientName: '子安',
            promiseContent: '十年后的盛夏重返灯塔',
            expectedMilestone: '十年后的7月15日',
            whoRemembers: ['小凡'],
            whoUnawareOrForgot: ['子安']
        });

        // 验证初始状态与离线不超时
        assert.equal(pledge.status, UnfinishedPledgeTheater.PLEDGE_STATUS.PENDING);
        assert.equal(pledge.whoRemembers.length, 1);
        assert.equal(pledge.whoUnawareOrForgot.length, 1);

        // 协商改期
        pledge = UnfinishedPledgeTheater.advancePledge(
            pledge,
            UnfinishedPledgeTheater.PLEDGE_ACTION.RESCHEDULE,
            {
                newMilestone: '秋季台风季过后',
                reason: '盛夏灯塔维修施工封闭'
            }
        );

        assert.equal(pledge.status, UnfinishedPledgeTheater.PLEDGE_STATUS.RESCHEDULED);
        assert.equal(pledge.timelineVersions.length, 2);
        assert.equal(pledge.timelineVersions[1].milestone, '秋季台风季过后');
        assert.equal(pledge.timelineVersions[1].note, '盛夏灯塔维修施工封闭');

        // 最终顺利兑现
        pledge = UnfinishedPledgeTheater.advancePledge(
            pledge,
            UnfinishedPledgeTheater.PLEDGE_ACTION.FULFILL,
            { summary: '秋风初起之日，两人重逢于灯塔下' }
        );
        assert.equal(pledge.status, UnfinishedPledgeTheater.PLEDGE_STATUS.FULFILLED);
        assert.ok(pledge.resolvedAt);
    });

    await t.test('约定释怀或违约明确留存结果', () => {
        let p1 = UnfinishedPledgeTheater.createPledge({
            title: '归还借走的书信'
        });
        p1 = UnfinishedPledgeTheater.advancePledge(p1, UnfinishedPledgeTheater.PLEDGE_ACTION.WAIVE, {
            summary: '双方释怀，无需再特意归还'
        });
        assert.equal(p1.status, UnfinishedPledgeTheater.PLEDGE_STATUS.WAIVED);

        let p2 = UnfinishedPledgeTheater.createPledge({
            title: '赴宴之约'
        });
        p2 = UnfinishedPledgeTheater.advancePledge(p2, UnfinishedPledgeTheater.PLEDGE_ACTION.BREACH, {
            summary: '终究失约未来'
        });
        assert.equal(p2.status, UnfinishedPledgeTheater.PLEDGE_STATUS.BREACHED);
    });
});