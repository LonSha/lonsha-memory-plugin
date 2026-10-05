// tests/v3272_o1_session_identity.test.mjs — v3.272.0 O1：保存与加载的会话身份保护
// [v3.272.0 O1] 保存与加载的**会话身份保护**。
//
// 修的形态：save(chatId) 按 chatId 排队与合流，但真实写入用的是**执行那一刻**的
//   上下文 metadata。不核对就出现「在 B 的元数据里写上 chatId:A 的数据，还回 true、
//   报 confirmed A」—— A 的存档看起来存了、实际在 B 里；B 的存档被陌生数据覆盖。
//   不报错、只错档。load(chatId) 同类：无条件把**当前会话**的存档导入。
//
// 覆盖：
//   A 结构面（内联核验在场 / 零新方法 / 取数口唯一 / metadata 修订号归本批）
//   B 行为面（异会话不写 / 延期不丢 / 同会话照旧 / 身份未知放行 / load 拒绝 / revision 归本批）
//   C 负控制（真源码破坏 → 副本上重跑同款判据）
//   D 版本锚（下限形）
//
// 边界（诚实）：
//   本层证明的是**底层边界**在真类 + 合成宿主下成立。生产调用方的栅栏（
//   engine 侧 _leaseValid / _loadedChatId / OMR 确认状态机）是否使该路径可达，
//   属端到端时序问题，本套件不覆盖 —— 它按 O1 验收原文的「生产路径同样有可重现证明」
//   单列在 not_done 里。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { stripComments, braceMatch as libBraceMatch } from './_audit_lib.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const ORG = 'memory-organs.js';
const STORAGE_KEY = 'lonsha_memory';
const NL = String.fromCharCode(10);
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const ORG_SRC = read(ORG);
/* 方法签名真源：用拼接拼出（模板串会吞反斜杠，本文件全程不写反斜杠字面量） */
const SIG_SAVE = 'async save' + '(' + 'chatId, data' + ')' + ' {';
const SIG_LOAD = 'async load' + '(' + 'chatId, opts = {}' + ')' + ' {';

/* ══════════════ 夹具：把真 save / load 方法体抠进 new Function（与仓内历史套件同款） ══════════════ */
/* 花括号配对**委托唯一真源**（tests/_audit_lib.mjs，v3.191 收敛），不本地重写。
 *   本文件初版自写了一份带注释态机的 extractBraced，被
 *   tests/audit/scan_audit_lib_consolidation.mjs 的 E1 结构面当场点出
 *   （「仍在本地重写 bodyOf」）—— 本仓纪律是「同一口径只许一份实现」。
 *
 *   为什么用「真源 stripComments + 真源 braceMatch」的**串联**，而不是直接调真源 bodyOf：
 *     · 真源 braceMatch 只跳字符串、**不跳注释**（注释里的花括号会把深度算错）；
 *     · 真源 bodyOf 按 indexOf 取「其后第一个 {」，而本套件要抠的签名
 *       async load(chatId, opts = {}) { 的参数默认值里就含 {} —— 直接用它会在默认值处
 *       起算、把方法体抽成空串（本套件首版实测踩过这个坑）。
 *   故起点一律由调用方**显式**给出：marker 末尾那个花括号。
 *   这是对真源两段能力的**串联**，不是第二份实现（与 v3210 / v3211 同款、同理由）。
 *   本文件另一处 function bodyOf(dir, marker)（dir 版，签名与真源不同）已在
 *   scan_audit_lib_consolidation.mjs 的 EXEMPT 表登记并说明。 */
function extractBraced(src, marker) {
    const at = src.indexOf(marker);
    assert.ok(at >= 0, marker + ' 必须存在');
    const open = at + marker.length - 1;
    const chunk = libBraceMatch(stripComments(src), open);
    assert.ok(chunk != null, marker + ' 的方法体未闭合（取到残段比取不到更危险）');
    return src.slice(open + 1, open + chunk.length - 1);
}
const SAVE_BODY = extractBraced(ORG_SRC, SIG_SAVE);
const LOAD_BODY = extractBraced(ORG_SRC, SIG_LOAD);

