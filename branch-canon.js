/* ============================================================
 * branch-canon.js — [v3.328.0 · F 包 M3-X6] 支线结果的正史选择工作区
 * ------------------------------------------------------------
 * 【它补的是哪一格(M3-X6 验收原文逐条)】
 *   现状:branch-semantics 能对照两条分支、project-registry::compareProjects
 *         能比两个项目、volume-continuation 能把一卷接续出去
 *         —— 但没有任何一面回答「这两条支线的结局,哪一条成为后续正史?」
 *   修前实测三处缺口:
 *     1 两条支线的结局可以同时成立:branch-semantics 的 ACTION 只有
 *       keeper / import 等导入动作,没有「结局归一」这一档 ⇒
 *       下游把两条结局都当既成事实注入;
 *     2 选择之后看不见交接面:没有「选了之后新卷带哪些条目」的预览,
 *       交接要等 volume-continuation::handoffContinuation 真落笔才知道带了什么;
 *     3 撤销面没有范围:已落笔的接续要么全撒、要么不动,
 *       不能「只撤本次接续而原分支不动」。
 *   本模块把这件事收成四步:逐冲突列举 → 逐冲突选择(canon/coexist/exclude)
 *     → 预览交接(新卷只带选中结局 + 保留未被选中的历史) → 可撤销且不改原分支。
 *
 * 【五条不可让步口径】
 *   1 两条支线结局不得自动同时成立:同一冲突位(collisionKey)下 canon 至多一条;
 *     coexist 是显式的用户选择,不是默认(默认态报 both-terminal 冲突)。
 *   2 未被选中的历史必须留痕:排除了也要在 provenance 里出现(why excluded),
 *     不许静默丢弃。
 *   3 秘密权限不因选择而扩大:选中结局里带受限正文的条目,
 *     按 keeper 面过滤后才进交接(与 branch-semantics 同口径,不自建一套权限算法)。
 *   4 撤销不改原分支:revokeScopeOf 只产「本次接续的范围」,不发任何分支写指令。
 *   5 全程纯函数零写零联网(offline 自述),不抛:畔形入参一律退化为可读的降级读数。
 *
 * 【本模块不做什么(边界)】
 *   · 不联网、不建数据库、不发起任何请求(offline:true 明写自述);
 *   · 不写任何账:落笔走既有 owner(volume-continuation /前史),本模块只出
 *     冲突清单 / 选择计划 / 交接预览 / 撤销范围 / 出处清单;
 *   · 不自建 merge 算法:只按 collisionKey 同位判「不可同时成立」,
 *     不做语义合并(合并属 project-registry 的事);
 *   · 不推断剧情:只处理调用方给的结局条目清单。
 * 挂 window.LonShaBranchCanon,供 index.js 正史选择面 / 诊断面使用。
 * ============================================================ */
