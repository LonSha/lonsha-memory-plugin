// tests/v3184_fuzzy_patch.test.mjs
// [v3.184.0] 归一化补丁匹配（fuzzy-patch.js）——移植 nocturne_memory backend/text_patch.py。
//
// 这一面的**真缺陷**（修前实测形态）：
//   8 处「把值填进用户可编辑模板」写成裸字面 .replace。用户在设置面板把 {{KNOWN_CHARS}}
//   编辑成全角括号/带空格形态之后，一次都不命中 —— 占位符原样发给 LLM（模型看到的是
//   模板语法而不是角色名单），且返回值非空、不抛、零日志。
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import assert from 'node:assert/strict';
import test from 'node:test';

const ROOT = new URL('..', import.meta.url).pathname;
const require_ = createRequire(import.meta.url);
const src = readFileSync(ROOT + 'index.js', 'utf-8');
const sui = readFileSync(ROOT + 'settings-ui.js', 'utf-8');
const mf = JSON.parse(readFileSync(ROOT + 'manifest.json', 'utf-8'));
const MOD_SRC = readFileSync(ROOT + 'fuzzy-patch.js', 'utf-8');
const FP = require_('../fuzzy-patch.js');
const goodGlobal = globalThis.LonShaFuzzyPatch;   // 快照必须在 require 之后取（IIFE 自挂全局）

/* ══════════════ 1. 归一化与位置映射 ══════════════ */
test('v3184f 1. normalizeWithPositions：变体映射 / 行尾空白 / 空格折叠 / 缩进保护', () => {
    // 弯引号 → ASCII（1 对 1，长度不变 ⇒ 位置映射仍成立）
    const q = FP.normalizeWithPositions('\u201c甲\u201d');
    assert.equal(q.text, '"甲"');
    assert.equal(q.posMap.length, q.text.length, '位置映射与归一化文本等长');
    // 行尾空白剥掉
    assert.equal(FP.normalizeWithPositions('甲   \n乙').text, '甲\n乙');
    // 连续空格折叠（行内）
    assert.equal(FP.normalizeWithPositions('甲   乙').text, '甲 乙');
    // 缩进保护：行首空白不参与折叠（第 2 行起）
    const ind = FP.normalizeWithPositions('甲\n    乙');
    assert.equal(ind.text, '甲\n    乙', '深层缩进不得被折叠成一个空格');
    // 首行缩进：保护 vs 不保护（片段模式）
    assert.equal(FP.normalizeWithPositions('    甲', { preserveFirstLineIndent: true }).text, '    甲');
    assert.equal(FP.normalizeWithPositions('    甲', { preserveFirstLineIndent: false }).text, ' 甲');
    // CRLF：行内 CR 不进归一化文本
    assert.equal(FP.normalizeWithPositions('甲\r\n乙').text, '甲\n乙');
    // 不抛
    assert.doesNotThrow(() => FP.normalizeWithPositions(null));
    assert.doesNotThrow(() => FP.normalizeWithPositions(12345));
    assert.doesNotThrow(() => FP.normalizeWithPositions({ a: 1 }));
    // 朴素计数助手
    assert.equal(FP.countOccurrences('aaa', 'aa'), 1, '不重叠计数');
    assert.equal(FP.countOccurrences('abab', 'ab'), 2);
    assert.equal(FP.countOccurrences('abc', ''), 0, '空针不算命中');
});

