/* ============================================================
 * tests/v3431_tmpdir_not_on_ramdisk.test.mjs — v3.431.0
 * ------------------------------------------------------------
 * 主题：回归临时根不得落在内存盘（tmpfs）上，且**相对路径基准必须跟随传入 root**。
 *
 * 为什么存在（真实现场，不是假想的洁癖）：
 *   本机 `/tmp` 是 tmpfs（`size=5792440k`，占用即吃 RAM）。全量回归里 114 个
 *   测试/审计探针各自 `mkdtemp` 镜像树，一次全量累积实测 4.3G · 3 万目录 ·
 *   12 万文件；清理只写在各自 `finally` 里 —— 被杀 / 超时 / 阻断就**永久留在
 *   RAM**，下一轮继续叠。实机后果：`free` 只剩 668MB、swap 吃掉 4.6G。
 *
 *   而把临时根从 `/tmp` 挪到磁盘时，**立刻炸出一个躲了很久的真缺陷**：
 *   `scan_module_consumption.mjs` 的 `getProdFiles(root)` 用 `path.relative(ROOT, p)`
 *   算相对名，调用方却用 `path.join(rootDir, pf)` 拼回去读文件 —— 两处基准不是
 *   同一个。夹具在 `/tmp` 下时 `../../../tmp/x/f.js` 恰好还原（缺陷隐形）；
 *   夹具与 ROOT 同前缀时 relative 给出 `../<dir>/…`，拼回去多叠一层，
 *   生产代码全部读空 ⇒ 每个模块 prodCallSites 退化成 0 ⇒ 把**有消费**的模块
 *   报成零消费孤儿。
 *
 * 本档判据（A 结构 / B 行为 / C 负控制 / D 边界自述）：
 *   A1 runner 源码里**不得**再出现「临时根直接取 os.tmpdir()」的旧写法，
 *      且三条环境变量（TMPDIR/TMP/TEMP）都必须被写回 —— 只写一条在
 *      Windows / 部分 Node 版本下 `os.tmpdir()` 不跟随。
 *   A2 runner 源码里不出现绝对路径字面量（P1/P7 口径：路径必须由 REPO 推导）。
 *   B1 真跑一次定向测试，断言子进程看到 `os.tmpdir()` 落在**磁盘基址**上、
 *      而不是进程默认的 `os.tmpdir()`（对照：不设 LONSHA_TEST_TMP 时的默认值）。
 *   B2 同一轮跑完后，该轮的 `lonsha-run-*` 目录必须已被**整棵删除**
 *      （只断「跑成功了」是假绿：留一堆垃圾照样算成功）。
 *   C1 负控制：把 `scan_module_consumption.mjs` 的 `path.relative(base, p)`
 *      真源码改回 `path.relative(ROOT, p)`，`v34270` 第 3 条必须翻红；
 *      还原后必须转绿（md5 一致）。**改的是真源，不是副本** ——
 *      对副本断言是本项目已记过的「负控制假绿第二形」。
 *   D1 边界自述：本档只证明「runner 子进程的临时根不在内存盘 + 基准跟随 root」，
 *      **不证明**真浏览器 / 真机行为，也不承诺耗时变化。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.dirname(HERE);

/* [v3.431.0] 派生内层测试时**必须剥掉 NODE_TEST_CONTEXT**。
 *   实测（本档 C1 第一版就踩了）：在 `node --test` 里再 `execFileSync(node, ['--test', …])`
 *   会继承 NODE_TEST_CONTEXT=child-v8，内层 runner 认为自己已是「子测试上下文」，
 *   于是**不执行任何用例、72ms 就返回 0** —— 破坏写了、STATUS 却是 0，
 *   负向控制假绿。这不是本仓的缺陷而是 Node 测试框架的语义，
 *   但足够把「负控制真的红了吗」这个判断骗过去。剥掉后同一段代码正确返回 1。 */
const childEnv = (extra = {}) => {
  const env = { ...process.env, ...extra };
  delete env.NODE_TEST_CONTEXT;
  return env;
};


