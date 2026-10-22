/**
 * tests/v3570_m6_batch_c.test.mjs — v3.357.0 第六期批次 C（人物与行动）验收测试
 * M6-O4 人物自传式记忆（autobiographical-memory.js）
 * M6-O7 关系动力记忆（relation-dynamics.js）
 * M6-O9 长期意图推进与改道（goal-reroute.js）
 * M6-X1 / M6-X2 / M6-X7 行动与心智扩展契约（character-agency-contract.js）
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
import { breakSource } from './_break_kit.mjs';
import { loadBroken, negative } from './_negative_util.mjs';

const AB = require('../autobiographical-memory.js');
const RD = require('../relation-dynamics.js');
const GR = require('../goal-reroute.js');
const CA = require('../character-agency-contract.js');

const VERSION_RE = /const\s+VERSION\s*=\\s*'([^']+)'/;
const idxSrc = fs.readFileSync('./index.js', 'utf8');
const abSrc = fs.readFileSync('./autobiographical-memory.js', 'utf8');
const rdSrc = fs.readFileSync('./relation-dynamics.js', 'utf8');
const grSrc = fs.readFileSync('./goal-reroute.js', 'utf8');
const caSrc = fs.readFileSync('./character-agency-contract.js', 'utf8');
const moSrc = fs.readFileSync('./memory-organs.js', 'utf8');

const BORN_V = '3.357.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/* ================================================================
 * A. 版本锚与契约基线
 * ================================================================ */
describe('v3.357.0 版本锚', () => {
    test('A1 index.js VERSION 常量不低于 3.357.0', () => {
        const m = /const\s+VERSION\s*=\s*'([^']+)'/.exec(idxSrc);
        assert.ok(m, 'VERSION 未匹配');
        assert.ok(vnum(m[1]) >= vnum('3.357.0'));
    });

test('A2 manifest.json 版本不低于 3.357.0 且登记 4 个批次 C 模块', () => {
        const man = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
        assert.ok(vnum(man.version) >= vnum('3.357.0'));
        assert.ok(man.extra_js.includes('autobiographical-memory.js'));
        assert.ok(man.extra_js.includes('relation-dynamics.js'));
        assert.ok(man.extra_js.includes('goal-reroute.js'));
        assert.ok(man.extra_js.includes('character-agency-contract.js'));
    });

    test('A3 四个新模块暴露的 VERSION 常量均为 3.357.0', () => {
        assert.equal(AB.VERSION, '3.357.0');
        assert.equal(RD.VERSION, '3.357.0');
        assert.equal(GR.VERSION, '3.357.0');
        assert.equal(CA.VERSION, '3.357.0');
    });

    test('A4 自锚常量 BORN_V 恰是当版', () => {
        assert.equal(vnum(BORN_V), vnum('3.357.0'));
    });
});

/* ================================================================
 * B. M6-O4 人物自传式记忆（生命阶段、关键抉择、场景感知、同名隔离）
 * ================================================================ */
