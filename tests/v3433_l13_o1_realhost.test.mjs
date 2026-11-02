// tests/v3433_l13_o1_realhost.test.mjs — [L13-O1] 真宿主启动器与探针收口判据
//
// 本档只验证 O1 的工程契约：启动器确实组装真实 SillyTavern 现场，
// 探针等待异步 init 完成并对世界线缺席 fail-closed，环境失败不污染成功证据。
// 真宿主三块正向读数仍只由 `_realhost_suite.mjs` 在真实 ST 现场产生。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { breakSource, assertSingleHit } from './_break_kit.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const PROBE_REL = path.join('tests', 'audit', '_realhost_suite.mjs');
const LAUNCHER_REL = path.join('tools', 'realhost_up.mjs');
const PROBE = fs.readFileSync(path.join(ROOT, PROBE_REL), 'utf8');
const LAUNCHER = fs.readFileSync(path.join(ROOT, LAUNCHER_REL), 'utf8');
const EVIDENCE = path.join(ROOT, 'tests', 'audit', 'realhost_readings.json');
const vnum = (s) => String(s).split('.').reduce((a, x) => a * 1000 + Number(x), 0);

function runNode(args, env = {}, timeout = 30000) {
    return spawnSync(process.execPath, args, {
        cwd: ROOT,
        env: { ...process.env, ...env },
        encoding: 'utf8',
        timeout,
    });
}

test('L13-O1 A. 启动器必须组装真实 ST，而非 Node shim 或静态壳', () => {
    assert.match(LAUNCHER, /server\.js/);
    assert.match(LAUNCHER, /--dataRoot/);
    assert.match(LAUNCHER, /default-user/);
    assert.match(LAUNCHER, /extensions/);
    assert.match(LAUNCHER, /detached:\s*true/);
    assert.match(LAUNCHER, /process\.kill\(-pid, 'SIGTERM'\)/);
    assert.match(LAUNCHER, /--status/);
    assert.match(LAUNCHER, /--stop/);
    assert.match(LAUNCHER, /process\.exit\(2\)/);
    assert.doesNotMatch(LAUNCHER, /jsdom|puppeteer|mock.*SillyTavern|shim/i,
        '启动器不得把 shim 当成真实宿主');
});

test('L13-O1 B. 探针必须等待 init 完成，并对世界线缺席 fail-closed', () => {
    assert.match(PROBE, /initialized:\s*!!\(plug && plug\.initialized === true\)/);
    assert.match(PROBE, /boot\.initialized/);
    assert.match(PROBE, /LonShaMemory\.init 未完成/);
    assert.match(PROBE, /worldlineGate returned/);
    assert.match(PROBE, /typeof gate !== 'object'/);
    assert.match(PROBE, /LONSHA_REALHOST_NO_WRITE/);
    assert.match(PROBE, /process\.exit\(0\)/);
    assert.match(PROBE, /process\.exit\(1\)/);
    assert.match(PROBE, /process\.exit\(2\)/);
});

test('L13-O1 C. 启动器无状态现场必须 exit 2，不得把未知宿主当成可用现场', () => {
    const dataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'l13-o1-status-'));
    try {
        const r = runNode([path.join(ROOT, 'tools', 'realhost_up.mjs'), '--status', `--data-root=${dataRoot}`, '--port=18991']);
        assert.equal(r.status, 2, '无状态现场必须 exit 2：' + (r.stderr || r.stdout));
        const out = JSON.parse(String(r.stdout));
        assert.equal(out.alive, false);
        assert.equal(out.httpStatus, 0);
    } finally {
        fs.rmSync(dataRoot, { recursive: true, force: true });
    }
});

test('L13-O1 D. 环境失败负控：NO_WRITE 时不得覆盖已有成功证据', () => {
    const before = fs.readFileSync(EVIDENCE, 'utf8');
    const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'l13-o1-no-write-'));
    try {
        const r = runNode([path.join(ROOT, 'tests', 'audit', '_realhost_suite.mjs')], {
            LONSHA_EXT_DIR: ext,
            LONSHA_REALHOST_NO_WRITE: '1',
            LONSHA_CHROME: process.execPath,
            LONSHA_ST_URL: 'http://127.0.0.1:1/',
        });
        assert.equal(r.status, 2, '缺 manifest 必须是环境失败 exit 2：' + (r.stderr || r.stdout));
        assert.match(String(r.stderr), /环境缺失或探针失效/);
        assert.equal(fs.readFileSync(EVIDENCE, 'utf8'), before,
            '负控不得把成功读数改写成 environment-unavailable');
    } finally {
        fs.rmSync(ext, { recursive: true, force: true });
    }
});

