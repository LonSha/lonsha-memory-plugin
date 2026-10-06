// 审计基建 LW（v3.286.0）：计划陈旧口径扫描（唯一现行排序 + 旧节陈旧标记 + 已交付项不得复活）
// ------------------------------------------------------------
// 为什么存在（O8 第二刀的第二条真缺口）：
//   optimization-plan 的 O8 验收原文写着「已交付条目不再列为下一步；新增提案不得把旧研究的
//   『当时未做』复活为当前待办」。而修前 PLAN.md 里**有多处**「优先级 / 起手」节：
//     · 文首「当前执行状态」（现行口径）；
//     · 2026-10-04 那一轮的「## 优先级」（其 A1/A2/T2/A3/X1 早已交付）；
//     · 「## 起手两件（历史节）」。
//   读者的真实困境不是「哪节错了」，而是**没有任何东西告诉他人该读哪一节** ——
//   文档内部没有真假之分，只有新旧之别；而新旧之别**不可判**，就等于没有现行排序。
//   本扫描器把「现行排序的唯一性」变成可判事实。
//
// 判定策略（每条都对应一个**可磁盘重算 / 自洽可判**的事实）：
//   P1 现行节必须在场，且**恰有一个**：PLAN 里标题含「唯一现行排序 · 判据」的节行数 == 1
//      （0 ⇒ 没有现行排序；≥2 ⇒ 读者又回到「哪节算数」的困境）
//   P2 每个**排序型旧节**必须带陈旧标记：标题匹配 /优先级|起手/ 的 H2 节，
//      其后 3 行内须出现「陈旧」字样（现行节自身豁免：它就是现行）
//   P3 当前执行状态行必须与代码版本同源：文首「当前执行状态（…，vX.Y.Z）」的版本 == index.js VERSION
//      （现行排序节若停在旧版本，读者会把旧排序当现行）
//   P4 已交付条目不得复活为本节「下一步」：本节的下一步三条里，若出现「已交付**N 刀**」的 Op
//      台账已收口的编号（O1–O7，其状态为「已交付各自定向门」），该条必须带「已交付 / 收口 / 交付」字样
//      —— 否则就是 O8 原文说的「把已交付条目列为下一步」
//   P5 登记 ↔ 磁盘：`tests/audit/plan_currency.tsv` 登记本判据读到的节名（一行一个），
//      与实际读到的排序型节集合双向齐全（新增排序节不登记 ⇒ 红）
//   P6 契约声明：登记 note 必须写「唯一现行排序」与「陈旧标记」两句
//   P7 fail-closed：PLAN 缺失 / 登记缺失或非法 ⇒ exit 2（没得判 ≠ 通过）
//   P8 [v3.287.0] 已交付的 **X 项**不得复活为本节「下一步」—— 与 P4 同源，但面补一类：
//      P4 只钉 O1–O8，X 系列不在它的枚举面内（实测：已于 v3.270.0 交付的 X1 曾被写进第 3 条待做，
//      且名字写错）。判据只认**条目标题**（`N. **…**`）里列出的编号 ——
//      ★ 首版取「编号 ±N 字符窗口」判有无状态词，负控制当场漏判：破坏文本自带的说明
//        「X1 已于 v3.270.0 交付」也在窗口内，破坏被自己的解释掩盖（H5 判据纯度）。
//        正文叙述里的 X 编号一律不看 —— 它往往正是在陈述「别再做」。
//
// 退出码：0=卫生  1=真缺陷（陈旧节无标记 / 已交付项复活 / 双现行节）  2=结构漂移
//
// 边界（诚实）：
//   ① **不判「哪一条该排前面」** —— 排序是人的决定，本门只判「现行与否可辨」；
//   ② 不判正文叙述的真伪（那是 scan_claim_truthfulness / scan_doc_truthfulness 的面）；
//   ③ 不扫 .agents/notes/proposed/ 下的计划原文（它们是 `proposed` 快照，按定义就是彼时判断）。
import fs from 'fs';
import path from 'path';
const FIXTURE_MODE = process.env.LONSHA_AUDIT_FIXTURE === '1';
const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const PLAN = path.join(ROOT, 'PLAN.md');
const REG = path.join(ROOT, 'tests', 'audit', 'plan_currency.tsv');
const IDX = path.join(ROOT, 'index.js');
const problems = [];
const notes = [];
const drift = (m) => { console.error('[plan-currency] ' + m + '（结构漂移）'); process.exit(2); };
const bad = (m) => { problems.push(m); };

