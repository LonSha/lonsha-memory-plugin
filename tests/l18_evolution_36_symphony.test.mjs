import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

/* [v3.461.0] 取类形态随 UMD 转换对齐：这些引擎从 ESM（export default）转回仓内统一
 *   UMD/IIFE 后，CJS 侧直接 `module.exports = 类`（同 ego-defense-mechanisms-engine.js），
 *   再取 `.default` 就拿到 undefined —— 这才是本轮 6 条断言集体 `X is not a constructor` 的原因。
 *   ★ 兼容两种形态：`m && m.default ? m.default : m`。不写死单形态，是为了让「以后谁再
 *   把它改回 ESM」也不会当场把测试炸掉（形态之争归形态判据，不归本用例）。 */
const pick = (m) => (m && m.default) ? m.default : m;
const Orchestrator = pick(require('../memory-symphony-orchestrator.js'));
const Scheduler = pick(require('../engine-symphony-wave-scheduler.js'));
const Hebbian = pick(require('../biomimetic-hebbian-salience-curator.js'));
const Epiphany = pick(require('../active-reminiscence-epiphany-engine.js'));
const MoodResidue = pick(require('../emotional-inertia-mood-residue-engine.js'));
const CovenantBreach = pick(require('../long-term-covenant-breach-resonator.js'));
const Catharsis = pick(require('../dramatic-reveal-catharsis-hub.js'));
test("[LonSha] 36项演化双计划 · 核心引擎水合与管线协同综合校验", async (t) => {
    await t.test("波纹调度器与微任务池状态机导出与水合", () => {
        const scheduler = new Scheduler({ timeSliceMs: 30 });
        scheduler.enqueueTask("task1", () => 42);
        const state = scheduler.exportState();
        assert.ok(state.queue.length > 0);
        
        const restored = new Scheduler();
        restored.hydrateState(state);
        assert.equal(restored.queue.length, 1);
    });

    await t.test("触景生情主动顿悟机制测试", () => {
        const epiphany = new Epiphany();
        epiphany.registerAssociation("红围巾", "mem_101", "那是三年前在暴风雪车站的诀别");
        const res = epiphany.probeCuesInDialogue("走在寒风中，她系紧了那条鲜艳的红围巾...", 5);
        assert.ok(res.triggered);
        assert.match(res.promptDirective, /【触景生情·潜意识联想】/);
        assert.match(res.promptDirective, /红围巾/);
    });

    await t.test("情绪余震阻尼衰减与舞台动作生成", () => {
        const mood = new MoodResidue();
        mood.injectEmotionalShock("anger", 0.9, "愤怒背叛");
        const res = mood.getCurrentResidueSummary();
        assert.ok(res);
        assert.match(res.promptDirective, /【心境余震·anger/);
    });

    await t.test("长期誓约违背反噬与信任冰川", () => {
        const covenant = new CovenantBreach();
        covenant.forgeCovenant("cov_default", "永远不向外人透露藏匿点", ["主角", "神秘人"]);
        const res = covenant.judgeBreachOrFulfill("cov_default", "breach", "秘密已泄露给黑帮");
        assert.ok(res);
        assert.match(res.promptDirective, /【誓约碎裂·因果反噬/);
    });

    await t.test("全域交响编排中枢对全部18大新引擎的接线挂载闭环", () => {
        const engineMock = {
            _causalCircuitLib: () => null,
            _antiConfusionLib: () => null,
            getUserName: () => "你",
            getKnownCharacters: () => ["爱丽丝", "神秘人"],
            getCurrentFloor: () => 150,
            _activeReminiscenceEngine: new Epiphany(),
            _moodResidueEngine: new MoodResidue(),
            _covenantBreachEngine: new CovenantBreach()
        };
        engineMock._activeReminiscenceEngine.registerAssociation("旧怀表", "mem_202", "父亲在停电夜晚留下的遗物");
        engineMock._moodResidueEngine.injectEmotionalShock("sorrow", 0.8, "翻出遗物");
        
        const res = Orchestrator.orchestrateMemorySymphony(engineMock, [], { text: "他默默掏出了那枚旧怀表，指针已经停了..." });
        assert.ok(res);
        assert.ok(res.directives.includes("【触景生情·潜意识联想】"));
        assert.ok(res.directives.includes("【心境余震·sorrow"));
        assert.equal(res.trace.outputCount, 0);
    });
});
