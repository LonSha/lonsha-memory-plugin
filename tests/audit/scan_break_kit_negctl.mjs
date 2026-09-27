// tests/audit/scan_break_kit_negctl.mjs
// [v3.247.0] scan_break_kit.mjs 的**配对负控制**（夹具同步面 E4 要求的外部观测点）。
// ------------------------------------------------------------
// 【为什么必须由外部来观测，而不是复用门禁自带的 E 段自证】
//   实测过这一形：把 scan_break_kit.mjs 的整段 E 自证删掉，门禁**照样 exit 0 且打印
//   「7 组自证全绿」** —— 内部自证发现不了「自证段被整体摘除」。
//   这正是 fixture-sync 的 E4 存在的理由（原话：门禁的判据恒绿与否，必须有人在观测）。
//   故本文件不是「为了让体检表安静」，它观测的正是那件事。
//
// 【夹具形态：整仓镜像（实测 1.18s / 10.4MB）】
//   · 被观测门禁递归读整个 tests/ 面（接收方 29 / 判据点 28 都由目录真值点出）；
//     只搬它源码里出现的 2 个文件名（tests/_break_kit.mjs、tests/run.mjs）会让接收方面
//     塌到下限以下 ⇒ 门禁 exit 2（结构漂移），而那个 2 会被本档读成
//     「门禁的 fail-closed 判据工作正常」——**空对空**。
//   · 故走整仓镜像，并已在唯一真源 tests/_fixture_sync.mjs 的 `MIRROR_GATES` 登记理由；
//     scan_fixture_sync.mjs 的 E2 对登记形态改判**行为**（真跑探针，门禁必须 exit 0），
//     本档的 V0 组就是那条探针在两向自证中的对应物。
//   · 本文件会被复制进镜像的 tests/audit/ 下，于是门禁的 C1/C2（「不得本地重写破坏工具」
//     「调用点必须 import 真源」）会在**本文件自己**身上命中 —— 这是设计使然：
//     观测器本来就必须自带一份破坏实现（否则它无法破坏被测物）。
//     scan_break_kit.mjs 的 C 段因此把本文件排除在扫描面之外并登记了理由。
//
// 【纪律（与本仓其余负控制同形）】
//   · 每次破坏只发生在**独立镜像**里，源仓零污染；
//   · 锚点必须**恰中期望次数**，命中数不符即整组作废并报错（防锚点漂移后静默跳过）；
//   · 破坏后先 `node --check`：非零退出必须来自判据，而不是解析崩溃；
//   · 只断言「退出码对」不够 —— exit 2 也可能来自另一条判据，故每组另断言**点名**
//     （marker 必须出现在输出里），即「红得对，不是红得巧」；
//   · 必须有 V0 原版对照：只验破坏翻红而不验原版绿，会把「破坏写死成模拟常量」判成绿。
//
// 退出码：0 = 卫生（各组负控制全部成立）  1 = 真缺陷（有组不成立）  2 = 结构漂移（门禁或真源不可用）
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const GATE_REL = path.join('tests', 'audit', 'scan_break_kit.mjs');
const KIT_REL = path.join('tests', '_break_kit.mjs');
const GATE = path.join(REPO, GATE_REL);
if (!fs.existsSync(GATE)) {
    console.error('[break-kit-negctl] 缺门禁 ' + GATE_REL + ' —— 结构漂移（负控制无法建立）');
    process.exit(2);
}
if (!fs.existsSync(path.join(REPO, KIT_REL))) {
    console.error('[break-kit-negctl] 缺唯一真源 ' + KIT_REL + ' —— 结构漂移（负控制无法建立）');
    process.exit(2);
}
/* 自证：门禁必须真的把「导出面 / 同一性 / 活性面 / 自证机构」都判了，否则本档测的是别的东西。
 *   指纹取自门禁源码里的**结构常量名**（不是措辞）：措辞会随版本改，结构常量不会。 */
const gateSrc = fs.readFileSync(GATE, 'utf-8');
for (const fp of ['KIT_API', 'NOT_SCOPE', 'MIN_RECEIVERS', 'MIN_DEFECT_SITES',
    'LONSHA_BREAK_KIT_HOME', 'makeBrokenRoot', 'NEGCTL_REL']) {
    if (!gateSrc.includes(fp)) {
        console.error('[break-kit-negctl] 门禁源码缺指纹 ' + fp + ' —— 结构漂移（负控制测的不是那件事）');
        process.exit(2);
    }
}

