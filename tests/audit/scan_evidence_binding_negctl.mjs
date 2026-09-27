// 证据面契约门禁的**负控制**（v3.248.0）：证明 scan_evidence_binding.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 判据恒绿有三种伪装（本仓 v3.191 起的老三形，v3.247.0 收编进 tests/_break_kit.mjs）：
//   ① 对原文件断言 —— 破坏没发生也绿；
//   ② 把破坏写死成模拟常量 —— 真判据根本没被调用；
//   ③ 破坏把判据自己删了 —— 自我指涉。
// 本档统一用「真源码破坏 → 独立 fixture 树 → 在副本上重跑**同一个门禁**」排除这三种。
//
// 纪律（与本仓其它 negctl 同源）：
//   · 每次破坏发生在**独立 fixture 目录**里，只搬判据真正读的文件
//     （`evidence-workbench.js` / `index.js` / `manifest.json`）——
//     LONSHA_AUDIT_ROOT 指过去 ⇒ 源仓库零污染，且判据读的确实是「被破坏的那份真源码」。
//   · 锚点必须**恰中期望次数**：命中数不符 ⇒ 该组作废并报错
//     （防锚点漂移后静默跳过，把「没破坏成功」误读成「判据对破坏无反应」）。
//   · 只断言「退出码对」**不够**：exit 1 也可能来自另一条判据 ⇒ 每组另断言**缺陷点名**
//     （marker 必须出现在输出里），即「红得对，不是红得巧」。
// 判据：V0 原版对照必须 exit 0；V1~V6 逐组命中期望退出码且带期望点名；V7 结构漂移须 exit 2。
// 退出码：0=负控制成立  1=负控制失效  2=结构漂移（负控制无法建立）
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN = path.join(HERE, 'scan_evidence_binding.mjs');
/* 判据真正读的三个文件。**不手抄门禁清单**（本仓 v3.240.0 的教训：手抄必漂移），
 *   但仍需显式一份 —— 因为门禁读的是「固定三件」，不是 manifest 派生的集合。
 *   自证：三件都必须存在，且 manifest 里的 extra_js 必须真含证据面（否则 R1 在夹具里
 *   必然先报「未登记」，那个红会被读成「判据工作正常」—— 空对空）。 */
const GAUGED = ['evidence-workbench.js', 'index.js', 'manifest.json'];
/* [v3.248.0 首跑实测] 上面这份手抄清单**喂不满**门禁：R4 会逐个 `fs.existsSync` 九本账，
 *   夹具里没有它们 ⇒ V0 原版对照在夹具里 exit 1（R4 报「磁盘上不存在该文件」），
 *   而那个红与「真缺陷」同形 —— 负控制会**空对空**地「七组全绿」而 V0 永远红。
 *   这正是本仓 v3.240.0 记过的形态（夹具少一本账 ⇒ 门禁在夹具里提前 bail ⇒ 红的不是判据）。
 *   修法：账本清单**从门禁的真源派生**（宿主 `_ledgerApis()` 里点名的文件名），不手抄。
 *   与门禁 R4 同源 ⇒ 门禁多接一本账，夹具自动跟上，没有第二处可漏。 */
const IDX_SRC = fs.readFileSync(path.join(REPO, 'index.js'), 'utf-8');
const { bodyOf: BODY_OF } = await import('../_audit_lib.mjs');
const apiSeg = BODY_OF(IDX_SRC, 'function _ledgerApis(');
if (!apiSeg) {
    console.error('[evidence-negctl] 从 index.js 取不到 `_ledgerApis()` 体 ——结构漂移（账本清单无从派生）');
    process.exit(2);
}
/* 与门禁**同源**的解析：九键里三本走助手（`_factVersionLib()` 等），文件名写在助手体内。
 *   [自纠] 首版只在 `_ledgerApis()` 段内抓 `'x.js'` ⇒ 只派生 6 本（三本文件名在助手体里），
 *   于是本行以「派生 6 < 期望 9」exit 2 —— 探针自己的**抽取面**比判据窄，
 *   看起来像「结构漂移」，实际是探针抽得不全。故助手体也要展开。 */
