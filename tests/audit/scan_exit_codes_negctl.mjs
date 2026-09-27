// 审计基建 R 的**负控制**（v3.247.0）：证明 scan_exit_codes.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 为什么单独成档：一条判据「跑绿了」只说明它没报警，不说明它**会**报警。判据恒绿有三种伪装：
//   ① 对原文件断言 —— 破坏没发生也绿；
//   ② 把破坏写死成模拟常量 —— 真判据根本没被调用；
//   ③ 破坏把判据自己删了 —— 自我指涉。
// 本档统一用「真源码破坏 → 独立 fixture 树 → 在副本上重跑同一套真判据」排除这三种。
//
// 纪律（同仓各负控制）：
//   · 每次破坏发生在**独立 fixture 目录**里，LONSHA_EXITCODES_ROOT 指过去 ⇒ 源仓库零污染；
//   · 锚点必须**恰中期望次数**，命中数不符即整组作废并报错（防锚点漂移后静默跳过）；
//   · 破坏后先 `node --check`：非零退出必须来自判据，而不是解析崩溃；
//   · 只断言「退出码对」不够 —— exit 1 也可能来自另一条判据（那样归因是错的），
//     故每组另断言**缺陷点名**（marker 必须出现在输出里），即「红得对，不是红得巧」。
//
// 夹具：本门禁要的是「一个足够大的 tests/audit」（活性面下限 40），故夹具树**整树复制**
//   tests/audit（不是逐文件选搬 —— 少一个就会在活性面上提前 bail，而那个 exit 2 会被
//   静默读成「结构漂移判据工作正常」，空对空。这条教训本仓 v3.245.0 刚立过常驻门禁）。
// 退出码：0 = 卫生（各组负控制全部成立）  1 = 真缺陷（有组不成立）  2 = 结构漂移（门禁或真源不可用，负控制无法建立）
// [v3.247.0 留痕] 上一版把这三态写成**两行**（第一行只有 `退出码（…）：`），
//   而读取口径 `DECL_RE` 只取同一行 ⇒ 门禁把本档判成「自述缺 0/1/2」。
//   「写入口径与读取口径不同源」是本次已修过一遍的形态（补丁 C），这次栽在新写的文件上。
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN_REL = path.join('tests', 'audit', 'scan_exit_codes.mjs');
const GATE = path.join(REPO, SCAN_REL);
const LIB_REL = path.join('tests', '_exit_codes.mjs');
const AUDIT_REL = 'tests/audit';
const UB_REL = path.join('tests', '_audit_lib.mjs');
/* 门禁的**运行时依赖**（真源自己还 import `_audit_lib.mjs` 的 stripComments）。
 *   清单按**加载图**列，不按「本次新加的那个 import」列（v3.246.0 栽过这条）。 */
const DEPS = [LIB_REL, UB_REL];
if (!fs.existsSync(GATE)) {
    console.error('[exit-negctl] 缺门禁 ' + SCAN_REL + ' —— 结构漂移（负控制无法建立）');
    process.exit(2);
}
for (const d of DEPS) {
    if (!fs.existsSync(path.join(REPO, d))) {
        console.error('[exit-negctl] 缺运行时依赖 ' + d + ' —— 结构漂移（负控制无法建立）');
        process.exit(2);
    }
}
const scanSrc = fs.readFileSync(GATE, 'utf-8');
/* 自证：门禁必须真的把「能到/自述」两侧都判了，否则本档测的是别的东西 */
for (const fp of ['declaredCodes', 'reachableCodes', 'shouldFail', 'LONSHA_EXITCODES_ROOT']) {
    if (!scanSrc.includes(fp)) {
        console.error('[exit-negctl] 门禁源码缺指纹 ' + fp + ' —— 结构漂移（负控制测的不是那件事）');
        process.exit(2);
    }
}

