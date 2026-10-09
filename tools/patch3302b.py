#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3302b.py — v3.302.0 · M-O1 第二刀：让**排干批**也有属于自己的第一查

【为什么有第二刀（实测发现，不是推理发现）】
  加上第一刀（patch3302a.py）之后，用 v3302 B2 的「A→await→B + 队列交错」配方实测：

     [saveChat] 当前会话=B 槽.chatId=A          ← A 的数据被写进**当前会话 B** 的 metadata
     _confirmed = {"chatId":"A","revision":2}    ← 确认指向一次从未属于 A 的落盘

  根因：第一查（绝对口径「目标 vs 当前」）的第二条读的是**入口那次调用**的快照
  `const _liveChatId = _ctxIdOf();`。那个快照只有**入口批**用得对；**排干批**
  （挂起集合里别人的批次）**没有属于自己的快照** ⇒ 「目标 A 挂在那儿、当前早已是 B」
  时那条比较判 false（目标恰好等于快照里那一个）⇒ 放行写盘，把 A 的数据压进 B 的
  metadata。这条 v3.272 修掉的错档，在**队列路径**上依然可达。

  反向同样成立且更常见：排干批**本该写**（当前会话就是它要的那个），却因为借用了
  入口批的旧快照而被判「目标不是当前会话」⇒ 被误延期（v3302 B2 实测整队零落盘）。

【修法（一处：逐字保住既有套件依赖的全部字面量）】
  · E9：在**第一查那一行之前**插一行每批重绑 ——
      `const _liveChatId = _curLiveId;`
    块内 `const` **遮蔽**方法入口那次捕获：此后本批的 `_liveChatId` 一律指
    「本批迭代开头重核过的当下身份」（即 `_curLiveId`，循环入口那句刚赋值过）。
  · 判据行、变量名配对、外层的 `const _liveChatId = _ctxIdOf();` **一个字都不动**。
  · ★ 注释里**不得复述**判据字面量：本文件多处按字面量计数自证（v3272 A1 要求
    `String(curChatId) !== String(_liveChatId)` **恰中一处**），注释里再写一遍就变两处
    —— 首稿实测当场自证失败（「命中 2 次」）。故 E9 插入的注释一律**只描述、不引用**。

【为什么是这个形状（两条硬约束，都实测踩过）】
  ① v3272 A1 逐字要求那条比较式恰中一处，且其 C1 负控制的破坏锚点直接引用第一查的
     结构行（`if (_liveChatId && curChatId !== null && curChatId !== undefined`）
     ⇒ 这套 `if` + 那条比较式的**变量名配对一个字都不能动**（改名实测立刻双红）。
  ② 第二刀的语义要求「本批自己那一刻的身份」。
     两者的交集就是**遮蔽**：判据行零改动，而它的读义变成每批的。

【为什么不是别的三种写法（都试过，都失败）】
  · 把判据里的 `_liveChatId` 改名成 `_curLiveId` —— v3272 A1/C1 **双红**。
  · 抽一个 `_ctxVerify(want)` 函数把判据包进去 —— 字面量计数变 0。
  · 新增第二条判据给排干批 —— 会**抹平第一查的唯一性**：v3272 C1 要的正是
    「去掉核验就回到原病灶形态（回 true + 把目标写进当前会话 metadata）」，
    多一道绝对锁会让破坏副本也拦得住、负控制拿不到 true。
  · 把方法入口那次 `const` 改成 `let` 再每批重赋 —— v3272 A1 锁的是
    `const _liveChatId = _ctxIdOf();` 这个字面量（`let` 不匹配）。

【前置】在**干净基线**上先跑 `tools/patch3302a.py`（第一刀），再跑本脚本。
【纪律】锚点逐字相符且**恰中 1 次**；先全部校验、再统一写盘；零新实例方法；
        不引入新的自由标识符；花括号净差必须与基线一致。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
REL = 'memory-organs.js'
P = ROOT / REL
src = P.read_text(encoding='utf-8')
_OB0, _CB0 = src.count('{'), src.count('}')

_edits = []


def sub(old, new, why):
    n = src.count(old)
    if n != 1:
        sys.exit('[patch3302b] 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点头=%r'
                 % (n, why, old[:200]))
    if old == new:
        sys.exit('[patch3302b] 同值替换等于没改：%s' % why)
    _edits.append((old, new, why))


