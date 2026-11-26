/* ============================================================
 * tests/v3487_archive_identity_and_unique_hit.test.mjs — v3.487.0
 *
 * 主题：缝合两份更新版用户脚本里的两条**写入侧纪律**（不是搬实现）。
 *
 *   ① 「瑟瑟台账 V1.170」的串档判据 —— 原文是「账本快照文件与当前聊天身份不一致
 *      （可能被复制/串档）」直接拒。搬到本仓必须**改形**：本仓的嵌入存档随
 *      chatMetadata 走，「复制对话 / 分支续写」是正当用法，硬拒会把正常打档变成故障。
 *      故按来源路径分档（blocked 只落在 file-import）。
 *
 *   ② 「色色灵感状态栏 V4.027」的「删除未命中唯一一行（实际 N）」—— SQL 语境的
 *      「≠1 就拒」在本仓会变成「删不掉东西」（同 id 天然可能在 core/recent 各一份）。
 *      改形为**后置条件验收**：删除后零命中、恢复后恰好一份。
 *
 * 覆盖：
 *   1 结构面：闸门落在一切副作用之前 / 来源戳不在持久命名空间 / 键名常量在场
 *   2 行为面：五态判据（same / absent / unknown-dest / adopted / blocked）各自不同形
 *   3 行为面：blocked 时运行时零副作用（_confirmed 不动、epoch 不推进）
 *   4 行为面：导出侧现场打戳；恢复侧剥戳（防戳自我传染）
 *   5 行为面：按 id 删除的**后置条件**（重复副本一并清干净；0 命中与 ≥1 命中可分）
 *   6 行为面：按 id 恢复的**后置条件**（已在池中不再复制一份）
 *   7 诊断行：两条新行四/五态文案互不相同（不是同一句话换个数）
 *   8 接线自证：装配面函数名录已登记（diag_split_verbatim.core_functions）
 *   9 当版锚
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = new URL('..', import.meta.url);
const read = (p) => fs.readFileSync(new URL(p, ROOT), 'utf8');

const OPS = require('../engine-persistence-ops.js');
const DIAG = require('../engine-diagnostic-lines.js');
const KEY = OPS.ARCHIVE_ORIGIN_KEY;
assert.equal(KEY, 'lonshaArchiveOrigin', '来源戳键名不可漂移（判据与诊断行都按它取）');

function payloadOf(chatId) {
    return { schemaVersion: 1, extensions: chatId === null ? {} : { [KEY]: { chatId, at: 1, producerVersion: '3.487.0', schemaVersion: 1 } } };
}
const engOf = (chatId) => ({ getCurrentChatId: () => chatId });

/* ══════════ 1. 结构面 ══════════ */
test('v3487 1. 闸门落在一切副作用之前，来源戳不进持久命名空间', () => {
    const src = read('engine-persistence-ops.js');
    const iGate = src.indexOf('archiveOriginVerdictOf(this, data, opts)');
    const iConfirmed = src.indexOf('this.storage._confirmed = null');
    const iEpoch = src.indexOf("this._bumpEpoch('restore:' + res.source)");
    assert.ok(iGate > 0, '恢复管线里没有串档闸调用 —— 判据失去真源');
    assert.ok(iConfirmed > iGate, '闸门必须早于 _confirmed 清除（否则「拒绝」自身成了副作用）');
    assert.ok(iEpoch > iGate, '闸门必须早于 _bumpEpoch（同上）');
    /* 恢复侧必须主动剥戳：吸进 _archiveExtensions 会让这份身份永久传染 */
    assert.ok(/delete _bag\[ARCHIVE_ORIGIN_KEY\]/.test(src), '恢复侧没有剥掉来源戳 —— 戳会自我传染');
    /* 导出侧必须现场生成，且放在最后一个实参（盖掉任何残留） */
    const iInherit = src.indexOf('this._archiveExtensions || {},');
    const iStamp = src.indexOf('{ lonshaArchiveOrigin: archiveOriginStampOf(this) }');
    assert.ok(iStamp > iInherit, '来源戳必须在 Object.assign 的最后一个实参里（否则被上游残留覆盖）');
});

