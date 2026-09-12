/* ========================================================
 * memory-supersede.js — 记忆矛盾换代模块
 * 移植自 Paramecium「原文是唯一真相」/ RubyPhone supersede-engine (MIT)
 *
 * 纯规则零 LLM:
 *   - 词面 similarity 闸门 (2-gram overlap + 短句单字补全)
 *   - 主题锚点反义立场词表冲突检测 (奶茶/住所/饮食/工作/宠物/情感)
 *   - 新记忆分量足且高置信冲突 → 旧条目标记 superseded 退出召回
 *   - 压制方消失/被换代 → 旧条自动复活 (链式换代)
 *
 * 挂 window.LonShaSupersede, 供 index.js 使用。
 * ======================================================== */
'use strict';
(function() {
class SupersedeManager {
    constructor() {
        this.supersededMap = {};   // supersededKey -> { byKey, at, content }
        this.config = {
            enabled: true,
            simGate: 0.10,          // 话题相似度闸门
            bias: 1.0,              // 新重要性 ≥ 旧×bias 才可压过
            scanPool: 30            // 每次扫描池大小
        };
    }

    // 词集相似度 (overlap coefficient + 短句单字补全)
    similarity(a, b) {
        const ta = String(a || ''), tb = String(b || '');
        if (!ta || !tb) return 0;
        const grams = (s) => {
            const set = new Set();
            const chars = s.replace(/[\u0000-\u001f\u007f\s，。！？、；：""''（）【】《》…—·,.!?;:'"()\[\]{}<>]/g, '').slice(0, 120);
            for (let i = 0; i < chars.length - 1; i++) set.add(chars.slice(i, i + 2));
            if (chars.length <= 60) { for (const c of chars) set.add(c); }
            return set;
        };
        const A = grams(ta), B = grams(tb);
        if (A.size === 0 || B.size === 0) return 0;
        let inter = 0;
        for (const g of A) if (B.has(g)) inter++;
        const smaller = Math.min(A.size, B.size);
        return smaller > 0 ? inter / smaller : 0;
    }

    // 主题锚点 + 反义立场冲突检测 (与 RubyPhone supersede-engine 同构)
    isHighConfidenceConflict(oldText, newText) {
        const o = String(oldText || ''), n = String(newText || '');
        if (!o || !n) return false;
        if (this.similarity(o, n) < this.config.simGate) return false;

        const STANCE_CONFLICTS = [
            { anchors: [/奶茶/, /奶/, /茶/], pos: [/喜欢|爱喝|常喝|最爱|又重新|开始喝|重新开始|又喝/], neg: [/不喝|戒(?!不掉|不了)|戒掉|戒了|讨厌|换掉|再也不|不敢喝|不能喝/] },
            { anchors: [/住/, /老房子/, /房子/], pos: [/住|住着|定居|住下|住在/], neg: [/搬走|离开|不住了|搬去|退了|搬离/] },
            { anchors: [/吃/], pos: [/喜欢吃|爱吃|常吃/], neg: [/不吃|戒(?!不掉|不了)|戒掉|忌口|不能吃/] },
            { anchors: [/工作/, /上班/], pos: [/还在|继续做|当前|在做/], neg: [/辞|离职|不干|换工作|跳槽|失业/] },
            { anchors: [/养/], pos: [/养|养着|收养/], neg: [/送走|不养|寄养/] },
            { anchors: [/喜欢|爱/], pos: [/喜欢|爱上|最爱|心动/], neg: [/不喜欢|不爱了|讨厌|无感|放弃/] }
        ];
        const strongRecover = /又重新|重新开始|又喝回|恢复喝|再次喝|又爱上/;
        for (const sc of STANCE_CONFLICTS) {
            const hasAnchor = sc.anchors.some(ar => ar.test(o) && ar.test(n));
            if (!hasAnchor) continue;
            const cleanPos = (s) => sc.pos.some(r => r.test(s));
            const cleanNeg = (s) => sc.neg.some(r => r.test(s));
            const oldPos = cleanPos(o) && !cleanNeg(o);
            const oldNeg = cleanNeg(o);
            const newPos = (cleanPos(n) && !cleanNeg(n)) || strongRecover.test(n);
            const newNeg = cleanNeg(n) && !strongRecover.test(n);
            if (oldPos && newNeg) return true;
            if (oldNeg && newPos) return true;
        }
        // 强词面覆盖 + 转变标记
        const oCore = o.replace(/\s+/g, '').slice(0, 30);
        if (oCore.length >= 6 && n.replace(/\s+/g, '').includes(oCore)) {
            if (/不过|其实|现在|后来|已经|变了|换|改|戒/.test(n)) return true;
        }
        return false;
    }

    // 判断新记忆是否压制旧记忆 (newKey 是新条, oldEntry 是已存在条)
    shouldSupersede(oldText, oldImportance, oldKey, newText, newImportance) {
        if (!oldText || !newText) return false;
        // 卷摘要/已退役不参与
        if (this.supersededMap[oldKey] && this.supersededMap[oldKey].byKey) return true; // 链式: 已被压制的可被更新替代
        if (newImportance < (oldImportance || 5) * this.config.bias) return false;
        return this.isHighConfidenceConflict(oldText, newText);
    }

    // 扫描: 新记忆 vs 池中旧记忆, 标记 superseded
    // 返回 [{key, byKey}]
    scan(newSummaries, existingSummaries) {
        const superseded = [];
        if (!this.config.enabled) return superseded;
        if (!Array.isArray(newSummaries) || !newSummaries.length) return superseded;
        const pool = (existingSummaries || []).slice(-this.config.scanPool);
        for (const ns of newSummaries) {
            if (!ns || !ns.text) continue;
            for (const old of pool) {
                if (!old || !old.text || old.key === ns.key) continue;
                // 跳过已被 superseded 且压制方仍存在的 (但允许链式替换走 through)
                const oldSup = this.supersededMap[old.key];
                if (oldSup && oldSup.byKey && oldSup.byKey !== ns.key) {
                    // 旧条已被别的新条压制: 仅当新条语义更强时走链替换
                    if (this.isHighConfidenceConflict(old.text, ns.text)) {
                        // 链式: 更新压制方
                        this.supersededMap[old.key] = { byKey: ns.key, at: Date.now(), content: old.text };
                        superseded.push({ key: old.key, byKey: ns.key, chain: true });
                    }
                    continue;
                }
                if (this.shouldSupersede(old.text, old.importance, old.key, ns.text, ns.importance)) {
                    this.supersededMap[old.key] = { byKey: ns.key, at: Date.now(), content: old.text };
                    superseded.push({ key: old.key, byKey: ns.key });
                }
            }
        }
        return superseded;
    }

    // 是否为 superseded
    isSuperseded(key) {
        const s = this.supersededMap[key];
        return !!(s && s.byKey);
    }

    // 复活检查: 压制方消失/被删 → 旧条复活
    revive(aliveKeys) {
        const alive = new Set(aliveKeys || []);
        let revived = 0;
        for (const key of Object.keys(this.supersededMap)) {
            const s = this.supersededMap[key];
            if (!s?.byKey) continue;
            if (!alive.has(s.byKey)) {
                delete this.supersededMap[key];
                revived++;
            }
        }
        return revived;
    }

    export() { return { supersededMap: this.supersededMap }; }
    import(data) {
        if (data?.supersededMap) this.supersededMap = data.supersededMap;
        else if (data) this.supersededMap = data;
        this.config = Object.assign(this.config, data?.config || {});
    }
}

// ─────────────── ③ RecallDedup 召回去重 ───────────────

    window.LonShaSupersede = { SupersedeManager: SupersedeManager };
})();
