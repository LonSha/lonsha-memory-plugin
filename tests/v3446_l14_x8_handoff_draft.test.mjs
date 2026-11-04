import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import Handoff from '../era-handoff-draft.js';
import Roster from '../era-continuation-inheritance-tree.js';

const manifest = JSON.parse(fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
const indexSource = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');

const legacyItems = [
    { id: 'sword', kind: 'artifact', title: '旧剑', content: '父亲留下的旧剑。' },
    { id: 'ledger', kind: 'story', title: '账房旧事', content: '那年冬天账房关门。' },
    { id: 'smithing', kind: 'craft', title: '打铁手艺', content: '三代人的打铁手法。' },
    { id: 'letter', kind: 'artifact', title: '密信', content: '密信正文不该外泄。', isSecret: true, secretRef: 'sec-letter' },
    { id: 'unassigned', kind: 'story', title: '没处置的故事', content: '还没决定传不传。' },
];

function draftOf() {
    const created = Handoff.createHandoffDraft(legacyItems, { draftId: 'hd-1', fromEra: 'first_era', toEra: 'second_era' });
    assert.equal(created.ok, true);
    assert.equal(created.writesNothing, true);
    return created.draft;
}

test('X8: host registers and consumes the handoff draft module', () => {
    assert.ok(manifest.extra_js.includes('era-handoff-draft.js'));
    assert.match(indexSource, /function _eraHandoffDraftLib\(\).*era-handoff-draft\.js/);
    assert.match(indexSource, /\['交接草案', _eraHandoffDraftLib, 'handoffDraftSelfCheck'\]/);
});

test('X8: draft creation is read-only and keeps kinds separate', () => {
    const created = Handoff.createHandoffDraft(legacyItems, { draftId: 'hd-1' });
    assert.equal(created.writes, false);
    assert.equal(created.itemCount, 5);
    assert.deepEqual(created.draft.items.map((i) => i.kindLabel), ['物件', '故事', '技艺', '物件', '故事']);
    // 空清单必须拒绝：否则「这局还没传过」会被读成草案
    assert.equal(Handoff.createHandoffDraft([], {}).ok, false);
    // 无 id 的条目被跳过而不是凭空生成 id
    const skipped = Handoff.createHandoffDraft([{ kind: 'artifact', content: 'x' }], {});
    assert.equal(skipped.ok, false);
    assert.equal(skipped.reason, 'no-valid-items');
});

test('X8: pending and result fates stay on separate axes', () => {
    let d = draftOf();
    d = Handoff.assignHandoffItem(d, { itemId: 'sword', heirId: 'jia', fate: 'accepted' }).draft;
    const preview = Handoff.previewNextGeneration(d, { heirId: 'jia' });
    const byId = Object.fromEntries(preview.materials.map((m) => [m.itemId, m]));
    // 已处置 → 结果轴
    assert.equal(byId.sword.axis, Handoff.AXIS.RESULT);
    assert.equal(byId.sword.fate, 'accepted');
    assert.equal(byId.sword.visible, true);
    // 未处置 → 未到结果轴，读作「还没传」，绝不同形成 lost/rejected
    assert.equal(byId.unassigned.axis, Handoff.AXIS.PROGRESS);
    assert.equal(byId.unassigned.fate, 'pending');
    assert.equal(byId.unassigned.fateLabel, '还没传');
    assert.notEqual(byId.unassigned.fate, 'lost');
    assert.equal(byId.unassigned.visible, false);
    assert.equal(preview.heirs[0].counts.pending, 4);
});

test('X8: giving an item to one heir does not default it to the whole family', () => {
    let d = draftOf();
    d = Handoff.assignHandoffItem(d, { itemId: 'sword', heirId: 'jia', fate: 'accepted' }).draft;
    d = Handoff.assignHandoffItem(d, { itemId: 'smithing', heirId: 'yi', fate: 'accepted' }).draft;
    const grouped = Handoff.previewNextGeneration(d, {});
    assert.deepEqual(grouped.heirs.map((h) => h.heirId), ['jia', 'yi']);
    const jia = grouped.heirs.find((h) => h.heirId === 'jia');
    const yi = grouped.heirs.find((h) => h.heirId === 'yi');
    const jiaSword = jia.materials.find((m) => m.itemId === 'sword');
    const yiSword = yi.materials.find((m) => m.itemId === 'sword');
    assert.equal(jiaSword.visible, true);
    assert.equal(yiSword.visible, false);
    assert.equal(yiSword.reason, 'assigned-to-other-heir');
    // 甲的预览串里不能出现乙的技艺
    assert.ok(!jia.promptPreview.includes('打铁'));
    // 显式共有才共有
    d = Handoff.assignHandoffItem(d, { itemId: 'ledger', heirId: 'jia', fate: 'accepted', sharedWith: ['yi'] }).draft;
    const after = Handoff.previewNextGeneration(d, {});
    const yiLedger = after.heirs.find((h) => h.heirId === 'yi').materials.find((m) => m.itemId === 'ledger');
    assert.equal(yiLedger.visible, true);
    assert.equal(yiLedger.shared, true);
});

test('X8: unauthorized secrets never enter next-generation materials', () => {
    let d = draftOf();
    d = Handoff.assignHandoffItem(d, { itemId: 'letter', heirId: 'jia', fate: 'accepted' }).draft;
    // 没有任何 knowledgeOf 注入 ⇒ undecided，不给正文
    const noKernel = Handoff.previewNextGeneration(d, { heirId: 'jia' });
    const m1 = noKernel.materials.find((m) => m.itemId === 'letter');
    assert.equal(m1.visible, false);
    assert.equal(m1.blockedBySecret, true);
    assert.equal(m1.secretBoundary, 'undecided');
    assert.equal(m1.promptText, '');
    assert.ok(!noKernel.promptPreview.includes('密信正文不该外泄'));
    // listed（在册但没给这一代）⇒ withheld，仍不给正文
    const listed = Handoff.previewNextGeneration(d, { heirId: 'jia', knowledgeOf: () => 'listed' });
    const m2 = listed.materials.find((m) => m.itemId === 'letter');
    assert.equal(m2.secretBoundary, 'withheld');
    assert.equal(m2.visible, false);
    assert.ok(!listed.promptPreview.includes('密信正文不该外泄'));
    // 判定口抛异常 ⇒ undecided，不给正文
    const threw = Handoff.previewNextGeneration(d, { heirId: 'jia', knowledgeOf: () => { throw new Error('boom'); } });
    assert.equal(threw.materials.find((m) => m.itemId === 'letter').secretBoundary, 'undecided');
    // knower ⇒ disclosed，唯一允许给正文的一档
    const knower = Handoff.previewNextGeneration(d, { heirId: 'jia', knowledgeOf: () => 'knower' });
    const m3 = knower.materials.find((m) => m.itemId === 'letter');
    assert.equal(m3.secretBoundary, 'disclosed');
    assert.equal(m3.visible, true);
    assert.ok(knower.promptPreview.includes('密信正文不该外泄'));
    // 账里没有这条 ⇒ absent（与 withheld 不同形），同样不外泄
    const absent = Handoff.previewNextGeneration(d, { heirId: 'jia', knowledgeOf: () => 'absent' });
    const m4 = absent.materials.find((m) => m.itemId === 'letter');
    assert.equal(m4.secretBoundary, 'absent');
    assert.equal(m4.visible, false);
});

test('X8: revoke restores the draft and keeps the source untouched', () => {
    const before = JSON.stringify(legacyItems);
    let d = draftOf();
    d = Handoff.assignHandoffItem(d, { itemId: 'sword', heirId: 'jia', fate: 'accepted' }).draft;
    const revoked = Handoff.revokeHandoffDraft(d);
    assert.equal(revoked.ok, true);
    assert.equal(revoked.oldEraReadable, true);
    assert.equal(revoked.sourceUntouched, true);
    assert.equal(revoked.draft.status, 'revoked');
    assert.equal(revoked.draft.revokedAssignments.length, 1);
    assert.equal(revoked.draft.assignmentLog.length, 0);
    assert.ok(revoked.draft.items.every((i) => i.assignment === null));
    // 撤回后不得再指派、不得再预览出材料
    assert.equal(Handoff.assignHandoffItem(revoked.draft, { itemId: 'sword', heirId: 'jia', fate: 'accepted' }).ok, false);
    assert.equal(Handoff.previewNextGeneration(revoked.draft, { heirId: 'jia' }).ok, false);
    assert.equal(JSON.stringify(legacyItems), before);
});

test('X8: nothing is written before confirmation, and the payload goes to the eraTransitions owner', () => {
    const before = JSON.stringify(legacyItems);
    let d = draftOf();
    d = Handoff.assignHandoffItem(d, { itemId: 'sword', heirId: 'jia', fate: 'accepted' }).draft;
    d = Handoff.assignHandoffItem(d, { itemId: 'ledger', heirId: 'yi', fate: 'lost' }).draft;
    d = Handoff.assignHandoffItem(d, { itemId: 'smithing', heirId: 'jia', fate: 'reformed', reformedNotes: '改成小件' }).draft;
    // 未确认：零写入，不产载荷
    const unconfirmed = Handoff.buildCommitPayload(d, {});
    assert.equal(unconfirmed.ok, false);
    assert.equal(unconfirmed.reason, 'not-confirmed');
    assert.equal(unconfirmed.writes, false);
    // 确认后：仍是 writes:false，交回既有 owner
    const confirmed = Handoff.buildCommitPayload(d, { confirm: true });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.writes, false);
    assert.equal(confirmed.owner, 'eraTransitions');
    assert.equal(confirmed.decidedCount, 3);
    assert.equal(confirmed.pendingCount, 2);
    assert.equal(confirmed.payload.declarations.sword.fate, 'accepted');
    assert.equal(confirmed.payload.declarations.sword.heirId, 'jia');
    assert.equal(confirmed.payload.declarations.ledger.fate, 'lost');
    // lost 不硬塞动作（否则 roster 会读成 unknown）
    assert.ok(!confirmed.payload.appliedItems.some((a) => a.itemId === 'ledger'));
    assert.equal(confirmed.payload.appliedItems.find((a) => a.itemId === 'smithing').action, 'modify');
    assert.equal(JSON.stringify(legacyItems), before);
});

