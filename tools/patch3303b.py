#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.303.0 · 两处「新面引入的连带自伤」修复：

A) tests/v3302_mo1_write_closure.test.mjs —— 当版锚**交棒**。
   它原来用 `assert.equal(vnum(CUR), vnum(v))` 把**自锚常量**钉在当版版本上 ——
   这是「自锚常量形」当版锚的写法，但本仓 expand 版后**当版锚应交给新档**，
   旧档的常量必须退回**出生版本下界**形（否则每抬一版都要回头改历史档，
   正是 scan_version_guard 的 V3 明文禁止的「跟着抬版」）。

B) tests/v3206_process_reaping.test.mjs —— 空转负控制 N4 **被新探针占位**。
   它原把退化清单写死成 ['tests/run.mjs', V3159_REL]；v3.303.0 新增的
   tests/audit/_mo1_realhost_probe.mjs 也用异步 spawn ⇒ 掏空那两个文件后，
   扫描面仍有 1 个 spawn 使用者 ⇒ 门照旧 exit 0、负控制失效（假绿）。
   修法：退化清单改为**按扫描面真值动态枚举**（与门同一口径：跳过 archived/node_modules），
   以后再有新 spawn 使用者进来，本负控制不会静默失效。

锚点按行定位（取文件自身字节），每处要求恰 1 行。
"""
import sys
from pathlib import Path

NL = chr(10)
ROOT = Path('/home/user/lonsha-memory-plugin')
_log = []


def load(rel):
    p = ROOT / rel
    return p, p.read_text(encoding='utf-8').split(NL)


def find(lines, pred, why, rel):
    hits = [i for i, l in enumerate(lines) if pred(l)]
    if len(hits) != 1:
        sys.exit('[patch3303b] %s %s 命中行 %d 行（要求恰 1 行）' % (rel, why, len(hits)))
    return hits[0]


# ── A) v3302 当版锚交棒 ──
rel_a = 'tests/v3302_mo1_write_closure.test.mjs'
pa, la = load(rel_a)
i = find(la, lambda l: 'assert.equal(vnum(CUR), vnum(v)' in l, 'D2 当版锚行', rel_a)
la[i] = ("    assert.ok(vnum(CUR) <= vnum(v), '本档自锚常量是**出生版本下界**"
         "（当版锚已交给本刀新档，历史档不得跟着抬版）');")
_log.append((rel_a, 'D2 当版锚：硬等 → 出生版本下界形（交棒）'))
j = find(la, lambda l: "test('v3302 D2 版本锚" in l, 'D2 标题行', rel_a)
la[j] = la[j].replace('版本锚（自锚常量形）', '版本锚（自锚常量作出生版本下界）')
_log.append((rel_a, 'D2 标题：自锚常量形 → 出生版本下界'))
pa.write_text(NL.join(la), encoding='utf-8')

# ── B) v3206 空转负控制改动态枚举 ──
rel_b = 'tests/v3206_process_reaping.test.mjs'
pb, lb = load(rel_b)
k = find(lb, lambda l: "for (const f of ['tests/run.mjs', V3159_REL]) {" in l, 'N4 退化清单行', rel_b)
block = [
    '        /* 动态枚举（v3.303.0 修）：原来写死两个文件 —— v3.303.0 新增的',
    '         *   tests/audit/_mo1_realhost_probe.mjs 也用异步 spawn ⇒ 掏空那两个后',
    '         *   扫描面仍有 1 个使用者 ⇒ 门照旧 exit 0、本负控制**静默失效**（假绿）。',
    '         *   改为与门同一口径地枚举扫描面真值，以后新增使用者不会再让负控制失效。 */',
    "        const targets = ['tests/run.mjs', V3159_REL];",
    '        const collectSpawners = (rel) => {',
    "            for (const e of readdirSync(path.join(d, rel), { withFileTypes: true })) {",
    "                if (e.isDirectory()) { if (e.name !== 'archived' && e.name !== 'node_modules') collectSpawners(rel + '/' + e.name); continue; }",
    '                if (!/\.m?js$/.test(e.name)) continue;',
    "                if (/(^|[^A-Za-z0-9_$.])spawn\s*\(/.test(readFileSync(path.join(d, rel + '/' + e.name), 'utf-8'))) targets.push(rel + '/' + e.name);",
    '            }',
    '        };',
    "        collectSpawners('tests');",
    '        for (const f of targets) {',
]
lb[k:k + 1] = block
_log.append((rel_b, 'N4 空转负控制：写死清单 → 按扫描面真值动态枚举'))
pb.write_text(NL.join(lb), encoding='utf-8')

print('[patch3303b] 完成 %d 处：' % len(_log))
for rel, why in _log:
    print('  · %-46s %s' % (rel, why))