/** 造一份整仓镜像（实测 1.18s / 10.4MB）。 */
function mirror() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'breakkit-negctl-'));
    fs.cpSync(REPO, dir, {
        recursive: true,
        filter: (p) => !/(^|\/)(\.git|node_modules)(\/|$)/.test(p),
    });
    return dir;
}
function runGate(cwd) {
    const r = spawnSync(process.execPath, [GATE_REL], {
        cwd, encoding: 'utf-8', timeout: 600000,
        env: Object.assign({}, process.env, { LONSHA_BREAK_KIT_HOME: cwd }),
    });
    return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
/* (名字, 目标相对路径, 锚点, 替换为, 期望命中数, 期望退出码, 期望点名, 说明)
 *   锚点全部打在**真源**（被测物）上，不在门禁自己身上 ——
 *   破坏要点在判据的检查对象上，不是点在自己身上（v3.247.0 前半段实测过这条教训：
 *   把锚点打在门禁的收尾出口上，改的是「失败出口」，被期望的那条判据根本没被触发）。 */
const CASES = [
    ['V0-原版对照', null, null, null, null, 0, '通过：破坏形态收敛到唯一真源',
        '不破坏：同一夹具机制下必须 exit 0（否则后面所有「翻红」都不可归因）'],
    ['V1-别名各长各的（同一性失守）', KIT_REL,
        'export const breakText = breakOnce;',
        'export const breakText = (s, a, r, l) => breakOnce(s, a, r, l);', 1, 2, '不是同一函数对象',
        '别名各写一份 = 仍是多份实现（收编退回原形）：A 段同一性判据必须如实 exit 2'],
    ['V2-导出面缺项（判据函数被摘成私有）', KIT_REL,
        'export function assertSingleHit(src, anchor, label) {',
        'function assertSingleHit(src, anchor, label) {', 1, 2, '唯一真源缺导出',
        '去掉 export ⇒ 门禁导出面核对必须如实 exit 2（结构漂移），而不是带着坏真源给结论'],
    ['V3-同值替换检查被摘（口径② 失守）', KIT_REL,
        'if (out === s) throwMsg(sameValueMessage(label, anchor));',
        'if (false) throwMsg(sameValueMessage(label, anchor));', 1, 1, 'B2 同值替换',
        '口径② 被摘后「同值替换必须拒绝」当场失效：真源**就是被检物**，故归因是 exit 1（真缺陷），'
        + '不是 exit 2（结构漂移）—— 这一组的价值正是钉住「改的是谁、该报哪一档」'],
    ['V4-出口被摘（活性面塌陷）', KIT_REL,
        'export const breakSource = breakOnce;',
        'const breakSource = breakOnce;', 1, 2, '唯一真源缺导出',
        '主出口消失 ⇒ 接收方全数失配：门禁不得报「通过」，须如实说清探测对象不在'],
];
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'breakkit-negctl-run-'));
const problems = [];
const rows = [];
for (const [name, target, anchor, repl, expectHits, expectCode, marker, why] of CASES) {
    let work = null;
    try {
        work = mirror();
        if (target) {
            const p = path.join(work, target);
            let src = fs.readFileSync(p, 'utf-8');
            const hits = src.split(anchor).length - 1;
            if (hits !== expectHits) {
                problems.push(name + '：锚点在 ' + target + ' 命中 ' + hits + ' 次（期望 ' + expectHits
                    + '）—— 锚点已漂移，本组作废');
                rows.push([name, '-', '锚点漂移 ' + hits + '/' + expectHits, why]);
                continue;
            }
            src = src.split(anchor).join(repl);
            fs.writeFileSync(p, src);
            const chk = spawnSync(process.execPath, ['--check', p], { encoding: 'utf-8' });
            if (chk.status !== 0) {
                problems.push(name + '：破坏后 ' + target + ' 无法解析（归因不成立）'
                    + (chk.stderr || '').slice(0, 200));
                rows.push([name, '-', '解析崩溃', why]);
                continue;
            }
        }
        const r = runGate(work);
        const codeOk = r.status === expectCode;
        const namedOk = marker == null ? true : r.out.includes(marker);
        const ok = codeOk && namedOk;
        if (!ok) {
            problems.push(name + '：期望 exit ' + expectCode + ' + 点名「' + marker + '」，实得 exit ' + r.status
                + (namedOk ? '' : '（点名缺失）')
                + '\n    ' + why
                + '\n    stdout: ' + (r.out || '').trim().slice(0, 400));
        }
        rows.push([name, String(r.status), (ok ? 'ok' : 'BAD(期望 ' + expectCode + (namedOk ? '' : '+点名') + ')'), why]);
    } catch (e) {
        problems.push(name + '：夹具异常 ' + e.message);
        rows.push([name, '-', '夹具异常', why]);
    } finally {
        if (work) fs.rmSync(work, { recursive: true, force: true });
    }
}
console.log('=== 破坏形态库真源 · 负控制（外部观测点） ===');
for (const [n, c, s, w] of rows) {
    console.log('  ' + n.padEnd(34) + ' exit ' + String(c).padEnd(4) + s.padEnd(20) + w.slice(0, 56));
}
try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响结论 */ }

if (problems.length) {
    console.error('');
    for (const p of problems) console.error('[break-kit-negctl] ' + p);
    console.error('');
    console.error('[break-kit-negctl] 失败：负控制不成立（判据恒绿 / 破坏不可归因 / 锚点漂移）。');
    process.exit(1);
}
console.log('[break-kit-negctl] 通过：真源码破坏逐组翻红且点名正确，原版对照 exit 0。');
process.exit(0);