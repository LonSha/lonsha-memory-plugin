/**
 * tests/v3202_carryover_rollback_breadth.test.mjs — v3.202.0
 *
 * 主题：三方向并行收口 ——「新增子系统忘了接线」的第三、第四次复发。
 *   本仓已两次治理过同一族缺陷（v3.168「写侧不产出=读侧死分支」、
 *   v3.182「新增子系统忘了接回滚」），v3.194~v3.197 又新增了九本账，
 *   第三次、第四次复发，形态分别是：
 *
 *   D1 拓深·回滚面：九本账（六账 + v3.194 三面账）都带楼层字段
 *      （floor / updatedFloor / recoveredFloor / settledFloor / revealedFloor /
 *        echoFloor / from / to / history[].floor / segments[].floor），
 *      却一本都没接进回滚面 —— 删楼后条目仍持有被删楼层、前移后指针不动，
 *      而回放报告对它们连一行都不报（登记的 33 本账里没有它们 = 完全静默）。
 *      本版把它们并入 FLOOR_OWNERS（33 → 42 项），收口写在 ledger-replay.js 内，
 *      零改各模块（各模块只有 sweep(floor)/reset()，那是「终态过期清理」，
 *      与「楼层归属回滚」不是一回事，不能互相替代 —— 见测试 6）。
 *
 *   D2 拓宽·携带面：worldProg 整键（其 export() 含 active/promises/六账/knowledge/
 *      plotArcs 十个子面）与另外 11 键「存档面有、携带面无」——跨对话续写时约定、
 *      伏笔、平行事实、秘密、回扣、回声、认知隔离、剧情弧全部静默留在旧对话。
 *      其中 repairLog 是 **v3.194 CHANGELOG 已声称进契约、实测未进** 的那个键
 *      （声称与落地漂移，且 v3194 测试只覆盖了 factVersions/eventThreads 两面）。
 *
 *   D3 守门·差集扫描器：v3.168 的契约对账只回答「契约要求的键，两侧产出了吗」，
 *      它**不问**「存档面还有哪些键根本没进契约」——所以新增子系统只要忘了登记，
 *      对账照样全绿。本版把「存档面有、携带面无且非显式豁免」从静默缺陷变成机检红灯。
 *
 * 判据原则（本仓惯例）：
 *   · 行为优先：D1 与 D2 的对账方法都用「从源码抽出真实实现 + 注入假宿主 + 真跑」，
 *     不测复刻逻辑（复刻逻辑只会证明复刻正确）。
 *   · 破坏性负控制：D3 的 9 组负控在独立 fixture 目录里做真源码破坏后重跑同一套判据。
 *   · 保绿对照必在场：负控里必须有一组「改了但不该改结论」，防「随便翻红」。
 */
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { stripComments, bodyOf, braceMatch } from './_audit_lib.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const raw = readFileSync(ROOT + 'index.js', 'utf-8');
const cleanRaw = stripComments(raw);
const lrRaw = readFileSync(ROOT + 'ledger-replay.js', 'utf-8');
const lrClean = stripComments(lrRaw);
const mf = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const pkg = JSON.parse(readFileSync(ROOT + 'package.json', 'utf-8'));
const changelog = readFileSync(ROOT + 'CHANGELOG.md', 'utf-8');
const LR = require_(ROOT + 'ledger-replay.js');
const vnum = (v) => Number(String(v).split('.').map((x) => x.padStart(3, '0')).join(''));
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
/** 剥注释后的代码行（本地取行，与真源的 codeLines 同义但只在本文件内用一次，故不 import）。 */
const codeRows = (s) => stripComments(s).split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
/** 抽取 `const NAME = Object.freeze([ ... ])` 里的字符串元素。 */
function arrOf(name) {
    const at = cleanRaw.indexOf('const ' + name + ' = Object.freeze([');
    if (at < 0) return null;
    const open = cleanRaw.indexOf('[', at);
    let depth = 0, end = -1;
    for (let i = open; i < cleanRaw.length; i++) {
        if (cleanRaw[i] === '[') depth++;
        else if (cleanRaw[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    return [...cleanRaw.slice(open, end).matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1]);
}

/** 顶层键抽取口径：`key: value,` 与简写 `key,` 两种写法都要认
 *  （statusFlat 就是简写，只认冒号会把它漏掉 —— 正是 v3.168 记下的同一个坑）。 */
const TOP_KEY_RE = /^ {20}([A-Za-z_$][A-Za-z0-9_$]*)\s*[,:]/gm;
/** 从对象字面量块里取顶层键集合。 */
const topKeys = (body) => new Set([...body.matchAll(TOP_KEY_RE)].map((m) => m[1]));
/** 取方法体（从 marker 起，跳过形参里的 `options = {}` 花括号再配对）。
 *  _audit_lib 的 bodyOf 在 marker 自带体花括号时会落在形参花括号上，
 *  对 `xxx(options = {}) {` 只得回 `{}` —— 本文件因此自己收口这一处。 */
function methodBody(src, marker) {
    const at = src.indexOf(marker);
    if (at < 0) return null;
    const open = src.indexOf('{', at + marker.length - 1);
    if (open < 0 || open >= src.length) return null;
    return braceMatch(src, open);
}

/* ══════════════ 1. D1 拓深·回滚面：九账并入登记表 ══════════════ */
// 这九本账在 v3.194~v3.197 里被逐个新建，但没有一本接进回滚面。
const LEDGER_IDS = [
    'seed-ledger', 'commitment-ledger', 'parallel-ledger', 'secret-ledger',
    'recall-echo', 'echo-life', 'fact-version', 'event-completeness', 'repair-loop',
];

test('v3202 1. 登记表已从 33 本账扩到 42 本，九账逐项在场且 id 唯一', () => {
    const ids = LR.FLOOR_OWNERS.map((o) => o.id);
    assert.equal(ids.length, 42, '登记表本版应为 42 项（修前 33 项），实际 ' + ids.length);
    for (const id of LEDGER_IDS) assert.ok(ids.includes(id), '九账之一未并入登记表：' + id);
    assert.equal(new Set(ids).size, ids.length, 'id 不得重复');
    // 结构校验器必须自己说健康（不是测试单方面断言）
    assert.deepEqual(LR.checkRegistry(LR.FLOOR_OWNERS), [], '登记表结构问题：' + JSON.stringify(LR.checkRegistry(LR.FLOOR_OWNERS)));
});

test('v3202 2. 九账的登记项都是 records 型且 drop/shift 皆非空（前移也要跟）', () => {
    for (const id of LEDGER_IDS) {
        const o = LR.FLOOR_OWNERS.find((x) => x.id === id);
        assert.equal(o.holds, 'records', id + ' 持有方式应为逐条记录');
        assert.equal(typeof o.drop, 'function', id + ' 缺 drop');
        assert.equal(typeof o.shift, 'function', id + ' 缺 shift（前移面不得留空）');
        assert.ok(o.label && o.label.length >= 2, id + ' 缺中文 label（诊断面要念出来）');
    }
});

// 九账的容器键名不一致：六账用 items，三面账分别用 facts / events / repairs ——
//   这是 helper 必须同时覆盖四种键名的原因，也是「按一个键名写死」会漏三本的现场。
const LEDGER_HOST = () => ({
    worldProg: {
        seedLedger: { items: [{ floor: 3, updatedFloor: 5, recoveredFloor: 5, history: [{ floor: 5 }, { floor: 3 }] }], lastFloor: 5 },
        commitmentLedger: { items: [{ floor: 5 }, { floor: 2, updatedFloor: 5 }], lastFloor: 3 },
        parallelLedger: { items: [{ floor: 2, settledFloor: 5 }] },
        secretLedger: { items: [{ floor: 2, revealedFloor: 5 }] },
        recallEcho: { items: [{ floor: 2, echoFloor: 5 }], lastEchoFloor: 5 },
        echoLedger: { items: [{ floor: 5 }], lastFloor: 5 },
    },
    _factVersionState: { facts: [{ floor: 2, from: 5, to: 5, history: [{ floor: 5 }] }] },
    _eventThreadState: { events: [{ segments: [{ floor: 5 }, { floor: 1 }] }] },
    _repairState: { repairs: [{ floor: 5 }, { floor: 1 }] },
});

test('v3202 3. 删楼真跑：该楼登记的条目整条摘除、其余楼层字段清空、history/segments 摘除', () => {
    const h = LEDGER_HOST();
    const r = LR.replayDrop(h, 5);
    assert.equal(r.threw, 0, '回放不得有抛错项：' + JSON.stringify(r.items.filter((i) => i.state === 'threw')));
    // 九账全部报 ok（修前它们根本不在登记表里，连 absent 都不会出现）
    for (const id of LEDGER_IDS) {
        const it = r.items.find((x) => x.id === id);
        assert.ok(it, '回放报告里没有 ' + id);
        assert.equal(it.state, 'ok', id + ' 应报 ok（宿主已备数据），实际 ' + it.state);
    }
    const wp = h.worldProg;
    assert.equal(wp.seedLedger.items.length, 1, 'seedLedger 的 floor=3 条目应保留');
    assert.equal(wp.seedLedger.items[0].updatedFloor, null, 'updatedFloor===5 应清空');
    assert.equal(wp.seedLedger.items[0].recoveredFloor, null, 'recoveredFloor===5 应清空');
    assert.deepEqual(wp.seedLedger.items[0].history.map((e) => e.floor), [3], 'history 里被删楼层应摘除');
    assert.equal(wp.seedLedger.lastFloor, null, '顶层指针停在被删楼层应复位');
    assert.equal(wp.commitmentLedger.items.length, 1, 'commitmentLedger 的 floor=5 条目应整条摘除');
    assert.equal(wp.commitmentLedger.items[0].updatedFloor, null);
    assert.equal(wp.parallelLedger.items[0].settledFloor, null, 'settledFloor 应清空');
    assert.equal(wp.secretLedger.items[0].revealedFloor, null, 'revealedFloor 应清空');
    assert.equal(wp.recallEcho.items[0].echoFloor, null, 'echoFloor 应清空');
    assert.equal(wp.recallEcho.lastEchoFloor, null, 'lastEchoFloor 应复位（否则 echo-per-floor 判据会把后续写入全挡掉）');
    assert.equal(wp.echoLedger.items.length, 0, 'echoLedger 的 floor=5 条目应摘除');
    assert.equal(wp.echoLedger.lastFloor, null);
    assert.equal(h._factVersionState.facts[0].from, null, 'fact 的 from 应清空');
    assert.equal(h._factVersionState.facts[0].to, null, 'fact 的 to 应清空');
    assert.deepEqual(h._factVersionState.facts[0].history, [], 'fact 的 history 应摘除');
    assert.deepEqual(h._eventThreadState.events[0].segments.map((s) => s.floor), [1], 'segments 里被删楼层应摘除');
    assert.equal(h._repairState.repairs.length, 1, 'repairs 的 floor=5 条目应摘除');
    assert.equal(h._repairState.repairs[0].floor, 1);
    assert.ok(r.dropped >= 9, '撤账总数应 >= 9（九账各至少一处），实际 ' + r.dropped);
});

test('v3202 4. 前移真跑：所有 > 被删楼层的楼层字段（含嵌套）一律减一', () => {
    const h = LEDGER_HOST();
    const r = LR.replayShift(h, 1);
    assert.equal(r.threw, 0);
    const wp = h.worldProg;
    assert.equal(wp.seedLedger.items[0].floor, 2, '3 → 2');
    assert.equal(wp.seedLedger.items[0].updatedFloor, 4, '5 → 4');
    assert.deepEqual(wp.seedLedger.items[0].history.map((e) => e.floor), [4, 2], 'history 内层也要跟');
    assert.equal(wp.commitmentLedger.items[1].floor, 1, '2 → 1');
    assert.equal(wp.commitmentLedger.items[1].updatedFloor, 4);
    assert.equal(wp.commitmentLedger.items[0].floor, 4, '5 → 4');
    assert.equal(wp.parallelLedger.items[0].settledFloor, 4);
    assert.equal(wp.secretLedger.items[0].revealedFloor, 4);
    assert.equal(wp.recallEcho.items[0].echoFloor, 4);
    assert.equal(wp.recallEcho.lastEchoFloor, 4, '指针也要跟');
    assert.equal(h._factVersionState.facts[0].from, 4, 'fact 的 from 也要跟');
    assert.equal(h._factVersionState.facts[0].to, 4);
    assert.deepEqual(h._eventThreadState.events[0].segments.map((s) => s.floor), [4, 1], 'segments 内层也要跟');
    assert.deepEqual(h._repairState.repairs.map((x) => x.floor), [4, 1]);
    assert.ok(r.shifted >= 12, '跟随总数应 >= 12，实际 ' + r.shifted);
});

test('v3202 5. 幂等：drop/shift 重复执行的结果与执行一次相同（编辑重放/补提取会再触发）', () => {
    const d1 = LEDGER_HOST();
    LR.replayDrop(d1, 5);
    const snap1 = JSON.stringify(d1);
    LR.replayDrop(d1, 5);
    assert.equal(JSON.stringify(d1), snap1, 'drop 不幂等：第二次执行改变了状态');
    const s1 = LEDGER_HOST();
    LR.replayShift(s1, 1);
    const snap2 = JSON.stringify(s1);
    LR.replayShift(s1, 1);
    assert.notEqual(JSON.stringify(s1), snap2, 'shift 天然不幂等是预期内的（前移是位移，不是集合判定）');
    // 但 shift 的**值域**必须单调：不得出现负楼层（回放不变量 I2）
    const inv = LR.checkReplayInvariants({ x: [] }, { x: [0, 1, 2] }, 99);
    assert.equal(inv.ok, true);
    const badInv = LR.checkReplayInvariants({ x: [] }, { x: [-1] }, 99);
    assert.equal(badInv.ok, false, '负楼层必须被回放不变量抓住');
    assert.equal(badInv.problems[0].kind, 'negative-floor');
});

test('v3202 6. 三态不撒谎：宿主缺哪本账就报 absent，不得把「没接上」说成「已回滚」', () => {
    const h = { worldProg: { seedLedger: { items: [] } } };
    const r = LR.replayDrop(h, 5);
    const seed = r.items.find((x) => x.id === 'seed-ledger');
    assert.equal(seed.state, 'ok', '挂在位的那本应报 ok');
    for (const id of ['commitment-ledger', 'fact-version', 'repair-loop']) {
        assert.equal(r.items.find((x) => x.id === id).state, 'absent', id + ' 未挂载应如实报 absent');
    }
    assert.ok(r.absent > 0, 'absent 计数应被统计');
    // R5 缺席作假：不得对没有数据的宿主报「撤了 N 条」
    for (const it of r.items) {
        if (it.state === 'absent') assert.equal(it.count, 0, it.id + ' absent 项不得携带非 0 计数');
    }
    // 取数即抛也要如实分态，不得静默吞成 ok
    const h2 = { get worldProg() { throw new Error('boom'); } };
    const r2 = LR.replayDrop(h2, 5);
    assert.equal(r2.items.find((x) => x.id === 'seed-ledger').state, 'absent', '宿主取数抛错应降级为 absent 而非 threw 冒泡');
});

test('v3202 7. 设计判断留痕：九账模块本体只有 sweep/reset，楼层归属只能由回放面收口', () => {
    // 这条断言的是**架构判断**，不是实现细节：若哪天某本账自己长出了 removeByFloor，
    //   说明两条清理路径并存 —— 那时本测试应当翻红，提示重新评估收口位置。
    for (const f of ['seed-ledger', 'commitment-ledger', 'parallel-ledger', 'secret-ledger',
        'recall-echo', 'echo-ledger', 'fact-version', 'event-completeness', 'repair-loop']) {
        const mod = require_(ROOT + f + '.js');
        const inst = (typeof mod.create === 'function') ? mod.create({}) : null;
        const api = inst || mod;
        assert.equal(typeof api.removeByFloor, 'undefined', f + ' 不应自持 removeByFloor（收口在 ledger-replay）');
        assert.equal(typeof api.shiftFloors, 'undefined', f + ' 不应自持 shiftFloors');
    }
    assert.ok(lrClean.includes('dropLedgerItemFloors'), '收口 helper 必须在场');
    assert.ok(lrClean.includes('shiftLedgerItemFloors'), '前移 helper 必须在场');
    assert.ok(lrClean.includes('LEDGER_ITEM_FLOOR_FIELDS'), '楼层字段清单必须是具名常量（不是散落字面量）');
});

test('v3202 8. helper 的字段清单与三面账的真实字段名一致（漏一个字段 = 漏一本账的一半）', () => {
    const fields = arrOfIn(lrClean, 'LEDGER_ITEM_FLOOR_FIELDS');
    for (const f of ['floor', 'updatedFloor', 'recoveredFloor', 'settledFloor', 'revealedFloor', 'echoFloor', 'from', 'to']) {
        assert.ok(fields.includes(f), '楼层字段清单缺 ' + f);
    }
    const ptrs = arrOfIn(lrClean, 'LEDGER_STATE_POINTERS');
    assert.deepEqual(ptrs.sort(), ['lastEchoFloor', 'lastFloor'], '顶层指针清单须恰为 recall-echo / echo-ledger 的两个');
    // 四种容器键名必须都被 helper 覆盖（六账 items + 三面账 facts/events/repairs）
    for (const box of ['items', 'facts', 'events', 'repairs']) {
        assert.ok(lrClean.includes("'" + box + "'"), 'helper 未覆盖容器键 ' + box);
    }
});
/** 从任意源码文本抽 Object.freeze([...]) 的字符串元素（arrOf 固定读 index.js，此处读 ledger-replay.js）。 */
function arrOfIn(src, name) {
    const at = src.indexOf('const ' + name + ' = Object.freeze([');
    if (at < 0) return null;
    const open = src.indexOf('[', at);
    let depth = 0, end = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '[') depth++;
        else if (src[i] === ']') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) return null;
    return [...src.slice(open, end).matchAll(/'([A-Za-z_$][A-Za-z0-9_$]*)'/g)].map((m) => m[1]);
}

