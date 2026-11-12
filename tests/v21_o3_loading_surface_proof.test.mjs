/* ============================================================
 * tests/v21_o3_loading_surface_proof.test.mjs — v3.463.0
 * —— 第二十一期 L21-O3：真机不可用 → 四态成因码 + 五段替代证据链
 * ------------------------------------------------------------
 * 计划原文的两条验收（本文件逐条落成判据）：
 *   ① 五段逐段可红（每段各配一条真源码破坏负控制）；
 *   ② `realhost_readings` 的 `cause` 四态互斥，`environment-unavailable` 时**必须**给 `cause`；
 *   ③ 诚实边界写进读数 `note`：**本证明不等价于真机**，真机结论仍只能由真机给。
 *
 * 【本文件治的是什么形态（先写清楚，免得判据变成摆设）】
 *   修前 `realhost_readings.json` 只有一句 `environment-unavailable`，且**没有任何门在读它**。
 *   三个真机套件 bail 掉之后，装载面就没人管了 —— 而 v3.461.0 修的 36 个 R18 内核
 *   整文件 ESM 语法错误的失效，正是**只有真装载才暴露**的。若只是「加一份读数」，
 *   下一版依旧靠人记得看；故本文件把「读数成立」变成门，并把五段各自钉成可红。
 *
 * 【判据清单（A 结构 / B 五段正控 / C 五段负控制 / D 口径 / E 成因码 / F 边界）】
 *   A1 探针与判定体分离：探针里不得留内联判定
 *   A2 五段枚举单源：SEGMENTS 一处定义，探针与汇总都按它
 *   A3 真仓读数落盘成功且五段全绿
 *   B1..B5 五段各自在真仓上成立（不是「总值绿」，是逐段看）
 *   C1 磁盘缺件 ⇒ S1 必红
 *   C2 语法破坏 ⇒ S2 必红（且 S1 不受牵连：段之间不连坐）
 *   C3 出口三通道全摘 ⇒ S3 必红（同时验证「方法挂载算合法出口」这个新增判定）
 *   C4 声明了却没挂上 ⇒ S4 必红
 *   C5 台账缺条 / 零消费 / 装载面洗白 ⇒ S5 必红（三态各一条）
 *   C6 dormant 项不得被算作缺陷（否则 S5 会把 L21-O1 的定性成果抹平）
 *   D1 五段的「答什么问题」措辞不许两处各写一份
 *   E1 四态互斥 + 每态可单独判出
 *   E2 environment-unavailable 时必须有 cause；cause 为 null 时探针不落盘
 *   E3 非环境成因必须显式分组（不许混进四态）
 *   F1 边界原文必须出现在读数与判定体导出里
 *   F2 equivRealhost 必须为 false（不许把替代证据吹成真机）
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import {
    SEGMENTS, SEGMENT_QUESTION, BOUNDARY,
    judgeDisk, judgeSyntax, judgeUmdTail, judgeGlobalEval, judgeLedger, judgeProof,
} from './audit/_loading_surface_judge.mjs';
import { ENV_CAUSES, NONENV_CAUSES, ALL_CAUSES, CAUSE_ACTION, classifyCause } from './audit/_realhost_judge.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const PROBE_SRC = read('tests/audit/loading_surface_proof.mjs');
const JUDGE_SRC = read('tests/audit/_loading_surface_judge.mjs');
const SUITE_SRC = read('tests/audit/_realhost_suite.mjs');
const PROOF_PATH = path.join(ROOT, 'tests/audit/loading_surface_proof.json');
const READINGS_PATH = path.join(ROOT, 'tests/audit/realhost_readings.json');
const ok = (m) => console.log('  ✓ ' + m);

/* 当版自锚（V4）：本文件以 vnum 恰好锚着当版 —— 锚必须住在**当版套件**里。
 *   写成字面量形而不是变量形，是为了让「哪一版立的项」在源码里一眼可见。 */
