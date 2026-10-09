#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.302.0 · M-O1 第一刀：真实宿主下的会话身份写入闭环

修的**真实缺陷**（三条，均有可复现序列）：
  ① **await 之后不重核身份**：循环入口取一次 ctx，然后把数据写进 `ctx.chatMetadata`。
     取数与落点之间隔着本批唯一的**长 await**（摘要骤减紧急备份），落点之后又隔着
     `await ctx.saveChat()`。这两处 await 期间切聊（ST 走 `chat_metadata = {}`，
     见 clone 的 public/script.js 10 处，如 openCharacterChat L7748 —— 是**重新赋值**
     不是就地清空 ⇒ 旧引用脱钩），数据就写进了一个**已脱钩**的对象，而
     `ctx.saveChat()` 存的是**当前**会话 ⇒ 一个字节都没落地，却被计为落盘证据并
     推进 `_confirmed`（错档 + 假绿：`_confirmed` 指向一次从未发生的落盘，之后一路错档）。
     这一条纯 chatId 字符串比对看不出来（取数与被写是同一个旧对象，两边读到同一个
     file_name）⇒ 留存判据必须是「**这笔写入还留在当前 metadata 里吗**」。
  ② **队列级布尔冒充批次级回执**：`return true` 的条件是 `_persisted > 0`（整队有没有
     **任一批**落盘）而不是「**调用方那一批**落了」。于是 `save('A')`（A 不是当前会话、
     本批转延期）在别的批成功时拿到 true，调用方 `recordSaveFailed(src, ok === true)`
     记成「已保存」。这正是 M-O1 验收⑤「不得以『任一批成功』代表整队列成功」点名的形状。
  ③ **落盘证据无批次身份**：`_persisted` 只是计数，没有「调用方那一批为什么没落」的
     记录（M-O1 验收④要求能区分 queued / confirmed / deferred / denied / failed）。
     补 `_batch` 批次回执 + `this._lastBatch`。

本版是**第三稿**（前两稿的教训写在这里防复发）：
  · 第一稿把 `_curSlot / _curLiveId` 声明在 `const _liveChatId = _ctxIdOf();` **之后**
    —— 那是 TDZ 区：取数器第一次被调用（就是那一行）就抛 ReferenceError，被自己的
    `catch (_e) { return null; }` 吞掉 ⇒ **当前会话身份恒为 null ⇒ 身份核验整体失效**
    （v3272 B1 转红）。故本稿把两个可变读数一律声明在 `_ctxIdOf` **之前**。
  · 第二稿把 `_isEntry` 声明在 `try {` 块内，而 catch 块与循环外尾部也在用它
    —— 块级作用域 ⇒ ReferenceError（v3140 当场点出）。故本稿改成**声明在 try 之外**、
    赋值在 `try {` 内（函数作用域，三处都能读）。
  · 两稿共同教训：**改结构之前先把 try/catch/while 的花括号配平画清楚**，
    不要靠数 `}` 的个数。

纪律：
  · 锚点逐字相符、每处**恰中 1 次**，全部先校验后统一写盘；
  · **零新实例方法**（历史套件把 save 方法体抠进 new Function 重放，体内引用新方法必抛）；
  · **不引入新的自由标识符**（只用 window / console / errLog / VERSION / PLUGIN_NAME、
    this.*、方法作用域内先声明的局部量）；
  · 保留 v3272 判据与负控制依赖的字面量（`const _ctxIdOf = function () {`、
    `const _liveChatId = _ctxIdOf();`、第一查整行判据、`_deferredBatches.push(`）
    —— 口径只能一处，不为了新写法拆旧判据；
  · **`_crossChatCoexists` 的即时计数留在原处**（v3166 B2 断言它 ≥1，去掉会转红）：
    另加一条「曾经并存过」的记忆（`_lastCoexistSeen`），因为收尾时挂起集合已被排干。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
REL = 'memory-organs.js'
P = ROOT / REL
src = P.read_text(encoding='utf-8')
_OB0, _CB0 = src.count('{'), src.count('}')   # 基线花括号计数（净差对照用）

_edits = []


def sub(old, new, why):
    n = src.count(old)
    if n != 1:
        sys.exit('[patch3302a] 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点头=%r'
                 % (n, why, old[:200]))
    if old == new:
        sys.exit('[patch3302a] 同值替换等于没改：%s' % why)
    _edits.append((old, new, why))


