// tests/audit/_mo8_branch_probe.mjs — M-O8 第四刀 · 取证探针（只读，下划线前缀 = 非在役门禁）
//
// 主题：**世界推进账本写入必须经过分支判定**。
//
// 修前实测（v3.307.0 基线，见 CHANGELOG v3.309.0）：
//   承诺块 / 认知块 / 秘密块**早于**分支守护 295~422 行；
//   `_branchOk` 的四个使用点里，21 个世界推进写入口被覆盖 **0** 处
//   ⇒ 翻页 / 重生成后，被放弃那一分支的账照旧入账。
//
// 修后（v3.309.0）本探针改测**真形态**。为什么不用修前那套「±2 行邻近法」：
//   修后的闸在**块头条件串**里，不在任何写入口的邻近行 —— 邻近法对它恒为 0，
//   于是「已经修好」与「闸根本没接上」在读数上同形（本仓点名的假绿第二形态：
//   判据对着一个不会出问题的位置断言）。故改测四条结构读。
//
//   R1 判定前移：`guardApply` 调用行 < 世界推进块首行（也 < 秘密块）
//   R2 块头有闸：世界推进块的 if 条件串里含分支判定变量
//   R3 判不了放行：判定对象里同时有 `accept` 与 `judged`，且放行纪律有留档
//      （judged === false 不是「有问题」，硬拦等于把世界推进关掉）
//   R4 读数在场：`_wpBranchSkip` / `_branchVerdict` 都被**写**（零写的读数 = 等于没写）
//
// 退出码：0 = 读数齐（无论缺陷在不在）；1 = 探针自身判不了（fail-closed）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.LONSHA_AUDIT_ROOT || path.resolve(fileURLToPath(new URL('..', import.meta.url)), '..');
const SRC = path.join(ROOT, 'index.js');

function lines(p) { return fs.readFileSync(p, 'utf-8').split('\n'); }

function lineOf(ls, re, tag) {
    for (let i = 0; i < ls.length; i++) if (re.test(ls[i])) return i + 1;
    throw new Error('[probe] 判不了：找不到锚点 ' + tag);
}

const ls = lines(SRC);
const src = ls.join('\n');

const guardCallLine = lineOf(ls, /this\._branchGuard\.guardApply\(message/, 'guardApply 调用');
const wpBlockLine = lineOf(ls, /worldProgressEnabled && extracted/, '世界推进块');
const secretWriteLine = lineOf(ls, /const secretReqs = Array\.isArray\(extracted\.secrets\)/, 'secretReqs');
const promiseWriteLine = lineOf(ls, /this\.worldProg\.addPromise\(/, 'addPromise');

const wpCondLine = ls[wpBlockLine - 1];
const hasGate = /&&\s*_branchOk/.test(wpCondLine) || /_branchOk\s*&&/.test(wpCondLine);

const verdictDeclared = /accept:\s*!!g0\.accept/.test(src) && /judged:\s*!!g0\.judged/.test(src);
const failOpenNote = src.includes('judged === false') && src.includes('隔离漏一点');

const wpSkipWritten = /this\._wpBranchSkip\s*=\s*\{/.test(src);
const verdictWritten = /this\._branchVerdict\s*=\s*\{\s*accept/.test(src);
const wpSkipAudit = src.includes("'wp-skip'");

const out = [];
out.push('R1 行序：guardApply=' + guardCallLine + ' 世界推进块=' + wpBlockLine +
    ' 秘密块=' + secretWriteLine + ' 承诺块=' + promiseWriteLine);
out.push('R1 判定早于世界推进 ' + (guardCallLine < wpBlockLine) + '（差 ' + (wpBlockLine - guardCallLine) + ' 行）；' +
    '判定早于秘密块 ' + (guardCallLine < secretWriteLine));
out.push('R2 块头条件：' + wpCondLine.trim().slice(0, 140));
out.push('R2 块头含分支闸 ' + hasGate);
out.push('R3 判定对象含 accept+judged ' + verdictDeclared + '；放行纪律留档 ' + failOpenNote);
out.push('R4 _wpBranchSkip 被写 ' + wpSkipWritten + '；_branchVerdict 被写 ' + verdictWritten +
    '；审计落点 wp-skip ' + wpSkipAudit);

const fixed = (guardCallLine < wpBlockLine) && (guardCallLine < secretWriteLine) &&
    hasGate && verdictDeclared && wpSkipWritten && verdictWritten;
out.push('BRANCH_GATE_IN_PLACE=' + fixed);
console.log(out.join('\n'));