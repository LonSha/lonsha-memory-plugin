// [v3.368.0] engine-persistence-ops.js: 从 index.js 剥离的持久化、快照与检查点集群
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEnginePersistenceOps = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    let _deps = {};

    function bindDeps(deps) {
        if (deps && typeof deps === 'object') {
            _deps = Object.assign({}, _deps, deps);
        }
    }

    function _moduleLib(getGlobal, fileName) {
        if (typeof _deps.moduleLib === 'function') return _deps.moduleLib(getGlobal, fileName);
        if (typeof _deps._moduleLib === 'function') return _deps._moduleLib(getGlobal, fileName);
        try {
            const viaGlobal = (typeof getGlobal === 'function') ? getGlobal() : null;
            if (viaGlobal) return viaGlobal;
        } catch (_) {}
        if (typeof require !== 'undefined') {
            try { return require('./' + fileName); } catch (_) {}
        }
        return null;
    }

    function _schemaMigrationLib() {
        if (typeof _deps._schemaMigrationLib === 'function') return _deps._schemaMigrationLib();
        return _moduleLib(() => (typeof window !== 'undefined' ? window.LonShaSchemaMigration : null), 'schema-migration.js');
    }

    function errLog(err, tag) {
        if (typeof _deps.errLog === 'function') return _deps.errLog(err, tag);
        try { console.error('[LonShaPersistenceOps]', tag, err); } catch (_) {}
    }

    function msgFpOf(m) {
        if (typeof _deps.msgFpOf === 'function') return _deps.msgFpOf(m);
        try {
            return [(m?.is_user === true || m?.role === 'user') ? 'u' : 'a', Math.max(0, Math.round(Number(m?.swipe_id) || 0)), String(m?.message || m?.text || '').slice(0, 16), String(m?.send_date || m?.extra?.send_date || '')].join('|');
        } catch (e) { return 'unknown_fp'; }
    }

    function validateLedgerItemOps(list, ctx) {
        if (typeof _deps.validateLedgerItemOps === 'function') return _deps.validateLedgerItemOps(list, ctx);
        return { items: Array.isArray(list) ? list : [], dropped: [], violations: [], clipped: 0, batchTruncated: 0 };
    }

    const ARCHIVE_SCHEMA_VERSION = 1;
    const ARCHIVE_TOP_LEVEL_KEYS = Object.freeze([
        'version',
        'clock',
        'graph',
        'charMem',
        'worldProg',
        'summaries',
        'diaries',
        'reflection',
        'itemOps',
        'vectors',
        'povs',
        'timeline',
        'status',
        'ledger',
        'suspense',
        'moneyLedger',
        'cards',
        'conflicts',
        'scene',
        'echo',
        'prequel',
        'supersede',
        'narrativeEntropy',
        'stmLtm',
        'recallArtifacts',
        'diaryInjectFloor',
        'timelineInjectFloor',
        'deltaBook',
        'cse',
        'pulse',
        'opLog',
        'outline',
        'pairMem',
        'lockedFacts',
        'recallSourceStats',
        'lexicon',
        'factVersions',
        'eventThreads',
        'repairLog',
        'timelineCursorChatId',
        'timelineCursorFingerprint',
        'timeWentBack',
        'lastSave',
        'packedAt',
        'schemaVersion',
        'producerVersion',
        'loreImportLedger',
        'qaThread',
        'annualDrafts',
        'canonAdoption',
        'extensions',
    ]);
    const ARCHIVE_TOP_LEVEL_KEY_SET = new Set(ARCHIVE_TOP_LEVEL_KEYS);
    let VERSION = '3.368.0';
    const PLUGIN_NAME = 'LonSha记忆引擎';

    class LonShaPersistenceOps {
        collectExport() {
            // [v3.138] CP-L2: 数据版本戳 = 最近一次成功存档时的插件版本（区别于恒为当前版本的 payload.version）。
            // 嵌入存档恢复判旧用它，不再被「collectExport 恒打当前版本戳」污染。
            return {
                version: VERSION,
                clock: this.clock?.export?.() || null,
                graph: this.graph.export(),
                charMem: this.charMem ? this.charMem.export() : {},
                worldProg: this.worldProg ? this.worldProg.export() : {},
                summaries: this.summary.export(),
                diaries: this.diary.export(),
                reflection: this.reflection?.export?.(),
                itemOps: this.itemOps,
                vectors: this.vector.export(),
                povs: this.pov.export(),
                timeline: this.timeline.export(),
                status: this.status.export(),
                ledger: this.ledger.export(),
                suspense: this.suspense.export(),
                moneyLedger: this.moneyLedger.export(),
                cards: this.cards.export(),
                conflicts: this.conflicts.export(),
                scene: this.scene.export(),
                echo: this.echo?.export?.(),
                prequel: this.prequel ? this.prequel.export() : { text: '' },   // [v3.87] 前情资料随聊天持久化
                loreImportLedger: this._loreImportLedger || null,   // [v3.339.0 · M4-X1] 资料导入账
                qaThread: this._qaThread || null,   // [v3.340.0 · M4-X4] 追问线程（只存约束）
                annualDrafts: this._annualDrafts || null,   // [v3.341.0 · M4-X2] 章节成稿草稿册（作品；事实位不收）
                canonAdoption: this._canonAdoption || null,   // [v3.342.0 · M4-X3] 正史落卷凭据（重启后仍能判「这次与上次是不是同一件事」）
                supersede: window.LonShaSupersede ? this.supersede.export() : { supersededMap: {} },
                narrativeEntropy: this._narrativeEntropy || 0,
                stmLtm: this._stmLtmState || null,   // [v3.96] STM/LTM 游标巩固状态随聊天持久化
                // [v3.109] 召回产物随聊天持久化（跨会话复用依据；默认关时为空数组，序列化开销可忽略）
                recallArtifacts: this._recallArtifacts || [],
                diaryInjectFloor: Number.isFinite(Number(this._diaryInjectFloor)) ? Number(this._diaryInjectFloor) : null,
                timelineInjectFloor: Number.isFinite(Number(this._timelineInjectFloor)) ? Number(this._timelineInjectFloor) : null,
                deltaBook: this.deltaBook.export(),  // [v3.130] CP: 此前 collectExport 漏载本键（OMR 手写清单有、单真源没有的漂移键）
                cse: this.cse?.export?.() || { chars: {} },   // [v3.130] CP
                pulse: this.pulse?.export?.() || { beats: [], arcs: {} },   // [v3.130] CP
                opLog: this.opLog?.export?.() || null,   // [v3.130] CP: 事件溯源日志此前只在 OMR 手写清单里，正式导出/快照路径一直丢失
                outline: this.outline.export(),   // [v3.130] CP
                pairMem: this.pairMem.export(),   // [v3.130] CP
                lockedFacts: this.summary.getLockedFacts?.() || [],   // [v3.130] CP
                recallSourceStats: this._recallSourceStats || null,   // [v3.130] CP
                lexicon: this.lexicon.export(),   // [v3.152] 术语词典随聊天持久化
                factVersions: this._factVersionState || null,   // [v3.194] 时间与事实版本账
                eventThreads: this._eventThreadState || null,   // [v3.194] 事件线账（含未完成事项）
                repairLog: this._repairState || null,           // [v3.194] 修复闭环台账
                // [v3.130] CP: 游标身份（chatId/指纹）随存档走——CHANGED 自愈重置后，同楼层重入也能判定"同楼重放"而非误初始化
                timelineCursorChatId: this._timelineCursorChatId,
                timelineCursorFingerprint: this._timelineCursorFingerprint,
                timeWentBack: this._timeWentBack ? { ...this._timeWentBack } : null,
                lastSave: this._lastSaveGroundTruth ? { ...this._lastSaveGroundTruth, sources: { ...(this._lastSaveGroundTruth.sources || {}) } } : null,   // [v3.130] 保存地面真源
                packedAt: new Date().toISOString(),
                schemaVersion: ARCHIVE_SCHEMA_VERSION,   // [v3.140] CP: 判旧用整数结构版本（与插件版本解耦）
                producerVersion: VERSION,   // [v3.140] CP: 生成本存档的插件版本（v3.138 的 dataVersion 与本键同值，已合并废除）
                extensions: this._archiveExtensions || {},   // [v3.142] CP: 宽容解析出口——导入时遇到的未知顶层键随存档回写，不丢不炸
            };
        }

        // [v3.138] CP-L2: 恢复管线单真源（stbme「身份/持久化/配置收敛单一真源」第二层）。
        // storage.load / 设置面板导入 / 嵌入存档恢复三处手写清单此前必然漂移——
        // v3.23 的嵌入恢复按钮缺失、v3.136 前 UI 导入丢新键都是这个结构性缺口的历史实例。
        // 此后新恢复键只在此登记一处，三个入口自动同步。
        restoreFromPayload(data) {
            // [v3.140] CP: 结构化恢复结果（v3.138 整体 try/catch + 返回计数：一个子系统抛错则后续字段
            // 全部不再恢复，调用方却仍收到数字并被 UI 报成“导入成功”）。
            // 现在逐字段独立捕获，返回 {ok, restored, skipped, failed, count, source}，部分失败可定位。
            const opts = arguments[1] || {};
            const res = { ok: true, dryRun: opts.dryRun === true, restored: [], skipped: [], missing: [], failed: [], count: 0, source: String(opts.source || 'unknown'), at: Date.now() };
            if (!data || typeof data !== 'object') { res.ok = false; res.error = 'invalid payload'; return res; }
            // [v3.142] CP: 预检（dryRun）不得动确认状态——只读校验不该有任何副作用
            if (opts.dryRun !== true) this.storage._confirmed = null;   // 恢复期间清除确认（真实落盘后由 storage.save 重新推进）
            if (opts.dryRun !== true) this._bumpEpoch('restore:' + res.source);   // [v3.145] CP-L6: 整体替换运行时，作废在飞任务
            const _sv = Number(data.schemaVersion) || 0;
            if (_sv > ARCHIVE_SCHEMA_VERSION) {
                res.schemaWarning = `存档结构版本 ${_sv} 新于当前 ${ARCHIVE_SCHEMA_VERSION}（可能丢失未知字段语义）`;
            }
            const dry = opts.dryRun === true;   // [v3.142] CP: 两阶段恢复——先预检（不写运行时），再落盘
            // [v3.209.0] 结构迁移面（缺口的**另一个方向**）。
            //   修前实测：此前只有上面那一条 `_sv > 当前` 的分支 —— 「存档比插件**旧**」
            //   完全无人处理，旧档被逐字段塞进新运行时（缺字段静默缺失、语义变化静默沿用）。
            //   结构代际一旦升到 2，旧档会以「看起来恢复成功」的姿态落盘，实际语义错位。
            //   位置纪律（本版两度踩坑、二次才真修对）：块内引用 `const dry`，
            //   故**必须**落在 `dry` 声明之后 —— 写在之前 TDZ 会抛 ReferenceError，
            //   外层 try/catch 把它吞成一句 errLog，症状是「迁移面静默不生效」（不报错、不生效）。
            //   首版即写在前面，首次「修正」只改了本注释的文字、没搬位置（自伤留痕）；
            //   本版实测复现（`else if (!dry)` 先于声明）后才真正搬移。
            try {
                const _SM = _schemaMigrationLib();
                if (_SM && typeof _SM.plan === 'function') {
                    const _mp = _SM.plan(data, ARCHIVE_SCHEMA_VERSION);
                    res.migration = { verdict: _mp.verdict, from: _mp.from, to: _mp.to, steps: _mp.steps.map((s) => s.id), why: _mp.why };
                    // [v3.209.0] 一行读数**在恢复现场就地算**：此处 data 还是真载荷，
                    //   `line()` 的消费点因此有真源。刻意不在 selfCheck 里合成 `{schemaVersion: from}`
                    //   重算 —— 合成载荷会把「载荷无代际」与「代际不可解析」两类成因抹平，
                    //   而这两类处置完全不同（前者要人工确认结构，后者要修字段）。
                    res.migration.line = _SM.line(data, ARCHIVE_SCHEMA_VERSION);
                    if (_mp.verdict === 'plan') {
                        if (opts.migrate === true && typeof _SM.run === 'function') {
                            const _mr = _SM.run(data, { target: ARCHIVE_SCHEMA_VERSION, apply: true, plan: _mp });
                            res.migration.applied = _mr.applied;
                            res.migration.ok = _mr.ok;
                            res.migration.why = _mr.why;
                            // 迁移后的载荷继续走同一条恢复管线（单真源：不为迁移另开一条导入路径）
                            if (_mr.ok && _mr.payload) {
                                data = _mr.payload;
                                res.migrated = true;
                            } else {
                                // 迁移失败：**不继续恢复**（半套结构比不恢复更危险），把快照留给调用方决定
                                res.migration.snapshotAvailable = !!_mr.snapshot;
                                res.ok = false;
                                res.failed.push({ key: 'schemaMigration', error: _mr.why });
                                return res;
                            }
                        } else if (!dry) {
                            // 真实恢复但未授权迁移：必须让调用方看见「这个档是旧结构、需要迁移」
                            res.migration.needsAction = true;
                        }
                    }
                } else {
                    // 模块缺席**不伪装成「无需迁移」**：留 null + 诊断面报未加载
                    res.migration = null;
                }
            } catch (e) { errLog(e, 'restoreFromPayload.schemaMigration'); res.migration = { verdict: 'unknown', why: '迁移面异常：' + String(e?.message || e) }; }
            // [v3.209.0] 留档最后一次**结构代际**迁移读数：selfCheck「结构迁移」行的真源。
            //   命名纪律：刻意不叫 _lastMigrationReport —— 那个名字已被 v3.166 的**配置迁移**
            //   台账占用（ConfigManager.loadConfig 填充，回答「这次启动迁了哪些配置键」）。
            //   同名必须同义：配置键迁移与存档结构代际迁移是两件事，不得共用一个名字。
            //   模块缺席或载荷不可判时存 null（**不编默认值**：「没查过」与「查过没问题」必须可分）。
            this._lastSchemaMigration = res.migration ? Object.assign({ at: Date.now() }, res.migration) : null;
            // [v3.140] CP: 装载来源版本随恢复结果上报（v3.138 的 _dataVersion 字段判旧改道后只写不读，已删）
            res.loadedProducer = (typeof data.producerVersion === 'string' || typeof data.version === 'string') ? String(data.producerVersion || data.version) : null;
            // [v3.146] CP 原子提交边界：真实恢复前抓一份「改前全量快照」（collectExport 与
            // restoreFromPayload 是同一套契约键的对称原语，不另建快照系统）。仅在调用方
            // 显式 opts.snapshot 且开关开启时抓取。storage.load 刻意不抓：其失败回滚目标是「上一聊天
            // 残留的运行时」，把旧聊天数据装回新聊天比半套状态更危险（跨档污染）。
            let _pre = null;
            if (!dry && opts.snapshot === true && this.config.config.atomicRestoreEnabled !== false) {
                try { _pre = this.collectExport(); }
                catch (e) { errLog(e, 'restoreFromPayload.snapshot'); _pre = null; }
            }
            // [v3.142] CP 宽容解析（stbme round-trip 纪律）：未知顶层键不丢不炸，收进 extensions 命名空间随存档回写。
            const _ext = data.extensions && typeof data.extensions === 'object' ? data.extensions : null;
            if (!dry && _ext) { this._archiveExtensions = Object.assign({}, this._archiveExtensions || {}, _ext); }
            const _unknown = Object.keys(data).filter(k => !ARCHIVE_TOP_LEVEL_KEY_SET.has(k) && k !== 'exportedAt');
            res.unknown = _unknown;
            // [v3.261.0 缝合 MyriadKnots] 存档体检：在恢复现场就地做**三分判定**
            //   （活真源 / 可清理候选 / 保留），契约取本插件存档顶层键集合这一**现成真源**
            //   （ARCHIVE_TOP_LEVEL_KEY_SET，与上方 _unknown 判定同源，不另造第二份清单）。
            //   为什么就地算而不在 selfCheck 里合成：此处 data 还是真载荷——合成载荷会把
            //   「键不在册」与「值判不了」两类成因抹平，而两者处置完全不同。
            //   模块缺席 / 载荷不可判时留 null（**不编默认值**：「没查过」≠「查过没问题」）。
            try {
                const _AA = _archiveAuditLib();
                if (_AA && typeof _AA.classifyArchive === 'function') {
                    const _au = _AA.classifyArchive(data, ARCHIVE_TOP_LEVEL_KEY_SET);
                    if (_au && _au.ok === true) {
                        res.archiveAudit = {
                            verdict: _au.verdict,
                            active: _au.stats.active.count, cleanup: _au.stats.cleanup.count, retained: _au.stats.retained.count,
                            total: _au.stats.total.count, bytes: _au.stats.total.bytes,
                            cleanupKeys: _au.entries.filter((e) => e.verdict === 'cleanup').map((e) => e.key).slice(0, 12),
                            retainedKeys: _au.entries.filter((e) => e.verdict === 'retained').map((e) => e.key + '(' + e.reason + ')').slice(0, 12),
                            line: _AA.line(_au),
                        };
                    } else res.archiveAudit = { verdict: 'invalid-payload', why: _au?.reason || '未知' };
                } else res.archiveAudit = null;
            } catch (e) { errLog(e, 'restoreFromPayload.archiveAudit'); res.archiveAudit = { verdict: 'threw', why: String(e?.message || e) }; }
            this._lastArchiveAudit = res.archiveAudit ? Object.assign({ at: Date.now(), source: res.source }, res.archiveAudit) : null;
            if (!dry && _unknown.length) {
                const bag = this._archiveExtensions || (this._archiveExtensions = {});
                for (const k of _unknown) bag[k] = data[k];
                res.unknownPreserved = _unknown.length;
            }
            const _impKeys = [];   // [v3.236.0] R4-B：登记序号（只增不改序），与 _imp 的**调用序**逐位一致
            const _imp = (key, need, fn) => {
                _impKeys.push(key);
                if (data[key] == null) { res.skipped.push(key); return; }        // payload 无此字段
                if (!need) { res.missing.push(key); return; }                    // [v3.142] 有数据但引擎无对应模块：单列，不与「无数据」混为一谈
                if (dry) { res.restored.push(key); res.count++; return; }        // [v3.142] 预检只出计划，绝不写运行时
                try { fn(); res.restored.push(key); res.count++; }
                catch (e) { res.failed.push({ key, error: String(e?.message || e) }); errLog(e, 'restoreFromPayload.' + key); }
            };
            const engine = this;
            _imp('graph', !!engine.graph, () => engine.graph.import(data.graph));
            _imp('summaries', !!engine.summary, () => engine.summary.import(data.summaries));
            _imp('diaries', !!engine.diary, () => engine.diary.import(data.diaries));
            _imp('vectors', !!engine.vector, () => engine.vector.import(data.vectors));
            _imp('povs', !!engine.pov, () => engine.pov.import(data.povs));
            _imp('timeline', !!engine.timeline, () => engine.timeline.import(data.timeline));
            _imp('status', !!engine.status, () => engine.status.import(data.status));
            _imp('clock', !!engine.clock, () => engine.clock.import(data.clock));
            _imp('ledger', !!engine.ledger, () => engine.ledger.import(data.ledger));
            _imp('suspense', !!engine.suspense, () => engine.suspense.import(data.suspense));
            _imp('scene', !!engine.scene, () => engine.scene.import(data.scene));
            _imp('echo', !!engine.echo, () => engine.echo.import(data.echo));
            _imp('prequel', !!engine.prequel, () => engine.prequel.import(data.prequel));
            _imp('loreImportLedger', true, () => { if (data.loreImportLedger) engine._loreImportLedger = data.loreImportLedger; });
            _imp('qaThread', true, () => { if (data.qaThread) engine._qaThread = data.qaThread; });
            _imp('annualDrafts', true, () => { if (data.annualDrafts) engine._annualDrafts = data.annualDrafts; });
            _imp('canonAdoption', true, () => { if (data.canonAdoption) engine._canonAdoption = data.canonAdoption; });
            _imp('supersede', !!engine.supersede, () => engine.supersede.import(data.supersede));
            _imp('reflection', !!engine.reflection, () => engine.reflection.import(data.reflection));
            _imp('charMem', !!engine.charMem, () => engine.charMem.import(data.charMem));
            _imp('worldProg', !!engine.worldProg, () => engine.worldProg.import(data.worldProg));
            _imp('itemOps', true, () => {
                // [v3.155] 纵深：旧写法把外部存档的 data.itemOps 整体赋给真源（连长度/枚举/类型都不过）。
                //   改为校验后落盘；校验内核逐项宽容转换（能修就修），关卡关闭时逐位回退旧行为。
                const _raw = Array.isArray(data.itemOps) ? data.itemOps : [];
                const _vres = (engine.config && engine.config.config && engine.config.config.ledgerWriteValidationEnabled === false)
                    ? _raw.filter(o => o && o.name)
                    : validateLedgerItemOps(_raw, { fallbackFloor: 0 });
                // [v3.261.0 缝合 MyriadKnots] 忠实认领**证明**（只读，不改数据）。
                //   回答的是一个此前无人回答的问题：这份导入档里的物品 op，有多少**能证明**
                //   属于当前聊天、有多少判不了、判不了是哪种根因。
                //   为什么只证明不删：op 的失效清理**已有唯一真源**（optimizeMemory 的 3b 段
                //   按「fp 不在该楼任何 swipe 取值里」判定），在此再删一份就是第二份判据——
                //   两份判据一定漂移，且会先把「越界楼层」这类 pending 误删（3b 明确保留它们）。
                //   故本处产出的是**可查证明**：proved / unproved / 根因，供诊断面点名。
                //   op 与本聊天楼层的对应关系不能用 locator 段（op 只存 floor 号，不存页码），
                //   故把候选 locator 置为永不可能命中的负值，只让「全局唯一指纹对」段生效。
                let _claim = null;
                try {
                    const _FI = _floorIdentityLib();
                    const _chat = window.SillyTavern?.getContext?.()?.chat;
                    const _ops = (_vres.items || _vres);
                    if (_FI && typeof _FI.matchFloorCandidates === 'function' && Array.isArray(_chat) && _chat.length && _ops.length) {
                        const _entries = _chat.map((m, i) => {
                            const _sw = Math.max(0, Math.round(Number(m?.swipe_id) || 0));
                            const _fp = msgFpOf(m);
                            return { id: 'floor:' + i, hostLocator: { messageIndex: i, swipeId: _sw, selectedSwipeIndex: _sw }, content: { canonicalFingerprint: _fp, rawFingerprint: _fp } };
                        });
                        const _candidates = _ops.map((o) => {
                            const _fp = String(o?.fp || '');
                            return { hostLocator: { messageIndex: -1, swipeId: -1, selectedSwipeIndex: -1 }, canonicalFingerprint: _fp, rawFingerprint: _fp, messageAnchor: { status: 'none' } };
                        });
                        const _m = _FI.matchFloorCandidates(_entries, _candidates);
                        _claim = {
                            at: Date.now(),
                            ops: _ops.length,
                            floors: _entries.length,
                            proved: _m.matches.length,
                            unproved: _m.unmatchedCandidateIndexes.length,
                            issue: _m.issue ? _m.issue.code : null,
                            line: _FI.line(_m),
                        };
                    }
                } catch (e) { errLog(e, 'restoreFromPayload.itemOpsClaim'); _claim = null; }
                engine._lastItemOpsClaim = _claim;
                engine.itemOps = _vres.items || _vres;
                if (_vres.violations && _vres.violations.length) engine._recordLedgerViolations?.(_vres.violations, 'import', 0);
                (engine.reconcileItemOps || engine.rebuildItems)?.call(engine);
            });
            _imp('narrativeEntropy', typeof data.narrativeEntropy === 'number', () => { engine._narrativeEntropy = data.narrativeEntropy; });
            _imp('stmLtm', !!engine.stmLtm, () => { engine._stmLtmState = engine.stmLtm.normalizeState(data.stmLtm); });
            _imp('recallArtifacts', Array.isArray(data.recallArtifacts), () => { engine._recallArtifacts = data.recallArtifacts.slice(-32); });
            _imp('diaryInjectFloor', Number.isFinite(Number(data.diaryInjectFloor)), () => { engine._diaryInjectFloor = Number(data.diaryInjectFloor); });   // [v3.140] 保留 v3.138 的数值守卫，脏值不写成 NaN
            _imp('timelineInjectFloor', Number.isFinite(Number(data.timelineInjectFloor)), () => { engine._timelineInjectFloor = Number(data.timelineInjectFloor); });
            _imp('timelineCursorChatId', true, () => { engine._timelineCursorChatId = String(data.timelineCursorChatId); });
            _imp('timelineCursorFingerprint', true, () => { engine._timelineCursorFingerprint = String(data.timelineCursorFingerprint); });
            _imp('deltaBook', !!engine.deltaBook, () => engine.deltaBook.import(data.deltaBook));
            _imp('cse', !!engine.cse, () => engine.cse.import?.(data.cse));
            _imp('pulse', !!engine.pulse, () => engine.pulse.import?.(data.pulse));
            _imp('outline', !!engine.outline, () => engine.outline.import?.(data.outline));
            _imp('pairMem', !!engine.pairMem, () => engine.pairMem.import?.(data.pairMem));
            _imp('moneyLedger', !!engine.moneyLedger, () => engine.moneyLedger.import?.(data.moneyLedger));
            _imp('cards', !!engine.cards, () => engine.cards.import?.(data.cards));
            _imp('conflicts', !!engine.conflicts, () => engine.conflicts.import?.(data.conflicts));
            _imp('opLog', !!engine.opLog, () => engine.opLog.import?.(data.opLog));
            // 直赋：summary.import 会重置其他字段，不可复用
            _imp('lockedFacts', Array.isArray(data.lockedFacts), () => { engine.summary.lockedFacts = data.lockedFacts.slice(); });
            _imp('recallSourceStats', typeof data.recallSourceStats === 'object', () => { engine._recallSourceStats = data.recallSourceStats; });
            _imp('lexicon', !!engine.lexicon, () => { engine.lexicon.import?.(data.lexicon); engine._invalidateBm25Corpus?.(); });
            // [v3.194] 三面新账：各自独立捕获（单面坏不连坐其余两面）
            _imp('factVersions', data.factVersions != null, () => { engine._factVersionState = _factVersionLib()?.normalize?.(data.factVersions) || null; });
            _imp('eventThreads', data.eventThreads != null, () => { engine._eventThreadState = _eventCompletenessLib()?.normalize?.(data.eventThreads) || null; });
            _imp('repairLog', data.repairLog != null, () => { engine._repairState = _repairLoopLib()?.normalize?.(data.repairLog) || null; });
            _imp('timeWentBack', typeof data.timeWentBack === 'object', () => { engine._timeWentBack = { ...data.timeWentBack }; });
            // 地面真源：只回填不回退（本地更新者保持自己的计数）
            _imp('lastSave', data.lastSave && typeof data.lastSave === 'object' && Number(data.lastSave.ts) > Number((engine._lastSaveGroundTruth || {}).ts || 0), () => {
                engine._lastSaveGroundTruth = { ts: Number(data.lastSave.ts) || 0, floor: Number(data.lastSave.floor ?? -1), sources: { ...(data.lastSave.sources || {}) } };
            });
            res.ok = res.failed.length === 0;
            // [v3.146] CP 原子提交边界：部分失败 = 运行时处于「半套状态」（导入档部分生效、
            // 原档其余残留），此前只上报不补救。现在自动回滚到恢复前快照，让失败成为
            // 唯一可发生的结果。回滚自身走同一单真源管线且不带 snapshot/原子标志，杜绝递归。
            if (!res.ok && _pre && this.config.config.atomicRestoreEnabled !== false) {
                try {
                    const rb = this.restoreFromPayload(_pre, { source: 'auto-rollback:' + res.source });
                    res.rolledBack = rb.count > 0;
                    res.rollback = { restored: rb.count, failed: rb.failed.length };
                    if (rb.count === 0) res.rollbackWarning = '自动回滚未恢复任何字段，运行时可能仍为半套状态';
                    console.warn(`[${PLUGIN_NAME}] ⚠ 恢复部分失败（${res.failed.map(f => f.key).join('/')}），已自动回滚至恢复前快照（${rb.count} 字段）`);
                } catch (e) {
                    res.rolledBack = false;
                    res.rollbackError = String(e?.message || e);
                    errLog(e, 'restoreFromPayload.rollback');
                }
            }
            /* [v3.236.0] R4-B：**曾经被恢复进来的面**的累积账（键历史，跨载荷、跨快照）。
             *   存在理由：`res.registered` 只回答「这一次登记了哪些面」，而清空面板要问的是
             *   「历史上装进来过的面，清空面覆盖得住吗」—— 快照/导入可以只带字段子集，
             *   只用本次载荷的键集合会漏判（这次没带的字段，历史上可能已经装进来过）。
             *   归零点与会话身份同步（构造期 + CHAT_CHANGED），与 `_snapshotAnchorChatId` 同一纪律。 */
            try {
                if (!(this._restoredKeyHistory instanceof Set)) this._restoredKeyHistory = new Set();
                for (const _k of _impKeys) this._restoredKeyHistory.add(_k);
                res.everRestored = Array.from(this._restoredKeyHistory);
            } catch (e) { errLog(e, 'restoreFromPayload.everRestored'); }
            this._lastRestore = res;
            // [v3.236.0] R4-B：把**登记过的恢复键**随结果外供。
            //   存在理由：v3.23 的嵌入恢复按钮缺失、v3.136 前 UI 导入丢新键，都是
            //   「恢复/清空这类成套动作各自手抄一份清单」的产物。清空面板要收编，就必须
            //   问得出一句「恢复面到底有哪几面」—— 让答案来自**登记点自身**，而不是再抄一遍。
            //   `res.restored`/`failed`/`missing` 是**本次载荷的结局**（无此字段即 skipped），
            //   与「登记了什么」不是一回事，故单列一个字段，不重用名单。
            res.registered = _impKeys;
            return res;
        }
        /**
         * [v3.236.0] R4-B 缺口 1 的修法本体：**从快照恢复（两阶段 + 闸门在引擎侧）**。
         *
         * 为什么必须住在引擎侧、而不是写成面板里的两行 `if`：本仓 v3160 [1b] 要求
         *   「每个默认配置键必须在默认配置块之外有消费点」—— `snapshotPrecheckEnabled`
         *   的读点若落在 settings-ui.js，这个键在 index.js 里就是**死配置**（门禁当场翻红，
         *   而翻红是对的：UI 侧读点不参与引擎行为，测试替不掉它）。
         *
         * 两阶段的边界（与 v3.142 的 dryRun 契约逐字对齐）：
         *   · 预检**只读**：`dryRun` 分支保证不清确认、不推栅栏、不动 _archiveExtensions、
         *     不抓快照 —— 这里**不再自己实现一份**，否则就是第二真源；
         *   · 预检发现「无可恢复内容」⇒ 在**任何写盘之前**返回 `applied:false`，
         *     面板据此拦住、不落盘（修前会把「恢复了个空」写进存档）；
         *   · 真恢复带 `snapshot:true` ⇒ v3.146 的部分失败自动回滚仍然生效（不留半套）；
         *   · 闸门关闭时**跳过的只是预检，不是恢复**（关的是那一步只读校验）。
         *
         * 刻意不返回 `count` 这类裸数字给面板去猜：`applied` / `reason` 是可判定的三态，
         *   面板只播报、不判断（判断都留在这一处）。
         * @returns {{ok:boolean, applied:boolean, reason:string, precheck:(object|null), result:(object|null), chatId:(string|null)}}
         */
        restoreFromSnapshot(chatId, payload) {
            const res = { ok: false, applied: false, reason: '', precheck: null, result: null, chatId: chatId || null };
            if (!payload || typeof payload !== 'object') { res.reason = 'invalid-payload'; return res; }
            const cfg = (this.config && this.config.config) ? this.config.config : {};
            const gate = cfg.snapshotPrecheckEnabled !== false;   // 默认开可关（读点必须在引擎侧，见上）
            if (gate) {
                const pre = this.restoreFromPayload(payload, { source: 'snapshot-precheck', dryRun: true });
                res.precheck = { count: pre.count, skipped: pre.skipped.length, missing: pre.missing.length, failed: pre.failed.length };
                if (pre.count === 0) { res.reason = 'empty-snapshot'; return res; }
            }
            const rn = this.restoreFromPayload(payload, { source: 'snapshot-restore', snapshot: true });
            res.result = rn;
            if (!rn || rn.count === 0) { res.reason = 'empty-snapshot'; return res; }
            res.applied = true;
            res.ok = rn.ok !== false;
            return res;
        }
        /**
         * [v3.236.0] R4-B：**快照恢复的完整流程**（读快照 → 两阶段恢复 → 落盘）。
         *
         * 为什么连「读快照」与「落盘」也住在引擎侧、而不是留在面板里：
         *   面板此前持有流程的三段（`snapshots.restore` / `restoreFromSnapshot` /
         *   `storage.save`），每留一段就多一处「流程到底谁说了算」的暗面；更要紧的是
         *   `snapshotPrecheckEnabled` 的消费点必须落在**真实调用链**上 ——
         *   v3160 [1b] 要求「每个声明键在默认配置块之外有消费点」，D1 活性判据把它实现为
         *   两跳可达性（键 → 提及键的方法 → 该方法**有调用者**）。流程不下沉时，
         *   闸门读点所在的 `restoreFromSnapshot` 零调用者，声明键就成了死配置（实测红）。
         *
         * 三态（面板只播报、不判断）：
         *   · `{ok:false, reason}`    —— 没做成（无对话 / 快照读不出），**不要落盘**；
         *   · `{ok:true, applied:false}` —— 做成了但没动数据（空快照），**不要落盘**；
         *   · `{ok:true, applied:true}`  —— 恢复完成，且**已经落盘**（落盘发生在返回之前）。
         * @returns {Promise<{ok:boolean, applied:boolean, reason:string, precheck:(object|null), result:(object|null), chatId:(string|null)}>}
         */
        async restoreSnapshotFlow(chatId, floor) {
            const cid = chatId || this.getCurrentChatId();
            if (!cid) return { ok: false, applied: false, precheck: null, result: null, chatId: null, reason: '无可用对话' };
            const data = await this.snapshots.restore(cid, floor);
            if (!data) return { ok: false, applied: false, precheck: null, result: null, chatId: cid, reason: '快照数据为空' };
            const rs = this.restoreFromSnapshot(cid, data);
            if (!rs.applied) {
                return {
                    ok: true, applied: false, chatId: cid,
                    precheck: rs.precheck || null, result: rs.result || null,
                    reason: rs.reason === 'empty-snapshot'
                        ? '该快照无可恢复内容，当前记忆保持不变（未落盘）'
                        : '快照载荷无效，当前记忆保持不变（未落盘）'
                };
            }
            /* 落盘时机刻意留在流程内：面板「先判断后落盘」的顺序曾经是本版要修的缺陷形状
             *   （空快照被写进存档）。把它放在这里，顺序就不依赖调用方的自觉。 */
            await this.storage.save(cid, this.collectExport());
            return { ok: true, applied: true, reason: '', precheck: rs.precheck || null, result: rs.result || null, chatId: cid };
        }
        /**
         * [v3.236.0] R4-B：快照恢复菜单的**行构造**（纯函数：无 DOM、无副作用、无引擎状态读取）。
         *
         * 为什么放引擎侧而不是留在面板：面板手里的 HTML 是「恢复菜单长什么样」这份知识，
         *   而它与「哪些楼层能恢复」紧紧相邻（同一份 `snaps` 读数）。两份知识分开两处，
         *   下一次改菜单就得同时记住面板与引擎 —— 这正是本版反复在治的漂移形状。
         * @returns {string} 菜单行 HTML（空数组 ⇒ 空串）
         */
        snapshotRestoreMenu(snaps) {
            return (Array.isArray(snaps) ? snaps : []).map(s => {
                const time = new Date(s.timestamp).toLocaleString();
                return '<div class="lsm-item" data-floor="' + s.floor + '" style="display:flex;justify-content:space-between;">'
                    + '<span>楼层 ' + s.floor + '</span>'
                    + '<span style="color:var(--ls-text-2,#9da7b3);font-size:12px;">' + time + '</span>'
                    + '</div>';
            }).join('');
        }

        /**
         * [v3.236.0] R4-B 缺口 3：**清空运行内存（收编入口）** —— 把「清空当前对话全部记忆」
         * 从设置面板的一段手抄赋值搬到这里，改成**逐面登记**。
         *
         * 修前的形状（实测，可复算）：面板 `#ls-clear` 处理器手抄清空 16 个模块，
         * 而 `restoreFromPayload` 登记了 **42** 个恢复面 —— 其中**模块路径的 16 个面**
         * 从未被清空触达（`cards / charMem / clock / conflicts / cse / deltaBook / lexicon /
         * moneyLedger / opLog / outline / pairMem / prequel / pulse / stmLtm / supersede / worldProg`）。
         * 它们的清空路径从来没有代码（grep 实证：这些类的 `items=[]` / `.clear()` 在其
         * 类体内零代码命中），而清空末尾的 `collectExport()` 是**全量序列化** ——
         * 于是用户看到「已清空」，这 16 个面却原样落盘，换个对话再回来又全在。
         *
         * 本方法只做**一件事**：把 B 段那些写动作执行一遍，逐面记录结局，返回读数。
         * 为什么读数必须有名字（`perFace` 带 face/id/label/ok/error）：`this.engine.graph.nodes.clear()`
         * 这种赋值语句**抛不出错也留不下痕**，一个面没清干净时调用方只能看到一个 toCatch；
         * 本仓的既有写法是「失败必须点名、跳过必须计数」（见 restoreFromPayload 的
         * failed/missing/unknown 三态）。这里把同一口径落到清空面：**每面非 ok 即具名**。
         *
         * 刻意**不在本方法里存盘**：存盘的调用点只有一个（面板处理器），让「清空」是
         * 纯内存动作、可被测试逐字节比对（与 R4-A 的「预览是纯读」同一纪律的镜像面：
         * 这里是「清空是纯内存，落盘是调用方的自觉且只有一处」）。
         *
         * 覆盖边界（如实声明，不假装穷尽）：本方法只清**运行时内存** —— 快照库（IndexedDB）、
         * 嵌入存档（chatMetadata）、紧急备份是**恢复退路**，清空它们等于销毁用户唯一的回滚手段，
         * 故不在此列（面板文案与 runFaceReport 的行文案都据此写）。
         * @returns {{ok:boolean, cleared:string[], skipped:string[], failed:Array<{face:string,error:string}>, count:number, at:number}}
         */
        clearRuntimeMemory() {
            const res = { ok: true, cleared: [], skipped: [], failed: [], count: 0, at: Date.now() };
            const e = this;
            const A = (face, id, label, need, fn) => {
                if (!need) { res.skipped.push(face + ':' + id); return; }
                try { fn(); res.cleared.push(face + ':' + id); res.count++; }
                catch (err) { res.failed.push({ face: face, id: id, label: label, error: String(err && err.message || err) }); const er = e.errLog || (typeof errLog === 'function' ? errLog : null); if (er) er(err, 'clearRuntimeMemory.' + face + '.' + id); }
            };
            /* ── 模块面：与 restoreFromPayload 的模块面逐条同源（同序、同名、同判据）──
             *   顺序刻意与 restoreFromPayload 的 `_imp(...)` 调用序一致：两处对照时不必心算映射。 */
            A('module', 'graph', '图谱', !!e.graph, () => { e.graph.nodes.clear(); e.graph.edges.clear(); e.graph.nameIndex.clear(); });
            A('module', 'summaries', '摘要', !!e.summary, () => { e.summary.import([]); e.summary.lockedFacts = []; });
            A('module', 'diaries', '日记', !!e.diary, () => { e.diary.import({}); e.diary._lastDiaryFloor = -1; });
            A('module', 'vectors', '向量', !!e.vector, () => { e.vector.import([]); });
            A('module', 'povs', 'POV', !!e.pov, () => { e.pov.import([]); });
            A('module', 'timeline', '时间线', !!e.timeline, () => { e.timeline.import([]); });
            A('module', 'status', '人物状态', !!e.status, () => { e.status.import({ characters: {} }); });
            A('module', 'clock', '时钟', !!e.clock, () => { e.clock.import({}); });
            A('module', 'ledger', '楼层账本', !!e.ledger, () => { e.ledger.import({}); });
            A('module', 'suspense', '悬念', !!e.suspense, () => { e.suspense.import([]); });
            A('module', 'scene', '场景', !!e.scene, () => { if (typeof e.scene.clear === 'function') e.scene.clear(); else e.scene.import({}); });
            A('module', 'echo', '回响池', !!e.echo, () => { e.echo.import([]); });
            A('module', 'prequel', '前情资料', !!e.prequel, () => { if (typeof e.prequel.clearPrequel === 'function') e.prequel.clearPrequel(); else e.prequel.import({}); });
            A('module', 'supersede', '记忆取代', !!e.supersede, () => { e.supersede.import({ supersededMap: {} }); });
            A('module', 'reflection', '反思', !!e.reflection, () => { e.reflection.import([]); });
            A('module', 'charMem', '角色记忆', !!e.charMem, () => { e.charMem.import({}); });
            A('module', 'worldProg', '世界推进', !!e.worldProg, () => { e.worldProg.import({}); });
            A('module', 'itemOps', '物品账', true, () => { e.itemOps = []; (e.reconcileItemOps || e.rebuildItems)?.call(e); });
            A('module', 'deltaBook', '正史增量', !!e.deltaBook, () => { e.deltaBook.import({ deltas: [] }); });
            A('module', 'cse', '人物状态引擎', !!e.cse, () => { e.cse.import({}); });
            A('module', 'pulse', '叙事心电图', !!e.pulse, () => { e.pulse.import({}); });
            A('module', 'outline', '大纲导演', !!e.outline, () => { e.outline.import({}); });
            A('module', 'pairMem', '群像记忆', !!e.pairMem, () => { e.pairMem.import({ pairs: [] }); });
            A('module', 'moneyLedger', '钱财账本', !!e.moneyLedger, () => { e.moneyLedger.import({}); });
            A('module', 'cards', '卡牌', !!e.cards, () => { e.cards.import({ cards: [] }); });
            A('module', 'conflicts', '矛盾账本', !!e.conflicts, () => { e.conflicts.import({ conflicts: [] }); });
            A('module', 'opLog', '操作日志', !!e.opLog, () => { e.opLog.import({}); });
            A('module', 'lexicon', '术语词典', !!e.lexicon, () => { e.lexicon.import([]); if (typeof e._invalidateBm25Corpus === 'function') e._invalidateBm25Corpus(); });
            /* ── 直赋面：这些键没有独立模块，状态就在宿主字段上（与 restoreFromPayload 同源）──
             *   与模块面的区别只在于写法的必然性，不改变「一面一登记」的纪律。 */
            A('direct', 'narrativeEntropy', '叙事熵', true, () => { e._narrativeEntropy = 0; });
            A('direct', 'stmLtm', '短期长期记忆', !!e.stmLtm, () => { e._stmLtmState = (e.stmLtm && typeof e.stmLtm.normalizeState === 'function') ? e.stmLtm.normalizeState(null) : null; });
            A('direct', 'recallArtifacts', '召回产物', true, () => { e._recallArtifacts = []; });
            A('direct', 'diaryInjectFloor', '日记注入游标', true, () => { e._diaryInjectFloor = null; });
            A('direct', 'timelineInjectFloor', '时间线注入游标', true, () => { e._timelineInjectFloor = null; });
            A('direct', 'timelineCursorChatId', '时间线游标身份', true, () => { e._timelineCursorChatId = null; });
            A('direct', 'timelineCursorFingerprint', '时间线游标指纹', true, () => { e._timelineCursorFingerprint = ''; });
            A('direct', 'lockedFacts', '锁定事实', !!(e.summary && Array.isArray(e.summary.lockedFacts)), () => { e.summary.lockedFacts = []; });
            A('direct', 'recallSourceStats', '召回来源统计', true, () => { e._recallSourceStats = { total: 0, bySource: {} }; });
            A('direct', 'factVersions', '事实版本账', true, () => { e._factVersionState = null; });
            A('direct', 'eventThreads', '事件线账', true, () => { e._eventThreadState = null; });
            A('direct', 'repairLog', '修复闭环台账', true, () => { e._repairState = null; });
            A('direct', 'timeWentBack', '时间回退留痕', true, () => { e._timeWentBack = null; });
            A('direct', 'lastSave', '保存地面真源', true, () => { e._lastSaveGroundTruth = null; });
            /* [v3.339.0 · M4-X1] 资料导入账 / [v3.340.0 · M4-X4] 追问线程：与 restoreFromPayload
             *   的两个还原分支（loreImportLedger / qaThread）同源（两侧按**键名**对齐，
             *   缺口 3「恢复面有、清空面没有」由 v3236 D1 当场照出）。 */
            A('direct', 'loreImportLedger', '资料导入账', true, () => { e._loreImportLedger = null; });
            A('direct', 'qaThread', '追问线程', true, () => { e._qaThread = null; });
            A('direct', 'annualDrafts', '成稿草稿册', true, () => { e._annualDrafts = null; });
            A('direct', 'canonAdoption', '落卷凭据', true, () => { e._canonAdoption = null; });
            res.ok = res.failed.length === 0;
            this._clearRuntimeReport = res;
            return res;
        }
        /**
         * [v3.236.0] R4-B：**恢复面 ↔ 清空面**的覆盖核对（可机检，不必靠人读两份清单）。
         *
         * 为什么要有这一条：缺口 3 的形状是「两份手抄清单必然漂移」——面板清空时抄了 16 面，
         * 而恢复面有 42 面。漂移本身不可怕，可怕的是它**无声**（用户看到「已清空」、落盘却是全量）。
         * 本方法把「谁没被清空」变成一个有名字、有数、可被测试逐字断言的读数。
         *
         * 三态口径（与 restoreFromPayload 一致：**「没查过」≠「查过没问题」**）：
         *   · 恢复面模块从未加载（`_imp` 把它们记进 `missing`）⇒ 清空侧记 `skipped`，**不算漏**；
         *   · 载荷无此字段（`skipped`）⇒ 同上；
         *   · 其余（本次真恢复过的 + 部分失败的）都必须能在清空面找到对应写动作。
         * 已知边界（如实记录）：`lastSave` 的地面真源语义是「只进不退」，清空侧把它置 null；
         *   `recallSourceStats` / `factVersions` / `eventThreads` / `repairLog` / `timeWentBack`
         *   同样是宿主直赋字段。这五个在恢复侧是**直赋**而不是模块 `import`，两侧的
         *   「同一面」判定按**键名**（而非路径）成立 —— 键名是契约（ARCHIVE_TOP_LEVEL_KEYS），
         *   路径是实现；按路径比对会把「换了实现写法」误报成「漏了一面」。
         *   · `everRestored` 是**三态的入口**：从来没有一次真恢复（`_lastRestore` 为 null）
         *   ⇒ `everRestored:false`，此时 `ok` 不表示「对得上」，只表示「没有证据说对不上」。
         * @returns {{everRestored:boolean, restoredKeys:string[], clearFaces:string[], missingInClear:string[], skippedInRestore:string[], ok:boolean}}
         */
        snapshotClearCoverage() {
            const rest = this._lastRestore || null;
            const registered = (rest && Array.isArray(rest.registered)) ? rest.registered.slice() : [];
            /* ★ 三态的**第三态**（本轮补实现，注释早就承诺、实现一直缺）：`everRestored`。
             *   修前形状：`_lastRestore` 为 null ⇒ restoredKeys 空 ⇒ missingInClear 空 ⇒ `ok:true`，
             *   于是「**一次恢复都没做过**」与「恢复面全被清空面覆盖」在读数上**同形**。
             *   判据写 `cov.everRestored` 时读到 undefined、断言静默跳过（v3236 C3 的测试名
             *   早就在等这个字段）。这与 v3.166「sources 与 attempts 必须分家」是同一条纪律：
             *   **「没查过」不等于「查过没问题」**。 */
            const hist = (rest && Array.isArray(rest.everRestored) && rest.everRestored.length)
                ? rest.everRestored.slice()
                : ((this._restoredKeyHistory instanceof Set) ? Array.from(this._restoredKeyHistory) : []);
            const everRestored = !!(hist && hist.length);
            /* 键集合口径：有累积账时用**累积账**（快照/导入可只带字段子集，用本次载荷的键
             *   会漏判「历史上装进来过、这次没带」的面）；无累积账时退回本次登记。 */
            const restoredKeys = everRestored ? hist : registered;
            const skippedKeys = (rest && Array.isArray(rest.skipped)) ? rest.skipped.slice() : [];
            const rep = this._clearRuntimeReport || null;
            const clearFaces = rep ? rep.cleared.concat(rep.skipped).map(x => String(x).split(':').slice(1).join(':')) : [];
            const skippedSet = new Set(skippedKeys);
            const faceSet = new Set(clearFaces);
            const missingInClear = restoredKeys.filter(k => !faceSet.has(k) && !skippedSet.has(k));
            return { everRestored: everRestored, restoredKeys: restoredKeys, clearFaces: clearFaces, missingInClear: missingInClear, skippedInRestore: skippedKeys, ok: missingInClear.length === 0 };
        }
        getCurrentChatId() {
            try {
                const c = window.SillyTavern?.getContext?.();
                return c?.chatId || c?.chatMetadata?.file_name || null;
            } catch { return null; }
        }
        /**
         * [v3.236.0] R4-B 缺口 2 的修法本体：**按会话身份的定期快照锚点**。
         *
         * 契约（调用点是 `onMessageReceived` 的定期快照分支）：
         *   · `chatId` 与调用点外层那个 `const chatId` 是**同一个读数**（调用点传参，不各自再取一次）；
         *   · 身份不符（或还没有身份）⇒ 把锚点**重置为 0** 并返回 `fresh:true`；
         *   · 身份相同 ⇒ 返回现锚点与 `fresh:false`；
         *   · `chatId` 为空 ⇒ 不建身份、不重置，返回 `fresh:false`（拿不到会话就不该记「谁存的」）。
         *
         * 为什么「身份不符」要 reset 成 0、而不是保留旧楼层：保留旧楼层就是保留那个 bug。
         *   reset 之后 `fresh:true` 让新会话先落**一份**快照（与从未快照过的会话逐字同形），
         *   再按 `curFloor - 0` 正常节流 —— 于是「B 会话永无快照」这个形状在结构上不可能再出现。
         * @returns {{fresh:boolean, floor:number, chatId:(string|null)}}
         */
        _snapshotAnchorOf(chatId) {
            const id = (chatId === undefined || chatId === null) ? '' : String(chatId);
            if (!id) return { fresh: false, floor: Number(this._snapshotAnchorFloor) || 0, chatId: this._snapshotAnchorChatId || null };
            if (this._snapshotAnchorChatId !== id) {
                this._snapshotAnchorChatId = id;
                this._snapshotAnchorFloor = 0;
                return { fresh: true, floor: 0, chatId: id };
            }
            return { fresh: false, floor: Number(this._snapshotAnchorFloor) || 0, chatId: id };
        }
        /* ────────────────────────────────────────────────────────────────
         * [v3.237.0] R4-C：**命名检查点 + 分支只读对照**（引擎侧接线）
         *
         * 为什么接线住在这里而不是面板里：R4-B 刚把「面板持一段流程」当作缺陷形状收过一次
         *   （快照恢复的读/写两段下沉引擎）。检查点是同一形状的延伸 —— 若面板自己
         *   `localStorage.getItem` + `JSON.parse`，就是第二处「检查点长什么样」的知识，
         *   而 v3160 [1b] 的活性判据也会把这些方法判成零调用者。
         *
         * 边界（三条，逐条对齐模块头的声明）：
         *   · 引擎**不自己算键面差异**：`compareBranchCheckpoints` / `previewCheckpointRestore`
         *     把对照交给 `snapshot-checkpoint.js`（同一口径只许一份实现）；
         *   · 引擎**不执行恢复**：预览只出计划，真落地仍走 `restoreFromPayload` 那一条管线；
         *   · 引擎**不编会话身份**：`chatId` 缺省取 `getCurrentChatId()`，取不到即如实报。
         * ──────────────────────────────────────────────────────────────── */
        /**
         * [v3.237.0] R4-C：检查点存储口（唯一）。
         *   形状判定只许存在一处：直接调 `snapshot-checkpoint.js` 的 `fromLocalStorage()`，
         *   **不在此重写** `length` + `key(i)` 判断（那个判断在模块里，且被 A5 判据看住）。
         * @returns {object|null} 契约形状；宿主无 localStorage / 模块未加载 / 形态不合 ⇒ null
         */
        checkpointStore() {
            try {
                const CP = _moduleLib(() => window.LonShaSnapshotCheckpoint, 'snapshot-checkpoint.js');
                if (!CP || typeof CP.fromLocalStorage !== 'function') return null;
                if (typeof localStorage === 'undefined' || !localStorage) return null;
                return CP.fromLocalStorage(localStorage);
            } catch (e) { errLog(e, 'checkpointStore'); return null; }
        }
        /** [v3.237.0] R4-C：模块取库口（与其余模块同契约：真读表达式 + 文件名）。 */
        _checkpointLib() {
            return _moduleLib(() => window.LonShaSnapshotCheckpoint, 'snapshot-checkpoint.js');
        }
        /**
         * [v3.239.0] 「没给」与「给了 0」的分界口（引擎侧，**不带符号过滤**）。
         *
         * 与 `snapshot-checkpoint.js` 的 `numOrNull` **同判据**，且刻意各留一份：
         *   模块不加载时这一处仍要能工作（否则「模块未加载」会让楼层判据跟着失守）。
         *   为什么值得单列：`Number(null) === 0`、`Number(undefined) === NaN` 之外的
         *   一大票「没给」（空串 / 布尔 / 对象）都能骗过 `Number.isFinite(Number(x))`
         *   —— 于是「我不知道这是第几楼」会被念成「第 0 楼」，本仓最贵的那类错读数。
         *   本文件的**所有**「外部来的数」判据一律走它（展示层同族修复在 v3.239.0 一并落地：
         *   4 个文案口此前也写成 `Number.isFinite(Number(x))`，会把 `null` 显示成 1970 / 第 0 楼）。
         * @returns {number|null}
         */
        _numOrNull(v) {
            if (v === null || v === undefined) return null;
            if (typeof v === 'string' && v.trim() === '') return null;
            /* 布尔刻意不接受（true 与 1 不是一回事）；对象/数组/函数一律 null ——
             *   它们能骗过旧判据（Number([]) 恒为 0），正是本版要断的那条路。 */
            if (typeof v === 'boolean' || typeof v === 'object' || typeof v === 'function') return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        }
        /**
         * [v3.239.0] 楼层专用的分界口：在 `_numOrNull` 之上再拒负值。
         *   负楼层不是合法位置（`_currentFloor` 的 **-1** 表示「还没进楼层」，
         *   它被当成楼层念出去就是「第 -1 楼」）。
         * @returns {number|null}
         */
        _floorOrNull(v) {
            const n = this._numOrNull(v);
            return (n !== null && n >= 0) ? n : null;
        }
        /**
         * [v3.237.0] R4-C：存一份命名检查点。
         *   载荷默认取 `collectExport()`（与恢复侧同一套契约键，不另建形状）。
         * @returns {{ok:boolean, reason:string, name:(string|null), at:(number|null),
         *   meta:(object|null), overwritten:boolean, previousAt:(number|null),
         *   evicted:(string[]|null), count:(number|null)}}
         */
        saveCheckpoint(name, opts) {
            const o = opts || {};
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            const bad = (reason) => ({ ok: false, reason: reason, name: null, at: null, meta: null, overwritten: false, previousAt: null, evicted: null, count: null });
            if (!CP || typeof CP.saveCheckpoint !== 'function') return bad('模块未加载');
            if (!store) return bad('宿主无可用存储');
            const cid = o.chatId || this.getCurrentChatId();
            let payload = o.payload;
            if (!payload) {
                try { payload = this.collectExport(); }
                catch (e) { errLog(e, 'saveCheckpoint.collectExport'); return bad('载荷生成失败：' + String(e && e.message || e)); }
            }
            /* [v3.239.0] 同族修：`o.floor` 显式 null / 空串算「没给」，回落当前楼层；
             *   而 `_currentFloor` 初始化是 **-1**（「还没进任何楼层」），它不是合法楼层，
             *   故此处只接受 **>= 0** 的读数 —— 否则面板会把「第 -1 楼」念给用户。 */
            const _fo = (typeof this._floorOrNull === 'function') ? this._floorOrNull(o.floor) : o.floor;
            const _cf = (typeof this._floorOrNull === 'function') ? this._floorOrNull(this._currentFloor) : this._currentFloor;
            const floor = (_fo !== null && _fo !== undefined) ? _fo
                : ((typeof _cf === 'number' && _cf >= 0) ? _cf : null);
            const r = CP.saveCheckpoint(store, { chatId: cid, name: name, payload: payload, at: o.at, floor: floor, note: o.note });
            return {
                ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, name: r.name, at: r.at, meta: r.meta,
                overwritten: r.overwritten, previousAt: r.previousAt, evicted: r.evicted, count: r.count
            };
        }
        /** [v3.237.0] R4-C：列本会话检查点（只读）。`items === null` 与 `[]` 语义不同（见模块头）。 */
        listCheckpoints(chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.listCheckpoints !== 'function') return { ok: false, reason: '模块未加载', items: null };
            const r = CP.listCheckpoints(store, chatId || this.getCurrentChatId());
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, items: r.items };
        }
        /** [v3.237.0] R4-C：读一份检查点（只读）。 */
        readCheckpoint(name, chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.readCheckpoint !== 'function') return { ok: false, reason: '模块未加载', record: null };
            const r = CP.readCheckpoint(store, chatId || this.getCurrentChatId(), name);
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, record: r.record };
        }
        /** [v3.237.0] R4-C：删一份检查点（幂等；只删本插件命名空间下的键）。 */
        dropCheckpoint(name, chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.dropCheckpoint !== 'function') return { ok: false, reason: '模块未加载', existed: false };
            const r = CP.dropCheckpoint(store, chatId || this.getCurrentChatId(), name);
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, existed: r.existed };
        }
        /**
         * [v3.237.0] R4-C：**恢复预览**（只读）—— 检查点相对当前运行时会带来什么差异。
         *   刻意只出计划：真落地仍走 `restoreFromPayload`（单真源，不为检查点开第二条导入路径）。
         */
        previewCheckpointRestore(name, chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.previewRestore !== 'function') return { ok: false, reason: '模块未加载', diff: null, plan: null };
            let cur = null;
            try { cur = this.collectExport(); } catch (e) { errLog(e, 'previewCheckpointRestore.collectExport'); }
            const r = CP.previewRestore(store, chatId || this.getCurrentChatId(), name, cur);
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, diff: r.diff, plan: r.plan };
        }
        /** [v3.237.0] R4-C：**分支只读对照**（两份检查点并排比，零写、不切分支、不合并）。 */
        compareBranchCheckpoints(nameA, nameB, chatId) {
            const CP = this._checkpointLib();
            const store = this.checkpointStore();
            if (!CP || typeof CP.compareCheckpoints !== 'function') return { ok: false, reason: '模块未加载', diff: null, a: null, b: null };
            const r = CP.compareCheckpoints(store, chatId || this.getCurrentChatId(), nameA, nameB);
            return { ok: r.ok, reason: CP.describe ? CP.describe(r.reason) : r.reason, diff: r.diff, a: r.a, b: r.b };
        }
        /**
         * [v3.238.0] R4-D：检查点菜单行的**行构造**（纯函数：无 DOM、无副作用）。
         *
         * 为什么要有这一族：R4-C 把检查点做出来了，但**产品面零消费** —— 引擎里这一族
         *   8 个方法在 `settings-ui.js` 里的命中数是 **0**（唯一命中落在测试与本文件自己的
         *   注释里）。这正是本仓反复点名的「建好不消费 / 功能级失效」，也正是 CHANGELOG
         *   v3.237.0 主题自陈的那句「登记出来的一份，用户拿不到手里」。
         *
         * 为什么行构造住引擎侧：与 `snapshotRestoreMenu` 同一形状（R4-B 已确立的纪律：
         *   行长什么样是引擎的知识、面板只负责把它塞进 popup）。面板自己拼 HTML 就是
         *   第二处「检查点长什么样」的知识，下一次改行就得同时记住两处。
         *
         * 三态必须不同形（沿用模块头的老账 ①）：
         *   · `items === null`（存储没给 / 形态不合 / 读不到）⇒ 返回 `null` ——
         *     面板必须说「读不到」，**不得**渲染成「还没有检查点」；
         *   · `items === []` ⇒ 返回空串（真的是空的）；
         *   · 有记录 ⇒ 每行带 `data-name`，供面板按名取预览与对照。
         * @returns {string|null} 菜单行 HTML；`null` 表示清单读不到（不是「空」）
         */
        checkpointMenuItems() {
            const r = this.listCheckpoints();
            if (!r || r.items === null || r.items === undefined) return null;
            return r.items.map((it) => {
                const esc = (t) => String(t === undefined || t === null ? '' : t)
                    /* [v3.239.0] 全改 split/join：含引号的正则字面量会让 v3169 的 classSpan
                     *   （无正则态的词法扫描）失衡；实体一律经 String.fromCharCode 拼出。
                     *   修前实测：双引号那一支被写成恒等替换（属性转义等于没做）。
                     *   顺序纪律：AMP 必须最先，否则会把已生成的实体再转一次。 */
                    .split(String.fromCharCode(38)).join(String.fromCharCode(38) + 'amp;')
                    .split(String.fromCharCode(60)).join(String.fromCharCode(38) + 'lt;')
                    .split(String.fromCharCode(62)).join(String.fromCharCode(38) + 'gt;')
                    .split(String.fromCharCode(34)).join(String.fromCharCode(38) + 'quot;');
                const when = this._numOrNull(it.at) !== null ? new Date(this._numOrNull(it.at)).toLocaleString() : '时间未知';
                const floorTxt = this._numOrNull(it.floor) !== null ? ('第 ' + this._numOrNull(it.floor) + ' 楼') : '楼层未记';
                const meta = (it.meta && this._numOrNull(it.meta.keyCount) !== null) ? (this._numOrNull(it.meta.keyCount) + ' 面') : '面数未知';
                return '<div class="lsm-item" data-name="' + esc(it.name) + '" style="display:flex;justify-content:space-between;gap:10px;">'
                    + '<span>' + esc(it.name) + '</span>'
                    + '<span style="color:var(--ls-text-2,#9da7b3);font-size:12px;">' + esc(floorTxt + ' · ' + meta + ' · ' + when) + '</span>'
                    + '</div>';
            }).join('');
        }
        /**
         * [v3.238.0] R4-D：**恢复预览**的多行文案（纯函数，只读）。
         *
         * 只出计划、**不执行恢复**（真落地仍走 `restoreFromPayload` 单真源）。
         * 两侧差异的措辞是刻意对称的：`onlyInA` 是「当前有、检查点没有 ⇒ 恢复后会消失」，
         * `onlyInB` 是「检查点有、当前没有 ⇒ 恢复后会回来」—— 两者都被点名，
         * 不靠「差异 N 项」这种计数让用户自己猜方向。
         * @returns {string|null} 多行文本；读不到即 `null`（调用方必须说出来，不得渲染成空字符串）
         */
        checkpointRestorePreviewLines(name, chatId) {
            const r = this.previewCheckpointRestore(name, chatId);
            if (!r || r.ok !== true || !r.plan) return null;
            const d = r.diff || {};
            const p = r.plan;
            const list = (arr) => (Array.isArray(arr) && arr.length) ? arr.join('、') : '（无）';
            return [
                '恢复到：' + String(p.name) + '（' + (this._numOrNull(p.floor) !== null ? ('第 ' + this._numOrNull(p.floor) + ' 楼') : '楼层未记') + '）',
                '将恢复 ' + (this._numOrNull(p.willRestoreCount) !== null ? this._numOrNull(p.willRestoreCount) : '?') + ' 个字段',
                '恢复后会消失的字段：' + list(d.onlyInA),
                '恢复后会回来的字段：' + list(d.onlyInB),
                '存档代际：' + (p.schemaCross === 'same' ? '同代' : ('跨代 ' + String(p.fromSchema) + ' → ' + String(p.toSchema)))
            ].join('\n');
        }
        /**
         * [v3.252.0] F7 首阶段：**内容级只读对照**（读侧唯一出口）。
         *
         * 与 `compareBranchCheckpoints` 的分工（计划二 F7 原文点名的缺口）：
         *   若只给「键面 + 规模 + 代际」，用户看到的是「两边的键一样、字节差不多」，
         *   而计划点名的反例「同键同长度但值不同」（余额 100→900、朋友→仇人）**零读数**。
         *   本方法在既有键面读数**之上**叠一层有界的逐条内容差异，键面口径逐字不动。
         *
         * 为什么**并列新出口**而不改 `diffPayloads`：那是「键面 + 规模 + 代际」的既有契约，
         *   由 `v3237` F 组与 `v3239` B3/B4 逐条钉着（含「代际未给不得压成 0」）；
         *   就地扩成深比较会**静默改掉那两张判据的含义**（同一处改动静默改掉既有断言）。
         *
         * 三态不同形（本仓老账）：
         *   · 任一侧缺失 ⇒ `ok:false` 且 `deep:null`（**不拿空载荷冒充「那边是空的」**）；
         *   · 载荷损坏 ⇒ `reason` 如实报 `corrupt`（与「没有这份」不同形）；
         *   · 模块过旧（无 `diffPayloadsDeep`）⇒ `reason` 报 `deep-unavailable`，
         *     且**仍给出键面读数** —— 「深比较这版没有」不得把已经能给的键面读数一起吞掉；
         *   · 深比较内部出错 ⇒ 向上仍报 `ok:true` 且 `deep.ok:false`（键面能用就说能用）。
         * 纯读：零写、零全局读写、绝不抛（与本族其余成员同规格）。
         * @returns {{ok:boolean, reason:string, face:object|null, deep:object|null}}
         */
        compareBranchCheckpointsDeep(nameA, nameB, chatId, opts) {
            const faceRes = this.compareBranchCheckpoints(nameA, nameB, chatId);
            if (!faceRes || faceRes.ok !== true) {
                return { ok: false, reason: (faceRes && faceRes.reason) || '未知', face: null, deep: null };
            }
            const CP = this._checkpointLib();
            if (!CP || typeof CP.diffPayloadsDeep !== 'function') {
                /* 键面读数照给：模块过旧是「这面没有」，不是「什么都没读到」。 */
                return { ok: false, reason: 'deep-unavailable', face: faceRes.diff, deep: null };
            }
            const store = this.checkpointStore();
            const cid = chatId || this.getCurrentChatId();
            /* 两侧载荷走与 compareCheckpoints 同一条读取口（不另开一条读法）。 */
            const ra = CP.readCheckpoint(store, cid, nameA);
            const rb = CP.readCheckpoint(store, cid, nameB);
            if (!ra || ra.ok !== true || !rb || rb.ok !== true) {
                return { ok: false, reason: 'corrupt', face: faceRes.diff, deep: null };
            }
            const pa = ra.record ? ra.record.payload : null;
            const pb = rb.record ? rb.record.payload : null;
            if (!pa || !pb || typeof pa !== 'object' || typeof pb !== 'object') {
                return { ok: false, reason: 'corrupt', face: faceRes.diff, deep: null };
            }
            let deep = null;
            try { deep = CP.diffPayloadsDeep(pa, pb, opts); }
            catch (e) { errLog(e, 'compareBranchCheckpointsDeep'); deep = null; }
            if (!deep) return { ok: false, reason: 'internal', face: faceRes.diff, deep: null };
            return { ok: true, reason: 'ok', face: faceRes.diff, deep: deep };
        }
        /**
         * [v3.252.0] F7 首阶段：**内容级对照**的多行文案（纯函数，只读、零写）。
         *
         * 为什么文案口住引擎侧：与 `checkpointBranchesDiffLines` 同规格 ——
         *   行长什么样是引擎的知识，面板只负责塞进 popup。
         * 三态不同形（面板必须能分辨）：
         *   · 读不到（模块未加载 / 某一侧缺失 / 损坏）⇒ `null`；
         *   · 模块过旧（无深比较出口）⇒ **仍出一段键面文案**，并明说「本版无深比较」——
         *     不得与「两边内容完全一样」同形；
         *   · 有深比较 ⇒ 出「改动/未动/类型变化」并**点名路径**（折成计数等于把这件事还回用户）；
         *     截断 / 未下钻 / 循环引用各自单列（「没比」不得与「一样」同形）。
         * @returns {string|null}
         */
        checkpointContentDiffLines(nameA, nameB, chatId) {
            const r = this.compareBranchCheckpointsDeep(nameA, nameB, chatId);
            if (!r || (r.ok !== true && r.reason !== 'deep-unavailable') || !r.face) return null;
            const f = r.face;
            const list = (arr) => (Array.isArray(arr) && arr.length) ? arr.join('、') : '（无）';
            const out = [
                'A = ' + String(nameA) + ' ／ B = ' + String(nameB) + '（只对照，不改任何一份）',
                '键面：共同 ' + Number(f.sharedCount) + '；A 独有 ' + list(f.onlyInA) + '；B 独有 ' + list(f.onlyInB)
            ];
            if (r.reason === 'deep-unavailable') {
                out.push('内容级对照：**本版插件没有这个出口**（模块过旧）；上面只是键面读数，不等同于「内容一样」。');
                return out.join('\n');
            }
            const d = r.deep;
            if (!d || d.ok !== true) {
                out.push('内容级对照：**比不成**（' + String((d && d.reason) || '未知') + '）—— 这不是「没有差异」。');
                return out.join('\n');
            }
            const changed = Array.isArray(d.changes) ? d.changes : [];
            out.push('内容级：改动 ' + changed.length + ' 处；同键且值相同 ' + ((d.sameValueKeys || []).length) + ' 个');
            for (const c of changed.slice(0, 20)) {
                const from = c.from || {}; const to = c.to || {};
                const tag = (c.kind === 'type-changed') ? ('（类型变了：' + String(from.kind) + ' → ' + String(to.kind) + '）') : '';
                out.push('  · ' + String(c.path) + tag + '：' + String(from.text) + ' → ' + String(to.text));
            }
            if (changed.length > 20) out.push('  （只列前 20 处，另有 ' + (changed.length - 20) + ' 处未列出）');
            if (d.changesTruncated) out.push('⚠ 差异已达记录上限（' + Number((d.limits || {}).maxChanges) + ' 条）**截断**；后面还有差异没记，这不是「没有更多差异」。');
            for (const s of (Array.isArray(d.sets) ? d.sets : [])) {
                if (!Array.isArray(s.addedIds) || !Array.isArray(s.removedIds)) continue;
                if (!s.addedIds.length && !s.removedIds.length && !(s.modifiedIds || []).length) continue;
                let how;
                if (s.byId === true) how = '按 id ' + String(s.idKey) + ' 对齐';
                else if (s.byId === 'duplicate') how = '元素 id 有重复，未按 id 对齐';
                else how = '元素无可识别 id，按索引对齐';
                out.push('集合 ' + String(s.path) + '（' + how + '）：新增 ' + s.addedIds.length + ' / 删除 ' + s.removedIds.length + ' / 改动 ' + (s.modifiedIds || []).length);
                if (s.addedIds.length) out.push('  新增：' + list(s.addedIds.slice(0, 10)));
                if (s.removedIds.length) out.push('  删除：' + list(s.removedIds.slice(0, 10)));
                if ((s.modifiedIds || []).length) out.push('  改动：' + list(s.modifiedIds.slice(0, 10)));
            }
            if (Array.isArray(d.capped) && d.capped.length) out.push('未下钻（达深度/宽度上限，**没比**，不等于一样）：' + list(d.capped));
            if (Array.isArray(d.cycles) && d.cycles.length) out.push('循环引用（不下钻）：' + list(d.cycles));
            return out.join('\n');
        }
        /**
         * [v3.238.0] R4-D：**单份检查点详情**的多行文案（纯函数，只读）。
         *
         * 与「恢复预览」的分工：预览回答「相对**现在**会差什么」，详情回答「这一份**本身**是什么」
         *   （名字 / 时间 / 楼层 / 备注 / 面数 / 字节 / 存档代际）。两者都在产品面有入口。
         * 读不到即 `null`（记录不存在 / 载荷损坏 / 存储读不到三者由 `reason` 区分，面板如实播报）。
         * @returns {string|null}
         */
        checkpointDetailLines(name, chatId) {
            const r = this.readCheckpoint(name, chatId);
            if (!r || r.ok !== true || !r.record) return null;
            const rec = r.record;
            const mt = rec.meta || {};
            const at = this._numOrNull(rec.at) !== null ? new Date(this._numOrNull(rec.at)).toLocaleString() : '时间未记';
            const floor = this._numOrNull(rec.floor) !== null ? ('第 ' + this._numOrNull(rec.floor) + ' 楼') : '楼层未记';
            const faces = this._numOrNull(mt.keyCount) !== null ? (this._numOrNull(mt.keyCount) + ' 面') : '面数未知';
            const bytes = this._numOrNull(mt.bytes) !== null ? (this._numOrNull(mt.bytes) + ' 字节') : '字节未知';
            const gen = (mt.producerVersion || mt.version) ? String(mt.producerVersion || mt.version) : '代际未记';
            const schema = this._numOrNull(mt.schemaVersion) !== null ? String(this._numOrNull(mt.schemaVersion)) : '未记';
            return [
                '「' + String(rec.name) + '」',
                '存于 ' + at + ' · ' + floor,
                '规模 ' + faces + ' · ' + bytes + ' · 存档代际 ' + gen + '（schema ' + schema + '）',
                (rec.note ? ('备注：' + String(rec.note)) : '备注：（无）')
            ].join('\n');
        }
        /**
         * [v3.238.0] R4-D：**分支只读对照**的多行文案（纯函数，只读、零写、不切分支、不合并）。
         *
         * 两侧独有字段都**逐个列名**（不截断、不折叠成计数）：对照的用途就是看名字，
         * 折成数字等于把这件事还回给用户。
         * 任一侧缺失时 `compareBranchCheckpoints` 报 `a-missing` / `b-missing`，
         * 这里如实返回 `null` —— **不拿空载荷冒充「那边是空的」**。
         * @returns {string|null}
         */
        checkpointBranchesDiffLines(nameA, nameB, chatId) {
            const r = this.compareBranchCheckpoints(nameA, nameB, chatId);
            if (!r || r.ok !== true || !r.diff) return null;
            const d = r.diff;
            const list = (arr) => (Array.isArray(arr) && arr.length) ? arr.join('、') : '（无）';
            /* [v3.239.0] 差值走 _numOrNull：缺失即 '?'，不打印 NaN（本仓「不拿空冒充」的反面）。 */
            return [
                'A = ' + String(nameA) + ' ／ B = ' + String(nameB) + '（只对照，不改任何一份）',
                '共同字段 ' + Number(d.sharedCount) + ' 个；A 独有 ' + ((d.onlyInA || []).length) + ' 个；B 独有 ' + ((d.onlyInB || []).length) + ' 个',
                'A 独有：' + list(d.onlyInA),
                'B 独有：' + list(d.onlyInB),
                '字节：A ' + (this._numOrNull(d.bytesA) === null ? '?' : String(this._numOrNull(d.bytesA)))
                    + ' ／ B ' + (this._numOrNull(d.bytesB) === null ? '?' : String(this._numOrNull(d.bytesB)))
                    + '（差 ' + (this._numOrNull(d.bytesDelta) === null ? '?'
                        : ((d.bytesDelta >= 0 ? '+' : '') + String(d.bytesDelta))) + '）',
                '存档代际：' + (d.sameSchema ? '同代' : ('跨代 ' + String(d.schemaA) + ' → ' + String(d.schemaB)))
            ].join('\n');
        }
        // [v3.131] CP: 保存来源登记——所有 storage.save 调用点经此登记地面真源（来源计数随存档持久化，诊断面板展示"谁在保存"）
        //
        // [v3.166] 语义修正：登记的时机会决定它登记的是什么。
        //   六个调用点里五个写成 `recordSaveSource('X'); await storage.save(...)` ——
        //   登记在 save **之前**。而 storage.save 有两条不落盘路径（修订/指纹防护拒绝、
        //   真实写入失败），两条都只是 return false 而不抛错。于是这份「谁在保存」
        //   会把一次根本没发生的保存记进去，还会随存档持久化到其它设备。
        //   现在 sources 只由**结果**驱动；separate 出 attempts / denied 两个计数器，
        //   让「谁在尝试、谁在丢」分别可见，拒绝可归因到具体来源。
        recordSaveSource(source, floor = -1) {
            try {
                const prev = this._lastSaveGroundTruth || { ts: 0, floor: -1, sources: {}, attempts: {}, denied: {}, lastDenied: null };
                const f = Number.isFinite(Number(floor)) ? Number(floor) : prev.floor;
                const attempts = { ...(prev.attempts || {}) };
                attempts[source] = (attempts[source] || 0) + 1;
                // sources 保持 v3.131 的既有字段名（下游测试与诊断面板读它），
                //   但语义收紧为「确认落地过的保存」——由 recordSaveFailed 推进。
                this._lastSaveGroundTruth = {
                    ts: Date.now(), floor: f,
                    sources: { ...(prev.sources || {}) },
                    attempts,
                    denied: { ...(prev.denied || {}) },
                    lastDenied: prev.lastDenied || null,
                };
            } catch (e) { errLog(e, 'recordSaveSource'); }
        }
        /**
         * [v3.166] 按 storage.save 的**结果**记账。
         * @param {string} source 保存来源标识
         * @param {boolean} ok storage.save 的返回值（true=真实落盘证据已成立）
         * @param {string} [reason] 失败原因（ok=false 时用于归因）
         */
        recordSaveFailed(source, ok, reason = '') {
            try {
                const prev = this._lastSaveGroundTruth || { ts: 0, floor: -1, sources: {}, attempts: {}, denied: {}, lastDenied: null };
                if (ok) {
                    const sources = { ...(prev.sources || {}) };
                    sources[source] = (sources[source] || 0) + 1;
                    this._lastSaveGroundTruth = {
                        ts: Date.now(), floor: prev.floor,
                        sources, attempts: { ...(prev.attempts || {}) },
                        denied: { ...(prev.denied || {}) }, lastDenied: prev.lastDenied || null,
                    };
                    return true;
                }
                const denied = { ...(prev.denied || {}) };
                denied[source] = (denied[source] || 0) + 1;
                this._lastSaveGroundTruth = {
                    ts: prev.ts, floor: prev.floor,
                    sources: { ...(prev.sources || {}) }, attempts: { ...(prev.attempts || {}) },
                    denied,
                    lastDenied: { source: String(source), reason: String(reason || '未落盘'), at: Date.now() },
                };
                return false;
            } catch (e) { errLog(e, 'recordSaveFailed'); return false; }
        }
        /**
         * [v3.166] 保存地面真源报告：把「想保存」与「真保存」并列，
         *   回答「哪个来源在尝试、哪个来源在丢、最后一次丢是谁丢的」。
         */
        getSaveSourceReport() {
            const g = this._lastSaveGroundTruth || { ts: 0, floor: -1, sources: {}, attempts: {}, denied: {}, lastDenied: null };
            const sources = g.sources || {}, attempts = g.attempts || {}, denied = g.denied || {};
            const names = new Set([...Object.keys(sources), ...Object.keys(attempts), ...Object.keys(denied)]);
            const rows = [];
            for (const n of [...names].sort()) {
                rows.push({ source: n, attempted: attempts[n] || 0, persisted: sources[n] || 0, denied: denied[n] || 0 });
            }
            return { lastFloor: g.floor, lastAt: g.ts, lastDenied: g.lastDenied || null, rows };
        }
    }

    const _ops = new LonShaPersistenceOps();
        function persistenceOpsDescribe() {
        return {
            name: 'engine-persistence-ops.js',
            role: 'persistence & checkpoint operations',
            methodsCount: 28,
        };
    }
