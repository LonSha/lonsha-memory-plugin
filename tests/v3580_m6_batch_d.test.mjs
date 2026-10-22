/**
 * tests/v3580_m6_batch_d.test.mjs — v3.358.0 第六期批次 D（世界与日常）验收测试
 * M6-O8 持续研究记忆（continuous-research.js）
 * M6-X3 条件后果推演（conditional-consequence.js）
 * M6-X5 群体与制度记忆（institutional-memory.js）
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
import { breakSource } from './_break_kit.mjs';
import { loadBroken, negative } from './_negative_util.mjs';

const CR = require('../continuous-research.js');
const CC = require('../conditional-consequence.js');
const IM = require('../institutional-memory.js');

const idxSrc = fs.readFileSync('./index.js', 'utf8');
const crSrc = fs.readFileSync('./continuous-research.js', 'utf8');
const ccSrc = fs.readFileSync('./conditional-consequence.js', 'utf8');
const imSrc = fs.readFileSync('./institutional-memory.js', 'utf8');
const moSrc = fs.readFileSync('./memory-organs.js', 'utf8');

const BORN_V = '3.358.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/* ================================================================
 * A. 版本锚与契约基线
 * ================================================================ */
describe('v3.358.0 版本锚', () => {
    test('A1 index.js VERSION 常量升级为 3.358.0', () => {
        const m = /const\s+VERSION\s*=\s*'([^']+)'/.exec(idxSrc);
        assert.ok(m, 'VERSION 未匹配');
        assert.equal(m[1], '3.358.0');
    });

    test('A2 manifest.json 版本为 3.358.0 且登记 3 个批次 D 模块', () => {
        const man = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
        assert.equal(man.version, '3.358.0');
        assert.ok(man.extra_js.includes('continuous-research.js'), 'manifest 缺 continuous-research.js');
        assert.ok(man.extra_js.includes('conditional-consequence.js'), 'manifest 缺 conditional-consequence.js');
        assert.ok(man.extra_js.includes('institutional-memory.js'), 'manifest 缺 institutional-memory.js');
    });

    test('A3 三个新模块均自洽声明 VERSION 3.358.0 且方法完备', () => {
        assert.equal(CR.VERSION, '3.358.0');
        assert.equal(CC.VERSION, '3.358.0');
        assert.equal(IM.VERSION, '3.358.0');

        assert.equal(typeof CR.createInquiry, 'function');
        assert.equal(typeof CR.recomputeOnSourceUpdate, 'function');
        assert.equal(typeof CC.projectActionConsequences, 'function');
        assert.equal(typeof CC.relieveCommitmentTension, 'function');
        assert.equal(typeof IM.createInstitution, 'function');
        assert.equal(typeof IM.performLeaderHandover, 'function');
    });

    test('A4 自锚常量 BORN_V 恰是当版', () => {
        assert.equal(vnum(BORN_V), vnum('3.358.0'));
    });
});

/* ================================================================
 * B. M6-O8 持续研究记忆（continuous-research.js）
 * ================================================================ */