const SELF_VERSION = '3.463.0';
const vnum = (v) => String(v).split('.').map(Number);
test('v21O3 Z1. 当版锚点：本判据套件生于 v3.463.0', () => {
    /* 出生版本写成字面量（V4 靠它数到锚、读代码的人一眼看见「这版立的项」）。
     * ★ 比较用 `>=` 而不是相等：相等等于把历史测试钉死在出生那一版，
     *   每抬一版都得回来改成新数字 —— 那不是锚，是把死数伪装成判据（V3 治的形态）。
     *   本判据要守的是「仓库版本不得回退到本套件出生之前」，仅此。 */
    assert.deepEqual(vnum(SELF_VERSION), [3, 463, 0]);
    const manifest = JSON.parse(read('manifest.json'));
    const cmp = (a, b) => {
        for (let i = 0; i < 3; i++) { if (a[i] !== b[i]) return a[i] - b[i]; }
        return 0;
    };
    assert.ok(cmp(vnum(manifest.version), vnum(SELF_VERSION)) >= 0,
        '仓库版本 ' + manifest.version + ' 不得回退到本套件出生版本 v' + SELF_VERSION + ' 之前');
    ok('出生版本锚点 v' + SELF_VERSION + ' 在场（当前 ' + manifest.version + '）');
});

/* ── 真仓 world（只读一次，全文件复用） ── */
const manifest = JSON.parse(read('manifest.json'));
const ledgerRaw = JSON.parse(read('tests/audit/module_consumption_ledger.json'));
const triage = JSON.parse(read('tests/audit/l21_o1_triage.json'));
const dormant = Object.keys(triage.verdicts.declared_dormant.modules);
const cache = new Map();
const realWorld = {
    manifest,
    exists: (rel) => fs.existsSync(path.join(ROOT, rel)),
    readFile: (rel) => {
        if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'));
        return cache.get(rel);
    },
    ledger: ledgerRaw,
    dormant,
};

/**
 * 造一个「合成 world」：只含给定模块，内容由调用方决定。
 * 负控制一律在合成 world 上做 —— **不许改真仓源码**（会把别的判据连坐），
 * 也不许依赖真仓当前读数（那会让负控制随产品演进静默空转）。
 */
function synth(files) {
    const map = new Map(Object.entries(files));
    return {
        manifest: { version: '0.0.0-synth', extra_js: Object.keys(files) },
        exists: (rel) => map.has(rel),
        readFile: (rel) => map.get(rel),
        ledger: { modules: Object.fromEntries(Object.keys(files).map((f) => [f, {
            module: f, surface: ['X'], prod_call_sites: 3, business_call_sites: 3,
            load_surface_only: false, allowed: 1, why: 'active', callers: [],
        }])) },
        dormant: [],
    };
}
/** 一段合法的最小模块（IIFE + 宿主挂载 + 真挂得上）。 */
const GOOD_MOD = `(function () {
    'use strict';
    const api = { ping() { return 1; } };
    if (typeof window !== 'undefined') window.LonShaSynthProbe = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();`;

test('v21O3 A1. ★★★★ 探针与判定体分离：探针里不得留内联判定', () => {
    assert.ok(PROBE_SRC.includes("from './_loading_surface_judge.mjs'"),
        '探针必须从判定体 import（否则离线证伪的只是副本）');
    assert.ok(PROBE_SRC.includes('judgeProof('), '探针必须以 judgeProof 取判定');
    /* 反向：判定体的措辞不得在探针里再出现（出现即说明留了一份内联副本）。 */
    for (const w of ['声明了却没挂上', '没有任何导出通道', '台账记为零消费', '被取到 ≠ 被使用']) {
        assert.equal(PROBE_SRC.includes(w), false,
            '探针里残留内联判定措辞「' + w + '」—— 判定必须单源在 _loading_surface_judge.mjs');
    }
    ok('探针只做「读仓 → 交给判定体 → 落盘」，判定单源');
});

test('v21O3 A2. ★★★★ 五段枚举单源，且每段都答一个明确问题', () => {
    assert.deepEqual(SEGMENTS, ['disk', 'syntax', 'umd-tail', 'global-eval', 'ledger'], '五段名与顺序必须固定');
    for (const s of SEGMENTS) {
        assert.equal(typeof SEGMENT_QUESTION[s], 'string', '缺段问题措辞：' + s);
        assert.ok(SEGMENT_QUESTION[s].length > 8, '段问题措辞过短（说不清它答什么）：' + s);
    }
    /* 探针与判定体都不得各列一份段名清单。 */
    assert.ok(PROBE_SRC.includes('SEGMENTS'), '探针必须从判定体取段名，不许自己再列一份');
    const proof = judgeProof(synth({ 'probe-a.js': GOOD_MOD }));
    assert.deepEqual(Object.keys(proof.segments), SEGMENTS, 'judgeProof 的段顺序必须与 SEGMENTS 一致');
    ok('五段枚举单源，且每段都带「它答什么问题」');
});

