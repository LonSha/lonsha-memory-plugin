// tests/audit/scan_module_consumption_negctl.mjs
// scan_module_consumption.mjs 的配对负控制
// ------------------------------------------------------------
// 判定规则：
//   V0 原版基线：直接执行门禁必须 exit 0；
//   N1 未登记零消费：制造一个零消费且未登记的 extra_js 模块 => 必 exit 1 并点名模块；
//   N2 空理由违规（两向自证）：夹具里真造一个零消费模块并登记 allowed:0：
//     N2a why 为空白 => 必 exit 1 并报 R2 违规；N2b 同一棵树补上理由 => 必 exit 0；
//   N3 结构健康下限：manifest 模块数过少 => 必 exit 2 (fail-closed)；
//   N4 判据自证（K4 定点破坏）：锚点须恰中 1 次，破坏判据本体后同一红树上原版必红 / 破坏版必不红。
//
// 退出码：0 = 全部负控制成立  1 = 存在未通过的负控制  2 = 门禁脚本不存在
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const GATE = path.join(REPO, 'tests/audit/scan_module_consumption.mjs');

if (!fs.existsSync(GATE)) {
  console.error('[consumption-negctl] 缺门禁 scan_module_consumption.mjs');
  process.exit(2);
}

const failures = [];

// V0 原版对照（卫生态）：未破坏时门禁必须 exit 0 —— 只验「破坏会翻红」而不验「原版是绿的」，
//   会把「破坏写死成模拟常量」判成绿。故 V0 是本文件的卫生态对照组，先证绿再证红。
const v0 = spawnSync(process.execPath, [GATE], { cwd: REPO, encoding: 'utf8' });
if (v0.status !== 0) {
  failures.push(`V0 原版基线失败：期望 exit 0，实得 exit ${v0.status}\n${v0.stderr || v0.stdout}`);
} else if (!v0.stdout.includes('检查通过')) {
  failures.push('V0 原版基线失败：输出未包含「检查通过」');
}

/** 把一份生产文件搬进夹具（hardlink 优先，失败退化拷贝）。 */
function putMirror(tmp, rel) {
  const src = path.join(REPO, rel);
  const dst = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  try { fs.linkSync(src, dst); } catch { fs.copyFileSync(src, dst); }
}
/** 生产面全镜像：根目录其余 .js（含 docs/ 下的计划探针）逐字搬入夹具。 */
/* 平台残骸过滤：这台机器的存储层会在仓里留下 `.l2s.<name>0001` 这类残片
 *   （有时是自指链接、有时是断链）。它们既不在 git 里，也不参与任何读数，
 *   但「整树镜像」会把它们一起拷 —— 断链一拷就 ENOENT，把负控制做成假红。
 *   口径与 tests/_fixture_sync.mjs 的 PLATFORM_JUNK_RE 同一条：按名字前缀排除。 */
const PLATFORM_JUNK_RE = /(^|\/)[.]l2s[.]/;
function mirrorProd(tmp) {
  const copied = new Set(['manifest.json', 'index.js', 'optional-engine-registry.js']);
  for (const f of fs.readdirSync(REPO)) {
    if (!f.endsWith('.js') || copied.has(f) || PLATFORM_JUNK_RE.test(f)) continue;
    putMirror(tmp, f);
  }
  const walk = (rel) => {
    for (const d of fs.readdirSync(path.join(REPO, rel), { withFileTypes: true })) {
      const r = rel + '/' + d.name;
      if (PLATFORM_JUNK_RE.test(r)) continue;
      if (d.isDirectory()) walk(r); else if (d.isFile()) putMirror(tmp, r);
    }
  };
  if (fs.existsSync(path.join(REPO, 'docs'))) walk('docs');
}