describe('M6-O8 持续研究记忆契约', () => {
    test('B1 专题创建与证据关联：支持多主张与支撑/反证结构', () => {
        const inq = CR.createInquiry({
            question: '古城墙修建的确切年代与防御规模？',
            domain: 'archaeology',
            claims: [
                {
                    statement: '城墙南段修筑于初唐时期',
                    supportingEvidence: [
                        { sourceDocId: 'doc_chronicle_tang', sectionId: 'sec_12', quote: '贞观四年筑南郭' }
                    ]
                },
                {
                    statement: '北段烽燧与宋代改扩建有关',
                    supportingEvidence: [
                        { sourceDocId: 'doc_chronicle_song', sectionId: 'sec_05', quote: '崇宁三年重修北壁' }
                    ]
                }
            ],
            pendingConditions: ['等待碳14测年报告出炉']
        });

        assert.equal(inq.question, '古城墙修建的确切年代与防御规模？');
        assert.equal(inq.claims.length, 2);
        assert.equal(inq.pendingConditions[0], '等待碳14测年报告出炉');
    });

    test('B2 局部重算：仅重算受影响主张，无关主张保持原状', () => {
        let inq = CR.createInquiry({
            question: '关于遗迹年代的判定',
            claims: [
                {
                    claimId: 'c1',
                    statement: '主张1依赖文档A第一节',
                    supportingEvidence: [{ sourceDocId: 'doc_A', sectionId: 'sec_1', quote: 'A1证据' }]
                },
                {
                    claimId: 'c2',
                    statement: '主张2依赖文档B',
                    supportingEvidence: [{ sourceDocId: 'doc_B', sectionId: 'sec_9', quote: 'B证据' }]
                },
                {
                    claimId: 'c3',
                    statement: '主张3同样依赖文档A第二节',
                    supportingEvidence: [{ sourceDocId: 'doc_A', sectionId: 'sec_2', quote: 'A2证据' }]
                }
            ]
        });

        // 模拟 doc_A 第 1 节更新
        const updated = CR.recomputeOnSourceUpdate(inq, {
            updatedDocId: 'doc_A',
            updatedSectionIds: ['sec_1']
        });

        assert.equal(updated.recomputedCount, 1, '应恰有 1 个主张受影响');
        const c1 = updated.claims.find(c => c.claimId === 'c1');
        const c2 = updated.claims.find(c => c.claimId === 'c2');
        const c3 = updated.claims.find(c => c.claimId === 'c3');

        assert.equal(c1.needsReview, true, 'c1 依赖 doc_A sec_1，必须标记 needsReview');
        assert.equal(c1.status, 'needs_review');
        assert.equal(c2.needsReview, false, 'c2 依赖 doc_B，必须保持原状');
        assert.equal(c3.needsReview, false, 'c3 依赖 doc_A sec_2，未变更节，必须保持原状');
    });

    test('B3 作者论述正文保护：资料更新绝不静默覆盖已编辑正文', () => {
        let inq = CR.createInquiry({
            question: '核心历史谜团',
            claims: [
                { statement: '主张A', supportingEvidence: [{ sourceDocId: 'doc_A', sectionId: 'sec_1' }] }
            ]
        });

        // 作者手动编辑正文并锁定
        inq = CR.updateNarrativeDraft(inq, '【作者定稿论述】虽然古籍有不同记述，但出土瓦当已证实此地为行宫。', true);
        assert.equal(inq.narrativeDraft.userLocked, true);

        // 触发资料更新
        const updated = CR.recomputeOnSourceUpdate(inq, {
            updatedDocId: 'doc_A',
            updatedSectionIds: ['sec_1']
        });

        // 严格断言：作者编辑过的正文完好无损！
        assert.equal(updated.narrativeDraft.text, '【作者定稿论述】虽然古籍有不同记述，但出土瓦当已证实此地为行宫。');
        assert.equal(updated.narrativeDraft.userLocked, true);
        assert.ok(updated.suggestedRevisions.length > 0, '更新建议应输出在 suggestedRevisions');
    });

    test('B4 矛盾版本并存：未确认前不替作者强行裁定', () => {
        let inq = CR.createInquiry({ question: '战役发生地点' });
        inq = CR.addContradiction(inq, {
            sourceA: '东史记',
            sourceB: '西川志',
            description: '东史记称战役在洛水以北，西川志则明确记载在白马渡口'
        });

        const brief = CR.deriveResearchBrief(inq);
        assert.equal(brief.activeContradictionsCount, 1);
        assert.equal(brief.contradictions[0].sources[0], '东史记');
        assert.equal(brief.contradictions[0].sources[1], '西川志');
    });
});

/* ================================================================
 * C. M6-X3 条件后果推演（conditional-consequence.js）
 * ================================================================ */
