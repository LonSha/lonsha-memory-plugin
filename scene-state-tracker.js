/* ============================================================
 * scene-state-tracker.js
 * [v3.446.0 · 具身现场状态与在场三态追踪引擎]
 *
 * 核心机制（吸收自 ST-Persistent-Memory L0 现场快照与三态在场权限）：
 * 1. 现场五维快照结构 (L0 Scene State)：
 *    - location: 物理地点/环境
 *    - time: 时间/天气/光线
 *    - action: 正在进行的动作或核心对话焦点 (可观察物理动作)
 *    - tension: 即时气氛/情绪张力 (对抗/亲密/压抑/轻松)
 *    - unresolved: 现场未决悬念或即时待办
 * 2. 在场角色严格三态语义 (In-Scene Presence Tri-state)：
 *    - undefined: 初始未知/单聊默认上下文
 *    - []: 明确全员离场、现场无人（严禁模型无中生有对话或凭空编造角色动作）
 *    - ['A', 'B']: 明确活跃在场的角色名单
 * 3. 独立硬 Token 上限计算 (maxSceneTokens: 默认 150 tok)
 *    - 纯函数生成格式化提示词块，保证绝不撑爆上下文
 * 4. 离场或场景切换原子清空 (Purge on Departure)
 * 5. 楼层剪枝与历史快照回退 (Rollback On Pruning)：
 *    - 记录每个状态绑定的最大楼层 (floor)，删楼时精准回退
 * ============================================================ */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaSceneStateTracker = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const VERSION = '3.447.0';
  /**
   * 默认初始快照
   */
  function createDefaultSceneState() {
    return {
      version: 1,
      sceneId: 'scene_init',
      location: '',
      time: '',
      action: '',
      tension: '',
      unresolved: '',
      inSceneCharacters: undefined, // 严格三态：undefined | [] | ['Name']
      floor: 0,
      updatedAt: 0,
      revision: 0,
      persistedAt: 0
    };
  }

  /**
   * 字符串清洗
   */
  function _cleanStr(val, maxLen) {
    if (typeof val !== 'string') return '';
    const trimmed = val.trim();
    return trimmed.length > maxLen ? trimmed.slice(0, maxLen) : trimmed;
  }

  /**
   * 归一化在场角色列表（严格三态判据）
   */
  function normalizeInSceneCharacters(raw) {
    if (raw === undefined || raw === null) {
      return undefined;
    }
    if (Array.isArray(raw)) {
      if (raw.length === 0) return [];
      const cleaned = raw
        .map(c => _cleanStr(c, 40))
        .filter(Boolean);
      return Array.from(new Set(cleaned));
    }
    return undefined;
  }

  /**
   * 更新现场快照 (纯函数 PATCH)
   */
  function patchSceneState(currentState, patch, floor) {
    const base = currentState || createDefaultSceneState();
    const curFloor = Number(floor >= 0 ? floor : base.floor || 0);

    const next = {
      version: 1,
      sceneId: _cleanStr(patch.sceneId || base.sceneId, 60) || 'scene_' + Date.now(),
      location: patch.location !== undefined ? _cleanStr(patch.location, 100) : base.location,
      time: patch.time !== undefined ? _cleanStr(patch.time, 60) : base.time,
      action: patch.action !== undefined ? _cleanStr(patch.action, 150) : base.action,
      tension: patch.tension !== undefined ? _cleanStr(patch.tension, 80) : base.tension,
      unresolved: patch.unresolved !== undefined ? _cleanStr(patch.unresolved, 150) : base.unresolved,
      inSceneCharacters: patch.inSceneCharacters !== undefined
        ? normalizeInSceneCharacters(patch.inSceneCharacters)
        : base.inSceneCharacters,
      floor: curFloor,
      updatedAt: Date.now(),
      revision: (Number(base.revision) || 0) + 1,
      persistedAt: Number(patch.persistedAt || base.persistedAt || 0)
    };
    return next;
  }

  /**
   * [L15-O1] 快照落盘封装：将现场快照封卷为持久化记录
   */
  function snapshotSceneForPersistence(sceneState) {
    if (!sceneState || typeof sceneState !== 'object') {
      return { ok: false, reason: 'invalid-scene-state' };
    }
    const snap = {
      version: 1,
      sceneId: _cleanStr(sceneState.sceneId, 60) || 'scene_' + Date.now(),
      location: _cleanStr(sceneState.location, 100),
      time: _cleanStr(sceneState.time, 60),
      action: _cleanStr(sceneState.action, 150),
      tension: _cleanStr(sceneState.tension, 80),
      unresolved: _cleanStr(sceneState.unresolved, 150),
      inSceneCharacters: normalizeInSceneCharacters(sceneState.inSceneCharacters),
      floor: Number(sceneState.floor || 0),
      updatedAt: Number(sceneState.updatedAt || Date.now()),
      revision: Number(sceneState.revision || 0),
      persistedAt: Date.now()
    };
    return { ok: true, snapshot: snap };
  }

  /**
   * [L15-O1] 从持久化记录中恢复现场快照
   */
  function restoreSceneFromPersistence(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') {
      return { ok: false, sceneState: createDefaultSceneState(), reason: 'empty-snapshot' };
    }
    const restored = {
      version: 1,
      sceneId: _cleanStr(snapshot.sceneId, 60) || 'scene_restored',
      location: _cleanStr(snapshot.location, 100),
      time: _cleanStr(snapshot.time, 60),
      action: _cleanStr(snapshot.action, 150),
      tension: _cleanStr(snapshot.tension, 80),
      unresolved: _cleanStr(snapshot.unresolved, 150),
      inSceneCharacters: normalizeInSceneCharacters(snapshot.inSceneCharacters),
      floor: Number(snapshot.floor || 0),
      updatedAt: Number(snapshot.updatedAt || 0),
      revision: Number(snapshot.revision || 0),
      persistedAt: Number(snapshot.persistedAt || 0)
    };
    return { ok: true, sceneState: restored };
  }

  /**
   * 纯函数：估算 Token（CJK 字符 1 字符 ≈ 1 tok，英文单词约 1.3 tok）
   */
  function estimateTokens(text) {
    if (!text || typeof text !== 'string') return 0;
    const cjkMatches = text.match(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff]/g);
    const cjkCount = cjkMatches ? cjkMatches.length : 0;
    const nonCjkText = text.replace(/[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff\u3040-\u30ff]/g, '');
    const words = nonCjkText.trim().split(/\s+/).filter(Boolean).length;
    const nonCjkTokens = Math.ceil(Math.max(words * 1.3, nonCjkText.length / 3.5));
    return Math.max(1, cjkCount + nonCjkTokens);
  }

  /**
   * 格式化并组装 L0 现场快照提示词块 (受 maxTokens 硬上限保护)
   */
  function formatSceneStatePrompt(scene, maxTokens = 150) {
    if (!scene) return '';
    const lines = [];

    // 只有在至少有一项有效现场内容时才渲染
    const hasContent = scene.location || scene.time || scene.action || scene.tension || scene.unresolved || scene.inSceneCharacters !== undefined;
    if (!hasContent) return '';

    lines.push('【即时物理现场快照 (L0 Scene State)】');
    if (scene.location || scene.time) {
      let locLine = '- 地点时空: ' + (scene.location || '未知地点');
      if (scene.time) locLine += ' (' + scene.time + ')';
      lines.push(locLine);
    }
    if (scene.action) {
      lines.push('- 正在进行: ' + scene.action);
    }
    if (scene.tension) {
      lines.push('- 即时气氛/张力: ' + scene.tension);
    }
    if (scene.unresolved) {
      lines.push('- 即时悬念/待决: ' + scene.unresolved);
    }
    if (scene.inSceneCharacters !== undefined) {
      if (scene.inSceneCharacters.length === 0) {
        lines.push('- 在场角色: 【现场全员离场·空无一人】（严禁无端凭空出现对话交互）');
      } else {
        lines.push('- 在场角色: ' + scene.inSceneCharacters.join('、'));
      }
    }

    let text = lines.join('\n');
    let tokens = estimateTokens(text);

    // 硬预算截断保护
    if (tokens > maxTokens && lines.length > 2) {
      // 逐行降级裁切，优先保留地点、动作与在场角色
      const essential = [lines[0]];
      if (scene.location) essential.push('- 地点: ' + scene.location);
      if (scene.action) essential.push('- 动作: ' + scene.action.slice(0, 40) + '...');
      if (scene.inSceneCharacters !== undefined) {
        essential.push(lines[lines.length - 1]);
      }
      text = essential.join('\n');
    }

    return text;
  }

  /**
   * 楼层回退过滤 (Rollback on Pruning)
   * 给定历史快照记录列表与目标最大楼层 targetFloor，返回最后合法的快照
   */
  function rollbackSceneHistory(history, targetFloor) {
    if (!Array.isArray(history) || history.length === 0) {
      return { rolledBackState: createDefaultSceneState(), remainingHistory: [] };
    }
    const valid = history.filter(h => Number(h.floor || 0) <= Number(targetFloor));
    if (valid.length === 0) {
      return { rolledBackState: createDefaultSceneState(), remainingHistory: [] };
    }
    const latest = valid[valid.length - 1];
    return { rolledBackState: latest, remainingHistory: valid };
  }

  return {
    VERSION,
    createDefaultSceneState,
    patchSceneState,
    normalizeInSceneCharacters,
    estimateTokens,
    formatSceneStatePrompt,
    rollbackSceneHistory,
    snapshotSceneForPersistence,
    restoreSceneFromPersistence
  };
}));