test('v21O3 A3. ★★★★ 真仓读数落盘成功且五段全绿', () => {
    assert.ok(fs.existsSync(PROOF_PATH), '缺读数 tests/audit/loading_surface_proof.json（跑 node tests/audit/loading_surface_proof.mjs）');
    const proof = JSON.parse(fs.readFileSync(PROOF_PATH, 'utf8'));
    assert.equal(proof.schema, 'loading-surface-proof@1');
    assert.equal(proof.ok, true, '五段必须全绿；失败段：' + JSON.stringify(proof.failedSegments));
    assert.deepEqual(proof.failedSegments, []);
    assert.equal(proof.moduleCount, manifest.extra_js.length,
        '读数覆盖模块数必须等于 manifest.extra_js 长度（改动 manifest 后必须重跑探针）');
    ok('真仓五段全绿，覆盖 ' + proof.moduleCount + ' 个模块');
});

test('v21O3 B1. S1 disk：清单每项在磁盘上非空（真仓）', () => {
    const r = judgeDisk(realWorld);
    assert.equal(r.ok, true, 'S1 必须成立：' + JSON.stringify(r.defects.slice(0, 5)));
    assert.equal(r.checked, manifest.extra_js.length);
    ok('S1 成立：' + r.checked + ' 项全部在盘且非空');
});

test('v21O3 B2. S2 syntax：全部模块可编译（v3.461.0 那类整文件语法错误的门）', () => {
    const r = judgeSyntax(realWorld);
    assert.equal(r.ok, true, 'S2 必须成立：' + JSON.stringify(r.defects.slice(0, 5)));
    ok('S2 成立：' + r.checked + ' 个模块全部可编译');
});

test('v21O3 B3. S3 umd-tail：形态合法（包装 + 至少一条出口通道）', () => {
    const r = judgeUmdTail(realWorld);
    assert.equal(r.ok, true, 'S3 必须成立：' + JSON.stringify(r.defects.slice(0, 5)));
    ok('S3 成立：' + r.checked + ' 个模块都有包装与出口通道');
});

test('v21O3 B4. S4 global-eval：按 manifest 顺序累积装载，声明过的全局名全部真挂上', () => {
    const r = judgeGlobalEval(realWorld);
    assert.equal(r.ok, true, 'S4 必须成立：' + JSON.stringify(r.defects.slice(0, 5)));
    assert.equal(r.evaluated, manifest.extra_js.length, '必须逐个真求值（少一个就是有文件被跳过）');
    assert.ok(r.mountedTotal > 0, '累积装载后必须真挂上全局名（否则证明的是空上下文）');
    ok('S4 成立：' + r.evaluated + ' 个模块真求值，挂上 ' + r.mountedTotal + ' 个全局名');
});

test('v21O3 B5. S5 ledger：台账每条有真实业务消费，dormant 单列不静默吞', () => {
    const r = judgeLedger(realWorld);
    assert.equal(r.ok, true, 'S5 必须成立：' + JSON.stringify(r.defects.slice(0, 5)));
    assert.equal(r.dormantExcluded, dormant.length,
        'dormantExcluded 必须等于 triage 表里的 declared_dormant 条数（少一条就是把休眠记成了成立）');
    ok('S5 成立：' + r.checked + ' 条台账对账通过，' + r.dormantExcluded + ' 条 dormant 单列');
});

test('v21O3 C1. ★★★ 负控制：磁盘缺件 ⇒ S1 必红（其余段不连坐）', () => {
    const files = { 'present.js': GOOD_MOD };
    const w = synth(files);
    w.manifest.extra_js.push('absent.js');   // 清单里有、磁盘没有
    const s1 = judgeDisk(w);
    assert.equal(s1.ok, false, 'S1 必须红');
    assert.ok(s1.defects.some((d) => d.includes('absent.js') && d.includes('不存在')),
        'S1 必须点名缺的那个文件：' + JSON.stringify(s1.defects));
    ok('S1 对「清单有、磁盘无」翻红并点名');
});

test('v21O3 C2. ★★★ 负控制：语法坏 ⇒ S2 必红，且 S1 不连坐', () => {
    const w = synth({ 'broken.js': '(function () { const a = ; })();' });
    const s2 = judgeSyntax(w);
    assert.equal(s2.ok, false, 'S2 必须红');
    assert.ok(s2.defects.some((d) => d.startsWith('broken.js')), 'S2 必须点名坏文件');
    const s1 = judgeDisk(w);
    assert.equal(s1.ok, true, 'S1 只管「在不在、空不空」，语法坏不该让它也红（否则红不可归因）');
    ok('S2 对语法坏翻红，S1 不连坐');
});

