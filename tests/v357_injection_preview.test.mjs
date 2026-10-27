// tests/v357_injection_preview.test.mjs
// LonSha 记忆引擎 v3.57.0 注入预览测试套件
// 涵盖：P19 注入缓存（双路径）+ 预览视图（分块渲染/区块高亮/空态）+ 入口卡片

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

test('=== 1. 注入缓存双路径验证 ===', () => {
    // [v3.128] 注入缓存结构新增 tokens 字段——原精确字符串断言改为语义正则（仍要求 html/ts/prev 三要素在位）
    // [v3.215.0] R2-A：读数收口到唯一构造点 `_injectionRecord`，「双路径」不再各写一份字面量
    //   —— 真生成走 `_injectionRecord`（origin:'generation'），诊断 dry-run 另存
    //   `_diagnostics.dryRun`（**不写** `_lastInjection`）。故断言改为守
    //   「构造点自带 html/tokens/ts/prev 四要素」+「两条入口都在位且一写一不写」。
    assert.ok(src.includes('this._lastInjection = ' + 'rec'), '唯一构造点写读数本体（含 prev 快照与 token 估算）');
    assert.ok(/prev: \(this\._lastInjection && this\._lastInjection\.html\) \|\| null,/.test(src), 'prev 快照要素在位');
    assert.ok(/tokens: Number\.isFinite\(e\.tokens\) \? e\.tokens : estimateTextTokens\(html\),/.test(src), 'token 估算要素在位');
    assert.ok(/origin: String\(e\.origin \|\| 'generation'\),/.test(src), '真生成路径 origin 明确（诊断必须另走一路）');
    // [v3.216.0] R2-B：生成路径改调 `_injectionStage`（无条件暂存，零块也留读数），
    //   读数由代际确认后的 `_injectionCommit` 落成。
    assert.ok(/this\._injectionStage\(\{\s*\n\s*html: inj2 \|\| '',/.test(src), '主路径无条件暂存（零块也留读数）');
    // [v3.217.0] R2-D：两条发布路径的收尾统一到 `_injectionClose(`（引擎侧唯一入口，
    //   内部才调 `_injectionCommit`）。本判据守的是**性质**（读数由收尾落成、不得在 await 内落地），
    //   不是某个方法名的字面量 —— 锁名字会让每次收口改名都回来改历史测试。
    assert.ok(/this\.engine\._injection(Commit|Close)\(/.test(src), '读数由收尾落成（不得在 await 内落地）');
    assert.ok(!/this\._lastInjection = \{ html: inj/.test(src), '降级路径不再单独写 `_lastInjection`（诊断另存 `_diagnostics.dryRun`）');
    // 缓存的是裁剪后最终形态（buildInjection 返回值）——[v3.87] 起 inj2 为 let（追加前情注入）
    assert.ok(src.includes('let inj2 = this.buildInjection(candidateItems);'), '主路径调用在位');
    console.log('✓ 注入缓存双路径验证通过');
});

test('=== 2. 预览视图验证 ===', () => {
    assert.ok(suSrc.includes("viewType === 'injection'"), 'injection 视图分发');
    assert.ok(suSrc.includes("title = '👁 注入内容预览'"), '视图标题');
    assert.ok(suSrc.includes('已经预算裁剪，即 AI 真实所见'), '“真实所见”语义标注');
    assert.ok(suSrc.includes("inj.html.split"), '分块渲染');
    // 区块标题高亮（绿色 meta 行）——[v3.94] 实现已主题变量化为 var(--ls-success,#3fb950)
    assert.ok(suSrc.includes('color:var(--ls-success,#3fb950)'), '区块头高亮');
    // XSS  转义
    assert.ok(suSrc.includes('esc(trimmed)'), '行级转义');
    // 空态提示
    assert.ok(suSrc.includes('暂无注入记录'), '空态提示');
    console.log('✓ 预览视图验证通过');
});

test('=== 3. 入口卡片验证 ===', () => {
    assert.ok(suSrc.includes('data-view="injection"'), 'injection 入口卡片');
    assert.ok(suSrc.includes("s._lastInjection ? '就绪' : '—'"), '卡片状态图标');
    assert.ok(suSrc.includes('本轮注入预览'), '卡片标签');
    console.log('✓ 入口卡片验证通过');
});