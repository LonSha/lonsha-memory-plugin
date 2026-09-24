// 审计基建 V（v3.203.0）：版本守卫不再把「当前版本」写死进历史测试
//
// 存在理由：至少 9 个历史测试把上一版版本号写进断言期望值，且另有一整套「交棒链」
//   断言要求历史文件的版本下界随抬版上抬。两者合起来让每次发版都要人工批量替换
//   （v3.202.0 实测 21 处，漏一处门禁翻红）。v3.203.0 拆掉这套仪式：
//   历史测试只锁「自己的出生版本」，交棒链改为「不承诺高于现版」。
//
// 判据（全部版本无关，发版时无需修改本脚本）：
//   V1 三源同源（index.js VERSION / manifest.version / package.json version）
//      —— package.json 是构建产物、不进插件分发，夹具树里可以不在场。
//   V2 历史测试（非当版 frontier）不得用 assert.equal / assert.strictEqual /
//      String.includes 把 VERSION 锁成「恰好等于当前版本」
//   V3 历史测试里的版本下界（vnum('X.Y.Z')）不得高于当前版本
//      —— 高于现版即「承诺了一个还没发布的版本」，也是抬版仪式留下的痕迹
//   V4 当版锚点必须在场：至少一个测试以 vnum 恰好锚着当前版本
//      （锚点被静默删空时，版本守卫就失去基准，必须响）
//   V5 结构面：frontier 存在、扫描面不少于 50 个测试文件
// 退出码：0 通过 / 1 发现违规 / 2 结构漂移（读不到版本、测试目录为空）
//
// 当版 frontier 豁免：当版测试在被下一版接管前用硬等号锁自己，是既有交棒口径。
//   豁免按「文件头注释里的版本 == 当前版本」判定，不写死文件名。
import fs from 'fs';
import path from 'path';

const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const TESTS = path.join(ROOT, 'tests');

function read(rel) {
    const p = path.join(ROOT, rel);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf8');
}
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
function failClosed(msg) {
    console.error('[version-guard] ' + msg);
    process.exit(2);
}

/* ---- V1 三源同源 ---- */
const index = read('index.js');
if (!index) failClosed('读不到 index.js');
const vm = /const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(index);
if (!vm) failClosed('index.js 里找不到 const VERSION');
const current = vm[1];
const problems = [];

const manifestRaw = read('manifest.json');
if (!manifestRaw) failClosed('读不到 manifest.json');
let manifest;
try { manifest = JSON.parse(manifestRaw); }
catch (e) { failClosed('manifest.json 不是合法 JSON'); }
if (manifest.version !== current) problems.push('V1 manifest.version ' + manifest.version + ' != VERSION ' + current);
const pkgRaw = read('package.json');
if (pkgRaw) {
    let pkg;
    try { pkg = JSON.parse(pkgRaw); }
    catch (e) { failClosed('package.json 不是合法 JSON'); }
    if (pkg.version !== current) problems.push('V1 package.json version ' + pkg.version + ' != VERSION ' + current);
}

/* ---- 扫描面 ---- */
if (!fs.existsSync(TESTS)) failClosed('tests/ 不存在');
const files = fs.readdirSync(TESTS).filter((f) => f.endsWith('.test.mjs')).sort();
if (files.length < 50) failClosed('tests/ 下测试文件过少（' + files.length + '），扫描面不可信');

