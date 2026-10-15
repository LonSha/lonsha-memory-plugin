#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.332.0 文档同步：CHANGELOG 顶部新条目 + PLAN 执行状态行 + TODO 头部引用行抬版。

防呆：
  - CHANGELOG 顶部必须是 ## v3.331.0（防重复插入）
  - 新条目插入后 grep 校验 ## v3.332.0 恰 1 次
  - PLAN 第 5 行块状引用整体替换（锚定「当前执行状态（2026-10-15，v3.331.0）」）
  - TODO 头部 v3.331.0 → v3.332.0（若在场）
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin/'

CHANGELOG_ENTRY = """## v3.332.0
**第四期第四项 M4-O4:异步查询接到真实问答与资料页(P0 / L)**(第四期产品主线包B第二项)。★ **修的是什么(修前实测)**:`evidence-query.js::queryAsync` 内核能力(分片扫描 / 让出事件循环 / 片间取消检查)早已在盘上,但**没有任何真实出口**:`index.js::askMemoryQuestion` 仍是同步问答出口、`memory-tools-api.js` 只包装同步 `query` —— 异步能力「建好了但没接线」,与新任务发起旧查询时**互不知晓取消**、大库查询期间**无法报告实际扫描进度**。★ **本刀(三面接线,不复制第二套查询逻辑)**:① **内核面**:`queryAsync` 增 `onShard` 回调(每片让出时上报 rows/totalRows/shard);不足一个完整分片的尾片**额外触发一次最终进度**(进度读数到不了 100% 的静默截断不再);`QUERY_VERSION` 2 → 3。② **统一面**:`memory-tools-api.js` 能力表五 → 六,登记 `queryEvidenceAsync → queryAsync`;词表五态 → 六态(`canceled`:取消不是失败也不是「没有」,读数是已处理部分 `processed.rows/totalRows`,与 empty 明确没有、partial 触顶收窄**都不同形**);**本刀抓到的自伤一处**:`selfCheck` 的 statesComplete 仍写死 `STATES.length === 5` ⇒ 六态下恒 false(selfCheck 真失败而非测试口径过时),改为对齐词表自身(拆掉一态仍转 false,负控制不受影响);`line()` 的「五能力齐备」改为读 `counts.total`;外供登记表 memoryToolsEnvelope 行同步六能力/六态/取消失效条件。③ **宿主面**:`memoryToolsSources()` 第六格 `queryEvidenceAsync` 装载;新出口 `plugin.queryEvidenceAsync(spec, opts)`(缺席降级 unavailable/module-unavailable 不抛错);新异步问答出口 `plugin.askMemoryQuestionAsync(question, opts)` —— 复用 `planQuestion` / `queryAsync` / `composeAnswer` / 别名装配 / 因果边装配(**不重写第二套问答逻辑**),回执增 `async:true` / `taskId` / `state`(done|canceled) / `processed`;取消时 gaps 具名 `kind:'canceled'`;`_memoryToolsAbsent` 白名单六能力化 + canceled 态降级信封;同步问答出口**原样保留**(旧 API 兼容)。★ **定向验收(全部真跑)**:`tests/v3332_m4o4_async_query.test.mjs`(**14 条**)真加载 `evidence-query.js`(隔离 vm)+ 从 `index.js` 抽同一份函数体文本装宿主侧(wrapAwaitBody 包异步 IIFE);覆盖:同步/异步结果同源(同一份 assemble)、2 万行真扫描、shardRows=500 时 40 次让出与进度单调、尾片最终进度、取消后 `processed:{rows:2000,totalRows:20000}`、取消与空集**不同形**、进度回调抛错不阻断、信封恒定 14 键、六能力登记、宿主真实接线、异步问答恒定键面、模块缺席降级、三条真源码破坏负控制(H5 判据纯度 + H6 工具两向自证 + fail-closed)。**v3305 旧口径同步抬升**(五能力/五态 → 六能力/六态,负控制锚点换 canceled 拆除位):修后 v3305 13/13。与 v3330(28)/v3331(26) 合计定向 **68/68** 全绿;宿主基线重建至 v3.332.0:实测 19412 行 / 730 成员(行预算 19644 → 19812 = 实测 + slack,成员 730 <= 753 在线内不抬,基线 reason 记 M4-O4 宿主增量)。· `scan_version_guard.mjs`:六源同源 3.332.0(manifest / package / CHANGELOG / TODO + 三个模块副本)。★ **本刀判据翻修留痕(第一版判据错,不是实现错)**:测试判据函数首版漏写 `async` ⇒ 语法错;宿主切片夹具 `new Function` 不支持直接解析 `await` ⇒ 增 `wrapAwaitBody` 包异步 IIFE;同步与异步问答方法体文本相同行导致旧测试真源码锚点误命中 2 次 ⇒ 仅改异步版行文恢复锚点唯一性。★ **诚实边界**:真实 SillyTavern 宿主的 UI 操作与真实模型问答**未跑**;全量 `npm test` 按纪律集中到第四期计划收口点跑一次(本版为定向复验),本版**全量待验**。

"""