/** 版本数值锚（当版档案专用；V4 要求恰一处 vnum 等于当版） */
const vnum = (v) => Number(String(v).split('.').map((n) => n.padStart(3, '0')).join(''));
const CUR = '3.431.0';

const read = (p) => fs.readFileSync(path.join(REPO, p), 'utf8');

/* [v3.431.0] A5 的口径判据抽成**纯函数**。
 *   为什么要抽：C2 负控制要「真源码破坏 run.mjs 之后，用同一段判据逻辑复核」。
 *   若 C2 直接重跑本档，会递归调用自己（本档里跑本档）。抽成纯函数后，
 *   破坏 → 读真源 → 调同一个函数，既不自指也不递归。
 *   同时守住本项目反复记过的纪律：负控制的判据必须是**产物真用的那一段**，
 *   不能另写一份「模拟判据」——那样破坏写错也照样绿。 */
function auditFaceVerdict({ names, runnerSrc, suiteSrc, report }) {
  const diskGated = names
    .filter((n) => (n.endsWith('.mjs') || n.endsWith('.cjs')) && !n.startsWith('_'))
    .sort();
  const runnerRan = names
    .filter((n) => n.endsWith('.mjs') && !n.startsWith('_'))
    .sort();
  const diff = diskGated.filter((n) => !runnerRan.includes(n));
  const problems = [];

  const repGated = report && report.gates ? report.gates.audit_gated : null;
  if (repGated !== diskGated.length) {
    problems.push(`state-report.audit_gated=${repGated} ≠ 磁盘门禁面 ${diskGated.length}`);
  }
  /* runner 的过滤条件同样按**真源**断言：它的口径就是「.mjs 且非 _ 前缀」。
   *   这条一红，说明有人把 runner 改成收 .cjs —— 那会让三个探针被跑两遍
   *   （既有套件已 spawnSync 驱动它们），白烧时间。 */
  if (!/f\.endsWith\('\.mjs'\)\s*&&\s*!f\.startsWith\('_'\)/.test(runnerSrc)) {
    problems.push('run.mjs 的 auditScripts() 过滤条件不是「.mjs 且非 _ 前缀」');
  }
  const notCjs = diff.filter((n) => !n.endsWith('.cjs'));
  if (notCjs.length) {
    problems.push('差集出现非 .cjs（说明 runner 真漏跑了一个独立可执行门禁）：' + notCjs.join(', '));
  }
  const undriven = diff.filter((n) => !suiteSrc.includes(n));
  if (undriven.length) {
    problems.push('差集 .cjs 未被任何套件驱动（既不由 runner 跑、也没人调 = 死门禁）：' + undriven.join(', '));
  }
  return { diskGated, runnerRan, diff, problems };
}

/** A5 / C2 共用的现场采集：磁盘名单 + runner 真源 + 全部套件源码 + state-report */
function auditFaceScene() {
  const names = fs.readdirSync(path.join(REPO, 'tests', 'audit'));
  const suiteSrc = fs.readdirSync(path.join(REPO, 'tests'))
    .filter((n) => n.endsWith('.test.mjs'))
    .map((n) => read(path.join('tests', n)))
    .join('\n');
  return { names, suiteSrc, report: JSON.parse(read('tests/audit/state-report.json')) };
}

/* ---------------- A 结构面 ---------------- */

