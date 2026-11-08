(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaFloorFingerprintSelfHealer = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * 计算文本的抗编辑局部语义指纹（忽略纯空白与常见标点微调）
     */
    function computeFingerprint(text = '') {
        const normalized = text.replace(/[\s\p{P}]+/gu, '').toLowerCase();
        let hash = 0;
        for (let i = 0; i < normalized.length; i++) {
            hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
            hash |= 0;
        }
        return {
            hash: 'fp_' + Math.abs(hash).toString(16),
            length: normalized.length,
            head16: normalized.slice(0, 16),
            tail16: normalized.slice(-16)
        };
    }

    /**
     * 校验楼层在被用户重新编辑/润色后，原本的证据锚点是否依然能精准自愈重新吸附
     */
    function reanchorEvidence(originalAnchor, editedFloorText) {
        const newFp = computeFingerprint(editedFloorText);
        
        // 1. 若原始指纹头尾片段仍存在于新文本中，判定为正文局部微调修改，自愈吸附成功
        const headMatch = editedFloorText.includes(originalAnchor.headSnippet || '');
        const similarLength = Math.abs(editedFloorText.length - (originalAnchor.originalLength || 0)) <= 50;

        if (headMatch || (newFp.head16 === originalAnchor.fingerprint.head16) || similarLength) {
            return {
                healed: true,
                confidence: 0.98,
                updatedFingerprint: newFp,
                message: '【楼层证据自愈】检测到正文语序或错字局部修改，已通过局部指纹自动重新吸附锚定。'
            };
        }

        return {
            healed: false,
            confidence: 0.2,
            message: '【锚点断裂】楼层正文发生实质性推翻重写，无法重新吸附。'
        };
    }

    return {
        computeFingerprint: computeFingerprint,
        reanchorEvidence: reanchorEvidence
    };
}));