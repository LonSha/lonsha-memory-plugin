import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');

test('=== 1. A: 提取 prompt 新增 WorldProgress 字段 ===', () => {
    assert.ok(src.includes('9h. promises：'), 'promises 字段规则');
    assert.ok(src.includes('9i. plot_arcs：'), 'plot_arcs 字段规则');
    assert.ok(src.includes('9j. knowledge_changes：'), 'knowledge_changes 字段规则');
    assert.ok(src.includes('9k. promises_resolve：'), 'promises_resolve 字段规则');
    // JSON schema 示例也声明
    assert.ok(src.includes('"promises": [{"character": "承诺者主名"'), 'schema promises 示例');
    assert.ok(src.includes('"plot_arcs": [{"action": "add"'), 'schema plot_arcs 示例');
    assert.ok(src.includes('"knowledge_changes": [{"action": "unaware"'), 'schema knowledge_changes 示例');
});

test('=== 2. B: WorldProgress.addPromise 规范化（空内容不入账 + 幂等合并） ===', () => {
    const addPromise = (promises, p) => {
        const character = String(p.character || '通用').trim().slice(0, 40) || '通用';
        const content = String(p.content || '').trim().slice(0, 180);
        if (!content) return null;
        const old = promises.find(x => x.character === character && x.content === content && x.status !== 'fulfilled' && x.status !== 'broken');
        if (old) {
            if (Number.isFinite(Number(p.deadlineFloor)) && Number(p.deadlineFloor) > 0) old.deadlineFloor = Number(p.deadlineFloor);
            if (Number.isFinite(Number(p.floor))) old.floor = Number(p.floor);
            return old;
        }
        const deadline = Number(p.deadlineFloor);
        const prom = {
            id: 'prom_x',
            character, content,
            deadlineFloor: Number.isFinite(deadline) && deadline > 0 ? deadline : 9999,
            floor: Number(p.floor) || 0,
            status: 'pending',
            createdAt: Date.now()
        };
        promises.push(prom);
        return prom;
    };
    const list = [];
    // 空内容不入账
    assert.strictEqual(addPromise(list, { character: 'A', content: '   ' }), null);
    assert.strictEqual(list.length, 0, '空内容不入账');
    // 正常新增
    const p1 = addPromise(list, { character: '爱丽丝', content: '还书', deadlineFloor: 15, floor: 5 });
    assert.strictEqual(list.length, 1);
    assert.strictEqual(p1.deadlineFloor, 15, '截止楼层保留');
    // 同角色同内容合并（不新增）
    const p2 = addPromise(list, { character: '爱丽丝', content: '还书', deadlineFloor: 20, floor: 8 });
    assert.strictEqual(list.length, 1, '同内容幂等');
    assert.strictEqual(list[0].deadlineFloor, 20, '截止楼层更新');
    // 不同内容新增
    addPromise(list, { character: '爱丽丝', content: '送信' });
    assert.strictEqual(list.length, 2);
});

test('=== 3. B: WorldProgress.addPlotArc 合并 ===', () => {
    const addPlotArc = (plotArcs, arc) => {
        const title = String(arc.title || '支线').trim().slice(0, 80) || '支线';
        const clue = String(arc.clue || '').trim().slice(0, 180);
        const currentFloor = Number(arc.currentFloor) || 0;
        const existing = plotArcs.find(a => a.title === title && (clue ? a.clue === clue : true));
        if (existing) {
            existing.status = 'active';
            existing.lastActiveFloor = currentFloor || existing.lastActiveFloor;
            if (arc.interestedBy) existing.interestedBy = String(arc.interestedBy).slice(0, 40);
            return existing;
        }
        const entry = { id: 'arc_x', title, clue, lastActiveFloor: currentFloor, createdFloor: Number(arc.createdFloor) || currentFloor, status: 'active', interestedBy: String(arc.interestedBy || '').slice(0, 40) };
        plotArcs.push(entry);
        return entry;
    };
    const list = [];
    const a1 = addPlotArc(list, { title: '调查异变', clue: '湖水有怪', interestedBy: '琪露诺', currentFloor: 5 });
    assert.strictEqual(a1.createdFloor, 5, 'createdFloor 记录');
    assert.strictEqual(list.length, 1);
    // 同标题同线索合并
    const a2 = addPlotArc(list, { title: '调查异变', clue: '湖水有怪', currentFloor: 10 });
    assert.strictEqual(list.length, 1, '同标题同线索合并');
    assert.strictEqual(list[0].lastActiveFloor, 10, '触碰刷新 lastActive');
    // 新线索新增
    addPlotArc(list, { title: '调查异变', clue: '怪物现身', currentFloor: 12 });
    assert.strictEqual(list.length, 2);
});

