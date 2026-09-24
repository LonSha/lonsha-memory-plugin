// tests/v3166_config_migration_write_ledger.test.mjs
// LonSha 记忆引擎 v3.166.0 主题：写入承诺面 —— 「写了、不等于写进去了」
//
// 覆盖六处修复，全部按**不变量**断言（不绑当时的代码形状）：
//   A  配置迁移不得靠自引用构造 + 栈溢出收敛（类外默认值模板 + 迁移台账）
//   B2 写入合流按 chatId：同 chat 取最新（=v3.40 Write Coalescing），异 chat 并存
//   C  保存来源由**结果**驱动：attempts（意图）与 sources（落地）分离，拒绝可归因
//   D  三行诊断（配置迁移 / 写盘合流 / 保存来源）进入 selfCheck 子系统列表
//   E  save() 在部分字段缺失的环境（测试桩 / 热更新残留实例）不得抛错
//   F  落盘证据同源（_confirmed 的 chatId 与 revision 来自同一批次）+ 宿主否认不得计入证据
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments as libStrip } from './_audit_lib.mjs';
const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const STORAGE_KEY = 'lonsha_memory';

/* ══════════════ 0. 版本与发布卫生 ══════════════ */
test('v3.166 版本下界与四处同步', () => {
    const vnum = (s) => {
        const m = /^([0-9]+)\.([0-9]+)\.([0-9]+)/.exec(String(s || '').trim());
        return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
    };
    const v = /const VERSION = '([\d.]+)'/.exec(src)?.[1];
    assert.ok(vnum(v) >= vnum('3.166.0'), `index.js 版本 ${v} >= 3.166.0`);
    // 下一版的「当版独占交出」会扫描本文件里的 vnum 下界，链条必须能接上
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url), 'utf8'));
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
    const changelog = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
    assert.equal(manifest.version, v, 'manifest 与 index.js 同版');
    assert.equal(pkg.version, v, 'package.json 与 index.js 同版');
    assert.ok(changelog.startsWith('## v' + v), `CHANGELOG 顶节应为 v${v}`);
    assert.ok(changelog.includes('写入承诺面'), 'CHANGELOG 应记录写入承诺面这条主线');
});


/** 花括号配对提取（字符串/注释/模板串安全），与仓库既有测试同风格。 */
function extractBraced(marker) {
    const start = src.indexOf(marker);
    assert.ok(start >= 0, `${marker} 存在`);
    let depth = 0, inStr = null, esc = false, lineC = false, blockC = false;
    let i = src.indexOf('{', start);
    const open = i;
    for (; i < src.length; i++) {
        const ch = src[i], nx = src[i + 1];
        if (lineC) { if (ch === '\n') lineC = false; continue; }
        if (blockC) { if (ch === '*' && nx === '/') { blockC = false; i++; } continue; }
        if (inStr) {
            if (esc) { esc = false; continue; }
            if (ch === '\\') { esc = true; continue; }
            if (ch === inStr) inStr = null;
            continue;
        }
        if (ch === '/' && nx === '/') { lineC = true; i++; continue; }
        if (ch === '/' && nx === '*') { blockC = true; i++; continue; }
        if (ch === '"' || ch === "'" || ch === '`') { inStr = ch; continue; }
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) break; }
    }
    return src.slice(open + 1, i);
}

