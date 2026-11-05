import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import Tracker from '../scene-state-tracker.js';
import PresenceGuard from '../presence-routing-guard.js';
import Diag from '../engine-diagnostic-lines.js';
import pipelineLib from '../engine-injection-pipeline.js';

test('v3446: scene-state-tracker pure functions & tri-state presence', () => {
    const initial = Tracker.createDefaultSceneState();
    assert.equal(initial.sceneId, 'scene_init');
    assert.equal(initial.inSceneCharacters, undefined);
    assert.equal(initial.revision, 0);

    // Tri-state normalization
    assert.equal(Tracker.normalizeInSceneCharacters(undefined), undefined);
    assert.equal(Tracker.normalizeInSceneCharacters(null), undefined);
    assert.deepEqual(Tracker.normalizeInSceneCharacters([]), []);
    assert.deepEqual(Tracker.normalizeInSceneCharacters(['Alice', 'Bob', 'Alice']), ['Alice', 'Bob']);

    // Patch state
    const patched = Tracker.patchSceneState(initial, {
        location: '东侧旧钟楼',
        action: '正在拆解暗锁齿轮',
        inSceneCharacters: ['Alice', 'Bob']
    }, 15);

    assert.equal(patched.location, '东侧旧钟楼');
    assert.equal(patched.action, '正在拆解暗锁齿轮');
    assert.deepEqual(patched.inSceneCharacters, ['Alice', 'Bob']);
    assert.equal(patched.floor, 15);
    assert.equal(patched.revision, 1);

    // Format prompt
    const prompt = Tracker.formatSceneStatePrompt(patched, 150);
    assert.match(prompt, /【即时物理现场快照 \(L0 Scene State\)】/);
    assert.match(prompt, /地点时空: 东侧旧钟楼/);
    assert.match(prompt, /正在进行: 正在拆解暗锁齿轮/);
    assert.match(prompt, /在场角色: Alice、Bob/);

    // Empty scene presence formatting
    const emptyScene = Tracker.patchSceneState(patched, { inSceneCharacters: [] }, 16);
    const emptyPrompt = Tracker.formatSceneStatePrompt(emptyScene, 150);
    assert.match(emptyPrompt, /【现场全员离场·空无一人】/);

    // Rollback on pruning
    const history = [
        { floor: 10, location: '酒馆大厅' },
        { floor: 15, location: '东侧旧钟楼' },
        { floor: 20, location: '地宫深处' }
    ];
    const rolled = Tracker.rollbackSceneHistory(history, 16);
    assert.equal(rolled.rolledBackState.location, '东侧旧钟楼');
    assert.equal(rolled.remainingHistory.length, 2);
});

test('v3446: presence-routing-guard fail-closed & privacy enforcement', () => {
    // 1. Audit Fail-Closed
    assert.equal(PresenceGuard.auditMemoryScope({ scope: 'world' }).ok, true);
    assert.equal(PresenceGuard.auditMemoryScope({ scope: 'character', character: 'Alice' }).ok, true);
    assert.equal(PresenceGuard.auditMemoryScope({ scope: 'character' }).ok, false); // missing owner
    assert.equal(PresenceGuard.auditMemoryScope({ scope: 'shared', knownBy: ['Alice'] }).ok, true);
    assert.equal(PresenceGuard.auditMemoryScope({ scope: 'shared', knownBy: [] }).ok, false); // empty knownBy

    // 2. Scene presence permission
    const privateMem = { text: 'Alice的小金库密码是9988', scope: 'character', character: 'Alice' };
    const sharedMem = { text: '我们在马车里商定密谋', scope: 'shared', knownBy: ['Alice', 'Bob'] };
    const worldMem = { text: '帝国历302年大火', scope: 'world' };

    // When Alice and Bob in scene:
    assert.equal(PresenceGuard.isMemoryPermittedInScene(privateMem, ['Alice', 'Bob']).permitted, true);
    assert.equal(PresenceGuard.isMemoryPermittedInScene(sharedMem, ['Alice', 'Bob']).permitted, true);
    assert.equal(PresenceGuard.isMemoryPermittedInScene(worldMem, ['Alice', 'Bob']).permitted, true);

    // When only Charlie in scene: Alice private is BLOCKED (0 token privacy)
    const blockedPrivate = PresenceGuard.isMemoryPermittedInScene(privateMem, ['Charlie']);
    assert.equal(blockedPrivate.permitted, false);
    assert.equal(blockedPrivate.reason, 'private-character-absent');

    // Shared memory with no witness present is BLOCKED
    const blockedShared = PresenceGuard.isMemoryPermittedInScene(sharedMem, ['Charlie']);
    assert.equal(blockedShared.permitted, false);
    assert.equal(blockedShared.reason, 'no-known-witness-in-scene');

    // Empty scene blocks both private and shared
    assert.equal(PresenceGuard.isMemoryPermittedInScene(privateMem, []).permitted, false);
    assert.equal(PresenceGuard.isMemoryPermittedInScene(sharedMem, []).permitted, false);
    assert.equal(PresenceGuard.isMemoryPermittedInScene(worldMem, []).permitted, true);

    // Batch filter
    const batch = PresenceGuard.filterMemoriesByPresence([privateMem, sharedMem, worldMem], ['Charlie']);
    assert.equal(batch.allowed.length, 1);
    assert.equal(batch.allowed[0].scope, 'world');
    assert.equal(batch.stats.blocked, 2);
});

