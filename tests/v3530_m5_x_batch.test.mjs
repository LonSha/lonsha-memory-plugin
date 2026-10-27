/**
 * tests/v3530_m5_x_batch.test.mjs — v3.353.0 第四包验收
 * M5-X3 群像行踪 / M5-X6 影响预览 / M5-X7 假设工作集 / M5-X9 研究集合
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
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
        fs: { readFileSync: fs.readFileSync, existsSync: () => true },
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

const require = createRequire(import.meta.url);
const SB = require('../scene-book.js');
const IP = require('../impact-preview.js');
const HW = require('../hypothesis-workspace.js');
const RC = require('../research-collection.js');

const VERSION_RE = /const\s+VERSION\s*=\s*'([^']+)'/;
const idxSrc = __hostSurface();
/* 【当版锚点】本档自锚常量 BORN_V + vnum（锚必须住在当版档案里，供版本守卫 V4 计数）。 */
const BORN_V = '3.353.0';
const vnum = (v) => Number(String(v).split('.').map((x, i) => (i === 0 ? x : x.padEnd(3, '0'))).join(''));

/* ================================================================
 * A. 版本锚
 * ================================================================ */
describe('v3.353.0 版本锚', () => {
    test('VERSION 常量不低于本档出生版本', () => {
        const m = VERSION_RE.exec(idxSrc);
        assert.ok(m, 'VERSION 常量未找到');
        assert.ok(vnum(m[1]) >= vnum(BORN_V),
            `VERSION 应 >= ${BORN_V}（本档出生版本），实际 ${m[1]}`);
    });
    test('manifest.json 版本不低于本档出生版本', () => {
        const man = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
        assert.ok(vnum(man.version) >= vnum(BORN_V),
            `manifest 版本应 >= ${BORN_V}，实际 ${man.version}`);
    });
    test('三个新模块在 manifest extra_js 中', () => {
        const man = JSON.parse(fs.readFileSync('./manifest.json', 'utf8'));
        assert.ok(man.extra_js.includes('impact-preview.js'), 'extra_js 应含 impact-preview.js');
        assert.ok(man.extra_js.includes('hypothesis-workspace.js'), 'extra_js 应含 hypothesis-workspace.js');
        assert.ok(man.extra_js.includes('research-collection.js'), 'extra_js 应含 research-collection.js');
    });
    test('自锚常量 BORN_V 恰是当版（下界口径，不锁当版）', () => {
        assert.ok(vnum(BORN_V) <= vnum('3.353.0'), '自锚不得承诺未来版');
        assert.ok(vnum(BORN_V) >= vnum('3.353.0'), '自锚不得低于本档出生版本');
    });
});

/* ================================================================
 * B. M5-X3 群像行踪与时空矛盾（scene-book.js whereaboutsOf）
 * ================================================================ */
describe('M5-X3 群像行踪', () => {
    test('whereaboutsOf 方法存在', () => {
        assert.equal(typeof SB.SceneBook.prototype.whereaboutsOf, 'function');
    });

    test('空参与者返回 no-participants', () => {
        const sb = new SB.SceneBook();
        const r = sb.whereaboutsOf([], 1, 10);
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'no-participants');
    });

    test('未登记角色标记 never-present 缺口', () => {
        const sb = new SB.SceneBook();
        const r = sb.whereaboutsOf(['张三', '李四'], 1, 10);
        assert.equal(r.ok, true);
        assert.equal(r.whereabouts.length, 2);
        assert.equal(r.whereabouts[0].known, false);
        assert.equal(r.gaps.length, 2);
        assert.equal(r.gaps[0].reason, 'never-present');
        assert.equal(r.overlaps.length, 0);
    });

    test('同楼同地 → overlaps 有记录', () => {
        const sb = new SB.SceneBook();
        // path must be an array for keyOf; keyOf joins with '/'
        sb.setPresence('张三', ['北京', '朝阳区'], 5);
        sb.setPresence('李四', ['北京', '朝阳区'], 5);
        const r = sb.whereaboutsOf(['张三', '李四'], 1, 10);
        assert.equal(r.ok, true);
        assert.equal(r.whereabouts.length, 2);
        assert.equal(r.whereabouts[0].known, true);
        assert.equal(r.whereabouts[1].known, true);
        assert.ok(r.overlaps.length >= 1, '应有至少一条碰面记录');
        assert.equal(r.overlaps[0].note, '同楼同地');
    });

    test('同楼不同地 → overlaps 有记录但 note 不同', () => {
        const sb = new SB.SceneBook();
        sb.setPresence('张三', ['北京', '朝阳区'], 5);
        sb.setPresence('李四', ['北京', '海淀区'], 5);
        const r = sb.whereaboutsOf(['张三', '李四'], 1, 10);
        assert.equal(r.ok, true);
        assert.ok(r.overlaps.length >= 1);
        assert.equal(r.overlaps[0].note, '同楼不同地');
    });

    test('不同楼 → 无 overlaps', () => {
        const sb = new SB.SceneBook();
        sb.setPresence('张三', ['北京', '朝阳区'], 3);
        sb.setPresence('李四', ['上海', '浦东区'], 5);
        const r = sb.whereaboutsOf(['张三', '李四'], 1, 10);
        assert.equal(r.ok, true);
        assert.equal(r.overlaps.length, 0);
    });

    test('楼层范围外 → outside-range 缺口', () => {
        const sb = new SB.SceneBook();
        sb.setPresence('张三', ['北京', '朝阳区'], 15);
        const r = sb.whereaboutsOf(['张三'], 1, 10);
        assert.equal(r.ok, true);
        assert.equal(r.whereabouts[0].known, false);
        assert.ok(r.gaps.some(g => g.reason === 'outside-range'));
    });
});

