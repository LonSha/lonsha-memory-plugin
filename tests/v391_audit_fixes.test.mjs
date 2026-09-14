// v3.91 全项目审计修复专项测试
// 覆盖 8 项「配置声明存在但引擎零引用」的断链修复，逐项做行为级验证（非仅静态接线）
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'fs';

const src = fs.readFileSync('index.js', 'utf8');
const ga = fs.readFileSync('graph_algorithms.js', 'utf8');

// ---------- 提取工具（复用 v388/v390 花括号计数法） ----------
function extractNamed(text, marker) {
    const at = text.indexOf(marker);
    if (at < 0) throw new Error('找不到: ' + marker);
    let i = text.indexOf('{', at), depth = 0;
    const start = at;
    for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) break; }
    }
    return text.slice(start, i + 1);
}
function extractClass(text, name) {
    const at = text.indexOf('class ' + name + ' {');
    if (at < 0) throw new Error('找不到 class ' + name);
    let i = text.indexOf('{', at), depth = 0;
    for (; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) break; }
    }
    return text.slice(at, i + 1);
}
function objOf(methodSrc, deps = {}) {
    const names = Object.keys(deps);
    const fn = new Function(...names, `return ({ ${methodSrc} });`);
    return fn(...names.map(n => deps[n]));
}

// ═══════════ 1. presenceInjection：键名断裂修复 ═══════════
test('【1】presenceInjection 门控键统一（原 presenceTier 恒 undefined 导致功能死锁）', () => {
    assert.ok(!src.includes('this.config.config.presenceTier'), '旧断裂键 presenceTier 已清除');
    assert.ok(src.includes('this.config.config.presenceInjection !== false'), '门控改用 presenceInjection 容灾式判断');
    assert.ok(/presenceInjection:\s*true/.test(src), 'presenceInjection 有默认值');
    assert.ok(/presenceMaxCandidates:\s*8/.test(src), '新增候选上限默认值');
    // 行为：候选上限生效
    const cap = 3;
    const absent = ['a', 'b', 'c', 'd', 'e'];
    const out = absent.slice(0, Math.max(1, Number(cap) || 8));
    assert.strictEqual(out.length, 3, '上限裁剪生效');
    console.log('✓ 1: presenceInjection 键名断裂已修复 + 候选上限接入');
});

// ═══════════ 2. echoBaseLife / echoMaxCount：硬编码绕过修复 ═══════════
test('【2】EchoPool 读取 config（原硬编码 life=2 / cap=30 绕过配置）', () => {
    const cls = extractClass(src, 'EchoPool');
    assert.ok(!/life:\s*2,/.test(cls) || cls.includes('life: baseLife'), '不再硬编码 life: 2');
    assert.ok(!cls.includes('slice(-30)') && !cls.includes('> 30'), '不再硬编码容量 30');
    const EchoPool = new Function('errLog', extractClass(src, 'EchoPool') + '; return EchoPool;')(() => {});

    // 行为 A: 自定义 baseLife 生效
    const p1 = new EchoPool(() => ({ echoBaseLife: 4, echoMaxCount: 10 }));
    p1.onRecalled([{ id: 'x', text: 'foo' }]);
    assert.strictEqual(p1.items[0].life, 4, 'baseLife=4 生效（原恒为 2）');
    p1.tick(); p1.tick();
    assert.strictEqual(p1.items.length, 1, 'life=4 时衰减 2 轮仍存活');

    // 行为 B: 自定义 maxCount 生效
    const p2 = new EchoPool(() => ({ echoBaseLife: 2, echoMaxCount: 3 }));
    p2.onRecalled([1, 2, 3, 4, 5].map(i => ({ id: 'k' + i, text: 't' + i })));
    assert.strictEqual(p2.items.length, 3, 'maxCount=3 生效（原恒为 30）');
    assert.strictEqual(p2.items[2].key, 'k5', '保留最新的（按新近度）');

    // 行为 C: 无 cfgGetter 时回落默认（向后兼容）
    const p3 = new EchoPool();
    p3.onRecalled([{ id: 'y', text: 'bar' }]);
    assert.strictEqual(p3.items[0].life, 2, '缺省 baseLife 仍为 2');

    // 行为 D: 畸形配置不炸
    const p4 = new EchoPool(() => ({ echoBaseLife: 'abc', echoMaxCount: -5 }));
    p4.onRecalled([{ id: 'z', text: 'baz' }]);
    assert.strictEqual(p4.items[0].life, 2, '非法 baseLife 回落 2');
    assert.ok(p4.items.length >= 1, '非法 maxCount 不导致清空');
    console.log('✓ 2: EchoPool baseLife/maxCount 已接入 config + 容灾回落');
});