// ---------- P7 fail-closed ----------
for (const [p, label] of [[PLAN, 'PLAN.md'], [REG, 'tests/audit/plan_currency.tsv'], [IDX, 'index.js']]) {
    if (!fs.existsSync(p)) drift('缺少 ' + label + ' ⇒ 无法核对，结构漂移');
}
const planSrc = fs.readFileSync(PLAN, 'utf8');
const idxSrc = fs.readFileSync(IDX, 'utf8');
const vM = /const VERSION = '([0-9]+[.][0-9]+[.][0-9]+)'/.exec(idxSrc);
if (!vM) drift('index.js 里读不到 const VERSION ⇒ 版本真源失效');
const VERSION = vM[1];
const lines = planSrc.split('\n');

// ---------- 面自证（非零下限）----------
if (lines.length < 40) drift('PLAN 只有 ' + lines.length + ' 行（下限 40）⇒ 枚举塌陷，拒绝给结论');

/** 所有 H2 节标题行：[行号(1-based), 标题]。 */
const h2 = [];
for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(.*)$/.exec(lines[i]);
    if (m) h2.push([i + 1, m[1].trim()]);
}
if (h2.length < 4) drift('PLAN 的 H2 节只有 ' + h2.length + ' 个（下限 4）⇒ 结构塌陷，拒绝给结论');

/** 排序型节：标题里讲「优先级 / 起手 / 现行排序」的，都是读者可能当排序读的节。 */
const SORT_RE = /优先级|起手|现行排序/;
const CURRENT_RE = /唯一现行排序/;
const sortSections = h2.filter(([, t]) => SORT_RE.test(t));
const currentSections = sortSections.filter(([, t]) => CURRENT_RE.test(t));

// ---------- P1 现行节恰有一个 ----------
if (currentSections.length === 0) {
    bad('PLAN 里找不到「唯一现行排序」节 ⇒ 读者无从分辨哪一节是现行排序（本门存在的理由）');
} else if (currentSections.length > 1) {
    bad('PLAN 里有 ' + currentSections.length + ' 个「唯一现行排序」节（第 '
        + currentSections.map(([n]) => n).join(' / ') + ' 行）⇒ 「唯一」这个词自相矛盾');
} else {
    notes.push('现行排序节在第 ' + currentSections[0][0] + ' 行');
}
const currentLine = currentSections.length === 1 ? currentSections[0][0] : -1;

// ---------- P2 每个排序型旧节必须带陈旧标记 ----------
for (const [ln, title] of sortSections) {
    if (ln === currentLine) continue;              // 现行节自身豁免
    const window = lines.slice(ln, Math.min(ln + 3, lines.length)).join('\n');
    if (!window.includes('陈旧')) {
        bad('PLAN 第 ' + ln + ' 行的排序型节「' + title + '」未带陈旧标记 ⇒ '
            + '读者会把它与现行排序并列读（本节属「已交付但仍在文里」的那一类）');
    }
}

// ---------- P3 当前执行状态行与代码版本同源 ----------
{
    const m = /当前执行状态（[^，]*，v?([0-9]+[.][0-9]+[.][0-9]+)）/.exec(planSrc);
    if (!m) {
        bad('PLAN 缺「当前执行状态（…，vX.Y.Z）」行（读者据此判断哪一节是现行的）');
    } else if (m[1] !== VERSION) {
        bad('PLAN 当前执行状态写 v' + m[1] + ' ≠ index.js 真值 v' + VERSION
            + '（现行口径停在旧版本 ⇒ 旧排序会被当现行读）');
    } else {
        notes.push('当前执行状态版本 v' + m[1]);
    }
}

