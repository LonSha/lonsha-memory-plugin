// tests/v3234_event_platform_composition.test.mjs — F-2 跨平台事件：来源维度与平台构成 [v3.233.0]
//
//   计划 F-2 的原话是「上游 event-completeness.js / event-chain.js 外供平台维度读数」。
//   开工实测两件事，都写进了本套件的判据面：
//     ① `event-chain.js` 管的是 **agent run 生命周期**（run_started → … → run_completed 的
//        迁移合法性），与「剧情事件的平台」无关 —— 计划行文把两个**同名不同物**的模块混成了
//        一件事。这是本仓治理过多轮的「陈旧/不准确记载」第 N 例（比没有记载更危险）。
//     ② 真缺口在事件段的 `source` 字段：它是 **40 字自由文本**，全仓唯一赋值点是
//        `index.js:_absorbEventSegments` 写死的 `'extract'`。`'phone:diary'` 与 `'phone:weibo'`
//        两种来源**压成一态**读不出来，下游织光机也就答不出「这条是插件提的还是手机侧发生的」。
//
//   同轮探针抓到的两条真缺陷（都不是推演出来的）：
//     · 证据面事件账的**出处列恒 null** —— `copyEvent()` 产出的条目顶层**没有** floor，
//       而登记表照抄别账写 `finiteFloor(it.floor)`；且事件线的段本就有楼层（10/11/12）。
//     · `copySegment` **非幂等** —— 共享契约 `ledger-entity.js:finite(null)` 返回 **0**
//       （`Number(null) === 0` 且有限），于是二次归一化把 null 楼层塔成第 0 楼。
//       与 O-1/O-2、T8 属同族（「没给」与「给了 0」不得同形）。
//
//   覆盖：A 出口与口径 / B 分级四态 / C 构成面 / D 出处修正 / E 幂等与三态 / F 诊断接线 /
//         G 旧档兼容 / H 负控制（真源码破坏）/ I 版本锚
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const req = createRequire(import.meta.url);
const EC_SRC = read('event-completeness.js');
const WB_SRC = read('evidence-workbench.js');
const INDEX_SRC = read('index.js');
const EC = req(path.join(ROOT, 'event-completeness.js'));
const WB = req(path.join(ROOT, 'evidence-workbench.js'));

/** 造一条三段线（提取 1 + 手机 2），再叠一段无来源、一段未分平台来源 */
function mk() {
    let st = { version: EC.EC_VERSION, seq: 0, events: [] };
    st = EC.addSegment(st, { title: '钟楼相遇', role: 'cause', text: '两人同时到钟楼', floor: 10, source: 'extract' }).state;
    st = EC.addSegment(st, { title: '钟楼相遇', role: 'action', text: '争执', floor: 11, source: 'phone:diary' }).state;
    st = EC.addSegment(st, { title: '钟楼相遇', role: 'result', text: '不欢而散', floor: 12, source: 'phone:weibo' }).state;
    st = EC.addSegment(st, { title: '钟楼相遇', role: 'followup', text: '各自回了家', floor: 13, source: 'weibo' }).state;
    st = EC.addSegment(st, { title: '钟楼相遇', role: 'action', text: '雨夜再遇', source: '' }).state;
    return st;
}

