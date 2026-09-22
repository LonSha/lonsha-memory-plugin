// 审计基建（v3.185）负控制：xref_consumer 扫描的归因自证
// ------------------------------------------------------------
// 为什么必须有它：
//   只验「原版跑绿」是不够的——一个永远返回 0 的扫描器也是绿的。
//   本文件对扫描器的每条归因**各造一次真源码破坏**，逐个确认：
//     ① 锚点在原文件里恰中 1 次（否则破坏位置不可复现，等于没破坏）
//     ② 破坏字节可观测（语法合法，行为真变）
//     ③ 扫描器**按本组声称的归因翻红**（只验退出码会放过「因别的缺陷翻红」的空转假绿）
//     ④ 破坏副本用完即还原（同名文件拷贝会让原版在被污染的环境里跑）
//
//   本版新增两类前人踩过的坑，专门设组：
//     ⑤ 判据纯度：needle 若不在扫描器自身源码里拆开拼接，会出现「宿主里删了也绿」
//        （判据自我满足）。N-R0b 直接破坏扫描器的 needle 拼接以证其可翻红。
//     ⑥ 工具两向自证：锚点不存在时必须**拒绝破坏**而不是静默通过。
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
const SRC = process.cwd();
const SCAN = path.join(SRC, 'tests/audit/scan_v3185_xref_consumer.mjs');
const FILES = ['crosslink.js', 'index.js', 'settings-ui.js', 'manifest.json'];
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  ✗ ' + m); };

