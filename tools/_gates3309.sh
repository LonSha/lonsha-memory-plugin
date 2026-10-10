#!/bin/bash
cd /home/user/lonsha-memory-plugin || exit 9
node tools/gen_state_report.mjs --write > /tmp/sr3309.txt 2>&1
echo "state-report rc=$?"
tail -1 /tmp/sr3309.txt
for f in tests/audit/dead_code_budget.mjs tests/audit/scan_*.mjs; do
  b=$(basename "$f")
  case "$b" in _*) continue;; esac
  if node "$f" > "/tmp/gates3309_$b.txt" 2>&1; then
    :
  else
    echo "FAIL $b rc=$?"
    tail -4 "/tmp/gates3309_$b.txt"
  fi
done
echo ALLGATESDONE