/* ================================================================
 * C. M5-X6 影响预览（impact-preview.js）
 * ================================================================ */
describe('M5-X6 影响预览', () => {
    test('previewImpact 对空 factId 返回 no-fact-id', () => {
        const r = IP.previewImpact({}, '', {}, {});
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'no-fact-id');
    });

    test('承诺账本含 factId → directlyAffected', () => {
        const ledgers = {
            commitments: { items: [{ id: 'c1', content: 'fact_001 会面', actor: '张三', status: 'open' }] },
            items: { records: [] }
        };
        const r = IP.previewImpact({}, 'fact_001', ledgers, { reason: '改住所', newContent: '上海' });
        assert.equal(r.ok, true);
        assert.ok(r.directlyAffected.length >= 1);
        assert.equal(r.directlyAffected[0].type, 'commitment');
        assert.equal(r.directlyAffected[0].id, 'c1');
        assert.equal(r.changedFact.newContent, '上海');
    });

    test('物品账本 ownerRef 匹配 → directlyAffected', () => {
        const ledgers = {
            commitments: { items: [] },
            items: { records: [{ id: 'i1', ownerRef: 'fact_002', actor: '李四', content: '书本' }] }
        };
        const r = IP.previewImpact({}, 'fact_002', ledgers, {});
        assert.equal(r.ok, true);
        assert.ok(r.directlyAffected.length >= 1);
        assert.equal(r.directlyAffected[0].type, 'item');
    });

    test('事实版本派生关系 → possiblyAffected', () => {
        const factState = {
            versions: {
                'fact_derived': { derivedFrom: 'fact_003', content: '派生事实' }
            }
        };
        const r = IP.previewImpact(factState, 'fact_003', { commitments: { items: [] }, items: { records: [] } }, {});
        assert.equal(r.ok, true);
        assert.ok(r.possiblyAffected.length >= 1);
        assert.equal(r.possiblyAffected[0].type, 'derived-fact');
        assert.equal(r.possiblyAffected[0].id, 'fact_derived');
    });

    test('无关事实 → 无受影响', () => {
        const ledgers = {
            commitments: { items: [{ id: 'c1', content: '其他事实', actor: '张三', status: 'open' }] },
            items: { records: [] }
        };
        const r = IP.previewImpact({}, 'fact_999', ledgers, {});
        assert.equal(r.ok, true);
        assert.equal(r.directlyAffected.length, 0);
        assert.equal(r.possiblyAffected.length, 0);
    });

    test('line() 输出可读', () => {
        const r = IP.previewImpact({}, 'fact_001', {
            commitments: { items: [{ id: 'c1', content: 'fact_001 会面', actor: '张三', status: 'open' }] },
            items: { records: [] }
        }, { newContent: '上海' });
        const line = IP.line(r);
        assert.ok(line.includes('直接受影响 1'));
    });
});

/* ================================================================
 * D. M5-X7 假设推演工作集（hypothesis-workspace.js）
 * ================================================================ */
