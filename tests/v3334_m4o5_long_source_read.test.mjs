/* ============================================================
 * tests/v3334_m4o5_long_source_read.test.mjs — v3.334.0 · M4-O5 长资料完整读取与可恢复解析
 *
 * 【本档要证明的是「长资料尾部不丢 + 局部导入有真路径」,不是「函数存在」】
 *   修前缺陷(探针实测,双实锤):
 *     ① 42 万字符资料尾部唯一事实被 parseSource 静默 slice 丢弃,ok:true + items 全进;
 *     ② 200 万字符同样只读前 40 万,且 planApply 对截断资料照常 ok:true 放行。
 *
 *   判据分五面:
 *     A 截断拒读:超限源 ok:false + why=source-truncated + completeness.partial + nextCursor;
 *       planApply 拦截(source-incomplete);完整源不受影响(ok:true + complete)。
 *     B 窗口解析:窗口对齐段边界(\n\n),跨窗段不重复不缺失;
 *       sourceRef 带全文件坐标(fileFrom/fileTo + 行号偏移);完整度独立核算。
 *     C 长流真跑:40 万 + 与 200 万字符两组,首中尾唯一事实存活;
 *       窗口流 3000 章去重后恰 3000(修前行对齐会多出边界半段)。
 *     D 零写与不抛:畸形入参(负 range/超大 range/空文本)退化为可读读数不抛。
 *     E 宿主接线:loreImportParseWindow 出口在位 + 模块缺席同键降级 + 留痕读数。
 *
 * 【负控制一律真源码破坏】锚点恰中 1 次 → 破坏副本上重跑同款真判据 → 必须现形。
 * 【当版锚点】BORN = '3.334.0'。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { breakOnce } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const R = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(R, rel), 'utf8');

const BORN = '3.334.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

function loadIIFE(src, globalName) {
    const ctx = { console, Object, Array, String, Number, Set, Map, JSON, RegExp, Math, isFinite, Infinity, isNaN, Date, Boolean, Promise, Error, TypeError };
    ctx.window = ctx; ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    const api = ctx[globalName];
    if (!api) throw new Error('模块未挂 ' + globalName);
    return api;
}
const LI = loadIIFE(read('lore-import.js'), 'LonShaLoreImport');
const MAX = LI.MAX_SOURCE_CHARS; /* 400000,从模块真源读,不手抄 */

/** 造长文:chapterCount 章,每章「# 第N章」标题行 + 一行正文(标准两行段)。 */
function makeNovel(chapterCount) {
    const chapters = [];
    for (let i = 1; i <= chapterCount; i++) {
        chapters.push('# 第' + i + '章\n前史:第' + i + '章的事件描述,角色A与角色B在第' + i + '回合交锋,关键约定编号' + (100000 + i) + '必须回源。');
    }
    return chapters.join('\n\n');
}

/* ════════ A 截断拒读 ════════ */
test('A1 超限源拒读:ok:false + source-truncated + completeness.partial + nextCursor', () => {
    let body = '# 卷首\n';
    const unit = '前史:普通事件描述。'.repeat(8) + '\n\n';
    while (body.length <= MAX) body += unit;
    const r = LI.parseSource({ text: body, file: 'big.txt' });
    assert.equal(r.ok, false, '截断源不得 ok:true');
    assert.ok(r.why.includes('source-truncated'), 'why 必须具名 source-truncated');
    assert.equal(r.completeness.state, 'partial');
    assert.equal(r.completeness.totalChars, body.length);
    assert.equal(r.completeness.readChars, MAX);
    assert.equal(r.completeness.nextCursor, MAX, '续读游标在截断点');
    assert.equal(r.source.truncated, true);
});

test('A2 planApply 拦截截断源(source-incomplete),不再照常放行', () => {
    let body = '# 卷首\n';
    const unit = '前史:普通事件描述。'.repeat(8) + '\n\n';
    while (body.length <= MAX) body += unit;
    const r = LI.parseSource({ text: body });
    const pv = LI.diffPreview(r, {}, {});
    const plan = LI.planApply(r, pv, {});
    assert.equal(plan.ok, false, '修前缺陷:截断资料 planApply ok:true 放行');
    assert.equal(plan.reason, 'source-incomplete');
    assert.ok(String(plan.why || '').includes('未读完'));
});

