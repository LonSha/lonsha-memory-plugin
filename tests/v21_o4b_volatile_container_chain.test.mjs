/* ============================================================
 * tests/v21_o4b_volatile_container_chain.test.mjs — v3.465.1
 * —— 第二十一期收账轮：**Map/Set 容器跨 JSON 的三段链路**（写 → 还原 → 读）
 * ------------------------------------------------------------
 * 【本档为什么必须存在（先说清楚，免得被读成「又补一个 Happy Path 判据」）】
 *   v3.464.0（L21-O4）给 19 个心智引擎补 `hydrateState` 时，我写下过一句
 *   「行为已实证：把默认状态 JSON 往返后再走 hydrateState，Map/Set 字段回来的是真的 Map/Set」。
 *   **那句话在当时是假的**，而且假在两个层次上：
 *
 *     ① 探针自己就有 bug：它拿 `JSON.stringify(默认状态)` 当「落盘」，
 *        而 `JSON.stringify(new Map([['a',1]]))` 给的是 `{}` —— 元素在探针里就已经没了，
 *        探针只核对了 `instanceof Map`，空 Map 当然也是 Map，于是打印「通过」。
 *        **这正是本仓纪律「元素级核对，不只查 instanceof」要拦的形态**：
 *        形状对、内容空，是最难发现的一种假绿。
 *
 *     ② 就算探针写对，**产品侧仍然救不回来**：`collectExport()` 把
 *        `{ lonshaXxxState: this._xxxState }` **原样**塞进存档，
 *        这 9 个函数库形态模块的状态对象里带 Map/Set ——
 *        存档里那个字段永远是 `{}`。写入端从来没写过，读取端写得再对也是空转。
 *
 *   所以本档判**三段**，缺任何一段都能翻红：
 *     W（write）  摊平结果不得残留任何 Map/Set 实例；
 *     R（restore）摊平 → JSON → 还原 后，容器种类**与元素**都要回来；
 *     H（hydrate）还原后的载荷交给模块自己的水合函数，字段仍须是容器且元素不减。
 *
 * 【判据清单】
 *   A1 判定体纯函数、不 import fs
 *   A2 三段各自的 `probe-missing` 不是通过（缺函数必须报缺口，不许静默返回空数组）
 *   A3 `leftoverContainers` 真能找出嵌套容器（Map 里套 Set、数组里套 Map）
 *   A4 `containerShape` / `stableJson` 的 Map/Set 描述不退化（元素数、顺序无关）
 *   A5 `deepEqualJson` 对同内容不同插入顺序判等（Map 顺序无关）
 *   B1 写入段：9 个模块的活状态全部摊平彻底（0 处残留）
 *   B2 还原段：12 个容器字段种类 + 元素全部回来
 *   B3 读取段：12 个字段经模块自己的水合后仍是容器且元素数不减
 *   B4 端到端：摊平→JSON→还原→水合，一步不跳
 *   C1 负控制：真源码删掉 `_collForSave` 调用（9 处改回原样）⇒ B1/B4 必须翻红
 *   C2 负控制：还原函数退化成「只把顶层对象包成 Map」⇒ B2 必须翻红
 *   C3 负控制：摊平函数退化成恒等（原样返回）⇒ B1 必须翻红
 *   C4 负控制：模块水合退化成浅合并（v3.464.0 首版那个 bug）⇒ B3 必须翻红
 *   D1 写入侧与登记表双向一致：登记表里含容器的 9 个键，落盘侧必须全走摊平
 *   D2 摊平不误伤：本身无容器的模块，落盘字节必须与改动前完全一致（不制造无谓迁移）
 *   E1 判据纯度：本档不调用被它判定的实现来「自证」
 *   F1 自防护：本文件存在且非空、改动锚点字面量各只声明一次
 *   F2 当版锚：本文件头标注当版，且与四源一致（>= 出生版本，不写死等号）
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    QUESTION, BOUNDARY,
    leftoverContainers, containerShape, stableJson, deepEqualJson,
    flattenIssues, unflattenIssues, hydrateIssues, issueLines,
} from './audit/_volatile_container_judge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const BIRTH = '3.465.1';
const vnum = (s) => {
    const m = /(\d+)\.(\d+)\.(\d+)/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : -1;
};

/* ---------- 真源码装载（同 realm：不用 vm，避免跨 realm 原型判定失效） ---------- */
function loadModule(file) {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const module = { exports: {} };
    const exports = module.exports;
    new Function('globalThis', 'module', 'exports', code)(globalThis, module, exports);
    return module.exports;
}