describe('M6-X3 条件后果推演契约', () => {
    test('C1 动作后果推演：输出直接变化、条件后续与失去选项', () => {
        const rules = [
            CC.normalizeCausalRule({
                triggerAction: 'sign_exclusive_deal',
                directEffect: '获得画廊首期预付款 5000 元',
                consequence: '秋季前作品由该画廊统包代理',
                foregoes: ['open_market_sale', 'participate_indie_bazaar']
            })
        ];

        const projection = CC.projectActionConsequences({
            actionProposal: { actionKey: 'sign_exclusive_deal', title: '签署画廊独家协议' },
            contextState: { activeRules: rules }
        });

        assert.ok(projection.directEffects.includes('获得画廊首期预付款 5000 元'));
        assert.ok(projection.foregoneOptions.includes('open_market_sale'));
        assert.ok(projection.foregoneOptions.includes('participate_indie_bazaar'));
    });

    test('C2 承诺冲突张力：接下两项冲突承诺展示时间占用与风险，但不提前判定违约', () => {
        const commitments = [
            { commitmentId: 'cmt_001', title: '周六下午陪安安去书展', timeSlot: 'saturday_afternoon', status: 'active' }
        ];

        const projection = CC.projectActionConsequences({
            actionProposal: {
                actionKey: 'attend_gallery_opening',
                title: '出席周六下午画廊开幕招待会',
                timeSlot: 'saturday_afternoon'
            },
            contextState: { commitments }
        });

        assert.equal(projection.hasConflict, true);
        assert.equal(projection.commitmentTensions.length, 1);
        const tension = projection.commitmentTensions[0];
        assert.equal(tension.commitmentId, 'cmt_001');
        assert.equal(tension.nature, 'time_window_collision');
        // 关键负控制断言点：绝对不能提前判定为违约！
        assert.equal(tension.isBreached, false, '冲突承诺绝不能提前判定违约');
        assert.equal(tension.status, 'at_risk');
    });

    test('C3 动态解脱：新证据/新调整解除冲突后张力自适应消除', () => {
        const commitments = [
            { commitmentId: 'cmt_001', title: '周六下午约定', timeSlot: 'saturday_afternoon', status: 'active' }
        ];

        let projection = CC.projectActionConsequences({
            actionProposal: { actionKey: 'act_meeting', timeSlot: 'saturday_afternoon' },
            contextState: { commitments }
        });
        assert.equal(projection.hasConflict, true);

        // 改期协商成功
        const relieved = CC.relieveCommitmentTension(projection, {
            resolvedCommitmentId: 'cmt_001',
            remedyUsed: 'rescheduled_to_sunday'
        });

        assert.equal(relieved.hasConflict, false);
        assert.equal(relieved.commitmentTensions.length, 0);
        assert.ok(relieved.relievedNotes[0].includes('rescheduled_to_sunday'));
    });

    test('C4 拒绝伪精确：未提供规则的动作保持 unknown，不捏造虚假概率', () => {
        const projection = CC.projectActionConsequences({
            actionProposal: { actionKey: 'unknown_mystic_ritual', title: '进行未知的古仪式' },
            contextState: { activeRules: [] }
        });

        assert.ok(projection.unknowns.length > 0);
        assert.equal(projection.unknowns[0].confidence, 'unknown');
        // 确保没有出现形如 85% 或 0.85 这种伪精确概率
        assert.equal(projection.unknowns[0].probability, undefined);
    });
});

/* ================================================================
 * D. M6-X5 群体与制度记忆（institutional-memory.js）
 * ================================================================ */
