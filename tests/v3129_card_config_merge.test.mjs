// tests/v3129_card_config_merge.test.mjs
// [v3.129] anima 三级配置合并：角色卡 data.extensions.LonShaMemory 覆盖层
// 行为级验证：从 index.js 抠出 _applyCardOverrides 在 mock window 下实测白名单/深合并/忽略非白名单键
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../index.js', import.meta.url), 'utf8');

function extractMethodBody() {
    const marker = `_applyCardOverrides() {`;
    const start = src.indexOf(marker);
    assert.ok(start >= 0, '_applyCardOverrides 定义存在');
    let depth = 0, i = src.indexOf('{', start);
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    // 返回方法体内部（不含签名行与外层花括号）
    return src.slice(src.indexOf('{', start) + 1, i);
}

const errLog = () => {};
const PLUGIN_NAME = 'test';
// harness：外层 Function 形参 (window, errLog, PLUGIN_NAME) 在调用时传入实参，闭包捕获后再返回方法。
// （若外层调用时不传参，闭包捕获的 window 为 undefined，内层实参会被丢弃——已实测踩坑）
const makeApply = (win) => new Function('window', 'errLog', 'PLUGIN_NAME', `return function () { ${extractMethodBody()} }`)(win, errLog, PLUGIN_NAME);

test('v3.129 白名单键生效，非白名单键被忽略，null/undefined 跳过', () => {
    const window = { SillyTavern: { getContext: () => ({
        character: { data: { extensions: { LonShaMemory: {
            vectorTopK: 12,              // 白名单 → 覆盖
            diaryEveryFloors: 5,         // 白名单 → 覆盖
            apiUrl: 'http://evil',       // 非白名单 → 忽略（API 资产不随卡携带）
            apiKey: 'sk-evil',           // 非白名单 → 忽略
            echoEnabled: null,           // 白名单但 null → 跳过
            maxMoneyDelta: 8888,         // 白名单 → 覆盖
        } } } }
    }) } };
    const cfg = { config: { vectorTopK: 5, diaryEveryFloors: 3, apiUrl: 'http://orig', apiKey: 'sk-orig', echoEnabled: true, maxMoneyDelta: 0 } };
    const apply = makeApply(window);
    const applied = apply.call(cfg);
    assert.equal(applied, 3, '只有 3 个白名单非空键生效');
    assert.equal(cfg.config.vectorTopK, 12);
    assert.equal(cfg.config.diaryEveryFloors, 5);
    assert.equal(cfg.config.maxMoneyDelta, 8888);
    assert.equal(cfg.config.apiUrl, 'http://orig', '非白名单键不动');
    assert.equal(cfg.config.apiKey, 'sk-orig', 'API 密钥不被卡覆盖');
    assert.equal(cfg.config.echoEnabled, true, 'null 不覆盖');
});

test('v3.129 无卡配置 / 结构损坏时安全返回 0', () => {
    const apply1 = makeApply({ SillyTavern: { getContext: () => ({ character: { data: { extensions: {} } } }) } });
    assert.equal(apply1.call({ config: {} }), 0, 'extensions 无 LonShaMemory → 0');
    // character.data 缺失
    const apply2 = makeApply({ SillyTavern: { getContext: () => ({}) } });
    const cfg2 = { config: { vectorTopK: 5 } };
    assert.equal(apply2.call(cfg2), 0);
    assert.equal(cfg2.config.vectorTopK, 5);
    // window 无 SillyTavern
    const apply3 = makeApply({});
    assert.equal(apply3.call({ config: {} }), 0);
});

test('v3.129 载入与切换角色接线', () => {
    // loadConfig 在 localStorage 合并后调用卡覆盖
    const iLoad = src.indexOf('this._applyCardOverrides();');
    assert.ok(iLoad > 0, 'loadConfig 接线存在');
    const iSaved = src.indexOf("if (saved) this.config = {...this.config, ...JSON.parse(saved)};");
    assert.ok(iSaved > 0 && iLoad > iSaved, '卡覆盖发生在全局层合并之后');
    // CHAT_CHANGED 事件重放
    assert.match(src, /this\.engine\.config\?\._applyCardOverrides\?\.\(\)/);
});