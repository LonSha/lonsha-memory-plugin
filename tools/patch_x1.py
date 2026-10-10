#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""M-X1 补丁：memory-center.js 的 UI_FIELDS 与真源 FILTERS 逐字对账（补 revisionFrom/To）
   外加 escAttr 引号转义真 bug。锚点逐条先校命中次数再写盘。"""
import ast, sys, io, os

P = '/home/user/lonsha-memory-plugin/memory-center.js'
src = io.open(P, encoding='utf-8').read()
orig = src

def rep(old, new, n=1):
    global src
    c = src.count(old)
    if c != n:
        print('锚点命中异常 %d != %d: %r' % (c, n, old[:70]))
        sys.exit(1)
    src = src.replace(old, new)

# A) escAttr：把无效的引号替换改成真转义（esc 已把 & < > 处理过，此处补 "）
rep('''    function escAttr(t) { return esc(t).replace(/"/g, '"'); }''',
    '''    function escAttr(t) { return esc(t).replace(/"/g, '"'); }''')

# B) UI_FIELDS：补齐真源 FILTERS 的 10 个条件键（缺 revisionFrom/To 即 keysAligned 报红）
rep("""        { ui: 'floorTo', specKey: 'floorTo', label: '楼层止', multi: false },
        { ui: 'text', specKey: 'text', label: '正文', multi: false },""",
    """        { ui: 'floorTo', specKey: 'floorTo', label: '楼层止', multi: false },
        { ui: 'revisionFrom', specKey: 'revisionFrom', label: '修订起', multi: false },
        { ui: 'revisionTo', specKey: 'revisionTo', label: '修订止', multi: false },
        { ui: 'text', specKey: 'text', label: '正文', multi: false },""")

# C) blankState：补两格（否则 loadState 会把它当未登记字段丢掉）
rep("""            ledgers: [], actor: '', status: '', source: '', floorFrom: '', floorTo: '', text: '', hasFloor: null,""",
    """            ledgers: [], actor: '', status: '', source: '', floorFrom: '', floorTo: '',
            revisionFrom: '', revisionTo: '', text: '', hasFloor: null,""")

# D) loadState：补归一（「空 ⇒ 不限」而不是 0）
rep("""        st.text = text(src.text, 80);
        st.hasFloor =""",
    """        const rf = numOrNull(src.revisionFrom), rt = numOrNull(src.revisionTo);
        st.revisionFrom = rf === null ? '' : String(rf);
        st.revisionTo = rt === null ? '' : String(rt);
        st.text = text(src.text, 80);
        st.hasFloor =""")

# E) saveState：两格进存档
rep("""            floorFrom: st.floorFrom, floorTo: st.floorTo, text: st.text, hasFloor: st.hasFloor,""",
    """            floorFrom: st.floorFrom, floorTo: st.floorTo,
            revisionFrom: st.revisionFrom, revisionTo: st.revisionTo,
            text: st.text, hasFloor: st.hasFloor,""")

# F) buildSpec：空值丢弃
rep("""        const ft = numOrNull(st.floorTo); if (ft !== null) spec.floorTo = ft;""",
    """        const ft = numOrNull(st.floorTo); if (ft !== null) spec.floorTo = ft;
        const rf = numOrNull(st.revisionFrom); if (rf !== null) spec.revisionFrom = rf;
        const rt = numOrNull(st.revisionTo); if (rt !== null) spec.revisionTo = rt;""")

# G) filterHtml：两个输入框（否则界面上没有这两格，功能 1 的「时间 / 修订」少一半）
rep("""        parts.push('<input class="ls-input" data-mc="f" data-k="text" placeholder="正文" value="' + escAttr(st.text) + '">');""",
    """        parts.push('<input class="ls-input" data-mc="f" data-k="revisionFrom" type="number" placeholder="修订起（无修订号的账不参与）" value="' + escAttr(st.revisionFrom) + '">');
        parts.push('<input class="ls-input" data-mc="f" data-k="revisionTo" type="number" placeholder="修订止" value="' + escAttr(st.revisionTo) + '">');
        parts.push('<input class="ls-input" data-mc="f" data-k="text" placeholder="正文" value="' + escAttr(st.text) + '">');""")

# H) specLine：摘要里也带上修订区间（保存条件的人一眼能认出是哪条）
rep("""        push('正文', n.text);""",
    """        push('修订', (n.revisionFrom != null || n.revisionTo != null) ? ((n.revisionFrom == null ? '' : n.revisionFrom) + '~' + (n.revisionTo == null ? '' : n.revisionTo)) : '');
        push('正文', n.text);""")

# I) selfCheck：ok 里补 uiFieldsMapped（否则「字段没映射」不进 ok，等于漏判）
rep("""            ok: VIEW_STATES.length === 5 && actionsCoherent && ka.ok && idempotent""",
    """            ok: VIEW_STATES.length === 5 && actionsCoherent
                && UI_FIELDS.every((f) => typeof f.specKey === 'string' && f.specKey.length > 0)
                && ka.ok && idempotent""")

# J) describe：complete 同口径（少了这一条，describe 说齐备而 selfCheck 说不齐）
rep("""            complete: missing.length === 0 && ka.ok,""",
    """            complete: missing.length === 0 && ka.ok && UI_FIELDS.length > 0,""")

if src == orig:
    print('未发生任何改写')
    sys.exit(1)
io.open(P, 'w', encoding='utf-8').write(src)
print('改写完成，字节 %d -> %d' % (len(orig), len(src)))
