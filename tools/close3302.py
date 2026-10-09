#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.302.0 · M-O1（第一刀 + 第二刀）发布面收口：CHANGELOG 顶节 + TODO 当前行/历史留痕。

纪律：每处替换恰中 1 次；哨兵挡重复执行。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
_log = []


class Doc:
    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[close3302] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[close3302] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        _log.append((self.rel, why))

    def write(self):
        self.p.write_text(self.s, encoding='utf-8')


CHANGELOG_NEW = """## v3.302.0
**M-O1（第一刀 + 第二刀）会话身份写入闭环 —— 修「一个字节都没落地，却被记成已保存」**
- **★ 修前实测的真缺陷（三条，都有可复现序列，不是读源码推算）**：
  ① **await 之后不重核身份**。`save()` 在循环入口取一次 `ctx`，之后写
  `ctx.chatMetadata.extensions[STORAGE_KEY]`、再调 `ctx.saveChat()`；这两步之间各夹一次
  await（本批唯一的长 await 是摘要骤减紧急备份，落点之后是 `await saveChat()` 本身）。
  期间切聊 —— ST 走 `chat_metadata = {}`（**重新赋值**而非就地清空）—— 旧引用立刻脱钩：
  数据写进一个已脱离当前会话的对象，而 `saveChat()` 存的是**当前**会话 ⇒ **一个字节都没
  落地**，却被计为落盘证据、并把 `_confirmed` 推进到一次**从未发生**的落盘上（之后一路错档）。
  这一条**纯 chatId 字符串比对读不出来**：取数与被写是同一个旧对象，两边读到的 `file_name`
  完全一样（v3302 B1 的「同名换对象」子场景即此形状）。
  ② **队列级布尔冒充批次级回执**。`return true` 的条件是 `_persisted > 0`（整队有没有
  **任一批**落盘），不是「**调用方那一批**落了」。可达序列：`A→await→B` 期间 B 上来的写请求
  走合流排进队列，A 的落点被换掉 ⇒ 本批延期、B 那批真落盘 ⇒ **A 的调用方拿到 true**，
  按 `recordSaveFailed(src, ok === true)` 记成「已保存」（M-O1 验收⑤ 点名禁止的形状）。
  ③ **落盘证据无批次身份**。`_persisted` 只是计数，没有「调用方那一批为什么没落」的记录
  （M-O1 验收④要求区分 queued / confirmed / deferred / denied / failed）。
- **★ 第二刀（由第一刀的判据当场逼出，不是设计时想到的）**：第一刀做完，v3302 B2 的
  「A→await→B + 队列交错」配方实测出更坏的一条 —— 写盘循环把**排干批**（挂起集合里别人的
  批次）写进**当前会话**的 metadata：`[saveChat] 当前会话=B 槽.chatId=A`、`_confirmed` 指向
  一次从未属于 A 的落盘。根因：第一查的第二条用的是**入口那次调用**的快照 `_liveChatId`，
  而排干批**没有属于自己的快照** —— 于是「A 的数据写进当前 B 的 metadata」这条 v3.272 修掉的
  错档，在**队列路径**上依然可达。修法：把第一查第二条的比对对象从「入口快照」换成
  「**本批迭代开头重核过的当下身份**」，语义不变（仍是那条唯一的绝对口径、**不新增判据**，
  以免抹平第一查的唯一性让 v3272 C1 负控制回不到原病灶形态）。
- **交付**（`memory-organs.js` 的 `StorageManager.save`，**零新实例方法**、核验逻辑全部就地内联）：
  · **三处重核点**：循环入口 / 写入前（重取落点 `_ctxW`）/ `saveChat` 之后；
  · **批次回执对象** `_batch`（五态归宿 + 理由码），落回 `this._lastBatch`；
    合流分支记 `queued/coalesced`（对外仍回 true，v3.40「已受理」语义不得倒退）；
  · **返回值只描述调用方那一批**：本批没落 ⇒ 如实 `false`，整队另有批次落盘时整队状态记
    `partial`（既不是 confirmed 也不是 failed）；
  · **第三查用「约定槽里的本批唯一标记」**判「这笔写入还留在当前 metadata 里吗」——
    比对象身份比较更强，同时覆盖「对象换了」与「对象没换但内容被换掉」；
  · **归因口径不动**：`_lastWrite.error` 仍说「发生了什么」（宿主返回 false / 抛了什么异常），
    批次归宿另由 `entryStatus` / `entryReason` 承载（v3.140 / v3.166 的断言按此保持）。
- **判据**：`tests/v3302_mo1_write_closure.test.mjs`（**18 条**，全绿）——A1 结构 / A2 ★ 绝对口径
  不得重复 / A3 分支结构完整 / A4 ★ 两个 await 之间恰隔一个 await（五点序）/ B1 ★★ await 之后切聊
  （**两个子场景**，带**字节级证据**：宿主存下去的那一份里不得有本批数据）/ B2 ★ 延期批不得因
  别批落盘拿到 true（真交错）/ B3 宿主否认与抛错 / B4 同会话不误伤 / B5 身份未知放行 /
  B6 合流归宿 / C1~C4 四条**真源码破坏负控制**（约定槽判据 / 批次回执闸 / 声明顺序 / 重核点）+
  阳性对照同配方 / C5 工具两向自证 / D1 判据纯度（锚点字面量只此一处声明）/ D2 版本当版锚 /
  D3 登记面。★ 边界（诚实）：本档用**合成宿主**（真对象 + 真切聊动作）证明底层边界成立，
  **不**证明真 SillyTavern 里的时序 —— 那是真宿主 probe 的活。
- **交付过程留痕（自伤四处 + 一处判据自伤，全部记在补丁脚本与判据头部）**：
  ① **TDZ**：可变读数声明在取数器**之后** ⇒ 取数器首次调用落 TDZ、抛错被自身 catch 吞掉 ⇒
  身份恒为 null、核验整体失效（v3272 B1 当场转红）；② **块级作用域**：`_isEntry` 声明在
  `try {` 块内 ⇒ catch 与收尾读不到（v3140 当场点出）；③ **锚点没吃下结构行**：替换串重写
  `} else if (ctx?.chatMetadata) {` ⇒ 文件里凭空多出一个同名分支头、真写盘分支变 unreachable；
  ④ **复判抹平第一查**：二/三查用「目标 vs 当前」这套**绝对**口径 ⇒ 等于把第一查判第二遍、
  v3272 C1 负控制再也回不到原病灶形态。另有一处**判据自伤**：NEG 锚点表写成本文拼装
  （`'...' + NL`）⇒ 该值在文件里根本不存在、判据纯度检查计数 0 而自伤（已改为含真换行的模板）。
- **退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移**（本档沿用全仓口径；`node --test` 单套件为 0/1）。
- **本档绝不跑全量**：按用户纪律「做完计划全部内容前别跑全量」，此处只跑本档定向门与相关单套件。
- 版本六处同步（`index.js` / `manifest.json` / `package.json` + `memory-config.js` /
  `memory-core.js` / `memory-organs.js` 副本）已抬至 **3.302.0**；`extra_js` **仍 87 项**
  （本版不新增模块）；测试文件 282 → **283**；当版锚由本档自带 `const CUR = '3.302.0'` 自锚常量形
  承担（`vnum(CUR) == 3302000`），无需回头改历史档。

"""


