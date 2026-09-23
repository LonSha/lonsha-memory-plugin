// 审计基建（v3.186）负控制：情绪反向召回扫描的归因自证
// ------------------------------------------------------------
// 为什么必须有它：
//   只验「原版跑绿」是不够的——一个永远返回 0 的扫描器也是绿的。
//   本文件对扫描器的每条归因**各造一次真源码破坏**，逐个确认：
//     ① 锚点在原文件里恰中 1 次（否则破坏位置不可复现，等于没破坏）
//     ② 破坏字节可观测（语法合法，行为真变）
//     ③ 扫描器**按本组声称的归因翻红**（只验退出码会放过「因别的缺陷翻红」的空转假绿）
//     ④ 破坏副本用完即还原（同名文件拷贝会让原版在被污染的环境里跑）
//
//   本版专门设组的两个前人坑：
//     ⑤ 判据纯度：needle 若不在扫描器自身源码里拆开拼接，会出现「宿主里删了也绿」
//        （判据自我满足）。N-R0a 直接破坏扫描器的 needle 拼接以证其可翻红。
//     ⑥ 工具两向自证：锚点不存在时必须**拒绝破坏**而不是静默通过。
//
//   本版新增一类「判据读残实现」的坑：v3.186 正控初版用「遇到下一个 `xxx(...) {` 就停」
//   提取方法体，被方法体内部的 `if (r.reason === 'ok') {` 命中而截断，
//   于是「生效读数／无线索态」两条判据把**实现读残了再报实现缺东西**（假归因）。
//   N-R5b 就是为它设的：把方法体内的分支形状改一下，扫出来的必须是「缺读数」而非静默通过。
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
const SRC = process.cwd();
const SCAN = path.join(SRC, 'tests/audit/scan_v3186_emotion_recall.mjs');
const FILES = ['narrative-pulse.js', 'index.js', 'settings-ui.js', 'manifest.json'];
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  ✗ ' + m); };

if (!fs.existsSync(SCAN)) {
    console.error('[v3.186 负控制] 缺少被测扫描器 ' + path.relative(SRC, SCAN) + ' ⇒ 无法自证，结构漂移');
    process.exit(2);
}
for (const f of FILES) {
    if (!fs.existsSync(path.join(SRC, f))) {
        console.error('[v3.186 负控制] 缺少被测文件 ' + f + ' ⇒ 无法自证，结构漂移');
        process.exit(2);
    }
}
function snapshotDir() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-v3186-'));
    // [v3.191] 夹具必须镜像仓库布局：扫描器副本在 tests/audit/ 下，其 '../_audit_lib.mjs' 才能解析。
    fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
    fs.copyFileSync(path.join(SRC, 'tests', '_audit_lib.mjs'), path.join(dir, 'tests', '_audit_lib.mjs'));
    for (const f of FILES) fs.copyFileSync(path.join(SRC, f), path.join(dir, f));
    // 扫描器自身也要拷进同一夹具目录，供「破坏扫描器」组使用。
    fs.copyFileSync(SCAN, path.join(dir, 'tests', 'audit', 'scanner_copy.mjs'));
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
const runScan = (dir) => runScanAt(path.join(dir, 'tests', 'audit', 'scanner_copy.mjs'), dir);
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

