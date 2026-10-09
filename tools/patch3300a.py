#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.300.0 · M-O2 第一刀：真宿主装载面（manifest.extra_js 真装载器）。

背景（真宿主取证，非读源码推算）：SillyTavern 1.19.0 的 `public/scripts/extensions.js` 只加载
    `manifest.js` 一项，`extra_js` 字段**宿主全仓零消费**。于是浏览器全局里本仓模块 0 个，
    `_moduleLib` 的 require 回落把 88 个模块各当 CJS 求值一次（全局挂载行在
    `typeof window !== 'undefined'` 下不成立 ⇒ 空 api），机制全部不生效而文档读成「装载面 88 模块」。

本补丁的四段（全部锚点先校验、通过后统一写盘）：
  ① 常量与助手：EXTRA_JS_FILE_RE / _LOADED_SRC / _extraJsLoad / _extraJsBaseDir /
     loadExtraJsScript / ensureExtraJsOnce / extraJsLoadReport
  ② 配置默认键 preferModuleFiles（可在设置面板关掉，关掉即回到旧行为并如实告警）
  ③ init()：在 loadModules() / rebindModuleDeps() / createUI() **之前** await this.ensureExtraJs()
  ④ 插件方法 ensureExtraJs()（幂等 + 三态留痕）
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
P = ROOT / 'index.js'
src = P.read_text(encoding='utf-8')
_log = []


def sub(old, new, why):
    global src
    n = src.count(old)
    if n != 1:
        sys.exit('[patch3300a] 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r' % (n, why, old[:200]))
    if old == new:
        sys.exit('[patch3300a] 同值替换：%s' % why)
    src = src.replace(old, new, 1)
    _log.append(why)


