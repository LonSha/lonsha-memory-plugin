/* ============================================================
 * story-annual.js — [v3.327.0 · E 包 M3-X7] 章节回顾与可编辑故事年鉴
 * ------------------------------------------------------------
 * 【它补的是哪一格(M3-X7 验收原文逐条)】
 *   本仓已有的叙事产物生成器(narrative-generators.js:日记 / 反思 / 大纲)都是**面向角色或作者**
 *   的生成器,没有一处回答 M3-X7 点名的这一问:**玩家回看某一章时,该看什么**。
 *   修前实测三处缺口(不是「再加一个按钮」):
 *     1 **没有章节粒度** —— 分层摘要(SummarySystem)按窗口切,项目注册表(project-registry)
 *       有卷章结构,但两边**没有接起来** —— 一个章到底对应哪几楼、里面发生过什么无处可读;
 *     2 **没有证据矿** —— 回顾里的每一句话都可能被读成事实,而它**没有任何一处指向原文**;
 *       原文改了之后回顾依然照旧显示,没人知道它过期了;
 *     3 **没有两版可分** —— 作者想看的全知版与能给玩家看的无剧透版,修前是同一种东西;
 *       把它给玩家看 = 直接剧透(本仓把「把作者面混进玩家面」治过多轮)。
 *   本模块只做五件事:**按章提取四要素 / 两版可分 / 编辑的是草稿不反写事实 /
 *   文风编辑不污染记忆库 / 原文改动指出对应段过期**,纯函数零写零联网。
 *
 * 【四条不可让步口径】
 *   1 每一条回顾都可跳证据:`evidence[]` 带 floor + ref + 指纹(段落级,不是整章一个号)。
 *   2 编辑的是**作品草稿**:`edit()` 只收草稿允许字段,任何事实位
 *     (`state` / `facts` / `floor` / `ref`)一律 `rejected` 并逐字理由 `draft-only`。
 *   3 两版**必须可分**:无剧透版按**在场角色白名单**过滤(未在场角色名不得出现),
 *     并且**回顾文本本身就不得含未来线索**(提取时就按章切,不读后面章节)。
 *   4 原文改动 ⇒ 对应段**过期**(stale),逐条报 `staleReason`;过期不等于删除(读数仍可读)。
 *
 * 【本模块不做什么(边界)】
 *   · 不读本机存储、不发请求、不写任何账(读写归调用方 / 既有 owner);
 *   · **不重建摘要引擎**:摘要交调用方传入(复用 SummarySystem 与分层摘要);
 *   · **不渲染页**(排版是面层的事),只出结构化的章节册;
 *   · 不抛:畸形入参一律退化为可读的降级读数。
 * 挂 window.LonShaStoryAnnual,供 index.js 回顾面 / 诊断面使用。
 * ============================================================ */
