#!/usr/bin/env python3
# [v3.267.0 A1 第七刀] 生成 memory-config.js：把宿主 index.js 里的 ConfigManager 类
#   （512 行：默认配置字面量 + 四段迁移 + 角色卡覆盖 + 写盘）抽为独立模块。
#   自包含：抽取 -> 组装 -> node --check -> 逐字回校 -> 写盘（/tmp 不持久，一切在一次执行内）。
#   ★ 沿用第六刀工装（v3266_build_core.py）的全部口径与两条历史自伤教训：
#     ① 常量按**所在行**取（不用「行锚 + 空行终止」，那会把后续行整段吞掉）；
#     ② 组装处**不做**任何空行挤压（类体是逐字资产，任何全局正则都会伤到它）。
import re, os, subprocess, hashlib, sys
R = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# ★ [v3.267.0 自伤修复] 抽取源必须可显式指定：本刀落地之后，宿主 index.js 里**已经没有**
#   `class ConfigManager` 了，默认读 index.js 会直接 class_block 报 'class not found' ——
#   生成脚本从此不可复现（重建即失败）。故把「抽取源」提为第一个位置参数：
#     默认 index.js（只在「本刀尚未执行」的树上成立）
#     重建/复核时传**抽取时那一版源码**（本刀为 `git show HEAD:index.js` 导出的副本）。
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(R, 'index.js')
IDX = open(SRC, encoding='utf-8').read()
NL = chr(10)
Q = chr(39)

def find_block(s, at):
    i = s.index('{', at); depth = 0; prev_sig = ''
    while i < len(s):
        c = s[i]
        if c == '/' and i + 1 < len(s) and s[i+1] == '/':
            j = s.find(NL, i);  i = len(s) if j < 0 else j + 1;  continue
        if c == '/' and i + 1 < len(s) and s[i+1] == '*':
            j = s.find('*/', i + 2);  i = len(s) if j < 0 else j + 2;  continue
        if c in (Q, chr(34), chr(96)):
            q = c;  i += 1
            while i < len(s):
                if s[i] == chr(92): i += 2; continue
                if s[i] == q: i += 1; break
                if q == chr(96) and s[i] == '$' and i + 1 < len(s) and s[i+1] == '{':
                    i = find_block(s, i + 1) + 1; continue
                i += 1
            continue
        if c == '/' and prev_sig and prev_sig in '(,=:[!&|?{};+-*/%~^<>':
            i += 1;  inside = False
            while i < len(s):
                ch = s[i]
                if ch == chr(92): i += 2; continue
                if ch == '[': inside = True
                elif ch == ']': inside = False
                elif ch == '/' and not inside: i += 1; break
                elif ch == NL: break
                i += 1
            prev_sig = '/';  continue
        if c == '{': depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0: return i
        if not c.isspace(): prev_sig = c
        i += 1
    raise SystemExit('unbalanced block at %d' % at)

def class_block(name):
    m = re.search(r'^\s*class %s\b.*\{$' % re.escape(name), IDX, re.M)
    if not m: raise SystemExit('class not found: ' + name)
    if len(re.findall(r'^\s*class %s\b' % re.escape(name), IDX, re.M)) != 1:
        raise SystemExit('class anchor not unique: ' + name)
    return IDX[m.start():find_block(IDX, m.end() - 1) + 1]

def line_of(pat):
    m = re.search(pat, IDX)
    if not m or len(re.findall(pat, IDX)) != 1:
        raise SystemExit('line anchor not unique: ' + pat)
    st = IDX.rfind(NL, 0, m.start()) + 1
    en = IDX.find(NL, m.start())
    return IDX[st:en if en >= 0 else len(IDX)]

def dedent4(text):
    return NL.join((ln[4:] if ln.startswith('    ') else ln) for ln in text.split(NL))

CLASSES = ['ConfigManager']

HEAD = '''(function (global) {
    'use strict';
/*
 * memory-config.js — 配置管理类（A1 第七刀）
 * 外移边界：ConfigManager 字段默认值、loadConfig 迁移、卡覆盖、saveConfig。
 * 宿主符号保持唯一真源，通过 bindDeps 注入；抽取测试可在宿主缺席时使用同契约副本。
 */'''