# ══════ E1 合流分支：批次回执（M-O1 ④ queued 态）+ 并存记忆 ══════
sub(
    """            this._pendingWrites.set(_k, { chatId, data, revision: currentRev });
            this._lastMergedRevis = Math.max(this._lastMergedRevis, currentRev);
            if (this._pendingWrites.size > 1) this._crossChatCoexists += 1;
            return true;
        }
""",
    """            this._pendingWrites.set(_k, { chatId, data, revision: currentRev });
            this._lastMergedRevis = Math.max(this._lastMergedRevis, currentRev);
            /* [v3.302.0 M-O1] 「异 chat 并存」的**记忆**：
             *   即时计数在收尾时已经归零（写盘循环会把挂起集合排干），
             *   故在**发生过的那一刻**另记一笔，收尾诊断才有据可依。
             *   即时计数（`_crossChatCoexists`）留在原处不动 —— 它是 v3.166 的对外读数。 */
            if (this._pendingWrites.size > 1) {
                this._crossChatCoexists += 1;
                this._lastCoexistSeen = Math.max(Number(this._lastCoexistSeen) || 0, this._pendingWrites.size);
            }
            /* [v3.302.0 M-O1] 受理 ≠ 落盘：合流批次的**归宿**要可查（M-O1 ④ 要求区分
             *   queued / confirmed / deferred / denied / failed 五态）。此处只落回执，
             *   返回值仍按 v3.40 语义报「已受理」（既有套件按此断言，不得倒退）。 */
            this._lastBatch = { chatId: String(chatId), revision: currentRev, status: 'queued', reason: 'coalesced', at: Date.now() };
            return true;
        }
""",
    'E1 合流分支记 queued 回执 + 并存记忆')

# ══════ E2 批次回执对象 + 入口批承载量（函数作用域） ══════
sub(
    """        let _persisted = 0, _writeErr = null;
""",
    """        let _persisted = 0, _writeErr = null;
        /* [v3.302.0 M-O1] **批次回执**（调用方那一批，不是整队）：`_lastWrite` 回答
         *   「这一轮写盘整队怎么了」，`_lastBatch` 回答「**我请求保存的那一批**怎么了」。
         *   修前只有前者 ⇒ 延期批在别的批落盘时拿到的返回值是 true，调用方
         *   `recordSaveFailed(src, ok === true)` 把它记成「已保存」（M-O1 验收⑤）。 */
        const _batch = {
            chatId: (chatId === null || chatId === undefined) ? null : String(chatId),
            revision: currentRev, status: 'pending', reason: '', at: Date.now()
        };
        /* [v3.302.0 M-O1] 入口批判据的承载量：**声明在 try 之外**（catch 块与循环外
         *   收尾也在读它，块级作用域会让那两处 ReferenceError），赋值在 try 内。 */
        let _isEntry = false;
""",
    'E2 批次回执对象 + 入口批承载量')

# ══════ E3 取数器：追加「约定槽」读数（**声明顺序在取数器之前**，避开 TDZ） ══════
sub(
    """        const _ctxIdOf = function () {
            try {
                const _st = (typeof window !== 'undefined') ? window.SillyTavern : null;
                const _c = (_st && typeof _st.getContext === 'function') ? _st.getContext() : null;
                const _v = _c ? (_c.chatId || (_c.chatMetadata && _c.chatMetadata.file_name)) : null;
                return (_v === null || _v === undefined || String(_v) === '') ? null : String(_v);
            } catch (_e) { return null; }
        };
        const _liveChatId = _ctxIdOf();
""",
    """        const _sk = this.STORAGE_KEY;   /* [v3.302.0 M-O1] 取数器是普通函数，`this` 不指向实例 */
        /* [v3.302.0 M-O1] 下面三个**可变读数**必须声明在 `_ctxIdOf` 之前：
         *   取数器体内会给 `_curSlot` 赋值，而它的**第一次调用**就在紧随取数器定义
         *   之后的那一行 —— 若把声明放到那一行之后，首次调用就落在 TDZ 区、
         *   抛 ReferenceError 被取数器自己的 catch 吞掉，后果是
         *   **当前会话身份恒为 null ⇒ 身份核验整体失效**（第一稿实测踩过）。 */
        let _curLiveId = null;   /* 每个 await 之后的**重核**读数（M-O1 要的正是这个） */
        let _curSlot = null;     /* 当前 metadata 里那一格：第三查靠它判「写入还在不在」 */
        let _ctxW = null;        /* 第二查重取的 ctx（写盘落点），修前直接复用循环入口的 ctx */
        /* [v3.302.0 M-O1] 本批「已验证基线」：**第一查判定可以写**那一刻的当前会话身份。
         *   为什么二/三查不能再用「目标 vs 当前」这套**绝对**口径：那是第一查的专职判据，
         *   在这里重复一遍等于给同一件事加第二道锁 —— 会把第一查的**唯一性**抹平
         *   （v3272 C1 负控制：破坏第一查后异会话写必须回到「真写进 B 的元数据并回 true」，
         *   重复的绝对判据让它回不到原病灶形态），也会在同一 chat 的排干批上把
         *   同一件事重复报两遍。await 之后真正要问的是：
         *   「当前这个落点，还是我当初验过的那个会话吗」。 */
        let _writeBaseId = null;
        const _ctxIdOf = function () {
            try {
                const _st = (typeof window !== 'undefined') ? window.SillyTavern : null;
                const _c = (_st && typeof _st.getContext === 'function') ? _st.getContext() : null;
                const _v = _c ? (_c.chatId || (_c.chatMetadata && _c.chatMetadata.file_name)) : null;
                /* [v3.302.0 M-O1] 取数器顺带给出**约定槽**（当前 metadata 里那一格）：
                 *   第三查靠「槽里还是不是**本批**」判断写入有没有留在当前会话里 ——
                 *   这是唯一能识破「对象已脱钩」的读数（字符串身份此时读到的是同一个值）。
                 *   留存判据用**本批唯一标记** `_batchId`，不用「槽.chatId === 本批 chatId」：
                 *   异批写的就是同一格，同会话并发时 chatId 恰好相等，会把脱钩误判成留存。 */
                _curSlot = (_c && _c.chatMetadata && _c.chatMetadata.extensions)
                    ? (_c.chatMetadata.extensions[_sk] || null) : null;
                return (_v === null || _v === undefined || String(_v) === '') ? null : String(_v);
            } catch (_e) { return null; }
        };
        const _liveChatId = _ctxIdOf();
        _curLiveId = _liveChatId;
""",
    'E3 约定槽读数（声明在取数器之前）')

