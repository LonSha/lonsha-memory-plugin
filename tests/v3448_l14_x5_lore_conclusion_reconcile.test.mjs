import test from 'node:test';
import assert from 'node:assert/strict';
import Reconcile from '../lore-version-conclusion-reconcile.js';

test('L14-X5: createLoreReconcileSession and selfCheck', () => {
  const check = Reconcile.loreConclusionReconcileSelfCheck();
  assert.equal(check.status, 'ok');

  const session = Reconcile.createLoreReconcileSession({
    docId: 'magic_system_lore',
    docTitle: 'Arcane Physics',
    olderVersion: 'v1.0',
    newerVersion: 'v2.0'
  });

  assert.equal(session.docId, 'magic_system_lore');
  assert.equal(session.olderVersion, 'v1.0');
  assert.equal(session.newerVersion, 'v2.0');
});

test('L14-X5: diffLoreSections correctly identifies modified, removed, added and unchanged', () => {
  const oldSections = [
    { sectionId: 'sec_fire', title: 'Fire Spells', content: 'Fire requires incantation and sulfur.' },
    { sectionId: 'sec_water', title: 'Water Spells', content: 'Water requires pure condensed humidity.' },
    { sectionId: 'sec_ancient', title: 'Forbidden Arts', content: 'Blood sacrifice is strictly required.' }
  ];

  const newSections = [
    { sectionId: 'sec_fire', title: 'Fire Spells', content: 'Fire requires incantation and sulfur.' }, // unchanged
    { sectionId: 'sec_water', title: 'Water Spells', content: 'Water can be formed via spiritual pressure alone.' }, // modified
    { sectionId: 'sec_air', title: 'Air Spells', content: 'Air requires wind resonance.' } // added
    // sec_ancient removed
  ];

  const diff = Reconcile.diffLoreSections(oldSections, newSections);
  assert.equal(diff.length, 4);

  const fire = diff.find(d => d.sectionId === 'sec_fire');
  assert.equal(fire.diffState, Reconcile.SECTION_DIFF_STATE.UNCHANGED);

  const water = diff.find(d => d.sectionId === 'sec_water');
  assert.equal(water.diffState, Reconcile.SECTION_DIFF_STATE.MODIFIED);

  const ancient = diff.find(d => d.sectionId === 'sec_ancient');
  assert.equal(ancient.diffState, Reconcile.SECTION_DIFF_STATE.REMOVED);

  const air = diff.find(d => d.sectionId === 'sec_air');
  assert.equal(air.diffState, Reconcile.SECTION_DIFF_STATE.ADDED);
});

test('L14-X5: reconcileConclusionsWithDiff marks stale without overwriting, and applyConclusionDecision protects manual notes', () => {
  const diff = [
    { sectionId: 'sec_fire', diffState: Reconcile.SECTION_DIFF_STATE.UNCHANGED },
    { sectionId: 'sec_water', diffState: Reconcile.SECTION_DIFF_STATE.MODIFIED },
    { sectionId: 'sec_ancient', diffState: Reconcile.SECTION_DIFF_STATE.REMOVED }
  ];

  const existingConclusions = [
    {
      conclusionId: 'conc_fire_alchemy',
      text: 'Sulfur is a bottleneck for fire mages.',
      dependsOnSectionIds: ['sec_fire'],
      isManuallyEdited: false
    },
    {
      conclusionId: 'conc_water_tactics',
      text: 'Water mages cannot fight in arid deserts.',
      dependsOnSectionIds: ['sec_water'],
      isManuallyEdited: true // 用户手工校订过的
    },
    {
      conclusionId: 'conc_cult_threat',
      text: 'Blood cult poses an immediate physical threat.',
      dependsOnSectionIds: ['sec_ancient'],
      isManuallyEdited: false
    }
  ];

  const reconciled = Reconcile.reconcileConclusionsWithDiff(diff, existingConclusions);

  // conc_fire_alchemy 不受影响，仍为 fresh
  const concFire = reconciled.find(c => c.conclusionId === 'conc_fire_alchemy');
  assert.equal(concFire.status, Reconcile.CONCLUSION_REVIEW_STATUS.FRESH);

  // conc_water_tactics 依赖修改段，标记为 stale 但保留原内容
  const concWater = reconciled.find(c => c.conclusionId === 'conc_water_tactics');
  assert.equal(concWater.status, Reconcile.CONCLUSION_REVIEW_STATUS.STALE);
  assert.equal(concWater.isManuallyEdited, true);
  assert.ok(concWater.affectedBySections.includes('sec_water'));

  // 用户决策保留人工校订结论
  const afterKeep = Reconcile.applyConclusionDecision(reconciled, 'conc_water_tactics', 'keep_original');
  const kept = afterKeep.find(c => c.conclusionId === 'conc_water_tactics');
  assert.equal(kept.status, Reconcile.CONCLUSION_REVIEW_STATUS.KEPT_ORIGINAL);
  assert.equal(kept.text, 'Water mages cannot fight in arid deserts.');

  // 用户决策接受修改结论
  const afterAccept = Reconcile.applyConclusionDecision(
    reconciled,
    'conc_cult_threat',
    'accept_draft',
    'Forbidden arts rules are revoked; cult relies on illusion.'
  );
  const accepted = afterAccept.find(c => c.conclusionId === 'conc_cult_threat');
  assert.equal(accepted.status, Reconcile.CONCLUSION_REVIEW_STATUS.ACCEPTED);
  assert.equal(accepted.text, 'Forbidden arts rules are revoked; cult relies on illusion.');
});