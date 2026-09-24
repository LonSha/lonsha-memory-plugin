/* ============================================================
 * tests/v3207_ledger_entity_contract.test.mjs — v3.207.0
 *
 * 主题：统一账本实体模型 / revision 契约（M-P1）。
 *
 * 修前实测（v3.207 逐文件核对，不是猜的）：
 *   六本「逐条实体 + 变更历史」的账各自抄了一份实体读取契约：
 *     · `revision: finite(x) || 1`      6 处逐字相同（伏笔/秘密/平行事实/约定/事实版本/事件线）
 *     · `item.revision += 1`            6 处
 *     · `history 幂等比对 + push + 截断` 5 处（前四本逐字相同，事实版本带归一化键）
 *     · `function text(v, max)`         6 处逐字相同
 *     · `function finite(v)`            6 处逐字相同
 *   同形重复的危险不是「不整洁」，而是同一口径有 6 份实现 —— 改一处漏五处。
 *   本版把契约收进 ledger-entity.js（挂 window.LonShaLedgerEntity），六本账只传各自的
 *   局部常量（MAX_HISTORY 各账不同：6/8/8/12/12）与领域归一化器。
 *
 * 等价性不是「看起来没变」：用 git HEAD 物化改前的六本账，对两棵树跑同一条
 *   40 步操作序列（建/改/幂等重放/终态/清扫/未定型读回），输出 38631 字节、
 *   同一 sha1、逐字节相同。故本版是**纯重构**。
 *
 * 顺带补上的一处「功能级失效」：`item.revision` 此前写进去但全仓零消费
 *   （没有任何调用点读它、没有测试锁它的数值）。index.js 自检面的「账本实体」一行
 *   把它变成真实读侧。本套件第 5 组钉住这条接线。
 *
 * 覆盖：
 *   0  版本锚（锁自己的出生版本，不随抬版上抬）+ 三源互等
 *   1  契约模块结构面（导出面 / REVISION 两位 / 边界纪律 / 挂全局）
 *   2  契约行为面（text / finite / names / revisionOf / bumpRevision）
 *   3  契约行为面（recordEvent 幂等+截断+floor 原样 / copyHistory / scanBook / line 只读）
 *   4  六本账委派面（取库块 + 逐账委派清单 + 反重复回潮）
 *   5  六本账行为面（各真调一次，revision 从 1 起、幂等重放不改、floor 原样戳）
 *   6  index.js 消费面（取库口 / 六本账清单 / 「账本实体」一行）
 *   7  manifest 声明与顺序（契约在 extra_js 首位，先于全部消费者）
 *   8  常驻门禁与负控制（真仓库 exit 0；负控制 exit 0 = 判据能红能绿）
 *   9  判据面自防护（断言密度 / 关键指纹不得缩水）
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const require = createRequire(import.meta.url);

const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf-8');
const idxSrc = read('index.js');
const manifest = JSON.parse(read('manifest.json'));

const CONTRACT = 'ledger-entity.js';
const BOOKS = ['seed-ledger.js', 'secret-ledger.js', 'parallel-ledger.js',
    'commitment-ledger.js', 'fact-version.js', 'event-completeness.js'];
/** 每本账该委派哪几处（与门禁 R2 的 NEEDS 同口径）。 */
const NEEDS = {
    'seed-ledger.js': ['LE.revisionOf(', 'LE.copyHistory(', 'LE.recordEvent('],
    'secret-ledger.js': ['LE.revisionOf(', 'LE.copyHistory(', 'LE.recordEvent('],
    'parallel-ledger.js': ['LE.revisionOf(', 'LE.copyHistory(', 'LE.recordEvent('],
    'commitment-ledger.js': ['LE.revisionOf(', 'LE.copyHistory(', 'LE.recordEvent('],
    'fact-version.js': ['LE.revisionOf(', 'LE.copyHistory(', 'LE.recordEvent('],
    // 事件线：segments 即它的历史容器（本账的领域形状），版本自增就地 → 只要求两处。
    'event-completeness.js': ['LE.revisionOf(', 'LE.bumpRevision(']
};

