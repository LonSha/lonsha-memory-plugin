// tests/v328_pyramid_tree.test.mjs
// v3.28.0 测试：三级金字塔摘要 + 记忆树路由召回（st-memory-wizzard 本地轻量版）
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
const srcRaw = __hostSurface() + String.fromCharCode(10) + fs.readFileSync(new URL('../memory-config.js', import.meta.url), 'utf8');
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const src = srcRaw + String.fromCharCode(10) + (fs.readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8'))

// 版本断言（>= v3.28 容灾）
const vm = src.match(/const VERSION = '([^']+)'/);
if (!vm) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
if (vnum(vm[1]) < vnum('3.28')) { console.error(`FAIL: 版本 ${vm[1]} < 3.28`); process.exit(1); }
console.log(`ok: 版本 ${vm[1]}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// T1: 三级金字塔结构
{
    if (src.includes('this.historical = []')) ok('T1: historical 数组存在');
    else fail('T1: historical 缺失');
    if (src.includes('historicalFoldThreshold: 12')) ok('T1: historicalFoldThreshold 配置存在');
    else fail('T1: historicalFoldThreshold 缺失');
    if (src.includes('maybeFoldHistorical')) ok('T1: maybeFoldHistorical 方法存在');
    else fail('T1: maybeFoldHistorical 缺失');
    if (src.includes('level: 2')) ok('T1: 卷摘要标记为周记层(level2)');
    else fail('T1: 周记层标记缺失');
    if (src.includes('level: 3')) ok('T1: 史记标记 level3');
    else fail('T1: 史记层标记缺失');
    // 导入对称
    if (src.includes('historical = Array.isArray(data.historical)')) ok('T1: historical 导入对称');
    else fail('T1: historical 导入缺失');
    // 注入: 史记+周记
    if (src.includes('【史记·跨阶段总览】')) ok('T1: 史记注入块存在');
    else fail('T1: 史记注入块缺失');
    if (src.includes('【周记·阶段概括】')) ok('T1: 周记注入块存在');
    else fail('T1: 周记注入块缺失');
    if (src.includes('getActiveVolumes()')) ok('T1: 活跃周记过滤存在');
    else fail('T1: 活跃周记过滤缺失');
}

// T2: 三级金字塔折叠逻辑
{
    if (src.includes('this.volumes.length >= (config.historicalFoldThreshold || 12)')) ok('T2: 史记折叠触发条件存在');
    else fail('T2: 史记折叠触发缺失');
    if (src.includes('v.archived = true')) ok('T2: 入史记的周记标记归档');
    else fail('T2: 周记归档标记缺失');
    if (src.includes('你是历史学家')) ok('T2: 史记折叠 prompt 存在');
    else fail('T2: 史记 prompt 缺失');
}

// T3: 记忆树路由召回（本地轻量版）
{
    if (src.includes('memoryTreeEnabled: false')) ok('T3: memoryTreeEnabled 开关存在（默认关）');
    else fail('T3: memoryTreeEnabled 缺失');
    if (src.includes('memoryTree')) ok('T3: memoryTree source 存在');
    else fail('T3: memoryTree source 缺失');
    if (src.includes('treePaths.push')) ok('T3: 记忆树路径构建存在');
    else fail('T3: treePaths 缺失');
    if (src.includes('neighborNames')) ok('T3: 邻接节点提取存在');
    else fail('T3: neighborNames 缺失');
    // buildInjection 独立分区
    if (src.includes("item.source === 'memoryTree') treeNotes.push")) ok('T3: 记忆树独立分区');
    else fail('T3: memoryTree 分区缺失');
    if (src.includes('[记忆树·角色关联]')) ok('T3: 记忆树渲染块存在');
    else fail('T3: 记忆树渲染块缺失');
}

// T4: v3.23-27 功能回归
{
    if (src.includes('_diffusionFatigue')) ok('T4: 扩散疲劳仍在');
    else fail('T4: 扩散疲劳丢失');
    if (src.includes('_archivedFloorIds')) ok('T4: 归档状态仍在');
    else fail('T4: 归档状态丢失');
    if (src.includes('RESIDENT_MARKERS')) ok('T4: 召回分级仍在');
    else fail('T4: 召回分级丢失');
    if (src.includes('extractSynopsisFast')) ok('T4: synopsis 提取仍在');
    else fail('T4: synopsis 提取丢失');
    if (src.includes('_lastRecallTrace')) ok('T4: 命中轨迹仍在');
    else fail('T4: 命中轨迹丢失');
}

console.log(`\n✓ v3.28 三级金字塔/记忆树测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }