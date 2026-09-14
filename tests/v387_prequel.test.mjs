// tests/v387_prequel.test.mjs
// v3.87 吸收 MyriadKnots recall-prequel：前情导入与边界加权切片注入
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { test } from 'node:test';
import assert from 'node:assert';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf-8');

// 版本断言
const vMatch = src.match(/const VERSION = '([^']+)'/);
assert.ok(vMatch, 'VERSION 未找到');
assert.strictEqual(vMatch[1], '3.90.0', `版本应为 3.90.0，实际 ${vMatch[1]}`);

// 抽取 PrequelSystem 类（依赖 BM25 类）
function extractClasses() {
    const pqStart = src.indexOf('class PrequelSystem {');
    assert.ok(pqStart > 0, 'PrequelSystem 未找到');
    const ssStart = src.indexOf('class SummarySystem {', pqStart);
    assert.ok(ssStart > pqStart, 'PrequelSystem 类终点未找到');
    let body = src.slice(pqStart, ssStart);
    // PrequelSystem 类与前置注释一起截取（类定义前的注释属它自己）
    const bmStart = src.indexOf('class BM25 {');
    const bmEnd = src.indexOf('class CharacterState {', bmStart);
    const bmBody = src.slice(bmStart, bmEnd).replace(/\n    \/\/ \[v2\.0\] P2[\s\S]*$/, '');
    // 去一层缩进（8 空格 → 2 空格）便于 eval
    const deindent = (s) => s.replace(/\n        /g, '\n  ');
    const BM25cls = new Function('return (' + deindent(bmBody) + ')')();
    // PrequelSystem 闭包内引用 BM25：作为参数注入其求值作用域
    const PQ = new Function('BM25', 'return (' + deindent(body) + ')')(BM25cls);
    return { BM25: BM25cls, PrequelSystem: PQ };
}

// ── 1. 边界加权切片 ──
test('=== 1. 边界加权切片（换行3/句号2/避免断句） ===', () => {
    const { PrequelSystem } = extractClasses();
    const pq = new PrequelSystem();
    // 560+ 字长文，含自然换行与句号
    const para = '第一章的剧情概要，主角来到了陌生的小镇，遇到一位神秘老人。老人交给他一把钥匙，说起了被封印的塔楼。'.repeat(20); // ~640字
    const text = para + '\n\n' + '第二章：主角登上了塔楼顶端，发现了前代勇者留下的日记，日记记载着魔王的真名。'.repeat(12);
    const frags = pq.splitFragments(text, 560);
    assert.ok(frags.length >= 2, `应切成多片，实际 ${frags.length}`);
    // 每片不超过上限
    for (const f of frags) assert.ok([...f.text].length <= 560, `切片超限: ${[...f.text].length}`);
    // 拼接还原无损
    assert.strictEqual(frags.map(f => f.text).join(''), text, '切片拼接应无损还原原文');
    // 边界应落在换行或句号处（检查每片结尾不是半个词）
    const midFrag = frags[0].text;
    assert.ok(/[\n。！？!?；;]$|[^，、]$/u.test(midFrag), '切片结尾应在合理边界');
    // 索引连续
    assert.strictEqual(frags[0].index, 1);
    assert.strictEqual(frags[1].index, 2);
});

// ── 2. 预算内全量注入 ──
test('=== 2. 预算内全量注入 ===', () => {
    const { PrequelSystem } = extractClasses();
    const pq = new PrequelSystem();
    pq.importPrequel('主角林远出身北境小城，三年前全家毁于一场大火，从此独自谋生。\n\n他随身带着半块玉佩，是母亲留下的唯一遗物。玉佩内侧刻着一个「渊」字，来历不明。');
    const out = pq.buildInjection(
        { text: '玉佩的来历', branches: [{ key: 'latestUser', text: '玉佩的来历', weight: 0.65 }] },
        { baseChars: 3000, tokenBase: 900, enabled: true }
    );
    assert.ok(out.includes('【用户导入的过去经历资料】'), '注入头存在');
    assert.ok(out.includes('仅用于理解前情'), '指令行存在');
    assert.ok(out.includes('【前情片段 1】'), '片段标记存在');
    assert.ok(out.includes('半块玉佩'), '内容完整注入（预算内全量）');
});

// ── 3. 超预算分支归一化选段 ──
test('=== 3. 超预算时按当前对话相关性选段 ===', () => {
    const { PrequelSystem } = extractClasses();
    const pq = new PrequelSystem();
    const segA = '魔物退潮期：王国历402年，北境出现持续半年的魔物退潮，边境村落一夜之间人去楼空，仅剩焦土与断壁。'.repeat(30);
    const segB = '王室血案：国王在祭典之夜暴毙，王后与首相失踪，三王子被软禁，边境军情处收到匿名密信。'.repeat(30);
    const segC = '商会崛起：自由港的香料商会垄断南海航线，压价倾销导致小商户纷纷破产，码头罢工持续月余。'.repeat(30);
    pq.importPrequel([segA, segB, segC].join('\n\n'));
    // 预算只够 1-2 片
    const out = pq.buildInjection(
        {
            text: '匿名密信是谁送出的',
            branches: [{ key: 'latestUser', text: '匿名密信 王室 血案 边境军情处', weight: 0.65 }]
        },
        { baseChars: 900, tokenBase: 400, enabled: true }
    );
    assert.ok(out, '应有注入');
    assert.ok(out.includes('【前情片段'), '片段标记');
    assert.ok(out.includes('密信') || out.includes('血案'), '应选中王室血案相关片段，实际: ' + out.slice(0, 200));
    assert.ok(!out.includes('香料商会'), '不应注入不相关的商会片段');
    // 预算约束
    const charBudget = Math.floor(Math.max(600, 900) * 0.3);
    const tokenBudget = Math.min(1200, Math.floor(Math.max(200, 400) * 0.3));
    assert.ok(out.length <= Math.min(charBudget, tokenBudget * 4), `超预算: ${out.length} > ${Math.min(charBudget, tokenBudget * 4)}`);
});