test('=== 4. C: WorldProgress 楼层生命周期（removeByFloor/shiftFloorRefs） ===', () => {
    const removeByFloor = (wp, floor) => {
        const f = Number(floor);
        if (!Number.isFinite(f)) return 0;
        let removed = 0;
        const beforePromises = wp.promises.length;
        wp.promises = wp.promises.filter(p => Number(p.floor) !== f);
        removed += beforePromises - wp.promises.length;
        for (const key of Object.keys(wp.active || {})) {
            if (Number(wp.active[key]?.floor) === f) { delete wp.active[key]; removed++; }
        }
        const beforeArcs = wp.plotArcs.length;
        wp.plotArcs = wp.plotArcs.filter(a => Number(a.createdFloor) !== f);
        removed += beforeArcs - wp.plotArcs.length;
        for (const a of wp.plotArcs) {
            if (Number(a.lastActiveFloor) === f) a.lastActiveFloor = Math.max(0, f - 1);
            if (Number(a.resolutionFloor) === f) { a.status = 'active'; delete a.resolutionFloor; delete a.resolutionReason; }
        }
        if (Number(wp.pendingWrite?.floor) === f) wp.pendingWrite = null;
        return removed;
    };
    const shiftFloorRefs = (wp, deleted) => {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        const dec = (value, allowSentinel = false) => {
            const n = Number(value);
            if (!Number.isFinite(n) || n <= del || (allowSentinel && n >= 9999)) return value;
            return n - 1;
        };
        let shifted = 0;
        for (const p of wp.promises) {
            const old = p.floor;
            p.floor = dec(p.floor);
            if (p.floor !== old) shifted++;
            p.deadlineFloor = dec(p.deadlineFloor, true);
        }
        return shifted;
    };
    // removeByFloor：来源楼被删 → 该楼承诺清空
    const wp1 = { promises: [{ floor: 3, content: 'A' }, { floor: 7, content: 'B' }], active: { X: { floor: 3 } }, plotArcs: [{ createdFloor: 3, lastActiveFloor: 5 }, { createdFloor: 7, lastActiveFloor: 8 }], pendingWrite: null };
    const n1 = removeByFloor(wp1, 3);
    assert.strictEqual(n1, 3, '删楼清除 2 承诺 + 1 场外动态');
    assert.strictEqual(wp1.promises.length, 1, '承诺保留其他楼');
    assert.deepStrictEqual(wp1.plotArcs.map(a => a.createdFloor), [7], '支线来源楼清理');
    // shiftFloorRefs：删楼前移
    const wp2 = { promises: [{ floor: 9, content: 'C' }, { floor: 2, content: 'D' }], plotArcs: [], active: {}, pendingWrite: null };
    assert.strictEqual(shiftFloorRefs(wp2, 5), 1, '9→8 位移 1 个');
    assert.strictEqual(wp2.promises[0].floor, 8, 'floor 指针跟随');
    assert.strictEqual(wp2.promises[1].floor, 2, '删楼之前不动');
});

