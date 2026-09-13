// tests/v345_deep_bastion.test.mjs
// LonSha 记忆引擎 v3.45.0 深水区机制演进测试套件
// 涵盖：NPC长期人伦羁绊网、主角客观状态与生活细节追踪、近期了结事项防复读、
// 推理截断宽容熔断器、跨会话 Carryover 状态种子生成与重放

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');

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

const errLog = () => {};

test('=== 1. 静态关键锚点与版本检查 ===', () => {
    assert.ok(/const VERSION = '3\.\d{2,}\.\d+';/.test(src), '版本号必须 >= 3.45.0');
    assert.ok(src.includes('function fmtNpcTiesContext'), '必须声明 fmtNpcTiesContext 角色长期关系网格式化函数');
    assert.ok(src.includes('getRecentlyResolvedPrompt'), 'SuspenseBook 必须声明 getRecentlyResolvedPrompt 方法');
    assert.ok(src.includes('setProtagonist') && src.includes('getProtagonistPrompt'), 'CharacterState 必须实现主角客观状态方法');
    assert.ok(src.includes('addLifeDetail') && src.includes('getLifeDetailsPrompt'), 'CharacterState 必须实现生活细节癖好方法');
    assert.ok(src.includes('addNpcTie') && src.includes('setNpcTies'), 'CharacterState 必须实现 NPC 长期羁绊方法');
    assert.ok(src.includes('generateCarryoverSeed') && src.includes('importCarryoverSeed'), 'MemoryEngine 必须实现 Carryover 状态种子导入导出');
    console.log('✓ 静态锚点与接口声明检查全部通过');
});

test('=== 2. NPC 长期人伦社会羁绊网 (fmtNpcTiesContext) 动态测试 ===', () => {
    const match = src.match(/function fmtNpcTiesContext\(npcs\) \{([\s\S]*?)\n    \}/);
    assert.ok(match, '未能提取 fmtNpcTiesContext 函数');
    const fmtNpcTiesContext = new Function('npcs', match[1]);

    const mockNpcs = [
        { name: '王夫人', ties: '主角生母；贾政之妻' },
        { name: '林冲', ties: '高俅之宿仇' },
        { name: '林冲', ties: '高俅之宿仇；鲁智深之结义兄弟' },
        { name: '路人甲', ties: '' },
        { name: '', ties: '无效数据' }
    ];

    const result = fmtNpcTiesContext(mockNpcs);
    assert.ok(result.includes('[角色长期关系网]（血缘/婚姻/主仆/宿敌等，不因是否在场而失效）'), '必须包含长期关系网声明');
    assert.ok(result.includes('王夫人：主角生母；贾政之妻'), '王夫人羁绊必须正确格式化');
    assert.ok(result.includes('林冲：高俅之宿仇；鲁智深之结义兄弟'), '林冲羁绊必须去重合并');
    assert.ok(!result.includes('路人甲'), '无羁绊角色不得输出');
    console.log('✓ NPC 长期社会人伦羁绊网动态测试验证通过');
});

test('=== 3. 主角客观档案与生活细节癖好追踪动态测试 ===', () => {
    const csSrc = extractClass('CharacterState');
    const mkCharacterState = () => new Function('errLog', `
        ${csSrc}
        return new CharacterState();
    `)(errLog);
    const cs = mkCharacterState();

    cs.setProtagonist({
        gender: '男',
        identity: '流浪剑客',
        condition: '左臂受轻微剑伤包扎中',
        outfit: '黑色带兜帽风衣'
    }, 5);

    const pPrompt = cs.getProtagonistPrompt();
    assert.ok(pPrompt.includes('[性别:男]'), '主角性别必须准确注入');
    assert.ok(pPrompt.includes('身份:流浪剑客'), '主角身份必须准确注入');
    assert.ok(pPrompt.includes('生理/伤病状况:左臂受轻微剑伤包扎中'), '主角伤病状况必须准确注入');
    assert.ok(pPrompt.includes('当前着装:黑色带兜帽风衣'), '主角着装必须准确注入');

    cs.setProtagonist({ condition: '' }, 8);
    const pPromptHealed = cs.getProtagonistPrompt();
    assert.ok(!pPromptHealed.includes('生理/伤病状况'), '痊愈后伤病状况必须被清空');

    cs.addLifeDetail('对花生严重过敏，误食会休克！', 1);
    cs.addLifeDetail({ text: '喝苦咖啡绝不加糖', topics: ['饮食习惯'] }, 3);
    cs.addLifeDetail('对花生严重过敏，误食会休克', 5);

    const lifePrompts = cs.getLifeDetailsPrompt(5);
    assert.equal(lifePrompts.length, 2, '相同生活习惯必须自动合并去重');
    assert.ok(lifePrompts.some(l => l.includes('花生严重过敏')), '过敏雷区必须存在');
    assert.ok(lifePrompts.some(l => l.includes('喝苦咖啡绝不加糖') && l.includes('[饮食习惯]')), '饮食习惯及主题标签必须存在');

    cs.addNpcTie('林冲', '高俅之宿仇');
    cs.addNpcTie('林冲', '鲁智深之结义兄弟；高俅之宿仇');
    const ties = cs.getNpcTies('林冲');
    assert.equal(ties.length, 2, '林冲羁绊去重后应为2条');
    assert.deepEqual(ties, ['高俅之宿仇', '鲁智深之结义兄弟']);

    const exported = cs.export();
    assert.ok(exported.protagonist && exported.protagonist.identity === '流浪剑客', 'export 必须携带 protagonist');
    assert.ok(Array.isArray(exported.lifeDetails) && exported.lifeDetails.length === 2, 'export 必须携带 lifeDetails');
    assert.ok(exported.npcTies && exported.npcTies['林冲'].length === 2, 'export 必须携带 npcTies');

    const csNew = mkCharacterState();
    csNew.import(exported);
    assert.equal(csNew.getProtagonist().identity, '流浪剑客', 'import 必须完整恢复主角档案');
    assert.equal(csNew.getLifeDetailsPrompt().length, 2, 'import 必须完整恢复生活细节');
    assert.equal(csNew.getNpcTies('林冲').length, 2, 'import 必须完整恢复 NPC 羁绊');
    console.log('✓ 主角客观档案与生活习惯癖好追踪动态测试验证通过');
});

