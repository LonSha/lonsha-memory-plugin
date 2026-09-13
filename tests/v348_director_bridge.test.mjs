// tests/v348_director_bridge.test.mjs
// LonSha 记忆引擎 v3.48.0 导演系统与桥修复测试套件
// 涵盖：P0 桥三处断线修复（queryPhoneMemory 别名/开关名/字段映射）、P1 OutlineDirector 大纲导演、
// P2 关系五分类与伦理冲突检测、P3 本地意图分流重排管线

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const bridgeSrc = readFileSync(new URL('../../ruby-phone-work/apps/memory/lonsha-bridge.js', import.meta.url), 'utf-8');

function braceEnd(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } }
        else if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
        else if (ch === '/' && s[i + 1] !== '/' && s[i + 1] !== '*') {
            // [v3.48] 正则字面量跳过：前一个非空白字符属于表达式位置时，/ 是正则开始
            let j = i - 1;
            while (j >= 0 && /\s/.test(s[j])) j--;
            const prev = j >= 0 ? s[j] : '';
            if (!prev || '(,=:[!&|?{};+-*%<>~^'.includes(prev)) {
                // 扫描到未转义的结束 /（跳过字符类 [...] 与转义）
                i++;
                let inClass = false;
                while (i < s.length) {
                    if (s[i] === '\\') { i += 2; continue; }
                    if (s[i] === '[') inClass = true;
                    else if (s[i] === ']') inClass = false;
                    else if (s[i] === '/' && !inClass) break;
                    i++;
                }
            }
        }
    }
    return -1;
}
function extractClass(name) {
    const start = src.indexOf(`class ${name}`);
    if (start < 0) throw new Error('missing class ' + name);
    const brace = src.indexOf('{', start);
    return src.slice(start, braceEnd(src, brace) + 1);
}

test('=== 1. P0 桥修复静态验证 ===', () => {
    // LonSha 侧：守卫开关修正
    assert.ok(src.includes('this.config.config.rubyPhoneRecall && window.VirtualPhone?.lonshaBridge'), 'P0: 守卫开关必须改为 rubyPhoneRecall');
    assert.ok(!src.includes('config.config.rubyPhoneSync'), 'P0: 旧开关名 rubyPhoneSync 必须绝迹');
    assert.ok(src.includes('queryPhoneMemory || window.VirtualPhone.lonshaBridge.recall.bind'), 'P0: queryPhoneMemory/ recall 兼容调用');
    // bridge 侧：别名方法
    assert.ok(bridgeSrc.includes('async queryPhoneMemory(queryText, topN = 5)'), 'P0: bridge 必须实现 queryPhoneMemory 别名');
    // 字段映射
    assert.ok(src.includes("h.layer || h.type || '生活'"), 'P0: 字段映射必须兼容 layer/type');
    // backfill 增强
    assert.ok(bridgeSrc.includes('addSpatial'), 'P0: bridge backfill 必须喂空间层');
    assert.ok(bridgeSrc.includes('extracted.money_changes'), 'P0: backfill 必须回填钱财');
    assert.ok(bridgeSrc.includes('extracted.conflicts'), 'P0: backfill 必须回填矛盾');
    assert.ok(bridgeSrc.includes('extracted.clock'), 'P0: backfill 必须回填剧情时钟');
    // memoryCore.sleep 激活
    const phoneIdx = readFileSync(new URL('../../ruby-phone-work/index.js', import.meta.url), 'utf-8');
    assert.ok(phoneIdx.includes("_mc._sleepTick % 12 === 0 && typeof _mc.sleep === 'function'"), 'P0: sleep() 节流激活必须存在');
    console.log('✓ P0 桥修复静态验证通过');
});

test('=== 2. OutlineDirector 大纲导演行为测试 ===', () => {
    // [v3.48] 裸括号平衡提取（类内正则字面量含引号会骗过引号追踪式 braceEnd，
    // 但该类已被 node --check 验证语法，裸平衡在此可靠）
    const start = src.indexOf('class OutlineDirector');
    const brace = src.indexOf('{', start);
    let depth = 0, clsEnd = -1;
    for (let i = brace; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { clsEnd = i; break; } }
    }
    assert.ok(clsEnd > 0, 'OutlineDirector 类必须闭合');
    const odCode = src.slice(start, clsEnd + 1);
    const mkClass = new Function('return (' + odCode + ');')();
    const mk = () => new mkClass();

    const od = mk();
    assert.equal(od.toPrompt(), '', '无大纲注入为空');
    assert.equal(od.exhausted, true, '无大纲视为耗尽');

    const raw = `思路分析（标签外内容应忽略）。
<stage_title>北上寻仇</stage_title>
<stage_goal>查明灭门真相并复仇</stage_goal>
<stage_tempo>surge</stage_tempo>
<node>
<node_title>入城</node_title>
<node_goal>潜入仇人所在的城</node_goal>
<turn pacing="setup">结交城中线人</turn>
<turn pacing="pressure">夜探府邸被巡卫追捕</turn>
</node>
<node>
<node_title>对决</node_title>
<node_goal>与仇人正面冲突</node_goal>
<turn pacing="turn">揭穿真凶身份</turn>
<turn pacing="cooldown">处理后续余波</turn>
</node>`;
    const stage = od.parseOutline(raw, 100);
    assert.ok(stage, '解析成功');
    assert.equal(stage.title, '北上寻仇');
    assert.equal(stage.tempo, 'surge');
    assert.equal(stage.nodes.length, 2);
    assert.equal(stage.nodes[0].turns.length, 2);
    assert.equal(stage.nodes[0].turns[0].pacing, 'setup');
    assert.equal(stage.nodes[1].turns[0].pacing, 'turn');
    assert.equal(od.flatTurns.length, 4, '扁平轮次 4');
    assert.equal(od.currentTurn.goal, '结交城中线人');

    // 注入
    const p1 = od.toPrompt();
    assert.ok(p1.includes('[剧情大纲·导演视角]'), '注入含导演头');
    assert.ok(p1.includes('北上寻仇'), '注入含阶段标题');
    assert.ok(p1.includes('本轮目标（第1/4轮）'), '注入含轮次进度');
    assert.ok(p1.includes('本轮节奏：setup'), '注入含节奏');
    assert.ok(p1.includes('下一轮预告'), '注入含下一轮预告');
    assert.ok(!p1.includes('思路分析'), '标签外内容不入注入');

    // 推进
    od.advanceTurn(101);
    assert.equal(od.currentTurn.goal, '夜探府邸被巡卫追捕');
    od.advanceTurn(102);
    od.advanceTurn(103);
    assert.equal(od.currentTurn.goal, '处理后续余波');
    od.advanceTurn(104);
    assert.equal(od.exhausted, true, '轮次耗尽');
    assert.ok(od.toPrompt().includes('大纲轮次已耗尽'), '耗尽提示注入');
    assert.equal(od.history.length, 4, '简史 4 条');

    // 持久化
    const exp = od.export();
    const od2 = mk();
    od2.import(exp);
    assert.equal(od2._turnIndex, 4);
    assert.equal(od2.stage.title, '北上寻仇');
    assert.equal(od2.history.length, 4);
    console.log('✓ OutlineDirector 大纲导演行为测试验证通过');
});

