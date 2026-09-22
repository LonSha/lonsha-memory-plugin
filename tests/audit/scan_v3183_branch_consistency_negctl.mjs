// 审计基建（v3.183）负控制：证明 scan_v3183_branch_consistency.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 统一用「真源码破坏 → 独立 fixture 目录 → 在副本上重跑同一套真判据」。
// 排除三种假绿：①对原文件断言 ②破坏写死成模拟常量 ③破坏把判据自己删了。
//
// 纪律（v3.176 之后统一口径）：
//   · 每次破坏只搬判据真正读的文件（三模块 + index.js + manifest.json）
//   · 锚点必须恰中期望次数，不符即该组作废
//   · 破坏后先 node --check（JS 文件）：非零退出必须来自判据，而不是解析崩溃
// 退出码：0=负控制成立  1=负控制失效  2=结构漂移
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN = path.join(HERE, 'scan_v3183_branch_consistency.mjs');
if (!fs.existsSync(SCAN)) {
    console.error('[branch-consistency-negctl] 找不到判据脚本 ' + SCAN + '（结构漂移）');
    process.exit(2);
}
const SP = 'summary-provenance.js';
const BG = 'branch-guard.js';
const XL = 'crosslink.js';
const IDX = 'index.js';
const MF = 'manifest.json';
const COPY = [SP, BG, XL, IDX, MF];

// 每组都带「期望缺陷归因」（第 8 个元素）：只验退出码是不够的——
//   破坏可能因为**另一条无关缺陷**而翻红，那样这组负控制对它声称的规则是空转的。
//   故要求判据的缺陷输出里必须出现该条规则的归因串（R1/R2/... 会出现在缺陷行里）。
// (名字, 目标文件|null, 锚点, 替换为, 期望命中数, 期望退出码, 说明, 期望归因)
const CASES = [
    ['N0-原版对照', null, null, null, null, 0,
        '不破坏：同 fixture 机制下必须 exit 0（否则后续翻红不可归因）', null],

    ['N1-manifest 漏登记 crosslink', MF,
        '"crosslink.js"', '"crosslink-disabled.js"',
        1, 1,
        '模块未登记 → _moduleLib 永远拿不到，R2 必须翻红', 'R2 manifest.extra_js 未登记 crosslink.js'],

    ['N2-删掉召回过滤调用', IDX,
        'const r = PV.filterForRecall(results.summary, _chat);',
        'const r = { kept: results.summary, counts: {}, dropped: [] };',
        1, 1,
        '过滤变成空转（结果照旧注入），R2 必须翻红', 'R2 宿主未调用：召回过滤 filterForRecall'],

    ['N3-过滤结果不回写', IDX,
        'results.summary = r.kept;', 'void r.kept;',
        1, 1,
        '过滤了但不回写 = 一条都没滤掉，R3 必须翻红', 'R3 过滤结果没有回写'],

    ['N4-放宽成什么都剔', SP,
        "const RECALL_DROP_STATUS = ['source_changed'];",
        "const RECALL_DROP_STATUS = ['source_changed', 'source_missing', 'no_provenance'];",
        1, 1,
        '把缺源/旧档也划进剔除集合，R4 的行为判据必须翻红', 'R4 默认剔除集合必须恰为 [source_changed]'],

    ['N5-守卫改成判不了就拦', BG,
        "return { accept: true, judged: false, reason: 'no-signature', current };",
        "return { accept: false, judged: true, reason: 'no-signature', current };",
        1, 1,
        '「判不了就放行」被反转 → 首次提取全被拦，R5 必须翻红', 'R5 「判不了」没有放行'],

    // 破坏「入口整体消失」：必须把该名字的**全部**出现点一起抹掉
    //   （定义 1 + selfCheck 调用 1 + errLog 标签 1 + 注释 2 = 5）。
    //   只改定义处是假破坏：调用文本与 errLog 标签仍带着名字，名字判据照样命中；
    //   只改 `()` 两处也是假破坏：errLog 标签还在（这正是本组第一次跑出来的真实差别）。
    ['N6-删掉诊断入口（全名抹除）', IDX,
        '_branchGuardLine', '_branchGuardDiagRenamed',
        5, 1,
        '入口彻底消失 → 名字判据与调用点判据都必须翻红', 'R6 缺诊断入口：分支守护读数'],

    // 入口还在、只是没人念 —— 本仓式失效（函数写好了、零调用点），必须与「入口消失」分开验。
    ['N6b-摘掉 selfCheck 内的调用点', IDX,
        'this._crosslinkLine()', "'—'",
        1, 1,
        '入口还在但 selfCheck 不再念它 → 用户侧不可见，R6 必须翻红',
        '_crosslinkLine 在 selfCheck 内无调用点'],

    // 诊断行有**两个** '['键', 出现点（正常返回 + catch 返回），两处都要改才算这行改名。
    ['N6c-诊断行键被改名', IDX,
        "['摘要来源', ", "['来源溯源（改名）', ",
        2, 1,
        '行键改名 = 诊断行不再是「摘要来源」这条，R6 的列表成员判定必须翻红',
        '诊断行「摘要来源」未进入 selfCheck 子系统列表'],
];

