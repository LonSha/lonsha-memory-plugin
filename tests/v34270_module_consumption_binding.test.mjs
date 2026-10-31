/* ============================================================
 * tests/v34270_module_consumption_binding.test.mjs — L11-O3 绑定级消费判定验收
 * ------------------------------------------------------------
 * 核心契约：
 *   旧口径（裸名字搜索）：只要代码中有函数名同名词面，不论来自哪个模块都判为已消费（产生假绿）。
 *   新口径（绑定级判定）：消费只解析到确定的模块路径（import ... from / require(...) / _moduleLib）。
 *   夹具造「A.js 有同名导出 funcOrphan，B.js 也有同名导出 funcOrphan，产品端仅显式引用 B.js」：
 *   - 旧口径：由于全仓存在 funcOrphan 字面量，把 A.js 也误判为已消费（假绿）；
 *   - 新口径：必须判定 A.js 为 0 消费孤儿、B.js 为活跃消费！
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { auditModuleConsumption } from './audit/scan_module_consumption.mjs';

test('L11-O3: 绑定级判定 vs 裸名字口径 — 同名函数不跨模块串扰', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha_binding_test_'));
  fs.mkdirSync(path.join(tmp, 'tests/audit'), { recursive: true });

  try {
    // 构造 manifest.json 注册两个模块 module-alpha.js 与 module-beta.js
    const manifest = {
      name: 'binding-test',
      version: '1.0.0',
      js: 'index.js',
      extra_js: ['module-alpha.js', 'module-beta.js'],
    };
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest), 'utf8');

    // 两个模块都导出同名函数 duplicateWorker
    fs.writeFileSync(
      path.join(tmp, 'module-alpha.js'),
      'function duplicateWorker() { return "alpha"; }\nmodule.exports = { duplicateWorker };',
      'utf8'
    );
    fs.writeFileSync(
      path.join(tmp, 'module-beta.js'),
      'function duplicateWorker() { return "beta"; }\nmodule.exports = { duplicateWorker };',
      'utf8'
    );

    // 产品端 index.js 仅显式引入 module-beta.js
    fs.writeFileSync(
      path.join(tmp, 'index.js'),
      'const beta = require("./module-beta.js");\nconst res = beta.duplicateWorker();\n',
      'utf8'
    );

    // 台账中两个都登记为 active（allowed: 1），此时若 alpha 未被消费，应抓出缺陷
    const ledger = {
      schema: 'module-consumption-ledger@1',
      modules: {
        'module-alpha.js': { module: 'module-alpha.js', surface: ['duplicateWorker'], prod_call_sites: 0, allowed: 1, why: 'active' },
        'module-beta.js': { module: 'module-beta.js', surface: ['duplicateWorker'], prod_call_sites: 1, allowed: 1, why: 'active' },
      },
    };
    fs.writeFileSync(path.join(tmp, 'tests/audit/module_consumption_ledger.json'), JSON.stringify(ledger), 'utf8');

    // 1. 模拟旧口径（裸名字搜索）
    const indexCode = fs.readFileSync(path.join(tmp, 'index.js'), 'utf8');
    const oldAlphaConsumed = /\bduplicateWorker\b/.test(indexCode);
    const oldBetaConsumed = /\bduplicateWorker\b/.test(indexCode);
    // 旧口径下：因为 indexCode 里有 duplicateWorker，两者都被判为已消费（假绿！）
    assert.equal(oldAlphaConsumed, true, '旧口径因裸名字命中而误判 alpha 已消费（假绿）');
    assert.equal(oldBetaConsumed, true, '旧口径判定 beta 已消费');

    // 2. 跑新口径审计
    const res = auditModuleConsumption(tmp, { fixture: true });
    assert.equal(res.status, 'defect', '新口径必须抓出 alpha 实际上未被显式引用的真实缺陷');
    assert.equal(res.exitCode, 1);
    assert.ok(
      res.unconsumedUnregistered.some(u => u.module === 'module-alpha.js'),
      '新口径必须精准点名 module-alpha.js 零消费孤儿'
    );
    assert.ok(
      !res.unconsumedUnregistered.some(u => u.module === 'module-beta.js'),
      '新口径确认 module-beta.js 有真实调用点，不得误杀'
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('L11-O3: 真接线但同名 — 两者都有显式绑定时两口径均放行，不许误杀', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha_binding_both_'));
  fs.mkdirSync(path.join(tmp, 'tests/audit'), { recursive: true });

  try {
    const manifest = {
      name: 'binding-test',
      version: '1.0.0',
      js: 'index.js',
      extra_js: ['module-alpha.js', 'module-beta.js'],
    };
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify(manifest), 'utf8');

    fs.writeFileSync(path.join(tmp, 'module-alpha.js'), 'module.exports = { run: () => 1 };', 'utf8');
    fs.writeFileSync(path.join(tmp, 'module-beta.js'), 'module.exports = { run: () => 2 };', 'utf8');

    // index.js 同时显式绑定 alpha 与 beta
    fs.writeFileSync(
      path.join(tmp, 'index.js'),
      'const alpha = require("./module-alpha.js");\nconst beta = require("./module-beta.js");\nalpha.run(); beta.run();\n',
      'utf8'
    );

    const ledger = {
      schema: 'module-consumption-ledger@1',
      modules: {
        'module-alpha.js': { module: 'module-alpha.js', prod_call_sites: 1, allowed: 1, why: 'active' },
        'module-beta.js': { module: 'module-beta.js', prod_call_sites: 1, allowed: 1, why: 'active' },
      },
    };
    fs.writeFileSync(path.join(tmp, 'tests/audit/module_consumption_ledger.json'), JSON.stringify(ledger), 'utf8');

    const res = auditModuleConsumption(tmp, { fixture: true });
    assert.equal(res.status, 'ok', '两者都有显式绑定时必须正常通过');
    assert.equal(res.exitCode, 0);
    assert.equal(res.unconsumedUnregistered.length, 0);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/* ============================================================
 * [v3.431.0] 夹具**位置无关**：getProdFiles 的相对路径基准必须跟随传入的 root。
 * ------------------------------------------------------------
 * 为什么补这一条（真缺陷，不是假想的洁癖）：
 *   getProdFiles(root) 返回的 pf 会被调用方用 `path.join(rootDir, pf)` 再拼回去
 *   读文件 —— 两处必须是**同一个基准**。修前实现里 relative 用的是模块级 ROOT，
 *   于是只有当「夹具路径能相对 ROOT 还原」时才碰巧成立：
 *     · 夹具在 os.tmpdir() (/tmp) 下 ⇒ pf = ../../../tmp/x/f.js，拼回去恰好还原 ✅
 *     · 夹具落在与 ROOT 同前缀的其它盘位 ⇒ pf = ../.lonsha-test-tmp/r/x/f.js，
 *       拼回去变成 …/r/.lonsha-test-tmp/r/x/f.js（不存在）⇒ 生产代码全部读空
 *       ⇒ 每个模块 prodCallSites 退化成 0 ⇒ 对**有消费**的模块报「零消费」🔴
 *   这正是把测试临时根从 /tmp（tmpfs，吃 RAM）挪到磁盘后当场炸出来的：
 *   v34270 前两条判据同时翻红，而它们单独跑（/tmp 布局）全绿 —— 也就是说
 *   这个缺陷此前一直躲在本机 /tmp 的路径巧合后面。
 *   本条判据把「基准必须跟随 root」钉死：夹具刻意建在**仓库同级**目录
 *   （与 ROOT 共享 /home/<user>/ 前缀，正是旧写法会拼错的那种位置）。
 *   ⚠ 只断「零消费不存在」还不够 —— 必须同时断「有消费的模块必须被认出来」，
 *     否则「把一切都判成零消费」也能让前半句成立（那才是真误杀）。
 * ============================================================ */