test('v3184f 2. findValidMatches：滑进缩进区的命中必须被判无效', () => {
    // 候选带前导空白 + 命中的前缀全是空白 = 「滑进缩进区」
    //   ① 命中正好落在行首、且未折叠 ⇒ 有效
    assert.equal(FP.findValidMatches('甲\n  乙', '  乙', false).length, 1, '行首命中仍有效');
    //   ② 命中落在缩进区**内部**、未折叠 ⇒ 无效（pos !== lineStart）
    assert.equal(FP.findValidMatches('甲\n    乙', '  乙', false).length, 0, '滑进缩进区内部必须判无效');
    //   ③ 折叠模式下，哪怕落在行首也算可疑（前缀非空即无效：空白计数已不可信）
    //   ③ 折叠模式：命中落在**行首**（前缀为空）仍有效——没有歧义空间，空白计数用不上也无妨
    assert.equal(FP.findValidMatches('甲\n  乙', '  乙', true).length, 1, '折叠模式下行首命中仍有效');
    //   ③b 折叠模式 + 前缀非空（真滑进缩进区内部）⇒ 无效
    assert.equal(FP.findValidMatches('甲\n    乙', '  乙', true).length, 0, '折叠模式下滑进缩进区内部必须无效');
    //   ④ 同一候选**同时**存在于两处：一处合法、一处滑进缩进区 ⇒ 只剩 1 个有效命中
    assert.equal(FP.findValidMatches('  乙\n甲\n    乙', '  乙', false).length, 1, '无效命中要被剔除');
    // 候选不以空白开头时，缩进守卫完全不介入（行内空格是普通内容）
    assert.equal(FP.findValidMatches('甲\n    乙', '乙', false).length, 1);
    assert.doesNotThrow(() => FP.findValidMatches(null, null, true));
});

/* ══════════════ 2. applyPatch：唯一性闸门与失败一律返回原文 ══════════════ */
test('v3184f 3. applyPatch：精确优先 / 归一化回退 / 歧义拒绝 / 失败返回原文', () => {
    // 精确唯一 ⇒ exact
    const e = FP.applyPatch('甲{{T}}乙', '{{T}}', '值');
    assert.equal(e.mode, 'exact');
    assert.equal(e.text, '甲值乙');
    // 精确多处 ⇒ ambiguous（不猜）
    const a = FP.applyPatch('{{T}}甲{{T}}', '{{T}}', '值');
    assert.equal(a.ok, false);
    assert.equal(a.mode, 'ambiguous');
    assert.equal(a.text, '{{T}}甲{{T}}', '失败必须原样返回，绝不半改');
    // 全角花括号（真实用户输入形态）⇒ 归一化回退
    const f = FP.applyPatch('前文 {{PLACE}} 后文', '{{PLACE}}', '值');
    assert.equal(f.mode, 'exact', '（半角同形，先走精确；下面另测全角）');
    const full = FP.applyPatch('前文 \uff5b\uff5bPLACE\uff5d\uff5d 后文', '{{PLACE}}', '值');
    // 注意：这里内容是全角、针是半角 ⇒ 归一化把**针**映射不了内容（映射只做弯引号/破折号），
    //   故本用例期望「找不到」——这正是「本模块的宽容只覆盖真变体」的边界
    assert.equal(full.ok, false, '不做字形级模糊（只做真变体映射），找不到就不改');
    // 大小写（i 标志用在哪一层：本模块按字符映射，不做大小写折叠）——同样应拒绝
    assert.equal(FP.applyPatch('abc', 'ABC', 'x').ok, false);
    // 空针 ⇒ rejected
    assert.equal(FP.applyPatch('abc', '', 'x').mode, 'rejected');
    // 关闭回退 ⇒ 只认精确
    const off = FP.applyPatch('\u201c甲\u201d', '"甲"', 'x', { normalize: false });
    assert.equal(off.ok, false);
    assert.equal(off.mode, 'notfound');
    // 内容非 NFC ⇒ 拒绝（比源实现更严：保证除替换区间外原文逐字节不变）
    const nfc = 'e\u0301';           // e + 组合尖音符（非 NFC）
    assert.equal(FP.applyPatch(nfc, 'x', 'y').mode, 'rejected');
    assert.equal(FP.applyPatch(nfc, 'x', 'y').reason, 'content-not-nfc');
    // 不抛
    assert.doesNotThrow(() => FP.applyPatch(null, null, null));
    assert.doesNotThrow(() => FP.applyPatch(undefined, 'a', 'b', null));
});

