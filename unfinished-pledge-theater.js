/* ========================================================
 * unfinished-pledge-theater.js — [M7-X7 · 第七期规划] 未完成之事的约定剧场（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   角色之间订立的承诺（约定重逢、归还旧物、继续未尽的对话）往往在传统记忆系统中
 *   要么被当成冰冷的待办事项，按现实离线时间静默超时判负；要么所有角色全知全能毫无遗忘。
 *   未完成之事的约定剧场建立“叙事性期待演进、知情遗忘差异与可交互决策”机制：
 *     ① 四类核心决断动作(PLEDGE_ACTION)：
 *        - 兑现承诺(fulfill)：履行约定，完成交代与情感闭环；
 *        - 协商改期(reschedule)：因故推迟，生成新时间线版本并保留改期缘由；
 *        - 放弃释怀(waive)：双方或单方决定不再追究，放下执念；
 *        - 违约失约(breach)：因不可逆原因背弃或错过承诺，留下长远遗憾；
 *     ② 绝对杜绝离线自动结算：未主动触发或选择前，约定始终维持未决挂起(pending)，
 *        绝不让现实生活中的时间流逝悄然破坏故事世界的承诺；
 *     ③ 知情与遗忘差异(whoRemembers / whoUnaware)：记录谁死死铭记、谁早已抛之脑后；
 *     ④ 历史改期版本可追溯：每次改期生成新版本，完整保留过往的约定节点。
 * ======================================================== */