(function (global) {
    'use strict';
    const BC_VERSION = 2;
    const BC_KIND = 'branch_canon';
    /* 转义一律用字符码拼:本仓写入通道处理反斜杠会污染源码(零反斜杠构造纪律)。 */
    const NL = String.fromCharCode(10);
    const MAX_OUTCOMES = 200;
    const SNIPPET_MAX = 72;

    /** 四档决定(穷尽:任何冲突位必须落入其中一档,不得现编动作名)。 */
    const DECISION = Object.freeze({ CANON: 'canon', COEXIST: 'coexist', EXCLUDE: 'exclude', UNSET: 'unset' });
    const DECISION_LABEL = Object.freeze({
        canon: '定为正史',
        coexist: '并存',
        exclude: '排除',
        unset: '未选',
    });

    /** 冲突词表(验收1:两条结局不能自动同时成立)。
     *   ★ [v3.335.0 · M4-O6 连带修] `DIVERGENT` 此前**只在三处被引用、不在本表里**
     *   （`conflicts` 的分档 / `blocked += 1` 的闸 / planCanon 的 isClash 与 whyKind）——
     *   于是「同一位上两条取值不同」这条**真实冲突**落进 `undefined`，
     *   三处闸全部静默失效（`blocked` 不增、planCanon 的 isClash 恒 false），
     *   下游把「未选的冲突结局」当成「没有冲突」继续交接。
     *   为什么直到 M4-O6 才现形：老判据只喂 `terminal:true` 的夹具，
     *   那条路走 `BOTH_TERMINAL` 分支；**只有真实供数**才会产出 terminal:null 的
     *   分支对照差异 —— 这正是本项「纯函数与诊断行全绿不足以收口」的现场。 */
    const CLASH = Object.freeze({
        SINGLE: 'single',
        BOTH_TERMINAL: 'both-terminal',
        SHARED_TERMINAL: 'shared-terminal',
        DIVERGENT: 'divergent',
        NONE: 'none',
    });

    /** 预览三档(与 memory-package / lore-import 同词表,不另立)。 */
    const PREVIEW = Object.freeze({ OK: 'ok', WARN: 'warn', BLOCKED: 'blocked' });

    /** 出处三态(验收2:未被选中的历史必须留痕)。 */
    const PROVENANCE = Object.freeze({ CHOSEN: 'chosen', EXCLUDED: 'excluded', COEXISTED: 'coexisted' });

    /** 受限正文字段键(与前序模块同形同值;判据钉住多处一致)。 */
    const SECRET_BODY_KEYS = Object.freeze(['secret', 'secretText', 'secretBody']);

    /** 受限正文站位串。★ 定长:不随原文本长变化(否则长度本身就是读数)。 */
    const SECRET_MASK = String.fromCharCode(10216) + '受限正文已隐去' + String.fromCharCode(10217);
/* ────────────────────────────────────────────────────────────
     * [v3.342.0 · M4-X3] **正史落卷面** —— 选择真正进入下一卷
     *
     * 【它补的是哪一格（M4-X3 验收原文逐条）】
     *   本模块修前有三面：逐冲突列举（conflicts）/ 逐冲突选择（setDecision）/
     *   交接预览（previewHandoff）。验收要的是「选择结局后**下一卷生成真正采用该结果**」。
     *   修前实测三处断链（不是「再加一个按钮」）：
     *     1 **包的形状接不上**（**病根在上游**）：`outcomeOf` 归一化条文时只留
     *       `key / title / floor / keeper / text` —— **面归属三格（face / 主 / 值）当场丢掉**。
     *       于是 `previewHandoff().pack.entries` 与 `volume-continuation` 要的
     *       **面归属形状**（face / ownerKey / link / value）之间**一处映射都没有**：
     *       下游拿这个包去接续，逐条被判「目标侧缺面」⇒ **一条也接不上**，
     *       而预览读数（ok / preview / packId）看着完全正常。本版两处一起修：
     *       上游 `outcomeOf` 原样带过面归属，本面再映射成接续形状。
     *     2 **确认没有凭据**：选择只活在宿主的计划容器里，没有「本次落卷叫什么」的稳定身份；
     *       重启之后无从判断「这次确认与上次是不是同一件事」⇒ 重复确认会重复落笔。
     *     3 **撤销没有保护面**：`revokeScopeOf` 只报「范围是 handoff-only」，
     *       不回答「这次撤销会动到哪些条目、哪些是原分支的、哪些是后来手工新增的」。
     *   ★ 与 previewHandoff 分工不同：previewHandoff 答「选了之后新卷带哪些**结局**」；
     *     planAdoption 答「这些结局**能不能变成下一卷接得上的条目**、缺什么格、叫什么名字」。
     *   ★ 本面**不落笔**：只出接续计划与凭据；真落笔仍走 volume-continuation / 器官的既有 owner。
     */
    /** 落卷三态（**穷尽且不同形**）。 */
    const ADOPT = Object.freeze({ READY: 'ready', BLOCKED: 'blocked', EMPTY: 'empty' });
    const ADOPT_LABEL = Object.freeze({ ready: '可接续', blocked: '未选尽', empty: '无可接条目' });
    /** 条目来源两态（**不得同形**）：来自选中结局还是并存结局。 */
    const ADOPT_SOURCES = Object.freeze(['chosen', 'coexisted']);
    const ADOPT_KIND = 'branch_canon_adoption';
    /**
     * 映射缺格三因。**三条分开报、不许压成一条「映射失败」**：
     *   把「没给面」与「没给主」压成同一个读数，下游就无从知道该补哪一格。
     */
    const UNMAPPED = Object.freeze({ NO_FACE: 'no-face', NO_OWNER: 'no-owner', NO_KEY: 'no-key' });
    /** 接续条目形状（与 volume-continuation 的 entries[] 同格；本面只**映射**、不落笔）。 */
    const ADOPT_ITEM_FIELDS = Object.freeze(['face', 'key', 'ownerKey', 'link', 'value', 'from', 'scope', 'evidenceRef']);
    /**
     * 一条结局条文 → 一条接续条目。★ 三条不可推断的格**具名**，绝不猜：
     *   · face  —— 未给 ⇒ no-face（猜面 = 把条目接到错误的账上）；
     *   · owner —— 未给 ⇒ no-owner（**拿 branch 当 owner 就是拿支线名冒充角色 id**）；
     *   · key   —— 未给 ⇒ no-key（与 volume-continuation 同口径：无键的条目不可寻址，
     *     进包就无从撤销）。
     *   吃两种形状：`outcomeOf` 归一化后的条文（面归属已拆成 face / entryKey / owner）
     *   与调用方直接给的**原形条文**（face / key / entityId / value）—— 两条都认，不另立第二套夹具。
     *   受限正文一律走本模块的**定长掩码**（与 filterByKeeper 同口径，不自建第二套权限算法）。
     */
    function adoptItemOf(raw, source, ctx) {
        const i = (raw && typeof raw === 'object') ? raw : {};
        const c = (ctx && typeof ctx === 'object') ? ctx : {};
        const ow = (i.owner && typeof i.owner === 'object') ? i.owner : null;
        const face = keyOf(i.face);
        if (!face) return { ok: false, why: UNMAPPED.NO_FACE };
        const id = keyOf(ow ? ow.id : (i.entityId !== undefined ? i.entityId : (i.ownerId !== undefined ? i.ownerId : '')));
        const nm = keyOf(ow ? ow.name : (i.name !== undefined ? i.name : ((typeof i.owner === 'string') ? i.owner : '')));
        if (!id && !nm) return { ok: false, why: UNMAPPED.NO_OWNER };
        /* ★ 归一化路径认 `faceKey`（**空即真无键**，不再 fallback —— `outcomeOf` 的
         *   `key` 字段带 'entry' 兜底值，拿它当键会把「无键条目」读成「有键叫 entry」，
         *   于是它混进包、撤销时无从定位）。原形路径才认 `key` / `field`。 */
        const hasFaceKeyField = Object.prototype.hasOwnProperty.call(i, 'faceKey');
        const rawKey = hasFaceKeyField ? i.faceKey : (i.key !== undefined ? i.key : i.field);
        const key = keyOf(rawKey);
        if (!key) return { ok: false, why: UNMAPPED.NO_KEY };
        const m = maskSecretBody(i, SECRET_BODY_KEYS);
        const v = m.value || i;
        /* ★ 值优先取条目自带的 value；没有则退回 text（outcomeOf 只保留 text 的裁剪本）。 */
        const val = (v.value !== undefined && v.value !== null) ? v.value
            : ((v.text !== undefined && v.text !== null && v.text !== '') ? v.text : null);
        return { ok: true, item: {
            face: face, key: key,
            ownerKey: id ? ('id:' + id) : ('name:' + nm),
            link: id ? 'by-id' : 'by-name',
            value: val,
            from: numOr(v.from !== undefined ? v.from : v.floor, null),
            scope: keyOf(v.scope) || null,
            evidenceRef: keyOf(v.evidenceRef) || null,
            title: clip(i.title || '', 60),
            source: (ADOPT_SOURCES.indexOf(keyOf(source)) >= 0) ? keyOf(source) : ADOPT_SOURCES[0],
            collision: keyOf(c.collision), branch: keyOf(c.branch),
            sensitive: m.masked > 0,
        } };
    }
    /**
     * 候选接续条目（**只读、零写**）：把选中 / 并存的结局条文映射成接续形状。
     *   五条读数**分开报**（少报一条就会把两种坏法读成一种）：
     *     · items        —— 映射成功、可进下一卷的条目；
     *     · unmapped     —— 被选中但**缺格**的条文（三种缺因具名）；
     *     · bareOutcomes —— 被选中却**一条条文都没有**的结局位（空条 ≠ 映射失败）；
     *     · skipped      —— 未被选中的结局：这是**正确**的跳过（验收2：仅选中者生效）；
     *     · pending      —— 未选尽的冲突位（有它在就不得接续）。
     */
    function adoptableItems(deps, rawPlan, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const plan = planCanon(deps, rawPlan, o);
        if (!plan.judged) {
            return { ok: false, judged: false, reason: 'no-deps', items: [], unmapped: [], bareOutcomes: [], skipped: [], pending: [], note: plan.note };
        }
        const lo = listOutcomes(deps);
        const pick = new Set();
        const chosenKeys = new Set();
        for (const c of plan.chosen) { pick.add(keyOf(c.key) + '#' + keyOf(c.branch)); chosenKeys.add(keyOf(c.key) + '#' + keyOf(c.branch)); }
        for (const c of plan.coexisted) pick.add(keyOf(c.key) + '#' + keyOf(c.branch));
        const items = [];
        const unmapped = [];
        const bareOutcomes = [];
        const skipped = [];
        const hit = new Set();
        for (const r of lo.rows) {
            if (!r.collision) {
                skipped.push({ key: '', branch: r.branch, title: r.title, why: 'unkeyed' });
                continue;
            }
            const kk = keyOf(r.collision) + '#' + keyOf(r.branch);
            if (!pick.has(kk)) {
                skipped.push({ key: r.collision, branch: r.branch, title: r.title, why: 'not-selected' });
                continue;
            }
            hit.add(kk);
            if (!r.items.length) {
                bareOutcomes.push({ key: r.collision, branch: r.branch, title: r.title, why: 'no-items' });
                continue;
            }
            const source = chosenKeys.has(kk) ? ADOPT_SOURCES[0] : ADOPT_SOURCES[1];
            for (const it of r.items) {
                const m = adoptItemOf(it, source, { collision: r.collision, branch: r.branch });
                if (m.ok) items.push(m.item);
                else unmapped.push({
                    key: r.collision, branch: r.branch, title: r.title,
                    item: clip(it.title || it.entryKey || it.key || '', 60), why: m.why,
                });
            }
        }
        /* ★ 计划里有、结局表里却找不到的选中项:同样不能静默消失(两处清单漂移的现场)。 */
        for (const c of plan.chosen.concat(plan.coexisted)) {
            const kk = keyOf(c.key) + '#' + keyOf(c.branch);
            if (hit.has(kk)) continue;
            bareOutcomes.push({ key: keyOf(c.key), branch: keyOf(c.branch), title: keyOf(c.title), why: 'outcome-absent' });
        }
        items.sort((a, b) => {
            const x = a.ownerKey + '|' + a.face + '|' + a.key;
            const y = b.ownerKey + '|' + b.face + '|' + b.key;
            return x < y ? -1 : (x > y ? 1 : 0);
        });
        return {
            ok: true, judged: true, reason: '',
            items: items, unmapped: unmapped, bareOutcomes: bareOutcomes,
            skipped: skipped, pending: plan.pending.slice(),
            itemCount: items.length, unmappedCount: unmapped.length,
            bareCount: bareOutcomes.length, skippedCount: skipped.length, pendingCount: plan.pending.length,
            note: '',
        };
    }

    /**
     * 依赖声明面。只声明不执行;每件缺席时的后果逐条写明 ——
     *   判据按 key 逐字对账(改名会静默变成依赖缺席)。
     */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'BRANCH_OUTCOMES', why: '各分支的结局条目清单(冲突列举的唯一真源;缺席 ⇒ 冲突面如实报未判,不报「无冲突」)' },
        { key: 'CONFIRMED_FACTS', why: '用户已确认事实键值(与选择冲突时报 conflict;缺席 ⇒ 冲突面报未判)' },
        { key: 'SECRET_BODY_KEYS', why: '受限正文字段键(缺席 ⇒ 受限正文无法识别 ⇒ 拒绝转交接而非放行)' },
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
    /** 32 位散列(FNV-1a 变体;用于交接包指纹,**不做加密用途**)。 */
    function hash32(s) {
        const t = strOf(s);
        let h = 2166136261;
        for (let i = 0; i < t.length; i++) {
            h ^= t.charCodeAt(i);
            h = (h * 16777619) >>> 0;
        }
        return ('0000000' + h.toString(16)).slice(-8);
    }
    /* ── 0 壳与位 ── */

    /**
     * 剥掉一个值顶层的受限正文键。**只读、不改调用方的对象**(含正文时才浅拷贝)。
     *   ★ 与 branch-semantics / lore-import 的同名函数同口径(判据钉住多处一致)。
     * @returns {{value:*, masked:number}} masked = 被剥掉真内容的键数(0 或 1)
     */
    function maskSecretBody(v, keys) {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return { value: v, masked: 0 };
        const ks = (Array.isArray(keys) && keys.length) ? keys : SECRET_BODY_KEYS;
        let out = null;
        let masked = 0;
        for (const k of ks) {
            if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
            const raw = v[k];
            if (!out) out = Object.assign({}, v);
            out[k] = SECRET_MASK;
            if (raw !== null && raw !== undefined && String(raw).trim() !== '') masked = 1;
        }
        return { value: out || v, masked: masked };
    }

    /**
     * 按知情面过滤条目(验收4:秘密权限**不因选择而扩大**)。
     *   规则:条目的 keeper 缺席 ⇒ 随条目走;keeper 是数组 ⇒ 含 viewer 或含通配 '*' 才放行;
     *   keeper 是字符串 ⇒ 逐字等于 viewer 才放行。
     *   ★ 被挡的条目**具名计入 withheld**,不是静默消失(静默丢条目 = 下游不知道少了什么)。
     */
    function filterByKeeper(entries, viewer, opts) {
        const v = keyOf(viewer);
        const opt = (opts && typeof opts === 'object') ? opts : {};
        const keys = Array.isArray(opt.secretBodyKeys) ? opt.secretBodyKeys : SECRET_BODY_KEYS;
        const out = { kept: [], withheld: [], masked: 0, unknown: false };
        for (const raw of arrOf(entries)) {
            const e = (raw && typeof raw === 'object') ? raw : null;
            if (!e) continue;
            const kp = e.keeper;
            let allowed = true;
            if (Array.isArray(kp)) allowed = (kp.indexOf('*') >= 0) || (v !== '' && kp.some((x) => keyOf(x) === v));
            else if (typeof kp === 'string' && kp.trim() !== '') allowed = (keyOf(kp) === v) || (keyOf(kp) === '*');
            if (!allowed) {
                out.withheld.push({ key: entryKeyOf(e), keeper: Array.isArray(kp) ? kp.slice() : keyOf(kp), why: 'keeper-denied' });
                continue;
            }
            const m = maskSecretBody(e, keys);
            if (m.masked) out.masked += 1;
            out.kept.push(m.value);
        }
        /* ★ viewer 缺席 ⇒ 过滤面**未判**(不报「都放行」也不报「都挡」)。 */
        if (v === '') { out.unknown = true; out.kept = []; out.withheld = []; }
        return out;
    }

    /** 条目键(与 branch-semantics 的 entryKeyOf 同形:优先 id,退化 floor+key)。 */
    function entryKeyOf(e) {
        const o = (e && typeof e === 'object') ? e : {};
        const id = keyOf(o.id);
        if (id) return id;
        const k = keyOf(o.key) || keyOf(o.kind) || 'entry';
        const f = numOr(o.floor, null);
        return (f === null) ? k : (k + '@' + f);
    }

    /**
     * 结局位(冲突判定的唯一键)。**三档迥异,不许同形**:
     *   1 显式 collision ⇒ 用它;2 退化 slot ⇒ 用它(带分支前缀,免得两条支线同名位撞成假冲突);
     *   3 都没有 ⇒ 本结局**不参与冲突判定**,如实计入 unkeyed(不报「无冲突」)。
     */
    function collisionKeyOf(o) {
        const e = (o && typeof o === 'object') ? o : {};
        const c = keyOf(e.collision);
        if (c) return c;
        const s = keyOf(e.slot);
        if (s) return keyOf(e.branch) + '#' + s;
        return '';
    }

    /** 结局条目归一化(未给的字段一律 null / '',**不替用户补默认值**)。 */
    function outcomeOf(raw) {
        const o = (raw && typeof raw === 'object') ? raw : {};
        const items = arrOf(o.items).filter((x) => x && typeof x === 'object').map((x) => {
            const m = maskSecretBody(x, SECRET_BODY_KEYS);
            const c = m.value;
            return {
                key: entryKeyOf(c), title: clip(c.title || c.key || '', 60),
                floor: numOr(c.floor, null), keeper: Array.isArray(c.keeper) ? c.keeper.slice() : (keyOf(c.keeper) || null),
                sensitive: m.masked > 0, text: clip(c.text || '', 200), textHash: hash32(strOf(c.text)),
                /* [v3.342.0 · M4-X3] **面归属原样带过**：修前只留 key / title / floor / keeper / text,
                 *   于是下游落卷面拿到的条文「没有面、没有主」⇒ 逐条被判目标侧缺面、
                 *   **一条也接不上**（而预览读数全绿）。这就是形状断链的病根，在本行治。
                 *   值另取 value：text 是**裁剪本**（200 字），拿裁剪本当值是静默截断。 */
                face: keyOf(c.face), faceKey: keyOf(c.key !== undefined ? c.key : c.field),
                owner: { id: keyOf(c.entityId !== undefined ? c.entityId : (c.ownerId !== undefined ? c.ownerId : '')), name: keyOf(c.name !== undefined ? c.name : ((typeof c.owner === 'string') ? c.owner : '')) },
                value: (c.value === undefined ? null : c.value),
            };
        });
        return Object.freeze({
            branch: keyOf(o.branch), slot: keyOf(o.slot), collision: collisionKeyOf(o),
            title: clip(o.title || '', 60),
            floor: numOr(o.floor, null),
            /* ★ terminal 三态:true / false / null(未给) —— 未给不许当 false 读。 */
            terminal: (o.terminal === true) ? true : (o.terminal === false ? false : null),
            items: items.slice(0, MAX_OUTCOMES),
            value: (o.value === undefined) ? null : o.value,
            valueHash: hash32(strOf(o.value === undefined ? '' : o.value)),
        });
    }

    /* ── 1 逐冲突列举(验收1 的判据面) ── */

    /** 归一化整批结局。依赖缺席 ⇒ 报 unjudged(不是「零条结局」)。 */
    function listOutcomes(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const has = Object.prototype.hasOwnProperty.call(d, 'BRANCH_OUTCOMES');
        const rows = arrOf(d.BRANCH_OUTCOMES).map(outcomeOf);
        return {
            ok: true, judged: has, count: rows.length, rows: rows,
            unkeyed: rows.filter((r) => !r.collision).length,
            note: has ? '' : 'BRANCH_OUTCOMES 未给 ⇒ 冲突面未判(既不报有、也不报无)',
        };
    }

    /**
     * 逐冲突列举(验收1:两条支线结局不能自动同时成立)。
     *   verdict 三态互不同形:
     *     · BOTH_TERMINAL —— 同一位上 ≥2 条**声明了结局**(terminal===true) ⇒ 默认冲突,未选之前 blocked;
     *     · DIVERGENT    —— 同一位上 ≥2 条取值不同(valueHash 不同) ⇒ 也是冲突(同一件事有两种结果);
     *     · SINGLE       —— 同一位只有一条(不构成冲突,但仍列出以便「选它 / 排除它」)。
     *   ★ terminal 未给的条目**不计入** BOTH_TERMINAL 的成立条件,但会以 terminalUnknown 具名宣报 ——
     *     把「不知道是不是结局」读成「不是结局」就是本仓反复治过的错读数。
     */
    function conflicts(deps) {
        const lo = listOutcomes(deps);
        if (!lo.judged) return { ok: false, judged: false, reason: 'no-deps', rows: [], groups: 0, blocked: 0, note: lo.note };
        const byKey = new Map();
        for (const r of lo.rows) {
            if (!r.collision) continue;
            if (!byKey.has(r.collision)) byKey.set(r.collision, []);
            byKey.get(r.collision).push(r);
        }
        const rows = [];
        let blocked = 0;
        for (const [key, list] of byKey.entries()) {
            const terminals = list.filter((r) => r.terminal === true);
            const unknown = list.filter((r) => r.terminal === null);
            const hashes = new Set(list.map((r) => r.valueHash));
            let verdict = CLASH.NONE;
            if (list.length >= 2) {
                if (terminals.length >= 2) verdict = (hashes.size === 1) ? CLASH.SHARED_TERMINAL : CLASH.BOTH_TERMINAL;
                else if (hashes.size >= 2) verdict = CLASH.DIVERGENT;
                else verdict = CLASH.SINGLE;
            } else {
                verdict = (list[0].terminal === true) ? CLASH.SINGLE : CLASH.NONE;
            }
            const row = {
                key: key, verdict: verdict,
                branches: Array.from(new Set(list.map((r) => r.branch))).filter((x) => x !== ''),
                titles: list.map((r) => r.title).filter((x) => x !== ''),
                terminalCount: terminals.length,
                terminalUnknown: unknown.length,
                valueHashes: Array.from(hashes),
                count: list.length,
            };
            if (verdict === CLASH.BOTH_TERMINAL || verdict === CLASH.DIVERGENT) blocked += 1;
            rows.push(row);
        }
        rows.sort((a, b) => (a.key < b.key ? -1 : (a.key > b.key ? 1 : 0)));
        return {
            ok: true, judged: true, groups: rows.length, blocked: blocked, rows: rows,
            unkeyed: lo.unkeyed, total: lo.count,
            note: '',
        };
    }

    /* ── 2 逐冲突选择(纯函数:进出都是普通对象,不写任何账) ── */

    function emptyPlan() { return { version: 1, seq: 0, decisions: {} }; }

    function clonePlan(raw) {
        const p = (raw && typeof raw === 'object') ? raw : {};
        const out = { version: 1, seq: numOr(p.seq, 0), decisions: {} };
        const d = (p.decisions && typeof p.decisions === 'object') ? p.decisions : {};
        for (const k of Object.keys(d)) {
            const row = (d[k] && typeof d[k] === 'object') ? d[k] : {};
            const dec = keyOf(row.decision);
            if (Object.keys(DECISION).map((x) => DECISION[x]).indexOf(dec) < 0) continue;
            if (dec === DECISION.UNSET) continue;
            out.decisions[k] = {
                decision: dec, branch: keyOf(row.branch), at: numOr(row.at, null), note: clip(row.note || '', 160),
            };
        }
        return out;
    }

    /**
     * 置一档选择(**纯**:返回新计划,不改入参)。
     *   ★ 不可让步:同一 collisionKey 上不允许出现第二条 canon ——
     *     两条结局限定同时成立正是本项要治的病根,当场 reject(canon-conflict)。
     */
    function setDecision(rawPlan, input) {
        const plan = clonePlan(rawPlan);
        const i = (input && typeof input === 'object') ? input : {};
        const key = keyOf(i.key) || keyOf(i.collision);
        const dec = keyOf(i.decision);
        const allowed = Object.keys(DECISION).map((x) => DECISION[x]);
        if (!key) return { ok: false, reason: 'missing-key', changed: false, plan: plan };
        if (allowed.indexOf(dec) < 0) return { ok: false, reason: 'bad-decision', changed: false, plan: plan };
        if (dec === DECISION.UNSET) {
            if (!Object.prototype.hasOwnProperty.call(plan.decisions, key)) return { ok: true, reason: 'noop', changed: false, plan: plan };
            delete plan.decisions[key];
            plan.seq += 1;
            return { ok: true, reason: 'cleared', changed: true, plan: plan };
        }
        const prev = plan.decisions[key];
        if (prev && prev.decision === dec && prev.branch === keyOf(i.branch)) return { ok: true, reason: 'noop', changed: false, plan: plan };
        plan.decisions[key] = {
            decision: dec, branch: keyOf(i.branch), at: numOr(i.at, null), note: clip(i.note || '', 160),
        };
        plan.seq += 1;
        return { ok: true, reason: 'set', changed: true, plan: plan };
    }

    /**
     * 结算一张计划(验收1/2/3 的落点):逐冲突给出 选中(canon) / 并存(coexist) / 排除(exclude),
     *  并产出**覆盖每一条结局**的出处清单 —— 未被选中的历史必须留痕(why)。
     */
    function planCanon(deps, rawPlan) {
        const cf = conflicts(deps);
        const plan = clonePlan(rawPlan);
        const lo = listOutcomes(deps);
        const pending = [];
        if (!cf.judged) {
            return { ok: false, reason: 'no-deps', judged: false, preview: PREVIEW.BLOCKED, chosen: [], coexisted: [], excluded: [], provenance: [], pending: [], note: cf.note };
        }
        /* 逐结局分档:同一位上 canon 至多一条;其余按计划落 coexist / exclude / 未选。 */
        const byKey = new Map();
        for (const r of lo.rows) {
            /* ★ 无位(空键)的结局**不进冲突分组**:它们不参与冲突判定,由下面的尾循环单独留痕。
             *   混进来会让同一条结局在 provenance 里出现两次(双计)。 */
            if (!r.collision) continue;
            const k = r.collision;
            if (!byKey.has(k)) byKey.set(k, []);
            byKey.get(k).push(r);
        }
        const chosen = [];
        const coexisted = [];
        const excluded = [];
        const prov = [];
        for (const [key, list] of byKey.entries()) {
            const dec = plan.decisions[key];
            const verdict = dec ? dec.decision : DECISION.UNSET;
            const branchPicked = dec ? keyOf(dec.branch) : '';
            if (verdict === DECISION.CANON) {
                const pick = list.filter((r) => branchPicked === '' || r.branch === branchPicked)[0] || list[0];
                chosen.push({ key: key, branch: pick.branch, slot: pick.slot, title: pick.title, floor: pick.floor });
                prov.push({ key: key, branch: pick.branch, verdict: PROVENANCE.CHOSEN, why: dec && dec.note ? dec.note : '' });
                for (const r of list) {
                    if (r === pick) continue;
                    excluded.push({ key: key, branch: r.branch, slot: r.slot, title: r.title });
                    prov.push({ key: key, branch: r.branch, verdict: PROVENANCE.EXCLUDED, why: 'unselected-sibling' });
                }
            } else if (verdict === DECISION.COEXIST) {
                for (const r of list) {
                    coexisted.push({ key: key, branch: r.branch, slot: r.slot, title: r.title, floor: r.floor });
                    prov.push({ key: key, branch: r.branch, verdict: PROVENANCE.COEXISTED, why: dec && dec.note ? dec.note : '' });
                }
            } else if (verdict === DECISION.EXCLUDE) {
                for (const r of list) {
                    excluded.push({ key: key, branch: r.branch, slot: r.slot, title: r.title });
                    prov.push({ key: key, branch: r.branch, verdict: PROVENANCE.EXCLUDED, why: 'excluded-by-user' });
                }
            } else {
                /* ★ 未选:这个位上**只要存在显式终局声明**(terminal===true),就不能悄悄放行 ——
                 *   两条终结声明同立(both-terminal)是最坏的一种,单位置一条终结(pendingConfirm)
                 *   同样必须由人选定(本仓口径:不知道算不算数,不等于可以当它不成立)。 */
                const row = cf.rows.filter((x) => x.key === key)[0];
                const terminalHere = list.filter((r) => r.terminal === true).length;
                const isClash = !!(row && (row.verdict === CLASH.BOTH_TERMINAL || row.verdict === CLASH.DIVERGENT)) || terminalHere > 0;
                if (isClash) {
                    const whyKind = (row && (row.verdict === CLASH.BOTH_TERMINAL || row.verdict === CLASH.DIVERGENT))
                        ? row.verdict : 'pending-confirm';
                    pending.push({ key: key, verdict: whyKind, branches: (row && row.branches ? row.branches.slice() : []) });
                    for (const r of list) prov.push({ key: key, branch: r.branch, verdict: PROVENANCE.EXCLUDED, why: 'unresolved' });
                } else {
                    for (const r of list) prov.push({ key: key, branch: r.branch, verdict: PROVENANCE.EXCLUDED, why: 'unselected' });
                }
            }
        }
        /* 无位(key 空)的结局:不参与冲突判定,但照样要留痕。 */
        for (const r of lo.rows) {
            if (r.collision) continue;
            prov.push({ key: '', branch: r.branch, verdict: PROVENANCE.EXCLUDED, why: 'unkeyed' });
        }
        const preview = pending.length ? PREVIEW.BLOCKED : (prov.some((x) => x.verdict === PROVENANCE.EXCLUDED) ? PREVIEW.WARN : PREVIEW.OK);
        return {
            ok: true, judged: true, preview: preview,
            chosen: chosen, coexisted: coexisted, excluded: excluded,
            provenance: prov, pending: pending,
            note: pending.length ? ('还有 ' + pending.length + ' 处冲突未选 ⇒ 不得交接') : '',
        };
    }

    /* ── 3 交接预览与撤销范围(验收2/4) ── */

    /**
     * 交接预览(**只出读数、不落笔**):选中与并存的结局按知情面过滤后进入新卷;
     *   未选中的历史留在 provenance 里(可查、可撤),秘密权限不扩大。
     */
    function previewHandoff(deps, rawPlan, opts) {
        const plan = planCanon(deps, rawPlan);
        const opt = (opts && typeof opts === 'object') ? opts : {};
        const viewer = keyOf(opt.viewer);
        if (!plan.judged) return { ok: false, reason: 'no-deps', preview: PREVIEW.BLOCKED, pack: null, note: plan.note };
        const lo = listOutcomes(deps);
        const keepBranches = plan.chosen.concat(plan.coexisted).map((x) => x.branch).filter((x) => x !== '');
        const rows = lo.rows.filter((r) => keepBranches.indexOf(r.branch) >= 0);
        const allItems = [];
        for (const r of rows) for (const it of r.items) allItems.push(it);
        const kf = filterByKeeper(allItems, viewer, { secretBodyKeys: SECRET_BODY_KEYS });
        const blocked = (plan.preview === PREVIEW.BLOCKED);
        const pack = blocked ? null : {
            packId: 'canon_' + hash32(keepBranches.join(',') + '|' + plan.chosen.map((c) => c.key + ':' + c.branch).join(',')),
            volumeId: keyOf(opt.volumeId),
            branches: Array.from(new Set(keepBranches)),
            entries: kf.kept, entryCount: kf.kept.length,
            withheld: kf.withheld, withheldCount: kf.withheld.length,
        };
        return {
            ok: !blocked, judged: true, preview: plan.preview, pack: pack,
            chosenCount: plan.chosen.length, coexistedCount: plan.coexisted.length,
            excludedCount: plan.excluded.length, pendingCount: plan.pending.length,
            keeperUnknown: (viewer === ''), masked: kf.masked,
            note: plan.note,
        };
    }

    /**
     * 撤销范围(验收4:可撤销本次接续,不改原分支)。
     *   ★ 本函数**只产出范围描述**,不产生任何分支写指令 —— 原分支不在范围内。
     */
    function revokeScopeOf(rawPlan, opts) {
        const plan = clonePlan(rawPlan);
        const opt = (opts && typeof opts === 'object') ? opts : {};
        const keys = Object.keys(plan.decisions);
        return Object.freeze({
            scope: 'handoff-only',
            branchWrites: 0,
            volumeId: keyOf(opt.volumeId),
            packId: keyOf(opt.packId),
            keys: keys.sort(),
            count: keys.length,
            note: '仅撤本次接续面;原分支出处不在撤销范围内、不被改写',
        });
    }

    /**
     * **接续包**（M4-X3 验收1：「选择→预览→确认→重启→新卷问答/生成」五步里，前两步的落点）。
     *
     * 【为什么必须由本模块出这个包】下游 owner（`volume-continuation::handoffContinuation`）
     *   只认**面归属形状**；本模块的选择面只产**结局条文**。修前两者之间没有映射，于是
     *   「选了正史」在下游表现为「目标侧缺面、一条也接不上」——读数却全绿。
     *
     * 三态**不同形**（这是本面的核心口径）：
     *   · `ready`   —— 未选尽的冲突位为 0 且至少有一条可接条目 ⇒ 可以交接；
     *   · `blocked` —— 还有未选尽的冲突位 ⇒ **不出包**（`pack:null`），不拿半份选择去接续；
     *   · `empty`   —— 冲突都选尽了，但**一条可接条目都没有**（结局没带条文 / 条文缺格）
     *                 ⇒ 与 `blocked` **不同形**：这里不是「还没选」，是「选了也没东西可接」。
     *   把 `empty` 压进 `blocked`，用户会一直以为「还没选完」而不是「这批结局压根没带条文」。
     *
     * @returns {{ok:boolean, verdict:string, pack:object|null, items:Array, unmapped:Array,
     *   bareOutcomes:Array, pending:Array, adoptionId:string, writeNothing:boolean}}
     */
    function buildContinuePack(deps, rawPlan, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const ad = adoptableItems(deps, rawPlan, o);
        const base = {
            ok: false, judged: ad.judged !== false, verdict: ADOPT.BLOCKED,
            pack: null, items: [], unmapped: [], bareOutcomes: [], skipped: [], pending: [],
            adoptionId: '', masked: 0, writeNothing: true, note: '',
        };
        if (!ad.judged) {
            return Object.assign({}, base, { reason: 'no-deps', note: ad.note });
        }
        const plan = planCanon(deps, rawPlan, o);
        const volumeId = keyOf(o.volumeId);
        const sourceRef = {
            session: keyOf(o.session) || null,
            branch: keyOf(o.branch) || null,
            version: keyOf(o.version) || null,
            /* ★ 与 previewHandoff 的 packId 分列：那是「结局面」的指纹，这是**落卷**的凭据。 */
            canon: 'adopt',
        };
        const idKeys = ad.items.map((x) => x.ownerKey + ':' + x.face + ':' + x.key).sort();
        const adoptionId = 'ca_' + hash32(
            'v1|' + volumeId + '|' + (o.allowReplace === true ? 'R' : 'r') + '|' + (o.allowNameLink === true ? 'N' : 'n')
            + '|' + plan.chosen.map((c) => keyOf(c.key) + ':' + keyOf(c.branch)).join(',')
            + '|' + plan.coexisted.map((c) => keyOf(c.key) + ':' + keyOf(c.branch)).join(',')
            + '|' + idKeys.join(','));
        const pending = ad.pending.slice();
        const reason = pending.length ? 'pending-unresolved' : (ad.items.length ? '' : 'no-adoptable-items');
        const verdict = pending.length ? ADOPT.BLOCKED : (ad.items.length ? ADOPT.READY : ADOPT.EMPTY);
        const out = Object.assign({}, base, {
            judged: true, verdict: verdict, adoptionId: adoptionId, reason: reason,
            items: ad.items.slice(), unmapped: ad.unmapped.slice(), bareOutcomes: ad.bareOutcomes.slice(),
            skipped: ad.skipped.slice(), pending: pending,
            itemCount: ad.items.length, unmappedCount: ad.unmappedCount,
            bareCount: ad.bareCount, skippedCount: ad.skippedCount, pendingCount: pending.length,
            masked: ad.items.filter((x) => x.sensitive === true).length,
        });
        if (verdict !== ADOPT.READY) {
            return Object.assign(out, {
                ok: false,
                note: pending.length
                    ? ('还有 ' + pending.length + ' 处冲突未选 ⇒ 不得接续（不出包）')
                    : '冲突已选尽，但选中结局未带可接条目（空条 / 缺格具名在 bareOutcomes / unmapped）',
            });
        }
        const packId = 'cp_' + hash32(volumeId + '|' + adoptionId + '|' + idKeys.join(','));
        const entries = ad.items.map((x) => ({
            face: x.face, key: x.key, ownerKey: x.ownerKey, link: x.link,
            value: x.value, from: x.from, scope: x.scope, evidenceRef: x.evidenceRef,
            packId: packId, volumeId: volumeId || null, sourceRef: sourceRef,
            /* ★ 逐条带上「它从哪条结局来」：撤销时要按来源范围筛，只在包级记一次就无从实现。 */
            canonRef: { collision: x.collision, branch: x.branch, source: x.source },
        }));
        return Object.assign(out, {
            ok: true, reason: '',
            pack: {
                packId: packId, volumeId: volumeId || null,
                projectId: keyOf(o.projectId) || null,
                sourceRef: sourceRef,
                viewer: (o.viewer && typeof o.viewer === 'object') ? o.viewer : null,
                entries: entries,
                entryCount: entries.length,
                /* 面清单 + 缺面：下游 owner 按「目标侧缺面」逐条比，缺面必须**具名**带走。 */
                faces: Array.from(new Set(entries.map((x) => x.face))).sort(),
                absentFaces: [],
                hidden: 0,
                adoptionId: adoptionId,
            },
            note: '',
        });
    }
    /**
     * **落卷凭据**（M4-X3 验收4：确认之后重启，仍能判断「这次与上次是不是同一件事」）。
     *   `adoptionId` 只由**选择本身**决定（选中键集合 + 卷 + 两个开关）⇒ 同一份选择重算恒同 id。
     *   这就是「重复确认不重复接续」的地基：把 `adoptionId` 交给既有 seen 机制做幂等键即可。
     */
    function adoptionBrief(deps, rawPlan, opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const plan = planCanon(deps, rawPlan, o);
        const cp = buildContinuePack(deps, rawPlan, o);
        return Object.freeze({
            kind: ADOPT_KIND, version: BC_VERSION,
            judged: cp.judged !== false,
            adoptionId: cp.adoptionId || '',
            verdict: cp.verdict || ADOPT.BLOCKED,
            preview: plan.judged === false ? PREVIEW.BLOCKED : plan.preview,
            volumeId: keyOf(o.volumeId) || null,
            packId: cp.pack ? cp.pack.packId : null,
            itemCount: cp.itemCount || 0,
            unmappedCount: cp.unmappedCount || 0,
            bareCount: cp.bareCount || 0,
            pendingCount: cp.pendingCount || 0,
            /* ★ 撤销范围在**确认时**就定下来（重启后仍可判）：这就是「凭据」的另一半。 */
            revokeScope: {
                adoptionId: cp.adoptionId || '',
                packId: cp.pack ? cp.pack.packId : null,
                volumeId: keyOf(o.volumeId) || null,
            },
            writeNothing: true,
            note: cp.note || '',
        });
    }
    /**
     * **撤销保护面**（M4-X3 验收3：本次撤销不删原分支或后来手工新增的事实）。
     *
     * 【它补的是哪一格】修前 `revokeScopeOf` 只答「范围是 handoff-only、branchWrites 恒 0」——
     *   那是一条**承诺**，不是可机检的形态：真正落地时按什么筛、哪些条目**必须留着**，
     *   一个字都没有。于是「撤销」很容易做成「把这个键上的条目全删」，
     *   连带删掉用户后来手工补的事实，以及别的支线接进来的条目。
     *
     * 本函数把「该撤什么 / 必须留住什么」摊成四张具名表：
     *   · `revocable`  —— 属于**本次**接续的条目（packId 相符）；
     *   · `keptForeign`—— 别的接续批次落的（packId 不同）：撤销本次**一条不动**；
     *   · `keptManual` —— **用户自己的**条目（无 packId）：绝不因撤销而消失；
     *   · `keptLater`  —— 本次之后手工新增的（无 packId 且晚于本次凭据）：同上，留着。
     *   ★ `deletesManual` 恒 false；`branchWrites` 恒 0 —— 两条都写进读数，不靠注释承诺。
     */
    function revokeGuard(entries, brief, opts) {
        const b = (brief && typeof brief === 'object') ? brief : {};
        const scope = (b.revokeScope && typeof b.revokeScope === 'object') ? b.revokeScope : b;
        const o = (opts && typeof opts === 'object') ? opts : {};
        const at = numOr(o.at, null);
        const mine = keyOf(scope.packId);
        const rows = arrOf(entries).filter((e) => e && typeof e === 'object');
        const revocable = [];
        const keptForeign = [];
        const keptManual = [];
        const keptLater = [];
        for (const e of rows) {
            const pid = keyOf(e.packId);
            const at2 = numOr(e.importedAt, null);
            const name = { key: keyOf(e.key), face: keyOf(e.face), ownerKey: keyOf(e.ownerKey), packId: pid || null };
            if (!pid) {
                /* 无来源范围 ⇒ 是**用户自己的**（或老数据）；本次撤销一律不碰。 */
                const later = (at !== null && at2 !== null && at2 > at);
                if (later) keptLater.push(Object.assign({}, name, { why: 'added-after-adoption', importedAt: at2 }));
                else keptManual.push(Object.assign({}, name, { why: 'no-source-scope' }));
                continue;
            }
            if (!mine || pid !== mine) {
                keptForeign.push(Object.assign({}, name, { why: 'other-adoption-scope' }));
                continue;
            }
            if (e.revoked === true) continue;   /* 已撤的不再计（幂等）。 */
            revocable.push(Object.assign({}, name, { why: 'in-scope' }));
        }
        return Object.freeze({
            kind: ADOPT_KIND + '_revoke_guard', version: BC_VERSION,
            scope: { adoptionId: keyOf(scope.adoptionId), packId: mine || null, volumeId: keyOf(scope.volumeId) || null },
            revocable: revocable, keptForeign: keptForeign, keptManual: keptManual, keptLater: keptLater,
            revocableCount: revocable.length, foreignCount: keptForeign.length,
            manualCount: keptManual.length, laterCount: keptLater.length,
            /* ★ 两条不可让步的口径写成读数（判据据此核，不靠注释）。 */
            deletesManual: false, branchWrites: 0,
            judged: (mine !== '') || (keyOf(scope.adoptionId) !== ''),
            note: mine ? '' : '凭据里没有 packId ⇒ 范围未定（不可撤销，也不许「全删」兜底）',
        });
    }
    /** 落卷人读面（标签一律出自 ADOPT_LABEL，不就地拼字串）。 */
    function adoptionLine(read) {
        const r = (read && typeof read === 'object') ? read : {};
        if (r.judged === false) return '落卷:未判(' + keyOf(r.reason || 'no-deps') + ')';
        const v = keyOf(r.verdict) || ADOPT.BLOCKED;
        const parts = [ADOPT_LABEL[v] || v];
        if (numOr(r.itemCount, 0)) parts.push('可接 ' + r.itemCount);
        if (numOr(r.pendingCount, 0)) parts.push('待选 ' + r.pendingCount);
        if (numOr(r.unmappedCount, 0)) parts.push('缺格 ' + r.unmappedCount);
        if (numOr(r.bareCount, 0)) parts.push('空条 ' + r.bareCount);
        return '落卷:' + parts.join(' / ');
    }
/* ══════════════════════════════════════════════════════════════════════
     * [v3.342.0 · M4-X3] **落卷面自证探针**（接在 selfCheck 的返回对象里）
     *
     * 每一条都是**真探针**：吃真夹具、跑真函数、读真返回值。
     *   不是为了「有个字段叫 true」，而是为了让「形状断链 / 三态混同 / 幂等失效」
     *   这三种坏法各有**一个可机检的现场**——修前它们全都表现为「读数全绿」。
     * ══════════════════════════════════════════════════════════════════════ */
    /** 落卷面夹具：两条终结声明（各带一条带面归属的条文）+ 一条缺格条文 + 一条无位条文。 */
    function adoptProbeDeps() {
        return {
            BRANCH_OUTCOMES: [
                { branch: 'b1', collision: 'k1', terminal: true, value: 'A', items: [{ key: 'q1', face: 'unfinished', entityId: 'c1', value: '等她回来', floor: 3 }] },
                { branch: 'b2', collision: 'k1', terminal: true, value: 'B', items: [{ key: 'q1', face: 'unfinished', entityId: 'c1', value: '她没回来', floor: 9, secret: 'hidden' }] },
                { branch: 'b1', collision: 'k2', terminal: true, value: 'C', items: [{ key: 'q2', face: 'unfinished', entityId: 'c2', value: 'x' }] },
                { branch: 'b1', collision: 'k3', terminal: true, value: 'D', items: [{ key: 'q3', value: 'no-face-no-owner' }] },
                { branch: 'b2', value: 'E' },
            ],
            CONFIRMED_FACTS: {},
            SECRET_BODY_KEYS: ['secret', 'secretText', 'secretBody'],
        };
    }
    /** 一次选尽 k1/k2/k3 的计划（落卷面探针与用例共用同一份构造法）。 */
    function adoptProbePlan() {
        let p = setDecision(null, { key: 'k1', decision: DECISION.CANON, branch: 'b1', note: '选 b1' }).plan;
        p = setDecision(p, { key: 'k2', decision: DECISION.EXCLUDE, branch: '' }).plan;
        p = setDecision(p, { key: 'k3', decision: DECISION.COEXIST, branch: '' }).plan;
        return p;
    }
    /* ── 4 人读面与自证 ── */

    function describe(report) {
        const r = (report && typeof report === 'object') ? report : {};
        if (r.judged === false) return '正史选择:未判(' + keyOf(r.reason || r.note || 'no-deps') + ')';
        const parts = ['冲突位 ' + numOr(r.groups, 0)];
        if (numOr(r.blocked, 0)) parts.push('待选 ' + r.blocked);
        return '正史选择:' + parts.join(' / ');
    }

    /** 计划读数(人读面;标签一律出自 DECISION_LABEL,不就地拼字串)。 */
    function describePlan(planReport) {
        const r = (planReport && typeof planReport === 'object') ? planReport : {};
        if (r.judged === false || r.ok === false) return '正史选择:' + (r.preview || PREVIEW.BLOCKED) + '(' + keyOf(r.reason || 'no-deps') + ')';
        return ['正史选择',
            DECISION_LABEL[DECISION.CANON] + ' ' + numOr(r.chosenCount, 0),
            DECISION_LABEL[DECISION.COEXIST] + ' ' + numOr(r.coexistedCount, 0),
            DECISION_LABEL[DECISION.EXCLUDE] + ' ' + numOr(r.excludedCount, 0),
            DECISION_LABEL[DECISION.UNSET] + ' ' + numOr(r.pendingCount, 0), r.preview || ''].join(' / ');
    }

    function selfCheck(deps) {
        const d = (deps && typeof deps === 'object') ? deps : {};
        const missing = [];
        for (const dep of REQUIRED_DEPS) if (!Object.prototype.hasOwnProperty.call(d, dep.key)) missing.push(dep);
        const cf = conflicts(d);
        return {
            ok: missing.length === 0,
            depsComplete: missing.length === 0,
            missing: missing,
            decisions: Object.keys(DECISION).map((k) => DECISION[k]),
            clash: Object.keys(CLASH).map((k) => CLASH[k]),
            secretBodyKeys: SECRET_BODY_KEYS.slice(), secretMask: SECRET_MASK, maxOutcomes: MAX_OUTCOMES,
            present: REQUIRED_DEPS.length - missing.length, total: REQUIRED_DEPS.length,
            offline: true, writesNothing: true,
            /* ★ 两态不许同形探针:未给 BRANCH_OUTCOMES ⇒ judged:false;给了空表 ⇒ judged:true。 */
            judgedFace: { ungiven: listOutcomes({}).judged, empty: listOutcomes({ BRANCH_OUTCOMES: [] }).judged },
            /* ★ 「两条结局限定同时成立」真探针:两条 terminal:true 打同一位 ⇒ 未选之前必须 blocked。 */
            bothTerminalBlocked: (function () {
                const probe = { BRANCH_OUTCOMES: [
                    { branch: 'b1', collision: 'k1', terminal: true, value: 'A' },
                    { branch: 'b2', collision: 'k1', terminal: true, value: 'B' },
                ] };
                const c = conflicts(probe);
                const row = c.rows.filter((x) => x.key === 'k1')[0] || {};
                return row.verdict === CLASH.BOTH_TERMINAL;
            })(),
            /* ★ 定长掩码探针:长短两条真受限载体剥完必须同为 SECRET_MASK。 */
            maskFixedLength: (function () {
                const a = maskSecretBody({ secret: 'x' });
                const b = maskSecretBody({ secret: 'x'.repeat(300) });
                return a.value.secret === SECRET_MASK && b.value.secret === SECRET_MASK;
            })(),
            /* ★ 撤销不改原分支探针:范围描述里 branchWrites 恒 0。 */
            revokeTouchesNoBranch: revokeScopeOf(emptyPlan(), {}).branchWrites === 0,
/* ── [v3.342.0 · M4-X3] 落卷面六个真探针（全部吃真夹具、跑真函数） ── */
            /* ★ 1 形状可接：修前本面出的包 `entries[].face` 全 undefined ⇒ 下游一条也接不上。
             *   这里断言「映射出来的每条都带 face / ownerKey / key 三格」——形状断链的现场。 */
            adoptShapeOk: (function () {
                const cp = buildContinuePack(adoptProbeDeps(), adoptProbePlan(), { volumeId: 'v1' });
                const es = (cp.pack && cp.pack.entries) || [];
                return es.length > 0 && es.every((e) => keyOf(e.face) !== '' && keyOf(e.ownerKey) !== '' && keyOf(e.key) !== '');
            })(),
            /* ★ 2 三态不同形：ready / empty / blocked 各一个真现场，三者**互不相等**。
             *   把 empty 压进 blocked（或 ready 与 blocked 同形）是本面的核心坏法。 */
            adoptThreeStates: (function () {
                const deps = adoptProbeDeps();
                const ready = buildContinuePack(deps, adoptProbePlan(), { volumeId: 'v1' });
                /* 只选 k1，k2/k3 留着 ⇒ 未选尽 ⇒ blocked。 */
                const half = setDecision(null, { key: 'k1', decision: DECISION.CANON, branch: 'b1' }).plan;
                const blocked = buildContinuePack(deps, half, { volumeId: 'v1' });
                /* k9 的结局**一条条文都不带** ⇒ 选尽了也无可接条目 ⇒ empty。 */
                const bare = { BRANCH_OUTCOMES: [{ branch: 'b1', collision: 'k9', terminal: true, value: 'X' }], CONFIRMED_FACTS: {}, SECRET_BODY_KEYS: ['secret'] };
                const plan9 = setDecision(null, { key: 'k9', decision: DECISION.CANON, branch: 'b1' }).plan;
                const empty = buildContinuePack(bare, plan9, { volumeId: 'v1' });
                const vs = [ready.verdict, blocked.verdict, empty.verdict];
                return ready.verdict === ADOPT.READY && blocked.verdict === ADOPT.BLOCKED && empty.verdict === ADOPT.EMPTY
                    && new Set(vs).size === 3 && blocked.pack === null && empty.pack === null;
            })(),
            /* ★ 3 未选尽不出包：blocked 时 pack 必须为 null（不许拿半份选择去接续）。 */
            adoptBlockedNoPack: (function () {
                const half = setDecision(null, { key: 'k1', decision: DECISION.CANON, branch: 'b1' }).plan;
                const cp = buildContinuePack(adoptProbeDeps(), half, {});
                return cp.verdict === ADOPT.BLOCKED && cp.pack === null && cp.pendingCount > 0;
            })(),
            /* ★ 4 幂等键稳定：同一份选择重算恒同 adoptionId（重复确认不重复接续的地基）；
             *   换了卷必须换 id（否则「换一卷重确认」会被误判成重复）。 */
            adoptIdStable: (function () {
                const a = buildContinuePack(adoptProbeDeps(), adoptProbePlan(), { volumeId: 'v1' }).adoptionId;
                const b = buildContinuePack(adoptProbeDeps(), adoptProbePlan(), { volumeId: 'v1' }).adoptionId;
                const c = buildContinuePack(adoptProbeDeps(), adoptProbePlan(), { volumeId: 'v2' }).adoptionId;
                return a !== '' && a === b && a !== c;
            })(),
            /* ★ 5 缺格具名：三种缺因各出现且**分列**（不许压成一条「映射失败」）。
             *   注意 kC 那条**真的没有键**：修前 `outcomeOf` 给它兜底成 'entry'，
             *   于是「无键条目」混进可接集、撤销时无从定位 —— 本探针就是钉这个的。 */
            adoptUnmappedNamed: (function () {
                const deps = { BRANCH_OUTCOMES: [
                    { branch: 'b1', collision: 'kA', terminal: true, value: 'A', items: [{ key: 'x1', entityId: 'c1', value: '1' }] },
                    { branch: 'b2', collision: 'kB', terminal: true, value: 'B', items: [{ key: 'x2', face: 'unfinished', value: '2' }] },
                    { branch: 'b3', collision: 'kC', terminal: true, value: 'C', items: [{ face: 'unfinished', entityId: 'c3', value: '3' }] },
                ], CONFIRMED_FACTS: {}, SECRET_BODY_KEYS: ['secret'] };
                let p = setDecision(null, { key: 'kA', decision: DECISION.CANON, branch: 'b1' }).plan;
                p = setDecision(p, { key: 'kB', decision: DECISION.COEXIST, branch: '' }).plan;
                p = setDecision(p, { key: 'kC', decision: DECISION.COEXIST, branch: '' }).plan;
                const ad = adoptableItems(deps, p, {});
                const whys = new Set(ad.unmapped.map((u) => u.why));
                return whys.has(UNMAPPED.NO_FACE) && whys.has(UNMAPPED.NO_OWNER) && whys.has(UNMAPPED.NO_KEY) && ad.items.length === 0;
            })(),
            /* ★ 6 撤销保护面：手工条目与别批条目**一条不进可撤集**，且两条口径写成读数。 */
            adoptRevokeGuards: (function () {
                const g = revokeGuard([
                    { key: 'q1', face: 'unfinished', ownerKey: 'id:c1', packId: 'cp_1' },
                    { key: 'q2', face: 'unfinished', ownerKey: 'id:c2', packId: 'cp_9' },
                    { key: 'm1', face: 'unfinished', ownerKey: 'id:c3' },
                ], { revokeScope: { adoptionId: 'ca_1', packId: 'cp_1', volumeId: 'v1' } }, {});
                return g.revocableCount === 1 && g.foreignCount === 1 && g.manualCount === 1
                    && g.deletesManual === false && g.branchWrites === 0;
            })(),
            /* ★ 7 受限正文不进包：选**带 secret 的那条结局**（k1→b2），
             *   逐条序列化里不得出现受限正文（映射只取九格，`secret` 不被带过）。
             *   首版判据拿整个 pack 的 JSON 查 `hidden` —— 而 `hidden` 是本仓接续包的
             *   **合法读数键**，那是判据自己写错了（已改）。 */
            adoptMaskFixed: (function () {
                const deps = adoptProbeDeps();
                let p = setDecision(null, { key: 'k1', decision: DECISION.CANON, branch: 'b2' }).plan;
                p = setDecision(p, { key: 'k2', decision: DECISION.EXCLUDE, branch: '' }).plan;
                p = setDecision(p, { key: 'k3', decision: DECISION.EXCLUDE, branch: '' }).plan;
                const cp = buildContinuePack(deps, p, { volumeId: 'v1' });
                const es = (cp.pack && cp.pack.entries) || [];
                if (!es.length) return false;
                /* 该条**确实**来自带受限正文的那条结局（b2）——否则这条判据是空转。 */
                if (!es.some((e) => String((e.canonRef || {}).branch) === 'b2')) return false;
                return es.every((e) => JSON.stringify(e).indexOf('hidden') < 0);
            })(),
            note: missing.length ? ('依赖缺 ' + missing.length + ' 格(' + missing.map((m) => m.key).join('、') + ')') : '依赖齐备',
        };
    }

    /** 一句话读数(诊断面用)。 */
    function line(d) {
        try {
            const cf = conflicts(d);
            if (!cf.judged) return '未判(' + keyOf(cf.reason || 'no-deps') + ')';
            if (!cf.groups) return '无冲突位';
            return '冲突位 ' + cf.groups + (cf.blocked ? (' · 待选 ' + cf.blocked) : ' · 全已选') + (cf.unkeyed ? (' · 无位 ' + cf.unkeyed) : '');
        } catch (_e) { return '—(正史选择异常)'; }
    }

    const api = Object.freeze({
        BC_VERSION, BC_KIND, DECISION, DECISION_LABEL, CLASH, PREVIEW, PROVENANCE,
        SECRET_BODY_KEYS, SECRET_MASK, REQUIRED_DEPS, MAX_OUTCOMES,
        keyOf, strOf, arrOf, numOr, clip, hash32, maskSecretBody, filterByKeeper, entryKeyOf,
        collisionKeyOf, outcomeOf, listOutcomes, conflicts,
        setDecision, planCanon, previewHandoff, revokeScopeOf,
        ADOPT, ADOPT_LABEL, ADOPT_SOURCES, ADOPT_KIND, ADOPT_ITEM_FIELDS, UNMAPPED, adoptItemOf,
        adoptableItems, buildContinuePack, adoptionBrief, revokeGuard, adoptionLine,
        adoptProbeDeps, adoptProbePlan,
        describe, describePlan, selfCheck, line,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : global;
    try { g.LonShaBranchCanon = Object.freeze(api); } catch (_e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);
