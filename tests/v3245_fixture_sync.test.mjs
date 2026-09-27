// tests/v3245_fixture_sync.test.mjs —— 夹具同步门禁自身的行为自证 [v3.245.0]
// ------------------------------------------------------------
// 计划 #2「负控制夹具自动同步」的配套测试。本档回答的问题只有一个：
//   **tests/audit/scan_fixture_sync.mjs 的判据，有没有被测过？**
// 它在 v3.245.0 之前的答案是「没有」——夹具同步门禁 E4 段首跑就把这件事报了出来：
//   「scan_fixture_sync.mjs 没有观测点：既无配对负控制，也没有任何测试套件在它身上做真源码破坏」。
// 本档就是那个观测点：把两条判据抽成可复用的纯函数，用**真表破坏**驱动它们转红，
// 并在原件上先正一次（否则 N 组是假红）。
//
// 纪律（同仓各前沿套件）：
//   · 判据先抽成纯函数再正反两向用 —— 原件上必须为真，破坏副本上必须为假；
//   · 破坏必须锚点恰中 1 次（防锚点漂移后静默跳过）；
//   · 段数自证：门禁的 EXPECT_SECTIONS 与实际段数必须相等（判据段被删即失去自证）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pairDiff, gateFiles, fixtureFiles, effectiveCopies, failClosedOf, fileLits } from './_fixture_sync.mjs';
import { mutateOnce } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const GATE = path.join(AUDIT, 'scan_fixture_sync.mjs');
const read = (p) => fs.readFileSync(p, 'utf8');

/** 门禁真实读入的两个文件（本套件不得把门禁源码写成「像是什么」，必须真读） */
const gateSrc = read(GATE);
const libSrc = read(path.join(ROOT, 'tests', '_fixture_sync.mjs'));

/* ══════════ A 门禁本体在场 ══════════ */
test('v3245 A1. ★★ 门禁与唯一真源都在位，且门禁从真源 import（不得本地重写助手）', () => {
    assert.ok(fs.existsSync(GATE), '门禁必须在场：tests/audit/scan_fixture_sync.mjs');
    const lib = path.join(ROOT, 'tests', '_fixture_sync.mjs');
    assert.ok(fs.existsSync(lib), '唯一真源必须在场：tests/_fixture_sync.mjs');
    // 落点纪律：辅助库必须在 tests/ 下（放 tests/audit/ 会被 runner 当扫描器执行，零调用即判绿）
    assert.ok(!fs.existsSync(path.join(AUDIT, '_fixture_sync.mjs')),
        '唯一真源不得放进 tests/audit/（run.mjs 的目录发现会把它当扫描器执行，纯定义零调用即判绿）');
    /* 加载形态在本版改过一次（留痕）：原为静态 `import { ... } from '../_fixture_sync.mjs'`，
     *   而真源本身也在 `tests/*.mjs` 扫描面里 —— v3226 的 T 档形态（tests/ 下的 .mjs 全掏空）
     *   实测：静态 import 一个被掏空的模块，进程**崩在 ESM 加载栈**上（exit 1），
     *   判据来不及跑、归因不可读。故改为**动态加载 + 导出面逐项核对**（缺一即 exit 2）。
     *   本断言随之改为认动态形态；「不得本地重写助手」单列一条，导出面清单逐项点名。 */
    assert.match(gateSrc, /import\('\.\.\/_fixture_sync\.mjs'\)/,
        '门禁必须从唯一真源取用清单提取（动态加载：真源被掏空时须 fail-closed 而非崩在加载栈上）');
    for (const k of ['gateFiles', 'fixtureFiles', 'effectiveCopies', 'failClosedOf']) {
        assert.ok(!new RegExp('function\\s+' + k + '\\s*\\(').test(gateSrc),
            '门禁不得本地重写真源助手 ' + k);
    }
    const apiList = /const LIB_API = \[([^\]]*)\]/.exec(gateSrc);
    assert.ok(apiList, '门禁须有导出面自查清单（动态加载后逐项核对，不得只信「加载成功」）');
    for (const k of ['gateFiles', 'fixtureFiles', 'effectiveCopies', 'failClosedOf', 'listDir']) {
        assert.ok(apiList[1].includes("'" + k + "'"), '导出面自查清单须含 ' + k);
    }
    assert.match(gateSrc, /typeof LIB\[k\] !== 'function'/, '缺导出须 fail-closed（如实 exit 2）');
    // 唯一真源必须导出被判据用到的每个入口（版本化的契约面）
    for (const k of ['gateFiles', 'fixtureFiles', 'effectiveCopies', 'isExtracting', 'failClosedOf', 'fileLits', 'pairDiff', 'listDir']) {
        assert.match(libSrc, new RegExp('export function ' + k + '\\b'), '真源须导出 ' + k);
    }
});
/* ══════════ B 判据纯函数（先抽出来，正反两向都用它） ══════════ */
/** 判据 1（对应门禁 E1）：成对文件数不得低于下限 —— 对数不足即结构漂移 */
function pairFloorJudge(root, minPairs) {
    const names = fs.readdirSync(path.join(root, 'tests', 'audit'));
    const negs = names.filter((f) => f.includes('negctl') && f.endsWith('.mjs'));
    const gates = names.filter((f) => f.startsWith('scan_') && !f.includes('negctl'));
    let n = 0;
    for (const x of negs) if (gates.includes(x.replace('_negctl.mjs', '.mjs'))) n++;
    return n >= minPairs;
}
/** 判据 2（对应门禁 E2）：逐对「门禁消费集 − 负控制有效覆盖集」必须为空 */
function noGapJudge(root) {
    const dir = path.join(root, 'tests', 'audit');
    const names = fs.readdirSync(dir);
    for (const neg of names.filter((f) => f.includes('negctl') && f.endsWith('.mjs'))) {
        const gate = neg.replace('_negctl.mjs', '.mjs');
        if (!names.includes(gate)) continue;
        const d = pairDiff(root, path.join(dir, gate), path.join(dir, neg));
        if (!d) return false;            // 读不到 = 判据无从谈起，按不成立处理
        if (d.missing.length) return false;
    }
    return true;
}

