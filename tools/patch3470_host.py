#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.347.0 M4-X9 宿主接线补丁(index.js)。三段式:取库口 / 宿主三法 / 自检行。

纪律(本仓现场):
  · 逐条报 ok/FAIL,末尾统一写盘(个别锚点失配不得整批不写盘);
  · 锚点一律从真源真行提取(先 --check 探,再 --write);
  · 落盘后 ast 无关(JS),改用 node --check。
用法:python3 tools/patch3470_host.py [--check|--write]
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
TARGET = ROOT + 'index.js'

# ── 1 取库口:紧接 _materialPackLib 之后插入(以它的函数体尾为锚) ──
ANCHOR_LIB = """    function _materialPackLib() {
        return _moduleLib(() => window.LonShaMaterialPack, 'material-pack.js');
    }"""

INSERT_LIB = """    function _materialPackLib() {
        return _moduleLib(() => window.LonShaMaterialPack, 'material-pack.js');
    }
    // [v3.347.0 · M4-X9] 资料与剧情分区的联合查证(lore-crosscheck.js)。为什么需要:
    //   M4-X9 点名的一问是「设定怎么说、剧情实际是否做到」——本仓已有 lore-import.js
    //   (保存**段落来源与类别**:setting-rule / backstory-event / character-bg /
    //   reference-only + ORIGIN 一律 imported-lore + settingAsHappened 标志位)与
    //   evidence-query.js(按**账本**查询:参与者 / 时间 / 来源 / 状态),但前史片段、
    //   正文资料、聊天事实来自**不同 owner**,两侧读数**不同形**(资料「N 段」/ 剧情
    //   「N 条账行」)——并排看也说不清某条设定**在剧情里兑现了没有**;更坏的是资料里
    //   写着「已经发生」的规则 / 前史一查就与聊天事实**同形**(参考小说的事件被当成
    //   当前会话已发生),撤除某段资料后历史答案里仍留着它的正文(「来源失效」在读数上
    //   没有落点),用户批注还能冒充原文或事实。
    //   本模块是**只读分区投影**:受控 sourceMode(仅剧情 / 仅资料 / 对照)+ 来源分区
    //   (chat / lore / note / unknown)+ 六态判定(matched / divergent / unrealized /
    //   lore-only / chat-only / unchecked,穷尽且互不同形)+ 撤除闸(正文一格不带、
    //   历史来源报 sourceStale)+ 同名跨资料**不硬合并**;**不联网**、**不建开放 RAG**、
    //   **不复制全文到每轮上下文**、**不默认把资料并入正史**(loreInCanon 恒 false);
    //   原文按需从 owner 读(本面只搬 sourceRef,不缓存正文)。
    function _loreCrosscheckLib() {
        return _moduleLib(() => window.LonShaLoreCrosscheck, 'lore-crosscheck.js');
    }"""

# ── 2 宿主三法:落在 _materialPackLine 之后(以它的函数体尾为锚) ──
ANCHOR_METHODS = """        _materialPackLine() {
            try {
                const MP = _materialPackLib();
                if (!MP || typeof MP.line !== 'function') return '模块未加载(material-pack.js)';
                const got = this.materialPack('advance', {});
                if (!got.ok) return '材料包不可用(' + got.reason + ')';
                return MP.line(got);
            } catch (e) { errLog(e, 'engine._materialPackLine'); return '—(诊断异常)'; }
        }"""

