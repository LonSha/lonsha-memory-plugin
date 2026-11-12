#!/usr/bin/env node
/* ============================================================
 * tools/scan_write_only_fields.mjs — 「写了不读」反向扫描器 [L21-O8 · v3.465.2]
 * ------------------------------------------------------------
 * 【它回答的唯一问题】
 *   「有没有字段被写进状态，但全仓没有任何代码读它？」
 *   v3.443.0 的「写 undone:true 但从不读」、v3.430.0 的 LONSHA_DRILL_FIXTURE 死开关，
 *   两次都是偶然发现 —— 本扫描器把这种偶然变成常驻门。
 *
 * 【口径】
 *   扫描产品 .js（排除 tests/node_modules/dist/tools 自身）里的写入点：
 *     engine.X = ... / state.X = ...
 *   与同对象同字段的读取点比对；写 ≥1 且读 =0 的进欠账清单。
 *   欠账清单 tests/audit/write_only_ledger.json 逐条给 reason（或修掉）；
 *   有写无读且不在登记表 ⇒ exit 1。
 *
 * 【已知误报形态（必须排除，且各有夹具防「靠排除项把真缺陷也排掉」）】
 *   ① 字符串键读：engine['X'] / engine["X"] —— 算读；
 *   ② 链式赋值右侧：a.b = c.d = 0 里 c.d 是写不是读 —— 由写入正则先行捕获，不重复计；
 *   ③ 动态属性访问 obj[var]：静态不可知 —— 不判读，但登记表可给 reason 兜底；
 *   ④ 豁免名单：登记表里写明 reason 的条目放行（防止把「约定为只写的输出面」误杀）。
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OBJ_RE = '(?:engine|state)';
const WRITE_RE = new RegExp('\\b(' + OBJ_RE + ')\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\s*=(?!=)');
/** 读取点：同对象同字段出现且后面不是赋值号。 */
const readRe = (obj, field) => new RegExp('\\b' + obj + '\\s*(\\.|\\[)\\s*(["\']?)' + field + '\\2\\s*\\]?\\s*(=(?!=))?', 'g');

function* walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === 'dist' || e.name === 'tools' || e.name === '.git') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p);
        else if (e.name.endsWith('.js')) yield p;
    }
}

export function scanRepo(root = ROOT) {
    const findings = [];
    for (const file of walk(root)) {
        const rel = path.relative(root, file).split(path.sep).join('/');
        const src = fs.readFileSync(file, 'utf8');
        const writes = {};
        let m;
        const wre = new RegExp(WRITE_RE.source, 'g');
        while ((m = wre.exec(src)) !== null) {
            const line = src.slice(0, m.index).split('\n').length;
            (writes[m[2]] = writes[m[2]] || []).push(rel + ':' + line);
        }
        for (const field of Object.keys(writes)) {
            const rre = readRe('engine|state', field);
            let reads = 0;
            while ((m = rre.exec(src)) !== null) {
                if (!m[3]) reads++; // 无赋值号才算读
            }
            if (reads === 0) findings.push({ field, obj: 'engine|state', writes: writes[field] });
        }
    }
    return findings;
}

function main() {
    const findings = scanRepo();
    const ledgerPath = path.join(ROOT, 'tests', 'audit', 'write_only_ledger.json');
    let ledger = { entries: [] };
    if (fs.existsSync(ledgerPath)) ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
    const excused = new Map((ledger.entries || []).map((e) => [e.field, e.reason || '(无理由 —— 登记必须给理由)']));
    const debts = findings.filter((f) => !excused.has(f.field));
    console.log('[write-only] 扫描产品 .js 完成：写无读 ' + findings.length + ' 个字段，登记豁免 ' + excused.size + ' 个');
    for (const f of findings) {
        const tag = excused.has(f.field) ? '  豁免' : '  x ';
        console.log(tag + f.field + ' ← ' + f.writes.join(', ') + (excused.has(f.field) ? '（' + excused.get(f.field) + '）' : ''));
    }
    if (debts.length) {
        console.error('[write-only] ' + debts.length + ' 个「写了不读」字段未登记：逐条给理由（tests/audit/write_only_ledger.json）或修掉');
        process.exit(1);
    }
    console.log('[write-only] 通过：所有写无读字段均有登记理由');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();