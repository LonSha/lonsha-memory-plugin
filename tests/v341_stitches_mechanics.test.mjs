// tests/v341_stitches_mechanics.test.mjs
// LonSha 记忆引擎 v3.41 吸收 Stitches 工业级工作流机制测试套件
// 覆盖：约定账本 (Promises Ledger)、认知隔离 (Cognitive Horizon)、
//       紧凑 AM 记忆地址编码 (Memory Address Code)、剧情支线衰减时钟 (Plot Arc Decay)、
//       以及终极上下文推理标签净化 (Context Cleaning Shield)
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
assert.ok(src.includes("const VERSION = '3.41.0';"), '版本号必须递增至 3.41.0');
assert.ok(src.includes('addPromise') && src.includes('checkPromises'), 'WorldProgress 必须实现约定账本 (Promises Ledger)');
assert.ok(src.includes('markUnaware') && src.includes('getReEntryNotice'), 'WorldProgress 必须实现认知隔离 (Cognitive Horizon)');
assert.ok(src.includes('generateAMIndex') && src.includes('resolveByAMCodes'), 'SummarySystem 必须实现紧凑 AM 记忆地址编码');
assert.ok(src.includes('decayArcs') && src.includes('touchArc'), 'WorldProgress 必须实现支线生命周期与衰减时钟');
assert.ok(src.includes('stripInternalTags') || src.includes('stripMemoryOpsTags'), '必须拥有标签过滤净化函数');
ok('静态锚点与接口声明检查全部通过');

console.log('=== 2. 约定账本 (Promises Ledger) 动态测试 ===');
const wpSrc = extractClass('WorldProgress');
const mkWorldProgress = () => new Function('errLog', `
    ${wpSrc}
    return new WorldProgress();
`)(errLog);

{
    const wp = mkWorldProgress();
    // 添加约定：爱丽丝承诺在第 15 楼送还书籍
    const p1 = wp.addPromise({
        character: '爱丽丝',
        content: '在图书馆归还借阅的禁忌典籍',
        deadlineFloor: 15,
        floor: 5
    });
    assert.ok(p1.id && p1.id.startsWith('prom_'));
    assert.equal(p1.status, 'pending');

    // 模拟推进到第 10 楼：状态保持 pending
    wp.checkPromises(10);
    assert.equal(p1.status, 'pending');

    // 模拟推进到第 13 楼：临近截止（<= deadline - 2），标记为 imminent (临近告急)
    wp.checkPromises(13);
    assert.equal(p1.status, 'imminent');
    const injImminent = wp.toInjection();
    assert.ok(injImminent.some(i => i.text.includes('即将到期') && i.text.includes('爱丽丝')), '即将到期的约定必须高优先级出现在注入提示中');

    // 模拟推进到第 16 楼：超时未履行，标记为 overdue (逾期)
    wp.checkPromises(16);
    assert.equal(p1.status, 'overdue');
    const injOverdue = wp.toInjection();
    assert.ok(injOverdue.some(i => i.text.includes('已逾期') && i.text.includes('归还借阅')), '逾期约定必须被显式警示');

    // 履行约定
    wp.fulfillPromise(p1.id);
    assert.equal(p1.status, 'fulfilled');
    const injFulfilled = wp.toInjection();
    assert.ok(!injFulfilled.some(i => i.text.includes(p1.id)), '已履行的约定不再在活跃注入区显示');
    ok('约定账本添加、临近到期预警、逾期检测与履行全生命周期验证通过');
}

console.log('=== 3. 认知隔离 (Cognitive Horizon) 动态测试 ===');
{
    const wp = mkWorldProgress();
    // 记录：帕秋莉不在场期间，发生了“地下室秘宝被盗”事件，帕秋莉不知情
    wp.markUnaware('帕秋莉', '地下室魔法水晶被神秘黑影盗走');
    wp.markUnaware('帕秋莉', '红美铃被迷药击倒昏睡');

    // 帕秋莉重新登场时，生成认知边界提醒
    const notice = wp.getReEntryNotice('帕秋莉');
    assert.ok(notice.includes('认知隔离提示'), '重返场景必须生成认知隔离提示');
    assert.ok(notice.includes('尚未得知：地下室魔法水晶被神秘黑影盗走'), '未察觉事件必须明确罗列');
    assert.ok(notice.includes('切勿未卜先知'), '必须包含防剧透与禁止预知指令');

    // 剧情中有人告知了帕秋莉其中一条
    wp.revealKnowledge('帕秋莉', '地下室魔法水晶被神秘黑影盗走', '博丽灵梦告知');
    const notice2 = wp.getReEntryNotice('帕秋莉');
    assert.ok(!notice2.includes('尚未得知：地下室魔法水晶被神秘黑影盗走'), '已被告知的事实移出未知区');
    assert.ok(notice2.includes('尚未得知：红美铃被迷药击倒昏睡'), '其他未知事实依然严格保持隔离');
    ok('认知隔离未知标记、重返场景提示与知识解禁验证通过');
}

