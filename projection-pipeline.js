/* ================================================================
 * projection-pipeline.js — [v3.208.0] 投影管线（纯函数，零依赖）
 *
 * 【为什么需要这一面 / 修前实测后果】
 *   v3.176.0 给「本插件侧账本 → 世界账本对读」修好了一根线：宿主在
 *   index.js 里手工收集两个投影（`_localPeopleLocations()` / `_localFactKeys()`），
 *   随 opts 传给 `clock.readWorldLedger`。实测问题有三：
 *     ① **通路只通两根线**：WorldAxis 对外有 12 条面（worldClock / pulse / digest /
 *        currents / echoes / facts / people / opinion / counts / filter …），
 *        本插件侧能参与对读的却只有「人物位置」「事实键」两项，其余**连读数都没有**；
 *     ② **没有管线，只有两次手工调用**：每加一个投影就要再改一遍宿主函数体，
 *        且「加没加」无从判定（零调用即静默缺席）；
 *     ③ **缺席不可归因**：收集失败与「源里本来就没有」同形——都返回 `{}` / `[]`，
 *        下游 `diffPeople` 于是把「查不出来」当成「两边一致」。
 *
 * 【本模块补的到底是什么（不是「多读几个字段」，是三类结构性缺口）】
 *   ① **声明式登记**：投影是**一张表**（PROJECTIONS），不是散在宿主里的两次调用。
 *      每个投影声明 ①id ②它服务哪个对读面 ③取值器（值提供器）④空值形状。
 *      加投影 = 加一行；「有没有被收集」变成可机检事实。
 *   ② **三态读数**（本模块的核心纪律，与 world-ledger-reader 的 sectionState 同规格）：
 *      · `ok`      —— 取到了，且非空（value）
 *      · `empty`   —— 取到了，但源明确说「没有」（空数组/空对象/显式 null）
 *      · `absent`  —— 压根取不到（提供器未注册 / 抛异常 / 宿主字段不存在）
 *      `absent` 与 `empty` 处置相反（前者降级并留痕，后者照常对读），压成一态就再也分不出来。
 *      **提供器抛异常一律记 `absent` 并带上原因**，绝不静默退化成空对象。
 *   ③ **归因**：每个投影带 `reason`（缺席原因字符串）+ `elapsedMs`（取数耗时），
 *      诊断面因此能回答「为什么这个投影是空的」而不是只知道「它是空的」。
 *
 * 【本模块**不做**什么（边界）】
 *   · 不做对读本身（diff/diffPeople/diffFacts 在 world-ledger-reader.js，单一真源）；
 *   · 不做世界状态的读或写（那是 world-clock-reader 的事）；
 *   · 不把 `{}` 当「没有」——空对象与「源里没这项」在本模块里**必须可分**（这是本模块存在的理由）。
 *
 * 【v3.270.0 · B2/X1 新增：注入容量预演（sourceLedger.prediction）】
 *   下游 F-9 干跑能答「哪些世界书条目会被激活」（取数层），但注入前答不出
 *   「这条世界书占多少 token、它会挤掉哪条记忆」。本轮补上，落点是 **sourceLedger 的新子键**，
 *   **不动 ENVELOPE_FIELDS、不抬 PROJECTION_API_VERSION** —— 理由与边界见 predictInjection 头注释。
 * ================================================================ */
