#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 M4-X3 历史测试档契约同步（按 v3410 对历史档的同款做法）：
  · v3328_f_pack_canon_fated.test.mjs —— BC **导出面逐字对账**：本刀纯加法（+14），
    把期望表按磁盘真值重建；判据本体与负控制锚点一字不动。
  · v3328 的 `bc.selfCheck` 探针清单里补本刀新增的七个落卷面探针（否则新面无人核）。
口径：每个锚点必须**恰中 1 次**；只改「期望值」，不放宽判据。
"""
import io
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
T = ROOT + 'tests/v3328_f_pack_canon_fated.test.mjs'
BAK = '/tmp/bak3420/'
src = io.open(T, encoding='utf-8').read()
if 'M4-X3' in src:
    sys.stderr.write('FAIL: v3328 里已有 M4-X3 痕迹\n')
    sys.exit(1)


def sub1(text, anchor, repl, label):
    n = text.count(anchor)
    assert n == 1, '%s 锚点命中 %d 次（须 1）: %r' % (label, n, anchor[:90])
    return text.replace(anchor, repl, 1)


# ① 导出面期望表：按磁盘真值重建（排序后 46 项）
A_WANT = """    const bcWant = ['BC_KIND', 'BC_VERSION', 'CLASH', 'DECISION', 'DECISION_LABEL', 'MAX_OUTCOMES', 'PREVIEW', 'PROVENANCE',
        'REQUIRED_DEPS', 'SECRET_BODY_KEYS', 'SECRET_MASK', 'arrOf', 'clip', 'collisionKeyOf', 'conflicts', 'describe',
        'describePlan', 'entryKeyOf', 'filterByKeeper', 'hash32', 'keyOf', 'line', 'listOutcomes', 'maskSecretBody',
        'numOr', 'outcomeOf', 'planCanon', 'previewHandoff', 'revokeScopeOf', 'selfCheck', 'setDecision', 'strOf'];"""
NEW_WANT = """    /* [v3.342.0 · M4-X3 交棒] 导出面 +14（落卷面：ADOPT 三态 / UNMAPPED 三缺因 /
     *   buildContinuePack / adoptionBrief / revokeGuard / adoptItemOf / adoptableItems /
     *   adoptionLine / adoptProbeDeps / adoptProbePlan / 两张标签与来源表）；既有 32 项逐字不动。 */
    const bcWant = ['ADOPT', 'ADOPT_ITEM_FIELDS', 'ADOPT_KIND', 'ADOPT_LABEL', 'ADOPT_SOURCES', 'BC_KIND', 'BC_VERSION',
        'CLASH', 'DECISION', 'DECISION_LABEL', 'MAX_OUTCOMES', 'PREVIEW', 'PROVENANCE', 'REQUIRED_DEPS',
        'SECRET_BODY_KEYS', 'SECRET_MASK', 'UNMAPPED', 'adoptItemOf', 'adoptProbeDeps', 'adoptProbePlan',
        'adoptableItems', 'adoptionBrief', 'adoptionLine', 'arrOf', 'buildContinuePack', 'clip', 'collisionKeyOf',
        'conflicts', 'describe', 'describePlan', 'entryKeyOf', 'filterByKeeper', 'hash32', 'keyOf', 'line',
        'listOutcomes', 'maskSecretBody', 'numOr', 'outcomeOf', 'planCanon', 'previewHandoff', 'revokeGuard',
        'revokeScopeOf', 'selfCheck', 'setDecision', 'strOf'];"""
src = sub1(src, A_WANT, NEW_WANT, '① 导出面期望表')
# ② 自证探针清单：补本刀新增七个（新面必须有人核，否则等于没长出）
A_PROBE = """    if (s1.bothTerminalBlocked !== true) P.push('自证探针:两条终结声明未判成冲突');"""
NEW_PROBE = """    if (s1.bothTerminalBlocked !== true) P.push('自证探针:两条终结声明未判成冲突');
    /* [v3.342.0 · M4-X3] 落卷面七个真探针:形状可接 / 三态不同形 / 未选尽不出包 /
     *   幂等键稳定 / 三缺因具名 / 撤销保护面 / 受限正文不进包。 */
    for (const k of ['adoptShapeOk', 'adoptThreeStates', 'adoptBlockedNoPack', 'adoptIdStable',
        'adoptUnmappedNamed', 'adoptRevokeGuards', 'adoptMaskFixed']) {
        if (s1[k] !== true) P.push('自证探针未成立:' + k);
    }"""
src = sub1(src, A_PROBE, NEW_PROBE, '② 自证探针清单')
import os
if not os.path.isdir(BAK):
    os.makedirs(BAK)
io.open(BAK + 'v3328.pre3420', 'w', encoding='utf-8').write(io.open(T, encoding='utf-8').read())
io.open(T, 'w', encoding='utf-8').write(src)
print('v3328 已同步：%d 行' % (src.count('\n') + 1))