test('v3184f 4. applyPatch：替换值不得被当替换模式（$& 不再吃原文）', () => {
    // 裸 .replace(str, val) 会把 val 里的 $& 解释成「整个匹配」——正文含 $& 就不再是正文
    const r = FP.applyPatch('前 {{T}} 后', '{{T}}', '含$&与$1的正文');
    assert.equal(r.ok, true);
    assert.equal(r.text, '前 含$&与$1的正文 后', '字面落值，不做替换模式解释');
});

test('v3184f 5. applyPatch：换行风格保持（**两条路径**都必须一致）', () => {
    // 精确路径（本轮修：此前只有归一化路径做这件事，同一份内容经两条路径会得到不同换行风格）
    const r = FP.applyPatch('甲\r\n{{T}}\r\n乙', '{{T}}', 'x\ny');
    assert.equal(r.ok, true);
    assert.ok(r.text.includes('x\r\ny'), '精确路径也要随内容转 CRLF：' + JSON.stringify(r.text));
    assert.ok(!/(^|[^\r])\n/.test(r.text), '不得留下孤立 LF（每个 \\n 前面必须紧跟 \\r）：' + JSON.stringify(r.text));
    // 归一化路径必须给出**同一风格**（两条路径一致性）
    const rn = FP.applyPatch('甲\r\n\u201c{{T}}\u201d\r\n乙', '\"{{T}}\"', 'x\ny');
    assert.equal(rn.ok, true, '弯引号命中走归一化路径');
    assert.ok(rn.text.includes('x\r\ny'), '归一化路径同样是 CRLF：' + JSON.stringify(rn.text));
    // 工具函数自身两向自证
    assert.equal(FP.matchNewlines('a\r\nb', 'x\ny'), 'x\r\ny');
    assert.equal(FP.matchNewlines('a\nb', 'x\ny'), 'x\ny');
    assert.equal(FP.matchNewlines('a\r\nb', '单行'), '单行');
    // LF 内容保持 LF
    const r2 = FP.applyPatch('甲\n{{T}}\n乙', '{{T}}', 'x\ny');
    assert.ok(r2.text.includes('x\ny'));
    assert.ok(!r2.text.includes('\r'));
});

/* ══════════════ 3. patchTokens：批量填充 + 残留扫描 ══════════════ */
test('v3184f 6. patchTokens：多处替换全部落 / 缺失上报 / 残留扫描', () => {
    // 占位符出现多次：旧 .replace 只换第一个，剩下的原样发给模型 ⇒ 现在全换且记为 exact-all:N
    const multi = FP.patchTokens('{{A}} 与 {{A}}', { A: '值' });
    assert.equal(multi.text, '值 与 值');
    assert.equal(multi.modes.A, 'exact-all:2');
    assert.deepEqual(multi.applied, ['A']);
    // 字面缺失 ⇒ 进 missed（读数里必须看得见，不得静默）
    const miss = FP.patchTokens('{{A}}', { B: '值' });
    assert.deepEqual(miss.missed, ['B(notfound-normalized)']);
    assert.equal(miss.applied.length, 0);
    // 残留扫描：填完还剩别的 {{...}} 形态 ⇒ 必须现形（用户写成了全角/单括号）
    const left = FP.patchTokens('{{A}} 还有 {{Z}} 与 {{Y}}', { A: '值' });
    assert.ok(left.leftover.includes('{{Z}}'), JSON.stringify(left.leftover));
    assert.ok(left.leftover.includes('{{Y}}'));
    // 有界：超上限时只报前 MAX 个 + 计数
    const many = FP.patchTokens('{{A}}' + '{{Z1}}{{Z2}}{{Z3}}{{Z4}}{{Z5}}{{Z6}}{{Z7}}', { A: 'v' });
    assert.equal(many.leftover.length, FP.MAX_LEFTOVER_REPORT);
    assert.ok(many.leftoverMore >= 1, '其余种类必须计数');
    // 不抛
    assert.doesNotThrow(() => FP.patchTokens(null, null));
    assert.doesNotThrow(() => FP.patchTokens('x', 'not-object'));
    assert.equal(FP.patchTokens(null, null).total, 0);
});

