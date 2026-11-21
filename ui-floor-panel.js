/**
 * ui-floor-panel.js — [V4 呈现层] 楼层面板（floor strip）
 *
 * 【它为什么必需存在】
 *   maintenance-schedule 把补齐上界截到 eligibleEnd-1：最新那条 AI 回复可能还在
 *   swipe / 重生成里，此时补摘要落的是「半句事实」。这个决定在代码里是安全的，
 *   但在界面上**看不见** —— 玩家只会看到「最后一楼没摘要」，
 *   然后反复点「补齐」并认为插件坏了。
 *   本面板的作用就是让「故意没做」与「漏了」在屏幕上长得不一样：
 *     is-pending（点线淡显，不可点）↔ is-missing（红边，可补）
 *
 * 【学自柏宝书 FloorPanel.vue】
 *   - 楼层是「格子」，不是列表行：一屏能看到 40 楼，滚三屏看 120 楼。
 *   - 格子有颜色语义，图例固定在条下方（不是 hover 提示 —— 手机上没 hover）。
 *   - 点格子看详情用底部抽屉，不用跳页：玩家看完要回到原来那格。
 *
 * 【数据来源（只有两处，都不写）】
 *   engine.summary.summaries      已落摘要
 *   engine.summary.missingFloors  缺失楼层
 *   SillyTavern chat 的 role      判断用户楼 / AI 楼
 */
