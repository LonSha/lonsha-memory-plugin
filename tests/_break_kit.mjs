/* ============================================================
 * [v3.247.0] 破坏形态库：唯一真源
 * ------------------------------------------------------------
 * 为什么需要它（本轮实测，不是整洁性偏好）：
 *   破坏工具在 27 个文件里各写一份，实测分化出 ——
 *     · 名字 5 种：breakSource(14 文件) / breakText(9) / mutateOnce(4) /
 *       mk·mkBroken(匿名工厂, 4) / 内联 replace(2)；
 *     · 参数序 4 种：breakSource(src, anchor, repl) /
 *       breakSource(src, from, to, tag) / breakSource(from, to, tag)（闭包捕获 idxSrc）/
 *       mutateOnce(dir, rel, from, to)（落盘变体）；
 *     · 错误类型 2 种：assert.equal 产生的 AssertionError（20 文件）/ 裸 throw Error；
 *     · 校验强度 3 种：只查命中次数 / 命中 + 同值 / 命中 + 同值（措辞各异）。
 *   后果是口径靠人名记：`拒绝破坏` 只在 9/27 个文件里出现 —— 同一份纪律，
 *   在 18 个文件里根本没有出口，读代码的人无法判断谁在守、守到什么程度。
 *   这跟 v3.191 收敛 stripComments（当时 9 份实现、4 种变体）是同一族病。
 *
 * 四条口径（一条也不可省）：
 *   ① 锚点必须**恰中 1 次**，否则拒绝破坏：0 次是打偏（判据对原文件断言 = 假绿第一形），
 *      多次是「不是定点」（负控制测的已不是那个点）；
 *   ② 替换必须**真的改变源码**：同值替换会让「破坏副本」等于原件，
 *      负控制退化成对原文件断言（假绿第一形，最隐蔽的一种）；
 *   ③ 必须以 **AssertionError** 抛出：本仓 30+ 处历史断言面同时依赖
 *      `assert.throws(..., assert.AssertionError)`（类型）与正则匹配（消息），
 *      换成裸 Error 会**静默改写**这些断言的含义（仍绿，但测的东西变了）；
 *   ④ 错误消息必须**同时**含历史上出现过的措辞：口径同源之后，
 *      接收方按自己原来的正则断言仍然成立，收编才不需要动 30+ 处断言。
 *      这条看起来像「迁就旧测试」，方向其实相反 —— 它把接收方从
 *      「记得谁用什么词」变成「真源一处可写」：改措辞必须改这里，而不是改 27 个文件之一。
 *
 * 明确不在本库范围（登记在门禁的 NOT_SCOPE 里，附理由）：
 *   `withTree` / `mkTree` / `mirror` / `withMirror` / `brokenCopies` ——
 *   它们是**夹具与运行器**（造独立树、跑扫描器、收 status/out），不是破坏形态本身；
 *   各文件要造的树不同（只读三文件 / withDocs / 整仓 cpSync），本就该各写一份。
 *   本库只收「把源码改坏」这一步，运行器怎么用它是调用方的事。
 * ============================================================ */
import { AssertionError } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

/**
 * 历史断言面依赖的措辞（实测 30+ 处）。**一条消息里全部纳入**：
 *   /拒绝破坏/            —— v3203/v3204/v3206/v3241/v3242/v3243/v3244/v3246、scan_audit_lib_consolidation
 *   /锚点命中/            —— v3235_sleep_awaken
 *   /命中 0 次/           —— v3171（零命中场景）
 *   /恰中 1 次/           —— v3213/v3214/v3216/v3217/v3218/v3219/v3220
 *   /要求恰好 1 次/       —— scan_audit_lib_consolidation
 *   /锚点应恰好命中 1 次/ —— v3225/v3226/v3235_rollback
 *   /必须真的改变源码/    —— v3174/v3175/v3176/v3177/v3180/v3213/v3214/v3215/v3227/v3235_sleep
 * 改这张表 = 改全仓接收口径，必须同时复核门禁 scan_break_kit.mjs 的 C1 判据。
 */
export const BREAK_MSG = Object.freeze({
  refuse: '拒绝破坏',
  hits: '锚点命中',
  exact: '要求恰好 1 次',
  targeted: '恰中 1 次',
  shouldBeOne: '锚点应恰好命中 1 次',
  mustChange: '必须真的改变源码',
});

/** 拒绝破坏：一律 AssertionError（口径 ③），消息内含全部历史措辞（口径 ④）。 */
function throwMsg(message) {
  throw new AssertionError({ message });
}

/* 消息**构造**（纯函数，全仓唯一一处拼装点）。
 *   为什么把它导出来（不是为了让测试好写）：接收方（30+ 处 `assert.throws(..., /拒绝破坏/)`）
 *   手里拿的是「消息片段」。若片段与拼装点各写一份，改了拼装点而片段没跟上，
 *   断言会退化成「抛了就通过」——这是本仓最贵的形态之一。
 *   导出纯函数之后，门禁可以让声明面与接收面**自动对差**：
 *   每个接收用的片段都必须是这里拼出来的一条消息的子串。 */
