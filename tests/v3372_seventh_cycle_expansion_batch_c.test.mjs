// tests/v3372_seventh_cycle_expansion_batch_c.test.mjs — [LonSha记忆插件 · 第七期拓展批次 C]
import test from 'node:test';
import assert from 'node:assert/strict';

import LineageHeritageTree from '../lineage-heritage-tree.js';
import CollectiveMemoryDeliberation from '../collective-memory-deliberation.js';

test('LonSha · 第七期拓展批次 C · M7-X2 家族与社群传承谱系', async (t) => {
    await t.test('自检零异常', () => {
        const res = LineageHeritageTree.lineageHeritageTreeSelfCheck();
        assert.deepEqual(res.problems, []);
    });

    await t.test('三代传承演进（始祖、创新改良、拒斥陈规）且源版本恒定', () => {
        // 1. 始祖版本
        const gen1 = LineageHeritageTree.createRootHeritage({
            heritageId: 'hrt_ceramic_gen1',
            title: '青釉柴烧烧造技艺',
            originatorId: 'master_1',
            originatorName: '初代陶师',
            instructions: '以松木柴烧七昼夜'
        });

        // 2. 第二代：创新
        const gen2 = LineageHeritageTree.passHeritageDown(
            gen1,
            { characterId: 'master_2', name: '二代传人' },
            LineageHeritageTree.HERITAGE_STATUS.INNOVATED,
            {
                innovationNotes: '改良窑温梯级升温曲线',
                newInstructions: '气柴混烧五昼夜'
            }
        );
        assert.equal(gen2.generation, 2);
        assert.equal(gen2.status, LineageHeritageTree.HERITAGE_STATUS.INNOVATED);

        // 3. 第三代：拒斥
        const gen3 = LineageHeritageTree.passHeritageDown(
            gen2,
            { characterId: 'apprentice_3', name: '三代子弟' },
            LineageHeritageTree.HERITAGE_STATUS.REJECTED,
            { rejectionReason: '转型现代电窑工艺' }
        );
        assert.equal(gen3.generation, 3);
        assert.equal(gen3.status, LineageHeritageTree.HERITAGE_STATUS.REJECTED);

        // 始祖版本毫发无损
        assert.equal(gen1.instructions, '以松木柴烧七昼夜');

        // 下游派生分支变更广播
        const notices = LineageHeritageTree.detectDerivationUpdates([gen1, gen2, gen3], gen1.heritageId);
        assert.equal(notices.length, 1);
        assert.equal(notices[0].childHeritageId, gen2.heritageId);
    });
});

test('LonSha · 第七期拓展批次 C · M7-X8 集体记忆协商', async (t) => {
    await t.test('自检零异常', () => {
        const res = CollectiveMemoryDeliberation.collectiveMemoryDeliberationSelfCheck();
        assert.deepEqual(res.problems, []);
    });

    await t.test('共识公开叙述保留少数派异议与新证据平滑重开', () => {
        let topic = CollectiveMemoryDeliberation.createDeliberationTopic({
            topicId: 'delib_expedition',
            title: '老林搜救走失向导行动复盘'
        });

        // 多数派
        topic = CollectiveMemoryDeliberation.submitDeliberationStatement(topic, {
            memberId: 'm1',
            memberName: '队长',
            content: '大雾封山是导致迷路的主要原因',
            tier: CollectiveMemoryDeliberation.CONSENSUS_TIER.CONSENSUS
        });

        // 少数派独立异议
        topic = CollectiveMemoryDeliberation.submitDeliberationStatement(topic, {
            memberId: 'm2',
            memberName: '副队长',
            content: '是指南针受磁矿干扰失效且没有核对地图',
            tier: CollectiveMemoryDeliberation.CONSENSUS_TIER.DISSENTING,
            evidenceRefs: ['磁矿调查报告']
        });

        // 结案
        topic = CollectiveMemoryDeliberation.concludeDeliberation(topic, '总结为极端天气与地质干扰叠加所致');
        assert.equal(topic.status, CollectiveMemoryDeliberation.DELIBERATION_STATUS.CONCLUDED);

        // 提取知识包
        const pack = CollectiveMemoryDeliberation.extractDeliberationKnowledge(topic);
        assert.equal(pack.hasActiveDissent, true);
        assert.equal(pack.dissentingRecords[0].authorName, '副队长');
        assert.ok(pack.dissentingRecords[0].evidenceRefs.includes('磁矿调查报告'));

        // 新证据重开
        topic = CollectiveMemoryDeliberation.reopenDeliberationWithNewEvidence(topic, {
            summary: '找回了向导遗落的指北针实物',
            submittedBy: '林业巡护员'
        });
        assert.equal(topic.status, CollectiveMemoryDeliberation.DELIBERATION_STATUS.REOPENED);
        assert.equal(topic.reopenHistory.length, 1);
    });
});