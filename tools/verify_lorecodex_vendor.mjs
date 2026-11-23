#!/usr/bin/env node
/** tools/verify_lorecodex_vendor.mjs
 * Guard for ui/vendor/lorecodex/** (MIT upstream: lena13144/lorecodex).
 * Rule: the copy is read-only. Bytes must match md5 in UPSTREAM.json.
 * Local edits are allowed only if registered in UPSTREAM.json forks[].
 * exit 0 ok / 1 drift / 2 structural failure
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const md5 = (b) => createHash('md5').update(b).digest('hex');

function walk(dir, base, out) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out.push(path.relative(base, p).split(path.sep).join("/"));
  }
  return out;
}

export function verifyVendor(root = ROOT) {
  const vendor = path.join(root, 'ui', 'vendor', 'lorecodex');
  const led = path.join(vendor, 'UPSTREAM.json');
  if (!existsSync(led)) return { ok: false, structural: true, problems: ['missing UPSTREAM.json'] };
  let meta;
  try { meta = JSON.parse(readFileSync(led, 'utf8')); } catch (e) { return { ok: false, structural: true, problems: ['bad UPSTREAM.json: ' + e.message] }; }
  const files = meta.files || {}; const forks = meta.forks || {};
  const disk = walk(vendor, vendor, []).filter((f) => f !== 'UPSTREAM.json');
  if (!disk.length) return { ok: false, structural: true, problems: ['vendor dir empty'] };
  const problems = [];
  for (const rel of Object.keys(files)) {
    const p = path.join(vendor, rel);
    if (!existsSync(p)) { problems.push('missing: ' + rel); continue; }
    const fk = forks[rel] || forks[rel + ".fork"];
    const expect = fk ? fk.md5 : files[rel].md5;
    const got = md5(readFileSync(p));
    if (got !== expect) problems.push('drift: ' + rel + ' (' + expect.slice(0, 8) + ' vs ' + got.slice(0, 8) + ')');
  }
  for (const rel of disk) {
    const known = (rel in files) || (rel in forks) || ((rel + ".fork") in forks);
    if (!known) problems.push('unregistered: ' + rel);
  }
  return { ok: problems.length === 0, structural: false, problems, checked: Object.keys(files).length, forks: Object.keys(forks && {}) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const r = verifyVendor();
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else if (r.ok) console.log('[lorecodex-vendor] ok: ' + r.checked + ' files match');
  else console.log('[lorecodex-vendor] drift:' + String.fromCharCode(10) + '  - ' + r.problems.join(String.fromCharCode(10) + '  - '));
  process.exit(r.structural ? 2 : (r.ok ? 0 : 1));
}
