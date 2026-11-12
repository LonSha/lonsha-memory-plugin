/* ============================================================
 * tests/v21_o2_ledger_coverage.test.mjs — L21-O2 消费台账覆盖全部装载面
 * ------------------------------------------------------------
 * 立项现象（计划书原文 + 2026-11-11 实勘读数）：
 *   旧台账 `total_modules = 263`，`manifest.extra_js` = **365** ⇒ 102 个模块是审计盲区。
 *   其中包含总调度器 `memory-symphony-orchestrator.js`（1509 行）本身。
 *   ⇒ 「它有没有被用」这件事，对 102 个模块从来没有被审计过。
 *
 * 重跑后又暴露更深一层（本套件一并守住）：
 *   旧台账 19 个「零消费」里有 13 个重跑后变成 1 —— 而这 1 次**全部来自
 *   `optional-engine-registry.js` 的 entries 字符串登记**，不是业务消费。
 *   台账若不区分「装载登记」与「业务消费」，就会把零消费洗白成 active。
 *
 * 本套件守四件事（对应计划书 ①②③④）：
 *   ① `total_modules` 与 `extra_js.length` 之差 ≤ 2（frame 壳允许）
 *   ② 每个 `extra_js` 项在台账里**恰有一条**（双向，不多不少）
 *   ③ 盲区为空：`extra_js` ∪ 宿主注入 全部在台账内，且每条都带可机读的 `why`
 *   ④ 负控制：删一条 ⇒ ② 必红；`extra_js` 加不存在的文件 ⇒ ② 必红
 *
 * 纪律：36 项做完前不跑全量；本套件单点可复现（node --test tests/v21_o2_ledger_coverage.test.mjs）。
 *
 * 诚实边界（写进判据免得后来者越权）：
 *   · 本套件只守「台账**覆盖是否完整**」，不守「某模块该接线还是该降级」——那是 L21-O1 的活。
 *   · `business_call_sites` 是**下界**，动态名字取用本工具看不见，套件不宣称它完备。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const LEDGER = () => JSON.parse(rd('tests/audit/module_consumption_ledger.json'));
const MANIFEST = () => JSON.parse(rd('manifest.json'));

const WHY_ENUM = ['active', 'zero_consumption', 'load_surface_only', 'docs_probe_only'];

/* ------------------------------------------------------------
 * ① 覆盖差：total_modules 与 extra_js 同源可比
 * ------------------------------------------------------------ */
test('① total_modules 与 extra_js.length 之差 ≤ 2（frame 壳 index.js 允许，其余不许）', () => {
  const L = LEDGER();
  const M = MANIFEST();
  const diff = L.total_modules - M.extra_js.length;
  assert.ok(
    diff >= 0 && diff <= 2,
    `total_modules(${L.total_modules}) 与 extra_js(${M.extra_js.length}) 差 ${diff}，超出允许的 0..2`
  );
  /* 台账自报字段必须与实测一致（防「字段是手抄的」） */
  assert.equal(L.total_modules, Object.keys(L.modules).length, 'total_modules 必须等于 modules 实际条数');
  assert.equal(L.extra_js_count, M.extra_js.length, 'extra_js_count 必须等于 manifest.extra_js.length');
});

/* ------------------------------------------------------------
 * ② 双向恰一条：extra_js ↔ 台账
 * ------------------------------------------------------------ */
test('② 每个 extra_js 项在台账里恰有一条（双向，不多不少）', () => {
  const L = LEDGER();
  const M = MANIFEST();
  const keys = Object.keys(L.modules);
  const dup = keys.filter((k, i) => keys.indexOf(k) !== i);
  assert.deepEqual(dup, [], '台账里有重复键：' + dup.join(' '));

  const missing = M.extra_js.filter((f) => !L.modules[f]);
  assert.deepEqual(missing, [], `extra_js 有 ${missing.length} 项不在台账里：` + missing.slice(0, 10).join(' '));

  /* 反向：台账里每条都必须真在 extra_js（frame 壳除外） */
  const extraSet = new Set(M.extra_js);
  const extraOnly = keys.filter((k) => !extraSet.has(k));
  assert.ok(
    extraOnly.length <= 2,
    `台账里有 ${extraOnly.length} 条不属于 extra_js（只允许 frame 壳 ≤2）：` + extraOnly.slice(0, 10).join(' ')
  );
  for (const k of extraOnly) {
    assert.equal(k, 'index.js', `非 frame 壳的多余条目：${k}`);
  }
});

