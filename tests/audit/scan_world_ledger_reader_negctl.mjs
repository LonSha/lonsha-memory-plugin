// 审计基建 M 的**负控制**（v3.176）：证明 scan_world_ledger_reader.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 为什么单独成档：
//   一条判据"跑绿了"只说明它没报警，不说明它**会**报警。判据恒绿有三种伪装：
//     ① 对原文件断言 —— 破坏没发生也绿；
//     ② 把破坏写死成模拟常量 —— 真判据根本没被调用；
//     ③ 破坏把判据自己删了 —— 自我指涉。
//   本档统一用「真源码破坏 → 破坏副本 → 在副本上重跑同一套真判据」来排除这三种。
//
// 纪律（三条都是被踩过才写的）：
//   · 每次破坏发生在**独立 fixture 目录**里，只搬判据真正读的 3 个文件；
//     LONSHA_AUDIT_ROOT 指过去 ⇒ 源仓库零污染，且判据读的确实是"被破坏的那份真源码"。
//   · 锚点必须**恰中期望次数**：命中数不符 ⇒ 该组作废并报错（防锚点漂移后静默跳过、
//     把"没破坏成功"误读成"判据对破坏无反应"）。
//   · 破坏后先 `node --check`：非零退出必须来自判据，而不是解析崩溃（否则归因不成立）。
//
// 判据：V0 原版对照必须 exit 0；V1–V6 逐组命中期望退出码，且**不得**为 0。
// 退出码：0=负控制成立  1=负控制失效（判据恒绿/破坏不可归因/锚点漂移）
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN = path.join(HERE, 'scan_world_ledger_reader.mjs');
const MOD = 'world-ledger-reader.js';
const CLK = 'world-clock-reader.js';
const IDX = 'index.js';
const GAUGED = [MOD, CLK, IDX];

// (名字, 目标文件 | 'DELETE', 锚点, 替换为, 期望命中数, 期望退出码, 说明)
const CASES = [
    ['V0-原版对照', null, null, null, null, 0,
        '不破坏：同 fixture 机制下 M 必须 exit 0（否则后面所有「翻红」都不可归因）'],
    ['V1-快照不携带读数', IDX,
        'worldLedgerRead: deep(rawLedgerRead)', 'worldLedgerRead: undefined', 1, 1,
        '快照不再携带对读结果 ⇒ M1「快照携带」消费点脱钩'],
    ['V2-缺口两态塌缩', MOD,
        "verdict: 'no-filter'", "verdict: 'complete'", 2, 1,
        '把「缺口不可知」压成「无缺口」——伪造结论，M2 必须翻红'],
    ['V3-明细不切片', MOD,
        'slice(0, 12)', 'slice(0, 10000)', 6, 1,
        '明细进快照/存档会无界膨胀，M6 必须翻红'],
    ['V4-桥访问不复用单一真源', MOD,
        'const k = global && global.LonShaWorldClockReader;', 'const k = null;', 1, 1,
        '两处各写一份桥访问会口径漂移，M5 必须翻红'],
    ['V5-模块消失', 'DELETE', MOD, null, null, 2,
        '读者模块被删/改名 ⇒ M0 结构漂移（探测对象不在，不得当「没问题」）'],
    ['V6-本地投影误挂时钟', IDX,
        'class GameClock {',
        'class GameClock {\n    _localPeopleLocations() {\n        const out = {};\n        return out;\n    } /* M1-PROBE */', 1, 1,
        '投影挂到只有 date/label/turn 的时钟上 ⇒ 对读恒空且不报错，M1 必须翻红']
];

// 缺文件 = 结构漂移（exit 2）：探测对象不在，不得当「没问题」。
//   与 scan_world_ledger_reader.mjs 同约定，也满足 v3159「每个审计脚本都能阻断」的底线。
for (const p of [SCAN, ...GAUGED.map(f => path.join(REPO, f))]) {
    if (!fs.existsSync(p)) {
        console.error('[ledger-negctl] 缺文件：' + p + ' ——结构漂移（负控制无法建立）');
        process.exit(2);
    }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-negctl-'));
const problems = [];
const rows = [];

for (const [name, target, anchor, repl, expectHits, expectCode, why] of CASES) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of GAUGED) fs.copyFileSync(path.join(REPO, f), path.join(dir, f));

    let brokenBytes = 0;
    let deleted = 0;

    if (target === 'DELETE') {
        const victim = path.join(dir, anchor);
        if (!fs.existsSync(victim)) { problems.push(name + '：待删文件不存在'); continue; }
        deleted = fs.statSync(victim).size;
        fs.rmSync(victim);
    } else if (target) {
        const p = path.join(dir, target);
        const before = fs.readFileSync(p, 'utf8');
        const hits = before.split(anchor).length - 1;
        if (hits !== expectHits) {
            problems.push(name + '：锚点命中 ' + hits + ' 次、期望 ' + expectHits
                + ' 次（锚点漂移 ⇒ 该组作废，防静默跳过）');
            continue;
        }
        const after = before.split(anchor).join(repl);
        brokenBytes = Buffer.byteLength(after) - Buffer.byteLength(before);
        if (brokenBytes === 0) {
            problems.push(name + '：替换后字节未变化（破坏不可观测 ⇒ 负控制失效）');
            continue;
        }
        fs.writeFileSync(p, after);
        // 破坏必须"可运行地坏"：语法都不过的话，非零退出不能归因于判据
        const chk = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8', cwd: dir });
        if (chk.status !== 0) {
            problems.push(name + '：破坏后语法不合法（' + String(chk.stderr || '').slice(0, 160)
                + '）⇒ 非零退出不可归因于判据');
            continue;
        }
    }

    const r = spawnSync(process.execPath, [SCAN], {
        cwd: dir, encoding: 'utf8',
        env: Object.assign({}, process.env, { LONSHA_AUDIT_ROOT: dir })
    });
    const code = r.status === null ? -1 : r.status;
    const out = String(r.stdout || '') + String(r.stderr || '');
    const reds = out.split('\n').filter(l => l.trim().startsWith('✗')).map(l => l.trim());

    if (code === 0 && expectCode !== 0) {
        problems.push(name + '：破坏后 M 仍 exit 0 ⇒ **判据对这类破坏无反应（恒绿）**');
    }
    if (code !== expectCode) {
        problems.push(name + '：退出码 ' + code + '、期望 ' + expectCode);
    }
    // 只有「真缺陷」态（exit 1）才要求逐条翻红；exit 2 是结构漂移，输出的是预检错误行（不以 ✗ 开头）
    if (code === 1 && reds.length === 0) {
        problems.push(name + '：exit 1 却没有判据条目翻红 ⇒ 退出路径可疑（可能只是结构预检失败）');
    }
    rows.push({ name, code, expectCode, brokenBytes, deleted, reds: reds.slice(0, 2), why });
}

for (const r of rows) {
    const ok = r.code === r.expectCode;
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + r.name + '  exit=' + r.code
        + '（期望 ' + r.expectCode + '）· 破坏字节 ' + (r.deleted || r.brokenBytes));
    for (const l of r.reds) console.log('        └ ' + l.slice(0, 140));
}
fs.rmSync(root, { recursive: true, force: true });

if (problems.length) {
    console.error('\n[ledger-negctl] 负控制失效，' + problems.length + ' 项：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('✓ 世界账本审计负控制：原版绿 + ' + (CASES.length - 1)
    + ' 组真源码破坏各自翻红且互不连坐（破坏均语法合法、字节可观测）');