const KEYS = [...apiSeg.matchAll(/^\s*'([^']+)'\s*:/gm)].map((m) => m[1]);
const LEDGER_FILES = [];
for (const k of KEYS) {
    const helper = new RegExp("'" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*_(\\w+)\\(\\)").exec(apiSeg);
    if (helper) {
        const hb = BODY_OF(IDX_SRC, 'function _' + helper[1] + '(');
        const hm = hb && /'([A-Za-z0-9_-]+\.js)'/.exec(hb);
        if (!hm) {
            console.error('[evidence-negctl] 助手 _' + helper[1] + '() 里取不到文件名 ——结构漂移（账本清单无从派生）');
            process.exit(2);
        }
        LEDGER_FILES.push(hm[1]);
        continue;
    }
    const direct = new RegExp("'" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*safe\\(\\(\\)\\s*=>\\s*window\\.\\w+\\s*,\\s*'([A-Za-z0-9_-]+\\.js)'\\)").exec(apiSeg);
    if (!direct) {
        console.error('[evidence-negctl] 九键里的 ' + k + ' 两种形态都解析不出 ——结构漂移（探针抽取面过期）');
        process.exit(2);
    }
    LEDGER_FILES.push(direct[1]);
}
const UNIQ = [...new Set(LEDGER_FILES)];
if (UNIQ.length < 9) {
    console.error('[evidence-negctl] 派生出 ' + UNIQ.length + ' 本账（期望 ≥9）——结构漂移（探针吃不到判据的真源面）');
    process.exit(2);
}
for (const f of UNIQ) {
    if (!fs.existsSync(path.join(REPO, f))) {
        console.error('[evidence-negctl] 派生出的账本 ' + f + ' 在真仓库里不存在 ——结构漂移（判据会在夹具里空对空报红）');
        process.exit(2);
    }
}
console.log('[evidence-negctl] 账本清单由 `_ledgerApis()` 派生：' + UNIQ.length + ' 本');
GAUGED.push(...UNIQ);
if (!fs.existsSync(SCAN)) {
    console.error('[evidence-negctl] 缺门禁 scan_evidence_binding.mjs ——结构漂移（负控制无法建立）');
    process.exit(2);
}
for (const f of GAUGED) {
    if (!fs.existsSync(path.join(REPO, f))) {
        console.error('[evidence-negctl] 缺文件 ' + f + ' ——结构漂移（负控制无法建立）');
        process.exit(2);
    }
}
const mf0 = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf-8'));
if (!Array.isArray(mf0.extra_js) || mf0.extra_js.indexOf('evidence-workbench.js') < 0) {
    console.error('[evidence-negctl] manifest.extra_js 里没有 evidence-workbench.js ——结构漂移（R1 会在夹具里空对空报红）');
    process.exit(2);
}
/* 锚点前置核对：每个用到的锚点在**真源码**里必须存在。
 *   锚点漂移了而这里不拦，V 组会以「命中 0 次」作废 —— 看起来是「本组跳过」，
 *   实际是「本判据这一向从此没人测了」的静默。故前置失败一律结构漂移。 */
const ANCHORS = [
    ['evidence-workbench.js', "apiGlobal: 'LonShaSeedLedger',"],
    ['evidence-workbench.js', "            project: (it) => ({\n                title: text(it.hook, MAX_TEXT),"],
    ['evidence-workbench.js', 'const api = Object.freeze({'],
    ['index.js', "            'repair': _repairLoopLib()"],
    ['manifest.json', '    "evidence-workbench.js",\n']
];
for (const [f, a] of ANCHORS) {
    const src = fs.readFileSync(path.join(REPO, f), 'utf-8');
    const n = src.split(a).length - 1;
    if (n !== 1) {
        console.error('[evidence-negctl] 锚点在 ' + f + ' 命中 ' + n + ' 次（期望 1）：' + JSON.stringify(a.slice(0, 60))
            + ' ——锚点已漂移，结构漂移');
        process.exit(2);
    }
}
console.log('[evidence-negctl] 夹具清单 ' + GAUGED.length + ' 件；锚点前置核对通过（5 处各恰中 1 次）');

// (名字, 目标文件 | 'DELETE', 锚点, 替换为, 期望命中数, 期望退出码, 期望点名, 说明)
const CASES = [
    ['V0-原版对照', null, null, null, null, 0,
        '通过：九账登记与宿主取库',
        '不破坏：同 fixture 机制下必须 exit 0（否则后面所有「翻红」都不可归因）'],
    /* ---------- R3 存活性（计划 #11）：apiGlobal 改名 ---------- */
    ['V1-登记表 apiGlobal 改名（seed）', 'evidence-workbench.js',
        "apiGlobal: 'LonShaSeedLedger',", "apiGlobal: 'LonShaSeedBook',", 1, 1,
        'R3 登记表 seed(伏笔) 声明 apiGlobal=LonShaSeedBook',
        '改这名 = 宿主仍取旧键 ⇒ readLedger 落 absent/module-unavailable ⇒ 工作台永远显示「模块未挂」而**全仓没有一道门会响**。这正是 #11 要挡的静默失效'],
    /* ---------- R5 键集对差：两向 ---------- */
    ['V2-登记表多一项（宿主没这一键）', 'evidence-workbench.js',
        "            id: 'repair', label: '修复闭环', apiGlobal: 'LonShaRepairLoop',",
        "            id: 'repair-mirror', label: '修复镜像', apiGlobal: 'LonShaRepairMirror',\n"
            + "            id: 'repair', label: '修复闭环', apiGlobal: 'LonShaRepairLoop',", 1, 1,
        'R5 登记表有而宿主取库面没有的键：repair-mirror',
        '登记表加了第十本账而宿主没接 ⇒ 该账永远读成缺席。R3 另报「宿主没有 LonShaRepairMirror」，是同一事实的存活性面'],
    ['V3-宿主取库面多一键（登记表没有）', 'index.js',
        "            'repair': _repairLoopLib()",
        "            'repair': _repairLoopLib(),\n            'seed-mirror': safe(() => window.LonShaSeedLedger, 'seed-ledger.js')", 1, 1,
        'R5 宿主取库面有而登记表没有的键：seed-mirror',
        '宿主取了库但没人读 ⇒ 又一处「有字段没人读」（本仓治理过多轮的形态）。反向必须与 V2 分别成立，否则只能证明对差是单向的'],
    /* ---------- R6 project 调用点兼容（计划 #12） ---------- */
    ['V4-project 调用点退化单参', 'evidence-workbench.js',
        'spec.project(it, api)', 'spec.project(it)', 1, 1,
        'R6 project 调用点退化为单参',
        'v3.233.0 起 event-completeness 那一本要靠 api 取段真值；退化后该账**不抛**、只是投影列少一截 —— 读数错而不报错（第二个静默失效）'],
    /* ---------- R1 加载面 ---------- */
    ['V5-证据面未登记 extra_js', 'manifest.json',
        '    "evidence-workbench.js",\n', '', 1, 1,
        'R1 evidence-workbench.js 未登记进 manifest.extra_js',
        '在册被删 ⇒ 浏览器静默不加载 ⇒ 宿主 _moduleLib 一直取空 ⇒ 工作台永远缺席（「不在加载面」与「加载了但坏了」是两个实验）'],
    ['V6-证据面导出被摘', 'evidence-workbench.js',
        'root.LonShaEvidenceWorkbench = api;', 'root.LonShaEvidenceWorkbenchRenamed = api;', 1, 1,
        'R1 证据面未导出 LonShaEvidenceWorkbench',
        '导出名换了而宿主写的是旧名 ⇒ 同一后果（永远取空）。摘的是**导出行本身**，不是注释里那个名字'],
    /* ---------- 结构漂移（必须 fail-closed exit 2，且**不能**与缺陷 exit 1 同形） ---------- */
    ['V7-证据面缺失（结构漂移）', 'DELETE', 'evidence-workbench.js', null, null, 2,
        '找不到 evidence-workbench.js',
        '探测对象不在 ⇒ 一律 exit 2（本仓纪律：结构漂移与真缺陷**不得同码**，否则「门禁坏了」会被读成「产品坏了」）']
];

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'evidence-binding-negctl-'));
const problems = [];
const rows = [];

