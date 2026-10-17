#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.343.0 M4-X5 宿主接线。

口径:锚点必须恰中 1 次;证词面只读聚合投影,输入复用 worldProg.knowledgeTraces.traces,
不新增持久化键 ⇒ 不动 ARCHIVE / 携带豁免 / collectExport / restore / clear 五面;
出口与 perspectiveCard / qaThread 同族(Engine 出口,不在 OrganFallback 器官穷举面)⇒ 不补退路。

用法:python3 tools/patch3430_host.py        / DRY=1 python3 tools/patch3430_host.py
"""
import io
import os
import sys
ROOT = '/home/user/lonsha-memory-plugin/'
IDX = ROOT + 'index.js'
DRY = os.environ.get('DRY') == '1'
s = io.open(IDX, encoding='utf-8').read()
if '_testimonyBoardLib' in s and not DRY:
    sys.stderr.write('FAIL: index.js 里已有 _testimonyBoardLib(可能已打过补丁)\n')
    sys.exit(1)


def sub1(text, anchor, repl, label):
    n = text.count(anchor)
    if DRY:
        print('ANCHOR %-16s hits=%d' % (label, n))
        return text
    assert n == 1, '%s 锚点命中 %d 次(须 1): %r' % (label, n, anchor[:90])
    return text.replace(anchor, repl, 1)


A_LIB = '''    function _qaThreadLib() {
        return _moduleLib(() => window.LonShaQaThread, 'qa-thread.js');
    }
'''
NEW_LIB = '''    // [v3.343.0 · M4-X5] 多方证词与争议档案(testimony-board.js)。为什么需要:
    //   knowledge-trace 已区分亲历 / 听说 / 误信、perspective-card 已按角色 × 时点出卡,
    //   但没有一处把若干角色对同一事件的说法摆在一起对照;「甲和乙对同一事件分别怎么说、
    //   为何暂不能下结论」只能手工两两跑 contrast,而「谁跟谁同一来源」在比完之后又丢了。
    //   本模块是只读聚合投影:复用事件 ID 与既有 evidenceKey 去重(三次转述
    //   不算三份独立支持),不建平行证词库、不落盘。
    function _testimonyBoardLib() {
        return _moduleLib(() => window.LonShaTestimonyBoard, 'testimony-board.js');
    }
'''
s = sub1(s, A_LIB, A_LIB + NEW_LIB, 'getter')

A_EXP = '''        } catch (e) { errLog(e, 'engine.perspectiveCard'); return absent('thrown'); }
        }
'''
NEW_EXP = '''        /**
         * [v3.343.0 · M4-X5] 真出口:同一事件的多方证词与争议档案(只读聚合投影)。
         *   · 输入复用:this.worldProg.knowledgeTraces.traces(与 perspectiveCard 同源);
         *   · event 只看该事件(不给则对每个事件各出一块);at 只收 floor <= at 的说法;
         *   · side / statement / eventId 取自轨迹上的显式声明,不抽语义;
         *   * 来源去重:同 evidenceKey 只算一份独立支持(转述如实计数并报同源对象)。
         *   * 本面零写:writesNothing 恒 true;判不开给 undecided 并带具名 reason。
         */
        testimonyBoard(opts) {
        const absent = (why) => ({ kind: 'testimony_board', version: 0, at: null, atKnown: false, event: '', boards: [], counts: {}, truncated: 0, malformedInput: false, writesNothing: true, degraded: false, ok: false, reason: why });
        try {
        const TB = _testimonyBoardLib();
        if (!TB || typeof TB.build !== 'function') return absent('module-unavailable');
        const traces = (this.worldProg && this.worldProg.knowledgeTraces && this.worldProg.knowledgeTraces.traces) || [];
        const out = TB.build(traces, opts || {});
        const o = Object.assign({}, out, { ok: true, reason: out.degraded ? 'degraded' : '' });
        this._testimonyBoardRead = o;
        return o;
        } catch (e) { errLog(e, 'engine.testimonyBoard'); return absent('thrown'); }
        }
        /**
         * [v3.343.0 · M4-X5] 出口:撤回证据后重算争议状态(喂被撤证据键,不删条目不静默)。
         *   · 只认 evidenceKey / traceId(与被撤判定同一份口径);
         *   · 命中条目标 revoked:true 并列进 revokedItems,随后重算事件状态;
         *   · 状态变了就如实说变了(changed),不把「还剩一个没人能举证的对立」留在 contested。
         */
        testimonyRevoke(dropped, opts) {
        const absent = (why) => ({ kind: 'testimony_board@withdrawal', version: 0, droppedCount: 0, revokedItems: [], unchanged: 0, stateBefore: '', stateAfter: '', changed: false, degraded: false, ok: false, reason: why, writesNothing: true });
        try {
        const TB = _testimonyBoardLib();
        if (!TB || typeof TB.revokeEvidence !== 'function') return absent('module-unavailable');
        const read = this.testimonyBoard(opts || {});
        if (!read || read.ok !== true || !Array.isArray(read.boards)) return absent(read && read.reason ? read.reason : 'no-board');
        const ev = read.event;
        const board = read.boards.filter((b) => !ev || b.eventKey === ev)[0];
        if (!board) return absent('no-board');
        const res = TB.revokeEvidence({ testimonies: board.testimonies, state: board.state }, dropped);
        return Object.assign({}, res, { ok: true, reason: '', writesNothing: true });
        } catch (e) { errLog(e, 'engine.testimonyRevoke'); return absent('thrown'); }
        }
        /** [v3.343.0 · M4-X5] 诊断一行。四方分开说;未决争议与无事件键永远报出来。 */
        _testimonyBoardLine() {
        try {
        const TB = _testimonyBoardLib();
        if (!TB || typeof TB.line !== 'function') return '模块未加载(testimony-board.js)';
        const got = this.testimonyBoard({});
        if (!got.ok) return '证词面不可用(' + got.reason + ')';
        return TB.line(got);
        } catch (e) { errLog(e, 'engine._testimonyBoardLine'); return '—(诊断异常)'; }
        }
'''
s = sub1(s, A_EXP, A_EXP + NEW_EXP, 'exports')

SC_LINES = s.split('\n')
SC_TGT = None
for _i, _l in enumerate(SC_LINES):
    if '账本实体契约' in _l and _l.lstrip().startswith('// [v3.207]'):
        SC_TGT = _i
        break
if SC_TGT is None:
    sys.stderr.write('FAIL: 找不到自检「账本实体」注释行\n')
    sys.exit(1)
SC_HEAD = SC_LINES[SC_TGT]
assert s.count(SC_HEAD) == 1, '自检锚行不唯一: %d' % s.count(SC_HEAD)
NEW_SC = '''                    /* [v3.343.0 · M4-X5] 证词面:回答「对同一事件,各方怎么说、争在哪里」。
                     *   与「视角卡」「记忆问答」分列:那两行答「一个人手上有什么 / 最近一问答得怎样」,
                     *   本行答「若干人对同一事件的说法摆在一起时,能不能下结论」。
                     *   报警只认两条真损失:争议未决(不得写成已定论)与无事件键(说法未进任何事件)。 */
                    (() => {
                        try {
                            const TB = _testimonyBoardLib();
                            if (!TB || typeof TB.line !== 'function' || typeof this.testimonyBoard !== 'function') {
                                return ['证词面', '模块未加载(testimony-board.js)'];
                            }
                            const got = this.testimonyBoard({});
                            if (!got || got.ok !== true) return ['证词面', '待用(面在位 · ' + ((got && got.reason) || '无读数') + ')'];
                            const c = got.counts || {};
                            const bad = (Number(c.noEventKey) > 0) || (Array.isArray(got.boards) && got.boards.some((b) => b.state === 'contested'));
                            return ['证词面', TB.line(got) + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.testimonyBoard'); return ['证词面', '—(诊断异常)'];
                        }
                    })(),
'''
if DRY:
    print('ANCHOR %-16s hits=%d' % ('selfCheck row', s.count(SC_HEAD)))
else:
    s = s.replace(SC_HEAD, NEW_SC + SC_HEAD, 1)

if DRY:
    print('DRY done (nothing written)')
    sys.exit(0)
io.open(IDX, 'w', encoding='utf-8').write(s)
print('WRITTEN index.js bytes=%d' % len(s))