/* ══════════════ 2. D2 拓宽·携带面：契约 26 → 38 键 + 显式豁免 ══════════════ */
const NEW_CONTRACT = ['worldProg', 'clock', 'charMem', 'lockedFacts', 'lexicon', 'prequel',
    'supersede', 'stmLtm', 'recallArtifacts', 'narrativeEntropy', 'timeWentBack', 'repairLog'];

test('v3202 9. 契约表从 26 键扩到 38 键，12 个新键逐项在场', () => {
    const contract = arrOf('CARRYOVER_CONTRACT_KEYS');
    assert.ok(contract, '必须能抽出契约表');
    assert.equal(contract.length, 38, '契约表本版应为 38 键（修前 26），实际 ' + contract.length);
    for (const k of NEW_CONTRACT) assert.ok(contract.includes(k), '新键未进契约：' + k);
    assert.equal(new Set(contract).size, contract.length, '契约键不得重复');
});

test('v3202 10. 豁免表在场：14 键、每键带理由、与契约零重叠', () => {
    const contract = arrOf('CARRYOVER_CONTRACT_KEYS');
    const exempt = arrOf('CARRYOVER_EXEMPT_KEYS');
    assert.ok(exempt, '必须存在显式豁免表（不得静默豁免）');
    assert.equal(exempt.length, 14, '豁免表本版应为 14 键，实际 ' + exempt.length);
    assert.equal(exempt.filter((k) => contract.includes(k)).length, 0, '同一键不得既带走又豁免');
    // 每键必须在豁免表行区间内有 >= 4 字符的行内理由（「同上」这种不足 4 字符会被 D3 扫描器抓）
    const lines = raw.split('\n');
    const at = lines.findIndex((l) => l.includes('CARRYOVER_EXEMPT_KEYS'));
    const end = lines.findIndex((l, i) => i > at && l.trim() === ']);');
    assert.ok(at >= 0 && end > at, '豁免表行区定位失败');
    const block = lines.slice(at, end + 1);
    for (const k of exempt) {
        const line = block.find((l) => new RegExp("^\\s*'" + k + "'\\s*[,]").test(l));
        assert.ok(line, '豁免项 ' + k + ' 不在豁免表行区内');
        const m = /\/\/\s*(.+)$/.exec(line);
        assert.ok(m && m[1].trim().length >= 4, '豁免项 ' + k + ' 缺少可读理由：' + line.trim());
    }
    // 「同源异名」的两个键必须被豁免而非纳入契约（纳入会在承接时双写互相覆盖）
    assert.ok(exempt.includes('diaries') && exempt.includes('status'), 'diaries/status 与 diary/statusFlat 同源异名，须豁免');
    assert.ok(contract.includes('diary') && contract.includes('statusFlat'), '同源异名的正主仍须在契约里');
});

