import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcRaw = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
/* [v3.266.0 A1 第六刀] MemoryGraph / SummarySystem / GameClock / CharacterState 已外移
 *   memory-core.js：本文件的类抽取面与静态面改读「入口 + 该模块」合看（语义一字不改，
 *   只换被读的文件面；不放宽：每一条仍须在场）。 */
const coreSrc = readFileSync(new URL('../memory-core.js', import.meta.url), 'utf8');
const src = srcRaw + String.fromCharCode(10) + coreSrc
    + String.fromCharCode(10) + readFileSync(new URL('../memory-config.js', import.meta.url), 'utf8');   // [v3.267.0] 合看面追加
/* [v3.264.0 A1 第五刀] 六个器官类已外移 memory-organs.js：errLog 的**诊断面**判据须合看两面
 *   （模块内是带与宿主同等纪律的最小实现，宿主仍持含 _ERROR_HINTS 的真源）。 */
const orgSrc = readFileSync(path.join(ROOT, 'memory-organs.js'), 'utf8');
const face = src + String.fromCharCode(10) + orgSrc;
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

function extractMethod(name) {
    const marker = `${name}(`;
    /* [v3.266.0 A1 第六刀] 退路类里有同名前缀方法 `_reportError()`，
     *   它含 `reportError(` 子串会被 indexOf 先命中（抽出的是空退路）。故跳过前导下划线的同名命中。 */
    let start = src.indexOf(marker);
    while (start > 0 && src[start - 1] === '_') start = src.indexOf(marker, start + 1);
    assert.ok(start >= 0, `找到 ${name}`);
    const bodyStart = src.indexOf('{', start);
    let depth = 0;
    for (let i = bodyStart; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}' && --depth === 0) return src.slice(bodyStart + 1, i);
    }
    throw new Error(`${name} 方法未闭合`);
}

test('v3.117 版本三处同步', () => {
    // [v3.203.0] 硬等号交本版接管。此处只守「三源互等 + 不低于本测试所属版本」，
    // 否则每次抬版都要回来改这三个字面量。
    const m = /const VERSION = '([^']+)'/.exec(src);
    assert.ok(m);
    assert.equal(m[1], manifest.version);
    assert.equal(manifest.version, pkg.version);
    assert.ok(vnum(m[1]) >= vnum('3.117.0'), 'index.js 版本 ' + m[1] + ' >= 3.117.0');
});

test('错误记录器不会递归调用自身', () => {
    /* [v3.264.0] 原块取「宿主 errLog 起 → ConfigManager 止」——那段区间在本刀里装进了
     *   兼容挂载点与 _bindOrganDeps（它末尾的 catch 会调 errLog，那是**调用**不是递归定义）。
     *   本判据要守的是「errLog 自己不会在里面再调自己」，故按函数体切片（而不是按到下一个类）。 */
    /* 切片器必须绑在**被切的那一面**上：把 orgSrc 的下标喂给 face 会切出错位的垃圾
     *   （首版就是如此，模块面假报「无告警出口」）。 */
    function braced(hay, at) { let d = 0; for (let i = at; i < hay.length; i++) { if (hay[i] === '{') d++; else if (hay[i] === '}' && --d === 0) return hay.slice(at, i + 1); } return ''; }
    /* [v3.266.0 A1 第六刀] 扫描面扩为三面：入口 / memory-core.js / memory-organs.js
     *   （合看面 src 不能代替模块面：indexOf 只会取到第一个定义）。 */
    for (const hay of [srcRaw, coreSrc, orgSrc]) {
        /* [v3.264.0] 模块内的 errLog 是活口形态 `let errLog = function (`（bindDeps 可换真源），
         *   不是函数声明，故两种形态都要认。 */
        const at = Math.max(hay.indexOf('function errLog('), hay.indexOf('errLog = function ('));
        assert.ok(at >= 0, 'errLog 必须存在于 ' + (hay === srcRaw ? '宿主' : (hay === coreSrc ? '内核模块' : '器官模块')));
        const body = braced(hay, hay.indexOf('{', at));
        assert.ok(body.includes('console.warn'), 'errLog 必须有告警出口');
        assert.ok(!/catch\s*\([^)]*\)\s*\{\s*errLog\(/.test(body), 'errLog 不得在自身 catch 里再调 errLog（递归）');
    }
});

test('公开错误门面限制读取范围并返回副本', () => {
    const report = extractMethod('reportError');
    const get = extractMethod('getErrorLog');
    assert.match(report, /errLog\(error, tag\)/);
    assert.match(get, /Math\.min\(50/);
    assert.match(get, /slice\(-n\)/);
    assert.match(get, /map\(item => \(\{ \.\.\.item \}\)\)/);
});

test('错误门面不暴露内部缓冲写入引用', () => {
    const get = extractMethod('getErrorLog');
    assert.doesNotMatch(get, /return\s+_errBuf\s*;/);
    assert.doesNotMatch(get, /_errBuf\.push/);
});

test('settings UI 使用公开错误报告门面', () => {
    const ui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf8');
    assert.match(ui, /window\.LonShaMemory\?\.reportError/);
});
