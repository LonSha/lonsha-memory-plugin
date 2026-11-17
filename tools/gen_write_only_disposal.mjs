#!/usr/bin/env node
/* ============================================================
 * tools/gen_write_only_disposal.mjs — 「写了不读」处置清单生成器 [L23-O6 · v3.474.0]
 * ------------------------------------------------------------
 * 【为什么需要生成器】
 *   L23-O6 把扫描器从「文件级」升级到「键级」并修掉它的一条**假绿**缺陷后，
 *   写无读字段从 4 个变成 73 个。73 条要「可处置」，就不能手写 73 句理由 ——
 *   手写理由必然退化成灰标签（「约定如此」「历史遗留」）。
 *   所以处置**由机器算、机器写**，每条只写三类**可复验**的事实：
 *     dead-write      产品侧除写入点外 0 处提及，测试里也 0 处 ⇒ 真死写；
 *     test-only-read  产品侧 0 处，只有测试读 ⇒ 产品不读（不是「有人读」）；
 *     mention-*       产品侧有 N 处非写入提及，逐条记录站点与形态（别的接收者名 / 字符串键 / 同名局部）。
 *   判据（tests/l23_o6_write_only_key_level.test.mjs C1/C2）会**重新读盘复验**每条事实，
 *   所以台账不是「写过的理由」，而是「当前盘面能验证的断言」。
 *
 * 【纪律】不许为了通过而制造读取点（do not add a consumer solely to satisfy the audit）；
 *   本生成器**只读不写产品代码**，只写 tests/audit/write_only_ledger.json。
 *
 * 用法：node tools/gen_write_only_disposal.mjs [--check]
 *   --check  不写盘，只比对台账与现场是否一致（不一致 exit 1 并打印差异）
 * ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanRepoSelfProof } from './scan_write_only_fields.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LEDGER = path.join(ROOT, 'tests', 'audit', 'write_only_ledger.json');

function* walk(dir, exts) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
        const p = path.join(dir, e.name);
        if (e.isDirectory()) yield* walk(p, exts);
        else if (exts.some((x) => e.name.endsWith(x))) yield p;
    }
}

/** 只读一次全盘，建 (rel → lines) 索引。 */
function loadTree() {
    const product = [];
    const tests = [];
    for (const f of walk(ROOT, ['.js'])) {
        const rel = path.relative(ROOT, f).split(path.sep).join('/');
        if (rel.startsWith('tools/')) continue;
        product.push({ rel, lines: fs.readFileSync(f, 'utf8').split('\n') });
    }
    for (const f of walk(path.join(ROOT, 'tests'), ['.mjs', '.js'])) {
        tests.push({ rel: path.relative(ROOT, f).split(path.sep).join('/'), lines: fs.readFileSync(f, 'utf8').split('\n') });
    }
    return { product, tests };
}

const wordRe = (f) => new RegExp('\\b' + f.replace(/\$/g, '\\$') + '\\b');

/** 该行属于哪种「非写入提及」形态 —— 机器判定，判据会复验。 */
function mentionForm(line, field) {
    const f = field.replace(/\$/g, '\\$');
    if (new RegExp('\\bthis\\s*\\.\\s*' + f + '\\b').test(line)) return 'this-receiver';
    if (new RegExp('\\b(?:engine|state|raw|snap|out|st|it|holder|self|plugin|ctx)\\s*\\.\\s*' + f + '\\b').test(line)) return 'other-receiver';
    if (new RegExp('[\'"]' + f + '[\'"]').test(line)) return 'string-key';
    return 'same-name-local';
}

