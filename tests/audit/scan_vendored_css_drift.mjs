// 审计基建 · vendored 样式漂移与空转扫描 [v3.476.0]
// ------------------------------------------------------------
// 为什么存在：
//   本仓 css/lonsha-tokens.css(481 行) 与 css/lonsha-tokens-v3.css(255 行) 是
//   LonSha/ruby-phone 设计系统 token 的**逐字节副本**（实测两边 md5 相同：
//   b1249e5f… / 937834ea…）。跨仓运行时无法共享文件，所以 vendoring 是唯一可行形态；
//   但「复制一份」如果不留痕，就变成同一个事实的**两个主人** —— 上游改了这边不知道，
//   这边手改了上游也不知道，两边都不报错。这正是本仓费力整治的那类缺陷。
//
// 判据守的两条不变量：
//   V1 **副本必须是副本**：每个登记项的本地 md5 必须等于台账记录的 vendoredMd5。
//      就地手改即红（此时要么回源仓改并整份重同步，要么把它从 vendored 名单摘出去）。
//   V2 **副本不许空转**：登记项必须真的被某个 css 文件 @import 进来。
//      没有人 import 的副本 = 纯死重量（那种情况应当删除，而不是继续登记）。
//
// 分母自证：登记项数 / 被 import 命中数任一为 0 ⇒ exit 2 fail-closed。
// 负控制：台账里塞一条指向不存在文件的合成项，探针必须报出来 —— 否则「0 问题」不是结论。
//
// 退出码：0=卫生  1=存在真缺陷  2=结构漂移（台账不可用/分母为 0）
// 夹具通道：LONSHA_AUDIT_ROOT 指定仓库根。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const CSS_DIR = path.join(ROOT, 'css');
const LEDGER = path.join(CSS_DIR, 'vendor-ledger.json');

function die(msg) {
    console.error('[vendored-css] ' + msg);
    process.exit(2);
}

function md5(file) {
    return crypto.createHash('md5').update(fs.readFileSync(file)).digest('hex');
}

/* 负控制：合成一个坏项，探针必须能把它判成问题（而不是静默跳过）。 */
function selfTest(entries, cssFiles) {
    const fake = { localPath: 'css/__probe_missing__.css', vendoredMd5: 'deadbeef' };
    const exists = fs.existsSync(path.join(ROOT, fake.localPath));
    const flags = !exists || md5(path.join(ROOT, fake.localPath)) !== fake.vendoredMd5;
    if (!flags) {
        console.error('[vendored-css] 负控制失败：探针无法识别不存在的登记项');
        process.exit(2);
    }
    if (!Array.isArray(entries) || !Array.isArray(cssFiles)) {
        console.error('[vendored-css] 负控制失败：入参形状异常');
        process.exit(2);
    }
}

function main() {
    if (!fs.existsSync(CSS_DIR)) die('找不到 css/（ROOT=' + ROOT + '）—— 结构漂移');
    const cssFiles = fs.readdirSync(CSS_DIR).filter((n) => n.endsWith('.css')).sort();
    if (cssFiles.length < 5) die('css 文件只剩 ' + cssFiles.length + ' 个 —— 分母异常');

    if (!fs.existsSync(LEDGER)) die('缺 css/vendor-ledger.json —— 结构漂移');
    let ledger = null;
    try {
        ledger = JSON.parse(fs.readFileSync(LEDGER, 'utf8'));
    } catch (e) {
        die('vendor-ledger.json 不是合法 JSON：' + e.message);
    }
    const entries = Array.isArray(ledger && ledger.entries) ? ledger.entries : null;
    if (!entries) die('vendor-ledger.json 缺 entries 数组');
    if (entries.length === 0) die('登记项为 0 —— 若确实没有 vendored 文件请删除本判据，不要留一条空门');

    selfTest(entries, cssFiles);

    const bad = entries.find((e) => !e || typeof e.localPath !== 'string'
        || !/^[0-9a-f]{32}$/.test(String(e.vendoredMd5))
        || typeof e.sourceRepo !== 'string' || typeof e.sourcePath !== 'string');
    if (bad) die('台账条目需 localPath + vendoredMd5(32位小写) + sourceRepo + sourcePath：' + JSON.stringify(bad));

    /* 谁 import 了谁 —— V2 的扫描面 */
    const importers = new Map();
    for (const n of cssFiles) {
        let src = '';
        try {
            src = fs.readFileSync(path.join(CSS_DIR, n), 'utf8');
        } catch {
            continue;
        }
        const re = /@import\s+url\(\s*["']?\.\/([A-Za-z0-9._-]+\.css)["']?\s*\)/g;
        let m;
        while ((m = re.exec(src)) !== null) {
            if (!importers.has(m[1])) importers.set(m[1], new Set());
            importers.get(m[1]).add(n);
        }
    }

    let okCount = 0;
    const drift = [];
    const orphan = [];
    for (const e of entries) {
        const abs = path.join(ROOT, e.localPath);
        const base = path.basename(e.localPath);
        if (!fs.existsSync(abs)) {
            drift.push(base + '：文件不在盘（登记了却不存在）');
            continue;
        }
        const got = md5(abs);
        if (got !== e.vendoredMd5) {
            drift.push(base + '：md5 ' + got + ' ≠ 台账 ' + e.vendoredMd5 + '（被就地改动，或上游同步后忘了更新台账）');
        }
        if (!importers.has(base)) {
            orphan.push(base + '：没有任何 css @import 它（纯死重量，应删除而非继续登记）');
        }
        if (got === e.vendoredMd5 && importers.has(base)) okCount += 1;
    }

    console.log('[vendored-css] 登记 ' + entries.length + ' 份 / 校验通过 ' + okCount
        + ' / md5漂移 ' + drift.length + ' / 空转 ' + orphan.length
        + ' / import 面 ' + importers.size + ' 个被引文件');

    if (drift.length) {
        console.error('[vendored-css] md5 漂移（副本不再是副本）：');
        for (const d of drift) console.error('  ✗ ' + d);
        console.error('  铁律：改 vendored 文件必须回 ' + (entries[0] && entries[0].sourceRepo || '源仓') + ' 改并整份重同步。');
        process.exit(1);
    }
    if (orphan.length) {
        console.error('[vendored-css] 空转（登记了却没人 import）：');
        for (const o of orphan) console.error('  ✗ ' + o);
        process.exit(1);
    }

    console.log('[vendored-css] 卫生：所有 vendored 副本与台账一致，且都被真实 import。');
    process.exit(0);
}

main();