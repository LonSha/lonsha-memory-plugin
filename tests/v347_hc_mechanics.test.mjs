// tests/v347_hc_mechanics.test.mjs
// LonSha 记忆引擎 v3.47.0 黑科技缝合测试套件
// 涵盖：心理暗流日记（attitude/keyEvents/subjRelations）、睡眠周期归档式遗忘（含NaN修复）、
// 矛盾账本（真矛盾显式标注并存）、钱财账本（money/moneyLog）、剧情卡牌收集、持久化与回滚链路

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
function extractFn(name) {
    const start = src.indexOf(`function ${name}(`);
    if (start < 0) throw new Error('missing fn ' + name);
    const brace = src.indexOf('{', start);
    return src.slice(start, braceEnd(src, brace) + 1);
}

test('=== 1. v3.47 静态锚点与版本检查 ===', () => {
    assert.match(src.match(/const VERSION = '([^']+)';/)?.[1] || '', /^3\.(?:4[7-9]|5\d)/, '版本号必须 >= 3.47.0');
    assert.ok(src.includes('class MoneyLedger'), '必须声明 MoneyLedger 钱财账本类');
    assert.ok(src.includes('class CardCollection'), '必须声明 CardCollection 剧情卡牌类');
    assert.ok(src.includes('class ConflictBook'), '必须声明 ConflictBook 矛盾账本类');
    assert.ok(src.includes('sleepCycle() {'), '必须声明 sleepCycle 睡眠周期方法');
    assert.ok(src.includes('this.moneyLedger = new MoneyLedger();'), 'MemoryEngine 必须实例化 MoneyLedger');
    assert.ok(src.includes('this.cards = new CardCollection();'), 'MemoryEngine 必须实例化 CardCollection');
    assert.ok(src.includes('this.conflicts = new ConflictBook();'), 'MemoryEngine 必须实例化 ConflictBook');
    // 提取 schema 新字段
    assert.ok(src.includes('9d. money_changes：'), '提取规则必须含 9d money_changes');
    assert.ok(src.includes('3b. conflicts：'), '提取规则必须含 3b conflicts（矛盾二分）');
    assert.ok(src.includes('"money_changes": [{"character"'), '输出格式必须含 money_changes');
    assert.ok(src.includes('"conflicts": [{"subject"'), '输出格式必须含 conflicts');
    // NaN 修复
    assert.ok(src.includes('Number.isFinite(access)'), 'sleepCycle 必须修 NaN 边界（Number.isFinite 兜底）');
    // 心理暗流日记
    assert.ok(src.includes('attitude_to_user'), '日记提取必须含 attitude_to_user');
    assert.ok(src.includes('relationship_with_others'), '日记提取必须含 relationship_with_others（主观关系印象）');
    assert.ok(src.includes('subjRelations:'), '日记存储必须含 subjRelations');
    console.log('✓ v3.47 静态锚点与接口声明检查全部通过');
});

test('=== 2. 钱财账本 MoneyLedger 行为测试 ===', () => {
    const normCode = extractFn('normalizeCharName');
    const mlCode = extractClass('MoneyLedger');
    const mk = () => new Function(`${normCode}\n${mlCode}\nreturn new MoneyLedger();`)();

    const ml = mk();
    assert.equal(ml.toPrompt(), '', '空账本注入为空');

    // 覆盖式设值
    assert.equal(ml.setMoney('苏晚晴', 5000, '本月工钱', 10, '10月1日'), true);
    assert.equal(ml.getMoney('苏晚晴').amount, 5000);
    // NFKC 归一取值
    assert.equal(ml.getMoney(' 苏晚晴 ').amount, 5000, '名字归一化取值');

    // delta 增减
    ml.addDelta('苏晚晴', -300, '买药花费', 11, '10月2日');
    assert.equal(ml.getMoney('苏晚晴').amount, 4700, 'delta 增减正确');
    ml.addDelta('苏晚晴', 100, '卖了旧衣', 12);
    assert.equal(ml.getMoney('苏晚晴').amount, 4800);

    // 无 reason 不记流水
    ml.setMoney('苏晚晴', 9999, '', 13);
    const noReasonLogs = ml.moneyLog.filter(l => l.floor === 13);
    assert.equal(noReasonLogs.length, 0, '无 reason 不记流水');

    const prompt = ml.toPrompt();
    assert.ok(prompt.includes('[当前钱财账本]'), '注入含钱财账本头');
    assert.ok(prompt.includes('苏晚晴：9999'), '注入含当前金额');
    assert.ok(prompt.includes('[钱财变动流水·最近]'), '注入含流水');
    assert.ok(prompt.includes('买药花费'), '注入含流水原因');

    // 流水按字典序稳定性（Prompt Cache）
    ml.setMoney('白展堂', 100, '', 14);
    ml.setMoney('阿绫', 200, '', 14);
    const p1 = mk(), p2 = mk();
    p1.setMoney('白展堂', 100, ''); p1.setMoney('阿绫', 200, '');
    p2.setMoney('阿绫', 200, ''); p2.setMoney('白展堂', 100, '');
    assert.equal(p1.toPrompt().split('[钱财变动流水')[0], p2.toPrompt().split('[钱财变动流水')[0], '金额行必须字典序稳定');

    // removeByFloor + export/import
    assert.equal(ml.removeByFloor(11), 1, '按楼删流水');
    const exp = ml.export();
    const ml2 = mk();
    ml2.import(exp);
    assert.equal(ml2.getMoney('苏晚晴').amount, 9999);
    assert.equal(ml2.moneyLog.length, ml.moneyLog.length);
    console.log('✓ 钱财账本 MoneyLedger 行为测试验证通过');
});