test('A3 完整源不受影响(不误伤):ok:true + complete + 无 why 干扰', () => {
    const body = makeNovel(200);
    const r = LI.parseSource({ text: body, file: 'small.txt' });
    assert.equal(r.ok, true);
    assert.equal(r.completeness.state, 'complete');
    assert.equal(r.completeness.truncated, false);
    assert.equal(r.completeness.nextCursor, null);
    assert.equal(r.why.length, 0, '完整源无 why 干扰');
    assert.ok(Array.isArray(r.why));
    const pv = LI.diffPreview(r, {}, {});
    const plan = LI.planApply(r, pv, {});
    assert.equal(plan.ok, true, '完整源仍可正常进导入计划');
});

/* ════════ B 窗口解析 ════════ */
test('B1 窗口对齐段边界:跨窗段不切半、sourceRef 带全文件坐标', () => {
    const body = makeNovel(400); /* ~1.7 万字符 */
    const W = 6000;
    const w1 = LI.parseSourceWindow({ text: body, file: 'n.txt' }, { range: { from: 0, to: W } });
    assert.equal(w1.window.hasNext, true);
    assert.equal(w1.completeness.state, 'partial');
    assert.equal(w1.completeness.totalChars, body.length, '完整度按全文件核算,不是按窗口');
    /* 全文件坐标:第一窗从 0 起,行号不偏移 */
    const first = w1.sections[0].sourceRef;
    assert.equal(first.fileFrom, 0);
    assert.equal(first.lineFrom, 1);
    /* 续窗:游标衔接,行号带偏移 */
    const w2 = LI.parseSourceWindow({ text: body, file: 'n.txt' }, { range: { from: w1.completeness.nextCursor, to: w1.completeness.nextCursor + W } });
    assert.equal(w2.window.from, w1.window.to, '窗口严格衔接不重叠');
    const sec2 = w2.sections[0].sourceRef;
    assert.ok(sec2.lineFrom > 1, '续窗行号按全文件偏移(>1)');
    assert.ok(sec2.fileFrom >= w2.window.from - 1, 'fileFrom 在窗口起点附近');
});

test('B2 3000 章窗口流:textHash 去重恰 3000(修前行对齐多出边界半段)', () => {
    const body = makeNovel(3000);
    const whole = LI.parseSource({ text: body });
    assert.equal(whole.items.length, 3000, '整体解析基线');
    const W = 50000;
    let cursor = 0;
    const byHash = new Map();
    let wins = 0;
    while (cursor !== null && cursor < body.length) {
        const w = LI.parseSourceWindow({ text: body }, { range: { from: cursor, to: cursor + W } });
        wins += 1;
        for (const it of w.items) byHash.set(it.textHash + '#' + it.cls, it);
        cursor = w.completeness.nextCursor;
        if (wins > 200) throw new Error('窗口流疑似死循环');
    }
    assert.equal(byHash.size, 3000, '去重后恰 3000;修前实测 3002(2 条边界半段)');
    /* 每章都在:抽样首中尾 */
    const texts = [...byHash.values()].map((i) => i.text).join('|');
    for (const probe of ['第1章', '第1500章', '第3000章', '关键约定编号103000', '关键约定编号101500', '关键约定编号103000'.replace('103000', '103000')]) {
        const key = probe === '关键约定编号103000'.replace('103000', '103000') ? '关键约定编号103000' : probe;
        assert.ok(texts.includes(key), '存活探针缺失: ' + key);
    }
});

test('B3 尾窗口 completeness 转为 complete(读到尾自动收敛)', () => {
    const body = makeNovel(3000);
    let cursor = 0;
    let last = null;
    let guard = 0;
    while (cursor !== null && cursor < body.length && guard++ < 200) {
        last = LI.parseSourceWindow({ text: body }, { range: { from: cursor, to: cursor + 50000 } });
        cursor = last.completeness.nextCursor;
    }
    assert.equal(last.completeness.state, 'complete', '最后一窗读完全文件');
    assert.equal(last.completeness.nextCursor, null);
});

