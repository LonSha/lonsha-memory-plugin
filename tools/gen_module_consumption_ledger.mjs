/* ============================================================
 * tools/gen_module_consumption_ledger.mjs — L21-O2 消费台账（三源并集 + 消费分层）
 * ------------------------------------------------------------
 * 立项现象（2026-11-11 实勘，机器读数）：
 *   旧台账 `total_modules = 263`，而 `manifest.extra_js` 有 **365** 项 ⇒ 102 个模块
 *   从未进过台账。根因不是 `getProdFiles` 漏文件，而是**台账本身是过期快照**：
 *   生成器每次都重算，但生成的 json 自 v3.4xx 起就没再重跑过。
 *   重跑后 `total_modules` 从 263 → 365（补上 102 个盲区），零消费从 19 → 6。
 *
 * 但重跑暴露出**更深一层缺陷**（本版要修的）：
 *   旧台账里那 19 个「零消费」，重跑后有 13 个变成 `prod_call_sites = 1`。
 *   逐条查证发现这 1 次调用**全部来自 `optional-engine-registry.js` 的 entries 字符串登记**：
 *     ['CSE', 'cse-engine.js'], ['MeaningEvolutionMap', 'meaning-evolution-map.js'], …
 *   而 `loadOne()` 只做 `root[globalName] || require('./'+fileName)`，
 *   `loadAll()` 把**返回非 null 的全部塞进一个对象**。查 `index.js`：
 *     · `loadAll()` 确实被真实调用 4 次（2747/11805/11907 行）⇒ 装载链路是真的；
 *     · 但真正被 `new Cls()` 实例化并使用的只有注册表里的**一部分**（flashbulb / mask …）；
 *     · 上面那 13 个在 `index.js` 里 grep 计数为 **0** —— 被 loadAll 泛泛取到，
 *       从来没有一处 `new` / 方法调用。
 *   ⇒ 「被 loadAll 取到」≠「被产品消费」。旧口径把二者等同，于是把 13 个零消费**洗白**成 active。
 *
 * 本版口径（分层，不改变装载事实）：
 *   · `prod_call_sites`     —— 旧口径总数（保持与既有门禁 scan_module_consumption 可比，
 *                              不回退别人的读数；该门禁仍按此字段判 R1）
 *   · `business_call_sites` —— **扣除装载登记后的业务消费**：扣掉 `LOAD_SURFACE_FILES` 里的
 *                              装载面引用，再扣掉 `docs/` 探针
 *   · `load_surface_only`   —— true 表示「只在装载面出现、业务面零消费」⇒ 真正的待处置项
 *
 * 诚实边界：
 *   ① 分层靠**文件级白名单**识别装载面，不靠语义推断；白名单写死在 `LOAD_SURFACE_FILES`，
 *      改动它必须同时改注释说明理由（不许静默放宽）。
 *   ② 本工具**不替产品决定**哪个模块该接线、哪个该降级 —— 只把读数摆准（那是 L21-O1 的活）。
 *   ③ `business_call_sites` 是**下界**：模块若通过注册表以外的动态名字被取用，本工具看不见。
 *   ④ 三源并集里的「宿主注入面」用 index.js 里的 `'xxx.js'` 字面量近似，会带上少量噪声；
 *      用「磁盘上真实存在的根级 .js」过滤，不猜。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { stripComments } from '../tests/_audit_lib.mjs';
import {
  extractModuleGlobals, countConsumptionIn, LOAD_SURFACE_FILES, countsAsBusiness,
  parseRegistryAliases,
} from '../tests/_consumption_lib.mjs';

const ROOT = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const extraJs = manifest.extra_js || [];

/* 装载面文件：这些文件里对模块名的引用属于「装载/登记」，不是业务消费。
 *   · optional-engine-registry.js —— entries 表登记 + loadOne 按全局名取类（纯装载）
 *   新增条目必须写明：为什么这个文件里的引用不算业务消费。 */