/** 合成宿主：当前会话 = curId；saveChat 收下就记一笔「谁被写、写了谁的档」。 */
function mkEnv(curId, { saveChatReturn = true, meta = true } = {}) {
    const writes = [];       // [{ metaChatId, writtenChatId, data }]
    const ctx = {
        chatId: curId,
        chatMetadata: meta ? { file_name: curId, extensions: {} } : null,
        saveChat: async () => {
            const slot = ctx.chatMetadata ? ctx.chatMetadata.extensions[STORAGE_KEY] : null;
            if (slot) writes.push({ metaChatId: curId, writtenChatId: String(slot.chatId), data: slot.data });
            return saveChatReturn;
        }
    };
    const win = { SillyTavern: { getContext: () => ctx }, LonShaMemory: { emergency: { save: async () => {} } } };
    const st = { STORAGE_KEY, _isWriting: false, _revision: 0, _confirmed: null, _lastWrite: null, _pendingWrites: new Map(), _mergedBatches: 0, _coalescedByChat: {}, _crossChatCoexists: 0, _lastMergedRevis: 0 };
    const saveFn = new Function('window', 'console', 'errLog', 'ARCHIVE_TOP_LEVEL_KEY_SET', 'STORAGE_FP_FIELDS', 'VERSION', 'PLUGIN_NAME',
        'return async function (chatId, data) { ' + SAVE_BODY + ' }')(
        win, { warn() {}, error() {}, log() {} }, () => {}, new Set(['graph', 'summaries']), ['graph'], '3.272.0', 'T');
    const loadFn = new Function('window', 'console', 'errLog', 'VERSION', 'PLUGIN_NAME',
        'return async function (chatId, opts) { ' + LOAD_BODY + ' }')(
        win, { warn() {}, error() {}, log() {} }, () => {}, '3.272.0', 'T');
    return { st, saveFn, loadFn, ctx, writes };
}

/* ══════════════ A 结构面 ══════════════ */
test('v3272 A1 身份核验**内联**在 save / load 体内（零新方法，不打破抽取式夹具）', () => {
    assert.ok(SAVE_BODY.includes('const _ctxIdOf = function () {'), 'save 体内须内联取数器');
    assert.ok(SAVE_BODY.includes('const _liveChatId = _ctxIdOf();'), 'save 体内须当场捕获当前身份（循环里可重读）');
    assert.ok(SAVE_BODY.includes('String(curChatId) !== String(_liveChatId)'), '核验判据在内联处');
    assert.ok(SAVE_BODY.includes('_deferredBatches.push('), '拒收的批次须进延期槽（不丢）');
    assert.ok(LOAD_BODY.includes('_lastLoadRefusal'), 'load 体内须记录拒收（可归因）');
    /* 零新方法：这两个名字不得作为**类成员**出现在文件里 */
    assert.equal(ORG_SRC.includes(SAVE_BODY_MARK), false, '不得为 O1 新增方法');
});
const SAVE_BODY_MARK = '    _contextChatIdOf(';
test('v3272 A2 metadata 的 revision 用**本批自己的**修订号', () => {
    const body = extractBraced(ORG_SRC, SIG_SAVE);
    assert.ok(body.includes('revision: curRev,'), 'metadata.revision 须用本批 rev');
    /* 取 metadata 写入块：块内 300 字符足够覆盖全部标量字段。 */
    const at2 = body.indexOf('extensions[this.STORAGE_KEY] = {');
    assert.ok(at2 >= 0, 'metadata 写入点须在场');
    const blk = body.slice(at2, at2 + 300);
    assert.ok(blk.indexOf('revision: curRev,') >= 0, 'metadata 块内的 revision 须用本批 rev');
    assert.equal(blk.indexOf('revision: currentRev,'), -1, 'metadata 块内不得残留旧的循环外首调 rev');
});
test('v3272 A3 取数口唯一：chatId 与 chatMetadata.file_name 只在这两处读', () => {
    const RE_IDSITE = new RegExp('[.]chatId ' + '[|][|]' + ' [(]', 'g');
    const n = (ORG_SRC.match(RE_IDSITE) || []).length;
    assert.equal(n, 2, 'save 内联一处 + load 内联一处（同一口径不许三份实现），实得 ' + n);
});

