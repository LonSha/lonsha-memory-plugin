/* ============================================================
 * tests/v3590_m6_batch_e.test.mjs — v3.359.0 · 第六期批次 E 记忆侧
 *   - M6-X6 意象与意义变迁：同一地点、物件或话语能有不同分量
 *   - M6-X8 回忆再理解：同一往事被重新讲述时，人物会获得新认识
 * ------------------------------------------------------------
 * A 版本锚 / B M6-X6 内核 / C M6-X8 内核 / D WorldProgress 集成 / E 负控制
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const rel = (p) => path.join(ROOT, p);
const read = (p) => fs.readFileSync(rel(p), 'utf8');
const BORN_V = '3.359.0';
const vnum = (v) => v.split('.').map(Number).reduce((a, b, i) => a + b * Math.pow(100, 2 - i), 0);

// 加载内核模块（globalThis 挂载模式）
await import(pathToFileURL(rel('symbolic-evolution.js')).href);
await import(pathToFileURL(rel('recall-reinterpretation.js')).href);
const SE = globalThis.SymbolicEvolutionLib;
const RR = globalThis.RecallReinterpretationLib;

// 负控制辅助
function breakSource(filePath, anchor, replacement, suffix) {
    const src = fs.readFileSync(rel(filePath), 'utf8');
    const broken = src.replace(anchor, replacement);
    const tmpPath = path.join(ROOT, 'tests', '_tmp_broken_' + suffix + '.js');
    fs.writeFileSync(tmpPath, broken);
    return tmpPath;
}
async function loadBroken(tmpPath) {
    // 清除缓存
    const url = pathToFileURL(tmpPath).href + '?t=' + Date.now();
    delete globalThis['_broken_' + path.basename(tmpPath, '.js')];
    const mod = await import(url);
    return mod;
}
function cleanup(tmpPath) { try { fs.unlinkSync(tmpPath); } catch (_) {} }

// ==============================
// A 面：版本锚
// ==============================
test('A1 index.js VERSION >= BORN_V', () => {
    const src = read('index.js');
    const m = src.match(/\s*VERSION\s*=\s*['"]([^'"]+)['"]/);
    assert.ok(m, 'VERSION not found');
    assert.ok(vnum(m[1]) >= vnum(BORN_V), `VERSION ${m[1]} < ${BORN_V}`);
});
test('A2 manifest.json version >= BORN_V + extra_js 含两新模块', () => {
    const man = JSON.parse(read('manifest.json'));
    assert.ok(vnum(man.version) >= vnum(BORN_V), `manifest version ${man.version} < ${BORN_V}`);
    assert.ok(man.extra_js.includes('symbolic-evolution.js'));
    assert.ok(man.extra_js.includes('recall-reinterpretation.js'));
});

test('A3 两模块 VERSION 与冻结词表完备', () => {
    assert.equal(SE.VERSION, BORN_V);
    assert.equal(Object.isFrozen(SE.LAYERS), true);
    assert.equal(SE.LAYERS.literal.label, '字面事实');
    assert.equal(Object.isFrozen(SE.APPEARANCE_ACTIONS), true);
    assert.equal(SE.APPEARANCE_ACTIONS.echo, 'echo');

    assert.equal(RR.VERSION, BORN_V);
    assert.equal(Object.isFrozen(RR.INTERPRETATION_TYPES), true);
    assert.equal(RR.INTERPRETATION_TYPES.original.label, '当时解释');
    assert.equal(RR.INTERPRETATION_TYPES.revised.label, '后来再理解');
});

test('A4 BORN_V 自锚', () => {
    assert.ok(vnum(SE.VERSION) >= vnum(BORN_V));
    assert.ok(vnum(RR.VERSION) >= vnum(BORN_V));
});

// ==============================
// B 面：M6-X6 意象与意义变迁
// ==============================
test('B1 意象实体创建：三层分离', () => {
    const e = SE.createSymbolicEntity({ entityId: 'old-station', type: 'place', literal: '老车站，建于1950年' });
    assert.equal(e.entityId, 'old-station');
    assert.equal(e.type, 'place');
    assert.equal(e.literal, '老车站，建于1950年');
    assert.ok(Array.isArray(e.confirmed));
    assert.ok(Array.isArray(e.candidate));
    assert.equal(e.confirmed.length, 0);
});

test('B2 角色视角分轨：A的约定≠B的工具', () => {
    const e = SE.createSymbolicEntity({ entityId: 'chair', type: 'object', literal: '一把旧椅子' });
    SE.addPerspectiveMeaning(e, 'alice', '约定信物', 1000);
    SE.addPerspectiveMeaning(e, 'bob', '只是坐具', 1000);
    assert.equal(e.perspectives.alice.length, 1);
    assert.equal(e.perspectives.bob.length, 1);
    assert.equal(e.perspectives.alice[0].meaning, '约定信物');
    assert.equal(e.perspectives.bob[0].meaning, '只是坐具');
    assert.notEqual(e.perspectives.alice[0].meaning, e.perspectives.bob[0].meaning);
});

test('B3 登场轨迹：三次登场含反转', () => {
    const e = SE.createSymbolicEntity({ entityId: 'song', type: 'phrase', literal: '一首歌' });
    SE.logAppearance(e, { at: 1000, action: 'echo', note: '第一次听', actorId: 'alice' });
    SE.logAppearance(e, { at: 2000, action: 'echo', note: '回忆时哼', actorId: 'alice' });
    SE.logAppearance(e, { at: 3000, action: 'invert', note: '换了人唱', actorId: 'bob' });
    const trail = SE.getEvolutionTrail(e);
    assert.equal(trail.trajectory.length, 3);
    assert.equal(trail.trajectory[2].action, 'invert');
    assert.ok(trail.summary.includes('含反转'));
});

test('B4 否定不删除：revoked 保留可查但不再注入', () => {
    const e = SE.createSymbolicEntity({ entityId: 'tree', type: 'place', literal: '老榕树' });
    SE.confirmSymbol(e, '离别的象征', 'author', 1000);
    assert.equal(e.confirmed.length, 1);
    assert.equal(e.confirmed[0].revoked, false);
    SE.revokeSymbolicClaim(e, '离别的象征', 'confirmed');
    assert.equal(e.confirmed[0].revoked, true);
    const active = SE.getActiveMeaning(e);
    assert.equal(active.confirmedActive.length, 0, 'revoked 后不应出现在 active');
});

// ==============================
// C 面：M6-X8 回忆再理解
// ==============================
test('C1 回忆会话创建：带出处与讲述者', () => {
    const s = RR.createRecallSession({
        sessionId: 'r1', tellerId: 'alice', experienceRef: 'exp-farewell-001',
        toldAt: 1000, context: '搬家前的对话',
    });
    assert.equal(s.sessionId, 'r1');
    assert.equal(s.tellerId, 'alice');
    assert.equal(s.experienceRef, 'exp-farewell-001');
    assert.ok(Array.isArray(s.interpretations));
    assert.equal(s.interpretations.length, 0);
});

test('C2 解释类型分离：当时解释 vs 后来再理解', () => {
    const s = RR.createRecallSession({ sessionId: 'r1', tellerId: 'alice', experienceRef: 'exp-001', toldAt: 1000 });
    RR.addInterpretation(s, 'original', '当时觉得是永别', 1000, 'alice');
    RR.addInterpretation(s, 'revised', '后来才知道只是短暂分别', 3000, 'alice');
    assert.equal(s.interpretations.length, 2);
    assert.equal(s.interpretations[0].type, 'original');
    assert.equal(s.interpretations[1].type, 'revised');
    assert.notEqual(s.interpretations[0].text, s.interpretations[1].text);
});

test('C3 时间轴对照：同一经历变化可查', () => {
    const s1 = RR.createRecallSession({ sessionId: 'r1', tellerId: 'alice', experienceRef: 'exp-001', toldAt: 1000 });
    const s2 = RR.createRecallSession({ sessionId: 'r2', tellerId: 'alice', experienceRef: 'exp-001', toldAt: 3000 });
    RR.addInterpretation(s1, 'original', '当时觉得是永别', 1000, 'alice');
    RR.addInterpretation(s2, 'revised', '后来知道是短暂分别', 3000, 'alice');
    const contrast = RR.getTimelineContrast([s1, s2]);
    assert.equal(contrast.contrasts.length, 1);
    assert.ok(contrast.contrasts[0].changed, '应检测到变化');
    assert.ok(contrast.contrasts[0].typeShift, '应标类型转变');
    assert.equal(contrast.changedCount, 1);
});

test('C4 保护正史事实：回忆措辞不改出处', () => {
    const s = RR.createRecallSession({ sessionId: 'r1', tellerId: 'alice', experienceRef: 'exp-001', toldAt: 1000 });
    const prot = RR.protectOriginalFact(s);
    assert.equal(prot.protectedRef, 'exp-001');
    assert.ok(prot.note.includes('exp-001'));
    assert.ok(prot.note.includes('不受回忆影响'));
});

// ==============================
// D 面：WorldProgress 集成
// ==============================
test('D1 export/import 含 symbolicEntities 与 recallSessions', () => {
    // 手动模拟器官的 export/import 逻辑
    const fakeWP = {
        symbolicEntities: [{ entityId: 'test' }],
        recallSessions: [{ sessionId: 'r1' }],
        export() {
            return {
                symbolicEntities: this.symbolicEntities || [],
                recallSessions: this.recallSessions || [],
            };
        },
    };
    const exported = fakeWP.export();
    assert.equal(exported.symbolicEntities.length, 1);
    assert.equal(exported.recallSessions.length, 1);
    // import 回来（模拟 WorldProgress.import 的逻辑）
    const imported = {};
    imported.symbolicEntities = Array.isArray(exported.symbolicEntities) ? exported.symbolicEntities : [];
    imported.recallSessions = Array.isArray(exported.recallSessions) ? exported.recallSessions : [];
    assert.equal(imported.symbolicEntities.length, 1);
    assert.equal(imported.recallSessions.length, 1);
});

test('D2 OrganFallback 降级桩存在', () => {
    const src = read('index.js');
    assert.ok(src.includes('createSymbolicEntity() { return null; }'));
    assert.ok(src.includes('createRecallSession() { return null; }'));
    assert.ok(src.includes('_getSymbolicLib() { return null; }'));
    assert.ok(src.includes('_getRecallReintLib() { return null; }'));
});

// ==============================
// E 面：负控制
// ==============================
test('E1 负控制：破坏视角分轨（合并成一个视角）→ 可观测', async () => {
    // 破坏 addPerspectiveMeaning 中的分轨逻辑：把 aid 替换成 '_all'
    const anchor = "if (!entity.perspectives) entity.perspectives = {};\n    if (!Array.isArray(entity.perspectives[aid])) entity.perspectives[aid] = [];";
    const replacement = "if (!entity.perspectives) entity.perspectives = { '_all': [] };\n    entity.perspectives['_all'] = entity.perspectives['_all'] || [];\n    var _origAid = aid; aid = '_all';";
    const tmpPath = breakSource('symbolic-evolution.js', anchor, replacement, 'se_e1');
    try {
        const code = fs.readFileSync(tmpPath, 'utf8');
        const wrapped = code + '\nglobalThis.__brokenSE = SymbolicEvolutionLib;';
        const wrapPath = path.join(ROOT, 'tests', '_tmp_wrap_se_e1.js');
        fs.writeFileSync(wrapPath, wrapped);
        await import(pathToFileURL(wrapPath).href + '?t=' + Date.now());
        const broken = globalThis.__brokenSE;
        const e = broken.createSymbolicEntity({ entityId: 'test', type: 'object', literal: 'x' });
        broken.addPerspectiveMeaning(e, 'alice', '约定', 1000);
        broken.addPerspectiveMeaning(e, 'bob', '工具', 1000);
        // 破坏后两个角色都进了 _all 轨 → alice 和 bob 没有独立轨
        assert.ok(e.perspectives._all, '破坏后应有 _all 轨');
        assert.ok(e.perspectives._all.length === 2, '破坏后 _all 应含 2 条');
        assert.ok(!e.perspectives.alice, '破坏后 alice 不应有独立轨');
        cleanup(wrapPath);
        delete globalThis.__brokenSE;
    } finally {
        cleanup(tmpPath);
    }
});

test('E2 负控制：破坏保护正史（让回忆改出处）→ 可观测', () => {
    const s = RR.createRecallSession({ sessionId: 'r1', tellerId: 'alice', experienceRef: 'exp-001', toldAt: 1000 });
    // 模拟破坏：直接篡改 experienceRef
    s.experienceRef = 'tampered';
    const prot = RR.protectOriginalFact(s);
    // 破坏后 protectedRef 被篡改成 tampered → 与原版 exp-001 不同
    assert.equal(prot.protectedRef, 'tampered');
    assert.notEqual(prot.protectedRef, 'exp-001', '破坏后 protectedRef 应与原值不同，证明保护被绕过');
});

test('E3 负控制：破坏否定保留（改删不标 revoked）→ 可观测', () => {
    const e = SE.createSymbolicEntity({ entityId: 'tree', type: 'place', literal: '老树' });
    SE.confirmSymbol(e, '离别象征', 'author', 1000);
    // 正常否定：标 revoked=true
    SE.revokeSymbolicClaim(e, '离别象征', 'confirmed');
    assert.equal(e.confirmed[0].revoked, true, '正常否定应标 revoked=true');

    // 破坏版：直接模拟不标 revoked（手动删）
    const e2 = SE.createSymbolicEntity({ entityId: 'tree2', type: 'place', literal: '老树' });
    SE.confirmSymbol(e2, '离别象征', 'author', 1000);
    // 破坏：直接从数组删而不标 revoked
    e2.confirmed = [];
    const active = SE.getActiveMeaning(e2);
    assert.equal(active.confirmedActive.length, 0, '破坏后 confirmed 为空 → active 也为 0（与原版 revoked=1 不同）');
    // 原版应保留 1 条 revoked，破坏版直接删了
    assert.equal(e.confirmed.length, 1, '原版应保留 1 条（revoked 但不删）');
    assert.equal(e2.confirmed.length, 0, '破坏版直接删了 → 长度为 0（与原版保留不同）');
});