describe('M6-O4 人物自传式记忆', () => {
    test('B1 三阶段人生模型与阶段边界编辑', () => {
        let autobio = AB.createAutobiography({ charKey: 'luo_jia', charName: '珞珈' });
        const s1 = AB.addLifeStage(autobio, {
            id: 'youth',
            name: '县城少年求学',
            timeSpan: '2008-2011',
            summary: '在县城一中求学，性格孤僻内敛'
        });
        assert.ok(s1.ok);
        autobio = s1.autobiography;

        const s2 = AB.addLifeStage(autobio, {
            id: 'beijing',
            name: '北漂打拼',
            timeSpan: '2012-2016',
            summary: '在北京中关村创业艰难维生'
        });
        autobio = s2.autobiography;

        const s3 = AB.addLifeStage(autobio, {
            id: 'return',
            name: '回乡创业成熟期',
            timeSpan: '2017-至今',
            summary: '重返县城开办工作室，为人沉着克制',
            isActive: true
        });
        autobio = s3.autobiography;

        assert.equal(autobio.stages.length, 3);
        assert.equal(autobio.currentStageId, 'return');

        // 作者可自由编辑阶段边界
        const patchRes = AB.updateLifeStage(autobio, 'beijing', {
            summary: '在北京中关村与挚友打拼，吃尽苦头'
        });
        assert.ok(patchRes.ok);
        assert.equal(patchRes.stage.summary, '在北京中关村与挚友打拼，吃尽苦头');
    });

    test('B2 关键抉择改变后续转折摘要与当下保留态度，假设性选择不得入正史', () => {
        let autobio = AB.createAutobiography({ charKey: 'luo_jia' });
        autobio = AB.addLifeStage(autobio, { id: 'beijing', name: '北漂' }).autobiography;

        // 假设性选择被严格拦截
        const fakeChoice = AB.recordPivotalChoice(autobio, {
            id: 'ch_fake',
            choice: '假想如果当初留在老家',
            isHypothetical: true
        });
        assert.equal(fakeChoice.ok, false);
        assert.equal(fakeChoice.reason, 'hypothetical_choice_cannot_be_canonical');

        // 真实重大选择入正史
        const realChoice = AB.recordPivotalChoice(autobio, {
            id: 'ch_1',
            stageId: 'beijing',
            choice: '拒绝投资人苛刻对赌条款，独自承担债务',
            consequence: '虽然背负沉重债务，但保留了核心技术自主权',
            affectedAspects: ['商业态度', '信任门槛']
        });
        assert.ok(realChoice.ok);
        autobio = realChoice.autobiography;

        // 验证转折摘要已更新
        const stage = autobio.stages.find(s => s.id === 'beijing');
        assert.ok(stage.turningSummary.includes('独自承担债务'));

        // 验证保留态度已沉淀
        const retainedAspect = autobio.stillRetained.find(r => r.trait.startsWith('商业态度'));
        assert.ok(retainedAspect, '保留态度中必须记录商业态度');
        assert.ok(retainedAspect.expression.includes('核心技术自主权'));
    });

    test('B3 场景感知提取：回忆场景与当下互动场景获得不同经历材料', () => {
        let autobio = AB.createAutobiography({ charKey: 'luo_jia', charName: '珞珈' });
        autobio = AB.addLifeStage(autobio, { id: 's1', name: '少年', summary: '清贫自尊' }).autobiography;
        autobio = AB.addLifeStage(autobio, { id: 's2', name: '北漂', summary: '创业受挫' }).autobiography;
        autobio = AB.addLifeStage(autobio, { id: 's3', name: '中年', summary: '沉稳干练', isActive: true }).autobiography;
        autobio = AB.recordPivotalChoice(autobio, {
            id: 'c1',
            stageId: 's1',
            choice: '拒绝校霸勒索',
            consequence: '被孤立但保全尊严'
        }).autobiography;

        // 回忆场景：着重指定阶段溯及经历与昔日抉择
        const flashbackProfile = AB.deriveAutobiographicalProfile(autobio, {
            sceneMode: 'flashback',
            focusStageId: 's1'
        });
        assert.equal(flashbackProfile.sceneMode, 'flashback');
        assert.ok(flashbackProfile.pastBackground.includes('少年'));
        assert.ok(flashbackProfile.turningPoints.includes('拒绝校霸勒索'));

        // 当下互动场景：过去历程 + 关键转折 + 当下保留态度
        const presentProfile = AB.deriveAutobiographicalProfile(autobio, {
            sceneMode: 'present'
        });
        assert.equal(presentProfile.sceneMode, 'present');
        assert.ok(presentProfile.narrativeSummary.includes('[当下自传]'));
        assert.ok(presentProfile.narrativeSummary.includes('少年') && presentProfile.narrativeSummary.includes('北漂'));
    });

    test('B4 同名人物与伪装身份隔离：严禁按 charName 合成一个人生', () => {
        const boyLuoJia = AB.createAutobiography({ charKey: 'luo_jia', charName: '珞珈', personaId: 'p_teen' });
        const adultLuoJia = AB.createAutobiography({ charKey: 'luo_jia27', charName: '珞珈', personaId: 'p_adult' });
        const disguisedLuoHua = AB.createAutobiography({ charKey: 'luo_hua_disguised', charName: '珞珈', personaId: 'p_disguise' });

        assert.equal(boyLuoJia.charName, adultLuoJia.charName);
        assert.equal(boyLuoJia.charName, disguisedLuoHua.charName);

        // 隔离校验
        assert.ok(AB.assertIdentityIsolation(boyLuoJia, adultLuoJia));
        assert.ok(AB.assertIdentityIsolation(boyLuoJia, disguisedLuoHua));
        assert.ok(AB.assertIdentityIsolation(adultLuoJia, disguisedLuoHua));
    });
});

/* ================================================================
 * C. M6-O7 关系动力记忆（双向期待与付出、单侧修复阻断早和解、释然脱敏）
 * ================================================================ */
