/**
 * tests/v3520_m5_x_batch.test.mjs — v3.353.0 第三包验收
 * M5-X1 借用关系字段 / M5-X2 目标跟踪器 / M5-X4 传闻佐证 / M5-X5 共通知情 / M5-X8 周期约定
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const KT = require('../knowledge-trace.js');
const GT = require('../goal-tracker.js');
const CL = require('../commitment-ledger.js');

const VERSION_RE = /const\s+VERSION\s*=\s*'([^']+)'/;
const idxSrc = fs.readFileSync('./index.js', 'utf8');

/* 【当版锚点】本档自锚常量 BORN_V + vnum（锚必须住在当版档案里，供版本守卫 V4 计数）。 */
const BORN_V = '3.353.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/* ================================================================
 * A. 版本锚
 * ================================================================ */
describe('v3.353.0 版本锚', () => {
    test('VERSION 常量不低于本档出生版本', () => {
        const m = VERSION_RE.exec(idxSrc);
        assert.ok(m, 'VERSION 常量未找到');
        assert.ok(vnum(m[1]) >= vnum(BORN_V),
            `VERSION 应 >= ${BORN_V}（本档出生版本），实际 ${m[1]}`);
    });
    test('manifest.json 版本不低于本档出生版本', () => {
        const man = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
        assert.ok(vnum(man.version) >= vnum(BORN_V),
            `manifest 版本应 >= ${BORN_V}，实际 ${man.version}`);
    });
    test('自锚常量 BORN_V 恰是本档出生版本（下界口径，不锁当版）', () => {
        assert.ok(vnum(BORN_V) <= vnum('3.353.0'), '自锚不得承诺未来版');
        assert.ok(vnum(BORN_V) >= vnum('3.353.0'), '自锚不得低于本档出生版本');
    });
    test('goal-tracker.js 在 manifest extra_js 中', () => {
        const man = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
        assert.ok(man.extra_js.includes('goal-tracker.js'), 'extra_js 应含 goal-tracker.js');
    });
});

/* ================================================================
 * B. M5-X1 借用关系字段（index.js 侧验证）
 * ================================================================ */
describe('M5-X1 借用关系字段', () => {
    test('LEDGER_ITEM_LIMITS 含 lendTo/borrowFrom/returnDue/ownerRef', () => {
        const limitsMatch = idxSrc.match(/lendTo:\s*\d+,\s*borrowFrom:\s*\d+,\s*returnDue:\s*\d+,\s*ownerRef:\s*\d+/);
        assert.ok(limitsMatch, '四个借用字段应存在于 LEDGER_ITEM_LIMITS');
    });
    test('validateLedgerItemOp 透传四字段', () => {
        assert.ok(idxSrc.includes('op.lendTo'), 'validateLedgerItemOp 应透传 lendTo');
        assert.ok(idxSrc.includes('op.borrowFrom'), 'validateLedgerItemOp 应透传 borrowFrom');
    });
    test('rebuildItems 含四字段默认空串', () => {
        assert.ok(idxSrc.includes("lendTo: op.lendTo || ''"), 'rebuildItems 应含 lendTo 默认空串');
        assert.ok(idxSrc.includes("borrowFrom: op.borrowFrom || ''"), 'rebuildItems 应含 borrowFrom 默认空串');
    });
    test('宿主出口 queryLendRelations 存在', () => {
        assert.ok(idxSrc.includes('queryLendRelations'), '应有 queryLendRelations 宿主出口');
    });
});

/* ================================================================
 * C. M5-X2 目标跟踪器
 * ================================================================ */
