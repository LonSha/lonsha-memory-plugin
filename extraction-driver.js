/* ========================================================
 * extraction-driver.js — [M3-O5 · v3.324.0] 提取节奏：从「固定周期」转为「剧情变化驱动」
 *
 * 【为什么需要这一面（不是「再建一套调度器」）】
 *   本仓已有的两层底座都只答**一半**的问题：
 *     · extraction-cadence.js —— 「按类型：this 轮该抽哪几类」（`seq % everyN === 0`）；
 *     · smart-trigger.js      —— 「这一楼值不值得花一次 LLM」（五项加权到阈值）。
 *   修前实测的三处落点缺口（逐条可指认）：
 *     ① **两类失效压成一个「没抽」**：cadence 说「本轮不激活」与 smart-trigger 说
 *        「这一楼平淡」是两件**处置相反**的事 —— 前者是「排到下一轮」，后者是「降级本地摘要」。
 *        在旧链路里二者都表现为「这一轮没进 LLM」，调用方无从分辨「延后」与「放弃」；
 *     ② **关键事件落在非周期楼就没有落点**：一条「其实我是……」出现在第 7 楼，而身份类
 *        everyN=5 ⇒ 第 7 楼不激活 ⇒ 这条只能在第 10 楼才被看到（M3-O5 验收原文：
 *        「关键事件即使落在非周期楼也被提取」）；
 *     ③ **重生成时全量重抽**：swipe / 重生成后既有的办法是整楼重跑，
 *        而受影响面其实只有被改写的那几类（M3-O5 验收：「重生成只补受影响段」）。
 *   本模块把这三件事各给一条**可复算的安排**，并且**不改任何既有判定**：它读 cadence 与
 *   smart-trigger 的产物，产出「本轮抽什么 / 何时抽 / 哪些楼还没处理 / 重生成补什么」。
 *
 * 【与既有两面的分工（互不重叠，逐条可指认）】
 *   extraction-cadence.js  答「按周期，这一轮该抽哪几类」——周期
 *   smart-trigger.js       答「这一楼值不值得花 LLM」——门控
 *   本模块                  答「**晚一点抽**还是**现在就抽**、错过的楼在哪、重生成补哪段」——安排
 *   故诊断面**分开一行**，不合成一行（三面回答三个不同问题）。
 *
 * 【五条纪律】
 *   ① **纯函数零写**：不写账、不改配置、不改传入的条目（一律 copy），返回面带 `zeroWrite:true`；
 *   ② **不抛**：输入畸形一律降级为读数（`malformedInput` / `degraded`），绝不外抛；
 *   ③ **不丢楼**：无信号的寒暄**进批处理并带明确到期楼层**，绝不 dropped
 *      —— 「晚了」与「没了」处置相反（本仓反复治过的形态）；
 *   ④ **不拿省调用数当验收**：`readings.savedCalls` 是**读数**，不是成绩；
 *      低消耗档降的是批处理频率与类型集合，**绝不降结构性事件的即时性**（换正确性省调用是禁止的）；
 *   ⑤ **读不到就是读不到**：空文本 / 楼层读不到**既不 due 也不 batched**，
 *      单列 `unreadable` / `noFloor`，与「平淡楼」严格不同形（I6：读失败 ≠ 读到了 0）。
 *
 * 【可移植性说明】
 *   机制动机来自「抽取节奏应与剧情结构变化挂钩、且延后与放弃必须可分」这一通用需求；
 *   实现按本仓规范重写（零依赖、IIFE 双导出、词表与档位全部可注入），未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 本面结构版本（形状一变必须抬这个数，防「旧下游配新面」静默错读）。 */
    const ED_VERSION = 1;
    /** 读数 kind（消费方可据此判「这是不是本面产出的读数」）。 */
    const ED_KIND = 'extraction_driver';
    /** 三档：质量优先 / 均衡 / 低消耗（**低消耗也保结构性即时**，见纪律④）。 */
    const PROFILES = Object.freeze(['quality', 'balanced', 'low-cost']);
    /** 结构性变化五类信号（各自指向不同的抽取类型；**压成一类就等于「该抽什么」无从判**）。 */
    const SIGNALS = Object.freeze(['identity', 'commitment', 'item', 'relation', 'event']);
    /** 信号 → 中文标签（读数与面板同源，不另写一份）。 */
    const SIGNAL_LABELS = Object.freeze({
        identity: '身份/真名', commitment: '承诺/约定', item: '物品转移',
        relation: '关系变化', event: '事件/转折'
    });
    /** 信号 → 该抽的记忆类型（**结构性信号与类型是多对多**：身份会同时改人物与关系）。 */
    const SIGNAL_TYPES = Object.freeze({
        identity: Object.freeze(['character', 'relation']),
        commitment: Object.freeze(['event', 'character']),
        item: Object.freeze(['item']),
        relation: Object.freeze(['relation']),
        event: Object.freeze(['event', 'summary'])
    });
    /** 低消耗档的**核心类型**（结构性必抽；其余类型进批处理）。 */
    const CORE_TYPES = Object.freeze(['character', 'event']);
    /**
     * 三档的批处理参数（**低消耗只降频率与类型面，不降结构性即时性**）。
     *   `batchEveryFloors`：寒暄至少攒到几楼才发一次请求；
     *   `types`           ：本档覆盖的类型面（`all` / `core`）；
     *   `maxBatch`        ：一次批请求最多吃几楼（超出的**留到下一批**，不丢）。
     */
    const PROFILE_RULES = Object.freeze({
        quality: Object.freeze({ batchEveryFloors: 1, maxBatch: 1, types: 'all' }),
        balanced: Object.freeze({ batchEveryFloors: 3, maxBatch: 3, types: 'all' }),
        'low-cost': Object.freeze({ batchEveryFloors: 5, maxBatch: 4, types: 'core' })
    });
    /** 缺省信号词表（**可注入**；本仓不锁定产品词表，卡作者可按宇宙替换）。 */
    const DEFAULT_MARKERS = Object.freeze({
        identity: Object.freeze(['其实我是', '真名', '化名', '伪装', '真面目', '原来是', '本名']),
        commitment: Object.freeze(['我答应', '答应你', '约定', '承诺', '说好', '发誓', '我一定', '会等你']),
        item: Object.freeze(['交给你', '收下', '递过', '塞给', '抢走', '拿走', '买下', '还给你']),
        relation: Object.freeze(['喜欢你', '爱上', '讨厌', '恨你', '绝交', '和好', '背叛', '分手', '告白']),
        event: Object.freeze(['突然', '没想到', '竟然', '发现', '决定', '死亡', '离开了', '失踪'])
    });

    /** 单行化（换行折叠为空格）。 */
    function oneLine(value) {
        return String(value == null ? '' : value).replace(/\s*[\r\n]+\s*/g, ' ').trim();
    }
    /** 楼层归一：有限非负整数，否则 **null**（不写 0 —— 0 是「第 0 楼」，与「不知道第几楼」处置相反）。 */
    function floorOrNull(v) {
        if (v === null || v === undefined || v === '') return null;
        if (typeof v === 'boolean' || typeof v === 'object') return null;
        const n = Number(v);
        if (!Number.isFinite(n)) return null;
        const f = Math.floor(n);
        return f < 0 ? null : f;
    }
    /** 档位归一：未知档**回落 balanced 但如实标 profileKnown:false**（不静默当默认）。 */
    function normalizeProfile(p) {
        const s = oneLine(p).toLowerCase();
        if (PROFILES.indexOf(s) >= 0) return { profile: s, profileKnown: true };
        return { profile: 'balanced', profileKnown: false };
    }
    /**
     * 词表归一：注入项覆盖缺省（**逐类覆盖，不是整表替换**）。
     *   ★ 显式给了数组（**含空数组**）即该类别的最终值 —— 空数组的语义是「这类信号本宇宙不识别」，
     *     回落缺省会让「关掉一类词表」变得做不到（覆盖必须是可关的，否则不叫覆盖）。
     *     只有**没给**（非数组 / undefined）才回落缺省。
     */
    function markersOf(opts) {
        const o = (opts && typeof opts === 'object') ? opts : {};
        const out = {};
        for (const sig of SIGNALS) {
            const raw = o.markers && o.markers[sig];
            out[sig] = Array.isArray(raw)
                ? raw.map(oneLine).filter(Boolean)
                : DEFAULT_MARKERS[sig].map(oneLine).filter(Boolean);
        }
        return out;
    }

    /**
     * 单楼信号检测。
     *   ★ 空读与平淡**严格分形**：没有内容 ⇒ `empty:true` 且 `signals:[]`，
     *     调用方据此判「没读到」而不是「没什么要抽」（I6）。
     * @returns {{floor:number|null, signals:string[], hits:object, empty:boolean, chars:number}}
     */
    function detect(text, floor, opts) {
        const t = oneLine(text);
        const markers = markersOf(opts);
        const f = floorOrNull(floor);
        const hits = {};
        const signals = [];
        for (const sig of SIGNALS) {
            const hit = markers[sig].filter((m) => t.indexOf(m) >= 0);
            if (hit.length) { signals.push(sig); hits[sig] = hit.slice(0, 6); }
        }
        return { floor: f, signals: signals, hits: hits, empty: t.length === 0, chars: t.length };
    }

    /**
     * 分类一条待判定条目（**不改入参**）。
     *   three-way：`structural`（有结构性信号 ⇒ 即时）/ `chitchat`（无信号 ⇒ 批处理）/
     *              `unreadable`（没内容 ⇒ 既不即时也不批处理）。
     */
    function classify(entry, opts) {
        const e = (entry && typeof entry === 'object') ? entry : {};
        const text = oneLine(e.text != null ? e.text : (e.mes != null ? e.mes : e.content));
        const d = detect(text, e.floor, opts);
        const kind = d.empty ? 'unreadable' : (d.signals.length ? 'structural' : 'chitchat');
        const types = [];
        for (const sig of d.signals) {
            for (const t of SIGNAL_TYPES[sig]) if (types.indexOf(t) < 0) types.push(t);
        }
        return {
            floor: d.floor, kind: kind, signals: d.signals, hits: d.hits,
            types: types.sort(), chars: d.chars
        };
    }

    /**
     * 主决策：给定本轮条目 + 档位 + 周期激活面，产出**可复算的抽取安排**。
     *
     * ★ 三条验收各自的落点：
     *   ① 「关键事件即使落在非周期楼也被提取」⇒ `structural` **恒进 due**
     *      （不论 cadence 这一轮激活与否、不论档位是哪一档）；
     *   ② 「连续寒暄不每次全类型请求」⇒ 无信号条目**攒批**，`dueAtFloor` 明确且**不丢**；
     *   ③ 「错过的楼不消失」⇒ `missed` 面逐楼列出并进 `readings.missedRecovered`；
     *   ④ 「重生成只补受影响段」⇒ `regen` 面只列被改写段与受影响类型，`untouched` 计数。
     *
     * @param input { floor, entries, profile, schema, cadenceActive, missedFloors, regenFloors }
     * @param opts  { markers, batchAnchor }
     */
    function plan(input, opts) {
        const inp = (input && typeof input === 'object') ? input : {};
        /* ★ `null` / 数组 / 陌生形状一律算**畸形入参**（与「没传」不同形）：
         *   `plan(null)` 若静默当空输入，读数会与「这一轮真的没有条目」逐字同形
         *   —— 那是「读不到」被写成「没有内容」（本仓点名的无据断言形态）。 */
        const malformedInput = (input !== undefined && (input === null || typeof input !== 'object' || Array.isArray(input)));
        const np = normalizeProfile(inp.profile);
        const rules = PROFILE_RULES[np.profile] || PROFILE_RULES.balanced;
        const floor = floorOrNull(inp.floor);
        const rawEntries = Array.isArray(inp.entries) ? inp.entries : [];
        const entriesMalformed = (inp.entries != null && !Array.isArray(inp.entries));
        const cadenceActive = (inp.cadenceActive instanceof Set)
            ? inp.cadenceActive : new Set(Array.isArray(inp.cadenceActive) ? inp.cadenceActive : []);

        const due = [];
        const batched = [];
        const unreadable = [];
        const noFloor = [];
        const typesDue = [];
        for (const raw of rawEntries) {
            const c = classify(raw, opts);
            if (c.floor === null) noFloor.push({ kind: c.kind, signals: c.signals.slice(), chars: c.chars });
            if (c.kind === 'unreadable') { unreadable.push({ floor: c.floor }); continue; }
            if (c.kind === 'structural') {
                /* ★ 验收①：结构性信号**恒即时** —— 不看周期、不看档位。
                 *   降到「等下一个周期楼」就是 M3-O5 点名要治的那条（关键事件错过）。 */
                due.push({ floor: c.floor, signals: c.signals, hits: c.hits, types: c.types.slice(), why: 'structural-immediate' });
                for (const t of c.types) if (typesDue.indexOf(t) < 0) typesDue.push(t);
            } else {
                batched.push({ floor: c.floor, signals: [], types: [], chars: c.chars, why: 'chitchat-batched' });
            }
        }
        /* 批处理的到期楼层：从当前楼起、按档位频率往后推（**明确写出，不隐含**）。 */
        const nextBatchFloor = (floor === null) ? null : floor + Math.max(1, rules.batchEveryFloors);
        for (const b of batched) b.dueAtFloor = nextBatchFloor;
        /* ★ 溢出**不是丢**：本批吃 maxBatch 条，多出来的**逐条标 overflowToNextBatch 并带同一到期楼层**，
         *   且**全部出现在返回值里** —— 只把本批那几条交出去会让「溢出到哪儿去了」在读数上无从证明
         *   （「排到下一批」与「丢掉了」在返回值上必须不同形）。 */
        const batchOverflow = Math.max(0, batched.length - rules.maxBatch);
        const batchKept = batched.slice(0, rules.maxBatch);
        const batchOverflowItems = batched.slice(rules.maxBatch);
        for (const b of batchOverflowItems) b.overflowToNextBatch = true;

        /* 周期面：本轮 cadence 激活的类型里，**没被结构性信号覆盖**的那些才是「等周期的」。
         *   它们不是「不抽」，而是「按周期在别的楼抽」—— 必须与 due/batched 分开记。 */
        const periodicTypes = [...cadenceActive].filter((t) => typesDue.indexOf(String(t)) < 0).map(String).sort();
        const deferredTypes = (rules.types === 'core')
            ? periodicTypes.filter((t) => CORE_TYPES.indexOf(t) < 0)
            : [];

        /* 错过的楼（验收③）：**不消失**，逐楼列出并带原楼层号；楼号读不到的另立一格。 */
        const rawMissed = Array.isArray(inp.missedFloors) ? inp.missedFloors : [];
        const missedFloors = [];
        let missedNoFloor = 0;
        for (const m of rawMissed) {
            const f = floorOrNull(m);
            if (f === null) { missedNoFloor++; continue; }
            missedFloors.push(f);
        }
        missedFloors.sort((a, b) => a - b);
        const missed = {
            floors: missedFloors, count: missedFloors.length, noFloor: missedNoFloor,
            neverDropped: true,
            why: '错过的楼一律带原楼号重新排队（「晚了」与「没了」处置相反）'
        };

        /* 重生成（验收④）：**只补受影响段**；未给范围 ⇒ 如实报 `scoped:false` 并**不产全量计划**。 */
        const rawRegen = Array.isArray(inp.regenFloors) ? inp.regenFloors : [];
        const regenFloors = [];
        for (const r of rawRegen) { const f = floorOrNull(r); if (f !== null) regenFloors.push(f); }
        regenFloors.sort((a, b) => a - b);
        const regenScoped = regenFloors.length > 0;
        const regenTypes = [];
        for (const raw of rawEntries) {
            const c = classify(raw, opts);
            if (c.floor === null || regenFloors.indexOf(c.floor) < 0) continue;
            for (const t of c.types) if (regenTypes.indexOf(t) < 0 && typesDue.indexOf(t) < 0) regenTypes.push(t);
        }
        const regen = {
            scoped: regenScoped, floors: regenFloors, types: regenTypes.sort(),
            untouched: Math.max(0, rawEntries.length - regenFloors.length),
            why: regenScoped
                ? '只补被改写段（未列出的楼一条不动）'
                : '未给受改写范围 ⇒ 不产全量重抽计划（报 scoped:false，让调用方先圈范围）'
        };

        /* 读数：调用量是**读数不是成绩**（纪律④）。 */
        const legacyCalls = rawEntries.filter((r, i) => {
            const c = classify(rawEntries[i], opts);
            return c.floor !== null && c.kind !== 'unreadable';
        }).length;
        const callsIfRun = due.length + (batchKept.length ? 1 : 0);
        const readings = {
            considered: rawEntries.length,
            structuralDue: due.length,
            batched: batched.length,
            batchKept: batchKept.length,
            batchOverflow: batchOverflow,
            batchRequested: batchKept.length ? 1 : 0,
            deferredBatchCalls: (batchOverflow > 0) ? Math.ceil(batchOverflow / Math.max(1, rules.maxBatch)) : 0,
            unreadable: unreadable.length,
            noFloor: noFloor.length,
            periodicTypes: periodicTypes.length,
            callsIfRun: callsIfRun,
            callsIfLegacy: legacyCalls,
            savedCalls: Math.max(0, legacyCalls - callsIfRun),
            missedRecovered: missedFloors.length,
            structuralImmediate: due.length > 0,
            /* ★ 明写：省调用数**不是**本面的验收口径（M3-O5 验收④）。
             *   溢出条的调用只是**推后**（`deferredBatchCalls` 如实计数），不是省掉了。 */
            qualityNote: '省下的调用数是读数不是成绩；本面按「关键事件不落在非周期楼外」验收，溢出条只推后不消失'
        };

        return {
            kind: ED_KIND, version: ED_VERSION,
            floor: floor, profile: np.profile, profileKnown: np.profileKnown,
            rules: { batchEveryFloors: rules.batchEveryFloors, maxBatch: rules.maxBatch, types: rules.types },
            due: due,
            /* ★ 全部寒暄条都在这里（**不是只有本批那几条**）：`batchThisRound` 才是本轮真正发请求吃下的，
             *   其余带 `overflowToNextBatch:true` 排到下一批 —— 「排到下一批」与「丢掉了」必须不同形。 */
            batched: batched,
            batchThisRound: batchKept,
            deferredTypes: deferredTypes,
            nextBatchFloor: nextBatchFloor,
            unreadable: unreadable, noFloor: noFloor,
            missed: missed, regen: regen, readings: readings,
            zeroWrite: true, malformedInput: malformedInput || entriesMalformed, degraded: false
        };
    }

    /**
     * 自检：**六条当场自证**（每条对应一条纪律，任一不成立即本面立身之本破了）。
     *   ① `zeroWrite`：入参深拷贝前后逐字相同（不改调用方的对象）；
     *   ② 结构性即时**不可被任何档位降掉**（三档跑同一输入，due 恒含该楼）；
     *   ③ 寒暄**不丢**（三档都进 batched 且带 dueAtFloor）；
     *   ④ 空读与平淡分形（空文本进 unreadable、不进 batched）；
     *   ⑤ **溢出条不消失**（超 maxBatch 的寒暄仍在 `batched` 里且带 `overflowToNextBatch`）；
     *   ⑥ 幂等 + 可序列化（同入参两次逐字相同；读数能 JSON 往返）。
     */
    function selfCheck() {
        const mk = () => ([
            { floor: 7, text: '她低下头：其实我是珞花。' },
            { floor: 8, text: '今天的天气不错。' },
            { floor: 9, text: '' },
        ]);
        const entries = mk();
        const before = JSON.stringify(entries);
        const runs = {};
        for (const p of PROFILES) runs[p] = plan({ floor: 8, entries: mk(), profile: p }, {});
        const after = JSON.stringify(entries);
        const noWrite = (before === after);
        const structuralImmediate = PROFILES.every((p) => runs[p].due.some((d) => d.floor === 7));
        const chitchatKept = PROFILES.every((p) => runs[p].batched.some((b) => b.floor === 8 && b.dueAtFloor !== undefined));
        const emptyDistinct = PROFILES.every((p) => runs[p].unreadable.some((u) => u.floor === 9)
            && !runs[p].batched.some((b) => b.floor === 9));
        /* ⑤ 溢出条：9 楼寒暄在 quality（maxBatch 1）下必须**全在 batched 里**，8 条带溢出标。 */
        const floods = [];
        for (let i = 1; i <= 9; i++) floods.push({ floor: i, text: '嗯嗯。' });
        const fr = plan({ floor: 9, entries: floods, profile: 'quality' }, {});
        const overflowKept = (fr.batched.length === 9 && fr.readings.batchOverflow === 8
            && fr.batched.filter((b) => b.overflowToNextBatch === true).length === 8
            && fr.batchThisRound.length === 1 && fr.batched.every((b) => b.dueAtFloor !== undefined));
        const a = plan({ floor: 8, entries: mk(), profile: 'balanced' }, {});
        const b = plan({ floor: 8, entries: mk(), profile: 'balanced' }, {});
        const deterministic = JSON.stringify(a) === JSON.stringify(b);
        let serializable = true;
        try { serializable = JSON.parse(JSON.stringify(a)).kind === ED_KIND; } catch (_e) { serializable = false; }
        return {
            ok: noWrite && structuralImmediate && chitchatKept && emptyDistinct && overflowKept && deterministic && serializable,
            noWrite: noWrite, structuralImmediate: structuralImmediate, chitchatKept: chitchatKept,
            emptyDistinct: emptyDistinct, overflowKept: overflowKept,
            deterministic: deterministic, serializable: serializable,
            profiles: PROFILES.length
        };
    }

    /**
     * 读数一句话（诊断 / 自检行用）。
     *   四态**必须分开说**：把「批处理（等下一轮）」并进「没读到」会让读者以为内容抽过了。
     *   ★ **无读数与空安排严格不同形**：本面产出的读数带 `kind === ED_KIND`；
     *     面板还没读到（`null` / 非对象 / 陌生形状）**没有** `kind` ——
     *     把「还没读到」画成「即时 0 · 批处理 0」等于替面板编了一个「本轮什么都没抽」的结论。
     */
    function line(read) {
        const r = (read && typeof read === 'object') ? read : {};
        if (r.reason === 'module-unavailable') return '模块未加载（extraction-driver.js）';
        if (r.degraded) return '节奏安排异常（已降级，不外抛）';
        if (r.kind !== ED_KIND) return '—（模块未产出读数）';
        const parts = [
            '节奏 ' + (r.profile || '?') + (r.profileKnown === false ? '（档位未知已回落）' : ''),
            '即时 ' + ((r.readings && r.readings.structuralDue) || 0),
            '批处理 ' + ((r.readings && r.readings.batched) || 0)
                + (r.nextBatchFloor === null ? '（到期楼层读不到）' : '（下一批 ' + r.nextBatchFloor + ' 楼）')
        ];
        if (r.readings && r.readings.unreadable) parts.push('**未读到 ' + r.readings.unreadable + '**');
        if (r.missed && r.missed.count) parts.push('补回错过 ' + r.missed.count);
        if (r.missed && r.missed.noFloor) parts.push('错过但无楼号 ' + r.missed.noFloor);
        if (r.regen && r.regen.scoped) parts.push('重生成补 ' + r.regen.floors.length + ' 楼');
        else if (r.regen) parts.push('重生成范围未圈定');
        if (r.deferredTypes && r.deferredTypes.length) parts.push('本档延后类型 ' + r.deferredTypes.join(','));
        return parts.join(' · ');
    }

    const api = {
        ED_VERSION: ED_VERSION,
        ED_KIND: ED_KIND,
        PROFILES: PROFILES,
        SIGNALS: SIGNALS,
        SIGNAL_LABELS: SIGNAL_LABELS,
        SIGNAL_TYPES: SIGNAL_TYPES,
        CORE_TYPES: CORE_TYPES,
        PROFILE_RULES: PROFILE_RULES,
        DEFAULT_MARKERS: DEFAULT_MARKERS,
        floorOrNull: floorOrNull,
        normalizeProfile: normalizeProfile,
        markersOf: markersOf,
        detect: detect,
        classify: classify,
        plan: plan,
        line: line,
        selfCheck: selfCheck
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaExtractionDriver = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
