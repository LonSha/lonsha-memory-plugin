// [v3.365.0] engine-repair-ops.js: 从 index.js 剥离的派生件修复执行与纠错操作集群
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEngineRepairOps = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let _ml = null;
    let _errLog = (e, ctx) => { try { console.error('[LonShaRepairOps]', ctx, e); } catch (_) {} };
    let _libs = {};
    const PLUGIN_NAME = 'LonSha记忆引擎';

    function bindDeps(deps) {
        if (deps) {
            if (typeof deps.moduleLib === 'function') _ml = deps.moduleLib;
            if (typeof deps.errLog === 'function') _errLog = deps.errLog;
            if (deps.libs && typeof deps.libs === 'object') _libs = deps.libs;
        }
    }

    function _moduleLib(getGlobal, fileName) {
        if (typeof _ml === 'function') return _ml(getGlobal, fileName);
        try {
            if (typeof getGlobal === 'function') {
                const g = getGlobal();
                if (g) return g;
            }
            if (typeof require === 'function' && fileName) {
                return require('./' + fileName);
            }
        } catch (_) {}
        return null;
    }

    function errLog(e, ctx) {
        if (typeof _errLog === 'function') _errLog(e, ctx);
    }

    function _repairLoopLib() {
        if (_libs._repairLoopLib) return _libs._repairLoopLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaRepairLoop : null), 'repair-loop.js');
    }
    function _correctionPlanLib() {
        if (_libs._correctionPlanLib) return _libs._correctionPlanLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaCorrectionPlan : null), 'correction-plan.js');
    }
    function _evidenceQueryLib() {
        if (_libs._evidenceQueryLib) return _libs._evidenceQueryLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaEvidenceQuery : null), 'evidence-query.js');
    }
    function _factVersionLib() {
        if (_libs._factVersionLib) return _libs._factVersionLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaFactVersion : null), 'fact-version.js');
    }
    function _memoryCenterLib() {
        if (_libs._memoryCenterLib) return _libs._memoryCenterLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaMemoryCenter : null), 'memory-center.js');
    }
    function _eventCompletenessLib() {
        if (_libs._eventCompletenessLib) return _libs._eventCompletenessLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaEventCompleteness : null), 'event-completeness.js');
    }

    function requestRepair(engine, input) {

        try {
            const RL = _repairLoopLib();
            if (!RL || typeof RL.request !== 'function') return { ok: false, reason: 'module-unavailable' };
            const st = engine._repairState ? RL.normalize(engine._repairState) : { version: 1, seq: 0, repairs: [] };
            // 派生件池收在 _repairPool()（单一真源；本方法此前内联一份，previewRepair 一加就会分叉）
            const r = RL.request(st, Object.assign({}, input, { pool: engine._repairPoolFor(input) }));
            if (!r.ok) return { ok: false, reason: r.reason };
            engine._repairState = r.state;
            engine._lastRepair = { at: Date.now(), action: r.repair.action, total: r.total, id: r.repair.id };
            if (r.total && engine.config.config.debugMode) console.log(`[${PLUGIN_NAME}] 修复请求 ${r.repair.id}（${r.repair.action}）：受影响派生件 ${r.total} 项待落定`);
            // [v3.214.0] R1-F：`replayed`/`changed` **必须透出**。幂等重放与真登记在下游
            //   看起来一模一样（都是 ok:true + 同一条 id、同一个 total），吞掉这两个字段
            //   等于把「这次什么都没写」伪装成「这次写了」——桥的 apply 回执直接取用它们。
            return { ok: true, repair: r.repair, affected: r.affected, total: r.total,
                replayed: !!r.replayed, changed: r.changed !== false };
        } catch (e) { errLog(e, 'engine.requestRepair'); return { ok: false, reason: 'thrown' }; }
    
    }

    /** [v3.194] 落定一条派生件的修复（宿主逐项回报 done/failed/missing）。不抛。 */
    function settleRepair(engine, input) {

        try {
            const RL = _repairLoopLib();
            if (!RL || typeof RL.settle !== 'function') return { ok: false, reason: 'module-unavailable' };
            const st = engine._repairState ? RL.normalize(engine._repairState) : { version: 1, seq: 0, repairs: [] };
            const r = RL.settle(st, input);
            if (!r.ok) return { ok: false, reason: r.reason };
            engine._repairState = r.state;
            return { ok: true, repair: r.repair, item: r.item, pending: r.pending, failed: r.failed, settled: r.settled };
        } catch (e) { errLog(e, 'engine.settleRepair'); return { ok: false, reason: 'thrown' }; }
    
    }

    /**
    * [v3.214.0] R1-F：**放弃一次修复**（用户改主意）。
    *   与 requestRepair/settleRepair 同规格：模块缺席如实回 'module-unavailable'（不抛、
    *   不伪装成「没有这条修复」）；`replayed` 照实透出（已放弃的再放弃是重放，不是新动作）。
    */
    function abandonRepair(engine, input) {

        try {
            const RL = _repairLoopLib();
            if (!RL || typeof RL.abandon !== 'function') return { ok: false, reason: 'module-unavailable' };
            const st = engine._repairState ? RL.normalize(engine._repairState) : { version: 1, seq: 0, repairs: [] };
            const r = RL.abandon(st, input);
            if (!r.ok) return { ok: false, reason: r.reason };
            engine._repairState = r.state;
            return { ok: true, repair: r.repair, replayed: !!r.replayed, changed: r.changed !== false };
        } catch (e) { errLog(e, 'engine.abandonRepair'); return { ok: false, reason: 'thrown' }; }
    
    }

    /**
    * [v3.214.0] R1-F：修复面的**修订读数**（`_mutationEpoch` 的唯一对读口）。
    *
    * 【为什么要有这一面】
    *   写方的 `expectRevision` 要拿变更栅栏号对表（回滚/恢复/切聊都会递增它），
    *   若让桥直接读 `engine._mutationEpoch`，一个**私有字段**就成了对外契约的一部分
    *   ——改名即悄悄失配，而失配的表现是「写入被拒」，没人会想到是改名。
    *   故在此收一个方法口：读不到就是 0，绝不抛。
    */
    function repairRevision(engine) {

        try { return Number(engine._mutationEpoch) || 0; } catch (e) { return 0; }
    
    }

    /**
    * [v3.214.0] R1-F：**修复预览**（只算受影响派生件，不写台账）。
    *
    * 【为什么需要它 / 修前实测后果】
    *   修复链路此前只有 `requestRepair()`：它既算清单又写账，且**不幂等**——
    *   于是「先看看这次修复会牵连哪些派生件」只能靠真登记一次再放弃，
    *   而重试一次就多一条记录，`pending()` 里混进一批从未打算执行的修复。
    *   本方法复用与 requestRepair **同一批派生物池**（现收、不另存），
    *   只调纯函数 `RL.preview()`（签名里没有状态，写不进去），故预览与登记
    *   在 affected 上逐条一致——预览过 ⇒ 登记也会过同一个清单。
    *   不抛；模块缺席时如实回 reason='module-unavailable'（不得伪装成「没有受影响项」）。
    */
    function previewRepair(engine, input) {

        try {
            const RL = _repairLoopLib();
            if (!RL || typeof RL.preview !== 'function') return { ok: false, reason: 'module-unavailable', affected: [], total: 0 };
            const r = RL.preview(Object.assign({}, input, { pool: engine._repairPoolFor(input) }));
            if (!r.ok) return { ok: false, reason: r.reason, affected: [], total: 0 };
            return { ok: true, action: r.action, subject: r.subject, target: r.target, affected: r.affected, total: r.total, wrote: false };
        } catch (e) { errLog(e, 'engine.previewRepair'); return { ok: false, reason: 'thrown', affected: [], total: 0 }; }
    
    }

    /**
    * [v3.295.0 · X2] 六类派生件的**逐类逆操作接线表**（宿主侧**单一真源**）。
    *
    * 【为什么必须由宿主持有】模块侧只登记**语义名**（`INVERSE`），因为「用哪个方法改哪本账」
    *   是宿主的接线细节；把它写进模块就是让纯函数持有第二份运行期真源。本表是那句
    *   「撤销只在原 owner 能提供逆操作时才开放」的**实况**：owner 面缺席 ⇒ `null`，
    *   方案里如实显示 `revocable:false`，而**不是**静默照撤。
    *
    * 契约：`fn(item) -> { ok:boolean, reason?:string, note?:string }`（同步、不抛；
    *   本表统一兜异常 —— 接线表自己抛会把「这一项失败」变成「整次修复失败」）。
    *   `reason` 用既有词表：missing-target / not-found / unsupported / no-organ。
    */
    function _repairOwners(engine) {

        const self = engine;
        const itemKey = (it) => String((it && it.key) || '');
        /* 从 key 里取楼层（摘要 `sum_12` / 时间线 `tl_12`；取不到给 null，**不猜 0**
         *   —— 0 在本插件是合法楼层，猜出来的 0 会改到第 0 楼去）。 */
        const floorOf = (key) => {
            const m = String(key || '').match(/(\d+)\s*$/);
            if (!m) return null;
            const n = Number(m[1]);
            return Number.isFinite(n) ? n : null;
        };
        return {
            /* ① 摘要：改文字。`updateSummaryText(floor, newText)` 是 summary 器官既有写面。 */
            summary: function (it) {
                const s = self.summary;
                if (!s || typeof s.updateSummaryText !== 'function') return { ok: false, reason: 'no-organ' };
                const text = String((it && it.note) || '').trim();
                if (!text) return { ok: false, reason: 'missing-target' };
                const fl = floorOf(itemKey(it));
                if (fl === null) return { ok: false, reason: 'missing-target' };
                const done = s.updateSummaryText(fl, text);
                return done ? { ok: true, note: '摘要第' + fl + '楼已改' } : { ok: false, reason: 'not-found' };
            },
            /* ② 事件段：撤销整条事件线（`abandonEvent` 是 event-completeness 既有写面）。 */
            event: function (it) {
                const EC = _eventCompletenessLib();
                if (!EC || typeof EC.abandonEvent !== 'function') return { ok: false, reason: 'no-organ' };
                const id = itemKey(it);
                if (!id) return { ok: false, reason: 'missing-target' };
                let st = self._eventThreadState;
                if (!st) return { ok: false, reason: 'not-found' };
                const r = EC.abandonEvent(st, { id: id, reason: String((it && it.note) || 'repair') });
                if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || 'not-found' };
                self._eventThreadState = r.state;
                return { ok: true, note: '事件线已放弃' };
            },
            /* ③ 关系：改图谱边的两端（重定向到新主体；同主体则删边）。
             *   与既有 `graphDedup` 的「迁移边」逐字同法：删旧键、按复合键重建。 */
            relation: function (it) {
                const g = self.graph;
                if (!g || !g.edges || typeof g.edges.get !== 'function') return { ok: false, reason: 'no-organ' };
                const key = itemKey(it);
                const m = key.match(/^\s*(.+?)\s*->\s*(.+?)\s*$/);
                if (!m) return { ok: false, reason: 'missing-target' };
                const to = String((it && it.note) || '').trim();
                if (!to) return { ok: false, reason: 'missing-target' };
                const oldTo = m[2];
                let hit = null;
                for (const e of Array.from(g.edges.values())) {
                    if (String(e.from) === m[1] && String(e.to) === oldTo) { hit = e; break; }
                }
                if (!hit) return { ok: false, reason: 'not-found' };
                const eid = hit.id || (hit.from + '-' + hit.to + '-' + (hit.label || 'related'));
                g.edges.delete(eid);
                if (String(m[1]) !== to) {
                    const nid = m[1] + '-' + to + '-' + (hit.label || 'related');
                    g.edges.set(nid, Object.assign({}, hit, { from: m[1], to: to, id: nid }));
                }
                if (typeof g.rebuildNameIndex === 'function') g.rebuildNameIndex();
                return { ok: true, note: '关系边已重定向' };
            },
            /* ④ 约定：cancel（commitment-ledger 既有终态迁移）。 */
            promise: function (it) {
                const CL = (typeof window !== 'undefined' && window.LonShaCommitmentLedger) || null;
                if (!CL || typeof CL.cancel !== 'function') return { ok: false, reason: 'no-organ' };
                if (!self.worldProg) return { ok: false, reason: 'not-found' };
                const id = itemKey(it);
                if (!id) return { ok: false, reason: 'missing-target' };
                const r = CL.cancel(self.worldProg.commitmentLedger, { id: id, reason: String((it && it.note) || 'repair') });
                if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || 'not-found' };
                self.worldProg.commitmentLedger = r.state;
                return { ok: true, note: '约定已作废' };
            },
            /* ⑤ 事实：撤销（fact-version 既有写面；这是本仓「修复闭环」的原生动作）。 */
            fact: function (it) {
                const FV = _factVersionLib();
                if (!FV || typeof FV.revokeFact !== 'function') return { ok: false, reason: 'no-organ' };
                const id = itemKey(it);
                if (!id) return { ok: false, reason: 'missing-target' };
                let st = self._factVersionState;
                if (!st) return { ok: false, reason: 'not-found' };
                const r = FV.revokeFact(st, { id: id, reason: String((it && it.note) || 'repair') });
                if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || 'not-found' };
                self._factVersionState = r.state;
                return { ok: true, note: '事实已撤销' };
            },
            /* ⑥ 时间线：按 id 摘条（与 `rollbackFloor` 里摘时间线逐字同法）。 */
            timeline: function (it) {
                const id = itemKey(it);
                if (!id) return { ok: false, reason: 'missing-target' };
                const tl = self.timeline;
                if (!tl || !Array.isArray(tl.entries)) return { ok: false, reason: 'no-organ' };
                const before = tl.entries.length;
                tl.entries = tl.entries.filter(function (t) { return String(t.id) !== id; });
                if (tl.entries.length === before) return { ok: false, reason: 'not-found' };
                return { ok: true, note: '时间线条目已摘除' };
            },
        };
    
    }

    function _correctionOwners(engine) {

        const self = engine;
        const stateOf = () => {
            const FV = _factVersionLib();
            return FV.normalize(self._factVersionState || { version: 1, seq: 0, facts: [] });
        };
        return {
            /* 新增 / 换代：走 fact-version 既有写面 `assertFact`（换代由区间与楼层驱动）。 */
            fact: function (it) {
                const FV = _factVersionLib();
                if (!FV || typeof FV.assertFact !== 'function') return { ok: false, reason: 'no-organ' };
                const entry = (it && it.entry) || {};
                const subject = String(entry.subject || entry.character || '').trim();
                const predicate = String(entry.predicate || entry.field || entry.kind || '').trim();
                const value = String((it && it.value != null) ? it.value : (entry.value != null ? entry.value : entry.text || '')).trim();
                if (!subject || !predicate || !value) return { ok: false, reason: 'missing-triple' };
                const st0 = stateOf();
                /* ★ 幂等轴：同主语 + 同谓词 + 同值且未撤 ⇒ **不重复落**（计划验收④）。 */
                const dup = (st0.facts || []).filter(function (f) {
                    return !f.revoked
                        && String(f.subject).toLowerCase() === subject.toLowerCase()
                        && String(f.predicate).toLowerCase() === predicate.toLowerCase()
                        && String(f.value).toLowerCase() === value.toLowerCase();
                })[0];
                if (dup) return { ok: true, replayed: true, id: dup.id, superseded: [], note: '同键同值已在账上（不重复落）' };
                const fl = self._numOrNull((it && it.floor !== undefined) ? it.floor : (it && it.entry && it.entry.floor));
                const r = FV.assertFact(st0, {
                    subject: subject, predicate: predicate, value: value,
                    origin: String(entry.origin || 'stated'),
                    from: fl, floor: fl, source: 'correction',
                    evidence: String(entry.evidence || entry.sourceRef || ''),
                    at: Date.now()
                });
                if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || 'rejected' };
                self._factVersionState = r.state;
                return { ok: true, replayed: r.replayed === true, id: (r.fact && r.fact.id) || '',
                    superseded: Array.isArray(r.superseded) ? r.superseded.slice() : [], note: '事实已入账' };
            },
            /* 撤回：走既有 `revokeFact`（不删条目——删了就查不出「曾经记错过」）。 */
            'fact-revoke': function (it) {
                const FV = _factVersionLib();
                if (!FV || typeof FV.revokeFact !== 'function') return { ok: false, reason: 'no-organ' };
                const id = String((it && it.id) || (it && it.key) || '').trim();
                if (!id) return { ok: false, reason: 'missing-target' };
                const r = FV.revokeFact(stateOf(), { id: id, reason: String((it && it.note) || 'correction') });
                if (!r || !r.ok) return { ok: false, reason: (r && r.reason) || 'not-found' };
                self._factVersionState = r.state;
                return { ok: true, replayed: r.replayed === true, id: id, note: '事实已撤销' };
            }
        };
    
    }

    /** [v3.338.0 · M4-O8] 事实项核验：**读本行真账**，确认这一项真在账上（新增）/ 真被撤（撤回）。
    *   与 `_verifyRepairItem` 的分工：那条判据针对**派生件**的逆操作（摘要文字 / 事件线 / 关系边 /
    *   约定 / 时间线），本条针对**事实账**的落笔。两条都读运行时——「改了」与「存住了」是两件事，
    *   落盘由回读单独证明。不抛。 */
    function _verifyCorrectionItem(engine, kind, item) {

        try {
            const FV = _factVersionLib();
            if (!FV || typeof FV.normalize !== 'function' || !engine._factVersionState) return false;
            const st = FV.normalize(engine._factVersionState);
            const id = String((item && item.id) || '');
            if (!id) return false;
            const t = (st.facts || []).filter(function (f) { return f.id === id; })[0];
            if (!t) return false;
            if (kind === 'fact') return t.revoked !== true;
            if (kind === 'fact-revoke') return t.revoked === true;
            return false;
        } catch (e) { return false; }
    
    }

    /**
    * [v3.338.0 · M4-O8] **纠错方案落笔**（原生确认后的真写入）。
    *
    * 顺序**不可换**（与 `applyRepairPlan` 同款四步，理由逐条相同）：
    *   ① 出提案（未圈范围 ⇒ 拒，不改一个字节）；
    *   ② 只落 `decision==='selected'` 的项（选 2 拒 1 ⇒ 拒的那条字节不变）；
    *   ③ 逐项走 owner 改数据 → 立刻读**本行真账**核验；
    *   ④ 落盘 + 回读（一次，覆盖本批全部已改项），再给回执与两路撤销 token。
    *
    * @param {object} opts {
    *   range, oldFacts, newFacts, rewritten, failed,  —— 与 `correctionPlanReextract` 同源
    *   selections: [{key, decision}],                 —— 逐项确认（selected / rejected）
    *   notes: {key: value},                           —— 覆盖值（未给则用提案值）
    *   configFix: {key, value}                        —— 可选：同时确认一项配置变更（与事实分账）
    * }
    * @returns {Promise<object|null>} 回执；模块缺席 / 异常 ⇒ null（降级，不抛）
    */
    async function applyCorrectionPlan(engine, opts = {}) {

        const o = opts || {};
        let applied = 0, persisted = null, readbackOk = null;
        const blank = (why) => ({
            ok: false, reason: why, scoped: false, scope: null, why: '',
            selected: 0, rejected: 0, applied: 0, verified: 0,
            persisted: null, readback: null, items: [],
            writes: 0, zeroWrite: true, idempotentByFactKey: true, duplicatesPrevented: 0, stale: false,
            undo: { separate: true, configUndo: null, factUndo: null, note: '撤配置不动事实，撤事实不动配置' }
        });
        try {
            const CP = _correctionPlanLib();
            const FV = _factVersionLib();
            if (!CP || typeof CP.planReextract !== 'function') return blank('module-unavailable');
            if (!FV || typeof FV.assertFact !== 'function' || typeof FV.revokeFact !== 'function') return blank('no-organ');
            const lease = { chatId: engine.getCurrentChatId(), epoch: engine._mutationEpoch };
            /* ① 提案：范围归一与逐项确认全在内核（**本面不重算条件**）。 */
            const plan = CP.planReextract({
                range: o.range, oldFacts: o.oldFacts, newFacts: o.newFacts,
                selections: o.selections, rewritten: o.rewritten, failed: o.failed
            }, {});
            if (plan.scoped !== true) {
                const b = blank('unscoped');
                b.scope = plan.scope || null;
                b.why = plan.why || '';
                return b;
            }
            /* ② 只落**被选中的**项（拒的那条一个字节不动）。 */
            const picked = (plan.items || []).filter(function (x) { return x.decision === 'selected'; });
            const notes = (o.notes && typeof o.notes === 'object') ? o.notes : {};
            const srcByKey = new Map();
            for (const f of (Array.isArray(o.newFacts) ? o.newFacts : [])) {
                const k = (typeof CP.factKey === 'function') ? CP.factKey(f) : String((f && (f.key || f.factId || f.id)) || '');
                if (k) srcByKey.set(k, f);
            }
            const owners = engine._correctionOwners();
            const results = [];
            const stamp = Date.now();
            const journal = {
                at: stamp, epoch: lease.epoch, chatId: lease.chatId,
                factToken: 'undo:fact:' + stamp, configToken: 'undo:config:' + stamp,
                fact: { landed: [], superseded: [] }, config: null
            };
            for (const it of picked) {
                /* 冲突项**不由本面裁决**：同一事实两个值 ⇒ 如实落 failed（口径要人来选）。 */
                if (it.outcome === 'conflicted') {
                    results.push({ key: it.key, floor: it.floor, outcome: it.outcome, status: 'failed', reason: 'conflicted-needs-choice' });
                    continue;
                }
                const entry = srcByKey.get(it.key) || {};
                const value = (notes[it.key] != null) ? String(notes[it.key]) : String((it.after && it.after.value) || '');
                const r = owners.fact({ entry: entry, value: value, floor: it.floor });
                if (!r.ok) {
                    results.push({ key: it.key, floor: it.floor, outcome: it.outcome, status: 'failed', reason: String(r.reason || 'failed') });
                    continue;
                }
                applied++;
                if (r.replayed !== true && r.id) journal.fact.landed.push(r.id);
                for (const sid of (r.superseded || [])) journal.fact.superseded.push(sid);
                const originOk = engine._verifyCorrectionItem('fact', { id: r.id });
                results.push({ key: it.key, floor: it.floor, outcome: it.outcome, status: 'done',
                    id: r.id, replayed: r.replayed === true, originData: originOk });
            }
            /* 配置面（可选）：确认一项参数变更并记旧值（**与事实分账**）。 */
            if (o.configFix && typeof o.configFix === 'object' && o.configFix.key) {
                const ck = String(o.configFix.key);
                const cfg = engine.config && engine.config.config;
                if (cfg && Object.prototype.hasOwnProperty.call(cfg, ck)) {
                    journal.config = { key: ck, before: cfg[ck], after: o.configFix.value };
                    cfg[ck] = o.configFix.value;
                    try { if (typeof engine.config.saveConfig === 'function') engine.config.saveConfig(); }
                    catch (e) { errLog(e, 'engine.applyCorrectionPlan.saveConfig'); }
                }
            }
            /* ③ 落盘 + 回读（一次，覆盖本批全部已改项）。 */
            if (typeof engine.storage?.save === 'function' && typeof engine.storage?.load === 'function') {
                try { persisted = (await engine.storage.save(engine.getCurrentChatId(), engine.collectExport())) === true; }
                catch (e) { errLog(e, 'engine.applyCorrectionPlan.save'); persisted = false; }
                try {
                    const back = await engine.storage.load(engine.getCurrentChatId(), { preserveRuntime: true });
                    const backOk = !!(back && back.factVersions && Array.isArray(back.factVersions.facts));
                    readbackOk = (persisted === true && backOk);
                } catch (e) { errLog(e, 'engine.applyCorrectionPlan.load'); readbackOk = false; }
            } else {
                /* 无落盘 / 无回读口 ⇒ **不判为真也不判为假**（「没尝试」与「试了失败」不同形）。 */
                persisted = null; readbackOk = null;
            }
            const stale = !engine._leaseValid(lease);
            if (stale) engine._leaseDrop(lease, 'correctionPlan', -1);
            const verified = results.filter(function (x) { return x.originData === true; }).length;
            const bad = results.filter(function (x) { return x.status !== 'done'; }).length;
            engine._correctionJournal = journal;
            const hasFactUndo = journal.fact.landed.length > 0 || journal.fact.superseded.length > 0;
            const out = {
                ok: bad === 0 && !stale && picked.length > 0,
                reason: stale ? 'epoch-changed'
                    : (picked.length === 0 ? 'nothing-selected' : (bad === 0 ? '' : 'partial-failed')),
                scoped: true, scope: plan.scope || null, why: '',
                selected: picked.length, rejected: (plan.staged && plan.staged.rejected) || 0,
                applied: applied, verified: verified,
                persisted: persisted, readback: readbackOk,
                items: results,
                writes: applied, zeroWrite: applied === 0,
                idempotentByFactKey: true,
                duplicatesPrevented: (plan.retry && plan.retry.duplicatesPrevented) || 0,
                stale: stale,
                undo: {
                    separate: true,
                    configUndo: journal.config
                        ? { kind: 'config-undo', token: journal.configToken, what: '把参数改回改前的值', touchesFacts: false }
                        : null,
                    factUndo: hasFactUndo
                        ? { kind: 'fact-undo', token: journal.factToken, what: '把这次落下的条目撤回并保留换代链', touchesConfig: false }
                        : null,
                    note: '撤配置不动事实，撤事实不动配置 —— 合成一个「撤销」会让人以为两件都回退了'
                }
            };
            engine._lastCorrectionApply = { at: Date.now(), why: out.reason || 'ok', applied: applied, verified: verified, readback: readbackOk };
            return out;
        } catch (e) {
            /* 降级返回 null，但**先留一条可查的作废读数**（与 X2 同一处置）：异常可能发生在
             * 「已经落了 N 条」之后，调用方把 null 读成「没成」就会重试，于是重复落笔。 */
            try {
                engine._lastCorrectionApply = { at: Date.now(), why: 'threw', applied: applied, persisted: persisted, readback: readbackOk, err: (e && e.message) || String(e) };
            } catch (_e) { /* 留痕失败就作罢 */ }
            errLog(e, 'engine.applyCorrectionPlan');
            return null;
        }
    
    }

    /**
    * [v3.338.0 · M4-O8] **分别撤销**（配置与事实两条路，两个 token，互不触碰）。
    *   为什么不合成一个「撤销」：改了一条事实与改了一个参数是两件事，
    *   合成一个会让人以为两件都回退了（`correction-plan.js` 已立此纪律）。
    * @param {object} opts { kind:'fact'|'config', token }
    * @returns {object} 恒定键回执（不抛）
    */
    function undoCorrection(engine, opts = {}) {

        const o = opts || {};
        const kind = String(o.kind || '');
        const token = String(o.token || '');
        const base = { ok: false, reason: '', kind: kind, token: token,
            touchedFacts: false, touchedConfig: false, reverted: 0, at: Date.now() };
        try {
            const j = engine._correctionJournal;
            if (!j) return Object.assign(base, { reason: 'no-journal' });
            if (kind === 'fact') {
                if (token && token !== j.factToken) return Object.assign(base, { reason: 'token-mismatch' });
                const FV = _factVersionLib();
                if (!FV || typeof FV.revokeFact !== 'function') return Object.assign(base, { reason: 'no-organ' });
                let st = FV.normalize(engine._factVersionState || null);
                let n = 0;
                /* 本批**新落的**条目：撤回（`replayed` 的不动 —— 那些不是本批落的）。 */
                for (const id of (j.fact.landed || [])) {
                    const r = FV.revokeFact(st, { id: id, reason: 'correction-undo' });
                    if (r && r.ok) { st = r.state; if (r.changed) n++; }
                }
                /* 本批**换代闭合的**旧条目：还原区间与换代指针（保留换代链的可查性）。 */
                for (const id of (j.fact.superseded || [])) {
                    const idx = (st.facts || []).findIndex(function (f) { return f.id === id; });
                    if (idx < 0) continue;
                    st.facts[idx].to = null;
                    st.facts[idx].supersededBy = null;
                    n++;
                }
                engine._factVersionState = st;
                return Object.assign(base, { ok: true, touchedFacts: true, reverted: n });
            }
            if (kind === 'config') {
                if (token && token !== j.configToken) return Object.assign(base, { reason: 'token-mismatch' });
                if (!j.config) return Object.assign(base, { reason: 'no-config-change' });
                const cfg = engine.config && engine.config.config;
                if (!cfg) return Object.assign(base, { reason: 'no-config' });
                cfg[j.config.key] = j.config.before;
                try { if (typeof engine.config.saveConfig === 'function') engine.config.saveConfig(); }
                catch (e) { errLog(e, 'engine.undoCorrection.saveConfig'); }
                return Object.assign(base, { ok: true, touchedConfig: true, reverted: 1 });
            }
            return Object.assign(base, { reason: 'unknown-kind' });
        } catch (e) { errLog(e, 'engine.undoCorrection'); return Object.assign(base, { reason: 'thrown' }); }
    
    }

    /**
    * [v3.338.0 · M4-O8] 控制中心**单条撤回**的真写面（不借道「撤销本批落笔」）。
    *   为什么单开一个出口：`undoCorrection` 的语义是「撤销**这一批**刚落的笔」
    *   （它按 `_correctionJournal` 走）。拿它来撤回一条历史条目就得伪造一份 journal，
    *   而伪造 journal 会把真流水**覆盖掉** —— 那一批从此撤不回来（本仓最贵的一类账）。
    *   本出口直走 fact-version 的 `revokeFact`（既有写面，不新造语义），不碰 journal。
    * @returns {{ok:boolean, reason:string, replayed:boolean, id:string}}
    */
    function memoryCenterRevoke(engine, id, note) {

        const out = { ok: false, reason: '', replayed: false, id: String(id == null ? '' : id) };
        try {
            const FV = _factVersionLib();
            if (!FV || typeof FV.revokeFact !== 'function' || typeof FV.normalize !== 'function') { out.reason = 'no-organ'; return out; }
            if (!out.id) { out.reason = 'missing-id'; return out; }
            const r = FV.revokeFact(FV.normalize(engine._factVersionState || null), { id: out.id, reason: String(note || 'manual-revoke') });
            if (!r || !r.ok) { out.reason = (r && r.reason) || 'failed'; return out; }
            engine._factVersionState = r.state;
            out.ok = true; out.replayed = r.replayed === true;
            return out;
        } catch (e) { errLog(e, 'plugin.memoryCenterRevoke'); out.reason = 'thrown'; return out; }
    
    }

    /**
    * [v3.338.0 · M4-O8] 控制中心**保存当前条件**（唯一出口）。
    *   为什么不在面板里拼 spec / 拼 label：条件口径在内核（`buildSpec`），摘要口径也在
    *   内核（`specLine`）。面板各拼一份 ⇒ 存下去的与显示的不是同一条（本仓治理过多轮）。
    *   保存的是**条件**（不是结果）；存储面复用 evidence-query 的 saved 表
    *   （`_evidenceSavedQueries`，本会话有效、不落存档），不另开第二张表。
    * @returns {{ok:boolean, reason:string, label:string, replayKey:string, replaced:boolean, dropped:number, count:number}}
    */
    function memoryCenterSaveQuery(engine, state) {

        const out = { ok: false, reason: '', label: '', replayKey: '', replaced: false, dropped: 0, count: engine.evidenceSavedQueries().length };
        try {
            const C = _memoryCenterLib();
            const Q = _evidenceQueryLib();
            if (!C || typeof C.buildSpec !== 'function' || !Q || typeof Q.upsertSaved !== 'function') { out.reason = 'module-unavailable'; return out; }
            const spec = C.buildSpec(state);
            const label = (typeof C.specLine === 'function') ? String(C.specLine(spec)).slice(0, 40) : '';
            const cur = Array.isArray(engine._evidenceSavedQueries) ? engine._evidenceSavedQueries : [];
            const r = Q.upsertSaved(cur, { label: label, spec: spec }, Date.now());
            engine._evidenceSavedQueries = r.list;
            out.ok = r.saved === true;
            out.reason = r.reason || '';
            out.label = label;
            out.replaced = r.replaced === true;
            out.dropped = r.dropped || 0;
            out.count = r.list.length;
            out.replayKey = (r.list.length && r.list[r.list.length - 1].replayKey) || '';
            return out;
        } catch (e) { errLog(e, 'plugin.memoryCenterSaveQuery'); out.reason = 'thrown'; return out; }
    
    }

    /**
    * [v3.338.0 · M4-O8] 把**宿主真源**的保存条件并进界面状态（控制中心装配前的唯一注入点）。
    *   为什么必须有它：控制中心的 `face.saved` 读的是 `state.saved`，而保存的真源在宿主
    *   （`_evidenceSavedQueries`）—— 两者此前**零同步**，于是「保存了却看不到、看不到
    *   却删不掉」。浅拷贝返回：不改调用方对象（面板持有的 `_memoryCenterState` 不被宿主反写）。
    */
    function _memoryCenterStateWithSaved(engine, state) {

        const st = (state && typeof state === 'object') ? Object.assign({}, state) : {};
        st.saved = engine.evidenceSavedQueries();
        return st;
    
    }

    /**
    * [v3.338.0 · M4-O8] **面板取数口 A**：按范围取「账上已有的」事实（对照的 before 侧）。
    *   为什么由宿主取而不是面板自己翻账：面板拿到 `_factVersionState` 就是第二份证据库，
    *   且它一旦缓存，原账一改它就成旧读数冒充现读数（M3-O8 已立此纪律）。
    *   范围判不了（未圈 / 颠倒 / 端点读不到）⇒ `ok:false` 并给具名 reason，
    *   **绝不退回全量**（「没圈范围」不等于「全选」）。
    * @returns {{ok:boolean, reason:string, range:object|null, facts:Array}}
    */
    function correctionSourceFacts(engine, range) {

        const out = { ok: false, reason: '', range: null, facts: [] };
        try {
            const CP = _correctionPlanLib();
            const FV = _factVersionLib();
            if (!CP || typeof CP.floorRange !== 'function') { out.reason = 'module-unavailable'; return out; }
            if (!FV || typeof FV.normalize !== 'function') { out.reason = 'no-organ'; return out; }
            const sc = CP.floorRange(range);
            out.range = sc;
            if (sc.scoped !== true || sc.known !== true) { out.reason = sc.reason || 'unscoped'; return out; }
            const st = FV.normalize(engine._factVersionState || { version: 1, seq: 0, facts: [] });
            out.facts = (st.facts || []).filter(function (f) {
                return !f.revoked && CP.inScope(sc, f.from != null ? f.from : f.floor);
            }).map(function (f) {
                return {
                    key: f.id, subject: f.subject, predicate: f.predicate, value: f.value,
                    floor: (f.from != null ? f.from : f.floor), origin: f.origin,
                    sourceRef: String(f.evidence || f.source || '')
                };
            });
            out.ok = true;
            return out;
        } catch (e) { errLog(e, 'engine.correctionSourceFacts'); out.reason = 'thrown'; return out; }
    
    }

    /**
    * [v3.338.0 · M4-O8] **面板取数口 B**：向重提取管线要「新一轮提取结果」（对照的 after 侧）。
    *   ★ 本口**不编数据**：重提取器缺席 / 抛错 ⇒ `ok:false` + 具名 reason，
    *     由调用方如实显示「取不到新提取结果」，而不是拿旧账当新结果（那是本仓最忌的
    *     「投影冒充原文」同族形态）。夹具（fixture）经 `opts.newFacts` 直给时原样透传，
    *     使「真实模型未测时只认 fixture 提取闭环」这一条可被走通。
    * @returns {{ok:boolean, reason:string, facts:Array, source:string}}
    */
    function correctionReextractFacts(engine, opts = {}) {

        const o = opts || {};
        const out = { ok: false, reason: '', facts: [], source: '' };
        try {
            /* 夹具通道：显式给了就原样用（来源如实标 fixture，不冒充模型产出）。 */
            if (Array.isArray(o.newFacts)) {
                out.ok = true; out.facts = o.newFacts; out.source = 'fixture';
                return out;
            }
            const eng = engine;
            const fn = (typeof eng._reextractForCorrection === 'function') ? eng._reextractForCorrection : null;
            if (!fn) { out.reason = 'extractor-absent'; return out; }
            let r = null;
            try { r = fn.call(eng, { range: o.range, floors: o.floors, rewritten: o.rewritten }); }
            catch (e) { errLog(e, 'engine.correctionReextractFacts.call'); out.reason = 'thrown'; return out; }
            if (!r || r.ok !== true || !Array.isArray(r.facts)) { out.reason = (r && r.reason) || 'no-result'; return out; }
            out.ok = true; out.facts = r.facts; out.source = String(r.source || 'pipeline');
            return out;
        } catch (e) { errLog(e, 'engine.correctionReextractFacts'); out.reason = 'thrown'; return out; }
    
    }

    /**
    * [v3.295.0 · X2] 逐项落笔通道：把一次修复的**确认方案**真正落到六类派生件的 owner 上，
    * 并按「原数据核验 + 持久化回读」两条证据逐项落定（`RL.settle` 的证据门）。
    *
    * 【为什么必须由宿主做】模块侧是纯函数（`repair-loop.js` 没有六本账的引用，也不该有）。
    *   计划验收原文：「用户选错项 → 看原文和候选影响 → 选择纠正归属/拆分/撤销 → 逐项确认修改
    *   方案 → **原 owner 执行** → 保存并回读 → settle」——「原 owner 执行」与「保存并回读」
    *   两句都只有宿主能做到。缺了它们，`settle(done)` 就是一句**无据的声明**：
    *   界面显示「事实已纠正」，而没有任何一处数据被证明改过。这正是 X2 要治的那一处。
    *
    * 【与 X6/X7 的 handoff 同构（同一条纪律的三个实例）】
    *   ① 落笔走各器官既有写面（`_repairOwners()`，缺面即该类不可撤，如实拒绝）；
    *   ② 代际栅栏 `_leaseValid`（落笔期间切聊/回档 ⇒ 整批作废，但已落条数**如实计数**）；
    *   ③ 真落盘（`StorageManager.save` 返 true 才算落地）；
    *   ④ **真回读**（`StorageManager.load(chatId, {preserveRuntime:true})`）。
    *   ★ 第 ④ 条是 X2 与 X6/X7 的**关键差别**：X6/X7 回读的是「来源计数」，
    *     本面回读的是**这份派生件自身的值**——因为本面要证的是「这一条改了」，
    *     而不是「多了一条」。计数式回读在这里恒真（改文字不改条数），是一条**永不成立的判据**。
    *
    * 【两态落定：`byNeedle` 的高风险项默认不自动动】
    *   `basis==='needle'` 是文本撞上的**候选**（可能是同名角色、可能只是引号里一句台词）。
    *   计划原文「旧内容的文本命中只标候选」——故除非调用方显式 `allowCandidates:true`，
    *   候选一律落 `failed` 且原因 `candidate-unconfirmed`，**不猜、不改**。
    *   这不是「没做成」，而是「必须先由人确认」；两态在回执里分开计数。
    *
    * @returns {Promise<object|null>} 落笔回执；模块缺席 / 异常 ⇒ null（降级，不抛）
    */
    async function applyRepairPlan(engine, opts = {}) {

        const o = opts || {};
        let applied = 0, persisted = null, readbackOk = null;
        try {
            const RL = _repairLoopLib();
            if (!RL || typeof RL.plan !== 'function' || typeof RL.settle !== 'function') {
                /* 模块缺席**不写账**：模块不在时连「有没有这条修复」都判不了，
                 *   谎报 ok 会让调用方以为落定过了。 */
                engine._lastRepairApply = { at: Date.now(), why: 'module-unavailable' };
                return null;
            }
            const state = engine._repairState ? RL.normalize(engine._repairState) : { version: 1, seq: 0, repairs: [] };
            const id = String(o.id || '').trim();
            const rec = (state.repairs || []).find(function (r) { return r.id === id; });
            if (!rec) {
                engine._lastRepairApply = { at: Date.now(), why: 'not-found', id: id };
                return { ok: false, reason: 'not-found', id: id, applied: 0, settled: 0 };
            }
            /* 方案从**记录里存的那份清单**复算（池是现收的，不重新扫）：
             *   重新扫会得到「今天的影响面」，而账上那条修复是**当时**按旧清单登记的。 */
            const owners = engine._repairOwners();
            const plan = (Array.isArray(rec.affected) ? rec.affected : []).map(function (it) {
                return {
                    kind: it.kind, key: it.key, basis: it.basis,
                    inverse: (RL.INVERSE && RL.INVERSE[it.kind]) || '',
                };
            });
            const lease = { chatId: engine.getCurrentChatId(), epoch: engine._mutationEpoch };
            const noteOf = (o.notes && typeof o.notes === 'object') ? o.notes : {};
            const allowCandidates = o.allowCandidates === true;
            const results = [];
            let st = state;
            /* 逐项：**先改数据**（owner 面），**再核原数据**（读回来比），**后落盘回读**，
             *   最后带证据 settle。四步的顺序不可换：先 settle 再改，就成了「先声明后动手」。 */
            for (const step of plan) {
                const item = (rec.affected || []).find(function (x) { return x.key === step.key && x.kind === step.kind; });
                if (!item) continue;
                const note = String(noteOf[step.key] || '').slice(0, 80);
                if (step.basis === 'needle' && !allowCandidates) {
                    /* 候选未确认 ⇒ 不动数据、如实落 failed（原因可读、可重试）。 */
                    st = RL.settle(st, {
                        id: id, key: step.key, kind: step.kind, status: 'failed',
                        note: 'candidate-unconfirmed',
                    }).state;
                    results.push({ kind: step.kind, key: step.key, basis: step.basis, status: 'failed', reason: 'candidate-unconfirmed' });
                    continue;
                }
                const fn = step.inverse ? owners[step.kind] : null;
                if (typeof fn !== 'function') {
                    /* 该类**没有**逆操作面 ⇒ 不开放撤销（计划明文），如实落 failed。 */
                    st = RL.settle(st, {
                        id: id, key: step.key, kind: step.kind, status: 'failed', note: 'no-inverse',
                    }).state;
                    results.push({ kind: step.kind, key: step.key, basis: step.basis, status: 'failed', reason: 'no-inverse' });
                    continue;
                }
                let r;
                try { r = fn({ kind: step.kind, key: step.key, note: note }) || {}; }
                catch (e) { errLog(e, 'engine.applyRepairPlan.owner'); r = { ok: false, reason: 'thrown' }; }
                if (!r.ok) {
                    st = RL.settle(st, {
                        id: id, key: step.key, kind: step.kind, status: 'failed', note: String(r.reason || 'failed'),
                    }).state;
                    results.push({ kind: step.kind, key: step.key, basis: step.basis, status: 'failed', reason: String(r.reason || 'failed') });
                    continue;
                }
                applied++;
                /* 原数据核验：**读运行时**那一本账，确认这一项真的变了。
                 *   注意这里读的是**运行时**（不是落盘），落盘由下一步单独证明——
                 *   两步各证一件事，合成一步就会出现「落盘成功」被当成「改对了」。 */
                let originOk = false;
                try { originOk = engine._verifyRepairItem(step.kind, step.key, note) === true; }
                catch (e) { errLog(e, 'engine.applyRepairPlan.verify'); originOk = false; }
                results.push({ kind: step.kind, key: step.key, basis: step.basis, status: 'done', originData: originOk });
                /* 此项的「持久化回读」在**落盘+回读循环之后**统一补 settle（见下），
                 *   否则每项都要存一次盘：N 项就是 N 次全量序列化（本仓代价最高的一步）。 */
            }
            /* 保存 + 回读（一次，覆盖本次全部已改项）。 */
            let persistedSection = null;
            if (typeof engine.storage?.save === 'function' && typeof engine.storage?.load === 'function') {
                try { persisted = (await engine.storage.save(engine.getCurrentChatId(), engine.collectExport())) === true; }
                catch (e) { errLog(e, 'engine.applyRepairPlan.save'); persisted = false; }
                try {
                    const back = await engine.storage.load(engine.getCurrentChatId(), { preserveRuntime: true });
                    persistedSection = (back && back.repairLog) ? back.repairLog : null;
                    readbackOk = (persisted === true && persistedSection !== null);
                } catch (e) { errLog(e, 'engine.applyRepairPlan.load'); readbackOk = false; }
            } else {
                /* 无落盘 / 无回读口 ⇒ `persistedReadback` **不判为真**（也**不判为假**）：
                 *   「没尝试」与「试了失败」不同形，两者都换不来 confirmed。 */
                persisted = null; readbackOk = null;
            }
            /* 逐项落定：done 项按「原数据 + 持久化回读」两条证据给 status/evidence。 */
            for (const res of results) {
                if (res.status !== 'done') continue;
                const originData = res.originData === true;
                const evOk = (readbackOk === true);
                st = RL.settle(st, {
                    id: id, key: res.key, kind: res.kind, status: 'done',
                    note: originData && evOk ? 'verified' : 'unverified',
                    originData: originData, persistedReadback: evOk,
                }).state;
            }
            engine._repairState = st;
            const bad = results.filter(function (x) { return x.status !== 'done'; }).length;
            const stale = !engine._leaseValid(lease);
            const out = {
                ok: bad === 0 && !stale,
                id: id,
                /* 三态读数分开：落了几项 / 核过原数据几项 / 回读证明几项。 */
                applied: applied,
                settled: st.repairs ? (st.repairs.find(function (r) { return r.id === id; }) || {}).status : null,
                evidence: st.repairs ? (st.repairs.find(function (r) { return r.id === id; }) || {}).evidence : null,
                verified: results.filter(function (x) { return x.originData === true; }).length,
                persisted: persisted,
                readback: readbackOk,
                items: results,
                stale: stale,
                reason: stale ? 'epoch-changed' : (bad === 0 ? '' : 'partial-failed'),
            };
            if (stale) engine._leaseDrop(lease, 'repairPlan', -1);
            engine._lastRepairApply = { at: Date.now(), why: out.reason || 'ok', applied: applied, verified: out.verified, readback: readbackOk };
            return out;
        } catch (e) {
            /* 降级返回 null，但**先留一条可查的作废读数**（与 X7 同一处置）：
             *   异常可能发生在「已经落了 N 条」之后，调用方把 null 读成「没成」就会重试，
             *   于是重复落笔。留痕自身必须自兜：登记的失败不得成为新的失败。 */
            try {
                engine._lastRepairApply = { at: Date.now(), why: 'threw', applied: applied, persisted: persisted, readback: readbackOk, err: (e && e.message) || String(e) };
            } catch (_e) { /* 留痕失败就作罢 */ }
            errLog(e, 'engine.applyRepairPlan');
            return null;
        }
    
    }

    /**
    * [v3.295.0 · X2] **原数据核验**（逐类读回运行时，确认这一项真的改了）。
    *
    * 【为什么不能省】`settle(done)` 的语义是「这一处已改」，而它是界面显示
    *   「事实已纠正」的唯一依据。若只凭 owner 函数返回 `ok:true` 就记 done，
    *   那么**owner 面自己说谎**（返回真但没改）与**真的改了**同形 —— 本仓治过
    *   好几轮的「回执与实际相反」。故这里回读那一本账本身。
    *   判据**逐类不同**（每类改法不同，不能一套判据通吃）：
    *     · summary  —— 该楼摘要文字 === 本次写入的文字；
    *     · event    —— 该事件线 `abandoned === true`；
    *     · relation —— 旧边已不在图谱里；
    *     · promise  —— 该约定终态已是 cancelled；
    *     · fact     —— 该事实 `revoked === true`；
    *     · timeline —— 该 id 已不在时间线里。
    * @returns {boolean} 真 = 已核到；假 = 核不到（**不抛**）
    */
    function _verifyRepairItem(engine, kind, key, note) {

        try {
            if (kind === 'summary') {
                const m = String(key || '').match(/(\d+)\s*$/);
                if (!m) return false;
                const fl = Number(m[1]);
                const list = (engine.summary && typeof engine.summary.getActiveSummaries === 'function')
                    ? engine.summary.getActiveSummaries() : (engine.summary?.summaries || []);
                const s = (list || []).find(function (x) { return Number(x.floor) === fl; });
                if (!s) return false;
                const want = String(note || '').trim();
                /* 摘要写入会被 `smartTruncate(t, 2000)` 截断 ⇒ 判据取**前缀**而不是全等：
                 *   全等会在长文本上恒假，变成一条永不成立的判据。 */
                return want !== '' && String(s.text || '').slice(0, want.length) === want;
            }
            if (kind === 'event') {
                const st = engine._eventThreadState;
                const evt = ((st && st.events) || []).find(function (e) { return String(e.id) === String(key); });
                return !!(evt && evt.abandoned === true);
            }
            if (kind === 'relation') {
                const m = String(key || '').match(/^\s*(.+?)\s*->\s*(.+?)\s*$/);
                if (!m) return false;
                const to = String(note || '').trim();
                const g = engine.graph;
                if (!g || !g.edges) return false;
                for (const e of g.edges.values()) {
                    /* 旧边仍在 ⇒ 没改到。 */
                    if (String(e.from) === m[1] && String(e.to) === m[2]) return false;
                }
                if (to && to !== m[2]) {
                    for (const e of g.edges.values()) if (String(e.from) === m[1] && String(e.to) === to) return true;
                }
                return true;
            }
            if (kind === 'promise') {
                const CL = (typeof window !== 'undefined' && window.LonShaCommitmentLedger) || null;
                if (!CL || typeof CL.list !== 'function' || !engine.worldProg) return false;
                const item = (CL.list(engine.worldProg.commitmentLedger, {}) || []).find(function (c) { return String(c.id) === String(key); });
                return !!(item && item.status === 'cancelled');
            }
            if (kind === 'fact') {
                const st = engine._factVersionState;
                const f = ((st && st.facts) || []).find(function (x) { return String(x.id) === String(key); });
                return !!(f && f.revoked === true);
            }
            if (kind === 'timeline') {
                const tl = engine.timeline;
                if (!tl || !Array.isArray(tl.entries)) return false;
                return !tl.entries.some(function (t) { return String(t.id) === String(key); });
            }
            return false;
        } catch (e) { errLog(e, 'engine._verifyRepairItem'); return false; }
    
    }

    /**
    * 派生件池（`requestRepair` 与 `previewRepair` 的**单一真源**）。
    * 从当前运行时现收，**不另存副本**（另存就是第二份真源）。
    * 六个池各自独立 try —— 任一池缺席不影响其余池参与判定。
    */
    /**
    * [v3.295.0 · X2] **池的装配口**（`_repairPool()` 之上再加调用方给的两个判据入参）。
    *
    * 【为什么必须有这一层】模块侧 `affectedBy` 判「确切引用」时读的是池上的
    *   `refId`（被修复对象的**稳定 id**）。若调用方给的 id 到不了池上，
    *   模块只能退化成拿 `target` **文本**去比，而池项自报的引用是 **id**
    *   （`supersededBy` 是事实 id、`eventKey` 是幂等键）——两者永不相遇，
    *   于是 `basis` 恒 'needle'、「按确切引用找影响」在生产上**永不生效**
    *   （实测：全仓 `sourceRefs`/`derivedFrom` 零产出，本仓真实的跨条引用是
    *   `supersededBy`/`eventKey`；见 repair-loop.js 的 refsOf）。
    *   本层就是那条通路：`refId` 有 ⇒ 原样带下去；没有 ⇒ 逐字保持旧行为
    *   （退化为文本命中，ref 不可达）。三个调用点共用**同一份**装配，
    *   免得一处带了 refId、另一处没带，出现「预览是候选、登记是引用」这种漂移。
    */
    function _repairPoolFor(engine, input) {

        const i = input || {};
        const p = engine._repairPool();
        const refId = String(i.refId == null ? '' : i.refId).trim();
        if (refId) p.refId = refId;
        /* 调用方声明的已知引用：只参与**悬空**判定，不参与「是否受影响」（两件事两个出口）。 */
        if (Array.isArray(i.knownRefs)) p.knownRefs = i.knownRefs.slice();
        return p;
    
    }

    function _repairPool(engine) {

        /* [v3.295.0 · X2] 两个新读数，回答「这次判定**看到了多宽的范围**」：
         *   · `info`     —— 每一类**实际扫过多少条 / 真总数多少**。两类各**独立 try**：
         *                  收集成功（哪怕 0 条）⇒ 报 {scanned,total}；收集抛错 ⇒ **不给**该键
         *                  （「判不了」与「真的空」不同形 —— 这正是本模块在别处守的纪律）。
         *   · 截断     —— relations 取前 200、timeline 取末 100，是**既有**的护栏；
         *                  但它此前从未被报出来：于是「扫了 200 条、真的没有」与
         *                  「总共 900 条、只看了 200 条」在 affected 清单上**完全同形**。
         *                  X2 验收要求「报告未覆盖范围」，故把 total 一并读出。
         * 逐类包 try 之外**不再另写一套**判断：模块侧 `affectedBy` 只认这两个读数。 */
        const info = {};
        let summaries = [];
        try {
            const all = (engine.summary?.getActiveSummaries?.() || []);
            summaries = all.map(s => ({ key: 'sum_' + s.floor, text: s.text, floor: s.floor }));
            /* 键名按 **kind（单数）**：模块侧 `affectedBy` 就是按 kind 取的
             *   （`info[kind]`）。此处曾按池键（复数）写，于是截断读数永不触发。 */
            info.summary = { scanned: summaries.length, total: all.length };
        } catch (e) { /* 池可缺 ⇒ 不给 info（判不了） */ }
        let events = [];
        try {
            const all = (engine._eventThreadState?.events || []);
            events = all.map(e => ({ key: e.id, title: e.title }));
            /* 键名按 **kind（单数）**：模块侧 `affectedBy` 就是按 kind 取的
             *   （`info[kind]`）。此处曾按池键（复数）写，于是截断读数永不触发。 */
            info.event = { scanned: events.length, total: all.length };
        } catch (e) { /* 池可缺 */ }
        let relations = [];
        try {
            const all = [...(engine.graph?.edges?.values?.() || [])];
            relations = all.slice(0, 200).map(e => ({ key: e.from + '->' + e.to, text: e.label || '' }));
            /* 键名按 **kind（单数）**：模块侧 `affectedBy` 就是按 kind 取的
             *   （`info[kind]`）。此处曾按池键（复数）写，于是截断读数永不触发。 */
            info.relation = { scanned: relations.length, total: all.length };
        } catch (e) { /* 池可缺 */ }
        let promises = [];
        try {
            const CL = (typeof window !== 'undefined' && window.LonShaCommitmentLedger) || null;
            const all = (CL?.list?.(engine.worldProg?.commitmentLedger, {}) || []);
            promises = all.map(c => ({ key: c.id, content: c.content }));
            /* 键名按 **kind（单数）**：模块侧 `affectedBy` 就是按 kind 取的
             *   （`info[kind]`）。此处曾按池键（复数）写，于是截断读数永不触发。 */
            info.promise = { scanned: promises.length, total: all.length };
        } catch (e) { /* 池可缺 */ }
        let facts = [];
        try {
            const all = ((engine._factVersionState?.facts) || []);
            /* `supersededBy` 必须**原样透出**：它是本仓事实账里唯一真实存在的
             *   跨条引用（换代指向取代它的那条 id）。漏了它，模块侧 `refsOf` 就
             *   收不到任何引用，`basis` 恒 'needle' —— 「按确切引用找影响」于是
             *   在生产上永不生效（本条修前实测就是这个状态）。 */
            facts = all.map(f => ({ key: f.id, text: f.subject + f.predicate + f.value, supersededBy: f.supersededBy }));
            /* 键名按 **kind（单数）**：模块侧 `affectedBy` 就是按 kind 取的
             *   （`info[kind]`）。此处曾按池键（复数）写，于是截断读数永不触发。 */
            info.fact = { scanned: facts.length, total: all.length };
        } catch (e) { /* 池可缺 */ }
        let timeline = [];
        try {
            const all = (engine.timeline?.entries || []);
            timeline = all.slice(-100).map(t => ({ key: t.id || ('tl_' + t.floor), text: t.text }));
            /* 键名按 **kind（单数）**：模块侧 `affectedBy` 就是按 kind 取的
             *   （`info[kind]`）。此处曾按池键（复数）写，于是截断读数永不触发。 */
            info.timeline = { scanned: timeline.length, total: all.length };
        } catch (e) { /* 池可缺 */ }
        return {
            summaries: summaries, events: events, relations: relations,
            promises: promises, facts: facts, timeline: timeline,
            info: info,
        };
    
    }


    return {
        bindDeps: bindDeps,

        requestRepair: requestRepair,
        settleRepair: settleRepair,
        abandonRepair: abandonRepair,
        repairRevision: repairRevision,
        previewRepair: previewRepair,
        _repairOwners: _repairOwners,
        _correctionOwners: _correctionOwners,
        _verifyCorrectionItem: _verifyCorrectionItem,
        applyCorrectionPlan: applyCorrectionPlan,
        undoCorrection: undoCorrection,
        memoryCenterRevoke: memoryCenterRevoke,
        memoryCenterSaveQuery: memoryCenterSaveQuery,
        _memoryCenterStateWithSaved: _memoryCenterStateWithSaved,
        correctionSourceFacts: correctionSourceFacts,
        correctionReextractFacts: correctionReextractFacts,
        applyRepairPlan: applyRepairPlan,
        _verifyRepairItem: _verifyRepairItem,
        _repairPoolFor: _repairPoolFor,
        _repairPool: _repairPool,
    };
}));