if (!fs.existsSync(SCAN)) {
    console.error('[v3.185 负控制] 缺少被测扫描器 ' + path.relative(SRC, SCAN) + ' ⇒ 无法自证，结构漂移');
    process.exit(2);
}
for (const f of FILES) {
    if (!fs.existsSync(path.join(SRC, f))) {
        console.error('[v3.185 负控制] 缺少被测文件 ' + f + ' ⇒ 无法自证，结构漂移');
        process.exit(2);
    }
}
function snapshotDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-v3185-'));
    for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    return dir;
}
function runScanAt(scanPath, dir) {
    try {
        const out = execFileSync('node', [scanPath], { env: { ...process.env, LONSHA_AUDIT_ROOT: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { code: 0, text: out };
    } catch (e) {
        return { code: e.status == null ? -1 : e.status, text: String(e.stdout || '') + String(e.stderr || '') };
    }
}
const runScan = (dir) => runScanAt(SCAN, dir);
/** 在临时副本里做一次真源码破坏，并断言扫描器按归因翻红。 */
function mutate(file, anchor, repl, label, expectAttr) {
    const dir = snapshotDir();
    const p = path.join(dir, file);
    const t = fs.readFileSync(p, 'utf8');
    const n0 = t.split(anchor).length - 1;
    if (n0 !== 1) {
        bad(label + '：锚点须恰中 1 次，实为 ' + n0 + ' ⇒ 破坏不可复现');
        fs.rmSync(dir, { recursive: true, force: true });
        return;
    }
    fs.writeFileSync(p, t.replace(anchor, repl));
    const r = runScan(dir);
    if (r.code !== 1) bad(label + '：应 exit=1，实为 ' + r.code + '：' + r.text.slice(0, 240));
    else if (!r.text.includes(expectAttr)) bad(label + '：翻红但归因不对（期望含「' + expectAttr + '」）：' + r.text.slice(0, 240));
    else ok(label + ' → exit=1 且归因命中「' + expectAttr + '」');
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── N-R2 消费面：生产接上、消费拆掉 ⇒ 必须翻红 ──
mutate('index.js', 'this._crosslinkIndex.refsFor(query.text);', 'void 0;',
    'N-R2a 拆掉召回侧消费（refsFor 调用）', 'R2 召回侧未消费');

// ── N-R3 位置纪律：让 rerank 先于提权 ⇒ 必须翻红 ──
//   破坏方式：在 hybridMerge 之后**立刻**插一次 rerank 调用。于是首次出现的 rerank
//   落在提权块之前，`merge < boost < rerank` 的偏序被破坏。
//   （试过「删掉原 rerank、在提权块之后再补一次」——那种破坏两向偏序都成立，扫不出来，
//     属于破坏本身选错，不是扫描器漏检。）
mutate('index.js', 'const merged = this.hybridMerge(results);',
    'const merged = this.hybridMerge(results);\n            const _early = this.intentRerank(merged, query.text);',
    'N-R3a 提权落到 rerank 之后', 'R3 位置错');

// ── N-R3b 自由变量回归：把修好的调用还原成历史缺陷形态 ⇒ 必须翻红 ──
mutate('index.js', 'this.intentRerank(merged, query.text);', 'this.intentRerank(merged, queryText);',
    'N-R3b 还原 queryText 自由变量（历史缺陷形态）', 'R3 自由变量');

// ── N-R4 边界纪律：提权块内越权写图 ⇒ 必须翻红 ──
mutate('index.js', '(_it.rrfScore || 0) + 0.006', "(_it.rrfScore || 0) + 0.006, this.graph.addEdge('X')",
    'N-R4a 提权块内越权写图', 'R4 越权写图');

// ── N-R4b 提权幅度越界：把 0.006 换成 0.5 ⇒ 必须翻红 ──
mutate('index.js', '(_it.rrfScore || 0) + 0.006', '(_it.rrfScore || 0) + 0.5',
    'N-R4b 提权幅度越界（0.5）', 'R4 分值越界');

// ── N-R5 读数可分辨：把 idle 警示条件拆掉 ⇒ 必须翻红 ──
mutate('index.js', "idle ? ' ⚠️' : ''", "''",
    'N-R5a 拆掉 idle 警示绑定', 'R5 idle 警示不可分辨');

// ── N-R6 配置面：默认值从 false 改成 true ⇒ 必须翻红（零行为变化承诺被破坏） ──
mutate('index.js', 'crosslinkRecallBoost: false', 'crosslinkRecallBoost: true',
    'N-R6a 默认值被改成 true', 'R6 默认值不符');

// ── N-R6b UI 控件缺失 ⇒ 必须翻红 ──
mutate('settings-ui.js', "ck('crosslinkRecallBoost'", "ck('crosslinkRecallBoostXXX'",
    'N-R6b 删掉 UI 控件', 'R6 无 UI 控件');

// ── N-R1 模块存活：crosslink 被截断成空壳 ⇒ 必须翻红 ──
{
    const dir = snapshotDir();
    const p = path.join(dir, 'crosslink.js');
    const t = fs.readFileSync(p, 'utf8');
    const lines = t.split('\n');
    // 保留尾部导出（保证 require 不失败），但砍掉正文到 120 行 —— 行数下限判据应触发。
    const hollow = lines.slice(0, 8).concat(lines.slice(-8)).join('\n');
    fs.writeFileSync(p, hollow);
    const r = runScan(dir);
    if (r.code === 2) ok('N-R1a 截断成空壳 → exit=2（require 失败即结构漂移，符合约定）');
    else if (r.code === 1 && r.text.includes('R1 模块存活')) ok('N-R1a 截断成空壳 → exit=1 且归因命中「R1 模块存活」');
    else bad('N-R1a 截断成空壳：应 exit=1 或 2，实为 ' + r.code + '：' + r.text.slice(0, 240));
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── N-R0 判据纯度：破坏扫描器自身的 needle 拆写 ⇒ 应 exit=2（纯度失败）──
{
    const dir = snapshotDir();
    const sp = path.join(dir, 'scanner_copy.mjs');
    fs.copyFileSync(SCAN, sp);
    const s0 = fs.readFileSync(sp, 'utf8');
    const anchor = "const NEEDLE_A = '条' + '目复用';";
    const n0 = s0.split(anchor).length - 1;
    if (n0 !== 1) bad('N-R0a：needle 拆写锚点须恰中 1 次，实为 ' + n0);
    else {
        // 破坏成整串写法：若扫描器没有纯度自检，「宿主里缺 needle 也绿」将无从察觉。
        fs.writeFileSync(sp, s0.replace(anchor, "const NEEDLE_A = '条目复用';"));
        const r = runScanAt(sp, dir);
        if (r.code !== 2) bad('N-R0a：纯度破坏应 exit=2，实为 ' + r.code + '：' + r.text.slice(0, 240));
        else if (!r.text.includes('判据纯度')) bad('N-R0a：翻红但归因不对：' + r.text.slice(0, 240));
        else ok('N-R0a needle 未拆写 → exit=2 且归因命中「判据纯度」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── N-R0b 判别力丢失：把某条归因改名 ⇒ 应 exit=2（归因串契约触发）──
//   为什么测这个而不是「删一个 bad() 调用」：
//     · 删 bad() 只减少一个静态调用点（55→54），下界 45 根本抓不住，也不会削弱判别力；
//     · 真正危险的是**归因串被改名**——扫描器照样能翻红，但负控制再也匹配不到它，
//       等于「这条判别力悄悄消失」。归因串契约正是守这个。
//   破坏方式：把 R2 的归因串改成别的字（调用点数量不变，判别力消失）。
{
    const dir = snapshotDir();
    const sp = path.join(dir, 'scanner_copy.mjs');
    fs.copyFileSync(SCAN, sp);
    const s0 = fs.readFileSync(sp, 'utf8');
    const callAnchor = "bad('R2 召回侧未消费'";
    const n0 = s0.split(callAnchor).length - 1;
    // 注意：归因串在源码里出现 2 次（EXPECT_ATTRIB 声明 + bad() 调用点），
    //   所以锚必须用带 `bad('` 前缀的调用形态，才能保证「恰中 1 次」的破坏可复现性。
    if (n0 !== 1) bad('N-R0b：bad( 调用锚须恰中 1 次，实为 ' + n0);
    else {
        fs.writeFileSync(sp, s0.replace(callAnchor, "bad('R2_ATTR_RENAMED'"));
        const r = runScanAt(sp, dir);
        if (r.code !== 2) bad('N-R0b：归因改名应 exit=2，实为 ' + r.code + '：' + r.text.slice(0, 240));
        else if (!r.text.includes('自证失败')) bad('N-R0b：翻红但归因不对：' + r.text.slice(0, 240));
        else ok('N-R0b 归因串被改名 → exit=2 且归因命中「自证失败」（判别力丢失可察）');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── 工具两向自证：锚点不存在时必须拒绝破坏（不静默） ──
{
    const dir = snapshotDir();
    const probe = (file, anchor) => {
        const t = fs.readFileSync(path.join(dir, file), 'utf8');
        return t.split(anchor).length - 1;
    };
    if (probe('index.js', '(_it.rrfScore || 0) + 0.006') === 1) ok('工具两向自证：锚点存在时恰中 1 次（可破坏）');
    else bad('工具两向自证：本应存在的锚点未恰中 1 次');
    if (probe('index.js', 'THIS_ANCHOR_DOES_NOT_EXIST_AT_ALL') === 0) ok('工具两向自证：锚点不存在时探测为 0 ⇒ 拒绝破坏（不静默通过）');
    else bad('工具两向自证：不存在的锚点竟有命中');
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── 还原自证：破坏副本用完即删，原版目录未被触碰 ──
{
    const s = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
    if (!s.includes('intentRerank(merged, query.text);')) bad('原版 index.js 被污染（破坏泄漏到工作区）');
    else if (!s.includes('crosslinkRecallBoost: false')) bad('原版 index.js 配置默认值被污染');
    else ok('原版工作区未被触碰（破坏只在临时副本里发生）');
}

console.log('\n[v3.185 负控制] ' + pass + ' 组成立 / ' + fail + ' 组失败');
process.exit(fail ? 1 : 0);