/* 装载面白名单已移入 `tests/_consumption_lib.mjs`（唯一真源），此处不再本地定义。 */
function getProdFiles(dir, base = dir) {
  let res = [];
  for (const n of fs.readdirSync(dir)) {
    if (n === 'node_modules' || n === '.git' || n === 'tests' || n === 'tools' || n.startsWith('.')) continue;
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      res = res.concat(getProdFiles(p, base));
    } else if (n.endsWith('.js') || n.endsWith('.mjs') || n.endsWith('.cjs')) {
      res.push(path.relative(base, p));
    }
  }
  return res;
}

const prodFiles = getProdFiles(ROOT);
const fileCodeMap = new Map();
for (const pf of prodFiles) {
  fileCodeMap.set(pf, stripComments(fs.readFileSync(path.join(ROOT, pf), 'utf8')));
}

/* 全局名提取与消费计数**一律走 `tests/_consumption_lib.mjs`**（唯一真源）。
 *   本工具不再内联第二份实现 —— 两套口径打架的代价见该文件头部留痕。 */
function moduleGlobalsOf(modFile) {
  return extractModuleGlobals(fileCodeMap.get(modFile) || '');
}

/* 三源并集：manifest.extra_js ∪ index.js 里登记的模块名 ∪ 根级磁盘 .js。
 *   三者并集后，任何被加载的模块都必须在台账里有一条。 */
