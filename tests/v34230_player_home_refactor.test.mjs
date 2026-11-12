/* ============================================================
 * tests/v34230_player_home_refactor.test.mjs — v3.423.0
 * 玩家面板重构：FAB 直达玩家主页 + 设置全面去黑话（三件事原则）
 *
 * 【背景】用户对重构的三次定性：
 *   ① 玩家只关心三件事——记忆能力在跑吗 / 这里有谁 / 过去发生了什么；
 *   ② 引擎名等开发者黑话不得出现在玩家路径上；
 *   ③ 对标柏宝书 / shujuku / HCDIARY 的「面板少而准」。
 *
 * 【当版锚点】本档自锚常量 BORN_V + vnum（锚住在当版档案里，供版本守卫 V4 计数）。
 * ============================================================ */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const SUI = read('settings-ui.js');
const IDX = read('index.js');
const MF = JSON.parse(read('manifest.json'));
const BORN_V = '3.423.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/* ---------- A. 玩家主页：FAB 直达，旧七项菜单退役 ---------- */
test('v34230 A. 玩家主页落地且旧菜单退役', () => {
    assert.ok(SUI.includes('plugin.showPlayerHome = function'), '主页函数必须定义');
    assert.ok(SUI.includes('ls-home-status'), '运行状态卡');
    assert.ok(SUI.includes('ls-home-event'), '最近发生的事');
    assert.ok(SUI.includes('ls-home-chip'), '登场人物 chips');
    assert.ok(SUI.includes('ls-home-actions'), '三入口动作区');
    assert.ok(SUI.includes("data-home-act=\"timeline\""), '时间线入口在主页动作区');
    assert.ok(SUI.includes("data-home-jump"), '人物/故事跳转区');
    /* 旧菜单退役：FAB 不再弹 7 项菜单（样式类与分派全消失） */
    assert.ok(!SUI.includes('lonsha-fab-menu'), '旧 FAB 菜单样式类退役');
    /* 转发形态：showFabMenu 只剩转发到主页 */
    const fwd = SUI.slice(SUI.indexOf('plugin.showFabMenu'));
    assert.ok(/showFabMenu[\s\S]{0,300}?showPlayerHome\(\)/.test(fwd), 'FAB 点击直达玩家主页');
});

/* ---------- B. API 前置到「常用」页顶部 ---------- */
test('v34230 B. AI 接口连接前置 + Embedding 三键在场', () => {
    assert.ok(SUI.includes('🔗 AI 接口连接'), 'API 组新标题在场');
    assert.ok(!SUI.includes('[API] 专用接口配置'), '旧 API 组标题退役');
    const apiIdx = SUI.indexOf('🔗 AI 接口连接');
    const genTab = SUI.indexOf('data-tab-pane="general"');
    assert.ok(apiIdx > 0 && genTab > 0 && genTab < apiIdx && apiIdx - genTab < 12000,
        'API 组在 general tab 首屏附近（前置，不再埋在 retrieval）');
    for (const k of ['apiUrl', 'apiKey', 'apiModel', 'embeddingUrl', 'embeddingKey', 'embeddingModel']) {
        assert.ok(SUI.includes('data-cfg-text="' + k + '"'), 'API 组控件在场：' + k);
    }
    assert.ok(SUI.includes('ls-fetch-models') && SUI.includes('ls-model-status'), '模型抓取与状态行在场');
});

