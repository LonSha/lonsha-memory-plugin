// tests/audit/scan_module_consumption_negctl.mjs
// scan_module_consumption.mjs 的配对负控制
// ------------------------------------------------------------
// 判定规则：
//   V0 原版基线：直接执行门禁必须 exit 0；
//   N1 未登记零消费：制造一个零消费且未登记的 extra_js 模块 => 必 exit 1 并点名模块；
//   N2 空理由违规：把 ledger 里 allowed:0 的 why 改为空串 => 必 exit 1 并报 R2 违规；
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

// 辅助创建临时轻量镜像
function createTempRepo() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha_cons_negctl_'));
  fs.mkdirSync(path.join(tmp, 'tests/audit'), { recursive: true });
  // 复制必要文件
  fs.copyFileSync(path.join(REPO, 'manifest.json'), path.join(tmp, 'manifest.json'));
  fs.copyFileSync(path.join(REPO, 'index.js'), path.join(tmp, 'index.js'));
  fs.copyFileSync(path.join(REPO, 'tests/audit/module_consumption_ledger.json'), path.join(tmp, 'tests/audit/module_consumption_ledger.json'));
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

// N2: allowed:0 但 why 为空
const tmp2 = createTempRepo();
try {
  const led = JSON.parse(fs.readFileSync(path.join(tmp2, 'tests/audit/module_consumption_ledger.json'), 'utf8'));
  // 找一个 allowed:0 的条目，将 why 设为空串
  const k = Object.keys(led.modules).find(m => led.modules[m].allowed === 0);
  if (k) {
    led.modules[k].why = '   ';
    fs.writeFileSync(path.join(tmp2, 'tests/audit/module_consumption_ledger.json'), JSON.stringify(led), 'utf8');

    const n2 = spawnSync(process.execPath, [GATE], {
      cwd: tmp2,
      env: { ...process.env, LONSHA_AUDIT_ROOT: tmp2, LONSHA_AUDIT_FIXTURE: '1' },
      encoding: 'utf8',
    });

    if (n2.status !== 1) {
      failures.push(`N2 负控制失败：空理由期望 exit 1，实得 ${n2.status}\n${n2.stderr || n2.stdout}`);
    } else if (!n2.stderr.includes('R2 违规')) {
      failures.push('N2 负控制失败：输出未包含「R2 违规」');
    }
  } else {
    failures.push('N2 负控制失败：未在 ledger 中找到 allowed:0 的条目');
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