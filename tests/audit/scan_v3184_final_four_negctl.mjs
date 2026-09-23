// 审计基建（v3.184）负控制：final_four 扫描的归因自证
// ------------------------------------------------------------
// 为什么必须有它：
//   只验「原版跑绿」是不够的——一个永远返回 0 的扫描器也是绿的。
//   本文件对扫描器的每一条归因**各造一次真源码破坏**，逐个确认：
//     ① 锚点在原文件里恰中 1 次（否则破坏位置不可复现，等于没破坏）
//     ② 破坏字节可观测（语法合法，行为真变）
//     ③ 扫描器**按本组声称的归因翻红**（不是「因别的缺陷翻红」——只验退出码会放过这种空转假绿）
//     ④ 破坏副本用完即还原（同名文件拷贝会让原版在被污染的环境里跑）
//
// 判定口径：破坏后退出码必须是 1（真缺陷），且 stderr 里出现本条归因串。
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';

const SRC = process.cwd();
const SCAN = path.join(SRC, 'tests/audit/scan_v3184_final_four.mjs');
const FILES = ['relation-disclosure.js', 'node-rollup.js', 'fuzzy-patch.js', 'changeset.js', 'index.js', 'settings-ui.js', 'manifest.json'];

let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  ✗ ' + m); };

// 结构漂移即 exit 2（本仓约定：tests/audit 下每个脚本都必须能阻断）。
//   负控制缺失依托时**不能静默通过**——没有被测扫描器时它证明不了任何事，
//   报 0 就等于「我给一个不存在的扫描器背书」。
if (!fs.existsSync(SCAN)) {
    console.error('[v3.184 负控制] 缺少被测扫描器 ' + path.relative(SRC, SCAN) + ' ⇒ 无法自证，结构漂移');
    process.exit(2);
}
for (const f of FILES) {
    if (!fs.existsSync(path.join(SRC, f))) {
        console.error('[v3.184 负控制] 缺少被测文件 ' + f + ' ⇒ 无法自证，结构漂移');
        process.exit(2);
    }
}

function snapshotDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-v3184-'));
    // [v3.191] 夹具必须镜像仓库布局：扫描器副本在 tests/audit/ 下，其 '../_audit_lib.mjs' 才能解析。
    fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
    fs.copyFileSync(path.join(SRC, 'tests', '_audit_lib.mjs'), path.join(dir, 'tests', '_audit_lib.mjs'));
    for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    return dir;
}
function runScan(dir) {
    try {
        const out = execFileSync('node', [SCAN], { env: { ...process.env, LONSHA_AUDIT_ROOT: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { code: 0, text: out };
    } catch (e) {
        return { code: e.status == null ? -1 : e.status, text: String(e.stdout || '') + String(e.stderr || '') };
    }
}
/** 在指定路径跑扫描器（破坏扫描器自身时用副本路径）。 */
function runScanAt(scanPath, dir) {
    try {
        const out = execFileSync('node', [scanPath], { env: { ...process.env, LONSHA_AUDIT_ROOT: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { code: 0, text: out };
    } catch (e) {
        return { code: e.status == null ? -1 : e.status, text: String(e.stdout || '') + String(e.stderr || '') };
    }
}
/** 破坏一个文件里恰中 1 次的锚点；返回是否成功。 */
function mutate(dir, file, anchor, repl) {
    const p = path.join(dir, file);
    const s = fs.readFileSync(p, 'utf8');
    const n = s.split(anchor).length - 1;
    if (n !== 1) { bad('锚点必须恰中 1 次（' + file + ' 中实为 ' + n + '）：' + anchor.slice(0, 60)); return false; }
    fs.writeFileSync(p, s.replace(anchor, repl));
    return true;
}

// 卫生态探针：原版必须绿，且不得出现任何归因串（否则「翻红」的判据是污染的）
const baseDir = snapshotDir();
const base = runScan(baseDir);
if (base.code !== 0) bad('原版必须绿，实为 exit=' + base.code + '：' + base.text.slice(0, 400));
else ok('原版绿（exit=0）');
const ATTR = ['R1 ', 'R2 ', 'R3 ', 'R4a', 'R4b', 'R4c', 'R4d', 'R5 ', 'R6 '];
for (const a of ATTR) if (base.text.includes(a)) bad('卫生态探针：原版输出里不得出现归因串 ' + a);
if (!ATTR.some(a => base.text.includes(a))) ok('卫生态干净（原版输出不含任何归因串）');

/** 一组破坏：造 → 跑 → 断言归因串出现 → 还原。 */
function group(name, file, anchor, repl, expect) {
    const dir = snapshotDir();
    if (!mutate(dir, file, anchor, repl)) return;
    const r = runScan(dir);
    if (r.code !== 1) bad(name + ' 应 exit=1（真缺陷），实为 ' + r.code + '：' + r.text.slice(0, 300));
    else if (!r.text.includes(expect)) bad(name + ' 翻红但归因不对（期望含「' + expect + '」）：' + r.text.slice(0, 300));
    else ok(name + ' exit=1 且归因命中「' + expect + '」');
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── R1 模块被截断成空壳 ──
group('R1-模块导出被删',
    'relation-disclosure.js',
    '        partition: partition,',
    '        partitionX: partition,',
    'R1 relation-disclosure 缺导出 partition');

// ── R2 manifest 漏登记 ──
group('R2-manifest 未登记',
    'manifest.json',
    '    "changeset.js"',
    '    "changeset-x.js"',
    'R2 manifest.extra_js 未登记 changeset.js');

// ── R2 宿主取库口被拆 ──
group('R2-取库口被换名',
    'index.js',
    "_moduleLib(() => window.LonShaChangeset, 'changeset.js')",
    "_moduleLib(() => window.LonShaChangesetX, 'changeset.js')",
    'R2 宿主未按契约取库：changeset');

// ── R2 宿主关键调用点被摘 ──
group('R2-变更集记录点被摘',
    'index.js',
    'try { _changeset()?.record({ table: \'status\', pk: [name, field]',
    'try { null?.record({ table: \'status\', pk: [name, field]',
    'R2 宿主未调用：变更集记录');

// ── R3 位置纪律：前值取在写入之后 ──
group('R3-前值取值点被抹掉（改名绕开探测）',
    'index.js',
    "                const _csPrev = (rec.fields && Object.prototype.hasOwnProperty.call(rec.fields, field)) ? rec.fields[field] : null;",
    "                const _csPrevPrev = (rec.fields && Object.prototype.hasOwnProperty.call(rec.fields, field)) ? rec.fields[field] : null;",
    'R3 找不到改前取值点');

// ── R3 维护顺序被倒置（改行为不改注释：注释不参与判据，破坏必须落在可观测处） ──
group('R3-维护顺序倒置',
    'index.js',
    "            const out = { rollup: null, vacuum: null };",
    "            const out = { vacuum: null, rollup: null }; await this.vacuum({});",
    'R3 ');

// ── R4a 病句放行被拆 ──
group('R4a-病句放行被拆',
    'relation-disclosure.js',
    "if (!posC.ok.length && !negC.ok.length) { res.state = 'invalid'; return res; }",
    "if (!posC.ok.length && !negC.ok.length) { res.state = 'miss'; return res; }",
    'R4a 病句必须放行');

// ── R4a 全角分隔符被收窄 ──
group('R4a-全角分隔符被收窄',
    'relation-disclosure.js',
    'const SPLIT_RE = /\\r?\\n|[,，;；、]/;',
    'const SPLIT_RE = /\\r?\\n|[,;]/;',
    'R4a 全角分隔符未生效');

// ── R4b 事件节点 floor 陷阱重演（把 data 回退读拿掉） ──
group('R4b-事件节点 data.floor 回退被拆',
    'node-rollup.js',
    "                ? (c[field] !== undefined ? c[field] : (c.data ? c.data[field] : undefined))",
    "                ? (c[field] !== undefined ? c[field] : undefined)",
    'R4b');

// ── R4c 唯一性闸门被拆（改为破坏计数，才能让结论真变） ──
group('R4c-唯一性闸门被拆',
    'fuzzy-patch.js',
    '        while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; }\n        return c;',
    '        while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; }\n        return Math.min(c, 1);',
    'R4c 多处命中必须拒绝');

// ── R4d before 冻结被拆 ──
group('R4d-before 冻结被拆',
    'changeset.js',
    '                    existing.after = after;',
    '                    existing.before = before; existing.after = after;',
    'R4d 覆盖语义错');

// ── R5 诊断行被移出 rows ──
{
    // 不能只改一处 return 的名字：rows 该条目里另有两处 `return ['行级变更', ...]`（模块缺席/异常态），
    //   改名后 rowsKeys 里仍有「行级变更」，归因不成立（本轮踩到的假绿）。
    //   改为破坏**调用点**——触发「只有定义、没人念」那条归因。
    group('R5-诊断行调用点被摘（只有定义没人念）',
        'index.js',
        "const line = (typeof this._changesetLine === 'function') ? this._changesetLine() : '—';",
        "const line = '—';",
        'R5 _changesetLine 在 selfCheck 内无调用点');
}

// ── R5 读数塌缩（四态并两态） ──
group('R5-读数把无条件与命中合并',
    'relation-disclosure.js',
    "const parts = ['本轮 ' + c.total + ' 条关系', '无条件 ' + (c.always || 0), '条件命中 ' + (c.match || 0), '跳过 ' + (c.miss || 0)];",
    "const parts = ['本轮 ' + c.total + ' 条关系', '合计 ' + ((c.always || 0) + (c.match || 0)), '跳过 ' + (c.miss || 0)];",
    'R5 关系披露读数把');

// ── R6 配置键未声明 ──
group('R6-配置键未声明',
    'index.js',
    '                relationDisclosureEnabled: true,',
    '                relationDisclosureEnabledX: true,',
    'R6 默认配置块未声明 relationDisclosureEnabled');

// ── R6 UI 控件被摘 ──
group('R6-UI 控件被摘',
    'settings-ui.js',
    "${ck('fuzzyPatchEnabled',",
    "${ckx('fuzzyPatchEnabled',",
    'R6 设置面板缺控件 fuzzyPatchEnabled');

// ── 结构漂移通道：index.js 被换成小文件 ⇒ 退出码 2 ──
{
    const dir = snapshotDir();
    fs.writeFileSync(path.join(dir, 'index.js'), 'const VERSION = "3.184.0";\n');
    const r = runScan(dir);
    if (r.code !== 2) bad('结构漂移应 exit=2（探测器失效），实为 ' + r.code);
    else ok('结构漂移（index.js 退化）exit=2');
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── N-R0 审计自身可分辨：破坏扫描器自身的两条自证 ──
//   为什么必须破**扫描器自己**：前 21 组破的都是被测文件，证明不了「扫描器的通过结论本身可信」。
//   做法：把扫描器拷进 fixture，在副本上破坏，再用副本路径跑（同一套真判据，真源码破坏）。
{
    // N-R0a：把通过路径的读数行**改名** ⇒ 卫生态必须翻红（与 N6c 行键改名同口径）。
    //   不能只加 `void 0 &&` 前缀：被断言的子串仍在源码里，判据不会变——不可观测的假负控制（本轮踩到）。
    const dir = snapshotDir();
    const sp = path.join(dir, 'tests', 'audit', 'scan_v3184_final_four.mjs');
    fs.copyFileSync(SCAN, sp);
    const s0 = fs.readFileSync(sp, 'utf8');
    // 前导\n 不可省：自证行 `P.includes("console.log('[final-four] 卫生：")` 里也有同名子串，不加则锚点命中 2 次。
    const anchor = "\nconsole.log('[final-four] 卫生：";
    const n0 = s0.split(anchor).length - 1;
    if (n0 !== 1) bad('N-R0a 锚点必须恰中 1 次，实为 ' + n0);
    else {
        fs.writeFileSync(sp, s0.replace(anchor, "\nconsole.log('[final-four] 卫生态："));
        const r = runScanAt(sp, dir);
        if (r.code !== 1) bad('N-R0a 读数行改名应 exit=1，实为 ' + r.code + '：' + r.text.slice(0, 200));
        else if (!r.text.includes('R0 自证：通过路径读数行缺失')) bad('N-R0a 翻红但归因不对：' + r.text.slice(0, 200));
        else ok('N-R0a 读数行改名 exit=1 且归因命中「R0 自证：通过路径读数行缺失」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}
{
    // N-R0b：拆掉自计数的过滤器 ⇒ 上报点实测值塌成 1 ⇒ 必须翻红。
    const dir = snapshotDir();
    const sp = path.join(dir, 'tests', 'audit', 'scan_v3184_final_four.mjs');
    fs.copyFileSync(SCAN, sp);
    const s0 = fs.readFileSync(sp, 'utf8');
    const anchor = "l.includes(_SUBMIT)";
    const n0 = s0.split(anchor).length - 1;
    if (n0 !== 1) bad('N-R0b 锚点必须恰中 1 次，实为 ' + n0);
    else {
        fs.writeFileSync(sp, s0.replace(anchor, "l.includes('NEVER_MATCH_AT_ALL')"));
        const r = runScanAt(sp, dir);
        if (r.code !== 1) bad('N-R0b 拆自计数应 exit=1，实为 ' + r.code + '：' + r.text.slice(0, 200));
        else if (!r.text.includes('R0 自证：上报点只有')) bad('N-R0b 翻红但归因不对：' + r.text.slice(0, 200));
        else ok('N-R0b 拆自计数 exit=1 且归因命中「R0 自证：上报点只有」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── 工具两向自证：锚点不存在时必须拒绝破坏（不静默） ──
//   注意：这里不能用外层的 mutate()——它失败时会调 bad() 计入失败组，
//   而「拒绝破坏」正是**期望行为**。故用局部探测函数，避免把自证判成缺陷。
{
    const dir = snapshotDir();
    const probe = (file, anchor) => {
        const p = path.join(dir, file);
        const t = fs.readFileSync(p, 'utf8');
        return t.split(anchor).length - 1;
    };
    if (probe('changeset.js', 'CHANGESET_VERSION = 1') === 1) ok('工具两向自证：锚点存在时恰中 1 次（可破坏）');
    else bad('工具两向自证：本应存在的锚点未恰中 1 次');
    if (probe('changeset.js', 'THIS_ANCHOR_DOES_NOT_EXIST_AT_ALL') === 0) ok('工具两向自证：锚点不存在时探测为 0 ⇒ 拒绝破坏（不静默通过）');
    else bad('工具两向自证：不存在的锚点竟有命中');
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── 还原自证：破坏副本用完即删，原版目录未被触碰 ──
{
    const s = fs.readFileSync(path.join(SRC, 'changeset.js'), 'utf8');
    if (!s.includes('CHANGESET_VERSION = 1')) bad('原版 changeset.js 被污染（破坏泄漏到工作区）');
    else ok('原版工作区未被触碰（破坏只在临时副本里发生）');
}

console.log('\n[v3.184 负控制] ' + pass + ' 组成立 / ' + fail + ' 组失败');
if (fail) process.exit(1);