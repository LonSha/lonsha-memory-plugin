(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaRumorMutation = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const VERSION = 'v17.0.0-L17-X5';

    /**
     * 传闻衰减与异化引擎:
     * 每一轮转述 (Hop):
     * 1. 精确信息 (时间、确切数字、理智因果) 逐步模糊/遗失 (Decay)；
     * 2. 情绪形容词 (阴谋、可怕、据说、亲眼所见) 逐步累加 (Mutation/Hyperbole)；
     * 3. 产生演化链条 (Trace DAG)。
     */
    function createState(initial = {}) {
        return {
            rumors: Array.isArray(initial.rumors) ? initial.rumors : [
                {
                    id: 'rumor_default_1',
                    originFact: '昨晚实验楼三楼保险丝烧断，产生了一股焦糊味',
                    currentNarrative: '昨晚实验楼三楼保险丝烧断，产生了一股焦糊味',
                    hops: 0,
                    distortionScore: 0.0,
                    trace: ['昨晚实验楼三楼保险丝烧断，产生了一股焦糊味']
                }
            ]
        };
    }

    function hydrateState(state) {
        if (!state) return createState();
        return {
            rumors: Array.isArray(state.rumors) ? state.rumors : []
        };
    }

    const MUTATION_MODIFIERS = [
        { hop: 1, prefix: '听说', replace: /保险丝烧断/g, with: '突发离奇小火灾', add: '好像还看见黑影跑过去' },
        { hop: 2, prefix: '有人亲眼看到', replace: /突发离奇小火灾/g, with: '发生了剧烈爆炸事故', add: '据说是什么危险禁忌实验失控了！' },
        { hop: 3, prefix: '天哪！整个学院都传遍了', replace: /发生了剧烈爆炸事故/g, with: '有邪恶势力在暗中进行人体炼金', add: '高层正在秘密封锁死亡真相！' }
    ];

    function spreadRumor(state, rumorId) {
        if (!state || !state.rumors) return null;
        const rumor = state.rumors.find(r => r.id === rumorId);
        if (!rumor) return null;

        rumor.hops += 1;
        const mod = MUTATION_MODIFIERS.find(m => m.hop === rumor.hops) || {
            prefix: '越传越邪乎：',
            replace: /实验|事故/g,
            with: '不可名状的恐怖灾祸',
            add: '所有人都在恐慌外逃！'
        };

        let nextText = rumor.currentNarrative;
        if (mod.replace) nextText = nextText.replace(mod.replace, mod.with);
        nextText = `${mod.prefix}，${nextText}，${mod.add}`;

        rumor.currentNarrative = nextText;
        rumor.distortionScore = Math.min(1.0, rumor.hops * 0.33);
        rumor.trace.push(nextText);

        return rumor;
    }

    function createRumor(state, originFact) {
        if (!state) return null;
        const id = 'rumor_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
        const rumor = {
            id,
            originFact: String(originFact || ''),
            currentNarrative: String(originFact || ''),
            hops: 0,
            distortionScore: 0.0,
            trace: [String(originFact || '')]
        };
        state.rumors.push(rumor);
        return rumor;
    }

    function generateRumorDirectives(state) {
        if (!state || !state.rumors) return [];
        const highDistortion = state.rumors.filter(r => r.hops >= 1);
        if (!highDistortion.length) return [];

        const target = highDistortion[highDistortion.length - 1];
        return [
            `【社交传闻异化·信息失真】：坊间正流传着夸张的小道消息（异化指数 ${(target.distortionScore * 100).toFixed(0)}%）：“${target.currentNarrative}”。若角色并无一手证据，会受传闻氛围影响而半信半疑或添油加醋。`
        ];
    }

    return {
        VERSION,
        createState,
        hydrateState,
        createRumor,
        spreadRumor,
        generateRumorDirectives
    };
}));