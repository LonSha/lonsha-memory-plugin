#!/usr/bin/env python3
# v3.288.0 登记面补录：① catalog_reference_consumers.tsv（在役测试面全量）
#                      ② tests/v3247_break_kit_consolidation.test.mjs 的 REGISTRY（从唯一真源取破坏工具）
import pathlib
import sys

ROOT = pathlib.Path('/home/user/lonsha-memory-plugin')
BAND = 'v3288_plan_currency_xface.test.mjs'

DESC = ('计划陈旧口径门·X 系列面补一类（10 个 test）：v3.286.0 的 scan_plan_currency.mjs '
        '只把 P4 钉在 **O1–O8** 上，**X 系列完全不在枚举面内** —— 于是本仓已于 v3.270.0 交付的 '
        'X1 被写进了现行排序节第 3 条「X 系列首批」（待做），名字还写错。本档为新增 P8 与修正 '
        '后的 P4 补**成对判据**：A P8 在场且只认**条目标题**（`N. **…**` 加粗段）里点名的编号 / '
        'B1 标题点名已交付 X1 ⇒ exit 1 / B2 仅说明面提及 ⇒ exit 0（防误红）/ B3 现状节无 X 行 ⇒ '
        '跳过档如实报出 / C1 P4 纯度：标题未标状态 + **邻条说明含「交付」** ⇒ 仍须 exit 1 '
        '（跨条借词不得放行，H5）/ C2 P4 标题自带收口 ⇒ exit 0 / D PLAN 事实面：X1 在已交付列、'
        'O2「未收口」显式在列 / E 判据纯度：5 锚点各恰 1 个持有常量（含 String.raw 形态）+ '
        '扫描器锚点命中数按期望（bulletRe 为 P4/P8 **同构复用**、真源恰 2 处，写成 1 会把正确源码判红）/ '
        'F 真源码破坏：摘掉 P8 判据体 ⇒ 同款场景不再翻红（走唯一真源 breakSource）/ G 自防护 + '
        '当版锚点（vnum 数值形态，V4 计数）。★ 本档两处首版缺陷已修正并留痕：① 含反斜杠的锚点用'
        '普通引号串被 JS 吃掉转义（`\\s`→`s`），常量值不再等于真源代码行 ⇒ 改 String.raw；'
        '② 锚点纯度断言写成「文件含锚点值」，对含反斜杠的锚点恒假 ⇒ 改「声明形态恰出现 1 次」。 '
        '[v3.288.0]')

# ---------- ① catalog_reference_consumers.tsv ----------
TSV = ROOT / 'tests' / 'audit' / 'catalog_reference_consumers.tsv'
lines = TSV.read_text(encoding='utf-8').split('\n')
if any(l.split('\t')[0] == BAND for l in lines):
    print('TSV: already listed')
else:
    if not lines[-1].strip():
        lines.insert(len(lines) - 1, BAND + '\t\t' + DESC)
    else:
        lines.append(BAND + '\t\t' + DESC)
    TSV.write_text('\n'.join(lines), encoding='utf-8')
    print('TSV: appended')

# ---------- ② REGISTRY ----------
REG = ROOT / 'tests' / 'v3247_break_kit_consolidation.test.mjs'
src = REG.read_text(encoding='utf-8')
anchor = "    'v3287_ui_interaction.test.mjs',\n"
if ("'" + BAND + "'") in src:
    print('REGISTRY: already listed')
    sys.exit(0)
if src.count(anchor) != 1:
    print('ANCHOR-NOT-UNIQUE:', src.count(anchor))
    sys.exit(1)
insert = (anchor
          + "    /* [v3.288.0 X 系列面补一类] 新套件同样从唯一真源取 breakSource / assertSingleHit，\n"
          + "     *   按台账纪律（接入面 == 磁盘事实）在此登记。 */\n"
          + "    '" + BAND + "',\n")
REG.write_text(src.replace(anchor, insert, 1), encoding='utf-8')
print('REGISTRY: inserted')