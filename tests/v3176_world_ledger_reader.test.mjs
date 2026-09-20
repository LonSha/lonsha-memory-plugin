// tests/v3176_world_ledger_reader.test.mjs
// v3.176 世界账本读者面：从「两个钟」到「五本账」。
//   背景：v3.175 把「读 WorldAxis 世界钟」这条边接通了，但**只读了一个字段**
//   （`snapshot.worldClock`），而推演侧外供十二条面（pulse / digest / currents / echoes /
//   facts / people / opinion / counts / filter …）。这不是「通路没通」，是「通路只通了一根线」。
//   本版补的**不是「多读几个字段」，是三类结构性缺口**：
//     ① **不可观测的缺口**——推演侧默认只外供显式 public 标记的暗流，其余落进 `filter.notMarked[]`；
//        修前本插件连「有多少东西没给我」都读不到，它见到的是一个「恰好只有这些」的完美世界，
//        而不是「被过滤过、缺了 N 条」的世界。
//     ② **人物位置对读**——时钟差几天只是数字；「本插件记崔莺莺在邮局、推演侧记她在城南车站」
//        是剧情立刻会崩的地方。
//     ③ **事实强度三分**——canon / forum / sandbox + 每条 claim；「已核实」与「纯传闻」
//        在能否当事实引用上完全相反，一锅端会让调用方拿传闻当权威事实写进剧情。
// 层次：A 缺口四态归因（★ no-filter 与 complete 必须不同形）
//       B 账本节在场三态（value / empty / absent）
//       C 人物位置对读（★ 「一侧没记」不是「位置冲突」）
//       D 事实强度三分（★ 空 claim 是「不知道强度」，不是「知道是传闻」）
//       E 权威事实差集（有界 + 总数不失真）
//       F 总入口与归因话术（缺口必须念出来）
//       G GameClock 接线（存档恢复 / 快照携带 / 只读 / 不改时钟 / reader 缺失）
//       H 不抛（宿主怪异 getter / 畸形快照 / 桥抛）
//       I 负控制（真源码破坏 → 破坏副本 → 同款真判据）+ 工具两向自证 + 判据纯度
//       J 发布卫生
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
// 顺序要紧：先加载世界钟读者面（它会把 window.LonShaWorldClockReader 挂到 globalThis），
//   世界账本读者面的 bridgeKit() 才会命中**单一真源复用**这条路径。
const CLOCK = require(path.join(REPO, 'world-clock-reader.js'));
const R = require(path.join(REPO, 'world-ledger-reader.js'));
const readerSrc = fs.readFileSync(path.join(REPO, 'world-ledger-reader.js'), 'utf8');
const clockSrc = fs.readFileSync(path.join(REPO, 'world-clock-reader.js'), 'utf8');
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');
function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}
// ── 夹具：一份「十二条面齐全」的推演侧快照 ──
const LEDGER_SNAP = () => ({
    version: 1,
    worldClock: { iso: '2026-09-13T21:45', dayIndex: 12, label: '薄暮' },
    pulse: { pressure: 3, trend: 'up', note: '' },
    digest: { text: '盐价动荡', at: 1 },
    currents: [{ id: 'c1', title: '盐价', summary: '', visibility: 'public', stage: 'rising', participants: ['甲'], at: 1 }],
    echoes: [{ id: 'e1', refCurrent: 'c1', result: '民怨', exposure: 0.4, at: 2 }],
    facts: [{ key: '事变', value: '已定', scope: 'global', at: 3 }, { key: '未记', value: '', scope: 'local', at: 4 }],
    people: [{ id: 'p1', name: '甲', location: '邮局', action: '', lastSeenAt: 5 }],
    opinion: { canon: [{ title: '通告', body: '', claim: '已核实', scope: 'global', at: 6 }], forum: [], sandbox: [], updatedAt: 7 },
    counts: { currents: 1, echoes: 1, facts: 2, people: 1, opinionCanon: 1, opinionForum: 0 },
    filter: { presumeUnknown: '', includeHidden: false, exportedCurrents: 1, notMarkedCount: 2, notMarked: ['暗流甲', '暗流乙'], hiddenCount: 3, truncated: false }
});
const bridgeWith = (snap) => ({ settings: () => ({ enabled: true }), stat: () => ({}), snapshot: () => snap });
const readSnap = (api, snap) => api.readWorldSnapshot({ win: { LonShaWorldClockReader: CLOCK, worldaxis_bridge_v1: bridgeWith(snap) } });
// ── GameClock 抽取（花括号配平；class 边界即 class GameClock） ──
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
    return new Function('errLog', 'window', 'return (' + extractClass(source, 'GameClock') + ');')(() => {}, undefined);
}
const GC = makeClock(idxSrc);

// ══════════ A 缺口四态归因 ══════════
test('【A1】无 filter 块 → no-filter（上游没告诉我有没有缺口，不是「没有缺口」）', () => {
    const g = R.visibilityGap({ currents: [] });
    assert.equal(g.known, false);
    assert.equal(g.verdict, 'no-filter');
    assert.equal(g.notMarkedCount, 0);
    assert.equal(R.visibilityGap(null).verdict, 'no-filter');
});