describe('M6-O7 关系动力记忆', () => {
    test('C1 A致歉而B尚未得知时，决不能显示已和解（单侧修复知情边界）', () => {
        let dyn = RD.createRelationDynamics({ charA: 'Alice', charB: 'Bob' });

        // 发生一次冲突
        dyn = RD.createRelationDynamics({
            charA: 'Alice',
            charB: 'Bob',
            breaches: [{ id: 'b_1', defaulter: 'Alice', victim: 'Bob', incident: '缺席了重要的毕业典礼' }]
        });

        // Alice 发送了道歉信，但 Bob 尚未收到 (receivedByCounterpart: false)
        const repairRes = RD.recordRepairAttempt(dyn, {
            id: 'rep_1',
            initiator: 'Alice',
            target: 'Bob',
            gesture: '手写致歉长信并托人转交',
            receivedByCounterpart: false,
            acceptedByCounterpart: false
        });
        assert.ok(repairRes.ok);
        dyn = repairRes.dynamics;

        const derived = RD.deriveRelationDynamics(dyn);
        assert.equal(derived.isReconciled, false, '对方未收到时决不能判为已和解');
        assert.equal(derived.reconciliationStatus, 'unilateral_repair_in_transit');
        assert.equal(derived.unilateralPending, true);

        // 视角材料导出检查知情不对称提示
        const sceneAlice = RD.formatForSceneContext(dyn, 'Alice');
        assert.ok(sceneAlice.asymmetryNote.includes('知情不对称'));
        assert.ok(sceneAlice.asymmetryNote.includes('尚未得知'));
    });

    test('C2 反复帮助与一次失约并存时，保留多轨依据，严禁合成单一好感值', () => {
        let dyn = RD.createRelationDynamics({ charA: 'Alice', charB: 'Bob' });

        // Alice 多次付出
        dyn = RD.recordContribution(dyn, { id: 'c1', actor: 'Alice', recipient: 'Bob', action: '深夜帮忙整理项目报告', sacrifice: '熬通宵' }).dynamics;
        dyn = RD.recordContribution(dyn, { id: 'c2', actor: 'Alice', recipient: 'Bob', action: '替Bob垫付培训费用', sacrifice: '花光积蓄' }).dynamics;

        // Alice 后来失约了一次
        dyn = RD.createRelationDynamics({
            ...dyn,
            breaches: [{ id: 'br_1', defaulter: 'Alice', victim: 'Bob', incident: '周末登山约会迟到了两小时' }]
        });

        const derived = RD.deriveRelationDynamics(dyn);
        // 不得产出单一合成分数（如好感度 = 75分）
        assert.equal(derived.multiTrackEvidence.positiveContributionsCount, 2);
        assert.equal(derived.multiTrackEvidence.activeBreachesCount, 1);
        assert.ok(derived.multiTrackEvidence.contributions.length === 2);
        assert.ok(derived.multiTrackEvidence.activeBreaches.length === 1);
    });

    test('C3 旧过节已释然之后，不再在活跃张力中施压，但转折痕迹历史可查', () => {
        let dyn = RD.createRelationDynamics({ charA: 'Alice', charB: 'Bob' });
        dyn = RD.createRelationDynamics({
            charA: 'Alice',
            charB: 'Bob',
            breaches: [{ id: 'b_old', defaulter: 'Alice', victim: 'Bob', incident: '高中时期不告而别' }]
        });

        // 经过双方坦白沟通，旧事释然
        const reliefRes = RD.recordRelief(dyn, 'breach', 'b_old', '十年重逢后深夜长谈解开心结');
        assert.ok(reliefRes.ok);
        dyn = reliefRes.dynamics;

        const derived = RD.deriveRelationDynamics(dyn);
        assert.equal(derived.activeBreachesCount, 0, '活跃过节已被清零');
        assert.equal(derived.relievedItemsCount, 1, '释然记录保留');
        assert.equal(derived.dynamicAtmosphere, 'relieved_and_settled');

        const sceneBob = RD.formatForSceneContext(dyn, 'Bob');
        assert.equal(sceneBob.stillCaresAbout.length, 0);
        assert.ok(sceneBob.relievedPoints.includes('十年重逢后深夜长谈解开心结'));
    });
});

/* ================================================================
 * D. M6-O9 长期意图推进与改道（互斥替代路径、遇阻重规划、放弃后重启保留代价）
 * ================================================================ */
