/* ============================================================
 * tests/v3304_head_defect_sweep.test.mjs — 抬版前的一次真缺陷清扫 [v3.304.0]
 * ------------------------------------------------------------
 * 本档的来历：本轮进入第二期双项目并行推进时，先对记忆插件仓跑了一次
 * **全量**（`npm test`，284 文件 / 3090 断言），实测 **5 个文件失败**。
 * 工作区**干净**（`git status --porcelain` 为 0）⇒ 这 5 处不是未提交的中间态，
 * 而是 **v3.303.0 提交自带**的缺陷。逐条定性（这是本档存在的全部理由：
 * 缺陷必须先被**分类**，否则「修了」与「绕开了」看起来一样）：
 *
 *   ① `settings-ui.js` 里 `preferModuleFiles` **声明了却两侧都不可设**
 *      ⇒ 引擎读到的永远是硬编码 true。这是 v3161 的 [1] 不变量（declared ⊆
 *      UI 可设置 ∪ 卡白名单）当场抓出的**真缺陷**。
 *   ② `scan_v3180_three_faces.mjs` 判 `this.status.clock = this.clock` **只查子串**
 *      ⇒ 构造器那处被破坏时，重建重挂那一行替它满足了子串，判据**恒绿**。
 *      这是判据面缺陷（本仓点名的「假绿第四形」：判据对破坏无反应），
 *      由 v3180 的负控制 V7 当场抓出 —— **判据自己坏了，不是被测对象坏了**。
 *   ③ `tests/v3259` 的「构造点唯一」按**整文本计数** ⇒ 把 v3.301.0 新增的
 *      「缺席退路替换点」也算成第二次构造。同样是判据面缺陷（判据比事实宽）。
 *   ④ `tests/v374` 断言的 `eng.summary.updateSummaryText(id, nt)` 是 v3.303.0
 *      **已修掉**的旧写法（真源改成 `Number(key)`）⇒ 判据停在旧口径。
 *   ⑤ `tests/audit/host_beast_baseline.json` 的 `measured_at` 停在 v3.302.0
 *      ⇒ 「当版须已在基线留读数」当场红。这是**登记面陈旧**（不是数据缺陷）。
 *
 * 分类后的处置：① 是**产品缺陷**（补真开关）；②③ 是**判据面缺陷**（收紧判定，
 * 不放宽）；④⑤ 是**登记面陈旧**（按真源刷新，零手抄）。
 *
 * 本档守四件事：
 *   A 产品面：`preferModuleFiles` 真进了面板（可达性不变量在本档内再证一次）；
 *   B 判据面：三条判据**各自**对「对应那一种破坏」有反应（真源码破坏 → 同款判据转红）；
 *   C 登记面：基线 `measured_at` 与当版同源，且行数等于真 index.js；
 *   D 版本锚（下限形）。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');
const IDX = read('index.js');
const SUI = read('settings-ui.js');
const CUR = (/const VERSION = '([0-9.]+)'/.exec(IDX) || [])[1];

const temps = [];
function scratch(tag) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3304-' + tag + '-'));
    temps.push(dir);
    return dir;
}
process.on('exit', () => {
    for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) { /* 忽略 */ } }
});
/** 在临时根上跑一个审计门（真进程，`LONSHA_AUDIT_ROOT` 指过去）。 */
function runGate(rel, root) {
    return spawnSync(process.execPath, [path.join(REPO, rel)], {
        cwd: root || REPO, encoding: 'utf8', timeout: 180000,
        env: Object.assign({}, process.env, root ? { LONSHA_AUDIT_ROOT: root } : {})
    });
}

/* ══════════════════ A 产品面：可达性不变量 ══════════════════ */

