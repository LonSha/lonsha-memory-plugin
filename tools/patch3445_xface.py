#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 · M4-X7 宿主接线面:取库口 + 出口区 + 自检面行。
纪律:
  · 锚点**一律纯 ASCII**(全角标点是本仓头号坑);
  · 每处锚点命中数必须恰 1,否则 abort(不落半截);
  · 结构性插入(按精确行定位,不做正则替换);
  · 落盘后由调用方过 node --check。
"""
import io
import os
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
TARGET = ROOT + 'index.js'
BAK = '/tmp/bak3445/'

src = io.open(TARGET, encoding='utf-8').read()
os.makedirs(BAK, exist_ok=True)
io.open(BAK + 'index.js.pre3445', 'w', encoding='utf-8').write(src)

FA = """    // [v3.345.0 · M4-X7] 旧事重现的生成控频闸(return-gate.js)。为什么需要:
    //   fated-recall(M3-X8)交付了「该不该想起来」,并刻意只到「建议 + 来源」为止;
    //   但「建议可注入」是一个**静态判断**,与「本轮真进了生成」在读数上同形;
    //   「预览了一下就取消」会误消耗冷却;重开/切回会重复轰炸。
    //   本模块是**只读控频闸**:三通道(preview/shown/used)分列,冷却只按 shown/used 落定;
    //   默认 hint-only(显式 inject 才自动注入);状态由宿主持有(worldProg.returnGate 子键,
    //   随世界进程一并跨会话携带 —— 这正是「重开/切回不重复轰炸」的载体)。
    function _returnGateLib() {
        return _moduleLib(() => window.LonShaReturnGate, 'return-gate.js');
    }
