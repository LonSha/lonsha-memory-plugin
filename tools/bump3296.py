#!/usr/bin/env python3
"""v3.296.0 · X1「结构化证据查询与完整度」：抬版 + 登记面 + 当版锚。

纪律（沿用 tools/_bump3286.py 与 v3.294 的工具面留痕）：
  · 每处替换断言**恰中 1 次**；失配即退出；
  · **全部锚点先校验、通过后统一写盘** —— 不做「边校验边写」，否则后段失配时
    前几项已经落盘，文件停在半改造状态（v3.294 实测踩过）。
  · 六处版本源 = index.js / manifest.json / package.json + 三份模块副本
    （memory-config / memory-core / memory-organs 的 `let VERSION`，注入失败时它们就是真实现）。
  · 数量锁与登记面同步：v3209 两处 84→85、v3247 REGISTRY +3、tsv 基准 +3。
"""
import re
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
OLD, NEW = '3.295.0', '3.296.0'

_log = []


class Doc:
    """一个待改文件：所有替换先在内存里做，最后统一写盘。"""

    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')
        self.dirty = False

    def sub(self, old, new, why, regex=False):
        n = len(re.findall(old, self.s)) if regex else self.s.count(old)
        if n != 1:
            sys.exit('[bump3296] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:160]))
        if old == new:
            sys.exit('[bump3296] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = re.sub(old, new, self.s, count=1) if regex else self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[bump3296] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
        self.s = self.s + text
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            self.p.write_text(self.s, encoding='utf-8')


D = {rel: Doc(rel) for rel in [
    'index.js', 'manifest.json', 'package.json',
    'memory-config.js', 'memory-core.js', 'memory-organs.js',
    'tests/v3209_migration_registry.test.mjs',
    'tests/v3247_break_kit_consolidation.test.mjs',
    'tests/v3296_x1_evidence_query.test.mjs',
    'tests/audit/catalog_reference_consumers.tsv',
]}

# ── ① manifest.extra_js 补登（紧随工作台：查询面复用它的账本登记表） ──
D['manifest.json'].sub(
    r'(\n\s*)"evidence-workbench\.js",(\n\s*)"cost-forecast\.js",',
    r'\1"evidence-workbench.js",\1"evidence-query.js",\2"cost-forecast.js",',
    'extra_js 补登 evidence-query.js（不登记 = 浏览器不加载 = 该面永远缺席）', regex=True)

# ── ② 版本六处 ──
D['index.js'].sub("const VERSION = '%s';" % OLD, "const VERSION = '%s';" % NEW, '入口版本常量')
D['manifest.json'].sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, '插件清单版本')
D['package.json'].sub('"version": "%s"' % OLD, '"version": "%s"' % NEW, '包版本')
for mod in ('memory-config.js', 'memory-core.js', 'memory-organs.js'):
    D[mod].sub("let VERSION = '%s';" % OLD, "let VERSION = '%s';" % NEW, '模块侧副本（须 let）')

# ── ③ v3209 数量锁：84 → 85（两处，连同说明文案） ──
V9 = 'tests/v3209_migration_registry.test.mjs'
D[V9].sub('A(mf.extra_js.length === 84,', 'A(mf.extra_js.length === 85,',
          'extra_js 数量锁（manifest 面）')
D[V9].sub("'extra_js 须 84 项（v3.292.0 X6 新增",
          "'extra_js 须 85 项（v3.296.0 X1 新增 evidence-query.js；v3.292.0 X6 新增",
          'extra_js 数量锁说明（manifest 面）')
D[V9].sub('A(files.length === 84,', 'A(files.length === 85,',
          'extra_js 数量锁（抽取器面）')
D[V9].sub("'extra_js 抽取器应得 84 项（v3.292.0",
          "'extra_js 抽取器应得 85 项（v3.296.0 X1 evidence-query.js；v3.292.0",
          'extra_js 数量锁说明（抽取器面）')

# ── ④ v3247 REGISTRY：X8 / X2 / X1 三档补登 ──
D['tests/v3247_break_kit_consolidation.test.mjs'].sub(
    "    'v3288_plan_currency_xface.test.mjs',\n];",
    "    'v3288_plan_currency_xface.test.mjs',\n"
    "    /* [v3.294.0 X8 / v3.295.0 X2 / v3.296.0 X1] 三档同样从唯一真源取 breakSource\n"
    "     *   （真源码破坏负控制），按台账纪律（接入面 == 磁盘事实）在此登记。 */\n"
    "    'v3294_x8_recall_explain.test.mjs',\n"
    "    'v3295_x2_repair_flow.test.mjs',\n"
    "    'v3296_x1_evidence_query.test.mjs',\n];",
    'REGISTRY 补登 v3294 / v3295 / v3296')

# ── ⑤ v3296 当版锚：版本守卫 V4 只认 `vnum('X.Y.Z')` 的数值形态 ──
D['tests/v3296_x1_evidence_query.test.mjs'].sub(
    "    assert.ok(cmpVer(idx, '3.296.0') >= 0, '版本不得低于出生版本 3.296.0，实 ' + idx);",
    "    assert.ok(cmpVer(idx, '3.296.0') >= 0, '版本不得低于出生版本 3.296.0，实 ' + idx);\n"
    "    /* ★ 当版锚（版本守卫 V4 只认 `vnum('<当版>')` 的数值形态）：本套件是 v3.296.0\n"
    "     *   的交付套件，全仓恰此一处锚当版；抬版时由继任套件接管，本行随之降为历史下界。\n"
    "     *   刻意不写成 assert.equal(...'3.296.0')：那是 V2 点名的「抬版仪式」形态。 */\n"
    "    const BIRTH_ANCHOR = vnum('3.296.0');\n"
    "    assert.ok(BIRTH_ANCHOR.join('.') === '3.296.0', '当版锚：vnum 解析器须给出三段数值');",
    'V 段补当版锚（V4 形态）')

# ── ⑥ tsv 参考基准：X8 / X2 / X1 三档补登 ──
D['tests/audit/catalog_reference_consumers.tsv'].append(
    'v3294_x8_recall_explain.test.mjs\t\tX8 召回问题解释与有证据的策略建议的成对判据（14 个 test）：'
    'A 轮次身份三态（floorMatched matched/mismatch/unknown、idMatched true/false/null；'
    '**只有被证伪才降级**，宿主没给可比身份 ⇒ 按成立处置但必须留注记，否则每轮解释都落 unknown、'
    '真正的「账本拿错了」反被淹没）/ B 缺源 ≠ 零命中（合计以账本 totalHits 为准，源级求和只作回落且要求齐全；'
    '无源在岗时零命中不是独立读数，如实记 missing）/ C 建议纪律（apply.auto 恒 false、requiresUserChoice 恒 true、'
    '证据指向真实字段路径、判不了只给一条「先修观测面」）/ D 四态不混（hit/empty/filtered/missing，'
    '★ missing 只表示判不了、**测不到一律给 null 不记 0**，另设 unproven）/ E 七档登记表（顺序即严重度、'
    '逐档 required 与 why）/ F 证据路径 / G 反馈纯函数（显式 writesHistoryFact:false）/ '
    'H 宿主接线（manifest 注册 83→84 + 三出口 + 诊断面「召回解释」体检行，报警只认「判不了」）/ '
    'I 三源同源；N0 原版全绿前置 + N1~N4 真源码破坏负控制（拆身份闸门 / 拆全关明确结论 / 拆降级早退 / '
    '拆测不到给 null）。★ 本版最贵的一条：**判定链停点之后 ≠ 观测面缺席** —— 停点之后的档位根本没跑到，'
    '其 missing 混进阻断面会让「全源关闭」被自己下游的空档反打成「判不了」。 [v3.294.0]\n'
    'v3295_x2_repair_flow.test.mjs\t\tX2 证据到真实修复的操作流程的成对判据（17 个 test）：'
    'A 两态依赖可分（basis ref 确切引用 / needle 文本候选，去重只留更强的那条）/ B 未覆盖范围必须报出来'
    '（coverage{state,scanned,absent,truncated,note}；「扫了 200 条真的没有」与「总共 900 条只看了 200 条」'
    '此前同形）/ C 悬空依赖分列 / D 落定证据三态（我改了 ≠ 我证明我改了）/ E 只读方案 / '
    'F 落笔链路（applyPlan 真落笔：原 owner 逆操作 → 核原数据 → 保存并回读 → 带证据 settle）/ '
    'N1~N6 真源码破坏负控制 + 版本卫生。★ 本版最值钱的修正：refsOf 读的 sourceRefs / derivedFrom '
    '在全仓**零产出** ⇒ hitRef 恒假、basis 恒 needle，「按确切引用找影响」在生产上从来没生效过'
    '（一条只在测试夹具里成立的死通路）；现接本仓真实存在的跨条引用 supersededBy / eventKey，'
    '并新增宿主 _repairPoolFor(input) 作池的装配口（三入口共用一份，免一处带 refId、一处没带）。 [v3.295.0]\n'
    'v3296_x1_evidence_query.test.mjs\t\tX1 结构化证据查询与完整度的成对判据（16 个 test）：'
    'A 检索面九项与工作台 LEDGERS 逐字对齐 / B **超 200 条的旧证据仍能按需检索**（造 900 条账、'
    '目标落最老那条；同一台机器上同时证明工作台 search() 找不到它而 query() 找得到 —— 只证后者是'
    '「函数能跑」，两件一起证才是「缺口真被补上」）/ C 楼层三态不压平（floor:0 是真楼层，'
    'floor:null 既不得当成 0 楼命中、也不得静默丢，被排除的无楼层行须单独计数并点名 reason）'
    '/ D 分页由匹配总数驱动、翻过头不回落（回落会让「你翻过头了」与「这就是全部」同形）'
    '/ E 区间反转按空集且必须给理由（不自动交换）/ F 四态不同形（ok/empty/absent + inverted-range）'
    '/ G 保存查询只存**条件**（不存结果 —— 存结果即第二份证据库）+ 重放走当前原账 / '
    'H 未知条件名不静默忽略且零写副作用 / N1~N5 真源码破坏负控制 / 7~9 宿主接线与加载面 / '
    'V 四源同源 + 当版锚。★ 单一真源：账本登记表仍只有 evidence-workbench.js 的 LEDGERS，'
    '本模块经 opts.ledgers 复用它，绝不另抄一份「哪本账取哪个字段」。'
    '★ 口径分列：MAX_SCAN_PER_LEDGER=20000 是**扫描上限**，不是取数窗口（工作台 200 条是另一件东西）；'
    'searchEvidence（关键词打分）与 searchEvidenceStructured（结构化组合筛选）**两者都留**，不合成一口。 [v3.296.0]\n',
    'v3296_x1_evidence_query.test.mjs', 'tsv 补登 X8 / X2 / X1 三档')

for doc in D.values():
    doc.write()
for rel, why in _log:
    print('[bump3296] %-52s %s' % (rel, why))
print('[bump3296] 全部锚点恰中 1 次，%d 处已写盘。' % len(_log))