test('X8: the committed payload is readable by the existing inheritance roster without lying', () => {
    let d = draftOf();
    d = Handoff.assignHandoffItem(d, { itemId: 'sword', heirId: 'jia', fate: 'accepted' }).draft;
    d = Handoff.assignHandoffItem(d, { itemId: 'ledger', heirId: 'yi', fate: 'rejected' }).draft;
    d = Handoff.assignHandoffItem(d, { itemId: 'smithing', heirId: 'jia', fate: 'reformed', reformedNotes: '改成小件' }).draft;
    d = Handoff.assignHandoffItem(d, { itemId: 'letter', heirId: 'jia', fate: 'lost' }).draft;
    const committed = Handoff.buildCommitPayload(d, { confirm: true });
    const roster = Roster.buildInheritanceRoster([committed.payload], { successorActorId: 'jia' });
    assert.equal(roster.ok, true);
    const byId = Object.fromEntries(roster.items.map((i) => [i.artifactId, i]));
    assert.equal(byId.sword.fate, 'accepted');
    assert.equal(byId.ledger.fate, 'rejected');
    assert.equal(byId.smithing.fate, 'reformed');
    assert.equal(byId.letter.fate, 'lost');
    // ★ 没处置的那件**不进入载荷**：否则 roster 的既有规则会把它读成 lost。
    //   它留在草案里等下一轮，并在回报里显式列出（「这次没提它」≠「它丢了」）。
    assert.equal(byId.unassigned, undefined);
    assert.deepEqual(committed.carriedOverItemIds, ['unassigned']);
    assert.equal(roster.counts.lost, 1);   // 只有明确宣告的那一件
    assert.equal(roster.counts.pending, 0);
    // 秘密件在 roster 里也必须不可见（roster 的契约字段是 visibleToSuccessor，
//   不是 inheritEraArtifact 那条路径上的 secretRedacted —— 别混用两个 API 的字段名）
    assert.equal(byId.letter.isSecret, true);
    assert.equal(byId.letter.visibleToSuccessor, false);
    assert.notEqual(byId.letter.secretBoundary, 'disclosed');
});

test('X8: self check has no problems', () => {
    const sc = Handoff.handoffDraftSelfCheck();
    assert.deepEqual([...sc.problems], []);
});