PLAN_NEW_LINE = "> **当前执行状态（2026-10-15，v3.332.0）**：规划基线 `main@0f2f7fd`。本版是第四期 **M4-O4**（异步查询接到真实问答与资料页）实施点:`queryAsync` 增 `onShard` 与尾片最终进度(`QUERY_VERSION` 2→3)、`memory-tools-api.js` 六能力(`queryEvidenceAsync`)+六态(`canceled` 与 empty/partial 都不同形)、宿主双出口 `queryEvidenceAsync(spec,opts)` / `askMemoryQuestionAsync(question,opts)`(taskId/shouldCancel/onProgress/shardRows,取消时 gaps 具名 kind:canceled);`selfCheck` statesComplete 写死 5 的自伤已修(对齐词表自身);v3305 旧口径抬升六能力/六态(13/13)。专项套件 v3332 14 条,与 v3330/v3331 合计定向 68/68,宿主基线 19412/730(ceiling 19812)。上一项 M4-O3(v3.331.0,事件解释面)专项 26 条。本版 v3.332.0 未全量实跑,当前 v3.332.0 **全量待验**。\n"


def main():
    # ── CHANGELOG ──
    p = ROOT + 'CHANGELOG.md'
    t = io.open(p, encoding='utf-8').read()
    if '## v3.332.0' in t:
        print('SKIP: CHANGELOG 已含 v3.332.0 条目')
    else:
        head = '## v3.331.0'
        assert t.count(head) >= 1, 'CHANGELOG 顶部应存在 ## v3.331.0'
        t = t.replace(head, CHANGELOG_ENTRY + head, 1)
        io.open(p, 'w', encoding='utf-8').write(t)
        t2 = io.open(p, encoding='utf-8').read()
        assert t2.count('## v3.332.0') == 1, 'CHANGELOG 新条目须恰 1 次'
        print('OK CHANGELOG.md: 顶部插入 ## v3.332.0 条目')

    # ── PLAN ──
    p = ROOT + 'PLAN.md'
    t = io.open(p, encoding='utf-8').read()
    anchor = '> **当前执行状态（2026-10-15，v3.331.0）**'
    if 'v3.332.0）**：规划基线' in t:
        print('SKIP: PLAN 已是 v3.332.0')
    else:
        idx = t.find(anchor)
        assert idx >= 0, 'PLAN 缺 v3.331.0 执行状态锚'
        end = t.find('\n', idx)
        assert end > 0
        t = t[:idx] + PLAN_NEW_LINE.rstrip('\n') + t[end:]
        io.open(p, 'w', encoding='utf-8').write(t)
        t2 = io.open(p, encoding='utf-8').read()
        assert 'v3.332.0）**：规划基线' in t2, 'PLAN 新状态行须在场'
        assert 'v3.331.0）**：规划基线' not in t2, 'PLAN 旧状态行须被整体替换'
        print('OK PLAN.md: 执行状态行 → v3.332.0')

    # ── TODO ──
    p = ROOT + 'TODO.md'
    t = io.open(p, encoding='utf-8').read()
    if '（2026-10-15）' in t and 'v3.331' not in t.split('\n')[3]:
        pass
    # TODO 头部仅指向 PLAN,版本号若在场则同步;此处查
    old_head = '> **现行产品待办（2026-10-15）**'
    idx = t.find(old_head)
    end = t.find('\n', idx) if idx >= 0 else -1
    seg = t[idx:end] if idx >= 0 else ''
    if 'v3.331.0' in seg:
        t = t[:idx] + seg.replace('v3.331.0', 'v3.332.0', 1) + t[end:]
        io.open(p, 'w', encoding='utf-8').write(t)
        print('OK TODO.md: 头部 v3.331.0 → v3.332.0')
    else:
        print('SKIP: TODO 头部无版本串（指向 PLAN,无需改）')

    print('DONE 文档同步')


if __name__ == '__main__':
    main()