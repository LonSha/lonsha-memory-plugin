/* tests/v3459_settings_ui_simplify.test.mjs — v3.459.0 设置面板极简重构判据 */
import fs from 'fs';
import vm from 'node:vm';
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
/* Reuse the UI runtime gate's DOM implementation, without running the gate itself.
 * These checks execute production handlers; CSS and native keyboard behavior need a browser. */
function playerPanel(config = {}) {
    const gate = read('tests/audit/scan_ui_runtime.mjs');
    const from = gate.indexOf('const VOID_TAGS =');
    const to = gate.indexOf('/* ---------- 3. 引擎 stub');
    assert.ok(from >= 0 && to > from, '共享 DOM 夹具锚点必须完整');
    const ctx = vm.createContext({});
    vm.runInContext(gate.slice(from, to) + ';globalThis.env = makeEnv();', ctx);
    const { window, document } = ctx.env;
    const cfg = { enabled:true, extractionEnabled:true, autoSave:true,
        extractionProfile:'balanced', apiProviderCustom:false, pyramidTiers:['日记','周记','史记'], ...config };
    let writes = 0;
    const errors = [];
    window.LonShaMemory = { VERSION:'3.461.0', engine:{config:{config:cfg, saveConfig(){ writes++; }}},
        reportError(error){ errors.push(error.message); } };
    const realm=vm.createContext(window);
    vm.runInContext(read('settings-ui.js'),realm);
    const plugin=window.LonShaMemory;
    plugin.showSettingsPanel();
    return { plugin, cfg, document, errors, writes:()=>writes,
        get:selector=>document.querySelector('#lonsha-settings-overlay').querySelector(selector) };
}
test('玩家首屏：专用接口按需展开，预览不提前写配置，保存后重开保留', () => {
    const p=playerPanel();
    assert.equal(p.get('#ls-custom-api-fields').hidden,true);
    const custom=p.get('[data-cfg="apiProviderCustom"]');
    custom.checked=true;
    custom.dispatchEvent({type:'change'});
    assert.equal(p.get('#ls-custom-api-fields').hidden,false);
    assert.equal(p.cfg.apiProviderCustom,false,'展开只是草稿，不应提前写配置');
    assert.match(p.get('#ls-memory-state').textContent,/预览/);
    p.get('#ls-save').click();
    assert.equal(p.cfg.apiProviderCustom,true);
    assert.equal(p.writes(),1);
    p.plugin.showSettingsPanel();
    assert.equal(p.get('#ls-custom-api-fields').hidden,false);
    assert.deepEqual(p.errors,[]);
});
test('玩家档位：点击保存真实配置、同步下拉与辅助状态，重开仍选中', () => {
    const p=playerPanel();
    p.get('[data-profile="quality"]').click();
    assert.equal(p.cfg.extractionProfile,'quality');
    assert.equal(p.writes(),1);
    assert.equal(p.get('[data-profile="quality"]').getAttribute('aria-pressed'),'true');
    assert.equal(p.get('select[data-cfg-text="extractionProfile"]').value,'quality');
    assert.match(p.get('#ls-profile-help').textContent,/每条/);
    p.plugin.showSettingsPanel();
    assert.equal(p.get('[data-profile="quality"]').getAttribute('aria-pressed'),'true');
});
test('手填模型名走真实保存路径，故事入口调用原有视图且保留设置草稿', () => {
    const p=playerPanel();
    const input=p.get('#ls-model-input');
    input.value='player-model';
    input.dispatchEvent({type:'input'});
    assert.equal(p.get('#ls-model-select').value,'player-model');
    p.get('#ls-save').click();
    assert.equal(p.cfg.apiModel,'player-model');
    p.plugin.showSettingsPanel();
    const views=[];
    p.plugin.showBrowser=view=>views.push(view);
    p.get('[data-settings-view="summaries"]').click();
    assert.deepEqual(views,['summaries']);
    assert.ok(p.document.querySelector('#lonsha-settings-overlay'));
    assert.deepEqual(p.errors,[]);
});
test('记忆档位键盘可达：Enter 与空格走点击同一条真实保存路径', () => {
    const p=playerPanel();
    const key=(el,k)=>el.dispatchEvent({type:'keydown',key:k,preventDefault(){},stopPropagation(){}});
    key(p.get('[data-profile="low-cost"]'),'Enter');
    assert.equal(p.cfg.extractionProfile,'low-cost','Enter 必须真实切档');
    assert.equal(p.writes(),1,'Enter 必须落盘保存');
    assert.equal(p.get('[data-profile="low-cost"]').getAttribute('aria-pressed'),'true');
    assert.equal(p.get('select[data-cfg-text="extractionProfile"]').value,'low-cost');
    assert.match(p.get('#ls-profile-help').textContent,/每 5 条/);
    key(p.get('[data-profile="balanced"]'),' ');
    assert.equal(p.cfg.extractionProfile,'balanced','空格键必须真实切档');
    assert.equal(p.writes(),2,'空格键必须落盘保存');
    assert.equal(p.get('[data-profile="balanced"]').getAttribute('aria-pressed'),'true');
    assert.equal(p.get('[data-profile="low-cost"]').getAttribute('aria-pressed'),'false','aria-pressed 必须互斥');
    key(p.get('[data-profile="balanced"]'),'q');
    assert.equal(p.cfg.extractionProfile,'balanced','非 Enter/空格键不得切档');
    assert.equal(p.writes(),2,'非 Enter/空格键不得额外保存');
    assert.deepEqual(p.errors,[]);
});
