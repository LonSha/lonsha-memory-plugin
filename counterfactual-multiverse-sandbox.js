(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCounterfactualSandbox = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            pivotEvents: [],
            simulations: []
        };
    }

    function recordPivotEvent(state, eventDesc, choiceTaken, alternateChoice) {
        const pivot = {
            id: 'pivot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            eventDesc: eventDesc,
            choiceTaken: choiceTaken,
            alternateChoice: alternateChoice,
            timestamp: Date.now()
        };
        state.pivotEvents.push(pivot);
        return pivot;
    }

    function simulateAlternateOutcome(state, pivotId) {
        const pivot = state.pivotEvents.find(p => p.id === pivotId || p.eventDesc.includes(pivotId));
        if (!pivot) return null;

        const sim = {
            id: 'sim_' + Date.now(),
            pivotId: pivot.id,
            alternateChoice: pivot.alternateChoice,
            hypotheticalWorld: '如果当初没有「' + pivot.choiceTaken + '」，而是选择了「' + pivot.alternateChoice + '」，或许如今彼此早已在人海中走散，沦为毫不相关的陌路人。',
            sentimentShift: '感慨万千与更知珍惜',
            simulatedAt: Date.now()
        };
        state.simulations.push(sim);
        return sim;
    }

    function generateCounterfactualDirectives(state) {
        const directives = [];
        if (state.simulations.length > 0) {
            const latest = state.simulations[state.simulations.length - 1];
            directives.push(
                '【反事实平行人生感怀·珍惜当下】角色脑海中掠过平行命运的分歧沙盘：' + latest.hypotheticalWorld +
                '。角色内心产生强烈的情感共鸣，更加庆幸并珍惜如今与谈话对象并肩的每一刻，生成台词可自然带有一丝深沉而温柔的庆幸感叹。'
            );
        }
        return directives;
    }

    return {
        createState: createState,
        recordPivotEvent: recordPivotEvent,
        simulateAlternateOutcome: simulateAlternateOutcome,
        generateCounterfactualDirectives: generateCounterfactualDirectives
    };
}));