# ══════ E4 入口批（序号判据）+ 每批刷新重核读数 ══════
sub(
    """            let curChatId = chatId;
            let curData = data;
            let curRev = currentRev;
            while (curData) {
                try {
                    const ctx = window.SillyTavern?.getContext?.();
""",
    """            let curChatId = chatId;
            let curData = data;
            let curRev = currentRev;
            /* [v3.302.0 M-O1] 入口批 = 调用方那一批（批次回执只报它）；排干批 = 挂起集合里
             *   别人的批次（各有自己的调用方，返回值早就发过了）。用**序号**判定而不是
             *   布尔翻转：序号只依赖循环迭代次数，可核对、可断言，也不会被提前 continue
             *   或嵌套分支读错。 */
            let _round = 0;
            while (curData) {
                try {
                    _round += 1;
                    _isEntry = (_round === 1);
                    /* [v3.302.0 M-O1] 每一批开写前**重核**当前会话身份：M-O1 要的是
                     *   「每次 await 之后核验目标 chat / revision」，故重核点有三个
                     *   —— 循环入口（此处）、写入前、宿主 saveChat 之后。 */
                    _curLiveId = _ctxIdOf();
                    const ctx = window.SillyTavern?.getContext?.();
                    /* [v3.302.0 M-O1] **本批放行基线**：循环入口（第一查之前）拍下当前
                     *   会话身份。为什么要在**第一查之前**拍：二/三查问的是
                     *   「当前落点还是不是这一轮开始时的那个会话」——
                     *   若把基线拍在第一查**之后**的写盘分支里，基线就成了
                     *   「目标与当前相符」这个**结论**的副本，二查会变成第一查的第二次
                     *   复判，第一查的唯一性被抹平（v3272 C1 负控制当场转红：
                     *   破坏第一查后异会话写必须回到「真写进 B 的元数据并回 true」）。
                     *   拍在之前，则「破坏第一查」这一改动不会让二查产生额外拦截
                     *   —— 负控制要的正是「去掉核验就回到原病灶形态」。
                     *   当前身份未知 ⇒ 基线与判据都无从成立，二/三查一律放行。 */
                    _writeBaseId = (_curLiveId === null || _curLiveId === undefined) ? null : String(_curLiveId);
""",
    'E4 入口批序号判据 + 每批重核 + 放行基线')

# ══════ E5 第一查：延期时给入口批留状态 + 放行基线 ══════
#   ★ 锚点必须**带上 `} else if (ctx?.chatMetadata) {` 这一行**：本稿首版只锚到
#     上面那行 errLog 就收尾，替换串里又重写了一遍分支头 ⇒ 文件里凭空多出一个
#     同名 `} else if` （第二个恒等于死代码，且把真正的写盘分支挤成 unreachable）。
#     —— 这正是「补丁声称已修不等于已修」的第四形：锚点没吃下**结构行**。
sub(
    """                        _deferredBatches.push({ chatId: curChatId, data: curData, revision: curRev });
                        this._lastDeferredAt = Date.now();
                        this._deferredOldSessionCount = (Number(this._deferredOldSessionCount) || 0) + 1;
                        errLog(new Error('目标会话 ' + String(curChatId) + ' 不是当前会话 ' + String(_liveChatId) + '，本批延期不写'), 'DB.会话身份');
                    } else if (ctx?.chatMetadata) {
""",
    """                        _deferredBatches.push({ chatId: curChatId, data: curData, revision: curRev });
                        this._lastDeferredAt = Date.now();
                        this._deferredOldSessionCount = (Number(this._deferredOldSessionCount) || 0) + 1;
                        if (_isEntry) { _batch.status = 'deferred'; _batch.reason = 'target-not-current'; }
                        errLog(new Error('目标会话 ' + String(curChatId) + ' 不是当前会话 ' + String(_liveChatId) + '，本批延期不写'), 'DB.会话身份');
                    } else if (ctx?.chatMetadata) {
""",
    'E5 第一查回执')