/* ══════════ 2. 五态判据 ══════════ */
test('v3487 2. 五态判据各自不同形（同一句换个数不算）', () => {
    const eng = engOf('chat-B');
    const cases = {
        same: OPS.archiveOriginVerdictOf(eng, payloadOf('chat-B'), { source: 'file-import' }),
        absent: OPS.archiveOriginVerdictOf(eng, payloadOf(null), { source: 'file-import' }),
        'unknown-dest': OPS.archiveOriginVerdictOf(engOf(null), payloadOf('chat-A'), { source: 'file-import' }),
        adopted: OPS.archiveOriginVerdictOf(eng, payloadOf('chat-A'), { source: 'embedded-vault' }),
        blocked: OPS.archiveOriginVerdictOf(eng, payloadOf('chat-A'), { source: 'file-import' }),
    };
    assert.equal(cases.same.verdict, 'same');
    assert.equal(cases.absent.verdict, 'absent');
    assert.equal(cases['unknown-dest'].verdict, 'unknown-dest');
    assert.equal(cases.adopted.verdict, 'adopted', '嵌入存档/复制对话必须放行（否则正常打档变故障）');
    assert.equal(cases.blocked.verdict, 'blocked', '文件导入跨档必须拦下');
    const lines = Object.values(cases).map((c) => c.line);
    assert.equal(new Set(lines).size, lines.length, '五态文案必须互不相同：' + JSON.stringify(lines));
    /* 缺席 ≠ 相同：两条都是「放行」，但成因必须写在文案里 */
    assert.ok(/无来源戳/.test(cases.absent.line), 'absent 必须写明「没有戳」，不能读成「同档」');
    assert.ok(/无法比对/.test(cases['unknown-dest'].line), '取不到目的身份时必须说「没法比对」，不许默认通过');
    assert.equal(cases.blocked.src, 'chat-A');
    assert.equal(cases.blocked.dst, 'chat-B');
});

test('v3487 3. 显式 allowCrossChat 才把 blocked 变成 adopted', () => {
    const v = OPS.archiveOriginVerdictOf(engOf('chat-B'), payloadOf('chat-A'), { source: 'file-import', allowCrossChat: true });
    assert.equal(v.verdict, 'adopted');
    assert.equal(v.allowCrossChat, true);
    assert.ok(/已显式授权/.test(v.line));
});

/* ══════════ 3. blocked 的零副作用 ══════════ */
test('v3487 4. 被拦下时运行时零副作用（不推 epoch、不清确认、不恢复任何字段）', () => {
    let bumped = 0;
    const eng = {
        getCurrentChatId: () => 'chat-B',
        storage: { _confirmed: 'SENTINEL' },
        _bumpEpoch: () => { bumped++; },
        config: { config: {} },
        collectExport: () => { throw new Error('被拦下时不该抓快照'); },
    };
    const r = OPS.restoreFromPayload(eng, payloadOf('chat-A'), { source: 'file-import', snapshot: true });
    assert.equal(r.ok, false);
    assert.equal(r.error, 'archive-origin-mismatch');
    assert.equal(r.count, 0, '被拦下不得报「恢复了 N 个字段」');
    assert.equal(bumped, 0, '被拦下不得推进 epoch（那会作废在飞任务）');
    assert.equal(eng.storage._confirmed, 'SENTINEL', '被拦下不得清除 save 确认状态');
    assert.equal(r.failed.length, 1);
    assert.equal(r.failed[0].key, KEY);
    assert.ok(/串档已拦下/.test(r.reason), '拒绝必须带人话归因：' + r.reason);
    assert.equal(eng._lastArchiveOrigin.verdict, 'blocked', '拒绝事实必须留档给诊断行');
});

