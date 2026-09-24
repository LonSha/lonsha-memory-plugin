import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const src = readFileSync(`${REPO_ROOT}/index.js`, 'utf-8');
const su = readFileSync(`${REPO_ROOT}/settings-ui.js`, 'utf-8');

test('=== 1. A: protagonist 生命周期方法（静态特征） ===', () => {
    assert.ok(src.includes('removeProtagonistByFloor(floor)'), '删楼指针归零方法');
    assert.ok(src.includes('shiftProtagonistFloor(deleted)'), '位移指针跟随方法');
    assert.ok(src.includes('[v3.83] A: 主角档案楼层指针回滚'), 'A 标记');
    assert.ok(src.includes('[v3.83] B: 主角档案楼层指针位移'), 'B 标记');
    // 挂接点存在
    assert.ok(src.includes("rollbackFloor.主角档案指针回滚"), 'rollbackFloor 挂接');
    assert.ok(src.includes("shiftFloorsFrom.主角档案位移"), 'shiftFloorsFrom 挂接');
});

test('=== 2. A: removeProtagonistByFloor 逻辑复刻 ===', () => {
    const removeByFloor = (protagonist, floor) => {
        const f = Number(floor);
        if (!Number.isFinite(f) || f <= 0) return { n: 0, floor: protagonist.floor };
        if (protagonist && Number(protagonist.floor) === f) {
            protagonist.floor = 0;
            return { n: 1, floor: 0 };
        }
        return { n: 0, floor: protagonist.floor };
    };
    // 命中：指针归零
    const p1 = { identity: '学生', floor: 5 };
    const r1 = removeByFloor(p1, 5);
    assert.strictEqual(r1.n, 1, '命中删楼');
    assert.strictEqual(p1.floor, 0, '指针归零');
    assert.strictEqual(p1.identity, '学生', '内容不回滚');
    // 未命中：不动
    const p2 = { floor: 3 };
    assert.strictEqual(removeByFloor(p2, 5).n, 0, '未命中不处理');
    assert.strictEqual(p2.floor, 3, '指针不变');
    // floor=0 守卫（指针本就无效，不重复处理）
    const p3 = { floor: 0 };
    assert.strictEqual(removeByFloor(p3, 0).n, 0, '0 楼守卫');
    // 非法输入
    assert.strictEqual(removeByFloor({ floor: 2 }, NaN).n, 0, 'NaN 守卫');
    assert.strictEqual(removeByFloor({ floor: 2 }, -1).n, 0, '负数守卫');
});

test('=== 3. A: shiftProtagonistFloor 逻辑复刻 ===', () => {
    const shift = (protagonist, deleted) => {
        const del = Number(deleted);
        if (!Number.isFinite(del)) return { n: 0, floor: protagonist.floor };
        const f = Number(protagonist?.floor);
        if (Number.isFinite(f) && f > del) { protagonist.floor = f - 1; return { n: 1, floor: protagonist.floor }; }
        return { n: 0, floor: protagonist.floor };
    };
    const p1 = { floor: 7 };
    assert.deepStrictEqual(shift(p1, 3), { n: 1, floor: 6 }, '删楼前移跟随');
    const p2 = { floor: 2 };
    assert.deepStrictEqual(shift(p2, 3), { n: 0, floor: 2 }, '删楼之后不动');
    const p3 = { floor: 3 };
    assert.deepStrictEqual(shift(p3, 3), { n: 0, floor: 3 }, '等于被删楼不动');
    const p4 = { floor: 0 };
    assert.deepStrictEqual(shift(p4, 1), { n: 0, floor: 0 }, '无效指针不动');
    // 边界：deleted=0 时全部前移
    const p5 = { floor: 5 };
    assert.deepStrictEqual(shift(p5, 0), { n: 1, floor: 4 }, 'deleted=0 边界');
});

test('=== 4. B: UI 视图与操作分支（静态特征） ===', () => {
    assert.ok(su.includes("viewType === 'protagonist'"), '主角视图分支');
    assert.ok(su.includes('data-view="protagonist"'), '统计卡片入口');
    assert.ok(su.includes('主角档案 👁'), '卡片标签');
    assert.ok(su.includes('kind === "protagonist_field"'), '字段编辑操作分支');
    assert.ok(su.includes('kind === "life"'), '生活小档案操作分支');
    assert.ok(su.includes('📌 置顶常驻'), 'tier 操作：置顶');
    assert.ok(su.includes('📦 沉降'), 'tier 操作：沉降');
    assert.ok(su.includes('🔹 常规'), 'tier 操作：常规');
    // 三 tier 分组渲染
    assert.ok(su.includes("for (const tier of ['pinned', 'active', 'archive'])"), '三 tier 分组');
});

