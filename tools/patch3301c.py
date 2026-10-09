#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.301.0 · M-O2 第二刀 补丁 c：init 接线序修正。

自伤留痕（patch3301a 造成的既有判据失败）：把 `rebuildComponents` 插在
`loadModules()` 与 `rebindModuleDeps()` **之间**，其中夹了 11 行注释与新块 ⇒
v3277 的 judgeInitOrder（「loadModules 之后 6 行内必须有 rebindModuleDeps」）当场失败。

修法不是放宽判据，而是**改回正确的接线序**：
  loadModules() → rebindModuleDeps() → rebuildComponents() → registerEvents()
理由（也正合语义）：rebind 只把宿主现算的符号注入**模块**（模块级副本替换），重建实例
必须在其后 —— 这样实例构造时用到的模块已经是注入过的；反之「先造实例再注入模块」，
实例持有的闭包可能仍是未注入的那一份。
"""
import io
import sys
import hashlib

P = 'index.js'
S = io.open(P, encoding='utf-8').read()
BEFORE = hashlib.md5(S.encode('utf-8')).hexdigest()

OLD = """            this.loadModules();
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
            } catch (e) { errLog(e, 'init.emergencyRebuild'); }
            /* [v3.277.0 O7] 模块装载之后立刻重绑依赖：extra_js 已挂上，此时注入才真正生效。
             *   放在 loadModules 之后、registerEvents 之前 —— 事件接线与后续构造会用到
             *   被注入后的模块符号，顺序不能颠倒。失败只留痕、不阻断 init（注入是增强不是前置）。 */
            try { this.engine.rebindModuleDeps(); } catch (e) { errLog(e, 'O7.init.rebindModuleDeps'); }"""

NEW = """            this.loadModules();
            /* [v3.277.0 O7] 模块装载之后立刻重绑依赖：extra_js 已挂上，此时注入才真正生效。
             *   放在 loadModules 之后、registerEvents 之前 —— 事件接线与后续构造会用到
             *   被注入后的模块符号，顺序不能颠倒。失败只留痕、不阻断 init（注入是增强不是前置）。 */
            try { this.engine.rebindModuleDeps(); } catch (e) { errLog(e, 'O7.init.rebindModuleDeps'); }
            /* [v3.301.0 · M-O2 第二刀] ★ 依赖注入之后**重建装配**（顺序：先注入模块、再造实例）。
             *   为什么必须在 rebind 之后：rebind 把宿主现算的符号注入**模块**，此后 new 出来的
             *   实例才持有注入过的模块；反序会让实例闭包停留在未注入的那一份。
             *   为什么必须重建：构造期在入口加载时，extra_js 尚未挂上 ⇒ 装配全落空退路
             *   （真宿主实测 before：32 个受检成员里 31 个 `_absent=true`、配置 0 键、
             *   saveConfig 空转）；此处换成真实现，并把重建前的用户数据面原样回灌。
             *   配置实例必须**新造一份**（构造期那份是 ConfigManagerFallback，持 0 键）。
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

n = S.count(OLD)
if n != 1:
    print('[patch3301c] init 段锚点命中 %d 次 ——中止' % n); sys.exit(2)
S2 = S.replace(OLD, NEW, 1)

# 自检：loadModules → rebind → rebuild 的顺序 + 6 行窗口
lines = S2.split('\n')
li = next(i for i, l in enumerate(lines) if 'this.loadModules();' in l)
win = '\n'.join(lines[li:li + 6])
if 'rebindModuleDeps()' not in win:
    print('[patch3301c] rebind 未落在 loadModules 之后 6 行窗口内'); sys.exit(2)
ri = next(i for i, l in enumerate(lines) if 'this.engine.rebuildComponents(this.configMgr);' in l)
if not (li < ri):
    print('[patch3301c] rebuild 未在 loadModules 之后'); sys.exit(2)

io.open(P, 'w', encoding='utf-8').write(S2)
print('[patch3301c] 完成：md5 %s -> %s' % (BEFORE, hashlib.md5(S2.encode('utf-8')).hexdigest()))