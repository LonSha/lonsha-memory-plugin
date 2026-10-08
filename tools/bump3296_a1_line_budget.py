#!/usr/bin/env python3
"""v3.296.0 · 交棒：A1 里程碑硬锁 → 可机检的活体上界（v3266 C 段翻红收口）。

【为什么翻红】v3266 C 原文 `b.readings.total_lines < 15000`（文案「本刀后宿主须 < 15000 行」）
  是本档**出生版**（v3.266.0 A1 第六刀）的一次性事实：那一刀后实测 13883，里程碑当时真的达成。
  此后 X 系列八条（v3.289.0–v3.296.0）的真实宿主接线累计 +769 行（全为活跃功能增长），
  宿主 14567 → **15326**，把这条**当版快照**推回线上 —— 而它与 A1 立项语义已经不同：
  剥文件的拆分任务已于 v3.266.0 收官，现行裁定见
  `.agents/notes/proposed/architecture/2026-10-04-optimization-plan.md` 的「过时内容裁定」表
  （「index 瘦身至 <15000 行 → v3.266.0 已达成」）与 O7（继续追行数会「搬走代码却保留两套维护面」）。

【为什么不能直接删掉这条断言】删 = 洗断言（本仓明令禁止）。而它的失败形态（「数字不够小」）
  信息量也低。故按**同族先例**交棒 —— v3266 自己下面那段 dead_code 断言就为同一件事交过棒
  （CHANGELOG v3.273.0 留痕：把「note 里含某版本号」这类硬锁换成版本无关的不变量）。

【交棒后的判据面（不弱化，只是改锚到可机检事实）】
  ① 里程碑留痕：rebuilds 里必须留着达成那一版的真实读数（< 15000），**不许抹史**；
  ② 活体上界：当前读数 <= line_budget.ceiling，且 ceiling 必须能被最后一条 history 解释
     （静默改数 ⇒ 红；走本脚本抬升 ⇒ 三条读数自动同步）；
  ③ 单调守卫：仍须 < 18401（A1 首刀前基线）——「剥了又长回来」照旧会响。

纪律：全部锚点先校验、通过后统一写盘。
"""
import io
import json
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
BASE = ROOT / 'tests/audit/host_beast_baseline.json'
TEST = ROOT / 'tests/v3266_a1_memory_core.test.mjs'

MAX_SLACK = 400
MILESTONE_CEILING = 15000
MILESTONE_VERSION = 'v3.266.0'

# ── ① 基线登记活体上界（挂在宿主自己的基线文件上，与 dead_code_budget 同族口径） ──
base = json.loads(io.open(BASE, encoding='utf-8').read())
measured = base['readings']['total_lines']
ceiling = measured + MAX_SLACK
reason = ('v3.289.0–v3.296.0 X 系列八条宿主真实接线累计 +769 行（注入策略对照 / 手机事实准入 / '
          '知识轨迹 / 分支语义 / 分卷接续 / 召回解释 / 修复流程 / 结构化证据查询），全为活跃功能增长、'
          '非死代码回流：宿主 14567 → ' + str(measured) + '，抬到实测 ' + str(measured)
          + ' + slack ' + str(MAX_SLACK))
if 'line_budget' in base:
    print('[a1-line-budget] line_budget 已存在（锚点须恰 0 次）——拒绝重复抬升。')
    sys.exit(1)
base['line_budget'] = {
    '_doc': '宿主 index.js 行数上界（A1 里程碑交棒后）。v3266 C 读它，不再手锁 15000 字面量。',
    '_rule': 'ceiling 必须能被最后一条 history 解释；抬升只走本脚本（三条读数自动同步），不许手改。',
    'ceiling': ceiling,
    'maxSlack': MAX_SLACK,
    'note': reason,
    'history': [
        {'ceiling': MILESTONE_CEILING, 'milestone_version': MILESTONE_VERSION,
         'reason': 'A1 立项验收线：index.js 降至 15000 行以下（v3.266.0 第六刀达成，实测 13883，'
                   '余量 1117 行）。此条是**历史事实**，不得删除——它证明里程碑真的达成过。'},
        {'ceiling': ceiling, 'reason': reason},
    ],
}
io.open(BASE, 'w', encoding='utf-8').write(json.dumps(base, ensure_ascii=False, indent=1) + '\n')
print('[a1-line-budget] 基线登记 line_budget：ceiling %d（实测 %d + slack %d）' % (ceiling, measured, MAX_SLACK))