describe('M6-O9 长期意图推进与改道', () => {
    test('D1 两条互斥筹备路线，选定其一后另一条保持未执行，不显示已完成', () => {
        let goal = GR.createGoal({
            id: 'g_exhibition',
            title: '举办科技成果独立艺术展',
            owner: 'team_alpha'
        });

        // 路线 A：商业画廊赞助路线
        goal = GR.addAlternativePath(goal, {
            pathId: 'path_commercial',
            label: '商业画廊赞助模式',
            estimatedCost: 80,
            requiredActors: ['Sponsor_X']
        }).goal;

        // 路线 B：独立众筹与街头巡展路线
        goal = GR.addAlternativePath(goal, {
            pathId: 'path_indie',
            label: '社区众筹与露天快闪展',
            estimatedCost: 30,
            requiredActors: ['Volunteer_Leader']
        }).goal;

        // 选定商业赞助路线
        goal = GR.selectPath(goal, 'path_commercial').goal;
        assert.equal(goal.activePathId, 'path_commercial');

        const indiePath = goal.alternativePaths.find(p => p.pathId === 'path_indie');
        const commPath = goal.alternativePaths.find(p => p.pathId === 'path_commercial');
        assert.equal(commPath.status, 'active');
        assert.equal(indiePath.status, 'available', '互斥备选路线绝不自动完成');
    });

    test('D2 关键角色退出或资源耗尽时，给出改期/缩减/换线等有据选项，拒绝无依据自动成功', () => {
        let goal = GR.createGoal({
            id: 'g_exhibition',
            title: '举办科技成果独立艺术展',
            budgetRemaining: 5, // 预算严重不足
            commitments: [
                { actor: 'Curator_Li', role: '策展人', status: 'withdrawn', withdrawnReason: '因故离职' }
            ]
        });

        goal = GR.addAlternativePath(goal, {
            pathId: 'path_main',
            label: '原定主线策展方案',
            estimatedCost: 50,
            requiredActors: ['Curator_Li']
        }).goal;
        goal = GR.selectPath(goal, 'path_main').goal;

        // 检测遇阻
        const analysis = GR.detectImpedimentsAndProposeReroutes(goal, {
            withdrawnActors: ['Curator_Li']
        });
        assert.ok(analysis.isBlocked, '必须判定为遇阻');
        assert.ok(analysis.reasons.length >= 2, '包含角色退出与预算耗尽两项依据');
        assert.ok(analysis.candidates.length >= 2, '提出改期与缩小范围等多项改道候选');

        // 应用缩小范围改道
        const rerouteRes = GR.applyReroute(goal, 'cand_reduce_scope', {
            floor: 42,
            rationale: '在现有5点预算下改为精简微型展'
        });
        assert.ok(rerouteRes.ok);
        assert.equal(rerouteRes.goal.status, 'rerouted');
        assert.ok(rerouteRes.goal.title.includes('精简版'));
        assert.equal(rerouteRes.goal.rerouteHistory.length, 1);
    });

    test('D3 放弃后重启目标，完整保留历史代价与尝试，重开依然可查', () => {
        let goal = GR.createGoal({ id: 'g_startup', title: '创立智能音频工作室' });
        // 付出前期代价
        goal = GR.recordCost(goal, { floor: 10, description: '采购二手音频工作站', costAmount: 30 }).goal;
        goal = GR.recordCost(goal, { floor: 18, description: '租用地下室作为录音棚', costAmount: 20 }).goal;
        assert.equal(goal.incurredCosts.length, 2);

        // 因环境突变放弃
        goal = GR.abandonGoal(goal, '因城市改造场地被收回而中止', 25).goal;
        assert.equal(goal.status, 'abandoned');
        assert.equal(goal.historicalAttempts.length, 1);

        // 后来机缘重启
        const restartRes = GR.restartGoal(goal);
        assert.ok(restartRes.ok);
        const restarted = restartRes.goal;
        assert.equal(restarted.status, 'active');
        assert.equal(restarted.incurredCosts.length, 2, '历史付出代价完整保留');
        assert.equal(restarted.historicalAttempts.length, 1, '历史失败尝试完整保留');
    });
});

/* ================================================================
 * E. 扩展项契约（M6-X1 信念演化 / M6-X2 习惯学习 / M6-X7 缺席期待）
 * ================================================================ */
