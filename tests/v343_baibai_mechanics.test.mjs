// tests/v343_baibai_mechanics.test.mjs
// LonSha 记忆引擎 v3.43 吸收 baibai 顶尖文学工程机制测试套件
// 覆盖：NPC 四档压平分级注入与性别铁律、双界时间锚点与年龄时钟推算、图谱关系事件溯源 (Graph Delta Replay)
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
let pass = 0, fail = 0;
const ok = (msg) => { pass++; console.log('✓ ' + msg); };
const bad = (msg) => { fail++; console.log('✗ ' + msg); };

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
function extractClass(name) {
    const start = src.indexOf(`class ${name} {`);
    if (start < 0) throw new Error('missing class ' + name);
    const brace = src.indexOf('{', start);
    return src.slice(start, braceEnd(src, brace) + 1);
}

const normFn = (n) => String(n || '').normalize('NFKC').replace(/\s+/g, '').trim().toLowerCase();
const errLog = () => {};

console.log('=== 1. 静态关键锚点与版本检查 ===');
assert.ok(/VERSION = '3\.(4[3-9]|[5-9]\d)\.0'/.test(src), '版本号必须有效 (>= 3.43.0)');
assert.ok(src.includes('buildNpcTierInjection'), 'MemoryEngine 必须拥有 NPC 四档压平分级注入');
assert.ok(src.includes('extractDualTimeTags') && src.includes('calcAge'), 'RelativeTimeHelper 必须拥有双界时间提取与年龄推算');
assert.ok(src.includes('graphOps') && src.includes('rebuildGraphFromOps'), 'MemoryGraph 必须拥有关系事件溯源');
ok('静态锚点声明检查全部通过');

console.log('=== 2. NPC 四档压平注入与性别铁律动态测试 ===');
// 模拟引擎调用 buildNpcTierInjection
const engineMockSrc = src.slice(src.indexOf('function buildNpcTierInjection'), src.indexOf('// [v3.43] end NPC tier injection'));
const buildNpcFn = new Function('errLog', `
    ${engineMockSrc}
    return buildNpcTierInjection;
`)(errLog);

{
    const npcs = [
        { name: '博丽灵梦', gender: '女', roleTier: 'important', title: '博丽神社巫女', fields: [['状态', '泡茶悠闲'], ['心境', '平和']], todos: [{ text: '打扫塞钱箱' }] },
        { name: '雾雨魔理沙', gender: '女', roleTier: 'present', now: '坐在门槛上擦拭扫帚', fields: [['状态', '精力充沛']] },
        { name: '琪露诺', gender: '女', roleTier: 'same_area', traits: ['自称最强', '天真鲁莽', '好胜心强'], longAppearance: '这本是一段多达300字的长篇服饰与冰晶翅膀详细外貌描写...' },
        { name: '八云紫', gender: '女', roleTier: 'absent', title: '幻想乡贤者', relation: '暗中观察者，老相识' }
    ];

    const lines = buildNpcFn(npcs);
    assert.ok(lines.length >= 4);

    // 验证 Tier 1 (重点角色)
    const t1 = lines.find(l => l.includes('博丽灵梦'));
    assert.ok(t1.includes('[性别:女]'), '重要角色必须标注性别');
    assert.ok(t1.includes('打扫塞钱箱') && t1.includes('泡茶悠闲'), '包含状态与待办');

    // 验证 Tier 2 (在场角色)
    const t2 = lines.find(l => l.includes('雾雨魔理沙'));
    assert.ok(t2.includes('[性别:女]'));
    assert.ok(t2.includes('坐在门槛上擦拭扫帚'), '在场角色包含实时姿态白描');

    // 验证 Tier 3 (同区域角色)
    const t3 = lines.find(l => l.includes('琪露诺'));
    assert.ok(t3.includes('[性别:女]'));
    assert.ok(t3.includes('自称最强'), '保留核心性格防 OOC');
    assert.ok(!t3.includes('详细外貌描写'), '同区域角色剥除冗余长篇外貌，节约 Token');

    // 验证 Tier 4 (不在场角色) 与 oneLine 压平
    const t4 = lines.find(l => l.includes('八云紫'));
    assert.ok(t4.includes('[性别:女]'));
    assert.ok(t4.includes('幻想乡贤者'));
    assert.ok(!t4.includes('\n'), '不在场角色必须单行压平 (oneLine)');
    ok('NPC 四档压平分级注入、Token削减与性别称谓铁律验证通过');
}