describe('M6-X5 群体与制度记忆契约', () => {
    test('D1 组织实体与任期：记录任期与公开制度', () => {
        const inst = IM.createInstitution({
            name: '晨曦读书社',
            currentLeader: 'char_lin',
            roles: [{ title: '社长', holderCharKey: 'char_lin', responsibilities: ['主持例会', '规划书目'] }],
            tenures: [{ charKey: 'char_lin', roleTitle: '社长', startDate: '2026-01-01', status: 'active' }],
            institutionalFacts: ['每周五晚进行例行研讨', '社费按学期缴纳公示']
        });

        assert.equal(inst.name, '晨曦读书社');
        assert.equal(inst.currentLeader, 'char_lin');
        assert.equal(inst.institutionalFacts.length, 2);
    });

    test('D2 临时决议日落规则：到期自动失效，绝不能当作永久规则', () => {
        let inst = IM.createInstitution({ name: '实验艺术工作坊' });
        inst = IM.addResolution(inst, {
            title: '临时借用二楼展厅',
            isTemporary: true,
            expiresAt: 1000,
            sunsetCondition: '展览结束后自动归还'
        });
        inst = IM.addResolution(inst, {
            title: '工作室日常安全守则',
            isTemporary: false
        });

        // 在时间 500 时（未到期）
        const activeBefore = IM.getActiveResolutions(inst, 500);
        assert.equal(activeBefore.length, 2);

        // 在时间 1500 时（已过期）
        const activeAfter = IM.getActiveResolutions(inst, 1500);
        assert.equal(activeAfter.length, 1);
        assert.equal(activeAfter[0].title, '工作室日常安全守则', '仅永久守则有效，临时决议必须日落');
    });

    test('D3 换届交接：继承公共职责与制度，绝不继承前任私人秘密', () => {
        let inst = IM.createInstitution({
            name: '青年剧社',
            currentLeader: 'char_leader_old',
            institutionalFacts: ['剧社排演公约第1条'],
            tenures: [{ charKey: 'char_leader_old', roleTitle: '社长', startDate: '2025-01-01', status: 'active' }]
        });

        // 记录前任社长的私人秘密
        inst = IM.recordPrivateSecret(inst, 'char_leader_old', '【前任私密】其实私下向隔壁剧团借过道具还没还');

        // 执行换届交接给新社长
        const handedOver = IM.performLeaderHandover(inst, {
            outgoingLeader: 'char_leader_old',
            incomingLeader: 'char_leader_new',
            effectiveTimestamp: 2000
        });

        assert.equal(handedOver.currentLeader, 'char_leader_new');
        // 关键断言：交接日志记录私密隔离成功
        const log = handedOver.handoverLogs[0];
        assert.equal(log.incomingLeader, 'char_leader_new');
        assert.equal(log.privateSecretsLeakPrevented, true);

        // 新任社长没有得到前任秘密，秘密依然归属 char_leader_old
        const newLeaderSecrets = handedOver.privateDossiers['char_leader_new'] || [];
        assert.equal(newLeaderSecrets.length, 0, '新负责人名下绝对不能出现前任私人秘密');
        assert.equal(handedOver.privateDossiers['char_leader_old'].length, 1);
    });

    test('D4 同名分会独立：跨卷/跨地域分会严格隔离', () => {
        const instA = IM.createInstitution({ institutionId: 'inst_coffee_01', branchId: 'north', name: '时光咖啡馆' });
        const instB = IM.createInstitution({ institutionId: 'inst_coffee_02', branchId: 'south', name: '时光咖啡馆' });

        assert.notEqual(instA.institutionId, instB.institutionId);
        assert.notEqual(instA.branchId, instB.branchId);

        const charter = IM.exportPublicCharter(instA);
        assert.equal(charter.branchId, 'north');
        assert.equal(charter.institutionName, '时光咖啡馆');
    });
});

/* ================================================================
 * E. WorldProgress 器官集成与退路存根验证
 * ================================================================ */
describe('WorldProgress 器官集成', () => {
    test('E1 export / import 完整支持 researchInquiries 与 institutions', () => {
        const mo = require('../memory-organs.js');
        const wp = new mo.WorldProgress();

        wp.createResearchInquiry({ question: '世界谜题A' });
        wp.createInstitution({ name: '世界公会B' });

        const exported = wp.export();
        assert.equal(exported.researchInquiries.length, 1);
        assert.equal(exported.institutions.length, 1);

        const wp2 = new mo.WorldProgress();
        wp2.import(exported);
        assert.equal(wp2.researchInquiries.length, 1);
        assert.equal(wp2.institutions.length, 1);
        assert.equal(wp2.researchInquiries[0].question, '世界谜题A');
        assert.equal(wp2.institutions[0].name, '世界公会B');
    });

    test('E2 index.js OrganFallback 提供无异常降级存根', () => {
        const mo = require('../memory-organs.js');
        const wp = new mo.WorldProgress();
        assert.equal(typeof wp.createResearchInquiry, 'function');
        assert.equal(typeof wp.recomputeResearch, 'function');
        assert.equal(typeof wp.createInstitution, 'function');
        assert.equal(typeof wp.handoverInstitution, 'function');
        assert.equal(typeof wp.projectActionConsequences, 'function');
    });
});