test('【A2】★ no-filter 与 complete 必须是两个不同字面量（「不知道缺没缺」≠「告诉我没缺」）', () => {
    const noFilter = R.visibilityGap({ filter: null });
    const complete = R.visibilityGap({ filter: { exportedCurrents: 4, notMarkedCount: 0 } });
    assert.equal(complete.known, true);
    assert.equal(complete.verdict, 'complete');
    assert.notEqual(noFilter.verdict, complete.verdict, '两态同形 = 伪造了一个「没有缺口」的结论');
});

test('【A3】有未外供 → gapped（缺口有数、有名、可念出）', () => {
    const g = R.visibilityGap({ filter: { exportedCurrents: 1, notMarkedCount: 3, notMarked: ['a', 'b', 'c'], hiddenCount: 4 } });
    assert.equal(g.verdict, 'gapped');
    assert.equal(g.notMarkedCount, 3);
    assert.deepEqual(g.notMarked, ['a', 'b', 'c']);
    assert.ok(g.gapRatio > 0 && g.gapRatio <= 1);
});

test('【A4】includeHidden → full（全量放行，与「无缺口」是不同处境）', () => {
    const g = R.visibilityGap({ filter: { exportedCurrents: 4, notMarkedCount: 0, includeHidden: true } });
    assert.equal(g.verdict, 'full');
    assert.notEqual(g.verdict, 'complete');
});

test('【A5】★ 缺口率分母用「外供 + 未标记」，不得 > 1（混用过滤前口径会算出 400%）', () => {
    // exportedCurrents=0 / hiddenCount=1 / notMarkedCount=4：若拿 hiddenCount 当分母 ⇒ 4.0
    const g = R.visibilityGap({ filter: { exportedCurrents: 0, hiddenCount: 1, notMarkedCount: 4 } });
    assert.ok(g.gapRatio <= 1, '缺口率必须 <= 1，实得 ' + g.gapRatio);
    assert.equal(g.gapRatio, 1, '外供 0 条 + 未标记 4 条 ⇒ 100%');
});

test('【A6】notMarkedCount 缺失时回落到 notMarked.length（不把「有名单」报成「没缺口」）', () => {
    const g = R.visibilityGap({ filter: { exportedCurrents: 2, notMarked: ['a', 'b'] } });
    assert.equal(g.verdict, 'gapped');
    assert.equal(g.notMarkedCount, 2);
});

// ══════════ B 账本节在场三态 ══════════
test('【B1】★ present / kind 两轴三态：没这项 / 有这项但是空 / 有内容', () => {
    const absent = R.sectionState({}, 'people');
    const explicitNull = R.sectionState({ people: null }, 'people');
    const emptyArr = R.sectionState({ people: [] }, 'people');
    const value = R.sectionState({ people: [{ name: '甲' }] }, 'people');
    assert.equal(absent.present, false);
    assert.equal(absent.kind, 'absent');
    assert.equal(explicitNull.present, true, '★ 「推演侧明确说没有」与「推演侧没外供这项」处置相反');
    assert.equal(explicitNull.kind, 'empty');
    assert.equal(emptyArr.kind, 'empty');
    assert.equal(value.kind, 'value');
    assert.equal(value.count, 1);
    // 「没外供」与「外供了但是空」不得同形
    assert.notEqual(absent.kind, explicitNull.kind);
});

test('【B2】空对象判 empty、非空对象判 value（count 取键数）；标量判 value', () => {
    assert.equal(R.sectionState({ counts: {} }, 'counts').kind, 'empty');
    const v = R.sectionState({ counts: { a: 1, b: 2 } }, 'counts');
    assert.equal(v.kind, 'value');
    assert.equal(v.count, 2);
    assert.equal(R.sectionState({ pulse: { pressure: 1 } }, 'pulse').kind, 'value');
});

test('【B3】summarizeLedger 覆盖全部账本节 + opinion 三档单独展开', () => {
    const s = R.summarizeLedger(LEDGER_SNAP());
    for (const k of R.LEDGER_SECTIONS) assert.ok(s[k] && typeof s[k].kind === 'string', '缺节 ' + k);
    assert.equal(s.people.kind, 'value');
    assert.deepEqual(s.opinionParts, { canon: 1, forum: 0, sandbox: 0 }, 'canon/forum/sandbox 各自在场态');
    // 空快照不得塌掉：结构仍完整（调用方无需判空）
    const e = R.summarizeLedger(null);
    for (const k of R.LEDGER_SECTIONS) assert.equal(e[k].kind, 'absent');
});

// ══════════ C 人物位置对读 ══════════
test('【C1】同名同位置 → matched；位置归一化后同为一致（「临江市/城南车站」vs「城南车站」）', () => {
    const d = R.diffPeople({ people: [{ name: '甲', location: '邮局' }, { name: '丙', location: '临江市/城南车站' }] },
        { '甲': '邮局', '丙': '城南车站' });
    assert.equal(d.matched, 2, '末级场所名归一后应判一致');
    assert.equal(d.mismatched.length, 0);
});

test('【C2】★ 两侧都有值但不同 → conflict；一侧空一侧有 → one-sided（不得混）', () => {
    const d = R.diffPeople(
        { people: [{ name: '甲', location: '城南车站' }, { name: '乙', location: '' }, { name: '丁', location: '码头' }] },
        { '甲': '邮局', '乙': '码头', '丁': '' });
    const bing = d.mismatched.find(m => m.name === '乙');
    const jia = d.mismatched.find(m => m.name === '甲');
    const ding = d.mismatched.find(m => m.name === '丁');
    assert.ok(jia && jia.kind === 'conflict', '两侧都记了但不同 ⇒ conflict');
    assert.ok(bing && bing.kind === 'one-sided', '推演侧空、本地有 ⇒ 是「一边没记」不是「位置不同」');
    assert.ok(ding && ding.kind === 'one-sided');
    assert.equal(d.mismatchedTotal, 3);
    assert.equal(d.worldOnly.length, 0);
});