test('v21O3 C3. ★★★ 负控制：三种出口全摘 ⇒ S3 必红；只留方法挂载 ⇒ 必须绿', () => {
    const noExit = `(function () { 'use strict'; const api = { a: 1 }; })();`;
    const w1 = synth({ 'no-exit.js': noExit });
    const r1 = judgeUmdTail(w1);
    assert.equal(r1.ok, false, 'S3 必须红（三种出口全无）');
    assert.ok(r1.defects.some((d) => d.includes('没有任何导出通道')), '必须点名「没有导出通道」');

    /* 方法挂载是**合法出口**（settings-ui.js 的真实形态）：只有它也必须绿。 */
    const methodOnly = `(function () {
        'use strict';
        const plugin = window.LonShaMemory || (window.LonShaMemory = {});
        plugin.showSynthPanel = function () { return true; };
    })();`;
    const r2 = judgeUmdTail(synth({ 'method-only.js': methodOnly }));
    assert.equal(r2.ok, true, '只靠方法挂载必须是合法出口：' + JSON.stringify(r2.defects));
    ok('S3 对「无出口」翻红，且认「方法挂载」为合法出口');
});

test('v21O3 C4. ★★★ 负控制：声明了却没挂上 ⇒ S4 必红', () => {
    /* 负控：声明写在**不可达分支**里 ⇒ 全局名永远挂不上，但静态看「声明过」。 */
    const unreachable = `(function () {
        'use strict';
        if (false) { window.LonShaGhostNever = { x: 1 }; }
        const api = { y: 2 };
        if (typeof module !== 'undefined' && module.exports) module.exports = api;
    })();`;
    const r = judgeGlobalEval(synth({ 'unreachable.js': unreachable }));
    assert.equal(r.ok, false, 'S4 必须红：声明在不可达分支里，全局名不会真挂上');
    assert.ok(r.defects.some((d) => d.includes('LonShaGhostNever') && d.includes('没挂上')),
        'S4 必须点名没挂上的那个名字：' + JSON.stringify(r.defects));
    /* 正控对照：**同一形状但可达**的挂载必须绿 —— 否则这条负控制可能只是「什么都判红」。 */
    const reachable = `(function () {
        'use strict';
        if (true) { window.LonShaGhostReachable = { x: 1 }; }
        const api = { y: 2 };
        if (typeof module !== 'undefined' && module.exports) module.exports = api;
    })();`;
    const r2 = judgeGlobalEval(synth({ 'reachable.js': reachable }));
    assert.equal(r2.ok, true, '可达的挂载必须绿（对照）：' + JSON.stringify(r2.defects));
    ok('S4 对「声明在不可达分支」翻红并点名，同形状可达版为绿');
});

test('v21O3 C5. ★★★ 负控制：台账缺条 / 零消费 / 装载面洗白 ⇒ S5 三态各红一次', () => {
    const w = synth({ 'a.js': GOOD_MOD, 'b.js': GOOD_MOD, 'c.js': GOOD_MOD });
    /* ① 缺条 */
    delete w.ledger.modules['a.js'];
    const r1 = judgeLedger(w);
    assert.equal(r1.ok, false);
    assert.ok(r1.defects.some((d) => d.includes('a.js') && d.includes('审计盲区')), JSON.stringify(r1.defects));
    /* ② 零消费 */
    w.ledger.modules['a.js'] = { module: 'a.js', prod_call_sites: 0, business_call_sites: 0, why: 'active' };
    const r2 = judgeLedger(w);
    assert.ok(r2.defects.some((d) => d.includes('a.js') && d.includes('零消费')), JSON.stringify(r2.defects));
    /* ③ 装载面洗白 */
    w.ledger.modules['a.js'] = { module: 'a.js', prod_call_sites: 1, business_call_sites: 0, load_surface_only: true, why: 'load_surface_only' };
    const r3 = judgeLedger(w);
    assert.ok(r3.defects.some((d) => d.includes('a.js') && d.includes('装载面')), JSON.stringify(r3.defects));
    /* ④ 复原后必须绿（证明上面三次红都是「这一条」干的，不是整段永远红） */
    w.ledger.modules['a.js'] = { module: 'a.js', prod_call_sites: 3, business_call_sites: 3, why: 'active' };
    assert.equal(judgeLedger(w).ok, true, '复原后必须绿（否则上面的红不可归因）');
    ok('S5 三态各红一次，复原后转绿（可归因）');
});

