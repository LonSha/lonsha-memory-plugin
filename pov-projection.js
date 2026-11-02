/* ========================================================
 * pov-projection.js — [L13-X3 · v3.439.0] 视角投影（`povs` 从列名单到投影内容）
 *
 * 【为什么需要这一面 / 修前缺口（不是「再建一个知识表」）】
 *   L13-X3 的真实现场：`povs` 视图是一个**名单**（谁的私密心声、第几楼、触发几次），
 *   它答的是「记过什么」，答不了作者真正要问的那一问：
 *     **「如果我现在用这个角色的眼睛看这一轮，他会知道哪些、不知道哪些、以为什么？」**
 *   底座其实都在盘上，缺的是**把它们按「一个人」聚合起来的投影**：
 *     · knowledge-trace.js   —— 单角色 × 单事实的轨迹（五态 knows/doubts/misled/unknown/notRecorded）
 *     · secret-ledger.js     —— 秘密的当下边界（keeper 谁还不知道 / knowers 谁已经知道）
 *     · PovMemory（六本账）  —— 私密心声本体（owner = 只有他知道）
 *     · multi-perspective-theater-bench.js —— 按**角色类型**投影（participant / onlooker / …）
 *   最后一件是**关键的分工说明**：bench 的输入是「视角角色类型」，它按类型规则判可见性；
 *   本模块的输入是**具体某个人**，它按既有账本的名单判可见性。两者**不能互相替代**
 *   （类型答不了「阿绣知不知道这件事」，名单答不了「旁观者能看见什么」），
 *   故本模块**不复用 bench 的判定**，也不改它一个字 —— 它继续服务它自己那类问题。
 *
 * 【四档 + 一档判不了（**不得压格**，压了就再也分不出该怎么写）】
 *   knows      有据已知 —— 有 acquire/correct 轨迹且未被撤回；或 pov 条目的 owner/knowers 含此人；
 *                          或秘密的 knowers 含此人。
 *   suspects   有线索未定 —— 有 doubt 轨迹且未被撤回 ⇒ 他会「起疑」，但**不得据此行动**。
 *   believes   **他以为**（误信）—— 有 misbelieve 轨迹且未被纠正 ⇒ 他当真了，而那不是真相。
 *                          这一格是本模块最容易被并进 knows 的一格：并进去就成了「误信写成世界真相」，
 *                          而两者处置**相反**（前者照他的 belief 演，后者照事实写）。
 *   blind      有据地判定他不知道 —— 秘密的 keeper 含此人且 knowers 不含；
 *                          或有一条显式 unaware 登记；或 pov 属于**别人**（仅该角色自己知道）。
 *                          **本档正文一律遮蔽**（见下「秘密三刀」）。
 *   undecided  判不了 —— 条目没给名单（unlisted）/ 本模块没记录过（notRecorded）/ 模块缺席。
 *                          **绝不并进 blind**：把「我们没记过」读成「他确实不知道」是一句无据的断言，
 *                          而这一格恰好是本仓反复治过的最贵的一笔老账。
 *
 * 【秘密三刀（本档的硬纪律，逐条可判）】
 *   ① blind 档**只报存在性 + 为什么他不知道**，正文一律换成 `SECRET_MASK` 站位串；
 *      站位串与真读数不可能撞（下游可据此判 masked），也**不是正文前缀**（「只漏一点」本仓历来不接受）。
 *   ② 遮蔽发生在**行构造那一刻**，不是「渲染时再遮」—— 后者会给下游留一条读到正文的路。
 *   ③ `leakScan()` 是本模块的自证口：把**全部来源正文**逐条拿去扫投影结果的每一行，
 *      命中即报（含盲档以外的档也扫）。它存在的理由很直接：遮蔽这件事一旦只靠「我记得遮」，
 *      下一个改动者就不知道这里有雷。判据把它当硬断言（见 tests/v3439）。
 *
 * 【三档不同形的可判据（计划原文验收）】
 *   `TIER_LABEL` 五个标签互不相同，且 `counts` 逐档独立 —— 「三个视角对同一事件投影出三种不同结果」
 *   这件事在读数上可复算：同一份输入换 `viewer`，四档计数组合必须不同。
 *   若哪天有人把两档合成一格，这个组合会塌成一个数，判据当场红。
 *
 * 【本模块不做什么（边界）】
 *   · 不写任何账、不落盘、不复制事实库（投影是对既有轨迹/名单的**原样归类**）；
 *   · 不抛：输入畸形一律降级为读数（degraded / malformed），绝不外抛（本面跑在面板与诊断路径上）；
 *   · 不猜：判不开一律给 undecided，不给冒充值；
 *   · 不新增第二套状态词表 —— 状态词逐字取自 knowledge-trace 的五态，本模块只在**档位**上加一层聚合。
 *
 * 零依赖、CJS/IIFE 双导出（与全仓缝合模块同形）。
 * ======================================================== */
