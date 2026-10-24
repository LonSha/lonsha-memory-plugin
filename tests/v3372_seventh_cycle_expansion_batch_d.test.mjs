// tests/v3372_seventh_cycle_expansion_batch_d.test.mjs — [LonSha记忆插件 · 第七期拓展批次 D]
import test from 'node:test';
import assert from 'node:assert/strict';
import CuratedExhibitionBench from '../curated-exhibition-bench.js';
import MemoryInspirationDesk from '../memory-inspiration-desk.js';
import PlayableArchiveEngine from '../playable-archive-engine.js';

test('LonSha · 第七期拓展批次 D · M7-X3 记忆主题策展', async (t) => {
    await t.test('自检零异常', () => {
        const res = CuratedExhibitionBench.curatedExhibitionBenchSelfCheck();
        assert.deepEqual(res.problems, []);
    });

    await t.test('三条浏览路线提供不同证据顺序，反例可见，源记忆修订标记复核', () => {
        let exhibition = CuratedExhibitionBench.createExhibition({
            exhibitionId: 'ex_courage_path',
            themeTitle: '从畏缩到挺身而出：心路展'
        });

        exhibition = CuratedExhibitionBench.addExhibitItem(exhibition, {
            itemId: 'item_fear_start',
            title: '少年时的躲闪目光',
            nature: CuratedExhibitionBench.ITEM_NATURE.CORE_EVIDENCE,
            sourceMemoryRef: { memoryId: 'mem_childhood_bully', timestamp: 1000, version: 1 },
            isAuthorized: true,
            routePlacements: {
                [CuratedExhibitionBench.EXHIBITION_ROUTE.CHRONOLOGICAL]: 1,
                [CuratedExhibitionBench.EXHIBITION_ROUTE.THEMATIC_GROWTH]: 1
            }
        });

        exhibition = CuratedExhibitionBench.addExhibitItem(exhibition, {
            itemId: 'item_hesitation_retreat',
            title: '关键时刻的犹豫与退缩',
            nature: CuratedExhibitionBench.ITEM_NATURE.COUNTER_EVIDENCE,
            counterAssertion: '显现勇气并非一蹴而就，曾出现严重的逃避动摇',
            sourceMemoryRef: { memoryId: 'mem_panic_retreat', timestamp: 2000, version: 1 },
            isAuthorized: true,
            routePlacements: {
                [CuratedExhibitionBench.EXHIBITION_ROUTE.CHRONOLOGICAL]: 2,
                [CuratedExhibitionBench.EXHIBITION_ROUTE.CRITICAL_DOUBTS]: 1
            }
        });

        // 路线呈现
        const chrono = CuratedExhibitionBench.getRouteTour(exhibition, CuratedExhibitionBench.EXHIBITION_ROUTE.CHRONOLOGICAL);
        const doubts = CuratedExhibitionBench.getRouteTour(exhibition, CuratedExhibitionBench.EXHIBITION_ROUTE.CRITICAL_DOUBTS);

        assert.equal(chrono.totalItems, 2);
        assert.equal(doubts.totalItems, 1);
        assert.equal(doubts.hasCounterEvidence, true);

        // 源记忆升级联动
        const rev = CuratedExhibitionBench.markSourceRevisions(exhibition, 'mem_childhood_bully', 2);
        assert.equal(rev.flaggedCount, 1);
        assert.equal(rev.updatedExhibition.items[0].requiresRecheck, true);
    });

    await t.test('观众追问留痕且不改写原记忆，导出只包含已授权材料', () => {
        let exhibition = CuratedExhibitionBench.createExhibition({
            exhibitionId: 'ex_secret_archive',
            themeTitle: '隐秘调查展'
        });

        exhibition = CuratedExhibitionBench.addExhibitItem(exhibition, {
            itemId: 'item_public_doc',
            title: '公开通告',
            isAuthorized: true
        });

        exhibition = CuratedExhibitionBench.addExhibitItem(exhibition, {
            itemId: 'item_private_diary',
            title: '私人未授权笔记',
            isAuthorized: false
        });

        // 追问
        const inqRes = CuratedExhibitionBench.inquireExhibitItem(exhibition, {
            itemId: 'item_public_doc',
            question: '通告颁布的真实时间？'
        });
        assert.equal(inqRes.updatedExhibition.inquiries.length, 1);

        // 授权过滤导出
        const catalog = CuratedExhibitionBench.exportAuthorizedCatalog(exhibition, { onlyAuthorized: true });
        assert.equal(catalog.totalExportedItems, 1);
        assert.equal(catalog.items[0].itemId, 'item_public_doc');
        assert.equal(catalog.filteredOutUnauthenticatedCount, 1);
    });
});

