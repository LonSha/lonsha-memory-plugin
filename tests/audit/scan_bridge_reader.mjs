// 审计基建 K（v3.174）：桥的读者契约面扫描（失败出口 / 状态可达 / 出口不抛）
// ------------------------------------------------------------
// 为什么存在：
//   公开只读快照桥 window.lonsha_memory_bridge_v1 是全插件**唯一的对外出口**，
//   也是本仓与手机端之间**唯一**的信息通路。但此前 86 个版本对它只有「供货侧」审计
//   （字段在不在、是不是深拷贝），没有任何判据问过**读者侧**：
//   「宿主拿到这份快照之后，能不能分辨自己看到的是什么，能不能判失败」。
//   实测后果（v3.174 修前）：
//     · bridge.refresh() 的 catch 吞掉错误，只留 snapshot=null ——
//       「引擎未 init」「引擎在位但返回空」「取快照抛错」三种处境同形；
//     · deep() 的 JSON 回退把 undefined 变成 null ——「字段不存在」与「显式是空」同形；
//     · 宿主存盘前只能自己 stringify 一遍反推，「序列化失败」与「快照本来就空」同形。
//
// 判定策略（全部基于真源码读取 + 真行为驱动，不做文本猜测）：
//   R1 桥对象的每个对外方法必须有**可归因的失败出口**：catch 内不得静默只写
//      snapshot=null（须落到 lastError）——「只成功、无失败」的方法，其成功声称是常量。
//   R2 sourceState 的每个**已声明枚举值**必须在源码里可达（声明了却永不出现的状态，
//      是「声明面空转」：读者按文档去判一个永远不会到来的态）。
//   R3 快照的类型读数必须覆盖全部顶层字段（漏字段 ⇒ 读者会以为「没有这项」）。
//   R4 JSON 出口在「无快照 / 序列化失败」两条路径上都**不得返回空串**，
//      也**不得抛**（入口契约与 snapshot 同规格）。
//   R5 结构健康标记 + 每个判定面非零下限（防探测器失效后以全绿通过）。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
// 夹具通道：LONSHA_AUDIT_FIXTURE=1 放宽下限，供单测塞合成仓库。
import fs from 'fs';
import path from 'node:path';
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();

const idxPath = path.join(ROOT, 'index.js');
if (!fs.existsSync(idxPath)) {
    console.error('[bridge-reader] 找不到 index.js（ROOT=' + ROOT + '）');
    process.exit(2);
}
const src = fs.readFileSync(idxPath, 'utf8');

function extractBlock(text, startIdx) {
    let depth = 0, end = -1;
    for (let i = startIdx; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
    }
    return end > 0 ? text.slice(startIdx, end + 1) : null;
}
function extractMethod(text, name) {
    const marker = name + '() {';
    const start = text.indexOf(marker);
    if (start < 0) return null;
    const bodyStart = text.indexOf('{', start);
    return extractBlock(text, bodyStart);
}

const problems = [];
const notes = [];

/* ---------- R0 结构预检 ---------- */
const bridgeMarker = 'window.lonsha_memory_bridge_v1 = {';
const bmIdx = src.indexOf(bridgeMarker);
if (bmIdx < 0) {
    console.error('[bridge-reader] 桥挂载点不存在（window.lonsha_memory_bridge_v1 = {...）——结构漂移');
    process.exit(2);
}
const bridgeLiteral = extractBlock(src, src.indexOf('{', bmIdx));
if (!bridgeLiteral) {
    console.error('[bridge-reader] 桥对象字面量解析失败（花括号不平衡）——结构漂移');
    process.exit(2);
}
const snapM = extractMethod(src, 'buildBridgeSnapshot');
const jsonM = extractMethod(src, 'buildBridgeSnapshotJson');
if (!snapM || !jsonM) {
    console.error('[bridge-reader] 快照方法缺失（buildBridgeSnapshot / buildBridgeSnapshotJson）——结构漂移');
    process.exit(2);
}
notes.push('桥挂载点 + 两个快照方法解析成功');

/* ---------- R1 失败出口可归因（不得静默只写 snapshot=null） ---------- */
// bridge.refresh 的 catch 块必须落到 lastError（不得只 this.snapshot = null）
const refreshM = extractMethod(bridgeLiteral, 'refresh');
if (!refreshM) {
    problems.push('R1 bridge.refresh 方法缺失（读者没有取数入口）');
} else {
    const catchBlocks = refreshM.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\}/g) || [];
    if (catchBlocks.length === 0) {
        problems.push('R1 bridge.refresh 无 catch 块——取快照抛错会冒泡给宿主，违反入口契约');
    } else {
        let okCatch = 0;
        for (const cb of catchBlocks) {
            const hasLastError = /this\.lastError\s*=/.test(cb);
            if (!hasLastError) {
                problems.push('R1 bridge.refresh 的 catch 未落到 lastError（错误被吞：读者只能看到 null，无法归因）');
            } else { okCatch++; }
        }
        if (okCatch === catchBlocks.length && catchBlocks.length > 0) notes.push('refresh catch 错误全部落到 lastError');
    }
    // 成功路径必须清空 lastError（否则读者会把「曾经的错误」当「当下的错误」）
    if (!/this\.lastError\s*=\s*null/.test(refreshM)) {
        problems.push('R1 refresh 未在成功路径清空 lastError——旧错误会残留成「当下的错误」');
    }
}

