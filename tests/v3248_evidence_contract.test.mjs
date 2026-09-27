// tests/v3248_evidence_contract.test.mjs — 证据面契约门禁 + 违规结构化出口 [v3.248.0]
//   主题：**两处静默失效** + 一处「读不出来」。
//
//   ① 计划 #11（存活性）：`evidence-workbench.js` 的 `LEDGERS` 是九账的单一真源登记表，
//      每项声明 `apiGlobal`（账本模块的全局名）。宿主 `_ledgerApis()` 按同一批 id 取库。
//      **两份名单各写一份** ⇒ 把 `apiGlobal` 改个名，宿主仍取旧键，`readLedger` 落
//      `absent/module-unavailable`，工作台**永远显示「模块未挂」而全仓没有一道门会响**。
//      本版实测：`grep -rln 'apiGlobal' tests/` 零命中 —— 这张表此前**没有任何判据**。
//   ② 计划 #12（签名兼容）：`project(it, api)` 的第 2 参。v3.233.0 起 event-completeness
//      那一本要靠 `api` 取段真值；调用点退化成单参时该账**不抛**，只是投影列少一截。
//      口径裁决：**兼容性**检查（调用点必须传 api），不是「签名一致」——
//      实测 9 处定义中 8 处是 `(it)`、1 处是 `(it, api)`，按字面一致要求会误伤 8 处。
//   ③ 计划 #21（结构化出口）：违规账本此前**只有人读读数**（一行中文 + 调试日志），
//      于是「违规发生了 / 没发生 / 发生了但记录已被裁掉」三者对外**同形**。
//      本版补 `_ledgerViolationReport()`（JSON 形状）+ `_ledgerViolationMarkdown()`，
//      并把 `_ledgerViolationSummary()` 改为 report 的**派生读数**（同一个数只算一处）。
//
//   判据结构：A 门禁本体（含负控制驱动）· B 登记面双向齐全 · C 结构化出口行为面 ·
//   D 真源码破坏负控制（含双向契约】· E 版本锚。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakOnce, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const GATE = path.join(AUDIT, 'scan_evidence_binding.mjs');
const NEGCTL = path.join(AUDIT, 'scan_evidence_binding_negctl.mjs');
const TABLE = path.join(AUDIT, 'audit_scan_probe_matrix.tsv');
const read = (p) => fs.readFileSync(p, 'utf8');
/* [v3.248.0 判据自纠 ①] 缺陷明细走 **stderr**（`console.error`），通过行走 stdout。
 *   首版本组只读 `r.stdout` ⇒ D3/A3 的断言永远看不到点名，红得莫名其妙。
 *   归因必须看**两股流合并**（退出码仍以进程为准）。 */
const combined = (r) => String(r.stdout || '') + String(r.stderr || '');
const runGate = (dir) => spawnSync(process.execPath, [GATE], {
    encoding: 'utf8', cwd: ROOT, timeout: 180000,
    env: Object.assign({}, process.env, dir ? { LONSHA_AUDIT_ROOT: dir } : {})
});
/** 最小夹具：门禁真正读的三件 + 九本账（**由宿主派生**，不手抄 —— 手抄必漂移）。 */
function fixture(mut) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3248-'));
    const idx = read(path.join(ROOT, 'index.js'));
    const seg = idx.slice(idx.indexOf('function _ledgerApis('), idx.indexOf('function _repairLoopLib('));
    const files = [...new Set([...seg.matchAll(/'([A-Za-z0-9_-]+\.js)'/g)].map((m) => m[1]))];
    const books = files.filter((f) => f.indexOf('ledger') >= 0 || /^(recall-echo|echo-ledger|fact-version|event-completeness|repair-loop)\.js$/.test(f));
    const copy = ['evidence-workbench.js', 'index.js', 'manifest.json', ...books];
    for (const f of copy) fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
    if (mut) mut(dir);
    return dir;
}
const withFixture = async (mut, fn) => {
    const dir = fixture(mut);
    try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
};

