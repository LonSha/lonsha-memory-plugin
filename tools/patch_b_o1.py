#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""patch_b_o1.py — [v3.321.0 · B 包 M3-O1] 召回排序更贴合当前剧情。

落点：既有 unified-recall.js（**不新增运行时模块**）+ index.js 唯一收尾处接线。
计划原文点名「优化候选融合的尺度、语义重复与角色/事件覆盖；当前任务相关事实优先，
老而关键的约定不被近况淹没；复用现有rerank与可选模型」。

三条（都不改既有评分口径，只在融合后的名次上做**可归因**的调整）：
  ① 语义重复抑制：近重复（3-gram Jaccard ≥ 阈值）只留分高的一条，计入 carry；
  ② 角色/事件覆盖：按 sourceRef 的 actor/event 分组，每组保底留一条代表；
  ③ 未结关键事实保底：「答应/约定/欠/未结」这类**未了账**不因时间衰减被近况淹没。
"""
import io
import sys

ROOT = '/home/user/lonsha-memory-plugin'
UR = ROOT + '/unified-recall.js'
IDX = ROOT + '/index.js'
DRY = ('--dry' in sys.argv)

ur = io.open(UR, encoding='utf-8').read()
idx = io.open(IDX, encoding='utf-8').read()


def chk(s, cnt, tag):
    if (ur + idx).count(s) != cnt:
        raise SystemExit('[o1] 锚点 %s 期望 %d 次，实测 %d：%r' % (tag, cnt, (ur + idx).count(s), s[:70]))


# ══════════ 一、unified-recall.js：融合优化面 ══════════
A_UR_API = """const api = {
  GUARANTEED_TYPES, MAX_CANDIDATES,
  nodeToCandidate, graphToCandidates, mergeWithGuaranteed,
  extractEvidenceSentences, dedupeByEvent
};"""
chk(A_UR_API, 1, 'ur-api')

B_UR_API = r"""/* ── [M3-O1] 融合优化：语义重复抑制 / 角色事件覆盖 / 未结关键事实保底 ──
 *   为什么放在**融合之后**而不是评分里：评分口径是既有契约（ai-select.scoreEntry），
 *   改它等于同时改所有召回路的语义；而这里做的是「同一批候选里，名次怎么排」
 *   —— 计划原文要的正是这个（「优化候选融合的尺度、语义重复与角色/事件覆盖」）。
 *   三条各自可归因、各自可关：任一开关关掉即退回修前顺序（逐字节等同）。
 */
