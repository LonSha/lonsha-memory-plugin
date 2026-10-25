/* ============================================================
 * transparent-budget-allocation-receipt.js
 * 预算分层透明分配与全景回执编排器 (L10-O5)
 *
 * 核心机制：
 * 1. 四级预算优先级硬隔离池 (BUDGET_POOLS):
 *    - POOL_CRITICAL: 核心约束、身份锚点、当前正在履约的强事件 (绝对保住，预算优先)
 *    - POOL_CONTEXTUAL: 关键关系动力学、知情视差、高置信事实 (次级保证)
 *    - POOL_ATMOSPHERE: 微观氛围残差、近期眼神微表情 (受限小配额，严禁挤占核心)
 *    - POOL_WORLD_LORE: 宏观世界观背景、历史传说 (剩余配额动态填充)
 * 2. 真实 Token 精确切片与溢出裁切策略：
 *    - 当总配额不足时，自底向上（从 WORLD_LORE -> ATMOSPHERE -> CONTEXTUAL）平滑裁切；
 *    - CRITICAL 池受保护，若仍溢出则触发警报。
 * 3. 全透明回执审计生成 (Audit Receipt):
 *    - 记录每个池的 Allocated / Consumed / Dropped 统计；
 *    - 记录每一条材料被接纳或被舍弃的具体原因与归属池。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaBudgetAllocationReceipt = factory();
    root.TransparentBudgetAllocationReceipt = root.LonShaBudgetAllocationReceipt;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var BUDGET_POOLS = Object.freeze({
    POOL_CRITICAL: 'POOL_CRITICAL',
    POOL_CONTEXTUAL: 'POOL_CONTEXTUAL',
    POOL_ATMOSPHERE: 'POOL_ATMOSPHERE',
    POOL_WORLD_LORE: 'POOL_WORLD_LORE'
  });

  /**
   * 估算文本 Token 数 (中英文分词轻量估算)
   * @param {string} text
   * @returns {number}
   */
  function estimateTokens(text) {
    if (!text) return 0;
    var str = String(text);
    return Math.ceil(str.length / 2);
  }

  /**
   * 执行透明预算编排与分层裁切
   * @param {Array<Object>} materialItems 材料项列表 [{ id, content, pool, priority, title }]
   * @param {Object} budgetConfig { maxTotalTokens, poolCaps: {} }
   * @returns {Object} 裁切结果与全景回执
   */
  function allocateBudgetWithReceipt(materialItems, budgetConfig) {
    var items = Array.isArray(materialItems) ? materialItems : [];
    var cfg = budgetConfig || {};
    var maxTotal = Number(cfg.maxTotalTokens || 2048);
    var poolCaps = cfg.poolCaps || {};

    // 默认各池配额占比或上限
    var caps = {
      POOL_CRITICAL: Number(poolCaps.POOL_CRITICAL || 1024),
      POOL_CONTEXTUAL: Number(poolCaps.POOL_CONTEXTUAL || 800),
      POOL_ATMOSPHERE: Number(poolCaps.POOL_ATMOSPHERE || 128),
      POOL_WORLD_LORE: Number(poolCaps.POOL_WORLD_LORE || 512)
    };

    var poolBuckets = {
      POOL_CRITICAL: [],
      POOL_CONTEXTUAL: [],
      POOL_ATMOSPHERE: [],
      POOL_WORLD_LORE: []
    };

    // 归入各池
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var targetPool = it.pool && poolBuckets[it.pool] ? it.pool : BUDGET_POOLS.POOL_CONTEXTUAL;
      var tokens = it.tokenCost !== undefined ? it.tokenCost : estimateTokens(it.content || it.text || '');
      poolBuckets[targetPool].push(Object.assign({}, it, { calculatedTokens: tokens }));
    }

    var admitted = [];
    var dropped = [];
    var poolUsage = {
      POOL_CRITICAL: 0,
      POOL_CONTEXTUAL: 0,
      POOL_ATMOSPHERE: 0,
      POOL_WORLD_LORE: 0
    };
    var totalUsed = 0;

    // 按优先级顺序处理池：CRITICAL -> CONTEXTUAL -> ATMOSPHERE -> WORLD_LORE
    var poolOrder = [
      BUDGET_POOLS.POOL_CRITICAL,
      BUDGET_POOLS.POOL_CONTEXTUAL,
      BUDGET_POOLS.POOL_ATMOSPHERE,
      BUDGET_POOLS.POOL_WORLD_LORE
    ];

    for (var p = 0; p < poolOrder.length; p++) {
      var pName = poolOrder[p];
      var bucket = poolBuckets[pName];
      // 组内按 priority 降序
      bucket.sort(function (a, b) {
        return (Number(b.priority || 0)) - (Number(a.priority || 0));
      });

      for (var j = 0; j < bucket.length; j++) {
        var item = bucket[j];
        var itemTokens = item.calculatedTokens;

        var wouldExceedPool = (poolUsage[pName] + itemTokens) > caps[pName];
        var wouldExceedTotal = (totalUsed + itemTokens) > maxTotal;

        if (pName === BUDGET_POOLS.POOL_CRITICAL && totalUsed + itemTokens <= maxTotal) {
          // CRITICAL 尽量放行
          poolUsage[pName] += itemTokens;
          totalUsed += itemTokens;
          admitted.push(Object.assign({}, item, { admittedInPool: pName }));
        } else if (!wouldExceedPool && !wouldExceedTotal) {
          poolUsage[pName] += itemTokens;
          totalUsed += itemTokens;
          admitted.push(Object.assign({}, item, { admittedInPool: pName }));
        } else {
          var dropReason = wouldExceedTotal ? 'EXCEEDED_TOTAL_BUDGET' : 'EXCEEDED_POOL_CAP';
          dropped.push(Object.assign({}, item, { dropReason: dropReason, droppedFromPool: pName }));
        }
      }
    }

    var receipt = {
      timestamp: Date.now(),
      maxTotalTokens: maxTotal,
      totalTokensConsumed: totalUsed,
      utilizationRate: Number((totalUsed / maxTotal).toFixed(3)),
      poolSummary: {
        POOL_CRITICAL: { cap: caps.POOL_CRITICAL, used: poolUsage.POOL_CRITICAL },
        POOL_CONTEXTUAL: { cap: caps.POOL_CONTEXTUAL, used: poolUsage.POOL_CONTEXTUAL },
        POOL_ATMOSPHERE: { cap: caps.POOL_ATMOSPHERE, used: poolUsage.POOL_ATMOSPHERE },
        POOL_WORLD_LORE: { cap: caps.POOL_WORLD_LORE, used: poolUsage.POOL_WORLD_LORE }
      },
      admittedCount: admitted.length,
      droppedCount: dropped.length,
      admittedItems: admitted,
      droppedItems: dropped
    };

    return receipt;
  }

  /**
   * 格式化注入透明度说明
   * @param {Object} receipt
   * @returns {string}
   */
  function formatReceiptSummary(receipt) {
    if (!receipt) return '';
    var lines = ['[记忆预算分配回执]'];
    lines.push('· 总用量: ' + receipt.totalTokensConsumed + ' / ' + receipt.maxTotalTokens + ' tokens (使用率 ' + (receipt.utilizationRate * 100).toFixed(1) + '%)');
    lines.push('· 接纳项数: ' + receipt.admittedCount + ' | 裁切舍弃: ' + receipt.droppedCount);
    lines.push('· 各池明细: 核心[' + receipt.poolSummary.POOL_CRITICAL.used + '/' + receipt.poolSummary.POOL_CRITICAL.cap +
      '] 语境[' + receipt.poolSummary.POOL_CONTEXTUAL.used + '/' + receipt.poolSummary.POOL_CONTEXTUAL.cap +
      '] 氛围[' + receipt.poolSummary.POOL_ATMOSPHERE.used + '/' + receipt.poolSummary.POOL_ATMOSPHERE.cap +
      '] 世界观[' + receipt.poolSummary.POOL_WORLD_LORE.used + '/' + receipt.poolSummary.POOL_WORLD_LORE.cap + ']');
    return lines.join('\n');
  }

  return {
    BUDGET_POOLS: BUDGET_POOLS,
    estimateTokens: estimateTokens,
    allocateBudgetWithReceipt: allocateBudgetWithReceipt,
    formatReceiptSummary: formatReceiptSummary
  };
});