test('v3245 B1. ★★ 两条判据在**原件**上必须为真（否则下面的负控制是假红）', () => {
    assert.equal(pairFloorJudge(ROOT, 10), true, '原件上对数下限判据必须为真');
    assert.equal(noGapJudge(ROOT), true, '原件上「无缺口」判据必须为真');
    /* [v3.247.0] 登记的**整树复制**对必须被判为无缺口 —— 这一条是行为断言，不是文本断言：
     *   字面量口径在整树夹具上恒误报（源码里只有目录名），故真源 pairDiff 对
     *   「整树复制 + 已登记」直接判无缺口；门禁侧改判**探针**（真跑，门禁必须 exit 0）。
     *   两形态各自有据，不存在「多报即忽略」；未登记的整树复制由门禁侧单独报红。 */
    for (const negName of fs.readdirSync(AUDIT).filter((f) => f.includes('negctl') && f.endsWith('.mjs'))) {
        const gateName = negName.replace('_negctl.mjs', '.mjs');
        if (!fs.existsSync(path.join(AUDIT, gateName))) continue;
        const d = pairDiff(ROOT, path.join(AUDIT, gateName), path.join(AUDIT, negName));
        assert.ok(d, 'pairDiff 必须给出读数：' + negName);
        if (d.isMirror) {
            assert.equal(d.registered, true, negName + ' 用了整树复制却未登记（登记面是唯一可写点）：' + gateName);
            assert.deepEqual(d.missing, [], negName + ' 已登记的整树复制必须判无缺口（否则是判据在量一个不是缺陷的东西）');
        }
    }
    /* 本门禁自己的 fail-closed 面必须是**空**的：它探的是目录（tests/audit、tests/），
     *   不探具体文件 ⇒ 没有「故意不搬」的文件面 ⇒ 它消费的每一个字面量文件都必须被
     *   配对负控制覆盖（这正是 _fixture_sync.failClosedOf 的排除语义）。
     *   若将来给它加了文件级 existsSync 预检，本断言会转红，逼一次显式决定：
     *   那个文件究竟该进 fixture，还是该登记进 fail-closed 面。 */
    assert.deepEqual([...failClosedOf(gateSrc)], [],
        '本门禁的结构预检针对目录，不应有文件级 fail-closed 面（有则需显式复核 E2 的排除口径）');
});


