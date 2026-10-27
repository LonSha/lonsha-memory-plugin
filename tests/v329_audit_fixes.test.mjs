// tests/v329_audit_fixes.test.mjs
// v3.29.0 测试：收编完整性审计修复（史记折叠空转 + synopsis 清洗冲突）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
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
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
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

// [fix] 语义化版本比较：vnum('3.100.0') === 3.1 会破坏 >=3.2x 断言
function vnum(s) {
  const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
  return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRaw = __hostSurface();
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const src = srcRaw + String.fromCharCode(10) + (fs.readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8'))

// 版本断言（>= v3.29 容灾）
const vm = src.match(/const VERSION = '([^']+)'/);
if (!vm) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
if (vnum(vm[1]) < vnum('3.29')) { console.error(`FAIL: 版本 ${vm[1]} < 3.29`); process.exit(1); }
console.log(`ok: 版本 ${vm[1]}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// PD-1: 史记折叠空转修复
{
    if (src.includes('foldingHistorical')) ok('PD1: 独立 foldingHistorical 标志存在');
    else fail('PD1: foldingHistorical 缺失');
    if (src.includes('if (this.foldingHistorical) return null;')) ok('PD1: 史记用独立防重入');
    else fail('PD1: 史记防重入未独立');
    // 不再用 this.folding 作为史记防重入
    const mh = src.match(/async maybeFoldHistorical[\s\S]{0,200}/);
    if (mh && !mh[0].includes('if (this.folding) return null')) ok('PD1: 史记不再被 this.folding 阻塞');
    else fail('PD1: 史记仍被 this.folding 阻塞');
    // 阈值对齐（>= threshold 才折叠）
    if (src.includes('if (vols.length < threshold) return null;')) ok('PD1: 阈值判断对齐');
    else fail('PD1: 阈值判断未对齐');
    if (src.includes('finally { this.foldingHistorical = false; }')) ok('PD1: finally 复位独立标志');
    else fail('PD1: finally 复位缺失');
}

// PD-2: synopsis 清洗冲突修复
{
    if (src.includes('_rawForSynopsis')) ok('PD2: 原始文本快照存在');
    else fail('PD2: _rawForSynopsis 缺失');
    if (src.includes('const _rawForSynopsis = String(_tc.content')) ok('PD2: 快照在清洗前创建');
    else fail('PD2: 快照位置错误');
    if (src.includes('extractSynopsisFast(_rawForSynopsis || message.mes')) ok('PD2: synopsis 检测用原始文本');
    else fail('PD2: synopsis 检测未用原始文本');
}

// 回归：v3.23-28 功能仍在
{
    ['_diffusionFatigue', '_archivedFloorIds', 'RESIDENT_MARKERS', 'extractSynopsisFast', '_lastRecallTrace', 'historical', 'memoryTree'].forEach(k => {
        if (src.includes(k)) ok(`回归: ${k} 仍在`);
        else fail(`回归: ${k} 丢失`);
    });
}

console.log(`\n✓ v3.29 审计修复测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }