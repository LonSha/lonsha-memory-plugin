#!/usr/bin/env python3
import json, re, os, subprocess

V_OLD = '3.362.0'
V_NEW = '3.363.0'

# 1. index.js
with open('index.js', 'r', encoding='utf8') as f:
    c = f.read()
c = c.replace(f"const VERSION = '{V_OLD}';", f"const VERSION = '{V_NEW}';")
with open('index.js', 'w', encoding='utf8') as f:
    f.write(c)

# 2. package.json
with open('package.json', 'r', encoding='utf8') as f:
    pkg = json.load(f)
pkg['version'] = V_NEW
with open('package.json', 'w', encoding='utf8') as f:
    json.dump(pkg, f, indent=2)
    f.write('\n')

# 3. manifest.json
with open('manifest.json', 'r', encoding='utf8') as f:
    mf = json.load(f)
mf['version'] = V_NEW
if 'engine-recall.js' not in mf.get('extra_js', []):
    mf['extra_js'].append('engine-recall.js')
with open('manifest.json', 'w', encoding='utf8') as f:
    json.dump(mf, f, indent=4)
    f.write('\n')

# 4. other modules
for fname in ['memory-config.js', 'memory-core.js', 'memory-organs.js', 'counterfactual-experiment.js', 'era-inheritance.js']:
    with open(fname, 'r', encoding='utf8') as f:
        src = f.read()
    src = src.replace(f"'{V_OLD}'", f"'{V_NEW}'")
    src = src.replace(f'"{V_OLD}"', f'"{V_NEW}"')
    with open(fname, 'w', encoding='utf8') as f:
        f.write(src)

# 5. CHANGELOG.md
with open('CHANGELOG.md', 'r', encoding='utf8') as f:
    cl = f.read()
new_sec = f"""## v{V_NEW}
**index.js 剥离第三批：recallMemory 核心召回管线外提为 engine-recall.js**
- 新增 `engine-recall.js`（IIFE 模块）：将 `recallMemory` 核心召回管线（718行）及 5 个纯函数（`numOr`, `normalizeCharName`, `relativePrefix`, `filterTimelineByConstraint`, `parseStoryTimeConstraint`）从 `index.js` 外提为独立模块，挂载 `window.LonShaEngineRecall`，提供 `bindDeps` 注入。
- `index.js` 从 20950 行降至 20249 行（净减 701 行），原实现替换为轻量委托桩。
- `manifest.json` `extra_js` 登记 `engine-recall.js`（共 136 项）。
- 修复相关历史测试（`v336`, `v386`, `v337`, `v338`, `v3235`, `v3200`, `v3185`, `v3149`, `v3150`）兼容外提模块与 `engine.` 上下文。
- 新增 `tests/v3363_engine_recall_split.test.mjs`（8 条），登记至参考基准。
- 扫描器契约：退出码三档：0 卫生 / 1 真缺陷 / 2 结构漂移。
- 实施期按铁律只跑定向判据与定点回归，绝不跑全量。

"""
cl = new_sec + cl
with open('CHANGELOG.md', 'w', encoding='utf8') as f:
    f.write(cl)

# 6. TODO.md
with open('TODO.md', 'r', encoding='utf8') as f:
    lines = f.readlines()
lines[1] = f"> **最近更新：v{V_NEW}**（index.js 剥离第三批：recallMemory 核心召回管线 718 行外提为 engine-recall.js IIFE 模块；index.js 20950→20249 行，净减 701 行；manifest extra_js 136 项；六源同源抬版 {V_NEW}）。\n"
with open('TODO.md', 'w', encoding='utf8') as f:
    f.writelines(lines)

# 7. host_beast_baseline.json
with open('tests/audit/host_beast_baseline.json', 'r', encoding='utf8') as f:
    hb = json.load(f)
hb['total_lines'] = 20249
hb['index_total_lines'] = 20249
hb['index_line_ceiling'] = 20649
hb['line_budget']['ceiling'] = 20649
hb['line_budget']['history'].append({
    "version": f"v{V_NEW}",
    "ceiling": 20649,
    "member_ceiling": 823,
    "reason": f"[v{V_NEW}] index.js 剥离第三批：recallMemory 核心召回管线（718行）及 5 个纯函数剥离至 engine-recall.js，宿主保留委托桩 + bindDeps 注入面。index.js 从 20950 降至 20249 行（净减 701 行）。"
})
with open('tests/audit/host_beast_baseline.json', 'w', encoding='utf8') as f:
    json.dump(hb, f, indent=2)
    f.write('\n')

print("Bump script finished successfully.")
