/* ============================================================
 * tests/v3204_no_cross_repo_binding.test.mjs — v3.204.0
 *
 * 主题：门禁的「绿」不许来自本机环境。
 *
 * 实测缺陷（本轮发现，非推测）：
 *   ① 36 个测试文件把本仓根写成 '/home/user/lonsha-memory-plugin/...' 字面量；
 *   ② 17 个测试文件把断言指向兄弟树 '/home/user/ruby-phone-work/...'，
 *      而该树无 git、停在 ruby-phone 2.6.0-modular，且它断言的整代桥方法
 *      （queryPhoneMemory / backfillDiaries / syncClock / lockFact / syncSummaryEdit /
 *      lockedFactsIngested / protagonistIngested / _sleepTick …）在活体项目
 *      /home/user/ruby-phone（2.92.0）里已整体移除。实测：把路径换成活体树后
 *      这 17 个文件 17/17 全红——即门禁一直在对一份已死掉的快照报绿。
 *   可移植性反证：把仓库整体复制到 /tmp/portable/lonsha，改动前 EXIT 1、改动后 EXIT 0。
 *
 * 本版做了什么：
 *   · 36 个文件的本仓绝对路径 → 按文件位置推导（fileURLToPath(new URL('..'))）；
 *   · 17 个死桥测试 → 整体退役到 tests/archived/（保留 git 历史与退役理据）；
 *   · 新增 tests/audit/scan_cross_repo_binding.mjs（判据 P1–P5b）+ 两张登记表。
 *
 * 覆盖：
 *   1  结构面：守卫在位 / 五条判据 / 三档退出码 / 唯一真源 stripComments / 自身版本无关
 *   2  行为面：真仓库 exit 0 且读数可察
 *   3  负控制 N1：本仓绝对路径字面量 → 必须 exit 1（P1）
 *   4  负控制 N2：兄弟仓绝对路径 → 必须 exit 1（P2）
 *   5  负控制 N2b：../../<非 tests>/ 相对逃逸 → 必须 exit 1（P2）
 *   6  负控制 N2c：代码里裸引兄弟仓名（无路径形态） → 必须 exit 1（P2）
 *   7  负控制 N6（保绿对照）：只在注释里提兄弟仓 + 已登记 → 必须 exit 0
 *   8  负控制 N3：参考基准缺行（覆盖率缺口） → 必须 exit 1（P3）
 *   9  负控制 N3b：参考基准残留登记 → 必须 exit 1（P3）
 *   10 负控制 N4：退役文件复活到在役面 → 必须 exit 1（P4）
 *   11 负控制 N5b：退役文件被追改 → 必须 exit 1（P5b）
 *   12 fail-closed：登记表缺失 → 必须 exit 2
 *   13 负控制工具两向自证：锚点不存在/不唯一必须抛；登记表查询面不为空
 *   14 退役面已封口：archived 清单 == 退役登记清单，且在役面零命中
 *   15 可移植性证明：整仓复制到仓库之外 → 过滤跑关键用例 → EXIT 0
 *   16 判据面自防护：断言数 / 代码行 / 关键指纹不得缩水
 */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, existsSync, readdirSync } from 'fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT = REPO_ROOT;
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const SCAN_REL = 'tests/audit/scan_cross_repo_binding.mjs';
const SCAN = readFileSync(path.join(ROOT, SCAN_REL), 'utf-8');
const REF_REL = 'tests/audit/catalog_reference_consumers.tsv';
const STALE_REL = 'tests/audit/catalog_version_guard.tsv';
const REF = readFileSync(path.join(ROOT, REF_REL), 'utf-8');
const STALE = readFileSync(path.join(ROOT, STALE_REL), 'utf-8');
const NXF = JSON.parse(readFileSync(path.join(ROOT, 'tests/audit/fixtures_xr_negative.json'), 'utf-8'));

const rows = (text) => String(text).split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.split('\t').map((c) => c.trim()));

/* ══════════ 0. 版本锚（本文件是自己那版，锁自己的出生版本，不随抬版上抬） ══════════ */
test('v3204 0. 版本 / manifest / package 均不低于 3.204.0（三源互等）', () => {
    const idx = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
    const v = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
    const mf = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
    const pk = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    const vnum = (x) => { const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(x || '').trim()); return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN; };
    assert.strictEqual(v, mf.version, 'manifest 须跟随 index.js');
    assert.strictEqual(v, pk.version, 'package.json 须跟随 index.js');
    assert.ok(vnum(v) >= vnum('3.204.0'), '本版不得低于 3.204.0（锁自己的出生版本）');
});

