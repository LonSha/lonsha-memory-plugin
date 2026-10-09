#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.301.0 · M-O2 第二刀：装配段外提 + 装载后重建（修「模块在场却全程走空退路」）。

真宿主实测缺陷（v3.300.0 版，探针 ⑬⑭⑮ 取证）：
  · plugin/engine 在入口加载期**构造**，而 extra_js 要到 init() 里才由 ensureExtraJs() 挂上 ⇒
    构造期 34 个 `_new*` 工厂 + 7 个内联 `window.LonShaX` 降级全部落到 `*Fallback`/匿名空实现。
  · 装载之后 init 只重跑 bindDeps（**符号注入**），**没有任何人重建实例** ⇒ 空退路永久生效。
  · 真宿主读数：engine 32 个 + plugin 2 个成员 `_absent=true`；`ConfigManagerFallback` 持 0 键
    （真实现 181 键）、`saveConfig()` 是 `return undefined` ⇒ 面板 toast「✅ 设置已保存」而
    localStorage 一字未写（最危险的假绿形态）。

本刀做法：
  ① 构造体里的**装配段整段外提**为 `_assembleComponents(config)`（唯一装配点）——
     构造期调一次（模块未装载时的如实降级），装载之后由 `rebuildComponents(newConfig)` 再调一次。
  ② 重建前把「用户数据面」冻下来、重建后回灌（否则重建 = 清空存档，比不修更坏）。
  ③ `window.LonShaX?.Y` 直取点改为 `_winModule('LonShaX','Y')`（同一表达式，惰性读取）。
  ④ 重建读数落 `engine._assembleRead`（before/after 各自 real/absent，可对账）。
  ⑤ 失败只留痕、不阻断（与 ensureExtraJs / rebindModuleDeps 同规格）。

★ 全部锚点先校验「恰中 1 次」再统一写盘。
"""
import io
import sys
import hashlib

P = 'index.js'
S = io.open(P, encoding='utf-8').read()
ORIG_MD5 = hashlib.md5(S.encode('utf-8')).hexdigest()

A_ASM_START = "            this.bookmarks = _newMemoryBooks('IncrementBookmark', this, errLog);"
A_ASM_END = '            this.apiChannels = window.LonShaApiChannels || null;'
A_ENG_FIRST_METHOD = '        clearApiCooldowns() { clearApiCooldowns(); }'
A_INIT_TAIL = """            try { await this.ensureExtraJs(); } catch (e) { errLog(e, 'init.ensureExtraJs'); }
            this.loadModules();"""

for name, a, want in [
    ('A_ASM_START', A_ASM_START, 1),
    ('A_ASM_END', A_ASM_END, 1),
    ('A_ENG_FIRST_METHOD', A_ENG_FIRST_METHOD, 1),
    ('A_INIT_TAIL', A_INIT_TAIL, 1),
]:
    got = S.count(a)
    if got != want:
        print('[patch3301a] 锚点 %s 命中 %d 次（须 %d）——中止' % (name, got, want))
        sys.exit(2)

# ── ① 切出装配段（含 apiChannels 行，不含构造函数收尾 `}`） ──
i0 = S.index(A_ASM_START)
j0 = S.index(A_ASM_END)
j1 = j0 + len(A_ASM_END)
ASM = S[i0:j1]

# ── ② 惰性化 window 直取点（同表达式；构造期读不到、重建期读得到） ──
LAZY = [
    ("this.supersede = new (window.LonShaSupersede?.SupersedeManager || function() {",
     "this.supersede = new (_winModule('LonShaSupersede', 'SupersedeManager') || function() {"),
    ("this.cse = new (window.LonShaCSE?.CSEngine || function() {",
     "this.cse = new (_winModule('LonShaCSE', 'CSEngine') || function() {"),
    ("this.pulse = new (window.LonShaNarrativePulse?.NarrativePulse || function() {",
     "this.pulse = new (_winModule('LonShaNarrativePulse', 'NarrativePulse') || function() {"),
    ("this.aiSelect = new (window.LonShaAISelect?.AISelect || function() {",
     "this.aiSelect = new (_winModule('LonShaAISelect', 'AISelect') || function() {"),
    ("this.stmLtm = window.LonShaStmLtm || null;", "this.stmLtm = _winModule('LonShaStmLtm') || null;"),
    ("this.unifiedRecall = window.LonShaUnifiedRecall || null;", "this.unifiedRecall = _winModule('LonShaUnifiedRecall') || null;"),
    ("this.apiChannels = window.LonShaApiChannels || null;", "this.apiChannels = _winModule('LonShaApiChannels') || null;"),
]
for a, b in LAZY:
    n = ASM.count(a)
    if n != 1:
        print('[patch3301a] 惰性化锚点命中 %d 次：%r' % (n, a[:60])); sys.exit(2)
    ASM = ASM.replace(a, b)

# ── ③ 构造体：装配段 → 一次调用 ──
CTOR_CALL = """            /* [v3.301.0 · M-O2 第二刀] ★ 装配段已整段外提为 `_assembleComponents()`。
             *   为什么必须外提（真宿主实测）：本构造函数运行在**入口加载期**，而 manifest.extra_js
             *   要到 init() 里才由 ensureExtraJs() 挂上 —— 于是体内每个 `_new*` 工厂在这一刻
             *   取库口都读到 null，一律落到 `*Fallback` 空退路；装载之后**没人重建实例**，
             *   空退路就永久生效。真宿主读数：engine 32 + plugin 2 个成员 `_absent=true`、
             *   ConfigManagerFallback 持 0 键（真实现 181 键）、`saveConfig()` 是 `return undefined`
             *   —— 面板 toast「✅ 设置已保存」而 localStorage 一字未写。
             *   本刀把装配收成**唯一入口**：构造期调一次（模块未装载时的如实降级），
             *   装载之后由 `rebuildComponents()` 再调一次（真实现 + 数据回灌）。
             *   ★ 「模块缺席」因而与「模块在场」不同形 —— 前者是降级，后者是真装配。 */
            this._assembleRead = null;
            this._assembleComponents(config);
