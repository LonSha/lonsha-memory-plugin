/* ============================================================
 * soul-brand-reincarnation-hub.js
 * [v3.458.0 · V20 史诗级双计划 · L20-17]
 * 跨周目灵魂烙印与代际记忆转生中枢 (Soul Brand Reincarnation Hub)
 *
 * 核心机制：
 * 1. 突破单一周目或单一生命周期的叙事局限，支持跨周目/转世/后代继承叙事；
 * 2. 提炼前世/上一周目未了心愿与极深执念作为“灵魂烙印”（Soul Brands / Karmic Imprints）；
 * 3. 在新周目中以“既视感（Déjà vu）”、莫名的本能战栗或残缺闪现形式唤醒，
 *    既维系宿命宿怨的传承，又防止全知剧透导致新角色人设立场崩塌。
 * ============================================================ */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SoulBrandReincarnationHub = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createInitialReincarnationState() {
    return {
      currentCycle: 1, // 当前周目/代际编号
      soulBrands: [],  // Array<{ brandId, soulOwner, targetEntity, brandType: 'UNRESOLVED_VOW'|'KARMIC_HATRED'|'ETERNAL_DEVOTION', summary, intensity: 0..1, awakened: boolean }>
      reincarnatedProfiles: {} // character -> { cycleBorn: number, activeBrandIds: string[] }
    };
  }

  /**
   * 提炼并刻下上一世的灵魂烙印
   */
  function inscribeSoulBrand(state, { soulOwner, targetEntity, brandType = 'UNRESOLVED_VOW', summary, intensity = 0.9 }) {
    if (!state || !soulOwner || !summary) return null;

    const brandId = 'brand_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const newBrand = {
      brandId,
      soulOwner,
      targetEntity: targetEntity || '命运',
      brandType,
      summary,
      intensity: Math.max(0, Math.min(1.0, intensity)),
      awakened: false,
      inscribedAtCycle: state.currentCycle
    };

    state.soulBrands.push(newBrand);
    return newBrand;
  }

  /**
   * 推进至新周目/转生
   */
  function advanceReincarnationCycle(state, opts) {
    if (!state) return 1;
    state.currentCycle += 1;
    for (const b of state.soulBrands) {
      b.awakened = false; // 重置唤醒状态，待新周目特定情境触发既视感
    }
    if (opts && opts.reincarnatedCharacter) {
      state.reincarnatedProfiles[opts.reincarnatedCharacter] = {
        cycleBorn: state.currentCycle,
        activeBrandIds: Array.isArray(opts.inheritBrandIds) ? opts.inheritBrandIds : []
      };
    }
    return state.currentCycle;
  }

  /**
   * 评估并唤醒灵魂烙印既视感指令
   */
  function evaluateSoulBrandResonance(state, { speaker, presentCharacters = [], currentContext = '' }) {
    if (!state || !speaker || !Array.isArray(state.soulBrands) || state.soulBrands.length === 0) return '';

    const awakenedDirectives = [];

    for (const b of state.soulBrands) {
      // 当面对上一世烙印的目标，或自身就是灵魂承载者，或环境提及上一世目标时
      const matchesTarget = presentCharacters.includes(b.targetEntity) || (currentContext && currentContext.includes(b.targetEntity));
      const matchesOwner = b.soulOwner === speaker || (state.reincarnatedProfiles[speaker] && state.reincarnatedProfiles[speaker].activeBrandIds.includes(b.brandId));

      if ((matchesTarget || matchesOwner) && !b.awakened) {
        b.awakened = true;
        let hint = '';
        if (b.brandType === 'UNRESOLVED_VOW') {
          hint = `面对 [${b.targetEntity}] 时，心口产生剧烈既视感与本能愧疚，仿佛曾对TA立下过跨越生死的古老誓言（宿怨：${b.summary}）。`;
        } else if (b.brandType === 'KARMIC_HATRED') {
          hint = `见到 [${b.targetEntity}] 的瞬间血液逆流、杀意与戒备自脊柱升起，潜意识本能抗拒与警惕对方（宿怨：${b.summary}）。`;
        } else {
          hint = `与 [${b.targetEntity}] 视线相撞时产生莫名的宿命重逢触动（烙印：${b.summary}）。`;
        }

        awakenedDirectives.push(hint);
      }
    }

    if (awakenedDirectives.length === 0) return '';

    return `【跨周目灵魂烙印 · 宿世因果既视感】\n` +
           `角色 [${speaker}] 当前处于第 ${state.currentCycle} 周目叙事，灵魂深处泛起上一世未尽宿怨的微弱涟漪：\n` +
           awakenedDirectives.map(d => `- ${d}`).join('\n') + '\n' +
           `要求：严禁直接跳出周目说出“我上一辈子”，必须将其演绎为不由自主的微愣、胸口刺痛或难以解释的偏执偏好。`;
  }

  /**
   * 水合与序列化
   */
  function hydrateReincarnationState(rawState) {
    if (!rawState || typeof rawState !== 'object') {
      return createInitialReincarnationState();
    }
    return {
      currentCycle: typeof rawState.currentCycle === 'number' ? rawState.currentCycle : 1,
      soulBrands: Array.isArray(rawState.soulBrands) ? [...rawState.soulBrands] : [],
      reincarnatedProfiles: rawState.reincarnatedProfiles ? { ...rawState.reincarnatedProfiles } : {}
    };
  }

  function serializeReincarnationState(state) {
    if (!state) return createInitialReincarnationState();
    return {
      currentCycle: state.currentCycle || 1,
      soulBrands: state.soulBrands || [],
      reincarnatedProfiles: state.reincarnatedProfiles || {}
    };
  }

  return {
    createInitialReincarnationState,
    inscribeSoulBrand,
    advanceReincarnationCycle,
    evaluateSoulBrandResonance,
    hydrateReincarnationState,
    serializeReincarnationState
  };
}));