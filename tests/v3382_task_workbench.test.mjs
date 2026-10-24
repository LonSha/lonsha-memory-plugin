import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildTaskWorkbenchState } = require('../memory-task-workbench.js');

test('L9-O9 · 面向任务的记忆工作台首层聚合', () => {
    const mockSources = {
        facts: [
            { id: 'f1', text: '已确认事实', state: 'confirmed' },
            { id: 'f2', text: '待确认事实', state: 'candidate' }
        ],
        conflicts: [
            { id: 'c1', status: 'open' }
        ],
        activeInjections: ['f1'],
        resumePoint: { stepId: 'step_123' }
    };

    const wb = buildTaskWorkbenchState(mockSources);
    assert.equal(wb.summary.totalPendingConfirm, 1);
    assert.equal(wb.summary.totalPendingRevision, 1);
    assert.equal(wb.summary.totalInUse, 1);
    assert.equal(wb.summary.canResume, true);

    assert.equal(wb.sections.pending_confirm.state, 'ready');
    assert.equal(wb.sections.boundary_risk.state, 'empty');
});