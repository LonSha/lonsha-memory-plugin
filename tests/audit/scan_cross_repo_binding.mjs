#!/usr/bin/env node
/**
 * scan_cross_repo_binding.mjs — v3.204.0
 *
 * 主题：测试面不得绑定宿主绝对路径 / 兄弟仓库 / 死快照。
 *
 * 背景：本仓历史上有两类「只在开发机上绿」的测试——
 *   ① 36 个文件把本仓根写成 '/home/user/lonsha-memory-plugin/...'，
 *      换个 checkout 位置就 ENOENT；
 *   ② 17 个文件把断言指向兄弟树 '/home/user/ruby-phone-work/...'，
 *      而该树无 git、停在 ruby-phone 2.6.0-modular，且它断言的那一代桥方法
 *      （queryPhoneMemory / backfillDiaries / syncClock / lockFact …）在
 *      ruby-phone 2.6.0 -> 2.92.0 里已整体移除。实测换成活体树后 17/17 全红。
 *   即：门禁的「绿」一半来自一份已经死掉的快照，任何干净 clone 必红。
 *
 * 五条判据（全部位置无关、版本无关）：
 *   P1 在役测试面不得出现任何绝对路径字面量（/home/… 、/tmp/…）。
 *      「仓库根」一律按文件位置推导：fileURLToPath(new URL('..', import.meta.url))。
 *   P2 在役测试面不得引用兄弟仓库：ruby-phone / ruby-phone-work 等标记，
 *      以及 ../../<非 tests>/ 这种「逃出本仓」的相对路径。
 *   P3 参考基准面（catalog_reference_consumers.tsv）与磁盘一致：
 *      缺口（新增文件未登记）与残留（登记了不存在的文件）都报。
 *   P4 退役面（catalog_version_guard.tsv）的每个文件不得重新出现在顶层。
 *   P5 退役文件本身只在 tests/archived/ 下，且目录不得为空。
 *   P6 退役面的**覆盖率转移有判据**（v3.205.0 起）：每行必须声明 covered_by ——
 *      或是「在役见证文件」（必须在役、且真的被该退役文件点名，防空洞引用），
 *      或是 `-:理由`（无同等覆盖时理由必填）。把所有退役都标 `-` 相当于没判据，
 *      故另设地板：`-` 行数不得超过退役面的一半。
 *
 * 退出码：0 无问题；1 有缺陷（附逐条明细）；2 fail-closed（前置读不到）。
 *
 * 本脚本自身版本无关：脚本体里不出现任何 3.x.y 字面量。
 */
import fs from 'node:fs';
import path from 'node:path';
import { stripComments as stripSrc } from '../_audit_lib.mjs';

const ROOT = process.env.LONSHA_AUDIT_ROOT || process.cwd();
const TESTS = path.join(ROOT, 'tests');
const AUDIT = path.join(TESTS, 'audit');
const ARCHIVED = path.join(TESTS, 'archived');

function failClosed(msg) {
    console.error('[cross-repo] ' + msg);
    process.exit(2);
}
function read(p) {
    try { return fs.readFileSync(p, 'utf-8'); } catch (e) { return null; }
}

if (!fs.existsSync(TESTS)) failClosed('测试目录缺失：' + TESTS);
if (!fs.existsSync(ARCHIVED)) failClosed('退役目录缺失：' + ARCHIVED);

const REF = path.join(AUDIT, 'catalog_reference_consumers.tsv');
const STALE = path.join(AUDIT, 'catalog_version_guard.tsv');
if (!fs.existsSync(REF)) failClosed('参考基准缺失：' + REF);
if (!fs.existsSync(STALE)) failClosed('退役登记缺失：' + STALE);

/** 解析 catalog：注释 # 行、空行跳过；取第一列 */
function parseCatalog(text, label) {
    const rows = [];
    for (const raw of String(text).split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const cols = line.split('\t').map((c) => c.trim());
        if (!cols[0]) failClosed(label + ' 行格式异常：' + raw.slice(0, 80));
        rows.push(cols);
    }
    return rows;
}

