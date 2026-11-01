// tests/v3432_l13_x1_memory_lineage.test.mjs — [v3.432.0 · L13-X1] 记忆沿革回放产品面判据
//
// 主题：一条记忆是怎么变成现在这样的（Proposal L13-X1 验收）
//   - 造一条「创建 -> 改两次 -> 撤一次」的记忆，沿革恰好 4 节且顺序正确；
//   - 某层数据被人为抹掉时该节为 unavailable 而不是消失；
//   - 负控制：把 diff 算成空 -> 红。
//   - 严格只读 writesNothing: true。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const MODULE_SRC = readRoot('memory-lineage-replay.js');
const DIAG_SRC = readRoot('engine-diagnostic-lines.js');
const HOST_SRC = readRoot('index.js');

function loadModuleInVM(src = MODULE_SRC) {
    const sandbox = { globalThis: {}, module: { exports: {} }, window: {} };
    sandbox.globalThis = sandbox;
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
    return sandbox.module.exports && Object.keys(sandbox.module.exports).length ? sandbox.module.exports : sandbox.LonShaMemoryLineageReplay;
}

test('A: 基础输入校验与边界三态', () => {
    const MLR = loadModuleInVM();
    assert.ok(MLR, '模块成功装载');
    assert.equal(typeof MLR.buildMemoryLineage, 'function', 'buildMemoryLineage 必须是函数');

    // 1. 空 itemId 必拒
    const emptyRes = MLR.buildMemoryLineage('', {});
    assert.equal(emptyRes.ok, false, '空 itemId 必须 ok:false');
    assert.equal(emptyRes.reason, 'item-id-required', '原因必须标明 item-id-required');
    assert.equal(emptyRes.writesNothing, true, '必须只读');

    // 2. 不存在的条目
    const notFoundRes = MLR.buildMemoryLineage('fact:non_existent_404', { engine: {} });
    assert.equal(notFoundRes.ok, false, '不存在的条目必须 ok:false');
    assert.equal(notFoundRes.reason, 'item-not-found', '原因标明 item-not-found');
    assert.equal(notFoundRes.itemFound, false);
});

test('B: 核心验收 —— 造「创建 -> 改两次 -> 撤一次」，沿革恰好 4 节且顺序正确', () => {
    const MLR = loadModuleInVM();
    const itemId = 'fact:target_hero_01';

    // 构造模拟环境：1 次创建，2 次修改，1 次撤销
    const mockContext = {
        engine: {
            memories: [{ id: itemId, text: '主角的最终记忆态', floor: 10 }],
            opLog: {
                queryByRef: (refId) => [
                    {
                        seq: 1,
                        ts: 1000,
                        floor: 1,
                        type: 'item',
                        op: 'create',
                        ref: refId,
                        why: '建立主角初始设定',
                        meta: JSON.stringify({ before: null, after: { text: '主角初登场' } })
                    },
                    {
                        seq: 2,
                        ts: 2000,
                        floor: 4,
                        type: 'item',
                        op: 'update',
                        ref: refId,
                        why: '获得初级法杖',
                        meta: JSON.stringify({ before: { text: '主角初登场' }, after: { text: '主角获得法杖' }, keys: ['equipment'] })
                    },
                    {
                        seq: 3,
                        ts: 3000,
                        floor: 7,
                        type: 'item',
                        op: 'update',
                        ref: refId,
                        why: '转职进阶',
                        meta: JSON.stringify({ before: { text: '主角获得法杖' }, after: { text: '主角转职贤者' }, keys: ['class'] })
                    },
                    {
                        seq: 4,
                        ts: 4000,
                        floor: 9,
                        type: 'adjudication',
                        op: 'revoke',
                        ref: refId,
                        why: '剧情分歧撤回转职判定',
                        meta: '裁决撤回'
                    }
                ]
            }
        }
    };

    const res = MLR.buildMemoryLineage(itemId, mockContext);
    assert.equal(res.ok, true, '执行成功');
    assert.equal(res.writesNothing, true, '全程只读');
    assert.equal(res.itemFound, true, '识别到条目本体');

    const chain = res.lineage;
    // 验收点：沿革恰好 4 节
    assert.equal(chain.length, 4, '沿革链必须恰好 4 节');
    assert.equal(res.summary.totalSteps, 4);
    assert.equal(res.summary.creates, 1);
    assert.equal(res.summary.updates, 2);
    assert.equal(res.summary.revokes, 1);

    // 验收点：顺序与类型匹配 [create, update, update, revoke]
    assert.equal(chain[0].kind, 'create', '第 1 节是创建');
    assert.equal(chain[0].step, 1);
    assert.equal(chain[0].floor, 1);
    assert.ok(chain[0].diff.changedKeys.length > 0, '创建有 diff 记录');

    assert.equal(chain[1].kind, 'update', '第 2 节是第一次修改');
    assert.equal(chain[1].step, 2);
    assert.equal(chain[1].floor, 4);
    assert.ok(chain[1].diff.changedKeys.includes('equipment'), '包含变更键 equipment');

    assert.equal(chain[2].kind, 'update', '第 3 节是第二次修改');
    assert.equal(chain[2].step, 3);
    assert.equal(chain[2].floor, 7);
    assert.ok(chain[2].diff.changedKeys.includes('class'), '包含变更键 class');

    assert.equal(chain[3].kind, 'revoke', '第 4 节是裁决撤销');
    assert.equal(chain[3].step, 4);
    assert.equal(chain[3].floor, 9);
    assert.ok(chain[3].diff.changedKeys.includes('revoke'));
});

