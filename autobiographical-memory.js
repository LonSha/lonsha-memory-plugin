/* ========================================================
 * autobiographical-memory.js — [M6-O4 · v3.357.0] 人物自传式记忆契约
 * 纯函数/纯契约，零依赖，零写回。
 * --------------------------------------------------------
 * 解决问题：
 *   从仅返回几条孤立文本，到构建角色“过去怎样—后来发生什么—现在仍保留什么”的自传经历链。
 * 核心机制：
 *   1. 生命阶段（Life Stages）：支持编辑阶段边界、摘要、关键抉择与遗留线索；
 *   2. 关键抉择（Pivotal Choices）：抉择引发后续自传摘要衍变与当下保留态度（stillRetained）调整；
 *   3. 场景感知装配（Scene-aware Profile）：
 *      - flashback: 回忆场景，检索历史阶段背景与转折因由；
 *      - present: 当下互动场景，聚焦当前阶段、关键转折沉淀与依然保留的态度；
 *      - deliberate: 决策场景，提取关键抉择后果与未决事项对照；
 *   4. 同名异人与伪装身份隔离：严格按 charKey 隔离，绝不因姓名相同而合并人生。
 * ======================================================== */
'use strict';

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaAutobiographicalMemory = factory();
    }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {

    const VERSION = '3.357.0';
    const MAX_STAGES = 20;
    const MAX_CHOICES = 50;
    const MAX_THREADS = 50;
    const MAX_RETAINED = 30;

    function _str(v) { return (v != null) ? String(v).trim() : ''; }
    function _num(v, def = null) {
        const n = Number(v);
        return Number.isFinite(n) ? n : def;
    }

    function createAutobiography(raw) {
        const r = (raw && typeof raw === 'object') ? raw : {};
        const charKey = _str(r.charKey || r.id);
        const charName = _str(r.charName || charKey);
        const personaId = _str(r.personaId || charKey);

        const stages = Array.isArray(r.stages) ? r.stages.map(normalizeStage).filter(Boolean) : [];
        const choices = Array.isArray(r.choices) ? r.choices.map(normalizeChoice).filter(Boolean) : [];
        const openThreads = Array.isArray(r.openThreads) ? r.openThreads.map(normalizeThread).filter(Boolean) : [];
        const stillRetained = Array.isArray(r.stillRetained)
            ? r.stillRetained.map(normalizeRetained).filter(Boolean)
            : [];

        return {
            version: 1,
            charKey,
            charName,
            personaId,
            currentStageId: _str(r.currentStageId) || (stages.length > 0 ? stages[stages.length - 1].id : null),
            stages: stages.slice(0, MAX_STAGES),
            choices: choices.slice(0, MAX_CHOICES),
            openThreads: openThreads.slice(0, MAX_THREADS),
            stillRetained: stillRetained.slice(0, MAX_RETAINED),
            updatedAt: _num(r.updatedAt, Date.now())
        };
    }

    function normalizeStage(s) {
        if (!s || typeof s !== 'object') return null;
        const id = _str(s.id);
        if (!id) return null;
        return {
            id: id.slice(0, 60),
            name: _str(s.name || id).slice(0, 60),
            timeSpan: _str(s.timeSpan || '').slice(0, 80),
            floorRange: Array.isArray(s.floorRange) && s.floorRange.length === 2
                ? [_num(s.floorRange[0], 0), _num(s.floorRange[1], 0)]
                : null,
            summary: _str(s.summary || '').slice(0, 500),
            turningSummary: _str(s.turningSummary || '').slice(0, 300),
            isActive: s.isActive !== false,
            order: _num(s.order, 0)
        };
    }

    function normalizeChoice(c) {
        if (!c || typeof c !== 'object') return null;
        const id = _str(c.id);
        if (!id) return null;
        return {
            id: id.slice(0, 60),
            stageId: _str(c.stageId || '').slice(0, 60),
            choice: _str(c.choice || '').slice(0, 200),
            floor: _num(c.floor, 0),
            consequence: _str(c.consequence || '').slice(0, 300),
            affectedAspects: Array.isArray(c.affectedAspects) ? c.affectedAspects.map(_str).filter(Boolean) : [],
            isHypothetical: !!c.isHypothetical
        };
    }

    function normalizeThread(t) {
        if (!t || typeof t !== 'object') return null;
        const id = _str(t.id);
        if (!id) return null;
        return {
            id: id.slice(0, 60),
            stageId: _str(t.stageId || '').slice(0, 60),
            matter: _str(t.matter || '').slice(0, 200),
            status: ['unresolved', 'resolved', 'abandoned'].includes(t.status) ? t.status : 'unresolved',
            resolution: _str(t.resolution || '').slice(0, 200),
            originFloor: _num(t.originFloor, 0)
        };
    }

    function normalizeRetained(item) {
        if (!item) return null;
        if (typeof item === 'string') {
            const s = _str(item);
            return s ? { trait: s.slice(0, 100), originStageId: null, expression: s.slice(0, 100) } : null;
        }
        if (typeof item === 'object') {
            const trait = _str(item.trait || item.text);
            if (!trait) return null;
            return {
                trait: trait.slice(0, 100),
                originStageId: _str(item.originStageId || null),
                expression: _str(item.expression || trait).slice(0, 150)
            };
        }
        return null;
    }

    function addLifeStage(autobio, rawStage) {
        const s = normalizeStage(rawStage);
        if (!s) return { ok: false, reason: 'invalid_stage_payload' };

        const clone = createAutobiography(autobio);
        const idx = clone.stages.findIndex(x => x.id === s.id);
        if (idx >= 0) {
            clone.stages[idx] = { ...clone.stages[idx], ...s };
        } else {
            if (s.order === 0) s.order = clone.stages.length + 1;
            clone.stages.push(s);
            clone.stages.sort((a, b) => a.order - b.order);
        }
        if (s.isActive) clone.currentStageId = s.id;
        clone.updatedAt = Date.now();
        return { ok: true, autobiography: clone, stage: s };
    }

    function updateLifeStage(autobio, stageId, patch) {
        const sid = _str(stageId);
        if (!sid) return { ok: false, reason: 'missing_stage_id' };
        const clone = createAutobiography(autobio);
        const target = clone.stages.find(x => x.id === sid);
        if (!target) return { ok: false, reason: 'stage_not_found' };

        if (patch.name != null) target.name = _str(patch.name).slice(0, 60);
        if (patch.timeSpan != null) target.timeSpan = _str(patch.timeSpan).slice(0, 80);
        if (patch.summary != null) target.summary = _str(patch.summary).slice(0, 500);
        if (patch.turningSummary != null) target.turningSummary = _str(patch.turningSummary).slice(0, 300);
        if (Array.isArray(patch.floorRange)) {
            target.floorRange = [_num(patch.floorRange[0], 0), _num(patch.floorRange[1], 0)];
        }
        if (patch.isActive != null) {
            target.isActive = !!patch.isActive;
            if (target.isActive) clone.currentStageId = target.id;
        }
        clone.updatedAt = Date.now();
        return { ok: true, autobiography: clone, stage: target };
    }

    function recordPivotalChoice(autobio, rawChoice) {
        const c = normalizeChoice(rawChoice);
        if (!c) return { ok: false, reason: 'invalid_choice_payload' };

        if (c.isHypothetical) {
            return { ok: false, reason: 'hypothetical_choice_cannot_be_canonical' };
        }

        const clone = createAutobiography(autobio);
        const existingIdx = clone.choices.findIndex(x => x.id === c.id);
        if (existingIdx >= 0) {
            clone.choices[existingIdx] = c;
        } else {
            clone.choices.push(c);
        }

        const currentStage = clone.stages.find(s => s.id === c.stageId)
            || clone.stages.find(s => s.id === clone.currentStageId);

        if (currentStage) {
            const addedTurn = '【选择】' + c.choice + ' → 结果：' + c.consequence;
            if (!currentStage.turningSummary.includes(c.choice)) {
                currentStage.turningSummary = currentStage.turningSummary
                    ? (currentStage.turningSummary + '; ' + addedTurn).slice(0, 300)
                    : addedTurn.slice(0, 300);
            }
        }

        if (c.consequence && c.affectedAspects.length > 0) {
            for (const aspect of c.affectedAspects) {
                const traitDesc = (aspect + '：因' + c.choice + '而' + c.consequence).slice(0, 100);
                const rIdx = clone.stillRetained.findIndex(x => x.trait.startsWith(aspect));
                if (rIdx >= 0) {
                    clone.stillRetained[rIdx].expression = traitDesc;
                } else {
                    clone.stillRetained.push({
                        trait: aspect.slice(0, 80),
                        originStageId: c.stageId || null,
                        expression: traitDesc
                    });
                }
            }
        }

        clone.updatedAt = Date.now();
        return { ok: true, autobiography: clone, choice: c };
    }

    function recordOpenThread(autobio, rawThread) {
        const t = normalizeThread(rawThread);
        if (!t) return { ok: false, reason: 'invalid_thread_payload' };
        const clone = createAutobiography(autobio);
        const idx = clone.openThreads.findIndex(x => x.id === t.id);
        if (idx >= 0) clone.openThreads[idx] = t;
        else clone.openThreads.push(t);
        clone.updatedAt = Date.now();
        return { ok: true, autobiography: clone, thread: t };
    }

    function resolveOpenThread(autobio, threadId, resolution) {
        const tid = _str(threadId);
        const clone = createAutobiography(autobio);
        const t = clone.openThreads.find(x => x.id === tid);
        if (!t) return { ok: false, reason: 'thread_not_found' };
        t.status = 'resolved';
        t.resolution = _str(resolution).slice(0, 200);
        clone.updatedAt = Date.now();
        return { ok: true, autobiography: clone, thread: t };
    }

    function deriveAutobiographicalProfile(autobio, options = {}) {
        const ab = createAutobiography(autobio);
        const mode = ['flashback', 'present', 'deliberate'].includes(options.sceneMode)
            ? options.sceneMode
            : 'present';
        const focusStageId = _str(options.focusStageId);

        let activeStage = null;
        if (focusStageId) {
            activeStage = ab.stages.find(s => s.id === focusStageId) || null;
        }
        if (!activeStage) {
            activeStage = ab.stages.find(s => s.id === ab.currentStageId)
                || (ab.stages.length > 0 ? ab.stages[ab.stages.length - 1] : null);
        }

        const pastStages = activeStage
            ? ab.stages.filter(s => s.order < activeStage.order)
            : ab.stages.slice(0, -1);

        const openThreads = ab.openThreads.filter(t => t.status === 'unresolved');
        const choices = ab.choices;
        const stillRetained = ab.stillRetained;

        let narrativeSummary = '';
        let pastBackground = '';
        let turningPoints = '';
        let presentRetention = '';

        if (mode === 'flashback') {
            const target = activeStage || (ab.stages.length > 0 ? ab.stages[0] : null);
            pastBackground = target
                ? '【回忆阶段】' + target.name + '（' + (target.timeSpan || '早年') + '）：' + target.summary
                : '';
            const stageChoices = target ? choices.filter(c => c.stageId === target.id) : choices;
            turningPoints = stageChoices.map(c => '选择：' + c.choice + '（' + c.consequence + '）').join('； ');
            narrativeSummary = '[回忆模式] 溯及经历：' + pastBackground + '。当时转折：' + (turningPoints || '按部就班');
        } else if (mode === 'deliberate') {
            const majorChoices = choices.map(c => '[过往抉择] 在' + (c.stageId || '此前') + '面临「' + c.choice + '」，付出后果：「' + c.consequence + '」').join('; ');
            const threadList = openThreads.map(t => '[未决事项] ' + t.matter).join('; ');
            turningPoints = majorChoices;
            narrativeSummary = '[审思模式] 历史抉择对照：' + (majorChoices || '无重大抉择') + '；未了心结：' + (threadList || '无');
        } else {
            if (pastStages.length > 0) {
                pastBackground = pastStages.map(s => s.name + '（' + s.summary + '）').join(' → ');
            } else {
                pastBackground = '早年经历平稳';
            }
            if (activeStage && activeStage.turningSummary) {
                turningPoints = activeStage.turningSummary;
            } else if (choices.length > 0) {
                turningPoints = choices.slice(-2).map(c => c.choice + '导致' + c.consequence).join('； ');
            }
            presentRetention = stillRetained.map(r => r.expression).join('； ');

            narrativeSummary = '[当下自传] 过往历程：' + pastBackground + '。关键转折：' + (turningPoints || '自然演变') + '。当下态度保留：' + (presentRetention || '暂无深刻印记') + '。';
            if (openThreads.length > 0) {
                narrativeSummary += ' 仍挂心之事：' + openThreads.slice(0, 2).map(t => t.matter).join('、') + '。';
            }
        }

        return {
            charKey: ab.charKey,
            charName: ab.charName,
            personaId: ab.personaId,
            sceneMode: mode,
            focusedStage: activeStage,
            pastBackground,
            turningPoints,
            presentRetention,
            openThreadsCount: openThreads.length,
            narrativeSummary
        };
    }

    function assertIdentityIsolation(profileA, profileB) {
        if (!profileA || !profileB) return true;
        const keyA = _str(profileA.charKey || profileA.id);
        const keyB = _str(profileB.charKey || profileB.id);
        return keyA !== keyB;
    }

    const api = {
        VERSION,
        createAutobiography,
        addLifeStage,
        updateLifeStage,
        recordPivotalChoice,
        recordOpenThread,
        resolveOpenThread,
        deriveAutobiographicalProfile,
        assertIdentityIsolation
    };
    return api;
});
