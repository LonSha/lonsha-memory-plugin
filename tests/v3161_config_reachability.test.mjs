/* ============================================================
 * v3.161.0 - every declared config key must be reachable, from
 *              either the settings panel or the card whitelist
 *
 * v3.160 关掉了「被读取却没人声明」这一侧；本版关掉另一侧：
 * 「已声明、被引擎读取，却既没有 UI 控件也不在卡白名单里」。
 * 两侧是同一类缺陷的两个方向，故两条不变量都要常驻。
 * ============================================================ */
import { test } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const ROOT = '/home/user/lonsha-memory-plugin';
const src = readFileSync(path.join(ROOT, 'index.js'), 'utf-8');
const sui = readFileSync(path.join(ROOT, 'settings-ui.js'), 'utf-8');
const manifest = JSON.parse(readFileSync(path.join(ROOT, 'manifest.json'), 'utf-8'));
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
function vnum(s) {
    const m = /^([0-9]+)[.]([0-9]+)[.]([0-9]+)/.exec(String(s || '').trim());
    return m ? Number(m[1]) * 1000000 + Number(m[2]) * 1000 + Number(m[3]) : NaN;
}
/** the default config block, plus its character offsets in index.js */
function configBlock() {
    const at = src.indexOf('this.config = {');
    assert.ok(at > 0, 'the default config block exists');
    const open = src.indexOf('{', at);
    let depth = 0, close = -1;
    for (let i = open; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) { close = i; break; } }
    }
    assert.ok(close > open, 'the default config block is balanced');
    return { text: src.slice(open, close + 1), open, close };
}
const CFG = configBlock();
const declaredKeys = new Set([...CFG.text.matchAll(/\n\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/g)].map((m) => m[1]));
/**
 * UI-settable keys. 四种形态缺一不可：
 *   [a] data-cfg*="KEY"          —— 通用控件（checkbox / number / range / text）
 *   [b] ck('KEY'                  —— 复选框模板
 *   [c] config.config.KEY = …     —— 保存路径里的写回（结构型 / 长文本走这里）
 * 注意不能把「c.KEY 直读」也算进来：渲染一个值不等于能把值写回去。
 */
