// tests/v3175_world_clock_reader.test.mjs
// v3.175 世界钟读者面：本插件对 WorldAxis 的**第一个**消费点。
//   此前全库 grep `WorldAxis` / `worldaxis` 在产品代码里**零命中** —— 这套三插件体系里
//   本插件是唯一记账的那一个，却连「另一个插件认为现在是几号」都不知道。
//   于是「同一场剧情里坐着两个『现在』」在本插件侧**完全不可观测**。
// 层次：A 桥来源五态归因（未装 / 未启用 / 拒绝 / 无快照 / 就绪，五种处境必须可分辨）
//       B 世界钟解析（合法 / 非法 / 边界 / 古历串 / 越界夹取）
//       C 两个钟的对账（同日 / 领先 / 落后 / 历法不相容 / 无可比日期）
//       D GameClock 接线（读数落进快照 / 随存档恢复 / **绝不改写本插件时钟** / 只读）
//       E 不抛（reader 缺失 / 桥抛异常 / 快照畸形）
//       F 负控制（真源码破坏 → 破坏副本 → 同款真判据）+ 工具两向自证
//       G 发布卫生
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const R = require(path.join(REPO, 'world-clock-reader.js'));
const readerSrc = fs.readFileSync(path.join(REPO, 'world-clock-reader.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
// ── GameClock 抽取（花括号配平；class 边界即 class PlotTimeline） ──
function extractClass(source, name) {
    const start = source.indexOf('class ' + name + ' {');
    assert.ok(start > 0, `找到 class ${name}`);
    let depth = 0, i = source.indexOf('{', start), end = -1;
    for (; i < source.length; i++) {
        if (source[i] === '{') depth++;
        else if (source[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
    }
    assert.ok(end > 0, `class ${name} 花括号闭合`);
    return source.slice(start, end);
}
/** 用给定源码造一台 GameClock（破坏副本也走这里 → 判据与破坏同源） */
function makeClock(source) {
    const holder = { LonShaWorldClockReader: R };
    const factory = new Function('errLog', 'window', 'return (' + extractClass(source, 'GameClock') + ');');
    return factory(() => {}, holder);
}
const GC = makeClock(idxSrc);
/** 显式注入 reader 与 win（readWorldAxisClock 透传 opts.win）——判据可独立驱动 */
const readOn = (inst, bridge) => {
    const w = { LonShaWorldClockReader: R };
    if (bridge !== undefined) w.worldaxis_bridge_v1 = bridge;
    return inst.readWorldAxisClock(R, { win: w });
};
// 常用桥形态（判据与破坏共用同一批夹具）
const BRIDGE = {
    dormant: () => ({ settings: () => ({ enabled: false }), stat: () => ({ refused: 1, lastRefusal: { reason: 'disabled' } }), snapshot: () => null }),
    ready: (iso) => ({ settings: () => ({ enabled: true }), stat: () => ({}), snapshot: () => ({ worldClock: { iso } }) }),
    refused: () => ({ settings: () => ({ enabled: true }), stat: () => ({ refused: 3, lastRefusal: { reason: 'disabled' } }), snapshot: () => null }),
    malformed: () => ({ settings: () => ({ enabled: true }), stat: () => ({}), snapshot: () => 'not-an-object' })
};

// ══════════ A 桥来源归因（五种处境必须可分辨） ══════════
test('【A1】未装 → not-mounted（不是「世界没时间」，是本插件旁边的桥不在）', () => {
    const c = new GC();
    const r = readOn(c, undefined);
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'not-mounted');
    assert.equal(c.worldClockLine(), '不可用（not-mounted） · WorldAxis 未安装');
});

test('【A2】★ 装了但未启用 → disabled（必须与「未装」分开：用户要能知道该去开哪个开关）', () => {
    const c = new GC();
    const r = readOn(c, BRIDGE.dormant());
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'disabled', 'WorldAxis v2.16 的桥默认休眠 ⇒ 这是最常见的一态，不能与未装同形');
    assert.notEqual(r.reason, 'not-mounted');
    assert.ok(/WorldAxis 未安装/.test(R.describeRead({ ok: false, reason: 'not-mounted' })));
    assert.ok(/未启用/.test(R.describeRead({ ok: false, reason: 'disabled' })), '两态的归因话术必须不同');
});

test('【A3】桥在、启用、但拒绝读取 → refused（与「无快照」分开）', () => {
    const r = readOn(new GC(), BRIDGE.refused());
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'refused');
});

test('【A4】就绪 → ok，且五态 reason 两两不同形', () => {
    const c = new GC();
    c.date = '2026-09-13';
    const r = readOn(c, BRIDGE.ready('2026-09-13T21:45'));
    assert.equal(r.ok, true);
    assert.equal(r.reason, 'ok');
    const reasons = new Set(['not-mounted', 'disabled', 'refused', 'no-snapshot', 'pull-failed']);
    assert.equal(reasons.size, 5, '五态枚举本身不得有重名');
});

test('【A5】bridgeSource 只读探针：不拉快照也能归因（且不写桥）', () => {
    let written = false;
    const spy = new Proxy(BRIDGE.dormant(), { set() { written = true; return true; } });
    const src = R.bridgeSource('worldaxis_bridge_v1', { worldaxis_bridge_v1: spy });
    assert.equal(src.mounted, true);
    assert.equal(src.enabled, false);
    assert.equal(src.reason, 'disabled');
    assert.equal(written, false, '归因探针本身不得写桥任何字段');
});

// ══════════ B 世界钟解析 ══════════
test('【B1】合法 ISO → 完整时间对象（date/time/weekday/calendar）', () => {
    const wc = R.readWorldClock({ worldClock: { iso: '2026-09-13T21:45', dayIndex: 12, label: '薄暮' } });
    assert.ok(wc, '合法 ISO 必须解析出时间对象');
    assert.equal(wc.date, '2026年09月13日');
    assert.equal(wc.time, '21:45');
    assert.equal(wc.dayIndex, 12);
    assert.equal(wc.label, '薄暮');
    assert.equal(wc.calendar, 'gregorian');
    assert.ok(/^星期[日一二三四五六]$/.test(wc.weekday), 'weekday 为中文星期：' + wc.weekday);
});

test('【B2】缺时间部分 → 取 00:00（不猜、不抛）', () => {
    const wc = R.readWorldClock({ worldClock: { iso: '2026-09-13' } });
    assert.ok(wc);
    assert.equal(wc.time, '00:00');
});

test('【B3】★ 非法月/日必须拒绝（\\d{1,2} 本就允许 13 月/40 日，范围校验是唯一防线）', () => {
    assert.equal(R.readWorldClock({ worldClock: { iso: '2026-13-40' } }), null, '13 月 40 日不得放行');
    assert.equal(R.readWorldClock({ worldClock: { iso: '2026-00-10' } }), null, '0 月不得放行');
    assert.equal(R.readWorldClock({ worldClock: { iso: '2026-09-00' } }), null, '0 日不得放行');
});

test('【B4】越界时分夹取（23:99 → 23:59），不拒绝整条', () => {
    assert.equal(R.readWorldClock({ worldClock: { iso: '2026-09-13T23:99' } }).time, '23:59');
    assert.equal(R.readWorldClock({ worldClock: { iso: '2026-09-13T99:00' } }).time, '23:00');
});

test('【B5】古历/架空历串必须返回 null（世界钟是公历 ISO；非 ISO 即无从对齐）', () => {
    assert.equal(R.readWorldClock({ worldClock: { iso: '天顺三年春' } }), null);
    assert.equal(R.readWorldClock({ worldClock: { iso: '' } }), null);
    assert.equal(R.readWorldClock(null), null);
    assert.equal(R.readWorldClock({ worldClock: 'not-an-object' }), null);
});

test('【B6】clockEra：公历形态 vs 无从对齐（unknown 不是错，是让路的依据）', () => {
    assert.equal(R.clockEra('2026-09-13'), 'gregorian');
    assert.equal(R.clockEra('2026年9月13日'), 'gregorian');
    assert.equal(R.clockEra('天顺三年春'), 'unknown');
    assert.equal(R.clockEra('霜月3日'), 'unknown');
    assert.equal(R.clockEra(''), 'unknown');
});

// ══════════ C 对账 ══════════
test('【C1】同日 → same（days=0，两个钟指向同一天）', () => {
    const d = R.diffClocks('2026年09月13日', '2026-09-13');
    assert.equal(d.comparable, true);
    assert.equal(d.verdict, 'same');
    assert.equal(d.days, 0);
});

test('【C2】世界钟较早 → world-behind（本插件走在前）；世界钟较晚 → world-ahead', () => {
    const b = R.diffClocks('2026年09月10日', '2026-09-13');
    assert.equal(b.verdict, 'world-behind');
    assert.equal(b.days, 3);
    const a = R.diffClocks('2026年09月20日', '2026-09-13');
    assert.equal(a.verdict, 'world-ahead');
    assert.equal(a.days, -7);
    // 符号容易读反 ⇒ 两个纪元日原始值必须一并给出，调用方自己减
    assert.equal(b.worldEpochDay, R.diffClocks('2026年09月10日', '2026-09-10').storyEpochDay);
    assert.ok(b.worldEpochDay < b.storyEpochDay, 'worldEpochDay < storyEpochDay 对应 world-behind');
});

test('【C3】★ 历法不相容 → incompatible-era（一侧古历一侧公历不是数据缺失，是两个坐标系）', () => {
    const d = R.diffClocks('2026年09月13日', '天顺三年春');
    assert.equal(d.comparable, false);
    assert.equal(d.verdict, 'incompatible-era', '古历剧情下不得被公历世界钟硬比污染');
    assert.equal(d.days, null);
    assert.notEqual(d.verdict, 'unparsable', '「无从比」与「取不到日期」必须分开');
});

test('【C4】两侧都取不到合法日期 → unparsable（与 incompatible-era 分开）', () => {
    assert.equal(R.diffClocks('', '').verdict, 'unparsable');
    assert.equal(R.diffClocks('2026年09月13日', '').verdict, 'unparsable', '本插件侧未定时间 ⇒ 无可比日期');
    assert.equal(R.diffClocks('', '天顺三年春').verdict, 'unparsable', '★ 缺席不是历法：一侧为空不得报 incompatible-era');
});

// ══════════ D GameClock 接线 ══════════
test('【D1】读数落进快照（三态可分：未读 null / 不可用 ok=false / 已读 ok=true）', () => {
    const c = new GC();
    assert.equal(c.getSnapshot().worldClockRead, null, '未读 ⇒ null（不是「不可用」，读者要能分清）');
    c.date = '2026-09-13';
    readOn(c, BRIDGE.dormant());
    const s1 = c.getSnapshot().worldClockRead;
    assert.ok(s1 && s1.ok === false && s1.reason === 'disabled', '不可用仍带归因进快照');
    readOn(c, BRIDGE.ready('2026-09-13T21:45'));
    const s2 = c.getSnapshot().worldClockRead;
    assert.ok(s2 && s2.ok === true && s2.worldClock && s2.diff.verdict === 'same', '已读带世界钟与对账');
});

test('【D2】读数随存档恢复（producer 重建后仍能归因，不靠内存）', () => {
    const c = new GC();
    c.import({ worldClockRead: { ok: true, reason: 'ok', describe: 'x', worldClock: { date: '2026年09月13日', time: '21:45' }, diff: { verdict: 'same', days: 0 }, at: 1 } });
    const s = c.getSnapshot().worldClockRead;
    assert.ok(s && s.ok === true && s.diff.verdict === 'same');
    assert.ok(c.worldClockLine().indexOf('与本插件时钟同日') >= 0, '恢复后读数仍可读：' + c.worldClockLine());
});

test('【D3】★★ 世界钟绝不改写本插件时钟（正文为最高事实源，世界钟是推演）', () => {
    const c = new GC();
    c.date = '天顺三年春';
    readOn(c, BRIDGE.ready('2026-09-13T21:45'));
    assert.equal(c.date, '天顺三年春', '对账不得把古历剧情改成公历');
    const c2 = new GC();
    c2.date = '2026-09-13';
    readOn(c2, BRIDGE.ready('2026-09-20T09:00'));
    assert.equal(c2.date, '2026-09-13', '即便历法相容且世界钟不同日，也不得擅自改写');
});

test('【D4】★ 只读契约：读世界钟绝不写世界桥任何字段', () => {
    let written = false;
    const spy = new Proxy(BRIDGE.ready('2026-09-13T00:00'), { set() { written = true; return true; } });
    readOn(new GC(), spy);
    assert.equal(written, false);
    assert.equal(R.WORLDAXIS_BRIDGE_ID, 'worldaxis_bridge_v1', '桥名与上游逐字一致（改一处即两端失联）');
});

test('【D5】worldClockLine 对五种归因都给得出人话（不得有 undefined）', () => {
    const c = new GC();
    c.date = '2026-09-13';
    for (const b of [undefined, BRIDGE.dormant(), BRIDGE.refused(), BRIDGE.malformed(), BRIDGE.ready('2026-09-13T21:45')]) {
        readOn(c, b);
        const line = c.worldClockLine();
        assert.ok(typeof line === 'string' && line.length > 0, '读数行非空字符串');
        assert.ok(!/undefined/.test(line), '读数行不得出现 undefined：' + line);
    }
});

// ══════════ E 不抛 ══════════
test('【E1】reader 缺失 → reader-unavailable（本插件装在世界轴之前也要活着）', () => {
    const c = new GC();
    const r = c.readWorldAxisClock({});   // 传入的「reader」是空对象
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'reader-unavailable');
});

