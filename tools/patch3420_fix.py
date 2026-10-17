#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.342.0 M4-X3 宿主刀修正（生成脚本侧，产物由重跑得到，不手改产物）。

【为什么必须改脚本而不是改 index.js】
  本仓纪律是「补丁脚本是唯一真源，产物可重建」。手改 index.js 会让脚本与产物
  失同步：下一次重建就把修掉的缺陷原样带回来。

【修的是哪一处真缺陷（不是判据放宽）】
  `storyCanonAdoptLine()` 修前是：没有落卷计划读数 ⇒ **整体早退**。
  于是「先看撤销会动什么、再看能不能接」这个次序下（撤过面、还没出计划），
  撤销保护面读数恰恰在最需要它的时候**不显示**——而 `_lastCanonRevokeGuard`
  明明有值。修法：把撤销面读数抽成 `revokeTail`，早退分支也带上它。
"""
import io
import sys
P = '/home/user/lonsha-memory-plugin/tools/patch3420_host.py'
s = io.open(P, encoding='utf-8').read()
if 'revokeTail' in s:
    sys.stderr.write('FAIL: patch3420_host.py 已修过（拒绝重跑）\n')
    sys.exit(1)
OLD = """                const last = this._lastCanonAdopt || null;
                const brief = this._canonAdoption || null;
                /* \u2605 没有计划读数 \u21d2 报\u300c未生成\u300d(不是\u300c无可接条目\u300d)\uff1a两态不同形\u3002 */
                if (!last) return '\u843d\u5377:' + (brief ? ('\u5df2\u786e\u8ba4 ' + (brief.adoptionId || '?')) : '\u5c1a\u672a\u751f\u6210');
                const parts = [BC.adoptionLine(last)];
                const cfm = this._lastCanonAdoptConfirm || null;
                if (cfm) {
                    if (cfm.duplicate) parts.push('\u91cd\u590d\u786e\u8ba4(\u672a\u518d\u843d\u7b14)');
                    else parts.push(cfm.ok ? ('\u5df2\u843d ' + (cfm.applied || 0) + ' \u6761') : ('\u672a\u843d(' + (cfm.reason || '?') + ')'));
                } else if (brief) parts.push('\u5df2\u786e\u8ba4 ' + (brief.adoptionId || '?'));
                const g = this._lastCanonRevokeGuard || null;
                if (g) parts.push('\u64a4\u9500\u9762 \u53ef\u64a4 ' + g.revocable + ' / \u7559 ' + (g.foreign + g.manual + g.later));
                return parts.join(' \u00b7 ');"""
NEW = """                const last = this._lastCanonAdopt || null;
                const brief = this._canonAdoption || null;
                /* \u2605 撤销保护面读数**独立于落卷计划**：先问\u300c撤会动什么\u300d再问\u300c能不能接\u300d是常见次序
                 *   \u21d2 早退分支也必须带上它，否则这条读数恰在还没生成计划时（最需要它的时候）不显示。 */
                const g = this._lastCanonRevokeGuard || null;
                const revokeTail = g ? ('\u64a4\u9500\u9762 \u53ef\u64a4 ' + g.revocable + ' / \u7559 ' + (g.foreign + g.manual + g.later)) : '';
                /* \u2605 没有计划读数 \u21d2 报\u300c未生成\u300d(不是\u300c无可接条目\u300d)\uff1a两态不同形\u3002 */
                if (!last) {
                    const head = '\u843d\u5377:' + (brief ? ('\u5df2\u786e\u8ba4 ' + (brief.adoptionId || '?')) : '\u5c1a\u672a\u751f\u6210');
                    return revokeTail ? (head + ' \u00b7 ' + revokeTail) : head;
                }
                const parts = [BC.adoptionLine(last)];
                const cfm = this._lastCanonAdoptConfirm || null;
                if (cfm) {
                    if (cfm.duplicate) parts.push('\u91cd\u590d\u786e\u8ba4(\u672a\u518d\u843d\u7b14)');
                    else parts.push(cfm.ok ? ('\u5df2\u843d ' + (cfm.applied || 0) + ' \u6761') : ('\u672a\u843d(' + (cfm.reason || '?') + ')'));
                } else if (brief) parts.push('\u5df2\u786e\u8ba4 ' + (brief.adoptionId || '?'));
                if (revokeTail) parts.push(revokeTail);
                return parts.join(' \u00b7 ');"""
n = s.count(OLD)
assert n == 1, '锚点命中 %d 次（须 1）' % n
s = s.replace(OLD, NEW, 1)
io.open(P, 'w', encoding='utf-8').write(s)
print('patch3420_host.py 已修：%d 行' % (s.count('\n') + 1))
