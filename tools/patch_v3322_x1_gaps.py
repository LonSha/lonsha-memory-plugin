# -*- coding: utf-8 -*-
"""[v3.322.0 · M3-X1 宿主出口判据面] 补丁 2：读侧缺口具名化。

【本刀只做两件事】
  ① 新装配点 `_qaHelpDeps()`：逐账**现状**三态（有条目 / 空账 / 读不到）；
  ② 出口拿它把 `no-rows` 的笼统话拆成具名读数。

【为什么单列装配点，而不是复用 `_ledgerApis`】
  `_ledgerApis()` 答「这本账的 **API** 在不在」（走全局名 + require 回落，含三个派生面），
  本函数答「这本账**现在**是空账还是有条目」（走 `worldProg.*` 状态）。键集与取法都不同 ——
  合成一件事会让「取不到 API」与「账是空的」再次同形（本仓最贵的那笔老账）。

【本刀**不改**「不扩权」纪律】
  档头写死「出口只回合成句 + 逐计划读数（total/state/why/refs），**不回 rows**」。
  首版曾另加一个 `lines`（逐计划出处摘要）—— 那实质就是 rows 的第二形态，
  且会给 `open_face_registry.tsv` 里逐字声明的**恒定键面**添一格。故**不加**。

【本刀**不**新造缺口种类】
  缺口词表已登记 `module` / `actor` / `intent` / `no-rows` / `result-absent` /
  `no-answer` / `page-out-of-range`。这里只把 `no-rows` 的 why 从一句模板
  （「扫描面为空：九账全部取不到」）拆成**具名读数**。
"""
import io
import sys

EDITS = []


def rep(path, old, new, must=1, label=''):
    EDITS.append((path, old, new, must, label))


# ── ① 新装配点：逐账现状读数（读侧缺口用） ───────────────────────────────────
rep('index.js',
    """    function _evidenceQueryLedgersOf() {""",
    """    /**
     * [v3.322.0 · M3-X1] 逐账**现状**读数（读侧缺口的唯一装配点）。
     *
     * 【与 `_ledgerApis()` 是两件事（不是第二个真源）】
     *   · `_ledgerApis()` 答「这本账的 **API** 在不在」—— 投影 / 准入要用它；
     *   · 本函数答「这本账**现在**是空账还是有条目」—— 从 `worldProg.*` 状态读。
     *   合成一件事会让「取不到 API」与「账是空的」再次同形（本仓反复治过的漏）。
     *
     * 【契约】
     *   · **按需**调用：只在该问真出现「未参与的账」时才算（不在每次问答都付一遍）；
     *   · 逐项 try：单本账读不出不得让整张表消失；
     *   · 三态而非布尔：有条目 ⇒ `'has-items'`；空数组 ⇒ `'empty'`；取不到 ⇒ `'absent'`。
     *     「没有这本账」与「这本账是空的」不是同一句话。
     *
     * @returns {object} { <ledgerId>: 'has-items' | 'empty' | 'absent' }
     */
    function _qaHelpDeps() {
        const ledgers = _evidenceQueryLedgersOf();
        const out = {};
        for (const spec of ledgers) {
            try {
                const st = (typeof spec.state === 'function') ? spec.state(this) : undefined;
                const items = (typeof spec.pick === 'function') ? (spec.pick(null, st) || []) : [];
                out[spec.id] = !Array.isArray(items) ? 'absent' : (items.length ? 'has-items' : 'empty');
            } catch (_e) { out[spec.id] = 'absent'; }
        }
        return out;
    }
    function _evidenceQueryLedgersOf() {""",
    1, 'index.js · _qaHelpDeps 装配点')

# ── ② 出口：把 no-rows 的 why 拆成具名读数 ────────────────────────────────────
#   锚点阅读（落盘前已核对）：`coverage` 住在**查询结果**上（`results[i].query.coverage`），
#   **不在**合成面上（合成面返回 answer/gaps/refs/masked/truncated/resourced/total）。
#   首版按 `composed.coverage` 写过一次 —— 那会恒为 undefined ⇒ 整段静默不生效（假接线）。
#   另：`composed.gaps` 是 `p.gaps.slice()` 的副本（内核里现取），就地改它不污染入参。
rep('index.js',
    """const composed = Q.composeAnswer(plan, results, { maxSentences: o.maxSentences });""",
    """const composed = Q.composeAnswer(plan, results, { maxSentences: o.maxSentences });
                 /* [v3.322.0] **读侧缺口**（本仓最贵的那一格：「跑了、扫了、没命中」与
                  *   「根本没读到东西」不得同形）。
                  *   修前 `no-rows` 的 why 是一句模板：「扫描面为空：九账全部取不到（扫了 0 行）」
                  *   —— 而当本问**只扫了一本账**时，这句话本身就是错的读数
                  *   （既不是「九账」、也不是「全部取不到」），下游据此会把「问答没答出」
                  *   误判成「记忆库不可用」。
                  *   修法：按**本问真实的扫描面**逐本具名 —— 未参与的账分成
                  *   「空账（读了、没有）」与「读不到（没读到）」两档，各自点数并点名。
                  *   ★ 不新造缺口种类：`no-rows` 的语义本就含「扫描面为空」这一格。 */
                 try {
                     const skippedIds = [];
                     for (const rr of results) {
                         const cov = (rr && rr.query) ? rr.query.coverage : null;
                         const ids = (cov && Array.isArray(cov.skippedByLedgerFilter)) ? cov.skippedByLedgerFilter : [];
                         for (const id of ids) if (skippedIds.indexOf(id) < 0) skippedIds.push(id);
                     }
                     if (skippedIds.length) {
                         const ledgersNow = _qaHelpDeps.call(this);
                         const emptyIds = [];
                         const absentIds = [];
                         for (const id of skippedIds) {
                             if (ledgersNow[id] === 'empty') emptyIds.push(id);
                             else absentIds.push(id);
                         }
                         const why = '本问只扫被点名的账，另有 ' + skippedIds.length + ' 本未参与'
                             + '（未参与不等于「没有」）：其中空账 ' + emptyIds.length + ' 本'
                             + (emptyIds.length ? '（' + emptyIds.join('、') + '）' : '')
                             + '、读不到 ' + absentIds.length + ' 本'
                             + (absentIds.length ? '（' + absentIds.join('、') + '）' : '');
                         let hit = null;
                         for (const g of composed.gaps) if (g && g.kind === 'no-rows') { hit = g; break; }
                         if (hit) hit.why = (hit.why || '') + '；' + why;
                         else composed.gaps.push({ kind: 'no-rows', why: why });
                     }
                 } catch (_e) { /* 缺口照会面不得因读数失败而整体翻红（缺口的缺口另行治理） */ }""",
    1, 'index.js · 读侧缺口具名化')


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