#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch3318_css.py - 修 320px 窄屏下「长不可断 ASCII 串把控件顶出视口」的真缺陷。

缺陷来源（真浏览器取证，不是整洁性偏好）：
  tests/audit/_mo2_realbrowser_probe.mjs 在真 Chromium + 真 SillyTavern 1.19.0 上
  以 Emulation.setDeviceMetricsOverride(320x640) 实测到：
    narrow.inViewOfControls = 160/161 - 有 1 个控件横向落在视口外：
      {tag:INPUT, key:llmEventChainEnabled, left:449, right:493, parentCls:ls-row}
  根因两处：
    1) .ls-hint 无 overflow-wrap / word-break：说明文本里的长不可断 ASCII 串
       （SillyTavern.getContext().chat[N].extra.lonsha_omit = true、
        run_started->model_requested/assistant_message/run_failed、
        window.lonsha_memory_bridge_v1、extract/summarize/select/rerank/...）
       按 CSS 默认的 overflow-wrap:normal **不换行** => 把所在行撑到 277~474px。
    2) .ls-row（display:flex）的标签容器 min-width 仍是 auto：
       flex 子项的自动最小尺寸 = 内容最小尺寸，**不允许收缩到内容以下**
       => (1) 撑宽的内容把右侧 44x44 的 checkbox 一路推到 left=449（视口 320）。
  实测读数：.lonsha-sheet-body scrollWidth 492 > clientWidth 307。

修法（两处配套、缺一不可）：
  - 给长文本面加 overflow-wrap:anywhere + word-break:break-word
    （.ls-hint / .ls-group-title）；
  - 给 flex 标签容器加 min-width:0（.ls-row > div）——
    这是 flex 项能收缩的必要条件，只加前一条不加这一条仍然撑宽。

锚点纪律：每处按行定位、要求命中恰 1 行；先全量校验、后统一写盘。
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin'
REL = 'settings-ui.js'
p = ROOT + '/' + REL
src = io.open(p, encoding='utf-8').read()
lines = src.split('\n')
_log = []


def find(pred, why):
    hits = [i for i, l in enumerate(lines) if pred(l)]
    if len(hits) != 1:
        sys.exit('[patch3318] %s 命中 %d 行（要求恰 1 行）' % (why, len(hits)))
    return hits[0]


# (1) .ls-group-title：允许任意位置断行
i = find(lambda l: l.strip().startswith('.ls-group-title {') and 'text-transform: uppercase' in l,
         '.ls-group-title 行')
old = lines[i]
lines[i] = old.replace(' text-transform: uppercase;',
                       ' text-transform: uppercase; overflow-wrap: anywhere; word-break: break-word;')
if lines[i] == old:
    sys.exit('[patch3318] .ls-group-title 行内替换未生效')
_log.append('.ls-group-title 加 overflow-wrap:anywhere + word-break:break-word')

# (2) .ls-row：flex 容器自身不锁死在内容宽
i = find(lambda l: l.strip().startswith('.ls-row {') and 'justify-content: space-between' in l,
         '.ls-row 行')
old = lines[i]
lines[i] = old.replace(' align-items: center;', ' align-items: center; min-width: 0;')
if lines[i] == old:
    sys.exit('[patch3318] .ls-row 行内替换未生效')
_log.append('.ls-row 加 min-width:0（容器不锁死在内容宽）')

# (3) 新增 .ls-row > div：标签容器收缩 + 长串断行
if any('.ls-row > div' in l for l in lines):
    sys.exit('[patch3318] .ls-row > div 已存在（重复执行）')
i = find(lambda l: l.strip().startswith('.ls-row:last-child'), '.ls-row:last-child 行')
lines[i:i] = [
    '            /* [v3.318.0] 320px 窄屏真浏览器实测：flex 子项默认 min-width:auto => 不允许收缩到内容以下，',
    '             *   说明文本里的长不可断 ASCII 串（SillyTavern.getContext()… / run_started->…）会把',
    '             *   整行撑到 474px，把 44px 的 checkbox 顶出视口（left=449 > 320）。',
    '             *   修法两处配套：容器 min-width:0（允许收缩）+ 任意位置断行（让长串真能断）。 */',
    '            .ls-row > div { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }',
]
_log.append('.ls-row > div 新增（min-width:0 + overflow-wrap:anywhere + word-break:break-word）')

# (4) .ls-hint：说明文本是长串的主要载体（实测两处直接溢出项都在这）
i = find(lambda l: l.strip().startswith('.ls-hint {') and 'font-size: 12px' in l, '.ls-hint 行')
old = lines[i]
lines[i] = old.replace(' line-height: 1.5;',
                       ' line-height: 1.5; overflow-wrap: anywhere; word-break: break-word;')
if lines[i] == old:
    sys.exit('[patch3318] .ls-hint 行内替换未生效')
_log.append('.ls-hint 加 overflow-wrap:anywhere + word-break:break-word')

io.open(p, 'w', encoding='utf-8').write('\n'.join(lines))
print('[patch3318] 完成 %d 处：' % len(_log))
for w in _log:
    print('  - ' + w)
