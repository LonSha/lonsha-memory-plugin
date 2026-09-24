import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const src = readFileSync(`${REPO_ROOT}/index.js`, 'utf-8');

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
    // rollbackFloor 挂接（[v3.115] 注意：index.js 有两处同名方法——引擎本体与
    //   charMem 的委托 rollbackFloor(floor) { return this.removeByFloor(floor); }。
    //   用 floorLedgerEnabled 门控定位引擎本体，否则会匹配到委托方法导致窗口错位）
    assert.ok(src.includes("errLog(e, 'rollbackFloor.生活小档案回滚')"), '回滚挂接');
    // [v3.190] 门控由单行早退改为花括号形态（回放被提到门控之前），定位锚点同步更新
    const gate = src.indexOf('if (!this.config.config.floorLedgerEnabled) {');
    assert.ok(gate > 0, '引擎 rollbackFloor 本体存在');
    const rb = src.lastIndexOf('rollbackFloor(floor) {', gate);
    assert.ok(rb > 0 && rb < gate, '定位引擎 rollbackFloor');
    // [v3.190] 窗口放宽：收口时函数开头补了说明性注释，原 9000 字符窗口
    //   已取不到函数后半段的 removeLifeDetailByFloor（不是顺序变了，是被截断）。
    const rbSeg = src.slice(rb, rb + 14000);
    const ldIdx = rbSeg.indexOf('removeLifeDetailByFloor');
    const dbIdx = rbSeg.indexOf('deltaBook?.removeByFloor');
    assert.ok(ldIdx > 0 && dbIdx > 0 && ldIdx > dbIdx, '回滚挂接在 deltaBook 之后');
    // shiftFloorsFrom 挂接
    // [v3.190] 位移收进登记表后，逐面失败标签从 errLog 字面改为登记表里的数据值：
    //   标签仍是同一个名字（诊断面按名检索不受影响），落点从调用点搬到标签常量。
    assert.ok(src.includes("'shiftFloorsFrom.生活小档案位移'"), '位移挂接（标签保留）');
    assert.ok(src.includes('SHIFT_FACE_LABELS'), '标签表存在且被前移回放消费');
    // [v3.190] 位移已收进登记表（宿主不再手抄各面位移语句），
    //   判据从「宿主 shift 段里出现过这个方法名」改为「登记项真在调它」。
    const libSrc2 = readFileSync(`${REPO_ROOT}/ledger-replay.js`, 'utf-8');
    assert.ok(libSrc2.includes('shiftLifeDetailFloors'), '位移挂接在登记表内（生活小档案面）');
    // 守卫（可选链防旧版）
    assert.ok(src.includes("this.status?.removeLifeDetailByFloor ? this.status.removeLifeDetailByFloor(floor) : 0"), '回滚守卫');
    // [v3.190] 位移的唯一真源是登记表：生活小档案这一面必须在表里且参与位移
    const LR = require('../ledger-replay.js');
    const ldOwn = LR.FLOOR_OWNERS.find(o => o.id === 'life-detail');
    assert.ok(ldOwn && typeof ldOwn.shift === 'function', '生活小档案在登记表里且参与位移');
});

test('=== 5. 回归防护 ===', () => {
    assert.ok(src.includes('[v3.82]'), 'v3.82 标记');
    // 旧方法保留
    assert.ok(src.includes('removeLifeDetail(idOrText)'), 'removeLifeDetail 保留');
    // deltaBook 联动保留（v3.67）
    assert.ok(src.includes('deltaBook.removeByFloor(floor)'), 'v3.67 保留');
    // [v3.190] v3.67 B 的位移规则已收进登记表（delta 面的 shift），判据改指真源
    const libSrc = readFileSync(`${REPO_ROOT}/ledger-replay.js`, 'utf-8');
    assert.ok(libSrc.includes('e.evidenceFloor'), 'v3.67 B 位移规则保留在登记表内');
});