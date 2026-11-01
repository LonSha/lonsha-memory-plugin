#!/usr/bin/env node
/**
 * L13-O9: 从配置真源 + settings-ui 收集面生成唯一 effect_at 登记面。
 * 不允许在 settings-ui 内再复制一张生效时机表。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const UI_FILE = path.join(ROOT, 'settings-ui.js');
const POLICY_FILE = path.join(ROOT, 'config-effect-policy.json');
const OUT_FILE = path.join(ROOT, 'config-effect-registry.js');
const ui = fs.readFileSync(UI_FILE, 'utf8');
const policy = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf8')).effect_at;

// ConfigManager 的构造会尝试读取 localStorage；给它一个最小真环境，避免工具依赖浏览器。
globalThis.localStorage = { getItem() { return null; }, setItem() {} };
const require = createRequire(import.meta.url);
const ConfigManager = require(path.join(ROOT, 'memory-config.js')).ConfigManager;
const defaultKeys = Object.keys(new ConfigManager().config);

const uiKeys = new Set();
for (const m of ui.matchAll(/data-cfg(?:-num|-text)?="([A-Za-z_][A-Za-z0-9_]*)"/g)) uiKeys.add(m[1]);
for (const m of ui.matchAll(/ck\(\s*'([A-Za-z_][A-Za-z0-9_]*)'/g)) uiKeys.add(m[1]);
// 这些控件不是 data-cfg 属性，但保存处理器有专用收集分支。
for (const key of ['extractionPrompt', 'extractRolesPrompt', 'pyramidTiers', 'secondaryApis']) uiKeys.add(key);

const allowed = new Set(['immediate', 'next-turn', 'next-session']);
for (const [key, at] of Object.entries(policy)) {
    if (!defaultKeys.includes(key)) throw new Error(`policy key missing from ConfigManager defaults: ${key}`);
    if (!allowed.has(at)) throw new Error(`invalid effect_at for ${key}: ${at}`);
}
for (const key of defaultKeys) if (!Object.hasOwn(policy, key)) throw new Error(`default config missing effect_at: ${key}`);
for (const key of uiKeys) if (!defaultKeys.includes(key)) throw new Error(`UI collector key missing from ConfigManager defaults: ${key}`);
for (const key of uiKeys) if (!Object.hasOwn(policy, key)) throw new Error(`UI collector missing effect_at: ${key}`);

const effectAt = (key) => policy[key] || null;
const keys = defaultKeys.slice();
const quote = (s) => JSON.stringify(s);
const lines = [
    '(function (global) {',
    "    'use strict';",
    '    /* [L13-O9] GENERATED: ConfigManager defaults + settings-ui collector keys. */',
    '    /* effect_at: immediate=当前运行时读取；next-turn=下一次生成/提取入口；next-session=重建引擎后。 */',
    '    const EFFECT_AT = Object.freeze({',
];
for (const key of keys) lines.push(`        ${quote(key)}: ${quote(effectAt(key))},`);
lines.push(
    '    });',
    '    const LABELS = Object.freeze({',
    "        immediate: '已生效',",
    "        'next-turn': '下一轮生成生效',",
    "        'next-session': '重开对话后生效',",
    '    });',
    '    function getEffectAt(key) { return EFFECT_AT[key] || null; }',
    '    function buildEffectFeedback(keysToReport) {',
    "        const groups = { immediate: [], 'next-turn': [], 'next-session': [] };",
    '        for (const key of Array.isArray(keysToReport) ? keysToReport : []) {',
    '            const at = getEffectAt(key);',
    '            if (at && !groups[at].includes(key)) groups[at].push(key);',
    '        }',
    "        return Object.keys(groups).filter(at => groups[at].length).map(at => ({ effect_at: at, label: LABELS[at], keys: groups[at].slice() }));",
    '    }',
    '    const api = Object.freeze({ EFFECT_AT, LABELS, getEffectAt, buildEffectFeedback });',
    '    global.LonShaMemoryConfigEffects = api;',
    "    if (typeof module !== 'undefined' && module.exports) module.exports = api;",
    '})(typeof window !== \'undefined\' ? window : globalThis);',
    '',
);
fs.writeFileSync(OUT_FILE, lines.join('\n'), 'utf8');
console.log(JSON.stringify({
    output: path.relative(ROOT, OUT_FILE), defaults: defaultKeys.length, uiCollectors: uiKeys.size,
    immediate: keys.filter(k => effectAt(k) === 'immediate').length,
    nextTurn: keys.filter(k => effectAt(k) === 'next-turn').length,
    nextSession: keys.filter(k => effectAt(k) === 'next-session').length,
}, null, 2));
