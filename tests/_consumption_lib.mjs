/* ============================================================
 * tests/_consumption_lib.mjs — 模块消费识别共享口径（L21-O1/O2 唯一真源）
 * ------------------------------------------------------------
 * 为什么抽出来（2026-11-12 实测，两门禁口径打架的现场）：
 *   `tools/gen_module_consumption_ledger.mjs`（台账生成器）与
 *   `tests/audit/scan_module_consumption.mjs`（R1 门禁）各自实现了一份
 *   「这模块有没有被消费」的判断。本项修复其中一份后，两边读数**立刻不一致**：
 *     · 生成器认 `global.LonSha*` / `window.GraphDiffusion` / `_winModule('X')`
 *     · 门禁只认 `window.LonSha*` / `globalThis.*Lib`
 *   ⇒ 台账说 0 零消费，门禁说 6 个零消费 ⇒ 门禁红，且**两边都「有道理」**。
 *   这正是本仓反复治理过的缺陷形态：同一事实两套口径，靠人记着去同步。
 *   ⇒ 修法不是「再同步一次」，而是**把口径抽成唯一真源**，两处都 import 它。
 *
 * 本文件的识别规则（与原门禁规则的差异逐条写明，便于审计）：
 *   G1 全局挂载形态：`window.X = ` / `global.X = ` / `globalThis.X = `
 *      —— 原门禁只认前两种**且**要求名字带 `LonSha` 前缀 / `*Lib` 后缀；
 *         实测漏掉 `global.LonSha*`（3 件）、`window.GraphDiffusion`、
 *         `global.MemoryVisualizer`（2 件）。
 *   G2 消费引用形态：裸名 / `typeof X` / 字符串取全局 `_winModule('X')`。
 *      —— 原门禁漏掉字符串取全局（`api-channels` 即此类）。
 *   G3 去重：同一文件同一符号**只记一次**（取两种形态命中数较大者），
 *      因为一行真实代码常同时被裸名与字符串两个正则命中。
 *
 * 诚实边界：
 *   · 这是**静态**识别：动态拼出来的全局名（如 `window['Lon'+'Sha']`）看不见。
 *   · 它判「有没有引用」，不判「引用得对不对」——语义正确性是各模块自己判据的事。
 * ============================================================ */

/* 装载面白名单：这些文件对模块的引用是「装载登记」，**不是业务消费**。
 *   `optional-engine-registry.js` 的 entries 表形如 ['CSE','cse-engine.js']，
 *   `loadOne()` 只做 `root[globalName] || require('./'+fileName)`，
 *   `loadAll()` 把返回非 null 的全部塞进一个对象 —— 被取到 ≠ 被产品使用。
 *   该文件必须留在装载链路（index.js 真实调用 loadAll() 三处），
 *   因此**不能排除**，只能在统计「业务消费」时扣除。 */
export const LOAD_SURFACE_FILES = new Set(['optional-engine-registry.js']);

/** 该文件是否属于装载面（其引用不计业务消费）。 */
export function isLoadSurfaceFile(file) {
  return LOAD_SURFACE_FILES.has(file);
}

/** 该文件是否只是文档/计划探针（其引用不计业务消费）。 */
export function isDocsFile(file) {
  return typeof file === 'string' && file.startsWith('docs/');
}

/** 该文件的引用是否算「业务消费」：既非装载面、也非 docs 探针。 */
export function countsAsBusiness(file) {
  return !isLoadSurfaceFile(file) && !isDocsFile(file);
}

/* 宿主对象「真挂载」的识别式（v3.463.0 修正两处假阳性，实测抓到的现场）：
 *   ① **前置点号**：`report.global.state = 'ready'` 里的 `global` 是**属性名**，不是宿主对象；
 *      原式 `\b(?:window|global|globalThis)\.` 把它当挂载 ⇒ `public-interface.js` 的对外面
 *      多出 `state` / `reason` 两个通用词，再按裸名全仓计数就把 `prod_call_sites` 抬到 **6435**
 *      （真实面只有 `LonShaPublicInterface` 一个）。
 *   ② **比较而非赋值**：`typeof global._ledgerApis === "function"` 里 `global._ledgerApis =`
 *      连着三个等号，原式 `\s*=` 吃掉第一个 `=` 就算命中 ⇒ 读一个口子被记成「挂载它」，
 *      `engine-evidence-center.js` 因此多出 `_ledgerApis` / `_evidenceQueryLedgersOf` / `_qaHelpDeps`。
 *   修法：前置 `(?<![\w$.])` 排除属性位与标识符尾；`=(?![=>])` 排除 `==`/`===` 与 `=>`。
 *   两条都不会漏真挂载：真挂载必然位于语句起点或 `guard &&` 之后，前置不可能是 `.` 或标识符字符。 */