test('v21O3 C6. ★★★ dormant 不得被算作缺陷（否则抹平 L21-O1 的定性成果）', () => {
    const w = synth({ 'sleeping.js': GOOD_MOD, 'awake.js': GOOD_MOD });
    /* 休眠项：真实形状是「只有装载面引用」——若 S5 不认 dormant，它会被当缺陷。 */
    w.ledger.modules['sleeping.js'] = {
        module: 'sleeping.js', prod_call_sites: 1, business_call_sites: 0,
        load_surface_only: true, why: 'load_surface_only',
    };
    w.dormant = ['sleeping.js'];
    const r = judgeLedger(w);
    assert.equal(r.ok, true, 'declared_dormant 项必须是「单列」，不是「缺陷」：' + JSON.stringify(r.defects));
    assert.equal(r.dormantExcluded, 1, '必须单列计数，不许静默吞掉');
    ok('dormant 单列不报缺陷，但计数必须看得见');
});

test('v21O3 D1. 段的措辞单源：探针与判定体不得各写一份', () => {
    assert.ok(JUDGE_SRC.includes('export const SEGMENT_QUESTION'), '段问题措辞必须在判定体导出');
    assert.ok(JUDGE_SRC.includes('export const BOUNDARY'), '边界原文必须在判定体导出');
    /* 探针不得把边界原文再抄一遍（抄了就会两处分叉）。 */
    const snippet = BOUNDARY.slice(0, 24);
    assert.equal(PROBE_SRC.includes(snippet), false, '探针里抄了边界原文（应只从判定体取）');
    ok('段问题与边界原文均单源');
});

test('v21O3 E1. 成因四态互斥，且每态都能被单独判出', () => {
    assert.equal(ALL_CAUSES.length, ENV_CAUSES.length + NONENV_CAUSES.length, '成因码不得重复登记');
    assert.equal(new Set(ALL_CAUSES).size, ALL_CAUSES.length, '成因码必须互斥（无重复）');
    const cases = [
        [{ binPresent: false }, 'no-browser-driver'],
        [{ stStatus: 0 }, 'no-st-endpoint'],
        [{ stTimedOut: true }, 'endpoint-timeout'],
        [{ stStatus: 200, stVersion: '1.12.0', stSupported: ['1.13.0'] }, 'st-version-mismatch'],
    ];
    for (const [env, want] of cases) {
        const r = classifyCause(env);
        assert.equal(r.cause, want, '必须判出 ' + want + '，实 ' + r.cause + '（' + r.why + '）');
        assert.equal(r.group, 'env', want + ' 必须归 env 组');
        assert.equal(typeof r.action, 'string');
        assert.ok(r.action.length > 8, want + ' 必须给出「下一步谁动手」');
    }
    ok('四态互斥且逐态可判，每态都带处置建议');
});

test('v21O3 E2. environment-unavailable 时必须给 cause；判不出时探针不落盘', () => {
    /* ① 落盘分支必须带 cause 字段（结构化，不是写在 reason 里）。 */
    assert.ok(/cause:\s*verdict\.cause/.test(SUITE_SRC), '探针落盘必须写 cause 字段');
    assert.ok(SUITE_SRC.includes('causeAction') && SUITE_SRC.includes('causeGroup'),
        '落盘必须带 causeGroup / causeAction（否则成因码只是一个词，答不了「谁动手」）');
    /* ② 判不出 ⇒ 不落盘（宁可留上一份真读数，也不写一份「成因未知」）。 */
    assert.ok(/verdict\.cause === null/.test(SUITE_SRC), '必须有「判不出则不落盘」的分支');
    assert.ok(SUITE_SRC.includes('未能归因'), '判不出时必须如实报（不得静默）');
    /* ③ 真读数：未执行时必须有 cause，且必须是合法成因码之一。 */
    const evidence = JSON.parse(fs.readFileSync(READINGS_PATH, 'utf8'));
    if (evidence.verdict === 'environment-unavailable') {
        assert.equal(typeof evidence.cause, 'string',
            'environment-unavailable 时必须给 cause（修前只有一句 reason，那正是本项要治的）');
        assert.ok(ALL_CAUSES.includes(evidence.cause),
            'cause 必须是合法成因码之一，实 ' + evidence.cause);
        assert.equal(typeof evidence.causeAction, 'string', '必须带处置建议');
        assert.ok(evidence.causeAction.length > 8);
    }
    ok('未执行读数带成因码与处置（实 cause=' + evidence.cause + '）');
});

