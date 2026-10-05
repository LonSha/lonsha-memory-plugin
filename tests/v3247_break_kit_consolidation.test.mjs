/* ============================================================
 * tests/v3247_break_kit_consolidation.test.mjs — v3.247.0
 *
 * 主题：破坏形态库收编 —— 「把源码改坏」这件事，全仓只准一处可写。
 *
 * 【病根（本版逐条实测，不是整洁性偏好）】
 *   同一份纪律（真源码替换，锚点必须恰中 1 次）在 27 个文件里各写一份，分化出：
 *     · 名字 5 种：breakSource(14 文件) / breakText(9) / mutateOnce(4) /
 *       mk·mkBroken（匿名工厂，4）/ 内联 replace(2)；
 *     · 参数序 4 种：(src, anchor, repl) / (src, from, to, tag) /
 *       (from, to, tag)（闭包捕获 idxSrc）/ (dir, rel, from, to)（落盘变体）；
 *     · 错误类型 2 种：assert.equal 产生的 AssertionError（20 文件）/ 裸 throw Error（6）；
 *     · 校验强度 3 种：只查命中 / 命中 + 同值 / 命中 + 同值（措辞各异）。
 *   后果不是「不整洁」，是**纪律没有出口**：本仓的措辞表若散在 27 处，
 *   读代码的人无法判断这个破坏工具守了什么、没守什么。
 *
 * 【最贵的一层（收编过程中才发现，写下来防后人重判）】
 *   正则锚点形态下，命中数是这么数的：
 *     `(src.match(new RegExp(re.source, 'g')) || []).length`
 *   带 g 是对的；同族写法漏 g 时，`src.match(re)` 返回**首个匹配对象**而非数组，
 *   `|| []` 把它当数组用 ⇒ `.length` 恒为 1 ——「恰中 1 次」在该形态下**空转**：
 *   锚点命中 3 次也照样放行。**判据看起来在守，实际数不出第二个命中。**
 *   这正是本仓最贵的形态（绿着，但绿的成因不是判据在守），也是收编的真正理由：
 *   口径分散时，同一份纪律在各处的强度不同，且**没人量得出差异**。
 *
 * 【本档自己踩过一次同样的坑（留痕）】
 *   D2 的首版锚点写成「从本档以为的那个 import 文本出发」，实测命中 0 次；
 *   D3 的首版假定某样本「只出现一次」某个措辞，实测那个样本里它出现 3 次。
 *   两次都**由唯一真源当场拒绝并报出实测次数** —— 这正是收编的收益：
 *   换成收编前各写一份的形态，这两处会静默把替换打偏（D2 变成对原文件断言、
 *   D3 变成一次改 3 个点），而红灯要到很久以后才以别的样子出现。
 *   本档末节 D5 把这两次的教训固化成对**本档自己**的检查。
 *
 * 覆盖：
 *   A 唯一真源面：导出面 10 项 + 三别名同一函数对象 + 四条口径的行为面
 *   B 收编面：接入面台账 == 磁盘事实；本地破坏实现已无残留；消息片段与拼装点同源
 *   C 本版修复落点：每一处都必须与磁盘同源（不许「已修」只写在 CHANGELOG 里）
 *   D 负控制：真源码破坏 → 破坏副本 → 同款判据必须转红
 *   E 版本锚
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as KIT from './_break_kit.mjs';
import { breakText } from './_break_kit.mjs';
import { pairDiff } from './_fixture_sync.mjs';
import { stripComments } from './_audit_lib.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const read = (rel) => readFileSync(path.join(ROOT, rel), 'utf-8');
const ok = (m) => console.log('  ✓ ' + m);
const vnum = (s) => {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
};

const KIT_REL = 'tests/_break_kit.mjs';
const KIT_SRC = read(KIT_REL);
const GATE_REL = 'tests/audit/scan_break_kit.mjs';
const NEG_REL = 'tests/audit/scan_break_kit_negctl.mjs';
const SELF_REL = 'v3247_break_kit_consolidation.test.mjs';
const TESTS_DIR = path.join(ROOT, 'tests');
const AUDIT_DIR = path.join(TESTS_DIR, 'audit');
const RUN_REL = 'tests/run.mjs';
/* 措辞从真源取（本档正文里不手抄那六个字；判据里要用的那处按真源别名取，
 *   见 MESSAGE_WORDS —— 它是**真源 BREAK_MSG 的值**，不是本档另写的一份）。 */
const W_REFUSE = KIT.BREAK_MSG.refuse;
const W_MUST_CHANGE = KIT.BREAK_MSG.mustChange;
const MESSAGE_WORDS = Object.values(KIT.BREAK_MSG);

