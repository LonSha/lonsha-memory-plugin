/* ============================================================
 * tests/v3203_version_guard_handover.test.mjs — v3.203.0
 *
 * 主题：版本守卫交接 —— 把「每次抬版手工改 21 处」从纪律变成结构判据。
 *
 *   v3.202.0 的 TODO T1 记的是同一件事：至少 9 个历史测试把上一版版本号写进
 *   断言期望值（换一版就要人工替换一遍，实测 21 处），且另有一整套「交棒链」
 *   断言要求历史文件的版本下界随抬版上抬 —— 两者互为锁扣，只改一处其余立刻翻红。
 *   本版拆掉这条仪式，并把「不许再长回来」交给一个版本无关的审计脚本。
 *
 * 覆盖：
 *   1 结构面：审计脚本在场 / 五条判据 / 三档退出码 / 自身零版本字面量
 *   2 行为面：真仓库 exit 0 且读数可察
 *   3 负控制：六组（真源码破坏 → 独立树 → 同款真判据），含一组保绿对照
 *   4 交棒链已拆：历史文件的 vnum() 下界逐文件核回各自出生版本
 *   5 判据面自防护：断言数 / 代码行 / 关键指纹
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, cpSync, readdirSync } from 'fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const ROOT = REPO_ROOT;
const SELF = readFileSync(fileURLToPath(import.meta.url), 'utf-8');
const idx = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
const SCAN_REL = 'tests/audit/scan_version_guard.mjs';
const SCAN = readFileSync(path.join(ROOT, SCAN_REL), 'utf-8');

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
/** 剥行注释后的文本：形态判据一律在它上面做，防注释里的示例文字自我满足 */
const strip = (t) => t.split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n');
const CUR = /const VERSION = '([0-9.]+)'/.exec(idx)[1];
const NGF = JSON.parse(readFileSync(path.join(ROOT, 'tests/audit/fixtures_vg_negative.json'), 'utf-8'));

/* ══════════ 1. 结构面 ══════════ */
test('v3203 1. 版本守卫审计脚本在位，五条判据与三档退出码齐备', () => {
    for (const [needle, why] of [
        ['V1 三源同源', '缺 V1（三源同源）说明'],
        ['V2 ', '缺 V2 判据标记'],
        ['V3 ', '缺 V3 判据标记'],
        ['V4 ', '缺 V4 判据标记'],
        ['V5 ', '缺 V5 判据标记'],
        ['failClosed', '缺 fail-closed 结构兜底'],
        ['process.exit(2)', '缺结构漂移退出码（每个审计脚本的底线）'],
        ['process.exit(1)', '缺真缺陷退出码'],
        ['LONSHA_AUDIT_ROOT', '缺夹具通道（负控制依赖它）'],
        ["read('package.json')", 'V1 须显式处理 package.json —— 夹具树里没有它'],
        ['anchored', '缺当版锚点计数（V4 的基准）'],
        ['frontier', '缺当版 frontier 判定（V5 的基准）'],
    ]) assert.ok(SCAN.includes(needle), why + '：' + needle);
});