(function (root) {
    'use strict';

    const FLOOR_VERSION = '1.0.0';

    function kit() {
        const k = (typeof window !== 'undefined' && window.LonShaUiKit)
            || (root && root.LonShaUiKit)
            || (typeof require === 'function' ? safeRequire('./ui-kit-core.js') : null);
        if (!k) throw new Error('ui-floor-panel: ui-kit-core.js 未加载');
        return k;
    }

    function safeRequire(p) {
        try { return require(p); } catch (_e) { return null; }
    }

    function engine() {
        const p = (root && root.LonShaMemory) || null;
        return (p && p.engine) || null;
    }

    function chat() {
        try {
            const c = root.SillyTavern && root.SillyTavern.getContext ? root.SillyTavern.getContext() : null;
            return (c && Array.isArray(c.chat)) ? c.chat : [];
        } catch (_e) { return []; }
    }

    /* ================================================================
     * 1. 单楼定性（纯函数，可单测）
     *    入参：{ floor, hasSummary, isMissing, isOmit, isUser, isPending }
     *    返回 'done' | 'missing' | 'omit' | 'user' | 'pending' | 'none'
     *    优先级说明：
     *      pending 最高 —— 最新一楼即使「没摘要」也不能算缺失（引擎故意没做）
     *      omit 次高     —— 番外楼永远不该被补摘要
     *      user 再次     —— 玩家楼通常不出摘要，标蓝只是为了「这楼不是漏」
     *      done / missing 最后
     * ================================================================ */
    function classify(f) {
        if (!f) return 'none';
        if (f.isPending) return 'pending';
        if (f.isOmit) return 'omit';
        if (f.hasSummary) return 'done';
        if (f.isUser) return 'user';
        if (f.isMissing) return 'missing';
        return 'none';
    }

    /* ================================================================
     * 2. 取数
     * ================================================================ */
    function readFloors() {
        const eng = engine();
        if (!eng) return { ok: false, kind: 'absent', reason: '引擎未加载' };
        const sum = eng && eng.summary;
        if (!sum) return { ok: false, kind: 'absent', reason: '摘要服务缺席' };

        const msgs = chat();
        const total = msgs.length;
        if (!total) return { ok: false, kind: 'empty', reason: '当前对话没有消息' };

        let summaries = [];
        try { summaries = (typeof sum.getActiveSummaries === 'function' ? sum.getActiveSummaries() : (sum.summaries || [])) || []; } catch (e) {
            return { ok: false, kind: 'error', reason: '取摘要失败：' + ((e && e.message) || e) };
        }
        const byFloor = new Map();
        summaries.forEach((s) => { if (s && Number.isFinite(Number(s.floor))) byFloor.set(Number(s.floor), s); });

        let missingSet = new Set();
        try {
            if (typeof sum.missingFloors === 'function') {
                (sum.missingFloors(total - 1) || []).forEach((f) => missingSet.add(Number(f)));
            }
        } catch (_e) { /* 缺失读数失败就退化成「没有缺失」标注，但格子仍按摘要存在与否着色 */ }

        // 最新一楼：AI 回复且尚无摘要 → 视为「未稳定」
        // 【为什么不是「最长未摘要」】只有最后一楼才是 swipe 目标；
        //   中间缺失的楼该补就补，不该被这条规则保护起来。
        const lastIdx = total - 1;
        const lastMsg = msgs[lastIdx] || null;
        const lastIsUser = !!(lastMsg && lastMsg.is_user);
        const lastHasSummary = byFloor.has(lastIdx);

        const floors = [];
        for (let i = 0; i < total; i++) {
            const m = msgs[i] || {};
            const hasSummary = byFloor.has(i);
            const isPending = (i === lastIdx) && !lastIsUser && !hasSummary;
            floors.push({
                floor: i,
                hasSummary,
                isMissing: missingSet.has(i),
                isOmit: !!(byFloor.get(i) && byFloor.get(i).omit),
                isUser: !!m.is_user,
                isPending,
                text: String(m.mes || ''),
                summaryText: hasSummary ? String(byFloor.get(i).text || '') : '',
            });
        }

        return {
            ok: true,
            kind: 'ok',
            floors,
            total,
            doneCount: floors.filter((f) => f.hasSummary).length,
            missingCount: floors.filter((f) => f.isMissing && !f.isPending).length,
            pendingFloor: floors.find((f) => f.isPending) ? floors.find((f) => f.isPending).floor : -1,
            canComplete: typeof sum.completeMissingFloors === 'function',
            canAdd: typeof sum.addManualSummary === 'function',
        };
    }

    /* ================================================================
     * 3. 渲染
     * ================================================================ */
    const STATE_CLASS = {
        done: 'is-done',
        missing: 'is-missing',
        omit: 'is-omit',
        user: 'is-user',
        pending: 'is-pending',
        none: '',
    };

    function openFloorPanel(opts) {
        const k = kit();
        const o = opts || {};
        k.ensureStyle();

        let data = readFloors();
        let curFloor = -1;

        const strip = k.el('div', { class: 'lsu-floors' });
        const statHost = k.el('div', { class: 'lsu-node-meta' });
        const detailHost = k.el('div', {});

        const legend = k.el('div', { class: 'lsu-floor-legend' }, [
            k.el('span', {}, [k.el('i', { style: { background: 'rgba(52,211,153,0.55)' } }), '已有摘要']),
            k.el('span', {}, [k.el('i', { style: { background: 'rgba(248,113,113,0.55)' } }), '缺失']),
            k.el('span', {}, [k.el('i', { style: { background: 'rgba(251,191,36,0.55)' } }), '番外']),
            k.el('span', {}, [k.el('i', { style: { background: 'rgba(56,189,248,0.55)' } }), '玩家楼']),
            k.el('span', {}, [k.el('i', { style: { background: 'rgba(148,163,184,0.55)' } }), '最新未稳定']),
        ]);

        const btnComplete = k.btn('补齐缺失', {
            kind: 'primary',
            onClick: async () => {
                const eng = engine();
                const sum = eng && eng.summary;
                if (!sum || typeof sum.completeMissingFloors !== 'function') {
                    k.toast('当前引擎不支持自动补齐', 'warn');
                    return;
                }
                const miss = data.missingCount;
                if (!miss) { k.toast('没有缺失楼层', 'ok'); return; }
                const yes = await k.modal({
                    title: '补齐 ' + miss + ' 个缺失楼层？',
                    body: k.el('div', {}, [
                        k.el('div', { text: '将调用 LLM 分批补摘要（每批最多 5 楼）。' }),
                        k.el('div', { style: { marginTop: '6px', opacity: '0.85' }, text: '最新一楼若还在重生成，会被刻意跳过 —— 那不是漏，是等它稳定。' }),
                    ]),
                    confirmText: '开始补齐',
                });
                if (!yes) return;
                btnComplete.disabled = true;
                btnComplete.textContent = '补齐中…';
                try {
                    const msgs = chat();
                    const strip2 = (raw) => {
                        try {
                            if (typeof sum.stripThinkingText === 'function') return sum.stripThinkingText(raw);
                        } catch (_e) { /* ignore */ }
                        return String(raw || '');
                    };
                    const r = await sum.completeMissingFloors(
                        eng.config ? (eng.config.config || eng.config) : {},
                        eng.llm,
                        (f) => strip2(String((msgs[f] || {}).mes || '')),
                        5
                    );
                    if (r && r.skipped) k.toast('上一批仍在进行中', 'warn');
                    else k.toast('已补齐 ' + ((r && r.done) || 0) + ' 楼' + ((r && r.missing) ? '，还剩 ' + r.missing : ''), 'ok');
                } catch (e) {
                    k.toast('补齐失败：' + ((e && e.message) || e), 'bad');
                } finally {
                    btnComplete.disabled = false;
                    btnComplete.textContent = '补齐缺失';
                    refresh();
                    if (typeof o.onChanged === 'function') { try { o.onChanged(); } catch (_e) { /* ignore */ } }
                }
            },
        });

        const btnRefresh = k.btn('重读', { onClick: () => refresh() });

        const p = k.panel({
            title: '楼层面板',
            sub: '每个格子一层楼。点格子看这一层发生了什么。',
            width: '460px',
            foot: k.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } }, [btnComplete, btnRefresh]),
        });

        p.body.appendChild(statHost);
        p.body.appendChild(strip);
        p.body.appendChild(legend);
        p.body.appendChild(k.hr());
        p.body.appendChild(detailHost);

        function paintStat() {
            statHost.textContent = '';
            if (!data.ok) {
                statHost.appendChild(k.badge('mute', data.kind === 'absent' ? '未加载' : (data.kind === 'empty' ? '空对话' : '读取失败')));
                if (data.reason) statHost.appendChild(k.el('span', { text: data.reason }));
                return;
            }
            statHost.appendChild(k.badge('info', data.total + ' 楼'));
            statHost.appendChild(k.badge('ok', data.doneCount + ' 已摘要'));
            if (data.missingCount) statHost.appendChild(k.badge('bad', data.missingCount + ' 缺失'));
            else statHost.appendChild(k.badge('mute', '无缺失'));
            if (data.pendingFloor >= 0) statHost.appendChild(k.badge('warn', '第 ' + data.pendingFloor + ' 楼待稳定'));
        }

        function paintStrip() {
            strip.textContent = '';
            if (!data.ok) return;
            data.floors.forEach((f) => {
                const state = classify(f);
                const cell = k.el('button', {
                    type: 'button',
                    class: ('lsu-floor ' + STATE_CLASS[state] + (f.floor === curFloor ? ' is-cur' : '')).trim(),
                    title: '第 ' + f.floor + ' 楼',
                    text: String(f.floor),
                });
                if (state !== 'pending') {
                    cell.addEventListener('click', () => { curFloor = f.floor; paintStrip(); paintDetail(f); });
                }
                strip.appendChild(cell);
            });
        }

        function paintDetail(f) {
            detailHost.textContent = '';
            const state = classify(f);
            const stateText = {
                done: ['ok', '已有摘要'],
                missing: ['bad', '缺失摘要'],
                omit: ['warn', '番外楼（不参与摘要）'],
                user: ['info', '玩家发言楼'],
                pending: ['warn', '最新一楼 · 等待稳定'],
                none: ['mute', '无摘要'],
            }[state] || ['mute', '未知'];

            const body = k.el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } }, [
                k.el('div', { class: 'lsu-node-text is-clamp', text: k.clampText(f.text, 400) || '（空消息）' }),
            ]);
            if (state === 'pending') {
                body.appendChild(k.el('div', {
                    class: 'lsu-empty-hint',
                    text: '这层楼可能还在 swipe / 重生成。此时补摘要把「玩家说了话、没人回」这种半句事实写进账本，所以引擎会等它定稿。',
                }));
            }
            if (state === 'done' && f.summaryText) {
                body.appendChild(k.kv([['摘要', k.clampText(f.summaryText, 200)]]));
            }
            if (state === 'missing' && data.canAdd) {
                body.appendChild(k.btn('手动补录这层', {
                    small: true,
                    onClick: () => addManual(f.floor),
                }));
            }

            const cardObj = k.card({
                title: '第 ' + f.floor + ' 楼',
                badge: { kind: stateText[0], text: stateText[1] },
                kind: state === 'missing' ? 'bad' : (state === 'pending' ? 'warn' : undefined),
                body,
            });
            detailHost.appendChild(cardObj.root);
        }

        function addManual(floor) {
            const fld = k.field({ label: '第 ' + floor + ' 楼摘要', multiline: true, placeholder: '写一句这层楼发生了什么' });
            const sub = k.panel({
                title: '补录摘要',
                width: '420px',
                foot: k.el('div', { style: { display: 'flex', gap: '8px', width: '100%' } }, [
                    k.btn('保存', {
                        kind: 'primary',
                        onClick: () => {
                            const eng = engine();
                            const sum = eng && eng.summary;
                            const txt = String(fld.input.value || '').trim();
                            if (!txt) { fld.setError('摘要不能为空'); return; }
                            if (!sum || typeof sum.addManualSummary !== 'function') { fld.setError('当前引擎不支持补录'); return; }
                            let okRes = null;
                            try { okRes = sum.addManualSummary(floor, txt); } catch (e) { fld.setError('保存失败：' + ((e && e.message) || e)); return; }
                            if (!okRes) { fld.setError('该楼层已有摘要'); return; }
                            sub.close();
                            k.toast('已补录第 ' + floor + ' 楼', 'ok');
                            refresh();
                        },
                    }),
                    k.btn('取消', { onClick: () => sub.close() }),
                ]),
            });
            sub.body.appendChild(fld.root);
        }

        function refresh() {
            data = readFloors();
            paintStat();
            paintStrip();
            if (curFloor >= 0 && data.ok) {
                const f = data.floors.find((x) => x.floor === curFloor);
                if (f) paintDetail(f);
            }
        }

        paintStat();
        paintStrip();
        if (!data.ok) {
            detailHost.appendChild(k.empty({
                kind: data.kind === 'absent' ? 'absent' : (data.kind === 'empty' ? 'empty' : 'error'),
                title: data.kind === 'absent' ? '摘要服务未加载' : (data.kind === 'empty' ? '当前对话没有消息' : '读取失败'),
                hint: data.reason || '',
            }));
        }

        return { close: p.close, refresh };
    }

    /* ================================================================
     * 4. 自检
     * ================================================================ */
    function selfCheck() {
        const fails = [];
        const checks = [];
        const ok = (name, cond, detail) => {
            checks.push({ name, ok: !!cond, detail });
            if (!cond) fails.push(name + (detail ? '：' + detail : ''));
        };

        ok('未稳定优先于缺失', classify({ isPending: true, isMissing: true }) === 'pending');
        ok('番外优先于缺失', classify({ isOmit: true, isMissing: true }) === 'omit');
        ok('有摘要即 done（即使被标缺失）', classify({ hasSummary: true, isMissing: true }) === 'done');
        ok('玩家楼标 user 而非 missing', classify({ isUser: true, isMissing: true }) === 'user');
        ok('纯缺失', classify({ isMissing: true }) === 'missing');
        ok('什么都没有 → none', classify({}) === 'none');
        ok('null 不炸', classify(null) === 'none');
        ok('STATE_CLASS 覆盖六态', Object.keys(STATE_CLASS).length === 6);

        const saved = root.LonShaMemory;
        try {
            root.LonShaMemory = null;
            const r = readFloors();
            ok('无引擎 → absent', r.ok === false && r.kind === 'absent');
        } finally {
            if (saved !== undefined) root.LonShaMemory = saved;
        }

        return { ok: fails.length === 0, version: FLOOR_VERSION, total: checks.length, failed: fails.length, fails, checks };
    }

    const api = {
        VERSION: FLOOR_VERSION,
        classify,
        readFloors,
        openFloorPanel,
        selfCheck,
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    if (root) root.LonShaFloorPanel = api;
    if (typeof window !== 'undefined') window.LonShaFloorPanel = api;
})(typeof window !== 'undefined' ? window : globalThis);