/* ══════════ 1. 结构面 ══════════ */
test('v3204 1. 跨仓守卫在位：五条判据 / 三档退出码 / 唯一真源 / 自身版本无关', () => {
    for (const [needle, why] of [
        ['P1 绝对路径字面量', 'P1 判据标记'],
        ['P2 引用兄弟仓库', 'P2 判据标记'],
        ['P3 新增测试未登记进参考基准', 'P3 缺口判据'],
        ['P3 参考基准登记了不存在的测试', 'P3 残留判据'],
        ['P4 已退役测试重新出现在在役面', 'P4 退役复活判据'],
        ['P5b 退役文件被追改', 'P5b 冻结判据'],
        ['P6 退役登记缺 covered_by', 'P6 覆盖率转移判据（T6）'],
        ['P6 covered_by 引用的见证文件不在役', 'P6 空洞引用判据'],
        ['P6 无同等覆盖时必须写明理由', 'P6 无覆盖理由判据'],
        ['P6 覆盖率转移判据地板失守', 'P6 地板判据（全标 `-` = 没判据）'],
        ['failClosed', 'fail-closed 出口'],
        ['process.exit(2)', '退出码 2'],
        ['process.exit(1)', '退出码 1'],
        ["from '../_audit_lib.mjs'", '剥注释走唯一真源（不得本地重写 stripComments）'],
        ['stripSrc', '真源别名'],
        ['CODE_EXEMPT', '注释散文豁免'],
        ['catalog_reference_consumers', '参考基准落点'],
        ['catalog_version_guard', '退役登记落点'],
        ['LONSHA_AUDIT_ROOT', '可指定审计根（负控制要在独立树上跑）'],
        ['createHash', '退役面哈希冻结'],
    ]) assert.ok(SCAN.includes(needle), '守卫缺少：' + why + '（' + needle + '）');
});

