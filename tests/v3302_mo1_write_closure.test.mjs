/* ================================================================
 * tests/v3302_mo1_write_closure.test.mjs — v3.302.0 · M-O1（第一刀）
 * 真实宿主下的**会话身份写入闭环**
 *
 * 【修前实测的真缺陷（三条，均有可复现序列）】
 *   ① **await 之后不重核身份**。`save()` 在循环入口取一次 `ctx`，之后把数据写进
 *      `ctx.chatMetadata.extensions[STORAGE_KEY]`，再调 `ctx.saveChat()`。这两步之间
 *      各夹着一次 await（本批唯一的**长 await** 是摘要骤减紧急备份；落点之后是
 *      `await ctx.saveChat()` 本身）。期间切聊 —— ST 走 `chat_metadata = {}`
 *      （clone 的 public/script.js 10 处，如 openCharacterChat L7748，**重新赋值**
 *      而非就地清空）—— 旧引用立刻脱钩：数据写进了一个已脱离当前会话的对象，
 *      而 `saveChat()` 存的是**当前**会话 ⇒ **一个字节都没落地**，却被计为落盘证据、
 *      并把 `_confirmed` 推进到一次**从未发生**的落盘上（之后一路错档）。
 *      这一条**纯 chatId 字符串比对读不出来**：取数与被写是同一个旧对象，两边读到的
 *      `file_name` 完全一样。必须问「**这笔写入还留在当前 metadata 里吗**」。
 *   ② **队列级布尔冒充批次级回执**。`return true` 的条件是 `_persisted > 0`
 *      （整队有没有**任一批**落盘），不是「**调用方那一批**落了」。于是
 *      `save('A')`（A 不是当前会话 ⇒ 本批转延期）在别的批成功时拿到 **true**，
 *      调用方 `recordSaveFailed(src, ok === true)` 记成「已保存」。
 *      这正是 M-O1 验收⑤「不得以『任一批成功』代表整队列成功」点名的形状。
 *   ③ **落盘证据无批次身份**。`_persisted` 只是计数，没有「调用方那一批为什么没落」
 *      的记录（M-O1 验收④要求能区分 queued / confirmed / deferred / denied / failed）。
 *
 * 【覆盖】
 *   A 结构面（三处 await 之后都有核验读数 / 批次回执对象 / 零新实例方法 /
 *     绝对口径不得重复 / 声明顺序与作用域自证）
 *   B 行为面（★ 脱钩写不得计证据不得推进确认；★ 延期批不得因别批成功拿到 true；
 *     ★ 宿主否认与抛错都必须回 false 且归因不进 `error`；同会话照旧不误伤；
 *     身份未知放行；延期不丢；五态归宿可分辨）
 *   C 负控制（四条**真源码破坏** → 破坏副本上重跑同款判据 → 必须翻红；原件作阳性对照）
 *   D 判据纯度 + 版本锚 + 登记面
 *
 * 【边界（诚实）】
 *   本档用**合成宿主**（`getContext` 返回真对象 + 真切聊动作）证明底层边界成立，
 *   并配真源码破坏的负控制。它**不**证明真 SillyTavern 里的时序（那是真宿主 probe
 *   的活，读数另行留痕）；也**不**证明调用方 `recordSaveFailed` 侧的记账（另一档）。
 *
 * 【本版交付过程留痕（四处自伤，全部记在这里与补丁脚本头部）】
 *   ① **TDZ**：首版把 `_curSlot` / `_curLiveId` 声明在 `const _liveChatId = _ctxIdOf();`
 *      **之后** —— 取数器第一次被调用（正是那一行）就落在 TDZ 区抛 ReferenceError，
 *      被它自己的 `catch (_e) { return null; }` 吞掉 ⇒ **当前会话身份恒为 null ⇒
 *      身份核验整体失效**（v3272 B1 当场转红）。修法：可变读数一律声明在取数器之前。
 *   ② **块级作用域**：第二版把 `_isEntry` 声明在 `try {` **块内**，而 catch 块与
 *      循环外收尾也在读它 ⇒ `ReferenceError: _isEntry is not defined`（v3140 当场点出）。
 *      修法：声明在 try 之外（函数作用域），赋值在 try 内。
 *   ③ **锚点没吃下结构行**：E5 的锚点只吃到 `errLog(...)` 那行为止，替换串里又重写了
 *      一遍 `} else if (ctx?.chatMetadata) {` ⇒ 文件里凭空多出一个同名分支头
 *      （第二个恒为死代码，还把真正的写盘分支挤成 unreachable）。修法：锚点把**结构行**
 *      一起吃进来；并在补丁里把「分支头出现次数」与「花括号净差」做成硬断言。
 *   ④ **复判抹平第一查**：二/三查首版用了「目标 chatId vs 当前/基线」这套**绝对**口径，
 *      等于把第一查（目标 vs 当前）判第二遍 ⇒ v3272 C1 负控制再也回不到原病灶形态
 *      （破坏第一查后异会话写仍被二查拦住，拿不到 true）。修法：await 之后问的是**另一件事**
 *      ——「**当前会话身份**还是不是本批开写前那个」（`_curLiveId` vs 本批基线）。
 *
 * 【第二刀（排干批借用入口快照）——由本档 B2 配方当场逼出】
 *   第一刀做完，B2 的「A→await→B + 队列交错」实测出更坏的一条：写盘循环把**排干批**
 *   （挂起集合里别人的批次）写进**当前会话**的 metadata（`当前会话=B 槽.chatId=A`）。
 *   根因：第一查的第二条读的是**入口那次调用**的快照 —— 排干批没有属于自己的快照，
 *   于是「目标 A 挂在那儿、当前早已是 B」时判为相等 ⇒ 放行写盘（反向也坏：排干批本该写，
 *   却借用旧快照被判「目标不是当前会话」而误延期，实测整队零落盘）。
 *   修法：**每批就地重绑**第一查的比对对象（第一查前插一行把它绑到本批当下身份，
 *   块内 `const` 遮蔽方法入口那次捕获）。判据行与变量名配对**一个字未动**、**不新增判据**
 *   —— 多一道绝对锁会抹平第一查的唯一性（v3272 C1 回不到原病灶形态），
 *   改名会破 v3272 A1/C1 的逐字契约；两条错路都实测踩过。A2 与 C6 是本刀的判据载体。
 * ================================================================ */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { stripComments, braceMatch } from './_audit_lib.mjs';