test('=== 3. 关系五分类与伦理冲突检测测试 ===', () => {
    // 顶层函数提取
    const fnStart = src.indexOf('function classifyRelationshipType(');
    assert.ok(fnStart > 0, 'classifyRelationshipType 必须存在');
    const fnBody = src.slice(fnStart, braceEnd(src, src.indexOf('{', fnStart)) + 1);
    const fnStart2 = src.indexOf('function detectEthicsConflict(');
    const fnBody2 = src.slice(fnStart2, braceEnd(src, src.indexOf('{', fnStart2)) + 1);
    const normStart = src.indexOf('function normalizeCharName(');
    const normBody = src.slice(normStart, braceEnd(src, src.indexOf('{', normStart)) + 1);
    const { classifyRelationshipType, detectEthicsConflict } = new Function(
        `${normBody}\n${fnBody}\n${fnBody2}\nreturn { classifyRelationshipType, detectEthicsConflict };`
    )();

    assert.equal(classifyRelationshipType('父亲'), 'family');
    assert.equal(classifyRelationshipType('养母'), 'family');
    assert.equal(classifyRelationshipType('暗恋'), 'intimate');
    assert.equal(classifyRelationshipType('夫妻'), 'intimate');
    assert.equal(classifyRelationshipType('宿敌'), 'hostile');
    assert.equal(classifyRelationshipType('师父'), 'social');
    assert.equal(classifyRelationshipType('主仆'), 'social');
    assert.equal(classifyRelationshipType('路人'), 'other');
    assert.equal(classifyRelationshipType(''), 'other');

    // 伦理冲突：兄妹 × 恋爱
    const ties = [{ name: '苏若雪', ties: '亲生妹妹；血缘' }];
    const hit = detectEthicsConflict('苏晨', '苏若雪', '恋人', ties);
    assert.ok(hit, '兄妹恋必须命中伦理冲突');
    assert.equal(hit.tie, '亲生妹妹；血缘');
    // 非血缘恋爱不命中（tie 无血缘证据）
    const noHit = detectEthicsConflict('林一', '苏若雪', '恋人', [{ name: '苏若雪', ties: '朋友；同事' }]);
    assert.equal(noHit, null, '非血缘恋爱不告警');
    // 单向亲缘词无 from 名（无法确认 from 是血亲）→ 保守不告警以外的场景：显式含 from 名则告警
    const explicitHit = detectEthicsConflict('苏晨', '苏若雪', '恋人', [{ name: '苏若雪', ties: '苏晨:亲生哥哥' }]);
    assert.ok(explicitHit, '显式血缘标注必须告警');
    // family 关系本身不告警
    const famOk = detectEthicsConflict('苏晨', '苏若雪', '兄妹', ties);
    assert.equal(famOk, null, 'family 类关系本身不告警');
    console.log('✓ 关系五分类与伦理冲突检测测试验证通过');
});

test('=== 4. 大纲接入链路完整性测试 ===', () => {
    assert.ok(src.includes('this.outline = new OutlineDirector();'), 'MemoryEngine 实例化 outline');
    assert.ok(src.includes('const outlinePrompt = this.outline.toPrompt();'), 'buildInjection 注入大纲');
    assert.equal(src.split('outline: this.outline.export()').length - 1, 2, 'collectExport 两处');
    assert.ok(src.includes('pack.outline && this.outline'), 'storage.load 恢复 outline');
    assert.ok(src.includes('this.outline.parseOutline(_rawForSynopsis'), 'AI 回复解析钩子');
    assert.ok(src.includes('this.outline.advanceTurn(message.index || 0)'), '每楼轮次推进');
    assert.ok(src.includes('9e. outline：'), '提取 prompt 规则 9e');
    assert.ok(src.includes('outlineDirectorEnabled'), '配置开关');
    // P2/P3 静态
    assert.ok(src.includes('relClass: classifyRelationshipType(rel.type)'), '关系边携带分类');
    assert.ok(src.includes('return this.intentRerank(merged, queryText);'), '意图重排接入召回返回');
    assert.ok(src.includes('intentRerank(merged, queryText) {'), 'intentRerank 方法存在');
    console.log('✓ 大纲接入链路完整性测试验证通过');
});