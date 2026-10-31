/* ============================================================
 * tests/v3428_l12_o5_realhost_suite.test.mjs — v3.428.0 L12-O5：真宿主最小回归集（探针 + 判定体）
 * 主题：`tests/audit/_realhost_suite.mjs`（探针，量）与 `tests/audit/_realhost_judge.mjs`（判据，判）
 *       必须**分工清楚、单源、各自可离线证伪**。
 *
 *   【问题现场（L12-O5 原文）】
 *     本仓「诚实边界」连四版写着「仍未跑真实 SillyTavern UI」，而仓里其实已经有两份零依赖 CDP 探针
 *     （`_mo1_realhost_probe.mjs` / `_mo2_realbrowser_probe.mjs`）。缺的不是能力，是**入口、读数落盘、
 *     三块合一**：它们要人记得跑、要人手工看输出、读数不落盘 ⇒ 下一版写 CHANGELOG 又只能凭记忆说
 *     「跑过了」。本版把三条最小回归（装载面 / 写盘闭环 / 世界线纪元）合成一条命令，读数落
 *     `tests/audit/realhost_readings.json`，退出码三档（0 全成立 / 1 有真缺陷 / 2 环境缺失）。
 *
 *   【为什么还必须有本档（`_` 前缀的两面性）】
 *     `_realhost_suite.mjs` / `_realhost_judge.mjs` 以下划线开头：`tests/run.mjs` 只发现 `*.test.mjs`，
 *     审计面发现与多数门禁都排除 `_` 前缀 ⇒ 它们**不进任何登记表**，但也**没有任何门禁会看它们**。
 *     这就是本档存在的理由：给这一对文件装上「离线就能跑、坏了必红」的判据。
 *
 *   【本档钉什么】
 *     A  结构面：三块各自独立可单跑 / 三档退出码都是字面量 / 读数落盘 + schema / 判据单源
 *        （探针内**不得**再留一份内联判据）/ 进程纪律（独立进程组 + 组杀）/ 判据体是纯函数
 *     B  正控：合成一份**三块全成立**的读数 ⇒ `judgeReport` 必须零缺陷（先证「它对好的不发火」）
 *     C  负控 11 格：逐格把读数改坏 ⇒ 判定必须点名该格（含「缺读数 ≠ 通过」两处）
 *     D  三条真源码破坏（每条配原版对照）：破坏判据体副本 ⇒ 对应负控**必须失效**，
 *        证明判据真承重，不是「写在代码里的能力」
 *     E  三档退出**真跑**：环境缺失的两条路径（无部署 manifest / 版本不匹配）与 ST 未就绪
 *        ⇒ `exit 2` 且报因具体（绝不编 0）
 *     F  当版锚（下限形）+ 两处登记面 + 锚点单命中 + 工具两向自证
 *
 *   【边界】
 *     本档**不**跑真 Chromium、**不**连真 SillyTavern：三块的**真读数**只有装配了 ST 的机器才拿得到，
 *     那条路只能人工跑（`node tests/audit/_realhost_suite.mjs`），这正是 L12-O5 的边界原文。
 *     本档证明的是：探针的形状对、判据在合成读数上判得准、在真源码破坏下会失效、环境缺失时如实报。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';
import { judgeLoad, judgeWrite, judgeWorldline, judgePageErrors, judgeReport, MIN_GLOBALS } from './audit/_realhost_judge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PROBE_REL = path.join('tests', 'audit', '_realhost_suite.mjs');
const JUDGE_REL = path.join('tests', 'audit', '_realhost_judge.mjs');
const PROBE = path.join(ROOT, PROBE_REL);
const TEST_REL = path.join('tests', 'v3428_l12_o5_realhost_suite.test.mjs');
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const PROBE_SRC = readRoot(PROBE_REL);
const JUDGE_SRC = readRoot(JUDGE_REL);

/* ══════════════ 合成读数（正控与负控共用一份底稿） ══════════════ */
/** 三块全成立的读数。**每个字段都取「判定表里被读的那一格」**，多一个少一个都不行。 */
function good() {
    return {
        schema: 'realhost-readings@1',
        version: '3.428.0',
        load: {
            status: 'ok', okCount: 92, triedCount: 92, fails: [],
            globals: 96, scriptTags: 1, version: '3.428.0', configKeys: 240, hasUI: true,
        },
        write: {
            same: { ret: true, lastWriteStatus: 'ok', batchStatus: 'ok', confirmedChatId: 'rh-suite-1', markInCurrentAfter: true },
            swap: {
                ret: false, lastWriteStatus: 'failed', entryStatus: 'deferred', entryReason: 'chat-switched',
                confirmed: null, markInCurrentAfter: false, chatAfter: 'rh-suite-B',
            },
            drain: {
                retC: true, retD: true, lastWriteStatus: 'ok', landedHasC: true, landedHasD: true,
                calls: [{ slotChatId: 'rh-suite-C', curChatId: 'rh-suite-C' }, { slotChatId: 'rh-suite-D', curChatId: 'rh-suite-D' }],
            },
            restored: true,
        },
        worldline: {
            epochAdvance: { applied: true, floor: 60, why: 'own-jump', conflict: null },
            current: { lineId: 'α线', epoch: 'α线@47', floor: 60 },
            counts: { kept: 1, held: 0, blocked: 2, undecided: 1, future: 0 },
            buckets: {
                era1: { bucket: 'blocked', state: 'foreign', why: 'epoch-mismatch', epoch: 'α线@1' },
                now: { bucket: 'kept', state: 'native', why: 'same-epoch', epoch: 'α线@47' },
                beta: { bucket: 'blocked', state: 'foreign', why: 'epoch-mismatch', epoch: 'β线@40' },
                nolocate: { bucket: 'undecided', state: 'unknown', why: 'no-locate', epoch: null },
            },
        },
        pageErrors: [],
    };
}
const clone = (v) => JSON.parse(JSON.stringify(v));
/** 顶层判据返回 `{block, msg}`；四个分块入口返回**纯字符串数组** —— 两种形态各一个助手，
 *   别混用（混用的后果是「原版对照」静默为假，恰好就是本档 D2 首版的实测红）。 */
