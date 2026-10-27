#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_3323_face.py - [v3.323.0 · C 包] 宿主出口**恒定键面**真缺陷修复。

【缺陷（C 包成对套件 v3323 D1 首跑抓到，不是推演）】
  三个新出口在「模块缺席」时给的降级面**键面与在场路径不同**：
    · 在场（内核产出）：kind,version,pairs,counts,…,writesNothing,degraded
    · 缺席（本补丁前）：ok,reason,kind,…,writesNothing —— 缺 version/degraded/…，多 ok/reason
  而 C 包的产品前提是「下游按键断言不必猜」：缺席与在场**必须逐字同键**
  （「模块没加载」与「一个都没有」处置相反，两者若键面不同，下游只能判 undefined）。
  与 v3.322.0 修掉的 `memoryQaAnswer` 缺 knownActors 是**同一族形态**，
  同一轮又在三个新面上复发 ⇒ 这次由**当版套件当场抓住**（正是判据面存在的意义）。

【修法（最小面，零语义变更）】
  · 缺席面按**在场产出的键序**重排，并在尾部补 ok/reason；
  · `version: 0` 而不是抄一个版本号：「这一面没在场」与「第 N 版的面」必须可分；
  · `relationHistoryAt` 的缺席面补 `floor: null` 与 `floorKnown: false` ——
    缺席时**不猜楼号**，与在场路径的「时点读不到」同判据；
  · 不动任何在场路径、不动内核、不动 `writesNothing`。
"""
import io
import sys

F = '/home/user/lonsha-memory-plugin/index.js'

EDITS = [
    # ① relationHistory 缺席面
    (
        "        const absent = (why) => ({ ok: false, reason: why, kind: 'relation_history', pairs: [], counts: {}, writesNothing: true });",
        "        /* [v3.323.0 · C 包] **恒定键面**（本补丁的由来）：缺席面必须与在场产出**逐字同键**，\n"
        "         *   否则下游按键断言的前提被破（「模块没加载」会被读成「一个都没有」，两者处置相反）。\n"
        "         *   键序按内核 `RH.build()` 的产出序排，尾部补 ok/reason；`version: 0` = 「这一面不在场」。 */\n"
        "        const absent = (why) => ({ kind: 'relation_history', version: 0, pairs: [], counts: {}, truncated: 0, turnsTruncated: 0, byName: false, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });",
    ),
    # ② relationHistoryAt 缺席面
    (
        "        const absent = (why) => ({ ok: false, reason: why, kind: 'relation_history@floor', pairs: [], counts: {}, writesNothing: true });",
        "        /* [v3.323.0 · C 包] 同上：键序按 `RH.asOf()` 的产出序。\n"
        "         *   `floor: null` + `floorKnown: false` —— 缺席时**不猜楼号**（与在场的「时点读不到」同判据）。 */\n"
        "        const absent = (why) => ({ kind: 'relation_history@floor', version: 0, floor: null, pairs: [], counts: { pairs: 0, at: 0 }, floorKnown: false, malformedInput: false, degraded: false, writesNothing: true, ok: false, reason: why });",
    ),
    # ③ causalChainGraph 缺席面
    (
        "        const absent = (why) => ({ ok: false, reason: why, kind: 'causal_chain', nodes: [], edges: [], speculative: [], unresolved: [], resolved: [], cancelled: [], broken: [], counts: {}, writesNothing: true });",
        "        /* [v3.323.0 · C 包] 同上：键序按 `CC.build()` 的产出序。\n"
        "         *   ★ 推测边面在缺席时**照样是空数组而不是缺键** —— 「没有推测边」与「这一面不在场」\n"
        "         *     是两个读数，消费方按同一个键就能分。 */\n"
        "        const absent = (why) => ({ kind: 'causal_chain', version: 0, nodes: [], edges: [], speculative: [], unresolved: [], resolved: [], cancelled: [], broken: [], counts: {}, truncated: 0, edgesTruncated: 0, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });",
    ),
    # ④ perspectiveCard 缺席面
    (
        "        const absent = (why) => ({ ok: false, reason: why, kind: 'perspective_card', cards: [], counts: {}, writesNothing: true });",
        "        /* [v3.323.0 · C 包] 同上：键序按 `PC.build()` 的产出序。\n"
        "         *   `at: null` + `atKnown: false` —— 缺席时不给「时点」，与在场的「未给时点」不同形。 */\n"
        "        const absent = (why) => ({ kind: 'perspective_card', version: 0, at: null, atKnown: false, cards: [], counts: {}, truncated: 0, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });",
    ),
]

src = io.open(F, encoding='utf-8').read()
for old, new in EDITS:
    n = src.count(old)
    if n != 1:
        sys.exit('[patch3323face] 锚点命中 %d 次（期望 1）：%r' % (n, old[:80]))
src2 = src
for old, new in EDITS:
    src2 = src2.replace(old, new)
io.open(F, 'w', encoding='utf-8').write(src2)
print('[patch3323face] ok：四处缺席面已按在场键序重排（index.js %d -> %d 字节）' % (len(src), len(src2)))