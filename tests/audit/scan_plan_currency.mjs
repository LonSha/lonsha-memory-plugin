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
// 判据来源：optimization-plan O8 原文「已交付条目不再列为下一步」。
//   Op 的交付事实写在文首现状节：「O1（…）/ O2（…）…已交付各自定向门」。
//   本判据只钉一条**可机械核**的形态：若本节下一步里点名了某个 O 编号，
//   而该编号在文首现状节被记为「已交付」，则该条必须自带「已交付 / 收口 / 交付」字样。
if (currentLine > 0) {
    const after = lines.slice(currentLine, currentLine + 12).join('\n');
    const delivered = new Set();
    for (const m of planSrc.matchAll(/O([1-8])（[^）]*）\s*\/|O([1-8])（[^）]*）(?=[^\n]*已交付各自定向门)/g)) {
        if (m[1]) delivered.add(m[1]);
    }
    /* 更稳的读法：现状节那一整行里，逐个 Op 看它后面是否紧跟「已交付各自定向门」。 */
    const statusLine = lines.find((l) => l.includes('优化计划 O1–O8')) || '';
    for (const m of statusLine.matchAll(/O([1-8])（/g)) delivered.add(m[1]);
    const deliveredAll = delivered.size >= 7 && /已交付各自定向门/.test(statusLine);
    if (deliveredAll) {
        for (const m of after.matchAll(/O([1-8])\b/g)) {
            const num = m[1];
            if (!delivered.has(num)) continue;
            const segStart = Math.max(0, m.index - 40);
            const seg = after.slice(segStart, m.index + 120);
            if (!/已交付|收口|交付/.test(seg)) {
                bad('现行排序节的下一步里出现「O' + num + '」（文首现状节记为已交付）却未标状态'
                    + ' ⇒ 已交付条目被复活为待办（O8 验收原文禁止）');
            }
        }
    } else {
        notes.push('文首现状节未呈现「O1–O7 已交付各自定向门」形态，P4 本档跳过（如实报出）');
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