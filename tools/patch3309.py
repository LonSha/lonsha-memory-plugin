#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3309.py — M-O8 第四刀：世界推进账本写入纳入分支守卫。

修前实测（tests/audit/_mo8_branch_probe.mjs，rc=0）：
  R1 行序：秘密块（4112）早于分支守护（guardApply 4407）**295 行**；
           承诺块（3985）早于守护 **422 行**。
  R2 守卫覆盖面：_branchOk 四个使用点（4400 声明 / 4409 置假 / 4421 摘要留证 /
           4438 签名记录）**一个都不在**世界推进写入口上；21 个写入口被覆盖 **0** 处。
  ⇒ 翻页 / 重生成后，被放弃那一分支的承诺 / 支线 / 认知 / **秘密**照旧入账，
     而账本是会话级、无分支归属 ⇒ M-O8 验收②「A 分支秘密不出现在 B」的字面反例。

修法（三条，都不重造存储引擎、都不动分支判定本身）：
  1. 判定前移：把 `guardApply` 判定从摘要落笔处（§2 内）提到世界推进块之前，
     结果存 `this._branchVerdict`（含 accept / judged / reason / floor / sig）。
     §2 原处改为**读**该判定（不再重算，避免两次判定漂移），行为逐字不变。
  2. 世界推进块加闸：判定为「判得出问题」⇒ 整块不写，只记读数与审计。
     ★ 只拦 `accept === false && judged === true`：`judged === false`（首次提取 /
     老对话 / 模块未装）一律放行 —— 与 branch-guard 自己的纪律逐字同款
     （「隔离漏一点，好过让用户的记忆整体消失」）。
  3. 读数三态不同形：`_wpBranchSkip` 记 { skipped, reason, floor, at }；
     判不了（judged:false）与「没装分支守护」各自留痕，不压成同一格。

锚点纪律：每处锚点必须先校验「恰中 1 次」，全部校验通过后才统一写盘。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin'
SRC = os.path.join(ROOT, 'index.js')

with io.open(SRC, encoding='utf-8') as f:
    src = f.read()

edits = []


def sub(anchor, replacement, tag, count=1):
    n = src.count(anchor)
    if n != count:
        raise SystemExit('[patch3309] 锚点失配：%s 期望 %d 次，实测 %d 次' % (tag, count, n))
    edits.append((anchor, replacement, tag))


# ── ① 判定前移：在世界推进块之前插入判定 ────────────────────────────────
A1 = """                // [v3.85] A/B/C: WorldProgress 数据源接线（承诺账本/剧情支线/认知隔离）
                if (this.config.config.worldProgressEnabled && extracted) {
                    try {
                        const wpFloor = Number(message.index) || 0;
                        let promiseCount = 0, arcCount = 0, knowledgeCount = 0, secretCount = 0;
"""
N1 = """                /* [v3.309.0 · M-O8 第四刀] 分支判定**前移**到世界推进之前。
                 *   【修前实测，探针 tests/audit/_mo8_branch_probe.mjs 可复现】
                 *     `guardApply` 原本只在摘要落笔处调用（本节下方 §2），而承诺 / 支线 /
                 *     认知 / 秘密的写入在**它之前 295~422 行**就已执行完；探针 R2 实测
                 *     `_branchOk` 的四个使用点里世界推进写入口被覆盖 **0/21**。
                 *     ⇒ 翻页 / 重生成之后，被放弃那一分支的账照旧入账，而账本是会话级、
                 *       无分支归属 —— 这正是 M-O8 验收②「A 分支秘密不出现在 B」的字面反例。
                 *   【为什么判定要前移而不是在下面再算一次】
                 *     两次判定各取一次 `getProcessedSignature`，中间若发生翻页，两处会得出
                 *     不同结论（摘要放行、账本拦下，或反过来）—— 那是「同一个问题两个答案」，
                 *     本仓治理过多轮。故**只算一次**，结果存 `this._branchVerdict`，下面 §2
                 *     改为读它；§2 原逻辑逐字保留（同一对象、同一字段）。
                 *   【为什么判不了就放行】
                 *     `judged === false`（首次提取 / 老对话 / 分支守护未装）**不是**「有问题」，
                 *     按 branch-guard 自己的纪律「隔离漏一点，好过让用户的记忆整体消失」放行；
                 *     一律拦等于把世界推进功能关掉。三态各自留痕，不压成一格。 */
                let _branchOk = true;
                this._branchVerdict = null;
                try {
                    const BG0 = _branchGuardLib();
                    if (BG0 && typeof BG0.createGuard === 'function') {
                        if (!this._branchGuard) this._branchGuard = BG0.createGuard();
                        const sess0 = this.getCurrentChatId ? this.getCurrentChatId() : '';
                        const f0 = Number(message && message.index);
                        const g0 = this._branchGuard.guardApply(message, this._branchGuard.getProcessedSignature(f0, sess0), sess0);
                        this._branchVerdict = { accept: !!g0.accept, judged: !!g0.judged, reason: String(g0.reason || ''), floor: f0 };
                        if (!g0.accept) _branchOk = false;
                    }
                } catch (e) { errLog(e, 'onMessageReceived.分支判定前移'); }
                /* 世界推进整块的分支闸：只在「判得出问题」时拦。
                 *   读数走 `_wpBranchSkip`（三态不同形：拦下 / 判不了放行 / 无守卫），
                 *   与 `_branchGuardLast`（摘要面）分开记 —— 两件事都拦了却只报一处，
                 *   会让「账本被拦」与「摘要被拦」在后验时无法分辨。 */
                this._wpBranchGate = !_branchOk;
                if (_branchOk === false) {
                    this._wpBranchSkip = {
                        skipped: true,
                        reason: (this._branchVerdict && this._branchVerdict.reason) || 'unknown',
                        floor: Number(message && message.index) || 0,
                        at: Date.now()
                    };
                    if (this.config.config.debugMode) console.log('[' + PLUGIN_NAME + '] ⛔ 分支守护拦截第' + this._wpBranchSkip.floor + '楼世界推进账本写入（' + this._wpBranchSkip.reason + '）');
                    try { this.opLog?.log?.('branch', 'wp-skip', String(this._wpBranchSkip.reason), this._wpBranchSkip.floor, ''); } catch (e) { errLog(e, 'onMessageReceived.分支账本审计'); }
                }
                // [v3.85] A/B/C: WorldProgress 数据源接线（承诺账本/剧情支线/认知隔离）
                if (this.config.config.worldProgressEnabled && extracted && _branchOk) {
                    try {
                        const wpFloor = Number(message.index) || 0;
                        let promiseCount = 0, arcCount = 0, knowledgeCount = 0, secretCount = 0;
"""
sub(A1, N1, 'A1 世界推进块加闸 + 判定前移')