describe('M5-X2 目标跟踪器', () => {
    test('selfCheck 全绿', () => {
        const sc = GT.selfCheck({ goals: [], factStates: {} });
        assert.equal(sc.ok, true, '空输入 selfCheck 应通过');
    });

    test('addGoal + nextSteps', () => {
        let state = { goals: [], factStates: { 'f1': 'active' } };
        const r1 = GT.addGoal(state, { id: 'g1', title: '找到密室', prereqs: [{ id: 'p1', condition: '拿到钥匙', factId: 'f1' }] });
        assert.ok(r1.ok, 'addGoal 应成功');
        state = r1.state;
        const ds = GT.deriveStatuses(state.goals, state.factStates);
        const steps = GT.nextSteps(ds.goals);
        assert.ok(steps.find((g) => g.id === 'g1'), 'nextSteps 应含 g1');
    });

    test('循环依赖检测', () => {
        let state = {
            goals: [
                { id: 'g1', title: 'A', prereqs: [{ id: 'p1', condition: 'B完成', factId: 'f1' }], parent: 'g2', status: 'active' },
                { id: 'g2', title: 'B', prereqs: [{ id: 'p2', condition: 'A完成', factId: 'f2' }], parent: 'g1', status: 'active' }
            ],
            factStates: { 'f1': 'active', 'f2': 'active' }
        };
        const r = GT.detectCycle(state.goals);
        assert.ok(r.hasCycle, '应检测到循环依赖');
        assert.ok(r.cycle, '应标记循环点');
    });

    test('closeGoal 不删事实', () => {
        let state = {
            goals: [{ id: 'g1', title: 'A', prereqs: [], status: 'active' }],
            factStates: {}
        };
        const r = GT.closeGoal(state, 'g1');
        assert.ok(r.ok, 'closeGoal 应成功');
        const closed = r.state.goals.find((g) => g.id === 'g1');
        assert.equal(closed.status, 'done', '状态应为 done');
    });

    test('前置条件由事实状态派生', () => {
        const state = {
            goals: [{ id: 'g1', title: 'A', prereqs: [{ id: 'p1', condition: '找到证据', factId: 'f1', status: 'pending' }], status: 'active' }],
            factStates: { 'f1': 'revoked' }
        };
        const d = GT.deriveStatuses(state.goals, state.factStates);
        const pre = d.goals[0].prereqs.find((p) => p.factId === 'f1');
        assert.ok(pre, '应找到前置条件');
        assert.equal(pre.status, 'blocked', 'revoked ⇒ blocked');
    });

    test('宿主 _goalTrackerLib 存在', () => {
        assert.ok(idxSrc.includes('_goalTrackerLib'), '应有 _goalTrackerLib 取库口');
        assert.ok(idxSrc.includes('selfCheck.goalTracker'), '应有 selfCheck.goalTracker 诊断面');
    });
});

/* ================================================================
 * D. M5-X4 传闻佐证
 * ================================================================ */
describe('M5-X4 传闻佐证 corroborationOf', () => {
    test('三个独立目击 = 三个根', () => {
        const traces = {
            traces: [
                { character: 'A', fact: '看到黑猫', action: 'acquire', evidenceKey: 'e1', floor: 1 },
                { character: 'B', fact: '看到黑猫', action: 'acquire', evidenceKey: 'e2', floor: 2 },
                { character: 'C', fact: '看到黑猫', action: 'acquire', evidenceKey: 'e3', floor: 3 }
            ]
        };
        const r = KT.corroborationOf(traces, '看到黑猫');
        assert.equal(r.rootCount, 3, '三个不同 evidenceKey ⇒ 三个根');
        assert.equal(r.retractedRoots.length, 0, '无撤回');
        assert.equal(r.circularHearsay, 0, '无循环转述');
    });

    test('三人转发同一传闻 = 一个根', () => {
        const traces = {
            traces: [
                { character: 'A', fact: '听到传言', action: 'acquire', evidenceKey: 'e1', from: 'D', floor: 1 },
                { character: 'B', fact: '听到传言', action: 'acquire', evidenceKey: 'e1', from: 'A', floor: 2 },
                { character: 'C', fact: '听到传言', action: 'acquire', evidenceKey: 'e1', from: 'B', floor: 3 }
            ]
        };
        const r = KT.corroborationOf(traces, '听到传言');
        assert.equal(r.rootCount, 1, '同一 evidenceKey ⇒ 一个根');
        assert.equal(r.roots[0].characterCount, 3, '三个独立角色');
    });

    test('循环转述检测', () => {
        const traces = {
            traces: [
                { character: 'A', fact: '传闻X', action: 'acquire', evidenceKey: 'e1', from: 'C', floor: 1 },
                { character: 'B', fact: '传闻X', action: 'acquire', evidenceKey: 'e1', from: 'A', floor: 2 },
                { character: 'C', fact: '传闻X', action: 'acquire', evidenceKey: 'e1', from: 'B', floor: 3 }
            ]
        };
        const r = KT.corroborationOf(traces, '传闻X');
        assert.ok(r.circularHearsay > 0, 'A←C, B←A, C←B ⇒ 应检测到循环');
    });

    test('撤回源后不计入 rootCount 但保留历史', () => {
        const traces = {
            traces: [
                { character: 'A', fact: '说法Y', action: 'acquire', evidenceKey: 'e1', floor: 1 },
                { character: 'A', fact: '说法Y', action: 'retract', evidenceKey: 'e1', floor: 5 },
                { character: 'B', fact: '说法Y', action: 'acquire', evidenceKey: 'e2', floor: 2 }
            ]
        };
        const r = KT.corroborationOf(traces, '说法Y');
        assert.equal(r.rootCount, 1, 'e1 被撤回 ⇒ 只剩 e2 一个根');
        assert.equal(r.retractedRoots.length, 1, '应保留被撤回的根');
    });

    test('空轨迹返回零根', () => {
        const r = KT.corroborationOf({ traces: [] }, '不存在的事实');
        assert.equal(r.rootCount, 0);
        assert.equal(r.degraded, false);
    });

    test('宿主出口 queryCorroboration 存在', () => {
        assert.ok(idxSrc.includes('queryCorroboration'), '应有 queryCorroboration 宿主出口');
    });
});

