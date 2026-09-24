// tests/v3185_querytext_and_xref_consumer.test.mjs
// [v3.185.0] 两件事的验收面：
//   ① `queryText` 自由变量（核心召回路径上的必抛缺陷）——修好没有、修复是否真有效
//   ② 条目关联的消费面（P0-1 收口）——生产有没有消费者、位置对不对、默认是否零行为变化
//
// 本文件覆盖四个面：
//   ① 行为证伪：坏形态**真抛**（harness 复现 `ReferenceError`）、好形态**真跑通**
//   ② 宿主形态：只允许好形态在场；坏字面量零出现（旧测试恰好锁定了坏字面量，属假绿）
//   ③ 消费面接线：索引暴露 / 摘要入表账 / 消费点 / 诊断行 / 提权位置与幅度 / 默认关 + UI
//   ④ 发布卫生：旧锚点已交棒、当版独占交出（本版 frontier 下界必须升到本版）
import { readFileSync, existsSync, readdirSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';
const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const src = readFileSync(ROOT + 'index.js', 'utf-8');
const sui = readFileSync(ROOT + 'settings-ui.js', 'utf-8');
const mf = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf-8'));
const changelog = readFileSync(ROOT + 'CHANGELOG.md', 'utf-8');
const XL = readFileSync(ROOT + 'crosslink.js', 'utf-8');
const vnum = (v) => Number(String(v).split('.').map((x) => x.padStart(3, '0')).join(''));

/* ══════════════ 1. queryText —— 行为证伪（真跑，不看文本） ══════════════ */
// 为什么用 harness 而不是读 index.js 的文本：
//   「坏形态会抛」是**运行期事实**，文本判据只能证明「字面量换了」。
//   本 harness 复刻 recallMemory 的作用域形状（query 在、queryText 不在），
//   于是「坏形态必抛 / 好形态必通」两向都能验——这是本仓 v3.48 引入时唯一能抓住它的判据。
function runInRecallScope(callExpr) {
    const body = [
        'const engine = {',
        '    intentRerank(merged, queryText) { return String(queryText || \'\') + \'|\' + merged.length; },',
        '    _lastMerged: null,',
        '};',
        'const merged = [\'a\', \'b\'];',
        'const query = { text: \'旧事\' };',
        'function recallMemory() { return ' + callExpr + '; }',
        'return recallMemory();',
    ].join('\n');
    // eslint-disable-next-line no-new-func
    return new Function(body)();
}
test('v3185 1. 坏形态（queryText 自由变量）在召回作用域里**真抛** ReferenceError', () => {
    let err = null;
    try { runInRecallScope("engine.intentRerank(merged, queryText)"); } catch (e) { err = e; }
    assert.ok(err, '必须抛——若这里不抛，说明 harness 不再复刻真实作用域形状，判据已失效');
    assert.equal(err.constructor.name, 'ReferenceError', '抛的必须是 ReferenceError');
    assert.ok(String(err.message).includes('queryText'), '错误信息须点名 queryText：' + err.message);
});
test('v3185 2. 好形态（query.text）在同一作用域里**真跑通**，且取到查询文本', () => {
    const out = runInRecallScope('engine.intentRerank(merged, query.text)');
    assert.equal(out, '旧事|2', '意图重排与「查询文本 + 候选数」必须都正确落地');
});
test('v3185 3. 宿主只允许好形态在场：坏字面量零出现', () => {
    // 旧测试（v348_director_bridge / v3150_recall_audit）恰好锁定了坏字面量——
    //   字符串在场即绿，属典型假绿。这里反向钉住：坏形态出现即缺陷。
    assert.equal(src.split('intentRerank(merged, queryText);').length - 1, 0,
        '不得再出现意图重排的坏调用形态（该行会让整轮注入被静默清空）');
    assert.equal(src.split('this.intentRerank(merged, query.text);').length - 1, 1,
        '正确的调用形态必须恰好在场一次');
});
test('v3185 4. 静默路径确实存在（修复的必要性证据，不是假设）', () => {
    // 该缺陷之所以是「静默」的：调用链外层 catch 首行直接 return ''，零日志零归因。
    assert.ok(/catch\s*\([^)]*\)\s*\{\s*return '';\s*\}/.test(src),
        '外层静默吞异常的路径必须在场——它正是「抛了也看不出来」的原因');
});
test('v3185 5. 方法定义行的形参是合法的，不得被误删', () => {
    // 形态陷阱：`intentRerank(merged, queryText) {` 天然含该子串且完全正确。
    //   修复时若连定义行一起改掉（把形参改名），会破坏 intentRerank 自己的入参契约。
    assert.ok(/intentRerank\(merged, queryText\)\s*\{/.test(src), '定义行的形参必须保留');
});

/* ══════════════ 2. crosslink 消费面 —— 模块行为 ══════════════ */
const XLIB = require_('../crosslink.js');
test('v3185 6. crosslink 行为：停用词串按串处理（不得被逐字拆开）', () => {
    const idx = XLIB.createIndex({ stopwords: '主角,系统' });
    idx.add('主角', 'sum_9');
    idx.add('海棠', 'sum_3');
    assert.equal(idx.refsFor('主角').length, 0, '停用词不得被收录');
    assert.equal(idx.refsFor('主').length, 0, '停用词不得被拆成单字收录（Array.from 陷阱）');
    assert.deepEqual(idx.refsFor('今天海棠来了').map(String), ['sum_3'], '正常词必须能召回');
});
test('v3185 7. crosslink 指纹：同文同指纹、异文异指纹', () => {
    assert.equal(XLIB.fingerprintOf('甲同一段'), XLIB.fingerprintOf('甲同一段'));
    assert.notEqual(XLIB.fingerprintOf('甲同一段'), XLIB.fingerprintOf('乙同一段'));
});

/* ══════════════ 3. 消费面接线（产出必须有消费者） ══════════════ */
test('v3185 8. 消费面四件套都在场（定义 + 调用）', () => {
    const need = [
        ['_crosslinkConsumePair', '候选挑取'],
        ['_crosslinkConsumeAlive', '过期退场判定'],
        ['_crosslinkConsumeLine', '消费面诊断行'],
        ['_crosslinkXrefs', '摘要入表的幂等账'],
    ];
    for (const [needle, label] of need) {
        const n = src.split(needle).length - 1;
        assert.ok(n >= 2, label + '（' + needle + '）须定义 + 被调用，实际出现 ' + n + ' 次');
    }
    assert.ok(/refsFor\s*\(/.test(src), '召回侧必须真调用 refsFor（否则候选算出来没人用）');
});
test('v3185 9. 索引与读数都被暴露（区分「模块缺席 / 尚未建索引 / 正常」）', () => {
    assert.ok(src.includes('this._xrefIdx = idx'), '索引须暴露给诊断行');
    for (const k of ['_crosslinkXrefN', '_crosslinkConsumed', '_crosslinkConsumeMissN', '_crosslinkRefRanked']) {
        assert.ok(src.split(k).length - 1 >= 2, k + ' 须既有写入又有读取（否则读数恒空）');
    }
});
test('v3185 10. 提权位置：在 hybridMerge 之后、intentRerank 之前', () => {
    const iMerge = src.indexOf('const merged = this.hybridMerge(results);');
    const iBoost = src.indexOf('_crosslinkBoostKeys && _crosslinkBoostKeys.size');
    const iRerank = src.indexOf('this.intentRerank(merged, query.text);');
    assert.ok(iMerge > 0 && iBoost > 0 && iRerank > 0, '三个锚点都必须在场');
    assert.ok(iMerge < iBoost, '提权必须在融合之后（分数已定）');
    assert.ok(iBoost < iRerank, '提权必须在重排之前（名次才受影响）');
});
test('v3185 11. 提权幅度只动名次边界，且不越权写图', () => {
    const amt = (src.match(/rrfScore\s*=\s*\(_it\.rrfScore \|\| 0\)\s*\+\s*([0-9.]+)/) || [])[1];
    assert.ok(amt, '必须能在源码里读出提权常量');
    assert.ok(Number(amt) <= 0.05, '幅度须小到不足以把低相关条目抬进前排，实际 ' + amt);
    const block = src.slice(src.indexOf('if (_crosslinkBoostKeys && _crosslinkBoostKeys.size)'),
        src.indexOf('this.intentRerank(merged, query.text);'));
    for (const forbidden of ['addEdge', 'removeRef', 'graph.add']) {
        assert.ok(!block.includes(forbidden), '提权块内不得 ' + forbidden + '（承诺只提名次）');
    }
});
test('v3185 12. 诊断行「条目复用」真进 selfCheck 的子系统列表', () => {
    assert.ok(src.includes("['条目复用', line"), '须有该行，且值来自消费面诊断');
    assert.ok(/_crosslinkConsumeLine\(\)/.test(src), '诊断行须真读消费面读数');
    // ⚠️ 必须只挂在 idle（有摘要且一条都没进表）上——
    //   否则「本轮无可提关联」（正常）与「关联根本没接上」（缺陷）同形。
    assert.ok(/hasSums\s*&&\s*this\._xrefIdx\s*!=\s*null\s*&&\s*!Number\(this\._crosslinkXrefN \|\| 0\)/.test(src),
        '⚠️ 须与 idle 条件绑定');
});
test('v3185 13. 默认关 + 有 UI 控件（默认路径零行为变化）', () => {
    assert.ok(/crosslinkRecallBoost:\s*false/.test(src), '新键默认必须是 false');
    assert.ok(src.includes('crosslinkRecallBoost === true') || src.includes("crosslinkRecallBoost === true"),
        '开关键必须有真消费点（防死配置）');
    assert.ok(sui.includes("ck('crosslinkRecallBoost'"), '必须有 UI 控件');
});
test('v3185 14. 消费面提权在关闭时不扫描（零开销承诺）', () => {
    const i = src.indexOf('if (this.config.config.crosslinkRecallBoost === true && this._crosslinkIndex)');
    assert.ok(i > 0, '提权入口须同时受开关与索引存在性约束');
    const guard = src.slice(i, i + 400);
    assert.ok(!/for\s*\(/.test(guard.slice(0, guard.indexOf('refsFor'))),
        '开关关时连扫描都不应做（承诺零开销）');
});

/* ══════════════ 4. 审计基建接线 ══════════════ */
test('v3185 15. 两个新审计脚本已落位、可独立运行、且都能阻断', () => {
    for (const f of ['scan_v3185_xref_consumer.mjs', 'scan_v3185_xref_consumer_negctl.mjs']) {
        const p = ROOT + 'tests/audit/' + f;
        assert.ok(existsSync(p), f + ' 必须存在');
        const t = readFileSync(p, 'utf-8');
        assert.ok(t.includes('process.exit'), f + ' 必须有退出码（否则永不阻断）');
        assert.ok(/process\.exit\(2\)/.test(t), f + ' 必须有结构漂移退出码 2');
    }
});
test('v3185 16. 负控制覆盖本版全部新判别力', () => {
    const neg = readFileSync(ROOT + 'tests/audit/scan_v3185_xref_consumer_negctl.mjs', 'utf-8');
    for (const g of ['N-R2a', 'N-R3a', 'N-R3b', 'N-R4a', 'N-R4b', 'N-R5a', 'N-R6a', 'N-R6b', 'N-R0a', 'N-R0b']) {
        assert.ok(neg.includes(g), '负控制缺少 ' + g + ' 组');
    }
    // 工具两向自证 + 还原自证（本仓审计基建惯例）
    assert.ok(neg.includes('工具两向自证'), '须含工具两向自证');
    assert.ok(neg.includes('原版工作区未被触碰'), '须含还原自证（破坏只发生在临时副本）');
});
test('v3185 17. 审计脚本自身带归因串契约（判别力丢失可察）', () => {
    const sc = readFileSync(ROOT + 'tests/audit/scan_v3185_xref_consumer.mjs', 'utf-8');
    assert.ok(sc.includes('EXPECT_ATTRIB'), '须声明负控制依赖的归因串');
    assert.ok(sc.includes('declStripped'), '归因串检查须在剔除声明数组后的文本上做（防自满足）');
    assert.ok(sc.includes('EXPECT_CALLSITE_MIN'), '须有静态调用点数下界（骨架不得缩水）');
});

/* ══════════════ 5. 发布卫生：交棒链 ══════════════ */
test('v3185 18. 版本四处同源且 CHANGELOG 顶节是本版', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, mf.version, 'manifest 须跟随 index.js');
    assert.strictEqual(v, pkg.version, 'package.json 须跟随 index.js');
    assert.ok(changelog.startsWith('## v' + v), 'CHANGELOG 顶节须为本版');
});
test('v3185 19. 链条起点（v3117/v3130/v3147）仍锚着版本字符串，且不承诺未来', () => {
    // [v3.203.0] 旧判据要求锚点「不低于上一版」，即每隔几版就要人工上抬。
    //   现在它们只锁自己的出生版本；此处守版本无关的不变量。
    const cur = vnum(/const VERSION = '([0-9.]+)'/.exec(src)[1]);
    for (const f of ['v3117_diagnostics', 'v3130_control_plane', 'v3147_cooldown_and_dual_hash']) {
        const t = readFileSync(ROOT + 'tests/' + f + '.test.mjs', 'utf-8');
        const hits = [...t.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map((m) => m[1]);
        assert.ok(hits.length > 0, f + ' 仍须锚着版本字符串');
        assert.ok(hits.every((h) => vnum(h) <= cur), f + ' 的锚点不得高于现版');
    }
});
test('v3185 20. 历史 frontier 的下界不得高于现版（交棒链已拆除）', () => {
    // [v3.203.0] 旧判据要求这些下界「已升到本版」，即每次发版都要人工改一遍。
    const curV = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    const cur = vnum(curV);
    const frontier = ['v3160_config_declaration_gap', 'v3161_config_reachability', 'v3162_ui_binding_hygiene',
        'v3163_module_wiring', 'v3164_event_lifecycle', 'v3165_claim_truthfulness',
        'v3166_config_migration_write_ledger', 'v3167_cse_capacity_identity',
        'v3180_floor_ledger_age_anchor_public_interface', 'v3181_spatial_grounding', 'v3182_ledger_replay'];
    for (const f of frontier) {
        const t = readFileSync(ROOT + 'tests/' + f + '.test.mjs', 'utf-8');
        const hits = [...t.matchAll(/vnum\('(\d+[.]\d+[.]\d+)'\)/g)].map((m) => vnum(m[1]));
        assert.ok(hits.length > 0, f + ' 应有版本下界断言');
        assert.ok(hits.every((h) => h <= cur), f + ' 的版本下界高于现版（' + hits.join(',') + ' > ' + cur + '）');
    }
});
test('v3185 21. 本版 test 文件自身进了 tests/ 目录（发布面可见）', () => {
    const files = readdirSync(ROOT + 'tests').filter((f) => f.endsWith('.test.mjs'));
    assert.ok(files.includes('v3185_querytext_and_xref_consumer.test.mjs'), '本版测试文件须在目录里');
});

/* ══════════════ 6. 判据面自防护 ══════════════ */
test('v3185 22. 判据面自防护：断言数与关键指纹不得缩水', () => {
    const self = readFileSync(new URL(import.meta.url).pathname, 'utf-8');
    const nAssert = (self.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 45, '断言数不得缩水（>= 45），实际 ' + nAssert + ' —— 判据被删或改宽松时此处必须响');
    const codeLines = self.split('\n').filter((l) => {
        const s = l.trim();
        return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*');
    }).length;
    assert.ok(codeLines >= 110, '有效代码行不得缩水（>= 110），实际 ' + codeLines);
    // 指纹用自拼接（若写成整串，改掉断言时指纹也跟着改 —— 自我满足，等于没防）
    const fp = [
        ['坏形态真抛', "assert.equal(err.constructor.name, 'Reference" + "Error'"],
        ['好形态真跑通', "assert.equal(out, '旧事" + "|2'"],
        ['坏字面量零出现', "src.split('intentRerank(merged, queryText);')"],
        ['提权位置', 'assert.ok(iBoost < iRerank'],
        ['默认关', 'crosslinkRecallBoost:'],
        ['交棒链', 'assert.ok(hits.every((h) => h <= cur)'],
    ];
    for (const [label, needle] of fp) {
        assert.ok(self.includes(needle), '关键指纹缺失：' + label);
    }
});
