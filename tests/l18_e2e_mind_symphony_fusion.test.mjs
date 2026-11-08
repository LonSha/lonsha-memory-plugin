import test from 'node:test';
import assert from 'node:assert/strict';

// 引入 LonSha 核心交响编排器与关键引擎
import LonShaMemorySymphony from '../memory-symphony-orchestrator.js';
import TemporalFlashbulbDilationEngine from '../temporal-flashbulb-dilation-engine.js';
import DissociativePersonaMaskMatrix from '../dissociative-persona-mask-matrix.js';
import ConfabulationMandelaReconstructEngine from '../confabulation-mandela-reconstruct-engine.js';
import ProustianSynesthesiaRecallEngine from '../proustian-synesthesia-recall-engine.js';
import ZeigarnikUnresolvedGestaltLoop from '../zeigarnik-unresolved-gestalt-loop.js';
import CognitiveScatomaDenialGuard from '../cognitive-scatoma-denial-guard.js';

test('E2E 跨系统双向融会贯通: 手机物理体征反哺与主观认知失真交响编排', async () => {
    // 1. 初始化 LonSha 模拟引擎上下文
    const mockEngine = {
        config: { config: { memorySymphonyEnabled: true } },
        flashbulbDilationEngine: new TemporalFlashbulbDilationEngine(),
        dissociativeMaskMatrix: new DissociativePersonaMaskMatrix(),
        mandelaConfabulationEngine: new ConfabulationMandelaReconstructEngine(),
        proustianSynesthesiaEngine: new ProustianSynesthesiaRecallEngine(),
        zeigarnikLoopEngine: new ZeigarnikUnresolvedGestaltLoop(),
        cognitiveScatomaGuard: new CognitiveScatomaDenialGuard(),
        _symphonyState: LonShaMemorySymphony.createState()
    };

    // 2. 模拟真实心智状态注入：
    // - 角色拥有创伤事件（触发闪光灯定格）
    mockEngine.flashbulbDilationEngine.evaluateAndDilate({
        id: 'ev_trauma_gunshot',
        arousal: 0.95,
        summary: '暴雨中的枪响与玻璃碎裂声',
        sensorySnapshot: { visual: '刺目的白光与飞溅的雨滴', auditory: '耳鸣与尖叫' }
    });

    // - 角色登记了面具身份（伪装成咖啡师）
    mockEngine.dissociativeMaskMatrix.registerPersona('barista_mask', {
        type: 'mask',
        name: '温和咖啡师'
    });
    mockEngine.dissociativeMaskMatrix.switchPersona('barista_mask');

    // - 普鲁斯特通感触媒（咖啡苦味/旧雨衣气味）
    mockEngine.proustianSynesthesiaEngine.registerSensoryMemoryAnchor('rain_smell', {
        modality: 'olfactory',
        stimulusKeys: ['雨水'],
        sensation: '潮湿冷冽的铁锈气味',
        evokedMemory: '十年前那场在孤儿院门口的大雨'
    });

    // - 蔡格尼克未竟事件（未寄出的信）
    mockEngine.zeigarnikLoopEngine.openInterruptedLoop('unsent_letter', {
        title: '未能当面交给她的道歉信',
        interruptedFloor: 12
    });

    // 3. 执行交响总线编排（输入包含触媒词“雨水”）
    const query = { text: '窗外的雨水拍打着窗户，我们坐下来喝杯热饮吧。' };
    const candidates = [
        { id: 'mem_1', content: '我们曾经一起去过中央公园', score: 0.8 }
    ];

    const result = LonShaMemorySymphony.orchestrateMemorySymphony(mockEngine, candidates, query, {
        currentSpeaker: '玩家',
        floor: 15
    });

    assert.ok(result);
    assert.ok(result.directives, '交响编排产物不得为空');

    // 4. 验证主观心智失真要素全部无缝融会贯通在提示词中
    assert.ok(result.directives.includes('闪光灯定格·时间膨胀'), '闪光灯主观膨胀定格指令必须成功注入');
    assert.ok(result.directives.includes('伪装面具状态'), '解离面具状态必须成功注入');
    assert.ok(result.directives.includes('普鲁斯特感官通感突触唤醒'), '普鲁斯特感官通感触媒必须成功触发');
    assert.ok(result.directives.includes('蔡格尼克效应·潜意识未决执念反刍'), '未竟执念反刍指令必须成功注入');

    // 5. 验证防全知终审审计与预算约束正常保驾护航
    assert.ok(!result.directives.includes('【全知视角】'), '认识论审计必须抹除全知穿帮文本');
    assert.ok(result.directives.length <= 1500, '提示词预算竞价必须确保输出紧凑可控');

    console.log('✓ 双核交响编排端到端连通验证通过，输出指令长度:', result.directives.length);
});