# ── ② §2 原判定改为读前移结论（不再重算） ────────────────────────────────
A2 = """                    let _branchOk = true;
                    try {
                        const BG = _branchGuardLib();
                        if (BG && typeof BG.createGuard === 'function') {
                            if (!this._branchGuard) this._branchGuard = BG.createGuard();
                            const sess = this.getCurrentChatId ? this.getCurrentChatId() : '';
                            const f = Number(message && message.index);
                            const g = this._branchGuard.guardApply(message, this._branchGuard.getProcessedSignature(f, sess), sess);
                            if (!g.accept) {
                                _branchOk = false;
                                this._branchGuardLast = { floor: f, reason: g.reason, at: Date.now() };
                                if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] ⛔ 分支守护拦截第${f}楼摘要落笔（${g.reason}）`);
                                try { this.opLog?.log?.('branch', 'apply-skip', String(g.reason), f, ''); } catch (e) { errLog(e, 'onMessageReceived.分支守卫审计'); }
                            }
                        }
                    } catch (e) { errLog(e, 'onMessageReceived.分支守护'); }
"""
N2 = """                    /* [v3.309.0 · M-O8 第四刀] 本处**不再重算** —— 判定已前移到世界推进块
                     *   之前（见上方「分支判定前移」）。理由逐字记在那里：两次判定各取一次
                     *   `getProcessedSignature`，中间若发生翻页会得出两个不同答案。
                     *   `_branchOk` 仍在同一作用域（由前移那段用 `let` 声明），下游
                     *   `if (_branchOk) try { ...摘要留证... }` 与签名记录处的行为逐字不变；
                     *   变量名与配对判据一个字未动（v3.183 的逐字契约仍在）。
                     *   台账语义不变：摘要面仍记 `apply-skip` 这一条（账本面另有 `wp-skip`）。 */
                    if (!_branchOk) {
                        this._branchGuardLast = {
                            floor: (this._branchVerdict && this._branchVerdict.floor) || Number(message && message.index) || 0,
                            reason: (this._branchVerdict && this._branchVerdict.reason) || 'unknown',
                            at: Date.now()
                        };
                        if (this.config.config.debugMode) console.log(`[${PLUGIN_NAME}] ⛔ 分支守护拦截第${this._branchGuardLast.floor}楼摘要落笔（${this._branchGuardLast.reason}）`);
                        try { this.opLog?.log?.('branch', 'apply-skip', String(this._branchGuardLast.reason), this._branchGuardLast.floor, ''); } catch (e) { errLog(e, 'onMessageReceived.分支守卫审计'); }
                    }
"""
sub(A2, N2, 'A2 §2 改为读前移结论')

# ── ③ 变量声明去重：§2 的 `let _branchOk = true` 已在前移处声明 ─────────
#   （前移段用的是同一个变量名；A2 已把它整体替换掉，故此处无需再动。）

# ── 校验通过，统一写盘 ───────────────────────────────────────────────────
for anchor, replacement, tag in edits:
    src = src.replace(anchor, replacement, 1)

with io.open(SRC, 'w', encoding='utf-8') as f:
    f.write(src)

print('[patch3309] 已应用 %d 处：%s' % (len(edits), ', '.join(t for _, _, t in edits)))
