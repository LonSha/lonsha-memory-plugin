/* ========================================================
 * memory-migration-boundary.js — [M7-O9 · 第七期规划] 记忆迁移与项目边界体验内核（纯函数）
 * --------------------------------------------------------
 * 【这一刀治的是什么】
 *   用户复制、拆分或归档长期项目时，以往要么一刀切整库盲目克隆，
 *   导致私密自知事实或特定角色的独知秘密被静默泄漏到公开新项目；
 *   要么迁移后无法回溯哪些迁移了、哪些被排除，且无法精准撤销。
 *   记忆迁移与项目边界体验建立“可见、可筛选、按权限防护、可精准撤销的迁移屏障”：
 *     ① 结构化迁移预览(generateMigrationPreview)：按项目来源(sourceProjectId)、
 *        分支(branch)、密级(securityTier)与依赖关系进行清晰分组呈现；
 *     ② 显式迁移策略选择：支持全量带走(include)、主动排除(exclude)、
 *        敏感词脱敏外带(anonymize)；
 *     ③ 默认闭合阻断原则(fail-closed)：私密自知(private_self)或密级未证实(unproven)事实
 *        默认严禁外带（缺省即 exclude），绝不发生静默越界泄漏；
 *     ④ 跨项目同名冲突保护：当目标项目已存在同名实体或同键事实时，支持按键重命名或跳过；
 *     ⑤ 事务级可撤销结果(revertMigration)：撤销迁移后，源项目数据完好无损，
 *        目标项目本次写入的迁移增量被完整剔除清理。
 * ======================================================== */