/* ---------- C. 去黑话：18 组标题 + tab + 面板标题 ---------- */
test('v34230 C. 组标题全面玩家语言', () => {
    /* [v3.459.0 · 判据重述] 原文是「点名 18 个具体标题字符串 + 四个旧 tab 文案」，属**硬锁当版文案**：
     *   v3.459.0 按玩家动线把分组改成 emoji 白话（🔗 AI 接口连接 / 🔘 基础开关 / 💾 备份与迁移 …），
     *   旧 tab 也从 `◈ 常用|◷ 故事与人物|⬡ 记录与世界|⚙ 高级` 换成
     *   `🚀 开始使用|📖 人物与故事|🔧 进阶设置|🧪 高级实验室`。
     *   逐字点名于是全片假红，翻红的信息量只剩「文案换了」——与 v3264 C / v3266 C 同一族坑。
     *   交棒**不弱化**，改锚到「去黑话」这条判据的**实质**，两向都判：
     *   ① 反向：旧黑话标题与旧 tab 文案必须**不在场**（这条是原文真意，一条不删）；
     *   ② 正向（结构性）：每个 `ls-group-title` 都必须**含中文**——纯英文/纯方括号标签/纯符号标题
     *      正是「开发者黑话回到玩家路径」的形态，这条比点名更强（覆盖全部组，不止 18 个）；
     *   ③ 正向（语义面）：四个 tab 必须覆盖玩家三件事（记忆在跑 / 这里有谁 / 过去发生什么）+ 高级面。 */
    const banned = ['[CORE] 核心运转与自装载', '[RECALL] 回忆强度与注入容量', '[STABILITY] 上下文预算与保护',
        '[TOPOLOGY] 时态因果拓扑与分流', '[ADVANCED] 引擎底层机制微调', '记忆控制台与偏好', '记忆档案全貌'];
    for (const t of banned) assert.ok(!SUI.includes(t), '旧黑话标题退役：' + t);
    // ① 旧 tab 文案整批退役（不允许「新旧并存」的过渡态长期留着）
    for (const t of ['◈ 常用', '◷ 故事与人物', '⬡ 记录与世界', '⚙ 高级']) {
        assert.ok(!SUI.includes('>' + t + '<'), '旧 tab 文案退役：' + t);
    }
    // ② 每个**静态**组标题都必须含中文（结构性禁黑话）。
    //    模板字面量标题（`📓 ${esc(name)}` / `'\n + b.cls + ...'` 这类拼接）不在此判：
    //    它们的中文来自运行时变量，静态扫描看不见，强行点名只会让判据自己假红。
    const titles = [...SUI.matchAll(/class="ls-group-title"[^>]*>([^<]*)/g)]
        .map((m) => m[1].trim())
        .filter((t) => t && !/[$`'\n]/.test(t));
    assert.ok(titles.length >= 20, '静态组标题样本量足够（实测 ' + titles.length + '）');
    const noHan = titles.filter((t) => !/[\u4e00-\u9fa5]/.test(t));
    assert.deepStrictEqual(noHan, [], '静态组标题必须含中文白话（实测黑话残留：' + JSON.stringify(noHan) + '）');
    // ③ 四个 tab 覆盖玩家三件事 + 高级面
    /* ★ v3.465.2 修正：这条原本把四个 tab 文案**逐字**写死成
     *   ['开始使用','人物与故事','进阶设置','高级实验室']，与本条自述的
     *   「交棒不弱化，改锚到实质、不硬锁当版文案」直接矛盾 ——
     *   于是 `9a6e158` 把「进阶设置」换成更贴玩家的「备份与调校」时，它又红了。
     *   那次改名是对的（玩家要知道这一页是干嘛，不是「进阶」两个字），
     *   所以修的是判据，不是产品。按③自己的原话实现：
     *   四个 tab 必须各自覆盖「上手」「人物与故事」「存档与调校」「高级」四个面，
     *   **面必须在，措辞不锁**；另加：必须恰好四个、不许黑话回流。 */
    const tabRows = [...SUI.matchAll(/data-tab="([a-z]+)">([^<]+)</g)].map((m) => ({ key: m[1], label: m[2].trim() }));
    assert.strictEqual(tabRows.length, 4, '必须恰好四个 tab（实测 ' + JSON.stringify(tabRows.map(r => r.label)) + '）');
    assert.deepStrictEqual(tabRows.map(r => r.key), ['general', 'narrative', 'retrieval', 'advanced'],
        '四个 tab 的 data-tab 键序固定（键是结构契约，不随文案改）');
    /* 每个 tab 各有自己的语义面：按 key 绑面，不按文案绑 */
    const FACE = {
        general: /开始|上手|基础|快速/,
        narrative: /人物|角色|故事/,
        retrieval: /备份|调校|设置|存档|迁移/,
        advanced: /高级|实验|进阶/,
    };
    for (const r of tabRows) {
        assert.ok(FACE[r.key].test(r.label),
            'tab ' + r.key + ' 必须覆盖它的语义面（' + FACE[r.key].source + '），实测 ' + r.label);
        /* 去黑话：不允许纯英文/方括号技术名回流到 tab 上 */
        assert.ok(!/^[\[A-Za-z0-9 _\-\]]+$/.test(r.label), 'tab 不得是纯英文/方括号黑话：' + r.label);
        assert.ok(/[\u4e00-\u9fa5]/.test(r.label), 'tab 必须含中文：' + r.label);
    }
    assert.ok(SUI.includes("'⚙ 设置'"), '设置面板标题翻新');
    assert.ok(SUI.includes("'📖 记忆总览'"), '总览面板标题翻新');
});

/* ---------- D. 上一轮两缺陷的修复不因重构丢失 ---------- */
test('v34230 D. pill 接真实配置 + token 作用域化仍在', () => {
    assert.ok(SUI.includes('data-profile="balanced"'), 'pill 接 data-profile');
    assert.ok(SUI.includes("select[data-cfg-text=\"extractionProfile\"]"), 'pill 点击同步档位下拉');
    /* token 作用域化：容器选择器上就地重声明（宿主 :root 改写无法穿透）。
     *   [v3.423.0] 多行选择器形态：.lonsha-overlay / .ls-toast / #lonsha-memory-fab 各占一行。 */
    const tokIdx = SUI.indexOf('#lonsha-memory-fab {');
    const scoped = SUI.slice(SUI.lastIndexOf('.lonsha-overlay', tokIdx), tokIdx + 2000);
    assert.ok(scoped.includes('--ls-accent:'), 'token 就地重声明在容器选择器上');
});

/* ---------- E. 四源 + 三副本同源（六面抬版） ---------- */
test('v34230 E. 六源同源（各自 >= 出生版本 3.423.0）', () => {
    /* [v3.424.0 交棒] 原文是 `assert.equal(..., BORN_V)` ——【硬锁当版】。本档出生于 v3.423.0，
     *   那一刀六源真的都是 3.423.0；但跨版后它会变红，翻红的信息量只剩「数字不一样」。
     *   与 v3264 C / v3266 C 踩过的是同一族坑。交棒**不弱化**：仍要求六源**互相同源**（这才是原判据的实质），
     *   且都不得低于本档出生版本。当版锚点交给当版自己的档案（版本守卫 V4 只数 frontier）。 */
    const six = [
        MF.version,
        JSON.parse(read('package.json')).version,
        (/const VERSION = '([^']+)'/.exec(IDX) || [])[1],
    ];
    for (const rel of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        six.push((/let VERSION = '([^']+)'/.exec(read(rel)) || [])[1]);
    }
    assert.deepStrictEqual(six, six.map(() => six[0]), '六源必须同源，实测 ' + JSON.stringify(six));
    for (const v of six) {
        assert.ok(vnum(v) >= vnum(BORN_V), '六源不得低于本档出生版本 ' + BORN_V + '（实测 ' + v + '）');
    }
    const cl = read('CHANGELOG.md');
    const clv = (/^## v([0-9.]+)/.exec(cl) || [])[1];
    assert.ok(clv, 'CHANGELOG 顶节必须是某一版的实节');
    assert.ok(vnum(clv) >= vnum(BORN_V), 'CHANGELOG 顶节不得低于出生版本');
});

/* ---------- F. 当版锚点（版本守卫 V4 计数形态） ---------- */
test('v34230 F. 版本锚：BORN_V 就是当版（下界口径）', () => {
    assert.ok(vnum(BORN_V) <= vnum(MF.version), '自锚不得承诺未来版');
    assert.equal(vnum(BORN_V), 3423000);
    assert.ok(vnum(BORN_V) > vnum('3.422.0'), '版本序须前进');
    const idxV = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN_V), 'index.js 版本不得低于本档出生版本');
});
