// tests/v361_report.test.mjs
// LonSha 记忆引擎 v3.61.0 记忆全景报告测试套件
// 涵盖：P24 exportMemoryReport（11 板块 Markdown）、面板导出按钮

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
const reportSrc = readFileSync(new URL('../engine-report.js', import.meta.url), 'utf-8');
const suSrc = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');
test('=== 1. exportMemoryReport 方法验证 ===', () => {
    assert.ok(src.includes('exportMemoryReport() {'), '方法定义');
    // 11 板块（在 engine-report.js 或 index.js）
    const allSrc = src + '\n' + reportSrc;
    for (const sec of ['📊 概览', '🧍 主角档案', '🕸️ 角色羁绊网', '📚 章节卷摘要', '🏛️ 纪元史记',
                       '👥 群像共同记忆', '🧩 未结悬念', '📔 角色日记', '🎒 物品台账', '🎬 当前大纲', '🔍 审计统计']) {
        assert.ok(allSrc.includes(`'## ${sec}'`), `板块缺失: ${sec}`);
    }
    // helper 在 IIFE 内部
    assert.ok(allSrc.includes('function opLogStatsCompat(engine) {'), 'helper 函数');
    console.log('✓ exportMemoryReport 方法验证通过');
});

test('=== 2. settings-ui 导出按钮验证 ===', () => {
    assert.ok(suSrc.includes('data-view="report"'), 'report 入口卡片');
    assert.ok(suSrc.includes('全景档案报告'), '卡片标签');
    assert.ok(suSrc.includes('this.engine.exportMemoryReport()'), '调用导出方法');
    assert.ok(suSrc.includes("a.download = `lonsha-memory-report-${Date.now()}.md`"), 'Blob 下载');
    assert.ok(suSrc.includes('esc(md.substring(0, 1500))'), '预览转义');
    console.log('✓ settings-ui 导出按钮验证通过');
});

test('=== 3. 版本断言宽域回归验证 ===', () => {
    // v344/345/346/347 的版本正则已统一为 3\.\d{2,}\.\d+ 宽域
    for (const vf of ['v344_ultimate_bastion', 'v345_deep_bastion', 'v346_fortress_pyramid', 'v347_hc_mechanics']) {
        const t = readFileSync(new URL(`../tests/${vf}.test.mjs`, import.meta.url), 'utf-8');
        assert.ok(t.includes("3\\.\\d{2,}\\.\\d+") || t.includes('3\\.\\d{2,}'), `${vf} 版本正则宽域`);
        assert.ok(t.includes('4[4-9]') === false || !t.includes("3\\.(?:4"), `${vf} 旧窄域正则绝迹`);
    }
    console.log('✓ 版本断言宽域回归验证通过');
});