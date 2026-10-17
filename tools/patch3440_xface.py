#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.344.0 M4-X6 宿主接线面:三处锚点(取库口 / 出口 / 自检面行)。

纪律(照 build3430 系列):
  · 每处锚点必须**唯一命中**否则 abort(退出码非 0);
  · 已改则幂等跳过,不重复插;
  · 落盘前备份到 /tmp/bak3440/。

★ 锚点一律**按行号 + ASCII 子串定位**,不写全角字符的字面锚:
  本仓的注释行混用全角括号/冒号(U+FF08/FF1A/FF09),字面锚极易失配
  (v3.344.0 实测:出口锚写成半角 `(**...**:...)` 命中 0 次)。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
TARGET = ROOT + 'index.js'
BAK = '/tmp/bak3440/'

src = io.open(TARGET, encoding='utf-8').read()
orig = src
lines = src.split('\n')
changed = []

# ---------------------------------------------------------------- 1 取库口
GET_OLD = (
    "    function _testimonyBoardLib() {\n"
    "        return _moduleLib(() => window.LonShaTestimonyBoard, 'testimony-board.js');\n"
    "    }\n"
)
GET_NEW = GET_OLD + (
    "    // [v3.344.0 · M4-X6] 叙事层(modality:narrative-layer.js)。为什么需要:\n"
    "    //   memory-type 的 9 类是「这是什么性质的事实」,fact-version 记的是「哪个时态区间」,\n"
    "    //   knowledge-trace 记的是「谁怎么知道的」—— 但**没有一处**记「这条事实处在哪一层叙事外壳」\n"
    "    //   (现实 / 梦境 / 假设 / 计划 / 引述)。于是同一个 event-outcome「角色死亡」\n"
    "    //   在现实与在梦里**读数同形**:梦到的死会被现实问答当成真值吃进去;\n"
    "    //   一句「决定了搬走」会把 plan 事实直接读成已完成。\n"
    "    //   本模块是**只读层判定**:层标注落在既有条目上(modality 字段),不建平行时间线、\n"
    "    //   不落盘、老数据不批量重标(无标注一律 unspecified —— 不猜)。\n"
    "    function _narrativeLayerLib() {\n"
    "        return _moduleLib(() => window.LonShaNarrativeLayer, 'narrative-layer.js');\n"
    "    }\n"
)
if '_narrativeLayerLib' in src:
    print('SKIP 取库口(已存在)')
else:
    n = src.count(GET_OLD)
    if n != 1:
        sys.stderr.write('FAIL: 取库口锚点命中 %d 次(应为 1)\n' % n)
        sys.exit(11)
    src = src.replace(GET_OLD, GET_NEW)
    changed.append('取库口')

# ---------------------------------------------------------------- 2 出口
# 锚点 = 「perspectiveContrast(characterA」那一行的行首位置(只认 ASCII 子串)。
EX_KEY = '        perspectiveContrast(characterA, characterB, opts) {'
if 'narrativeLayer(opts) {' in src:
    print('SKIP 出口(已存在)')