(function (root) {
    'use strict';
    var POV_VERSION = 1;
    var POV_KIND = 'pov_projection';
    /** 四档 + 一档判不了。**顺序即档位优先级**：同名条目命中多档时取靠前者。 */
    var TIERS = Object.freeze(['knows', 'suspects', 'believes', 'blind', 'undecided']);
    /** 档位中文标签：五者互不相同（判据按此断言「不同形」）。 */
    var TIER_LABEL = Object.freeze({
        knows: '有据已知',
        suspects: '有线索未定（不得据此行动）',
        believes: '他以为（误信，不是真相）',
        blind: '他不知道（正文不对外提供）',
        undecided: '判不了（本模块不知道）'
    });
    /* 遮蔽站位串。与 evidence-workbench.js 的 SECRET_MASK 同**目的**不同**字面**：
     *   那一处是证据诊断面的秘密列，本处是视角投影的盲档；两处若共用同一字面量，
     *   下游就无法分辨「这条来自诊断面遮蔽」还是「这条来自视角投影遮蔽」。
     *   （本仓 v3283 的常量复制账本盯的正是「同字面量两处各存一份」，故此处刻意不同字。） */
    var SECRET_MASK = '（他对这件事的存在一无所知：正文不对外提供，只报存在性与判定依据）';
    /** 单档最多带回几条（有界，防一个角色把面板撑死；截断必须可见）。 */
    var MAX_PER_TIER = 40;
    /** 来源扫描上限（泄漏自证用；超大账本不扫全文会让面板卡住，故有界并如实报 skipped）。 */
    var MAX_LEAK_SCAN = 400;
    /* 泄漏自检的**最短取样长度**。
     * [首跑负控制当场抓到：这个门槛原来写死 6，且**不报**因短被略掉的条数 —— 静默盲区]
     *   实测：一条 4 字的秘密正文（「粮仓亏空」）被塞进盲档，自检报 hits:0，
     *   于是「遮蔽坏了」这件事在自检里**完全看不见**。两条毛病各修一处：
     *   ① 门槛 6 → 4：中文 4 字已是相当特异的短语（本仓秘密正文实测普遍 ≥ 8 字，
     *      4 字档是纯冗余保险）；1~3 字多为专名/单字，扫了全是噪声会把真命中淹掉；
     *   ② 门槛这件事**必须可见**：因过短被略掉的条数进 `tooShort`，与 `skipped` 并列上报。
     *      有界扫描不报被略掉的部分，就等于「没扫过」被读成「扫过且干净」。 */
    var LEAK_MIN_LEN = 4;
    function text(value, max) {
        var s = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
        return max && s.length > max ? s.slice(0, max) : s;
    }
    /** 取数：只认 number 与非空整数串；其余如实 null（**不编 0**，本仓取数门口径）。 */
    function floorOf(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
        if (typeof value === 'string' && value.trim() !== '' && /^-?\d+$/.test(value.trim())) return Math.trunc(Number(value.trim()));
        return null;
    }
    function names(v, max) {
        var list = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
        var out = [], seen = {};
        for (var i = 0; i < list.length; i++) {
            var n = text(list[i], 40);
            if (!n) continue;
            var k = n.toLowerCase();
            if (seen[k]) continue;                 // 去重走小写归一（与 secret-ledger 的 listHas 同口径）
            seen[k] = 1;
            out.push(n);
            if (max && out.length >= max) break;
        }
        return out;
    }
    function hasName(list, who) {
        var w = text(who, 40).toLowerCase();
        if (!w) return false;
        var arr = names(list);
        for (var i = 0; i < arr.length; i++) if (arr[i].toLowerCase() === w) return true;
        return false;
    }
    /* 事件动作归一：**与 knowledge-trace 的 actionOf 同语义**（known→acquire / reveal→correct）。
     *   为什么在这里再写一遍而不是 require 那一份：本模块要能被单独 require（测试面与 CDN 加载面同形），
     *   且这四行是**词表折换**不是判定；判定全部留给 stateOf 那边（本模块只做档位聚合）。
     *   两条折换规则若哪天在 knowledge-trace 改了而这里没跟，A 组判据会红（见 tests/v3439 A4）。 */
    function actionOf(v) {
        var s = text(v, 24).toLowerCase();
        if (s === 'known') return 'acquire';
        if (s === 'reveal') return 'correct';
        if (['acquire', 'doubt', 'misbelieve', 'correct', 'retract', 'unaware'].indexOf(s) >= 0) return s;
        return '';
    }
    /* ---------------------------------------------------------------
     * 轨迹归一（只收本模块要用的字段；**不做状态判定**）
     *   逐条 copy 且**不带原文进行**：轨迹的 fact 是「事实文本」，它属于 knows/suspects 档
     *   （作者要看见他知道什么），故不在遮蔽范围；blind 档只由名单决定，不取轨迹正文。
     * --------------------------------------------------------------- */
    function normTrace(raw, seq) {
        var t = (raw && typeof raw === 'object') ? raw : {};
        var who = text(t.character || t.owner || t.who, 40);
        var action = actionOf(t.action);
        if (!who || !action) return null;
        return {
            seq: seq,
            traceId: text(t.traceId || t.id, 60) || ('k' + seq),
            character: who,
            fact: text(t.fact || t.content, 180),
            action: action,
            via: text(t.via || t.channel, 20) || 'unspecified',
            from: text(t.from || t.source, 40),
            evidenceKey: text(t.evidenceKey || t.evidence, 120),
            floor: floorOf(t.floor)
        };
    }
    /* 一条轨迹在某个动作上的「最新一条」：按 seq 取最大（seq 即到达序，与 knowledge-trace 同义）。 */
    function latestOf(list) {
        var out = null;
        for (var i = 0; i < list.length; i++) if (!out || list[i].seq > out.seq) out = list[i];
        return out;
    }
    /* ---------------------------------------------------------------
     * 逐角色 × 逐事实的状态聚合（**与 knowledge-trace 的 stateOf 同结论**，但只取本模块要的档位）
     *
     * 【为什么这里不直接调 stateOf】
     *   stateOf 吃的是**原始轨迹账**并自己归一，且它按「单角色 × 单事实」逐次调用 ——
     *   一次投影要把 N 个事实 × M 个角色全判一遍，逐个调会把同一份账归 M×N 次。
     *   本模块先按「角色 + 事实」分桶，每桶内用同一条**优先序**（下面四步）定档。
     *   优先序与 stateOf 的判定序**逐条对齐**（撤回 > 未纠正的误信 > 纠正 > 取得 > 怀疑 > 显式不知），
     *   这是本模块唯一一处「自己算」的地方，故 tests/v3439 A 组拿 stateOf 当对照，
     *   两边结论不一致即红 —— 判据把「两份实现漂移」这件事钉在当场。
     * --------------------------------------------------------------- */
    function tierOfBucket(items) {
        var retracts = [], corrects = [], misb = [], acq = [], doubt = [], unaw = [];
        for (var i = 0; i < items.length; i++) {
            var it = items[i];
            if (it.action === 'retract') retracts.push(it);
            else if (it.action === 'correct') corrects.push(it);
            else if (it.action === 'misbelieve') misb.push(it);
            else if (it.action === 'acquire') acq.push(it);
            else if (it.action === 'doubt') doubt.push(it);
            else if (it.action === 'unaware') unaw.push(it);
        }
        /* 「有效动作」= 除 retract / unaware 之外的动作。
         *   ★ 不可把 retract 自己算进 lastActive —— 那样「最后一条 retract 自己就是最大值」，
         *   第①档永远进不去，撤销会被静默读成 knows（knowledge-trace 档头记录的正是这一形态的历史事故）。
         *   本模块沿用**修好之后**的口径，并由 A 组判据盯住。 */
        var active = [];
        for (var j = 0; j < items.length; j++) {
            if (items[j].action !== 'retract' && items[j].action !== 'unaware') active.push(items[j]);
        }
        var lastRetract = latestOf(retracts);
        var lastActive = latestOf(active);
        if (lastRetract && (!lastActive || lastRetract.seq > lastActive.seq)) {
            /* 撤回晚于一切有效动作 ⇒ 现在不知道了。
             *   但「曾经知道后来撤回」与「从不知道」不同形：前者给 blind + basis:'retract'
             *   （有据：有一条撤回记录），后者给 undecided（本模块没记录过）。 */
            return { tier: 'blind', basis: 'retract', ref: lastRetract };
        }
        var lastMis = latestOf(misb);
        var lastCorrect = latestOf(corrects);
        /* 误信未被纠正 ⇒ believes（他以为）。**这就是「以为什么」的真身**，不得并进 knows。 */
        if (lastMis && (!lastCorrect || lastCorrect.seq < lastMis.seq)) {
            return { tier: 'believes', basis: 'misbelieve', ref: lastMis };
        }
        if (lastCorrect) return { tier: 'knows', basis: 'correct', ref: lastCorrect };
        var lastAcq = latestOf(acq);
        if (lastAcq) return { tier: 'knows', basis: 'acquire', ref: lastAcq };
        var lastDoubt = latestOf(doubt);
        if (lastDoubt) return { tier: 'suspects', basis: 'doubt', ref: lastDoubt };
        if (unaw.length) return { tier: 'blind', basis: 'unaware', ref: latestOf(unaw) };
        /* 非空但全被吃掉（如只有一条 correct 排在误信前、或动作全不可辨）⇒ 判不了。 */
        return { tier: 'undecided', basis: 'none', ref: null };
    }
    /* ─────────────────────────────────────────────────────────────────────
 * 【与 secret-ledger.knowledgeOf 的关系：**单向可推**，不是一一映射（首跑判据当场纠正过）】
 *
 *   knowledgeOf 只答**一个**问题：「这条给没给知情名单」，返回 knower / listed / unlisted。
 *   其中 unlisted 的语义是「**knowers 空** ⇒ 判不了」，它的档头写得很清楚：
 *   「判不了不按 listed 处置（那是猜）」。它**从不**看 keeper。
 *
 *   本模块要答的是另一问：「**这个人**知不知道」。keeper 是写入侧那份**显式点名
 *   『还不知情的人』** 的名单（memory-config 原文：keeper = 还不知情的人），
 *   于是「keeper 含此人」是一条**比名单缺席强得多**的证据 —— 它不是猜，是写入方声明。
 *
 *   所以两者的正确关系是**单向可推**（下面三条由判据逐条钉住，见 tests/v3439 C1/C2）：
 *     knowledgeOf === 'knower'  ⇒ 本模块**必须** knows   （最硬的等价边）
 *     knowledgeOf === 'listed'  ⇒ 本模块**必须** blind   （第二硬：知情名单给了却不含他）
 *     knowledgeOf === 'unlisted' ⇒ 本模块**只不许** knows（可以 blind：keeper 点了他；
 *                                  也可以 undecided：连 keeper 都没给）
 *   ★ 反向**不成立**：本模块的 blind ≠ knowledgeOf 的 listed。
 *     首跑判据曾把 unlisted 写死成「必须 undecided」，实测 `sec_keeper`（keeper:['阿绣'],
 *     knowers:[]）被本模块判 blind 而那一条当场红 —— 红的是**判据的口径**，不是内核。
 *     把这条写在这里的理由很直接：下一次有人看到「两边不一致」时，
 *     要能立刻分辨这是**分工**还是**漂移**，而不是顺手把内核改成对齐一个只答半个问题的面。
 * ───────────────────────────────────────────────────────────────────── */
    function mkRow(tier, fields) {
        var f = fields || {};
        var row = {
            id: text(f.id, 80),
            tier: tier,
            tierLabel: TIER_LABEL[tier] || tier,
            /* 盲档标题固定为站位串：**不取任何来源正文**，连前缀也不取。 */
            title: tier === 'blind' ? SECRET_MASK : text(f.title, 180),
            ref: f.ref || null,
            reason: text(f.reason, 60),
            basis: text(f.basis, 40),
            floor: floorOf(f.floor),
            via: text(f.via, 20),
            from: text(f.from, 40),
            evidenceKey: text(f.evidenceKey, 120),
            source: text(f.source, 20),
            /* 遮蔽标记：盲档恒 true；其余档恒 false（下游据此判「这一行能不能直接渲染」）。 */
            masked: tier === 'blind',
            /* 误信档必须自带「不得当真相」的自述 —— 这一行会被直接拿去写正文，
             *   少了这句，作者会把他的信念写成世界事实（本仓反复治过的一类）。 */
            note: tier === 'believes' ? '（他曾当真，且**未被纠正**：照他的 belief 演，不得当世界真相写）' : ''
        };
        return row;
    }
    /**
     * 视角投影（纯函数、不抛、不写）。
     *
     * @param {object} raw 来源三账 + 可选视角名单
     *   · povs      —— PovMemory.export() 的数组，或 {povs:[...]}
     *   · secrets   —— worldProg.secretLedger（{items:[...]}）或直接 items 数组
     *   · traces    —— worldProg.knowledgeTraces（{traces:[...]}）或直接 traces 数组
     *   · characters—— 可选的角色名单（不给则从三账里收）
     * @param {object} opts { viewer?:string, at?:number, maxPerTier?:number, maxScan?:number }
     *   · viewer —— 选定的视角角色（不给 ⇒ 只产角色名单 + 不给任何档，**不假设「全体」**）
     *   · at     —— 时点楼层：给了就只收 floor ≤ at 的轨迹；**楼层读不到的轨迹不进任何时点**
     * @returns {object} 读数（见档头；恒定键面，缺席面与在场面**逐字同键**）
     */
    function project(raw, opts) {
        var o = (opts && typeof opts === 'object') ? opts : {};
        var viewer = text(o.viewer, 40);
        var at = floorOf(o.at);
        var maxPerTier = (Number.isFinite(Number(o.maxPerTier)) && Number(o.maxPerTier) >= 1) ? Math.floor(Number(o.maxPerTier)) : MAX_PER_TIER;
        var maxScan = (Number.isFinite(Number(o.maxScan)) && Number(o.maxScan) >= 1) ? Math.floor(Number(o.maxScan)) : MAX_LEAK_SCAN;
        var out = {
            kind: POV_KIND,
            version: POV_VERSION,
            viewer: viewer,
            /* 没选视角 ⇒ viewerKnown:false，且四档全空 + undecided 也不填「全体」这种冒充值。 */
            viewerKnown: !!viewer,
            at: at,
            atKnown: at !== null,
            tiers: { knows: [], suspects: [], believes: [], blind: [], undecided: [] },
            counts: {
                knows: 0, suspects: 0, believes: 0, blind: 0, undecided: 0,
                total: 0, viewers: 0, masked: 0,
                input: { povs: 0, secrets: 0, traces: 0 },
                malformed: 0, offTime: 0, noFloor: 0, truncated: 0
            },
            viewers: [],
            writesNothing: true,
            degraded: false,
            notes: []
        };
        try {
            var src = (raw && typeof raw === 'object') ? raw : {};
            var povs = Array.isArray(src.povs) ? src.povs
                : (src.povs && Array.isArray(src.povs.povs)) ? src.povs.povs : [];
            var secrets = Array.isArray(src.secrets) ? src.secrets
                : (src.secrets && Array.isArray(src.secrets.items)) ? src.secrets.items : [];
            var rawTraces = Array.isArray(src.traces) ? src.traces
                : (src.traces && Array.isArray(src.traces.traces)) ? src.traces.traces : [];
            out.counts.input = { povs: povs.length, secrets: secrets.length, traces: rawTraces.length };

            /* ── 1. 轨迹归一 + 时点过滤 ─────────────────────────────── */
            var traces = [];
            for (var i = 0; i < rawTraces.length; i++) {
                var t = normTrace(rawTraces[i], i + 1);
                if (!t) { out.counts.malformed++; continue; }
                if (at !== null) {
                    /* 楼层读不到的轨迹**不进任何时点**：凭一个不知道楼号的轨迹替那一刻作证，
                     *   正是本仓点名的假信号（perspective-card 档头同一条口径）。 */
                    if (t.floor === null) { out.counts.noFloor++; continue; }
                    if (t.floor > at) { out.counts.offTime++; continue; }
                }
                traces.push(t);
            }

            /* ── 2. 视角名单（可复算：三账并集 + 显式名单，去重保序） ──── */
            var viewerBag = [];
            var pushViewer = function (n) { var s = text(n, 40); if (s) viewerBag.push(s); };
            var explicit = Array.isArray(src.characters) ? src.characters : [];
            for (var e = 0; e < explicit.length; e++) pushViewer(explicit[e]);
            for (var p = 0; p < povs.length; p++) {
                var pv = povs[p];
                if (!pv || typeof pv !== 'object') continue;
                pushViewer(pv.owner);
                var pkn = names(pv.knowers);
                for (var pk = 0; pk < pkn.length; pk++) pushViewer(pkn[pk]);
            }
            for (var s1 = 0; s1 < secrets.length; s1++) {
                var sc = secrets[s1];
                if (!sc || typeof sc !== 'object') continue;
                var kp = names(sc.keeper), kw = names(sc.knowers);
                for (var a = 0; a < kp.length; a++) pushViewer(kp[a]);
                for (var b = 0; b < kw.length; b++) pushViewer(kw[b]);
            }
            for (var t2 = 0; t2 < traces.length; t2++) pushViewer(traces[t2].character);
            out.viewers = names(viewerBag);
            out.counts.viewers = out.viewers.length;

            if (!viewer) {
                /* 没选视角：报名单，不报档。**不假设「全体视角」** ——
                 *   那会把「挑一个人看」这件产品动作悄悄变成「混所有人」。 */
                out.notes.push('未选定视角 ⇒ 只给可选的视角名单，不给任何档（不假设「全体」）');
                return out;
            }

            /* ── 3. 逐事实定档 ────────────────────────────────────── */
            var rows = [];                 // 全部候选行（同 id 允许出现在多档，由去重规则收口）
            var claim = {};                // id → 已占档（同名条目命中多档时取靠前者，优先序即 TIERS 序）
            var rank = {};
            for (var r = 0; r < TIERS.length; r++) rank[TIERS[r]] = r;
            var takeRow = function (row) {
                var key = row.id || (row.source + '#' + row.tier + '#' + rows.length);
                var prev = claim[key];
                if (prev && rank[prev] <= rank[row.tier]) return;   // 已有更高优先档
                claim[key] = row.tier;
                row.id = key;
                rows.push(row);
            };

            /* 3a. 秘密账：knowers 含此人 ⇒ knows；keeper 含此人且 knowers 不含 ⇒ blind；
             *           两者都没给（unlisted）⇒ undecided（**不并进 blind**）。 */
            for (var s2 = 0; s2 < secrets.length; s2++) {
                var it = secrets[s2];
                if (!it || typeof it !== 'object') { out.counts.malformed++; continue; }
                var sFloor = floorOf(it.floor);
                if (at !== null && sFloor !== null && sFloor > at) { out.counts.offTime++; continue; }
                var sKnowers = names(it.knowers);
                var sKeeper = names(it.keeper);
                var rowBase = {
                    id: 'secret:' + (text(it.id, 60) || ('s' + (s2 + 1))),
                    ref: { source: 'secret', id: text(it.id, 60) || ('s' + (s2 + 1)) },
                    floor: it.floor,
                    source: 'secret'
                };
                if (hasName(sKnowers, viewer)) {
                    takeRow(mkRow('knows', Object.assign({}, rowBase, {
                        /* knowers 是名单级判定，正文**可以**给（他已经知道了）——
                         *   但只有在他确实在名单里时。判据 B3 锁这一点。 */
                        title: text(it.secret, 180), basis: 'knower-list', reason: 'knowers-list'
                    })));
                    continue;
                }
                /* 两份名单都没给 ⇒ **判不了**（unlisted）。与 `secret-ledger.knowledgeOf` 的
                 *   'unlisted' 逐字同口径：它答「这条给没给知情名单」，不给就是判不了。 */
                if (sKnowers.length === 0 && sKeeper.length === 0) {
                    takeRow(mkRow('undecided', Object.assign({}, rowBase, { basis: 'unlisted', reason: 'no-lists' })));
                    continue;
                }
                /* 以下三档**都是有据的 blind**，但依据不同源，故 basis 必须分写（压成一档会让
                 *   「为什么他不知道」这件事在读数上再也查不回来）：
                 *     keeper-list —— 写入方**显式点名**他还不知情（最强的一条：这是写侧纪律名单）；
                 *     not-knower  —— 知情名单**给了却不含他**（与 secret-ledger 的 'listed' 同口径，
                 *                    即 filterForViewer 会把他挡下的那一格）。
                 *   为什么 keeper 命中优先于 not-knower：keeper 是「谁还不知道」的**显式枚举**，
                 *   比「不在 knowers 里」多一层写入方的主动声明，举证更强。 */
                if (hasName(sKeeper, viewer)) {
                    takeRow(mkRow('blind', Object.assign({}, rowBase, { basis: 'keeper-list', reason: 'keeper-list' })));
                    continue;
                }
                if (sKnowers.length > 0) {
                    takeRow(mkRow('blind', Object.assign({}, rowBase, { basis: 'not-knower', reason: 'not-knower' })));
                    continue;
                }
                /* 只剩「只给了 keeper、且不含他」这一格：keeper 是写侧的「谁还不知道」名单，
                 *   没枚举到他**不等于**他知道 —— 那是名单未覆盖，本模块判不了（**不并进 blind**）。 */
                takeRow(mkRow('undecided', Object.assign({}, rowBase, { basis: 'not-listed', reason: 'not-listed' })));
            }

            /* 3b. 私密心声账：owner/knowers 含此人 ⇒ knows；**属于别人 ⇒ blind**（仅该角色自己知道）。
             *     无 owner ⇒ undecided（说不出「谁知道的」就不能替任何人断言）。 */
            for (var p2 = 0; p2 < povs.length; p2++) {
                var po = povs[p2];
                if (!po || typeof po !== 'object') { out.counts.malformed++; continue; }
                var poFloor = floorOf(po.floor);
                if (at !== null && poFloor === null) { out.counts.noFloor++; continue; }
                if (at !== null && poFloor > at) { out.counts.offTime++; continue; }
                var owner = text(po.owner, 40);
                var poKnowers = names(po.knowers);
                var povBase = {
                    id: 'pov:' + (text(po.id, 60) || ('p' + (p2 + 1))),
                    ref: { source: 'pov', id: text(po.id, 60) || ('p' + (p2 + 1)) },
                    floor: po.floor,
                    source: 'pov'
                };
                if (!owner && !poKnowers.length) {
                    takeRow(mkRow('undecided', Object.assign({}, povBase, { basis: 'no-owner', reason: 'no-owner' })));
                    continue;
                }
                if (owner === viewer || hasName(poKnowers, viewer)) {
                    takeRow(mkRow('knows', Object.assign({}, povBase, {
                        title: text(po.content, 180), basis: 'pov-owner', reason: 'pov-owner'
                    })));
                    continue;
                }
                /* 只有 owner（且 owner 不是他）⇒ 仅该角色自己知道 ⇒ 他不知道，正文遮蔽。
                 *   owner 为空但有 knowers 且不含他：名单给了却没他 ⇒ 判不了（不是「确定不知道」，见 3a 同款理由）。 */
                if (owner) {
                    takeRow(mkRow('blind', Object.assign({}, povBase, { basis: 'other-owner', reason: 'other-owner' })));
                } else {
                    takeRow(mkRow('undecided', Object.assign({}, povBase, { basis: 'not-listed', reason: 'not-listed' })));
                }
            }

            /* 3c. 轨迹账：按「角色 × 事实」分桶后定档（本角色以外的桶**不进去** ——
             *     那是别人的认知，投影成他的档就是把两份脑子混成一格）。 */
            var buckets = {}, order = [];
            for (var t3 = 0; t3 < traces.length; t3++) {
                var tr = traces[t3];
                if (tr.character !== viewer) continue;
                var bkey = text(tr.fact, 180) || ('#' + tr.traceId);
                if (!buckets[bkey]) { buckets[bkey] = []; order.push(bkey); }
                buckets[bkey].push(tr);
            }
            for (var bi = 0; bi < order.length; bi++) {
                var site = buckets[order[bi]];
                var verdict = tierOfBucket(site);
                var lastRow = verdict.ref || site[site.length - 1];
                var tBase = {
                    id: 'trace:' + text(lastRow.traceId, 60),
                    ref: { source: 'trace', id: text(lastRow.traceId, 60) },
                    floor: lastRow.floor,
                    via: lastRow.via,
                    from: lastRow.from,
                    evidenceKey: lastRow.evidenceKey,
                    source: 'trace'
                };
                if (verdict.tier === 'blind') {
                    /* 撤回 / 显式 unaware：**仍不给他正文** —— 撤回的是「他知道过」，
                     *   不是「这条事实的正文可以给他」。判据 D 组锁这一点。 */
                    takeRow(mkRow('blind', Object.assign({}, tBase, { basis: verdict.basis, reason: verdict.basis })));
                } else if (verdict.tier === 'undecided') {
                    takeRow(mkRow('undecided', Object.assign({}, tBase, { basis: verdict.basis, reason: 'bucket-unresolved' })));
                } else {
                    takeRow(mkRow(verdict.tier, Object.assign({}, tBase, {
                        title: text(lastRow.fact, 180), basis: verdict.basis, reason: verdict.basis
                    })));
                }
            }

            /* ── 4. 分档落位 + 逐档有界 ─────────────────────────────── */
            for (var ri = 0; ri < rows.length; ri++) {
                var row = rows[ri];
                var bucket = out.tiers[row.tier];
                if (!bucket) { out.counts.malformed++; continue; }
                bucket.push(row);
            }
            for (var ti = 0; ti < TIERS.length; ti++) {
                var key2 = TIERS[ti];
                var arr = out.tiers[key2];
                /* 档内排序：楼层升序（时间序），楼层读不到的排最后 —— **不按到达顺序**（那不是时间序）。 */
                arr.sort(function (x, y) {
                    if (x.floor === null && y.floor === null) return 0;
                    if (x.floor === null) return 1;
                    if (y.floor === null) return -1;
                    return x.floor - y.floor;
                });
                if (arr.length > maxPerTier) {
                    out.counts.truncated += arr.length - maxPerTier;
                    out.tiers[key2] = arr.slice(0, maxPerTier);
                }
                out.counts[key2] = out.tiers[key2].length;
                for (var mi = 0; mi < out.tiers[key2].length; mi++) if (out.tiers[key2][mi].masked) out.counts.masked++;
            }
            out.counts.total = out.counts.knows + out.counts.suspects + out.counts.believes + out.counts.blind + out.counts.undecided;

            /* ── 5. 自证：盲档不得含任何来源正文（秘密三刀第 ③ 条，内置一遍） ──
             *   为什么内核自己扫一遍而不是只在测试里扫：面板与诊断都会调它，
             *   一次改动把遮蔽弄坏，这里当场把结论降级成 degraded 并写明，
             *   总比让一条正文悄悄流下去强。测试面另有更强的逐条对照（B 组）。 */
            var leak = leakScan(out, { povs: povs, secrets: secrets, traces: traces }, maxScan);
            out.leakScan = leak;
            if (leak.hits > 0) {
                out.degraded = true;
                out.notes.push('盲档泄漏自检命中 ' + leak.hits + ' 处（**管线有问题，不要把这份投影拿去写正文**）');
            }
            if (out.counts.undecided > 0) {
                out.notes.push('判不了的 ' + out.counts.undecided + ' 条**不等于**他不知道：本模块没记录过 / 名单没覆盖他');
            }
            return out;
        } catch (_e) {
            /* 不抛：本面跑在面板与诊断路径上，抛一次会连坐整轮（与全仓缝合模块同纪律）。 */
            out.degraded = true;
            out.notes.push('投影自身降级（thrown）——读数不可用，不等于「他没有认知」');
            return out;
        }
    }
    /**
     * 泄漏自检：把来源正文逐条拿去扫**投影结果的每一行**（不只盲档 —— 别的档漏出来的同样是漏）。
     *   · 只认「长度 ≥ 6」的正文片段，太短的（人名、单字）扫了全是噪声，反而把真命中淹掉；
     *   · `skipped` 如实报（有界扫描必须可见，不许静默截断）；
     *   · 返回命中**位置**（档 + 行 id），不返回正文（否则自检自己成了第二个泄漏点）。
     * 【为什么来源必须含轨迹的 fact（本模块首跑负控制当场抓到的缺口，勿再漏）】
     *   初版只扫 `pov.content` 与 `secret.secret` 两处正文，理由是「轨迹的 fact 属于 knows 档、
     *   本来就该给作者看」。但 blind 档的来源**不止名单**：撤回（retract）与显式 unaware
     *   同样是 blind 的两个 basis —— 那两条恰恰**带着 fact 正文**进档。
     *   于是「盲档被塞进轨迹正文」这件事在初版自检里扫不到：负控制（人为把 fact 塞进盲档）
     *   实测 `hits:0`，自检**假绿**。这正是本仓点名的「判据写了但没盯住真源」形态。
     *   修法是把第三处正文并进来 —— 判据不是「我以为哪些会漏」，而是「**所有**可能进档的正文」。
     */
    function leakScan(read, sources, maxScan) {
        var out = { scanned: 0, skipped: 0, tooShort: 0, hits: 0, at: [] };
        try {
            var texts = [];
            var bag = (sources && typeof sources === 'object') ? sources : {};
            var pv = Array.isArray(bag.povs) ? bag.povs : (bag.povs && Array.isArray(bag.povs.povs) ? bag.povs.povs : []);
            var sc = Array.isArray(bag.secrets) ? bag.secrets : (bag.secrets && Array.isArray(bag.secrets.items) ? bag.secrets.items : []);
            var tr = Array.isArray(bag.traces) ? bag.traces : (bag.traces && Array.isArray(bag.traces.traces) ? bag.traces.traces : []);
            /* 取样门槛与「被略掉多少」同处一栏：**短的不扫，但必须报**（见 LEAK_MIN_LEN 注释）。 */
            var take = function (v) {
                var s = text(v, 400);
                if (!s) return;
                if (s.length < LEAK_MIN_LEN) { out.tooShort++; return; }
                texts.push(s);
            };
            for (var i = 0; i < pv.length; i++) take(pv[i] && pv[i].content);
            for (var j = 0; j < sc.length; j++) take(sc[j] && sc[j].secret);
            for (var m = 0; m < tr.length; m++) take(tr[m] && (tr[m].fact || tr[m].content));
            var cap = (Number.isFinite(Number(maxScan)) && Number(maxScan) >= 1) ? Math.floor(Number(maxScan)) : MAX_LEAK_SCAN;
            if (texts.length > cap) { out.skipped = texts.length - cap; texts = texts.slice(0, cap); }
            var tiers = (read && read.tiers) || {};
            for (var ti = 0; ti < TIERS.length; ti++) {
                var arr = tiers[TIERS[ti]] || [];
                for (var k = 0; k < arr.length; k++) {
                    var row = arr[k] || {};
                    /* knows/suspects/believes 本来就该带正文（作者要看见他知道什么），
                     *   故只在**不该带正文的两档**上判泄漏。 */
                    if (row.tier !== 'blind' && row.tier !== 'undecided') continue;
                    var hay = String(row.title == null ? '' : row.title);
                    for (var ti2 = 0; ti2 < texts.length; ti2++) {
                        out.scanned++;
                        if (hay.indexOf(texts[ti2]) >= 0) {
                            out.hits++;
                            if (out.at.length < 20) out.at.push({ tier: row.tier, id: row.id });
                            break;
                        }
                    }
                }
            }
            return out;
        } catch (_e) {
            /* 降级面必须与正常面**逐字同键**：少一个 tooShort，下游读到的就是 undefined，
             *   而「undefined」在面板上会被写成 0 —— 于是「扫过且干净」这件事被凭空断言。
             *   （首跑负控制 E4 正是从这一格翻出来的，故在此把键面补齐。） */
            return { scanned: 0, skipped: 0, tooShort: 0, hits: 0, at: [], degraded: true };
        }
    }
    /** 诊断行（面板与 oplog 用；**只一行**，不给正文）。 */
    function line(read) {
        try {
            if (!read || read.kind !== POV_KIND) return '【视角投影】不可用（未产出读数）';
            if (!read.viewerKnown) {
                return '【视角投影】未选视角 · 可选 ' + (read.counts && read.counts.viewers || 0) + ' 个'
                    + '（挑一个再看：同一件事在不同人眼里不同形）';
            }
            var c = read.counts || {};
            var s = '【视角投影】' + read.viewer + ' · 有据 ' + (c.knows || 0)
                + ' / 起疑 ' + (c.suspects || 0)
                + ' / 他以为 ' + (c.believes || 0)
                + ' / 不知道 ' + (c.blind || 0)
                + ' / 判不了 ' + (c.undecided || 0);
            if (c.masked) s += ' · 遮蔽 ' + c.masked + ' 条正文';
            if (read.degraded) s += ' · ⚠️ 已降级（读数不可当结论）';
            return s;
        } catch (_e) { return '【视角投影】不可用 (thrown)'; }
    }
    /** 自检：面板与门禁用（形状自证，不碰数据）。 */
    function selfCheck() {
        var problems = [];
        try {
            if (TIERS.length !== 5) problems.push('档位必须五格（四档 + 判不了）');
            var seen = {};
            for (var i = 0; i < TIERS.length; i++) {
                var lab = TIER_LABEL[TIERS[i]];
                if (!lab) problems.push('档位缺标签：' + TIERS[i]);
                else if (seen[lab]) problems.push('档位标签同形：' + lab);
                else seen[lab] = 1;
            }
            /* blind 与 undecided 的标签**必须不同形** —— 这是本模块唯一一条最贵的纪律。 */
            if (TIER_LABEL.blind === TIER_LABEL.undecided) problems.push('「不知道」与「判不了」同形（本仓最贵的一笔老账）');
            if (!SECRET_MASK) problems.push('缺遮蔽站位串');
            return { ok: problems.length === 0, problems: problems, tiers: TIERS.length, version: POV_VERSION };
        } catch (e) {
            return { ok: false, problems: ['selfCheck thrown'], tiers: TIERS.length, version: POV_VERSION };
        }
    }
    var api = Object.freeze({
        POV_VERSION: POV_VERSION,
        POV_KIND: POV_KIND,
        TIERS: TIERS,
        TIER_LABEL: TIER_LABEL,
        SECRET_MASK: SECRET_MASK,
        MAX_PER_TIER: MAX_PER_TIER,
        actionOf: actionOf,
        tierOfBucket: tierOfBucket,
        project: project,
        leakScan: leakScan,
        line: line,
        selfCheck: selfCheck
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (typeof root !== 'undefined' && root) root.LonShaPovProjection = api;
}(typeof globalThis !== 'undefined' ? globalThis : this));