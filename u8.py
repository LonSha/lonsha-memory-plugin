# -*- coding: utf-8 -*-
from pathlib import Path

# 1) v3140: 在 _loadedChatId 行后插 _bumpEpoch mock
p = Path('tests/v3140_control_plane_fixes.test.mjs'); L = p.read_text().split('\n')
i = next(k for k, l in enumerate(L) if l.strip() == "_loadedChatId: null,")
L.insert(i + 1, "            _bumpEpoch() {},   // [v3.145] CP-L6: 恢复推进变更栅栏（mock 无需真计数）")
p.write_text('\n'.join(L)); print('v3140 ok')

# 2) v3142: 两处 eng 字面量各插 mock
q = Path('tests/v3142_atomic_restore.test.mjs'); M = q.read_text().split('\n')
out = []
for l in M:
    out.append(l)
    if l.strip() == "_archiveExtensions: {},":
        out.append("        _bumpEpoch() {},   // [v3.145] CP-L6")
assert sum(1 for l in out if '_bumpEpoch' in l) == 2, 'v3142 插了 %d 处' % sum(1 for l in out if '_bumpEpoch' in l)
q.write_text('\n'.join(out)); print('v3142 ok')

# 3) v3141: 按行整行替换（绕开转义匹配）
r = Path('tests/v3141_session_lease.test.mjs'); V = r.read_text().split('\n')
ji = next(k for k, l in enumerate(V) if '诊断块显示条件' in l)
V[ji] = "    assert.match(ui, /_staleTaskDropped \\|\\| s\\._epochDropped \\|\\| s\\.mutex\\?\\._foreignRelease \\? \\(\\(\\) => \\{/, '诊断块显示条件含租约/栅栏/越权故障（v3.145 扩展）');"
r.write_text('\n'.join(V)); print('v3141 ok')
