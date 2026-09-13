import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');

test('=== 1. A: CharacterState 新方法（静态特征） ===', () => {
    assert.ok(src.includes('removeLifeDetailByFloor(floor)'), '删楼方法');
    assert.ok(src.includes('shiftLifeDetailFloors(deleted)'), '位移方法');
    assert.ok(src.includes('[v3.82] A: 删楼联动'), 'A 标记');
    assert.ok(src.includes('[v3.82] B: 楼层位移联动'), 'B 标记');
});

test('=== 2. A: removeLifeDetailByFloor 逻辑复刻 ===', () => {
    const removeByFloor = (lifeDetails, floor) => {
        const f = Number(floor);
        if (!Number.isFinite(f)) return { n: 0, kept: lifeDetails };
        const before = lifeDetails.length;
        const kept = lifeDetails.filter(d => Number(d.floor) !== f);
        return { n: before - kept.length, kept };
    };
    const list = [
        { text: 'A', floor: 1 }, { text: 'B', floor: 2 }, { text: 'C', floor: 1 }, { text: 'D', floor: 5 },
    ];
    const r1 = removeByFloor(list, 1);
    assert.strictEqual(r1.n, 2, '删 1 楼清 2 条');
    assert.deepStrictEqual(r1.kept.map(d => d.text), ['B', 'D'], '保留其他');
    const r2 = removeByFloor(list, 3);
    assert.strictEqual(r2.n, 0, '无该楼 0 条');
    const r3 = removeByFloor(list, 'abc');
    assert.strictEqual(r3.n, 0, '非法楼层 0 条');
    // 字符串 floor 容错
    const list2 = [{ text: 'X', floor: '2' }];
    assert.strictEqual(removeByFloor(list2, 2).n, 1, '字符串 floor 匹配');
});

test('=== 3. B: shiftLifeDetailFloors 逻辑复刻 ===', () => {
    const shift = (lifeDetails, deleted) => {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return 0;
        let n = 0;
        for (const d of lifeDetails) {
            const f = Number(d.floor);
            if (Number.isFinite(f) && f > del) { d.floor = f - 1; n++; }
        }
        return n;
    };
    const list = [{ text: 'A', floor: 1 }, { text: 'B', floor: 3 }, { text: 'C', floor: 5 }];
    const n = shift(list, 3);
    assert.strictEqual(n, 1, '仅 >3 的移位');
    assert.strictEqual(list[0].floor, 1, '1 不动');
    assert.strictEqual(list[1].floor, 3, '3 不动（等于删除楼）');
    assert.strictEqual(list[2].floor, 4, '5 → 4');
    assert.strictEqual(shift([], 2), 0, '空数组安全');
});

test('=== 4. A2/B2: 生命周期挂接（结构验证） ===', () => {
    // rollbackFloor 挂接
    assert.ok(src.includes("errLog(e, 'rollbackFloor.生活小档案回滚')"), '回滚挂接');
    const rb = src.indexOf('rollbackFloor(floor) {');
    const rbSeg = src.slice(rb, rb + 6000);
    const ldIdx = rbSeg.indexOf('removeLifeDetailByFloor');
    const dbIdx = rbSeg.indexOf('deltaBook?.removeByFloor');
    assert.ok(ldIdx > 0 && dbIdx > 0 && ldIdx > dbIdx, '回滚挂接在 deltaBook 之后');
    // shiftFloorsFrom 挂接
    assert.ok(src.includes("errLog(e, 'shiftFloorsFrom.生活小档案位移')"), '位移挂接');
    const sf = src.indexOf('shiftFloorsFrom(deleted)');
    const sfSeg = src.slice(sf, sf + 4000);
    const sldIdx = sfSeg.indexOf('shiftLifeDetailFloors');
    assert.ok(sldIdx > 0, '位移挂接在 shift 段内');
    // 守卫（可选链防旧版）
    assert.ok(src.includes("this.status?.removeLifeDetailByFloor ? this.status.removeLifeDetailByFloor(floor) : 0"), '回滚守卫');
    assert.ok(src.includes('this.status?.shiftLifeDetailFloors?.(deleted)'), '位移守卫');
});

test('=== 5. 回归防护 ===', () => {
    assert.ok(src.includes('[v3.82]'), 'v3.82 标记');
    // 旧方法保留
    assert.ok(src.includes('removeLifeDetail(idOrText)'), 'removeLifeDetail 保留');
    // deltaBook 联动保留（v3.67）
    assert.ok(src.includes('deltaBook.removeByFloor(floor)'), 'v3.67 保留');
    assert.ok(src.includes('d.evidenceFloor = dec(d.evidenceFloor)'), 'v3.67 B 保留');
});