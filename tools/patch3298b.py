#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""v3.298.0 补丁 B · 版本守卫 V2/V4 互斥修复（+ 夹具自证与文档同源）。

背景（本版定向复验实测）：
  `scan_version_guard.mjs` 的 V2 与 V4 互斥 ——
    V2：历史测试（非 frontier）不得把 VERSION 锁成「恰好等于当前版本」（只认串相等）；
    V4：至少一个测试以 `vnum` 恰好锚着当前版本（计数口径 = **全网任意文件** + **只认字面量**）。
  后果 ①：锚只写在当版套件、写成变量形 `vnum(idxVer)` ⇒ V4 计数 0；
  后果 ②：把锚写进历史文件 ⇒ V4 有数、V2 当场红（本版 v3297 那一行就是这么补的）。

修法：
  判据面：V2 补 vnum 数值锁形态；V4 只数**当版档案**（frontier）并收两种锚形态（字面量形 /
          本档自锚常量形）+ 唯一性。
  产物面：当版锚迁回当版套件 v3298（字面量入 vnum）；v3297 收回自己的出生版本锚与下界。
  夹具面：v3203 的 N4 按两种锚形态删空 + 新增三支（结构面 / 正控 / 保绿对照）。
纪律：每处替换断言**恰中 1 次**，全部锚点先校验、通过后统一写盘。
"""
import sys
from pathlib import Path

ROOT = Path('/home/user/lonsha-memory-plugin')
_log = []


class Doc(object):
    """一个待改文件：所有替换先在内存里做，最后统一写盘。"""

    def __init__(self, rel):
        self.rel = rel
        self.p = ROOT / rel
        self.s = self.p.read_text(encoding='utf-8')
        self.dirty = False

    def sub(self, old, new, why):
        n = self.s.count(old)
        if n != 1:
            sys.exit('[patch3298b] %s 锚点命中 %d 次（要求恰 1 次）：%s\n  锚点=%r'
                     % (self.rel, n, why, old[:200]))
        if old == new:
            sys.exit('[patch3298b] %s 同值替换等于没改：%s' % (self.rel, why))
        self.s = self.s.replace(old, new, 1)
        self.dirty = True
        _log.append((self.rel, why))

    def sub_line(self, prefix, newline, why):
        """按行首前缀替换整行（用于 tsv 这类长行文件）。"""
        lines = self.s.split('\n')
        idx = [i for i, l in enumerate(lines) if l.startswith(prefix)]
        if len(idx) != 1:
            sys.exit('[patch3298b] %s 行前缀 %r 命中 %d 行（要求恰 1 行）：%s'
                     % (self.rel, prefix, len(idx), why))
        lines[idx[0]] = newline
        self.s = '\n'.join(lines)
        self.dirty = True
        _log.append((self.rel, why))

    def append(self, text, sentinel, why):
        if sentinel in self.s:
            sys.exit('[patch3298b] %s 已含哨兵（重复执行会重复追加）：%s' % (self.rel, why))
        self.s = self.s + text
        self.dirty = True
        _log.append((self.rel, why))

    def write(self):
        if self.dirty:
            self.p.write_text(self.s, encoding='utf-8')


D = {rel: Doc(rel) for rel in [
    'tests/audit/scan_version_guard.mjs',
    'tests/v3297_state_report.test.mjs',
    'tests/v3298_mo3_receipt_single_source.test.mjs',
    'tests/v3203_version_guard_handover.test.mjs',
    'tests/audit/catalog_reference_consumers.tsv',
    'README.md',
    'CHANGELOG.md',
]}

# ══════════ ① 守卫：判据文本（V2 补形态 / V4 限定当版档案） ══════════
G = D['tests/audit/scan_version_guard.mjs']
G.sub(r'''//   V2 历史测试（非当版 frontier）不得用 assert.equal / assert.strictEqual /
//      String.includes 把 VERSION 锁成「恰好等于当前版本」
//   V3 历史测试里的版本下界（vnum('X.Y.Z')）不得高于当前版本
//      —— 高于现版即「承诺了一个还没发布的版本」，也是抬版仪式留下的痕迹
//   V4 当版锚点必须在场：至少一个测试以 vnum 恰好锚着当前版本
//      （锚点被静默删空时，版本守卫就失去基准，必须响）''',
      r'''//   V2 历史测试（非当版 frontier）不得把 VERSION 锁成「恰好等于当前版本」—— 两种形态都判：
//      ① 串相等 `assert.equal(v, '<当版>')`；
//      ② **vnum 数值锁** `assert.equal(vnum('<当版>'), 3298000)` 或本档自锚常量形
//         `const CUR = '<当版>'; … assert.equal(vnum(CUR), 3298000)`。
//      （带 `>=` / `<=` 的比较式不是锁 —— 那是 V3 管的下界/上界读数，整行放过。）
//      ② 是 [v3.298.0] 补的：旧实现只认串相等，于是「数值锁」在历史文件里存活，跨版即变成
//      「锁上一版」的死数；而 V4 的计数口径又只看 vnum —— 两条判据当时**互相踢球**（详见 V4）。
//   V3 历史测试里的版本下界（vnum('X.Y.Z')）不得高于当前版本
//      —— 高于现版即「承诺了一个还没发布的版本」，也是抬版仪式留下的痕迹
//   V4 当版锚点必须在**当版档案**（frontier）里且恰一处：至少一个 frontier 文件以 vnum 恰好
//      锚着当前版本。两种可判形态都收：字面量形 `vnum('<当版>')` 与**本档自锚常量形**
//      （`const CUR = '<当版>'; … vnum(CUR)`）。
//      （锚点被静默删空时，版本守卫就失去基准，必须响。）[v3.298.0] 修前的计数口径有两处失真，
//      且与 V2 互斥：**只认字面量** ⇒ 当版套件写成变量形时计数为 0；**数全网任意文件** ⇒
//      历史文件能替当版把数凑够（实测 v3296→v3297：唯一被计到的锚，正是 V2 要抓的那一行）。
//      修后锚只能住在当版档案里：V2 判「历史文件不得锁当版」、V4 判「当版档案必须有锚」，
//      两句话不再冲突。正例早就在场 —— v3263 的 `assert.equal(vnum('3.261.0'), 3261000)`
//      就是「锚放在当版自己的档案里」的形态，只是被上述两个口径同时漏掉。''',
      'V2/V4 判据文本（补 vnum 形态 + 限定当版档案）')

# ══════════ ② 守卫：硬锁判定 + 锚点在场判定（helper） ══════════
G.sub(r'''// 硬锁当前版本的两种形态。只认代码行，不认注释。
//   （旧实现用动态 RegExp 拼 current，转义层数一多就静默失灵 —— 本轮实测：
//    V2 在硬等号注入下仍报 exit 0。改为纯字符串判定，不经过正则转义。）
const ASSERT_CALL = /assert\.\s*(?:equal|strictEqual|deepStrictEqual|deepEqual)\s*\(/;
// 引号三态都要认：单引号 / 双引号 / 反引号。本轮实测只认单引号时，
//   注入 `assert.strictEqual(v, "<当前版>")` 会被静默放过（负控制 N1 当场漏判）。
const QUOTES = ["'", '"', '`'];
function quotedVersions(line) {
    return QUOTES.some((q) => line.includes(q + current + q));
}
function hardLocksCurrent(codeLine) {
    if (quotedVersions(codeLine) && ASSERT_CALL.test(codeLine)) return true;
    if (/includes\s*\(/.test(codeLine) && QUOTES.some((q) => codeLine.includes('const VERSION = ' + q + current + q + ';'))) return true;
    return false;
}
const boundRe = /vnum\(\s*'([0-9]+[.][0-9]+[.][0-9]+)'\s*\)/g;''',
      r'''// 硬锁当前版本的形态。只认代码行，不认注释。
//   （旧实现用动态 RegExp 拼 current，转义层数一多就静默失灵 —— 本轮实测：
//    V2 在硬等号注入下仍报 exit 0。改为纯字符串判定，不经过正则转义。）
const ASSERT_CALL = /assert\.\s*(?:equal|strictEqual|deepStrictEqual|deepEqual)\s*\(/;
// 引号三态都要认：单引号 / 双引号 / 反引号。本轮实测只认单引号时，
//   注入 `assert.strictEqual(v, "<当前版>")` 会被静默放过（负控制 N1 当场漏判）。
const QUOTES = ["'", '"', '`'];
function quotedVersions(line) {
    return QUOTES.some((q) => line.includes(q + current + q));
}
const boundRe = /vnum\(\s*'([0-9]+[.][0-9]+[.][0-9]+)'\s*\)/g;
/* [v3.298.0] 「本档自锚常量」：文件里把当版号写成 `const NAME = '<当版>'` 的那个名字（可能没有）。
 *   两种判据共用：V2 判 `vnum(NAME)` 的**数值锁**，V4 判 `vnum(NAME)` 也是**合法锚形**。
 *   为什么需要它：锚写成变量形（`vnum(CUR)`）时字面量只出现一次、且不在锚那一行上 —— 
 *   只看字面量的话，V2 漏判历史文件里的数值锁、V4 漏计当版档案里的锚。 */
function selfConstNames(txt) {
    const re = /const\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*'([0-9]+[.][0-9]+[.][0-9]+)'/g;
    return [...txt.matchAll(re)].filter((m) => vnum(m[2]) === vnum(current)).map((m) => m[1]);
}
/* [v3.298.0] V2 的第二形态：**vnum 数值锁** —— `assert.*equal` 且把当版号写进 vnum。
 *   为什么补：旧实现只认「串相等」，于是 `assert.equal(vnum('<当版>'), 3298000)` 在历史文件里
 *   活了下来 —— 跨版就是「锁上一版」的死数，而 V4 的计数口径又只认 vnum，两条判据互斥
 *   （「给当版补锚」的直觉动作必然踩 V2）。比较式整行放过：`>=` / `<=` 是 V3 管的下界/上界读数。 */
function vnumLocksCurrent(codeLine, names) {
    if (!ASSERT_CALL.test(codeLine)) return false;
    if (/(?:>=|<=)/.test(codeLine)) return false;
    if (codeLine.includes("vnum('" + current + "')")) return true;
    return names.some((nm) => new RegExp('vnum\\(\\s*' + nm + '\\s*\\)').test(codeLine));
}
function hardLocksCurrent(codeLine, names) {
    if (quotedVersions(codeLine) && ASSERT_CALL.test(codeLine)) return true;
    if (/includes\s*\(/.test(codeLine) && QUOTES.some((q) => codeLine.includes('const VERSION = ' + q + current + q + ';'))) return true;
    return vnumLocksCurrent(codeLine, names);
}
/* [v3.298.0] V4 的「锚点在场」判定：字面量形 `vnum('<当版>')` 或本档自锚常量形 `vnum(NAME)`。 */
function hasAnchorFor(txt) {
    if ([...txt.matchAll(new RegExp(boundRe.source, 'g'))].some((m) => vnum(m[1]) === vnum(current))) return true;
    return selfConstNames(txt).some((nm) => new RegExp('vnum\\(\\s*' + nm + '\\s*\\)').test(txt));
}''',
      'V2 第二形态 + V4 锚点在场判定（helper 同源）')

# ══════════ ③ 守卫：计数口径限定在当版档案 ══════════
G.sub(r'''    // V4 计数：任何文件（含 frontier）恰好锚着当前版本，都算当版锚点在场。
    if ([...text.matchAll(boundRe)].some((m) => vnum(m[1]) === vnum(current))) anchored++;
    if (isFrontier) { frontier.push(f); continue; }
    scanned++;''',
      r'''    /* [v3.298.0] V4 只数**当版档案**里的锚点。旧口径数全网任意文件 ⇒ 历史文件能替当版把数
     *   凑够（于是「补锚」的直觉动作是把锚写进历史文件、再被 V2 抓）—— 两条判据互斥的根因。 */
    const anchorHere = hasAnchorFor(text);
    if (isFrontier) {
        if (anchorHere) anchored++;
        frontier.push(f);
        continue;
    }
    scanned++;''',
      'V4 计数限定当版档案')

# ══════════ ④ 守卫：V4 报错文案 + 唯一性 ══════════
G.sub(r'''if (anchored === 0) {
    problems.push('V4 没有任何测试恰好锚着当版 ' + current + '（当版锚点被删空，版本守卫失去基准）');
}''',
      r'''if (anchored === 0) {
    problems.push('V4 当版档案里没有任何测试以 vnum 恰好锚着当版 ' + current
        + '（锚点必须住在**当版套件**里：写进历史文件会被 V2 抓，写成变量形也要能计数 —— 见 V2/V4 段头）');
} else if (anchored > 1) {
    problems.push('V4 当版锚点有 ' + anchored + ' 处（应当恰 1 处：多处锚会在抬版时分叉，见 V4 段头）');
}''',
      'V4 报错文案（当版档案口径）+ 唯一性')

# ══════════ ⑤ 守卫：读数行标注口径 ══════════
G.sub("""    + ' / 当版 frontier ' + frontier.length + ' / 当版锚点 ' + anchored + ' / 问题 ' + problems.length + ' ===');""",
      """    + ' / 当版 frontier ' + frontier.length + ' / 当版锚点 ' + anchored + '（仅当版档案）'
    + ' / 问题 ' + problems.length + ' ===');""",
      '读数行标注 V4 口径')

# ══════════ ⑥ 守卫：V2 调用点传 names ══════════
G.sub("""    for (const [i, line] of text.split('\\n').entries()) {
        const codeLine = line.replace(/\\/\\/.*$/, '');
        if (!codeLine.trim()) continue;
        if (hardLocksCurrent(codeLine)) {""",
      """    const names = selfConstNames(text);
    for (const [i, line] of text.split('\\n').entries()) {
        const codeLine = line.replace(/\\/\\/.*$/, '');
        if (!codeLine.trim()) continue;
        if (hardLocksCurrent(codeLine, names)) {""",
      'V2 调用点传本档自锚常量名')

# ══════════ ⑦ v3297：收回自己的出生版本锚与下界 ══════════
S = D['tests/v3297_state_report.test.mjs']
S.sub(r'''/* ══════════ S10 版本卫生与当版锚 ══════════
 * 本段与 tests/v3296_x1_evidence_query.test.mjs 的 V 段同构，理由是**版本守卫 V4**：
 *   「至少一个测试以 `vnum('<当版>')` 恰好锚着当前版本」。
 *   抬版时上一版的锚随之降为**历史下界**（这是交棒，不是缺陷），若本版不补继任锚，
 *   V4 会当场报「当版锚点被删空，版本守卫失去基准」 —— 锚必须有人接。
 *   刻意**不**写成 assert.equal(idx, '3.297.0')：那是 V2 点名的「抬版仪式」形态
 *   （写死当版号的历史测试在下一版必红，且每次抬版都要人工批量替换）。
 */''',
      r'''/* ══════════ S10 版本卫生与出生版本锚 ══════════
 * 本段与 tests/v3296_x1_evidence_query.test.mjs 的 V 段同构。锚的口径（[v3.298.0] 修正）：
 *   **当版锚住在当版档案里**（版本守卫 V4 只数 frontier 文件），历史测试只锁**自己的**
 *   出生版本 —— 于是 V2（历史文件不得锁当版）与 V4（当版档案必须有锚）不再互相踢球。
 *   本档出生版本 v3.297.0，故这里锚 3.297.0、下界也是 3.297.0，**不随抬版上抬**。
 *   刻意**不**写成 assert.equal(idx, '3.297.0')：那是 V2 点名的「抬版仪式」形态
 *   （写死**运行版本**的历史测试在下一版必红，且每次抬版都要人工批量替换）。
 *   [v3.298.0 留痕] 本段曾按旧 V4 口径把**当版**硬锚在这里（`vnum('3.298.0')` 与
 *   '3298000' 相等）—— 那是「补锚 = 踩 V2」的互斥形态，已在同版修掉（守卫 V2/V4 双修，
 *   锚迁回当版套件 v3298；见 CHANGELOG 的「门禁真缺陷」段与 v3203 的 17~19 号判据）。
 */''',
      'v3297 S10 段头（口径已改）')
S.sub("""  assert.ok(vnum(idx) >= vnum('3.298.0'), '版本不得低于本档出生版本 3.298.0，实 ' + idx);
  /* ★ 当版锚：全仓恰此一处以 vnum 锚着当版；抬版时由继任套件接管，本行降为历史下界。 */
  assert.equal(vnum('3.298.0').toString(), '3298000', '当版锚：vnum 解析器须给出三段数值（3*1e6 + 298*1e3 + 0）');""",
      """  assert.ok(vnum(idx) >= vnum('3.297.0'), '版本不得低于本档出生版本 3.297.0，实 ' + idx);
  /* ★ 出生版本锚（**自己的**版本，不随抬版上抬；形态与 v3263 / v3209 / v3296 同）：
   *   当版锚另由当版套件承担 —— 本行不再越位（[v3.298.0] 修）。 */
  assert.equal(vnum('3.297.0'), 3297000, '出生版本锚：vnum 解析器须给出三段数值（3*1e6 + 297*1e3 + 0）');""",
      'v3297 下界 + 出生版本锚（替换越位的当版锚）')

# ══════════ ⑧ v3298：当版锚回到当版档案（字面量入 vnum） ══════════
T = D['tests/v3298_mo3_receipt_single_source.test.mjs']
T.sub(r"""    /* ★ 当版锚（**抬版时改这一行**，与既有抬版纪律同规格）：本档锁定自己的出生版本。
     *   现在锁的是 v3.298.0 —— 本套件是那一版的交付判据。 */
    assert.strictEqual(vnum(idxVer).toString(), '3298000', '★ 当版锚：vnum(\'' + idxVer + '\') = 3298000');""",
      r"""    /* ★ 当版锚（vnum 数值形态）—— 形态与 v3263 / v3209 / v3297 等带锚档一致，三条纪律：
     *   ① 字面量**入 vnum**（只写进字符串里不算）⇒ 版本守卫 V4 的计数口径看得见；
     *   ② 锚住在**当版自己的档案**里 ⇒ 不占历史文件的口子（V2 只判非当版档）。
     *      修前 V4 数的是全网任意文件，于是「给当版补锚」的直觉动作必然踩 V2（见 V2/V4 段头）；
     *   ③ 锚的是「本档出生版本」这条**自洽事实**，不绑运行版本 ⇒ 抬版后本行无需再改
     *      （旧形态绑 idxVer，抬版必红）；运行版本另判「不得低于本档出生版本」。 */
    assert.strictEqual(vnum('3.298.0'), 3298000, '★ 当版锚：本档出生版本 vnum 须给出三段数值');
    assert.ok(vnum(idxVer) >= vnum('3.298.0'), '运行版本不得低于本档出生版本 3.298.0，实 ' + idxVer);""",
      'v3298 当版锚（字面量入 vnum，住在当版档案里）')

# ══════════ ⑨ v3203：夹具自证 + 三支新判据 ══════════
V = D['tests/v3203_version_guard_handover.test.mjs']
V.sub(" *   5 判据面自防护：断言数 / 代码行 / 关键指纹\n * ============================================================ */",
      " *   5 判据面自防护：断言数 / 代码行 / 关键指纹\n"
      " *   6 V2/V4 不再互斥（[v3.298.0] 修复）：锚点位置与形态的**双向**判据\n"
      " *     （结构面 / 正控：锚挪进历史文件 ⇒ V2 与 V4 同红 / 保绿对照：注释与下界比较不翻红）\n"
      " * ============================================================ */",
      'v3203 头部覆盖清单（补第 6 项）')
V.sub("""        ['V5 ', '缺 V5 判据标记'],""",
      """        ['V5 ', '缺 V5 判据标记'],
        ['vnumLocksCurrent', 'V2 须覆盖 vnum 数值锁形态（[v3.298.0] 修）'],
        ['hasAnchorFor', 'V4 须用「锚点在场」判定（字面量形 + 本档自锚常量形）'],
        ['当版档案', 'V4 须写明锚点住在当版档案里（否则与 V2 互斥）'],""",
      'v3203 结构面：补 V2/V4 形态指纹')
V.sub("""        const needle = "vnum('" + CUR + "')";""",
      """        /* [v3.298.0] 锚的形态是**字面量入 vnum**，故按字面量找；另收本档自锚常量形
         *   （`const CUR = '<当版>'` + `vnum(CUR)`）—— 两种形态都删空，才算真的没有基准。
         *   旧夹具只按字面量找，而当时当版锚写成变量形 ⇒ 它**数不出 hit**（破坏照样发生、
         *   判据却没跑到）：这正是本仓定性过的「负控制自己的夹具也要自证」。 */
        const needles = ["vnum('" + CUR + "')", 'vnum(CUR)'];""",
      'v3203 N4 夹具：按两种锚形态找（自证）')
V.sub("""        for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.mjs'))) {
            const p = path.join(dir, f);
            const s = readFileSync(p, 'utf-8');
            const n = s.split(needle).length - 1;
            if (!n) continue;
            hit += n;
            writeFileSync(p, s.split(needle).join("vnun('" + CUR + "')"));
        }""",
      """        for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.mjs'))) {
            const p = path.join(dir, f);
            let s = readFileSync(p, 'utf-8');
            let n = 0;
            for (const nd of needles) {
                n += s.split(nd).length - 1;
                s = s.split(nd).join('vnun(0)');
            }
            if (!n) continue;
            hit += n;
            writeFileSync(p, s);
        }""",
      'v3203 N4 夹具：逐形态删空（替换体不再是锚）')
V.append(r'''

/* ══════════ 6. V2/V4 不再互斥（[v3.298.0] 修复的判据面） ══════════
 * 缺陷（本版定向复验实测）：V2 判「历史测试不得把 VERSION 锁成恰好等于当前版本」，
 *   V4 判「至少一个测试以 vnum 恰好锚着当前版本」，而 V4 的旧计数口径是**全网任意文件**
 *   且**只认字面量**。于是：锚只写在当版套件、写成变量形 ⇒ V4 计数 0（判据静默失效）；
 *   把锚写进**历史文件** ⇒ V4 有数了、V2 当场红（本版 v3297 那一行正是这么补的）。
 *   两条判据对同一事实给出相反要求 ⇒ 每次抬版都会重演「补锚 = 踩 V2」。
 * 本组三支：结构面（形态与位置写死在判据文本里）+ **正控**（破坏照样被抓，且两处同时报）
 *   + **保绿对照**（不得顺手把判据调松）。缺了正控就等于「把判据调松」也照样绿。 */

test('v3203 17. 结构面：V4 计数限定当版档案、V2 覆盖 vnum 数值锁', () => {
    const S = strip(SCAN);
    assert.ok(/function vnumLocksCurrent\(/.test(S), 'V2 须有 vnum 数值锁判定（独立函数，可被指纹钉住）');
    assert.ok(/function hasAnchorFor\(/.test(S), 'V4 须有锚点在场判定');
    assert.ok(/selfConstNames\(/.test(S), '两种判据须共用「本档自锚常量」解析（否则形态口径会分叉）');
    assert.ok(S.includes('if (isFrontier) {\n        if (anchorHere) anchored++;'),
        'V4 的计数必须写在**当版档案**分支里（旧口径写在分支外 ⇒ 历史文件能替当版凑数）');
    assert.ok(!/^\s*if \(\[\.\.\.text\.matchAll\(boundRe\)\].some/m.test(S),
        '旧的「全网计数」写法必须消失（它正是与 V2 互斥的那一半）');
    assert.ok(/\(?:>=|<=\)/.test(S), '比较式必须显式放过（下界/上界是 V3 的读数，不是锁）');
    assert.ok(S.includes('恰 1 处'), 'V4 须判锚的唯一性（多处锚会在抬版时分叉）');
});

test('v3203 18. 正控（修复的核心）：锚被挪进历史文件 ⇒ V2 与 V4 **同时**报', () => {
    /* 复现修复前的现场：当版档案里的字面量锚删空，历史文件里补一行 `vnum('<当版>')` 锚。
     *   修复前 V4 会把历史文件那一行也计进去 ⇒ 只报 V2（「补锚」看似成立）；
     *   修复后 V4 只数当版档案 ⇒ 两处同时报。断言的正是后半句。 */
    const r = withTree((d) => {
        const dir = path.join(d, 'tests');
        const needles = ["vnum('" + CUR + "')", 'vnum(CUR)'];
        let removed = 0;
        for (const f of readdirSync(dir).filter((x) => x.endsWith('.test.mjs'))) {
            const p = path.join(dir, f);
            let s = readFileSync(p, 'utf-8');
            let n = 0;
            for (const nd of needles) {
                n += s.split(nd).length - 1;
                s = s.split(nd).join('vnun(0)');
            }
            if (!n) continue;
            removed += n;
            writeFileSync(p, s);
        }
        assert.ok(removed >= 1, '夹具前提：当版锚在树里（字面量形态）—— 旧夹具在此数不出 hit');
        const p = path.join(dir, HIST);
        writeFileSync(p, readFileSync(p, 'utf-8') + '\n'
            + 'test("注入：把当版锚写进历史文件", () => { assert.equal(vnum(\''
            + CUR + '\'), 0); });\n');
    });
    assert.strictEqual(r.status, 1, '必须翻红：' + r.out.slice(-300));
    assert.ok(/V2 /.test(r.out), '历史文件锁当版 ⇒ V2 须报');
    assert.ok(/V4 /.test(r.out),
        '当版档案里的锚被删空 ⇒ V4 须报（旧口径会被历史文件那一行糊弄过去 —— 这正是互斥的现场）');
});

test('v3203 19. 保绿对照（防过判）：历史文件里的注释与下界比较提及当版号 ⇒ 不得翻红', () => {
    /* 修复的对称面：V2 补了 vnum 形态，就必须证明它**没有**把合法的读数一起判死。
     *   两类合法提及：① 注释里的历史留痕；② `assert.equal(vnum('<低版本>') <= vnum('<当版>'), true)`
     *   这种**比较式**（下界/上界是 V3 的地盘）。两者都不许翻红。 */
    const r = withTree((d) => {
        const p = path.join(d, 'tests', HIST);
        writeFileSync(p, readFileSync(p, 'utf-8') + '\n'
            + '// 抬版留痕：本文件在 vnum(\'' + CUR + '\') 形态确立之后仍按下界比较\n'
            + 'const VG_NOTE_V3203B = [];\n'
            + 'test("下界比较用当版号不算锁", () => { assert.equal(vnum(\'3.0.0\') <= vnum(\''
            + CUR + '\'), true, "下界"); });\n');
    });
    assert.strictEqual(r.status, 0,
        '注释与下界比较不得被当成锁版（否则修复等于把判据调松到另一头）：' + r.out.slice(-400));
});
''', 'v3203 17~19 号判据（结构面 / 正控 / 保绿对照）', 'v3203 新增三支判据')

# ══════════ ⑩ 参考基准 tsv：v3203 条目补注 ══════════
D['tests/audit/catalog_reference_consumers.tsv'].sub_line(
    'v3203_version_guard_handover.test.mjs',
    'v3203_version_guard_handover.test.mjs\t\t'
    '版本守卫的交接与自防护判据（20 个 test）：结构面（判据标记 / 三档退出码 / 自身版本无关）'
    '/ 行为面（真仓库 exit 0 + 读数可察）/ 六组真源码破坏负控制（硬等号长回 / 未来下界 / '
    '三源不同源 / 当版锚点删空 / frontier 头被改 / 保绿对照）+ 交棒链（历史文件下界逐文件核回'
    '出生版本）/ 判据面自防护。★ [v3.298.0] 补第 6 组三支：**V2 与 V4 互斥修复**的判据面 ——'
    ' 结构面（V4 计数限定当版档案、V2 覆盖 vnum 数值锁与自锚常量形、比较式显式放过、锚的唯一性）'
    '+ **正控**（锚被挪进历史文件 ⇒ V2 与 V4 同时报：旧口径只报 V2，这一格就是互斥的现场）'
    '+ **保绿对照**（历史文件里的注释与下界比较提及当版号 ⇒ 不得翻红，钉住修复不是「把判据调松」）。'
    ' 另修 N4 夹具：旧夹具按字面量找「要删空的锚」，当版锚改成变量形后**数不出 hit**'
    '（破坏照样发生、判据却没跑到），修后按字面量形与自锚常量形一起删空。 [v3.298.0]\n',
    '参考基准 tsv：v3203 补注（含新判据与夹具自证）')

# ══════════ ⑪ README：锚点口径一句话 ══════════
D['README.md'].sub("""1. **版本四源同源** —— `index.js` 的 `VERSION` / `manifest.json` / `package.json` /
   `CHANGELOG.md` 顶节，由 `scan_version_guard.mjs`（V1/V6/V7）把守。""",
      """1. **版本四源同源** —— `index.js` 的 `VERSION` / `manifest.json` / `package.json` /
   `CHANGELOG.md` 顶节，由 `scan_version_guard.mjs`（V1/V6/V7）把守。
   当版锚点（V4）只认**当版档案**里的一处 `vnum` 锚（字面量形或本档自锚常量形）；
   历史测试只锁**自己的**出生版本 —— V2 与 V4 的旧口径互斥已修（[v3.298.0]）。""",
      'README 版本纪律补锚点口径')

# ══════════ ⑫ CHANGELOG：本版补「门禁真缺陷」段 ══════════
D['CHANGELOG.md'].sub("""  自招一红；改为按**真留在载荷里的块数**（保留 + 被切半）。
- **抬版连带**：""",
      """  自招一红；改为按**真留在载荷里的块数**（保留 + 被切半）。
- **★ 交付后定向复验抓到的门禁真缺陷（已修，附判据）**：`scan_version_guard.mjs` 的 V2 与 V4
  曾是**互斥的一对** —— V2 判「历史测试不得把 VERSION 锁成恰好等于当前版本」，V4 判「至少
  一个测试以 `vnum` 恰好锚着当前版本」；而 V4 的计数口径是**全网任意文件**且**只认字面量**。
  后果：① 锚只写在当版套件里、且写成 `vnum(idxVer)`（变量形）⇒ V4 计数 0，判据静默失效；
  ② 把锚写进**历史文件** ⇒ V4 有数了、V2 当场红（本版 v3297 那一行正是这么补上去的）；
  ③ 两条合起来等于「补锚 = 必须踩 V2」，于是每次抬版都会重演。V4 的正例其实一直都在
  （v3263 的 `assert.equal(vnum('3.261.0'), 3261000)` —— 锚放在**当版自己的档案**里），
  只是被这两个口径同时漏掉。
  修法（判据面在 `v3203`）：① **V2 补 vnum 形态** —— `assert.equal(vnum('<当版>'), 3298000)`
  与本档自锚常量形 `const CUR = '<当版>'; … assert.equal(vnum(CUR), 3298000)` 都算锁版
  （带 `>=` / `<=` 的比较式不是锁 —— 那是 V3 的下界/上界读数，整行放过）；
  ② **V4 只数当版档案**（frontier），并同时收「字面量形」与「本档自锚常量形」两种锚；
  ③ V4 补**唯一性**（恰 1 处：多处锚会在抬版时分叉）。
  产物侧同修：当版锚从 v3297（历史文件）**迁回当版套件 v3298**（`vnum('3.298.0')` 字面量入
  vnum ⇒ V4 计数口径看得见）；v3297 收回**自己的**出生版本锚与下界（历史测试只锁自己，
  v3.203.0 的原口径）。
- **★ `v3203` 的 N4 夹具一并修补（负控制自己的夹具也要自证）**：旧夹具按
  `vnum('<当版>')` **字面量**找「要删空的锚」，当版锚写成变量形后它**数不出 hit** —— 
  破坏照样发生，判据却没跑到（本仓定性过的经典形态）。修后按两种锚形态一起删空，
  并新增三支判据：**结构面**（V4 计数限定当版档案 / V2 覆盖 vnum 数值锁 / 比较式显式放过 /
  锚的唯一性）、**正控**（锚被挪进历史文件 ⇒ V2 与 V4 **同时**报 —— 修复前这一格被历史文件
  那一行糊弄过去）、**保绿对照**（历史文件里的注释与下界比较提及当版号 ⇒ 不得翻红，
  钉住修复不是「把判据调松到另一头」）。
- **抬版连带**：""",
      'CHANGELOG 补门禁真缺陷与夹具自证段')

for doc in D.values():
    doc.write()
for rel, why in _log:
    print('[patch3298b] %-46s %s' % (rel, why))
print('[patch3298b] 全部锚点恰中 1 次，%d 处已写盘。' % len(_log))