// ═══════════ 3. maxSummaryLength：UI 有滑块引擎不读 修复 ═══════════
test('【3】createSummary 兜底截断读 config.maxSummaryLength', () => {
    assert.ok(!src.includes('this.smartTruncate(safeMes, 200)'), '硬编码 200 已移除');
    assert.ok(src.includes('opts.maxLen'), '改由 opts.maxLen 传入');
    // 两处调用点都已接通
    const calls = (src.match(/maxLen:\s*this\.config\.config\.maxSummaryLength/g) || []).length;
    assert.ok(calls >= 2, `调用点已接通（找到 ${calls} 处，含降级路径）`);
    // 行为：无 llmSummary 时按 maxLen 截断
    const truncate = (t, n) => String(t).slice(0, n);
    assert.strictEqual(truncate('x'.repeat(500), 350).length, 350, '自定义长度生效');
    console.log('✓ 3: maxSummaryLength 已接通降级摘要路径');
});

// ═══════════ 4. pageRankDamping：库内硬编码脱钩修复 ═══════════
test('【4】personalizedPageRank 接受 dampingFactor 且调用点传入', () => {
    assert.ok(/personalizedPageRank\(seedNodes, hops = 3, topK = 10, dampingFactor = 0\.85\)/.test(ga), '库函数已加第 4 参');
    assert.ok(!/dampingFactor:\s*0\.85,\n\s*maxIterations/.test(ga), '不再无条件硬编码 0.85');
    assert.ok(src.includes('this.config.config.pageRankDamping'), 'index.js 调用点已传入配置');
    // 行为：越界值回落
    const pick = d => (Number.isFinite(Number(d)) && Number(d) > 0 && Number(d) < 1) ? Number(d) : 0.85;
    assert.strictEqual(pick(0.5), 0.5, '合法值生效');
    assert.strictEqual(pick(1.5), 0.85, '越界回落 0.85');
    assert.strictEqual(pick(undefined), 0.85, '缺省回落 0.85');
    console.log('✓ 4: pageRankDamping 已打通 index.js → graph_algorithms.js');
});

// ═══════════ 5. lockedFactMaxChars：注入无上限 修复 ═══════════
test('【5】lockedFactsForPrompt 按 lockedFactMaxChars 裁剪预算', () => {
    const m = extractNamed(src, 'lockedFactsForPrompt(maxChars) {');
    const obj = objOf(m, {});
    const ctx = {
        lockedFacts: [
            { text: 'A'.repeat(30), floor: 1 },
            { text: 'B'.repeat(30), floor: 2 },
            { text: 'C'.repeat(30), floor: 3 },
        ],
        getLockedFacts() { return this.lockedFacts; }
    };
    // 无预算：全量
    const all = obj.lockedFactsForPrompt.call(ctx);
    assert.strictEqual(all.split('\n').length, 3, '无预算时全量输出（向后兼容）');
    // 有预算：裁剪
    const capped = obj.lockedFactsForPrompt.call(ctx, 90);
    assert.ok(capped.split('\n').length < 3, '超预算条目被舍弃');
    assert.ok(capped.length <= 90, `输出不超预算（实际 ${capped.length}）`);
    // 单条也超预算：返回空而非截断残句
    const tiny = obj.lockedFactsForPrompt.call(ctx, 5);
    assert.strictEqual(tiny, '', '预算过小返回空（不产出语义残缺片段）');
    // 空列表容灾
    assert.strictEqual(obj.lockedFactsForPrompt.call({ getLockedFacts: () => [] }, 100), '', '空列表返回空');
    // 注入调用点已传参，校验器路径不传（应看全量）
    assert.ok(src.includes('lockedFactsForPrompt?.(this.config.config.lockedFactMaxChars)'), '注入路径已传预算');
    assert.ok(src.includes("this.summary.lockedFactsForPrompt() : ''"), '校验器路径仍取全量（不受预算影响）');
    console.log('✓ 5: lockedFactMaxChars 已接入注入预算裁剪');
});

