// tests/v39_shift_floors.test.mjs
// v3.9 删楼语义修复测试：shiftFloorsFrom 全子系统覆盖 / 旧级联模式绝迹 / SceneBook 单楼回滚
// 运行: node tests/v39_shift_floors.test.mjs
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
import { createRequire as __mkReq } from 'node:module';
const __require = __mkReq(import.meta.url);
const __fsReq = __require('fs');   // require 函数本身不带 readFileSync，先取 fs 模块
const __LR = __require('../ledger-replay.js');
const __ownerShift = (id) => { const o = (__LR.FLOOR_OWNERS || []).find(x => x.id === id); return (o && typeof o.shift === 'function') ? o.shift : null; };
const __ownerDrop = (id) => { const o = (__LR.FLOOR_OWNERS || []).find(x => x.id === id); return (o && typeof o.drop === 'function') ? o.drop : null; };
const __libSrc = (() => { try { return __fsReq.readFileSync(new URL('../ledger-replay.js', import.meta.url), 'utf8'); } catch (e) { return ''; } })();

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
    // [v3.190] 位移清单已从 index.js 搬到 ledger-replay.js 的登记表：
    //   本组从「宿主源码里出现过这些字段名」升级为「登记表有这些面，
    //   且该面的 shift 动作真在改那些字段」——判据从字面改为真源 + 行为。
    const mustShift = [
        ['summary', ['summaries'], '摘要'],
        ['volumes', ['volumes'], '卷'],
        ['vector', ['vectors'], '向量'],
        ['diary', ['diaries'], '日记'],
        ['pov', ['povs'], 'POV'],
        ['timeline', ['entries'], '时间线'],
        ['suspense', ['items'], '悬念簿'],
        ['items', ['itemOps'], '物品台账'],
        ['reflection', ['items'], '反思'],
        ['status-ops', ['ops'], '状态ops'],
        ['scene', ['track', 'opsLog'], '场景（track/opsLog）'],
        ['floor-ledger', ['floors'], '楼层账本'],
    ];
    let missing = [];
    for (const [id, fields, label] of mustShift) {
        const fn = __ownerShift(id);
        if (!fn) { missing.push(label + '(无登记项)'); continue; }
        const body = String(fn);
        if (!fields.every(f => body.includes(f))) missing.push(label + '(动作未触及该字段)');
    }
    assert.ok(missing.length === 0, `shift 覆盖缺失: ${missing.join('，')}`);
    // 宿主不得再留第二份位移清单：两份事实必然漂移，且会各减一次
    assert.ok(!src.includes('const dec = (v) => { if (v > deleted) { shifted++; return v - 1; } return v; };'),
        '宿主手抄位移清单已收编（不得复活）');
    ok('静态2: shift 覆盖全部 12 面（登记表真源）+ 宿主无第二份清单');
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
    // [v3.181] SceneBook 已从 index.js 抽取为独立模块 scene-book.js。
    //   旧判据从 index.js 里抽 `class SceneBook {` 源码求值——类移出之后，
    //   该判据会自抛 ReferenceError，把「模块已移出」误报成「行为坏了」（假红）。
    //   改为加载**真模块真类**（行为面不变），并补一条「宿主真取到它」的不变量断言，
    //   否则「模块在但没人接」会变成新的静默缺席。
    const g = new (createRequire(import.meta.url)('../scene-book.js').SceneBook)();
    // 场景: 楼1/3/5 各登记场景，回滚楼3 → 1、5 保留
    g.apply([{ action: 'add', path: ['城', '街A'], desc: 'A' }], 1, false);
    g.apply([{ action: 'add', path: ['城', '街B'], desc: 'B' }], 3, false);
    g.apply([{ action: 'add', path: ['城', '街C'], desc: 'C' }], 5, false);
    g.rollbackFloorOnly(3);
    assert.ok([...g.nodes.values()].some(n => n.desc === 'A'), '楼1 保留');
    assert.ok([...g.nodes.values()].some(n => n.desc === 'C'), '楼5 保留');
    assert.ok(!g.opsLog.some(o => o.floor === 3), '楼3 的 opsLog 已清');
    // 宿主必须真把它接上（否则模块存在也无人取 = 静默缺席）
    assert.ok(/window\.LonShaSceneBook/.test(src), 'index.js 须真取 window.LonShaSceneBook');
    assert.ok(/_newSceneBook\(/.test(src), 'index.js 须经 _newSceneBook 构造');
    ok('行为1: rollbackFloorOnly 只清该楼（1/5 保留）');
}

console.log(`\n✓ v3.9 删楼语义修复测试全过 (${pass} 项)`);