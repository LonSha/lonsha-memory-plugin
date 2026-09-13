// tests/v362_locked_facts.test.mjs
// LonSha 记忆引擎 v3.62.0 dsh-nexttavern 记忆方式缝入测试
// 锁定事实（lockedFacts）+ 增量卷摘要 + 楼层溯源 + 矛盾证据链 + 详细保留哲学
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';

const src = readFileSync('/home/user/lonsha-memory-plugin/index.js', 'utf-8');

// 提取 SummarySystem 类（裸括号平衡法，跳过引号干扰风险：类体内无引号陷阱字符串时可靠）
function extractClass(source, startMarker) {
    const start = source.indexOf(startMarker);
    if (start < 0) return null;
    let depth = 0, started = false;
    for (let i = start; i < source.length; i++) {
        const ch = source[i];
        if (ch === '{') { depth++; started = true; }
        else if (ch === '}') { depth--; if (started && depth === 0) return source.slice(start, i + 1); }
    }
    return null;
}

test('=== 1. 静态关键字检查 ===', () => {
    // A1 配置声明
    assert.ok(src.includes('lockedFactsEnabled'), '配置 lockedFactsEnabled');
    assert.ok(src.includes('lockedFactMaxChars'), '配置 lockedFactMaxChars');
    // A2 SummarySystem 方法
    assert.ok(src.includes('addLockedFact'), 'addLockedFact');
    assert.ok(src.includes('removeLockedFact'), 'removeLockedFact');
    assert.ok(src.includes('getLockedFacts'), 'getLockedFacts');
    assert.ok(src.includes('lockedFactsForPrompt'), 'lockedFactsForPrompt');
    // A3 prompt 接入
    assert.ok(src.includes('{{LOCKED_FACTS}}'), 'prompt 占位符');
    // A4 默认 prompt 锁定段
    assert.ok(src.includes('【用户锁定事实】'), '默认 prompt 锁定段');
    assert.ok(src.includes('一字不差'), '逐字保留要求');
    // A5 校验器
    assert.ok(src.includes('_lockedRetryDone'), '校验重试标志');
    assert.ok(src.includes('摘要遗漏锁定事实'), '遗漏警告');
    // B 增量卷摘要
    assert.ok(src.includes('【既有卷摘要基线】'), '增量基线');
    assert.ok(src.includes('不要删除、概括或重新抄写基线中已记录的事件'), '增量不重抄');
    // D 楼层溯源
    assert.ok(src.includes('（第N楼）指针'), '卷摘要指针要求');
    // E 史记详细哲学
    assert.ok(src.includes('宁可详细，不可精简'), '详细保留哲学');
    assert.ok(src.includes('已兑现与未兑现的约定'), '史记伏笔保留');
    // D2 矛盾证据链
    assert.ok(src.includes('"severity"'), 'severity 字段');
    // F 注入流
    assert.ok(src.includes('[用户锁定剧情事实]'), '注入区块标题');
    // G 持久化
    assert.ok(src.includes('lockedFacts: this.summary.getLockedFacts()'), '快照持久化');
    assert.ok(src.includes('lockedFacts: this.lockedFacts || [] }'), 'export 对称');
    assert.ok(src.includes('this.lockedFacts = Array.isArray(data.lockedFacts) ? data.lockedFacts : [];'), 'import 对称');
});

test('=== 2. SummarySystem 类提取与锁定事实方法功能测试 ===', () => {
    const cls = extractClass(src, 'class SummarySystem');
    assert.ok(cls, 'SummarySystem 可提取');
    // 两层调用：Function 返回 class，再 new 实例
    const SummarySystem = new Function('return (' + cls + ')')();
    const s = new SummarySystem();
    // addLockedFact
    const id1 = s.addLockedFact('林一在聚贤庄留下解药', 42);
    assert.ok(id1 && id1.startsWith('lf_'), 'id 前缀 lf_');
    const id2 = s.addLockedFact('沈青梧的玉佩是信物', 43);
    assert.ok(id2 !== id1, 'id 唯一');
    assert.strictEqual(s.getLockedFacts().length, 2, '存储 2 条');
    assert.strictEqual(s.getLockedFacts()[0].floor, 42, 'floor 记录');
    // lockedFactsForPrompt 逐字 + 楼层标注
    const prompt = s.lockedFactsForPrompt();
    assert.ok(prompt.includes('林一在聚贤庄留下解药（第42楼锁定）'), '逐字 + 楼层标注');
    // removeLockedFact
    assert.strictEqual(s.removeLockedFact(id1), true, '删除成功');
    assert.strictEqual(s.removeLockedFact('lf_none'), false, '删除不存在返回 false');
    assert.strictEqual(s.getLockedFacts().length, 1, '剩余 1 条');
    // 空文本防护
    assert.strictEqual(s.addLockedFact('  ', 1), null, '空文本拒绝');
    assert.strictEqual(s.addLockedFact(null, 1), null, 'null 拒绝');
});

