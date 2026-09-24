/* ============================================================
 * v3.159.0 - audit scripts must fail CLOSED, and engine fallbacks
 *              must agree with the declared defaults
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync, writeFileSync, cpSync, mkdtempSync, rmSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const ROOT = REPO_ROOT;
const AUDIT_DIR = path.join(ROOT, 'tests/audit');
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
// [v3.162] 交出硬编码清单：v3.161 之前这里是 5 个文件名字面量；v3.162 新增第 6 个
//   审计脚本（scan_ui_binding）后，本文件的负控制会静默地把新脚本排除在外
//   ——「[2] 每个审计脚本都能阻断」变成了「这 5 个能阻断」。改为从目录动态
//   发现，判据与 tests/run.mjs 的 auditScripts() 保持一致。
const auditScripts = readdirSync(AUDIT_DIR).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
// [v3.192.0] 与 tests/run.mjs 的 auditScripts() 逐字对齐（含下划线前缀排除）。
//   此前声明「保持一致」但实际分叉：run.mjs 排除了 `_` 前缀辅助文件，本夹具没有。
//   分叉的代价是同一族缺陷——辅助文件被当审计脚本执行，纯定义零调用即判绿。
//   凡是写「与 X 保持一致」的地方，都是将来会悄悄分叉的地方；这里改为逐字同形。
const readAudit = (f) => readFileSync(path.join(AUDIT_DIR, f), 'utf-8');

/** run one audit script inside a scratch tree shaped by `mutate` */
// [v3.205.0] T7：44 次**串行** spawn 在 7 路并发门禁下把本文件从 50s 抬到 339s 撞
//   单文件超时（120s）。实测成本分解：43 个 audit 脚本串行 spawn = 49.3s（每次 node
//   冷启动 ~1.15s），镜像 tests/ 只占 4.8s —— 即耗时几乎全是「进程启动」而非判据。
//   改法：受控并发池（默认 4），禁止用「抬高超时」掩盖（阈值不是病根）。
//   并发安全性已核：所有 audit 脚本只**读**仓库，写入一律落各自 mkdtempSync 私有目录
//   （16 个负控脚本「复制后改副本」，目标目录互不相同）；本 scratch 树在单个用例内
//   独占，用例之间无共享可变状态。
const AUDIT_CONCURRENCY = (() => {
    const n = parseInt(process.env.V3159_AUDIT_JOBS || '', 10);
    return Number.isFinite(n) && n > 0 ? n : 4;
})();
const AUDIT_TIMEOUT = (() => {
    const n = parseInt(process.env.V3159_AUDIT_TIMEOUT || '', 10);
    return Number.isFinite(n) && n > 0 ? n : 120000;
})();

/* [v3.206.0] 与 tests/run.mjs 同一条真根因：**孙进程泄漏**。
 *   audit 扫描器自己还会派 `node --check` 一类的孙进程；旧实现在超时时只
 *   `child.kill('SIGKILL')` —— 杀的是直接子进程，**孙进程被孤儿化**（PPID→1）
 *   继续吃 CPU。v3.205.0 已在 tests/run.mjs 修好这条（detached + 进程组收割），
 *   但测试侧这份 spawnOne 是同一形态的第二处，当时漏掉。
 *   实测（本仓沙箱，人为制造超时）：旧形态留下 1 个存活孙进程（PPID=1）；
 *   改成 detached + 按进程组杀之后为 0 个。
 *   修法与 run.mjs 逐字同形：超时 / 正常收尾 / error 三条路径都收割进程组。 */
function killGroupOne(child) {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* 组可能已不存在 */ }
    try { child.kill('SIGKILL'); } catch { /* 直接子进程兜底 */ }
}
function spawnOne(cwd, f) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [path.join('tests', 'audit', f)], {
            cwd, stdio: ['ignore', 'pipe', 'pipe'],
            detached: true, // 独立进程组：孙进程随组一起收，避免孤儿残留
        });
        let out = '', err = '', killed = false;
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        const timer = setTimeout(() => { killed = true; killGroupOne(child); }, AUDIT_TIMEOUT);
        child.on('close', (code) => {
            clearTimeout(timer);
            killGroupOne(child); // 父先于孙结束的场合也要收
            resolve({ status: killed ? null : (code ?? 1), killed, out: out + err });
        });
        child.on('error', (e) => {
            clearTimeout(timer);
            killGroupOne(child);
            resolve({ status: 1, killed: false, out: String(e) });
        });
    });
}

