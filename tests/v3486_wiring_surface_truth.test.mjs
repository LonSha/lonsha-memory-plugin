/* ============================================================
 * tests/v3486_wiring_surface_truth.test.mjs — v3.486.0 模块接线面的消费口径
 * ------------------------------------------------------------
 * 【要治的形态】B4「已挂载但零消费」在 v3.485.0 报了 14 条，全是**真接线**：
 *   消费方住在面板层（dashboard-shell.js / v4-panel-ui.js / ui-panel-seam.js /
 *   v4-panel-bridge.js），而判据的消费面只认 index.js + 一份**手抄载体清单**。
 *   那份清单是逐轮补出来的（v3.264 / v3.301 / v3.439 / v3.461 / v3.474），
 *   同一类假红修了五轮，每轮都要再抄一遍文件名 —— 这说明问题不在清单少了几项，
 *   而在**口径量错了对象**：判据该问「有没有人用」，而不是「index.js 有没有用」。
 *
 * 【本档钉什么】
 *   A 真实仓库：扫描器 rc=0；读点读数有下限（防探测器退化后以全绿通过）；
 *     未消费数 == 账本数；不再有「B4 新出现」。
 *   B 口径正向/负控制（夹具目录真跑扫描器，不是模拟）：
 *     B1 跨文件真读点 ⇒ 算消费（绿）
 *     B2 提供者自读自己 ⇒ **不算**消费（必须红，这是自产自销假绿通道）
 *     B3 读点写在注释里 ⇒ **不算**消费（必须红，注释不算引用）
 *     B4 `mod('错名', './a.js')` ⇒ **不算**消费（必须红，登记表不能自证）
 *     B5 `mod('真名', './a.js')` ⇒ 算消费（绿）
 *   C 判据自身：B2 组的 index.js 扫描必须剥注释（贴一段只在注释里的 window.LonShaNope*）
 *   D 单一真源：v4-panel-ui.js 不得再挂两个只差大小写的全局名
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(HERE, '..');
const SCANNER = path.join(HERE, 'audit', 'scan_module_wiring.mjs');
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

/* 夹具：写一份最小仓库，用 LONSHA_AUDIT_FIXTURE=1 真跑扫描器。
 *   为什么不喂纯函数：本档要证明的是「扫描器这个程序」的口径，
 *   把逻辑抄进判据里再测自己 = 自我指涉。 */
function runFixture(files) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3486-'));
    try {
        const extra = Object.keys(files).filter((f) => f !== 'index.js');
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ js: 'index.js', extra_js: extra }));
        /* 入口必须存在（manifest.js 指向它）：没给的夹具补一个空入口，
         *   否则扫描器报「注册了不存在的文件」—— 那是夹具的问题，不是口径的问题。 */
        if (!files['index.js']) fs.writeFileSync(path.join(dir, 'index.js'), 'console.log(1);\n');
        for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), body);
        const r = spawnSync(process.execPath, [SCANNER], {
            cwd: dir, encoding: 'utf8', env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1' },
        });
        return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
}
const UNCONSUMED = (out, name) => new RegExp('B4 新出现「已挂载但零消费」的模块全局 ' + name).test(out);