test('L13-O1 E. 两个关键 fail-closed 锚点各有有效负控制', () => {
    const initAnchor = '&& boot.initialized) break;';
    assertSingleHit(PROBE, initAnchor, 'l13o1_init_guard');
    const initBroken = breakSource(PROBE, initAnchor, ') break;', 'l13o1_init_guard_neg');
    assert.doesNotMatch(initBroken, /&& boot\.initialized\) break;/,
        '摘掉 initialized 等待条件后，负控制必须能观察到契约缺席');

    const worldlineAnchor = "if (!gate || typeof gate !== 'object') {";
    assertSingleHit(PROBE, worldlineAnchor, 'l13o1_worldline_guard');
    const worldlineBroken = breakSource(PROBE, worldlineAnchor, 'if (false) {', 'l13o1_worldline_guard_neg');
    assert.match(PROBE, /worldlineGate returned/);
    assert.doesNotMatch(worldlineBroken, /if \(!gate \|\| typeof gate !== 'object'\)/,
        '摘掉 null/非对象保护后，负控制必须能观察到 fail-closed 契约缺席');
});

/* [v3.439.0 改形：一条断言拆成两支，且都不许「未执行报到通过」]
 *   原写法无条件要求 `verdict === 'success'`。在没有真实 SillyTavern 现场的开发机上，
 *   探针只会落 `environment-unavailable`（本仓 `_realhost_suite.mjs` 的 bail 路径）——
 *   那不是缺陷，是**未执行**。本仓纪律明写「未执行不报通过」：既不许把它当通过，
 *   也不该把它记成产品缺陷。故改成两支：
 *     ① 环境未就绪 ⇒ 断言「未执行态自述完整」（schema / version / reason / source 齐，
 *        且**不得**出现 ok / blocks / readings 这些成功读数键 —— 那是伪装成成功的形态），
 *        然后用 `t.skip()` 如实标跳过（Node 的 skipped 不计 pass，读数上看得见）；
 *     ② 环境就绪 ⇒ 走原来那套全判（success + 三块 + 读数条数 + 无 pageErrors）。
 *   版本断言同时由「锁 3.433.0」改为**下界形**（同本档 I 段的理由：锁当版不是防漂移）。 */
test('L13-O1 F. 证据版本与当前仓库版本一致，且三块均为成功读数', (t) => {
    const evidence = JSON.parse(fs.readFileSync(EVIDENCE, 'utf8'));
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    assert.equal(evidence.schema, 'realhost-readings@1', '证据 schema 必须是 realhost-readings@1');
    if (evidence.verdict === 'environment-unavailable') {
        assert.ok(String(evidence.reason || '').length > 0,
            '未执行必须自述原因（「没跑」不等于「没问题」）');
        assert.match(String(evidence.source || ''), /bail/,
            '未执行读数必须标明来自 bail 路径，而不是被当作一次完整取证的产物');
        for (const k of ['ok', 'blocks', 'readings', 'pageErrors']) {
            assert.equal(Object.prototype.hasOwnProperty.call(evidence, k), false,
                '未执行读数不得带成功读数字段 ' + k + '（那是把「没跑」伪装成「跑过且通过」）');
        }
        t.skip('真宿主未就绪，本档如实跳过（不计通过）：' + evidence.reason);
        return;
    }
    assert.equal(evidence.verdict, 'success', '证据必须明确标记 success，环境失败记录不得伪装成成功读数');
    assert.equal(evidence.version, manifest.version);
    assert.equal(evidence.ok, true);
    assert.deepEqual(evidence.blocks, { load: true, write: true, worldline: true });
    assert.ok(Array.isArray(evidence.readings) && evidence.readings.length >= 28);
    assert.ok(vnum(evidence.version) >= vnum('3.433.0'),
        '取证版本不得低于本档出生版本 3.433.0（实 ' + evidence.version + '）');
    assert.deepEqual(evidence.pageErrors, []);
});
