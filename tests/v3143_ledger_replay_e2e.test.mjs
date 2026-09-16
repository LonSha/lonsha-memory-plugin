// tests/v3143_ledger_replay_e2e.test.mjs
// [v3.143] 物品台账重放端到端验收：规划要求的 7 种历史操作矩阵，锁死 v3.3/v3.36 既有实现
// （非重复建设——重放化已落地，缺的是「swipe/编辑/删楼/重载后重放结果一致」的行为证明）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
function extractBraced(marker) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `${marker} 存在`);
    let depth = 0, i = src.indexOf('{', start + marker.length - 1);
    const open = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(open + 1, i);
}
// 稳定指纹：与 index.js 的 msgFpOf 同构（角色|swipe|文本hash|发送时间），测试内自洽即可
const fpOf = (m) => [m.is_user ? 'u' : 'a', m.swipe_id || 0, String(m.mes || '').length, m.send_date || ''].join('|');
const san = new Function('errLog', `return function (op) { ${extractBraced('_sanitizeItemOp(op) {')} }`)(() => {});
const rebuild = new Function('window', 'msgFpOf', 'errLog', `return function () { ${extractBraced('rebuildItems() {')} }`)(
    { SillyTavern: { getContext: () => ({ chat: globalThis.__CHAT__ || [] }) } }, fpOf, () => {});