const has = (bad, block, hint) => bad.some((d) => d.block === block && String(d.msg).includes(hint));
const hasMsg = (list, hint) => list.some((m) => String(m).includes(hint));
/** 单格负控的统一形态：改一格 ⇒ 判定必须在指定块点名指定措辞。 */
function expectDefect(mutate, block, hint, label) {
    const r = good();
    mutate(r);
    const bad = judgeReport(r);
    assert.ok(has(bad, block, hint),
        label + '：判定必须点名「' + hint + '」（实得 ' + JSON.stringify(bad) + '）—— 该格没有观测点');
    return bad;
}

/* ══════════════ A 结构面 ══════════════ */
test('v3428O5 A1. ★★★★ 三块各自可单跑、三档退出码都是字面量、读数落盘带 schema', () => {
    /* 三块必须**独立可单跑**（计划原文「一条命令、三个读数块」的另一半：
     *   合起来是一条命令，拆开来每块能单独复跑 —— 否则真宿主上某块挂了就得全跑一遍）。 */
    assert.ok(PROBE_SRC.includes('--block=load|write|worldline'), '用法行必须写清三块的 block 名');
    for (const b of ['load', 'write', 'worldline']) {
        assert.ok(PROBE_SRC.includes("ONE === '" + b + "'"), '缺可单跑的块 ' + b);
    }
    /* 三档退出码必须是**字面量**：本仓 scan_exit_codes 的 B4 明确禁止动态退出（判不了码）。 */
    for (const c of [0, 1, 2]) {
        assert.ok(PROBE_SRC.includes('process.exit(' + c + ')'), '缺退出码字面量 ' + c);
    }
    assert.ok(PROBE_SRC.includes('realhost-readings@1'), '读数必须带 schema 标记（否则下版不知道读的是哪套口径）');
    assert.ok(PROBE_SRC.includes("'tests', 'audit'") || PROBE_SRC.includes('realhost_readings.json'),
        '缺读数落盘路径（计划验收：tests/audit/realhost_readings.json）');
    assert.ok(PROBE_SRC.includes('readings'), '读数数组不在场');
    assert.ok(PROBE_SRC.includes('defects'), '缺陷数组不在场');
    /* 落盘失败必须 exit 2：一份「跑了但没留下证据」的读数，比没跑更容易被当成跑过。 */
    assert.ok(/读数落盘失败/.test(PROBE_SRC), '落盘失败必须如实报（不得静默）');
    ok('三块可单跑；退出码 0/1/2 均为字面量；读数带 schema 且落盘失败如实报');
});

