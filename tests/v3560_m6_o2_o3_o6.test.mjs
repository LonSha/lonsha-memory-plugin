/**
 * tests/v3560_m6_o2_o3_o6.test.mjs — v3.356.0 第六期批次 B（记忆仓侧）验收
 * M6-O2 记忆问题求解器（evidence-solver.js）
 * M6-O3 可展开的多分辨率记忆（resolution-ladder.js）
 * M6-O6 场景上下文编排（scene-orchestrator.js）
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
import { breakSource } from './_break_kit.mjs';
import { loadBroken, negative } from './_negative_util.mjs';
const SV = require('../evidence-solver.js');
const RL = require('../resolution-ladder.js');
const SO = require('../scene-orchestrator.js');
const VERSION_RE = /const\s+VERSION\s*=\s*'([^']+)'/;
const idxSrc = fs.readFileSync('./index.js', 'utf8');
const svSrc = fs.readFileSync('./evidence-solver.js', 'utf8');
const rlSrc = fs.readFileSync('./resolution-ladder.js', 'utf8');
const soSrc = fs.readFileSync('./scene-orchestrator.js', 'utf8');
const moSrc = fs.readFileSync('./memory-organs.js', 'utf8');
const BORN_V = '3.356.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/* A. 版本锚 */
describe('v3.356.0 版本锚', () => {
    test('A1 VERSION 常量为 3.356.0 或更高', () => {
        const m = VERSION_RE.exec(idxSrc);
        assert.ok(m, 'VERSION 常量未找到');
        assert.ok(vnum(m[1]) >= vnum('3.356.0'));
    });
    test('A2 manifest.json 版本为 3.356.0 或更高且登记三个新模块', () => {
        const man = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
        assert.ok(vnum(man.version) >= vnum('3.356.0'));
        assert.ok(man.extra_js.includes('evidence-solver.js'));
        assert.ok(man.extra_js.includes('resolution-ladder.js'));
        assert.ok(man.extra_js.includes('scene-orchestrator.js'));
    });
    test('A3 自锚常量 BORN_V 恰是当版', () => {
        assert.equal(vnum(BORN_V), vnum('3.356.0'));
    });
    test('A4 三个新内核均暴露统一挂载全局名', () => {
        assert.ok(svSrc.includes('root.LonShaEvidenceSolver = api'));
        assert.ok(rlSrc.includes('root.LonShaResolutionLadder = api'));
        assert.ok(soSrc.includes('root.LonShaSceneOrchestrator = api'));
    });
});