/* ══════════════ B 行为面 ══════════════ */
test('v3272 B1 ★ 异会话写：当前在 B、请求存 A ⇒ 不得写 B 的 metadata，返回 false', async () => {
    const env = mkEnv('B');
    const r = await env.saveFn.call(env.st, 'A', { graph: { n: 1 }, summaries: [] });
    assert.equal(r, false, '身份不符 ⇒ 必须返回 false（旧行为回 true、报 confirmed A）');
    assert.equal(env.writes.length, 0, '★ 一条都不许写进当前（B）会话的 metadata');
    assert.equal(env.st._confirmed, null, '未落地不得推进确认');
    assert.equal(env.st._lastWrite.status, 'failed');
});
test('v3272 B2 延期不丢：被拒批次回到挂起集合，等身份对上再落', async () => {
    const env = mkEnv('B');
    await env.saveFn.call(env.st, 'A', { graph: { tag: 'A1' }, summaries: [] });
    assert.equal(env.st._pendingWrites.size, 1, '被拒批次必须挂在待写集合里（延期不是丢弃）');
    const pending = env.st._pendingWrites.get('A');
    assert.ok(pending && pending.data && pending.data.graph.tag === 'A1', '挂着的就是那批数据本身');
    /* 身份回到 A：下一轮 save('A') 应当把挂起的 A 一起落下去 */
    const env2 = mkEnv('A');
    env2.st._pendingWrites = env.st._pendingWrites;
    const r = await env2.saveFn.call(env2.st, 'A', { graph: { tag: 'A2' }, summaries: [] });
    assert.equal(r, true, '身份对上后必须落地成功');
    assert.ok(env2.writes.length >= 1, '必须真的写了当前（A）会话');
    assert.ok(env2.writes.every(w => w.writtenChatId === 'A'), '写进去的 chatId 必须都是 A');
});
test('v3272 B3 同会话照旧：当前就是 A、请求存 A ⇒ 正常落地（不得误伤主流路径）', async () => {
    const env = mkEnv('A');
    const r = await env.saveFn.call(env.st, 'A', { graph: { n: 1 }, summaries: [] });
    assert.equal(r, true);
    assert.equal(env.writes.length, 1);
    assert.equal(env.writes[0].writtenChatId, 'A');
    assert.equal(env.st._confirmed.chatId, 'A');
});
test('v3272 B4 身份未知 ⇒ 放行（不拦未知，否则未就绪窗口丢写）', async () => {
    const env = mkEnv(null);   // 宿主未给 chatId / file_name
    const r = await env.saveFn.call(env.st, 'A', { graph: { n: 1 }, summaries: [] });
    assert.equal(r, true, '取不到当前身份时不得拒写');
    assert.equal(env.writes.length, 1, '照旧落地');
});
test('v3272 B5 ★ load 异会话：当前在 B、要载 A ⇒ 返回 null 且不得导入', async () => {
    const env = mkEnv('B');
    env.ctx.chatMetadata.extensions[STORAGE_KEY] = { data: { graph: { tag: 'B的档' } }, revision: 3 };
    let importedCalled = false;
    const prevWin = globalThis.window;
    globalThis.window = Object.assign({}, globalThis.window, {
        SillyTavern: { getContext: () => env.ctx },
        LonShaMemory: { engine: { restoreFromPayload: () => { importedCalled = true; }, _loadedChatId: null } }
    });
    try {
        const env2 = mkEnv('B');
        const r = await new Function('window', 'console', 'errLog', 'VERSION', 'PLUGIN_NAME',
            'return async function (chatId, opts) { ' + LOAD_BODY + ' }')(
            globalThis.window, { warn() {}, error() {}, log() {} }, () => {}, '3.272.0', 'T').call(env2.st, 'A', {});
        assert.equal(r, null, '★ 异会话 load 必须如实返回 null');
        assert.equal(importedCalled, false, '★ 不得把 B 的存档导进「请求 A」这条路径');
    } finally { globalThis.window = prevWin; }
});
test('v3272 B6 load 同会话 / 身份未知：行为与旧版一致', async () => {
    const env = mkEnv('A');
    env.ctx.chatMetadata.extensions[STORAGE_KEY] = { data: { graph: { tag: 'A的档' } }, revision: 5 };
    const env2 = mkEnv('A');
    const fn = new Function('window', 'console', 'errLog', 'VERSION', 'PLUGIN_NAME',
        'return async function (chatId, opts) { ' + LOAD_BODY + ' }')(
        { SillyTavern: { getContext: () => env.ctx } }, { warn() {}, error() {}, log() {} }, () => {}, '3.272.0', 'T');
    const r = await fn.call(env2.st, 'A', {});
    assert.deepEqual(r, { graph: { tag: 'A的档' } }, '同会话照旧把档交回');
    assert.equal(env2.st._revision, 5, '修订号仍随存档推进');
});
test('v3272 B7 revision 归本批：合流时后落盘的那批的 rev 与 chatId 成对', async () => {
    const env = mkEnv('A');
    const p1 = env.saveFn.call(env.st, 'A', { graph: { seq: 1 }, summaries: [] });
    const p2 = env.saveFn.call(env.st, 'A', { graph: { seq: 2 }, summaries: [] });
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(r1, true); assert.equal(r2, true);
    const diskRev = env.ctx.chatMetadata.extensions[STORAGE_KEY].revision;
    const last = env.writes[env.writes.length - 1];
    assert.equal(env.st._confirmed.chatId, last.writtenChatId, '确认的 chatId 与最后落盘批次同源');
    assert.equal(env.st._confirmed.revision, diskRev, '确认 rev 与磁盘上那一版的 rev 同源（原先把偏小的首调 rev 写进确认）');
});

