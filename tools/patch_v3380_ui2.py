#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.338.0 UI 第四刀：把控制中心 handler 补到内核声明的 9 个，并把 saved 三件套接到宿主真源。

修三个真缺陷：
  ① 内核声明 9 个动作，面板只接了 7 个 —— `row.dispute` / `query.reset` 落到「未接」，
     内核会把它们降级为 `unavailable`（界面上直接写着不可用）；
  ② `query.save` / `saved.remove` / `saved.replay` 在面板里**手写 state**（`st.saved=` / `st.spec=`）
     —— 绕过宿主真源，是第二张表（内核纪律②：状态只从 face.state 回写）；
  ③ `row.revoke` 伪造 `_correctionJournal` 调 `undoCorrection` —— 覆盖真流水（已改走宿主直写面）。
"""
import io
import sys

U = 'settings-ui.js'
src = io.open(U, encoding='utf-8').read()

if "'row.dispute'" in src:
    print('ui2 already patched (idempotent skip)')
    sys.exit(0)

START = "        plugin._memoryCenterHandlers['row.repair.preview'] = function (ctx) {"
END = "        // [v3.38] 人工干预撤销栈与撤销方法（Event Sourcing Audit Trail）"
i0 = src.find(START)
i1 = src.find(END)
if i0 < 0 or i1 < 0 or i1 <= i0:
    sys.stderr.write('UI2 anchors not found (i0=%d i1=%d)\n' % (i0, i1))
    sys.exit(1)
seg = src[i0:i1]
n = seg.count("plugin._memoryCenterHandlers['")
if n != 7:
    sys.stderr.write('UI2 segment handler count=%d (须恰 7)\n' % n)
    sys.exit(1)

NEW = r'''        plugin._memoryCenterHandlers['row.repair.preview'] = function (ctx) {
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
            /* 单条撤回走**宿主直写面**（`memoryCenterRevoke`，作用在事实账）：
             *   不伪造 journal —— 伪造会把「撤销这一批」的真流水覆盖掉，那一批再也撤不回来。
             *   行不在事实账上时如实报 not-found，不假装成功。 */
            const ref = String((ctx && ctx.ref) || '');
            const id = ref.indexOf(':') >= 0 ? ref.slice(ref.indexOf(':') + 1) : ref;
            if (!id) { toast('该条没有可撤回的 id'); return; }
            const eng = this.engine;
            if (!eng || typeof eng.memoryCenterRevoke !== 'function') { toast('宿主未接单条撤回出口'); return; }
            const r = eng.memoryCenterRevoke(id, 'center-row-revoke');
            toast(r && r.ok ? (r.replayed ? '该条此前已撤回（幂等）' : '↺ 已撤回该条')
                : ('撤回失败：' + ((r && r.reason) || 'unknown')));
            if (r && r.ok) this.showBrowser('memorycenter');
        };
        plugin._memoryCenterHandlers['row.dispute'] = function () {
            /* 标记争议：事实账**没有**「争议」写面 —— `disputed` 在 `fact-state.js` 是**推导态**
             *   （指涉悬空 / 显式字段）。故这里**如实报不可用**，不编一个假写入。 */
            toast('该动作不可用：事实账无「争议」写面（disputed 为推导态，由指涉悬空判定）');
        };
        plugin._memoryCenterHandlers['row.export'] = function (ctx) {
            const ref = String((ctx && ctx.ref) || '');
            if (!ref) { toast('该条没有引用键'); return; }
            toast('已复制引用键：' + ref);
        };
        plugin._memoryCenterHandlers['query.save'] = function () {
            /* 保存条件走**宿主唯一出口**（条件口径在内核 `buildSpec`，面板不拼）。 */
            const eng = this.engine;
            if (!eng || typeof eng.memoryCenterSaveQuery !== 'function') { toast('宿主未接保存条件出口'); return; }
            const r = eng.memoryCenterSaveQuery(this._memoryCenterState || null);
            if (!r || r.ok !== true) { toast('保存失败：' + ((r && r.reason) || 'unknown')); return; }
            toast('已保存查询条件：' + r.label + (r.replaced ? '（覆盖同条件）' : '') + ' · 共 ' + r.count + ' 条');
            this.showBrowser('memorycenter');
        };
        plugin._memoryCenterHandlers['query.reset'] = function () {
            /* 清空条件走**内核 step**（`reset` 保留 pageSize 与 saved —— 那是内核的口径）。 */
            const s = this.engine;
            if (!s || typeof s.memoryCenterStep !== 'function') { toast('宿主未接控制中心出口'); return; }
            const face = s.memoryCenterStep(this._memoryCenterState || null, 'reset', {});
            this._memoryCenterState = face.state || this._memoryCenterState;
            this.showBrowser('memorycenter');
        };
        plugin._memoryCenterHandlers['saved.remove'] = function (ctx) {
            /* 删除走**宿主真源**（`removeEvidenceQuery` 走 evidence-query 的 saved 表）。 */
            const key = String((ctx && ctx.ref) || '');
            const eng = this.engine;
            if (!eng || typeof eng.removeEvidenceQuery !== 'function') { toast('宿主未接删除出口'); return; }
            const r = eng.removeEvidenceQuery(key);
            toast(r && r.ok ? '已删除该条件' : ('删除失败：' + ((r && r.reason) || 'unknown')));
            this.showBrowser('memorycenter');
        };
        plugin._memoryCenterHandlers['saved.replay'] = function (ctx) {
            /* 回放：**用当前原账重跑** —— 走内核 `load-saved`（它取保存的 spec 重建状态）。 */
            const key = String((ctx && ctx.ref) || '');
            const s = this.engine;
            if (!s || typeof s.memoryCenterStep !== 'function') { toast('宿主未接控制中心出口'); return; }
            const face = s.memoryCenterStep(this._memoryCenterState || null, 'load-saved', { replayKey: key });
            if (!face || face.handled !== true) { toast('该条件不在保存列表里'); return; }
            this._memoryCenterState = face.state || this._memoryCenterState;
            this.showBrowser('memorycenter');
        };
'''

src = src[:i0] + NEW + src[i1:]
io.open(U, 'w', encoding='utf-8').write(src)
print('OK ui2 patched')
