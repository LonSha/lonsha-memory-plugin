// L22-O4 替代证据链判据门
// 背景：扫描器 tests/audit/scan_evidence_binding.mjs 一直在盘上且 rc=0，但没有任何测试钉住它
//   （reader 只有 CHANGELOG/TODO/audit_scan_probe_matrix.tsv）。本档把「它会红」也钉住。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log("✓ " + n); } else { fail++; console.log("✗ " + n); } };

// 1. 门禁真跑绿
const r = spawnSync('node', ['tests/audit/scan_evidence_binding.mjs'], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
ok("证据面契约门禁 rc=0", r.status === 0);
ok("门禁输出含「通过」", ((r.stdout || '') + (r.stderr || '')).includes("通过"));

// 2. 九账登记表真的在源码里
const wb = fs.readFileSync(path.join(ROOT, 'evidence-workbench.js'), 'utf8');
ok("evidence-workbench.js 有 LEDGERS 登记表", wb.includes('LEDGERS'));
const apiGlobals = [...wb.matchAll(/apiGlobal:\s*'([^']+)'/g)].map((m) => m[1]);
ok("LEDGERS 登记了 9 项 apiGlobal", apiGlobals.length === 9);

// 3. 负控制：每个 apiGlobal 必须真的有模块挂到全局上。
//    修前我写成「manifest.extra_js 里包含该全局名」——错了：extra_js 装的是文件名，
//    全局是在模块 IIFE 里用 (function(root){ root.X = ... })(window||globalThis) 挂上去的。
function walkJs(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (['node_modules', '.git', 'docs', 'tests'].includes(e.name)) continue;
        const f = path.join(dir, e.name);
        if (e.isDirectory()) walkJs(f, out);
        else if (/\.(js|mjs)$/.test(e.name)) out.push(f);
    }
    return out;
}
const sources = walkJs(ROOT).map((f) => fs.readFileSync(f, 'utf8'));
const mountOk = (name) => sources.some((src) => src.includes(name + ' =') || src.includes(name + '='));
const unmounted = apiGlobals.filter((name) => !mountOk(name));
ok("负控制：每个 apiGlobal 都真的有模块挂载", unmounted.length === 0);
if (unmounted.length) console.log("  未挂载: " + unmounted.join(", "));

// 4. 宿主取库口（替代证据链的落点）
ok("宿主有 _ledgerApis 取库口", fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8').includes('_ledgerApis'));

console.log(pass + " 通过, " + fail + " 失败");
process.exit(fail > 0 ? 1 : 0);