function collectHostInjected() {
  const idx = fileCodeMap.get('index.js') || '';
  const out = new Set();
  for (const m of idx.matchAll(/['"`]([A-Za-z0-9_.\-]+\.js)['"`]/g)) out.add(m[1]);
  return out;
}

const hostInjected = collectHostInjected();
const allModuleNames = new Set([...extraJs, ...hostInjected]);
const moduleFiles = [...allModuleNames].filter((f) => {
  if (!f.endsWith('.js')) return false;
  const p = path.join(ROOT, f);
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch (_e) {
    return false;
  }
}).sort();

/* 注册表登记名 → 「该模块的对外标识符」。见 `parseRegistryAliases` 的注释：
 *   有一批模块**不挂载任何全局名**，消费方按注册表登记名取它
 *   （`optEngines.X || typeof X !== 'undefined' ? X : null` 然后 `new Cls()`）。
 *   不把这层补上，这类真实接线就永远被判成 load_surface_only。
 *   ★ 注册表那一行**本身不算消费**（仍在 LOAD_SURFACE_FILES 里被扣除），
 *     这里只是借用它给出的名字去别的文件里找消费。 */
const registryAliases = parseRegistryAliases(fileCodeMap.get('optional-engine-registry.js') || '');

const ledger = {};

for (const modFile of moduleFiles) {
  const baseName = modFile.replace(/\.js$/, '');
  /* ★ [L21-O1 修·口径统一] 必须把**源码**交给共享库：`extractModuleGlobals(code)` 收的是代码。
   *   本工具在把本地实现换成共享库时，这里仍传 `modFile`（文件名），
   *   ⇒ 共享函数拿不到代码 ⇒ 返回空数组 ⇒ 该模块的全局名全部丢失
   *   ⇒ 「装载了但业务不用」全被误判成 `zero_consumption`。此处修掉，并由判据②兜住回归。 */
  const ownGlobals = moduleGlobalsOf(modFile);
  /* 消费标识符 = 模块自挂全局名 ∪ 注册表登记名（后者对「不自挂全局名」的模块是唯一线索）。 */
  const alias = registryAliases.get(modFile);
  const modGlobals = alias && !ownGlobals.includes(alias) ? [...ownGlobals, alias] : ownGlobals;
  const surface = modGlobals.length > 0 ? modGlobals : [baseName];
  let prodCallSites = 0;
  let businessCallSites = 0;
  const callers = [];
  const loadSurfaceCallers = [];

  for (const [pf, code] of fileCodeMap.entries()) {
    if (pf === modFile) continue;
    const isLoadSurface = LOAD_SURFACE_FILES.has(pf);
    const isBusiness = countsAsBusiness(pf);
    /* 文件绑定 + 全局符号引用（含 `_winModule('X')` 字符串取全局）**一律走共享库**，
     *   与 `tests/audit/scan_module_consumption.mjs`（R1 门禁）是**同一份实现**。
     *   历史教训（2026-11-12 实勘）：两份实现各自演进后，台账说 0 个零消费、
     *   门禁说 6 个，**两边都「有道理」**，靠人记着同步 —— 已由本共享库根治。 */
    const { count, kinds } = countConsumptionIn(code, modFile, modGlobals);
    if (count <= 0) continue;
    prodCallSites += count;
    if (isBusiness) businessCallSites += count;
    (isLoadSurface ? loadSurfaceCallers : callers).push({ file: pf, count, type: kinds.join('+') });
  }

  const isZero = prodCallSites === 0;
  const loadSurfaceOnly = !isZero && businessCallSites === 0;
  /* 装载面零业务消费再细分两档 —— 二者的处置完全不同，不能混成一个桶：
   *   · load_surface_only    ：引用全部来自 `LOAD_SURFACE_FILES`（注册表登记）⇒ 装载能取到、业务不用
   *   · docs_probe_only      ：引用全部来自 `docs/` 计划探针 ⇒ **连装载面都没有**，只有文档在提它
   *     （原 scan_module_consumption 文件头留痕点名的 unified-recall.js 即此类） */
  const loadSurfaceRefs = loadSurfaceCallers.reduce((a, c) => a + c.count, 0);
  let why;
  if (isZero) {
    why = 'zero_consumption';
  } else if (loadSurfaceOnly) {
    /* 这里**不再写**「待后续阶段接线或降级」—— 那句话本身就是欠债标记（L21-O1 ① 禁）。
     *   本工具只如实标注事实；终局处置（接线 / 降级）由 L21-O1 逐条定性后回写。 */
    why = loadSurfaceRefs > 0 ? 'load_surface_only' : 'docs_probe_only';
  } else {
    why = 'active';
  }

  ledger[modFile] = {
    module: modFile,
    surface,
    prod_call_sites: prodCallSites,
    business_call_sites: businessCallSites,
    load_surface_only: loadSurfaceOnly,
    allowed: isZero || loadSurfaceOnly ? 0 : 1,
    why,
    callers: callers.slice(0, 12),
    load_surface_callers: loadSurfaceCallers.slice(0, 6),
  };
}

const modulesArr = Object.values(ledger);
const output = {
  schema: 'module-consumption-ledger@2',
  generated_at: new Date().toISOString(),
  /* 口径自证：三源并集后应与 extra_js 同源可比 */
  extra_js_count: extraJs.length,
  host_injected_count: [...hostInjected].filter((f) => ledger[f]).length,
  total_modules: modulesArr.length,
  zero_consumption_count: modulesArr.filter((e) => e.prod_call_sites === 0).length,
  load_surface_only_count: modulesArr.filter((e) => e.why === 'load_surface_only').length,
  docs_probe_only_count: modulesArr.filter((e) => e.why === 'docs_probe_only').length,
  active_count: modulesArr.filter((e) => e.why === 'active').length,
  modules: ledger,
};

fs.writeFileSync(
  path.join(ROOT, 'tests/audit/module_consumption_ledger.json'),
  JSON.stringify(output, null, 2) + '\n',
  'utf8'
);

console.log('生成 tests/audit/module_consumption_ledger.json 完成：');
console.log('  extra_js_count          :', output.extra_js_count);
console.log('  total_modules           :', output.total_modules);
console.log('  active_count            :', output.active_count);
console.log('  zero_consumption_count  :', output.zero_consumption_count);
console.log('  load_surface_only_count :', output.load_surface_only_count);