test('v3428O5 A2. ★★★★ 判据单源：探针内不得再留一份内联判据', () => {
    /* 这是本档最重要的一条：探针里有内联判据的话，离线证伪的只是**副本**，
     *   真跑时用的是另一份 —— 那就是「写在代码里的能力」。 */
    assert.ok(PROBE_SRC.includes("from './_realhost_judge.mjs'"), '探针必须从判定体取判据');
    for (const fn of ['judgeLoad(load)', 'judgeWrite(write)', 'judgeWorldline(wl)', 'judgePageErrors(pageErrors)']) {
        assert.ok(PROBE_SRC.includes(fn), '探针必须以 ' + fn + ' 取判定（不是自己再判一遍）');
    }
    /* 反向：判据里的措辞**不得**在探针里再出现一次（出现即说明留了一份内联副本）。 */
    for (const w of ['LonSha* 全局数 ', 'await 期间切聊 ⇒ 不得推进 _confirmed', '没出现在任何桶里']) {
        assert.ok(!PROBE_SRC.includes(w), '探针里残留内联判据措辞「' + w + '」—— 判据必须单源在 _realhost_judge.mjs');
    }
    /* 下限常量也必须单源：探针不再自己声明 85。 */
    assert.ok(!PROBE_SRC.includes('const MIN_GLOBALS = 85'), '下限常量不得在探针里另写一份（须从判定体取）');
    assert.ok(JUDGE_SRC.includes('export const MIN_GLOBALS = 85'), '判定体必须导出下限常量');
    assert.equal(MIN_GLOBALS, 85, '导出的下限常量必须是 85');
    ok('探针只取判定体（四处 export）+ 无内联判据措辞残留 + 下限常量单源');
});