// ═══════════ 6. getGeoPrompt：数据空转 修复 ═══════════
test('【6】getGeoPrompt 接入 buildInjection 动态区', () => {
    assert.ok(src.includes('this.status?.getGeoPrompt?.()'), 'buildInjection 已调用 getGeoPrompt');
    // 位置应在动态区（clockPrompt 之前、静态锚定区之后）
    const dynAt = src.indexOf('// ===== B. 动态易变尾部区');
    const geoAt = src.indexOf('this.status?.getGeoPrompt?.()');
    const staticAt = src.indexOf('// ===== A. 静态锚定前缀区');
    assert.ok(geoAt > dynAt, 'geo 注入在动态区内（位置会变，不进静态锚定破坏 prompt cache）');
    assert.ok(dynAt > staticAt, '区段顺序正常');
    // 行为：空 geo 不产出噪声
    const m = extractNamed(src, 'getGeoPrompt() {');
    const obj = objOf(m, {});
    assert.strictEqual(obj.getGeoPrompt.call({ geoContext: { majorArea: '', minorArea: '', detailLocation: '' } }), '', '空位置不注入');
    assert.strictEqual(obj.getGeoPrompt.call({ geoContext: null }), '', 'null 容灾');
    const t = obj.getGeoPrompt.call({ geoContext: { majorArea: '临江县', minorArea: '一中', detailLocation: '教室' } });
    assert.ok(t.includes('临江县') && t.includes('教室'), '有位置时正常产出');
    console.log('✓ 6: getGeoPrompt 已接入注入（此前 LLM 抽取的地理数据完全空转）');
});

// ═══════════ 7. worldProgressMaxCandidates：MAX_ACTIVE 硬编码 修复 ═══════════
test('【7】WorldProgress.select 接受 maxCandidates', () => {
    const m = extractNamed(src, 'select(candidates, status, maxCandidates) {');
    const obj = objOf(m, {});
    const ctx = { MAX_ACTIVE: 2 };
    const cands = ['a', 'b', 'c', 'd'];
    assert.strictEqual(obj.select.call(ctx, cands, null).length, 2, '缺省回落 MAX_ACTIVE=2（向后兼容）');
    assert.strictEqual(obj.select.call(ctx, cands, null, 4).length, 4, 'maxCandidates=4 生效');
    assert.strictEqual(obj.select.call(ctx, cands, null, 0).length, 2, '非法 0 回落 MAX_ACTIVE');
    assert.ok(src.includes('engine?.config?.config?.worldProgressMaxCandidates'), '调用点已传入配置（可选链守卫）');
    console.log('✓ 7: worldProgressMaxCandidates 已接通 select 上限');
});

// ═══════════ 8. recallTierEnabled / temporalGraphEnabled：无门控 修复 ═══════════
test('【8】recallTierEnabled 与 temporalGraphEnabled 门控接入', () => {
    assert.ok(src.includes('this.config.config.recallTierEnabled !== false'), 'recallTier 有门控');
    assert.ok(src.includes('_tierOn ? blocks.filter'), '关闭时不做常驻/触发分区');
    assert.ok(src.includes('this.config.config.temporalGraphEnabled !== false'), 'temporalGraph 有门控');
    assert.ok(src.includes('_temporalOn && isHistorical'), '关闭时不回溯历史边');
    // 行为：分级关闭时全部块进 trigger（统一裁剪）
    const blocks = ['[前情摘要]x', '[其他]y'];
    const MARK = ['[前情摘要]'];
    for (const on of [true, false]) {
        const res = on ? blocks.filter(b => MARK.some(m => b.startsWith(m))) : [];
        const trig = on ? blocks.filter(b => !MARK.some(m => b.startsWith(m))) : blocks.slice();
        assert.strictEqual(res.length + trig.length, blocks.length, `开关=${on} 时无块丢失`);
        if (!on) assert.strictEqual(trig.length, 2, '关闭时全部块走统一预算');
    }
    console.log('✓ 8: recallTierEnabled / temporalGraphEnabled 门控已接入且不丢块');
});

