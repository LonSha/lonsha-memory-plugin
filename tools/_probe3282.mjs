// 临时探针:复用 v3282 的枚举器,打印全部别名簇(含 len / md5),供台账补登取证。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../tests/_audit_lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const T = fs.readFileSync(path.join(ROOT, 'tests/v3282_o7_alias_copy_ledger.test.mjs'), 'utf8');
const A = T.indexOf('const norm = (s) =>');
const B = T.indexOf('/** 把簇压成可比对的键');
if (A < 0 || B < 0) { console.error('slice fail', A, B); process.exit(1); }
const src = T.slice(A, B);
const md5 = (s) => crypto.createHash('md5').update(s).digest('hex').slice(0, 8);
const MIN_BODY = 30, MIN_TAB = 20;
const factory = new Function('stripComments', 'md5', 'MIN_BODY', 'MIN_TAB',
    src + '\n return { itemsOf, buildAliasClusters };');
const { itemsOf, buildAliasClusters } = factory(stripComments, md5, MIN_BODY, MIN_TAB);

const FILES = fs.readdirSync(ROOT).filter((f) => f.endsWith('.js') && !f.endsWith('.bak')).sort();
const map = {};
for (const f of FILES) map[f] = fs.readFileSync(path.join(ROOT, f), 'utf8');
let items = 0;
for (const f of FILES) items += itemsOf(map[f]).length;
const clusters = buildAliasClusters(map);
console.log('files', FILES.length, 'items', items, 'clusters', clusters.length);
for (const r of clusters) {
    console.log([r[0], r[1].join('/'), '[' + r[2].join(',') + ']', r[3], r[4]].join(' | '));
}