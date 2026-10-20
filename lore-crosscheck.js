/* ========================================================
 * lore-crosscheck.js — [v3.347.0 · M4-X9] 资料与剧情分区的联合查证
 * (纯函数,零依赖)
 *
 * 【为什么需要这一面 / 修前缺口(不是「再建一套 RAG」)】
 *   M4-X9 点名的底座**已在盘上**,而且已交付:
 *     · lore-import.js 保存**段落来源与类别**(setting-rule / backstory-event /
 *       character-bg / reference-only)+ ORIGIN(一律 imported-lore)+ settingAsHappened 标志位;
 *     · evidence-query.js 按**账本**查询(参与者 / 时间 / 来源 / 状态);
 *     · 前史片段、正文资料、聊天事实来自**不同 owner**。
 *   它们合起来答不了 M4-X9 点名的这一问:
 *     **「设定怎么说、剧情实际是否做到?」**
 *   逐面看为什么答不了:
 *     1 **两侧不同形**:资料侧读数是「N 段资料」,剧情侧是「N 条账行」——
 *       并排看也说不清某一条设定**在剧情里兑现了没有**;
 *     2 **设定会被当成已发生**:资料里写着「已经发生」的规则 / 前史,一查就与
 *       聊天事实**同形**出现在结果里 —— 参考小说的事件被当成当前会话已发生;
 *     3 **撤除后仍被引用**:某段资料撤除后,历史答案里仍留着它的正文 ——
 *       「来源失效」这件事在读数上**没有落点**(静默);
 *     4 **批注冒充原文**:用户批注(笔记)与资料原文、聊天事实**三者同形**。
 *
 * 【本模块只做一件事:一次受控的**分区联合查证**】
 *   · 受控 sourceMode:chat-only(仅剧情)/ lore-only(仅资料)/ compare(对照);
 *   · 来源分区:chat(剧情事实)/ lore(资料原文)/ note(用户批注)/ unknown(来源未判);
 *   · 判定六态(**穷尽且互不同形**):matched / divergent / unrealized /
 *     lore-only / chat-only / unchecked;
 *   · 闸:lore **不默认并入正史**(loreInCanon 恒 false;admitLore 才进 admitted);
 *   · 撤除:revokedKeys 里的资料正文**一格不带**,引用过它的历史来源报 sourceStale;
 *   · 同名跨资料人物:两侧同名但来源不同 ⇒ needsConfirm(**不硬合并**)。
 *   本模块**不自己存储**(纯函数面,与 material-pack.js / return-gate.js 同规格);
 *   **不联网**、**不建开放 RAG**、**不复制全文到每轮上下文**、**不产正文**;
 *   原文**按需**从 owner 读(本面只搬运 sourceRef,不缓存正文)。
 *
 * 【三条纪律(与 material-pack.js / narrative-layer.js / testimony-board.js 同规格)】
 *   1 只读投影:不写库(写库仍由 index.js 的导入 / 事实账负责),只做分区与判定;
 *   2 不抛:输入畸形一律降级为读数(degraded / malformed 计数),绝不外抛;
 *   3 不猜:缺字段**如实留空**并进 gaps;同名不硬合并,判不了就是判不了
 *     (unchecked 单列,不与 matched 同形)。
 *
 * 【与 M4-X1(lore-import.js)的分工(两项**不重叠**)】
 *   那一面答「这段资料是什么类别、来源哪一段、要不要人工改类」(导入与校订);
 *   本面答「这段资料**在剧情里兑现了没有**」(分区 + 判定 + 撤除)。
 *   本面**只消费** X1 的解析读数(items 的 cls / origin / sourceRef /
 *   settingAsHappened),**不强依赖**:没有 X1 时按调用方直给的分区走。
 *
 * 【可移植性说明】
 *   机制动机来自「把『设定怎么说、剧情是否做到』做成产品输出时,两侧读数不同形
 *   会让『兑现没兑现』无处可查,且撤除后的失效没有落点」这一通用失效形态;
 *   实现按本仓规范重写(零依赖、不抛、判据保守且可复算、读数齐备),
 *   未复制任何外部代码。
 * ======================================================== */(function (root) {
    'use strict';
    const CX_VERSION = 1;
    const CX_KIND = 'lore_crosscheck';
    /* 转义一律用字符码拼:本仓写入通道处理反斜杠会污染源码(零反斜杠构造纪律)。 */
    const NL = String.fromCharCode(10);
    const SP = String.fromCharCode(32);
    const ELL = String.fromCharCode(8230);
    /** 受控来源模式(**穷尽**:查询目标必须落入其中一格,不得现编态名)。 */
    const SOURCE_MODES = Object.freeze(['chat-only', 'lore-only', 'compare']);
    const MODE_LABEL = Object.freeze({ 'chat-only': '仅剧情', 'lore-only': '仅资料', compare: '对照' });
    const DEFAULT_MODE = 'compare';
    /** 来源分区(**穷尽**):剧情事实 / 资料原文 / 用户批注 / 来源未判。
     *   ★ 批注是**用户批注**,既不冒充原文,也不冒充事实(R4-X8 口径)。 */
    const PARTITIONS = Object.freeze(['chat', 'lore', 'note', 'unknown']);
    const PARTITION_LABEL = Object.freeze({ chat: '剧情事实', lore: '资料原文', note: '用户批注', unknown: '来源未判' });
    /** 来源性质(**与 lore-import.js 的 ORIGIN 同词表**,不另立)。 */
    const ORIGIN = Object.freeze({ IMPORTED: 'imported-lore', CHAT: 'chat-confirmed', NOTE: 'user-note', UNKNOWN: 'unknown' });
    /**
     * 判定六态(**穷尽且互不同形**)。前三态是 M4-X9 验收点名的三例:
     *   · matched    —— 设定与剧情一致(**已**兑现);
     *   · divergent  —— 已发生但**偏离设定**(两侧都在,值对不上);
     *   · unrealized —— 资料声称「已发生」但剧情侧**无对应**(未发生的设定事件);
     *   · lore-only  —— 只在资料里(资料未声称已发生,剧情也没涉及);
     *   · chat-only  —— 只在剧情里(剧情有,资料没写);
     *   · unchecked  —— 两侧命中同题但**没给一致性判据**(判不了,不猜一致)。
     */
    const VERDICTS = Object.freeze(['matched', 'divergent', 'unrealized', 'lore-only', 'chat-only', 'unchecked']);
    const VERDICT_LABEL = Object.freeze({
        matched: '设定与剧情一致',
        divergent: '已发生但偏离设定',
        unrealized: '设定事件未发生',
        'lore-only': '只在资料里',
        'chat-only': '只在剧情里',
        unchecked: '判不了',
    });
    /** 单条摘要最多几字。 */
    const SNIPPET_MAX = 80;
    /** 分区池上限(有界,防灌爆)。 */
    const MAX_ITEMS = 400;
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(与 M4-X5 / X6 / X7 / X8 同口径)。 */
    const PERCENT_KEYS = Object.freeze(['percent', 'confidence', 'score', 'probability', 'prob']);
    /** 折行归一(**零正则、零反斜杠**:逐字符把 CR / LF / TAB 换成空格再收空白)。 */
    function oneLine(value) {
        const s = String(value == null ? '' : value);
        let buf = '';
        for (let i = 0; i < s.length; i++) {
            const c = s.charCodeAt(i);
            buf += (c === 10 || c === 13 || c === 9) ? SP : s.charAt(i);
        }
        const parts = buf.split(SP);
        const keep = [];
        for (let i = 0; i < parts.length; i++) if (parts[i] !== '') keep.push(parts[i]);
        return keep.join(SP);
    }
    /** 裁剪(统一走 oneLine,免得读数里混进换行;省略号走字符码,零反斜杠)。 */
    function clip(s, n) {
        const t = oneLine(s);
        return n && t.length > n ? t.slice(0, n - 1) + ELL : t;
    }
    /** 键归一(去首尾空白;非串给空串)。 */
    function keyOf(v) {
        return oneLine(v == null ? '' : v);
    }
    /** 文本化(缺省空串)。 */
    function strOf(v) {
        return v == null ? '' : String(v);
    }
    /** 数组归一(非数组 ⇒ 空数组;不丢原元素,只做浅拷贝)。 */
    function arrOf(v) {
        return Array.isArray(v) ? v.slice() : [];
    }
    /** 数值归一(没给 ⇒ 默认;布尔 / 对象 / 函数 ⇒ 默认,不拿 0 冒充「就是 0」)。 */
    function numOr(v, dflt) {
        if (v === null || v === undefined || v === '') return (dflt === undefined ? null : dflt);
        if (typeof v === 'boolean' || typeof v === 'object' || typeof v === 'function') return (dflt === undefined ? null : dflt);
        const n = Number(v);
        return Number.isFinite(n) ? n : (dflt === undefined ? null : dflt);
    }
    /** 楼层:只认 number 与非空整数串;其余如实 null(**不编 0**:0 是「第 0 楼」)。 */
    function floorOf(v) {
        const n = numOr(v, null);
        if (n === null) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }
    /** FNV-1a 32 位(与 X5 / X6 / X7 / X8 同口径,供键指纹用)。 */
    function hash32(str) {
        let h = 0x811c9dc5;
        const s = String(str || '');
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }
    /** 试算(绝不外抛:坏实现一律回落 fallback)。 */
    function safe(fn, fallback) {
        try {
            const r = fn();
            return (r === undefined) ? fallback : r;
        } catch (_e) { return fallback; }
    }
    /** 同值判定(原始值直接比;对象按稳定序列化比)。 */
    function sameValue(a, b) {
        if (a === b) return true;
        if (a == null || b == null) return false;
        try { return JSON.stringify(a) === JSON.stringify(b); } catch (_e) { return false; }
    }/* ---------------------------------------------------------------
     * 分区判定(**只读:缺字段如实落 unknown,不猜**)
     *
     *   分区走**三步,且三步都可见**:
     *     1 显式 `partition` ∈ PARTITIONS ⇒ 用它(调用方最清楚这条属于哪一区);
     *     2 否则按 `origin` 与 `kind` 查(imported-lore ⇒ lore;chat-confirmed /
     *       事实账行 ⇒ chat;user-note / note ⇒ note);
     *     3 三步都不中 ⇒ `unknown`(**不硬塞**成 lore 或 chat)。
     *       为什么宁可不分区:硬塞会让「这条其实没归区」这件事消失,
     *       而它恰恰是「把参考小说当成聊天事实」这类缺陷的入口。
     * --------------------------------------------------------------- */
    /** 来源键 → 分区(与 PARTITIONS 同源的第二张视图;不中的一律返回 '')。 */
    const SOURCE_TO_PARTITION = Object.freeze({
        'imported-lore': 'lore', lore: 'lore', 'source-file': 'lore', reference: 'lore',
        'chat-confirmed': 'chat', chat: 'chat', fact: 'chat', event: 'chat', ledger: 'chat', floor: 'chat',
        'user-note': 'note', note: 'note', annotation: 'note', 'user-annotation': 'note',
    });
    /** 分区判定(三步;都不中 ⇒ 'unknown')。 */
    function partitionFor(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        const explicit = keyOf(r.partition);
        if (PARTITIONS.indexOf(explicit) >= 0) return { partition: explicit, partitionRaw: explicit, via: 'explicit' };
        const keys = [keyOf(r.origin), keyOf(r.kind), keyOf(r.source)];
        for (const k of keys) {
            if (!k) continue;
            const low = k.toLowerCase();
            if (Object.prototype.hasOwnProperty.call(SOURCE_TO_PARTITION, low)) {
                return { partition: SOURCE_TO_PARTITION[low], partitionRaw: k, via: 'origin' };
            }
        }
        return { partition: 'unknown', partitionRaw: keyOf(r.origin) || keyOf(r.kind) || keyOf(r.source), via: 'none' };
    }
    /** 主体键(判定两侧「同一件事」的轴;缺则如实空,**不拿标题硬凑**)。 */
    function subjectOf(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        return keyOf(r.subject) || keyOf(r.about) || keyOf(r.name) || keyOf(r.title);
    }
    /**
     * 单条条目归一。`usable` 是**唯一**的参与前提(其余都是读数)。
     *   为什么不用「分数」:分数会让「这条为什么被并排」变成不可解释的数字
     *   (M4-X9 验收要的是**分区引用可解释**)。这里只用**分区 + 主体 + 判定**
     *   三样可复算的东西说话。
     */
    function itemOf(raw, idx) {
        const r = (raw && typeof raw === 'object' && !Array.isArray(raw)) ? raw : {};
        const p = partitionFor(r);
        const sensitiveRaw = r.sensitive;
        const sensitive = (sensitiveRaw === true) || (keyOf(sensitiveRaw) === 'true');
        const id = keyOf(r.id) || keyOf(r.key) || ('x' + String(idx));
        return {
            index: idx,
            id: id,
            partition: p.partition,
            partitionRaw: p.partitionRaw,
            partitionVia: p.via,
            subject: subjectOf(r),
            title: clip(r.title || r.text || r.snippet || '', SNIPPET_MAX),
            text: sensitive ? '' : clip(r.text || r.detail || r.snippet || '', SNIPPET_MAX),
            expect: keyOf(r.expect),
            status: keyOf(r.status),
            floor: floorOf(r.floor),
            ref: keyOf(r.ref) || keyOf(r.ledger) || '',
            ledger: keyOf(r.ledger) || '',
            sourceRef: (r.sourceRef && typeof r.sourceRef === 'object') ? r.sourceRef : null,
            settingAsHappened: r.settingAsHappened === true,
            sensitive: sensitive,
            origin: keyOf(r.origin) || '',
            cls: keyOf(r.cls) || '',
            /* 人物类条目(同名跨资料**人物**的判定只对这类生效 —— 婚约 / 地点这类
             *   同名题面本来就该合并成一件事,不该报「需确认是不是同一个人」)。 */
            person: (r.entity === true) || (keyOf(r.cls) === 'character-bg'),
            usable: (p.partition !== 'unknown'),
            why: (p.partition === 'unknown') ? 'unclassified' : '',
        };
    }
    /**
     * 池归一:**上限有界**,畸形条目**丢弃并计数**(不猜、不修)。
     *   超上限的**如实计入 truncatedIn**(不是静默丢弃)。
     */
    function normalize(list) {
        const src = Array.isArray(list) ? list : [];
        const items = [];
        let dropped = 0;
        let truncatedIn = 0;
        const seenIds = {};
        for (let i = 0; i < src.length; i++) {
            const raw = src[i];
            if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { dropped++; continue; }
            if (items.length >= MAX_ITEMS) { truncatedIn++; continue; }
            const m = itemOf(raw, i);
            if (Object.prototype.hasOwnProperty.call(seenIds, m.id)) { dropped++; continue; }
            seenIds[m.id] = true;
            items.push(m);
        }
        return { items: items, dropped: dropped, truncatedIn: truncatedIn };
    }
    /** 模式归一(**缺省 compare**;给了但不认识 ⇒ 按对照并**说明**)。 */
    function modeOf(v) {
        const m = keyOf(v);
        if (SOURCE_MODES.indexOf(m) >= 0) return { mode: m, known: true, given: true, why: '' };
        const given = (v !== undefined && v !== null && keyOf(v) !== '');
        return { mode: DEFAULT_MODE, known: false, given: given, why: given ? 'sourceMode 未识别 ⇒ 按对照(不编第四种模式)' : '' };
    }
    /** 分区是否参与本次查证(**这就是受控 sourceMode 的落点**)。 */
    function partitionInMode(partition, mode) {
        if (mode === 'chat-only') return partition === 'chat';
        if (mode === 'lore-only') return partition === 'lore';
        return partition === 'chat' || partition === 'lore';
    }
    /**
     * 命中:剧情侧与资料侧「同一件事」的判据(**可复算**,不做语义理解)。
     *   · 两侧主体键相等 ⇒ 命中;
     *   · 否则标题互相包含(长度 >= 2)⇒ 命中;
     *   · 都不中 ⇒ 不命中(**不硬凑**)。
     */
    function hits(loreItem, chatItem) {
        if (loreItem.subject && chatItem.subject && loreItem.subject === chatItem.subject) return true;
        const a = loreItem.subject || loreItem.title;
        const b = chatItem.subject || chatItem.title;
        if (a.length >= 2 && b.length >= 2 && (a.indexOf(b) >= 0 || b.indexOf(a) >= 0)) return true;
        return false;
    }
    /**
     * [v3.350.0 · M5-O3] **否定与命题核**（零正则、零反斜杠：逐词剔除）。
     *   修前缺口（M5-O3 现状证据原文）：`verdictOf` 只做**子串命中** ——
     *   资料期望「归还」而剧情写「尚未归还」时，`hay.indexOf('归还') >= 0` 成立
     *   ⇒ 判 matched，**把明确的反证读成了吻合**。
     *   为什么用词表而不是语义模型：判定必须**可复算**（本仓对「重放一致」的纪律）；
     *   否定在中文里由少量固定词承担，认字面就够 —— 而一旦要「理解」就会引入
     *   版本化词典依赖（同一坑在 qa-thread 的标记词表上已声明过一次）。
     *   ★ 长词在前：先剥「尚未 / 不再」这类双字词，免得留下「未 / 不」的残尾。
     */
    const NEG_WORDS = Object.freeze(['尚未', '未能', '没再', '不再', '否认', '放弃', '解除', '取消', '没有', '不', '没', '未', '无']);
    /** 判否定的**窗口**：只在期望值（或其命题核）之前这么多字内找否定词 ——
     *   对整行判会让「不安的夜」这类无关标题把正常命中误判成反证。 */
    const NEG_WINDOW = 6;
    /** 该串里有没有否定词（用于**期望侧**极性）。 */
    function negOf(value) {
        const t = String(value == null ? '' : value);
        for (let i = 0; i < NEG_WORDS.length; i++) if (t.indexOf(NEG_WORDS[i]) >= 0) return true;
        return false;
    }
    /** 剥掉否定词之后的**命题核**（「尚未归还」⇒「归还」）。全是否定词 ⇒ 空串。 */
    function coreOf(value) {
        let t = String(value == null ? '' : value);
        for (let i = 0; i < NEG_WORDS.length; i++) {
            const w = NEG_WORDS[i];
            while (t.indexOf(w) >= 0) t = t.split(w).join('');
        }
        return t.trim();
    }
    /** 该串中 `needle` **紧邻之前**的窗口里有没有否定词（无 needle ⇒ false，不猜）。 */
    function negNear(hay, needle) {
        const at = hay.indexOf(needle);
        if (at < 0) return false;
        const from = (at - NEG_WINDOW) < 0 ? 0 : (at - NEG_WINDOW);
        const win = hay.slice(from, at);
        for (let i = 0; i < NEG_WORDS.length; i++) if (win.indexOf(NEG_WORDS[i]) >= 0) return true;
        return false;
    }
    /**
     * 判定一条资料在剧情面**兑现了没有**(六态互不同形)。
     *   · 剧情侧**无对应** ⇒ 资料声称已发生(unrealized)/ 未声称(lore-only);
     *   · 剧情侧**有对应**但**没给一致性判据**(expect)⇒ unchecked(**不猜一致**);
     *   · 给了 expect ⇒ 剧情行正文含 expect ⇒ matched;都不含 ⇒ divergent。
     *   ★ 「未发生」与「判不了」**必须不同形**:前者是资料说发生了而剧情没有,
     *     后者是两侧都在但**没有可复算的判据**。
     *
     * [v3.350.0 · M5-O3] 两处口径补强(都在既有六态之内，**不新增态**):
     *   ① **否定不当吻合**:命中还要**极性一致**才判 matched；核命中而极性相反
     *      ⇒ 明确反证(divergent)。期望值自身带否定词时以它的极性为基准。
     *   ② **覆盖与时间**:命中行若全部落在 `opts.atFloor` 之外，或调用方显式报
     *      `opts.chatCoverage !== 'complete'`(读源失败 / 缺源) ⇒ 判 unchecked，
     *      **不说「未发生」** —— 没查到与不存在必须可分。
     *   ③ 不传 opts 时口径与修前**逐字相同**(既有套件与旧调用点零改动)。
     */
    function verdictOf(loreItem, chats, opts, out) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const at = floorOf(o.atFloor);
        /* 覆盖:调用方显式报非 complete(缺源 / 读源失败)⇒ 本次**没看全**,不是「没有」。 */
        const coverage = (o.chatCoverage === undefined || o.chatCoverage === null) ? 'complete' : keyOf(o.chatCoverage);
        /* 时间范围:命中行若全在 atFloor 之外 ⇒ 这次没看到,不是「没发生」。 */
        let rows = chats;
        let outOfRange = 0;
        if (at !== null && chats.length) {
            const inRange = [];
            for (let i = 0; i < chats.length; i++) {
                const fl = floorOf(chats[i].floor);
                if (fl === null || fl <= at) inRange.push(chats[i]); else outOfRange++;
            }
            rows = inRange;
        }
        if (out) { out.coverage = coverage; out.outOfRange = outOfRange; out.hitAt = ''; out.polarity = ''; }
        /* 闸(**前置**):命中行全在时间范围外 / 覆盖不完整 ⇒ 判不了(unchecked),
         *   而不是报「未发生」—— M5-O3 验收原文:「缺源、读源失败、覆盖完备但无证据三种状态可辨」。
         *   放在下面那条既有未发生闸**之前**,是为了让它在覆盖充分时**逐字不变**。 */
        if (!rows.length && (outOfRange > 0 || coverage !== 'complete')) {
            if (out) out.why = (outOfRange > 0) ? '命中行全在时间范围外 ⇒ 判不了(不说「未发生」)' : '来源覆盖不完整(缺源 / 读源失败) ⇒ 判不了(不说「未发生」)';
            return 'unchecked';
        }
        if (!chats.length) return loreItem.settingAsHappened === true ? 'unrealized' : 'lore-only';
        const expect = keyOf(loreItem.expect);
        if (!expect) { if (out) out.why = '两侧命中同题但未给一致性判据(expect)⇒ 判不了,不猜一致'; return 'unchecked'; }
        const negExpect = negOf(expect);
        const core = coreOf(expect);
        /* ★ 逐行比**极性**,不是只比子串:资料期望「归还」而剧情写「尚未归还」时,
         *   子串命中成立却是**明确反证** —— 这正是 M5-O3 要修的读数(修前判 matched)。 */
        let hasSupport = false;
        let hasCounter = false;
        let hitAt = '';
        for (const r of rows) {
            const hay = strOf(r.text) + SP + strOf(r.title) + SP + strOf(r.status);
            let needle = '';
            if (hay.indexOf(expect) >= 0) needle = expect;
            else if (core.length >= 2 && hay.indexOf(core) >= 0) needle = core;
            if (!needle) continue;
            if (!hitAt) hitAt = (needle === expect) ? 'expect' : 'core';
            /* ★ 极性 = 「命中串**前面**窗口里的否定」**或**「命中串**自身**带的否定」。
             *   为什么两者都要看:期望值自身带否定时(expect='未归还'),否定词落在命中串
             *   **内部**('尚未归还' 的 '未' 属于 needle),只看前面的窗口会把它漏掉 ——
             *   于是「期望未归还 + 剧情尚未归还」(极性其实一致)会被误判成反证。 */
            const textNeg = negNear(hay, needle) || negOf(needle);
            if (textNeg === negExpect) hasSupport = true; else hasCounter = true;
        }
        if (out) { out.hitAt = hitAt; out.polarity = hasCounter ? 'counter' : (hasSupport ? 'same' : ''); }
        /* 支持与反证同时在范围内 ⇒ 判 divergent(**反证优先**,保守):把反证读成吻合正是要修的那条。 */
        if (hasSupport && !hasCounter) return 'matched';
        if (out) out.why = hasCounter ? '命中处**极性相反**(如「尚未归还」对期望「归还」)⇒ 明确反证,不读成吻合' : '两侧都在,但剧情行正文不含资料期望值(expect)';
        return 'divergent';
    }
    /**
     * [v3.350.0 · M5-O3] 判定的**读数面**:判定值 + 依据(极性 / 命中位置 / 覆盖 / 范围外条数)。
     *   判定值**只由 `verdictOf` 算一次**(不在这里再判一遍 —— 两处判会出现
     *   「判 divergent 却报『没给判据』」这类自相矛盾的读数)。
     */
    function judgeOf(loreItem, chats, opts) {
        const out = { verdict: '', why: '', polarity: '', outOfRange: 0, coverage: 'complete', hitAt: '' };
        out.verdict = verdictOf(loreItem, chats, opts, out);
        return out;
    }
    /**
     * 建面(统一入口)。**只读**:不写任何账、不产正文、不联网、不复制全文。
     *   build(mode, input, opts)
     *     mode  —— chat-only / lore-only / compare(缺省 compare)
     *     input —— { lore:[] , chat:[] , note:[] } 或**扁平数组**(带 partition / origin 判定)
     *     opts  —— { revokedKeys?(已撤除资料键) / historyRefs?(历史答案引用过的资料键)
     *               / admitLore?(是否显式并入正史,默认 false) }
     *   返回读数(**四方分开说**):judgements(逐条判定)/ needsConfirm(同名跨资料)
     *     / revoked + staleRefs(撤除与失效引用)/ counts + gaps。
     */
    function build(mode, input, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const mv = modeOf(mode);
        const m = mv.mode;
        const base = {
            kind: CX_KIND, version: CX_VERSION,
            mode: m, modeLabel: MODE_LABEL[m], modeGiven: mv.given, modeKnown: mv.known,
            modes: SOURCE_MODES.slice(), modeLabels: Object.assign({}, MODE_LABEL),
            partitions: PARTITIONS.slice(), partitionLabels: Object.assign({}, PARTITION_LABEL),
            verdicts: VERDICTS.slice(), verdictLabels: Object.assign({}, VERDICT_LABEL),
            judgements: [], needsConfirm: [], revoked: [], staleRefs: [], gaps: [],
            counts: { lore: 0, chat: 0, note: 0, unknown: 0, judged: 0, matched: 0, divergent: 0, unrealized: 0, loreOnly: 0, chatOnly: 0, unchecked: 0, revoked: 0, dropped: 0, truncatedIn: 0, kept: 0 },
            reasons: [], truncated: 0,
            /* ── 四条口径写死在读数里(本模块的立身之本) ────────────────── */
            loreInCanon: false,
            admitted: false,
            noteIsNotSource: true,
            readsFullText: false,
            copiesFullText: false,
            online: false,
            orderIsSource: true,
            writesNothing: true, devisesNothing: true, injectsNothing: false,
            note: '本面只做分区与判定;资料原文按需从 owner 读(不缓存正文,不联网)',
        };
        /* 入参两态**不同形**:没给输入(undefined / null)= 合法的「这次没有可查的」;
         *   给了但**不是数组也不是分区对象**(字符串 / 数字)= 畸形,无从分区。
         *   把两者压成同形会让「判不了」被读成「没有」—— 这正是 M4-X9 要防的。 */
        const absentArg = (input === undefined) || (input === null);
        const shaped = !absentArg && (Array.isArray(input) || (typeof input === 'object'));
        if (!absentArg && !shaped) {
            return Object.assign({}, base, {
                judged: false, malformedInput: true,
                reasons: ['input 不是数组也不是分区对象 ⇒ 无从分区(不读成「没有可比对的」)'],
            });
        }
        /* 扁平数组 ⇒ 走 origin 判定;分区对象 ⇒ 三个具名列表**合并**后同样走判定
         *   (两条路径归一后同形,免得「具名列表」与「扁平数组」结论不一致)。 */
        let flat = [];
        if (Array.isArray(input)) flat = input.slice();
        else {
            const src = (input && typeof input === 'object') ? input : {};
            flat = arrOf(src.lore).concat(arrOf(src.chat)).concat(arrOf(src.note));
        }
        const nm = normalize(flat);
        const revokedSet = {};
        for (const k of arrOf(o.revokedKeys)) { const kk = keyOf(k); if (kk) revokedSet[kk] = true; }
        /* 撤除:被撤资料**一格不带**(正文不进任何分区,也不参与判定),
         *   但**具名计数** —— 「撤了」与「本来就没有」不是同一句话。 */
        const revoked = [];
        const live = [];
        for (const it of nm.items) {
            if (it.partition === 'lore' && revokedSet[it.id]) { revoked.push({ id: it.id, subject: it.subject, title: it.title, why: 'revoked' }); continue; }
            live.push(it);
        }
        const lore = live.filter((x) => x.partition === 'lore');
        const chat = live.filter((x) => x.partition === 'chat');
        const note = live.filter((x) => x.partition === 'note');
        const unknown = live.filter((x) => x.partition === 'unknown');
        const inLore = partitionInMode('lore', m);
        const inChat = partitionInMode('chat', m);
        const judgements = [];
        const matchedChatIds = {};
        /* 1 逐条资料判定(仅当模式含资料侧)。 */
        const loreSide = inLore ? lore : [];
        const chatSide = inChat ? chat : [];
        for (const li of loreSide) {
            const hitsList = [];
            for (const ci of chatSide) if (hits(li, ci)) hitsList.push(ci);
            const jd = inChat ? judgeOf(li, hitsList, { atFloor: o.atFloor, chatCoverage: o.chatCoverage }) : { verdict: 'lore-only', why: '', polarity: '', outOfRange: 0, coverage: 'complete', hitAt: '' };
            const v = jd.verdict;
            for (const ci of hitsList) matchedChatIds[ci.id] = true;
            /* 同名跨资料**人物**:两侧同名(主体键相等)且都是人物类但**来源不同**
             *   ⇒ needsConfirm。★ 不硬合并:同名异人在本仓是既有口径
             *   (项目登记面 / 记忆 GC 都守这条)。非人物条目(婚约 / 地点)同名即同题,
             *   本来就该并成一件事,不报确认。 */
            const crossSource = hitsList.length > 0 && li.subject && li.person
                && hitsList.some((ci) => ci.subject === li.subject && ci.person);
            const why = jd.why || ((v === 'unrealized') ? '资料声称已发生(settingAsHappened),剧情侧无对应'
                : (v === 'lore-only') ? (inChat ? '资料未声称已发生,剧情侧也未涉及' : '本次模式未查剧情侧')
                    : (v === 'unchecked') ? '两侧命中同题但未给一致性判据(expect)⇒ 判不了,不猜一致'
                        : (v === 'divergent') ? '两侧都在,但剧情行正文不含资料期望值(expect)'
                            : '剧情行正文含资料期望值(expect)⇒ 兑现');
            judgements.push({
                subject: li.subject || li.title,
                verdict: v, verdictLabel: VERDICT_LABEL[v],
                loreKey: li.id, loreRef: li.ref, loreSource: li.sourceRef,
                chatRefs: hitsList.map((ci) => ci.ref || ci.id),
                expect: li.expect, cls: li.cls, origin: li.origin,
                crossSource: crossSource,
                /* [v3.350.0 · M5-O3] 判定依据随条目外送（**与 verdict 同源**：都取自 judgeOf，
                 *   不在这里再算一遍 —— 两处算会出现「判 divergent 却报『没给判据』」的读数）。
                 *   于是「答案能打开支持句与反证句」有落点：hitAt 指命中位置、polarity 指极性。 */
                polarity: jd.polarity, hitAt: jd.hitAt, coverage: jd.coverage, outOfRange: jd.outOfRange,
                why: why,
            });
            if (crossSource && (v === 'matched' || v === 'divergent' || v === 'unchecked')) {
                base.needsConfirm.push({
                    subject: li.subject, loreKey: li.id, chatRefs: hitsList.map((ci) => ci.ref || ci.id),
                    why: '同名跨资料人物:两侧同名但来源不同(lore 与 chat)⇒ 需人工确认是否为同一人,不硬合并',
                });
            }
        }
        /* 2 只在剧情里的条目(仅当模式含剧情侧)。 */
        if (inChat) {
            for (const ci of chatSide) {
                if (matchedChatIds[ci.id]) continue;
                if (!inLore) continue;   /* chat-only 模式:剧情侧不逐条出「只在剧情」判(那是资料侧对照才有的读数)。 */
                judgements.push({
                    subject: ci.subject || ci.title,
                    verdict: 'chat-only', verdictLabel: VERDICT_LABEL['chat-only'],
                    loreKey: '', loreRef: '', loreSource: null,
                    chatRefs: [ci.ref || ci.id], expect: '', cls: '', origin: ci.origin,
                    crossSource: false, why: '剧情侧有,资料侧未写',
                });
            }
        }
        const byVerdict = {};
        for (const v of VERDICTS) byVerdict[v] = judgements.filter((j) => j.verdict === v);
        /* 3 撤除后的**失效引用**:历史答案引用过被撤资料 ⇒ 报 sourceStale(不静默消失)。 */
        const historyRefs = arrOf(o.historyRefs).map(keyOf).filter(Boolean);
        const staleRefs = [];
        for (const hr of historyRefs) if (revokedSet[hr]) staleRefs.push({ key: hr, why: 'source-stale', note: '该资料已撤除:其正文不再引用,历史来源显示失效' });
        /* 4 显式 admitLore:资料**并入正史**这件事**必须显式**;不显式时 loreInCanon 恒 false。 */
        const admit = o.admitLore === true;
        const reasons = [];
        if (mv.why) reasons.push(mv.why);
        if (revoked.length) reasons.push('已撤除资料 ' + revoked.length + ' 条 ⇒ 正文不进分区(具名在 revoked)');
        if (staleRefs.length) reasons.push('历史引用 ' + staleRefs.length + ' 条**来源已失效**(sourceStale)');
        if (base.needsConfirm.length) reasons.push('同名跨资料人物 ' + base.needsConfirm.length + ' 条 ⇒ 需人工确认(不硬合并)');
        if (byVerdict.unrealized.length) reasons.push('设定事件未发生 ' + byVerdict.unrealized.length + ' 条(资料声称已发生,剧情无对应)');
        if (byVerdict.divergent.length) reasons.push('已发生但偏离设定 ' + byVerdict.divergent.length + ' 条');
        if (byVerdict.unchecked.length) reasons.push('判不了 ' + byVerdict.unchecked.length + ' 条(未给一致性判据)');
        if (unknown.length) reasons.push('来源未判 ' + unknown.length + ' 条 ⇒ 不并入任何分区(不硬塞)');
        if (!admit) reasons.push('资料**未并入正史**(admitLore 未开启;loreInCanon 恒 false)');
        if (nm.truncatedIn > 0) reasons.push('池超上限 ' + MAX_ITEMS + ' ⇒ 截断 ' + nm.truncatedIn + ' 条');
        const gaps = [];
        if (!inLore) gaps.push({ partition: 'lore', why: '本次模式(仅剧情)**未查资料侧** —— 资料原文不参与' });
        if (!inChat) gaps.push({ partition: 'chat', why: '本次模式(仅资料)**未查剧情侧** —— 无法判定兑现与否' });
        return Object.assign({}, base, {
            judged: true,
            /* 分区引用(**只带键与来源位,不带全文**):原文按需从 owner 读。 */
            loreRefs: loreSide.map((li) => ({ key: li.id, subject: li.subject, title: li.title, cls: li.cls, sourceRef: li.sourceRef, revoked: false })),
            chatRefs: chatSide.map((ci) => ({ key: ci.id, subject: ci.subject, title: ci.title, ledger: ci.ledger, floor: ci.floor, ref: ci.ref })),
            noteRefs: note.map((ni) => ({ key: ni.id, subject: ni.subject, title: ni.title })),
            judgements: judgements,
            matched: byVerdict.matched, divergent: byVerdict.divergent,
            unrealized: byVerdict.unrealized, loreOnly: byVerdict['lore-only'],
            chatOnly: byVerdict['chat-only'], unchecked: byVerdict.unchecked,
            revoked: revoked, staleRefs: staleRefs,
            admitted: admit ? loreSide.map((li) => li.id) : [],
            loreInCanon: admit === true,
            gaps: gaps, reasons: reasons, truncated: nm.truncatedIn,
            counts: {
                lore: lore.length, chat: chat.length, note: note.length, unknown: unknown.length,
                judged: judgements.length,
                matched: byVerdict.matched.length, divergent: byVerdict.divergent.length,
                unrealized: byVerdict.unrealized.length, loreOnly: byVerdict['lore-only'].length,
                chatOnly: byVerdict['chat-only'].length, unchecked: byVerdict.unchecked.length,
                revoked: revoked.length, dropped: nm.dropped, truncatedIn: nm.truncatedIn,
                kept: loreSide.length,
            },
        });
    }
    /** 深度扫描读数键:出现百分比 / 置信度名即不通过(M4-X5 / X6 / X7 / X8 同口径)。 */
    function hasPercentKey(obj, depth) {
        const d = depth || 0;
        if (d > 6 || !obj || typeof obj !== 'object') return false;
        if (Array.isArray(obj)) {
            for (const it of obj) if (hasPercentKey(it, d + 1)) return true;
            return false;
        }
        for (const k of Object.keys(obj)) {
            const low = String(k).toLowerCase();
            for (const bad of PERCENT_KEYS) if (low.indexOf(bad) >= 0) return true;
            if (hasPercentKey(obj[k], d + 1)) return true;
        }
        return false;
    }
    /**
     * 自检:**确定性 + 只读面 + 三模式产物不同形 + 三验收例各自可达且互不同形 +
     *   撤除后正文不入 + 批注不冒充原文 + 资料不默认并入正史 + 不产百分比**,
     *   九条当场自证。第 3 / 4 / 5 条是本模块的立身之本。
     */
    function selfCheck() {
        /* 验收三例全在一池里:**同名跨资料人物** + **未发生的设定事件** + **已发生但偏离设定**。 */
        const POOL = {
            lore: [
                { id: 'L1', partition: 'lore', subject: '阿岚', title: '阿岚·身世', text: '幼年在北城长大', cls: 'character-bg', origin: 'imported-lore' },
                { id: 'L2', partition: 'lore', subject: '大撤退', title: '大撤退', text: '三年前已发生', settingAsHappened: true, cls: 'backstory-event', origin: 'imported-lore' },
                { id: 'L3', partition: 'lore', subject: '婚约', title: '婚约', text: '已与林安订婚', settingAsHappened: true, expect: '订婚', cls: 'backstory-event', origin: 'imported-lore' },
            ],
            chat: [
                { id: 'C1', partition: 'chat', subject: '阿岚', title: '阿岚', detail: '住在南城', entity: true, ledger: 'fact-version', floor: 12 },
                { id: 'C2', partition: 'chat', subject: '婚约', title: '婚约', detail: '已解除婚约', status: 'released', ledger: 'commitment', floor: 30 },
            ],
            note: [
                { id: 'N1', partition: 'note', subject: '备忘', title: '作者注', detail: '这里该更狠一点' },
            ],
        };
        const cmp = build('compare', POOL, {});
        const chatOnly = build('chat-only', POOL, {});
        const loreOnly = build('lore-only', POOL, {});
        /* 1 确定性:同输入同产物。 */
        const a2 = build('compare', POOL, {});
        const deterministic = JSON.stringify(cmp) === JSON.stringify(a2);
        /* 2 只读面:导出名里不得有写面前缀。 */
        const mutating = ['set', 'put', 'write', 'save', 'update', 'delete', 'clear', 'remove', 'commit', 'apply', 'persist', 'store', 'drop', 'erase', 'inject', 'push'];
        const writeFaces = Object.keys(api).filter((n) => mutating.some((mm) => n.toLowerCase().indexOf(mm) === 0)).length;
        /* 3 **三模式产物不同形**(仅剧情 / 仅资料 / 对照的读数各自不同)。 */
        const modesDiffer = chatOnly.counts.judged !== loreOnly.counts.judged
            || chatOnly.judged !== cmp.judged
            || (chatOnly.gaps.length !== cmp.gaps.length);
        /* 4 **验收三例各自可达且互不同形**:同名跨资料(unchecked 因无 expect)+
         *  未发生(unrealized)+ 偏离(divergent)。 */
        const ex1 = cmp.needsConfirm.length === 1 && cmp.needsConfirm[0].subject === '阿岚';
        const ex2 = cmp.counts.unrealized === 1 && cmp.unrealized.length === 1 && cmp.unrealized[0].subject === '大撤退';
        const ex3 = cmp.counts.divergent === 1 && cmp.divergent.length === 1 && cmp.divergent[0].subject === '婚约';
        const threeCases = ex1 && ex2 && ex3;
        const distinct = cmp.unrealized[0].verdict !== cmp.divergent[0].verdict && cmp.unchecked[0].verdict !== cmp.divergent[0].verdict;
        /* 5 **撤除后正文不进分区**(一格不带),且**历史引用报失效**。 */
        const rv = build('compare', POOL, { revokedKeys: ['L1'], historyRefs: ['L1', 'L3'] });
        const revokedHolds = rv.counts.revoked === 1 && rv.loreRefs.every((r) => r.key !== 'L1')
            && rv.staleRefs.length === 1 && rv.staleRefs[0].key === 'L1';
        /* 6 **批注不冒充原文或事实**:note 自成一区,且 noteIsNotSource 恒 true。 */
        const noteSeparate = cmp.counts.note === 1 && cmp.noteIsNotSource === true
            && cmp.loreRefs.every((r) => r.key !== 'N1') && cmp.chatRefs.every((r) => r.key !== 'N1');
        /* 7 **资料不默认并入正史**:未给 admitLore ⇒ loreInCanon 恒 false 且 admitted 空。 */
        const noAdmit = cmp.loreInCanon === false && cmp.admitted.length === 0
            && build('compare', POOL, { admitLore: true }).loreInCanon === true;
        /* 8 不产百分比:读数里不得出现 percent / confidence / score 一类键。 */
        const pctFree = !hasPercentKey(cmp);
        /* 9 入参畸形与缺席不同形 + 可序列化。 */
        const bad = build('compare', 'not-an-array', {});
        const empty = build('compare', [], {});
        const malformedDistinct = bad.malformedInput === true && bad.judged === false
            && empty.malformedInput === undefined && empty.judged === true && empty.counts.judged === 0;
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(cmp)).kind === CX_KIND; } catch (_e) { serializable = false; }
        return {
            ok: deterministic && writeFaces === 0 && modesDiffer && threeCases && distinct
                && revokedHolds && noteSeparate && noAdmit && pctFree && malformedDistinct && serializable,
            deterministic: deterministic,
            writeFaces: writeFaces,
            modesDiffer: modesDiffer,
            threeCases: threeCases,
            verdictsDistinct: distinct,
            revokedHolds: revokedHolds,
            noteSeparate: noteSeparate,
            noAdmit: noAdmit,
            percentFree: pctFree,
            malformedDistinct: malformedDistinct,
            serializable: serializable,
        };
    }
    /**
     * 一行读数(四方**分开说**:模式 / 三例计数 / 撤除与失效 / 同名待确认)。
     *   合并任意两方都会让人误判「这次查到了什么」—— 所以分开写。
     */
    function line(read) {
        const r = read || {};
        if (r.degraded) return '资料对照异常(已降级,不外抛)';
        if (r.malformedInput) return '资料对照输入畸形(input 不是数组也不是分区对象)—— 无从分区';
        const c = r.counts || {};
        if (!c.lore && !c.chat) return '暂无可查(模式 ' + (r.modeLabel || r.mode || '') + ')';
        const parts = ['模式 ' + (r.modeLabel || r.mode), '资料 ' + c.lore, '剧情 ' + c.chat];
        if (c.matched) parts.push('一致 ' + c.matched);
        if (c.divergent) parts.push('**偏离 ' + c.divergent + '**');
        if (c.unrealized) parts.push('**未发生 ' + c.unrealized + '**');
        if (c.unchecked) parts.push('判不了 ' + c.unchecked);
        if (c.chatOnly) parts.push('只在剧情 ' + c.chatOnly);
        if (c.revoked) parts.push('已撤除 ' + c.revoked);
        if (r.needsConfirm && r.needsConfirm.length) parts.push('同名待确认 ' + r.needsConfirm.length);
        if (r.loreInCanon === false) parts.push('(资料未并入正史)');
        return parts.join(' · ');
    }
    /** 逐条判定清单(只说**判定与引用位**,不产出正文)。 */
    function render(read, opts) {
        try {
            const r = read || {};
            const o = (opts && typeof opts === 'object') ? opts : {};
            const max = numOr(o.max, 40);
            if (!r.judged) return r.malformedInput ? '资料对照输入畸形,无从分区。' : '资料对照未判。';
            const lines = [];
            lines.push('联合查证:' + (r.modeLabel || r.mode) + '(' + (r.verdicts || []).length + ' 态)');
            const js = arrOf(r.judgements);
            if (!js.length) lines.push('- 没有可比对的条目');
            for (let i = 0; i < js.length; i++) {
                if (lines.length > max) break;
                const j = js[i];
                const refs = arrOf(j.chatRefs).join('、');
                lines.push('- [' + (j.verdictLabel || j.verdict) + '] ' + (j.subject || j.loreKey) + (refs ? (' ⇒ ' + refs) : ''));
            }
            if (r.revoked && r.revoked.length) lines.push('已撤除:' + r.revoked.map((x) => x.id).join('、'));
            if (r.staleRefs && r.staleRefs.length) lines.push('来源失效:' + r.staleRefs.map((x) => x.key).join('、'));
            if (r.needsConfirm && r.needsConfirm.length) lines.push('待确认:' + r.needsConfirm.map((x) => x.subject).join('、'));
            return lines.join(NL);
        } catch (_e) { return ''; }
    }
    /** 能力自述(缺哪一格、为什么缺、缺了会怎样)。 */
    function describe(extra) {
        const sc = selfCheck();
        const o = (extra && typeof extra === 'object') ? extra : {};
        return Object.assign({
            kind: CX_KIND, version: CX_VERSION,
            modes: SOURCE_MODES.slice(), modeLabels: SOURCE_MODES.map((m) => MODE_LABEL[m]),
            partitions: PARTITIONS.slice(), partitionLabels: PARTITIONS.map((p) => PARTITION_LABEL[p]),
            verdicts: VERDICTS.slice(), verdictLabels: VERDICTS.map((v) => VERDICT_LABEL[v]),
            origins: Object.keys(ORIGIN).map((k) => ORIGIN[k]),
            maxItems: MAX_ITEMS, snippetMax: SNIPPET_MAX, defaultMode: DEFAULT_MODE,
            loreInCanon: false, admitsNothingByDefault: true,
            readsFullText: false, copiesFullText: false,
            online: false, offline: true,
            writesNothing: true, devisesNothing: true, injectsNothing: false,
            selfCheck: sc,
        }, o);
    }
    const api = {
        CX_VERSION: CX_VERSION,
        CX_KIND: CX_KIND,
        SOURCE_MODES: SOURCE_MODES,
        MODE_LABEL: MODE_LABEL,
        DEFAULT_MODE: DEFAULT_MODE,
        PARTITIONS: PARTITIONS,
        PARTITION_LABEL: PARTITION_LABEL,
        ORIGIN: ORIGIN,
        VERDICTS: VERDICTS,
        VERDICT_LABEL: VERDICT_LABEL,
        SOURCE_TO_PARTITION: SOURCE_TO_PARTITION,
        MAX_ITEMS: MAX_ITEMS,
        SNIPPET_MAX: SNIPPET_MAX,
        PERCENT_KEYS: PERCENT_KEYS,
        oneLine: oneLine,
        clip: clip,
        keyOf: keyOf,
        strOf: strOf,
        arrOf: arrOf,
        numOr: numOr,
        floorOf: floorOf,
        hash32: hash32,
        safe: safe,
        sameValue: sameValue,
        partitionFor: partitionFor,
        subjectOf: subjectOf,
        itemOf: itemOf,
        normalize: normalize,
        modeOf: modeOf,
        partitionInMode: partitionInMode,
        hits: hits,
        verdictOf: verdictOf,
        /* [v3.350.0 · M5-O3] 判定**唯一实现**与否定原语随面导出（调用方要依据时取同源，
         *   不另抄一份否定词表 —— 本仓「单一真源」口径）。 */
        judgeOf: judgeOf,
        NEG_WORDS: NEG_WORDS,
        negOf: negOf,
        coreOf: coreOf,
        build: build,
        hasPercentKey: hasPercentKey,
        selfCheck: selfCheck,
        line: line,
        render: render,
        describe: describe,
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaLoreCrosscheck = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛,忽略 */ }
    }    return api;
})(typeof window !== 'undefined' ? window : globalThis);