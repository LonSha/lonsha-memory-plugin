/* tests/v3471_model_fetch_degrade.test.mjs — 模型列表三级降级判据 [v3.471.0]
 *
 * 【为什么本档存在】
 *   用户报的是一条真实产品缺口：「接 API 那边模型好像没有获取列表，只能手动填」。
 *   勘查结论：UI 侧（🔄 按钮 → engine.llm.fetchModels）**早就接好了**，但 fetchModels
 *   只有一条「浏览器直连 /v1/models」的路。第三方端点不带 CORS 头时 fetch 必被浏览器拦下
 *   （Failed to fetch），于是抓取永远失败 —— 本仓 _ERROR_HINTS 里那条 CORS 条目写的正是
 *   这个形态，可 fetchModels 自己没接住，等于「诊断表知道病因、药方没开」。
 *
 * 【本版修什么】fetchModels 改为三级降级：
 *   ① 酒馆后端代理（同源 /api/backends/chat-completions/status + CSRF，RubyPhone 同款先例）
 *   ② 浏览器直连（原路径，CORS 放行的端点仍走它）
 *   ③ 两级都失败 ⇒ 抛**点名每一级原因**的聚合错误（不静默、不伪造空列表）
 *   且返回 {models, source}：来源随结果交付，UI 只消费读数。
 *
 * 【判据纪律】行为判据用真 socket（本地 http 服务器）跑真实现，不用 mock 替身；
 *   每条行为断言旁边配一条「改坏就会红」的负控制，另含两条真源码破坏（breakSource）
 *   —— 把代理级删掉后必须退化成只剩直连、把聚合报错改成静默空列表后必须被抓出。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const MOD_REL = 'memory-organs.js';
const UI_REL = 'settings-ui.js';
const IDX_REL = 'index.js';

const M = (await import('../memory-organs.js')).default;

/** 起一个本地 http 服务器：handler(req,res) 决定每个路径的响应。 */
function serve(handler) {
    return new Promise((resolve) => {
        const srv = http.createServer(handler);
        srv.listen(0, '127.0.0.1', () => resolve({ srv, base: 'http://127.0.0.1:' + srv.address().port }));
    });
}
const close = (srv) => new Promise((r) => srv.close(r));
/** 装一个最小 window 桩（有 location.origin 才会走代理级）。 */
function withWindow(origin) {
    globalThis.window = { location: { pathname: '/', origin } };
    globalThis.location = globalThis.window.location;
}
function clearWindow() { delete globalThis.window; delete globalThis.location; }
/** OpenAI 形 / models 形 / 数组形三种载荷统一的期望结果。 */
const idsOf = (r) => (Array.isArray(r) ? r : (r && r.models) || []);

/* ══════════ A 面 · 归一化：三种真实载荷形态都要认 ══════════ */

test('v3471 A1. 三种真实载荷形态全部认出（data / models / 裸数组），且排序稳定', () => {
    const llm = new M.LLMCaller({ config: {} });
    assert.deepEqual(llm._normalizeModelsPayload({ data: [{ id: 'b' }, { id: 'a' }] }), ['a', 'b'],
        'OpenAI 形 data[{id}] 必须认');
    assert.deepEqual(llm._normalizeModelsPayload({ models: [{ name: 'y' }, { name: 'x' }] }), ['x', 'y'],
        'Ollama 形 models[{name}] 必须认');
    assert.deepEqual(llm._normalizeModelsPayload(['m2', 'm1']), ['m1', 'm2'],
        '裸字符串数组必须认');
    assert.deepEqual(llm._normalizeModelsPayload({ data: [{ model: 'gpt-x' }] }), ['gpt-x'],
        'data[{model}] 变体必须认');
});

