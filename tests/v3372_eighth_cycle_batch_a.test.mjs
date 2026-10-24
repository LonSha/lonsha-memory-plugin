/* ============================================================
 * tests/v3372_eighth_cycle_batch_a.test.mjs — [第八期 · 批次 A]
 * 覆盖：
 *   - M8-O1 记忆工作模式（memory-work-mode.js）
 *   - M8-O2 冲突裁决台（conflict-adjudication-bench.js）
 *   - M8-O3 时间有效性工作流（temporal-validity-workflow.js）
 *   - M8-X1 记忆季候（memory-season.js）
 *   - M8-X2 意义地图（meaning-map.js）
 *   - M8-X3 记忆天气与沉积（memory-weather.js）
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const R = process.cwd();

const MemoryWorkMode = require_(path.join(R, 'memory-work-mode.js'));
const ConflictAdjudication = require_(path.join(R, 'conflict-adjudication-bench.js'));
const TemporalValidity = require_(path.join(R, 'temporal-validity-workflow.js'));
const MemorySeason = require_(path.join(R, 'memory-season.js'));
const MeaningMap = require_(path.join(R, 'meaning-map.js'));
const MemoryWeather = require_(path.join(R, 'memory-weather.js'));

test('M8-O1 · 记忆工作模式：结构自检、模式切换与动态材料编排', () => {
    const check = MemoryWorkMode.workModeSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = MemoryWorkMode.normalizeWorkModeState(null);
    assert.equal(state.activeMode, MemoryWorkMode.WORK_MODES.CONTINUITY);

    // 切换至事实核对模式
    const switchRes = MemoryWorkMode.switchWorkMode(state, MemoryWorkMode.WORK_MODES.FACT_CHECK);
    assert.equal(switchRes.success, true);
    assert.equal(switchRes.currentMode, MemoryWorkMode.WORK_MODES.FACT_CHECK);

    // 模拟候选记忆
    const candidates = [
        { id: 'f1', content: 'Alice 生日是 6 月 1 日', score: 0.9, isSpeculation: false },
        { id: 'f2', content: 'Alice 也许更喜欢猫而不是狗', score: 0.85, isSpeculation: true },
        { id: 'f3', content: 'Alice 曾去过某咖啡馆', score: 0.6, isSpeculation: false }
    ];

    // 在核对模式下：推测条目 f2 被剔除，低于阈值 0.8 的 f3 被剔除，仅剩 f1
    const compiledFact = MemoryWorkMode.compileModeInjection(MemoryWorkMode.WORK_MODES.FACT_CHECK, candidates, 1000);
    assert.equal(compiledFact.admittedCount, 1);
    assert.equal(compiledFact.admitted[0].id, 'f1');

    // 在创作准备模式下：推测条目 f2 与低分 f3 均被放行
    const compiledCreative = MemoryWorkMode.compileModeInjection(MemoryWorkMode.WORK_MODES.CREATIVE_PREP, candidates, 1000);
    assert.equal(compiledCreative.admittedCount, 3);
});

test('M8-O2 · 冲突裁决台：矛盾发现、四大处置、下游抑制与回滚', () => {
    const check = ConflictAdjudication.conflictAdjudicationSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = ConflictAdjudication.normalizeAdjudicationState(null);

    // 针对生日冲突进行裁决：确认为正史
    const adjRes = ConflictAdjudication.adjudicateConflict(
        state,
        'conflict_alice_birthday',
        ConflictAdjudication.ADJUDICATION_ACTIONS.ADOPT,
        { chosenFactId: 'fact_bday_june', reason: '以身份证档案为准' }
    );
    assert.equal(adjRes.success, true);
    state = adjRes.state;

    // 下游事实列表过滤测试
    const facts = [
        { id: 'fact_bday_june', conflictKey: 'conflict_alice_birthday', content: '6月1日' },
        { id: 'fact_bday_july', conflictKey: 'conflict_alice_birthday', content: '7月1日' },
        { id: 'fact_city', conflictKey: null, content: '居住于上海' }
    ];

    const filtered = ConflictAdjudication.filterFactsByAdjudication(facts, state.adjudications);
    assert.equal(filtered.length, 2);
    assert.ok(filtered.some(f => f.id === 'fact_bday_june'));
    assert.ok(!filtered.some(f => f.id === 'fact_bday_july'));

    // 回滚裁决
    const rollback = ConflictAdjudication.rollbackAdjudication(state, 'conflict_alice_birthday');
    assert.equal(rollback.success, true);
    assert.equal(rollback.state.adjudications['conflict_alice_birthday'], undefined);
});

test('M8-O3 · 时间有效性工作流：双时间轴、生命周期状态与时间窗口过滤', () => {
    const check = TemporalValidity.temporalValiditySelfCheck();
    assert.deepEqual(check.problems, []);

    // 假设当前故事进展在第 50 楼
    const currentFloor = 50;

    const factCurrent = { id: 'c1', validFromFloor: 10, validUntilFloor: 100 };
    const factPast = { id: 'p1', validFromFloor: 5, validUntilFloor: 30 };
    const factFuture = { id: 'f1', validFromFloor: 80, validUntilFloor: null };
    const factCancelled = { id: 'x1', isCancelled: true };

    assert.equal(TemporalValidity.classifyFactValidity(factCurrent, currentFloor).status, TemporalValidity.TEMPORAL_STATUS.CURRENT_VALID);
    assert.equal(TemporalValidity.classifyFactValidity(factPast, currentFloor).status, TemporalValidity.TEMPORAL_STATUS.HISTORICAL);
    assert.equal(TemporalValidity.classifyFactValidity(factFuture, currentFloor).status, TemporalValidity.TEMPORAL_STATUS.PLANNED);
    assert.equal(TemporalValidity.classifyFactValidity(factCancelled, currentFloor).status, TemporalValidity.TEMPORAL_STATUS.CANCELLED);

    // 默认窗口仅包含当前有效事实
    const facts = [factCurrent, factPast, factFuture, factCancelled];
    const filtered = TemporalValidity.filterFactsByTemporalWindow(facts, currentFloor, { allowPlanned: false, allowHistorical: false });
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, 'c1');
});

test('M8-X1 · 记忆季候：契机评估、四态流转与用户延后/静音', () => {
    const check = MemorySeason.memorySeasonSelfCheck();
    assert.deepEqual(check.problems, []);

    const memoryItem = {
        id: 'mem_lake_promise',
        theme: '湖畔誓约',
        location: '西湖断桥'
    };

    // 1. 重游旧地触发 RESONANT
    const evalResonant = MemorySeason.evaluateSeasonPhase(memoryItem, { currentLocation: '西湖断桥' });
    assert.equal(evalResonant.phase, MemorySeason.SEASON_PHASES.RESONANT);

    // 2. 主题回响触发 RESURFACING
    const evalEcho = MemorySeason.evaluateSeasonPhase(memoryItem, { currentTopic: '我们在谈论曾经的湖畔誓约' });
    assert.equal(evalEcho.phase, MemorySeason.SEASON_PHASES.RESURFACING);

    // 3. 用户选择静音
    let state = MemorySeason.normalizeSeasonState(null);
    const muteRes = MemorySeason.applySeasonAction(state, 'mem_lake_promise', MemorySeason.SEASON_ACTIONS.MUTE);
    assert.equal(muteRes.success, true);
    state = muteRes.state;

    // 静音后评估进入 DORMANT
    const evalMuted = MemorySeason.evaluateSeasonPhase(memoryItem, { currentLocation: '西湖断桥', userActions: state.userActions });
    assert.equal(evalMuted.phase, MemorySeason.SEASON_PHASES.DORMANT);
});

test('M8-X2 · 意义地图：意象演变追踪、多视角映射与 Prompt 切片', () => {
    const check = MeaningMap.meaningMapSelfCheck();
    assert.deepEqual(check.problems, []);

    let state = MeaningMap.normalizeMeaningMapState(null);

    // 1. 记录一枚旧怀表的象征跃迁
    const s1 = MeaningMap.recordMeaningShift(state, {
        symbolId: 'pocket_watch',
        name: '老式黄铜怀表',
        stage: MeaningMap.MEANING_STAGES.ORIGIN,
        meaningSummary: '祖父遗留的普通旧怀表',
        observer: 'Bob'
    });
    assert.equal(s1.success, true);
    state = s1.state;

    // 2. 发生冲突事件，在 Alice 视角中变成背叛誓约的证明
    const s2 = MeaningMap.recordMeaningShift(state, {
        symbolId: 'pocket_watch',
        name: '老式黄铜怀表',
        stage: MeaningMap.MEANING_STAGES.CONTESTED,
        meaningSummary: '未按时赴约的背叛信物',
        observer: 'Alice',
        triggerEvent: '未赴之约'
    });
    assert.equal(s2.success, true);
    state = s2.state;

    // 3. 校验多视角描述切片
    const symbolObj = state.symbols['pocket_watch'];
    const aliceSlice = MeaningMap.generateMeaningPromptSlice(symbolObj, 'Alice');
    assert.ok(aliceSlice.includes('Alice的视角'));
    assert.ok(aliceSlice.includes('背叛信物'));

    const bobSlice = MeaningMap.generateMeaningPromptSlice(symbolObj, 'Bob');
    assert.ok(bobSlice.includes('Bob的视角'));
    assert.ok(bobSlice.includes('普通旧怀表'));
});

test('M8-X3 · 记忆天气与沉积：指标驱动的客观世界氛围合成', () => {
    const check = MemoryWeather.memoryWeatherSelfCheck();
    assert.deepEqual(check.problems, []);

    // 1. 存在未裁决冲突时触发未决张力
    const tension = MemoryWeather.calculateMemoryWeather({
        unresolvedConflicts: 2,
        openCommitments: 1
    });
    assert.equal(tension.weatherType, MemoryWeather.WEATHER_TYPES.UNSETTLED_TENSION);
    assert.equal(tension.weatherName, '未决张力');

    // 2. 突破性进展触发破晓新生
    const renewal = MemoryWeather.calculateMemoryWeather({
        unresolvedConflicts: 0,
        openCommitments: 0,
        recentMilestones: 1
    });
    assert.equal(renewal.weatherType, MemoryWeather.WEATHER_TYPES.DAWN_RENEWAL);

    // 3. Prompt 描述切片输出
    const promptText = MemoryWeather.formatWeatherForPrompt(renewal);
    assert.ok(promptText.includes('世界叙事氛围·破晓新生'));
});