#!/usr/bin/env python3
# [v3.267.0 A1 第七刀] 宿主侧补丁：取库口 + 退路 + 统一构造点 + 依赖注入口 + 构造点改指 + 删类 + 抬版。
#   每处锚点必须恰中 1 次；命中数不符即退出（防重复执行 / 防打偏）。
#   接线正文以内嵌函数生成；保留单文件重建能力，不依赖已清理的临时 payload。
import re, os
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
P = os.path.join(R, 'index.js')
S = open(P, encoding='utf-8').read()
NL = chr(10)
hits = []

def sub_once(old, new, label):
    global S
    n = S.count(old)
    if n != 1: raise SystemExit('anchor not unique (%d): %s' % (n, label))
    hits.append(label)
    S = S.replace(old, new, 1)

def wiring_block():
    return '''
    // ══════════════════════════════════════════════════════════════════
    // [v3.267.0 A1 第七刀] 配置管理器模块取库口。
    // ConfigManager 本体已移至 memory-config.js；入口只保留同形缺席退路。
    // ══════════════════════════════════════════════════════════════════
    function _memoryConfigLib() {
        return _moduleLib(() => window.LonShaMemoryConfig, 'memory-config.js');
    }
    class ConfigManagerFallback {
        constructor() { this._absent = true; this.config = {}; this._lastMigrationReport = null; this._configLoadError = null; }
        loadConfig() { return undefined; }
        _applyCardOverrides() { return 0; }
        saveConfig() { return undefined; }
    }
    function _newConfigManager(...args) {
        const MC = _memoryConfigLib();
        if (MC && typeof MC.bindDeps === 'function') {
            try { MC.bindDeps({ configDefaultsTemplate: _configDefaultsTemplate }); } catch (e) { /* 推不进去按副本处理，不阻断构造 */ }
        }
        const C = (MC && typeof MC.ConfigManager === 'function') ? MC.ConfigManager : ConfigManagerFallback;
        const inst = new C(...args);
        try {
            const t = (MC && typeof MC.getConfigDefaultsTemplate === 'function') ? MC.getConfigDefaultsTemplate() : null;
            if (t && _configDefaultsTemplate !== t) _configDefaultsTemplate = t;
        } catch (e) { /* 读不回按未冻结处理（下一次构造再对齐） */ }
        return inst;
    }
    function _bindConfigDeps() {
        const MC = _memoryConfigLib();
        if (!MC || typeof MC.bindDeps !== 'function') return 0;
        try {
            return MC.bindDeps({ errLog, moduleLib: _moduleLib, clearApiCooldowns,
                configDefaultsTemplate: _configDefaultsTemplate, version: VERSION });
        } catch (e) { errLog(e, 'A1 第七刀.bindDeps'); return 0; }
    }
'''

def cut_class(name):
    global S
    m = re.search(r'^\s*class ' + name + r'\b.*\{$', S, re.M)
    if not m: raise SystemExit('class not found: ' + name)
    at = S.index('{', m.end() - 1); depth = 0; i = at
    while i < len(S):
        if S[i] == '{': depth += 1
        elif S[i] == '}':
            depth -= 1
            if depth == 0: break
        i += 1
    st = m.start(); en = i + 1
    while en < len(S) and S[en] == NL: en += 1
    while st > 0 and S[st-1] == NL and S[st-2:st] == NL: st -= 1
    hits.append('cut class ' + name)
    S = S[:st] + S[en:]

sub_once("    const VERSION = '3.266.0';", "    const VERSION = '3.267.0';", 'VERSION')
cut_class('ConfigManager')

# ★ 留痕：第六刀那条的标签里有一个空格（'A1 第六刀.bindDeps'），第五刀那条没有（'A1第五刀.bindDeps'）。
#   首版照抄形状漏了空格 ⇒ count=0，脚本在写盘**之前**退出（磁盘未变，探针复核过）。
ANCHOR = "        } catch (e) { errLog(e, 'A1 \u7b2c\u516d\u5200.bindDeps'); return 0; }" + NL + '    }' + NL
if S.count(ANCHOR) != 1: raise SystemExit('wiring anchor not unique (%d)' % S.count(ANCHOR))
WIRING = wiring_block()
if not WIRING.endswith(NL): WIRING += NL   # 拼接处必须是行边界（否则类锚点会与上一行的 } 挤在一行）
sub_once(ANCHOR, ANCHOR + WIRING, 'wiring block')

sub_once('this.configMgr = new ConfigManager();',
         'this.configMgr = _newConfigManager();   // [v3.267.0] A1 第七刀外移 memory-config.js',
         'ctor configMgr')

sub_once('            _bindCoreDeps();   // [v3.266.0] A1 第六刀：四个内核数据模型的主人符号现算注入',
         '            _bindCoreDeps();   // [v3.266.0] A1 第六刀：四个内核数据模型的主人符号现算注入' + NL +
         '            _bindConfigDeps();   // [v3.267.0] A1 第七刀：配置管理的主人符号现算注入',
         'bind config call')

open(P, 'w', encoding='utf-8').write(S)
print('OK; patches=%d' % len(hits))
for h in hits: print('   -', h)
print('lines now', S.count(NL) + 1)