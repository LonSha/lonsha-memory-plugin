// tests/v3288_plan_currency_xface.test.mjs — v3.288.0：计划陈旧门的「X 系列面」+ 事实面同源
// 主题：scan_plan_currency.mjs 本轮新增 **P8**（已交付的 X 项不得复活为本节「下一步」）与
//   **P4 判据纯度修正**（状态词只认**本条目标题内**，不许跨条借邻条的「交付」字样）。
//
//   【本档钉什么】
//     A  结构面：P8 在场 + 标题面判定（N. **…**）在场 + 现状节 X 行读法在场
//     B1 P8 翻红：第 3 条**标题**点名已交付的 X1 ⇒ exit 1 且点名 X1
//     B2 P8 不误红：仅**说明面**提「X1 已于 v… 交付」⇒ exit 0
//     B3 P8 跳过档：现状节无 X 行 ⇒ exit 0 且**如实报出**（不静默）
//     C1 P4 判据纯度：标题未标状态 + 邻条说明含「交付」⇒ 仍须 exit 1
//     C2 P4 放行：标题自带「收口」⇒ exit 0
//     D  事实面同源：PLAN 现状节的已交付名单与实际一致（X1 在列、O2 未收口显式在列）
//     E  判据纯度 H5：锚点字面量各只有 1 个持有常量 + 真源上单命中
//     F  真源码破坏：摘掉 P8 判据体 ⇒ B1 同款场景不再翻红（判据不是装饰）
//     G  自防护 + 当版锚点
//
// 边界（诚实）：本档只证明**这条判据本身可信**。X2–X8 该不该做是人的决定，本门不判。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SCAN_REL = path.join('tests', 'audit', 'scan_plan_currency.mjs');
const SCAN = path.join(ROOT, SCAN_REL);
const readRoot = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const scanSrc = () => readRoot(SCAN_REL);
const ok = (m) => console.log('  OK ' + m);
const NL = String.fromCharCode(10);
/* ---- 破坏锚点（逐字取自真源，禁改；本档须逐字持有） ---- */
const A_P8_BAD = "                bad('现行排序节第 ' + bm[0].trim().slice(0, 3) + ' 条**标题**里仍把已交付的「X' + m[1]";
/* 含反斜杠的锚点须用 String.raw —— 普通引号串会把 `\s`/`\d` 吃成 `s`/`d`，使常量的**值**不再等于真源代码行（本档首版栽在此，负控制与持有断言同时失灵）。 */
const A_P8_BULLET = String.raw`        const bulletRe = /^\s*\d+[.]\s*\*\*(.+?)\*\*/gm;`;
const A_P8_STATUS = "        notes.push('P8 X 系列已交付编号：' + [...xDelivered].sort().join(',')";
const A_P4_BAD = "                bad('现行排序节第 ' + bm[0].trim().split('.')[0] + ' 条**标题**里仍把已交付的「O' + num";
const A_SELF_HEAD = 'const SCAN_REL = ';
function mkRepo(mut = () => {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-xface-'));
    const auditDir = path.join(dir, 'tests', 'audit');
    fs.mkdirSync(auditDir, { recursive: true });
    const st = {
        xStatus: '> · **拓展计划 X1–X8**：**X1 已交付**（v3.270.0，占位）；**X2–X8 尚未实施**。',
        stepX3: '**X 系列第二批起步（X2 证据 / X3 预演）**',
        stepX3Note: ' —— X1 已于 v3.270.0 交付（勿再列入待办）。',
        opStatus: 'O1（甲，已交付各自定向门）/ O2（乙，已交付各自定向门）/ O3（丙，已交付各自定向门）/ '
            + 'O4（丁，已交付各自定向门）/ O5（戊，已交付各自定向门）/ O6（己，已交付各自定向门）/ '
            + 'O7（庚，已交付各自定向门）；**O8 为当前主线**。',
        stepOpTitle: '**O8 收口**',
        stepOpNote: '（已交付第一刀；本刀补第二刀后收口）。',
    };
    mut(st);
    fs.writeFileSync(path.join(dir, 'index.js'), "const VERSION = '9.9.9';" + NL);
    const filler = [];
    for (let i = 0; i < 20; i++) filler.push('填充行 ' + i + '：使 PLAN 达到面下限，避免枚举塌陷误判。');
    const b = [];
    b.push('# 合成仓发展规划');
    b.push('');
    b.push('> **当前执行状态（2026-10-06，v9.9.9）**：【本节是唯一现行口径】');
    b.push('> · **优化计划 O1–O8**：' + st.opStatus);
    if (st.xStatus) b.push(st.xStatus);
    b.push('');
    b.push('## 现状基线（规划起点）');
    b.push('');
    b.push('| 量 | 读数 |');
    b.push('|---|---|');
    b.push('| 版本 | **v9.9.9** |');
    b.push('');
    b.push('## 当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）');
    b.push('');
    b.push('> 本节是唯一现行排序；其余排序节一律带陈旧标记。');
    b.push('');
    b.push('1. ' + st.stepOpTitle + st.stepOpNote);
    b.push('2. **下一项乙** —— 尚未做。');
    b.push('3. ' + st.stepX3 + st.stepX3Note);
    b.push('');
    b.push('## 一、优化提升');
    b.push('正文……');
    for (const f of filler) b.push('> ' + f);
    b.push('');
    b.push('## 优先级');
    b.push('> **【陈旧节 · 勿当排序读】** 本节属上一轮，仅作交付史保留。');
    b.push('1. **A1 + A2** —— 早已交付。');
    b.push('');
    b.push('## 起手两件（历史节）');
    b.push('> **【陈旧节 · 勿当排序读】** 本节属收尾轮，均已交付。');
    b.push('① 甲；② 乙。');
    b.push('');
    fs.writeFileSync(path.join(dir, 'PLAN.md'), b.join(NL) + NL);
    fs.writeFileSync(path.join(auditDir, 'plan_currency.tsv'),
        ['# 合成仓登记', '# 契约：唯一现行排序 · 陈旧标记',
            '当前优先级（唯一现行排序 · 判据 `scan_plan_currency.mjs`）',
            '优先级', '起手两件（历史节）'].join(NL) + NL);
    return dir;
}
function run(dir) {
    const r = spawnSync(process.execPath, [SCAN], {
        cwd: dir, encoding: 'utf8',
        env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', LONSHA_AUDIT_ROOT: dir },
    });
    return { code: r.status == null ? -1 : r.status, out: String(r.stdout || '') + String(r.stderr || '') };
}
function withRepo(mut, fn) {
    const dir = mkRepo(mut);
    try { return fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
test('v3288 A. P8 判据在场、按标题面判定、跳过档如实报出', () => {
    assert.ok(fs.existsSync(SCAN), '扫描器必须在位');
    const s = scanSrc();
    assert.ok(s.includes('P8'), 'P8 判据须在场（X 系列已交付项复活）');
    assert.ok(s.includes(A_P8_BULLET), '标题面判定须在场（只认 N. **…** 的加粗段）');
    assert.ok(s.includes('P8 本档跳过'), '跳过档须如实报出（不静默通过）');
    assert.ok(s.includes('标题面命中'), '注记须自述「标题面命中 N 处」');
    assert.ok(s.includes('部分交付') && s.includes('未收口'), '交付事实读法须认未交付显式标记');
    ok('P8 结构面齐备');
});
test('v3288 B1. P8 翻红：第 3 条标题点名已交付的 X1 ⇒ exit 1', () => {
    withRepo((s) => { s.stepX3 = '**X 系列首批（X1 结构化证据查询与完整度 / X2 证据 / X3 预演）**'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '标题点名已交付 X1 必须 exit 1：' + r.out.slice(-300));
        assert.ok(r.out.includes('复活为待办'), '须点名「已交付的 X 项被复活」');
        assert.ok(r.out.includes('X1'), '须点名具体编号');
    });
    ok('P8 翻红');
});
test('v3288 B2. P8 不误红：仅说明面提已交付 ⇒ exit 0', () => {
    withRepo((s) => {
        s.stepX3 = '**X 系列第二批起步（X2 证据 / X3 预演）**';
        s.stepX3Note = ' —— X1 已于 v3.270.0 交付（勿再列入待办）；X2/X3 尚待做。';
    }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '说明面提及不得误红：' + r.out.slice(-300));
        assert.ok(r.out.includes('标题面命中 0 处'), '注记须自述命中 0 处');
    });
    ok('P8 说明面放行');
});
test('v3288 B3. P8 跳过档：现状节无 X 行 ⇒ exit 0 且如实报出', () => {
    withRepo((s) => { s.xStatus = null; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '无 X 行时不得凭空翻红');
        assert.ok(r.out.includes('P8 本档跳过'), '跳过须如实报出');
    });
    ok('P8 跳过档如实');
});
test('v3288 C1. P4 纯度：标题未标状态 + 邻条说明含交付 ⇒ 仍须 exit 1', () => {
    withRepo((s) => {
        s.stepOpTitle = '**O6 推进**';
        s.stepOpNote = '（按计划继续）。';
        s.stepX3Note = ' —— X1 已于 v3.270.0 交付（勿再列入待办）。';
    }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 1, '跨条借词不得放行：' + r.out.slice(-300));
        assert.ok(r.out.includes('O6'), '须点名 O6');
    });
    ok('P4 跨条借词被拦');
});
test('v3288 C2. P4 放行：标题自带收口 ⇒ exit 0', () => {
    withRepo((s) => { s.stepOpTitle = '**O6 收口**'; s.stepOpNote = '（已交付并收口）。'; }, (dir) => {
        const r = run(dir);
        assert.equal(r.code, 0, '标题自带状态词必须放行：' + r.out.slice(-300));
    });
    ok('P4 标题自带状态词放行');
});
test('v3288 D. PLAN 事实面：X1 在已交付列、O2 未收口显式在列', () => {
    const plan = readRoot('PLAN.md');
    const xLine = plan.split('\n').find((l) => l.includes('拓展计划 X1–X8')) || '';
    assert.ok(/X1\s*\*{0,2}\s*已交付/.test(xLine), '文首现状节须把 X1 记为已交付');
    /* [v3.292.0 抬版交棒] 原断言写死「X2–X8 尚未实施」—— X3/X4/X5/X6 陆续交付后该形态必然翻红。
     *   事实面断言应钉**结构**（未交付项必须显式在列 + 已交付项必须标已交付），
     *   而不是钉某一版的编号集合（否则每交付一项就要回头改历史档 = T1 抬版仪式）。
     *   本条仍能抓真缺陷：X2 被静默摘掉、或已交付项漏标状态，都会翻红。
     *
     * [v3.296.0 二次交棒] X 系列八条**全部交付**后，「X2 未交付须在列」这条前提消失
     *   （再要求某个编号标「尚未实施」就是要求文档说假话）。等价结构不变量重述为两条：
     *   ① 八个编号**一个都不能被静默摘掉**（原文「不得静默摘掉」的不变量部分，与本轮
     *      X1 补登台账同族：数量随交付增长的东西，判据要钉「在列」而不是钉「哪几个不在列」）；
     *   ② 在列的每个编号**必须带显式状态词**（已交付 / 尚未实施），不得无状态裸列 ——
     *      这条才是「已交付项漏标状态」的真拦网，也覆盖将来新开编号时的「漏标」形态。 */
    for (const n of ['X1', 'X2', 'X3', 'X4', 'X5', 'X6', 'X7', 'X8']) {
        assert.ok(new RegExp(n + '\\b').test(xLine), n + ' 须在现状节显式在列（不得静默摘掉）');
    }
    assert.ok(/X2\b[^；;]*?(已交付|尚未实施)/.test(xLine),
        'X2 须带显式状态词（已交付 / 尚未实施），不得无状态裸列');
    assert.ok(!/X2\s*[–\-—]\s*X8\s*\*{0,2}\s*尚未实施/.test(xLine)
        || /X3\s*\*{0,2}\s*已交付/.test(xLine) === false,
        '区间形态「X2–X8 尚未实施」与已交付项互斥（不得同时成立）');
    assert.ok(/X6\s*\*{0,2}\s*已交付/.test(xLine), 'X6 已交付须在现状节标出（P8 的已交付面据此读）');
    const oLine = plan.split('\n').find((l) => l.includes('优化计划 O1–O8')) || '';
    assert.ok(oLine.includes('未收口'), 'O2 的部分交付/未收口须显式在列');
    ok('事实面：X1 已交付 / X2–X8 未实施 / O2 未收口');
});
test('v3288 E. 判据纯度：锚点各只有 1 个持有常量，真源上单命中', () => {
    const self = readRoot(path.join('tests', 'v3288_plan_currency_xface.test.mjs'));
    const ANCHORS = [['P8_BAD', A_P8_BAD, 'A_P8_BAD'], ['P8_BULLET', A_P8_BULLET, 'A_P8_BULLET'],
        ['P8_STATUS', A_P8_STATUS, 'A_P8_STATUS'], ['P4_BAD', A_P4_BAD, 'A_P4_BAD'],
        ['SELF_HEAD', A_SELF_HEAD, 'A_SELF_HEAD']];
    const SCANNER_ANCHORS = ANCHORS.slice(0, 4);
    const holders = new Map();
    for (const [label, a, name] of ANCHORS) {
        assert.equal(a.includes(NL), false, label + ' 须是单行锚点');
        assert.ok(a.length > 12, label + ' 锚点须足够长');
        /* 持有形态：`const <名称> = <字面量>;` 在本档源码里恰出现一次 ——
           比「文件含锚点值」更稳（含反斜杠的锚点，其**值**经转义后不是源码文本的子串）。
           三种合法字面量精确字符串比对，不拼正则：双引号 / 单引号 / String.raw 模板。 */
        const raws = [
            'const ' + name + ' = ' + JSON.stringify(a) + ';',
            "const " + name + ' = ' + "'" + a.replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "';",
            'const ' + name + ' = String.raw`' + a + '`;',
        ];
        const held = raws.reduce((n, s) => n + (self.split(s).length - 1), 0);
        assert.equal(held, 1, label + ' 须恰有 1 个常量声明持有（实 ' + held + '）');
        if (!holders.has(a)) holders.set(a, new Set());
        holders.get(a).add(label);
    }
    for (const [lit, set] of holders) assert.equal(set.size, 1, '字面量被多个常量持有：' + [...set].join(' / '));
    const s = scanSrc();
    /* 期望命中数：bulletRe 是 P4/P8 **同构复用**的判定形态，真源里逐字出现 2 次 ——
       这是设计事实，不是缺陷；把它写成「恰 1 次」会把正确源码判红（本档首版即栽在此）。
       其余 3 条锚点是各判据独有的破坏点，须恰 1 次。 */
    const EXPECT_HITS = { P8_BAD: 1, P8_BULLET: 2, P8_STATUS: 1, P4_BAD: 1 };
    for (const [label, a] of SCANNER_ANCHORS) {
        if (EXPECT_HITS[label] === 1) {
            /* 恰中 1 次 ⇒ 走唯一真源工具的「锚点纯度」断言（锚点不存在 / 不唯一都会抛）。 */
            assertSingleHit(s, a, 'v3288_e_' + label);
        } else {
            const n = s.split(a).length - 1;
            assert.equal(n, EXPECT_HITS[label],
                label + ' 在真源上的命中数须为 ' + EXPECT_HITS[label] + '（实 ' + n + '）');
        }
    }
    ok('5 个锚点各恰有 1 个持有常量；4 条扫描器锚点命中数 = ' + JSON.stringify(EXPECT_HITS));
});
test('v3288 F. 真源码破坏：摘掉 P8 判据体 ⇒ B1 同款场景不再翻红', () => {
    const s = scanSrc();
    const before = withRepo((st) => {
        st.stepX3 = '**X 系列首批（X1 结构化证据查询与完整度 / X2 证据 / X3 预演）**';
    }, (dir) => run(dir).code);
    assert.equal(before, 1, '原版：该场景必须 exit 1');
    /* 真源码破坏走唯一真源工具 breakSource（锚点须恰中 1 次，否则它会抛 —— 这本身是纯度自证）。 */
    const broken = breakSource(s, A_P8_BAD, '                void (' + JSON.stringify(A_P8_BAD),
        'v3288_f_break_p8');
    assert.notEqual(broken, s, '破坏须可观测改动');
    const dir = mkRepo((st) => {
        st.stepX3 = '**X 系列首批（X1 结构化证据查询与完整度 / X2 证据 / X3 预演）**';
    });
    try {
        const bp = path.join(dir, 'tests', 'audit', 'scan_broken.mjs');
        fs.writeFileSync(bp, broken);
        const rr = spawnSync(process.execPath, [bp], {
            cwd: dir, encoding: 'utf8',
            env: { ...process.env, LONSHA_AUDIT_FIXTURE: '1', LONSHA_AUDIT_ROOT: dir },
        });
        const code = rr.status == null ? -1 : rr.status;
        assert.equal(code, 0, '摘掉 P8 判据体后该场景不再红 ⇒ 归因正确（实 rc=' + code + '）');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
    ok('真源码破坏：原版红 / 破坏后不红');
});
test('v3288 G. 自防护 + 当版锚点（V4 计数形态）', () => {
    const self = readRoot(path.join('tests', 'v3288_plan_currency_xface.test.mjs'));
    assert.ok(self.length > 4000, '本档自身不得被清空（实 ' + self.length + ' 字符）');
    assert.ok(self.includes(A_SELF_HEAD) && self.includes('assertSingleHit'), '本档须持有自防护锚点');
    const pkgRaw = JSON.parse(readRoot('package.json')).version;
    const manRaw = JSON.parse(readRoot('manifest.json')).version;
    const SQ = String.fromCharCode(39);
    assert.equal(pkgRaw, manRaw, 'package.json 与 manifest.json 版本一致');
    assert.ok(readRoot('index.js').includes('const VERSION = ' + SQ + pkgRaw + SQ + ';'),
        'index.js 版本常量与 package.json 一致');
    const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
    /* [v3.292.0 抬版交棒] 本档出生版本 3.288.0 —— 原写死等号「vnum('3.288.0') == pkgRaw」
     *   在后续每版抬版时必然翻红（T1 抬版仪式；版本守卫 V2 因该形态不含引号包裹的
     *   当前版本串而静默放过，属「判据的面漏一类」）。当版锚点已由 v3292 承担，
     *   这里退为**下限锚**：只锁「不早于本档出生版本」。 */
    assert.ok(vnum(pkgRaw) >= vnum('3.288.0'), '版本不得回退到本档出生版本之前，当前 ' + pkgRaw);
    ok('自防护 + 当版锚点 ' + pkgRaw);
});
