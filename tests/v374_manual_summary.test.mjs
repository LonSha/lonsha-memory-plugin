// tests/v374_manual_summary.test.mjs
// LonSha 记忆引擎 v3.74.0 摘要手动操作（编辑+补摘+缺失楼层清单）测试
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const srcRaw = readFileSync(`${REPO_ROOT}/index.js`, 'utf-8');
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const src = srcRaw + String.fromCharCode(10) + readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8');
const su = readFileSync(`${REPO_ROOT}/settings-ui.js`, 'utf-8');

/* [v3.279.0 O7] 抽取面改为**真模块装载**：修前本档从源码抠 SummarySystem 类体 + new Function 重放，
 *   那是与 memory-core.js 真类**并行的第二实现**（类外符号靠注入，漂移了本档绿着而真类已坏）。
 *   现在直接 require 真模块拿真类 —— 语义一字不改，只换「被跑的对象」；静态面仍读「入口 + 该模块」合看。 */
const require_ = createRequire(import.meta.url);
const MC = require_(new URL('../memory-core.js', import.meta.url).pathname);


test('=== 1. 静态关键字检查 ===', () => {
    // A 引擎侧
    assert.ok(src.includes('updateSummaryText(floor, newText)'), '编辑摘要方法');
    assert.ok(/addManualSummary\(floor, text(, storyTime = '')?\)/.test(src), '手动补摘方法');   // [v3.80] 宽域化：支持 storyTime 参数
    assert.ok(src.includes('missingFloors(maxFloor)'), '缺失楼层清单');
    assert.ok(src.includes('s.edited = true;'), '编辑标记');
    assert.ok(src.includes('manual: true'), '补摘标记');
    // B UI 侧
    assert.ok(su.includes('✏ 编辑该摘要'), '编辑按钮');
    assert.ok(su.includes('ls-ms-floor'), '楼层输入');
    assert.ok(su.includes('ls-ms-text'), '文本输入');
    assert.ok(su.includes('ls-ms-add'), '补摘按钮');
    assert.ok(su.includes('s.summary?.addManualSummary'), '补摘调用');
    assert.ok(su.includes('eng.summary.updateSummaryText(id, nt)'), '编辑调用');
    assert.ok(su.includes('该楼层已有摘要'), '幂等提示');
    assert.ok(su.includes('引擎版本过旧'), '版本守卫');
});

test('=== 2. updateSummaryText 功能测试 ===', () => {
    // [v3.279.0 O7] 真模块装载（修前是抠类体 + new Function 重放）
    const s = new MC.SummarySystem();
    // 无摘要时更新失败
    assert.strictEqual(s.updateSummaryText(1, '新文本'), false, '无摘要拒绝');
    // 手动造一条摘要再更新
    s.summaries.push({ floor: 1, text: '原始摘要内容，包含很多细节描述。', timestamp: Date.now() });
    assert.strictEqual(s.updateSummaryText(1, '编辑后的摘要文本'), true, '更新成功');
    assert.strictEqual(s.summaries[0].text, '编辑后的摘要文本', '文本已更新');
    assert.strictEqual(s.summaries[0].edited, true, '编辑标记');
    assert.ok(s.summaries[0].editedAt > 0, '编辑时间戳');
    // 空文本拒绝
    assert.strictEqual(s.updateSummaryText(1, '  '), false, '空文本拒绝');
    // 超长截断（smartTruncate 2000）
    const long = 'x'.repeat(3000);
    assert.strictEqual(s.updateSummaryText(1, long), true, '超长更新成功');
    assert.ok(s.summaries[0].text.length <= 2002, '截断到 2000');
});

test('=== 3. addManualSummary 功能测试 ===', () => {
    // [v3.279.0 O7] 真模块装载（修前是抠类体 + new Function 重放）
    const s = new MC.SummarySystem();
    // 正常补摘
    const r = s.addManualSummary(42, '林一在聚贤庄留下解药。');
    assert.ok(r, '补摘成功');
    assert.strictEqual(r.floor, 42, '楼层');
    assert.strictEqual(r.manual, true, '手动标记');
    assert.strictEqual(r.importance, 5, '默认重要度');
    // 幂等：同楼层拒绝
    assert.strictEqual(s.addManualSummary(42, '重复'), null, '同楼层拒绝');
    // 无效楼层拒绝
    assert.strictEqual(s.addManualSummary(-1, 'x'), null, '负楼层拒绝');
    assert.strictEqual(s.addManualSummary(NaN, 'x'), null, 'NaN 拒绝');
    assert.strictEqual(s.addManualSummary(5, ''), null, '空文本拒绝');
    // 排序保持（乱序补摘后 floor 升序）
    s.addManualSummary(3, '更早的剧情摘要内容。');
    assert.strictEqual(s.summaries[0].floor, 3, '排序后 3 在前');
    assert.strictEqual(s.summaries[1].floor, 42, '42 在后');
});

test('=== 4. missingFloors 功能测试 ===', () => {
    // [v3.279.0 O7] 真模块装载（修前是抠类体 + new Function 重放）
    const s = new MC.SummarySystem();
    assert.doesNotThrow(() => s.missingFloors(5), '独立抽取的 SummarySystem 不应依赖宿主 errLog');
    s.summaries.push({ floor: 1, text: 'a' }, { floor: 3, text: 'c' });
    assert.deepStrictEqual(s.missingFloors(5), [0, 2, 4, 5], '缺失楼层清单');
    assert.deepStrictEqual(s.missingFloors(2), [0, 2], '小范围');
    assert.deepStrictEqual(s.missingFloors(-1), [], '负 maxFloor 空清单');
    // 全覆盖
    const s2 = new MC.SummarySystem();
    s2.summaries.push({ floor: 0, text: 'a' }, { floor: 1, text: 'b' });
    assert.deepStrictEqual(s2.missingFloors(1), [], '全覆盖空清单');
});

test('=== 5. UI 交互完整性检查 ===', () => {
    // 补摘绑定流程
    assert.ok(su.includes("const f = Number(floorIn.value);"), '楼层解析');
    assert.ok(su.includes("if (!Number.isFinite(f) || f < 0)"), '楼层校验');
    assert.ok(su.includes("if (e.key === 'Enter') doAdd();"), 'Enter 提交');
    assert.ok(su.includes("plugin.showBrowser('summaries')"), '视图刷新');
    // 编辑后 BM25 同步
    assert.ok(su.includes('eng.bm25?.rebuild'), 'BM25 同步');
});