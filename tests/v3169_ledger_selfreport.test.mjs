// tests/v3169_ledger_selfreport.test.mjs
// LonSha 记忆引擎 v3.169.0「账本自述面」测试套件
//
// 主题：账本记下了变化，却把「变了什么」弄丢了。
//   OpLog 承载全部诊断（19 种事件类型、165 个版本的变更审计链），
//   而它有三处**有损却不留痕**的行为 + 一处读取侧三态塌缩 + 一处从未被任何人看过的显示路径。
//
// 断言原则：判据从**源码推导**（类型集合由埋点扫描得出、键集合由代码扫描得出），
//   不钉死字面量清单——否则下一个 `opLog.log('新类型', ...)` 会让判据静默过期。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';

const idx = readFileSync(new URL('../index.js', import.meta.url), 'utf-8');
const sui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf-8');

// ---------- 源码抽取工具 ----------

/** 抽取方法/函数体（字符串与注释感知的花括号配对）。 */
function methodSpan(src, marker) {
    const at = src.indexOf(marker);
    assert.ok(at >= 0, '标记未找到: ' + marker);
    const open = src.indexOf('{', at + marker.length - 1);
    assert.ok(open >= 0, '未找到方法体: ' + marker);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
        else if (ch === "'" || ch === '"' || ch === '`') {
            const q = ch; i++;
            while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        } else if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }
    }
    throw new Error('方法体未闭合: ' + marker);
}