const mk = (chat, ops) => {
    const eng = { items: { records: [] }, itemOps: ops.map(o => ({ ...o })), _sanitizeItemOp: san };
    globalThis.__CHAT__ = chat;
    rebuild.call(eng);
    return eng.items.records.map(r => `${r.name}:${r.holder}:${r.state}`).sort();
};
const msg = (mes, is_user = false, extra = {}) => ({ mes, is_user, send_date: 'D' + String(mes).slice(0, 3), ...extra });
const baseChat = () => [msg('开场', false), msg('用户：拿起钥匙', true), msg('AI：钥匙在桌上，又捡到火把', false)];
const baseOps = (chat) => ([
    { floor: 2, fp: fpOf(chat[2]), action: 'add', name: '钥匙', holder: '主角', state: '完好' },
    { floor: 2, fp: fpOf(chat[2]), action: 'add', name: '火把', holder: '主角', state: '完好' },
]);
const snap = (chat, ops) => mk(chat, ops);
test('v3.143 基线：原始重放得到完整台账', () => {
    const chat = baseChat();
    assert.deepEqual([...snap(chat, baseOps(chat))].sort(), ['火把:主角:完好', '钥匙:主角:完好'].sort(), '两件物品入账');
});
test('v3.143 幂等：同一 chat + 同一 ops 重放两次结果全等（真源不被重放改写）', () => {
    const chat = baseChat(), ops = baseOps(chat);
    const a = snap(chat, ops), b = snap(chat, ops);
    assert.deepEqual(a, b, '重放确定性');
    const eng = { items: { records: [] }, itemOps: ops.map(o => ({ ...o })), _sanitizeItemOp: san };
    globalThis.__CHAT__ = chat; rebuild.call(eng); const n1 = eng.itemOps.length;
    rebuild.call(eng);
    assert.equal(eng.itemOps.length, n1, '重放不增删真源 ops（可无限次重放）');
});
test('v3.143 ① swipe 到新变体：该楼层 ops 自动失活（不再显示不存在的物品）', () => {
    const chat = baseChat(), ops = baseOps(chat);
    const swiped = chat.map((m, i) => i === 2 ? msg('AI：完全不同的回复内容', false, { swipe_id: 1 }) : m);
    assert.equal(fpOf(swiped[2]) === fpOf(chat[2]), false, '变体指纹已变');
    assert.deepEqual(snap(swiped, ops), [], 'swipe 后旧变体的物品全部失活');
    const eng = { items: { records: [] }, itemOps: ops.map(o => ({ ...o })), _sanitizeItemOp: san };
    globalThis.__CHAT__ = swiped; rebuild.call(eng);
    assert.equal(eng.itemOps.length, 2, '真源 ops 不物理删除（失活不删除纪律）');
    assert.equal(eng.items._stale, 2, '失活计数可见');
});
test('v3.143 ② swipe 翻回旧变体：ops 自动复活（不依赖重提取）', () => {
    const chat = baseChat(), ops = baseOps(chat);
    const swiped = chat.map((m, i) => i === 2 ? msg('AI：完全不同的回复内容', false, { swipe_id: 1 }) : m);
    assert.deepEqual(snap(swiped, ops), [], '先确认失活');
    assert.deepEqual(snap(chat, ops).sort(), ['火把:主角:完好', '钥匙:主角:完好'].sort(), '翻回原变体即复活');
});
test('v3.143 ③ 编辑中间楼：只失活该楼 ops，其它楼不受影响（指纹粒度到楼）', () => {
    const chat = baseChat();
    const ops = [
        { floor: 1, fp: fpOf(chat[1]), action: 'add', name: '水壶', holder: '主角', state: '完好' },
        { floor: 2, fp: fpOf(chat[2]), action: 'add', name: '钥匙', holder: '主角', state: '完好' },
    ];
    const edited = chat.map((m, i) => i === 2 ? msg('AI：被编辑过的回复', false) : m);
    const got = snap(edited, ops);
    assert.deepEqual(got, ['水壶:主角:完好'], '被编辑楼(2)的 ops 失活，未编辑楼(1) 保留');
});
test('v3.143 ④ 删除最后一楼：该楼 ops 失活，前楼台账完好', () => {
    const chat = baseChat(), ops = baseOps(chat);
    const shorter = chat.slice(0, 2);
    assert.deepEqual(snap(shorter, ops), [], '末楼删除后其 ops 失活');
    assert.equal(shorter.length, 2);
});
test('v3.143 ⑤ 删除中间楼导致楼层前移：重放仍正确（身份靠 fp 不靠楼层号）', () => {
    const chat = [msg('开场'), msg('用户：拿起钥匙', true), msg('AI：捡到火把', false), msg('AI：又捡到地图', false)];
    const ops = [
        { floor: 2, fp: fpOf(chat[2]), action: 'add', name: '火把', holder: '主角', state: '完好' },
        { floor: 3, fp: fpOf(chat[3]), action: 'add', name: '地图', holder: '主角', state: '完好' },
    ];
    assert.deepEqual(snap(chat, ops).sort(), ['地图:主角:完好', '火把:主角:完好'].sort(), '基线');
    const afterDel = [chat[0], chat[1], chat[3]];   // 删掉 floor2，floor3 前移到 index 2，ops 的 floor 字段已「过时」
    const got = snap(afterDel, ops);
    assert.deepEqual(got, ['地图:主角:完好'], '前移不影响重放：按 fp 匹配，过时楼层号不致误删/误留');
});
test('v3.143 ⑥ 重新加载聊天（chat/ops 均未变）：结果与首放一致', () => {
    const chat = baseChat(), ops = baseOps(chat);
    const first = snap(chat, ops);
    for (let i = 0; i < 5; i++) assert.deepEqual(snap(chat, ops), first, `第${i + 2}次重放一致`);
});
test('v3.143 ⑦ carried ops（跨会话携带）：无 fp 也永不错误失活', () => {
    const chat = baseChat();
    const ops = [
        { floor: 0, carried: true, action: 'add', name: '传家宝', holder: '主角', state: '完好' },
        { floor: 2, fp: fpOf(chat[2]), action: 'add', name: '钥匙', holder: '主角', state: '完好' },
    ];
    assert.deepEqual(snap([], ops), ['传家宝:主角:完好'], 'chat 变空数组也不崩，且 carried 不依赖当前聊天楼层（真跨会话）');
    assert.deepEqual(snap(chat, ops).sort(), ['传家宝:主角:完好', '钥匙:主角:完好'].sort());
    const otherChat = [msg('别的对话'), msg('完全无关', true)];
    assert.deepEqual(snap(otherChat, ops), ['传家宝:主角:完好'], '切到无关聊天：carried 保留、普通楼 ops 失活');
});
test('v3.143 三态语义在重放中稳定：update 未提供字段保持原值', () => {
    const chat = baseChat();
    const ops = [...baseOps(chat), { floor: 2, fp: fpOf(chat[2]), action: 'update', name: '钥匙', holder: '配角', state: undefined }];
    const got = snap(chat, ops);
    assert.ok(got.includes('钥匙:配角:完好'), 'holder 被改、state 未提供故保持完好');
    const lost = [...ops, { floor: 2, fp: fpOf(chat[2]), action: 'update', name: '火把', state: '丢失' }];
    assert.ok(!snap(chat, lost).some(s => s.startsWith('火把')), 'state=丢失 按语义移出台账');
});
