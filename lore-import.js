/* ============================================================
 * lore-import.js — [v3.327.0 · E 包 M3-X5] 设定资料与前史的分层导入
 * ------------------------------------------------------------
 * 【它补的是哪一格(M3-X5 验收原文逐条)】
 *   作者手里有一份设定资料(TXT / Markdown / 世界书片段),里面混着四类**不同性质**的东西:
 *   设定规则(长期约束)/ 前史事件(作者规定的过去)/ 人物背景 / 仅供参考的杂料。
 *   修前实测:本仓只有 memory-books.js::PrequelSystem.importPrequel(text) ——
 *   它把**整篇文本**当一团前情存下来,按边界权重切片、按 BM25 选段注入。
 *   于是三件事在读数上同形(都只是「有一段前情文本」):
 *     · 设定规则与前史事件不分 ⇒ 世界观规则会被当成「已经发生过的事件」注入;
 *     · 没有实体映射面 ⇒ 资料里的名字与库里的名字对不上时,既不知道对不上、也不知道有几处;
 *     · 源资料更新只能整篇重导 ⇒ 玩家已确认的事实会被新版本静默覆盖。
 *   本模块把这件事收成四步:**解析分层 → 实体映射 → 逐条 diff(默认不替用户决定)→ 只审变更段**,
 *   全程**纯函数零写零联网**(读写与落账归调用方 / 既有 owner)。
 *
 * 【四条不可让步口径】
 *   1 设定不冒充聊天中已发生的事件:origin 一律 imported-lore;
 *     设定类条目若正文自称「已经发生」⇒ 出 setting-as-happened 警告并**保留类目**(不偷改类)。
 *   2 每一条前史都可查来源段:sourceRef 带文件 / 段序 / 标题 / 行区间(**段落级**,不是整篇)。
 *   3 同名映射**必须确认**:候选映射一律 mapping-needs-confirm,未确认不入计划。
 *   4 修订源资料**不自动覆盖玩家已确认事实**:与已确认事实不同值 ⇒ conflict,
 *     理由逐字 confirmed-by-player,**默认 skip**;allowReplace 也要显式列 key 才 replace。
 *
 * 【本模块不做什么(边界)】
 *   · 不联网、不建数据库、不发起任何请求(offline:true 明写自述);
 *   · 不写任何账:导入落笔走既有 owner(前史 / 事实 / 图),本模块只出解析结果、
 *     映射判定、逐条 diff、导入计划与变更段;
 *   · **不解析 Markdown 全语法**:只认标题行与段落切分(不渲染富文本);
 *   · 不抛:畸形入参一律退化为可读的降级读数。
 * 挂 window.LonShaLoreImport,供 index.js 资料导入面 / 诊断面使用。
 * ============================================================ */