// ── 锚点两向自证（先证「能破坏」，再证「不存在的锚点不会静默通过」）──
//   为什么先做：下面的每条 mutate 都依赖「恰中 1 次」这个前提。锚点若已随重构漂移，
//   破坏根本没发生，扫描器跑绿，整组测试会伪装成「扫描器抓不住」——先钉住前提，
//   后面每条失败才能被正确归因。
const ANCHORS = [
    ['index.js', 'const merged = this.hybridMerge(results);'],
    ['index.js', 'if (_emoOppositeKeys.has(_ek1) || (_ek2 && _emoOppositeKeys.has(_ek2))) {\n                            _it.rrfScore = (_it.rrfScore || 0) + 0.006;'],
    ['index.js', 'Number(this._emoOppositeRounds || 0) >= 5'],
    ['index.js', '待本轮（尚无召回）'],
    ['index.js', 'const _er = EL.recallByOppositeEmotion({ queryText: query.text, docs: _emoDocs });'],
    ['index.js', 'emotionOppositeRecall: false'],
    ['index.js', "['情绪反向', line + (idle ? ' ⚠️' : '')]"],
    ['settings-ui.js', "ck('emotionOppositeRecall'"],
    ['narrative-pulse.js', 'for (const p of (EMOTION_OPPOSITES[w] || [])) out.add(p);'],
    ['narrative-pulse.js', 'let dominant = null, best = 0;'],
];
{
    const dir = snapshotDir();
    let allUnique = true;
    for (const [f, a] of ANCHORS) {
        const t = fs.readFileSync(path.join(dir, f), 'utf8');
        const n = t.split(a).length - 1;
        if (n !== 1) { allUnique = false; bad('锚点两向自证：' + f + ' 里锚点命中 ' + n + ' 次（需恰 1）：' + JSON.stringify(a.slice(0, 60))); }
    }
    if (allUnique) ok('锚点两向自证：' + ANCHORS.length + ' 个锚点各恰中 1 次（可破坏）');
    const t = fs.readFileSync(path.join(dir, 'index.js'), 'utf8');
    if (t.split('THIS_ANCHOR_DOES_NOT_EXIST_AT_ALL').length - 1 === 0) ok('工具两向自证：不存在的锚点探测为 0 ⇒ 拒绝破坏（不静默通过）');
    else bad('工具两向自证：不存在的锚点竟有命中');
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── N-R1 模块存活：narrative-pulse 被截断 ⇒ 必须翻红 ──
{
    const dir = snapshotDir();
    const p = path.join(dir, 'narrative-pulse.js');
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    const hollow = lines.slice(0, 8).concat(lines.slice(-8)).join('\n');
    fs.writeFileSync(p, hollow);
    const r = runScan(dir);
    if (r.code === 2) ok('N-R1a 截断成空壳 → exit=2（结构漂移，符合约定）');
    else if (r.code === 1 && r.text.includes('R1 模块存活')) ok('N-R1a 截断成空壳 → exit=1 且归因命中「R1 模块存活」');
    else bad('N-R1a 截断成空壳：应 exit=1 或 2，实为 ' + r.code + '：' + r.text.slice(0, 240));
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── N-R2 词表纪律：反向词表被拆掉 / 键失去归属 ⇒ 必须翻红 ──
mutate('narrative-pulse.js', 'for (const p of (EMOTION_OPPOSITES[w] || [])) out.add(p);', 'void 0;',
    'N-R2a 反向词并集被拆掉（四维皆空）', 'R2 维无反向词');

// ── N-R3 消费面：生产接上、消费拆掉 ⇒ 必须翻红 ──
mutate('index.js', 'const _er = EL.recallByOppositeEmotion({ queryText: query.text, docs: _emoDocs });',
    "const _er = { reason: 'empty', dominant: null, opposite: [], scanned: 0 };",
    'N-R3a 拆掉召回侧真调用（线索算出来没人用）', 'R3 召回侧未消费');

// ── N-R4 位置纪律：让 rerank 先于提权 ⇒ 必须翻红 ──
//   破坏方式：在 hybridMerge 之后**立刻**插一次 rerank 调用，于是首次出现的 rerank
//   落在提权块之前，`merge < boost < rerank` 的偏序被破坏。
mutate('index.js', 'const merged = this.hybridMerge(results);',
    'const merged = this.hybridMerge(results);\n            const _early = this.intentRerank(merged, query.text);',
    'N-R4a 提权落到 rerank 之后', 'R4 位置错');

// ── N-R4b 边界纪律：提权块内越权写图 ⇒ 必须翻红 ──
mutate('index.js', 'if (_emoOppositeKeys.has(_ek1) || (_ek2 && _emoOppositeKeys.has(_ek2))) {\n                            _it.rrfScore = (_it.rrfScore || 0) + 0.006;',
    "if (_emoOppositeKeys.has(_ek1) || (_ek2 && _emoOppositeKeys.has(_ek2))) {\n                            _it.rrfScore = (_it.rrfScore || 0) + 0.006;\n                            this.graph.addEdge('X');",
    'N-R4b 提权块内越权写图', 'R4 越权写图');

// ── N-R4c 幅度越界：把 0.006 换成 0.5 ⇒ 必须翻红 ──
mutate('index.js', 'if (_emoOppositeKeys.has(_ek1) || (_ek2 && _emoOppositeKeys.has(_ek2))) {\n                            _it.rrfScore = (_it.rrfScore || 0) + 0.006;',
    'if (_emoOppositeKeys.has(_ek1) || (_ek2 && _emoOppositeKeys.has(_ek2))) {\n                            _it.rrfScore = (_it.rrfScore || 0) + 0.5;',
    'N-R4c 提权幅度越界（0.5）', 'R4 分值越界');

// ── N-R5 读数可分辨：三态之一被抹掉 ⇒ 必须翻红 ──
//   注意替换文本不能含原 needle 子串（`待本轮XX` 仍包含 `待本轮`，那样判据照样能命中，
//   破坏等于没做——这类「破坏写法本身失效」是负控制的常见假绿来源）。
mutate('index.js', '待本轮（尚无召回）', '本轮尚无召回',
    'N-R5a 抹掉「待本轮」态（三态不可分）', 'R5 三态不可分辨');

// ── N-R5b idle 警示绑定被拆 ⇒ 必须翻红 ──
mutate('index.js', 'Number(this._emoOppositeRounds || 0) >= 5', 'Number(this._emoOppositeRounds || 0) >= 0',
    'N-R5b 拆掉 idle 的「≥5 轮」绑定', 'R5 idle 警示不可分辨');

// ── N-R6 默认值：false → true ⇒ 必须翻红（零行为变化承诺被破坏）──
mutate('index.js', 'emotionOppositeRecall: false', 'emotionOppositeRecall: true',
    'N-R6a 默认值被改成 true', 'R6 默认值不符');

// ── N-R6b UI 控件缺失 ⇒ 必须翻红 ──
mutate('settings-ui.js', "ck('emotionOppositeRecall'", "ck('emotionOppositeRecallXXX'",
    'N-R6b 删掉 UI 控件', 'R6 无 UI 控件');

// ── N-R6c 行为证伪：主导维判定被做哑 ⇒ 机制不再触发 ⇒ 必须翻红 ──
//   破坏方式：把「取最大分维」的基准抬到 1e9，于是任何文本都判不出主导维。
//   这条**只**能被行为判据抓住——静态文本检查看不出差别（代码形状没变）。
mutate('narrative-pulse.js', 'let dominant = null, best = 0;', 'let dominant = null, best = 1e9;',
    'N-R6c 主导维判定做哑（行为层失效）', 'R6 机制未生效');

// ── N-R0 判据纯度：破坏扫描器自身的 needle 拆写 ⇒ 应 exit=2（纯度失败）──
//   注意：本文件里也**不**写整串 needle，见下方 needleParts 拼接。
{
    const dir = snapshotDir();
    const sp = path.join(dir, 'tests', 'audit', 'scanner_copy.mjs');
    const s0 = fs.readFileSync(sp, 'utf8');
    // 锚点由片段拼出：这样本文件自身不含整串，不会成为新的纯度污染源。
    //   教训：初版用 `'\u7ef8'` 这类转义写「绪」，写成了「绸」（U+7EF8 ≠ U+7EEA），
    //   锚点 0 命中、破坏根本没发生——破坏脚本自己的锚点错码会伪装成「扫描器抓不住」。
    const N_EMO = '情' + '绪';
    const N_OPP = '反' + '向';
    const anchor = "const NEEDLE_ROW = '" + N_EMO + "' + '" + N_OPP + "';";
    const n0 = s0.split(anchor).length - 1;
    if (n0 !== 1) bad('N-R0a：needle 拆写锚点须恰中 1 次，实为 ' + n0);
    else {
        // 破坏成整串写法：若扫描器没有纯度自检，「宿主里缺 needle 也绿」将无从察觉。
        fs.writeFileSync(sp, s0.replace(anchor, "const NEEDLE_ROW = '" + N_EMO + N_OPP + "';"));
        const r = runScanAt(sp, dir);
        if (r.code !== 2) bad('N-R0a：纯度破坏应 exit=2，实为 ' + r.code + '：' + r.text.slice(0, 240));
        else if (!r.text.includes('判据纯度')) bad('N-R0a：翻红但归因不对：' + r.text.slice(0, 240));
        else ok('N-R0a needle 未拆写 → exit=2 且归因命中「判据纯度」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── N-R0b 判别力丢失：把某条归因改名 ⇒ 应 exit=2（归因串契约触发）──
//   为什么测这个而不是「删一个 bad() 调用」：
//     · 删 bad() 只减少一个静态调用点，下界 42 根本抓不住，也不会削弱判别力；
//     · 真正危险的是**归因串被改名**——扫描器照样能翻红，但负控制再也匹配不到它，
//       等于「这条判别力悄悄消失」。归因串契约正是守这个。
{
    const dir = snapshotDir();
    const sp = path.join(dir, 'tests', 'audit', 'scanner_copy.mjs');
    const s0 = fs.readFileSync(sp, 'utf8');
    const callAnchor = "bad('R2 反向词越界'";
    const n0 = s0.split(callAnchor).length - 1;
    // 归因串在源码里出现 2 次（EXPECT_ATTRIB 声明 + bad() 调用点），
    //   故锚必须带 `bad('` 前缀，才能保证「恰中 1 次」的破坏可复现性。
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

// ── N-R0c 判据段缺失：枚举少一段 ⇒ 应 exit=2（自证失败）──
{
    const dir = snapshotDir();
    const sp = path.join(dir, 'tests', 'audit', 'scanner_copy.mjs');
    const s0 = fs.readFileSync(sp, 'utf8');
    const anchor = "const EXPECT_SECTION_COUNT = 6;";
    const n0 = s0.split(anchor).length - 1;
    if (n0 !== 1) bad('N-R0c：段数锚点须恰中 1 次，实为 ' + n0);
    else {
        fs.writeFileSync(sp, s0.replace(anchor, 'const EXPECT_SECTION_COUNT = 5;'));
        const r = runScanAt(sp, dir);
        if (r.code !== 2) bad('N-R0c：段数不符应 exit=2，实为 ' + r.code + '：' + r.text.slice(0, 240));
        else if (!r.text.includes('自证失败')) bad('N-R0c：翻红但归因不对：' + r.text.slice(0, 240));
        else ok('N-R0c 判据段数漂移 → exit=2 且归因命中「自证失败」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}

// ── 还原自证：破坏副本用完即删，原版目录未被触碰 ──
{
    const s = fs.readFileSync(path.join(SRC, 'index.js'), 'utf8');
    const n = fs.readFileSync(path.join(SRC, 'narrative-pulse.js'), 'utf8');
    if (!s.includes('emotionOppositeRecall: false')) bad('原版 index.js 被污染（破坏泄漏到工作区）');
    else if (!s.includes("['情绪反向', line + (idle ? ' ⚠️' : '')]")) bad('原版 index.js 诊断行被污染');
    else if (!n.includes('for (const p of (EMOTION_OPPOSITES[w] || [])) out.add(p);')) bad('原版 narrative-pulse.js 被污染');
    else ok('原版工作区未被触碰（破坏只在临时副本里发生）');
}

console.log('\n[v3.186 负控制] ' + pass + ' 组成立 / ' + fail + ' 组失败');
process.exit(fail ? 1 : 0);