test('L11-O3: 夹具位置无关 — 相对路径基准须跟随传入 root（非模块级 ROOT）', () => {
  // 刻意选与仓库根同前缀的基址：这正是旧实现拼错路径的那种布局
  // 目录名必须已被 .gitignore 忽略（.lonsha-test-tmp/），否则测试会往工作区里落未跟踪文件
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const sibling = path.join(path.dirname(repoRoot), '.lonsha-test-tmp');
  fs.mkdirSync(sibling, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(sibling, 'pos-'));
  fs.mkdirSync(path.join(tmp, 'tests/audit'), { recursive: true });

  try {
    fs.writeFileSync(path.join(tmp, 'manifest.json'), JSON.stringify({
      name: 'binding-pos', version: '1.0.0', js: 'index.js',
      extra_js: ['module-alpha.js', 'module-beta.js'],
    }), 'utf8');
    fs.writeFileSync(path.join(tmp, 'module-alpha.js'),
      'function duplicateWorker() { return "alpha"; }\nmodule.exports = { duplicateWorker };', 'utf8');
    fs.writeFileSync(path.join(tmp, 'module-beta.js'),
      'function duplicateWorker() { return "beta"; }\nmodule.exports = { duplicateWorker };', 'utf8');
    // 产品端只显式绑定 beta —— alpha 是真·零消费，beta 是真·有消费
    fs.writeFileSync(path.join(tmp, 'index.js'),
      'const beta = require("./module-beta.js");\nconst res = beta.duplicateWorker();\n', 'utf8');
    fs.writeFileSync(path.join(tmp, 'tests/audit/module_consumption_ledger.json'), JSON.stringify({
      schema: 'module-consumption-ledger@1',
      modules: {
        'module-alpha.js': { module: 'module-alpha.js', surface: ['duplicateWorker'], prod_call_sites: 0, allowed: 1, why: 'active' },
        'module-beta.js': { module: 'module-beta.js', surface: ['duplicateWorker'], prod_call_sites: 1, allowed: 1, why: 'active' },
      },
    }), 'utf8');

    const res = auditModuleConsumption(tmp, { fixture: true });

    // ① 真·零消费的 alpha 必须被抓出来（否则判据整个失效）
    assert.ok(res.unconsumedUnregistered.some((u) => u.module === 'module-alpha.js'),
      '位置无关：零消费的 module-alpha.js 必须被点名');
    // ② 真·有消费的 beta **不得**被判成零消费 —— 旧写法在这里会把 beta 也报成孤儿
    assert.ok(!res.unconsumedUnregistered.some((u) => u.module === 'module-beta.js'),
      '位置无关：有真实绑定的 module-beta.js 不得误杀（旧写法在非同前缀布局下会误杀）');
    assert.equal(res.unconsumedUnregistered.length, 1,
      '位置无关：有且仅有 alpha 一个零消费孤儿');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    try { fs.rmdirSync(sibling); } catch { /* 非空或不存在都无所谓 */ }
  }
});