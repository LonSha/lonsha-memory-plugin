#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
O7 副本账本探针生成器（v3.293.0 收尾用）

背景：v3281 / v3282 / v3283 / v3284 四档的 B1 段都报「新增未登记的副本」——
X6 新增 branch-semantics.js、X7 新增 volume-continuation.js 时，两个新模块之间
出现了一批逐字副本，而四档的登记表没跟上。

为什么不用手抄登记值：
  登记值（成员集、体长、md5）必须与**磁盘实测**同源，否则修完仍旧红。
  手抄 md5 是本仓反复点名的坑。故本脚本直接**抽取各档的判据体头部**（含 stripComments
  归一化口径、blockFrom 配平、各枚举器），把探针写到 tests/ 目录下（保持相对 import
  可解析），追加转储代码后运行 —— 探针与判据**逐字同源**，只是把结果打出来而不是断言。
"""
import os
import re
import subprocess
import sys

ROOT = '/home/user/lonsha-memory-plugin'
MARK = re.compile(r'/\* \u2550+ A\. \u7ed3\u6784\u9762')

DUMP = {
    'tests/v3281_o7_module_copy_ledger.test.mjs': [
        "const __rows = clusterList(buildClusters(readAllModules()));",
        "for (const [k, mem] of __rows) console.log('C|' + k + '|' + mem.join(','));",
        "console.log('COUNT|' + __rows.length);",
        "console.log('PROBLEMS|' + JSON.stringify(judge(readAllModules(), LEDGER)));",
    ],
    'tests/v3282_o7_alias_copy_ledger.test.mjs': [
        "const __rows = buildAliasClusters(readAll());",
        "for (const r of __rows) console.log('C|' + keyOf(r) + '|' + r[1].join('/') + '|' + r[2].join(','));",
        "console.log('COUNT|' + __rows.length);",
        "console.log('ITEMS|' + FILES.reduce((a, f) => a + itemsOf(read(f)).length, 0));",
        "console.log('PROBLEMS|' + JSON.stringify(judge(readAll(), ALIAS_LEDGER)));",
    ],
    'tests/v3283_o7_const_table_copy_ledger.test.mjs': [
        "const __srcMap = readAll();",
        "const __per = new Map();",
        "let __tabs = 0;",
        "for (const __f of Object.keys(__srcMap)) {",
        "    for (const __t of constTablesOf(__srcMap[__f])) {",
        "        __tabs++;",
        "        if (!__per.has(__t.name)) __per.set(__t.name, new Map());",
        "        const __bb = __per.get(__t.name);",
        "        if (!__bb.has(__t.body)) __bb.set(__t.body, { files: new Set(), decls: new Set() });",
        "        __bb.get(__t.body).files.add(__f);",
        "        __bb.get(__t.body).decls.add(__t.decl);",
        "    }",
        "}",
        "let __n = 0;",
        "for (const [__nm, __byBody] of __per) {",
        "    for (const [__body, __rec] of __byBody) {",
        "        if (__rec.files.size < 2) continue;",
        "        __n++;",
        "        console.log('C|' + __nm + '#' + md5(__body) + '|len=' + __body.length",
        "            + '|files=' + [...__rec.files].sort().join(',')",
        "            + '|decl=' + [...__rec.decls].sort().join('|'));",
        "    }",
        "}",
        "console.log('COUNT|' + __n);",
        "console.log('TABS|' + __tabs);",
        "console.log('PROBLEMS|' + JSON.stringify(judge(readAll(), CONST_LEDGER)));",
    ],
    'tests/v3284_o7_audit_copy_ledger.test.mjs': [
        "const __ac = auditClusters(readAll());",
        "for (const r of __ac.clusters) {",
        "    console.log('C|' + r.len + '#' + r.md5 + '|names=' + r.names.join('/')",
        "        + '|files=' + r.files.join(','));",
        "}",
        "console.log('COUNT|' + __ac.clusters.length);",
        "console.log('ITEMS|' + __ac.items);",
        "console.log('PROBLEMS|' + JSON.stringify(judge(readAll(), AUDIT_LEDGER)));",
    ],
}


def main():
    for rel, lines in DUMP.items():
        src = open(os.path.join(ROOT, rel), encoding='utf-8').read()
        idx = MARK.search(src).start()
        head = src[:idx]
        tag = os.path.basename(rel).split('_')[0]
        probe_rel = 'tests/_tmp_o7_probe_' + tag + '.mjs'
        with open(os.path.join(ROOT, probe_rel), 'w', encoding='utf-8') as fh:
            fh.write(head)
            fh.write('\n'.join(lines) + '\n')
        print('=== ' + rel + ' ===')
        r = subprocess.run(['node', probe_rel], cwd=ROOT,
                           capture_output=True, text=True, timeout=300)
        sys.stdout.write(r.stdout)
        if r.returncode != 0:
            sys.stderr.write(r.stderr[-3000:])
        os.remove(os.path.join(ROOT, probe_rel))


if __name__ == '__main__':
    main()