/* ============================================================
 * tests/v21_o1_zero_consumption_triage.test.mjs — L21-O1 判据
 * ------------------------------------------------------------
 * 计划书原文（.agents/notes/proposed/architecture/2026-11-11-product-optimization-v21.md:54）：
 *   「19 个零消费模块逐条定性（接线 or 降级，二选一，不许再"待后续"）」
 *   验收：每条都要有机器读数变化（prod_call_sites 涨 或 从 extra_js 消失）。
 *
 * ★ 本项执行中**推翻了计划书的前提**，如实记在这里（不许悄悄改口径）：
 *   实测结论是「那 19 个零消费里，6 个是**判据假阳性**、13 个是**装载面洗白**」，
 *   产品侧一行代码都不欠。证据全部是机器读数，不是推理：
 *     · 6 个假阳性各有精确消费点（文件+行），见 tests/audit/l21_o1_triage.json
 *       `wired_all_along` 组；
 *     · 13 个的 `prod_call_sites=1` 那 1 次**全部**来自
 *       optional-engine-registry.js 的 entries 字符串登记（装载≠消费）；
 *     · 其中 4 个（vector-semantic-sparse-hybrid-retrieval / memory-salience-decay-curator /
 *       async-indexing-pipeline-debouncer / state-machine-chaos-monkey-resilience）
 *       其实另有真实消费点：index.js:11843/11855/11871/11875 的
 *       `optEngines.X || typeof X !== 'undefined' ? X : null` 然后 `new Cls()`。
 *       它们**不挂载任何全局名**，消费标识符只在注册表 entries 里 —— 这是
 *       第三种漏判形态，已由 `parseRegistryAliases` 修正。
 *   ⇒ 本项真实交付 = ①修正判据（不再靠装载面洗白）②把 11 个真休眠内核**逐条定性**。
 *
 * 判据清单（每条都配负控制，禁止恒绿）：
 *   ① 三处识别口径同源：生成器 / R1 门禁 / seam 生成器 都 import 共享库，且都无内联旧正则
 *   ② 共享库是唯一真源：`extractModuleGlobals` 能读 `global.*` / 任意前缀 / 排除 `__` 哨兵
 *   ③ `parseRegistryAliases` 确实解析出登记名，且映射到真实模块文件
 *   ④ 台账无假象：`zero_consumption_count === 0`，无 `why` 为空
 *   ⑤ triage 完整性：台账里每个 `load_surface_only` 模块都必须出现在 triage 表中（不许漏判）
 *   ⑥ triage 自洽：`wired_all_along` 的模块 `business_call_sites > 0`；
 *      `declared_dormant` 的模块 `business_call_sites === 0`
 *   ⑦ triage 禁止占位词：不得出现「待后续 / 待定 / TODO / TBD / 以后再说」
 *   ⑧ 装载面不被当消费：注册表自己的 entries 行不计入 `business_call_sites`
 *   ⑨ 负控制·删 triage 条目必红：删掉一条 dormant 判定后 ⑤ 必须失败
 *   ⑩ 负控制·篡改 business 读数必红：把 dormant 模块的 business 改成 1 后 ⑥ 必须失败
 *   ⑪ 负控制·口径分叉必红：往生成器里塞回内联旧正则，① 必须失败
 * ============================================================ */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '..');
const LIB = path.join(ROOT, 'tests/_consumption_lib.mjs');
const TRIAGE = path.join(ROOT, 'tests/audit/l21_o1_triage.json');
const LEDGER = path.join(ROOT, 'tests/audit/module_consumption_ledger.json');
const GEN = path.join(ROOT, 'tools/gen_module_consumption_ledger.mjs');
const GATE = path.join(ROOT, 'tests/audit/scan_module_consumption.mjs');
const SEAM = path.join(ROOT, 'tools/gen_extra_js_seam_ledger.mjs');

const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));

/* 旧口径的两条正则。任何文件里都不许再出现它们（出现就意味着又分叉了）。 */
const LEGACY_PATTERNS = [
  /window\\\.\(LonSha\[A-Za-z0-9_\]\+\)/,
  /globalThis\\\.\(\[A-Za-z0-9_\]\+Lib\)/,
];

const triage = readJson(TRIAGE);
const ledger = readJson(LEDGER);
const modules = ledger.modules || {};

const dormant = Object.keys(triage.verdicts.declared_dormant.modules);
const wired = Object.keys(triage.verdicts.wired_all_along.modules);

/* 台账里被判「装载面登记但业务零消费」的模块全集 */
const loadSurfaceOnly = Object.keys(modules).filter((m) => modules[m].why === 'load_surface_only');

