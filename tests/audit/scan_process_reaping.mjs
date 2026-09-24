// 审计基建 AV（v3.206.0）：测试侧子进程**统一回收** —— 防孙进程泄漏
// ------------------------------------------------------------
// 为什么存在：
//   v3.205.0 把「并行偶发假红」的真根因之一定为**孙进程泄漏**（自劣化正反馈）：
//   超时只 `child.kill('SIGKILL')` 杀直接子进程，孙进程被孤儿化（PPID→1）继续吃 CPU，
//   于是「偶发超时 → 残留孤儿 → 抢 CPU → 更多超时」自己长大。
//   那一版把 tests/run.mjs 修好了（detached: true + 按进程组 kill(-pid)），
//   但测试侧还有**第二处**同一形态的实现 —— v3159 的 spawnOne，当时漏掉。
//   实测（本仓沙箱，人为制造超时）旧形态留下 1 个存活孙进程（PPID=1），
//   改 detached + 进程组收割后为 0 个。
//   这类缺陷的形态是「同一根因散在多处，修了跑批就以为修完了」，所以此处把它
//   从「当时手查一遍」升级为**常驻门禁**：谁再写一个裸 spawn，这里当场红。
//
// 判据（全部版本无关，发版时无需修改本脚本）：
//   R1 独立进程组：使用**异步 spawn** 的文件必须 `detached: true`
//      —— 否则超时/中途收尾时孙进程会被孤儿化（本次实测的泄漏形态）。
//   R2 进程组收割：同一批文件必须出现 `process.kill(-`（按进程组杀）
//      —— 只杀直接子进程对孙进程无效。
//   R3 探测器非空转：扫描面必须真的包含使用异步 spawn 的文件，且 R1/R2 的
//      结构标记在扫描面上至少各出现一次；否则本脚本**不是通过而是失效**（exit 2）。
//      「0 命中 ⇒ 全绿」是审计基建史上反复出现的假绿形态（见 scan_resilience 的 0 段、
//      scan_config_liveness 的 MIN_UI_KEYS），故这里把空转写成结构漂移。
//
// 判据面口径（为什么只看结构、不做行为）：
//   真实 audit 脚本派出的孙进程都是短命的 `node --check`（毫秒级），
//   把超时压到 1.2s / 2.6s 实测两版**都观测不到 e2e 泄漏** —— 即这条不变量的可观测性
//   依赖「孙进程比父进程活得久」的时序，做成行为断言会变成偶发假红本身。
//   故判据落在结构面（detached + 进程组收割），泄漏本身由本文件的负控制证明承重：
//   拆掉任一个标记，判据必须翻红（见 tests/v3206_process_reaping.test.mjs）。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（探测器失效）
import fs from 'fs';
import path from 'node:path';
import { stripComments } from '../_audit_lib.mjs';

const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const TESTS = path.join(ROOT, 'tests');
const RUN_REL = 'tests/run.mjs';

if (!fs.existsSync(TESTS)) {
    console.error('[process-reaping] 找不到 tests/（ROOT=' + ROOT + '）——结构漂移');
    process.exit(2);
}
if (!fs.existsSync(path.join(ROOT, RUN_REL))) {
    console.error('[process-reaping] 找不到 ' + RUN_REL + ' ——结构漂移');
    process.exit(2);
}

/* 扫描面：tests/ 下的跑批与用例（跳过 archived —— 退役面另有 P5b 冻结判据守着）。 */
function collect(dir, out) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'archived' || e.name === 'node_modules') continue;
            collect(p, out);
        } else if (/\.m?js$/.test(e.name)) {
            out.push(p);
        }
    }
    return out;
}
const files = collect(TESTS, []);

/* 剥掉字符串字面量的**内容**（保留引号、换行与偏移），只判真正的代码。
 *   为什么必须有：测试文件里常把 spawn 形态写成夹具**字符串**
 *   （本仓 v3206 的负控制就是这么写的），只剥注释会把夹具文本当成真代码，
 *   于是「写入夹具字符串的文件」被误判成「使用 spawn 的文件」——
 *   既有假阳性（要求它也得有 detached），又让「空转」负控制永远无法成立。
 *   注意：此处**不是**重写 _audit_lib 的 4 个助手（stripComments/codeLines/
 *   bodyOf/braceMatch），而是本判据专用的最小词法处理，故不走唯一真源。 */