else:
    hits = [i for i, ln in enumerate(src.split('\n')) if ln == EX_KEY]
    if len(hits) != 1:
        sys.stderr.write('FAIL: 出口锚点命中 %d 次(应为 1)\n' % len(hits))
        sys.exit(12)
    EX_NEW = (
        "        /**\n"
        "         * [v3.344.0 · M4-X6] 叙事层建面(只读层判定):一条条目属于现实 / 梦境 / 假设 /\n"
        "         *   计划 / 引述哪一层,外加 unspecified(未标注 —— **不猜**)。\n"
        "         *   · 输入复用:opts.items(既有事实 / 摘要 / 轨迹条目),层标注落在条目 `modality` 上;\n"
        "         *   · at 只收 floor <= at 的条目;不重标老数据(无标注一律 unspecified);\n"
        "         *   * 本面零写:writesNothing 恒 true;唯一凭据是**显式标注**,不认关键词。\n"
        "         */\n"
        "        narrativeLayer(opts) {\n"
        "        const absent = (why) => ({ kind: 'narrative_layer', version: 0, at: null, atKnown: false, items: [], byLayer: {}, counts: {}, truncated: 0, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });\n"
        "        try {\n"
        "        const NL = _narrativeLayerLib();\n"
        "        if (!NL || typeof NL.build !== 'function') return absent('module-unavailable');\n"
        "        const o = opts || {};\n"
        "        const items = Array.isArray(o.items) ? o.items : [];\n"
        "        const out = NL.build(items, o);\n"
        "        const r = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });\n"
        "        this._narrativeLayerRead = r;\n"
        "        return r;\n"
        "        } catch (e) { errLog(e, 'engine.narrativeLayer'); return absent('thrown'); }\n"
        "        }\n"
        "        /**\n"
        "         * [v3.344.0 · M4-X6] 出口:现实视图(**现实问答与生成的唯一合法输入**)。\n"
        "         *   只取 stated 且 modality===reality 的条目 —— 梦里的死、假设里的搬走、\n"
        "         *   一句「决定了」的计划、他人转述,一律**不进**这一面(修前缺口正解)。\n"
        "         */\n"
        "        narrativeReality(opts) {\n"
        "        try {\n"
        "        const NL = _narrativeLayerLib();\n"
        "        if (!NL || typeof NL.realityView !== 'function') return { kind: 'narrative_layer@reality', count: 0, items: [], realityOnly: true, excluded: 0, ok: false, reason: 'module-unavailable' };\n"
        "        const read = this.narrativeLayer(opts || {});\n"
        "        if (!read || read.ok !== true) return Object.assign({ kind: 'narrative_layer@reality', count: 0, items: [], realityOnly: true, excluded: 0, ok: false }, { reason: (read && read.reason) || 'no-read' });\n"
        "        const rv = NL.realityView(read);\n"
        "        return Object.assign({}, rv, { ok: true, reason: '' });\n"
        "        } catch (e) { errLog(e, 'engine.narrativeReality'); return { kind: 'narrative_layer@reality', count: 0, items: [], realityOnly: true, excluded: 0, ok: false, reason: 'thrown' }; }\n"
        "        }\n"
        "        /**\n"
        "         * [v3.344.0 · M4-X6] 出口:分层投影(**定向回看的唯一入口**)。\n"
        "         *   按层分面取 `opts.layer`(不给则五层 + 未标注全给),非现实层**不被并入现实面**\n"
        "         *   —— 于是「梦里到底发生了什么」「当初计划是什么」修后问得出来。\n"
        "         */\n"
        "        narrativeProject(opts) {\n"
        "        try {\n"
        "        const NL = _narrativeLayerLib();\n"
        "        if (!NL || typeof NL.projectOf !== 'function') return { kind: 'narrative_layer@project', layers: [], layerCount: 0, ok: false, reason: 'module-unavailable' };\n"
        "        const read = this.narrativeLayer(opts || {});\n"
        "        if (!read || read.ok !== true) return { kind: 'narrative_layer@project', layers: [], layerCount: 0, ok: false, reason: (read && read.reason) || 'no-read' };\n"
        "        const pj = NL.projectOf(read, opts || {});\n"
        "        return Object.assign({}, pj, { ok: true, reason: '' });\n"
        "        } catch (e) { errLog(e, 'engine.narrativeProject'); return { kind: 'narrative_layer@project', layers: [], layerCount: 0, ok: false, reason: 'thrown' }; }\n"
        "        }\n"
        "        /** [v3.344.0 · M4-X6] 诊断一行。四方分开说;非现实隔离与计划待关联永远报出来。 */\n"
        "        _narrativeLayerLine() {\n"
        "        try {\n"
        "        const NL = _narrativeLayerLib();\n"
        "        if (!NL || typeof NL.line !== 'function') return '模块未加载(narrative-layer.js)';\n"
        "        const got = this.narrativeLayer({});\n"
        "        if (!got.ok) return '叙事层不可用(' + got.reason + ')';\n"
        "        return NL.line(got);\n"
        "        } catch (e) { errLog(e, 'engine._narrativeLayerLine'); return '—(诊断异常)'; }\n"
        "        }\n"
    )
    all_lines = src.split('\n')
    idx = hits[0]
    all_lines[idx:idx] = EX_NEW.rstrip('\n').split('\n')
    src = '\n'.join(all_lines)
    changed.append('出口')

# ---------------------------------------------------------------- 3 自检面行
SC_OLD = (
    "                        } catch (e) { errLog(e, 'selfCheck.testimonyBoard'); return ['证词面', '—(诊断异常)'];\n"
    "                        }\n"
    "                    })(),\n"
)
SC_NEW = SC_OLD + (
    "                    /* [v3.344.0 · M4-X6] 叙事层:回答「手上的事实各自处在哪一层外壳、现实面剩几条」。\n"
    "                     *   与「证词面」分列:那一行答「若干人对同一事件怎么说」,本行答「这条事实\n"
    "                     *   是现实里发生的,还是梦 / 假设 / 计划 / 引述」。\n"
    "                     *   报警只认两条真损失:非现实条目混入面(说明层轴没生效)与计划说落实却无事件关联。 */\n"
    "                    (() => {\n"
    "                        try {\n"
    "                            const NL = _narrativeLayerLib();\n"
    "                            if (!NL || typeof NL.line !== 'function' || typeof this.narrativeLayer !== 'function') {\n"
    "                                return ['叙事层', '模块未加载(narrative-layer.js)'];\n"
    "                            }\n"
    "                            const got = this.narrativeLayer({});\n"
    "                            if (!got || got.ok !== true) return ['叙事层', '待用(面在位 · ' + ((got && got.reason) || '无读数') + ')'];\n"
    "                            const c = got.counts || {};\n"
    "                            const hasNonReality = (Number(c.dream) + Number(c.hypothesis) + Number(c.plan) + Number(c.quote)) > 0;\n"
    "                            const bad = (Number(c.planAwaitingEvent) > 0) || (Number(c.unspecified) > 0 && Number(c.hinted) > 0);\n"
    "                            const tag = hasNonReality ? '(层轴生效)' : '(暂无外壳)';\n"
    "                            return ['叙事层', tag + ' ' + NL.line(got) + (bad ? ' ⚠️' : '')];\n"
    "                        } catch (e) { errLog(e, 'selfCheck.narrativeLayer'); return ['叙事层', '—(诊断异常)'];\n"
    "                        }\n"
    "                    })(),\n"
)
if 'selfCheck.narrativeLayer' in src:
    print('SKIP 自检面行(已存在)')
else:
    n = src.count(SC_OLD)
    if n != 1:
        sys.stderr.write('FAIL: 自检面锚点命中 %d 次(应为 1)\n' % n)
        sys.exit(13)
    src = src.replace(SC_OLD, SC_NEW)
    changed.append('自检面行')

if src == orig:
    print('NO-OP(无需改写)')
    sys.exit(0)

os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'index.js.pre3440xface', 'w', encoding='utf-8').write(orig)
io.open(TARGET, 'w', encoding='utf-8').write(src)
print('PATCHED index.js: %s' % ','.join(changed))