/* ============================================================
 * fact-correction-transaction.js — [L14-O2] 纠错从条目编辑走到下一次生成
 * ------------------------------------------------------------
 * 一处纠错 → 影响预览 → 更新各 owner / 索引 / 派生引用
 *            → 下一轮召回与注入**不再使用被撤销的版本** → 回执。
 *
 * 【为什么要在现有两件之外另立这一层】
 *   · fact-correction-bench.js —— 纯函数修订台：能算影响图、能把下游标 `stale`，
 *     但**只返回新对象**，不组织「按 owner 分组提交」，也不管索引与召回侧；
 *   · recall-correction.js —— 召回纠错账：能过滤候选、能撤销一条纠错，
 *     但只作用于**召回候选列表**，不碰正文库，也没有跨面一致性读数。
 *   两者之间缺的正是**一次纠错事务**：一次确认要同时影响
 *   正文库 / 检索索引 / 视角投影 / 注入，而四者各有自己的 owner。
 *
 * 【四条硬约束（计划验收旅程逐条对应）】
 *   ① **一处纠错必须有影响预览**：`previewCorrectionImpact` 给出四面的逐项影响
 *      与分级（可自动重算 / 需确认 / 不可自动改），未预览不得提交。
 *   ② **按 owner 提交，不越权直写**：本模块**从不写任何槽**，
 *      只产出 `ownerBatches`（每个 owner 一份 payload）与 `indexUpdates`；
 *      宿主按 owner 各自提交，部分失败如实报出（不承诺跨账原子回滚）。
 *   ③ **下一轮不再使用被撤销版本**：`isVersionUsable` 是召回/注入侧的**唯一判据**，
 *      撤销后旧版本立即不可用；正文库那条历史仍原样保留（`originalEvidenceUntouched`）。
 *   ④ **撤销纠错恢复原版本，原始证据不被改写**：`rollbackCorrection` 回到上一版，
 *      并显式声明 `originalEvidenceUntouched: true`；证据正文从不进入本模块的写路径。
 *
 * 【数据 owner】
 *   读：调用方传入事实记录、依赖项、索引项（本模块不读 engine 槽）。
 *   写：**无**。产出 `ownerBatches` 交回各 owner（facts / index / perspective / injection）。
 *
 * 【零依赖、CJS/IIFE 双导出，挂 root.LonShaFactCorrectionTransaction】
 * ============================================================ */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaFactCorrectionTransaction = factory();
    }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';
    var VERSION = '3.448.0';

    /* 纠错会波及的四个面，各有自己的 owner。计划原文四样，别合并成一个「都改了」。 */
    var FACES = Object.freeze({
        FACTS: 'facts',                 /* 正文库 / 事实条目本体 */
        INDEX: 'index',                 /* 检索索引（倒排、关键词、向量引用） */
        PERSPECTIVE: 'perspective',      /* 视角投影（谁知道什么） */
        INJECTION: 'injection'          /* 实际注入（下一轮 prompt） */
    });

    var FACE_LIST = Object.freeze([FACES.FACTS, FACES.INDEX, FACES.PERSPECTIVE, FACES.INJECTION]);

    /* 每面的处置级别，与修订台同一口径（recomputable / needs_confirm / manual_only）。 */
    var TIERS = Object.freeze({
        RECOMPUTABLE: 'recomputable',
        NEEDS_CONFIRM: 'needs_confirm',
        MANUAL_ONLY: 'manual_only'
    });

    /* 一次纠错事务的状态。committed 之后才允许 rollback。 */
    var TX_STATES = Object.freeze(['previewed', 'committed', 'rolled-back']);

    function safeStr(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }
    function safeArr(v) { return Array.isArray(v) ? v : []; }
    function isObject(v) { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
    function copy(v) { var o = {}; Object.keys(v).forEach(function (k) { o[k] = v[k]; }); return o; }
    function nowMs() { return Date.now(); }

    function faceLabel(f) {
        if (f === FACES.FACTS) return '正文库';
        if (f === FACES.INDEX) return '检索索引';
        if (f === FACES.PERSPECTIVE) return '视角投影';
        if (f === FACES.INJECTION) return '实际注入';
        return '判不了这一面';
    }

    /* ============================================================
     * classifyDependent — 单个下游项落到哪一面、哪一级
     *   显式 category 优先；缺 category 时按依赖内容保守判 needs_confirm。
     * ============================================================ */
    function classifyDependent(dep) {
        var d = isObject(dep) ? dep : {};
        var cat = safeStr(d.category);
        var face;
        if (cat === 'index' || cat === 'keyword' || cat === 'vector' || cat === 'bm25') face = FACES.INDEX;
        else if (cat === 'perspective' || cat === 'viewpoint' || cat === 'knowledge') face = FACES.PERSPECTIVE;
        else if (cat === 'injection' || cat === 'prompt' || cat === 'recall') face = FACES.INJECTION;
        else if (cat === 'fact' || cat === 'summary' || cat === 'count' || cat === 'relation') face = FACES.FACTS;
        else face = null;   /* 判不了就报 null，不硬塞进某一面 */
        var tier;
        if (d.isManual === true || d.locked === true) tier = TIERS.MANUAL_ONLY;
        else if (cat === 'summary' || cat === 'count' || d.autoRecomputable === true) tier = TIERS.RECOMPUTABLE;
        else tier = TIERS.NEEDS_CONFIRM;
        return {
            id: safeStr(d.id),
            title: safeStr(d.title || d.id),
            category: cat,
            face: face,
            tier: tier,
            faceLabel: face ? faceLabel(face) : '判不了这一面',
            currentValue: (d.value === undefined ? null : d.value)
        };
    }

    /* ============================================================
     * previewCorrectionImpact — 影响预览（只读，writesNothing 恒 true）
     * @param {object} input {
     *   correctionId, factKey, fromValue, toValue,
     *   dependents: [{ id, title, category, dependsOn?, isManual?, locked? }],
     *   indexEntries?: [{ id, factKey, tokens? }]
     * }
     * ============================================================ */
    function previewCorrectionImpact(input) {
        var i = isObject(input) ? input : {};
        var factKey = safeStr(i.factKey);
        if (!factKey) return { ok: false, reason: 'fact-key-required', writesNothing: true, writes: false };

        var deps = safeArr(i.dependents);
        var byFace = { facts: [], index: [], perspective: [], injection: [] };
        var undecided = [];
        for (var k = 0; k < deps.length; k++) {
            var c = classifyDependent(deps[k]);
            if (!c.id) continue;
            if (!c.face) { undecided.push(c); continue; }
            byFace[c.face].push(c);
        }
        /* 索引面：即便没有显式依赖项，只要索引里有这条事实的条目，索引也必须重算 ——
         *   否则「改了正文但倒排仍指向旧词」会让下一次检索把旧值当现行。 */
        var indexEntries = safeArr(i.indexEntries).filter(function (e) {
            return isObject(e) && safeStr(e.factKey) === factKey;
        });
        if (indexEntries.length > 0) {
            indexEntries.forEach(function (e) {
                var id = safeStr(e.id);
                if (!id) return;
                var exists = byFace.index.some(function (x) { return x.id === id; });
                if (!exists) {
                    byFace.index.push({
                        id: id,
                        title: safeStr(e.title || id),
                        category: 'index',
                        face: FACES.INDEX,
                        tier: TIERS.RECOMPUTABLE,
                        faceLabel: faceLabel(FACES.INDEX),
                        currentValue: null
                    });
                }
            });
        }
        /* 注入面：被撤销的版本必须在下一次注入前失效。
         *   只要这次纠错涉及事实值变化，注入面至少有一条「旧版本停用」的待办。 */
        var fromValue = (i.fromValue === undefined ? null : i.fromValue);
        var toValue = (i.toValue === undefined ? null : i.toValue);
        var valueChanged = String(fromValue) !== String(toValue);
        if (valueChanged && byFace.injection.length === 0) {
            byFace.injection.push({
                id: factKey + '#injection',
                title: '下一轮注入停用旧版本',
                category: 'injection',
                face: FACES.INJECTION,
                tier: TIERS.RECOMPUTABLE,
                faceLabel: faceLabel(FACES.INJECTION),
                currentValue: fromValue
            });
        }

        var totals = { recomputable: 0, needs_confirm: 0, manual_only: 0, total: 0 };
        FACE_LIST.forEach(function (f) {
            byFace[f].forEach(function (x) {
                totals.total += 1;
                if (x.tier === TIERS.RECOMPUTABLE) totals.recomputable += 1;
                else if (x.tier === TIERS.NEEDS_CONFIRM) totals.needs_confirm += 1;
                else totals.manual_only += 1;
            });
        });

        return {
            ok: true,
            writesNothing: true,
            writes: false,
            correctionId: safeStr(i.correctionId) || ('corr#' + factKey),
            factKey: factKey,
            fromValue: fromValue,
            toValue: toValue,
            valueChanged: valueChanged,
            faces: byFace,
            /* 判不了面的依赖单列 —— 不许当成「这一面没有影响」。 */
            undecided: undecided,
            totals: totals,
            hasManualBlockers: totals.manual_only > 0,
            faceSummary: FACE_LIST.map(function (f) {
                return { face: f, faceLabel: faceLabel(f), count: byFace[f].length };
            })
        };
    }

    /* ============================================================
     * commitCorrection — 按 owner 分组产出提交批次（本模块不写）
     * @param {object} preview  必须来自 previewCorrectionImpact
     * @param {object} opts { confirm?, factRecord? }
     * ============================================================ */
    function commitCorrection(preview, opts) {
        var o = isObject(opts) ? opts : {};
        if (!isObject(preview) || preview.ok !== true || !isObject(preview.faces)) {
            return { ok: false, reason: 'preview-required', writes: false };
        }
        /* 未确认零写入：连批次都不产出，避免调用方「拿到就能写」。 */
        if (o.confirm !== true) {
            return { ok: false, reason: 'not-confirmed', writes: false, wouldAffect: preview.totals.total };
        }
        var factRecord = isObject(o.factRecord) ? o.factRecord : null;
        var oldVersion = factRecord && Number.isFinite(Number(factRecord.version)) ? Number(factRecord.version) : 0;
        var newVersion = oldVersion + 1;

        var ownerBatches = [];
        var skippedOwners = [];

        /* facts owner：正文库本体（值 + 版本 + 历史），**不动原始证据正文**。 */
        if (preview.faces.facts.length > 0 || preview.valueChanged) {
            ownerBatches.push({
                owner: 'facts',
                action: 'update-value',
                payload: {
                    factKey: preview.factKey,
                    fromValue: preview.fromValue,
                    toValue: preview.toValue,
                    version: newVersion,
                    previousVersion: oldVersion,
                    /* 显式：只改值，不改证据原文（约束④）。 */
                    rewritesEvidence: false
                }
            });
        }
        if (preview.faces.index.length > 0) {
            ownerBatches.push({
                owner: 'index',
                action: 'reindex',
                payload: {
                    factKey: preview.factKey,
                    entryIds: preview.faces.index.map(function (x) { return x.id; }),
                    toValue: preview.toValue,
                    dropStaleVersion: oldVersion
                }
            });
        }
        if (preview.faces.perspective.length > 0) {
            ownerBatches.push({
                owner: 'perspective',
                action: 'reproject',
                payload: {
                    factKey: preview.factKey,
                    targets: preview.faces.perspective.map(function (x) {
                        return { id: x.id, tier: x.tier };
                    })
                }
            });
        }
        if (preview.faces.injection.length > 0) {
            ownerBatches.push({
                owner: 'injection',
                action: 'retire-version',
                payload: {
                    factKey: preview.factKey,
                    retiredVersion: oldVersion,
                    activeVersion: newVersion
                }
            });
        }
        /* 判不了面的依赖不静默丢掉：单列，等人工去看。 */
        if (preview.undecided.length > 0) {
            skippedOwners.push({
                reason: 'undecided-face',
                itemIds: preview.undecided.map(function (x) { return x.id; })
            });
        }
        if (ownerBatches.length === 0) {
            return { ok: false, reason: 'nothing-to-commit', writes: false };
        }

        return {
            ok: true,
            writes: false,                    /* 本模块不写任何槽 */
            transactionId: preview.correctionId,
            factKey: preview.factKey,
            state: 'committed',
            ownerBatches: ownerBatches,
            ownerCount: ownerBatches.length,
            skippedOwners: skippedOwners,
            /* 跨账不承诺原子回滚：部分失败由宿主按 owner 各自回报。 */
            atomicAcrossOwners: false,
            activeVersion: newVersion,
            retiredVersions: preview.valueChanged ? [oldVersion] : [],
            originalEvidenceUntouched: true,
            committedAt: nowMs()
        };
    }

    /* ============================================================
     * isVersionUsable — 召回 / 注入侧的唯一判据（约束③）
     * @param {object} factVersion { factKey, version, revoked?, stale? }
     * @param {object} tx         commitCorrection 的返回
     * ============================================================ */
    function isVersionUsable(factVersion, tx) {
        var v = isObject(factVersion) ? factVersion : {};
        var key = safeStr(v.factKey);
        var ver = Number(v.version);
        if (v.revoked === true) return { usable: false, reason: 'revoked' };
        var t = isObject(tx) ? tx : null;
        if (t && t.ok === true && safeStr(t.factKey) === key) {
            if (Number.isFinite(ver) && safeArr(t.retiredVersions).indexOf(ver) >= 0) {
                /* ★ 这一条就是「下一轮不再使用被撤销版本」的落点：
                 *   旧版本被明确退休 ⇒ 不可用，哪怕它自己没标 revoked。 */
                return { usable: false, reason: 'superseded-by-correction', activeVersion: t.activeVersion };
            }
            if (Number.isFinite(ver) && ver === Number(t.activeVersion)) {
                return { usable: true, reason: 'active-version' };
            }
        }
        if (v.stale === true) return { usable: false, reason: 'stale' };
        return { usable: true, reason: 'no-correction-applies' };
    }

    /* ============================================================
     * rollbackCorrection — 撤销纠错，恢复原版本（原始证据不改写）
     * ============================================================ */
    function rollbackCorrection(tx, opts) {
        var o = isObject(opts) ? opts : {};
        if (!isObject(tx) || tx.ok !== true) {
            return { ok: false, reason: 'transaction-required', writes: false };
        }
        if (tx.state === 'rolled-back') {
            return { ok: false, reason: 'already-rolled-back', writes: false };
        }
        if (o.confirm !== true) {
            return { ok: false, reason: 'not-confirmed', writes: false };
        }
        var restored = safeArr(tx.retiredVersions);
        return {
            ok: true,
            writes: false,
            transactionId: tx.transactionId,
            factKey: tx.factKey,
            state: 'rolled-back',
            /* 恢复原版本：退休的那一版重新可用，纠错后的版本退休。 */
            restoredVersions: restored.slice(),
            retiredVersions: Number.isFinite(Number(tx.activeVersion)) ? [Number(tx.activeVersion)] : [],
            activeVersion: restored.length > 0 ? restored[0] : null,
            /* 约束④：撤销纠错也不改写原始证据 —— 证据正文从未进入本模块写路径。 */
            originalEvidenceUntouched: true,
            rollbackBatches: [
                { owner: 'facts', action: 'restore-value', payload: { factKey: tx.factKey, version: restored.length > 0 ? restored[0] : null } },
                { owner: 'index', action: 'reindex', payload: { factKey: tx.factKey, dropStaleVersion: tx.activeVersion } },
                { owner: 'injection', action: 'retire-version', payload: { factKey: tx.factKey, retiredVersion: tx.activeVersion, activeVersion: restored.length > 0 ? restored[0] : null } }
            ],
            rolledBackAt: nowMs()
        };
    }

    /* ============================================================
     * buildNextRoundReceipt — 下轮回执：告诉用户「下一轮用的是哪一版」
     * ============================================================ */
    function buildNextRoundReceipt(tx, opts) {
        var o = isObject(opts) ? opts : {};
        if (!isObject(tx) || tx.ok !== true) {
            return { ok: false, reason: 'transaction-required', writesNothing: true };
        }
        var faces = safeArr(tx.ownerBatches).map(function (b) {
            return { owner: b.owner, action: b.action, ok: null };  /* ok 由宿主逐 owner 填 */
        });
        return {
            ok: true,
            writesNothing: true,
            createsFact: false,
            transactionId: tx.transactionId,
            factKey: tx.factKey,
            activeVersion: tx.activeVersion,
            retiredVersions: safeArr(tx.retiredVersions).slice(),
            faces: faces,
            /* 只读回执：明确告诉调用方「这是一份待填的账」，不是已完成的结论。 */
            facesPendingHostReport: true,
            atomicAcrossOwners: false,
            generatedAt: nowMs(),
            roundLabel: safeStr(o.roundLabel) || 'next-round'
        };
    }

    function factCorrectionTransactionSelfCheck() {
        var problems = [];
        if (FACE_LIST.length !== 4) problems.push('纠错面必须恰好 4 面');
        if (TX_STATES.length !== 3) problems.push('事务状态必须恰好 3 态');
        var noKey = previewCorrectionImpact({});
        if (noKey.ok !== false) problems.push('无 factKey 必须拒绝预览');
        var noConfirm = commitCorrection({ ok: true, faces: { facts: [], index: [], perspective: [], injection: [] }, totals: { total: 0 }, factKey: 'k' }, {});
        if (noConfirm.ok !== false) problems.push('未确认不得产出提交批次');
        /* 旧版本必须被明确判为不可用 —— 这是「下一轮不再用被撤销版本」的自证。 */
        var usable = isVersionUsable({ factKey: 'k', version: 1 }, {
            ok: true, factKey: 'k', retiredVersions: [1], activeVersion: 2
        });
        if (usable.usable !== false) problems.push('被退休的版本必须判为不可用');
        var active = isVersionUsable({ factKey: 'k', version: 2 }, {
            ok: true, factKey: 'k', retiredVersions: [1], activeVersion: 2
        });
        if (active.usable !== true) problems.push('当前版本必须判为可用');
        return Object.freeze({ version: VERSION, problems: Object.freeze(problems) });
    }

    return Object.freeze({
        VERSION: VERSION,
        FACES: FACES,
        FACE_LIST: FACE_LIST,
        TIERS: TIERS,
        TX_STATES: TX_STATES,
        classifyDependent: classifyDependent,
        previewCorrectionImpact: previewCorrectionImpact,
        commitCorrection: commitCorrection,
        isVersionUsable: isVersionUsable,
        rollbackCorrection: rollbackCorrection,
        buildNextRoundReceipt: buildNextRoundReceipt,
        factCorrectionTransactionSelfCheck: factCorrectionTransactionSelfCheck
    });
}));