"""

FB = """        /* ────────────────────────────────────────────────────────────────────────
         * [v3.345.0 · M4-X7] 旧事重现的生成控频闸面
         *
         * 【与「旧事重现面」(M3-X8)的关系(两个问题)】
         *   那一面答「此刻**为什么**该想起来」(情境 → 触发键 → 候选 → 建议),
         *   并刻意只到「建议 + 来源」为止;本面答「想起来的那些此刻**到底会不会
         *   进生成**、会不会重复轰炸」—— 三通道(preview / shown / used)分列,
         *   **冷却只按 shown / used 落定**。
         *
         * 【一个不可让步的口径】**预览不消耗冷却**:preview 标记照记,但不算冷却;
         *   真正落冷却的是 shown(给过提示)与 used(真进了生成)。于是「预览了一下
         *   就取消」不会把下一轮想提的旧事也堵死。
         *
         * 【宿主只做三件事】装配候选(缺省从 fated-recall 的 suggested 取)→ 转发 →
         *   留痕。**本面不产正文、不删历史事实**:反馈只记呈现偏好(less / never)。
         */
        /** [v3.345.0 · M4-X7] 候选装配(唯一装配点):显式给 ⇒ 用它;否则取 fated-recall 的 suggested。 */
        _returnGateCandidates(opts) {
            const o = (opts && typeof opts === 'object') ? opts : {};
            if (Array.isArray(o.candidates)) return { candidates: o.candidates, source: 'given' };
            const FR = _fatedRecallLib();
            if (!FR || typeof FR.suggest !== 'function') return { candidates: [], source: 'no-fated' };
            try {
                const res = FR.suggest(this._fatedRecallDeps(), this._fatedRecallState || {}, o);
                const cands = (Array.isArray(res && res.suggested) ? res.suggested : []).map((c) => ({
                    kind: c.kind || '', triggerKey: c.triggerKey || '',
                    detailKey: c.detailKey || c.entryKey || '',
                    title: c.title || c.snippet || '', source: c.source || '',
                    knowing: c.knowing || '', subjects: c.subjects || []
                }));
                return { candidates: cands, source: 'fated-recall' };
            } catch (e) { errLog(e, 'engine._returnGateCandidates'); return { candidates: [], source: 'thrown' }; }
        }
        /** [v3.345.0 · M4-X7] 建面(**只读**):候选过闸 → 可提 / 押后 / 不出 / 可注入四方分列。 */
        returnGate(opts) {
            const absent = (why) => ({ kind: 'return_gate', version: 0, judged: false, policy: 'hint-only', policyLabel: '只给提示', now: null, gates: [], open: [], held: [], blocked: [], injectable: [], counts: { total: 0, open: 0, held: 0, blocked: 0, injectable: 0 }, cooldownUnjudged: 0, emotion: '', emotionUsed: false, prefsApplied: { less: 0, never: 0 }, reasons: [why], truncated: 0, writesNothing: true, devisesNothing: true, ok: false, reason: why });
            try {
                const RG = _returnGateLib();
                if (!RG || typeof RG.build !== 'function') return absent('module-unavailable');
                const o = (opts && typeof opts === 'object') ? opts : {};
                const picked = this._returnGateCandidates(o);
                const st = (this.worldProg && this.worldProg.returnGate && typeof this.worldProg.returnGate === 'object') ? this.worldProg.returnGate : {};
                const out = RG.build(picked.candidates, { state: st, policy: o.policy, now: o.now, window: o.window, emotion: o.emotion });
                const r = Object.assign({}, out, { ok: true, reason: out.malformedInput ? 'malformed' : (out.degraded ? 'degraded' : ''), candidateSource: picked.source });
                this._returnGateRead = r;
                return r;
            } catch (e) { errLog(e, 'engine.returnGate'); return absent('thrown'); }
        }
        /** [v3.345.0 · M4-X7] **进入真实生成**的移交:返回本轮被允许进生成通道的旧事。
         *   · **只读 + 不消耗冷却**:移交本身不算「用过」,调用方须在实际使用后调
         *     returnGateMark('used', ...) 才落冷却(预览不消耗的同一口径);
         *   · 只给**策略允许 + gate open + 冷却已判**的条目(冷却未判 ⇒ 不给,不猜)。 */
        returnGateAdmit(opts) {
            try {
                const read = this.returnGate(opts || {});
                if (!read || read.ok !== true) return { kind: 'return_gate@admit', admitted: [], count: 0, injectable: false, ok: false, reason: (read && read.reason) || 'no-read', writesNothing: true };
                const adm = Array.isArray(read.injectable) ? read.injectable : [];
                const out = { kind: 'return_gate@admit', admitted: adm, count: adm.length, injectable: read.policy === 'inject', policy: read.policy, policyLabel: read.policyLabel, cooldownUnjudged: read.cooldownUnjudged, ok: true, reason: adm.length ? '' : (read.policy === 'inject' ? 'nothing-open' : 'hint-only'), writesNothing: true, note: '移交不算已用:实际使用后须调 returnGateMark(used,...) 才落冷却' };
                this._returnGateAdmit = out;
                return out;
            } catch (e) { errLog(e, 'engine.returnGateAdmit'); return { kind: 'return_gate@admit', admitted: [], count: 0, injectable: false, ok: false, reason: 'thrown', writesNothing: true }; }
        }
        /** [v3.345.0 · M4-X7] 登记一次动作(**三通道分列**);状态存 worldProg.returnGate(跨会话携带)。 */
        returnGateMark(channel, rec) {
            const RG = _returnGateLib();
            if (!RG || typeof RG.markChannel !== 'function') return { ok: false, reason: 'module-absent', changed: false, state: (this.worldProg && this.worldProg.returnGate) || { marks: [], prefs: {} } };
            try {
                const cur = (this.worldProg && this.worldProg.returnGate) ? this.worldProg.returnGate : {};
                const res = RG.markChannel(cur, Object.assign({}, rec || {}, { channel: channel }));
                if (res.ok && res.changed) {
                    if (!this.worldProg) this.worldProg = {};
                    this.worldProg.returnGate = res.state;
                }
                return Object.assign({ kind: RG.RG_KIND + '_mark', version: RG.RG_VERSION }, res);
            } catch (e) { errLog(e, 'engine.returnGateMark'); return { ok: false, reason: 'thrown', changed: false, state: (this.worldProg && this.worldProg.returnGate) || { marks: [], prefs: {} } }; }
        }
        /** [v3.345.0 · M4-X7] 设呈现偏好(**只记偏好,不删任何历史事实**)。 */
        returnGatePrefer(detailKey, pref) {
            const RG = _returnGateLib();
            if (!RG || typeof RG.withPreference !== 'function') return { ok: false, reason: 'module-absent', changed: false, state: (this.worldProg && this.worldProg.returnGate) || { marks: [], prefs: {} } };
            try {
                const cur = (this.worldProg && this.worldProg.returnGate) ? this.worldProg.returnGate : {};
                const res = RG.withPreference(cur, detailKey, pref);
                if (res.ok && res.changed) {
                    if (!this.worldProg) this.worldProg = {};
                    this.worldProg.returnGate = res.state;
                }
                return Object.assign({ kind: RG.RG_KIND + '_prefer', version: RG.RG_VERSION }, res);
            } catch (e) { errLog(e, 'engine.returnGatePrefer'); return { ok: false, reason: 'thrown', changed: false, state: (this.worldProg && this.worldProg.returnGate) || { marks: [], prefs: {} } }; }
        }
        /** [v3.345.0 · M4-X7] 诊断一行。四方分开说;三条真损失永远报出来。 */
        _returnGateLine() {
            try {
                const RG = _returnGateLib();
                if (!RG || typeof RG.line !== 'function') return '模块未加载(return-gate.js)';
                const got = this.returnGate({});
                if (!got.ok) return '控频闸不可用(' + got.reason + ')';
                return RG.line(got);
            } catch (e) { errLog(e, 'engine._returnGateLine'); return '—(诊断异常)'; }
        }