/** 构造一个可独立运行的 storage.save 环境（只提供部分字段，模拟测试桩/残留实例）。 */
function makeSaveEnv({ saveChatReturn = true, withPending = false, chatMetadata = true } = {}) {
    const seen = [];          // 每次真实落盘时，扩展位里记录的 chatId
    const dataSeen = [];      // 每次真实落盘时，扩展位里记录的数据
    const ctx = {
        chatMetadata: chatMetadata ? { extensions: {} } : null,
        saveChat: async () => {
            const slot = ctx.chatMetadata?.extensions?.[STORAGE_KEY];
            if (slot) { seen.push(String(slot.chatId)); dataSeen.push(slot.data); }
            return saveChatReturn;
        },
    };
    const win = { SillyTavern: { getContext: () => ctx }, LonShaMemory: { emergency: { save: async () => {} } } };
    const body = extractBraced('async save(chatId, data) {');
    const st = { STORAGE_KEY, _isWriting: false, _revision: 0, _confirmed: null, _lastWrite: null };
    if (withPending) {
        st._pendingWrites = new Map();
        st._mergedBatches = 0; st._coalescedByChat = {}; st._crossChatCoexists = 0; st._lastMergedRevis = 0;
    }
    const fn = new Function('window', 'console', 'errLog', 'ARCHIVE_TOP_LEVEL_KEY_SET', 'STORAGE_FP_FIELDS', 'VERSION', 'PLUGIN_NAME',
        `return async function (chatId, data) { ${body} }`)(
        win, { warn() {}, error() {}, log() {} }, () => {}, new Set(['graph', 'summaries']), ['graph'], '3.166.0', 'T');
    return { st, fn, seen, dataSeen, ctx };
}