test('v3204 2. 守卫自身版本无关（脚本体里不得出现任何 3.x.y 字面量）', () => {
    const strip = (t) => t.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
    const code = strip(SCAN).replace(/\/\*[\s\S]*?\*\//g, '');
    const lits = [...code.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map((m) => m[1]);
    assert.deepStrictEqual(lits, [],
        '守卫必须版本无关（含字面量 = 下一次抬版它就失效）：' + lits.join(','));
    assert.ok(!/3[.]20[0-9][.]0/.test(code), '脚本体内不得出现任何形如 3.20x.0 的版本号');
});

/* ══════════ 2. 行为面 ══════════ */
function runScan(root) {
    return spawnSync(process.execPath, [path.join(ROOT, SCAN_REL)], {
        encoding: 'utf-8', timeout: 120000,
        env: { ...process.env, LONSHA_AUDIT_ROOT: root },
    });
}
test('v3204 3. 真仓库上 exit 0：在役 / 退役 / 参考基准 / 问题 0', () => {
    const r = runScan(ROOT);
    const out = (r.stdout || '') + (r.stderr || '');
    assert.strictEqual(r.status, 0, '健康树上必须 exit 0：' + out.slice(-300));
    assert.ok(/在役 [1-9][0-9]*/.test(out), '须念出在役测试数（扫描面退化时可察）');
    assert.ok(/退役 [1-9][0-9]*/.test(out), '须念出退役数');
    assert.ok(/参考基准 [1-9][0-9]*/.test(out), '须念出参考基准覆盖面');
    assert.ok(/问题 0/.test(out), '须报「问题 0」');
});

/* ══════════ 3. 负控制：真源码破坏 → 独立树 → 同款真判据 ══════════ */
function breakText(src, anchor, repl) {
    const n = src.split(anchor).length - 1;
    if (n !== 1) throw new Error('拒绝破坏：锚点命中 ' + n + ' 次（要求恰好 1 次）');
    return src.split(anchor).join(repl);
}
function mkTree() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3204-xr-'));
    for (const f of ['index.js', 'manifest.json', 'package.json']) {
        writeFileSync(path.join(dir, f), readFileSync(path.join(ROOT, f)));
    }
    cpSync(path.join(ROOT, 'tests'), path.join(dir, 'tests'), { recursive: true });
    return dir;
}
function withTree(mutate) {
    const dir = mkTree();
    try {
        mutate(dir);
        const r = runScan(dir);
        return { status: r.status, out: (r.stdout || '') + (r.stderr || '') };
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
const REF_P = (d) => path.join(d, REF_REL);
const addRow = (p, row) => writeFileSync(p, readFileSync(p, 'utf-8').replace(/\n?$/, '\n') + row + '\n');

const NEG = [
    { n: 'N1', name: '本仓绝对路径字面量', tag: 'P1', key: 'N1' },
    { n: 'N2', name: '兄弟仓绝对路径', tag: 'P2', key: 'N2' },
    { n: 'N2b', name: '相对路径逃出本仓', tag: 'P2', key: 'N2b' },
    { n: 'N2c', name: '代码里裸引兄弟仓名', tag: 'P2', key: 'N2c' },
];
NEG.forEach((c, i) => {
    test('v3204 ' + (4 + i) + '. 负控制 ' + c.n + '：' + c.name + ' → 必须 exit 1（' + c.tag + '）', () => {
        const rel = 'tests/_neg_' + c.n + '.test.mjs';
        const r = withTree((d) => {
            writeFileSync(path.join(d, rel), NXF[c.key] + '\n');
            addRow(REF_P(d), path.basename(rel));
        });
        assert.strictEqual(r.status, 1, c.n + ' 必须阻断：' + r.out.slice(-400));
        assert.ok(r.out.includes(c.tag), c.n + ' 应点名 ' + c.tag + '：' + r.out.slice(-300));
        assert.ok(r.out.includes(path.basename(rel)), c.n + ' 应点名出问题的文件');
    });
});

test('v3204 8. 负控制 N6（保绿对照）：只在注释里提兄弟仓 + 已登记 → 必须 exit 0', () => {
    const rel = 'tests/_neg_n6.test.mjs';
    const r = withTree((d) => {
        writeFileSync(path.join(d, rel), NXF.N6 + '\n');
        addRow(REF_P(d), path.basename(rel));
    });
    assert.strictEqual(r.status, 0,
        '「在注释里记录历史」不得被当成跨仓绑定（否则守卫会变成不准提历史）：' + r.out.slice(-400));
});

test('v3204 9. 负控制 N3：参考基准缺行（覆盖率缺口） → 必须 exit 1（P3）', () => {
    const r = withTree((d) => {
        const p = REF_P(d);
        const all = rows(readFileSync(p, 'utf-8'));
        const victim = all[0][0];
        writeFileSync(p, readFileSync(p, 'utf-8').split('\n').filter((l) => l.trim() !== victim).join('\n') + '\n');
    });
    assert.strictEqual(r.status, 1, '缺行必须阻断：' + r.out.slice(-300));
    assert.ok(/P3 新增测试未登记/.test(r.out), '应点名覆盖率缺口');
});

test('v3204 10. 负控制 N3b：参考基准残留登记 → 必须 exit 1（P3）', () => {
    const r = withTree((d) => addRow(REF_P(d), 'ghost_not_on_disk.test.mjs'));
    assert.strictEqual(r.status, 1, '残留登记必须阻断：' + r.out.slice(-300));
    assert.ok(/P3 参考基准登记了不存在的测试/.test(r.out), '应点名残留登记');
});

test('v3204 11. 负控制 N4：退役文件复活到在役面 → 必须 exit 1（P4）', () => {
    const stale = rows(STALE).map((c) => c[0]);
    assert.ok(stale.length > 0, '前提：退役登记不为空');
    const victim = stale.find((f) => existsSync(path.join(ROOT, 'tests', 'archived', f)));
    assert.ok(victim, '前提：至少一个退役文件真在 archived/ 下');
    const r = withTree((d) => {
        cpSync(path.join(d, 'tests', 'archived', victim), path.join(d, 'tests', victim));
        addRow(REF_P(d), victim);
    });
    assert.strictEqual(r.status, 1, '退役复活必须阻断：' + r.out.slice(-300));
    assert.ok(/P4 已退役测试重新出现在在役面/.test(r.out), '应点名退役复活：' + r.out.slice(-400));
});

test('v3204 12. 负控制 N5b：退役文件被追改 → 必须 exit 1（P5b）', () => {
    const stale = rows(STALE).filter((c) => c[1]);
    assert.ok(stale.length > 0, '前提：退役登记带内容指纹');
    const victim = stale[0][0];
    const r = withTree((d) => {
        const p = path.join(d, 'tests', 'archived', victim);
        writeFileSync(p, readFileSync(p, 'utf-8') + '// tampered\n');
    });
    assert.strictEqual(r.status, 1, '追改退役面必须阻断：' + r.out.slice(-300));
    assert.ok(/P5b 退役文件被追改/.test(r.out), '应点名退役面被追改：' + r.out.slice(-400));
});

/* ══════════ 3b. T6：覆盖率转移的负控制（v3.205.0） ══════════ */
// 辅助：把退役登记里某行/全部行的第三列（covered_by）改成给定值。
//   退役面受 sha1 冻结，改 TSV 不影响文件哈希，故这些负控制不会被 P5b 抢答。
const STALE_P = (d) => path.join(d, STALE_REL);
function setCovered(d, mutate) {
    const p = STALE_P(d);
    const lines = readFileSync(p, 'utf-8').split('\n');
    const out = lines.map((l) => {
        if (!l.trim() || l.startsWith('#')) return l;
        const cols = l.split('\t');
        while (cols.length < 3) cols.push('');
        const r = mutate(cols);
        return r === null ? null : r.join('\t');
    }).filter((l) => l !== null);
    writeFileSync(p, out.join('\n') + '\n');
}

test('v3204 12b. 负控制 N7：退役行缺 covered_by → 必须 exit 1（P6）', () => {
    const victim = rows(STALE)[0][0];
    const r = withTree((d) => setCovered(d, (c) => (c[0] === victim ? [c[0], c[1], ''] : c)));
    assert.strictEqual(r.status, 1, '缺覆盖率判据必须阻断：' + r.out.slice(-300));
    assert.ok(/P6 退役登记缺 covered_by/.test(r.out), '应点名缺 covered_by：' + r.out.slice(-400));
    assert.ok(r.out.includes(victim), '应点名具体退役文件');
});

test('v3204 12c. 负控制 N7b：covered_by 指向不存在的见证 → 必须 exit 1（P6 空洞引用）', () => {
    const rowsAll = rows(STALE);
    const bridge = rowsAll.find((c) => (c[2] || '').includes(',')) ;
    assert.ok(bridge, '前提：退役面存在带见证清单的行（桥一代族）');
    const victim = bridge[0];
    const r = withTree((d) => setCovered(d, (c) => (c[0] === victim ? [c[0], c[1], 'ghost_witness.test.mjs'] : c)));
    assert.strictEqual(r.status, 1, '空洞引用必须阻断：' + r.out.slice(-300));
    assert.ok(/P6 covered_by 引用的见证文件不在役/.test(r.out), '应点名空洞引用：' + r.out.slice(-400));
});

test('v3204 12d. 负控制 N7c：全标「无同等覆盖」→ 地板必须失守（P6）', () => {
    const r = withTree((d) => setCovered(d, (c) => [c[0], c[1], '-:本轮一律标无覆盖']));
    assert.strictEqual(r.status, 1, '全标 `-` 等于没判据，必须阻断：' + r.out.slice(-300));
    assert.ok(/P6 覆盖率转移判据地板失守/.test(r.out), '应点名地板失守：' + r.out.slice(-400));
});

test('v3204 12e. 保绿对照 N7d：合法的 covered_by 改动（含合法 `-:理由`）→ 必须 exit 0', () => {
    // 只把「桥一代」第一行的见证换成另一个**同族且被点名**的见证，且不触碰 `-` 行比例地板逻辑
    const victim = rows(STALE).find((c) => (c[2] || '').includes(','))[0];
    const r = withTree((d) => setCovered(d, (c) => (c[0] === victim ? [c[0], c[1], 'v325_recall_tier.test.mjs'] : c)));
    assert.strictEqual(r.status, 0,
        '合法的覆盖率转移声明不得被误杀（判据要能红能绿）：' + r.out.slice(-400));
});

test('v3204 13. fail-closed：登记表缺失 → 必须 exit 2（不是 0，也不是 1）', () => {
    const r = withTree((d) => rmSync(path.join(d, STALE_REL)));
    assert.strictEqual(r.status, 2, '前置读不到必须 fail-closed：' + r.out.slice(-300));
    assert.ok(r.out.includes('退役登记'), '应说清缺的是哪张表：' + r.out.slice(-200));
});

/* ══════════ 4. 负控制工具两向自证 ══════════ */
test('v3204 14. 负控制工具两向自证：锚点不存在 / 不唯一必须抛；登记表查询面不为空', () => {
    assert.throws(() => breakText('abc', 'zzz', 'q'), /拒绝破坏/, '锚点不存在必须抛');
    assert.throws(() => breakText('abcabc', 'abc', 'q'), /拒绝破坏/, '锚点不唯一必须抛');
    assert.strictEqual(breakText('abc', 'abc', 'q'), 'q', '锚点唯一时必须真破坏');
    assert.ok(rows(REF).length >= 50, '参考基准查询面不得缩水（>= 50）');
    assert.ok(rows(STALE).length >= 1, '退役登记查询面不得为空');
    assert.ok(SCAN.includes('createHash'), 'P5b 前提：真源确实用了哈希');
    assert.ok(Object.keys(NXF).length >= 5, '负控制夹具必须齐备（N1/N2/N2b/N2c/N6）');
});

/* ══════════ 5. 退役面已封口 ══════════ */
test('v3204 15. 退役面已封口：archived 清单 == 退役登记，且在役面零命中', () => {
    const dir = path.join(ROOT, 'tests');
    const onArch = readdirSync(path.join(dir, 'archived')).filter((f) => f.endsWith('.test.mjs')).sort();
    const stale = rows(STALE).map((c) => c[0]).sort();
    assert.deepStrictEqual(onArch, stale, 'archived/ 清单必须与退役登记逐字一致');
    assert.ok(onArch.length >= 17, '本轮退役面不得缩水（>= 17），实际 ' + onArch.length);
    const onLive = readdirSync(dir).filter((f) => f.endsWith('.test.mjs'));
    for (const f of onArch) assert.ok(!onLive.includes(f), '退役文件不得回到在役面：' + f);
});

/* ══════════ 6. 可移植性证明 ══════════ */
test('v3204 16. 可移植性证明：整仓复制到仓库之外 → 关键用例仍 EXIT 0', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3204-port-'));
    try {
        for (const item of readdirSync(ROOT)) {
            if (item === '.git' || item === 'node_modules') continue;
            cpSync(path.join(ROOT, item), path.join(dir, item), { recursive: true });
        }
        // 只看「曾经绑死本机路径」的那一族：取参考基准里前 12 个用例（覆盖绝对路径改写面）
        const probes = rows(REF).map((c) => c[0]).slice(0, 12).join(' ');
        const r = spawnSync(process.execPath, ['tests/run.mjs', ...probes.split(' ')], {
            cwd: dir, encoding: 'utf-8', timeout: 300000,
        });
        const out = (r.stdout || '') + (r.stderr || '');
        assert.strictEqual(r.status, 0,
            '同一天测试集换一个 checkout 位置必须仍然全绿（位置无关性）：' + out.slice(-500));
        assert.ok(/文件 12\/12 通过/.test(out), '12 个采样文件必须全部通过（位置无关性）：' + out.slice(0, 300));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
});

/* ══════════ 7. 判据面自防护 ══════════ */
test('v3204 17. 判据面自防护：断言数 / 代码行 / 关键指纹不得缩水', () => {
    const nAssert = (SELF.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 30, '断言数不得缩水（>= 30），实际 ' + nAssert + ' —— 判据被删或改宽松时此处必须响');
    const nl = SELF.split('\n').filter((l) => {
        const s = l.trim();
        return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*');
    }).length;
    assert.ok(nl >= 60, '有效代码行不得缩水（>= 60），实际 ' + nl);
    for (const [label, needle] of [
        ['结构面：P5b 标记', 'P5b 退役文件被追改'],
        ['行为面：真仓库 exit 0', '健康树上必须 exit 0'],
        ['负控制：本仓绝对路径', '本仓绝对路径字面量'],
        ['负控制：保绿对照', '保绿对照'],
        ['负控制：覆盖率缺口', '覆盖率缺口'],
        ['负控制：退役复活', '退役复活'],
        ['负控制：退役面追改', '追改退役面'],
        ['fail-closed 出口', 'fail-closed'],
        ['可移植性证明', '位置无关性'],
        ['工具两向自证', '拒绝破坏'],
    ]) assert.ok(SELF.includes(needle), '关键指纹缺失：' + label);
});
