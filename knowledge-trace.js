/* ========================================================
 * knowledge-trace.js — [v3.291.0 · X5] 知识演变与传播证据（纯函数，零依赖）
 *
 * 【为什么要有这一面 / 修前缺口（不是「再建一个账本」）】
 *   现有三面已能回答三个问题，但**都答不了「这条知识是怎么来的」**：
 *     · secret-ledger.js      —— 「谁还不知道」这个**当下状态**（keeper 名单 + 进度）；
 *     · knowledge-network.js  —— 「这两句话是不是同一件事」这个**同事实判定**；
 *     · relation-disclosure.js—— 「这条关系此刻该不该给模型看」这个**注入筛选**。
 *   缺的是**轨迹**：在第几楼、从谁、经由哪条原始证据、以何种方式获得
 *   （得知 / 怀疑 / 误信 / 被纠正）。修前这件事在三面上都没有落点：
 *     ① 认知隔离的解除只能靠「猜一个和登记句同义的措辞」去 reconcile(reveal)；
 *        猜不中就**永不解除**（knowledge-network.js 文件头实测：3 条一条都清不掉）；
 *     ② 同文转述（同一句话经两个角色各说一遍）会被读成**两条独立证据**，
 *        于是「谁先知道的」在读数上完全不可分；
 *     ③ 回档之后的知识**不会撤销** —— 楼层被删了，那楼产生的「谁知道什么」还在，
 *        角色继续按一份已经不存在的历史扮演；
 *     ④ 身份揭穿前后是同一个名字：揭穿前的「明面身份」认知与揭穿后的真实身份
 *        混在一格里，查不出「他是什么时候知道真名的」。
 *   本模块把这四件事各给一条**可复算的轨迹**，并且**只加轨迹、不改既有三面的判定**。
 *
 * 【与既有三面的分工（互不重叠，逐条可指认）】
 *   secret-ledger.js            当下状态：谁还不知道（keeper/progress/reveal 门）
 *   knowledge-network.js        同事实判定：两句话是不是同一件事（三档 + 疑似）
 *   relation-disclosure.js      注入筛选：这条关系此刻该不该给模型看
 *   本模块                       轨迹：这条事实在何处、从谁、经何证据被取得/撤回
 *   于是「角色在获知之前不引用秘密」有了判据：「该角色在该楼之前有没有一条
 *   acquire 轨迹」—— 修前只能查当下状态，查不出**在获知之前**这件事。
 *
 * 【状态五态（**不得压成一格**，压了就再也分不出该退谁）】
 *   knows    得知 —— 有原始证据、有出处（source + evidenceKey）
 *   doubts   怀疑 —— 明确不是「得知」：角色只是起疑，不得据此行动
 *   misled   误信 —— **曾经当真、后来被纠正**的前态；带 correctedBy（纠正轨迹 id）
 *   unknown  未知 —— 有一条显式登记「此角色不知此事实」，与「没记录」不同
 *   notRecorded 未记录 —— **本模块不知道**（没有轨迹、也没有 unknown 登记）
 *
 * 【「未知」不等于「知道」也不等于「不知道」（计划原文验收的最后一条）】
 *   这是本模块最容易被写错的一格：把「没有轨迹」直接读成 unknown，
 *   会让「我们没记过这件事」变成「该角色确实不知道」—— 一句无据的断言。
 *   故 `stateOf` 对无轨迹返回 **notRecorded**，并且**必须**带上 `basis:'none'`；
 *   unknown 只有在真有一条 unaware 登记时才返回。三态在读数上必须同形可辨。
 *
 * 【回档撤销（第 ③ 条缺口）】
 *   `dropByFloor(trace, floor)` 撤销**该楼产生的**轨迹并返回被撤销的 id 清单，
 *   且**不静默**：返回 `{ removed:[...], orphaned:[...], degraded }`——
 *     · removed —— 该楼直接产生的轨迹；
 *     · orphaned —— 依赖被撤销轨迹的派生轨迹（如 misled 的 correctedBy 指向了
 *       一条已被撤销的纠正），它们**不被静默删掉**，而是标 `revoked:true` 并列出，
 *       让调用方知道「这条纠正没了，那个误信现在无人可证」；
 *   撤销**不得**改成「按措辞删」——那是本仓反复点名的塌陷形态。
 *
 * 【三条纪律（与 relation-mutual.js / knowledge-network.js 同规格）】
 *   ① 只读判定：不写库（写库仍由 index.js 的 WorldProgress 负责），只回答轨迹问题；
 *   ② 不抛：输入畸形一律降级为读数（degraded / malformed 计数），绝不外抛；
 *   ③ 不猜：判不开一律给 notRecorded，不给冒充值；压缩/截断必须可见（truncated 计数）。
 *
 * 【可移植性说明】
 *   机制动机来自「自然语言事实无法逐字比较 ⇒ 知识轨迹必须显式记录」这一通用失效形态；
 *   实现按本仓规范重写（零依赖、不抛、判据保守且可复算、读数齐备），未复制任何外部代码。
 * ======================================================== */
