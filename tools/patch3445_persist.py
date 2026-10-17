#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.345.0 M4-X7 收口补丁:把 returnGate 状态真正接进 worldProg 的持久化/回滚面。

为什么必须补(不是整洁性偏好,是**功能级失效**):
  宿主 returnGateMark / returnGatePrefer 把状态写在 `worldProg.returnGate` 上,
  index.js 注释明写「状态存 worldProg.returnGate(跨会话携带)」。
  但 WorldProgress.export() / import() 的子键是**逐项枚举**的 ——
  returnGate 不在表里 ⇒ 存盘即丢、读档即空 ⇒ 「跨会话携带」是**假声明**;
  删楼面同样:marks 带 floor,不随回滚清理 ⇒ 被删楼层的冷却命中会永久留着,
  把该条旧事在 REPEAT_WINDOW 内**永久 held**(消费者收不到、且查不出原因)。

三处落点(全在 memory-organs.js · class WorldProgress 内):
  1 constructor:`this.returnGate = null;`(与 recallEcho / echoLedger 同格式声明)
  2 export():`returnGate: this.returnGate || null,`
  3 import():`this.returnGate = (data.returnGate && typeof data.returnGate === 'object') ? data.returnGate : null;`
     —— 与 volumeContinuationRead 同款「畸形回落」(不抛、不半截)
  4 removeByFloor(floor):摘除该楼 marks(floor 精确命中的整条摘除)、
     shiftFloorRefs(deleted):对 > deleted 的 marks.floor 前移
     —— 与 promises / active 同款楼层生命周期处置(不新造机制)

幂等:锚点必须恰中 1 次,已打过补丁则整段跳过(重复执行必须零改写)。
用法:python3 tools/patch3445_persist.py [--check]
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin/'
TARGET = ROOT + 'memory-organs.js'

CHECKS = []


def patch(src, anchor, replacement, label, count=1, sig=None):
    """定点替换。★ `sig` 是**替换结果的唯一签名**:已出现过 ⇒ 认定「本处已打过」并跳过
    (不让「已打过」与「打偏」都表现为 0 次 —— 这两种要能分辨)。"""
    if sig and sig in src:
        return src
    n = src.count(anchor)
    if n != count:
        CHECKS.append('FAIL %s: 锚点命中 %d 次(应 %d)' % (label, n, count))
        return src
    out = src.replace(anchor, replacement, count)
    if out == src:
        CHECKS.append('FAIL %s: 替换未改变源码(同值替换)' % label)
        return src
    return out


