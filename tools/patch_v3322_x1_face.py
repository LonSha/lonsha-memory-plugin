# -*- coding: utf-8 -*-
"""[v3.322.0 · M3-X1 宿主出口判据面] 补丁 1：恒定键面修复。

留痕（为什么必须落盘再执行、且先全量校验锚点）：
  · 终端 heredoc 内嵌 `python3 -c` 含中文引号极易被 bash 打偏（V74 批次 E 注册表补丁的前车）；
  · v3294 留痕过一类**半改造**：脚本边走边写盘，后段锚点校验失败即 exit ⇒ 前几项已落地、
    后几项静默作废。故此处**先全部校验、再统一写盘**。
"""
import io
import sys

EDITS = []


def rep(path, old, new, must=1, label=''):
    EDITS.append((path, old, new, must, label))


# ── ① index.js：`absent()` 恒定键面补 `knownActors` ────────────────────────────
#   缺陷读数（探针 /home/user/qa_probe.mjs [17]）：present 路径 15 键，缺席路径 14 键
#   —— 缺的正是 `knownActors`。而 tests/audit/open_face_registry.tsv 第 45 行
#   （memoryQaAnswer）逐字声明的是「返回**恒定键面** ... knownActors ...」，
#   并写明「宿主在内核缺席时给**同键**降级回执（答不出时下游也读不到 undefined）」。
#   下游按键断言即可、不必猜 —— 缺一格就是把「不必猜」变成「必猜」。
rep('index.js',
    """            const absent = (reason) => ({
                version: 0, question: qText, intents: [], actor: null,
                answer: [], gaps: [{ kind: 'module', why: reason }], refs: [], plans: [],
                masked: 0, truncated: false, resourced: 0, total: 0,
                reason: reason, writesNothing: true
            });""",
    """            /* [v3.322.0] 恒定键面：`knownActors` 在**缺席路径上也须在场**。
             *   修前缺席回执缺这一格（15 键 → 14 键）⇒ 下游 `r.knownActors.length`
             *   当场 TypeError，而登记表逐字声明的是恒定键面。
             *   这里给的是**真读数**：人名装配点不依赖 `evidence-query.js`，
             *   故「模块未加载」不等于「一个已知人名都没有」（缺席不当 0 用）。
             *   整段就地 try：装配点万一抛错也不得把「模块没加载」改写成别的归因。 */
            const absent = (reason) => {
                let known = 0;
                try {
                    known = (Array.isArray(o.knownActors) ? o.knownActors : this._qaKnownActors(o.maxActors)).length;
                } catch (_e) { known = 0; }
                return {
                    version: 0, question: qText, intents: [], actor: null,
                    answer: [], gaps: [{ kind: 'module', why: reason }], refs: [], plans: [],
                    masked: 0, truncated: false, resourced: 0, total: 0,
                    knownActors: known, reason: reason, writesNothing: true
                };
            };""",
    1, 'index.js · absent 恒定键面')


def main():
    for (path, old, new, must, label) in EDITS:
        src = io.open(path, encoding='utf-8').read()
        n = src.count(old)
        if n != must:
            print('FAIL 锚点命中 ' + str(n) + ' 次（期望 ' + str(must) + '）：' + label)
            sys.exit(1)
    print('锚点全部命中 (' + str(len(EDITS)) + ' 项)，开始写盘')
    for (path, old, new, must, label) in EDITS:
        src = io.open(path, encoding='utf-8').read()
        io.open(path, 'w', encoding='utf-8').write(src.replace(old, new))
        print('OK ' + label)


main()