test('v3184f 7. line：归一化回退与残留必须可分辨', () => {
    const exactOnly = FP.line({ total: 6, applied: 6, modes: { A: 'exact', B: 'exact-all:2' } });
    const withFuzzy = FP.line({ total: 6, applied: 6, modes: { A: 'exact', B: 'normalized' } });
    assert.notEqual(exactOnly, withFuzzy, '「回退用了」与「没用」不得同形');
    assert.ok(withFuzzy.includes('归一化回退 1'), withFuzzy);
    assert.ok(exactOnly.includes('多处替换 1'), exactOnly);
    const withLeft = FP.line({ total: 2, applied: 1, modes: { A: 'exact' }, leftover: ['{{Z}}'], missed: ['B(x)'] });
    assert.ok(withLeft.includes('残留 {{Z}}'), withLeft);
    assert.ok(withLeft.includes('未填'), withLeft);
    assert.ok(FP.line({ moduleMissing: true }).includes('未加载'));
    assert.ok(FP.line({ total: 0 }).includes('无占位符'));
    assert.doesNotThrow(() => FP.line(null));
});

/* ══════════════ 4. 宿主接线自证 ══════════════ */
test('v3184f 8. 8 处占位符填充全部改走 patchTokens（字面 replace 不得残留）', () => {
    // 提取提示词 6 个（KNOWN_CHARS / HISTORY / SUSPENSE / LOCKED_FACTS / SCENES / CONTENT）
    const i = src.indexOf('const _tokens = {');
    assert.ok(i > 0, 'token 表存在');
    const seg = src.slice(i, i + 2200);   // 缺席退路实测落在 +1734 处
    for (const k of ['KNOWN_CHARS', 'HISTORY', 'SUSPENSE', 'LOCKED_FACTS', 'SCENES', 'CONTENT']) {
        assert.ok(seg.includes(k + ':'), 'token 键保真: ' + k);
    }
    assert.ok(seg.includes('_fpLib.patchTokens'), '走 patchTokens');
    // 角色提取 2 个（LORE / ROLE_COUNT）
    const j = src.indexOf('const _roleTokens = {');
    assert.ok(j > 0, 'roles token 表存在');
    const seg2 = src.slice(j, j + 1100);
    assert.ok(seg2.includes('LORE:') && seg2.includes('ROLE_COUNT:'), '角色占位符键保真');
    assert.ok(seg2.includes('_fpLibR.patchTokens'), '角色侧也走 patchTokens');
    // 模块缺席时的退路必须存在（不得整段丢功能）
    assert.ok(seg.includes('moduleMissing: true'), '缺席读数如实');
    assert.ok(seg2.includes('moduleMissing: true'), '缺席读数如实（角色侧）');
});

test('v3184f 9. 配置迁移的替换改走 applyPatch，且未命中仍记 skipped', () => {
    const i = src.indexOf('v1.4.2-summary描述');
    assert.ok(i > 0);
    const seg = src.slice(Math.max(0, i - 3000), i + 1500);
    assert.ok(seg.includes('_FP.applyPatch('), '走 applyPatch');
    assert.ok(seg.includes("_mig.skipped.push('v1.4.2-summary描述('"), '未命中落台账');
    assert.ok(seg.includes('fuzzyPatchEnabled !== false'), '开关同键名');
    assert.ok(seg.includes('literal-fallback'), '模块缺席退到原字面行为（不静默跳过整段迁移）');
});