# ══════ E6 第二查（写盘落点重取 + 重核）+ 第三查（await 之后脱钩）══════
sub(
    """                        if (!ctx.chatMetadata.extensions) ctx.chatMetadata.extensions = {};
                        const stats = {
                            nodes: curData?.graph?.nodes?.length || 0,
                            edges: curData?.graph?.edges?.length || 0,
                            summaries: Array.isArray(curData?.summaries?.summaries) ? curData.summaries.summaries.length : (Array.isArray(curData?.summaries) ? curData.summaries.length : 0),
                            ts: Date.now()
                        };
                        ctx.chatMetadata.extensions[this.STORAGE_KEY] = {
                            version: VERSION,
                            revision: curRev,   /* [v3.272.0 O1] 用**本批自己的**修订号：此前写循环外首调 rev，合流批会把自己记错 */
                            chatId: curChatId,
                            stats,
                            data: curData,
                            timestamp: Date.now()
                        };
                        // [v3.166] 宿主否认（明确 false）= 「我没存」。此时不得计入落盘证据：
                        //   旧实现无条件 _persisted += 1，等于替宿主宣布成功并推进确认。
                        let _ret;
                        if (ctx.saveChat) _ret = await ctx.saveChat();
                        else if (window.saveChat) _ret = await window.saveChat();
                        else _ret = true;   // 无 saveChat 钩子：扩展位写入本身即落地（原行为）
                        if (_ret === false) {
                            // 失败原因必须归因到「宿主否认」，否则会落到兜底文案
                            //   「chatMetadata 不可用」——把真实原因掩盖成环境问题。
                            _writeErr = '宿主 saveChat 返回 false（未落地）';
                            errLog(new Error(_writeErr), 'DB.落盘证据');
                        } else {
                            _persisted += 1;   // [v3.140] 真实落盘证据（写扩展位 + saveChat 均完成）
                            _lastPersistedRev = curRev;            // [v3.166] 实际落盘批次的修订号
                            _lastPersistedChatId = String(curChatId);   // [v3.166] 与之配对的 chat
                        }
""",
    """                        /* [v3.302.0 M-O1] **第二查**（写入前）：重取 ctx + 重核**落点身份**。
                         *   本批循环入口取 ctx 到写 ctx 之间隔着**本批第一个 await**
                         *   —— 上面那段摘要骤减紧急备份是这条路径上唯一的长 await，
                         *   期间切聊就会让 `ctx.chatMetadata` 指向**已脱钩**的旧对象。
                         *   判据是「**当前会话身份**还是不是本批开写前那个」（`_curLiveId`
                         *   vs `_bas`），**不是**「目标 chatId 等于基线」——
                         *   后者是第一查（目标 vs 当前）的复判，会把第一查的唯一性抹平
                         *   （v3272 C1 负控制当场转红）；前者问的是另一件事：
                         *   落点本身有没有在 await 期间被换掉。
                         *   用**本批局部量** `_bas` 而不复查那个跨批变量：循环每轮会把它
                         *   重写，同一批里跨 await 读到的必须是**本轮**的值。
                         *   身份未知（基线为 null）⇒ 放行。 */
                        const _bas = _writeBaseId;
                        _curLiveId = _ctxIdOf();
                        _ctxW = window.SillyTavern?.getContext?.() || ctx;
                        if (_bas !== null && String(_curLiveId) !== String(_bas)) {
                            /* 落点已经不是第一查放行时的那个会话 ⇒ 本批根本没写出去。 */
                            _deferredBatches.push({ chatId: curChatId, data: curData, revision: curRev });
                            this._lastDeferredAt = Date.now();
                            this._deferredOldSessionCount = (Number(this._deferredOldSessionCount) || 0) + 1;
                            if (_isEntry) { _batch.status = 'deferred'; _batch.reason = 'stale-before-write'; }
                            errLog(new Error('目标会话 ' + String(curChatId) + ' 的落点（' + String(_curLiveId) + '）已不是第一查放行时的会话（' + String(_writeBaseId) + '），本批延期不写'), 'DB.会话身份');
                        } else if (!_ctxW.chatMetadata) {
                            /* 落点本身不在（宿主未给 metadata）：按**失败**记账，不冒充「延期」
                             *   —— 延期是「等身份对上还能写」，这里等不来落点。 */
                            _writeErr = 'no persistence target (chatMetadata 不可用)';
                            if (_isEntry) { _batch.status = 'failed'; _batch.reason = _writeErr; }
                        } else {
                        if (!_ctxW.chatMetadata.extensions) _ctxW.chatMetadata.extensions = {};
                        const stats = {
                            nodes: curData?.graph?.nodes?.length || 0,
                            edges: curData?.graph?.edges?.length || 0,
                            summaries: Array.isArray(curData?.summaries?.summaries) ? curData.summaries.summaries.length : (Array.isArray(curData?.summaries) ? curData.summaries.length : 0),
                            ts: Date.now()
                        };
                        /* [v3.302.0 M-O1] 本批唯一标记 `_batchId`：第三查靠它回答「这笔写入
                         *   还留在当前 metadata 里吗」。不用「槽.chatId === 本批 chatId」
                         *   —— 异批写的就是同一格，同会话并发时 chatId 恰好相等，
                         *   会把「脱钩」误判成「留存」（假绿第三形）。 */
                        const _batchId = 'b' + String(curRev) + '-' + String(Math.random()).slice(2, 10);
                        _ctxW.chatMetadata.extensions[this.STORAGE_KEY] = {
                            version: VERSION,
                            revision: curRev,   /* [v3.272.0 O1] 用**本批自己的**修订号：此前写循环外首调 rev，合流批会把自己记错 */
                            chatId: curChatId,
                            batchId: _batchId,
                            stats,
                            data: curData,
                            timestamp: Date.now()
                        };
                        // [v3.166] 宿主否认（明确 false）= 「我没存」。此时不得计入落盘证据：
                        //   旧实现无条件 _persisted += 1，等于替宿主宣布成功并推进确认。
                        let _ret;
                        if (_ctxW.saveChat) _ret = await _ctxW.saveChat();
                        else if (window.saveChat) _ret = await window.saveChat();
                        else _ret = true;   // 无 saveChat 钩子：扩展位写入本身即落地（原行为）
                        /* [v3.302.0 M-O1] **第三查**（宿主 saveChat 之后）：saveChat 期间切聊 ⇒
                         *   这笔写进的是**已脱钩**对象，而 saveChat() 存的是**当前**会话
                         *   ⇒ 一个字节都没落地；旧实现只看 `_ret !== false` 就计证据 + 推进
                         *   确认（假绿，且 `_confirmed` 指向一次从未发生的落盘 → 之后一路错档）。
                         *   两条判据（任一成立即脱钩；两条都是**相对第一查放行基线**的，
                         *   不做「目标 vs 当前」的绝对重判 —— 那是第一查的专职判据，
                         *   在 await 之后重判一遍会把第一查的唯一性抹平，见二查处说明）：
                         *     ① 字符串身份离开了**放行时的那个会话**（切到别的会话）；
                         *     ② 约定槽里不再是**本批**（ST 切聊把 chat_metadata 重新赋值成 {}，
                         *        或同一会话里被别的写覆盖）—— 这条比对象身份比较更强，同时覆盖
                         *        「对象换了」与「对象没换但内容被换掉」。
                         *   基线为 null（第一查时身份未知）⇒ 两条都无从判定，一律放行
                         *   —— 不拦未知，否则未就绪窗口的写会被当成脱钩而丢。 */
                        _curLiveId = _ctxIdOf();
                        const _known = !!_writeBaseId;
                        const _switched = _known && String(_curLiveId) !== String(_writeBaseId);
                        const _detached = _known && String(_curSlot?.batchId || '') !== _batchId;
                        if (_ret === false) {
                            // 失败原因必须归因到「宿主否认」，否则会落到兜底文案
                            //   「chatMetadata 不可用」——把真实原因掩盖成环境问题。
                            _writeErr = '宿主 saveChat 返回 false（未落地）';
                            if (_isEntry) { _batch.status = 'denied'; _batch.reason = 'host-denied'; }
                            /* ★ 归因口径不动：v3.140 / v3.166 都断言 `_lastWrite.error`
                             *   说的是**发生了什么**（宿主返回 false / 抛了什么异常）。
                             *   批次归宿（denied/write-threw）另存 `entryReason`，
                             *   不许用它把人类可读的失败原因覆盖掉。 */
                            errLog(new Error(_writeErr), 'DB.落盘证据');
                        } else if (_switched || _detached) {
                            /* 写入没留在当前会话里 ⇒ **延期重写**（不是丢弃）：数据放回挂起集合，
                             *   等身份对上自然落盘。绝不推进 `_confirmed`（那正是错档的源头）。 */
                            _deferredBatches.push({ chatId: curChatId, data: curData, revision: curRev });
                            this._lastDeferredAt = Date.now();
                            this._deferredOldSessionCount = (Number(this._deferredOldSessionCount) || 0) + 1;
                            if (_isEntry) { _batch.status = 'deferred'; _batch.reason = _detached ? 'detached-after-await' : 'stale-after-await'; }
                            errLog(new Error('目标会话 ' + String(curChatId) + ' 的写入在 await 之后已脱钩（当前 ' + String(_curLiveId) + '），本批延期重写'), 'DB.会话身份');
                        } else {
                            _persisted += 1;   // [v3.140] 真实落盘证据（写扩展位 + saveChat 均完成）
                            _lastPersistedRev = curRev;            // [v3.166] 实际落盘批次的修订号
                            _lastPersistedChatId = String(curChatId);   // [v3.166] 与之配对的 chat
                            if (_isEntry) { _batch.status = 'confirmed'; _batch.reason = ''; }
                        }
                        }
""",
    'E6 第二查 + 落点 _ctxW + 第三查')

