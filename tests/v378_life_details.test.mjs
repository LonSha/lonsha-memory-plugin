import { readFileSync } from 'fs';
import { test } from 'node:test';
import assert from 'node:assert';
import { fileURLToPath } from 'node:url';

/* [v3.204.0] 路径去绝对化：原「本机绝对路径」字面量只在开发机上成立，
 *   任何其他 checkout 位置都必红。「仓库根」按本文件位置推导（tests/ 的上一级）。 */
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

const src = readFileSync(`${REPO_ROOT}/index.js`, 'utf-8');

test('=== 1. A: 提取 prompt 水源补全（9f/9g 规则） ===', () => {
    // 提取 prompt 要求 protagonist/life_details
    assert.ok(src.includes('9f. protagonist：'), '9f 主角档案规则');
    assert.ok(src.includes('9g. life_details：'), '9g 生活小档案规则');
    // 9f 规则要点
    assert.ok(src.includes('只填本轮【明确变化或有新信息】的字段'), '9f 克制要求');
    // 9g 规则要点（柏宝书 RULE_LIFE_DETAILS 铁律）
    assert.ok(src.includes('只认主角自己明说过、或正文明确揭示的'), '9g 铁律');
    assert.ok(src.includes('anchors'), '9g anchors 字段');
    assert.ok(src.includes('until 留空'), '9g until 说明');
});

test('=== 2. A: 提取应用区写入（水源接线） ===', () => {
    // 应用区写入 protagonist
    assert.ok(src.includes('onMessageReceived.主角档案'), '主角档案应用区');
    assert.ok(src.includes('this.status.setProtagonist(extracted.protagonist, floor, '), 'setProtagonist 写入');
    // 应用区写入 lifeDetails
    assert.ok(src.includes('extracted.life_details.slice(0, 5)'), 'life_details 批量上限 5');
    assert.ok(src.includes('this.status.addLifeDetail(ld, floor)'), 'addLifeDetail 写入');
    // 空值守卫（hasAny 检查防空对象写入）
    assert.ok(src.includes('const hasAny = keys.some(k =>'), 'hasAny 空值守卫');
    // 六字段完整
    for (const k of ['gender', 'age', 'identity', 'appearance', 'outfit', 'condition']) {
        assert.ok(src.includes(`'${k}'`), '字段: ' + k);
    }
});

