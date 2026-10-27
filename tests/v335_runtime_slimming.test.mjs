// v3.35 架构减负与数据一致性保护测试 (Slimming & Safe Indexing)
import fs from 'node:fs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}
const mftSrc = fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');
const idxSrc = __hostSurface();
const suiSrc = fs.readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n); } };

// ===== 1. 版本一致性 =====
const mft = JSON.parse(mftSrc);
assert('manifest 版本有效 (>= 3.35.0)', /^3\.(3[5-9]|[4-9]\d+|[1-9]\d{2,})\./.test(mft.version));
assert('index.js 版本有效 (>= 3.35.0)', /const VERSION = '3\.(3[5-9]|[4-9]\d+|[1-9]\d{2,})\./.test(idxSrc));

// ===== 2. 运行时瘦身：extra_js 幽灵依赖清洗 =====
const requiredExtra = [
    'settings-ui.js',
    'modules_combined.js',
    'graph_algorithms.js',
    'memory-supersede.js'
];
assert('extra_js 包含全部必需核心文件', requiredExtra.every(f => mft.extra_js.includes(f)));
// [v3.94] 修正过时断言：原 `extra_js.length === 4` 是 v3.35 剔除幽灵后的脆弱数量锁，
//         后续合法新增核心模块（cse-engine/narrative-pulse/v3.96 四模块）会误破。
//         语义应为「无幽灵残留」——由下方 removedPhantoms 断言精确保证，此处不锁死数量。

const removedPhantoms = [
    'worker-manager.js', 'virtual-renderer.js', 'wasm-bridge.js', 'storage.js',
    'gpu-renderer.js', 'realtime-sync.js', 'cloud-sync.js', 'gnn-recommender.js',
    'llm-entity-extractor.js', 'smart-summary-anomaly.js', 'production-hardening.js',
    'auto-tuning.js'
];
assert('幽灵模块均已不在 extra_js 加载队列中', removedPhantoms.every(f => !mft.extra_js.includes(f)));
// [v3.116] 死代码物理清除：v3.35 只是把这些模块移出加载队列，源文件仍留在仓库
//          （约 5.9k 行从未被 require/import 的孤立代码）。v3.116 将其全部删除，
//          断言随之升级为「文件已不存在」，杜绝任何形式的复活。
assert('幽灵模块源文件已全部物理删除', removedPhantoms.every(f => !fs.existsSync(new URL('../' + f, import.meta.url))));

// ===== 3. BM25 索引保护与联动 =====
assert('删除 summary 时联动 rebuild BM25', suiSrc.includes('eng.bm25.rebuild(eng.summary.getActiveSummaries().map'));
assert('删除 vector 时绝无篡改 BM25 语料', !suiSrc.includes('eng.bm25.rebuild(eng.vector.vectors.map'));

// ===== 4. 健壮性增强：getCurrentChatId 兜底与 rollbackFloor BM25 守卫 =====
assert('getCurrentChatId 支持 chatMetadata.file_name 兜底', idxSrc.includes('c?.chatId || c?.chatMetadata?.file_name || null'));
assert('rollbackFloor BM25 重建拥有独立 try-catch', idxSrc.includes("this.bm25.rebuild"));
assert('rollbackFloor 手机记忆联动标签纠正', idxSrc.includes("errLog(e, 'rollbackFloor.手机记忆联动');"));

console.log(`
[runtime-slimming] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
