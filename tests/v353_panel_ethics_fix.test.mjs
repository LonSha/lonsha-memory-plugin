// tests/v353_panel_ethics_fix.test.mjs
// LonSha 记忆引擎 v3.53.0 测试套件
// 涵盖：P13 诊断面板命中率卡片、P14 伦理检测静默缺口修复（v3.48 遗留）

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
/* [v3.474.0] 真模块装载需要的两件：ROOT（仓根 URL 形态）与 require（ESM 里取 CJS 模块）。 */
import { createRequire as __createRequire } from 'node:module';
const require = __createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url).pathname;
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

const srcRaw = __hostSurface();
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const src = srcRaw + String.fromCharCode(10) + readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8');
const suSrc = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');

test('=== 1. P13 诊断面板命中率卡片验证 ===', () => {
    assert.ok(suSrc.includes('召回源命中率'), 'P13: 命中率卡片标题');
    assert.ok(suSrc.includes('s._recallSourceStats && s._recallSourceStats.total > 0'), 'P13: 统计守卫');
    assert.ok(suSrc.includes("b[1].hits - a[1].hits"), 'P13: 按命中次数排序');
    assert.ok(suSrc.includes('200 轮半衰'), 'P13: 半衰说明');
    assert.ok(suSrc.includes('长期 0% 的召回源可在设置中关闭'), 'P13: 调优提示');
    // 数据通路
    assert.ok(src.includes('this._recallSourceStats = { total: 0, bySource: {} }'), 'engine 实例属性');
    console.log('✓ P13 诊断面板命中率卡片验证通过');
});

test('=== 2. P14 伦理检测静默缺口修复验证 ===', () => {
    // 旧调用必须绝迹
    assert.ok(src.includes('extracted?.ties_context') === false, 'P14: 不存在的 ties_context 调用必须绝迹');
    // 新调用使用真实数据源
    assert.ok(src.includes('this.status?.getNpcTiesRecords?.() || []'), 'P14: 使用 engine 侧真实羁绊数据');
    assert.ok(src.includes('P14 静默缺口修复'), 'P14: 修复注释');
    // 修复逻辑验证：存在多个 getNpcTiesRecords（CharacterState 版与引擎聚合版），只验证格式存在
    const count = src.split('getNpcTiesRecords').length - 1;
    assert.ok(count >= 2, 'getNpcTiesRecords 至少两处（状态源 + 聚合）');
    assert.ok(src.includes('({ name, ties: [...ties] })'), 'CharacterState 版返回格式匹配 detectEthicsConflict 期望');
    console.log('✓ P14 伦理检测静默缺口修复验证通过');
});

test('=== 3. 伦理检测端到端模拟 ===', () => {
    /* [v3.474.0] 修前在合并面里按 function 关键字抠 normalizeCharName / classifyRelationshipType /
     *   detectEthicsConflict 三具函数体，再 new Function 重放。L22-O1 把这三只整块搬进
     *   index-helpers.js，而入口那三行是**委派桩**（`_deps.classifyRelationshipType(...)`）——
     *   抽到的正是桩，沙箱里没有 _deps ⇒ ReferenceError: _deps is not defined（报的是机制，
     *   不是产品）。改为真模块装载：产品在用的那一份，不是测试里重写的复制品。 */
    const H = require(ROOT + 'index-helpers.js');
    if (typeof H.__bindHost === 'function') H.__bindHost({ errLog: () => {} });
    const detectEthicsConflict = H.detectEthicsConflict;
    assert.equal(typeof detectEthicsConflict, 'function', 'detectEthicsConflict 真模块装载');
    assert.equal(typeof H.normalizeCharName, 'function', 'normalizeCharName 真模块装载');
    assert.equal(typeof H.classifyRelationshipType, 'function', 'classifyRelationshipType 真模块装载');

    // 真实数据格式（getNpcTiesRecords 的输出）
    const realTies = [
        { name: '苏若雪', ties: ['苏晨:亲生哥哥', '林一:朋友'] },
        { name: '林晚', ties: ['青梅竹马'] }
    ];
    // 兄妹恋命中
    const hit = detectEthicsConflict('苏晨', '苏若雪', '恋人', realTies);
    assert.ok(hit, '兄妹恋命中');
    // 朋友恋爱不命中
    const noHit = detectEthicsConflict('林一', '苏若雪', '恋人', realTies);
    assert.equal(noHit, null, '朋友关系恋爱不告警（无血缘证据）');
    // 双向血缘词
    const hit2 = detectEthicsConflict('苏晨', '苏若雪', '暧昧', realTies);
    assert.ok(hit2, '暧昧也命中（intimate 类）');
    console.log('✓ 伦理检测端到端模拟验证通过');
});