/* [v3.458.0 · V20 批次2] 反事实假想沙盒防火墙、视差博弈矩阵与宏观纪元演进测试 */
import test from 'node:test';
import assert from 'node:assert/strict';
import CounterfactualFirewall from '../counterfactual-firewall-engine.js';
import EpistemicMatrix from '../epistemic-parallax-asymmetry-matrix.js';
import MacroEpochDrift from '../macro-epoch-cultural-drift-engine.js';

test('L20-O4 反事实假想沙盒防火墙隔离与安全折射回响', async () => {
    const fwState = CounterfactualFirewall.createInitialFirewallState();
    
    // 注册一条反事实分支（非客观正史）
    const branch = CounterfactualFirewall.registerSandboxedBranch(fwState, {
        id: 'cf_1',
        actorId: '主角',
        hypothesis: '倘若当初没有开启封印，帝国便不会化作焦土',
        echoKeywords: ['如果当初', '后悔', '倘若']
    });
    assert.equal(branch.isCanonical, false, '反事实分支必须强制标为非客观正史');

    const candidates = [
        { id: 'mem_canonical_1', text: '正史记录：封印已被解开，帝国边境燃起烈火。', isCanonical: true },
        { id: 'cf_1', text: '假想分支：倘若当初没有开启封印，帝国便不会化作焦土', isCanonical: false, type: 'counterfactual', echoKeywords: ['如果当初', '倘若'] }
    ];

    // 查询 1：普通查询，没有触发折射关键词
    const res1 = CounterfactualFirewall.sanitizeCanonicalCandidates(fwState, candidates, {
        query: '边境现在的战况如何？',
        actorName: '主角'
    });
    assert.equal(res1.cleanMemories.length, 1, '非正史分支必须被沙盒防火墙严格拦截剔除');
    assert.equal(res1.quarantinedCount, 1, '隔离计数必须准确');
    assert.equal(res1.echoDirectives.length, 0, '未触发关键词时不生成折射');

    // 查询 2：角色深夜悔恨，触发假想折射
    const res2 = CounterfactualFirewall.sanitizeCanonicalCandidates(fwState, candidates, {
        query: '主角独自在废墟前伫立，如果当初没有做出那个抉择……',
        actorName: '主角'
    });
    assert.equal(res2.cleanMemories.length, 1, '即便触发回响，正史事实候选集中仍严禁混入假想条目');
    assert.equal(res2.echoDirectives.length, 1, '必须生成受控内心假想折射指令');
    assert.match(res2.echoDirectives[0], /内心假想折射·非客观事实/);
});

test('L20-O5 多视角视差对比矩阵与非对称情报戏剧张力', async () => {
    const matrixState = EpistemicMatrix.createInitialParallaxMatrixState();

    // 注册机密：公爵其实早已遇害，现在的公爵是由替身伪装
    EpistemicMatrix.registerSecretDossier(matrixState, {
        id: 'secret_duke_dead',
        groundTruth: '真公爵已在前线遇害，城堡内的是假替身',
        stances: {
            '主角': { stance: EpistemicMatrix.COGNITIVE_STANCE.VERIFIED, beliefDetails: '亲眼目睹了公爵遗体' },
            '骑士队长': { stance: EpistemicMatrix.COGNITIVE_STANCE.MISINFORMED, beliefDetails: '坚信公爵只是偶感风寒暂不见客' },
            '侍女长': { stance: EpistemicMatrix.COGNITIVE_STANCE.SUSPECTING, beliefDetails: '发现公爵饮食习惯突然改变，心中起疑' }
        }
    });

    // 主角视角（知晓真相）与不知情的骑士队长对话：生成守秘与视差张力指令
    const dirsProtagonist = EpistemicMatrix.resolvePerspectiveDirectives(matrixState, '主角', ['骑士队长']);
    assert.ok(dirsProtagonist.length > 0, '知情者必须获得视差张力指令');
    assert.match(dirsProtagonist[0], /信息差守秘·视差张力/);
    assert.match(dirsProtagonist[0], /骑士队长/);

    // 骑士队长视角（蒙在鼓里）：生成认知局限指令，严禁展现上帝视角
    const dirsKnight = EpistemicMatrix.resolvePerspectiveDirectives(matrixState, '骑士队长', ['主角']);
    assert.ok(dirsKnight.length > 0, '误解者必须获得认知局限指令');
    assert.match(dirsKnight[0], /认知局限·主观假象/);
    assert.match(dirsKnight[0], /切勿展现未卜先知的上帝视角/);
});

test('L20-O6 宏观纪元更迭与世界观文化漂移约束', async () => {
    const epochState = MacroEpochDrift.createInitialEpochState();

    MacroEpochDrift.registerEpoch(epochState, {
        id: 'era_dark_magic_purge',
        name: '禁魔猎巫纪元',
        socialTone: '高压恐慌与宗教审判',
        taboos: ['古代魔法', '虚空召唤'],
        promotedConcepts: ['纯净信仰', '机械工坊'],
        archaicLinguisticStyle: '庄重审判调与排比祷词'
    });

    MacroEpochDrift.setCurrentEpoch(epochState, 'era_dark_magic_purge');
    const directive = MacroEpochDrift.resolveEpochCulturalDirectives(epochState);
    
    assert.ok(directive, '已切换纪元必须生成时代文化约束指引');
    assert.match(directive, /禁魔猎巫纪元/);
    assert.match(directive, /古代魔法/);
    assert.match(directive, /纯净信仰/);
});