console.log('=== 3. 双界时间锚点与年龄/天数推算动态测试 ===');
const rthSrc = extractClass('RelativeTimeHelper');
const mkRelativeTimeHelper = () => new Function('errLog', `
    ${rthSrc}
    return new RelativeTimeHelper();
`)(errLog);

{
    const rth = mkRelativeTimeHelper();
    
    // 1. 双界时间锚点提取
    const dualText = '前面走着。<bbs_start>2024/05/10 14:00</bbs_start>两人在林中漫步交谈。<bbs_end>2024/05/10 16:30</bbs_end>夜幕降临。';
    const dt = rth.extractDualTimeTags(dualText);
    assert.ok(dt.hasDual);
    assert.equal(dt.start, '2024/05/10 14:00');
    assert.equal(dt.end, '2024/05/10 16:30');
    assert.equal(dt.durationMinutes, 150, '经过时间推算应为 150 分钟 (2.5小时)');

    // 2. 年龄精准推算
    const age1 = rth.calcAge('2000/08/15', '2020/05/10'); // 未过生日
    assert.equal(age1, 19);
    const age2 = rth.calcAge('2000/08/15', '2020/08/20'); // 已过生日
    assert.equal(age2, 20);

    // 3. 相识天数推算
    const days = rth.calcDaysTogether('2024/01/01', '2024/01/20');
    assert.equal(days, 19);
    ok('双界时间提取、分钟级时长差与年龄/相识天数时钟推算验证通过');
}

console.log('=== 4. 图谱关系事件溯源 (Graph Delta Replay) 动态测试 ===');
const conflictDef = `
const RELATION_CONFLICT_GROUPS = [
    new Set(['陌生', '相识', '友好', '暧昧', '暗恋', '热恋', '恋人', '夫妻', '冷战', '决裂', '陌路']),
    new Set(['盟友', '同行', '中立', '对立', '敌对', '宿敌', '仇敌', '背叛'])
];
function areLabelsInConflict(l1, l2) {
    if (!l1 || !l2 || l1 === l2) return false;
    for (const group of RELATION_CONFLICT_GROUPS) {
        if (group.has(l1) && group.has(l2)) return true;
    }
    const p1 = '\${l1}-\${l2}';
    if (/恋人-决裂|决裂-恋人|友好-敌对|敌对-友好|盟友-宿敌|宿敌-盟友/i.test(p1)) return true;
    return false;
}
`;
const graphSrc = extractClass('MemoryGraph');
const mkGraph = () => new Function('normalizeCharName', 'errLog', `
    ${conflictDef}
    ${graphSrc}
    return new MemoryGraph();
`)(normFn, errLog);

{
    const g = mkGraph();
    const idA = g.addNode({ name: '灵梦', type: 'character' });
    const idB = g.addNode({ name: '魔理沙', type: 'character' });

    // 第 1 楼：建立好友关系
    g.addEdge({ from: idA, to: idB, label: '友好', validFrom: 1, floor: 1 });
    assert.equal(g.graphOps.length, 1);

    // 第 5 楼：关系升级为恋人
    g.addEdge({ from: idA, to: idB, label: '恋人', validFrom: 5, floor: 5 });
    assert.equal(g.graphOps.length, 2);
    assert.equal(g.edges.get(`${idA}-${idB}-恋人`).active, true);

    // 第 10 楼：突发决裂（废案楼层）
    g.addEdge({ from: idA, to: idB, label: '决裂', validFrom: 10, floor: 10 });
    assert.equal(g.graphOps.length, 3);
    assert.equal(g.edges.get(`${idA}-${idB}-恋人`).active, false, '恋人应已被决裂闭环');

    // 玩家滑动 Swipe / 删楼，回滚到第 7 楼（废弃第 10 楼的决裂）
    g.rollbackGraphFrom(8);
    
    // 验证事件溯源重放结果：
    assert.equal(g.graphOps.length, 2, '第 10 楼的 op 应被剔除');
    const loverEdge = g.edges.get(`${idA}-${idB}-恋人`);
    assert.ok(loverEdge, '恋人边应存在');
    assert.equal(loverEdge.active, true, '回滚后恋人关系应自然复活，恢复活跃状态');
    assert.equal(g.edges.get(`${idA}-${idB}-决裂`), undefined, '废案决裂边彻底消失无痕');
    ok('图谱关系事件溯源记录、楼层回滚截断与幂等重放自愈验证通过');
}

console.log('[V343 TESTS PASSED] baibai 机制演进测试套件全部通过！');
