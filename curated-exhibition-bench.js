/* ========================================================
 * curated-exhibition-bench.js — [M7-X3 · 第七期拓展规划] 记忆主题策展（纯函数/UMD）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   用户想把“某角色如何学会信任”等深层心路编成可浏览、可追问的主题展览，
 *   传统系统往往只能堆砌一篇数千字的死板摘要，或者将证据扁平罗列。
 *   记忆主题策展建立“多叙事路线、反例对立呈现、源记忆演进挂钩与授权有界导出”机制：
 *     ① 多路线主题编排(assembleExhibition)：支持按时间线、心路转变与批判反思等
 *        至少 3 条不同叙事路线提供不同证据呈现顺序；
 *     ② 反例显式可见(counterEvidenceItems)：展览不搞一言堂，必须保留反面例证、
 *        动摇瞬间与怀疑时刻，展现立体复杂性；
 *     ③ 源记忆修订复核联动(markRevisionsForRecheck)：底层记忆发生修订或纠偏时，
 *        引用该源记忆的展项自动标记为 requires_recheck，杜绝基于过时信息充当定论；
 *     ④ 互动追问留痕(inquireExhibitItem)：观众可就展品证据提出追问并获取对应引文链，
 *        展览行为绝不反向改写原始记忆；
 *     ⑤ 严格受控导出(exportAuthorizedCatalog)：导出时严格依据授权许可范围过滤，
 *        未经授权的私密或限制展项绝不随包流出。
 * ======================================================== */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaCuratedExhibitionBench = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    /** 展览路线类型 */
    const EXHIBITION_ROUTE = Object.freeze({
        CHRONOLOGICAL: 'chronological',       // 编年编排线
        THEMATIC_GROWTH: 'thematic_growth',   // 主题心路蜕变线
        CRITICAL_DOUBTS: 'critical_doubts'    // 质疑、波折与反思线
    });

    /** 展项属性类别 */
    const ITEM_NATURE = Object.freeze({
        CORE_EVIDENCE: 'core_evidence',       // 核心正面支撑证据
        CORROBORATING: 'corroborating',       // 物件/旁证
        COUNTER_EVIDENCE: 'counter_evidence', // 反例/质疑/倒退时刻
        TESTIMONY: 'testimony'                // 关键人物口述证词
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
     * 创建主题展览
     */
    function createExhibition({
        exhibitionId,
        themeTitle,
        curator = 'system',
        curatorialStatement = '',
        authorizedScope = 'public'
    } = {}) {
        return {
            exhibitionId: safeStr(exhibitionId, `exhibit_${Date.now().toString(36)}`),
            themeTitle: safeStr(themeTitle, '记忆主题微展'),
            curator: safeStr(curator),
            curatorialStatement: safeStr(curatorialStatement),
            authorizedScope: safeStr(authorizedScope, 'public'),
            halls: [],
            items: [],
            routes: {
                [EXHIBITION_ROUTE.CHRONOLOGICAL]: [],
                [EXHIBITION_ROUTE.THEMATIC_GROWTH]: [],
                [EXHIBITION_ROUTE.CRITICAL_DOUBTS]: []
            },
            inquiries: [],
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
    }

    /**
     * 向展览编入展项
     */
    function addExhibitItem(exhibition, {
        itemId,
        title,
        nature = ITEM_NATURE.CORE_EVIDENCE,
        sourceMemoryRef, // { memoryId, timestamp, version }
        narrativeSnippet = '',
        counterAssertion = '',
        isAuthorized = true,
        routePlacements = {} // { chronological: 1, thematic_growth: 3, ... }
    } = {}) {
        if (!exhibition || typeof exhibition !== 'object') {
            throw new Error('addExhibitItem: exhibition 对象无效');
        }
        const next = cloneDeep(exhibition);
        const id = safeStr(itemId, `item_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`);

        const item = {
            itemId: id,
            title: safeStr(title, '无题展项'),
            nature,
            sourceMemoryRef: sourceMemoryRef ? {
                memoryId: safeStr(sourceMemoryRef.memoryId),
                timestamp: Number(sourceMemoryRef.timestamp) || Date.now(),
                version: Number(sourceMemoryRef.version) || 1
            } : null,
            narrativeSnippet: safeStr(narrativeSnippet),
            counterAssertion: safeStr(counterAssertion),
            isAuthorized: Boolean(isAuthorized),
            requiresRecheck: false,
            recheckReason: '',
            createdAt: Date.now()
        };

        next.items.push(item);

        // 编排至各叙事路线
        for (const [routeType, order] of Object.entries(routePlacements)) {
            if (next.routes[routeType] && Number.isFinite(order)) {
                next.routes[routeType].push({
                    itemId: id,
                    order: Number(order)
                });
                next.routes[routeType].sort((a, b) => a.order - b.order);
            }
        }

        next.updatedAt = Date.now();
        return next;
    }

    /**
     * 获取指定路线的导览展项序列
     */
    function getRouteTour(exhibition, routeType) {
        if (!exhibition || !exhibition.routes || !exhibition.routes[routeType]) {
            throw new Error(`getRouteTour: 路线 ${routeType} 不存在`);
        }
        const itemMap = new Map(exhibition.items.map(it => [it.itemId, it]));
        const ordered = exhibition.routes[routeType].map(entry => {
            const it = itemMap.get(entry.itemId);
            return it ? { ...it, sequenceOrder: entry.order } : null;
        }).filter(Boolean);

        return {
            routeType,
            totalItems: ordered.length,
            hasCounterEvidence: ordered.some(it => it.nature === ITEM_NATURE.COUNTER_EVIDENCE),
            tourItems: ordered
        };
    }

    /**
     * 响应源记忆更新：将引用陈旧版本的展项标记为需复核
     */
    function markSourceRevisions(exhibition, updatedMemoryId, newVersion) {
        if (!exhibition || typeof exhibition !== 'object') throw new Error('markSourceRevisions: 无效 exhibition');
        const next = cloneDeep(exhibition);
        const targetMemId = safeStr(updatedMemoryId);

        let flaggedCount = 0;
        for (const it of next.items) {
            if (it.sourceMemoryRef && it.sourceMemoryRef.memoryId === targetMemId) {
                if (it.sourceMemoryRef.version < newVersion) {
                    it.requiresRecheck = true;
                    it.recheckReason = `底座源记忆已升级至 v${newVersion}，展项内容仍基于旧版，需策展人复核`;
                    flaggedCount++;
                }
            }
        }

        next.updatedAt = Date.now();
        return {
            updatedExhibition: next,
            flaggedCount
        };
    }

    /**
     * 观众针对展品提出追问（只留痕记录，绝不覆写原记忆）
     */
    function inquireExhibitItem(exhibition, { itemId, audienceId = 'visitor', question = '' } = {}) {
        if (!exhibition || typeof exhibition !== 'object') throw new Error('inquireExhibitItem: 无效 exhibition');
        const next = cloneDeep(exhibition);
        const target = next.items.find(it => it.itemId === itemId);
        if (!target) throw new Error(`inquireExhibitItem: 展项 ${itemId} 不存在`);

        const inquiry = {
            inquiryId: `inq_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            itemId,
            audienceId: safeStr(audienceId),
            question: safeStr(question),
            targetSourceRef: target.sourceMemoryRef ? { ...target.sourceMemoryRef } : null,
            responseDigest: `围绕《${target.title}》的证据说明：该项引证自真实存档，不因追问改变事实`,
            timestamp: Date.now()
        };

        next.inquiries.push(inquiry);
        next.updatedAt = Date.now();
        return {
            updatedExhibition: next,
            inquiry
        };
    }

    /**
     * 导出策展展目包（支持严格授权范围过滤）
     */
    function exportAuthorizedCatalog(exhibition, { onlyAuthorized = true } = {}) {
        if (!exhibition || typeof exhibition !== 'object') throw new Error('exportAuthorizedCatalog: 无效 exhibition');

        const exportableItems = exhibition.items.filter(it => {
            if (onlyAuthorized && !it.isAuthorized) return false;
            return true;
        });

        const exportableIdSet = new Set(exportableItems.map(it => it.itemId));

        // 仅导出过滤后合规路线
        const filteredRoutes = {};
        for (const [rKey, rList] of Object.entries(exhibition.routes)) {
            filteredRoutes[rKey] = rList.filter(entry => exportableIdSet.has(entry.itemId));
        }

        return {
            exhibitionId: exhibition.exhibitionId,
            themeTitle: exhibition.themeTitle,
            curatorialStatement: exhibition.curatorialStatement,
            exportedAt: Date.now(),
            totalExportedItems: exportableItems.length,
            filteredOutUnauthenticatedCount: exhibition.items.length - exportableItems.length,
            items: exportableItems.map(it => ({
                itemId: it.itemId,
                title: it.title,
                nature: it.nature,
                snippet: it.narrativeSnippet,
                counterAssertion: it.counterAssertion,
                requiresRecheck: it.requiresRecheck,
                sourceReferenceId: it.sourceMemoryRef?.memoryId || null
            })),
            routes: filteredRoutes
        };
    }

    /**
     * 模块自检
     */
    function curatedExhibitionBenchSelfCheck() {
        const problems = [];
        try {
            let exhibit = createExhibition({
                exhibitionId: 'ex_trust_evolution',
                themeTitle: '从防备到交付：珞珈的信任萌生史',
                curatorialStatement: '透视角色在多次冲突与照面中建立防备又逐步松动的历程'
            });

            // 编入 3 个展项，包含正面证据与明确反例
            exhibit = addExhibitItem(exhibit, {
                itemId: 'item_initial_guard',
                title: '初遇时的紧闭房门与冷言冷语',
                nature: ITEM_NATURE.CORE_EVIDENCE,
                sourceMemoryRef: { memoryId: 'mem_first_meet', timestamp: 1000, version: 1 },
                narrativeSnippet: '始终手握钥匙反锁，回答字数不过五字',
                isAuthorized: true,
                routePlacements: {
                    [EXHIBITION_ROUTE.CHRONOLOGICAL]: 1,
                    [EXHIBITION_ROUTE.THEMATIC_GROWTH]: 1,
                    [EXHIBITION_ROUTE.CRITICAL_DOUBTS]: 1
                }
            });

            exhibit = addExhibitItem(exhibit, {
                itemId: 'item_relapse_doubt',
                title: '深夜抽屉失物带来的信任倒退危机',
                nature: ITEM_NATURE.COUNTER_EVIDENCE,
                sourceMemoryRef: { memoryId: 'mem_theft_suspicion', timestamp: 2000, version: 1 },
                narrativeSnippet: '再次出现言语刺探，怀疑前置',
                counterAssertion: '显现信任并非单调上升，曾一度濒临崩解',
                isAuthorized: true,
                routePlacements: {
                    [EXHIBITION_ROUTE.CHRONOLOGICAL]: 2,
                    [EXHIBITION_ROUTE.THEMATIC_GROWTH]: 3,
                    [EXHIBITION_ROUTE.CRITICAL_DOUBTS]: 2
                }
            });

            exhibit = addExhibitItem(exhibit, {
                itemId: 'item_confidential_letter',
                title: '未寄出的私人日记残页',
                nature: ITEM_NATURE.TESTIMONY,
                sourceMemoryRef: { memoryId: 'mem_secret_diary', timestamp: 3000, version: 1 },
                narrativeSnippet: '写满对自身轻信的苛责',
                isAuthorized: false, // 未获授权公开
                routePlacements: {
                    [EXHIBITION_ROUTE.CHRONOLOGICAL]: 3,
                    [EXHIBITION_ROUTE.CRITICAL_DOUBTS]: 3
                }
            });

            // 1. 验证三条路线能提供不同证据顺序，且反例可见
            const chronoTour = getRouteTour(exhibit, EXHIBITION_ROUTE.CHRONOLOGICAL);
            const growthTour = getRouteTour(exhibit, EXHIBITION_ROUTE.THEMATIC_GROWTH);
            const doubtsTour = getRouteTour(exhibit, EXHIBITION_ROUTE.CRITICAL_DOUBTS);

            if (chronoTour.totalItems !== 3 || growthTour.totalItems !== 2 || doubtsTour.totalItems !== 3) {
                problems.push('不同导览路线条目数编排不符合预期');
            }
            if (!doubtsTour.hasCounterEvidence || !chronoTour.hasCounterEvidence) {
                problems.push('反例未能按要求在对应路线中保持可见');
            }

            // 2. 验证源记忆修订联动复核
            const revRes = markSourceRevisions(exhibit, 'mem_first_meet', 2);
            if (revRes.flaggedCount !== 1) {
                problems.push('源记忆版本演进后未正确标记需复核');
            }
            const updatedItem = revRes.updatedExhibition.items.find(i => i.itemId === 'item_initial_guard');
            if (!updatedItem.requiresRecheck) {
                problems.push('展项 requiresRecheck 标志未置位');
            }

            // 3. 验证追问留痕且不改写原记忆
            const inqRes = inquireExhibitItem(exhibit, {
                itemId: 'item_relapse_doubt',
                question: '这场危机最后是如何解除的？'
            });
            if (inqRes.updatedExhibition.inquiries.length !== 1) {
                problems.push('观众追问未能正确留痕');
            }

            // 4. 验证严格授权导出
            const catalog = exportAuthorizedCatalog(exhibit, { onlyAuthorized: true });
            if (catalog.totalExportedItems !== 2 || catalog.filteredOutUnauthenticatedCount !== 1) {
                problems.push('导出目录未能完全过滤未授权展项');
            }
            if (catalog.items.some(i => i.itemId === 'item_confidential_letter')) {
                problems.push('未授权展项泄露至公开导出目录中');
            }

        } catch (err) {
            problems.push(`记忆主题策展自检抛出异常: ${err && err.message ? err.message : String(err)}`);
        }

        return { problems };
    }

    return {
        EXHIBITION_ROUTE,
        ITEM_NATURE,
        createExhibition,
        addExhibitItem,
        getRouteTour,
        markSourceRevisions,
        inquireExhibitItem,
        exportAuthorizedCatalog,
        curatedExhibitionBenchSelfCheck
    };
}));
