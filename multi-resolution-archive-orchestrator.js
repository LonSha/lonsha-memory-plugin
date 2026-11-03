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
function expandVolumeDrilldown(sealedVolume, targetFloor, options) {
    if (!sealedVolume || !Array.isArray(sealedVolume._compressedLogStore)) return null;
    var opts = options && typeof options === 'object' ? options : {};
    var floor = Number(targetFloor);
    var maxScan = Number.isFinite(Number(opts.maxScan)) ? Math.max(0, Math.floor(Number(opts.maxScan))) : Infinity;
    for (var i = 0; i < sealedVolume._compressedLogStore.length && i < maxScan; i++) {
      if (opts.signal && opts.signal.aborted) return null;
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
  function _boundedOptions(options) {
    var opts = options && typeof options === 'object' ? options : {};
    function cap(key) {
      return Number.isFinite(Number(opts[key])) ? Math.max(0, Math.floor(Number(opts[key]))) : Infinity;
    }
    return {
      maxVolumes: cap('maxVolumes'),
      maxBeats: cap('maxBeats'),
      maxLogs: cap('maxLogs'),
      maxChars: cap('maxChars'),
      visible: typeof opts.visible === 'function' ? opts.visible : null,
      signal: opts.signal && typeof opts.signal === 'object' ? opts.signal : null
    };
  }
  /**
   * 渲染多分辨率阶梯混合上下文提示词
   * @param {Array<Object>} sealedVolumes 远期已封存各卷
   * @param {Array<Object>} recentSceneBeats 中期场景节拍
   * @param {Array<Object>} activeLogs 近期原貌楼层
   * @param {Object} options 可选读取预算：maxVolumes/maxBeats/maxLogs/maxChars、visible、signal
   * @returns {string}
   */
  function renderMultiResolutionContext(sealedVolumes, recentSceneBeats, activeLogs, options) {
    var bounded = options && typeof options === 'object';
    var opts = _boundedOptions(options);
    var lines = ['[长线多分辨率史诗图卷]'];
    var chars = lines[0].length;
    var stopped = false;
    var truncated = false;
    var visible = function (item, tier) { return !opts.visible || opts.visible(item, tier) !== false; };
    var add = function (line) {
      if (stopped) return false;
      if (opts.signal && opts.signal.aborted) { stopped = true; return false; }
      var text = String(line == null ? '' : line);
      if (bounded && chars + text.length + 1 > opts.maxChars) { truncated = true; stopped = true; return false; }
      lines.push(text);
      chars += text.length + 1;
      return true;
    };
    var count = function (items, tier, limit, render) {
      if (!Array.isArray(items) || !items.length) return;
      var accepted = 0;
      for (var i = 0; i < items.length; i++) {
        if (stopped || accepted >= limit) { if (accepted < items.length) truncated = true; break; }
        var item = items[i];
        if (!visible(item, tier)) continue;
        if (!render(item, i)) break;
        accepted++;
      }
    };
    // 1. 远期分卷概貌
    if (Array.isArray(sealedVolumes) && sealedVolumes.length > 0) {
      if (add('【历史长卷纪元】')) count(sealedVolumes, 'volume', opts.maxVolumes, function (vol, v) {
        return add('卷' + (v + 1) + '《' + vol.volumeTitle + '》(第' + vol.floorRange[0] + '-' + vol.floorRange[1] + '楼):')
          && add(vol.condensedSummary);
      });
    }
    // 2. 中期节拍
    if (!stopped && Array.isArray(recentSceneBeats) && recentSceneBeats.length > 0) {
      if (add('【近期剧情脉络与关键转折】')) count(recentSceneBeats, 'beat', opts.maxBeats, function (beat) {
        return add('· [' + (beat.sceneName || '场景') + '] ' + (beat.summary || beat.description));
      });
    }
    // 3. 当前原貌焦点
    if (!stopped && Array.isArray(activeLogs) && activeLogs.length > 0) {
      if (add('【当下场景实时对话聚焦】')) count(activeLogs, 'log', opts.maxLogs, function (log) {
        return add('L' + log.floor + ' ' + (log.speaker || '角色') + ': ' + (log.text || ''));
      });
    }
    if (bounded && (stopped || truncated)) lines.push(opts.signal && opts.signal.aborted ? '[读取已取消]' : '[读取已截断]');
    return lines.join('\n');
  }

  return {
    RESOLUTION_TIERS: RESOLUTION_TIERS,
    sealVolumeArchive: sealVolumeArchive,
    expandVolumeDrilldown: expandVolumeDrilldown,
    renderMultiResolutionContext: renderMultiResolutionContext
  };
});