# ── ① 常量与助手（挂在 clearInjectSlots 之后，与 writeInjectSlot 同域）──
ANCHOR1 = """    function clearInjectSlots() {
        for (const slot of INJECT_SLOTS) writeInjectSlot(slot.key, '', slot.clearDepth);
    }
"""
NEW1 = ANCHOR1 + """    /* [v3.300.0 M-O2] ★★ extra_js **模块清单**的真装载器。
     *
     * 【修前实测（SillyTavern 1.19.0 真浏览器 + 真宿主，取证见 tests/audit/host-reality.json）】
     *   宿主 `public/scripts/extensions.js#addExtensionScript` 只加载 `manifest.js`（= 入口 index.js），
     *   `manifest.extra_js` 字段**宿主全仓零消费**。于是：
     *     · 浏览器全局里本仓模块 **0 个**（实测 window 上只有 LonShaMemory / lonsha_memory_bridge_v1 /
     *       lonsha_memory_interceptor 三项，全是入口自己挂的）；
     *     · `_moduleLib` 的 require 回落把 **88 个模块各当 CJS 求值一次**，而各模块的全局挂载行
     *       （`root.LonShaXxx = api`）在 `typeof window !== 'undefined'` 下**不成立** ⇒
     *       require 回来的对象是空 api：88 份内存与解析开销换回来一个都不挂；
     *     · 后果：LonShaFactState / LonShaMemoryType / LonShaUnifiedRecall … 全部缺席，
     *       近几版新接的机制在真宿主上**恒不生效**，而文档把它读成「装载面 88 模块」。
     *
     * 【为什么只挂清单、不 eval 内容（两条不可让步的理由）】
     *   ① 清单是**行为契约**（本仓已定性两次）：模块会挂全局、会读邻居全局。把清单当数据吃掉，
     *      等于换掉模块语义 —— 本版就变成「换了实现的版本」而不是「修复的版本」；
     *   ② 自带解析器求值 = 宿主侧的**第二套模块系统**（解析器漂移、与未来 import 语义分歧）。
     *   故走**浏览器原生解析器**：真 `<script src>`（module 型，与宿主加载入口同形态）。
     *
     * 【三态与幂等】status = ok / partial / unavailable（缺席如实可见，不静默降级）；
     *   幂等：清单只读一次、同一 URL 只注入一次（重复调用直接返回上次读数）。
     */
    /* 入口脚本自身的 src：**脚本求值那一刻**取（classic script 下 currentScript 有效；
     *   module 脚本下为 null，此时靠 _extraJsBaseDir 的候选扫描 + manifest 反证）。 */
    const _LOADED_SRC = (() => { try { return (document.currentScript && document.currentScript.src) || ''; } catch (e) { return ''; } })();
    /* 清单项必须是**裸文件名**：只允许 [A-Za-z0-9._-]+.js，挡掉 `../`、绝对 URL、查询串。
     *   为什么不用 URL 拼接来做这件事：`new URL('../x', base)` 会**悄悄跳出**插件目录，
     *   而这里要的是「拒绝」而不是「解析出来一个能用的地址」。 */
    const EXTRA_JS_FILE_RE = /^[A-Za-z0-9._-]+\\.js$/;
    /** 本插件 extra_js 的装载读数（**绝不静默**：谁没装上、为什么，都要能读出来）。 */
    const _extraJsLoad = { status: 'idle', started: false, okCount: 0, triedCount: 0, fail: [], at: null };
    function extraJsLoadReport() { return Object.assign({}, _extraJsLoad, { fail: _extraJsLoad.fail.slice() }); }
    /** 推导本插件的 base 目录。**不写死仓库名 / 用户名**：候选来自宿主实际注入的 script 标签，
     *  逐个用 `manifest.json` **反证**（display_name 必须是本插件）——取不到即如实 unavailable，
     *  不猜路径、不退到任何 CDN。 */
    async function _extraJsBaseDir() {
        try {
            const cands = [];
            if (_LOADED_SRC) cands.push(_LOADED_SRC);
            for (const s of Array.from(document.querySelectorAll('script[src]'))) {
                const u = String(s.src || '');
                if (/index\\.js$/.test(u) && cands.indexOf(u) < 0) cands.push(u);
            }
            /* 含本插件名的候选优先（真宿主下路径形如 .../third-party/lonsha-memory-plugin/index.js） */
            cands.sort((a, b) => (/lonsha-memory-plugin/.test(b) ? 1 : 0) - (/lonsha-memory-plugin/.test(a) ? 1 : 0));
            for (const u of cands) {
                const base = String(u).replace(/index\\.js.*$/, '');
                try {
                    const r = await fetch(base + 'manifest.json', { cache: 'no-store' });
                    if (!r.ok) continue;
                    const mf = await r.json();
                    if (mf && typeof mf.display_name === 'string' && /LonSha/i.test(mf.display_name) && Array.isArray(mf.extra_js)) return base;
                } catch (_e) { /* 换个候选继续反证 */ }
            }
            return '';
        } catch (e) { return ''; }
    }
    /** 注入一个 extra_js 模块（浏览器原生解析器；失败即 reject，**不吞**）。 */
    function loadExtraJsScript(url) {
        return new Promise((resolve, reject) => {
            try {
                const s = document.createElement('script');
                s.type = 'module';
                s.src = url;
                s.onload = () => resolve(true);
                s.onerror = () => reject(new Error('script-error'));
                document.head.appendChild(s);
            } catch (e) { reject(e); }
        });
    }
    /** 幂等入口：清单只读一次、注入只做一次，第二次直接回上次读数。 */
    async function ensureExtraJsOnce() {
        if (_extraJsLoad.started) return extraJsLoadReport();
        _extraJsLoad.started = true;
        _extraJsLoad.status = 'unavailable';
        _extraJsLoad.at = Date.now();
        try {
            const base = await _extraJsBaseDir();
            if (!base) { _extraJsLoad.fail.push({ file: '(base)', why: 'base-unresolved' }); return extraJsLoadReport(); }
            const mf = await fetch(base + 'manifest.json', { cache: 'no-store' }).then((r) => r.json());
            const list = (mf && Array.isArray(mf.extra_js)) ? mf.extra_js.slice() : null;
            if (!list) { _extraJsLoad.fail.push({ file: '(manifest)', why: 'extra_js-missing' }); return extraJsLoadReport(); }
            const unsafe = list.filter((f) => typeof f !== 'string' || !EXTRA_JS_FILE_RE.test(f));
            if (unsafe.length) { _extraJsLoad.fail.push({ file: '(manifest)', why: 'unsafe-entry:' + String(unsafe[0]).slice(0, 60) }); return extraJsLoadReport(); }
            const seen = new Set(Array.from(document.scripts || []).map((s) => s.src));
            const results = [];
            for (const f of list) {
                const url = base + f;
                _extraJsLoad.triedCount++;
                if (seen.has(url)) { results.push({ ok: true, file: f, why: 'already' }); continue; }
                try { await loadExtraJsScript(url); seen.add(url); results.push({ ok: true, file: f, why: 'loaded' }); }
                catch (e) { results.push({ ok: false, file: f, why: String((e && e.message) || e) }); }
            }
            _extraJsLoad.okCount = results.filter((r) => r.ok).length;
            _extraJsLoad.fail = results.filter((r) => !r.ok);
            /* 三态互斥：全成 ok / 部分 partial / 一个没成 unavailable（**不得**把 partial 读成 ok）。 */
            _extraJsLoad.status = (results.length && _extraJsLoad.okCount === results.length) ? 'ok'
                : (_extraJsLoad.okCount > 0 ? 'partial' : 'unavailable');
        } catch (e) {
            _extraJsLoad.fail.push({ file: '(load)', why: String((e && e.message) || e) });
        }
        return extraJsLoadReport();
    }
"""
sub(ANCHOR1, NEW1, '① extra_js 真装载器（常量 + 助手）')

