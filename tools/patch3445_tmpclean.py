#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 加固:v3227 N2 负控制的临时文件清理(防进程被 kill 时留仓根残骸)。

★ 事实(本会话实测):
  · N2 在**仓根**写 `.tmp_v3227_probe_<ts>.js`(刻意的 —— 它要验「快照能抓到新增文件」),
    收尾走 `finally { fs.unlinkSync(victim); }`。
  · 但本仓测试由 `tests/run.mjs` 并发跑、**单文件 120s 超时即被 kill** ⇒ `finally` 不执行,
    仓根残骸留存;后续 v3116(死代码扫描)与 v3205(仓根文件数须等于入口 + manifest 声明模块)
    因这条**残留**当场翻红 —— 症状像产品坏了,实为负控制没清干净。
  · 本会话实测:全量复跑后仓根确实留下 `.tmp_v3227_probe_1792249419649.js`(9 字节 `// probe`)。

★ 加固(不弱化):
  · 写入前先做**同名前缀清扫**(清掉上一次被 kill 留下的同类残骸);
  · 写入后**再登记一条进程退出钩子**(SIGINT / SIGTERM / exit)做兜底删除;
  · `finally` 保留(正常路径毫秒级清掉)。
  · 三路齐备:正常路径 immediately 删、异常路径钩子删、崩溃残留下次运行时先清扫。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3445/'
T = ROOT + 'tests/v3227_gate_isolation_and_timing.test.mjs'

OLD_WRITE = "    const victim = path.join(ROOT, '.tmp_v3227_probe_' + Date.now() + '.js');\n    fs.writeFileSync(victim, '// probe"
NEW = [
    "    /* ★ [v3.345.0 加固] 本仓测试并发跑、单文件 120s 超时即被 kill ⇒ 仅靠 `finally`",
    "     *   会在被 kill 时留仓根残骸,而后续 v3116(死代码扫描)/ v3205(仓根文件数对账)",
    "     *   会因这条**残留**翻红(症状像产品坏了,实为负控制没清干净)。",
    "     *   三路齐备:1 写入前清扫上次残骸;2 写入后登记进程退出钩子;3 正常路径 finally 删。 */",
    "    const _tmpPrefix = '.tmp_v3227_probe_';",
    "    for (const f of fs.readdirSync(ROOT)) {",
    "        if (f.startsWith(_tmpPrefix)) { try { fs.unlinkSync(path.join(ROOT, f)); } catch { /* 已被清 */ } }",
    "    }",
    "    const victim = path.join(ROOT, _tmpPrefix + Date.now() + '.js');",
    "    const _sweep = () => { try { fs.unlinkSync(victim); } catch { /* 已清 */ } };",
    "    process.once('exit', _sweep);",
    "    process.once('SIGINT', _sweep);",
    "    process.once('SIGTERM', _sweep);",
    "    fs.writeFileSync(victim, '// probe",
]

texts = {}
bad = 0
for path in [T]:
    texts[path] = io.open(path, encoding='utf-8').read()
    t = texts[path]
    if NEW[0] in t:
        print('IN-SYNC(已加固)')
        sys.exit(0)
    n = t.count(OLD_WRITE)
    if n != 1:
        bad += 1
        print('FAIL: 写入锚点命中 %d 次(应 1):%s' % (n, OLD_WRITE))
        continue
    texts[path] = t.replace(OLD_WRITE, '\n'.join(NEW))
    print('  ok 写入锚点替换(整段加固)')

if bad:
    sys.exit(41)

os.makedirs(BAK, exist_ok=True)
for path in texts:
    b = os.path.basename(path)
    io.open(BAK + b + '.pre3445tmp', 'w', encoding='utf-8').write(
        io.open(path, encoding='utf-8').read())
    io.open(path, 'w', encoding='utf-8').write(texts[path])
    print('PATCHED', b)

t = io.open(T, encoding='utf-8').read()
print('-- 钩子登记数=%d 清扫段在场=%d 旧单行写入残留=%d' % (
    t.count("process.once('"), t.count('_tmpPrefix'), t.count("    const victim = path.join(ROOT, '.tmp_v3227_probe_' + Date.now()")))