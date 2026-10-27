/* ============================================================
 * tests/v3297_state_report.test.mjs — M-O9「当前事实、门禁与文档自动同源」判据 [v3.297.0]
 * ------------------------------------------------------------
 * 覆盖 M-O9 的四条验收：
 *   ① 当前版本、人读索引与机器装载面**三者一致**（S1/S2）
 *   ② 未实跑的全量明确标注待验；未知不报 0，未执行不报通过（S3/S4/S5）
 *   ③ 已交付条目不再列为下一步（沿用既有 scan_plan_currency 的口径，本套件只核
 *      「状态报告与计划语言不矛盾」—— 计划陈旧判定不在本套件重复实现）（S6）
 *   ④ 干净检出可重建同一份状态报告（S7）
 * 加两条负控制（S8/S9）：把数改掉、把 unknown 抹掉，同款判据必须转红。
 *
 * 与本仓既有 D1~D9（scan_doc_truthfulness）的分工，别搞混：
 *   · D 系列是**反向核对**：文档写了什么 → 磁盘是不是那样；
 *   · 本套件是**正向生成**：磁盘现在是什么 → 报告是不是那样。
 *   两者都不替代对方：D 系列管得住「文档说谎」，管不住「没人把当前事实写下来」；
 *   本套件管得住「报告漂移」，管不住「README 里那行旧了」。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { collectState, REPO } from '../tools/gen_state_report.mjs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}

const REPORT_REL = 'tests/audit/state-report.json';
const live = collectState();
const disk = JSON.parse(fs.readFileSync(path.join(REPO, REPORT_REL), 'utf8'));
const read = (rel) => fs.readFileSync(path.join(REPO, rel), 'utf8');

/* ══════════ S1~S2 三者一致 ══════════ */
test('S1 状态报告在场且 schema 钉住口径', () => {
  assert.equal(disk.schema, 'state-report@1');
  assert.equal(disk.generated_by, 'tools/gen_state_report.mjs');
  assert.ok(Array.isArray(disk.unknown), '报告必须带 unknown[] —— 未知项要说出来，不是省略');
});

test('S2 ★ 当前版本 / 人读索引 / 机器装载面三者一致', () => {
  assert.equal(live.version_same, true, '版本三源必须同源：' + JSON.stringify(live.version_sources));
  assert.equal(live.human_index_version, live.version,
    'README 的「当前版本」(' + live.human_index_version + ') 必须等于机器版本 (' + live.version + ')');
  assert.ok(live.loading.extra_js > 0, '装载面必须非空（extra_js 项数）');
  assert.deepEqual(live.loading.missing_in_manifest, [],
    'manifest.extra_js 里不得有盘上不存在的项（缺项 = 装载时会炸）');
  assert.equal(live.triple_consistent, true, '三者一致这一格必须为真');
});

/* ══════════ S3 落盘报告与现场逐格一致（判据看守） ══════════ */
test('S3 落盘报告与现场取数逐格一致（漂移即红 —— 这就是「自动同源」的看守）', () => {
  const grid = [
    ['version', disk.version, live.version],
    ['human_index_version', disk.human_index_version, live.human_index_version],
    ['loading.extra_js', disk.loading.extra_js, live.loading.extra_js],
    ['gates.test_files', disk.gates.test_files, live.gates.test_files],
    ['gates.audit_gated', disk.gates.audit_gated, live.gates.audit_gated],
    ['gates.audit_dir_exists', disk.gates.audit_dir_exists, live.gates.audit_dir_exists],
  ];
  const bad = grid.filter(([, d, l]) => l !== null && d !== l).map(([p, d, l]) => `${p}: 报告=${d} 现场=${l}`);
  assert.equal(bad.length, 0, '状态报告与磁盘漂移（重跑 `node tools/gen_state_report.mjs --write`）：\n  ' + bad.join('\n  '));
  assert.ok(grid.length >= 6, '对账格数下限 6（防对账面被掏空后「零不一致」全绿）');
  /* 数组面也逐条比：测试文件清单漂了，条数可能恰好相同（改名） */
  assert.deepEqual(disk.gates.test_files_list, live.gates.test_files_list, '测试文件清单必须逐条一致');
  assert.deepEqual(disk.loading.extra_js_list, live.loading.extra_js_list, '装载清单必须逐条一致');
});

