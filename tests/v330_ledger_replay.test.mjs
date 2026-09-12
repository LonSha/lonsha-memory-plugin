// tests/v330_ledger_replay.test.mjs
// v3.3 台账重放化测试：指纹工具 / rebuildItems 过滤（失活·复活）/ reconcileItemOps（自愈·补采·清理）
// 运行: node tests/v330_ledger_replay.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0;
const ok = (msg) => { pass++; console.log('ok: ' + msg); };

/* ---------- 提取器（大括号配对） ---------- */
function braceEnd(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } }
        else if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    }
    return -1;
}
function extractFn(name) {
    let start = src.indexOf(`async function ${name}(`);
    if (start < 0) start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error('missing fn ' + name);
    const brace = src.indexOf('{', src.indexOf(')', start));
    return src.slice(start, braceEnd(src, brace) + 1);
}
function extractMethod(name) {
    const start = src.indexOf(`        ${name}(`);
    if (start < 0) throw new Error('missing method ' + name);
    const brace = src.indexOf('{', src.indexOf(')', start));
    return 'function ' + src.slice(start + 8, braceEnd(src, brace) + 1);
}

/* ---------- 装配被测环境 ---------- */
const FNS = extractFn('hash32') + '\n' + extractFn('msgTextOf') + '\n' + extractFn('msgFpOf');

function makeEngine(chat, itemOps) {
    const engineSrc = `${FNS}\n${extractMethod('_sanitizeItemOp')}\n${extractMethod('rebuildItems')}\n${extractMethod('reconcileItemOps')}
    return { items: { records: [] }, itemOps: ops, rebuildItems, reconcileItemOps, _sanitizeItemOp, config: { config: { debugMode: false } } };`;
    const win = { SillyTavern: { getContext: () => ({ chat }) } };
    return new Function('window', 'errLog', 'ops', engineSrc)(win, () => {}, itemOps);
}

const msg = (text, opts = {}) => ({
    mes: text, is_user: opts.user === true, swipe_id: opts.swipe ?? 0,
    swipes: opts.swipes, send_date: opts.date ?? 1000,
});

/* ══════════ 1. 指纹行为 ══════════ */
{
    const e = makeEngine([], []);
    const fpA = e.rebuildItems; // 借装配拿到 msgFpOf 作用域不行——直接再取出
}
// 直接取指纹三件套测试
const fpEnv = new Function('window', 'errLog', `${FNS}; return { msgFpOf, msgTextOf, hash32 };`)({ SillyTavern: { getContext: () => ({ chat: [] }) } }, () => {});
{
    const m1 = msg('你好世界');
    const m2 = msg('你好世界');
    assert.equal(fpEnv.msgFpOf(m1), fpEnv.msgFpOf(m2));
    ok('指纹1: 同内容同身份 → 同指纹');

    const m3 = msg('你好世界！');
    assert.notEqual(fpEnv.msgFpOf(m1), fpEnv.msgFpOf(m3));
    ok('指纹2: 文本编辑 → 指纹变化');

    const m4 = msg('你好世界', { swipe: 1 });
    assert.notEqual(fpEnv.msgFpOf(m1), fpEnv.msgFpOf(m4));
    ok('指纹3: swipe 切换 → 指纹变化');

    const sw = msg('x', { swipes: ['回复A', '回复B'], swipe: 1 });
    assert.ok(fpEnv.msgFpOf(sw).includes(fpEnv.hash32('回复B')));
    ok('指纹4: swipes 数组按 swipe_id 取值');

    const mu = msg('hi', { user: true });
    assert.ok(fpEnv.msgFpOf(mu).startsWith('u|'));
    assert.ok(fpEnv.msgFpOf(m1).startsWith('a|'));
    ok('指纹5: 角色段区分 u/a');
}

/* ══════════ 2. rebuildItems 过滤（失活/复活/carried/无fp） ══════════ */
{
    const chat1 = [msg('第一楼'), msg('第二楼'), msg('第三楼')];
    const e = makeEngine(chat1, []);
    const fp0 = fpEnv.msgFpOf(chat1[0]);
    const fp1 = fpEnv.msgFpOf(chat1[1]);
    const fp2 = fpEnv.msgFpOf(chat1[2]);

    e.itemOps = [
        { floor: 0, fp: fp0, action: 'add', name: '宝剑' },
        { floor: 1, fp: fp1, action: 'update', name: '宝剑', state: '损坏' },
        { floor: 2, fp: fp2, action: 'add', name: '药水' },
        { floor: 1, fp: 'deadbeef|0|gone|', action: 'add', name: '幽灵物' },   // 失活
        { floor: 5, carried: true, action: 'add', name: '传家宝' },            // carried 永活
        { floor: 2, action: 'add', name: '旧档物' },                           // 无 fp：旧档兼容
    ];
    e.rebuildItems();
    const names = e.items.records.map(r => r.name);
    assert.ok(names.includes('宝剑') && names.includes('药水') && names.includes('传家宝') && names.includes('旧档物'));
    assert.ok(!names.includes('幽灵物'));
    assert.equal(e.items._stale, 1);
    ok('重放1: 失活op不应用(carried/无fp/有效全过), _stale=1');

    // 复活：幽灵物对应楼层文本改回来后（swipe 翻回/编辑还原）→ 重新应用
    const chat2 = [msg('第一楼'), msg('第二楼'), msg('第三楼')];
    // 构造：把幽灵物的 fp 替换为 chat2[1] 的真实 fp 不合法（fp 是文本哈希）——改用场景：聊天中新增了匹配文本的楼
    const chat3 = [msg('第一楼'), msg('幽灵文本'), msg('第三楼')];
    const e2 = makeEngine(chat3, [{ floor: 1, fp: fpEnv.msgFpOf(chat3[1]), action: 'add', name: '复活物' }]);
    e2.rebuildItems();
    assert.ok(e2.items.records.map(r => r.name).includes('复活物'));
    ok('重放2: 指纹匹配即应用（翻回复活语义）');
}

