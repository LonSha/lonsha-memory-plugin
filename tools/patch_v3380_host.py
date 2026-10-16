#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.338.0 · M4-O8 宿主侧补丁：纠错方案 → 原生写入 / 撤销。

锚点：`_repairOwners()` 的收尾（`时间线条目已摘除` 那条 return 之后）。
插入四个成员：_correctionOwners / _verifyCorrectionItem / applyCorrectionPlan / undoCorrection。
"""
import io, sys, ast

P = 'index.js'
src = io.open(P, encoding='utf-8').read()

ANCHOR = "                    return { ok: true, note: '时间线条目已摘除' };\n                },\n            };\n        }\n"

NEW = ANCHOR + r'''        /* ────────────────────────────────────────────────────────────────
         * [v3.338.0 · M4-O8] 纠错方案 → 原生确认 / 写入 / 撤销
         *
         * 【补的是哪一格】`correction-plan.js` 两面已能算「改哪儿、跟原文逐条对上了没有」，
         *   且 writes 恒 0；宿主有六类派生件的真实写口（`_repairOwners()`）与逐项落笔通道
         *   （`applyRepairPlan`）。缺口在**中间那一段**：没有一条把「用户在界面上圈范围 →
         *   看新旧对照 → 逐项确认」接到「真落笔 → 回读核验 → 分别撤销」的路。
         *   于是提案面永远停在提案面（计划原文：不以 returns.writes=0 证明「已修复」）。
         *
         * 【三条纪律】
         *   ① **不建第三套状态机**：落笔走 fact-version 既有写面（`assertFact` / `revokeFact`），
         *      核验读**本行真账**，落盘回读走既有 `storage.save/load`，代际栅栏走既有 `_leaseValid`；
         *      撤销凭据是**一次落笔的流水**（journal），不是第二套 repair 状态。
         *   ② **未选范围不落笔**：`plan.scoped !== true` ⇒ 直接拒，一个字节不改；
         *      `decision !== 'selected'` 的项**一条都不落**。
         *   ③ **配置撤销与事实撤销分成两个 token**：`configUndo` 只回配置、`factUndo` 只回事实。
         * ──────────────────────────────────────────────────────────────── */
        _correctionOwners() {
            const self = this;
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
        _verifyCorrectionItem(kind, item) {
            try {
                const FV = _factVersionLib();
                if (!FV || typeof FV.normalize !== 'function' || !this._factVersionState) return false;
                const st = FV.normalize(this._factVersionState);
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
        async applyCorrectionPlan(opts = {}) {
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
                const lease = { chatId: this.getCurrentChatId(), epoch: this._mutationEpoch };
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
                const owners = this._correctionOwners();
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
                    const originOk = this._verifyCorrectionItem('fact', { id: r.id });
                    results.push({ key: it.key, floor: it.floor, outcome: it.outcome, status: 'done',
                        id: r.id, replayed: r.replayed === true, originData: originOk });
                }
                /* 配置面（可选）：确认一项参数变更并记旧值（**与事实分账**）。 */
                if (o.configFix && typeof o.configFix === 'object' && o.configFix.key) {
                    const ck = String(o.configFix.key);
                    const cfg = this.config && this.config.config;
                    if (cfg && Object.prototype.hasOwnProperty.call(cfg, ck)) {
                        journal.config = { key: ck, before: cfg[ck], after: o.configFix.value };
                        cfg[ck] = o.configFix.value;
                        try { if (typeof this.config.saveConfig === 'function') this.config.saveConfig(); }
                        catch (e) { errLog(e, 'engine.applyCorrectionPlan.saveConfig'); }
                    }
                }
                /* ③ 落盘 + 回读（一次，覆盖本批全部已改项）。 */
                if (typeof this.storage?.save === 'function' && typeof this.storage?.load === 'function') {
                    try { persisted = (await this.storage.save(this.getCurrentChatId(), this.collectExport())) === true; }
                    catch (e) { errLog(e, 'engine.applyCorrectionPlan.save'); persisted = false; }
                    try {
                        const back = await this.storage.load(this.getCurrentChatId(), { preserveRuntime: true });
                        const backOk = !!(back && back.factVersions && Array.isArray(back.factVersions.facts));
                        readbackOk = (persisted === true && backOk);
                    } catch (e) { errLog(e, 'engine.applyCorrectionPlan.load'); readbackOk = false; }
                } else {
                    /* 无落盘 / 无回读口 ⇒ **不判为真也不判为假**（「没尝试」与「试了失败」不同形）。 */
                    persisted = null; readbackOk = null;
                }
                const stale = !this._leaseValid(lease);
                if (stale) this._leaseDrop(lease, 'correctionPlan', -1);
                const verified = results.filter(function (x) { return x.originData === true; }).length;
                const bad = results.filter(function (x) { return x.status !== 'done'; }).length;
                this._correctionJournal = journal;
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
                this._lastCorrectionApply = { at: Date.now(), why: out.reason || 'ok', applied: applied, verified: verified, readback: readbackOk };
                return out;
            } catch (e) {
                /* 降级返回 null，但**先留一条可查的作废读数**（与 X2 同一处置）：异常可能发生在
                 * 「已经落了 N 条」之后，调用方把 null 读成「没成」就会重试，于是重复落笔。 */
                try {
                    this._lastCorrectionApply = { at: Date.now(), why: 'threw', applied: applied, persisted: persisted, readback: readbackOk, err: (e && e.message) || String(e) };
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
        undoCorrection(opts = {}) {
            const o = opts || {};
            const kind = String(o.kind || '');
            const token = String(o.token || '');
            const base = { ok: false, reason: '', kind: kind, token: token,
                touchedFacts: false, touchedConfig: false, reverted: 0, at: Date.now() };
            try {
                const j = this._correctionJournal;
                if (!j) return Object.assign(base, { reason: 'no-journal' });
                if (kind === 'fact') {
                    if (token && token !== j.factToken) return Object.assign(base, { reason: 'token-mismatch' });
                    const FV = _factVersionLib();
                    if (!FV || typeof FV.revokeFact !== 'function') return Object.assign(base, { reason: 'no-organ' });
                    let st = FV.normalize(this._factVersionState || null);
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
                    this._factVersionState = st;
                    return Object.assign(base, { ok: true, touchedFacts: true, reverted: n });
                }
                if (kind === 'config') {
                    if (token && token !== j.configToken) return Object.assign(base, { reason: 'token-mismatch' });
                    if (!j.config) return Object.assign(base, { reason: 'no-config-change' });
                    const cfg = this.config && this.config.config;
                    if (!cfg) return Object.assign(base, { reason: 'no-config' });
                    cfg[j.config.key] = j.config.before;
                    try { if (typeof this.config.saveConfig === 'function') this.config.saveConfig(); }
                    catch (e) { errLog(e, 'engine.undoCorrection.saveConfig'); }
                    return Object.assign(base, { ok: true, touchedConfig: true, reverted: 1 });
                }
                return Object.assign(base, { reason: 'unknown-kind' });
            } catch (e) { errLog(e, 'engine.undoCorrection'); return Object.assign(base, { reason: 'thrown' }); }
        }
'''

if '_correctionOwners' in src:
    print('host already patched (idempotent skip)')
    sys.exit(0)
n = src.count(ANCHOR)
if n != 1:
    sys.stderr.write('ANCHOR count=%d (须恰 1)\n' % n)
    sys.exit(1)
out = src.replace(ANCHOR, NEW, 1)
io.open(P, 'w', encoding='utf-8').write(out)
print('OK host patched, bytes %d -> %d' % (len(src), len(out)))
