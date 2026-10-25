import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
    TENSION_POLARITY,
    MAX_RESIDUAL_CHARS,
    captureResidual,
    attachAtmosphereToRecall,
    decayResidual
} = require('../micro-atmosphere-residual-tracker.js');

test('L10-X1 · captureResidual 文本约束与极性规范化', () => {
    const longText = '这是一个非常漫长的修罗场雨夜，彼此隔着三步远的距离互不相让，眼神却在颤抖，雨水顺着湿透的伞骨不断滴落，呼吸沉重而压抑。';
    const res = captureResidual({
        factId: 'fact_001',
        text: longText,
        polarity: TENSION_POLARITY.CONFRONTATIONAL,
        intensity: 0.9,
        actors: ['alice', 'bob'],
        floor: 120
    });

    assert.equal(res.factId, 'fact_001');
    assert.ok(res.text.length <= MAX_RESIDUAL_CHARS + 1, '残差字数严格受限');
    assert.ok(res.text.endsWith('…'), '超长自动截断且加省略号');
    assert.equal(res.polarity, 'confrontational');
    assert.equal(res.intensity, 0.9);
    assert.deepEqual(res.actors, ['alice', 'bob']);
    assert.equal(res.floor, 120);

    // 非法极性回退到 ambiguous，强度钳位
    const fallback = captureResidual({ polarity: 'invalid_mode', intensity: 2.5 });
    assert.equal(fallback.polarity, 'ambiguous');
    assert.equal(fallback.intensity, 1.0);
});

test('L10-X1 · attachAtmosphereToRecall 氛围注入与角色感知匹配', () => {
    const facts = [
        { id: 'fact_001', content: 'Alice 曾在雨夜拒绝了 Bob 的请求' },
        { id: 'fact_002', content: 'Bob 独自前往旧书店' }
    ];

    const residuals = [
        captureResidual({
            factId: 'fact_001',
            text: '眼神移开，雨水打湿伞沿，指节发白',
            polarity: TENSION_POLARITY.VULNERABLE,
            actors: ['alice', 'bob']
        }),
        captureResidual({
            factId: 'fact_002',
            text: '旧皮鞋踏在木地板上的嘎吱声',
            actors: ['bob']
        })
    ];

    // 在场只有 alice 时，包含 alice 的 fact_001 匹配成功，仅 bob 的 fact_002 被角色过滤器排除
    const attached = attachAtmosphereToRecall(facts, residuals, { actors: ['alice'] });
    assert.equal(attached.length, 2);
    assert.ok(attached[0].promptCue.includes('眼神移开'));
    assert.equal(attached[0].atmosphereResidual.polarity, 'vulnerable');
    assert.equal(attached[1].promptCue, undefined, '不在场角色的孤立残差不附着');

    // 无角色过滤时全部附着
    const allAttached = attachAtmosphereToRecall(facts, residuals);
    assert.ok(allAttached[1].promptCue.includes('旧皮鞋'));
});

test('L10-X1 · decayResidual 楼层衰减但保留情感烙印', () => {
    const fresh = captureResidual({
        factId: 'fact_001',
        intensity: 0.9,
        floor: 100
    });

    const decayed50 = decayResidual(fresh, 150); // 间隔 50 楼
    assert.ok(decayed50.intensity < 0.9);
    assert.ok(decayed50.intensity >= 0.75);
    assert.equal(decayed50.isFaded, false);

    const decayed500 = decayResidual(fresh, 600); // 间隔 500 楼，衰减至触底
    assert.equal(decayed500.intensity, 0.25, '衰减到达 0.25 基础情感烙印下限，不归零');
    assert.equal(decayed500.isFaded, true);
});