test('v3184f 10. 诊断行真进 selfCheck + 配置键 + UI + manifest', () => {
    const sc = src.indexOf('async selfCheck(');
    const scSrc = src.slice(sc);
    const WARN = ' \u26a0\ufe0f';
    assert.ok(scSrc.includes("['提示词填充', line + (bad ? '" + WARN + "' : '')]"), 'rows 条目存在');
    assert.ok(scSrc.includes('selfCheck.promptFill'), '异常走 errLog');
    assert.ok(src.includes('_promptFillLine()'), '读数方法存在');
    assert.ok(/fuzzyPatchEnabled:\s*true/.test(src), '默认配置块声明');
    assert.ok(sui.includes("ck('fuzzyPatchEnabled'"), 'UI 有控件');
    assert.ok(mf.extra_js.includes('fuzzy-patch.js'), 'manifest 登记');
});

/* ══════════════ 5. 负控制 ══════════════ */
function loadBroken(mutate) {
    const broken = mutate(MOD_SRC);
    assert.notEqual(broken, MOD_SRC, '破坏必须真的发生');
    const saved = globalThis.LonShaFuzzyPatch;
    const tmp = ROOT + '__negctl_fp.tmp.cjs';
    require_('fs').writeFileSync(tmp, broken);
    let api;
    try {
        delete require_.cache[require_.resolve(tmp)];
        api = require_(tmp);
    } finally {
        try { require_('fs').unlinkSync(tmp); } catch (_e) { /* 清理失败不影响判定 */ }
        if (saved) { try { globalThis.LonShaFuzzyPatch = saved; } catch (_e) { /* 忽略 */ } }
    }
    return api;
}

test('v3184f N1. 唯一性闸门被拆（歧义也照改）⇒ 该组翻红', () => {
    assert.equal(FP.applyPatch('{{T}}甲{{T}}', '{{T}}', 'v').ok, false, '原版：歧义必拒');
    const B = loadBroken((s) => {
        // 破坏**计数**而不是分支：把「命中几处」永远报成 1 ⇒ 精确分支恒成立 ⇒ 静默改第一处。
        //   （只把 `if (exact > 1)` 改成 `if (false)` 是不够的：归一化探针仍会报 ambiguous，
        //     结论不变 = 破坏不可观测 = 假负控制。本轮踩到。）
        const a = "        let c = 0, i = 0;\n        while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; }\n        return c;";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "        let c = 0, i = 0;\n        while ((i = h.indexOf(n, i)) !== -1) { c++; i += n.length; }\n        return Math.min(c, 1);");
    });
    // 破坏后：多处命中被当「唯一」⇒ 静默改第一处（正是闸门要防的事）
    assert.equal(B.applyPatch('{{T}}甲{{T}}', '{{T}}', 'v').mode, 'exact', '闸门失效即静默替换');
    assert.notEqual(FP.applyPatch('{{T}}甲{{T}}', '{{T}}', 'v').mode, 'exact');
});

test('v3184f N2. 失败返回原文被拆（返回半改结果）⇒ 该组翻红', () => {
    const orig = FP.applyPatch('{{T}}甲{{T}}', '{{T}}', 'v');
    assert.equal(orig.text, '{{T}}甲{{T}}', '原版：失败返回原文');
    const B = loadBroken((s) => {
        const a = "return { ok: false, text: raw.slice(0, 1), mode: 'ambiguous', hits: exact, reason: 'ambiguous-exact:' + exact };";
        // 先在副本上把 ambiguous 分支改成返回半改文本
        const a0 = "if (exact > 1) return { ok: false, text: raw, mode: 'ambiguous', hits: exact, reason: 'ambiguous-exact:' + exact };";
        assert.equal(s.split(a0).length - 1, 1, '锚点唯一');
        return s.replace(a0, a);
    });
    const r = B.applyPatch('{{T}}甲{{T}}', '{{T}}', 'v');
    assert.notEqual(r.text, '{{T}}甲{{T}}', '破坏后返回了非原文（半改）');
    assert.equal(FP.applyPatch('{{T}}甲{{T}}', '{{T}}', 'v').text, '{{T}}甲{{T}}', '原版上同款断言为真');
});