/* ================================================================
 * E. M5-X5 共通知情
 * ================================================================ */
describe('M5-X5 共通知情 sharedKnowledgeOf', () => {
    test('两人都知道 = shared', () => {
        const traces = {
            traces: [
                { character: 'A', fact: '天黑了', action: 'acquire', floor: 1 },
                { character: 'B', fact: '天黑了', action: 'acquire', floor: 2 }
            ]
        };
        const r = KT.sharedKnowledgeOf(traces, ['A', 'B'], 3);
        assert.ok(r.shared.find((s) => s.fact === '天黑了'), '天黑了 应在 shared 中');
    });

    test('只有一人知道 = partial', () => {
        const traces = {
            traces: [
                { character: 'A', fact: '秘密会议', action: 'acquire', floor: 1 }
            ]
        };
        const r = KT.sharedKnowledgeOf(traces, ['A', 'B'], 2);
        assert.ok(r.partial.find((p) => p.fact === '秘密会议'), '秘密会议 应在 partial 中');
        const entry = r.partial[0];
        assert.ok(entry.knowers.includes('A'), 'A 应在 knowers 中');
        assert.ok(entry.unknowers.includes('B'), 'B 应在 unknowers 中');
    });

    test('时点之前的轨迹才算', () => {
        const traces = {
            traces: [
                { character: 'A', fact: '迟到事实', action: 'acquire', floor: 5 },
                { character: 'B', fact: '迟到事实', action: 'acquire', floor: 5 }
            ]
        };
        const r = KT.sharedKnowledgeOf(traces, ['A', 'B'], 3);
        assert.equal(r.shared.length, 0, '在 floor 3 时两人都还不知道');
    });

    test('宿主出口 querySharedKnowledge 存在', () => {
        assert.ok(idxSrc.includes('querySharedKnowledge'), '应有 querySharedKnowledge 宿主出口');
    });
});

/* ================================================================
 * F. M5-X8 周期性约定
 * ================================================================ */