/* ── ① 三处识别口径同源 ── */
test('① 生成器 / R1 门禁 / seam 生成器 都 import 共享库，且无内联旧正则', () => {
  for (const [name, p] of [['台账生成器', GEN], ['R1 门禁', GATE], ['seam 生成器', SEAM]]) {
    const src = read(p);
    assert.ok(src.includes('_consumption_lib.mjs'), `${name} 必须 import tests/_consumption_lib.mjs`);
    assert.ok(src.includes('countConsumptionIn'), `${name} 必须调用共享的 countConsumptionIn`);
    for (const pat of LEGACY_PATTERNS) {
      assert.ok(!pat.test(src), `${name} 仍残留内联旧口径正则 ${pat} —— 口径又分叉了`);
    }
  }
});

/* ── ② 共享库是唯一真源：能读三种挂载形态 ── */
test('② extractModuleGlobals 认 window./global./globalThis. 三种挂载，且排除 __ 哨兵', async () => {
  const { extractModuleGlobals } = await import(LIB);
  const code = [
    'window.LonShaA = 1;',
    'global.LonShaB = 2;',            // 旧正则漏这种
    'globalThis.SomeLib = 3;',
    'window.GraphDiffusion = 4;',      // 旧正则因无 LonSha 前缀而漏
    'global.MemoryVisualizer = 5;',
    'globalThis.__LonShaInternalLoaded = true;',  // 内部哨兵，必须排除
  ].join('\n');
  const got = extractModuleGlobals(code).sort();
  assert.deepEqual(got, ['GraphDiffusion', 'LonShaA', 'LonShaB', 'MemoryVisualizer', 'SomeLib'],
    `实际解析到 ${JSON.stringify(got)}`);
  assert.ok(!got.includes('__LonShaInternalLoaded'), '__ 哨兵不是对外面，必须排除');
});

/* ── ③ parseRegistryAliases 确实给出登记名 ── */
test('③ parseRegistryAliases 解析注册表 entries，且登记的模块文件真实存在', async () => {
  const { parseRegistryAliases } = await import(LIB);
  const registry = read(path.join(ROOT, 'optional-engine-registry.js'));
  const aliases = parseRegistryAliases(registry);
  assert.ok(aliases.size >= 80, `entries 应解析出 ≥80 项，实测 ${aliases.size}`);
  let missing = [];
  for (const [mod] of aliases) {
    if (!fs.existsSync(path.join(ROOT, mod))) missing.push(mod);
  }
  assert.deepEqual(missing, [], `注册表登记了不存在的文件：${missing.join(', ')}`);
  // 不自挂全局名的那 4 个，必须靠 alias 才能被认出来
  for (const m of ['vector-semantic-sparse-hybrid-retrieval.js', 'memory-salience-decay-curator.js',
    'async-indexing-pipeline-debouncer.js', 'state-machine-chaos-monkey-resilience.js']) {
    assert.ok(aliases.has(m), `${m} 应在注册表里，否则它的消费点永远读不到`);
  }
});

/* ── ④ 台账无假象：零引用必须逐条定性，不许留空理由 ── */
test('④ 台账里每个零引用/零业务模块都已逐条定性，且 why 不为空', () => {
  /* ★ [v3.465.1] 本条原写 `assert.equal(ledger.zero_consumption_count, 0, '仍存在零消费模块 = 判据没修干净')`。
   *   那个断言把「L21-O1 结束时读数必须归零」当成了判据，而计划原文的验收是
   *   「**接线 or 降级，二选一**」—— 归零只是「接线」这一支的结果，不是唯一合格态。
   *
   *   实勘（v3.464.0 撤掉一条不成立的登记后暴露）：`floor-fingerprint-self-healer.js`
   *   全仓零引用 —— 既无业务消费、**也没有装载面引用**（它不在可选引擎注册表的 entries 里）。
   *   按纪律只能定性为休眠内核（`declared_dormant`，见 tests/audit/l21_o1_triage.json），
   *   不得为凑读数去伪造一个消费点（`do not add a consumer solely to satisfy the audit`）。
   *   此时若判据仍要求 count===0，唯一出路就是造一条假引用 —— 判据本身在逼人做坏事。
   *
   *   故本条的判据面改为**它真正要防的那件事**：
   *     ① 零引用的模块**必须**被逐条定性（在 triage 的任一组里出现），不许静默存在；
   *     ② `why` 不得为空（空理由 = 没定性）；
   *     ③ 若 `zero_consumption_count > 0`，则差异必须**恰好**等于 triage 里
   *        `declared_dormant` 且 reason 写明「全仓无引用」的那几个 —— 多一个都不行
   *        （多出来的就是真的没修干净的东西）。
   *   这三条一起，既拦得住「没修干净」，也拦得住「靠造引用洗绿读数」。 */
  const emptyWhy = Object.keys(modules).filter((m) => !modules[m].why || !String(modules[m].why).trim());
  assert.deepEqual(emptyWhy, [], `台账有条目 why 为空：${emptyWhy.join(', ')}`);

  const zeroRef = Object.keys(modules).filter((m) => modules[m].prod_call_sites === 0);
  assert.equal(ledger.zero_consumption_count, zeroRef.length,
    `台账 zero_consumption_count=${ledger.zero_consumption_count} 与逐条读数 ${zeroRef.length} 不一致（读数自相矛盾）`);

  /* ① 每个零引用模块都必须在 triage 里有终局判定 */
  const judged = new Set([...dormant, ...wired]);
  const unjudged = zeroRef.filter((m) => !judged.has(m));
  assert.deepEqual(unjudged, [],
    `以下模块零引用，但 triage 未给终局判定（L21-O1 禁止「待后续」）：${unjudged.join(', ')}`);

  /* ③ 零引用的允许集合 = triage 里 declared_dormant 且理由写明「全仓无引用/无调用点」的 */
  const dormantReason = (m) => {
    const rec = triage.verdicts?.declared_dormant?.modules?.[m];
    return rec && typeof rec.reason === 'string' ? rec.reason : '';
  };
  const legitDormant = zeroRef.filter((m) => /全仓无(任何)?(引用|调用点)|无任何调用点/.test(dormantReason(m)));
  assert.deepEqual(zeroRef.slice().sort(), legitDormant.slice().sort(),
    `零引用模块里出现了未按「全仓无调用点」定性的条目：${zeroRef.filter((m) => !legitDormant.includes(m)).join(', ')}`
    + ' —— 这类要么真没修干净（应接线），要么定性理由没写清（应补 triage）');

  /* ★ 诚实边界：本条不保证「零引用是好事」。它只保证「零引用有据可查、不静默」。 */
});