test('LonSha · 第七期拓展批次 D · M7-X6 记忆驱动创作灵感桌', async (t) => {
    await t.test('自检零异常', () => {
        const res = MemoryInspirationDesk.memoryInspirationDeskSelfCheck();
        assert.deepEqual(res.problems, []);
    });

    await t.test('同一事件生成三种创作方向且不改写事实，支持抽象化脱敏', () => {
        let state = MemoryInspirationDesk.createInspirationDeskState({ deskId: 'desk_author' });
        const memoryItem = {
            id: 'mem_old_clock_tower',
            theme: '时间与不可逆的承诺',
            conflict: '两人相约在老钟楼重逢，但钟楼在重逢前夕被拆除',
            imagery: ['停止的巨大铜制指针', '拆迁施工红漆字'],
            unresolvedQuestion: '他是否在瓦砾堆里找到过那封留言？'
        };

        const gen = MemoryInspirationDesk.generateCreativeSeeds(state, memoryItem);
        state = gen.updatedState;
        assert.equal(gen.seeds.length, 3);

        // 事实未被篡改
        assert.equal(memoryItem.theme, '时间与不可逆的承诺');

        // 抽象化与视角反转
        const seedToAbstract = gen.seeds[0];
        const abstracted = MemoryInspirationDesk.abstractAndDeidentify(seedToAbstract, {
            maskRealEntities: true,
            swapPerspectives: true,
            stripSourceReference: true,
            symbolicSetting: '架空的雾港机械城'
        });

        assert.equal(abstracted.isAbstracted, true);
        assert.equal(abstracted.sourceDetached, true);
        assert.equal(abstracted.sourceMemoryId, null);
        assert.equal(abstracted.fictionalEntities.setting, '架空的雾港机械城');
        assert.equal(abstracted.fictionalEntities.characters[0].name.startsWith('角色_'), true);
    });

    await t.test('撤回源记忆授权后禁止后续生成并打上失效标记', () => {
        let state = MemoryInspirationDesk.createInspirationDeskState();
        const mem = {
            id: 'mem_private_cross',
            theme: '秘密羁绊',
            conflict: '隐忍',
            imagery: ['红线'],
            unresolvedQuestion: '未来如何'
        };

        const gen = MemoryInspirationDesk.generateCreativeSeeds(state, mem);
        state = gen.updatedState;

        // 撤回授权
        const rev = MemoryInspirationDesk.revokeSourceAuthorization(state, 'mem_private_cross');
        state = rev.updatedState;
        assert.equal(rev.affectedSeedsCount, 3);
        assert.equal(state.seeds[0].isSourceRevoked, true);

        // 再次生成应被拦截抛出异常
        assert.throws(() => {
            MemoryInspirationDesk.generateCreativeSeeds(state, mem);
        }, /已被撤回授权/);
    });
});