(function (global) {
    'use strict';
    const SA_VERSION = 2;
    const SA_KIND = 'story_annual';
    const NL = String.fromCharCode(10);
    const ELLIPSIS = String.fromCharCode(8230);
    const QUOTE_L = String.fromCharCode(8220);
    const QUOTE_R = String.fromCharCode(8221);
    const ITEM_MAX = 60;

    /** 四要素(**穷尽**;验收原文:关键事件 / 人物变化 / 未了事项 / 精选原话)。 */
    const ELEMENTS = Object.freeze(['events', 'changes', 'unfinished', 'quotes']);
    const ELEMENT_LABEL = Object.freeze({ events: '关键事件', changes: '人物变化', unfinished: '未了事项', quotes: '精选原话' });

    /** 两版(**不得合流**):spoiler-free 给玩家、authorial 给作者。 */
    const VERSIONS = Object.freeze(['spoiler-free', 'authorial']);

    /** 草稿允许字段(编辑只动这些:风格 / 选段 / 标题;事实位一概不收)。 */
    const DRAFT_FIELDS = Object.freeze(['title', 'summary', 'highlights', 'quotes', 'style', 'note']);

    /** 事实位字段 —— 出现即拒(这些属于记忆库,不属于草稿)。 */
    const FACT_FIELDS = Object.freeze(['state', 'facts', 'floor', 'floorFrom', 'floorTo', 'ref', 'evidenceRef', 'chars']);

    /** 八股味词表(只用于**报读数**,不自动改写;人读面须自己看到)。 */
    const SMOKE_WORDS = Object.freeze(['不禁', '顿时', '仿佛', '宛如', '缓缓', '微微', '轻轻地', '淡淡道', '略一沉吟', '一时间', '不由得']);
    /** 恶劣词表(泄漏检查:草稿不得沾上脏话 / 出戏字串)。 */
    const FOUL_WORDS = Object.freeze(['出戏', '圈内', '系统提示', 'token', 'prompt', 'NSFW']);

    const REQUIRED_DEPS = Object.freeze([
        { key: 'CHAPTERS', why: '卷章结构(哪些楼属于哪一章的唯一真源;缺席 ⇒ 报「章面未判」,**不猜章界**)' },
        { key: 'SUMMARY', why: '分层摘要读口(复用既有摘要,本模块不重建摘要引擎;缺席 ⇒ 报未判)' },
        { key: 'QUOTES', why: '原话选取器(演示稿 / 对话选段;缺席 ⇒ 「精选原话」一栏报未判而非空栏)' },
    ]);

    function keyOf(v) { return (typeof v === 'string') ? v.trim() : (v === null || v === undefined ? '' : String(v).trim()); }
    function strOf(v) { return (typeof v === 'string') ? v : (v === null || v === undefined ? '' : String(v)); }
    function arrOf(v) { return Array.isArray(v) ? v : (v === null || v === undefined || v === '' ? [] : [v]); }
    function numOr(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
    function clip(s, max) {
        const t = strOf(s);
        const m = Math.max(8, numOr(max, ITEM_MAX));
        return t.length <= m ? t : (t.slice(0, m - 1) + ELLIPSIS);
    }
    function hash32(s) {
        const t = strOf(s);
        let h = 2166136261;
        for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = (h * 16777619) >>> 0; }
        return ('0000000' + h.toString(16)).slice(-8);
    }

    /* ── 1 章节册(零写) ── */
    /**
     * 归一章节读入。
     *   `payload.chapters` 形态:`[{ ref:{project,volume,chapter}, title, floorFrom, floorTo,
     *      events:[{floor,text,chars:[],evidenceRef?}], changes:[{char,from,to,floor}],
     *      open:[{key,text,floor}], quotes:[{floor,text,speaker}], summary }]`
     *   ★ 无 `chapters` ⇒ **章面未判**(why:'chapters-absent'),不报「没有章节」。
     */
    function build(payload, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const p = (payload && typeof payload === 'object') ? payload : null;
        const out = { kind: SA_KIND, version: SA_VERSION, ok: false, chapters: [], counts: {}, chaptersChecked: false, why: [] };
        for (const e of ELEMENTS) out.counts[e] = 0;
        if (!p || !Array.isArray(p.chapters)) { out.why.push('chapters-absent'); return out; }
        out.chaptersChecked = true;
        for (const raw of p.chapters) {
            if (!raw || typeof raw !== 'object') continue;
            const ref = (raw.ref && typeof raw.ref === 'object') ? raw.ref : {};
            const floorFrom = numOr(raw.floorFrom, 0);
            const floorTo = numOr(raw.floorTo, floorFrom);
            const chapter = {
                ref: { project: keyOf(ref.project), volume: keyOf(ref.volume), chapter: keyOf(ref.chapter) },
                title: keyOf(raw.title) || ('第 ' + numOr(ref.chapter, 0) + ' 章'),
                floorFrom: floorFrom, floorTo: floorTo, floors: Math.max(0, floorTo - floorFrom + 1),
                events: [], changes: [], unfinished: [], quotes: [], evidence: [],
                summary: clip(raw.summary, o.summaryMax || 400), stale: false, staleReason: '',
            };
            for (const ev of arrOf(raw.events)) {
                if (!ev || typeof ev !== 'object') continue;
                chapter.events.push({ floor: numOr(ev.floor, 0), text: clip(ev.text, o.itemMax),
                    chars: arrOf(ev.chars).map(keyOf).filter(Boolean) });
            }
            for (const ch of arrOf(raw.changes)) {
                if (!ch || typeof ch !== 'object') continue;
                chapter.changes.push({ char: keyOf(ch.char), from: keyOf(ch.from), to: keyOf(ch.to), floor: numOr(ch.floor, 0) });
            }
            for (const op of arrOf(raw.open)) {
                if (!op || typeof op !== 'object') continue;
                chapter.unfinished.push({ key: keyOf(op.key), text: clip(op.text, o.itemMax), floor: numOr(op.floor, 0) });
            }
            for (const q of arrOf(raw.quotes)) {
                if (!q || typeof q !== 'object') continue;
                chapter.quotes.push({ floor: numOr(q.floor, 0), text: clip(q.text, (o.quoteMax || 120)), speaker: keyOf(q.speaker) });
            }
            /* 证据位**只算一处**:build 与 staleRefs 走同一个 evidenceOf(两份推法一定会漂)。 */
            chapter.evidence = evidenceOf(chapter);
            /* ref 必须带**条目类**:同楼可同时有事件 / 变化 / 原话,不加类就会撞成同一个 ref
             *   ⇒ 同载荷自比对也会假报「过期」(本仓治过的同形错)。 */
            for (const rec of chapter.events) rec.evidenceRef = ('ch' + keyOf(ref.chapter) + '#event@' + rec.floor);
            for (const rec of chapter.changes) rec.evidenceRef = ('ch' + keyOf(ref.chapter) + '#change@' + rec.floor);
            out.counts.events += chapter.events.length;
            out.counts.changes += chapter.changes.length;
            out.counts.unfinished += chapter.unfinished.length;
            out.counts.quotes += chapter.quotes.length;
            out.chapters.push(chapter);
        }
        out.ok = out.chapters.length > 0;
        if (!out.ok) out.why.push('no-chapters');
        return out;
    }

    /** 元素面名(复数)→ 证据条目类(单数):两边**只能有一套拼法**,否则 ref 永远对不上。 */
    function evKind(e) { return keyOf(e) === 'unfinished' ? 'unfinished' : keyOf(e).replace(/s$/, ''); }

    /** 从**裸章节载荷**推该章证据位(与 build 同源;build 只是间接调它)。
     *   ★ 允许新旧两版载荷直接对账:比对时不必先过一次 build(否则「过期」读的可能是自造的 id)。
     */
    function evidenceOf(chapter) {
        const c = (chapter && typeof chapter === 'object') ? chapter : {};
        const ref = (c.ref && typeof c.ref === 'object') ? c.ref : {};
        const cid = keyOf(ref.chapter);
        const rows = [];
        const push = function (kind, arr, seed) {
            for (const it of arrOf(arr)) {
                if (!it || typeof it !== 'object') continue;
                const fl = numOr(it.floor, 0);
                rows.push({ kind: kind, floor: fl, ref: keyOf(it.evidenceRef) || ('ch' + cid + '#' + kind + '@' + fl), hash: hash32(seed(it)) });
            }
        };
        push('event', c.events, function (it) { return strOf(it.text); });
        push('change', c.changes, function (it) { return keyOf(it.char) + '>' + keyOf(it.to); });
        /* 未了事项在裸载荷里叫 open(build 之后叫 unfinished):两边都要认得,
         *   否则 build 之后重算证据位会**静静少一类**(实测过:5 条变 4 条)。 */
        push('unfinished', (c.open !== undefined ? c.open : c.unfinished), function (it) { return strOf(it.text); });
        push('quote', c.quotes, function (it) { return strOf(it.text); });
        return rows;
    }

    /** 依据 : 、: 、。切句,并剥掉行首序号 / 点号。 */
    function splitPoints(text) {
        const t = strOf(text).replace(/^[0-9]+[.、)]\s*/, '');
        return t.split(/[:：。;；]/).map(function (x) { return x.trim(); }).filter(Boolean);
    }

    /**
     * 摘要图省事时从摘要里拆出四要素(**零写**),并逐条标明**证据不足**。
     *   ★ 未给 evidences ⇒ `evidence` 为空且 `evidenceChecked:false`,**不报「有证据」也不报「无证据」**。
     */
    function review(chapterRef, payload, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const out = {
            ok: false, ref: {}, title: '', summary: '',
            elements: { events: [], changes: [], unfinished: [], quotes: [] },
            evidence: [], evidenceChecked: false, evidenceMissing: 0, evidenceBound: 0, why: []
        };
        const p = (payload && typeof payload === 'object') ? payload : null;
        if (!p) return Object.assign(out, { why: ['no-payload'] });
        const want = keyOf(chapterRef);
        const list = Array.isArray(p.chapters) ? p.chapters : [];
        let ch = null;
        for (const c of list) {
            const ref = (c && typeof c.ref === 'object') ? c.ref : {};
            if (keyOf(ref.chapter) === want || keyOf(c.title) === want) { ch = c; break; }
        }
        if (!ch) return Object.assign(out, { why: ['no-such-chapter'] });
        out.ref = Object.assign({}, ch.ref);
        out.title = keyOf(ch.title);
        /* summary is one of the five faces named in the plan; review did not carry it
         *   before this cut, so the summary face was forever empty in the gate. */
        out.summary = strOf(ch.summary);

        for (const e of ELEMENTS) {
            /* ★ 裸载荷里未了事项叫 open、build 之后叫 unfinished:两版都要认得。
             *   只认一边会让「未了事项」在裸载荷上**静静变空**(实测过:elements.unfinished 恒空 ⇒ 绑定 0 条)。 */
            const src = (e === 'unfinished')
                ? ((ch.open !== undefined) ? ch.open : ch.unfinished)
                : ch[e];
            out.elements[e] = Array.isArray(src) ? src.slice() : [];
        }
        out.ok = true;
        /* 证据绑定:逐条挂证据位;**缺证据的条目单独计数**(不静默当成有据)。
          *   ★ 两入口:已过 build 的章直接读 ch.evidence;裸载荷**现算**(与 build 同源)。
         *     并给返回的元素条目补上 evidenceRef(**浅拷,不改入参**)——
         *     否则调用方拿到的条目没有可跳的号,「每条可跳证据」就只是一句话。 */
        const CID = keyOf((ch.ref && ch.ref.chapter) || '');
        const evs = (Array.isArray(ch.evidence) && ch.evidence.length) ? ch.evidence : evidenceOf(ch);
        out.evidence = evs.slice();
        out.evidenceChecked = typeof o.evidences === 'object' && !!o.evidences;
        for (const e of ELEMENTS) {
            out.elements[e] = out.elements[e].map(function (it) {
                return Object.assign({}, it, { evidenceRef: keyOf(it && it.evidenceRef)
                    || ('ch' + CID + '#' + evKind(e) + '@' + numOr(it && it.floor, 0)) });
            });
        }
        for (const e of ELEMENTS) {
            for (const it of out.elements[e]) {
                const r = keyOf(it && (it.evidenceRef || it.key));
                /* 逐字同号优先;两边条目类拼法不一致(复数元素名 vs 单数 kind)时**同号即命中**,
                     *   否则同一条目会被自己的证据位判成「缺据」(实测过:5 条只绑上 1 条)。 */
                const head = keyOf(r).split('@')[0];
                const hit = !!r && evs.some(function (x) {
                    const xr = keyOf(x.ref);
                    return xr === r || (!!head && xr.split('@')[0] === head);
                });
                if (hit) out.evidenceBound += 1;
                else out.evidenceMissing += 1;
            }
        }
        if (!out.evidence.length) out.why.push('no-evidence');
        return out;
    }

    /**
     * 两版可分(**零写**)。
     *   `allowedChars` = **本章在场角色**白名单(调用方传);无剧透版**只保留白名单内的角色**,并且
     *   **正文里出现白名单外的角色名 = 泄漏**,逐条具名 `leakedChars`。
     *   全知版带 `authorialOnly` 标记(哪些条是玩家版看不到的)。
     */
    /**
     * 逐条**可知性判决**（纯函数、零写）。[v3.336.0 · M4-O9]
     *   计划原文：无剧透回顾按**事实可知性**裁剪，而不是按角色名名单。
     *   ★ 本模块**不建权限表**：判决一律由调用方经 `gate.resolve(item, meta)` 注入
     *     （宿主侧从 knowledge-trace / secret-ledger / fact-version 与实体别名现算）。
     *     没给判决 ⇒ **判不了**（withhold 并计数）：不按名单放行、也不假装已去剧透。
     */
    function spoilerGate(item, meta, gate) {
        const it = (item && typeof item === 'object') ? item : {};
        const m = (meta && typeof meta === 'object') ? meta : {};
        const g = (gate && typeof gate === 'object') ? gate : null;
        if (!g || typeof g.resolve !== 'function') {
            return { decision: 'withhold', basis: 'no-gate', fact: '', why: 'no-gate' };
        }
        let v = null;
        try { v = g.resolve(it, m); } catch (_e) { v = null; }
        if (!v || typeof v !== 'object') {
            return { decision: 'withhold', basis: 'no-verdict', fact: '', why: 'no-verdict' };
        }
        const d = (v.decision === 'allow') ? 'allow' : 'withhold';
        return {
            decision: d,
            basis: keyOf(v.basis) || (d === 'allow' ? 'known-at-floor' : 'not-known-at-floor'),
            fact: keyOf(v.fact),
            why: keyOf(v.why) || (d === 'allow' ? '' : 'withheld'),
        };
    }

    /**
     * 按事实可知性裁剪的两版（**零写**）。[v3.336.0 · M4-O9]
     *   ① **五面全覆盖**：标题 / 摘要 / 正文引用（事件·人物变化）/ 未了事项 / 精选原话。
     *      修前只裁事件·变化·原话，**未了事项一律清空** —— 已公开的未结伏笔被一并抹掉；
     *   ② **逐条判决**：每条经 `gate.resolve` 现算（事实 × 时点）；判不了 ⇒ 遮蔽并**单独计数**；
     *   ③ **匿名条目不再默认放行**：修前「没写 chars ⇒ return true」——
     *      没有角色名的秘密靠名单根本判断不了，却按放行处置（最坏的一格）。
     *      本路径下匿名条目一律经闸，判不了即遮蔽；
     *   ④ **旧名伪装对账**：泄漏扫描按 `gate.aliasOf` 把已知名展开成**别名族**再扫，
     *      修前只按名册原名逐字找 ⇒ 伪装期的旧名一个都扫不出来；
     *   ⑤ **作者版仍全量可读**（不裁），并报 `overRedacted`：「安全但整篇空白」不算完成。
     */
    function gatedVersions(rev, o) {
        const out = {
            spoilerFree: null, authorial: null, leakedChars: [], aliasesChecked: [],
            versionsDistinct: false, why: [], gated: true,
            kept: 0, withheld: 0, undecided: 0, unknownFact: 0, overRedacted: false,
            byKind: { title: 0, summary: 0, events: 0, changes: 0, unfinished: 0, quotes: 0 },
            blessed: { title: 0, summary: 0, events: 0, changes: 0, unfinished: 0, quotes: 0 },
            /* 判不了但**仍留在玩家版**的条数（当前只有未了事项面走这一格：公开的承诺没有秘密封条，
             *   按「判不了即遮蔽」处置会把已公开的未结伏笔一并抹掉）。 */
            undecidedKept: { title: 0, summary: 0, events: 0, changes: 0, unfinished: 0, quotes: 0 },
        };
        const r = (rev && typeof rev === 'object') ? rev : null;
        if (!r || !r.ok) { out.why.push('no-review'); return out; }
        const gate = (o && typeof o.gate === 'object') ? o.gate : null;
        if (!gate || typeof gate.resolve !== 'function') { out.why.push('no-gate'); return out; }
        const atRaw = gate.atFloor;
        const atFloor = (atRaw === null || atRaw === undefined || atRaw === '') ? null : numOr(atRaw, null);
        if (atFloor === null) out.why.push('no-at-floor');
        const decide = function (kind, item) {
            const v = spoilerGate(item, { kind: kind, atFloor: atFloor, chapter: Object.assign({}, r.ref) }, gate);
            out.byKind[kind] = numOr(out.byKind[kind], 0) + 1;
            if (v.decision === 'allow') {
                out.kept += 1;
                out.blessed[kind] = numOr(out.blessed[kind], 0) + 1;
                return true;
            }
            /* ★ 未了事项面：**判不了**一律保留并单列计数。
             *   为什么单列这一格（M4-O9 验收原文「已公开的未结伏笔保留」）：
             *     未了事项（承诺/悬念）**不是秘密** —— 宿主侧的 promise:* 条目由承诺账现算，
             *     其存在本身已是明面；按「判不了即遮蔽」处置等于把修前的「一律清空」
             *     改了个名字（第一版实测：B1 保留 1/2、C4 未了面长度 0）。
             *     秘密面**真判下来**的遮蔽（secret-sealed / alias-gated / not-known-at-floor）
             *     照旧拦；只有「判决没做」这一格放过，且**如实计进 undecidedKept** ——
             *     「保留了多少条其实没判」必须能从读数里看见，不许静默当成判过。 */
            if (kind === 'unfinished' && v.basis === 'no-verdict') {
                out.undecidedKept[kind] = numOr(out.undecidedKept[kind], 0) + 1;
                out.kept += 1;
                out.blessed[kind] = numOr(out.blessed[kind], 0) + 1;
                return true;
            }
            out.withheld += 1;
            if (v.basis === 'no-verdict' || v.basis === 'no-gate') out.undecided += 1;
            if (!v.fact) out.unknownFact += 1;
            return false;
        };
        const keepList = function (kind, list) {
            return arrOf(list).filter(function (it) { return decide(kind, it); });
        };
        const known = arrOf(o && o.knownChars).map(keyOf).filter(Boolean);
        const aliasOf = (typeof gate.aliasOf === 'function') ? gate.aliasOf : null;
        /* 标题 / 摘要也走闸 —— 修前它们根本不裁（标题里写着「乙的真身」也照样给玩家）。 */
        /* Empty faces must not pass the gate (they leak nothing; counting them
         *   only inflates kept/withheld). B1 fixture has no summary. */
        const titleOk = keyOf(r.title) ? decide('title', { text: keyOf(r.title) }) : true;
        const sumOk = strOf(r.summary) ? decide('summary', { text: strOf(r.summary) }) : true;
        out.spoilerFree = {
            version: 'spoiler-free', ref: Object.assign({}, r.ref),
            title: titleOk ? keyOf(r.title) : '',
            summary: sumOk ? keyOf(r.summary) : '',
            elements: {
                events: keepList('events', r.elements.events),
                changes: keepList('changes', r.elements.changes),
                unfinished: keepList('unfinished', r.elements.unfinished),
                quotes: keepList('quotes', r.elements.quotes),
            },
            evidence: arrOf(r.evidence).slice(),
        };
        out.authorial = {
            version: 'authorial', title: keyOf(r.title), ref: Object.assign({}, r.ref),
            summary: strOf(r.summary),
            elements: {
                events: arrOf(r.elements.events).slice(), changes: arrOf(r.elements.changes).slice(),
                unfinished: arrOf(r.elements.unfinished).slice(), quotes: arrOf(r.elements.quotes).slice(),
            },
            evidence: arrOf(r.evidence).slice(),
        };
        /* 泄漏扫描：扫**放行后的玩家版**（扫原卷会把已遮蔽的条目也算成泄漏），
         *   并且按别名族展开 —— 伪装期的旧名这才扫得出来。 */
        if (known.length) {
            const bodies = [out.spoilerFree.title, out.spoilerFree.summary];
            const collect = function (list) {
                for (const it of arrOf(list)) bodies.push(strOf(it && it.text) + strOf(it && it.to) + strOf(it && it.from) + strOf(it && it.char));
            };
            collect(out.spoilerFree.elements.events); collect(out.spoilerFree.elements.changes);
            collect(out.spoilerFree.elements.unfinished); collect(out.spoilerFree.elements.quotes);
            const blob = bodies.join(NL);
            const leaked = [];
            for (const nm of known) {
                const fam = [nm];
                if (aliasOf) {
                    let a = null;
                    try { a = aliasOf(nm); } catch (_e) { a = null; }
                    for (const x of arrOf(a).map(keyOf).filter(Boolean)) if (fam.indexOf(x) < 0) fam.push(x);
                }
                if (fam.some(function (x) { return !!x && blob.indexOf(x) >= 0; })) leaked.push(nm);
            }
            out.leakedChars = leaked;
            if (aliasOf) out.aliasesChecked = known.slice();
            else out.why.push('alias-face-absent');
        } else out.why.push('chars-face-absent');
        const authTotal = (keyOf(r.title) ? 1 : 0) + (strOf(r.summary) ? 1 : 0)
            + out.authorial.elements.events.length + out.authorial.elements.changes.length
            + out.authorial.elements.unfinished.length + out.authorial.elements.quotes.length;
        const freeTotal = (out.spoilerFree.title ? 1 : 0) + (out.spoilerFree.summary ? 1 : 0)
            + out.spoilerFree.elements.events.length + out.spoilerFree.elements.changes.length
            + out.spoilerFree.elements.unfinished.length + out.spoilerFree.elements.quotes.length;
        out.overRedacted = authTotal > 0 && freeTotal === 0;
        if (out.overRedacted) out.why.push('over-redacted');
        out.spoilerFree.note = '无剧透版:按**事实可知性**逐条裁剪(时点 ' + (atFloor === null ? '未判' : String(atFloor))
            + ' · 保留 ' + out.kept + ' / 遮蔽 ' + out.withheld
            + (out.undecided ? ' · 其中判不了 ' + out.undecided : '')
            + (out.unknownFact ? ' · 无事实引用 ' + out.unknownFact : '')
            + (out.undecidedKept.unfinished ? ' · 未了判不了但保留 ' + out.undecidedKept.unfinished : '') + ')';
        out.authorial.note = '作者全知版:含未了事项与全部人物线,不得直接给玩家'
            + (known.length ? '(已登记角色 ' + known.length + ' 人)' : '');
        out.versionsDistinct = JSON.stringify(out.spoilerFree.elements) !== JSON.stringify(out.authorial.elements)
            || out.authorial.note !== out.spoilerFree.note || out.spoilerFree.title !== out.authorial.title;
        return out;
    }

    /**
     * **给玩家 / 生成侧的那一版**（零写）。[v3.336.0 · M4-O9]
     *   ★ 本函数**绝不回退到作者版**：去剧透没做成（未给可知性面 / 没回顾 / 整篇裁空）
     *     ⇒ `ok:false` + `reason` + `version:null`，由调用方显示「这一章暂时不能给玩家看」。
     *     把作者面当兜底正是本仓治过多轮的那类直接剧透。
     */
    function forPlayer(rev, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const tv = twoVersions(rev, o);
        const bad = function (why) {
            return {
                ok: false, version: null, reason: why, spoilerFree: null, authorial: null,
                gated: !!(tv && tv.gated), note: '不接作者版:去剧透未成立(' + why + ')', writesNothing: true,
            };
        };
        if (!tv || !tv.spoilerFree) return bad((tv && arrOf(tv.why)[0]) || 'no-review');
        if (tv.gated !== true) return bad('knowledge-face-absent');
        for (const k of arrOf(tv.why)) if (k === 'no-gate' || k === 'over-redacted') return bad(k);
        return {
            ok: true, version: tv.spoilerFree, spoilerFree: tv.spoilerFree, authorial: null,
            reason: '', gated: true, kept: tv.kept, withheld: tv.withheld, undecided: tv.undecided,
            note: '按事实可知性裁剪后的玩家版', writesNothing: true,
        };
    }

    function twoVersions(rev, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        /* ★ [v3.336.0 · M4-O9] 给了**可知性面**就走逐事实逐时点闸（新路径）；
         *   未给 ⇒ 旧口径**原样保留**并在 why 里具名（不假装已按可知性裁）。 */
        if (o.gate && typeof o.gate === 'object' && typeof o.gate.resolve === 'function') return gatedVersions(rev, o);
        const out = { spoilerFree: null, authorial: null, leakedChars: [], versionsDistinct: false, why: [] };
        const r = (rev && typeof rev === 'object') ? rev : null;
        if (!r || !r.ok) return Object.assign(out, { why: ['no-review'] });
        const allowList = arrOf(o.allowedChars).map(keyOf).filter(Boolean);
        const allowSet = new Set(allowList);
        const charsChecked = allowList.length > 0;
        const known = arrOf(o.knownChars).map(keyOf).filter(Boolean);
        const chFilter = function (list) {
            return (Array.isArray(list) ? list : []).filter(function (it) {
                const cs = arrOf(it && it.chars).map(keyOf);
                if (!cs.length) return true;              /* 没写角色 ⇒ 不因缺字段被裁 */
                if (!charsChecked) return true;           /* 白名单未给 ⇒ 不裁(不假装已去剧透) */
                return cs.every(function (c) { return allowSet.has(c); });
            });
        };
        const pick = function (deep) {
            return {
                version: deep ? 'authorial' : 'spoiler-free', title: keyOf(r.title), ref: Object.assign({}, r.ref),
                elements: {
                    events: chFilter(r.elements.events), changes: deep ? r.elements.changes.slice() : chFilter(r.elements.changes),
                    unfinished: deep ? r.elements.unfinished.slice() : [], quotes: deep ? r.elements.quotes.slice() : chFilter(r.elements.quotes),
                },
                evidence: r.evidence.slice(),
            };
        };
        out.spoilerFree = pick(false);
        out.authorial = pick(true);
        out.spoilerFree.note = charsChecked ? '无剧透版:只含在场角色(白名单 ' + allowList.length + ' 人)' : '⚠️ 未给在场角色白名单 ⇒ 未做去剧透(不报已去)';
        out.authorial.note = '作者全知版:含未了事项与全部人物线,不得直接给玩家'
            + (known.length ? '(已登记角色 ' + known.length + ' 人)' : '');
        /* 泄漏扫描:无剧透版正文里出现「已知角色名但不在白名单」⇒ 逐条具名。 */
        if (charsChecked && known.length) {
            const bodies = [];
            const collect = function (list) { for (const it of arrOf(list)) bodies.push(strOf(it && it.text) + strOf(it && it.to) + strOf(it && it.from)); };
            collect(r.elements.events); collect(r.elements.changes); collect(r.elements.quotes);
            const blob = bodies.join(NL);
            const leaked = [];
            for (const nm of known) if (!allowSet.has(nm) && blob.indexOf(nm) >= 0) leaked.push(nm);
            out.leakedChars = leaked;
        } else {
            out.why.push('chars-face-absent');
        }
        out.versionsDistinct = JSON.stringify(out.spoilerFree.elements) !== JSON.stringify(out.authorial.elements)
            || out.authorial.note !== out.spoilerFree.note;
        return out;
    }

    /**
     * 文风编辑模拟(**验收原文「作者改文风不污染记忆库」的落点**)。
     *   `belletristic(text)` 只做两件事:统计八股味与恶劣词读数 + 逐字给结论;
     *   **不改写一个字**,更不产生任何事实位字段。
     */
    function belletristic(text, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const t = strOf(text);
        const smokes = SMOKE_WORDS.filter(function (w) { return t.indexOf(w) >= 0; });
        const fouls = FOUL_WORDS.filter(function (w) { return t.indexOf(w) >= 0; });
        const maxSmoke = numOr(o.maxSmoke, 0);
        const maxFoul = numOr(o.maxFoul, 0);
        return {
            chars: t.length, smokeHits: smokes.length, smokeWords: smokes,
            foulHits: fouls.length, foulWords: fouls,
            smokeReasons: smokes.map(function (w) { return w + '@' + t.indexOf(w); }),
            verdict: (fouls.length <= maxFoul && smokes.length <= maxSmoke) ? 'clean' : 'smoky',
            writesNothing: true, note: '只报读数、不改写一个字(改写由人做)',
        };
    }

    /**
     * 编辑草稿(**纯函数,返回新 state;不改入参、不写账**)。
     *   ★ 事实位字段出现即 `rejected` 并逐字 `draft-only`(编辑的不是事实);
     *   ★ 未登记字段同样拒(不静默丢弃)。
     */
    function edit(state, patch) {
        const out = { ok: false, state: null, changed: [], rejected: [], reason: '' };
        const s = (state && typeof state === 'object') ? state : null;
        const p = (patch && typeof patch === 'object') ? patch : null;
        if (!s) return Object.assign(out, { reason: 'no-state' });
        if (!p) return Object.assign(out, { reason: 'no-patch' });
        const next = {};
        for (const k of Object.keys(s)) next[k] = s[k];
        for (const k of Object.keys(p)) {
            if (FACT_FIELDS.indexOf(k) >= 0) { out.rejected.push({ key: k, why: 'draft-only', note: '事实位不属于草稿:改它得走记忆库的处置面' }); continue; }
            if (DRAFT_FIELDS.indexOf(k) < 0) { out.rejected.push({ key: k, why: 'unknown-field', note: '未登记字段不得静默丢弃' }); continue; }
            if (next[k] !== p[k]) { next[k] = p[k]; out.changed.push(k); }
        }
        out.state = next;
        out.ok = out.changed.length > 0 || out.rejected.length > 0;
        out.reason = out.changed.length ? 'edited' : (out.rejected.length ? 'rejected-only' : 'no-change');
        return out;
    }

    /**
     * 过期判定(**验收「原文改动提示对应段过期」的落点**)。
     *   逐章逐证据比指纹:变了的**逐条列出具名 `staleRefs`**,没变的仍为 fresh。
     *   旧章不在新载荷里 ⇒ **整章过期**且 `missing:true`(不是删除)。
     */
    function staleRefs(oldChapters, newPayload) {
        const out = { stale: 0, fresh: 0, missingChapters: 0, staleRefs: [], why: [], all: [] };
        const olds = Array.isArray(oldChapters) ? oldChapters : null;
        if (!olds) { out.why.push('no-old-chapters'); return out; }
        const np = (newPayload && typeof newPayload === 'object') ? newPayload : null;
        if (!np || !Array.isArray(np.chapters)) { out.why.push('no-new-payload'); return out; }
        const now = new Map();
        for (const c of np.chapters) {
            if (!c || typeof c !== 'object') continue;
            const ref = (c.ref && typeof c.ref === 'object') ? c.ref : {};
            const cid = keyOf(ref.project) + '/' + keyOf(ref.volume) + '/' + keyOf(ref.chapter);
            const m = new Map();
            for (const ev of evidenceOf(c)) m.set(keyOf(ev.ref), keyOf(ev.hash));
            now.set(cid, m);
        }
        for (const c of olds) {
            if (!c || typeof c !== 'object') continue;
            const ref = (c.ref && typeof c.ref === 'object') ? c.ref : {};
            const cid = keyOf(ref.project) + '/' + keyOf(ref.volume) + '/' + keyOf(ref.chapter);
            if (!now.has(cid)) { out.missingChapters += 1; out.all.push({ chapter: cid, verdict: 'missing' }); continue; }
            const m = now.get(cid);
            for (const ev of evidenceOf(c)) {
                const r = keyOf(ev.ref);
                if (!m.has(r)) { out.stale += 1; out.staleRefs.push({ chapter: cid, ref: r, why: 'gone' }); out.all.push({ chapter: cid, ref: r, verdict: 'stale' }); continue; }
                if (m.get(r) !== keyOf(ev.hash)) { out.stale += 1; out.staleRefs.push({ chapter: cid, ref: r, why: 'hash-changed' }); out.all.push({ chapter: cid, ref: r, verdict: 'stale' }); }
                else { out.fresh += 1; out.all.push({ chapter: cid, ref: r, verdict: 'fresh' }); }
            }
        }
        return out;
    }

    function describe(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = [];
        for (const need of REQUIRED_DEPS) if (d[need.key] === undefined || d[need.key] === null) missing.push({ key: need.key, why: need.why });
        return {
            kind: SA_KIND, version: SA_VERSION, elements: ELEMENTS.slice(), elementLabels: ELEMENTS.map(function (e) { return ELEMENT_LABEL[e]; }),
            versions: VERSIONS.slice(), draftFields: DRAFT_FIELDS.slice(), factFields: FACT_FIELDS.slice(),
            smokeWords: SMOKE_WORDS.slice(), foulWords: FOUL_WORDS.slice(), itemMax: ITEM_MAX,
            present: REQUIRED_DEPS.length - missing.length, total: REQUIRED_DEPS.length, missing: missing,
            offline: true, writesNothing: true,
            /* ★ 两版真跑一遍真载荷,要求两版**字段集不同形**(不是对常量自断言)。 */
            versionsDistinct: (function () {
                const p = { chapters: [{ ref: { project: 'p', volume: 'v', chapter: '1' }, title: '开篇',
                    events: [{ floor: 3, text: '她推开门', chars: ['甲'] }, { floor: 9, text: '乙在暗处看着', chars: ['乙'] }],
                    changes: [{ char: '乙', from: '陌生', to: '敌意', floor: 9 }],
                    open: [{ key: 'o1', text: '乙到底要干什么', floor: 9 }],
                    quotes: [{ floor: 3, text: '进来吧', speaker: '甲' }] }] };
                const rv = review('1', p, {});
                const tv = twoVersions(rv, { allowedChars: ['甲'], knownChars: ['甲', '乙'] });
                return tv.versionsDistinct === true && (tv.spoilerFree.elements.unfinished || []).length === 0;
            })(),
            /* ★ 草稿白名单探针:事实位必须被拒(拿真 edit 跑,不是读常量)。 */
            draftOnlyEnforced: (function () {
                const r = edit({ title: 'x' }, { state: { a: 1 } });
                return r.rejected.length === 1 && r.rejected[0].why === 'draft-only' && r.state.state === undefined;
            })(),
            /* ★ 泄漏扫描探针:把白名单外角色写进正文 ⇒ 必须报出该名字。 */
            leakScanWorks: (function () {
                const p = { chapters: [{ ref: { chapter: '1' }, title: 't', events: [{ floor: 1, text: '丙出场了', chars: ['丙'] }] }] };
                const rv = review('1', p, {});
                const tv = twoVersions(rv, { allowedChars: ['甲'], knownChars: ['甲', '丙'] });
                return (tv.leakedChars || []).indexOf('丙') >= 0;
            })(),
            note: missing.length ? '依赖缺 ' + missing.length + ' 格(' + missing.map(function (m) { return m.key; }).join('、') + ')' : '依赖齐备',
        };
    }

    function selfCheck(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = REQUIRED_DEPS.filter(function (n) { return d[n.key] === undefined || d[n.key] === null; }).map(function (n) { return n.key; });
        const dsc = describe(d);
        return {
            ok: missing.length === 0 && dsc.versionsDistinct === true && dsc.draftOnlyEnforced === true,
            version: SA_VERSION, depsComplete: missing.length === 0, missing: missing,
            versionsDistinct: dsc.versionsDistinct === true,
            draftOnlyEnforced: dsc.draftOnlyEnforced === true,
            leakScanWorks: dsc.leakScanWorks === true,
            offline: true, writesNothing: true,
        };
    }

    /** 诊断一行(四态分开;**没看过**与**看了零条**不同形)。 */
    function line(read) {
        try {
            if (!read || typeof read !== 'object') return '尚未生成过(无记录 · 四要素 · 两版可分 · 离线零写)';
            const parts = ['年鉴 ' + keyOf(read.verdict || '—')];
            if (numOr(read.chapters, null) !== null) parts.push('章 ' + numOr(read.chapters, 0));
            if (numOr(read.events, null) !== null) parts.push('事件 ' + numOr(read.events, 0));
            if (numOr(read.unfinished, 0)) parts.push('未了 ' + numOr(read.unfinished, 0));
            if (numOr(read.stale, 0)) parts.push('⚠️ 过期段 ' + numOr(read.stale, 0));
            if (arrOf(read.leakedChars).length) parts.push('⚠️ 泄露 ' + arrOf(read.leakedChars).length + ' 人');
            if (read.smokeHits) parts.push('八股味 ' + numOr(read.smokeHits, 0));
            if (read.reason) parts.push('理由 ' + keyOf(read.reason));
            return parts.join(' · ');
        } catch (_e) { return '—(年鉴面异常)'; }
    }

    const api = Object.freeze({
        SA_VERSION, SA_KIND, ELEMENTS, ELEMENT_LABEL, VERSIONS, DRAFT_FIELDS, FACT_FIELDS,
        SMOKE_WORDS, FOUL_WORDS, REQUIRED_DEPS, ITEM_MAX,
        keyOf, strOf, arrOf, numOr, clip, hash32, splitPoints, evidenceOf,
        build, review, twoVersions, gatedVersions, spoilerGate, forPlayer, belletristic, edit, staleRefs,
        describe, selfCheck, line,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaStoryAnnual = api;
})(typeof window !== 'undefined' ? window : globalThis);
