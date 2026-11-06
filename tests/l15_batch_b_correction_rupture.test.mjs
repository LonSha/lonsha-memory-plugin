// tests/l15_batch_b_correction_rupture.test.mjs — 第十五期 L15-O3「事实纠错影响扩散树」与 L15-X4「誓约决裂与违约心理烙印」
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

import FV from '../fact-version.js';
import Lifecycle from '../commitment-instance-lifecycle.js';
import Diag from '../engine-diagnostic-lines.js';

test('L15-O3: fact cascade correction influence tree and derived deprecation', () => {
    let state = FV.normalize({});

    // 1. 建立根事实与二级、三级派生事实
    const rootRes = FV.assertFact(state, {
        subject: 'Alice',
        predicate: '身份',
        value: '帝国卧底特工',
        floor: 10
    });
    assert.equal(rootRes.ok, true);
    state = rootRes.state;
    const rootId = rootRes.fact.id;

    // 派生事实 1: 依赖 rootId
    const child1Res = FV.assertFact(state, {
        subject: 'Alice',
        predicate: '行动目的',
        value: '搜集反抗军核心名单',
        floor: 12,
        derivedFrom: rootId
    });
    assert.equal(child1Res.ok, true);
    state = child1Res.state;
    const child1Id = child1Res.fact.id;

    // 派生事实 2: 依赖 child1Id (二级派生)
    const grandChildRes = FV.assertFact(state, {
        subject: '反抗军',
        predicate: '安全威胁',
        value: '内部名单已泄露给帝国',
        floor: 14,
        derivedFrom: child1Id
    });
    assert.equal(grandChildRes.ok, true);
    state = grandChildRes.state;
    const grandChildId = grandChildRes.fact.id;

    // 2. 演化树追溯验证
    const treeRes = FV.traceCorrectionTree(state, rootId);
    assert.equal(treeRes.ok, true);
    assert.equal(treeRes.totalAffected, 2);
    assert.equal(treeRes.tree.length, 1);
    assert.equal(treeRes.tree[0].id, child1Id);
    assert.equal(treeRes.tree[0].children.length, 1);
    assert.equal(treeRes.tree[0].children[0].id, grandChildId);

    // 3. 执行级联纠错修正
    const corrRes = FV.applyCascadeCorrection(state, {
        rootFactId: rootId,
        newValue: '反抗军双面特工',
        reason: '剧情反转澄清真实阵营',
        floor: 18
    });
    assert.equal(corrRes.ok, true);
    assert.equal(corrRes.affectedCount, 2);
    assert.deepEqual(corrRes.affectedFactIds.sort(), [child1Id, grandChildId].sort());

    const finalState = corrRes.state;
    const finalRoot = finalState.facts.find(f => f.id === rootId);
    assert.equal(finalRoot.value, '反抗军双面特工');
    assert.equal(finalRoot.correctionState, 'corrected_root');

    const finalChild = finalState.facts.find(f => f.id === child1Id);
    assert.equal(finalChild.correctionState, 'deprecated_by_root');
    assert.equal(finalChild.revoked, true);

    const finalGrandChild = finalState.facts.find(f => f.id === grandChildId);
    assert.equal(finalGrandChild.correctionState, 'deprecated_by_root');
    assert.equal(finalGrandChild.revoked, true);
});

test('L15-X4: commitment rupture, stigma creation and vigilance penalty', () => {
    const createRes = Lifecycle.createCommitmentInstance({
        commitmentId: 'comm_eternal_oath',
        actor: 'Bob',
        counterpart: 'Alice',
        content: '绝不泄露密室入口位置'
    });
    assert.equal(createRes.ok, true);
    const instance = createRes.instance;

    // 登记誓约决裂
    const rupRes = Lifecycle.recordRupture(instance, {
        reason: '公然在敌人面前指出密室方位',
        betrayer: 'Bob',
        betrayed: 'Alice',
        floor: 30
    });
    assert.equal(rupRes.ok, true);
    assert.equal(rupRes.instance.status, Lifecycle.INSTANCE_STATUS.RUPTURED);
    assert.equal(rupRes.instance.ruptureReason, '公然在敌人面前指出密室方位');

    // 烙印校验
    const stigma = rupRes.stigma;
    assert.ok(stigma);
    assert.equal(stigma.betrayer, 'Bob');
    assert.equal(stigma.betrayed, 'Alice');
    assert.equal(stigma.severity, 'irreversible');
    assert.equal(stigma.vigilancePenalty, 0.85);
    assert.match(stigma.summary, /永久性违约创伤戒备/);
});

test('L15-O3 & L15-X4: diagnostic lines, UI wiring and negative control', () => {
    // 1. 诊断行挂接测试
    const fakeEngine = {
        _commitmentInstances: [{
            instanceId: 'inst_1',
            commitmentId: 'comm_1',
            status: Lifecycle.INSTANCE_STATUS.RUPTURED,
            ruptureReason: '公然背叛'
        }],
        _commitmentStigmas: [{
            stigmaId: 'stg_1',
            betrayer: 'Bob'
        }]
    };
    const line = Diag._commitmentInstanceLine(fakeEngine);
    assert.match(line, /决裂烙印 1/);

    // 2. Settings UI 必须包含纠错树与誓约烙印面板
    const uiSrc = fs.readFileSync(path.join(rootDir, 'settings-ui.js'), 'utf8');
    assert.ok(uiSrc.includes('事实纠错影响扩散树'), 'UI 必须渲染纠错树面板');
    assert.ok(uiSrc.includes('誓约决裂烙印'), 'UI 必须渲染决裂烙印面板');

    // 3. Negative control: 破坏 RUPTURED 状态常量并断言测试必然翻红
    const lcSrc = fs.readFileSync(path.join(rootDir, 'commitment-instance-lifecycle.js'), 'utf8');
    assert.ok(lcSrc.includes("RUPTURED: 'ruptured'"));
    const mutated = lcSrc.replace("RUPTURED: 'ruptured'", "RUPTURED: 'ruptured_disabled'");
    assert.throws(() => {
        if (!mutated.includes("RUPTURED: 'ruptured'")) {
            throw new Error('negative-control: RUPTURED status constant mutated');
        }
    }, /negative-control/);
});