// 辅助创建临时轻量镜像
function createTempRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha_cons_negctl_'));
  fs.mkdirSync(path.join(tmp, 'tests/audit'), { recursive: true });
  // 复制必要文件
  fs.copyFileSync(path.join(REPO, 'manifest.json'), path.join(tmp, 'manifest.json'));
  fs.copyFileSync(path.join(REPO, 'index.js'), path.join(tmp, 'index.js'));
  fs.copyFileSync(path.join(REPO, 'tests/audit/module_consumption_ledger.json'), path.join(tmp, 'tests/audit/module_consumption_ledger.json'));
  /* [L21-O1] 门禁已改为读注册表 entries 拿「消费标识符」（parseRegistryAliases）：
   *   有一批模块**不挂载任何全局名**，消费点只在注册表登记名上，例如
   *     index.js:11843 `optEngines.VectorSemanticSparseHybridRetrieval || ...` 再 `new Cls()`。
   *   夹具缺这一文件 ⇒ 门禁读不到别名 ⇒ 那些模块退化成「零业务消费」
   *   ⇒ 本负控制的期望读数整体偏移，且夹具结构差异会把 exit 2 混进断言。
   *   （scan_fixture_sync 的 E2 报的就是这条：夹具缺门禁会读的文件。） */
  fs.copyFileSync(path.join(REPO, 'optional-engine-registry.js'), path.join(tmp, 'optional-engine-registry.js'));
  /* [v3.474.0] 生产面全镜像：门禁是按「根目录全部 .js + docs/」数消费点的。
   *   只拷上面四件时，其余 390+ 模块的消费点会全为 0 —— 夹具上的「零消费」是**结构造成的
   *   假读数**，N2b 的绿于是成了空对空（真树绿、假树也绿，什么都没证）。
   *   镜子要照全，判据不因此放宽：这里只是把「门禁会读的面」逐字搬进夹具。
   *   hardlink 优先（同文件系统近乎零成本），失败退化为拷贝；两者内容与生产面逐字相同。 */
  mirrorProd(tmp);
  return tmp;
}

// N1: 增加未登记零消费模块
const tmp1 = createTempRepo();
try {
  const man = JSON.parse(fs.readFileSync(path.join(tmp1, 'manifest.json'), 'utf8'));
  man.extra_js.push('orphan_unregistered_probe.js');
  fs.writeFileSync(path.join(tmp1, 'manifest.json'), JSON.stringify(man), 'utf8');
  fs.writeFileSync(path.join(tmp1, 'orphan_unregistered_probe.js'), 'module.exports = {};', 'utf8');

  const n1 = spawnSync(process.execPath, [GATE], {
    cwd: tmp1,
    env: { ...process.env, LONSHA_AUDIT_ROOT: tmp1, LONSHA_AUDIT_FIXTURE: '1' },
    encoding: 'utf8',
  });

  if (n1.status !== 1) {
    failures.push(`N1 负控制失败：未登记孤儿模块期望 exit 1，实得 ${n1.status}\n${n1.stderr || n1.stdout}`);
  } else if (!n1.stderr.includes('orphan_unregistered_probe.js')) {
    failures.push('N1 负控制失败：输出未点名 orphan_unregistered_probe.js');
  }
} finally {
  fs.rmSync(tmp1, { recursive: true, force: true });
}

// N2a / N2b: allowed:0 的空理由与补齐理由（两向自证）
/* ★ [v3.474.0] 修前这一组是**恒假红**：它在生产台账里找 allowed:0 的条目，找不到就推一条失败。
 *   而生产台账 397 条全是 allowed:1（零消费模块早已清零）⇒ “找不到” 是常态，本组从那天起
 *   就永远红 —— 判据坏了，产品没坏。判据自己坏掉与产品坏掉必须不同形，故改成：
 *   在夹具里真造一个零消费模块（写进 manifest + 台账 allowed:0），然后分两向自证：
 *     N2a 同树上 why 留空白 ⇒ 必 exit 1 且必须报 R2 违规；
 *     N2b 同树补上理由 ⇒ 必 exit 0（证明红是「空理由」造成的，不是这个模块本身）。
 *   只做 N2a 而不做 N2b 的话，一棵永远红的树也能让 N2a 一直是“绿”的。 */
