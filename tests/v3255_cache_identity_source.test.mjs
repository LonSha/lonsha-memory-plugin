// tests/v3255_cache_identity_source.test.mjs — v3.255.0
//
//   主题：M-O4 兑现审计的落点 —— `_cacheIdentityOf()` 的 revision 位**不得**读落盘计数器。
//
//   修前实测：首稿填 `this.storage.getRevision()`，而 `StorageManager.save()` 是**无条件**
//   `this._revision += 1`（数落盘**次数**）。三条即时存盘路径（编辑 / swipe / 删楼）
//   都会踩到 ⇒ 同一楼每改一次命中检查就换读数 ⇒ `r0 → r1` ⇒ 会话 / 代际 /
//   历史指纹**三位逐字未变**却被判 `revision-changed` ⇒ 缓存永不命中。
//   形态：静默禁用缓存（不报错、只是白花钱）。
//
//   为什么另立一档而不并进 v3254：v3254 锁自己的出生版本 3.254.0（不随抬版上抬），
//   而本版的新判据与新台账需要一个**当版 frontier**（文件头自报当版）。
//
//   判据面（实现住在守卫 tests/audit/scan_v3254_cache_identity.mjs，本档只**调**它）：
//     A 三源同版 + 身份位真跑（抽真方法体 → key 里是 r-）
//     B 行为面三态（落盘一次 hit / 换会话 conversation-changed / 历史变 history-changed）
//     C 负控制（真源码破坏必红 + 锚点消失必红）与判据纯度（注释里的旧写法不误红）
//     D 词表项不得为“过判据”而被删（判据面自身的反向保护）
//     E 台账（参考基准登记 / 灵敏度矩阵 / 破坏工具接收方）
//     F 版本锚（当版 frontier：硬等号锁 3.255.0）
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import {
    judgeIdentitySource, methodBody, IDENTITY_ANCHOR_RE, stripCommentsKeepLength,
    normForMatch, REV_SOURCE_NEEDLE, loadModule,
} from './audit/scan_v3254_cache_identity.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const ok = (m) => console.log('  ✓ ' + m);
const VER = '3.255.0';
const NL = String.fromCharCode(10);
/* 被禁来源拼接成串（本档不得出现它的完整字面量，否则判据纯度自证会假红）。 */
const FORBIDDEN = 'this.storage.' + 'getRevision(';
const ENTRY_SRC = read('index.js');
const CI = await loadModule(ROOT, 'cache-identity.js');

/** 从真源码抽出的方法体重建为可调用函数（与扫描器同一个口径）。 */
function realIdentityFn() {
    const hit = IDENTITY_ANCHOR_RE.exec(ENTRY_SRC);
    assert.ok(hit, '`_cacheIdentityOf()` 定义形态必须在场');
    const blk = methodBody(ENTRY_SRC, hit[0]);
    assert.equal(blk.error, undefined, '方法体必须能配平抽出：' + blk.error);
    return new Function('errLog', 'return function(){' + blk.body + '}')(() => {});
}

/** 隔离宿主：落盘会推进计数器（模拟 StorageManager.save 的无条件 +=1）。 */
function mkHost(chatId, fp) {
    let rev = 0;
    return {
        getCurrentChatId: () => chatId,
        _mutationEpoch: 3,
        _dataRevision: () => fp,
        storage: { getRevision: () => rev, save: () => { rev += 1; return true; } },
    };
}

