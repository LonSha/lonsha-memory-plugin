import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    createParallaxEntry,
    resolvePerspectiveGuidance,
    revealGroundTruth
} = require('../epistemic-parallax-theater-engine.js');

test('L10-X7 · createParallaxEntry & resolvePerspectiveGuidance 知情视差双向对账', () => {
    const parallax = createParallaxEntry({
        groundTruth: 'Bob 实际上是前朝皇室遗孤，一直在暗中调查当年灭门案',
        knowers: ['bob', 'master_chen'],
        ignorantActors: ['alice'],
        plausibleMisconception: '以为 Bob 是个游手好闲、来路不明的江湖飞贼',
        tensionClimaxFloor: 200
    });

    assert.equal(parallax.status, 'active');

    // 针对知情者 master_chen
    const knowerGuide = resolvePerspectiveGuidance(parallax, 'master_chen');
    assert.equal(knowerGuide.roleStance, 'knower');
    assert.ok(knowerGuide.narrativeGuidance.includes('保持守秘、试探或隐晦掩护'));

    // 针对蒙在鼓里的 alice
    const ignorantGuide = resolvePerspectiveGuidance(parallax, 'alice');
    assert.equal(ignorantGuide.roleStance, 'ignorant');
    assert.ok(ignorantGuide.narrativeGuidance.includes('以为 Bob 是个游手好闲'));
    assert.ok(ignorantGuide.narrativeGuidance.includes('信息差带来的困惑'));

    // 无关路人
    const strangerGuide = resolvePerspectiveGuidance(parallax, 'passerby');
    assert.equal(strangerGuide.roleStance, 'unrelated');
});

test('L10-X7 · revealGroundTruth 视差破除与高潮结算', () => {
    let parallax = createParallaxEntry({
        groundTruth: '信件早已寄出',
        knowers: ['bob'],
        ignorantActors: ['alice']
    });

    parallax = revealGroundTruth(parallax, 'bob');
    assert.equal(parallax.status, 'revealed');
    assert.equal(parallax.revealedBy, 'bob');
    assert.ok(parallax.aftermathNarrative.includes('此前所有误解与防线全面坍塌'));
});