test('A1 runner 必须把 TMPDIR/TMP/TEMP 三条都写回，且不再直接取 os.tmpdir() 当唯一来源', () => {
  const src = read('tests/run.mjs');
  for (const k of ['TMPDIR', 'TMP', 'TEMP']) {
    assert.match(src, new RegExp(`process\\.env\\.${k}\\s*=\\s*dir`),
      `run.mjs 必须把 process.env.${k} 写回临时根（os.tmpdir() 在各平台读的变量不同）`);
  }
  // 旧写法：`const dir = mkdtempSync(join(os.tmpdir(), ...))` 直接落在系统临时盘
  assert.ok(!/mkdtempSync\(\s*(?:path\.)?join\(\s*os\.tmpdir\(\)/.test(src),
    'run.mjs 不得再把 run 根直接建在 os.tmpdir() 上（那就是内存盘）');
  // 必须有「磁盘优先、os.tmpdir() 兜底」的候选顺序
  assert.match(src, /function pickTmpBase\(/, 'run.mjs 必须有 pickTmpBase 决策函数');
  assert.match(src, /lonsha-run-/, 'run.mjs 必须按 lonsha-run- 前缀建每轮临时根');
});

test('A2 runner 源码不得出现绝对路径字面量（路径一律由 REPO 推导）', () => {
  const src = read('tests/run.mjs');
  assert.ok(!/(['"`])\/(?:home|tmp)\//.test(src),
    'run.mjs 不得写死用户主目录或系统临时目录的绝对路径（scan_cross_repo_binding P1/P7 口径）');
});

test('A3 临时根目录必须已被 .gitignore 忽略（否则测试会往工作区落未跟踪文件）', () => {
  const gi = read('.gitignore');
  assert.ok(gi.split('\n').some((l) => l.trim() === '.lonsha-test-tmp/'),
    '.gitignore 必须含 .lonsha-test-tmp/ 一行');
});

test('A4 scan_module_consumption 的相对路径基准必须跟随传入 root', () => {
  const src = read('tests/audit/scan_module_consumption.mjs');
  assert.match(src, /function getProdFiles\(dir,\s*base\s*=\s*dir\)/,
    'getProdFiles 必须接受 base 参数且默认跟随 dir');
  assert.match(src, /path\.relative\(base,\s*p\)/,
    '相对路径必须以 base 为基准（不能钉死模块级 ROOT）');
  assert.ok(!/res\.push\(\s*path\.relative\(ROOT,\s*p\)\s*\)/.test(src),
    '不得再出现 path.relative(ROOT, p) 的旧写法');
});

test('A5 ★★ 审计面「71 vs 68」必须是恒等式：差集恰为被套件驱动的 .cjs 探针', () => {
  const scene = auditFaceScene();
  const v = auditFaceVerdict({ ...scene, runnerSrc: read('tests/run.mjs') });

  /* 两个数字都先钉死：口径若整体漂移（比如审计脚本批量改名），
   *   下方恒等式仍可能自洽却已失去意义，故先断言绝对量级。 */
  assert.equal(v.diskGated.length, 71,
    `审计门禁面应为 71（.mjs∪.cjs 且非 _ 前缀），实测 ${v.diskGated.length}`
    + '；若确属新增脚本，请同步 tools/gen_state_report.mjs 与 v3427 的口径');
  assert.equal(v.runnerRan.length, 68,
    `runner 独立执行的审计脚本应为 68（仅 .mjs），实测 ${v.runnerRan.length}`);

  assert.deepEqual(v.problems, [],
    '审计面口径自证失败：\n- ' + v.problems.join('\n- '));

  /* 差集内容也必须钉死 —— 只断「差集全是 .cjs 且被驱动」是**半句断**：
   *   把某天新加的一个 .cjs 门禁顺手写进套件，恒等式照样成立，
   *   但那个门禁其实从没被跑过（套件里可能只是一句注释提到它）。
   *   故点名到具体三份探针，新增/删除都必须显式改本档。 */
  assert.deepEqual(v.diff.sort(),
    ['host_beast_probe.cjs', 'perf_probe.cjs', 'snapshot_probe.cjs'],
    'runner 与 state-report 的差集必须恰为这三份探针（改动即为口径变更，需人确认）');
});

/* ---------------- B 行为面 ---------------- */

test('B1 真跑 runner：子进程看到的 os.tmpdir() 必须落在磁盘基址而非系统默认', () => {
  const sysDefault = execFileSync(process.execPath,
    ['-e', 'console.log(require("node:os").tmpdir())'], { encoding: 'utf8', env: childEnv() }).trim();
  const base = path.join(path.dirname(REPO), '.lonsha-test-tmp');
  assert.notEqual(base, sysDefault, '前提：磁盘基址应与系统默认临时目录不同（否则本判据无信息量）');

  /* 探针用例必须放在 tests/ **顶层**：run.mjs 的 collectTests() 只扫顶层
   *   `*.test.mjs`（readdir 不递归），放子目录会「未匹配到任何测试文件」
   *   —— 本档第一版就是这么红的，记在这里防复发。
   *   文件名前缀 zz_ 保证排序靠后，且用完即删（不留未跟踪文件）。 */
  const probe = path.join(HERE, 'zz_v3431_tmpdir_probe.test.mjs');
  const outFile = path.join(HERE, '.zz_v3431_seen.txt');
  fs.writeFileSync(probe, [
    "import { test } from 'node:test';",
    "import fs from 'node:fs';",
    "import os from 'node:os';",
    `test('probe', () => { fs.writeFileSync(${JSON.stringify(outFile)}, os.tmpdir()); });`,
    '',
  ].join('\n'), 'utf8');

  try {
    execFileSync(process.execPath, ['tests/run.mjs', 'zz_v3431_tmpdir_probe'], {
      cwd: REPO, encoding: 'utf8', timeout: 120000,
      env: childEnv({ LONSHA_TEST_TMP: base }),
    });
    assert.ok(fs.existsSync(outFile), '探针必须真的跑过（否则下方断言是在读空气）');
    const seen = fs.readFileSync(outFile, 'utf8').trim();
    assert.notEqual(seen, sysDefault,
      `子进程的 os.tmpdir() 不得是系统默认 ${sysDefault}（那可能是内存盘）`);
    assert.ok(seen.startsWith(base),
      `子进程的 os.tmpdir() 必须落在磁盘基址 ${base} 之下，实际：${seen}`);
  } finally {
    fs.rmSync(probe, { force: true });
    fs.rmSync(outFile, { force: true });
  }
});

test('B2 runner 收尾必须整棵删除本轮的 lonsha-run- 目录', () => {
  const base = path.join(path.dirname(REPO), '.lonsha-test-tmp');
  fs.mkdirSync(base, { recursive: true });
  const before = new Set(fs.readdirSync(base).filter((n) => n.startsWith('lonsha-run-')));
  /* 用**判据稳定**的套件做载体：v34270 只读源码与自建夹具，不依赖文档快照，
   *   因此不会因「本版正在改 CHANGELOG」而红 —— 否则本判据会替别人报错，
   *   把「清理失败」和「被测套件自己红」混成同一个现象（本档第一版用了
   *   v3297_state_report，它依赖 state-report 的 sha 快照，改文档即红）。 */
  execFileSync(process.execPath, ['tests/run.mjs', 'v34270_module_consumption_binding'], {
    cwd: REPO, encoding: 'utf8', timeout: 180000,
    env: childEnv({ LONSHA_TEST_TMP: base }),
  });
  const after = fs.readdirSync(base).filter((n) => n.startsWith('lonsha-run-'));
  const leaked = after.filter((n) => !before.has(n));
  assert.deepEqual(leaked, [],
    '本轮 run 根必须在退出时被删除（只断「跑成功」是假绿：留垃圾照样成功）');
});

/* ---------------- C 负控制（真源码破坏） ---------------- */

test('C1 负控制：把 scan_module_consumption 的相对基准改回 ROOT，v34270 位置无关判据必须翻红', () => {
  const target = path.join(REPO, 'tests/audit/scan_module_consumption.mjs');
  const original = fs.readFileSync(target, 'utf8');
  const GOOD = 'res.push(path.relative(base, p));';
  const BAD = 'res.push(path.relative(ROOT, p));';
  const n = original.split(GOOD).length - 1;
  assert.equal(n, 1, `破坏锚点必须恰中 1 次，实测 ${n} 次（锚点漂移则负控制无效）`);

  const md5 = (s) => {
    // 不引第三方库：用长度 + 逐字符校验和做等价比对即可（只判等，不做安全用途）
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `${s.length}:${h}`;
  };
  const sigBefore = md5(original);
  const runV34270 = () => {
    try {
      execFileSync(process.execPath, ['--test', 'tests/v34270_module_consumption_binding.test.mjs'], {
        cwd: REPO, encoding: 'utf8', timeout: 180000, stdio: 'pipe',
        env: childEnv(),   // ← 必须剥 NODE_TEST_CONTEXT，否则内层 runner 空转返回 0
      });
      return 0;
    } catch (e) {
      return (e && typeof e.status === 'number') ? e.status : 1;
    }
  };

  try {
    fs.writeFileSync(target, original.replace(GOOD, BAD), 'utf8');
    const broken = runV34270();
    assert.notEqual(broken, 0,
      '基准改回 ROOT 后 v34270 必须翻红（若仍绿，说明该判据是假绿，锁不住本缺陷）');
  } finally {
    fs.writeFileSync(target, original, 'utf8');
  }
  assert.equal(md5(fs.readFileSync(target, 'utf8')), sigBefore,
    '负控制收尾必须把源文件逐字还原（签名一致）');
  assert.equal(runV34270(), 0, '还原后 v34270 必须转绿');
});

test('C2 ★★ 负控制：把 runner 改成也收 .cjs ⇒ A5 的纯函数判据必须翻红', () => {
  /* 破坏点选在**runner 真源**，而不是本档的判据代码：
   *   要把「判据能不能锁住口径」测出来，就得改被测物、留判据不动。
   *   改判据自己（比如把 68 改成 69）也能让用例红，但那测的是算术，
   *   不是「口径分歧被锁住」这件事 —— 那是自我指涉式假负控制。 */
  const target = path.join(REPO, 'tests/run.mjs');
  const original = fs.readFileSync(target, 'utf8');
  const GOOD = "f.endsWith('.mjs') && !f.startsWith('_')";
  const BAD = "(f.endsWith('.mjs') || f.endsWith('.cjs')) && !f.startsWith('_')";
  const n = original.split(GOOD).length - 1;
  assert.equal(n, 1, `破坏锚点必须恰中 1 次，实测 ${n} 次（锚点漂移则负控制无效）`);

  const md5 = (s) => {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return `${s.length}:${h}`;
  };
  const sigBefore = md5(original);

  let brokenProblems = null;
  try {
    fs.writeFileSync(target, original.replace(GOOD, BAD), 'utf8');
    const scene = auditFaceScene();
    brokenProblems = auditFaceVerdict({
      ...scene, runnerSrc: fs.readFileSync(target, 'utf8'),
    }).problems;
  } finally {
    fs.writeFileSync(target, original, 'utf8');
  }
  assert.equal(md5(fs.readFileSync(target, 'utf8')), sigBefore,
    '负控制收尾必须把 run.mjs 逐字还原（签名一致）');

  assert.ok(brokenProblems && brokenProblems.length > 0,
    'runner 改成也收 .cjs 后判据必须报问题（否则 A5 锁不住口径，是假绿）');
  assert.ok(brokenProblems.some((m) => m.includes('过滤条件')),
    '报出的问题必须点名「过滤条件」，实际：' + JSON.stringify(brokenProblems));

  /* 还原后再用同一个纯函数复核：必须零问题，否则说明「红」另有原因 */
  const after = auditFaceVerdict({ ...auditFaceScene(), runnerSrc: read('tests/run.mjs') });
  assert.deepEqual(after.problems, [], '还原后判据必须零问题');
});

/* ---------------- D 当版锚 + 边界自述 ---------------- */

test('D1 当版锚：virgin 版本号必须能被版本守卫以 vnum 恰好锚住', () => {
  assert.equal(vnum(CUR), 3431000);
  assert.equal(vnum('3.431.0'), vnum(CUR));
});

test('D2 边界自述：本档不证明真浏览器 / 真机行为，也不承诺耗时变化', () => {
  const src = read('tests/v3431_tmpdir_not_on_ramdisk.test.mjs');
  assert.match(src, /不证明/,
    '本档必须自述边界：临时根位置与真浏览器行为无关');
  assert.match(src, /不承诺耗时/,
    '本档不得暗示「搬到磁盘就更快」——只改位置');
});