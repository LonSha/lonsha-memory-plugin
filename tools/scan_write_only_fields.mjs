#!/usr/bin/env node
/* ============================================================
 * tools/scan_write_only_fields.mjs — 「写了不读」反向扫描器
 *   [L21-O8 · v3.465.2 首版] [L23-O6 · v3.474.0 键级化 + 自证]
 * ------------------------------------------------------------
 * 【它回答的唯一问题】
 *   「有没有字段被写进状态，但全仓没有任何代码读它？」
 *   v3.443.0 的「写 undone:true 但从不读」、v3.430.0 的 LONSHA_DRILL_FIXTURE 死开关，
 *   两次都是偶然发现 —— 本扫描器把这种偶然变成常驻门。
 *
 * 【口径（L23-O6 起是「键级」，不是「文件级」）】
 *   写入点：`engine.X = ` / `state.X = `（字符串键 `state['X'] = ` 亦算）。
 *   读取点：**全仓**任一文件的 `engine.X` / `state.X` / `state['X']`（后面不跟赋值号）、
 *           以及解构读 `const { X } = state` / `const { a: X } = engine`（取属性侧名字）。
 *   ⇒ 一个字段在 A 文件写、在 B 文件读，**算读过**。
 *      旧口径只在同文件内比对读取点，会把「跨文件读」误判成死写 —— 那是扫描器的盲区，
 *      不是产品缺陷；盲区留在盘上，人就会用「登记理由」把它盖住（豁免变垃圾桶）。
 *
 * 【自证（空清单必须有分母）】
 *   每次运行先打印「扫描面自证」：文件数 / 字节数 / 写入点 / 字段数 / 读取点 / 跨文件读。
 *   分母任一为 0（没扫到文件、没扫到写入点）⇒ **exit 2 fail-closed**，
 *   而不是「0 个问题 ⇒ 通过」。没有分母的「没问题」不是结论。
 *
 * 【已知误报形态（必须排除，且各有夹具防「靠排除项把真缺陷也排掉」）】
 *   ① 字符串键读：engine['X'] / engine["X"] —— 算读；
 *   ② 链式赋值右侧：a.b = c.d = 0 里 c.d 是写不是读 —— 由写入正则先行捕获，不重复计；
 *   ③ 复合赋值 `state.X += 1` 真的读了旧值 —— 算读（读改写不是死写）；
 *   ④ 动态属性访问 obj[var]：静态不可知 —— 不判读，由登记表 reason 兜底；
 *   ⑤ 豁免名单：登记表里写明 reason 的条目放行（防止把「约定为只写的输出面」误杀），
 *      但**已修掉的字段不许留在登记表**（豁免也双向，判据 v21_o8 C1 单向盯、本刀判据 B3 双向盯）。
 *
 * 【边界（如实写明，不假装是全域扫描）】
 *   对象前缀只有 `engine.` / `state.`，不动 `this.` / 任意局部对象；
 *   静态正则不认运行时拼出来的键名（`state[prefix + 'X']`）。
 *   所以本扫描器的结论是「在这两个前缀下没有写了不读的字段」，不是「全仓没有死写」。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OBJ_RE = '(?:engine|state)';
const WRITE_RE = new RegExp('\\b(' + OBJ_RE + ')\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=(?!=)');
/** 读取点：同对象同字段出现且后面不是赋值号（字符串键亦算）。 */
const READ_RE = new RegExp('\\b' + OBJ_RE + '\\s*(?:\\.\\s*([A-Za-z_$][\\w$]*)|\\[\\s*[\'"]([A-Za-z_$][\\w$]*)[\'"]\\s*\\])\\s*(=(?!=))?', 'g');
/** 解构读：`const { a, b: c } = state`（属性侧名字是 a 与 b）。 */
const DESTRUCT_RE = new RegExp('\\{([^{}]*)\\}\\s*=\\s*' + OBJ_RE + '\\b', 'g');
const NAME_RE = /[A-Za-z_$][\w$]*/;

function* walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'tools' || e.name === '.git') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p);
        else if (e.name.endsWith('.js')) yield p;
    }
}

/**
 * 扫描 + 自证读数。
 * @returns {{findings: Array<{field: string, obj: string, writes: string[]}>, scope: object}}
 */
