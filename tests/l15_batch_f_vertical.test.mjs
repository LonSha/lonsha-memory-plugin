import test from 'node:test';
import assert from 'node:assert/strict';

import MigratePack from '../memory-migrate-pack.js';
import EvidenceSourceLocator from '../evidence-source-locator.js';
import FactVersion from '../fact-version.js';
import OralHistoryArchive from '../oral-history-archive.js';
import CharacterHabitGrowth from '../character-habit-growth-evidence.js';
import SecretLedger from '../secret-ledger.js';

test('L15-Batch-F: 周目差异比对与增量挑拣合并 (L15-O6)', () => {
    const local = {
        memories: {
            'char_1': {
                core: [{ id: 'cm_c1', text: '旧版事实A' }],
                recent: []
            }
        }
    };
    const incoming = {
        memories: {
            'char_1': {
                core: [
                    { id: 'cm_c1', text: '新版修改事实A*' },
                    { id: 'cm_c2', text: '新版增加事实B' }
                ],
                recent: []
            }
        }
    };

    const pack = MigratePack.packMemory({ source: incoming });
    assert.ok(pack.headSha);

    // 勾选挑拣合并
    const mergeResult = MigratePack.compareAndMergePacks(pack, local, ['char_1:core:cm_c1']);
    assert.equal(mergeResult.ok, true);
    assert.equal(mergeResult.diffReport.conflicts.length, 1);
    assert.equal(mergeResult.applied.report.written > 0, true);
});

test('L15-Batch-F: 正文编辑自愈与矛盾巡检 (L15-O8 / L15-O9)', () => {
    const fullText = '【现场记录】神殿骑士团在清晨突破了防线并占领了要塞。';
    const oldQuote = '骑士团在清晨突破了防线';

    const heal = EvidenceSourceLocator.healEvidenceQuote(fullText, oldQuote);
    assert.equal(heal.healed, true);
    assert.match(heal.matchedText, /突破了防线/);

    // 健康巡检探测生死矛盾
    const conflictingFacts = [
        { id: 'f1', content: '雷恩已阵亡在北境雪原' },
        { id: 'f2', content: '雷恩正在王都酒馆饮酒' }
    ];
    const report = FactVersion.inspectMemoryHealth(conflictingFacts);
    assert.equal(report.healthy, false);
    assert.equal(report.conflicts.length, 1);
    assert.equal(report.conflicts[0].type, 'life_death_conflict');

    // 负控制：健康事实报告断言
    const healthyFacts = [{ id: 'f3', content: '雷恩正在王都酒馆饮酒' }];
    assert.equal(FactVersion.inspectMemoryHealth(healthyFacts).healthy, true);
});

test('L15-Batch-F: 传闻跨轮异化、潜意识微反应与深层解密 (L15-X5 / L15-X7 / L15-X9)', () => {
    // 1. 传闻异化
    const rawRumor = { text: '据说是少许物资受损', hops: 0 };
    const drifted = OralHistoryArchive.driftRumorAcrossHops(rawRumor, 2);
    assert.equal(drifted.isExaggerated, true);
    assert.match(drifted.driftedText, /骇人传闻/);

    // 2. 潜意识微动作
    const quirks = CharacterHabitGrowth.triggerSubconsciousQuirks({}, { isDeceiving: true, stressLevel: 4 });
    assert.equal(quirks.triggered, true);
    assert.equal(quirks.quirks.length, 2);
    assert.match(quirks.injectedPromptText, /潜意识微动作/);

    // 3. 隐秘解密契机
    const sealed = { id: 'secret_relic_1', clueKey: 'royal_ring', progress: 60, secretText: '王座下的密道通往古代遗迹' };
    const p1 = SecretLedger.evaluateDecryptionProgress(sealed, { clueKey: 'wrong_key', solvedScore: 50 });
    assert.equal(p1.unlocked, false);
    assert.equal(p1.progress, 60);

    const p2 = SecretLedger.evaluateDecryptionProgress(sealed, { clueKey: 'royal_ring', solvedScore: 50 });
    assert.equal(p2.unlocked, true);
    assert.equal(p2.progress, 100);
    assert.equal(p2.revealedText, '王座下的密道通往古代遗迹');
});