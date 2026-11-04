import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Tx from '../fact-correction-transaction.js';
import Bench from '../fact-correction-bench.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const indexSource = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

// 一次真实的「人物关系记错」纠错：关系值从「主仆」改成「父女」
const correctionInput = {
    correctionId: 'corr-relation-1',
    factKey: 'xiaoxue:relation-to-luojia',
    fromValue: '主仆',
    toValue: '父女',
    dependents: [
        { id: 'sum-1', title: '第一卷关系摘要', category: 'summary', dependsOn: ['xiaoxue:relation-to-luojia'], value: '主仆' },
        { id: 'idx-1', title: '关系词条索引', category: 'index', dependsOn: ['xiaoxue:relation-to-luojia'] },
        { id: 'persp-1', title: '小雪视角对珞珈的认知', category: 'perspective', dependsOn: ['xiaoxue:relation-to-luojia'] },
        { id: 'note-1', title: '作者手写关系备注', category: 'fact', isManual: true, dependsOn: ['xiaoxue:relation-to-luojia'] },
        { id: 'mystery-1', title: '来路不明的一条依赖', dependsOn: ['xiaoxue:relation-to-luojia'] },
    ],
    indexEntries: [
        { id: 'idx-1', factKey: 'xiaoxue:relation-to-luojia' },
        { id: 'idx-other', factKey: 'someone:else' },
    ],
};

const factRecord = { key: 'xiaoxue:relation-to-luojia', value: '主仆', version: 3, history: [] };

test('O2: host registers and consumes the correction transaction module', () => {
    assert.ok(manifest.extra_js.includes('fact-correction-transaction.js'));
    assert.match(indexSource, /function _factCorrectionTxLib\(\).*fact-correction-transaction\.js/);
    assert.match(indexSource, /\['纠错事务', _factCorrectionTxLib, 'factCorrectionTransactionSelfCheck'\]/);
});

test('O2: a correction must be previewed across all four faces first', () => {
    const before = JSON.stringify(correctionInput);
    const preview = Tx.previewCorrectionImpact(correctionInput);
    assert.equal(preview.ok, true);
    assert.equal(preview.writesNothing, true);
    assert.equal(preview.writes, false);
    // 四面各有着落，不合并成「都改了」
    const byFace = Object.fromEntries(preview.faceSummary.map((f) => [f.face, f.count]));
    assert.equal(byFace.facts, 2);        // sum-1 + note-1
    assert.equal(byFace.index, 1);        // idx-1（indexEntries 里的 idx-other 不属于本事实，不得混入）
    assert.equal(byFace.perspective, 1);
    assert.equal(byFace.injection, 1);    // 值变化 ⇒ 自动补一条「停用旧版本」
    // 判不了面的依赖单列，不当成「这一面没影响」
    assert.equal(preview.undecided.length, 1);
    assert.equal(preview.undecided[0].id, 'mystery-1');
    assert.equal(preview.undecided[0].face, null);
    // 手写/锁定条目必须是 manual_only，不许被自动改
    const manual = preview.faces.facts.find((x) => x.id === 'note-1');
    assert.equal(manual.tier, Tx.TIERS.MANUAL_ONLY);
    assert.equal(preview.hasManualBlockers, true);
    assert.equal(JSON.stringify(correctionInput), before);
});

test('O2: nothing is written before confirmation, and batches go to their own owners', () => {
    const preview = Tx.previewCorrectionImpact(correctionInput);
    // 未确认：连批次都不给
    const unconfirmed = Tx.commitCorrection(preview, {});
    assert.equal(unconfirmed.ok, false);
    assert.equal(unconfirmed.reason, 'not-confirmed');
    assert.equal(unconfirmed.writes, false);

    const committed = Tx.commitCorrection(preview, { confirm: true, factRecord });
    assert.equal(committed.ok, true);
    assert.equal(committed.writes, false);   // 本模块从不写槽
    assert.equal(committed.atomicAcrossOwners, false);
    assert.deepEqual(committed.ownerBatches.map((b) => b.owner), ['facts', 'index', 'perspective', 'injection']);
    // 版本推进：旧版退休、新版生效
    assert.equal(committed.activeVersion, 4);
    assert.deepEqual(committed.retiredVersions, [3]);
    // 原始证据不被改写
    assert.equal(committed.originalEvidenceUntouched, true);
    const factsBatch = committed.ownerBatches.find((b) => b.owner === 'facts');
    assert.equal(factsBatch.payload.rewritesEvidence, false);
    // 判不了面的依赖如实上报，不静默丢
    assert.equal(committed.skippedOwners[0].reason, 'undecided-face');
    assert.deepEqual(committed.skippedOwners[0].itemIds, ['mystery-1']);
});

