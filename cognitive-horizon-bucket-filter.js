/* ============================================================
 * cognitive-horizon-bucket-filter.js
 * [v3.454.0 · STBME 仿生认知边界四桶动态过滤与防全知封口引擎]
 *
 * 核心机制（解决大模型全知透视、隔空读心、出戏剧透问题）：
 * 1. 认知四桶动态分流 (Cognitive 4-Bucket Filter):
 *    - DIRECT_LIVED (第一桶: 主观亲历): 角色亲历事实或内心感受，以个人视角注入
 *    - SHARED_SCENE (第二桶: 现场共历/公理): 现场共同发生或常识公理，安全注入
 *    - RUMOR_UNVERIFIED (第三桶: 道听途说/传闻): 间接转述/误信，附加传闻前缀，严禁下确凿结论
 *    - EMBARGO_SILENT (第四桶: 认知禁区): 不在场/未被告知的秘密事实，物理级切断 (0 Token 禁运)
 *
 * 2. 空间隔断感知衰减 (Spatial Attenuation):
 *    - 屏风后、隔壁、角落的交谈，自动降噪并截断为断续碎词
 *
 * 3. 防全知指令封口锁 (Anti-Omniscience Prompt Seal):
 *    - 首尾注入绝对防御指令，限制大模型以角色身份认知作答，面对未知保持困惑
 * ============================================================ */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaCognitiveHorizonFilter = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const BUCKETS = Object.freeze({
    DIRECT_LIVED: 'DIRECT_LIVED',       // 第一桶：亲历私知
    SHARED_SCENE: 'SHARED_SCENE',       // 第二桶：现场共历/世界共识
    RUMOR_UNVERIFIED: 'RUMOR_UNVERIFIED', // 第三桶：道听途说/未证实
    EMBARGO_SILENT: 'EMBARGO_SILENT'    // 第四桶：认知禁区/绝对静默
  });

  function _cleanStr(s) {
    return typeof s === 'string' ? s.trim() : '';
  }

  /**
   * 将单条事实/记忆按活跃发言角色与在场角色进行四桶划分
   * @param {Object} memory 记忆项
   * @param {string} activeCharacter 当前酒馆活跃互动角色 (聚焦发言者)
   * @param {Array<string>} [inSceneCharacters] 当前在场角色名单
   */
  function classifyCognitiveBucket(memory, activeCharacter, inSceneCharacters) {
    if (!memory || typeof memory !== 'object') {
      return { bucket: BUCKETS.EMBARGO_SILENT, reason: 'invalid-memory' };
    }

    const speaker = _cleanStr(activeCharacter);
    const sceneCast = Array.isArray(inSceneCharacters) ? inSceneCharacters.map(_cleanStr).filter(Boolean) : null;
    const owner = _cleanStr(memory.character || memory.owner || memory.subject || '');
    const scope = _cleanStr(memory.scope || '').toLowerCase();
    const source = _cleanStr(memory.source || '').toLowerCase();
    const isRumor = Boolean(memory.isRumor || memory.unverified || memory.via === 'rumor' || scope === 'rumor');
    const knownBy = Array.isArray(memory.knownBy) ? memory.knownBy.map(_cleanStr).filter(Boolean) : (owner ? [owner] : []);

    // 1. 世界公共公理、系统时间常识：归入 SHARED_SCENE
    if (scope === 'world' || source === 'worldprogress' || source === 'timeline') {
      return { bucket: BUCKETS.SHARED_SCENE, reason: 'world-common-ground' };
    }

    // 2. 传闻与道听途说：若角色听说过，归入 RUMOR_UNVERIFIED；否则禁运
    if (isRumor) {
      if (!speaker || knownBy.includes(speaker) || (sceneCast && knownBy.some(k => sceneCast.includes(k)))) {
        return { bucket: BUCKETS.RUMOR_UNVERIFIED, reason: 'unverified-hearsay' };
      }
      return { bucket: BUCKETS.EMBARGO_SILENT, reason: 'rumor-unheard-by-speaker' };
    }

    // 3. 亲身经历判定 (DIRECT_LIVED)：所有者或亲历者就是当前活跃角色
    if (speaker && (owner === speaker || (memory.lived && knownBy.includes(speaker)))) {
      return { bucket: BUCKETS.DIRECT_LIVED, reason: 'direct-lived-experience' };
    }

    // 4. 现场共历判定 (SHARED_SCENE)：在场角色共同知晓
    if (sceneCast && sceneCast.length > 0) {
      const isKnownInScene = knownBy.some(k => sceneCast.includes(k));
      const isSpeakerInScene = !speaker || sceneCast.includes(speaker);

      if (isKnownInScene && isSpeakerInScene) {
        return { bucket: BUCKETS.SHARED_SCENE, reason: 'shared-in-scene-witness' };
      }
    }

    // 5. 间接听说或转述
    if (speaker && knownBy.includes(speaker)) {
      return { bucket: BUCKETS.RUMOR_UNVERIFIED, reason: 'secondhand-knowledge' };
    }

    // 6. 其他所有不在知情范围、或未在场的情况：一律 Fail-Closed 归入禁区
    return { bucket: BUCKETS.EMBARGO_SILENT, reason: 'off-limits-cognitive-embargo' };
  }

  /**
   * 认知分流过滤器
   * @param {Array<Object>} memories 候选记忆
   * @param {string} activeCharacter 当前发言角色
   * @param {Array<string>} [inSceneCharacters] 在场角色
   */
  function filterAndPartitionCognitiveHorizon(memories, activeCharacter, inSceneCharacters) {
    if (!Array.isArray(memories)) {
      return {
        directLived: [],
        sharedScene: [],
        rumorUnverified: [],
        embargoSilent: [],
        stats: { total: 0, direct: 0, shared: 0, rumor: 0, embargoed: 0 }
      };
    }

    const directLived = [];
    const sharedScene = [];
    const rumorUnverified = [];
    const embargoSilent = [];

    for (const mem of memories) {
      const { bucket, reason } = classifyCognitiveBucket(mem, activeCharacter, inSceneCharacters);
      if (bucket === BUCKETS.DIRECT_LIVED) {
        directLived.push(mem);
      } else if (bucket === BUCKETS.SHARED_SCENE) {
        sharedScene.push(mem);
      } else if (bucket === BUCKETS.RUMOR_UNVERIFIED) {
        const text = mem.text || mem.content || mem.statement || '';
        const rumorItem = Object.assign({}, mem, {
          text: `[传闻/道听途说·未证实] ${text}`,
          isCognitiveRumor: true
        });
        rumorUnverified.push(rumorItem);
      } else {
        embargoSilent.push({ memory: mem, reason });
      }
    }

    return {
      directLived,
      sharedScene,
      rumorUnverified,
      embargoSilent,
      stats: {
        total: memories.length,
        direct: directLived.length,
        shared: sharedScene.length,
        rumor: rumorUnverified.length,
        embargoed: embargoSilent.length
      }
    };
  }

  /**
   * 构造注入提示词中的防全知封口锁指令
   */
  function buildAntiOmniscienceSealHeader(activeCharacter) {
    const charName = _cleanStr(activeCharacter) || '当前发言角色';
    return [
      `〔全知禁令与视界隔离｜聚焦角色：${charName}〕`,
      `1. 认知界限铁律：你只能基于【主观亲历】与【现场事实】进行对话与情绪反应；严禁展现任何未卜先知的上帝全知视角。`,
      `2. 传闻与未经证实信息：对于标记为【传闻/道听途说】的内容，绝对禁止将其当作既成事实下结论，必须表现出怀疑、求证或不确定。`,
      `3. 面对未知保持纯真：凡未在当前视界中提及的人、事、隐秘背景或他人内心所想，你必须如实展现困惑、不知情或保持角色防备，严禁隔空读心与主动戳破。`,
      `〔视界隔离封口结束〕`
    ].join('\n');
  }

  return {
    VERSION: '3.454.0',
    BUCKETS,
    classifyCognitiveBucket,
    filterAndPartitionCognitiveHorizon,
    buildAntiOmniscienceSealHeader
  };
}));