# ══════ E7 catch：入口批失败归因 ══════
sub(
    """                } catch (err) { _writeErr = String(err?.message || err); console.error('保存失败:', err); }
""",
    """                } catch (err) { _writeErr = String(err?.message || err); console.error('保存失败:', err);
                    /* [v3.302.0 M-O1] 抛错也必须**归因到入口批**：否则本批状态停在
                     *   'pending'，收尾处会被笼统写成 failed（分不出「宿主拒写」与
                     *   「路径上抛了异常」）。`entryReason` 只是**批次归宿**的字，
                     *   它不覆盖 `_lastWrite.error` —— 后者必须保留原始异常文本
                     *   （v3.140 断言 `error` 里能看到 'disk full'）。 */
                    if (_isEntry && _batch.status === 'pending') { _batch.status = 'failed'; _batch.reason = 'write-threw'; } }
""",
    'E7 catch 归因入口批')

# ══════ E8 尾部：批次回执落定 + 返回值只描述调用方那一批 ══════
sub(
    """        if (_persisted > 0) {
            // [v3.166] 用实际最后落盘批次的修订号（原用首次调用的 currentRev，合流后滞后）
            this._confirmed = { chatId: _lastPersistedChatId, revision: _lastPersistedRev, ts: Date.now() };
            this._lastWrite = {
                status: 'confirmed', chatId: _lastPersistedChatId, revision: _lastPersistedRev, ts: Date.now(),
                persisted: _persisted,
                // [v3.166] 可观测性：这一轮写盘合并了几批（同 chat）、是否出现过异 chat 并存
                mergedBatches: Number(this._mergedBatches) || 0,
                coalescedByChat: { ...(this._coalescedByChat || {}) },
                crossChatCoexists: Number(this._crossChatCoexists) || 0
            };
            return true;
        }
        this._lastWrite = { status: 'failed', chatId: String(chatId), revision: currentRev, ts: Date.now(), error: _writeErr || 'no persistence target (chatMetadata 不可用)' };
        console.warn(`[${PLUGIN_NAME}] ⚠ 保存未落地 (rev ${currentRev})：${this._lastWrite.error}`);
        return false;
""",
    """        /* [v3.302.0 M-O1] 批次回执落定 + **返回值只描述调用方那一批**。
         *   修前 `return true` 的条件是 `_persisted > 0`（整队有没有**任一批**落盘）
         *   —— 于是「我请求存 A」（A 不是当前会话、本批转延期）在别的批成功时拿到 true，
         *   调用方按 `ok === true` 记成已保存。这正是 M-O1 验收⑤ 禁止的形状。 */
        _batch.at = Date.now();
        if (_batch.status === 'pending') { _batch.status = 'failed'; _batch.reason = _batch.reason || _writeErr || 'unresolved'; }
        _batch.queuePersisted = _persisted;
        this._lastBatch = _batch;
        if (_persisted > 0) {
            // [v3.166] 用实际最后落盘批次的修订号（原用首次调用的 currentRev，合流后滞后）
            this._confirmed = { chatId: _lastPersistedChatId, revision: _lastPersistedRev, ts: Date.now() };
            this._lastWrite = {
                // 整队有落盘、但**本批**没跟上 ⇒ 'partial'（既不是 confirmed，也不是 failed）
                status: (_batch.status === 'confirmed') ? 'confirmed' : 'partial',
                chatId: _lastPersistedChatId, revision: _lastPersistedRev, ts: Date.now(),
                persisted: _persisted,
                // [v3.166] 可观测性：这一轮写盘合并了几批（同 chat）、是否出现过异 chat 并存
                mergedBatches: Number(this._mergedBatches) || 0,
                coalescedByChat: { ...(this._coalescedByChat || {}) },
                crossChatCoexists: Number(this._crossChatCoexists) || 0,
                coexistSeen: Number(this._lastCoexistSeen) || 0,
                // [v3.302.0 M-O1] 本批身份与归宿（面板「我这一批怎么了」的唯一读数）
                entryChatId: _batch.chatId, entryRevision: _batch.revision, entryStatus: _batch.status
            };
            if (_batch.status !== 'confirmed') {
                /* ★ 修前此处**无条件** `return true`（上面那个 if 只判了整队）。
                 *   修后：本批没落 ⇒ 如实 false。`error` 沿用 `_writeErr`
                 *   （归因口径不动 —— v3.140/v3.166 断言它说的是「发生了什么」），
                 *   批次归宿另由 `entryStatus` / `entryReason` 承载。 */
                this._lastWrite.error = _writeErr || _batch.reason || '本批未落盘（整队另有批次落盘）';
                this._lastWrite.entryReason = _batch.reason;
                console.warn(`[${PLUGIN_NAME}] ⚠ 本批未落盘（chatId=${String(_batch.chatId)}，${_batch.status}${_batch.reason ? '/' + _batch.reason : ''}）：整队另有 ${_persisted} 批落盘`);
                return false;
            }
            return true;
        }
        if (_batch.status === 'deferred') {
            /* 整队零落盘 + 本批**延期**（不是失败）：数据挂在待写集合里等身份对上。
             *   状态字仍用 'failed'（既有确认状态机与面板按此判「未落地」，口径不动），
             *   但 `entryStatus` / `entryReason` 与文案把「延期」与「真失败」分开 —— 两态不同形。 */
            this._lastWrite = { status: 'failed', chatId: String(chatId), revision: currentRev, ts: Date.now(), persisted: 0,
                error: '本批延期（目标会话不是当前会话，数据已挂起等待）',
                mergedBatches: Number(this._mergedBatches) || 0,
                coalescedByChat: { ...(this._coalescedByChat || {}) },
                crossChatCoexists: Number(this._crossChatCoexists) || 0,
                coexistSeen: Number(this._lastCoexistSeen) || 0,
                entryChatId: _batch.chatId, entryRevision: _batch.revision, entryStatus: 'deferred', entryReason: _batch.reason };
            console.warn(`[${PLUGIN_NAME}] ⏸ 保存延期 (rev ${currentRev}, chatId=${String(chatId)})：目标不是当前会话（${_batch.reason || 'unknown'}），已挂起不写`);
            return false;
        }
        _batch.reason = _batch.reason || _writeErr || 'no persistence target (chatMetadata 不可用)';
        this._lastWrite = { status: 'failed', chatId: String(chatId), revision: currentRev, ts: Date.now(), persisted: 0,
            error: _writeErr || 'no persistence target (chatMetadata 不可用)',
            entryReason: _batch.reason,
            mergedBatches: Number(this._mergedBatches) || 0,
            coalescedByChat: { ...(this._coalescedByChat || {}) },
            crossChatCoexists: Number(this._crossChatCoexists) || 0,
            coexistSeen: Number(this._lastCoexistSeen) || 0,
            entryChatId: _batch.chatId, entryRevision: _batch.revision, entryStatus: _batch.status };
        console.warn(`[${PLUGIN_NAME}] ⚠ 保存未落地 (rev ${currentRev})：${this._lastWrite.error}`);
        return false;
""",
    'E8 批次回执落定 + 本批返回值')