test('v3428O5 A3. ★★★ 探针纪律：独立进程组 + 组杀 + 版本对账 + 绝不编 0', () => {
    /* ⑤ 进程纪律（scan_process_reaping 会当场点名）：浏览器独立进程组，收尾按组收割。 */
    assert.ok(PROBE_SRC.includes('detached: true'), '浏览器必须放独立进程组（否则收割会漏孙进程）');
    assert.ok(PROBE_SRC.includes('process.kill(-cdpProc.pid'), '收尾必须按**进程组**收割（kill(-pid)）');
    assert.ok(/function reap\(\)/.test(PROBE_SRC), '缺收割口（reap）');
    assert.ok(/bail\([\s\S]{0,200}reap\(\)/.test(PROBE_SRC), 'bail 路径也必须收割（失败的探针不许留下孤儿浏览器）');
    /* 版本对账：测旧版比测不出来更坏 —— 读数会挂到错误版本的账上。 */
    assert.ok(PROBE_SRC.includes('deployedVersion !== repoVersion'), '必须对账「部署版 vs 仓库版」并逐字相同');
    assert.ok(/先把仓库文件同步到/.test(PROBE_SRC), '版本不匹配时必须给出可执行的出路（不是只说「不匹配」）');
    /* 绝不编 0：环境四件（仓库 manifest / 部署 manifest / 浏览器 / ST）各自 bail。 */
    const bails = (PROBE_SRC.match(/bail\(/g) || []).length;
    assert.ok(bails >= 6, '环境缺失分支至少 6 处 bail（实 ' + bails + '）—— 少了就会「编 0」');
    assert.ok(PROBE_SRC.includes('ST 未就绪'), 'ST 不可达必须如实 bail（不得在没有 ST 的页面上给结论）');
    ok('detached + kill(-pid) + bail 也收割 + 版本对账带出路 + 6 处 bail 不编 0');
});

test('v3428O5 A4. ★★★★ 判据体是纯函数：不读盘、不读环境、不抛', () => {
    /* 纯函数是「离线可证伪」的前提：它一旦读盘/读环境，判据结论就依赖跑它的机器。 */
    assert.ok(!/from\s+['"]node:/.test(JUDGE_SRC), '判定体不得 import Node 内置（那就是读盘/读环境）');
    assert.ok(!/from\s+['"]\.\.?\//.test(JUDGE_SRC), '判定体不得 import 仓内模块（保持可单文件证伪）');
    assert.ok(!/\brequire\s*\(/.test(JUDGE_SRC), '判定体不得用 require');
    assert.ok(!/\bprocess\.(env|exit|cwd|argv)/.test(JUDGE_SRC), '判定体不得读环境/退出（判据不许有副作用）');
    assert.ok(!/\bfs\./.test(JUDGE_SRC), '判定体不得读盘');
    /* 缺字段一律「记缺陷」而不是崩：三条入口对空入参都必须返回数组、不抛。 */
    for (const [name, fn] of [['judgeLoad', judgeLoad], ['judgeWrite', judgeWrite],
        ['judgeWorldline', judgeWorldline], ['judgePageErrors', judgePageErrors]]) {
        for (const bad of [undefined, null, 0, 'x', []]) {
            let out;
            assert.doesNotThrow(() => { out = fn(bad); }, name + ' 对 ' + JSON.stringify(bad) + ' 不得抛（判据崩了就变成「不可证伪」）');
            assert.ok(Array.isArray(out), name + ' 必须返回缺陷数组');
            /* ★ 唯一例外：`judgePageErrors([])` 是**合法读数**（真页面确实一条异常都没有）。
             *   把它也判成缺陷，就等于「不许安静」，那条判据会被迫永远报红。
             *   其余三种「没读到」的形态（undefined / null / 非数组）仍必须记缺陷 ——
             *   「没读到」与「没有异常」不许同形，这是 C11b 那一格的同一口径。 */
            const legitEmpty = name === 'judgePageErrors' && Array.isArray(bad) && bad.length === 0;
            if (legitEmpty) {
                assert.deepEqual(out, [], 'pageErrors 空数组是合法读数（没有异常），不得判成缺陷');
            } else {
                assert.ok(out.length > 0, name + ' 对「没读到」必须记缺陷（缺读数 ≠ 通过）：' + JSON.stringify(bad));
            }
        }
    }
    /* 顶层入口：整份报告判一遍，缺陷带块名（归因面与判据面同源）。 */
    const bad = judgeReport(null);
    assert.ok(Array.isArray(bad) && bad.length > 0, 'judgeReport 对空报告必须记缺陷');
    assert.ok(bad.every((d) => typeof d.block === 'string' && typeof d.msg === 'string'), '每条缺陷必须带块名与可读归因');
    ok('判定体零 import / 无 fs / 无 process / 四个入口对五种空入参均记缺陷不抛');
});

/* ══════════════ B 正控 ══════════════ */
test('v3428O5 B1. ★★★★ 三块全成立的合成读数 ⇒ judgeReport 必须零缺陷', () => {
    /* 先证「对好的不发火」：只验负控会翻红，就把判据养成「见谁咬谁」，那不是判据是噪音。 */
    const bad = judgeReport(good());
    assert.deepEqual(bad, [], '三块全成立的读数被判成缺陷：' + JSON.stringify(bad));
    /* 分块入口也必须各自零缺陷（单跑某一块时用的就是它们）。 */
    const g = good();
    assert.deepEqual(judgeLoad(g.load), [], '装载面误报');
    assert.deepEqual(judgeWrite(g.write), [], '写盘闭环误报');
    assert.deepEqual(judgeWorldline(g.worldline), [], '世界线纪元误报');
    assert.deepEqual(judgePageErrors(g.pageErrors), [], 'pageErrors 误报');
    ok('正控零缺陷（顶层 + 四个分块入口各自）');
});

/* ══════════════ C 负控 11 格 ══════════════ */
test('v3428O5 C1. ★★★ 装载面：全局数不足 ⇒ 点名下限', () => {
    expectDefect((r) => { r.load.globals = MIN_GLOBALS - 1; }, 'load', '插件模块没挂齐', 'c1');
    ok('全局数 ' + (MIN_GLOBALS - 1) + ' 被点名');
});

test('v3428O5 C2. ★★★ 装载面：status 不是 ok ⇒ 点名装载失败项', () => {
    expectDefect((r) => { r.load.status = 'partial'; r.load.fails = ['memory-core.js:timeout']; },
        'load', '_extraJsLoad.status', 'c2');
    ok('status=partial 被点名');
});

test('v3428O5 C3. ★★★ 装载面：面板入口没挂上 ⇒ 点名 showSettingsPanel', () => {
    expectDefect((r) => { r.load.hasUI = false; }, 'load', 'showSettingsPanel 不可用', 'c3');
    ok('hasUI=false 被点名');
});

test('v3428O5 C4. ★★★ 装载面：globals 缺席（不是 0，是没读到）⇒ 也必须记缺陷', () => {
    /* 「没读到」与「读到 0」在判定上可以同罪，但消息必须是「缺读数」——
     *   否则读数面塌了会被读成「插件装了个 0 全局的版本」。 */
    expectDefect((r) => { delete r.load.globals; }, 'load', '缺 globals', 'c4');
    ok('globals 缺席被点名为「缺读数」');
});

test('v3428O5 C5. ★★★ 写盘闭环：同会话主流路径不得误伤 ⇒ 必须回 true', () => {
    expectDefect((r) => { r.write.same.ret = false; }, 'write', '同会话主流路径必须回 true', 'c5');
    ok('same.ret=false 被点名');
});

test('v3428O5 C6. ★★★★ 写盘闭环：await 期间切聊 ⇒ 回 true / 留数据 / 推进确认 三罪各自点名', () => {
    expectDefect((r) => { r.write.swap.ret = true; }, 'write', '本批不得回 true', 'c6a');
    expectDefect((r) => { r.write.swap.markInCurrentAfter = true; }, 'write', '不得留下本批数据', 'c6b');
    expectDefect((r) => { r.write.swap.confirmed = { chatId: 'rh-suite-A', revision: 3 }; },
        'write', '不得推进 _confirmed', 'c6c');
    expectDefect((r) => { r.write.swap.entryStatus = 'landed'; }, 'write', '必须如实记 deferred', 'c6d');
    ok('切聊四条（返回值 / 落地 / 确认 / 归宿）各自可归因');
});

test('v3428O5 C7. ★★★★ 写盘闭环：一次落盘点都没观测到 ⇒ 读数为「不可信」，不是「没有错档」', () => {
    expectDefect((r) => { r.write.drain.calls = []; }, 'write', '探针没接上观测点', 'c7');
    ok('空 calls 被判为「读数不可信」（缺读数 ≠ 通过）');
});

test('v3428O5 C8. ★★★★★ 写盘闭环：错档的字节级形状 ⇒ 必须点名「写进别的会话」', () => {
    /* 这是 M-O1 最贵的一格：格子里的 chatId 与那一刻的当前会话不等 ⇒ 往别人的存档里塞了东西。
     *   刻意不用返回值证明（返回值是**声明**，chatId 是**事实**）。 */
    expectDefect((r) => {
        r.write.drain.calls = [
            { slotChatId: 'rh-suite-C', curChatId: 'rh-suite-C' },
            { slotChatId: 'rh-suite-C', curChatId: 'rh-suite-D' },
        ];
    }, 'write', '写进别的会话', 'c8');
    ok('slotChatId≠curChatId 被判为错档');
});

test('v3428O5 C9. ★★★★ 世界线纪元：四格期望逐格可归因（含「期望值必须写清为什么」）', () => {
    expectDefect((r) => { r.worldline.buckets.era1 = { bucket: 'kept', state: 'native', why: 'same-epoch' }; },
        'worldline', '第一纪元记忆在第 60 楼必须被挡', 'c9a');
    expectDefect((r) => { r.worldline.buckets.now = { bucket: 'blocked', state: 'foreign', why: 'x' }; },
        'worldline', '本纪元记忆必须放行', 'c9b');
    expectDefect((r) => { r.worldline.buckets.beta = { bucket: 'kept', state: 'native', why: 'x' }; },
        'worldline', '中间纪元记忆必须被挡', 'c9c');
    expectDefect((r) => { r.worldline.buckets.nolocate = { bucket: 'kept', state: 'native', why: 'x' }; },
        'worldline', '判不了，不许冒充本纪元', 'c9d');
    expectDefect((r) => { delete r.worldline.buckets.era1; }, 'worldline', '没出现在任何桶里', 'c9e');
    ok('四格 + 缺席各自点名（归因串里带「为什么必须是它」）');
});

test('v3428O5 C10. ★★★★ 世界线纪元：自动推进没发生 ⇒ 必须点名（含 why 透传）', () => {
    expectDefect((r) => { r.worldline.epochAdvance = { applied: false, floor: 60, why: 'no-current-floor', conflict: null }; },
        'worldline', '宿主必须自动推进纪元', 'c10a');
    expectDefect((r) => { r.worldline.epochAdvance.conflict = 'layer=α线 vs jumps=β线'; },
        'worldline', '层标记与跳跃表冲突', 'c10b');
    ok('applied=false 与 conflict 各自点名');
});

test('v3428O5 C11. ★★★★ 收尾：pageErrors「没读到」与「没有异常」不许同形', () => {
    expectDefect((r) => { r.pageErrors = ['TypeError: cannot read x']; }, 'tail', '真页面有未捕获异常', 'c11a');
    expectDefect((r) => { delete r.pageErrors; }, 'tail', '缺 pageErrors 读数', 'c11b');
    ok('有异常 / 缺读数 两格各自点名');
});

/* ══════════════ D 三条真源码破坏（各配原版对照） ══════════════ */
/** 破坏副本：写临时 .mjs ⇒ 语法自检 ⇒ 动态 import。判据体零 import，故单文件即可证伪。 */
function loadBroken(src, label) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3428o5-judge-'));
    const p = path.join(dir, 'judge_copy.mjs');
    fs.writeFileSync(p, src, 'utf8');
    const syn = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8' });
    assert.equal(syn.status, 0, label + '：破坏副本语法必须仍合法（否则「不翻红」不可归因于判据失效）：'
        + String(syn.stderr || '').slice(0, 200));
    return { dir, url: pathToFileURL(p).href };
}

test('v3428O5 D1. ★★★★★ 破坏下限比较 ⇒ 全局数不足这一格必须**不再**翻红（判据真承重）', async () => {
    const A = '    } else if (!(L.globals >= MIN_GLOBALS)) {';
    const R = '    } else if (!(L.globals >= 0)) {';
    assertSingleHit(JUDGE_SRC, A, 'v3428o5_d1');
    const broken = breakSource(JUDGE_SRC, A, R, 'v3428o5_d1');
    /* 原版对照：同一份坏读数在原判据上必须翻红（否则「不翻红」不能归因于破坏）。 */
    const r = good();
    r.load.globals = MIN_GLOBALS - 1;
    assert.equal(judgeLoad(r.load).length, 1, '原版必须点名全局数不足（实 ' + judgeLoad(r.load).length + '）');
    const { dir, url } = loadBroken(broken, 'd1');
    try {
        const mod = await import(url);
        assert.deepEqual(mod.judgeLoad(r.load), [], '破坏下限比较后仍然翻红 ⇒ 该判据不承重（假判据）');
        /* 反向兜底：破坏只摘这一格，其余三格仍须工作（防「整个函数被改废」被当成通过）。 */
        const r2 = good();
        r2.load.status = 'partial';
        assert.ok(mod.judgeLoad(r2.load).length >= 1, '破坏后其余装载面判据必须仍工作（否则破坏过头，归因无效）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    ok('D1 破坏后该格静默、原版对照翻红、其余判据不受影响');
});

test('v3428O5 D2. ★★★★★ 反转错档比较 ⇒ 错档这一格必须**不再**翻红', async () => {
    const A = '            && String(c.slotChatId) !== String(c.curChatId));';
    const R = '            && String(c.slotChatId) === String(c.curChatId));';
    assertSingleHit(JUDGE_SRC, A, 'v3428o5_d2');
    const broken = breakSource(JUDGE_SRC, A, R, 'v3428o5_d2');
    const r = good();
    r.write.drain.calls = [{ slotChatId: 'rh-suite-C', curChatId: 'rh-suite-D' }];
    assert.ok(hasMsg(judgeWrite(r.write), '写进别的会话'), '原版必须点名错档');
    const { dir, url } = loadBroken(broken, 'd2');
    try {
        const mod = await import(url);
        assert.ok(!hasMsg(mod.judgeWrite(r.write), '写进别的会话'),
            '反转比较后仍然点名错档 ⇒ 该判据不承重（字节级判据是 M-O1 最贵的一格，不许空转）');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    ok('D2 破坏后错档静默、原版对照点名');
});

test('v3428O5 D3. ★★★★★ 把「缺 pageErrors」当成「没有异常」⇒ 该格必须**不再**翻红', async () => {
    const A = '    const list = Array.isArray(pageErrors) ? pageErrors : null;';
    const R = '    const list = Array.isArray(pageErrors) ? pageErrors : [];';
    assertSingleHit(JUDGE_SRC, A, 'v3428o5_d3');
    const broken = breakSource(JUDGE_SRC, A, R, 'v3428o5_d3');
    assert.ok(judgePageErrors(undefined).length >= 1, '原版必须把缺读数记缺陷');
    const { dir, url } = loadBroken(broken, 'd3');
    try {
        const mod = await import(url);
        assert.deepEqual(mod.judgePageErrors(undefined), [], '破坏后仍报缺读数 ⇒ 判据不承重');
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    ok('D3 破坏后缺读数被当成「没有异常」，原版对照记缺陷');
});

/* ══════════════ E 三档退出真跑（环境缺失一律 exit 2，绝不编 0） ══════════════ */
/** 跑探针：临时 EXT 目录 + 可控 env。**不**需要 Chromium（三个用例都在起浏览器之前就 bail）。 */
function runProbe(extDir, extraEnv) {
    const env = Object.assign({}, process.env, {
        LONSHA_EXT_DIR: extDir,
        /* 判据体与探针都不该依赖跑它的机器：把 Chrome 指向一个**必然存在**的文件，
         *   让「浏览器缺失」这一档不抢在 ST 档前面（否则没装 Chromium 的机器上本档必红）。 */
        LONSHA_CHROME: process.execPath,
    }, extraEnv || {});
    const r = spawnSync(process.execPath, [PROBE], { cwd: ROOT, env, encoding: 'utf8', timeout: 120000 });
    return { rc: r.status === null ? -1 : r.status, out: (r.stdout || '') + (r.stderr || '') };
}
function withExt(fn) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3428o5-ext-'));
    try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

test('v3428O5 E1. ★★★★ 部署目录没有 manifest ⇒ exit 2 且报因具体（不是 0）', () => {
    withExt((dir) => {
        const r = runProbe(dir);
        assert.equal(r.rc, 2, '环境缺失必须 exit 2（实 ' + r.rc + '）：' + r.out.slice(-300));
        assert.ok(r.out.includes('manifest.json'), '必须点名缺的是 manifest.json');
        assert.ok(/环境缺失或探针失效/.test(r.out), '必须归到「环境缺失」，不许冒充结论');
    });
    ok('E1 无 manifest ⇒ exit 2');
});

test('v3428O5 E2. ★★★★★ 部署版本与仓库不一致 ⇒ exit 2 且给出「先同步」的出路', () => {
    withExt((dir) => {
        const deployed = JSON.parse(readRoot('manifest.json'));
        deployed.version = '3.0.0';
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(deployed, null, 2), 'utf8');
        const r = runProbe(dir);
        assert.equal(r.rc, 2, '版本不匹配必须 exit 2（实 ' + r.rc + '）：' + r.out.slice(-300));
        assert.ok(r.out.includes('3.0.0'), '必须报出真宿主装的是哪一版');
        assert.ok(/先把仓库文件同步到/.test(r.out), '必须给可执行出路（测旧版比测不出来更坏）');
    });
    ok('E2 版本不匹配 ⇒ exit 2 + 出路');
});

test('v3428O5 E3. ★★★★ ST 未就绪 ⇒ exit 2（不许在没有 ST 的页面上给结论）', () => {
    withExt((dir) => {
        fs.writeFileSync(path.join(dir, 'manifest.json'), readRoot('manifest.json'), 'utf8');
        const r = runProbe(dir, { LONSHA_ST_URL: 'http://127.0.0.1:1/' });
        assert.equal(r.rc, 2, 'ST 不可达必须 exit 2（实 ' + r.rc + '）：' + r.out.slice(-300));
        assert.ok(/ST 未就绪/.test(r.out), '必须点名 ST 未就绪（含实际状态码）');
        assert.ok(/先起 SillyTavern/.test(r.out), '必须给出可执行出路');
    });
    ok('E3 ST 未就绪 ⇒ exit 2 + 出路');
});

/* ══════════════ F 当版锚 + 登记面 ══════════════ */
test('v3428O5 F1. ★★ 当版锚（下限形）+ 两处登记面 + 锚点单命中 + 工具两向自证', () => {
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    const pkg = JSON.parse(readRoot('package.json')).version;
    assert.ok(vnum(pkg) >= vnum('3.428.0'), '本档版本下界 3.428.0 不得被绕过（实 ' + pkg + '）');
    const self = readRoot(TEST_REL);
    assert.ok(self.includes('const PROBE_REL = '), '自防护：套件须自持探针路径常量');
    assert.ok(self.includes('assertSingleHit'), '自防护：须用统一锚点校验器');
    /* 两处登记面：在役测试面名册（P3 双向对差会盯）与本档在 v3247 的接收方台账。
     *   本档从唯一真源取 breakSource / assertSingleHit ⇒ 按 B1 台账纪律必须登记。 */
    const roster = readRoot(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(/v3428_l12_o5_realhost_suite\.test\.mjs/.test(roster), '在役测试面名册须登记本套件');
    const reg = readRoot(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(/v3428_l12_o5_realhost_suite\.test\.mjs/.test(reg), 'v3247 接收方台账须登记本套件');
    /* 锚点纯度自证：三个破坏锚点在判据体里各恰中 1 次（就地钉住，防锚点漂移后破坏组静默空转）。 */
    assertSingleHit(JUDGE_SRC, '    } else if (!(L.globals >= MIN_GLOBALS)) {', 'v3428o5_h1');
    assertSingleHit(JUDGE_SRC, '            && String(c.slotChatId) !== String(c.curChatId));', 'v3428o5_h2');
    assertSingleHit(JUDGE_SRC, '    const list = Array.isArray(pageErrors) ? pageErrors : null;', 'v3428o5_h3');
    /* 工具两向自证：不存在的锚点必抛、同值替换必抛。 */
    assert.throws(() => assertSingleHit(JUDGE_SRC, 'const 绝不存在的锚点 = 1;', 'v3428o5_n0'), /锚点/, '锚点不存在必须抛');
    assert.throws(() => breakSource(JUDGE_SRC, 'export const MIN_GLOBALS = 85;', 'export const MIN_GLOBALS = 85;', 'v3428o5_same'),
        /改变|替换/, '同值替换必须抛');
    ok('当版下界 3.428.0；两处登记面齐全；三锚点单命中；两向自证通过');
});