test('O2: the retired version stops being used by the next recall and injection', () => {
    const preview = Tx.previewCorrectionImpact(correctionInput);
    const committed = Tx.commitCorrection(preview, { confirm: true, factRecord });

    // 旧版本（3）被明确判为不可用
    const oldVer = Tx.isVersionUsable({ factKey: 'xiaoxue:relation-to-luojia', version: 3 }, committed);
    assert.equal(oldVer.usable, false);
    assert.equal(oldVer.reason, 'superseded-by-correction');
    assert.equal(oldVer.activeVersion, 4);

    // 新版本可用
    const newVer = Tx.isVersionUsable({ factKey: 'xiaoxue:relation-to-luojia', version: 4 }, committed);
    assert.equal(newVer.usable, true);
    assert.equal(newVer.reason, 'active-version');

    // 别的事实不受影响
    const other = Tx.isVersionUsable({ factKey: 'someone:else', version: 3 }, committed);
    assert.equal(other.usable, true);

    // 显式撤销的条目一律不可用
    assert.equal(Tx.isVersionUsable({ factKey: 'k', version: 1, revoked: true }, committed).usable, false);
});

test('O2: rolling back restores the original version without rewriting evidence', () => {
    const preview = Tx.previewCorrectionImpact(correctionInput);
    const committed = Tx.commitCorrection(preview, { confirm: true, factRecord });

    // 未确认不得回滚
    assert.equal(Tx.rollbackCorrection(committed, {}).reason, 'not-confirmed');

    const rolled = Tx.rollbackCorrection(committed, { confirm: true });
    assert.equal(rolled.ok, true);
    assert.equal(rolled.writes, false);
    assert.equal(rolled.state, 'rolled-back');
    assert.deepEqual(rolled.restoredVersions, [3]);
    assert.equal(rolled.activeVersion, 3);
    assert.deepEqual(rolled.retiredVersions, [4]);
    // 原始证据不被改写（撤销纠错也不动证据正文）
    assert.equal(rolled.originalEvidenceUntouched, true);
    assert.ok(rolled.rollbackBatches.every((b) => !('evidenceText' in (b.payload || {}))));
    // 回滚后：原版本重新可用，纠错版不可用
    assert.equal(Tx.isVersionUsable({ factKey: 'xiaoxue:relation-to-luojia', version: 3 }, rolled).usable, true);
    assert.equal(Tx.isVersionUsable({ factKey: 'xiaoxue:relation-to-luojia', version: 4 }, rolled).usable, false);
    // 二次回滚报 already-rolled-back，不假装又撤了什么
    assert.equal(Tx.rollbackCorrection(rolled, { confirm: true }).reason, 'already-rolled-back');
});

test('O2: the next-round receipt stays a read-only pending ledger', () => {
    const preview = Tx.previewCorrectionImpact(correctionInput);
    const committed = Tx.commitCorrection(preview, { confirm: true, factRecord });
    const receipt = Tx.buildNextRoundReceipt(committed, { roundLabel: 'round-7' });
    assert.equal(receipt.ok, true);
    assert.equal(receipt.writesNothing, true);
    assert.equal(receipt.createsFact, false);
    assert.equal(receipt.roundLabel, 'round-7');
    assert.equal(receipt.activeVersion, 4);
    // 每面 ok 留空由宿主填：不预先宣称成功
    assert.ok(receipt.faces.every((f) => f.ok === null));
    assert.equal(receipt.facesPendingHostReport, true);
});

test('O2: no change means no injection retirement, and no preview means no commit', () => {
    // 值没变：注入面不该凭空多一条「停用旧版本」
    const noChange = Tx.previewCorrectionImpact({
        factKey: 'k1', fromValue: 'A', toValue: 'A',
        dependents: [{ id: 'sum', category: 'summary', dependsOn: ['k1'] }],
    });
    assert.equal(noChange.valueChanged, false);
    assert.equal(noChange.faces.injection.length, 0);

    // 没预览就直接提交 → 拒
    assert.equal(Tx.commitCorrection({}, { confirm: true }).reason, 'preview-required');
    // 空影响集 → 拒，不产一个「什么都没做」的批次
    const empty = Tx.previewCorrectionImpact({ factKey: 'k2', fromValue: 'A', toValue: 'A', dependents: [] });
    assert.equal(Tx.commitCorrection(empty, { confirm: true }).reason, 'nothing-to-commit');
});

test('O2: coexists with the existing correction bench without changing its contract', () => {
    // 修订台仍是纯函数影响图 + 三档分级
    const impact = Bench.traceImpactGraph('xiaoxue:relation-to-luojia', correctionInput.dependents);
    assert.equal(impact.factKey, 'xiaoxue:relation-to-luojia');
    assert.ok(impact.affected.length > 0);
    // 本模块的分级口径与修订台一致，不另造一套
    assert.deepEqual(
        Object.values(Tx.TIERS).sort(),
        Object.values(Bench.IMPACT_TIERS).sort()
    );
});

test('O2: self check has no problems', () => {
    const sc = Tx.factCorrectionTransactionSelfCheck();
    assert.deepEqual([...sc.problems], []);
});