/* ══════════ S4 未知不报 0 ══════════ */
test('S4 ★ 未知不报 0：每一格 null 都必须有解释', () => {
  const nulls = [];
  (function walk(o, pre, parent) {
    for (const k of Object.keys(o)) {
      const v = o[k];
      if (v === null) {
        const byUnknown = live.unknown.some((u) => u.includes(k));
        const note = parent && parent[k + '_note'];
        nulls.push({ path: pre + k, byUnknown, byNote: typeof note === 'string' && note.length >= 10 });
      } else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, pre + k + '.', v);
    }
  })({ version: live.version, loading: live.loading, gates: live.gates }, '', null);
  for (const n of nulls) {
    assert.ok(n.byUnknown || n.byNote, '未知格 ' + n.path + ' 没有解释（未知不许静默变 0）');
  }
  assert.equal(live.unknown_count, live.unknown.length, 'unknown_count 必须等于 unknown 长度');
});

/* ══════════ S5 未执行不报通过 ══════════ */
test('S5 ★ 未执行不报通过：真宿主面与全量实跑面必须如实标注', () => {
  /* 真宿主：本环境没有 ⇒ 必须是 not-executed，且**不许**出现 pass 语义 */
  assert.equal(live.host_run.status, 'not-executed',
    '真宿主面必须如实记 not-executed（写成 pass 就是「未执行报通过」）');
  assert.ok(String(live.host_run.reason || '').length > 10, '必须写清为什么未执行');
  /* 全量实跑：只信登记；登记版本与当前不同源 ⇒ 必须标 stale 并进 unknown */
  assert.ok(['registered', 'stale', 'not-executed'].includes(live.full_run.status),
    '全量实跑面状态取值必须是受限集：' + live.full_run.status);
  if (live.full_run.status === 'stale') {
    assert.ok(live.unknown.some((u) => u.includes('陈旧')), '陈旧读数必须在 unknown[] 里说出来');
  }
  if (live.full_run.status === 'registered') {
    assert.equal(live.full_run.registered_at, live.version, '登记版本必须与当前版本同源才算 registered');
    assert.ok(live.full_run.tests_total != null, 'registered 必须带真读数（不是空壳）');
  } else if (live.full_run.tests_total === null || live.full_run.tests_total === undefined) {
    assert.ok(live.unknown_count > 0 || live.full_run.status === 'not-executed',
      '数不出来时不许报 0 且必须有解释');
  }
});

/* ══════════ S6 门禁分档记账在场且与计划语言不矛盾 ══════════ */
test('S6 门禁分档记账：四档齐备，且「未执行」档不自称通过', () => {
  const t = live.gates.tiers;
  assert.equal(t.schema, 'gate-tiers@1');
  const ids = t.tiers.map((x) => x.id);
  assert.deepEqual(ids, ['unit', 'targeted', 'full', 'host'], '四档必须齐备且顺序同源');
  for (const tier of t.tiers) {
    assert.ok(String(tier.label || '').length > 4, tier.id + ' 必须有可读标签');
    assert.ok(String(tier.how || '').length > 4 || tier.id === 'host', tier.id + ' 必须给出跑法（host 档可空）');
    if (tier.status) assert.notEqual(tier.status, 'pass', tier.id + ' 不得自称 pass（未执行不报通过）');
  }
  /* 计划语言面：本条的定义源必须在场 —— 锚点选**真源**，不选入口索引。
     别搞混：PLAN.md 是入口索引（只放第二期计划的链接），条目定义在 proposed 计划文件里。
     原判据在 PLAN.md 里找 'M-O9' 找不着 → 属「锚点选错对象」，判据测的是自己写错的地方。 */
  const entry = read('PLAN.md');
  assert.ok(entry.includes('2026-10-08-optimization-plan-v2.md'),
    '入口索引必须仍链到第二期优化计划（否则锚点悬空，判据测不到东西）');
  const plan = read('.agents/notes/proposed/architecture/2026-10-08-optimization-plan-v2.md');
  assert.ok(plan.includes('## M-O9'), '第二期计划必须仍带 M-O9 标题（真源在场）');
  assert.ok(plan.includes('当前事实'), 'M-O9 标题语义未改（自动同源那条）');
});

/* ══════════ S7 干净检出可重建 ══════════ */
test('S7 干净检出可重建：同一批文件两份报告逐字相同', () => {
  const again = collectState();
  assert.deepEqual(again.digest.per_file, live.digest.per_file, '同一批文件的摘要必须逐字相同');
  assert.ok(again.digest.scope.length >= 3, '摘要范围必须写明');
  /* 落盘报告里的摘要必须与现场一致（防「报告是上一版写的」） */
  assert.deepEqual(disk.digest.per_file, live.digest.per_file, '落盘报告的摘要必须与现场一致');
});

