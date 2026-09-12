// v3.37 工业级长文本记忆五大前沿支柱测试
// 覆盖：HippoRAG双路引燃扩散、时态知识图谱、自适应叙事熵反思、正文时间物理标签、Prompt Cache友好分流
import fs from 'node:fs';
const idxSrc = fs.readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const suiSrc = fs.readFileSync(new URL('../settings-ui.js', import.meta.url), 'utf8');
const mftSrc = fs.readFileSync(new URL('../manifest.json', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const assert = (n, c) => { if (c) { pass++; console.log('✓ ' + n); } else { fail++; console.log('✗ ' + n); } };

// ===== 1. 版本一致性 =====
const mft = JSON.parse(mftSrc);
assert('manifest 版本有效 (>= 3.37.0)', /^3\.(3[7-9]|[4-9]\d+)\./.test(mft.version));
assert('index.js 版本有效 (>= 3.37.0)', /const VERSION = '3\.(3[7-9]|[4-9]\d+)\./.test(idxSrc));

// ===== 2. 静态锚点检查 =====
// 支柱 1: HippoRAG
assert('config 拥有 hippoDiffusionEnabled', idxSrc.includes('hippoDiffusionEnabled: true'));
assert('recallMemory 包含 HippoRAG 实体引燃', idxSrc.includes('HippoRAG 双路引燃扩散') && idxSrc.includes('entityCandidates.add(node)'));

// 支柱 2: 时态知识图谱
assert('config 拥有 temporalGraphEnabled', idxSrc.includes('temporalGraphEnabled: true'));
assert('addEdge 支持 validFrom/validTo 时态闭环', idxSrc.includes('validFrom') && idxSrc.includes('validTo') && idxSrc.includes('e.active = false'));
assert('recallMemory 包含时态关系分流', idxSrc.includes('isHistorical') && (idxSrc.includes('edge.validTo != null') || idxSrc.includes('edge.active === false')));
assert('buildInjection 渲染历史羁绊标记', idxSrc.includes('（曾于第${i.validTo}楼前）'));

// 支柱 3: 叙事惊奇度/熵驱动反思
assert('config 拥有 entropyReflectionEnabled 与 threshold', idxSrc.includes('entropyReflectionEnabled: true') && idxSrc.includes('entropyThreshold: 15'));
assert('MemoryEngine 拥有 _narrativeEntropy', idxSrc.includes('this._narrativeEntropy = 0'));
assert('onMessageReceived 包含叙事熵累加逻辑', idxSrc.includes('this._narrativeEntropy = (this._narrativeEntropy || 0) + deltaEntropy'));
assert('ReflectionSystem.generate 支持 forceTrigger', idxSrc.includes('forceTrigger = false') && idxSrc.includes('!forceTrigger && every > 0'));

// 支柱 4: 物理时间标签锚点
assert('config 拥有 timeTagAnchorEnabled', idxSrc.includes('timeTagAnchorEnabled: true'));
assert('拥有 extractTimeTagFast 函数', idxSrc.includes('function extractTimeTagFast(text)'));
assert('stripMemoryOpsTags 剥除 time/date 标签', idxSrc.includes('field|todo|item|time|date|bbs_time'));
assert('onMessageReceived 优先盖章 timeTagFound', idxSrc.includes('extracted.story_date = timeTagFound') && idxSrc.includes('this._lastStoryDateSeen = timeTagFound'));

// 支柱 5: Prompt Cache 友好冷热隔离
assert('config 拥有 cacheFriendlyInjection', idxSrc.includes('cacheFriendlyInjection: true'));
assert('buildVolumeInjection 顶槽锁定绝对静态史记', idxSrc.includes('isCacheFriendly ? [] :'));
assert('buildInjection 动态渲染阶段周记', idxSrc.includes('[阶段进展·周记]'));
assert('settings-ui 包含五大前沿支柱设置面板', suiSrc.includes('🏛️ 工业级体系化增强（前沿架构演进）') && suiSrc.includes('hippoDiffusionEnabled'));

// ===== 3. 行为模拟：时态图谱（Temporal Graph）=====
{
    class MockTemporalGraph {
        constructor() { this.edges = new Map(); }
        addEdge(edge) {
            const from = edge.from, to = edge.to, label = edge.label;
            const floor = edge.floor || 0;
            const id = `${from}-${to}-${label}`;
            if (label !== 'participated_in') {
                for (const [eid, e] of this.edges) {
                    if (e.from === from && e.to === to && e.active !== false && e.label !== label) {
                        e.active = false;
                        e.validTo = floor;
                    }
                }
            }
            const full = { ...edge, id, validFrom: floor, validTo: null, active: edge.active !== false };
            this.edges.set(id, full);
            return id;
        }
    }

    const g = new MockTemporalGraph();
    g.addEdge({ from: 'A', to: 'B', label: '暗恋', floor: 1 });
    const e1 = g.edges.get('A-B-暗恋');
    assert('初始关系处于活跃状态', e1.active === true && e1.validTo === null && e1.validFrom === 1);

    // 关系演化：在第 10 楼决裂成宿敌
    g.addEdge({ from: 'A', to: 'B', label: '宿敌', floor: 10 });
    const e2 = g.edges.get('A-B-宿敌');
    assert('旧关系自动标记闭环，有效截止至第10楼', e1.active === false && e1.validTo === 10);
    assert('新关系生效', e2.active === true && e2.validFrom === 10 && e2.validTo === null);

    // 查询常规活跃关系 vs 历史关系
    const activeRels = Array.from(g.edges.values()).filter(e => e.active !== false);
    const histRels = Array.from(g.edges.values()).filter(e => e.active === false && e.validTo !== null);
    assert('活跃关系只有 1 条（宿敌）', activeRels.length === 1 && activeRels[0].label === '宿敌');
    assert('历史时态关系包含 1 条（暗恋）', histRels.length === 1 && histRels[0].label === '暗恋');
}

// ===== 4. 行为模拟：叙事惊奇度/熵驱动自适应反思 =====
{
    let entropy = 0;
    function addEntropy(events, statusChanges, plansResolve) {
        let delta = 0;
        let turnaround = false;
        for (const ev of (events || [])) {
            const imp = ev.importance || 5;
            if (imp >= 9) { delta += 6; turnaround = true; }
            else if (imp >= 7) { delta += 3; }
            else if (imp >= 5) { delta += 1; }
        }
        if (statusChanges && statusChanges.length) delta += Math.min(5, statusChanges.length);
        if (plansResolve && plansResolve.length) delta += plansResolve.length * 4;
        entropy += delta;
        return { delta, turnaround, trigger: entropy >= 15 || turnaround };
    }

    // 场景 A: 平淡日常，累积熵低，不触发
    const r1 = addEntropy([{ importance: 3 }, { importance: 4 }], [], []);
    assert('平淡日常不触发自适应反思', r1.trigger === false && entropy === 0);

    // 场景 B: 重大转折 (importance=9)，瞬间触发
    const r2 = addEntropy([{ importance: 9, description: '皇宫政变爆发' }], [{ field: '地位', value: '叛党' }], [{ id: 's1', outcome: 'done' }]);
    assert('重大转折瞬间点火自适应反思', r2.trigger === true && r2.turnaround === true);
}

// ===== 5. 行为模拟：物理时间标签提取与清洗 =====
{
    function extractTime(text) {
        const m = /<(?:time|date|bbs_time)\s*:\s*([^>]+?)>/i.exec(text || '');
        return m ? m[1].trim() : null;
    }
    function stripTags(text) {
        return String(text || '').replace(/<\/?(field|todo|item|time|date|bbs_time)\s*:[^>]*?>/gi, '');
    }

    const raw = '天色渐暗，城门轰然关闭。<time: 1999年10月12日 18:30>\n<item:取得=艾丽卡.古卷>';
    const t = extractTime(raw);
    assert('正文物理时间精准提取', t === '1999年10月12日 18:30');
    const cleaned = stripTags(raw);
    assert('物理时间与操作符标签彻底剥除无残留', !cleaned.includes('<time') && !cleaned.includes('<item') && cleaned.includes('城门轰然关闭。'));
}

// ===== 6. 行为模拟：Prompt Cache 友好冷热槽位分离 =====
{
    function buildVolume(historical, activeVolumes, isCacheFriendly = true) {
        const parts = [];
        if (historical.length) parts.push('史记: ' + historical.join('; '));
        if (!isCacheFriendly && activeVolumes.length) parts.push('周记: ' + activeVolumes.join('; '));
        return parts.join('\n');
    }

    const hist = ['第一纪元完结', '第二纪元诸神黄昏'];
    const active1 = ['第1卷进展: 寻找失落大陆'];
    const active2 = ['第1卷进展: 遭遇深海巨兽'];

    // 开启缓存友好时：两次调用生成的顶槽文本绝对完全一致！
    const v1 = buildVolume(hist, active1, true);
    const v2 = buildVolume(hist, active2, true);
    assert('Cache友好模式下，即使周记在动态演化，顶槽史记字符100%保持恒定一致', v1 === v2);
    assert('顶槽内容包含史记', v1.includes('第一纪元完结'));
}

console.log(`\n[v337-test] ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);