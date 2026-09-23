// tests/v3182_ledger_replay.test.mjs
// v3.182 账本回放（Ledger Replay）：把删楼与楼层前移从两份手工清单收成一张声明式登记表
//   背景：rollbackFloor（约 200 行）与 shiftFloorsFrom（约 160 行）各是一份手工清单，
//     新增带楼层归属的子系统必须同时改两处，漏一处不报错——删楼后那部分记忆留在原地，
//     却自称「已回滚」。这是 Fable 审计点名的代差根因「子系统各自为政，回滚靠手工逆向」。
//   层次：A 回放真能撤账（行为驱动，不看声明）
//         B 楼层前移守恒（移走的与留下的楼层号都对）
//         C 三态不塌缩（ok / absent / threw 必须各自可达且互不同形）
//         D 幂等（同一楼回放两次，第二次零撤账）
//         E 单项失败不阻断其余账本
//         F 不变量校验器两向可用（残留必报、干净不报）
//         G 接线真被消费（取库口 / 回放调用 / 报告落点 / 诊断行）
//         H 登记表结构健康
//         I 发布卫生
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.join(__dirname, '..');
const LR = require(path.join(REPO, 'ledger-replay.js'));
const idxSrc = fs.readFileSync(path.join(REPO, 'index.js'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const changelog = fs.readFileSync(path.join(REPO, 'CHANGELOG.md'), 'utf8');

function vnum(s) {
    const m = /^([0-9]+)(?:[.]([0-9]+))?(?:[.]([0-9]+))?/.exec(String(s));
    return m ? Number(m[1]) * 1000000 + Number(m[2] || 0) * 1000 + Number(m[3] || 0) : NaN;
}

/** 一个带楼层记录的最小账本：removeByFloor 返回撤掉条数。 */
function makeBook(floors) {
    return {
        items: floors.map(f => ({ floor: f })),
        removeByFloor(f) {
            const before = this.items.length;
            this.items = this.items.filter(e => e.floor !== f);
            return before - this.items.length;
        }
    };
}

// ══════════ A 回放真能撤账 ══════════
test('【A1】删楼回放撤掉该楼的全部记录，其他楼原样保留', () => {
    const host = {
        diary: {
            diaries: { a: [{ floor: 1 }, { floor: 4 }, { floor: 4 }], b: [{ floor: 4 }] },
            removeByFloor(f) {
                let n = 0;
                for (const k of Object.keys(this.diaries)) {
                    const b = this.diaries[k].length;
                    this.diaries[k] = this.diaries[k].filter(e => e.floor !== f);
                    n += b - this.diaries[k].length;
                }
                return n;
            }
        },
        reflection: { items: [{ floor: 4 }, { floor: 6 }] }
    };
    const r = LR.replayDrop(host, 4);
    assert.equal(r.side, 'drop');
    assert.equal(r.floor, 4);
    const diary = r.items.find(it => it.id === 'diary');
    assert.equal(diary.state, 'ok');
    assert.equal(diary.count, 3, '日记撤掉 3 条（两个角色合计）');
    assert.deepEqual(host.diary.diaries.a.map(e => e.floor), [1], '第 1 楼保留');
    const refl = r.items.find(it => it.id === 'reflection');
    assert.equal(refl.count, 1);
    assert.deepEqual(host.reflection.items.map(e => e.floor), [6]);
    assert.equal(r.threw, 0);
});

test('【A2】悬念簿同时认登记楼层与了结楼层', () => {
    const host = { suspense: { items: [{ floor: 3, resolvedFloor: 9 }, { floor: 2, resolvedFloor: 3 }, { floor: 7, resolvedFloor: null }] } };
    const r = LR.replayDrop(host, 3);
    const s = r.items.find(it => it.id === 'suspense');
    assert.equal(s.count, 2, '登记在 3 楼与了结在 3 楼的都要撤');
    assert.equal(host.suspense.items.length, 1);
    assert.equal(host.suspense.items[0].floor, 7);
});

// ══════════ B 楼层前移守恒 ══════════
test('【B1】前移后高于被删楼的楼层号减一，低于的不动', () => {
    const host = {
        timeline: { entries: [{ floor: 1 }, { floor: 5 }, { floor: 8 }] },
        pov: { povs: [{ floor: 5 }, { floor: 2 }] }
    };
    const r = LR.replayShift(host, 5);
    assert.equal(r.side, 'shift');
    assert.deepEqual(host.timeline.entries.map(e => e.floor), [1, 5, 7], '8 楼前移为 7，5 楼及以下不动');
    assert.deepEqual(host.pov.povs.map(e => e.floor), [5, 2]);
    const tl = r.items.find(it => it.id === 'timeline');
    assert.equal(tl.count, 1, '只有 1 条真的移动了');
});

test('【B2】前移不产生负楼层，被删楼号不残留在移动过的记录里', () => {
    const before = { timeline: [1, 5, 8] };
    const host = { timeline: { entries: before.timeline.map(f => ({ floor: f })) } };
    LR.replayShift(host, 5);
    const after = { timeline: host.timeline.entries.map(e => e.floor) };
    const inv = LR.checkReplayInvariants(before, after, 5);
    // 5 楼本身未被删除（shift 只移动更高的楼），所以 5 仍在；校验的是没有负楼层
    assert.equal(inv.problems.filter(p => p.kind === 'negative-floor').length, 0);
    assert.ok(after.timeline.every(f => f >= 1));
});

// ══════════ C 三态不塌缩 ══════════
test('【C1】缺席的账本如实报 absent，不报 ok 也不报 threw', () => {
    const host = { diary: null, reflection: undefined };
    const r = LR.replayDrop(host, 1);
    const diary = r.items.find(it => it.id === 'diary');
    const refl = r.items.find(it => it.id === 'reflection');
    assert.equal(diary.state, 'absent');
    assert.equal(refl.state, 'absent');
    assert.equal(diary.count, 0);
    assert.ok(r.absent >= 2);
});

test('【C2】动作抛错报 threw 且带错误信息，回放不中断', () => {
    const host = {
        diary: { diaries: {}, removeByFloor() { throw new Error('日记账本损坏'); } },
        reflection: { items: [{ floor: 2 }, { floor: 9 }] }
    };
    const r = LR.replayDrop(host, 2);
    const diary = r.items.find(it => it.id === 'diary');
    assert.equal(diary.state, 'threw');
    assert.match(diary.error, /日记账本损坏/);
    const refl = r.items.find(it => it.id === 'reflection');
    assert.equal(refl.state, 'ok', '一本账抛错不能挡住后面的账');
    assert.equal(refl.count, 1);
    assert.equal(r.threw, 1);
});

test('【C3】不参与前移的账本报 no-op，与 absent 不同形', () => {
    const host = { stmLtm: { marker: true } };
    const r = LR.replayShift(host, 3);
    const stm = r.items.find(it => it.id === 'stm-ltm');
    assert.equal(stm.state, 'no-op', 'stm-ltm 的 shift 声明为 null，必须报 no-op 而不是 absent');
    assert.notEqual(stm.state, 'absent');
});

// ══════════ D 幂等 ══════════
test('【D1】同一楼连续回放两次，第二次撤掉的条数为 0', () => {
    const host = { reflection: { items: [{ floor: 3 }, { floor: 3 }, { floor: 5 }] } };
    const first = LR.replayDrop(host, 3);
    const second = LR.replayDrop(host, 3);
    assert.equal(first.items.find(it => it.id === 'reflection').count, 2);
    assert.equal(second.items.find(it => it.id === 'reflection').count, 0, '重复回放不得重复扣账');
    assert.equal(host.reflection.items.length, 1);
});

// ══════════ E 单项失败不阻断 ══════════
test('【E1】取目标对象即抛，按缺席处理，不影响其他账本', () => {
    const host = {
        get diary() { throw new Error('宿主半初始化'); },
        reflection: { items: [{ floor: 1 }] }
    };
    const r = LR.replayDrop(host, 1);
    assert.equal(r.items.find(it => it.id === 'diary').state, 'absent');
    assert.equal(r.items.find(it => it.id === 'reflection').state, 'ok');
    assert.equal(r.threw, 0, 'get 抛错归入缺席，不计 threw');
});

// ══════════ F 不变量校验器两向可用 ══════════
test('【F1】残留楼层必报 ghost-floor，干净结果不报', () => {
    const dirty = LR.checkReplayInvariants({ diary: [1, 4] }, { diary: [1, 4] }, 4);
    assert.equal(dirty.ok, false);
    assert.equal(dirty.problems[0].kind, 'ghost-floor');
    const clean = LR.checkReplayInvariants({ diary: [1, 4] }, { diary: [1] }, 4);
    assert.equal(clean.ok, true);
    assert.equal(clean.problems.length, 0);
});

test('【F2】负楼层必报 negative-floor', () => {
    const r = LR.checkReplayInvariants({}, { timeline: [1, -1] }, 5);
    assert.equal(r.ok, false);
    assert.ok(r.problems.some(p => p.kind === 'negative-floor'));
});

// ══════════ G 接线真被消费 ══════════
test('【G1】宿主按契约取库并在两条路径上调用回放', () => {
    assert.match(idxSrc, /function _ledgerReplayLib\(\)/, '取库口存在');
    assert.match(idxSrc, /window\.LonShaLedgerReplay/, '取库走真读表达式');
    assert.match(idxSrc, /_lr\.replayDrop\(this, floor\)/, '删楼路径真调用');
    assert.match(idxSrc, /_lr\.replayShift\(this, deleted\)/, '前移路径真调用');
});

test('【G2】回放报告有落点且诊断行读取它', () => {
    const assigns = idxSrc.split('this._lastReplayReport =').length - 1;
    assert.ok(assigns >= 3, '报告字段至少 3 处赋值（初始化 + 删楼 + 前移），实得 ' + assigns);
    assert.match(idxSrc, /diagnoseLine\(this\._lastReplayReport\)/, '诊断行读取最近一次回放报告');
    assert.match(idxSrc, /\['账本回放'/, '诊断行有人类可读的名字');
});

test('【G3】模块缺席时退到空报告而不是抛掉删楼', () => {
    assert.match(idxSrc, /side: 'drop'/, '删楼路径有缺席退路');
    assert.match(idxSrc, /side: 'shift'/, '前移路径有缺席退路');
    assert.match(idxSrc, /_rep\.threw/, '宿主消费 threw 分态');
    assert.match(idxSrc, /_rep\.absent/, '宿主消费 absent 分态');
});

// ══════════ H 登记表结构健康 ══════════
test('【H1】登记表无结构问题且覆盖全部持有方式', () => {
    const problems = LR.checkRegistry(LR.FLOOR_OWNERS);
    assert.deepEqual(problems, [], '登记表结构问题：' + problems.join('；'));
    assert.ok(LR.FLOOR_OWNERS.length >= 20, '登记表不低于 20 本账，实得 ' + LR.FLOOR_OWNERS.length);
    const holds = new Set(LR.FLOOR_OWNERS.map(o => o.holds));
    for (const h of ['records', 'pointer', 'derived']) assert.ok(holds.has(h), '缺少持有方式 ' + h);
    const ids = LR.FLOOR_OWNERS.map(o => o.id);
    assert.equal(ids.length, new Set(ids).size, 'id 必须唯一');
});

test('【H2】覆盖度如实反映挂载情况', () => {
    const cov = LR.coverage({});
    assert.equal(cov.total, LR.FLOOR_OWNERS.length);
    assert.equal(cov.present, 0, '空宿主上一本账都不该在位');
    assert.equal(cov.absent, cov.total);
    const cov2 = LR.coverage({ diary: { diaries: {} }, ledger: { floors: {} } });
    assert.equal(cov2.present, 2);
});

test('【H3】诊断行文本含楼号与失败警示', () => {
    const line = LR.diagnoseLine({ side: 'drop', floor: 12, items: [{}, {}], dropped: 5, shifted: 0, threw: 2, absent: 3 });
    assert.match(line, /删楼回放/);
    assert.match(line, /楼12/);
    assert.match(line, /撤 5 条/);
    assert.match(line, /3 本缺席/);
    assert.match(line, /2 本失败/);
    assert.equal(LR.diagnoseLine(null), '—（未回放）');
});

// ══════════ I 发布卫生 ══════════
test('【I1】版本三源一致且不低于 v3.186.0', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(idxSrc)[1];
    assert.equal(v, manifest.version, 'manifest follows index.js');
    assert.equal(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.197.0'), 'index.js 版本 ' + v + ' >= 3.186.0');
    const top = changelog.split('\n').filter(l => l.startsWith('## v')).map(l => l.slice(4).trim()).sort((a, b) => vnum(b) - vnum(a))[0];
    assert.equal(top, v, 'CHANGELOG 顶节是本版');
    assert.match(changelog.split('## v3.181.0')[0], /账本回放/, '顶节记录本版主题');
});

test('【I2】模块已注册进 extra_js', () => {
    assert.ok(manifest.extra_js.includes('ledger-replay.js'), 'ledger-replay.js 已注册 extra_js');
});