const N2_MOD = 'n2_zero_consumption_probe.js';
const N2_WHY = '负控制夹具：真零消费模块，仅供 N2 两向自证';
const tmp2 = createTempRepo();
try {
  const man2 = JSON.parse(fs.readFileSync(path.join(tmp2, 'manifest.json'), 'utf8'));
  man2.extra_js.push(N2_MOD);
  fs.writeFileSync(path.join(tmp2, 'manifest.json'), JSON.stringify(man2), 'utf8');
  /* 模块本体只声明一个产品面绝不重名的全局名 ⇒ 全仓无人消费（真零消费，不是“找不到消费点”）。 */
  fs.writeFileSync(path.join(tmp2, N2_MOD), 'window.N2ZeroConsumptionProbe = function () { return 1; };\n', 'utf8');
  const led2 = JSON.parse(fs.readFileSync(path.join(tmp2, 'tests/audit/module_consumption_ledger.json'), 'utf8'));
  led2.modules[N2_MOD] = {
    module: N2_MOD,
    surface: ['N2ZeroConsumptionProbe'],
    prod_call_sites: 0,
    business_call_sites: 0,
    load_surface_only: false,
    allowed: 0,
    why: '   '
  };
  fs.writeFileSync(path.join(tmp2, 'tests/audit/module_consumption_ledger.json'), JSON.stringify(led2), 'utf8');

  const env2 = { ...process.env, LONSHA_AUDIT_ROOT: tmp2, LONSHA_AUDIT_FIXTURE: '1' };
  const n2a = spawnSync(process.execPath, [GATE], { cwd: tmp2, env: env2, encoding: 'utf8' });
  if (n2a.status !== 1) {
    failures.push(`N2a 负控制失败：allowed:0 但理由空白期望 exit 1，实得 ${n2a.status}\n${n2a.stderr || n2a.stdout}`);
  } else if (!n2a.stderr.includes('R2 违规')) {
    failures.push('N2a 负控制失败：输出未包含「R2 违规」');
  }

  /* N2b：同一棵树，只把理由补上 ⇒ 必须转绿。这一向才证明 N2a 的红来自“空理由”。 */
  led2.modules[N2_MOD].why = N2_WHY;
  fs.writeFileSync(path.join(tmp2, 'tests/audit/module_consumption_ledger.json'), JSON.stringify(led2), 'utf8');
  const n2b = spawnSync(process.execPath, [GATE], { cwd: tmp2, env: env2, encoding: 'utf8' });
  if (n2b.status !== 0) {
    failures.push(`N2b 两向自证失败：同一棵树补上理由后期望 exit 0，实得 ${n2b.status}`
      + ` —— 若此处仍红，说明 R2 的红不是理由造成的\n${n2b.stderr || n2b.stdout}`);
  }
} finally {
  fs.rmSync(tmp2, { recursive: true, force: true });
}

// N3: 扫描面过少（fail-closed）
const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha_cons_negctl_failclosed_'));
try {
  fs.writeFileSync(path.join(tmp3, 'manifest.json'), JSON.stringify({ extra_js: ['only_one.js'] }), 'utf8');

  const n3 = spawnSync(process.execPath, [GATE], {
    cwd: tmp3,
    env: { ...process.env, LONSHA_AUDIT_ROOT: tmp3, LONSHA_AUDIT_FIXTURE: '0' },
    encoding: 'utf8',
  });

  if (n3.status !== 2) {
    failures.push(`N3 负控制失败：扫描面塌陷期望 exit 2，实得 ${n3.status}\n${n3.stderr || n3.stdout}`);
  } else if (!n3.stderr.includes('fail-closed')) {
    failures.push('N3 负控制失败：输出未点名 fail-closed');
  }
} finally {
  fs.rmSync(tmp3, { recursive: true, force: true });
}