/* ════════ C 长流真跑(验收原文两组:40 万+ 与 200 万) ════════ */
test('C1 42 万字符(>40 万上限):首中尾唯一事实经窗口流全部存活', () => {
    /* 造体注意:SNIPPET_MAX=80,唯一事实标记必须出现在每段**前 80 字符**内,
     *   否则 clip 后 items[].text 里找不到(首版把标记埋进长段落被 clip 掉,判据自身错)。 */
    const chapters = [];
    for (let i = 1; i <= 800; i++) {
        chapters.push('# 第' + i + '章\n前史:事实F' + i + '。第' + i + '章事件' + '。铺垫'.repeat(20));
    }
    let body = chapters.join('\n\n');
    body = '# 卷首\n人物背景:首标记X1\n\n' + body + '\n\n# 终章\n设定规则:尾标记Z9\n';
    /* 增长到 42 万:在终章前插中段 */
    while (body.length < 420000) {
        body = body.replace('# 终章', '# 增补\n前史:增补段内容。'.repeat(30) + '\n\n# 终章');
    }
    assert.ok(body.length >= 420000, '资料长度 ' + body.length);
    const whole = LI.parseSource({ text: body });
    assert.equal(whole.ok, false, '超限必须拒读');
    assert.ok(whole.why.includes('source-truncated'));
    /* 窗口流读完 */
    let cursor = 0;
    const all = [];
    let guard = 0;
    while (cursor !== null && cursor < body.length && guard++ < 300) {
        const w = LI.parseSourceWindow({ text: body }, { range: { from: cursor, to: cursor + 100000 } });
        all.push(...w.items.map((i) => i.text));
        cursor = w.completeness.nextCursor;
    }
    assert.ok(all.some((t) => t.includes('首标记X1')), '首部事实存活');
    assert.ok(all.some((t) => t.includes('尾标记Z9')), '尾部事实存活(修前被 slice 丢弃)');
    assert.ok(all.some((t) => t.includes('事实F1。')), '第一章事实存活');
    assert.ok(all.some((t) => t.includes('事实F400。')), '中部事实存活');
    assert.ok(all.some((t) => t.includes('事实F800。')), '第八百章事实存活');
});

test('C2 200 万字符:窗口流 20 窗内读完,尾部唯一事实存活,耗时秒级', () => {
    let body = '# 卷首\n人物背景:首部事实@200万起点M1\n\n';
    const unit = '前史:普通事件描述。'.repeat(8) + '\n\n';
    while (body.length < 2000000) body += unit;
    body += '\n\n# 终章\n设定规则:尾部事实@200万终点N9\n';
    assert.ok(body.length >= 2000000);
    const t0 = Date.now();
    let cursor = 0;
    const all = [];
    let guard = 0, wins = 0;
    while (cursor !== null && cursor < body.length && guard++ < 300) {
        const w = LI.parseSourceWindow({ text: body }, { range: { from: cursor, to: cursor + 100000 } });
        wins += 1;
        all.push(...w.items.map((i) => i.text));
        cursor = w.completeness.nextCursor;
    }
    const ms = Date.now() - t0;
    assert.ok(all.some((t) => t.includes('200万起点M1')), '首部事实存活');
    assert.ok(all.some((t) => t.includes('200万终点N9')), '尾部唯一事实存活(修前丢失)');
    assert.ok(ms < 5000, '200 万字符窗口流耗时应秒级,实测 ' + ms + 'ms');
    console.log('  · 2M 窗口流: ' + wins + ' 窗 / ' + all.length + ' 条 / ' + ms + 'ms');
});

/* ════════ D 零写与不抛 ════════ */
test('D1 畸形入参退化为可读读数不抛(负 range/超界/空文本/非字符串)', () => {
    const body = makeNovel(10);
    /* 负 range */
    const w1 = LI.parseSourceWindow({ text: body }, { range: { from: -50, to: 100 } });
    assert.equal(w1.window.from, 0, '负起点归零');
    /* 超界 to */
    const w2 = LI.parseSourceWindow({ text: body }, { range: { from: 0, to: 99999999 } });
    assert.equal(w2.completeness.state, 'complete', '超界读到尾');
    /* 空文本 */
    const w3 = LI.parseSourceWindow({ text: '' }, { range: { from: 0, to: 100 } });
    assert.equal(w3.ok, false);
    assert.ok(w3.why.includes('empty-source'));
    /* 非字符串 */
    const w4 = LI.parseSourceWindow(null, {});
    assert.equal(w4.ok, false);
    /* range 乱型 */
    const w5 = LI.parseSourceWindow({ text: body }, { range: 'junk' });
    assert.ok(typeof w5.window.from === 'number');
});

test('D2 零写:输入容器与原文本一个字节不改', () => {
    const input = { text: makeNovel(20), file: 'x.txt' };
    const before = input.text;
    const snapshot = JSON.stringify({ text: input.text, file: input.file });
    LI.parseSourceWindow(input, { range: { from: 5, to: 60 } });
    LI.parseSource(input);
    assert.equal(JSON.stringify({ text: input.text, file: input.file }), snapshot, '输入容器未被动过');
    assert.equal(input.text, before);
});

