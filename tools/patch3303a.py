#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.303.0 · 修 tests/audit/_mo1_realhost_probe.mjs 的子进程回收缺陷
（由 tests/audit/scan_process_reaping.mjs 当场点名：R1 独立进程组缺失 / R2 进程组收割缺失）。

实测承重（/tmp/o2_reap_demo2.mjs 两形态对照）：
  · 机制级（长命孙进程）：裸 spawn + 单杀 ⇒ 2 个孙进程孤儿化存活；detached + 组杀 ⇒ 0 存活。
  · Chromium 同款：两模式 kill 后 2s 残留都是 0（浏览器自带进程管理）⇒ 行为面观测不到，
    这正是门禁判**结构**而非行为的理由。

锚点：**按行定位**（取文件自身字节，不外写字面锚点，避开转义/不可见字符坑），
每处要求「命中行恰 1 行」；先全量校验、后统一写盘。
"""
import sys
from pathlib import Path

NL = chr(10)
ROOT = Path('/home/user/lonsha-memory-plugin')
REL = 'tests/audit/_mo1_realhost_probe.mjs'
p = ROOT / REL
src = p.read_text(encoding='utf-8')
lines = src.split(NL)
_log = []


def find(pred, why):
    hits = [i for i, l in enumerate(lines) if pred(l)]
    if len(hits) != 1:
        sys.exit('[patch3303a] %s 命中行 %d 行（要求恰 1 行）' % (why, len(hits)))
    return hits[0]


# ── ① 头部注释：补第⑤条进程纪律（插在“真宿主读数不进门禁”那行之后） ──
i_note = find(lambda l: l.startswith(' *') and '真宿主读数不进门禁' in l and '第⑤条' not in l,
              '头部注释 ④ 行')
lines[i_note + 1:i_note + 1] = [
    ' *  ⑤ **进程纪律**（v3.303.0 补，由 scan_process_reaping.mjs 当场点名）：浏览器放**独立进程组**',
    ' *     （`detached: true`）并在收尾按**进程组**收割（`process.kill(-pid)`）—— 形态与',
    ' *     `tests/run.mjs` 的 `killGroup` 一致，两处必须同形。',
]
_log.append('头部注释补第⑤条进程纪律（真宿主读数不进门禁 行后插入 3 行）')

# ── ② R1：浏览器进程放独立进程组 ──
i_spawn = find(lambda l: l.lstrip().startswith(']') and "stdio: ['ignore', 'pipe', 'pipe'] });" in l,
               'R1 spawn 选项行')
old_spawn = lines[i_spawn]
if 'detached' in old_spawn:
    sys.exit('[patch3303a] R1 锚点行已含 detached（重复执行）')
lines[i_spawn] = old_spawn.replace("stdio: ['ignore', 'pipe', 'pipe'] });",
                                   "stdio: ['ignore', 'pipe', 'pipe'], detached: true });")
if lines[i_spawn] == old_spawn:
    sys.exit('[patch3303a] R1 行内替换未生效')
_log.append('R1 spawn 加 detached: true（独立进程组）')

# ── ③ R2：收尾改进程组收割 ──
i_kill = find(lambda l: l.lstrip().startswith("try { chrome.kill('SIGKILL'); }"), 'R2 收尾行')
if any('process.kill(-chrome.pid' in l for l in lines):
    sys.exit('[patch3303a] R2 锚点已存在（重复执行）')
lines[i_kill:i_kill + 1] = [
    '/* ★ 进程组收割（v3.303.0 补）：本探针此前用裸 `chrome.kill` + 无 `detached` ⇒',
    ' *   超时/中途收尾只杀得掉直接子进程，孙进程会被孤儿化（PPID→1）继续吃 CPU。',
    ' *   修法形态与 tests/run.mjs 的 killGroup 一致：先按进程组杀，再兜底杀直接子进程。',
    ' *   实测：裸 spawn + 单杀 ⇒ 长命孙进程 2 个存活；detached + 组杀 ⇒ 0 个。 */',
    "try { process.kill(-chrome.pid, 'SIGKILL'); } catch { /* 组可能已不存在 */ }",
    "try { chrome.kill('SIGKILL'); } catch { /* 兜底 */ }",
]
_log.append('R2 收尾改进程组收割 + 兜底（1 行 → 6 行）')

p.write_text(NL.join(lines), encoding='utf-8')
print('[patch3303a] 完成 %d 处：' % len(_log))
for w in _log:
    print('  · ' + w)