describe('M6-X1 / M6-X2 / M6-X7 行动与心智扩展契约', () => {
    test('E1 M6-X1 信念演化：反证只改知情者，不可靠传闻不强制改观', () => {
        const beliefAlice = CA.createBelief({
            actor: 'Alice',
            subject: 'Bob的为人',
            interpretation: 'Bob为人冷漠傲慢',
            confidence: 0.9
        });

        // 听到不可靠传闻 -> 不改观
        const rumorRes = CA.evolveBelief(beliefAlice, {
            grade: 'rumor',
            content: '街坊传言Bob私下给孤儿院捐款'
        }, 'Alice');
        assert.equal(rumorRes.changed, false);
        assert.equal(rumorRes.belief.interpretation, 'Bob为人冷漠傲慢');

        // 亲眼目睹确凿反证 -> 产生合理改观
        const witnessRes = CA.evolveBelief(beliefAlice, {
            grade: 'witness',
            isCounterEvidence: true,
            content: '亲眼见到Bob在暴雨中脱下外套保护流浪猫并送去救治',
            newInterpretation: 'Bob外表冷峻，实则内心极有温度'
        }, 'Alice');
        assert.equal(witnessRes.changed, true);
        assert.equal(witnessRes.belief.interpretation, 'Bob外表冷峻，实则内心极有温度');
    });

    test('E2 M6-X2 经验与习惯：至少三次稳定实践才定型，情境例外覆盖一般习惯', () => {
        let repo = CA.createHabitRepo({ actor: 'Charlie' });
        // 第一次和第二次实践
        repo = CA.recordPractice(repo, { context: '晨起', approach: '空腹喝冰美式', outcome: 'success' }).repo;
        repo = CA.recordPractice(repo, { context: '晨起', approach: '空腹喝冰美式', outcome: 'success' }).repo;
        assert.equal(repo.habits.length, 0, '两次实践不直接形成永久习惯');

        // 第三次实践触发定型
        const p3 = CA.recordPractice(repo, {
            context: '晨起',
            approach: '空腹喝冰美式',
            exceptionCondition: '胃部不适',
            exceptionApproach: '喝温热小米粥',
            outcome: 'success'
        });
        assert.ok(p3.formedHabit, '三次实践提炼为候选习惯');
        repo = p3.repo;
        assert.equal(repo.habits.length, 1);

        const habit = repo.habits[0];
        // 常规情境遵循一般习惯
        const normalAction = CA.resolveHabitBehavior(habit, { '胃部不适': false });
        assert.equal(normalAction.approach, '空腹喝冰美式');
        assert.equal(normalAction.isException, false);

        // 例外情境覆盖一般习惯
        const exceptAction = CA.resolveHabitBehavior(habit, { '胃部不适': true });
        assert.equal(exceptAction.approach, '喝温热小米粥');
        assert.equal(exceptAction.isException, true);
    });

    test('E3 M6-X7 缺席与期待：剧情时间未到不失约，不知对方日程不能推断恶意', () => {
        const exp = CA.createAbsenceExpectation({
            holder: 'Diana',
            targetActor: 'Edward',
            expectedAction: '按约定送达秘密信件',
            deadlineStoryClock: 100 // 剧情时间100
        });

        // 剧情时钟仅推进到 80，即使现实时间过去很久也不失约
        const r1 = CA.evaluateExpectation(exp, 80);
        assert.equal(r1.status, 'waiting');

        // 剧情时钟到达 110，已超过截止期，但 Diana 不知 Edward 日程
        const r2 = CA.evaluateExpectation(exp, 110, { knowsCounterpartSchedule: false });
        assert.equal(r2.status, 'unconfirmed_delay');
        assert.equal(r2.reason, 'counterpart_schedule_unknown');

        // 收到延迟回应
        const r3 = CA.evaluateExpectation(exp, 120, {
            receivedDelayedMessage: true,
            delayedMessage: '途中遭遇山体滑坡封路，正绕道赶来'
        });
        assert.equal(r3.status, 'delayed_received');
    });
});

/* ================================================================
 * F. CharacterMemoryBank 宿主集成与往返测试
 * ================================================================ */
