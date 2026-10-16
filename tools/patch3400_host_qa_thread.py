#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.340.0 · M4-X4 宿主接线：qa-thread.js 取库口 + 追问三出口 + 诊断行 + 契约登记。
锚点纪律：每个锚点恰中 1 次；执行后 AST 不可用（JS），改走 node --check + grep -c 核对。"""
import io
import sys
ROOT = '/home/user/lonsha-memory-plugin/'

def patch(path, old, new, label):
    p = ROOT + path
    t = io.open(p, encoding='utf-8').read()
    # 幂等：新块已在场 ⇒ 直接跳过（先于计数判断，因为 old 是新块的子串）。
    if t.count(new) >= 1:
        print('SKIP %s (already patched)' % label)
        return
    n = t.count(old)
    if n != 1:
        sys.stderr.write('FAIL %s: anchor hits %d (need 1)\n' % (label, n))
        sys.exit(1)
    io.open(p, 'w', encoding='utf-8').write(t.replace(old, new, 1))
    print('OK %s' % label)

IDX = 'index.js'

# ── 1. 取库口 ──────────────────────────────────────────────────────
patch(IDX,
"""    function _evidenceQueryLib() {
        return _moduleLib(() => window.LonShaEvidenceQuery, 'evidence-query.js');
    }
""",
"""    function _evidenceQueryLib() {
        return _moduleLib(() => window.LonShaEvidenceQuery, 'evidence-query.js');
    }
    // [v3.340.0 · M4-X4] 多轮问答线程（qa-thread.js）。为什么需要：
    //   planQuestion 是**单问句**规划，代词 / 比较 / 回旧时点在追问里会退化成宽查。
    //   本模块只维护**结构化查询约束**（主体 / 时点下界 / 分支 / scope），
    //   消歧走 awaiting-disambig + 人工点选，不产第二份答案事实。
    function _qaThreadLib() {
        return _moduleLib(() => window.LonShaQaThread, 'qa-thread.js');
    }
""",
'getter _qaThreadLib')

# ── 2. ARCHIVE_TOP_LEVEL_KEYS ───────────────────────────────────────
patch(IDX,
"""    'loreImportLedger',  // [v3.339.0 · M4-X1] 资料导入账（幂等键 + 人工校订决定）
    'extensions',
""",
"""    'loreImportLedger',  // [v3.339.0 · M4-X1] 资料导入账（幂等键 + 人工校订决定）
    'qaThread',  // [v3.340.0 · M4-X4] 追问线程（主体 / 时点下界 / 分支 / scope；只存约束不存答案）
    'extensions',
""",
'ARCHIVE_TOP_LEVEL_KEYS')

# ── 3. CARRYOVER_EXEMPT_KEYS ────────────────────────────────────────
patch(IDX,
"""        'loreImportLedger',   // [v3.339.0 · M4-X1] 资料导入账：importedText 与携带面 prequel 同源异名（携带会双写），seen/decisions 是会话内幂等与校订痕迹
""",
"""        'loreImportLedger',   // [v3.339.0 · M4-X1] 资料导入账：importedText 与携带面 prequel 同源异名（携带会双写），seen/decisions 是会话内幂等与校订痕迹
        'qaThread',           // [v3.340.0 · M4-X4] 追问线程：主体/时点条件绑定当前会话的问题语境，跨对话继承会把 A 的追问答成 B 的（内核自身按 chatKey 作废重建，故此处刻意不带）
""",
'CARRYOVER_EXEMPT_KEYS')

# ── 4. collectExport ────────────────────────────────────────────────
patch(IDX,
"""                loreImportLedger: this._loreImportLedger || null,   // [v3.339.0 · M4-X1] 资料导入账
""",
"""                loreImportLedger: this._loreImportLedger || null,   // [v3.339.0 · M4-X1] 资料导入账
                qaThread: this._qaThread || null,   // [v3.340.0 · M4-X4] 追问线程（只存约束）
""",
'collectExport')

# ── 5. restoreFromPayload ───────────────────────────────────────────
patch(IDX,
"""            _imp('loreImportLedger', true, () => { if (data.loreImportLedger) engine._loreImportLedger = data.loreImportLedger; });
""",
"""            _imp('loreImportLedger', true, () => { if (data.loreImportLedger) engine._loreImportLedger = data.loreImportLedger; });
            _imp('qaThread', true, () => { if (data.qaThread) engine._qaThread = data.qaThread; });
""",
'restoreFromPayload')

print('DONE part1')