LIB = '''    /* ── 一、非逐字副本：宿主函数符号（模块级 let 活口，bindDeps 可覆盖） ── */
let errLog = function (err, tag) {
    try {
        const msg = String(err && err.message || err || '');
        if (typeof console !== 'undefined' && console.warn) console.warn('[LonShaMemoryConfig][' + String(tag || '') + ']', msg);
    } catch (_) { /* 记录器自身不得再抛 */ }
};
let clearApiCooldowns = function clearApiCooldowns() {};
let _moduleLib = function _moduleLib(getGlobal, fileName) {
    try { const viaGlobal = (typeof getGlobal === 'function') ? getGlobal() : null; if (viaGlobal) return viaGlobal; } catch (e) {}
    if (typeof require !== 'undefined') { try { return require('./' + fileName); } catch (e) { return null; } }
    return null;
};
let _configDefaultsTemplate = null;'''
TAIL = '''
    function bindDeps(deps) {
        const d = deps || {};
        let n = 0;
        if (typeof d.errLog === 'function') { errLog = d.errLog; n++; }
        if (typeof d.moduleLib === 'function') { _moduleLib = d.moduleLib; n++; }
        if (typeof d.clearApiCooldowns === 'function') { clearApiCooldowns = d.clearApiCooldowns; n++; }
        if (Object.prototype.hasOwnProperty.call(d, 'configDefaultsTemplate') && d.configDefaultsTemplate !== undefined) {
            _configDefaultsTemplate = d.configDefaultsTemplate; n++;
        }
        if (typeof d.version === 'string' && d.version) { VERSION = d.version; n++; }
        return n;
    }
    function getConfigDefaultsTemplate() { return _configDefaultsTemplate; }
    const api = Object.freeze({ ConfigManager, bindDeps, getConfigDefaultsTemplate, PLUGIN_NAME, VERSION });
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    global.LonShaMemoryConfig = api;
})(typeof window !== 'undefined' ? window : globalThis);'''

# ── 二、逐字副本：宿主常量（PLUGIN_NAME + 三个迁移锚点串） ──
#   锚点串为什么必须与宿主逐字一致：它们是**内容锚点**（fuzzy-patch 的 from/to），
#   改一个字都会让「老用户提示词迁移」静默失配（v3.184/v3.211 的老账）。
const_lines = [dedent4(line_of(r"const PLUGIN_NAME = " + Q + r"LonSha记忆引擎" + Q + ';'))]
# ★★ [v3.267.0 自伤修复 · P0] 模块侧必须自己声明 VERSION。
#   首版遗漏了它 —— 而导出面 `Object.freeze({ ConfigManager, bindDeps, getConfigDefaultsTemplate,
#   PLUGIN_NAME, VERSION })` 在**模块顶层求值**，缺声明即 `ReferenceError: VERSION is not defined`，
#   `require('./memory-config.js')` 当场抛。宿主取库口 `_memoryConfigLib` 的 try/catch 把它吞掉
#   ⇒ **整个模块静默缺席**，`_newConfigManager` 退到 `ConfigManagerFallback`（config 是空对象 + `_absent`），
#   于是「配置全默认」与「模块根本没加载」被混成同一形态 —— 本仓最危险的那类静默。
#   形态与 memory-core.js / memory-organs.js 逐字对齐：必须 `let`（bindDeps 要能换；`const` 会让
#   `VERSION = d.version` 当场 TypeError、宿主 catch 吞掉后**整轮依赖注入中断**）；
#   值取**宿主同一行**（不手写版本号，否则每次抬版都欠一次维护）。
_VLINE = dedent4(line_of(r"const VERSION = " + Q))
const_lines.append(_VLINE.replace('const VERSION =', 'let VERSION =', 1)
    + '   // [留痕] 必须 let：bindDeps 可换（const 会 TypeError，宿主 catch 吞掉并中断整轮注入）')
for nm in ['_FACTS_PROMPT_ANCHOR_OLD', '_FACTS_PROMPT_ANCHOR_NEW', '_FACTS_PROMPT_IDEMPOTENT']:
    const_lines.append(dedent4(line_of(r"const " + nm + r" = ")))
const_sec = ('    /* ── 二、逐字副本：宿主常量（注了也是同一串字符，故不进注入面） ── */' + NL
             + NL.join(const_lines))

seams = [const_sec,
         LIB,

    '    /* ── 五、配置管理类（类体与宿主逐字一致，仅整体去 4 空格缩进） ── */',
    NL.join('    // ── %s（宿主逐字副本）──%s%s' % (c, NL, dedent4(class_block(c))) for c in CLASSES)]

mod = HEAD + NL + (NL + NL).join(seams) + NL + TAIL
open(os.path.join(R, 'memory-config.js'), 'w', encoding='utf-8').write(mod)
print('WROTE memory-config.js lines=%d bytes=%d' % (mod.count(NL), len(mod.encode())))
print('sha256', hashlib.sha256(mod.encode()).hexdigest()[:16])
r = subprocess.run(['node', '--check', os.path.join(R, 'memory-config.js')], capture_output=True, text=True)
print('node --check rc=%d %s' % (r.returncode, r.stderr[:600]))
for name in CLASSES:
    b = dedent4(class_block(name))
    print('  %-15s host=%d lines  verbatim-in-module=%s' % (name, b.count(NL) + 1, b in mod))
for nm in ['_FACTS_PROMPT_ANCHOR_OLD', '_FACTS_PROMPT_ANCHOR_NEW', '_FACTS_PROMPT_IDEMPOTENT']:
    b = dedent4(line_of(r"const " + nm + r" = "))
    print('  %-15s verbatim-in-module=%s' % (nm, b in mod))
