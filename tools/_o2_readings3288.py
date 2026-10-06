#!/usr/bin/env python3
# v3.288.0 读数同步：tests/ 269 个测试文件（新增 v3288 档）+ 全量待验版本 → v3.288.0。
# 只改「在役面读数」与「当前版本」这两类可磁盘重算的字面，历史追溯段不得触碰。
import pathlib

ROOT = pathlib.Path('/home/user/lonsha-memory-plugin')
n_test = len(list((ROOT / 'tests').glob('*.test.mjs')))
n_audit = len(list((ROOT / 'tests' / 'audit').glob('*.mjs')))
print('DISK tests=%d audit_mjs=%d' % (n_test, n_audit))

def read(p):
    return (ROOT / p).read_text(encoding='utf-8')

def write(p, s):
    (ROOT / p).write_text(s, encoding='utf-8')

edits = []  # (path, old, new)

# ---------- README ----------
# 行 8：在役面读数（测试文件数）
edits.append(('README.md',
    '`npm test` 当前发现 **268 个测试文件**；',
    '`npm test` 当前发现 **' + str(n_test) + ' 个测试文件**；'))
# 行 44：命令注释
edits.append(('README.md',
    'npm test             # 全部用例：268 个测试文件（在役面，磁盘枚举），',
    'npm test             # 全部用例：' + str(n_test) + ' 个测试文件（在役面，磁盘枚举），'))
# 行 110：目录树注释
edits.append(('README.md',
    '├── tests/                # 在役面：268 个测试文件 +',
    '├── tests/                # 在役面：' + str(n_test) + ' 个测试文件 +'))
# 行 121：在役面读数
edits.append(('README.md',
    '`tests/` 268 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）',
    '`tests/` ' + str(n_test) + ' 个测试文件（`*.test.mjs`，即 `npm test` 的扫描面）'))
# 行 9：全量待验版本
edits.append(('README.md',
    '当前版本 v3.287.0 **全量待验**',
    '当前版本 v3.288.0 **全量待验**'))

# ---------- PLAN ----------
edits.append(('PLAN.md',
    '在役面 **268 测试文件 / 59 个 audit 脚本**',
    '在役面 **' + str(n_test) + ' 测试文件 / 59 个 audit 脚本**'))

for path, old, new in edits:
    src = read(path)
    if old not in src:
        print('MISS [' + path + ']:', old[:60])
        continue
    cnt = src.count(old)
    if cnt != 1:
        print('NOT-UNIQUE [' + path + '] x' + str(cnt) + ':', old[:60])
        continue
    write(path, src.replace(old, new, 1))
    print('OK   [' + path + ']', old[:40], '->', new[:40])