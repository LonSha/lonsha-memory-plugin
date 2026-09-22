// 审计基建（v3.190）负控制：证明 scan_v3190_lifecycle_collapse.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 统一用「真源码破坏 → 独立 fixture 目录 → 在副本上重跑同一套真判据」。
// 本文件针对「调用可达性 + 位移次数」类判据，故破坏必须落在可观测地改变行为的位置上。
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
const SCAN = path.join(HERE, 'scan_v3190_lifecycle_collapse.mjs');
if (!fs.existsSync(SCAN)) {
    console.error('[lifecycle-collapse-negctl] 找不到判据脚本 ' + SCAN + '（结构漂移）');
    process.exit(2);
}
const LR = 'ledger-replay.js';
const IDX = 'index.js';
const MANUAL = "\n            for (const s of (this.summary?.summaries || [])) if (typeof s.floor === 'number' && s.floor > deleted) s.floor = s.floor - 1;";
// (名字, 目标文件|null, 锚点, 替换为, 期望命中数, 期望退出码, 说明)
const CASES = [
    ['N0-原版对照', null, null, null, null, 0,
        '不破坏：同 fixture 机制下必须 exit 0（否则后续翻红不可归因）'],
    ['A1-手工位移复活', IDX,
        'const _face = SHIFT_FACE_LABELS;',
        'const _face = SHIFT_FACE_LABELS;' + MANUAL,
        1, 1,
        '手抄位移回到 shiftFloorsFrom，P1 必须翻红（这正是 v3.182 的落地形态）'],
    ['A2-门控留痕抹掉', IDX,
        "skipped: 'floor-ledger-disabled'",
        "renamedTrace: 'floor-ledger-disabled'",
        1, 1,
        '「关掉账本」一态不再留痕，P2 必须翻红（与「跑了没账可撤」同形）'],
    ['A3-早退点抢到回放之前', IDX,
        'const _rep = (_lr && typeof _lr.replayDrop',
        'const _getEarly = this.ledger.get(floor);\n                    const _rep = (_lr && typeof _lr.replayDrop',
        1, 1,
        '账本记录缺失早退点抢到回放之前，P2 必须翻红（该分支下登记表成死声明）'],
    ['A4-登记项灭失', LR,
        "id: 'changeset', label: '\u884c\u7ea7\u53d8\u66f4\u96c6'",
        "id: 'changeset-renamed', label: '\u884c\u7ea7\u53d8\u66f4\u96c6'",
        1, 1,
        '四面之一改名消失，P3 必须翻红'],
    ['A5-位移减两次', LR,
        "for (const s of (h.summary?.summaries || [])) if (typeof s.floor === 'number' && s.floor > d) { s.floor--; n++; }",
        "for (const s of (h.summary?.summaries || [])) if (typeof s.floor === 'number' && s.floor > d) { s.floor -= 2; n++; }",
        1, 1,
        '位移多减一次，P1b 必须翻红（行为级判据的暴力验证；这是 v3.182 的真实缺陷形态）'],
];
function runCase(c) {
    const [name, file, anchor, replacement, expectHits, expectExit] = c;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-neg-'));
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
if (failed) { console.error('[lifecycle-collapse-negctl] ' + failed + '/' + CASES.length + ' 组失效'); process.exit(1); }
console.log('[lifecycle-collapse-negctl] ' + CASES.length + ' 组负控制全部成立');
process.exit(0);