/** 受控并发：结果按传入顺序返回，与串行语义逐位等价 */
async function runAuditBatch(cwd, files, jobs = AUDIT_CONCURRENCY) {
    const results = new Array(files.length);
    let idx = 0;
    const lanes = Array.from({ length: Math.max(1, Math.min(jobs, files.length)) }, async () => {
        while (idx < files.length) {
            const i = idx++;
            results[i] = await spawnOne(cwd, files[i]);
        }
    });
    await Promise.all(lanes);
    const byFile = {};
    files.forEach((f, i) => { byFile[f] = results[i]; });
    return byFile;
}

async function runInScratch(mutate) {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'v3159-'));
    try {
        // [v3.163] 此前只物化 index.js / settings-ui.js 两个文件。v3.163 新增的
        //   scan_module_wiring 要读 manifest.json 并逐个真加载注册脚本，在这种
        //   「只有两个文件」的树上会以 exit 2 阻断——负控制失败的原因与被测缺陷无关。
        //   改为按 manifest 把**全部注册脚本**物化进 scratch，判据变成「每个审计脚本
        //   都能在健康树上通过、且在退化输入上阻断」，对新增脚本自动成立，版本无关。
        const mft = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
        writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(mft, null, 2) + '\n');
        const scripts = [mft.js, ...(mft.extra_js || [])].filter(Boolean);
        for (const f of scripts) {
            writeFileSync(path.join(dir, f), readFileSync(path.join(ROOT, f), 'utf-8'));
        }
        for (const f of [...(mft.extra_css || [])]) {
            const p = path.join(ROOT, f);
            if (existsSync(p)) writeFileSync(path.join(dir, f), readFileSync(p, 'utf-8'));
        }
        // 入口与面板由调用方按需覆盖（退化用例会写入 '// gone'）
        writeFileSync(path.join(dir, 'index.js'), src);
        writeFileSync(path.join(dir, 'settings-ui.js'), sui);
        // [v3.191] 整份镜像 tests/：库用例（scan_audit_lib_consolidation）核对唯一真源
        //   tests/_audit_lib.mjs 与 tests/run.mjs 是否在场——缺了就 fail-closed 判结构漂移。
        //   健康树夹具必须真的像健康树；判据不因此放宽。
        cpSync(path.join(ROOT, 'tests'), path.join(dir, 'tests'), { recursive: true });
        const which = mutate(dir);
        // [v3.205.0] 受控并发（见 runAuditBatch 注释）。语义与串行逐位等价：结果仍按文件名索引。
        return await runAuditBatch(dir, (which || auditScripts));
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