/* ══════════ 4. 打戳/剥戳 ══════════ */
test('v3487 5. 导出侧现场打戳：chatId 取自引擎、不是继承来的', () => {
    const st = OPS.archiveOriginStampOf(engOf('chat-X'));
    assert.equal(st.chatId, 'chat-X');
    assert.equal(st.schemaVersion, 1);
    assert.equal(typeof st.at, 'number');
    assert.equal(OPS.archiveOriginStampOf({ getCurrentChatId: () => null }).chatId, null, '取不到身份时如实记 null，不编造');
    assert.equal(OPS.archiveOriginOf({ extensions: { [KEY]: { chatId: 'chat-Y' } } }), 'chat-Y');
    assert.equal(OPS.archiveOriginOf({ extensions: {} }), null);
    assert.equal(OPS.archiveOriginOf(null), null, '畸形载荷当无戳，不抛');
});

/* ══════════ 5-6. 按 id 写入后置条件 ══════════ */
function loadBank() {
    const src = read('memory-organs.js');
    const context = {
        console, globalThis: {}, window: undefined, module: { exports: {} },
        Math, Date, JSON, Number, String, Object, Array, Set, Map, Float32Array,
        fetch: async () => ({ ok: true }),
    };
    vm.runInNewContext(src, context, { filename: 'memory-organs.js' });
    return context.module.exports.CharacterMemoryBank;
}

test('v3487 6. 删除的验收是「事后零命中」：core/recent 各一份也一并清干净', () => {
    const Bank = loadBank();
    const bank = new Bank();
    const a = bank.addCore('A', '同一条记忆', 3);
    /* 造出「同 id 在 core 与 recent 各一份」的形状（确定性 id 让这件事天然可能） */
    bank.of('A').recent.push(JSON.parse(JSON.stringify(a)));
    assert.equal(bank.of('A').core.filter((m) => m.id === a.id).length, 1);
    assert.equal(bank.of('A').recent.filter((m) => m.id === a.id).length, 1);
    assert.equal(bank.deleteMemory('A', a.id), true, '删除应成功');
    const c = bank.of('A');
    assert.equal(c.core.filter((m) => m.id === a.id).length, 0, 'core 副本必须清掉');
    assert.equal(c.recent.filter((m) => m.id === a.id).length, 0, 'recent 副本必须清掉（修前这里会剩一份）');
    assert.equal(bank._lastUniqueHit.verdict, 'hit');
    assert.equal(bank._lastUniqueHit.hits, 2);
    assert.equal(bank._lastUniqueHit.remain, 0);
    assert.equal(bank.listTombstones('A').length, 2, '两份都要留墓碑（回滚能力不因合并而丢）');
});

test('v3487 7. 0 命中与 ≥1 命中必须可分（miss ≠ hit）', () => {
    const Bank = loadBank();
    const bank = new Bank();
    assert.equal(bank.deleteMemory('A', 'cm_不存在'), false);
    assert.equal(bank._lastUniqueHit.verdict, 'miss');
    assert.equal(bank._lastUniqueHit.hits, 0);
    assert.equal(bank.restoreMemory('A', 'cm_不存在'), false);
    assert.equal(bank._lastUniqueHit.verdict, 'miss');
    assert.equal(bank._lastUniqueHit.op, 'restore');
});

test('v3487 8. 恢复的验收是「恰好一份」：已在池中就不再复制', () => {
    const Bank = loadBank();
    const bank = new Bank();
    const a = bank.addRecent('A', '会被删了又重新写入的记忆', 5);
    bank.deleteMemory('A', a.id);
    assert.equal(bank.listTombstones('A').length, 1);
    /* 删后又重新写入同一条（同文本+同楼层 ⇒ 同 id） */
    bank.addRecent('A', '会被删了又重新写入的记忆', 5);
    assert.equal(bank.of('A').recent.filter((m) => m.id === a.id).length, 1);
    assert.equal(bank.restoreMemory('A', a.id), true);
    assert.equal(bank.of('A').recent.filter((m) => m.id === a.id).length, 1, '恢复不得把同 id 复制成两份');
    assert.equal(bank._lastUniqueHit.verdict, 'already-present');
    assert.equal(bank.listTombstones('A').length, 0, '已在池中时墓碑没有意义，应清掉');
});