console.log('=== 4. 紧凑 AM 记忆地址编码 (Memory Address Code) 动态测试 ===');
const sumSrc = extractClass('SummarySystem');
const mkSummary = () => new Function('errLog', `
    ${sumSrc}
    return new SummarySystem();
`)(errLog);

{
    const s = mkSummary();
    s.createSummary({ floor: 1, mes: '用户初次来到红魔馆' }, '初次来到红魔馆拜访');
    s.createSummary({ floor: 5, mes: '爱丽丝带来了关于雾之湖的警告' }, '爱丽丝警告雾之湖有异动');
    s.createSummary({ floor: 12, mes: '地下室传来巨大震动' }, '地下室发生神秘爆炸');

    // 生成 AM 紧凑地址索引表
    const indexStr = s.generateAMIndex();
    assert.ok(indexStr.includes('[AM1]') && indexStr.includes('初次来到红魔馆'));
    assert.ok(indexStr.includes('[AM5]') && indexStr.includes('爱丽丝警告雾之湖'));
    assert.ok(indexStr.includes('[AM12]') && indexStr.includes('地下室发生神秘爆炸'));

    // 通过 AM 编码快速寻址召回完整记忆
    const resolved = s.resolveByAMCodes('AM1, AM12');
    assert.equal(resolved.length, 2);
    assert.equal(resolved[0].floor, 1);
    assert.equal(resolved[1].floor, 12);
    assert.equal(resolved[0].text, '初次来到红魔馆拜访');
    ok('AM 紧凑地址索引生成与代码快速寻址反解验证通过');
}

console.log('=== 5. 剧情支线衰减时钟 (Plot Arc Decay) 动态测试 ===');
{
    const wp = mkWorldProgress();
    const arc1 = wp.addPlotArc({
        title: '调查雾之湖异变',
        clue: '湖水散发着古怪的妖气并出现不明水怪',
        currentFloor: 5,
        interestedBy: '琪露诺'
    });
    assert.equal(arc1.status, 'active');

    // 推进 5 轮（第 10 楼），依然活跃
    wp.decayArcs(10, 15);
    assert.equal(arc1.status, 'active');

    // 推进超过 15 轮（第 25 楼）无人问津，自动衰减为 shelved (搁置)
    wp.decayArcs(25, 15);
    assert.equal(arc1.status, 'shelved');
    const injShelved = wp.toInjection();
    assert.ok(!injShelved.some(i => i.text.includes('调查雾之湖异变')), '搁置支线不再在活跃注入区占用 Token');

    // 对话重新触碰该支线（touchArc）→ 瞬间复活
    wp.touchArc(arc1.id, 28);
    assert.equal(arc1.status, 'active');
    assert.equal(arc1.lastActiveFloor, 28);
    ok('剧情支线活跃记录、无互动自动衰减搁置与关键词触碰复活验证通过');
}

console.log('=== 6. 终极上下文标签净化 (Context Cleaning Shield) 动态测试 ===');
{
    const cleanFn = new Function('src', `
        ${src.slice(src.indexOf('function stripMemoryOpsTags'), src.indexOf('function extractTimeTagFast'))}
        return stripMemoryOpsTags;
    `)(src);

    const dirtyText = `
你好，我是爱丽丝。<time:Day3 14:00>
<recall>AM1, AM5, AM12</recall>
<dm_plan>思考：检查历史事件，得出方案...</dm_plan>
<inner>### [爱丽丝]
inner_voice: 我心里正想着别的事
aside: 今天的红茶有点凉了</inner>
<act>### [爱丽丝]
now: 坐在椅子上
beat: 放下茶杯并抬头微笑</act>
<scene>Day: 3 | 天气: 晴 | 地点: 客厅</scene>
<dm_story>[主线] 推进调查</dm_story>
<npc_track>### [帕秋莉]
当前动向: 在图书馆看书</npc_track>
这是真正对用户说的正文对白。`;

    const cleaned = cleanFn(dirtyText);
    assert.ok(!cleaned.includes('<recall>'), 'recall 标签应被剥除');
    assert.ok(!cleaned.includes('<dm_plan>'), 'dm_plan 标签应被剥除');
    assert.ok(!cleaned.includes('<inner>'), 'inner 标签应被剥除');
    assert.ok(!cleaned.includes('<act>'), 'act 标签应被剥除');
    assert.ok(!cleaned.includes('<scene>'), 'scene 标签应被剥除');
    assert.ok(!cleaned.includes('<dm_story>'), 'dm_story 标签应被剥除');
    assert.ok(!cleaned.includes('<npc_track>'), 'npc_track 标签应被剥除');
    assert.ok(!cleaned.includes('<time:'), 'time 操作符应被剥除');
    assert.ok(cleaned.includes('你好，我是爱丽丝。') && cleaned.includes('这是真正对用户说的正文对白。'), '正文文本必须完整保留');
    ok('终极上下文净化规则成功剥除全部跑团与思维链中间标签，且正文无损保留');
}

console.log('[V341 TESTS PASSED] Stitches 机制演进测试套件全部通过！');
