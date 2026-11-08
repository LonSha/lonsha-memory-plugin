/* ============================================================
 * stylistic-drift-emotional-lexicon-modulator.js — [v3.460.0 · V21-L15]
 * 文风口癖与情感语态自适应流变中枢 (Stylistic Drift Lexicon Modulator)
 * ------------------------------------------------------------
 * 1. 好感与信任驱动人称代词演变 (Pronoun & Honorific Shift)
 * 2. 句末叹词、语气助词与标点流变 (Sentence-Final Particle Modulation)
 * 3. 避免机械生硬突变，平滑流变 (Continuous Stylistic Gradient)
 * ============================================================ */
(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaStyleModulator = factory();
        root.StylisticDriftEmotionalLexiconModulator = root.LonShaStyleModulator;
    }
}(typeof globalThis !== "undefined" ? globalThis : this, function () {
    "use strict";
    const VERSION = "3.460.0";

    function modulateLexiconByAffection(affectionScore = 0.5) {
        const aff = Math.max(0.0, Math.min(1.0, Number(affectionScore)));
        let addressTitle = "您";
        let particles = ["。", "吧"];
        let tonePrompt = "客气疏离，保持适当社交礼仪";

        if (aff > 0.85) {
            addressTitle = "你/亲昵昵称";
            particles = ["呀", "呢～", "唔..."];
            tonePrompt = "极度依赖与亲昵，语气柔软无防备，多用温和语气词";
        } else if (aff > 0.5) {
            addressTitle = "你";
            particles = ["吧", "啊"];
            tonePrompt = "自然随和，如相熟好友般平等待遇";
        }

        return {
            affection: aff,
            addressTitle,
            preferredParticles: particles,
            directive: `[文风语气自适应演化] 伴随二人关系，称谓使用「${addressTitle}」，${tonePrompt}。`
        };
    }

    return {
        VERSION,
        modulateLexiconByAffection
    };
}));