"""
S2 = S[:i0] + CTOR_CALL + S[j1:]

# ── ④ 引擎方法（插到 MemoryEngine 首个方法之前） ──
HEAD = """
        /** [v3.301.0 · M-O2 第二刀] ★ 唯一装配点（构造期 + 装载后各调一次，幂等）。
         *  为什么必须有它：所有 `_new*` 工厂与内联 window 降级都依赖 extra_js 挂上的模块全局，
         *  而挂载时机**晚于**本引擎的构造 —— 修前装配写在构造体内，于是模块在场也永远走空退路
         *  （真宿主实测：34 个成员 `_absent=true`、配置 0 键、saveConfig 空转、graph 空 Map）。
         *  `config` 缺省沿用现有 this.config；重建路径由 rebuildComponents 传入新造的真配置实例。 */
        _assembleComponents(config) {
            if (config !== undefined) this.config = config;
            else config = this.config;
__ASM__            return this;
        }
        /** [v3.301.0 · M-O2 第二刀] 装载之后的重建：先冻用户数据面 → 重装配 → 回灌。
         *  读数落 `_assembleRead`（before/after 各自 real/absent，可对账「真的换过来了」）。
         *  失败只留痕、不阻断（与 ensureExtraJs / rebindModuleDeps 同规格）。 */
        rebuildComponents(newConfig) {
            const read = { at: Date.now(), rebuilt: false, frozen: 0, restored: 0, before: null, after: null, why: '' };
            try {
                read.before = this._componentProbe();
                if (read.before.absent === 0) {
                    read.why = 'already-live';   // 模块提前在场（判据夹具 / 热更新）⇒ 无需重建
                } else {
                    const snap = this._captureComponentState();
                    read.frozen = snap ? (snap.__slots || 0) : 0;
                    this._assembleComponents(newConfig);
                    read.restored = this._restoreComponentState(snap);
                    read.rebuilt = true;
                }
                read.after = this._componentProbe();
            } catch (e) {
                read.why = 'error:' + String((e && e.message) || e).slice(0, 200);
                try { errLog(e, 'O2.rebuildComponents'); } catch (_e) { /* 留痕不得成为新的失败 */ }
            }
            this._assembleRead = read;
            return read;
        }
        /** [v3.301.0 · M-O2 第二刀] 装配体检读数：真实现 / 空退路各几个（「模块缺席不冒充空账」）。 */
        _componentProbe() {
            let total = 0, real = 0, absent = 0;
            for (const n of this._componentSlots()) {
                const v = this[n];
                if (v === null || v === undefined || typeof v !== 'object') continue;
                total += 1;
                if (v._absent === true) absent += 1; else real += 1;
            }
            return { total, real, absent };
        }
        /** 受检成员名（装配段 `this.X = ...` 的两类消费面：工厂产物 + window 直取面）。 */
        _componentSlots() {
            return ['bookmarks', 'graph', 'summary', 'diary', 'charMem', 'worldProg', 'reflection',
                'snapshots', 'vector', 'storage', 'llm', 'pov', 'timeline', 'clock', 'bm25',
                'lexicon', 'prequel', 'status', 'ledger', 'mutex', 'holiday', 'suspense', 'scene',
                'echo', 'moneyLedger', 'cards', 'conflicts', 'deltaBook', 'outline', 'pairMem',
                'opLog', 'supersede'];
        }
        /** 冻「用户数据面」：重建前必须把有状态组件的内容取出（否则重建 = 清空存档）。
         *  契约：**只取 export() 的返回值**，取不到就记 null（null 与 {} 不同义）。 */
        _captureComponentState() {
            const out = {};
            const take = (k) => {
                try {
                    const v = this[k];
                    out[k] = (v && typeof v.export === 'function') ? v.export() : null;
                } catch (_e) { out[k] = null; }
            };
            for (const k of ['graph', 'summary', 'diary', 'charMem', 'worldProg', 'reflection',
                'vector', 'pov', 'timeline', 'clock', 'bm25', 'prequel', 'status', 'suspense',
                'scene', 'echo', 'moneyLedger', 'cards', 'conflicts', 'deltaBook', 'outline',
                'pairMem', 'bookmarks', 'supersede', 'ledger']) take(k);
            out.__slots = Object.keys(out).length - 1;
            return out;
        }
        /** 回灌：把冻下来的面装回重建后的真实现（`import` 契约同构；失败只留痕）。 */
        _restoreComponentState(snap) {
            if (!snap) return 0;
            let n = 0;
            for (const k of Object.keys(snap)) {
                if (k === '__slots') continue;
                const data = snap[k];
                if (data === null || data === undefined) continue;
                const v = this[k];
                if (!v || typeof v.import !== 'function') continue;
                try { v.import(data); n += 1; } catch (e) { try { errLog(e, 'O2.restore.' + k); } catch (_e) { /* 留痕不得成为新的失败 */ } }
            }
            /* [v3.180] status.clock 是跨实例引用：装配段只在其构造点设一次，重建后必须重挂。 */
            try { if (this.status && this.clock) this.status.clock = this.clock; } catch (_e) { /* 非致命 */ }
            return n;
        }
        /** 惰性取模块全局：构造期读不到（extra_js 未挂）与重建期读得到，必须不同形。 */
        _winModule(globalName, propName) {
            try {
                const g = (typeof window !== 'undefined') ? window[globalName] : null;
                if (!g) return null;
                return propName ? (g[propName] || null) : g;
            } catch (_e) { return null; }
        }