/* ══════════ S8/S9 负控制 ══════════ */
test('S8 ★ 负控制：把报告里的一个数改掉 ⇒ S3 同款判据必须转红', () => {
  const broken = JSON.parse(JSON.stringify(disk));
  broken.gates.test_files = broken.gates.test_files + 1;
  const grid = [[
    'gates.test_files', broken.gates.test_files, live.gates.test_files,
  ]];
  const bad = grid.filter(([, d, l]) => l !== null && d !== l);
  assert.equal(bad.length, 1, '改动报告后同款判据必须报出 1 处不一致');
  assert.notEqual(broken.gates.test_files, disk.gates.test_files, '前提：破坏必须真改了值');
});

test('S9 ★ 负控制：把 unknown 抹掉 ⇒ S4 同款判据对无解释的 null 必须判假', () => {
  const hollow = { ...live, unknown: [], unknown_count: 0 };
  /* 构造一个「现场为 null 且无解释」的样本，跑同款判定式 */
  const sample = { gates: { test_files: null } }; // 现场数不出来
  const nulls = [];
  (function walk(o, pre) {
    for (const k of Object.keys(o)) {
      if (o[k] === null) nulls.push(pre + k);
      else if (o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) walk(o[k], pre + k + '.');
    }
  })(sample, '');
  assert.equal(nulls.length, 1, '前提：样本里恰有一个 null');
  for (const p of nulls) {
    const byUnknown = hollow.unknown.some((u) => u.includes(p.split('.').pop()));
    assert.equal(byUnknown, false, '抹掉 unknown 后该 null 必须被判成「无解释」');
  }
});
/* ══════════ S10 版本卫生与出生版本锚 ══════════
 * 本段与 tests/v3296_x1_evidence_query.test.mjs 的 V 段同构。锚的口径（[v3.298.0] 修正）：
 *   **当版锚住在当版档案里**（版本守卫 V4 只数 frontier 文件），历史测试只锁**自己的**
 *   出生版本 —— 于是 V2（历史文件不得锁当版）与 V4（当版档案必须有锚）不再互相踢球。
 *   本档出生版本 v3.297.0，故这里锚 3.297.0、下界也是 3.297.0，**不随抬版上抬**。
 *   刻意**不**写成 assert.equal(idx, '3.297.0')：那是 V2 点名的「抬版仪式」形态
 *   （写死**运行版本**的历史测试在下一版必红，且每次抬版都要人工批量替换）。
 *   [v3.298.0 留痕] 本段曾按旧 V4 口径把**当版**硬锚在这里（`vnum('3.298.0')` 与
 *   '3298000' 相等）—— 那是「补锚 = 踩 V2」的互斥形态，已在同版修掉（守卫 V2/V4 双修，
 *   锚迁回当版套件 v3298；见 CHANGELOG 的「门禁真缺陷」段与 v3203 的 17~19 号判据）。
 */
test('S10 版本四源同源且不低于本档出生版本（含当版锚 V4 形态）', () => {
  const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
  };
  const man = JSON.parse(read('manifest.json')).version;
  const pkg = JSON.parse(read('package.json')).version;
  const idx = (__hostSurface().match(/const VERSION = '([0-9.]+)'/) || [])[1];
  assert.ok(idx, 'index.js 版本真值可取');
  assert.equal(man, idx, 'manifest 与 index 必须同源');
  assert.equal(pkg, idx, 'package.json 与 index 必须同源');
  for (const m of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
    const v = (read(m).match(/let VERSION = '([0-9.]+)'/) || [])[1];
    assert.equal(v, idx, m + ' 副本必须与 index 同源（注入失败时它就是真实现）');
  }
  assert.ok(vnum(idx) >= vnum('3.297.0'), '版本不得低于本档出生版本 3.297.0，实 ' + idx);
  /* ★ 出生版本锚（**自己的**版本，不随抬版上抬；形态与 v3263 / v3209 / v3296 同）：
   *   当版锚另由当版套件承担 —— 本行不再越位（[v3.298.0] 修）。 */
  assert.equal(vnum('3.297.0'), 3297000, '出生版本锚：vnum 解析器须给出三段数值（3*1e6 + 297*1e3 + 0）');
  /* 人读两份在场即必须同源（与 scan_version_guard 的 V6/V7 同口径） */
  assert.equal((read('CHANGELOG.md').match(/^## (v[0-9.]+)/m) || [])[1], 'v' + idx, 'CHANGELOG 顶节应是当版');
  assert.equal((read('TODO.md').match(/最近更新：v([0-9.]+)/) || [])[1], idx, 'TODO 最近更新应是当版');
});
