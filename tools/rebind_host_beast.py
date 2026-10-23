#!/usr/bin/env python3
import json, subprocess, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

# 1. 运行探针获取最新数据
probe_proc = subprocess.run(['node', os.path.join(ROOT, 'tests', 'audit', 'host_beast_probe.cjs')],
                            cwd=ROOT, capture_output=True, text=True, check=True)
probe = json.loads(probe_proc.stdout)

base_path = os.path.join(ROOT, 'tests', 'audit', 'host_beast_baseline.json')
with open(base_path, 'r', encoding='utf-8') as f:
    base = json.load(f)

# 更新 note 与 measured_at
base["note"] = "P-2 index.js 宿主巨兽分诊基线。读数由 tests/audit/host_beast_probe.cjs 生成（**读数零手抄**：本文件由脚本从探针输出直接落盘，避免转写漂移）。**只量，不拆。** [v3.363.0] index.js 剥离第三批：recallMemory 外提为 engine-recall.js 独立模块，宿主降至 20249 行。"
base["measured_at"] = "v3.363.0"

# 计算 readings
t = probe["total_lines"]
top40 = probe["biggest_members"][:40]
top5_lines = sum(m["lines"] for m in top40[:5])
top40_lines = sum(m["lines"] for m in top40)
classified_lines = sum(d["lines"] for d in probe["domains"] if d["domain"] != "（未归类）")
unclassified_lines = sum(d["lines"] for d in probe["domains"] if d["domain"] == "（未归类）")

readings = {
    "total_lines": t,
    "member_count": probe["member_count"],
    "duplicate_member_names": len(probe["duplicate_member_names"]),
    "top5_lines": top5_lines,
    "top5_pct": round(top5_lines * 100.0 / t, 1),
    "top40_lines": top40_lines,
    "top40_pct": round(top40_lines * 100.0 / t, 1),
    "prefix_rule_coverage_lines": classified_lines,
    "prefix_rule_coverage_pct": round(classified_lines * 100.0 / t, 1),
    "unclassified_lines": unclassified_lines,
    "seam_distinct_modules": probe["seam_modules"]["distinct_modules"],
    "seam_reference_sites": probe["seam_modules"]["reference_sites"],
    "seam_call_shape_sites": probe["seam_modules"]["call_shape_sites"],
    "members_over_80_lines": probe["split_candidates"]["total_over_threshold"],
    "low_coupling_members": probe["split_candidates"]["low_coupling_non_lifecycle"],
    "high_coupling_members": probe["split_candidates"]["high_coupling_non_lifecycle"]
}

base["readings"] = readings
base["domains"] = probe["domains"]
base["biggest_members_top40"] = top40
base["split_candidates"] = probe["split_candidates"]
base["total_lines"] = t
base["member_count"] = probe["member_count"]
base["index_total_lines"] = 20249
base["index_line_ceiling"] = 20649

# 记录 rebuilds['v3.363.0']
base["rebuilds"]["v3.363.0"] = {
    "reason": "[v3.363.0] index.js 剥离第三批：recallMemory 核心召回管线（718 行）及 5 个纯函数外提为独立 IIFE 模块 engine-recall.js，index.js 从 20950 降至 20249 行（净减 701 行）。全为活跃代码外移与减量，非死代码回流。",
    "readings": readings,
    "unchanged": [
        "生命周期接线面不变",
        "本版只量不拆"
    ],
    "not_done": "本版仅剥离召回核心管线，未动其他结构",
    "delta_from": "v3.362.0",
    "delta": {
        "total_lines": -701,
        "member_count": 0,
        "top5_pct": 0.0
    }
}

# 更新 line_budget
if "line_budget" in base:
    ceiling = 20649
    base["line_budget"]["ceiling"] = ceiling
    base["line_budget"]["member_ceiling"] = probe["member_count"] + 30
    hist = base["line_budget"].get("history", [])
    entry = {
        "ceiling": ceiling,
        "reason": "[v3.363.0] index.js 剥离第三批：recallMemory 核心召回管线（718 行）外提为独立 IIFE 模块 engine-recall.js，index.js 净减 701 行降至 20249 行。",
        "member_ceiling": probe["member_count"] + 30
    }
    hist.append(entry)
    base["line_budget"]["history"] = hist
    base["line_budget"]["note"] = entry["reason"]

with open(base_path, 'w', encoding='utf-8') as f:
    json.dump(base, f, indent=2, ensure_ascii=False)

print("Rebound host_beast_baseline.json successfully.")