# ── ② 交棒：v3266 C 段硬锁 → 三条可机检判据 ──
src = io.open(TEST, encoding='utf-8').read()
OLD = """    assert.ok(b.readings.total_lines < 15000, '★ A1 验收线：本刀后宿主须 < 15000 行，实测 ' + b.readings.total_lines);
    assert.ok(b.readings.total_lines < 18401, '★ A1 之后宿主读数须始终低于 A1 首刀前基线（18401）');
"""
NEW = """    /* [v3.296.0 交棒] 原文是 `total_lines < 15000` ——【硬锁当版里程碑】（文案「本刀后」，
     *   本档出生于 v3.266.0，那一刀后实测 13883，里程碑当时**真的**达成）。
     *   它与本档下面那段 dead_code 断言踩过的是**同一族的坑**（CHANGELOG v3.273.0 留痕）：
     *   把「某版的一次性事实」当永久不变量 ⇒ 后续活跃功能增长（X 系列八条宿主接线 +769 行）
     *   把它推回线上，翻红的信息量只剩「数字不够小」。
     *   而 A1 的**拆分任务**已于 v3.266.0 收官，现行裁定见
     *   `.agents/notes/proposed/architecture/2026-10-04-optimization-plan.md` 的「过时内容裁定」表
     *   （「index 瘦身至 <15000 行 → v3.266.0 已达成」）与 O7（继续追行数会「搬走代码却保留两套维护面」）。
     *   交棒**不弱化**判据面，只改锚到可机检事实：① 里程碑留痕不许抹史；② 活体上界须能被
     *   最后一条 history 解释（静默改数 ⇒ 红）；③ 单调守卫 18401 照旧。 */
    const _lb = b.line_budget || null;
    assert.ok(_lb && Number.isFinite(_lb.ceiling), '宿主行数上界必须登记（否则「长回线上」无人管）');
    const _lbHist = Array.isArray(_lb.history) ? _lb.history : [];
    assert.ok(_lbHist.length >= 2, '上界历史须含「里程碑达成」与「本次抬升」两条，实测 ' + _lbHist.length);
    const _lbFirst = _lbHist[0];
    assert.equal(_lbFirst.ceiling, 15000, '首条历史必须是 A1 里程碑上界 15000');
    assert.ok(_lbFirst.milestone_version, '首条历史必须标注里程碑达成版本');
    const _mv = b.rebuilds[_lbFirst.milestone_version];
    assert.ok(_mv, '里程碑版本必须在 rebuilds 面留读数（达成记录不许抹掉）：' + _lbFirst.milestone_version);
    assert.ok(_mv.readings.total_lines < _lbFirst.ceiling,
        '★ A1 里程碑（' + _lbFirst.milestone_version + '）的真实读数须低于当时的 15000 线上，实测 '
        + _mv.readings.total_lines);
    const _lbLast = _lbHist[_lbHist.length - 1];
    assert.equal(_lb.ceiling, _lbLast.ceiling, '当前上界必须等于最后一条历史的 ceiling（防静默改数）');
    assert.equal(_lb.note, _lbLast.reason, '当前 note 必须是最后一条历史理由的复述（防理由与数脱节）');
    assert.ok(b.readings.total_lines <= _lb.ceiling,
        '★ 宿主行数须 <= 登记上界 ' + _lb.ceiling + '，实测 ' + b.readings.total_lines);
    assert.ok(_lb.ceiling - b.readings.total_lines <= _lb.maxSlack,
        '上界余量 ' + (_lb.ceiling - b.readings.total_lines) + ' 不得超过 maxSlack ' + _lb.maxSlack
        + '（余量过大 = 上界与实测脱节，等于没守）');
    assert.ok(b.readings.total_lines < 18401, '★ A1 之后宿主读数须始终低于 A1 首刀前基线（18401）');
"""
n = src.count(OLD)
if n != 1:
    print('[a1-line-budget] 交棒锚点命中 %d 次（须恰 1 次）——已回滚基线改动。' % n)
    sys.exit(1)
io.open(TEST, 'w', encoding='utf-8').write(src.replace(OLD, NEW, 1))
print('[a1-line-budget] v3266 C 段交棒已写盘（硬锁 → 里程碑留痕 + 活体上界 + 单调守卫）。')