test('=== 3. export/import 对称测试 ===', () => {
    const cls = extractClass(src, 'class SummarySystem');
    const SummarySystem = new Function('return (' + cls + ')')();
    // export 带 lockedFacts
    const s1 = new SummarySystem();
    s1.addLockedFact('测试事实A', 10);
    const exported = s1.export();
    assert.ok(Array.isArray(exported.lockedFacts), 'export 含 lockedFacts');
    assert.strictEqual(exported.lockedFacts.length, 1, 'export 1 条');
    // import 对称
    const s2 = new SummarySystem();
    s2.import(exported);
    assert.strictEqual(s2.getLockedFacts().length, 1, 'import 恢复 1 条');
    assert.strictEqual(s2.getLockedFacts()[0].text, '测试事实A', 'text 一致');
    // 旧格式兼容（无 lockedFacts 字段的旧快照）
    const s3 = new SummarySystem();
    s3.import({ summaries: [], volumes: [], historical: [] });
    assert.deepStrictEqual(s3.getLockedFacts(), [], '旧快照兼容为空数组');
    // 数组旧格式
    const s4 = new SummarySystem();
    s4.import([{ text: 'x', floor: 1 }]);
    assert.strictEqual(s4.summaries.length, 1, '数组旧格式 summaries 恢复');
});

test('=== 4. 校验器逻辑单元测试（模拟遗漏检测与重试判定） ===', () => {
    // 模拟 lockedText 结构
    const lockedText = '- 林一在聚贤庄留下解药（第42楼锁定）\n- 沈青梧的玉佩是信物（第43楼锁定）';
    // 复刻校验器的 factItems 解析逻辑
    const factItems = lockedText.split('\n').map(l => l.replace(/^- /, '').replace(/（第\d+楼锁定）$/, '').trim()).filter(Boolean);
    assert.deepStrictEqual(factItems, ['林一在聚贤庄留下解药', '沈青梧的玉佩是信物'], 'factItems 提取正确');
    // 模拟 summary 缺失检测（summaryMiss 未逐字包含任何一条锁定事实 → 遗漏 2 条）
    const summaryMiss = '林一去了聚贤庄，但没提解药。';
    const missing = factItems.filter(f => !summaryMiss.includes(f));
    assert.strictEqual(missing.length, 2, '逐字匹配下 2 条全遗漏（聚贤庄句非逐字）');
    // 模拟 summary 部分保留（聚贤庄句逐字，玉佩句缺失 → 遗漏 1 条）
    const summaryPart = '林一在聚贤庄留下解药。';
    const missingPart = factItems.filter(f => !summaryPart.includes(f));
    assert.strictEqual(missingPart.length, 1, '检测到 1 条遗漏');
    assert.strictEqual(missingPart[0], '沈青梧的玉佩是信物', '遗漏的是玉佩条');
    // 模拟 summary 完整
    const summaryFull = '林一在聚贤庄留下解药。沈青梧的玉佩是信物。';
    assert.strictEqual(factItems.filter(f => !summaryFull.includes(f)).length, 0, '完整 summary 零遗漏');
});

test('=== 5. 增量卷摘要 prompt 结构检查 ===', () => {
    const cls = extractClass(src, 'class SummarySystem');
    assert.ok(cls, 'SummarySystem 提取');
    // maybeFold 存在增量逻辑
    const idx = cls.indexOf('async maybeFold');
    assert.ok(idx > 0, 'maybeFold 存在');
    const maybeFoldSrc = cls.slice(idx, idx + 2500);
    assert.ok(maybeFoldSrc.includes('prevVol'), 'prevVol 基线变量');
    assert.ok(maybeFoldSrc.includes('【既有卷摘要基线】'), '基线段落');
    // 楼层指针注入列表
    assert.ok(maybeFoldSrc.includes("'- [第' + s.floor + '楼] ' + s.text"), '列表带楼层指针');
});

test('=== 6. 注入流锁定区块位置正确（静态锚定区，Prompt Cache A区） ===', () => {
    // 锁定事实注入应在 buildInjection 内且在主角档案之前（静态区靠前，字典序稳定）
    const injIdx = src.indexOf('buildInjection(recalled)');
    const lfIdx = src.indexOf('[用户锁定剧情事实]');
    const protIdx = src.indexOf('protagonistTracking !== false');
    assert.ok(injIdx > 0 && lfIdx > injIdx, '注入块在 buildInjection 内');
    assert.ok(lfIdx < protIdx, '在主角档案（静态锚定区）之前');
});

test('=== 7. 配置默认值与守卫检查 ===', () => {
    assert.ok(src.includes('lockedFactsEnabled: true'), '默认开启');
    assert.ok(src.includes('lockedFactMaxChars: 4000'), '预算 4000');
    // 守卫模式统一（!== false 与 === false 两种均可，但必须存在守卫）
    assert.ok(src.includes('lockedFactsEnabled !== false'), '注入守卫');
    // extractMemoryWithLLM 的锁定文本守卫
    const emIdx = src.indexOf('async extractMemoryWithLLM');
    const emSrc = src.slice(emIdx, emIdx + 2500);
    assert.ok(emSrc.includes('lockedFactsForPrompt'), '提取管线接锁定事实');
    assert.ok(emSrc.includes("{{LOCKED_FACTS}}"), '提取 prompt 占位符');
});
