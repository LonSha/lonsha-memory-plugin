#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""锚点唯一性预检：所有待改钻点在当前文件里必须恰中 1 次。"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
s = (ROOT / 'memory-organs.js').read_text(encoding='utf-8')

ANCHORS = [
    '            if (this._pendingWrites.size > 1) this._crossChatCoexists += 1;\n            return true;\n        }\n',
    '        let _persisted = 0, _writeErr = null;\n',
    '        const _liveChatId = _ctxIdOf();\n',
    '            let curChatId = chatId;\n            let curData = data;\n            let curRev = currentRev;\n            while (curData) {\n                try {\n',
    '                        _deferredBatches.push({ chatId: curChatId, data: curData, revision: curRev });\n                        this._lastDeferredAt = Date.now();\n                        this._deferredOldSessionCount = (Number(this._deferredOldSessionCount) || 0) + 1;\n                        errLog(',
    '                        if (!ctx.chatMetadata.extensions) ctx.chatMetadata.extensions = {};\n',
    '                        if (ctx.saveChat) _ret = await ctx.saveChat();\n',
    '                        } else {\n                            _persisted += 1;   // [v3.140] 真实落盘证据（写扩展位 + saveChat 均完成）\n',
    '                } catch (err) { _writeErr = String(err?.message || err); console.error',
    '        if (_persisted > 0) {\n            // [v3.166] 用实际最后落盘批次的修订号（原用首次调用的 currentRev，合流后滞后）\n',
    '        this._lastWrite = { status: \'failed\', chatId: String(chatId), revision: currentRev, ts: Date.now(), error: _writeErr || \'no persistence target (chatMetadata 不可用)\' };\n',
    '                    } else if (ctx?.chatMetadata) {\n',
    '        const _ctxIdOf = function () {\n',
    '                    const stat = (this._lastWrite && this._lastWrite.status) || null;\n',
]
bad = 0
for a in ANCHORS:
    n = s.count(a)
    flag = 'OK ' if n == 1 else '★★'
    if n != 1:
        bad += 1
    print('%s %2d  %r' % (flag, n, a[:78]))
print('--- 未通过：%d 处 ---' % bad)
sys.exit(1 if bad else 0)
