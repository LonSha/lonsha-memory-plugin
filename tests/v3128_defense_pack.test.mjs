import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
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
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = __hostSurface() + String.fromCharCode(10) + readFileSync(new URL('../memory-config.js', import.meta.url), 'utf8');
const ui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');

test('v3.128 注入槽位清单化（LEGACY 清空模式）', () => {
  assert.match(src, /const INJECT_SLOTS = \[/);
  assert.match(src, /for \(const slot of INJECT_SLOTS\) writeInjectSlot\(slot\.key, '', slot\.clearDepth\)/);
  // 清单必须覆盖当前全部在写槽位
  assert.match(src, /key: 'lonsha_memory',/);
  assert.match(src, /key: 'lonsha_memory_history',/);
  // 不得再残留手写双行清空
  assert.doesNotMatch(src, /writeInjectSlot\('lonsha_memory', '', 0\);\s*\n\s*writeInjectSlot\('lonsha_memory_history', '', 9999\)/);
});

test('v3.128 token 估算 CJK 口径且用于注入记录与面板', () => {
  // 提取纯函数体做行为验证（无 window/宿主依赖）
  const i = src.indexOf('function estimateTextTokens(text) {');
  const end = src.indexOf('\n    }', i);
  assert.ok(i > 0 && end > i);
  const fn = new Function('return ' + src.slice(i, end + 6))();
  assert.equal(fn(''), 0);
  const zh = '今天天气很好我们一起出去逛街吃饭';           // 16 汉字
  const en = 'abcdefghijklmnopqrstuvwxyz0123456789';      // 36 ASCII
  assert.equal(fn(zh), Math.ceil(zh.length * 0.9));       // CJK ~0.9 token/字
  assert.equal(fn(en), Math.ceil(en.length / 4));         // ASCII ~4 字符/token
  assert.ok(fn(zh + en) > fn(en), '混合文本应大于纯 ASCII');
  assert.ok(fn(zh) > Math.ceil(zh.length / 4) * 2, '对中文应显著高于旧 chars/4 口径');
  // 引擎双路径写入 tokens 字段 + UI 展示
  // [v3.215.0] R2-A：读数收口到唯一构造点 `_injectionRecord`（原两条路径各写一份
  //   `_lastInjection` 的形态正是本版修掉的归属塌陷）。断言改为：
  //   构造点内 tokens 走同一 CJK 口径 + 真生成路径确实经构造点落地 + UI 展示仍在。
  assert.match(src, /tokens: Number\.isFinite\(e\.tokens\) \? e\.tokens : estimateTextTokens\(html\),/);
  // [v3.216.0] R2-B：生成路径改调 `_injectionStage`（读数由代际确认后的提交落成）。
  assert.match(src, /this\._injectionStage\(\{\s*\n\s*html: inj2 \|\| '',/);
  assert.match(src, /this\._injectionRecord\(\{\s*\n\s*html: p\.html, origin: 'generation',/);
  assert.match(ui, /约 \$\{inj\.tokens\} token（CJK 口径估算）/);
});

test('v3.128 钱财账本 zod 式幅度 clamp 与开关默认值', () => {
  assert.match(src, /maxMoneyDelta: 0,/);
  assert.match(src, /moneyLedgerEnabled: true,/);
  assert.match(src, /next = prev \+ Math\.sign\(next - prev\) \* maxDelta/);
  assert.match(src, /'ledger\.clamp'/);
  // UI 暴露开关与滑条
  assert.match(ui, /ck\('moneyLedgerEnabled'/);
  assert.match(ui, /data-cfg-num="maxMoneyDelta"/);
});