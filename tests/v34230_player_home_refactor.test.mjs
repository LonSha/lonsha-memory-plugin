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
    const mustHave = [
        '[CORE] 记忆开关', '[RECALL] 回忆多少', '[STABILITY] 用量与保护',
        '[CHARACTER] 人物状态记录', '[CHRONO] 故事整理', '[BOUNDARY] 时间线',
        '[LEDGER] 物品记录', '[RESONANCE] 人物心声', '[WORLD] 地点记录',
        '[SUSPENSE] 伏笔追踪', '[DEVICE] 虚拟手机联动', '[DOMAIN] 分类记录',
        '[TOPOLOGY] 因果追踪', '[RERANK] 回忆排序优化', '[INTELLIGENCE] 记忆巩固',
        '[PROMPT] 提取规则模板', '[DATA] 备份与迁移', '[ADVANCED] 高级调整',
    ];
    for (const t of mustHave) assert.ok(SUI.includes(t), '新组标题在场：' + t);
    const banned = ['[CORE] 核心运转与自装载', '[RECALL] 回忆强度与注入容量', '[STABILITY] 上下文预算与保护',
        '[TOPOLOGY] 时态因果拓扑与分流', '[ADVANCED] 引擎底层机制微调', '记忆控制台与偏好', '记忆档案全貌'];
    for (const t of banned) assert.ok(!SUI.includes(t), '旧黑话标题退役：' + t);
    assert.ok(SUI.includes('◈ 常用') && SUI.includes('◷ 故事与人物') && SUI.includes('⬡ 记录与世界') && SUI.includes('⚙ 高级'),
        '四个 tab 玩家语言');
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
test('v34230 E. 六源同源抬版 3.423.0', () => {
    assert.equal(MF.version, BORN_V);
    assert.equal(JSON.parse(read('package.json')).version, BORN_V);
    assert.equal((/const VERSION = '([^']+)'/.exec(IDX) || [])[1], BORN_V);
    for (const rel of ['memory-config.js', 'memory-core.js', 'memory-organs.js']) {
        assert.match(read(rel), new RegExp("let VERSION = '" + BORN_V + "'"), rel + ' 未同源');
    }
    const cl = read('CHANGELOG.md');
    assert.ok(cl.startsWith('## v3.423.0'), 'CHANGELOG 顶节就是当版');
});

/* ---------- F. 当版锚点（版本守卫 V4 计数形态） ---------- */
test('v34230 F. 版本锚：BORN_V 就是当版（下界口径）', () => {
    assert.ok(vnum(BORN_V) <= vnum(MF.version), '自锚不得承诺未来版');
    assert.equal(vnum(BORN_V), 3423000);
    assert.ok(vnum(BORN_V) > vnum('3.422.0'), '版本序须前进');
    const idxV = (/const VERSION = '([^']+)'/.exec(IDX) || [])[1];
    assert.ok(vnum(idxV) >= vnum(BORN_V), 'index.js 版本不得低于本档出生版本');
});