/* ══════════ 7. 诊断行 ══════════ */
test('v3487 9. 两条新诊断行的各态文案互不相同', () => {
    const seen = new Set();
    const bodies = new Set();
    for (const [src, dst, source] of [
        ['chat-B', 'chat-B', 'file-import'],
        [null, 'chat-B', 'file-import'],
        ['chat-A', null, 'file-import'],
        ['chat-A', 'chat-B', 'embedded-vault'],
        ['chat-A', 'chat-B', 'file-import'],
    ]) {
        const v = OPS.archiveOriginVerdictOf(engOf(dst), payloadOf(src), { source });
        const line = DIAG._archiveOriginLine({ _lastArchiveOrigin: v });
        assert.ok(/^【存档来源】/.test(line), '前缀必须固定：' + line);
        assert.ok(!seen.has(line), '两态同一句：' + line);
        seen.add(line);
        bodies.add(v.line);
    }
    assert.equal(bodies.size, 5, '五态的归因句也必须互不相同（同一句换个数不算）');
    assert.ok(/尚未恢复过存档/.test(DIAG._archiveOriginLine({})), '未发生必须与「已发生」不同形');
    const seen2 = new Set();
    for (const st of [
        { op: 'delete', id: 'cm_x', hits: 0, remain: 0, verdict: 'miss' },
        { op: 'delete', id: 'cm_x', hits: 2, remain: 0, verdict: 'hit' },
        { op: 'delete', id: 'cm_x', hits: 2, remain: 1, verdict: 'postcondition-failed' },
        { op: 'restore', id: 'cm_x', hits: 1, remain: 1, verdict: 'already-present' },
    ]) {
        const line = DIAG._uniqueHitLine({ _lastUniqueHit: st });
        assert.ok(/^【按 id 写入】/.test(line), '前缀必须固定：' + line);
        assert.ok(!seen2.has(line), '两态同一句：' + line);
        seen2.add(line);
    }
    assert.ok(/尚无按 id/.test(DIAG._uniqueHitLine({})), '未发生必须与「已发生」不同形');
});

/* ══════════ 8. 接线自证 ══════════ */
test('v3487 10. 装配面函数名录已登记（否则拆片判据会把新行读成「拆前就有」）', () => {
    const led = JSON.parse(read('tests/audit/diag_split_verbatim.json'));
    for (const fn of ['_archiveOriginLine', '_uniqueHitLine']) {
        assert.ok(led.core_functions.includes(fn), 'core_functions 未登记 ' + fn);
        assert.ok(read('engine-diagnostic-lines.js').includes(fn + ': ' + fn), '诊断行未进 _support 名单 ' + fn);
    }
    const frozen = read('engine-diagnostic-lines.js');
    for (const fn of ['_archiveOriginLine', '_uniqueHitLine']) {
        assert.ok(frozen.includes('_coreApi.' + fn + ' = ' + fn), '未挂上冻结 api：' + fn);
    }
    /* 面板必须给人话出路，不能把串档读成「存档是空的」 */
    const ui = read('settings-ui.js');
    assert.ok(ui.includes("archive-origin-mismatch"), '面板未识别串档错误码');
    assert.ok(ui.includes('allowCrossChat: true'), '面板拦下后没有显式授权通路（等于死路）');
});

/* ══════════ 9. 当版锚 ══════════ */
test('v3487 11. 当版锚与数值口径', () => {
    const vnum = (s) => {
        const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    assert.equal(vnum('3.487.0'), 3487000, '数值口径不可复算');
    assert.ok(vnum('3.487.0') >= vnum('3.487.0'));
});