test('【E2】★ 桥抛异常 → 归因 thrown，绝不外抛给调用方', () => {
    const c = new GC();
    let threw = false;
    let r = null;
    try { r = c.readWorldAxisClock({ readWorldAxisSnapshot: () => { throw new Error('boom'); } }); } catch (e) { threw = true; }
    assert.equal(threw, false, '调用方不得接到异常');
    assert.ok(r && r.reason === 'thrown');
    assert.equal(R.readWorldClock({ get worldClock() { throw new Error('g'); } }), null, 'reader 内层 getter 抛错也必须降级');
});

test('【E3】快照畸形 / 宿主怪异 getter → 一律降级不抛', () => {
    assert.equal(readOn(new GC(), BRIDGE.malformed()).ok, false);
    const badHost = { get worldaxis_bridge_v1() { throw new Error('host'); } };
    assert.doesNotThrow(() => R.readWorldAxisSnapshot({ win: badHost }));
    assert.equal(R.readWorldAxisSnapshot({ win: badHost }).reason, 'not-mounted');
});

// ══════════ F 负控制 ══════════
// 判据集中在 judgeReader / judgeClock（只断言行为，不复述锚点字面量）；
// 锚点字面量只在 brokenCopies() 出现一次（判据纯度）。
/** 用一个「已启用 + 给定快照」的宿主驱动读取（判据与破坏共用同一条路径） */
const readSnap = (api, snap) => api.readWorldAxisSnapshot({
    win: { worldaxis_bridge_v1: { settings: () => ({ enabled: true }), stat: () => ({}), snapshot: () => snap } }
});
/**
 * 经**指定的 reader** 驱动一台时钟读一次。
 * 关键：不得偷用模块级 R —— 否则负控制里「B1 把未启用并进未装」的破坏根本打不到判据
 * （判据走的是真 reader），负控制恒真（假绿的第三种形态：破坏是真的，判据没经过它）。
 */
