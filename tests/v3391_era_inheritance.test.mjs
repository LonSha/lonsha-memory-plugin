import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { INHERITANCE_FATE, inheritEraArtifact } = require('../era-continuation-inheritance-tree.js');

test('L9-X9 · 时代接续传承改造与秘密断代阻断', () => {
    const familyRing = {
        id: 'artifact_ring',
        era: 'dynasty_1',
        isSecret: true
    };

    // 继承但未通过遗嘱揭开秘密 -> 秘密断代阻断
    const res1 = inheritEraArtifact(familyRing, {
        successorActorId: 'heir_charlie',
        fate: INHERITANCE_FATE.ACCEPTED,
        revealedByWill: false
    });

    assert.equal(res1.success, true);
    assert.equal(res1.secretRedacted, true);
    assert.equal(res1.successorKnowsSecret, false);

    // 改造传承物
    const res2 = inheritEraArtifact(familyRing, {
        successorActorId: 'heir_charlie',
        fate: INHERITANCE_FATE.REFORMED,
        reformedNotes: '将其重铸为守护吊坠'
    });
    assert.equal(res2.fate, 'reformed');
    assert.equal(res2.reformedNotes, '将其重铸为守护吊坠');
});