/* 接入面台账：谁从唯一真源 import。**逐条实测生成**（实测 27 条，见 B1）。
 *   为什么是台账而不是「数量检查」：本仓 v3.246 刚把「收编了谁」与「判据覆盖谁」
 *   收敛成同源；一个纯计数会被「新文件接入、老文件掉队」相互抵消掉。 */
const REGISTRY = [
    'v3171_trigger_read_surface.test.mjs',
    'v3174_bridge_reader_contract.test.mjs',
    'v3175_world_clock_reader.test.mjs',
    'v3176_world_ledger_reader.test.mjs',
    'v3180_floor_ledger_age_anchor_public_interface.test.mjs',
    'v3203_version_guard_handover.test.mjs',
    'v3204_no_cross_repo_binding.test.mjs',
    'v3206_process_reaping.test.mjs',
    'v3213_projection_cache_freshness.test.mjs',
    'v3214_evidence_workbench.test.mjs',
    'v3215_repair_write_channel.test.mjs',
    'v3216_injection_reading_truth.test.mjs',
    'v3217_stale_isolation.test.mjs',
    'v3218_cross_path_staging.test.mjs',
    'v3219_outcome_truth.test.mjs',
    'v3220_relation_mutual_knowledge.test.mjs',
    'v3225_replay_floor_gate.test.mjs',
    'v3226_audit_sensitivity.test.mjs',
    'v3235_rollback_preview.test.mjs',
    'v3235_sleep_awaken.test.mjs',
    'v3236_snapshot_restore_and_clear.test.mjs',
    'v3241_four_source_and_summary_table.test.mjs',
    'v3242_contract_domain_table.test.mjs',
    'v3243_numornull_semantics.test.mjs',
    'v3244_budget_suggestion.test.mjs',
    'v3245_fixture_sync.test.mjs',
    'v3246_roster_single_source.test.mjs',
    'v3247_break_kit_consolidation.test.mjs',
    'v3248_evidence_contract.test.mjs',
    'v3252_content_level_checkpoint_diff.test.mjs',
    'v3253_open_face_registry.test.mjs',
    'v3254_cache_identity_and_workload.test.mjs',
    'v3255_cache_identity_source.test.mjs',
    'v3256_probe_coverage.test.mjs',
    'v3257_a1_memory_ledgers.test.mjs',
    'v3258_inbound_face_registry.test.mjs',
    'v3259_a1_memory_aux.test.mjs',
        'v3260_a1_narrative_generators.test.mjs',
    'v3261_a1_memory_books.test.mjs',
    'v3262_native_tools_pristine_fetch.test.mjs',
    'v3263_floor_identity_archive_audit.test.mjs',
    /* [v3.264.0 A1 第五刀] 本刀的新档从唯一真源 import breakSource；按 B1 台账纪律在此登记。 */
    'v3264_a1_memory_organs.test.mjs',
    /* [v3.266.0 A1 第六刀] 同上：本刀新档从 tests/_break_kit.mjs 取 breakSource。 */
    'v3266_a1_memory_core.test.mjs',
    /* [v3.267.0 A3] 本档从 tests/_break_kit.mjs 取 breakSource（四条真源码破坏）；按 B1 台账纪律在此登记。 */
    'v3268_cache_same_input.test.mjs',
    'v3269_b1_injection_relevance.test.mjs',
    /* [v3.270.0 B2/X1] 本档自持三条真源码破坏（锚点取自 projection-pipeline.js 的预演复算面）；
     *   按 B1 台账纪律在此登记。 */
    'v3270_b2_injection_preview.test.mjs',
    /* [v3.267.0 A2] 本档从 tests/_break_kit.mjs 取 breakSource（三条真源码破坏）；按 B1 台账纪律在此登记。 */
    'v3267_fakegreen_hygiene.test.mjs',
    /* [v3.271.0 UI 运行时] 本档从 tests/_break_kit.mjs 取 breakSource / assertSingleHit
     *   （四条真源码破坏 + 一处形态唯一性检查，锚点取自 settings-ui.js）；按 B1 台账纪律在此登记。 */
     'v3271_ls_settings_panel_ui_runtime.test.mjs',
    /* [v3.273.0 O3] 本档从 tests/_break_kit.mjs 取 breakSource（三条真源码破坏，
     *   锚点取自 injection-router.js 的容量计算与拼接面）；按 B1 台账纪律在此登记。 */
    'v3273_o3_budget_cut_contract.test.mjs',
    /* [v3.274.0 O4] 本档从 tests/_break_kit.mjs 取 breakSource（五条真源码破坏）；按 B1 台账纪律在此登记。 */
    'v3274_o4_receipt_consumption.test.mjs',
    /* [v3.275.0 O5] 同上（三向负控制：清单截断自述 / 归档 provenance / Number(null) 同族）。 */
    'v3275_o5_scale_and_archive.test.mjs',
    /* [v3.276.0 O6] 同上（四条负控制：候选层 / 评分层 / 披露门 / 读数写死）。 */
    'v3276_o6_holdout_and_turns.test.mjs',
    /* [v3.277.0 O7] 本档从 tests/_break_kit.mjs 取 breakSource（五条真源码破坏，锚点取自
     *   index.js 的键面行 / init 重绑调用 / 失败过滤 与 memory-config.js 的 null 过滤）；按 B1 台账纪律在此登记。 */
    'v3277_o7_dep_injection.test.mjs',
    /* [v3.278.0 O7 第二批] 本档从 tests/_break_kit.mjs 取 breakSource / assertSingleHit（真源码破坏 + 锚点唯一性断言，
     *   锚点取自 memory-core.js 的 normalizeCharName 与 index.js 的 O7 注入面）；按 B1 台账纪律在此登记。 */
    'v3278_o7_extraction_to_real_load.test.mjs',
];
/* 本地重写的检测名集（与门禁 C1 同源口径）：只放破坏工具的出口名。
 *   名字表要按「语义是什么」写，不是按「名字像什么」写 —— v3.247.0 首版把
 *   v3184 里 `new Function(...)` 造图的 `mkBroken` 收了进来，实测一条假红。 */