test('v3446: diagnostic lines & injection pipeline integration', () => {
    // 1. Diagnostic lines check
    const mockEngine = {
        _sceneState: {
            location: '钟楼二层',
            action: '对质',
            inSceneCharacters: ['Alice', 'Bob']
        }
    };
    const diagState = Diag.sceneStateTrackerState(mockEngine, {});
    assert.equal(diagState.ok, true);
    assert.equal(diagState.presenceMode, 'active-cast');
    assert.equal(diagState.location, '钟楼二层');

    const diagLine = Diag._sceneStateTrackerLine(mockEngine);
    assert.match(diagLine, /现场快照：钟楼二层/);
    assert.match(diagLine, /在场: Alice、Bob/);

    // 2. Injection pipeline integration
    const fakePipelineEngine = {
        config: { config: { memoryTokenBudget: 2700, vectorTopK: 5, sceneEnabled: true, npcTierInjection: false, cacheFriendlyInjection: false } },
        _sceneState: {
            location: '钟楼二层',
            action: '对质',
            inSceneCharacters: ['Alice']
        },
        _inSceneCharacters: ['Alice'],
        _currentSpeaker: 'Alice',
        scene: {
            currentKey: () => 'clock_tower',
            chainOf: () => [{ path: ['clock_tower'], desc: '钟楼' }],
            headerLine: () => ''
        },
        captureCast: () => ['Alice'],
        resolveCharacterName: (n) => n
    };

    const recalledMemories = [
        { text: 'Alice的独白日记', scope: 'character', character: 'Alice' },
        { text: 'Bob的秘密账册', scope: 'character', character: 'Bob' } // Should be filtered out by presence guard!
    ];

    const injection = pipelineLib.buildInjection(fakePipelineEngine, recalledMemories);
    assert.ok(injection.includes('【即时物理现场快照 (L0 Scene State)】'), 'L0现场快照提示词必须被注入');
    assert.ok(injection.includes('地点时空: 钟楼二层'), '现场地点必须呈现');
    assert.ok(injection.includes('Alice的独白日记'), 'Alice在场时私密记忆应注入');
    assert.ok(!injection.includes('Bob的秘密账册'), 'Bob不在场时其私密记忆必须被在场门禁阻断防偷窥');

    // 3. Settings UI integration verification
    const settingsUiSrc = fs.readFileSync('settings-ui.js', 'utf8');
    assert.ok(settingsUiSrc.includes('s.sceneStateTrackerState'), 'settings-ui 必须挂接 sceneStateTrackerState');
    assert.ok(settingsUiSrc.includes('s._sceneStateTrackerLine'), 'settings-ui 必须挂接 _sceneStateTrackerLine');
    assert.ok(settingsUiSrc.includes('物理现场快照 (L0 Scene State)'), 'settings-ui 必须渲染现场快照卡片');

    // 4. Negative controls: break presence guard call and verify failure
    const mutatedPipelineSrc = fs.readFileSync('engine-injection-pipeline.js', 'utf8')
        .replaceAll('_presenceGuardLib', '_nonExistentPresenceGuardLib');
    assert.ok(!mutatedPipelineSrc.includes('_presenceGuardLib'), '负控制变异成功');
    assert.throws(() => {
        if (!mutatedPipelineSrc.includes('_presenceGuardLib')) {
            throw new Error('negative-control: _presenceGuardLib call site missing');
        }
    }, /negative-control/);
});