test('【C3】只有一侧有这个人 → worldOnly / localOnly（分开报，不合并）', () => {
    const d = R.diffPeople({ people: [{ name: '甲', location: '邮局' }, { name: '戊', location: '车站' }] }, { '甲': '邮局', '己': '码头' });
    assert.deepEqual(d.worldOnly, ['戊']);
    assert.deepEqual(d.localOnly, ['己']);
    assert.equal(d.matched, 1);
});

test('【C4】★ 明细有界（各 12 条）+ 总数不失真（切片后仍知道真实规模）', () => {
    const many = [];
    for (let i = 0; i < 40; i++) many.push({ name: 'P' + i, location: 'L' + i });
    const local = {};
    for (let i = 0; i < 40; i++) local['P' + i] = 'X' + i;
    const d = R.diffPeople({ people: many }, local);
    assert.equal(d.mismatched.length, 12, '明细切片 12 条');
    assert.equal(d.mismatchedTotal, 40, '★ 总数不得被切片吃掉');
});

test('【C5】两侧都空 → 不算不一致（缺席不是冲突）', () => {
    const d = R.diffPeople({ people: [{ name: '甲', location: '' }] }, { '甲': '  ' });
    assert.equal(d.mismatched.length, 0);
    assert.equal(d.matched, 1);
});

test('【C6】畸形输入（null / 非对象 / 数组）一律退化为空读数，不抛', () => {
    assert.doesNotThrow(() => R.diffPeople(null, null));
    assert.equal(R.diffPeople(null, null).hasWorld, false);
    assert.equal(R.diffPeople('x', 1).matched, 0);
    assert.equal(R.diffPeople({ people: 'not-array' }, []).hasWorld, false, 'people 非数组 ⇒ 视为无');
});

// ══════════ D 事实强度三分 ══════════
test('【D1】三档分开计数（canon / forum / sandbox）', () => {
    const o = R.opinionStrength({ opinion: { canon: [{ claim: '已核实' }], forum: [{ claim: '听说' }, { claim: '' }], sandbox: [{ kind: 'x' }], updatedAt: 9 } });
    assert.equal(o.present, true);
    assert.equal(o.canon, 1);
    assert.equal(o.forum, 2);
    assert.equal(o.sandbox, 1);
    assert.equal(o.latestAt, 9);
});

test('【D2】★ 空 claim 归 unknown（不知道强度），不得并入 rumor（知道是传闻）', () => {
    const o = R.opinionStrength({ opinion: { canon: [{ claim: '' }], forum: [{ claim: '待核实' }] } });
    assert.equal(o.unknown, 1, '空 claim 是「不知道强度」');
    assert.equal(o.rumor, 1, '非空且非已核实 ⇒ 传闻');
    assert.equal(o.verified, 0);
});

test('【D3】「已核实」类词才算 verified（中英同认）', () => {
    const o = R.opinionStrength({ opinion: { canon: [{ claim: '已核实' }, { claim: '已确认' }, { claim: '确认属实' }, { claim: 'verified' }, { claim: 'canonical' }] } });
    assert.equal(o.verified, 5);
    assert.equal(o.rumor, 0);
    assert.equal(o.unknown, 0);
});

test('【D4】无 opinion 块 → present=false 且各档为零（不编造）', () => {
    const o = R.opinionStrength({ currents: [] });
    assert.equal(o.present, false);
    assert.equal(o.canon + o.forum + o.sandbox, 0);
    assert.equal(R.opinionStrength(null).present, false);
});

// ══════════ E 权威事实差集 ══════════
test('【E1】键集差集：worldOnly / localOnly / shared（不合并、不覆盖）', () => {
    const d = R.diffFacts({ facts: [{ key: '事变' }, { key: '未记' }] }, ['事变', '本地独有']);
    assert.equal(d.shared, 1);
    assert.deepEqual(d.worldOnly, ['未记']);
    assert.deepEqual(d.localOnly, ['本地独有']);
});

test('【E2】key 缺失时回落 value；空串丢弃', () => {
    const d = R.diffFacts({ facts: [{ value: '从值取' }, { key: '' }] }, []);
    assert.deepEqual(d.worldOnly, ['从值取']);
});

test('【E3】★ 明细有界 + 总数保留（与人物对读同规格）', () => {
    const facts = [];
    for (let i = 0; i < 30; i++) facts.push({ key: 'F' + i });
    const d = R.diffFacts({ facts }, []);
    assert.equal(d.worldOnly.length, 12);
    assert.equal(d.worldOnlyTotal, 30);
});

test('【E4】两侧皆空 → hasWorld/hasLocal 皆为 false（不伪造差集）', () => {
    const d = R.diffFacts({}, []);
    assert.equal(d.hasWorld, false);
    assert.equal(d.hasLocal, false);
    assert.equal(d.worldOnlyTotal, 0);
});