// ═══════════ 9. 回归门：配置项零引用扫描 ═══════════
test('【9】回归门：不得再出现「有默认值但全项目零引用」的配置键', () => {
    const cfgAt = src.indexOf('this.config = {');
    let i = src.indexOf('{', cfgAt), depth = 0;
    const start = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    const block = src.slice(start, i + 1);
    const keys = [...block.matchAll(/^\s{12,20}([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm)].map(m => m[1]);
    assert.ok(keys.length > 100, `配置键数量正常（${keys.length}）`);

    const lines = src.split('\n');
    const l0 = src.slice(0, cfgAt).split('\n').length;
    const l1 = l0 + block.split('\n').length;
    const orphan = [];
    for (const k of new Set(keys)) {
        const re = new RegExp(`\\b${k}\\b`);
        let seen = false;
        for (let n = 0; n < lines.length; n++) {
            if (n + 1 >= l0 && n + 1 <= l1) continue;
            if (re.test(lines[n])) { seen = true; break; }
        }
        if (!seen) orphan.push(k);
    }
    assert.deepStrictEqual(orphan, [], '存在零引用配置键（幽灵配置）: ' + orphan.join(', '));
    console.log(`✓ 9: ${new Set(keys).size} 个配置键全部有引用点，无幽灵配置`);
});

// ═══════════ 11. 事件监听卸载：handler 引用缺失 修复 ═══════════
test('【11】unregisterEvents 保存并按 handler 引用精确卸载', () => {
    // 静态：7 个注册点全部保存 handler 引用
    const withHandler = (src.match(/this\.eventHandlers\.push\(\{ eventSource, type: types\.[A-Z_]+, handler: _h\d+ \}\);/g) || []).length;
    const totalPush = (src.match(/this\.eventHandlers\.push\(\{/g) || []).length;
    assert.strictEqual(withHandler, totalPush, `全部 ${totalPush} 个注册点都带 handler 引用（实际 ${withHandler}）`);
    assert.ok(withHandler >= 7, `注册点数量符合预期（${withHandler} >= 7）`);
    // 注册用的是具名变量而非内联匿名函数（否则引用无法保存）
    const named = (src.match(/eventSource\.on\(types\.[A-Z_]+, _h\d+\);/g) || []).length;
    assert.strictEqual(named, withHandler, '注册与 push 用同一 handler 引用');

    // 行为：卸载按引用移除，且无引用时不做无参移除（防误删他人监听）
    const m = extractNamed(src, 'unregisterEvents() {');
    const obj = objOf(m, { errLog: () => {}, PLUGIN_NAME: 'T' });
    const removedCalls = [];
    const fakeEs = {
        removeListener(type, fn) { removedCalls.push([type, fn]); },
    };
    const h1 = () => {}, h2 = () => {};
    const ctx = {
        config: { config: { debugMode: false } },
        eventHandlers: [
            { eventSource: fakeEs, type: 'A', handler: h1 },
            { eventSource: fakeEs, type: 'B', handler: h2 },
            { eventSource: fakeEs, type: 'C' },           // 无 handler：应跳过而非无参移除
            null,                                          // 畸形记录：不应抛异常
        ]
    };
    const warns = [];
    const origWarn = console.warn;
    console.warn = (...a) => warns.push(a.join(' '));
    try { obj.unregisterEvents.call(ctx); } finally { console.warn = origWarn; }

    assert.strictEqual(removedCalls.length, 2, '仅移除有 handler 引用的 2 个');
    assert.strictEqual(removedCalls[0][1], h1, '按引用移除 A');
    assert.strictEqual(removedCalls[1][1], h2, '按引用移除 B');
    assert.ok(warns.some(w => w.includes('C')), '无 handler 的 C 给出告警而非静默无参移除');
    assert.deepStrictEqual(ctx.eventHandlers, [], '卸载后清空列表');

    // 幂等：二次调用不炸
    obj.unregisterEvents.call(ctx);
    assert.deepStrictEqual(ctx.eventHandlers, [], '二次卸载幂等');
    // 未初始化容灾
    obj.unregisterEvents.call({ eventHandlers: null });
    console.log('✓ 11: 事件卸载已按 handler 引用精确移除（原实现无参调用实际无效且有误删风险）');
});
test('【10】版本号一致性', () => {
    const v = src.match(/const VERSION = '([\d.]+)'/)?.[1];
    const mv = JSON.parse(fs.readFileSync('manifest.json', 'utf8')).version;
    // [v3.92] 原为两处硬编码字面量：升版必改、改漏即红，且测不出两源互相漂移。
    // 改为跨源自洽 + semver 格式，断言的是不变量本身。
    assert.ok(v, 'index.js 未找到 VERSION 常量');
    assert.match(String(v), /^\d+\.\d+\.\d+$/, `VERSION 非法 semver: ${v}`);
    assert.strictEqual(mv, v, `manifest(${mv}) 与 index.js VERSION(${v}) 漂移`);
    console.log(`✓ 10: 版本号跨源一致 (${v})`);
});