/* ══════════ A 真实仓库 ══════════ */
test('A1 真实仓库：扫描器 rc=0，且读点读数有下限（探测器退化不许全绿）', () => {
    const r = spawnSync(process.execPath, [SCANNER], { cwd: REPO, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    assert.equal(r.status, 0, '真实仓库审计应通过\n' + out);
    const m = /全仓真读点 (\d+) 个（B4 口径）/.exec(out);
    assert.ok(m, '扫描器必须报出「全仓真读点 N 个（B4 口径）」——读数缺失时口径可能已空转\n' + out);
    const n = Number(m[1]);
    assert.ok(n >= 300, 'B4 口径的读点数必须有下限（fail-closed）：实 ' + n + '\n' + out);
    const rd2 = /读了 (\d+) 个已注册脚本/.exec(out);
    assert.ok(rd2 && Number(rd2[1]) >= 400, '必须真的逐个读已注册脚本，实 ' + (rd2 ? rd2[1] : '未报'));
});

test('A2 真实仓库：未消费数 == 账本数，且不再有「B4 新出现」', () => {
    const r = spawnSync(process.execPath, [SCANNER], { cwd: REPO, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const m = /已挂载未消费 (\d+) 个（账本 (\d+) 个）/.exec(out);
    assert.ok(m, '必须报出「已挂载未消费 N 个（账本 M 个）」\n' + out);
    assert.equal(m[1], m[2], '未消费数必须等于账本数（多出来的就是没记账的静默腐烂）\n' + out);
    assert.ok(!/B4 新出现/.test(out), '不得再有未记账的零消费模块\n' + out);
});

test('A3 真实仓库：v3.485.0 那 14 条真接线必须被认账（逐个点名复验）', () => {
    const r = spawnSync(process.execPath, [SCANNER], { cwd: REPO, encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const names = ['LonShaUiKit', 'LonShaSummaryTree', 'LonShaFloorPanel', 'LonShaDataPanels',
        'LonShaUiSeam', 'LonShaJsonTree', 'LonShaUiTable', 'LonShaFormControls',
        'LonShaSettingsPanel', 'LonShaWindowPlan', 'LonShaStorageCodec', 'LonShaRulesCompile',
        'LonShaV4PanelUi', 'LonShaIcons', 'LonShaDashboardV2', 'LonShaDevConsole'];
    const bad = names.filter((n) => UNCONSUMED(out, n));
    assert.deepEqual(bad, [], '这些真接线又被判成零消费了：' + bad.join(', ') + '\n' + out);
});

/* ══════════ B 口径正向 / 负控制（夹具真跑） ══════════ */
test('B1 正向：跨文件真读点算消费', () => {
    const { status, out } = runFixture({
        'a.js': '(function () { window.LonShaAlpha = { v: 1 }; })();\n',
        'b.js': '(function () { var x = window.LonShaAlpha; void x; })();\n',
    });
    assert.equal(status, 0, '跨文件真读点应被认账\n' + out);
    assert.ok(!UNCONSUMED(out, 'LonShaAlpha'), '不该判零消费\n' + out);
});

test('B2 负控制·自产自销：提供者读自己不算消费（必须红）', () => {
    const { status, out } = runFixture({
        'a.js': '(function () { window.LonShaAlpha = {}; var x = window.LonShaAlpha; void x; })();\n',
    });
    assert.equal(status, 1, '提供者自读自销必须仍然报红\n' + out);
    assert.ok(UNCONSUMED(out, 'LonShaAlpha'), '应报 B4（否则「自产自销」成了假绿通道）\n' + out);
});

test('B3 负控制·注释不算引用：读点只在注释里必须红', () => {
    const { status, out } = runFixture({
        'a.js': '(function () { window.LonShaAlpha = {}; })();\n',
        'b.js': '// 有人在这里写 window.LonShaAlpha 但其实没读\nconsole.log(1);\n',
    });
    assert.equal(status, 1, '注释里的读点不算消费\n' + out);
    assert.ok(UNCONSUMED(out, 'LonShaAlpha'), '应报 B4\n' + out);
});

test('B4 负控制·登记表不能自证：mod 写了错名不算消费（必须红）', () => {
    const { status, out } = runFixture({
        'a.js': '(function () { window.LonShaAlpha = {}; })();\n',
        'b.js': '(function () { var mod = function () { return null; }; void mod(\'LonShaBeta\', \'./a.js\'); })();\n',
    });
    assert.equal(status, 1, '名字与真挂载名不一致时不算消费\n' + out);
    assert.ok(UNCONSUMED(out, 'LonShaAlpha'), '应报 B4（否则登记表写错名也能自证为绿）\n' + out);
});

test('B5 正向：mod 写对了真名才算消费（真名核对通过）', () => {
    const { status, out } = runFixture({
        'a.js': '(function () { window.LonShaAlpha = {}; })();\n',
        'b.js': '(function () { var mod = function () { return null; }; void mod(\'LonShaAlpha\', \'./a.js\'); })();\n',
    });
    assert.equal(status, 0, '真名核对通过就该认账\n' + out);
    assert.ok(!UNCONSUMED(out, 'LonShaAlpha'), '不该判零消费\n' + out);
});

/* ══════════ C 判据自身：入口扫描要剥注释 ══════════ */
test('C1 入口注释里的 window.LonShaNope* 不得被当成取库名', () => {
    const { status, out } = runFixture({
        'index.js': '/* 宿主按 extra_js 装载后挂在 window.LonShaNope*，故先取全局再回落 require */\n'
            + 'var d = window.LonShaDummy;\nvoid d;\n',
        'g.js': '(function () { window.LonShaDummy = {}; })();\n',
    });
    assert.equal(status, 0, '注释不算引用（v3.472.0 纪律）\n' + out);
    assert.ok(!/LonShaNope/.test(out), '注释里的名字不得进入引用面\n' + out);
});

/* ══════════ D 单一真源：一个模块一个全局名 ══════════ */
test('D1 v4-panel-ui.js 不得再挂两个只差大小写的全局名', () => {
    const src = read('v4-panel-ui.js');
    assert.ok(src.includes('root.LonShaV4PanelUi'), '必须挂消费方用的那个名字');
    /* 只认**挂载语句**（`root.X =` / `window.X =`），不认注释里提到这个名字 ——
       注释里点出历史名是留痕，不是第二个挂载点。 */
    const mounts = (src.match(/(?:\broot|\bwindow|\bglobalThis)\s*\.\s*LonShaV4PanelUI\s*=(?!=)/g) || []);
    assert.deepEqual(mounts, [], '大小写另一版仍有挂载语句：' + mounts.join(', '));
    const seam = read('ui-panel-seam.js');
    assert.ok(seam.includes("mod('LonShaV4PanelUi', './v4-panel-ui.js')"), '消费方名与挂载名必须一致');
});

/* ══════════ E 当版自锚 ══════════ */
test('E1 当版自锚：版本不低于本档出生版本', () => {
    const vnum = (s) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    const cur = (/const VERSION = '([0-9.]+)'/.exec(read('index.js')) || [])[1];
    assert.ok(vnum(cur) >= 3486000, '版本应 >= 3.486.0，实得 ' + cur);
    /* 当版锚（V4）：本档是 frontier，锚用**字面量形**落在自己档案里。
       历史文件里的同款锚必须降为下界（v3.486.0 已把 v3485 那条降级）。 */
    assert.equal(vnum('3.486.0'), 3486000, '当版号与数值锚必须逐位相等');
    assert.equal(JSON.parse(read('manifest.json')).version, cur);
    assert.equal(JSON.parse(read('package.json')).version, cur);
});