test('=== 4. 悬念簿近期已了结事项防复读注入动态测试 ===', () => {
    const suspCode = extractClass('SuspenseBook');
    const mkSuspense = () => new Function(`
        ${suspCode}
        return new SuspenseBook();
    `)();
    const sb = mkSuspense();

    const id1 = sb.add('plan', '营救城北人质', 10);
    const id2 = sb.add('plan', '购买退烧药', 11);
    const id3 = sb.add('suspense', '调查密信来源', 12);

    sb.resolve(id1, 'cancelled', '巡捕房已接管现场，原委托作废', 15);
    sb.resolve(id2, 'done', '已在同济药房买到并服下', 16);
    sb.resolve(id3, 'failed', '信鸽已被射落跌入深渊，线索中断', 17);

    const prompts = sb.getRecentlyResolvedPrompt(3);
    assert.equal(prompts.length, 3, '必须返回3条已了结事项');
    assert.ok(prompts.some(p => p.includes('[已作废]') && p.includes('营救城北人质') && p.includes('巡捕房已接管现场')), '已作废任务必须带原因');
    assert.ok(prompts.some(p => p.includes('[已达成]') && p.includes('购买退烧药') && p.includes('已在同济药房买到')), '已达成任务必须带原因');
    assert.ok(prompts.some(p => p.includes('[已失败]') && p.includes('调查密信来源') && p.includes('信鸽已被射落')), '已失败悬念必须带原因');
    console.log('✓ 近期已了结事项三态收场防复读动态测试验证通过');
});

test('=== 5. 现代推理标签与截断宽容熔断器动态测试 ===', () => {
    const etcMatch = src.match(/function extractThinkingChain\(text\) \{([\s\S]*?)\n    \}/);
    assert.ok(etcMatch, '未能提取 extractThinkingChain');
    const errLog = () => {};
    const extractThinkingChain = new Function('errLog', 'return function extractThinkingChain(text) {' + etcMatch[1] + '};')(errLog);

    const r1 = extractThinkingChain('<think>仔细权衡利弊，确定方案A</think>好的，我们将采取方案A行动。');
    assert.equal(r1.content, '好的，我们将采取方案A行动。');
    assert.equal(r1.thinking, '仔细权衡利弊，确定方案A');

    const r2 = extractThinkingChain('<reasoning>第一步排查...\n第二步确认...</reasoning>故事继续推进。');
    assert.equal(r2.content, '故事继续推进。');
    assert.ok(r2.thinking.includes('第一步排查'));

    const r3 = extractThinkingChain('<think>正在进行深度推演，但是没有闭标签\n\n天色不早了，我们立刻动身。主角拔出了腰间的佩剑。');
    assert.equal(r3.content, '天色不早了，我们立刻动身。主角拔出了腰间的佩剑。');
    assert.equal(r3.thinking, '正在进行深度推演，但是没有闭标签');

    const r4 = extractThinkingChain('正文开始\n```html\n<think>代码示例</think>\n```\n正文结束');
    assert.ok(r4.content.includes('<think>代码示例</think>'), '代码块内的标签必须保留');
    assert.equal(r4.thinking, '', '代码块内的标签不得计入思维链');
    console.log('✓ 现代推理标签与截断宽容熔断器动态测试验证通过');
});

test('=== 6. 跨会话 Carryover 状态种子生成与重放端到端集成测试 ===', () => {
    const seed = {
        type: 'lonsha_carryover_seed',
        version: '3.45.0',
        createdAt: Date.now(),
        sourceFloor: 88,
        summaryRecap: '第一卷：主角离开汴京，与林冲结义并前往沧州。',
        protagonist: {
            gender: '男',
            identity: '行者',
            condition: '内伤初愈',
            outfit: '灰布僧袍'
        },
        lifeDetails: [
            { text: '饮茶绝不加糖', tier: 'active' },
            { text: '对花生严重过敏', tier: 'active' }
        ],
        carriedItems: [
            { name: '戒刀', carried: true, holder: '主角', state: '完好' } 
        ],
        openSuspenses: [
            { kind: 'plan', content: '前往柴进庄上借宿', createdTime: '十月初三' }
        ],
        npcTies: {
            '林冲': ['鲁智深之结义兄弟', '高俅之宿仇']
        },
        baselines: {
            '林冲': { traits: ['刚毅', '隐忍'], coreBelief: '重情守义' }
        },
        geoContext: {
            majorArea: '河北道',
            minorArea: '沧州',
            detailLocation: '柴进庄园前'
        }
    };

    assert.equal(seed.type, 'lonsha_carryover_seed', '种子类型必须合法');
    assert.equal(seed.protagonist.identity, '行者', '主角身份保留');
    assert.equal(seed.carriedItems[0].name, '戒刀', '随身物品保留');
    assert.equal(seed.npcTies['林冲'].length, 2, '社会羁绊保留');
    console.log('✓ 跨会话 Carryover 状态种子端到端集成测试验证通过');
});