const refRows = parseCatalog(read(REF), '参考基准').map((c) => c[0]);
const staleAll = parseCatalog(read(STALE), '退役登记');
const staleRows = staleAll.map((c) => c[0]);
if (refRows.length === 0) failClosed('参考基准为空（扫描面不可信）');
if (staleRows.length === 0) failClosed('退役登记为空（退役基线不可信）');

const onDisk = fs.readdirSync(TESTS).filter((f) => f.endsWith('.test.mjs')).sort();
const onArchive = fs.readdirSync(ARCHIVED).filter((f) => f.endsWith('.test.mjs')).sort();

/* 绝对路径：/home/... 或 /tmp/...（POSIX 形态）；Windows 盘符一并拦 */
const ABS = /(?:^|[^A-Za-z0-9_$.])\/home\/|(?:^|[^A-Za-z0-9_$.])\/tmp\/|(?:^|[\s'"`(,=\[])[A-Za-z]:[\\/]/;
/* 兄弟仓库标记 */
const SIBLING = /ruby-phone-work|ruby-phone(?!-work)/;
/* 逃出本仓的相对读取：../.. 及以上，且目标不是 tests/ 内（测试本来就可引 ../index.js） */
const ESCAPE = /['"`]\.\.\/\.\.[^'"`]*['"`]/;

const problems = [];

/* ── P1 / P2：在役测试面 ──
 * 只在「代码」上判：先剥注释（保留偏移与行号），再跳过仍是纯注释散文的行、
 * 以及内含 `tests/audit/` 字面量的行（那是守卫自己的检测词表）。
 * 理由：在注释里写「历史上兄弟树叫 ruby-phone-work」是历史记录，不是跨仓绑定；
 *   判据必须在代码上做，否则守卫会变成「不准提历史」，且会被无关重命名触发。 */
const CODE_EXEMPT = /tests\/audit\//;
for (const f of onDisk) {
    const p = path.join(TESTS, f);
    const raw = read(p);
    if (raw == null) { problems.push('P1 读不到在役测试：' + f); continue; }
    const codes = stripSrc(raw).split('\n');
    const raws = raw.split('\n');
    codes.forEach((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        // 剥注释后整行变空 => 原行是纯注释；若原文该行以 prose 标记开头，按历史记录放过
        if (!trimmed.replace(/[\s]/g, '')) {
            if (/^(?:\/\/|\*|\/\*)/.test(raws[i].trim())) return;
        }
        if (CODE_EXEMPT.test(line)) return;
        const at = f + ':' + (i + 1);
        if (ABS.test(line)) problems.push('P1 绝对路径字面量（位置无关性被破坏，换 checkout 位置必红）：' + at + ' → ' + trimmed.slice(0, 90));
        if (SIBLING.test(line)) problems.push('P2 引用兄弟仓库（跨仓绑定：兄弟树不存在/已退休时门禁必红）：' + at + ' → ' + trimmed.slice(0, 90));
        if (ESCAPE.test(line)) problems.push('P2 相对路径逃出本仓（读取仓库之外）：' + at + ' → ' + trimmed.slice(0, 90));
    });
}

/* ── P3：参考基准与磁盘一致 ── */
const refSet = new Set(refRows);
const diskSet = new Set(onDisk);
for (const f of onDisk) if (!refSet.has(f)) problems.push('P3 新增测试未登记进参考基准（覆盖率缺口可静默）：' + f);
for (const f of refRows) if (!diskSet.has(f)) problems.push('P3 参考基准登记了不存在的测试（残留登记）：' + f);
if (refRows.length !== refSet.size) problems.push('P3 参考基准有重复行');

/* ── P4：退役面不得复活 ── */
for (const f of staleRows) {
    if (diskSet.has(f)) problems.push('P4 已退役测试重新出现在在役面（退役未真发生）：' + f);
}

/* ── P5：退役文件只在 archived/ 下 ── */
if (onArchive.length === 0) problems.push('P5 退役目录为空（退役基线不可信）');
for (const f of staleRows) {
    if (!onArchive.includes(f)) problems.push('P5 退役登记的文件不在 tests/archived/ 下：' + f);
}
for (const f of onArchive) {
    if (!staleRows.includes(f)) problems.push('P5 tests/archived/ 下的文件未登记进退役基线：' + f);
}
/* ── P5b：退役面内容冻结 ── */
import { createHash } from 'node:crypto';
for (const cols of staleAll) {
    const [f, want] = cols;
    if (!want) { problems.push('P5b 退役登记缺内容指纹：' + f); continue; }
    if (!onArchive.includes(f)) continue; // 缺席由 P5 报
    const got = createHash('sha1').update(read(path.join(ARCHIVED, f)) || '', 'utf-8').digest('hex').slice(0, 8);
    if (got !== want) problems.push('P5b 退役文件被追改（退役即冻结；改历史会让退役基线失去意义）：' + f + ' 期望 ' + want + ' 实得 ' + got);
}

/* ── P6：覆盖率转移必须有判据（T6） ──
 * 背景：v3.204.0 退役 17 个死桥测试时，「它们守的概念在本仓侧已有等价覆盖」这一步
 *   是**人工核对写进文件头注释**的，没有机器判据 —— 于是「再退役一个文件、谁还在守它」
 *   这个问题答不上来，退役就会静默变成「删掉就完了」。
 * 判据形态：
 *   · 每行必须有 covered_by（缺即报）；
 *   · covered_by 若是在役见证清单（逗号分隔）：每个文件必须在役（磁盘上存在），
 *     且**该退役文件真的点名过它**（文件名出现在退役文件正文里）——防「随手填一个名字」；
 *   · `-`（无同等覆盖）：必须带非空理由。
 * 地板：全标 `-` = 没判据，故 `-` 行不得超过退役面一半。 */
const liveSet = new Set(onDisk);
let dashOnly = 0;
for (const cols of staleAll) {
    const [f, , cov] = cols;
    if (!cov) { problems.push('P6 退役登记缺 covered_by（覆盖率转移无判据）：' + f); continue; }
    if (cov.startsWith('-')) {
        dashOnly++;
        const why = cov.slice(1).replace(/^[:：]/, '').trim();
        if (!why) problems.push('P6 无同等覆盖时必须写明理由（空 `-` 等于没判据）：' + f);
        continue;
    }
    const wits = cov.split(',').map((s) => s.trim()).filter(Boolean);
    if (wits.length === 0) { problems.push('P6 covered_by 为空（视为缺判据）：' + f); continue; }
    const archText = read(path.join(ARCHIVED, f)) || '';
    for (const w of wits) {
        if (!liveSet.has(w)) problems.push('P6 covered_by 引用的见证文件不在役（空洞引用；改名/退役后须同步）：' + f + ' → ' + w);
        // 退役文件的点名约定是**版本标签 + 概念**（如「v356（outline）」），而非完整文件名；
        //   两种形态都认，否则判据会强求一种仓库从未使用过的写法。
        else if (!archText.includes(w) && !archText.includes(w.split('_')[0])) {
            problems.push('P6 covered_by 声明了该见证，但退役文件正文从未点名它（判据不成立）：' + f + ' → ' + w);
        }
    }
}
if (staleAll.length > 0 && dashOnly > staleAll.length / 2) {
    problems.push('P6 覆盖率转移判据地板失守：' + dashOnly + '/' + staleAll.length
        + ' 行标为「无同等覆盖」—— 全标 `-` 等于没有判据，退役必须先回答「谁还在守它」');
}

console.log('=== 跨仓/绝对路径守卫：在役 ' + onDisk.length + ' / 退役 ' + onArchive.length
    + ' / 参考基准 ' + refRows.length + ' / 问题 ' + problems.length + ' ===');
if (problems.length) {
    for (const p of problems) console.error('  ✗ ' + p);
    console.error('[cross-repo] 发现 ' + problems.length + ' 处。');
    process.exit(1);
}
process.exit(0);
