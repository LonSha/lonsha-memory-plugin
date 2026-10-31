// tests/audit/scan_extra_js_seam_negctl.mjs
// scan_extra_js_seam.mjs 的配对负控制
// ------------------------------------------------------------
// 判定规则：
//   V0 原版基线：直接执行门禁必须 exit 0；
//   N1 未登记 orphan：TSV 中造一条 orphan 但不在 module_consumption_ledger 登记 allowed:0 => 必 exit 1；
//   N2 空理由违规：orphan 对应台账条目的 why 设为空串 => 必 exit 1；
//   N3 结构健康下限：manifest extra_js 过少 => 必 exit 2 (fail-closed)；
//   N4 判据自证（K4 定点破坏）：锚点须恰中 1 次，破坏判据本体后同一红树上原版必红 / 破坏版必不红。
//
// 退出码：0 = 全部负控制成立  1 = 存在未通过负控制  2 = 门禁脚本缺失
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const GATE = path.join(REPO, 'tests/audit/scan_extra_js_seam.mjs');

if (!fs.existsSync(GATE)) {
  console.error('[seam-negctl] 缺门禁 scan_extra_js_seam.mjs');
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

function createTempRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha_seam_negctl_'));
  fs.mkdirSync(path.join(tmp, 'tests/audit'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'manifest.json'), path.join(tmp, 'manifest.json'));
  fs.copyFileSync(path.join(REPO, 'tests/audit/extra_js_seam_ledger.tsv'), path.join(tmp, 'tests/audit/extra_js_seam_ledger.tsv'));
  fs.copyFileSync(path.join(REPO, 'tests/audit/module_consumption_ledger.json'), path.join(tmp, 'tests/audit/module_consumption_ledger.json'));

  /* 门禁在 v3.427.0 加了「磁盘在场率」守卫（缺件过半 ⇒ exit 2 面塌陷）。
   * 镜像树若不放模块文件，四组负控制都会先在守卫处 exit 2，
   * 于是「N1/N2 翻红」不再是判据干的 —— 红不可归因等于负控制失效。
   * 故按 manifest 逐个落占位文件，让红只可能来自本组要打的那条判据。 */
  const man0 = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
  for (const mod of (man0.extra_js || [])) {
    const abs = path.join(tmp, mod);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (!fs.existsSync(abs)) fs.writeFileSync(abs, 'module.exports = {};', 'utf8');
  }
  return tmp;
}

// N1: TSV 中有一条 orphan 未在 module_consumption_ledger 登记 allowed:0
const tmp1 = createTempRepo();
try {
  const man = JSON.parse(fs.readFileSync(path.join(tmp1, 'manifest.json'), 'utf8'));
  man.extra_js.push('fake_orphan_mod.js');
  fs.writeFileSync(path.join(tmp1, 'manifest.json'), JSON.stringify(man), 'utf8');
  fs.writeFileSync(path.join(tmp1, 'fake_orphan_mod.js'), 'module.exports = {};', 'utf8');

  // 在 TSV 中追加该 orphan
  fs.appendFileSync(
    path.join(tmp1, 'tests/audit/extra_js_seam_ledger.tsv'),
    'fake_orphan_mod.js\tyes\tno\tnone\torphan\n',
    'utf8'
  );

  const n1 = spawnSync(process.execPath, [GATE], {
    cwd: tmp1,
    env: { ...process.env, LONSHA_AUDIT_ROOT: tmp1, LONSHA_AUDIT_FIXTURE: '1' },
    encoding: 'utf8',
  });

  if (n1.status !== 1) {
    failures.push(`N1 负控制失败：期望 exit 1，实得 ${n1.status}\n${n1.stderr || n1.stdout}`);
  } else if (!n1.stderr.includes('fake_orphan_mod.js')) {
    failures.push('N1 负控制失败：输出未点名 fake_orphan_mod.js');
  }
} finally {
  fs.rmSync(tmp1, { recursive: true, force: true });
}

// N2: orphan 对应条目 why 设为空串
const tmp2 = createTempRepo();
try {
  const cons = JSON.parse(fs.readFileSync(path.join(tmp2, 'tests/audit/module_consumption_ledger.json'), 'utf8'));
  const firstOrphan = 'modules_combined.js';
  if (cons.modules[firstOrphan]) {
    cons.modules[firstOrphan].why = '';
    fs.writeFileSync(path.join(tmp2, 'tests/audit/module_consumption_ledger.json'), JSON.stringify(cons), 'utf8');

    const n2 = spawnSync(process.execPath, [GATE], {
      cwd: tmp2,
      env: { ...process.env, LONSHA_AUDIT_ROOT: tmp2, LONSHA_AUDIT_FIXTURE: '1' },
      encoding: 'utf8',
    });

    if (n2.status !== 1) {
      failures.push(`N2 负控制失败：空理由期望 exit 1，实得 ${n2.status}\n${n2.stderr || n2.stdout}`);
    } else if (!n2.stderr.includes('理由为空')) {
      failures.push('N2 负控制失败：输出未包含「理由为空」');
    }
  } else {
    failures.push('N2 负控制失败：未在 ledger 找到测试 orphan 条目');
  }
} finally {
  fs.rmSync(tmp2, { recursive: true, force: true });
}