describe('M5-X7 假设工作集', () => {
    test('createWorkspace 创建草稿工作集', () => {
        const r = HW.createWorkspace({ worksets: [] }, {
            label: '测试假设',
            assumptions: [{ factId: 'fact_001', override: '上海', reason: '改住所' }]
        });
        assert.equal(r.ok, true);
        assert.equal(r.workspace.state, 'draft');
        assert.equal(r.workspace.label, '测试假设');
        assert.equal(r.workspace.assumptions.length, 1);
        assert.equal(r.workspace.assumptions[0].override, '上海');
    });

    test('discardWorkspace 标记丢弃不删除', () => {
        const r1 = HW.createWorkspace({ worksets: [] }, { label: 'ws1' });
        const r2 = HW.discardWorkspace(r1.state, r1.workspace.id);
        assert.equal(r2.ok, true);
        // discard 后 listWorkspaces 不含它
        const list = HW.listWorkspaces(r2.state);
        assert.equal(list.length, 0);
        // 但 normalize 仍能看到它
        const normalized = HW.normalize(r2.state);
        assert.equal(normalized.worksets.length, 1);
        assert.equal(normalized.worksets[0].state, 'discarded');
    });

    test('completeWorkspace 标记完成并存结果', () => {
        const r1 = HW.createWorkspace({ worksets: [] }, { label: 'ws1' });
        const r2 = HW.completeWorkspace(r1.state, r1.workspace.id, '验证通过');
        assert.equal(r2.ok, true);
        assert.equal(r2.state.worksets[0].state, 'completed');
        assert.equal(r2.state.worksets[0].result, '验证通过');
    });

    test('容量上限 MAX_WORKSETS=8', () => {
        let state = { worksets: [] };
        for (let i = 0; i < 8; i++) {
            state = HW.createWorkspace(state, { label: 'ws' + i }).state;
        }
        const r = HW.createWorkspace(state, { label: 'overflow' });
        assert.equal(r.ok, false);
        assert.equal(r.reason, 'capacity');
    });

    test('listWorkspaces 排除 discarded', () => {
        const r1 = HW.createWorkspace({ worksets: [] }, { label: 'keep' });
        const r2 = HW.createWorkspace(r1.state, { label: 'discard_me' });
        const r3 = HW.discardWorkspace(r2.state, r2.workspace.id);
        const list = HW.listWorkspaces(r3.state);
        assert.equal(list.length, 1);
        assert.equal(list[0].label, 'keep');
    });

    test('line() 输出统计', () => {
        const r1 = HW.createWorkspace({ worksets: [] }, { label: 'ws1' });
        const line = HW.line(r1.state);
        assert.ok(line.includes('工作集 1'));
        assert.ok(line.includes('草稿 1'));
    });
});

/* ================================================================
 * E. M5-X9 研究集合（research-collection.js）
 * ================================================================ */
describe('M5-X9 研究集合', () => {
    test('createCollection 创建开放专题', () => {
        const r = RC.createCollection({ collections: [] }, {
            title: '人物A调查',
            question: 'A的真实身份',
            sources: ['src1', 'src2']
        });
        assert.equal(r.ok, true);
        assert.equal(r.collection.state, 'open');
        assert.equal(r.collection.title, '人物A调查');
        assert.equal(r.collection.sources.length, 2);
        assert.equal(r.collection.citations.length, 0);
    });

    test('addCitation 添加引用', () => {
        const r1 = RC.createCollection({ collections: [] }, { title: 'col1' });
        const r2 = RC.addCitation(r1.state, r1.collection.id, {
            source: 'src1',
            ref: '第5章第3段',
            type: 'supporting',
            character: '张三'
        });
        assert.equal(r2.ok, true);
        assert.equal(r2.citation.source, 'src1');
        assert.equal(r2.citation.type, 'supporting');
        assert.equal(r2.state.collections[0].citations.length, 1);
    });

    test('addConclusion 添加结论带 citations 引用', () => {
        const r1 = RC.createCollection({ collections: [] }, { title: 'col1' });
        const r2 = RC.addConclusion(r1.state, r1.collection.id, {
            content: 'A是B的替身',
            citations: ['src1', 'src2'],
            isPersonalOpinion: false
        });
        assert.equal(r2.ok, true);
        assert.equal(r2.conclusion.content, 'A是B的替身');
        assert.equal(r2.conclusion.citations.length, 2);
        assert.equal(r2.conclusion.isPersonalOpinion, false);
    });

    test('markReviewNeeded 移除资料后标记结论需复核', () => {
        const r1 = RC.createCollection({ collections: [] }, { title: 'col1' });
        const r2 = RC.addConclusion(r1.state, r1.collection.id, {
            content: '结论1',
            citations: ['src_removed']
        });
        const r3 = RC.markReviewNeeded(r2.state, r1.collection.id, 'src_removed');
        assert.equal(r3.ok, true);
        assert.equal(r3.marked, 1);
        assert.equal(r3.state.collections[0].conclusions[0].needsReview, true);
    });

    test('closeCollection 标记关闭', () => {
        const r1 = RC.createCollection({ collections: [] }, { title: 'col1' });
        const r2 = RC.closeCollection(r1.state, r1.collection.id);
        assert.equal(r2.ok, true);
        assert.equal(r2.state.collections[0].state, 'closed');
    });

    test('line() 输出统计', () => {
        const r1 = RC.createCollection({ collections: [] }, { title: 'col1' });
        const r2 = RC.addCitation(r1.state, r1.collection.id, { source: 's1', type: 'supporting' });
        const r3 = RC.addConclusion(r2.state, r1.collection.id, { content: '结论' });
        const line = RC.line(r3.state);
        assert.ok(line.includes('专题 1'));
        assert.ok(line.includes('引用 1'));
        assert.ok(line.includes('结论 1'));
    });
});

