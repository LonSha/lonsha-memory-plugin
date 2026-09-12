// tests/v350_backfill.test.mjs
// v3.5 补提取测试：缺口扫描（user/系统/番外/空楼/已覆盖 五类豁免）+ 补提取行为 + 角色节点去重防放大
// 运行: node tests/v350_backfill.test.mjs
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';

const srcI = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const srcS = readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
let pass = 0;
const ok = (msg) => { pass++; console.log('ok: ' + msg); };

/* ---------- 提取器 ---------- */
function braceEnd(s, open) {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        const ch = s[i];
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return i; }
        else if (ch === "'" || ch === '"' || ch === '`') { const q = ch; i++; while (i < s.length && s[i] !== q) { if (s[i] === '\\') i++; i++; } }
        else if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; }
    }
    return -1;
}
function extractMethod(name) {
    const start = srcI.indexOf(`        ${name}(`);
    if (start < 0) throw new Error('missing method ' + name);
    const brace = srcI.indexOf('{', srcI.indexOf(')', start));
    return 'function ' + srcI.slice(start + 8, braceEnd(srcI, brace) + 1);
}
function extractAsyncMethod(name) {
    const start = srcI.indexOf(`        async ${name}(`);
    if (start < 0) throw new Error('missing async method ' + name);
    const brace = srcI.indexOf('{', srcI.indexOf(')', start));
    return 'async function ' + srcI.slice(start + 14, braceEnd(srcI, brace) + 1); // 跳过 8 空格 + "async "
}

/* ══════════ 1. scanMissingFloors 行为 ══════════ */
{
    const fnSrc = extractMethod('scanMissingFloors');
    const mk = (chat, summaries, omitted) => {
        const eng = {
            summary: { summaries },
            isOmittedFloor: (m) => (omitted || []).includes(m),
        };
        const wrapped = new Function('window', 'errLog', `
            ${fnSrc}
            return { scanMissingFloors };
        `);
        const inst = wrapped({ SillyTavern: { getContext: () => ({ chat }) } }, () => {});
        return inst.scanMissingFloors.call(eng);
    };

    // 场景1: 基本缺口识别（4楼，1、3 已覆盖，2 缺）
    {
        const chat = [
            { mes: '用户说话', is_user: true },
            { mes: 'AI楼1', is_user: false },
            { mes: 'AI楼2', is_user: false },
            { mes: 'AI楼3', is_user: false },
        ];
        const r = mk(chat, [{ floor: 1 }, { floor: 3 }]);
        assert.deepEqual(r, [2]);
        ok('扫描1: 基本缺口（只报未覆盖的AI楼）');
    }

    // 场景2: 五类豁免——user/系统/番外/空/已覆盖
    {
        const omitMsg = { mes: '番外' };
        const chat = [
            { mes: 'u', is_user: true },                    // 0 user 豁免
            { mes: 'sys', is_system: true },                // 1 系统豁免
            omitMsg,                                        // 2 番外豁免
            { mes: '   ' },                                 // 3 空豁免
            { mes: 'AI已覆盖', is_user: false },            // 4 已覆盖
            { mes: 'AI缺口', is_user: false },              // 5 缺口
        ];
        const r = mk(chat, [{ floor: 4 }], [omitMsg]);
        assert.deepEqual(r, [5]);
        ok('扫描2: 五类豁免全生效');
    }

    // 场景3: 全空聊天
    {
        assert.deepEqual(mk([], []), []);
        ok('扫描3: 空聊天 → 空数组');
    }
}

