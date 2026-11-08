/* tests/v3459_settings_ui_simplify.test.mjs — v3.459.0 设置面板极简重构判据 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import test from 'node:test';
import assert from 'node:assert/strict';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}

/* 只看设置面板 body 模板，避免把其它 show* 面板算进来 */
function settingsBody() {
    const lines = read('settings-ui.js').split('\n');
    let panel = -1;
    for (let i = 0; i < lines.length; i++) if (lines[i].includes('plugin.showSettingsPanel = function')) { panel = i; break; }
    let a = -1, b = -1;
    for (let i = panel; i < lines.length; i++) if (lines[i].includes('const body = `')) { a = i; break; }
    for (let i = a + 1; i < lines.length; i++) if (lines[i].trim() === '`;') { b = i; break; }
    assert.ok(panel >= 0 && a >= 0 && b > a, '设置面板 body 模板必须可定位');
    return lines.slice(a, b + 1).join('\n');
}

test('当版锚点：版本与四源同源', () => {
    const cur = /const VERSION = '([0-9.]+)'/.exec(read('index.js'))[1];
    assert.ok(vnum(cur) >= 3459000);
    assert.equal(JSON.parse(read('manifest.json')).version, cur);
    assert.equal(JSON.parse(read('package.json')).version, cur);
});

test('四个标签页按玩家动线重划、各自独立闭合', () => {
    const body = settingsBody();
    const panes = [...body.matchAll(/<div class="ls-tab-pane[^"]*" data-tab-pane="([a-z]+)"/g)].map(m => m[1]);
    assert.deepEqual(panes.sort(), ['advanced', 'general', 'narrative', 'retrieval']);
    // 每个面板开标签出现时 div 深度都应为 1（彼此独立，不再嵌套）
    let depth = 0;
    const before = {};
    for (const m of body.matchAll(/<div\b|<\/div>/gi)) {
        const open = m[0].toLowerCase() === '<div';
        if (open) {
            const tail = body.slice(m.index, m.index + 120);
            const pm = /data-tab-pane="([a-z]+)"/.exec(tail);
            if (pm) before[pm[1]] = depth;
            depth++;
        } else depth--;
    }
    assert.equal(depth, 0, 'body 模板 div 必须整体配平');
    for (const k of Object.keys(before)) assert.equal(before[k], 0, k + ' 面板被嵌套在其它面板里');
});

test('学术参数默认折叠、开箱即用文案在场、控件契约零丢失', () => {
    const body = settingsBody();
    assert.ok((body.match(/<details/g) || []).length >= 2, '进阶/高级参数必须默认折叠');
    assert.ok(body.includes('开箱即用'), '首屏必须有开箱即用指引');
    assert.ok(body.includes('高级实验室'), '学术参数必须归入高级实验室');
    assert.equal((body.match(/\bck\('/g) || []).length, 131, '复选框控件数不得变化');
    assert.equal((body.match(/data-cfg(?:-num|-text)?="/g) || []).length, 82, '文本/滑块控件数不得变化');
    for (const id of ['ls-save', 'ls-clear', 'ls-export', 'ls-import', 'ls-snap-restore', 'ls-extract-roles']) {
        assert.ok(body.includes('id="' + id + '"'), '关键控件 ' + id + ' 必须在册');
    }
});