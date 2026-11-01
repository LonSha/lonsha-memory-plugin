import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const require = createRequire(import.meta.url);
const registryFile = path.join(ROOT, 'config-effect-registry.js');
const generatorFile = path.join(ROOT, 'tools/gen_config_effect_registry.mjs');
const policyFile = path.join(ROOT, 'config-effect-policy.json');
const uiFile = path.join(ROOT, 'settings-ui.js');
const configFile = path.join(ROOT, 'memory-config.js');

function loadRegistry(file = registryFile) {
    delete require.cache[require.resolve(file)];
    return require(file);
}
function defaultKeys() {
    globalThis.localStorage = { getItem() { return null; }, setItem() {} };
    return Object.keys(require(configFile).ConfigManager ? new (require(configFile).ConfigManager)().config : {});
}
function uiKeys() {
    const ui = fs.readFileSync(uiFile, 'utf8');
    const out = new Set();
    for (const m of ui.matchAll(/data-cfg(?:-num|-text)?="([A-Za-z_][A-Za-z0-9_]*)"/g)) out.add(m[1]);
    for (const m of ui.matchAll(/ck\(\s*'([A-Za-z_][A-Za-z0-9_]*)'/g)) out.add(m[1]);
    for (const key of ['extractionPrompt', 'extractRolesPrompt', 'pyramidTiers', 'secondaryApis']) out.add(key);
    return out;
}

test('O9 registry is bidirectionally complete against ConfigManager and UI collector', () => {
    const reg = loadRegistry();
    const defs = defaultKeys();
    const keys = uiKeys();
    const effectKeys = Object.keys(reg.EFFECT_AT);
    assert.deepEqual(effectKeys.slice().sort(), defs.slice().sort(), 'registry must cover every default config key exactly');
    for (const key of keys) assert.ok(Object.hasOwn(reg.EFFECT_AT, key), `UI collector missing effect_at: ${key}`);
    for (const at of Object.values(reg.EFFECT_AT)) assert.ok(['immediate', 'next-turn', 'next-session'].includes(at));
    assert.equal(reg.getEffectAt('not-a-real-config'), null);
});

test('O9 feedback groups all three effect_at levels and deduplicates', () => {
    const reg = loadRegistry();
    const groups = reg.buildEffectFeedback(['debugMode', 'vectorTopK', 'termLexiconMax', 'debugMode']);
    assert.deepEqual(groups.map(x => x.effect_at), ['immediate', 'next-turn', 'next-session']);
    assert.deepEqual(groups.map(x => x.label), ['已生效', '下一轮生成生效', '重开对话后生效']);
    assert.deepEqual(groups[0].keys, ['debugMode']);
    assert.deepEqual(groups[1].keys, ['vectorTopK']);
    assert.deepEqual(groups[2].keys, ['termLexiconMax']);
});

test('O9 missing-registration negative control changes the real registry behavior', () => {
    const source = fs.readFileSync(registryFile, 'utf8');
    const needle = '"debugMode": "immediate",';
    assert.equal(source.split(needle).length - 1, 1);
    const broken = source.replace(needle, '');
    const temp = path.join(ROOT, 'tests/.tmp_o9_registry_broken.cjs');
    fs.writeFileSync(temp, broken);
    try {
        const brokenReg = loadRegistry(temp);
        assert.equal(brokenReg.getEffectAt('debugMode'), null);
        assert.deepEqual(brokenReg.buildEffectFeedback(['debugMode']), []);
    } finally {
        fs.unlinkSync(temp);
        delete require.cache[require.resolve(temp)];
    }
});

test('O9 policy is the generator source and generated registry matches it', () => {
    const policy = JSON.parse(fs.readFileSync(policyFile, 'utf8')).effect_at;
    const reg = loadRegistry();
    assert.deepEqual(reg.EFFECT_AT, policy);
    assert.match(fs.readFileSync(generatorFile, 'utf8'), /config-effect-policy\.json/);
});

test('O9 settings save path consumes the registry and does not embed a second table', () => {
    const ui = fs.readFileSync(uiFile, 'utf8');
    assert.match(ui, /LonShaMemoryConfigEffects/);
    assert.match(ui, /buildEffectFeedback/);
    assert.match(ui, /设置已保存：/);
    assert.doesNotMatch(ui, /effect_at\s*[:=]\s*['"](?:immediate|next-turn|next-session)/, 'settings-ui must not hard-code effect_at table');
    assert.match(fs.readFileSync(manifestFile(), 'utf8'), /"config-effect-registry\.js"/);
});

function manifestFile() { return path.join(ROOT, 'manifest.json'); }