(function (global) {
    'use strict';
    const LI_VERSION = 2;
    const LI_KIND = 'lore_import';
    /* 转义一律用字符码拼:本仓写入通道处理反斜杠会污染源码(零反斜杠构造纪律)。 */
    const NL = String.fromCharCode(10);
    const CR = String.fromCharCode(13);
    const TAB = String.fromCharCode(9);
    const MAX_SOURCE_CHARS = 400000;
    const SNIPPET_MAX = 80;

    /** 四类分层(**穷尽**:任何条目必须落入其中一类,不得现编类名)。 */
    const CLASSES = Object.freeze(['setting-rule', 'backstory-event', 'character-bg', 'reference-only']);
    const CLASS_LABEL = Object.freeze({
        'setting-rule': '设定规则',
        'backstory-event': '前史事件',
        'character-bg': '人物背景',
        'reference-only': '仅供参考',
    });

    /** 来源性质三态(验收1:设定资料**不是**聊天中已发生的事,开箱即写死为该值)。 */
    const ORIGIN = Object.freeze({ IMPORTED: 'imported-lore', CHAT: 'chat-confirmed', UNKNOWN: 'unknown' });

    /** 逐条判定五态(验收原文的「预览实体映射 / 冲突 / 引用,再选择性确认」)。 */
    const ADMIT = Object.freeze({
        ADD: 'add',
        SAME: 'same',
        CONFLICT: 'conflict',
        MAPPING: 'mapping-needs-confirm',
        DANGLING: 'dangling',
    });

    /** 预览三档(与 memory-package 同词表,不另立)。 */
    const PREVIEW = Object.freeze({ OK: 'ok', WARN: 'warn', BLOCKED: 'blocked' });
    /**
     * [v3.339.0 · M4-X1] 人工校订决定三态(**穷尽**):
     *   accept   —— 人工看过,接受规则判的类目(不改);
     *   override —— 人工改类(规则判错,人工指定新类);
     *   split    —— 同段混合(设定 / 前史混在一段),按人工给的切点拆成两条各带类。
     *   ★ 三态**都不改 origin**:人工改类只改「归到哪一类」,不改「这是导入资料」这件事 ——
     *     「规则不冒充已发生」这条口径对人工决定同样成立(人工也不能把资料说成聊天事实)。
     */
    const MANUAL = Object.freeze({ ACCEPT: 'accept', OVERRIDE: 'override', SPLIT: 'split' });

    /** 受限正文字段键(与前序模块**同形同值**;判据钉住三处一致)。 */
    const SECRET_BODY_KEYS = Object.freeze(['secret', 'secretText', 'secretBody']);

    /** 受限正文站位串。★ 定长:不随原文本长变化(否则长度本身就是读数)。 */
    const SECRET_MASK = String.fromCharCode(10216) + '受限正文已隐去' + String.fromCharCode(10217);

    /**
     * 依赖声明面。**只声明不执行**;每件缺席时的后果逐条写明 ——
     *   判据按 key 逐字对账(改名会静默变成「依赖缺席」)。
     *   ★ 三件**全部**是可选依赖:缺任一格都只降级对应面并具名,
     *     绝不把「不知道」写成「没有」(本仓治过多轮的错读数)。
     */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'KNOWN_ENTITIES', why: '已登记实体名清单(实体映射判定的唯一真源;缺席 ⇒ 映射面如实报未判,不报「无映射」)' },
        { key: 'CONFIRMED_FACTS', why: '用户已确认事实键值(冲突与「不自动覆盖」的判据来源;缺席 ⇒ 冲突面报未判,不报「无冲突」)' },
        { key: 'SECRET_BODY_KEYS', why: '受限正文字段键(与既有模块同形;缺席 ⇒ 受限正文**无法识别** ⇒ 拒绝解读而非放行)' },
    ]);

    /* ── 原语(本模块自持,不引兄弟模块) ── */
    function keyOf(v) {
        return (typeof v === 'string') ? v.trim() : (v === null || v === undefined ? '' : String(v).trim());
    }
    function strOf(v) { return (typeof v === 'string') ? v : (v === null || v === undefined ? '' : String(v)); }
    function arrOf(v) { return Array.isArray(v) ? v : (v === null || v === undefined || v === '' ? [] : [v]); }
    function numOr(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
    function clip(s, max) {
        const t = strOf(s);
        const m = Math.max(8, numOr(max, SNIPPET_MAX));
        return t.length <= m ? t : (t.slice(0, m - 1) + String.fromCharCode(8230));
    }
    /** 32 位散列(FNV-1a 变体;用于「变更段」与「原文指纹」,**不做加密用途**)。 */
    function hash32(s) {
        const t = strOf(s);
        let h = 2166136261;
        for (let i = 0; i < t.length; i++) {
            h ^= t.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }
    function hitAny(text, words) {
        const t = strOf(text);
        for (const w of words) if (t.indexOf(w) >= 0) return w;
        return '';
    }

    /* ── 1 分层解析(验收1 + 验收2 的落点) ── */
    const RULE_WORDS = Object.freeze(['规则', '定律', '法则', '设定', '世界观', '禁止', '必须', '永久', '恒定', 'always', '永不', '必然']);
    const EVENT_WORDS = Object.freeze(['前史', '过去', '曾经', '当年', '历史', '事件', '发生于', '大战', '结盟', '陨落']);
    const BG_WORDS = Object.freeze(['背景', '身世', '出生', '家庭', '经历', '学历', '职业', '性格', '喜好']);
    const HAPPENED_WORDS = Object.freeze(['已经发生', '已发生', '已然', '发生过', '确实发生了']);

    /**
     * 类目判定(**关键词命中即定类,命中不到一律 reference-only**)。
     *   ★ 这是**启发式**,不是语义理解:自述里带 judgeWhy(命中的词)以便人读复核。
     */
    function classify(text) {
        const t = strOf(text);
        const r = hitAny(t, RULE_WORDS);
        if (r) return { cls: 'setting-rule', why: r };
        const e = hitAny(t, EVENT_WORDS);
        if (e) return { cls: 'backstory-event', why: e };
        const b = hitAny(t, BG_WORDS);
        if (b) return { cls: 'character-bg', why: b };
        return { cls: 'reference-only', why: '' };
    }

    /** 标题行判定(只认三种:井号标题 / 【…】标题 / 以冒号结尾的独行)。 */
    function isHeading(line) {
        const l = strOf(line).trim();
        if (!l) return false;
        if (l.charAt(0) === '#') return true;
        if (l.charAt(0) === String.fromCharCode(12304) && l.indexOf(String.fromCharCode(12305)) > 0) return true;
        if (l.length <= 40 && (l.charAt(l.length - 1) === String.fromCharCode(65306) || l.charAt(l.length - 1) === ':')) return true;
        return false;
    }
    function headTitle(line) {
        let l = strOf(line).trim();
        while (l.charAt(0) === '#') l = l.slice(1).trim();
        l = l.replace(String.fromCharCode(12304), '').replace(String.fromCharCode(12305), '');
        return clip(l, 60);
    }

    /**
     * 解析源资料(**零写**)。
     *   返回 { ok, source, sections, items, classes, truncated, why }
     *   ★ sourceRef 是**段落级**:文件 / 段序 / 标题 / 行区间 —— 验收2「前史可查来源段」。
     */
    function parseSource(raw, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const input = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : { text: raw };
        const fileName = keyOf(input.file || input.name || o.fileName || '');
        let body = strOf(input.text !== undefined ? input.text : input.body);
        body = body.split(CR + NL).join(NL).split(CR).join(NL);
        const totalChars = body.length;
        const truncated = body.length > MAX_SOURCE_CHARS;
        if (truncated) body = body.slice(0, MAX_SOURCE_CHARS);
        const lines = body.split(NL);
        /* [v3.334.0 · M4-O5] 完整度面:截断 ⇒ 状态必须是「未完成」。
         *   修前缺陷(探针实测):42 万字符资料尾部唯一事实被 slice 静默丢弃,
         *   ok:true + items 全进 —— 部分结果被当完成输入,且 planApply 照常放行。
         *   修后口径:截断源 ⇒ ok:false + why 具名 source-truncated + completeness.partial,
         *   局部导入走 parseSourceWindow 显式选择范围,不再靠静默 slice。 */
        const out = { ok: false, source: { file: fileName, chars: body.length, lines: lines.length, truncated: truncated }, completeness: { state: truncated ? 'partial' : 'complete', totalChars: totalChars, readChars: body.length, truncated: truncated, nextCursor: truncated ? MAX_SOURCE_CHARS : null }, sections: [], items: [], classes: {}, why: [] };
        for (const c of CLASSES) out.classes[c] = 0;
        if (!body.trim()) return Object.assign(out, { why: ['empty-source'] });
        /* 分段:标题行开新段;标题之前的正文归第 0 段(无标题段是**真段**,不是缺项)。 */
        const marks = [];
        for (let i = 0; i < lines.length; i++) if (isHeading(lines[i])) marks.push(i);
        const bounds = [];
        if (!marks.length || marks[0] > 0) bounds.push({ title: '', from: 0, to: marks.length ? marks[0] - 1 : lines.length - 1 });
        for (let k = 0; k < marks.length; k++) {
            bounds.push({ title: headTitle(lines[marks[k]]), from: marks[k], to: (k + 1 < marks.length ? marks[k + 1] - 1 : lines.length - 1) });
        }
        let index = 0;
        for (const b of bounds) {
            index += 1;
            const text = lines.slice(b.from, b.to + 1).join(NL).trim();
            if (!text) continue;
            const cl = classify(b.title + NL + text);
            const sec = {
                index: index, title: b.title || ('段 ' + index), cls: cl.cls, judgeWhy: cl.why,
                sourceRef: { file: fileName, section: index, title: b.title || ('段 ' + index), lineFrom: b.from + 1, lineTo: b.to + 1 },
                chars: text.length, hash: hash32(text),
            };
            out.sections.push(sec);
            out.classes[cl.cls] += 1;
            out.items.push({
                key: 'L' + index + '#' + cl.cls + '#' + hash32(text).slice(0, 4),
                cls: cl.cls, clsLabel: CLASS_LABEL[cl.cls], title: sec.title,
                text: clip(text, o.snippetMax || SNIPPET_MAX), textHash: hash32(text),
                origin: ORIGIN.IMPORTED, sourceRef: sec.sourceRef,
                settingAsHappened: cl.cls === 'setting-rule' && !!hitAny(text, HAPPENED_WORDS),
                sensitive: false,
            });
        }
        /* 受限正文:入口即剥(与前序模块同纪律);受限键识别不了 ⇒ 拒绝解读而非放行。 */
        const secretKeys = Array.isArray(o.secretBodyKeys) ? o.secretBodyKeys : null;
        for (const m of arrOf(o.carriers)) {
            if (!m || typeof m !== 'object') continue;
            const hasSecret = secretKeys ? secretKeys.some((k) => m[k] !== undefined && m[k] !== null && strOf(m[k]) !== '') : false;
            if (!hasSecret) continue;
            out.items.push({
                key: 'S#' + hash32(strOf(m.key) + strOf(m.title)).slice(0, 6), cls: 'reference-only', clsLabel: CLASS_LABEL['reference-only'],
                title: clip(m.title || '', 60), text: SECRET_MASK, textHash: hash32(SECRET_MASK),
                origin: ORIGIN.IMPORTED, sourceRef: { file: fileName, section: 0, title: '', lineFrom: 0, lineTo: 0 },
                settingAsHappened: false, sensitive: true,
            });
        }
        out.ok = out.items.length > 0 && !truncated;
        if (!out.items.length) out.why.push('no-sections');
        if (truncated) out.why.push('source-truncated');
        return out;
    }

    /* ── 1b [v3.334.0 · M4-O5] 窗口解析与续读游标(长资料完整读取) ── */
    /**
     * 窗口解析(**零写**):按字符范围显式解析一段 —— 局部导入的正规入口。
     *   `opts.range = { from, to }`(字符偏移,to 可省 = 读到尾)。
     *   ★ 与 parseSource 的关系:同一套分段/分类/敏感面,只换输入切片;
     *     段的 sourceRef 额外带 window 偏移(from/to),回源可定位到**全文件坐标**。
     *   ★ 完整度独立核算:本窗口读完不代表全文件读完 —— totalChars 仍是全文件长。
     */
    function parseSourceWindow(raw, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const input = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : { text: raw };
        let full = strOf(input.text !== undefined ? input.text : input.body);
        full = full.split(CR + NL).join(NL).split(CR).join(NL);
        const totalChars = full.length;
        const from = Math.max(0, numOr((o.range && o.range.from), 0));
        const toRaw = (o.range && o.range.to !== undefined && o.range.to !== null) ? o.range.to : totalChars;
        const to = Math.min(totalChars, Math.max(from, numOr(toRaw, totalChars)));
        /* 窗口对齐:起点若落在行中间,回退到行首(段落不拦腰断);终点同理找行尾。 */
        let start = from;
        if (start > 0 && full.charAt(start - 1) !== NL) {
            const back = full.lastIndexOf(NL, start - 1) + 1;
            start = back;
        }
        let end = to;
        if (end < totalChars && full.charAt(end - 1) !== NL) {
            /* [v3.334.0] 终点对齐到**段边界**(\n\n)而非单行边界:行对齐会把跨窗段
             *   切成「完整段 + 无题半段」两种形态(textHash 不同,去重不掉 ——
             *   实测 3000 章流去重后 3002 条,多出的 2 条全是边界半段)。 */
            const fwd = full.indexOf(NL + NL, Math.max(0, end - 1));
            end = fwd < 0 ? totalChars : fwd + 1;
        }
        const aligned = full.slice(start, end);
        const res = parseSource({ text: aligned, file: keyOf(input.file || input.name || o.fileName || '') }, Object.assign({}, o, { range: null }));
        const hasNext = end < totalChars;
        res.completeness = {
            state: hasNext ? 'partial' : 'complete',
            totalChars: totalChars, readChars: end, windowFrom: start, windowTo: end,
            truncated: false, nextCursor: hasNext ? end : null,
        };
        res.window = { from: start, to: end, chars: aligned.length, hasNext: hasNext };
        /* 窗口内段的 sourceRef 补全文件坐标。 */
        for (const s of res.sections) {
            const r = s.sourceRef;
            if (r && typeof r === 'object') {
                const pre = full.slice(0, start);
                const baseLine = pre.length ? pre.split(NL).length : 1;
                r.fileFrom = start; r.fileTo = end;
                r.lineFrom = r.lineFrom + baseLine - 1;
                r.lineTo = r.lineTo + baseLine - 1;
            }
        }
        return res;
    }

    /* ── 2 实体映射(验收3:同名映射必须确认) ── */
    /**
     * 实体候选(**零写**)。
     *   `knownEntities` 形态:`[{ name, owner, aliases? }]` 或字符串数组(退化为 name=自身 / owner='')。
     *   ★ 三态互不同形:**未给清单 ⇒ checked:false(不报「无映射」)** /
     *     给了空表 ⇒ 「查了,一个都没有」/ 命中一条 ⇒ exact / 命中多条(同名异人)⇒ needs-confirm。
     */
    function entityCandidates(parsed, knownEntities, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const out = { checked: false, exact: 0, needsConfirm: 0, unresolved: 0, entries: [], why: [] };
        if (knownEntities === undefined || knownEntities === null) { out.why.push('known-entities-absent'); return out; }
        out.checked = true;
        const index = new Map();
        for (const raw of arrOf(knownEntities)) {
            const e = (raw && typeof raw === 'object') ? raw : { name: raw };
            const owners = [keyOf(e.name)].concat(arrOf(e.aliases).map(keyOf)).filter(Boolean);
            for (const nm of owners) {
                if (!index.has(nm)) index.set(nm, []);
                const owner = keyOf(e.owner) || keyOf(e.name);
                if (index.get(nm).indexOf(owner) < 0) index.get(nm).push(owner);
            }
        }
        const items = (parsed && Array.isArray(parsed.items)) ? parsed.items : [];
        for (const it of items) {
            const hay = strOf(it.title) + ' ' + strOf(it.text);
            const hits = [];
            for (const [nm, owners] of index) if (nm && hay.indexOf(nm) >= 0) hits.push({ name: nm, owners: owners.slice() });
            if (!hits.length) { out.unresolved += 1; continue; }
            const multi = hits.filter((h) => h.owners.length > 1);
            if (multi.length) {
                out.needsConfirm += 1;
                out.entries.push({ itemKey: keyOf(it.key), verdict: 'needs-confirm', hits: multi, why: '同名多主(不同宇宙 / 同名异人)不得合并' });
            } else {
                out.exact += 1;
                out.entries.push({ itemKey: keyOf(it.key), verdict: 'exact', hits: hits, why: '' });
            }
        }
        return out;
    }

    /* ── 1c [v3.339.0 · M4-X1] 人工校订面(改类 / 拆分 / 选入) ── */
    /**
     * 人工校订叠加(**零写、不改入参**)。把人工决定叠到解析结果上:
     *   `overrides` 形态:`[{ key, decision, cls?, clsA?, clsB?, at?, atText?, why? }]`
     *   或对象形态 `{ <itemKey>: { decision, cls } }`(便于 UI 回填)。
     *   返回 `{ ok, items, applied, rejected, counts, why }` ——
     *   ★ 每条 item 增 `clsRule`(规则原判,**永不丢**)/ `cls`(最终)/ `manual`(是否人工改过)/
     *     `judgeWhy`(规则判命中的词,人工改类后仍在 —— 规则痕迹与人工痕迹**分列**)。
     *   ★ 未在 overrides 里的段**保持规则判**(人工没说的不替他决定)。
     *   ★ 非法 cls(不在 CLASSES 里)⇒ 拒收并具名,不静默落回默认类。
     *   ★ 拆分切点缺(at / atText 都没给)⇒ 拒收具名 split-point-absent,不猜切点。
     */
    function applyOverrides(parsed, overrides, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const p = (parsed && typeof parsed === 'object') ? parsed : null;
        const out = { ok: false, items: [], applied: 0, rejected: [], counts: {}, why: [] };
        for (const c of CLASSES) out.counts[c] = 0;
        if (!p || !Array.isArray(p.items)) return Object.assign(out, { why: ['no-parsed-source'] });
        const map = new Map();
        const src = Array.isArray(overrides) ? overrides
            : (overrides && typeof overrides === 'object' ? Object.keys(overrides).map((k) => Object.assign({ key: k }, overrides[k])) : []);
        for (const ov of src) {
            if (!ov || typeof ov !== 'object') continue;
            const k = keyOf(ov.key);
            if (k) map.set(k, ov);
        }
        const lines = Array.isArray(o.lines) ? o.lines : null;
        const snip = numOr(o.snippetMax, SNIPPET_MAX);
        for (const it of p.items) {
            const key = keyOf(it.key);
            const base = {
                key: key, title: keyOf(it.title), text: strOf(it.text), textHash: keyOf(it.textHash),
                origin: keyOf(it.origin), sourceRef: it.sourceRef, sensitive: it.sensitive === true,
                clsRule: keyOf(it.cls), judgeWhy: keyOf(it.judgeWhy), manual: false,
            };
            const ov = map.get(key);
            const keepRule = () => {
                out.items.push(Object.assign({}, base, {
                    cls: base.clsRule, clsLabel: CLASS_LABEL[base.clsRule] || '', decision: MANUAL.ACCEPT,
                    settingAsHappened: base.clsRule === 'setting-rule' && !!hitAny(base.text, HAPPENED_WORDS),
                }));
                out.counts[base.clsRule] = (out.counts[base.clsRule] || 0) + 1;
            };
            if (!ov) { keepRule(); continue; }
            const dec = keyOf(ov.decision) || MANUAL.OVERRIDE;
            if (dec === MANUAL.SPLIT) {
                const parts = splitText(base.text, ov, lines);
                if (!parts.ok) { out.rejected.push({ key: key, why: parts.why }); keepRule(); continue; }
                const clsA = CLASSES.indexOf(keyOf(ov.clsA)) >= 0 ? keyOf(ov.clsA) : base.clsRule;
                const clsB = CLASSES.indexOf(keyOf(ov.clsB)) >= 0 ? keyOf(ov.clsB) : base.clsRule;
                out.items.push(Object.assign({}, base, {
                    key: key + '#a', text: clip(parts.a, snip), textHash: hash32(parts.a),
                    cls: clsA, clsLabel: CLASS_LABEL[clsA], manual: true, decision: MANUAL.SPLIT,
                    settingAsHappened: clsA === 'setting-rule' && !!hitAny(parts.a, HAPPENED_WORDS),
                }));
                out.items.push(Object.assign({}, base, {
                    key: key + '#b', text: clip(parts.b, snip), textHash: hash32(parts.b),
                    cls: clsB, clsLabel: CLASS_LABEL[clsB], manual: true, decision: MANUAL.SPLIT,
                    settingAsHappened: clsB === 'setting-rule' && !!hitAny(parts.b, HAPPENED_WORDS),
                }));
                out.counts[clsA] = (out.counts[clsA] || 0) + 1;
                out.counts[clsB] = (out.counts[clsB] || 0) + 1;
                out.applied += 1;
                continue;
            }
            if (dec === MANUAL.ACCEPT) { keepRule(); continue; }
            const want = keyOf(ov.cls);
            if (CLASSES.indexOf(want) < 0) {
                out.rejected.push({ key: key, why: 'bad-class', got: want });
                keepRule();
                continue;
            }
            out.items.push(Object.assign({}, base, {
                cls: want, clsLabel: CLASS_LABEL[want], manual: true, decision: MANUAL.OVERRIDE,
                manualWhy: keyOf(ov.why),
                settingAsHappened: want === 'setting-rule' && !!hitAny(base.text, HAPPENED_WORDS),
            }));
            out.counts[want] = (out.counts[want] || 0) + 1;
            out.applied += 1;
        }
        out.ok = out.rejected.length === 0;
        if (!out.applied && !out.rejected.length) out.why.push('no-overrides');
        return out;
    }
    /** 拆分原语:按人工切点切一段。切点缺(at / atText 都没给)⇒ 拒,**不猜切点**。 */
    function splitText(text, ov, lines) {
        const t = strOf(text);
        const o = (ov && typeof ov === 'object') ? ov : {};
        const atText = keyOf(o.atText);
        if (atText) {
            const i = t.indexOf(atText);
            if (i <= 0 || i >= t.length) return { ok: false, why: 'split-marker-not-found' };
            return { ok: true, a: t.slice(0, i).trim(), b: t.slice(i).trim() };
        }
        const at = numOr(o.at, NaN);
        if (!Number.isFinite(at)) return { ok: false, why: 'split-point-absent' };
        if (lines && lines.length) {
            const a = lines.slice(0, at).join(NL).trim();
            const b = lines.slice(at).join(NL).trim();
            if (!a || !b) return { ok: false, why: 'split-empty-side' };
            return { ok: true, a: a, b: b };
        }
        if (at <= 0 || at >= t.length) return { ok: false, why: 'split-out-of-range' };
        return { ok: true, a: t.slice(0, at).trim(), b: t.slice(at).trim() };
    }
    /** 单条改类(**薄封装**,走 applyOverrides —— 不另立第二份口径)。 */
    function reclassify(parsed, itemKey, cls, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const res = applyOverrides(parsed, [{ key: itemKey, decision: MANUAL.OVERRIDE, cls: cls, why: o.why }], o);
        if (res.rejected.length) return { ok: false, why: res.rejected[0].why, got: res.rejected[0].got || '', items: res.items, applied: 0 };
        return { ok: true, why: '', items: res.items, applied: res.applied };
    }
    /* ── 3 逐条 diff(验收4:不自动覆盖玩家已确认事实) ── */
    /**
     * 导入预览(**零写**)。
     *   `target.facts` 形态:`[{ key, value, confirmed?, sourceRef? }]`;
     *   `target.lore` 已是导入过的条目键清单(幂等用)。
     *   ★ 冲突默认**不替用户决定**(与 memory-package.previewImport 同纪律)。
     */
    function diffPreview(parsed, target, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const out = {
            verdict: PREVIEW.OK, entries: [], add: 0, same: 0, conflict: 0, mapping: 0, dangling: 0,
            skipped: 0, total: 0, confirmedChecked: false, knownRefsChecked: false, why: []
        };
        const p = (parsed && typeof parsed === 'object') ? parsed : null;
        if (!p || !Array.isArray(p.items)) return Object.assign(out, { verdict: PREVIEW.BLOCKED, why: ['no-parsed-source'] });
        const tgt = (target && typeof target === 'object') ? target : null;
        const facts = new Map();
        if (tgt && Array.isArray(tgt.facts)) {
            out.confirmedChecked = true;
            for (const f of tgt.facts) {
                if (!f || typeof f !== 'object') continue;
                const k = keyOf(f.key || f.subject);
                if (!k) continue;
                if (!facts.has(k)) facts.set(k, []);
                facts.get(k).push(f);
            }
        }
        const knownRefs = Array.isArray(o.knownRefs) ? o.knownRefs.map(keyOf).filter(Boolean) : null;
        out.knownRefsChecked = !!knownRefs;
        const allowReplace = arrOf(o.allowReplace).map(keyOf).filter(Boolean);
        const confirmedKeys = arrOf(o.confirmedKeys).map(keyOf).filter(Boolean);
        const mappingNeeds = new Set(arrOf(o.mappingNeedsConfirm).map(keyOf));
        for (const it of p.items) {
            const key = keyOf(it.key);
            out.total += 1;
            const rec = { key: key, cls: keyOf(it.cls), title: keyOf(it.title), action: 'add', why: 'target-absent', sensitive: it.sensitive === true };
            if (mappingNeeds.has(key)) { rec.action = 'skip'; rec.why = 'mapping-needs-confirm'; out.mapping += 1; out.skipped += 1; }
            else if (facts.has(key)) {
                const cur = facts.get(key);
                const confirmed = cur.some((f) => f.confirmed === true) || confirmedKeys.indexOf(key) >= 0;
                if (confirmed) {
                    out.conflict += 1;
                    if (allowReplace.indexOf(key) >= 0) { rec.action = 'replace'; rec.why = 'explicit-replace'; }
                    else { rec.action = 'skip'; rec.why = 'confirmed-by-player'; out.skipped += 1; }
                } else {
                    const sameV = cur.some((f) => strOf(f.value) === strOf(it.text));
                    if (sameV) { rec.action = 'skip'; rec.why = 'already-same'; out.same += 1; out.skipped += 1; }
                    else { rec.action = 'skip'; rec.why = 'undecided'; out.conflict += 1; out.skipped += 1; }
                }
            } else { out.add += 1; }
            const needRef = keyOf(it.sourceRef && it.sourceRef.file) + '#' + strOf(it.sourceRef && it.sourceRef.section);
            if (knownRefs && needRef && knownRefs.indexOf(needRef) < 0) { rec.action = (rec.action === 'skip' ? 'skip' : 'dangling'); rec.why = 'dangling-source'; out.dangling += 1; }
            out.entries.push(rec);
        }
        if (!out.confirmedChecked) out.why.push('confirmed-face-absent');
        if (!out.knownRefsChecked) out.why.push('known-refs-absent');
        out.verdict = (out.conflict || out.dangling || out.mapping || out.why.length) ? PREVIEW.WARN : PREVIEW.OK;
        return out;
    }

    /**
     * 导入计划(**只算不写**)。
     *   `importId` 只跟「源文件 + 段数 + 段指纹」走 ⇒ 同一份资料重复导入幂等;
     *   源改了一段 ⇒ 指纹变 ⇒ 新 id(这正是「重审变更段」的入口)。
     *   `seen` 由**调用方**持有并回传,本模块不偷偷存第二份幂等表。
     */
    function planApply(parsed, preview, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const out = { ok: false, importId: '', duplicate: false, applied: [], count: 0, total: 0, skipped: [], reason: '', writesNothing: true };
        const p = (parsed && typeof parsed === 'object') ? parsed : null;
        if (!p) return Object.assign(out, { reason: 'no-parsed-source' });
        const pv = (preview && typeof preview === 'object') ? preview : null;
        if (!pv) return Object.assign(out, { reason: 'no-preview', why: '必须先预览再导入(预览是唯一的冲突判据)' });
        if (pv.verdict === PREVIEW.BLOCKED) return Object.assign(out, { reason: 'preview-blocked' });
        /* [v3.334.0 · M4-O5] 截断/未完成源不得进入导入计划(修前缺陷:planApply 对
         *   truncated 资料照常 ok:true 放行)。局部导入必须走 parseSourceWindow
         *   的显式范围,其 completeness.state 为 complete 才可完整导入。 */
        const comp = (p.completeness && typeof p.completeness === 'object') ? p.completeness : null;
        if (comp && comp.state === 'partial') {
            return Object.assign(out, { reason: 'source-incomplete', why: '源未读完(' + numOr(comp.readChars, 0) + '/' + numOr(comp.totalChars, 0) + ' 字符);请用窗口解析逐段导入或显式确认局部导入', nextCursor: numOr(comp.nextCursor, null) });
        }
        const src = (p.source && typeof p.source === 'object') ? p.source : {};
        const secs = Array.isArray(p.sections) ? p.sections : [];
        const fingerprint = hash32(secs.map((s) => strOf(s.hash)).join('|'));
        const importId = 'li_' + hash32(keyOf(src.file) + '#' + secs.length + '#' + fingerprint);
        out.importId = importId;
        const seen = arrOf(o.seen).map(keyOf).filter(Boolean);
        if (seen.indexOf(importId) >= 0) return Object.assign(out, { ok: true, duplicate: true, reason: 'duplicate-import', count: 0 });
        const entries = Array.isArray(pv.entries) ? pv.entries : [];
        out.total = entries.length;
        /* [v3.339.0 · M4-X1] 选入面:给了 selected ⇒ 只落选中的段(未选段具名 not-selected,
         *   不静默丢 —— 「未选段不写」是验收原文,而「没选」与「选了但落不下」必须可分)。 */
        const selected = Array.isArray(o.selected) ? o.selected.map(keyOf).filter(Boolean) : null;
        for (const e of entries) {
            if (!e || typeof e !== 'object') continue;
            const ek = keyOf(e.key);
            if (selected && selected.indexOf(ek) < 0) { out.skipped.push({ key: ek, why: 'not-selected' }); continue; }
            if (e.action === 'skip') { out.skipped.push({ key: ek, why: keyOf(e.why) }); continue; }
            out.applied.push({ key: keyOf(e.key), cls: keyOf(e.cls), action: keyOf(e.action), sensitive: e.sensitive === true });
        }
        out.count = out.applied.length;
        out.ok = true;
        out.reason = out.count ? 'ok' : 'nothing-to-apply';
        return out;
    }

    /**
     * 变更段(**验收原文「源更新只重审变更段」的落点**)。
     *   按段序 + 标题 + 指纹逐段对账;四态 `added` / `removed` / `changed` / `same`
     *   各自独立计数。★ 段序对不上时按**标题**再对一次(作者插了一段不该让后面全部报 changed),
     *   标题也找不到的旧段仍然计入 removed(不许静默丢)。
     */
    function changedSections(oldParsed, newParsed) {
        const out = { added: [], removed: [], changed: [], same: [], counts: { added: 0, removed: 0, changed: 0, same: 0 }, oldChecked: false, why: [] };
        const a = (oldParsed && Array.isArray(oldParsed.sections)) ? oldParsed.sections : null;
        const b = (newParsed && Array.isArray(newParsed.sections)) ? newParsed.sections : [];
        if (!a) { out.why.push('no-old-source'); out.counts.added = b.length; out.added = b.slice(); return out; }
        out.oldChecked = true;
        const usedNew = new Set();
        const titleMap = new Map();
        for (let i = 0; i < b.length; i++) {
            const t = keyOf(b[i].title);
            if (t && !titleMap.has(t)) titleMap.set(t, i);
        }
        for (let i = 0; i < a.length; i++) {
            const oldSec = a[i];
            let j = (i < b.length && keyOf(b[i].title) === keyOf(oldSec.title)) ? i : -1;
            if (j < 0) { const k = titleMap.get(keyOf(oldSec.title)); if (k !== undefined && !usedNew.has(k)) j = k; }
            if (j < 0) { out.removed.push({ section: oldSec.index, title: keyOf(oldSec.title), hash: keyOf(oldSec.hash) }); continue; }
            usedNew.add(j);
            if (keyOf(b[j].hash) === keyOf(oldSec.hash)) out.same.push({ section: b[j].index, title: keyOf(b[j].title) });
            else out.changed.push({ section: b[j].index, title: keyOf(b[j].title), fromHash: keyOf(oldSec.hash), toHash: keyOf(b[j].hash), clsFrom: keyOf(oldSec.cls), clsTo: keyOf(b[j].cls) });
        }
        for (let j = 0; j < b.length; j++) if (!usedNew.has(j)) out.added.push({ section: b[j].index, title: keyOf(b[j].title), hash: keyOf(b[j].hash) });
        out.counts.added = out.added.length;
        out.counts.removed = out.removed.length;
        out.counts.changed = out.changed.length;
        out.counts.same = out.same.length;
        return out;
    }

    /** 来源链(**引用而非拷贝**:只回来源坐标 + 指纹,不回整段正文)。 */
    function provenanceOf(parsed, itemKey) {
        const items = (parsed && Array.isArray(parsed.items)) ? parsed.items : [];
        const it = items.filter((x) => keyOf(x.key) === keyOf(itemKey))[0];
        if (!it) return { found: false, why: 'no-such-item', ref: null, textHash: '' };
        const r = (it.sourceRef && typeof it.sourceRef === 'object') ? it.sourceRef : {};
        return {
            found: true, why: '', textHash: keyOf(it.textHash), cls: keyOf(it.cls), origin: keyOf(it.origin),
            ref: { file: keyOf(r.file), section: numOr(r.section, 0), title: keyOf(r.title), lineFrom: numOr(r.lineFrom, 0), lineTo: numOr(r.lineTo, 0) },
        };
    }
    /** 跨模块禁用复查:设定类条目**不得**被读成聊天中已发生的事(验收1)。 */
    function originVerdict(item) {
        const it = (item && typeof item === 'object') ? item : {};
        const org = keyOf(it.origin) || ORIGIN.UNKNOWN;
        return {
            origin: org, isLore: org === ORIGIN.IMPORTED,
            mayCountAsHappened: org === ORIGIN.CHAT,
            note: org === ORIGIN.UNKNOWN ? '来源未知 ⇒ 不得当作已发生事件' : (org === ORIGIN.IMPORTED ? '导入设定 ⇒ 仅用于理解背景,不冒充已发生' : ''),
        };
    }

    function describe(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = [];
        for (const need of REQUIRED_DEPS) if (d[need.key] === undefined || d[need.key] === null) missing.push({ key: need.key, why: need.why });
        return {
            kind: LI_KIND, version: LI_VERSION, classes: CLASSES.slice(),
            classLabels: CLASSES.map((c) => CLASS_LABEL[c]), origin: Object.keys(ORIGIN).map((k) => ORIGIN[k]),
            admit: Object.keys(ADMIT).map((k) => ADMIT[k]), preview: Object.keys(PREVIEW).map((k) => PREVIEW[k]),
            secretBodyKeys: SECRET_BODY_KEYS.slice(), secretMask: SECRET_MASK, maxSourceChars: MAX_SOURCE_CHARS,
            manual: Object.keys(MANUAL).map((k) => MANUAL[k]), manualDecisions: 3,
            present: REQUIRED_DEPS.length - missing.length, total: REQUIRED_DEPS.length, missing: missing,
            offline: true, writesNothing: true,
            /* ★ 类目穷尽:拿四段**真文本**过一遗 classify,要求产出集合恰好等于词表
             *   (不是对常量自己断言 —— 那是本仓定性过的自我指涉判据)。 */
            classesExhaustive: (function () {
                const probes = ['世界观规则:此处永久禁止飞行', '前史:当年发生过大 战', '人物背景:他出生于北方', '一段随手记下的杂物'];
                const got = probes.map((t) => classify(t).cls);
                for (const c of CLASSES) if (got.indexOf(c) < 0) return false;
                return got.every((v) => CLASSES.indexOf(v) >= 0);
            })(),
            /* ★ 定长掩码:站位串不随原文本长变化(否则长度本身就是读数)。 */
            /* ★ 定长掩码探针:长短两条真受限载体各跑一遭 parseSource,
             *   要求两条的 text **恒等于** SECRET_MASK(否则长度本身就是读数)。 */
            maskFixedLength: (function () {
                const a = parseSource({ text: 'x' }, { secretBodyKeys: SECRET_BODY_KEYS, carriers: [{ key: 'k1', title: 't', secret: 'x' }] });
                const b = parseSource({ text: 'x' }, { secretBodyKeys: SECRET_BODY_KEYS, carriers: [{ key: 'k2', title: 't', secret: 'x'.repeat(300) }] });
                const pick = (r) => {
                    const hit = (r.items || []).filter((i) => i.sensitive === true)[0];
                    return hit ? hit.text : '';
                };
                return pick(a) === SECRET_MASK && pick(b) === SECRET_MASK;
            })(),
            /* ★ 设定不得冒充已发生:@«一个自带『已发生』字样的设定类探针»过 classify,
             *   要求**类目不变**(只出警告,**不偷改类**)。 */
            settingVsHappenedSplit: (function () {
                const t = '世界观规则:此事已经发生,永久有效';
                const c = classify(t);
                return c.cls === 'setting-rule' && !!hitAny(t, HAPPENED_WORDS);
            })(),
            note: missing.length ? '依赖缺 ' + missing.length + ' 格(' + missing.map((m) => m.key).join('、') + ')' : '依赖齐备',
        };
    }

    function selfCheck(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = REQUIRED_DEPS.filter((n) => d[n.key] === undefined || d[n.key] === null).map((n) => n.key);
        const dsc = describe(d);
        return {
            ok: missing.length === 0 && dsc.classesExhaustive === true, version: LI_VERSION,
            depsComplete: missing.length === 0, missing: missing,
            classesExhaustive: dsc.classesExhaustive === true,
            settingVsHappenedSplit: dsc.settingVsHappenedSplit === true,
            classesDistinct: new Set(CLASSES).size === CLASSES.length,
            manualDistinct: new Set(Object.keys(MANUAL).map((k) => MANUAL[k])).size === 3,
            offline: true, writesNothing: true,
        };
    }

    /** 诊断一行(四态分开报;「没导过」与「导了零条」不同形)。 */
    function line(read) {
        try {
            if (!read || typeof read !== 'object') return '尚未导入过(无记录 · 四类分层 · 离线零写)';
            const parts = ['导入 ' + keyOf(read.verdict || '—')];
            if (numOr(read.sections, null) !== null) parts.push('段 ' + numOr(read.sections, 0));
            if (numOr(read.count, null) !== null) parts.push('进 ' + numOr(read.count, 0));
            if (read.duplicate === true) parts.push('重复');
            if (numOr(read.conflict, 0)) parts.push('⚠️ 冲突 ' + numOr(read.conflict, 0));
            if (numOr(read.mapping, 0)) parts.push('映射待认 ' + numOr(read.mapping, 0));
            if (read.changed) parts.push('变更段 ' + numOr(read.changed, 0));
            if (read.confirmedChecked === false) parts.push('已确认面未判');
            if (read.reason) parts.push('理由 ' + keyOf(read.reason));
            return parts.join(' · ');
        } catch (_e) { return '—(资料导入面异常)'; }
    }

    const api = Object.freeze({
        LI_VERSION, LI_KIND, CLASSES, CLASS_LABEL, ORIGIN, ADMIT, PREVIEW, MANUAL,
        SECRET_BODY_KEYS, SECRET_MASK, REQUIRED_DEPS, MAX_SOURCE_CHARS,
        keyOf, strOf, arrOf, numOr, clip, hash32, classify, isHeading, parseSource, parseSourceWindow,
        entityCandidates, diffPreview, planApply, changedSections, provenanceOf, originVerdict,
        applyOverrides, reclassify, splitText,
        describe, selfCheck, line,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaLoreImport = api;
})(typeof window !== 'undefined' ? window : globalThis);
