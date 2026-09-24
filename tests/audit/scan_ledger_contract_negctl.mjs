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
//   · 每次破坏发生在**独立 fixture 目录**里，只搬判据真正读的文件（9 个）；
//     LONSHA_AUDIT_ROOT 指过去 ⇒ 源仓库零污染，且判据读的确实是「被破坏的那份真源码」。
//   · 锚点必须**恰中期望次数**：命中数不符 ⇒ 该组作废并报错（防锚点漂移后静默跳过，
//     把「没破坏成功」误读成「判据对破坏无反应」）。
//   · 破坏后先 `node --check`（仅 .js）：非零退出必须来自判据，而不是解析崩溃。
//   · 只断言「退出码对」**不够**：exit 1 也可能来自另一条判据 —— 那样归因是错的。
//     故每组另断言**缺陷点名**（marker 必须出现在输出里），即「红得对，不是红得巧」。
//
// 判据：V0 原版对照必须 exit 0；V1–V5 逐组命中期望退出码且带期望点名；V6/V7 结构漂移须 exit 2。
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
const BOOKS = ['seed-ledger.js', 'secret-ledger.js', 'parallel-ledger.js',
    'commitment-ledger.js', 'fact-version.js', 'event-completeness.js'];
const GAUGED = ['manifest.json', 'index.js', CONTRACT, ...BOOKS];

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
        '只找到 5 本账',
        '账本数掉到下限以下 ⇒ 扫描面不可信，必须 exit 2 而不是「少一本也算过」']
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
    for (const f of GAUGED) fs.copyFileSync(path.join(REPO, f), path.join(dir, f));

    if (target === 'DELETE') {
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