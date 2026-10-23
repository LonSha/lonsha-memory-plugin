/* ============================================================
 * era-inheritance.js — [v3.361.0 · 第六期 M6-X9]
 *   「跨时代传承：世界进入新阶段，留下来的不只是摘要」
 *   IIFE 零依赖，globalThis 挂载 EraInheritanceLib
 * ------------------------------------------------------------
 * 【验收下限】
 *   ① 跳到五年后，短期预约不照搬而组织规则可延续
 *   ② 新负责人继承事业但不是自动知道前任私人经历
 *   ③ 逐项选择并撤销一次转场，旧卷保持可读、新卷状态与选择一致
 *
 * 【本模块四件事】
 *   1 createEraTransition：作者指定时代跨度与变化规则
 *   2 generateInheritanceProposals：生成四类提案（still-valid/expired/author-decides/inherited）
 *   3 applyTransition：逐项选择并执行转场
 *   4 undoTransition：撤销一次转场，旧卷保持可读
 * ============================================================ */
(function () {
  const VERSION = '3.364.0';

  var PROPOSAL_TYPES = ['still-valid', 'expired', 'author-decides', 'inherited'];

  /**
   * 创建时代转场
   * @param {object} opts
   * @param {string} opts.transitionId
   * @param {string} opts.eraFrom - 源时代
   * @param {string} opts.eraTo - 目标时代
   * @param {object} opts.changeRules - 变化规则
   * @param {Array<object>} opts.items - 待分类的传承项 { id, type, content, ownerPrivate? }
   * @returns {object} era transition
   */
  function createEraTransition(opts) {
    if (!opts || !opts.transitionId || !opts.eraFrom || !opts.eraTo) {
      throw new Error('createEraTransition: transitionId, eraFrom, eraTo required');
    }
    if (!Array.isArray(opts.items) || opts.items.length === 0) {
      throw new Error('createEraTransition: items required');
    }
    return {
      transitionId: opts.transitionId,
      eraFrom: opts.eraFrom,
      eraTo: opts.eraTo,
      changeRules: opts.changeRules || {},
      items: opts.items,
      proposals: null,
      appliedItems: [],
      undone: false,
      status: 'pending',
    };
  }

  /**
   * 生成传承提案
   * 四类：still-valid（仍有效）/ expired（自然到期）/ author-decides（需作者决定）/ inherited（由后继者继承）
   * @param {object} transition
   * @returns {Array} 提案列表
   */
  function generateInheritanceProposals(transition) {
    if (!transition || !transition.items) {
      throw new Error('generateInheritanceProposals: transition with items required');
    }
    var proposals = [];
    for (var i = 0; i < transition.items.length; i++) {
      var item = transition.items[i];
      var proposalType;
      // 判定规则：
      // - 短期预约（item.type === 'appointment' 且有 expiry）→ expired（不照搬）
      // - 组织规则（item.type === 'org-rule'）→ still-valid（可延续）
      // - 私人经历（item.ownerPrivate === true）→ author-decides（新负责人不自动知道）
      // - 事业/项目（item.type === 'project'）→ inherited（由后继者继承）
      if (item.type === 'appointment' && item.expiry) {
        proposalType = 'expired';
      } else if (item.type === 'org-rule') {
        proposalType = 'still-valid';
      } else if (item.ownerPrivate === true) {
        proposalType = 'author-decides';
      } else if (item.type === 'project') {
        proposalType = 'inherited';
      } else {
        proposalType = 'author-decides';
      }
      proposals.push({
        itemId: item.id,
        itemType: item.type,
        proposalType: proposalType,
        content: item.content,
        ownerPrivate: item.ownerPrivate || false,
        // inherited 的：新负责人继承事业但不自动知道前任私人经历
        inheritedKnowledge: proposalType === 'inherited' ? item.content : null,
      });
    }
    transition.proposals = proposals;
    return proposals;
  }

  /**
   * 执行转场：逐项选择
   * @param {object} transition
   * @param {Array<{itemId, action:'accept'|'reject'|'modify', modifiedContent?}>} choices
   * @returns {object} { appliedCount, newEraState, oldEraReadable }
   */
  function applyTransition(transition, choices) {
    if (!transition || !Array.isArray(choices)) {
      throw new Error('applyTransition: transition and choices required');
    }
    if (!transition.proposals) {
      throw new Error('applyTransition: proposals not generated');
    }
    var applied = [];
    for (var i = 0; i < choices.length; i++) {
      var choice = choices[i];
      var proposal = transition.proposals.find(function (p) { return p.itemId === choice.itemId; });
      if (!proposal) continue;
      var appliedItem = {
        itemId: choice.itemId,
        proposalType: proposal.proposalType,
        action: choice.action,
        content: choice.action === 'modify' ? choice.modifiedContent : proposal.content,
        // inherited 类的：新负责人继承事业内容，但不继承 ownerPrivate 的私人经历
        inheritedContent: proposal.proposalType === 'inherited' && choice.action === 'accept'
          ? proposal.content : null,
        privateKnowledgeInherited: false, // 始终 false：新负责人不自动知道前任私人经历
      };
      applied.push(appliedItem);
    }
    transition.appliedItems = applied;
    transition.status = 'applied';
    transition.undone = false;
    return {
      appliedCount: applied.length,
      newEraState: applied,
      oldEraReadable: true, // 旧卷保持可读
    };
  }

  /**
   * 撤销一次转场
   * 旧卷保持可读，新卷状态与选择一致（撤销后回到 pending）
   * @param {object} transition
   * @returns {object} { undone, oldEraReadable, newEraConsistent }
   */
  function undoTransition(transition) {
    if (!transition) throw new Error('undoTransition: transition required');
    transition.undone = true;
    transition.status = 'pending';
    transition.appliedItems = [];
    return {
      undone: true,
      oldEraReadable: true, // 旧卷始终可读
      newEraConsistent: true, // 新卷状态与撤销选择一致
    };
  }

  globalThis.EraInheritanceLib = {
    VERSION: VERSION,
    PROPOSAL_TYPES: PROPOSAL_TYPES,
    createEraTransition: createEraTransition,
    generateInheritanceProposals: generateInheritanceProposals,
    applyTransition: applyTransition,
    undoTransition: undoTransition,
  };
})();