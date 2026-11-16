/* ============================================================
 * gameplay-preset.js — [v3.467.0] 玩法流派预设档（吸收 ST-Persistent-Memory commands.js 的 GAMEPLAY_PRESETS 形态）
 * ------------------------------------------------------------
 * 【为什么要有这一面 / 修前实测后果】
 *   本仓已有「抽取节奏档位」`extractionProfile`（quality / balanced / low-cost，v3.324.0 M3-O5），
 *   但它**只覆盖抽取频率一维**：预算、注入策略、混合权重、自适应这些「同一题材才该一套」的
 *   参数仍然要用户一个一个调。实测后果：换一张卡（推理 → 言情 → 群像）要手改 5~7 个键，
 *   改漏一个就出现「剧情很慢但预算按快节奏给」「推理卡却开着自适应扩容」这类不协调组合。
 *
 * 【本模块的职责（一个动作，一条回执）】
 *   ① `list()` 给出四档预设与每档**将被改写的键值**——先看再改，不盲打；
 *   ② `plan(id, current)` 是**纯函数**：只算「会改哪些键、从什么改到什么、哪些本来就是这个值（no-op）」，
 *      不写盘、不碰 config 对象、不读 localStorage；
 *   ③ 应用必须由调用方执行（`applyPreset` 只接受注入进来的 `apply` 回调）。
 *      这样「算」与「写」分开：单测可只测算，宿主可只测写。
 *
 * 【本模块**不做**什么（边界，三条硬纪律）】
 *   ① **不碰凭据**：预设只含题材参数，`apiUrl` / `apiKey` / `embeddingKey` / `secondaryApis` 等
 *      一律不进预设表，也不可能被预设改写。这一条照搬对方「凭据零污染」的纪律，
 *      并在 `_assertNoSecrets` 里做成**运行时可校验**（预置表里出现密钥类键即抛错，不是靠人眼）。
 *   ② **不动全局提示词资产**：`extractPrompt*` / `reflectPrompt*` 等是全局资产，不随档位走。
 *   ③ **不越权统计**：只读写这两处白名单里的键；表里没登记的键既不改也不报。
 *
 * 【与对方实现的差别（有意）】
 *   对方四档直接改「提炼频率 / Token 预算 / 语义权重 / 模板」并绑一套提示词模板；
 *   本仓的提示词是全局资产（见上②），故本模块**只调数值与开关**，不带模板。
 *   档位 id 与 `extractionProfile` 的取值空间**正交**：预设会顺带把 `extractionProfile`
 *   设成与该档协调的值，但 `extractionProfile` 单独改不会反向影响预设。
 * ============================================================ */