for (const [name, target, anchor, repl, expectHits, expectCode, marker, why] of CASES) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of GAUGED) fs.copyFileSync(path.join(REPO, f), path.join(dir, f));

    if (target === 'DELETE') {
        fs.rmSync(path.join(dir, anchor));
    } else if (target !== null) {
        const p = path.join(dir, target);
        const src = fs.readFileSync(p, 'utf-8');
        const hits = src.split(anchor).length - 1;
        if (hits !== expectHits) {
            problems.push(name + '：锚点在 ' + target + ' 命中 ' + hits + ' 次（期望 ' + expectHits + '）—— 锚点已漂移，本组作废');
            rows.push([name, '-', '锚点漂移 ' + hits + '/' + expectHits, why]);
            continue;
        }
        fs.writeFileSync(p, src.split(anchor).join(repl));
    }

    const r = spawnSync(process.execPath, [SCAN], {
        cwd: REPO, encoding: 'utf-8',
        env: Object.assign({}, process.env, { LONSHA_AUDIT_ROOT: dir })
    });
    const out = String(r.stdout || '') + String(r.stderr || '');
    const code = r.status;
    const okCode = code === expectCode;
    const okMarker = out.indexOf(marker) >= 0;
    if (!okCode) problems.push(name + '：退出码 ' + code + '（期望 ' + expectCode + '）');
    if (!okMarker) problems.push(name + '：输出里没有点名「' + marker + '」（红得不对，可能来自另一条判据）');
    rows.push([name, String(code), okCode && okMarker ? 'OK' : 'FAIL', why]);
    if (!(okCode && okMarker)) {
        console.error('---- ' + name + ' 输出 ----');
        console.error(out.split('\n').slice(-12).join('\n'));
    }
}

console.log('');
console.log('=== 证据面契约门禁 · 负控制（真源码破坏 → fixture 树 → 重跑同一门禁） ===');
for (const [n, c, v, why] of rows) console.log('  ' + (v === 'OK' ? '✓' : '✗') + ' ' + n + ' [exit ' + c + ']');
fs.rmSync(root, { recursive: true, force: true });
if (problems.length) {
    console.error('');
    for (const p of problems) console.error('[evidence-negctl] ' + p);
    console.error('');
    console.error('[evidence-negctl] 失败：负控制 ' + problems.length + ' 项不成立 —— 本门禁可能是恒绿探测器。');
    process.exit(1);
}
console.log('');
console.log('[evidence-negctl] 通过：' + CASES.length + ' 组（含原版对照 exit 0、R3/R5 两向/R6/R1 四类破坏、结构漂移 exit 2）。');
process.exit(0);