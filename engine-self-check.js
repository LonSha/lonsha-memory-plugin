/* ============================================================
 * engine-self-check.js — LonSha Memory Engine: Self-Check & Diagnostics
 * 从 index.js 独立外提：系统全景健康检查、各子系统数据量统计、
 * 召回管线 dry-run、存档 schema 校验与深层不变量诊断。
 * ============================================================ */

(function(root, factory) {
    'use strict';
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else {
        root.LonShaEngineSelfCheck = factory();
    }
})(typeof window !== 'undefined' ? window : globalThis, function() {
    'use strict';

    function _moduleLib(getter, name) {
        try {
            if (typeof getter === 'function') {
                const v = getter();
                if (v) return v;
            }
        } catch (_) {}
        return null;
    }

    let _deps = {
        VERSION: '3.366.0',
        errLog: function(err, tag) { try { console.error('[engine-self-check] ' + (tag ? tag + ': ' : ''), err); } catch(_) {} },
        hintForError: function(err) { return String(err && err.message || err || ''); },
        getErrBuf: function() { return []; },
        _formatBindDepsRow: function(c, r) { return ['依赖注入', '未注入']; },
        _moduleFailureSnapshot: function() { return []; },
        _schemaMigrationLib: function() { return _moduleLib(() => window.LonShaSchemaMigration, 'schema-migration.js'); },
        _moduleRegistryLib: function() { return _moduleLib(() => window.LonShaModuleRegistry, 'module-registry.js'); },
        _cacheIdentityLib: function() { return _moduleLib(() => window.LonShaCacheIdentity, 'cache-identity.js'); },
        _changeset: function() { return _moduleLib(() => window.LonShaChangeset, 'changeset.js'); },
        CARRYOVER_CONTRACT_KEYS: ['graph', 'summaries', 'diaries', 'vectors', 'povs', 'timeline', 'status', 'ledger', 'suspense', 'scene']
    };

    function bindDeps(d) {
        if (!d || typeof d !== 'object') return;
        _deps = Object.assign(_deps, d);
    }

    // 常用 helper 映射
    function _schemaMigrationLib() { return typeof _deps._schemaMigrationLib === 'function' ? _deps._schemaMigrationLib() : _moduleLib(() => window.LonShaSchemaMigration, 'schema-migration.js'); }
    function _moduleRegistryLib() { return typeof _deps._moduleRegistryLib === 'function' ? _deps._moduleRegistryLib() : _moduleLib(() => window.LonShaModuleRegistry, 'module-registry.js'); }
    function _cacheIdentityLib() { return typeof _deps._cacheIdentityLib === 'function' ? _deps._cacheIdentityLib() : _moduleLib(() => window.LonShaCacheIdentity, 'cache-identity.js'); }
    function _changeset() { return typeof _deps._changeset === 'function' ? _deps._changeset() : _moduleLib(() => window.LonShaChangeset, 'changeset.js'); }
    function _moduleFailureSnapshot() { return typeof _deps._moduleFailureSnapshot === 'function' ? _deps._moduleFailureSnapshot() : []; }
    function _formatBindDepsRow(c, r) { return typeof _deps._formatBindDepsRow === 'function' ? _deps._formatBindDepsRow(c, r) : ['依赖注入', '未注入']; }

    class LonShaSelfCheckOps {
        async selfCheck() {
        const VERSION = _deps.VERSION || '3.366.0';
        const errLog = _deps.errLog || function(e, tag) { try { console.error('[engine-self-check] ' + (tag ? tag + ': ' : ''), e); } catch(_) {} };
        const hintForError = _deps.hintForError || function(e) { return String(e?.message || e); };
        const _errBuf = (typeof _deps.getErrBuf === 'function' ? _deps.getErrBuf() : _deps._errBuf) || (typeof globalThis._errBuf !== 'undefined' ? globalThis._errBuf : []);
        const CARRYOVER_CONTRACT_KEYS = _deps.CARRYOVER_CONTRACT_KEYS || ['graph', 'summaries', 'diaries', 'vectors', 'povs', 'timeline', 'status', 'ledger', 'suspense', 'scene'];
        const report = { time: new Date().toLocaleString(), version: VERSION, stats: [], errors: _errBuf.slice(-15), pipeline: null, schema: null };   // [v3.2] DF4: 面板只展示最近15条
        try {
            // 1. 各子系统数据量统计
            const rows = [
                ['图谱', `${this.graph.nodes.size} 节点 / ${this.graph.edges.size} 边`],
                ['向量', `${this.vector.vectors.length} 条${(this.vector.vectors.length || 0) > (this.config.config.vectorMaxCount || 500) ? ' ⚠️超限' : ''}`],
                ['摘要', `${this.summary.summaries.length} 条（${this.summary.summaries.filter(s => s.folded).length} 已折叠 / 卷 ${this.summary.volumes.length}）`],
                ['日记', `${Object.keys(this.diary.diaries).length} 角色 / ${Object.values(this.diary.diaries).reduce((a, b) => a + b.length, 0)} 篇`],
                ['时间线', `${this.timeline.entries.length} 条`],
                ['悬念簿', `${this.suspense.items.filter(x => x.status === 'open').length} 开放 / ${this.suspense.items.length} 总`],
                ['场景树', (() => {
                    try {
                        const sc = this.scene.scale ? this.scene.scale() : { nodes: this.scene.nodes.size, detailed: 0, depth: 0, visits: 0, presence: 0 };
                        const iv = this.scene.checkInvariants ? this.scene.checkInvariants() : { state: '—' };
                        return `${sc.nodes} 节点（细写 ${sc.detailed} / 最深 ${sc.depth} 层）/ ops ${this.scene.opsLog.length} / 到访 ${sc.visits} / 在场 ${sc.presence}${this.scene._absent ? ' ⚠️模块缺席' : ''}${iv.state === 'broken' ? ' ⚠️树断裂' : (iv.state === 'warn' ? ' ⚠️读数可疑' : '')}`;
                    } catch (e) { return '—'; }
                })()],
                ['物品台账', `${this.items.records.length} 件 / ops ${this.itemOps.length}${this.items._stale ? `（失活 ${this.items._stale}）` : ''}`],
                ['台账校验', this._ledgerViolationSummary ? this._ledgerViolationSummary() : '—'],
                ['补提取', `${this.scanMissingFloors().length} 个楼层无记忆（可在设置面板补提取）`],
                ['反思', `${this.reflection.items.length} 条`],
                ['POV', `${this.pov.povs.length} 条`],
                ['角色状态', `${Object.keys(this.status.characters || {}).length} 人`],
                // [v3.167] 人物状态（CSE）诊断行。此前近 20 行子系统统计里 CSE
                //   **一行都没有**——于是「有状态在看不见的地方被丢弃 / 身份被改写」
                //   没有任何用户可见出口。修后本行同时回答四个问题：
                //   体量（几人几条）、容量压力（几人已顶格）、账本（丢/拒/自愈各几次）、
                //   以及**索引是否与 store 同源**（幽灵键一旦非 0 即说明收口被绕过）。
                (() => {
                    try {
                        const d = this.cse?.diagnose?.();
                        if (!d) return ['人物状态', '—（引擎未挂载）'];
                        let txt = `${d.chars} 人 / ${d.states} 条`;
                        if (d.towardKeys) txt += ` · 关系向 ${d.towardKeys}`;
                        txt += `（上限 ${d.caps.states}）`;
                        if (d.nearCapChars) txt += ` ⚠️${d.nearCapChars}人顶格`;
                        const lg = d.ledger || {};
                        if (lg.evicted || lg.rejected || lg.ghostReclaimed) {
                            txt += ` · 淘汰 ${lg.evicted || 0} / 拒绝 ${lg.rejected || 0}`;
                            if (lg.ghostReclaimed) txt += ` / 索引自愈 ${lg.ghostReclaimed}`;
                        }
                        // 幽灵键是实时体检（不依赖账本）：非 0 说明某条路径绕过了 _reindexTargets 收口
                        if (d.ghosts) txt += ` ⚠️索引幽灵 ${d.ghosts}（与 store 不同源）`;
                        if (d.lastReject) txt += ` · 末次拒绝 ${d.lastReject.character}·${d.lastReject.field}→${d.lastReject.toward}（关系向上限）`;
                        return ['人物状态', txt];
                    } catch (e) { errLog(e, 'selfCheck.cse'); return ['人物状态', '—（诊断异常）']; }
                })(),
                ['回响池', `${this.echo.pool ? this.echo.pool.size : (this.echo.items ? this.echo.items.length : '?')}`],
                ['楼层账本', `${Object.keys(this.ledger.floors || {}).length} 楼${this.ledger.evicted ? `（已淘汰 ${this.ledger.evicted}）` : ''}`],
                ['回滚失效', this._ledgerMissingRollbacks ? `${this._ledgerMissingRollbacks} 次（账本已淘汰）` : '0'],
                // [v3.182] 账本回放：回答「删楼/前移时，每一本账到底撤了没有」。
                //   此前回滚是 40 余处各自 try/catch，任何一处失败只进错误日志，
                //   诊断面上一片正常。现在最近一次回放的分态直接念出来。
                // [v3.235.0] R4-A：回滚预览 —— 回答「上一次破坏之前预告了什么」，
                //   与下一行的「账本回放」（实际撤了多少）并列成对，预告落空一眼可见。
                ['回滚预览', (() => {
                    try {
                        const _lr = _ledgerReplayLib();
                        if (!_lr || typeof _lr.previewLine !== 'function') return '—（模块缺席）';
                        const pv = this._lastRollbackPreview;
                        if (!pv) return '—（未预览）';
                        if (pv.module === 'absent') return '—（模块缺席）';
                        if (pv.skipped === 'floor-not-given') return '—（未给楼层）';
                        let txt = _lr.previewLine(pv.drop, pv.shift);
                        const act = this._lastReplayReport;
                        if (act && typeof act.dropped === 'number' && pv.drop && pv.drop.projected !== null
                            && act.floor === pv.floor) {
                            txt += ' ｜ 实撤 ' + act.dropped + ' 条';
                            if (act.dropped !== pv.drop.projected) txt += ' ⚠️与预告不符';
                        }
                        return txt;
                    } catch (e) { return '—（诊断异常）'; }
                })()],
                // [v3.236.0] R4-B：**定期快照观测**（缺口 2 的读数面）。
                //   此前「每 50 楼一份快照」这句话在诊断面上没有任何对应读数：
                //   落没落盘、落在哪个会话、锚点是谁的，一律不可见 —— 于是「切了会话
                //   以后再也不存快照」这件事只能靠人去翻 IndexedDB 才知道。
                //   本行刻意把三态分开写：未启用 / 本会话尚无锚点 / 锚点读数，
                //   并把落盘账里**属于别的会话**的份数单列（跨会话污染一眼可见）。
                ['定期快照', (() => {
                    try {
                        if (!this.config || !this.config.config || !this.config.config.autoSave) return '—（未启用）';
                        const _every = Number((this.config.config || {}).snapshotEveryFloors) || 50;
                        const _own = (this._snapshotByChat || []).length;
                        const _mine = (this._snapshotByChat || []).filter(r => r.chatId === this._snapshotAnchorChatId).length;
                        const _head = '每 ' + _every + ' 楼';
                        const _tail = '｜落盘账 ' + _own + ' 份（本会话 ' + _mine + '，跨会话 ' + (_own - _mine) + '）';
                        if (!this._snapshotAnchorChatId) return _head + '｜本会话尚无锚点' + _tail;
                        return _head + '｜锚点 ' + (Number(this._snapshotAnchorFloor) || 0) + ' 楼' + _tail;
                    } catch (e) { return '—（诊断异常）'; }
                })()],
                ['账本回放', (() => {
                    try {
                        const _lr = _ledgerReplayLib();
                        if (!_lr) return '—（模块缺席）';
                        return _lr.diagnoseLine(this._lastReplayReport);
                    } catch (e) { return '—（诊断异常）'; }
                })()],
                // [v3.164] 事件接线：回答「记忆提取到底有没有被接上」。此前 17 行子系统统计里
                //   没有任何一行覆盖事件注册状态——注册失败时插件仍「看起来正常」，用户侧表现为
                //   「聊了很久没有记忆」，却没有任何地方能看出原因（坏了没人知道）。
                (() => {
                    const ci = (typeof this.stateProvider === 'function' ? this.stateProvider() : null);
                    if (!ci) return ['事件接线', '—（控制平面未初始化）'];
                    let txt = `${ci.events} 个监听`;
                    if (ci.lastEvent) txt += `（最后由 ${String(ci.lastEvent).replace(/^(MESSAGE_|GENERATION_)/, '')} 触发）`;
                    if (ci.registeredAt) txt += ' · ' + new Date(ci.registeredAt).toLocaleTimeString('zh-CN');
                    if (ci.unregisterAttempts) txt += ` · 卸载 ${ci.unregisterAttempts} 次`;
                    // [v3.165] 被拒绝的注册也要可见：类型无效时 bindEvent 拒绝挂载而非静默
                    //   on(undefined)，拒绝数是「宿主事件表与插件预期不一致」的唯一用户侧线索。
                    if (ci.rejected) txt += ` · 拒绝 ${ci.rejected} 次（${ci.lastReject || '类型无效'}）`;
                    if (ci.lastFailure || ci.events === 0) txt += ' ⚠️ ' + (ci.lastFailure || '尚无任何事件触发——若已聊天请检查 eventSource');
                    return ['事件接线', txt];
                })(),
                // [v3.166] 配置迁移：回答「本次载入迁了什么 / 跳过了什么 / 失败在哪」。
                //   修前这三个迁移分支靠自引用构造 + 栈溢出收敛，迁移结果除了
                //   一行成功 console.log 之外无任何记录（跳过与失败完全不可见）。
                (() => {
                    const cm = this.config;
                    const m = cm?._lastMigrationReport;
                    if (cm?._configLoadError) {
                        return ['配置迁移', `⚠️ 载入失败：${cm._configLoadError}`];
                    }
                    if (!m) return ['配置迁移', '—（未执行载入）'];
                    let txt = `检查 ${m.checks} 项`;
                    if (m.applied?.length) txt += ` · 已迁移 ${m.applied.join('、')}`;
                    else txt += ' · 无迁移需要';
                    if (m.skipped?.length) txt += ` · 跳过 ${m.skipped.length}（${m.skipped.join('、')}）`;
                    if (m.failed?.length) txt += ` ⚠️ 失败 ${m.failed.length}（${m.failed.join('、')}）`;
                    return ['配置迁移', txt];
                })(),
                // [v3.166] 写盘合流：回答「这一轮写盘吞了几批、有没有丢过、确认修订号走到哪」。
                //   修前单槽覆盖是静默的——丢批不计数、不告警、不可查。
                (() => {
                    const st = this.storage;
                    if (!st) return ['写盘合流', '—（存储层未初始化）'];
                    const pend = st._pendingWrites instanceof Map ? st._pendingWrites.size : 0;
                    const merged = Number(st._mergedBatches) || 0;
                    const lw = st._lastWrite || {};
                    let txt = `同 chat 合并 ${merged} 批 · 挂起 ${pend}`;
                    if (lw.status) txt += ` · 末次 ${lw.status}${lw.revision != null ? '(rev' + lw.revision + ')' : ''}`;
                    if (st._confirmed?.revision != null) txt += ` · 已确认 rev${st._confirmed.revision}`;
                    if (lw.status === 'failed') txt += ` ⚠️ ${lw.error || '未落盘'}`;
                    return ['写盘合流', txt];
                })(),
                // [v3.166] 保存来源：把「谁想保存」与「谁真保存了」并列。
                //   修前 sources 只由调用意图驱动，无法察觉某个来源一直在被拒绝。
                (() => {
                    const r = this.getSaveSourceReport?.();
                    if (!r || !r.rows?.length) return ['保存来源', '暂无记录'];
                    const parts = r.rows.slice(0, 6).map(x =>
                        `${x.source}:${x.persisted}/${x.attempted}${x.denied ? `(拒${x.denied})` : ''}`);
                    let txt = parts.join(' ');
                    if (r.rows.length > 6) txt += ` …共${r.rows.length}源`;
                    if (r.lastDenied) txt += ` ⚠️ 末次拒绝 ${r.lastDenied.source}：${r.lastDenied.reason}`;
                    return ['保存来源', txt];
                })(),
                // [v3.168] 静默降级总账（本版中心机制）：把「不是报错、而是悄悄换了更差的路」
                //   这类失效并列成一张表。修前每一类只能各自看日志，没有地方回答
                //   「我这套记忆有多少部分在退化运行」。
                (() => {
                    try {
                        const g = this.getDegradationLedger?.();
                        if (!g || !Array.isArray(g.rows)) return ['静默降级', '—（无账本）'];
                        const hot = g.rows.filter(x => x.value > 0);
                        if (!hot.length) return ['静默降级', `全部正常（检查 ${g.rows.length} 项）`];
                        let txt = hot.slice(0, 4).map(x => `${x.name} ${x.value}`).join(' · ');
                        if (hot.length > 4) txt += ` …共 ${hot.length} 项退化`;
                        return ['静默降级', txt + ' ⚠️'];
                    } catch (e) { errLog(e, 'selfCheck.degradation'); return ['静默降级', '—（诊断异常）']; }
                })(),
                // [v3.169] 审计账本自述：账本是全部诊断的载体，它自己必须报出
                //   「窗口 / 累计 / 损失」。只报 entries.length 会让「淘汰过」与
                //   「从未超限」在面板上完全同形——而两者的诊断价值截然不同。
                (() => {
                    try {
                        const ol = this.opLog;
                        if (!ol) return ['审计账本', '—（未初始化）'];
                        const st = opLogStatsCompat(this);
                        if (st.error) return ['审计账本', `⚠️ 读取失败（${st.error}）——计数不可信`];
                        if (st.absent) return ['审计账本', '—（无 stats 接口）'];
                        const sum = ol.auditSummary?.() || `窗口 ${ol.entries?.length || 0}`;
                        const lossy = !!(st.truncated || st.trimFields || st.importDropped);
                        let txt = `累计 ${ol.observedTotal?.() ?? st.total} · ${sum}`;
                        if (ol.lastTruncation) txt += ` · 末次裁剪 seq#${ol.lastTruncation.seq}(${ol.lastTruncation.op})`;
                        return ['审计账本', txt + (lossy ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.oplog'); return ['审计账本', '—（诊断异常）']; }
                })(),
                // [v3.170] 巩固账本自述：stm-ltm（v3.96 缝入后 74 个版本无人审计的子系统）
                //   现在有一行 selfReport——「待巩固 / 已巩固 / 窗口 / 有损明细」。
                //   只报「窗口里还有几条」而不报「丢过几条」，会让学生子系统在面板上
                //   永远显得健康；lossSummary 与 selfReport 同源，不各写一套。
                (() => {
                    try {
                        const sl = this.stmLtm;
                        if (!sl || typeof sl.lossSummary !== 'function') return ['巩固账本', '—（未启用）'];
                        if (!this.config.config.stmLtmEnabled) return ['巩固账本', '—（未启用）'];
                        const sr = sl.selfReport(this._stmLtmState);
                        return ['巩固账本', (sr.row || '—') + (sr.ok ? '' : ' ⚠️')];
                    } catch (e) { errLog(e, 'selfCheck.stmLtm'); return ['巩固账本', '—（诊断异常）']; }
                })(),
                // [v3.171] 门控读数自述：与巩固账本同族（I5/I6），看读侧缺口是否可见。
                //   「判不了 / 没读到 / 被丢弃」若不上面板，会与「真平淡」完全同形。
                (() => {
                    try {
                        if (!Array.isArray(this._triggerStats) || !this._triggerStats.length) return ['门控读数', '—（未启用）'];
                        if (this.config.config.smartTriggerEnabled !== true) return ['门控读数', '—（未启用）'];
                        const tp = (typeof window !== 'undefined' ? window.LonShaSmartTrigger : null);
                        if (!tp || typeof tp.normalizeTriggerReport !== 'function') return ['门控读数', '—（模块不可用）'];
                        const rep2 = tp.normalizeTriggerReport(this._triggerStats, {
                            cap: 300,
                            dropped: Number(this._triggerDropped) || 0,
                        });
                        const invBad = this._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.invalidPatterns) || 0), 0);
                        const omitErr = this._triggerStats.reduce((n, r) => n + Number((r && r.report && r.report.omitErrors) || 0), 0);
                        const gap = (rep2.empty || 0) + (rep2.dropped || 0) + invBad + omitErr;
                        const row = `评估 ${rep2.records} · 正常读数 ${rep2.plain} · 空读 ${rep2.empty || 0}`
                            + (rep2.dropped ? ` · 淘汰 ${rep2.dropped}` : '')
                            + (invBad ? ` · 判不了 ${invBad}` : '')
                            + (omitErr ? ` · 判定失败 ${omitErr}` : '');
                        return ['门控读数', row + (gap ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.smartTrigger'); return ['门控读数', '—（诊断异常）']; }
                })(),
                // [v3.172] 召回漏斗自述：v3.95/v3.96 缝合四模块的收缩量。
                //   与门控/巩固同族（I5/I6），漏斗变窄必须可见。
                (() => {
                    try {
                        const _on = ['aiSelectEnabled', 'unifiedRecallEnabled', 'vectorChunkEnabled']
                            .some(k => this.config.config[k] === true);
                        if (!Array.isArray(this._recallFunnel) || !this._recallFunnel.length) {
                            return ['召回漏斗', _on ? '—（已开启但尚无读数）' : '—（未启用）'];
                        }
                        const _ai2 = (typeof window !== 'undefined' ? window.LonShaAISelect : null);
                        if (!_ai2 || typeof _ai2.normalizeRecallFunnel !== 'function') return ['召回漏斗', '—（模块不可用）'];
                        const fp2 = _ai2.normalizeRecallFunnel(this._recallFunnel, {
                            cap: 500, dropped: Number(this._recallFunnelDropped) || 0,
                        });
                        const gap2 = fp2.unreadable + fp2.unmatched + fp2.truncated + fp2.graphDropped
                            + fp2.hardCut + fp2.channelFallback + fp2.dropped + fp2.missing
                            + (Number(this._recallFunnelReadEmpty) || 0);
                        const row2 = `读数 ${fp2.records} 轮 · 空集 ${fp2.empty}`
                            + (fp2.unreadable ? ` · 判不了 ${fp2.unreadable}` : '')
                            + (fp2.unmatched ? ` · 映射不上 ${fp2.unmatched}` : '')
                            + (fp2.truncated ? ` · 粗召回截断 ${fp2.truncated}` : '')
                            + (fp2.graphDropped ? ` · 图谱截断 ${fp2.graphDropped}` : '')
                            + (fp2.hardCut ? ` · 硬切 ${fp2.hardCut}` : '')
                            + (fp2.channelFallback ? ` · 副通道回落 ${fp2.channelFallback}` : '')
                            + (Number(this._recallFunnelReadEmpty) ? ` · 空读轮 ${this._recallFunnelReadEmpty}` : '');
                        return ['召回漏斗', row2 + (gap2 ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.recallFunnel'); return ['召回漏斗', '—（诊断异常）']; }
                })(),
                // [v3.173] 缝合模块接线面自述：7 个零消费模块接线后各自的活性。
                //   与召回漏斗同族（I5/I6）：接上了但读不到、与没接上，必须可分。
                (() => {
                    try {
                        const _libs = [
                            ['canonical-stringify.js', () => window.LonShaCanonical],
                            ['dependency-closure.js', () => window.LonShaDependencyClosure],
                            ['entity-semantic.js', () => window.LonShaEntitySemantic],
                            ['extraction-cadence.js', () => window.LonShaExtractionCadence],
                            ['floor-range.js', () => window.LonShaFloorRange],
                            ['npc-ties.js', () => window.LonShaNpcTies],
                            ['turn-reconciler.js', () => window.LonShaTurnReconciler],
                        ];
                        let _up = 0;
                        const _down = [];
                        for (const [f, g] of _libs) {
                            let ok = false;
                            try { ok = !!g(); } catch (e) { ok = false; }
                            if (!ok && typeof require !== 'undefined') {
                                try { ok = !!require('./' + f); } catch (e) { ok = false; }
                            }
                            if (ok) _up++; else _down.push(f);
                        }
                        const _act = [];
                        if (this._histFpRead && this._histFpRead.via === 'canonical') _act.push('指纹·模块');
                        if (this._npcTiesSource === 'module+inline') _act.push('关系网·对账');
                        if (this._entityRegistryRead) _act.push(`实体 ${this._entityRegistryRead.upserted}`);
                        if (this._graphDedupCascade) _act.push(`幽灵边 ${this._graphDedupCascade.ghostNodes}`);
                        if (this._cadenceTriage) _act.push(`节奏 ${(this._cadenceTriage.active || []).length}`);
                        if (this._floorRangeLedger) _act.push(`水位 ${this._floorRangeLedger.coveredTo}`);
                        if (this._artifactTurnReconcile) _act.push(`轮次对账 ${this._artifactTurnReconcile.claimed}`);
                        const _row = `模块 ${_up}/7 可用` + (_act.length ? ` · 已产出 ${_act.join(' / ')}` : ' · 尚无读数')
                            + (_down.length ? ` · 不可用 ${_down.length}（${_down.join(' ')}）` : '');
                        return ['模块接线', _row + (_down.length ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.moduleWiring'); return ['模块接线', '—（诊断异常）']; }
                })(),
                // [v3.168] I3 携带契约：写侧产出必须覆盖契约清单。
                //   与「静默降级」同族：导入侧有分支、写侧不产出时，跨对话续写会静默丢掉子系统，而 toast 仍写着「无缝衔接」。
                (() => {
                    try {
                        const strict = this.config.config.carryoverContractStrict !== false;
                        const rep = this._lastCarryoverReport;
                        if (!rep || !(rep.produced || []).length) return ['携带契约', strict ? '尚未打包（严格模式开）' : '尚未打包（严格模式关）'];
                        const tot = CARRYOVER_CONTRACT_KEYS.length;
                        const _n = rep.produced.length;
                        const _ok = rep.ok === true;
                        return ['携带契约', _n + '/' + tot + ' 键'
                            + (_ok ? ' ✓' : ' ⚠️ 缺 ' + (rep.missingWrite || []).join('/'))];
                    } catch (e) { errLog(e, 'selfCheck.carryover'); return ['携带契约', '—（诊断异常）']; }
                })(),
                // [v3.175] 世界钟读者面：本插件此前对 WorldAxis 零消费，「两个世界对不上」在本插件侧
                //   完全不可观测。本行把「另一个插件认为现在是几号、与本插件差几天」念出来。
                //   口径：未读（本会话尚未对账）只报「未读」不报警；不可用报归因（桥没装/没开都要能分辨）；
                //   真对不上（世界钟在前/在后）才标 ⚠️——「有缺陷时告警、没缺陷时安静」。
                (() => {
                    try {
                        const cl = this.clock;
                        if (!cl) return ['世界钟', '—（时钟不可用）'];
                        const r = (cl._worldClockRead && typeof cl._worldClockRead === 'object') ? cl._worldClockRead : null;
                        if (!r) return ['世界钟', '未读'];
                        if (!r.ok) return ['世界钟', '不可用 · ' + r.reason + (r.describe ? '（' + r.describe + '）' : '')];
                        const line = (typeof cl.worldClockLine === 'function') ? cl.worldClockLine() : '';
                        const d = r.diff || {};
                        const bad = d.verdict === 'world-ahead' || d.verdict === 'world-behind';
                        return ['世界钟', (line || '已读') + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.worldClock'); return ['世界钟', '—（诊断异常）']; }
                })(),
                // [v3.176] 世界账本对读面：不只读钟，把推演侧的**全账本**（暗流/权威事实/人物位置/舆情）
                //   与「有多少东西没外供我」一并念出来。修前那一整个世界在本插件侧不可观测。
                //   口径：未读不报警；不可用报归因；有未外供缺口或位置冲突才标 ⚠️。
                (() => {
                    try {
                        const r = this._worldLedgerRead;
                        if (!r) return ['世界账本', '未读'];
                        if (!r.ok) return ['世界账本', '不可用 · ' + r.reason + (r.describe ? '（' + r.describe + '）' : '')];
                        const cl = this.clock;
                        const line = (cl && typeof cl.worldLedgerLine === 'function') ? cl.worldLedgerLine() : '';
                        const gap = r.gap || {};
                        const pd = r.peopleDiff || {};
                        const bad = (gap.verdict === 'gapped') || (pd.mismatched && pd.mismatched.length > 0);
                        return ['世界账本', (line || '已读') + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.worldLedger'); return ['世界账本', '—（诊断异常）']; }
                })(),
                // [v3.208.0] 本地投影管线体检面：回答「这一轮我给了推演侧几个投影、漏接了几个」。
                //   三态必须可分：模块未加载 / 尚未跑过 / 有读数（缺席才列 id 与原因）。
                //   为什么这行非有不可：缺席此前不可观测——「漏接一个投影」与「那个投影本轮为空」
                //   在旧读数上完全同形，对读于是把「查不出来」当成「两边一致」。
                (() => {
                    try {
                        const P = _projectionLib();
                        if (!P || typeof P.pipelineLine !== 'function') return ['投影管线', '模块未加载（projection-pipeline.js）'];
                        const pg = this._lastProjection;
                        if (!pg) return ['投影管线', '待本轮（尚未收集）'];
                        const line = P.pipelineLine(pg);
                        const miss = (typeof P.absentList === 'function') ? P.absentList(pg) : [];
                        const bad = (pg.identity && pg.identity.ok === false) || miss.length > 0;
                        // 缺席**点名**（不只是报个数）：漏接了哪个、为什么，一眼看到。
                        const detail = miss.length ? ('｜缺 ' + miss.map((m) => m.id + '(' + m.reason + ')').join('、')) : '';
                        return ['投影管线', line + detail + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.projectionPipeline'); return ['投影管线', '—（诊断异常）']; }
                })(),
                // [v3.270.0 · B2/X1] 注入容量预演体检面（「世界书占多少、挤掉哪条记忆」）。
                //   三态必须可分：模块未加载 / 世界书读不到 / 有读数在算。
                //   为何不可压成一态：世界书读不到时占用是**未知**，报「0 占用」会让用户
                //   把「读不到」读成「不占空间」—— 正是本仓最贵的「未知与零同形」形态。
                (() => {
                    try {
                        const pr = this._projectionPrediction();
                        if (!pr) return ['注入预演', '模块未加载（projection-pipeline.js）'];
                        const wb = pr.worldbook || {};
                        const wbTxt = wb.known
                            ? ('世界书常驻 ' + wb.chars + ' 字符/' + wb.tokens + ' token（' + wb.constantCount + ' 条；全库上限 ' + wb.upperChars + '）')
                            : ('世界书占用未知（' + String(wb.reason || '?') + '）');
                        if (pr.measurable !== true) return ['注入预演', wbTxt + ' · 预算不可测（' + String(pr.reason || '?') + '）'];
                        const sq = pr.squeeze || {};
                        const memTxt = (pr.memory && pr.memory.known)
                            ? ('候选 ' + pr.memory.chars + ' 字符 · 剩余 ' + pr.headroom.now + '')
                            : '候选面待本轮（尚未跑过注入）';
                        const isSqueezing = (sq.deltaChars > 0);
                        return ['注入预演', wbTxt + ' · ' + memTxt
                            + (isSqueezing ? (' · 挤占 ' + sq.deltaChars + ' 字符') : ' · 无挤占')
                            + (sq.pushesIntoTrim ? ' · ⚠️ 会把记忆推过裁剪线' : '')];
                    } catch (e) { errLog(e, 'selfCheck.injectionPrediction'); return ['注入预演', '—（诊断异常）']; }
                })(),
                // [v3.289.0 · X3] 注入策略对照体检面（「换预算/换策略会怎样」）。
                //   三态与本仓其余诊断行同规格：模块未加载 / 没跑过注入（没得对照）/ 有读数。
                //   为何单独一行而不并进「注入预演」：预演答「这套配置会怎样」，
                //   对照答「换成别套会怎样」——后者**没得判时是「没跑过」**，
                //   而前者没得判是「模块缺席」，两种缺席归因不同，压成一行会混。
                (() => {
                    try {
                        const cmp = this._projectionStrategyCompare();
                        if (!cmp) {
                            const pr = this._projectionPrediction();
                            if (!pr) return ['策略对照', '模块未加载（projection-pipeline.js）'];
                            if (pr.measurable !== true) return ['策略对照', '预演不可测（' + String(pr.reason || '?') + '）⇒ 不对照'];
                            return ['策略对照', '候选面待本轮（尚未跑过注入）'];
                        }
                        const d = cmp.diff || {};
                        const rows = Array.isArray(d.rows) ? d.rows : [];
                        const base = rows.find((r) => r.id === d.baseId) || rows[0] || {};
                        const parts = rows.map((r) => r.id + ':' + (r.measurable
                            ? (String(r.budgetNow) + '/' + String(r.headroomNow) + (r.pushesIntoTrim ? '⚠️推过线' : ''))
                            : '不可测'));
                        return ['策略对照', '来源 ' + cmp.activation
                            + ' · 基准 ' + String(base.id || '?')
                            + ' · ' + parts.join(' ')
                            + (cmp.scope && cmp.scope.limited ? ' · 范围有限' : '')];
                    } catch (e) { errLog(e, 'selfCheck.strategyCompare'); return ['策略对照', '—（诊断异常）']; }
                })(),
                // [v3.291.0 · X4] 手机事实准入体检面（「这条手机事实能不能进引擎」）。
                //   四态与本仓其余诊断行同规格：面未加载 / 桥缺席（手机未装）/ 桥旧（无准入面）
                //   / 有读数。★ 刻意与「策略对照」分列：那条答「换成别套配置会怎样」，
                //   这条答「手机送来的这条事实算不算事实」——两种缺席归因完全不同。
                (() => {
                    try {
                        const FA = _factAdmissionLib();
                        if (!FA || typeof FA.admissionLine !== 'function') return ['手机准入', '模块未加载（native-fact-admission.js）'];
                        const bridge = window.VirtualPhone?.lonshaBridge;
                        const probe = (typeof FA.probeCounterpart === 'function') ? FA.probeCounterpart(bridge) : { state: 'absent', reason: 'probe-absent' };
                        const rep = this._lastFactAdmissionRecall || this._lastFactAdmissionReport || null;
                        if (!rep && probe.state !== 'capable') return ['手机准入', FA.admissionLine({ measurable: true, probe: probe, byDecision: {}, byReason: {}, merged: 0 })];
                        if (!rep) return ['手机准入', '候选面待本轮（尚未跑过注入）'];
                        return ['手机准入', FA.admissionLine(Object.assign({}, rep, { probe: probe }))];
                    } catch (e) { errLog(e, 'selfCheck.factAdmission'); return ['手机准入', '—（诊断异常）']; }
                })(),
                // [v3.291.0 · X4] 手机事实准入体检面（「这条手机事实能不能进引擎」）。
                //   四态与本仓其余诊断行同规格：面未加载 / 桥缺席（手机未装）/ 桥旧（无准入面）
                //   / 有读数。★ 刻意与「策略对照」分列：那条答「换成别套配置会怎样」，
                //   这条答「手机送来的这条事实算不算事实」——两种缺席归因完全不同。
                (() => {
                    try {
                        const FA = _factAdmissionLib();
                        if (!FA || typeof FA.admissionLine !== 'function') return ['手机准入', '模块未加载（native-fact-admission.js）'];
                        const bridge = window.VirtualPhone?.lonshaBridge;
                        const probe = (typeof FA.probeCounterpart === 'function') ? FA.probeCounterpart(bridge) : { state: 'absent', reason: 'probe-absent' };
                        const rep = this._lastFactAdmissionRecall || this._lastFactAdmissionReport || null;
                        if (!rep && probe.state !== 'capable') return ['手机准入', FA.admissionLine({ measurable: true, probe: probe, byDecision: {}, byReason: {}, merged: 0 })];
                        if (!rep) return ['手机准入', '候选面待本轮（尚未跑过注入）'];
                        return ['手机准入', FA.admissionLine(Object.assign({}, rep, { probe: probe }))];
                    } catch (e) { errLog(e, 'selfCheck.factAdmission'); return ['手机准入', '—（诊断异常）']; }
                })(),
                // [v3.180] 楼层真源落笔面：覆盖度是**现算**读数（不入快照存盘），把「哪些楼还没落笔」
                //   连同失效原因一并念出来。口径：模块未加载如实报（不装成「无缺口」）；无缺口安静；
                //   有缺口标 ⚠️——「有缺陷时告警、没缺陷时安静」与前述各行同规格。
                (() => {
                    try {
                        const line = (typeof this._floorLedgerLine === 'function') ? this._floorLedgerLine() : '—';
                        const cov = (typeof this._floorLedgerCoverage === 'function') ? this._floorLedgerCoverage() : null;
                        const bad = !!(cov && cov.enabled === true && cov.complete === false);
                        const dead = !!(cov && cov.enabled !== true);
                        return ['楼层落笔', line + ((bad || dead) ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.floorLedger'); return ['楼层落笔', '—（诊断异常）']; }
                })(),
                // [v3.180] 年龄锚点读数面：三态必须可分辨（exact=原值 / estimated=推算 /
                //   anchor-only=算不出，只给原文与锚点）。修前「算不出」被静默回落成静态原值，
                //   与「原值即准」同形——三态塌成两态，用户无从知道那个数字是不是猜的。
                (() => {
                    try {
                        const st = this.status;
                        if (!st) return ['年龄锚点', '—（状态层不可用）'];
                        const A = (typeof st._ageAnchor === 'function') ? st._ageAnchor() : null;
                        if (!A || typeof A.ageDisplay !== 'function') return ['年龄锚点', '模块未加载（age-anchor.js）⚠️'];
                        const p = st.protagonist || {};
                        if (!p.age && !p.ageAnchorTime) return ['年龄锚点', '无档案'];
                        const now = this.clock?.date || this.getLatestStoryDate?.() || '';
                        const d = A.ageDisplay(p.age, p.ageAnchorTime, now, {
                            calcAge: (a, b) => this.clock?.calcAge?.(a, b),
                            parseFn: (s) => this.clock?.parseStoryDate?.(s)
                        });
                        const state = (d && d.state) || 'exact';
                        const shown = (d && d.text) || p.age || '—';
                        // anchor-only 是**主动报警态**：不给数字，且必须让人看见「为什么没数字」。
                        const flag = (state === 'anchor-only') ? ' ⚠️ 算不出（只给原文与锚点）' : '';
                        const bad = (typeof A.checkInvariants === 'function') ? A.checkInvariants(p) : [];
                        return ['年龄锚点', `${state}(${shown})${p.ageAnchorTime ? ' @' + p.ageAnchorTime : ''}${flag}${bad.length ? ' · 违规 ' + bad.join(',') : ''}`];
                    } catch (e) { errLog(e, 'selfCheck.ageAnchor'); return ['年龄锚点', '—（诊断异常）']; }
                })(),
                // [v3.183] 摘要来源体检面：本版把「摘要在落笔时来自哪一页」变成可查字段，
                //   诊断面就必须能读出「现在有多少条对不上、分别为什么」。口径与前述各行同规格：
                //   模块未加载如实报（不装成「无缺口」）、无缺口安静、真对不上才 ⚠️。
                (() => {
                    try {
                        const line = (typeof this._summaryProvenanceLine === 'function') ? this._summaryProvenanceLine() : '—';
                        const st = this._summaryProvenanceStamp;
                        // module-unavailable（未接线）与 ok（无缺口）都不报警；stale/thrown 才报。
                        const bad = !!(st && st.status !== 'ok' && st.status !== 'module-unavailable');
                        return ['摘要来源', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.summaryProvenance'); return ['摘要来源', '—（诊断异常）']; }
                })(),
                // [v3.183] 分支守护体检面：**被拦是正常的**（说明保护生效，不该报警），
                //   真正要警惕的是三张队列长期不清——翻页/重生成后没人来认领，积压即症状。
                (() => {
                    try {
                        const line = (typeof this._branchGuardLine === 'function') ? this._branchGuardLine() : '—';
                        const s = (this._branchGuard && typeof this._branchGuard.stats === 'function') ? this._branchGuard.stats() : null;
                        const backlog = s ? (s.request + s.apply + s.swipe) : 0;
                        return ['分支守护', line + (backlog > 0 ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.branchGuard'); return ['分支守护', '—（诊断异常）']; }
                })(),
                // [v3.183] 条目关联体检面：关联**只报告不写图**，所以这里不回答「连了几条边」，
                //   只回答「词表多大、有多少词被拒收」。拒收必须是可见的——否则
                //   「词表压根没建起来」与「建了但全是短词被拒」在读数上同形。
                (() => {
                    try {
                        const line = (typeof this._crosslinkLine === 'function') ? this._crosslinkLine() : '—';
                        const idx = this._crosslinkIndex;
                        const s = (idx && typeof idx.stats === 'function') ? idx.stats() : null;
                        const bad = !!(s && s.keywords > 0 && s.rejected > 0);
                        return ['条目关联', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.crosslink'); return ['条目关联', '—（诊断异常）']; }
                })(),
                // [v3.184] 图谱汇总体检面：回答「图里现在有几层汇总、盖住多少子节点、
                //   最近一轮维护压成了几层 / 回收了几个孤儿」。要警惕的不是「压成 0 层」
                //   （节点本来就不够一批，属正常），而是**维护管线从没跑过**——
                //   那说明 graph-rollup 步骤压根没被触发（此前 vacuum 零调用点即此形态）。
                (() => {
                    try {
                        const line = (typeof this._graphRollupLine === 'function') ? this._graphRollupLine() : '—';
                        const ran = !!this._graphRollupRead;
                        const rr = this.graph && this.graph._rollupRead;
                        const stuck = !!(rr && rr.rejected > 0 && !rr.created);
                        return ['图谱汇总', line + (stuck ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.graphRollup'); return ['图谱汇总', '—（诊断异常）']; }
                })(),
                // [v3.184] 关系披露体检面：**跳过是正常的**（说明筛选在工作，不该报警），
                //   真正要警惕的是 invalid > 0 —— 作者写了条件却一个都编译不出来，
                //   该关系被静默放行、筛选对它就等于没接。积压式失效必须可见。
                (() => {
                    try {
                        const line = (typeof this._relationDisclosureLine === 'function') ? this._relationDisclosureLine() : '—';
                        const c = this._relationDisclosureRead && this._relationDisclosureRead.counts;
                        const bad = !!(c && (c.invalid > 0 || c.truncated > 0));
                        return ['关系披露', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.relationDisclosure'); return ['关系披露', '—（诊断异常）']; }
                })(),
                // [v3.219.0] R2-F 双向关系对账体检面：**对侧未登记才是该补记的**。
                //   「对侧本轮被挡」「对侧已失效」是正常态（前者等情境、后者是历史），
                //   与「对侧压根不在图里」压成一格会让读者去补一条不该补的关系。
                //   报警只认 oneSided > 0（真损失）与 degraded（算炸了）。
                (() => {
                    try {
                        const line = (typeof this._relationMutualLine === 'function') ? this._relationMutualLine() : '—';
                        const r = this._relationMutualRead;
                        const bad = !!(r && (r.oneSided > 0 || r.degraded));
                        return ['双向对账', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.relationMutual'); return ['双向对账', '—（诊断异常）']; }
                })(),
                // [v3.219.0] R2-F 知情网络体检面：**疑似未合并必须可见**。
                //   它是唯一说不出结论的那一档（告知式措辞判不开），并进任何一格都会让读者
                //   以为「判过了」—— 那正是修前「认知隔离永不解除」看起来像「本来就没有」的原因。
                (() => {
                    try {
                        const line = (typeof this._knowledgeNetworkLine === 'function') ? this._knowledgeNetworkLine() : '—';
                        const r = this.worldProg && this.worldProg._knowledgeRead;
                        const bad = !!(r && r.suspect > 0);
                        return ['知情网络', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.knowledgeNetwork'); return ['知情网络', '—（诊断异常）']; }
                })(),
                // [v3.291.0 · X5] 知识轨迹体检面：与「知情网络」**分列**。
                //   知情网络答「是不是同一件事」（判定），本行答「这条知识在第几楼、
                //   从谁、经哪条证据取得的」（轨迹）—— 合成一行会让「判不开」与
                //   「没记录」两类完全不同的问题共用一个提示位。
                //   报警只认两条真损失：截断（丢了轨迹）与纠正链断裂（纠正指向的
                //   轨迹已被删楼撤销 ⇒ 那个误信现在无人可证）。
                (() => {
                    try {
                        if (this.worldProg && typeof this.worldProg.refreshKnowledgeTraceRead === 'function') {
                            this.worldProg.refreshKnowledgeTraceRead();
                        }
                        const line = (typeof this._knowledgeTraceLine === 'function') ? this._knowledgeTraceLine() : '—';
                        const r = this.worldProg && this.worldProg._knowledgeTraceRead;
                        const bad = !!(r && ((r.truncated || 0) > 0 || (r.orphaned || 0) > 0 || r.degraded));
                        return ['知识轨迹', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.knowledgeTrace'); return ['知识轨迹', '—（诊断异常）']; }
                })(),
                    // [v3.323.0 · M3-X2] 关系变化史体检面：与「双向对账」**分列**。
                    //   对账行答「这一轮的对侧在不在」，本行答「这对人是**怎么走到今天**的」——
                    //   合成一行会让「对侧没登记」与「楼号出处不明」共用一个提示位。
                    //   报警只认两条真损失：出处不明（无法编进任何时间序）与按名聚合
                    //   （同名异人会被合并成一对 —— 本仓点名的「同名不同物」形态）。
                    (() => {
                    try {
                    const line = (typeof this._relationHistoryLine === 'function') ? this._relationHistoryLine() : '—';
                    const r = this._relationHistoryRead;
                    const bad = !!(r && ((r.counts && r.counts.noFloor > 0) || r.byName || r.degraded));
                    return ['关系变化', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.relationHistory'); return ['关系变化', '—（诊断异常）']; }
                    })(),
                    // [v3.323.0 · M3-X3] 因果链体检面：**四类收口各自可见**（完成 / 作废 / 违约 / 未收口）。
                    //   本行要治的正是「取消被当成回收」「违约被当成完成」—— 压成一格就再也看不出来。
                    //   报警只认两条真损失：悬空边（连到不存在的节点 ⇒ 这条因果是断的）与截断
                    //   （图上少了一段而读数看不出来）。
                    (() => {
                    try {
                    const line = (typeof this._causalChainLine === 'function') ? this._causalChainLine() : '—';
                    const r = this._causalChainRead;
                    const bad = !!(r && ((r.counts && ((r.counts.danglingEdges || 0) > 0 || (r.counts.malformedEdges || 0) > 0))
                    || (r.truncated || 0) > 0 || (r.edgesTruncated || 0) > 0 || r.degraded));
                    const prop = (typeof this.causalChainProposals === 'function') ? (this.causalChainProposals({}) || []).length : 0;
                    return ['因果链', line + (prop ? (' · 候选边 ' + prop + '（**未确认**）') : '') + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.causalChain'); return ['因果链', '—（诊断异常）']; }
                    })(),
                    // [v3.323.0 · M3-X4] 视角卡体检面：与「知识轨迹」「知识预演」**分列**。
                    //   轨迹行答「这条知识怎么来的」、预演行答「若传播会怎样」，
                    //   本行答「**这个角色在这个时点手上到底有哪些、哪些是误信、哪些我们没记过**」。
                    //   报警只认两条真损失：误信（不得写成世界真相）与无楼层（未计入任何时点）。
                    (() => {
                    try {
                    const line = (typeof this._perspectiveCardLine === 'function') ? this._perspectiveCardLine() : '—';
                    const r = this._perspectiveCardRead;
                    const bad = !!(r && ((r.counts && ((r.counts.misled || 0) > 0 || (r.counts.noFloor || 0) > 0)) || r.degraded));
                    return ['视角卡', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.perspectiveCard'); return ['视角卡', '—（诊断异常）']; }
                    })(),
                    // [v3.324.0 · M3-O5] 抽取节奏体检面：与「门控读数」**分列**。
                    //   门控行答「这一楼值不值得花 LLM」，本行答「按剧情变化该怎么排」——
                    //   合成一行会让「这一楼平淡」与「关键事件被推到周期楼外」共用一个提示位。
                    //   报警只认两条真损失：未读到（内容都没读到 ⇒ 不是「没什么可抽」）
                    //   与「错过但无楼号」（补不回来 ≠ 补得回来）。
                    (() => {
                    try {
                    const line = (typeof this._extractionDriverLine === 'function') ? this._extractionDriverLine() : '—';
                    const r = this._extractionDriverRead;
                    const bad = !!(r && r.ok && ((Number(r.readings && r.readings.unreadable) || 0) > 0
                    || (Number(r.missed && r.missed.noFloor) || 0) > 0));
                    return ['抽取节奏', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.extractionDriver'); return ['抽取节奏', '—（诊断异常）']; }
                    })(),
                    // [v3.324.0 · M3-O7 + M3-X9] 纠错方案体检面：与「提取反馈」**分列**。
                    //   反馈行答「提取错在哪一类、建议有没有据」，本行答「改哪 / 补哪段 /
                    //   撤的是配置还是事实」并报与原文的对照四态。
                    //   报警只认两条真损失：归类未定（收了反馈但归不出面）与冲突对照
                    //   （同一事实两个值 —— 混进「替换」就等于把「改了口径」当「更新了一版」）。
                    (() => {
                    try {
                    const line = (typeof this._correctionPlanLine === 'function') ? this._correctionPlanLine() : '—';
                    /* ★ 判据取**两面真跑的返回值**而不是共用的缓存格：
                     *   两个出口共写 `_correctionPlanRead`，只看缓存会让 bad 由「最后一次写入者」决定
                     *   —— 数据面报过的冲突对照会因为随后一次配置面调用而被抹掉。 */
                    const _rx = (typeof this.correctionPlanReextract === 'function') ? this.correctionPlanReextract({}, {}) : null;
                    const _cf = (typeof this.correctionPlanConfig === 'function') ? this.correctionPlanConfig([], null, {}) : null;
                    const bad = !!((_rx && _rx.ok && (Number(_rx.byOutcome && _rx.byOutcome.conflicted) || 0) > 0)
                    || (_cf && _cf.ok && (Number(_cf.unknownClass) || 0) > 0));
                    return ['纠错方案', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.correctionPlan'); return ['纠错方案', '—（诊断异常）']; }
                    })(),
                /* [v3.315.0 · M-X5] 知识传播预演体检面：与「知识轨迹」**分列**。
                 *   轨迹面答**过去**（这条知识在第几楼、从谁、经哪条证据取得的），
                 *   本行答**事前**（若按这条路传播，谁的认知会从哪一格变到哪一格）——
                 *   合成一行会让「下笔前能预演」与「下笔后能回看」共用一个提示位。
                 *   报警只认两条真损失：依赖缺格（轨迹内核缺席 ⇒ 判不了）与
                 *   「判不了」与「改不动」同形（本仓最贵的老账）。 */
                (() => {
                    try {
                        const KP = _knowledgePreviewLib();
                        if (!KP || typeof KP.line !== 'function' || typeof this.knowledgePreviewLine !== 'function') {
                            return ['知识预演', '模块未加载（knowledge-preview.js）'];
                        }
                        const d = this.knowledgePreviewDescribe();
                        const bad = !!(d.missingDeps && d.missingDeps.length)
                            || !!(this._lastPreview && this._lastPreview.decidable === false);
                        return ['知识预演', this.knowledgePreviewLine() + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.knowledgePreview'); return ['知识预演', '—（诊断异常）'];
                    }
                })(),
                /* [v3.316.0 · M-X7] 提取质量反馈体检面：与「召回解释」**分列**。
                 *   召回面答「召回链路断在哪一格」，本行答「提取错在哪一类、建议有没有据」——
                 *   合成一行会让「这次没召回」与「这次提错了」共用一个提示位（处置面完全不同）。
                 *   报警只认两条真损失：对照缺格（建议一律 unproven ⇒ 判不了）与
                 *   未归类 / 依据不全 > 0（收了反馈但归不出面 / 改完无从归因）。 */
                (() => {
                    try {
                        const FB = _extractFeedbackLib();
                        if (!FB || typeof FB.line !== 'function' || typeof this.extractFeedbackLine !== 'function') {
                            return ['提取反馈', '模块未加载（extract-feedback.js）'];
                        }
                        const d = this.extractFeedbackDescribe();
                        const t = this._lastFeedbackTally || null;
                        const bad = !!(d.missingDeps && d.missingDeps.length)
                            || !!(t && (t.unknown > 0 || t.unlinked > 0));
                        return ['提取反馈', this.extractFeedbackLine() + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.extractFeedback'); return ['提取反馈', '—（诊断异常）'];
                    }
                })(),
                // [v3.306.0 · M-O8] 秘密注入侧隔离面：与「认知隔离提示」分列。
                //   认知面答「他此前不在场、还不知情」；本行答「注入时挡下几条、
                //   其中几条**判不了**（条目没给知情名单）」。报警只认两条真损失：
                //   版本错配（该挡的没挡成，已 fail-closed）与判不了 > 0
                //   （边界无从判起 —— 不是「没秘密」，是「判不了」）。
                (() => {
                    try {
                        const line = (typeof this._secretIsolationLine === 'function') ? this._secretIsolationLine() : '—';
                        const r = this.worldProg && this.worldProg._secretRead;
                        const bad = !!(r && ((r.malformed || 0) > 0 || (r.undecided || 0) > 0));
                        return ['秘密隔离', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.secretIsolation'); return ['秘密隔离', '—（诊断异常）']; }
                })(),
                // [v3.293.0 · X6] 分支语义体检面：与「知识轨迹」**分列**。
                //   轨迹行答「这条知识是怎么来的」，本行答「两个分支逐 owner 的语义差在哪、
                //   哪一面因缺模块而不可比」。★ 不可比面必须与「无差异」分列：把「没比」
                //   读成「一样」正是 X6 要治的（不可比 ≠ 相等）。
                (() => {
                    try {
                        const line = (typeof this._branchSemanticsLine === 'function') ? this._branchSemanticsLine() : '—';
                        const r = this.worldProg && this.worldProg._branchSemanticsRead;
                        const bad = !!(r && ((r.incomparable || 0) > 0 || (r.filtered || 0) > 0 || r.degraded));
                        return ['分支语义', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.branchSemantics'); return ['分支语义', '—（诊断异常）']; }
                })(),
                // [v3.293.0 · X7] 分卷接续体检面：与「分支语义」「知识轨迹」**分列**。
                //   本行答「用户选没选长篇项目、那一卷能接续几条、哪一面缺、有几个同名候选被挡、
                //   旧源还在不在」。★ 「没选项目（维持隔离）」必须与「选了但零条」分列 ——
                //   把两者并成一格，正是 X7 验收第一条（不选项目时维持完全隔离）会被读错的地方。
                //   报警只认三条真损失：缺面 / 同名候选被挡 / 源不可跳转。
                (() => {
                    try {
                        const line = (typeof this._volumeContinuationLine === 'function') ? this._volumeContinuationLine() : '—';
                        const r = this.worldProg && this.worldProg._volumeContinuationRead;
                        const bad = !!(r && ((r.absentFaceCount || 0) > 0 || (r.nameOnlyCount || 0) > 0
                            || (r.selected === true && r.navigable === false)));
                        return ['分卷接续', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.volumeContinuation'); return ['分卷接续', '—（诊断异常）']; }
                })(),
                /* [v3.317.0 · M-X3] 项目管理体检面：与「分卷接续」**分列**。
                 *   接续行答「这一卷怎么接出去」，本行答「**项目存在不存在、挂在哪儿**」——
                 *   合成一行会让「没选项目（维持隔离）」与「选了但零卷」共用一个提示位，
                 *   而验收①点名的正是前者。
                 *   报警只认两条真损失：目录依赖缺格（卷与源状态一律判不了）与
                 *   「判不了」与「改不动」同形（本仓最贵的老账）。 */
                (() => {
                    try {
                        const PR = _projectRegistryLib();
                        if (!PR || typeof PR.line !== 'function' || typeof this.projectRegistryLine !== 'function') {
                            return ['项目管理', '模块未加载（project-registry.js）'];
                        }
                        const d = this.projectRegistryDescribe();
                        const bad = !!(d.missingDeps && d.missingDeps.length)
                            || d.indeterminateDistinct === false;
                        return ['项目管理', this.projectRegistryLine() + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.projectRegistry'); return ['项目管理', '—（诊断异常）'];
                    }
                })(),
                // [v3.294.0 · X8] 召回解释面：与「召回自检」「注入读数」**分列**。
                //   那两行分别答「召回了什么」「最终送进去什么」；本行答
                //   **「这一轮到底卡在哪一档」** —— 缺源 / 无命中 / 别名挡下 /
                //   有效性挡下 / 预算裁掉 / 已注入 / 判不了，七档互斥且带改法。
                //   ★ 报警只认「判不了」：那一档说明**连有没有候选都不知道**，
                //   是唯一必须立刻去修观测面的形态；其余五档都是正常断点。
                (() => {
                    try {
                        const line = (typeof this._recallExplainLine === 'function') ? this._recallExplainLine() : '—';
                        const ex = (typeof this.explainRecallHost === 'function') ? this.explainRecallHost() : null;
                        const ok = !!(ex && ex.ok === true);
                        const bad = ok && (ex.degraded === true || ex.verdict.stage === 'unknown');
                        const hint = ok ? '（按需看阶段表）' : '';
                        return ['召回解释', line + (bad ? ' ⚠️' : '') + hint];
                    } catch (e) { errLog(e, 'selfCheck.recallExplain'); return ['召回解释', '—（诊断异常）']; }
                })(),
                // [v3.184] 提示词填充体检面：**未填**与**残留**都要现形。
                //   残留（占位符写成了全角/带空格形态）意味着这一处根本没填进去，
                //   而模型收到的是一句模板语法——修前这件事零日志、零提示。
                (() => {
                    try {
                        const line = (typeof this._promptFillLine === 'function') ? this._promptFillLine() : '—';
                        const a = this._promptFillRead, b = this._promptFillReadRoles;
                        const bad = !!((a && a.leftover && a.leftover.length) || (b && b.leftover && b.leftover.length));
                        return ['提示词填充', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.promptFill'); return ['提示词填充', '—（诊断异常）']; }
                })(),
                // [v3.184] 行级变更体检面：回答「这一格从前是多少、现在是多少」——
                //   OpLog 只答「做了什么动作」、SnapshotManager 只答「哪楼存了整份快照」，
                //   撤销一次误改需要的那个数（原值）此前无处可查。
                //   不报警的场景：「无变更」是正常的；真该警惕的是非法输入（写入点传了空键）。
                (() => {
                    try {
                        const cs = _changeset();
                        if (!cs) return ['行级变更', '模块未加载（changeset.js）'];
                        const line = (typeof this._changesetLine === 'function') ? this._changesetLine() : '—';
                        const bad = !!cs.badInput;
                        return ['行级变更', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.changeset'); return ['行级变更', '—（诊断异常）']; }
                })(),
                // [v3.185] 条目关联**消费面**体检：上面那行报的是「词表多大、候选几条」——
                //   候选算出来却没人用时它照样好看（本版修的就是这个形态）。本行回答「产出有没有被用掉」。
                //   要警惕的不是「本轮无可提关联」（正文没同时提到某条已确认关系的两端，属正常），
                //   而是**摘要一条都没进表**：那意味着关联对召回侧等于没接（生产跑着、消费恒空）。
                (() => {
                    try {
                        const line = (typeof this._crosslinkConsumeLine === 'function') ? this._crosslinkConsumeLine() : '—';
                        const hasSums = !!(this.summary && typeof this.summary.getActiveSummaries === 'function'
                            && this.summary.getActiveSummaries().length);
                        const idle = !!(hasSums && this._xrefIdx != null && !Number(this._crosslinkXrefN || 0));
                        return ['条目复用', line + (idle ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.crosslinkConsume'); return ['条目复用', '—（诊断异常）']; }
                })(),
                // [v3.186] 情绪反向召回体检面：回答「负面的当下有没有想起相对的那一面」。
                //   （措辞说明：本行刻意不连写「召回」「体检」四字——旧审计以该短语作为导出报告块的
                //   固定文本定位锚，在这里复用会把窗口撑偏，属「新注释扰动旧锚点」，与实现无关。）
                //   要警惕的**不是**「本轮无反向线索」——没有情绪词、主导维是「悬」（极性 0）
                //   都属正常；真该亮灯的是**长期空转**：真扫过 5 轮以上却一条都没提过，
                //   那说明反向词表与正文永远对不上，机制等于白接。
                (() => {
                    try {
                        const line = (typeof this._emotionOppositeLine === 'function') ? this._emotionOppositeLine() : '—';
                        const r = this._emoOppositeRead;
                        const idle = !!(r && r.reason === 'ok' && Number(this._emoOppositeRounds || 0) >= 5
                            && !Number(this._emoOppositeBoosted || 0));
                        return ['情绪反向', line + (idle ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.emotionOpposite'); return ['情绪反向', '—（诊断异常）']; }
                })(),
                // [v3.193.0] 注入成本体检面：回答「这一轮 prompt 里谁占了多少」。
                //   三态必须可分，否则「模块没接上」与「这轮注入为空」同形：
                //     · 模块未加载 / 尚无注入 → _lastCostLedger 为 null（不是「成本为 0」）
                //     · 账目不自洽（identity.ok=false）→ 亮 ⚠️，账本自己报自己算错了
                (() => {
                    try {
                        const CL = _costLedgerLib();
                        if (!CL || typeof CL.costLine !== 'function') return ['注入成本', '模块未加载（cost-ledger.js）'];
                        const lg = this._lastCostLedger;
                        if (!lg) return ['注入成本', '待本轮（尚无注入）'];
                        const line = CL.costLine(lg);
                        const bad = lg.identity && lg.identity.ok === false;
                        return ['注入成本', line + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.costLedger'); return ['注入成本', '—（诊断异常）']; }
                })(),
                // [v3.208.0] 成本**预测**体检面：回答「这一轮预计注入多少、有没有按预期走」。
                //   与上一行的分工是**时态**：上行事后（已注入的），这行事前（本该注入的）+对账。
                //   三态可分：模块未加载 / 尚未预测 / 有预测（drift 或不可测才标 ⚠️）。
                //   ⚠️ 的三义必须区分（否则「测不了」会被读成「一致」）：
                //     · not-measurable —— 预测或实测任一侧缺料，**不得**降级成「一致」
                //     · drift          —— 逐项偏差，且 why 里点名是哪个量偏了多少
                (() => {
                    try {
                        const CF = _costForecastLib();
                        if (!CF || typeof CF.forecastLine !== 'function') return ['成本预测', '模块未加载（cost-forecast.js）'];
                        const fc = this._lastForecast;
                        if (!fc) return ['成本预测', '待本轮（尚未预测）'];
                        const line = CF.forecastLine(fc);
                        const rc = this._lastReconcile;
                        const note = rc ? (rc.verdict === 'match' ? '｜对账一致'
                            : (rc.verdict === 'drift' ? '｜对账漂移：' + rc.why : '｜对账不可测：' + rc.why)) : '｜对账未做';
                        const bad = !!(rc && rc.verdict !== 'match');
                        return ['成本预测', line + note + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.costForecast'); return ['成本预测', '—（诊断异常）']; }
                })(),
                // [v3.194] 时间与事实版本：回答「同一格事实账上有几个版本、多少已闭合、多少只是推测」。
                //   三态可分：模块未加载 / 尚无事实 / 有账（含未决冲突 ⚠️）。
                (() => {
                    try {
                        const FV = _factVersionLib();
                        if (!FV || typeof FV.line !== 'function') return ['事实版本', '模块未加载（fact-version.js）'];
                        if (!this._factVersionState) return ['事实版本', '待本轮（尚无事实账）'];
                        return ['事实版本', FV.line(this._factVersionState)];
                    } catch (e) { errLog(e, 'selfCheck.factVersion'); return ['事实版本', '—（诊断异常）'];
                    }
                })(),
                // [v3.299.0 · M-O6] 事实状态：回答「这条事实现在算不算数」这个**独立于版本**的问题。
                //   为什么不并进「事实版本」那一行：版本行答「同格几个版本、多少闭合」，
                //   状态行答「多少条允许进载荷 + **本版挡下了哪几条旧口径会放行的**」。
                //   后者是 M-O6 修复的量化读数（点名到 id），压进版本行就看不见了。
                (() => {
                    try {
                        const FS = _factStateLib();
                        if (!FS || typeof FS.line !== 'function') return ['事实状态', '模块未加载（fact-state.js）'];
                        if (!this._factVersionState) return ['事实状态', '待本轮（尚无事实账）'];
                        return ['事实状态', FS.line(this._factVersionState)];
                    } catch (e) { errLog(e, 'selfCheck.factState'); return ['事实状态', '—（诊断异常）'];
                    }
                })(),
                // [v3.210] 记忆类型：回答「账上事实按类型怎么分布、有多少条还没归类、有没有类型名被拒」。
                //   三态可分：模块未加载 / 尚无事实账 / 有账（未归类亮 ⚠️）。
                //   为什么不并进上一行：上一行答的是「多少个版本、多少未决」，这一行答的是
                //   「这些事实**各自守什么规则**」——压成一行会让「类型没接上」与「类型都接上了但都没标」
                //   看起来一样（正是本版要修的那种「该可分的读数被压成一态」）。
                (() => {
                    try {
                        const MT = _memoryTypeLib();
                        if (!MT || typeof MT.lineByType !== 'function') return ['记忆类型', '模块未加载（memory-type.js）'];
                        if (!this._factVersionState) return ['记忆类型', '待本轮（尚无事实账）'];
                        const base = MT.lineByType(this._factVersionState);
                        const rd = this._memoryTypeRead;
                        // 读取数只报**有信息量**的部分：全部走旧路径（无类型）时 base 已经用「未归类 N」说了，
                        //   再补一句「类型化 0」是重复；只有真的走了类型化、或真的拒了非法类型名才追加。
                        const extra = [];
                        if (rd && !rd.moduleMissing) {
                            if (rd.typed) extra.push('类型化 ' + rd.typed);
                            if (rd.unknown) extra.push('类型名未知被拒 ' + rd.unknown + (rd.samples?.length ? '（如 ' + rd.samples.join(' / ') + '）' : ''));
                            if (rd.refused) extra.push('策略拒绝 ' + rd.refused);
                        }
                        return ['记忆类型', extra.length ? (base + ' · ' + extra.join(' · ')) : base];
                    } catch (e) { errLog(e, 'selfCheck.memoryType'); return ['记忆类型', '—（诊断异常）']; }
                })(),
                // [v3.194] 事件完整性：回答「有几条线，几条还缺结果/后续」。
                //   未完成事项是**交付物**不是缺陷，故 'open' 不亮 ⚠️；越序（result 早于 action）才亮。
                (() => {
                    try {
                        const EC = _eventCompletenessLib();
                        if (!EC || typeof EC.line !== 'function') return ['事件完整', '模块未加载（event-completeness.js）'];
                        if (!this._eventThreadState) return ['事件完整', '待本轮（尚无事件线）'];
                        return ['事件完整', EC.line(this._eventThreadState)];
                    } catch (e) { errLog(e, 'selfCheck.eventCompleteness'); return ['事件完整', '—（诊断异常）'];
                    }
                })(),
                // [v3.233.0] F-2：事件**来源构成**。与上一行是两个不同的问题：
                //   「事件完整」答的是这条线缺哪一段；本行答的是这条线里的段**从哪来**
                //   （插件从正文提的 / 手机 App 里发生的 / 其它 / 没标）。
                //   为什么要分开：段的 source 此前是从未被折算的自由文本，全仓唯一赋值点是
                //   `_absorbEventSegments` 写死的 'extract' —— 下游于是答不出「这条是插件提的、
                //   还是手机侧发生的」，而这正是 F-2（跨平台事件）要回答的第一件事。
                //   只按受控词表**分级计数**，不做文本猜测（同 plan 的 T11 纪律）。
                (() => {
                    try {
                        const EC = _eventCompletenessLib();
                        if (!EC || typeof EC.platformLine !== 'function') return ['事件来源', '模块未加载（event-completeness.js）'];
                        if (!this._eventThreadState) return ['事件来源', '待本轮（尚无事件线）'];
                        return ['事件来源', EC.platformLine(this._eventThreadState)];
                    } catch (e) { errLog(e, 'selfCheck.eventPlatform'); return ['事件来源', '—（诊断异常）'];
                    }
                })(),
                // [v3.194] 修复闭环：回答「修过几次、几次还没落定」。
                //   「修了但有一处没跟上」必须看得见（line 里未落定/部分完成自带 ⚠️）。
                (() => {
                    try {
                        const RL = _repairLoopLib();
                        if (!RL || typeof RL.line !== 'function') return ['记忆修复', '模块未加载（repair-loop.js）'];
                        if (!this._repairState) return ['记忆修复', '待本轮（尚无修复记录）'];
                        return ['记忆修复', RL.line(this._repairState)];
                    } catch (e) { errLog(e, 'selfCheck.repairLoop'); return ['记忆修复', '—（诊断异常）'];
                    }
                })(),
                /* [v3.311.0 · M-X2] 修复**落定面**：回答「这一条到底改完没有、改的东西
                 *   是不是同一代、有没有该重试的项、旧预览还能不能用、召回缓存跟没跟上」。
                 *   与「记忆修复」（那一行答「有几条修复、落定了几条」）是两个问题：
                 *   那一行读的是 **repair-loop 的流程态**，本行读的是 **落定与同代**。
                 *   四种坏法可分：模块未加载 / 依赖缺格（⚠️）/ 词表不自洽（⚠️）/ 面在位。 */
                (() => {
                    try {
                        const RS = _repairSettleLib();
                        if (!RS || typeof RS.line !== 'function' || typeof this.repairSettleLine !== 'function') {
                            return ['修复落定', '模块未加载（repair-settle.js）'];
                        }
                        return ['修复落定', this.repairSettleLine()];
                    } catch (e) { errLog(e, 'selfCheck.repairSettle'); return ['修复落定', '—（诊断异常）'];
                    }
                })(),
                /* [v3.310.0 · M-X1] 用户侧记忆控制中心：回答「界面上能不能按人/楼层/来源组合查、
                 *   依赖缺没缺格、字段映射对齐没有、上次看了多少条」。与「证据查询」那行是两个问题：
                 *   那一行答「内核能不能查」，本行答「用户侧那一面在不在、齐不齐」。
                 *   四种坏法可分：模块未加载 / 依赖缺格（⚠️）/ 字段未对齐（⚠️）/ 面在位（待看 or 上次读数）。 */
                (() => {
                    try {
                        const MC = _memoryCenterLib();
                        if (!MC || typeof MC.line !== 'function' || typeof this.memoryCenterLine !== 'function') {
                            return ['记忆控制', '模块未加载（memory-center.js）'];
                        }
                        return ['记忆控制', this.memoryCenterLine()];
                    } catch (e) { errLog(e, 'selfCheck.memoryCenter'); return ['记忆控制', '—（诊断异常）'];
                    }
                })(),
                /* [v3.312.0 · M-X4] 事实生命周期：回答「这条事实以后怎么算、批量处置圈了谁、
                 *   退不退得回来、目标态到了没有」。与「事实状态」那行是两个问题：那一行答
                 *   「每一条现在处于五态里的哪一态」，本行答「我想把它怎么办、办完没办成」。
                 *   四种坏法可分：模块未加载 / 依赖缺格（⚠️）/ 口径不自洽（⚠️）/ 面在位。 */
                (() => {
                    try {
                        const FL = _factLifecycleLib();
                        if (!FL || typeof FL.line !== 'function' || typeof this.factLifecycleLine !== 'function') {
                            return ['事实生命周期', '模块未加载（fact-lifecycle.js）'];
                        }
                        return ['事实生命周期', this.factLifecycleLine()];
                    } catch (e) { errLog(e, 'selfCheck.factLifecycle'); return ['事实生命周期', '—（诊断异常）'];
                    }
                })(),
                /* [v3.313.0 · M-X8] 版本化记忆包：回答「这个包是哪个代际、能不能收、
                 *   有没有冲突与悬空、重复导会不会进两次、撤销有没有来源边界」。与「结构迁移」
                 *   那行是两个问题：那一行读的是**本机存档**的迁移现场，本行读的是**外来包**的
                 *   准入与导入；与「快照检查点」那行也不是一回事（那些绑在同一宿主的 localStorage）。
                 *   四种坏法可分：模块未加载 / 依赖缺格（⚠️）/ 口径不自洽（⚠️）/ 面在位。 */
                (() => {
                    try {
                        const MPk = _memoryPackageLib();
                        if (!MPk || typeof MPk.line !== 'function' || typeof this.memoryPackageLine !== 'function') {
                            return ['记忆包', '模块未加载（memory-package.js）'];
                        }
                        return ['记忆包', this.memoryPackageLine()];
                    } catch (e) { errLog(e, 'selfCheck.memoryPackage'); return ['记忆包', '—（诊断异常）'];
                    }
                },
                /* [v3.314.0 · M-X6] 手机事实桥 2.0：回答「这条手机事实现在处于生命周期的哪一态、
                 *   记忆侧回过什么话」—— 与上一行「手机准入」（只答算不算事实）**分列**，
                 *   两种缺席归因完全不同（准入面缺 vs 回执面缺）。 */
                () => {
                    try {
                        const PFB = _phoneFactBridgeLib();
                        if (!PFB || typeof PFB.line !== 'function' || typeof this.phoneFactBridgeLine !== 'function') {
                            return ['手机桥', '模块未加载（phone-fact-bridge.js）'];
                        }
                        return ['手机桥', this.phoneFactBridgeLine()];
                    } catch (e) { errLog(e, 'selfCheck.phoneFactBridge'); return ['手机桥', '—（诊断异常）'];
                    }
                })(),
                /* [v3.327.0 · E 包 M3-X5] 设定资料与前史分层导入:回答「这份资料分成了哪几类、
                 *   哪些名字对不上库、有几处冲突、源改了哪一段」。与上一行「记忆包」是两个问题:
                 *   那一行读的是**外来包**的准入与导入,本行读的是**作者给的设定资料**分层与映射。
                 *   四种坏法可分:模块没挂 / 四类分层不可穷尽(⚠️)/ 掩码不定长(⚠️)/ 面在位。 */
                (() => {
                    try {
                        const LI = _loreImportLib();
                        if (!LI || typeof LI.line !== 'function' || typeof this.loreImportLine !== 'function') {
                            return ['资料导入', '模块未加载(lore-import.js;分不分得出设定与已经发生过的不得而知)'];
                        }
                        return ['资料导入', this.loreImportLine()];
                    } catch (e) { errLog(e, 'selfCheck.loreImport'); return ['资料导入', '—(诊断异常)'];
                    }
                })(),
                /* [v3.327.0 · E 包 M3-X7] 故事年鉴:回答「这一章有什么值得回看、两版分没分开、
                 *   有没有段因为原文改动过期了」。与「分层摘要」那行是两个问题:那一行答「窗口里
                 *   讲过什么」(给生成用),本行答「玩家回看这一章该看什么」(四要素 / 两版 / 草稿)。
                 *   五种坏法可分:模块没挂 / 两版不可分(⚠️,作者面会被当玩家面)/ 草稿白名单未生效
                 *   (⚠️,能改到事实位)/ 泄漏扫描失效(⚠️)/ 面在位。 */
                (() => {
                    try {
                        const SA = _storyAnnualLib();
                        if (!SA || typeof SA.line !== 'function' || typeof this.storyAnnualLine !== 'function') {
                            return ['故事年鉴', '模块未加载(story-annual.js;给玩家看的是不是作者全知版不得而知)'];
                        }
                        return ['故事年鉴', this.storyAnnualLine()];
                    } catch (e) { errLog(e, 'selfCheck.storyAnnual'); return ['故事年鉴', '—(诊断异常)'];
                    }
                })(),
                /* [v3.296.0 · X1] 结构化证据查询：回答「按人/楼层/状态能不能查、登记面对没对齐、
                 *   扫了多少账、有没有账被截断」。与上面「账本实体」是两个问题：
                 *   那一行答「有多少条」，本行答「能按什么查、查的时候能看到多少」——
                 *   压成一行会让「查不到」与「没有」再次同形（正是 X1 要治的那条）。
                 *   三态可分：模块未加载 / 检索面没对齐（⚠️）/ 面在位（待用 or 上次读数）。 */
                (() => {
                    try {
                        const Q = _evidenceQueryLib();
                        if (!Q || typeof Q.line !== 'function' || typeof this.evidenceQueryLine !== 'function') {
                            return ['证据查询', '模块未加载（evidence-query.js）'];
                        }
                        const body = this.evidenceQueryLine();
                        return ['证据查询', body];
                    } catch (e) { errLog(e, 'selfCheck.evidenceQuery'); return ['证据查询', '—（诊断异常）'];
                    }
                })(),
                /* [v3.321.0 · M3-X1] 带证据问答：回答「问句能拆成哪几条受控查询、答案每句
                 *   回不回得到源、有几处是具名缺口」。与上面「证据查询」行**分列**：
                 *   那一行答「能按什么查、查的时候能看到多少」，本行答「问出来的答案
                 *   有没有出处、哪几句答不出」——压成一行会让「没查过」与「问了没答出」
                 *   同形（正是 X1/X9 那一族要治的）。
                 *   三态可分：模块未加载 / 面在位未问过 / 上次读数（含缺口数）。 */
                (() => {
                    try {
                        const Q = _evidenceQueryLib();
                        if (!Q || typeof Q.planQuestion !== 'function' || typeof this.memoryQaLine !== 'function') {
                            return ['记忆问答', '模块未加载（evidence-query.js）'];
                        }
                        const body = this.memoryQaLine();
                        return ['记忆问答', body];
                    } catch (e) { errLog(e, 'selfCheck.memoryQa'); return ['记忆问答', '—（诊断异常）'];
                    }
                })(),
                /* [v3.340.0 · M4-X4] 追问线程：回答「上一轮的主体/时点被继承进这一轮没有、
                 *   有没有因指代不定而待消歧」。与「记忆问答」行**分列**：那一行答
                 *   「最近一次问句答得怎样」，本行答「**追问语境**现在挂在哪一轮、在哪一轮卡住」。
                 *   三态可分：模块未加载 / 未开始追问 / 有 thread（含 awaiting 具名）。 */
                (() => {
                    try {
                        const QT = _qaThreadLib();
                        if (!QT || typeof QT.threadLine !== 'function' || typeof this.qaThread !== 'function') {
                            return ['追问线程', '模块未加载（qa-thread.js）'];
                        }
                        const t = this.qaThread();
                        if (!t || !t.turn) return ['追问线程', '待用（面在位 · 未开始追问）'];
                        /* 继承 / 新设读数取自最近一次追问的留痕（_memoryQaLast），不另存一份。 */
                        const last = this._memoryQaLast || {};
                        return ['追问线程', QT.threadLine({ thread: t, inherit: last.threadInherit, condition: last.threadCondition })];
                    } catch (e) { errLog(e, 'selfCheck.qaThread'); return ['追问线程', '—（诊断异常）'];
                    }
                })(),
                /* [v3.343.0 · M4-X5] 证词面:回答「对同一事件,各方怎么说、争在哪里」。
                 *   与「视角卡」「记忆问答」分列:那两行答「一个人手上有什么 / 最近一问答得怎样」,
                 *   本行答「若干人对同一事件的说法摆在一起时,能不能下结论」。
                 *   报警只认两条真损失:争议未决(不得写成已定论)与无事件键(说法未进任何事件)。 */
                (() => {
                    try {
                        const TB = _testimonyBoardLib();
                        if (!TB || typeof TB.line !== 'function' || typeof this.testimonyBoard !== 'function') {
                            return ['证词面', '模块未加载(testimony-board.js)'];
                        }
                        const got = this.testimonyBoard({});
                        if (!got || got.ok !== true) return ['证词面', '待用(面在位 · ' + ((got && got.reason) || '无读数') + ')'];
                        const c = got.counts || {};
                        const bad = (Number(c.noEventKey) > 0) || (Array.isArray(got.boards) && got.boards.some((b) => b.state === 'contested'));
                        return ['证词面', TB.line(got) + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.testimonyBoard'); return ['证词面', '—(诊断异常)'];
                    }
                })(),
                /* [v3.344.0 · M4-X6] 叙事层:回答「手上的事实各自处在哪一层外壳、现实面剩几条」。
                 *   与「证词面」分列:那一行答「若干人对同一事件怎么说」,本行答「这条事实
                 *   是现实里发生的,还是梦 / 假设 / 计划 / 引述」。
                 *   报警只认两条真损失:非现实条目混入面(说明层轴没生效)与计划说落实却无事件关联。 */
                (() => {
                    try {
                        const NL = _narrativeLayerLib();
                        if (!NL || typeof NL.line !== 'function' || typeof this.narrativeLayer !== 'function') {
                            return ['叙事层', '模块未加载(narrative-layer.js)'];
                        }
                        const got = this.narrativeLayer({});
                        if (!got || got.ok !== true) return ['叙事层', '待用(面在位 · ' + ((got && got.reason) || '无读数') + ')'];
                        const c = got.counts || {};
                        const hasNonReality = (Number(c.dream) + Number(c.hypothesis) + Number(c.plan) + Number(c.quote)) > 0;
                        const bad = (Number(c.planAwaitingEvent) > 0) || (Number(c.unspecified) > 0 && Number(c.hinted) > 0);
                        const tag = hasNonReality ? '(层轴生效)' : '(暂无外壳)';
                        return ['叙事层', tag + ' ' + NL.line(got) + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.narrativeLayer'); return ['叙事层', '—(诊断异常)'];
                    }
                })(),
                /* [v3.345.0 · M4-X7] 控频闸:回答「旧事重现此刻会不会真的进生成、有没有被反复轰炸」。
                 *   与「旧事重现」面分列:那一行答「该不该想起来」,本行答「想起来之后
                 *   会不会真进生成、会不会重复轰炸」。报警只认三条真损失:只给提示却仍
                 *   可注入(闸失效)、冷却未判却当无冷却(不猜)、预览误消耗冷却。 */
                (() => {
                    try {
                        const RG = _returnGateLib();
                        if (!RG || typeof RG.line !== 'function' || typeof this.returnGate !== 'function') {
                            return ['控频闸', '模块未加载(return-gate.js)'];
                        }
                        const got = this.returnGate({});
                        if (!got || got.ok !== true) return ['控频闸', '待用(面在位 · ' + ((got && got.reason) || '无读数') + ')'];
                        const c = got.counts || {};
                        const bad = (got.policy === 'hint-only' && Number(c.injectable) > 0)
                            || (Number(got.cooldownUnjudged) > 0);
                        const tag = Number(c.injectable) > 0 ? '(可注入)' : '(仅提示)';
                        return ['控频闸', tag + ' ' + RG.line(got) + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.returnGate'); return ['控频闸', '—(诊断异常)'];
                    }
                })(),
/* [v3.346.0 · M4-X8] 材料包:回答「下一幕该带哪几样材料、哪一面空着」。
                 *   与「分卷接续」面分列:那一行答「接着往下写要记住什么」,本行答
                 *   「按这一场的任务(赴约/重逢/推进/收束)该带哪几样、哪一面没取到」。
                 *   报警只认两条真损失:关键面零材料(该带却没取到)、产出「注入物」
                 *   (本面只读挑材,不得声称已注入 —— 裁剪是既有预算 owner 的事)。 */
                (() => {
                    try {
                        const MP = _materialPackLib();
                        if (!MP || typeof MP.line !== 'function' || typeof this.materialPack !== 'function') {
                            return ['材料包', '模块未加载(material-pack.js)'];
                        }
                        const got = this.materialPack('advance', {});
                        if (!got || got.ok !== true) return ['材料包', '待用(面在位 · ' + ((got && got.reason) || '无读数') + ')'];
                        const c = got.counts || {};
                        const bad = (Array.isArray(got.gapsCritical) && got.gapsCritical.length > 0)
                            || (got.injectsNothing === false);
                        const tag = Number(c.packed) ? '(已挑材)' : '(暂无材料)';
                        return ['材料包', tag + ' ' + MP.line(got) + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.materialPack'); return ['材料包', '—(诊断异常)'];
                    }
                })(),
                /* [v3.347.0 · M4-X9] 资料对照:回答「设定怎么说、剧情实际是否做到」。
                 *   与「资料导入」面分列:那一行答「这段资料是什么类别、来源哪一段」,本行答
                 *   「这段资料在剧情里兑现了没有」(分区 + 六态判定 + 撤除)。报警只认两条真损失:
                 *   **偏离设定**(divergent)/ **设定事件未发生**(unrealized)—— 都是「资料与
                 *   剧情对不上」这件事,不报警的「判不了」与本面只读口径分列。 */
                (() => {
                    try {
                        const CX = _loreCrosscheckLib();
                        if (!CX || typeof CX.line !== 'function' || typeof this.loreCrosscheck !== 'function') {
                            return ['资料对照', '模块未加载(lore-crosscheck.js)'];
                        }
                        const got = this.loreCrosscheck('compare', {});
                        if (!got || got.ok !== true) return ['资料对照', '待用(面在位 · ' + ((got && got.reason) || '无读数') + ')'];
                        const c = got.counts || {};
                        const bad = Number(c.divergent) > 0 || Number(c.unrealized) > 0;
                        const tag = (Number(c.lore) || Number(c.chat)) ? '(已分区)' : '(暂无可查)';
                        return ['资料对照', tag + ' ' + CX.line(got) + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.loreCrosscheck'); return ['资料对照', '—(诊断异常)'];
                    }
                })(),                    // [v3.207] 账本实体契约：回答「六本账有多少条目、多少被替代过、有没有读不出修订号的」。
                //   这行同时是 `item.revision` 的**首个真实读侧** —— 此前它写进去但全仓无人读。
                //   三态可分：模块未加载 / 尚无条目 / 有账（未定型条目数 > 0 才亮 ⚠️）。
                (() => {
                    try {
                        const LE = _ledgerEntityLib();
                        if (!LE || typeof LE.line !== 'function') return ['账本实体', '模块未加载（ledger-entity.js）'];
                        const books = _ledgerBooks.call(this);
                        const live = books.filter((b) => {
                            const box = b.box || 'items';
                            return !!(b.state && Array.isArray(b.state[box]) && b.state[box].length);
                        }).length;
                        if (!live) return ['账本实体', '待本轮（尚无账本条目）'];
                        return ['账本实体', LE.line(books)];
                    } catch (e) { errLog(e, 'selfCheck.ledgerEntity'); return ['账本实体', '—（诊断异常）'];
                    }
                })(),
                // [v3.209.0] 结构迁移：回答「导入的这个档是什么代际、要不要走迁移、有没有路径」。
                //   三态可分：模块未加载 / 尚未导入（无留档）/ 有留档（按 verdict 自述 + 步骤）。
                //   真源是恢复现场留档（那时才有真载荷可算），**不在此处合成载荷重算**。
                (() => {
                    try {
                        const SM = _schemaMigrationLib();
                        if (!SM || typeof SM.plan !== 'function') return ['结构迁移', '模块未加载（schema-migration.js）'];
                        const m = this._lastSchemaMigration;
                        if (!m) return ['结构迁移', '待导入（尚无恢复记录 · 注册 ' + SM.MIGRATIONS.length + ' 条）'];
                        const steps = Array.isArray(m.steps) && m.steps.length ? ' · 步骤 ' + m.steps.join('→') : '';
                        const extra = m.needsAction ? '（需授权迁移）' : (m.applied ? '（已迁 ' + m.applied + ' 步）' : '');
                        const warn = (m.verdict === 'unknown' || m.verdict === 'too-new') ? ' ⚠️' : '';
                        return ['结构迁移', '载荷 v' + (m.from === null ? '无代际' : m.from) + ' → 目标 v' + m.to + ' · ' + m.verdict + steps + extra + warn];
                    } catch (e) { errLog(e, 'selfCheck.schemaMigration'); return ['结构迁移', '—（诊断异常）'];
                    }
                })(),
                // [v3.209.0] 模块加载归因：回答「本会话取库失败过哪些模块、根因是什么」。
                //   读 engine 侧登记表 —— **唯一能区分**「无此文件 / 文件在但坏了 / 全局名写错」的地方
                //   （取库口把三者压成同一个 null，这正是本版修掉的静默吞错）。
                //   三态可分：模块未加载 / 本会话零失败（登记表为空 = 查过、没有）/ 有失败（点名 + 根因）。
                //   刻意不在此比对 extra_js 清单：那是 scan_module_wiring 的静态面，重复会造第二真源。
                (() => {
                    try {
                        const MR = _moduleRegistryLib();
                        if (!MR || typeof MR.probe !== 'function') return ['模块加载', '模块未加载（module-registry.js）'];
                        const fails = _moduleFailureSnapshot();
                        if (!fails.length) return ['模块加载', '本会话取库 0 次失败（登记表空）'];
                        const rs = fails.map((f) => MR.probe({ attempted: true, file: f.file, error: new Error(f.error) }));
                        return ['模块加载', MR.line(rs) + ' ⚠️'];
                    } catch (e) { errLog(e, 'selfCheck.moduleRegistry'); return ['模块加载', '—（诊断异常）'];
                    }
                })(),
                // [v3.260.0 缝合 shujuku] 原生工具回合自述：回答「本会话真发起过工具调用吗、几轮、读了多少条」。
                //   零调用时显式说「未启用」，与「启用了但没触发」和「触发了但零命中」三态可分——
                //   这正是本仓九账证据面治理后留下的纪律：坏了有人知道吗，且三种坏法不能同形。
                (() => {
                    try {
                        const nt = (typeof window !== 'undefined' ? window.LonShaNativeTools : null);
                        if (!nt) return ['原生工具回合', '—（模块不可用）'];
                        const _lc = this.llm || (this.engine && this.engine.llm) || null;
                        const led = _lc && _lc._nativeToolLedger;
                        const _on = this.config.config.nativeToolExtractEnabled === true;
                        const _pf = this.config.config.pristineFetchEnabled === true;
                        if (!led) return ['原生工具回合', _on ? '—（已开启但尚无回合）' : '—（未启用）'];
                        const bits = [];
                        if (led.rounds !== undefined) bits.push('回合 ' + led.rounds);
                        if (led.tool) bits.push(led.tool);
                        if (led.hits !== undefined) bits.push('命中 ' + led.hits);
                        if (led.saved !== undefined) bits.push(led.saved ? '已写入' : '未写入');
                        return ['原生工具回合', bits.join(' · ') + (_pf ? ' · 原生取数' : '')];
                    } catch (e) { errLog(e, 'selfCheck.nativeToolRound'); return ['原生工具回合', '—（诊断异常）']; }
                })(),
                // [v3.261.0 缝合 MyriadKnots] 存档体检：回答「导进来的这份档，有多少键谁都不认、
                //   有多少读不出、有多少是活真源」。三态可分：模块不可用 / 待导入（无恢复记录）/
                //   有判定（verdict 非 classified 时如实说判不了，不编「没问题」）。
                //   真源是恢复现场留档（那时才有真载荷），**不在此处合成载荷重算**。
                (() => {
                    try {
                        const AA = _archiveAuditLib();
                        if (!AA || typeof AA.line !== 'function') return ['存档体检', '模块未加载（archive-audit.js）'];
                        const au = this._lastArchiveAudit;
                        if (!au) return ['存档体检', '待导入（尚无恢复记录）'];
                        if (au.verdict !== 'classified') return ['存档体检', '—（' + au.verdict + (au.why ? '：' + au.why : '') + '）'];
                        return ['存档体检', '总 ' + au.total + ' 键 / ' + au.bytes + ' 字节 · 活真源 ' + au.active + ' · 保留 ' + au.retained + (au.cleanup ? ' ⚠️ 可清理候选 ' + au.cleanup : '')];
                    } catch (e) { errLog(e, 'selfCheck.archiveAudit'); return ['存档体检', '—（诊断异常）']; }
                })(),
                // [v3.261.0 缝合 MyriadKnots] 物品 op 忠实认领：回答「导入档里的 op，有多少**能证明**
                //   属于当前聊天、多少判不了、判不了是哪种根因」。只读证明，不删任何 op ——
                //   失效清理已有唯一真源（优化 3b 段），两份判据一定漂移。
                (() => {
                    try {
                        const FI = _floorIdentityLib();
                        if (!FI || typeof FI.line !== 'function') return ['物品认领', '模块未加载（floor-identity.js）'];
                        const c = this._lastItemOpsClaim;
                        if (!c) return ['物品认领', '待导入（本次导入无 op 或聊天未就绪）'];
                        return ['物品认领', '候选 ' + c.ops + ' 条 / ' + c.floors + ' 层 · 可证明 ' + c.proved + ' · 判不了 ' + c.unproved + (c.issue ? '（根因 ' + c.issue + '）' : '')];
                    } catch (e) { errLog(e, 'selfCheck.itemOpsClaim'); return ['物品认领', '—（诊断异常）']; }
                })(),
                /* [v3.275.0] O5：归档处置留痕。回答「刚才那次删楼/回滚，把哪些归档楼层处理掉了、为什么」。
                 *   修前只有计数（replayDrop 的返回值），处置记录在那一刻就丢了 ——
                 *   事后无从回答「这个归档为什么不见了」，正是 O5 要治的「抹掉 provenance」。
                 *   三态可分：没发生过处置 / 有处置（列最近一条细节）/ 面不在场。 */
                (() => {
                    try {
                        const log = Array.isArray(this._archiveShiftLog) ? this._archiveShiftLog : null;
                        if (!log) return ['归档处置', '—（本轮尚无归档面）'];
                        if (!log.length) return ['归档处置', '暂无（本会话未剪/未移任何归档）'];
                        const last = log[log.length - 1];
                        const _rm = Array.isArray(last.removed) ? last.removed.map(x => x.from).join(',') : '不可读';
                        const _mv = Array.isArray(last.moved) ? last.moved.map(x => x.from + '→' + x.to).join(',') : '不可读';
                        return ['归档处置', '共 ' + log.length + ' 次 · 最近 ' + String(last.side) + ' 于第 ' + last.floor + ' 楼'
                            + (last.removedCount ? ' 剪 ' + last.removedCount + '（' + _rm + '）' : '')
                            + (last.movedCount ? ' 移 ' + last.movedCount + '（' + _mv + '）' : '')
                            + ' · 保留 ' + last.keptCount];
                    } catch (e) { errLog(e, 'selfCheck.archiveShiftLog'); return ['归档处置', '—（诊断异常）']; }
                })(),
                /* [v3.277.0 O7] 依赖注入读数：三处 bindDeps 的**成功/失败/缺席**必须可分。
                 *   修前返回值被丢弃 ⇒ 「模块没加载」「模块抛错」「模块在但一个 key 都没对上」
                 *   三种根因同形（都是 0），且没有任何一面能回答「这一轮注进去了没有」。
                 *   修后两轮都展示：构造期（真实顺序下必定 module-missing，那是**时机**不是缺陷）
                 *   与模块装载后的重绑（这才是机制该生效的那一轮）。最终态以重绑为准。 */
                _formatBindDepsRow(this._bindDepsRead, this._bindDepsRebindRead),
                /* [v3.352.0 · M5-X2] 目标跟踪器体检面：回答「有几个长期目标、几条前置、有无循环」。
                 *   与「因果链」分列：因果链答「约定收没收口」，本行答「角色想达成的目标走到哪了」。
                 *   报警只认两条真损失：循环依赖（目标A依赖B，B依赖A ⇒ 永远走不到）与前置被阻断
                 *   （前置条件对应的事实已撤回/否定 ⇒ 这条路走不通了）。 */
                (() => {
                    try {
                        const GT = _goalTrackerLib();
                        if (!GT || typeof GT.line !== 'function') return ['目标跟踪', '模块未加载(goal-tracker.js)'];
                        const goals = (this.worldProg && Array.isArray(this.worldProg.goals)) ? this.worldProg.goals : [];
                        if (!goals.length) return ['目标跟踪', '暂无（尚无目标登记）'];
                        const factStates = (typeof this._factVersionState === 'object' && this._factVersionState) ? this._factVersionState : {};
                        const sc = GT.selfCheck({ goals: goals, factStates: factStates });
                        const bad = sc.cycleDetected > 0;
                        return ['目标跟踪', GT.line(sc) + (bad ? ' ⚠️' : '')];
                    } catch (e) { errLog(e, 'selfCheck.goalTracker'); return ['目标跟踪', '—（诊断异常）']; }
                })(),
                /* [v3.353.0 · M5-X6/X7/X9] 三个研究面模块体检。
                 *   impact-preview: 影响预览零写，回答"改这个事实影响哪些账"
                 *   hypothesis-workspace: 假设推演工作集，回答"有几个工作集在跑"
                 *   research-collection: 研究集合，回答"有几个专题、几条引用、几条结论" */
                (() => {
                    try {
                        const IP = _impactPreviewLib();
                        if (!IP || typeof IP.line !== 'function') return ['影响预览', '模块未加载(impact-preview.js)'];
                        return ['影响预览', IP.line()];
                    } catch (e) { errLog(e, 'selfCheck.impactPreview'); return ['影响预览', '—（诊断异常）']; }
                })(),
                (() => {
                    try {
                        const HW = _hypothesisWorkspaceLib();
                        if (!HW || typeof HW.line !== 'function') return ['假设工作集', '模块未加载(hypothesis-workspace.js)'];
                        const rawState = (this.worldProg && this.worldProg.hypothesisWorkspaces) || { worksets: [] };
                        return ['假设工作集', HW.line(rawState)];
                    } catch (e) { errLog(e, 'selfCheck.hypothesisWorkspace'); return ['假设工作集', '—（诊断异常）']; }
                })(),
                (() => {
                    try {
                        const RC = _researchCollectionLib();
                        if (!RC || typeof RC.line !== 'function') return ['研究集合', '模块未加载(research-collection.js)'];
                        const rawState = (this.worldProg && this.worldProg.researchCollections) || { collections: [] };
                        return ['研究集合', RC.line(rawState)];
                    } catch (e) { errLog(e, 'selfCheck.researchCollection'); return ['研究集合', '—（诊断异常）']; }
                })(),
                    /* [v3.355.0 · M6-O1/M6-O5] 两个新面的体检行。
                     *   经历重建：回答「有几件事、几件完整、几处缺口」；
                     *   双时间：回答「有几个坐标、几个轴不一致、几个版本冲突」。
                     *   ★ 两行都读真存的状态本体（不造假读数）：空账就如实报「暂无」。 */
                    (() => {
                            try {
                                const ER = _experienceRebuildLib();
                                if (!ER || typeof ER.experienceLine !== 'function') return ['经历重建', '模块未加载(experience-rebuild.js)'];
                                const rawList = (this.worldProg && Array.isArray(this.worldProg.experiences)) ? this.worldProg.experiences : [];
                                return ['经历重建', ER.experienceLine(rawList)];
                        } catch (e) { errLog(e, 'selfCheck.experienceRebuild'); return ['经历重建', '—（诊断异常）']; }
                    })(),
                    (() => {
                            try {
                                const DT = _dualTimeLib();
                                if (!DT || typeof DT.line !== 'function') return ['双时间', '模块未加载(dual-time.js)'];
                                const rawList = (this.worldProg && Array.isArray(this.worldProg.timeCoords)) ? this.worldProg.timeCoords : [];
                                return ['双时间', DT.line(rawList)];
                        } catch (e) { errLog(e, 'selfCheck.dualTime'); return ['双时间', '—（诊断异常）']; }
                    })(),
                    /* [v3.356.0 · M6-O2/M6-O3/M6-O6] 三个新面的体检行。
                     *   求解器：回答「有几个求解线程、最后答成什么样、连到几处独立原文」；
                     *   分辨率阶梯：回答「几条经历、几层可展开、几个缺源」；
                     *   场景编排：回答「几幕进行中、几条硬约束、几个未决项」。
                     *   ★ 三行都读真存的状态本体（不造假读数）：空账就如实报「暂无」。 */
                    (() => {
                            try {
                                const SV = _evidenceSolverLib();
                                if (!SV || typeof SV.solverLine !== 'function') return ['求解器', '模块未加载(evidence-solver.js)'];
                                const threads = (this.worldProg && Array.isArray(this.worldProg.solverThreads)) ? this.worldProg.solverThreads : [];
                                const last = threads[threads.length - 1];
                                const line = last && last.result ? SV.solverLine(last.result) : '暂无求解线程';
                                return ['求解器', line];
                        } catch (e) { errLog(e, 'selfCheck.evidenceSolver'); return ['求解器', '—（诊断异常）']; }
                    })(),
                    (() => {
                            try {
                                const RL = _resolutionLadderLib();
                                if (!RL || typeof RL.ladderLine !== 'function') return ['分辨率阶梯', '模块未加载(resolution-ladder.js)'];
                                const rawList = (this.worldProg && Array.isArray(this.worldProg.resolutionLadder)) ? this.worldProg.resolutionLadder : [];
                                return ['分辨率阶梯', RL.ladderLine(rawList)];
                        } catch (e) { errLog(e, 'selfCheck.resolutionLadder'); return ['分辨率阶梯', '—（诊断异常）']; }
                    })(),
                    (() => {
                            try {
                                const SO = _sceneOrchestratorLib();
                                if (!SO || typeof SO.sceneLine !== 'function') return ['场景编排', '模块未加载(scene-orchestrator.js)'];
                                const rawList = (this.worldProg && Array.isArray(this.worldProg.scenes)) ? this.worldProg.scenes : [];
                                return ['场景编排', SO.sceneLine(rawList)];
                        } catch (e) { errLog(e, 'selfCheck.sceneOrchestrator'); return ['场景编排', '—（诊断异常）']; }
                    })(),
            ];
            // [v3.328.0 · F 包 M3-X6] 支线正史体检面:与「分支对照」**分列**。
            //   对照行答「两条分支的面差在哪」,本行答「哪一条算数」——合成一行会让
            //   「两条结局同时成立」与「只有一条结局」共用一个提示位(本项立项要治的那条)。
            //   报警只认两条真损失:未选定的位仍在(不得交接)与两条结局限定仍同时成立。
            try {
                const BC = _branchCanonLib();
                if (!BC || typeof BC.line !== 'function' || typeof this.branchCanonLine !== 'function') {
                    rows.push(['支线正史', '模块未加载(branch-canon.js;哪条算数不得而知)']);
                } else {
                    rows.push(['支线正史', this.branchCanonLine()]);
                /* [v3.342.0 · M4-X3] 落卷面读数并入**同一行**：选择与落卷是同一问题的两截
                 *   （选了没接上 = 本项要治的那条），拆两行会让「已选」与「已落」各自看着都好。 */
                try { rows.push(['支线正史', this.storyCanonAdoptLine()]); } catch (e) { errLog(e, 'selfCheck.storyCanonAdopt'); }
                }
            } catch (e) { errLog(e, 'selfCheck.branchCanon'); }
            // [v3.328.0 · F 包 M3-X8] 旧事重现体检面:与「知识轨迹」**分列**。
            //   轨迹行答「这条知识从哪来」,本行答「该不该在此刻提醒」——合成一行会让
            //   「想不起来」与「我们不让它想」同形(正是本项要治的那条)。
            //   报警只认两条真损失:知情面未判却仍出建议(替角色回忆)与冷却面未判(读成无冷却)。
            try {
                const FR = _fatedRecallLib();
                if (!FR || typeof FR.line !== 'function' || typeof this.fatedRecallLine !== 'function') {
                    rows.push(['旧事重现', '模块未加载(fated-recall.js;该不该提醒不得而知)']);
                } else {
                    rows.push(['旧事重现', this.fatedRecallLine()]);
                }
            } catch (e) { errLog(e, 'selfCheck.fatedRecall'); }
            // [v3.150] A 召回效果自检：最近 N 轮召回命中分布 + 空结果警示（召回效果唯一盲区补自检）
            try {
                const ra = (this._recallAudit || []).slice(-8).reverse();
                if (ra.length) {
                    const emptyN = ra.filter(r => r.empty).length;
                    const totHit = ra.reduce((a, r) => a + (r.totalHits || 0), 0);
                    const avgHit = (totHit / ra.length).toFixed(1);
                    const last = ra[0];
                    const dist = Object.entries(last.perSource || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(' ');
                    rows.push(['召回自检', `近${ra.length}轮 平均命中${avgHit} 空结果${emptyN}次${emptyN ? ' ⚠️' : ''}｜末轮 ${last.totalHits}命中{${dist || '无'}}${last.vecHeatCount ? ' 续热' + last.vecHeatCount : ''}`]);
                    if (emptyN) rows.push(['召回自检·警示', `${emptyN}/${ra.length} 轮空结果——上游编辑/删楼或召回键漂移，建议核对`]);
                } else {
                    rows.push(['召回自检', '暂无数据（首轮生成后填充）']);
                }
            } catch (e) { errLog(e, 'selfCheck.recallAudit'); }
            // [v3.215.0] R2-A 注入读数行：回答「本会话最近一次真生成，AI 实际看到几块 / 被裁几块」。
            //   与上面的「召回自检」是两个不同的问题：召回自检说「召回了什么」，
            //   本行说「**最终送进上下文的是什么**」——中间隔着预算裁剪与去重。
            //   修前这一段的读数被下面 dry-run 覆盖，且 0 块与「没跑过」同形。
            try {
                const _ir = (typeof this.buildInjectionReadout === 'function') ? this.buildInjectionReadout() : null;
                const _dryR = this._diagnostics && this._diagnostics.dryRun;
                if (!_ir) {
                    rows.push(['注入读数', `暂无数据（尚未真生成过）${_dryR ? '；诊断 dry-run 载荷 ' + _dryR.chars + ' 字符（不计入实际注入）' : ''}`]);
                } else {
                    const _stale = Number(this._injectionStale) || 0;
                    // [v3.218.0] R2-E：结局必须进这一行 —— 「被中止」与「正常完成」处置相反
                    //   （前者该重发、后者该看回复），读数上不分开就等于把两者读成同一件事。
                    const _oc = String(_ir.outcome || 'pending');
                    const _ocTxt = _oc === 'completed' ? '已完成' : (_oc === 'aborted' ? '被中止 ⚠️' : '结局未定');
                    const _end = this._injectionEnded || {};
                    rows.push(['注入读数', `第${_ir.round}轮 ${_ir.total}块 保留${_ir.kept} 裁掉${Math.max(0, _ir.total - _ir.kept)}｜${_ir.chars}字符 约${_ir.tokens}token｜结局${_ocTxt}（完成${Number(_end.completed) || 0}·中止${Number(_end.aborted) || 0}）${_stale ? `｜代际过期${_stale}次` : ''}`]);
                }
            } catch (e) { errLog(e, 'selfCheck.注入读数'); }
            // [v3.254.0] M-O4 缓存身份行：回答「召回缓存凭什么说自己是有效的」。
            //   与上面的「召回自检」是两个不同的问题：那一行说「召回了什么」，
            //   本行说「缓存**凭什么**敢命中」——修前身份是三个各自独立的读数
            //   （会话/代际/历史），换对话后同楼层同查询可命中上一段会话的注入。
            //   三态必须**不同形**（本仓老账）：没跑过 / 模块缺席 / 有读数。
            try {
                const _ci = _cacheIdentityLib();
                const _cur = this._cacheIdentityOf();
                if (!_ci || typeof _ci.line !== 'function') {
                    rows.push(['缓存身份', '模块缺席（cache-identity.js 未加载）——身份判定退回既有位置位，不停机']);
                } else if (!_cur) {
                    rows.push(['缓存身份', '当下身份读不出（会话/代际/历史任一位缺失）——按放行处置，不判失效']);
                } else {
                    const _rc = this._recallCache;
                    const _v = _rc ? this._cacheIdentityStale(_rc) : null;
                    const _key = _ci.identityKey(_cur);
                    const _verdict = _v ? _ci.line(Object.assign({}, _v, { count: 1 })) : '模块缺席';
                    rows.push(['缓存身份', `${_key}｜召回缓存${_rc ? '在册' : '未建'}：${_verdict}`]);
                }
            } catch (e) { errLog(e, 'selfCheck.cacheIdentity'); }
            report.stats = rows.map(([k, v]) => ({k, v}));
            // 2. 召回管线 dry-run（不注入，只验证链路通）
            try {
                const query = this.buildQuery(null);
                const qText = String(query.text || '').trim();
                if (!qText) {
                    report.pipeline = { ok: false, note: '查询文本为空（对话太短？）', hint: '多聊几句产生对话正文后会自动恢复正常' };
                } else {
                    const t0 = Date.now();
                    const recalled = await this.recallMemory(query);
                    // [v3.215.0] R2-A：诊断路径**不再写 `_lastInjection`**。
                    //   修前：这里与真生成共用同一个字段，于是「跑了一次自检」会把面板上
                    //   「最近一次实际注入…即 AI 真实所见」改写成一个**从未进过模型上下文**的
                    //   字符串。诊断读数是另一个问题（链路通不通 / 载荷多大），故另存
                    //   `_diagnostics.dryRun`（id:'diagnostics'）——连键名都不共用。
                    const _dry = this._buildDiagnosticsInjection(recalled);
                    const inj = _dry.html;
                    const merged = recalled.filter(Boolean).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0);
                    report.pipeline = { ok: true, queryLen: qText.length, routes: Object.entries(recalled).filter(([, v]) => Array.isArray(v) && v.length).map(([k, v]) => `${k}:${v.length}`), merged, injLen: (inj || '').length, ms: Date.now() - t0 };
                }
            } catch (e) { report.pipeline = { ok: false, note: 'dry-run异常: ' + (e?.message || e), hint: hintForError(e) }; }
            // 3. 存档 schema 校验（export 字段 vs load 导入字段配对）
            try {
                const saved = this.collectExport();
                const expected = ['graph', 'summaries', 'diaries', 'vectors', 'povs', 'timeline', 'status', 'ledger', 'suspense', 'scene'];
                const missing = expected.filter(k => saved[k] === undefined || saved[k] === null);
                const nonEmpty = expected.filter(k => saved[k] && (Array.isArray(saved[k]) ? saved[k].length : Object.keys(saved[k]).length) > 0);
                report.schema = { ok: missing.length === 0, missing, nonEmpty, hint: missing.length ? '建议点击设置面板【一键自愈】以自动补齐缺省数据' : '' };
            } catch (e) { report.schema = { ok: false, missing: ['collectExport异常: ' + (e?.message || e)], hint: hintForError(e) }; }
        } catch (e) { report.fatal = String(e?.message || e); }
        return report;
        }
    }
    const _scOps = new LonShaSelfCheckOps();
    const selfCheck = function(engine, ...args) {
        const target = engine || this;
        return _scOps.selfCheck.apply(target, args);
    };


    async function selfCheckExport(engine) {
        const target = engine || this;
        if (!target) return { time: new Date().toLocaleString(), version: _deps.VERSION || '3.366.0', stats: [], errors: [], pipeline: null, schema: null, fatal: 'no-engine-context' };
        return await selfCheck.call(target);
    }

    function selfCheckDescribe() {
        return {
            name: 'engine-self-check.js',
            role: 'self-check & diagnostics',
            methods: ['selfCheck', 'bindDeps', 'selfCheckDescribe', 'selfCheckLine']
        };
    }

    function selfCheckLine(engine) {
        return ['系统诊断', '已就绪(engine-self-check.js)'];
    }

    return {
        selfCheck: selfCheckExport,
        bindDeps: bindDeps,
        selfCheckDescribe: selfCheckDescribe,
        selfCheckLine: selfCheckLine
    };
});