function readVia(api, inst, bridge) {
    const w = {};
    if (bridge !== undefined) w.worldaxis_bridge_v1 = bridge;
    return inst.readWorldAxisClock(api, { win: w });
}
function judgeReader(api, makeClk) {
    const c = new makeClk();
    c.date = '2026-09-13';
    const dormant = readVia(api, c, BRIDGE.dormant());
    const missing = readVia(api, c, undefined);
    const wc = api.readWorldClock({ worldClock: { iso: '2026-13-40' } });
    const era = api.diffClocks('2026年09月13日', '天顺三年春');
    // 判据四：上游契约版本**显式**不匹配必须降级可归因（不得静默按旧契约解读）
    const mism = readSnap(api, { version: 99, worldClock: { iso: '2026-09-13T00:00' } });
    // 判据五：宿主怪异 getter 不得外抛（「不抛」是声明，不是期望）
    let threw = false;
    try {
        api.readWorldAxisSnapshot({ get win() { throw new Error('x'); } });
        api.bridgeSource('worldaxis_bridge_v1', { get worldaxis_bridge_v1() { throw new Error('y'); } });
    } catch (_e) { threw = true; }
    return {
        // 判据一：未装与未启用必须可分辨（不得合并成一个「拿不到」）
        dormantVsMissing: dormant.reason === 'disabled' && missing.reason === 'not-mounted',
        // 判据二：非法月日必须拒绝
        rejectBadDate: wc === null,
        // 判据三：历法不相容不得被硬比（古历剧情不被公历钟污染）
        eraGuard: era.verdict === 'incompatible-era',
        // 判据四：契约版本门（显式 99 ≠ 本读者面所认的 1）
        contractGuard: mism.ok === false && mism.reason === 'contract-mismatch',
        // 判据五：任何怪异宿主都不得把异常送到调用方
        noThrow: !threw
    };
}
function judgeClock(source, api) {
    const GCx = makeClock(source);
    const c = new GCx();
    c.date = '2026-09-13';
    const okRead = readOn(c, BRIDGE.ready('2026-09-13T21:45'));
    const badRead = readOn(c, undefined);
    // 判据四：本地时钟不被世界钟改写
    c.date = '天顺三年春';
    readOn(c, BRIDGE.ready('2026-09-13T21:45'));
    const keptEra = c.date === '天顺三年春';
    // 判据五：ok 必须如实（不可用不得报 ok=true）
    const c2 = new GCx();
    c2.date = '2026-09-13';
    // 判据六：读数必须**真的落进快照**（声明了却带不出去 = 声明面空转）
    readOn(c2, BRIDGE.ready('2026-09-13T21:45'));
    const carried = c2.getSnapshot().worldClockRead;
    return {
        okHonest: okRead.ok === true && badRead.ok === false,
        readCarried: !!(carried && carried.ok === true && carried.diff && carried.diff.verdict === 'same'),
        keptEra
    };
}
/** 真源码破坏 → 破坏副本（锚点必须恰中 1 次，否则这不是破坏） */
function brokenCopies() {
    const mk = (src, re, to, tag) => {
        const hits = (src.match(new RegExp(re.source, 'g')) || []).length;
        assert.equal(hits, 1, `锚点【${tag}】须恰中 1 次（实 ${hits}）`);
        const out = src.replace(re, to);
        assert.notEqual(out, src, `破坏【${tag}】必须真的改变源码`);
        return out;
    };
    return [
        {
            tag: 'B1-disabled-collapse', what: '把「未启用」并进「未装」',
            reader: mk(readerSrc,
                /if \(src\.enabled === false\) return \{ ok: false, reason: 'disabled', source: src, snapshot: null \};/,
                "if (false) return { ok: false, reason: 'disabled', source: src, snapshot: null };")
        },
        {
            tag: 'B2-date-range', what: '删掉日期范围校验（13 月/40 日将放行）',
            reader: mk(readerSrc,
                /if \(!\(year >= 1 && month >= 1 && month <= 12 && day >= 1 && day <= 31\)\) return null;/,
                'if (false) return null;')
        },
        {
            // ★ 锚点纪律（v3.174 记过的那条）：锚点必须落在**判据真正经过的出口**上。
            //   本判据（eraGuard）用『公历 vs 古历』驱动，走的是「两侧都有值 + 历法形态不同」这一出口；
            //   若把锚点打在更靠后的 `worldEra !== storyEra` 分支上，破坏打得再真也永远到不了判据
            //   ⇒ 负控制恒真（假绿的第三形态）。
            tag: 'B3-era-guard', what: '拆掉历法不相容门（古历被公历硬比）',
            reader: mk(readerSrc,
                /if \(wRaw && sRaw && \(worldEra === 'gregorian'\) !== \(storyEra === 'gregorian'\)\)/,
                'if (false)')
        },
        {
            tag: 'B4-ok-honesty', what: '把 ok 写死（不可用也报「已读」）',
            clock: mk(idxSrc, /ok: !!\(read && read\.ok\),/, 'ok: true,')
        },
        {
            tag: 'B5-contract-collapse', what: '拆掉上游契约版本门（升版后静默按旧契约解读）',
            reader: mk(readerSrc,
                /Number\(snap\.version\) !== BRIDGE_VERSION/,
                'false')
        },
        {
            tag: 'B6-swallow-thrown', what: '把整函数兜底换成直接重抛（读者面开始外抛）',
            reader: mk(readerSrc,
                /return \{ ok: false, reason: 'thrown', source: null, snapshot: null \};/,
                'throw _e;')
        }
    ];
}
// 破坏副本必须各自可独立装载成模块（reader 走 IIFE 双导出）
function loadReaderFrom(src) {
    const mod = { exports: {} };
    const fn = new Function('module', 'window', 'globalThis_', src);
    fn(mod, undefined, undefined);
    return mod.exports;
}

