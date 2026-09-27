// 审计基建 AX 的**负控制**（v3.207.0）：证明 scan_ledger_contract.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 为什么单独成档：
//   一条判据「跑绿了」只说明它没报警，不说明它**会**报警。判据恒绿有三种伪装：
//     ① 对原文件断言 —— 破坏没发生也绿；
//     ② 把破坏写死成模拟常量 —— 真判据根本没被调用；
//     ③ 破坏把判据自己删了 —— 自我指涉。
//   本档统一用「真源码破坏 → 独立 fixture 树 → 在副本上重跑同一套真判据」排除这三种。
//
// 纪律（四条都是本仓被踩过才写的）：
//   · 每次破坏发生在**独立 fixture 目录**里，只搬判据真正读的文件
//     （清单从门禁源码提取，见下方 BOOKS / MIN_BOOKS 段 —— 不手抄，手抄必漂移）；
//     LONSHA_AUDIT_ROOT 指过去 ⇒ 源仓库零污染，且判据读的确实是「被破坏的那份真源码」。
//   · 锚点必须**恰中期望次数**：命中数不符 ⇒ 该组作废并报错（防锚点漂移后静默跳过，
//     把「没破坏成功」误读成「判据对破坏无反应」）。
//   · 破坏后先 `node --check`（仅 .js）：非零退出必须来自判据，而不是解析崩溃。
//   · 只断言「退出码对」**不够**：exit 1 也可能来自另一条判据 —— 那样归因是错的。
//     故每组另断言**缺陷点名**（marker 必须出现在输出里），即「红得对，不是红得巧」。
//
// 判据：V0 原版对照必须 exit 0；其余破坏组逐组命中期望退出码且带期望点名；V6/V7 结构漂移须 exit 2。
//   [v3.246.0] 组数 12 → 14：新增 R9（名册与扫描面同源）的两向观测点 V13 / V14。
//   V14 是**多文件改写**组（新建账本副本 + 在 manifest 里登记它），形态见 CASES 表内说明。
// 退出码：0=负控制成立  1=负控制失效  2=结构漂移（负控制无法建立）
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN = path.join(HERE, 'scan_ledger_contract.mjs');
const CONTRACT = 'ledger-entity.js';

/* [v3.240.0] 夹具清单**不再手抄**：从门禁源码里提取 BOOKS 与账本数下限。
 *   手抄必然漂移 —— 本文件原先把 6 本账抄成字面量，门禁把下限抬到 9 本后，
 *   负控制自己先因「只找到 6 本账（下限 9）」exit 2，于是 V0–V5 全线报
 *   「破坏不可归因」：红的不是判据，是夹具。判据要能吃自己的药 ——
 *   清单同源，门禁抬一处，负控制跟着动，没有第二处可漏。 */