// ---------- P4 已交付条目不得复活为本节「下一步」 ----------
/* [v3.287.0] 现状节那一行（含「优化计划 O1–O8」的那行）。 */
function statusLineOf(src) {
    return src.split('\n').find((l) => l.includes('优化计划 O1–O8')) || '';
}
/* 从 pos 起，到**下一个 O 编号段**（`**O<数字>` 或 `O<数字>（`）或行尾为止。 */
function nextSegEnd(line, pos) {
    const rest = line.slice(pos + 1);
    const m = /\*\*O[1-8]|O[1-8]\s*（/.exec(rest);
    return m ? pos + 1 + m.index : line.length;
}
// 判据来源：optimization-plan O8 原文「已交付条目不再列为下一步」。
//   Op 的交付事实写在文首现状节：「O1（…）/ O2（…）…已交付各自定向门」。
//
//   ★ [v3.287.0 判据纯度修正 · H5] 首版按「编号 ±40/120 字符窗口」找状态词，**负控制漏判**：
//     `seg` 的后 120 字符会跨到**相邻条目**（第 3 条常写「X1 已于 v… 交付（勿再列入待办）」），
//     那个「交付」被当成第 1 条自己的状态词 ⇒ 未标状态的 O6 被放行。
//     实测：`1. **O6 推进**（按计划继续）。` 与第 3 条的说明同处一个 120 字符窗口时，判据静默通过。
//     修法同 P8：只认**条目标题**（`N. **…**` 的加粗段）里点名的编号 ——
//     状态词必须出现在**同一个标题内**（如 `**O8 收口**`），跨条、跨正文一律不算。
if (currentLine > 0) {
    const after = lines.slice(currentLine, currentLine + 12).join('\n');
    /* 交付事实只认**该编号自己那一段**里的措辞 —— 不能靠「整行里有『已交付各自定向门』」
     * 就把行内所有 O 编号都当已交付：现状节一旦把「部分交付的 O2」与「六项已交付」并列写，
     * 那种粗读法会把未交付（未收口）的 O2 也算成已交付，从而误报「O2 复活」。
     * 段界：从该编号起，到下一个 `**O<数字>` 或行尾为止。 */
    const delivered = new Set();
    const statusLine = statusLineOf(planSrc);
    for (const m of statusLine.matchAll(/O([1-8])\s*（/g)) {
        const seg = statusLine.slice(m.index, nextSegEnd(statusLine, m.index));
        /* 「部分交付 / 未收口 / 未执行」是**未交付**的显式标记，优先级高于「已交付」字样。 */
        if (/部分交付|未收口|未执行|尚未/.test(seg)) continue;
        /* 形态 A：编号自己那一段自带状态词（`O7（…，已交付六刀台账：…）`）。 */
        if (/已交付/.test(seg)) { delivered.add(m[1]); continue; }
        /* 形态 B：**收尾总结句**（`…）**六项已交付各自定向门**；`）—— 编号逐项列出、
         *   交付事实写在行内末尾的总结句里，这是人写计划时的自然写法（实测本轮 PLAN 即此形态）。
         *   判据要让位于文档，不该逼文档为判据改写成「每段自带状态词」的八股。
         *   收窄条件：总结句须含「N 项已交付」且 N 等于行内 O 编号个数，才承认它覆盖全行。 */
        if (m[1] === '1') {
            const nums = [...statusLine.matchAll(/O([1-8])\s*（/g)].map((x) => x[1]);
            const uniq = [...new Set(nums)];
            const sm = /([一二三四五六七八]|\d+)\s*项已交付/.exec(statusLine);
            const cn = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8 };
            const claim = sm ? (cn[sm[1]] || Number(sm[1])) : 0;
            if (claim > 0) {
                /* 逐段复核：被显式标「部分交付/未收口/未执行」的编号仍须排除。 */
                for (const n of uniq) {
                    const p = statusLine.indexOf('O' + n + '（');
                    const s = statusLine.slice(p, nextSegEnd(statusLine, p));
                    if (/部分交付|未收口|未执行|尚未/.test(s)) continue;
                    delivered.add(n);
                }
                notes.push('P4 交付事实按**行尾总结句**读：声明 ' + claim + ' 项 / 行内 ' + uniq.length
                    + ' 个编号（旧形态「每段自带状态词」同样接受）');
            }
        }
    }
    const deliveredAll = delivered.size >= 6;
    if (deliveredAll) {
        /* ★ 只认**条目标题**里的编号：那是「待做清单」的位置；状态词须在同一标题内。 */
        const bulletRe = /^\s*\d+[.]\s*\*\*(.+?)\*\*/gm;
        let hit = 0;
        for (const bm of after.matchAll(bulletRe)) {
            const title = bm[1];
            for (const m of title.matchAll(/O([1-8])\b/g)) {
                const num = m[1];
                if (!delivered.has(num)) continue;
                if (/已交付|收口|交付/.test(title)) continue;   // 状态词在**本标题内**才放行
                hit++;
                bad('现行排序节第 ' + bm[0].trim().split('.')[0] + ' 条**标题**里仍把已交付的「O' + num
                    + '」列为待做却未标状态 ⇒ 已交付条目被复活为待办（O8 验收原文禁止）');
            }
        }
        notes.push('P4 已交付编号 ' + [...delivered].sort().join(',') + '（标题面命中 ' + hit
            + ' 处；跨条说明（如「X1 已于 v… 交付」）不参与判定）');
    } else {
        notes.push('文首现状节未呈现「O1–O7 已交付各自定向门」形态，P4 本档跳过（如实报出）');
    }
}
// ---------- P8 已交付的 X 项不得复活为本节「下一步」 ----------
// [v3.287.0 新增] 判据来源同 P4，但面补一类：O8 原文「已交付条目不再列为下一步」对
//   拓展计划 X 系列同样成立，而 P4 只钉「O1–O8」，X 系列完全不在它的枚举面内 ——
//   实测本刀修前，第 3 条把**已于 v3.270.0 交付的 X1** 写进了「X 系列首批（待做）」，
//   且把它的名字写错（写成「结构化证据查询与完整度」，实为「世界书干跑从取数走向预演」）。
//
//   ★ 判据纯度（H5）：首版取「编号 ±40/120 字符窗口」判有无状态词，**负控制当场漏判** ——
//     破坏文本 `3. **X 系列首批（X1 结构化证据查询与完整度 / …）** —— X1 已于 v3.270.0 交付（勿再列入待办）`
//     里那条**说明**本身就含「已交付」，判定窗口跨过去就命中白名单，破坏被自己的解释掩盖。
//     修法：判据只认**条目标题**（`N. **…**` 的加粗段）里列出的编号 —— 那是「待做清单」的位置；
//     正文叙述里的 X 编号（如「X1 已于 v3.270.0 交付」）一律不看，因为它正是在陈述「别再做」。
if (currentLine > 0) {
    const after = lines.slice(currentLine, currentLine + 12).join('\n');
    const xStatusLine = lines.find((l) => l.includes('拓展计划 X1–X8')) || '';
    const xDelivered = new Set();
    for (const m of xStatusLine.matchAll(/X([1-8])\s*\*{0,2}\s*已交付/g)) xDelivered.add(m[1]);
    /* 区间写法「X2–X8 尚未实施」里的编号是**未交付**方，须排除（防把 X2 误记为已交付）。 */
    for (const m of xStatusLine.matchAll(/X([1-8])\s*[–\-—]\s*X([1-8])\s*\*{0,2}\s*尚未实施/g)) {
        const a = Number(m[1]); const b = Number(m[2]);
        for (let i = a; i <= b; i++) xDelivered.delete(String(i));
    }
    if (xDelivered.size) {
        /* 条目标题形态：行首 `N. **` … `**`（本节的下一步三条）。只在这里找编号。 */
        const bulletRe = /^\s*\d+[.]\s*\*\*(.+?)\*\*/gm;
        let hit = 0;
        for (const bm of after.matchAll(bulletRe)) {
            const title = bm[1];
            for (const m of title.matchAll(/X([1-8])\b/g)) {
                if (!xDelivered.has(m[1])) continue;
                hit++;
                bad('现行排序节第 ' + bm[0].trim().slice(0, 3) + ' 条**标题**里仍把已交付的「X' + m[1]
                    + '」列为待做（文首现状节记为已交付）⇒ 已交付的 X 项被复活为待办（O8 验收原文禁止）');
            }
        }
        notes.push('P8 X 系列已交付编号：' + [...xDelivered].sort().join(',')
            + '（标题面命中 ' + hit + ' 处；说明面（如「X1 已于 v… 交付」）不参与判定）');
    } else {
        notes.push('文首现状节未呈现「X… 已交付」形态，P8 本档跳过（如实报出）');
    }
}
// ---------- P5 登记 ↔ 磁盘 双向齐全 ----------
{
    const raw = fs.readFileSync(REG, 'utf8');
    const listed = raw.split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'));
    if (!listed.length) drift('plan_currency.tsv 里一条有效登记都没有 ⇒ 名册为空，无法核对');
    const dup = listed.filter((x, i) => listed.indexOf(x) !== i);
    if (dup.length) bad('plan_currency.tsv 有重复行：' + [...new Set(dup)].join(' / '));
    const live = sortSections.map(([, t]) => t);
    const missing = live.filter((t) => !listed.includes(t));
    const extra = listed.filter((t) => !live.includes(t));
    if (missing.length) bad('实际读到的排序型节未登记（新增排序节必须登记）：' + missing.join(' / '));
    if (extra.length) bad('登记了但磁盘上已没有该排序型节（退位项须一并摘掉）：' + extra.join(' / '));
    if (!missing.length && !extra.length) notes.push('登记 ↔ 磁盘 ' + live.length + ' 个排序型节双向齐全');
}

// ---------- P6 契约声明 ----------
{
    const regSrc = fs.readFileSync(REG, 'utf8');
    if (!regSrc.includes('唯一现行排序')) bad('plan_currency.tsv 丢了「唯一现行排序」契约声明');
    if (!regSrc.includes('陈旧标记')) bad('plan_currency.tsv 丢了「陈旧标记」契约声明');
}

// ---------- 汇总 ----------
const readonly = FIXTURE_MODE ? '（夹具模式）' : '';
if (problems.length) {
    console.error('[plan-currency] 发现 ' + problems.length + ' 个真缺陷：');
    for (const p of problems) console.error('  · ' + p);
    process.exit(1);
}
for (const n of notes) console.log('[plan-currency] 注：' + n);
console.log('[plan-currency] ✓ 计划陈旧口径卫生：现行节 1 个 · 排序型节 ' + sortSections.length
    + ' 个（旧节全带陈旧标记）· 执行状态 v' + VERSION + readonly);
process.exit(0);