test('【F1】负控制·原版对照：三处 reader 判据在真源码上必须干净', () => {
    const j = judgeReader(R, GC);
    assert.equal(j.dormantVsMissing, true, '原版：未装/未启用可分辨');
    assert.equal(j.rejectBadDate, true, '原版：非法月日被拒');
    assert.equal(j.eraGuard, true, '原版：历法不相容不硬比');
    assert.equal(j.contractGuard, true, '原版：契约版本显式不匹配 ⇒ 降级可归因');
    assert.equal(j.noThrow, true, '原版：怪异宿主 getter 不外抛');
});

test('【F2】★ 负控制·逐项现形：每处破坏都必须让对应判据翻红（不得互相掩护）', () => {
    const seen = {};
    for (const v of brokenCopies()) {
        if (!v.reader) continue;
        const api = loadReaderFrom(v.reader);
        const j = judgeReader(api, GC);
        seen[v.tag] = j;
    }
    assert.equal(seen['B1-disabled-collapse'].dormantVsMissing, false, 'B1 破坏后：未装/未启用塌成一态');
    assert.equal(seen['B1-disabled-collapse'].rejectBadDate, true, 'B1 只动来源态，不连坐日期校验');
    assert.equal(seen['B2-date-range'].rejectBadDate, false, 'B2 破坏后：非法月日被放行');
    assert.equal(seen['B2-date-range'].eraGuard, true, 'B2 不连坐历法门');
    assert.equal(seen['B3-era-guard'].eraGuard, false, 'B3 破坏后：古历被公历硬比污染');
    assert.equal(seen['B1-disabled-collapse'].contractGuard, true, 'B1 不连坐契约版本门');
    assert.equal(seen['B2-date-range'].contractGuard, true, 'B2 不连坐契约版本门');
    assert.equal(seen['B3-era-guard'].contractGuard, true, 'B3 不连坐契约版本门');
    assert.equal(seen['B5-contract-collapse'].contractGuard, false, 'B5 破坏后：版本不匹配被静默放行');
    assert.equal(seen['B5-contract-collapse'].dormantVsMissing, true, 'B5 只动版本门，不连坐来源态');
    assert.equal(seen['B6-swallow-thrown'].noThrow, false, 'B6 破坏后：怪异宿主把异常抛给了调用方');
    assert.equal(seen['B6-swallow-thrown'].contractGuard, true, 'B6 只动兜底，不连坐版本门');
});