export function buildDisposal(root = ROOT) {
    const { findings, scope } = scanRepoSelfProof(root);
    const { product, tests } = loadTree();
    const entries = [];
    for (const f of findings) {
        const re = wordRe(f.field);
        /* 写入行集合：rel → Set(line) */
        const writeLines = new Map();
        for (const w of f.writes) {
            const i = w.lastIndexOf(':');
            const rel = w.slice(0, i);
            const line = Number(w.slice(i + 1));
            if (!writeLines.has(rel)) writeLines.set(rel, new Set());
            writeLines.get(rel).add(line);
        }
        const productMentions = [];
        for (const { rel, lines } of product) {
            for (let i = 0; i < lines.length; i++) {
                if (!re.test(lines[i])) continue;
                if ((writeLines.get(rel) || new Set()).has(i + 1)) continue;
                productMentions.push({ where: rel + ':' + (i + 1), form: mentionForm(lines[i], f.field) });
            }
        }
        const testMentions = [];
        for (const { rel, lines } of tests) {
            for (let i = 0; i < lines.length; i++) {
                if (re.test(lines[i])) testMentions.push(rel + ':' + (i + 1));
            }
        }
        const cls = productMentions.length > 0 ? 'mention-' + productMentions[0].form
            : testMentions.length > 0 ? 'test-only-read'
                : 'dead-write';
        const readDesc = productMentions.length > 0
            ? productMentions.slice(0, 3).map((m) => m.where + '（' + m.form + '）').join(' / ')
            : (testMentions.length > 0
                ? '产品侧无读取点；仅测试提及：' + testMentions.slice(0, 3).join(' / ')
                : '全仓无读取点（产品 0 处、测试 0 处）');
        const reason = {
            'dead-write': '真死写：产品侧除 ' + f.writes.length + ' 处写入点外 0 处提及，测试里也 0 处 ⇒ 写完从来没人读。'
                + '不制造假读取点，也不用笼统措辞盖住它；处置口径见 class（欠账，留 R 线清理或直接删写入）。',
            'test-only-read': '只被测试读：产品侧 0 处提及，只有 ' + testMentions.length + ' 处测试引用 ⇒ 产品路径上不读它，'
                + '「测试绿」不等于「产品在用」。处置口径见 class。',
        }[cls] || ('产品侧有 ' + productMentions.length + ' 处非写入提及（' + productMentions[0].form + '），'
            + '扫描器的 engine./state. 前缀视野看不见它们 ⇒ 不是死写，但读点不在统一前缀上；'
            + '逐条站点已记录，判据会复验该站点仍存在且不是写入点。');
        entries.push({
            field: f.field,
            class: cls,
            write: f.writes.length + ' 处：' + f.writes.slice(0, 3).join(', '),
            read: readDesc,
            reason,
            evidence: {
                write_sites: f.writes.length,
                product_mentions: productMentions.length,
                product_mention_sites: productMentions.slice(0, 3).map((m) => m.where),
                test_mentions: testMentions.length,
            },
        });
    }
    entries.sort((a, b) => (a.field < b.field ? -1 : a.field > b.field ? 1 : 0));
    const classes = {};
    for (const e of entries) classes[e.class] = (classes[e.class] || 0) + 1;
    return {
        scope,
        classes,
        ledger: {
            file: 'tests/audit/write_only_ledger.json',
            generator: 'tools/gen_write_only_disposal.mjs（由它写，手改无效：判据 --check 会红）',
            note: 'L23-O6「写了不读」处置清单。口径 = 键级（engine./state. 前缀，全仓比对读取点，含字符串键与解构读）。'
                + '每条只写可复验事实：write 站点数 / 产品侧非写入提及数 / 测试提及数；'
                + '判据 l23_o6 的 C1/C2 会重新读盘复验，改过的理由会当场烂掉。'
                + '无理由登记无效；已修掉的字段必须删条（豁免也双向）。',
            scope_snapshot: scope,
            class_counts: classes,
            entries,
        },
    };
}

function main() {
    const check = process.argv.includes('--check');
    const built = buildDisposal();
    const json = JSON.stringify(built.ledger, null, 2) + '\n';
    if (check) {
        const cur = fs.existsSync(LEDGER) ? fs.readFileSync(LEDGER, 'utf8') : '';
        if (cur !== json) {
            console.error('[write-only-disposal] 台账与现场不一致（手改过？或盘面变了）—— 重跑生成器');
            process.exit(1);
        }
        console.log('[write-only-disposal] 台账与现场一致：' + built.ledger.entries.length + ' 条 ' + JSON.stringify(built.classes));
        return;
    }
    fs.writeFileSync(LEDGER, json, 'utf8');
    console.log('[write-only-disposal] 已写 ' + built.ledger.entries.length + ' 条：' + JSON.stringify(built.classes));
    console.log('[write-only-disposal] 扫描面：文件 ' + built.scope.filesScanned + ' / 写入点 ' + built.scope.writeSites
        + ' / 字段 ' + built.scope.distinctFields + ' / 读取点 ' + built.scope.readSites);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();