const labelTail = (label) => (label ? ' 破坏【' + label + '】' : '');
const anchorTail = (anchor) => (anchor === undefined || anchor === null ? '' : '：' + String(anchor).slice(0, 80));
export function hitsMismatchMessage(n, label, anchor) {
  return BREAK_MSG.refuse + '（' + BREAK_MSG.hits + ' —— 偏离即拒绝）：'
    + BREAK_MSG.hits + ' ' + n + ' 次（实 ' + n + ' 次）（'
    + BREAK_MSG.exact + '；' + BREAK_MSG.targeted + '、' + BREAK_MSG.shouldBeOne + '）'
    + labelTail(label) + anchorTail(anchor);
}
export function sameValueMessage(label, anchor) {
  return BREAK_MSG.refuse + '（' + BREAK_MSG.hits + ' —— 偏离即拒绝）：替换未改变源码 —— '
    + BREAK_MSG.mustChange + '（同值替换等于没破坏，负控制会退化成对原文件断言）'
    + labelTail(label) + anchorTail(anchor);
}
export function emptyAnchorMessage() {
  return BREAK_MSG.refuse + '（' + BREAK_MSG.hits + ' —— 偏离即拒绝）：锚点为空串（无法定点，任何源码都会命中）';
}

/**
 * 口径 ①：锚点必须恰中 1 次。
 *
 * 锚点有**两种**形态（实测都已在用，故真源必须都能收）：
 *   · 字符串锚点（21 个文件）：`src.split(a).length - 1`；
 *   · 正则锚点（v3174/v3175）：`(src.match(new RegExp(re.source, 'g')) || []).length`
 *     —— 注意必须**另起 g 标志**再数：原实现里 `src.match(/x/)` 不带 g，
 *     match 返回首个匹配对象而非数组，`|| []` 会把它当数组用，命中数恒为 1
 *     （「恰中 1 次」这条纪律在正则形态下曾经是**空转**的 —— 数不出 2 次、3 次）。
 *     这是收编时才发现的历史漏洞，按「同源之后一处可修」落在这里。
 * @returns {string|RegExp} 传入的锚点原样返回（便于调用方组消息）
 */
export function assertSingleHit(src, anchor, label) {
  const s = String(src);
  if (anchor instanceof RegExp) {
    const n = (s.match(new RegExp(anchor.source, 'g')) || []).length;
    if (n !== 1) throwMsg(hitsMismatchMessage(n, label, anchor));
    return anchor;
  }
  const a = String(anchor);
  if (a === '') throwMsg(emptyAnchorMessage());
  const n = s.split(a).length - 1;
  if (n !== 1) throwMsg(hitsMismatchMessage(n, label, a));
  return a;
}

/**
 * 破坏一次：口径 ①②③④ 全在此处，是全仓唯一的「把源码改坏」实现。
 * 别名 `breakSource` / `breakText` / `mutateOnce` 与它是**同一个函数对象**
 * （门禁按 `===` 断言同一性，不是比对文本 —— 一份实现，三个名字）。
 * @param {string} src 真源码
 * @param {string|RegExp} anchor 锚点（须恰中 1 次）
 * @param {string} replacement 替换串（须与锚点不同）
 * @param {string} [label] 归因标签（可选，供消息里点名）
 */
export function breakOnce(src, anchor, replacement, label) {
  assertSingleHit(src, anchor, label);
  const s = String(src);
  const out = anchor instanceof RegExp
    ? s.replace(anchor, replacement)
    : s.split(String(anchor)).join(String(replacement));
  if (out === s) throwMsg(sameValueMessage(label, anchor));
  return out;
}

/* 零改动的收编别名：27 个文件、200+ 处调用点按原名接线，调用点一行不动。
 * 为什么要别名而不是改名（实测教训）：收编的风险不在接口，而在**调用点批量改写** ——
 *   逐点改名会让「破坏打偏」和「改写打偏」混在同一次 diff 里，红绿都不可归因。
 *   同一性由门禁把守（breakText === breakOnce），别名不会各长各的。 */
export const breakSource = breakOnce;
export const breakText = breakOnce;
export const mutateOnce = breakOnce;

/**
 * 落盘变体（原 mutateOnce(dir, rel, from, to) 那一族）：破坏 + 写回镜像树。
 * 只此一份：镜像树怎么造、跑什么扫描器，仍由调用方决定（那是运行器的事）。
 */
export function breakFile(dir, rel, from, to, label) {
  const p = path.join(dir, rel);
  const src = fs.readFileSync(p, 'utf8');
  const broken = breakOnce(src, from, to, label || rel);
  fs.writeFileSync(p, broken);
  return broken;
}
