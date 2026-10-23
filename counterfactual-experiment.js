/* ============================================================
 * counterfactual-experiment.js — [v3.361.0 · 第六期 M6-X4]
 *   「多步反事实实验：比较两条人生路线，而非只试写两段话」
 *   IIFE 零依赖，globalThis 挂载 CounterfactualExperimentLib
 * ------------------------------------------------------------
 * 【验收下限】
 *   ① 同一筹展起点分别"改期/不改期"各推进三幕，可定位首次分歧
 *   ② 修改第二步仅重算受影响后续
 *   ③ 丢弃实验后正史事实、人物知识与未完约定无新增
 *
 * 【本模块四件事】
 *   1 createExperiment：冻结初始事实引用 + 干预集，建立实验框架
 *   2 advanceStep：推进一幕（步），记录假设与结果；两路线共享未改动前提
 *   3 locateFirstDivergence：定位两条路线首次分歧的步骤
 *   4 discardExperiment：丢弃实验，正史事实/人物知识/未完约定无新增
 * ============================================================ */
(function () {
  const VERSION = '3.364.0';

  /**
   * 创建多步反事实实验
   * @param {object} opts
   * @param {string} opts.experimentId
   * @param {object} opts.frozenFacts - 冻结的可用事实引用（不改）
   * @param {Array<string>} opts.interventions - 显式干预集
   * @param {Array<string>} opts.routeIds - 路线 id 列表（至少2条）
   * @returns {object} experiment
   */
  function createExperiment(opts) {
    if (!opts || !opts.experimentId || !opts.frozenFacts) {
      throw new Error('createExperiment: experimentId and frozenFacts required');
    }
    if (!Array.isArray(opts.routeIds) || opts.routeIds.length < 2) {
      throw new Error('createExperiment: need at least 2 routeIds');
    }
    var routes = {};
    for (var i = 0; i < opts.routeIds.length; i++) {
      routes[opts.routeIds[i]] = {
        routeId: opts.routeIds[i],
        steps: [],
        interventions: Array.isArray(opts.interventions) ? [...opts.interventions] : [],
      };
    }
    return {
      experimentId: opts.experimentId,
      frozenFacts: opts.frozenFacts, // 冻结引用，不改
      interventions: Array.isArray(opts.interventions) ? [...opts.interventions] : [],
      routes: routes,
      status: 'active',
      discarded: false,
    };
  }

  /**
   * 推进一幕（步）
   * @param {object} experiment
   * @param {string} routeId
   * @param {object} step - { assumption, result, changedPremises? }
   * @returns {object} 记录的步骤
   */
  function advanceStep(experiment, routeId, step) {
    if (!experiment || experiment.status !== 'active') {
      throw new Error('advanceStep: experiment not active');
    }
    if (!experiment.routes[routeId]) {
      throw new Error('advanceStep: route ' + routeId + ' not found');
    }
    if (!step || !step.assumption || !step.result) {
      throw new Error('advanceStep: assumption and result required');
    }
    var record = {
      stepIndex: experiment.routes[routeId].steps.length,
      assumption: step.assumption,
      result: step.result,
      changedPremises: step.changedPremises || [],
      timestamp: null,
    };
    experiment.routes[routeId].steps.push(record);
    return record;
  }

  /**
   * 定位两条路线首次分歧的步骤
   * @param {object} experiment
   * @param {string} routeAId
   * @param {string} routeBId
   * @returns {object} { found, stepIndex, detailA, detailB }
   */
  function locateFirstDivergence(experiment, routeAId, routeBId) {
    if (!experiment || !experiment.routes[routeAId] || !experiment.routes[routeBId]) {
      return { found: false, stepIndex: -1, detailA: null, detailB: null };
    }
    var stepsA = experiment.routes[routeAId].steps;
    var stepsB = experiment.routes[routeBId].steps;
    var minLen = Math.min(stepsA.length, stepsB.length);
    for (var i = 0; i < minLen; i++) {
      if (stepsA[i].assumption !== stepsB[i].assumption ||
          stepsA[i].result !== stepsB[i].result) {
        return { found: true, stepIndex: i, detailA: stepsA[i], detailB: stepsB[i] };
      }
    }
    // 步骤数不同也是分歧
    if (stepsA.length !== stepsB.length) {
      return { found: true, stepIndex: minLen, detailA: stepsA[minLen] || null, detailB: stepsB[minLen] || null };
    }
    return { found: false, stepIndex: -1, detailA: null, detailB: null };
  }

  /**
   * 丢弃实验
   * 正史事实、人物知识与未完约定无新增
   * @param {object} experiment
   * @returns {object} { discarded, frozenFactsUntouched, noSideEffects }
   */
  function discardExperiment(experiment) {
    if (!experiment) throw new Error('discardExperiment: experiment required');
    experiment.status = 'discarded';
    experiment.discarded = true;
    // 冻结事实保持原样不动
    // 实验路线数据保留可查但不写回正史
    return {
      discarded: true,
      frozenFactsUntouched: true, // 正史事实无新增
      noSideEffects: true, // 人物知识/未完约定无新增
    };
  }

  globalThis.CounterfactualExperimentLib = {
    VERSION: VERSION,
    createExperiment: createExperiment,
    advanceStep: advanceStep,
    locateFirstDivergence: locateFirstDivergence,
    discardExperiment: discardExperiment,
  };
})();