for old, new, why in _edits:
    src = src.replace(old, new, 1)

P.write_text(src, encoding='utf-8')

# ── 改后复核（双向） ──
NEW = [
    ("_batch.status = 'deferred'; _batch.reason = 'target-not-current';", 1, '第一查回执'),
    ("_batch.status = 'deferred'; _batch.reason = 'stale-before-write';", 1, '第二查回执'),
    ("_batch.status = 'deferred'; _batch.reason = _detached ? 'detached-after-await' : 'stale-after-await';", 1, '第三查回执'),
    ('this._lastBatch = _batch;', 1, '批次回执落定'),
    ("this._lastBatch = { chatId: String(chatId), revision: currentRev, status: 'queued'", 1, '合流回执'),
    ('const _ctxIdOf = function () {', 1, '取数器签名（v3272 判据依赖）'),
    ('const _liveChatId = _ctxIdOf();', 1, '取数器调用形态（v3272 判据依赖）'),
    ('let _curLiveId = null;', 1, '重核读数（声明在取数器之前）'),
    ('let _writeBaseId = null;', 1, '放行基线（相对判据的锚）'),
    ('_writeBaseId = (_curLiveId === null', 1, '放行基线赋值'),
    ('if (_bas !== null && String(_curLiveId) !== String(_bas)) {', 1, '第二查：落点身份 vs 基线'),
    ('const _known = !!_writeBaseId;', 1, '第三查相对判据（已知性）'),
    ('const _switched = _known && String(_curLiveId) !== String(_writeBaseId);', 1, '第三查相对判据（切换）'),
    ('let _curSlot = null;', 1, '约定槽读数（声明在取数器之前）'),
    ('let _isEntry = false;', 1, '入口批承载量（函数作用域）'),
    ('_isEntry = (_round === 1);', 1, '入口批序号判据赋值'),
    ('const _batchId = ', 1, '本批唯一标记'),
    ("String(_curSlot?.batchId || '') !== _batchId", 1, '第三查约定槽判据'),
    ('_ctxW = window.SillyTavern?.getContext?.() || ctx;', 1, '第二查重取落点'),
    ('if (_ctxW.saveChat) _ret = await _ctxW.saveChat();', 1, '落点 saveChat'),
    ('const _sk = this.STORAGE_KEY;', 1, '存储键局部量'),
    ("        _batch.reason = _batch.reason || _writeErr || 'no persistence target (chatMetadata 不可用)';", 1, '失败归因兜底'),
    ('this._lastCoexistSeen = Math.max(', 1, '并存记忆'),
    ('                    if (_liveChatId && curChatId !== null && curChatId !== undefined', 1, '第一查判据行（v3272 C1 负控制锚）'),
]
BAD = 0
for _needle, _want, _why in NEW:
    _n = src.count(_needle)
    if _n != _want:
        print('★★ 复核失败：%s 命中 %d 次（要求 %d）' % (_why, _n, _want))
        BAD += 1