function blankStrings(code) {
    const out = code.split('');
    let q = null;
    for (let i = 0; i < code.length; i++) {
        const c = code[i];
        if (q) {
            if (c === '\\') { out[i] = ' '; i++; if (i < code.length) out[i] = ' '; continue; }
            if (c === q) { q = null; continue; }
            if (c !== '\n') out[i] = ' ';
        } else if (c === '"' || c === "'" || c === '`') {
            q = c;
        } else if (c === '/' && code[i + 1] === '/') {
            while (i < code.length && code[i] !== '\n') { out[i] = ' '; i++; }
        }
    }
    return out.join('');
}

/* `spawn(` 异步形态；`spawnSync(` 不在判定范围（同步、无孤儿问题）。 */
const ASYNC_SPAWN = /(^|[^A-Za-z0-9_$.])spawn\s*\(/;
const DETACHED = /detached\s*:\s*true/;
const GROUP_KILL = /process\.kill\(\s*-/;

const problems = [];
const spawners = [];
let seenDetached = 0;
let seenGroupKill = 0;

for (const p of files) {
    const raw = fs.readFileSync(p, 'utf8');
    const code = blankStrings(stripComments(raw));
    if (!ASYNC_SPAWN.test(code)) continue;
    const rel = path.relative(ROOT, p);
    spawners.push(rel);
    const hasDetached = DETACHED.test(code);
    const hasGroupKill = GROUP_KILL.test(code);
    if (hasDetached) seenDetached++;
    if (hasGroupKill) seenGroupKill++;
    if (!hasDetached) {
        problems.push('R1 独立进程组缺失（超时会孤儿化孙进程，留下吃 CPU 的残留）：' + rel);
    }
    if (!hasGroupKill) {
        problems.push('R2 进程组收割缺失（只杀直接子进程对孙进程无效）：' + rel);
    }
}

/* ── R3 探测器非空转 ──
 * 注意顺序：空转（结构漂移）与缺陷（退出 1）分开报。扫描面为 0 时，
 * R1/R2 会「全部通过」，所以必须先判空转，否则本脚本变成恒绿。 */
if (spawners.length === 0) {
    console.error('[process-reaping] 扫描面无任何文件使用异步 spawn（' + files.length
        + ' 文件），判据不具证明力 —— 结构漂移');
    process.exit(2);
}
if (!files.some((p) => path.relative(ROOT, p) === RUN_REL)) {
    console.error('[process-reaping] 扫描面不含 ' + RUN_REL + ' ——结构漂移');
    process.exit(2);
}
if (seenDetached === 0 || seenGroupKill === 0) {
    console.error('[process-reaping] 判据标记在扫描面零命中（detached ' + seenDetached
        + ' / 进程组收割 ' + seenGroupKill + '）——探测器失效，拒绝给结论（exit 2）');
    process.exit(2);
}

console.log('=== 测试侧子进程回收：扫描面 ' + files.length + ' 文件 / 使用异步 spawn ' + spawners.length
    + ' 个（' + spawners.join(', ') + '）/ 问题 ' + problems.length + ' ===');
if (problems.length) {
    for (const x of problems) console.log('  x ' + x);
    console.error('');
    console.error('[process-reaping] 发现 ' + problems.length + ' 处：' + problems.join('；'));
    console.error('  修法：子进程放独立进程组（detached: true），并在超时 / close / error');
    console.error('  三条路径都按进程组收割（process.kill(-child.pid, SIGKILL)）。');
    console.error('  形态与 tests/run.mjs 的 killGroup 一致 —— 两处必须同形。');
    process.exit(1);
}
console.log('[process-reaping] 通过：异步 spawn 一律独立进程组 + 进程组收割，无孤儿泄漏面。');
process.exit(0);
