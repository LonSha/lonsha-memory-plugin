(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSourceWitnessGuard = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            witnessRecords: [], // { factId, character, role: 'WITNESS'|'HEARSAY'|'ABSENT', confidence }
            blockedAccessCount: 0
        };
    }

    function recordWitness(state, factId, character, role = 'WITNESS', confidence = 1.0) {
        const record = {
            id: 'wit_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            factId,
            character,
            role, // WITNESS (亲历) | HEARSAY (传闻) | ABSENT (未在场绝不知晓)
            confidence,
            timestamp: Date.now()
        };
        state.witnessRecords.push(record);
        return record;
    }

    /**
     * 校验当事角色是否有资格在生成中调用该事实（严防全知上帝视角穿帮）
     */
    function verifyKnowledgeAccess(state, factId, character) {
        const record = state.witnessRecords.find(r => r.factId === factId && r.character === character);
        if (!record) {
            // 缺省情况下未登记者不可直接亲历
            return {
                allowed: false,
                reason: 'NO_WITNESS_RECORD',
                redactedFact: null
            };
        }

        if (record.role === 'ABSENT') {
            state.blockedAccessCount += 1;
            return {
                allowed: false,
                reason: 'CONFIRMED_ABSENT_RESTRICTION',
                redactedFact: '【物理硬隔离·角色绝对未在场，严禁泄露该事实】'
            };
        }

        return {
            allowed: true,
            role: record.role,
            confidence: record.confidence
        };
    }

    return {
        createState: createState,
        recordWitness: recordWitness,
        verifyKnowledgeAccess: verifyKnowledgeAccess
    };
}));