// tools/bench-recall-v24.mjs — R24-O2 实测脚本（可复跑）
// 用法：node tools/bench-recall-v24.mjs [1k,1w,10w]
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const R = require(join(ROOT, 'recall-inverted-index.js'));

const query = '\u627f\u8bfa t77';

function fmt(n) { return n === null || n === undefined ? "-" : String(n); }

function main() {
    const sizes = [1000, 10000, 100000];
    const bench = R.benchRecall({ sizes, reps: 15, query });
    console.log("size	buildMs	indexP50	indexP95	linearP50	linearP95	scanned	parity");
    bench.rows.forEach((r) => {
        console.log([r.size, r.buildMs, r.indexP50, r.indexP95, fmt(r.linearP50), fmt(r.linearP95), r.scannedByIndex, r.parity].join("	"));
    });
    // 10w 档线性对照（单次，单独跑，不然总时长太长）
    const big = R.makeDocs(100000, 20261118);
    const idx = R.buildIndex(big);
    const t0 = Date.now();
    const lin = R.linearQuery(big, query);
    const linMs = Date.now() - t0;
    const t1 = Date.now();
    const ix = R.query(idx, big, query);
    const ixMs = Date.now() - t1;
    const parity = JSON.stringify(lin.results.map((x) => x.id)) === JSON.stringify(ix.results.map((x) => x.id));
    console.log(`10w 线性对照：linear=${linMs}ms index=${ixMs}ms scanned=${lin.scanned}->${ix.scanned} parity=${parity}`);
}

main();