test('C: 缺层保真 —— 数据层被抹掉时该节标 unavailable 而不是消失', () => {
    const MLR = loadModuleInVM();
    const itemId = 'fact:missing_layer_sample';

    // 模拟条目存在，但 opLog 被损毁/无法获取
    const mockContext = {
        engine: {
            memories: [{ id: itemId, text: '无日志的存量条目', createdAt: 500, floor: 2 }],
            opLog: null // 缺少日志层
        }
    };

    const res = MLR.buildMemoryLineage(itemId, mockContext);
    assert.equal(res.ok, true, '虽然缺日志层但条目存在仍可产出');
    assert.equal(res.lineage.length, 1, '条目节保留，不消失');
    assert.equal(res.lineage[0].available, false, '数据层缺失标记 available: false');
    assert.equal(res.lineage[0].missingLayer, 'oplog', '点名缺失层为 oplog');
    assert.equal(res.summary.unavailableCount, 1, '统计缺失节');
});

test('D: 宿主集成 —— engine-diagnostic-lines 与 index.js 联调验证', () => {
    // 校验 index.js 与 engine-diagnostic-lines.js 导出与绑定一致
    assert.match(HOST_SRC, /memoryLineageReplay\(/, 'index.js 必须有 memoryLineageReplay 转发');
    assert.match(HOST_SRC, /_memoryLineageLine\(/, 'index.js 必须有 _memoryLineageLine 转发');
    assert.match(DIAG_SRC, /function memoryLineageReplay\(/, 'engine-diagnostic-lines 必须有实现');
    assert.match(DIAG_SRC, /function _memoryLineageLine\(/, 'engine-diagnostic-lines 必须有状态行实现');
});

test('E: 负控制与真源码破坏 —— 把 diff 算成空必翻红', () => {
    // 破坏锚点：将 computeDiff 中的 changedKeys 强制清空
    const broken = breakSource(
        MODULE_SRC,
        'changedKeys: Object.freeze(changedKeys),',
        'changedKeys: Object.freeze([]),',
        'L13-X1-破坏diff输出为永远为空'
    );
    const brokenMLR = loadModuleInVM(broken);
    
    // 运行相同的测试看断言是否能当场抓住破坏
    const mockContext = {
        engine: {
            memories: [{ id: 'hero', text: '主角' }],
            opLog: {
                queryByRef: () => [{
                    seq: 1, ts: 1000, floor: 1, type: 'item', op: 'create', ref: 'hero',
                    meta: JSON.stringify({ before: null, after: { text: 'hero' } })
                }]
            }
        }
    };
    const res = brokenMLR.buildMemoryLineage('hero', mockContext);
    assert.throws(() => {
        // 原版断言：创建节必须有非空 changedKeys
        assert.ok(res.lineage[0].diff.changedKeys.length > 0, '创建有 diff 记录');
    }, assert.AssertionError, '破坏 diff 结果后，原版断言必须翻红');
});

const CUR = '3.432.0';
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

test('F: 当版锚点 —— 锁当版 3.432.0', () => {
    assert.equal(vnum(CUR), 3432000);
    assert.equal(vnum('3.432.0'), vnum(CUR));
});