test('=== 5. C: OutlineDirector 楼层生命周期 ===', () => {
    const removeByFloor = (od, floor) => {
        const f = Number(floor);
        if (!Number.isFinite(f)) return 0;
        const before = od.history.length;
        od.history = od.history.filter(h => Number(h.floorTo) !== f);
        const removed = before - od.history.length;
        if (removed) {
            od._turnIndex = Math.max(0, od._turnIndex - removed);
            const prev = od.history[od.history.length - 1];
            od._turnFloor = prev ? Number(prev.floorTo) || 0 : 0;
        } else if (Number(od._turnFloor) === f) {
            const prev = od.history[od.history.length - 1];
            od._turnFloor = prev ? Number(prev.floorTo) || 0 : 0;
        }
        return removed;
    };
    const shiftFloorRefs = (od, deleted) => {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        const dec = (value) => {
            const n = Number(value);
            return Number.isFinite(n) && n > del ? n - 1 : value;
        };
        let shifted = 0;
        const oldTurnFloor = od._turnFloor;
        od._turnFloor = dec(od._turnFloor);
        if (od._turnFloor !== oldTurnFloor) shifted++;
        for (const h of od.history) {
            const oldFrom = h.floorFrom, oldTo = h.floorTo;
            h.floorFrom = dec(h.floorFrom);
            h.floorTo = dec(h.floorTo);
            if (h.floorFrom !== oldFrom) shifted++;
            if (h.floorTo !== oldTo) shifted++;
        }
        return shifted;
    };
    // 删已执行轮次 → 撤销记录、回退指针
    const od1 = { history: [{ goal: 'A', floorFrom: 1, floorTo: 5 }, { goal: 'B', floorFrom: 6, floorTo: 10 }], _turnIndex: 2, _turnFloor: 10 };
    assert.strictEqual(removeByFloor(od1, 10), 1, '撤销第 10 楼轮次');
    assert.strictEqual(od1.history.length, 1, '历史保留上一轮');
    assert.strictEqual(od1._turnIndex, 1, '指针回退');
    assert.strictEqual(od1._turnFloor, 5, '起始楼层回退到上一轮');
    // shiftFloorRefs：位移历史指针
    const od2 = { history: [{ floorFrom: 11, floorTo: 15 }, { floorFrom: 16, floorTo: 20 }], _turnFloor: 21 };
    assert.strictEqual(shiftFloorRefs(od2, 10), 5, '位移 5 个指针');
    assert.strictEqual(od2.history[0].floorFrom, 10, '11→10');
    assert.strictEqual(od2.history[1].floorTo, 19, '20→19');
    assert.strictEqual(od2._turnFloor, 20, '21→20');
});

test('=== 6. 挂接与注入门控 ===', () => {
    // rollbackFloor 挂接
    assert.ok(src.includes("rollbackFloor.WorldProgress回滚"), 'rollback WorldProgress 挂接');
    assert.ok(src.includes("rollbackFloor.OutlineDirector回滚"), 'rollback OutlineDirector 挂接');
    // shiftFloorsFrom 挂接
    assert.ok(src.includes("shiftFloorsFrom.WorldProgress位移"), 'shift WorldProgress 挂接');
    assert.ok(src.includes("shiftFloorsFrom.OutlineDirector位移"), 'shift OutlineDirector 挂接');
    // 注入门控：worldProgressEnabled 关闭时不注入
    assert.ok(src.includes('const prog = this.config.config.worldProgressEnabled && this.worldProg'), '注入门控');
    // 认知隔离注入
    assert.ok(src.includes("id: 'wp_knowledge'"), '认知隔离注入块');
    assert.ok(src.includes("id: 'wp_promises'"), '承诺注入保留');
    assert.ok(src.includes("id: 'wp_arcs'"), '支线注入保留');
    // WorldProgress 应用块接线
    assert.ok(src.includes('[v3.85] A/B/C: WorldProgress 数据源接线'), '应用块标记');
    assert.ok(src.includes('this.worldProg.checkPromises(wpFloor)'), '承诺即时检查');
    assert.ok(src.includes('this.worldProg.decayArcs(wpFloor, 15)'), '支线即时衰减');
    assert.ok(src.includes('onMessageReceived.WorldProgress接线'), '应用块错误标记');
});

test('=== 7. 回归防护 ===', () => {
    // v3.41 既有机制保留
    assert.ok(src.includes('addPromise') && src.includes('checkPromises'), 'v3.41 承诺');
    assert.ok(src.includes('markUnaware') && src.includes('getReEntryNotice'), 'v3.41 认知');
    assert.ok(src.includes('decayArcs') && src.includes('touchArc'), 'v3.41 支线');
    // v3.82-3.84 方法保留
    assert.ok(src.includes('removeLifeDetailByFloor(floor)'), 'v3.82');
    assert.ok(src.includes('removeProtagonistByFloor(floor)'), 'v3.83');
    assert.ok(src.includes('shiftFloorRefs(deleted)'), 'charMem v3.84 shiftFloorRefs');
    assert.ok(src.includes('shiftDriftFloors(deleted)'), 'v3.84 drift');
    assert.ok(src.includes('shiftBaselineFloors(deleted)'), 'v3.84 baseline');
    assert.ok(src.includes('shiftGeoFloor(deleted)'), 'v3.84 geo');
    // 版本一致性
    const manifest = JSON.parse(readFileSync('/home/user/lonsha-memory-plugin/manifest.json', 'utf-8'));
    const ver = src.match(/const VERSION = '([^']+)'/)[1];
    assert.strictEqual(manifest.version, ver, '版本一致');
    assert.match(ver, /^3\.\d{2,}\.\d+$/, '版本格式');
});

console.log('v385 测试套件加载完成');