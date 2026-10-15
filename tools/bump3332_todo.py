#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.332.0 TODO 头部同步：新增「最近更新：v3.332.0」行，旧 v3.331.0 行降为历史留痕。

结构（仿 v3.331.0 先例）：
  行19 现为「> **最近更新：v3.331.0 —— …」
  改法：在其上插入新的 v3.332.0 最近更新行；旧行前缀改为「> **历史留痕：v3.331.0 —— …」
"""
import io

ROOT = '/home/user/lonsha-memory-plugin/'
P = ROOT + 'TODO.md'

NEW_LINE = "> **最近更新：v3.332.0 —— 第四期第四项 M4-O4:异步查询接到真实问答与资料页(P0 / L)**(第四期产品主线包B第二项)。★ **修的是什么(修前实测)**:`evidence-query.js::queryAsync` 内核能力(分片扫描/让出事件循环/片间取消检查)早已在盘上,但没有任何真实出口:`index.js::askMemoryQuestion` 仍是同步问答出口、`memory-tools-api.js` 只包装同步 `query`。★ **本刀(三面接线)**:① 内核面:`queryAsync` 增 `onShard` 回调,尾片额外触发最终进度,`QUERY_VERSION` 2→3;② 统一面:能力表五→六(`queryEvidenceAsync`),词表五态→六态(`canceled` 与 empty/partial 都不同形);修自伤一处 —— `selfCheck` statesComplete 写死 `STATES.length === 5` 在六态下恒 false,改为对齐词表自身;外供登记表 memoryToolsEnvelope 行同步六能力/六态;③ 宿主面:`memoryToolsSources()` 第六格装载,新出口 `plugin.queryEvidenceAsync(spec,opts)` 与异步问答 `plugin.askMemoryQuestionAsync(question,opts)`(taskId/shouldCancel/onProgress/shardRows,取消时 gaps 具名 kind:canceled),同步问答出口原样保留。★ **定向验收**:`tests/v3332_m4o4_async_query.test.mjs` 14 条全绿(含三条真源码破坏负控制);v3305 旧口径抬升六能力/六态(13/13);与 v3330/v3331 合计定向 68/68;宿主基线重建至 19412 行/730 成员(ceiling 19812)。★ **诚实边界**:真实宿主 UI 与真实模型问答未跑;全量 `npm test` 按纪律集中到第四期收口点跑一次;本版**全量待验**。\n"


def main():
    t = io.open(P, encoding='utf-8').read()
    if '最近更新：v3.332.0' in t:
        print('SKIP: TODO 已含 v3.332.0 最近更新行')
        return
    anchor = '> **最近更新：v3.331.0'
    idx = t.find(anchor)
    assert idx >= 0, 'TODO 缺 v3.331.0 最近更新锚'
    # 旧行降为历史留痕（只改前缀，「最近更新」→「历史留痕」）
    t = t[:idx] + '> **历史留痕：v3.331.0' + t[idx + len(anchor):]
    # 在其上插入新行
    t = t[:idx] + NEW_LINE + t[idx:]
    io.open(P, 'w', encoding='utf-8').write(t)
    t2 = io.open(P, encoding='utf-8').read()
    assert t2.count('最近更新：v3.332.0') == 1
    assert t2.count('历史留痕：v3.331.0') == 1
    print('OK TODO.md: v3.332.0 最近更新行插入,旧行降历史留痕')


if __name__ == '__main__':
    main()