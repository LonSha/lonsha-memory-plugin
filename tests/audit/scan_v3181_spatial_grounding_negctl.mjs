// 审计基建 N 的**负控制**（v3.181）：证明 scan_v3181_spatial_grounding.mjs 不是恒绿探测器。
// ------------------------------------------------------------
// 为什么单独成档：
//   一条判据「跑绿了」只说明它没报警，不说明它**会**报警。判据恒绿有三种伪装：
//     ① 对原文件断言 —— 破坏没发生也绿；
//     ② 把破坏写死成模拟常量 —— 真判据根本没被调用；
//     ③ 破坏把判据自己删了 —— 自我指涉。
//   本档统一用「真源码破坏 → 破坏副本 → 在副本上重跑同一套真判据」来排除这三种。
//
// 【本轮特别加上的一档：判据纯度两向自证（W9）】
//   本版新增了 `stripComments`（形态判据一律去注释/去字面量后再下结论），
//   而「去了注释」这件事本身也要被证伪，否则可能只是把判据改成了永真：
//     · W9 真代码**正确**、只在注释里写回旧写法（`_cutoff` / `? true : false`）
//       ⇒ 判据必须仍然 exit 0（**不得误报**：注释不是代码）；
//     · W1/W2 真代码**坏**、注释干净 ⇒ 判据必须 exit 1（**必须真报**）。
//   两向同时成立，`stripComments` 才算既没放过真破坏、也没被注释骗过去。
//
// 纪律：
//   · 每次破坏发生在**独立 fixture 目录**里，只搬判据真正读的 3 个文件；
//     LONSHA_AUDIT_ROOT 指过去 ⇒ 源仓库零污染，且判据读的确实是「被破坏的那份真源码」。
//   · 锚点必须**恰中期望次数**：命中数不符 ⇒ 该组作废并报错。
//   · 破坏后先 `node --check`：非零退出必须来自判据，而不是解析崩溃（否则归因不成立）。
//
// 退出码：0=负控制成立  1=负控制失效（判据恒绿/破坏不可归因/锚点漂移）  2=结构漂移
import fs from 'fs';
import os from 'os';
import path from 'node:path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCAN = path.join(HERE, 'scan_v3181_spatial_grounding.mjs');
const SB = 'scene-book.js';
const IDX = 'index.js';
const PUB = 'public-interface.js';
// [v3.190] 位移收口后，场景面的单出口重建在登记表模块里：
//   N1 会读 ledger-replay.js，故 fixture 必须连它一起搬，
//   否则「原版对照」会因缺文件而误报（判据本身没问题，是夹具没跟上判据）。
const REP = 'ledger-replay.js';
const GAUGED = [SB, IDX, PUB, REP];
// (名字, 目标文件 | 'DELETE', 锚点, 替换为, 期望命中数, 期望退出码, 说明)
const CASES = [
    ['W0-原版对照', null, null, null, null, 0,
        '不破坏：同 fixture 机制下 N 必须 exit 0（否则后面所有「翻红」都不可归因）'],
    ['W1-哑雷回归（三目错位）', SB,
        "        if (Number.isFinite(Number(cutoff))) this.track = this.track.filter(t => t.floor < Number(cutoff));",
        "        this.track = this.track.filter(t => t.floor < (cutoff || 0) || cutoff === undefined ? true : false);",
        1, 1,
        '显式入参退回「三目优先级错位」的布尔折叠——正是本版修掉的哑雷，N4 ① 必须翻红'],
    ['W2-隐式 _cutoff 状态回归', SB,
        "        if (Number.isFinite(Number(cutoff))) this.track = this.track.filter(t => t.floor < Number(cutoff));",
        "        if (this._cutoff === undefined) this._cutoff = cutoff;",
        1, 1,
        '轨迹切片重新依赖隐式实例状态（有值时轨迹被静默清空），N4 ① 必须翻红'],
    ['W3-到访史第二写源', SB,
        "            v.count++;                       // 去重计数：只有「又去了一个别的楼层」才算再次到访",
        "            v.count++; this.visits.set(key, v);",
        1, 1,
        '记账单被塞进第二处写源（到场史不只一个真源），N4 ② 必须翻红'],
    ['W4-删楼回滚手动扣减到访史', SB,
        "        this.track = this.track.filter(t => t.floor !== f);",
        "        this.track = this.track.filter(t => t.floor !== f); this.visits.delete('x');",
        1, 1,
        '与紧随的 _rebuild 形成双写源（写了等于没写），N4 ③ 必须翻红'],
    ['W5-_rebuild 不再重建到访史', SB,
        "        this.nodes.clear();\n        this.visits.clear();",
        "        this.nodes.clear();",
        1, 1,
        '清了却没人重建（删楼后到访读数是旧账影子），N4 ③ 必须翻红'],
    ['W6-在场面空转（whereIs 恒 null）', SB,
        "    whereIs(name) {\n        const rec = this.presence.get(trim(name));\n        if (!rec) return null;\n        return { name: trim(name), key: rec.key, path: rec.path || [], atFloor: rec.atFloor };\n    }",
        "    whereIs(name) { return null; }",
        1, 1,
        '方法在位但空转 ⇒「谁在这个地方」仍答不出（声明面 ≠ 行为面），N2 ③ 必须翻红'],
    ['W7-不变量三态塌成两态', SB,
        "        return { state: broken.length ? 'broken' : (warnings.length ? 'warn' : 'ok'), broken, warnings };",
        "        return { state: 'ok', broken, warnings };",
        1, 1,
        'broken/warn 两态被并进 ok（三态塌两态，本仓库缺陷族），N3 必须翻红'],
    ['W8-提取落位脱钩', IDX,
        'const _moved = this.scene.setLocation(message.index || 0, extracted.location);',
        'const _moved = null;   // 破坏：不再落位',
        1, 1,
        '模块在位却零消费（死声明），N1 必须翻红'],
    ['W9-判据纯度：注释里的旧写法不得误报', SB,
        '    rebuildFromOps(cutoff) {',
        "    // 旧写法（已修）：t.floor < (this._cutoff || 0) || this._cutoff === undefined ? true : false\n    rebuildFromOps(cutoff) {",
        1, 0,
        '真代码正确、只在**注释**里写回旧写法 ⇒ 判据必须仍 exit 0（形态判据读注释 = 判据失效）'],
    ['W10-模块消失', 'DELETE', SB, null, null, 2,
        '场所图景模块被删/改名 ⇒ N0 结构漂移（探测对象不在，不得当「没问题」）']
];
for (const p of [SCAN, ...GAUGED.map(f => path.join(REPO, f))]) {
    if (!fs.existsSync(p)) {
        console.error('[v3181-negctl] 缺文件：' + p + ' ——结构漂移（负控制无法建立）');
        process.exit(2);
    }
}
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'v3181-negctl-'));
const problems = [];
const rows = [];
for (const [name, target, anchor, repl, expectHits, expectCode, why] of CASES) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    for (const f of GAUGED) fs.copyFileSync(path.join(REPO, f), path.join(dir, f));
    let brokenBytes = 0;
    let deleted = 0;
    if (target === 'DELETE') {
        const victim = path.join(dir, anchor);
        if (!fs.existsSync(victim)) { problems.push(name + '：待删文件不存在'); continue; }
        deleted = fs.statSync(victim).size;
        fs.rmSync(victim);
    } else if (target) {
        const p = path.join(dir, target);
        const before = fs.readFileSync(p, 'utf8');
        const hits = before.split(anchor).length - 1;
        if (hits !== expectHits) {
            problems.push(name + '：锚点命中 ' + hits + ' 次、期望 ' + expectHits
                + ' 次（锚点漂移 ⇒ 该组作废，防静默跳过）');
            continue;
        }
        const after = before.split(anchor).join(repl);
        brokenBytes = Buffer.byteLength(after) - Buffer.byteLength(before);
        if (brokenBytes === 0) {
            problems.push(name + '：替换后字节未变化（破坏不可观测 ⇒ 负控制失效）');
            continue;
        }
        fs.writeFileSync(p, after);
        const chk = spawnSync(process.execPath, ['--check', p], { encoding: 'utf8', cwd: dir });
        if (chk.status !== 0) {
            problems.push(name + '：破坏后语法不合法（' + String(chk.stderr || '').slice(0, 160)
                + '）⇒ 非零退出不可归因于判据');
            continue;
        }
    }
    const r = spawnSync(process.execPath, [SCAN], {
        cwd: dir, encoding: 'utf8',
        env: Object.assign({}, process.env, { LONSHA_AUDIT_ROOT: dir })
    });
    const code = r.status === null ? -1 : r.status;
    const out = String(r.stdout || '') + String(r.stderr || '');
    const reds = out.split('\n').filter(l => l.trim().startsWith('✗')).map(l => l.trim());
    if (code === 0 && expectCode !== 0) {
        problems.push(name + '：破坏后 N 仍 exit 0 ⇒ **判据对这类破坏无反应（恒绿）**');
    }
    if (code !== 0 && expectCode === 0) {
        problems.push(name + '：期望 exit 0（不得误报），实得 ' + code + ' ⇒ 判据被注释/非代码内容骗过');
    }
    if (code !== expectCode) {
        problems.push(name + '：退出码 ' + code + '、期望 ' + expectCode);
    }
    if (code === 1 && reds.length === 0) {
        problems.push(name + '：exit 1 却没有判据条目翻红 ⇒ 退出路径可疑（可能只是结构预检失败）');
    }
    rows.push({ name, code, expectCode, brokenBytes, deleted, reds: reds.slice(0, 2), why });
}
for (const r of rows) {
    const ok = r.code === r.expectCode;
    console.log('  ' + (ok ? '✓' : '✗') + ' ' + r.name + '  exit=' + r.code
        + '（期望 ' + r.expectCode + '）· 破坏字节 ' + (r.deleted || r.brokenBytes));
    for (const l of r.reds) console.log('        └ ' + l.slice(0, 140));
}
fs.rmSync(root, { recursive: true, force: true });
if (problems.length) {
    console.error('\n[v3181-negctl] 负控制失效，' + problems.length + ' 项：');
    for (const p of problems) console.error('  ✗ ' + p);
    process.exit(1);
}
console.log('✓ v3.181 场所图景审计负控制：原版绿 + ' + CASES.filter(c => c[1] && c[1] !== 'DELETE').length
    + ' 组真源码破坏各自翻红 + ' + CASES.filter(c => c[1] === 'DELETE').length
    + ' 组结构漂移 · 判据纯度两向自证（注释旧写法不误报 W9 / 真破坏必报 W1-W2）');