(function (root) {
    'use strict';

    /** 迁移动作决策 */
    const MIGRATION_DECISION = Object.freeze({
        INCLUDE: 'include',       // 完整迁移
        EXCLUDE: 'exclude',       // 明确排除（不外带）
        ANONYMIZE: 'anonymize'    // 敏感脱敏后迁移
    });

    /** 密级分类契约（与 perspective-preview 对齐） */
    const MIGRATION_SECURITY_TIERS = Object.freeze({
        PUBLIC_KNOWN: 'public_known',               // 公开已知设定
        CHARACTER_EXCLUSIVE: 'character_exclusive', // 角色独知
        PRIVATE_SELF: 'private_self',               // 私密自知
        UNPROVEN: 'unproven'                        // 未知/未证实密级
    });

    function safeStr(val, fallback = '') {
        return (typeof val === 'string') ? val.trim() : fallback;
    }

    function safeNum(val, fallback = 0) {
        const n = Number(val);
        return Number.isFinite(n) ? n : fallback;
    }

    function clone(val) {
        return JSON.parse(JSON.stringify(val));
    }

    /**
     * 规范化待迁移条目
     */
    function normalizeMigrationCandidate(raw, idx = 0) {
        if (!raw || typeof raw !== 'object') return null;
        const factKey = safeStr(raw.factKey || raw.id, `fact_${idx}`);
        const content = safeStr(raw.content || raw.text);
        if (!content) return null;

        const validTiers = Object.values(MIGRATION_SECURITY_TIERS);
        const tier = validTiers.includes(raw.tier || raw.securityTier)
            ? (raw.tier || raw.securityTier)
            : MIGRATION_SECURITY_TIERS.UNPROVEN;

        const branch = safeStr(raw.branch, 'main');
        const entityName = safeStr(raw.entityName || raw.character, 'common');
        const sensitiveTokens = Array.isArray(raw.sensitiveTokens)
            ? raw.sensitiveTokens.map(safeStr).filter(Boolean)
            : [];

        // 默认决策践行 fail-closed：私密自知与未证实密级默认 EXCLUDE
        let defaultDecision = MIGRATION_DECISION.INCLUDE;
        if (tier === MIGRATION_SECURITY_TIERS.PRIVATE_SELF || tier === MIGRATION_SECURITY_TIERS.UNPROVEN) {
            defaultDecision = MIGRATION_DECISION.EXCLUDE;
        }

        return Object.freeze({
            factKey,
            content,
            tier,
            branch,
            entityName,
            sensitiveTokens: Object.freeze(sensitiveTokens),
            decision: defaultDecision,
            decisionReason: defaultDecision === MIGRATION_DECISION.EXCLUDE ? 'fail-closed默认排除私密/未证实事实' : '公开事实默认准许迁移'
        });
    }

    /**
     * 生成跨项目记忆迁移预览
     * @param {string} sourceProjectId 源项目ID
     * @param {string} targetProjectId 目标项目ID
     * @param {Array} rawCandidates 源项目待选事实清单
     */
    function generateMigrationPreview(sourceProjectId, targetProjectId, rawCandidates = []) {
        const src = safeStr(sourceProjectId, 'project_src');
        const tgt = safeStr(targetProjectId, 'project_tgt');
        const rawList = Array.isArray(rawCandidates) ? rawCandidates : [];
        const candidates = rawList.map((c, idx) => normalizeMigrationCandidate(c, idx)).filter(Boolean);

        const included = candidates.filter(c => c.decision === MIGRATION_DECISION.INCLUDE);
        const excluded = candidates.filter(c => c.decision === MIGRATION_DECISION.EXCLUDE);
        const anonymized = candidates.filter(c => c.decision === MIGRATION_DECISION.ANONYMIZE);

        return Object.freeze({
            previewId: `prev_${src}_to_${tgt}_${Date.now().toString(36)}`,
            sourceProjectId: src,
            targetProjectId: tgt,
            candidates: Object.freeze(candidates),
            summary: Object.freeze({
                totalCount: candidates.length,
                includedCount: included.length,
                excludedCount: excluded.length,
                anonymizedCount: anonymized.length
            }),
            createdAt: Date.now()
        });
    }

    /**
     * 用户按条或按规则调整迁移决策
     */
    function updateCandidateDecision(preview, factKey, newDecision, opts = {}) {
        if (!preview || !Array.isArray(preview.candidates)) return preview;
        const key = safeStr(factKey);
        const decisionValues = Object.values(MIGRATION_DECISION);
        const decision = decisionValues.includes(newDecision) ? newDecision : MIGRATION_DECISION.EXCLUDE;

        const nextCandidates = preview.candidates.map(c => {
            if (c.factKey !== key) return c;
            return Object.freeze({
                ...c,
                decision,
                decisionReason: safeStr(opts.reason, `用户手动指定决策为 ${decision}`)
            });
        });

        const included = nextCandidates.filter(c => c.decision === MIGRATION_DECISION.INCLUDE);
        const excluded = nextCandidates.filter(c => c.decision === MIGRATION_DECISION.EXCLUDE);
        const anonymized = nextCandidates.filter(c => c.decision === MIGRATION_DECISION.ANONYMIZE);

        return Object.freeze({
            ...preview,
            candidates: Object.freeze(nextCandidates),
            summary: Object.freeze({
                totalCount: nextCandidates.length,
                includedCount: included.length,
                excludedCount: excluded.length,
                anonymizedCount: anonymized.length
            })
        });
    }

    /**
     * 执行跨项目迁移操作
     * 契约：
     * 1. 绝对不篡改源项目任何数据；
     * 2. EXCLUDE 项写入未迁移清单（unmigratedManifest）；
     * 3. ANONYMIZE 项对敏感词执行遮蔽替换；
     * 4. 产出可撤销凭据（revertReceipt）。
     */
    function executeMigration(preview, existingTargetKeys = []) {
        if (!preview || !Array.isArray(preview.candidates)) {
            return { migratedRecords: [], unmigratedManifest: [], revertReceipt: null };
        }

        const targetKeySet = new Set((Array.isArray(existingTargetKeys) ? existingTargetKeys : []).map(safeStr));
        const migratedRecords = [];
        const unmigratedManifest = [];
        const injectedKeys = [];

        for (const item of preview.candidates) {
            if (item.decision === MIGRATION_DECISION.EXCLUDE) {
                unmigratedManifest.push({
                    factKey: item.factKey,
                    tier: item.tier,
                    reason: item.decisionReason
                });
                continue;
            }

            // 处理键冲突：若目标库已存在该键，加前缀或别名
            let finalKey = item.factKey;
            if (targetKeySet.has(finalKey)) {
                finalKey = `${preview.sourceProjectId}_${item.factKey}`;
            }

            let finalContent = item.content;
            if (item.decision === MIGRATION_DECISION.ANONYMIZE && item.sensitiveTokens.length > 0) {
                for (const tok of item.sensitiveTokens) {
                    if (tok && finalContent.includes(tok)) {
                        finalContent = finalContent.split(tok).join('[已脱敏]');
                    }
                }
            }

            const record = Object.freeze({
                factKey: finalKey,
                originalFactKey: item.factKey,
                content: finalContent,
                tier: item.tier,
                sourceProjectId: preview.sourceProjectId,
                migratedAt: Date.now()
            });

            migratedRecords.push(record);
            injectedKeys.push(finalKey);
        }

        const revertReceipt = Object.freeze({
            receiptId: `rev_mig_${Date.now().toString(36)}`,
            sourceProjectId: preview.sourceProjectId,
            targetProjectId: preview.targetProjectId,
            injectedKeys: Object.freeze(injectedKeys),
            createdAt: Date.now()
        });

        return Object.freeze({
            migratedRecords: Object.freeze(migratedRecords),
            unmigratedManifest: Object.freeze(unmigratedManifest),
            revertReceipt
        });
    }

    /**
     * 撤销迁移操作
     * 契约：根据 revertReceipt 清除目标库中的增量键，源库零写无影响
     */
    function revertMigration(targetRecords = [], revertReceipt) {
        if (!revertReceipt || !Array.isArray(revertReceipt.injectedKeys)) {
            return targetRecords;
        }

        const keysToRemove = new Set(revertReceipt.injectedKeys.map(safeStr));
        const list = Array.isArray(targetRecords) ? targetRecords : [];
        const remaining = list.filter(r => !keysToRemove.has(safeStr(r.factKey || r.id)));

        return Object.freeze({
            remainingRecords: Object.freeze(remaining),
            clearedKeyCount: keysToRemove.size,
            revertedReceiptId: revertReceipt.receiptId,
            revertedAt: Date.now()
        });
    }

    /**
     * 模块自检函数
     */
    function memoryMigrationBoundarySelfCheck() {
        const problems = [];
        if (Object.keys(MIGRATION_DECISION).length !== 3) {
            problems.push('MIGRATION_DECISION 必须恰好为 3 种');
        }
        if (Object.keys(MIGRATION_SECURITY_TIERS).length !== 4) {
            problems.push('MIGRATION_SECURITY_TIERS 必须恰好为 4 类');
        }

        // 测试三个项目情景：含同名人物、秘密与共享事实
        const sourceFacts = [
            { factKey: 'f_pub_lore', content: '青石镇位于沧州南麓', tier: 'public_known' },
            { factKey: 'f_priv_secret', content: '林舟真实修为其实已经到了元婴巅峰', tier: 'private_self' },
            { factKey: 'f_unproven', content: '传闻后山埋有魔宗重宝', tier: 'unproven' },
            { factKey: 'f_shared', content: '周姐在商行秘密账本记录了私账', tier: 'character_exclusive', sensitiveTokens: ['秘密账本', '私账'] }
        ];

        let preview = generateMigrationPreview('proj_novel_a', 'proj_novel_b', sourceFacts);
        if (preview.summary.totalCount !== 4) {
            problems.push('预览总数应为 4 条');
        }

        // 验证 fail-closed：私密自知与未证实默认被 exclude
        const privCand = preview.candidates.find(c => c.factKey === 'f_priv_secret');
        const unprovenCand = preview.candidates.find(c => c.factKey === 'f_unproven');
        if (privCand?.decision !== MIGRATION_DECISION.EXCLUDE) {
            problems.push('私密自知事实默认必须为 exclude');
        }
        if (unprovenCand?.decision !== MIGRATION_DECISION.EXCLUDE) {
            problems.push('未证实事实默认必须为 exclude');
        }

        // 用户将 f_shared 指定为脱敏外带
        preview = updateCandidateDecision(preview, 'f_shared', MIGRATION_DECISION.ANONYMIZE);

        // 执行迁移，假定目标已有 f_pub_lore 键
        const result = executeMigration(preview, ['f_pub_lore']);
        if (result.migratedRecords.length !== 2) {
            problems.push(`迁移成功记录应为 2 条(pub重命名 + shared脱敏)，实得 ${result.migratedRecords.length}`);
        }
        if (result.unmigratedManifest.length !== 2) {
            problems.push(`未迁移清单应为 2 条(priv + unproven)，实得 ${result.unmigratedManifest.length}`);
        }

        // 验证脱敏
        const anonRecord = result.migratedRecords.find(r => r.originalFactKey === 'f_shared');
        if (!anonRecord?.content.includes('[已脱敏]') || anonRecord.content.includes('秘密账本')) {
            problems.push('脱敏记录未正确替换敏感词');
        }

        // 验证撤销迁移
        const targetStore = [...result.migratedRecords, { factKey: 'existing_item', content: '老项目原有数据' }];
        const reverted = revertMigration(targetStore, result.revertReceipt);
        if (reverted.remainingRecords.length !== 1 || reverted.remainingRecords[0].factKey !== 'existing_item') {
            problems.push('撤销迁移未能准确清除增量而保留原有数据');
        }

        return { problems };
    }

    const api = Object.freeze({
        MIGRATION_DECISION,
        MIGRATION_SECURITY_TIERS,
        normalizeMigrationCandidate,
        generateMigrationPreview,
        updateCandidateDecision,
        executeMigration,
        revertMigration,
        memoryMigrationBoundarySelfCheck
    });

    root.LonShaMemoryMigrationBoundary = api;
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof globalThis !== 'undefined' ? globalThis : window);