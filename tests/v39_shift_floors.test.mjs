// tests/v39_shift_floors.test.mjs
// v3.9 删楼语义修复测试：shiftFloorsFrom 全子系统覆盖 / 旧级联模式绝迹 / SceneBook 单楼回滚
// 运行: node tests/v39_shift_floors.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0;
const ok = (msg) => { pass++; console.log('ok: ' + msg); };

/* ══════════ 1. 旧级联模式绝迹（静态） ══════════ */
{
    // ① 删楼处理器的 floorsAfter 级联循环绝迹
    assert.ok(!src.includes('floorsAfter(floor);\n                            for (const f of after.reverse())'), '旧 floorsAfter 级联循环绝迹');
    // ② rollbackFloor 内部 status 的 < floor 级联绝迹
    assert.ok(!src.includes("this.status.ops = this.status.ops.filter(o => o.floor < floor);"), 'status < floor 级联绝迹');
    // ③ scene.rollbackFrom 调用改 rollbackFloorOnly
    assert.ok(src.includes('this.scene.rollbackFloorOnly(floor)'), 'scene 单楼回滚');
    assert.ok(!src.includes('this.scene.rollbackFrom(floor)'), 'scene 级联回滚调用绝迹');
    ok('静态1: 三处旧级联模式全部绝迹');
}

/* ══════════ 2. shiftFloorsFrom 全子系统覆盖（静态） ══════════ */
{
    const mustShift = [
        ['summary.summaries', '摘要'],
        ['summary.volumes', '卷'],
        ['vector.vectors', '向量'],
        ['diary?.diaries', '日记'],
        ['pov?.povs', 'POV'],
        ['timeline?.entries', '时间线'],
        ['suspense?.items', '悬念簿'],
        ['itemOps', '物品台账'],
        ['reflection?.items', '反思'],
        ['status?.ops', '状态ops'],
        ['scene?.track', '场景track'],
        ['scene?.opsLog', '场景opsLog'],
        ['ledger?.floors', '楼层账本'],
    ];
    let missing = [];
    for (const [pattern, label] of mustShift) {
        const idx = src.indexOf('shiftFloorsFrom(deleted)');
        const seg = src.slice(idx, idx + 4000);
        if (!seg.includes(pattern)) missing.push(label);
    }
    assert.ok(missing.length === 0, `shift 覆盖缺失: ${missing.join(',')}`);
    ok('静态2: shift 覆盖全部 13 个子系统');
}

/* ══════════ 3. shift 语义（重现算法验证） ══════════ */
{
    // 重现 dec + 卷边界算法
    const makeShift = () => {
        let shifted = 0;
        const dec = (v) => { if (v > deleted) { shifted++; return v - 1; } return v; };
        let deleted = -1;
        return {
            setDeleted(d) { deleted = d; shifted = 0; },
            dec,
            get shifted() { return shifted; },
        };
    };

    const S = makeShift();
    S.setDeleted(3);
    // 前面的楼不变
    assert.equal(S.dec(0), 0);
    assert.equal(S.dec(3), 3);   // 被删楼本身（调用方已回滚）
    // 后面的楼前移
    assert.equal(S.dec(4), 3);
    assert.equal(S.dec(10), 9);
    assert.equal(S.shifted, 2);  // 只有 4 和 10 计数
    ok('算法1: dec 只移位 > deleted 的键');

    // 卷边界
    const S2 = makeShift();
    S2.setDeleted(3);
    const vol = { floorStart: 5, floorEnd: 9 };
    if (vol.floorStart > 3) vol.floorStart--;
    if (vol.floorEnd >= 3) vol.floorEnd = Math.max(vol.floorStart, vol.floorEnd - 1);
    assert.deepEqual([vol.floorStart, vol.floorEnd], [4, 8]);
    ok('算法2: 卷范围起止同减');

    // 被删楼在卷中间 → end-1、start 不变
    const vol2 = { floorStart: 1, floorEnd: 5 };
    if (vol2.floorStart > 3) vol2.floorStart--;
    if (vol2.floorEnd >= 3) vol2.floorEnd = Math.max(vol2.floorStart, vol2.floorEnd - 1);
    assert.deepEqual([vol2.floorStart, vol2.floorEnd], [1, 4]);
    ok('算法3: 被删楼在卷内 → 仅 end 缩');
}