/* ════════ E 宿主接线 ════════ */
const IDX = read('index.js');
const SA_SRC = read('engine-story-annual.js');
const FULL_SRC = IDX + '\n' + SA_SRC;
test('E1 宿主出口 loreImportParseWindow 在位且带完整度留痕', () => {
    assert.ok(IDX.includes('loreImportParseWindow(raw, opts)'), '出口方法在位');
    assert.ok(FULL_SRC.includes('plugin.loreImportParseWindow'), 'errLog 点名');
    assert.ok(FULL_SRC.includes("return _moduleLib(() => window.LonShaLoreImport, 'lore-import.js');"), '取库口在位');
    /* 留痕读数键 */
    const m = /loreImportParseWindow\(engine, raw, opts\) \{[\s\S]{0,2400}?engine\._lastLoreImport = \{[\s\S]{0,500}?window:/;
    assert.ok(m.test(FULL_SRC), '窗口留痕读数(window 键)在位');
});

test('E2 模块缺席降级:出口返回同键面 + completeness.unknown(不是静默 null)', async () => {
    /* 构造最小宿主环境:_loreImportLib 返回 null(模块缺席) */
    const fakeHost = {
        _loreImportAbsent: (reason) => ({ ok: false, source: null, sections: [], items: [], classes: {}, why: [reason || 'module-absent'], reason: reason || 'module-absent', absent: true }),
        opts: { range: { from: 123 } },
    };
    let SA;
    try {
        SA = (await import('../engine-story-annual.js')).default;
    } catch (_) {
        SA = (await import('module')).createRequire(import.meta.url)('../engine-story-annual.js');
    }
    const out = SA.loreImportParseWindow(fakeHost, { text: 'x' }, fakeHost.opts);
    assert.equal(out.absent, true, '缺席面标记');
    assert.equal(out.reason, 'window-unsupported');
    assert.equal(out.completeness.state, 'unknown', '未知 ≠ 没读完');
    assert.equal(out.completeness.readChars, 123, '回显请求起点');
    assert.equal(out.window, null);
});
/* ════════ F 版本锚与负控制 ════════ */
test('F1 版本锚:manifest/package 同源且不低于 ' + BORN, () => {
    assert.equal(vnum(BORN), 3334000, 'vnum 序数必须可数（当版锚点）');
    const MF = JSON.parse(read('manifest.json'));
    const PKG = JSON.parse(read('package.json'));
    const IDXV = /const VERSION = '([^']+)'/.exec(IDX);
    const codeVer = IDXV && IDXV[1];
    /* ★ [v3.335.0 交棒修正] 本档原先把三源**硬锁**成 BORN 本身 —— 那是「锁上一版」的死数，
     *   与 v3330 / v3331 / v3332 三档已经采用的交棒口径相悖（它们写的是
     *   `vnum(codeVer) >= vnum(BORN)`），也与版本守卫 V2 的修法逐字一致：
     *   「三源互等 + vnum(v) >= vnum(该测试自己的出生版本)，不要写死当前版本」。
     *   实现无缺陷（本档 M4-O5 的 16 条判据全绿），是判据自身留了硬等号。 */
    assert.equal(MF.version, codeVer, 'manifest 须跟随 index.js');
    assert.equal(PKG.version, codeVer, 'package.json 须跟随 index.js');
    assert.ok(vnum(codeVer) >= vnum(BORN), '本套件只在 ' + BORN + ' 及以后成立；当前 ' + codeVer);
});

/* 负控制锚点(每个恰中 1 次,H5 判据纯度) */
const A1_TRUNC_KEEP = 'out.ok = out.items.length > 0 && !truncated;';
const A2_GATE = "return Object.assign(out, { reason: 'source-incomplete', why: '源未读完(' + numOr(comp.readChars, 0) + '/' + numOr(comp.totalChars, 0) + ' 字符);请用窗口解析逐段导入或显式确认局部导入', nextCursor: numOr(comp.nextCursor, null) });";
const A3_ALIGN = 'const fwd = full.indexOf(NL + NL, Math.max(0, end - 1));';