// ══════════ A 门禁本体 ══════════
test('v3248 A1. ★★ 门禁在健康树上 exit 0（假红检测）', () => {
    const r = runGate(null);
    assert.equal(r.status, 0, '健康树必须放行：' + String(r.stderr || r.stdout).slice(0, 300));
    assert.match(String(r.stdout), /登记表 9 项 \| 宿主取库 9 键/, '通过时必须给出对差读数');
    assert.match(String(r.stdout), /R1~R7/, '通过时必须写明判据范围');
});
test('v3248 A2. ★★★ 结构漂移 fail-closed：证据面缺失 ⇒ exit 2（不得与缺陷同码）', async () => {
    await withFixture((d) => fs.rmSync(path.join(d, 'evidence-workbench.js')), async (dir) => {
        const r = runGate(dir);
        assert.equal(r.status, 2, '探测对象不在必须 exit 2，实得 ' + r.status);
        assert.match(combined(r), /找不到 evidence-workbench\.js/, '须如实说出「没得判」');
    });
});
test('v3248 A3. ★★ 九本账不在夹具里 ⇒ R4 报缺失（门禁读的是磁盘真值，不是清单）', async () => {
    await withFixture((d) => {
        for (const f of fs.readdirSync(d)) if (f.endsWith('-ledger.js')) fs.rmSync(path.join(d, f));
    }, async (dir) => {
        const r = runGate(dir);
        assert.equal(r.status, 1, '宿主声明的账本不存在时必须判真缺陷，实得 ' + r.status);
        assert.match(combined(r), /R4 宿主为 seed 取 seed-ledger\.js/, '须点名具体哪一本');
    });
});

// ══════════ B 登记面双向齐全 ══════════
test('v3248 B1. ★★ 探针矩阵登记（新增扫描器不登记 ⇒ 体检面悄悄变窄）', () => {
    const rows = read(TABLE).split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).map((l) => l.split('\t'));
    const row = rows.find((r) => r[0] === 'scan_evidence_binding.mjs');
    assert.ok(row, 'scan_evidence_binding.mjs 必须登记进 audit_scan_probe_matrix.tsv');
    assert.equal(row[1], '0', 'H 列必须为 0（健康树不得误红）');
    assert.ok(Number(row[2]) !== 0 || Number(row[3]) !== 0, 'G/T 至少一列非 0（否则是恒绿探测器）');
    assert.equal(row[2], '2', '实测 G 档（根 .js 全删）= exit 2，登记须与实测一致');
});
test('v3248 B2. ★★ 测试面登记（缺口与残留都报）', () => {
    const reg = read(path.join(AUDIT, 'catalog_reference_consumers.tsv'));
    assert.ok(reg.includes('v3248_evidence_contract.test.mjs'), '本套件必须登记进 catalog_reference_consumers.tsv');
});
test('v3248 B3. ★★★ 负控制档存在且被测目标在登记表内（负控制不得指向空）', () => {
    assert.ok(fs.existsSync(NEGCTL), '负控制档必须在场（判据恒绿三伪装的统一解）');
    const src = read(NEGCTL);
    assert.ok(src.includes('scan_evidence_binding.mjs'), '负控制必须点名被测门禁');
    const rows = read(TABLE).split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
    assert.ok(rows.some((l) => l.startsWith('scan_evidence_binding.mjs')), '被测门禁须在登记表内');
});

