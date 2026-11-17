/**
 * _root_js_inventory.mjs — 「根目录 .js 归属」的唯一真源
 * ============================================================
 * 【为何单列成模块】根目录 .js 的归属不变式被至少四处判据同时守着：
 *   tests/v3116_dead_code（【3】无孤儿 / 【4】文件数恒等式）、tests/v3194（根 .js 数 = 入口 + extra_js）、
 *   tests/v3205（读数自洽）、tests/audit/dead_code_budget（活跃代码总量与声明面）。
 *   修前每处各写一遍 readdirSync + manifest 读法 + 「被引用」正则 —— 这就是本仓
 *   明令禁止的「同一事实两处实现」：第三态（登记归档）一落地，四处全红，改一处漏三处。
 *
 * 【三态不变式（本模块就是它）】根目录每个 .js 必须恰好属于下面一类：
 *   ① entry     入口（manifest.js，本仓恒为 index.js）
 *   ② declared  manifest.extra_js 声明的装载模块
 *   ③ archived  登记归档：被判定「该退场」→ 从 extra_js 摘掉、文件留盘、理由与替代方留账
 *   剩下的一律进 unexplained（真孤儿），两条方向的分母都在这里出：
 *   declaredOnDisk / archivedOnDisk / unexplained / missing（声明了却不在盘上）。
 *
 * 【归档登记为何是两本表】两本是不同期间、不同判据的登记，各自有真源地位，
 *   本模块只读、只取 archived 面，不合并出第三账：
 *   · tests/audit/module_disposition_ledger.json —— L23-O2：11 个 load_surface_only 定性为
 *     superseded_by_active_duplicate 后归档（守门：scan_module_disposition / l23_o2）；
 *   · tests/audit/l21_o1_triage.json 的 verdicts.archived.modules —— L23-O3：把 L21-O1 判定的
 *     declared_dormant 升级为归档（守门：l23_o3 / v21_o1）。
 *   两本都读空 ⇒ 抛错（fail-closed），不许把「读不到登记」当成「没有归档」。
 *
 * 【不做什么】不改文件、不写账、不判对错：本模块只出读数，判据留给各自的测试。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const REGISTRY_DISPOSITION = 'tests/audit/module_disposition_ledger.json';
export const REGISTRY_TRIAGE = 'tests/audit/l21_o1_triage.json';

/** 默认根 = tests/audit/../..（即仓根）。判据侧可从任意镜像树传入 root。 */
export function defaultRoot() {
    /* [v3.474.0] HERE 是 tests/（本文件在 tests/ 下，不在 tests/audit/ 下）——上一版按 tests/audit/../..
     *   推成仓根的**上一级**，实测落到 /home/user ⇒ 默认根读不到 manifest.json（fail-closed 抛错）。
     *   只认 HERE/.. 这一级：改层级会静默指向错的树，所以这里写死一级并加断言。 */
    return path.resolve(HERE, '..');
}

function readJson(root, rel) {
    const p = path.join(root, rel);
    try {
        return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
        throw new Error('登记表读不到/坏掉（fail-closed，不当成「没有归档」用）: ' + rel + ' → ' + e.message);
    }
}

/**
 * 归档登记并集：两本表各自的 archived 面。
 * @returns {{fromDisposition:string[], fromTriage:string[], all:Set<string>}}
 */
export function archivedModuleFiles(root = defaultRoot()) {
    const dis = readJson(root, REGISTRY_DISPOSITION);
    const tri = readJson(root, REGISTRY_TRIAGE);
    const fromDisposition = Object.entries(dis.entries || {})
        .filter(([, v]) => v && v.disposition === 'archived')
        .map(([k]) => k);
    const fromTriage = Object.entries(
        (tri.verdicts && tri.verdicts.archived && tri.verdicts.archived.modules) || {},
    )
        .filter(([, v]) => v && v.verdict === 'archived')
        .map(([k]) => k);
    if (fromDisposition.length === 0) {
        throw new Error('归档登记面读空: ' + REGISTRY_DISPOSITION + '.entries[*].disposition 没有任何 archived');
    }
    if (fromTriage.length === 0) {
        throw new Error('归档登记面读空: ' + REGISTRY_TRIAGE + '.verdicts.archived.modules 是空的');
    }
    return { fromDisposition, fromTriage, all: new Set([...fromDisposition, ...fromTriage]) };
}

/**
 * 根目录 .js 归属读数（唯一真源）。
 * @returns {{root:string, entry:string[], declared:string[], declaredSet:Set<string>,
 *   onDisk:string[], declaredOnDisk:string[], archivedOnDisk:string[],
 *   unexplained:string[], missing:string[], archivedSet:Set<string>}}
 */
export function rootJsInventory(root = defaultRoot()) {
    const mf = readJson(root, 'manifest.json');
    const entry = typeof mf.js === 'string' ? [mf.js] : (Array.isArray(mf.js) ? mf.js.slice() : []);
    if (entry.length === 0) throw new Error('manifest.js 读空 —— 入口面不可用，归属判据无效');
    const declared = [...entry, ...((mf.extra_js || []).slice())];
    const declaredSet = new Set(declared);
    const onDisk = fs.readdirSync(root).filter((f) => f.endsWith('.js')).sort();
    const { all: archivedSet } = archivedModuleFiles(root);
    const declaredOnDisk = onDisk.filter((f) => declaredSet.has(f));
    const archivedOnDisk = onDisk.filter((f) => archivedSet.has(f));
    /* 两类都在盘上的同一文件 = 归档没真撤出装载面（或又把它装回去了）。
     *   这不是「白名单交集」的细节，而是「归档不装载」这条不变式被违反，单列出来。 */
    const both = declaredOnDisk.filter((f) => archivedSet.has(f));
    const unexplained = onDisk.filter((f) => !declaredSet.has(f) && !archivedSet.has(f));
    const missing = declared.filter((f) => !onDisk.includes(f));
    return {
        root, entry, declared, declaredSet,
        onDisk, declaredOnDisk, archivedOnDisk,
        declaredButArchived: both,
        unexplained, missing, archivedSet,
    };
}