/* ── ⑤ triage 完整性：每个 load_surface_only 都要有终局判定 ── */
test('⑤ 台账里每个 load_surface_only 模块都在 triage 表里有终局判定（不许漏判）', () => {
  assert.ok(loadSurfaceOnly.length > 0, '台账里应存在 load_surface_only 模块（否则本判据空转）');
  const covered = new Set([...dormant, ...wired]);
  const uncovered = loadSurfaceOnly.filter((m) => !covered.has(m));
  assert.deepEqual(uncovered, [],
    `以下模块装载了但业务不用，且 triage 未定性（L21-O1 禁止「待后续」）：${uncovered.join(', ')}`);
});

/* ── ⑥ triage 自洽 ── */
test('⑥ triage 判定与台账读数自洽（wired 必有业务消费 / dormant 必无）', () => {
  for (const m of wired) {
    const n = modules[m];
    assert.ok(n, `wired 模块 ${m} 必须出现在台账中`);
    assert.ok(n.business_call_sites > 0,
      `${m} 被判 wired_all_along，但 business_call_sites=${n.business_call_sites} —— 判定与读数矛盾`);
  }
  for (const m of dormant) {
    const n = modules[m];
    assert.ok(n, `dormant 模块 ${m} 必须出现在台账中`);
    assert.equal(n.business_call_sites, 0,
      `${m} 被判 declared_dormant，但 business_call_sites=${n.business_call_sites} —— 它其实有人用，判定过期`);
  }
});

/* ── ⑦ 禁止占位词 ── */
/* 检测范围**只覆盖判定正文**（reason / evidence / desc），不扫整个 json 文本。
 *   原因：`note` 字段本身就写着「本表禁止出现待后续/待定/TODO/TBD」——
 *   全文本扫描会把这条**禁令本身**判成违规（判据误伤自己，首跑当场踩到）。
 *   这与「注释算不算消费」是同一类错误：把元信息当成被测对象。 */
const PLACEHOLDERS = ['待后续', '待定', 'TODO', 'TBD', '以后再说', '后续阶段'];
test('⑦ triage 判定正文内不得出现占位词（L21-O1 明令禁止「待后续」）', () => {
  const offenders = [];
  const scan = (where, text) => {
    if (typeof text !== 'string') return;
    const hit = PLACEHOLDERS.filter((w) => text.includes(w));
    if (hit.length) offenders.push(`${where}: ${hit.join(',')}`);
  };
  for (const group of Object.values(triage.verdicts)) {
    scan('verdicts.desc', group.desc);
    for (const [mod, v] of Object.entries(group.modules)) {
      scan(`${mod}.reason`, v.reason);
      if (Array.isArray(v.evidence)) v.evidence.forEach((e, i) => scan(`${mod}.evidence[${i}]`, e));
    }
  }
  assert.deepEqual(offenders, [], `triage 判定正文出现占位词（必须给终局判定）：${offenders.join(' | ')}`);
});