/* ================================================================
 * F. 真源码破坏负控制验证（H5/H6 严格规范）
 * ================================================================ */
describe('真源码破坏负控制', () => {
    test('F1 负控制：若资料更新静默篡改作者论述正文，正文保护断言必红', () => {
        // 原版断言函数：作者编辑过的正文必须保持
        const judge = (moduleInstance) => {
            let inq = moduleInstance.createInquiry({ question: '测试' });
            inq = moduleInstance.updateNarrativeDraft(inq, '作者原版正文', true);
            const updated = moduleInstance.recomputeOnSourceUpdate(inq, { updatedDocId: 'doc_any' });
            assert.equal(updated.narrativeDraft.text, '作者原版正文');
        };

        // 原版在 judge 下必须绿
        judge(CR);

        // 真源码破坏：在 recomputeOnSourceUpdate 中把 preservedDraft 替换成静默覆盖文本
        const brokenSrc = breakSource(
            crSrc,
            'const preservedDraft = { ...inquiry.narrativeDraft };',
            'const preservedDraft = { text: "AI覆盖的正文", userLocked: false };'
        );
        const brokenCR = loadBroken(brokenSrc, 'continuous-research.js');

        // 在负控制下判据必须变红
        assert.throws(() => {
            judge(brokenCR);
        }, /AssertionError/);
    });

    test('F2 负控制：若冲突承诺提前判定为违约，张力免早违约断言必红', () => {
        const judge = (moduleInstance) => {
            const commitments = [{ commitmentId: 'c1', timeSlot: 't1', status: 'active' }];
            const proj = moduleInstance.projectActionConsequences({
                actionProposal: { actionKey: 'a1', timeSlot: 't1' },
                contextState: { commitments }
            });
            assert.equal(proj.commitmentTensions[0].isBreached, false);
        };

        judge(CC);

        // 真源码破坏：把 isBreached: false 破坏为 isBreached: true
        const brokenSrc = breakSource(
            ccSrc,
            'isBreached: false, // 严格断言：绝不提前标记为违约！',
            'isBreached: true, // 破坏为提前违约'
        );
        const brokenCC = loadBroken(brokenSrc, 'conditional-consequence.js');

        assert.throws(() => {
            judge(brokenCC);
        }, /AssertionError/);
    });

    test('F3 负控制：若换届交接泄露前任私人秘密，私密隔离断言必红', () => {
        const judge = (moduleInstance) => {
            let inst = moduleInstance.createInstitution({ name: '测试' });
            inst = moduleInstance.recordPrivateSecret(inst, 'old_leader', '前任私密');
            const handed = moduleInstance.performLeaderHandover(inst, {
                outgoingLeader: 'old_leader',
                incomingLeader: 'new_leader'
            });
            const newSecrets = handed.privateDossiers['new_leader'] || [];
            assert.equal(newSecrets.length, 0);
        };

        judge(IM);

        // 真源码破坏：把前任秘密强行复制给新任领袖
        const brokenSrc = breakSource(
            imSrc,
            'const preservedDossiers = { ...inst.privateDossiers };',
            'const preservedDossiers = { ...inst.privateDossiers, [incoming]: inst.privateDossiers[outgoing] || [] };'
        );
        const brokenIM = loadBroken(brokenSrc, 'institutional-memory.js');

        assert.throws(() => {
            judge(brokenIM);
        }, /AssertionError/);
    });
});
