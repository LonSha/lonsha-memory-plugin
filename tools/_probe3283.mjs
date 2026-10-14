// 临时探针:复用 v3283 的枚举器,打印全部「同名跨文件常量表」对,供台账补登取证。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../tests/_audit_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = fs.readFileSync(path.join(ROOT, 'tests/v3283_o7_const_table_copy_ledger.test.mjs'), 'utf8');
const A = T.indexOf('const norm = (s) =>');
const B = T.indexOf('const readAll = () =>');
if (A < 0 || B < 0) { console.error('slice fail', A, B); process.exit(1); }
const src = T.slice(A, B);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
const MIN_BODY = 40;
const factory = new Function('stripComments', 'md5', 'MIN_BODY',
    src + '\n return { constTablesOf };');
const { constTablesOf } = factory(stripComments, md5, MIN_BODY);

const FILES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js') && !f.endsWith('.bak')).sort();
const per = new Map();
let tabs = 0;
for (const f of FILES) {
    for (const t of constTablesOf(fs.readFileSync(path.join(ROOT, f), 'utf8'))) {
        tabs++;
        if (!per.has(t.name)) per.set(t.name, new Map());
        const byBody = per.get(t.name);
        if (!byBody.has(t.body)) byBody.set(t.body, { files: new Set(), decls: new Set() });
        byBody.get(t.body).files.add(f);
        byBody.get(t.body).decls.add(t.decl);
    }
}
const pairs = [];
for (const [nm, byBody] of per) {
    for (const [body, rec] of byBody) {
        if (rec.files.size < 2) continue;
        pairs.push([nm, [...rec.files].sort(), body.length, md5(body), [...rec.decls].sort().join('|')]);
    }
}
console.log('files', FILES.length, 'tabs', tabs, 'pairs', pairs.length);
for (const p of pairs) console.log(JSON.stringify(p));