// ══════════ F 总入口与归因话术 ══════════
test('【F1】readLedger 一次拿全（快照 + 形状 + 缺口 + 舆情 + counts）', () => {
    const led = R.readLedger({ win: { LonShaWorldClockReader: CLOCK, worldaxis_bridge_v1: bridgeWith(LEDGER_SNAP()) } });
    assert.equal(led.ok, true);
    assert.equal(led.reason, 'ok');
    assert.equal(led.gap.verdict, 'gapped');
    assert.equal(led.opinion.present, true);
    assert.equal(led.counts.people, 1);
    assert.equal(led.shape.people.kind, 'value');
    assert.equal(led.worldPeople.length, 1);
});

test('【F2】★ ok=false 时形状读数仍**结构完整**（调用方无需判空，空与没读由 reason 区分）', () => {
    const led = R.readLedger({ win: {} });
    assert.equal(led.ok, false);
    assert.ok(led.reason, 'reason 必须可归因：' + led.reason);
    assert.ok(led.shape && led.shape.people && led.shape.people.kind === 'absent');
    assert.ok(led.gap && led.gap.verdict === 'no-filter');
    assert.ok(led.opinion && led.opinion.present === false);
    assert.deepEqual(led.worldPeople, []);
});

test('【F3】★ 归因话术必须把缺口念出来（修前「缺了多少」根本读不到）', () => {
    const gapped = R.describeLedger({ ok: true, counts: { currents: 1, facts: 0, people: 0, opinionCanon: 0, opinionForum: 0 }, gap: { verdict: 'gapped', notMarkedCount: 7 } });
    assert.ok(/未外供/.test(gapped), '缺口须被念出：' + gapped);
    assert.ok(/7/.test(gapped), '缺口条数须带数字');
    const noFilter = R.describeLedger({ ok: true, counts: {}, gap: { verdict: 'no-filter' } });
    assert.ok(/缺口不可知/.test(noFilter), 'no-filter 不得被念成「无缺口」：' + noFilter);
});

test('【F4】未读与不可用的归因话术必须不同（不得同形）', () => {
    assert.equal(R.describeLedger(null), '未读');
    const disabled = R.describeLedger({ ok: false, reason: 'disabled' });
    const notMounted = R.describeLedger({ ok: false, reason: 'not-mounted' });
    assert.notEqual(disabled, notMounted);
    assert.ok(/未启用|休眠/.test(disabled));
    assert.ok(/未安装/.test(notMounted));
});

// ══════════ G GameClock 接线 ══════════
test('【G1】读数落进快照三态：未读 / 不可用带归因 / 已读带缺口与对读', () => {
    const c = new GC();
    assert.equal(c.getSnapshot().worldLedgerRead, null, '未读 ⇒ null');
    c.readWorldLedger(R, { win: {} });
    const s1 = c.getSnapshot().worldLedgerRead;
    assert.ok(s1 && s1.ok === false && s1.reason, '不可用仍带归因进快照');
    c.readWorldLedger(R, { win: { LonShaWorldClockReader: CLOCK, worldaxis_bridge_v1: bridgeWith(LEDGER_SNAP()) }, localPeople: { '甲': '邮局' }, localFacts: ['事变'] });
    const s2 = c.getSnapshot().worldLedgerRead;
    assert.ok(s2 && s2.ok === true && s2.gap.verdict === 'gapped');
    assert.ok(s2.peopleDiff && s2.peopleDiff.matched >= 1, '读数里含人物对读结果');
    assert.ok(s2.factsDiff && s2.factsDiff.shared === 1, '读数里含事实对读结果');
});

test('【G2】★ 读数随存档恢复（重开后仍能念出「上一轮发现过缺口」）', () => {
    const c = new GC();
    c.import({ date: '2026-09-13', worldLedgerRead: { ok: true, reason: 'ok', gap: { verdict: 'gapped', notMarkedCount: 2 }, peopleDiff: { mismatched: [], matched: 1 }, at: 1 } });
    const s = c.getSnapshot().worldLedgerRead;
    assert.ok(s && s.ok === true && s.gap.verdict === 'gapped', '缺口读数必须随存档走');
    assert.ok(s.peopleDiff && s.peopleDiff.matched === 1, '对读结果随存档走');
    assert.ok(/世界账本|未外供/.test(String(c.worldLedgerLine())), '恢复后读数仍可读：' + c.worldLedgerLine());
});

test('【G3】★ 只读契约：读世界账本绝不写世界桥任何字段', () => {
    let written = false;
    const spy = new Proxy(bridgeWith(LEDGER_SNAP()), { set() { written = true; return true; } });
    const c = new GC();
    c.readWorldLedger(R, { win: { LonShaWorldClockReader: CLOCK, worldaxis_bridge_v1: spy } });
    assert.equal(written, false, '读者面不得写桥');
});

test('【G4】★ 读账本绝不改写本插件时钟（正文为最高事实源）', () => {
    const c = new GC();
    c.date = '天顺三年春';
    c.readWorldLedger(R, { win: { LonShaWorldClockReader: CLOCK, worldaxis_bridge_v1: bridgeWith(LEDGER_SNAP()) } });
    assert.equal(c.date, '天顺三年春', '对账不得把古历剧情改成公历');
});

test('【G5】reader 缺失 → reader-unavailable（本插件排在 WorldAxis 之前也要活着）', () => {
    const c = new GC();
    const r = c.readWorldLedger({}, { win: {} });
    assert.equal(r.ok, false);
    assert.equal(r.reason, 'reader-unavailable');
});