// ══════════ C 结构化出口行为面（计划 #21） ══════════
test('v3248 C1. ★★ 报告出口在场且是 report 的派生读数（同一个数只算一处）', () => {
    const idx = read(path.join(ROOT, 'index.js'));
    assert.match(idx, /_ledgerViolationReport\(opts\)\s*\{/, '结构化出口必须在场');
    assert.match(idx, /_ledgerViolationMarkdown\(opts\)\s*\{/, '人读出口必须在场');
    const sumBody = idx.slice(idx.indexOf('_ledgerViolationSummary() {'), idx.indexOf('_ledgerViolationSummary() {') + 700);
    assert.ok(sumBody.includes('_ledgerViolationReport('), '摘要必须是 report 的派生读数（原实现自己又遍历一遍 ⇒ 同一个数两处各算一份）');
    assert.ok(!/byKind\[k\]/.test(sumBody), '摘要里不得再出现自己的一份计数（那就是第二份真源）');
});
test('v3248 C2. ★★ 裁剪留痕：dropped 计数在场（否则「正好 200 条」与「已裁几千条」同形）', () => {
    const idx = read(path.join(ROOT, 'index.js'));
    assert.match(idx, /_ledgerViolationsDropped\s*=\s*\(Number\(this\._ledgerViolationsDropped\) \|\| 0\) \+ dropped/,
        '环形账本裁剪必须累记被裁数');
    assert.match(idx, /dropped:\s*Number\(this\._ledgerViolationsDropped\) \|\| 0/, 'report 必须把它作为读数输出');
});
test('v3248 C3. ★★ 口径：只记计数与轮次身份，不记读数内容（与 silence-guard 同族）', () => {
    const idx = read(path.join(ROOT, 'index.js'));
    const rep = idx.slice(idx.indexOf('_ledgerViolationReport(opts) {'), idx.indexOf('_ledgerViolationMarkdown(opts) {'));
    for (const banned of ['name:', 'item:', 'text:', 'hook:', 'reason: r,']) {
        assert.ok(!rep.includes(banned), '报告不得输出读数内容字段 `' + banned + '`（记正文就会长出第二份真源）');
    }
});
test('v3248 C4. ★★ 真实读侧：报告接进「记忆全景报告」（写完没人调 = 等于没写）', () => {
    const idx = read(path.join(ROOT, 'index.js'));
    const ex = idx.slice(idx.indexOf('exportMemoryReport() {'), idx.indexOf('exportMemoryReport() {') + 2500);
    assert.ok(ex.includes('_ledgerViolationMarkdown('), '导出报告必须真调它 —— 否则又是一个零引用方法（被 scan_wiring A7.1 抓）');
});
test('v3248 C5. ★★★ 行为面：真跑一次 report/markdown（不是只读源码文本）', () => {
    const idx = read(path.join(ROOT, 'index.js'));
    const repSrc = idx.slice(idx.indexOf(' _ledgerViolationReport(opts) {'), idx.indexOf(' /** [v3.248.0] 违规汇总（Markdown'));
    assert.ok(repSrc.length > 500, '取到报告实现体');
    /* [v3.248.0 判据自纠 ②] 直接 `new Function('return (' + 方法体 + ')...')` 会 SyntaxError：
     *   方法体是 `报告名(opts) { ... }` 这种**类方法简写**，不是函数表达式。
     *   故必须**补上 `function` 关键字**再包 —— 首版漏了这一步，D1/C5 全部崩在解析上
     *   （而崩在解析会被误读成「判据失败」，实际是判据自己写错了）。 */
    const METHOD = repSrc.replace(/^\s*_ledgerViolationReport\s*\(/, 'function (');
    assert.ok(METHOD.startsWith('function ('), '方法体须成功转成函数表达式');
    const makeHost = (items, dropped) => ({
        _ledgerViolations: items, _ledgerViolationsDropped: dropped || 0,
        config: { config: { ledgerViolationLogMax: 200 } },
        _go(opts) { return new Function('self', 'opts', 'return (' + METHOD + ').call(self, opts)')(this, opts); }
    });
    const h = makeHost([{ ts: 1000, source: 'extract', floor: 3, kind: 'dup', reason: 'already' },
        { ts: 2000, source: 'extract', floor: 4, kind: 'dup', reason: 'already' },
        { ts: 3000, source: 'carryover', floor: 4, kind: 'shape', reasons: ['x', 'y'] }], 7);
    const r = h._go();
    assert.ok(r && typeof r === 'object', 'report 必须返回对象（机器可读出口）');
    assert.equal(r.total, 3, 'total = 账内条数');
    assert.equal(r.dropped, 7, 'dropped 必须如实透出（裁剪留痕）');
    assert.equal(r.version, 1, '报告带版本号，便于下游对差');
    assert.equal(r.kinds[0].kind, 'dup', 'kind 计数须降序（有 2 条 dup）');
    assert.equal(r.kinds[0].n, 2);
    assert.equal(r.capped, false, '未达上限时 capped=false');
    assert.equal(r.since, 1000, '时间窗下界取最小 ts');
    assert.equal(r.until, 3000, '时间窗上界取最大 ts');
    /* 稳定性：同一份账导出两次必须逐字相同（顺序不稳定会把「顺序变了」读成「内容变了」） */
    assert.deepEqual(h._go(), h._go(), '两次导出必须完全一致（排序须稳定）');
    /* 空账：total=0 且**不得**抛 */
    const e = makeHost([])._go();
    assert.equal(e.total, 0, '空账 total=0');
    assert.deepEqual(e.kinds, [], '空账各榜为空数组');
});
test('v3248 C6. ★★ 摘要与报告同源：空账返回 "0"（消费点契约不得变）', () => {
    const idx = read(path.join(ROOT, 'index.js'));
    const sumBody = idx.slice(idx.indexOf('_ledgerViolationSummary() {'), idx.indexOf('_ledgerViolationSummary() {') + 700);
    assert.ok(/if \(!r\.total\) return '0';/.test(sumBody), '空账必须仍返回字符串 "0" —— 消费点 `lv !== \'—\'` 依赖它');
});

// ══════════ D 真源码破坏负控制（含双向契约） ══════════
/** 「真源码破坏 → 在破坏副本上重跑**同一判据**」：三伪装（对原文件断言 / 破坏写死成常量 /
 *  破坏把判据自己删了）的统一解。破坏发生在内存字符串上，判据在副本上真跑。 */
function judgeReport(src) {
    const body = src.slice(src.indexOf(' _ledgerViolationReport(opts) {'), src.indexOf(' /** [v3.248.0] 违规汇总（Markdown'));
    if (body.length < 200) throw new Error('取不到报告体（破坏打偏了）');
    const host = { _ledgerViolations: [{ ts: 1, source: 's', floor: 1, kind: 'k' }], _ledgerViolationsDropped: 5, config: { config: {} } };
    const M = body.replace(/^\s*_ledgerViolationReport\s*\(/, 'function (');
    return new Function('self', 'return (' + M + ').call(self)')(host);
}
test('v3248 D1. ★★★ 负控制：真源码破坏必须可观测地改行为（dropped 被抹 ⇒ 读数变）', () => {
    const src = read(path.join(ROOT, 'index.js'));
    const anchor = 'dropped: Number(this._ledgerViolationsDropped) || 0,';
    assertSingleHit(src, anchor, 'D1');
    const baseline = judgeReport(src);
    assert.equal(baseline.dropped, 5, '原版上判据必须为真（否则破坏对照无意义）');
    const broken = breakOnce(src, anchor, 'dropped: 0,', 'D1');
    const after = judgeReport(broken);
    assert.equal(after.dropped, 0, '破坏后读数必须变（不变 ⇒ 判据没在被测对象上）');
    assert.notEqual(baseline.dropped, after.dropped, '两向必须有差');
});
test('v3248 D2. ★★★ 负控制：C 组判据不得引用被破坏的锚点串（H5 判据纯度）', () => {
    /* 反向自证：若把「摘要改为派生读数」这件事破坏掉（退回自己计数），C1 必须翻红。
     *   破坏发生在**真源码字符串**上，重建的判据在副本上重跑。 */
    const src = read(path.join(ROOT, 'index.js'));
    const anchor = 'const r = this._ledgerViolationReport({ top: 2 });';
    assertSingleHit(src, anchor, 'D2');
    const judgeC1 = (s) => {
        const i = s.indexOf('_ledgerViolationSummary() {');
        const body = s.slice(i, i + 700);
        return body.includes('_ledgerViolationReport(') && !/byKind\[k\]/.test(body);
    };
    assert.equal(judgeC1(src), true, '原版上 C1 判据必须为真');
    const broken = breakOnce(src, anchor, 'const arr = this._ledgerViolations || []; if (!arr.length) return "0";', 'D2');
    assert.equal(judgeC1(broken), false, '破坏后 C1 判据必须翻红（否则判据是空转的）');
});
test('v3248 D3. ★★ 负控制：门禁对「apiGlobal 改名」这件事本身有反应（驱动真门禁）', async () => {
    await withFixture((d) => {
        const p = path.join(d, 'evidence-workbench.js');
        const s = read(p);
        fs.writeFileSync(p, breakOnce(s, "apiGlobal: 'LonShaSeedLedger',", "apiGlobal: 'LonShaSeedBook',", 'D3'));
    }, async (dir) => {
        const r = runGate(dir);
        assert.equal(r.status, 1, '改名必须被门禁判为真缺陷，实得 ' + r.status);
        assert.match(combined(r), /R3 登记表 seed\(伏笔\) 声明 apiGlobal=LonShaSeedBook/, '须点名具体缺哪一本（红得对）');
    });
});

// ══════════ E 版本锚 ══════════
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
test('v3248 E1. ★ 版本锚（当版字面量，不随抬版漂移）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const idx = read(path.join(ROOT, 'index.js'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(idx) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.equal(pkg.version, codeVer, 'package.json 与 index.js 版本必须一致');
    /* [v3.249.0 交棒] 本条原是当版锚（`assert.equal(vnum(codeVer), vnum('3.248.0'))`）。
     *   历史测试只锁「自己的出生版本」（v3.203.0 的 scan_version_guard V2/V3 口径），
     *   当版号由 V4/V6/V7 四源同源看守；抬版时把硬等号换成下界锚是既定交棒动作。 */
    assert.ok(vnum(codeVer) >= vnum('3.248.0'), '本套件只在 3.248.0 及以后成立，实得 ' + codeVer);
});