test('=== 3. B: 三投放层选择算法（逻辑复刻） ===', () => {
    // 签名升级
    assert.ok(src.includes('getLifeDetailsPrompt(limit = 5, contextText = null, nowTime = null)'), '签名升级');
    assert.ok(src.includes('selectLifeDetailsForInjection 缝入'), '算法标记');
    // 逻辑复刻验证
    const select = (list, ctx, limit = 5) => {
        const PIN_CAP = Math.max(1, limit);
        const TOTAL_CAP = Math.max(2, limit + 1);
        const pinned = list.filter(d => d.tier === 'pinned').slice(0, PIN_CAP);
        const picked = [];
        for (const d of list) {
            if (d.tier === 'pinned') continue;
            if (pinned.length + picked.length >= TOTAL_CAP) break;
            const keys = [...(d.anchors || []), ...(d.topics || [])].map(s => String(s).trim()).filter(Boolean);
            const hit = keys.length
                ? (ctx ? keys.some(k => ctx.includes(k)) : d.tier === 'active')
                : d.tier === 'active';
            if (hit) picked.push(d);
        }
        return [...pinned, ...picked];
    };
    // pinned 常驻（即使上下文不命中）
    const r1 = select([
        { text: 'A', tier: 'pinned', anchors: [] },
        { text: 'B', tier: 'active', anchors: [] },          // 无关键词 → active 兜底注入
        { text: 'C', tier: 'active', anchors: ['香菜'] },    // 有关键词 → 不命中不注入
    ], '无关文本');
    assert.strictEqual(r1.length, 2, 'pinned 常驻 + active 无关键词兜底（有关键词不命中不注入）');
    assert.strictEqual(r1[0].text, 'A', 'pinned 排最前');
    assert.strictEqual(r1[1].text, 'B', '兜底注入的是无关键词条目');
    // active 有关键词需命中
    const r2 = select([
        { text: 'A', tier: 'active', anchors: ['香菜'] },
        { text: 'B', tier: 'active', anchors: ['项目'] },
    ], '她在做香菜炒蛋');
    assert.strictEqual(r2.length, 1, 'active 仅命中注入');
    assert.strictEqual(r2[0].text, 'A', '命中的是香菜条目');
    // archive 有关键词需命中、无关键词不浮出
    const r3 = select([
        { text: 'A', tier: 'archive', anchors: ['旧伤'] },
        { text: 'B', tier: 'archive', anchors: [] },
    ], '旧伤复发');
    assert.strictEqual(r3.length, 1, 'archive 无关键词不浮出');
    assert.strictEqual(r3[0].text, 'A', 'archive 命中浮出');
    // 总量封顶（limit=5 → TOTAL_CAP=6）
    const many = [];
    for (let i = 0; i < 10; i++) many.push({ text: 'T' + i, tier: 'active', anchors: [] });
    const r4 = select(many, '', 5);
    assert.strictEqual(r4.length, 6, '总量封顶 6');
    // pinned 上限
    const pins = [];
    for (let i = 0; i < 8; i++) pins.push({ text: 'P' + i, tier: 'pinned' });
    const r5 = select(pins, '', 5);
    assert.strictEqual(r5.length, 5, 'pinned 上限 5');
    // ctx 为空时：有关键词的 active 兜底（无判断依据时宁可不裁）
    const r6 = select([{ text: 'A', tier: 'active', anchors: ['香菜'] }], '', 5);
    assert.strictEqual(r6.length, 1, 'ctx 空时 active 兜底');
    // ctx 为空时：archive 有关键词仍不浮出（仅 active 兜底）
    const r7 = select([{ text: 'A', tier: 'archive', anchors: ['香菜'] }], '', 5);
    assert.strictEqual(r7.length, 0, 'ctx 空时 archive 不浮出');
});

test('=== 4. B: 时效过期判断（isExpired 逻辑复刻） ===', () => {
    // 复刻 isExpired（基于标准日历天数差）
    const isExpired = (until, now) => {
        if (!until || !now) return false;
        const pa = (s) => { const m = String(s).match(/(\d{3,4})[年/.月-](\d{1,2})[月/.日-](\d{1,2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
        const a = pa(until), b = pa(now);
        if (!a || !b) return false;
        return Math.round((a - b) / 86400000) < 0;
    };
    assert.strictEqual(isExpired('2026年3月20日', '2026年3月15日'), false, '未过期');
    assert.strictEqual(isExpired('2026年3月10日', '2026年3月15日'), true, '已过期');
    assert.strictEqual(isExpired('', '2026年3月15日'), false, '无 until 不判');
    assert.strictEqual(isExpired('霜月3日', '2026年3月15日'), false, '解析不出不判（宁可不判）');
});

test('=== 5. C: anchors/until 字段支持 ===', () => {
    assert.ok(src.includes('const anchors = Array.isArray(detail?.anchors)'), 'anchors 提取');
    assert.ok(src.includes('const until = String(detail?.until || '), 'until 提取');
    assert.ok(src.includes('...(existing.anchors || []), ...anchors'), 'anchors 合并去重');
    assert.ok(src.includes('if (until) existing.until = until;'), 'until 更新');
    // 新条目含字段
    assert.ok(src.includes('                anchors,\n                until,'), '新条目字段');
    // anchors 上限 8
    assert.ok(src.includes('.filter(Boolean).slice(0, 8)'), 'anchors 上限 8');
});

test('=== 6. 回归防护 ===', () => {
    // 三个补丁标记
    assert.ok(src.includes('[v3.78]'), 'v3.78 标记');
    // 旧调用兼容（buildInjection 里单参数调用仍可用）
    assert.ok(src.includes('getLifeDetailsPrompt?.(5)'), '旧单参调用兼容');
    // 兜底路径存在
    assert.ok(src.includes('// 兜底：旧行为（不因选择算法失败丢注入）'), '兜底路径');
});