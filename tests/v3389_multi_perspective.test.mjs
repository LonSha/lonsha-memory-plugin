import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { PERSPECTIVE_ROLES, projectEventMaterialsByPerspective } = require('../multi-perspective-theater-bench.js');

test('L9-X7 · 多知情视角事件剧场材料投影与秘密过滤', () => {
    const eventFacts = [
        { id: 'f_pub', text: '两人在喷泉广场会面' },
        { id: 'f_inner', text: 'Alice 内心充满对未来的担忧', scope: 'inner_monologue' },
        { id: 'f_secret', text: '包裹中藏有失窃的芯片', isSecret: true },
        { id: 'f_doc', text: '签署的临时停火协议原件', hasDocumentEvidence: true }
    ];

    // 1. 旁观者视角：内心独白与秘密均不可见
    const onlookerRes = projectEventMaterialsByPerspective(eventFacts, PERSPECTIVE_ROLES.ONLOOKER);
    assert.equal(onlookerRes.visibleCount, 2); // 仅 f_pub 和 f_doc
    assert.equal(onlookerRes.redactedCount, 2);

    // 2. 亲历者视角：全部可见
    const participantRes = projectEventMaterialsByPerspective(eventFacts, PERSPECTIVE_ROLES.PARTICIPANT);
    assert.equal(participantRes.visibleCount, 4);

    // 3. 档案研究者视角：仅可见有文档支撑且非秘密的条目
    const archiveRes = projectEventMaterialsByPerspective(eventFacts, PERSPECTIVE_ROLES.ARCHIVAL_RESEARCHER);
    assert.equal(archiveRes.visibleCount, 1);
    assert.equal(archiveRes.projected[0].id, 'f_doc');
});