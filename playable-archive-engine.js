/* ========================================================
 * playable-archive-engine.js — [M7-X9 · 第七期拓展规划] 记忆可玩档案馆（纯函数/UMD）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   新读者进入长期世界或复杂多角色企划时，传统方案往往只能塞给读者
 *   一份数万字的平铺直叙摘要，枯燥乏味且剥夺了读者推理与发现的乐趣；
 *   或者采用粗暴的游戏化积分与等级门槛，背离了叙事内容的真实价值。
 *   记忆可玩档案馆建立“多维探索路线、渐进线索解锁、事实同源视角有别与进度无损断点”机制：
 *     ① 三种探索路线同源还原(assemblePlayableArchive / getRouteNarrative)：
 *        提供侦探探案、编年史实与亲历者私密手记三种切入路线，虽视角与细节情感各有偏重，
 *        但最终均严密还原同一个核心历史事件，绝不捏造平行谎言；
 *     ② 渐进证据触发解锁(investigateClue)：未解锁的线索严格隐藏内容与谜底，
 *        仅展示模糊引子与前置线索要求，杜绝剧透泄密；
 *     ③ 追问与跳过不改变正史(askFollowUpQuestion)：读者可自由探索追问细节或跳过，
 *        一切探索互动仅记录于读者的见闻笔记中，正史底座保持纯净不可篡改；
 *     ④ 游览进度存档与重开恢复(saveProgressSnapshot / restoreReaderProgress)：
 *        支持随时中断并在重开后无损还原已见线索、视角记录与探索位点；
 *     ⑤ 底层记忆源联动标记(notifySourceMemoryChange)：当历史源记忆出现纠偏升级时，
 *        相关受影响的探索线索与路线打上 needs_update 标记，提示读者线索需重新求证。
 * ======================================================== */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaPlayableArchiveEngine = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /** 读者探索路线风格 */
    const EXPLORATION_ROUTE = Object.freeze({
        INVESTIGATOR: 'investigator',         // 现场物证与线索推理视角
        CHRONICLER: 'chronicler',             // 宏观编年史与官方记录视角
        INTIMATE_WITNESS: 'intimate_witness'  // 亲历者私人日记与隐秘情感视角
    });

    /** 线索状态 */
    const CLUE_STATUS = Object.freeze({
        LOCKED: 'locked',         // 锁定（仅见模糊外框，隐藏核心情报）
        AVAILABLE: 'available',   // 满足前置证据条件，可供调查
        UNLOCKED: 'unlocked',     // 读者已完成调查并解锁内容
        ARCHIVED: 'archived'      // 已完成解读并归入证据链
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string' && val.trim().length > 0) ? val.trim() : fallback;
    }

    function cloneDeep(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(cloneDeep);
        const copy = {};
        for (const k of Object.keys(obj)) {
            copy[k] = cloneDeep(obj[k]);
        }
        return copy;
    }

    /**
     * 构建可玩档案馆世界实体
     */
    function assemblePlayableArchive({
        archiveId,
        worldTitle,
        coreTruth, // 严正不可篡改的核心历史事件事实
        sourceMemoryRefs = []
    } = {}) {
        return {
            archiveId: safeStr(archiveId, `archive_${Date.now().toString(36)}`),
            worldTitle: safeStr(worldTitle, '未命名档案馆'),
            coreTruth: {
                factId: safeStr(coreTruth?.factId, 'fact_core'),
                statement: safeStr(coreTruth?.statement, '核心历史事实定论'),
                verifiedYear: coreTruth?.verifiedYear || 2026
            },
            sourceMemoryRefs: Array.isArray(sourceMemoryRefs) ? sourceMemoryRefs.map(r => ({
                memoryId: safeStr(r.memoryId || r),
                version: Number(r.version) || 1
            })) : [],
            clues: {},
            routes: {
                [EXPLORATION_ROUTE.INVESTIGATOR]: [],
                [EXPLORATION_ROUTE.CHRONICLER]: [],
                [EXPLORATION_ROUTE.INTIMATE_WITNESS]: []
            },
            needsUpdateRoutes: new Set(),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    /**
     * 注册线索节点
     */
    function registerClueNode(archive, {
        clueId,
        title,
        teaserHint,
        revealedContent,
        requiredClueIds = [],
        perspectives = {}, // 各路线看到的主观注记 { investigator: '...', chronicler: '...', intimate_witness: '...' }
        sourceMemoryId = null
    } = {}) {
        if (!archive || typeof archive !== 'object') throw new Error('registerClueNode: archive 无效');
        const next = cloneDeep(archive);
        next.needsUpdateRoutes = new Set(archive.needsUpdateRoutes || []);

        const cId = safeStr(clueId, `clue_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);

        next.clues[cId] = {
            clueId: cId,
            title: safeStr(title, '神秘线索'),
            teaserHint: safeStr(teaserHint, '模糊的印记与未拆封的信件'),
            revealedContent: safeStr(revealedContent, '线索详细真实档案记录'),
            requiredClueIds: Array.isArray(requiredClueIds) ? requiredClueIds.map(s => safeStr(s)) : [],
            perspectives: {
                [EXPLORATION_ROUTE.INVESTIGATOR]: safeStr(perspectives[EXPLORATION_ROUTE.INVESTIGATOR], '现场痕迹物证'),
                [EXPLORATION_ROUTE.CHRONICLER]: safeStr(perspectives[EXPLORATION_ROUTE.CHRONICLER], '官方文书档案'),
                [EXPLORATION_ROUTE.INTIMATE_WITNESS]: safeStr(perspectives[EXPLORATION_ROUTE.INTIMATE_WITNESS], '私人手记低语')
            },
            sourceMemoryId: safeStr(sourceMemoryId),
            needsUpdate: false
        };

        next.updatedAt = Date.now();
        return next;
    }

    /**
     * 将线索编排进指定路线
     */
    function assignClueToRoute(archive, routeType, clueId, sequenceIndex = 0) {
        if (!archive || !archive.routes || !archive.routes[routeType]) {
            throw new Error(`assignClueToRoute: 无效路线 ${routeType}`);
        }
        const next = cloneDeep(archive);
        next.needsUpdateRoutes = new Set(archive.needsUpdateRoutes || []);

        next.routes[routeType].push({
            clueId: safeStr(clueId),
            sequenceIndex: Number(sequenceIndex) || 0
        });
        next.routes[routeType].sort((a, b) => a.sequenceIndex - b.sequenceIndex);
        next.updatedAt = Date.now();
        return next;
    }

    /**
     * 初始化读者游览会话
     */
    function createReaderSession(archive, { readerId = 'reader_guest', chosenRoute = EXPLORATION_ROUTE.INVESTIGATOR } = {}) {
        if (!archive || !archive.routes) throw new Error('createReaderSession: archive 无效');
        const rType = archive.routes[chosenRoute] ? chosenRoute : EXPLORATION_ROUTE.INVESTIGATOR;

        return {
            sessionId: `session_${Date.now().toString(36)}`,
            archiveId: archive.archiveId,
            readerId: safeStr(readerId),
            activeRoute: rType,
            discoveredClueIds: [],
            readerNotebook: [], // 读者的自由追问与见闻批注，不改写正史
            currentStep: 0,
            hasConcludedCoreTruth: false,
            startedAt: Date.now(),
            lastActiveAt: Date.now()
        };
    }

    /**
     * 读者调查线索（支持渐进式解锁，未解锁绝对不泄漏谜底）
     */
    function investigateClue(archive, session, clueId) {
        if (!archive || !archive.clues || !session) throw new Error('investigateClue: 参数无效');
        const nextSession = cloneDeep(session);
        const targetClue = archive.clues[clueId];

        if (!targetClue) throw new Error(`investigateClue: 线索 ${clueId} 不存在`);

        // 检查前置依赖
        const discoveredSet = new Set(nextSession.discoveredClueIds);
        const missingRequirements = targetClue.requiredClueIds.filter(reqId => !discoveredSet.has(reqId));

        if (missingRequirements.length > 0) {
            // 锁定状态：严格只暴露模糊外框，绝不泄漏 revealedContent
            return {
                session: nextSession,
                clueStatus: CLUE_STATUS.LOCKED,
                revealedInfo: null,
                teaser: targetClue.teaserHint,
                unmetPrerequisites: missingRequirements,
                message: '前置证据不足，线索依然处于封存迷雾之中'
            };
        }

        // 解锁成功
        if (!discoveredSet.has(clueId)) {
            nextSession.discoveredClueIds.push(clueId);
        }
        nextSession.currentStep += 1;
        nextSession.lastActiveAt = Date.now();

        const routePerspective = targetClue.perspectives[nextSession.activeRoute] || targetClue.revealedContent;

        return {
            session: nextSession,
            clueStatus: CLUE_STATUS.UNLOCKED,
            clueTitle: targetClue.title,
            revealedContent: targetClue.revealedContent,
            routePerspectiveText: routePerspective,
            needsUpdate: Boolean(targetClue.needsUpdate)
        };
    }

    /**
     * 读者提出追问（仅留在读者笔记本，正史保持独立）
     */
    function recordReaderInquiry(session, { clueId, question, reflectionNote = '' }) {
        if (!session) throw new Error('recordReaderInquiry: session 无效');
        const next = cloneDeep(session);

        next.readerNotebook.push({
            inquiryId: `inq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            clueId: safeStr(clueId),
            question: safeStr(question),
            reflectionNote: safeStr(reflectionNote),
            timestamp: Date.now()
        });
        next.lastActiveAt = Date.now();
        return next;
    }

    /**
     * 总结核验路线所还原的核心事实（各路线视角有别，但最终均能收敛至同一事实）
     */
    function verifyCoreTruthReconstruction(archive, session) {
        if (!archive || !session) throw new Error('verifyCoreTruthReconstruction: 参数无效');
        const discovered = new Set(session.discoveredClueIds);
        const routeEntries = archive.routes[session.activeRoute] || [];

        const totalInRoute = routeEntries.length;
        const discoveredInRoute = routeEntries.filter(e => discovered.has(e.clueId)).length;

        const isFullyReconstructed = totalInRoute > 0 && discoveredInRoute === totalInRoute;

        return {
            archiveId: archive.archiveId,
            route: session.activeRoute,
            progressRatio: totalInRoute > 0 ? discoveredInRoute / totalInRoute : 0,
            isCoreTruthReconstructed: isFullyReconstructed,
            coreTruthStatement: archive.coreTruth.statement,
            uniquePerspectiveNote: `通过【${session.activeRoute}】路线成功拼合完整的证据链`,
            readerInquiriesCount: session.readerNotebook.length
        };
    }

    /**
     * 游览进度存档与断点恢复
     */
    function saveProgressSnapshot(session) {
        if (!session) throw new Error('saveProgressSnapshot: session 无效');
        return {
            snapshotId: `prog_snap_${session.sessionId}`,
            sessionState: cloneDeep(session),
            savedAt: Date.now()
        };
    }

    function restoreReaderProgress(savedSnapshot) {
        if (!savedSnapshot || !savedSnapshot.sessionState) {
            throw new Error('restoreReaderProgress: 无效存档数据');
        }
        const session = cloneDeep(savedSnapshot.sessionState);
        session.lastActiveAt = Date.now();
        session.isRestored = true;
        return session;
    }

    /**
     * 源记忆升级变更通知：标定需要更新的线索与路线
     */
    function notifySourceMemoryChange(archive, changedMemoryId) {
        if (!archive || typeof archive !== 'object') throw new Error('notifySourceMemoryChange: archive 无效');
        const next = cloneDeep(archive);
        next.needsUpdateRoutes = new Set(archive.needsUpdateRoutes || []);

        const targetId = safeStr(changedMemoryId);
        let affectedCluesCount = 0;

        for (const [cId, clue] of Object.entries(next.clues)) {
            if (clue.sourceMemoryId === targetId) {
                clue.needsUpdate = true;
                affectedCluesCount++;

                // 标记包含该线索的所有路线
                for (const [rType, rList] of Object.entries(next.routes)) {
                    if (rList.some(entry => entry.clueId === cId)) {
                        next.needsUpdateRoutes.add(rType);
                    }
                }
            }
        }

        next.updatedAt = Date.now();
        return {
            updatedArchive: next,
            affectedCluesCount,
            affectedRoutes: Array.from(next.needsUpdateRoutes)
        };
    }

    /**
     * 模块自检
     */
    function playableArchiveEngineSelfCheck() {
        const problems = [];
        try {
            // 1. 构建档案馆
            let archive = assemblePlayableArchive({
                archiveId: 'arch_old_city_secret',
                worldTitle: '旧城银杏道失踪案历史档案馆',
                coreTruth: {
                    factId: 'fact_truth_1998',
                    statement: '1998年深秋的离别并非不辞而别，而是一场保密项目的异地调动',
                    verifiedYear: 1998
                }
            });

            // 注册三枚环环相扣的线索
            archive = registerClueNode(archive, {
                clueId: 'clue_bus_ticket',
                title: '泛黄的城际长途车票',
                teaserHint: '一张盖着模糊红印的单程车票',
                revealedContent: '车票终点站为714研究所，日期为1998年10月12日',
                requiredClueIds: [], // 起始线索无依赖
                perspectives: {
                    [EXPLORATION_ROUTE.INVESTIGATOR]: '票据有折痕，背面手写了接应代码 714',
                    [EXPLORATION_ROUTE.CHRONICLER]: '1998年秋季市政运输调度表存档凭条',
                    [EXPLORATION_ROUTE.INTIMATE_WITNESS]: '她把车票藏在日记夹层，上面有未干的泪痕'
                },
                sourceMemoryId: 'mem_1998_departure'
            });

            archive = registerClueNode(archive, {
                clueId: 'clue_transfer_order',
                title: '盖有加急戳的调令副本',
                teaserHint: '铁皮文件盒中的机密公文',
                revealedContent: '国家紧急工程保密人员集中调令，要求全员签署20年缄口协议',
                requiredClueIds: ['clue_bus_ticket'], // 依赖车票
                perspectives: {
                    [EXPLORATION_ROUTE.INVESTIGATOR]: '公文印泥成分符合国防特需标准',
                    [EXPLORATION_ROUTE.CHRONICLER]: '国家绝密工程归档公函',
                    [EXPLORATION_ROUTE.INTIMATE_WITNESS]: '签下名字时，她知晓要背负二十年的负心骂名'
                },
                sourceMemoryId: 'mem_classified_project'
            });

            // 编排至三条不同路线
            archive = assignClueToRoute(archive, EXPLORATION_ROUTE.INVESTIGATOR, 'clue_bus_ticket', 1);
            archive = assignClueToRoute(archive, EXPLORATION_ROUTE.INVESTIGATOR, 'clue_transfer_order', 2);

            archive = assignClueToRoute(archive, EXPLORATION_ROUTE.CHRONICLER, 'clue_bus_ticket', 1);
            archive = assignClueToRoute(archive, EXPLORATION_ROUTE.CHRONICLER, 'clue_transfer_order', 2);

            archive = assignClueToRoute(archive, EXPLORATION_ROUTE.INTIMATE_WITNESS, 'clue_bus_ticket', 1);
            archive = assignClueToRoute(archive, EXPLORATION_ROUTE.INTIMATE_WITNESS, 'clue_transfer_order', 2);

            // 2. 模拟读者游览与锁定防剧透检查
            let session = createReaderSession(archive, {
                readerId: 'user_player',
                chosenRoute: EXPLORATION_ROUTE.INVESTIGATOR
            });

            // 在未获取第一张车票的情况下直接调查第二张调令
            const lockedCheck = investigateClue(archive, session, 'clue_transfer_order');
            if (lockedCheck.clueStatus !== CLUE_STATUS.LOCKED || lockedCheck.revealedInfo !== null) {
                problems.push('未满足前置条件时线索未能锁定，或提前泄露了档案内容');
            }

            // 按顺序解锁
            const unlock1 = investigateClue(archive, session, 'clue_bus_ticket');
            session = unlock1.session;
            const unlock2 = investigateClue(archive, session, 'clue_transfer_order');
            session = unlock2.session;

            if (unlock2.clueStatus !== CLUE_STATUS.UNLOCKED) {
                problems.push('满足前置条件后线索未能顺利解锁');
            }

            // 3. 追问记录不破坏正史
            session = recordReaderInquiry(session, {
                clueId: 'clue_transfer_order',
                question: '她临行前有没有留下一封私信？',
                reflectionNote: '推测也许在老屋砖缝中还有秘密'
            });
            if (session.readerNotebook.length !== 1 || archive.coreTruth.statement.includes('私信')) {
                problems.push('读者追问未能正常留痕或污染了正史客观事实');
            }

            // 4. 三路线均能还原同一核心事实并保留视角差异
            const reconInvestigator = verifyCoreTruthReconstruction(archive, session);
            if (!reconInvestigator.isCoreTruthReconstructed || !reconInvestigator.coreTruthStatement) {
                problems.push('调查员路线未能成功重构核心事实真相');
            }

            // 亲历者路线游览
            let witnessSession = createReaderSession(archive, { chosenRoute: EXPLORATION_ROUTE.INTIMATE_WITNESS });
            witnessSession = investigateClue(archive, witnessSession, 'clue_bus_ticket').session;
            witnessSession = investigateClue(archive, witnessSession, 'clue_transfer_order').session;
            const reconWitness = verifyCoreTruthReconstruction(archive, witnessSession);
            if (!reconWitness.isCoreTruthReconstructed || reconWitness.coreTruthStatement !== reconInvestigator.coreTruthStatement) {
                problems.push('不同路线还原的核心事实出现分歧');
            }

            // 5. 游览进度存档与恢复
            const snapshot = saveProgressSnapshot(session);
            const restored = restoreReaderProgress(snapshot);
            if (!restored.isRestored || restored.discoveredClueIds.length !== 2) {
                problems.push('游览进度保存并恢复后状态丢失');
            }

            // 6. 源记忆变更通知联动
            const notifyRes = notifySourceMemoryChange(archive, 'mem_1998_departure');
            if (notifyRes.affectedCluesCount !== 1 || !notifyRes.affectedRoutes.includes(EXPLORATION_ROUTE.INVESTIGATOR)) {
                problems.push('源记忆变更通知未能正确标定受影响路线与线索');
            }

        } catch (err) {
            problems.push(`记忆可玩档案馆自检异常: ${err && err.message ? err.message : String(err)}`);
        }

        return { problems };
    }

    return {
        EXPLORATION_ROUTE,
        CLUE_STATUS,
        assemblePlayableArchive,
        registerClueNode,
        assignClueToRoute,
        createReaderSession,
        investigateClue,
        recordReaderInquiry,
        verifyCoreTruthReconstruction,
        saveProgressSnapshot,
        restoreReaderProgress,
        notifySourceMemoryChange,
        playableArchiveEngineSelfCheck
    };
}));