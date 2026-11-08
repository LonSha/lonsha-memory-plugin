/* tests/v3459_gates_green.test.mjs — v3.459.0 全量门禁修复轮判据
 *
 * 为什么单列一个套件：上一版（v3.459.0 面板重构）只锁了「面板形态」，
 *   而本轮修的 14 个红门禁是**另一类缺陷**（登记漂移 / 幽灵守卫 / 锚点失效 / 文档陈旧）。
 *   这些缺陷的共同特征是「绿着的时候没人看，红了也没人知道该谁修」——
 *   故本套件逐条把它们从「一次性修理」变成「可复发的判据」：
 *   修好之后如果又被改回去，这里会直接点名，而不是等下一轮人工枚举。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('参考基准 = 磁盘在役测试全集（不多不少，且无重复行）', () => {
    const lines = read('tests/audit/catalog_reference_consumers.tsv').split('\n');
    const names = [];
    for (const raw of lines) {
        const t = raw.trim();
        if (!t || t.startsWith('#')) continue;
        const first = t.split('\t')[0].trim();
        if (first) names.push(first);
    }
    const onDisk = fs.readdirSync(path.join(ROOT, 'tests')).filter((f) => f.endsWith('.test.mjs')).sort();
    assert.equal(names.length, new Set(names).size, '参考基准不得有重复行');
    const regSet = new Set(names);
    const missing = onDisk.filter((f) => !regSet.has(f));
    const stale = names.filter((f) => !onDisk.includes(f));
    assert.deepEqual(missing, [], '磁盘上有、基准里没有的测试文件：' + missing.join(', '));
    assert.deepEqual(stale, [], '基准里登记了但磁盘上不存在：' + stale.join(', '));
});

test('extra_js seam 台账覆盖 manifest 全部模块', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const extraJs = manifest.extra_js || [];
    const rows = read('tests/audit/extra_js_seam_ledger.tsv').trim().split('\n').slice(1)
        .map((l) => l.split('\t')[0]);
    const regSet = new Set(rows);
    const missing = extraJs.filter((m) => !regSet.has(m));
    assert.ok(extraJs.length > 200, 'extra_js 规模不得塌陷（实为 ' + extraJs.length + '）');
    assert.deepEqual(missing, [], '未登记进 seam 台账的模块：' + missing.join(', '));
});

test('账本文本归一必须走契约 LE.text（不得就地实现）', () => {
    const src = read('fact-version.js');
    assert.ok(/const text = LE\.text;/.test(src), 'fact-version.js 必须从契约取文本归一器');
    // 与门禁 R3c 同口径：本地 const text = 非 LE. / 就地 trim / 就地 \s+ 折叠 / 就地取首行
    const BAD = [
        [/const\s+text\s*=(?!\s*LE\.)/, '本地 `const text =` 未走契约'],
        [/\.trim\(\)/, '就地 `.trim()`'],
        [/\.replace\(\s*\/\s*\\s\+/, '就地 `.replace(/\\s+/` 折叠'],
        [/\.split\(\s*'\\n'\s*\)\s*\[\s*0\s*\]/, "就地取首行 `.split('\\n')[0]`"],
    ];
    for (const [re, what] of BAD) assert.ok(!re.test(src), 'fact-version.js 出现' + what);
});

test('幽灵守卫 _activeRestatements 必须有真实写入源', () => {
    const inj = read('engine-injection-pipeline.js');
    assert.ok(/this\._activeRestatements\s*=/.test(inj), '_activeRestatements 必须有写入点，否则判定分支 100% 跳过');
    assert.ok(/recordAutobiographicalRestatement/.test(inj), '写入源必须经契约生成，不得手搓结构');
});

test('两个曾零引用的宿主方法必须接上产品面', () => {
    const sui = read('settings-ui.js');
    for (const [method, btnId] of [['compareAndMergeMigrate', 'ls-migrate-merge'],
        ['evaluateCounterfactualBranch', 'ls-cf-branch']]) {
        assert.ok(sui.includes('this.engine.' + method + '('), method + ' 必须在面板上有真调用点');
        assert.ok(sui.includes('id="' + btnId + '"'), '按钮 ' + btnId + ' 必须在册');
        assert.ok(sui.includes("querySelector('#" + btnId + "')"), '按钮 ' + btnId + ' 必须绑了 handler');
    }
});

test('两个 L14 存档面键必须显式豁免携带面并写明理由', () => {
    const idx = read('index.js');
    for (const k of ['roundSnapshots', 'migrateImportRecovery']) {
        const re = new RegExp("^\\s*'" + k + "'\\s*,[^\\n]*//\\s*\\S{4,}", 'm');
        assert.ok(re.test(idx), k + ' 必须在 CARRYOVER_EXEMPT_KEYS 里带行内理由（理由写在上方注释块等于没写）');
    }
});