export const HOST_MOUNT_RE = /(?<![\w$.])(?:window|global|globalThis)\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?![=>])/g;
/** 从模块源码里提取它对外挂载的全局名（不含 `__` 内部哨兵）。 */
export function extractModuleGlobals(code) {
  const out = new Set();
  for (const m of code.matchAll(HOST_MOUNT_RE)) {
    const name = m[1];
    if (name.startsWith('__')) continue;          // 内部哨兵 `__LonShaXxxLoaded`，不是对外面
    if (name === 'undefined' || name === 'NaN') continue;
    out.add(name);
  }
  return Array.from(out);
}

/** 模块文件路径 → 可能的绑定字面量（`'./xxx.js'` / `'xxx'` 都算）。 */
export function makeFileRefRegex(modFile) {
  const baseName = modFile.replace(/\.js$/, '');
  return new RegExp(
    `['"\`][./]*${modFile}['"\`]|['"\`][./]*${baseName}['"\`]|_moduleLib\\([^,]+,[\\s]*['"\`]${modFile}['"\`]\\)`,
    'g'
  );
}

/**
 * 从 `optional-engine-registry.js` 的 entries 表解析「模块文件名 → 登记名」映射。
 *
 * 为什么需要这一层（2026-11-12 实勘，L21-O1 的**第三种漏判形态**）：
 *   有一批模块**不挂载任何全局名**（源码里没有 `window.X = ` / `global.X = `，
 *   只有 `module.exports = factory()`）。它们的消费方长这样：
 *     `const Cls = optEngines.VectorSemanticSparseHybridRetrieval
 *                  || (typeof VectorSemanticSparseHybridRetrieval !== 'undefined' ? ... : null);
 *      if (Cls) this.engine.hybridRetrievalOptimizer = new Cls();`
 *   ⇒ 消费标识符**就是注册表 entries 第一列的名字**，不是模块自挂的全局名。
 *   ⇒ 只按「模块自挂全局名」找消费，永远找不到这类接线 ⇒ 被判 load_surface_only。
 *
 * ★ 与「装载登记算不算消费」的区别（这条界线必须守住）：
 *   · 注册表里 `['Xxx', 'xxx.js']` 这**一行本身不算消费**（仍由 LOAD_SURFACE_FILES 扣除）；
 *   · 但它提供了「这个模块的对外标识符叫 Xxx」这一事实，可以拿去**别的文件**里找消费。
 *   ⇒ 本函数只产出名字映射，不产出消费计数。
 *
 * @param {string} registryCode 注册表源码（已 stripComments）
 * @returns {Map<string,string>} 模块文件名 → 登记名
 */
export function parseRegistryAliases(registryCode) {
  const map = new Map();
  for (const m of registryCode.matchAll(/\[\s*['"]([A-Za-z_$][A-Za-z0-9_$]*)['"]\s*,\s*['"]([A-Za-z0-9_.\-]+\.js)['"]\s*\]/g)) {
    map.set(m[2], m[1]);
  }
  return map;
}

/**
 * 统计「某个模块被某个文件消费了几处」。
 * @param {string} code     消费方文件源码（已 stripComments）
 * @param {string} modFile  被消费的模块文件名
 * @param {string[]} globals 该模块挂载的全局名
 * @returns {{count:number, kinds:string[]}}
 */
export function countConsumptionIn(code, modFile, globals) {
  const kinds = [];
  let count = 0;

  const fMatches = code.match(makeFileRefRegex(modFile));
  if (fMatches) {
    count += fMatches.length;
    kinds.push('file_binding');
  }

  for (const g of globals) {
    const esc = g.replace(/\$/g, '\\$');
    const gCount = (code.match(new RegExp(`\\b${esc}\\b`, 'g')) || []).length;
    const sCount = (code.match(new RegExp(`['"\`]${esc}['"\`]`, 'g')) || []).length;
    const hit = Math.max(gCount, sCount);   // G3 去重：同一行只算一次
    if (hit > 0) {
      count += hit;
      kinds.push(sCount > gCount ? 'string_global' : 'exclusive_global');
    }
  }

  return { count, kinds };
}