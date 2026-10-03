// 审计基建 L 的**负控制**（v3.245.0）：证明 scan_world_clock_reader.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 为什么现在才补：
//   本档此前**没有任何观测点**。它唯一的常驻锚是 tests/audit/audit_scan_probe_matrix.tsv 里的一行
//   （G 列实测 2 —— 「镜像根目录的 .js 全删 ⇒ 结构漂移」），而那是**静态登记**：
//   只在 tests/v3226_audit_sensitivity.test.mjs 跑的时候被重新实测一次，且它回答的是
//   「扫描器还对两类输入面敏不敏感」，不是「判据对具体的真源码破坏会不会翻红」。
//   v3.245.0 的夹具同步门禁（计划 #2）E4 直接把这件事判成缺陷：
//     「scan_world_clock_reader.mjs 零观测点 —— 它的判据无论恒绿与否都没人看得见」。
//   本档即为补上的成建制观测点；TSV 那一行原位保留（灵敏度体检），两者职责不同。
//
// 纪律（三条都是本仓被踩过才写的）：
//   · 每次破坏发生在**独立 fixture 目录**里，只搬判据真正读的 2 个文件
//     （world-clock-reader.js / index.js），LONSHA_AUDIT_ROOT 指过去 ⇒ 源仓库零污染，
//     且判据读的确实是「被破坏的那份真源码」；
//   · 锚点必须**恰中期望次数**：命中数不符 ⇒ 该组作废并报错（防锚点漂移后静默跳过，
//     把「没破坏成功」误读成「判据对破坏无反应」）；
//   · 破坏后先 `node --check`：非零退出必须来自判据，而不是解析崩溃（否则归因不成立）。
//
// 判据：L0 原版对照必须 exit 0；L1–L7 逐组命中期望退出码，且**不得**为 0。
//   L0 为什么必须存在：只验「破坏会翻红」不验「原版是绿的」，会把「破坏写死成模拟常量」
//   判成绿（真判据根本没被调用）。
//   L5 锁定本版（v3.245.0）修掉的真缺陷：W5 曾**被模块顶注的注释满足** ——
//   把代码里的 `BRIDGE_VERSION` 校验整段注释化，门禁照样绿。修法是文本判据改走
//   剥注释后的源码；本组即该修法的永久负控制（修前必红、修后必须翻红）。
// 退出码：0=负控制成立  1=负控制失效（判据恒绿/破坏不可归因/锚点漂移）  2=结构漂移（探测对象不在）
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN = path.join(HERE, 'scan_world_clock_reader.mjs');
const MOD = 'world-clock-reader.js';
const IDX = 'index.js';
/* [v3.266.0 A1 第六刀] GameClock 外移 memory-core.js：L2 破坏的真源也搬了，
 *   夹具必须同步搬运，否则锚点在 index.js 里命中 0 次 ⇒ 本组作废。 */
const MEMCORE = 'memory-core.js';
const GAUGED = [MOD, IDX, MEMCORE];

// (名字, 编辑序列 | 'DELETE', 期望退出码, 期望归因串 | null, 说明)
//   编辑 = [目标文件, 锚点, 替换为, 期望命中数]
//   期望归因串：该组的翻红**必须**带这条归因（防「翻红了但不是本组归因」）
const CASES = [
    ['L0-原版对照', [], 0, null,
        '不破坏：同一 fixture 机制下 L 必须 exit 0（否则后面所有「翻红」都不可归因）'],
    ['L1-来源两态塌缩', [
        [MOD, "if (enabled === false) reason = 'disabled';", "if (enabled === false) reason = 'not-mounted';", 1],
        [MOD, "reason: 'disabled', source: src, snapshot: null };", "reason: 'not-mounted', source: src, snapshot: null };", 1],
    ], 1, '来源态 "disabled" 不可达', '把「未启用」压成「未装」⇒ W2 必须翻红（用户无从知道该去开哪个开关）'],
    ['L2-快照不携带读数', [
        [MEMCORE, 'worldClockRead: this._worldClockRead', 'worldClockRead: undefined', 1],
    ], 1, '快照携带 worldClockRead', '快照不再携带对读结果 ⇒ W1「快照携带」消费点脱钩'],
    ['L3-读者面带写路径', [
        [MOD, 'const b = getBridge(WORLDAXIS_BRIDGE_ID, win);',
            "const b = getBridge(WORLDAXIS_BRIDGE_ID, win); if (b) b.publish({ reason: 'negctl' });", 1],
    ], 1, '写侧入口 publish(', '读者面出现写侧入口 ⇒ W3 必须翻红（只读契约被破坏，会污染上游状态）'],
    ['L4-入口去兜底', [
        [MOD, "    try { return bridgeSourceInner(id, win); }\n    catch (_e) { return { mounted: false, enabled: null, hasSnapshot: false, stat: null, refused: false, refuses: 0, reason: 'probe-threw' }; }",
            '    return bridgeSourceInner(id, win);', 1],
    ], 1, '无 try/catch', '导出入口失去 try/catch 与 Inner 兜底 ⇒ W4 必须翻红（宿主 getter 抛错会外抛给调用方）'],
    ['L5-版本校验被注释化', [
        [MOD, 'const BRIDGE_VERSION = 1;', '// const BRIDGE_VERSION = 1;', 1],
    ], 1, '未校验上游 BRIDGE_VERSION', '把契约版本校验整段注释化 ⇒ W5 必须翻红（本版修掉的真缺陷：注释曾满足判据）'],
    ['L6-桥名被改', [
        [MOD, "const WORLDAXIS_BRIDGE_ID = 'worldaxis_bridge_v1';",
            "const WORLDAXIS_BRIDGE_ID = 'worldaxis_bridge_v2';", 1],
    ], 1, '桥名与上游不一致', '桥名与上游不一致 ⇒ W5 必须翻红（两端静默失联，两侧都不报错）'],
    ['L7-模块消失', 'DELETE', 2, null,
        '读者模块被删/改名 ⇒ W0 结构漂移（探测对象不在，不得当「没问题」）'],
];

