#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.341.0 M4-X2 宿主刀：成稿面接线 + 草稿册持久化（新键 annualDrafts）。

口径：
  · 每个锚点**必须恰中 1 次**（0 次 / 多次一律退出，不写半成品）；
  · 新键 `annualDrafts` 四处契约一次补齐（存档键 / 豁免表 / 导出 / 还原）+ 清空面；
    缺一处就是 v3.340.0 在 v3236 D1 上照出过的「恢复面有、清空面没有」。
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
IDX = ROOT + 'index.js'
ORG = ROOT + 'memory-organs.js'
BAK = '/tmp/bak3410/'

idx = io.open(IDX, encoding='utf-8').read()
org = io.open(ORG, encoding='utf-8').read()
if 'annualDrafts' in idx:
    sys.stderr.write('FAIL: index.js 里已有 annualDrafts（可能已打过补丁）\n')
    sys.exit(1)


def sub1(text, anchor, repl, label):
    n = text.count(anchor)
    assert n == 1, '%s 锚点命中 %d 次（须 1）: %r' % (label, n, anchor[:90])
    return text.replace(anchor, repl, 1)


# ── ① 存档顶层键（宿主侧；模块侧副本稍后同步） ──
A_KEY = "    'qaThread',  // [v3.340.0 · M4-X4] 追问线程（主体 / 时点下界 / 分支 / scope；只存约束不存答案）\n"
idx = sub1(idx, A_KEY,
           A_KEY + "    'annualDrafts',  // [v3.341.0 · M4-X2] 章节成稿草稿册（作品：题/述/段；事实位一概不收）\n",
           '① ARCHIVE_TOP_LEVEL_KEYS')

# ── ② 携带豁免表（跨对话不带：草稿绑定具体会话的章身份） ──
A_EX = "        'qaThread',           // [v3.340.0 · M4-X4] 追问线程：主体/时点条件绑定当前会话的问题语境，跨对话继承会把 A 的追问答成 B 的（内核自身按 chatKey 作废重建，故此处刻意不带）\n"
idx = sub1(idx, A_EX,
           A_EX + "        'annualDrafts',       // [v3.341.0 · M4-X2] 成稿草稿册：章身份绑定具体会话的卷章结构，且它是**作品**不是剧情事实——跨对话带上会把上一部的回顾接进新故事\n",
           '② CARRYOVER_EXEMPT_KEYS')

# ── ③ collectExport ──
A_CE = "                qaThread: this._qaThread || null,   // [v3.340.0 · M4-X4] 追问线程（只存约束）\n"
idx = sub1(idx, A_CE,
           A_CE + "                annualDrafts: this._annualDrafts || null,   // [v3.341.0 · M4-X2] 章节成稿草稿册（作品；事实位不收）\n",
           '③ collectExport')

# ── ④ restoreFromPayload ──
A_RP = "            _imp('qaThread', true, () => { if (data.qaThread) engine._qaThread = data.qaThread; });\n"
idx = sub1(idx, A_RP,
           A_RP + "            _imp('annualDrafts', true, () => { if (data.annualDrafts) engine._annualDrafts = data.annualDrafts; });\n",
           '④ restoreFromPayload')

# ── ⑤ 清空面（v3236 D1：清空面必须 ⊇ 恢复面） ──
A_CL = "            A('direct', 'qaThread', '追问线程', true, () => { e._qaThread = null; });\n"
idx = sub1(idx, A_CL,
           A_CL + "            A('direct', 'annualDrafts', '成稿草稿册', true, () => { e._annualDrafts = null; });\n",
           '⑤ clearRuntimeMemory')

