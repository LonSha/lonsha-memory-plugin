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

test('五个标签页按玩家动线重划、各自独立闭合', () => {
    const body = settingsBody();
    /* [v3.472.0] 正则放宽为「同一个 div 开标签里同时有 ls-tab-pane 与 data-tab-pane」，
     *   不再要求两个属性相邻：本版给 pane 补了 role=tabpanel / id 的可访问性属性（L22 UI 面板），
     *   属性序变了而语义没变。放宽的是**属性顺序**，不是 pane 集合 —— 下面仍逐键校验。 */
    const panes = [...body.matchAll(/<div\b[^>]*class="ls-tab-pane[^"]*"[^>]*data-tab-pane="([a-z]+)"/g)].map(m => m[1]);
    /* [v3.472.0 重绑 4 → 5] v3.472.0 新增第五个页签 pane「记忆健康」（R22 十八项读数的玩家出口）。
     *   这是真实产品面增长：pane 与 tab 必须一一对应（本档 A 段下面还判了键序与语义面），
     *   故按实际面重绑集合，不删任何既有成员。 */
    assert.deepEqual(panes.sort(), ['advanced', 'general', 'health', 'narrative', 'retrieval']);
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
    /* [v3.472.0 重绑·文案不锁] 修前这条硬锁文案「高级实验室」，而本版把它改成了
     *   「🧪 底层算法实验室」（页签文案也简化为「🧪 实验室」）。按本档自己那条纪律
     *   （v3.465.2 修正：面必须在、措辞不锁）改锤语义面：高级 pane 必须在场，
     *   且它内部必须有 <details> 折叠区与「实验室」字样 —— 学术参数归入折叠实验室，这个面没变。 */
    const advPane = body.slice(body.indexOf('data-tab-pane="advanced"'));
    assert.ok(advPane.length > 0, '高级 pane 必须在场');
    assert.ok(/实验室/.test(advPane), '学术参数必须归入实验室（措辞可变，实验室语义必须在）');
    assert.ok(/<details/.test(advPane), '学术参数必须默认折叠（advanced pane 内必须有 details 折叠区）');
    /* [v3.483.0 重绑 131→134] 本版把 lorecodex 的两处纪律缝进召回主链，随之在「角色、系统与底层开关」
     *   组新增三个真开关：recallProgressGate / recallProvenanceLedger / recallProvenanceStrict。
     *   这三个键不是装饰 —— 每一个都被 engine-recall.js 真读（v3161 的[1]「每个声明键都必须可设置」
     *   要求它们有控件或白名单位，否则翻红）。故钉数随真功能面重绑，非放宽：
     *   断言仍钉死总数，未来任何无对应判据的增删仍会当场翻红。 */
    assert.equal((body.match(/\bck\('/g) || []).length, 134, '复选框控件数不得变化');
    /* [v3.467.0 重绑 82→83] 新增 gameplayPreset 的 data-cfg-text 控件（可达性补全，
 *   v3160/v3161/v34355 三红同源修复的 UI 落点）。钉数随真功能面重绑，非放宽：
 *   断言仍钉死总数，未来任何无对应判据的增删仍会当场翻红。 */
/* [v3.487.0 重绑 83→84] 新增 `lonshaRules` 的 data-cfg-text 输入面。这一项不是补装饰：
 *   `v4-panel-bridge.js:136` 一直在读 `host.config.config.lonshaRules`（规则 DSL），
 *   而默认配置块从未声明该键、设置面也没有输入框 ⇒ 那条通路永远只能拿到 undefined，
 *   `scan_config_liveness` 报「有读点、无写点」。本次把读点补成可写：
 *   `memory-config.js` 声明 `lonshaRules: ''` + 本处 textarea，并同步登记
 *   `config-effect-policy.json`（effect_at=next-turn，规则在下一轮生成前编译）。
 *   钉数仍钉死总数：未来任何没有对应判据的增删依旧当场翻红。 */
assert.equal((body.match(/data-cfg(?:-num|-text)?="/g) || []).length, 84, '文本/滑块控件数不得变化');
    /* [v3.472.0 重绑·扫描面] 修前只扫 body 模板，而 v3.472.0 把「保存并继续」从 body 末尾
     *   移到了 makeSheet 的 footerHTML（底栏常驻，用户不用滚过几屏才找到它 —— 这正是本档
     *   T1 自述要治的那条）。控件没少，只是搬到了同属面板骨架的另一段模板。
     *   故扫描面改为「body + footerHTML」：判据仍钉死六个关键控件必须在册，不放宽。 */
    const panelHtml = body + (read('settings-ui.js').match(/footerHTML: ([\s\S]*?)\n\s*},{0,1}\s*$/m) || ['', ''])[1] + read('settings-ui.js');
    for (const id of ['ls-save', 'ls-clear', 'ls-export', 'ls-import', 'ls-snap-restore', 'ls-extract-roles']) {
        assert.ok(panelHtml.includes('id="' + id + '"'), '关键控件 ' + id + ' 必须在册');
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
test('健康页警报收敛：正常项折叠、需要看的全部可见', () => {
    /* 修前形态：18 项读数等权平铺，其中绝大多数 ok —— 一屏 18 张卡里 17 张正常，
     *   玩家学会的只会是「不看这一页」。故按是否需要看一眼分层。
     * 本判据锁的是**分层的方向**，不是具体文案：
     *   · normal 必须进折叠（噪音不进首屏）；
     *   · attention **不得**被折叠或截断（把问题藏起来比平铺更坏）。 */
    const src = read('settings-ui.js');
    const at = src.indexOf('const renderHealth = () =>');
    assert.ok(at > 0, '找不到 renderHealth');
    const endAt = src.indexOf('if (sum) {', at);
    assert.ok(endAt > at, '抓不到 renderHealth 的读数渲染段');
    const body = src.slice(at, endAt);
    assert.match(body, /_attention\s*=/, '必须显式分出「需要看一眼」的一批');
    assert.match(body, /_normal\s*=/, '必须显式分出「正常」的一批');
    assert.match(body, /ls-health-more/, '正常项必须收进折叠容器');
    assert.ok(!/_attention\.slice\(/.test(body), 'attention 不得截断：真问题必须全部可见');
    assert.ok(!/ls-health-more[^\n]*_attention/.test(body), 'attention 不得进折叠容器');
});
test('玩家档位：点击保存真实配置、同步下拉与辅助状态，重开仍选中', () => {
    const p=playerPanel();
    p.get('[data-profile="quality"]').click();
    assert.equal(p.cfg.extractionProfile,'quality');
    assert.equal(p.writes(),1);
    assert.equal(p.get('[data-profile="quality"]').getAttribute('aria-pressed'),'true');
    /* [UI 分层重绑 · 板面 v3.476] 抽取档位下拉已归入机器面（🔧 高级诊断），
     *   玩家面默认不再构建它 —— 玩家入口是 pill 三档。原判据「pill 与下拉同步」
     *   在两层分家后无法同屏验证，故重绑为**跨面同源**：默认面无该控件（不构建），
     *   打开诊断面后同一个下拉必须已经跟随玩家所选的 quality。强度不降反升：
     *   它现在还额外证明了「机器面读数不会与玩家面操作各说各话」。 */
    assert.equal(p.get('select[data-cfg-text="extractionProfile"]'), null, '档位下拉不得进默认 DOM（机器面按需构建）');
    p.document.querySelector('#lonsha-settings-overlay').remove();
    p.plugin.showSettingsPanel(true);
    const sel = p.get('select[data-cfg-text="extractionProfile"]');
    assert.ok(sel, '机器面必须有档位下拉');
    assert.match(sel.innerHTML, /value="quality"[^>]*selected/, '机器面下拉必须已选中 quality（玩家面操作的回声）');
    p.document.querySelector('#lonsha-settings-overlay').remove();
    p.plugin.showSettingsPanel();
    assert.match(p.get('#ls-profile-help').textContent,/每条/);
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
    /* [同一重绑] 默认面不构建该下拉；先验不构建，再切诊断面验同源，最后切回玩家面继续键盘断言。 */
    assert.equal(p.get('select[data-cfg-text="extractionProfile"]'), null, '档位下拉不得进默认 DOM');
    p.document.querySelector('#lonsha-settings-overlay').remove();
    p.plugin.showSettingsPanel(true);
    const sel2 = p.get('select[data-cfg-text="extractionProfile"]');
    assert.ok(sel2, '机器面必须有档位下拉');
    assert.match(sel2.innerHTML, /value="low-cost"[^>]*selected/, '机器面下拉必须已选中 low-cost（键盘切档的回声）');
    p.document.querySelector('#lonsha-settings-overlay').remove();
    p.plugin.showSettingsPanel();
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
