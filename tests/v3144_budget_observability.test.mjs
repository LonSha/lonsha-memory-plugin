// tests/v3144_budget_observability.test.mjs
// [v3.144] 预算实测（丢弃可见性）：超预算裁剪不再静默
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
test('v3.144 buildInjection 记录预算实测七要素', () => {
    const st = src.indexOf('_lastBudgetStats = {');
    assert.ok(st > 0, '统计写入存在');
    const blk = src.slice(st, src.indexOf('}', st));
    for (const k of ['requested', 'beforeChars', 'afterChars', 'droppedChars', 'keptBlocks', 'totalBlocks', 'droppedSamples', 'strategy', 'tokens', 'tokenBudget', 'ts']) {
        assert.ok(blk.includes(k + ':'), `缺度量 ${k}`);
    }
    assert.match(src, /const _preTrimLen = full\.length/, '裁剪前基线在 trim 之前捕获');
    const pre = src.indexOf('const _preTrimLen'), trim = src.indexOf('_ir.trimToBudget(full, budget');
    const post = src.indexOf('_lastBudgetStats = {');
    assert.ok(pre < trim && trim < post, '基线→裁剪→统计 顺序正确');
    assert.match(src, /catch \(e\) \{ errLog\(e, 'buildInjection\.预算实测'\); \}/, '统计失败不影响注入（非致命且有 errLog）');
});
test('v3.144 面板播报丢弃量与样本，并做 HTML 转义', () => {
    assert.match(ui, /_lastBudgetStats/, '面板读取实测');
    assert.match(ui, /丢弃 \$\{_bs\.droppedChars\} 字符/, '丢弃字符数可见');
    assert.match(ui, /被丢弃示例/, '丢弃样本可见');
    assert.match(ui, /replace\(\/\[<&\]\/g/, '样本转义（防注入内容里的 < & 破坏面板 DOM）');
    assert.match(ui, /如需更少丢弃可上调注入预算/, '给出可执行建议');
});
test('v3.144 head 声明必须是 let（+= 对 const 抛 TypeError，语法门查不出）', () => {
    const declRe = /(let|const) head = `<div class="ls-hint">最近一次实际注入/;
    const m = declRe.exec(ui);
    assert.ok(m, '注入预览 head 声明可定位');
    assert.equal(m[1], 'let', 'head 必须为 let：面板实测条用 head += 追加，const 会在运行时抛 TypeError');
    assert.ok(ui.slice(m.index, m.index + 3000).includes('head +='), '确实存在 += 追加（若删除 += 则本断言提示可同步简化）');
});