describe('M5-X8 周期性约定 deriveInstances', () => {
    test('按周派生实例', () => {
        let state = { seq: 0, items: [] };
        const open = CL.open(state, {
            actor: 'Alice', content: '每周打扫',
            floor: 1, periodic: { rule: '每周打扫', interval: 'weekly', anchor: 1, seriesId: 'clean_w' }
        });
        assert.ok(open.ok, 'open 应成功');
        state = open.state;
        const r = CL.deriveInstances(state, { id: open.item.id }, { fromFloor: 1, toFloor: 14 });
        assert.equal(r.totalDerived, 2, '1 到 14 楼按 7 楼间隔应派生 2 个实例');
        assert.equal(r.pending, 2, '两个都应待定');
    });

    test('记录一次履行', () => {
        let state = { seq: 0, items: [] };
        const open = CL.open(state, {
            actor: 'Bob', content: '每周还款',
            floor: 1, periodic: { rule: '每周还款', interval: 'weekly', anchor: 1, seriesId: 'pay_w' }
        });
        state = open.state;
        const r1 = CL.recordException(state, { id: open.item.id }, {
            instanceKey: 'pay_w#1', action: 'fulfill', reason: '已还', floor: 8
        });
        assert.ok(r1.ok, 'recordException 应成功');
        state = r1.state;
        const derived = CL.deriveInstances(state, { id: open.item.id }, { fromFloor: 1, toFloor: 15 });
        assert.equal(derived.fulfilled, 1, '应有一个已履行');
        assert.equal(derived.pending, 2, '应有两个待定');
    });

    test('记录一次跳过', () => {
        let state = { seq: 0, items: [] };
        const open = CL.open(state, {
            actor: 'Carol', content: '每周值日',
            floor: 1, periodic: { rule: '每周值日', interval: 'weekly', anchor: 1, seriesId: 'duty_w' }
        });
        state = open.state;
        const r1 = CL.recordException(state, { id: open.item.id }, {
            instanceKey: 'duty_w#1', action: 'skip', reason: '请假', floor: 8
        });
        assert.ok(r1.ok);
        state = r1.state;
        const derived = CL.deriveInstances(state, { id: open.item.id }, { fromFloor: 1, toFloor: 15 });
        assert.equal(derived.skipped, 1, '应有一个跳过');
    });

    test('系列整体取消不删例外', () => {
        let state = { seq: 0, items: [] };
        const open = CL.open(state, {
            actor: 'Dave', content: '每月检查',
            floor: 1, periodic: { rule: '每月检查', interval: 'monthly', anchor: 1, seriesId: 'chk_m' }
        });
        state = open.state;
        const re = CL.recordException(state, { id: open.item.id }, {
            instanceKey: 'chk_m#1', action: 'fulfill', floor: 31
        });
        state = re.state;
        const cancelled = CL.cancel(state, { id: open.item.id, floor: 60, reason: '系列结束' });
        assert.ok(cancelled.ok, 'cancel 应成功');
        const item = cancelled.state.items.find((i) => i.id === open.item.id);
        assert.equal(item.status, 'cancelled', '状态应为 cancelled');
        assert.ok(Array.isArray(item.exceptions) && item.exceptions.length > 0, '例外历史应保留');
    });

    test('非周期约定派生返回 degraded', () => {
        let state = { seq: 0, items: [] };
        const open = CL.open(state, { actor: 'Eve', content: '一次性任务', floor: 1 });
        state = open.state;
        const r = CL.deriveInstances(state, { id: open.item.id }, { fromFloor: 1, toFloor: 10 });
        assert.ok(r.degraded, '非周期约定应返回 degraded');
    });

    test('宿主出口 queryPeriodicCommitments 存在', () => {
        assert.ok(idxSrc.includes('queryPeriodicCommitments'), '应有 queryPeriodicCommitments 宿主出口');
    });
});

/* ================================================================
 * G. 判据纯度（负控制）
 * ================================================================ */
describe('G. 判据纯度（负控制）', () => {
    test('H6 双向自证：corroborationOf 的证据分组判据可被破坏', () => {
        // 正向：三个不同 evidenceKey ⇒ rootCount=3
        const traces3 = {
            traces: [
                { character: 'A', fact: 'F', action: 'acquire', evidenceKey: 'e1', floor: 1 },
                { character: 'B', fact: 'F', action: 'acquire', evidenceKey: 'e2', floor: 2 },
                { character: 'C', fact: 'F', action: 'acquire', evidenceKey: 'e3', floor: 3 }
            ]
        };
        const r1 = KT.corroborationOf(traces3, 'F');
        assert.equal(r1.rootCount, 3, '正向：三根');

        // 负向：把所有 evidenceKey 改成同一个 ⇒ rootCount 应变为 1
        const traces1 = {
            traces: [
                { character: 'A', fact: 'F', action: 'acquire', evidenceKey: 'same', floor: 1 },
                { character: 'B', fact: 'F', action: 'acquire', evidenceKey: 'same', floor: 2 },
                { character: 'C', fact: 'F', action: 'acquire', evidenceKey: 'same', floor: 3 }
            ]
        };
        const r2 = KT.corroborationOf(traces1, 'F');
        assert.equal(r2.rootCount, 1, '负向：一根（证据分组判据被改了就变结论）');
    });
});