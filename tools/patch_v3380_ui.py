#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.338.0 · M4-O8 第二刀：
  ① 宿主数据源两出口（correctionSourceFacts / correctionReextractFacts）—— 面板取数用，
     缺席如实报（**不编数据**）；
  ② settings-ui 侧 `plugin._memoryCenterHandlers` 生产方 + 纠错面板（原生确认 / 写入 / 撤销）。
"""
import io, sys

# ─────────── ① index.js ───────────
P = 'index.js'
src = io.open(P, encoding='utf-8').read()

ANCHOR = "            } catch (e) { errLog(e, 'engine.undoCorrection'); return Object.assign(base, { reason: 'thrown' }); }\n        }\n"

NEW = ANCHOR + r'''        /**
         * [v3.338.0 · M4-O8] **面板取数口 A**：按范围取「账上已有的」事实（对照的 before 侧）。
         *   为什么由宿主取而不是面板自己翻账：面板拿到 `_factVersionState` 就是第二份证据库，
         *   且它一旦缓存，原账一改它就成旧读数冒充现读数（M3-O8 已立此纪律）。
         *   范围判不了（未圈 / 颠倒 / 端点读不到）⇒ `ok:false` 并给具名 reason，
         *   **绝不退回全量**（「没圈范围」不等于「全选」）。
         * @returns {{ok:boolean, reason:string, range:object|null, facts:Array}}
         */
        correctionSourceFacts(range) {
            const out = { ok: false, reason: '', range: null, facts: [] };
            try {
                const CP = _correctionPlanLib();
                const FV = _factVersionLib();
                if (!CP || typeof CP.floorRange !== 'function') { out.reason = 'module-unavailable'; return out; }
                if (!FV || typeof FV.normalize !== 'function') { out.reason = 'no-organ'; return out; }
                const sc = CP.floorRange(range);
                out.range = sc;
                if (sc.scoped !== true || sc.known !== true) { out.reason = sc.reason || 'unscoped'; return out; }
                const st = FV.normalize(this._factVersionState || { version: 1, seq: 0, facts: [] });
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
        correctionReextractFacts(opts = {}) {
            const o = opts || {};
            const out = { ok: false, reason: '', facts: [], source: '' };
            try {
                /* 夹具通道：显式给了就原样用（来源如实标 fixture，不冒充模型产出）。 */
                if (Array.isArray(o.newFacts)) {
                    out.ok = true; out.facts = o.newFacts; out.source = 'fixture';
                    return out;
                }
                const eng = this;
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
'''

if 'correctionSourceFacts' not in src:
    n = src.count(ANCHOR)
    if n != 1:
        sys.stderr.write('HOST ANCHOR count=%d (须恰 1)\n' % n); sys.exit(1)
    src = src.replace(ANCHOR, NEW, 1)
    io.open(P, 'w', encoding='utf-8').write(src)
    print('OK host data-source patched')
else:
    print('host data-source already patched (idempotent skip)')

# ─────────── ② settings-ui.js ───────────
U = 'settings-ui.js'
usrc = io.open(U, encoding='utf-8').read()

UANCHOR = "        // [v3.38] 人工干预撤销栈与撤销方法（Event Sourcing Audit Trail）\n        plugin._auditStack = [];\n"

UNEW = r'''        /* ────────────────────────────────────────────────────────────────
         * [v3.338.0 · M4-O8] 记忆控制中心**处置类动作的生产方**（`_memoryCenterHandlers`）。
         *
         * 【为什么此前是空的】内核 `memory-center.js` 声明了 9 个动作、面板也把点击转给了
         *   `plugin._memoryCenterHandlers`，但这个映射**全仓零定义** —— 于是每个按钮都走
         *   「该动作未接」分支。声明面与执行面之间缺的正是这一段（本仓治理过多轮的
         *   「出口齐全、正常会话不供数」）。
         *
         * 【本块只做三件事，一行账都不自己算】
         *   ① 收集用户在面板上圈的范围与逐项勾选；
         *   ② 把「提案 / 落笔 / 撤销」三件交给**宿主公开出口**
         *      （`correctionPlanReextract` / `applyCorrectionPlan` / `undoCorrection`）；
         *   ③ 把回执**原样**显示（applied / verified / readback 三态分开，不合并成一格）。
         *   范围与条件归一在内核、落笔在 owner —— 面板重写一次就会出现第二套口径。
         * ──────────────────────────────────────────────────────────────── */
        plugin._memoryCenterHandlers = plugin._memoryCenterHandlers || {};
        /** 纠错面板：圈范围 → 提案 → 逐项选/拒 → 确认落笔 → 分别撤销。 */
        plugin.showCorrectionPanel = function (seed) {
            const self = this;
            const s = this.engine;
            const sd = (seed && typeof seed === 'object') ? seed : {};
            const esc2 = (t) => String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            /* 面板**不自持提案**：每次重跑都现取（缓存一份提案就是第二份证据库）。 */
            let last = null;
            const body = `
                <div class="ls-hint">本面板走的是**原生出口**：圈定范围 → 看新旧对照 → 逐项选/拒 → 确认落笔。
                未圈范围不产提案；未选中的项**一个字节不动**；撤配置与撤事实是两个 token。</div>
                <div class="ls-row"><div><div>楼层范围</div><div class="ls-hint">起点与终点都填（或只填起点＝单楼）</div></div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input class="ls-input" id="ls-cp-from" style="width:70px" placeholder="from" value="${sd.from != null ? esc2(sd.from) : ''}">
                        <span>~</span>
                        <input class="ls-input" id="ls-cp-to" style="width:70px" placeholder="to" value="${sd.to != null ? esc2(sd.to) : ''}">
                    </div></div>
                <div style="display:flex;gap:8px;margin:8px 0;">
                    <div class="ls-btn ls-btn-primary" id="ls-cp-plan">① 生成提案（不落笔）</div>
                    <div class="ls-btn" id="ls-cp-apply" style="opacity:0.5;pointer-events:none;">② 确认执行</div>
                </div>
                <div id="ls-cp-out"></div>
                <div id="ls-cp-undo"></div>
            `;
            const ov = makeSheet('lonsha-correction-sheet', '🛠 纠错方案（原生确认 / 写入 / 撤销）', body);
            const out = ov.querySelector('#ls-cp-out');
            const undoBox = ov.querySelector('#ls-cp-undo');
            const applyBtn = ov.querySelector('#ls-cp-apply');
            const rangeOf = () => {
                const f = String(ov.querySelector('#ls-cp-from').value || '').trim();
                const t = String(ov.querySelector('#ls-cp-to').value || '').trim();
                if (f === '' && t === '') return null;
                if (f !== '' && t === '') return Number(f);
                return { from: Number(f), to: Number(t) };
            };
            const picks = new Map();
            const render = (plan) => {
                last = plan;
                if (!plan || plan.ok !== true) {
                    out.innerHTML = '<div class="ls-hint" style="color:var(--ls-warn,#d29922);">⚠️ '
                        + esc2('提案不可用：' + ((plan && plan.reason) || 'unknown')) + '</div>';
                    return;
                }
                if (plan.scoped !== true) {
                    out.innerHTML = '<div class="ls-hint" style="color:var(--ls-warn,#d29922);">⚠️ 范围未圈定（'
                        + esc2(plan.scope && plan.scope.reason) + '）⇒ **不产全量提案**：'
                        + esc2(plan.why) + '</div>';
                    return;
                }
                const rows = (plan.items || []).map((it) => {
                    const d = picks.has(it.key) ? picks.get(it.key) : it.decision;
                    const b4 = it.before ? esc2(it.before.value) : '（无）';
                    return '<div class="ls-item" data-cpkey="' + esc2(it.key) + '">'
                        + '<div class="ls-item-meta">' + esc2(it.outcome) + ' · 楼层 ' + esc2(it.floor == null ? '—' : it.floor)
                        + ' · ' + esc2(it.key) + (it.evidenceComplete ? '' : ' · ⚠️ 出处不全') + '</div>'
                        + '<div class="ls-item-text">改前：' + b4 + '　→　改后：' + esc2(it.after && it.after.value) + '</div>'
                        + '<div class="ls-mc-actions">'
                        + '<button class="ls-btn' + (d === 'selected' ? ' ls-btn-primary' : '') + '" data-cppick="selected">选</button>'
                        + '<button class="ls-btn' + (d === 'rejected' ? ' ls-btn-danger' : '') + '" data-cppick="rejected">拒</button>'
                        + '</div></div>';
                }).join('');
                const st = plan.staged || { proposed: 0, selected: 0, rejected: 0 };
                out.innerHTML = '<div class="ls-hint">范围 ' + esc2(plan.scope.from) + '~' + esc2(plan.scope.to)
                    + ' · 对照四态 新增 ' + (plan.byOutcome.added || 0) + ' / 保留 ' + (plan.byOutcome.kept || 0)
                    + ' / 替换 ' + (plan.byOutcome.replaced || 0) + ' / 冲突 ' + (plan.byOutcome.conflicted || 0)
                    + ' · 暂存 选 ' + st.selected + ' 拒 ' + st.rejected + ' 待定 ' + st.proposed
                    + '（未选范围 ' + plan.untouched + ' 条不动）</div>' + rows;
                out.querySelectorAll('[data-cppick]').forEach((b) => b.addEventListener('click', () => {
                    const key = b.closest('[data-cpkey]').dataset.cpkey;
                    picks.set(key, b.dataset.cppick);
                    render(last);
                }));
                const nSel = (plan.items || []).filter((it) => (picks.has(it.key) ? picks.get(it.key) : it.decision) === 'selected').length;
                applyBtn.style.opacity = nSel ? '1' : '0.5';
                applyBtn.style.pointerEvents = nSel ? 'auto' : 'none';
            };
            ov.querySelector('#ls-cp-plan').addEventListener('click', () => {
                const rng = rangeOf();
                const src = (typeof s.correctionSourceFacts === 'function') ? s.correctionSourceFacts(rng) : { ok: false, reason: 'host-absent', facts: [] };
                const nf = (typeof s.correctionReextractFacts === 'function') ? s.correctionReextractFacts({ range: rng, newFacts: sd.newFacts }) : { ok: false, reason: 'host-absent', facts: [] };
                if (nf.ok !== true) {
                    out.innerHTML = '<div class="ls-hint" style="color:var(--ls-warn,#d29922);">⚠️ 取不到新提取结果（'
                        + esc2(nf.reason) + '）—— **不拿旧账冒充新结果**。夹具可经 newFacts 直给。</div>';
                    return;
                }
                picks.clear();
                const plan = s.correctionPlanReextract({
                    range: rng, oldFacts: src.facts, newFacts: nf.facts,
                    selections: []
                }, {});
                render(plan);
            });
            applyBtn.addEventListener('click', async () => {
                if (!last || last.scoped !== true) { toast('先圈范围并生成提案'); return; }
                const rng = rangeOf();
                const src = (typeof s.correctionSourceFacts === 'function') ? s.correctionSourceFacts(rng) : { ok: false, facts: [] };
                const nf = (typeof s.correctionReextractFacts === 'function') ? s.correctionReextractFacts({ range: rng, newFacts: sd.newFacts }) : { ok: false, facts: [] };
                const sel = (last.items || []).map((it) => ({ key: it.key, decision: picks.has(it.key) ? picks.get(it.key) : it.decision }));
                toast('落笔中…');
                const r = await s.applyCorrectionPlan({
                    range: rng, oldFacts: src.facts, newFacts: nf.facts, selections: sel
                });
                if (!r) { toast('落笔降级（模块缺席 / 异常）'); return; }
                out.innerHTML = '<div class="ls-hint">回执：' + esc2(r.ok ? '✅ 完成' : ('⚠️ ' + (r.reason || '部分失败')))
                    + ' · 选中 ' + r.selected + ' 拒 ' + r.rejected
                    + ' · 落笔 ' + r.applied + ' 项 / 核到原数据 ' + r.verified + ' 项'
                    + ' · 落盘回读 ' + (r.readback === true ? '真' : (r.readback === false ? '假' : '**没尝试**'))
                    + (r.stale ? ' · ⚠️ 代际已变（本批作废）' : '') + '</div>'
                    + (r.items || []).map((x) => '<div class="ls-item"><div class="ls-item-meta">' + esc2(x.outcome)
                        + ' · ' + esc2(x.status) + (x.reason ? ' · ' + esc2(x.reason) : '')
                        + (x.replayed ? ' · 幂等命中（未重复落）' : '') + '</div></div>').join('');
                const u = r.undo || {};
                const btns = [];
                if (u.factUndo) btns.push('<div class="ls-btn ls-btn-danger" data-cpundo="fact" data-token="' + esc2(u.factUndo.token) + '">↺ 撤销本次事实变更</div>');
                if (u.configUndo) btns.push('<div class="ls-btn ls-btn-danger" data-cpundo="config" data-token="' + esc2(u.configUndo.token) + '">↺ 撤销本次配置变更</div>');
                undoBox.innerHTML = btns.length
                    ? '<div class="ls-hint">两路撤销**分开**：' + esc2(u.note || '') + '</div><div style="display:flex;gap:8px;">' + btns.join('') + '</div>'
                    : '<div class="ls-hint">本次无可撤销项（没落新条目）。</div>';
                undoBox.querySelectorAll('[data-cpundo]').forEach((b) => b.addEventListener('click', async () => {
                    const ur = s.undoCorrection({ kind: b.dataset.cpundo, token: b.dataset.token });
                    const ok = ur && ur.ok === true;
                    toast(ok ? ('↺ 已撤销 ' + ur.reverted + ' 项') : ('撤销失败：' + ((ur && ur.reason) || 'unknown')));
                    if (ok) {
                        const persistedOk = await self._memPersist();
                        if (!persistedOk) toast('撤销已生效但存盘失败', false);
                        undoBox.innerHTML = '<div class="ls-hint">已撤销 ' + ur.reverted + ' 项（'
                            + (ur.touchedFacts ? '事实' : '配置') + '面；另一面**未被触碰**）。</div>';
                    }
                }));
            });
        };
        plugin._memoryCenterHandlers['row.repair.preview'] = function (ctx) {
            const ref = String((ctx && ctx.ref) || '');
            const floor = /:(\d+)$/.exec(ref);
            return this.showCorrectionPanel(floor ? { from: Number(floor[1]), to: Number(floor[1]) } : {});
        };
        plugin._memoryCenterHandlers['row.detail'] = function (ctx) {
            const ref = String((ctx && ctx.ref) || '');
            const face = (typeof this.engine?.memoryCenterView === 'function')
                ? this.engine.memoryCenterView(this._memoryCenterState || null, { detail: ref }) : null;
            const d = (face && face.detailFace) ? face.detailFace : null;
            if (!d) { toast('该条取不到详情'); return; }
            toast('详情：' + (d.textChannel || 'projection') + '（' + String(d.text || '').slice(0, 24) + '…）');
        };
        plugin._memoryCenterHandlers['row.revoke'] = function (ctx) {
            /* 单条撤回**也走同一份事实账写面**（不另开一条撤回语义）。 */
            const ref = String((ctx && ctx.ref) || '');
            const id = ref.indexOf(':') >= 0 ? ref.slice(ref.indexOf(':') + 1) : ref;
            if (!id) { toast('该条没有可撤回的 id'); return; }
            const eng = this.engine;
            if (!eng || typeof eng.undoCorrection !== 'function') { toast('宿主未接撤回出口'); return; }
            eng._correctionJournal = { at: Date.now(), epoch: eng._mutationEpoch, chatId: eng.getCurrentChatId(),
                factToken: 'undo:fact:manual', configToken: 'undo:config:manual',
                fact: { landed: [id], superseded: [] }, config: null };
            const r = eng.undoCorrection({ kind: 'fact', token: 'undo:fact:manual' });
            toast(r && r.ok ? '↺ 已撤回该条' : ('撤回失败：' + ((r && r.reason) || 'unknown')));
        };
        plugin._memoryCenterHandlers['row.export'] = function (ctx) {
            const ref = String((ctx && ctx.ref) || '');
            if (!ref) { toast('该条没有引用键'); return; }
            toast('已复制引用键：' + ref);
        };
        plugin._memoryCenterHandlers['query.save'] = function () {
            const b = (typeof this.engine?.memoryCenterSave === 'function') ? this.engine.memoryCenterSave(this._memoryCenterState || null) : null;
            if (!b) { toast('保存条件失败（内核不可达）'); return; }
            this._memoryCenterSaved = b;
            toast('已保存查询**条件**（不是第二份结果）');
        };
        plugin._memoryCenterHandlers['saved.remove'] = function (ctx) {
            const key = String((ctx && ctx.ref) || '');
            const st = this._memoryCenterState || {};
            if (Array.isArray(st.saved)) st.saved = st.saved.filter((x) => String(x && x.replayKey) !== key);
            toast('已删除该条件');
        };
        plugin._memoryCenterHandlers['saved.replay'] = function (ctx) {
            const key = String((ctx && ctx.ref) || '');
            const st = this._memoryCenterState || {};
            const hit = (Array.isArray(st.saved) ? st.saved : []).filter((x) => String(x && x.replayKey) === key)[0];
            if (!hit) { toast('该条件不在保存列表里'); return; }
            st.spec = hit.spec;
            toast('已回放该条件');
        };
        // [v3.38] 人工干预撤销栈与撤销方法（Event Sourcing Audit Trail）
        plugin._auditStack = [];
'''

if "_memoryCenterHandlers['row.detail']" in usrc:
    print('ui already patched (idempotent skip)')
    sys.exit(0)
un = usrc.count(UANCHOR)
if un != 1:
    sys.stderr.write('UI ANCHOR count=%d (须恰 1)\n' % un); sys.exit(1)
usrc = usrc.replace(UANCHOR, UNEW, 1)
io.open(U, 'w', encoding='utf-8').write(usrc)
print('OK settings-ui patched')