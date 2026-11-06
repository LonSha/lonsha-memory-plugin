/* [v3.458.0 · V20 批次3] 特工潜伏暴露、深层创伤禁忌与动态契约誓言定向测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import CovertEspionage from '../covert-espionage-exposure-hub.js';
import ObsessiveTrauma from '../obsessive-trauma-taboo-engine.js';
import DynamicCovenant from '../dynamic-covenant-consequence-engine.js';

test('L20-O7 双重身份潜伏、破绽累积与极危警报博弈', async () => {
    const state = CovertEspionage.createInitialEspionageState();

    // 注册潜伏特工
    const agent = CovertEspionage.registerAgent(state, {
        actorName: '莫伦',
        codename: '夜枭',
        coverRole: '宫廷记录官',
        realFaction: '北境隐秘同盟',
        missionObjective: '窃取禁卫军布防图',
        exposureRisk: 0.1
    });

    assert.equal(agent.actorName, '莫伦');
    
    // 正常状态指令
    const dirs1 = CovertEspionage.resolveEspionageDirectives(state, '莫伦', ['侍从']);
    assert.match(dirs1[0], /特工潜伏·低危/);

    // 发生严重破绽：被近卫统领发现随身暗记
    CovertEspionage.recordBreachClue(state, '莫伦', {
        severity: 0.7,
        clueText: '暗格里的加密拓片被当场截获',
        discoveredBy: '近卫统领'
    });

    assert.ok(agent.exposureRisk >= 0.75, '暴露风险必须大幅提升');

    // 濒临暴露极危指令
    const dirs2 = CovertEspionage.resolveEspionageDirectives(state, '莫伦', ['近卫统领']);
    assert.match(dirs2[0], /特工潜伏·极危破绽/);
    assert.match(dirs2[0], /销毁物证或孤注一掷/);
});

test('L20-O8 创伤禁忌雷区激惹、压力计积累与理智崩溃', async () => {
    const traumaState = ObsessiveTrauma.createInitialTraumaState();

    ObsessiveTrauma.registerTraumaProfile(traumaState, {
        actorName: '克洛伊',
        coreObsession: '保护最后的族人遗物',
        tabooTriggers: ['旧王都大火', '灭门'],
        stressLevel: 20,
        breakdownSymptom: '瞳孔涣散、剧烈失语与无差别术式爆发'
    });

    // 上下文中触碰禁忌词汇
    const dirs1 = ObsessiveTrauma.resolveTraumaDirectives(traumaState, '克洛伊', '提到了当年旧王都大火的惨状');
    assert.equal(dirs1.length, 1);
    assert.match(dirs1[0], /心理禁忌激惹/);

    // 再次触碰引发理智崩溃
    ObsessiveTrauma.resolveTraumaDirectives(traumaState, '克洛伊', '逼问灭门的真凶');
    const dirsBreakdown = ObsessiveTrauma.resolveTraumaDirectives(traumaState, '克洛伊', '继续逼问灭门的细节');
    assert.ok(dirsBreakdown.length > 0);
    assert.match(dirsBreakdown[0], /心理创伤失控·崩溃临界/);
    assert.match(dirsBreakdown[0], /无差别术式爆发/);
});

test('L20-O9 动态契约誓言建档、背誓判定与因果反噬', async () => {
    const covState = DynamicCovenant.createInitialCovenantState();

    // 结成血契
    DynamicCovenant.forgeCovenant(covState, {
        id: 'cov_blood_oath',
        title: '雪山绝顶盟约',
        parties: ['主角', '修尔'],
        terms: '永不向裁判所出卖彼此行踪',
        breachPenalty: '心脉被寒毒寸断，遭受因果凌迟',
        forbiddenActions: ['出卖行踪', '叛向裁判所']
    });

    // 履约期正常指令
    const dirsBound = DynamicCovenant.resolveCovenantDirectives(covState, '修尔');
    assert.match(dirsBound[0], /神圣誓约在身·雪山绝顶盟约/);

    // 检测到背叛行动
    const breaches = DynamicCovenant.checkCovenantBreach(covState, '修尔', '修尔为了解药，暗中出卖行踪给主教');
    assert.equal(breaches.length, 1);
    assert.equal(breaches[0].status, DynamicCovenant.COVENANT_STATUS.BREACHED);

    // 违约反噬指令
    const dirsBackfire = DynamicCovenant.resolveCovenantDirectives(covState, '修尔');
    assert.match(dirsBackfire[0], /血誓反噬·大逆背叛/);
    assert.match(dirsBackfire[0], /心脉被寒毒寸断/);
});