INSERT_METHODS = ANCHOR_METHODS + """
        /** [v3.347.0 · M4-X9] 剧情侧取数(唯一装配点):从既有 owner 收**剧情事实行**。
         *  逐源守 —— 取不到报 absent、抛异常报 thrown,**缺席绝不冒充空**。 */
        _crosscheckChatRows(opts) {
            const o = (opts && typeof opts === 'object') ? opts : {};
            const out = [];
            const sources = [];
            /* `ok` 键面**逐源不同**:有的出口恒 `ok: true`,有的(结构化查询)是
             *   `state` 键面 —— 故取样判据由调用方给,不硬写一个。 */
            const take = (name, fn, map, isOk) => {
                try {
                    const got = fn();
                    const good = (typeof isOk === 'function') ? isOk(got) : (!!got && got.ok === true);
                    if (!good) { sources.push({ source: name, state: 'absent', why: (got && (got.reason || got.state)) || 'no-read', added: 0 }); return; }
                    const rows = map(got) || [];
                    for (const r of rows) if (r && typeof r === 'object') out.push(r);
                    sources.push({ source: name, state: 'ok', why: '', added: rows.length });
                } catch (e) { errLog(e, 'engine._crosscheckChatRows.' + name); sources.push({ source: name, state: 'thrown', why: 'thrown', added: 0 }); }
            };
            /* 1 结构化证据查询(既有 owner `searchEvidenceStructured`):按台账取行,
             *   转成分区条目(partition 'chat')。只搬 ref / ledger / floor / title,
             *   **不搬正文全文**(本面不缓存正文)。★ 这走的是**结构化组合筛选**那一口,
             *   不是关键词打分口 —— 两者 `total` 含义不同,不合成一个口。 */
            take('evidence-query', () => this.searchEvidenceStructured(o.query || {}, o.queryOpts || {}), (got) => {
                const rows = Array.isArray(got.rows) ? got.rows : [];
                return rows.slice(0, 120).map((r, i) => ({
                    id: 'Q' + String(i) + ':' + String((r && (r.ref || r.key)) || ''),
                    partition: 'chat', subject: (r && (r.title || r.subject)) || '',
                    title: (r && (r.title || r.subject)) || '', detail: (r && (r.text || r.detail)) || '',
                    status: (r && r.status) || '', ledger: (r && r.ledger) || '',
                    floor: (r && r.floor !== undefined ? r.floor : null), ref: (r && (r.ref || r.key)) || '',
                }));
            }, (got) => !!got && Array.isArray(got.rows));
            return { chat: out, sources: sources };
        }
        /** [v3.347.0 · M4-X9] 建面(**只读**):按 sourceMode 做分区联合查证。 */
        loreCrosscheck(sourceMode, opts) {
            const absent = (why) => ({ kind: 'lore_crosscheck', version: 0, judged: false, mode: '', modeLabel: '', judgements: [], needsConfirm: [], revoked: [], staleRefs: [], gaps: [], reasons: [why], counts: { lore: 0, chat: 0, note: 0, unknown: 0, judged: 0, matched: 0, divergent: 0, unrealized: 0, loreOnly: 0, chatOnly: 0, unchecked: 0, revoked: 0, dropped: 0, truncatedIn: 0, kept: 0 }, loreInCanon: false, admitted: false, noteIsNotSource: true, readsFullText: false, copiesFullText: false, online: false, writesNothing: true, devisesNothing: true, injectsNothing: false, ok: false, reason: why, sources: [] });
            try {
                const CX = _loreCrosscheckLib();
                if (!CX || typeof CX.build !== 'function') return absent('module-unavailable');
                const o = (opts && typeof opts === 'object') ? opts : {};
                /* 资料侧:调用方直给(通常来自 lore-import 的解析读数)优先;
                 *   剧情侧:调用方直给优先,缺则由装配点从既有 owner 收。 */
                const loreItems = Array.isArray(o.lore) ? o.lore.slice() : [];
                const noteItems = Array.isArray(o.note) ? o.note.slice() : [];
                let chatItems = Array.isArray(o.chat) ? o.chat.slice() : null;
                let sources = [];
                if (chatItems === null) {
                    const asm = this._crosscheckChatRows(o);
                    chatItems = asm.chat; sources = asm.sources;
                } else sources = [{ source: 'caller', state: 'ok', why: '', added: chatItems.length }];
                const input = { lore: loreItems, chat: chatItems, note: noteItems };
                const out = CX.build(sourceMode, input, {
                    revokedKeys: o.revokedKeys, historyRefs: o.historyRefs, admitLore: o.admitLore,
                });
                const r = Object.assign({}, out, { sources: sources, ok: true, reason: out.malformedInput ? 'malformed' : (out.degraded ? 'degraded' : '') });
                this._loreCrosscheckRead = r;
                return r;
            } catch (e) { errLog(e, 'engine.loreCrosscheck'); return absent('thrown'); }
        }
        /** [v3.347.0 · M4-X9] 诊断一行。四方分开说;三例计数与撤除永远报出来。 */
        _loreCrosscheckLine() {
            try {
                const CX = _loreCrosscheckLib();
                if (!CX || typeof CX.line !== 'function') return '模块未加载(lore-crosscheck.js)';
                const got = this.loreCrosscheck('compare', {});
                if (!got.ok) return '资料对照不可用(' + got.reason + ')';
                return CX.line(got);
            } catch (e) { errLog(e, 'engine._loreCrosscheckLine'); return '—(诊断异常)'; }
        }"""

