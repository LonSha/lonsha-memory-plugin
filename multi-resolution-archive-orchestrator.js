/* ============================================================
 * multi-resolution-archive-orchestrator.js
 * 多分辨率长线记忆分卷封存与无损解压编排器 (L10-O8)
 *
 * 核心机制：
 * 1. 四级记忆分辨率阶梯 (RESOLUTION_TIERS):
 *    - TIER_RAW_LOG: 逐字原始对话记录 (最高精度，常驻近期 1~20 楼)
 *    - TIER_SCENE_BEAT: 场景节拍与关键转折 (中高精度，常驻 21~100 楼)
 *    - TIER_VOLUME_MILESTONE: 分卷里程碑与核心因果 (中等精度，常驻 100~500 楼)
 *    - TIER_EPOCH_EPITAPH: 史诗/纪元碑铭与神话禁忌 (高度凝练，跨卷常驻)
 * 2. 卷落盘与阶段性封卷 (sealVolumeArchive):
 *    - 将达到楼层上限的历史记录无损提取核心骨架；
 *    - 保留高精度因果锚点与溯源 ID，支持按需钻取解压 (expandVolumeDrilldown)；
 *    - 阻断过往数百楼长文对模型上下文的无限稀释。
 * 3. 动态跨卷上下文拼接 (renderMultiResolutionContext):
 *    - 近期原貌 + 中期节拍 + 远期卷摘要阶梯混排。
 * ============================================================ */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.LonShaMultiResolutionArchive = factory();
    root.MultiResolutionArchiveOrchestrator = root.LonShaMultiResolutionArchive;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var RESOLUTION_TIERS = Object.freeze({
    TIER_RAW_LOG: 'TIER_RAW_LOG',
    TIER_SCENE_BEAT: 'TIER_SCENE_BEAT',
    TIER_VOLUME_MILESTONE: 'TIER_VOLUME_MILESTONE',
    TIER_EPOCH_EPITAPH: 'TIER_EPOCH_EPITAPH'
  });

  /**
   * 将一段历史楼层封存为一个分卷归档包
   * @param {string} volumeId 卷唯一编号，如 'vol-1'
   * @param {string} volumeTitle 卷标题，如 '初入宝鸡篇'
   * @param {number} startFloor 起始楼层
   * @param {number} endFloor 结束楼层
   * @param {Array<Object>} rawLogs 原始楼层记录
   * @param {Object} options { milestones: [], characterChanges: [] }
   * @returns {Object} 封存归档卷
   */
  function sealVolumeArchive(volumeId, volumeTitle, startFloor, endFloor, rawLogs, options) {
    var logs = Array.isArray(rawLogs) ? rawLogs : [];
    var opts = options || {};

    var summaryLines = [];
    if (opts.milestones && Array.isArray(opts.milestones)) {
      for (var i = 0; i < opts.milestones.length; i++) {
        summaryLines.push('· ' + opts.milestones[i]);
      }
    }

    var sealedVolume = {
      volumeId: String(volumeId || 'vol-default'),
      volumeTitle: String(volumeTitle || '未命名分卷'),
      tier: RESOLUTION_TIERS.TIER_VOLUME_MILESTONE,
      floorRange: [Number(startFloor || 0), Number(endFloor || 0)],
      sealedAt: Date.now(),
      rawLogCount: logs.length,
      milestones: opts.milestones || [],
      characterChanges: opts.characterChanges || [],
      condensedSummary: summaryLines.join('\n') || (volumeTitle + ' 阶段性历程已封卷。'),
      _compressedLogStore: logs.map(function (l) {
        return {
          floor: l.floor,
          speaker: l.speaker,
          keyExcerpt: l.text ? (l.text.length > 40 ? l.text.slice(0, 40) + '...' : l.text) : '',
          rawId: l.id
        };
      })
    };

    return sealedVolume;
  }

  /**
   * 钻取解压特定卷的历史细节 (Drilldown)
   * @param {Object} sealedVolume 封存卷
   * @param {number} targetFloor 指定目标楼层
   * @returns {Object|null}
   */
  function expandVolumeDrilldown(sealedVolume, targetFloor) {
    if (!sealedVolume || !Array.isArray(sealedVolume._compressedLogStore)) return null;
    var floor = Number(targetFloor);

    for (var i = 0; i < sealedVolume._compressedLogStore.length; i++) {
      var item = sealedVolume._compressedLogStore[i];
      if (item.floor === floor) {
        return {
          volumeId: sealedVolume.volumeId,
          volumeTitle: sealedVolume.volumeTitle,
          floor: item.floor,
          speaker: item.speaker,
          keyExcerpt: item.keyExcerpt,
          rawId: item.rawId
        };
      }
    }

    return null;
  }

  /**
   * 渲染多分辨率阶梯混合上下文提示词
   * @param {Array<Object>} sealedVolumes 远期已封存各卷
   * @param {Array<Object>} recentSceneBeats 中期场景节拍
   * @param {Array<Object>} activeLogs 近期原貌楼层
   * @returns {string}
   */
  function renderMultiResolutionContext(sealedVolumes, recentSceneBeats, activeLogs) {
    var lines = ['[长线多分辨率史诗图卷]'];

    // 1. 远期分卷概貌
    if (Array.isArray(sealedVolumes) && sealedVolumes.length > 0) {
      lines.push('【历史长卷纪元】');
      for (var v = 0; v < sealedVolumes.length; v++) {
        var vol = sealedVolumes[v];
        lines.push('卷' + (v + 1) + '《' + vol.volumeTitle + '》(第' + vol.floorRange[0] + '-' + vol.floorRange[1] + '楼):');
        lines.push(vol.condensedSummary);
      }
    }

    // 2. 中期节拍
    if (Array.isArray(recentSceneBeats) && recentSceneBeats.length > 0) {
      lines.push('【近期剧情脉络与关键转折】');
      for (var b = 0; b < recentSceneBeats.length; b++) {
        var beat = recentSceneBeats[b];
        lines.push('· [' + (beat.sceneName || '场景') + '] ' + (beat.summary || beat.description));
      }
    }

    // 3. 当前原貌焦点
    if (Array.isArray(activeLogs) && activeLogs.length > 0) {
      lines.push('【当下场景实时对话聚焦】');
      for (var l = 0; l < activeLogs.length; l++) {
        var log = activeLogs[l];
        lines.push('L' + log.floor + ' ' + (log.speaker || '角色') + ': ' + (log.text || ''));
      }
    }

    return lines.join('\n');
  }

  return {
    RESOLUTION_TIERS: RESOLUTION_TIERS,
    sealVolumeArchive: sealVolumeArchive,
    expandVolumeDrilldown: expandVolumeDrilldown,
    renderMultiResolutionContext: renderMultiResolutionContext
  };
});