// N3: 扫描面塌陷 fail-closed
const tmp3 = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha_seam_negctl_failclosed_'));
try {
  fs.writeFileSync(path.join(tmp3, 'manifest.json'), JSON.stringify({ extra_js: ['only.js'] }), 'utf8');

  const n3 = spawnSync(process.execPath, [GATE], {
    cwd: tmp3,
    env: { ...process.env, LONSHA_AUDIT_ROOT: tmp3, LONSHA_AUDIT_FIXTURE: '0' },
    encoding: 'utf8',
  });

  if (n3.status !== 2) {
    failures.push(`N3 负控制失败：期望 exit 2，实得 ${n3.status}\n${n3.stderr || n3.stdout}`);
  }
} finally {
  fs.rmSync(tmp3, { recursive: true, force: true });
}

// N4: 判据自证（K4 定点破坏）
// N1/N2 造的是输入面异常，不能证明「翻红是判据干的」。
// 本组破坏判据本体：把台账取数换成恒「已登记 allowed:0 且理由非空」，
//   同一棵红树上原版必红、破坏版必不红；两向有一向不对即失败。
const N4_ANCHOR = 'const reg = consModules[mod];';
const N4_BREAK = "const reg = { allowed: 0, why: 'forced-by-negctl' };";
const tmp4 = createTempRepo();
try {
  const man4 = JSON.parse(fs.readFileSync(path.join(tmp4, 'manifest.json'), 'utf8'));
  man4.extra_js.push('n4_fake_orphan.js');
  fs.writeFileSync(path.join(tmp4, 'manifest.json'), JSON.stringify(man4), 'utf8');
  fs.appendFileSync(
    path.join(tmp4, 'tests/audit/extra_js_seam_ledger.tsv'),
    'n4_fake_orphan.js\tyes\tno\tnone\torphan\n',
    'utf8'
  );
  fs.writeFileSync(path.join(tmp4, 'n4_fake_orphan.js'), 'module.exports = {};', 'utf8');

  const gateSrc = fs.readFileSync(GATE, 'utf8');
  const hits = gateSrc.split(N4_ANCHOR).length - 1;
  if (hits !== 1) {
    throw new Error(`K4 锚点须恰中 1 次（实 ${hits}）—— 锚点漂移即破坏位置不可复现`);
  }
  fs.mkdirSync(path.join(tmp4, 'tests'), { recursive: true });
  fs.copyFileSync(path.join(REPO, 'tests/_audit_lib.mjs'), path.join(tmp4, 'tests/_audit_lib.mjs'));
  fs.writeFileSync(path.join(tmp4, 'tests/audit/scan_orig_probe.mjs'), gateSrc, 'utf8');
  fs.writeFileSync(path.join(tmp4, 'tests/audit/scan_broken_probe.mjs'), gateSrc.replace(N4_ANCHOR, N4_BREAK), 'utf8');

  const env4 = { ...process.env, LONSHA_AUDIT_ROOT: tmp4, LONSHA_AUDIT_FIXTURE: '1' };
  const orig = spawnSync(process.execPath, [path.join(tmp4, 'tests/audit/scan_orig_probe.mjs')], { cwd: tmp4, env: env4, encoding: 'utf8' });
  const broken = spawnSync(process.execPath, [path.join(tmp4, 'tests/audit/scan_broken_probe.mjs')], { cwd: tmp4, env: env4, encoding: 'utf8' });

  if (orig.status !== 1) {
    failures.push(`N4 两向自证失败(正向)：同一棵红树上原版判据必须 exit 1，实得 ${orig.status}`
      + ` —— 红树本身没红，后续「破坏版不红」无法归因
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
  console.error(`[seam-negctl] 负控制不通过 (${failures.length} 项)：`);
  for (const f of failures) console.error('  - ' + f);
  process.exit(1);
}

console.log('[seam-negctl] 5 组负控制全绿（V0 原版对照 + N1/N2/N3/N4）。');
process.exit(0);