test('LonSha · 第七期拓展批次 D · M7-X9 记忆可玩档案馆', async (t) => {
    await t.test('自检零异常', () => {
        const res = PlayableArchiveEngine.playableArchiveEngineSelfCheck();
        assert.deepEqual(res.problems, []);
    });

    await t.test('三路线还原同一核心事实、未解锁线索严密隐藏、重开恢复进度', () => {
        let archive = PlayableArchiveEngine.assemblePlayableArchive({
            archiveId: 'arch_bridge_story',
            worldTitle: '断桥风云录',
            coreTruth: {
                factId: 'fact_bridge_1945',
                statement: '当年断桥并非遭炸毁，而是为了保护下游村庄泄洪主动开启了水闸'
            }
        });

        archive = PlayableArchiveEngine.registerClueNode(archive, {
            clueId: 'clue_sluice_key',
            title: '老旧铜水闸摇杆钥匙',
            teaserHint: '刻着编号的水利重工钥匙',
            revealedContent: '该钥匙曾在洪水当夜由巡查员亲自签名领用',
            requiredClueIds: [],
            perspectives: {
                [PlayableArchiveEngine.EXPLORATION_ROUTE.INVESTIGATOR]: '钥匙齿痕有严重受力扭曲，证明当夜强行手摇开闸',
                [PlayableArchiveEngine.EXPLORATION_ROUTE.CHRONICLER]: '防汛指挥部领用登记簿第七行红笔记录',
                [PlayableArchiveEngine.EXPLORATION_ROUTE.INTIMATE_WITNESS]: '祖父湿透的棉袄口袋里只留下了这枚钥匙'
            },
            sourceMemoryId: 'mem_flood_1945'
        });

        archive = PlayableArchiveEngine.registerClueNode(archive, {
            clueId: 'clue_flood_log',
            title: '防汛日志残卷',
            teaserHint: '浸水发霉的硬皮本',
            revealedContent: '日志末页写明：下游三千村民已转移，启动开闸保堤',
            requiredClueIds: ['clue_sluice_key'],
            perspectives: {
                [PlayableArchiveEngine.EXPLORATION_ROUTE.INVESTIGATOR]: '字迹因雨水晕染但笔锋苍劲果决',
                [PlayableArchiveEngine.EXPLORATION_ROUTE.CHRONICLER]: '官方解密民政档案卷宗第 402 号',
                [PlayableArchiveEngine.EXPLORATION_ROUTE.INTIMATE_WITNESS]: '他在那一页留下了给家人的诀别便条'
            },
            sourceMemoryId: 'mem_flood_log'
        });

        // 编排至调查员线与亲历者线
        archive = PlayableArchiveEngine.assignClueToRoute(archive, PlayableArchiveEngine.EXPLORATION_ROUTE.INVESTIGATOR, 'clue_sluice_key', 1);
        archive = PlayableArchiveEngine.assignClueToRoute(archive, PlayableArchiveEngine.EXPLORATION_ROUTE.INVESTIGATOR, 'clue_flood_log', 2);

        archive = PlayableArchiveEngine.assignClueToRoute(archive, PlayableArchiveEngine.EXPLORATION_ROUTE.INTIMATE_WITNESS, 'clue_sluice_key', 1);
        archive = PlayableArchiveEngine.assignClueToRoute(archive, PlayableArchiveEngine.EXPLORATION_ROUTE.INTIMATE_WITNESS, 'clue_flood_log', 2);

        // 读者调查体验
        let session = PlayableArchiveEngine.createReaderSession(archive, {
            chosenRoute: PlayableArchiveEngine.EXPLORATION_ROUTE.INVESTIGATOR
        });

        // 未集齐前置尝试调查第二枚线索：应锁定并隐藏情报
        const locked = PlayableArchiveEngine.investigateClue(archive, session, 'clue_flood_log');
        assert.equal(locked.clueStatus, PlayableArchiveEngine.CLUE_STATUS.LOCKED);
        assert.equal(locked.revealedInfo, null);

        // 正常按序解锁
        session = PlayableArchiveEngine.investigateClue(archive, session, 'clue_sluice_key').session;
        session = PlayableArchiveEngine.investigateClue(archive, session, 'clue_flood_log').session;

        const truthRecon = PlayableArchiveEngine.verifyCoreTruthReconstruction(archive, session);
        assert.equal(truthRecon.isCoreTruthReconstructed, true);
        assert.equal(truthRecon.coreTruthStatement.includes('为了保护下游村庄泄洪'), true);

        // 进度快照与恢复
        const snap = PlayableArchiveEngine.saveProgressSnapshot(session);
        const restored = PlayableArchiveEngine.restoreReaderProgress(snap);
        assert.equal(restored.discoveredClueIds.length, 2);
        assert.equal(restored.isRestored, true);

        // 事实源变化联动通知
        const notify = PlayableArchiveEngine.notifySourceMemoryChange(archive, 'mem_flood_1945');
        assert.equal(notify.affectedCluesCount, 1);
        assert.equal(notify.affectedRoutes.includes(PlayableArchiveEngine.EXPLORATION_ROUTE.INVESTIGATOR), true);
    });
});