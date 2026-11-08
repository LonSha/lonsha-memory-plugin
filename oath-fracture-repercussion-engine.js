(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaOathFracture = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    function createState() {
        return {
            trustScore: 100, // 0 - 100
            fractures: [],   // 裂痕历史记录
            activeOaths: []  // 活跃誓约
        };
    }

    function bindOath(state, oathDesc, recipient = '玩家', weight = 1.0) {
        const oath = {
            id: 'oath_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            desc: oathDesc,
            recipient: recipient,
            weight: weight,
            status: 'bound', // bound | kept | fractured
            boundAt: Date.now()
        };
        state.activeOaths.push(oath);
        return oath;
    }

    function recordFracture(state, oathId, reason) {
        const oath = state.activeOaths.find(o => o.id === oathId || o.desc.includes(oathId));
        if (oath) {
            oath.status = 'fractured';
            oath.fracturedAt = Date.now();
            oath.fractureReason = reason;
        }

        const drop = Math.round(30 * (oath ? oath.weight : 1.0));
        state.trustScore = Math.max(0, state.trustScore - drop);
        
        const fractureEntry = {
            id: 'frac_' + Date.now(),
            oathDesc: oath ? oath.desc : oathId,
            reason: reason,
            severity: oath ? oath.weight : 1.0,
            recordedAt: Date.now()
        };
        state.fractures.push(fractureEntry);
        return fractureEntry;
    }

    function generateFractureDirectives(state) {
        const directives = [];
        if (state.trustScore < 40) {
            directives.push(
                '【誓约心锚与信任重度裂痕·自我防御启动】当前角色对誓约对象的信任度已降至冰点（' + state.trustScore + '/100）。角色感到被辜负与背刺，言语交谈必须带有礼貌的疏离、警惕防御与刺痛感，拒绝轻信承诺。'
            );
        } else if (state.trustScore < 75) {
            directives.push(
                '【誓约心锚与信任轻度裂痕·心存芥蒂】当前信任度受损（' + state.trustScore + '/100）。角色内心深处保留着失信的阴影，态度虽克制但言语微显迟疑和距离感。'
            );
        }
        return directives;
    }

    return {
        createState: createState,
        bindOath: bindOath,
        recordFracture: recordFracture,
        generateFractureDirectives: generateFractureDirectives
    };
}));