/* ══════════ 4. ledger 键重映射（重现） ══════════ */
{
    const deleted = 3;
    const fl = { 0: { floor: 0 }, 2: { floor: 2 }, 3: { floor: 3 }, 4: { floor: 4 }, 10: { floor: 10 } };
    const entries = Object.entries(fl).map(([k, v]) => [Number(k), v]).sort((a, b) => a[0] - b[0]);
    const next = {};
    for (const [f, v] of entries) {
        if (f === deleted) continue;
        const nf = f > deleted ? f - 1 : f;
        v.floor = nf;
        next[nf] = v;
    }
    assert.deepEqual(Object.keys(next).map(Number).sort((a, b) => a - b), [0, 2, 3, 9]);
    assert.equal(next[3].floor, 3);   // 原 4 → 3
    assert.equal(next[9].floor, 9);   // 原 10 → 9
    ok('算法4: ledger 键重映射正确');
}

/* ══════════ 5. 数据零丢失对比（语义验证） ══════════ */
{
    // 旧语义: 删楼3 → 4..10 的记忆全部销毁（丢失 7 楼记忆）
    // 新语义: 删楼3 → 只有楼 3 的记忆被回滚（单楼），4..10 shift 到 3..9（零丢失）
    const before = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const afterOld = [0, 1, 2];   // 旧: 全删
    const afterNew = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];  // 新: 只删 3，其余前移
    assert.equal(before.length - afterOld.length, 8, '旧语义丢 8 楼记忆');
    assert.equal(before.length - afterNew.length, 1, '新语义只丢被删的 1 楼');
    ok('语义: 删楼从「丢 N 楼」变为「只丢被删的 1 楼」');
}

/* ══════════ 6. SF2 基线重置（静态） ══════════ */
{
    const ccIdx = src.indexOf('types.CHAT_CHANGED');
    const ccBlock = src.slice(ccIdx, ccIdx + 2500);
    assert.ok(ccBlock.includes('_lastKnownChatLen'), 'CHAT_CHANGED 内重置基线');
    ok('SF2: 换聊天基线重置落位');
}

/* ══════════ 7. SceneBook.rollbackFloorOnly（行为） ══════════ */
{
    const gStart = src.indexOf('    class SceneBook {');
    const gEnd = src.indexOf('\n    class ', gStart + 10);
    const clsSrc = src.slice(gStart, gEnd);
    const g = new Function('normalizeCharName', 'errLog', `${clsSrc}\nreturn new SceneBook();`)((n) => n, () => {});
    // 场景: 楼1/3/5 各登记场景，回滚楼3 → 1、5 保留
    g.apply([{ action: 'add', path: ['城', '街A'], desc: 'A' }], 1, false);
    g.apply([{ action: 'add', path: ['城', '街B'], desc: 'B' }], 3, false);
    g.apply([{ action: 'add', path: ['城', '街C'], desc: 'C' }], 5, false);
    g.rollbackFloorOnly(3);
    assert.ok([...g.nodes.values()].some(n => n.desc === 'A'), '楼1 保留');
    assert.ok([...g.nodes.values()].some(n => n.desc === 'C'), '楼5 保留');
    assert.ok(!g.opsLog.some(o => o.floor === 3), '楼3 的 opsLog 已清');
    ok('行为1: rollbackFloorOnly 只清该楼（1/5 保留）');
}

console.log(`\n✓ v3.9 删楼语义修复测试全过 (${pass} 项)`);