/* ══════════ 2. backfillFloors 行为（含去重防放大） ══════════ */
{
    const fnSrc = extractAsyncMethod('backfillFloors');
    const makeEnv = (chat, extracted, graphState) => {
        const calls = { summary: [], addNode: [], addEdge: [] };
        const eng = {
            config: { config: { extractionLockEnabled: false, debugMode: false } },
            mutex: { acquire: async () => true, release: () => {} },
            cleanMessageText: (t) => t,
            extractMemoryWithLLM: async () => extracted,
            resolveCharacterName: (n) => String(n || '').trim().toLowerCase(),
            summary: { createSummary: async (m, s) => calls.summary.push({ floor: m.index, s }) },
            graph: {
                findByNames: (names) => {
                    const found = [];
                    for (const n of names) {
                        if ((graphState || []).includes(n)) found.push({ type: 'character', name: n });
                    }
                    return found;
                },
                addNode: (nd) => { calls.addNode.push(nd); return 'nid_' + calls.addNode.length; },
                addEdge: (e) => { calls.addEdge.push(e); return 'eid'; },
            },
            storage: { save: async () => {} },
            collectExport: () => ({}),
            getCurrentChatId: () => 'c1',
        };
        const wrapped = new Function('window', 'errLog', 'PLUGIN_NAME', `
            ${fnSrc}
            return { backfillFloors };
        `);
        const inst = wrapped({ SillyTavern: { getContext: () => ({ chat }) } }, () => {}, 'LonSha记忆引擎');
        return { eng, calls, run: (floors, cb) => inst.backfillFloors.call(eng, floors, cb) };
    };

    // 场景1: 正常补提一楼——摘要+角色(新建)+事件+关系
    {
        const chat = [{ mes: 'x' }, { mes: 'AI正文', is_user: false }];
        const extracted = {
            summary: '他拿起了剑。',
            characters: ['林澈'],
            events: [{ type: '战斗', participants: ['林澈'] }],
            relationships: [{ from: '林澈', to: '苏晚', type: '搭档', attitude: 'positive' }],
        };
        const { calls, run } = makeEnv(chat, extracted, []);
        const r = await run([1]);
        assert.equal(r.ok, 1);
        assert.equal(calls.summary.length, 1);
        assert.equal(calls.addNode.filter(n => n.type === 'character').length, 1);
        assert.equal(calls.addNode.filter(n => n.type === 'event').length, 1);
        assert.equal(calls.addEdge.length, 2); // participated_in + 搭档
        ok('补提1: 摘要+角色+事件+关系全写入');
    }

    // 场景2: 角色节点去重——已存在「林澈」不再 addNode
    {
        const chat = [{ mes: 'x' }, { mes: 'AI正文', is_user: false }];
        const extracted = { summary: 's', characters: ['林澈'], events: [], relationships: [] };
        const { calls, run } = makeEnv(chat, extracted, ['林澈']);
        await run([1]);
        assert.equal(calls.addNode.filter(n => n.type === 'character').length, 0, '已存在角色不重复建');
        ok('补提2: 角色节点先查后建（防历史重灌放大）');
    }

    // 场景3: 上限保护（>30 楼截断）
    {
        const chat = Array.from({ length: 50 }, (_, i) => ({ mes: 'AI' + i, is_user: false }));
        const extracted = { summary: 's' };
        const { calls, run } = makeEnv(chat, extracted, []);
        const r = await run(chat.map((_, i) => i));
        assert.equal(calls.summary.length, 30, '最多补 30 楼');
        assert.equal(r.ok, 30);
        ok('补提3: 单次上限 30 楼');
    }

    // 场景4: 空楼跳过
    {
        const chat = [{ mes: 'x' }, { mes: '' }];
        const extracted = { summary: 's' };
        const { calls, run } = makeEnv(chat, extracted, []);
        const r = await run([1]);
        assert.equal(r.skipped, 1);
        assert.equal(calls.summary.length, 0);
        ok('补提4: 空楼跳过');
    }
}

/* ══════════ 3. UI 接入（静态断言） ══════════ */
{
    assert.ok(srcS.includes('id="ls-backfill"'), '按钮存在');
    assert.ok(srcS.includes("overlay.querySelector('#ls-backfill').addEventListener('click'"), '事件绑定存在');
    const declIdx = srcS.indexOf("const overlay = makeSheet('lonsha-settings-overlay'");
    const bindIdx = srcS.indexOf("overlay.querySelector('#ls-backfill')");
    assert.ok(declIdx < bindIdx, '绑定在 overlay 声明之后（无 TDZ）');
    assert.ok(srcI.includes("['补提取',"), 'selfCheck 缺楼计数存在');
    ok('UI1: 按钮+绑定+诊断计数齐全，无 TDZ');
}

console.log(`\n✓ v3.5 补提取测试全过 (${pass} 项)`);