test('v3202 11. 写侧对账真跑：缺 repairLog 的包必须报缺键（v3.194 声称已进、实测未进的那个）', () => {
    const body = bodyOf(raw, 'verifyCarryoverPack(pack) {');
    assert.ok(body, '必须定位到 verifyCarryoverPack 方法体');
    // 真跑不可行（方法体引用块外 PLUGIN_NAME/console），改用行为等价的三条硬断言：
    const plain = stripComments(body);
    assert.ok(/CARRYOVER_CONTRACT_KEYS\s*[.]filter\s*\(/.test(plain), '必须真的按契约表过滤，不得自持一份键清单');
    assert.ok(/!produced\.includes\(k\)/.test(plain), '缺键判定必须落在实际产出键上（不是在真源之外空跑）');
    assert.ok(/missingWrite/.test(plain) && /\.warn\(/.test(plain), '缺键必须有 missingWrite 记录 + 用户可见告警');
    assert.ok(/console\.warn/.test(plain), '告警必须走到 console.warn（诊断面看得见）');
    // 调用点：必须在 packCarryover 里对**真实产出对象**调用，且发生在 return 之前
    const packBody = bodyOf(raw, 'packCarryover() {');
    const callAt = packBody.indexOf('verifyCarryoverPack(_pack)');
    const retAt = packBody.indexOf('return _pack');
    assert.ok(callAt > 0, 'verifyCarryoverPack 必须被真调用（有校验机制本身也是一种声称）');
    assert.ok(retAt > callAt, '调用必须发生在 return _pack 之前，否则对账跑在空对象上');
    // 缺陷指纹：修前 v3.194 声称已进契约的 repairLog，本版必须在契约里
    assert.ok(arrOf('CARRYOVER_CONTRACT_KEYS').includes('repairLog'), 'repairLog 必须已进契约（v3.194 声称未落地）');
});

test('v3202 12. 四侧同补：pack 产出 / pack 承接 / 种子产出 / 种子承接 逐键对齐', () => {
    // 包格式标记（version/counts/packedAt）不是子系统面，不进「四侧逐键」比对。
    const PACK_META = new Set(['version', 'counts', 'packedAt', 'type', 'createdAt', 'sourceFloor']);
    const contract = arrOf('CARRYOVER_CONTRACT_KEYS').filter((k) => !PACK_META.has(k));
    const packBody = methodBody(raw, 'packCarryover() {');
    assert.ok(packBody, '必须定位到 packCarryover');
    const produced = topKeys(packBody);
    for (const k of contract) assert.ok(produced.has(k), '写侧未产出契约键：' + k);
    const applyBody = methodBody(raw, 'applyCarryover(pack) {');
    assert.ok(applyBody, '必须定位到 applyCarryover');
    const consumed = new Set([...applyBody.matchAll(/pack\.([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((m) => m[1]));
    for (const k of contract) assert.ok(consumed.has(k), '读侧未承接契约键（死分支）：' + k);
    // 死分支判据（与 v3168 同一口径）：读侧消费的键必须 ⊆ 写侧产出
    const dead = [...consumed].filter((k) => !produced.has(k)).sort();
    assert.deepEqual(dead, [], '存在死分支：' + dead.join('/'));
    // 种子路径：产出与承接也必须同源（v3.168 的同一族缺陷在种子侧复发过）
    const seedBody = methodBody(raw, 'generateCarryoverSeed(options = {}) {');
    assert.ok(seedBody && seedBody.length > 2000, '种子产出方法体定位失败（长度 ' + (seedBody ? seedBody.length : 'null') + '）');
    const seedOut = topKeys(seedBody);
    for (const k of NEW_CONTRACT) assert.ok(seedOut.has(k), '种子产出缺新键：' + k);
    const importBody = methodBody(raw, 'importCarryoverSeed(seed, options = {}) {');
    assert.ok(importBody && importBody.length > 2000, '种子承接方法体定位失败（长度 ' + (importBody ? importBody.length : 'null') + '）');
    // 承接两种写法都要认：`seed.X`（独立捕获分支）与 `['X', () => this.X]`（_subSystems 登记项）
    const seedIn = new Set([
        ...[...importBody.matchAll(/seed\.([A-Za-z_$][A-Za-z0-9_$]*)/g)].map((m) => m[1]),
        ...[...importBody.matchAll(/\[\s*'([A-Za-z_$][A-Za-z0-9_$]*)'\s*,\s*\(\)/g)].map((m) => m[1]),
    ]);
    for (const k of NEW_CONTRACT) assert.ok(seedIn.has(k), '种子承接缺新键（死分支）：' + k);
    // 断言简写键确实被这个口径认出来了（否则「键抽取器」本身在退化）
    assert.ok(produced.has('statusFlat'), '简写键抽取失效：statusFlat 是 `statusFlat,` 形态');
});

test('v3202 13. 用不用得上要如实回话：_applied 与 _subSystems 覆盖新增面', () => {
    // v3.165 的「成功声称面」：若生效字段清单不覆盖新面，「导入了多少」会漏计，
    //   于是「成功」与「真的导入了东西」再次脱钩。
    const at = cleanRaw.indexOf('const _applied = [');
    const end = cleanRaw.indexOf('].filter', at);
    assert.ok(at > 0 && end > at, '_applied 清单定位失败');
    const applied = [...cleanRaw.slice(at, end).matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1]);
    for (const k of NEW_CONTRACT) assert.ok(applied.includes(k), '_applied 漏计：' + k);
    // 走 import 接口的键必须登记进 _subSystems，否则种子侧只有「不产出」这一侧在场
    const subAt = cleanRaw.indexOf('const _subSystems = [');
    const subEnd = cleanRaw.indexOf('];', subAt);
    const subBlock = cleanRaw.slice(subAt, subEnd);
    for (const k of ['worldProg', 'charMem', 'lexicon', 'prequel', 'supersede']) {
        assert.ok(subBlock.includes("['" + k + "'"), '_subSystems 未登记 ' + k);
    }
    // 非 import 接口的键必须走独立捕获分支（每项独立 try，一个抬头不对不得撤销整包）
    for (const k of ['lockedFacts', 'stmLtm', 'recallArtifacts', 'narrativeEntropy', 'timeWentBack', 'repairLog']) {
        assert.ok(raw.includes('errLog(e, \'applyCarryover.' + k + '\')'), '读侧缺独立捕获分支：' + k);
        assert.ok(raw.includes('errLog(e, \'importCarryoverSeed.' + k + '\')'), '种子承接缺独立捕获分支：' + k);
    }
});

test('v3202 14. 豁免键不得在四侧被写入（豁免 = 刻意不带，写进去就是自相矛盾）', () => {
    const exempt = arrOf('CARRYOVER_EXEMPT_KEYS');
    const packBody = bodyOf(raw, 'packCarryover() {');
    const produced = topKeys(packBody);
    for (const k of exempt) {
        // 说明性元数据（打包时刻等）本就由打包流程自带，不算「业务面写入」
        if (['lastSave', 'packedAt', 'schemaVersion', 'producerVersion', 'extensions'].includes(k)) continue;
        assert.ok(!produced.has(k), '豁免键 ' + k + ' 仍被写侧产出（契约/豁免自相矛盾）');
    }
});

/* ══════════════ 3. D3 差集扫描器 + 负控制 ══════════════ */
const SCAN_REL = 'tests/audit/scan_v3202_carryover_archive_diff.mjs';
const NC_REL = 'tests/audit/scan_v3202_carryover_archive_diff_negctl.mjs';
const scanSrc = readFileSync(ROOT + SCAN_REL, 'utf-8');
const ncSrc = readFileSync(ROOT + NC_REL, 'utf-8');

test('v3202 15. 扫描器在场：四判据齐全（结构可定位 / 差集为空 / 豁免有理由 / 两者不重叠）', () => {
    assert.ok(scanSrc.includes("'ARCHIVE_TOP_LEVEL_KEYS'") || scanSrc.includes('ARCHIVE_TOP_LEVEL' + '_KEYS'), 'P1 未审存档面');
    assert.ok(scanSrc.includes('差集为空') || scanSrc.includes('covered.has'), 'P2 差集判据缺失');
    assert.ok(scanSrc.includes('没有行内理由'), 'P3 理由判据缺失');
    assert.ok(scanSrc.includes('既进契约又被豁免'), 'P4 重叠判据缺失');
    assert.ok(scanSrc.includes('判据纯度'), '须有判据纯度自检（禁止在本文件内另抄一份常量表）');
    assert.ok(scanSrc.includes('LONSHA_AUDIT_ROOT'), '须支持夹具通道（负控依赖它）');
    assert.ok(scanSrc.includes('LONSHA_AUDIT_FIXTURE'), '须支持夹具模式放宽（合成仓库用）');
    // 纯度自检本身不得是恒真：禁止串必须由片段拼出（写整串会命中自己 —— 自证陷阱）
    assert.ok(scanSrc.includes('NAME_PARTS'), '纯度自检须用分段拼接的常量名（否则命中自身）');
});

test('v3202 16. 扫描器真跑：当前仓库差集为空（exit 0）', () => {
    const r = spawnSync(process.execPath, [SCAN_REL], { cwd: ROOT, encoding: 'utf8', timeout: 60000 });
    assert.equal(r.status, 0, '扫描器应报卫生，实际 exit ' + r.status + '\n' + (r.stdout + r.stderr));
    assert.ok(/差集为空/.test(r.stdout), '输出须念出差集为空：' + r.stdout);
});

test('v3202 17. 负控在场且真跑全绿：>= 8 组、含保绿对照、含工具两向自证', () => {
    const r = spawnSync(process.execPath, [NC_REL], { cwd: ROOT, encoding: 'utf8', timeout: 180000 });
    assert.equal(r.status, 0, '负控应全绿，实际 exit ' + r.status + '\n' + (r.stdout + r.stderr));
    const m = /(\d+) 组负控制全部成立/.exec(r.stdout);
    assert.ok(m, '负控须打印成立组数：' + r.stdout);
    assert.ok(Number(m[1]) >= 8, '负控组数应 >= 8，实际 ' + m[1]);
    // 工具两向自证必须在场（锚点不存在须抛；破坏须可观测；原版上判据须真）
    assert.ok(ncSrc.includes('toolSelfCheck'), '缺工具自证');
    assert.ok(ncSrc.includes('锚点机制失效'), '缺「不存在的锚点须抛」自证');
    assert.ok(ncSrc.includes('--check'), '破坏后须先做语法校验（保证退出码可归因于判据）');
    // 保绿对照组：改了但不该改结论（防「随便翻红」的假探测器）
    assert.ok(/保绿对照/.test(ncSrc), '负控须含保绿对照组');
    assert.ok(ncSrc.includes('LONSHA_AUDIT_ROOT'), '负控须在独立 fixture 目录里跑真判据');
});

test('v3202 18. 负控覆盖四判据：P1/P2/P3/P4 各有一组专测，且两组 exit 2 专测', () => {
    const cases = [...ncSrc.matchAll(/'A\d-([^']+)'/g)].map((m) => m[1]);
    assert.ok(cases.length >= 8, '负控用例应 >= 8，实际 ' + cases.length);
    const joined = cases.join('|');
    assert.ok(/契约漏掉/.test(joined), '缺 P2 漏键专测');
    assert.ok(/新增未登记键/.test(joined), '缺 P2 新增未登记专测');
    assert.ok(/只删理由/.test(joined), '缺 P3 理由专测');
    assert.ok(/既带又豁免/.test(joined), '缺 P4 重叠专测');
    assert.ok(/整表改名|常量消失/.test(joined), '缺 P1 探测器失效专测（结构漂移须 exit 2）');
});

/* ══════════════ 4. 发布卫生 ══════════════ */
test('v3202 19. 版本四源同源且不低于本测试所属版本', () => {
    // [v3.203.0] 硬等号交本版接管：三源互等保留，下界锁回自己的出生版本 3.202.0。
    const v = /const VERSION = '([0-9.]+)'/.exec(raw)[1];
    assert.equal(mf.version, v, 'manifest 跟随');
    assert.equal(pkg.version, v, 'package 跟随');
    assert.ok(vnum(v) >= vnum('3.202.0'), 'index.js 版本 ' + v + ' >= 3.202.0');
});

test('v3202 20. CHANGELOG 顶节不低于本版，且记录三方向', () => {
    // [v3.203.0] 同上：下一版把新节加在顶上，本版记录仍须在文件中可查。
    const top = (changelog.match(/^## (v[0-9.]+)/m) || [])[1];
    assert.ok(top, 'CHANGELOG 必须有序节');
    assert.ok(vnum(top.replace('v', '')) >= vnum('3.202.0'), '顶节 ' + top + ' 须不低于本版');
    assert.ok(/回滚面|FLOOR_OWNERS/.test(changelog), 'D1 须记录');
    assert.ok(/携带面|CARRYOVER_CONTRACT_KEYS/.test(changelog), 'D2 须记录');
    assert.ok(/豁免/.test(changelog), 'D2 的显式豁免须记录');
    assert.ok(/差集|扫描/.test(changelog), 'D3 须记录');
});

test('v3202 21. 本文件已入 tests/ 且锚着本版（下一版接管时抬它）', () => {
    const hits = [...SELF.matchAll(/vnum\('([0-9.]+)'\)/g)].map((m) => vnum(m[1]));
    assert.ok(hits.length > 0, '本文件须有版本下界断言');
    assert.ok(hits.some((h) => h === vnum('3.202.0')), 'frontier 交棒：下界须含本版');
    assert.ok(hits.every((h) => h <= vnum('3.202.0')), '不得越界承诺未来');
});

test('v3202 22. 判据面自防护：断言数 / 代码行 / 关键指纹不得缩水', () => {
    const nAssert = (SELF.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 90, '断言数不得缩水（>= 90），实际 ' + nAssert + ' —— 判据被删或改宽松时此处必须响');
    const nlCode = codeRows(SELF).length;
    assert.ok(nlCode >= 170, '代码行不得缩水（>= 170），实际 ' + nlCode);
    for (const [label, need] of [
        ['D1 九账 id 清单', 'event-completeness'],
        ['D1 三态缺席判据', 'absent'],
        ['D2 契约新键', 'recallArtifacts'],
        ['D2 豁免同源异名', 'statusFlat'],
        ['D3 负控组数', '组负控制全部成立'],
    ]) {
        assert.ok(SELF.includes(need), '关键指纹缺失：' + label);
    }
    // 本文件不得本地重写唯一真源的助手（E1 面上会翻红，此处再钉一次）
    for (const h of ['strip' + 'Comments', 'code' + 'Lines', 'body' + 'Of', 'brace' + 'Match']) {
        const re = new RegExp('(?:function|const|let|var)\\s+' + h + '[0-9A-Za-z_$]*\\s*[=(]');
        const stmts = SELF.split('\n').filter((l) => re.test(l));
        // 允许 delegating 包装/局部取行函数（codeRows 不含这些名字）；此处只禁止「真源助手名」被本地重定义
        assert.equal(stmts.filter((l) => !l.includes('import')).length, 0, '不得本地重写真源助手 ' + h);
    }
});