test('v3471 A2. 归一化不伪造：认不出的条目一律丢掉，不补位不猜名', () => {
    const llm = new M.LLMCaller({ config: {} });
    const out = llm._normalizeModelsPayload({ data: [{ id: 'ok' }, {}, null, { foo: 1 }, ''] });
    assert.deepEqual(out, ['ok'], '只有带 id/name/model 的条目能活下来');
    assert.deepEqual(llm._normalizeModelsPayload(null), [], '空载荷必须是空数组，不是抛错');
    assert.deepEqual(llm._normalizeModelsPayload({ unrelated: 1 }), [], '无关字段不许被当成模型名');
});

/* ══════════ B 面 · 直连级（原 v1.4.1 路径，必须原样可用） ══════════ */

test('v3471 B1. 直连级真跑：CORS 放行的端点照旧拿到列表，source=direct', async () => {
    clearWindow();
    const { srv, base } = await serve((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'z' }, { id: 'a' }] }));
    });
    try {
        const llm = new M.LLMCaller({ config: {} });
        const r = await llm.fetchModels(base + '/v1', 'sk-test');
        assert.equal(r.source, 'direct', '无宿主时应走直连并如实报来源');
        assert.deepEqual(r.models, ['a', 'z']);
    } finally { await close(srv); }
});

test('v3471 B2. 端点归一化：/chat/completions 尾巴与 /v1 尾巴都要拼对 /models', async () => {
    const seen = [];
    const { srv, base } = await serve((req, res) => {
        seen.push(req.url);
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'm' }] }));
    });
    try {
        clearWindow();
        const llm = new M.LLMCaller({ config: {} });
        await llm.fetchModels(base + '/v1', 'k');
        await llm.fetchModels(base + '/v1/chat/completions', 'k');
        await llm.fetchModels(base, 'k');
        assert.equal(seen[0], '/v1/models', '/v1 尾巴只能补 /models');
        assert.equal(seen[1], '/v1/models', '/chat/completions 尾巴必须剥掉再拼');
        assert.equal(seen[2], '/v1/models', '裸 base 必须补 /v1/models');
    } finally { await close(srv); }
});

/* ══════════ C 面 · 代理级（本版新增的真缺口修复） ══════════ */

test('v3471 C1. 代理级真跑：有宿主时优先走同源后端代理，source=proxy', async () => {
    let proxyHit = 0, directHit = 0;
    const { srv, base } = await serve((req, res) => {
        if (req.url === '/api/backends/chat-completions/status') {
            proxyHit++;
            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ data: [{ id: 'via-proxy' }], echoed: JSON.parse(body || '{}').custom_url }));
            });
            return;
        }
        if (req.url === '/csrf-token') { res.end(JSON.stringify({ token: 'tok' })); return; }
        directHit++;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'via-direct' }] }));
    });
    try {
        withWindow(base);
        const llm = new M.LLMCaller({ config: {} });
        const r = await llm.fetchModels(base + '/v1', 'sk-x');
        assert.equal(r.source, 'proxy', '有宿主必须优先代理级');
        assert.deepEqual(r.models, ['via-proxy'], '拿到的必须是代理级的列表');
        assert.equal(proxyHit, 1, '代理端点必须被真调用一次');
        assert.equal(directHit, 0, '代理成功时不许再打直连（否则是白花一次跨域请求）');
    } finally { clearWindow(); await close(srv); }
});

test('v3471 C2. 代理失败必须回落直连：一级坏了不许让整件事失败', async () => {
    const { srv, base } = await serve((req, res) => {
        if (req.url === '/api/backends/chat-completions/status') { res.statusCode = 500; res.end('proxy down'); return; }
        if (req.url === '/csrf-token') { res.end(JSON.stringify({ token: 't' })); return; }
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [{ id: 'direct-ok' }] }));
    });
    try {
        withWindow(base);
        const llm = new M.LLMCaller({ config: {} });
        const r = await llm.fetchModels(base + '/v1', 'k');
        assert.equal(r.source, 'direct', '代理 500 后必须回落到直连并如实标来源');
        assert.deepEqual(r.models, ['direct-ok']);
    } finally { clearWindow(); await close(srv); }
});

