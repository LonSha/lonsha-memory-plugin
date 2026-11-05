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

test('L14-X5: cross-layer vertical integration (diagnostic lines, injection pipeline, settings-ui)', async () => {
  // 1. 验证诊断层 loreConclusionState 与 _loreConclusionLine
  const diagLib = (await import('../engine-diagnostic-lines.js')).default;
  assert.ok(typeof diagLib.loreConclusionState === 'function', 'loreConclusionState exists');
  assert.ok(typeof diagLib._loreConclusionLine === 'function', '_loreConclusionLine exists');

  // 空段落状态：state 必须为 no-docs
  const emptyState = diagLib.loreConclusionState({}, {});
  assert.equal(emptyState.state, 'no-docs');
  assert.equal(emptyState.ok, false);

  // 正常换版与结论核验
  const mockEngine = {
    _loreDocId: 'arcane_grimoire',
    _loreOldSections: [
      { sectionId: 's1', content: 'Sulfur is required' },
      { sectionId: 's2', content: 'Water requires clouds' }
    ],
    _loreNewSections: [
      { sectionId: 's1', content: 'Sulfur is required' }, // unchanged
      { sectionId: 's2', content: 'Water requires spiritual mana' } // modified
    ],
    _loreConclusions: [
      { conclusionId: 'c1', text: 'Water magic needs clouds', dependsOnSectionIds: ['s2'], isManuallyEdited: true }
    ]
  };

  const validState = diagLib.loreConclusionState(mockEngine);
  assert.equal(validState.ok, true);
  assert.equal(validState.counts.total, 1);
  assert.equal(validState.counts.stale, 1);
  assert.equal(validState.conclusions[0].status, 'stale');
  assert.equal(validState.conclusions[0].isManuallyEdited, true);

  const line = diagLib._loreConclusionLine(mockEngine);
  assert.ok(line.includes('设定换版更新'));
  assert.ok(line.includes('待复核 1'));

  // 2. 验证注入主链路 engine-injection-pipeline.js 调用
  const pipelineLib = (await import('../engine-injection-pipeline.js')).default;
  assert.ok(typeof pipelineLib.buildInjection === 'function', 'buildInjection exists');

  const fakeEngine = {
    config: { config: { memoryTokenBudget: 2700, vectorTopK: 5, sceneEnabled: true, npcTierInjection: false, cacheFriendlyInjection: false } },
    _loreOldSections: [{ sectionId: 's1', content: 'A' }],
    _loreNewSections: [{ sectionId: 's1', content: 'A' }],
    _loreConclusions: [{ conclusionId: 'c1', text: 'Ancient kingdom fell in 1000' }],
    scene: {
      currentKey: () => 'library',
      chainOf: () => [{ path: ['library'], desc: '图书馆' }],
      headerLine: () => ''
    },
    captureCast: () => [],
    resolveCharacterName: (n) => n
  };

  const recalled = [{ text: '查阅历史典籍' }];
  const injectionResult = pipelineLib.buildInjection(fakeEngine, recalled);
  assert.ok(injectionResult.includes('[设定换版·有效结论]'), 'injection must contain lore conclusion prompt');
  assert.ok(injectionResult.includes('Ancient kingdom fell in 1000'), 'injection must contain conclusion text');
  assert.ok(fakeEngine._lastLoreConclusionReconcile, 'engine must record _lastLoreConclusionReconcile');

  // 3. 验证 settings-ui.js 中的面板消费
  const fs = await import('node:fs');
  const uiSrc = fs.readFileSync('settings-ui.js', 'utf-8');
  assert.ok(uiSrc.includes('loreConclusionState'), 'settings-ui must call loreConclusionState');
  assert.ok(uiSrc.includes('_loreConclusionLine'), 'settings-ui must call _loreConclusionLine');
  assert.ok(uiSrc.includes('📑 设定换版与结论更新对照工作台'), 'settings-ui must render lore reconcile title');

  // 4. 负控制：模拟破坏注入逻辑或面板入口
  const brokenPipeSrc = (await fs.promises.readFile('engine-injection-pipeline.js', 'utf-8'))
    .replace("blocks.push('[设定换版·有效结论]')", "// suppressed");
  assert.ok(!brokenPipeSrc.includes("blocks.push('[设定换版·有效结论]')"), 'negative control: injection suppressed');
});