test('【F3】★ 负控制·GameClock 接线：ok 写死后「不可用」会被报成「已读」', () => {
    const broken = brokenCopies().find(v => v.tag === 'B4-ok-honesty');
    const jReal = judgeClock(idxSrc, R);
    assert.equal(jReal.okHonest, true, '原版：ok 如实');
    assert.equal(jReal.readCarried, true, '原版：读数真的落进快照（此判据非恒真）');
    assert.equal(jReal.keptEra, true, '原版：本插件时钟不被改写');
    const jBroken = judgeClock(broken.clock, R);
    assert.equal(jBroken.okHonest, false, 'B4 破坏后：不可用被报成已读');
    assert.equal(jBroken.keptEra, true, 'B4 只动 ok，不连坐时钟保护');
});

test('【F4】工具两向自证：锚点不存在或不唯一必须抛；判据纯度（锚点字面量只在破坏表出现）', () => {
    // ① 不存在的锚点
    const hits = (readerSrc.match(/THIS_ANCHOR_DOES_NOT_EXIST/g) || []).length;
    assert.equal(hits, 0, '假锚点必须命中 0，否则「破坏」是假的');
    // ② 锚点不唯一时自证工具会抛（用一个真出现多次的串）
    assert.throws(() => {
        const h = (readerSrc.match(/return null;/g) || []).length;
        if (h !== 1) throw new Error('锚点命中 ' + h + ' 次');
    }, /锚点命中 \d+ 次/, '多命中必须抛');
    // ③ 判据纯度：破坏表里的锚点字面量在两处判据函数中不得复述
    const puritySrc = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const judgePart = puritySrc.slice(puritySrc.indexOf('function judgeReader'), puritySrc.indexOf('function brokenCopies'));
    assert.ok(!/enabled === false\) return \{ ok: false, reason: 'disabled'/.test(judgePart), '判据函数不得复述 B1 锚点字面量');
    assert.ok(!/year >= 1 && month >= 1/.test(judgePart), '判据函数不得复述 B2 锚点字面量');
});

