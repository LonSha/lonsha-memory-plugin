// tests/v358_full_instrumentation.test.mjs
// LonSha 记忆引擎 v3.58.0 全量埋点测试套件
// 涵盖：P20 七路埋点补全（diary/pov/timeline/card/money/conflict/pair）——OpLog 13 类型全覆盖

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
/* [v3.258.0 迁移] A1 第二刀把 OpLog 类（含 `type:` 行的类型注释）迁去 memory-aux.js。
   埋点调用点（`opLog?.log('x'` 形式）仍在 index.js，但那句「类型注释」的真源已随类搬家 ——
   判据须跟真源走，否则要么恒红、要么变成对「未来某天再次内联」的假绿。 */
const auxSrc = readFileSync(new URL('../memory-aux.js', import.meta.url), 'utf-8');

test('=== 1. OpLog 13 类型全覆盖验证 ===', () => {
    const types = ['summary', 'graph', 'status', 'suspense', 'item', 'rollback',
                   'diary', 'pov', 'timeline', 'card', 'money', 'conflict', 'pair'];
    for (const t of types) {
        assert.ok(src.includes(`opLog?.log('${t}'`), `埋点缺失: ${t}`);
    }
    // 注释中的类型清单与实际埋点一致
    assert.ok(auxSrc.includes('summary|graph|status|item|suspense|diary|pov|timeline|card|money|conflict|pair'), 'OpLog 类型注释（真源已迁 memory-aux.js）');
    console.log('✓ OpLog 13 类型全覆盖验证通过');
});

test('=== 2. 新增七路埋点上下文正确性 ===', () => {
    // diary：generateLiving 后
    assert.ok(src.includes("if (dn) this.opLog?.log('diary', 'add', `${dn} entries`"), 'diary 埋点在写入数确认后');
    // pov：主 pov_memories 路径（owner 归一化后）
    assert.ok(src.includes("this.opLog?.log('pov', 'add', owner, message.index || 0, String(p.content).slice(0, 40))"), 'pov 埋点含 owner 与内容摘录');
    // timeline：主 story_date 路径
    assert.ok(src.includes("this.opLog?.log('timeline', 'add', `tl_${message.index || 0}`"), 'timeline 埋点');
    // card：forge 后
    assert.ok(src.includes("this.opLog?.log('card', 'forge', `${n} cards`"), 'card 埋点');
    // money：账本更新后
    assert.ok(src.includes("this.opLog?.log('money', 'update', `${extracted.money_changes.length} changes`"), 'money 埋点');
    // conflict：登记后
    assert.ok(src.includes("this.opLog?.log('conflict', 'add', `${n} conflicts`"), 'conflict 埋点');
    // pair：群像更新后
    assert.ok(src.includes("this.opLog?.log('pair', 'add', `${n} pairs`"), 'pair 埋点');
    console.log('✓ 新增七路埋点上下文正确性验证通过');
});