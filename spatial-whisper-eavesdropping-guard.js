(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaSpatialWhisperGuard = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            partitions: {}, // partitionId -> { name, isolationFactor } (0.0: 完全通透, 1.0: 彻底隔音)
            eavesdropEvents: []
        };
    }

    function definePartition(state, partitionId, name, isolationFactor = 0.7) {
        state.partitions[partitionId] = {
            id: partitionId,
            name: name,
            isolationFactor: Math.max(0, Math.min(1.0, isolationFactor))
        };
        return state.partitions[partitionId];
    }

    function filterUtteranceForListener(state, partitionId, utterance, listenerRole = '偷听者') {
        const partition = state.partitions[partitionId] || { isolationFactor: 0.7, name: '门扉阻隔' };
        let fragmentedUtterance = utterance;

        if (partition.isolationFactor >= 0.9) {
            fragmentedUtterance = '【厚重门墙彻底隔音，外人只能隐约感受到室内有微弱低沉的动静，无法辨识任何词句】';
        } else if (partition.isolationFactor >= 0.5) {
            // 剥离细节，只保留模糊碎片
            const words = utterance.split(/([，。！？,.!?\s]+)/).filter(Boolean);
            const blurred = words.map((w, idx) => {
                if (idx % 2 === 0 && w.length > 1) {
                    return '……' + w.slice(-1) + '……';
                }
                return '……';
            }).join('');
            fragmentedUtterance = '【隔着' + partition.name + '，声音断续模糊】「' + blurred + '」';
        }

        const evt = {
            id: 'eavesdrop_' + Date.now(),
            partitionId: partitionId,
            listenerRole: listenerRole,
            fragmentedUtterance: fragmentedUtterance,
            originalLength: utterance.length,
            timestamp: Date.now()
        };
        state.eavesdropEvents.push(evt);
        return evt;
    }

    function generateEavesdroppingDirectives(eavesdropEvt) {
        return [
            '【空间声学隔断·偷听有限感知】角色当前处于隔断外观察/偷听状态。角色仅捕捉到了断续的声音碎片：' + eavesdropEvt.fragmentedUtterance + '。严格禁止展现全知视角！严禁说出室内具体的密谋细节或精确名词，只能基于所听到的模糊音调与破碎词汇产生疑虑、猜测或警惕。'
        ];
    }

    return {
        createState: createState,
        definePartition: definePartition,
        filterUtteranceForListener: filterUtteranceForListener,
        generateEavesdroppingDirectives: generateEavesdroppingDirectives
    };
}));