#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.338.0 宿主第三刀：把控制中心的「单条撤回 / 保存条件 / 保存表真源」接到真写面。

修三个真缺陷：
  ① row.revoke 此前伪造 _correctionJournal 调 undoCorrection —— 覆盖真流水，那一批再也撤不回来；
  ② query.save / saved.remove / saved.replay 在面板里手写 state.saved —— 绕过宿主真源，是第二张表；
  ③ state.saved 与 _evidenceSavedQueries **零同步** —— 保存了看不到、看不到却删不掉。
"""
import ast
import io
import sys

P = 'index.js'
src = io.open(P, encoding='utf-8').read()

if '_memoryCenterStateWithSaved' in src:
    print('host2 already patched (idempotent skip)')
    sys.exit(0)

# ── ① 新出口：单条撤回真写面 / 保存条件唯一出口 / saved 真源注入 ──
A1 = ("                return Object.assign(base, { reason: 'unknown-kind' });\n"
      "            } catch (e) { errLog(e, 'engine.undoCorrection'); return Object.assign(base, { reason: 'thrown' }); }\n"
      "        }\n")
N1 = A1 + r'''        /**
         * [v3.338.0 · M4-O8] 控制中心**单条撤回**的真写面（不借道「撤销本批落笔」）。
         *   为什么单开一个出口：`undoCorrection` 的语义是「撤销**这一批**刚落的笔」
         *   （它按 `_correctionJournal` 走）。拿它来撤回一条历史条目就得伪造一份 journal，
         *   而伪造 journal 会把真流水**覆盖掉** —— 那一批从此撤不回来（本仓最贵的一类账）。
         *   本出口直走 fact-version 的 `revokeFact`（既有写面，不新造语义），不碰 journal。
         * @returns {{ok:boolean, reason:string, replayed:boolean, id:string}}
         */
        memoryCenterRevoke(id, note) {
            const out = { ok: false, reason: '', replayed: false, id: String(id == null ? '' : id) };
            try {
                const FV = _factVersionLib();
                if (!FV || typeof FV.revokeFact !== 'function' || typeof FV.normalize !== 'function') { out.reason = 'no-organ'; return out; }
                if (!out.id) { out.reason = 'missing-id'; return out; }
                const r = FV.revokeFact(FV.normalize(this._factVersionState || null), { id: out.id, reason: String(note || 'manual-revoke') });
                if (!r || !r.ok) { out.reason = (r && r.reason) || 'failed'; return out; }
                this._factVersionState = r.state;
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
        memoryCenterSaveQuery(state) {
            const out = { ok: false, reason: '', label: '', replayKey: '', replaced: false, dropped: 0, count: this.evidenceSavedQueries().length };
            try {
                const C = _memoryCenterLib();
                const Q = _evidenceQueryLib();
                if (!C || typeof C.buildSpec !== 'function' || !Q || typeof Q.upsertSaved !== 'function') { out.reason = 'module-unavailable'; return out; }
                const spec = C.buildSpec(state);
                const label = (typeof C.specLine === 'function') ? String(C.specLine(spec)).slice(0, 40) : '';
                const cur = Array.isArray(this._evidenceSavedQueries) ? this._evidenceSavedQueries : [];
                const r = Q.upsertSaved(cur, { label: label, spec: spec }, Date.now());
                this._evidenceSavedQueries = r.list;
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
        _memoryCenterStateWithSaved(state) {
            const st = (state && typeof state === 'object') ? Object.assign({}, state) : {};
            st.saved = this.evidenceSavedQueries();
            return st;
        }
'''

# ── ② view / step 的 state 过注入点 ──
A2 = 'const face = C.dispatch(this.memoryCenterDeps(), state, {'
N2 = 'const face = C.dispatch(this.memoryCenterDeps(), this._memoryCenterStateWithSaved(state), {'
A3 = 'const face = C.step(this.memoryCenterDeps(), state, action, payload, {'
N3 = 'const face = C.step(this.memoryCenterDeps(), this._memoryCenterStateWithSaved(state), action, payload, {'

for tag, a, n in (('A1', A1, N1), ('A2', A2, N2), ('A3', A3, N3)):
    c = src.count(a)
    if c != 1:
        sys.stderr.write('%s count=%d (须恰 1)\n' % (tag, c)); sys.exit(1)
    src = src.replace(a, n, 1)

ast.parse(src) if False else None
io.open(P, 'w', encoding='utf-8').write(src)
print('OK host2 patched')
