// tests/v3372_seventh_cycle_batch_c.test.mjs — [LonSha记忆插件 · 第七期批次 C]
// M7-O7 记忆维护会话、M7-O8 记忆成果可读视图
import test from 'node:test';
import assert from 'node:assert/strict';

import sessionLib from '../memory-maintenance-session.js';
import dossierLib from '../profile-dossier-view.js';

test('LonSha · 第七期批次 C · M7-O7 记忆维护会话', async (t) => {
    await t.test('自检零异常', () => {
        const check = sessionLib.memoryMaintenanceSessionSelfCheck();
        assert.deepEqual(check.problems, [], 'memoryMaintenanceSessionSelfCheck 必须零问题');
    });

    await t.test('跨事实、承诺、研究三类整理、延期决绝不计入已解决、错误合并可撤销拆分', () => {
        const rawCandidates = [
            { id: 'f_conflict', title: '周姐身世矛盾：京城逃难 vs 南洋客商', kind: 'fact_conflict', impactScope: 9, recentUseCount: 7 },
            { id: 'p_expired', title: '逾期未兑现承诺：下月初五陪同挑货', kind: 'expired_proposal', impactScope: 6, recentUseCount: 4 },
            { id: 'r_unresolved', title: '悬空研究：宗门古阵法残片线索', kind: 'unresolved_research', impactScope: 4, recentUseCount: 2 },
            { id: 'f_minor', title: '小配角茶摊掌柜姓王还是姓李', kind: 'fact_conflict', impactScope: 2, recentUseCount: 1 }
        ];

        // 1. 创建有限会话（单批截取 3 项）
        let session = sessionLib.createMaintenanceSession(rawCandidates, { batchSize: 3 });
        assert.equal(session.activeQueue.length, 3);
        assert.equal(session.remainingCount, 1);
        assert.equal(session.activeQueue[0].id, 'f_conflict', '权重最高项优先入列');

        // 2. 解决事实冲突
        session = sessionLib.resolveItem(session, 'f_conflict', '确认当事人为南洋客商，京城逃难为化名假消息');
        const resolved = session.activeQueue.find(x => x.id === 'f_conflict');
        assert.equal(resolved.status, 'resolved');
        assert.ok(resolved.resolutionNote.includes('南洋客商'));

        // 3. 延期逾期承诺（延期 5 天）
        session = sessionLib.deferItem(session, 'p_expired', 5, '主角正在闭关修炼，出关后再履行挑货约定');
        const deferred = session.activeQueue.find(x => x.id === 'p_expired');
        assert.equal(deferred.status, 'deferred');
        assert.notEqual(deferred.status, 'resolved', '延期绝不能算作已解决');
        assert.ok(deferred.nextReviewAt > Date.now());

        // 4. 尝试合并与错误撤回拆分
        session = sessionLib.mergeItems(session, 'p_expired', 'r_unresolved', '商道挑货与阵法调研合流');
        const mergedItem = session.activeQueue.find(x => x.id.startsWith('merged_'));
        assert.ok(mergedItem, '合并项应存在');
        assert.equal(mergedItem.sources.length, 0);

        // 撤销拆分
        session = sessionLib.unmergeItem(session, mergedItem.id);
        assert.ok(!session.activeQueue.some(x => x.id === mergedItem.id), '拆分后合并项被移除');
        assert.ok(session.activeQueue.some(x => x.id === 'r_unresolved'), '原始条目成功复原');

        // 5. 产出可撤销摘要
        const summary = sessionLib.generateRevertableSummary(session);
        assert.equal(summary.resolvedCount, 1);
        assert.equal(summary.deferredCount, 1);
        assert.ok(summary.totalPatches >= 3);
    });
});

test('LonSha · 第七期批次 C · M7-O8 记忆成果可读视图', async (t) => {
    await t.test('自检零异常', () => {
        const check = dossierLib.profileDossierViewSelfCheck();
        assert.deepEqual(check.problems, [], 'profileDossierViewSelfCheck 必须零问题');
    });

    await t.test('百楼档案区分亲历/传闻/未证、来源删除即时标注broken、档案直接纠错联动', () => {
        const character = {
            characterId: 'lin_zhou',
            name: '林舟',
            personaBio: '隐于闹市的落魄散修'
        };

        const rawExperiences = [
            { id: 'exp_1', summary: '在第3楼与周姐合伙租下街角铺面', nature: 'direct_experience', floor: 3 },
            { id: 'exp_2', summary: '在第18楼听闻黑风寨大当家闭关突破金丹', nature: 'hearsay_claim', floor: 18 },
            { id: 'exp_3', summary: '在第45楼推测周姐可能掌握开启暗格的阵盘', nature: 'unproven_guess', floor: 45 },
            { id: 'exp_4', summary: '在第60楼在城北击杀追杀刺客', nature: 'direct_experience', floor: 60 }
        ];

        const rawThreads = [
            { id: 'th_1', title: '待修复祖传玄铁断剑', dueFloor: 80, isFulfilled: false }
        ];

        // 假定第 60 楼已被回滚删除
        const validFloors = new Set([3, 18, 45]);
        let view = dossierLib.buildProfileDossierView(character, rawExperiences, rawThreads, { validFloors });

        // 1. 结构与分形断言
        assert.equal(view.characterName, '林舟');
        assert.equal(view.stats.totalExperiences, 4);
        assert.equal(view.stats.directCount, 2);
        assert.equal(view.stats.hearsayCount, 1);
        assert.equal(view.stats.unprovenCount, 1);

        // 2. 来源断开标注
        assert.equal(view.stats.brokenSourceCount, 1);
        const brokenNode = view.timeline.find(x => x.floor === 60);
        assert.equal(brokenNode.sourceHealth, 'broken', '删除楼层的经历应标注 broken 且保留');

        // 3. 档案直接纠错
        view = dossierLib.correctDossierExperience(view, 'exp_2', '黑风寨大当家走火入魔暴毙，非闭关突破');
        const correctedNode = view.timeline.find(x => x.id === 'exp_2');
        assert.equal(correctedNode.corrected, true);
        assert.ok(correctedNode.correctionNote.includes('暴毙'));
        assert.equal(view.lastCorrectionPatch.action, 'dossier_correction');
    });
});