function runCase(c) {
    const [name, file, anchor, replacement, expectHits, expectExit, note, expectReason] = c;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-neg-'));
    try {
        for (const f of COPY) {
            const from = path.join(REPO, f);
            if (fs.existsSync(from)) fs.copyFileSync(from, path.join(dir, f));
        }
        if (file) {
            const fp = path.join(dir, file);
            const src = fs.readFileSync(fp, 'utf8');
            const hits = src.split(anchor).length - 1;
            // 期望命中 0 次时该组无破坏力，直接作废（防「锚点已被改动、负控制静默空转」）。
            if (expectHits === 0) {
                return { name, ok: false, why: 'witness 组：锚点命中 0 次（该组无破坏力，仅记录）', witness: true };
            }
            if (hits !== expectHits) {
                return { name, ok: false, why: '锚点命中 ' + hits + ' 次（期望 ' + expectHits + '），该组作废' };
            }
            fs.writeFileSync(fp, src.split(anchor).join(replacement));
            if (file.endsWith('.js')) {
                const chk = spawnSync(process.execPath, ['--check', fp], { encoding: 'utf8' });
                if (chk.status !== 0) {
                    return { name, ok: false, why: '破坏后解析失败（退出码不可归因于判据）：' + (chk.stderr || '').slice(0, 200) };
                }
            }
        }
        const r = spawnSync(process.execPath, [SCAN], {
            encoding: 'utf8', cwd: REPO,
            env: { ...process.env, LONSHA_AUDIT_ROOT: dir }
        });
        const out = (r.stdout || '') + (r.stderr || '');
        if (r.status !== expectExit) {
            return { name, ok: false, why: '期望 exit ' + expectExit + ' 实得 ' + r.status + '\n' + out.slice(0, 400) };
        }
        // 归因校验（第 8 个元素）：破坏必须**因为这条规则**翻红。
        //   只验退出码会放过「破坏因另一条无关缺陷翻红」——那对本组声称的规则是空转的假绿。
        if (expectReason) {
            if (!out.includes(expectReason)) {
                return { name, ok: false, why: '判据翻红了但没有本组声称的归因「' + expectReason + '」（可能因无关缺陷翻红，本组空转）\n' + out.slice(0, 600) };
            }
            // 反向：原版对照不得出现该归因串（防判据恒报——恒报等于这条判据没在区分）。
            return { name, ok: true };
        }
        return { name, ok: true };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}

// 归因探针的另一半：先跑一次原版，确认**所有**期望归因串在卫生状态下都不出现。
//   否则「归因串出现」这个判据本身恒真，上面的归因校验就成了空转。
{
    const r0 = spawnSync(process.execPath, [SCAN], { encoding: 'utf8', cwd: REPO });
    const out0 = (r0.stdout || '') + (r0.stderr || '');
    const reasons = CASES.map(c => c[7]).filter(Boolean);
    const leaked = reasons.filter(x => out0.includes(x));
    if (r0.status !== 0 || leaked.length) {
        console.error('[branch-consistency-negctl] 卫生态下判据不干净（exit=' + r0.status + '，恒报归因：' + leaked.join(' | ') + '）');
        process.exit(2);
    }
}

// N7 的说明：它验的是「锚点必须真实存在」——若 _provRecallFilter 已被改名/删除，
// 说明判据本身要么已失效、要么已被别的机制取代，此时负控制必须拒绝给出绿灯。
// 为避免把这条「反证」和上面七组混在一起统计，单独跑一次并解释。
const results = [];
// 从 N1 起跑（N0 是「原版对照」，其职责已被上面的卫生态探针更严格地承担：exit 0 且零归因串泄漏）。
for (const c of CASES.slice(1)) {
    const r = runCase(c);
    results.push(r);
    console.log((r.ok ? '  ok ' : '  FAIL ') + r.name + (r.why ? ' — ' + r.why : ''));
}
// witness 组：单独判定「锚点是否存在」，不作破坏。
{
    const src = fs.readFileSync(path.join(REPO, IDX), 'utf8');
    const hits = src.split('_provRecallFilter').length - 1;
    const okW = hits > 0;
    console.log((okW ? '  ok ' : '  FAIL ') + 'N7-读数锚点存在性（witness）' + (okW ? '' : ' — 锚点 0 次，判据与源码已脱节'));
    results.push({ name: 'N7', ok: okW });
}

const failed = results.filter(r => !r.ok).length;
if (failed) {
    console.error('[branch-consistency-negctl] ' + failed + '/' + results.length + ' 组失效');
    process.exit(1);
}
console.log('[branch-consistency-negctl] ' + results.length + ' 组负控制全部成立');