/* ================================================================
 * F. 宿主接线验证（index.js 源码审计）
 * ================================================================ */
describe('宿主接线', () => {
    test('三个取库口存在', () => {
        assert.ok(idxSrc.includes('_impactPreviewLib'), '应有 _impactPreviewLib 取库口');
        assert.ok(idxSrc.includes('_hypothesisWorkspaceLib'), '应有 _hypothesisWorkspaceLib 取库口');
        assert.ok(idxSrc.includes('_researchCollectionLib'), '应有 _researchCollectionLib 取库口');
    });

    test('五个宿主出口存在', () => {
        assert.ok(idxSrc.includes('queryWhereabouts'), '应有 queryWhereabouts 出口');
        assert.ok(idxSrc.includes('queryImpactPreview'), '应有 queryImpactPreview 出口');
        assert.ok(idxSrc.includes('queryHypothesisWorkspace'), '应有 queryHypothesisWorkspace 出口');
        assert.ok(idxSrc.includes('queryResearchCollection'), '应有 queryResearchCollection 出口');
    });

    test('selfCheck 面板含三个新模块', () => {
        assert.ok(idxSrc.includes("selfCheck.impactPreview"), '应有 impactPreview 体检面');
        assert.ok(idxSrc.includes("selfCheck.hypothesisWorkspace"), '应有 hypothesisWorkspace 体检面');
        assert.ok(idxSrc.includes("selfCheck.researchCollection"), '应有 researchCollection 体检面');
    });
});

/* ================================================================
 * G. 判据纯度与负控制
 * ================================================================ */
describe('判据纯度与负控制', () => {
    test('负控制：破坏 impact-preview 不影响 hypothesis-workspace', () => {
        // 两个模块互相独立：破坏一个不影响另一个
        const r1 = HW.createWorkspace({ worksets: [] }, { label: '独立性测试' });
        assert.equal(r1.ok, true);
        // impact-preview 不受 hypothesis-workspace 影响
        const r2 = IP.previewImpact({}, '', {}, {});
        assert.equal(r2.ok, false);
        assert.equal(r2.reason, 'no-fact-id');
    });

    test('负控制：research-collection 的 markReviewNeeded 不改不相关的结论', () => {
        const r1 = RC.createCollection({ collections: [] }, { title: 'col1' });
        const r2 = RC.addConclusion(r1.state, r1.collection.id, {
            content: '结论1',
            citations: ['src_keep']
        });
        const r3 = RC.addConclusion(r2.state, r1.collection.id, {
            content: '结论2',
            citations: ['src_remove']
        });
        const r4 = RC.markReviewNeeded(r3.state, r1.collection.id, 'src_remove');
        assert.equal(r4.marked, 1);
        // 只有结论2被标记，结论1不被标记
        assert.equal(r4.state.collections[0].conclusions[0].needsReview, false);
        assert.equal(r4.state.collections[0].conclusions[1].needsReview, true);
    });

    test('normalize 幂等：多次 normalize 结果稳定', () => {
        const raw = { collections: [{ title: 'col1', citations: [], conclusions: [], state: 'open' }] };
        const n1 = RC.normalize(raw);
        const n2 = RC.normalize(n1);
        assert.equal(n2.collections.length, n1.collections.length);
        assert.equal(n2.collections[0].title, n1.collections[0].title);
    });
});
