/* ============================================================
 * somatic-micro-expression-reflex-engine.js
 * [v3.458.0 · V20 史诗级双计划 · L20-11]
 * 生理反射与微表情神经自律引擎 (Somatic Micro-Expression Reflex Engine)
 *
 * 核心机制：
 * 1. 模拟非自愿神经反应与生理微动作（瞳孔散大、呼吸骤停、手指微颤、喉头滚动、颈部青筋）；
 * 2. 结合心智防御（L20-1）与创伤激惹（L20-8），当角色试图表面平静撒谎或强压愤怒时，计算自主神经失调指数；
 * 3. 向私密交响简报注入高保真微表情描写指令，使模型的肢体动作呈现生理学真实。
 * ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SomaticMicroExpressionReflexEngine = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 自主神经失调微动作特征库
   */
  const SOMATIC_REFLEX_PATTERNS = {
    PUPIL_DILATION: { label: '瞳孔微收紧后猛然放大', trigger: 'shock_or_fear' },
    RESPIRATORY_PAUSE: { label: '呼吸骤然停滞半拍，胸口起伏短暂锁死', trigger: 'concealment' },
    DIGITAL_TREMOR: { label: '指尖发生极轻微的肌张力震颤，下意识攥紧衣角或杯壁', trigger: 'high_stress' },
    LARYNGEAL_SWALLOW: { label: '喉结极其沉重地上下滚动一次，声线出现瞬间干涩', trigger: 'guilt_or_dryness' },
    MICRO_GAZE_AVOIDANCE: { label: '视线在对视第1.5秒瞬间下垂或向侧下方偏移0.5秒后迅速回正', trigger: 'lying' }
  };

  /**
   * 创建初始生理反射状态
   */
  function createInitialSomaticState() {
    return {
      characterSomaticProfiles: {}, // character -> { autonomicArousal: 0..100, lastReflex: null, lastUpdated: ISO }
      globalSomaticIntensity: 1.0
    };
  }

  /**
   * 评估并触发神经自律微表情
   */
  function evaluateSomaticReflex({ character, stressLevel = 0, exposureRisk = 0, defenseActive = false, text = '' }) {
    if (!character) return null;

    let autonomicArousal = Math.min(100, (stressLevel * 0.6) + (exposureRisk * 40));
    if (defenseActive) autonomicArousal = Math.min(100, autonomicArousal + 25);

    // 挑选最显著的自主神经生理反射
    let reflexKey = null;
    if (autonomicArousal >= 85) {
      reflexKey = 'DIGITAL_TREMOR';
    } else if (exposureRisk >= 0.7) {
      reflexKey = 'RESPIRATORY_PAUSE';
    } else if (defenseActive) {
      reflexKey = 'MICRO_GAZE_AVOIDANCE';
    } else if (stressLevel >= 60) {
      reflexKey = 'LARYNGEAL_SWALLOW';
    } else if (autonomicArousal >= 50) {
      reflexKey = 'PUPIL_DILATION';
    }

    if (!reflexKey) return null;

    const reflex = SOMATIC_REFLEX_PATTERNS[reflexKey];
    return {
      character,
      reflexKey,
      description: reflex.label,
      autonomicArousal: Math.round(autonomicArousal),
      triggeredAt: new Date().toISOString()
    };
  }

  /**
   * 生成生理反射提示词约束指令
   */
  function generateSomaticDirective({ somaticReport }) {
    if (!somaticReport || !somaticReport.description) return '';

    return `【神经生理自律反射 · 不由自主的微表情】\n` +
           `角色 [${somaticReport.character}] 当前自主神经兴奋度处于高位（${somaticReport.autonomicArousal}/100）。\n` +
           `要求：无论其台词如何镇定或掩饰，其生理机能必须泄露极度细微的非自愿反应：【${somaticReport.description}】。将其以不着痕迹的旁白动作自然融于发言。`;
  }

  /**
   * 水合与序列化
   */
  function hydrateSomaticState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return createInitialSomaticState();
    }
    return {
      characterSomaticProfiles: rawState.characterSomaticProfiles ? { ...rawState.characterSomaticProfiles } : {},
      globalSomaticIntensity: typeof rawState.globalSomaticIntensity === 'number' ? rawState.globalSomaticIntensity : 1.0
    };
  }

  function serializeSomaticState(state) {
    if (!state) return createInitialSomaticState();
    return {
      characterSomaticProfiles: state.characterSomaticProfiles || {},
      globalSomaticIntensity: state.globalSomaticIntensity || 1.0
    };
  }

  return {
    createInitialSomaticState,
    evaluateSomaticReflex,
    generateSomaticDirective,
    hydrateSomaticState,
    serializeSomaticState
  };
}));