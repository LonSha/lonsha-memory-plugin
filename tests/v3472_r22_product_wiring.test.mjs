import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const modules=['memory-capsule.js','future-letter.js','relation-milestone.js','memory-checkup.js','memory-timeline.js','memory-map.js','sleep-consolidation.js','memory-archive-pack.js','multi-char-memory-isolation.js','memory-giant-file-split-plan.js','injection-receipt-facets.js','view-openability.js','evidence-substitute-chain.js','realhost-verdict.js','catalog-registration.js','load-surface-disposition.js','frozen-freshness.js','write-only-scan.js'];
test('L22 all 18 kernels pass two-sided self checks',()=>{for(const f of modules){const r=require(path.join(root,f)).selfCheck();assert.equal(r.ok,true,f+': '+JSON.stringify(r.bad));}});
test('L22 business consumption refreshes in the real generation path',()=>{const src=fs.readFileSync(path.join(root,'index.js'),'utf8');assert.match(src,/r22ProductReadout()/);assert.match(src,/this.r22ProductReadout()/);for(const f of modules){const global=require(path.join(root,f));const meaningful=Object.keys(global).filter(k=>!['FACES','LIMITS','PATHS','PRIVATE_KEYS','MILESTONE_KINDS','DEFAULT_BUDGET','selfCheck'].includes(k));assert.ok(meaningful.length>0,f+' has no business function');}});
test('L22 negative controls distinguish missing from empty or healthy',()=>{assert.equal(require(path.join(root,'memory-capsule.js')).capsuleState(null,1).face,'invalid');assert.equal(require(path.join(root,'future-letter.js')).dueCandidates([],1).face,'none');assert.equal(require(path.join(root,'realhost-verdict.js')).judgeRealhost({available:false,cause:'no-st-endpoint'}).face,'invalid');assert.equal(require(path.join(root,'frozen-freshness.js')).judgeFreshness(null,1).face,'invalid');});
test('L22 manifest loads every new module and consumption ledger marks each active',()=>{const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));const ledger=JSON.parse(fs.readFileSync(path.join(root,'tests/audit/module_consumption_ledger.json'),'utf8'));for(const f of modules){assert.ok(manifest.extra_js.includes(f),f+' missing manifest');assert.equal(ledger.modules[f]?.why,'active',f+' not active');assert.equal(ledger.modules[f]?.load_surface_only,false,f+' load surface only');}});

/* [v3.472.0 · L22 收口补判据] 读数的**事实来源**判据。
 *   要治的形态（修前实测）：十八项都被 r22ProductReadout() 调用了，台账也标 active，
 *   但多项输入来自**全仓零赋值**的占位属性 —— 调用存在、事实来源不存在。
 *   这条判据把「调用存在」升级为「输入有真源」。三条口径必须同时成立：
 *     ① 扫描前**剥掉注释**：this._x 出现在注释里是举例，不是引用；
 *     ② 跨文件：引擎状态可能由 engine-*.js 赋值（如 _lastBudgetStats 的真源在
 *        engine-injection-pipeline.js），只看 index.js 会把真源误判成占位；
 *     ③ 读数体**内部**的赋值算「输出」不算「输入」：this._r22ProductReadout = out
 *        是函数自己的产物，不该被要求外部还有赋值点。
 *   为什么不写成白名单：白名单会随下次新增字段漂移，而漂移的表现恰好是本条要抓的东西。 */
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
test('L22 readout inputs all have a real assignment site', () => {
    const src = stripComments(fs.readFileSync(path.join(root, 'index.js'), 'utf8'));
    const start = src.indexOf('r22ProductReadout() {');
    assert.ok(start > 0, 'r22ProductReadout 必须存在');
    let depth = 0; let i = src.indexOf('{', start); const bodyStart = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    const body = src.slice(bodyStart, i + 1);
    /* 跨文件：本仓所有根目录 .js（extra_js 内核与引擎分部都在这里）。 */
    const others = fs.readdirSync(root).filter(f => f.endsWith('.js') && f !== 'index.js')
        .map(f => stripComments(fs.readFileSync(path.join(root, f), 'utf8'))).join('\n');
    const outside = src.slice(0, start) + src.slice(i + 1) + '\n' + others;
    const fields = new Set();
    const re = /this\.(_[A-Za-z0-9_]+)/g;
    let m;
    while ((m = re.exec(body))) fields.add(m[1]);
    assert.ok(fields.size >= 8, '读数体应引用多个字段，实际 ' + fields.size);
    const orphan = [];
    for (const f of fields) {
        const assignRe = new RegExp('this\\.' + f + '\\s*=(?![=>])');
        if (assignRe.test(body)) continue;      // ③ 输出字段
        if (assignRe.test(outside)) continue;   // ①② 外部真源
        orphan.push(f);
    }
    assert.deepEqual(orphan, [], '这些字段在读数体之外没有任何赋值点（=占位输入）：' + orphan.join(', '));
});

/* 参数形状判据：三个曾经「形状不匹配」的内核，必须按契约传参。
 *   修前实测：injection 传的是阶段名（generation/draft/pending…）而内核只认六个面；
 *   evidence 传的是扁平 {direct,substitute} 而内核只认 {evidences:[{tier}]}；
 *   realhost 的兜底传 {available:false} 而内核按 verdict 分支。
 *   三条都属于「调用存在但永远走不到有效分支」，靠行为测不出来（永远有返回值），
 *   只能在源码契约层锁住。 */
test('L22 three shape-mismatched kernels are called with contract-shaped input', () => {
    const src = fs.readFileSync(path.join(root, 'index.js'), 'utf8');
    const facets = require(path.join(root, 'injection-receipt-facets.js'));
    const chain = require(path.join(root, 'evidence-substitute-chain.js'));
    const rh = require(path.join(root, 'realhost-verdict.js'));
    /* ① 六面：源码里必须逐个出现 PATHS 里的键名，且不得再出现旧的阶段名传参。 */
    for (const p of facets.PATHS) assert.ok(src.includes('out.' + p + ' ='), 'injection 面缺席：' + p);
    assert.ok(!/aggregate\(\{\s*generation:/.test(src), 'injection 不得再传阶段名');
    /* ② 证据链：必须以 evidences 数组传入。 */
    assert.match(src, /buildChain\(\{\s*evidences/, 'evidence 必须传 {evidences:[…]}');
    assert.ok(!/buildChain\(\{\s*direct:/.test(src), 'evidence 不得再传扁平形状');
    /* ③ 真机判定：兜底必须给合法 verdict，否则内核只会回 invalid。 */
    assert.ok(!/judgeRealhost\([^)]*\{available:\s*false/.test(src), 'realhost 不得再传 {available:false}');
    assert.match(src, /verdict:\s*'unavailable'/, 'realhost 缺席必须显式给 verdict');
    /* 内核侧对照：三种错误形状确实走不到有效分支（锁住「为什么必须改」）。 */
    assert.equal(chain.buildChain({ direct: {}, substitute: {} }).face, 'none');
    assert.equal(rh.judgeRealhost({ available: false, cause: 'x' }).face, 'invalid');
    assert.equal(facets.aggregate({ generation: {}, draft: [] }).missing.length, facets.PATHS.length);
});
