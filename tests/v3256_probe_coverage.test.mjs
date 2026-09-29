// tests/v3256_probe_coverage.test.mjs — v3.256.0
//
// 主题：M-O4 量测台的探针覆盖面——导出在场，不等于有人真调。
// 本档锁 C10「引用 cache-workload 的探针必须实际调用 cacheHit / repeatCost / survey」，
// 并真跑唯一相关探针；无关探针不强迫耦合，注释不算消费，负控制改真源码再跑同判据。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakSource } from './_break_kit.mjs';
import { judgeProbeCoverage, PROBE_REQUIRED_CALLS, PROBE_RE } from './audit/scan_v3254_cache_identity.mjs';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const AUDIT = path.join(ROOT, 'tests', 'audit');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const NL = String.fromCharCode(10);
const PROBE = '_m_o4_probe.mjs';
const probeFiles = () => fs.readdirSync(AUDIT).filter((f) => PROBE_RE.test(f));
const PROBE_SRC = read(path.join('tests', 'audit', PROBE));
const SELF = read(path.join('tests', 'v3256_probe_coverage.test.mjs'));
const ok = (m) => console.log('  ✓ ' + m);

test('v3256 A1. C10 导出与组装在场，探针清单由磁盘派生', () => {
    const guard = read(path.join('tests', 'audit', 'scan_v3254_cache_identity.mjs'));
    assert.deepEqual(PROBE_REQUIRED_CALLS, ['cacheHit', 'repeatCost', 'survey']);
    assert.match(guard, /judgeProbeCoverage/);
    assert.match(guard, /judgeProbeCoverage\(probeFiles/);
    assert.ok(probeFiles().includes(PROBE), '量测探针必须由审计目录发现');
    ok('C10 三个必需调用与运行时组装在场');
});

test('v3256 B1. 真源码零问题；探针真跑，四路径都产生缓存命中读数', () => {
    const problems = judgeProbeCoverage(probeFiles(), (rel) => {
        const p = path.join(ROOT, rel);
        return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    });
    assert.deepEqual(problems, [], '真源码 C10 应卫生：' + JSON.stringify(problems));
    const run = spawnSync(process.execPath, [path.join(AUDIT, PROBE), '--sizes=0,200'], {
        cwd: ROOT, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    });
    const out = (run.stdout || '') + (run.stderr || '');
    assert.equal(run.status, 0, '探针真跑必须成功：' + out.slice(-1200));
    assert.match(out, /缓存命中断言（同等输入连读两次）/);
    for (const p of ['snapshot', 'candidate', 'serialize', 'settings']) {
        assert.match(out, new RegExp(p + '\\s+hit（ok）'), p + ' 必须读到 hit（ok）');
    }
    ok('真跑探针：snapshot / candidate / serialize / settings 均 hit（ok）');
});

test('v3256 C1. 负控制打真探针源码：删 cacheHit 调用，同一判据必红', () => {
    const anchor = 'WL.cache' + 'Hit(p, { n: bigN })';
    const replacement = 'WL.cache' + 'HitDisabled(p, { n: bigN })';
    const broken = breakSource(PROBE_SRC, anchor, replacement, 'v3256-C1');
    assert.notEqual(broken, PROBE_SRC, '破坏必须真实发生');
    const problems = judgeProbeCoverage([PROBE], () => broken);
    assert.ok(problems.some((p) => p.includes('cacheHit')), 'C10 必须点名缺少 cacheHit：' + JSON.stringify(problems));
    ok('真实调用点被破坏后 C10 转红');
});

test('v3256 C2. 缺席、空探针与读不到各自 fail-closed', () => {
    assert.ok(judgeProbeCoverage([], () => null).some((p) => p.includes('清单为空')), '空清单不得判绿');
    assert.ok(judgeProbeCoverage([PROBE], () => '').some((p) => p.includes('没有任何探针')), '空源码必须判无覆盖');
    assert.ok(judgeProbeCoverage([PROBE], () => null).some((p) => p.includes('读不到')), '读不到必须点名');
    ok('缺席 / 空 / 读不到不混同且均不能静默放行');
});

test('v3256 D1. 覆盖面两向自证：无关探针不误红，注释不算调用', () => {
    const unrelated = read(path.join('tests', 'audit', '_p3_snapshot_probe.mjs'));
    const mixed = judgeProbeCoverage([PROBE, '_p3_snapshot_probe.mjs'], (rel) => rel.endsWith(PROBE) ? PROBE_SRC : unrelated);
    assert.deepEqual(mixed, [], '无关探针不强制耦合');
    const commented = "const source = 'cache-workload.js';" + NL + '/* ' + PROBE_REQUIRED_CALLS.join(' ') + '() */' + NL;
    const problems = judgeProbeCoverage([PROBE], () => commented);
    assert.ok(problems.length >= 3, '注释内的引用与调用不能冒充真消费：' + JSON.stringify(problems));
    ok('无关探针保绿；注释伪调用不能覆盖判据');
});

test('v3256 E1. 新常驻测试登记；量测探针不进入常驻矩阵', () => {
    const catalog = read(path.join('tests', 'audit', 'catalog_reference_consumers.tsv'));
    assert.ok(catalog.split(NL).some((l) => l.startsWith('v3256_probe_coverage.test.mjs\t')), '新测试须登记参考基准');
    const kit = read(path.join('tests', 'v3247_break_kit_consolidation.test.mjs'));
    assert.ok(kit.includes("'v3256_probe_coverage.test.mjs'"), '使用 break kit 的新测试须登记接收方');
    const matrix = read(path.join('tests', 'audit', 'audit_scan_probe_matrix.tsv'));
    assert.ok(matrix.split(NL).some((l) => l.startsWith('scan_v3254_cache_identity.mjs\t')), 'C10 守卫须在灵敏度矩阵');
    assert.ok(!matrix.includes(PROBE), '临时量测探针不得入常驻灵敏度矩阵');
    ok('参考基准 / break-kit 接收方 / 判据矩阵口径正确');
});

const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);
test('v3256 F1. 当版 frontier 与发布元数据锁定 3.256.0', () => {
    const idx = read('index.js');
    const codeVer = (/const VERSION = '([^']+)'/.exec(idx) || [])[1];
    assert.equal(vnum(codeVer), vnum('3.256.0'), '入口版本必须是本档当版');
    assert.equal(JSON.parse(read('package.json')).version, codeVer);
    assert.equal(JSON.parse(read('manifest.json')).version, codeVer);
    assert.ok(read('CHANGELOG.md').startsWith('## v' + codeVer), 'CHANGELOG 顶节须为当版');
    assert.match(read('TODO.md'), new RegExp('最近更新：v' + codeVer));
    assert.ok(SELF.includes("vnum('3.256.0')"), '当版硬锚必须由本档接管');
    ok('版本锚与三源发布面均为 ' + codeVer);
});