describe('CharacterMemoryBank 宿主集成', () => {
    test('F1 CharacterMemoryBank 挂载自传、关键抉择与楼层回滚联动', () => {
        // 从 memory-organs 取 CharacterMemoryBank
        const { CharacterMemoryBank } = require('../memory-organs.js');
        const bank = new CharacterMemoryBank();

        const sRes = bank.addLifeStage('luo_jia', {
            id: 'stage_teen',
            name: '县城高中',
            summary: '孤僻冷淡'
        });
        assert.ok(sRes.ok);

        const cRes = bank.recordPivotalChoice('luo_jia', {
            id: 'c_floor_50',
            stageId: 'stage_teen',
            choice: '在第50楼做了重要决定',
            floor: 50,
            consequence: '引发全班轰动'
        });
        assert.ok(cRes.ok);

        const profile = bank.deriveAutobiographicalProfile('luo_jia', { sceneMode: 'present' });
        assert.ok(profile);
        assert.equal(profile.charKey, 'luo_jia');

        // 触发楼层回滚 removeByFloor(50)
        bank.removeByFloor(50);
        const ab = bank.getAutobiography('luo_jia');
        const foundChoice = ab.choices.find(c => c.id === 'c_floor_50');
        assert.equal(foundChoice, undefined, '第50楼的抉择在回滚后被清除');

        // 导出与导入验证
        const exported = bank.export();
        assert.ok(exported.autobiographies);
        assert.ok(exported.autobiographies['luo_jia']);

        const newBank = new CharacterMemoryBank();
        newBank.import(exported);
        const importedAb = newBank.getAutobiography('luo_jia');
        assert.ok(importedAb);
        assert.equal(importedAb.stages.length, 1);
        assert.equal(importedAb.stages[0].id, 'stage_teen');
    });
});

/* ================================================================
 * G. 真实源码破坏负控制（真源码破坏 → 判据必须变红）
 * ================================================================ */
describe('负控制（M6 批次 C 真源码破坏）', () => {
    test('G1 破坏假设性选择过滤 -> 假设性抉择被误写入正史判据变红', () => {
        const anchor = "if (c.isHypothetical) {\n            return { ok: false, reason: 'hypothetical_choice_cannot_be_canonical' };\n        }";
        const repl = "if (false) {\n            return { ok: false, reason: 'hypothetical_choice_cannot_be_canonical' };\n        }";
        const broken = breakSource(abSrc, anchor, repl, 'hypothetical-guard');
        const mod = loadBroken(broken, 'ab_g1');

        let autobio = mod.createAutobiography({ charKey: 'test_char' });
        negative(() => {
            const res = mod.recordPivotalChoice(autobio, {
                id: 'ch_hypo',
                choice: '假设的世界',
                isHypothetical: true
            });
            return res.ok === false;
        }, 'G1 假设性选择被拦截');
    });

    test('G2 破坏单侧修复和解防护 -> 未知情单侧道歉误判为已和解变红', () => {
        const anchor = "reconciliationStatus = 'unilateral_repair_in_transit';\n                unilateralPending = true;\n                isReconciled = false;";
        const repl = "reconciliationStatus = 'reconciled';\n                unilateralPending = false;\n                isReconciled = true;";
        const broken = breakSource(rdSrc, anchor, repl, 'unilateral-repair-guard');
        const mod = loadBroken(broken, 'rd_g2');

        const dyn = mod.createRelationDynamics({
            charA: 'Alice',
            charB: 'Bob',
            repairAttempts: [{
                id: 'r1',
                initiator: 'Alice',
                target: 'Bob',
                gesture: '道歉',
                receivedByCounterpart: false,
                acceptedByCounterpart: false
            }]
        });
        negative(() => mod.deriveRelationDynamics(dyn).isReconciled === false, 'G2 未送达道歉不得判和解');
    });

    test('G3 破坏互斥备选路线隔离 -> 选择路线A导致路线B也被标为已完成变红', () => {
        const anchor = "p.status = 'available';";
        const repl = "p.status = 'completed';";
        const broken = breakSource(grSrc, anchor, repl, 'mutex-path-isolation');
        const mod = loadBroken(broken, 'gr_g3');

        let goal = mod.createGoal({ id: 'g1' });
        goal = mod.addAlternativePath(goal, { pathId: 'p1', label: '路线1' }).goal;
        goal = mod.addAlternativePath(goal, { pathId: 'p2', label: '路线2' }).goal;
        goal = mod.selectPath(goal, 'p2').goal; // 先激活路线2
        goal = mod.selectPath(goal, 'p1').goal; // 切换至路线1，路线2应退回available

        negative(() => {
            const p2 = goal.alternativePaths.find(p => p.pathId === 'p2');
            return p2.status !== 'completed';
        }, 'G3 互斥路线B不应被标记为completed');
    });
});