// 硬锁当前版本的两种形态。只认代码行，不认注释。
//   （旧实现用动态 RegExp 拼 current，转义层数一多就静默失灵 —— 本轮实测：
//    V2 在硬等号注入下仍报 exit 0。改为纯字符串判定，不经过正则转义。）
const ASSERT_CALL = /assert\.\s*(?:equal|strictEqual|deepStrictEqual|deepEqual)\s*\(/;
// 引号三态都要认：单引号 / 双引号 / 反引号。本轮实测只认单引号时，
//   注入 `assert.strictEqual(v, "<当前版>")` 会被静默放过（负控制 N1 当场漏判）。
const QUOTES = ["'", '"', '`'];
function quotedVersions(line) {
    return QUOTES.some((q) => line.includes(q + current + q));
}
function hardLocksCurrent(codeLine) {
    if (quotedVersions(codeLine) && ASSERT_CALL.test(codeLine)) return true;
    if (/includes\s*\(/.test(codeLine) && QUOTES.some((q) => codeLine.includes('const VERSION = ' + q + current + q + ';'))) return true;
    return false;
}
const boundRe = /vnum\(\s*'([0-9]+[.][0-9]+[.][0-9]+)'\s*\)/g;

let scanned = 0;
const frontier = [];
let anchored = 0;
for (const f of files) {
    const text = fs.readFileSync(path.join(TESTS, f), 'utf8');
    const head = text.split('\n').slice(0, 12).join('\n');
    // frontier 豁免必须**结构化**，不能只看「前 12 行出现过当版号」：
    //   本轮实测（3.204.0）——36 个文件的去绝对化注记里写了「[v3.204.0] …」，
    //   于是前 12 行含当版号，32 个文件被误判成 frontier，V2/V3 对它们静默失效。
    //   文件头里出现版本号是**正常**的（历史测试都标自己的出生版本）；
    //   真正标志 frontier 的是「文件头同时出现自己的文件名与当版号」——
    //   即那行把「本文件就是当版」说清楚了。
    const base = f.replace(/[.]test[.]mjs$/, '');
    // 精确形态：**同一行**同时出现本文件名与当版号（规范头 `* tests/<name>.test.mjs — v<ver>`）。
    //   只看「前 12 行含当版号」太松（3.204.0 实测：36 个文件的去绝对化注记写在头部，
    //   32 个文件被误判为 frontier，V2/V3 对它们静默失效）；
    //   只看「含文件名 + 含当版号」也太松（11 个文件首行自报文件名、头两句里有注记）。
    const isFrontier = text.split('\n').slice(0, 12)
        .some((l) => l.includes(base) && l.includes('v' + current));
    // V4 计数：任何文件（含 frontier）恰好锚着当前版本，都算当版锚点在场。
    if ([...text.matchAll(boundRe)].some((m) => vnum(m[1]) === vnum(current))) anchored++;
    if (isFrontier) { frontier.push(f); continue; }
    scanned++;
    const code = text.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    for (const [i, line] of text.split('\n').entries()) {
        const codeLine = line.replace(/\/\/.*$/, '');
        if (!codeLine.trim()) continue;
        if (hardLocksCurrent(codeLine)) {
            problems.push('V2 ' + f + ':' + (i + 1) + ' 把当前版本 ' + current + ' 写死成等号：' + line.trim().slice(0, 120));
        }
    }
    // V3：非当版文件的下界不得高于当前版（不得承诺未来）。
    for (const m of code.matchAll(boundRe)) {
        if (vnum(m[1]) > vnum(current)) {
            const at = code.slice(0, m.index).split('\n').length;
            problems.push('V3 ' + f + ':' + at + ' 版本下界 ' + m[1] + ' 高于当前版 ' + current + '（不得承诺未来）');
        }
    }
}

if (frontier.length === 0) {
    problems.push('V5 扫描面异常：没有任何测试文件的头部标着当版 ' + current + '（frontier 豁免失效，或版本声明漂移）');
}
if (anchored === 0) {
    problems.push('V4 没有任何测试恰好锚着当版 ' + current + '（当版锚点被删空，版本守卫失去基准）');
}

console.log('=== 版本守卫：当前 ' + current + ' / 历史测试 ' + scanned
    + ' / 当版 frontier ' + frontier.length + ' / 当版锚点 ' + anchored + ' / 问题 ' + problems.length + ' ===');
if (frontier.length) console.log('  frontier: ' + frontier.join(', '));
if (problems.length) {
    for (const x of problems) console.log('  x ' + x);
    console.error('');
    console.error('[version-guard] 发现 ' + problems.length + ' 处。');
    console.error('  V2 修法：三源互等 + vnum(v) >= vnum(该测试自己的出生版本)，不要写死当前版本。');
    console.error('  V3 修法：把历史测试的版本下界改回它自己的出生版本，不要再跟着抬版。');
    process.exit(1);
}
console.log('');
console.log('[version-guard] 通过：历史测试不用硬等号锁当前版本，下界不承诺未来，当版锚点在場。');
process.exit(0);