// ================= 1. the shipped defect =================
test('[1] engine fallback for archivePreserveRecent matches the declared default', () => {
    const dflt = /archivePreserveRecent:\s*([0-9]+)/.exec(src);
    assert.ok(dflt, 'the key has a declared default in the config block');
    const declared = Number(dflt[1]);
    assert.strictEqual(declared, 6, 'declared default is the documented one');
    // the only read site must fall back to the same number
    const reads = [...src.matchAll(/numOr\([^)]*archivePreserveRecent\s*,\s*([0-9]+)\s*\)/g)].map((m) => Number(m[1]));
    assert.strictEqual(reads.length, 1, 'exactly one read site');
    assert.strictEqual(reads[0], declared, 'fallback agrees with the default (was 0)');
});
test('[1b] no other config key silently disagrees with its declared default', () => {
    // extract the default config block
    const at = src.indexOf('this.config = {');
    assert.ok(at > 0, 'config block found');
    let i = src.indexOf('{', at), depth = 0, j = i;
    for (; j < src.length; j++) {
        if (src[j] === '{') depth++;
        else if (src[j] === '}') { depth--; if (depth === 0) break; }
    }
    const blk = src.slice(i, j + 1);
    const lo = src.slice(0, i).split('\n').length;
    const hi = src.slice(0, j).split('\n').length;
    const lines = src.split('\n');
    const NUMOR = /numOr\(\s*[A-Za-z0-9_$.\[\]\(\)\?\s'":!=<>-]*?\.([A-Za-z0-9_$]+)\s*,\s*(-?[0-9.]+)\s*\)/;
    const OPFB = /\.([A-Za-z0-9_$]+)\s*(?:\|\||\?\?)\s*(-?[0-9.]+)\b/;
    const bad = [];
    for (let n = 1; n <= lines.length; n++) {
        if (n >= lo && n <= hi) continue;
        const line = lines[n - 1];
        for (const m of [NUMOR.exec(line), OPFB.exec(line)]) {
            if (!m) continue;
            const key = m[1], fb = Number(m[2]);
            if (!key || !Number.isFinite(fb)) continue;
            const dm = new RegExp('\\b' + key + '\\s*:\\s*(-?[0-9.]+)').exec(blk);
            if (!dm) continue;
            if (Number(dm[1]) !== fb) bad.push(key + ': default ' + dm[1] + ' vs fallback ' + fb + ' @L' + n);
        }
    }
    assert.deepStrictEqual(bad, [], 'every numeric fallback agrees with its declared default');
});
// ================= 2. audit scripts must fail closed =================
test('[2] every audit script can block (exit 2), and defect-scanners can fail hard (exit 1)', () => {
    // 不要求显式写 process.exit(0)：隐式到底同样是通过，要验的是「失败时能不能阻断」。
    //   exit 2（结构漂移 / 探测器失效）是每个脚本都必须具备的底线。
    for (const f of auditScripts) {
        const t = readAudit(f);
        assert.ok(/process\.exit\s*\(\s*[12]\s*\)/.test(t), f + ' can block (nonzero exit)');
        assert.ok(/process\.exit\s*\(\s*2\s*\)/.test(t), f + ' blocks on structural drift (exit 2)');
    }
    // 已知会判定「真缺陷」的四个脚本必须有 exit 1。
    //   scan_resilience 只报参考指标（静默 catch 不一律是缺陷），故只需 exit 2。
    for (const f of ['scan_config_liveness.mjs', 'scan_slider_coherence.mjs', 'scan_syntax.mjs', 'scan_wiring.mjs']) {
        assert.ok(/process\.exit\s*\(\s*1\s*\)/.test(readAudit(f)), f + ' fails hard on a real defect (exit 1)');
    }
});
test('[2b] the two formerly exit-less scanners now block on a degenerate tree', async () => {
    const r = await runInScratch((dir) => {
        writeFileSync(path.join(dir, 'index.js'), '// gone\n');
        writeFileSync(path.join(dir, 'settings-ui.js'), '// gone\n');
        return ['scan_resilience.mjs', 'scan_wiring.mjs', 'scan_config_liveness.mjs'];
    });
    for (const [f, r2] of Object.entries(r)) {
        assert.strictEqual(r2.status, 2, f + ' must exit 2 on an empty tree, got ' + r2.status + ' / ' + r2.out.slice(0, 160));
    }
});
test('[2c] a truncated UI file is caught even though its size is over the floor', async () => {
    const r = await runInScratch((dir) => {
        writeFileSync(path.join(dir, 'settings-ui.js'), sui.split('\n').slice(0, 200).join('\n'));
        return ['scan_wiring.mjs'];
    });
    assert.strictEqual(r['scan_wiring.mjs'].status, 2, 'wiring must notice the vanished controls');
});
test('[2d] a healthy tree still passes every audit script', async () => {
    const r = await runInScratch(() => auditScripts);
    for (const [f, r2] of Object.entries(r)) {
        assert.strictEqual(r2.status, 0, f + ' must pass on a healthy tree, got ' + r2.status + ' / ' + r2.out.slice(-200));
    }
});
test('[2e] the liveness probe refuses to certify "0 dead configs" from a collapsed key set', async () => {
    const t = readAudit('scan_config_liveness.mjs');
    assert.ok(/MIN_UI_KEYS/.test(t), 'the floor exists');
    assert.ok(/uiKeys\.size\s*<\s*MIN_UI_KEYS/.test(t), 'the floor is actually enforced');
    assert.ok(/process\.exit\(2\)[\s\S]{0,400}=== D1/.test(t), 'the guard sits before the report');

    // 行为化：一份「越过字节下限、却只携带寥寥几个键」的 UI 必须被判为「不具证明力」（exit 2），
    //   而不是被静默认证成「死配置 0」。这是「审计失效 = 报告一切正常」的直接反例。
    const thinUi = '<!-- thin ui: over the byte floor, but only three distinct keys -->\n'
        + Array.from({ length: 600 }, (_, i) => '<div class="row" data-cfg="orphanKey' + (i % 3) + '"></div>').join('\n');
    assert.ok(thinUi.length >= 20000, 'the fixture does clear the byte floor');
    const r = await runInScratch((dir) => {
        writeFileSync(path.join(dir, 'settings-ui.js'), thinUi);
        return ['scan_config_liveness.mjs'];
    });
    assert.strictEqual(r['scan_config_liveness.mjs'].status, 2,
        'a collapsed key set must exit 2 rather than certify zero dead configs, got '
        + r['scan_config_liveness.mjs'].status + ' / ' + r['scan_config_liveness.mjs'].out.slice(-200));
});
// ================= 3. release hygiene =================
test('[3] version is synced across the four declaration sites', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    assert.ok(vnum(v) >= vnum('3.159.0'), 'index.js version ' + v + ' >= 3.159.0');
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const heads = changelog.split('\n').filter((l) => l.startsWith('## v'));
    const top = heads.map((l) => l.slice(4).trim()).sort((a, b) => vnum(b) - vnum(a))[0];
    assert.strictEqual(top, v, 'the highest changelog section is the released version');
});
test('[3b] old anchors were taken over, not dropped', () => {
    const t117 = readFileSync(path.join(ROOT, 'tests/v3117_diagnostics.test.mjs'), 'utf-8');
    const t130 = readFileSync(path.join(ROOT, 'tests/v3130_control_plane.test.mjs'), 'utf-8');
    const t147 = readFileSync(path.join(ROOT, 'tests/v3147_cooldown_and_dual_hash.test.mjs'), 'utf-8');
    // [v3.203.0] 交棒链拆除：历史文件锁的是**自己的出生版本**，不再随抬版上抬。
    //   此处只守版本无关的不变量——「仍在锚版本串、且不承诺高于现版」。
    const anchorOf = (t) => {
        const hits = [...t.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map((m) => m[1]);
        return hits;
    };
    const cur = vnum(/const VERSION = '([0-9.]+)'/.exec(src)[1]);
    for (const [tag, t] of [['v3117', t117], ['v3130', t130], ['v3147', t147]]) {
        const hits = anchorOf(t);
        assert.ok(hits.length > 0, tag + ' still anchors a version string');
        assert.ok(hits.every((h) => vnum(h) <= cur), tag + ' anchors must not promise a future version');
    }
    assert.ok(t147.includes("const VERSION = '"), 'v3147 still pins the const form');
});
test('[3c] v3158 gave up its own-release exclusivity', () => {
    const t = readFileSync(path.join(ROOT, 'tests/v3158_slider_coherence_and_diary_zero.test.mjs'), 'utf-8');
    assert.ok(!t.includes("startsWith('## v3.158.0')"), 'no longer asserts the changelog head');
    assert.ok(!/changelog\.trimStart\(\).startsWith\('## v3\.158\.0'\)/.test(t), 'nor any equivalent head assertion');
    assert.ok(/vnum\('3\.158\.0'\)/.test(t), 'keeps its own lower bound');
});
test('[3d] the changelog section documents the shipped fix', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const head = changelog.slice(changelog.indexOf('## v3.159.0'), changelog.indexOf('## v3.158.0'));
    assert.ok(head.includes('archivePreserveRecent'), 'the mismatched fallback is named');
    assert.ok(head.includes('fail') || head.includes('closed'), 'the fail-closed theme is documented');
    assert.ok(/scan_(wiring|resilience|config_liveness)/.test(head), 'the hardened probes are named');
});
test('[3e] no unreleased placeholder section is pre-declared', () => {
    // [v3.160] 已交新版接管：不写死「下一版号」，改为版本无关不变量——
    //   CHANGELOG 里不得存在任何**高于**已发布版本的节（那才是「预置占位节」）。
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    const ahead = changelog.split('\n').filter((l) => l.startsWith('## v'))
        .map((l) => l.slice(4).trim()).filter((h) => vnum(h) > vnum(v));
    assert.deepStrictEqual(ahead, [], 'no section for a version above the released one');
});