// 缺文件 = 结构漂移（exit 2）：与 scan_world_clock_reader.mjs 同约定，
//   也满足 v3159「每个审计脚本都能阻断」的底线。
for (const p of [SCAN, ...GAUGED.map((f) => path.join(REPO, f))]) {
    if (!fs.existsSync(p)) {
        console.error('[world-clock-reader-negctl] 缺文件：' + p + ' ——结构漂移（负控制无法建立）');
        process.exit(2);
    }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wcr-negctl-'));
const problems = [];
const rows = [];

for (const [name, edits, expectCode, expectHint, why] of CASES) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of GAUGED) fs.copyFileSync(path.join(REPO, f), path.join(dir, f));

    if (edits === 'DELETE') {
        const victim = path.join(dir, MOD);
        if (!fs.existsSync(victim)) { problems.push(name + '：待删文件不存在'); continue; }
        fs.rmSync(victim);
    } else {
        let abort = false;
        const touched = new Set();
        for (const [file, anchor, repl, expectHits] of edits) {
            const p = path.join(dir, file);
            const before = fs.readFileSync(p, 'utf8');
            const hits = before.split(anchor).length - 1;
            if (hits !== expectHits) {
                problems.push(name + '：' + file + ' 的锚点命中 ' + hits + ' 次、期望 ' + expectHits
                    + ' 次（锚点漂移 ⇒ 该组作废，防静默跳过）');
                abort = true;
                break;
            }
            const after = before.split(anchor).join(repl);
            if (after === before) {
                problems.push(name + '：替换后源码未变化（破坏不可观测 ⇒ 负控制失效）');
                abort = true;
                break;
            }
            fs.writeFileSync(p, after);
            touched.add(file);
        }
        if (abort) continue;
        // 破坏必须「可运行地坏」：语法都不过的话，非零退出不能归因于判据
        let syntaxBad = null;
        for (const f of touched) {
            const p = path.join(dir, f);
            const chk = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8', cwd: dir });
            if (chk.status !== 0) { syntaxBad = f + '：' + String(chk.stderr || '').slice(0, 160); break; }
        }
        if (syntaxBad) {
            problems.push(name + '：破坏后语法不合法（' + syntaxBad + '）⇒ 非零退出不可归因于判据');
            continue;
        }
    }

    const r = spawnSync(process.execPath, [SCAN], {
        cwd: dir, encoding: 'utf8',
        env: Object.assign({}, process.env, { LONSHA_AUDIT_ROOT: dir }),
    });
    const code = r.status === null ? -1 : r.status;
    const out = String(r.stdout || '') + String(r.stderr || '');
    const reds = out.split('\n').filter((l) => l.trim().startsWith('✗')).map((l) => l.trim());

    if (code === 0 && expectCode !== 0) {
        problems.push(name + '：破坏后 L 仍 exit 0 ⇒ **判据对这类破坏无反应（恒绿）**');
        continue;
    }
    if (code !== expectCode) {
        problems.push(name + '：退出码 ' + code + '、期望 ' + expectCode + '（判据可能被改写）'
            + (reds.length ? '（首条归因：' + reds[0].slice(0, 120) + '）' : ''));
        continue;
    }
    /* 归因核对：翻红必须翻在**本组破坏的那条判据**上。
     *   防的形态：破坏 A 却由判据 B 报错（归因错位），或破坏了但归因串其实是别的东西。 */
    if (expectHint && !out.includes(expectHint)) {
        problems.push(name + '：翻红了但不含期望归因「' + expectHint + '」（归因错位，破坏与判据对不上）'
            + (reds.length ? '（首条归因：' + reds[0].slice(0, 120) + '）' : ''));
        continue;
    }
    rows.push({ name, code, why, reds });
}

console.log('=== 世界钟读者面负控制（scan_world_clock_reader.mjs 的观测点）===');
console.log('夹具：每组建独立 mkdtemp 树，只搬 ' + GAUGED.join(' + ') + '（LONSHA_AUDIT_ROOT 指向它）');
for (const r of rows) {
    console.log('  ' + (r.code === 0 ? 'ok ' : 'ok ') + r.name + '：exit ' + r.code
        + '（' + r.why + '）' + (r.reds.length ? ' ｜ 首条归因：' + r.reds[0].slice(0, 96) : ''));
}
fs.rmSync(root, { recursive: true, force: true });

if (problems.length) {
    console.error('');
    console.error('[world-clock-reader-negctl] ' + problems.length + ' 组失败：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('[world-clock-reader-negctl] ' + rows.length + ' 组成立 / 0 组失败：'
    + '原版对照 exit 0；真源码破坏逐组可归因翻红（含本版修的「W5 被注释满足」那一组），'
    + '模块被删时如实结构漂移。');
process.exit(0);
