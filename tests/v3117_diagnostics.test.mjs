import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function extractMethod(name) {
    const marker = `${name}(`;
    const start = src.indexOf(marker);
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
    const m = /const VERSION = '([^']+)'/.exec(src);
    assert.ok(m);
    assert.equal(m[1], '3.143.0');
    assert.equal(manifest.version, '3.143.0');
    assert.equal(pkg.version, '3.143.0');
});

test('错误记录器不会递归调用自身', () => {
    const i = src.indexOf('function errLog(');
    const block = src.slice(i, src.indexOf('class ConfigManager', i));
    assert.ok(block.includes('console.warn'));
    assert.ok(!/catch\s*\([^)]*\)\s*\{\s*errLog\(/.test(block));
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