import { breakSource } from './_break_kit.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(HERE, '..');
const NL = String.fromCharCode(10);
const MOD = 'memory-organs.js';
const MOD_PATH = path.join(ROOT, MOD);
const MOD_SRC = fs.readFileSync(MOD_PATH, 'utf8');
const SELF = fs.readFileSync(new URL(import.meta.url).pathname, 'utf8');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const req = createRequire(import.meta.url);
const MO = req(MOD_PATH);
const STORAGE_KEY = 'lonsha_memory';
/** 本档出生版本（自锚常量形）：抬版时只改这一处，下面的数值锁随之平移。 */
const CUR = '3.302.0';
const vnum = (v) => String(v).split('.').map((n) => parseInt(n, 10) || 0).reduce((a, b) => a * 1000 + b, 0);

/* ══════════════ 工具：真类 + 合成宿主 ══════════════ */
/** 花括号切方法体：真源 stripComments（等长占位、偏移不变）+ 真源 braceMatch 串联。 */
function bodyOf(marker, src = MOD_SRC) {
    const at = src.indexOf(marker);
    if (at < 0) return null;
    const open = at + marker.length - 1;
    const chunk = braceMatch(stripComments(src), open);
    return chunk == null ? null : src.slice(open + 1, open + chunk.length - 1);
}
const SIG_SAVE = 'async save' + '(' + 'chatId, data' + ')' + ' {';
const SAVE_BODY = bodyOf(SIG_SAVE);
assert.ok(SAVE_BODY, SIG_SAVE + ' 的方法体必须可提取');
/**
 * 合成宿主：`swap()` = 真切聊（**重新赋值** chat_metadata，与 ST 同形），
 * `metaObj` 保留旧对象引用以便判「写进的是不是已脱钩的那个」。
 */