"""
ENGINE_METHODS = HEAD.replace('__ASM__', ASM)

if A_ENG_FIRST_METHOD not in S2:
    print('[patch3301a] 引擎方法插入锚点丢失'); sys.exit(2)
S3 = S2.replace(A_ENG_FIRST_METHOD, ENGINE_METHODS + A_ENG_FIRST_METHOD, 1)

# ── ⑤ init 接线：装载之后重建（新真配置实例 + 引擎重建 + plugin 侧同步） ──
NEW_INIT_TAIL = """            try { await this.ensureExtraJs(); } catch (e) { errLog(e, 'init.ensureExtraJs'); }
            this.loadModules();
            /* [v3.301.0 · M-O2 第二刀] ★ 模块真挂上之后**重建装配**：构造期那一遍必然走空退路
             *   （见构造函数与 _assembleComponents 注释），此处把引擎成员换成真实现，
             *   并把重建前的用户数据面回灌回去。
             *   位置：loadModules 之后（它只读 `_moduleStatus`，不读实例）、rebindModuleDeps 之前。
             *   配置实例必须在这里**新造一份**（构造期那份是 ConfigManagerFallback，持 0 键）。
             *   失败只留痕、不阻断 init（与 ensureExtraJs 同规格）。 */
            try {
                this.configMgr = _newConfigManager();
                this.engine.rebuildComponents(this.configMgr);
            } catch (e) { errLog(e, 'init.rebuildComponents'); }
            /* 紧急备份同为构造期产物（其消费点在 init 之后的真实事件里），退路必须换掉。 */
            try {
                if (this.emergency && this.emergency._absent === true) {
                    this.emergency = _newMemoryAux('EmergencyBackup', { errLog: (e, tag) => { try { errLog(e, tag); } catch (_e) { /* 诊断不得成为新的失败 */ } } });
                }
            } catch (e) { errLog(e, 'init.emergencyRebuild'); }"""
S4 = S3.replace(A_INIT_TAIL, NEW_INIT_TAIL, 1)
if S4 == S3:
    print('[patch3301a] init 接线未生效'); sys.exit(2)

# ── ⑥ 自检：关键片段在最终全文中的出现次数 ──
post = [
    ('_assembleComponents(config);', 1),
    ('this._assembleComponents(newConfig);', 1),
    ('rebuildComponents(newConfig) {', 1),
    ('rebuildComponents(this.configMgr)', 1),
    ("_winModule('LonShaApiChannels')", 1),
    ("window.LonShaApiChannels", 0),
    ("this.vector = _newMemoryOrgan('VectorStore', config);", 1),
    ('this.configMgr = _newConfigManager();', 2),
]
for needle, want in post:
    got = S4.count(needle)
    if got != want:
        print('[patch3301a] 自检失败：%r 出现 %d 次（期望 %d）' % (needle, got, want)); sys.exit(2)

io.open(P, 'w', encoding='utf-8').write(S4)
print('[patch3301a] 完成：%d -> %d 字节；md5 %s -> %s' % (
    len(S.encode('utf-8')), len(S4.encode('utf-8')), ORIG_MD5, hashlib.md5(S4.encode('utf-8')).hexdigest()))