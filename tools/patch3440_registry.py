#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.344.0 · M4-X6:全量回归九处失败中五档登记面补登(3/6/7/8/9)。
   一律结构性定位(不写全角锚点);每一处落笔前后逐条核对命中数。"""
import io, sys, os

ROOT = '/home/user/lonsha-memory-plugin'
def rd(rel):
    with io.open(os.path.join(ROOT, rel), 'r', encoding='utf-8') as f:
        return f.read()
def wr(rel, s):
    with io.open(os.path.join(ROOT, rel), 'w', encoding='utf-8') as f:
        f.write(s)

def repl_once(s, old, new, label, expect=1):
    n = s.count(old)
    if n != expect:
        print('!! ABORT %s 命中 %d 次(期望 %d)' % (label, n, expect))
        sys.exit(1)
    print('ok %s (命中 %d)' % (label, expect))
    return s.replace(old, new)

def insert_before_ledger_close(s, marker, rows, label):
    """在 `const <marker> = [` 之后最近的第一个 `\n];` 之前插入 rows。"""
    i = s.find('const %s = [' % marker)
    if i < 0:
        print('!! ABORT %s:找不到 const %s = [' % (label, marker)); sys.exit(1)
    j = s.find('\n];', i)
    if j < 0:
        print('!! ABORT %s:找不到登记表收口' % label); sys.exit(1)
    print('ok %s (登记表收口 @%d)' % (label, j))
    return s[:j + 1] + rows + s[j + 1:]

# ═════════════ 3. catalog_reference_consumers.tsv ═════════════
tsv_rel = 'tests/audit/catalog_reference_consumers.tsv'
tsv = rd(tsv_rel)
if 'v3440_m4x6_narrative_layer.test.mjs' in tsv:
    print('ok 3 tsv 已含 v3440 行(跳过)')
else:
    if not tsv.endswith('\n'):
        tsv += '\n'
    newline = (
        'v3440_m4x6_narrative_layer.test.mjs\t\t'
        '第四期 M4-X6(梦境、假设、计划与现实的叙事层记忆)的成对套件(**22 条 test**:含 6 条真源码破坏负控制):'
        'A1 宿主四面各恰一处 + 取库口 + 自检行「叙事层」 + extra_js 109 + **零落盘面**'
        '(无持久化契约键 / 不混 ARCHIVE·CARRYOVER)/ '
        'A2 内核面(NL_VERSION 1 / 五层 reality·dream·hypothesis·plan·quote + 一格 unspecified / '
        '十原语 modalityOf·frameOf·planStateOf·realityView·hintOf·itemOf·normOf·normFact·hasPercentKey·selfCheck / 自证七项)/ '
        'B1 层轴(五层各 1 + 未标注独立成格,不猜)/ '
        'B2 现实面隔离(梦里死 / 假设 / 计划 / 引述一条都不进,6 取 1 排除 5)/ '
        'B3 计划落实闸(一句「决定了」不自动完成仍 planned,带事件关联才成案)/ '
        'B4 嵌套可见且有界(depth 2 / 超 MAX_FRAMES 截断)/ '
        'B5 不猜(有「梦」线索词仍 unspecified,hintOf 只作提示读数)/ '
        'C1~C6 宿主六出口(取真源 / 现实面接线 / 分层投影 / 缺模块三态降级具名 / 诊断行四方分开说 / 缺省取数回落事实账与显式喂读数逐字一致)/ '
        'D1~D6 六条真源码破坏负控制(各带原版阳性对照:显式标注判定 / 现实面隔离 / 计划闸 / 嵌套框架 / 宿主取数 / 宿主现实面接线)/ '
        'F1 H5 判据纯度(六锚点在本档各恰 1 次、真源各恰中 1 次)+ F2 H6 工具两向自证 + G1 版本锚 v3.344.0(下界口径,不锁当版)。\n'
    )
    tsv += newline
    wr(tsv_rel, tsv)
    print('ok 3 catalog_reference_consumers.tsv 追加 v3440 行')

# ═════════════ 6. v3247 REGISTRY ═════════════
p6 = 'tests/v3247_break_kit_consolidation.test.mjs'
s6 = rd(p6)
if "'v3440_m4x6_narrative_layer.test.mjs'," in s6:
    print('ok 6 v3247 已含 v3440 项(跳过)')
else:
    old6 = "    'v3430_m4x5_testimony_board.test.mjs',\n];"
    new6 = (
        "    'v3430_m4x5_testimony_board.test.mjs',\n"
        "    /* [v3.344.0 · M4-X6] 本档从 tests/_break_kit.mjs 取 breakOnce\n"
        "     *   (六条真源码破坏:内核四处 —— 显式标注判定 / 现实面隔离 / 计划落实闸 / 嵌套框架\n"
        "     *   + 宿主两处 —— 取数回落 / 现实面接线);按 B1 台账纪律在此登记。 */\n"
        "    'v3440_m4x6_narrative_layer.test.mjs',\n];"
    )
    s6 = repl_once(s6, old6, new6, '6 v3247 REGISTRY 追加')
    wr(p6, s6)

# ═════════════ 7. v3281 LEDGER ═════════════
p7 = 'tests/v3281_o7_module_copy_ledger.test.mjs'
s7 = rd(p7)
if 'narrative-layer.js' in s7:
    print('ok 7 v3281 已含 narrative-layer(跳过)')
else:
    # 更新既有 oneLine / clip 成员集
    s7 = repl_once(s7,
        "    ['oneLine', ['causal-chain.js', 'correction-plan.js', 'extraction-driver.js', 'perspective-card.js', 'relation-history.js', 'relation-mutual.js', 'testimony-board.js'], 'e41493e8',",
        "    ['oneLine', ['causal-chain.js', 'correction-plan.js', 'extraction-driver.js', 'narrative-layer.js', 'perspective-card.js', 'relation-history.js', 'relation-mutual.js', 'testimony-board.js'], 'e41493e8',",
        '7 v3281 oneLine 成员集 +narrative-layer')
    s7 = repl_once(s7,
        "    ['clip', ['causal-chain.js', 'perspective-card.js', 'testimony-board.js'], '3a8dfbfa',",
        "    ['clip', ['causal-chain.js', 'narrative-layer.js', 'perspective-card.js', 'testimony-board.js'], '3a8dfbfa',",
        '7 v3281 clip 成员集 +narrative-layer')
    rows7 = (
        "    ['normOf', ['narrative-layer.js', 'testimony-board.js'], '6b485d94',\n"
        "        '事实取值归一的「取数口」(缺省回落自持口径,不引兄弟模块)。'\n"
        "        + '**为什么留两份**:与 oneLine / clip / numOrNull 同族 —— 通用取值原语;'\n"
        "        + '两模块装载时机与存活期互不包含(叙事层判定面可缺席而证词面在,反之亦然),'\n"
        "        + '收拢会把「本模块自足」换成「依赖另一个模块先挂载」(本仓反过的跨模块静默读旧值)。'\n"
        "        + '★ 本行是**当版自报**(与簇同批落盘、同批登记):v3.344.0 · M4-X6 的'\n"
        "        + 'narrative-layer.js 按仓内先例自持一份同形同值原语,体 md5 与磁盘同源。'],\n"
        "    ['hasPercentKey', ['narrative-layer.js', 'testimony-board.js'], '680c21ac',\n"
        "        '自证用的「不许出现百分比键」递归探针(纯只读,不改调用方对象)。'\n"
        "        + '**为什么留两份**:它是**自检原语** —— 每个模块对**自己的**导出面各算一遍'\n"
        "        + '「有没有百分比读数」,收拢成一份等于让两个模块的自证变成一次共用判断;'\n"
        "        + '两模块装载时机互不包含。'\n"
        "        + '★ 本行是**当版自报**(与簇同批落盘、同批登记),体 md5 与磁盘同源。'],\n"
    )
    s7 = insert_before_ledger_close(s7, 'LEDGER', rows7, '7 v3281 新簇 normOf/hasPercentKey')
    wr(p7, s7)

# ═════════════ 8. v3282 ALIAS_LEDGER ═════════════
p8 = 'tests/v3282_o7_alias_copy_ledger.test.mjs'
s8 = rd(p8)
if 'narrative-layer.js' in s8:
    print('ok 8 v3282 已含 narrative-layer(跳过)')
else:
    s8 = repl_once(s8,
        "    ['fn', ['normFact', 'normalizeFact'], ['knowledge-network.js', 'knowledge-trace.js', 'testimony-board.js'], 360, 'f9ab8403'],",
        "    ['fn', ['normFact', 'normalizeFact'], ['knowledge-network.js', 'knowledge-trace.js', 'narrative-layer.js', 'testimony-board.js'], 360, 'f9ab8403'],",
        '8 v3282 normFact 成员集 +narrative-layer')
    rows8 = (
        "    /* [v3.344.0 · M4-X6] 内核 narrative-layer.js 自持一份与 causal-chain / correction-plan /\n"
        "     *   extraction-driver / perspective-card / relation-history / testimony-board **逐字同源**的\n"
        "     *   楼层归一(`floorOf`,体长 234;别名 floorOrNull,与前者**同体不同名**,故归本档)。\n"
        "     *   本面是**零依赖 IIFE**,按仓内先例自持一份(不引兄弟模块:跨模块引用归一口径\n"
        "     *   会把两处抬版变成一处悄悄读旧值)。\n"
        "     *   ★ 本行是**当版自报**(与簇同批落盘、同批登记),体 md5 与磁盘同源。 */\n"
        "    ['fn', ['floorOf', 'floorOrNull'], ['causal-chain.js', 'correction-plan.js', 'extraction-driver.js', 'narrative-layer.js', 'perspective-card.js', 'relation-history.js', 'testimony-board.js'], 234, '245e905a'],\n"
    )
    s8 = insert_before_ledger_close(s8, 'ALIAS_LEDGER', rows8, '8 v3282 新簇 floorOf/floorOrNull')
    wr(p8, s8)

# ═════════════ 9. v3283 CONST_LEDGER ═════════════
p9 = 'tests/v3283_o7_const_table_copy_ledger.test.mjs'
s9 = rd(p9)
if 'narrative-layer.js' in s9:
    print('ok 9 v3283 已含 narrative-layer(跳过)')
else:
    rows9 = (
        "    /* [v3.344.0 · M4-X6] 内核 narrative-layer.js 的自证词表 `mutating` 与 testimony-board.js **同名同值**\n"
        "     *   (set/put/write/save/update/delete/clear/remove/commit/apply/persist/store 十二前缀)。\n"
        "     *   **为什么留两份**:它是**自检用的词表原语** —— 每个模块对自己的导出面各算一遍「写口数」,\n"
        "     *   收拢成一份等于让两个模块的自检变成一次共用判断;两模块装载时机互不包含。\n"
        "     *   ★ 本行是**当版自报**(与字典同批落盘、同批登记),len/md5 与磁盘同源。 */\n"
        "    ['mutating', ['narrative-layer.js', 'testimony-board.js'], 107, 'e213741d', '['],\n"
    )
    s9 = insert_before_ledger_close(s9, 'CONST_LEDGER', rows9, '9 v3283 新簇 mutating')
    wr(p9, s9)

print('=== PATCHED 5 档 ===')