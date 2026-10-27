// tests/v3139_identity_contract.test.mjs
// [v3.139] stbme CP-L3: 身份单通道收口 + 快照冻结键契约守卫
// 验证：① 去重指纹身份收编 getCurrentChatId 单一真源（私有通道废除）
//      ② ARCHIVE_TOP_LEVEL_KEYS 冻结契约存在且键集 == collectExport 实际导出键集
//      ③ storage.save 写侧契约卫兵接线
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
/* [v3.421.0] 宿主面合并读：index.js 的方法已大批外提到 engine-*.js / memory-core.js，
 *   入口只剩一行委派。只读入口的测试因此两重受害 ——
 *   ① 方法体根本不在入口里（断言找不到）；
 *   ② 抠出来的片段没有闭包作用域（_moduleLib / errLog …）→ ReferenceError。
 *   改读 hostSurface 的合并面（v3160/v3161/v3163 同一机制）。变量名与下游断言一字不改。
 *   顺序：入口在前、模块在后 —— 版本常量这类「以入口为准」的断言必须先命中入口；
 *   而入口里的单行委派体一律先剥掉，否则抽取助手取首次命中会抠到委派（只剩一句委托）。 */
import { hostSurface as __hostSurfaceRaw } from './_audit_lib.mjs';
import __hostPath from 'node:path';
import { fileURLToPath as __hostFu } from 'node:url';
/* 写成函数声明而不是 const 箭头：读取语句常落在文件前几行，而 import 段可能在它下面。
 *   声明提升是唯一与语句顺序无关的写法（const 会撞 TDZ，实测 4 档因此新红）。 */
function __hostSurface() {
    const __root = __hostFu(new URL('..', import.meta.url));
    const __face = __hostSurfaceRaw(__root, {
        fs: { readFileSync: readFileSync, existsSync: () => true },
        path: __hostPath,
    });
    /* 单行委派形如 `foo(a) { const M = _moduleLib(...); return M ? ... ; }` —— 从正文里**移走**。
     *   两行以上的委派很少，且那种形态抽取助手本来就抠不全，留给模块面兜。
     *   [v3.421.0] 但**不能丢弃**：一批「宿主出口各恰一处」的判据问的就是这些委派桩本身
     *   （`foo(...args) {` 只存在于入口的委派行里，模块面是 `function foo(engine, ...)`）。
     *   故剥下来的行收集到扫描面**最末**：抽取助手仍先命中模块面的真实现（委派在尾部），
     *   而字符串在场判据照旧命中。丢弃会让那批判据整片假红。 */
    const __deleg = [];
    const __squeeze = (raw) => raw.split(String.fromCharCode(10))
        .filter((ln) => {
            const __isDeleg = /^[ \t]*[_a-zA-Z$][\w$]*[ \t]*\(.*\)[ \t]*\{.*_moduleLib\(.*\}[ \t]*$/.test(ln);
            if (__isDeleg) __deleg.push(ln);
            return !__isDeleg;
        })
        .join(String.fromCharCode(10));
    return __face.files.map((f) => __squeeze(f.raw)).join(String.fromCharCode(10))
        + String.fromCharCode(10) + '// ==== 剥下的单行委派（入口原文，供「出口在场」判据） ====' + String.fromCharCode(10)
        + __deleg.join(String.fromCharCode(10));
}
const src = __hostSurface();
/* [v3.264.0 A1 第五刀] StorageManager 已外移 memory-organs.js：写侧契约卫兵（违约告警）随类过去；
 *   契约清单/Set 索引仍在宿主（它们是宿主级常量，模块内置的是供类内引用的逐字副本）。 */
const orgSrc = readFileSync(new URL('../memory-organs.js', import.meta.url), 'utf8');
const face = src + String.fromCharCode(10) + orgSrc;

test('v3.139 身份单通道：去重指纹身份走 getCurrentChatId', () => {
    assert.ok(!src.includes('ctxCc?.characterId'), '私有身份通道已废除');
    assert.ok(!src.includes("ctxCc?.chatId"), 'ctxCc 通道已收编');
    assert.match(src, /const chatIdCc = window\.LonShaMemory\?\.engine\?\.getCurrentChatId\?\.\(\) \|\| '';/, '去重身份走单一真源');
});

test('v3.139 冻结键契约：清单冻结 + Set 索引 + 写侧卫兵', () => {
    assert.match(src, /const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[/, '契约清单 Object.freeze');
    assert.match(src, /const ARCHIVE_TOP_LEVEL_KEY_SET = new Set\(ARCHIVE_TOP_LEVEL_KEYS\)/, 'Set 索引');
    assert.match(face, /存档顶层键契约违约/, 'storage.save 写侧告警（[v3.264.0] 随 StorageManager 外移）');
    assert.match(face, /ARCHIVE_TOP_LEVEL_KEY_SET\.has\(_k\)/, '卫兵查 Set（[v3.264.0] 随 StorageManager 外移）');
});

test('v3.139 契约键集 == collectExport 实际导出键集（双向）', () => {
    const ceStart = src.indexOf('collectExport() {');
    const ceEnd = src.indexOf('getCurrentChatId() {', ceStart);
    const ceBlock = src.slice(ceStart, ceEnd);
    const exported = new Set([...ceBlock.matchAll(/^\s{16}(\w+):/gm)].map(m => m[1]));
    assert.ok(exported.size >= 40, `导出键数量异常: ${exported.size}`);
    const contractMatch = /const ARCHIVE_TOP_LEVEL_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/.exec(src);
    assert.ok(contractMatch, '契约清单存在');
    const declared = new Set([...contractMatch[1].matchAll(/'(\w+)'/g)].map(m => m[1]));
    for (const k of exported) assert.ok(declared.has(k), `契约缺导出键: ${k}（新增顶层键必须同步契约清单）`);
    for (const k of declared) assert.ok(exported.has(k), `契约多出不存在键: ${k}（契约与实现漂移）`);
    assert.equal(declared.size, exported.size, '键集大小一致');
});
