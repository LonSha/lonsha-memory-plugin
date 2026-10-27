#!/usr/bin/env python3
# [v3.423.0] 登记链重绑（幂等）：TODO / README / PLAN 待验标记 + 宿主基线当版账
import json, re

ROOT = '/home/user/lonsha-memory-plugin'
ok = []

# ---------- 1. TODO.md ----------
todo = open(ROOT + '/TODO.md', encoding='utf-8').read()
if '最近更新：v3.423.0' in todo:
    ok.append('TODO 已是当版(跳过)')
else:
    old = '> **最近更新：v3.421.0**（'
    assert todo.count(old) == 1, 'TODO 头锚点: %d' % todo.count(old)
    new = ('> **最近更新：v3.423.0**（玩家面板重构——FAB 直达玩家主页 + 设置全面去黑话（三件事原则：'
        '记忆能力在跑吗 / 这里有谁 / 过去发生了什么）：旧 FAB 七项菜单退役（能力零删除，入口全保留在总览/设置内），'
        '玩家主页 = 运行状态卡 + 三模式快捷切换（写 `extractionProfile` 即存）+ 最近发生的事 + 登场人物 + 三入口；'
        '「AI 接口连接」组从第三个 tab 前置到「常用」页顶（Embedding 三键随迁）；18 个 `[TAG]` 组标题翻成玩家语言、'
        '四 tab 改名（◈ 常用 / ◷ 故事与人物 / ⬡ 记录与世界 / ⚙ 高级）、面板标题翻新（⚙ 设置 / 📖 记忆总览）；'
        '上一轮两缺陷（token 宿主覆盖穿透白底淡字、模式 pill 无反应）的修复随重构保留并受本版套件把守；'
        '六源同源抬版（index/manifest/package + 三内核副本）；测试锚点同步 v377/v3160/v3161/v3162/v3238/v334/v337；'
        '五道 UI 审计门全绿（runtime/interaction/binding/panel_drive/narrow_layout）；'
        '当版套件 `tests/v34230_player_home_refactor.test.mjs`（6 条）。定向门禁全绿，全量待验）。')
    todo = todo.replace(old, new, 1)
    open(ROOT + '/TODO.md', 'w', encoding='utf-8').write(todo)
    ok.append('TODO 最近更新 → v3.423.0')

# ---------- 2. README.md ----------
rd = open(ROOT + '/README.md', encoding='utf-8').read()
old8 = '**当前版本**：`3.421.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）'
new8 = '**当前版本**：`3.423.0`（版本四源同步由 `tests/audit/scan_version_guard.mjs` 把守）'
if old8 in rd:
    rd = rd.replace(old8, new8, 1)
    ok.append('README 行8 当前版本 → 3.423.0')
elif new8 in rd:
    ok.append('README 行8 已是当版(跳过)')
else:
    raise AssertionError('README 行8 两形态都不在场')

m = re.search(r'当前版本 v3\.421\.0 \*\*全量待验\*\*（[^）]*）', rd)
if m:
    old12 = m.group(0)
    new12 = ('当前版本 v3.423.0 **全量待验**（本版玩家面板重构：FAB 直达玩家主页 + 设置去黑话 + API 前置「常用」页顶，'
        '能力零删除；宿主入口零变化，实施期只跑定向门禁与五道 UI 审计，全量待验）；'
        '上一版 ' + old12.replace('本版完成', 'v3.421.0 完成', 1))
    rd = rd.replace(old12, new12, 1)
    open(ROOT + '/README.md', 'w', encoding='utf-8').write(rd)
    ok.append('README 行12 待验标记 → v3.423.0')
elif '当前版本 v3.423.0 **全量待验**' in rd:
    ok.append('README 行12 已是当版(跳过)')
else:
    raise AssertionError('README 行12 两形态都不在场')

# ---------- 3. PLAN.md ----------
pl = open(ROOT + '/PLAN.md', encoding='utf-8').read()
m = re.search(r'当前 v3\.421\.0 \*\*全量待验\*\*（[^）]*）', pl)
if m:
    old60 = m.group(0)
    new60 = ('当前 v3.423.0 **全量待验**（实施期只跑定向门禁与五道 UI 审计，绝不跑全量；本版玩家面板重构：'
        'FAB 直达玩家主页、API 前置「常用」页顶、18 组标题去黑话、四 tab 改名、token 作用域化、pill 接实配；'
        '能力零删除，宿主入口零变化）；上一版 ' + old60.replace('当前 ', '', 1))
    pl = pl.replace(old60, new60, 1)
    open(ROOT + '/PLAN.md', 'w', encoding='utf-8').write(pl)
    ok.append('PLAN 待验标记 → v3.423.0')
elif '当前 v3.423.0 **全量待验**' in pl:
    ok.append('PLAN 已是当版(跳过)')
else:
    raise AssertionError('PLAN 两形态都不在场')

# ---------- 4. 宿主基线 ----------
bp = ROOT + '/tests/audit/host_beast_baseline.json'
b = json.load(open(bp, encoding='utf-8'))
cur = 'v3.423.0'
if b['measured_at'] == cur:
    ok.append('基线已是当版(跳过)')
else:
    assert b['measured_at'] == 'v3.421.0', b['measured_at']
    reason = ('[v3.423.0] 玩家面板重构版：本版只动 settings-ui.js（UI 层）与测试/文档，宿主入口 index.js 零变化 —— '
        'total_lines 11696 / 合并面 28275 / 成员 1160 与 v3.421.0 完全一致（探针重跑复核）；'
        '行上界 12096 不动，余量 400 = maxSlack 贴线合规，成员上界 1190 同步不动。')
    old_re = b['rebuilds']['v3.421.0']
    new_re = dict(old_re)
    new_re['reason'] = reason
    b['rebuilds'][cur] = new_re
    b['measured_at'] = cur
    lb = b['line_budget']
    last = lb['history'][-1]
    assert last['version'] == 'v3.421.0'
    lb['history'].append({'version': cur, 'ceiling': last['ceiling'],
                          'member_ceiling': last['member_ceiling'], 'reason': reason})
    lb['note'] = reason
    assert lb['ceiling'] == lb['history'][-1]['ceiling']
    json.dump(b, open(bp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    ok.append('基线 measured_at/rebuilds/line_budget → v3.423.0')

print('\n'.join('ok ' + x for x in ok))