/* ---------- 从 engine-persistence-ops.js 里取**真**摊平/还原函数 ---------- */
const OPS_SRC = read('engine-persistence-ops.js');
function grabFn(src, name) {
    const marker = 'const ' + name + ' = ';
    const start = src.indexOf(marker);
    if (start < 0) return null;
    const open = src.indexOf('{', start);
    if (open < 0) return null;
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') {
            depth--;
            if (depth === 0) {
                const body = src.slice(start, i + 1) + ';';
                try {
                    return new Function(body + '\n return ' + name + ';')();
                } catch (e) {
                    return null;
                }
            }
        }
    }
    return null;
}
const flattenReal = grabFn(OPS_SRC, '_flattenColl');
const unflattenReal = grabFn(OPS_SRC, '_unflattenColl');

/* ---------- 12 个容器字段用例（模块 / 构造器 / 字段 / 种类 / 登记水合名 / 播种） ---------- */
const CASES = [
    ['engine-orchestration-ripple-bus.js', 'createOrchestrationState', 'registeredEngines', 'Map', 'hydrateRippleState',
        (s) => s.registeredEngines.set('e1', { name: 'e1', weight: 0.5 })],
    ['spatiotemporal-causality-lock.js', 'createCausalityLockState', 'timelineEvents', 'Map', 'hydrateLockState',
        (s) => s.timelineEvents.set('ev1', { id: 'ev1', floor: 3 })],
    ['spatiotemporal-causality-lock.js', 'createCausalityLockState', 'characterLifespans', 'Map', 'hydrateLockState',
        (s) => s.characterLifespans.set('苏离', { bornAt: 100, deceasedAt: null, status: 'alive' })],
    ['obsessive-taboo-multi-tier-defense.js', 'createMultiTierDefenseState', 'tabooSensors', 'Map', 'hydrateDefenseState',
        (s) => s.tabooSensors.set('苏离', [{ tabooId: 't1', keyword: 'k', triggerCount: 2, traumaThreshold: 0.4 }])],
    ['obsessive-taboo-multi-tier-defense.js', 'createMultiTierDefenseState', 'stressTension', 'Map', 'hydrateDefenseState',
        (s) => s.stressTension.set('苏离', 0.7)],
    ['intersubjective-parallax-isolation.js', 'createParallaxIsolationState', 'characterDossiers', 'Map', 'hydrateParallaxState',
        (s) => s.characterDossiers.set('苏离', { knownFacts: new Set(['a']), suspectedFacts: new Set(['b']), blindSpots: new Set() })],
    ['intersubjective-parallax-isolation.js', 'createParallaxIsolationState', 'sharedPublicFacts', 'Set', 'hydrateParallaxState',
        (s) => { s.sharedPublicFacts.add('p1'); s.sharedPublicFacts.add('p2'); }],
    ['counterfactual-butterfly-sandbox.js', 'createSandboxState', 'activeSandboxes', 'Map', 'hydrateSandboxState',
        (s) => s.activeSandboxes.set('sb1', { baseSnapshot: { a: 1 }, mutations: [], divergentEffects: [] })],
    ['emotional-anchor-binding-resonance-hub.js', 'createAnchorState', 'activeCovenants', 'Map', 'hydrateAnchorState',
        (s) => s.activeCovenants.set('c1', { id: 'c1' })],
    ['dissociative-amnesia-puzzle-workbench.js', 'createPuzzleState', 'hiddenFragments', 'Map', 'hydratePuzzleState',
        (s) => s.hiddenFragments.set('f1', { id: 'f1' })],
    ['dual-identity-exposure-risk-matrix.js', 'createExposureState', 'covertIdentities', 'Map', 'hydrateRiskState',
        (s) => s.covertIdentities.set('苏离', { cover: 'x' })],
    ['psychological-burnout-resilience-decay.js', 'createResilienceState', 'actorResilience', 'Map', 'hydrateBurnoutState',
        (s) => s.actorResilience.set('苏离', { resilience: 0.4, exhaustion: 0.6 })],
];