/* ══════════ A 出口与口径 ══════════ */
test('v3234 A1. ★★ 出口与常量齐备，且词表是**受控**的（不自己另写一份平台清单）', () => {
    assert.equal(typeof EC.sourceFace, 'function', 'sourceFace 在场');
    assert.equal(typeof EC.platformFace, 'function', 'platformFace 在场');
    assert.equal(typeof EC.platformLine, 'function', 'platformLine 在场（诊断行）');
    assert.ok(Array.isArray(EC.SOURCE_PLATFORMS) && EC.SOURCE_PLATFORMS.length >= 4, '平台词表经 api 导出');
    assert.deepEqual(EC.SOURCE_LEVELS.slice().sort(), ['extract', 'none', 'other', 'platform'], '四态齐名');
    assert.match(EC_SRC, /\n  const SOURCE_PLATFORMS = Object\.freeze\(\[/, '词表定义为冻结常量（单一真源）');
});

test('v3234 A2. ★★★ ★边界：只给构成，不给判断（不得出现「哪个平台更可信/更重要」）', () => {
    const f = EC.platformFace(mk(), {});
    const txt = JSON.stringify(f);
    for (const bad of ['trust', 'weight', 'priority', 'important', 'confidence', 'severity', 'truth']) {
        assert.equal(txt.includes(bad), false, '★ 构成读数里不得出现判断类字段：' + bad);
    }
    assert.deepEqual(Object.keys(f).sort(),
        ['countedEvents', 'events', 'levels', 'ok', 'platforms', 'reason', 'segments', 'truncated', 'unlabeled'],
        '★ 返回面恒定（下游可按键断言，不必猜缺哪个键）');
    assert.match(EC_SRC, /只给构成，不给判断/, '源码面须写明这条边界');
});

test('v3234 A3. ★★★ 计划行文修正：「agent run 生命周期」与我们说的「事件平台」不是一件事', () => {
    /* 这条是**反坐实**：计划把 event-chain.js 也列为本项的交付面，实测它不是。
     *   把它写进判据，防止后人照计划把两者混成一份读数。 */
    const chainSrc = read('event-chain.js');
    assert.match(chainSrc, /AGENT_EVENT_TYPE|run_started/, 'event-chain 管的是 run 生命周期');
    assert.equal(/platform/i.test(chainSrc), false, 'event-chain 里没有平台维度（它本来就不该有）');
    assert.match(EC_SRC, /event-chain\.js` 管的是 \*\*agent run 生命周期\*\*/, '源码里须写明两者的区别');
});

/* ══════════ B 分级四态 ══════════ */
test('v3234 B1. ★★★★ 分级四态各有其面：extract / platform / other / none 不得压成一态', () => {
    assert.equal(EC.sourceFace('extract').level, 'extract');
    assert.equal(EC.sourceFace('phone:diary').level, 'platform');
    assert.equal(EC.sourceFace('phone:diary').platform, 'phone');
    /* 「给了但本仓不认识」⇒ other（不是 none，也不是 extract）——三态塌成两态的老坑 */
    assert.equal(EC.sourceFace('weibo').level, 'other');
    assert.equal(EC.sourceFace('weibo').label, 'weibo', '★ 给了不认识的来源必须**保留原串**，不丢弃');
    /* 「压根没给」⇒ none */
    assert.equal(EC.sourceFace('').level, 'none');
    assert.equal(EC.sourceFace(null).level, 'none');
    assert.equal(EC.sourceFace(undefined).level, 'none');
    /* 四态计数在构成面上必然齐备（缺的给 0，不省略键） */
    assert.deepEqual(Object.keys(EC.platformFace(mk(), {}).levels).sort(), ['extract', 'none', 'other', 'platform']);
});

test('v3234 B2. ★★★ 不做文本猜测（T11 同纪律）：大小写/前缀不模糊匹配', () => {
    /* 「不作文本猜测归类」是同 plan F-2 自己写的边界，也是本仓 T11 的口径。
     *   `Phone:diary`（大写）不得被当成 phone —— 猜就是拿猜测冒充事实。 */
    assert.equal(EC.sourceFace('Phone:diary').level, 'other', '大写不模糊匹配');
    assert.equal(EC.sourceFace('phone').level, 'other', '★ 「phone」没有子源也没冒号 —— 不补一个子源给它');
    const txt = JSON.stringify(EC.platformFace(mk(), {}));
    assert.equal(/Phone/.test(txt), false, '大小写变体不得被归入平台面');
});

/* ══════════ C 构成面 ══════════ */
test('v3234 C1. ★★★ 构成面：平台/分级计数逐项对得上，且与逐线读数一致', () => {
    const f = EC.platformFace(mk(), {});
    assert.equal(f.segments, 5, '五个段全计入');
    assert.deepEqual(f.levels, { extract: 1, platform: 2, other: 1, none: 1 }, '★ 四态计数逐项对得上');
    assert.equal(f.unlabeled, 1, '未标来源如实计数（不是错误，是读数）');
    assert.deepEqual(f.platforms, [{ platform: 'phone', segments: 2, events: 1 }], '只有 phone 出现在线上');
    assert.equal(f.events.length, 1, '一条含段的线');
    assert.equal(f.events[0].segments, 5);
    assert.deepEqual(f.events[0].levels, f.levels, '逐线读数与全局读数在同一时刻一致');
    assert.deepEqual(f.events[0].platforms, [{ platform: 'phone', segments: 2 }], '逐线平台构成');
});

test('v3234 C2. ★★★ 每平台的**覆盖线数**独立于展示上限统计（计数不得被截断改写）', () => {
    let st = { version: EC.EC_VERSION, seq: 0, events: [] };
    st = EC.addSegment(st, { title: 'A', role: 'action', text: 'a1', floor: 1, source: 'phone:diary' }).state;
    st = EC.addSegment(st, { title: 'B', role: 'action', text: 'b1', floor: 2, source: 'phone:diary' }).state;
    st = EC.addSegment(st, { title: 'C', role: 'action', text: 'c1', floor: 3, source: 'extract' }).state;
    const full = EC.platformFace(st, {});
    assert.deepEqual(full.platforms, [{ platform: 'phone', segments: 2, events: 2 }], 'phone 覆盖 2 条线');
    /* 截断只缩展示面，不缩计数：否则同一返回面里 segments 是真实值、events 是截断值，
     *   读者无法分辨「平台只覆盖 1 条线」与「展示上限是 1」。本例是探针抓到的**真缺陷**：
     *   初稿把 events 计数写进了展示循环内，maxEvents=1 时同一返回面里同时出现
     *   「segments: 2（真实）」与「events: 1（截断）」。 */
    const lim = EC.platformFace(st, { maxEvents: 1 });
    assert.equal(lim.events.length, 1, '逐线展示被截到上限');
    assert.equal(lim.countedEvents, 3, '★ 含段线数仍是截断前的真值');
    assert.equal(lim.truncated, true, '截断须如实报（读者才知道自己看到的是不全的）');
    assert.deepEqual(lim.platforms, [{ platform: 'phone', segments: 2, events: 2 }], '★ 覆盖线数不得被上限改写');
    assert.equal(lim.levels.platform, 2, '分级计数同样不被上限改写');
});

test('v3234 C3. ★★ 空账与「开过还没落段」的线：不假装有读数', () => {
    assert.equal(EC.platformLine({ version: EC.EC_VERSION, seq: 0, events: [] }), '暂无事件段');
    const onlyOpened = EC.openEvent({ version: EC.EC_VERSION, seq: 0, events: [] }, { title: '空线' }).state;
    const f = EC.platformFace(onlyOpened, {});
    assert.equal(f.segments, 0, '空线不产生段');
    assert.equal(f.countedEvents, 0, '空线不进构成（它还没有来源可言）');
    assert.equal(f.events.length, 0);
    assert.equal(f.reason, 'ok', '账在位且有线 ⇒ 不是 no-events');
});

/* ══════════ D 出处修正（探针抓到的第 1 条真缺陷） ══════════ */
test('v3234 D1. ★★★★ 事件账出处列按**段真值**取 —— 修前恒 null（顶层本无 floor）', () => {
    const st = mk();
    const face = WB.buildWorkbench({ _eventThreadState: st }, { apis: { 'event-completeness': EC } });
    const L = face.ledgers['event-completeness'];
    assert.equal(L.state, 'ok');
    assert.equal(L.items.length, 1);
    assert.equal(L.items[0].floor, 10, '★ 出处取首个有楼层的段的楼层（修前恒 null，面板永远空着）');
    /* 顶层确实没有 floor：这条断言把「不许再用 it.floor」的口径钉在源码面上 */
    const ev = EC.normalize(st).events[0];
    assert.equal(ev.floor, undefined, '事件顶层本无 floor 字段（故照抄别账的写法必错）');
    assert.match(WB_SRC, /copyEvent\(\)` 产出的条目顶层\*\*没有\*\* floor/, '源码须写明这条缺陷的成因');
});

test('v3234 D2. ★★★ 来源构成进 detail：复用上游**同一口径**，不另写一份折算', () => {
    const face = WB.buildWorkbench({ _eventThreadState: mk() }, { apis: { 'event-completeness': EC } });
    const d = face.ledgers['event-completeness'].items[0].detail;
    assert.match(d, /^段 5/, '段数照旧在前面');
    assert.match(d, /提取1/, '提取段数带出');
    assert.match(d, /phone2/, '平台段数带出');
    assert.match(d, /其它1/, '其它来源带出');
    assert.match(d, /未标1/, '未标来源带出');
    /* 同一口径：把 api 交给 project（本模块不另写折算），签名兼容既有八账 */
    assert.match(WB_SRC, /p = spec\.project \? spec\.project\(it, api\)/, '投影收 api（单一真源复用）');
    const bare = WB.buildWorkbench({ _eventThreadState: mk() }, { apis: {} }).ledgers['event-completeness'];
    assert.equal(bare.state, 'absent', '模块没挂时如实缺席（不得假装算出构成）');
    assert.equal(bare.reason, 'module-unavailable');
});

test('v3234 D3. ★★★ 其余八账未被本次改动打破（投影签名向后兼容）', () => {
    const face = WB.buildWorkbench({ worldProg: null, _factVersionState: null, _repairState: null }, { apis: {} });
    assert.equal(face.summary.total, 9, '九账一个不漏');
    assert.equal(face.selfConsistent, true, '三态恰好盖满登记表');
    for (const k of Object.keys(face.ledgers)) {
        assert.notEqual(face.ledgers[k].reason, 'thrown', k + ' 不得因签名变化而抛错');
    }
    const s = WB.search(face, '钟楼', {});
    assert.equal(Array.isArray(s.hits), true, '检索面仍可用');
});

/* ══════════ E 幂等与三态（探针抓到的第 2 条真缺陷） ══════════ */
test('v3234 E1. ★★★★ 段楼层：`copySegment` 必须**幂等**（null 不得被塔成第 0 楼）', () => {
    /* 实测根因：共享契约 `finite(null)` 返回 0（`Number(null) === 0` 且有限），
     *   而 `finite(undefined)` 返回 null  ⇒ 首稿 copySegment 非幂等：
     *   一次 copy 把「没给」塔成 null，二次 copy 又把 null 塔成 0。 */
    const LE = req(path.join(ROOT, 'ledger-entity.js'));
    assert.equal(LE.finite(null), 0, '（根因在现场：共享契约把 null 塔成 0 —— 这是它自己的口径，本版不动它）');
    assert.equal(LE.finite(undefined), null, '（undefined 塔成 null）');
    let st = { version: EC.EC_VERSION, seq: 0, events: [] };
    const r1 = EC.addSegment(st, { title: '无线索', role: 'action', text: 'z', source: 'extract' });
    assert.equal(r1.segment.floor, null, '★ 没给楼层 ⇒ null（不得是 0）');
    st = r1.state;
    assert.equal(st.events[0].segments[0].floor, null, 'state 内也是 null');
    /* 幂等：反复归一化读数不变 */
    let cur = st;
    for (let i = 0; i < 5; i++) cur = EC.normalize(cur);
    assert.equal(cur.events[0].segments[0].floor, null, '★ 归一化 5 次仍是 null（修前第 2 次就变成 0）');
    /* 真第 0 楼仍按第 0 楼算（不得为了修这条把真 0 也吃掉） */
    const r0 = EC.addSegment({ version: EC.EC_VERSION, seq: 0, events: [] }, { title: '开场', role: 'action', text: 'w', floor: 0, source: 'extract' });
    assert.equal(r0.segment.floor, 0, '★ 真给了第 0 楼就按第 0 楼算（不能一刀切成 null）');
});

test('v3234 E2. ★★★ 证据面同样是三态：全段没楼层 ⇒ null；真第 0 楼 ⇒ 0', () => {
    const mkHost = (segFloor) => ({ _eventThreadState: { events: [{ id: 'e', title: 'T', segments: [{ role: 'action', text: 'x', floor: segFloor, source: 'extract' }] }] } });
    const a = WB.buildWorkbench(mkHost(null), { apis: { 'event-completeness': EC } }).ledgers['event-completeness'];
    assert.equal(a.items[0].floor, null, '★ 没说楼层 ⇒ null（不得写 0）');
    const b = WB.buildWorkbench(mkHost(0), { apis: { 'event-completeness': EC } }).ledgers['event-completeness'];
    assert.equal(b.items[0].floor, 0, '★ 真第 0 楼 ⇒ 0（两态不得同形）');
});

/* ══════════ F 诊断接线 ══════════ */
test('v3234 F1. ★★★ 宿主自检面真有消费点：事件完整与事件来源是**两行**不同读数', () => {
    assert.match(INDEX_SRC, /\['事件完整', EC\.line\(this\._eventThreadState\)\]/, '原有事件完整行仍在');
    assert.match(INDEX_SRC, /\['事件来源', EC\.platformLine\(this\._eventThreadState\)\]/, '★ 新增事件来源行接在真消费点');
    assert.match(INDEX_SRC, /selfCheck\.eventPlatform/, '异常归因打点在场');
    /* 两行必须分野：一个是「缺哪一段」，一个是「段从哪来」。
     *   首版判据写的是「标签命中恰 2 次」——**判据自身的缺陷**（同 V3 那个「锚点被裸词命中」同族）：
     *   诊断行的每个分支各有一个 return，故每个标签在源码里各出现 4 次。
     *   改成对**结构**断言：两个标签各自接的读数函数必须是不同的那两个（line / platformLine），
     *   且不得把两件事合成一行（不存在『事件完整』接 platformLine 的写法）。 */
    const labelLine = (INDEX_SRC.match(/\['事件完整'[^\]]*\]/g) || []).join('|');
    const labelSrc = (INDEX_SRC.match(/\['事件来源'[^\]]*\]/g) || []).join('|');
    assert.ok(labelLine.length > 0 && labelSrc.length > 0, '两个标签都必须在场');
    assert.match(labelLine, /EC\.line\(/, '「事件完整」只接叙事完整度读数');
    assert.equal(/platformLine/.test(labelLine), false, '★ 不得把平台构成塞进「事件完整」行（合成一行就是把两个问题压成一态）');
    assert.match(labelSrc, /EC\.platformLine\(/, '「事件来源」只接平台构成读数');
    assert.equal(/[^m]EC\.line\(/.test(labelSrc), false, '★ 不得把叙事完整度塞进「事件来源」行');
});

test('v3234 F2. ★★ 诊断行如实：有段才报构成，空账不假装', () => {
    assert.equal(EC.platformLine(mk()), '段 5 · 上游提取 1 · phone 2 · 其它来源 1 ⚠ · 未标来源 1');
    assert.equal(EC.platformLine({ version: EC.EC_VERSION, seq: 0, events: [] }), '暂无事件段');
    assert.equal(EC.platformLine(null), '暂无事件段', '畸形入参不得抛（不抛纪律）');
    assert.equal(EC.platformLine({ events: 'nonsense' }), '暂无事件段');
});

/* ══════════ G 旧档兼容与纯读 ══════════ */
test('v3234 G1. ★★★ 旧标注版本档读出逐字一致（条目/段字段面不动）', () => {
    const legacy = { version: 1, seq: 9, events: [{ id: 'evt_9', title: '旧线', actors: [], segments: [{ role: 'action', text: 'x', floor: 3, source: 'extract', origin: 'stated', eventKey: 'k', at: 1 }], abandoned: false, abandonReason: '', revision: 2 }] };
    const n = EC.normalize(legacy);
    assert.deepEqual(Object.keys(n.events[0]), ['id', 'title', 'actors', 'segments', 'abandoned', 'abandonReason', 'revision'], '事件字段面逐字不变');
    assert.deepEqual(Object.keys(n.events[0].segments[0]), ['role', 'text', 'floor', 'source', 'origin', 'eventKey', 'at'], '段字段面逐字不变');
    assert.equal(n.events[0].segments[0].source, 'extract', '旧档 source 原样保留');
    assert.equal(n.events[0].segments[0].floor, 3, '旧档楼层原样保留');
    const f = EC.platformFace(legacy, {});
    assert.deepEqual(f.levels, { extract: 1, platform: 0, other: 0, none: 0 }, '旧档也能读出构成（无 platform 段 ⇒ 0）');
});

test('v3234 G2. ★★★ 纯读：取十次后账本逐字节不变（本面不写任何账）', () => {
    const st = mk();
    const before = JSON.stringify(st);
    for (let i = 0; i < 10; i++) { EC.platformFace(st, {}); EC.platformLine(st); EC.sourceFace('phone:diary'); }
    assert.equal(JSON.stringify(st), before, '★ 读数面不得有副作用');
    const face = WB.buildWorkbench({ _eventThreadState: st }, { apis: { 'event-completeness': EC } });
    const before2 = JSON.stringify(st);
    WB.buildWorkbench({ _eventThreadState: st }, { apis: { 'event-completeness': EC } });
    WB.search(face, '钟楼', {});
    assert.equal(JSON.stringify(st), before2, '证据面同样纯读');
});

/* ══════════ H 负控制（真源码破坏 → 破坏副本上重跑同款真判据） ══════════ */
const isAssertionFailure = (e) => e && e.name === 'AssertionError';

/** 破坏 event-completeness.js：连同它依赖的 ledger-entity.js 一起拷进临时目录 */
function withBrokenEc(mutate, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3234-'));
    try {
        const broken = mutate(EC_SRC);
        assert.notEqual(broken, EC_SRC, '破坏必须真发生');
        fs.writeFileSync(path.join(dir, 'event-completeness.js'), broken);
        fs.copyFileSync(path.join(ROOT, 'ledger-entity.js'), path.join(dir, 'ledger-entity.js'));
        return fn(req(path.join(dir, 'event-completeness.js')));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

/** 破坏 evidence-workbench.js（独立文件，无需伴随依赖） */
function withBrokenWb(mutate, fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3234w-'));
    try {
        const broken = mutate(WB_SRC);
        assert.notEqual(broken, WB_SRC, '破坏必须真发生');
        fs.writeFileSync(path.join(dir, 'evidence-workbench.js'), broken);
        return fn(req(path.join(dir, 'evidence-workbench.js')));
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('v3234 N1. ★★★★ 破坏「平台级 ⇒ platform」⇒ B1/C1 同款判据必须转红', () => {
    const anchor = "      if (SOURCE_PLATFORMS.indexOf(p) >= 0) {";
    assert.equal(EC_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenEc((s) => s.replace(anchor, "      if (false) {"), (M) => {
        assert.throws(() => assert.equal(M.sourceFace('phone:diary').level, 'platform', '平台级必须归 platform'),
            isAssertionFailure, 'B1 同款判据在破坏副本上必须抛');
        /* 破坏已生效：盘级来源掉进了 other（而不是被丢掉 —— 这正是四态可分的好处） */
        assert.equal(M.sourceFace('phone:diary').level, 'other', '（破坏已生效：盘级来源掉进 other）');
        assert.throws(() => assert.deepEqual(M.platformFace(mk(), {}).levels, { extract: 1, platform: 2, other: 1, none: 1 }, '构成面逐项对得上'),
            isAssertionFailure, 'C1 同款判据必须抛');
    });
});

test('v3234 N2. ★★★ 破坏「other 保留原串」⇒ B1 同款判据必须转红（不得静默丢弃）', () => {
    const anchor = "    return { level: 'other', platform: '', label: s };";
    assert.equal(EC_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenEc((s) => s.replace(anchor, "    return { level: 'other', platform: '', label: '' };"), (M) => {
        assert.throws(() => assert.equal(M.sourceFace('weibo').label, 'weibo', '不认识的来源必须原串保留'),
            isAssertionFailure, 'B1 同款判据必须抛');
        assert.equal(M.sourceFace('weibo').label, '', '（破坏已生效：原串被抹成空）');
    });
});

test('v3234 N3. ★★★★ 破坏「段楼层先排 null」⇒ E1 幂等判据必须转红', () => {
    const anchor = "      floor: (s.floor == null ? null : finite(s.floor)),";
    assert.equal(EC_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenEc((s) => s.replace(anchor, "      floor: finite(s.floor),"), (M) => {
        const st = M.addSegment({ version: M.EC_VERSION, seq: 0, events: [] }, { title: 'T', role: 'action', text: 'z', source: 'extract' }).state;
        assert.throws(() => assert.equal(st.events[0].segments[0].floor, null, '没给楼层必须是 null'),
            isAssertionFailure, 'E1 同款判据在破坏副本上必须抛');
        assert.equal(st.events[0].segments[0].floor, 0, '（破坏已生效：没给楼层被塔成第 0 楼）');
        let cur = st;
        for (let i = 0; i < 3; i++) cur = M.normalize(cur);
        assert.equal(cur.events[0].segments[0].floor, 0, '（破坏已生效：幂等性丢失）');
    });
});

test('v3234 N4. ★★★ 破坏「未标来源如实计数」⇒ C1 同款判据必须转红', () => {
    const anchor = "        if (f.level === 'none') unlabeled += 1;";
    assert.equal(EC_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenEc((s) => s.replace(anchor, "        if (false) unlabeled += 1;"), (M) => {
        assert.throws(() => assert.equal(M.platformFace(mk(), {}).unlabeled, 1, '未标来源须如实计数'),
            isAssertionFailure, 'C1 同款判据必须抛');
        assert.equal(M.platformFace(mk(), {}).unlabeled, 0, '（破坏已生效：未标来源被吞成 0）');
    });
});

test('v3234 N5. ★★★★ 破坏证据面出处列（退回照抄别账的 `it.floor`）⇒ D1 同款判据必须转红', () => {
    const anchor = "                for (const s of segs) { if (s && s.floor != null) { firstFloor = finiteFloor(s.floor); break; } }";
    assert.equal(WB_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenWb((s) => s.replace(anchor, "                firstFloor = finiteFloor(it.floor);"), (M) => {
        const face = M.buildWorkbench({ _eventThreadState: mk() }, { apis: { 'event-completeness': EC } });
        assert.throws(() => assert.equal(face.ledgers['event-completeness'].items[0].floor, 10, '出处取段真值'),
            isAssertionFailure, 'D1 同款判据在破坏副本上必须抛');
        assert.equal(face.ledgers['event-completeness'].items[0].floor, null, '（破坏已生效：退回恒 null —— 就是修前那条缺陷本身）');
    });
});

test('v3234 N6. ★★★ 破坏投影「收 api」⇒ D2 构成带出判据必须转红', () => {
    const anchor = "            try { p = spec.project ? spec.project(it, api) : {}; } catch (_e) { p = {}; }";
    assert.equal(WB_SRC.split(anchor).length - 1, 1, '锚点须恰中 1 次');
    withBrokenWb((s) => s.replace(anchor, "            try { p = spec.project ? spec.project(it) : {}; } catch (_e) { p = {}; }"), (M) => {
        const face = M.buildWorkbench({ _eventThreadState: mk() }, { apis: { 'event-completeness': EC } });
        assert.throws(() => assert.match(face.ledgers['event-completeness'].items[0].detail, /phone2/, '构成须带出'),
            isAssertionFailure, 'D2 同款判据必须抛');
        assert.equal(/phone2/.test(face.ledgers['event-completeness'].items[0].detail), false, '（破坏已生效：构成带不出来）');
    });
});

/* ══════════ I 版本锚 ══════════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3234 I1. ★ 版本锚（下限形）+ 三源同源', () => {
    const pkg = JSON.parse(read('package.json'));
    const mf = JSON.parse(read('manifest.json'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(read('index.js')) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.equal(pkg.version, codeVer, 'package 同源');
    assert.equal(mf.version, codeVer, 'manifest 同源');
    assert.ok(vnum(codeVer) >= vnum('3.233.0'), '本套件只在 3.233.0 及以后成立；当前 ' + codeVer);
});