# ── ⑥ 六个宿主出口 + 草稿册存取（插在 storyAnnualDescribe 之前） ──
A_DESC = '        /** [v3.327.0 · M3-X7] 面自述。 */\n        storyAnnualDescribe() {'
NEW = '''        /**
         * [v3.341.0 · M4-X2] **章节成稿**（零写）。吃 `storyAnnualReview` 的产物，出可读回顾。
         *   ★ 未给 `opts.polish`（真模型通道）⇒ 如实报结构成稿，**不报文风通过**
         *     —— 这正是验收原文「未调用真实模型只能报告结构成稿不报文风通过」那一格。
         */
        storyAnnualCompose(rev, opts) {
            const SA = _storyAnnualLib();
            const absent = (why) => ({
                kind: 'story_annual_draft', version: 0, ok: false, ref: {}, title: '', sections: [], text: '',
                paragraphCount: 0, chars: 0, source: 'structure-only', modelUsed: false, styleChecked: false,
                styleNote: '', evidenceBound: 0, evidenceMissing: 0, evidenceUndecided: 0, evidenceTotal: 0,
                memoryUntouched: true, writesNothing: true, why: [why],
            });
            if (!SA || typeof SA.compose !== 'function') return absent('module-absent');
            try {
                const res = SA.compose(rev, opts || {});
                this._lastAnnualCompose = {
                    at: Date.now(), ok: res.ok === true, sections: (res.sections || []).length,
                    source: res.source, modelUsed: res.modelUsed === true, styleChecked: res.styleChecked === true,
                    evidenceBound: res.evidenceBound || 0, evidenceMissing: res.evidenceMissing || 0,
                    evidenceUndecided: res.evidenceUndecided || 0,
                };
                return res;
            } catch (e) { errLog(e, 'plugin.storyAnnualCompose'); return absent('thrown'); }
        }
        /**
         * [v3.341.0 · M4-X2] **玩家版成稿**（零写）。
         *   ★ 与 `storyAnnualForPlayer` 同铁律：**绝不回退作者版**。去剧透未成立 ⇒ `ok:false`，
         *     由调用方显示「这一章暂时不能给玩家看」；把作者面当兜底正是直接剧透。
         *   ★ 可知性面与 `storyAnnualForPlayer` **同一装配口**（`_o9Gate()`），不建第二份。
         */
        storyAnnualComposeForPlayer(rev, opts) {
            const SA = _storyAnnualLib();
            const absent = (why) => ({
                kind: 'story_annual_draft', version: 0, ok: false, playerVersion: null, reason: why, ref: {},
                title: '', sections: [], text: '', source: 'structure-only', styleChecked: false, leakedChars: [],
                futureFactsLeaked: 0, chaptersRead: 0, memoryUntouched: true, writesNothing: true,
                note: '不接作者版：去剧透未成立（' + why + '）',
            });
            if (!SA || typeof SA.composeForPlayer !== 'function') return absent('module-absent');
            try {
                const o = Object.assign({}, opts || {});
                if (!o.gate || typeof o.gate.resolve !== 'function') {
                    try { o.gate = this._o9Gate(); } catch (e) { errLog(e, 'plugin.storyAnnualComposeForPlayer.gate'); }
                }
                const res = SA.composeForPlayer(rev, o);
                this._lastAnnualPlayerDraft = {
                    at: Date.now(), ok: res.ok === true, reason: res.reason || '',
                    leaked: (res.leakedChars || []).length, futureFactsLeaked: res.futureFactsLeaked || 0,
                };
                return res;
            } catch (e) { errLog(e, 'plugin.storyAnnualComposeForPlayer'); return absent('thrown'); }
        }
        /** [v3.341.0 · M4-X2] **按章重建**（零写）。草稿册缺省取本会话已存的（`_annualDrafts`）。 */
        storyAnnualRebuild(drafts, stale, opts) {
            const SA = _storyAnnualLib();
            const absent = (why) => ({
                kind: 'story_annual_rebuild', version: 0, ok: false, rebuilt: [], kept: [], gone: [],
                untouched: [], drafts: [], why: [why], staleCount: 0, missingChapters: 0,
                wholeBookRebuilt: false, writesNothing: true,
            });
            if (!SA || typeof SA.rebuildAffected !== 'function') return absent('module-absent');
            try {
                const src = drafts || this._annualDrafts || [];
                const res = SA.rebuildAffected(src, stale, opts || {});
                this._lastAnnualRebuild = {
                    at: Date.now(), rebuilt: (res.rebuilt || []).length, kept: (res.kept || []).length,
                    gone: (res.gone || []).length, untouched: (res.untouched || []).length,
                };
                return res;
            } catch (e) { errLog(e, 'plugin.storyAnnualRebuild'); return absent('thrown'); }
        }
        /** [v3.341.0 · M4-X2] 编辑成稿草稿（**纯函数**；事实位一概拒 —— 编辑的不是记忆）。 */
        storyAnnualApplyEdits(draft, patch) {
            const SA = _storyAnnualLib();
            const absent = (why) => ({
                ok: false, state: null, changed: [], rejected: [], reason: why,
                memoryUntouched: true, evidenceIntact: true, writesNothing: true,
            });
            if (!SA || typeof SA.applyEdits !== 'function') return absent('module-absent');
            try {
                const res = SA.applyEdits(draft, patch);
                this._lastAnnualEdit = {
                    at: Date.now(), changed: (res.changed || []).length, rejected: (res.rejected || []).length,
                    evidenceIntact: res.evidenceIntact !== false, reason: res.reason,
                };
                return res;
            } catch (e) { errLog(e, 'plugin.storyAnnualApplyEdits'); return absent('thrown'); }
        }
        /**
         * [v3.341.0 · M4-X2] **草稿册**（唯一落笔口；形状由内核 `normalizeDrafts` 定，宿主不现编）。
         *   无参 ⇒ 读；给入参 ⇒ 归一化后落进 `_annualDrafts`（随聊天持久化，重开可查）。
         */
        storyAnnualDrafts(raw, opts) {
            const SA = _storyAnnualLib();
            const absent = (why) => ({ kind: 'story_annual_drafts', version: 0, ok: false, drafts: [], drops: 0, why: [why], writesNothing: true, persisted: false });
            if (!SA || typeof SA.normalizeDrafts !== 'function') return absent('module-absent');
            try {
                if (raw === undefined || raw === null) {
                    const cur = Array.isArray(this._annualDrafts) ? this._annualDrafts : [];
                    const r = SA.normalizeDrafts(cur);
                    r.persisted = Array.isArray(this._annualDrafts);
                    return r;
                }
                const res = SA.normalizeDrafts(raw);
                this._annualDrafts = res.ok ? res.drafts.slice() : [];
                res.persisted = true;
                return res;
            } catch (e) { errLog(e, 'plugin.storyAnnualDrafts'); return absent('thrown'); }
        }
        /** [v3.341.0 · M4-X2] 成稿面诊断一行（四态分开；没生成过与生成了零段不同形）。 */
        storyAnnualComposeLine() {
            try {
                const SA = _storyAnnualLib();
                if (!SA || typeof SA.composeLine !== 'function') return '成稿模块未加载(story-annual.js)';
                const lastEdit = this._lastAnnualEdit || null;
                const body = SA.composeLine(this._lastAnnualCompose || null);
                const parts = [body];
                const pv = this._lastAnnualPlayerDraft || null;
                if (pv && pv.ok !== true) parts.push('⚠️ 玩家版被挡(' + (pv.reason || '未知') + ')');
                else if (pv && pv.leaked) parts.push('⚠️ 玩家版泄漏 ' + pv.leaked + ' 人');
                if (lastEdit && lastEdit.evidenceIntact === false) parts.push('⚠️ 段证据位被编辑掉');
                const rb = this._lastAnnualRebuild || null;
                if (rb) parts.push('重建 受影响 ' + rb.rebuilt + ' / 未变 ' + rb.kept + ' / 整章过期 ' + rb.gone);
                const n = Array.isArray(this._annualDrafts) ? this._annualDrafts.length : null;
                if (n !== null) parts.push('草稿 ' + n + ' 章');
                return parts.join(' · ');
            } catch (e) { errLog(e, 'plugin.storyAnnualComposeLine'); return '—(成稿面异常)'; }
        }
'''
idx = sub1(idx, A_DESC, NEW + A_DESC, '⑥ 宿主六出口')