/* ═══════ A 三源同版 + 身份位真跑 ═══════ */
test('v3255 A1. ★★★ 三源同版 ' + VER + '，且身份位在真源码上真跑出 `r-`', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(ENTRY_SRC) || [])[1];
    const pkg = JSON.parse(read('package.json'));
    const mf = JSON.parse(read('manifest.json'));
    assert.ok(vnum(codeVer) >= vnum(VER), '出生版本之后的当前版本应保持向前：' + codeVer);
    assert.equal(pkg.version, codeVer, 'package.json 必须与入口同版');
    assert.equal(mf.version, codeVer, 'manifest.json 必须与入口同版');
    const fn = realIdentityFn();
    const id = fn.call(mkHost('chat-A', 'abc123_40'));
    assert.ok(id && typeof id === 'object', '方法体必须返回身份对象');
    const key = CI.identityKey(id);
    assert.equal(key, 'chat-A|e3|r-|abc123_40', '真源码跑出的 key 必须是 r- 而不是 r0：' + key);
    assert.equal(id.revision, null, '这一位不自行填（null）');
    ok('三源 ' + VER + '；真源码方法体跑出 ' + key);
});

/* ═══════ B 行为面三态 ═══════ */
test('v3255 B1. ★★★ 行为面：落盘一次仍 hit；换会话 / 历史变各自具名', () => {
    const fn = realIdentityFn();
    const host = mkHost('chat-A', 'abc123_40');
    const before = fn.call(host);
    host.storage.save();
    const after = fn.call(host);
    const r = CI.invalidate(before, after, {});
    assert.equal(r.stale, false, '落盘一次不得让缓存失效');
    assert.equal(r.reason, 'hit', '应为 hit，实为 ' + r.reason + '（' + r.from + ' → ' + r.to + '）');
    const r1 = CI.invalidate(fn.call(mkHost('chat-A', 'abc123_40')), fn.call(mkHost('chat-B', 'abc123_40')), {});
    assert.equal(r1.reason, 'conversation-changed');
    const r2 = CI.invalidate(fn.call(mkHost('chat-A', 'abc123_40')), fn.call(mkHost('chat-A', 'def456_41')), {});
    assert.equal(r2.reason, 'history-changed');
    ok('落盘一次 hit；换会话 / 历史变各自具名（两条反向防“压假阳填常量”）');
});

/* ═══════ C 负控制与判据纯度 ═══════ */
test('v3255 C1. ★★★ 真源码破坏（改回落盘计数器）⇒ 同一条判据转红', () => {
    assert.deepEqual(judgeIdentitySource(CI, ENTRY_SRC), [], '原件上零问题');
    const broken = breakSource(ENTRY_SRC, 'revision: null,', 'revision: ' + FORBIDDEN + '),', 'v3255-C1');
    const probs = judgeIdentitySource(CI, broken);
    assert.ok(probs.length >= 2, '静态面与行为面都必须转红：' + JSON.stringify(probs));
    assert.ok(probs.some((p) => p.includes('正向失败')), '行为面必须点名“落盘一次就失效”');
    ok('真源码破坏 ⇒ 两面同时转红');
});

test('v3255 C2. ★★ 锚点消失必须转红（不得静默放行）', () => {
    const hit = IDENTITY_ANCHOR_RE.exec(ENTRY_SRC);
    const gone = ENTRY_SRC.replace(hit[0], hit[0].replace('_cacheIdentityOf', '_cacheIdentityOfRenamed'));
    assert.notEqual(gone, ENTRY_SRC, '破坏必须真发生');
    assert.ok(judgeIdentitySource(CI, gone).some((p) => p.includes('找不到')), '锚点消失必须报');
    assert.ok(judgeIdentitySource(CI, '').length > 0, '空串不得判绿');
    ok('锚点消失 / 空串 ⇒ 转红');
});

