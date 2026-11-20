/* ============================================================
 * tests/v3475_l26_delivery.test.mjs — v3.475.0 · 第二十六期（L26-O1~O9 / L26-X1~X9）交付自证
 *
 * 【本档要证明的四件事（不是「文件在场」）】
 *   a) **登记真的落到可装载面**：manifest.extra_js 含全部 18 个文件名；
 *      optional-engine-registry.entries 含全部 18 条，且 status() 里逐条 loaded === true
 *      （登记名写错 = loadOne 静默 null = 引擎永不实例化，这条会把静默变成红）；
 *   b) **四源同源**：index.js 的 VERSION / package.json / manifest.json 三者互等，
 *      且都等于本档 BORN_V（本档即当版，锚住版本守卫 V4）；
 *   c) **判据面在场且成组**：18 个 l26_*.test.mjs 逐条在磁盘，文件名与本档名单一一对应
 *      （少一个就是「交付了但没判据」）；
 *   d) **发布面同源**：CHANGELOG 顶节是本版、TODO「最近更新」是本版、
 *      路线图 v26 已有 §5 交付登记且登记了十八项与 7 处拒载路径。
 *
 * 【三条「不做」也在判据里】
 *   1 不重跑全量：本档只核对「登记 ↔ 磁盘 ↔ 文档」，跑批留给人；
 *   2 不手改 JSON：一律只读，判「是否同源」；
 *   3 不放宽口径：`X2` 的双仓纪律不因本档全绿而消失 —— 本档只证明「契约侧已落」，
 *     真数据同轮验收仍待可跑轮（见路线图 §5.3 第 1 条）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const require = createRequire(import.meta.url);
const BORN_V = '3.475.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

const RD = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');
const RJ = (rel) => JSON.parse(RD(rel));

// 十八项：全局名 / 模块文件 / 判据文件（一一对应，名单就是真源）
const L26 = [
    ['LonShaHostRefusalGate', 'host-refusal-gate.js', 'l26_o1_host_refusal.test.mjs'],
    ['LonShaExtraJsRetirement', 'extra-js-retirement.js', 'l26_o2_extra_js_retirement.test.mjs'],
    ['LonShaRecallRegressionGuard', 'recall-regression-guard.js', 'l26_o3_recall_regression.test.mjs'],
    ['LonShaLogLevelGate', 'log-level-gate.js', 'l26_o4_log_level.test.mjs'],
    ['LonShaDataMigrationMatrix', 'data-migration-matrix.js', 'l26_o5_data_migration.test.mjs'],
    ['LonShaI18nKeysParity', 'i18n-keys-parity.js', 'l26_o6_i18n_parity.test.mjs'],
    ['LonShaCapacityReadings', 'capacity-readings.js', 'l26_o7_capacity_readings.test.mjs'],
    ['LonShaDiagCodesHumanize', 'diag-codes-humanize.js', 'l26_o8_diag_codes.test.mjs'],
    ['LonShaDocReadingsGenerator', 'doc-readings-generator.js', 'l26_o9_doc_readings.test.mjs'],
    ['LonShaMemoryArchivePortability', 'memory-archive-portability.js', 'l26_x1_archive_portability.test.mjs'],
    ['LonShaRubyphoneBridgeContract', 'rubyphone-bridge-contract.js', 'l26_x2_rubyphone_bridge.test.mjs'],
    ['LonShaMemoryVisualPanel', 'memory-visual-panel.js', 'l26_x3_visual_panel.test.mjs'],
    ['LonShaPresetPack', 'preset-pack.js', 'l26_x4_preset_pack.test.mjs'],
    ['LonShaRelationTimelineView', 'relation-timeline-view.js', 'l26_x5_relation_timeline.test.mjs'],
    ['LonShaConflictAdvice', 'conflict-advice.js', 'l26_x6_conflict_advice.test.mjs'],
    ['LonShaMemoryHealthBoard', 'memory-health-board.js', 'l26_x7_health_board.test.mjs'],
    ['LonShaBatchOpLedger', 'batch-op-ledger.js', 'l26_x8_batch_ledger.test.mjs'],
    ['LonShaRecallExplainer', 'recall-explainer.js', 'l26_x9_recall_explainer.test.mjs']
];

test('A1 登记：manifest.extra_js 含全部 18 个模块文件名', () => {
    const man = RJ('manifest.json');
    const missing = L26.filter(([, f]) => man.extra_js.indexOf(f) < 0).map(([, f]) => f);
    assert.deepEqual(missing, [], '缺登记：' + missing.join('、'));
    assert.equal(man.extra_js.length, 433, 'extra_js 应为 433（415 + 18），实为 ' + man.extra_js.length);
});

test('A2 登记：可选引擎注册表 18 条全在，且 status() 逐条 loaded 为真', () => {
    const reg = require(path.join(R, 'optional-engine-registry.js'));
    const st = reg.status();
    for (const [g, f] of L26) {
        const row = st.find((x) => x.file === f);
        assert.ok(row, '注册表缺条目：' + f);
        assert.equal(row.name, g, f + ' 的登记名应为 ' + g);
        assert.equal(row.loaded, true, f + ' 登记了但 loadOne 拿不到（全局名对不上？）');
    }
    assert.equal(reg.entries.length, 129, '注册表应为 129 条（111 + 18），实为 ' + reg.entries.length);
});

test('A3 登记：loadAll() 真能取到十八个工厂对象（不是只登记不装载）', () => {
    const reg = require(path.join(R, 'optional-engine-registry.js'));
    const api = reg.loadAll();
    for (const [g] of L26) {
        assert.ok(api[g], 'loadAll 取不到 ' + g);
        assert.equal(typeof api[g], 'object', g + ' 应为工厂对象（方法集合）');
        assert.ok(Object.keys(api[g]).length > 0, g + ' 是空对象（工厂没有方法）');
    }
});

test('A4 四源同源：index.js / package.json / manifest.json 三者互等且等于当版', () => {
    const idxV = (/const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(RD('index.js')) || [])[1];
    assert.equal(idxV, BORN_V, 'index.js VERSION 应为当版');
    assert.equal(RJ('package.json').version, BORN_V);
    assert.equal(RJ('manifest.json').version, BORN_V);
    assert.equal(vnum(BORN_V), 3475000, '本档锚点：当版号与 vnum 口径自洽');
});

test('A5 判据面：18 套 l26_*.test.mjs 逐条在磁盘，名单一一对应', () => {
    const have = new Set(fs.readdirSync(path.join(R, 'tests')).filter((f) => f.startsWith('l26_') && f.endsWith('.test.mjs')));
    const missing = L26.filter(([, , t]) => !have.has(t)).map(([, , t]) => t);
    assert.deepEqual(missing, [], '缺判据：' + missing.join('、'));
    assert.equal(have.size, 18, 'l26_ 判据文件应为 18 个，实为 ' + have.size);
});

test('B1 发布面：CHANGELOG 顶节就是当版', () => {
    const head = RD('CHANGELOG.md').split('\n')[0];
    assert.equal(head, '## v' + BORN_V, 'CHANGELOG 顶节应为 ## v' + BORN_V + '，实为 ' + head);
});

test('B2 发布面：TODO「最近更新」就是当版（接手面不能停在上版）', () => {
    const m = /最近更新：v([0-9]+[.][0-9]+[.][0-9]+)/.exec(RD('TODO.md'));
    assert.ok(m, 'TODO 缺「最近更新：vX.Y.Z」');
    assert.equal(m[1], BORN_V);
});

test('B3 交付登记：路线图 v26 有 §5，且十八项与 7 处拒载路径都登记了', () => {
    const doc = RD('docs/planning/2026-11-18-product-roadmap-v26.md');
    assert.match(doc, /^## 5\. 交付登记/m, '路线图缺 §5 交付登记');
    for (const [g, f] of L26) {
        assert.ok(doc.includes(f), '§5 里没有登记 ' + f);
        assert.ok(doc.includes(g), '§5 里没有登记全局名 ' + g);
    }
    const codes = ['HOST_REFUSED', 'RETIRE_BLOCKED', 'MIGRATION_REFUSED', 'ARCHIVE_REFUSED',
        'PRESET_INVALID', 'ADVICE_NOT_APPLICABLE', 'BATCH_UNDO_EXPIRED'];
    for (const c of codes) assert.ok(doc.includes(c), '§5 拒载账里缺 ' + c);
});

test('B4 边界如实：X2 仍按双仓纪律标「未交付」，没有写成已完', () => {
    const doc = RD('docs/planning/2026-11-18-product-roadmap-v26.md');
    assert.match(doc, /X2.*仍不按「已交付」结账/, '§5.3 必须显式声明 X2 未结账（双仓纪律）');
    const rh = RJ('tests/audit/realhost_readings.json');
    assert.equal(rh.version, BORN_V);
    // 措辞由 state-report 生成器决定（「ST 未就绪…先起 SillyTavern」或「未执行」），
    // 判据只锁语义：必须给出「为什么没跑」，且不许出现「通过 / 已复核」这类宣称。
    const why = String(rh.reason || '');
    assert.ok(why.length >= 8, '真机读数必须写出未跑的原因（不许空着）');
    assert.match(why, /未就绪|未执行|unavailable/, '真机读数须说明为何没跑：' + why);
    assert.ok(!/通过|已复核/.test(why), '真机读数不许写成通过：' + why);
});

test('B5 落地产物可复算：健康看板的异常分支确实由数据触发（旧写法永不成立）', () => {
    const H = require(path.join(R, 'memory-health-board.js'));
    // 条数少于基线 ⇒ anomaly；这条曾经因为 `growth < 0` 永不成立而恒判 ok。
    const b = H.board({ records: [{ id: 'a', content: 'x' }], baseline: { count: 5 } });
    assert.equal(b.state, 'anomaly', '条数少于基线必须告警（growth 为 0.2 但确实变少了）');
    // 反向对照：条数等于基线 ⇒ ok，证明上面的红不是因为「有基线就红」。
    const ok = H.board({ records: [{ id: 'a', content: 'x' }], baseline: { count: 1 } });
    assert.equal(ok.state, 'ok');
});