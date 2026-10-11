/* ================================================================
 * extract-feedback.js — [v3.316.0 · M-X7] 提取质量反馈与可控策略配置
 *
 * 【为什么需要这一面 / 修前缺口（不是「再建一个账本」）】
 *   本仓已有「召回为什么断在这一格」（`recall-explain.js` X8, v3.294.0）：它解的是
 *   **召回链路**的断点，并给出「先修观测面 / 开别名 / 修失效 / 上调预算」四类建议。
 *   它答不了 M-X7 点名的这一问：**这次为什么提取错了，怎样减少同类错误**。
 *   修前这件事在本仓没有落点，后果有三条（逐条可指认）：
 *     ① 用户侧对提取质量**没有一个反馈入口** ——「漏记 / 错记 / 错角色 / 旧事实未被替换 /
 *        不应记录」这五种错法在读数上同形（都只是「结果不如意」），无法按类减少；
 *     ② 想改只能直接改配置，而**「改了到底有没有用」无处证明** —— 本仓最贵的一类
 *        自欺就是「看着像好了」（当前样本上对了 ≠ 泛化上好了）；
 *     ③ 反馈本身**天然带有正文**（用户要指明「哪句提错了」），一个不走闸的反馈面
 *        等于给「把正文回写进历史事实」开了一条侧路 —— 那正是 M-X8 验收①要拦的。
 *
 * 【与既有面的分工（互不重叠，逐条可指认）】
 *   recall-explain.js      召回链路的断点（注入没进来 / 被裁掉）
 *   projection-pipeline.js 容量对照重跑（X3，`compareStrategies`：同一候选 × 多套配置）
 *   native-fact-admission  这条算不算事实（准入八栏）
 *   fact-lifecycle.js      事实的处置（遗忘 / 撤回 / 保留）
 *   本模块                 提取质量的**用户反馈与受控策略建议**（五类互不同形 / 建议必须有据）
 *
 * 【五类错法（**各自可指认且指向不同面**）】
 *   missed                漏记  —— 该提的没提（提取触发面）
 *   misrecorded           错记  —— 提了但内容错了（提取内容面）
 *   wrong-role            错角色 —— 提给了不该有的角色（身份消歧面：同名异人是它上面的常客）
 *   stale-not-superseded  旧事实未被替换 —— 新值到了、旧值还在（事实换代面）
 *   should-not-record     不应记录 —— 本就不该落账（受控准入门）
 *   ★ 五类**不得压成一句「提错了」**：它们指向五个不同的面，压成一类就等于
 *     「反馈收了一堆，但改哪个开关无从判断」（本仓反复治过的「多处可指认的事实被写成一态」）。
 *
 * 【建议的三种背书（**不得拿「当前样本对了」当证据**）】
 *   proven    有据：同一候选上跑过对照重跑（X3）**且**在留出集上不退化
 *   overfit   只优化了当前样本：对照过了，但留出集未验 / 退化 ⇒ 如实报「可能过拟合」
 *   unproven  **判不了**：没有对照重跑读数（K3 的 compare 缺席 / 未跑）⇒ 不编原因
 *   ★ 第三种是本模块最容易被写错的一格：把「没验过」写成「有用」就是本仓最贵的自欺。
 *
 * 【三条纪律（与 knowledge-trace / memory-package / knowledge-preview 同规格）】
 *   ① **纯函数零写**：不写账、不改配置、不改传入的历史事实（对象一律 copy）；
 *      反馈返回面显式带 `writesHistoryFact:false`，让下游无法把这条口径读漏；
 *   ② **不抛**：输入畸形一律降级为读数（degraded / malformed），绝不外抛；
 *   ③ **不猜**：判不开一律给 indeterminate（并带 decidable:false），不给冒充值；
 *      `apply.auto` **恒为 false**（M-X7 验收：自动调参默认关闭）。
 *
 * 【可移植性说明】
 *   机制动机来自「生成质量反馈必须可归类、可回溯、且改配置前必须有据」这一通用需求；
 *   实现按本仓规范重写（纯函数、零依赖、零写、零联网、读数齐备），未复制任何外部代码。
 * ================================================================ */
