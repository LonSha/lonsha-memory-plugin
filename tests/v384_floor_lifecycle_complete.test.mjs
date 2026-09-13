import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');

test('=== 1. A: charMem shiftFloorRefs（静态特征） ===', () => {
    assert.ok(src.includes('shiftFloorRefs(deleted)'), '位移方法定义');
    assert.ok(src.includes('[v3.84] A: 角色记忆银行楼层位移'), 'A 标记');
    assert.ok(src.includes("shiftFloorsFrom.角色记忆位移"), 'shiftFloorsFrom 挂接');
    // 原有 removeByFloor 保留
    assert.ok(src.includes('removeByFloor(floor) {'), 'v3.22 方法保留');
});

test('=== 2. A: shiftFloorRefs 逻辑复刻 ===', () => {
    const shiftFloorRefs = (memories, deleted) => {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        let n = 0;
        for (const char of Object.keys(memories)) {
            for (const arr of ['core', 'recent']) {
                for (const m of (memories[char][arr] || [])) {
                    if (typeof m.floor === 'number' && m.floor > del) { m.floor = m.floor - 1; n++; }
                }
            }
        }
        return n;
    };
    const mem = {
        A: { core: [{ text: 'c1', floor: 3 }, { text: 'c2', floor: 7 }], recent: [{ text: 'r1', floor: 5 }] },
        B: { core: [], recent: [{ text: 'r2', floor: 2 }] },
    };
    const n = shiftFloorRefs(mem, 4);
    assert.strictEqual(n, 2, '位移计数：7→6、5→4');
    assert.strictEqual(mem.A.core[0].floor, 3, '删楼之前不动');
    assert.strictEqual(mem.A.core[1].floor, 6, 'core 位移');
    assert.strictEqual(mem.A.recent[0].floor, 4, 'recent 位移');
    assert.strictEqual(mem.B.recent[0].floor, 2, '其他角色不动');
    // 非法输入
    assert.strictEqual(shiftFloorRefs(mem, NaN), 0, 'NaN 守卫');
    // 空 memories
    assert.strictEqual(shiftFloorRefs({}, 3), 0, '空安全');
});

test('=== 3. A: removeByFloor 计数修复 ===', () => {
    // 修复后：removed 为实际删除条数（旧实现为处理角色数）
    const removeByFloor = (memories, floor) => {
        const f = Math.max(0, Math.round(Number(floor) || 0));
        let removed = 0;
        for (const char of Object.keys(memories)) {
            const c = memories[char];
            const beforeCore = c.core.length, beforeRecent = c.recent.length;
            c.core = c.core.filter(x => x.floor !== f);
            c.recent = c.recent.filter(x => x.floor !== f);
            removed += (beforeCore - c.core.length) + (beforeRecent - c.recent.length);
        }
        return removed;
    };
    const mem = {
        A: { core: [{ floor: 5 }, { floor: 3 }], recent: [{ floor: 5 }] },
        B: { core: [], recent: [] },
    };
    assert.strictEqual(removeByFloor(mem, 5), 2, 'A 删 2 条（旧实现误报 2 角色数）');
    assert.strictEqual(mem.A.core.length, 1, '剩余 core');
    assert.strictEqual(mem.A.recent.length, 0, '剩余 recent');
    // 无命中：计数 0
    assert.strictEqual(removeByFloor(mem, 99), 0, '无命中计数 0');
    // 静态：旧 bug 绝迹
    assert.ok(!src.includes('removed += 1;'), 'removed += 1 已清除');
    assert.ok(src.includes('beforeCore - c.core.length'), '新计数逻辑');
});

test('=== 4. B: drift 生命周期方法（静态特征） ===', () => {
    assert.ok(src.includes('shiftDriftFloors(deleted)'), 'drift 位移方法');
    assert.ok(src.includes('removeDriftByFloor(floor)'), 'drift 回滚方法');
    assert.ok(src.includes('[v3.84] B: 人设偏移楼层位移'), 'B 标记');
    assert.ok(src.includes("rollbackFloor.人设偏移回滚"), 'rollback 挂接');
    assert.ok(src.includes("shiftFloorsFrom.人设偏移位移"), 'shift 挂接');
});

