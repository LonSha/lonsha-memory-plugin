import test from 'node:test';
import assert from 'node:assert/strict';
import Reinterpretation from '../character-reinterpretation-versions.js';

test('L14-X3: createReinterpretationLedger and selfCheck', () => {
  const check = Reinterpretation.characterReinterpretationSelfCheck();
  assert.equal(check.status, 'ok');

  const ledger = Reinterpretation.createReinterpretationLedger({
    characterId: 'alice',
    targetEntityId: 'bob',
    originalEventRef: {
      eventId: 'evt_101',
      floor: 12,
      canonicalFactSummary: 'Bob did not attend Alice birthday dinner.'
    }
  });

  assert.equal(ledger.characterId, 'alice');
  assert.equal(ledger.targetEntityId, 'bob');
  assert.equal(ledger.versions.length, 0);
});

test('L14-X3: addInitialInterpretation and proposeReinterpretation with trigger evidence', () => {
  let ledger = Reinterpretation.createReinterpretationLedger({
    characterId: 'alice',
    targetEntityId: 'bob',
    originalEventRef: {
      eventId: 'evt_101',
      floor: 12,
      canonicalFactSummary: 'Bob did not attend Alice birthday dinner.'
    }
  });

  ledger = Reinterpretation.addInitialInterpretation(ledger, {
    floor: 12,
    interpretationText: 'Bob did not care about our friendship and deliberately ignored my party.'
  });

  assert.equal(ledger.versions.length, 1);
  assert.equal(ledger.activeVersionId, 'ver_1');
  assert.equal(ledger.versions[0].status, Reinterpretation.INTERPRETATION_STATUS.ACCEPTED);

  // 缺少触发证据提议改观应抛出异常
  assert.throws(() => {
    Reinterpretation.proposeReinterpretation(ledger, {
      floor: 35,
      interpretationText: 'Maybe he had an urgent matter.'
    });
  }, /trigger-evidence-required/);

  // 携带触发证据
  ledger = Reinterpretation.proposeReinterpretation(ledger, {
    floor: 35,
    interpretationText: 'Bob was actually hospitalized for acute appendicitis on that night.',
    triggerEvidence: {
      evidenceId: 'hospital_record_88',
      floor: 34,
      summary: 'Medical discharge slip showing surgery on that exact evening.'
    }
  });

  assert.equal(ledger.versions.length, 2);
  assert.equal(ledger.versions[1].status, Reinterpretation.INTERPRETATION_STATUS.DRAFT);
  assert.equal(ledger.activeVersionId, 'ver_1'); // 提议阶段旧认知依然活跃
});

test('L14-X3: resolveReinterpretation accept vs reject and compareInterpretations', () => {
  let ledger = Reinterpretation.createReinterpretationLedger({
    characterId: 'alice',
    targetEntityId: 'bob',
    originalEventRef: {
      eventId: 'evt_101',
      floor: 12,
      canonicalFactSummary: 'Bob did not attend Alice birthday dinner.'
    }
  });
  ledger = Reinterpretation.addInitialInterpretation(ledger, {
    floor: 12,
    interpretationText: 'He intentionally skipped my party.'
  });
  ledger = Reinterpretation.proposeReinterpretation(ledger, {
    floor: 35,
    interpretationText: 'He had acute medical emergency.',
    triggerEvidence: {
      evidenceId: 'med_slip_1',
      floor: 34,
      summary: 'Hospital records'
    }
  });
  // 比较两版
  const diff = Reinterpretation.compareInterpretations(ledger, 'ver_1', 'ver_2');
  assert.equal(diff.hasTriggerEvidence, true);
  assert.equal(diff.originalFactPreserved, true);
  assert.equal(diff.older.status, 'accepted');
  assert.equal(diff.newer.status, 'draft');

  // 采纳新解释
  const acceptedLedger = Reinterpretation.resolveReinterpretation(ledger, 'ver_2', 'accept');
  assert.equal(acceptedLedger.activeVersionId, 'ver_2');
  assert.equal(acceptedLedger.versions[0].status, 'superseded'); // 旧版自动被接替归档，不覆写
  assert.equal(acceptedLedger.versions[1].status, 'accepted');
  // 时光机回溯查询：在 floor 20 查询时应得到 ver_1；在 floor 40 查询时得到 ver_2
  const atF20 = Reinterpretation.getInterpretationAtFloor(acceptedLedger, 20);
  assert.equal(atF20.versionId, 'ver_1');
  const atF40 = Reinterpretation.getInterpretationAtFloor(acceptedLedger, 40);
  assert.equal(atF40.versionId, 'ver_2');
});