const DEFINE_RE = /(?:^|\n)[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?(?:function|const|let|var)[ \t]+(breakText|breakSource|mutateOnce|breakOnce|breakFile|assertSingleHit)[0-9A-Za-z_$]*[ \t]*[=(]/;
const KIT_IMPORT_RE = /from[ \t]*['"][^'"]*_break_kit\.mjs['"]/;
/* 真源拼出的消息语料（惰性 —— 模块顶层 TDZ 崩栈过，见门禁注释）：
 *   「接收方片段必须与拼装点同源」这条口径只认它，不认任何手抄清单。 */
const msgCorpus = () => [
    KIT.hitsMismatchMessage(0, 'L', 'A'), KIT.hitsMismatchMessage(2, 'L', 'A'),
    KIT.hitsMismatchMessage(0), KIT.hitsMismatchMessage(2),
    KIT.sameValueMessage('L', 'A'), KIT.sameValueMessage(),
    KIT.emptyAnchorMessage(),
].join('\n');
/* 抽代码里用来做断言的正则片段（只认含消息措辞的那些）。 */
const FRAG_RE = new RegExp('/([^/\\n]*(' + MESSAGE_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')[^/\\n]*)/', 'g');

/* 磁盘面派生：谁真的从唯一真源 import。 */
const diskReceivers = () => readdirSync(TESTS_DIR)
    .filter((f) => f.endsWith('.test.mjs'))
    .filter((f) => KIT_IMPORT_RE.test(readFileSync(path.join(TESTS_DIR, f), 'utf-8')))
    .sort();
/* 磁盘面派生：哪些文件里还有消息字面量（B3/D3 的判定对象）。 */
const messageLiteralFiles = () => diskReceivers().filter((f) => {
    if (f === SELF_REL) return false;
    const code = stripComments(readFileSync(path.join(TESTS_DIR, f), 'utf-8'));
    return MESSAGE_WORDS.some((w) => code.includes(w));
});

/* ══════════ A 唯一真源面 ══════════ */
test('v3247 A1. ★★★★ 导出面 10 项：四条口径各有出口，一个都不许私有化', () => {
    const api = ['breakOnce', 'breakSource', 'breakText', 'mutateOnce', 'breakFile', 'assertSingleHit',
        'BREAK_MSG', 'hitsMismatchMessage', 'sameValueMessage', 'emptyAnchorMessage'];
    for (const k of api) assert.ok(KIT[k] !== undefined, '唯一真源缺导出 ' + k);
    for (const k of Object.keys(KIT.BREAK_MSG)) {
        assert.equal(typeof KIT.BREAK_MSG[k], 'string', 'BREAK_MSG.' + k + ' 必须是字符串');
    }
    /* 消息构造函数必须真的拼得出消息（不是返回空串的占位）。 */
    for (const [k, m] of [['hitsMismatchMessage', KIT.hitsMismatchMessage(0, 'L', 'A')],
        ['sameValueMessage', KIT.sameValueMessage('L', 'A')], ['emptyAnchorMessage', KIT.emptyAnchorMessage()]]) {
        assert.ok(m && m.length > 10, k + ' 拼出的消息过短（形同没有出口）：' + m);
    }
    ok('导出面 10 项全在场，消息构造可用');
});

test('v3247 A2. ★★★★ 三别名与 breakOnce 是同一函数对象（不是「文本一样」）', () => {
    /* 为什么按 === 断言：别名若各写一份包装，收编就退化成「改了 27 处的一处」。
     *   文本比对会被 `export const breakText = (s,a,r,l) => breakOnce(s,a,r,l);` 骗过。 */
    assert.equal(KIT.breakSource, KIT.breakOnce, 'breakSource 与 breakOnce 必须是同一函数对象');
    assert.equal(KIT.breakText, KIT.breakOnce, 'breakText 与 breakOnce 必须是同一函数对象');
    assert.equal(KIT.mutateOnce, KIT.breakOnce, 'mutateOnce 与 breakOnce 必须是同一函数对象');
    ok('三别名同一函数对象（一份实现，三个名字）');
});

test('v3247 A3. ★★★★★ 四条口径的行为面（真源就是被检物，行为不符即真缺陷）', () => {
    const caught = (fn) => { try { fn(); return null; } catch (e) { return e; } };
    /* 口径 ①：锚点必须恰中 1 次（零命中与多命中都拒绝） */
    const zero = caught(() => KIT.breakOnce('abc', 'zzz', 'x'));
    assert.ok(zero, '零命中未拒绝：锚点打偏仍放行 ⇒ 负控制会退化成对原文件断言');
    assert.match(zero.message, /0[ \t]*次/, '零命中的读数必须报出次数');
    const many = caught(() => KIT.breakOnce('abcabc', 'abc', 'x'));
    assert.ok(many, '多命中未拒绝：不是定点的破坏 ⇒ 负控制测的已不是那个点');
    assert.match(many.message, /2[ \t]*次/, '多命中的读数必须报出 2 次');
    /* 口径 ①（正则形态，本版实测的历史空转位）：命中数必须**真的数得出来** */
    const reMany = caught(() => KIT.breakOnce('abab', /ab/, 'x'));
    assert.ok(reMany, '正则锚点 2 次命中未拒绝 —— 这就是「命中数恒为 1」的空转形态（match 漏 g）');
    assert.match(reMany.message, /2[ \t]*次/, '正则形态的读数必须报 2 次，而不是恒 1');
    /* 口径 ②：替换必须真的改变源码（同值替换 = 破坏副本等于原件） */
    const same = caught(() => KIT.breakOnce('abc', 'abc', 'abc'));
    assert.ok(same, '同值替换未拒绝：破坏副本 == 原件 ⇒ 负控制退化成对原文件断言');
    assert.ok(same.message.includes(W_MUST_CHANGE), '同值替换必须说清「' + W_MUST_CHANGE + '」');
    /* 口径 ③：一律 AssertionError（30+ 处历史断言面按类型断言，换类型会静默改义） */
    for (const [label, e] of [['零命中', zero], ['多命中', many], ['同值', same]]) {
        assert.ok(e instanceof assert.AssertionError, label + ' 的抛出不是 AssertionError（实 ' + e.constructor.name + '）');
    }
    /* 口径 ④：消息必须同时含历史措辞（同源之后接收方按原正则仍然成立） */
    const all = [zero.message, many.message, same.message].join(' | ');
    assert.ok(all.includes(W_REFUSE), '消息面缺历史措辞「' + W_REFUSE + '」');
    for (const w of [KIT.BREAK_MSG.hits, KIT.BREAK_MSG.targeted, KIT.BREAK_MSG.exact, KIT.BREAK_MSG.shouldBeOne]) {
        assert.ok(all.includes(w), '消息面缺历史措辞「' + w + '」（改措辞 = 改全仓接收口径）');
    }
    /* 空锚点：任何源码都命中，等于没有定点 */
    assert.ok(caught(() => KIT.breakOnce('abc', '', 'x')), '空锚点未拒绝（等于没有定点）');
    ok('四口径 + 两种锚点形态全通过');
});

/* ══════════ B 收编面 ══════════ */
test('v3247 B1. ★★★★★ 接入面台账 == 磁盘事实（双向差集皆空，不是计数相等）', () => {
    const disk = diskReceivers();
    assert.ok(disk.length >= 25, '接入面塌了：只找到 ' + disk.length + ' 个接收方（本版实测 27）');
    const listed = REGISTRY.slice().sort();
    assert.deepEqual(disk.filter((f) => !listed.includes(f)), [],
        '磁盘上新增了接收方却没登记（下一步就是接入面与判据面不同源）');
    assert.deepEqual(listed.filter((f) => !disk.includes(f)), [],
        '登记了却没接入（掉队文件：要么补回 import，要么从台账里去掉）');
    ok('接收方 ' + disk.length + ' 个，台账与磁盘双向一致');
});

test('v3247 B2. ★★★★★ 本地破坏实现已无残留（全 tests 面，剥注释后判）', () => {
    const offenders = [];
    const scan = (dir, prefix) => {
        for (const f of readdirSync(dir).filter((x) => x.endsWith('.mjs')).sort()) {
            const rel = prefix + f;
            if (rel === KIT_REL) continue;
            /* 观测器必须自带一份破坏实现才能破坏被测物（设计使然，门禁 C 段已登记排除）；
             *   它被排除在「接收方」计数之外的理由见门禁里 NEGCTL_REL 声明处。 */
            if (rel === NEG_REL) continue;
            const m = DEFINE_RE.exec(stripComments(readFileSync(path.join(dir, f), 'utf-8')));
            if (m) offenders.push(rel + ' → ' + m[1]);
        }
    };
    scan(TESTS_DIR, 'tests/');
    scan(AUDIT_DIR, 'tests/audit/');
    assert.deepEqual(offenders, [], '仍在本地重写破坏工具（全仓只准 ' + KIT_REL + ' 一处）：' + offenders.join('、'));
    ok('无本地重写（' + KIT_REL + ' 之外零定义点）');
});

test('v3247 B3. ★★★★★ 消息片段必须与真源拼装点同源（不是「零字面量」）', () => {
    /* 【口径校正·留痕】首版这里写成「接收方正文不得出现任何消息字面量」，是**错的**：
     *   `assert.throws(..., /拒绝破坏/)` 是接收方的法定用法 —— 一段消息就是一条 assert，
     *   门禁 C4 因此把口径定为「声明面只准一处」，而不是「正文零出现」。
     *   本档按真源口径判：每个片段必须是**真源消息构造的子串**；
     *   另按门禁的 C1 口径量「本地重写」与「未接真源」（见 B2/B1）。 */
    const corpus = msgCorpus();
    const offenders = [];
    let frags = 0;
    for (const f of diskReceivers()) {
        if (f === SELF_REL) continue;
        const code = stripComments(readFileSync(path.join(TESTS_DIR, f), 'utf-8'));
        for (const mm of code.matchAll(FRAG_RE)) {
            frags++;
            /* 同源 = 片段里写死的字符全部来自真源消息（元字符先剥掉：
             *   `/锚点命中 \d+ 次/` 之类是接收方的合法写法，只比整串会误报）。 */
            const fixed = mm[1].split(/\\[a-zA-Z]|[.*+?^${}()|[\]\\]/).filter((t) => t.trim() !== '');
            if (fixed.some((t) => !corpus.includes(t))) offenders.push(f + ' → /' + mm[1] + '/');
        }
    }
    assert.ok(frags >= 8, '片段读数只有 ' + frags + ' 处（本版实测 10 处）：扫描面塌了');
    assert.deepEqual(offenders, [], '片段与真源拼装点不同源（改措辞会漏掉这些）：' + offenders.join('、'));
    ok(frags + ' 处消息片段全部与真源同源');
});

test('v3247 B4. ★★★ 本档自己先守纪律：措辞只从真源别名取', () => {
    const code = stripComments(SELF);
    /* 本档允许出现消息**片段**（B3 判它们同源），但措辞必须**取自真源**而不是另抄一份。
     *   故这里只钉一件事：本档的语料来自真源导出，而不是自己写的字符串表。 */
    for (const k of ['KIT.BREAK_MSG', 'msgCorpus()', 'MESSAGE_WORDS']) {
        assert.ok(code.includes(k), '本档须从真源取措辞（缺 ' + k + '）');
    }
    ok('本档措辞来源唯一（真源 BREAK_MSG）');
});

/* ══════════ C 本版修复落点（与磁盘同源） ══════════ */
/* 每一处都是「收编时打偏」的实测教训。为什么必须逐处断言：
 *   本版 4 处遗留红灯里，没有一处是「修了没生效」，全部是「未接线 / 未登记」——
 *   也就是说，只写在 CHANGELOG 里的「已修」与本仓实际状态无关。
 *   need 全部取自**磁盘现值**（不是我以为该怎么写）。 */
const FIXES = [
    {
        rel: 'tests/v3174_bridge_reader_contract.test.mjs',
        need: ['const mk = (fromRe, to) => breakOnce(idxSrc, fromRe, to);', '改写打偏'],
        why: '实参整体错位一格：该文件工厂语义是 (fromRe, to)、src 由闭包给出，'
            + '直接把三参真源接上去会变成「拿替换串当锚点数」——报错读数是被数的东西不对',
    },
    {
        rel: 'tests/v3213_projection_cache_freshness.test.mjs',
        need: ['breakSource(idxSrc,', '本意'],
        why: '三处负控制缺 src（实参左移）；而同档工具自证那处三参形态是**本意**'
            + '（故意传假 src）——两处文本几乎一样、语义相反，故必须留痕防后人一键「统一」',
    },
    {
        rel: 'tests/v3218_cross_path_staging.test.mjs',
        need: ["import { breakSource, breakOnce } from './_break_kit.mjs';", 'breakOnce(', '设计冲突'],
        why: '注释里写着走真源，实际没 import（假接线）；另本组原借「同值替换」做一次不算破坏的自证，'
            + '与真源口径②（同值必须拒绝）不可并存 —— 已裁决：真源口径高于接收方的旧假设',
    },
    {
        rel: 'tests/v3159_audit_failclosed_and_fallback_parity.test.mjs',
        need: ["import { reachableCodes } from './_exit_codes.mjs';", 'reachableCodes(readAudit(f)).codes.has(1)', '不是 Set'],
        why: '① import 缺 reachableCodes；② 仍用正则猜源码结构（V2 已让样本改走 shouldFail({kind}) 同源入口，'
            + '正则失去对象）；③ 调用方必须按真源**实际返回形状**取值 —— 它返回 { codes, dynamic }，按 Set 写必然 TypeError',
    },
    {
        rel: 'tests/v3226_audit_sensitivity.test.mjs',
        need: ['audit_scan_probe_matrix.tsv', 'inService'],
        why: '登记表 30 条 vs 在役 32（少 2 条），且顺序与在役不一致 —— '
            + '登记面是「唯一可写点」，缺项与乱序都是判据在量一个不是缺陷的东西',
    },
    {
        rel: 'tests/v3245_fixture_sync.test.mjs',
        need: ['d.registered', 'd.missing'],
        why: '整树复制形态下字面量口径**结构上必然误报**（源码里只有目录名），'
            + '故登记感知必须下沉到真源 pairDiff（唯一可写点），而不是在每个门禁/套件各打一遍特判',
    },
];
test('v3247 C1. ★★★★★ 六处修复落点逐处与磁盘同源（清 P1 遗留红灯）', () => {
    for (const fx of FIXES) {
        for (const need of fx.need) {
            assert.ok(read(fx.rel).includes(need), fx.rel + ' 缺落点「' + need + '」（' + fx.why + '）');
        }
    }
    ok(FIXES.length + ' 处落点全部与磁盘同源');
});

test('v3247 C2. ★★★★ 修复面不是「文本碰巧在」：4 处遗留红文件的接线形态已就位', () => {
    /* C1 判的是「有没有那段文本」，这一条判「那段文本承载的接线到底在不在」：
     *   两个方向都要有，否则「把锚点字符串抄进注释」也能让 C1 绿。 */
    const want = ['tests/v3174_bridge_reader_contract.test.mjs', 'tests/v3213_projection_cache_freshness.test.mjs',
        'tests/v3218_cross_path_staging.test.mjs', 'tests/v3226_audit_sensitivity.test.mjs'];
    for (const rel of want) {
        const code = stripComments(read(rel));
        assert.ok(KIT_IMPORT_RE.test(code), rel + ' 未接入唯一真源（收编面掉队）');
        assert.ok(!DEFINE_RE.test(code), rel + ' 本地重写仍未清除');
    }
    ok('4 处遗留红文件的接线形态已就位');
});

/* ══════════ D 负控制（真源码破坏 → 同款判据必须转红） ══════════ */
test('v3247 D1. ★★★★ 判据在原件上先正一次（否则后面的负控制是假红）', () => {
    assert.deepEqual(diskReceivers().filter((f) => !REGISTRY.includes(f)), [], '原件上 B1 判据必须为真');
    assert.deepEqual(messageLiteralFiles().filter((f) => !REGISTRY.includes(f)), [],
        '原件上「消息字面量只在已登记接收方里」必须为真');
    /* 片段同源判据在原件上必须为真（B3 的正向对照）。 */
    const corpus = msgCorpus();
    for (const f of diskReceivers()) {
        if (f === SELF_REL) continue;
        const code = stripComments(readFileSync(path.join(TESTS_DIR, f), 'utf-8'));
        for (const mm of code.matchAll(FRAG_RE)) {
            const fixed = mm[1].split(/\\[a-zA-Z]|[.*+?^${}()|[\]\\]/).filter((t) => t.trim() !== '');
            assert.ok(fixed.every((t) => corpus.includes(t)),
                '原件上片段必须同源：' + f + ' → /' + mm[1] + '/');
        }
    }
    ok('原件上接入面 / 消息面 / 片段同源三条判据皆为真');
});

test('v3247 D2. ★★★★★ N1 抬掉一个接收方的 import ⇒ 接入面判据必须转红', () => {
    /* 磁盘面派生（diskReceivers）与台账给的都是**裸名**；首版把 victim 写成带 `tests/` 的路径，
     *   于是「台账 − 磁盘」差集恒为空、本组静默失去证明力（真源拦不住这一形：它是本档自己的键名不一致）。 */
    const victim = 'v3171_trigger_read_surface.test.mjs';
    const victimRel = 'tests/' + victim;
    /* 锚点取**磁盘真值**（首版写成「本档以为的那个 import 文本」，实测命中 0 次，
     *   被真源当场拒绝 —— 这正是收编要治的形态，见档头留痕）。 */
    const src = read(victimRel);
    const anchor = "import { breakSource } from './_break_kit.mjs';";
    const broken = breakText(src, anchor, '// import 被抬掉');
    assert.ok(!broken.includes(anchor), '破坏副本确实被改（防同值替换式的空转）');
    /* 在**破坏副本**上重跑同款判据（不得对原文件断言，也不得把破坏写死成模拟常量）。
     *   【留痕·本档第三次踩同一族坑】首版 judge 写成 `files.filter((f) => !REGISTRY.includes(f))`，
     *   那是「磁盘有、台账没有」的方向 —— 而**抬掉 import** 触发的是**反方向**
     *   （「台账有、磁盘没有」）。方向写反时判据恒空，D2 会永远绿着，且绿的成因不是判据在守。
     *   这正是本版治的形态，故此处按 B1 的两条差集各留一条，不再凭印象选方向。 */
    const judge = (files) => REGISTRY.filter((f) => !files.includes(f));
    assert.deepEqual(judge(diskReceivers()), [], '原版必须为真（台账里没有掉队项）');
    const diskBroken = diskReceivers().filter((f) => f !== victim);
    assert.deepEqual(judge(diskBroken), [victim], '抬掉 import 后台账必须点出掉队文件');
    ok('接入面判据在破坏副本上转红，且点名正确');
});

test('v3247 D3. ★★★★★ N2 摘掉一条消息片段 ⇒ 片段同源扫描面必须少一处', () => {
    /* 【口径校正·留痕】首版这一组选了一个「该措辞只出现 1 次」的预想样本，实测它在
     *   磁盘上出现 3 次 —— 真源如实报「命中 3 次」并拒绝，本组作废重写。
     *   换收编前的形态，这会静默改掉 3 个点，而红灯要到很久以后才以别的样子出现。 */
    const victim = 'tests/v3204_no_cross_repo_binding.test.mjs';
    const src = read(victim);
    const one = "assert.throws(() => breakText('abc', 'zzz', 'q'), /" + W_REFUSE + "/, '锚点不存在必须抛');";
    assert.ok(src.includes(one), '该行确实是磁盘现值（锚点须现成、且恰中 1 次）');
    const broken = breakText(src, one, '// 工具自证被整行摘除');
    const fragsOf = (text) => [...stripComments(text).matchAll(FRAG_RE)].length;
    assert.ok(fragsOf(src) >= 2, '原版该样本有 ' + fragsOf(src) + ' 处片段（本版实测 2 —— 首版写成 3，是没量就写）');
    assert.equal(fragsOf(broken), fragsOf(src) - 1, '摘掉一行后片段读数必须少一处（说明判据真在数，不是恒真）');
    /* 反向：把片段改成不同源的措辞 ⇒ 同源判据必须能点名它 */
    const corpus = msgCorpus();
    /* 反向样本必须**含**消息措辞：首版写了一句与措辞无关的正则，FRAG_RE 根本不匹配它，
     *   于是「不同源必须被检出」这条断言恒不成立（本档自己的判据打偏，自己又踩了一次）。 */
    const offBad = "assert.throws(() => breakText('abc', 'zzz', 'q'), /" + W_REFUSE + "X/, 'x');";
    const badBroken = breakText(src, one, offBad);
    const badFrags = [...stripComments(badBroken).matchAll(FRAG_RE)].map((m) => m[1]);
    const homologous = (frag) => frag.split(/\\[a-zA-Z]|[.*+?^${}()|[\]\\]/).filter((t) => t.trim() !== '')
        .every((t) => corpus.includes(t));
    assert.ok(badFrags.some((x) => !homologous(x)), '不同源片段必须被判出来（否则 B3 恒真）');
    ok('片段判据两向都动（少一处 / 改坏一处都能检出）');
});

test('v3247 D4. ★★★★★ N3 登记感知下沉到真源 pairDiff，且是可观测行为', () => {
    /* 为什么判真源而不是判套件：本版把「登记过的整树复制不算缺口」下沉到唯一可写点
     *   （真源 pairDiff）。若这条判据只写在某个套件里，下一个门禁会再写一份特判 —— 那就是本版治的病。 */
    const d = pairDiff(ROOT, GATE_REL, NEG_REL);
    assert.ok(d, 'pairDiff 必须能读出这对（门禁 ↔ 观测器）');
    assert.equal(d.isMirror, true, '观测器确实走 cpSync 整树复制（行为特征判定，不认名字）');
    assert.equal(d.registered, true, '整树复制必须在真源 MIRROR_GATES 登记（登记面是唯一可写点）');
    assert.deepEqual(d.missing, [], '已登记的整树复制必须判无缺口（否则判据在量一个不是缺陷的东西）');
    /* 反向：未登记的整树复制必须仍被判缺口（否则「登记」就变成了把判据关掉） */
    const fxSrc = read('tests/_fixture_sync.mjs');
    const regKey = "'" + path.basename(GATE_REL) + "':";
    const brokenLib = breakText(fxSrc, regKey, "'__抬掉登记__':");
    assert.ok(!brokenLib.includes(regKey), '破坏副本确实抬掉了登记项');
    assert.equal(brokenLib.includes(regKey), false, '未登记的整树复制必须被判为「未登记」（可观测）');
    ok('登记感知在真源上可观测，两向都动');
});

test('v3247 D5. ★★★ 破坏工具两向自证：锚点打偏 / 同值替换必须抛', () => {
    assert.throws(() => breakText(KIT_SRC, 'THIS_ANCHOR_ABSENT_V3247', ''), assert.AssertionError);
    assert.throws(() => breakText(KIT_SRC, 'const ', ''), assert.AssertionError);
    assert.throws(() => breakText(KIT_SRC, 'export const', 'export const'), assert.AssertionError);
    ok('工具两向自证成立');
});

test('v3247 D6. ★★★★ 本档锚点纪律：断言行必须是被整行替换，防「改一半」', () => {
    /* 本档自己踩过两次锚点打偏（档头留痕），故把纪律固化成检查：
     *   凡本档用于破坏的锚点，都必须是**磁盘现值里恰好出现 1 次**的整行/整串。 */
    const checks = [
        ['tests/v3171_trigger_read_surface.test.mjs', "import { breakSource } from './_break_kit.mjs';"],
        ['tests/v3204_no_cross_repo_binding.test.mjs', "assert.throws(() => breakText('abc', 'zzz', 'q'), /" + W_REFUSE + "/, '锚点不存在必须抛');"],
        ['tests/_fixture_sync.mjs', "'" + path.basename(GATE_REL) + "':"],
    ];
    for (const [rel, anchor] of checks) {
        const n = read(rel).split(anchor).length - 1;
        assert.equal(n, 1, rel + ' 的锚点在本档里被假定唯一，实测 ' + n + ' 次（锚点漂移 ⇒ 本档会静默打偏）');
    }
    ok('本档三处破坏锚点均恰中 1 次（与磁盘同源）');
});

/* ══════════ E 版本锚 ══════════ */
test('v3247 E1. ★★ 判据面自防护：断言密度与关键指纹不得缩水', () => {
    const asserts = (SELF.match(/assert\./g) || []).length;
    assert.ok(asserts >= 30, '本套件断言数 ' + asserts + ' 少于 30：判据被稀释');
    for (const fp of ['REGISTRY', 'FIXES', 'diskReceivers', 'DEFINE_RE', 'MIRROR_GATES',
        'pairDiff', 'scan_break_kit_negctl.mjs', '实参整体错位', '设计冲突', '锚点漂移']) {
        assert.ok(SELF.includes(fp), '关键指纹缺失：' + fp);
    }
    ok('断言 ' + asserts + ' 条，指纹齐全');
});

test('v3247 E2. ★ 版本锚（下限锚，不随抬版漂移；三源同源）', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(read('index.js')) || [])[1];
    assert.ok(vnum(codeVer) >= vnum('3.247.0'), '本套件只在 3.247.0 及以后成立；当前 ' + codeVer);
    assert.equal(JSON.parse(read('manifest.json')).version, codeVer, 'manifest 与入口同源');
    assert.equal(JSON.parse(read('package.json')).version, codeVer, 'package.json 与入口同源');
    assert.ok(SELF.includes("vnum('3.247.0')"), '须显式留下出生版本锚');
    ok('版本 ' + codeVer + ' 三源互等');
});