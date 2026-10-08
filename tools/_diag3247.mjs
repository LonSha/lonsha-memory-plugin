#!/usr/bin/env node
/* v3.296.0 诊断：v3247 B1 台账 ↔ 磁盘 双向差集（复用该档同款判据，只打印，不改）。 */
import fs from 'node:fs';
import path from 'node:path';
const ROOT = '/home/user/lonsha-memory-plugin';
const TESTS = path.join(ROOT, 'tests');
const src = fs.readFileSync(path.join(TESTS, 'v3247_break_kit_consolidation.test.mjs'), 'utf8');
const KIT_IMPORT_RE = /from\s+'\.\/_break_kit\.mjs'/;
const m = src.match(/const REGISTRY = \[([\s\S]*?)\n\];/);
if (!m) { console.error('REGISTRY 未找到'); process.exit(2); }
const REGISTRY = [...m[1].matchAll(/'([^']+\.test\.mjs)'/g)].map((x) => x[1]).sort();
const disk = fs.readdirSync(TESTS).filter((f) => f.endsWith('.test.mjs'))
    .filter((f) => KIT_IMPORT_RE.test(fs.readFileSync(path.join(TESTS, f), 'utf8'))).sort();
console.log('磁盘接收方 ' + disk.length + ' / 台账 ' + REGISTRY.length);
console.log('磁盘有台账无（未登记）: ' + JSON.stringify(disk.filter((f) => !REGISTRY.includes(f))));
console.log('台账有磁盘无（掉队）  : ' + JSON.stringify(REGISTRY.filter((f) => !disk.includes(f))));