/* ══════════ C 负控制：真表破坏 ⇒ 同款真判据必须转红 ══════════ */
test('v3245 N1. ★★ 负控制·阈值被放大 ⇒ 对数下限判据转红（下限不是装饰）', () => {
    const broken = mutateOnce(gateSrc, 'const MIN_PAIRS = 10;', 'const MIN_PAIRS = 9999;');
    // 判据本体不读源码，故这里破坏的是**常量**：把下限抬到不可能满足的值，
    //   等价于「探测面塌缩」，必须转红（门禁在真表上会由此 bail）。
    const minPairs = /const MIN_PAIRS = (\d+);/.exec(broken)[1];
    assert.equal(pairFloorJudge(ROOT, Number(minPairs)), false,
        '下限抬到 9999 后对数下限判据必须转红（否则该下限是装饰品）');
    assert.equal(pairFloorJudge(ROOT, 10), true, '对照：原件下限上仍为真');
});

test('v3245 N2. ★★ 负控制·真表少喂一个门禁会读的文件 ⇒ 无缺口判据转红', () => {
    // 用真表：挑一对真实成对文件，把那对里的负控制**可复制集**剥掉一项（模拟「漏喂」），
    //   再跑同一判据 —— 必须报出缺口。手法是「真源码破坏 + 真判据重跑」，不是模拟常量。
    const neg = 'scan_v3185_xref_consumer_negctl.mjs';
    const gate = 'scan_v3185_xref_consumer.mjs';
    const negPath = path.join(AUDIT, neg);
    const gatePath = path.join(AUDIT, gate);
    const missingOf = (root, negP, gateP) => {
        const d = pairDiff(root, gateP, negP);
        return d ? d.missing : null;
    };
    assert.deepEqual(missingOf(ROOT, negPath, gatePath), [] , '原件这对必须无缺口');
    // 破坏：把负控制源码里那条**真实搬运项**改成搬不到的文件名（锚点恰中 1 次），
    //   覆盖集随之缩小 —— 这正是「手写清单漂移」的真实形态（搬错名字 / 门禁改了文件名）。
    const src = read(negPath);
    /* 锚点必须恰中 1 次（本仓铁律）：同一文件名在负控制里可能出现在多处（清单 + 断言），
     *   故逐个候选试命中数，只取恰中 1 次的那个 —— 否则「破坏到不止一处」会让归因错位。 */
    let fileHit = null;
    let broken = null;
    for (const f of gateFiles(ROOT, gatePath)) {
        const q = "'" + f + "'";
        if (src.split(q).length - 1 !== 1) continue;
        fileHit = f;
        broken = mutateOnce(src, q, "'" + f + ".bak'");   // 破坏：搬错文件名
        break;
    }
    assert.ok(fileHit, '该负控制应至少有一处「恰中 1 次」的文件名搬运项（否则本组无从构造）');

    const tmp = fs.mkdtempSync(path.join(HERE, '.v3245-'));
    try {
        const tAudit = path.join(tmp, 'tests', 'audit');
        fs.mkdirSync(tAudit, { recursive: true });
        // 只搬这一对 + 真源（清单提取只看这几个文件）
        fs.cpSync(path.join(ROOT, 'tests', '_fixture_sync.mjs'), path.join(tmp, 'tests', '_fixture_sync.mjs'));
        fs.cpSync(path.join(ROOT, 'tests', '_audit_lib.mjs'), path.join(tmp, 'tests', '_audit_lib.mjs'));
        fs.cpSync(gatePath, path.join(tAudit, gate));
        fs.writeFileSync(path.join(tAudit, neg), broken);
        // 该负控制还会 join 仓内文件；把真仓的 gauntlet 文件软链过来，保证 repoExists 口径一致
        for (const f of gateFiles(ROOT, gatePath)) {
            const srcP = path.join(ROOT, f);
            const dstP = path.join(tmp, f);
            if (fs.existsSync(srcP) && !fs.existsSync(dstP)) {
                fs.mkdirSync(path.dirname(dstP), { recursive: true });
                fs.cpSync(srcP, dstP);
            }
        }
        const miss = missingOf(tmp, path.join(tAudit, neg), path.join(tAudit, gate));
        assert.ok(miss && miss.includes(fileHit),
            '把负控制真源码里的一条搬运项破坏掉后，同一判据必须报出该缺口（实得 ' + JSON.stringify(miss) + '）');
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
});

test('v3245 N3. ★★★ 负控制·门禁段数自证常量与真表对不上 ⇒ 自证判据转红', () => {
    const count = (s) => [...s.matchAll(/^\/\* ---------- /gm)].length;
    assert.equal(count(gateSrc), Number(/const EXPECT_SECTIONS = (\d+);/.exec(gateSrc)[1]),
        '原件上 EXPECT_SECTIONS 必须等于真实段数（这正是门禁 E6 的自证）');
    // 真源码破坏：删掉一个判据段的整段标题（模拟「判据段被删/改名」）
    const broken = mutateOnce(gateSrc, '/* ---------- E5 活性面读数（目录真值） ---------- */',
        '/* --- E5 活性面读数（目录真值） --- */');
    assert.equal(count(broken), count(gateSrc) - 1, '破坏后段数必须真少 1（破坏可观测）');
    assert.notEqual(count(broken), Number(/const EXPECT_SECTIONS = (\d+);/.exec(broken)[1]),
        '段数自证判据必须转红（判据段被删却仍自证通过 = 自证是装饰品）');
});

/* ══════════ D 唯一真源的形态覆盖（本版落盘时实测过的四类写法） ══════════ */
test('v3245 D1. ★★ 唯一真源的四类清单写法都要认（数组/单件/join/派生）', () => {
    const dir = fs.mkdtempSync(path.join(HERE, '.v3245-lib-'));
    try {
        fs.writeFileSync(path.join(dir, 'a.js'), 'x');
        fs.writeFileSync(path.join(dir, 'b.json'), '{}');
        fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ js: 'a.js', extra_js: ['b.json'] }));
        const neg = path.join(dir, 'neg.mjs');
        fs.writeFileSync(neg, [
            "const GAUGED = ['a.js'];",
            "const FILES = { k: 'b.json' };",
            "const p = path.join(SRC, 'manifest.json');",
            "for (const f of [mf.js].concat(mf.extra_js || [])) {}",
        ].join('\n'));
        const lits = [...fixtureFiles(dir, neg)].sort();
        assert.deepEqual(lits, ['a.js', 'b.json', 'manifest.json'],
            '数组值 / 对象值 / join 实参三类字面量都要提出来（manifest.json 同样是真字面量）');
        const eff = [...effectiveCopies(dir, neg, path.join(dir, 'gate.mjs'))].sort();
        assert.ok(eff.includes('a.js') && eff.includes('b.json'), '派生来源（manifest 的 js + extra_js）也要算进来');
        // 注释里的文件名不算消费（只看代码）
        const neg2 = path.join(dir, 'neg2.mjs');
        fs.writeFileSync(neg2, "// 本判据会读 'ghost.js'\nconst x = 1;\n");
        fs.writeFileSync(path.join(dir, 'ghost.js'), 'x');
        assert.deepEqual([...fileLits(read(neg2))], [], '注释里的文件名不得被算成消费');
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

/* ══════════ E 活性面与版本锚 ══════════ */
test('v3245 E1. ★★ 门禁的活性面读数与 runner 的发现口径同源（脚本数由目录真值点出）', () => {
    const runSrc = read(path.join(ROOT, 'tests', 'run.mjs'));
    assert.match(runSrc, /readdirSync\(AUDIT_DIR\)\.filter\(f => f\.endsWith\('\.mjs'\) && !f\.startsWith\('_'\)\)/,
        'run.mjs 的审计脚本发现口径不得改变（门禁的读数以它为调用方）');
    assert.match(gateSrc, /MIN_AUDIT_SCRIPTS = \d+/, '门禁须有脚本数下限（目录读数失真不得当「没问题」）');
    const live = fs.readdirSync(AUDIT).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).length;
    assert.ok(live >= 30, '在役审计脚本实得 ' + live + '（< 30 说明扫描面失真）');
});

const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3245 E2. ★ 版本锚（下限锚，不随抬版漂移）', () => {
    const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
    const idx = read(path.join(ROOT, 'index.js'));
    const codeVer = (/const VERSION = '([^']+)'/.exec(idx) || [])[1];
    assert.ok(codeVer, '入口版本常量在场');
    assert.ok(vnum(codeVer) >= vnum('3.245.0'), '本套件只在 3.245.0 及以后成立；当前 ' + codeVer);
    assert.equal(pkg.version, codeVer);
});
