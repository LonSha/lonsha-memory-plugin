// 审计基建（v3.193.0）负控制：词表漂移扫描器的归因自证
// ------------------------------------------------------------
// 为什么必须有它：
//   一个「永远返回 0」的漂移扫描器同样是绿的。本文件对扫描器每条归因各造一次
//   **真源码破坏**，逐个确认：① 锚点在原文件恰中 1 次；② 破坏语法合法、行为真变；
//   ③ 扫描器按本组声称的归因翻红（只验退出码会放过「因别的缺陷翻红」的空转假绿）；
//   ④ 破坏副本用完即删，工作区零污染。
//   另加两组工具自证：锚点不存在时必须拒绝破坏；基线缺失时必须 exit=2 而不是静默通过。
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execFileSync } from 'child_process';
const SRC = process.cwd();
const SCAN = path.join(SRC, 'tests/audit/scan_v3193_lexicon_drift.mjs');
const BASELINE = path.join(SRC, 'tests/fixtures/lexicon_baseline.json');
const NP = path.join(SRC, 'narrative-pulse.js');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  ok ' + m); };
const bad = (m) => { fail++; console.error('  ✗ ' + m); };
for (const [p, label] of [[SCAN, '被测扫描器'], [BASELINE, '词表基线'], [NP, 'narrative-pulse.js']]) {
    if (!fs.existsSync(p)) {
        console.error('[v3.193 lex 负控制] 缺少' + label + ' ' + path.relative(SRC, p) + ' ⇒ 无法自证，结构漂移');
        process.exit(2);
    }
}
function snapshot() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-lexdrift-'));
    fs.mkdirSync(path.join(dir, 'tests', 'audit'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'tests', 'fixtures'), { recursive: true });
    fs.copyFileSync(NP, path.join(dir, 'narrative-pulse.js'));
    fs.copyFileSync(BASELINE, path.join(dir, 'tests', 'fixtures', 'lexicon_baseline.json'));
    fs.copyFileSync(SCAN, path.join(dir, 'tests', 'audit', 'scanner_copy.mjs'));
    return dir;
}
function runAt(scanPath, dir) {
    try {
        const out = execFileSync('node', [scanPath], { env: { ...process.env, LONSHA_AUDIT_ROOT: dir }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        return { code: 0, text: out };
    } catch (e) {
        return { code: e.status == null ? -1 : e.status, text: String(e.stdout || '') + String(e.stderr || '') };
    }
}
const runScan = (dir) => runAt(path.join(dir, 'tests', 'audit', 'scanner_copy.mjs'), dir);
/** 在临时副本里做一次真源码破坏，断言扫描器按归因翻红。 */
function mutate(file, anchor, repl, label, expectAttr) {
    const dir = snapshot();
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
// ── 锚点两向自证 ──
const ANCHORS = [
    ['narrative-pulse.js', '孤独:2,'],
    ['narrative-pulse.js', "孤独: ['陪伴', '拥抱', '依靠', '港湾', '归处', '温暖'],"],
    ['narrative-pulse.js', '呜咽:2, '],
];
{
    const dir = snapshot();
    let allUnique = true;
    for (const [f, a] of ANCHORS) {
        const t = fs.readFileSync(path.join(dir, f), 'utf8');
        const n = t.split(a).length - 1;
        if (n !== 1) { allUnique = false; bad('锚点两向自证：' + f + ' 里锚点命中 ' + n + ' 次（需恰 1）：' + JSON.stringify(a.slice(0, 50))); }
    }
    if (allUnique) ok('锚点两向自证：' + ANCHORS.length + ' 个锚点各恰中 1 次（可破坏）');
    const t = fs.readFileSync(path.join(dir, 'narrative-pulse.js'), 'utf8');
    if (t.split('THIS_WORD_DOES_NOT_EXIST_AT_ALL').length - 1 === 0) ok('工具两向自证：不存在的锚点探测为 0 ⇒ 拒绝破坏（不静默通过）');
    else bad('工具两向自证：不存在的锚点竟有命中');
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── N-R1 维度覆盖：扩词 / 删词 ⇒ 必须翻红 ──
mutate('narrative-pulse.js', '孤独:2,', '孤独:2, 惆怅:2,',
    'N-R1a 新增词未进基线（扩词）', 'R1 维度覆盖漂移');
mutate('narrative-pulse.js', '呜咽:2, ', '',
    'N-R1b 删词（覆盖退化）', 'R1 维度覆盖漂移');
// ── N-R2 映射纪律：键越界 / 值越界 / 值不可解析 ⇒ 必须翻红 ──
mutate('narrative-pulse.js', "孤独: ['陪伴', '拥抱', '依靠', '港湾', '归处', '温暖'],",
    "微笑: ['笑'],\n  孤独: ['陪伴', '拥抱', '依靠', '港湾', '归处', '温暖'],",
    'N-R2a 反向键不在词表（照搬外库词的形态）', 'R2 反向键越界');
mutate('narrative-pulse.js', "孤独: ['陪伴', '拥抱', '依靠', '港湾', '归处', '温暖'],",
    "孤独: ['陪伴', '拥抱', '依靠', '港湾', '归处', '难过'],",
    'N-R2b 反向后缀指向负面维（极性写反）', 'R2 反向后缀越界');
mutate('narrative-pulse.js', "孤独: ['陪伴', '拥抱', '依靠', '港湾', '归处', '温暖'],",
    "孤独: ['陪伴', '拥抱', '依靠', '港湾', '归处', '某某'],",
    'N-R2c 反向后缀无法在词表内解析', 'R2 反向后缀无法解析');
// ── N-R3 漂移与影响：映射顺序变化 / 权重变化 ⇒ 必须翻红 ──
mutate('narrative-pulse.js', "孤独: ['陪伴', '拥抱', '依靠', '港湾', '归处', '温暖'],",
    "孤独: ['拥抱', '陪伴', '依靠', '港湾', '归处', '温暖'],",
    'N-R3a 映射顺序变化（未确认漂移）', 'R3 映射漂移');
// 权重改动**不**改词集（基线只存键），故这条只可能被影响样本判据抓住 —— 这正是它的用途。
mutate('narrative-pulse.js', '泪:2,', '泪:0,',
    'N-R3b 权重改动导致影响样本读数漂移', 'R3 影响样本漂移');
// ── N-R0 探测器自证：基线缺失 / 段数漂移 / 归因串改名 ⇒ 必须 exit=2 ──
{
    const dir = snapshot();
    fs.rmSync(path.join(dir, 'tests', 'fixtures', 'lexicon_baseline.json'));
    const r = runScan(dir);
    if (r.code !== 2) bad('N-R0a 基线缺失应 exit=2，实为 ' + r.code + '：' + r.text.slice(0, 200));
    else if (!r.text.includes('缺少词表基线')) bad('N-R0a 翻红但归因不对：' + r.text.slice(0, 200));
    else ok('N-R0a 词表基线缺失 → exit=2（漂移无从比对，拒绝静默通过）');
    fs.rmSync(dir, { recursive: true, force: true });
}
{
    const dir = snapshot();
    const sp = path.join(dir, 'tests', 'audit', 'scanner_copy.mjs');
    const s0 = fs.readFileSync(sp, 'utf8');
    const anchor = 'const EXPECT_SECTION_COUNT = 5;';
    if (s0.split(anchor).length - 1 !== 1) bad('N-R0b：段数锚点须恰中 1 次');
    else {
        fs.writeFileSync(sp, s0.replace(anchor, 'const EXPECT_SECTION_COUNT = 9;'));
        const r = runAt(sp, dir);
        if (r.code !== 2) bad('N-R0b 段数漂移应 exit=2，实为 ' + r.code + '：' + r.text.slice(0, 200));
        else if (!r.text.includes('判据自证失败')) bad('N-R0b 翻红但归因不对：' + r.text.slice(0, 200));
        else ok('N-R0b 判据段数漂移 → exit=2 且归因命中「判据自证失败」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}
{
    const dir = snapshot();
    const sp = path.join(dir, 'tests', 'audit', 'scanner_copy.mjs');
    const s0 = fs.readFileSync(sp, 'utf8');
    // 归因串改名：只改**调用点**（bad('R2 反向键越界' → 新名），声明数组不动。
    //   这正是真实的判别力丢失形态：扫描器照样能翻红，但负控制再也匹配不到它。
    //   （若连声明一起改，契约计数仍是 2，等于什么都没破——这条判据本身就要求
    //     「声明与调用点必须同名」，故破坏必须只动一侧。）
    const callAnchor = "bad('R2 反向键越界'";
    const before = s0.split(callAnchor).length - 1;
    if (before < 2) bad('N-R0c：调用点锚点在扫描器里出现 ' + before + ' 次（需 ≥2）');
    else {
        fs.writeFileSync(sp, s0.split(callAnchor).join("bad('R2_ATTR_RENAMED'"));
        const r = runAt(sp, dir);
        if (r.code !== 2) bad('N-R0c 归因串改名应 exit=2，实为 ' + r.code + '：' + r.text.slice(0, 200));
        else if (!r.text.includes('判据自证失败')) bad('N-R0c 翻红但归因不对：' + r.text.slice(0, 200));
        else ok('N-R0c 归因串调用点被改名（声明未同步）→ exit=2 且归因命中「判据自证失败」');
    }
    fs.rmSync(dir, { recursive: true, force: true });
}
// ── 还原自证：破坏只在临时副本里发生 ──
{
    const n = fs.readFileSync(NP, 'utf8');
    const b = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
    if (!n.includes('呜咽:2, ')) bad('原版 narrative-pulse.js 被污染（破坏了工作区）');
    else if (n.includes('惆怅:2')) bad('原版 narrative-pulse.js 混入了破坏用的临时词');
    else if (!b.lexicon || !b.lexicon.sad || b.lexicon.sad.indexOf('呜咽') < 0) bad('原版词表基线被污染');
    else ok('原版工作区未被触碰（词表与基线都完好）');
}
console.log('\n[v3.193 lex 负控制] ' + pass + ' 组成立 / ' + fail + ' 组失败');
process.exit(fail ? 1 : 0);