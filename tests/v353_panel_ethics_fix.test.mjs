// tests/v353_panel_ethics_fix.test.mjs
// LonSha 记忆引擎 v3.53.0 测试套件
// 涵盖：P13 诊断面板命中率卡片、P14 伦理检测静默缺口修复（v3.48 遗留）

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const suSrc = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');

test('=== 1. P13 诊断面板命中率卡片验证 ===', () => {
    assert.ok(suSrc.includes('📈 召回源命中率'), 'P13: 命中率卡片标题');
    assert.ok(suSrc.includes('s._recallSourceStats && s._recallSourceStats.total > 0'), 'P13: 统计守卫');
    assert.ok(suSrc.includes("b[1].hits - a[1].hits"), 'P13: 按命中次数排序');
    assert.ok(suSrc.includes('200 轮半衰'), 'P13: 半衰说明');
    assert.ok(suSrc.includes('长期 0% 的召回源可在设置中关闭'), 'P13: 调优提示');
    // 数据通路
    assert.ok(src.includes('this._recallSourceStats = { total: 0, bySource: {} }'), 'engine 实例属性');
    console.log('✓ P13 诊断面板命中率卡片验证通过');
});

test('=== 2. P14 伦理检测静默缺口修复验证 ===', () => {
    // 旧调用必须绝迹
    assert.ok(src.includes('extracted?.ties_context') === false, 'P14: 不存在的 ties_context 调用必须绝迹');
    // 新调用使用真实数据源
    assert.ok(src.includes('this.status?.getNpcTiesRecords?.() || []'), 'P14: 使用 engine 侧真实羁绊数据');
    assert.ok(src.includes('P14 静默缺口修复'), 'P14: 修复注释');
    // 修复逻辑验证：存在多个 getNpcTiesRecords（CharacterState 版与引擎聚合版），只验证格式存在
    const count = src.split('getNpcTiesRecords').length - 1;
    assert.ok(count >= 2, 'getNpcTiesRecords 至少两处（状态源 + 聚合）');
    assert.ok(src.includes('({ name, ties: [...ties] })'), 'CharacterState 版返回格式匹配 detectEthicsConflict 期望');
    console.log('✓ P14 伦理检测静默缺口修复验证通过');
});

test('=== 3. 伦理检测端到端模拟 ===', () => {
    // 提取 normalizeCharName + 两函数做行为验证
    const normStart = src.indexOf('function normalizeCharName(');
    const braceOf = (start) => {
        let depth = 0;
        const brace = src.indexOf('{', start);
        for (let i = brace; i < src.length; i++) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') { depth--; if (depth === 0) return i; }
        }
        return -1;
    };
    const normBody = src.slice(normStart, braceOf(normStart) + 1);
    const clsStart = src.indexOf('function classifyRelationshipType(');
    const clsBody = src.slice(clsStart, braceOf(clsStart) + 1);
    const detStart = src.indexOf('function detectEthicsConflict(');
    const detBody = src.slice(detStart, braceOf(detStart) + 1);
    const { detectEthicsConflict } = new Function(
        normBody + clsBody + detBody + '\nreturn { detectEthicsConflict };'
    )();

    // 真实数据格式（getNpcTiesRecords 的输出）
    const realTies = [
        { name: '苏若雪', ties: ['苏晨:亲生哥哥', '林一:朋友'] },
        { name: '林晚', ties: ['青梅竹马'] }
    ];
    // 兄妹恋命中
    const hit = detectEthicsConflict('苏晨', '苏若雪', '恋人', realTies);
    assert.ok(hit, '兄妹恋命中');
    // 朋友恋爱不命中
    const noHit = detectEthicsConflict('林一', '苏若雪', '恋人', realTies);
    assert.equal(noHit, null, '朋友关系恋爱不告警（无血缘证据）');
    // 双向血缘词
    const hit2 = detectEthicsConflict('苏晨', '苏若雪', '暧昧', realTies);
    assert.ok(hit2, '暧昧也命中（intimate 类）');
    console.log('✓ 伦理检测端到端模拟验证通过');
});