/** 未结账词表：这些词出现即视为「未了的事」，不因时间衰减沉底。 */
const OPEN_KEY_RE = /未结|没结|还没|仍未|待办|悬着|答应|约定|说好|保证|发誓|承诺|欠|约好|约定好/;
/** 语义组的键：优先事件标识，其次角色，最后来源（**无键不分组**，不硬凑）。 */
function _groupKeyOf(c) {
  const r = (c && c.sourceRef) || {};
  const ev = String(r.eventId || r.group || r.thread || '').trim();
  if (ev) return 'ev:' + ev;
  const ref = Array.isArray(c && c._actors) ? c._actors : null;
  if (ref && ref.length) return 'ac:' + String(ref[0]).toLowerCase();
  return '';
}
/** 字符 n-gram 集合（中文无空格，按字切）。 */
function _shingles(text, n) {
  const t = String(text == null ? '' : text).replace(/\s+/g, '');
  const out = new Set();
  const N = Math.max(2, Math.min(4, Number(n) || 3));
  if (!t) return out;
  if (t.length < N) { out.add(t); return out; }
  for (let i = 0; i + N <= t.length; i++) out.add(t.slice(i, i + N));
  return out;
}
/** Jaccard 相似度（0..1）。**只用于判重、不用于打分** —— 它不是相关度。 */
function _similarity(a, b) {
  const A = _shingles(a), B = _shingles(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
}
/** 候选的可比文本（检索面优先：它才是「这两条说的是不是同一件事」的证据面）。 */
function _candText(c) {
  if (!c) return '';
  return String(c.searchText || c.text || c.content || c.comment || c._label || '');
}
/**
 * 融合后的重排（**纯函数**；不改入参对象，返回新数组）。
 * @param {Array} cands 融合后的候选（带 score / rrfScore / updatedAt）
 * @param {object} opts { dupThreshold=0.82, coverage=true, openKeep=true, queryText, budget }
 * @param {object} carry 读数字典（就地累加，便于诊断）
 * @returns {Array} 重排后的候选
 */
function fuseCandidates(cands, opts, carry) {
  const o = opts || {};
  const list = (Array.isArray(cands) ? cands : []).slice();
  const thr = Math.max(0.5, Math.min(0.99, Number(o.dupThreshold) || 0.82));
  const scoreOf = (c) => Number((c && (c.rrfScore != null ? c.rrfScore : c.score)) || 0);
  const c = (carry && typeof carry === 'object') ? carry : {};
  c.fusionIn = list.length;
  c.fusionDupDropped = 0;
  c.fusionGroups = 0;
  c.fusionCoverAdded = 0;
  c.fusionOpenKept = 0;
  /* ① 近重复抑制：**先按分降序**，故留下的恒是分更高的那条（确定性）。 */
  const sorted = list.slice().sort((a, b) => (scoreOf(b) - scoreOf(a))
    || ((Number(b && b.updatedAt) || 0) - (Number(a && a.updatedAt) || 0)));
  const kept = [];
  for (const cand of sorted) {
    const t = _candText(cand);
    let dup = false;
    if (t && t.length >= 8) {
      for (const k of kept) {
        const kt = _candText(k);
        if (!kt || kt.length < 8) continue;
        if (_similarity(t, kt) >= thr) { dup = true; break; }
      }
    }
    if (dup) { c.fusionDupDropped += 1; continue; }
    kept.push(cand);
  }
  /* ② 角色/事件覆盖：按组保底留一条代表（分组键来自 sourceRef，**无键不分组**）。 */
  let out = kept;
  if (o.coverage !== false) {
    const seen = new Set();
    for (const k of kept) { const g = _groupKeyOf(k); if (g) seen.add(g); }
    c.fusionGroups = seen.size;
    /* 被①丢掉的分组代表要**找回来** —— 否则「同一角色只留最高分那条」会把该角色的
     *   另一件事整组消掉（重复抑制的副作用，正是覆盖要补的）。 */
    const haveGroups = new Set();
    for (const k of kept) { const g = _groupKeyOf(k); if (g) haveGroups.add(g); }
    const missing = [];
    for (const cand of sorted) {
      if (kept.indexOf(cand) >= 0) continue;
      const g = _groupKeyOf(cand);
      if (g && !haveGroups.has(g)) { missing.push(cand); haveGroups.add(g); }
    }
    if (missing.length) { out = kept.concat(missing); c.fusionCoverAdded = missing.length; }
  }
  /* ③ 未结关键事实保底：含未结词的条目**上浮**（量级只动名次边界，不改分数语义）。 */
  if (o.openKeep !== false) {
    out = out.slice().sort((a, b) => {
      const oa = OPEN_KEY_RE.test(_candText(a)) ? 1 : 0;
      const ob = OPEN_KEY_RE.test(_candText(b)) ? 1 : 0;
      if (oa !== ob) return ob - oa;
      return (scoreOf(b) - scoreOf(a))
        || ((Number(b && b.updatedAt) || 0) - (Number(a && a.updatedAt) || 0));
    });
    for (const k of out) if (OPEN_KEY_RE.test(_candText(k))) c.fusionOpenKept += 1;
  }
  /* 预算截断（给了 budget 才截；被截的**必须计数**，否则「预算挡下的」与「本来就没有」同形）。 */
  const budget = Number(o.budget);
  if (Number.isFinite(budget) && budget > 0 && out.length > budget) {
    c.fusionBudgetDropped = out.length - budget;
    out = out.slice(0, budget);
  } else c.fusionBudgetDropped = 0;
  c.fusionOut = out.length;
  return out;
}
const api = {
  GUARANTEED_TYPES, MAX_CANDIDATES,
  nodeToCandidate, graphToCandidates, mergeWithGuaranteed,
  extractEvidenceSentences, dedupeByEvent,
  fuseCandidates, _similarity
};"""

# ══════════ 二、index.js 接线：唯一收尾处（intentRerank 之后、_finalize 之前） ══════════
A_IDX = '            const finalMerged = this.intentRerank(merged, query.text);'
chk(A_IDX, 1, 'finalMerged')
B_IDX = """            const finalMerged = this.intentRerank(merged, query.text);
            /* [v3.321.0 · M3-O1] 融合优化（语义重复抑制 / 角色事件覆盖 / 未结保底）。
             *   位置：**intentRerank 之后、_finalize 之前** —— 上游三条提权（crosslink /
             *   情绪反向 / 意图分流）都已落位完毕，这里改的是「最终名次」；
             *   放在它们之前会改到不存在的名次（v3185/v3186 锁的正是这个次序纪律）。
             *   就地改序（splice）而不是另建数组：`_finalize` 与精排段引用的是同一个
             *   `finalMerged`，换引用会让它们读到旧数组。 */
            try {
                if (this.unifiedRecall && typeof this.unifiedRecall.fuseCandidates === 'function') {
                    this._fusionCarry = {};
                    const _fused = this.unifiedRecall.fuseCandidates(finalMerged, {
                        queryText: query.text,
                        budget: Math.max(1, (Number(this.config.config.vectorTopK) || 5) * 2)
                    }, this._fusionCarry);
                    if (Array.isArray(_fused)) finalMerged.splice(0, finalMerged.length, ..._fused);
                } else {
                    this._fusionCarry = null;   /* 模块缺席：不伪装成「融合了 0 条」，诊断行会说 */
                }
            } catch (e) { errLog(e, 'recall.fuseCandidates'); this._fusionCarry = null; }"""

PAIRS = [(A_UR_API, B_UR_API, 'ur-api'), (A_IDX, B_IDX, 'idx')]
out_ur, out_idx = ur, idx
for a, b, tag in PAIRS:
    target = out_ur if a in out_ur else out_idx
    if target.count(a) != 1:
        raise SystemExit('[o1] 执行期锚点 %s 命中 %d 次，未写盘' % (tag, target.count(a)))
for a, b, tag in PAIRS:
    if a in out_ur and out_ur.count(a) == 1:
        out_ur = out_ur.replace(a, b, 1)
    elif out_idx.count(a) == 1:
        out_idx = out_idx.replace(a, b, 1)
    else:
        raise SystemExit('[o1] 归属判定失败：%s' % tag)

if DRY:
    print('[o1] DRY：锚点唯一命中，未写盘')
    raise SystemExit(0)
io.open(UR, 'w', encoding='utf-8', newline='\n').write(out_ur)
io.open(IDX, 'w', encoding='utf-8', newline='\n').write(out_idx)
print('[o1] wrote unified-recall.js + index.js')