# ══════ E9 第一查之前：第一查的比对对象按**本批**重绑（块内遮蔽） ══════
# 注释纪律：只描述机制，**不引用判据字面量**（否则本文件按字面量计数的自证会翻倍失败）
_E9_NOTE = """                    /* [v3.302.0 M-O1 第二刀] **每批就地重绑**第一查的比对对象：
                     *   方法入口那次捕获记的是**调用那一刻**的身份，只有**入口批**用它才对得上。
                     *   排干批（挂起集合里别人的批次）借用别人的快照 ⇒ 目标挂在那儿、
                     *   当前早已换人时，那条比较**判为相等**（目标恰好等于快照里那一个）
                     *   ⇒ 放行写盘，把目标批次的数据压进**当前**会话的 metadata ——
                     *   v3.272 修掉的错档在队列路径上又开了；反向也坏：排干批本该写，
                     *   却借用旧快照被判「目标不是当前会话」而误延期（实测整队零落盘）。
                     *   这里按**本批**刚重核到的当下身份把它重绑一次（块内 `const` 遮蔽；
                     *   判据行与变量名配对**一个字未动**）。
                     *   为什么不改名：v3272 A1 逐字锁住这一对变量名，改名会让那条既有套件双红；
                     *   为什么不新增判据：多一道绝对锁会抹平第一查的唯一性，
                     *   v3272 C1 负控制就再也回不到原病灶形态（实测踩过）。 */
                    const _liveChatId = _curLiveId;
"""
sub(
    """                    if (_liveChatId && curChatId !== null && curChatId !== undefined
""",
    _E9_NOTE + """                    if (_liveChatId && curChatId !== null && curChatId !== undefined
""",
    'E9 第一查的比对对象按本批重绑（遮蔽入口快照）')

for old, new, why in _edits:
    src = src.replace(old, new, 1)

P.write_text(src, encoding='utf-8')

# ══════ 改后复核（双向） ══════
NEW = [
    ('                    const _liveChatId = _curLiveId;\n', 1, '每批重绑行'),
    ('                    if (_liveChatId && curChatId !== null && curChatId !== undefined', 1,
     '第一查结构行（v3272 C1 负控制锚，原样）'),
    ('        const _liveChatId = _ctxIdOf();', 1, '方法入口快照（v3272 A1 锚，原样）'),
    ('String(curChatId) !== String(_liveChatId)', 1, '绝对口径（v3272 A1 锚，恰一处）'),
    ('        _curLiveId = _liveChatId;', 1, '入口快照仍被读到（外层绑定不是死代码）'),
    ('_curLiveId = _ctxIdOf();', 3, '三处重核点（v3302 A1/A4 计数不变）'),
    ('const _ctxIdOf = function () {', 1, '取数器（原样）'),
    ('_writeBaseId = (_curLiveId === null', 1, '放行基线（原样）'),
    ('} else if (ctx?.chatMetadata) {', 1, '真写盘分支头（不得被复制）'),
]
BAD = 0
for _needle, _want, _why in NEW:
    _n = src.count(_needle)
    if _n != _want:
        print('★★ 复核失败：%s 命中 %d 次（要求 %d）' % (_why, _n, _want))
        BAD += 1
# 反向：不得出现「第二套绝对口径」（改名那条错路留下的痕迹）
_GONE = [
    ('String(curChatId) !== String(_curLiveId)', '改口径为 _curLiveId（会破 v3272 字面量）'),
    ('_ctxVerify', '把判据抽成函数（字面量计数会变 0）'),
]
for _needle, _why in _GONE:
    if _needle in src:
        print('★★ 不该出现的形态仍在：%s' % _why)
        BAD += 1
# 位置自证：重绑必须在循环体内、且在第一查结构行**之前**
_i_rebind = src.index('                    const _liveChatId = _curLiveId;\n')
_i_check = src.index('                    if (_liveChatId && curChatId !== null && curChatId !== undefined\n')
_i_loop = src.index('            while (curData) {')
if not (_i_loop < _i_rebind < _i_check):
    print('★★ 位置不对：重绑须在循环体内、第一查之前（循环 %d / 重绑 %d / 第一查 %d）'
          % (_i_loop, _i_rebind, _i_check))
    BAD += 1
# 遮蔽自证：重绑须落在**循环体内那层 try 块**里（否则遮不到第一查）
_i_try_open = src.index('                try {', _i_loop)
if not (_i_try_open < _i_rebind):
    print('★★ 遮蔽位置不对：重绑须落在循环体内那层 try 块的顶层')
    BAD += 1
# 结构自证：花括号净差必须与基线一致
_ob, _cb = src.count('{'), src.count('}')
if (_ob - _cb) != (_OB0 - _CB0):
    print('★★ 结构漂移：花括号净差 %d → %d（基线 %d）' % (_OB0 - _CB0, _ob - _cb, _OB0 - _CB0))
    BAD += 1
print('[patch3302b] 花括号 开=%d 闭=%d（基线 开=%d 闭=%d）' % (_ob, _cb, _OB0, _CB0))
print('[patch3302b] 完成：%d 处替换 / %s；复核未通过 %d 处' % (len(_edits), REL, BAD))
for _o, _n, w in _edits:
    print('   · ' + w)
sys.exit(1 if BAD else 0)