# ── ② 配置默认键（★ 默认配置块自 A1 第七刀起在 memory-config.js，不在 index.js）──
CFG = ROOT / 'memory-config.js'
csrc = CFG.read_text(encoding='utf-8')
_cold = "            bridgeEnabled: true,        // [v3.88] 公开只读快照桥（window.lonsha_memory_bridge_v1）"
_cnew = _cold + "\n" + \
    "            preferModuleFiles: true,     // [v3.300.0 M-O2] 真宿主下自行装载 manifest.extra_js\n" + \
    "                                         //   （宿主只加载 manifest.js；关掉即回到「只有入口」的旧行为并如实告警）"
if csrc.count(_cold) != 1:
    sys.exit('[patch3300a] memory-config.js 锚点命中 %d 次：%s' % (csrc.count(_cold), _cold[:120]))
csrc = csrc.replace(_cold, _cnew, 1)
CFG.write_text(csrc, encoding='utf-8')
_log.append('② 配置默认键 preferModuleFiles（memory-config.js）')

# ── ③ init()：装载前置于一切依赖模块的步骤 ──
sub("""            await this.waitForST();
            this.loadModules();""",
    """            await this.waitForST();
            /* [v3.300.0 M-O2] ★ 真宿主装载面修复：宿主只加载 manifest.js，extra_js 从来没人读。
             *   必须在 loadModules() / rebindModuleDeps() / createUI() / ensureSettingsUI() **之前**
             *   跑完 —— 它们全都依赖模块全局（rebindModuleDeps 更是「模块已挂上」这一前提的消费方）。
             *   失败只留痕、不阻断 init（与 ensureSettingsUI 同规格）。 */
            try { await this.ensureExtraJs(); } catch (e) { errLog(e, 'init.ensureExtraJs'); }
            this.loadModules();""",
    '③ init() 前置自装载')

# ── ④ 插件方法 ──
sub("""        loadModules() {
            // [v3.165] 成功声称面：""",
    """        /** [v3.300.0 M-O2] 真宿主装载面：把 manifest.extra_js 真正挂上去（幂等、如实留痕）。
         *  读数存 `this._extraJsLoad`（诊断面板与判据都从这里读，**不另造一份**）。 */
        async ensureExtraJs() {
            try {
                if (this.config && this.config.config && this.config.config.preferModuleFiles === false) {
                    this._extraJsLoad = { status: 'disabled', started: false, okCount: 0, triedCount: 0, fail: [], at: Date.now() };
                    console.warn(`[${PLUGIN_NAME}] ⚠️ extra_js 自装载已按配置关闭（preferModuleFiles=false）：本仓模块全部走 CJS 回落，机制不生效`);
                    return this._extraJsLoad;
                }
                const rep = await ensureExtraJsOnce();
                this._extraJsLoad = rep;
                if (rep.status === 'ok') {
                    console.log(`[${PLUGIN_NAME}] ✓ extra_js 已装载 ${rep.okCount}/${rep.triedCount} 项（宿主不读 manifest.extra_js，由本插件自行注入）`);
                } else {
                    console.warn(`[${PLUGIN_NAME}] ⚠️ extra_js 装载 ${rep.status}：${rep.okCount}/${rep.triedCount} 成功`
                        + (rep.fail.length ? '；失败 ' + rep.fail.map((f) => f.file + ':' + f.why).slice(0, 5).join(' / ') : ''));
                }
                return rep;
            } catch (e) { errLog(e, 'ensureExtraJs'); return null; }
        }
        loadModules() {
            // [v3.165] 成功声称面：""",
    '④ 插件方法 ensureExtraJs')

P.write_text(src, encoding='utf-8')
print('[patch3300a] 完成：%d 处' % len(_log))
for w in _log:
    print('  -', w)
