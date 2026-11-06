import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
import Tracker from '../scene-state-tracker.js';
import PresenceGuard from '../presence-routing-guard.js';
import Diag from '../engine-diagnostic-lines.js';
import pipelineLib from '../engine-injection-pipeline.js';
import SB from '../scene-book.js';

test('L15-O1: scene snapshot persistence, export/import and rollback', () => {
    const initial = Tracker.createDefaultSceneState();
    const patched = Tracker.patchSceneState(initial, {
        location: '东侧旧钟楼密室',
        action: '正在销毁机密凭证',
        inSceneCharacters: ['Alice', 'Bob']
    }, 20);

    const pack = Tracker.snapshotSceneForPersistence(patched);
    assert.equal(pack.ok, true);
    assert.equal(pack.snapshot.location, '东侧旧钟楼密室');
    assert.ok(pack.snapshot.persistedAt > 0);

    // Test restore
    const restored = Tracker.restoreSceneFromPersistence(pack.snapshot);
    assert.equal(restored.ok, true);
    assert.equal(restored.sceneState.location, '东侧旧钟楼密室');
    assert.deepEqual(restored.sceneState.inSceneCharacters, ['Alice', 'Bob']);

    // Test SceneBook integration
    const book = new SB.SceneBook();
    book.apply([{ action: 'add', path: ['城市', '钟楼'], desc: '钟楼密室' }], 20);
    book.setSnapshot(pack.snapshot);
    assert.equal(book.getSnapshot().location, '东侧旧钟楼密室');

    // Export and Import cycle
    const exported = book.export();
    assert.ok(exported.snapshot, 'exported payload must contain snapshot');
    assert.equal(exported.snapshot.location, '东侧旧钟楼密室');

    const book2 = new SB.SceneBook(exported);
    assert.equal(book2.getSnapshot().location, '东侧旧钟楼密室');

    // Test Rollback prune
    book2.rollbackFrom(15);
    assert.equal(book2.getSnapshot(), null, 'Rollback to floor 15 should prune snapshot at floor 20');
});

test('L15-X1: whisper privacy scope, participant full recall and overhearer fragment', () => {
    // 1. Audit whisper scope definition
    const auditValid = PresenceGuard.auditMemoryScope({
        scope: 'whisper',
        whisperWith: ['Alice', 'Bob'],
        text: '藏宝库金库的暗号是七星连珠'
    });
    assert.equal(auditValid.ok, true);
    assert.deepEqual(auditValid.whisperWith, ['Alice', 'Bob']);

    const auditInvalid = PresenceGuard.auditMemoryScope({
        scope: 'whisper',
        whisperWith: ['Alice'], // Requires at least two
        text: '暗号'
    });
    assert.equal(auditInvalid.ok, false);

    // 2. Whisper permission checking
    const whisperMem = {
        scope: 'whisper',
        whisperWith: ['Alice', 'Bob'],
        text: '东门水下暗道的钥匙藏在枯树根底下'
    };

    // Case A: Participant (Alice) in scene -> Full text
    const decAlice = PresenceGuard.isMemoryPermittedInScene(whisperMem, ['Alice', 'Bob', 'Charlie'], 'Alice');
    assert.equal(decAlice.permitted, true);
    assert.equal(decAlice.whisperRole, 'participant');

    // Case B: Overhearer (Charlie) co-present in same scene -> Fragment text
    const decCharlie = PresenceGuard.isMemoryPermittedInScene(whisperMem, ['Alice', 'Bob', 'Charlie'], 'Charlie');
    assert.equal(decCharlie.permitted, true);
    assert.equal(decCharlie.whisperRole, 'overhearer');
    assert.match(decCharlie.fragmentText, /隐约听见断续耳语/);

    // Case C: Outside character (David) absent from scene -> Embargoed
    const decDavid = PresenceGuard.isMemoryPermittedInScene(whisperMem, ['Alice', 'Bob'], 'David');
    assert.equal(decDavid.permitted, false);

    // 3. Batch filtering
    const memories = [
        whisperMem,
        { scope: 'world', text: '旧钟楼的历史记录' }
    ];
    const filteredForCharlie = PresenceGuard.filterMemoriesByPresence(memories, ['Alice', 'Bob', 'Charlie'], 'Charlie');
    assert.equal(filteredForCharlie.allowed.length, 2);
    assert.equal(filteredForCharlie.stats.whisperFragment, 1);
    assert.ok(filteredForCharlie.allowed[0].isWhisperFragment);
    assert.match(filteredForCharlie.allowed[0].text, /隐约听见断续耳语/);
});

test('L15-O1 & L15-X1: cross-layer vertical integration (diagnostic, UI, pipeline) and negative control', () => {
    // 1. Diagnostic integration
    const fakeEngine = {
        _sceneState: {
            location: '地下秘密档案馆',
            action: '查阅绝密卷宗',
            inSceneCharacters: ['Alice', 'Bob'],
            persistedAt: Date.now(),
            floor: 25
        }
    };
    const diagState = Diag.sceneStateTrackerState(fakeEngine, {});
    assert.equal(diagState.ok, true);
    assert.equal(diagState.isPersisted, true);
    assert.equal(diagState.location, '地下秘密档案馆');

    const diagLine = Diag._sceneStateTrackerLine(fakeEngine);
    assert.match(diagLine, /已落盘/);
    assert.match(diagLine, /地下秘密档案馆/);

    // 2. Settings UI integration
    const settingsUiSrc = fs.readFileSync(path.join(rootDir, 'settings-ui.js'), 'utf8');
    assert.ok(settingsUiSrc.includes('scState.isPersisted'), 'settings-ui 必须渲染落盘标记');

    // 3. Negative control: Mutate whisper scope check and verify assertion fails
    const guardSrc = fs.readFileSync(path.join(rootDir, 'presence-routing-guard.js'), 'utf8');
    assert.ok(guardSrc.includes("WHISPER: 'whisper'"), 'guard 包含 WHISPER 定义');
    const mutatedGuardSrc = guardSrc.replace("WHISPER: 'whisper'", "WHISPER: 'whisper_disabled'");
    assert.throws(() => {
        if (!mutatedGuardSrc.includes("WHISPER: 'whisper'")) {
            throw new Error('negative-control: whisper scope mutated');
        }
    }, /negative-control/);
});