// ── 4. 无命中尾部兜底 ──
test('=== 4. 无命中时兜底注入尾部两段（fallbackToTail） ===', () => {
    const { PrequelSystem } = extractClasses();
    const pq = new PrequelSystem();
    const seg1 = '旧档案甲：山川河流地形志，东有沧海，西有流沙，北境多雪。'.repeat(40);
    const seg2 = '旧档案乙：历年税赋账目，麦三千石，绢八百匹，盐铁各五百斤。'.repeat(40);
    const seg3 = '旧档案丙：最新情报，公主已于上月初八离开王都，去向不明，护卫仅三人。'.repeat(40);
    pq.importPrequel([seg1, seg2, seg3].join('\n\n'));
    // 查询用完全不相干的词（与片段无 BM25 重叠）
    const out = pq.buildInjection(
        { text: '量子纠缠实验报告', branches: [{ key: 'latestUser', text: '量子纠缠实验超导粒子对撞', weight: 0.65 }] },
        { baseChars: 900, tokenBase: 400, enabled: true }
    );
    assert.ok(out, '无命中也应有兜底注入');
    assert.ok(out.includes('公主已于上月初八离开王都'), '兜底应取尾部（最新状态）片段');
});

// ── 5. 导入/导出/清除往返 ──
test('=== 5. importPrequel/export/import 往返 + 截断保护 ===', () => {
    const { PrequelSystem } = extractClasses();
    const pq = new PrequelSystem();
    const r = pq.importPrequel('前情文本内容。\r\n第二行。');
    assert.ok(r.ok, '导入成功');
    assert.strictEqual(pq.text, '前情文本内容。\n第二行。', 'CRLF 归一化');
    const snap = pq.export();
    const pq2 = new PrequelSystem();
    pq2.import(snap);
    assert.strictEqual(pq2.text, pq.text, '导出导入往返一致');
    assert.strictEqual(pq2.importedAt, pq.importedAt, 'importedAt 保持');
    // 空导入
    assert.strictEqual(pq.importPrequel('   ').ok, false, '空白导入拒绝');
    pq.clearPrequel();
    assert.strictEqual(pq.text, '', '清除');
    // 超长截断
    const big = new PrequelSystem();
    const rb = big.importPrequel('甲'.repeat(500000));
    assert.ok(rb.truncated && rb.chars <= big.MAX_SOURCE_CHARS, '超长截断保护');
});

// ── 6. 接线静态检查 ──
test('=== 6. 生成路径/持久化/导入/UI 接线静态检查 ===', () => {
    // 生成路径：inj2 追加前情
    assert.ok(src.includes('const prequelInj = this.buildPrequelInjection(query)'), 'recallMemory 生成路径接线');
    assert.ok(src.includes("if (prequelInj) inj2 = inj2 ? (inj2 + '\\n' + prequelInj) : prequelInj;"), 'inj2 合并前情');
    // 持久化
    assert.ok(src.includes('prequel: this.prequel ? this.prequel.export() : { text: \'\' }'), 'collectExport 持久化');
    assert.ok(src.includes('if (data.prequel && engine.prequel) engine.prequel.import(data.prequel)'), 'storage.load 导入');
    // 助手方法读取配置
    assert.ok(src.includes('enabled: this.config.config.prequelEnabled !== false'), 'prequelEnabled 门控');
    assert.ok(src.includes('baseChars: Number(this.config.config.injectionBudget) || 3000'), 'injectionBudget 联动');
    // UI 接线
    const ui = fs.readFileSync(path.join(__dirname, '../settings-ui.js'), 'utf-8');
    assert.ok(ui.includes("data-view=\"prequel\""), 'UI 状态卡片');
    assert.ok(ui.includes("viewType === 'prequel'"), 'UI prequel 视图');
    assert.ok(ui.includes("ls-pq-save"), 'UI 保存按钮绑定');
    assert.ok(ui.includes("ck('prequelEnabled'"), 'UI 设置开关');
    assert.ok(ui.match(/engine\.prequel\.import\(data\.prequel\)/g)?.length >= 2, 'UI 两处导入路径');
    // manifest 版本
    const mani = JSON.parse(fs.readFileSync(path.join(__dirname, '../manifest.json'), 'utf-8'));
    assert.strictEqual(mani.version, '3.90.0', 'manifest 版本同步');
});