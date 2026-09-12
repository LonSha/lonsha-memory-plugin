// tests/v342_caikis_mechanics.test.mjs
// LonSha 记忆引擎 v3.42 吸收 caikis 数据库机制测试套件
// 覆盖：人设基线 (Persona Baseline) vs 人设偏移 (Persona Drift)、
//       NPC 晋升机制 (Promotion Pipeline)、三级地理空间感知 (3-Tier Geo Context)
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

const errLog = () => {};

console.log('=== 1. 静态锚点与版本检查 ===');
assert.ok(src.includes("const VERSION = '3.42.0';"), '版本号必须递增至 3.42.0');
assert.ok(src.includes('setBaseline') && src.includes('recordDrift'), 'CharacterState 必须实现人设基线与人设偏移');
assert.ok(src.includes('registerTransientNpc') && src.includes('promoteNpc'), 'CharacterState 必须实现 NPC 晋升机制');
assert.ok(src.includes('setGeoLocation') && src.includes('getGeoLocation'), 'CharacterState 必须实现三级地理空间感知');
ok('静态锚点声明检查全部通过');

console.log('=== 2. 人设基线 vs 人设偏移 (Drift & Decay) 动态测试 ===');
const csSrc = extractClass('CharacterState');
const mkCharacterState = () => new Function('errLog', `
    ${csSrc}
    return new CharacterState();
`)(errLog);

{
    const cs = mkCharacterState();
    // 锁定基线：博丽灵梦，性格基线为慵懒悠闲、贪财但富有正义感
    cs.setBaseline('博丽灵梦', {
        traits: ['慵懒悠闲', '贪财', '外冷内热'],
        speechStyle: '平淡直接、带着点嫌麻烦的口吻',
        coreBelief: '维护幻想乡的平衡',
        floor: 1
    });
    assert.ok(cs.baselines['博丽灵梦']);
    assert.equal(cs.baselines['博丽灵梦'].traits.length, 3);

    // 第 10 楼：发生重大异变袭击，神社被毁，记录短期人设偏移
    cs.recordDrift('博丽灵梦', {
        mood: '极度焦躁愤怒',
        reinforced: '冷酷果决、不留情面',
        weakened: '慵懒悠闲',
        behaviorChange: '不再泡茶偷懒，主动出击追查凶手',
        floor: 10
    });

    // 在第 11 楼（刚经历异变），偏移强烈生效
    const p11 = cs.getEffectivePersona('博丽灵梦', 11);
    assert.ok(p11.hasDrift);
    assert.ok(p11.description.includes('极度焦躁愤怒'));
    assert.ok(p11.description.includes('被弱化：慵懒悠闲'));
    assert.ok(p11.description.includes('基线定海神针：维护幻想乡的平衡'));

    // 在第 30 楼（已过去 20 楼，异变平息），偏移衰减收敛，回归原本人设基线
    const p30 = cs.getEffectivePersona('博丽灵梦', 30);
    assert.equal(p30.hasDrift, false, '经过 20 楼无新刺激，短期性格偏移应自动衰减收敛');
    assert.ok(p30.description.includes('慵懒悠闲'), '回归基线特征');
    ok('人设基线锁定、剧情冲击偏移与长线平息自动衰减收敛验证通过');
}

console.log('=== 3. NPC 晋升机制 (Promotion Pipeline) 动态测试 ===');
{
    const cs = mkCharacterState();
    // 初次登场：路人卖药郎，进入轻量临时表
    cs.registerTransientNpc('卖药郎', { identity: '人类村落的行商', floor: 5 });
    assert.equal(cs.isNpcTracked('卖药郎'), false);
    assert.equal(cs.transientNpcs['卖药郎'].meetCount, 1);

    // 再次互动
    cs.registerTransientNpc('卖药郎', { identity: '人类村落的行商', floor: 8 });
    assert.equal(cs.transientNpcs['卖药郎'].meetCount, 2);

    // 玩家决定深入交往，触发晋升 (Promote)
    cs.promoteNpc('卖药郎');
    assert.equal(cs.isNpcTracked('卖药郎'), true, '晋升后应成为追踪角色');
    assert.ok(!cs.transientNpcs['卖药郎'], '晋升后从临时路人表中移出，释放空间');
    ok('NPC 临时路人记录、互动频次累加与晋升核心追踪角色验证通过');
}

console.log('=== 4. 三级地理拓扑感知 (3-Tier Geo Context) 动态测试 ===');
{
    const cs = mkCharacterState();
    cs.setGeoLocation({
        majorArea: '幻想乡',
        minorArea: '妖怪之山',
        detailLocation: '守矢神社境内',
        floor: 15
    });
    const geo = cs.getGeoLocation();
    assert.equal(geo.majorArea, '幻想乡');
    assert.equal(geo.minorArea, '妖怪之山');
    assert.equal(geo.detailLocation, '守矢神社境内');
    
    const prompt = cs.getGeoPrompt();
    assert.ok(prompt.includes('主要地区: 幻想乡'));
    assert.ok(prompt.includes('次要地区: 妖怪之山'));
    assert.ok(prompt.includes('详细地点: 守矢神社境内'));
    ok('三级地理拓扑设定、获取与提示词渲染验证通过');
}

console.log('=== 5. 序列化与反序列化测试 ===');
{
    const cs = mkCharacterState();
    cs.setBaseline('角色A', { traits: ['勇敢'], floor: 1 });
    cs.promoteNpc('角色A');
    cs.setGeoLocation({ majorArea: '大陆', minorArea: '王国', detailLocation: '王宫', floor: 10 });
    
    const exported = cs.export();
    const cs2 = mkCharacterState();
    cs2.import(exported);
    
    assert.equal(cs2.isNpcTracked('角色A'), true);
    assert.equal(cs2.baselines['角色A']?.traits[0], '勇敢');
    assert.equal(cs2.getGeoLocation().detailLocation, '王宫');
    ok('CharacterState 数据库增强字段 export/import 完整性验证通过');
}

console.log('[V342 TESTS PASSED] caikis 数据库机制演进测试套件全部通过！');