GONE = [
    ('                        if (ctx.saveChat) _ret = await ctx.saveChat();', '旧 ctx 取数点'),
    ('                        ctx.chatMetadata.extensions[this.STORAGE_KEY] = {', '旧落点'),
]
for _needle, _why in GONE:
    if _needle in src:
        print('★★ 旧形态仍在：%s' % _why)
        BAD += 1
# 声明顺序自证：可变读数必须在取数器**之前**（防 TDZ 复发）
_i_decl = src.index('let _curLiveId = null;')
_i_decl2 = src.index('let _writeBaseId = null;')
_i_acc = src.index('const _ctxIdOf = function () {')
if _i_decl > _i_acc or _i_decl2 > _i_acc:
    print('★★ 声明顺序反了：可变读数必须声明在取数器之前（TDZ）')
    BAD += 1
# 绝对口径自证：`curChatId !== _liveChatId` 只许出现在**第一查**那一行
#   （二/三查若再用绝对口径，第一查的唯一性就被抹平：v3272 C1 负控制当场转红）
_n_abs = src.count('String(curChatId) !== String(_liveChatId)')
if _n_abs != 1:
    print('★★ 绝对口径重复：`String(curChatId) !== String(_liveChatId)` 出现 %d 次（要求 1，只在第一查）' % _n_abs)
    BAD += 1
