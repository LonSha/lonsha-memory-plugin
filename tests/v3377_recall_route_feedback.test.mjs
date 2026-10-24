import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Bench = require('../recall-route-feedback-bench.js');

test('L9-O4 · 多路由召回排序与视角权限隔离', () => {
    const candidates = [
        { id: '1', type: 'experience', score: 1.0 },
        { id: '2', type: 'evidence', score: 1.0 },
        { id: '3', type: 'relation', score: 1.0 },
        { id: '4', type: 'private_fact', secretScope: 'private', knowerId: 'luo_jia', score: 2.0 }
    ];

    // 经历优先：经历条目得分显著提权
    const expRes = Bench.rankByRoute(candidates, Bench.RECALL_ROUTES.EXPERIENCE_FIRST);
    assert.equal(expRes.rankedItems[0].id, '1');

    // 证据优先：证据条目排在首位
    const eviRes = Bench.rankByRoute(candidates, Bench.RECALL_ROUTES.EVIDENCE_FIRST);
    assert.equal(eviRes.rankedItems[0].id, '2');

    // 视角优先：外部角色 (charlie) 绝对看不到仅 luo_jia 知晓的私密条目
    const persRes = Bench.rankByRoute(candidates, Bench.RECALL_ROUTES.PERSPECTIVE_FIRST, { characterId: 'charlie' });
    assert.equal(persRes.rankedItems.some(x => x.id === '4'), false);
});

test('L9-O4 · 召回质量反馈记录与闭环存储', () => {
    const feedback = {
        factId: 'fact-age-10',
        route: Bench.RECALL_ROUTES.EXPERIENCE_FIRST,
        verdict: Bench.FEEDBACK_VERDICTS.HELPFUL,
        comment: '精准召回了关键转折'
    };

    const res = Bench.recordFeedback([], feedback);
    assert.equal(res.ok, true);
    assert.equal(res.store.length, 1);
    assert.equal(res.store[0].verdict, 'helpful');
});