function vnum(s) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

let pass = 0;
const ok = (n) => { pass++; console.log('✓ ' + n); };

const LE = require(path.join(ROOT, CONTRACT));
const seed = require(path.join(ROOT, 'seed-ledger.js'));
const secret = require(path.join(ROOT, 'secret-ledger.js'));
const parallel = require(path.join(ROOT, 'parallel-ledger.js'));
const commitment = require(path.join(ROOT, 'commitment-ledger.js'));
const FV = require(path.join(ROOT, 'fact-version.js'));
const EC = require(path.join(ROOT, 'event-completeness.js'));

/* ══════════ 0. 版本锚 ══════════ */
test('v3207 0. 三源互等且不低于 3.207.0（锁自己的出生版本）', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.ok(vnum(v) >= vnum('3.207.0'), 'index.js 版本 ' + v + ' < 3.207.0');
    assert.equal(manifest.version, v, 'manifest.version 与 index.js 不一致');
    if (existsSync(path.join(ROOT, 'package.json'))) {
        assert.equal(JSON.parse(read('package.json')).version, v, 'package.json version 不一致');
    }
    ok('版本 ' + v + ' 三源互等');
});

/* ══════════ 1. 契约模块结构面 ══════════ */
test('v3207 1. 契约模块导出面 / REVISION 两位 / 边界纪律', () => {
    for (const k of ['text', 'finite', 'names', 'revisionOf', 'bumpRevision', 'recordEvent',
        'copyHistory', 'scanBook', 'line', 'REVISION', 'DEFAULT_BOX']) {
        assert.ok(LE[k] != null, '契约缺导出面 ' + k);
    }
    // 修订号两位：CREATE = 创建占位（尚未定型），MIN = 定型下界。
    assert.equal(LE.REVISION.CREATE, 0, 'CREATE 必须是 0（创建占位）');
    assert.equal(LE.REVISION.MIN, 1, 'MIN 必须是 1（定型下界）');
    assert.ok(Object.isFrozen(LE.REVISION), 'REVISION 必须冻结');
    assert.equal(LE.DEFAULT_BOX, 'items');
    // 挂全局（浏览器经典脚本按 manifest 顺序注入，消费者靠这个符号取契约）。
    const g = /** @type {any} */ (globalThis);
    assert.ok(g.LonShaLedgerEntity && typeof g.LonShaLedgerEntity.line === 'function',
        '契约未挂 globalThis.LonShaLedgerEntity');

    const src = read(CONTRACT);
    // 边界纪律：各账的局部差异不得被收进契约（收上来就看不见差异了）。
    assert.ok(!/MAX_HISTORY\s*=/.test(src), '契约内不得出现 MAX_HISTORY（各账 6/8/8/12/12 各不相同）');
    assert.ok(!/MAX_ITEMS\s*=/.test(src), '契约内不得出现 MAX_ITEMS（各账身份判据与容量不同）');
    assert.ok(!/\bnormalize\s*\(/.test(src) || !/function\s+normalize/.test(src),
        '契约不得收各账的 normalize（领域身份判据）');
    ok('契约导出面齐全、REVISION = {0, 1}、边界未被越界收编');
});

/* ══════════ 2. 契约行为面（读取原语） ══════════ */
test('v3207 2. text / finite / names / revisionOf / bumpRevision 行为', () => {
    assert.equal(LE.text('  a   b ', 10), 'a b', '空白归一');
    assert.equal(LE.text(null), '', 'null → 空串');
    assert.equal(LE.text('abcdef', 3), 'abc', '截断');
    assert.equal(LE.finite('12.7'), 12, '数值向下取整');
    assert.equal(LE.finite('x'), null, '非数值 → null');
    assert.equal(LE.finite(null), 0, '现行为忠实保留：Number(null) === 0（不是「缺省」）；账本的缺省由 copyItem 自己兜');
    assert.equal(LE.finite(undefined), null, 'undefined → NaN → null');

    assert.deepEqual(LE.names(['a', 'A', 'b'], 40, 8), ['a', 'b'], '大小写不敏感去重');
    assert.deepEqual(LE.names('甲、乙, 丙，丁', 40, 8), ['甲', '乙', '丙', '丁'], '三种分隔符');
    assert.deepEqual(LE.names(['甲', '乙', '丙'], 40, 2), ['甲', '乙'], 'maxCount 截断');
    assert.deepEqual(LE.names(null), []);

    // 读回：非法 / 缺省 / 创建占位一律定型为 MIN。
    assert.equal(LE.revisionOf({}), 1, '缺字段 → 1');
    assert.equal(LE.revisionOf({ revision: 0 }), 1, '创建占位 0 → 定型 1');
    assert.equal(LE.revisionOf({ revision: 7 }), 7, '已定型原样');
    assert.equal(LE.revisionOf(null), 1);
    // 现行为忠实保留：负数不是「创建占位」，旧写法 `finite(x) || 1` 会保留 -3（-3 为真）。
    //   这一点不当缺陷改掉 —— 改了就不是纯重构了；scanBook 把 < MIN 计为「未定型」来暴露它。
    assert.equal(LE.revisionOf({ revision: -3 }), -3, '负数按旧行为保留（真值）');
    const probe = { revision: 0 };
    LE.revisionOf(probe);
    assert.equal(probe.revision, 0, 'revisionOf 不得改入参');

    // 写入：在**原值**上 +1。这里钉住本版实测踩到的坑：
    //   若走 revisionOf 再 +1，创建占位 0 会被归一到 1、定型结果变成 2。
    const it = { revision: 0 };
    assert.equal(LE.bumpRevision(it), 1, '创建占位 0 → 定型必须是 1，不是 2');
    assert.equal(it.revision, 1);
    assert.equal(LE.bumpRevision(it), 2, '再改一次 → 2');
    assert.equal(LE.bumpRevision({}), 1, '缺字段按 0 起算');
    assert.equal(LE.bumpRevision(null), 1, '非对象返回 MIN 且不抛');
    ok('读取原语与 bumpRevision 的「原值 +1」语义');
});

/* ══════════ 3. 契约行为面（变更历史） ══════════ */
test('v3207 3. recordEvent / copyHistory / scanBook / line', () => {
    const a = { history: [], revision: 0 };
    assert.equal(LE.recordEvent(a, { eventKey: 'k1', floor: 5 }, { maxHistory: 3, stampFloor: true }), true);
    assert.equal(a.revision, 1, '入账即定型为 1');
    assert.equal(a.updatedFloor, 5, 'stampFloor 原样写入');
    assert.equal(a.history.length, 1);
    // 幂等：同 eventKey 重放 → 一个字都没改。
    assert.equal(LE.recordEvent(a, { eventKey: 'k1', floor: 9 }, { maxHistory: 3, stampFloor: true }), false);
    assert.equal(a.history.length, 1, '重放不入账');
    assert.equal(a.revision, 1, '重放不改版本');
    assert.equal(a.updatedFloor, 5, '重放不覆盖 updatedFloor');
    // 无 eventKey 的事件一律入账（各账的显式调用）。
    assert.equal(LE.recordEvent(a, { note: 'x' }, { maxHistory: 3 }), true);
    assert.equal(a.revision, 2);

    // floor 必须**原样**戳：finite(null) 得 0，会把「楼层未知」静默变成「第 0 楼」。
    const b = { history: [], revision: 0 };
    LE.recordEvent(b, { eventKey: 'n', floor: null }, { stampFloor: true });
    assert.ok('updatedFloor' in b, 'stampFloor 必须写入该键（哪怕是 null）');
    assert.equal(b.updatedFloor, null, 'floor 为 null 时 updatedFloor 必须是 null，不得被压成 0');
    const c = { history: [], revision: 0 };
    LE.recordEvent(c, { eventKey: 'u' }, { stampFloor: true });
    assert.equal(c.updatedFloor, undefined, '事件没带 floor → undefined（同样不得是 0）');

    // 截断：只留末 maxHistory 条。
    const d = { history: [], revision: 0 };
    for (let i = 0; i < 5; i++) LE.recordEvent(d, { eventKey: 'e' + i, i }, { maxHistory: 2 });
    assert.equal(d.history.length, 2, '按 maxHistory 截断');
    assert.deepEqual(d.history.map((e) => e.i), [3, 4], '留的是末两条');
    assert.equal(d.revision, 5);

    // prepare：入账前归一化（各账自带领域归一化器）。
    const e = { history: [], revision: 0 };
    LE.recordEvent(e, { eventKey: 'p', extra: 1 }, { prepare: (ev) => ({ eventKey: ev.eventKey }) });
    assert.equal(e.history[0].extra, undefined, 'prepare 生效');
    // 容器不是数组 → 不入账、不抛。
    assert.equal(LE.recordEvent({}, { eventKey: 'x' }, {}), false);
    assert.equal(LE.recordEvent(null, { eventKey: 'x' }, {}), false);

    const f = { history: [{ k: 1 }, { k: 2 }, { k: 3 }] };
    assert.deepEqual(LE.copyHistory(f, 2), [{ k: 2 }, { k: 3 }], '只取末 max 条');
    assert.equal(LE.copyHistory(f, 0).length, 3, 'max 非正 → 全量');
    assert.deepEqual(LE.copyHistory(f, 2, (ev) => ({ k: ev.k, z: 1 })), [{ k: 2, z: 1 }, { k: 3, z: 1 }],
        'copyEvent 逐条映射');
    assert.deepEqual(LE.copyHistory({}, 2), [], '缺 history → 空');
    assert.deepEqual(LE.copyHistory(null, 2), [], '不抛');

    assert.deepEqual(LE.scanBook({ items: [{ revision: 1 }, { revision: 2 }, { revision: 0 }, {}, { revision: 'x' }] }, 'items'),
        { total: 5, revisions: 3, unformed: 3 }, '三态计数：总数 / 修订合计 / 未定型');
    assert.deepEqual(LE.scanBook(null, 'items'), { total: 0, revisions: 0, unformed: 0 });
    assert.deepEqual(LE.scanBook({}, 'items'), { total: 0, revisions: 0, unformed: 0 });

    assert.equal(LE.line([]), '暂无账本条目');
    assert.equal(LE.line(null), '暂无账本条目', 'line(null) 不抛');
    assert.equal(LE.line([{ state: { items: [] }, box: 'items' }]), '暂无账本条目', '空账 → 暂无');
    const line = LE.line([{ label: '约定', state: { items: [{ revision: 1 }, { revision: 3 }, { revision: 0 }] }, box: 'items' }]);
    assert.ok(line.includes('条目 3'), 'line 报条目数：' + line);
    assert.ok(line.includes('修订合计 4'), 'line 报修订合计：' + line);
    assert.ok(line.includes('未定型 1'), 'line 报未定型数：' + line);
    // 「只创建未改过」的条目 revision 是 2（创建占位 0 定型 +1，创建时记一次事件再 +1）——
    //   这是**正常**状态，读数不得对它报警（此前写成 '被替代' + ⚠️ 是误报，实测后改掉）。
    assert.ok(!LE.line([{ state: { items: [{ revision: 2 }] }, box: 'items' }]).includes('未定型'),
        'revision=2 是正常态，不得计为未定型');
    // line 只读：不得改传进来的状态。
    const keep = { items: [{ revision: 1 }, { revision: 5 }] };
    LE.line([{ state: keep, box: 'items' }]);
    assert.deepEqual(keep, { items: [{ revision: 1 }, { revision: 5 }] }, 'line 不得改状态');
    assert.doesNotThrow(() => LE.line([{ state: null }]));
    assert.doesNotThrow(() => LE.line('nonsense'));
    ok('recordEvent 幂等+截断+floor 原样 / copyHistory / scanBook 三态 / line 只读');
});

/* ══════════ 4. 六本账委派面 ══════════ */
test('v3207 4. 六本账逐本委派契约，且被收走的写法不得回潮', () => {
    const LE_BLOCK = "const LE = (typeof window !== 'undefined' && window.LonShaLedgerEntity) ? window.LonShaLedgerEntity";
    for (const f of BOOKS) {
        const src = read(f);
        assert.ok(src.includes(LE_BLOCK), f + ' 缺取库块（未接契约真源）');
        assert.ok(src.includes('const text = LE.text') && src.includes('const finite = LE.finite'),
            f + ' 的 text/finite 未由契约提供');
        for (const needle of NEEDS[f]) {
            assert.ok(src.includes(needle), f + ' 未委派 ' + needle);
        }
        // 反重复：被收走的六份拷贝不得回潮。
        assert.ok(!/revision:\s*finite\(/.test(src), f + ' 回潮了 `revision: finite(`');
        assert.ok(!/\.revision\s*\+=\s*1/.test(src), f + ' 回潮了 `.revision += 1`');
        assert.ok(!/function\s+text\s*\(/.test(src), f + ' 回潮了本地 `function text(`');
        assert.ok(!/function\s+finite\s*\(/.test(src), f + ' 回潮了本地 `function finite(`');
        // 创建占位统一走 REVISION.CREATE（不再是裸 0 字面量）。
        assert.ok(src.includes('LE.REVISION.CREATE'), f + ' 的创建占位未走 LE.REVISION.CREATE');
    }
    ok('六本账全部委派契约，无一处回潮');
});

/* ══════════ 5. 六本账行为面 ══════════ */
test('v3207 5. 六本账真调一次：revision 落点与改前一致、幂等重放不改、floor 原样', () => {
    // revision 的落点是**实测**的，并且与 git HEAD 的改前版本逐字一致（本版是纯重构）：
    //   · 五本账的写入路径 = 创建（占位 0）→ copyItem 定型 +1 → record 再 +1 ⇒ 新条目 = **2**
    //     （「2」不是异常，是「已创建且被记录过一次事件」；此前的 0 是创建占位）
    //   · 事件线账创建时就地 bumpRevision 一次（无 record 面）⇒ 新事件 = **1**
    //   把 2 当成「应为 1 的 off-by-one」是本轮实测踩过的误判，这里显式钉住以免再判一次。
    const s1 = seed.plant(null, { hook: '抽屉里的旧信', layer: 'near', floor: 4, eventKey: 'p1' }).state;
    assert.equal(s1.items[0].revision, 2, 'seed 新建条目 revision = 2（创建定型 + 记一次事件）');
    assert.equal(s1.items[0].history.length, 1, '创建即记一次事件');
    assert.equal(s1.items[0].updatedFloor, 4, 'seed floor 原样');
    const s1b = seed.advance(s1, { id: s1.items[0].id, note: '她又看了一眼', floor: 6, eventKey: 'a1' }).state;
    assert.equal(s1b.items[0].revision, 3, '再改一次 → 3');
    // floor 缺失必须原样保留成 0（改前 copyItem 的 `finite(item.updatedFloor)` 行为，
    //   实测新旧一致）。不「顺手修掉」——改了就不是纯重构了。
    const s1c = seed.plant(null, { hook: '无楼层', eventKey: 'p2' }).state;
    assert.equal(s1c.items[0].updatedFloor, 0, '缺 floor 时 updatedFloor = 0（与改前逐字一致）');

    const s2 = secret.seal(null, { secret: '养女实为仇家之后', keeper: '阿绣' }).state;
    assert.equal(s2.items[0].revision, 2, 'secret 新建条目 revision = 2');
    const s3 = parallel.note(null, { title: '船期', fact: '货船改道', place: '外港' }).state;
    assert.equal(s3.items[0].revision, 2, 'parallel 新建条目 revision = 2');
    const s4 = commitment.open(null, { actor: '林夏', counterpart: '玩家', content: '周五归还借款', due: '周五', floor: 10, eventKey: 'e1' }).state;
    assert.equal(s4.items[0].revision, 2, 'commitment 新建条目 revision = 2');
    assert.equal(s4.items[0].updatedFloor, 10, 'commitment floor 原样');
    // 幂等重放：同一 eventKey 再开一次，条目数与版本都不动。
    const replayed = commitment.open(s4, { actor: '林夏', counterpart: '玩家', content: '周五归还借款', due: '周五', floor: 10, eventKey: 'e1' }).state;
    assert.equal(replayed.items.length, 1, '重放不得新增条目');
    assert.equal(replayed.items[0].revision, 2, '重放不得抬版本');
    // 真改一次 → 3（验证「原值 +1」在真账上也成立，不是只在契约单测里成立）。
    const advanced = secret.advance(s2, { secret: '养女实为仇家之后', progress: 30, floor: 2, note: '她翻出了旧照片' }).state;
    assert.equal(advanced.items[0].revision, 3, '改一次后 revision 应为 3');

    const s5 = FV.assertFact(FV.normalize(null), { subject: '她', predicate: '居住', value: '北京', from: 1, floor: 1 }).state;
    assert.equal(s5.facts[0].revision, 2, 'fact-version 新建事实 revision = 2');

    const s6 = EC.addSegment(EC.normalize(null), { title: '试炼', role: 'action', text: '她动身前往', floor: 2, eventKey: 'k' }).state;
    assert.equal(s6.events[0].revision, 1, 'event-completeness 新建事件 revision = 1（就地 bump 一次）');
    const s6b = EC.addSegment(s6, { title: '试炼', role: 'result', text: '到达', floor: 3, eventKey: 'k2' }).state;
    assert.equal(s6b.events[0].revision, 2, '再添一段 → 2');

    // line 能把六本账一起读出来（这正是 index.js 自检面消费的读数）。
    const line = LE.line([
        { label: '伏笔', state: s1, box: 'items' },
        { label: '秘密', state: s2, box: 'items' },
        { label: '事实', state: s5, box: 'facts' },
        { label: '事件', state: s6, box: 'events' }
    ]);
    assert.ok(line.includes('4/4 本'), 'line 应报 4/4 本：' + line);
    assert.ok(!line.includes('未定型'), '契约写出的账不得出现未定型条目：' + line);
    ok('六本账 revision 落点 2/2/2/2/2/1、幂等重放不改、floor 原样、line 可读');
});

/* ══════════ 6. index.js 消费面 ══════════ */
test('v3207 6. index.js 有取库口 / 六本账清单 / 「账本实体」真实读侧', () => {
    assert.ok(/function\s+_ledgerEntityLib\s*\(/.test(idxSrc), 'index.js 缺 _ledgerEntityLib 取库口');
    assert.ok(idxSrc.includes("_moduleLib(() => window.LonShaLedgerEntity, 'ledger-entity.js')"),
        '取库口未指向 window.LonShaLedgerEntity');
    assert.ok(/function\s+_ledgerBooks\s*\(/.test(idxSrc), 'index.js 缺六本账清单 _ledgerBooks');
    // 六本账清单必须与各账真实的状态字段 + 容器名成对（写错容器 ⇒ 读数恒为 0，且静默）。
    // 只在 `_ledgerBooks` 的源码段里取字段名再往后看容器名 —— 字段前缀形态有两种
    //   （`this.X` 与 `this.worldProg && this.worldProg.X`），按整串前缀匹配会漏掉后者。
    const booksAt = idxSrc.indexOf('function _ledgerBooks');
    assert.ok(booksAt > 0, 'index.js 里找不到 _ledgerBooks 定义');
    const booksSrc = idxSrc.slice(booksAt, idxSrc.indexOf('function', booksAt + 10));
    for (const pair of ['commitmentLedger|items', 'seedLedger|items', 'parallelLedger|items',
        'secretLedger|items', '_factVersionState|facts', '_eventThreadState|events']) {
        const [field, box] = pair.split('|');
        const at = booksSrc.indexOf(field);
        assert.ok(at >= 0, '_ledgerBooks 缺 ' + field);
        const seg = booksSrc.slice(at, at + 120);
        assert.ok(seg.includes("box: '" + box + "'"), '_ledgerBooks 的 ' + field + ' 容器名应为 ' + box + '，实为：' + seg.slice(0, 120));
    }
    assert.ok(idxSrc.includes("['账本实体'"), 'index.js 自检面缺「账本实体」一行');
    assert.ok(/LE\.line\(books\)/.test(idxSrc), '自检面未真正调用 LE.line(books)（只挂取库口不算接线）');
    ok('index.js 取库口 + 六本账清单 + 真实读侧');
});

/* ══════════ 7. manifest 声明与顺序 ══════════ */
test('v3207 7. 契约登记在 extra_js 首位，先于全部消费者', () => {
    const extra = manifest.extra_js;
    assert.ok(Array.isArray(extra) && extra.length > 0, 'extra_js 缺失');
    assert.equal(extra.indexOf(CONTRACT), 0, '契约必须是 extra_js[0]：经典脚本按序注入，消费者先跑就取不到契约');
    for (const f of BOOKS) {
        const at = extra.indexOf(f);
        assert.ok(at > 0, f + ' 未登记进 extra_js');
        assert.ok(at > extra.indexOf(CONTRACT), f + ' 排在契约之前');
    }
    ok('契约 @extra_js[0]，六本账全部在其后');
});

/* ══════════ 8. 常驻门禁与负控制 ══════════ */
test('v3207 8. 门禁在真仓库 exit 0，且负控制 exit 0（判据能红能绿）', () => {
    const gate = path.join(ROOT, 'tests', 'audit', 'scan_ledger_contract.mjs');
    const neg = path.join(ROOT, 'tests', 'audit', 'scan_ledger_contract_negctl.mjs');
    assert.ok(existsSync(gate), '缺门禁 scan_ledger_contract.mjs');
    assert.ok(existsSync(neg), '缺负控制 scan_ledger_contract_negctl.mjs');

    const g = spawnSync('node', [gate], { encoding: 'utf-8', cwd: ROOT });
    assert.equal(g.status, 0, '门禁在真仓库应 exit 0，实得 ' + g.status + '\n' + (g.stdout || '') + (g.stderr || ''));
    assert.ok((g.stdout || '').includes('消费者 6 本'), '门禁读数应报 6 本消费者：' + (g.stdout || ''));

    const n = spawnSync('node', [neg], { encoding: 'utf-8', cwd: ROOT });
    assert.equal(n.status, 0, '负控制应 exit 0（否则判据恒绿或归因不成立），实得 ' + n.status
        + '\n' + (n.stdout || '') + (n.stderr || ''));
    assert.ok((n.stdout || '').includes('V0-原版对照'), '负控制应含 V0 原版对照：' + (n.stdout || ''));
    ok('门禁 exit 0（6 本消费者）+ 负控制 exit 0（真源码破坏逐组翻红）');
});

/* ══════════ 9. 判据面自防护 ══════════ */
test('v3207 9. 判据面自防护：断言密度与关键指纹不得缩水', () => {
    const asserts = (SELF.match(/assert\./g) || []).length;
    assert.ok(asserts >= 60, '本套件断言数 ' + asserts + ' 少于 60：判据被稀释');
    const lines = SELF.split('\n').length;
    assert.ok(lines >= 240, '本套件行数 ' + lines + ' 少于 240：判据面被抽薄');
    for (const fp of [CONTRACT, 'revisionOf', 'bumpRevision', 'recordEvent', 'copyHistory',
        'scanBook', 'LE.line(books)', 'LE.REVISION.CREATE', 'scan_ledger_contract.mjs',
        'scan_ledger_contract_negctl.mjs', 'updatedFloor']) {
        assert.ok(SELF.includes(fp), '关键指纹缺失：' + fp);
    }
    // 六本账文件数与委派表条目数必须成对（新增账本时这里是显式登记点）。
    assert.equal(BOOKS.length, 6, '账本清单应为本版事实的 6 本');
    assert.equal(Object.keys(NEEDS).length, 6, '委派表必须与账本清单逐本对应');
    for (const f of BOOKS) assert.ok(NEEDS[f] && NEEDS[f].length >= 2, '委派表缺 ' + f);
    ok('断言 ' + asserts + ' 条 / ' + lines + ' 行，指纹齐全');
});