test('v3471 C3. 两级全败：错误必须点名每一级原因（不许只说「失败了」）', async () => {
    withWindow('http://127.0.0.1:9');
    try {
        const llm = new M.LLMCaller({ config: {} });
        let err = null;
        try { await llm.fetchModels('http://127.0.0.1:9/v1', 'k'); } catch (e) { err = e; }
        assert.ok(err, '两级全败必须抛错（不许静默给空列表）');
        assert.ok(/代理/.test(err.message), '错误必须点名代理级');
        assert.ok(/直连/.test(err.message), '错误必须点名直连级');
        assert.ok(/手动填/.test(err.message), '错误必须给出下一步（手动填）——否则用户只知道坏了');
    } finally { clearWindow(); }
});

test('v3471 C4. 空列表不许被当成成功：端点 200 但零模型必须抛', async () => {
    clearWindow();
    const { srv, base } = await serve((req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ data: [] }));
    });
    try {
        const llm = new M.LLMCaller({ config: {} });
        await assert.rejects(() => llm.fetchModels(base + '/v1', 'k'), (e) => {
            assert.ok(/列表为空/.test(e.message), '零模型必须说「列表为空」，实测：' + e.message);
            return true;
        });
    } finally { await close(srv); }
});

test('v3471 C5. 空地址不瞎发请求：必须当场拒绝', async () => {
    const llm = new M.LLMCaller({ config: {} });
    for (const bad of ['', '   ', null, undefined]) {
        await assert.rejects(() => llm.fetchModels(bad, 'k'), (e) => {
            assert.ok(/地址为空/.test(e.message), '空地址必须点名，实测：' + e.message);
            return true;
        });
    }
});

/* ══════════ D 面 · 源码接线（UI 消费端必须按新形状读） ══════════ */

test('v3471 D1. UI 消费端按 {models, source} 读，且不再假设返回值是数组', () => {
    const ui = read(UI_REL);
    assert.ok(ui.includes('ls-fetch-models'), '抓取按钮 id 必须在场');
    const i = ui.indexOf('fetchModels(url');
    assert.ok(i > 0, '抓取处理器（调 engine.llm.fetchModels）必须在场');
    const seg = ui.slice(Math.max(0, i - 400), i + 2500);
    assert.ok(/Array\.isArray\(r\) \? r : \(r && r\.models\)/.test(ui),
        'UI 必须同时兼容新形状与旧数组形状（宿主降级时可能是退路实现）');
    assert.ok(/r\.source === 'proxy'/.test(ui), 'UI 必须能分辨代理级来源并如实展示');
    assert.ok(/r\.source === 'direct'/.test(ui), 'UI 必须能分辨直连级来源');
    assert.ok(/Array\.isArray\(r\)/.test(seg), '消费端数组兼容必须紧邻 fetchModels 调用点');
});

test('v3471 D2. 退路实现（OrganFallback）与真实现同形：fetchModels 必须存在且不抛', async () => {
    const idx = read(IDX_REL);
    assert.ok(/async fetchModels\(\)/.test(idx), '退路必须保留 fetchModels（否则缺席时按钮直接 TypeError）');
    const m = /async fetchModels\(\) \{ return \{([^}]*)\}; \}/.exec(idx);
    assert.ok(m, '退路的 fetchModels 必须是如实回报形状（models + source + reason）');
    assert.ok(/models:\s*\[\]/.test(m[0]), '退路必须给空数组而不是 undefined');
    assert.ok(/source:/.test(m[0]), '退路必须标明来源（不许冒充真实现）');
    assert.ok(/reason:/.test(m[0]), '退路必须说明为什么不可用');
});

/* ══════════ E 面 · 真源码破坏（同一判据对破坏副本必须翻红） ══════════ */

