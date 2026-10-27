// tests/v3131_ground_truth.test.mjs
// [v3.131] 保存地面真源：recordSaveSource 行为级验证 + A8 持久化对称性审计联动
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}
const src = __hostSurface();
const ui = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');

function extractMethod(marker) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `${marker} 存在`);
    let depth = 0, i = src.indexOf('{', start);
    const open = i;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(open + 1, i);
}

test('v3.131 recordSaveSource 行为：来源计数累加、楼层保留', () => {
    const errLog = () => {};
    // [v3.166] 语义修正：登记只记**意图**，真实落盘由 recordSaveFailed(ok=true) 推进。
    //   旧判据在登记后直接断言 sources.realtime === 1，绑的是「登记 = 保存成功」这一
    //   被本版证伪的假设。改绑不变量：
    //     ★ 尝试必被记账（attempts）
    //     ★ 只有结果成功的保存才计入 sources
    //     ★ 失败的保存进入 denied，且可归因到具体来源与原因
    //     ★ 非法楼层回退到上一次有效楼层（v3.131 原意，保持不变）
    const bodyA = extractMethod('recordSaveSource(source, floor = -1) {');
    const bodyB = extractMethod("recordSaveFailed(source, ok, reason = '') {");
    const fnA = new Function('errLog', `return function (source, floor = -1) { ${bodyA} }`)(errLog);
    const fnB = new Function('errLog', `return function (source, ok, reason = '') { ${bodyB} }`)(errLog);
    const eng = { _lastSaveGroundTruth: { ts: 0, floor: 5, sources: {}, attempts: {}, denied: {}, lastDenied: null } };

    // 登记 = 记意图：楼层更新、尝试计数 +1、但尚不计入 sources
    fnA.call(eng, 'realtime', 6);
    assert.equal(eng._lastSaveGroundTruth.floor, 6, '合法楼层被记录');
    assert.equal(eng._lastSaveGroundTruth.attempts.realtime, 1, '尝试必被记账');
    assert.equal(eng._lastSaveGroundTruth.sources.realtime, undefined, '未落盘前不计入 sources');

    // 落盘成功 → sources 推进
    fnB.call(eng, 'realtime', true, '');
    assert.equal(eng._lastSaveGroundTruth.sources.realtime, 1, '落盘成功后 sources +1');

    // 再尝试一次并再次成功：两个计数器各自独立累加
    fnA.call(eng, 'realtime', 7);
    fnB.call(eng, 'realtime', true, '');
    assert.equal(eng._lastSaveGroundTruth.sources.realtime, 2, '来源计数按结果累加');
    assert.equal(eng._lastSaveGroundTruth.attempts.realtime, 2, '尝试计数与结果计数各自独立');

    // 另一个来源失败 → 进 denied，不进 sources
    fnA.call(eng, 'swipe', 7);
    fnB.call(eng, 'swipe', false, 'disk full');
    assert.equal(eng._lastSaveGroundTruth.sources.swipe, undefined, '失败来源不得计入 sources');
    assert.equal(eng._lastSaveGroundTruth.denied.swipe, 1, '失败来源计入 denied');
    assert.equal(eng._lastSaveGroundTruth.lastDenied.source, 'swipe', '最后一次拒绝可归因到来源');
    assert.match(eng._lastSaveGroundTruth.lastDenied.reason, /disk full/, '拒绝原因被保留');

    // 非法楼层回退到 prev.floor
    fnA.call(eng, 'edit', NaN);
    assert.equal(eng._lastSaveGroundTruth.floor, 7, '非法楼层回退到上次有效楼层');

    // ts 单调推进
    const t1 = eng._lastSaveGroundTruth.ts;
    fnA.call(eng, 'delete', 8);
    assert.ok(eng._lastSaveGroundTruth.ts >= t1, 'ts 单调推进');
});

test('v3.131 全部 storage.save 调用点登记来源', () => {
    // 已登记的保存点（realtime 带楼层参数，其余无参）
    assert.ok(src.includes("recordSaveSource('realtime'"), '保存点 realtime 应登记来源');
    for (const srcName of ['stmLtm', 'backfill', 'edit', 'swipe', 'delete']) {
        assert.ok(src.includes(`recordSaveSource('${srcName}')`), `保存点 ${srcName} 应登记来源`);
    }
    // OMR 主保存应先登记再保存（登记调用在 collectExport 之前）
    const i = src.indexOf("recordSaveSource('realtime'");
    const j = src.indexOf('await this.storage.save(chatId, _omrPayload)');   // [v3.138] CP-L2: payload 先收集后保存
    assert.ok(i > 0 && j > i, 'OMR: 登记先于保存');
});

test('v3.131 A8 持久化对称性审计当前零缺口', () => {
    const out = execSync('node tests/audit/scan_wiring.mjs', { cwd: new URL('..', import.meta.url).pathname, encoding: 'utf8' });
    const m1 = /=== A8\.1 存而不读[^\n]*\((\d+)\)/.exec(out);
    const m2 = /=== A8\.2 读而无存[^\n]*\((\d+)\)/.exec(out);
    assert.ok(m1 && m2, 'A8 输出存在');
    assert.equal(m1[1], '0', '存而不读应为 0');
    assert.equal(m2[1], '0', '读而无存应为 0');
});

test('v3.131 诊断面板展示地面真源', () => {
    assert.match(ui, /保存地面真源/);
});