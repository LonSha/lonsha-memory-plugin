import fs from 'fs';
import path from 'path';
import { stripComments } from '/home/user/lonsha-memory-plugin/tests/_audit_lib.mjs';
const ROOT = '/home/user/lonsha-memory-plugin';
const src = fs.readFileSync(path.join(ROOT, 'index.js'), 'utf8');

// R2a 形态判据（原版两条正则 + 取库口）：与扫描器逐字同义
function r2aForm(txt) {
  const s = stripComments(txt);
  return {
    replayDrop: /replayDrop\s*\(/.test(s),
    replayShift: /replayShift\s*\(/.test(s),
    lib: /_ledgerReplayLib\s*\(/.test(s),
  };
}

const cases = [
  ['N9  shift 调用死分支', '? _lr.replayShift(this, deleted)', '? (false && _lr.replayShift(this, deleted))'],
  ['N10 shift 传空宿主  ', '_lr.replayShift(this, deleted)', '_lr.replayShift({}, deleted)'],
  ['N11 shift 报告不落  ', '? _lr.replayShift(this, deleted)', '? (_lr.replayShift(this, deleted), null)'],
];

console.log('原版 R2a 形态 =', JSON.stringify(r2aForm(src)));
for (const [name, anchor, repl] of cases) {
  const hits = src.split(anchor).length - 1;
  if (hits !== 1) { console.log(name, '锚点命中', hits, '（跳过）'); continue; }
  const broken = src.replace(anchor, repl);
  const f = r2aForm(broken);
  const allGreen = f.replayDrop && f.replayShift && f.lib;
  console.log(name, '锚点=1  R2a 形态 =', JSON.stringify(f), '→', allGreen ? 'R2a 全绿（漏检）' : 'R2a 翻红');
}
