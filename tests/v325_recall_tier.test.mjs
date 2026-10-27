// tests/v325_recall_tier.test.mjs
// v3.25.0 测试：召回类型分级 / token 预算双层 / 归档隐藏 / 扩散疲劳（MemoryPilot + 记忆库v5 + Bakemono + TriviumDB）
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
const src = __hostSurface() + String.fromCharCode(10) + fs.readFileSync(new URL('../memory-config.js', import.meta.url), 'utf8');

// 版本断言（>= v3.25 容灾）
const vm = src.match(/const VERSION = '([^']+)'/);
if (!vm) { console.error('FAIL: VERSION 未找到'); process.exit(1); }
if (vnum(vm[1]) < vnum('3.25')) { console.error(`FAIL: 版本 ${vm[1]} < 3.25`); process.exit(1); }
console.log(`ok: 版本 ${vm[1]}`);

let pass = 0;
const fail = (m) => { console.error('FAIL: ' + m); process.exitCode = 1; };
const ok = (m) => { pass++; console.log('ok: ' + m); };

// ── T1: 召回类型分级（常驻分区保留 + 触发分区裁剪）──
{
    // RESIDENT_MARKERS 存在
    if (src.includes("RESIDENT_MARKERS = ['[前情摘要]', '[角色状态]'")) ok('T1: 常驻分区标记存在');
    else fail('T1: RESIDENT_MARKERS 缺失');
    if (src.includes('residentBlocks') && src.includes('triggerBlocks')) ok('T1: 常驻/触发分区拆分存在');
    else fail('T1: 分区拆分缺失');
    // config 开关
    if (src.includes('recallTierEnabled: true')) ok('T1: recallTierEnabled 开关存在');
    else fail('T1: recallTierEnabled 缺失');
}

// ── T2: token 预算双层 ──
{
    if (src.includes('memoryTokenBudget: 2700')) ok('T2: memoryTokenBudget 开关存在');
    else fail('T2: memoryTokenBudget 缺失');
    if (src.includes('keepRecentTokenReserve: 0')) ok('T2: keepRecentTokenReserve 开关存在');
    else fail('T2: keepRecentTokenReserve 缺失');
    // budget 计算逻辑（token→字符换算）
    if (src.includes("Math.floor(tokenBudget * 10 / 9)")) ok('T2: token→字符预算换算存在（v3.133 CJK 口径）');
    else fail('T2: token 换算缺失');
    if (src.includes("budget - Math.floor(reserve * 10 / 9)")) ok('T2: 最近正文预留扣减存在（v3.133 CJK 口径）');
    else fail('T2: 预留扣减缺失');
}

// ── T3: 归档隐藏 ──
{
    if (src.includes('autoArchiveCovered: false')) ok('T3: autoArchiveCovered 默认关（防灾）');
    else fail('T3: autoArchiveCovered 默认关缺失');
    if (src.includes('archivePreserveRecent: 6')) ok('T3: archivePreserveRecent 存在');
    else fail('T3: archivePreserveRecent 缺失');
    if (src.includes('archiveCoveredFloors(')) ok('T3: archiveCoveredFloors 方法存在');
    else fail('T3: archiveCoveredFloors 缺失');
    if (src.includes('restoreArchivedFloors()')) ok('T3: restoreArchivedFloors 方法存在（可逆）');
    else fail('T3: restoreArchivedFloors 缺失');
    if (src.includes('_archivedFloorIds')) ok('T3: 归档状态跟踪存在');
    else fail('T3: _archivedFloorIds 缺失');
    // 归一化：折叠标记 folded 用于归档判定
    if (src.includes('s.folded && Number.isFinite(s.floor)')) ok('T3: 折叠标记归档判定存在');
    else fail('T3: folded 归档判定缺失');
}

// ── T4: 扩散不应期疲劳（TriviumDB Refractory）──
{
    if (src.includes('_diffusionFatigue')) ok('T4: 疲劳状态存在');
    else fail('T4: _diffusionFatigue 缺失');
    if (src.includes('_nodeIdentity')) ok('T4: 节点身份提取方法存在');
    else fail('T4: _nodeIdentity 缺失');
    if (src.includes('* 0.15')) ok('T4: 疲劳抑制系数 0.15 存在');
    else fail('T4: 疲劳抑制系数缺失');
    if (src.includes('.delete(nid)')) ok('T4: 被抑制即解除（无记忆效应）');
    else fail('T4: 疲劳解除逻辑缺失');
    if (src.includes('_diffusionFatigueTopN = 5')) ok('T4: Top-N 赢家标记存在');
    else fail('T4: Top-N 标记缺失');
    // 轮次衰减（防永久封印）
    if (src.includes('_diffusionFatigueTimeout = 3')) ok('T4: 疲劳超时轮数存在');
    else fail('T4: 疲劳超时缺失');
}

// ── T5: 幂函数入度惩罚（等效黑洞降权）──
{
    // 由于改不了外部库，用完成时后处理（diffusion 返回中热点原子降权）
    if (src.includes('diffusionResults') && src.includes('suppressed')) ok('T5: 黑洞降权后处理路径存在');
    else fail('T5: 黑洞降权路径缺失');
    // 疲劳标记打给 Top-N 赢家 = 等效黑洞抑制
    /* [v3.421.0] 标记点随召回外移 engine-recall.js：接收者写成形参 engine。 */
    if (/\.slice\(0, (this|engine)\._diffusionFatigueTopN\)/.test(src)) ok('T5: Top-N 赢家疲劳标记存在');
    else fail('T5: Top-N 疲劳标记缺失');
}

// ── T6: 版本 + 全量回归保障 ──
{
    const vm6 = src.match(/const VERSION = '(\d+\.\d+\.\d+)'/);
    if (vm6 && vnum(vm6[1]) >= vnum('3.25')) ok('T6: VERSION ' + vm6[1]);
    else fail('T6: VERSION >= 3.25');
    if (src.includes('recallTierEnabled') && src.includes('memoryTokenBudget') && src.includes('autoArchiveCovered')) ok('T6: v3.25 config 全开关在位');
    else fail('T6: config 开关缺失');
}

console.log(`\n✓ v3.25 召回分级/预算/归档/疲劳测试全过 (${pass} 项)`);
if (process.exitCode) { console.log('✗ 存在失败项'); process.exit(process.exitCode); }