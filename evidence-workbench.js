/* ========================================================
 * evidence-workbench.js — [v3.214.0] 九账证据工作台（只读对账面）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   本仓到 v3.213.0 已有九本账：伏笔 seed / 约定 commitment / 平行事实 parallel /
 *   秘密 secret / 前文回扣 recall-echo / 回声 echo / 事实版本 fact-version /
 *   事件完整性 event-completeness / 修复闭环 repair。它们各自都实现了
 *   `list()` / `summarize()` / `render()`，但**对外是一排孤立的文本行**：
 *     · `ledger-replay.js` 的 `FLOOR_OWNERS` 只登记「谁有楼层归属」——
 *       问「删楼时该撤谁」它答得出，问「这条伏笔是什么」它答不出；
 *     · 快照 `buildBridgeSnapshot()` 的字段里**一本账都没有**：`worldProg` 只带
 *       四本账的**原始状态**（未投影、无条目形状），`_factVersionState` /
 *       `_eventThreadState` / `_repairState` 连状态都没进快照。
 *   后果是下游（手机端工作台）只能逐 App 翻，且**拿不到出处**：
 *   「这个承诺是哪一楼说的」在任何既有面里都答不出——账本条目自带
 *   `floor` / `updatedFloor` / `revealedFloor` / `settledFloor` 等你字段，
 *   但它们从未被汇成同一张可查的表。
 *
 * 【本模块补的到底是什么（不是「多读几个字段」，是三处结构性缺口）】
 *   ① **单一真源登记表**：九账是一个 `LEDGERS` 表，不是散在宿主里的九段取值代码。
 *      每项声明 ①id ②中文名 ③引用前缀 ④从 host 取状态的函数 ⑤从状态取条目的函数
 *      ⑥条目 → 投影行的函数。「加了哪本账」「哪本没接上」变成可机检事实。
 *   ② **三态读数**（与 projection-pipeline / world-ledger-reader 同规格）：
 *      · `ok`     —— 账在位且有条目
 *      · `empty`  —— 账在位、明确没有条目（空账是**真读数**，不是错误）
 *      · `absent` —— 取不到，且**原因分两类**：`module-unavailable`（账本模块未挂载）
 *        vs `state-missing`（模块在、宿主没有这本账的状态）
 *      「模块没装」「宿主没这本账」「账是空的」三者处置相反，压成一态就是错读数。
 *   ③ **出处（ref + floor）**：每条投影行带稳定引用键 `ref`（`seed:sp_3`）+ 来源账
 *      + 出处楼层。楼层取不到一律 `null`——**不写 0**：0 是「第 0 楼」这个真实读数，
 *      被「没给」吞掉正是本仓 nativenumOrNull 修过的那类错读数。
 *
 * 【本模块**不做**什么（边界）】
 *   · 不写任何账：本模块是纯读投影，全部动作只调 `list` 类只读面；
 *   · 不摸 window / 不读 storage：九账 API 由宿主经 `opts.apis` 注入
 *     （本仓纪律：纯函数内核不直接读全局，便于单测与移植）；
 *   · 不重造账本：状态从宿主既有的九本账取，绝不另存副本（另存就是第二份真源）；
 *   · 不判断「该不该改派生件」：那是 repair-loop 的职责，本模块只把账读出来。
 *
 * 【为什么 floor 用 finiteFloor 而不是 `finite(x) || 0`】
 *   `|| 0` 会把 `null`（楼层未知）读成 0（第 0 楼）——两个读数含义完全相反。
 *   本仓 T8 观察项记录的正是这个形态（各账 `copyItem` 里 `finite(item.updatedFloor)`），
 *   本模块**不重蹈**：取不到就是 null，读者自己决定怎么显示。
 * ================================================================ */
(function (root) {
    'use strict';

    const EVIDENCE_VERSION = 2;   // [v3.233.0] F-2：出处列按段真值 + detail 带来源构成（面键不变，取值更准）
    /** 单本账投影的条目上限（防一本账把面板拖死；超出如实记 truncated）。 */
    const MAX_ITEMS_PER_LEDGER = 200;
    /** 单条正文裁剪上限（与 search 的摘要宽度同量级）。 */
    const MAX_TEXT = 160;

    function text(v, max) {
        const s = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
        return max ? (s.length > max ? s.slice(0, max) + '…' : s) : s;
    }
    /* 数值归一：**没给（null / undefined / ''）与非数值（布尔 / 数组 / 对象）一律 null**。
     *
     * [v3.214.0 由本模块实测当场抓到的真缺陷，勿回退]
     *   初稿写 `Number.isFinite(Number(v)) ? Math.floor(Number(v)) : null` —— 看着安全，
     *   其实有陷阱：`Number(null) === 0`、`Number('') === 0`、`Number([]) === 0`。
     *   实测该形态：`W.finiteFloor(null)` 与 `W.finiteFloor([])` 都返回 **0**，
     *   于是「楼层未知」与「第 0 楼」这两个含义相反的读数塌成同形。
     *   这正是本仓 `numOrNull`（RubyPhone 侧 config/projection-contract.js）与
     *   TODO T8 观察项点名的同一形态。故此处显式先挡「没给」与「非数值」两类。
     *
     * 【本函数的边界：它修不了上游已塌陷的值 —— 如实记下，不冒领】
     *   上游各账 `copyItem` 里写的是 `finite(item.floor)`，而它们的 `finite` 同样是
     *   `Number.isFinite(Number(v))`：**账本在 `list()` 出口之前就已把「楼层未知」写成 0**。
     *   实测：`seed.plant(null,{hook:'z'})`（不传 floor）之后，本模块从账里读到的就是 0，
     *   本函数无从还原（信息已丢）。这是 T8 记录的上游读侧语义问题，属**上游单独一版**的事；
     *   本函数只在**上游真的给出 null/undefined/非数值**时如实挡住（防御性正确），
     *   并把「缺失 → null」这条契约钉住，免得将来有人把本模块也改成 `|| 0` 再叠一层塌陷。*/
    function finiteNumStrict(v) {
        if (v === null || v === undefined || v === '') return null;
        const t = typeof v;
        if (t === 'boolean' || t === 'object' || t === 'function') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
    }
    /** 楼层：在 finiteNumStrict 之上取整（楼层无小数）。 */
    function finiteFloor(v) {
        const n = finiteNumStrict(v);
        return n === null ? null : Math.floor(n);
    }
    function finiteNum(v) { return finiteNumStrict(v); }
    /** 名字数组归一（keeper / about / who 这类字段可能是单值也可能是一串）。 */
    function names(v, max) {
        const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
        return arr.slice(0, max || 6).map((x) => text(x, 40)).filter(Boolean);
    }
    function lower(s) { return text(s).toLowerCase(); }

    /**
     * 九账登记表（**单一真源**）。
     * 每项：
     *   id        稳定标识（ref 前缀、诊断面、下游契约都用它；改名即契约变化）
     *   label     中文名（诊断面与工作台标题）
     *   apiGlobal 账本模块的全局名（宿主据此收集 apis；本模块内只作声明，不摸 window）
     *   state     (host) => 原始状态 | undefined（取不到即 undefined ⇒ absent）
     *   pick      (api, state) => 条目数组（**只读**；不 normalize、不改状态）
     *   keyOf     (item) => 引用键（可选；条目没有 `id` 时用它，**不许回落成正文**）
     *   project   (item) => 投影行（title/detail/status/floor/source/revision）
     *   why       为什么这本账值得进工作台（缺席时也照实说出来）
     */
    const LEDGERS = Object.freeze([
        {
            id: 'seed', label: '伏笔', apiGlobal: 'LonShaSeedLedger',
            state: (h) => (h && h.worldProg ? h.worldProg.seedLedger : undefined),
            pick: (api, st) => (Array.isArray(st && st.items) ? st.items : []),
            project: (it) => ({
                title: text(it.hook, MAX_TEXT), detail: text(it.source, 60), status: text(it.status, 20),
                floor: finiteFloor(it.floor), updatedFloor: finiteFloor(it.updatedFloor),
                source: 'seedLedger', revision: finiteNum(it.revision)
            }),
            why: '未回收的伏笔是「埋了没收」的欠账，必须能按引入楼层回看'
        },
        {
            id: 'commitment', label: '约定', apiGlobal: 'LonShaCommitmentLedger',
            state: (h) => (h && h.worldProg ? h.worldProg.commitmentLedger : undefined),
            pick: (api, st) => (Array.isArray(st && st.items) ? st.items : []),
            project: (it) => ({
                title: text(it.content, MAX_TEXT),
                detail: [text(it.actor, 40), text(it.counterpart, 40)].filter(Boolean).join(' 对 ') + (it.due ? '（' + text(it.due, 40) + '前）' : ''),
                status: text(it.status, 20), floor: finiteFloor(it.floor),
                updatedFloor: finiteFloor(it.updatedFloor), source: 'commitmentLedger', revision: finiteNum(it.revision)
            }),
            why: '「谁答应过谁什么」是剧情最容易崩的那根线，且必须能追到说定的那一楼'
        },
        {
            id: 'parallel', label: '平行事实', apiGlobal: 'LonShaParallelLedger',
            state: (h) => (h && h.worldProg ? h.worldProg.parallelLedger : undefined),
            pick: (api, st) => (Array.isArray(st && st.items) ? st.items : []),
            project: (it) => ({
                title: text(it.title || it.fact, MAX_TEXT),
                detail: [text(it.place, 40), text(it.when, 40), names(it.who).join('、')].filter(Boolean).join(' · '),
                status: text(it.status, 20), floor: finiteFloor(it.floor),
                updatedFloor: finiteFloor(it.updatedFloor), source: 'parallelLedger', revision: finiteNum(it.revision)
            }),
            why: '「观众不知道但确实发生了」的事，是认知错位与揭底的前提'
        },
        {
            id: 'secret', label: '秘密', apiGlobal: 'LonShaSecretLedger',
            state: (h) => (h && h.worldProg ? h.worldProg.secretLedger : undefined),
            pick: (api, st) => (Array.isArray(st && st.items) ? st.items : []),
            project: (it) => ({
                title: text(it.secret, MAX_TEXT),
                detail: ['知情 ' + (names(it.keeper).join('、') || '（未点名）'), names(it.about).length ? '关于 ' + names(it.about).join('、') : ''].filter(Boolean).join(' · '),
                status: text(it.status, 20), floor: finiteFloor(it.floor),
                updatedFloor: finiteFloor(it.updatedFloor), source: 'secretLedger', revision: finiteNum(it.revision)
            }),
            why: '谁知道、谁还不知道，直接决定角色会不会「提前说漏」'
        },
        {
            id: 'recall-echo', label: '前文回扣', apiGlobal: 'LonShaRecallEcho',
            state: (h) => (h && h.worldProg ? h.worldProg.recallEcho : undefined),
            pick: (api, st) => (Array.isArray(st && st.items) ? st.items : []),
            project: (it) => ({
                title: text(it.detail, MAX_TEXT), detail: text(it.kind, 30) + (it.weight != null ? ' · 权重 ' + it.weight : ''),
                status: text(it.status, 20), floor: finiteFloor(it.floor),
                updatedFloor: finiteFloor(it.echoFloor), source: 'recallEcho', revision: null
            }),
            why: '「早先埋的那句该在这里回扣」——漏了就变成没头没尾的巧合'
        },
        {
            id: 'echo', label: '回声', apiGlobal: 'LonShaEchoLedger',
            state: (h) => (h && h.worldProg ? h.worldProg.echoLedger : undefined),
            pick: (api, st) => (Array.isArray(st && st.items) ? st.items : []),
            /* 引用键：本账条目**没有 `id`**（`copyItem` 只给 mode/char/floor/fields/os）。
             *   初稿按 `it.id || p.title` 回落，ref 于是变成 `echo:今天风很大`——把**正文**
             *   当键：同一条回帖一经编辑，下游存下来的 ref 就再也定位不到（而且改后
             *   新旧两条同时存在于不同记录里，看起来像两条不同证据）。
             *   故按账本自己的去重口径给稳定键：`char + mode`（`produce` 正是用它替换旧条，
             *   同一角色同一模式只可能有一条在账）。 */
            keyOf: (it) => text(it.char, 40) + '/' + text(it.mode, 20),
            project: (it) => ({
                title: text(it.os || Object.values(it.fields || {})[0], MAX_TEXT),
                detail: [text(it.mode, 20), text(it.char, 40)].filter(Boolean).join(' · '),
                status: text(it.mode, 20), floor: finiteFloor(it.floor),
                updatedFloor: null, source: 'echoLedger', revision: null
            }),
            why: '社媒/回帖里的回声是把正文事件回投到手机世界的凭据'
        },
        {
            id: 'fact-version', label: '事实版本', apiGlobal: 'LonShaFactVersion',
            state: (h) => (h ? h._factVersionState : undefined),
            pick: (api, st) => (Array.isArray(st && st.facts) ? st.facts : []),
            project: (it) => ({
                title: text([it.subject, it.predicate, it.value].filter(Boolean).join(' '), MAX_TEXT),
                detail: '来源 ' + text(it.origin || 'unknown', 30) + (it.revocable === false ? ' · 不可撤' : ''),
                status: it.revoked ? 'revoked' : 'active', floor: finiteFloor(it.floor),
                updatedFloor: finiteFloor(it.updatedFloor), source: 'factVersion', revision: finiteNum(it.revision)
            }),
            why: '「她现在住哪里」这类事实的**当时值**与换代历史都在这里'
        },
        {
            id: 'event-completeness', label: '事件完整性', apiGlobal: 'LonShaEventCompleteness',
            state: (h) => (h ? h._eventThreadState : undefined),
            pick: (api, st) => (Array.isArray(st && st.events) ? st.events : []),
            project: (it, api) => {
                // [v3.233.0] F-2：**出处列取条目真有的字段**。
                //   修前实测缺陷：本账 `copyEvent()` 产出的条目顶层**没有** floor
                //   （只有 { id,title,actors,segments,abandoned,abandonReason,revision }），
                //   而这里照抄别账写 `finiteFloor(it.floor)` ⇒ 恒 null。
                //   同一条线在事件账里明明有段楼层（如 10/11/12），面板「出处」列却永远空着 ——
                //   与同块注记里 `it.status` 恒空是**同一形态**（照抄别账的字段名），
                //   那处已被修过、这处漏了。现按段真值取**首个有楼层的段的楼层**；
                //   全段都没楼层 ⇒ 如实 null（**不写 0** —— 0 是「第 0 楼」这个真楼层）。
                const segs = Array.isArray(it.segments) ? it.segments : [];
                let firstFloor = null;
                for (const s of segs) { if (s && s.floor != null) { firstFloor = finiteFloor(s.floor); break; } }
                // [v3.233.0] F-2：来源构成进 detail（复用上游 platformFace 的同一口径，纯读）。
                //   段级 source 从没被折算过；这里只按上游词表**分级计数**，不做文本猜测（T11）。
                let comp = '';
                try {
                    const pf = (api && typeof api.platformFace === 'function') ? api.platformFace({ events: [it] }, {}) : null;
                    if (pf && pf.levels) {
                        const bits = [];
                        if (pf.levels.extract) bits.push('提取' + pf.levels.extract);
                        for (const p of (pf.platforms || [])) bits.push(p.platform + p.segments);
                        if (pf.levels.other) bits.push('其它' + pf.levels.other);
                        if (pf.levels.none) bits.push('未标' + pf.levels.none);
                        if (bits.length) comp = ' · ' + bits.join('/');
                    }
                } catch (_e) { comp = ''; }
                return {
                title: text(it.title, MAX_TEXT),
                detail: '段 ' + segs.length + comp,
                /* 状态读数取**条目真有的字段**：本账的 `copyEvent` 只给
                 *   { id, title, actors, segments, abandoned, abandonReason, revision }，
                 *   没有 `status`。初稿照抄别账写 `it.status` ⇒ 恒为空串（`text(undefined)`），
                 *   面板上这一列永远是空的——而「空」与「没弃」在这里处置相反
                 *   （弃掉的事件不该再当未完成事项追）。故按 `abandoned` 如实两态。 */
                status: it.abandoned ? 'abandoned' : 'open', floor: firstFloor,
                updatedFloor: finiteFloor(it.updatedFloor), source: 'eventCompleteness', revision: finiteNum(it.revision)
                };
            },
            why: '缺结果或后续的「未完成事项」不能被当成已了结'
        },
        {
            id: 'repair', label: '修复闭环', apiGlobal: 'LonShaRepairLoop',
            state: (h) => (h ? h._repairState : undefined),
            pick: (api, st) => (Array.isArray(st && st.repairs) ? st.repairs : []),
            project: (it) => ({
                title: text(it.action, 20) + ' ' + text(it.subject || it.target, MAX_TEXT),
                detail: (Array.isArray(it.affected) ? '派生件 ' + it.affected.length + ' 项' : '') + (it.reason ? ' · ' + text(it.reason, 60) : ''),
                status: text(it.status, 20), floor: finiteFloor(it.floor),
                updatedFloor: null, source: 'repairLoop', revision: null
            }),
            why: '「修了但没修完」必须看得见，否则源头改了、下游还指着旧值'
        }
    ]);

    /**
     * 单账三态读数（**纯函数**）。
     *
     * absent 的**两个原因必须可分**（这是本模块存在的理由之一）：
     *   · `module-unavailable` —— 账本模块未挂载（本版没这面，等上游/宿主；
     *     注意「模块没挂」与「账空」处置相反：前者应当显示为「不可用」，后者是「确实没有」）；
     *   · `state-missing`      —— 模块在，但宿主没有这本账的状态（这本账从没写过 / 被清空）。
     */
    function readLedger(spec, host, opts) {
        const o = opts || {};
        const apis = (o.apis && typeof o.apis === 'object') ? o.apis : {};
        const api = apis[spec.id] || null;
        let raw;
        try { raw = typeof spec.state === 'function' ? spec.state(host) : undefined; } catch (_e) { raw = undefined; }
        const out = {
            id: spec.id, label: spec.label, apiGlobal: spec.apiGlobal,
            apiState: api ? 'ready' : 'absent',
            state: 'absent', reason: '', count: 0, truncated: false, items: []
        };
        if (!api) {
            out.reason = 'module-unavailable';
            return out;
        }
        // 状态缺席：`undefined` 与显式 `null` **同判 absent**（宿主对「这本账没有」的两种写法），
        //   但原因单列，读者据此知道「不是模块没装」。
        if (raw === undefined || raw === null) {
            out.reason = 'state-missing';
            return out;
        }
        let items = [];
        try { items = spec.pick ? (spec.pick(api, raw) || []) : []; } catch (_e) { items = []; }
        if (!Array.isArray(items)) items = [];
        out.count = items.length;
        if (!items.length) { out.state = 'empty'; out.reason = 'no-items'; return out; }
        out.state = 'ok';
        out.truncated = items.length > MAX_ITEMS_PER_LEDGER;
        const slice = items.slice(-MAX_ITEMS_PER_LEDGER);
        for (const it of slice) {
            if (!it || typeof it !== 'object') continue;
            let p;
            // [v3.233.0] F-2：把**账本自己的 api** 交给投影函数。
            //   为什么：投影必须按该账自己的读口径折算（本模块若自行解一遍，
            //   就成了同一口径的第二份实现 —— 本仓反复治理的漏）。
            //   向后兼容：既有投影函数签名是 (it)，多一个参数对它们零影响。
            try { p = spec.project ? spec.project(it, api) : {}; } catch (_e) { p = {}; }
            const key = text(it.id || it.key || (typeof spec.keyOf === 'function' ? spec.keyOf(it) : '') || p.title, 80);
            out.items.push({
                ref: spec.id + ':' + (key || ('#' + out.items.length)),
                ledger: spec.id, ledgerLabel: spec.label,
                title: text(p.title, MAX_TEXT), detail: text(p.detail, MAX_TEXT),
                status: text(p.status, 24),
                floor: (p.floor === undefined ? null : p.floor),
                updatedFloor: (p.updatedFloor === undefined ? null : p.updatedFloor),
                source: text(p.source, 40),
                revision: (p.revision === undefined ? null : p.revision)
            });
        }
        return out;
    }

    /**
     * 九账一次取齐（**同一次调用里的账与数据必然同源**，杜绝拼装期漂移）。
     * @param {object} host 宿主实例（插件引擎；只读它的九账字段）
     * @param {object} [opts] { apis?:{id:api}, now?:()=>number }
     * @returns {{version, at, ledgers, summary, selfConsistent}}
     *   summary.counts 按三态计数；selfConsistent = 三态恰好盖满登记表（漏算即自报）
     */
    function buildWorkbench(host, opts) {
        const o = opts || {};
        let at = 0;
        try { at = Number(typeof o.now === 'function' ? o.now() : Date.now()) || 0; } catch (_e) { at = 0; }
        const ledgers = {};
        const counts = { ok: 0, empty: 0, absent: 0 };
        let items = 0;
        for (const spec of LEDGERS) {
            let r;
            try { r = readLedger(spec, host, o); }
            catch (_e) { r = { id: spec.id, label: spec.label, apiGlobal: spec.apiGlobal, apiState: 'absent', state: 'absent', reason: 'thrown', count: 0, truncated: false, items: [] }; }
            ledgers[spec.id] = r;
            if (counts[r.state] !== undefined) counts[r.state] += 1;
            items += r.items.length;
        }
        return {
            version: EVIDENCE_VERSION,
            at,
            ledgers,
            summary: { total: LEDGERS.length, counts, items },
            // 自洽：三态计数必须恰好盖满登记表（漏算即账目崩，账本自己报出来）
            selfConsistent: (counts.ok + counts.empty + counts.absent) === LEDGERS.length
        };
    }

    /** 打分：标题命中 > 正文命中；命中越靠前越高；越短越精确。未命中 -1。 */
    function scoreOf(title, detail, q) {
        if (!q) return -1;
        const t = lower(title);
        const d = lower(detail);
        let s = 0;
        if (t === q) s += 100;
        else if (t.startsWith(q)) s += 80;
        else if (t.includes(q)) s += 60;
        else if (d.includes(q)) s += 30;
        else return -1;
        const pos = d.indexOf(q);
        if (pos >= 0) s += Math.max(0, 10 - Math.floor(pos / 12));
        return s;
    }

    /**
     * 面内检索（**纯函数**）。
     *
     * 契约要点：返回**未命中的账**与缺席的账，三种处境分开：
     *   hits        —— 命中的条目（带 ref / ledger / floor，供下游跳转与贴出处）
     *   missLedgers —— 账在位、有条目，但这一问没命中（「这本账里没有」）
     *   emptyLedgers—— 账在位但空（「这本账还没记东西」）
     *   absentLedgers —— 取不到（带 reason：module-unavailable / state-missing）
     * 把后三者压成「没找到」会让用户以为「系统里没有这件事」——
     * 而真实原因可能是「这本账没接上」。
     *
     * @param {object} face buildWorkbench() 的返回值
     * @param {string} query 查询串
     * @param {object} [opts] { limit?:number, ledgers?:string[] 只查这几本 }
     * @returns {{query, hits, missLedgers, emptyLedgers, absentLedgers, scanned, limit, truncated}}
     */
    function search(face, query, opts) {
        const o = opts || {};
        const q = lower(query);
        const limit = Number.isFinite(Number(o.limit)) && Number(o.limit) > 0 ? Math.floor(Number(o.limit)) : 30;
        const only = Array.isArray(o.ledgers) && o.ledgers.length ? new Set(o.ledgers.map(String)) : null;
        const out = { query: text(query, 80), hits: [], missLedgers: [], emptyLedgers: [], absentLedgers: [], scanned: 0, limit, truncated: false };
        const ledgers = (face && face.ledgers && typeof face.ledgers === 'object') ? face.ledgers : {};
        for (const spec of LEDGERS) {
            if (only && !only.has(spec.id)) continue;
            const L = ledgers[spec.id];
            if (!L || typeof L !== 'object') { out.absentLedgers.push({ id: spec.id, label: spec.label, reason: 'state-missing' }); continue; }
            if (L.state === 'absent') { out.absentLedgers.push({ id: spec.id, label: spec.label, reason: text(L.reason, 40) || 'absent' }); continue; }
            if (L.state === 'empty') { out.emptyLedgers.push({ id: spec.id, label: spec.label }); continue; }
            let hitAny = false;
            for (const it of (Array.isArray(L.items) ? L.items : [])) {
                out.scanned += 1;
                const sc = q ? scoreOf(it.title, it.detail, q) : 1;
                if (sc < 0) continue;
                hitAny = true;
                out.hits.push({
                    ref: it.ref, ledger: it.ledger, ledgerLabel: it.ledgerLabel,
                    title: it.title, detail: it.detail, status: it.status,
                    floor: it.floor, updatedFloor: it.updatedFloor, revision: it.revision,
                    score: sc
                });
            }
            if (!hitAny) out.missLedgers.push({ id: spec.id, label: spec.label, count: L.count });
        }
        out.hits.sort((a, b) => (b.score - a.score) || String(a.ref).localeCompare(String(b.ref), 'en'));
        if (out.hits.length > limit) { out.hits = out.hits.slice(0, limit); out.truncated = true; }
        return out;
    }

    /**
     * 按 ref 定位单条（证据跳转用）。纯函数。
     * @returns {{found:boolean, item:object|null, reason:string, ledger:string}}
     *   reason ∈ { ok, bad-ref, unknown-ledger, not-found, ledger-absent }
     */
    function findRef(face, ref) {
        const s = text(ref, 120);
        if (!s || s.indexOf(':') <= 0) return { found: false, item: null, reason: 'bad-ref', ledger: '' };
        const id = s.slice(0, s.indexOf(':'));
        const ledgers = (face && face.ledgers && typeof face.ledgers === 'object') ? face.ledgers : {};
        const L = ledgers[id];
        if (!L) return { found: false, item: null, reason: 'unknown-ledger', ledger: id };
        if (L.state === 'absent') return { found: false, item: null, reason: 'ledger-absent', ledger: id };
        const hit = (Array.isArray(L.items) ? L.items : []).find((it) => it.ref === s);
        return hit ? { found: true, item: hit, reason: 'ok', ledger: id } : { found: false, item: null, reason: 'not-found', ledger: id };
    }

    /** 诊断一行（纯字符串，不抛）。**缺席与空账必须分开写**。 */
    function line(face) {
        try {
            if (!face || !face.summary) return '—（工作台异常）';
            const c = face.summary.counts || {};
            const parts = ['证据 ' + (c.ok || 0) + '/' + (face.summary.total || 0) + ' 账', '条目 ' + (face.summary.items || 0)];
            if (c.empty) parts.push('空账 ' + c.empty);
            if (c.absent) {
                const why = [];
                const ls = face.ledgers || {};
                for (const id of Object.keys(ls)) {
                    const r = ls[id];
                    if (r && r.state === 'absent') why.push(r.label + '（' + (r.reason || 'absent') + '）');
                }
                parts.push('缺席 ' + c.absent + (why.length ? '：' + why.join('、') : ''));
            }
            return parts.join(' · ');
        } catch (_e) { return '—（工作台异常）'; }
    }

    const api = Object.freeze({
        EVIDENCE_VERSION, LEDGERS, MAX_ITEMS_PER_LEDGER,
        readLedger, buildWorkbench, search, findRef, line,
        finiteFloor, finiteNum
    });
    root.LonShaEvidenceWorkbench = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