"""

FC = """                    /* [v3.345.0 · M4-X7] 控频闸:回答「旧事重现此刻会不会真的进生成、有没有被反复轰炸」。
                     *   与「旧事重现」面分列:那一行答「该不该想起来」,本行答「想起来之后
                     *   会不会真进生成、会不会重复轰炸」。报警只认三条真损失:只给提示却仍
                     *   可注入(闸失效)、冷却未判却当无冷却(不猜)、预览误消耗冷却。 */
                    (() => {
                        try {
                            const RG = _returnGateLib();
                            if (!RG || typeof RG.line !== 'function' || typeof this.returnGate !== 'function') {
                                return ['控频闸', '模块未加载(return-gate.js)'];
                            }
                            const got = this.returnGate({});
                            if (!got || got.ok !== true) return ['控频闸', '待用(面在位 · ' + ((got && got.reason) || '无读数') + ')'];
                            const c = got.counts || {};
                            const bad = (got.policy === 'hint-only' && Number(c.injectable) > 0)
                                || (Number(got.cooldownUnjudged) > 0);
                            const tag = Number(c.injectable) > 0 ? '(可注入)' : '(仅提示)';
                            return ['控频闸', tag + ' ' + RG.line(got) + (bad ? ' ⚠️' : '')];
                        } catch (e) { errLog(e, 'selfCheck.returnGate'); return ['控频闸', '—(诊断异常)'];
                        }
                    })(),
"""

A1 = "    function _narrativeLayerLib() {\n        return _moduleLib(() => window.LonShaNarrativeLayer, 'narrative-layer.js');\n    }\n"
A2 = "        perspectiveContrast(characterA, characterB, opts) {"
A3 = "selfCheck.narrativeLayer"

for label, a in [('A1 取库口', A1), ('A2 出口区', A2), ('A3 自检面', A3)]:
    n = src.count(a)
    print('%s 命中 %d 次' % (label, n))
    if n != 1:
        sys.stderr.write('FAIL: %s 锚点命中 %d 次(应为 1)\n' % (label, n))
        sys.exit(11)

# A1 插入
i = src.index(A1) + len(A1)
src = src[:i] + FA + src[i:]

# A2 插入
i = src.index(A2)
src = src[:i] + FB + src[i:]

# A3:定位自检行,再找其所在 `})(),` 行尾
j = src.index(A3)
k = src.index('                    })(),', j)
k_end = k + len('                    })(),') + 1   # 含换行
src = src[:k_end] + FC + src[k_end:]

io.open(TARGET, 'w', encoding='utf-8').write(src)
print('PATCHED index.js (三面)')