test('=== 5. B: 操作分支逻辑复刻（tier 切换与删除还原） ===', () => {
    // tier 切换
    const ld = { id: 'life_1', text: '习惯喝黑咖啡', tier: 'active' };
    const setTier = (tier) => { const old = ld.tier || 'active'; ld.tier = tier; return () => { ld.tier = old; }; };
    const undo1 = setTier('pinned');
    assert.strictEqual(ld.tier, 'pinned', '置顶生效');
    undo1();
    assert.strictEqual(ld.tier, 'active', '撤销还原');
    // 删除 + 原位还原
    const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const idx2 = list.findIndex(x => x.id === 'b');
    const backup = { ...list[idx2] };
    const filtered = list.filter(x => x.id !== 'b');
    assert.strictEqual(filtered.length, 2, '删除生效');
    filtered.splice(idx2, 0, backup);
    assert.deepStrictEqual(filtered.map(x => x.id), ['a', 'b', 'c'], '撤销原位还原');
    // 编辑还原
    const item = { text: '旧文本' };
    const old = item.text; item.text = '新文本';
    assert.strictEqual(item.text, '新文本');
    item.text = old;
    assert.strictEqual(item.text, '旧文本', '编辑撤销还原');
});

test('=== 6. C: 报告第 12 板块 ===', () => {
    assert.ok(src.includes("push('## 🧬 生活小档案')"), '报告板块标题');
    assert.ok(src.includes('[v3.83] C: 生活小档案板块'), 'C 标记');
    // 三 tier 标签
    assert.ok(src.includes("d.tier === 'pinned' ? '📌 '"), '置顶标签');
    assert.ok(src.includes("d.tier === 'archive' ? '📦 '"), '沉降标签');
    // 板块文案 12
    assert.ok(su.includes('全部 12 个板块'), '板块文案更新');
    assert.ok(!su.includes('全部 11 个板块'), '旧文案绝迹');
});

test('=== 7. C: 报告板块输出逻辑复刻 ===', () => {
    const build = (lifeDetails) => {
        const L = [];
        const ldList = lifeDetails || [];
        if (ldList.length) {
            L.push('## 🧬 生活小档案');
            L.push('');
            for (const d of ldList) {
                const tag = d.tier === 'pinned' ? '📌 ' : d.tier === 'archive' ? '📦 ' : '';
                L.push(`- ${tag}${d.text}${d.floor ? `（第${d.floor}楼）` : ''}`);
            }
            L.push('');
        }
        return L.join('\n');
    };
    const md = build([
        { text: '早起先喝温水', tier: 'pinned', floor: 3 },
        { text: '怕黑', tier: 'active', floor: 8 },
        { text: '旧设定：讨厌猫', tier: 'archive', floor: 1 },
    ]);
    assert.ok(md.includes('📌 早起先喝温水（第3楼）'), '置顶条目');
    assert.ok(md.includes('- 怕黑（第8楼）'), '常规条目无标签');
    assert.ok(md.includes('📦 旧设定：讨厌猫（第1楼）'), '沉降条目');
    // 空列表不产生板块
    assert.strictEqual(build([]), '', '空列表无板块');
});

test('=== 8. 版本与完整性 ===', () => {
    const manifest = JSON.parse(readFileSync(`${REPO_ROOT}/manifest.json`, 'utf-8'));
    const ver = src.match(/const VERSION = '([^']+)'/)[1];
    assert.strictEqual(manifest.version, ver, 'manifest 与 index.js 版本一致');
    assert.match(ver, /^3\.\d{2,}\.\d+$/, '版本号格式宽域');
    // 原有方法未破坏
    assert.ok(src.includes('removeLifeDetailByFloor(floor)'), 'v3.82 方法保留');
    assert.ok(src.includes('shiftLifeDetailFloors(deleted)'), 'v3.82 方法保留');
});

console.log('v383 测试套件加载完成');