test('v3203 2. 版本守卫自身版本无关（脚本体内不得含任何版本字面量）', () => {
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
test('v3203 3. 真仓库上 exit 0：当前版本 / 历史测试 / 当版 frontier / 当版锚点 / 问题 0', () => {
    const r = runScan(ROOT);
    const out = (r.stdout || '') + (r.stderr || '');
    assert.strictEqual(r.status, 0, '健康树上必须 exit 0：' + out.slice(-300));
    assert.ok(out.includes('当前 ' + CUR), '口径须念出当前版本：' + out.slice(0, 200));
    assert.ok(/历史测试 \d+/.test(out), '须念出历史测试数（扫描面退化时可察）');
    assert.ok(/当版 frontier [1-9]/.test(out), 'frontier 至少 1 个（同版可含多个 frontier；细则见 CHANGELOG v3.204.0）');
    assert.ok(/当版锚点 [1-9]/.test(out), '当版锚点必须在场（否则 V4 失去基准）');
    assert.ok(/问题 0/.test(out), '须报「问题 0」');
});

test('v3203 4. 三源同源 + CHANGELOG 顶节为本版（发布面）', () => {
    assert.strictEqual(CUR, manifest.version, 'manifest 须跟随 index.js');
    assert.strictEqual(CUR, pkg.version, 'package.json 须跟随 index.js');
    assert.ok(changelog.startsWith('## v' + CUR), 'CHANGELOG 顶节须为本版');
    assert.ok(vnum(CUR) >= vnum('3.203.0'), '本版不得低于 3.203.0（本文件出生版本，不随抬版上抬）');
});

/* ══════════ 3. 负控制：真源码破坏 → 独立树 → 同款真判据 ══════════ */
const HIST = 'tests/v3201_summary_reltime_and_diag_ledger.test.mjs';
const FRONT = 'tests/v3203_version_guard_handover.test.mjs';

function breakText(src, anchor, repl) {
    const n = src.split(anchor).length - 1;
    if (n !== 1) throw new Error('拒绝破坏：锚点命中 ' + n + ' 次（要求恰好 1 次）');
    return src.split(anchor).join(repl);
}
function mkTree() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3203-vg-'));
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
const HIST_INJECT = NGF.n1HardEqual.replace('__CUR__', CUR);

test('v3203 5. 负控制 N1：硬等号重新长回 → 必须 exit 1（V2）', () => {
    const r = withTree((d) => {
        const p = path.join(d, HIST);
        writeFileSync(p, readFileSync(p, 'utf-8') + HIST_INJECT);
    });
    assert.strictEqual(r.status, 1, 'V2 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-200));
    assert.ok(/V2 /.test(r.out), '归因串须指向 V2');
    assert.ok(r.out.includes(path.basename(HIST)), '须点名出问题的文件');
});

test('v3203 6. 负控制 N2：历史下界抬到未来 → 必须 exit 1（V3）', () => {
    const r = withTree((d) => {
        const p = path.join(d, HIST);
        writeFileSync(p, readFileSync(p, 'utf-8') + NGF.n2FutureBound.replace('__FUTURE__', '9.999.0'));
    });
    assert.strictEqual(r.status, 1, 'V3 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-200));
    assert.ok(/V3 /.test(r.out), '归因串须指向 V3');
});

test('v3203 7. 负控制 N3：三源不同源 → 必须 exit 1（V1）', () => {
    const r = withTree((d) => {
        const p = path.join(d, 'manifest.json');
        const mf = JSON.parse(readFileSync(p, 'utf-8'));
        mf.version = '9.999.0';
        writeFileSync(p, JSON.stringify(mf, null, 2) + '\n');
    });
    assert.strictEqual(r.status, 1, 'V1 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-200));
    assert.ok(/V1 /.test(r.out), '归因串须指向 V1');
});

test('v3203 8. 负控制 N4：当版锚点被删空 → 必须 exit 1（V4）', () => {
    const r = withTree((d) => {
        // 当版锚点可能散在多个文件里（frontier 自己 + 交棒后的后继）：全部删空才算真的没有基准。
        const dir = path.join(d, 'tests');
        const needle = "vnum('" + CUR + "')";
        let hit = 0;
        for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.mjs'))) {
            const p = path.join(dir, f);
            const s = readFileSync(p, 'utf-8');
            const n = s.split(needle).length - 1;
            if (!n) continue;
            hit += n;
            writeFileSync(p, s.split(needle).join("vnun('" + CUR + "')"));
        }
        assert.ok(hit >= 1, '夹具前提：树里须含当版锚点');
    });
    assert.strictEqual(r.status, 1, 'V4 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-200));
    assert.ok(/V4 /.test(r.out), '归因串须指向 V4');
});

test('v3203 9. 负控制 N5：frontier 文件头版本被改 → 必须 exit 1（V5）', () => {
    const r = withTree((d) => {
        // 「少一个 frontier」也可能是另一个文件顶上来（本轮实测：v3204 加入后 v3203 不再是 frontier）。
        // 要证明 V5 会响，必须把**所有** frontier 头都打破 —— 即同一行同时含本文件名与当版号的行。
        const dir = path.join(d, 'tests');
        let hit = 0;
        for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.mjs'))) {
            const p = path.join(dir, f);
            const lines = readFileSync(p, 'utf-8').split('\n');
            const base = f.replace(/[.]test[.]mjs$/, '');
            let changed = false;
            for (let i = 0; i < Math.min(12, lines.length); i++) {
                if (lines[i].includes(base) && lines[i].includes('v' + CUR)) {
                    lines[i] = lines[i].split('v' + CUR).join('v9.999.0');
                    hit++; changed = true;
                }
            }
            if (changed) writeFileSync(p, lines.join('\n'));
        }
        assert.ok(hit >= 1, '夹具前提：树里存在 frontier 头');
    });
    assert.strictEqual(r.status, 1, 'V5 必须翻红，实得 ' + r.status + ' / ' + r.out.slice(-200));
    assert.ok(/V5 /.test(r.out), '归因串须指向 V5');
});

test('v3203 10. 负控制 N6（保绿对照）：只加一行注释 → 仍须 exit 0', () => {
    const r = withTree((d) => {
        const p = path.join(d, HIST);
        writeFileSync(p, '// 保绿对照：只加一行注释，不改任何判据\n' + readFileSync(p, 'utf-8'));
    });
    assert.strictEqual(r.status, 0, '只加注释不该改变结论（判据不是随便翻红）：' + r.out.slice(-200));
});

test('v3203 11. 负控制工具两向自证：锚点不存在或不唯一必须抛', () => {
    assert.throws(() => breakText(idx, 'THIS_ANCHOR_DOES_NOT_EXIST_V3203', ''), /拒绝破坏/,
        '锚点不存在必须抛（否则「破坏」是假的）');
    assert.throws(() => breakText(idx, 'const ', ''), /拒绝破坏/, '多命中必须抛');
    assert.ok(idx.includes('const VERSION'), '真源码里锚点前提成立（否则整组负控制是空的）');
});

test('v3203 10b. 回归：给历史文件头部加含当版号的注记，不得被蹭成 frontier', () => {
    // 本轮实测（3.204.0）：36 个文件的去绝对化注记里写了「[v3.204.0] …」，落在前 12 行，
    //   旧判据 head.includes('v' + current) 把它们全当成 frontier，**V2/V3 对 32 个文件静默失效**。
    //   这条回归钉住「frontier 必须是结构性的」：同一行同时出现本文件名与当版号。
    const r = withTree((d) => {
        const p = path.join(d, HIST);
        const lines = readFileSync(p, 'utf-8').split('\n');
        lines.splice(2, 0, '// [v' + CUR + '] 只是去绝对化注记，不代表本文件是当版');
        writeFileSync(p, lines.join('\n'));
    });
    assert.strictEqual(r.status, 0, '注记不得影响结论：' + r.out.slice(-400));
    // [v3.205.0] 版号无关化且**不许放宽**：本条要证的是「注记不改变 frontier 数量」。
    //   改成「>= 1」会让判据静默失效（注记真的被蹭成 frontier 时数量仍在 1 以上）。
    //   故取未注入时的基线，要求逐位相等：多了=被蹭宽，少了=豁免失效。
    const baseN = Number((/当版 frontier ([0-9]+)/.exec(runScan(ROOT).stdout || '') || [0, 0])[1] || 0);
    const gotN = Number((/当版 frontier ([0-9]+)/.exec(r.out) || [0, 0])[1] || 0);
    assert.ok(baseN >= 1, '夹具前提：当版须至少一个 frontier');
    assert.strictEqual(gotN, baseN,
        '注记不得改变 frontier 数量（基线 ' + baseN + '，实得 ' + gotN + '）；'
        + '被蹭成 frontier 时 V2/V3 会静默失效：' + (r.out.split('\n')[0] || ''));
});

/* ══════════ 4. 交棒链已拆：历史文件锁回各自的出生版本 ══════════ */
const BIRTH = {
    'v3160_config_declaration_gap': '3.160.0',
    'v3161_config_reachability': '3.161.0',
    'v3162_ui_binding_hygiene': '3.162.0',
    'v3163_module_wiring': '3.163.0',
    'v3164_event_lifecycle': '3.164.0',
    'v3165_claim_truthfulness': '3.165.0',
    'v3166_config_migration_write_ledger': '3.166.0',
    'v3167_cse_capacity_identity': '3.167.0',
    'v3168_silent_degradation': '3.168.0',
    'v3172_recall_funnel_read_surface': '3.172.0',
    'v3174_bridge_reader_contract': '3.174.0',
    'v3176_world_ledger_reader': '3.176.0',
    'v3177_syntax_gate_perf': '3.177.0',
    'v3180_floor_ledger_age_anchor_public_interface': '3.180.0',
    'v3181_spatial_grounding': '3.181.0',
    'v3182_ledger_replay': '3.182.0',
    'v3186_emotion_opposite_recall': '3.186.0',
    'v3196_parallel_secret_ledgers': '3.196.0',
    'v3197_recall_echo_ledgers': '3.197.0',
    'v3198_ledger_replay_r2_behavioral': '3.198.0',
    'v3199_ledger_replay_r2_shift_behavioral': '3.199.0',
    'v3200_cost_ledger_snippet_match': '3.200.0',
    'v3201_summary_reltime_and_diag_ledger': '3.201.0',
    'v3202_carryover_rollback_breadth': '3.202.0',
};
test('v3203 12. 历史文件的 vnum() 下界恰为各自出生版本（交棒链已拆）', () => {
    let n = 0;
    for (const [f, birth] of Object.entries(BIRTH)) {
        const code = strip(readFileSync(path.join(ROOT, 'tests', f + '.test.mjs'), 'utf-8'));
        const bounds = [...new Set([...code.matchAll(/vnum\('([0-9]+[.][0-9]+[.][0-9]+)'\)/g)].map((m) => m[1]))].sort();
        assert.ok(bounds.length > 0, f + ' 应有版本下界断言');
        assert.deepStrictEqual(bounds, [birth],
            f + ' 的下界应恰为出生版本 ' + birth + '（锁回自己 = 不再随抬版失效），实得 ' + JSON.stringify(bounds));
        n++;
    }
    assert.ok(n >= 24, '覆盖面不得缩水（>= 24 个历史文件），实际 ' + n);
});

test('v3203 13. 交棒链断言已改为「不得高于现版」，不再要求随抬版上抬', () => {
    // 形态写两种：`h <= cur`（先在 map 里取数）与 `vnum(h) <= cur`（现场取数）。
    const upperBound = /(?:vnum\(h\)|h)\s*<=\s*(?:cur|vnum\(curV\))/;
    const lowerBound = /(?:vnum\(h\)|h)\s*>=\s*(?:cur|vnum\(curV\)|vnum\()/;
    for (const f of ['v3160_config_declaration_gap', 'v3162_ui_binding_hygiene', 'v3164_event_lifecycle',
        'v3165_claim_truthfulness', 'v3168_silent_degradation', 'v3185_querytext_and_xref_consumer',
        'v3186_emotion_opposite_recall']) {
        const code = strip(readFileSync(path.join(ROOT, 'tests', f + '.test.mjs'), 'utf-8'));
        assert.ok(upperBound.test(code), f + ' 须保留「下界不得高于现版」的形态');
        assert.ok(!lowerBound.test(code),
            f + ' 不得再要求历史下界 >= 现版（那正是每次发版手改 21 处的出处）');
    }

    // 反向自证：旧形态确实会被这两条判据抓住（否则本组是恒绿）
    const legacy = 'assert.ok(hits.every((h) => h >= cur), x);';
    assert.ok(lowerBound.test(legacy), '旧形态（>= cur）必须被 lowerBound 命中');
    const legacy2 = 'assert.ok(hits.every((h) => vnum(h) >= vnum("3.159.0")));';
    assert.ok(lowerBound.test(legacy2), '旧形态（vnum 下界）必须被 lowerBound 命中');
    const fresh = 'assert.ok(hits.every((h) => h <= cur), x);';
    assert.ok(upperBound.test(fresh) && !lowerBound.test(fresh), '新形态须只被 upperBound 命中');
});

test('v3203 14. 口径收敛在守卫脚本里，runner 按目录发现（新增脚本无需登记）', () => {
    const r = runScan(ROOT);
    assert.ok(/当版 frontier [1-9]/.test(r.stdout), 'frontier 判定由脚本统一给出（当版至少一个）');
    const onDisk = readFileSync(path.join(ROOT, 'tests', 'run.mjs'), 'utf-8');
    assert.ok(/readdirSync\(AUDIT_DIR\)\.filter\(f => f\.endsWith\('\.mjs'\) && !f\.startsWith\('_'\)\)/.test(onDisk),
        'run.mjs 按目录自动发现审计脚本');
    assert.ok(!/scan_version_guard/.test(onDisk), '不得把新脚本硬编码进 runner（那正是 v3.162 修掉的老毛病）');
});

/* ══════════ 5. 验收与判据面自防护 ══════════ */
test('v3203 15. TODO T1 已销账：修掉即从 TODO 删除，留痕在 CHANGELOG', () => {
    const todo = readFileSync(path.join(ROOT, 'TODO.md'), 'utf-8');
    assert.ok(!/^## T1 版本守卫硬编码/m.test(todo), 'T1 已在本版修掉，须从 TODO 删除');
    // [v3.205.0] 版号无关化：原文是 todo.includes('v3.204.0')，那是「锁上一版」——
    //   正是本文件要治的反模式换了个位置（下一次抬版就必红）。改为指向 CUR。
    assert.ok(todo.includes('v' + CUR), 'TODO 的「最近更新」须指向本版');
    assert.ok(/scan_version_guard/.test(changelog), 'CHANGELOG 须点名新审计脚本（留痕）');
    assert.ok(/交棒链|出生版本/.test(changelog), 'CHANGELOG 须说清拆掉的是什么');
});

test('v3203 16. 判据面自防护：断言数 / 代码行 / 关键指纹不得缩水', () => {
    const nAssert = (SELF.match(/assert[.]/g) || []).length;
    assert.ok(nAssert >= 40, '断言数不得缩水（>= 40），实际 ' + nAssert + ' —— 判据被删或改宽松时此处必须响');
    const nl = SELF.split('\n').filter((l) => {
        const s = l.trim();
        return s && !s.startsWith('//') && !s.startsWith('*') && !s.startsWith('/*');
    }).length;
    assert.ok(nl >= 100, '有效代码行不得缩水（>= 100），实际 ' + nl);
    for (const [label, needle] of [
        ['结构面：V 判据标记', 'V4 '],
        ['行为面：真仓库 exit 0', '健康树上必须 exit 0'],
        ['负控制：硬等号重新长回', '硬等号重新长回'],
        ['负控制：保绿对照', '保绿对照'],
        ['交棒链：出生版本表', 'BIRTH'],
        ['frontier 不得被注记蹭宽', '被蹭成 frontier'],
        ['工具两向自证', '拒绝破坏'],
        ['负控制：frontier 被改', 'frontier 文件头版本被改'],
    ]) assert.ok(SELF.includes(needle), '关键指纹缺失：' + label);
});
