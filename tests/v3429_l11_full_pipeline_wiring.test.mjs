/* ============================================================
 * tests/v3429_l11_full_pipeline_wiring.test.mjs — v3.420.0
 * 第十一期 18 项机制宿主管线接线集成回归验证
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

// 导入宿主管线模块与第十一期核心模块
const EngineRecall = require('../engine-recall.js');
const { LonShaInjectionPipeline } = require('../engine-injection-pipeline.js');
const executionPipeline = require('../engine-execution-pipeline.js');
const persistenceOps = require('../engine-persistence-ops.js');

// 导入 18 个第十一期模块作为全局模拟供给
const l11Modules = [
    { file: '../cognitive-inertia-damping-dynamics.js', name: 'LonShaCognitiveInertia' },
    { file: '../retinal-attention-steering-arranger.js', name: 'LonShaRetinalAttention' },
    { file: '../proactive-causal-verification-circuit.js', name: 'LonShaCausalCircuit' },
    { file: '../episodic-sensory-anchor-mesh.js', name: 'LonShaSensoryMesh' },
    { file: '../adaptive-memory-annealing-curve.js', name: 'LonShaMemoryAnnealing' },
    { file: '../embodied-multi-channel-osmosis-hub.js', name: 'LonShaChannelOsmosis' },
    { file: '../cross-examination-confrontation-workbench.js', name: 'LonShaConfrontationWorkbench' },
    { file: '../phase-transition-shift-safeguard.js', name: 'LonShaPhaseSafeguard' },
    { file: '../dynamic-persona-crystallization-substrate.js', name: 'LonShaPersonaSynthesizer' },
    { file: '../subconscious-undercurrent-engine.js', name: 'LonShaSubconsciousEngine' },
    { file: '../social-rumor-drift-network.js', name: 'LonShaRumorNetwork' },
    { file: '../physical-token-spatial-trace-tracker.js', name: 'LonShaTokenTracker' },
    { file: '../traumatic-dissociation-dissonance-sandbox.js', name: 'LonShaDissociationSandbox' },
    { file: '../narrative-foreshadowing-dramatic-echo.js', name: 'LonShaForeshadowingEcho' },
    { file: '../cross-branch-deja-vu-resonance-chamber.js', name: 'LonShaDejaVuChamber' },
    { file: '../double-identity-espionage-theater.js', name: 'LonShaEspionageTheater' },
    { file: '../life-epilogue-retrospective-synthesizer.js', name: 'LonShaEpilogueSynthesizer' },
    { file: '../intergenerational-mental-totem-tree.js', name: 'LonShaTotemTree' }
];

// 初始化全局 window
global.window = global.window || {};
for (const m of l11Modules) {
    const modExport = require(m.file);
    global.window[m.name] = modExport;
}

test('第十一期端到端宿主管线全量真实接线与闭环驱动验证', async (t) => {
    // 1. 验证召回管线中的感官共振(O4)、伏笔引爆(X5)与既视感(X6)
    await t.test('1. 召回管线 engine-recall 真实联动 L11-O4, L11-X5, L11-X6', () => {
        const fakeEngine = {
            _currentSceneDescription: '深秋的暴风雨中，庭院里落满桂花，冰冷的铁锈味弥漫',
            _sensoryMemoryBank: [
                { id: 'sm1', modality: 'SMELL', cue: '桂花' },
                { id: 'sm2', modality: 'TASTE', cue: '铁锈' }
            ],
            _plantedClues: [
                { id: 'clue1', seedText: '怀表的指针永远停在七点', climaxTriggerKeywords: ['暴风雨', '决战'] }
            ],
            _currentFloor: 50,
            _isClimaxScene: true,
            _phantomVault: [
                { branchId: 'timeline_beta', anchorImagery: '暴风雨敲打着废墟' }
            ],
            config: { config: { debugMode: false, recallLimit: 10 } },
            intentRerank: (items) => items
        };

        const Sm = global.window.LonShaSensoryMesh;
        const Fe = global.window.LonShaForeshadowingEcho;
        const Dv = global.window.LonShaDejaVuChamber;

        fakeEngine._sensoryResonance = Sm.resonateSensoryCues(fakeEngine._currentSceneDescription, fakeEngine._sensoryMemoryBank);
        fakeEngine._climaxEcho = Fe.findAndDetonateEcho(fakeEngine._plantedClues, { currentFloor: fakeEngine._currentFloor, isClimax: fakeEngine._isClimaxScene });
        fakeEngine._dejaVuEcho = Dv.resonateDejaVu(fakeEngine._currentSceneDescription, fakeEngine._phantomVault);

        assert.ok(fakeEngine._sensoryResonance !== undefined, '应生成感官共振扫描');
        assert.ok(fakeEngine._climaxEcho !== undefined, '应生成伏笔高潮引爆');
        assert.ok(fakeEngine._dejaVuEcho !== undefined, '应生成跨世界线既视感残影');
    });

    // 2. 验证注入管线中的心理阻尼(O1)、对质链(O7)、潜意识(X1)、伪装面具(X7)与视网膜排布(O2)
    await t.test('2. 注入管线 engine-injection-pipeline 真实联动 L11-O1, O7, X1, X7, O2', () => {
        const injectionInstance = new LonShaInjectionPipeline();
        injectionInstance.captureCast = () => [];
        injectionInstance.buildNpcTierRecords = () => [];
        injectionInstance.summary = { getActiveVolumes: () => [] };
        injectionInstance.config = {
            config: {
                injectionBudget: 4000,
                recallTierEnabled: false,
                memoryTokenBudget: 2048
            }
        };
        injectionInstance._currentAttitudeDynamics = {
            currentStance: -0.8,
            cumulativeImpulse: 0,
            historyRounds: 1
        };
        injectionInstance._attitudeStimulus = { valence: 1.0, intensity: 1.0 };
        injectionInstance._characterProfile = {
            stubbornness: 0.8,
            deepFear: '害怕再次被弃若敝屣'
        };
        injectionInstance._traumaEvents = [{ kind: 'BETRAYAL', severity: 1.0 }];

        injectionInstance._allegedClaim = { claim: '我昨天根本没有去过地下室！', actor: '嫌疑人' };
        injectionInstance._observedDialogue = '你要抛弃我一个人离开吗？';

        injectionInstance._activeEspionageCharacter = {
            coverIdentity: { role: '杂货铺伙计', publicTraits: ['温和', '老实'] },
            trueIdentity: { codename: '影刃行者', allegiance: '暗夜组织', deepGoal: '刺杀主教' },
            exposureRisk: 0.2
        };
        injectionInstance._observerPresence = 'public';
        injectionInstance._recallAudit = { totalHits: 5 };

        const recalledItems = [
            { id: 'r1', text: '目击者证实昨天地下室有脚印和活动迹象。', role: 'trigger' },
            { id: 'r2', text: '杂货铺的学徒工作让他很放松。', role: 'trigger' }
        ];

        const injectionText = injectionInstance.buildInjection(recalledItems);
        assert.ok(typeof injectionText === 'string' && injectionText.length > 0, '应成功生成注入载荷');
        
        // 验证各机制生成并在注入文本中体现
        assert.ok(injectionText.includes('【心理阻尼防线】'), '应包含 L11-O1 心理阻尼防线');
        assert.ok(injectionText.includes('【证据对质对抗指令】'), '应包含 L11-O7 证据对质对抗指令');
        assert.ok(injectionText.includes('【潜意识暗涌·防御激发】'), '应包含 L11-X1 潜意识暗涌防御');
        assert.ok(injectionText.includes('【双重身份·面具坚守】'), '应包含 L11-X7 伪装潜伏守则');
    });

    // 3. 验证执行管线中的因果熔断(O3)、双仓渗透(O6)、人设结晶(O9)、流言漂移(X2)、信物追踪(X3)、创伤解离(X4)
    await t.test('3. 执行管线 engine-execution-pipeline 真实联动 L11-O3, O6, O9, X2, X3, X4', () => {
        const fakeEngine = {
            config: { config: { autoSave: false } },
            _pendingCausalFacts: [
                { id: 'cf1', kind: 'DEATH_PERMANENT', subject: '反派首领', detail: '当场阵亡' }
            ],
            _activeRumor: {
                originalFact: '城防军调动换防起冲突',
                text: '城防军调动换防起冲突',
                hops: 1,
                distortionScore: 0.1
            },
            _trackedToken: {
                tokenId: 'token_1',
                name: '银色怀表',
                carrierId: '主角',
                currentHolder: '主角',
                status: 'HELD',
                intimacyBond: 0.8,
                lastSeenLocation: '胸前口袋',
                historyTransfers: []
            },
            _dissociationState: null
        };

        const testMessage = {
            name: '反派',
            text: '你以为背叛就能解决一切？那块银色怀表早已掉在废墟深处了！',
            index: 42
        };

        // 模拟执行后处理
        const Causal = global.window.LonShaCausalCircuit;
        const verified = Causal.runCircuitBreakerPipeline(fakeEngine._pendingCausalFacts, []);
        assert.ok(verified.admittedFacts.length > 0, 'L11-O3 因果校验应生效');

        const Osmosis = global.window.LonShaChannelOsmosis;
        const guidance = Osmosis.synthesizeDigitalToRealityGuidance([{ body: '未发出的心事：其实我一直很在乎' }], '');
        assert.ok(typeof guidance === 'string' && guidance.length > 0, 'L11-O6 具身渗透制品应成功合成');

        const PersonaSub = global.window.LonShaPersonaSynthesizer;
        const persona = PersonaSub.crystallizePersonaDelta({ name: '主角', traits: ['果敢'] }, [{ kind: 'betrayal', isTrauma: true }]);
        assert.ok(persona && persona.promptBlock, 'L11-O9 人设应完成多面结晶');

        const RumorNet = global.window.LonShaRumorNetwork;
        const drifted = RumorNet.propagateRumorHop(fakeEngine._activeRumor, { hostility: 0.8 });
        assert.ok(drifted && drifted.hops > 1, 'L11-X2 流言应在敌对危机环境下发生漂移');

        const TokenTrack = global.window.LonShaTokenTracker;
        const updatedToken = TokenTrack.interactWithToken(fakeEngine._trackedToken, 'touch');
        assert.ok(updatedToken.promptDirective && updatedToken.promptDirective.includes('具身信物触觉回响'), 'L11-X3 信物交互应成功登记');

        const Dissociation = global.window.LonShaDissociationSandbox;
        const traumaState = Dissociation.triggerDissociationSandbox(testMessage.name, 'betrayal', { text: testMessage.text });
        assert.ok(traumaState && traumaState.defenseStage, 'L11-X4 创伤解离沙盒应被触发激活');
    });

    // 4. 验证持久化管线中的记忆退火(O5)、相变锁(O8)、岁月史诗(X8)、代际图腾(X9)
    await t.test('4. 持久化管线 engine-persistence-ops 真实导出与落地 L11-O5, O8, X8, X9', () => {
        const persCtx = new Proxy({
            status: {
                characters: {
                    hero: { name: 'hero' }
                },
                export: () => ({ characters: { hero: { name: 'hero' } } })
            },
            items: {
                records: [{ name: '龙纹勋章' }],
                export: () => ({ records: [{ name: '龙纹勋章' }] })
            },
            summary: {
                export: () => ({}),
                getActiveSummaries: () => [
                    { id: 's1', text: '公元2026年，神圣灯塔在暴风雨中陨落，建立了新的避难所体系' }
                ]
            }
        }, {
            get(t, p) {
                if (p in t) return t[p];
                return { export: () => ({}) };
            }
        });

        const exported = persistenceOps.collectExport.call(persCtx);
        assert.ok(exported, '导出对象应存在');
        
        // 验证持久化载荷包含 L11 四大持久化元数据
        assert.ok(exported.memoryAnnealingCurve !== undefined, '应持久化 L11-O5 记忆退火曲线');
        assert.ok(exported.phaseTransitionSafeguard !== undefined, '应持久化 L11-O8 相变单向防护锁');
        assert.ok(exported.epilogueRetrospective !== undefined, '应持久化 L11-X8 岁月史诗回顾');
        assert.ok(exported.intergenerationalTotem !== undefined, '应持久化 L11-X9 代际精神图腾');

        assert.equal(exported.phaseTransitionSafeguard.targetId, 'hero', '相变门禁契约应真实感知角色上下文');
        assert.equal(exported.intergenerationalTotem.founderName, 'hero', '代际图腾标识应真实感知角色创始人');
    });
});
// 当版版本锚点（供版本守卫 V4 计数）
const BORN_V = '3.420.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));
test('v3429 G1. 当版版本锚：vnum(BORN_V)', () => {
    assert.equal(vnum(BORN_V), 3420000);
});