/* ── ⑧ 装载面登记不算业务消费 ── */
test('⑧ 注册表 entries 行不计入 business_call_sites（装载 ≠ 消费）', async () => {
  const { countsAsBusiness } = await import(LIB);
  assert.equal(countsAsBusiness('optional-engine-registry.js'), false,
    '注册表自身属于装载面，其引用不得计入业务消费');
  assert.equal(countsAsBusiness('docs/planning/x.mjs'), false, 'docs 探针不算业务消费');
  assert.equal(countsAsBusiness('index.js'), true, 'index.js 是业务消费面');
  // 读数侧自证：dormant 模块**不得**有业务消费；来自装载面的引用（若有）必须解释掉全部 prod
  for (const m of dormant) {
    const n = modules[m];
    assert.equal(n.business_call_sites, 0,
      `${m} 已被定性为休眠，但读数里 business_call_sites=${n.business_call_sites}（读数与定性矛盾）`);
    const loadRefs = (n.load_surface_callers || []).reduce((a, c) => a + c.count, 0);
    /* ★ [v3.465.1] 原文在这里硬要求 `loadRefs > 0` —— 前提是「dormant 一定是装载面洗白的那一类」。
     *   实勘推翻：`floor-fingerprint-self-healer.js` 全仓零引用，连装载面都没有
     *   （不在可选引擎注册表 entries 里），它的 refs 就是 0。硬要求 >0 会把这个
     *   已如实定性的休眠内核判红，逼人去注册表里加一条假登记来满足判据 ——
     *   那正是 `do not add a consumer solely to satisfy the audit` 明令禁止的。
     *   故此处只保证「**若有**装载面引用，它必须解释掉全部 prod」这一条不变式：
     *   prod 与装载面之差不为 0，说明还有第三个来源没被看见，判定需复核。 */
    assert.equal(loadRefs, n.prod_call_sites,
      `${m}：prod=${n.prod_call_sites} 但装载面贡献=${loadRefs} —— 差额说明另有来源，判定需复核`);
    if (loadRefs === 0) {
      /* 零装载面零业务的休眠内核：必须已在 triage 里按「全仓无调用点」写明理由，
       *   否则就是「既没人用、也没人解释」，属于静默存在。 */
      const rec = triage.verdicts?.declared_dormant?.modules?.[m];
      assert.ok(rec && /全仓无(任何)?(引用|调用点)|无任何调用点/.test(String(rec.reason || '')),
        `${m} 连装载面引用都没有，必须按「全仓无调用点」写清 triage 理由（不许静默存在）`);
    }
  }
});

/* ── ⑨ 负控制：删 triage 一条判定，⑤ 必须红 ── */
test('⑨ 负控制·删掉一条 dormant 判定后，⑤ 的完整性检查必须失败', () => {
  const victim = dormant[0];
  const mutated = JSON.parse(JSON.stringify(triage));
  delete mutated.verdicts.declared_dormant.modules[victim];
  const covered = new Set([
    ...Object.keys(mutated.verdicts.declared_dormant.modules),
    ...Object.keys(mutated.verdicts.wired_all_along.modules),
  ]);
  const uncovered = loadSurfaceOnly.filter((m) => !covered.has(m));
  assert.ok(uncovered.includes(victim),
    `负控制失败：删掉 ${victim} 的判定后，完整性检查没发现它 —— 说明 ⑤ 是假绿`);
});

/* ── ⑩ 负控制：篡改 business 读数，⑥ 必须红 ── */
test('⑩ 负控制·把 dormant 模块的 business 改成 1 后，⑥ 的自洽检查必须失败', () => {
  const victim = dormant[0];
  const fake = JSON.parse(JSON.stringify(modules));
  fake[victim].business_call_sites = 1;
  assert.throws(() => {
    for (const m of dormant) {
      assert.equal(fake[m].business_call_sites, 0,
        `${m} business_call_sites=${fake[m].business_call_sites} —— 与 dormant 判定矛盾`);
    }
  }, (e) => e.message.includes(victim) && e.message.includes('矛盾'),
    '负控制失败：篡改后 ⑥ 没有以预期方式报错');
});

/* ── ⑪ 负控制：往生成器塞回内联旧正则，① 必须红 ── */
test('⑪ 负控制·生成器里塞回内联旧正则后，① 的口径同源检查必须失败', () => {
  const src = read(GEN);
  const poisoned = src + '\nconst __legacy = code.match(/window\\.(LonSha[A-Za-z0-9_]+)\\s*=/g);\n';
  const hit = LEGACY_PATTERNS.filter((p) => p.test(poisoned));
  assert.ok(hit.length > 0, '负控制失败：塞回旧正则后 ① 检测不到 —— 说明 ① 的检测是空壳');
  // 对照组：原文必须干净
  const clean = LEGACY_PATTERNS.filter((p) => p.test(src));
  assert.deepEqual(clean, [], `生成器本来就不该有旧正则，实测命中 ${clean}`);
});