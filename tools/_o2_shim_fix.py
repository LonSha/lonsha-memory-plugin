#!/usr/bin/env python3
"""v3.287.0 · O2：给 scan_ui_interaction.mjs 的 shim 补两条**原生行为**。

为什么必须补（本轮实测，两处假红）：
  首版门报 3 处缺陷，逐条查证后**两处是 shim 与真实浏览器的偏差，不是源码缺陷**：
    ① V2 复选框 click 后 checked 未翻转 —— 真实浏览器里点击 checkbox 会**先翻转 checked**
       再派发 click（所以 handler 读到的是新值）。而本 shim 的 `dispatchEvent` 只调 handler，
       不模拟这条原生行为 ⇒ 真源里 handler 读 `e.target.checked` 的写法会被误判成「点下去没用」。
    ② V7 展开候选选错 —— 首版把 `.ls-group-title` 当折叠头，而那只是**分组标题样式**；
       真源的展开是**原生 `<details id="ls-advanced">`**（第 1114 行），其 toggle 是浏览器内建行为。
       shim 没实现 `details.open` 的原生语义 ⇒ 出现「21 个目标点击后全都未变」的假红。

口径（本仓纪律的延伸）：**shim 的偏差要修 shim，不是放宽断言** ——
  否则门会长期红着、人开始习惯忽略它，那就退化成比没有更坏的东西。

修法：
  ① click 派发前模拟原生 checked 翻转（仅 input[type=checkbox]）；
  ② 加 `<details>/<summary>` 原生语义：点 summary 翻转父 details 的 open；
  ③ 可见性辅助 `isVisible(el)`：沿祖先链检查 hidden / display:none / 未 open 的 details。
"""
import sys
from pathlib import Path

SCAN = Path('/home/user/lonsha-memory-plugin/tests/audit/scan_ui_interaction.mjs')
SENTINEL = '原生 checked 翻转'

A_ANCHOR = """    /** 事件分发：handler 收到一个**带 target/preventDefault** 的事件对象（真实用户点击也是这个形状）。 */
    dispatchEvent(ev) {
        const e = Object.assign({ type: 'click', target: this, currentTarget: this,
            preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }, ev || {});
        for (const fn of (this._listeners[e.type] || []).slice()) { try { fn.call(this, e); } catch (_x) {} }
        return !e.defaultPrevented;
    }
"""

A_NEW = """    /** 事件分发：handler 收到一个**带 target/preventDefault** 的事件对象（真实用户点击也是这个形状）。
     *
     * 【两条原生行为必须在这里模拟（本轮实测的两处假红就出在这）】
     *   ① **原生 checked 翻转**：真实浏览器里点击 checkbox 会先把 checked 翻好，再派发 click ——
     *      所以 handler 读 `e.target.checked` 拿到的是**新值**。不模拟这条，真源那种写法会被
     *      误判成「点下去没用」（shim 偏差被记成源码缺陷）。
     *   ② **`<details>/<summary>` 原生展开**：点 summary 翻转父 details 的 open。
     *      真源的展开正是原生 `<details id="ls-advanced">`，不是自定义折叠头。 */
    dispatchEvent(ev) {
        const e = Object.assign({ type: 'click', target: this, currentTarget: this,
            preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} }, ev || {});
        if (e.type === 'click') {
            if (this.tagName === 'input' && String(this._attrs.type || '').toLowerCase() === 'checkbox') {
                this.checked = !this.checked;
            }
            if (this.tagName === 'summary' && this.parentNode && this.parentNode.tagName === 'details') {
                const d = this.parentNode;
                if (d.hasAttribute('open')) d.removeAttribute('open'); else d.setAttribute('open', '');
            }
        }
        for (const fn of (this._listeners[e.type] || []).slice()) { try { fn.call(this, e); } catch (_x) {} }
        return !e.defaultPrevented;
    }
"""

B_ANCHOR = """function walk(n, fn) { for (const c of n.childNodes) { if (c instanceof El) { fn(c); if (c.tagName !== '#text') walk(c, fn); } } }
"""

B_NEW = """function walk(n, fn) { for (const c of n.childNodes) { if (c instanceof El) { fn(c); if (c.tagName !== '#text') walk(c, fn); } } }
/** 可见性（可判形态，用于 V7 展开面）：沿祖先链检查 hidden / display:none / 未 open 的 details。 */
function isVisible(el) {
    let p = el;
    while (p) {
        if (p.hidden) return false;
        const st = String(p._attrs.style || '');
        if (/display\\s*:\\s*none/i.test(st)) return false;
        if (p.tagName === 'details' && !p.hasAttribute('open')) {
            /* details 未 open 时，除第一个 summary 外的子节点不可见（原生语义）。 */
            let first = null;
            for (const c of p.children) { if (c.tagName === 'summary') { first = c; break; } }
            if (first && first !== el && !first.contains(el)) return false;
        }
        p = p.parentNode;
    }
    return true;
}
"""

src = SCAN.read_text(encoding='utf-8')
if SENTINEL in src:
    print('[o2-shim] 哨兵已在场 ⇒ 已应用过，跳过（幂等）')
    sys.exit(0)
for name, anchor, new in [('A', A_ANCHOR, A_NEW), ('B', B_ANCHOR, B_NEW)]:
    n = src.count(anchor)
    if n != 1:
        print('[FATAL] 锚点 %s 命中 %d 次（必须恰 1 次），不写盘' % (name, n))
        sys.exit(1)
    src = src.replace(anchor, new, 1)
SCAN.write_text(src, encoding='utf-8')
print('[o2-shim] 已补原生 checked 翻转 / details 展开语义 + isVisible（shim 偏差修 shim）')