(function (root) {
    'use strict';
    const FB_VERSION = 1;
    const FB_RECORD_VERSION = 1;
    const FB_KIND = 'extract_feedback';
    /** 五类错法（**顺序即判定序**；未知类别不得落默认档）。 */
    const PROBLEM_CLASSES = Object.freeze([
        'missed', 'misrecorded', 'wrong-role', 'stale-not-superseded', 'should-not-record'
    ]);
    /** 类别 → 中文标签（读数与面板同源；不另写一份）。 */
    const CLASS_LABELS = Object.freeze({
        missed: '漏记', misrecorded: '错记', 'wrong-role': '错角色',
        'stale-not-superseded': '旧事实未被替换', 'should-not-record': '不应记录'
    });
    /** 类别 → **该改哪个面**（五类指向五个不同面；相同即有类别无法处置）。 */
    const CLASS_TARGETS = Object.freeze({
        missed: 'extraction-trigger', misrecorded: 'extraction-content',
        'wrong-role': 'identity-disambiguation', 'stale-not-superseded': 'fact-supersede',
        'should-not-record': 'admission-gate'
    });
    /** 类别 → 建议动作种类（config / data / rerun 三态，与 recall-explain 同族）。 */
    const CLASS_KINDS = Object.freeze({
        missed: 'config', misrecorded: 'data', 'wrong-role': 'data',
        'stale-not-superseded': 'config', 'should-not-record': 'config'
    });
    /** 建议背书三态（**不得拿「当前样本对了」当证据**）。 */
    const PROOF_VERDICTS = Object.freeze(['proven', 'overfit', 'unproven']);
    /** 反馈 ↔ 原文依据的关联四态（悬空与未关联不同形）。 */
    const LINK_STATES = Object.freeze(['linked', 'dangling', 'missing-evidence', 'indeterminate']);
    /** 应用闸四态（等待用户 ≠ 不可用 ≠ 判不了）。 */
    const GATE_STATES = Object.freeze(['awaiting-user', 'planned', 'not-applicable', 'indeterminate']);
    /** 原始依据三件（缺一即「无据」，不得用空串冒充给出了依据）。 */
    const EVIDENCE_FIELDS = Object.freeze(['floor', 'sourceText', 'extractVersion']);
    const MAX_RECORDS = 60;
    const MAX_NOTE = 200;
    /** 唯一必需依赖：对照重跑（X3）是「建议有据」的**唯一真源**；缺席 ⇒ 建议 unproven。 */
    const REQUIRED_DEPS = Object.freeze([
        { key: 'COMPARE', why: '对照重跑（projection-pipeline.js::compareStrategies）是「建议有据」的唯一真源；缺席 ⇒ 建议 unproven（不编原因）' }
    ]);
    /** 可选依赖：召回解释面（用于读「本轮断点」作旁证）。缺席只影响那一条读数，不影响本面判定。 */
    const OPTIONAL_DEPS = Object.freeze(['RECALL_EXPLAIN']);

    function _t(value, max) {
        const s = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
        return max && s.length > max ? s.slice(0, max) : s;
    }
    /** 取数：只认 number 与非空数字字符串；其余如实 null（**不编 0**）。 */
    function _floorOf(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
        if (typeof value === 'string' && value.trim() !== '' && /^-?\d+$/.test(value.trim())) return Math.trunc(Number(value.trim()));
        return null;
    }
    function _isPlain(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }
    /** 非负整数或 null（0 与「判不了」不同形）。 */
    function _countOf(value) {
        const n = Number(value);
        return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : null;
    }

    /* ─────────── ① 分类：五类错法各自可指认 ─────────── */

    /**
     * 把一条用户反馈归到五类之一（**未知类别不得落默认档**）。
     *
     * 判定序（先「不应当记录」后「记错」，因为前者是准入面、后者是内容面）：
     *   should-not-record → missed → wrong-role → stale-not-superseded → misrecorded
     *   ★ 为什么「不应记录」在第一位：一条本就不该落账的内容，即使提得再准也不该
     *     被归到「错记」—— 那会把准入缺口读成内容质量问题，修错面。
     *
     * @param item {class?|kind?|problem?|flags:{notRecordable?, notExtracted?, roleMismatch?,
     *                                        supersededMissing?, contentWrong?}}
     * @returns {class, label, target, kind, why, source}
     */
    function classify(item) {
        const it = _isPlain(item) ? item : {};
        const raw = _t(it['class'] || it.kind || it.problem, 40);
        const flags = _isPlain(it.flags) ? it.flags : {};
        /* 显式类别优先（且**必须**在表内；表外一律 unknown）。 */
        if (raw) {
            if (PROBLEM_CLASSES.indexOf(raw) >= 0) {
                return {
                    ok: true, class: raw, label: CLASS_LABELS[raw], target: CLASS_TARGETS[raw],
                    kind: CLASS_KINDS[raw], source: 'explicit',
                    why: '用户直接指定的类别（不据信号重推 —— 重推就是把用户的判定当成猜测）'
                };
            }
            return {
                ok: false, class: 'unknown', label: '未知类别', target: null, kind: null,
                source: 'explicit', why: '类别不在五类内：' + raw + '（不落默认档：归错面的代价是改错了地方）'
            };
        }
        /* 信号推导：**仅当**至少一个信号为真才归。全无信号 ⇒ unknown（不猜）。 */
        const sig = [
            ['should-not-record', flags.notRecordable === true],
            ['missed', flags.notExtracted === true],
            ['wrong-role', flags.roleMismatch === true],
            ['stale-not-superseded', flags.supersededMissing === true],
            ['misrecorded', flags.contentWrong === true],
        ];
        const hit = sig.filter((x) => x[1]).map((x) => x[0]);
        if (hit.length === 1) {
            const c = hit[0];
            return {
                ok: true, class: c, label: CLASS_LABELS[c], target: CLASS_TARGETS[c],
                kind: CLASS_KINDS[c], source: 'flags',
                why: '信号命中一个（' + c + '）'
            };
        }
        return {
            ok: false, class: 'unknown', label: '判不了', target: null, kind: null, source: 'none',
            why: (hit.length === 0)
                ? '未给类别也未给信号 ⇒ 判不了（目标面无法确定；不猜）'
                : '多个信号同时命中（' + hit.join(' / ') + '）⇒ 判不了（多因共存时按一面处置会改错地方）'
        };
    }

    /* ─────────── ② 反馈记录：关联原文依据、不改历史事实 ─────────── */

    /** 原始依据三件齐否（缺一即无据；空串不算给出了依据）。 */
    function evidenceOf(item) {
        const it = _isPlain(item) ? item : {};
        const ev = _isPlain(it.evidence) ? it.evidence : it;
        const floor = _floorOf(ev.floor);
        const text = _t(ev.sourceText != null ? ev.sourceText : ev.text, 400);
        const ver = _t(ev.extractVersion, 40);
        const present = { floor: floor !== null, sourceText: !!text, extractVersion: !!ver };
        const missing = EVIDENCE_FIELDS.filter((k) => present[k] !== true);
        return { floor: floor, sourceText: text, extractVersion: ver, present: present, missing: missing, complete: missing.length === 0 };
    }

    /**
     * 写一条反馈记录（**纯函数**：返回新列表，不改入参、不写账、不改历史事实）。
     *
     * ★ 本函数比「记录意见」多两步，这两步是 M-X7 验收①②的落点：
     *   · 关联**原文依据三件**（楼层 / 原文 / 提取版本）—— 缺件则 `linked` 状态如实降级；
     *   · 返回面显式带 `writesHistoryFact:false`（验收①：反馈不得直接成为历史事实）。
     *
     * @param list 已有反馈列表（有界环形，MAX_RECORDS）
     * @param item {class|kind|problem|flags, floor, sourceText, extractVersion, note,
     *              caseRef, candidateId, suggestionId}
     * @param opts {now}
     */
    function record(list, item, opts) {
        try {
            const o = _isPlain(opts) ? opts : {};
            const prev = Array.isArray(list) ? list.slice(0, MAX_RECORDS) : [];
            const it = _isPlain(item) ? item : {};
            if (!_isPlain(item)) {
                return { ok: false, reason: 'malformed', list: prev, count: prev.length,
                    writesHistoryFact: false, decidable: false,
                    why: '反馈入参非对象 ⇒ 判不了（不假装记下了）' };
            }
            const cls = classify(it);
            const ev = evidenceOf(it);
            /* 关联状态：类别判不了 ⇒ indeterminate；依据不全 ⇒ missing-evidence；
             *   有 caseRef 但拿不到实体 ⇒ dangling（如实报悬空，不伪装可跳转）。 */
            let link = 'linked';
            let linkWhy = '类别与原文依据均在位';
            if (!cls.ok) { link = 'indeterminate'; linkWhy = cls.why; }
            else if (!ev.complete) { link = 'missing-evidence'; linkWhy = '原始依据缺件：' + ev.missing.join('、'); }
            else if (it.dangling === true) { link = 'dangling'; linkWhy = '原文依据的楼层在本文/本卷之外 ⇒ 悬空（不伪装可跳转）'; }

            const rec = {
                version: FB_RECORD_VERSION,
                at: _floorOf(o.now),
                cls: cls.class,
                label: cls.label,
                target: cls.target,
                ok: cls.ok,
                clsWhy: cls.why,
                clsSource: cls.source,
                floor: ev.floor,
                extractVersion: ev.extractVersion,
                /* ★ 原文依据**只存引用摘要**（前 80 字），不整段携带：
                 *   反馈面不是第二条事实库（同 `memory-tools-api.js` 的「投影不复制第二份事实库」纪律）。 */
                evidenceDigest: ev.sourceText ? ev.sourceText.slice(0, 80) : '',
                evidenceComplete: ev.complete,
                evidenceMissing: ev.missing.slice(),
                link: link,
                linkWhy: linkWhy,
                caseRef: _t(it.caseRef, 60),
                candidateId: _t(it.candidateId, 60),
                suggestionId: _t(it.suggestionId, 60),
                note: _t(it.note, MAX_NOTE),
            };
            const next = [rec].concat(prev).slice(0, MAX_RECORDS);
            return {
                ok: true, list: next, count: next.length,
                /* ★ 验收①“反馈不得直接成为历史事实”——写进返回面，让下游无法读漏。 */
                writesHistoryFact: false,
                classified: cls.ok,
                link: link,
                why: '记录意见，不写账、不改历史事实（写法归 owner 侧经既有门）'
            };
        } catch (e) {
            return { ok: false, reason: 'thrown', error: String((e && e.message) || e),
                list: (Array.isArray(list) ? list : []), count: 0, writesHistoryFact: false, decidable: false };
        }
    }

    /** 反馈读数：按类别聚合（**同类计数不得混入不得类别**）。 */
    function tally(list, opts) {
        const o = _isPlain(opts) ? opts : {};
        const arr = Array.isArray(list) ? list : null;
        if (!arr) {
            return { ok: false, reason: 'not-a-list', measurable: false, total: 0, byClass: {}, unknown: 0, linked: 0, unlinked: 0 };
        }
        const byClass = {};
        for (const c of PROBLEM_CLASSES) byClass[c] = 0;
        let unknown = 0;
        /* ★ 关联状态**按四态分列**（悬空 ≠ 依据不全 ≠ 未归类 ≠ 已关联）：
         *   把四态压成「linked / 不是 linked」会让「依据不全」与「悬空」同形，
         *   而两者的处置相反（前者去补依据，后者去核对卷外引用）。 */
        const byLink = {};
        for (const k of LINK_STATES) byLink[k] = 0;
        for (const r of arr) {
            if (!_isPlain(r)) { unknown++; byLink['indeterminate']++; continue; }
            const c = _t(r['class'] || r.cls, 40);
            if (PROBLEM_CLASSES.indexOf(c) >= 0) byClass[c]++;
            else unknown++;
            const lk = LINK_STATES.indexOf(r.link) >= 0 ? r.link : 'indeterminate';
            byLink[lk]++;
        }
        const linked = byLink['linked'];
        const unlinked = arr.length - linked;
        return {
            ok: true, measurable: true, total: arr.length, byClass: byClass,
            unknown: unknown, linked: linked, unlinked: unlinked, byLink: byLink,
            /* 指向面读数据：**只给真出现过的类别**（不把 0 当成「这一类没问题」）。 */
            targets: (function () {
                const t = {};
                for (const c of PROBLEM_CLASSES) if (byClass[c] > 0) t[CLASS_TARGETS[c]] = (t[CLASS_TARGETS[c]] || 0) + byClass[c];
                return t;
            })(),
            empty: arr.length === 0,
            why: '按五类聚合；不在五类内的计入 unknown（不归入任何一类）'
        };
    }

    /* ─────────── ③ 建议：必须有据（对照重跑 + 留出集） ─────────── */

    /**
     * 从一条反馈 + 对照重跑读数产出**策略建议**。
     *
     * ★ 三条硬纪律（M-X7 验收②③④逐条落点）：
     *   ① `apply.auto` **恒为 false**（验收③：自动调参默认关闭）；
     *   ② 背书只看**真读数**：`compare` 缺席 ⇒ `unproven`（J 判不了），
     *      跑过但留出集未验/退化 ⇒ `overfit`（K 只优化了当前样本）；
     *   ③ `evidence[].field` 必须是**入参上真实存在的路径**（可核；不编原因）。
     *
     * @param feedback 一条反馈记录（record() 的产物）或原始 item
     * @param trace    { compare, holdout } —— compare 是 X3 的对照重跑读数（唯一真源）
     * @param opts     { now, suggestionId }
     */
    function suggest(feedback, trace, opts) {
        try {
            const o = _isPlain(opts) ? opts : {};
            const fb = _isPlain(feedback) ? feedback : null;
            if (!fb) {
                return { ok: false, reason: 'no-feedback', suggestions: [], count: 0,
                    autoParamTuning: false, decidable: false, why: '无反馈记录 ⇒ 不产建议' };
            }
            const cls = _t(fb['class'] || fb.cls, 40);
            if (PROBLEM_CLASSES.indexOf(cls) < 0) {
                /* ★ 类别判不了时**只给一条**「先修归类」，绝不在错的类别上编配置建议
                 *   （在错的读数上调参比不调更坏 —— 与 recall-explain 的 degraded 同纪律）。 */
                return {
                    ok: true, suggestions: [{
                        id: 'fix-classification',
                        title: '先修归类（这条反馈归不到五类里）',
                        targets: ['feedback-intake'],
                        evidence: [evidence('cls', fb.cls || null, '本条的类别读数')],
                        apply: { auto: false, kind: 'data', key: null, from: null, to: null,
                            note: '归类判不了时不产配置建议 —— 改错了面比不改更坏' },
                        verify: { how: '重标一次类别（五类之一）', then: '再看这一类的定向读数' },
                        requiresUserChoice: true,
                        proof: 'unproven', proofWhy: '归类未定，无从对照',
                    }],
                    count: 1, autoParamTuning: false, proof: 'unproven', decidable: false
                };
            }
            /* ★ 坏源降级（验收③「坏源失败时解释可降级」）：trace 非对象 ⇒ 如实点名，
             *   走 unproven 分支（不抛、不编原因）。 */
            const tr = _isPlain(trace) ? trace : {};
            const traceMalformed = (trace != null && !_isPlain(trace));
            const cmp = _isPlain(tr.compare) ? tr.compare : null;
            const ho = _isPlain(tr.holdout) ? tr.holdout : null;

            /* ---------- 背书判定（★ 本模块的核心，不拿「当前样本对了」当证据） ---------- */
            let proof = 'unproven';
            let proofWhy = '';
            if (traceMalformed) {
                proof = 'unproven';
                proofWhy = '轨迹入参畸形（非对象）⇒ 判不了，不得据此给「有用」的结论（坏源降级，不抛）';
            } else if (!cmp) {
                proof = 'unproven';
                proofWhy = '无对照重跑读数（COMPARE 缺席 / 未跑）⇒ 不编原因、不产「有用」的结论';
            } else if (cmp.measurable === false || cmp.ok === false) {
                proof = 'unproven';
                proofWhy = '对照重跑不可测（' + String(cmp.reason || cmp.why || '未自述') + '）⇒ 不可测 ≠ 通过';
            } else if (!ho) {
                proof = 'overfit';
                proofWhy = '对照跑过但**留出集未验** ⇒ 只证明了当前样本，可能出现「过拟合」';
            } else if (ho.measured === false) {
                proof = 'overfit';
                proofWhy = '留出集未跑（measured:false）⇒ 同「未验」处置，不冒充已验';
            } else if (ho.improved === true) {
                proof = 'proven';
                proofWhy = '对照可测 + 留出集真跑且改善（不是只优化当前样本）';
            } else if (ho.regressed === true) {
                proof = 'overfit';
                proofWhy = '★ 留出集**退化** ⇒ 只优化了当前样本（本仓最贵的那类自欺），明确不建议采用';
            } else {
                proof = 'overfit';
                proofWhy = '留出集跑了但没有改善读数（neither improved nor regressed）⇒ 收益不可见';
            }

            /* ---------- 建议本体：类别 → 一条定向动作 ---------- */
            const target = CLASS_TARGETS[cls];
            const kind = CLASS_KINDS[cls];
            const evList = [evidence('cls', cls, '反馈类别（决定改哪个面）')];
            if (cmp) {
                evList.push(evidence('compare.measurable', (cmp.measurable === true), '对照重跑是否可测'));
                if (cmp.diff && Array.isArray(cmp.diff.rows)) {
                    evList.push(evidence('compare.diff.rows', cmp.diff.rows.length, '对照方案数（同一候选）'));
                }
            }
            if (ho) {
                evList.push(evidence('holdout.measured', (ho.measured === true), '留出集是否真跑'));
                if (ho.improved !== undefined) evList.push(evidence('holdout.improved', ho.improved, '留出集是否改善'));
                if (ho.regressed !== undefined) evList.push(evidence('holdout.regressed', ho.regressed, '留出集是否退化'));
            }
            const sug = {
                id: _t(o.suggestionId, 60) || ('fb-' + cls),
                title: CLASS_LABELS[cls] + ' ⇒ 改「' + target + '」面',
                targets: [target],
                evidence: evList,
                apply: {
                    /* ★ 验收③：自动调参默认关闭 —— 这里恒 false，不是「默认值是 false」。 */
                    auto: false, kind: kind, key: null, from: null, to: null,
                    note: '具体键值由用户在面板上显式选定（本面只给面向，不给值 —— 给值就是在替用户调参）'
                },
                verify: {
                    how: '以**同一候选**跑 X3 对照重跑，并在留出集上复测（不是只看当前样本）',
                    then: (proof === 'proven') ? '对照与留出集双绿 ⇒ 可显式应用' : '先补对照 / 留出集读数，再决定是否应用'
                },
                requiresUserChoice: true,
                proof: proof,
                proofWhy: proofWhy,
                /* 依据是否完整：缺件时应先补原文依据（否则改完无从归因）。 */
                evidenceComplete: (fb.evidenceComplete === true),
            };
            return {
                ok: true, suggestions: [sug], count: 1, autoParamTuning: false,
                proof: proof, proofWhy: proofWhy,
                /* 「判不了」单独一档：unproven 时 decidable:false（不是「改不动」）。 */
                decidable: (proof !== 'unproven')
            };
        } catch (e) {
            return { ok: false, reason: 'thrown', error: String((e && e.message) || e),
                suggestions: [], count: 0, autoParamTuning: false, decidable: false };
        }
    }

    function evidence(field, value, note) {
        return { field: field, value: (value === undefined ? null : value), note: _t(note, 120) };
    }

    /* ─────────── ④ 应用闸：等待用户 ≠ 不可用 ≠ 判不了 ─────────── */

    /**
     * 应用闸：把「这条建议现在能不能应用」判成四态。
     *
     * ★ 为什么单列一态而不是布尔：`awaiting-user`（判得了、就等你点）与
     *   `indeterminate`（判不了，因为它没有背书）处置相反 —— 前者该提示用户，
     *   后者该先去补对照读数。压成一态就会出现「没验过的建议直接被应用」。
     *
     * @param suggestion 建议本体（suggest() 的产物）
     * @param opts { userConfirmed, requiresEvidence }
     */
    function gate(suggestion, opts) {
        const o = _isPlain(opts) ? opts : {};
        const s = _isPlain(suggestion) ? suggestion : null;
        if (!s) {
            return { state: 'indeterminate', decidable: false, mayApply: false,
                why: '无建议 ⇒ 判不了（不假装「没什么要做的」）' };
        }
        if (s.proof === 'unproven') {
            return { state: 'indeterminate', decidable: false, mayApply: false,
                why: '建议无背书（无对照重跑读数）⇒ 判不了，不得应用（先补读数）' };
        }
        if (o.requiresEvidence === true && s.evidenceComplete !== true) {
            return { state: 'not-applicable', decidable: true, mayApply: false,
                why: '原始依据不全（缺楼层 / 原文 / 提取版本）⇒ 先补依据，否则改完无从归因' };
        }
        if (o.userConfirmed === true) {
            return { state: 'planned', decidable: true, mayApply: true,
                why: '用户已确认 + 有 ' + s.proof + ' 背书 ⇒ 可应用（写法仍归 owner 侧经既有门）' };
        }
        return { state: 'awaiting-user', decidable: true, mayApply: false,
            why: '有 ' + s.proof + ' 背书，等用户显式确认（自动调参默认关闭）' };
    }

    /** 批量：逐条出读数（与单条**同函**，不另写一份）。 */
    function batch(list, trace, opts) {
        const arr = Array.isArray(list) ? list : null;
        if (!arr) {
            return { ok: false, reason: 'not-a-list', measurable: false, total: 0, indeterminate: 0, rows: [] };
        }
        const rows = [];
        const byProof = { proven: 0, overfit: 0, unproven: 0 };
        let ind = 0;
        for (const fb of arr) {
            const s = suggest(fb, trace, opts);
            rows.push({ id: (s.suggestions[0] ? s.suggestions[0].id : ''), proof: s.proof || 'unproven', count: s.count || 0, decidable: (s.decidable === true) });
            const p = s.proof || 'unproven';
            if (byProof[p] !== undefined) byProof[p]++;
            if (s.decidable !== true) ind++;
        }
        return {
            ok: true, measurable: true, total: arr.length, indeterminate: ind,
            byProof: byProof, rows: rows, autoParamTuning: false, empty: arr.length === 0,
            why: '逐条与单条同函（不另写一份）；空批与「有但全判不了」不同形'
        };
    }

    /* ─────────── ⑤ 自述 · 自检 · 诊断行 ─────────── */

    /**
     * 自述面（供诊断与下游消费）。
     * ★ 三份依赖与「三类禁止」一处写明：`apply.auto` 恒 false / 反馈不写历史事实 /
     *   原文依据只存摘要（不复制第二份事实库）。
     */
    function describe(deps) {
        const d = _isPlain(deps) ? deps : {};
        const missing = REQUIRED_DEPS.filter((r) => !d[r.key]).map((r) => r.key);
        const present = REQUIRED_DEPS.filter((r) => !!d[r.key]).map((r) => r.key);
        const optionalMissing = OPTIONAL_DEPS.filter((k) => !d[k]);
        /* ★ 五类 → 五个面**必须一一对应**（两类别指向同一面 ⇒ 有类别无法被定向处置）。 */
        const targets = PROBLEM_CLASSES.map((c) => CLASS_TARGETS[c]);
        const targetDistinct = (new Set(targets)).size === targets.length;
        return {
            version: FB_VERSION,
            kind: FB_KIND,
            classes: PROBLEM_CLASSES.slice(),
            classLabels: Object.assign({}, CLASS_LABELS),
            classTargets: Object.assign({}, CLASS_TARGETS),
            classKinds: Object.assign({}, CLASS_KINDS),
            targetDistinct: targetDistinct,
            proofVerdicts: PROOF_VERDICTS.slice(),
            linkStates: LINK_STATES.slice(),
            gateStates: GATE_STATES.slice(),
            evidenceFields: EVIDENCE_FIELDS.slice(),
            maxRecords: MAX_RECORDS,
            /* 三条不变量自述（面板与下游据此读口径）。 */
            autoParamTuning: false,
            writesHistoryFact: false,
            evidenceDigestOnly: true,
            requiredDeps: REQUIRED_DEPS.map((r) => ({ key: r.key, why: r.why })),
            optionalDeps: OPTIONAL_DEPS.slice(),
            missingDeps: missing,
            presentDeps: present,
            optionalMissing: optionalMissing,
            /* 「判不了」与「没改的」不得同形（本仓最贵的老账）。 */
            indeterminateDistinct: (PROOF_VERDICTS.indexOf('unproven') >= 0),
        };
    }

    /**
     * 自检：**真跑**五类分类 + 三种背书 + 应用闸四态（不只对常量自己断言）。
     */
    function selfCheck(deps) {
        const out = { ok: true, problems: [], probes: {} };
        const probe = (name, fn) => {
            try { out.probes[name] = fn(); }
            catch (e) { out.ok = false; out.problems.push(name + ': ' + String((e && e.message) || e)); }
        };
        const d = _isPlain(deps) ? deps : {};
        /* 五类各自可达（每类一个信号 ⇒ 必须落到自己那一类）。 */
        probe('missed', () => classify({ flags: { notExtracted: true } })['class']);
        probe('misrecorded', () => classify({ flags: { contentWrong: true } })['class']);
        probe('wrongRole', () => classify({ flags: { roleMismatch: true } })['class']);
        probe('stale', () => classify({ flags: { supersededMissing: true } })['class']);
        probe('shouldNotRecord', () => classify({ flags: { notRecordable: true } })['class']);
        /* 未知类别不得落默认档；多信号共存判不了。 */
        probe('unknownClass', () => classify({ 'class': 'something-else' })['class']);
        probe('multiSignal', () => classify({ flags: { notExtracted: true, contentWrong: true } })['class']);
        /* 三种背书各自可达。 */
        probe('unproven', () => suggest({ cls: 'missed' }, {}, {}).proof);
        probe('overfit', () => suggest({ cls: 'missed' },
            { compare: { measurable: true }, holdout: { measured: false } }, {}).proof);
        probe('proven', () => suggest({ cls: 'missed' },
            { compare: { measurable: true }, holdout: { measured: true, improved: true } }, {}).proof);
        /* 应用闸四态。 */
        probe('awaiting', () => gate({ proof: 'proven' }, {}).state);
        probe('planned', () => gate({ proof: 'proven' }, { userConfirmed: true }).state);
        probe('notApplicable', () => gate({ proof: 'proven', evidenceComplete: false }, { requiresEvidence: true }).state);
        probe('gateInd', () => gate({ proof: 'unproven' }, {}).state);
        /* 反馈不写历史事实（返回面必须带 false）。 */
        probe('noHistoryFact', () => record([], { 'class': 'missed', floor: 3, sourceText: 'x', extractVersion: 'v1' }).writesHistoryFact);
        /* 反馈面**零写**：源码里不得出现写口（由判据逐词钉住，这里给一条行为读数）。 */
        probe('autoOff', () => suggest({ cls: 'missed' }, { compare: { measurable: true }, holdout: { measured: true, improved: true } }, {}).suggestions[0].apply.auto);
        /* 五类 → 五面一一对应。 */
        const tset = new Set(PROBLEM_CLASSES.map((c) => CLASS_TARGETS[c]));
        if (tset.size !== PROBLEM_CLASSES.length) { out.ok = false; out.problems.push('类别目标面重复（有类别无法被定向处置）'); }
        /* 依赖面：必需件缺席不改 ok（本面仍可判「无据」，只是建议会 unproven）。 */
        if (REQUIRED_DEPS.some((r) => !r.key)) { out.ok = false; out.problems.push('必需依赖声明缺 key'); }
        out.deps = { missing: describe(d).missingDeps, present: describe(d).presentDeps };
        out.version = FB_VERSION;
        return out;
    }

    /** 诊断一行 —— **四种坏法分开写**：模块没挂 / 依赖缺格 / 口径不自洽 / 面在位。 */
    function line(read, deps) {
        const r = _isPlain(read) ? read : {};
        if (r.moduleMissing) return '模块未加载（extract-feedback.js）';
        if (r.thrown) return '反馈读取异常（已降级，不外抛）';
        const d = describe(deps || r.deps);
        if (d.targetDistinct === false) return '⚠️ 五类指向的面有重复（有类别无法被定向处置）';
        if (d.missingDeps.length) return '待用（面在位 · ' + PROBLEM_CLASSES.length + ' 类 · 对照缺格 ⇒ 建议一律 unproven）';
        const t = r.tally || null;
        if (!t || t.measurable !== true) return '待用（面在位 · ' + PROBLEM_CLASSES.length + ' 类 · ' + EVIDENCE_FIELDS.length + ' 件依据 · 零写离线）';
        if (t.empty) return '空（还没有反馈）';
        const parts = ['反馈 ' + t.total];
        for (const c of PROBLEM_CLASSES) if (t.byClass[c] > 0) parts.push(CLASS_LABELS[c] + ' ' + t.byClass[c]);
        if (t.unknown) parts.push('**未归类 ' + t.unknown + '**');
        if (t.unlinked) parts.push('**依据不全 ' + t.unlinked + '**');
        return parts.join(' · ');
    }

    /* ─────────── ⑥ 导出自洽（本档自检读数的指纹） ─────────── */

    /**
     * 导出面指纹 —— 用来钉住「导出面某一日被悄悄加宽 / 减项」这件事。
     * ★ 只用**导出名 + 值级形态**算指纹；不含任何正文 / 角色数据。
     */
    function surfaceDigest(api) {
        const a = api || {};
        const names = Object.keys(a).sort();
        let h = 2166136261;
        const feed = (s) => {
            for (let i = 0; i < s.length; i++) {
                h ^= s.charCodeAt(i);
                h = Math.imul(h, 16777619);
            }
        };
        for (const n of names) {
            const v = a[n];
            const kind = Array.isArray(v) ? 'array:' + v.length
                : (v === null ? 'null' : typeof v);
            feed(n + '=' + kind + ';');
        }
        return { names: names, count: names.length, digest: ('0000000' + (h >>> 0).toString(16)).slice(-8) };
    }

    const api = Object.freeze({
        FB_VERSION, FB_RECORD_VERSION, FB_KIND,
        PROBLEM_CLASSES, CLASS_LABELS, CLASS_TARGETS, CLASS_KINDS,
        PROOF_VERDICTS, LINK_STATES, GATE_STATES, EVIDENCE_FIELDS,
        MAX_RECORDS, MAX_NOTE,
        REQUIRED_DEPS, OPTIONAL_DEPS,
        classify, evidenceOf, record, tally,
        suggest, evidence, gate, batch,
        describe, selfCheck, line, surfaceDigest
    });
    /* ★ 显式挂浏览器全局（**不要**写成 `? window : this` —— 在 Node 下模块顶层
     *   `this === module.exports`，全局会挂到 exports 上而不是 globalThis，
     *   宿主 `_moduleLib` 与无头套件两条取件路都读不到。这是 v3.314.0 实测到的自伤。） */
    if (root) {
        try { root.LonShaExtractFeedback = api; } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