test('v3255 C3. ★★判据纯度（H5/W9）：注释里的旧写法不误红，真代码里的必须红', () => {
    const src = 'ab/*' + REV_SOURCE_NEEDLE + ') */cd//' + REV_SOURCE_NEEDLE + NL + 'ef';
    const masked = stripCommentsKeepLength(src);
    assert.equal(masked.length, src.length, '剥注释必须保长');
    assert.equal(masked.indexOf(REV_SOURCE_NEEDLE), -1, '注释内的针必须被清零');
    assert.equal(masked.indexOf('ab'), 0, '非注释部分不得被动');
    assert.equal(normForMatch('a . b' + NL + '. c').indexOf(' '), -1, '归一化必须去掉空白与换行');
    const own = stripCommentsKeepLength(read(path.join('tests', 'v3255_cache_identity_source.test.mjs')));
    assert.equal(own.indexOf(REV_SOURCE_NEEDLE), -1, '本档不得出现被禁来源的完整字面量（自我指涉假绿）');
    const hit = IDENTITY_ANCHOR_RE.exec(ENTRY_SRC);
    const polluted = ENTRY_SRC.replace(hit[0], hit[0] + NL + '            /* ' + REV_SOURCE_NEEDLE + ') 旧写法在注释里 */');
    assert.notEqual(polluted, ENTRY_SRC, '污染必须真发生');
    assert.deepEqual(judgeIdentitySource(CI, polluted), [], '注释里的旧写法不得误红');
    ok('判据纯度：剥注释保长、注释写法不误红、真代码必红');
});

/* ═══════ D 词表项不得被为“过判据”而删 ═══════ */
test('v3255 D1. ★★为何必须保留 revision 这一位：词表与位表不得为过判据而被删', () => {
    /* 这一条防的是**判据面自己**：最廉价的“过判据”手法是把
       `revision` 从 IDENTITY_KEYS 删掉 / 把 `revision-changed` 从 REASONS 删掉 ——
       那样 C9 就永远不会转红。 */
    assert.ok(CI.IDENTITY_KEYS.includes('revision'), 'rev:/修订位必须在位表里（C2 已锁顺序）');
    assert.ok(CI.REASONS.includes('revision-changed'), 'REASONS 必须保留 revision-changed（否则一个真失效类型无名）');
    assert.equal(CI.INVALIDATION_CAUSES.length, 6, '六词词表不得变窄');
    assert.equal(REV_SOURCE_NEEDLE, 'this.storage.' + 'getRevision(', '被禁来源针的定义不得被改（改了 C9 就失灵）');
    ok('位表 / 词表 / 针 三处都不能靠删来过判据');
});

/* ═══════ E 台账 ═══════ */
test('v3255 E1. ★★ 新建档必须在三张台账里（参考基准 / 破坏工具接收方 / 执行面）', () => {
    const AUDIT = path.join(ROOT, 'tests', 'audit');
    const catalog = read(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(catalog.split(NL).some((l) => l.startsWith('v3255_cache_identity_source.test.mjs	')),
        '必须登记进参考基准（跨仓守卫 P3 会报“新增测试未登记”）');
    const registry = read(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(registry.includes("'v3255_cache_identity_source.test.mjs'"),
        '必须登记进破坏工具接收方台账（否则报“得盘上新增了接收方却没登记”）');
    const matrix = read(path.join('tests', 'audit', 'audit_scan_probe_matrix.tsv'));
    assert.ok(matrix.split(NL).some((l) => l.startsWith('scan_v3254_cache_identity.mjs	')),
        'C9 新判据落在 scan_v3254，该扫描器必须在灵敏度矩阵里登记');
    assert.ok(fs.existsSync(path.join(AUDIT, 'scan_v3254_cache_identity.mjs')), '守卫必须在场');
    ok('三张台账均已覆盖新建面');
});

/* ═══════ F 版本锚 ═══════ */
const vnum = (s) => Number(String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0));

test('v3255 F1. ★ 版本锚（当版 frontier：硬等号锁 ' + VER + '）', () => {
    const codeVer = (/const VERSION = '([^']+)'/.exec(ENTRY_SRC) || [])[1];
    /* [v3.256.0 交棒] 当版 frontier 由 v3256 接管；本档退回出生版本下限锚。 */
    assert.ok(vnum(codeVer) >= vnum('3.255.0'), '本档只在出生版本 3.255.0 及以后成立；当前 ' + codeVer);
    ok('版本锚：' + codeVer);
});