(function (root) {
    'use strict';
    const KT_VERSION = 1;
    const KT_KIND = 'knowledge_trace';
    /** 轨迹动作：取得 / 怀疑 / 误信 / 纠正 / 撤回 / 显式不知道 */
    const ACTIONS = Object.freeze(['acquire', 'doubt', 'misbelieve', 'correct', 'retract', 'unaware']);
    /** 取证方式（传播途径）。同一份原文经不同途径到达 = **同一条证据**，不得计两条。 */
    const VIA = Object.freeze(['witnessed', 'told', 'inferred', 'rumor', 'document', 'deduced']);
    /** 身份口径：明面 / 揭穿后 / 同名异人 / 未标明 */
    const IDENTITY = Object.freeze(['surface', 'revealed', 'homonym', 'unspecified']);
    /** 轨迹最多保留条数（有界；截断必须可见，见 truncated） */
    const MAX_TRACES = 240;
    /** 单角色一次查询最多带回几条（有界，防灌爆注入面） */
    const MAX_LIST = 24;
    /** 一个 evidenceKey 最多认几条轨迹（超出的计入 sharedEvidence 读数） */
    const MAX_PER_EVIDENCE = 8;

    function text(value, max) {
        const s = String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim();
        return max && s.length > max ? s.slice(0, max) : s;
    }
    /** 取数：只认 number 与非空数字字符串；其余如实 null（**不编 0**，本仓取数门口径）。 */
    function floorOf(value) {
        if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null;
        if (typeof value === 'string' && value.trim() !== '' && /^-?\d+$/.test(value.trim())) return Math.trunc(Number(value.trim()));
        return null;
    }
    function pick(value, allowed, fallback) {
        const s = text(value, 24).toLowerCase();
        return allowed.includes(s) ? s : fallback;
    }
    function actionOf(value) {
        const s = text(value, 24).toLowerCase();
        /* 「知道」不是动作：它是**由 acquire 推出的状态**。写成动作会让轨迹里出现
         *   两条不同名的「取得」（acquire / known），读数上再也分不出谁先谁后。
         *   known 显式折到 acquire；reveal 折到 correct（既有 knowledge_changes 的
         *   口径里 reveal = 「怎么被知道的」，语义正是纠正）。 */
        if (s === 'known' || s === 'reveal') return s === 'reveal' ? 'correct' : 'acquire';
        return ACTIONS.includes(s) ? s : '';
    }

    /* ---------------------------------------------------------------
     * 轨迹构造（归一）
     *   逐条 copy，**不做判定** —— 判定全在 stateOf / timelineOf / provenanceOf。
     *   traceId 缺失时按 `k<seq>` 生成（与六本账同款：序号由账本持有，不由调用方编）。
     * --------------------------------------------------------------- */
    function copyTrace(raw, seq) {
        const t = (raw && typeof raw === 'object') ? raw : {};
        const action = actionOf(t.action);
        const id = text(t.traceId || t.id, 60);
        return {
            traceId: id || ('k' + seq),
            character: text(t.character || t.owner || t.who, 40),
            fact: text(t.fact || t.content, 180),
            action: action,
            via: pick(t.via || t.channel, VIA, 'unspecified'),
            from: text(t.from || t.source, 40),
            evidenceKey: text(t.evidenceKey || t.evidence, 120),
            floor: floorOf(t.floor),
            identity: pick(t.identity, IDENTITY, 'unspecified'),
            /* 纠正指向：correct 动作指向它纠正的那条轨迹 id（可空）。 */
            corrects: text(t.corrects || t.correctsId, 60),
            suspect: text(t.suspect || t.homonymOf, 40),
            note: text(t.note, 120)
        };
    }

    function normalize(raw) {
        const src = (raw && typeof raw === 'object') ? raw : {};
        const list = Array.isArray(src.traces) ? src.traces : [];
        const out = { version: KT_VERSION, seq: 0, traces: [], malformed: 0, truncated: 0 };
        const seen = new Set();
        for (const r of list) {
            const t = copyTrace(r, out.seq + 1);
            /* 缺主体 / 缺事实 / 动作不可辨 ⇒ **不收**，但计数可见（不静默吞）。 */
            if (!t.character || !t.fact || !t.action) { out.malformed++; continue; }
            if (seen.has(t.traceId)) { out.malformed++; continue; }
            seen.add(t.traceId);
            out.seq++;
            t.seq = out.seq;
            out.traces.push(t);
        }
        if (out.traces.length > MAX_TRACES) {
            out.truncated = out.traces.length - MAX_TRACES;
            out.traces = out.traces.slice(-MAX_TRACES);
        }
        return out;
    }

    /* ---------------------------------------------------------------
     * 事实归一（与 knowledge-network.js 的判据**同形但不同用**）
     *   这里只做「同一条证据」的键比较，用逐字归一 —— **不做近似判定**：
     *   近似留给 knowledge-network.js（它有保守阈值与疑似档），
     *   本模块若也做近似，两处阈值漂移会让「同一件事」出现两个真源。
     * --------------------------------------------------------------- */
    function normalizeFact(value) {
        let s = String(value == null ? '' : value);
        s = s.replace(/[\u3000\s]+/g, '');
        s = s.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
        s = s.replace(/[\u3001\u3002\u300c\u300d\u300e\u300f\u2018\u2019\u201c\u201d\u2026\u2014\uff0c\uff1b\uff1a\uff1f\uff01]/g, '');
        s = s.replace(/[!-/:-@\[-`{-~]/g, '');
        return s.toLowerCase();
    }

    /* ---------------------------------------------------------------
     * 传播去重：「同文转述」不得算两条独立证据
     *   判据（确定性、可复算）：**同一条原始证据** + **同一个角色** + **同一动作**
     *   ⇒ 是转述，不是新证据。
     *   为什么键里必须同时有「角色」：同一份原文由两个人各自看到，是**两条**认知
     *   （两人都知道了）；把角色拿掉会把「第二个人也知道了」误吞。
     *   为什么键里必须有「动作」：同一条原文既被「得知」又被「怀疑」是两件事
     *   （先起疑后确认），吞掉会让时间线少一格。
     *   为什么**不**含 from：同一原文经甲传乙、乙传丙，仍是**同一条**证据
     *   （chain 上多人），计两条会让「谁先知道的」判不出先来后到。
     * --------------------------------------------------------------- */
    function evidenceKeyOf(t) {
        /* evidenceKey 优先；缺省时退回**事实原文归一** —— 没有显式证据号时，
         *   原文本身即最大可用证据标识。两个都空 ⇒ 空串（调用方须按「无证据」处置）。
         *   入参形态宽容：非对象（undefined/null/字符串）一律归空串，**不抛**（本面跑在诊断/注入路径上，抛一次会连坐整轮）。 */
        if (!t || typeof t !== 'object') return '';
        return t.evidenceKey || normalizeFact(t.fact);
    }
    function propagationSet(trace) {
        const seen = new Map();
        const transmittals = [];
        const sharedEvidence = [];
        for (const t of trace.traces) {
            const key = evidenceKeyOf(t);
            if (!key) continue;
            const k = key + '\u0000' + t.character + '\u0000' + t.action;
            if (seen.has(k)) {
                /* 同证据 + 同角色 + 同动作：算转述，**不计入独立证据**，但必须可见。 */
                transmittals.push({ traceId: t.traceId, distinctFrom: seen.get(k).traceId, evidenceKey: key, character: t.character });
                seen.get(k).count++;
                continue;
            }
            seen.set(k, { traceId: t.traceId, evidenceKey: key, character: t.character, action: t.action, floor: t.floor, count: 1 });
        }
        /* 一张证据被超过 MAX_PER_EVIDENCE 条轨迹引用 ⇒ 报数（有界，防灌爆）。 */
        const perKey = new Map();
        for (const v of seen.values()) {
            const n = (perKey.get(v.evidenceKey) || 0) + 1;
            perKey.set(v.evidenceKey, n);
            if (n > MAX_PER_EVIDENCE) sharedEvidence.push({ evidenceKey: v.evidenceKey, owners: n });
        }
        return {
            independent: [...seen.values()],
            independentCount: seen.size,
            transmittals: transmittals,
            transmittalCount: transmittals.length,
            sharedEvidence: sharedEvidence
        };
    }

    /* ---------------------------------------------------------------
     * 状态判定（五态，**不得压格**）
     *   判定序（确定性、与处理顺序无关）：
     *     ① 有 retract（撤回）且其 seq 最大 ⇒ unknown（撤销到「显式不知道」）
     *     ② 有 correct（纠正）⇒ knows（**纠正意味着真相已确定**；
     *        被纠正的 misbelieve 另存 correctedBy，不再作为当前态）
     *     ③ 有 misbelieve 且**未被纠正** ⇒ misled（误信 + correctedBy:null）
     *     ④ 有 acquire ⇒ knows
     *     ⑤ 有 doubt ⇒ doubts
     *     ⑥ 有 unaware 登记 ⇒ unknown
     *     ⑦ 无任何轨迹 ⇒ **notRecorded**（不是 unknown！见文件头）
     *   身份口径（identityFilter）：'surface' 只看明面身份的轨迹，'revealed' 只看揭穿后，
     *   'homonym' 只看同名异人；不传则全算。**揭穿前按明面身份**即靠这一格。
     * --------------------------------------------------------------- */
    function pickLatest(list) {
        let best = null;
        for (const t of list) if (!best || t.seq > best.seq) best = t;
        return best;
    }
    function stateOf(raw, character, fact, opts) {
        const out = {
            kind: KT_KIND, character: text(character, 40), state: 'notRecorded',
            basis: 'none', via: '', from: '', floor: null, evidenceKey: '',
            traceId: '', correctedBy: null, correctedTrace: null,
            identity: '', counts: { acquire: 0, doubt: 0, misbelieve: 0, correct: 0, retract: 0, unaware: 0 },
            degraded: false, ambiguousIdentity: false
        };
        try {
            const trace = normalize(raw);
            const o = (opts && typeof opts === 'object') ? opts : {};
            const who = text(character, 40);
            const norm = normalizeFact(fact);
            if (!who || !norm) { out.degraded = true; return out; }
            const idFilter = pick(o.identity, IDENTITY, '');
            let mine = trace.traces.filter((t) => t.character === who && normalizeFact(t.fact) === norm);
            if (idFilter) mine = mine.filter((t) => t.identity === idFilter);
            /* 身份面混淆必须可见：同名异人的轨迹混在同一格里时，
             *   「揭穿前按明面身份」这条验收就无从执行 —— 报出来而不是静默全算。 */
            const ids = new Set(mine.map((t) => t.identity).filter((x) => x && x !== 'unspecified'));
            out.ambiguousIdentity = ids.size > 1;
            for (const t of mine) out.counts[t.action]++;
            if (!mine.length) {
                /* 无轨迹：区分「没有记录」与「无这一格」——两者都报 notRecorded，
                 *   但 basis 必须说清（'none'），不得让读者读成「确实不知道」。 */
                return out;
            }
            const retracts = mine.filter((t) => t.action === 'retract');
            const corrects = mine.filter((t) => t.action === 'correct');
            const misb = mine.filter((t) => t.action === 'misbelieve');
            const acq = mine.filter((t) => t.action === 'acquire');
            const doubt = mine.filter((t) => t.action === 'doubt');
            const unaw = mine.filter((t) => t.action === 'unaware');
            const lastRetract = pickLatest(retracts);
            /* 「有效动作」= 除 retract / unaware 之外的动作。
             *   ★ 修前这里把 retract 自己也算进 lastActive ⇒ `lastRetract.seq > lastActive.seq`
             *   恒为 false（最后一条 retract 自己就是最大值），第①档**永远进不去**、
             *   撤销被静默读成 knows —— 正是本仓点名的「判据写了但拿自己当对照」型假绿。
             *   实测：acquire(楼3) + retract(楼9) 修前报 knows/acquire，应为 unknown/retract。 */
            const lastActive = pickLatest(mine.filter((t) => t.action !== 'unaware' && t.action !== 'retract'));
            /* ① 撤回晚于一切有效动作 ⇒ 撤销 */
            if (lastRetract && (!lastActive || lastRetract.seq > lastActive.seq)) {
                out.state = 'unknown'; out.basis = 'retract'; out.traceId = lastRetract.traceId;
                out.floor = lastRetract.floor; out.identity = lastRetract.identity;
                return out;
            }
            const lastCorrect = pickLatest(corrects);
            const lastMis = pickLatest(misb);
            /* ③ 误信**未被纠正** ⇒ misled（correctedBy 必须为 null，且读数里可见） */
            if (lastMis && (!lastCorrect || lastCorrect.seq < lastMis.seq)) {
                out.state = 'misled'; out.basis = 'misbelieve';
                out.traceId = lastMis.traceId; out.via = lastMis.via; out.from = lastMis.from;
                out.floor = lastMis.floor; out.evidenceKey = evidenceKeyOf(lastMis);
                out.identity = lastMis.identity; out.correctedBy = null;
                return out;
            }
            /* ② 有纠正（且在误信之后或无误信）⇒ knows；把被纠正的那条带出来 */
            if (lastCorrect) {
                out.state = 'knows'; out.basis = 'correct';
                out.traceId = lastCorrect.traceId; out.via = lastCorrect.via; out.from = lastCorrect.from;
                out.floor = lastCorrect.floor; out.evidenceKey = evidenceKeyOf(lastCorrect);
                out.identity = lastCorrect.identity;
                /* 纠正指向：显式 corrects，否则回退到「该纠正之前的最后一条误信」 */
                const target = lastCorrect.corrects
                    ? (mine.find((t) => t.traceId === lastCorrect.corrects) || null)
                    : (lastMis && lastMis.seq < lastCorrect.seq ? lastMis : null);
                if (target) { out.correctedBy = lastCorrect.traceId; out.correctedTrace = { traceId: target.traceId, floor: target.floor, fact: target.fact }; }
                return out;
            }
            const lastAcq = pickLatest(acq);
            if (lastAcq) {
                out.state = 'knows'; out.basis = 'acquire';
                out.traceId = lastAcq.traceId; out.via = lastAcq.via; out.from = lastAcq.from;
                out.floor = lastAcq.floor; out.evidenceKey = evidenceKeyOf(lastAcq);
                out.identity = lastAcq.identity;
                return out;
            }
            const lastDoubt = pickLatest(doubt);
            if (lastDoubt) {
                out.state = 'doubts'; out.basis = 'doubt';
                out.traceId = lastDoubt.traceId; out.via = lastDoubt.via; out.from = lastDoubt.from;
                out.floor = lastDoubt.floor; out.evidenceKey = evidenceKeyOf(lastDoubt);
                out.identity = lastDoubt.identity;
                return out;
            }
            if (unaw.length) {
                const last = pickLatest(unaw);
                out.state = 'unknown'; out.basis = 'unaware'; out.traceId = last.traceId;
                out.floor = last.floor; out.identity = last.identity;
                return out;
            }
            /* 只有 misbelieve 且被纠正，但纠正刻意排在误信前（时间倒挂）—— 归 knows 已处理；
             *   到这里说明 mine 非空但动作全被前面吃掉，仍如实报 notRecorded + basis:'none'。 */
            return out;
        } catch (_e) {
            return Object.assign({}, out, { degraded: true });
        }
    }

    /* ---------------------------------------------------------------
     * 「获知之前不得引用秘密」的判据（计划原文验收第一条）
     *   给一条事实、一个角色、一个楼层：回答「在该楼时点，他知不知道」。
     *   判定**只看 floor <= atFloor 的轨迹**（按 seq 平局），并且
     *   永远区分三态：knows / doubts|misled（不确定，不得据此行动）/ notRecorded|unknown。
     *   返回 knowledge:'yes'|'no'|'unclear' 与举证轨迹 —— **unclear 不得当 no 用**：
     *   把「判不开」读成「不知道」会让角色说出他不该不知道的话（本仓点名的假绿形态）。
     * --------------------------------------------------------------- */
    function knewAt(raw, character, fact, atFloor, opts) {
        const out = { kind: KT_KIND, knowledge: 'unclear', atFloor: floorOf(atFloor), state: 'notRecorded', traceId: '', reason: 'no-trace', degraded: false };
        try {
            const f = floorOf(atFloor);
            if (f == null) { out.reason = 'bad-floor'; out.degraded = true; return out; }
            const trace = normalize(raw);
            const o = (opts && typeof opts === 'object') ? opts : {};
            const who = text(character, 40);
            const norm = normalizeFact(fact);
            if (!who || !norm) { out.reason = 'bad-input'; out.degraded = true; return out; }
            const idFilter = pick(o.identity, IDENTITY, '');
            /* 只留**该楼及之前**的轨迹（同楼平局按 seq 先后，确定性） */
            const cutoff = [];
            for (const t of trace.traces) {
                if (t.floor == null || t.floor > f) continue;         // 未来轨迹不得参与
                if (t.character !== who || normalizeFact(t.fact) !== norm) continue;
                if (idFilter && t.identity !== idFilter) continue;
                cutoff.push(t);
            }
            if (!cutoff.length) { out.reason = 'no-trace-before-floor'; return out; }
            const st = stateOf({ traces: cutoff }, who, fact, o);
            out.state = st.state;
            out.traceId = st.traceId;
            if (st.state === 'knows') { out.knowledge = 'yes'; out.reason = st.basis; return out; }
            if (st.state === 'unknown') { out.knowledge = 'no'; out.reason = st.basis; return out; }
            if (st.state === 'doubts' || st.state === 'misled') { out.knowledge = 'unclear'; out.reason = st.state + '（起疑/误信不得当已知用）'; return out; }
            out.knowledge = 'unclear'; out.reason = st.state;
            return out;
        } catch (_e) {
            return Object.assign({}, out, { degraded: true });
        }
    }

    /* ---------------------------------------------------------------
     * 时间线（按楼层−序号排序；**不得只按楼层排**：同一楼内多条轨迹的先后
     *   决定「先怀疑后确认」能否读出来，只按楼层排序会把它们并列、顺序随机）
     * --------------------------------------------------------------- */
    function timelineOf(raw, character, fact, opts) {
        try {
            const trace = normalize(raw);
            const o = (opts && typeof opts === 'object') ? opts : {};
            const who = text(character, 40);
            const norm = fact ? normalizeFact(fact) : '';
            const idFilter = pick(o.identity, IDENTITY, '');
            const rows = trace.traces.filter((t) => {
                if (who && t.character !== who) return false;
                if (norm && normalizeFact(t.fact) !== norm) return false;
                if (idFilter && t.identity !== idFilter) return false;
                return true;
            }).sort((a, b) => {
                const fa = a.floor == null ? -1 : a.floor, fb = b.floor == null ? -1 : b.floor;
                if (fa !== fb) return fa - fb;
                return a.seq - b.seq;
            });
            const truncated = rows.length > MAX_LIST;
            return {
                kind: KT_KIND, rows: rows.slice(0, MAX_LIST).map((t) => ({
                    traceId: t.traceId, character: t.character, action: t.action, via: t.via,
                    from: t.from, floor: t.floor, identity: t.identity, corrects: t.corrects,
                    evidenceKey: evidenceKeyOf(t), fact: t.fact
                })),
                total: trace.traces.length, matched: rows.length, truncated: truncated,
                dropped: truncated ? rows.length - MAX_LIST : 0, malformed: trace.malformed, degraded: false
            };
        } catch (_e) {
            return { kind: KT_KIND, rows: [], total: 0, matched: 0, truncated: false, dropped: 0, malformed: 0, degraded: true };
        }
    }

    /* ---------------------------------------------------------------
     * 出处（provenance）：这条知识现在凭什么算数 —— 一条证据链
     *   链必须**有向无环**：corrects 指向不存在的轨迹 ⇒ brokenLink 计数（可见），
     *   自指 / 环 ⇒ cycle 计数，**都不外抛**（回到文件头纪律②）。
     * --------------------------------------------------------------- */
    function provenanceOf(raw, character, fact, opts) {
        const out = { kind: KT_KIND, state: 'notRecorded', chain: [], brokenLink: 0, cycle: 0, degraded: false };
        try {
            const trace = normalize(raw);
            const st = stateOf(trace, character, fact, opts);
            out.state = st.state;
            if (st.state === 'notRecorded' || st.degraded) return out;
            const byId = new Map(trace.traces.map((t) => [t.traceId, t]));
            const chain = [];
            let cur = byId.get(st.traceId) || null;
            const seen = new Set();
            let hops = 0;
            while (cur && hops < MAX_LIST) {
                if (seen.has(cur.traceId)) { out.cycle++; break; }
                seen.add(cur.traceId);
                chain.push({ traceId: cur.traceId, action: cur.action, via: cur.via, from: cur.from, floor: cur.floor, identity: cur.identity, evidenceKey: evidenceKeyOf(cur) });
                const nextId = cur.action === 'correct' ? cur.corrects : '';
                if (!nextId) break;
                if (nextId === cur.traceId) { out.cycle++; break; }
                const nxt = byId.get(nextId);
                if (!nxt) { out.brokenLink++; break; }
                cur = nxt; hops++;
            }
            out.chain = chain;
            return out;
        } catch (_e) {
            return Object.assign({}, out, { degraded: true });
        }
    }

    /* ---------------------------------------------------------------
     * 回档撤销：删楼之后，该楼产生的知识轨迹必须跟着走
     *   三条纪律：
     *     ① **不静默**：被撤销的列出来，依赖它的派生轨迹标 revoked 并另列；
     *     ② 撤销后若该角色对该事实**再无轨迹** ⇒ 状态回到 notRecorded 而不是 unknown
     *        （撤销不等于「显式不知道」——把两者混同会凭空造出一条「他确实不知道」）；
     *     ③ 输入畸形（floor 非数、raw 非对象）一律降级返回，不抛。
     * --------------------------------------------------------------- */
    function dropByFloor(raw, floor) {
        const out = { kind: KT_KIND, removed: [], orphaned: [], changed: false, degraded: false, trace: null };
        try {
            const f = floorOf(floor);
            if (f == null) { out.degraded = true; return out; }
            const trace = normalize(raw);
            const killed = trace.traces.filter((t) => t.floor === f);
            if (!killed.length) { out.trace = trace; out.trace.traces = trace.traces.map((t) => Object.assign({}, t, { revoked: !!t.revoked })); return out; }
            const killedIds = new Set(killed.map((t) => t.traceId));
            const kept = trace.traces.filter((t) => t.floor !== f);
            /* 派生轨迹：其 corrects 指向一条已被撤销的轨迹 ⇒ 标 revoked **并保留可见** */
            const orphaned = [];
            for (const t of kept) {
                if (t.corrects && killedIds.has(t.corrects)) {
                    t.revoked = true;
                    orphaned.push({ traceId: t.traceId, corrects: t.corrects, reason: 'corrected-target-removed' });
                }
            }
            trace.traces = kept;
            out.trace = trace;
            out.removed = killed.map((t) => t.traceId);
            out.orphaned = orphaned;
            out.changed = true;
            return out;
        } catch (_e) {
            return Object.assign({}, out, { degraded: true });
        }
    }

    /* ---------------------------------------------------------------
     * 命名空间隔离（同名异人）：按 suspect 标记把两个同名角色分开取
     *   本仓既有口径：同名条目可为不同角色，不合并、不强行统一，
     *   另挂模块内全卡唯一的干净昵称。本模块**照此办**：suspect 非空时
     *   只取该 suspect 的轨迹；suspect 为空则只取未标记的（不把可疑的混进来）。
     * --------------------------------------------------------------- */
    function listOf(raw, character, opts) {
        try {
            const trace = normalize(raw);
            const o = (opts && typeof opts === 'object') ? opts : {};
            const who = text(character, 40);
            const suspect = text(o.suspect, 40);
            const idFilter = pick(o.identity, IDENTITY, '');
            const rows = trace.traces.filter((t) => {
                if (who && t.character !== who) return false;
                if (suspect ? t.suspect !== suspect : !!t.suspect) return false;
                if (idFilter && t.identity !== idFilter) return false;
                return true;
            }).sort((a, b) => (a.seq - b.seq));
            const truncated = rows.length > MAX_LIST;
            return { kind: KT_KIND, rows: rows.slice(0, MAX_LIST), total: rows.length, truncated: truncated, dropped: truncated ? rows.length - MAX_LIST : 0, malformed: trace.malformed, degraded: false };
        } catch (_e) {
            return { kind: KT_KIND, rows: [], total: 0, truncated: false, dropped: 0, malformed: 0, degraded: true };
        }
    }

    /* ---------------------------------------------------------------
     * 读数一句话（供诊断/自检行）
     *   五态**分开说**；notRecorded 必须与 unknown 分列 —— 把两者并成「不知道」
     *   正是本模块要治的那句无据断言。全零读数不得被读成「机制正常」：
     *   长期 knows=0 意味着从未记过任何轨迹，与「本来就没有知识可记」同形，
     *   故如实报计数，由调用方累计判断。
     * --------------------------------------------------------------- */
    function line(read) {
        const r = read || {};
        if (r.moduleMissing) return '模块未加载（knowledge-trace.js）';
        if (r.degraded) return '轨迹读取异常（已降级，不外抛）';
        const parts = [
            '得知 ' + (r.knows || 0),
            '怀疑 ' + (r.doubts || 0),
            '误信 ' + (r.misled || 0),
            '未知 ' + (r.unknown || 0),
            '**未记录 ' + (r.notRecorded || 0) + '**',
            '转述合并 ' + (r.transmittals || 0),
            '撤销 ' + (r.removed || 0)
        ];
        if (r.orphaned) parts.push('**纠正链断裂 ' + r.orphaned + '**');
        if (r.ambiguousIdentity) parts.push('身份面混淆 ' + r.ambiguousIdentity);
        if (r.truncated) parts.push('**截断 ' + r.truncated + '**');
        if (r.malformed) parts.push('畸形 ' + r.malformed);
        if (r.owners) parts.push('涉及角色 ' + r.owners);
        return parts.join(' · ');
    }

    const api = {
        KT_VERSION: KT_VERSION,
        KT_KIND: KT_KIND,
        ACTIONS: ACTIONS,
        VIA: VIA,
        IDENTITY: IDENTITY,
        MAX_TRACES: MAX_TRACES,
        MAX_LIST: MAX_LIST,
        MAX_PER_EVIDENCE: MAX_PER_EVIDENCE,
        normalizeFact: normalizeFact,
        evidenceKeyOf: evidenceKeyOf,
        normalize: normalize,
        propagationSet: propagationSet,
        stateOf: stateOf,
        knewAt: knewAt,
        timelineOf: timelineOf,
        provenanceOf: provenanceOf,
        dropByFloor: dropByFloor,
        listOf: listOf,
        line: line
    };
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) {
        try { root.LonShaKnowledgeTrace = Object.freeze(api); } catch (_e) { /* 宿主冻结全局会抛，忽略 */ }
    }
    return api;
})(typeof window !== 'undefined' ? window : globalThis);
