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