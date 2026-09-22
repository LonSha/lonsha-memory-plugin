// 审计基建（v3.182）负控制：证明 scan_v3182_ledger_replay.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 统一用「真源码破坏 → 独立 fixture 目录 → 在副本上重跑同一套真判据」。
// 排除三种假绿：①对原文件断言 ②破坏写死成模拟常量 ③破坏把判据自己删了。
//
// 纪律：
//   · 每次破坏只搬判据真正读的 2 个文件（ledger-replay.js / index.js）
//   · 锚点必须恰中期望次数，不符即该组作废
//   · 破坏后先 node --check：非零退出必须来自判据，而不是解析崩溃
// 退出码：0=负控制成立  1=负控制失效  2=结构漂移
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN = path.join(HERE, 'scan_v3182_ledger_replay.mjs');
if (!fs.existsSync(SCAN)) {
    console.error('[ledger-replay-negctl] 找不到判据脚本 ' + SCAN + '（结构漂移）');
    process.exit(2);
}
const LR = 'ledger-replay.js';
const IDX = 'index.js';

// (名字, 目标文件|null, 锚点, 替换为, 期望命中数, 期望退出码, 说明)
const CASES = [
    ['N0-原版对照', null, null, null, null, 0,
        '不破坏：同 fixture 机制下必须 exit 0（否则后续翻红不可归因）'],
    ['N1-删掉删楼回放调用', IDX,
        '? _lr.replayDrop(this, floor)',
        '? 0',
        1, 1,
        '删楼回放入口消失，R2 必须翻红'],
    ['N2-删掉前移回放调用', IDX,
        '? _lr.replayShift(this, deleted)',
        '? 0',
        1, 1,
        '前移回放入口消失，R2 必须翻红'],
    ['N3-报告落点字段改名', IDX,
        'this._lastReplayReport =',
        'this._replayReportRenamed =',
        3, 1,
        '留痕字段被改名，R3 必须翻红（回放发生了但没人看得见）'],
    ['N4-登记表 id 重复', LR,
        "id: 'diary', label: '日记'",
        "id: 'money', label: '日记'",
        1, 1,
        '两本账共用一个 id，R1 必须翻红'],
    ['N5-drop 动作被换成非函数', LR,
        'drop: (h, f) => (h.diary && typeof h.diary.removeByFloor === \'function\') ? h.diary.removeByFloor(f) : 0,',
        'drop: 0,',
        1, 1,
        '登记项动作类型非法，R1 必须翻红'],
];

function runCase(c) {
    const [name, file, anchor, replacement, expectHits, expectExit] = c;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lr-neg-'));
    try {
        fs.copyFileSync(path.join(REPO, LR), path.join(dir, LR));
        fs.copyFileSync(path.join(REPO, IDX), path.join(dir, IDX));
        if (file) {
            const fp = path.join(dir, file);
            const src = fs.readFileSync(fp, 'utf8');
            const hits = src.split(anchor).length - 1;
            if (hits !== expectHits) {
                return { name, ok: false, why: '锚点命中 ' + hits + ' 次（期望 ' + expectHits + '），该组作废' };
            }
            fs.writeFileSync(fp, src.split(anchor).join(replacement));
            const chk = spawnSync(process.execPath, ['--check', fp], { encoding: 'utf8' });
            if (chk.status !== 0) {
                return { name, ok: false, why: '破坏后解析失败（退出码不可归因于判据）：' + (chk.stderr || '').slice(0, 200) };
            }
        }
        const r = spawnSync(process.execPath, [SCAN], {
            encoding: 'utf8',
            env: { ...process.env, LONSHA_AUDIT_ROOT: dir }
        });
        const got = r.status;
        if (got !== expectExit) {
            return { name, ok: false, why: '期望 exit ' + expectExit + ' 实得 ' + got + '\n' + (r.stdout + r.stderr).slice(0, 400) };
        }
        return { name, ok: true };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

let failed = 0;
for (const c of CASES) {
    const r = runCase(c);
    console.log((r.ok ? '  ok ' : '  FAIL ') + r.name + (r.why ? ' — ' + r.why : ''));
    if (!r.ok) failed++;
}
if (failed) { console.error('[ledger-replay-negctl] ' + failed + '/' + CASES.length + ' 组失效'); process.exit(1); }
console.log('[ledger-replay-negctl] ' + CASES.length + ' 组负控制全部成立');
process.exit(0);
