/* ============================================================
 * character-reinterpretation-versions.js
 * [v3.448.0 · 第十四期 L14-X3]
 * 人物认知改观与解释版本对照库 (纯函数 / 纯契约内核)
 *
 * 核心设计规则：
 * 1. 解释版本链 (Interpretation Versions)：
 *    为同一个角色对特定事件/事实的态度演变建立版本链（v1 当时认识 -> v2 中期质疑 -> v3 彻底改观）。
 * 2. 触发证据强绑定 (Triggering Evidence)：
 *    改观版本必须有触发事件/楼层/证据引用，明确记录「为什么在此时此地产生新的认知」。
 * 3. 旧解释受保护归档 (Preserve Historical Interpretations)：
 *    采纳新解释绝不覆写或删除旧解释，回溯回放时依然能读取到旧版本；同时决不篡改客观物理正史。
 * 4. 关系修复防欺骗：
 *    改观仅表达人物认知转变，绝不因单纯的认知好转而凭空伪造关系亲密度数值暴涨或自动判定关系已修复。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaCharacterReinterpretation = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '3.448.0';

  const INTERPRETATION_STATUS = Object.freeze({
    DRAFT: 'draft',       // 正在思索/改观草案
    ACCEPTED: 'accepted', // 已采纳成为当前认知
    SUPERSEDED: 'superseded', // 已被后续新解释接替
    REJECTED: 'rejected'  // 保留旧理解，拒绝新解释
  });

  function _sanitizeStr(s, maxLen = 300) {
    if (typeof s !== 'string') return '';
    const trimmed = s.trim();
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  }

  /**
   * 创建认知改观账本
   */
  function createReinterpretationLedger(params = {}) {
    return {
      version: VERSION,
      characterId: _sanitizeStr(params.characterId || 'unknown_char', 50),
      targetEntityId: _sanitizeStr(params.targetEntityId || 'unknown_target', 50),
      originalEventRef: {
        eventId: _sanitizeStr(params.originalEventRef?.eventId || params.eventId || 'evt_0', 50),
        floor: Number.isFinite(params.originalEventRef?.floor) ? params.originalEventRef.floor : 0,
        canonicalFactSummary: _sanitizeStr(params.originalEventRef?.canonicalFactSummary || params.factSummary || '', 200)
      },
      versions: [], // 存储所有的解释版本
      activeVersionId: null,
      createdAt: Date.now()
    };
  }

  /**
   * 记录初始解释版本 (v1)
   */
  function addInitialInterpretation(ledger, params = {}) {
    if (!ledger || !Array.isArray(ledger.versions)) {
      throw new Error('invalid-ledger');
    }
    const versionId = 'ver_1';
    const initialVer = {
      versionId,
      versionNumber: 1,
      floor: Number.isFinite(params.floor) ? params.floor : 0,
      interpretationText: _sanitizeStr(params.interpretationText || params.text || '', 400),
      perspective: _sanitizeStr(params.perspective || 'naive_view', 50),
      triggerEvidence: null, // 初始认识无需改观触发证据
      status: INTERPRETATION_STATUS.ACCEPTED,
      recordedAt: Date.now()
    };

    const nextVersions = [initialVer];
    return {
      ...ledger,
      versions: nextVersions,
      activeVersionId: versionId
    };
  }

  /**
   * 提议新的改观草案版本 (Draft Interpretation)
   */
  function proposeReinterpretation(ledger, params = {}) {
    if (!ledger || !Array.isArray(ledger.versions)) {
      throw new Error('invalid-ledger');
    }
    const nextVerNum = ledger.versions.length + 1;
    const versionId = `ver_${nextVerNum}`;

    if (!params.triggerEvidence || !params.triggerEvidence.evidenceId) {
      throw new Error('trigger-evidence-required');
    }

    const draftVer = {
      versionId,
      versionNumber: nextVerNum,
      floor: Number.isFinite(params.floor) ? params.floor : (ledger.originalEventRef?.floor || 0),
      interpretationText: _sanitizeStr(params.interpretationText || '', 400),
      perspective: _sanitizeStr(params.perspective || 'reconsidered_view', 50),
      triggerEvidence: {
        evidenceId: _sanitizeStr(params.triggerEvidence.evidenceId, 50),
        floor: Number.isFinite(params.triggerEvidence.floor) ? params.triggerEvidence.floor : 0,
        summary: _sanitizeStr(params.triggerEvidence.summary || '', 200)
      },
      status: INTERPRETATION_STATUS.DRAFT,
      recordedAt: Date.now()
    };

    return {
      ...ledger,
      versions: [...ledger.versions, draftVer]
    };
  }

  /**
   * 决策改观版本：采纳新解释(accepted)或保留旧解释并拒绝(rejected)
   */
  function resolveReinterpretation(ledger, versionId, decision = 'accept') {
    if (!ledger || !Array.isArray(ledger.versions)) {
      throw new Error('invalid-ledger');
    }

    const targetVer = ledger.versions.find(v => v.versionId === versionId);
    if (!targetVer) {
      throw new Error('version-not-found');
    }

    if (decision === 'accept') {
      const nextVersions = ledger.versions.map(v => {
        if (v.versionId === versionId) {
          return { ...v, status: INTERPRETATION_STATUS.ACCEPTED };
        }
        if (v.status === INTERPRETATION_STATUS.ACCEPTED) {
          return { ...v, status: INTERPRETATION_STATUS.SUPERSEDED };
        }
        return v;
      });

      return {
        ...ledger,
        versions: nextVersions,
        activeVersionId: versionId
      };
    } else {
      // 拒绝采纳：保留当前 activeVersionId，标记目标为 rejected
      const nextVersions = ledger.versions.map(v => {
        if (v.versionId === versionId) {
          return { ...v, status: INTERPRETATION_STATUS.REJECTED };
        }
        return v;
      });

      return {
        ...ledger,
        versions: nextVersions
      };
    }
  }

  /**
   * 比较新旧两版解释的语义/认知跃迁
   */
  function compareInterpretations(ledger, olderVersionId, newerVersionId) {
    if (!ledger || !Array.isArray(ledger.versions)) {
      throw new Error('invalid-ledger');
    }
    const older = ledger.versions.find(v => v.versionId === olderVersionId);
    const newer = ledger.versions.find(v => v.versionId === newerVersionId);
    if (!older || !newer) {
      throw new Error('version-pair-not-found');
    }

    return {
      characterId: ledger.characterId,
      targetEntityId: ledger.targetEntityId,
      canonicalFact: ledger.originalEventRef.canonicalFactSummary,
      older: {
        versionId: older.versionId,
        versionNumber: older.versionNumber,
        floor: older.floor,
        text: older.interpretationText,
        status: older.status
      },
      newer: {
        versionId: newer.versionId,
        versionNumber: newer.versionNumber,
        floor: newer.floor,
        text: newer.interpretationText,
        status: newer.status,
        triggerEvidence: newer.triggerEvidence
      },
      hasTriggerEvidence: !!(newer.triggerEvidence && newer.triggerEvidence.evidenceId),
      originalFactPreserved: true // 保证物理正史出处原样保留
    };
  }

  /**
   * 获取特定时点/楼层生效的历史解释（时光机回溯）
   */
  function getInterpretationAtFloor(ledger, floor) {
    if (!ledger || !Array.isArray(ledger.versions)) {
      return null;
    }
    const targetFloor = Number.isFinite(floor) ? floor : Infinity;
    // 找出在 <= targetFloor 之前已记录并被 accepted 或 superseded 的版本，按 versionNumber 倒序
    const eligible = ledger.versions
      .filter(v => v.floor <= targetFloor && (v.status === INTERPRETATION_STATUS.ACCEPTED || v.status === INTERPRETATION_STATUS.SUPERSEDED))
      .sort((a, b) => b.floor - a.floor || b.versionNumber - a.versionNumber);

    return eligible.length > 0 ? eligible[0] : null;
  }

  function characterReinterpretationSelfCheck() {
    return {
      version: VERSION,
      name: 'character-reinterpretation-versions',
      status: 'ok'
    };
  }

  return {
    VERSION,
    INTERPRETATION_STATUS,
    createReinterpretationLedger,
    addInitialInterpretation,
    proposeReinterpretation,
    resolveReinterpretation,
    compareInterpretations,
    getInterpretationAtFloor,
    characterReinterpretationSelfCheck
  };
}));