/* ══════════════ C 负控制（真源码破坏 → 副本上重跑同款判据） ══════════════ */
const temps = [];
function mutate(tag, edits) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lonsha-v3272-' + tag + '-'));
    temps.push(dir);
    fs.copyFileSync(path.join(ROOT, ORG), path.join(dir, ORG));
    for (const [oldText, newText] of edits) {
        const p = path.join(dir, ORG);
        const src = fs.readFileSync(p, 'utf8');
        const n = src.split(oldText).length - 1;
        assert.equal(n, 1, '变异锚点须恰中 1 次：' + tag + '（实得 ' + n + '）');
        const next = src.replace(oldText, newText);
        assert.notEqual(next, src, '变异必须真的改了文件：' + tag);
        fs.writeFileSync(p, next);
    }
    return dir;
}
process.on('exit', () => { for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) {} } });
function bodyOf(dir, marker) { return extractBraced(fs.readFileSync(path.join(dir, ORG), 'utf8'), marker); }
function envOf(dir, curId) {
    const b = bodyOf(dir, SIG_SAVE);
    const ctx = { chatId: curId, chatMetadata: { file_name: curId, extensions: {} }, saveChat: async () => true };
    const win = { SillyTavern: { getContext: () => ctx }, LonShaMemory: { emergency: { save: async () => {} } } };
    const st = { STORAGE_KEY, _isWriting: false, _revision: 0, _confirmed: null, _lastWrite: null, _pendingWrites: new Map(), _mergedBatches: 0, _coalescedByChat: {}, _crossChatCoexists: 0, _lastMergedRevis: 0 };
    const fn = new Function('window', 'console', 'errLog', 'ARCHIVE_TOP_LEVEL_KEY_SET', 'STORAGE_FP_FIELDS', 'VERSION', 'PLUGIN_NAME',
        'return async function (chatId, data) { ' + b + ' }')(win, { warn() {}, error() {}, log() {} }, () => {}, new Set(['graph', 'summaries']), ['graph'], '3.272.0', 'T');
    return { st, fn, ctx };
}
test('v3272 C1 破坏「身份核验」⇒ B1 同款判据必须转红', async () => {
    const dir = mutate('c1', [['                    if (_liveChatId && curChatId !== null && curChatId !== undefined',
        '                    if (false && _liveChatId && curChatId !== null && curChatId !== undefined']]);
    const e = envOf(dir, 'B');
    const r = await e.fn.call(e.st, 'A', { graph: {}, summaries: [] });
    assert.notEqual(r, false, '★ 去掉核验后，异会话写必须回到「回 true」（实得 ' + r + '）');
    assert.ok(String(e.ctx.chatMetadata.extensions[STORAGE_KEY].chatId) === 'A', '★ 且真的把 A 写进了 B 的元数据（原病灶）');
    const ok = await mkEnv('B').saveFn.call(mkEnv('B').st, 'A', { graph: {}, summaries: [] });
    assert.equal(ok, false, '阳性对照：原件上同款判据必须为绿');
});
test('v3272 C2 破坏「延期回挂」⇒ B2 同款判据必须转红', async () => {
    const dir = mutate('c2', [['            if (_deferredBatches.length && (this._pendingWrites instanceof Map)) {',
        '            if (false && _deferredBatches.length && (this._pendingWrites instanceof Map)) {']]);
    const e = envOf(dir, 'B');
    await e.fn.call(e.st, 'A', { graph: { tag: 'A1' }, summaries: [] });
    assert.equal(e.st._pendingWrites.size, 0, '★ 去掉回挂后，被拒批次就真的丢了（实得 ' + e.st._pendingWrites.size + '）');
    const ok = mkEnv('B');
    await ok.saveFn.call(ok.st, 'A', { graph: { tag: 'A1' }, summaries: [] });
    assert.equal(ok.st._pendingWrites.size, 1, '阳性对照：原件上批次仍在');
});
test('v3272 C3 破坏「load 身份核验」⇒ B5 同款判据必须转红', async () => {
    const dir = mutate('c3', [['            if (_wantId && _nowId && _wantId !== String(_nowId)) {',
        '            if (false && _wantId && _nowId && _wantId !== String(_nowId)) {']]);
    const body = bodyOf(dir, SIG_LOAD);
    const ctx = { chatId: 'B', chatMetadata: { file_name: 'B', extensions: { [STORAGE_KEY]: { data: { ok: 1 }, revision: 1 } } } };
    const env = { STORAGE_KEY, _revision: 0 };
    const r = await new Function('window', 'console', 'errLog', 'VERSION', 'PLUGIN_NAME',
        'return async function (chatId, opts) { ' + body + ' }')(
        { SillyTavern: { getContext: () => ctx } }, { warn() {}, error() {}, log() {} }, () => {}, '3.272.0', 'T').call(env, 'A', {});
    assert.notEqual(r, null, '★ 去掉核验后异会话 load 会照旧把档交回来');
    const okEnv = mkEnv('B');
    okEnv.ctx.chatMetadata.extensions[STORAGE_KEY] = { data: { ok: 1 }, revision: 1 };
    const r2 = await new Function('window', 'console', 'errLog', 'VERSION', 'PLUGIN_NAME',
        'return async function (chatId, opts) { ' + LOAD_BODY + ' }')(
        { SillyTavern: { getContext: () => okEnv.ctx } }, { warn() {}, error() {}, log() {} }, () => {}, '3.272.0', 'T').call({ STORAGE_KEY, _revision: 0 }, 'A', {});
    assert.equal(r2, null, '阳性对照：原件上异会话 load 必须 null');
});
test('v3272 C4 变异工具两向自证', () => {
    assert.throws(() => mutate('c4a', [['不存在的锚点_zzz', 'x']]), /须恰中 1 次/);
    assert.throws(() => mutate('c4b', [['const STORAGE_KEY', 'x']]), /须恰中 1 次/);
});

/* ══════════════ D 版本锚（下限形） ══════════════ */
test('v3272 D1 版本锚（下限形）：三源同源且不低于 3.272.0', () => {
    const RE_V = new RegExp('^' + '[0-9]+' + '[.]' + '[0-9]+' + '[.]' + '[0-9]+');
    const vnum = (s) => { const m = RE_V.exec(String(s || '').trim()); return m ? Number(m[0].split('.')[0]) * 1000000 + Number(m[0].split('.')[1]) * 1000 + Number(m[0].split('.')[2]) : NaN; };
    const idx = read('index.js');
    const RE_VER = new RegExp('const VERSION = ' + String.fromCharCode(39) + '([0-9.]+)' + String.fromCharCode(39));
    const v = (RE_VER.exec(idx) || [])[1];
    const man = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    assert.ok(v, '入口版本常量在场');
    assert.equal(man.version, v, 'manifest 与入口同版');
    assert.equal(pkg.version, v, 'package 与入口同版');
    assert.ok(vnum(v) >= vnum('3.272.0'), '本套件自 3.272.0 起成立；当前 ' + v);
});
