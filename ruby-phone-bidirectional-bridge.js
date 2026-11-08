/* ============================================================
 * ruby-phone-bidirectional-bridge.js
 * RubyPhone 虚拟手机与 LonSha 记忆引擎双向真桥接器 (L10-O9)
 *
 * 核心机制：
 * 1. 手机端事件感知与记忆入库 (ingestPhoneInteraction):
 *    - 感知手机端真实操作：如通话记录 (call_log)、短信/微信私信 (chat_message)、
 *      便签备忘录 (memo_note)、外卖/转账订单 (financial_transfer)；
 *    - 规范化为 LonSha 事实条目 (fact) 或临时事件 (event)，打上来源标记与置信度。
 * 2. 记忆引擎向手机端的能力反哺 (projectMemoriesToPhoneState):
 *    - 将当前与特定角色相关的最新认知状态 (如关系好感、知情权、历史承诺)；
 *    - 投影为手机端通讯录备注 (contact_remark)、桌面未读提醒 (pending_reminder) 或备忘录同步。
 * 3. 双向事件回执与通道健康自检 (verifyBridgeHealth):
 *    - 确立通道心跳、序列号递增与消息丢弃防护。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaRubyPhoneBridge = factory();
    root.RubyPhoneBidirectionalBridge = root.LonShaRubyPhoneBridge;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PHONE_EVENT_TYPES = Object.freeze({
    CALL_LOG: 'CALL_LOG',
    CHAT_MESSAGE: 'CHAT_MESSAGE',
    MEMO_NOTE: 'MEMO_NOTE',
    FINANCIAL_TRANSFER: 'FINANCIAL_TRANSFER',
    STATUS_CHANGE: 'STATUS_CHANGE'
  });

  /**
   * 将来自 RubyPhone 的操作事件转换为 LonSha 认知记忆提案
   * @param {Object} phoneEvent { eventType, sender, recipient, content, timestamp, extra }
   * @param {number} currentFloor 当前对话物理楼层
   * @returns {Object} 记忆事实提案
   */
  function ingestPhoneInteraction(phoneEvent, currentFloor) {
    if (!phoneEvent || !phoneEvent.eventType) {
      throw new Error('Invalid phoneEvent: eventType is required');
    }

    var eType = String(phoneEvent.eventType).toUpperCase();
    var floor = Number(currentFloor || 0);
    var sender = phoneEvent.sender || 'user';
    var recipient = phoneEvent.recipient || 'assistant';
    var text = String(phoneEvent.content || '').trim();

    var proposal = {
      bridgeSource: 'RUBY_PHONE_BRIDGE',
      floor: floor,
      timestamp: Number(phoneEvent.timestamp || Date.now()),
      rawEventType: eType,
      subject: sender,
      predicate: '',
      object: text,
      category: 'PHONE_TELEPHONY',
      confidence: 0.95
    };

    if (eType === PHONE_EVENT_TYPES.CALL_LOG) {
      proposal.predicate = '通话记录';
      proposal.statement = sender + ' 与 ' + recipient + ' 进行了通话，内容涉及：' + text;
    } else if (eType === PHONE_EVENT_TYPES.CHAT_MESSAGE) {
      proposal.predicate = '手机私信';
      proposal.statement = sender + ' 向 ' + recipient + ' 发送私信："' + text + '"';
    } else if (eType === PHONE_EVENT_TYPES.MEMO_NOTE) {
      proposal.predicate = '便签记录';
      proposal.statement = sender + ' 在手机备忘录中记录：' + text;
    } else if (eType === PHONE_EVENT_TYPES.FINANCIAL_TRANSFER) {
      proposal.predicate = '转账往来';
      proposal.statement = sender + ' 向 ' + recipient + ' 转账交易：' + text;
    } else {
      proposal.predicate = '手机系统动态';
      proposal.statement = sender + ' 触发了手机操作：' + text;
    }

    return proposal;
  }

  /**
   * 将 LonSha 记忆认知反哺并投影为手机端组件状态
   * @param {Array<Object>} activeFacts 当前生效的事实列表
   * @param {Object} targetCharacter 目标角色信息 { name, contactId }
   * @returns {Object} 手机端状态补丁
   */
  function projectMemoriesToPhoneState(activeFacts, targetCharacter) {
    var facts = Array.isArray(activeFacts) ? activeFacts : [];
    var char = targetCharacter || {};
    var charName = String(char.name || '').trim();

    var contactRemarks = [];
    var reminders = [];

    for (var i = 0; i < facts.length; i++) {
      var f = facts[i];
      if (!f) continue;

      // 1. 若事实涉及该角色的身份、秘密或称谓
      if (f.subject === charName || f.target === charName) {
        if (f.predicate === '真实身份' || f.predicate === '代号' || f.predicate === '关系定位') {
          contactRemarks.push(f.predicate + ': ' + (f.object || f.value));
        }
      }

      // 2. 若存在未来承诺或待办提醒
      if (f.isPromised || f.type === 'PLEDGE_COMMITMENT' || f.validFrom) {
        reminders.push({
          reminderId: 'rem-' + (i + 1),
          title: f.title || f.statement || (f.subject + ' 的约定'),
          dueTime: f.validFrom || f.occurredAt || 0,
          status: 'PENDING'
        });
      }
    }

    return {
      characterName: charName,
      contactId: char.contactId || null,
      projectedRemark: contactRemarks.join(' | ') || '无特殊备注',
      pendingReminders: reminders,
      syncTimestamp: Date.now()
    };
  }

  /**
   * [v3.460.0] 同步 LonSha 记忆至 RubyPhone 运行时状态 (对齐 pipeline 调用规范)
   * @param {Object} syncPayload { floor, speaker, contactNote, todoItem }
   * @param {Object} runtimeState RubyPhone 的 runtimeState 或 window.VirtualPhone
   * @returns {Object} 同步回执
   */
  function syncMemoryToPhone(syncPayload = {}, runtimeState = null) {
    var payload = syncPayload || {};
    var speaker = payload.speaker || 'unknown';
    var floor = payload.floor || 0;
    
    // 若 runtimeState 存在，尝试写入手机端通知或备忘
    var synced = false;
    try {
      if (runtimeState && typeof runtimeState === 'object') {
        if (Array.isArray(runtimeState.syncedMemoryLedger)) {
          runtimeState.syncedMemoryLedger.push({
            floor: floor,
            speaker: speaker,
            contactNote: payload.contactNote || null,
            todoItem: payload.todoItem || null,
            syncedAt: Date.now()
          });
          synced = true;
        }
      }
    } catch (_e) {}

    return {
      ok: true,
      floor: floor,
      speaker: speaker,
      synced: synced,
      timestamp: Date.now()
    };
  }

  /**
   * 检验双向桥接通信链路健康度
   * @param {Object} bridgeStatus { lastPhonePing, lastMemorySync, sequenceDelta }
   * @returns {Object} 健康审计结论
   */
  function verifyBridgeHealth(bridgeStatus) {
    var status = bridgeStatus || {};
    var now = Date.now();
    var phoneLag = now - Number(status.lastPhonePing || 0);
    var memLag = now - Number(status.lastMemorySync || 0);
    var isHealthy = phoneLag < 60000 && memLag < 60000;

    return {
      healthy: isHealthy,
      phoneLagMs: phoneLag,
      memoryLagMs: memLag,
      status: isHealthy ? 'BRIDGE_ONLINE' : 'BRIDGE_DEGRADED'
    };
  }

  return {
    PHONE_EVENT_TYPES: PHONE_EVENT_TYPES,
    ingestPhoneInteraction: ingestPhoneInteraction,
    projectMemoriesToPhoneState: projectMemoriesToPhoneState,
    syncMemoryToPhone: syncMemoryToPhone,
    verifyBridgeHealth: verifyBridgeHealth,

    /**
     * [v3.446.0] 物理现场快照同步到手机端 (向手机推送地点、在场角色与防偷窥规则)
     */
    syncSceneToPhone: function (sceneState) {
      if (!sceneState || typeof sceneState !== 'object') {
        return { ok: false, reason: 'invalid-scene-state' };
      }
      var location = String(sceneState.location || '').trim();
      var inScene = sceneState.inSceneCharacters;
      var privacyMode = 'NORMAL';
      if (Array.isArray(inScene) && inScene.length > 0) {
        privacyMode = 'CO_PRESENT_PRIVACY'; // 现场有其他角色在场，开启防偷窥/当面模式
      } else if (Array.isArray(inScene) && inScene.length === 0) {
        privacyMode = 'SOLITARY'; // 现场空无一人
      }

      return {
        ok: true,
        location: location || '未知地点',
        time: String(sceneState.time || ''),
        action: String(sceneState.action || ''),
        inSceneCharacters: inScene,
        privacyMode: privacyMode,
        hudDisplayLine: (location ? '📍' + location : '📍当前现场') + (inScene && inScene.length ? ' · 同场: ' + inScene.join('、') : ''),
        timestamp: Date.now()
      };
    },

    /**
     * [v3.446.0] 现场交互拦截裁决 (当角色就在眼前时，拦截违和的远程私聊/电话，建议当面交互)
     */
    interceptPhoneActionForPresence: function (actionType, targetCharacter, sceneState) {
      var act = String(actionType || '').toUpperCase();
      var target = String(targetCharacter || '').trim();
      var inScene = sceneState && sceneState.inSceneCharacters;

      if (Array.isArray(inScene) && inScene.includes(target)) {
        if (act === 'CHAT_MESSAGE' || act === 'CALL_LOG') {
          return {
            intercepted: true,
            suggestedAction: 'FACE_TO_FACE',
            reason: 'co-present-in-scene',
            notice: '角色「' + target + '」就在你身旁物理现场，建议直接当面交谈，已转为防窥当面记录。'
          };
        }
      }
      return {
        intercepted: false,
        actionType: act,
        targetCharacter: target
      };
    },

    /**
     * [v3.446.0] 双向楼层剪枝与回滚同步
     */
    rollbackPhoneBridgeToFloor: function (phoneEvents, targetFloor) {
      var events = Array.isArray(phoneEvents) ? phoneEvents : [];
      var limit = Number(targetFloor || 0);
      var validEvents = events.filter(function (e) {
        return Number(e.floor || 0) <= limit;
      });
      return {
        targetFloor: limit,
        originalCount: events.length,
        remainingCount: validEvents.length,
        prunedCount: events.length - validEvents.length,
        remainingEvents: validEvents
      };
    }
  };
});