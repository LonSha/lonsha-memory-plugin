// 审计基建（v3.202）负控制：证明 scan_v3202_carryover_archive_diff.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 统一用「真源码破坏 → 独立 fixture 目录 → 在副本上重跑同一套真判据」。
// 纪律：
//   · 每次破坏只搬判据真正读的文件（index.js）
//   · 锚点必须恰中期望次数，不符即该组作废
//   · 破坏后先 node --check：非零退出必须来自判据，而不是解析崩溃
//   · 工具两向自证：锚点不存在/不唯一须抛；破坏须可观测改变行为；原版上同判据须真绿
// 退出码：0=负控制成立  1=负控制失效  2=结构漂移
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN = path.join(HERE, 'scan_v3202_carryover_archive_diff.mjs');
if (!fs.existsSync(SCAN)) {
    console.error('[carryover-archive-diff-negctl] 找不到判据脚本 ' + SCAN + '（结构漂移）');
    process.exit(2);
}
const IDX = 'index.js';

// 破坏用片段（由片段拼出，避免本文件被自身纯度判据误伤）
const K_WORLDPROG = 'worldProg';
const K_EXT = 'extensions';

// 锚点（每条都必须恰中 1 次；含完整理由注释才能定位到豁免表那一行，
//   光用 'lastSave', 会同时命中存档面/豁免面/别处共 3 处）
const A_REPAIR = "'repairLog',\n    ]);";
const A_LASTSAVE = "'lastSave',           // 保存地面真源（本机时间戳），跨对话无意义";
const A_EXT_LINE = "'extensions',         // 未知顶层键宽容回写出口（容器，非业务面）";
const A_EXT_TAIL = "'extensions',\n    ]);";
const A_LEDGER_LINE = "'ledger',             // 楼层账本：索引「该楼提取了什么」，新对话楼层重来";
const A_EXEMPT_HEAD = 'const CARRYOVER_EXEMPT_KEYS = Object.freeze([';
const A_ARCHIVE_HEAD = 'const ARCHIVE_TOP_LEVEL_KEYS = Object.freeze([';

// (名字, 锚点, 替换为, 期望命中数, 期望退出码, 说明)
const CASES = [
    ['N0-原版对照', null, null, null, 0,
        '不破坏：同 fixture 机制下必须 exit 0（否则后续翻红不可归因）'],
    ['A1-契约漏掉存档键（=v3.194 真实缺陷形态）', A_REPAIR, ']);', 1, 1,
        'P2 必须翻红：存档面有 repairLog、携带面无且未豁免——正是「声称已做、测试未覆盖、实际未做」'],
    ['A2-豁免项被删且未补进契约', A_LASTSAVE, '', 1, 1,
        'P2 必须翻红：豁免撤了、契约也没接，该键变成静默丢失（跨对话续写时留在旧对话）'],
    ['A3-只删理由留键（P3 专测）', A_LASTSAVE, "'lastSave',", 1, 1,
        'P3 必须翻红：豁免项没有行内理由，等同「没带」与「不该带」不可分的自我豁免'],
    ['A4-重写理由不改结论（保绿对照）', A_EXT_LINE, "'extensions',  // 容器型出口（非业务面）", 1, 0,
        '只换措辞不该改变结论——证明判据不是随便翻红（对照组必需）'],
    ['A5-存档面新增未登记键', A_EXT_TAIL, "'extensions',\n    'ghostKey',\n    ]);", 1, 1,
        '新增子系统忘登记契约/豁免的真实形态，P2 必须翻红'],
    ['A6-同键既带又豁免（P4 专测）', A_LEDGER_LINE,
        A_LEDGER_LINE + "\n        'summaries',         // 测试用重叠键", 1, 1,
        'P4 必须翻红：同一键既进契约又被豁免是自相矛盾，说明表被乱改'],
    ['A7-豁免表整表改名', A_EXEMPT_HEAD,
        'const CARRYOVER_EXEMPT_KEYS_DISABLED = Object.freeze([', 1, 2,
        '判据报结构漂移（exit 2），不得因抽不出表就静默放过'],
    ['A8-存档面常量消失', A_ARCHIVE_HEAD,
        'const ARCHIVE_TOP_LEVEL_KEYS_DISABLED = Object.freeze([', 1, 2,
        'P1 探测器失效必须 exit 2，不得降级为「无缺陷」而绿灯'],
];

function runCase(c) {
    const [name, anchor, replacement, expectHits, expectExit] = c;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cad-neg-'));
    try {
        fs.copyFileSync(path.join(REPO, IDX), path.join(dir, IDX));
        if (anchor) {
            const fp = path.join(dir, IDX);
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
            env: { ...process.env, LONSHA_AUDIT_ROOT: dir },
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

// 工具两向自证：锚点不存在须抛（不许静默通过）
function toolSelfCheck() {
    const src = fs.readFileSync(path.join(REPO, IDX), 'utf8');
    const bogus = 'ZZZ_NOT_IN_SOURCE_' + K_WORLDPROG;
    const hits = src.split(bogus).length - 1;
    if (hits !== 0) return '不存在的锚点竟命中 ' + hits + ' 次——锚点机制失效';
    if (!src.includes(K_EXT)) return '真源码里找不到 ' + K_EXT + '（锚点前提失效）';
    return null;
}

let failed = 0;
const sc = toolSelfCheck();
if (sc) { console.error('[carryover-archive-diff-negctl] 工具自证失败：' + sc); process.exit(1); }

for (const c of CASES) {
    const r = runCase(c);
    console.log((r.ok ? '  ok ' : '  FAIL ') + r.name + (r.why ? ' — ' + r.why : ''));
    if (!r.ok) failed++;
}
if (failed) { console.error('[carryover-archive-diff-negctl] ' + failed + '/' + CASES.length + ' 组失效'); process.exit(1); }
console.log('[carryover-archive-diff-negctl] ' + CASES.length + ' 组负控制全部成立');
process.exit(0);