// ══════════ G 发布卫生 ══════════
test('【G1】版本三源一致且不低于 v3.175.0', () => {
    const v = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.ok(v, 'index.js VERSION 在场');
    assert.ok(vnum(v) >= vnum('3.175.0'), `index.js 版本 ${v} >= 3.175.0`);
    assert.equal(manifest.version, v, `manifest(${manifest.version}) 与 index.js(${v}) 漂移`);
    assert.equal(pkg.version, v, `package.json(${pkg.version}) 与 index.js(${v}) 漂移`);
});

test('【G2】world-clock-reader.js 已在 extra_js 注册（漏注册 ⇒ 全局符号缺席 ⇒ reader-unavailable）', () => {
    assert.ok((manifest.extra_js || []).includes('world-clock-reader.js'), '新模块必须进 manifest.extra_js');
    // 真正要配的是「注册」+「运行时真去取该全局符号」：模块由 manifest 载入，index.js 本就不必
    //   写出文件名；但若 index.js 从不取 window.LonShaWorldClockReader，注册就成了摆设
    //   （符号在，消费者不去拿 ⇒ 静默缺席，与未注册同形）。
    assert.ok(/window\.LonShaWorldClockReader/.test(idxSrc), 'index.js 须在运行时取该全局符号（注册了却无人取 ⇒ 静默缺席）');
});

test('【G3】接线真落地：GameClock 有消费点 + 诊断面有读数行（防「声明了却零消费」）', () => {
    assert.ok(/readWorldAxisClock\(/.test(idxSrc), 'GameClock.readWorldAxisClock 定义在场');
    assert.ok(/this\.clock\.readWorldAxisClock\(null, \{ reason: 'after-message' \}\)/.test(idxSrc), '消息管线内必须真调（否则是死声明）');
    assert.ok(/selfCheck\.worldClock/.test(idxSrc), '诊断面新增「世界钟」读数行');
    assert.ok(/\[.世界钟., /.test(idxSrc), '诊断行常驻（健康态也报，不靠出错才显示）');
});

test('【G4】CHANGELOG 顶节为本版并记录世界钟读者面', () => {
    const top = (changelog.match(/^## (v[0-9.]+)/m) || [])[1];
    assert.ok(top, 'CHANGELOG 有版本段');
    assert.ok(vnum(top.replace('v', '')) >= vnum('3.175.0'), `顶节 ${top} 须 >= v3.175.0`);
    assert.ok(/世界钟/.test(changelog), '记录了世界钟读者面');
    assert.ok(/零消费/.test(changelog), '记录了「此前对 WorldAxis 零消费」这一现场');
});