# ── ⑦ 自检面「故事年鉴」行并入成稿面（沿用同一行，不新增行） ──
A_LINE = """                if (last.chaptersChecked === false) parts.push('章面未判');
                return parts.join(' · ');"""
idx = sub1(idx, A_LINE, """                if (last.chaptersChecked === false) parts.push('章面未判');
                /* [v3.341.0 · M4-X2] 成稿面读数并入本行（同一问题的两种尺度：结构 vs 成稿）。 */
                const ce = this._lastAnnualCompose || null;
                if (ce) parts.push('成稿 ' + (ce.modelUsed ? '已过模型' : '结构成稿') + ' ' + (ce.sections || 0) + ' 段');
                else parts.push('成稿未生成');
                return parts.join(' · ');""", '⑦ 自检面「故事年鉴」行')

# ── ⑧ memory-organs.js 侧逐字副本同步（v3283 值级副本面） ──
A_ORG = "'qaThread',  // [v3.340.0 · M4-X4] 追问线程（主体 / 时点下界 / 分支 / scope；只存约束不存答案）\n"
org = sub1(org, A_ORG,
           A_ORG + "'annualDrafts',  // [v3.341.0 · M4-X2] 章节成稿草稿册（作品：题/述/段；事实位一概不收）\n",
           '⑧ memory-organs.js 副本')

assert idx.count("'annualDrafts'") == 4, idx.count("'annualDrafts'")
# 四处写点：还原分支 / 清空面 / 出口落笔（读出口不算）
assert idx.count("_annualDrafts =") == 3, idx.count("_annualDrafts =")
io.open(BAK + 'memory-organs.js.pre3410', 'w', encoding='utf-8').write(io.open(ORG, encoding='utf-8').read())
io.open(BAK + 'index.js.pre3410', 'w', encoding='utf-8').write(io.open(IDX, encoding='utf-8').read())
io.open(IDX, 'w', encoding='utf-8').write(idx)
io.open(ORG, 'w', encoding='utf-8').write(org)
print('index.js %d 行 / memory-organs.js %d 行' % (idx.count('\n') + 1, org.count('\n') + 1))