// (名字, 目标相对路径, 锚点, 替换为, 期望命中数, 期望退出码, 期望点名, 说明)
const CASES = [
    ['V0-原版对照', null, null, null, null, 0,
        '通过：三态可达',
        '不破坏：同 fixture 机制下必须 exit 0（否则后面所有「翻红」都不可归因）'],
    /* [v3.247.0] 本组破坏的是**样本脚本**（不是门禁自己）：
     *   首版把锚点打在本门禁收尾的 `process.exit(shouldFail({kind:'defect'}))` 上 —— 那改的是
     *   门禁的**失败出口**，C1（样本归因面）根本没被触发，期望点名自然缺席。
     *   教训：破坏要点在**判据的检查对象**上，不是点在自己身上。 */
    ['V1-归因混码（样本 defect 写成 drift）', path.join(AUDIT_REL, 'scan_resilience.mjs'),
        "process.exit(shouldFail({ kind: 'defect' }));", "process.exit(shouldFail({ kind: 'drift' }));", 1, 1,
        'scan_resilience.mjs 的探测器失效路径未按 defect 归因',
        '样本脚本把「探测器零命中」改报成 drift ⇒ C1（归因面）必须点名 —— 这正是「同码不可解释」那条的守门人'],
    ['V2-自述漏态（样本脚本自述少一码）', path.join(AUDIT_REL, 'scan_resilience.mjs'),
        '1 = 真缺陷', '一 = 真缺陷', 1, 1,
        '能到达 exit 1 但自述里没写',
        '真源码破坏：把样本脚本自述里的数字 **1** 换成汉字（那一码不再被认出）\n'
            + '    注意：只改标签文字（如「真缺陷」→「真_缺陷」）时数字仍在 ⇒ 判据**不该**响；\n'
            + '    本组破坏的是数字本身，才该响 —— 这区分了「判据过严」与「判据该响」'],
    ['V3-样本脚本被删（归因面失去对象）', 'DELETE', path.join(AUDIT_REL, 'scan_resilience.mjs'), null, null, 2,
        '归因面的样本缺席',
        '样本脚本被删 ⇒ C 段失去对象，必须 exit 2（结构漂移），而不是「通过」'],
    /* [v3.247.0] 首版把函数体改成恒返回 —— 它**仍是 function**，导出面（typeof）照样过，
     *   红的是 A2「归因函数与表同源」，与期望点名不符。教训：要测导出面，
     *   破坏必须落在**导出这一行为**上（去掉 export），不是落在语义上。 */
    ['V4-真源缺导出', LIB_REL, 'export function shouldFail(finding) {', 'function shouldFail(finding) {', 1, 2,
        '唯一真源缺导出 shouldFail',
        '去掉 export ⇒ 门禁导出面核对必须如实 exit 2（结构漂移），而不是带着坏真源给结论'],
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exit-negctl-'));
const problems = [];
const rows = [];
for (const [name, target, anchor, repl, expectHits, expectCode, marker, why] of CASES) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    /* 整树复制 tests/audit（活性面下限要求足够多的脚本） */
    fs.cpSync(path.join(REPO, AUDIT_REL), path.join(dir, AUDIT_REL), { recursive: true });
    for (const rel of DEPS) {
        const dest = path.join(dir, rel);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(REPO, rel), dest);
    }
    if (target === 'DELETE') {
        fs.rmSync(path.join(dir, anchor));
    } else if (target) {
        const p = path.join(dir, target);
        let src = fs.readFileSync(p, 'utf-8');
        const hits = src.split(anchor).length - 1;
        if (hits !== expectHits) {
            problems.push(name + '：锚点在 ' + target + ' 命中 ' + hits + ' 次（期望 ' + expectHits + '）—— 锚点已漂移，本组作废');
            rows.push([name, '-', '锚点漂移 ' + hits + '/' + expectHits, why]);
            continue;
        }
        src = src.split(anchor).join(repl);
        fs.writeFileSync(p, src);
        const chk = spawnSync('node', ['--check', p], { encoding: 'utf-8' });
        if (chk.status !== 0) {
            problems.push(name + '：破坏后 ' + target + ' 无法解析（归因不成立）' + (chk.stderr || '').slice(0, 200));
            rows.push([name, '-', '解析崩溃', why]);
            continue;
        }
    }
    const env = { ...process.env, LONSHA_EXITCODES_ROOT: dir };
    const r = spawnSync('node', [path.join(dir, SCAN_REL)], { encoding: 'utf-8', env });
    const code = r.status;
    const out = (r.stdout || '') + (r.stderr || '');
    const codeOk = code === expectCode;
    const namedOk = marker == null ? true : out.includes(marker);
    const ok = codeOk && namedOk;
    if (!ok) {
        problems.push(name + '：期望 exit ' + expectCode + ' + 点名「' + marker + '」，实得 exit ' + code
            + (namedOk ? '' : '（点名缺失）')
            + '\n    ' + why
            + '\n    stdout: ' + (r.stdout || '').trim().slice(0, 400)
            + '\n    stderr: ' + (r.stderr || '').trim().slice(0, 400));
    }
    rows.push([name, String(code), (ok ? 'ok' : 'BAD(期望 ' + expectCode + (namedOk ? '' : '+点名') + ')'), why]);
}
console.log('=== 退出码归因面 · 负控制 ===');
for (const [n, c, s, w] of rows) console.log('  ' + n.padEnd(34) + ' exit ' + c.padEnd(4) + s.padEnd(20) + w);
try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响结论 */ }

if (problems.length) {
    console.error('');
    for (const p of problems) console.error('[exit-negctl] ' + p);
    console.error('');
    console.error('[exit-negctl] 失败：负控制不成立（判据恒绿 / 破坏不可归因 / 锚点漂移）。');
    process.exit(1);
}
console.log('[exit-negctl] 通过：真源码破坏逐组翻红且点名正确，结构漂移 exit 2，原版对照 exit 0。');
process.exit(0);