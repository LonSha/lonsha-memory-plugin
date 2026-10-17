// /tmp/derive3420.mjs — 用 v3283 **自身算法**取权威真值（禁另立算法）
// 做法：从 tests/v3283_o7_const_table_copy_ledger.test.mjs 逐字切出
//   ① MIN_* 常量块  ② norm / blockFrom / constTablesOf / judge 函数块
//   ③ judge 内的「枚举整仓 → 聚同名跨文件对」那段逐字代码
// 用 new Function 重放，算出的体长 / md5 即 v3283 自己的读数。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { stripComments } from '/home/user/lonsha-memory-plugin/tests/_audit_lib.mjs';

const ROOT = '/home/user/lonsha-memory-plugin';
const REL = 'tests/v3283_o7_const_table_copy_ledger.test.mjs';
const src = fs.readFileSync(path.join(ROOT, REL), 'utf8');

const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
const cut = (a, b) => {
    const i = src.indexOf(a);
    const j = src.indexOf(b);
    if (i < 0 || j < 0) throw new Error('slice marker 缺失: ' + (i < 0 ? a : b));
    if (j <= i) throw new Error('slice 顺序错: ' + a);
    return src.slice(i, j);
};

const constsBlock = cut('const MIN_BODY = 40;', '/**\n * 登记表');
const funcsBlock = cut('/** 归一化：剥注释', 'const readAll = () => {');
const enumBlock = cut('    const files = Object.keys(srcMap);', '    if (pairs.length < MIN_PAIRS)');

const make = new Function(
    'stripComments', 'md5',
    constsBlock + funcsBlock + `
    return function pairsOf(srcMap) {
        const P = [];
${enumBlock}
        return pairs;
    };
`);

const pairsOf = make(stripComments, md5);

const FILES = fs.readdirSync(ROOT)
    .filter((f) => f.endsWith('.js') && !f.endsWith('.bak'))
    .sort();
const map = {};
for (const f of FILES) map[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');

const pairs = pairsOf(map);
pairs.sort((a, b) => (a[0] === b[0] ? (a[1].join() < b[1].join() ? -1 : 1) : a[0] < b[0] ? -1 : 1));
console.log('=== FILES=' + FILES.length + ' pairs=' + pairs.length + ' (v3283 自身算法读数) ===');
for (const [nm, files, len, h, decl] of pairs) {
    console.log(nm + ' | ' + files.join(',') + ' | len=' + len + ' | md5=' + h + ' | decl=' + decl);
}