// N4: 判据自证（K4 定点破坏）
// 前三组只造输入面异常，不证明「翻红是判据干的」：
//   若判据本身被写死成常量（假绿三形态之二），N1/N2 照样可能形意不明。
// 故本组直接破坏判据本体：把取台账的绑定换成恒 allowed:0 常量，
//   同一棵红树上原版必红、破坏版必不红。两向有一向不对，本组即失败。
const N4_ANCHOR = 'const ledgerEntry = registeredModules[modFile];';
const N4_BREAK = "const ledgerEntry = { allowed: 0, why: 'forced-by-negctl' };";
const tmp4 = createTempRepo();
try {
  const man4 = JSON.parse(fs.readFileSync(path.join(tmp4, 'manifest.json'), 'utf8'));
  man4.extra_js.push('n4_unregistered_probe.js');
  fs.writeFileSync(path.join(tmp4, 'manifest.json'), JSON.stringify(man4), 'utf8');
  fs.writeFileSync(path.join(tmp4, 'n4_unregistered_probe.js'), 'module.exports = {};', 'utf8');

  const gateSrc = fs.readFileSync(GATE, 'utf8');
  const hits = gateSrc.split(N4_ANCHOR).length - 1;
  if (hits !== 1) {
    throw new Error(`K4 锚点须恰中 1 次（实 ${hits}）—— 锚点漂移即破坏位置不可复现`);
  }
  fs.copyFileSync(path.join(REPO, 'tests/_audit_lib.mjs'), path.join(tmp4, 'tests/_audit_lib.mjs'));
  /* [L21-O1] 门禁已改走 `tests/_consumption_lib.mjs`（口径唯一真源），
   *   夹具必须一并复制它，否则两个探针都因 import 失败而 exit 1，
   *   N4 的「破坏版应不红」会被误判成「破坏没打到判据」—— 是夹具缺文件，不是判据问题。 */
  fs.copyFileSync(path.join(REPO, 'tests/_consumption_lib.mjs'), path.join(tmp4, 'tests/_consumption_lib.mjs'));
  fs.writeFileSync(path.join(tmp4, 'tests/audit/scan_orig_probe.mjs'), gateSrc, 'utf8');
  fs.writeFileSync(path.join(tmp4, 'tests/audit/scan_broken_probe.mjs'), gateSrc.replace(N4_ANCHOR, N4_BREAK), 'utf8');

  const env4 = { ...process.env, LONSHA_AUDIT_ROOT: tmp4, LONSHA_AUDIT_FIXTURE: '1' };
  const orig = spawnSync(process.execPath, [path.join(tmp4, 'tests/audit/scan_orig_probe.mjs')], { cwd: tmp4, env: env4, encoding: 'utf8' });
  const broken = spawnSync(process.execPath, [path.join(tmp4, 'tests/audit/scan_broken_probe.mjs')], { cwd: tmp4, env: env4, encoding: 'utf8' });

  if (orig.status !== 1) {
    failures.push(`N4 两向自证失败(正向)：同一棵红树上原版判据必须 exit 1，实得 ${orig.status}`
      + ` —— 红树本身没红，后续「破坏版不红」就无法归因
${orig.stderr || orig.stdout}`);
  }
  if (broken.status === 1) {
    failures.push('N4 两向自证失败(负向)：判据本体被破坏后仍翻红 ⇒ 破坏没打到真判据，本门禁的绿不可信');
  }
} catch (e) {
  failures.push('N4 两向自证失败：' + e.message);
} finally {
  fs.rmSync(tmp4, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error(`[consumption-negctl] 负控制不通过 (${failures.length} 项)：`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}

console.log('[consumption-negctl] 5 组负控制全绿（V0 原版对照 + N1/N2/N3/N4）。');
process.exit(0);