test('=== 5. B: drift 生命周期逻辑复刻 ===', () => {
    const shiftDriftFloors = (drifts, deleted) => {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        let n = 0;
        for (const name of Object.keys(drifts || {})) {
            const d = drifts[name];
            if (d && typeof d.floor === 'number' && d.floor > del) { d.floor = d.floor - 1; n++; }
        }
        return n;
    };
    const removeDriftByFloor = (drifts, floor) => {
        const f = Number(floor);
        if (!Number.isFinite(f)) return 0;
        let n = 0;
        for (const name of Object.keys(drifts || {})) {
            const d = drifts[name];
            if (d && Number(d.floor) === f) { delete drifts[name]; n++; }
        }
        return n;
    };
    // 位移：drift.floor=10，删 5 楼 → 9；衰减窗口保持
    const drifts = { A: { floor: 10, mood: 'x' }, B: { floor: 3, mood: 'y' } };
    assert.strictEqual(shiftDriftFloors(drifts, 5), 1);
    assert.strictEqual(drifts.A.floor, 9, '10→9 跟随');
    assert.strictEqual(drifts.B.floor, 3, '删楼之前不动');
    // 衰减窗口语义：currentFloor=20, drift.floor=9 → age=11（≤15 仍活跃）
    const age = 20 - drifts.A.floor;
    assert.strictEqual(age, 11, '位移后衰减窗口正确（若未位移会误算 10）');
    // 回滚：来源楼被删 → 偏移清空
    const d2 = { A: { floor: 7, mood: 'x' }, B: { floor: 4, mood: 'y' } };
    assert.strictEqual(removeDriftByFloor(d2, 7), 1, '命中清 1');
    assert.ok(!d2.A, 'A 已清空');
    assert.ok(d2.B, 'B 保留');
    assert.strictEqual(removeDriftByFloor(d2, 99), 0, '无命中');
    assert.strictEqual(removeDriftByFloor(d2, NaN), 0, 'NaN 守卫');
});

test('=== 6. C: baseline/geo 楼层位移方法 ===', () => {
    assert.ok(src.includes('shiftBaselineFloors(deleted)'), 'baseline 位移方法');
    assert.ok(src.includes('shiftGeoFloor(deleted)'), 'geo 位移方法');
    assert.ok(src.includes('[v3.84] C: 人设基线锁定楼层位移'), 'C 标记');
    assert.ok(src.includes("shiftFloorsFrom.人设基线位移"), 'baseline 挂接');
    assert.ok(src.includes("shiftFloorsFrom.地理上下文位移"), 'geo 挂接');
    // 逻辑复刻
    const shiftBaselineFloors = (baselines, deleted) => {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        let n = 0;
        for (const name of Object.keys(baselines || {})) {
            const b = baselines[name];
            if (b && typeof b.lockedAtFloor === 'number' && b.lockedAtFloor > del) { b.lockedAtFloor = b.lockedAtFloor - 1; n++; }
        }
        return n;
    };
    const bl = { A: { lockedAtFloor: 8 }, B: { lockedAtFloor: 2 } };
    assert.strictEqual(shiftBaselineFloors(bl, 5), 1);
    assert.strictEqual(bl.A.lockedAtFloor, 7, '8→7');
    assert.strictEqual(bl.B.lockedAtFloor, 2, '不动');
    const shiftGeoFloor = (geo, deleted) => {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        if (geo && typeof geo.floor === 'number' && geo.floor > del) { geo.floor = geo.floor - 1; return 1; }
        return 0;
    };
    const geo = { majorArea: 'A', floor: 6 };
    assert.strictEqual(shiftGeoFloor(geo, 4), 1);
    assert.strictEqual(geo.floor, 5, '6→5');
    assert.strictEqual(shiftGeoFloor({ floor: 3 }, 4), 0, '不动');
    assert.strictEqual(shiftGeoFloor(null, 4), 0, 'null 安全');
});

test('=== 7. 回归防护 ===', () => {
    // v3.82/v3.83 方法保留
    assert.ok(src.includes('removeLifeDetailByFloor(floor)'), 'v3.82');
    assert.ok(src.includes('shiftProtagonistFloor(deleted)'), 'v3.83');
    assert.ok(src.includes('removeProtagonistByFloor(floor)'), 'v3.83');
    // 版本一致性
    const manifest = JSON.parse(readFileSync('/home/user/lonsha-memory-plugin/manifest.json', 'utf-8'));
    const ver = src.match(/const VERSION = '([^']+)'/)[1];
    assert.strictEqual(manifest.version, ver, '版本一致');
    assert.match(ver, /^3\.\d{2,}\.\d+$/, '版本格式');
});

console.log('v384 测试套件加载完成');