test('门禁锚点必须认得召回管线的当前形态（let merged）', () => {
    const recall = read('engine-recall.js');
    assert.ok(/let merged = engine\.hybridMerge\(results\);/.test(recall),
        '召回管线该行形态已变（let merged），门禁锚点必须同步');
    const emo = read('tests/audit/scan_v3186_emotion_recall.mjs');
    assert.ok(emo.includes("'let merged = engine.hybridMerge(results);'"), 'R4 锚点须含 let 形态');
    assert.ok(emo.includes("'const merged = engine.hybridMerge(results);'"), 'R4 锚点须保留历史 const 形态（容忍旧写法）');
    const neg = read('tests/audit/scan_v3185_xref_consumer_negctl.mjs');
    assert.ok(neg.includes("'let merged = engine.hybridMerge(results);'"), 'N-R3a 破坏锚点须与宿主同形态');
});

test('PLAN 的排序型节必须唯一现行 + 旧节带陈旧标记 + 登记齐全', () => {
    const plan = read('PLAN.md');
    const lines = plan.split('\n');
    const h2 = [];
    for (let i = 0; i < lines.length; i++) {
        const m = /^##\s+(.*)$/.exec(lines[i]);
        if (m) h2.push([i + 1, m[1].trim()]);
    }
    const SORT_RE = /优先级|起手|现行排序/;
    const CURRENT_RE = /唯一现行排序/;
    const sortSections = h2.filter(([, t]) => SORT_RE.test(t));
    const current = sortSections.filter(([, t]) => CURRENT_RE.test(t));
    assert.equal(current.length, 1, '必须恰有一个「唯一现行排序」节');
    const currentLine = current[0][0];
    for (const [ln, title] of sortSections) {
        if (ln === currentLine) continue;
        const win = lines.slice(ln, Math.min(ln + 3, lines.length)).join('\n');
        assert.ok(win.includes('陈旧'), '排序型节「' + title + '」未带陈旧标记');
    }
    const listed = read('tests/audit/plan_currency.tsv').split('\n')
        .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
    assert.equal(listed.length, new Set(listed).size, 'plan_currency.tsv 不得有重复行');
    for (const [, t] of sortSections) assert.ok(listed.includes(t), '排序型节「' + t + '」未登记进 plan_currency.tsv');
    for (const t of listed) assert.ok(sortSections.some(([, x]) => x === t), '登记了但磁盘上已没有该排序型节：' + t);
});

test('relations 视图不得把「真的没有」说成「没装上」', () => {
    const sui = read('settings-ui.js');
    // relations 分支区间内，两块工作台的缺席文案必须是「没装上」，不得写「不可用」
    const start = sui.indexOf("viewType === 'relations'");
    assert.ok(start > 0, 'relations 视图必须可定位');
    const seg = sui.slice(start, start + 9000);
    for (const name of ['认知改观工作台', '关系修复工作台']) {
        assert.ok(seg.includes(name + '没装上'), name + ' 的缺席文案必须说「没装上」');
        assert.ok(!seg.includes(name + '不可用'), name + ' 不得再说「不可用」（会把整页读成关系面没装）');
    }
});