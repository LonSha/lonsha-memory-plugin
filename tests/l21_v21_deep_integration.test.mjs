import test from 'node:test';
import assert from 'node:assert/strict';

import SymphonyPkg from '../memory-symphony-orchestrator.js';
const { orchestrateMemorySymphony } = SymphonyPkg;
import DL from '../engine-diagnostic-lines.js';
const { _v21EpicDiagnosticsLine } = DL;

test('E2E-L1: 玩家端全景诊断行体验测试（语言通俗易懂，无生僻词，状态平稳）', () => {
    const mockEngine = {
        _worldaxisAssimilatorState: { ingestedSnapshots: 3 },
        _ruminationDreamState: { totalDreamsWoven: 2 },
        _exposureRiskState: { covertIdentities: new Map([['Alice', { publicRole: '医生' }]]) },
        _burnoutDecayState: { actorResilience: new Map([['Alice', { resilience: 0.9, exhaustion: 0.1 }]]) }
    };
    const line = _v21EpicDiagnosticsLine(mockEngine);
    assert.match(line, /【深层心智状态】/);
    assert.match(line, /外界感知3次/);
    assert.match(line, /夜晚梦境2场/);
    assert.match(line, /身份掩护1人/);
    assert.match(line, /心理状态1人平稳/);
    // 确保没有生僻生硬词
    assert.doesNotMatch(line, /主观折射/);
    assert.doesNotMatch(line, /反刍隐喻/);
    assert.doesNotMatch(line, /遥测/);
});

test('E2E-L2: 阶段 3.10 心智扩展引擎端到端注入生成管线测试', () => {
    const mockEngine = {
        _worldaxisAssimilatorState: { latestRefraction: '窗外正下着小雨，气氛微冷。' },
        _ruminationDreamState: { latestDream: { dreamContent: '走在无人的街道' } },
        _somaticFlareState: { latestReflex: { physicalReaction: '手指微紧' } },
        _exposureRiskState: {
            covertIdentities: new Map([
                ['Eve', { publicRole: '研究员', suspicionLevel: 0.6 }]
            ])
        },
        _burnoutDecayState: {
            actorResilience: new Map([
                ['Eve', { resilience: 0.5, exhaustion: 0.5 }]
            ])
        }
    };

    const result = orchestrateMemorySymphony(
        mockEngine,
        [{ id: 'm1', content: '测试记忆' }],
        { speaker: 'Eve', text: '你好' }
    );

    assert.ok(result.directives, '生成指令必须非空');
    assert.match(result.directives, /\[场景氛围感知\] 窗外正下着小雨/);
    assert.match(result.directives, /\[昨夜梦境心境\] Eve昨夜梦见了/);
    assert.match(result.directives, /\[肢体自然反应\] 身体下意识表现：手指微紧/);
    assert.match(result.directives, /\[身份防线提示\] 对话中注意维护表层身份\(研究员\)/);
    assert.match(result.directives, /\[当前精力状态\] 角色近期稍感疲惫/);
});
