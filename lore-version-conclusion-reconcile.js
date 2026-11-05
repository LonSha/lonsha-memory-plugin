/* ============================================================
 * lore-version-conclusion-reconcile.js
 * [v3.448.0 · 第十四期 L14-X5]
 * 设定资料换版与结论更新对照工作台 (纯函数 / 纯契约内核)
 *
 * 核心设计规则：
 * 1. 资料版本追踪与段落对照 (Section-level diffing)：
 *    建立旧版(vA)与新版(vB)段落对照，精确追踪每一个 sectionId 的变动（新增、修改、废弃、无变化）。
 * 2. 结论影响分析与陈旧标记 (Stale Inferences)：
 *    当某段落更新或废弃时，强依赖该段落的衍生结论（conclusion）不会被盲目删除或静默重写，
 *    而是明确标记为 `stale`（陈旧待复核），并保留旧版引用（historicalRef）。
 * 3. 逐项接受与人工校订保护 (Manual Review Protection)：
 *    同名章节绝不粗暴全量覆盖，支持用户逐项选择是否接受新版结论草案；
 *    用户曾经手动校订过的结论内容享有第一优先级保护，不被机器全量替换。
 * 4. 纯契约无副作用：
 *    零网络、零写盘，仅负责产出精确的结论重构矩阵与变更清单。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaLoreVersionConclusionReconcile = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '3.448.0';

  const SECTION_DIFF_STATE = Object.freeze({
    UNCHANGED: 'unchanged',
    MODIFIED: 'modified',
    ADDED: 'added',
    REMOVED: 'removed'
  });

  const CONCLUSION_REVIEW_STATUS = Object.freeze({
    FRESH: 'fresh',       // 结论依然有效（依赖段无变化）
    STALE: 'stale',       // 结论陈旧待核验（依赖段已变更/废弃）
    ACCEPTED: 'accepted', // 用户确认采纳新版结论
    KEPT_ORIGINAL: 'kept_original' // 用户裁定保留原人工校订结论
  });

  function _sanitizeStr(s, maxLen = 300) {
    if (typeof s !== 'string') return '';
    const trimmed = s.trim();
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  }

  /**
   * 创建资料换版对照会话
   */
  function createLoreReconcileSession(params = {}) {
    return {
      version: VERSION,
      docId: _sanitizeStr(params.docId || 'lore_doc_0', 50),
      docTitle: _sanitizeStr(params.docTitle || 'Untitled Lore', 100),
      olderVersion: _sanitizeStr(params.olderVersion || 'v1.0', 30),
      newerVersion: _sanitizeStr(params.newerVersion || 'v2.0', 30),
      sectionsDiff: [],
      affectedConclusions: [],
      createdAt: Date.now()
    };
  }

  /**
   * 比对两版资料的段落集合
   * olderSections: [{ sectionId, title, content }]
   * newerSections: [{ sectionId, title, content }]
   */
  function diffLoreSections(olderSections = [], newerSections = []) {
    const oldMap = new Map();
    (Array.isArray(olderSections) ? olderSections : []).forEach(sec => {
      if (sec && sec.sectionId) oldMap.set(sec.sectionId, sec);
    });

    const newMap = new Map();
    (Array.isArray(newerSections) ? newerSections : []).forEach(sec => {
      if (sec && sec.sectionId) newMap.set(sec.sectionId, sec);
    });

    const diffList = [];

    // 检查旧版中的段落（修改、无变化、或移除）
    for (const [secId, oldSec] of oldMap.entries()) {
      if (!newMap.has(secId)) {
        diffList.push({
          sectionId: secId,
          title: _sanitizeStr(oldSec.title, 100),
          diffState: SECTION_DIFF_STATE.REMOVED,
          oldContent: _sanitizeStr(oldSec.content, 1000),
          newContent: null
        });
      } else {
        const newSec = newMap.get(secId);
        const isContentSame = _sanitizeStr(oldSec.content, 1000) === _sanitizeStr(newSec.content, 1000);
        diffList.push({
          sectionId: secId,
          title: _sanitizeStr(newSec.title || oldSec.title, 100),
          diffState: isContentSame ? SECTION_DIFF_STATE.UNCHANGED : SECTION_DIFF_STATE.MODIFIED,
          oldContent: _sanitizeStr(oldSec.content, 1000),
          newContent: _sanitizeStr(newSec.content, 1000)
        });
      }
    }

    // 检查新版中新增的段落
    for (const [secId, newSec] of newMap.entries()) {
      if (!oldMap.has(secId)) {
        diffList.push({
          sectionId: secId,
          title: _sanitizeStr(newSec.title, 100),
          diffState: SECTION_DIFF_STATE.ADDED,
          oldContent: null,
          newContent: _sanitizeStr(newSec.content, 1000)
        });
      }
    }

    return diffList;
  }

  /**
   * 分析段落变动对已有结论的影响
   * conclusions: [{ conclusionId, text, dependsOnSectionIds: [...], isManuallyEdited: boolean }]
   */
  function reconcileConclusionsWithDiff(sectionsDiff = [], existingConclusions = []) {
    const changedSectionIds = new Set(
      sectionsDiff
        .filter(d => d.diffState === SECTION_DIFF_STATE.MODIFIED || d.diffState === SECTION_DIFF_STATE.REMOVED)
        .map(d => d.sectionId)
    );

    const reconciled = (Array.isArray(existingConclusions) ? existingConclusions : []).map(conc => {
      const depends = Array.isArray(conc.dependsOnSectionIds) ? conc.dependsOnSectionIds : [];
      const affectedBy = depends.filter(sId => changedSectionIds.has(sId));
      const isStale = affectedBy.length > 0;

      return {
        conclusionId: _sanitizeStr(conc.conclusionId, 50),
        text: _sanitizeStr(conc.text, 500),
        dependsOnSectionIds: depends,
        affectedBySections: affectedBy,
        isManuallyEdited: !!conc.isManuallyEdited,
        status: isStale ? CONCLUSION_REVIEW_STATUS.STALE : CONCLUSION_REVIEW_STATUS.FRESH,
        staleReason: isStale ? `Depends on modified/removed sections: [${affectedBy.join(', ')}]` : null,
        reconciledDraft: isStale ? `[Pending Re-evaluation] ${conc.text}` : null
      };
    });

    return reconciled;
  }

  /**
   * 人工审查决策：接受新结论草案或保留原人工校订结论
   */
  function applyConclusionDecision(reconciledList = [], conclusionId, decision = 'accept_draft', updatedDraftText = null) {
    return (Array.isArray(reconciledList) ? reconciledList : []).map(conc => {
      if (conc.conclusionId !== conclusionId) return conc;

      if (decision === 'accept_draft') {
        return {
          ...conc,
          text: updatedDraftText ? _sanitizeStr(updatedDraftText, 500) : conc.reconciledDraft || conc.text,
          status: CONCLUSION_REVIEW_STATUS.ACCEPTED,
          staleReason: null,
          reconciledDraft: null
        };
      } else {
        // 保留原人工结论
        return {
          ...conc,
          status: CONCLUSION_REVIEW_STATUS.KEPT_ORIGINAL,
          staleReason: null,
          reconciledDraft: null
        };
      }
    });
  }

  function loreConclusionReconcileSelfCheck() {
    return {
      version: VERSION,
      name: 'lore-version-conclusion-reconcile',
      status: 'ok'
    };
  }

  return {
    VERSION,
    SECTION_DIFF_STATE,
    CONCLUSION_REVIEW_STATUS,
    createLoreReconcileSession,
    diffLoreSections,
    reconcileConclusionsWithDiff,
    applyConclusionDecision,
    loreConclusionReconcileSelfCheck
  };
}));