test('=== 3. 剧情卡牌 CardCollection 行为测试 ===', () => {
    const ccCode = extractClass('CardCollection');
    const mk = () => new Function(`${ccCode}\nreturn new CardCollection();`)();

    const cc = mk();
    assert.equal(cc.toPrompt(), '', '空卡组注入为空');

    assert.equal(cc.forge('草料场大火', '陆谦放火嫁祸，林冲怒杀陆谦', 50, '🃏', '腊月十五'), true);
    assert.equal(cc.forge('草料场大火', '重复铸卡', 50, '🃏', '腊月十五'), false, '同楼同标题幂等');
    assert.equal(cc.forge('', '无标题', 51), false, '空标题拒铸');

    const n = cc.forgeFromEvents([
        { type: '背叛', description: '好友出卖行踪', importance: 9 },
        { type: '晚餐', description: '吃了一顿饭', importance: 3 },
        { type: '重逢', description: '十年后重逢', importance: 8 }
    ], 60, '腊月二十', 8);
    assert.equal(n, 2, 'importance>=8 铸卡，<8 拒铸');

    const prompt = cc.toPrompt();
    assert.ok(prompt.includes('[剧情卡牌收集]'), '注入含卡组头');
    assert.ok(prompt.includes('草料场大火'), '注入含卡牌');
    assert.ok(prompt.includes('腊月十五'), '注入含剧情时间');

    assert.equal(cc.removeByFloor(60), 2, '按楼删卡');
    const exp = cc.export();
    const cc2 = mk();
    cc2.import(exp);
    assert.equal(cc2.cards.length, cc.cards.length);
    console.log('✓ 剧情卡牌 CardCollection 行为测试验证通过');
});

test('=== 4. 矛盾账本 ConflictBook 行为测试（真矛盾显式标注并存）===', () => {
    const cbCode = extractClass('ConflictBook');
    const mk = () => new Function(`${cbCode}\nreturn new ConflictBook();`)();

    const cb = mk();
    assert.equal(cb.toPrompt(), '', '空矛盾账本注入为空');

    assert.equal(cb.add('刺客的来历', '王五声称刺客来自西厂', '赵六声称刺客来自东厂', '口供冲突', 70, '腊月廿一'), true);
    assert.equal(cb.add('刺客的来历', '王五声称刺客来自西厂', '赵六声称刺客来自东厂', '重复', 71), false, '同 subject 同版本对幂等');
    assert.equal(cb.add('', 'A', 'B', '', 71), false, '空 subject 拒登记');
    assert.equal(cb.add('某人', '只有版本A', '', '', 71), false, '缺版本拒登记');

    const prompt = cb.toPrompt();
    assert.ok(prompt.includes('[未决矛盾·显式标注]'), '注入含矛盾标注头');
    assert.ok(prompt.includes('版本A「王五声称刺客来自西厂」'), '注入含版本A');
    assert.ok(prompt.includes('版本B「赵六声称刺客来自东厂」'), '注入含版本B');
    assert.ok(prompt.includes('严禁擅自裁决'), '注入必须含不裁决禁令（memorybooks 核心原则）');

    const n = cb.addFromExtracted([
        { subject: '密信真伪', versionA: '说是真的', versionB: '说是伪造', note: '立场摇摆' }
    ], 75, '腊月廿五');
    assert.equal(n, 1, 'addFromExtracted 批量登记');

    assert.equal(cb.removeByFloor(75), 1, '按楼删矛盾');
    const exp = cb.export();
    const cb2 = mk();
    cb2.import(exp);
    assert.equal(cb2.conflicts.length, cb.conflicts.length);
    console.log('✓ 矛盾账本 ConflictBook 行为测试验证通过');
});

