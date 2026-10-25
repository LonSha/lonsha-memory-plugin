import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const modulePath = path.resolve('double-identity-espionage-theater.js');
const sourceCode = fs.readFileSync(modulePath, 'utf8');

const sandbox = {
    globalThis: {},
    define: null,
    module: { exports: {} }
};
const fn = new Function('globalThis', 'module', 'exports', sourceCode);
fn(sandbox.globalThis, sandbox.module, sandbox.module.exports);
const EspionageTheater = sandbox.module.exports;

test('L11-X7: 双重身份建立、暴露破绽记录与语境面具切换', async (t) => {
    const dossier = EspionageTheater.createDualIdentityDossier({
        actorName: '莫里森',
        coverRole: '特勤局上校',
        coverAllegiance: '军政府',
        coverTraits: ['铁面无私', '冷血'],
        trueCodename: '幽灵',
        trueAllegiance: '自由阵线',
        trueGoal: '保护反抗军密电码'
    });

    assert.equal(dossier.coverIdentity.role, '特勤局上校');
    assert.equal(dossier.trueIdentity.codename, '幽灵');
    assert.equal(dossier.exposureRisk, 0.1);

    // 记录可疑破绽，风险攀升
    const updated = EspionageTheater.recordSuspicionClue(dossier, {
        suspicionLevel: 0.35,
        clueText: '在暗室被副官发现使用未经登记的发报波段'
    });
    assert.equal(updated.exposureRisk, 0.45);
    assert.equal(updated.compromisedClues.length, 1);

    // 公众场合：必须坚守冷血面具
    const publicDirective = EspionageTheater.synthesizeEspionageDirective(updated, { isPublic: true });
    assert.ok(publicDirective.includes('【双重身份·面具坚守】'));
    assert.ok(publicDirective.includes('特勤局上校'));
    assert.ok(publicDirective.includes('自由阵线'));

    // 私密安全屋：回归真面目
    const privateDirective = EspionageTheater.synthesizeEspionageDirective(updated, { isPublic: false, isSafetyHaven: true });
    assert.ok(privateDirective.includes('【双重身份·安全屋独白】'));
    assert.ok(privateDirective.includes('幽灵'));
    assert.ok(privateDirective.includes('保护反抗军密电码'));
});

test('L11-X7 负控制: 破坏安全屋判定逻辑导致无法卸下面具', async (t) => {
    const brokenCode = sourceCode.replace('if (environmentContext.isPublic || !environmentContext.isSafetyHaven)', 'if (true)');
    const brokenSandbox = { globalThis: {}, module: { exports: {} } };
    new Function('globalThis', 'module', 'exports', brokenCode)(brokenSandbox.globalThis, brokenSandbox.module, brokenSandbox.module.exports);
    const BrokenTheater = brokenSandbox.module.exports;

    const dossier = { coverIdentity: {}, trueIdentity: {} };
    const res = BrokenTheater.synthesizeEspionageDirective(dossier, { isPublic: false, isSafetyHaven: true });
    assert.ok(!res.includes('【双重身份·安全屋独白】'));
});