/* 退出码（[v3.247.0] 补自述）：本档是**探针**（下划线前缀 ⇒ run.mjs 的目录发现跳过它，
 *   不进审计段）。0 = 探针跑完并打印读数；1 = 结构漂移（被探的模块/锚点不在）。
 *   它**不产生 2**：探针的语义是「打印现场」，不是「给结论」。
 *   [留痕] 本行原写「0/1/2 三态」，与代码不符 —— 探针里没有 exit 2。 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { stripComments } from '../_audit_lib.mjs';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
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