/** 判据切片：三级降级在场 + 聚合报错在场 + 空列表守卫在场。 */
function judgeDegrade(src) {
    const p = [];
    if (!/this\._fetchModelsViaProxy\s*\(/.test(src)) p.push('缺代理级调用 this._fetchModelsViaProxy');
    if (!src.includes('/api/backends/chat-completions/status')) p.push('缺同源代理端点');
    if (!/_normalizeModelsPayload\s*\(/.test(src)) p.push('缺归一化出口');
    if (!/source: 'proxy'/.test(src)) p.push('代理级没标 source: proxy');
    if (!/source: 'direct'/.test(src)) p.push('直连级没标 source: direct');
    if (!/proxyError\.join/.test(src)) p.push('缺聚合报错（两级原因会被吞掉）');
    if (!/列表为空/.test(src)) p.push('缺空列表守卫');
    if (!/地址为空/.test(src)) p.push('缺空地址守卫');
    return p;
}

test('v3471 E1. 阴性对照：真源码本身必须全项在场（否则下面两条负控制是假绿）', () => {
    const problems = judgeDegrade(read(MOD_REL));
    assert.deepEqual(problems, [], '真源码接线不全：' + problems.join(' / '));
});

test('v3471 E2. 负控制①：删掉代理级调用 ⇒ 判据必须翻红', () => {
    const src = read(MOD_REL);
    const broken = breakSource(src, 'const models = await this._fetchModelsViaProxy(base, key);',
        'const models = [];', 'v3471-代理级');
    const problems = judgeDegrade(broken);
    assert.ok(problems.length > 0, '删掉代理级后判据仍绿 ⇒ 判据在测空气');
    assert.ok(problems.some((x) => /source: 'proxy'/.test(x) || /代理/.test(x)),
        '翻红的理由必须指向代理级，实测：' + problems.join(' / '));
});

test('v3471 E3. 负控制②：把聚合报错换成静默空列表 ⇒ 判据必须翻红', () => {
    const src = read(MOD_REL);
    const anchor = "throw new Error('模型列表抓取失败（' + proxyError.join('；') + '）——可手动填模型名');";
    const broken = breakSource(src, anchor, 'return { models: [], source: \'none\' };', 'v3471-静默空');
    const problems = judgeDegrade(broken);
    assert.ok(problems.some((x) => /聚合报错/.test(x)),
        '把静默空列表当成正常返回后判据必须点名缺聚合报错，实测：' + problems.join(' / '));
});

test('v3471 E4. 负控制③：抹掉空列表守卫 ⇒ 判据必须翻红', () => {
    const src = read(MOD_REL);
    const broken = breakSource(src, "if (!models.length) throw new Error('列表为空');",
        'if (false) {}', 'v3471-空列表守卫');
    const problems = judgeDegrade(broken);
    assert.ok(problems.some((x) => /空列表守卫/.test(x)),
        '抹掉空列表守卫后判据必须翻红，实测：' + problems.join(' / '));
});

/* ══════════ F 面 · 五源版本同步（本仓抬版纪律） ══════════ */

test('v3471 F1. 五源同源且不低于 3.471.0（下限形，不把本版号写死进判据）', () => {
    const vnum = (s) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    const pkg = JSON.parse(read('package.json'));
    const man = JSON.parse(read('manifest.json'));
    const idx = read(IDX_REL);
    const ver = pkg.version;
    assert.ok(vnum(ver) >= vnum('3.471.0'), '版本必须不低于本版下限 3.471.0，实为 ' + ver);
    assert.equal(man.version, ver, 'manifest 必须与 package 同源');
    assert.ok(idx.includes("const VERSION = '" + ver + "'"), 'index.js VERSION 必须同源');
    for (const f of ['memory-config.js', 'memory-organs.js', 'memory-core.js']) {
        assert.ok(read(f).includes("VERSION = '" + ver + "'"), f + ' 的 VERSION 副本必须同源');
    }
});
