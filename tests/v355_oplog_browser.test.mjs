// tests/v355_oplog_browser.test.mjs
// LonSha 记忆引擎 v3.55.0 事件审计浏览器测试套件
// 涵盖：P16 OpLog 审计浏览器视图 + 状态面板入口卡片

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}

const src = __hostSurface();
const suSrc = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');

test('=== 1. OpLog 审计浏览器视图验证 ===', () => {
    assert.ok(suSrc.includes("viewType === 'oplog'"), 'oplog 视图分发');
    assert.ok(suSrc.includes("title = '🔍 事件审计链（OpLog）'"), '视图标题');
    assert.ok(suSrc.includes('opLog.recent(80)'), '最近 80 条渲染');
    assert.ok(suSrc.includes('const st = opLog.stats()'), '统计头');
    assert.ok(suSrc.includes('环形 500'), '环形说明');
    assert.ok(suSrc.includes('rollback: \'↩️回滚\''), '回滚类型中文化');
    // XSS 防护（esc 转义）
    assert.ok(suSrc.includes('${esc(e.ref)}') && suSrc.includes('${esc(e.op)}'), '条目字段转义');
    console.log('✓ OpLog 审计浏览器视图验证通过');
});

test('=== 2. 状态面板入口卡片验证 ===', () => {
    assert.ok(suSrc.includes('data-view="oplog"'), 'oplog 入口卡片');
    assert.ok(suSrc.includes('s.opLog?.entries?.length || 0'), '卡片计数');
    assert.ok(suSrc.includes('操作审计日志'), '卡片标签');
    console.log('✓ 状态面板入口卡片验证通过');
});

test('=== 3. 数据通路验证 ===', () => {
    // settings-ui 的 s = this.engine；opLog 是 engine 实例属性
    /* [v3.258.0 A1 第二刀] OpLog 已抽为 memory-aux.js（构造点走统一取库口）。 */
    assert.ok(src.includes("this.opLog = _newMemoryAux('OpLog');"), 'engine.opLog 实例属性');
    assert.ok(readFileSync(new URL('../memory-aux.js', import.meta.url), 'utf8').includes('class OpLog'), 'OpLog 类');
    // showBrowser 的 esc 转义函数在 oplog 视图前定义
    const escIdx = suSrc.indexOf('const esc = (t)');
    const oplogIdx = suSrc.indexOf("viewType === 'oplog'");
    assert.ok(escIdx > 0 && oplogIdx > escIdx, 'esc 函数先于 oplog 视图定义');
    console.log('✓ 数据通路验证通过');
});