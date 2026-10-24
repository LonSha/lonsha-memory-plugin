import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { CLUE_STATUS, createArchaeologyRoute, verifyClueAdmission } = require('../memory-archaeology-gap-bench.js');

test('L9-X3 · 记忆考古线索分类与证伪线索严格阻断', () => {
    const route = createArchaeologyRoute('调查旧火车站拆除真相', [
        { id: 'c1', title: '目击证词', status: CLUE_STATUS.KNOWN, evidenceIds: ['ev_1'] },
        { id: 'c2', title: '遗失的图纸', status: CLUE_STATUS.UNKNOWN_GAP },
        { id: 'c3', title: '有人故意纵火', status: CLUE_STATUS.FALSE_LEAD }
    ]);

    assert.equal(route.clues.length, 3);

    // 已知且有证据 -> 准入
    const v1 = verifyClueAdmission(route.clues[0]);
    assert.equal(v1.allowed, true);

    // 未知缺口 -> 不准入
    const v2 = verifyClueAdmission(route.clues[1]);
    assert.equal(v2.allowed, false);

    // 证伪线索 -> 严格阻断进入正史
    const v3 = verifyClueAdmission(route.clues[2]);
    assert.equal(v3.allowed, false);
    assert.equal(v3.reason, 'false_lead_strictly_forbidden_from_canon');
});