(function (global) {
    'use strict';

    const PROJECTION_VERSION = 1;

    /**
     * 投影登记表（单一真源）。
     * 每项：{ id, face, empty, why }
     *   id    —— 投影标识（诊断面与对读面都用它认领）
     *   face  —— 它服务哪个对读面（people / facts 是 v3.176 既有两算；其余为新增读数）
     *   empty —— 空值形状：'object' | 'array'（三态判定要按形状区分「空对象」与「空数组」）
     *   why   —— 这个投影为什么存在（缺席时也照实说出来，不含糊）
     * 顺序即诊断面展示顺序。
     */
    const PROJECTIONS = Object.freeze([
        { id: 'peopleLocations', face: 'people', empty: 'object', why: '本插件记「谁在哪里」，与世界侧 people 对读；位置对不上是剧情真正会崩的地方' },
        { id: 'factKeys', face: 'facts', empty: 'array', why: '本插件已完成的事实键集（大纲节拍 + 世界推进事件），与世界侧 facts 对读' },
        { id: 'characterNames', face: 'people', empty: 'array', why: '角色表全体名字（含无位置者）——「世界侧提了一个我不认识的人」要能看出来' },
        { id: 'clockDay', face: 'worldClock', empty: 'value', why: '本插件侧剧情日（世界钟对读的另一半；此前只有世界侧单边读数）' },
        { id: 'promiseKeys', face: 'currents', empty: 'array', why: '未了结的约定/伏笔的主题键，与世界侧暗流 title 对读' },
        { id: 'knowledgeOwners', face: 'facts', empty: 'object', why: '「谁知道这条事实」（角色→事实键），用于发现「我知道了但角色不知道」的认知错位' },
    ]);

    /* [v3.212.0] L-F5：面向下游（RubyPhone）的**稳定投影契约**。
     *
     * 为什么需要（修前实测）：本模块此前产出的管线读数只服务**内部对读**——
     *   `_runProjections()` 的结果随 `readWorldLedger` 的 opts 下传，退化成
     *   `this._lastProjection` 之后**没有任何外供出口**（索引器实测：模块挂载点之外
     *   `LonShaProjectionPipeline` 零引用；快照 15 字段里无投影）。
     *   后果与 v3.176 的「通路只通两根线」同形，只是换了一层：投影有读数、可归因，
     *   但**下游拿不到** —— 契约的另一半（出口）不存在。
     *
     * 契约两版本**必须分开**（合一会让消费者为了读结构去追每个投影的增删）：
     *   · PROJECTION_VERSION      —— 管线**读数语义**版本（加/删一个投影就抬）；
     *   · PROJECTION_API_VERSION  —— envelope **结构**版本（字段增删才抬）。
     *   消费者按 api 版判「认不认得这份结构」，按管线版判「读数语义有没有换代」。
     */
    const PROJECTION_API_VERSION = 1;

    /** envelope 必填字段（单一真源；构建与裁定都从这里取，不许各写一份）。 */
    const ENVELOPE_FIELDS = Object.freeze([
        'projectionApiVersion', 'projectionVersion', 'generatedAt',
        'conversationId', 'sceneId', 'worldId',
        'items', 'visibility', 'sourceLedger', 'revision', 'expiresAt',
    ]);

    /** 默认有效期（毫秒）。过期**不等于**失效 —— 下游据 expiresAt 自行决定是否重取。 */
    const DEFAULT_TTL_MS = 60000;

    function isPlainObject(v) {
        return !!v && typeof v === 'object' && !Array.isArray(v);
    }

    /** 三态判定（按声明形状）。与 world-ledger-reader.sectionState 同规格，但不共享实现（跨模块耦合成本高于重复 6 行）。 */
    function stateOf(value, emptyShape) {
        if (value === undefined || value === null) return { present: false, kind: (value === null ? 'empty' : 'absent'), count: 0 };
        if (Array.isArray(value)) return { present: true, kind: value.length ? 'value' : 'empty', count: value.length };
        if (typeof value === 'object') {
            const n = Object.keys(value).length;
            return { present: true, kind: n ? 'value' : 'empty', count: n };
        }
        // 标量：有值即 value（clockDay 这类；0 是合法值，不得当空）
        return { present: true, kind: 'value', count: 1 };
    }

    /** 归一：把空形状与声明对齐（提供器返回错形状时按声明纠正，不静默放行）。 */
    function shapeAs(value, emptyShape) {
        if (value === null) return emptyShape === 'array' ? [] : (emptyShape === 'object' ? {} : null);
        return value;
    }

    /**
     * 跑投影管线。
     * @param providers { id: () => value } 值提供器表（宿主侧只负责「怎么取值」）
     * @param opts { only?: string[], nowProvider?: () => number, declaration?: array }
     *   only —— 只跑这些 id（默认全跑；用于「关掉某些投影」的配置面，且关掉的仍进读数并标 skipped）
     * @returns { version, ts, projections: { id: read }, summary, identity }
     *
     * 纪律：**任何提供器抛异常都不得中断管线**（其余投影照跑），异常投影记 absent + reason='thrown: ...'。
     */
    function runPipeline(providers, opts) {
        const o = opts || {};
        const decl = Array.isArray(o.declaration) && o.declaration.length ? o.declaration : PROJECTIONS;
        const prov = (providers && typeof providers === 'object') ? providers : {};
        const only = Array.isArray(o.only) ? new Set(o.only) : null;
        const clock = (typeof o.nowProvider === 'function') ? o.nowProvider : (() => Date.now());
        let t0 = 0;
        try { t0 = Number(clock()) || 0; } catch (_e) { t0 = 0; }

        const read = {};
        let okN = 0, emptyN = 0, absentN = 0, skippedN = 0;

        for (const d of decl) {
            const id = String(d && d.id || '');
            if (!id) continue;
            const entry = { id, face: d.face || '', why: d.why || '', empty: d.empty || 'object' };
            if (only && !only.has(id)) {
                entry.present = false; entry.kind = 'absent'; entry.count = 0;
                entry.reason = 'skipped-by-config'; entry.elapsedMs = 0; entry.value = entry.empty === 'array' ? [] : (entry.empty === 'object' ? {} : null);
                skippedN++; read[id] = entry; continue;
            }
            const fn = prov[id];
            if (typeof fn !== 'function') {
                // 提供器未注册 ≠ 源为空：这条必须与 empty 可分，否则「忘了接」会伪装成「没有」
                entry.present = false; entry.kind = 'absent'; entry.count = 0;
                entry.reason = 'no-provider'; entry.elapsedMs = 0;
                entry.value = entry.empty === 'array' ? [] : (entry.empty === 'object' ? {} : null);
                absentN++; read[id] = entry; continue;
            }
            const s0 = Number(clock()) || 0;
            let value;
            try { value = fn(); }
            catch (e) {
                entry.present = false; entry.kind = 'absent'; entry.count = 0;
                entry.reason = 'thrown: ' + String((e && e.message) || e);
                entry.elapsedMs = Math.max(0, (Number(clock()) || 0) - s0);
                entry.value = entry.empty === 'array' ? [] : (entry.empty === 'object' ? {} : null);
                absentN++; read[id] = entry; continue;
            }
            const v = shapeAs(value, entry.empty);
            const st = stateOf(v, entry.empty);
            entry.present = st.present; entry.kind = st.kind; entry.count = st.count;
            entry.reason = st.kind === 'value' ? 'ok' : (st.kind === 'empty' ? 'source-empty' : 'absent');
            entry.elapsedMs = Math.max(0, (Number(clock()) || 0) - s0);
            entry.value = v;
            if (st.kind === 'value') okN++; else if (st.kind === 'empty') emptyN++; else absentN++;
            read[id] = entry;
        }

        const summary = { total: Object.keys(read).length, ok: okN, empty: emptyN, absent: absentN, skipped: skippedN };
        return {
            version: PROJECTION_VERSION,
            ts: t0,
            projections: read,
            summary,
            // 自洽：三态 + skipped 必须恰好盖满登记表（漏算即账目崩，账本自己报出来）
            identity: {
                declared: decl.length,
                counted: okN + emptyN + absentN + skippedN,
                ok: (okN + emptyN + absentN + skippedN) === decl.length,
            },
        };
    }

    /* ================================================================
     * [v3.270.0 · B2/X1] 注入容量预演：把「世界书占多少、挤掉哪条记忆」变成注入前可算的读数
     * ================================================================
     *
     * 【为什么要有这一面 / 修前实测后果】
     *   下游 ruby-phone 的 F-9 干跑能回答「哪些世界书条目会被激活」（**取数层**），
     *   但注入前**答不出**两件事：① 这些条目占多少 token；② 记忆预算还剩多少可支配。
     *   于是「一堆常驻世界书把预算吃光」只能靠改完再看一轮 —— 干跑停在诊断工具，升不成调参工具。
     *   本仓既有的 cost-forecast **不能复用**来答：它的输入是记忆候选块全集（allBlocks），
     *   输入面里**没有世界书**，所以它对「世界书占用」结构性盲。
     *
     * 【机制事实（本轮读码实证，不是猜的）】
     *   injection-router.deriveBudget 的 reserve 槽按 token 从预算里扣：
     *     `budget = max(200, budget - floor(reserve * 10 / 9))`   ← 与 index.js 内联回落逐项等价
     *   宿主把 reserve 取成 keepRecentTokenReserve（最近正文预留）。因此
     *   「外部占用多少」与「记忆还剩多少」落在**同一个公式**里：把世界书占用并入 reserve 槽，
     *   即得「若它也进预算，记忆侧还能剩多少」。⇒ 预演**复用真路径的同一批纯函数**（derive），
     *   不另写近似公式 —— 另写就是「同一事实两个真源」，预测值会随真路径漂移而不自知。
     *
     * 【为什么不进 ENVELOPE_FIELDS、不抬 PROJECTION_API_VERSION（本版最重要的设计结论）】
     *   下游 config/projection-contract.js 认死 SUPPORTED_API_VERSION = 1：上游一抬版，
     *   四个现役业务 App（place / chars / plotline / clock）当场判 ahead → unusable。
     *   抬版的成立前提是**消费者也改**；本仓不自足于下游，改不了就变成「为加两个字段打断四条
     *   现役读线」——那正是本仓点名的「交付即破坏」。
     *   ⇒ 预演作为 **sourceLedger 的新子键**落地：下游 projection-contract 保留的是整个
     *   raw.sourceLedger（它只按 available / bound / reason / absent / summary / identity 取用，
     *   没有封闭键清单），故新子键**当下即可读**；旧下游完全不读它，也不会坏。
     *   ENVELOPE_FIELDS / contractOf 一字不动 ⇒ v3212 的 deepStrictEqual 与五态裁定全部照旧。
     *
     * 【三态（与其余读出口同规格，各自独立可分）】
     *   · measurable:false  —— 预算推导不可复算（injection-router 缺席）⇒ 预算面全 null，**不编数字**；
     *   · worldbook.known:false —— 宿主没给世界书读数（无 ctx.lore / 取数抛错）⇒ 占用**未知**，
     *     绝不写 0（「未知」与「零占用」同形是本仓最贵的那一类账）；
     *   · memory.known:false —— 宿主还没跑过注入 ⇒ 候选块面未知（同样不写 0）。
     * ================================================================ */
    const PREDICTION_VERSION = 1;
    /** [v3.289.0 · X3] 策略对照读数的**结构**版本（字段增删才抬；与 PREDICTION_VERSION 分列，
     *  因为「单套预演」与「多套对照」是两个可独立演进的消费面）。 */
    const COMPARE_VERSION = 1;

    const _num0 = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    /** 字符 → token 估算（与 estimateTextTokens 的 CJK 口径同族：汉字≈0.9 token/字） */
    const _tokOfChars = (chars) => { const c = _num0(chars); return c > 0 ? Math.max(1, Math.ceil(c * 9 / 10)) : 0; };

    /**
     * 注入容量预演（纯函数、不抛）。
     *
     * @param opts {
     *   items        记忆候选面 [{ id, label, chars, tokens, resident }] | null（未跑过注入给 null）
     *   baseBudget / tokenBudget / reserve / chatLength / adaptive / decayFloors  预算输入
     *   router       injection-router api（缺席 ⇒ measurable:false）
     *   derive       覆盖用（默认 router.deriveBudget；注入以便负控制替换）
     *   worldbook    { known, count, chars, reason, source } —— 宿主取数；取不到给 known:false
     *   atRiskLimit  挤占样本上限（默认 5）
     *   strategy     裁剪策略名（只作自述，不参与复算）
     *   now          时间戳
     * }
     * @returns {object} 结构恒定（不可测处一律 null + reason，不用 0 冒充）
     */
    function predictInjection(opts) {
        const o = isPlainObject(opts) ? opts : {};
        const router = o.router || null;
        const derive = (typeof o.derive === 'function') ? o.derive
            : ((router && typeof router.deriveBudget === 'function') ? router.deriveBudget : null);
        const baseBudget = _num0(o.baseBudget);
        const tokenBudget = _num0(o.tokenBudget);
        const reserve = _num0(o.reserve);
        const chatLength = _num0(o.chatLength);
        const budgetOpts = { adaptive: o.adaptive, decayFloors: o.decayFloors };

        const wbRaw = isPlainObject(o.worldbook) ? o.worldbook : null;
        const wbKnown = !!(wbRaw && wbRaw.known === true);
        const wbChars = wbKnown ? _num0(wbRaw.chars) : null;
        const wbTokens = (wbChars === null) ? null : _tokOfChars(wbChars);
        const wb = {
            known: wbKnown,
            reason: String((wbRaw && wbRaw.reason) || (wbKnown ? 'ok' : 'not-provided')),
            source: (wbRaw && wbRaw.source) ? String(wbRaw.source) : null,
            count: wbKnown ? _num0(wbRaw.count) : null,
            chars: wbChars,
            tokens: wbTokens,
        };

        const knownItems = Array.isArray(o.items);
        const items = knownItems ? o.items.filter(isPlainObject) : null;
        const memoryChars = knownItems ? items.reduce((a, it) => a + Math.max(0, _num0(it.chars)), 0) : null;
        const memoryTokens = knownItems ? items.reduce((a, it) => a + Math.max(0, _num0(it.tokens)), 0) : null;
        const residentItems = knownItems ? items.filter((it) => it.resident === true) : null;
        const residentChars = knownItems ? residentItems.reduce((a, it) => a + Math.max(0, _num0(it.chars)), 0) : null;

        const out = {
            version: PREDICTION_VERSION,
            ts: _num0(o.now),
            strategy: String(o.strategy || 'balanced'),
            measurable: false,
            reason: 'no-router',
            why: '',
            empty: false,
            worldbook: wb,
            memory: {
                known: knownItems, items: knownItems ? items.length : null, chars: memoryChars, tokens: memoryTokens,
                residentItems: knownItems ? residentItems.length : null, residentChars: residentChars,
            },
            budget: {
                base: baseBudget, tokenBudget: tokenBudget, reserve: reserve, chatLength: chatLength,
                now: null, ifWorldbook: null, deltaChars: null,
            },
            headroom: { now: null, ifWorldbook: null },
            squeeze: null,
        };

        if (!derive) {
            out.why = 'injection-router 未加载：预算推导不可复算，不预测（照抄会把它伪装成预测成功）';
            return out;
        }
        if (!wbKnown || wbChars === null) {
            out.reason = 'worldbook-unknown';
            out.why = '世界书占用未知（宿主未提供读数）⇒ 不预演挤占（写 0 会把「未知」读成「没占用」）';
            return out;
        }

        let budgetNow = null, budgetIf = null;
        try {
            budgetNow = _num0(derive(baseBudget, tokenBudget, reserve, chatLength, budgetOpts));
            // 世界书占用并入 reserve 槽（token 计）—— 与真路径同一个公式、同一个函数
            budgetIf = _num0(derive(baseBudget, tokenBudget, reserve + (wbTokens || 0), chatLength, budgetOpts));
        } catch (e) {
            out.reason = 'derive-threw';
            out.why = '预算推导抛异常：' + String((e && e.message) || e);
            return out;
        }

        const squeezedChars = Math.max(0, budgetNow - budgetIf);
        const squeezedTokens = _tokOfChars(squeezedChars);

        out.measurable = true;
        out.reason = 'ok';
        out.why = '预算按真路径纯函数复算（世界书占用并入 reserve 槽，与 keepRecentTokenReserve 同槽）';
        out.empty = knownItems ? (items.length === 0) : false;
        out.budget.now = budgetNow;
        out.budget.ifWorldbook = budgetIf;
        out.budget.deltaChars = -squeezedChars;
        out.headroom.now = knownItems ? (budgetNow - memoryChars) : null;
        out.headroom.ifWorldbook = knownItems ? (budgetIf - memoryChars) : null;

        // 挤占面：chars/tokens 是**精确复算**；「挤掉哪几条」只给口径自述的样本
        //   （真裁剪走 trimToBudget 的四种策略，谁被丢由策略定；此处不假装知道，只按尾部优先取样本）
        const overflowNow = knownItems ? Math.max(0, memoryChars - budgetNow) : null;
        const overflowIf = knownItems ? Math.max(0, memoryChars - budgetIf) : null;
        const wouldTrimNow = knownItems ? (memoryChars > budgetNow) : null;
        const wouldTrimIf = knownItems ? (memoryChars > budgetIf) : null;

        let atRisk = null;
        if (knownItems && squeezedChars > 0) {
            const limit = Math.max(0, _num0(o.atRiskLimit) || 5);
            const picked = [];
            let acc = 0;
            for (let i = items.length - 1; i >= 0 && picked.length < limit; i--) {
                const it = items[i];
                const c = Math.max(0, _num0(it.chars));
                acc += c;
                picked.push({ id: (it.id === undefined ? null : it.id), label: String(it.label || '').slice(0, 40), chars: c });
                if (acc >= squeezedChars) break;
            }
            atRisk = {
                basis: 'tail-first',
                why: '谁被真裁剪丢掉由 trimToBudget 的策略定（本模块不复算策略）⇒ 此处只按尾部优先给样本，chars 合计才是精确量',
                scannedChars: acc,
                covered: acc >= squeezedChars,
                items: picked,
            };
        }

        out.squeeze = {
            deltaChars: squeezedChars,
            deltaTokens: squeezedTokens,
            overflowCharsNow: overflowNow,
            overflowCharsIfWorldbook: overflowIf,
            wouldTrimNow: wouldTrimNow,
            wouldTrimIfWorldbook: wouldTrimIf,
            // 「世界书把记忆从『刚好装下』推过线」这一类：现在不裁、加了世界书就裁
            pushesIntoTrim: (wouldTrimNow === false && wouldTrimIf === true),
            atRisk: atRisk,
        };
        return out;
    }

    /**
     * [v3.289.0 · X3] 注入**策略对照**（在同一批候选与会话身份上比较多套配置）。
     *
     * 【为什么需要这一面 / 修前实测后果】
     *   X1 交付的 `predictInjection(opts)` 只答**一套**配置（一个预算 / 一个策略 / 一组开关）
     *   下的推演结果。用户真正要做的决定是**比较**：「预算 3000 换 1800 会怎样」
     *   「`tail-first` 换 `head-first` 谁被挤掉」——没有对照就只能改一轮、看一轮、再改一轮。
     *
     * 【本模块做什么】
     *   · `compareStrategies(opts)`：**冻结同一份候选与会话身份**，对 `plans` 里每套配置
     *     逐一套用**同一个** `predictInjection`（不是另写一套近似公式——另写就是第二真源），
     *     再给出逐项对照与「谁被挤掉」的差异。
     *   · `exact / constant-only / unknown` 三档来源可信度：原文要求
     *     「由 worldbook-dryrun 或已核对的宿主出口提供真正激活条目，区分 exact/constant-only/unknown」。
     *     本模块按 `opts.itemsSource` 自述 + 逐项 `it.activation` 判定：
     *       `exact`          —— 来源自述为 dryrun/verified，且候选带激活标记（真激活条目）；
     *       `constant-only`  —— 只拿到常驻（constant）条目，触发项不可知 ⇒ **不得**当完整激活用；
     *       `unknown`        —— 来源未自述或自述为未知。
     *     **三档只影响 `activation` 读数与 `why`，不影响预算复算**（预算只吃 chars/tokens）。
     *
     * 【与原文验收的对应（逐条落点）】
     *   · 「给同一输入的预演与实际路径一致」—— 每套 plan 都走同一个 `predictInjection`，
     *     本函数**不含**任何自算公式（负控制会摘掉这一条来证明归因）。
     *   · 「对照不调用模型、不写账、不改当前开关」—— 纯函数、无 IO、只读入参；
     *     本函数**没有**任何写回路径（`applied:false` 是结构常量，见下）。
     *   · 「未取得实际激活时只报告有限范围」—— `activation` 三档 + `scope.limited`。
     *   · 「禁用条目不计实际注入，非激活内容不计」—— 候选在**过滤前**逐项剔除
     *     `it.disabled === true` 与 `it.active === false` 两项（本模块不引入额外的
     *     `activeFilter` 抽象：过滤口径就是这两个直判，多包一层反而多一个可漂移的真源），
     *     剔除量计入 `scope.excluded` 读数（「排除了多少」本身也要可解释，
     *     否则「少算」与「本来没有」同形）。
     *   · 「保留 projection API v1 消费兼容」—— 本函数是**新增出口**，不改
     *     `ENVELOPE_FIELDS`、不抬 `PROJECTION_API_VERSION`、不改任何既有返回结构。
     *
     * 【本函数**不做**什么（边界）】
     *   · **不应用**任何方案：返回结构里 `applied` 恒 `false` 且 `applyHint` 只说明
     *     「应用是显式配置动作，走宿主设置面」——本模块不写配置（无写权限即无静默改开关）。
     *   · **不预测模型侧**：模型调用、token 计费口径都不在面内。
     *   · **不假装知道谁被真裁剪丢掉**：沿用 `predictInjection` 的 `atRisk.basis='tail-first'`
     *     口径（谁被丢由 `trimToBudget` 的策略定），对照的差异只按同一口径给**同源可比**样本。
     *
     * @param {object} opts
     *   items        候选块（**冻结的同一份**；每套 plan 复用，绝不按 plan 重取）
     *   plans        方案数组，每项 `{ id, label?, baseBudget?, tokenBudget?, reserve?, strategy?,
     *                sources? }`（`sources` 是来源开关自述，进读数**不参与复算**）
     *   itemsSource  候选来源自述：`{ kind:'dryrun'|'verified'|'constant'|..., note? }`
     *   router/derive/worldbook/chatLength/adaptive/decayFloors/atRiskLimit  透传给 predictInjection
     *   now          时间戳
     * @returns {object} 结构恒定（不可测处一律 null + reason，不用 0 冒充）
     */
    function compareStrategies(opts) {
        const o = isPlainObject(opts) ? opts : {};
        const plans = Array.isArray(o.plans) ? o.plans.filter(isPlainObject) : null;
        const src = isPlainObject(o.itemsSource) ? o.itemsSource : null;
        const srcKind = src ? String(src.kind || 'unknown') : 'unknown';
        const srcNote = src ? String(src.note || '') : '';

        /* 候选：先按「真参与注入」过滤（禁用 / 非激活不计），再算合计。
         *   —— 过滤只影响**候选合计**；每套 plan 仍然拿到同一份**未过滤**原始候选，
         *      过滤口径随 itemsSource 走，不由 plan 各自决定（否则两套 plan 的基数不同，对照无效）。 */
        const raw = Array.isArray(o.items) ? o.items.filter(isPlainObject) : null;
        const excluded = { disabled: 0, inactive: 0, chars: 0 };
        let eligible = null;
        if (raw) {
            eligible = [];
            for (const it of raw) {
                if (it.disabled === true) { excluded.disabled++; excluded.chars += Math.max(0, _num0(it.chars)); continue; }
                if (it.active === false) { excluded.inactive++; excluded.chars += Math.max(0, _num0(it.chars)); continue; }
                eligible.push(it);
            }
        }

        /* 来源可信度三档（只影响 activation 读数与 why，不影响预算复算）。 */
        const hasActivationMark = !!(eligible && eligible.some((it) => it.activation === 'exact'
            || it.activation === 'constant-only' || it.activation === 'unknown'));
        let activation = 'unknown';
        if (srcKind === 'dryrun' || srcKind === 'verified') activation = 'exact';
        else if (srcKind === 'constant') activation = 'constant-only';
        const activationWhy = {
            exact: '来源自述为 dryrun/verified ⇒ 候选即真正激活条目，对照可按完整激活读',
            'constant-only': '来源只给常驻（constant）条目，触发项不可知 ⇒ 不得当完整激活读，'
                + '本对照的「挤占」只覆盖常驻部分（范围有限，已在 scope.limited 标出）',
            unknown: '来源未自述（缺 worldbook-dryrun / 已核对宿主出口）⇒ 只报告有限范围',
        }[activation];

        const out = {
            version: COMPARE_VERSION,
            ts: _num0(o.now),
            applied: false,
            applyHint: '应用是**显式配置动作**：本函数只对照，不改任何开关；改配置走宿主设置面',
            itemsSource: { kind: srcKind, note: srcNote, hasActivationMark: hasActivationMark },
            activation: activation,
            activationWhy: activationWhy,
            scope: {
                /* 范围自述：候选基数（过滤后）+ 被排除多少 + 是否只覆盖常驻。 */
                eligibleItems: eligible ? eligible.length : null,
                rawItems: raw ? raw.length : null,
                excluded: excluded,
                limited: (activation !== 'exact'),
                limitedWhy: (activation === 'exact') ? '' : activationWhy,
            },
            plans: null,
            diff: null,
            why: '',
        };

        if (!plans || !plans.length) {
            out.why = '未提供 plans（至少一套配置才算对照）⇒ 不给结论';
            return out;
        }
        if (!raw) {
            out.why = '未提供候选 items ⇒ 无对照基数（写 0 会把「未知」读成「没有」）';
            return out;
        }

        /* 每套 plan 套用**同一个** predictInjection（单一真源）。 */
        const results = [];
        for (const p of plans) {
            const id = (p.id === undefined || p.id === null) ? ('plan' + (results.length + 1)) : String(p.id);
            const callOpts = {
                router: o.router, derive: o.derive, worldbook: o.worldbook,
                baseBudget: (p.baseBudget === undefined) ? o.baseBudget : p.baseBudget,
                tokenBudget: (p.tokenBudget === undefined) ? o.tokenBudget : p.tokenBudget,
                reserve: (p.reserve === undefined) ? o.reserve : p.reserve,
                chatLength: (p.chatLength === undefined) ? o.chatLength : p.chatLength,
                adaptive: (p.adaptive === undefined) ? o.adaptive : p.adaptive,
                decayFloors: o.decayFloors,
                atRiskLimit: (p.atRiskLimit === undefined) ? o.atRiskLimit : p.atRiskLimit,
                strategy: (p.strategy === undefined) ? o.strategy : p.strategy,
                /* 候选**同一份**：这是「冻结同一候选」的落点（不按 plan 重取）。 */
                items: eligible,
                now: o.now,
            };
            let r = null;
            let threw = null;
            try { r = predictInjection(callOpts); } catch (e) { threw = String((e && e.message) || e); }
            results.push({
                id: id,
                label: String(p.label || id),
                sources: isPlainObject(p.sources) ? p.sources : null,
                config: {
                    baseBudget: _num0(callOpts.baseBudget), tokenBudget: _num0(callOpts.tokenBudget),
                    reserve: _num0(callOpts.reserve), chatLength: _num0(callOpts.chatLength),
                    strategy: String(r ? r.strategy : (callOpts.strategy || 'balanced')),
                },
                measurable: !!(r && r.measurable),
                reason: threw ? 'predict-threw' : (r ? String(r.reason) : 'predict-missing'),
                why: threw ? ('predictInjection 抛异常：' + threw) : (r ? String(r.why) : ''),
                budget: r ? r.budget : null,
                headroom: r ? r.headroom : null,
                squeeze: r ? r.squeeze : null,
                raw: r,
            });
        }
        out.plans = results;

        /* ---------- 逐项对照 ---------- */
        const measurablePlans = results.filter((r) => r.measurable);
        if (!measurablePlans.length) {
            out.why = '所有方案都不可测（' + results.map((r) => r.id + ':' + r.reason).join(' / ')
                + '）⇒ 不给对照结论（不可测≠通过）';
            return out;
        }
        const base = results[0];
        const rows = [];
        for (const r of results) {
            rows.push({
                id: r.id,
                measurable: r.measurable,
                budgetNow: (r.budget ? r.budget.now : null),
                budgetIfWorldbook: (r.budget ? r.budget.ifWorldbook : null),
                headroomNow: (r.headroom ? r.headroom.now : null),
                headroomIfWorldbook: (r.headroom ? r.headroom.ifWorldbook : null),
                squeezeChars: (r.squeeze ? r.squeeze.deltaChars : null),
                wouldTrimNow: (r.squeeze ? r.squeeze.wouldTrimNow : null),
                wouldTrimIfWorldbook: (r.squeeze ? r.squeeze.wouldTrimIfWorldbook : null),
                pushesIntoTrim: (r.squeeze ? r.squeeze.pushesIntoTrim : null),
                /* 与**第一套**逐项差（对照的用途就是「换成它会怎样」）。 */
                deltaBudgetNow: (r.budget && base.budget && r.budget.now !== null && base.budget.now !== null)
                    ? (r.budget.now - base.budget.now) : null,
                deltaSqueezeChars: (r.squeeze && base.squeeze && r.squeeze.deltaChars !== null
                    && base.squeeze.deltaChars !== null)
                    ? (r.squeeze.deltaChars - base.squeeze.deltaChars) : null,
                atRiskIds: (r.squeeze && r.squeeze.atRisk && Array.isArray(r.squeeze.atRisk.items))
                    ? r.squeeze.atRisk.items.map((x) => (x.id === undefined ? null : x.id)) : null,
            });
        }
        /* 「谁被挤掉」的差异：同一口径下的样本集差异（不是精确真裁剪结果，口径见 atRisk.why）。 */
        const baseRisk = rows[0].atRiskIds;
        for (const row of rows) {
            row.atRiskDeltaVsBase = (baseRisk && row.atRiskIds)
                ? row.atRiskIds.filter((x) => !baseRisk.includes(x)) : null;
        }
        out.diff = {
            baseId: base.id,
            rows: rows,
            /* 差异结论只在**全部方案可测**时给，否则缩小到可测子集并如实标注。 */
            allMeasurable: (measurablePlans.length === results.length),
            comparedIds: measurablePlans.map((r) => r.id),
            skippedIds: results.filter((r) => !r.measurable).map((r) => r.id),
        };
        out.why = '每套方案复用同一个 predictInjection（单一真源）；候选冻结为同一份（'
            + (eligible ? eligible.length : 0) + ' 项）；来源可信度 ' + activation;
        return out;
    }
    /**
     * [v3.212.0] 把一次管线读数装成**对外投影 envelope**（纯函数、不抛）。
     *
     * 三条纪律（与本仓其余读出口同规格）：
     *   · 只搬值：`items` 只放投影**值本体**，读数元数据（三态/原因/耗时）全部进
     *     `sourceLedger` —— 下游不该为了读一个位置表而解析一层读数结构；
     *   · 不猜：管线缺席（null）时**不伪造成「一切为空」**，而是给出 sourceLedger.available=false
     *     与 reason，因为「投影没跑」与「投影跑了但都为空」处置相反；
     *   · 不抛：任何畸形入参都收敛成一份结构完整的 envelope。
     *
     * @param {object|null} pipeline runPipeline() 的返回值（null = 管线缺席/未跑）
     * @param {object} opts { scope?:{conversationId,sceneId,worldId}, revision?:number,
     *                        ttlMs?:number, nowProvider?:()=>number, reason?:string }
     * @returns {object} envelope（字段见 ENVELOPE_FIELDS）
     */
    function buildEnvelope(pipeline, opts) {
        const o = isPlainObject(opts) ? opts : {};
        const scope = isPlainObject(o.scope) ? o.scope : {};
        let now = 0;
        try { now = Number(typeof o.nowProvider === 'function' ? o.nowProvider() : Date.now()) || 0; } catch (_e) { now = 0; }
        const ttl = (Number(o.ttlMs) > 0) ? Number(o.ttlMs) : DEFAULT_TTL_MS;

        const items = {};
        const visibility = {};
        const absent = [];
        let available = false;
        let pipelineVersion = null;
        let summary = null;
        let identity = null;

        try {
            if (isPlainObject(pipeline) && isPlainObject(pipeline.projections)) {
                available = true;
                pipelineVersion = Number(pipeline.version) || 0;
                summary = isPlainObject(pipeline.summary) ? pipeline.summary : null;
                identity = isPlainObject(pipeline.identity) ? pipeline.identity : null;
                for (const id of Object.keys(pipeline.projections)) {
                    const e = pipeline.projections[id];
                    if (!isPlainObject(e)) continue;
                    // 三态 → 可见性：真值/源空都算「已给出」（源空是**明确的空**，不是扣下）；
                    //   absent（无提供器 / 抛错 / 配置关掉）才算 withheld —— 且原因进 sourceLedger。
                    if (e.kind === 'absent') {
                        visibility[id] = 'withheld';
                        absent.push({ id, reason: String(e.reason || 'absent') });
                    } else {
                        visibility[id] = 'given';
                        items[id] = e.value;
                    }
                }
            }
        } catch (_e) {
            // 读数结构畸形：如实降级成「不可用」，但不丢结构
            available = false;
            absent.length = 0;
        }

        const bound = !!(scope && (scope.conversationId !== undefined || scope.sceneId !== undefined || scope.worldId !== undefined));
        return {
            projectionApiVersion: PROJECTION_API_VERSION,
            projectionVersion: pipelineVersion,
            generatedAt: now,
            conversationId: (scope.conversationId === undefined) ? null : scope.conversationId,
            sceneId: (scope.sceneId === undefined) ? null : scope.sceneId,
            worldId: (scope.worldId === undefined) ? null : scope.worldId,
            items,
            visibility,
            sourceLedger: {
                available,
                bound,
                reason: String(o.reason || (available ? (absent.length ? 'partial' : 'ok') : 'pipeline-absent')),
                absent,
                summary,
                identity,
                projections: (available && isPlainObject(pipeline.projections)) ? pipeline.projections : {},
                /* [v3.270.0 · B2/X1] 注入容量预演随 sourceLedger 外供（**不进 ENVELOPE_FIELDS**：
                 *   抬 api 版会打断下游四条现役读线，理由见 predictInjection 头注释）。
                 *   恒有键：没给预演时是 null（「没给」与「给了全零」必须可分）。 */
                /* ★ MUST 短路（v3212/v3213 首跑即抓）：pipeline 可能为 null（管线缺席/畸形入参/
                 *   构建失败）。裸写 pipeline.prediction 会在「管线缺席」这条**最常走**的降级路径上抛
                 *   TypeError，而 buildEnvelope 的纪律是「任何畸形入参都收敛成结构完整的 envelope」。
                 *   同一行紧邻的 projections 用的是 available && ... —— 本次照抄那个短路形态。 */
                prediction: (available && isPlainObject(pipeline.prediction)) ? pipeline.prediction : null,
            },
            revision: Number(o.revision) || 0,
            expiresAt: now + ttl,
        };
    }

    /**
     * [v3.212.0] 契约裁定：这份 envelope 消费者读不读得懂（纯函数、不抛）。
     *
     * 为什么单列：契约的「有出口」与「下游能判自己认不认得」是两件事。
     *   只给字段清单、不给裁定，旧下游遇到新结构只能「读出来是 undefined 就当真没有」——
     *   那正是本仓最贵的形态（不报错、只错结果）。故把裁定做成函数，随 envelope 一起给。
     *
     * @returns {{ ok:boolean, reason:string, missing:string[], apiVersion:number|null, versionAhead:boolean }}
     *   reason ∈ { ok, behind, ahead, malformed, missing }
     */
    function contractOf(env) {
        const miss = { ok: false, reason: 'malformed', missing: [], apiVersion: null, versionAhead: false };
        try {
            if (!isPlainObject(env)) return miss;
            const missing = ENVELOPE_FIELDS.filter((k) => !Object.prototype.hasOwnProperty.call(env, k));
            if (missing.length) return { ok: false, reason: 'missing', missing, apiVersion: null, versionAhead: false };
            const api = Number(env.projectionApiVersion);
            if (!Number.isFinite(api)) return { ok: false, reason: 'malformed', missing: [], apiVersion: null, versionAhead: false };
            if (api > PROJECTION_API_VERSION) return { ok: false, reason: 'ahead', missing: [], apiVersion: api, versionAhead: true };
            if (api < PROJECTION_API_VERSION) return { ok: false, reason: 'behind', missing: [], apiVersion: api, versionAhead: false };
            if (!isPlainObject(env.items) || !isPlainObject(env.visibility) || !isPlainObject(env.sourceLedger)) {
                return { ok: false, reason: 'malformed', missing: [], apiVersion: api, versionAhead: false };
            }
            return { ok: true, reason: 'ok', missing: [], apiVersion: api, versionAhead: false };
        } catch (_e) { return miss; }
    }

    /** 一步取齐：跑管线 + 装 envelope（供宿主与测试用；任一步失败都给出结构完整的 envelope）。 */
    function envelopeOf(providers, opts) {
        const o = isPlainObject(opts) ? opts : {};
        let pipe = null;
        try { pipe = runPipeline(providers, o); } catch (_e) { pipe = null; }
        // [v3.270.0 · B2/X1] 构建方给的预演随管线读数一起进 envelope.sourceLedger.prediction
        if (isPlainObject(pipe)) pipe.prediction = isPlainObject(o.prediction) ? o.prediction : (pipe.prediction || null);
        return buildEnvelope(pipe, o);
    }

    /**
     * 供给对读面的投影值（把 read 表按 face 归拢成 world-ledger-reader 认的 opts 形状）。
     * 只搬 `value`，不搬读数元数据——对读面不该因为多了一层管线而改变契约。
     */
    function faceValues(pipeline, face) {
        const out = {};
        const ps = (pipeline && pipeline.projections) || {};
        for (const id of Object.keys(ps)) {
            const e = ps[id];
            if (String(e.face || '') !== String(face || '')) continue;
            out[id] = e.value;
        }
        return out;
    }

    /** 一行诊断（纯字符串，不抛）。缺席**必须**说出来——只报「有 N 项」会把缺席藏掉。 */
    function pipelineLine(pipeline) {
        try {
            if (!pipeline || !pipeline.summary) return '—';
            const s = pipeline.summary;
            const parts = ['投影 ' + s.ok + '/' + s.total];
            if (s.empty) parts.push('源空 ' + s.empty);
            if (s.absent) parts.push('缺 ' + s.absent);
            if (s.skipped) parts.push('配置关 ' + s.skipped);
            if (pipeline.identity && pipeline.identity.ok === false) parts.push('⚠️ 账目不自洽');
            return parts.join(' · ');
        } catch (_e) { return '—（投影异常）'; }
    }

    /** 缺席清单（诊断面用：只列 absent 的 id + 原因，让人一眼看到「漏接了什么」）。 */
    function absentList(pipeline) {
        const out = [];
        try {
            const ps = (pipeline && pipeline.projections) || {};
            for (const id of Object.keys(ps)) {
                if (ps[id].kind === 'absent') out.push({ id, reason: ps[id].reason });
            }
        } catch (_e) { /* 降级为空清单 */ }
        return out;
    }

    const api = {
        PROJECTIONS,
        ENVELOPE_FIELDS,
        runPipeline,
        stateOf,
        faceValues,
        pipelineLine,
        absentList,
        buildEnvelope,
        contractOf,
        envelopeOf,
        predictInjection,
        compareStrategies,
        PREDICTION_VERSION,
        COMPARE_VERSION,
        PROJECTION_VERSION,
        PROJECTION_API_VERSION,
    };

    if (typeof window !== 'undefined') window.LonShaProjectionPipeline = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