test('N1 负控制:拆掉截断拒读(ok 恒 items>0)⇒ A1/A2 必须翻红', () => {
    const liSrc = read('lore-import.js');
    assert.equal(liSrc.split(A1_TRUNC_KEEP).length - 1, 1, '锚点恰中 1 次');
    /* 双锚点同拆:ok 判据 + why 具名行,只拆一处另一处仍拦(判据纯度) */
    const WHY_KEEP = "if (truncated) out.why.push('source-truncated');";
    assert.equal(liSrc.split(WHY_KEEP).length - 1, 1, 'why 锚点恰中 1 次');
    const broken = liSrc.replace(A1_TRUNC_KEEP, 'out.ok = out.items.length > 0;').replace(WHY_KEEP, '');
    const BLI = loadIIFE(broken, 'LonShaLoreImport');
    /* 同款真判据 */
    let body = '# 卷首\n';
    const unit = '前史:普通事件描述。'.repeat(8) + '\n\n';
    while (body.length <= BLI.MAX_SOURCE_CHARS) body += unit;
    const r = BLI.parseSource({ text: body });
    assert.equal(r.ok, true, '破坏后:截断源 ok 回到 true(缺陷现形)');
    assert.ok(!r.why.includes('source-truncated'), 'why 不再具名');
});

test('N2 负控制:拆掉 planApply 完整度闸 ⇒ A2 必须翻红', () => {
    const liSrc = read('lore-import.js');
    assert.equal(liSrc.split(A2_GATE).length - 1, 1);
    const broken = liSrc.replace(A2_GATE, '/* gate removed */');
    const BLI = loadIIFE(broken, 'LonShaLoreImport');
    let body = '# 卷首\n';
    const unit = '前史:普通事件描述。'.repeat(8) + '\n\n';
    while (body.length <= BLI.MAX_SOURCE_CHARS) body += unit;
    const r = BLI.parseSource({ text: body });
    const pv = BLI.diffPreview(r, {}, {});
    const plan = BLI.planApply(r, pv, {});
    /* ok:false(被 A1 闸住)但 plan 侧闸被拆 —— 若 A1 也被拆,这里 ok:true 放行 */
    const doubleBroken = broken.replace(A1_TRUNC_KEEP, 'out.ok = out.items.length > 0;');
    const BLI2 = loadIIFE(doubleBroken, 'LonShaLoreImport');
    const r2 = BLI2.parseSource({ text: body });
    const pv2 = BLI2.diffPreview(r2, {}, {});
    const plan2 = BLI2.planApply(r2, pv2, {});
    assert.equal(plan2.ok, true, '双闸全拆:截断资料被放行(缺陷现形)');
});

test('N3 负控制:窗口终点对齐退回单行 ⇒ B2 去重数必须偏离 3000', () => {
    const liSrc = read('lore-import.js');
    assert.equal(liSrc.split(A3_ALIGN).length - 1, 1);
    /* 只把段边界(\n\n)退化为单行(\n),end=fwd+1 保持不变 ——
     * 修前实测形态:窗口含 \n,下窗从 \n 后开始,起点不回退,跨窗段出「无题半段」。 */
    const broken = liSrc.replace(A3_ALIGN, 'const fwd = full.indexOf(NL, Math.max(0, end - 1));');
    const BLI = loadIIFE(broken, 'LonShaLoreImport');
    const body = makeNovel(3000);
    const W = 50000;
    let cursor = 0;
    const byHash = new Map();
    let guard = 0;
    while (cursor !== null && cursor < body.length && guard++ < 200) {
        const w = BLI.parseSourceWindow({ text: body }, { range: { from: cursor, to: cursor + W } });
        for (const it of w.items) byHash.set(it.textHash + '#' + it.cls, it);
        cursor = w.completeness.nextCursor;
    }
    assert.notEqual(byHash.size, 3000, '行对齐退化后去重数偏离(边界半段现形): ' + byHash.size);
});

test('Z1 工具两向自证:breakOnce 锚点不存在/不唯一须抛;原版上判据为真', () => {
    /* breakOnce(源码, 锚点, 替换) 在锚点恰中 1 次时返回破坏副本,否则抛 */
    const liSrc = read('lore-import.js');
    assert.throws(() => breakOnce(liSrc, '这个锚点不存在于文件中###', 'x'), /锚点/);
    assert.throws(() => breakOnce(liSrc, 'const', 'x'), /锚点|唯一|多次/);
    const broken = breakOnce(liSrc, A1_TRUNC_KEEP, 'out.ok = out.items.length > 0;');
    assert.ok(broken.includes('out.ok = out.items.length > 0;'));
    assert.ok(!broken.includes(A1_TRUNC_KEEP), '原锚点已被替换');
});