export function scanRepoSelfProof(root = ROOT) {
    const writes = new Map();       // field -> ['rel:line', ...]
    const reads = new Map();        // field -> Set(rel)
    let filesScanned = 0;
    let bytesScanned = 0;
    let writeSites = 0;
    let readSites = 0;

    for (const file of walk(root)) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        const src = fs.readFileSync(file, 'utf8');
        filesScanned += 1;
        bytesScanned += Buffer.byteLength(src);
        let m;
        const wre = new RegExp(WRITE_RE.source, 'g');
        while ((m = wre.exec(src)) !== null) {
            writeSites += 1;
            const line = src.slice(0, m.index).split('\n').length;
            if (!writes.has(m[2])) writes.set(m[2], []);
            writes.get(m[2]).push(rel + ':' + line);
        }
        const rre = new RegExp(READ_RE.source, 'g');
        while ((m = rre.exec(src)) !== null) {
            if (m[3]) continue;              // 后面紧跟赋值号 ⇒ 是写，不是读
            const f = m[1] || m[2];
            readSites += 1;
            if (!reads.has(f)) reads.set(f, new Set());
            reads.get(f).add(rel);
        }
        const dre = new RegExp(DESTRUCT_RE.source, 'g');
        while ((m = dre.exec(src)) !== null) {
            for (const part of m[1].split(',')) {
                const p = part.trim();
                if (!p) continue;
                /* `{a: b}` 的读是属性名 a；`{a = 1}` / `{...a}` 取标识符 a */
                const left = p.includes(':') ? p.split(':')[0] : p.split('=')[0];
                const nm = (left.match(NAME_RE) || [])[0];
                if (!nm) continue;
                readSites += 1;
                if (!reads.has(nm)) reads.set(nm, new Set());
                reads.get(nm).add(rel);
            }
        }
    }

    const findings = [];
    let crossFileReads = 0;
    let sameFileReads = 0;
    for (const [field, sites] of writes) {
        const where = reads.get(field);
        if (!where || where.size === 0) { findings.push({ field, obj: 'engine|state', writes: sites }); continue; }
        const writeFiles = new Set(sites.map((s) => s.slice(0, s.lastIndexOf(':'))));
        if ([...where].some((f) => !writeFiles.has(f))) crossFileReads += 1;
        else sameFileReads += 1;
    }
    findings.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));

    const proven = filesScanned > 0 && writeSites > 0 && writes.size > 0;
    const scope = {
        filesScanned,
        bytesScanned,
        writeSites,
        distinctFields: writes.size,
        readSites,
        fieldsWithRead: reads.size,
        crossFileReads,
        sameFileReads,
        writeOnlyFields: findings.length,
        proven,
        why: filesScanned === 0 ? '扫到 0 个文件'
            : writeSites === 0 ? '扫到 0 个写入点'
                : writes.size === 0 ? '写入点里没有字段名' : '',
    };
    return { findings, scope };
}

/** 兼容旧调用方：只要清单。 */
export function scanRepo(root = ROOT) {
    return scanRepoSelfProof(root).findings;
}

function main() {
    const { findings, scope } = scanRepoSelfProof();
    const ledgerPath = path.join(ROOT, 'tests', 'audit', 'write_only_ledger.json');
    let ledger = { entries: [] };
    if (fs.existsSync(ledgerPath)) ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const excused = new Map((ledger.entries || []).map((e) => [e.field, e.reason || '(无理由 —— 登记必须给理由)']));
    const debts = findings.filter((f) => !excused.has(f.field));

    console.log('[write-only] 扫描面自证：文件 ' + scope.filesScanned + ' 个 / ' + scope.bytesScanned + ' 字节'
        + ' · 写入点 ' + scope.writeSites + ' · 字段 ' + scope.distinctFields
        + ' · 读取点 ' + scope.readSites + '（其中跨文件读 ' + scope.crossFileReads + ' 个字段，同文件读 ' + scope.sameFileReads + ' 个）');
    console.log('[write-only] 写无读 ' + findings.length + ' 个字段，登记豁免 ' + excused.size + ' 个');
    for (const f of findings) {
        const tag = excused.has(f.field) ? '  豁免' : '  x ';
        console.log(tag + f.field + ' ← ' + f.writes.join(', ') + (excused.has(f.field) ? '（' + excused.get(f.field) + '）' : ''));
    }
    if (!scope.proven) {
        console.error('[write-only] 扫描面为空（' + scope.why + '）—— 「0 个问题」在没有分母时不是结论，按 fail-closed 退出');
        process.exit(2);
    }
    if (debts.length) {
        console.error('[write-only] ' + debts.length + ' 个「写了不读」字段未登记：逐条给理由（tests/audit/write_only_ledger.json）或修掉');
        process.exit(1);
    }
    console.log('[write-only] 通过：所有写无读字段均有登记理由');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