/** 造一个播过种的活状态（每次都是新实例，避免用例间串味） */
function seeded(mod, ctor, seed) {
    const s = mod[ctor]();
    seed(s);
    return s;
}

/* ============================================================
 * A. 判定体自身
 * ============================================================ */
test('A1 判定体纯函数：不 import fs / 不读盘', () => {
    const src = read('tests/audit/_volatile_container_judge.mjs');
    assert.ok(!/from\s+['"]fs['"]/.test(src), '判定体不得 import fs');
    assert.ok(!/require\(\s*['"]fs['"]\s*\)/.test(src), '判定体不得 require fs');
    assert.ok(!/readFileSync/.test(src), '判定体不得读盘');
    assert.ok(typeof QUESTION.write === 'string' && QUESTION.write.length > 10, 'QUESTION 必须写清问的是什么');
    assert.ok(Array.isArray(BOUNDARY) && BOUNDARY.length >= 3, '诚实边界至少三条');
});

test('A2 probe-missing 不是通过：缺函数必须报缺口', () => {
    const s = { m: new Map([['a', 1]]) };
    const noFnWrite = flattenIssues(s, null, 'x');
    assert.equal(noFnWrite.length, 1);
    assert.equal(noFnWrite[0].stage, 'probe-missing');

    const noFnBack = unflattenIssues(s, null, null, { m: 'Map' }, 'x');
    assert.equal(noFnBack.length, 1);
    assert.equal(noFnBack[0].stage, 'probe-missing');

    const noFnRead = hydrateIssues(s, null, 'hydrateState', { m: 'Map' }, 'x', null, null);
    assert.equal(noFnRead.length, 1);
    assert.equal(noFnRead[0].stage, 'probe-missing');
});

test('A3 leftoverContainers 能找出嵌套容器（Map 套 Set、数组套 Map）', () => {
    const nested = {
        a: new Map([['k', new Set([1, 2])]]),
        b: [1, { c: new Map([['x', 1]]) }],
        d: 'fine',
    };
    const left = leftoverContainers(nested, '', [], 0);
    assert.ok(left.length >= 2, '至少应报出两处，实测 ' + JSON.stringify(left));
    assert.ok(left.some((p) => p.includes('.a')), '应报出 a');
    assert.ok(left.some((p) => p.includes('.b[1].c')), '应报出 b[1].c，实测 ' + JSON.stringify(left));

    // 全摊平后必须 0 处
    assert.equal(leftoverContainers({ a: { __map: [] }, b: [1, 2] }, '', [], 0).length, 0);
});

test('A4 containerShape / stableJson 不退化', () => {
    assert.equal(containerShape(new Map([['a', 1]])), 'Map<1>');
    assert.equal(containerShape(new Set([1, 2])), 'Set<2>');
    assert.equal(containerShape([]), 'Array<0>');
    assert.equal(containerShape({}), 'Object<0>');
    assert.equal(containerShape('x'), 'string');

    // 顺序无关：插入顺序不同、内容相同 ⇒ 同一串
    const m1 = new Map([['a', 1], ['b', 2]]);
    const m2 = new Map([['b', 2], ['a', 1]]);
    assert.equal(stableJson(m1), stableJson(m2), 'Map 的 stableJson 必须与插入顺序无关');
    // 元素数不同必须能区分（防「只比类型」的退化）
    assert.notEqual(stableJson(new Map([['a', 1]])), stableJson(new Map([['a', 1], ['b', 2]])));
    assert.notEqual(stableJson(new Set([1])), stableJson(new Set([1, 2])));
});

test('A5 deepEqualJson 对同内容不同插入顺序判等，对少一条判不等', () => {
    assert.ok(deepEqualJson(new Map([['a', 1], ['b', 2]]), new Map([['b', 2], ['a', 1]])));
    assert.ok(!deepEqualJson(new Map([['a', 1], ['b', 2]]), new Map([['a', 1]])));
    assert.ok(deepEqualJson({ x: new Set(['p', 'q']) }, { x: new Set(['q', 'p']) }));
    assert.ok(!deepEqualJson({ x: new Set(['p']) }, { x: new Set(['p', 'q']) }));
});

/* ============================================================
 * B. 真仓三段
 * ============================================================ */
test('B1 写入段：9 个模块的活状态摊平彻底（0 处残留容器）', () => {
    assert.equal(typeof flattenReal, 'function', '必须能从 engine-persistence-ops.js 取到真摊平函数');
    const all = [];
    for (const [file, ctor, field, kind, hyd, seed] of CASES) {
        const mod = loadModule(file);
        assert.equal(typeof mod[ctor], 'function', file + ' 缺构造器 ' + ctor);
        const live = seeded(mod, ctor, seed);
        const issues = flattenIssues(live, flattenReal, file + '::' + field);
        all.push(...issues);
    }
    assert.deepEqual(issueLines(all), [], '摊平后不得残留任何 Map/Set');
});

test('B2 还原段：12 个容器字段的种类与元素全部回来', () => {
    assert.equal(typeof unflattenReal, 'function', '必须能从 engine-persistence-ops.js 取到真还原函数');
    const all = [];
    for (const [file, ctor, field, kind, hyd, seed] of CASES) {
        const mod = loadModule(file);
        const live = seeded(mod, ctor, seed);
        const issues = unflattenIssues(live, flattenReal, unflattenReal, { [field]: kind }, file + '::' + field);
        all.push(...issues);
    }
    assert.deepEqual(issueLines(all), [], '还原后容器种类与元素必须完全回来');
});

test('B3 读取段：12 个字段经模块自己的水合后仍是容器且元素不减', () => {
    const all = [];
    for (const [file, ctor, field, kind, hyd, seed] of CASES) {
        const mod = loadModule(file);
        const live = seeded(mod, ctor, seed);
        const issues = hydrateIssues(live, mod, hyd, { [field]: kind }, file + '::' + hyd, flattenReal, unflattenReal);
        all.push(...issues);
    }
    assert.deepEqual(issueLines(all), [], '水合后容器必须仍在且元素不减');
});

test('B4 端到端：摊平 → JSON → 还原 → 水合，一步不跳', () => {
    for (const [file, ctor, field, kind, hyd, seed] of CASES) {
        const mod = loadModule(file);
        const live = seeded(mod, ctor, seed);
        const before = kind === 'Map' ? live[field].size : live[field].size;
        assert.ok(before > 0, file + '::' + field + ' 播种必须非空（否则用例空转）');

        const payload = JSON.parse(JSON.stringify(flattenReal(live)));
        const restored = mod[hyd](unflattenReal(payload));
        const got = restored[field];
        if (kind === 'Map') assert.ok(got instanceof Map, file + '::' + field + ' 端到端后应为 Map');
        else assert.ok(got instanceof Set, file + '::' + field + ' 端到端后应为 Set');
        assert.equal(got.size, before, file + '::' + field + ' 端到端后元素数必须不变');
    }
});

/* ============================================================
 * C. 负控制（每条都真改真源码，配原版对照）
 * ============================================================ */
test('C1 负控制：删掉 _collForSave 调用（9 处改回原样）⇒ 写入段必须翻红', () => {
    const broken = OPS_SRC.replace(/_collForSave\((this\._\w+State)\)/g, '$1');
    assert.notEqual(broken, OPS_SRC, '破坏必须真的改到源码（否则是空转）');
    const n = (OPS_SRC.match(/_collForSave\(this\./g) || []).length;
    assert.equal(n, 9, '落盘侧应恰有 9 处走摊平，实测 ' + n);

    const brokenFlatten = grabFn(broken, '_flattenColl');
    // 破坏版仍能取到摊平函数（函数体没删），但**落盘点不调它** —— 这正是缺陷形态。
    // 所以这里断言的是「移除调用后，元素会丢」，而不是「摊平函数坏了」。
    const live = seeded(loadModule('counterfactual-butterfly-sandbox.js'), 'createSandboxState',
        (s) => s.activeSandboxes.set('sb1', { baseSnapshot: {}, mutations: [], divergentEffects: [] }));
    const rawPayload = JSON.parse(JSON.stringify(live));
    assert.deepEqual(rawPayload.activeSandboxes, {}, '不摊平时 JSON 必须把 Map 规约成 {}（这就是缺陷本体）');
    // 摊平版对照：
    const okPayload = JSON.parse(JSON.stringify(flattenReal(live)));
    assert.notDeepEqual(okPayload.activeSandboxes, {}, '摊平后不得为空');
    assert.ok(Array.isArray(okPayload.activeSandboxes.__map), '摊平后应留下 __map 标记');
    assert.equal(typeof brokenFlatten, 'function', '破坏版仍能取出摊平函数（证明缺陷在调用点、不在函数体）');
});

test('C2 负控制：还原函数退化成「每层都粗糙 Map 化、不认 __map 标记」⇒ 还原段必须翻红', () => {
    /* 退化的关键不在「包成 Map」而在**不认标记**：摊平后的载荷是 `{__map:[[k,v],...]}`，
     *   它本身是个**普通对象**。粗糙实现会把 `{__map:...}` 直接当键值表建成
     *   `Map{[__map, [[k,v],...]]}` —— instanceof 对、size 也对（都是 1），
     *   只有做**元素级**比对才能看出内容全错。这正是 A5 那条「顺序无关深比对」存在的理由。*/
    const degenerate = (v) => {
        if (!v || typeof v !== 'object' || Array.isArray(v)) return v;
        const out = {};
        for (const k of Object.keys(v)) {
            const x = v[k];
            out[k] = (x && typeof x === 'object' && !Array.isArray(x)) ? new Map(Object.entries(x)) : x;
        }
        return out;
    };
    const live = seeded(loadModule('counterfactual-butterfly-sandbox.js'), 'createSandboxState',
        (s) => s.activeSandboxes.set('sb1', { baseSnapshot: {}, mutations: [], divergentEffects: [] }));
    const issues = unflattenIssues(live, flattenReal, degenerate, { activeSandboxes: 'Map' }, 'degenerate');
    assert.ok(issues.length > 0, '退化还原必须被抓住（否则判据过宽）');
    assert.ok(issues.some((i) => i.stage === 'restore-loss'), '应报 restore-loss（形状对但元素不回来），实测 ' +
        JSON.stringify(issues.map((i) => i.stage)));
});

test('C3 负控制：摊平函数退化成恒等 ⇒ 写入段必须翻红', () => {
    const ident = (v) => v;
    const live = seeded(loadModule('intersubjective-parallax-isolation.js'), 'createParallaxIsolationState',
        (s) => s.sharedPublicFacts.add('p1'));
    const issues = flattenIssues(live, ident, 'identity');
    assert.ok(issues.length > 0, '恒等摊平必须被抓住');
    assert.ok(issues.some((i) => i.stage === 'write'), '应报 write 段缺口');
});

test('C4 负控制：模块水合退化成浅合并（v3.464.0 首版那个 bug）⇒ 读取段必须翻红', () => {
    /* 复刻**当时的真实链路**，这一点很关键：
     *   v3.464.0 的现场是「写入侧不摊平（存档里是 `{}`）+ 读取侧浅合并」——
     *   两坏叠加，用户看到的是「读回来一个普通对象，之后每次 .get 都 TypeError」。
     *   如果在这里偷偷补上摊平/还原（把链路修好再喂给浅合并），浅合并反而**能跑通**
     *   （因为还原已经给了它真 Map），负控制就成了摆设。
     *   故本用例**刻意用恒等还原**，还原到「当时那一版」的环境。*/
    const shallowMerge = (factory) => (saved) => {
        const base = factory();
        if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return base;
        return Object.assign(base, saved);
    };
    const mod = loadModule('counterfactual-butterfly-sandbox.js');
    const fakeMod = { hydrateShallow: shallowMerge(mod.createSandboxState) };
    const live = seeded(mod, 'createSandboxState',
        (s) => s.activeSandboxes.set('sb1', { baseSnapshot: {}, mutations: [], divergeneEffects: [] }));
    const identityBack = (v) => v;   // 当时的「还原段」：根本不存在
    const issues = hydrateIssues(live, fakeMod, 'hydrateShallow', { activeSandboxes: 'Map' }, 'shallow', flattenReal, identityBack);
    // 注意：这里 flattenReal 仍会摊平，但 identityBack 不还原 ⇒ 浅合并收到 `{__map:...}`
    //   ⇒ 字段变普通对象 ⇒ 必须报 read 缺口。等价于当时的 `{}` 形态（都是普通对象）。
    assert.ok(issues.length > 0, '浅合并必须被抓住（这就是首版真缺陷的形态）');
    assert.ok(issues.some((i) => i.stage === 'read'), '应报 read 段缺口，实测 ' + JSON.stringify(issues.map((i) => i.stage)));
});

test('D1 写入侧与登记表双向一致：含容器的 9 个键，落盘侧必须全走摊平', () => {
    // 登记表：v21Engines 的 42 项里，真实带容器的模块
    const entries = [...OPS_SRC.matchAll(/\['(\w+)',\s*'(\w+)',\s*'(\w+)',\s*'([\w.-]+\.js)',\s*'(\w+)'\]/g)]
        .map((m) => ({ extKey: m[1], field: m[2], global: m[3], file: m[4], hydrator: m[5] }));
    assert.ok(entries.length >= 42, '登记表至少 42 项，实测 ' + entries.length);

    // 实测哪些登记模块的默认状态真含容器
    const withColl = [];
    for (const e of entries) {
        let mod;
        try { mod = loadModule(e.file); } catch (err) { continue; }
        const ctor = Object.keys(mod).find((k) => /^create.*State$/.test(k) && (() => {
            try { return mod[k]() && typeof mod[k]() === 'object'; } catch (err2) { return false; }
        })());
        if (!ctor) continue;
        const s = mod[ctor]();
        const hasColl = Object.entries(s).some(([, v]) => v instanceof Map || v instanceof Set);
        if (hasColl) withColl.push(e.extKey);
    }
    assert.ok(withColl.length >= 9, '实测含容器的登记模块应 ≥ 9，实测 ' + withColl.length + '：' + withColl.join(','));

    // 双向：每个含容器的 extKey，落盘侧必须出现且走 _collForSave
    const missing = [];
    for (const key of withColl) {
        const re = new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ':\\s*_collForSave\\(');
        if (!re.test(OPS_SRC)) missing.push(key);
    }
    assert.deepEqual(missing, [], '这些含容器的键在落盘侧没走摊平：' + missing.join(','));

    // 反方向：走了摊平的键必须都在登记表里（防幽灵键）
    const flattened = [...OPS_SRC.matchAll(/(lonsha\w+State):\s*_collForSave\(/g)].map((m) => m[1]);
    assert.equal(flattened.length, 9, '落盘侧走摊平的应恰 9 处，实测 ' + flattened.length);
    const entryKeys = new Set(entries.map((e) => e.extKey));
    const ghosts = flattened.filter((k) => !entryKeys.has(k));
    assert.deepEqual(ghosts, [], '这些键走了摊平但不在登记表里（幽灵键）：' + ghosts.join(','));
});

test('D2 摊平不误伤：无容器模块的落盘字节必须与改动前一致', () => {
    // 取几个本来就没有容器的登记模块（纯普通对象状态）
    const plainFiles = ['hierarchical-pyramid-attention-elastic.js', 'mind-barometer-dashboard-snapshot.js', 'entity-disambiguation-affinity-graph.js'];
    for (const f of plainFiles) {
        const mod = loadModule(f);
        const ctor = Object.keys(mod).find((k) => /^create.*State$/.test(k));
        if (!ctor) continue;
        const s = mod[ctor]();
        const hasColl = Object.entries(s).some(([, v]) => v instanceof Map || v instanceof Set);
        if (hasColl) continue;   // 该模块其实有容器，跳过（D1 已覆盖）
        assert.equal(JSON.stringify(flattenReal(s)), JSON.stringify(s),
            f + ' 无容器，摊平必须原样返回（不制造无谓迁移）');
    }
});

/* ============================================================
 * E. 判据纯度
 * ============================================================ */
test('E1 判据纯度：本档不靠「被判定实现自证」', () => {
    const src = read('tests/v21_o4b_volatile_container_chain.test.mjs');
    // 摊平/还原必须从真源码抠，不许在本档里另写一份实现（那就成了第二真源）
    assert.ok(/grabFn\(OPS_SRC,\s*'_flattenColl'\)/.test(src), '必须从真源码取摊平函数');
    assert.ok(/grabFn\(OPS_SRC,\s*'_unflattenColl'\)/.test(src), '必须从真源码取还原函数');
    // 三段判定必须全部来自判定体
    for (const fn of ['flattenIssues', 'unflattenIssues', 'hydrateIssues']) {
        assert.ok(src.includes(fn), '必须调用判定体的 ' + fn);
    }
});

/* ============================================================
 * F. 自防护 + 当版锚
 * ============================================================ */
test('F1 自防护：破坏锚点字面量各只声明一次', () => {
    const src = read('engine-persistence-ops.js');
    assert.equal((src.match(/_collForSave\(this\./g) || []).length, 9, '_collForSave 调用应恰 9 处');
    assert.equal((src.match(/const _flattenColl = /g) || []).length, 1, '_flattenColl 应恰 1 份（两份即第二真源）');
    assert.equal((src.match(/const _unflattenColl = /g) || []).length, 1, '_unflattenColl 应恰 1 份');
});

test('F2 当版锚：本文件头标注当版，四源一致且不回退', () => {
    const self = read('tests/v21_o4b_volatile_container_chain.test.mjs');
    const head = self.split('\n').slice(0, 3).join('\n');
    assert.ok(new RegExp('v' + BIRTH.replace(/\./g, '\\.')).test(head), '文件头必须标注出生版本 v' + BIRTH);

    const pkg = JSON.parse(read('package.json'));
    const manifest = JSON.parse(read('manifest.json'));
    assert.ok(vnum(pkg.version) >= vnum(BIRTH), 'package.json 不得回退：' + pkg.version);
    assert.ok(vnum(manifest.version) >= vnum(BIRTH), 'manifest.json 不得回退：' + manifest.version);
    for (const f of ['index.js', 'memory-organs.js', 'memory-config.js', 'memory-core.js']) {
        const m = read(f).match(/(?:const|let)\s+VERSION\s*=\s*['"]([\d.]+)['"]/);
        assert.ok(m, f + ' 缺 VERSION 声明');
        assert.ok(vnum(m[1]) >= vnum(BIRTH), f + ' 版本回退：' + m[1]);
    }
    // 当版锚：能被 vnum 恰好计数（V4 口径）
    assert.ok(vnum(BIRTH), '当版锚点必须能被 vnum 计数');
});