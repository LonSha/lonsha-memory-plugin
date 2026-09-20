// 审计基建 M 的**负控制**（v3.180）：证明 scan_v3180_three_faces.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 为什么单独成档：
//   一条判据「跑绿了」只说明它没报警，不说明它**会**报警。判据恒绿有三种伪装：
//     ① 对原文件断言 —— 破坏没发生也绿；
//     ② 把破坏写死成模拟常量 —— 真判据根本没被调用；
//     ③ 破坏把判据自己删了 —— 自我指涉。
//   本档统一用「真源码破坏 → 破坏副本 → 在副本上重跑同一套真判据」来排除这三种。
//
// 纪律（三条都是被踩过才写的）：
//   · 每次破坏发生在**独立 fixture 目录**里，只搬判据真正读的 4 个文件；
//     LONSHA_AUDIT_ROOT 指过去 ⇒ 源仓库零污染，且判据读的确实是「被破坏的那份真源码」。
//   · 锚点必须**恰中期望次数**：命中数不符 ⇒ 该组作废并报错（防锚点漂移后静默跳过、
//     把「没破坏成功」误读成「判据对破坏无反应」）。
//   · 破坏后先 `node --check`：非零退出必须来自判据，而不是解析崩溃（否则归因不成立）。
//
// 判据：V0 原版对照必须 exit 0；V1–V8 逐组命中期望退出码，且**不得**为 0。
// 退出码：0=负控制成立  1=负控制失效（判据恒绿/破坏不可归因/锚点漂移）  2=结构漂移
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN = path.join(HERE, 'scan_v3180_three_faces.mjs');
const FLOOR = 'floor-ledger.js';
const AGE = 'age-anchor.js';
const PUB = 'public-interface.js';
const IDX = 'index.js';
const GAUGED = [FLOOR, AGE, PUB, IDX];
// (名字, 目标文件 | 'DELETE', 锚点, 替换为, 期望命中数, 期望退出码, 说明)
const CASES = [
    ['V0-原版对照', null, null, null, null, 0,
        '不破坏：同 fixture 机制下 M 必须 exit 0（否则后面所有「翻红」都不可归因）'],
    ['V1-归属三态塌两态', FLOOR,
        "return { present: true, valid: false, record: null, why: 'fingerprint-mismatch'", 
        "return { present: false, valid: false, record: null, why: 'absent'",
        1, 1,
        '把「有但不属于这页」压成「没有这格账」——三态塌两态，M2 必须翻红'],
    ['V2-年龄第三态被删', AGE,
        "out.state = 'anchor-only';",
        "out.state = 'exact';",
        4, 1,
        '「算不出」被并进「原值即准」——正是本版修的原始缺陷，M2 + M7 必须翻红'],
    ['V3-注册路径不标注', PUB,
        "report.slash.path = 'addCommandObject';",
        "report.slash.path = null;",
        1, 1,
        '「注册成功」与「注册到哪条路径」被压成一件事，M2 必须翻红'],
    ['V4-附注无界', FLOOR,
        'slice(0, opts.maxItems || 20)',
        'slice(0, 100000)',
        1, 1,
        '附注挂在用户楼层上会无界膨胀，M6 必须翻红'],
    ['V5-落笔点脱钩', IDX,
        'this._stampFloorLedger(message, { floor: floorNow, items: _lv.items });',
        '/* 破坏：不再落笔 */',
        1, 1,
        '声明了却零消费（死声明），M1 必须翻红'],
    ['V6-时钟委托被拆', IDX,
        "            try { return new RelativeTimeHelper().parseStoryDate(dateStr); } catch (e) { errLog(e, 'GameClock.parseStoryDate'); return null; }",
        '            return null;',
        1, 1,
        '时钟不再解析日期 ⇒ 年龄 estimated 永不达成，M5 必须翻红'],
    ['V7-时钟未交给状态层', IDX,
        '            this.status.clock = this.clock;',
        '            /* 破坏：状态层拿不到时钟 */',
        1, 1,
        'this.clock 在 CharacterState 上恒 undefined ⇒ 助手静默缺席，M5 必须翻红'],
    ['V8-模块消失', 'DELETE', AGE, null, null, 2,
        '年龄锚点模块被删/改名 ⇒ M0 结构漂移（探测对象不在，不得当「没问题」）'],
    ['V9-fresh闸门被拆', IDX,
        '                if (record && (record.fresh || opts.fresh)) {',
        '                if (false) {',
        1, 1,
        '陈旧拒笔整段失效（旧页账写到新页上），M5 fresh 闸门判据必须翻红']
];
for (const p of [SCAN, ...GAUGED.map(f => path.join(REPO, f))]) {
    if (!fs.existsSync(p)) {
        console.error('[v3180-negctl] 缺文件：' + p + ' ——结构漂移（负控制无法建立）');
        process.exit(2);
    }
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v3180-negctl-'));
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
    console.error('\n[v3180-negctl] 负控制失效，' + problems.length + ' 项：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('✓ v3.180 三面收口审计负控制：原版绿 + ' + CASES.filter(c => c[1] && c[1] !== 'DELETE').length
    + ' 组真源码破坏各自翻红 + ' + CASES.filter(c => c[1] === 'DELETE').length
    + ' 组结构漂移（破坏均语法合法、字节可观测）');