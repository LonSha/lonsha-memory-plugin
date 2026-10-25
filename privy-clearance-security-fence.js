/* ============================================================
 * privy-clearance-security-fence.js
 * 角色私密知情权安全围栏与防泄露过滤机 (L10-O7)
 *
 * 核心机制：
 * 1. 四级私密权限体系 (PRIVY_CLEARANCE_LEVELS):
 *    - LEVEL_PUBLIC: 公知事实 (所有人均可获知并提及)
 *    - LEVEL_SHARED_CIRCLE: 圈子内部共享 (仅限圈内成员互相知晓)
 *    - LEVEL_CONFIDENTIAL: 双人/极少数绝密知情 (严格绑定知情名单)
 *    - LEVEL_SOLITARY_SECRET: 单人独占隐秘 (除主角自身外，其余人绝对不可获知)
 * 2. 注入前硬阻断拦截 (filterMemoriesForSpeaker):
 *    - 根据当前发言人 (currentSpeaker) 的身份与知情白名单，严格过滤候选事实；
 *    - 未授权角色在场时，自动将私密事实隐去，或降级替换为公知表象。
 * 3. 越权泄露防线检测 (detectPotentialBreach):
 *    - 扫描 LLM 生成的回复草稿，核查是否存在未授权角色提前提及了机密内容；
 *    - 阻断“上帝视角”破功穿帮。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaPrivySecurityFence = factory();
    root.PrivyClearanceSecurityFence = root.LonShaPrivySecurityFence;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PRIVY_CLEARANCE_LEVELS = Object.freeze({
    LEVEL_PUBLIC: 0,
    LEVEL_SHARED_CIRCLE: 1,
    LEVEL_CONFIDENTIAL: 2,
    LEVEL_SOLITARY_SECRET: 3
  });

  /**
   * 过滤指定角色允许知晓的记忆项
   * @param {Array<Object>} memoryItems
   * @param {string} speakerName 当前角色姓名
   * @param {Array<string>} userCircles 该角色所属的圈子列表
   * @returns {Array<Object>} 许可注入项
   */
  function filterMemoriesForSpeaker(memoryItems, speakerName, userCircles) {
    if (!Array.isArray(memoryItems)) return [];
    var speaker = String(speakerName || '').trim();
    var circles = Array.isArray(userCircles) ? userCircles : [];

    return memoryItems.filter(function (item) {
      if (!item) return false;
      var level = item.clearanceLevel !== undefined ? item.clearanceLevel : PRIVY_CLEARANCE_LEVELS.LEVEL_PUBLIC;

      // 1. 公开级无限制
      if (level === PRIVY_CLEARANCE_LEVELS.LEVEL_PUBLIC) {
        return true;
      }

      // 2. 独占隐秘：必须是主人自己
      if (level === PRIVY_CLEARANCE_LEVELS.LEVEL_SOLITARY_SECRET) {
        return item.owner === speaker;
      }

      // 3. 绝密知情：必须在 knownBy 白名单中
      if (level === PRIVY_CLEARANCE_LEVELS.LEVEL_CONFIDENTIAL) {
        if (item.owner === speaker) return true;
        var knownBy = Array.isArray(item.knownBy) ? item.knownBy : [];
        return knownBy.indexOf(speaker) !== -1;
      }

      // 4. 圈子共享
      if (level === PRIVY_CLEARANCE_LEVELS.LEVEL_SHARED_CIRCLE) {
        if (item.owner === speaker) return true;
        var itemCircle = item.circleId || item.circle;
        return circles.indexOf(itemCircle) !== -1;
      }

      return false;
    });
  }

  /**
   * 扫描生成文本中是否发生了机密越权泄露
   * @param {string} generatedText 生成文本
   * @param {string} speakerName 当前发言人
   * @param {Array<Object>} secretItems 严禁该角色知晓的秘密清单
   * @returns {Object} 泄露检测结果
   */
  function detectPotentialBreach(generatedText, speakerName, secretItems) {
    if (!generatedText || !Array.isArray(secretItems) || secretItems.length === 0) {
      return { breached: false, details: [] };
    }

    var text = String(generatedText);
    var speaker = String(speakerName || '').trim();
    var breaches = [];

    for (var i = 0; i < secretItems.length; i++) {
      var sec = secretItems[i];
      var knownList = Array.isArray(sec.knownBy) ? sec.knownBy.slice() : [];
      if (sec.owner) knownList.push(sec.owner);

      // 若发言人不应知晓该秘密
      if (knownList.indexOf(speaker) === -1) {
        var keyWords = Array.isArray(sec.sensitiveKeywords) ? sec.sensitiveKeywords : [sec.value || sec.secretStatement];
        for (var k = 0; k < keyWords.length; k++) {
          var kw = String(keyWords[k] || '').trim();
          if (kw.length >= 2 && text.indexOf(kw) !== -1) {
            breaches.push({
              secretId: sec.id || ('sec-' + (i + 1)),
              speaker: speaker,
              leakedKeyword: kw,
              secretTitle: sec.title || '绝密线索'
            });
            break;
          }
        }
      }
    }

    return {
      breached: breaches.length > 0,
      breachCount: breaches.length,
      details: breaches
    };
  }

  return {
    PRIVY_CLEARANCE_LEVELS: PRIVY_CLEARANCE_LEVELS,
    filterMemoriesForSpeaker: filterMemoriesForSpeaker,
    detectPotentialBreach: detectPotentialBreach
  };
});