const exportsObj = {
        persistenceOpsDescribe: persistenceOpsDescribe,
        bindDeps: bindDeps,
        LonShaPersistenceOps: LonShaPersistenceOps,
        _ops: _ops,
        collectExport: function (engine, ...args) {
            const target = engine || this;
            return _ops.collectExport.apply(target, args);
        },
        restoreFromPayload: function (engine, ...args) {
            const target = engine || this;
            return _ops.restoreFromPayload.apply(target, args);
        },
        restoreFromSnapshot: function (engine, ...args) {
            const target = engine || this;
            return _ops.restoreFromSnapshot.apply(target, args);
        },
        restoreSnapshotFlow: function (engine, ...args) {
            const target = engine || this;
            return _ops.restoreSnapshotFlow.apply(target, args);
        },
        snapshotRestoreMenu: function (engine, ...args) {
            const target = engine || this;
            return _ops.snapshotRestoreMenu.apply(target, args);
        },
        clearRuntimeMemory: function (engine, ...args) {
            const target = engine || this;
            return _ops.clearRuntimeMemory.apply(target, args);
        },
        snapshotClearCoverage: function (engine, ...args) {
            const target = engine || this;
            return _ops.snapshotClearCoverage.apply(target, args);
        },
        getCurrentChatId: function (engine, ...args) {
            const target = engine || this;
            return _ops.getCurrentChatId.apply(target, args);
        },
        _snapshotAnchorOf: function (engine, ...args) {
            const target = engine || this;
            return _ops._snapshotAnchorOf.apply(target, args);
        },
        checkpointStore: function (engine, ...args) {
            const target = engine || this;
            return _ops.checkpointStore.apply(target, args);
        },
        _checkpointLib: function (engine, ...args) {
            const target = engine || this;
            return _ops._checkpointLib.apply(target, args);
        },
        _numOrNull: function (engine, ...args) {
            const target = engine || this;
            return _ops._numOrNull.apply(target, args);
        },
        _floorOrNull: function (engine, ...args) {
            const target = engine || this;
            return _ops._floorOrNull.apply(target, args);
        },
        saveCheckpoint: function (engine, ...args) {
            const target = engine || this;
            return _ops.saveCheckpoint.apply(target, args);
        },
        listCheckpoints: function (engine, ...args) {
            const target = engine || this;
            return _ops.listCheckpoints.apply(target, args);
        },
        readCheckpoint: function (engine, ...args) {
            const target = engine || this;
            return _ops.readCheckpoint.apply(target, args);
        },
        dropCheckpoint: function (engine, ...args) {
            const target = engine || this;
            return _ops.dropCheckpoint.apply(target, args);
        },
        previewCheckpointRestore: function (engine, ...args) {
            const target = engine || this;
            return _ops.previewCheckpointRestore.apply(target, args);
        },
        compareBranchCheckpoints: function (engine, ...args) {
            const target = engine || this;
            return _ops.compareBranchCheckpoints.apply(target, args);
        },
        checkpointMenuItems: function (engine, ...args) {
            const target = engine || this;
            return _ops.checkpointMenuItems.apply(target, args);
        },
        checkpointRestorePreviewLines: function (engine, ...args) {
            const target = engine || this;
            return _ops.checkpointRestorePreviewLines.apply(target, args);
        },
        compareBranchCheckpointsDeep: function (engine, ...args) {
            const target = engine || this;
            return _ops.compareBranchCheckpointsDeep.apply(target, args);
        },
        checkpointContentDiffLines: function (engine, ...args) {
            const target = engine || this;
            return _ops.checkpointContentDiffLines.apply(target, args);
        },
        checkpointDetailLines: function (engine, ...args) {
            const target = engine || this;
            return _ops.checkpointDetailLines.apply(target, args);
        },
        checkpointBranchesDiffLines: function (engine, ...args) {
            const target = engine || this;
            return _ops.checkpointBranchesDiffLines.apply(target, args);
        },
        recordSaveSource: function (engine, ...args) {
            const target = engine || this;
            return _ops.recordSaveSource.apply(target, args);
        },
        recordSaveFailed: function (engine, ...args) {
            const target = engine || this;
            return _ops.recordSaveFailed.apply(target, args);
        },
        getSaveSourceReport: function (engine, ...args) {
            const target = engine || this;
            return _ops.getSaveSourceReport.apply(target, args);
        },
    };

    return exportsObj;
}));