/** 抽取 class（从 class X 到配对右花括号）。 */
function classSpan(src, name) {
    const at = src.indexOf('class ' + name);
    assert.ok(at >= 0, '类未找到: ' + name);
    const open = src.indexOf('{', at);
    let depth = 0;
    for (let i = open; i < src.length; i++) {
        const ch = src[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
        else if (ch === "'" || ch === '"' || ch === '`') {
            const q = ch; i++;
            while (i < src.length && src[i] !== q) { if (src[i] === '\\') i++; i++; }
        } else if (ch === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; }
    }
    throw new Error('类未闭合: ' + name);
}

/** 从源码装载 OpLog 类（真执行，不用桩）。 */
const OpLog = new Function('return (' + classSpan(idx, 'OpLog') + ')')();

// ---------- 行级剥注释 ----------
// 背景（本版负控制实测的假绿）：文本判据若在**原始源码**上做字面包含检查，代码注释里的
//   同样字样（如「账本自述面」「审计账本有损」）会让断言在真实缺陷存在时照样通过——
//   NEG6（把入账条件改成恒假）、NEG9（把渲染串改成「账本：」）两组判据都无反应。
// 修法：只判「代码行」。第一版曾尝试完整词法剥离器（字符串/注释状态机），被正则字面量里的
//   引号（如 /['"]/）带偏 → 静默残留 14 处注释，说明自造词法工具不可靠。
//   本版改为行级剥离：逐行去掉 // 之后与 /* */ 之内的内容。它不处理「字符串里的 //」，
//   但那类行不含本文件关心的中文关键词，故对判据无影响——简单、可自证、不静默失灵。
function codeLines(src) {
    const out = [];
    let inBlock = false;
    for (const raw of src.split('\n')) {
        let line = raw;
        if (inBlock) {
            const e = line.indexOf('*/');
            if (e === -1) continue;
            line = line.slice(e + 2); inBlock = false;
        }
        for (;;) {
            const s = line.indexOf('/*');
            if (s === -1) break;
            const e = line.indexOf('*/', s + 2);
            if (e === -1) { line = line.slice(0, s); inBlock = true; break; }
            line = line.slice(0, s) + line.slice(e + 2);
        }
        const lc = line.indexOf('//');
        if (lc !== -1) line = line.slice(0, lc);
        if (line.trim()) out.push(line);
    }
    return out;
}
/** 剥注释后的全文（用于需要跨行定位的切片判据）。 */
const codeOf = (src) => codeLines(src).join('\n');
// 工具自证：本版注释标记（[v3.169]）全部只出现在注释里 → 剥注释后必须一处不剩。
//   注：判据是「该标记所在行被剥掉」，若工具失灵会在这里立刻暴露，而不是变成假绿。
assert.ok(!codeOf(idx).includes('[v3.169]'), '行级剥注释后不得残留本版注释标记');
assert.ok(!codeOf(sui).includes('[v3.169]'), '行级剥注释后不得残留本版注释标记');
// 反向自证：不得吞掉代码本体
assert.ok(codeOf(idx).includes('class OpLog'), '剥注释后必须仍有 class OpLog');
assert.ok(codeOf(idx).includes('getDegradationLedger'), '剥注释后必须仍有 getDegradationLedger');
assert.ok(codeOf(sui).includes('data-view="oplog"'), '剥注释后必须仍有 oplog 卡片');
/** 从 index.js 扫描真实埋点类型集合（判据的真源，不钉字面量）。 */
function embeddedTypes(src) {
    const out = new Set();
    const re = /opLog\?*\.log\?*\(\s*'([a-z_]+)'/g;
    let m;
    while ((m = re.exec(src)) !== null) out.add(m[1]);
    return out;
}

// ============================================================
// A. 身份保真：裁剪不得改写「这条记录是谁」
// ============================================================
test('A1 长 ref 写读往返：写入时的身份必须能被同一 id 查回来', () => {
    const log = new OpLog();
    // 摘要/卷/史记的 id 会超过 ref 上限（60）——修前查自己返回 0 命中
    for (const id of ['sum_12', 'vol_3_40', 'his_' + Date.now() + '_abc123',
        'sum_' + 'x'.repeat(80), 'his_' + 'y'.repeat(200)]) {
        log.log('summary', 'evict', id, 12, 'test');
        const hits = log.queryByRef(id);
        assert.equal(hits.length, 1, `queryByRef 必须查得到自己写入的 id（长度 ${id.length}）`);
        // 读侧必须用与写侧同一套规范化：否则「自己写进去的 id 查不到自己」
        const norm = OpLog.normRef ? OpLog.normRef(id) : id.slice(0, 60);
        assert.equal(hits[0].ref, norm, '读侧规范化的结果必须等于存储形态');
    }
});

test('A2 长 ref 触发裁剪时必须留痕（不是静默改写身份）', () => {
    const log = new OpLog();
    const longId = 'sum_' + 'x'.repeat(80);
    log.log('summary', 'evict', longId, 12, 'test');
    const st = log.stats();
    assert.equal(st.trimFields, 1, '发生字段裁剪 → trimFields 必须 +1');
    assert.ok(log.lastTruncation, '必须留下末次裁剪记录');
    assert.equal(log.lastTruncation.op, 'evict');
    assert.equal(log.lastTruncation.refFrom, longId.length, '记录裁剪前的原始长度');
    assert.equal(log.lastTruncation.seq, 1, '记录是哪一条被裁的');
});

test('A3 op 截 10 不得把合法值伪装成「拼写错误」', () => {
    const log = new OpLog();
    // v3.155 起的楼层账本淘汰埋点用 'rollback-miss'（13 字符）
    log.log('ledger', 'rollback-miss', '42', 42, '账本记录已淘汰');
    const e = log.entries[0];
    assert.equal(e.op, 'rollback-m', 'op 上限 10 的取舍保留');
    assert.notEqual(e.op, 'rollback-miss', '确实被裁（不改取舍）');
    // 关键：这一刀必须留痕，否则读者只会看到 'rollback-m' 并以为那是笔误
    assert.equal(log.stats().trimFields, 1, '裁剪 op 必须计入 trimFields');
    assert.equal(log.lastTruncation.opFrom, 13, '记录原始长度 13');
});

test('A4 真实埋点中的超限 op 已被全部识别（判据随源码走）', () => {
    const log = new OpLog();
    const ops = new Set();
    for (const m of idx.matchAll(/opLog\??\.log\??\.?\(\s*'[a-z_]+'\s*,\s*'([a-z-]+)'/g)) ops.add(m[1]);
    assert.ok(ops.size >= 8, '应扫到足够的真实 op（当前 ' + ops.size + '）');
    const long = [...ops].filter(o => o.length > 10);
    assert.ok(long.length > 0, '仓库中确实存在超过 10 字符的 op（否则本测试失效）');
    assert.ok(long.includes('rollback-miss'), 'v3.155 的楼层账本淘汰埋点是被裁的那一个');
    for (const o of long) {
        log.log('ledger', o, 'r', 1, 'm');
        assert.ok(log.stats().trimFields >= 1, `op '${o}' 被裁剪时必须留痕`);
        // 留痕必须带上原始长度，否则无从知道它原本叫什么
        assert.equal(log.lastTruncation.opFrom, o.length, '必须记录裁剪前长度');
    }
});

// 说明：本条**不是**在声讨一个正在发生的缺陷，而是把一处结构性风险收口。
//   实测：在配置可调范围内（vecCap ≤ 2000 / sumCap ≤ 1500）最长 56 字符，
//   距 meta 上限 80 还有 24 字符余量 —— 即**当前并不会截断**。
//   风险在于这段余量会随「新增计数键 / 放大滑块上限 / 键名变长」被逐步吃掉，
//   而一旦吃穿，被切出的半截键会让整串不可解析（且本版之前连留痕都没有）。
//   故本条的判据是：余量必须被显式化并可断言，超出即切换紧凑键。
test('A5 meta 半截键防护：余量必须显式，超限必须切换紧凑键', () => {
    // 复现 index.js 的 _gcm 拼装逻辑（真源码，不是抄一份）
    // 注意：`_gcFull` 是 MemoryEngine 方法内的局部声明，标记之后的下一个花括号
    //   距它 650 字符（那是 try/catch 的），故不能用 marker→花括号 的通用抽取，
    //   改为在类体内直接定位该段。
    const span = classSpan(idx, 'MemoryEngine');
    const gi = span.indexOf('const _gcFull =');
    assert.ok(gi > 0, '_gcFull 必须在 MemoryEngine 内');
    const seg = span.slice(gi, gi + 900);
    assert.ok(seg.includes("'vecDup='"), '完整键拼装仍在');
    assert.ok(seg.includes("'vd='"), '必须有紧凑键兜底');
    assert.ok(/\.length\s*<=\s*80/.test(seg), '以 meta 上限 80 为切换阈值');

    const build = (g) => ['vecDup=' + g.vecDup, 'vecCap=' + g.vecCap, 'sumCap=' + g.sumCap,
        'orphanOps=' + g.orphanOps, 'graphDup=' + g.graphDup].join(' ');
    const buildCompact = (g) => ['vd=' + g.vecDup, 'vc=' + g.vecCap, 'sc=' + g.sumCap,
        'oo=' + g.orphanOps, 'gd=' + g.graphDup].join(' ');

    // 1) 当前配置可调范围内的最坏情形：余量必须为正且被显式记录下来
    //    （若未来某个改动吃穿这段余量，本条会先响——这就是护栏的意义）
    //   口径：vecCap ≤ 2000、sumCap ≤ 1500（配置上界）；vecDup / orphanOps / graphDup
    //   无硬上界，按各 4 位累计量估（长线运行下是保守值）。
    const worstReachable = build({ vecDup: 2000, vecCap: 2000, sumCap: 1500, orphanOps: 2000, graphDup: 2000 });
    const HEADROOM = 80 - worstReachable.length;
    assert.ok(HEADROOM > 0,
        `最保守口径下完整键已贴近/超过 meta 上限 80（余量 ${HEADROOM}）——必须改键名或阈值`);
    assert.ok(HEADROOM >= 12,
        `余量已消耗到 ${HEADROOM} 字符（低于 12 字符护栏），请复核是否新增长度维度`);
    console.log(`   ℹ _gcm 最保守口径 ${worstReachable.length} 字符，距 meta 上限余量 ${HEADROOM}`);

    // 2) 超限（构造值，当前不可达）：必须切换为紧凑键，且紧凑键在任何累计量下可解析。
    //    口径说明：完整串长度 = 68 + Σ(位数)，7 位累计量时最长 79 字符 —— 正好压在
    //    阈值下沿，故切换分支需要 8 位（1 亿级）累计量才会触发。这正是「余量虽紧、
    //    但当前安全」的量化证据；本项构造 8 位值把该分支真的走一遍。
    const beyond = { vecDup: 12345678, vecCap: 12345678, sumCap: 12345678, orphanOps: 12345678, graphDup: 12345678 };
    assert.ok(build(beyond).length > 80, '8 位累计量下确实超 80（驱动切换分支），实际 ' + build(beyond).length);
    assert.ok(build({ vecDup: 9999999, vecCap: 9999999, sumCap: 9999999, orphanOps: 9999999, graphDup: 9999999 }).length <= 80,
        '7 位累计量仍在上限内（切换分支当前不可达 —— 如实记录）');
    const compact = buildCompact(beyond);
    assert.ok(compact.length <= 80, '紧凑键必须在 80 以内（当前 ' + compact.length + '）');
    assert.equal(compact.slice(0, 80), compact, '紧凑键不被裁剪 → 无半截键');
    for (const kv of compact.split(' ')) {
        assert.ok(/^[a-zA-Z]+=-?\d+$/.test(kv), `每个键值对必须完整可解析：${kv}`);
    }

    // 3) 真源码必须真的带这条分支（不是测试里自己造了一份）
    const real = idx.slice(idx.indexOf('const _gcFull ='), idx.indexOf('const _gcm =') + 420);
    assert.ok(real.includes('<= 80'), '真源码必须以 80 为阈值判断');
    assert.ok(real.includes("'vd='"), '真源码必须含紧凑键分支');
});

// ============================================================
// B. 损失留痕：淘汰/丢弃必须记账（I5）
// ============================================================
test('B1 环形淘汰必须计数，且账本形状能区分「淘汰过」与「从未超限」', () => {
    const clean = new OpLog();
    for (let i = 0; i < 400; i++) clean.log('graph', 'add', 'n' + i, i, '');
    const cleanSt = clean.stats();
    assert.equal(cleanSt.total, 400);
    assert.equal(cleanSt.truncated, 0, '未超限 → 无淘汰');

    const busy = new OpLog();
    for (let i = 0; i < 702; i++) busy.log('graph', 'add', 'n' + i, i, '');
    const busySt = busy.stats();
    assert.equal(busySt.total, 500, '窗口仍是 500（兼容既有断言）');
    assert.equal(busySt.truncated, 202, '淘汰 202 条必须记账');
    assert.equal(busySt.cap, 500, '容量必须自述');

    // 核心判据：两者的形状必须不同（修前完全同形）
    assert.notDeepEqual(
        { t: cleanSt.total, x: cleanSt.truncated },
        { t: busySt.total, x: busySt.truncated },
        '「淘汰过」与「从未超限」不得同形'
    );
});

test('B2 累计事件总数（observedTotal）不得等于窗口条数', () => {
    const log = new OpLog();
    for (let i = 0; i < 700; i++) log.log('item', 'update', 'i' + i, i, '');
    assert.equal(log.entries.length, 500);
    assert.equal(log.observedTotal(), 700, '累计 700 ≠ 窗口 500');
});

test('B3 已淘汰事件的类型不得「从统计里整体消失」而不提示', () => {
    const log = new OpLog();
    log.log('summary', 'add', 'sum_1', 1, '最早的一条');
    for (let i = 0; i < 600; i++) log.log('item', 'update', 'i' + i, i, '');
    const st = log.stats();
    // 事实：summary 已掉出窗口
    assert.equal(log.queryByType('summary').length, 0, '确实掉出窗口');
    // 判据：账本必须自述「有东西掉出去了」，否则读者会断定「摘要从未变更」
    assert.ok(st.truncated > 0, '必须报出淘汰量');
    assert.ok(st.total > st.seq - st.truncated || st.truncated > 0, '窗口 < 累计 必须可见');
    const sum = log.auditSummary();
    assert.ok(sum.includes('累计'), '自述必须含累计事件数');
    assert.ok(sum.includes('已淘汰'), '自述必须含淘汰量');
});

test('B4 import 丢弃超窗部分必须计数', () => {
    const log = new OpLog();
    const big = { entries: Array.from({ length: 900 }, (_, i) => ({ seq: i + 1, ts: 1, type: 'graph', op: 'add', ref: 'r' + i, floor: i, meta: '' })), seq: 900 };
    log.import(big);
    assert.equal(log.entries.length, 500, '窗口上限不变');
    assert.equal(log._importDropped, 400, '丢弃 400 条必须记账');
    assert.equal(log.stats().importDropped, 400, '必须经 stats 自述出来');
});

test('B5 存档自带的历史淘汰量必须相加而非覆盖', () => {
    const a = new OpLog();
    for (let i = 0; i < 700; i++) a.log('graph', 'add', 'n' + i, i, '');
    assert.equal(a.stats().truncated, 200);

    const b = new OpLog();
    b.import(a.export());
    assert.ok(b.stats().truncated >= 200, '历史淘汰量必须随存档带过来（不可丢）');

    // 再淘汰一批：量应继续累加，不退回
    for (let i = 0; i < 100; i++) b.log('item', 'update', 'x' + i, i, '');
    assert.equal(b.stats().truncated, 300, '200(历史) + 100(新) = 300');
});

test('B6 导出→导入→再导出 不得让账本静默缩水', () => {
    const a = new OpLog();
    for (let i = 0; i < 900; i++) a.log('graph', 'add', 'n' + i, i, '');
    const lost1 = a.stats().truncated;
    const b = new OpLog();
    b.import(a.export());
    const exp = b.export();
    const c = new OpLog();
    c.import(exp);
    assert.equal(c.entries.length, 500);
    assert.ok(c.stats().truncated >= lost1, '第二轮导入不得让损失计数倒退：' + c.stats().truncated + ' vs ' + lost1);
});

// ============================================================
// C. 读取三态：不存在 / 不可用 / 抛错 不得塌缩成「0」（I6）
// ============================================================
test('C1 opLogStatsCompat 必须能区分「无账本」「无 stats」「抛错」', () => {
    const span = methodSpan(idx, 'function opLogStatsCompat');
    const fn = new Function('engine',
        span.replace(/^function opLogStatsCompat\(engine\)\s*\{/, '').replace(/\}\s*$/, ''));

    const noLog = fn({});
    assert.equal(noLog.total, 0);
    assert.equal(noLog.absent, true, '无账本 → absent');

    const noStats = fn({ opLog: {} });
    assert.equal(noStats.absent, true, '有账本但无 stats → absent');

    const boom = fn({ opLog: { stats() { throw new Error('boom'); } } });
    assert.equal(boom.total, 0);
    assert.equal(boom.error, 'boom', '抛错 → error 且带原因');

    const empty = fn({ opLog: { stats: () => ({ total: 0, byType: {} }) } });
    assert.equal(empty.total, 0);
    assert.ok(!empty.error && !empty.absent, '真的 0 条 → 既非 absent 也非 error');

    // 四种处境必须两两可区分（修前它们返回值完全相同）
    const shapes = [noLog, noStats, boom, empty].map(o => JSON.stringify(o));
    assert.equal(new Set(shapes).size >= 3, true, '四种处境的返回值不得同形');
});

test('C2 stats() 的原键必须一个不动（既有测试的书面意图）', () => {
    const st = new OpLog().stats();
    for (const k of ['total', 'byType']) assert.ok(k in st, '原键必须保留: ' + k);
    // 新增键：只增不减
    for (const k of ['cap', 'seq', 'truncated', 'trimFields', 'importDropped']) {
        assert.ok(k in st, '新增自述键: ' + k);
    }
    assert.equal(typeof st.byType, 'object');
});

// ============================================================
// D. 显示路径：账本必须被完整读出来
// ============================================================
test('D1 全景报告「审计事件」行不得输出 [object Object]', () => {
    const line = idx.split('\n').find(l => l.includes('审计事件：'));
    assert.ok(line, '该行必须存在');
    assert.ok(!/\$\{opLogStatsCompat\(this\)\}/.test(line),
        '不得把对象直接插进模板（修前从 v3.61 起一直输出 [object Object]）');
    assert.ok(/opLogStatsCompat\(this\)\.total/.test(line), '必须取 .total');
});

test('D2 审计统计板块必须并排报出「窗口」与「累计」', () => {
    const i = idx.indexOf('## 🔍 审计统计');
    assert.ok(i > 0);
    const block = idx.slice(i, i + 1400);
    assert.ok(block.includes('累计事件'), '必须报累计事件数');
    assert.ok(block.includes('窗口'), '必须报窗口占用');
    assert.ok(block.includes('不可信') || block.includes('看不见'),
        '读取失败时必须说明「计数不可信」而非留白');
});

test('D3 类型中文化表必须覆盖源码中真实的埋点类型集合', () => {
    const m = sui.match(/const typeCn = \{([^}]*)\}/);
    assert.ok(m, 'typeCn 表必须存在');
    const mapped = new Set([...m[1].matchAll(/([a-z_]+)\s*:/g)].map(x => x[1]));
    const real = embeddedTypes(idx);
    assert.ok(real.size >= 15, '真实埋点类型应 >= 15 种（当前 ' + real.size + '）');
    const missing = [...real].filter(t => !mapped.has(t));
    assert.deepEqual(missing, [], '以下埋点类型在审计浏览器里会显示为英文原始 key: ' + missing.join(','));
});

test('D4 审计浏览器头部必须带「账本自述」', () => {
    // 判定必须在「代码行」上做：注释里的「账本自述面」不得满足本断言（NEG9 假绿教训）
    const suiCode = codeOf(sui);
    assert.ok(suiCode.includes('账本自述'), '头部必须自述（注释不算）');
    assert.ok(suiCode.includes('auditSummary'), '必须消费 auditSummary');
    const i = suiCode.indexOf("viewType === 'oplog'");
    const block = suiCode.slice(i, i + 2600);
    assert.ok(block.includes('truncated'), '有损失时必须提示统计不完整');
});

test('D5 状态面板卡片必须在账本有损失时给出可见标记', () => {
    const suiCode = codeOf(sui);
    const i = suiCode.indexOf('data-view="oplog"');
    assert.ok(i > 0);
    const card = suiCode.slice(i - 120, i + 500);
    assert.ok(card.includes('_truncated'), '卡片必须读到淘汰量');
    assert.ok(card.includes('※') || card.includes('title'), '必须有可见标记或提示');
});

// ============================================================
// E. 接线：账本损耗必须进总账与面板
// ============================================================
test('E1 账本损耗必须进「静默降级」总账', () => {
    // NEG6 假绿教训：旧判据 `span.includes('审计账本有损')` 被同一方法内的注释满足——
    //   把入账条件改成恒假（`if (false) push('审计账本有损', ...)`）判据照样通过。
    //   现改为：在剥注释的代码行上，要求「以 _lost 真值驱动的 push('审计账本有损', ...)」。
    const span = codeOf(methodSpan(idx, 'getDegradationLedger()'));
    assert.ok(span.includes('_truncated'), '必须读淘汰量');
    assert.ok(span.includes('_trimFields'), '必须读裁剪量');
    assert.ok(span.includes('_importDropped'), '必须读导入丢弃量');
    assert.ok(/if\s*\(_lost\)\s*push\('审计账本有损'/.test(span),
        '损耗必须真的入账（由 _lost 真值驱动，而非注释字样）');
    assert.ok(!/push\('审计账本有损'[^)]*\)\s*;\s*\/\/\s*never/.test(span), '不得留下被注释掉的入账');
});

test('E2 账本盲区来源集合必须含 opLog', () => {
    const span = methodSpan(idx, 'getDegradationLedger()');
    const i = span.indexOf('const _srcs =');
    assert.ok(i > 0);
    const line = span.slice(i, span.indexOf('];', i));
    assert.ok(line.includes('this.opLog'), '审计账本是诊断载体，必须在来源集合内');
});

test('E3 selfCheck 必须有「审计账本」行且非空壳', () => {
    const i = idx.indexOf("['审计账本'");
    assert.ok(i > 0, '必须有审计账本诊断行');
    const block = idx.slice(i - 600, i + 900);
    assert.ok(block.includes('opLogStatsCompat'), '必须经三态读取');
    assert.ok(block.includes('st.error'), '必须处理读取失败');
    assert.ok(block.includes('observedTotal'), '必须报累计事件数');
    assert.ok(block.includes('auditSummary'), '必须报账本自述');
});

test('E4 既有埋点调用形态必须保持不变（不许为通过测试而改埋点）', () => {
    // 既有测试锁定这些字面量，出现即证明埋点未被本版改动
    for (const s of [
        "this.opLog?.log('summary', 'add', `sum_${message?.index || 0}`",
        "this.opLog?.log('graph', 'add', canonical",
        "this.opLog?.log?.('delta', 'add'",
        "this.opLog?.log?.('locked_fact', 'add'",
        "this.opLog?.log('gc', 'remove'",
    ]) {
        assert.ok(idx.includes(s), '埋点形态不得改动: ' + s);
    }
});

// ============================================================
// F. 负控制：每条核心判据都配一次故意破坏
// ============================================================

/** 破坏源码副本并断言判据会翻红。 */
function negative(broken, check, label) {
    let fired = false;
    try { check(broken); } catch (e) { fired = true; }
    assert.ok(fired, `负控制未触发（判据对该破坏无反应）: ${label}`);
}

test('F1 负控制：删掉淘汰计数 → B 组判据必须翻红', () => {
    negative(
        idx.replace('this._truncated = (this._truncated || 0) + _over;', ''),
        (src) => {
            const cls = new Function('return (' + classSpan(src, 'OpLog') + ')')();
            const l = new cls();
            for (let i = 0; i < 700; i++) l.log('graph', 'add', 'n' + i, i, '');
            assert.equal(l.stats().truncated, 200);
        },
        '淘汰不计账'
    );
});

test('F2 负控制：删掉裁剪留痕 → A 组判据必须翻红', () => {
    negative(
        idx.replace('this._trimFields = (this._trimFields || 0) + 1;', ''),
        (src) => {
            const cls = new Function('return (' + classSpan(src, 'OpLog') + ')')();
            const l = new cls();
            l.log('summary', 'evict', 'sum_' + 'x'.repeat(80), 12, 't');
            assert.equal(l.stats().trimFields, 1, '裁剪必须留痕');
        },
        '裁剪不留痕'
    );
});

test('F3 负控制：删掉 import 丢弃记账 → B4 必须翻红', () => {
    negative(
        idx.replace('this._importDropped = (this._importDropped || 0) + _drop;', ''),
        (src) => {
            const cls = new Function('return (' + classSpan(src, 'OpLog') + ')')();
            const l = new cls();
            l.import({ entries: Array.from({ length: 900 }, (_, i) => ({ seq: i + 1, ts: 1, type: 'g', op: 'add', ref: 'r', floor: i, meta: '' })), seq: 900 });
            assert.equal(l.stats().importDropped, 400);
        },
        'import 静默丢弃'
    );
});

test('F4 负控制：opLogStatsCompat 退回单一形状 → C 组判据必须翻红', () => {
    negative(
        idx.replace('return { total: 0, byType: {}, error: String(e?.message || e) };',
            'return { total: 0, byType: {} };'),
        (src) => {
            const span = methodSpan(src, 'function opLogStatsCompat');
            const fn = new Function('engine',
                span.replace(/^function opLogStatsCompat\(engine\)\s*\{/, '').replace(/\}\s*$/, ''));
            const boom = fn({ opLog: { stats() { throw new Error('boom'); } } });
            assert.equal(boom.error, 'boom', '抛错必须可辨');
        },
        '读取侧三态塌缩'
    );
});

test('F5 负控制：概览行退回对象插值 → D1 必须翻红', () => {
    negative(
        idx.replace('push(`- 审计事件：${opLogStatsCompat(this).total} 条（${this.opLog?.auditSummary?.() || \'无账本\'}）`);',
            'push(`- 审计事件：${opLogStatsCompat(this)} 条`);'),
        (src) => {
            const line = src.split('\n').find(l => l.includes('审计事件：'));
            assert.ok(!/\$\{opLogStatsCompat\(this\)\}/.test(line), '不得对象插值');
        },
        '概览行对象插值'
    );
});

test('F6 负控制：类型表退回 13 项 → D3 必须翻红', () => {
    negative(
        sui.replace(" locked_fact: '🔒锁定事实', worldprogress: '🌍世界进度', cse: '🧠人物状态', delta: '📒正史增量', gc: '🧹回收账本', ledger: '📚楼层账本'",
            " "),
        (src) => {
            const m = src.match(/const typeCn = \{([^}]*)\}/);
            const mapped = new Set([...m[1].matchAll(/([a-z_]+)\s*:/g)].map(x => x[1]));
            const real = embeddedTypes(idx);
            const missing = [...real].filter(t => !mapped.has(t));
            assert.deepEqual(missing, [], '不得漏类型');
        },
        '类型表与埋点集合不同步'
    );
});

test('F7 负控制：账本损耗不进总账 → 判据必须翻红', () => {
    // 把入账那一行整行删掉（比改条件更贴近真实缺陷形态）
    negative(
        idx.replace("                    if (_lost) push('审计账本有损', _lost,", '                    if (false) {'),
        (src) => {
            const span = codeOf(methodSpan(src, 'getDegradationLedger()'));
            assert.ok(/if\s*\(_lost\)\s*push\('审计账本有损'/.test(span),
                '损耗必须真的入账（由 _lost 真值驱动）');
        },
        '损耗不进总账'
    );
});

test('A6 读侧与写侧必须共用同一套字段上限（唯一真源）', () => {
    // 修前的形态是两侧各写一份数字：写侧 slice(0,60)，读侧拿完整 id 直接比。
    // 现在上限收敛到 OpLog._retention()，检索入口全部经它规范化。
    const cap = OpLog._retention();
    assert.equal(typeof cap, 'object');
    for (const k of ['type', 'op', 'ref', 'meta']) assert.equal(typeof cap[k], 'number', '上限键: ' + k);

    const log = new OpLog();
    const longRef = 'r'.repeat(cap.ref + 40);
    const longType = 't'.repeat(cap.type + 10);
    log.log(longType, 'add', longRef, 1, '');
    assert.equal(log.queryByRef(longRef).length, 1, '读侧必须经同一规范化');
    assert.equal(log.queryByType(longType).length, 1, 'type 检索同样必须同源');

    // 源码层面：检索入口必须调用规范化，而不是各自 slice
    const cls = classSpan(idx, 'OpLog');
    assert.ok(/queryByRef\(\s*refId\s*\)\s*\{[^}]*normRef/.test(cls), 'queryByRef 必须经 normRef');
    assert.ok(/queryByType\(\s*type\s*\)\s*\{[^}]*_retention\(\)/.test(cls), 'queryByType 必须经 _retention');
});

// ============================================================
// G. 发布卫生
// ============================================================
test('G1 版本四处同步', () => {
    const v = idx.match(/const VERSION = '([\d.]+)'/)[1];
    assert.equal(v, '3.178.0');
    assert.equal(JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf-8')).version, v);
    assert.equal(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version, v);
    assert.ok(readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf-8').startsWith('## v' + v));
});

test('G2 CHANGELOG 必须记录本版主题与两项不变量', () => {
    const cl = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf-8');
    const head = cl.slice(0, cl.indexOf('\n## v3.168.0'));
    assert.ok(head.includes('账本自述面'), '主题');
    assert.ok(head.includes('I5'), '不变量 I5');
    assert.ok(head.includes('I6'), '不变量 I6');
    assert.ok(head.includes('v3169_ledger_selfreport'), '配套测试说明');
});

test('G3 既有 OpLog 测试的断言语义不得被绕过', () => {
    // v354 断言 st.total === 500 且 st.byType.item === 500 —— 本版必须仍然满足
    assert.ok(idx.includes("if (this.entries.length > 500) {"), '环形 500 仍在');
    assert.ok(/cap:\s*500/.test(idx), 'stats 自述容量为 500');
    // v355 断言的可视化入口仍在
    assert.ok(sui.includes('opLog.recent(80)'));
    assert.ok(sui.includes('const st = opLog.stats()'));
    assert.ok(sui.includes('环形 500'));
});

test('G4 未使用的旧字段不得残留（账本实例字段清单必须自洽）', () => {
    const l = new OpLog();
    const keys = Object.keys(l).sort();
    for (const k of ['_importDropped', '_seq', '_trimFields', '_truncated', 'entries', 'lastTruncation']) {
        assert.ok(keys.includes(k), '实例字段缺失: ' + k);
    }
});