/* ------------------------------------------------------------
 * ③ 盲区为空 + why 可机读 + 分层自洽
 * ------------------------------------------------------------ */
test('③ 盲区为空：extra_js 全部在台账内，且每条 why 都在枚举内', () => {
  const L = LEDGER();
  const M = MANIFEST();
  const bad = [];
  for (const f of M.extra_js) {
    const e = L.modules[f];
    if (!e) { bad.push(`${f}: 台账缺条目`); continue; }
    if (!WHY_ENUM.includes(e.why)) bad.push(`${f}: why=${e.why} 不在枚举内`);
    if (typeof e.prod_call_sites !== 'number') bad.push(`${f}: prod_call_sites 非数值`);
    if (typeof e.business_call_sites !== 'number') bad.push(`${f}: business_call_sites 非数值`);
    if (e.business_call_sites > e.prod_call_sites) {
      bad.push(`${f}: business(${e.business_call_sites}) > prod(${e.prod_call_sites})，分层倒挂`);
    }
  }
  assert.deepEqual(bad, [], '台账条目不自洽：\n' + bad.slice(0, 20).join('\n'));
});

test('③-b 分层自洽：active 必有业务消费；load_surface_only / docs_probe_only 必无', () => {
  const L = LEDGER();
  const errs = [];
  for (const [k, e] of Object.entries(L.modules)) {
    if (e.why === 'active' && !(e.business_call_sites >= 1)) {
      errs.push(`${k}: active 但 business_call_sites=${e.business_call_sites}`);
    }
    if ((e.why === 'load_surface_only' || e.why === 'docs_probe_only') && e.business_call_sites !== 0) {
      errs.push(`${k}: ${e.why} 但 business_call_sites=${e.business_call_sites}`);
    }
    if (e.why === 'zero_consumption' && e.prod_call_sites !== 0) {
      errs.push(`${k}: zero_consumption 但 prod_call_sites=${e.prod_call_sites}`);
    }
  }
  assert.deepEqual(errs, [], '分层与读数矛盾：\n' + errs.slice(0, 20).join('\n'));
});

test('③-c 零消费清单与台账自报数字一致（防字段手抄）', () => {
  const L = LEDGER();
  const zero = Object.values(L.modules).filter((e) => e.prod_call_sites === 0).length;
  assert.equal(L.zero_consumption_count, zero, 'zero_consumption_count 与实测不符');
  const ls = Object.values(L.modules).filter((e) => e.why === 'load_surface_only').length;
  assert.equal(L.load_surface_only_count, ls, 'load_surface_only_count 与实测不符');
  const act = Object.values(L.modules).filter((e) => e.why === 'active').length;
  assert.equal(L.active_count, act, 'active_count 与实测不符');
});

/* ------------------------------------------------------------
 * ④ 负控制：真改台账 / 真改 manifest ⇒ 判据必红
 * ------------------------------------------------------------ */
function withTampered(file, transform, fn) {
  const p = path.join(ROOT, file);
  const original = fs.readFileSync(p, 'utf8');
  const st = fs.statSync(p);
  const tampered = transform(original);
  assert.notEqual(tampered, original, `破坏锚点必须命中 ${file}（命中空等于没破坏）`);
  try {
    fs.writeFileSync(p, tampered, 'utf8');
    return fn();
  } finally {
    fs.writeFileSync(p, original, 'utf8');
    try { fs.utimesSync(p, st.atime, st.mtime); } catch (_e) { /* 尽力恢复 */ }
  }
}

test('④-a 负控制 — 从台账删掉一个模块条目 ⇒ ② 必须红', () => {
  const L0 = LEDGER();
  const victim = MANIFEST().extra_js[0];
  assert.ok(L0.modules[victim], '对照组：被删的模块原本必须在台账里');

  withTampered('tests/audit/module_consumption_ledger.json', (s) => {
    const d = JSON.parse(s);
    delete d.modules[victim];
    d.total_modules = Object.keys(d.modules).length;
    return JSON.stringify(d, null, 2) + '\n';
  }, () => {
    const L = LEDGER();
    const missing = MANIFEST().extra_js.filter((f) => !L.modules[f]);
    assert.ok(missing.includes(victim), `删掉 ${victim} 后 ② 必须点名它缺失，实测 missing=${missing.length}`);
  });
});

