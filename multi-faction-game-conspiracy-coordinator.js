/* ============================================================
 * multi-faction-game-conspiracy-coordinator.js — 多方博弈同盟撕裂与暗流均衡协调器
 * [v3.461.0 · 多派系暗流博弈、利益撕裂与动态均势网络]
 * ============================================================ */

class MultiFactionGameConspiracyCoordinator {
    constructor() {
        this.factions = new Map(); // factionId -> { id, name, alignment, powerScore, allies: Set, enemies: Set, covertAgreements: [] }
        this.diplomacyEvents = [];
    }

    registerFaction(factionId, factionName = null, alignment = "neutral", initialPower = 50) {
        if (!factionId) return false;
        this.factions.set(String(factionId), {
            id: String(factionId),
            name: factionName || factionId,
            alignment,
            powerScore: Math.max(1, Math.min(100, Number(initialPower) || 50)),
            allies: new Set(),
            enemies: new Set(),
            covertAgreements: []
        });
        return true;
    }

    formAlliance(f1, f2, terms = "表面互保同盟") {
        const fac1 = this.factions.get(f1);
        const fac2 = this.factions.get(f2);
        if (!fac1 || !fac2) return false;

        fac1.allies.add(f2);
        fac2.allies.add(f1);
        fac1.enemies.delete(f2);
        fac2.enemies.delete(f1);

        this.diplomacyEvents.push({
            type: "alliance_formed",
            factions: [f1, f2],
            terms,
            timestamp: Date.now()
        });
        return true;
    }

    breakAllianceAndDeclareHostility(f1, f2, cause = "利益分配决裂") {
        const fac1 = this.factions.get(f1);
        const fac2 = this.factions.get(f2);
        if (!fac1 || !fac2) return false;

        fac1.allies.delete(f2);
        fac2.allies.delete(f1);
        fac1.enemies.add(f2);
        fac2.enemies.add(f1);

        const event = {
            type: "alliance_broken",
            factions: [f1, f2],
            cause: String(cause).trim(),
            timestamp: Date.now()
        };
        this.diplomacyEvents.push(event);

        return {
            fractureOccurred: true,
            factions: [fac1.name, fac2.name],
            cause,
            promptDirective: `【势力格局暗流剧变】「${fac1.name}」与「${fac2.name}」昔日同盟因「${cause}」彻底崩解！` +
                `双方已视对方为致命死敌，暗中布置伏兵与眼线，在场角色须时刻警惕阵营撕裂带来的清洗与暗箭。`
        };
    }

    getFactionStanding(factionId) {
        const fac = this.factions.get(factionId);
        if (!fac) return null;
        return {
            id: fac.id,
            name: fac.name,
            powerScore: fac.powerScore,
            allies: Array.from(fac.allies),
            enemies: Array.from(fac.enemies)
        };
    }

    exportState() {
        const dump = [];
        for (const [id, f] of this.factions.entries()) {
            dump.push({
                id,
                name: f.name,
                alignment: f.alignment,
                powerScore: f.powerScore,
                allies: Array.from(f.allies),
                enemies: Array.from(f.enemies),
                covertAgreements: f.covertAgreements
            });
        }
        return {
            factions: dump,
            diplomacyEvents: this.diplomacyEvents
        };
    }

    hydrateState(state) {
        if (!state) return;
        if (Array.isArray(state.factions)) {
            this.factions.clear();
            for (const item of state.factions) {
                this.factions.set(item.id, {
                    id: item.id,
                    name: item.name,
                    alignment: item.alignment,
                    powerScore: item.powerScore,
                    allies: new Set(item.allies || []),
                    enemies: new Set(item.enemies || []),
                    covertAgreements: item.covertAgreements || []
                });
            }
        }
        if (Array.isArray(state.diplomacyEvents)) {
            this.diplomacyEvents = [...state.diplomacyEvents];
        }
    }
}
if (typeof globalThis !== "undefined") { globalThis.MultiFactionGameConspiracyCoordinator = MultiFactionGameConspiracyCoordinator; }
if (typeof window !== "undefined") { window.MultiFactionGameConspiracyCoordinator = MultiFactionGameConspiracyCoordinator; }
if (typeof module !== "undefined" && module.exports) { module.exports = MultiFactionGameConspiracyCoordinator; }

/* ============================================================
 * [v3.461.0 接线修复] 本文件此前是 ESM 形态（export …），而宿主 extra_js、
 * 审计沙箱与 optional-engine-registry 的 require 全部按经典脚本加载 ——
 * `export` 在那里直接是语法错误，模块在真机上从未挂载成功。
 * 改回本仓统一的 UMD/IIFE 注册形态（同 ego-defense-mechanisms-engine.js）：
 * CJS 侧保留 module.exports 供测试与注册表的 require 使用，
 * 经典脚本侧把引擎类挂到全局，让取库口与编排器真的取得到。
 * ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        var api = factory();
                root.MultiFactionGameConspiracyCoordinator = api;
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    return MultiFactionGameConspiracyCoordinator;
}));