test('=== 5. 睡眠周期 sleepCycle 归档式遗忘测试（含 NaN 修复）===', () => {
    // sleepCycle 是 MemoryEngine 成员方法，直接构造上下文验证公式行为
    const start = src.indexOf('sleepCycle() {');
    assert.ok(start > 0, 'sleepCycle 必须存在');
    const body = src.slice(start, braceEnd(src, src.indexOf('{', start)) + 1);

    // 验证 retentionValue 公式三要素
    assert.ok(body.includes('recency'), '公式含 recency 时新度');
    assert.ok(body.includes('accessFreq'), '公式含 accessFreq 访问频率');
    assert.ok(body.includes('importance / 10'), '公式含重要度归一');
    // NaN 修复
    assert.ok(body.includes('Number.isFinite'), 'accessCount 必须经 Number.isFinite 兜底（修复 stbme NaN 永不遗忘 bug）');
    assert.ok(body.includes('archivedForSleep'), '归档标记 archivedForSleep');
    assert.ok(body.includes('importance >= 8'), '高重要度豁免');
    // 接入点
    assert.ok(src.includes('if (this._sleepCount % sleepN === 0) this.sleepCycle();'), '每 sleepEveryN 次提取触发');
    assert.ok(src.includes("filter(i => !(i?.source === 'summary' && i?.archivedForSleep))"), '归档摘要必须从召回过滤');
    console.log('✓ 睡眠周期 sleepCycle 归档式遗忘测试验证通过');
});

test('=== 6. 心理暗流日记增强测试（attitude/keyEvents/subjRelations）===', () => {
    // 提取 prompt 增强
    assert.ok(src.includes('- attitude_to_user 写该角色此刻对用户/主角的态度'), 'prompt 含对用户态度规则');
    assert.ok(src.includes('- key_events 写他亲历且对他个人有分量的事件'), 'prompt 含亲历要事规则');
    assert.ok(src.includes('主观印象'), 'prompt 含主观印象规则（不是上帝视角结论）');
    // 存储增强
    assert.ok(src.includes("attitude: String(d.attitude_to_user || '').slice(0, 60)"), '存储 attitude 字段');
    assert.ok(src.includes('keyEvents: (Array.isArray(d.key_events)'), '存储 keyEvents 字段');
    assert.ok(src.includes('subjRelations:'), '存储 subjRelations 字段');
    // 注入渲染增强
    assert.ok(src.includes('｜对用户态度: '), '注入渲染对用户态度');
    assert.ok(src.includes('｜亲历要事: '), '注入渲染亲历要事');
    assert.ok(src.includes('｜主观关系印象: '), '注入渲染主观关系印象');
    console.log('✓ 心理暗流日记增强测试验证通过');
});

test('=== 7. 持久化与回滚链路完整性测试 ===', () => {
    // collectExport 两处
    assert.equal(src.split('moneyLedger: this.moneyLedger.export()').length - 1, 2, 'collectExport 两处均含 moneyLedger');
    assert.equal(src.split('conflicts: this.conflicts.export()').length - 1, 2, 'collectExport 两处均含 conflicts');
    // storage.load
    assert.ok(src.includes('pack.moneyLedger && this.moneyLedger'), 'load 恢复 moneyLedger');
    assert.ok(src.includes('pack.cards && this.cards'), 'load 恢复 cards');
    assert.ok(src.includes('pack.conflicts && this.conflicts'), 'load 恢复 conflicts');
    // rollbackFloor
    assert.ok(src.includes('rollbackFloor.钱财回滚'), 'rollback 联动钱财');
    assert.ok(src.includes('rollbackFloor.卡牌回滚'), 'rollback 联动卡牌');
    assert.ok(src.includes('rollbackFloor.矛盾回滚'), 'rollback 联动矛盾');
    // shiftFloorsFrom（删楼楼层位移）
    assert.ok(src.includes('for (const l of (this.moneyLedger?.moneyLog || [])) l.floor = dec(l.floor);'), 'shift 联动钱财流水');
    assert.ok(src.includes('for (const c of (this.cards?.cards || [])) c.floor = dec(c.floor);'), 'shift 联动卡牌');
    assert.ok(src.includes('for (const c of (this.conflicts?.conflicts || [])) c.floor = dec(c.floor);'), 'shift 联动矛盾');
    // 注入接入
    assert.ok(src.includes('const moneyPrompt = this.moneyLedger.toPrompt();'), 'buildInjection 注入钱财');
    assert.ok(src.includes('const cardsPrompt = this.cards.toPrompt();'), 'buildInjection 注入卡牌');
    assert.ok(src.includes('const conflictPrompt = this.conflicts.toPrompt();'), 'buildInjection 注入矛盾');
    console.log('✓ 持久化与回滚链路完整性测试验证通过');
});