def main():
    C = Doc('CHANGELOG.md')
    if CHANGELOG_NEW.split('\n')[0] in C.s:
        sys.exit('[close3302] CHANGELOG 顶部已含 v3.302.0 节（重复执行）')
    C.sub('## v3.301.0\n', '## v3.301.0（历史留痕）\n', 'v3.301.0 降为历史留痕')
    C.s = CHANGELOG_NEW + C.s
    _log.append(('CHANGELOG.md', '顶部插入 v3.302.0 节'))
    C.write()

    T = Doc('TODO.md')
    T.sub('> **最近更新：v3.301.0**', '> **历史留痕：v3.301.0**（原当前行）', 'v3.301.0 行降为历史留痕')
    TODO_NEW = (
        '> **最近更新：v3.302.0** —— **M-O1（第一刀 + 第二刀）会话身份写入闭环**（第二期优化计划第一条落版）。'
        '★ 修前实测三条真缺陷：① `save()` 在循环入口取一次 `ctx`，之后跨两次 await 才写盘 —— '
        '期间切聊（ST 走 `chat_metadata = {}` **重新赋值**）让旧引用脱钩 ⇒ **一个字节都没落地**，'
        '却被计为落盘证据并推进 `_confirmed`（**纯 chatId 比对读不出来**：取数与被写是同一个旧对象）；'
        '② `return true` 的条件是 `_persisted > 0`（整队任一批）而非调用方那一批 ⇒ '
        '`A→await→B` 交错下 A 的调用方拿到 true、被记成「已保存」（验收⑤ 点名禁止）；'
        '③ 落盘证据无批次身份（验收④要求五态可分辨）。'
        '★ **第二刀由第一刀的判据当场逼出**：写盘循环把**排干批**（挂起集合里别人的批次）写进'
        '**当前会话**的 metadata（`当前会话=B 槽.chatId=A`）—— 根因是第一查第二条用的是**入口那次调用**的'
        '快照 `_liveChatId`，而排干批**没有属于自己的快照**，于是 v3.272 修掉的错档在**队列路径**上仍可达。'
        '修法：三处重核点（循环入口 / 写入前 / `saveChat` 之后）+ 批次回执对象（五态归宿）+ '
        '返回值只描述调用方那一批（整队另有落盘时如实 `partial`）+ 第三查用「约定槽里的本批唯一标记」'
        '判写入是否还在当前 metadata 里 + 第一查第二条改比「本批当下身份」（**不新增判据**，'
        '以免抹平第一查的唯一性）。判据 `tests/v3302_mo1_write_closure.test.mjs`（**18 条全绿**，'
        '含四条真源码破坏负控制与带字节级证据的切聊负例）。'
        '★ 本版自伤四处（TDZ / 块级作用域 / 锚点没吃下结构行 / 复判抹平第一查）+ 一处判据自伤（锚点表拼装）'
        '全部记在补丁脚本与判据头部。\n')
    T.sub('> **历史留痕：v3.299.0**', TODO_NEW + '> **历史留痕：v3.299.0**', 'TODO 插入 v3.302.0 当前行')
    T.write()
    print('[close3302] 完成：')
    for rel, why in _log:
        print('  · %-16s %s' % (rel, why))


if __name__ == '__main__':
    main()