/* ══════════ 3. reconcileItemOps 对账 ══════════ */
{
    // 场景A: 自愈——删楼前移，ops 指纹重新定位
    const before = [msg('A楼'), msg('B楼'), msg('C楼'), msg('D楼')];
    const fpC = fpEnv.msgFpOf(before[2]);
    const e = makeEngine(before, [
        { floor: 2, fp: fpC, action: 'add', name: 'C楼物品' },
    ]);
    e.reconcileItemOps();
    assert.equal(e.itemOps[0].floor, 2, '初始定位 floor=2');

    // 模拟删除 B 楼（chat 变化：C、D 前移）——重建 engine 指向新 chat
    const after = [msg('A楼'), msg('C楼'), msg('D楼')];
    const e2 = makeEngine(after, [{ floor: 2, fp: fpC, action: 'add', name: 'C楼物品' }]);
    e2.reconcileItemOps();
    assert.equal(e2.itemOps[0].floor, 1, '自愈: 前移至 floor=1');
    assert.ok(e2.items.records.map(r => r.name).includes('C楼物品'));
    ok('对账1: 删楼前移 → 指纹重新定位自愈');

    // 场景B: 楼层仍在但文本已编辑 → 保留失活（不清理）
    const edited = [msg('A楼'), msg('C楼改'), msg('D楼')];
    const e3 = makeEngine(edited, [{ floor: 2, fp: fpC, action: 'add', name: 'C楼物品' }]);
    e3.reconcileItemOps();
    assert.equal(e3.itemOps.length, 1, '编辑楼 ops 保留（可翻回复活）');
    assert.equal(e3.items._stale, 1, '渲染层面失活');
    ok('对账2: 文本编辑 → 保留失活（不清理）');

    // 场景C: 旧档补采——无 fp 按 floor 补采
    const chat = [msg('甲'), msg('乙')];
    const e4 = makeEngine(chat, [{ floor: 0, action: 'add', name: '老物品' }]);
    e4.reconcileItemOps();
    assert.equal(e4.itemOps[0].fp, fpEnv.msgFpOf(chat[0]), '补采成功');
    ok('对账3: 旧档无 fp → 按当前楼层补采');

    // 场景D: 旧档楼层不存在 → 清理
    const e5 = makeEngine(chat, [{ floor: 9, action: 'add', name: '孤儿物' }]);
    e5.reconcileItemOps();
    assert.equal(e5.itemOps.length, 0);
    ok('对账4: 旧档楼层不存在 → 清理');

    // 场景E: carried 直通
    const e6 = makeEngine([msg('x')], [{ floor: 0, carried: true, action: 'add', name: '胎记' }]);
    e6.reconcileItemOps();
    assert.equal(e6.itemOps.length, 1);
    assert.ok(e6.items.records.map(r => r.name).includes('胎记'));
    ok('对账5: carried 直通（无楼层依据仍有效）');

    // 场景F: 完全清理——指纹全局无匹配且 floor >= chat.length
    const e7 = makeEngine([msg('p'), msg('q')], [{ floor: 5, fp: 'nomatch|0|xx|', action: 'add', name: '幽灵' }]);
    e7.reconcileItemOps();
    assert.equal(e7.itemOps.length, 0);
    ok('对账6: 无匹配且越界 → 清理');
}

/* ══════════ 4. 静态回归 ══════════ */
{
    assert.ok(src.includes('function msgFpOf(') && src.includes('function hash32(') && src.includes('function msgTextOf('));
    ok('静态1: 指纹三件套存在');
    assert.ok(src.includes('reconcileItemOps()'));
    // 旧硬过滤绝迹
    assert.ok(!/itemOps = \(this\.itemOps \|\| \[\]\)\.filter\(o => o\.floor < floor\)/.test(src));
    ok('静态2: 旧「floor < f 硬过滤」绝迹');
    const callers = (src.match(/reconcileItemOps/g) || []).length;
    assert.ok(callers >= 3, `reconcileItemOps 出现 >= 3（定义+rollback委托+加载点, 实际 ${callers}）`);
    ok('静态3: 对账接入 rollback/加载/定义三处');
}

/* ══════════ 5. activeItemOps（打包过滤） ══════════ */
{
    const chat = [msg('甲楼'), msg('乙楼')];
    const fpOk = fpEnv.msgFpOf(chat[0]);
    const engineSrc = `${FNS}\n${extractMethod('activeItemOps')}
    return { activeItemOps, itemOps: ops };`;
    const e = new Function('window', 'errLog', 'ops', engineSrc)(
        { SillyTavern: { getContext: () => ({ chat }) } }, () => {},
        [
            { floor: 0, fp: fpOk, action: 'add', name: '有效物' },
            { floor: 0, fp: 'gone|0|xx|', action: 'add', name: '失活物' },
            { floor: 5, carried: true, action: 'add', name: '携带物' },
            { floor: 1, action: 'add', name: '无fp旧物' },
            null,
        ]);
    const act = e.activeItemOps();
    const names = act.map(o => o.name);
    assert.deepEqual(names, ['有效物', '携带物', '无fp旧物']);
    ok('打包1: activeItemOps 只含有效（失活/坏项被过滤）');
}

console.log(`\n✓ v3.3 台账重放化测试全过 (${pass} 项)`);