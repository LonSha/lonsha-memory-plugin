#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 CHANGELOG:在顶节 `## v3.344.0` 之前插入 `## v3.345.0` 新节。

★ 本脚本第 2 版重写原因(与 tools/patch3445_lock.py 同款坑):
  第 1 版用「一整条超长字符串 + 逐段 `+` 拼接」,实测**漏了一个 `+`** ⇒ 整份脚本
  SyntaxError。本版改为 **`LINES` 列表 + `\\n`.join**:每行一条独立字符串字面量,
  不再有跨行拼接,结构上不可能漏 `+`。
锚点纪律:顶节锚 `## v3.344.0` 是纯 ASCII,须在**文首**恰 1 次。
"""
import io
import os
import sys

P = '/home/user/lonsha-memory-plugin/CHANGELOG.md'
BAK = '/tmp/bak3445/'
orig = io.open(P, encoding='utf-8').read()
HDR = '## v3.344.0'
if orig.count(HDR + '\n') != 1 or not orig.startswith(HDR):
    sys.stderr.write('FAIL: 顶节锚点命中 %d 次或不在文首\n' % orig.count(HDR))
    sys.exit(41)

LINES = [
    '## v3.345.0',
    '**第四期拓展第七项 M4-X7:旧事重现进入真实生成且由玩家控频(P1 / L)**(第四期产品拓展包第三包「生成的时序」)。★ **修的是什么(修前实测,读码可复算)**:`fated-recall.js`(v3.328.0 · F 包 M3-X8)已交付四步「情境 → 触发键 → 候选(相关性 + 冷却 + 知情面)→ 用户可选策略」,并明写「候选只到**建议重现 + 来源**为止,不产出任何正文」。它答的是「此刻**为什么**该想起来」,**不答**三个下游问题:',
    '1 **候选可注入 ≠ 生成管线真的用过** —— `injectable` 是一个**静态判断**(策略允许时给出一组可注入候选),但那一组从未被登记为「本轮**实际**进了允许的生成通道」——读数上「给了 12 条可注入」与「真用了 1 条」**同形**。',
    '2 **没有生命周期** —— `FR.markShown` 只记「展示过」(纯冷却用),而**预览**(玩家看到提示后决定「这次不提」)与**使用**(真的把这条写进本轮生成)两种动作在账上**完全没有分列**;于是「预览了一下就取消」会把冷却**误消耗**,下一轮想提也提不出来(计划「不做」区明写「预览不消耗冷却」)。',
    '3 **没有控频强度档** —— `FR.POLICY` 只有 off / hint-only / inject 三态,而**默认**是什么、「重开/切回会不会重复轰炸」没有闸(验收明写「默认提示,显式允许才自动注入」「重开/切回不重复轰炸」)。',
    '★ **本刀(内核控频闸 / 宿主接线面 + 持久化收口,不建常驻提醒代理、不产正文、不写库)**:',
    '1 **内核控频闸** —— 新模块 `return-gate.js`(`RG_VERSION 1`,`RG_KIND \'return_gate\'`,585 行 / 32454 字节 / md5 `d9968a7407abb52edface48f929894cb`,零依赖 IIFE 双导出);**生命周期三通道分列** `preview`/`shown`/`used`,而 `COOLDOWN_CHANNELS` **只含 shown·used** ——「**预览一律不消耗冷却**」是本刀立身之本;**控频强度档** `POLICY` off / hint-only / inject(默认 `hint-only`,**只有显式 inject 才产出可注入面**,`off` 恒零,三态各自读数**不同形**);**重复轰炸闸** —— 同 (触发键, 旧事键) 在 `REPEAT_WINDOW 3` 楼内已 shown/used ⇒ 再问一律 `held`(reason `repeat-window`),且**预览过不算**;**反馈只是呈现偏好** `PREFERENCE` normal / less / never(`never` ⇒ blocked、`less` ⇒ held,但**绝不删除任何历史标记**);**情绪只读**(`emotionUsed:false`,内核绝不据情绪改写候选权重或强制重现);`gate` 闸序即优先级(off > never > 重复窗口 > less > open);`hasPercentKey` **不产置信百分比**;`build` 主流程 / `render` 人读渲染(**只给建议与来源与闸态,不产正文**)/ `line` 一行读数 / `selfCheck` **八项自证**(确定性 / 零写面 / 三通道齐 / **预览免费** / **展示与真用落冷却** / 默认 hint-only / 不产百分比 / 反馈不删历史 / 可序列化);导出面 **38** 项。',
    '2 **宿主接线面** —— 取库口 `_returnGateLib` + 五出口 `_returnGateCandidates(opts)` / `returnGateAdmit(opts)` / `returnGateMark(channel, rec)` / `returnGatePrefer(detailKey, pref)` / `_returnGateLine()` 诊断行;自检面「控频闸」行。**零顶层落盘面**:无 `returnGate:` 契约键、无 `data.returnGate`,不混 `ARCHIVE`/`CARRYOVER`;候选缺省取数回落 `fated-recall.js` 的 `suggest()`(**给不出就如实报 `no-fated`,不编候选**);`returnGateAdmit` 明写「**移交不算已用**」—— 实际使用后须调 `returnGateMark(\'used\', ...)` 才落冷却。',
    '3 **持久化收口(本会话新发现并修掉的真实缺口一)** —— 宿主注释写着「状态存 `worldProg.returnGate`(跨会话携带)」,而 `memory-organs.js` 的 `WorldProgress.export()` / `import()` 是**逐项枚举子键**的:`returnGate` **不在表里** ⇒ 存盘即丢、读档即空(**假声明**);且 `removeByFloor` / `shiftFloorRefs` 也不清理 `returnGate.marks` 的 `floor` ⇒ 被删楼层的冷却命中**永久留着**,把该条旧事在 `REPEAT_WINDOW` 内**永久 held** 且账上查不出原因。修法(`tools/patch3445_persist.py`):五处落点全在 `class WorldProgress` 内 —— constructor 声明 `this.returnGate = null;` / `export()` 增 `returnGate` / `import()` 增**畸形回落 null** / `removeByFloor(f)` 摘除 `floor===f` 的 marks 并计入 `removed` / `shiftFloorRefs(deleted)` 对 `> deleted` 的 marks.floor 减一。实测 `memory-organs.js` **131378 → 133556 字节**(md5 `5f4313e12bb08fd916e81adc73dbe3fc` → `fdd8332d4f67454c1773d924ea90ebe4`),`node --check` OK,幂等复跑 **零改写**;真跑探针 `/tmp/probe3445_organs.mjs` 九条读数全成立(构造器 null / 导出含 returnGate 且 marks 3 / 往返一字不差 / 畸形回落 null / `removeByFloor(5)` 摘 1 剩 [8,9] / `shift(7)` 楼层 [5,7,8] / prefs 穿越回滚保持在)。',
    '4 **宿主候选装配三态塌陷(本会话新发现并修掉的真实缺口二)** —— `_returnGateCandidates` 原文 `if (Array.isArray(o.candidates)) return {...source:\'given\'}` 会把「**显式给了畸形候选**」落到下一行去问 `fated-recall`,最终落成 `{candidates:[], source:\'no-fated\'}` ⇒ **畸形与「根本没给」在宿主层完全同形**(内核明明有 `malformedInput` / `judged:false` 两态,却在宿主层被**抹平**),下游一律读到「这一次没有候选」,查不出调用方把候选喂错了。修法(`tools/patch3445_hostsource.py`):判据从 `Array.isArray(...)` 改为 `o.candidates !== undefined && o.candidates !== null`(显式给了哪怕给错也**原样透传给内核判畸形**);实测 `index.js` **1317894 → 1318172 字节**,幂等。★ 这是 M4-X6「缺省取数」同族的**第二例**,已作为后续同类改动的检查清单项。',
    '★ **五条评判线索逐条落地(全部真跑读数,读码可复算)**:预览不消耗冷却(登记 preview 后 `cdUnjudged` 不动);展示与真用都落冷却;三通道账上可分;控频强度档三态**不同形**(off 恒 blocked / hint-only 可提但 injectable **恒 0** / inject 才非空);重复轰炸闸按窗生效且**预览过不算**;反馈只改呈现偏好、**marks 不被删**;不猜冷却 / 不编第 0 楼 / 不产百分比 / 情绪只读。',
    '★ **定向复验(全部真跑)**:`tests/v3445_m4x7_return_gate.test.mjs`(**687 行 · 26 条 test**;宿主侧从 `index.js` 真切片 + 真装载 `return-gate` 内核):A1 宿主五出口各恰一处 + 取库口 + 自检行 + `extra_js` 110 + 零顶层落盘面 + **worldProg 子键持久化三面齐** / A2 内核面(版本 + 三通道分列 + 冷却两档 + 三策略 + 三闸态 + 十七原语 + 自证八项)/ **A3 持久化面**(跨会话携带 + 删楼摘除 / 楼层前移)/ B 真跑六条(预览免费 / 展示·真用落冷却 / 三通道可分 / 幂等 / 非法通道拒绝 / 控频强度档三态不同形 / 重复轰炸闸 / 反馈不删历史 / 不猜不编不产百分比 / 入参三态不同形)/ C 宿主出口六条(取真源 / 缺省取数 no-fated 不编候选 / **移交不算已用** / 登记落 `worldProg.returnGate` + 交界自证 / 缺模块四态降级具名 / 诊断行四方分开说)/ D1~D8 **八条真源码破坏负控制**(各带原版阳性对照;含内核五处与宿主两处,第 8 条破坏的是 `memory-organs.js` 的 **export 面**)/ F1 H5 判据纯度(八锚点在本档各恰 1 次、真源各恰中 1 次)+ F2 H6 工具两向自证 / G1 版本锚 v3.345.0(下界口径,不锁当版)。单跑 `i tests 26 / i pass 26 / i fail 0`。',
    '★ **专项首跑六处红(逐条归因,不压平)**:三条是**测试自身数学错**(把基线写成绝对值)、一条文案不匹配、一条负控制在该夹具下**空转**(破坏后不改变任何读数,已改走可观测路径)、一条是**上面第 4 点的宿主真缺口** —— 由专项套件当场逼出,即「判据真抓到东西,不是为过门禁而改判据」。',
    '★ **抬版连带(全量实跑报出的失败面逐类处置)**:登记面三档副本台账补登(v3281 `clip`·`hasPercentKey` 两簇成员集 + v3282 新簇 `KINDS`/`TRIGGERS` + v3283 `mutating` 成员集与新簇 `POLICY`/`PERCENT_KEYS`)、`v3247` REGISTRY 与 `catalog_reference_consumers.tsv` 补登、`extra_js` 硬锁**交棒**(v3209 / v3324 / v3325 / v3328 / v3440 五档「恰 109」下界化为「>= 109」,末尾硬列表改判**语义**「本包模块仍未掉队」)、文档同步(CHANGELOG 顶节 / README 版本与在役面 / PLAN 执行进度与当前执行状态 / TODO 最近更新)、基线重建(宿主分诊 `host_beast`:行 21606 → **21739**,ceiling 22006 → **22139**(余量 400);成员 787 在线内**不抬**;死代码预算与状态报告 `state-report.json` 抬至 3.345.0)。★ 登记表的**真值全部由判据体在真磁盘上复算得出**(探针 `/tmp/probe3445_ledger.mjs` 逐字抽三档真源的判据体,**不手抄体长/md5**)。',
    '★ **本版两处交棒纪律留痕(踩过即记)**:1 补丁锚点**不得混用「ASCII 片段 + 中文文案」** —— 真源消息里的括号与逗号是全角,拼出来的锚点实测**命中 0 次**,且「打偏」与「已打过」**同形**(都表现为 0 次),故一律**纯 ASCII 探针 + 整条语句替换**;2 新写的中文注释**不得逐字复述旧锚点** —— 否则 H5 判据纯度(「锚点字面量在文件里只声明一次」)会当场翻红(本版实测踩过一次,已改成不复述的措辞)。',
    '· 退出码三档:0 卫生 / 1 真缺陷 / 2 结构漂移(本仓扫描器契约;本节同款声明供 D9 核对)。★ **诚实边界**:真实 SillyTavern 宿主的 UI 点击流与真实模型问答**未跑**(宿主新面以真切片 + 真装载内核验证调用口径);本面是**只读控频闸**(最终使用动作由调用方在真用后自行调 `returnGateMark(\'used\', ...)`,宿主**不代记**);「三类情绪场景人工评相关性」属**人工评审**,内核只提供读数、不报「自然」;全量 `npm test` **已实跑并逐类处置**,**读数未登记**(快照按纪律仍停 v3.328.0,登记留到第四期计划收口点) ⇒ 本版**全量待验**。',
]
NEW = '\n'.join(LINES) + '\n'
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'CHANGELOG.pre3445.md', 'w', encoding='utf-8').write(orig)
io.open(P, 'w', encoding='utf-8').write(NEW + orig)
print('PATCHED CHANGELOG.md(插入 ## v3.345.0:%d 行 / %d 字符)' % (len(LINES), len(NEW)))