test('A1 产品缺陷①：preferModuleFiles 有真控件（声明可达性不变量当场复核）', () => {
    /* 声明面：memory-config.js 的默认配置里真声明了它；读面：index.js 真读它。 */
    assert.match(read('memory-config.js'), /preferModuleFiles\s*:/, '配置键必须在默认块里声明');
    assert.match(IDX, /config\.preferModuleFiles === false/, '引擎必须真读它（否则是死声明）');
    /* 设置面：面板真挂了控件（v3161 [1] 的不变量：可达 = UI 可设 ∪ 卡白名单） */
    /* 控件是 ck(key, …) 模板插值生成的（data-cfg 由 ${key} 填）⇒ 认**调用形**，
     *   与 v3161 的 uiSettable() 抽取器同口径。 */
    assert.match(SUI, /ck\('preferModuleFiles'/, '面板必须有真控件（本版修的缺陷）');
    assert.match(SUI, /ck\('preferModuleFiles'/, '控件必须经 ck 生成（与其余开关同形）');
    /* 反向：模板串里不得出现**裸 JS 注释**（那会被当模板文本输出并破坏解析 —— 本版踩过） */
    const head = SUI.slice(SUI.indexOf('const body = `'), SUI.indexOf('const body = `') + 4000);
    assert.equal(/^\s*\/\*/.test(head.split('\n').slice(1).find((l) => l.includes('preferModuleFiles')) || ''),
        false, '模板字面量内不得放 JS 注释');
});

/* ══════════════════ B 判据面：三条判据对各自那种破坏有反应 ══════════════════ */

const GATE_3180 = 'tests/audit/scan_v3180_three_faces.mjs';
const SUI_ANCHOR_CLOCK = '            this.status.clock = this.clock;';

test('B1 判据缺陷②：破坏「构造器注入」必须让三面门转红（修前它恒绿）', () => {
    /* 夹具必须铺**完整输入面**：门在缺件时 fail-closed exit 2，而那证明的是「输入面缺失」
     *   不是「判据会响」（本仓登记过的踩坑）。故逐项复制门真正会读的那批文件。 */
    const dir = scratch('b1');
    /* 清单与负控制门自身的 GAUGED 逐字同形（floor-identity / age-anchor / public-interface /
     *   index.js / memory-core.js）—— 加内存面是**输入面缺失会 fail-closed**，多复制无害。 */
    const NEED = ['floor-ledger.js', 'age-anchor.js', 'public-interface.js', 'index.js',
        'memory-core.js', 'memory-config.js', 'manifest.json'];
    for (const f of NEED) {
        const src = path.join(REPO, f);
        assert.ok(fs.existsSync(src), '夹具输入面缺件（门会 fail-closed，测的不是判据）：' + f);
        fs.copyFileSync(src, path.join(dir, f));
    }
    const ok = runGate(GATE_3180, dir);
    if (ok.status !== 0) console.error('[B1 fixture] ' + String(ok.stderr || ok.stdout || '').slice(-600));
    assert.equal(ok.status, 0, '前提：未破坏时门必须 exit 0（否则本用例是假绿）：' + ok.stdout.slice(-400));
    const p = path.join(dir, 'index.js');
    const before = fs.readFileSync(p, 'utf8');
    const hits = before.split(SUI_ANCHOR_CLOCK).length - 1;
    assert.equal(hits, 1, '锚点必须恰中 1 次（实测 ' + hits + '）');
    fs.writeFileSync(p, before.split(SUI_ANCHOR_CLOCK).join('            /* 破坏：状态层拿不到时钟 */'));
    const bad = runGate(GATE_3180, dir);
    assert.notEqual(bad.status, 0, '构造器注入被摘之后门必须转红（修前它靠重建重挂那行恒绿）');
    assert.match(String(bad.stdout || '') + String(bad.stderr || ''), /未把时钟交给状态层|构造器里的独立注入语句不在位/,
        '必须点名「构造器注入不在位」这一条：' + String(bad.stdout || '').slice(-300));
});

test('B2 判据缺陷②的负控制自身仍成立：真实源码上三面门必须绿', () => {
    const r = runGate(GATE_3180, null);
    assert.equal(r.status, 0, '真仓上三面门必须 exit 0：' + String(r.stdout || '').slice(-400));
    assert.match(String(r.stdout || ''), /时钟两处接线同在/, '门必须报出「两处接线同在」这条读数');
});

test('B3 登记面⑤：基线 measured_at 与当版同源，行数等于真 index.js', () => {
    const b = JSON.parse(read('tests/audit/host_beast_baseline.json'));
    assert.equal(b.measured_at, 'v' + CUR, '基线当版读数必须与真源同源（本版修的陈旧登记）');
    assert.equal(b.readings.total_lines, IDX.split('\n').length, '基线行数必须等于真 index.js 行数');
    assert.ok(b.rebuilds[b.measured_at], '当版必须在 rebuilds 面留读数');
    assert.equal(b.rebuilds[b.measured_at].readings.total_lines, b.readings.total_lines, 'rebuilds 与 readings 同读数');
});

test('B4 判据缺陷④：v374 的关键字断言与真源同形（不许停在旧写法）', () => {
    const v374 = read('tests/v374_manual_summary.test.mjs');
    /* 断言面必须认真源现在的那个写法（带楼层键归一化），且**不得**退回旧写法。 */
    /* 与真源那行**逐字同形**：JS 正则里的 `\.` 在源码文本中是两个字符（反斜杠 + 点），
     *   所以这里也按文本比对 `\\.` —— 直接写 `updateSummaryText(Number(key), nt)` 会找不到。 */
    assert.ok(v374.includes('updateSummaryText\\\(Number\\\(key\\\), nt\\\)'), 'v374 必须断言带楼层键的调用形（真源口径）');
    assert.match(SUI, /eng\.summary\.updateSummaryText\(Number\(key\), nt\)/, '真源必须是那个带楼层键的写法');
    assert.equal(/su\.includes\('eng\.summary\.updateSummaryText\(id, nt\)'\)/.test(v374), false,
        'v374 不得再停在 v3.303.0 已修掉的旧写法上');
});

/* ══════════════════ C 判据缺陷③：构造点唯一性的口径 ══════════════════ */

test('C1 判据缺陷③：v3259 的「构造点唯一」与真源同形（区分构造与缺席退路替换）', () => {
    const v3259 = read('tests/v3259_a1_memory_aux.test.mjs');
    assert.match(v3259, /_absent === true/, 'v3259 必须把「缺席退路替换点」与「构造点」分开计');
    assert.match(v3259, /无条件命中/, '必须按「无条件构造」计数并如实报数');
    /* 真源侧：两种形态都真实存在（这条判据若只认其中一种就会误判） */
    assert.ok(IDX.includes("_newMemoryAux('EmergencyBackup'"), '真源须有构造点');
    assert.match(IDX, /_absent === true\) \{\s*\n\s*this\.emergency = _newMemoryAux/, '真源须有缺席退路替换点');
});

/* ══════════════════ D 版本锚（下限形） ══════════════════ */

test('D1 版本锚（下限形）+ 三源同源', () => {
    const man = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    const nums = [man.version, pkg.version, CUR].map(String);
    assert.equal(new Set(nums).size, 1, '三源版本必须同源：' + nums.join(' / '));
    const vnum = (s) => String(s).split('.').map(Number).reduce((a, b) => a * 1000 + b, 0);
    assert.ok(vnum(nums[0]) >= vnum('3.304.0'), '版本不得低于 3.304.0（本档生于该版）：' + nums[0]);
});