# 结构自证：分支头不得被复制（首版实测：锚点没吃下结构行 ⇒ 多出一个同名 `} else if`）
_n_branch = src.count('} else if (ctx?.chatMetadata) {')
if _n_branch != 1:
    print('★★ 结构漂移：`} else if (ctx?.chatMetadata) {` 出现 %d 次（要求 1）' % _n_branch)
    BAD += 1
# 花括号净差自证：替换只许**增删成对**的花括号，括号净差必须与基线一致
#   （首版实测的第四个坑就是多出一个分支头 ⇒ 净差变了；这里把它变成硬断言）
_ob = src.count('{')
_cb = src.count('}')
if (_ob - _cb) != (_OB0 - _CB0):
    print('★★ 结构漂移：花括号净差 %d → %d（基线 %d）' % (_OB0 - _CB0, _ob - _cb, _OB0 - _CB0))
    BAD += 1
print('[patch3302a] 花括号 开=%d 闭=%d（基线 开=%d 闭=%d）' % (_ob, _cb, _OB0, _CB0))
# 作用域自证：`_isEntry` 声明必须在 `try {` 之前（catch / 尾部都要读它）
_i_entry = src.index('let _isEntry = false;')
_i_try = src.index('this._isWriting = true;')
if _i_entry > _i_try:
    print('★★ 作用域反了：_isEntry 必须声明在 try 之外')
    BAD += 1
print('[patch3302a] 完成：%d 处替换 / %s；复核未通过 %d 处' % (len(_edits), REL, BAD))
for _o, _n, w in _edits:
    print('   · ' + w)
sys.exit(1 if BAD else 0)