test('v21O3 E3. 非环境成因显式分组，不许混进四态', () => {
    assert.deepEqual(NONENV_CAUSES.slice().sort(),
        ['deploy-unsynced', 'plugin-not-mounted', 'probe-self-fault'].sort(),
        '非环境成因必须明列（这三档不是「人动环境」能解决的）');
    for (const c of NONENV_CAUSES) {
        assert.equal(ENV_CAUSES.includes(c), false, c + ' 不得同时算环境成因');
        assert.ok(CAUSE_ACTION[c], c + ' 缺处置建议');
    }
    const r = classifyCause({ probeOk: false });
    assert.equal(r.group, 'non-env', '探针自身失效必须归 non-env（否则会被当成「环境不可用」而无限期挂着）');
    const r2 = classifyCause({ deploy: 'version-mismatch' });
    assert.equal(r2.cause, 'deploy-unsynced');
    const r3 = classifyCause({ stStatus: 200, mounted: 'missing' });
    assert.equal(r3.cause, 'plugin-not-mounted', '插件不在场是**产品缺陷**，不得记成环境缺失');
    ok('非环境三档显式分组，且各自归因正确');
});

test('v21O3 F1. 诚实边界必须写进读数（本证明不等价于真机）', () => {
    const proof = JSON.parse(fs.readFileSync(PROOF_PATH, 'utf8'));
    assert.equal(typeof proof.boundary, 'string');
    assert.ok(proof.boundary.includes('不等价于真机'), '边界原文必须明确「不等价于真机」：' + proof.boundary);
    assert.ok(proof.boundary.includes('_realhost_suite.mjs'), '边界必须指向真机套件（说清谁才能给真机结论）');
    /* 真机未执行读数也必须带同一条边界（两处读数不许有两种说法）。 */
    const evidence = JSON.parse(fs.readFileSync(READINGS_PATH, 'utf8'));
    if (evidence.verdict === 'environment-unavailable') {
        assert.ok(String(evidence.note || '').includes('不是真机通过'),
            '成因读数必须自述「不是真机通过」（否则下一个人会把它当结论）');
    }
    ok('两处读数都写明「不等价于真机」并指向真机套件');
});

test('v21O3 F2. equivRealhost 必须为 false（不许把替代证据吹成真机）', () => {
    const proof = JSON.parse(fs.readFileSync(PROOF_PATH, 'utf8'));
    assert.equal(proof.equivRealhost, false, 'equivRealhost 必须显式为 false');
    /* 负控制：判定体必须**始终**输出 false —— 哪怕五段全绿。 */
    const synthProof = judgeProof(synth({ 'a.js': GOOD_MOD }));
    assert.equal(synthProof.equivRealhost, false, '五段全绿的合成证明也不得声称等价真机');
    assert.equal(synthProof.segments['disk'].ok, true, '对照：这一段该是绿的（否则本条测的不是 equivRealhost）');
    ok('equivRealhost 恒为 false（全绿也不改口）');
});

test('v21O3 G1. 五段各自可独立判红（不合成一个布尔）', () => {
    /* 造一份「五段同时坏」的 world：每段都必须各自报自己的问题，不许只报一句「不一致」。 */
    const w = synth({ 'ok.js': GOOD_MOD });
    w.manifest.extra_js.push('missing.js');
    w.readFile = ((orig) => (rel) => {
        if (rel === 'ok.js') return '(function () { const a = ; })();';   // 语法坏 + 无出口
        return orig(rel);
    })(w.readFile);
    w.ledger.modules['ok.js'] = { module: 'ok.js', prod_call_sites: 0, business_call_sites: 0, why: 'active' };
    const proof = judgeProof(w);
    assert.equal(proof.ok, false);
    assert.equal(proof.failedSegments.length >= 3, true,
        '至少三段必须各自红（实 ' + JSON.stringify(proof.failedSegments) + '）');
    for (const seg of proof.failedSegments) {
        assert.ok(proof.segments[seg].defects.length > 0, '失败段 ' + seg + ' 必须有自己的 defects（不许空）');
    }
    ok('五段各自报自己的问题：' + proof.failedSegments.join(' / '));
});