'use strict';
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
        /* ★ 挂载必须用**全仓被机器认得的字面前缀**（[v3.467.0 修·自抓]）。
         *   首稿写 `root.LonShaGameplayPreset = api` —— 行为上没错（root 就是 globalThis），
         *   但 `tests/_consumption_lib.mjs` 的 `HOST_MOUNT_RE` 只认**字面**前缀
         *   `window.` / `global.` / `globalThis.`；`root.` 与 `(cond ? globalThis : root).`
         *   这类「算出来的前缀」一律不识。
         *   后果连锁三处：① 本模块的「对外全局名」抽出来是空数组 ⇒ 任何消费点都匹配不到；
         *   ② extra_js seam 台账把它判成 `orphan`；③ 接线扫描器报「已挂载但零消费」。
         *   也就是说：**语义上挂对了、机器认不出，就等于没接线**。
         *   故这里写成字面 `globalThis.LonShaGameplayPreset = api`（附带 root 兜底分支，
         *   只为极老环境不抛；两分支挂的是同一个对象，不是第二份实现）。 */
        if (typeof globalThis !== 'undefined') {
            globalThis.LonShaGameplayPreset = api;
        } else {
            root.LonShaGameplayPreset = api;
        }
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var VERSION = '3.467.0';

    /* 密钥类键的**权威判据**：预置表若出现这些键，applyPreset / plan 一律抛错。
     *   为什么不写成「人眼检查一遍」：那只能保证今天没错，改天加档位就漏。
     *   这里用后缀 + 精确名双判据，宁严不宽。 */
    var SECRET_KEY_PATTERNS = [
        /key$/i, /token$/i, /secret$/i, /password$/i, /^apiUrl$/i, /^apiKey$/i,
        /^embeddingUrl$/i, /^embeddingKey$/i, /^embeddingModel$/i, /^apiModel$/i,
        /^apiProviderCustom$/i, /^secondaryApis$/i, /Prompt$/i
    ];

    /**
     * 四档玩法流派。每一档都是「同一题材该一起调的那组键」。
     * 取值理由写在每档注释里 —— 没有理由的档位数字只是个人口味，不该进代码。
     */
    var PRESETS = {
        /* 推理 / 悬疑：线索密度 > 叙事氛围；预算给足（漏一条线索读者就断案），
         *   注入策略取 relevance（按相关性，而非「最近」）—— 旧线索恰恰是定案关键，
         *   recency 会把它们排到后面。自适应扩容关掉：推理卡楼层多，扩容会挤掉正文。 */
        mystery_detective: {
            label: '推理 / 悬疑',
            why: '线索密度优先：按相关性注入、预算给足、关掉自适应扩容（楼层多时扩容挤正文）',
            values: {
                budgetStrategy: 'relevance',
                injectionBudget: 3600,
                memoryTokenBudget: 3200,
                adaptiveBudget: false,
                extractionProfile: 'quality',
                suspenseMaxOpen: 40,          // 伏笔/未解之谜是主线，上限放宽
                hybridAlpha: 0.75             // 偏向稠密语义：同义线索（车/轿车）要能碰上
            }
        },
        /* 言情 / 关系：情绪连续性 > 事件密度。注入取 balanced（叙事流是连续的，
         *   全按相关性会把「三天前那次沉默」挤掉）；预算中等（长回合但不塞满）；
         *   抽取走 balanced 省一次调用，情绪细节靠摘要折叠兜。 */
        romance: {
            label: '言情 / 关系',
            why: '情绪连续性优先：叙事流连续故取 balanced、预算中等、抽取省调用但保留关键事件即时性',
            values: {
                budgetStrategy: 'balanced',
                injectionBudget: 2800,
                memoryTokenBudget: 2500,
                adaptiveBudget: true,
                extractionProfile: 'balanced',
                suspenseMaxOpen: 15,
                hybridAlpha: 0.65
            }
        },
        /* 群像 / 多角色：在场名单与关系网是主要负载，块多且碎。
         *   recency 让「此刻在场的人」优先（群像戏换场景频繁，最近的状态最要紧）；
         *   预算上调因为参与者多；抽取走 quality（每条关系变更都要留住）。 */
        ensemble_drama: {
            label: '群像 / 多角色',
            why: '在场名单优先：recency 让此刻在场者靠前、预算上调容纳多人、抽取取 quality 留住每条关系变更',
            values: {
                budgetStrategy: 'recency',
                injectionBudget: 3800,
                memoryTokenBudget: 3400,
                adaptiveBudget: true,
                extractionProfile: 'quality',
                suspenseMaxOpen: 30,
                hybridAlpha: 0.6              // 群像里人名/称谓常被判为「罕见词」，稀疏面要留权重
            }
        },
        /* 奇幻 / 跑团：设定名词、地点、物品流转是主要负载，且玩家会反复问「我手上有什么」。
         *   预算最高（设定块天然长）；抽取走 balanced；hybridAlpha 偏稀疏（0.4）——
         *   专有名词（咒语名/地名/道具名）靠 BM25 命中，稠密向量对生造词几乎无信号。 */
        fantasy_ttrpg: {
            label: '奇幻 / 跑团',
            why: '专有名词与物品流转优先：预算最高、偏稀疏权重（生造词靠 BM25）、抽取 balanced',
            values: {
                budgetStrategy: 'balanced',
                injectionBudget: 4000,
                memoryTokenBudget: 3600,
                adaptiveBudget: true,
                extractionProfile: 'balanced',
                suspenseMaxOpen: 25,
                hybridAlpha: 0.4
            }
        }
    };

    /** 本模块只会写这些键（白名单即声明：表里没登记的键，plan 不改、apply 不写）。 */
    var TUNABLE_KEYS = Object.freeze(Object.keys(
        Object.values(PRESETS).reduce(function (acc, p) {
            Object.keys(p.values).forEach(function (k) { acc[k] = 1; });
            return acc;
        }, {})
    ));

    function _assertNoSecrets(id) {
        var vals = (PRESETS[id] && PRESETS[id].values) || {};
        var bad = Object.keys(vals).filter(function (k) {
            return SECRET_KEY_PATTERNS.some(function (re) { return re.test(k); });
        });
        if (bad.length) {
            throw new Error('预设 ' + id + ' 含凭据/提示词类键（禁止进预设）：' + bad.join(','));
        }
    }
    // 装载即校验：今天没错不等于明天没错（改天加档位就可能漏），故在模块初始化时全表扫一遍。
    Object.keys(PRESETS).forEach(_assertNoSecrets);

    /** 档位清单（先看再改）。 */
    function list() {
        return Object.keys(PRESETS).map(function (id) {
            return { id: id, label: PRESETS[id].label, why: PRESETS[id].why, values: Object.assign({}, PRESETS[id].values) };
        });
    }

    /** id 归一：大小写/连字符/下划线都容忍（用户手打容易写错），未知值返回 null（不静默回落成默认档）。 */
    function normalizeId(raw) {
        var s = String(raw == null ? '' : raw).trim().toLowerCase().replace(/[\s-]+/g, '_');
        if (PRESETS[s]) return s;
        // 允许用 label（中文）点名
        var byLabel = Object.keys(PRESETS).filter(function (k) { return PRESETS[k].label === String(raw == null ? '' : raw).trim(); })[0];
        return byLabel || null;
    }

    /**
     * 纯计算：给出「应用该档会改什么」。
     * @param {string} id       档位 id（容忍大小写/连字符）
     * @param {object} current  当前配置（只读，不被修改）
     * @returns {{ok:boolean, reason?:string, id?:string, changes?:Array, noop?:Array, unknownKeys?:Array}}
     *   未知档位 ⇒ ok:false + reason（**不**回落成默认档：静默回落会让用户以为切了档却没切）。
     */
    function plan(id, current) {
        var key = normalizeId(id);
        if (!key) return { ok: false, reason: '未知档位：' + String(id == null ? '' : id) + '（可用：' + Object.keys(PRESETS).join(' / ') + '）' };
        _assertNoSecrets(key);
        var cur = (current && typeof current === 'object') ? current : {};
        var vals = PRESETS[key].values;
        var changes = [];
        var noop = [];
        Object.keys(vals).forEach(function (k) {
            var want = vals[k];
            var has = Object.prototype.hasOwnProperty.call(cur, k);
            var now = cur[k];
            if (has && now === want) { noop.push({ key: k, value: want }); return; }
            changes.push({ key: k, from: has ? now : '(未设置)', to: want });
        });
        var unknownKeys = Object.keys(vals).filter(function (k) { return TUNABLE_KEYS.indexOf(k) < 0; });
        return { ok: true, id: key, label: PRESETS[key].label, why: PRESETS[key].why, changes: changes, noop: noop, unknownKeys: unknownKeys };
    }

    /** 档位标签键：它记录「这批值来自哪一档」，**不是**题材参数，故不进 PRESETS.values。
     *   由 applyPreset 单独写一处 —— 若塞进每档的 values 里，`plan()` 会把它报成
     *   「用户可能想单独调的一个参数」，而它根本不该被单独调。 */
    var LABEL_KEY = 'gameplayPreset';

    /**
     * 应用预设：**只做编排，不做写入**。
     *   `apply(key, value)` 由调用方注入（通常是 `(k,v) => { cfg[k]=v; }`），
     *   本模块不接触 config 对象内部结构、不读也不写 localStorage。
     *   这样「写盘时机」与「写哪些键」两件事分开，宿主可以自由决定何时 saveConfig。
     * @returns {{ok:boolean, changed:number, keys:Array, plan:object}}
     */
    function applyPreset(id, current, apply) {
        var p = plan(id, current);
        if (!p.ok) return { ok: false, reason: p.reason, changed: 0, keys: [], plan: p };
        if (typeof apply !== 'function') {
            return { ok: false, reason: '缺少 apply 回调（本模块不自行写盘）', changed: 0, keys: [], plan: p };
        }
        var keys = [];
        p.changes.forEach(function (c) {
            apply(c.key, c.to);
            keys.push(c.key);
        });
        /* 标签单独写：即使本轮所有题材参数都已是该档值（changes 为空），标签也要补上
         *   —— 否则会出现「配置确实是言情档的值，但标签还是空的」这种自相矛盾状态。 */
        apply(LABEL_KEY, p.id);
        return { ok: true, changed: keys.length, keys: keys, labelled: true, plan: p };
    }

    /** 一行回执（斜杠命令与诊断面板共用，不各写一份格式）。 */
    function receiptLine(res) {
        if (!res || res.ok !== true) return '预设未应用：' + ((res && res.reason) || '未知原因');
        var p = res.plan || {};
        if (!res.changed) return '预设 ' + p.id + '（' + p.label + '）已应用，但当前配置本已是该档（改写 0 键）';
        var list = res.plan.changes.map(function (c) { return c.key + ' ' + String(c.from) + '→' + String(c.to); });
        return '预设 ' + p.id + '（' + p.label + '）改写 ' + res.changed + ' 键：' + list.join('，');
    }

    return Object.freeze({
        VERSION: VERSION,
        PRESETS: PRESETS,
        TUNABLE_KEYS: TUNABLE_KEYS,
        LABEL_KEY: LABEL_KEY,
        list: list,
        normalizeId: normalizeId,
        plan: plan,
        applyPreset: applyPreset,
        receiptLine: receiptLine
    });
});