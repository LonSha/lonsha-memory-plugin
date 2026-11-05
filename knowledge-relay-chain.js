/* ============================================================
 * knowledge-relay-chain.js — [L14-X1] 消息被转告后，谁何时才知道
 * ------------------------------------------------------------
 * 消息多跳转告链：逐跳来源、得知时刻、授权范围与撤回影响。
 *
 * 【核心设计与边界约束】
 *   1. 逐跳传播与授权（Cascading Hops & Authorization）：
 *      - A告知B后，B成为合法知情者；
 *      - 仅知情者有权转告下游，未被转告的C严格不可用；
 *      - 越权转告（未得知前转告）被拒绝并如实报因（unauthorized-relay）。
 *   2. 时钟与迟到消息（Temporal Validity & Delayed News）：
 *      - 每一跳显式记录得知楼层/时间戳（floor/timestamp）；
 *      - 迟到消息绝不能穿越时间：查询楼层早于该角色获知楼层时，判定为不可用（not-yet-known）。
 *   3. 撤回不抹除历史听闻（Revocation Preserves Historical Hearing）：
 *      - 某跳被撤回后，下游角色的知情状态转为 retracted；
 *      - 撤回决不物理删除历史节点，保留完整传播轨迹与听闻审计记录。
 *   4. 公开传闻与秘密正文分离（Rumor Drift vs Secret Content）：
 *      - 秘密正文（secret）与公开漂移文案（rumorText）分列；
 *      - 秘密未经显式解密转告时，仅允许传播带漂移的传闻摘要，不泄露核心秘密正文。
 *
 * 【数据模型】
 *   - 纯函数设计，不持有全局状态；入参校验 fail-closed。
 *   - CJS / IIFE 双导出，挂载至 root.LonShaKnowledgeRelayChain。
 * ============================================================ */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaKnowledgeRelayChain = factory();
        root.KnowledgeRelayChain = root.LonShaKnowledgeRelayChain;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    const RELAY_VERSION = '1.0.0';
    const RELAY_KIND = 'knowledge_relay_chain';

    function text(val, maxLen = 120) {
        if (val == null) return '';
        const s = String(val).trim();
        return s.length > maxLen ? s.slice(0, maxLen) : s;
    }

    function num(val, fallback = 0) {
        const n = Number(val);
        return Number.isFinite(n) ? n : fallback;
    }

    /**
     * 创建转告链条根实例
     * @param {Object} rawOrigin - 初始根事实/秘密 { factId, originSpeaker, content, secret, floor }
     */
    function createRelayChain(rawOrigin = {}) {
        const factId = text(rawOrigin.factId || rawOrigin.id, 60);
        const speaker = text(rawOrigin.originSpeaker || rawOrigin.author || rawOrigin.from, 40);
        if (!factId || !speaker) {
            return {
                ok: false,
                reason: !factId ? 'fact-id-required' : 'origin-speaker-required',
                chain: null
            };
        }

        const floor = num(rawOrigin.floor, 0);
        const rootHop = {
            hopId: 'hop_root',
            from: '',
            to: speaker,
            floor: floor,
            timestamp: num(rawOrigin.timestamp, Date.now()),
            authorized: true,
            status: 'active', // active | retracted
            rumorText: text(rawOrigin.rumorText || rawOrigin.content || rawOrigin.fact, 200),
            hasSecret: Boolean(rawOrigin.secret),
            secretContent: rawOrigin.secret ? text(rawOrigin.secret, 200) : null
        };

        return {
            ok: true,
            chain: {
                version: RELAY_VERSION,
                kind: RELAY_KIND,
                factId: factId,
                originSpeaker: speaker,
                rootFloor: floor,
                hops: [rootHop],
                retractedHops: []
            }
        };
    }

    /**
     * 判定角色在特定楼层是否已得知该消息
     * @param {Object} chain - 转告链
     * @param {String} character - 目标角色
     * @param {Number} atFloor - 判定时点（楼层）
     */
    function isKnownAt(chain, character, atFloor = Infinity) {
        if (!chain || !Array.isArray(chain.hops)) {
            return { known: false, reason: 'invalid-chain', hop: null };
        }
        const who = text(character, 40);
        if (!who) return { known: false, reason: 'character-required', hop: null };
        const queryFloor = num(atFloor, Infinity);

        // 检索指向该角色的有效且楼层 <= atFloor 的 hop
        const candidateHops = chain.hops.filter(h =>
            h.to === who && h.floor <= queryFloor
        );

        if (candidateHops.length === 0) {
            // 检查是否有未来才得知的 hop（迟到消息不可穿越时间）
            const futureHop = chain.hops.find(h => h.to === who && h.floor > queryFloor);
            if (futureHop) {
                return { known: false, reason: 'not-yet-known-at-floor', floor: futureHop.floor };
            }
            return { known: false, reason: 'uninformed', hop: null };
        }

        // 选出最近的一条有效 hop
        const latestHop = candidateHops[candidateHops.length - 1];
        if (latestHop.status === 'retracted') {
            return { known: false, reason: 'retracted', hop: latestHop };
        }

        return {
            known: true,
            reason: 'active-hop',
            floor: latestHop.floor,
            hop: latestHop,
            canAccessSecret: Boolean(latestHop.secretContent)
        };
    }

    /**
     * 创建单跳转告草案并追加至链条
     * @param {Object} chain - 当前转告链
     * @param {Object} draft - 转告草案 { from, to, floor, rumorText, passSecret, timestamp }
     */
    function appendRelayHop(chain, draft = {}) {
        if (!chain || !Array.isArray(chain.hops)) {
            return { ok: false, reason: 'invalid-chain' };
        }
        const from = text(draft.from, 40);
        const to = text(draft.to, 40);
        const floor = num(draft.floor, chain.rootFloor || 0);

        if (!from || !to) {
            return { ok: false, reason: 'from-and-to-required' };
        }
        if (from === to) {
            return { ok: false, reason: 'self-relay-prohibited' };
        }

        // 校验传播者授权状态：from 角色在当前 floor 必须已得知
        const senderStatus = isKnownAt(chain, from, floor);
        if (!senderStatus.known) {
            return {
                ok: false,
                reason: 'unauthorized-relay',
                senderReason: senderStatus.reason
            };
        }

        const passSecret = Boolean(draft.passSecret && senderStatus.canAccessSecret);
        const secretContent = passSecret ? senderStatus.hop.secretContent : null;

        const newHopId = 'hop_' + (chain.hops.length + 1);
        const newHop = {
            hopId: newHopId,
            from: from,
            to: to,
            floor: floor,
            timestamp: num(draft.timestamp, Date.now()),
            authorized: true,
            status: 'active',
            rumorText: text(draft.rumorText || senderStatus.hop.rumorText, 200),
            hasSecret: passSecret,
            secretContent: secretContent
        };

        const updatedHops = chain.hops.concat([newHop]);
        return {
            ok: true,
            hopId: newHopId,
            chain: Object.assign({}, chain, { hops: updatedHops })
        };
    }

    /**
     * 撤回特定跳转（级联使该跳影响的下游转为 retracted，但保留听闻历史）
     * @param {Object} chain - 当前转告链
     * @param {String} hopId - 要撤回的跳ID
     */
    function retractHop(chain, hopId) {
        if (!chain || !Array.isArray(chain.hops)) {
            return { ok: false, reason: 'invalid-chain' };
        }
        const targetId = text(hopId, 40);
        const targetIdx = chain.hops.findIndex(h => h.hopId === targetId);
        if (targetIdx === -1) {
            return { ok: false, reason: 'hop-not-found' };
        }

        const targetHop = chain.hops[targetIdx];
        if (targetHop.hopId === 'hop_root') {
            return { ok: false, reason: 'cannot-retract-root' };
        }

        // 收集受影响的下游节点列表（依赖于该跳传导的后续 hops）
        const affectedCharacters = new Set([targetHop.to]);
        const nextHops = chain.hops.map(h => {
            if (h.hopId === targetId || (h.from && affectedCharacters.has(h.from))) {
                affectedCharacters.add(h.to);
                return Object.assign({}, h, {
                    status: 'retracted',
                    retractedAt: Date.now()
                });
            }
            return h;
        });

        return {
            ok: true,
            retractedCount: affectedCharacters.size,
            affectedCharacters: Array.from(affectedCharacters),
            chain: Object.assign({}, chain, { hops: nextHops })
        };
    }

    /**
     * 自检函数
     */
    function knowledgeRelaySelfCheck() {
        const rootRes = createRelayChain({ factId: 'f1', originSpeaker: 'Alice', content: '发现旧遗迹' });
        if (!rootRes.ok) return { ok: false, reason: 'selfcheck-root-fail' };
        const hop1 = appendRelayHop(rootRes.chain, { from: 'Alice', to: 'Bob', floor: 1 });
        if (!hop1.ok) return { ok: false, reason: 'selfcheck-hop-fail' };
        const bKnown = isKnownAt(hop1.chain, 'Bob', 1);
        if (!bKnown.known) return { ok: false, reason: 'selfcheck-known-fail' };
        return { ok: true, version: RELAY_VERSION };
    }

    return {
        RELAY_VERSION: RELAY_VERSION,
        RELAY_KIND: RELAY_KIND,
        createRelayChain: createRelayChain,
        isKnownAt: isKnownAt,
        appendRelayHop: appendRelayHop,
        retractHop: retractHop,
        knowledgeRelaySelfCheck: knowledgeRelaySelfCheck
    };
}));