test('【G6】worldLedgerLine 未读返回 null；已读/不可用均给得出人话（不得 undefined）', () => {
    const c = new GC();
    assert.equal(c.worldLedgerLine(), null, '未读 ⇒ null（不是「不可用」）');
    c.readWorldLedger(R, { win: {} });
    assert.ok(!/undefined/.test(String(c.worldLedgerLine())));
    c.readWorldLedger(R, { win: { LonShaWorldClockReader: CLOCK, worldaxis_bridge_v1: bridgeWith(LEDGER_SNAP()) } });
    const line = String(c.worldLedgerLine());
    assert.ok(!/undefined/.test(line), '读数行不得出现 undefined：' + line);
    assert.ok(/未外供/.test(line), '有缺口必须念出来：' + line);
});

test('【G7】★ 本地投影由插件本体收集（GameClock 上没有 status/outline，挂上去会静默恒空）', () => {
    const gcSrc = idxSrc.slice(idxSrc.indexOf('class GameClock'), idxSrc.indexOf('class PlotTimeline'));
    assert.ok(!/_localPeopleLocations\s*\(/.test(gcSrc), '★ 本地投影不得挂在 GameClock 上（时钟无 status/outline ⇒ 对读永远静默返回空）');
    assert.ok(!/_localFactKeys\s*\(/.test(gcSrc));
    assert.ok(/_localPeopleLocations\(\)\s*\{/.test(idxSrc), '投影收集器在插件本体');
    assert.ok(/_localFactKeys\(\)\s*\{/.test(idxSrc));
});

// ══════════ H 不抛 ══════════
test('【H1】★ 宿主怪异 getter / 畸形快照 / 桥抛：读者面一律降级，绝不外抛', () => {
    assert.doesNotThrow(() => R.readLedger({ get win() { throw new Error('x'); } }));
    const r1 = R.readLedger({ get win() { throw new Error('x'); } });
    assert.equal(r1.ok, false);
    assert.ok(r1.reason, '归因必须留下：' + r1.reason);
    assert.doesNotThrow(() => R.readLedger({ win: { get worldaxis_bridge_v1() { throw new Error('y'); } } }));
    assert.doesNotThrow(() => R.diffPeople(null, null));
    assert.doesNotThrow(() => R.summarizeLedger(undefined));
    assert.doesNotThrow(() => R.describeLedger(undefined));
    assert.doesNotThrow(() => R.sectionState(undefined, 'x'));
});

test('【H2】快照畸形 / 桥返回非对象 → 一律降级为可归因读数，不抛', () => {
    const bad = R.readLedger({ win: { LonShaWorldClockReader: CLOCK, worldaxis_bridge_v1: { settings: () => ({ enabled: true }), stat: () => ({}), snapshot: () => 'not-an-object' } } });
    assert.equal(bad.ok, false);
    assert.ok(bad.reason);
    assert.equal(R.sectionState('str', 'x').kind, 'absent');
});

// ══════════ I 负控制 ══════════
// 判据集中在 judgeLedger / judgeClock（只断言行为，不复述锚点字面量）；
//   锚点字面量只在 brokenCopies() 出现一次（判据纯度）。
function judgeLedger(api) {
    // 判据一：缺口「不可知」不得与「无缺口」同形，且四态两两可分
    const unknownGap = api.visibilityGap({ currents: [] });
    const noneGap = api.visibilityGap({ filter: { exportedCurrents: 4, notMarkedCount: 0 } });
    const gappedGap = api.visibilityGap({ filter: { exportedCurrents: 1, notMarkedCount: 3 } });
    const fullGap = api.visibilityGap({ filter: { exportedCurrents: 4, notMarkedCount: 0, includeHidden: true } });
    const gapDistinct = new Set([unknownGap.verdict, noneGap.verdict, gappedGap.verdict, fullGap.verdict]).size === 4;
    const unknownHonest = unknownGap.known === false;
    // 判据二：缺口率分母口径（不得超过 1）
    const ratioSane = api.visibilityGap({ filter: { exportedCurrents: 0, hiddenCount: 1, notMarkedCount: 4 } }).gapRatio <= 1;
    // 判据三：账本节「在场但空」与「压根没这项」可分
    const secAbsent = api.sectionState({}, 'people');
    const secEmpty = api.sectionState({ people: null }, 'people');
    const secValue = api.sectionState({ people: [{ name: 'a' }] }, 'people');
    const sectionDistinct = secAbsent.kind === 'absent' && secAbsent.present === false
        && secEmpty.kind === 'empty' && secEmpty.present === true
        && secValue.kind === 'value' && secValue.count === 1;
    // 判据四：位置对读里「一侧没记」不得被报成「位置冲突」
    const pd = api.diffPeople(
        { people: [{ name: '甲', location: '邮局' }, { name: '乙', location: '' }, { name: '丙', location: '临江市/城南车站' }] },
        { '甲': '邮局', '乙': '码头', '丙': '城南车站' });
    const bItem = pd.mismatched.find(m => m.name === '乙');
    const cItem = pd.mismatched.find(m => m.name === '丙');
    const oneSidedSeparate = !!bItem && bItem.kind === 'one-sided' && !cItem && pd.matched === 2;
    // 判据五：空 claim 是「不知强度」，不是「知道是传闻」
    const op = api.opinionStrength({ opinion: { canon: [{ claim: '' }, { claim: '已核实' }], forum: [{ claim: '听说' }] } });
    const claimHonest = op.unknown === 1 && op.verified === 1 && op.rumor === 1;
    // 判据六：桥访问仍是单一真源复用（不是各写一份）
    const reuseLive = api.bridgeKit() !== null;
    // 判据七：任何怪异输入都不得外抛
    let threw = false;
    try {
        api.readLedger({ get win() { throw new Error('x'); } });
        api.diffPeople(null, null);
        api.summarizeLedger(undefined);
        api.describeLedger(undefined);
    } catch (_e) { threw = true; }
    return { gapDistinct, unknownHonest, ratioSane, sectionDistinct, oneSidedSeparate, claimHonest, reuseLive, noThrow: !threw };
}
function judgeClock(source, api) {
    const GCx = makeClock(source);
    const win = { LonShaWorldClockReader: CLOCK, worldaxis_bridge_v1: bridgeWith(LEDGER_SNAP()) };
    // 判据一：一次读全（含人物/事实对读结果）
    const c = new GCx();
    c.date = '2026-09-13';
    const before = c.date;
    const r = c.readWorldLedger(api, { win, localPeople: { '甲': '邮局', '乙': '码头' }, localFacts: ['事变'] });
    const readOk = !!(r && r.ok === true && r.peopleDiff && r.peopleDiff.matched >= 1 && r.factsDiff && r.factsDiff.shared === 1);
    // 判据二：读数必须真的落进快照（声明了却带不出去 = 声明面空转）
    const carried = !!(c.getSnapshot().worldLedgerRead && c.getSnapshot().worldLedgerRead.ok === true);
    // 判据三：不改写本插件时钟
    const clockKept = c.date === before;
    // 判据四：读数随存档恢复
    const c2 = new GCx();
    c2.import({ date: '2026-09-13', worldLedgerRead: { ok: true, reason: 'ok', gap: { verdict: 'gapped', notMarkedCount: 2 }, peopleDiff: { mismatched: [], matched: 1 }, at: 1 } });
    const restored = !!(c2._worldLedgerRead && c2._worldLedgerRead.ok === true && c2._worldLedgerRead.gap && c2._worldLedgerRead.gap.verdict === 'gapped');
    // 判据五：reader 缺失必须可归因
    const c3 = new GCx();
    const miss = c3.readWorldLedger({}, { win });
    const missingHonest = !!(miss && miss.ok === false && miss.reason === 'reader-unavailable');
    // 判据六：只读（不得写世界桥）
    let written = false;
    const spy = new Proxy(bridgeWith(LEDGER_SNAP()), { set() { written = true; return true; } });
    const c4 = new GCx();
    c4.readWorldLedger(api, { win: { LonShaWorldClockReader: CLOCK, worldaxis_bridge_v1: spy } });
    return { readOk, carried, clockKept, restored, missingHonest, noWrite: !written };
}
/** 真源码破坏 → 破坏副本（锚点必须恰中 1 次，否则这不是破坏） */
function brokenCopies() {
    const mk = (src, old, to, tag) => {
        const hits = src.split(old).length - 1;
        assert.equal(hits, 1, `锚点【${tag}】须恰中 1 次（实 ${hits}）`);
        const out = src.replace(old, to);
        assert.notEqual(out, src, `破坏【${tag}】必须真的改变源码`);
        return out;
    };
    return [
        {
            tag: 'B1-nofilter-collapse', what: '把「缺口不可知」并进「无缺口」',
            reader: mk(readerSrc,
                "if (!f) {\n        return { known: false, exported: 0, hiddenTotal: 0, notMarkedCount: 0, notMarked: [], truncated: false, presumeUnknown: '', includeHidden: false, gapRatio: 0, verdict: 'no-filter' };",
                "if (!f) {\n        return { known: false, exported: 0, hiddenTotal: 0, notMarkedCount: 0, notMarked: [], truncated: false, presumeUnknown: '', includeHidden: false, gapRatio: 0, verdict: 'complete' };",
                'B1')
        },
        {
            tag: 'B2-ratio-denominator', what: '缺口率分母换成过滤前口径（会算出 >100%）',
            reader: mk(readerSrc, 'const denom = exported + notMarkedCount;', 'const denom = Number(f.hiddenCount) || 0;', 'B2')
        },
        {
            tag: 'B3-empty-collapse', what: '把「在场但空」并进「压根没这项」',
            reader: mk(readerSrc,
                "if (v === null || v === undefined) return { present: true, kind: 'empty', count: 0 };",
                "if (v === null || v === undefined) return { present: false, kind: 'absent', count: 0 };",
                'B3')
        },
        {
            tag: 'B4-onesided-as-conflict', what: '把「一侧没记」报成「位置冲突」',
            reader: mk(readerSrc,
                "if (!a || !b) { mismatched.push({ name, world: wl, local: ll, kind: 'one-sided' }); continue; }",
                "if (!a || !b) { mismatched.push({ name, world: wl, local: ll, kind: 'conflict' }); continue; }",
                'B4')
        },
        {
            tag: 'B5-unknown-as-rumor', what: '把「不知强度」并进「传闻」',
            reader: mk(readerSrc, 'if (!c) unknown++;', 'if (!c) rumor++;', 'B5')
        },
        {
            tag: 'B6-reuse-broken', what: '拆掉单一真源复用（桥访问各写一份的口子）',
            reader: mk(readerSrc,
                "if (k && typeof k.readWorldAxisSnapshot === 'function' && typeof k.getBridge === 'function') return k;",
                'if (false) return k;',
                'B6')
        },
        {
            tag: 'B7-archive-drop', what: '读数不随存档恢复（重开后缺口读数丢失）',
            clock: mk(idxSrc,
                "if (data.worldLedgerRead && typeof data.worldLedgerRead === 'object') {   // [v3.176]",
                "if (false) {   // [v3.176]",
                'B7')
        },
        {
            tag: 'B8-carried-drop', what: '读数不进快照（声明了却带不出去）',
            clock: mk(idxSrc,
                'worldLedgerRead: this._worldLedgerRead ? { ...this._worldLedgerRead } : null  // [v3.176]',
                'worldLedgerRead: null  // [v3.176]',
                'B8')
        }
    ];
}
// 破坏副本必须各自可独立装载成模块（reader 走 IIFE 双导出；global 注入同一套依赖）
function loadReaderFrom(src) {
    const mod = { exports: {} };
    new Function('module', 'window', src)(mod, { LonShaWorldClockReader: CLOCK });
    return mod.exports;
}

test('【I1】负控制·原版对照：全部判据在真源码上必须干净', () => {
    const j = judgeLedger(R);
    assert.equal(j.gapDistinct, true, '原版：缺口四态两两可分');
    assert.equal(j.unknownHonest, true, '原版：no-filter 如实报「不可知」');
    assert.equal(j.ratioSane, true, '原版：缺口率 <= 1');
    assert.equal(j.sectionDistinct, true, '原版：在场三态可分');
    assert.equal(j.oneSidedSeparate, true, '原版：一侧没记不报冲突');
    assert.equal(j.claimHonest, true, '原版：空 claim 归 unknown');
    assert.equal(j.reuseLive, true, '原版：桥访问复用世界钟读者面（单一真源）');
    assert.equal(j.noThrow, true, '原版：怪异输入不外抛');
    const k = judgeClock(idxSrc, R);
    assert.equal(k.readOk, true, '原版：一次读全（含对读）');
    assert.equal(k.carried, true, '原版：读数真的落进快照');
    assert.equal(k.clockKept, true, '原版：本插件时钟不被改写');
    assert.equal(k.restored, true, '原版：读数随存档恢复');
    assert.equal(k.missingHonest, true, '原版：reader 缺失可归因');
    assert.equal(k.noWrite, true, '原版：只读不写桥');
});

test('【I2】★ 负控制·reader 六处破坏逐项现形，且互不掩护', () => {
    const seen = {};
    for (const v of brokenCopies()) {
        if (!v.reader) continue;
        seen[v.tag] = judgeLedger(loadReaderFrom(v.reader));
    }
    assert.equal(seen['B1-nofilter-collapse'].gapDistinct, false, 'B1 破坏后：不可知与无缺口塌成一态');
    assert.equal(seen['B1-nofilter-collapse'].sectionDistinct, true, 'B1 不连坐在场三态');
    assert.equal(seen['B2-ratio-denominator'].ratioSane, false, 'B2 破坏后：缺口率超过 1');
    assert.equal(seen['B2-ratio-denominator'].gapDistinct, true, 'B2 不连坐缺口四态');
    assert.equal(seen['B3-empty-collapse'].sectionDistinct, false, 'B3 破坏后：在场但空被报成缺席');
    assert.equal(seen['B3-empty-collapse'].gapDistinct, true, 'B3 不连坐缺口四态');
    assert.equal(seen['B4-onesided-as-conflict'].oneSidedSeparate, false, 'B4 破坏后：一侧没记被报成冲突');
    assert.equal(seen['B4-onesided-as-conflict'].sectionDistinct, true, 'B4 不连坐在场三态');
    assert.equal(seen['B5-unknown-as-rumor'].claimHonest, false, 'B5 破坏后：空 claim 被算作传闻');
    assert.equal(seen['B5-unknown-as-rumor'].oneSidedSeparate, true, 'B5 不连坐位置对读');
    assert.equal(seen['B6-reuse-broken'].reuseLive, false, 'B6 破坏后：单一真源复用断掉');
    assert.equal(seen['B6-reuse-broken'].gapDistinct, true, 'B6 不连坐缺口四态');
    assert.equal(seen['B6-reuse-broken'].noThrow, true, 'B6 破坏后回退实现仍不得外抛（软依赖断裂不等于崩溃）');
});

test('【I3】★ 负控制·GameClock 接线：存档丢弃 / 快照不携带，各自现形', () => {
    const kReal = judgeClock(idxSrc, R);
    assert.equal(kReal.restored, true, '原版：可恢复（此判据非恒真）');
    assert.equal(kReal.carried, true, '原版：可携带（此判据非恒真）');
    const b7 = brokenCopies().find(v => v.tag === 'B7-archive-drop');
    const kB7 = judgeClock(b7.clock, R);
    assert.equal(kB7.restored, false, 'B7 破坏后：读数丢失（丢掉「上一轮发现过缺口」）');
    assert.equal(kB7.carried, true, 'B7 只动存档恢复，不连加快照携带');
    assert.equal(kB7.readOk, true, 'B7 只动 import，不连坐读取');
    const b8 = brokenCopies().find(v => v.tag === 'B8-carried-drop');
    const kB8 = judgeClock(b8.clock, R);
    assert.equal(kB8.carried, false, 'B8 破坏后：读数带不出快照');
    assert.equal(kB8.restored, true, 'B8 只动快照携带，不连坐存档恢复');
    assert.equal(kB8.clockKept, true, 'B8 不连坐时钟保护');
});

test('【I4】工具两向自证：锚点不存在或不唯一必须抛；判据纯度（锚点字面量只在破坏表出现）', () => {
    // ① 假锚点必须命中 0（否则「破坏」是假的）
    assert.equal(readerSrc.split('THIS_ANCHOR_DOES_NOT_EXIST').length - 1, 0);
    // ② 多命中必须抛（用一个真出现多次的串自证工具会拦下）
    assert.throws(() => {
        const h = readerSrc.split('return null;').length - 1;
        if (h !== 1) throw new Error('锚点命中 ' + h + ' 次');
    }, /锚点命中 \d+ 次/, '多命中必须抛');
    // ③ 判据纯度：破坏表里的锚点字面量在判据函数中不得复述
    const self = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
    const judgePart = self.slice(self.indexOf('function judgeLedger'), self.indexOf('function brokenCopies'));
    for (const frag of [
        "verdict: 'no-filter' };",
        'const denom = exported + notMarkedCount;',
        "return { present: true, kind: 'empty', count: 0 };",
        "kind: 'one-sided' }); continue; }",
        'if (!c) unknown++;',
        'typeof k.readWorldAxisSnapshot ==='
    ]) {
        assert.ok(judgePart.indexOf(frag) < 0, '判据函数不得复述破坏锚点字面量：' + frag);
    }
    // ④ 破坏副本确实与原版不同（防止「破坏打空」造成假绿）
    for (const v of brokenCopies()) {
        if (v.reader) assert.notEqual(v.reader, readerSrc, v.tag + ' 必须真的改了源码');
        if (v.clock) assert.notEqual(v.clock, idxSrc, v.tag + ' 必须真的改了源码');
    }
});

// ══════════ J 发布卫生 ══════════
test('【J1】版本三源一致且不低于 v3.179.0', () => {
    const v = (idxSrc.match(/const VERSION = '([^']+)'/) || [])[1];
    assert.ok(v, 'index.js VERSION 在场');
    assert.ok(vnum(v) >= vnum('3.179.0'), `index.js 版本 ${v} >= 3.179.0`);
    assert.equal(manifest.version, v, `manifest(${manifest.version}) 与 index.js(${v}) 漂移`);
    assert.equal(pkg.version, v, `package.json(${pkg.version}) 与 index.js(${v}) 漂移`);
});

test('【J2】world-ledger-reader.js 已注册且排在世界钟读者面之后（复用依赖它先就位）', () => {
    const js = manifest.extra_js || [];
    assert.ok(js.includes('world-ledger-reader.js'), '新模块必须进 manifest.extra_js');
    assert.ok(js.indexOf('world-ledger-reader.js') > js.indexOf('world-clock-reader.js'),
        '世界账本读者面必须排在世界钟读者面之后（bridgeKit 复用要求它先挂好）');
    assert.ok(/window\.LonShaWorldLedgerReader/.test(idxSrc), 'index.js 须在运行时取该全局符号（注册了却无人取 ⇒ 静默缺席）');
});

test('【J3】接线真落地：七处消费点（防「声明了却零消费」）', () => {
    assert.ok(/readWorldLedger\(\s*reader\s*,\s*opts\s*=\s*\{\}\s*\)/.test(idxSrc), '时钟侧读者入口');
    assert.ok(/_localPeopleLocations\(\)\s*\{/.test(idxSrc), '宿主侧位置投影');
    assert.ok(/_localFactKeys\(\)\s*\{/.test(idxSrc), '宿主侧事实键投影');
    assert.ok(/readWorldLedger\(opts\s*=\s*\{\}\s*\)\s*\{/.test(idxSrc), '宿主侧入口');
    assert.ok(/this\.readWorldLedger\(\{/.test(idxSrc), '消息管线真调（否则是死声明）');
    assert.ok(/worldLedgerRead:\s*deep\(rawLedgerRead\)/.test(idxSrc), '快照外供读数（三方对读闭环）');
    assert.ok(/selfCheck\.worldLedger/.test(idxSrc), '诊断面读数行');
    assert.ok(/\[.世界账本., /.test(idxSrc), '诊断行常驻（健康态也报，不靠出错才显示）');
});

test('【J4】只读边界：读者面不出现任何写侧入口', () => {
    for (const bad of ['publish(', 'invalidate(', 'setSettings(']) {
        assert.ok(readerSrc.indexOf(bad) < 0, '读者面不得调用写侧入口 ' + bad);
    }
    assert.ok(!/this\.(status|outline|worldProg)\s*=/.test(readerSrc), '读者面不得写本插件账本');
});

test('【J5】CHANGELOG 顶节为本版并记录「只通了一根线」这一现场', () => {
    const top = (changelog.match(/^## (v[0-9.]+)/m) || [])[1];
    assert.ok(top, 'CHANGELOG 有版本段');
    assert.ok(vnum(top.replace('v', '')) >= vnum('3.179.0'), `顶节 ${top} 须 >= v3.179.0`);
    assert.ok(/缺口/.test(changelog), '记录了「不可观测的缺口」这一核心');
    assert.ok(/一根线|一个字段/.test(changelog), '记录了 v3.175 只读一个字段这一现场');
    assert.ok(/对读/.test(changelog), '记录了对读（不覆盖）的边界口径');
});