# ── 3 自检行:落在「材料包」行之后(以 selfCheck.materialPack 收尾为锚) ──
ANCHOR_SELF = """                        } catch (e) { errLog(e, 'selfCheck.materialPack'); return ['材料包', '—(诊断异常)'];
                        }
                    })(),"""

INSERT_SELF = """                        } catch (e) { errLog(e, 'selfCheck.materialPack'); return ['材料包', '—(诊断异常)'];
                        }
                    })(),
                    /* [v3.347.0 · M4-X9] 资料对照:回答「设定怎么说、剧情实际是否做到」。
                     *   与「资料导入」面分列:那一行答「这段资料是什么类别、来源哪一段」,本行答
                     *   「这段资料在剧情里兑现了没有」(分区 + 六态判定 + 撤除)。报警只认两条真损失:
                     *   **偏离设定**(divergent)/ **设定事件未发生**(unrealized)—— 都是「资料与
                     *   剧情对不上」这件事,不报警的「判不了」与本面只读口径分列。 */
                    (() => {
                        try {
                            const CX = _loreCrosscheckLib();
                            if (!CX || typeof CX.line !== 'function' || typeof this.loreCrosscheck !== 'function') {
                                return ['资料对照', '模块未加载(lore-crosscheck.js)'];
                            }
                            const got = this.loreCrosscheck('compare', {});
                            if (!got || got.ok !== true) return ['资料对照', '待用(面在位 · ' + ((got && got.reason) || '无读数') + ')'];
                            const c = got.counts || {};
                            const bad = Number(c.divergent) > 0 || Number(c.unrealized) > 0;
                            const tag = (Number(c.lore) || Number(c.chat)) ? '(已分区)' : '(暂无可查)';
                            return ['资料对照', tag + ' ' + CX.line(got) + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.loreCrosscheck'); return ['资料对照', '—(诊断异常)'];
                        }
                    })(),"""

PATCHES = [
    ('lib', ANCHOR_LIB, INSERT_LIB),
    ('methods', ANCHOR_METHODS, INSERT_METHODS),
    ('selfcheck', ANCHOR_SELF, INSERT_SELF),
]


def main():
    write = '--write' in sys.argv
    src = io.open(TARGET, encoding='utf-8').read()
    results = []
    new = src
    for name, anchor, ins in PATCHES:
        n = new.count(anchor)
        if n != 1:
            results.append((name, 'FAIL', 'anchor hit %d (need 1)' % n))
            continue
        new = new.replace(anchor, ins, 1)
        results.append((name, 'ok', 'hit 1 -> inserted'))
    for name, st, msg in results:
        print('%-10s %-5s %s' % (name, st, msg))
    failed = [r for r in results if r[1] != 'ok']
    if failed:
        sys.stderr.write('FAIL: %d 处未命中,整批不写盘\n' % len(failed))
        sys.exit(1)
    if write:
        b = '/tmp/bak3470/'
        import os
        os.makedirs(b, exist_ok=True)
        io.open(b + 'index.js.pre3470', 'w', encoding='utf-8').write(src)
        io.open(TARGET, 'w', encoding='utf-8').write(new)
        print('WROTE index.js: %d -> %d bytes' % (len(src), len(new)))
    else:
        print('CHECK ok (%d -> %d bytes, 未写盘)' % (len(src), len(new)))


main()