function mkEnv(curId, opts = {}) {
    const writes = [];
    const ctx = {
        chatId: curId,
        chatMetadata: { file_name: curId, extensions: {} },
        saveChat: async () => {
            const slot = ctx.chatMetadata ? ctx.chatMetadata.extensions[STORAGE_KEY] : null;
            if (slot) writes.push({ slot, cur: ctx.chatMetadata.file_name });
            return opts.saveChatReturn === undefined ? true : opts.saveChatReturn;
        },
    };
    const win = { SillyTavern: { getContext: () => ctx }, LonShaMemory: { emergency: { save: async () => {} } } };
    const st = new MO.StorageManager();
    return { st, ctx, writes, win };
}
/** 在合成宿主上真调真类的 save（真模块装载，不是抠方法体重放）。 */
function bindEnv(env) {
    const prev = globalThis.window;
    globalThis.window = env.win;
    return {
        call: (chatId, data) => MO.StorageManager.prototype.save.call(env.st, chatId, data),
        restore: () => { globalThis.window = prev; },
    };
}
/* ══════════════ A. 结构面 ══════════════ */
test('v3302 A1 结构：三处 await 之后都有核验读数 + 批次回执对象 + 落点重取', () => {
    assert.ok(SAVE_BODY.includes('const _ctxIdOf = function () {'), '取数器须内联在 save 体内（零新方法）');
    assert.ok(SAVE_BODY.includes('const _liveChatId = _ctxIdOf();'), '调用那一刻的身份须当场捕获（v3272 判据）');
    assert.ok(SAVE_BODY.includes('let _curLiveId = null;'), '重核读数须声明（await 之后用它）');
    assert.ok(SAVE_BODY.includes('let _curSlot = null;'), '约定槽读数须声明（判「写入还在不在」）');
    /* ★ 声明顺序：可变读数必须在取数器定义**之前**（TDZ 自伤①的硬防线） */
    assert.ok(SAVE_BODY.indexOf('let _curLiveId = null;') < SAVE_BODY.indexOf('const _ctxIdOf = function () {'),
        '★ 可变读数必须声明在取数器之前（否则首次调用落 TDZ、身份恒为 null）');
    assert.ok(SAVE_BODY.indexOf('let _curSlot = null;') < SAVE_BODY.indexOf('const _ctxIdOf = function () {'),
        '★ 约定槽读数必须声明在取数器之前（同上）');
    /* 入口批判据：声明在 try 之外（自伤②的硬防线） */
    assert.ok(SAVE_BODY.includes('let _isEntry = false;'), '入口批承载量须在场');
    assert.ok(SAVE_BODY.indexOf('let _isEntry = false;') < SAVE_BODY.indexOf('this._isWriting = true;'),
        '★ 入口批承载量必须声明在 try 之外（catch 与收尾也要读它）');
    /* 三处重核点：循环入口 / 写入前 / saveChat 之后 */
    const nRecheck = (SAVE_BODY.match(/_curLiveId = _ctxIdOf\(\);/g) || []).length;
    assert.equal(nRecheck, 3, '重核点须恰三处（循环入口 / 写入前 / saveChat 之后），实得 ' + nRecheck);
    assert.ok(SAVE_BODY.includes('_ctxW = window.SillyTavern?.getContext?.() || ctx;'), '写入前须重取落点');
    assert.ok(SAVE_BODY.includes('if (_ctxW.saveChat) _ret = await _ctxW.saveChat();'), 'saveChat 须取自重取的落点');
    /* 批次回执 */
    assert.ok(SAVE_BODY.includes('const _batch = {'), '批次回执对象须在场');
    assert.ok(SAVE_BODY.includes("status: 'pending'"), '批次回执须有 pending 初态');
    assert.ok(SAVE_BODY.includes("status: 'queued'"), '合流分支须记 queued 归宿');
    assert.ok(SAVE_BODY.includes('this._lastBatch = _batch;'), '批次回执须落回实例读数');
    /* 零新实例方法：批次相关标识符不得成为类成员 */
    assert.equal(MOD_SRC.includes('    _batchOf('), false, '不得为 O1 新增方法');
});
test('v3302 A2 ★ 绝对口径不得重复：`目标 vs 当前` 只许第一查一处，且它读的是**本批**身份', () => {
    /* 「目标 chatId !== 当前身份」是第一查的专职判据，且**只许出现一次**：
     *   二/三查若也用它，等于把第一查判第二遍 ⇒ 负控制回不到原病灶形态（自伤④）。
     *   ★ 第二刀的关键：这条绝对口径的比对对象必须**每批重绑**成当下身份。
     *   第一查写在循环体内、载入的是循环入口刚重核过的那个读数（块内遮蔽入口快照），
     *   于是**排干批**用它自己那一刻的身份核验，而不是借用入口批的快照
     *   （借用即第二刀修的缺陷：目标挂在那儿、当前早已换人时判为相等 ⇒ 写错档）。 */
    const ABS = 'String(curChatId) !== ' + 'String(_liveChatId)';
    const n = (MOD_SRC.match(new RegExp(ABS.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
    assert.equal(n, 1, '★ 绝对口径出现 ' + n + ' 次（要求 1：只在第一查）');
    /* 反向：不得改用「重核读数」自己再判一遍（那不是同一条口径，且会抹平第一查唯一性） */
    const ALT = 'String(curChatId) !== ' + 'String(_curLiveId)';
    assert.equal(MOD_SRC.split(ALT).length - 1, 0, '★ 不得另造一个平行口径（会抹平第一查唯一性）');
    /* 每批重绑：第一查之前必须有一行把它绑到当下身份（块内遮蔽入口快照）。
     *   字面量从 NEG 表**派生**（判据纯度 H5：锚点字面量只准声明一次）。 */
    assert.ok(SAVE_BODY.includes(NEG.rebind),
        '★ 第一查的比对对象必须每批重绑（否则排干批借用入口快照 ⇒ 写错档/误延期）');
    const iRebind = SAVE_BODY.indexOf(NEG.rebind);
    const iAbs = SAVE_BODY.indexOf(ABS);
    assert.ok(iRebind >= 0 && iRebind < iAbs,
        '★ 重绑必须在第一查**之前**（实得 重绑=' + iRebind + ' / 第一查=' + iAbs + '）');
    /* 方法入口那次捕获仍在（v3272 A1 逐字依赖 `const _liveChatId = _ctxIdOf();`） */
    assert.ok(SAVE_BODY.includes('        const _liveChatId = _ctxIdOf();'),
        '方法入口快照须仍在场（既有套件逐字依赖）');
    assert.ok(SAVE_BODY.includes('        _curLiveId = _liveChatId;'),
        '入口快照须仍被读到（外层绑定不得变成死代码）');
    assert.ok(SAVE_BODY.includes('if (_bas !== null && String(_curLiveId) !== String(_bas)) {'),
        '第二查须问「当前身份还是不是本批基线」');
    assert.ok(SAVE_BODY.includes('const _switched = _known && String(_curLiveId) !== String(_writeBaseId);'),
        '第三查须问「当前身份还是不是放行基线」');
});
test('v3302 A3 分支结构完整：既有分支头恰一次、花括号净差与基线同', () => {
    /* 自伤③的硬防线：锚点漏吃结构行会让同名分支头凭空多出一个。 */
    const nBranch = (MOD_SRC.match(/\} else if \(ctx\?\.chatMetadata\) \{/g) || []).length;
    assert.equal(nBranch, 1, '★ `} else if (ctx?.chatMetadata) {` 须恰一次，实得 ' + nBranch);
    assert.ok(SAVE_BODY.includes('String(curChatId) !== ' + 'String(_liveChatId)'),
        '第一查判据行须在场（变量名配对与既有套件逐字一致）');
    /* 方法体必须能被真源 braceMatch 完整取到（花括号配平的间接证明） */
    assert.ok(braceMatch(stripComments(MOD_SRC), MOD_SRC.indexOf(SIG_SAVE) + SIG_SAVE.length - 1) != null,
        'save 方法体必须花括号配平（取到残段比取不到更危险）');
});
test('v3302 A4 ★ 两个 await 之间**恰隔一个 await**：插入点结构可证（把「两次 await 之间有没有读数」变成结构判据）', () => {
    /* 本档的核心命题是「await 之后必须重核」。B1 从行为上证明；
     *   A4 再从**结构**上把「两次 await 之间恰好隔着一个 await，且读数就落在它之后」钉住。
     *   为什么要钉：`await eb.save(...)`（摘要骤减紧急备份）与 `await _ctxW.saveChat()`
     *   是本批路径上仅有的两个 await，重核点必须在**两者之后**各有一个。
     *   这三条断言在原件上成立、在「摘掉一处重核」的破坏副本上不成立（见 C4）。 */
    const i0 = SAVE_BODY.indexOf('_curLiveId = _ctxIdOf();');                                    // 循环入口
    const i1 = SAVE_BODY.indexOf('await eb.save(curChatId,');                                    // 紧急备份
    const i2 = SAVE_BODY.indexOf('_curLiveId = _ctxIdOf();', i0 + 1);                            // 写入前
    const i3 = SAVE_BODY.indexOf('_ret = await _ctxW.saveChat()');                               // 宿主落盘
    const i4 = SAVE_BODY.indexOf('_curLiveId = _ctxIdOf();', i2 + 1);                            // saveChat 之后
    for (const [n, v] of [['入口重核', i0], ['紧急备份', i1], ['写入前重核', i2], ['宿主落盘', i3], ['落盘后重核', i4]]) {
        assert.ok(v >= 0, '★ ' + n + ' 的位置必须可定位');
    }
    assert.ok(i0 < i1 && i1 < i2 && i2 < i3 && i3 < i4,
        '★ 五个点必须按 入口重核 → 紧急备份 → 写入前重核 → 宿主落盘 → 落盘后重核 排开'
        + '（实得 ' + [i0, i1, i2, i3, i4].join(' / ') + '）');
});
/* ══════════════ B. 行为面 ══════════════ */
test('v3302 B1 ★★ await 之后切聊：写入没留在当前会话 ⇒ 不计证据、不推进确认、返回 false', async () => {
    /* 复现：save('A') 期间（`await saveChat()` 之内）metadata 被换成**另一个对象**。
     *   旧行为：`_ret !== false` ⇒ `_persisted += 1` ⇒ `_confirmed` 推进（**从未发生的落盘**）。
     *   本版：第三查发现「约定槽里已不是本批」⇒ 延期、不计证据、不推进确认、回 false。
     *   两个子场景都必须被抓到：
     *     (a) **切到别的会话**（ST 的 `chat_metadata = {}` 常态）；
     *     (b) **同名换对象**（chatId 仍是 A，但 metadata 是另一个对象）
     *         —— 这一条**纯 chatId 字符串比对读不出来**（取数与写入是同一个旧对象，
     *         两边读到的 file_name 一模一样），正是缺陷①「读不出来」的那个形状。 */
    for (const [tag, swap] of [
        ['切到别的会话', (c) => { c.chatMetadata = { file_name: 'B', extensions: {} }; c.chatId = 'B'; }],
        ['同名换对象（chatId 不变）', (c) => { c.chatMetadata = { file_name: 'A', extensions: {} }; }],
    ]) {
        const env = mkEnv('A');
        /* 本批的**谱系标记**：写进 data，再去「宿主真正会存下去的那一份」里找它 ——
         *   这是「一个字节有没有落地」的字节级证据，比任何状态字都硬。 */
        const mark = 'mo1-b1-' + String(Math.random()).slice(2, 8);
        const landed = [];   /* 宿主 saveChat 那一刻**当前**会话里的那一格（= 会被存盘的内容） */
        env.ctx.saveChat = async () => {
            swap(env.ctx);
            const cur = (env.ctx.chatMetadata.extensions || {})[STORAGE_KEY] ?? null;
            landed.push(cur === null ? '' : JSON.stringify(cur));
            return true;
        };
        const h = bindEnv(env);
        let r;
        try { r = await h.call('A', { graph: { mark }, summaries: [] }); } finally { h.restore(); }
        const t = tag + '：';
        assert.equal(r, false, '★ ' + t + '写入没落在当前会话 ⇒ 不得回 true');
        assert.equal(env.st._confirmed, null, '★ ' + t + '不得推进确认（那会指向一次从未发生的落盘）');
        assert.ok(!landed.some((s) => s.includes(mark)),
            '★ ' + t + '宿主存下去的那一份里**不得有本批数据**（字节级：实得 ' + JSON.stringify(landed) + '）');
        assert.equal(env.st._lastWrite.status, 'failed', t + '未落地须显式化');
        assert.equal(env.st._lastWrite.entryStatus, 'deferred', t + '归宿须是 deferred（不是笼统 failed）');
        assert.equal(env.st._lastWrite.entryReason, 'detached-after-await', t + '须点名脱钩形态');
        assert.ok(env.st._pendingWrites.get('A'), '★ ' + t + '脱钩批次必须回到挂起集合（延期不是丢弃）');
    }
});
test('v3302 B2 ★ 延期批不得因「别批落盘」拿到 true（M-O1 验收⑤）', async () => {
    /* 复现（这就是 M-O1 验收①点名的「A→await→B + A/B 队列交错」，可达且不靠人造语义）：
     *   ① 当前是 A，调用方请求 `save('A')` ⇒ 入口批 A 进写盘路径；
     *   ② 其 `await saveChat()` **挂起期间**切到 B，并且 B 上来了一个写请求
     *      ⇒ 它走合流分支排进队列（对外照旧回 true，v3.40 语义）；
     *   ③ 放行：A 的落盘目标已被换掉 ⇒ 本批延期；循环随后排干 B 那一批 ⇒ 真的落盘。
     *   旧行为：`return true` 只看 `_persisted > 0` ⇒ **A 的调用方拿到 true**，
     *   把一批「没写进去」的保存记成已保存（调用方 `recordSaveFailed(src, ok === true)` 即此形状）。
     *   本版：返回值只描述调用方那一批 ⇒ A 回 false、整队状态如实记 'partial'。 */
    const env = mkEnv('A');
    let release;
    const gate = new Promise((res) => { release = res; });
    const base = env.ctx.saveChat;
    let first = true;
    env.ctx.saveChat = async () => { if (first) { first = false; await gate; } return base(); };
    const h = bindEnv(env);
    let rs;
    try {
        const pA = h.call('A', { graph: { seq: 1 }, summaries: [] });      // 入口批 A
        await null;
        env.ctx.chatMetadata = { file_name: 'B', extensions: {} };          // ★ 切到 B（重新赋值）
        env.ctx.chatId = 'B';
        const pB = h.call('B', { graph: { seq: 2 }, summaries: [] });       // 合流排进队列
        release();
        rs = await Promise.all([pA, pB]);
    } finally { h.restore(); }
    assert.equal(rs[0], false, '★ A 的调用方必须回 false（旧行为回 true = 队列级布尔冒充批次级回执）');
    assert.equal(env.st._lastBatch.chatId, 'A', '批次回执须报**调用方那一批**的 chatId');
    assert.equal(env.st._lastBatch.status, 'deferred', '批次回执须如实记 deferred');
    assert.equal(env.st._lastWrite.status, 'partial', '整队另有批次落盘、本批没落 ⇒ 必须记 partial，不得冒充 confirmed');
    assert.ok(!(env.st._lastWrite.status === 'confirmed'), '整队状态不得冒充「本批已确认」');
});
test('v3302 B3 ★ 宿主否认 / 抛错：回 false、计不入证据、`error` 保留原始归因', async () => {
    const deny = mkEnv('A', { saveChatReturn: false });
    const h1 = bindEnv(deny);
    let r1;
    try { r1 = await h1.call('A', { graph: {}, summaries: [] }); } finally { h1.restore(); }
    assert.equal(r1, false, '宿主否认须回 false');
    assert.equal(deny.st._confirmed, null, '宿主否认不得推进确认');
    assert.equal(deny.st._lastWrite.entryStatus, 'denied', '归宿须是 denied');
    assert.match(String(deny.st._lastWrite.error), /未落地|false/, '★ `error` 必须保留人类可读的原始原因');

    const throwEnv = mkEnv('A');
    throwEnv.ctx.saveChat = async () => { throw new Error('disk full'); };
    const h2 = bindEnv(throwEnv);
    let r2;
    try { r2 = await h2.call('A', { graph: {}, summaries: [] }); } finally { h2.restore(); }
    assert.equal(r2, false, '抛错须回 false');
    assert.equal(throwEnv.st._confirmed, null, '抛错不得推进确认');
    assert.equal(throwEnv.st._lastWrite.entryStatus, 'failed', '归宿须是 failed');
    assert.equal(throwEnv.st._lastWrite.entryReason, 'write-threw', '归宿须点名「抛了异常」');
    assert.match(String(throwEnv.st._lastWrite.error), /disk full/, '★ `error` 必须保留原始异常文本');
});
test('v3302 B4 同会话主流路径不得误伤：正常落盘回 true 且确认按本批推进', async () => {
    const env = mkEnv('A');
    const h = bindEnv(env);
    let r;
    try { r = await h.call('A', { graph: { n: 1 }, summaries: [] }); } finally { h.restore(); }
    assert.equal(r, true, '同会话正常落盘须回 true');
    assert.equal(env.st._confirmed.chatId, 'A', '确认须指向本批');
    assert.equal(env.st._confirmed.revision, env.ctx.chatMetadata.extensions[STORAGE_KEY].revision,
        '确认 rev 须与磁盘那一版同源');
    assert.equal(env.st._lastBatch.status, 'confirmed', '批次回执须记 confirmed');
    assert.equal(env.st._lastWrite.status, 'confirmed', '整队状态须 confirmed');
});
test('v3302 B5 身份未知 ⇒ 放行（不拦未知，否则未就绪窗口丢写）', async () => {
    const env = mkEnv(null);
    const h = bindEnv(env);
    let r;
    try { r = await h.call('A', { graph: { n: 1 }, summaries: [] }); } finally { h.restore(); }
    assert.equal(r, true, '取不到当前身份时不得拒写');
    assert.equal(env.st._confirmed.chatId, 'A', '身份未知仍须正常推进确认');
});
test('v3302 B6 合流批的归宿可查（queued）且返回值仍按 v3.40 语义报「已受理」', async () => {
    const env = mkEnv('c1');
    /* 让首个批次停在 await 上（宿主 saveChat 挂起）⇒ 后续同 chat 的 save 必然走合流分支。
     *   为什么不用「连发 4 次」：`this._isWriting` 在**同步段内**不释放，4 次同 tick 的调用
     *   只有第一次会进入写盘路径，其余全走合流 —— 但那样 **`_lastBatch` 会被合流分支最后写一次**，
     *   读到的确实是 queued，却证明不了「合流批的归宿」在真实交错下的样子。
     *   这里让写盘批真的停在 await 上，交错是**真的**。 */
    let release;
    const gate = new Promise((res) => { release = res; });
    const base = env.ctx.saveChat;
    env.ctx.saveChat = async () => { await gate; return base(); };
    const h = bindEnv(env);
    let rs;
    try {
        const p1 = h.call('c1', { graph: { seq: 1 }, summaries: [] });   // 停在 await
        await null; await null;                                        // 让它进到写盘路径
        const rQueued = await h.call('c1', { graph: { seq: 2 }, summaries: [] });  // 合流
        const q = env.st._lastBatch;
        release();
        rs = [await p1];
        assert.equal(rQueued, true, '合流分支对外仍回 true（写请求已受理，v3.40 语义不得倒退）');
        assert.ok(q, '合流时也必须有批次回执');
        assert.equal(q.status, 'queued', '合流的归宿字须是 queued');
        assert.equal(q.reason, 'coalesced', '须点名「被合流」');
        assert.equal(String(q.chatId), 'c1', '回执须报合流批自己的 chatId');
    } finally { h.restore(); }
    assert.equal(rs[0], true, '写盘批照旧回 true');
    assert.equal(env.st._lastWrite.status, 'confirmed', '整队最终确实落盘 ⇒ 整队状态 confirmed');
});
/* ══════════════ C. 负控制（真源码破坏 → 破坏副本上重跑同款判据） ══════════════ */
/* 【判据纯度 H5】破坏用到的**锚点字面量只在本表声明一次**（C 段与 D1 一律引用本表，
 *   不得复述字面量）—— 防自我指涉：判据自己去引用「被破坏的那段源码」就会跟着变形。 */
const NEG = {
    detached: "const _detached = _known && String(_curSlot?.batchId || '') !== _batchId;",
    queueStatus: "                status: (_batch.status === 'confirmed') ? 'confirmed' : 'partial',",
    entryRet: "if (_batch.status !== 'confirmed') {",
    /* 下面几条**必须写成含真换行的模板字面量**：D1 的判据纯度检查拿它的值去数 SELF 里的出现
     *   次数，若写成 `'...' + NL` 拼装，那个值在文件里根本不存在（计数 0 ⇒ 判据自伤）。 */
    baseDecl: `        let _writeBaseId = null;
`,
    ctxCall: `        const _liveChatId = _ctxIdOf();
`,
    recheck: `                    _curLiveId = _ctxIdOf();
                    const ctx = window.SillyTavern?.getContext?.();`,
    entryFlag: `        let _isEntry = false;
`,
    /* [第二刀] 每批重绑行：第一查的比对对象按本批当下身份重绑（块内遮蔽入口快照）。
     *   本项是**第二刀的枢轴**——摘掉它，第一查就退回「借用入口批快照」的形状。 */
    rebind: `                    const _liveChatId = _curLiveId;
`,
};
const temps = [];
function mkBroken(edits) {
    let src = MOD_SRC;
    for (const [anchor, repl, label] of edits) src = breakSource(src, anchor, repl, label);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'v3302-'));
    temps.push(dir);
    const file = path.join(dir, MOD);
    fs.writeFileSync(file, src);
    for (const k of Object.keys(req.cache)) delete req.cache[k];
    return req(file);
}
process.on('exit', () => { for (const d of temps) { try { fs.rmSync(d, { recursive: true, force: true }); } catch (_e) {} } });
test('v3302 C1 ★ 破坏「约定槽判据」⇒ B1 同款判据必须翻红（脱钩写被计成落盘证据）', async () => {
    /* 破坏的是第三查里**唯一识破脱钩**的那条判据（约定槽里还是不是本批）。
     *   为什么必须用「**同名换对象**」这个场景用力：在「切到别的会话」的场景里，
     *   破坏掉本判据后仍有 `_switched`（字符串身份变了）兜住 ⇒ 拿不到 true，
     *   负控制会**假红**（它证明的是另一条判据在场，而不是这一条）。
     *   同名换对象时 chatId 仍是 A、字符串身份一模一样 —— 只有约定槽判据能识破。 */
    const B = mkBroken([[NEG.detached, 'const _detached = false;', 'C1-摘掉约定槽判据']]);
    const mark = 'mo1-c1-' + String(Math.random()).slice(2, 8);
    const env = mkEnv('A');
    env.ctx.saveChat = async () => {
        env.ctx.chatMetadata = { file_name: 'A', extensions: {} };   // 同名换对象
        return true;
    };
    const prev = globalThis.window;
    globalThis.window = env.win;
    let r;
    try { r = await B.StorageManager.prototype.save.call(env.st, 'A', { graph: { mark }, summaries: [] }); }
    finally { globalThis.window = prev; }
    const landed = JSON.stringify((env.ctx.chatMetadata.extensions || {})[STORAGE_KEY] ?? null);
    assert.equal(landed.includes(mark), false, '（前提：宿主存下去的那一份里确实没有本批数据）');
    assert.equal(r, true, '★ 摘掉约定槽判据后，脱钩写会回到「回 true」（实得 ' + r + '）');
    assert.ok(env.st._confirmed, '★ 且会把确认推进到一次从未发生的落盘上（原病灶）');
    /* 阳性对照：**同一个配方**在原件上必须为绿（否则本负控制证明不了判据的效力） */
    const ok = mkEnv('A');
    ok.ctx.saveChat = async () => {
        ok.ctx.chatMetadata = { file_name: 'A', extensions: {} };
        return true;
    };
    const prev2 = globalThis.window;
    globalThis.window = ok.win;
    let r2;
    try { r2 = await MO.StorageManager.prototype.save.call(ok.st, 'A', { graph: { mark }, summaries: [] }); }
    finally { globalThis.window = prev2; }
    assert.equal(r2, false, '阳性对照：**同配方**在原件上必须回 false');
    assert.equal(ok.st._confirmed, null, '阳性对照：原件上不得推进确认');
});
test('v3302 C2 ★ 破坏「批次回执」⇒ B2 同款判据必须翻红（延期批拿到 true）', async () => {
    /* 同一份配方（A→await→B + 队列交错），破坏「返回值只看整队」这一条：
     *   把「本批没落 ⇒ false」这一道闸摘掉（`if (false) {` = 无条件往下走 return true），
     *   A 的调用方就回到旧行为拿到 true。 */
    const B = mkBroken([[NEG.entryRet, 'if (false) {', 'C2-按整队判定回 true']]);
    const prev = globalThis.window;
    const mk = async (M) => {
        const env = mkEnv('A');
        let release;
        const gate = new Promise((res) => { release = res; });
        const base = env.ctx.saveChat;
        let first = true;
        env.ctx.saveChat = async () => { if (first) { first = false; await gate; } return base(); };
        globalThis.window = env.win;
        const pA = M.StorageManager.prototype.save.call(env.st, 'A', { graph: { seq: 1 }, summaries: [] });
        await null;
        env.ctx.chatMetadata = { file_name: 'B', extensions: {} };
        env.ctx.chatId = 'B';
        const pB = M.StorageManager.prototype.save.call(env.st, 'B', { graph: { seq: 2 }, summaries: [] });
        release();
        const rs = await Promise.all([pA, pB]);
        globalThis.window = prev;
        return { rs, env };
    };
    let out;
    try { out = await mk(B); } finally { globalThis.window = prev; }
    assert.equal(out.rs[0], true, '★ 摘掉「本批没落 ⇒ false」这道闸后，A 的调用方会回到「拿到 true」（实得 ' + out.rs[0] + '）');
    assert.equal(out.env.st._lastBatch.status, 'deferred', '（前提：本批归宿确实是 deferred）');
    /* 阳性对照：**同配方**在原件上必须为绿 */
    const ok = await mk(MO);
    assert.equal(ok.rs[0], false, '阳性对照：**同配方**在原件上 A 必须回 false');
});
test('v3302 C3 ★ 破坏「声明顺序」（把基线声明挪到取数器之后）⇒ A1 的顺序判据必须能读到「反了」', () => {
    /* 本测试用到的字面量一律从 NEG 表**派生**（判据纯度 H5：锚点字面量只准声明一次，
     *   在这里复述一遍就变成两份真源，改一处漏一处）。 */
    const BD = NEG.baseDecl.replace(NL, '');
    const CC = NEG.ctxCall.replace(NL, '');
    const CALL = 'const _ctxIdOf = function () {';
    const shifted = breakSource(MOD_SRC, NEG.baseDecl, '', 'C3-摘掉基线声明');
    const shifted2 = breakSource(shifted, NEG.ctxCall, NEG.baseDecl + NEG.ctxCall, 'C3-挪到调用之后');
    assert.ok(shifted2.indexOf(BD) > shifted2.indexOf(CALL),
        '★ 破坏副本里声明确实落到了取数器之后（负控制的着力点成立）');
    /* 同款判据（A1 里那条「声明在取数器之前」）在破坏副本上必须**不再成立** */
    const bodyB = bodyOf(SIG_SAVE, shifted2);
    assert.ok(bodyB.indexOf(BD) > bodyB.indexOf(CALL),
        '★ A1 同款判据在破坏副本上翻红（原件上为绿）');
    assert.ok(SAVE_BODY.indexOf(BD) < SAVE_BODY.indexOf(CALL),
        '阳性对照：原件上该判据为绿');
});
test('v3302 C4 ★ 破坏「重核点」⇒ A4 的插入点序必须翻红（两次 await 之间的读数被摘掉）', () => {
    const RC = NEG.recheck.split(NL)[0];
    const RECALL = '_curLiveId = ' + 'ctxIdOf();'.replace('ctxIdOf', '_ctxIdOf');
    const broken = breakSource(MOD_SRC, NEG.recheck, NEG.recheck.split(NL).pop(), 'C4-摘掉循环入口重核');
    const body = bodyOf(SIG_SAVE, broken);
    const n = (body.split(RECALL).length - 1);
    assert.equal(n, 2, '★ 摘掉一处重核后只剩 2 处（A1 要求恰 3）—— 实得 ' + n);
    /* A4 同款判据：摘掉入口重核后，「入口重核 → 紧急备份 → 写入前重核」这条序不再成立 */
    const j0 = body.indexOf(RECALL);
    const j1 = body.indexOf('await eb.save(curChatId,');
    const j2 = body.indexOf(RECALL, j0 + 1);
    const j3 = body.indexOf('_ret = await _ctxW.saveChat()');
    const j4 = body.indexOf(RECALL, j2 + 1);
    assert.ok(!(j0 < j1 && j1 < j2 && j2 < j3 && j3 < j4), '★ A4 同款序判据在破坏副本上必须不成立');
    assert.ok(RC.length > 0, '（破坏锚点取自 NEG 表首行）');
    const okN = (SAVE_BODY.split(RECALL).length - 1);
    assert.equal(okN, 3, '阳性对照：原件上恰 3 处');
});
test('v3302 C6 ★ 破坏「每批重绑」⇒ 第二刀的同款行为判据必须翻红（排干批退回借用入口快照）',
    async () => {
        /* 第二刀的枢轴：把每批重绑那一行摘掉 ⇒ 第一查退回「载入方法入口那次快照」的形状。
         *   这正是 v3.272 修掉的**排队路径错档**在队列上的原型，本档 B2 的配方必须能识破。
         *   判据（同一份配方，跑在破坏副本与原件上）：
         *     ① 破坏副本上：入口批 A 的落点已被换掉、B 那批挂进队列 ⇒ 排干时
         *        「目标 B vs 入口快照 A」不相等 ⇒ B 被**误延期**、整队零落盘；
         *     ② 原件上：排干批用它自己那一刻的身份核验 ⇒ B 正常落盘、整队 confirmed。
         *   为什么不能只断言「返回值不同」：还要看**落地证据**（宿主存下去的那一份里有没有 B）。 */
        const B = mkBroken([[NEG.rebind, '', 'C6-摘掉每批重绑']]);
        const mk = async (M) => {
            const env = mkEnv('A');
            let release;
            const gate = new Promise((res) => { release = res; });
            const base = env.ctx.saveChat;
            let first = true;
            env.ctx.saveChat = async () => { if (first) { first = false; await gate; } return base(); };
            const prev = globalThis.window;
            globalThis.window = env.win;
            let rs;
            try {
                const pA = M.StorageManager.prototype.save.call(env.st, 'A', { graph: { seq: 1 }, summaries: [] });
                await null;
                env.ctx.chatMetadata = { file_name: 'B', extensions: {} };   // 切到 B
                env.ctx.chatId = 'B';
                const pB = M.StorageManager.prototype.save.call(env.st, 'B', { graph: { seq: 2 }, summaries: [] });
                release();
                rs = await Promise.all([pA, pB]);
            } finally { globalThis.window = prev; }
            return { rs, env };
        };
        const broken = await mk(B);
        /* 破坏副本：排干批 B 借用入口快照 A ⇒ 判「目标不是当前会话」⇒ 零落盘 */
        assert.equal(broken.env.st._lastWrite.status, 'failed',
            '★ 摘掉重绑后，排干批会被误延期 ⇒ 整队零落盘（实得 ' + broken.env.st._lastWrite.status + '）');
        assert.ok(!broken.env.st._confirmed, '★ 破坏副本上不得有确认推进（B 根本没落盘）');
        /* 阳性对照：**同配方**在原件上排干批必须真的落盘 ——
         *   注意整队状态此时是 'partial' 而**不是** 'confirmed'：入口批 A 的落点被换掉了
         *    ⇒ 它如实记账为 deferred，只有排干批 B 落了（这正是 M-O1 验收⑤ 要的形状：
         *    整队状态与批次回执分开，谁没落谁自己说）。故这里断言的不是整队字面，
         *    而是**落地证据**：确认指向 B、且 B 的数据确实被宿主存下去了。 */
        const ok = await mk(MO);
        assert.equal(ok.env.st._lastWrite.status, 'partial',
            '阳性对照：入口批被延期、排干批落盘 ⇒ 整队须如实记 partial');
        assert.equal(String(ok.env.st._confirmed.chatId), 'B', '阳性对照：确认须指向真正落盘的那一批（B）');
        assert.equal(ok.env.st._lastBatch.status, 'deferred',
            '阳性对照：批次回执仍只描述**调用方那一批**（入口批 A 延期）');
    });
test('v3302 C5 破坏工具两向自证 + 本档破坏锚点皆为真源码', () => {
    assert.throws(() => breakSource(MOD_SRC, 'const 不存在的锚点ZZZ = 1;', 'x', 'C5'), /命中 0 次|恰中 1 次|拒绝破坏/);
    assert.throws(() => breakSource(MOD_SRC, 'class ', 'x', 'C5'), /恰中 1 次|要求恰好 1 次|拒绝破坏/);
    assert.throws(() => breakSource(MOD_SRC, NEG.entryFlag, NEG.entryFlag, 'C5'), /必须真的改变源码|拒绝破坏/);
});
/* ══════════════ D. 判据纯度 + 版本锚 + 登记面 ══════════════ */
test('v3302 D1 判据纯度（H5）：锚点字面量只此一处声明 + 破坏走真源库与真模块装载', () => {
    /* 判据纯度：C 段的破坏必须走 breakSource（真源码破坏），不得自造常量假装破坏。 */
    assert.ok(SELF.includes("from './_break_kit.mjs'"), '负控制必须用唯一真源破坏库');
    for (const [k, a] of Object.entries(NEG)) {
        assert.equal(SELF.split(a).length - 1, 1, '锚点字面量只准声明 1 次（判据纯度，防自我指涉）：' + k);
    }
    assert.match(SELF, /fs\.writeFileSync\(file, src\)/, '破坏必须落盘成真文件');
    assert.match(SELF, /return req\(file\);/, '破坏副本必须用真模块装载（不是抠方法体重放）');
    assert.ok(!/function\s+breakSource/.test(SELF), '不得在判据里自带第二份破坏实现');
});
test('v3302 D2 版本锚（自锚常量形）+ 三源同源', () => {
    const idx = read('index.js');
    const man = JSON.parse(read('manifest.json'));
    const pkg = JSON.parse(read('package.json'));
    const v = /const VERSION = '([\d.]+)'/.exec(idx)?.[1];
    assert.ok(v, '入口版本常量在场');
    assert.equal(man.version, v, 'manifest 与入口同版');
    assert.equal(pkg.version, v, 'package 与入口同版');
    assert.equal(vnum(CUR), vnum(v), '本档自锚常量须等于当版');
    assert.ok(vnum(v) >= vnum('3.302.0'), '本套件自 3.302.0 起成立；当前 ' + v);
});
test('v3302 D3 登记面：本档须在参考基准 tsv 里留痕', () => {
    const tsv = read('tests/audit/catalog_reference_consumers.tsv');
    assert.ok(tsv.includes('v3302_mo1_write_closure.test.mjs'), '本档须登记在 catalog_reference_consumers.tsv');
    const reg = read('tests/v3247_break_kit_consolidation.test.mjs');
    assert.ok(reg.includes("'v3302_mo1_write_closure.test.mjs'"), '本档须登记进 v3247 REGISTRY（B1 台账纪律）');
});