if (!fs.existsSync(SCAN)) {
    console.error('[ledger-negctl] 缺门禁 scan_ledger_contract.mjs ——结构漂移（负控制无法建立）');
    process.exit(2);
}
const scanSrc = fs.readFileSync(SCAN, 'utf-8');
const booksMatch = scanSrc.match(/const BOOKS = \[([\s\S]*?)\];/);
const floorMatch = scanSrc.match(/const MIN_BOOKS = FIXTURE_MODE \? 1 : (\d+);/);
if (!booksMatch || !floorMatch) {
    console.error('[ledger-negctl] 无法从门禁源码提取 BOOKS / MIN_BOOKS ——门禁结构已漂移（提取锚点过期）');
    process.exit(2);
}
const BOOKS = [...booksMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
const MIN_BOOKS = Number(floorMatch[1]);
if (!BOOKS.length || !Number.isFinite(MIN_BOOKS)) {
    console.error('[ledger-negctl] 提取结果为空 ——结构漂移');
    process.exit(2);
}
/* 自证：夹具必须喂满门禁下限。少一本，门禁就在夹具里提前 bail，
 *   而那个 exit 2 会被静默读成「结构漂移判据工作正常」—— 空对空。 */
/* [v3.242.0] 门禁新增 R7（在役登记表不得重复）后，夹具必须一并搬那张表 ——
 *   否则 R7 在夹具里必然报「缺登记表」，而那个报错又会被读成「判据工作正常」（空对空，
 *   与 v3.240.0 那次的「夹具喂不满下限」同形）。名册**不适用缺席容忍**：
 *   它必须存在才谈得上「无重复」。 */
const TSV_REL = 'tests/audit/catalog_reference_consumers.tsv';
/* [v3.246.0] 夹具清单**不再逐项手抄**：从 manifest.extra_js 派生。
 *   为什么：本档原先把 `index.js` 与九本账抄成字面量 —— 那份清单和门禁真正会读的文件集
 *   是**两份**（本仓最贵的形态：清单两份，改一份漏一份）。派生之后，新增/改名账本只需改
 *   manifest 一处，本档自动跟上；剩下唯一会漏的是**读取器本身**（见下面的自证）。
 *   仍显式带上 manifest.json 与 TSV：它们不在 extra_js 里，但门禁 R0/R7 会读。 */
const MF_REL = 'manifest.json';
if (!fs.existsSync(path.join(REPO, MF_REL))) {
    console.error('[ledger-negctl] 缺 manifest.json ——结构漂移（夹具清单无从派生）');
    process.exit(2);
}
const manifest = JSON.parse(fs.readFileSync(path.join(REPO, MF_REL), 'utf-8'));
const EXTRA = Array.isArray(manifest.extra_js) ? manifest.extra_js.slice() : [];
/* index.js 是**主入口**（manifest.js），不在 extra_js 里 —— 故它单独派生，不并入 EXTRA。
 *   [留痕] 本行首版写成 `EXTRA.indexOf('index.js') >= 0` 的自证：实测 extra_js 里没有 index.js，
 *   于是守卫把健康仓判成结构漂移。守卫抓的是它自己看错的对象，而错误方向是**假红**。（v3.246.0 第 3 处自身缺陷） */
const ENTRY = typeof manifest.js === 'string' && manifest.js ? manifest.js : null;
const GAUGED = [MF_REL, ...(ENTRY ? [ENTRY] : []), ...EXTRA, TSV_REL];
/* 读取器自证：派生出的清单必须**真的喂满**门禁下限，且契约与账本都在里面。
 *   少一本，门禁就在夹具里提前 bail，而那个 exit 2 会被静默读成「结构漂移判据工作正常」——
 *   空对空。所以这里不是「应该没问题」，而是当场数一遍。 */
const derivedBooks = BOOKS.filter((f) => EXTRA.indexOf(f) >= 0).length;
if (BOOKS.length < MIN_BOOKS || derivedBooks < MIN_BOOKS) {
    console.error('[ledger-negctl] 夹具喂不满：派生清单里账本 ' + derivedBooks + ' 本（下限 ' + MIN_BOOKS
        + '）——结构漂移（负控制将空对空）');
    process.exit(2);
}
if (EXTRA.indexOf(CONTRACT) < 0) {
    console.error('[ledger-negctl] extra_js 里缺 ' + CONTRACT + ' ——结构漂移');
    process.exit(2);
}
if (!ENTRY) {
    console.error('[ledger-negctl] manifest.js（主入口）缺失或非字符串 ——结构漂移（R4 的消费面对象不在）');
    process.exit(2);
}
console.log('[ledger-negctl] 夹具清单由 manifest.extra_js 派生：' + GAUGED.length + ' 项（其中账本 '
    + derivedBooks + ' 本）');

// (名字, 目标文件 | 'MOVE_LAST' | 'DELETE', 锚点, 替换为, 期望命中数, 期望退出码, 期望点名, 说明)
const CASES = [
    ['V0-原版对照', null, null, null, null, 0,
        '通过：契约声明在消费者之前',
        '不破坏：同 fixture 机制下必须 exit 0（否则后面所有「翻红」都不可归因）'],
    ['V1-契约被排到消费者之后', 'MOVE_LAST',
        '    "ledger-entity.js",\n', null, 1, 1,
        'R1 ' + CONTRACT + ' 排在消费者之后',
        '把契约搬到 extra_js 末尾（仍在册，只是顺序错了）⇒ 经典脚本按序注入，消费者先跑就取不到契约'],
    ['V2-契约未登记', 'manifest.json',
        '    "ledger-entity.js",\n', '', 1, 1,
        'R1 ' + CONTRACT + ' 未登记进 manifest.extra_js',
        '登记被删 ⇒ 不加载 ⇒ 六本账取库全部落空（与 V1 是**两个**实验：在册顺序错 vs 压根不在册）'],
    ['V3-重复回潮（读回就地重写）', 'parallel-ledger.js',
        '      revision: LE.revisionOf(item),', '      revision: finite(item.revision) || 1,', 1, 1,
        'R3 parallel-ledger.js 又出现了',
        '六份拷贝里的那一份回来了 ⇒ R3 必须点名（这正是本门禁存在的理由）'],
    ['V4-委派被摘（历史读回）', 'secret-ledger.js',
        '      history: LE.copyHistory(item, MAX_HISTORY, copyEvent)', '      history: [],', 1, 1,
        'R2 secret-ledger.js 的历史读回未走契约',
        '某本账不再走契约的历史读回 ⇒ R2 必须点名该账（判据是逐账的，不是「有一本委派就够了」）'],
    ['V5-index 消费面被摘', 'index.js',
        'return [\'账本实体\', LE.line(books)];', 'return [\'账本实体\', \'—\'];', 1, 1,
        'R4 index.js 没有真正读账本实体读数',
        '唯一读侧被摘掉 ⇒ `revision` 退回「写进去没人读」，R4 必须点名'],
    ['V6-契约模块消失', 'DELETE', CONTRACT, null, null, 2,
        '找不到契约模块',
        '真源被删/改名 ⇒ 结构漂移（探测对象不在，不得当「没问题」）'],
    ['V7-账本被改名', 'DELETE', 'seed-ledger.js', null, null, 2,
        '只找到 ' + (BOOKS.length - 1) + ' 本账（下限 ' + MIN_BOOKS + '）',
        '账本数掉到下限以下 ⇒ 扫描面不可信，必须 exit 2 而不是「少一本也算过」'],

    /* ---------- [v3.246.0] 本版新判据的观测点 ----------
     * 新增判据而没有观测点 = 判据可能恒绿而没人知道（本仓 v3.245.0 刚为这个形态建了常驻门禁：
     * 「每个门禁要么有配对负控制，要么在测试套件里被真源码破坏引用」）。这五组就是新判据的药。 */
    ['V8-文本一族回潮（本地实现）', 'parallel-ledger.js',
        'const text = LE.text;', 'const text = function (v, m) { return String(v == null ? \'\' : v).trim().slice(0, m); };', 1, 1,
        'R3c parallel-ledger.js 出现了本地 `const text =` 未走契约',
        '被收编的 `function text` 又回来了 ⇒ R3c 必须点名（**唯一手段**：R3 只盯 `.revision += 1` 与 `revision: finite(`，数一族有判据、文本一族到此才有）'],
    ['V9-就地 trim 绕开契约', 'secret-ledger.js',
        'const finiteFloor = LE.finiteFloor;', 'const finiteFloor = LE.finiteFloor;\n  const localTrim = (v) => v.trim();', 1, 1,
        'R3c secret-ledger.js 出现了就地 `.trim()`',
        '就地 trim 会把 ZWSP / NBSP / BOM 留在串里（契约的隐形空白口径被绕过）—— 这不是风格问题，是本版 TEXT_DOMAINS 钉住的同一件事'],
    ['V10-委派面被摘（floor 取值口）', 'seed-ledger.js',
        'const finiteFloor = LE.finiteFloor;', '', 1, 1,
        'R2b seed-ledger.js 的楼层取值口未走契约',
        '**这是本版新判据抓到的真缺陷的复原**：摘掉这一行，R3b（形态判据 `floor: finite(`）一个字都不会说，因为 floor 用的大多是按名点名的 `finiteFloor(`；只有 R2 会响'],
    ['V11-导出面被摘（TEXT_DOMAINS）', CONTRACT,
        'NUM_OR_NULL_DOMAINS, TEXT_DOMAINS,', 'NUM_OR_NULL_DOMAINS,', 1, 1,
        'R5b 契约导出 `TEXT_DOMAINS` 不是对象',
        '把导出项从 `api` 里摘掉而**注释与真源里仍写着这个名字** ⇒ 旧 R5（纯文本存在性）照样绿；R5b 按真导出键集判 typeof 才响'],
    ['V12-导出面被摘（names 函数）', CONTRACT,
        '    text, finite, finiteFloor, finiteNum, numOrNull, names,\n', '', 1, 1,
        'R5b 契约导出 `names` 不是函数',
        '摘的是**函数**导出：消费方会静默取到 undefined（不抛、不报），正是本仓治理过多轮的「有字段没人读」的邻居'],
    /* ---------- [v3.246.0] R9（名册与扫描面同源）的两向观测点 ----------
     * 为什么必须有：R9 是本版新判据。本仓 v3.245.0 刚为「判据没有观测点」立了常驻门禁
     *   （scan_fixture_sync E4：每个门禁要么有配对负控制，要么在套件里被真源码破坏引用）。
     *   两向各一组 —— 只测一向（新增未登记）会把另一半（名册里的账根本没在跑契约）留成静默。 */
    ['V13-账本没在跑契约（取库块被摘）', 'seed-ledger.js',
        'const LE = (typeof window !== \'undefined\' && window.LonShaLedgerEntity) ? window.LonShaLedgerEntity\n'
            + '    : ((typeof module !== \'undefined\' && module.exports) ? require(\'./ledger-entity.js\') : (root.LonShaLedgerEntity || null));',
        'const LE = require(\'./ledger-entity.js\');', 1, 1,
        'R9 名册里的 seed-ledger.js 当前并没有在跑账本实体契约',
        '取库块被换成「直接 require」这种**在经典脚本里不可能生效**的写法：文件仍在册、仍能解析，但已不在跑契约 ⇒ R9 第二向必须点名（这一向同时是「名册与扫描面不同源」的判据本身）'],
    /* 位置字段占齐：多文件组的 anchor / repl / expectHits 不使用，但**必须占位**
     *   （否则 marker/why 会被读成 expectHits/expectCode —— 本组首跑实测过）。 */
    ['V14-新增账本级消费者未登记', [['commitment-mirror-ledger.js', null, null, 0],
        ['manifest.json', '    "commitment-ledger.js",\n',
            '    "commitment-ledger.js",\n    "commitment-mirror-ledger.js",\n', 1]],
        null, null, null, 1,
        'R9 commitment-mirror-ledger.js 在跑账本实体契约（含取库块）却不在名册里',
        '**新账本忘登记**的等价形态：把一本账复制出副本并登记进 manifest，却不在 BOOKS 补行 —— 副本在跑契约、字面比门禁手抄的那份名册更全 ⇒ R9 第一向点名（V13 测反向）。R2 另报「不在委派表里」，是同一事实的委派面']
];

// 缺文件 = 结构漂移（exit 2）。
for (const p of [SCAN, ...GAUGED.map((f) => path.join(REPO, f))]) {
    if (!fs.existsSync(p)) {
        console.error('[ledger-negctl] 缺文件：' + p + ' ——结构漂移（负控制无法建立）');
        process.exit(2);
    }
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-contract-negctl-'));
const problems = [];
const rows = [];

for (const [name, target, anchor, repl, expectHits, expectCode, marker, why] of CASES) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of GAUGED) {
        const dest = path.join(dir, f);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(REPO, f), dest);
    }

    if (Array.isArray(target)) {
        /* [v3.246.0] 多文件改写（V14 需要：新建副本 + 改 manifest 登记）。
         *   形态是 `[[文件名, 锚点, 替换为, 期望命中数], ...]`；锚点为 null 表示「把源文件复制一份」。
         *   纪律与单文件组逐条相同：每个锚点都要**恰中期望次数**，否则整组作废。 */
        let ok = true;
        for (const [file, anchor2, repl2, hits2] of target) {
            const p = path.join(dir, file);
            if (anchor2 === null) {
                const srcFile = file.replace('-mirror-ledger.js', '-ledger.js');
                const from = path.join(dir, srcFile);
                if (!fs.existsSync(from)) {
                    problems.push(name + '：镜像源 ' + srcFile + ' 不在夹具里（构造失败，本组作废）');
                    rows.push([name, '-', '构造失败', why]);
                    ok = false;
                    break;
                }
                fs.copyFileSync(from, p);
                continue;
            }
            let src2 = fs.readFileSync(p, 'utf-8');
            const h2 = src2.split(anchor2).length - 1;
            if (h2 !== hits2) {
                problems.push(name + '：锚点在 ' + file + ' 命中 ' + h2 + ' 次（期望 ' + hits2 + '）—— 锚点已漂移，本组作废');
                rows.push([name, '-', '锚点漂移 ' + h2 + '/' + hits2, why]);
                ok = false;
                break;
            }
            fs.writeFileSync(p, src2.split(anchor2).join(repl2));
        }
        if (!ok) continue;
        const mf2 = path.join(dir, 'manifest.json');
        let parsed2 = null;
        try { parsed2 = JSON.parse(fs.readFileSync(mf2, 'utf-8')); } catch (e) { parsed2 = null; }
        if (!parsed2 || !Array.isArray(parsed2.extra_js) || parsed2.extra_js.indexOf('commitment-mirror-ledger.js') < 0) {
            problems.push(name + '：改后 manifest 不含镜像登记（构造失败，本组作废）');
            rows.push([name, '-', '构造失败', why]);
            continue;
        }
    } else if (target === 'DELETE') {
        fs.rmSync(path.join(dir, anchor));
    } else if (target === 'MOVE_LAST') {
        // 在**真源码**上做一次确定性重排：从 extra_js 摘掉该元素、追加到该数组末尾。
        // 不是手写 JSON 字面量 —— 改的是判据真会读的那份 manifest。
        // 注意：不能用 lastIndexOf(']') —— manifest 里 extra_js 之后还有别的数组，
        //       必须对 `"extra_js": [` 做**括号配对**才拿得到本数组的闭合位置（V1 首跑即栽在此）。
        const p = path.join(dir, 'manifest.json');
        let src = fs.readFileSync(p, 'utf-8');
        const hits = src.split(anchor).length - 1;
        if (hits !== expectHits) {
            problems.push(name + '：锚点在 manifest.json 命中 ' + hits + ' 次（期望 ' + expectHits + '）—— 锚点已漂移，本组作废');
            rows.push([name, '-', '锚点漂移 ' + hits + '/' + expectHits, why]);
            continue;
        }
        const arrayClose = (s) => {
            const key = '"extra_js": [';
            const ks = s.indexOf(key);
            if (ks < 0) return -1;
            let depth = 1;
            for (let i = ks + key.length; i < s.length; i++) {
                if (s[i] === '[') depth++;
                else if (s[i] === ']' && --depth === 0) return i;
            }
            return -1;
        };
        src = src.split(anchor).join('');   // 摘掉登记（仍在同一次真源码改写里）
        const close = arrayClose(src);
        if (close < 0) {
            problems.push(name + '：找不到 extra_js 的闭合位置（构造失败，本组作废）');
            rows.push([name, '-', '构造失败', why]);
            continue;
        }
        const nl = src.lastIndexOf('\n', close);
        // 追加到该数组末尾：既要给**前一个元素**补逗号，也要去掉搬过来的尾逗号
        // （它现在是末元素，带尾逗号就不是合法 JSON —— V1 三次构造失败分别栽在分隔换行、
        //   前元素逗号、尾随逗号三处；JSON.parse 守卫每次都把它拦成「构造失败」而不是
        //   「判据对破坏无反应」，这就是守卫存在的价值）。
        const last = anchor.replace(/,\s*\n$/, '\n');
        src = src.slice(0, nl) + ',\n' + last + src.slice(nl);
        fs.writeFileSync(p, src);
        let moved = null;
        try { moved = JSON.parse(src); } catch (e) { moved = null; }
        const ej = moved && Array.isArray(moved.extra_js) ? moved.extra_js : [];
        if (!moved || ej.length === 0 || ej[ej.length - 1] !== CONTRACT) {
            problems.push(name + '：重排后 manifest 不合法或契约不在末尾（构造失败，本组作废）');
            rows.push([name, '-', '构造失败', why]);
            continue;
        }
    } else if (target) {
        const p = path.join(dir, target);
        let src = fs.readFileSync(p, 'utf-8');
        const hits = src.split(anchor).length - 1;
        if (hits !== expectHits) {
            problems.push(name + '：锚点在 ' + target + ' 命中 ' + hits + ' 次（期望 ' + expectHits + '）—— 锚点已漂移，本组作废');
            rows.push([name, '-', '锚点漂移 ' + hits + '/' + expectHits, why]);
            continue;
        }
        src = src.split(anchor).join(repl);
        fs.writeFileSync(p, src);
        if (target.endsWith('.js')) {
            const chk = spawnSync('node', ['--check', p], { encoding: 'utf-8' });
            if (chk.status !== 0) {
                problems.push(name + '：破坏后 ' + target + ' 无法解析（归因不成立）' + (chk.stderr || '').slice(0, 200));
                rows.push([name, '-', '解析崩溃', why]);
                continue;
            }
        }
    }

    const env = { ...process.env, LONSHA_AUDIT_ROOT: dir };
    const r = spawnSync('node', [SCAN], { encoding: 'utf-8', env });
    const code = r.status;
    const out = (r.stdout || '') + (r.stderr || '');
    const codeOk = code === expectCode;
    const namedOk = marker == null ? true : out.includes(marker);
    const ok = codeOk && namedOk;
    if (!ok) {
        problems.push(name + '：期望 exit ' + expectCode + ' + 点名「' + marker + '」，实得 exit ' + code
            + (namedOk ? '' : '（点名缺失）')
            + '\n    ' + why
            + '\n    stdout: ' + (r.stdout || '').trim().slice(0, 400)
            + '\n    stderr: ' + (r.stderr || '').trim().slice(0, 400));
    }
    rows.push([name, String(code), (ok ? 'ok' : 'BAD(期望 ' + expectCode + (namedOk ? '' : '+点名') + ')'), why]);
}

console.log('=== 账本实体契约面 · 负控制 ===');
for (const [n, c, s, w] of rows) console.log('  ' + n.padEnd(30) + ' exit ' + c.padEnd(3) + s.padEnd(18) + w);
try { fs.rmSync(root, { recursive: true, force: true }); } catch (e) { /* 清理失败不影响结论 */ }

if (problems.length) {
    console.error('');
    for (const p of problems) console.error('[ledger-negctl] ' + p);
    console.error('');
    console.error('[ledger-negctl] 失败：负控制不成立（判据恒绿 / 破坏不可归因 / 锚点漂移）。');
    process.exit(1);
}
console.log('[ledger-negctl] 通过：真源码破坏逐组翻红且点名正确，结构漂移 exit 2，原版对照 exit 0。');
process.exit(0);