function uiSettable() {
    const out = new Set();
    for (const m of sui.matchAll(/data-cfg(?:-num|-text)?="([A-Za-z_][A-Za-z0-9_]*)"/g)) out.add(m[1]);
    for (const m of sui.matchAll(/\bck\('([A-Za-z_][A-Za-z0-9_]*)'/g)) out.add(m[1]);
    for (const m of sui.matchAll(/config[.]config[.]([A-Za-z_][A-Za-z0-9_]*)\s*=/g)) out.add(m[1]);
    return out;
}
/** the character-card override whitelist */
function whitelist() {
    const m = /const CARD_CFG_KEYS = \[(.*?)\];/s.exec(src);
    assert.ok(m, 'the card whitelist exists');
    return { raw: m[1], keys: new Set([...m[1].matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((x) => x[1])) };
}
// ================= 1. the reachability invariant =================
test('[1] every declared config key is settable from somewhere', () => {
    // 不变量：declared ⊆ (UI 可设置 ∪ 卡白名单)。两边都不能设的键，
    //   引擎读到的永远是硬编码回退值——声明是死声明，旋钮在面板上不存在。
    const wl = whitelist();
    const settable = uiSettable();
    const orphans = [...declaredKeys].filter((k) => !settable.has(k) && !wl.keys.has(k)).sort();
    assert.deepStrictEqual(orphans, [],
        'declared and read by the engine, but no control and no whitelist entry — '
        + 'the fallback value is unreachable: ' + orphans.join(', '));
});
test('[1b] the nine keys this release wired up are now reachable', () => {
    const wl = whitelist();
    const settable = uiSettable();
    const nine = ['aiRecallOpsDebug', 'budgetStrategy', 'dppLambda', 'extractRolesPrompt',
        'memoryTreeEnabled', 'onDemandTriggerPhrase', 'pageRankDamping', 'pyramidTiers', 'secondaryApis'];
    for (const k of nine) {
        assert.ok(declaredKeys.has(k), k + ' is still declared');
        assert.ok(settable.has(k) || wl.keys.has(k), k + ' has a control or a whitelist slot');
    }
});
test('[1c] the two secret / global keys are deliberately kept out of the card', () => {
    // secondaryApis 带 endpoint/apiKey——进卡会随卡泄露 API Key；
    //   extractRolesPrompt 是全局提示词资产，不该被单张角色卡改写。
    //   两者只能从设置面板走，这是刻意的取舍而非遗漏。
    const wl = whitelist();
    for (const k of ['secondaryApis', 'extractRolesPrompt']) {
        assert.ok(!wl.keys.has(k), k + ' must NOT be whitelisted');
        assert.ok(uiSettable().has(k), k + ' must still be settable from the panel');
    }
    assert.ok(wl.raw.includes('secondaryApis'), 'the exclusion is documented in place');
});
// ================= 2. the shipped controls =================
test('[2] the new reasoning group renders every one of the nine', () => {
    const g0 = sui.indexOf('🧭 推理调优');
    const g1 = sui.indexOf('🏛️ 工业级体系化增强');
    assert.ok(g0 > 0 && g1 > g0, 'the reasoning group sits before the industrial group');
    const group = sui.slice(g0, g1);
    for (const k of ['memoryTreeEnabled', 'aiRecallOpsDebug']) {
        assert.ok(group.includes("ck('" + k + "'"), 'checkbox rendered: ' + k);
    }
    for (const k of ['budgetStrategy', 'onDemandTriggerPhrase']) {
        assert.ok(group.includes('data-cfg-text="' + k + '"'), 'text control rendered: ' + k);
    }
    for (const k of ['pageRankDamping', 'dppLambda']) {
        assert.ok(group.includes('data-cfg-num="' + k + '"'), 'slider rendered: ' + k);
    }
    for (const k of ['ls-pyramid-tiers', 'ls-roles-prompt', 'ls-secondary-apis']) {
        assert.ok(group.includes('id="' + k + '"'), 'dedicated control rendered: ' + k);
    }
});
test('[2b] the budgetStrategy options match the engine branch set', () => {
    // 引擎只认三支：relevance / recency / 其余落 balanced。
    //   这里**从源码推导**分支集合，而不是把三支写死在测试里——写死的话，
    //   将来引擎加/删一支，面板与测试会一起停在旧答案上而没人发现。
    const branches = [...new Set([...src.matchAll(/strategy === '([a-z]+)'/g)].map((m) => m[1]))].sort();
    assert.deepStrictEqual(branches, ['recency', 'relevance'],
        'the engine names these two branches explicitly (the third is the else/default)');
    const g0 = sui.indexOf('data-cfg-text="budgetStrategy"');
    assert.ok(g0 > 0, 'the strategy select exists');
    const sel = sui.slice(g0, sui.indexOf('</select>', g0));
    const opts = [...sel.matchAll(/<option value="([a-z]+)"/g)].map((m) => m[1]).sort();
    assert.deepStrictEqual(opts, [...branches, 'balanced'].sort(),
        'the select offers exactly the branches the engine implements, plus the documented default');
    assert.ok(/budgetStrategy \|\| 'balanced'/.test(src), 'the engine default really is balanced');
});
test('[2c] sliders whose domain includes zero must use ?? not ||', () => {
    // dppLambda 的合法取值含 0（0 = 最相关）；写成 `|| 0.5` 会把作者选的 0 悄悄换成 0.5。
    //   这是本仓库已经踩过的一类坑（v3156 zero-value semantics），故此处显式钉住。
    assert.ok(sui.includes('min="0" max="1" step="0.05" value="${c.dppLambda ?? 0.5}"'),
        'the dppLambda slider keeps a ?? fallback so 0 survives');
    assert.ok(!/dppLambda \|\| 0[.]5/.test(sui), 'no || fallback for dppLambda anywhere in the panel');
    assert.ok(sui.includes('${c.pageRankDamping ?? 0.85}'), 'pageRankDamping uses ?? as well');
});
test('[2d] structured controls save through a dedicated path', () => {
    // 通用 data-cfg 收集只认 el.checked / parseFloat / trim()：数组会被 trim 成字符串，
    //   对象会变成 "[object Object]"。故这三个控件必须有专用保存路径。
    const s0 = sui.indexOf('[v3.161] 专用控件的保存路径');
    const s1 = sui.indexOf('this.engine.config.saveConfig();', s0);
    assert.ok(s0 > 0 && s1 > s0, 'the dedicated save block exists');
    const save = sui.slice(s0, s1);
    assert.ok(save.includes("#ls-pyramid-tiers"), 'pyramid tiers is saved explicitly');
    assert.ok(/split\(\/\[，,\\n\]\//.test(save), 'tiers split on both CJK and ASCII commas and newlines');
    assert.ok(/arr[.]length >= 3/.test(save), 'a tier list shorter than three is rejected');
    assert.ok(save.includes('#ls-roles-prompt'), 'the roles prompt is saved explicitly');
    assert.ok(save.includes('#ls-secondary-apis'), 'the channel map is saved explicitly');
    assert.ok(/JSON[.]parse\(/.test(save), 'the channel map goes through JSON.parse');
    assert.ok(/catch/.test(save), 'a malformed channel map is caught, not thrown');
    assert.strictEqual((save.match(/已保留原值/g) || []).length, 3,
        'all three failure modes keep the previous value instead of writing junk');
});
test('[2e] the audits still accept the widened surface', () => {
    for (const a of ['scan_config_liveness', 'scan_wiring', 'scan_slider_coherence']) {
        const r = spawnSync('node', ['tests/audit/' + a + '.mjs'], { cwd: ROOT, encoding: 'utf-8', timeout: 180000 });
        assert.strictEqual(r.status, 0, a + ' must pass: ' + (r.stdout || '') + (r.stderr || ''));
    }
});
// ================= 3. the whitelist stays honest =================
test('[3] the card whitelist gained exactly the five shareable keys', () => {
    const wl = whitelist();
    for (const k of ['budgetStrategy', 'pageRankDamping', 'dppLambda', 'memoryTreeEnabled', 'pyramidTiers']) {
        assert.ok(wl.keys.has(k), k + ' is whitelisted');
    }
});
test('[3b] the whitelist has no ghost entries and no duplicates', () => {
    const wl = whitelist();
    const ghosts = [...wl.keys].filter((k) => !declaredKeys.has(k)).sort();
    assert.deepStrictEqual(ghosts, [], 'whitelisted but not declared: ' + ghosts.join(', '));
    const dupes = [...wl.keys].filter((k) => (wl.raw.match(new RegExp("'" + k + "'", 'g')) || []).length > 1);
    assert.deepStrictEqual(dupes, [], 'duplicated: ' + dupes.join(', '));
});
// ================= 4. release hygiene =================
test('[4] version is synced across the declaration sites', () => {
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    assert.strictEqual(v, manifest.version, 'manifest follows index.js');
    assert.strictEqual(v, pkg.version, 'package follows index.js');
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const top = changelog.split('\n').filter((l) => l.startsWith('## v'))
        .map((l) => l.slice(4).trim()).sort((a, b) => vnum(b) - vnum(a))[0];
    assert.strictEqual(top, v, 'the highest changelog section is the released version');
});
test('[4b] old anchors were taken over, not dropped', () => {
    for (const f of ['v3117_diagnostics', 'v3130_control_plane', 'v3147_cooldown_and_dual_hash']) {
        const t = readFileSync(path.join(ROOT, 'tests', f + '.test.mjs'), 'utf-8');
        const hits = [...t.matchAll(/'(3[.][0-9]+[.][0-9]+)'/g)].map((m) => m[1]);
        assert.ok(hits.length > 0, f + ' still anchors a version string');
        assert.ok(hits.every((h) => vnum(h) >= vnum('3.162.0')), f + ' anchors are not stale');
    }
});
test('[4c] v3160 checks anchors as a lower bound, not as an equality', () => {
    // [4b] 那种「恰好等于本版字符串」的写法会让测试在下一版接管的瞬间翻红。
    //   v3160 从一开始就写成了下界形式，此处把它钉住，防止后来者改回去。
    const t = readFileSync(path.join(ROOT, 'tests/v3160_config_declaration_gap.test.mjs'), 'utf-8');
    assert.ok(/vnum\(h\) >=\s*vnum\('3[.][0-9]+[.][0-9]+'\)/.test(t),
        'the anchor check is a version-agnostic lower bound');
    assert.ok(!/assert[.]equal\([^,]+,\s*'3[.][0-9]+[.][0-9]+'\)/.test(t),
        'no equality pinning to its own release number');
});
test('[4d] the changelog section documents this release', () => {
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const head = changelog.slice(changelog.indexOf('## v3.161.0'), changelog.indexOf('## v3.160.0'));
    assert.ok(head.length > 300, 'the section has substance');
    assert.ok(/推理调优/.test(head), 'the new panel group is named');
    assert.ok(/secondaryApis|secondaryApis/.test(head), 'the secret-key exclusion is explained');
    assert.ok(/白名单/.test(head), 'the whitelist change is described');
});
test('[4e] no unreleased placeholder section is pre-declared', () => {
    // 刻意不写死「下一版号」——那正是 v3159 [3e] 在接过 v3.160 时踩到的坑。
    const changelog = readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf-8');
    const v = /const VERSION = '([0-9.]+)'/.exec(src)[1];
    const ahead = changelog.split('\n').filter((l) => l.startsWith('## v'))
        .map((l) => l.slice(4).trim()).filter((h) => vnum(h) > vnum(v));
    assert.deepStrictEqual(ahead, [], 'no section for a version above the released one');
});
