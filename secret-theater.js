/* ========================================================
 * secret-theater.js — [M8-X7 · 第八期规划] 知情边界与秘密戏剧（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   解决角色与用户之间的秘密要么完全公开、要么全锁死缺乏戏剧演化的问题：
 *     ① 四态生命周期：concealed（守秘）-> suspected（起疑）->
 *        disclosed（私下透露）-> exposed（当众暴露）；
 *     ② 显式知情角色白名单（holders）；
 *     ③ 保护性提示：不知情角色只能看到“察觉异样”的表层迹象，看不到底层机密正文；
 *     ④ 会话隔离，严格纯函数。
 * ======================================================== */
(function (root) {
    'use strict';

    const SECRET_STATES = Object.freeze({
        CONCEALED: 'concealed',
        SUSPECTED: 'suspected',
        DISCLOSED: 'disclosed',
        EXPOSED: 'exposed'
    });

    function safeStr(v) { return String(v == null ? '' : v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }

    function normalizeSecretState(raw) {
        if (!raw || typeof raw !== 'object') {
            return {
                secrets: {}, // id -> secretObj
                updatedAt: Date.now()
            };
        }
        return {
            secrets: (raw.secrets && typeof raw.secrets === 'object') ? { ...raw.secrets } : {},
            updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now()
        };
    }

    /**
     * 登记一条机密
     */
    function registerSecret(state, secretSpec, now = Date.now()) {
        const s = normalizeSecretState(state);
        const spec = (secretSpec && typeof secretSpec === 'object') ? secretSpec : {};
        const id = safeStr(spec.id) || `sec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const title = safeStr(spec.title);
        const content = safeStr(spec.content);

        if (!title || !content) {
            return { success: false, reason: 'title-and-content-required', state: s };
        }

        const initialHolders = new Set(safeArr(spec.holders).map(safeStr));
        if (spec.originator) initialHolders.add(safeStr(spec.originator));

        const secret = {
            id,
            title,
            content,
            surfaceClue: safeStr(spec.surfaceClue) || '神色似乎有些欲言又止',
            originator: safeStr(spec.originator) || 'user',
            holders: Array.from(initialHolders).filter(Boolean),
            state: SECRET_STATES.CONCEALED,
            discloseHistory: [], // [{ from, to, timestamp, pact }]
            createdAt: now,
            updatedAt: now
        };

        return {
            success: true,
            secret,
            state: {
                ...s,
                secrets: { ...s.secrets, [id]: secret },
                updatedAt: now
            }
        };
    }

    /**
     * 私下向另一名角色透露秘密
     */
    function discloseSecret(state, secretId, fromChar, toChar, pactNote = '', now = Date.now()) {
        const s = normalizeSecretState(state);
        const secId = safeStr(secretId);
        const from = safeStr(fromChar);
        const to = safeStr(toChar);
        const sec = s.secrets[secId];

        if (!sec) {
            return { success: false, reason: 'secret-not-found', state: s };
        }
        if (!sec.holders.includes(from)) {
            return { success: false, reason: 'sender-not-authorized-holder', state: s };
        }

        const updatedHolders = new Set(sec.holders);
        updatedHolders.add(to);

        const updatedSec = {
            ...sec,
            state: sec.state === SECRET_STATES.CONCEALED ? SECRET_STATES.DISCLOSED : sec.state,
            holders: Array.from(updatedHolders),
            discloseHistory: [
                ...sec.discloseHistory,
                { from, to, pactNote: safeStr(pactNote), timestamp: now }
            ],
            updatedAt: now
        };

        return {
            success: true,
            secret: updatedSec,
            state: {
                ...s,
                secrets: { ...s.secrets, [secId]: updatedSec },
                updatedAt: now
            }
        };
    }

    /**
     * 秘密当众暴露
     */
    function exposeSecret(state, secretId, occasion = '', now = Date.now()) {
        const s = normalizeSecretState(state);
        const secId = safeStr(secretId);
        const sec = s.secrets[secId];

        if (!sec) {
            return { success: false, reason: 'secret-not-found', state: s };
        }

        const updatedSec = {
            ...sec,
            state: SECRET_STATES.EXPOSED,
            exposureOccasion: safeStr(occasion),
            updatedAt: now
        };

        return {
            success: true,
            secret: updatedSec,
            state: {
                ...s,
                secrets: { ...s.secrets, [secId]: updatedSec },
                updatedAt: now
            }
        };
    }

    /**
     * 针对指定观察者生成感知投影（不知情者绝不泄露正文）
     */
    function renderSecretObservation(secret, observerCharId) {
        if (!secret || typeof secret !== 'object') return null;
        const obs = safeStr(observerCharId);
        const isKnown = secret.state === SECRET_STATES.EXPOSED || secret.holders.includes(obs);

        if (isKnown) {
            return {
                known: true,
                state: secret.state,
                title: secret.title,
                content: secret.content
            };
        }

        return {
            known: false,
            state: secret.state,
            title: '未解疑团',
            content: `【表象痕迹】${secret.surfaceClue}`
        };
    }

    function secretTheaterSelfCheck() {
        const problems = [];
        if (Object.keys(SECRET_STATES).length !== 4) problems.push('SECRET_STATES 必须恰好为 4 态');
        return Object.freeze({ problems: Object.freeze(problems) });
    }

    const api = Object.freeze({
        SECRET_STATES,
        normalizeSecretState,
        registerSecret,
        discloseSecret,
        exposeSecret,
        renderSecretObservation,
        secretTheaterSelfCheck
    });

    root.LonShaSecretTheater = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : this);