test('④-b 负控制 — extra_js 加一个磁盘上不存在的文件 ⇒ ② 必须红', () => {
  const ghost = 'this-module-does-not-exist-v21o2.js';
  assert.equal(fs.existsSync(path.join(ROOT, ghost)), false, '对照组：该文件本来就不存在');

  withTampered('manifest.json', (s) => {
    const d = JSON.parse(s);
    d.extra_js = [...d.extra_js, ghost];
    return JSON.stringify(d, null, 2) + '\n';
  }, () => {
    const L = LEDGER();
    const missing = MANIFEST().extra_js.filter((f) => !L.modules[f]);
    assert.ok(missing.includes(ghost), `往 extra_js 加幽灵文件后 ② 必须点名它，实测 missing=${missing.length}`);
  });
});

test('④-c 负控制 — 篡改台账自报数字 ⇒ ① 必须红（防字段手抄）', () => {
  /* 判据纯度：本负控制必须让 ① 的**真实断言**跑一遍并捕获它报红，
   *   不能只写「篡改后反正不相等」那种同义反复（那等于没测 ①）。
   *   做法：把 ① 的断言体抽成纯函数 checkDiffAsserts(L, M)，负控制里直接调它。 */
  const checkDiffAsserts = (L, M) => {
    const diff = L.total_modules - M.extra_js.length;
    assert.ok(
      diff >= 0 && diff <= 2,
      `total_modules(${L.total_modules}) 与 extra_js(${M.extra_js.length}) 差 ${diff}，超出允许的 0..2`
    );
    assert.equal(L.total_modules, Object.keys(L.modules).length, 'total_modules 必须等于 modules 实际条数');
    assert.equal(L.extra_js_count, M.extra_js.length, 'extra_js_count 必须等于 manifest.extra_js.length');
  };

  /* 对照组：原件必须能过 ①（否则「红」不说明问题） */
  checkDiffAsserts(LEDGER(), MANIFEST());

  withTampered('tests/audit/module_consumption_ledger.json', (s) => {
    const d = JSON.parse(s);
    d.total_modules = d.total_modules + 50;
    return JSON.stringify(d, null, 2) + '\n';
  }, () => {
    /* total_modules 被 +50 后，① 里**最先命中的**是「差值超界」那条断言（它排在自证断言前）。
     *   两条都是 ① 的真实断言，都算 ① 报红；但必须点名是 ① 的哪一条，不许含糊放过。
     *   ⇒ 用「两条 message 之一」做白名单，并断言确实是 AssertionError。 */
    assert.throws(
      () => checkDiffAsserts(LEDGER(), MANIFEST()),
      (err) => {
        assert.ok(err instanceof assert.AssertionError, '必须是断言失败，不是别的异常');
        const ok = /超出允许的 0\.\.2/.test(err.message)
          || /total_modules 必须等于 modules 实际条数/.test(err.message);
        if (!ok) throw err;
        return true;
      },
      '篡改 total_modules 后 ① 必须报红（差值超界 或 自证不符）'
    );
  });
});

test('④-d 负控制 — 篡改 extra_js_count ⇒ ① 必须红（自报字段与 manifest 不同源）', () => {
  const checkDiffAsserts = (L, M) => {
    const diff = L.total_modules - M.extra_js.length;
    assert.ok(diff >= 0 && diff <= 2, `差 ${diff} 超界`);
    assert.equal(L.total_modules, Object.keys(L.modules).length, 'total_modules 必须等于 modules 实际条数');
    assert.equal(L.extra_js_count, M.extra_js.length, 'extra_js_count 必须等于 manifest.extra_js.length');
  };
  checkDiffAsserts(LEDGER(), MANIFEST());

  withTampered('tests/audit/module_consumption_ledger.json', (s) => {
    const d = JSON.parse(s);
    d.extra_js_count = d.extra_js_count - 7;
    return JSON.stringify(d, null, 2) + '\n';
  }, () => {
    assert.throws(
      () => checkDiffAsserts(LEDGER(), MANIFEST()),
      /extra_js_count 必须等于 manifest.extra_js.length/,
      '篡改 extra_js_count 后 ① 必须点名它与 manifest 不同源'
    );
  });
});