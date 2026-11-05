/* ============================================================
 * presence-routing-guard.js
 * [v3.446.0 · 在场性权限路由与知情角色防偷窥门禁]
 *
 * 核心机制（吸收自 ST-Persistent-Memory 权限防穿透与 Fail-Closed 闭环）：
 * 1. 知情范围分级 (Presence Scope):
 *    - WORLD: 公共世界常识，只要激活即可注入
 *    - SHARED: 现场共同经历，必须携带有效 knownBy 列表；现场角色无一人知晓时绝对禁运
 *    - CHARACTER: 角色私密经历，必须有归属角色。只有该角色当前在场时才激活注入；离场时 0 Token 绝对静默休眠
 * 2. 严格 Fail-Closed 防护:
 *    - 缺少归属的 CHARACTER 私知条目直接拦截
 *    - knownBy 为空的 SHARED 共享条目直接拦截
 * 3. 动态在场过滤 (filterMemoriesByPresence):
 *    - 结合当前活跃在场名单 (inSceneCharacters) 与视角角色 (focusCharacter) 实时裁决
 * ============================================================ */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaPresenceRoutingGuard = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '3.446.0';

  const SCOPES = Object.freeze({
    WORLD: 'world',
    SHARED: 'shared',
    CHARACTER: 'character'
  });

  /**
   * 字符串清洗
   */
  function _cleanStr(s) {
    return typeof s === 'string' ? s.trim() : '';
  }

  /**
   * 校验单条记忆的知情范围定义 (Fail-Closed 审计)
   */
  function auditMemoryScope(memory) {
    if (!memory || typeof memory !== 'object') {
      return { ok: false, reason: 'invalid-memory-object' };
    }

    const scope = _cleanStr(memory.scope || SCOPES.WORLD).toLowerCase();
    const character = _cleanStr(memory.character || memory.owner || '');
    const knownBy = Array.isArray(memory.knownBy)
      ? memory.knownBy.map(_cleanStr).filter(Boolean)
      : (character ? [character] : []);

    if (scope === SCOPES.CHARACTER) {
      if (!character) {
        return { ok: false, reason: 'character-scope-requires-owner', scope };
      }
    } else if (scope === SCOPES.SHARED) {
      if (knownBy.length === 0) {
        return { ok: false, reason: 'shared-scope-requires-known-by', scope };
      }
    } else if (scope !== SCOPES.WORLD) {
      return { ok: false, reason: 'unrecognized-scope', scope };
    }

    return {
      ok: true,
      scope,
      character,
      knownBy
    };
  }

  /**
   * 根据当前现场角色判断单条记忆是否允许注入
   * @param {Object} memory 记忆项
   * @param {Array<string>|undefined} inSceneCharacters 当前在场角色 (undefined: 全局开放; []: 无人在场)
   * @param {string} [focusCharacter] 当前对话聚焦的角色
   */
  function isMemoryPermittedInScene(memory, inSceneCharacters, focusCharacter) {
    const audit = auditMemoryScope(memory);
    if (!audit.ok) {
      return { permitted: false, reason: 'fail-closed-audit-rejected', detail: audit.reason };
    }

    const { scope, character, knownBy } = audit;

    // 1. 世界公共常识：全员通用
    if (scope === SCOPES.WORLD) {
      return { permitted: true, scope: SCOPES.WORLD };
    }

    // 若在场角色明确为 [] (无人)：私密与共享经历均禁止无端在空场中注入
    if (Array.isArray(inSceneCharacters) && inSceneCharacters.length === 0) {
      return { permitted: false, reason: 'empty-scene-embargo', scope };
    }

    // 2. 角色私密记忆 (CHARACTER)
    if (scope === SCOPES.CHARACTER) {
      // 若当前在场名单未知 (undefined)，仅检查是否为 focusCharacter 或放行
      if (inSceneCharacters === undefined) {
        if (focusCharacter && focusCharacter !== character) {
          return { permitted: false, reason: 'private-character-mismatch', character };
        }
        return { permitted: true, scope: SCOPES.CHARACTER, character };
      }

      // 明确名单：该角色必须在现场
      const isPresent = inSceneCharacters.includes(character);
      if (!isPresent) {
        return { permitted: false, reason: 'private-character-absent', character };
      }

      // 若同时指定了当前对话的另一焦点角色，且不含该角色，防偷窥拦截
      if (focusCharacter && focusCharacter !== character && !inSceneCharacters.includes(focusCharacter)) {
        return { permitted: false, reason: 'private-character-cross-leak-prevention', character };
      }

      return { permitted: true, scope: SCOPES.CHARACTER, character };
    }

    // 3. 现场共享记忆 (SHARED)
    if (scope === SCOPES.SHARED) {
      // 若在场名单未知，只要有知情者即可放行
      if (inSceneCharacters === undefined) {
        return { permitted: true, scope: SCOPES.SHARED, knownBy };
      }

      // 必须至少有一名知情者在现场活跃，才能公开谈论该经历
      const hasKnownWitness = knownBy.some(k => inSceneCharacters.includes(k));
      if (!hasKnownWitness) {
        return { permitted: false, reason: 'no-known-witness-in-scene', knownBy };
      }

      return { permitted: true, scope: SCOPES.SHARED, knownBy };
    }

    return { permitted: false, reason: 'unhandled-scope-rule' };
  }

  /**
   * 批量按在场权限过滤记忆列表
   */
  function filterMemoriesByPresence(memories, inSceneCharacters, focusCharacter) {
    if (!Array.isArray(memories)) {
      return { allowed: [], blocked: [], stats: { total: 0, allowed: 0, blocked: 0 } };
    }

    const allowed = [];
    const blocked = [];
    let blockedPrivate = 0;
    let blockedShared = 0;
    let blockedAudit = 0;

    for (const mem of memories) {
      const decision = isMemoryPermittedInScene(mem, inSceneCharacters, focusCharacter);
      if (decision.permitted) {
        allowed.push(mem);
      } else {
        blocked.push({ memory: mem, decision });
        if (decision.reason === 'fail-closed-audit-rejected') blockedAudit++;
        else if (decision.reason.includes('private')) blockedPrivate++;
        else blockedShared++;
      }
    }

    return {
      allowed,
      blocked,
      stats: {
        total: memories.length,
        allowed: allowed.length,
        blocked: blocked.length,
        blockedPrivate,
        blockedShared,
        blockedAudit
      }
    };
  }

  return {
    VERSION,
    SCOPES,
    auditMemoryScope,
    isMemoryPermittedInScene,
    filterMemoriesByPresence
  };
}));