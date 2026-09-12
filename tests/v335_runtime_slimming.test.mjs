// v3.35 架构减负与数据一致性保护测试 (Slimming & Safe Indexing)
import fs from 'node:fs';
const mftSrc = fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');
const idxSrc = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const suiSrc = fs.readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n); } };

// ===== 1. 版本一致性 =====
const mft = JSON.parse(mftSrc);
assert('manifest 版本为 3.35.0', mft.version === '3.35.0');
assert('index.js 版本为 3.35.0', idxSrc.includes("const VERSION = '3.35.0';"));

// ===== 2. 运行时瘦身：extra_js 幽灵依赖清洗 =====
const requiredExtra = [
    'settings-ui.js',
    'modules_combined.js',
    'graph_algorithms.js',
    'memory-supersede.js'
];
assert('extra_js 包含全部必需核心文件', requiredExtra.every(f => mft.extra_js.includes(f)));
assert('extra_js 剔除了全部 12 个零引用幽灵模块', mft.extra_js.length === 4);

const removedPhantoms = [
    'worker-manager.js', 'virtual-renderer.js', 'wasm-bridge.js', 'storage.js',
    'gpu-renderer.js', 'realtime-sync.js', 'cloud-sync.js', 'gnn-recommender.js',
    'llm-entity-extractor.js', 'smart-summary-anomaly.js', 'production-hardening.js',
    'auto-tuning.js'
];
assert('幽灵模块均已不在 extra_js 加载队列中', removedPhantoms.every(f => !mft.extra_js.includes(f)));

// ===== 3. BM25 索引保护与联动 =====
assert('删除 summary 时联动 rebuild BM25', suiSrc.includes('eng.bm25.rebuild(eng.summary.getActiveSummaries().map'));
assert('删除 vector 时绝无篡改 BM25 语料', !suiSrc.includes('eng.bm25.rebuild(eng.vector.vectors.map'));

console.log(`
[runtime-slimming] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