test('v3184f N3. $& 保护被拆 ⇒ 该组翻红', () => {
    assert.equal(FP.applyPatch('前 {{T}} 后', '{{T}}', '$&').text, '前 $& 后', '原版：字面落值');
    const B = loadBroken((s) => {
        const a = "return { ok: true, mode: 'exact', hits: 1, text: raw.slice(0, i) + _v + raw.slice(i + oldRaw.length) };";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "return { ok: true, mode: 'exact', hits: 1, text: raw.slice(0, i) + raw.replace(oldRaw, newRaw) + raw.slice(i + oldRaw.length) };");
    });
    const r = B.applyPatch('前 {{T}} 后', '{{T}}', '$&');
    assert.ok(r.text.includes('前 {{T}} 后') || r.text.includes('{{T}}'), '破坏后 $& 被当替换模式：' + JSON.stringify(r.text));
    assert.equal(FP.applyPatch('前 {{T}} 后', '{{T}}', '$&').text, '前 $& 后');
});

test('v3184f N4. 多处替换只换第一处 ⇒ 该组翻红（旧 .replace 的原始缺陷）', () => {
    assert.equal(FP.patchTokens('{{A}} 与 {{A}}', { A: '值' }).text, '值 与 值');
    const B = loadBroken((s) => {
        const a = "if (n > 1) { text = text.split(tok).join(val); applied.push(key); modes[key] = 'exact-all:' + n; continue; }";
        assert.equal(s.split(a).length - 1, 1, '锚点唯一');
        return s.replace(a, "if (n > 1) { text = text.replace(tok, () => val); applied.push(key); modes[key] = 'exact'; continue; }");
    });
    assert.equal(B.patchTokens('{{A}} 与 {{A}}', { A: '值' }).text, '值 与 {{A}}', '破坏后第二处未替换');
    assert.notEqual(FP.patchTokens('{{A}} 与 {{A}}', { A: '值' }).text, '值 与 {{A}}');
});

test('v3184f N5. 残留扫描被删 ⇒ 该组翻红（静默失效必须现形）', () => {
    assert.ok(FP.patchTokens('{{A}} {{Z}}', { A: 'v' }).leftover.includes('{{Z}}'));
    const B = loadBroken((s) => {
        const a = "last_marker_unused";
        // 直接删掉整个残留扫描块（用它的唯一首行做锚点）
        const a1 = "            const re = /\\{\\{[^{}\\n]{0,40}\\}\\}/g;";
        assert.equal(s.split(a1).length - 1, 1, '锚点唯一');
        return s.replace(a1, "            const re = /(?!x)x/g;");
    });
    assert.deepEqual(B.patchTokens('{{A}} {{Z}}', { A: 'v' }).leftover, [], '破坏后残留不可见');
    assert.notEqual(FP.patchTokens('{{A}} {{Z}}', { A: 'v' }).leftover.length, 0);
});

test('v3184f N6. 破坏副本污染全局必须可还原（双向断言）', () => {
    assert.ok(goodGlobal, 'require 之后原版已自挂全局');
    const B = loadBroken((s) => s.replace('PATCH_VERSION = 1', 'PATCH_VERSION = 42'));
    assert.equal(B.PATCH_VERSION, 42);
    assert.notEqual(FP.PATCH_VERSION, 42);
    assert.equal(goodGlobal.PATCH_VERSION, 1);
});

/* ══════════════ 6. 版权纯度 ══════════════ */
test('v3184f 11. 版权纯度：出处留注释，代码体不含源实现标识符', () => {
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const body = strip(MOD_SRC);
    for (const bad of ['nocturne', 'Dataojitori', 'text_patch', 'UNESCAPED_NEWLINE_RE', 'format_normalization_preview', 'try_normalized_patch']) {
        assert.ok(!body.includes(bad), `代码体不得含 ${bad}`);
    }
    assert.ok(MOD_SRC.includes('nocturne_memory'), '注释留出处');
    assert.ok(MOD_SRC.includes('未复制其代码'), '声明未复制代码');
    assert.ok(!/\}\s*catch\s*\([^)]*\)\s*\{\s*\}/.test(MOD_SRC), '不得有空 catch');
});