#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.296.0 收口轮 · 宿主分诊基线按真读数重绑（读数零手抄）+ line_budget 理由同步。

为什么要重绑：本轮的收口补丁在 `explainRecallHost` 内加了 4 行注释（把 audit.floor
的旧判据换走 `_numOrNull` 的理由写在现场），宿主 15326 → 15329、该成员 121 → 124。
这正是 v3266 C / v3232 C1 / v3257…v3264 那 8 档在守的东西（基线必须等于真文件）——
它们翻红不是缺陷，是**基线陈旧**。按本仓纪律「读数零手抄」，重绑只走探针 + 重建脚本。

同时把 `line_budget` 的 note 与 history 末条 reason 同步到新读数（两处必须逐字相同，
由 v3266 C 的「note 必须是最后一条历史理由的复述」把守）。
"""
import io
import json
import subprocess
import sys
import hashlib

ROOT = '/home/user/lonsha-memory-plugin/'
BAK = '/tmp/bak3296/'
BASE_REL = 'tests/audit/host_beast_baseline.json'
BASE = ROOT + BASE_REL

REASON = ('v3.296.0 收口轮：X 系列八条宿主真实接线累计 +769 行后，'
          '本轮再收口 `explainRecallHost` 的 audit.floor 旧判据（改走 `_numOrNull`，含 4 行现场理由注释），'
          '读数由探针重绑（行 15326→15329、该成员 121→124）。基线只跟随真读数，不做结构变更。')


def sha(t):
    return hashlib.sha256(t.encode('utf-8')).hexdigest()[:12]


def main():
    old = io.open(BASE, encoding='utf-8').read()
    io.open(BAK + 'host_beast_baseline.json.pre3296fix', 'w', encoding='utf-8').write(old)

    r = subprocess.run([sys.executable, ROOT + 'tools/_rebuild_host_beast.py', REASON, '--force'],
                       cwd=ROOT, capture_output=True, text=True, timeout=300)
    print(r.stdout)
    if r.returncode != 0:
        sys.stderr.write(r.stderr)
        print('重建失败，未继续。')
        sys.exit(2)

    d = json.loads(io.open(BASE, encoding='utf-8').read())
    t = d['readings']['total_lines']
    m = d['readings']['member_count']

    # line_budget：只同步「理由里的读数」，不抬 ceiling（余量 15726-15329=397 <= maxSlack 400，仍在线内）
    lb = d['line_budget']
    new_note = ('v3.289.0–v3.296.0 X 系列八条宿主真实接线累计 +769 行'
                '（注入策略对照 / 手机事实准入 / 知识轨迹 / 分支语义 / 分卷接续 / 召回解释 / 修复流程 / 结构化证据查询），'
                '全为活跃功能增长、非死代码回流：宿主 14567 → ' + str(t) + '，抬到实测 ' + str(t) + ' + slack ' + str(lb['maxSlack']))
    was = lb['note']
    lb['note'] = new_note
    lb['history'][len(lb['history']) - 1]['reason'] = new_note
    print('line_budget.note 同步：\n  旧: %s\n  新: %s' % (was, new_note))

    mn = lb.get('member_note', '')
    if str(m) not in mn:
        print('member_note 中的读数与实测不符，请复核：实测 %d / note=%s' % (m, mn))

    io.open(BASE, 'w', encoding='utf-8').write(json.dumps(d, ensure_ascii=False, indent=1) + '\n')
    new = io.open(BASE, encoding='utf-8').read()
    print('write %s %d → %d 字节 (sha %s → %s)' % (BASE_REL, len(old.encode('utf-8')), len(new.encode('utf-8')), sha(old), sha(new)))
    print('readings: total_lines=%d member_count=%d ceiling=%d slack=%d' % (t, m, lb['ceiling'], lb['ceiling'] - t))
    print('DONE')


if __name__ == '__main__':
    main()