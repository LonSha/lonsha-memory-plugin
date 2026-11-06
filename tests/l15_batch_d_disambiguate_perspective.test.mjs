import test from 'node:test';
import assert from 'node:assert/strict';

import DynamicRecallHub from '../dynamic-recall-route-feedback-hub.js';
import OralHistoryArchive from '../oral-history-archive.js';
import DiagnosticLines from '../engine-diagnostic-lines.js';

test('L15-O2: 检索消歧的人际图谱动态加权', () => {
    const candidates = [
        { id: 'c1', character: '爱丽丝', relevanceScore: 0.5, moduleName: 'main' },
        { id: 'c2', character: '鲍勃', relevanceScore: 0.5, moduleName: 'main' },
        { id: 'c3', character: '查理', relevanceScore: 0.5, moduleName: 'main' }
    ];

    const graphEdges = [
        { source: '主角', target: '爱丽丝', weight: 3.0 },
        { source: '主角', target: '鲍勃', weight: 0.5 }
    ];

    const disambiguated = DynamicRecallHub.disambiguateEntities(candidates.map(c => ({ ...c })), {
        currentSpeaker: '主角',
        graphEdges: graphEdges
    });

    assert.equal(disambiguated.length, 3);
    const alice = disambiguated.find(c => c.id === 'c1');
    const bob = disambiguated.find(c => c.id === 'c2');
    const charlie = disambiguated.find(c => c.id === 'c3');

    assert.ok(alice.graphAffinityBoost > 1.0, '与主角亲密的爱丽丝应当获得加权');
    assert.ok(alice.relevanceScore > bob.relevanceScore, '爱丽丝分数应当高于低亲密的鲍勃');
    assert.equal(charlie.graphAffinityBoost, undefined, '无关人员不应有加权');

    // 负控制：篡改 speaker 使关系无法匹配，加权应当不生效
    const mutated = DynamicRecallHub.disambiguateEntities(candidates.map(c => ({ ...c })), {
        currentSpeaker: '陌生人X',
        graphEdges: graphEdges
    });
    const mutatedAlice = mutated.find(c => c.id === 'c1');
    assert.equal(mutatedAlice.graphAffinityBoost, undefined, '无关系网的角色不应获得亲密加权');
});

test('L15-X3: 视角冲突记忆并列对照与严禁折中调和', () => {
    let evt = OralHistoryArchive.createOralHistoryEvent({
        id: 'evt_sword_dispute',
        title: '断钢圣剑失窃疑云'
    });

    evt = OralHistoryArchive.recordPerspective(evt, {
        witnessId: 'knight_a',
        witnessName: '高文',
        narrative: '我亲眼看到兰斯洛特在午夜带走了圣剑，他是叛徒！',
        visibility: 'public'
    });

    evt = OralHistoryArchive.recordPerspective(evt, {
        witnessId: 'knight_b',
        witnessName: '兰斯洛特',
        narrative: '圣剑被魔物侵蚀，我是为了净化它才冒险移出圣堂。',
        visibility: 'public'
    });

    const discrepancy = OralHistoryArchive.formatPerspectiveDiscrepancyPrompt(evt);
    assert.equal(discrepancy.hasConflict, true);
    assert.equal(discrepancy.perspectiveCount, 2);
    assert.ok(discrepancy.promptBlock.includes('【多视角针锋相对并列记忆 · 严禁折中调和】'));
    assert.ok(discrepancy.promptBlock.includes('高文'));
    assert.ok(discrepancy.promptBlock.includes('兰斯洛特'));

    // 诊断行验证
    const mockEngine = {
        _activeOralDiscrepancy: discrepancy
    };
    const line = DiagnosticLines._perspectiveDiscrepancyLine(mockEngine);
    assert.ok(line.includes('活跃争议《断钢圣剑失窃疑云》'), `诊断行不符: ${line}`);

    // 负控制验证：撤回一方陈述后，冲突不再满足并列对抗条件
    const mutatedEvt = OralHistoryArchive.retractPerspectivePublicity(evt, 'knight_b', '涉密封存');
    const mutatedDiscrepancy = OralHistoryArchive.formatPerspectiveDiscrepancyPrompt(mutatedEvt);
    assert.equal(mutatedDiscrepancy.hasConflict, false, '只剩单一可见视角时不应判定为争议对抗');
});
