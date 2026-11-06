import test from 'node:test';
import assert from 'node:assert/strict';

import TemporalValidity from '../temporal-validity-workflow.js';
import AutobiographicalLens from '../autobiographical-lens-narrative.js';
import DiagnosticLines from '../engine-diagnostic-lines.js';

test('L15-Batch-E: 事实有效期日历时间与因果双锚定 (L15-O5)', () => {
    const activeFact = {
        id: 'fact-cal-1',
        content: '艾琳在皇家学院的借阅证有效',
        validUntilCalendarDate: '2026-11-05',
        validUntilFloor: 100
    };

    // 1. 正常有效：当前剧情在有效日前且未达到截至楼层
    const validCheck = TemporalValidity.evaluateCalendarDualTemporalValidity(activeFact, {
        calendarDate: '2026-11-01',
        storyFloor: 50
    });
    assert.equal(validCheck.isValid, true);
    assert.equal(validCheck.status, 'current_valid');

    // 2. 超期失效：当前剧情日历超过事实失效日
    const dateExpiredCheck = TemporalValidity.evaluateCalendarDualTemporalValidity(activeFact, {
        calendarDate: '2026-11-06',
        storyFloor: 50
    });
    assert.equal(dateExpiredCheck.isValid, false);
    assert.equal(dateExpiredCheck.status, 'historical');
    assert.match(dateExpiredCheck.reason, /日历时间过期/);

    // 3. 楼层超期失效
    const floorExpiredCheck = TemporalValidity.evaluateCalendarDualTemporalValidity(activeFact, {
        calendarDate: '2026-11-02',
        storyFloor: 120
    });
    assert.equal(floorExpiredCheck.isValid, false);
    assert.equal(floorExpiredCheck.status, 'historical');
    assert.match(floorExpiredCheck.reason, /剧情楼层过期/);

    // 4. selectFacts 宿主全链路过滤接线断言
    const selResult = TemporalValidity.selectFacts([activeFact], {
        storyContext: { calendarDate: '2026-11-08', storyFloor: 20 }
    });
    assert.equal(selResult.selected.length, 0);
    assert.equal(selResult.excluded.length, 1);
    assert.match(selResult.excluded[0].reason, /日历时间过期/);

    // 5. 破坏性负控制：被撤销的事实无论时钟如何均不可用
    const mutated = { ...activeFact, isCancelled: true };
    const cancelCheck = TemporalValidity.evaluateCalendarDualTemporalValidity(mutated, {
        calendarDate: '2026-11-01',
        storyFloor: 10
    });
    assert.equal(cancelCheck.isValid, false);
    assert.equal(cancelCheck.status, 'cancelled');
});

test('L15-Batch-E: 角色自传心路重述沙盘 (L15-X2)', () => {
    const objectiveFact = {
        id: 'fact-betrayal-1',
        content: '卡恩在北境隘口撤退，导致侧翼被帝国骑士突破'
    };

    const restated = AutobiographicalLens.recordAutobiographicalRestatement(objectiveFact, {
        narrator: '卡恩',
        restatedText: '我在北境隘口保存了最后的有生力量，所谓的突破只是皇室推卸惨败的借口',
        emotionalBias: 'cynical',
        stanceReason: '背叛指控下的心理自卫'
    });

    assert.equal(restated.factId, 'fact-betrayal-1');
    assert.equal(restated.narrator, '卡恩');
    assert.match(restated.injectedMemoryText, /出于cynical心境/);
    assert.match(restated.injectedMemoryText, /卡恩的心路自传重述/);

    // 宿主诊断行接线验证
    const mockEngine = {
        _activeRestatements: [restated]
    };
    const lineOutput = DiagnosticLines._autobiographicalRestatementLine(mockEngine);
    assert.match(lineOutput, /活跃重述 1 条/);
    assert.match(lineOutput, /首述角色: 卡恩/);

    // 破坏性负控制：空参数断言必抛出异常
    assert.throws(() => {
        AutobiographicalLens.recordAutobiographicalRestatement(null, {});
    }, /requires valid fact/);
});