def main():
    src = io.open(TARGET, encoding='utf-8').read()
    orig = src

    # ── 1 constructor 声明 ─────────────────────────────────────────────
    #   ★ 走**行锚点**(不比对行尾中文标点):源码行尾注释里是全角冒号 U+FF1A,
    #     而补丁脚本里手打的是 ASCII 冒号 —— 逐字锚点会在这种地方静默打偏,
    #     且「打偏」与「已打过」同形(都是 0 次)。行锚点按 strip 后的代码段匹配。
    NEW_DECL = [
        "        /* [v3.345.0 · M4-X7] 旧事重现的控频闸状态(动作生命周期三通道标记 + 呈现偏好)。",
        "         *   为什么必须落进这张表:宿主把状态写在 worldProg.returnGate 上(跨会话携带),",
        "         *   而 worldProg 的子键是**逐项枚举**持久化的 —— 不登记 = 存盘即丢、读档即空。",
        "         *   形态:{ marks: [{ triggerKey, detailKey, channel, floor, at }], prefs: { [detailKey]: pref } }",
        "         *   ★ marks 带 floor ⇒ 必须同时挂进 removeByFloor / shiftFloorRefs(见该两处),",
        "         *     否则被删楼层的冷却命中会永久留着,把该条旧事在 REPEAT_WINDOW 内**永久押后**。 */",
        "        this.returnGate = null;",
    ]
    lines = src.split('\n')
    hits = [i for i, l in enumerate(lines) if l.strip().startswith('this.echoLedger = null;')]
    if len(hits) != 1:
        CHECKS.append('FAIL constructor: this.echoLedger = null; 行命中 %d 次(应 1)' % len(hits))
    elif any(l.strip().startswith('this.returnGate = null;') for l in lines):
        pass   # 已打过
    else:
        at = hits[0]
        lines[at + 1:at + 1] = NEW_DECL
        src = '\n'.join(lines)

    # ── 2 export() 面 ─────────────────────────────────────────────────
    a2 = "            volumeContinuationRead: this._volumeContinuationRead || null,\n            plotArcs: this.plotArcs || []\n"
    r2 = ("            volumeContinuationRead: this._volumeContinuationRead || null,\n"
          + "            /* [v3.345.0 · M4-X7] 控频闸状态随世界推进持久化。\n"
          + "             *   为什么不挂在别的账本里:marks 的键是「触发键 × 旧事键 × 通道 × 楼层」,\n"
          + "             *   与 recallEcho 的「细节 × 楼层」同域但**语义不同**(那边是回扣候选,\n"
          + "             *   这边是「提过没有 / 算不算真用」);并进去会让冷却判据与回扣判据互相污染。\n"
          + "             *   与既有同族一致:导出**状态本体**(不是读数)—— 冷却判定依赖逐条 marks。 */\n"
          + "            returnGate: this.returnGate || null,\n"
          + "            plotArcs: this.plotArcs || []\n")
    src = patch(src, a2, r2, 'export', 1, sig="returnGate: this.returnGate || null,")

    # ── 3 import() 面 ─────────────────────────────────────────────────
    a3 = ("            this._volumeContinuationRead = (data.volumeContinuationRead && typeof data.volumeContinuationRead === 'object')\n"
          "                ? data.volumeContinuationRead : null;\n")
    r3 = (a3
          + "            /* [v3.345.0 · M4-X7] 控频闸状态导入:畸形一律回落 null(与同族口径)。\n"
          + "             *   为什么不逐字段校验:marks 的合法性由内核 normState 在**每次读取时**归一\n"
          + "             *   (非法通道 / 缺键条目丢弃并计数)—— 导入面职责只是「别把它当成别的形状」,\n"
          + "             *   在这里再校一遍会变成第二套判据(两边不同步即静默漂移)。 */\n"
          + "            this.returnGate = (data.returnGate && typeof data.returnGate === 'object')\n"
          + "                ? data.returnGate : null;\n")
    src = patch(src, a3, r3, 'import', 1, sig="this.returnGate = (data.returnGate && typeof data.returnGate === 'object')")

    # ── 4 removeByFloor:摘该楼 marks ───────────────────────────────────
    a4 = "        if (Number(this.pendingWrite?.floor) === f) this.pendingWrite = null;\n        return removed;\n"
    r4 = ("        /* [v3.345.0 · M4-X7] 控频闸标记随删楼回滚:floor 精确命中的整条摘除。\n"
          + "         *   为什么必须做:marks 是冷却判据的唯一输入,被删楼层的命中留着 ⇒\n"
          + "         *   该条旧事在 REPEAT_WINDOW 内**永久 held**,而且账上查不出原因(「冷却中」)。\n"
          + "         *   floor === null 的标记不参与命中(内核口径),故此处也不动它们。 */\n"
          + "        if (this.returnGate && Array.isArray(this.returnGate.marks)) {\n"
          + "            const beforeMarks = this.returnGate.marks.length;\n"
          + "            this.returnGate.marks = this.returnGate.marks.filter((m) => Number(m && m.floor) !== f);\n"
          + "            removed += beforeMarks - this.returnGate.marks.length;\n"
          + "        }\n"
          + "        if (Number(this.pendingWrite?.floor) === f) this.pendingWrite = null;\n"
          + "        return removed;\n")
    src = patch(src, a4, r4, 'removeByFloor', 1, sig="            this.returnGate.marks = this.returnGate.marks.filter((m) => Number(m && m.floor) !== f);")

    # ── 5 shiftFloorRefs:marks.floor 前移 ─────────────────────────────
    a5 = "        if (this.pendingWrite) this.pendingWrite.floor = dec(this.pendingWrite.floor);\n        return shifted;\n"
    r5 = ("        /* [v3.345.0 · M4-X7] 控频闸标记随删楼前移:floor > deleted 的减一。\n"
          + "         *   为什么与 removeByFloor 成对:只摘不挪会让「第 8 楼的命中」在删掉第 3 楼后\n"
          + "         *   仍记作 8,而它其实已经在第 7 楼 —— 窗口判据会把它算成**未来**的命中(冷却永不落地)。 */\n"
          + "        if (this.returnGate && Array.isArray(this.returnGate.marks)) {\n"
          + "            for (const m of this.returnGate.marks) {\n"
          + "                const oldFloor = m.floor;\n"
          + "                m.floor = dec(m.floor);\n"
          + "                if (m.floor !== oldFloor) shifted++;\n"
          + "            }\n"
          + "        }\n"
          + "        if (this.pendingWrite) this.pendingWrite.floor = dec(this.pendingWrite.floor);\n"
          + "        return shifted;\n")
    src = patch(src, a5, r5, 'shiftFloorRefs', 1, sig="                m.floor = dec(m.floor);")

    if CHECKS:
        for c in CHECKS:
            sys.stderr.write(c + '\n')
        sys.exit(1)

    if src == orig:
        print('IN-SYNC memory-organs.js(补丁已打过,零改写)')
        return
    if '--check' in sys.argv:
        sys.stderr.write('FAIL: 补丁未打(check 模式不写盘)\n')
        sys.exit(1)
    io.open(TARGET, 'w', encoding='utf-8').write(src)
    print('PATCHED memory-organs.js: %d -> %d bytes' % (len(orig), len(src)))


if __name__ == '__main__':
    main()