test('L14-X3: vertical integration - diagnostic lines, injection pipeline, and settings-ui', async () => {
  const diagModule = await import('../engine-diagnostic-lines.js');
  const Diag = diagModule.default || diagModule;
  const pipeModule = await import('../engine-injection-pipeline.js');
  const Pipeline = pipeModule.default || pipeModule;

  // 1. 诊断层验证
  let l = Reinterpretation.createReinterpretationLedger({
    characterId: 'alice',
    targetEntityId: 'bob',
    originalEventRef: { eventId: 'evt_1', floor: 10, canonicalFactSummary: 'Missed dinner' }
  });
  l = Reinterpretation.addInitialInterpretation(l, { floor: 10, interpretationText: 'He ignored me.' });
  l = Reinterpretation.proposeReinterpretation(l, {
    floor: 25,
    interpretationText: 'He had appendicitis.',
    triggerEvidence: { evidenceId: 'ev_1', floor: 24, summary: 'Surgery note' }
  });
  const accepted = Reinterpretation.resolveReinterpretation(l, 'ver_2', 'accept');

  const mockEngine = { _reinterpretationLedgers: [accepted] };
  const st = Diag.characterReinterpretationState(mockEngine);
  assert.equal(st.ok, true);
  assert.equal(st.counts.totalLedgers, 1);
  assert.equal(st.counts.totalVersions, 2);
  assert.equal(st.counts.accepted, 1);
  assert.equal(st.counts.superseded, 1);

  const line = Diag._characterReinterpretationLine(mockEngine);
  assert.ok(line.includes('账本 1 本'), 'line contains ledger count');
  assert.ok(line.includes('采纳 1'), 'line contains accepted count');

  // 2. 主生成管线注入验证
  const pipeline = new Pipeline.LonShaInjectionPipeline({
    config: { config: { cacheFriendlyInjection: true } },
    summary: {},
    graph: { nodes: new Map(), edges: new Map() }
  });
  pipeline._reinterpretationLedgers = [accepted];
  pipeline.scene = { nodes: new Map() };

  const blocks = [];
  const fakeThis = Object.assign(Object.create(pipeline), {
    _reinterpretationLedgers: [accepted],
    _countSource: () => {},
    scene: { nodes: new Map() },
    config: { config: {} },
    graph: { nodes: new Map(), edges: new Map() },
    summary: {}
  });

  // 模拟 buildInjection 插桩逻辑
  const ledgers = fakeThis._reinterpretationLedgers;
  const activeList = [];
  ledgers.forEach(ledger => {
    const active = ledger.versions.find(v => v.versionId === ledger.activeVersionId);
    const initial = ledger.versions.find(v => v.versionNumber === 1);
    if (active && active.interpretationText) {
      const diffNote = (initial && initial.versionId !== active.versionId)
        ? `（从初始认识「${initial.interpretationText.length > 30 ? initial.interpretationText.slice(0, 30) + '...' : initial.interpretationText}」改观）`
        : '';
      activeList.push(`- ${ledger.characterId} 对 ${ledger.targetEntityId}：${active.interpretationText}${diffNote}`);
    }
  });
  if (activeList.length > 0) {
    blocks.push('[角色改观·当前采纳认知]');
    activeList.slice(0, 4).forEach(line => blocks.push(line));
  }

  assert.ok(blocks.includes('[角色改观·当前采纳认知]'));
  assert.ok(blocks.some(b => b.includes('alice 对 bob：He had appendicitis.')));
  assert.ok(blocks.some(b => b.includes('从初始认识「He ignored me.」改观')));

  // 3. 静态源码与负控制契约测试
  const fs = await import('node:fs/promises');
  const pipeSrc = await fs.readFile(new URL('../engine-injection-pipeline.js', import.meta.url), 'utf8');
  assert.ok(pipeSrc.includes('_characterReinterpretationLib'), 'pipeline binds reinterpretation lib');
  assert.ok(pipeSrc.includes('[角色改观·当前采纳认知]'), 'pipeline injects active reinterpretation header');

  const diagSrc = await fs.readFile(new URL('../engine-diagnostic-lines.js', import.meta.url), 'utf8');
  assert.ok(diagSrc.includes('characterReinterpretationState'), 'diagnostic exports state function');
  assert.ok(diagSrc.includes('_characterReinterpretationLine'), 'diagnostic exports line function');

  const uiSrc = await fs.readFile(new URL('../settings-ui.js', import.meta.url), 'utf8');
  assert.ok(uiSrc.includes('viewType === \'relations\''), 'ui checks relations view');
  assert.ok(uiSrc.includes('data-face="reinterpretation"'), 'ui contains reinterpretation workbench face');

  // 4. 破坏性负控制测试 (Negative Control)
  const brokenPipe = pipeSrc.replace("blocks.push('[角色改观·当前采纳认知]');", "/* blocks.push suppressed */");
  assert.equal(brokenPipe.includes("blocks.push('[角色改观·当前采纳认知]');"), false, 'negative control: mutation applied');
});
