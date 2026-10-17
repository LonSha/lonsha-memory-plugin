#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 M4-X3 宿主刀：落卷面接线 + 凭据持久化（新键 canonAdoption）。
口径：
  · 每个锚点**必须恰中 1 次**（0 次 / 多次一律退出，不写半成品）；
  · 新键 `canonAdoption` 四处契约一次补齐（存档键 / 豁免表 / 导出 / 还原）+ 清空面；
    缺一处就是 v3.340.0 在 v3236 D1 上照出过的「恢复面有、清空面没有」。
  · 新面**不落笔**：adopt/plan 只出计划与凭据；真有写动作的只有 `storyCanonAdoptConfirm`
    一处（走既有 confirmBranchImport 同款四环：落笔 / 栅栏 / 落盘 / 回读）。
"""
import io
import os
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
IDX = ROOT + 'index.js'
ORG = ROOT + 'memory-organs.js'
BAK = '/tmp/bak3420/'
idx = io.open(IDX, encoding='utf-8').read()
org = io.open(ORG, encoding='utf-8').read()
if 'canonAdoption' in idx:
    sys.stderr.write('FAIL: index.js 里已有 canonAdoption（可能已打过补丁）\n')
    sys.exit(1)


def sub1(text, anchor, repl, label):
    n = text.count(anchor)
    assert n == 1, '%s 锚点命中 %d 次（须 1）: %r' % (label, n, anchor[:90])
    return text.replace(anchor, repl, 1)


# ── ① 存档顶层键 ──
A_KEY = "    'annualDrafts',  // [v3.341.0 · M4-X2] 章节成稿草稿册（作品：题/述/段；事实位一概不收）\n"
idx = sub1(idx, A_KEY,
           A_KEY + "    'canonAdoption',  // [v3.342.0 · M4-X3] 正史落卷凭据（选中键集合指纹 + 撤销范围；只存凭据不存结局条文）\n",
           '① ARCHIVE_TOP_LEVEL_KEYS')
# ── ② 携带豁免表（跨对话不带：凭据绑定具体会话的卷章与选择） ──
A_EX = "        'annualDrafts',       // [v3.341.0 · M4-X2] 成稿草稿册：章身份绑定具体会话的卷章结构，且它是**作品**不是剧情事实——跨对话带上会把上一部的回顾接进新故事\n"
idx = sub1(idx, A_EX,
           A_EX + "        'canonAdoption',      // [v3.342.0 · M4-X3] 落卷凭据：adoptionId 由「本次选择」定，跨对话带上会让新故事的第一次落卷被判成**重复确认**而静默不落\n",
           '② CARRYOVER_EXEMPT_KEYS')
# ── ③ collectExport ──
A_CE = "                annualDrafts: this._annualDrafts || null,   // [v3.341.0 · M4-X2] 章节成稿草稿册（作品；事实位不收）\n"
idx = sub1(idx, A_CE,
           A_CE + "                canonAdoption: this._canonAdoption || null,   // [v3.342.0 · M4-X3] 正史落卷凭据（重启后仍能判「这次与上次是不是同一件事」）\n",
           '③ collectExport')
# ── ④ restoreFromPayload ──
A_RP = "            _imp('annualDrafts', true, () => { if (data.annualDrafts) engine._annualDrafts = data.annualDrafts; });\n"
idx = sub1(idx, A_RP,
           A_RP + "            _imp('canonAdoption', true, () => { if (data.canonAdoption) engine._canonAdoption = data.canonAdoption; });\n",
           '④ restoreFromPayload')
# ── ⑤ 清空面（v3236 D1：清空面必须 ⊇ 恢复面） ──
A_CL = "            A('direct', 'annualDrafts', '成稿草稿册', true, () => { e._annualDrafts = null; });\n"
idx = sub1(idx, A_CL,
           A_CL + "            A('direct', 'canonAdoption', '落卷凭据', true, () => { e._canonAdoption = null; });\n",
           '⑤ clearRuntimeMemory')
# ── ⑧ memory-organs.js 侧逐字副本同步（v3283 值级副本面）──
A_ORG = "'annualDrafts',  // [v3.341.0 · M4-X2] 章节成稿草稿册（作品：题/述/段；事实位一概不收）\n"
org = sub1(org, A_ORG,
           A_ORG + "'canonAdoption',  // [v3.342.0 · M4-X3] 正史落卷凭据（选中键集合指纹 + 撤销范围；只存凭据不存结局条文）\n",
           '⑧ memory-organs.js 副本')
assert org.count("'canonAdoption'") == 1, org.count("'canonAdoption'")
# ── ⑥ 宿主出口：落卷计划 / 凭据 / 撤销保护面 / 确认落笔（插在 branchCanonRevoke 之后） ──
A_REV = "        /** [v3.328.0 · M3-X6] 能力自述(缺哪一格、为什么缺、缺了会怎样)。 */\n        branchCanonDescribe() {"
NEW = '''        /**
         * [v3.342.0 · M4-X3] **落卷计划**（零写）：把「选中结局」映射成下一卷接得上的条目。
         *
         * 【为什么必须有这一面】下游 owner（`handoffVolumeContinuation`）只认**面归属形状**
         *   （face / ownerKey / link / value）；本模块的选择面只产**结局条文**。修前两者之间
         *   一处映射都没有 ⇒ 下游逐条判「目标侧缺面」⇒ **一条也接不上**，而预览读数全绿。
         *   这一面就是那次断链的落点：形状在这里对齐，缺格在这里**具名**（unmapped / bareOutcomes）。
         *
         * ★ 本出口**不落笔**：`writeNothing:true` 是读数，不是注释。真落笔只走
         *   `storyCanonAdoptConfirm`（且它借既有 `confirmBranchImport` 的落笔 owner）。
         */
        storyCanonAdoptPlan(opts) {
            const BC = _branchCanonLib();
            const absent = (why) => ({
                kind: 'branch_canon_adoption', version: 0, ok: false, judged: false, reason: why,
                verdict: 'blocked', pack: null, items: [], unmapped: [], bareOutcomes: [], skipped: [],
                pending: [], adoptionId: '', itemCount: 0, unmappedCount: 0, bareCount: 0,
                pendingCount: 0, masked: 0, writeNothing: true,
                note: '落卷面不可达(branch-canon.js 未加载或符号缺失)⇒ 报 blocked/' + why
                    + ',**不报「没有可接条目」**',
            });
            if (!BC || typeof BC.buildContinuePack !== 'function') return absent('module-absent');
            try {
                const o = opts || {};
                const res = BC.buildContinuePack(this._branchCanonDeps(), this._branchCanonPlan || null, o);
                const out = Object.assign({ kind: BC.BC_KIND + '_adoption', version: BC.BC_VERSION }, res);
                this._lastCanonAdopt = {
                    at: Date.now(), judged: res.judged !== false, verdict: res.verdict || '',
                    items: res.itemCount || 0, unmapped: res.unmappedCount || 0,
                    bare: res.bareCount || 0, pending: res.pendingCount || 0,
                    adoptionId: res.adoptionId || '', packId: (res.pack && res.pack.packId) || null,
                };
                return out;
            } catch (e) { errLog(e, 'plugin.storyCanonAdoptPlan'); return absent('thrown'); }
        }
        /**
         * [v3.342.0 · M4-X3] **落卷凭据**（零写）：本次落卷叫什么、撤起来范围是什么。
         *   `adoptionId` 只由**选择本身**决定（同一份选择重算恒同 id）⇒ 这就是
         *   「重复确认不重复接续」的幂等键；`revokeScope` 也在**确认之前**就定下来。
         *   给它入参 `opts.commit === true` 才落进 `_canonAdoption`（随聊天持久化、重启可判）。
         */
        storyCanonAdoption(opts) {
            const BC = _branchCanonLib();
            const absent = (why) => ({
                kind: 'branch_canon_adoption', version: 0, judged: false, adoptionId: '', verdict: 'blocked',
                preview: 'blocked', volumeId: null, packId: null, itemCount: 0, unmappedCount: 0,
                bareCount: 0, pendingCount: 0, revokeScope: {}, writeNothing: true, persisted: false,
                reason: why, note: '落卷面不可达 ⇒ 不产出凭据(不报「无需凭据」)',
            });
            if (!BC || typeof BC.adoptionBrief !== 'function') return absent('module-absent');
            try {
                const o = opts || {};
                const res = BC.adoptionBrief(this._branchCanonDeps(), this._branchCanonPlan || null, o);
                const out = Object.assign({}, res);
                if (o.commit === true) {
                    /* ★ 只有**确认过**的凭据才落盘：预览期落凭据会让「重复确认」判据失去依据。 */
                    this._canonAdoption = {
                        adoptionId: res.adoptionId || '', verdict: res.verdict || '',
                        packId: res.packId || null, volumeId: res.volumeId || null,
                        revokeScope: res.revokeScope || null, at: Date.now(),
                    };
                    out.persisted = true;
                } else {
                    out.persisted = Array.isArray(this._canonAdoption) || !!this._canonAdoption;
                }
                return out;
            } catch (e) { errLog(e, 'plugin.storyCanonAdoption'); return absent('thrown'); }
        }
        /**
         * [v3.342.0 · M4-X3] **撤销保护面**（零写）：本次撤销会动哪些、必须留住哪些。
         *   ★ 四张具名表（可撤 / 别批 / 手工 / 后来新增）+ 两条口径读数写成读数本身 ——
         *     `deletesManual:false`、`branchWrites:0`。修前只报一句「范围限于交接批次、分支零写」，
         *     那是承诺不是形态，于是「撤销」很容易做成「把这个键上的条目全删」。
         */
        storyCanonRevokeGuard(entries, opts) {
            const BC = _branchCanonLib();
            const absent = (why) => ({
                kind: 'branch_canon_adoption_revoke_guard', version: 0, judged: false,
                scope: {}, revocable: [], keptForeign: [], keptManual: [], keptLater: [],
                revocableCount: 0, foreignCount: 0, manualCount: 0, laterCount: 0,
                deletesManual: false, branchWrites: 0, reason: why,
                note: '撤销保护面不可达 ⇒ 报未判(不许「全删」兜底)',
            });
            if (!BC || typeof BC.revokeGuard !== 'function') return absent('module-absent');
            try {
                const o = opts || {};
                const brief = o.brief || this._canonAdoption || null;
                const rows = entries || this._volumeContinuationEntriesForGuard();
                const res = BC.revokeGuard(rows, brief, o);
                this._lastCanonRevokeGuard = {
                    at: Date.now(), judged: res.judged === true, revocable: res.revocableCount || 0,
                    foreign: res.foreignCount || 0, manual: res.manualCount || 0,
                    later: res.laterCount || 0, deletesManual: res.deletesManual === true,
                };
                return res;
            } catch (e) { errLog(e, 'plugin.storyCanonRevokeGuard'); return absent('thrown'); }
        }
        /** [v3.342.0 · M4-X3] 撤销保护面的默认取数口（器官缺席 ⇒ 空表，不编条目）。 */
        _volumeContinuationEntriesForGuard() {
            try {
                const wp = this.worldProg;
                if (!wp || typeof wp.volumeContinuationEntries !== 'function') return [];
                const rows = wp.volumeContinuationEntries();
                return Array.isArray(rows) ? rows : [];
            } catch (e) { errLog(e, 'engine._volumeContinuationEntriesForGuard'); return []; }
        }
        /**
         * [v3.342.0 · M4-X3] **确认落卷**（本刀**唯一有写动作**的出口）。四环与
         *   `confirmBranchImport` 逐条同源：① 落笔走既有 owner（借 branch-semantics 的
         *   confirmImport）② 代际栅栏 ③ 真落盘 ④ 保存后按来源计数回读。缺一环则 `applied`
         *   就是无据断言。
         *
         * 【幂等】幂等键用内核给的 `adoptionId`（同一份选择恒同 id）⇒ 同一份选择重复确认
         *   走 `duplicate` 分支，**不再落笔**；而凭据随聊天持久化 ⇒ **重启后仍判得出**
         *   「这次与上次是不是同一件事」（修前的凭据只活在内存里，重启即失忆）。
         */
        async storyCanonAdoptConfirm(opts = {}) {
            const BC = _branchCanonLib();
            if (!BC || typeof BC.adoptionBrief !== 'function') return null;
            try {
                const o = opts || {};
                /* ★ 先出计划与凭据（不改任何状态）；未选尽 / 无可接 ⇒ **当场拒绝**，不落半份。 */
                const plan = this.storyCanonAdoptPlan(o);
                if (!plan || plan.ok !== true || !plan.pack) {
                    this._lastCanonAdoptConfirm = {
                        at: Date.now(), ok: false, reason: (plan && plan.reason) || 'not-ready',
                        verdict: (plan && plan.verdict) || 'blocked', applied: 0, persisted: null,
                    };
                    return Object.assign({ kind: BC.BC_KIND + '_adopt_confirm', ok: false, applied: 0, persisted: null, duplicate: false },
                        { reason: (plan && plan.reason) || 'not-ready', verdict: (plan && plan.verdict) || 'blocked',
                            adoptionId: (plan && plan.adoptionId) || '', pendingCount: (plan && plan.pendingCount) || 0 });
                }
                const brief = BC.adoptionBrief(this._branchCanonDeps(), this._branchCanonPlan || null, o);
                const seen = this._canonAdoptSeen || (this._canonAdoptSeen = {});
                const adoptionId = brief.adoptionId || '';
                /* ★ 幂等判定要**同时看内存 seen 与持久凭据**：后者才活得过分界（重启/重开）。
                 *   只看内存 ⇒ 重启后重复确认会**再落一遍**（本项要治的那条）。 */
                const persistedId = (this._canonAdoption && this._canonAdoption.adoptionId) || '';
                if (adoptionId && (seen[adoptionId] || persistedId === adoptionId)) {
                    /* ★ 取值链：内存 seen → 持久凭据 → 0。少了中间那一环，**重启后**回执的
                     *   `applied` 恒为 0（认得出来是重复，却报「上次落了 0 条」）。 */
                    const got = seen[adoptionId] || {
                        applied: (this._canonAdoption && this._canonAdoption.applied) || 0,
                        at: (this._canonAdoption && this._canonAdoption.at) || null,
                    };
                    this._lastCanonAdoptConfirm = {
                        at: Date.now(), ok: true, reason: 'duplicate', duplicate: true,
                        applied: Number(got.applied) || 0, persisted: null, adoptionId: adoptionId,
                    };
                    return {
                        kind: BC.BC_KIND + '_adopt_confirm', ok: true, reason: 'duplicate', duplicate: true,
                        applied: Number(got.applied) || 0, persisted: null, adoptionId: adoptionId,
                        via: 'branch-canon', note: '同一份选择已确认过（凭据在场）⇒ 不再落笔',
                    };
                }
                /* 空输入的形状校验放在**落笔之前**：形状不对就不该走到 owner 那一步。 */
                const pack = { packId: plan.pack.packId, volumeId: plan.pack.volumeId, entries: plan.pack.entries };
                const target = o.target || null;
                const BS = _moduleLib(() => window.LonShaBranchSemantics, 'branch-semantics.js');
                const VC = _moduleLib(() => window.LonShaVolumeContinuation, 'volume-continuation.js');
                if (!VC || typeof VC.handoffContinuation !== 'function') {
                    this._lastCanonAdoptConfirm = { at: Date.now(), ok: false, reason: 'module-absent', applied: 0, persisted: null };
                    return { kind: BC.BC_KIND + '_adopt_confirm', ok: false, reason: 'module-absent', applied: 0, persisted: null, duplicate: false, adoptionId: adoptionId };
                }
                const wp = this.worldProg;
                let applied = 0;
                let persisted = null;
                const lease = { chatId: this.getCurrentChatId(), epoch: this._mutationEpoch };
                const res = await VC.handoffContinuation({
                    pack: pack, target: target, select: o.select,
                    allowReplace: o.allowReplace === true, allowNameLink: o.allowNameLink === true,
                    liveSources: o.liveSources, dependents: o.dependents,
                    proposalId: adoptionId, bs: BS || null,
                    applyFn: (p) => {
                        if (!wp || typeof wp.applyVolumeContinuation !== 'function') return { ok: false, reason: 'no-organ' };
                        const r = wp.applyVolumeContinuation(p);
                        if (r && r.ok === true) applied++;
                        return r;
                    },
                    readback: async () => {
                        if (!wp || typeof wp.volumeContinuationCount !== 'function') return undefined;
                        if (typeof this.storage?.save !== 'function') return undefined;
                        let okSave = null;
                        try { okSave = await this.storage.save(this.getCurrentChatId(), this.collectExport()); }
                        catch (e) { errLog(e, 'engine.storyCanonAdoptConfirm.save'); okSave = false; }
                        persisted = (okSave === true);
                        return Number(wp.volumeContinuationCount()) || 0;
                    },
                    seen: seen,
                });
                if (!res) return null;
                const receipt = res.receipt || null;
                if (receipt) receipt.persisted = persisted;
                if (receipt && persisted === false && receipt.ok === true) {
                    receipt.ok = false;
                    receipt.reason = 'persist-failed';
                }
                const stale = !this._leaseValid(lease);
                if (stale) {
                    if (receipt) { receipt.ok = false; receipt.reason = 'epoch-changed'; receipt.stale = true; receipt.applied = applied; }
                    this._leaseDrop(lease, 'canonAdopt', -1);
                }
                /* ★ 只有真落地且非重复才登记 seen **并落凭据**（凭据是「重启后仍判得出」的那一半）。 */
                if (receipt && receipt.ok === true && !receipt.duplicate) {
                    seen[adoptionId] = { applied: Number(receipt.applied) || 0, at: Date.now() };
                    this._canonAdoption = {
                        adoptionId: adoptionId, verdict: plan.verdict || '', packId: plan.pack.packId,
                        volumeId: plan.pack.volumeId || null, revokeScope: brief.revokeScope || null,
                        /* ★ 条数随凭据落盘：「上次落了几条」须活得过分界（重启后回执如实报原读数）。 */
                        applied: Number(receipt.applied) || 0, at: Date.now(),
                    };
                }
                this._lastCanonAdoptConfirm = {
                    at: Date.now(), ok: (receipt && receipt.ok === true), reason: (receipt && receipt.reason) || '',
                    applied: (receipt && receipt.applied) || 0, persisted: persisted,
                    duplicate: (receipt && receipt.duplicate === true),
                    adoptionId: adoptionId, stale: stale,
                };
                return Object.assign({ kind: BC.BC_KIND + '_adopt_confirm', adoptionId: adoptionId, stale: stale }, receipt || {});
            } catch (e) { errLog(e, 'engine.storyCanonAdoptConfirm'); return null; }
        }
        /** [v3.342.0 · M4-X3] 落卷诊断一行（四态分开：未判 / 未选尽 / 无可接 / 可接续）。 */
        storyCanonAdoptLine() {
            try {
                const BC = _branchCanonLib();
                if (!BC || typeof BC.adoptionLine !== 'function') return '落卷面模块未加载(branch-canon.js)';
                const cf = (typeof this.branchCanonDescribe === 'function') ? this.branchCanonDescribe() : null;
                if (cf && cf.reason === 'module-unavailable') return '落卷面模块未加载(branch-canon.js)';
                const last = this._lastCanonAdopt || null;
                const brief = this._canonAdoption || null;
                /* ★ 撤销保护面读数**独立于落卷计划**：先问「撤会动什么」再问「能不能接」是常见次序
                 *   ⇒ 早退分支也必须带上它，否则这条读数恰在还没生成计划时（最需要它的时候）不显示。 */
                const g = this._lastCanonRevokeGuard || null;
                const revokeTail = g ? ('撤销面 可撤 ' + g.revocable + ' / 留 ' + (g.foreign + g.manual + g.later)) : '';
                /* ★ 没有计划读数 ⇒ 报「未生成」(不是「无可接条目」)：两态不同形。 */
                if (!last) {
                    const head = '落卷:' + (brief ? ('已确认 ' + (brief.adoptionId || '?')) : '尚未生成');
                    return revokeTail ? (head + ' · ' + revokeTail) : head;
                }
                const parts = [BC.adoptionLine(last)];
                const cfm = this._lastCanonAdoptConfirm || null;
                if (cfm) {
                    if (cfm.duplicate) parts.push('重复确认(未再落笔)');
                    else parts.push(cfm.ok ? ('已落 ' + (cfm.applied || 0) + ' 条') : ('未落(' + (cfm.reason || '?') + ')'));
                } else if (brief) parts.push('已确认 ' + (brief.adoptionId || '?'));
                if (revokeTail) parts.push(revokeTail);
                return parts.join(' · ');
            } catch (e) { errLog(e, 'plugin.storyCanonAdoptLine'); return '—(落卷面异常)'; }
        }
'''
idx = sub1(idx, A_REV, NEW + A_REV, '⑥ 宿主落卷出口')
# ── ⑦ 自检面「支线正史」行并入落卷读数（沿用同一行，不新增行） ──
A_LINE = """                rows.push(['支线正史', this.branchCanonLine()]);"""
idx = sub1(idx, A_LINE,
           """                rows.push(['支线正史', this.branchCanonLine()]);
                    /* [v3.342.0 · M4-X3] 落卷面读数并入**同一行**：选择与落卷是同一问题的两截
                     *   （选了没接上 = 本项要治的那条），拆两行会让「已选」与「已落」各自看着都好。 */
                    try { rows.push(['支线正史', this.storyCanonAdoptLine()]); } catch (e) { errLog(e, 'selfCheck.storyCanonAdopt'); }""",
           '⑦ 自检面落卷行')
assert idx.count("'canonAdoption'") == 4, idx.count("'canonAdoption'")
assert idx.count("_canonAdoption =") == 4, idx.count("_canonAdoption =")   # 还原 1 + 清空 1 + 两处真落凭据（adoption() / adoptConfirm）
assert idx.count('storyCanonAdoptPlan(') == 2, idx.count('storyCanonAdoptPlan(')
assert idx.count('storyCanonAdoptConfirm(') == 1
assert idx.count('storyCanonRevokeGuard(') == 1
assert idx.count('storyCanonAdoption(') == 1
assert idx.count('storyCanonAdoptLine()') == 2, idx.count('storyCanonAdoptLine()')   # 定义 1 + 自检面并入行 1
if not os.path.isdir(BAK):
    os.makedirs(BAK)
io.open(BAK + 'index.js.pre3420', 'w', encoding='utf-8').write(io.open(IDX, encoding='utf-8').read())
io.open(BAK + 'memory-organs.js.pre3420', 'w', encoding='utf-8').write(io.open(ORG, encoding='utf-8').read())
io.open(IDX, 'w', encoding='utf-8').write(idx)
io.open(ORG, 'w', encoding='utf-8').write(org)
print('index.js 已接线：%d 行' % (idx.count('\n') + 1))