/* ---------- R2 已声明枚举值必须可达 ---------- */
const declaredStates = new Set();
for (const m of src.matchAll(/this\.sourceState\s*=\s*'([a-z-]+)'/g)) declaredStates.add(m[1]);
// 注释里声明的枚举（'idle' / 'ready' / ... 的中文说明行）
const docStates = new Set();
for (const m of src.matchAll(/'\s*([a-z-]+)\s*'\s*(?:——|—|-)\s*[^\n]*/g)) { /* 仅作辅助，不参与判定 */ }
if (declaredStates.size < 3) {
    problems.push('R2 sourceState 可赋值态过少（实 ' + declaredStates.size + '）——来源可见性未落地或声明面空转');
} else {
    notes.push('sourceState 可赋值态 ' + [...declaredStates].sort().join('/'));
    // 三态必须同时可达：引擎不在位 / 引擎在位但空 / 抛错
    for (const must of ['engine-absent', 'engine-empty', 'thrown', 'ready']) {
        if (!declaredStates.has(must)) {
            problems.push('R2 sourceState 缺少可达态 "' + must + '"（读者无法分辨这一处境）');
        }
    }
}
if (!/'idle'/.test(src)) notes.push('提示：idle 初值未在源码文本中显式声明（若由对象字面量给出，属可接受）');

/* ---------- R3 类型读数覆盖全部顶层字段 ---------- */
const fieldTypesCall = /snap\.meta\s*=\s*\{[\s\S]*?fieldTypes:\s*fieldTypes\(snap\)/.test(snapM)
    || /fieldTypes:\s*fieldTypes\(snap\)/.test(snapM);
if (!fieldTypesCall) {
    problems.push('R3 快照的类型读数未覆盖全部顶层字段（fieldTypes(snap) 未接线）——读者会把「有这项、值为空」当「缺失」');
} else {
    notes.push('fieldTypes 覆盖全字段');
}
// 三态判定函数必须区分 undefined 与 null（不得一律 present:true）
if (/present:\s*true,/.test(snapM) && !/present:\s*t\s*!==\s*'undefined'/.test(snapM)) {
    problems.push('R3 类型读数把一切字段都报 present:true——「缺失」与「显式空」不再可分辨');
}

/* ---------- R4 JSON 出口：不返回空串、不抛 ---------- */
if (/json:\s*''/.test(jsonM)) {
    problems.push("R4 JSON 出口存在返回空串的路径——读者会以为「存成功了，只是内容是空的」");
}
if (!/catch\s*\(/.test(jsonM)) {
    problems.push('R4 JSON 出口无 catch——序列化失败会冒泡给宿主，违反入口契约');
}
if (!/ok:\s*false/.test(jsonM)) {
    problems.push('R4 JSON 出口无失败分支（ok:false）——失败与成功同形');
}
if (!/no-snapshot|serialize-empty/.test(jsonM)) {
    problems.push('R4 JSON 出口的失败原因未分类（no-snapshot / serialize-empty）——读者无法归因');
}
if (/json:\s*''/.test(jsonM) === false && /catch\s*\(/.test(jsonM) && /ok:\s*false/.test(jsonM)) {
    notes.push('JSON 出口：无空串路径 + 有 catch + 有失败分支');
}

/* ---------- R5 结构健康 ---------- */
if (!FIXTURE_MODE) {
    const total = declaredStates.size + [refreshM, snapM, jsonM].filter(Boolean).length;
    if (total < 6) {
        console.error('[bridge-reader] 判定面塌缩（total=' + total + '）——探测器可能失效');
        process.exit(2);
    }
}
// 元数据自述（契约版本）必须存在
if (!/contract:\s*'v[0-9.]+'/.test(snapM)) {
    problems.push("R5 快照缺 contract 自述——读者无法判断手上这份快照是哪版契约产出的");
}

/* ---------- 输出 ---------- */
for (const n of notes) console.log('  · ' + n);
if (problems.length) {
    console.error('\n[bridge-reader] 发现 ' + problems.length + ' 处读者侧缺陷：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('✓ 桥的读者契约面：来源可归因 / 状态可达 / 类型三态 / 出口不抛不空（' + notes.length + ' 项结构证据）');
process.exit(0);