/* ══════════════ A. 配置迁移：不得自引用构造 ══════════════ */
test('v3.166 A 配置迁移不靠自引用构造 + 栈溢出收敛', () => {
    // 不变量 1：迁移分支不得再构造 ConfigManager 自己来取默认值。
    //   旧写法 new (this.constructor)() 在迁移条件成立时递归 —— 构造函数调 loadConfig、
    //   迁移条件又成立，直到栈溢出 RangeError 被 catch 吞掉才「收敛」。
    //   收敛依据是异常兜底而不是值正确，且每次冷启动白烧数千步递归。
    const migRegion = src.slice(src.indexOf('loadConfig() {'), src.indexOf('_applyCardOverrides() {'));
    // 先剥注释再判：这段代码紧邻的说明文字本身就写着 new (this.constructor)()，
    //   裸正则命中注释会假失败（判据被自己的说明注释骗过）。
    // [v3.191] 剥注释收敛到唯一真源（原第四份副本：不保偏移的正则版，含字符串/正则误伤风险）
    const stripComments = libStrip;
    const migCode = stripComments(migRegion);
    assert.ok(!/new\s*\(\s*this\.constructor\s*\)/.test(migCode), '迁移分支不得自引用构造');

    // 不变量 2：默认值来自类外冻结模板（在合并 localStorage 之前拍下，不受运行时改动污染）
    assert.ok(/let _configDefaultsTemplate = null;/.test(src), '类外默认值模板存在');
    const ctorRegion = src.slice(src.indexOf('class ConfigManager'), src.indexOf('loadConfig() {'));
    assert.ok(/_configDefaultsTemplate\s*=\s*JSON\.parse\(JSON\.stringify\(this\.config\)\)/.test(ctorRegion),
        '构造函数在合并外部配置前冻结默认值模板');
    const ctorTail = ctorRegion.slice(ctorRegion.indexOf('_configDefaultsTemplate'));
    assert.ok(ctorTail.indexOf('loadConfig();') > ctorTail.indexOf('_configDefaultsTemplate'),
        '模板冻结必须先于 loadConfig');

    // 不变量 3：迁移必须留下台账（迁了什么 / 跳过什么 / 失败在哪）
    assert.ok(/this\._lastMigrationReport = _mig;/.test(migRegion), '迁移台账落实例');
    for (const field of ['checks', 'applied', 'skipped', 'failed']) {
        assert.ok(new RegExp(`${field}:\\s*(\\[\\]|0)`).test(migRegion), `台账含 ${field}`);
    }
    // 不变量 4：迁移写入前必须校验默认值类型（缺失时记 skipped，不许写入 undefined）
    const appends = migRegion.match(/_mig\.skipped\.push\(/g) || [];
    assert.ok(appends.length >= 3, `三个迁移分支都应能声明「跳过」，实际 ${appends.length}`);
    // 不变量 5：第三处迁移必须验证替换真的改动了值才算迁移。
    //   [v3.184] 该处由裸字面 replace 改为 fuzzy-patch（applyPatch 精确优先 + 归一化回退），
    //   形状从「比较 extractionPrompt 与 _before」变成「先算 _after、再比 _after 与 _before」
    //   —— 判据原意不变（未命中不得声明迁移成功），两侧都断言，防有人只改一半。
    assert.ok(/if\s*\(_after !== null && _after !== _before\)/.test(migRegion),
        'replace 未命中不得声明迁移成功（当前形状：_after 与 _before 比对）');
    assert.ok(/_mig\.skipped\.push\('v1\.4\.2-summary描述\(/.test(migRegion),
        '未命中必须落 skipped 台账（不得静默当成已升级）');
});

/* ══════════════ B2. 写入合流：同 chat 合并、异 chat 并存 ══════════════ */
test('v3.166 B2 同 chat 连续保存合并（v3.40 语义不得倒退）', async () => {
    // 不变量（v3.40 起的书面设计意图，见 tests/v340_database_evolution）：
    //   N 次同 chat 连续保存 → 真实 I/O **≤ 2**，且最终落盘必须是**最新**的一份。
    //   为什么不是 1：首个批次已经进入在途写入，无法撤回；合流只能保证
    //   「在途之外的后续快照只写一份最新的」。
    const env = makeSaveEnv({ withPending: true });
    const ps = [];
    for (let i = 1; i <= 5; i++) ps.push(env.fn.call(env.st, 'c1', { seq: i }));
    const rs = await Promise.all(ps);
    assert.ok(rs.every(x => x === true), '合流分支对外仍返回 true（写请求已受理）');
    assert.ok(env.seen.length <= 2, `同 chat 连续保存应合并为 ≤2 次真实 I/O，实际 ${env.seen.length}`);
    assert.equal(env.dataSeen[env.dataSeen.length - 1].seq, 5, '落盘的必须是最新一份（后一份是前一份的超集）');
    // 会计完整性：每一次被受理的保存，要么落盘、要么被合并 —— 一次都不能凭空消失。
    //   （这比断言某个具体合并次数更稳：不绑实现的入队细节，只绑「有没有丢」。）
    const accepted = rs.filter(x => x === true).length;
    assert.equal(env.seen.length + env.st._mergedBatches, accepted,
        `受理 ${accepted} 次 = 落盘 ${env.seen.length} + 合并 ${env.st._mergedBatches}`);
    assert.ok(!('_droppedBatches' in env.st) || env.st._droppedBatches === 0,
        '正常合并不得被记成「丢弃」（措辞误导会把良性行为报成数据丢失）');
});

test('v3.166 B2 跨 chat 并存：三个 chat 同窗口保存，一个都不能丢', async () => {
    // 这是真正的丢失场景：补提取用租约捕获的旧 chatId、删楼用被删的 chatId，
    //   都可能与当前 chat 的保存落在同一写入窗口。
    //   旧实现是**全局单槽**：c2 的批次会被 c3 直接盖掉 —— 静默、无计数、调用方收到 true。
    const env = makeSaveEnv({ withPending: true });
    const ps = [
        env.fn.call(env.st, 'c1', { seq: 1 }),
        env.fn.call(env.st, 'c2', { seq: 2 }),
        env.fn.call(env.st, 'c3', { seq: 3 }),
    ];
    await Promise.all(ps);
    assert.deepEqual([...env.seen].sort(), ['c1', 'c2', 'c3'],
        `三个 chat 都必须落盘，实际落了 ${JSON.stringify(env.seen)}`);
    assert.equal(env.seen.length, 3, `真实 I/O 次数应为 3（异 chat 不可合并），实际 ${env.seen.length}`);
    assert.ok(env.st._crossChatCoexists >= 1, '异 chat 并存被记账（旧实现会在此丢一个）');
    assert.equal(env.seen.length + env.st._mergedBatches, 3, '受理 3 次 = 落盘 3 + 合并 0（异 chat 不可合并）');
    assert.equal(env.st._confirmed.chatId, env.seen[env.seen.length - 1], '_confirmed 指向最后落盘的那个 chat');
});

/* ══════════════ C. 保存来源：由结果驱动 ══════════════ */
test('v3.166 C 保存来源由结果驱动：意图与落地分离、拒绝可归因', () => {
    const bodyA = extractBraced('recordSaveSource(source, floor = -1) {');
    const bodyB = extractBraced("recordSaveFailed(source, ok, reason = '') {");
    const fnA = new Function('errLog', `return function (source, floor = -1) { ${bodyA} }`)(() => {});
    const fnB = new Function('errLog', `return function (source, ok, reason = '') { ${bodyB} }`)(() => {});
    const eng = { _lastSaveGroundTruth: null };

    fnA.call(eng, 'stmLtm');
    fnA.call(eng, 'stmLtm');
    fnB.call(eng, 'stmLtm', true, '');
    fnA.call(eng, 'delete');            // 尝试了
    fnB.call(eng, 'delete', false, '修订冲突');   // 被拒

    const g = eng._lastSaveGroundTruth;
    assert.equal(g.attempts.stmLtm, 2, '尝试计数忠实记录意图');
    assert.equal(g.sources.stmLtm, 1, 'sources 只由成功结果推进');
    assert.equal(g.denied.delete, 1, '被拒来源进入 denied');
    assert.equal(g.sources.delete, undefined, '被拒来源不得出现在 sources');
    assert.equal(g.lastDenied.source, 'delete', '最后一次拒绝可归因');
    assert.match(g.lastDenied.reason, /修订冲突/, '拒绝原因被保留');

    // getSaveSourceReport：三计数器按来源聚合
    const bodyR = extractBraced('getSaveSourceReport() {');
    const fnR = new Function(`return function () { ${bodyR} }`)();
    const rep = fnR.call(eng);
    const row = rep.rows.find(x => x.source === 'stmLtm');
    assert.equal(row.attempted, 2, '报告含尝试数');
    assert.equal(row.persisted, 1, '报告含落地数');
    assert.equal(row.denied, 0, '报告含拒绝数');
    const drow = rep.rows.find(x => x.source === 'delete');
    assert.equal(drow.denied, 1, '报告按来源暴露拒绝');
    assert.ok(rep.lastDenied, '报告暴露最后一次拒绝');
});

/* ══════════════ D. 三行诊断进入 selfCheck ══════════════ */
test('v3.166 D 三行新诊断进入 selfCheck 子系统列表', () => {
    const scStart = src.indexOf('async selfCheck() {');
    assert.ok(scStart > 0, 'selfCheck 存在');
    let d = 0, scEnd = -1;
    for (let i = src.indexOf('{', scStart); i < src.length; i++) {
        if (src[i] === '{') d++;
        else if (src[i] === '}') { d--; if (d === 0) { scEnd = i; break; } }
    }
    const scBody = src.slice(scStart, scEnd);
    const items = [];
    const lb = scBody.indexOf('const rows = [');
    if (lb >= 0) {
        let bd = 0, rb = -1;
        for (let i = scBody.indexOf('[', lb); i < scBody.length; i++) {
            if (scBody[i] === '[') bd++;
            else if (scBody[i] === ']') { bd--; if (bd === 0) { rb = i; break; } }
        }
        for (const m of scBody.slice(lb, rb + 1).matchAll(/\['([^']+)',/g)) items.push(m[1]);
    }
    for (const m of scBody.matchAll(/rows\.push\(\[\s*'([^']+)'/g)) items.push(m[1]);
    for (const k of ['配置迁移', '写盘合流', '保存来源']) {
        assert.ok(items.includes(k), `${k} 应进入 selfCheck 子系统列表（修完的缺陷必须能被看见）`);
    }
    // 三行都必须有「带数据的主渲染」，而不是只剩一个同名的兜底分支：
    //   改名主渲染但保留兜底时，键仍然存在 —— 判据会被自己的兜底出口骗过。
    assert.ok(/return \['配置迁移', txt\];/.test(scBody), '配置迁移主渲染存在（非空壳）');
    assert.ok(/return \['写盘合流', txt\];/.test(scBody), '写盘合流主渲染存在（非空壳）');
    assert.ok(/return \['保存来源', txt\];/.test(scBody), '保存来源主渲染存在（非空壳）');
    // 三行都必须读修复后引入的可观测字段，否则是空壳诊断
    assert.ok(/cm\?\._lastMigrationReport/.test(scBody), '配置迁移行读迁移台账');
    assert.ok(/cm\?\._configLoadError/.test(scBody), '配置迁移行读载入失败');
    assert.ok(/_pendingWrites instanceof Map/.test(scBody), '写盘合流行读待写集合');
    assert.ok(/getSaveSourceReport\?\.\(\)/.test(scBody), '保存来源行读来源报告');
});

/* ══════════════ E. 部分字段缺失时不得抛错 ══════════════ */
test('v3.166 E 待写集合缺失时 save 不得抛错（否则「保存失败」退化成「保存崩溃」）', async () => {
    const env = makeSaveEnv({ withPending: false });   // 模拟只提供部分字段的调用方
    let out, threw = null;
    try { out = await env.fn.call(env.st, 'c1', { seq: 1 }); } catch (e) { threw = e; }
    assert.equal(threw, null, `save 不得抛错，实际抛了：${threw && threw.message}`);
    assert.equal(out, true, '正常落盘仍返回 true');
    assert.ok(env.st._pendingWrites instanceof Map, '待写集合被惰性补全');
    assert.equal(env.seen.length, 1, '落盘正常发生');
});

/* ══════════════ F. 落盘证据同源 + 宿主否认 ══════════════ */
test('v3.166 F 落盘证据同源：_confirmed 的 chatId 与 revision 来自同一批次', async () => {
    const env = makeSaveEnv({ withPending: true });
    const p1 = env.fn.call(env.st, 'c1', { seq: 1 });   // 首次调用（挂起）
    const p2 = env.fn.call(env.st, 'c2', { seq: 2 });   // 异 chat 合流
    await Promise.all([p1, p2]);
    // 循环顺序：c1（发起者）→ c2。最后落盘的是 c2。
    //   修前 _confirmed = { chatId: 首次调用的 'c1', revision: 实际落盘的 c2 的 rev }
    //   —— 描述了一个从未同时存在的「对」。
    const last = env.seen[env.seen.length - 1];
    assert.equal(env.st._confirmed.chatId, last, '_confirmed.chatId 必须是最后落盘批次的 chat');
    assert.equal(env.st._lastWrite.chatId, last, '_lastWrite 与 _confirmed 身份一致');
    const diskRev = env.ctx.chatMetadata.extensions[STORAGE_KEY].revision;
    assert.equal(env.st._confirmed.revision, env.st._lastWrite.revision, '确认与末次写入修订号同源');
    assert.ok(env.st._confirmed.revision >= diskRev - 1, '确认修订号不落后于磁盘存档');
});

test('v3.166 F 宿主否认（saveChat 返回 false）不得计入落盘证据', async () => {
    const env = makeSaveEnv({ saveChatReturn: false });
    const r = await env.fn.call(env.st, 'c1', { seq: 1 });
    assert.equal(r, false, '宿主明确否认 → save 必须返回 false');
    assert.equal(env.st._confirmed, null, '未落地不得推进确认');
    assert.equal(env.st._lastWrite.status, 'failed', '失败必须显式可见');
    assert.match(String(env.st._lastWrite.error || ''), /未落地|false/, '失败原因可归因');
    // 对照：宿主不表态（undefined）时按落地处理，行为不变
    const env2 = makeSaveEnv({ saveChatReturn: undefined });
    const r2 = await env2.fn.call(env2.st, 'c1', { seq: 1 });
    assert.equal(r2, true, '宿主不表态按落地处理（不得误伤主流 ST 版本）');
});
