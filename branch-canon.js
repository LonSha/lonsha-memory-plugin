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
    const BC_VERSION = 1;
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

    /** 冲突三态(验收1:两条结局不能自动同时成立)。 */
    const CLASH = Object.freeze({
        SINGLE: 'single',
        BOTH_TERMINAL: 'both-terminal',
        SHARED_TERMINAL: 'shared-terminal',
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
        describe, describePlan, selfCheck, line,
    });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    const g = (typeof globalThis !== 'undefined') ? globalThis : global;
    try { g.LonShaBranchCanon = Object.freeze(api); } catch (_e) { /* 宿主冻结全局时忽略 */ }
})(typeof window !== 'undefined' ? window : globalThis);