/* B. M6-O2 内核 */
describe('M6-O2 内核（evidence-solver.js）', () => {
    const base = () => ({
        question: '为什么先答应又退出',
        claims: [
            { id: 'c1', text: '甲先答应', actors: ['甲'], evidence: [{ source: 'summary', refId: 's1', stance: 'support', grade: 'primary', floor: 10 }] },
            { id: 'c2', text: '甲随后退出', actors: ['甲'], evidence: [{ source: 'summary', refId: 's2', stance: 'support', grade: 'primary', floor: 20 }], requires: ['c1'] },
            { id: 'c3', text: '乙当时已知情', actors: ['乙'], evidence: [{ source: 'diary', refId: 'd1', stance: 'support', grade: 'primary', floor: 25 }], requires: ['c2'] },
        ],
    });
    test('B1 三处独立原文齐备 -> 整题 answered', () => {
        const r = SV.solve(base());
        assert.equal(r.conclusion.state, 'answered');
        assert.equal(r.independent, 3);
        assert.ok(r.claims.every((c) => c.state === 'answered'));
    });
    test('B2 单命题各连一处也不误判 conditional（整题三处即答）', () => {
        const r = SV.solve(base());
        assert.equal(r.conclusion.state, 'answered');
        assert.ok(r.claims.every((c) => c.independent >= 1));
    });
    test('B3 只有两处独立原文 -> 条件结论，且点名缺这一环', () => {
        const r = SV.solve({
            question: 'x',
            claims: [{ id: 'c1', text: 't', evidence: [
                { source: 'summary', refId: 'a', stance: 'support', grade: 'primary' },
                { source: 'summary', refId: 'b', stance: 'support', grade: 'primary' },
            ] }],
        });
        assert.equal(r.conclusion.state, 'conditional');
        assert.ok(r.conclusion.missing.some((m) => m.why === 'insufficient-independent'));
        assert.equal(r.independent, 2);
    });
    test('B4 三条转载（不同 source、同 refId）只算一处 -> 永远凑不满下限', () => {
        const r = SV.solve({
            question: 'x',
            claims: [{ id: 'c1', text: 't', evidence: [
                { source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' },
                { source: 'diary', refId: 'same', stance: 'support', grade: 'relayed' },
                { source: 'floor', refId: 'same', stance: 'support', grade: 'relayed' },
            ] }],
        });
        assert.equal(r.independent, 1);
        assert.equal(r.conclusion.state, 'conditional');
    });
    test('B5 支持与反证分列：更强反证 -> refuted，且不抹掉支持侧', () => {
        const r = SV.solve({
            question: 'x',
            claims: [{ id: 'c1', text: 't', evidence: [
                { source: 'summary', refId: 's1', stance: 'support', grade: 'secondary' },
                { source: 'diary', refId: 'd1', stance: 'counter', grade: 'primary' },
            ] }],
        });
        assert.equal(r.conclusion.state, 'refuted');
        assert.ok(r.claims[0].support.length);
        assert.ok(r.claims[0].counter.length);
    });
    test('B6 缺连接 -> 条件结论（不静默连上）', () => {
        const r = SV.solve({
            question: 'x',
            claims: [{ id: 'c1', text: 't', requires: ['nope'], evidence: [{ source: 's', refId: 'r', stance: 'support', grade: 'primary' }] }],
        });
        assert.equal(r.conclusion.state, 'conditional');
    });
    test('B7 无支持 -> undecided（不是 refuted）', () => {
        const r = SV.solve({ question: 'x', claims: [{ id: 'c1', text: 't', evidence: [] }] });
        assert.equal(r.claims[0].state, SV.CLAIM_STATES.UNDECIDED);
    });
    test('B8 范围变化后旧证据不进支撑（全量重求，不留旧范围依据）', () => {
        const scoped = SV.solve({
            question: 'x',
            scope: { floorFrom: 50 },
            claims: [{ id: 'c1', text: 't', evidence: [{ source: 's', refId: 'r', stance: 'support', grade: 'primary', floor: 10 }] }],
        });
        assert.equal(scoped.claims[0].supportCount, 0);
    });
    test('B9 revise 改时点后 __raw 携带新 scope（修订后的目标真正持久化）', () => {
        const raw = {
            question: 'q', claims: [{ id: 'c1', text: 't', evidence: [{ source: 'summary', refId: 'a', stance: 'support', grade: 'primary', floor: 10 }] }],
        };
        const base2 = SV.withRaw({ __raw: raw, __opts: {} }, raw, {});
        const out = SV.revise(base2, { floorFrom: 50 });
        assert.equal(out.ok, true);
        assert.ok(out.result.__raw && out.result.__raw.scope);
        assert.equal(out.result.__raw.scope.floorFrom, 50);
        assert.ok(Array.isArray(out.result.__raw.claims) && out.result.__raw.claims.length === 1);
    });
    test('B10 缺双键（source/refId 任一）的证据不可读', () => {
        assert.equal(SV.normalizeEvidence({ source: 's', stance: 'support' }).readable, false);
        assert.equal(SV.normalizeEvidence({ source: 's', refId: 'r' }).readable, false);
    });
    test('B11 同一 source+refId 的重复证据只算一条支持', () => {
        const r = SV.solve({
            question: 'x',
            claims: [{ id: 'c1', text: 't', evidence: [
                { source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' },
                { source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' },
            ] }],
        });
        assert.equal(r.claims[0].supportCount, 1);
    });
});

/* C. M6-O3 内核 */
describe('M6-O3 内核（resolution-ladder.js）', () => {
    const base = () => ([{
        id: 'e1',
        title: '筹展',
        overview: { text: '最后没办成', parentId: 'sum_1', sourceRef: 'sum_1' },
        skeleton: [{ step: '答应', floor: 10, sourceRef: 'ev_1' }, { step: '退出', floor: 30, sourceRef: 'ev_2' }],
        verbatim: [{ source: 'floor', refId: 'f_12', floor: 12, quote: '我答应去' }],
    }]);
    test('C1 概览展开 -> ready 且非孤儿（双键齐）', () => {
        const ov = RL.expand(base(), 'e1', 'overview');
        assert.equal(ov.ok, true);
        assert.equal(ov.state, RL.EXPAND_STATES.READY);
        assert.ok(!ov.orphan);
    });
    test('C2 原话层：源在 -> ready 且标 present', () => {
        const vb = RL.expand(base(), 'e1', 'verbatim', { sourceExists: () => '原话正文' });
        assert.equal(vb.ok, true);
        assert.equal(vb.state, RL.EXPAND_STATES.READY);
        assert.ok(vb.content.items[0].present);
    });
    test('C3 原话层：源不在 -> no-source（不可展开），不是 unexpanded', () => {
        const gone = RL.expand(base(), 'e1', 'verbatim', { sourceExists: () => null });
        assert.equal(gone.state, RL.EXPAND_STATES.NO_SOURCE);
        assert.equal(gone.ok, false);
    });
    test('C4 可展开性：有源未展开 -> unexpanded（与 no-source 分列）', () => {
        const ab = RL.expandability(base(), 'e1');
        assert.equal(ab.state, RL.EXPAND_STATES.UNEXPANDED);
    });
    test('C5 缺 refId 的原话不可读', () => {
        assert.equal(RL.normalizeVerbatim({ source: 'floor' }).readable, false);
    });
    test('C6 同源重复原话只留一条', () => {
        const dup = RL.normalizeEntry({ id: 'x', verbatim: [{ source: 'floor', refId: 'f1' }, { source: 'floor', refId: 'f1' }] });
        assert.equal(dup.verbatim.length, 1);
    });
    test('C7 无双键的概览必须标 orphan', () => {
        const orphan = RL.expand([{ id: 'y', overview: { text: '有个结论' } }], 'y', 'overview');
        assert.equal(orphan.orphan, true);
    });
    test('C8 修订派生层缺双键必须被拒', () => {
        const bad = RL.reviseLevel(base(), 'e1', 'overview', { text: '新结论', parentId: '', sourceRef: '' });
        assert.equal(bad.ok, false);
    });
});

/* D. M6-O6 内核 */
describe('M6-O6 内核（scene-orchestrator.js）', () => {
    const base = () => [{
        id: 'sc1', title: '重逢', stage: 'prepare', actors: ['甲', '乙'], goal: '说清当年的事',
        constraints: ['不能提她'], recallables: ['旧事一'], openQuestions: ['谁先开口'],
        materials: [
            { id: 'm1', source: 'summary', refId: 's1', title: '旧账', viewpoint: 'narrator' },
            { id: 'm2', source: 'diary', refId: 'd1', title: '他的想法', viewpoint: 'actor', actor: '甲' },
        ],
    }];
    test('D1 角色私有视角互不共享（叙述者材料不给角色、角色材料不给他人）', () => {
        const s = SO.normalizeScene(base()[0]);
        const actorPack = SO.materialsFor(s, 'actor', '甲');
        assert.equal(actorPack.materials.length, 1);
        assert.equal(actorPack.materials[0].id, 'm2');
        const other = SO.materialsFor(s, 'actor', '乙');
        assert.equal(other.materials.length, 0);
        const nar = SO.materialsFor(s, 'narrator');
        assert.equal(nar.materials.length, 1);
        assert.equal(nar.materials[0].id, 'm1');
    });
    test('D2 推进后材料变化、幕次前进、硬约束不消失', () => {
        const adv = SO.advance(base(), 'sc1', {
            message: '乙先开口了',
            addedMaterials: [{ id: 'm3', source: 'floor', refId: 'f9', title: '开场', viewpoint: 'narrator' }],
        });
        assert.equal(adv.ok, true);
        assert.ok(adv.changed.added.indexOf('m3') >= 0);
        assert.equal(adv.scene.constraints.length, 1);
        assert.notEqual(adv.scene.stage, 'prepare');
    });
    test('D3 约束只增不减，二次推进后仍在', () => {
        const adv = SO.advance(base(), 'sc1', { message: 'x' });
        const more = SO.advance(adv.list, 'sc1', { message: '继续' });
        assert.equal(more.scene.constraints.length, 1);
    });
    test('D4 显式解除才 released', () => {
        const adv = SO.advance(base(), 'sc1', { message: 'x' });
        const rel = SO.releaseConstraint(adv.list, 'sc1', '不能提她');
        assert.equal(rel.ok, true);
        assert.equal(rel.scene.constraints[0].released, true);
    });
    test('D5 取消即清场，且取消后不得再推进', () => {
        const adv = SO.advance(base(), 'sc1', { message: 'x' });
        const can = SO.cancel(adv.list, 'sc1');
        assert.equal(can.ok, true);
        assert.equal(can.scene.constraints.length, 0);
        assert.equal(can.scene.materials.length, 0);
        assert.equal(can.scene.openQuestions.length, 0);
        assert.equal(can.scene.state, SO.SCENE_STATES.CANCELLED);
        const after = SO.advance(can.list, 'sc1', { message: 'x' });
        assert.equal(after.ok, false);
    });
});

/* E. 宿主接线（源码断言） */
describe('宿主接线（index.js / memory-organs.js）', () => {
    test('E1 三个取库口存在', () => {
        assert.ok(idxSrc.includes('function _evidenceSolverLib()'));
        assert.ok(idxSrc.includes('function _resolutionLadderLib()'));
        assert.ok(idxSrc.includes('function _sceneOrchestratorLib()'));
    });
    test('E2 三个宿主出口存在', () => {
        assert.ok(idxSrc.includes('queryEvidenceSolver(op, payload)'));
        assert.ok(idxSrc.includes('queryResolution(op, payload)'));
        assert.ok(idxSrc.includes('queryScene(op, payload)'));
    });
    test('E3 取库口走 window 全局 + 点名模块文件（降级可归因）', () => {
        assert.ok(idxSrc.includes('window.LonShaEvidenceSolver'));
        assert.ok(idxSrc.includes('window.LonShaResolutionLadder'));
        assert.ok(idxSrc.includes('window.LonShaSceneOrchestrator'));
    });
    test('E4 诊断面新增三行（求解器/分辨率阶梯/场景编排）', () => {
        assert.ok(idxSrc.includes("['求解器'"));
        assert.ok(idxSrc.includes("['分辨率阶梯'"));
        assert.ok(idxSrc.includes("['场景编排'"));
    });
    test('E5 WorldProgress 三子键在构造/export/import 三处齐全', () => {
        assert.ok(moSrc.includes('this.solverThreads = []'));
        assert.ok(moSrc.includes('this.resolutionLadder = []'));
        assert.ok(moSrc.includes('this.scenes = []'));
        assert.ok(moSrc.includes('solverThreads: this.solverThreads || []'));
        assert.ok(moSrc.includes('resolutionLadder: this.resolutionLadder || []'));
        assert.ok(moSrc.includes('scenes: this.scenes || []'));
        assert.ok(moSrc.includes('this.solverThreads = Array.isArray(data.solverThreads) ? data.solverThreads : []'));
        assert.ok(moSrc.includes('this.resolutionLadder = Array.isArray(data.resolutionLadder) ? data.resolutionLadder : []'));
        assert.ok(moSrc.includes('this.scenes = Array.isArray(data.scenes) ? data.scenes : []'));
    });
    test('E6 宿主 revise 必须落盘修订后的 raw（不拿旧 thread.raw 覆盖）', () => {
        const idx = idxSrc.indexOf("if (op === 'revise')");
        const end = idxSrc.indexOf("if (op === 'judge')", idx);
        assert.ok(idx >= 0 && end > idx, 'revise 块未找到');
        const reviseBlock = idxSrc.slice(idx, end);
        assert.ok(reviseBlock.includes('out.result.__raw'), 'revise 须读 out.result.__raw');
        assert.ok(reviseBlock.includes('newRaw'), 'revise 须用 newRaw 落盘');
        assert.ok(!reviseBlock.includes('SV.withRaw(out.result, thread.raw'), '不得再用旧 thread.raw 覆盖 __raw');
        assert.ok(reviseBlock.includes('raw: newRaw'), '落盘 raw 须是新 raw');
    });
    test('E7 原话回源 helper 存在（楼层原话回源）', () => {
        assert.ok(idxSrc.includes('_chatFloorText(floor)'));
        assert.ok(idxSrc.includes('_sourceBody'));
    });
});

/* ================================================================
 * G. 负控制（真源码破坏 → 判据必须变红）
 *   口径：锚点恰中 1 次 → 加载破坏副本 → 在**副本**上重跑同款真判据。
 * ================================================================ */
describe('负控制（M6-O2 真源码破坏）', () => {
    /* 跨命题共享同一 refId：dedup 逐命题生效拦不住，只有整体并集按 refId 才能去重 */
    const relayed = {
        question: 'x',
        claims: [
            { id: 'c1', text: 't1', evidence: [{ source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' }] },
            { id: 'c2', text: 't2', evidence: [{ source: 'diary', refId: 'same', stance: 'support', grade: 'relayed' }] },
        ],
    };
    test('G1 去重键改回 source+refId -> 转载独立原文判据变红', () => {
        const anchor = "const k = e.refId;\n                    if (unionSeen[k]) continue;\n                    unionSeen[k] = 1;\n                    independentTotal += 1;";
        const repl = "const k = e.source + '\\u0001' + e.refId;\n                    if (unionSeen[k]) continue;\n                    unionSeen[k] = 1;\n                    independentTotal += 1;";
        const broken = breakSource(svSrc, anchor, repl, 'independentCount-dedup');
        const mod = loadBroken(broken, 'sv_g1');
        negative(() => mod.solve(relayed).independent === 1, 'G1 转载仍只算一处');
    });
    test('G2 删掉整题独立原文下限 -> 两处原文不再判 conditional', () => {
        const anchor = "} else if (minIndependent != null && minIndependent > 0 && independentTotal < minIndependent) {";
        const repl = "} else if (false) {";
        const broken = breakSource(svSrc, anchor, repl, 'whole-question-floor');
        const mod = loadBroken(broken, 'sv_g2');
        const twoOnly = {
            question: 'x',
            claims: [{ id: 'c1', text: 't', evidence: [
                { source: 'summary', refId: 'a', stance: 'support', grade: 'primary' },
                { source: 'summary', refId: 'b', stance: 'support', grade: 'primary' },
            ] }],
        };
        negative(() => mod.solve(twoOnly).conclusion.state === 'conditional', 'G2 两处仍判 conditional');
    });
    test('G3 去掉命题内 refId 去重 -> 同源两条支持被算成两条', () => {
        const anchor = "const k = e.refId;\n                if (seen[k]) continue;\n                seen[k] = 1;\n                out.push(e);";
        const repl = "const k = 'x' + Math.random();\n                if (seen[k]) continue;\n                seen[k] = 1;\n                out.push(e);";
        const broken = breakSource(svSrc, anchor, repl, 'judgeClaim-dedup');
        const mod = loadBroken(broken, 'sv_g3');
        const dup = {
            question: 'x',
            claims: [{ id: 'c1', text: 't', evidence: [
                { source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' },
                { source: 'summary', refId: 'same', stance: 'support', grade: 'relayed' },
            ] }],
        };
        negative(() => mod.solve(dup).claims[0].supportCount === 1, 'G3 同源仍只算一条');
    });
});
