#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.350.0 抬版（第五期第一批四项 + 手机 R5-O9 的委托口）。

六源同源（scan_version_guard V1/V1b/V6/V7 把守）：
  index.js `const VERSION = '3.349.0';`
  manifest.json / package.json `"version": "3.349.0"`
  memory-config.js / memory-core.js / memory-organs.js `let VERSION = '3.349.0'`
人读两处：CHANGELOG 顶节 / TODO「最近更新：vX.Y.Z」行（按行首整行替换）。
外加 PLAN「当前执行状态(...,vX.Y.Z)」行与 README「当前版本」行。

本版**无新模块**（qa-thread / fact-version / commitment-ledger / lore-crosscheck
都已在 extra_js 里），故 extra_js 项数不变（113）—— 这与 v3.349.0 同形。
每条锚点 count==1，否则 abort；幂等：已是 3.350.0 则跳过。
"""
import io
import json
import os
import re
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
OLD = '3.349.0'
NEW = '3.350.0'
WRITE = '--write' in sys.argv
BAK = '/tmp/bak3500/'
os.makedirs(BAK, exist_ok=True)


def rd(rel):
    with io.open(ROOT + rel, encoding='utf-8') as f:
        return f.read()


def wr(rel, s):
    with io.open(ROOT + rel, 'w', encoding='utf-8') as f:
        f.write(s)


results = []


def bump_once(rel, old, new, tag):
    s = rd(rel)
    if old not in s:
        if new in s:
            results.append((tag, 'SKIP(已是新版)'))
            return
        raise SystemExit('FAIL: %s 找不到锚点 %s' % (tag, old[:60]))
    n = s.count(old)
    if n != 1:
        raise SystemExit('FAIL: %s 锚点命中 %d 次(应为 1)' % (tag, n))
    if WRITE:
        with io.open(BAK + rel.replace('/', '_') + '.pre3500', 'w', encoding='utf-8') as f:
            f.write(s)
        wr(rel, s.replace(old, new))
    results.append((tag, 'bump'))


# ── ① 六源同源 ──
bump_once('index.js', "const VERSION = '" + OLD + "';", "const VERSION = '" + NEW + "';", 'index.js/VERSION')
for m in ['memory-config.js', 'memory-core.js', 'memory-organs.js']:
    bump_once(m, "let VERSION = '" + OLD + "';", "let VERSION = '" + NEW + "';", m + '/VERSION')
for m in ['manifest.json', 'package.json']:
    bump_once(m, '"version": "' + OLD + '"', '"version": "' + NEW + '"', m + '/version')

# ── ② V6 CHANGELOG 顶节 ──
CL_HEAD = '## v' + NEW
CL_NEW_SECTION = (
    '## v' + NEW + '\n'
    + '*第五期第一批四项（M5-O1 / M5-O2 / M5-O3 / M5-O8）+ 手机 R5-O9 的条件清除委托口（P0 / L）**\n'
    + '★ **修的是什么（修前实测，读码可复算）** -------------------------------------------------------------\n'
    + '四项都是「看起来没坏但读数不对」那一族，且每一项都有一条**方向相反**的错读数：\n'
    + ' ① **M5-O1** `qa-thread.js` 只有 `atFloor` 一个数 —— 「截至第20楼她住哪」（**上界**）与\n'
    + '    「第20楼以后呢」（下界）在**同一个数字**上落出相反的查法；且宿主\n'
    + '    `Object.assign({}, p.spec, ts.spec)` 用线程条件**覆盖**每个子计划，\n'
    + '    多人比较的「各查一人」退化成「两条查同一坨」。\n'
    + ' ② **M5-O2** `fact-version.js::copyFact` 是白名单逐字段重建，`modality` 不登记就\n'
    + '    **活不过一次 normalize** ⇒ 梦里的死与现实的死在保存重开后同形。\n'
    + ' ③ **M5-O3** `lore-crosscheck.js::verdictOf` 只做子串命中 —— 资料期望「归还」而剧情写\n'
    + '   「尚未归还」时 `indexOf(\'归还\') >= 0` 成立 ⇒ 判 matched，**把明确的反证读成吻合**。\n'
    + ' ④ **M5-O8** `commitment-ledger.js::normalize` 对有效 items 做 `slice(-MAX_ITEMS)`\n'
    + '    —— 201 条 open 归一后**最旧的未完成项静默消失**，而这件事在读数上**没有落点**。\n'
    + '★ **本刀做什么（四刀，都不新增条件键 / 不建第二套库）** -----------------------------------------\n'
    + ' · **O1 时间操作三态**：`QT_TIME_OPS` = at / as-of / since + 空。方向只认**本句**字面标记，\n'
    + '   两者都没标 ⇒ 沿用上一轮，都无 ⇒ 空（**不猜方向**）；`as-of` 的上界走**独立一格**\n'
    + '   `specEx.floorTo`（本面键集合仍是既有 FILTERS 键，不造第二份条件真源）；\n'
    + '   `threadSpec(thread, existing)` 逐子计划只填缺省、**不覆盖**。\n'
    + ' · **O2 层标注落进账**：`copyFact` 登记 `modality`（不校验层名合法性 —— 层清单的单一真源在\n'
    + '   narrative-layer.js，本账只当不透明字符串）；`factFp` 把层也纳入指纹（同值不同层是两件事）；\n'
    + '   旧档缺该字段一律读回 `null`（「未标注」不是「现实」），未标注面指纹口径**一字未变**。\n'
    + ' · **O3 极性与覆盖**：`NEG_WORDS` 词表（长词在前）判极性，命中串**前面窗口**与**自身**都看；\n'
    + '   核命中而极性相反 ⇒ divergent（**反证优先**）；命中全在 `atFloor` 之外或调用方报\n'
    + '   `chatCoverage !== \'complete\'` ⇒ unchecked（**不说「未发生」**）；不传 opts 时逐字同修前。\n'
    + ' · **O8 容量语义**：`capItems` **只算不写**（未完成优先占预算，同类保留最新、保持原相对顺序），\n'
    + '   返回逐类丢弃计数；`open` 遇「会挤掉未完成项」时**显式拒绝**（`reason:\'capacity\'`）\n'
    + '   —— 完成史被裁是既有归档策略，待办被裁才是不可接受的损失，两者**不得压成同一条判据**。\n'
    + ' · **手机 R5-O9 的委托口**：`advanceThread` 收 `opts.clear`（可清轴表 `QT_CLEAR_AXES` 随面导出）；\n'
    + '   顺序是**先按本句算新值、再按清除表抹掉该轴**（用户明说的那一句优先于一个界面动作）；\n'
    + '   清不掉的一律具名四形（轴名不在表里 / 本来就没有 / 本句新设优先 / 清成了什么）。\n'
    + '★ **定向复验**：`tests/v3500_m5_batch.test.mjs` **20 条**（A 六条真跑口径 / B 宿主接线 /\n'
    + '  D1~D10 十条真源码破坏负控制（各带原版阳性对照）/ F1 判据纯度 H5 / F2 工具两向自证 H6 /\n'
    + '  G1 版本锚）。首跑四处红**逐条归因**：三处是**判据自身**的缺陷（切片起点从头 indexOf 取到了\n'
    + '  更早的函数、单行化把 `key: (` 折叠成 `key:(` 导致字面量恒不命中、破坏写法与真落点不符），\n'
    + '  一处是抬版前的预期红 —— 没有一处是产品代码坏了。\n'
    + '★ **本版不做**：不新增条件键 / 不新增持久化键 / 不建第二套查询或事实库；\n'
    + '  不把 `floorFrom` 全局改成 `floorTo`（只让方向可辨）；不联网；不依赖每次额外 LLM 判真。\n'
    + '★ **诚实边界**：真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**；\n'
    + '  M5-O1 的「按原问题查询」在本仓验到**条件真的传进 spec**（各子计划逐条），\n'
    + '  真实查询结果与模型措辞属真宿主面；全量 `npm test` **读数未登记** ⇒ 本版**全量待验**。\n'
    + '· 退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移（本仓扫描器契约；本节同款声明供 D9 核对）。\n'
)
s = rd('CHANGELOG.md')
if s.startswith(CL_HEAD):
    results.append(('CHANGELOG.md/顶节', 'SKIP(已写)'))
else:
    if not s.startswith('## v' + OLD):
        raise SystemExit('FAIL: CHANGELOG 顶节不是 v' + OLD + '，实际:' + s.split(chr(10))[0][:40])
    if WRITE:
        with io.open(BAK + 'CHANGELOG.md.pre3500', 'w', encoding='utf-8') as f:
            f.write(s)
        wr('CHANGELOG.md', CL_NEW_SECTION + '\n' + s)
    results.append(('CHANGELOG.md/顶节', 'bump'))

# ── ③ V7 TODO「最近更新」行 ──
tp = rd('TODO.md')
tl = tp.split(chr(10))
hit = [i for i, l in enumerate(tl) if l.startswith('> **最近更新：v')]
if not hit:
    raise SystemExit('FAIL: TODO 里找不到「最近更新：vX.Y.Z」行')
if ('v' + OLD) in tl[hit[0]] and ('v' + NEW) in tl[hit[0]]:
    results.append(('TODO.md/最近更新', 'SKIP'))
elif ('v' + OLD) not in tl[hit[0]]:
    raise SystemExit('FAIL: TODO 最近更新行不是 v' + OLD + ':' + tl[hit[0]][:80])
else:
    if WRITE:
        with io.open(BAK + 'TODO.md.pre3500', 'w', encoding='utf-8') as f:
            f.write(tp)
        tl[hit[0]] = tl[hit[0]].replace('v' + OLD, 'v' + NEW, 1)
        wr('TODO.md', chr(10).join(tl))
    results.append(('TODO.md/最近更新', 'bump'))

# ── ④ PLAN「当前执行状态」+ README「当前版本」 ──
pl = rd('PLAN.md')
m = re.search(r'当前执行状态[（(][^,，)）\n]{1,24}[,，]v?([0-9]+[.][0-9]+[.][0-9]+)[）)]', pl)
if not m:
    raise SystemExit('FAIL: PLAN 缺「当前执行状态(…,vX.Y.Z)」行')
if m.group(1) == NEW:
    results.append(('PLAN.md/当前执行状态', 'SKIP'))
elif m.group(1) != OLD:
    raise SystemExit('FAIL: PLAN 当前执行状态写 v' + m.group(1) + '，既非 %s 也非 %s' % (OLD, NEW))
else:
    if WRITE:
        with io.open(BAK + 'PLAN.md.pre3500', 'w', encoding='utf-8') as f:
            f.write(pl)
        pl = pl[:m.start(1)] + NEW + pl[m.end(1):]
        wr('PLAN.md', pl)
    results.append(('PLAN.md/当前执行状态', 'bump'))

rm = rd('README.md')
if ('**当前版本**：`' + NEW + '`') in rm:
    results.append(('README.md/当前版本', 'SKIP'))
elif ('**当前版本**：`' + OLD + '`') not in rm:
    raise SystemExit('FAIL: README 缺「当前版本」行')
else:
    if WRITE:
        with io.open(BAK + 'README.md.pre3500', 'w', encoding='utf-8') as f:
            f.write(rm)
        rm = rm.replace('**当前版本**：`' + OLD + '`', '**当前版本**：`' + NEW + '`', 1)
        wr('README.md', rm)
    results.append(('README.md/当前版本', 'bump'))

for t, s2 in results:
    print('%-28s %s' % (t, s2))
if not WRITE:
    print('--- DRY RUN (pass --write to apply) ---')

# ── 自证 ──
if WRITE:
    mf = json.loads(rd('manifest.json'))
    assert mf['version'] == NEW, mf['version']
    assert len(mf['extra_js']) == 113, len(mf['extra_js'])
    assert rd('CHANGELOG.md').startswith('## v' + NEW)
    assert '最近更新：v' + NEW in rd('TODO.md')
    assert '当前执行状态' in rd('PLAN.md') and NEW in rd('PLAN.md')
    print('SELF-CHECK OK: version=%s extra_js=%d' % (NEW, len(mf['extra_js'])))