(function (root) {
    'use strict';

    /** 约定状态 */
    const PLEDGE_STATUS = Object.freeze({
        PENDING: 'pending',           // 等待兑现中
        FULFILLED: 'fulfilled',       // 顺利履约兑现
        RESCHEDULED: 'rescheduled',   // 协商改期，开启新节点
        WAIVED: 'waived',             // 放弃追究/双方释怀
        BREACHED: 'breached'          // 违约/失约背弃
    });

    /** 约定交互动作 */
    const PLEDGE_ACTION = Object.freeze({
        FULFILL: 'fulfill',
        RESCHEDULE: 'reschedule',
        WAIVE: 'waive',
        BREACH: 'breach'
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string' && val.trim().length > 0) ? val.trim() : fallback;
    }

    function safeArr(val) {
        return Array.isArray(val) ? val : [];
    }

    /**
     * 创建未完成约定实体
     */
    function createPledge(raw = {}) {
        return {
            pledgeId: safeStr(raw.pledgeId, `pledge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`),
            title: safeStr(raw.title, '未命名约定'),
            pledgerId: safeStr(raw.pledgerId, 'char_pledger'),
            pledgerName: safeStr(raw.pledgerName, '许诺方'),
            recipientId: safeStr(raw.recipientId, 'char_recipient'),
            recipientName: safeStr(raw.recipientName, '受诺方'),
            promiseContent: safeStr(raw.promiseContent, ''),
            expectedMilestone: safeStr(raw.expectedMilestone, '待定事件节点'),
            // 谁仍然深刻记得该约定
            whoRemembers: safeArr(raw.whoRemembers).map(safeStr).filter(Boolean),
            // 谁可能已淡忘或未被告知
            whoUnawareOrForgot: safeArr(raw.whoUnawareOrForgot).map(safeStr).filter(Boolean),
            status: PLEDGE_STATUS.PENDING,
            timelineVersions: [
                {
                    version: 1,
                    milestone: safeStr(raw.expectedMilestone, '初始约定节点'),
                    note: '最初订立之约定',
                    createdAt: safeStr(raw.createdAt, new Date().toISOString())
                }
            ],
            resolutionSummary: '',
            createdAt: safeStr(raw.createdAt, new Date().toISOString()),
            resolvedAt: null
        };
    }

    /**
     * 推进约定动作（兑现、改期、释怀、违约）
     */
    function advancePledge(pledge = {}, action = PLEDGE_ACTION.FULFILL, payload = {}) {
        const p = {
            ...pledge,
            whoRemembers: safeArr(pledge.whoRemembers),
            whoUnawareOrForgot: safeArr(pledge.whoUnawareOrForgot),
            timelineVersions: safeArr(pledge.timelineVersions).map(v => ({ ...v }))
        };

        if (action === PLEDGE_ACTION.FULFILL) {
            p.status = PLEDGE_STATUS.FULFILLED;
            p.resolutionSummary = safeStr(payload.summary, '在约定的时刻，承诺得以圆满履行。');
            p.resolvedAt = new Date().toISOString();
        } else if (action === PLEDGE_ACTION.RESCHEDULE) {
            p.status = PLEDGE_STATUS.RESCHEDULED;
            const newMilestone = safeStr(payload.newMilestone, '未来某一时刻');
            const newVersion = {
                version: p.timelineVersions.length + 1,
                milestone: newMilestone,
                note: safeStr(payload.reason, '双方协商推迟'),
                createdAt: new Date().toISOString()
            };
            p.expectedMilestone = newMilestone;
            p.timelineVersions.push(newVersion);
            p.resolutionSummary = `约定改期至：${newMilestone}（原因：${newVersion.note}）`;
        } else if (action === PLEDGE_ACTION.WAIVE) {
            p.status = PLEDGE_STATUS.WAIVED;
            p.resolutionSummary = safeStr(payload.summary, '经商榷或岁月沉淀，双方决定不再强求此项约定，予以释怀。');
            p.resolvedAt = new Date().toISOString();
        } else if (action === PLEDGE_ACTION.BREACH) {
            p.status = PLEDGE_STATUS.BREACHED;
            p.resolutionSummary = safeStr(payload.summary, '因故未能赴约，失约成为无可挽回的事实。');
            p.resolvedAt = new Date().toISOString();
        }

        return p;
    }

    /**
     * 模块自检函数
     */
    function unfinishedPledgeTheaterSelfCheck() {
        const problems = [];
        try {
            let pledge = createPledge({
                pledgeId: 'pledge_test_01',
                title: '归还《海滨日记》手抄本',
                pledgerId: 'char_luojia',
                pledgerName: '珞珈',
                recipientId: 'char_shuyun',
                recipientName: '舒芸',
                promiseContent: '高考放榜后在老桥头归还手抄本',
                expectedMilestone: '高考放榜之日',
                whoRemembers: ['珞珈', '舒芸'],
                whoUnawareOrForgot: ['珞花']
            });

            if (pledge.status !== PLEDGE_STATUS.PENDING) {
                problems.push('新建约定初始状态非 pending');
            }

            // 1. 改期测试
            pledge = advancePledge(pledge, PLEDGE_ACTION.RESCHEDULE, {
                newMilestone: '大一寒假返乡时',
                reason: '放榜日双方均在省城未能碰面'
            });
            if (pledge.timelineVersions.length !== 2 || pledge.expectedMilestone !== '大一寒假返乡时') {
                problems.push('约定协商改期版本演进异常');
            }

            // 2. 兑现测试
            pledge = advancePledge(pledge, PLEDGE_ACTION.FULFILL, {
                summary: '寒假大雪初霁，两人在老桥头碰面，完好归还了手抄本。'
            });
            if (pledge.status !== PLEDGE_STATUS.FULFILLED || !pledge.resolvedAt) {
                problems.push('约定兑现状态流转异常');
            }
        } catch (err) {
            problems.push(`自检运行异常: ${err && err.message ? err.message : String(err)}`);
        }
        return { problems };
    }

    const UnfinishedPledgeTheater = Object.freeze({
        PLEDGE_STATUS,
        PLEDGE_ACTION,
        createPledge,
        advancePledge,
        unfinishedPledgeTheaterSelfCheck
    });

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = UnfinishedPledgeTheater;
    }
    root.UnfinishedPledgeTheater = UnfinishedPledgeTheater;
    root.LonShaUnfinishedPledgeTheater = UnfinishedPledgeTheater;
})(typeof globalThis !== 'undefined' ? globalThis : window);