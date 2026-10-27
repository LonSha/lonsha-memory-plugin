/**
 * tests/audit/scan_live_wiring_dataflow.mjs
 * 
 * 架构数据流门禁：全仓排查“幽灵守卫 (Ghost Guards)”与虚假分支。
 * 规则：
 * 任何被宿主管线（engine-recall / engine-injection-pipeline / engine-execution-pipeline / engine-persistence-ops）
 * 在条件判定 (if) 中读取的私有实例属性 (this._xxx)，必须在非测试源码中存在至少一次写操作（赋值/解构/传参写入），
 * 杜绝“声明了属性守卫但全仓 0 次写入导致分支 100% 被静默旁路”的虚假接线假绿。
 *
 * 退出码：0 卫生 / 1 真缺陷（有幽灵守卫）/ 2 结构漂移（管道文件缺失、扫描面塌陷）。
 *   [v3.421.0] 2 是补上的：此前只有 0 / 1，扫描面塌陷时会报「幽灵守卫 0」并 exit 0，
 *   与「真的全都有写入源」完全同形。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

const PIPELINE_FILES = [
    'engine-recall.js',
    'engine-injection-pipeline.js',
    'engine-execution-pipeline.js',
    'engine-persistence-ops.js'
];

function getAllSourceFiles(dir) {
    let results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
        if (ent.name === 'node_modules' || ent.name === '.git' || ent.name === 'tests' || ent.name === 'tools') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
            results = results.concat(getAllSourceFiles(full));
        } else if (ent.name.endsWith('.js') || ent.name.endsWith('.mjs')) {
            results.push(full);
        }
    }
    return results;
}

/* [v3.421.0] 结构预检（fail-closed）。此前本脚本只有 0 / 1 两态：
 *   管道文件被改名 / 扫描面塌陷时，守卫属性集为空 ⇒ 「幽灵守卫 0」⇒ exit 0，
 *   与「真的全都有写入源」同形（本仓反复点名的「审计失效 = 报告正常」）。
 *   这里补两道结构闸：管道文件必须逐个在场、全仓扫描面必须越过下限，否则 exit 2。 */
const MIN_SOURCES = 80;
const MIN_GUARD_PROPS = 5;
for (const pFile of PIPELINE_FILES) {
    if (!fs.existsSync(path.join(REPO, pFile))) {
        console.error('[scan_live_wiring_dataflow] 结构漂移：管道文件缺失 ' + pFile);
        process.exit(2);
    }
}
const allSources = getAllSourceFiles(REPO);
if (allSources.length < MIN_SOURCES) {
    console.error('[scan_live_wiring_dataflow] 结构漂移：全仓源码只扫到 ' + allSources.length + ' 个（下限 ' + MIN_SOURCES + '）');
    process.exit(2);
}
const sourceContents = new Map();
for (const f of allSources) {
    const rel = path.relative(REPO, f);
    sourceContents.set(rel, fs.readFileSync(f, 'utf8'));
}

// 1. 扫描管道文件中的守卫属性
const guardProps = new Set();
const guardRe = /if\s*\([^)]*?(?:this|engine)\.(_[A-Za-z0-9_]+)(?!\s*\()/g;

for (const pFile of PIPELINE_FILES) {
    const code = sourceContents.get(pFile) || '';
    let m;
    while ((m = guardRe.exec(code)) !== null) {
        const prop = m[1];
        // 排除方法调用及已知合法的宿主生命周期状态
        guardProps.add(prop);
    }
}

if (guardProps.size < MIN_GUARD_PROPS) {
    console.error('[scan_live_wiring_dataflow] 结构漂移：守卫属性只抽到 ' + guardProps.size + ' 个（下限 ' + MIN_GUARD_PROPS + '）—— 守卫正则与管道源码形态已脱节');
    process.exit(2);
}
// 2. 扫描全仓写入源
const ghostGuards = [];
for (const prop of guardProps) {
    // 写入模式：.prop = 或 prop: (在对象字面量中作为键)
    const writeRe = new RegExp(`(?:\\.${prop}\\s*=(?!=)|\\b${prop}\\s*:)`);
    let written = false;
    for (const [rel, code] of sourceContents.entries()) {
        if (writeRe.test(code)) {
            written = true;
            break;
        }
    }
    if (!written) {
        ghostGuards.push(prop);
    }
}

// 允许的白名单（如有历史框架级预留属性，列出并注明原因）
const ALLOWED_HISTORICAL_GHOSTS = new Set([
    '_controlInfo',          // 框架保留控制信息
    '_historyFingerprint',   // 历史指纹快照
    '_leaseValid',           // 会话租约有效标志
    '_crosslinkConsumeAlive',// 跨链保活
    '__buildInjectionOpts',  // 注入调试预留
    '_activeArbitrationRecord', // 仲裁记录兜底
    '_estimateTokens',       // 估算 Token 钩子
    '_evidenceQueryLedgersOf',
    '_qaCausalEdges',
    '_qaHelpDeps',
    '_loreKnownEntities',
    '_nativeToolMaxRounds'
]);

const illegalGhostGuards = ghostGuards.filter(g => !ALLOWED_HISTORICAL_GHOSTS.has(g));

console.log(`[scan_live_wiring_dataflow] 检查宿主管线 ${guardProps.size} 个条件守卫属性的数据流真实性...`);

if (illegalGhostGuards.length > 0) {
    console.error(`❌ [scan_live_wiring_dataflow] 失败：发现 ${illegalGhostGuards.length} 个完全零写入的幽灵守卫属性！`);
    illegalGhostGuards.forEach(g => console.error(`  - 守卫属性: ${g} (在宿主管线中作为判定条件，但全仓 0 次写入，导致分支 100% 跳过)`));
    process.exit(1);
}

console.log(`✓ [scan_live_wiring_dataflow] 通过：宿主管线关键认知机制条件守卫全部具备真实写入源与数据流闭环。`);
process.exit(0);
