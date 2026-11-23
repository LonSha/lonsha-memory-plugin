import { $, esc, state, actions } from './state.js';
import { fetchRuns, runTreeSearch } from './api.js';

export function renderPresets() {
  const row = $('#presetRow');
  const presets = state.index?.corpus?.ui?.presets || state.corpusMeta?.ui?.presets || [];
  if (!presets.length) {
    row.style.display = 'none';
    row.innerHTML = '';
    return;
  }
  row.style.display = 'flex';
  row.innerHTML = presets.map((p, i) => `<button class="preset-chip" data-pidx="${i}">${esc(p.label)}</button>`).join('');
  row.querySelectorAll('.preset-chip').forEach((b) => {
    b.addEventListener('click', async () => {
      const p = presets[Number(b.dataset.pidx)];
      if (!p) return;
      $('#qChar').value = p.charName ?? '';
      $('#qUser').value = p.userName ?? '旅人';
      $('#qMaxScenes').value = p.maxScenes ?? 0;
      if (p.maxOrder !== undefined) await actions.setMaxOrder?.(Number(p.maxOrder) || 0, { reloadIndex: true });
      $('#qText').value = p.query ?? '';
      $('#qOnDemand').value = p.onDemand ?? '';
      $('#qRecent').value = p.recent ?? '';
      $('#qRecall').value = Array.isArray(p.sessionRecall) ? p.sessionRecall.join('\n') : '';
    });
  });
}

function renderWaterfall(out) {
  const steps = Array.isArray(out.steps) ? out.steps : [];
  if (!steps.length) return '';
  const totalMs = Math.max(
    1,
    Number(out.took_ms) || steps.reduce((acc, s) => acc + (s.llm_ms || 0) + (s.tool_ms || 0), 0)
  );
  const rows = steps
    .map((st) => {
      const llmMs = Number(st.llm_ms) || 0;
      const toolMs = Number(st.tool_ms) || 0;
      const sumMs = llmMs + toolMs;
      const llmPct = Math.max(2, (llmMs / totalMs) * 100);
      const toolPct = toolMs > 0 ? Math.max(1.5, (toolMs / totalMs) * 100) : 0;
      const callNames = (st.calls || []).map((c) => c.name).join('+') || (st.kind === 'final' ? 'JSON终裁' : '终裁');
      return `<div class="wf-row" title="T${st.turn}: ${esc(callNames)} (LLM ${llmMs}ms${toolMs ? ', Tool ' + toolMs + 'ms' : ''})">
        <span class="wf-label">T${st.turn}</span>
        <div class="wf-track">
          <div class="wf-llm" style="width:${llmPct.toFixed(1)}%"></div>
          ${toolPct ? `<div class="wf-tool" style="width:${toolPct.toFixed(1)}%"></div>` : ''}
        </div>
        <span class="wf-ms">${sumMs}ms</span>
      </div>`;
    })
    .join('');

  return `<div class="waterfall-box">
    <div class="wf-title">
      <span>寻路瀑布流时间轴</span>
      <span class="legend-inline" style="margin:0;">
        <span class="sw"><i style="background:var(--slate)"></i>LLM</span>
        <span class="sw"><i style="background:var(--read-ink)"></i>Tool</span>
      </span>
    </div>
    ${rows}
  </div>`;
}

export function renderTrace(out) {
  const box = $('#traceBody');
  if (!out) {
    box.innerHTML = `<div style="color:var(--ink-muted);text-align:center;padding:24px 8px;font-size:12px;">暂无推理轨迹</div>`;
    return;
  }
  const tr = out.traversal || {};
  const statusStr = out.skip
    ? `<strong style="color:var(--ochre);">判定跳过</strong>（${esc(out.reason || '')}）`
    : `<strong style="color:var(--seal);">入选 ${(out.scenes || []).length} 幕</strong>${out.max_order ? ` · 序<=${out.max_order}` : ''}`;

  const summary = `
    <div class="ledger-summary">
      <div>${statusStr} <span style="color:var(--ink-muted);font-size:11px;">[${esc(out.corpus_name || out.corpus_id || '')}]</span></div>
      <div style="color:var(--ink-muted);margin-top:3px;">
        目录 ${(tr.listed_arcs || []).length} 卷 → 展开 ${(tr.expanded_arcs || []).length} 卷 → 读正文 ${(tr.read_scenes || []).length} 幕 → 选中 ${(tr.selected_nodes || []).length} 幕
      </div>
      <div style="color:var(--ink-muted);font-family:var(--mono);font-size:10.5px;margin-top:2px;">
        ${out.took_ms} ms · ${out.turns} 轮 · tokens ${(out.usage?.prompt || 0)}+${(out.usage?.completion || 0)}
      </div>
      ${!out.skip ? `<button type="button" class="btn-seal btn-sm mobile-only-inline trace-open-dossier" style="margin-top:7px;">查看选段卷宗与导读 →</button>` : ''}
    </div>
  `;

  const waterfallHtml = renderWaterfall(out);

  const promptsBlock = out.prompts
    ? `
    <div class="turn-card">
      <div class="turn-head">
        <span class="turn-title">完整提示词与终轮输出</span>
        <span class="turn-stat">sys ${(out.prompts.system || '').length} / user ${(out.prompts.user || '').length} 字</span>
      </div>
      <details class="raw-block">
        <summary>User Prompt（递交给检索 Agent 的上下文）</summary>
        <pre class="raw-pre">${esc(out.prompts.user || '')}</pre>
      </details>
      <details class="raw-block">
        <summary>System Prompt（动态语料规则与策略）</summary>
        <pre class="raw-pre">${esc(out.prompts.system || '')}</pre>
      </details>
      ${
        out.raw_answer
          ? `<details class="raw-block">
        <summary>模型终轮原始输出</summary>
        <pre class="raw-pre">${esc(out.raw_answer)}</pre>
      </details>`
          : ''
      }
    </div>
  `
    : '';

  const steps = Array.isArray(out.steps) && out.steps.length ? out.steps : null;
  if (!steps) {
    box.innerHTML =
      summary +
      waterfallHtml +
      promptsBlock +
      (out.trace || []).map((t) => `<div class="turn-card"><code>${esc(t)}</code></div>`).join('');
    return;
  }

  const turnsHtml = steps
    .map((st) => {
      const kindText = st.kind === 'final' ? '终轮裁决' : st.kind === 'final_forced' ? '轮次上限裁决' : '目录推理';
      const calls = (st.calls || [])
        .map((c) => {
          const m = c.meta || {};
          const arcBtns = (m.arc_ids || [])
            .slice(0, 12)
            .map((aid) => `<button class="jump-id" data-jump-arc="${esc(aid)}">卷 ${esc(aid)}</button>`)
            .join('');
          const nodeBtns = (m.node_ids || [])
            .map((nid) => `<button class="jump-id" data-jump-node="${esc(nid)}">幕 ${esc(nid)}</button>`)
            .join('');
          return `
        <div class="tool-row">
          <div class="tool-head">
            <span class="tool-name">${esc(c.name)}</span>
            <span style="font-family:var(--mono);font-size:10.5px;color:var(--ink-muted);">${c.result_chars} 字</span>
          </div>
          <div class="tool-args">${esc(JSON.stringify(c.args))}</div>
          <div class="tool-outcome">${esc(c.summary)}</div>
          ${arcBtns || nodeBtns ? `<div class="jump-row">${arcBtns}${nodeBtns}</div>` : ''}
          <details class="raw-block">
            <summary>展开工具返回文本</summary>
            <pre class="raw-pre">${esc(c.result_preview)}${c.result_chars > 1200 ? '\n...(预览已截断)' : ''}</pre>
          </details>
        </div>
      `;
        })
        .join('');

      const reasoningHtml = st.reasoning
        ? `<details class="raw-block">
          <summary>思考过程 (${st.reasoning.length} 字)</summary>
          <pre class="raw-pre">${esc(st.reasoning)}</pre>
        </details>`
        : '';

      return `
      <div class="turn-card">
        <div class="turn-head">
          <span class="turn-title">第 ${st.turn} 轮 · ${kindText}</span>
          <span class="turn-stat">LLM ${st.llm_ms}ms${st.tool_ms ? ` · Tool ${st.tool_ms}ms` : ''}</span>
        </div>
        ${reasoningHtml}
        ${calls || '<div style="font-size:11.5px;color:var(--ink-muted);">模型未再调用工具，直接输出最终 JSON。</div>'}
      </div>
    `;
    })
    .join('');

  box.innerHTML = summary + waterfallHtml + promptsBlock + turnsHtml;
  box.querySelector('.trace-open-dossier')?.addEventListener('click', () => {
    actions.setStageTab?.('dossier');
    actions.setMobilePane?.('stage');
  });
  box.querySelectorAll('[data-jump-arc]').forEach((b) => b.addEventListener('click', () => actions.openArc?.(b.dataset.jumpArc)));
  box.querySelectorAll('[data-jump-node]').forEach((b) => b.addEventListener('click', () => actions.openScene?.(b.dataset.jumpNode)));
}

export function renderRunsList() {
  const box = $('#runsList');
  if (!state.runs.length) {
    box.innerHTML = '';
    return;
  }
  box.innerHTML = state.runs
    .map((r) => {
      const label = r.input?.onDemand || r.input?.query || '（仅依上下文触发）';
      const tag = r.output?.skip ? '跳过' : `入选 ${(r.output?.scenes || []).length} 幕`;
      const cTag = r.corpus_id ? `[${r.corpus_id}] ` : '';
      const oTag = r.max_order ? ` 序<=${r.max_order}` : '';
      return `<div class="run-card ${state.activeRunId === r.id ? 'active' : ''}" data-rid="${esc(r.id)}">
      <div class="run-q">${esc(label)}</div>
      <div class="run-m">${esc(cTag)}${tag}${oTag} · ${r.output?.took_ms || 0}ms</div>
    </div>`;
    })
    .join('');
  box.querySelectorAll('.run-card').forEach((el) => el.addEventListener('click', () => selectRun(el.dataset.rid)));
}

export async function selectRun(rid) {
  const run = state.runs.find((r) => r.id === rid);
  if (!run) return;
  state.activeRunId = rid;
  state.activeRunData = run.output;
  if (run.corpus_id && run.corpus_id !== state.corpusId && state.corpora.some((c) => c.id === run.corpus_id)) {
    await actions.switchCorpus?.(run.corpus_id, { keepRun: true });
  }
  renderRunsList();
  renderTrace(run.output);
  actions.renderToc?.();
  actions.setStageTab?.('dossier');
}

export async function pollRuns({ autoSelectNewest = true, preferHashRunId = '' } = {}) {
  try {
    const j = await fetchRuns();
    const list = j.runs || [];
    const topId = list[0]?.id || '';
    const wasInit = state.runsInitialized;
    const hasNewTop = wasInit && Boolean(topId) && topId !== state.lastSeenTopRunId;
    state.runsInitialized = true;
    state.lastSeenTopRunId = topId;
    state.runs = list;
    renderRunsList();
    if (preferHashRunId && list.some((r) => r.id === preferHashRunId)) {
      await selectRun(preferHashRunId);
      return;
    }
    if (autoSelectNewest && hasNewTop) {
      await selectRun(topId);
    }
  } catch (_) {}
}

export async function executeSearch() {
  const btn = $('#runBtn');
  btn.disabled = true;
  $('#runStatus').textContent = '正在翻检目录树...';
  try {
    const recentChat = $('#qRecent')
      .value.split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const idx = l.indexOf(':');
        if (idx > 0 && idx < 20) return { name: l.slice(0, idx).trim(), text: l.slice(idx + 1).trim(), role: 'assistant' };
        return { name: '对话', text: l, role: 'user' };
      });
    const maxScenesVal = Number($('#qMaxScenes').value);
    const maxOrderVal = Number($('#qMaxOrder').value);
    const payload = {
      corpus: state.corpusId,
      query: $('#qText').value.trim(),
      onDemand: $('#qOnDemand').value.trim(),
      recentChat,
      sessionRecall: ($('#qRecall')?.value || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean),
      maxScenes: Number.isFinite(maxScenesVal) && maxScenesVal >= 0 ? maxScenesVal : 0,
      maxOrder: Number.isFinite(maxOrderVal) && maxOrderVal > 0 ? maxOrderVal : 0,
      sceneAnchor: { charName: $('#qChar').value.trim(), userName: $('#qUser').value.trim() },
    };
    const toolLabel = (n) => ({ list_series: '分卷', list_story_arcs: '篇章目录', expand_story_arc: '展开篇章', read_scenes: '精读原文', grep_scenes: '全文扫描' }[n] || n);
    const out = await runTreeSearch(payload, {
      onProgress: (d) => {
        const parts = [`第 ${d.turn} 轮`];
        if (d.reasoningChars) parts.push(`思考 ${d.reasoningChars} 字`);
        if (d.toolNames && d.toolNames.length) parts.push('调用 ' + d.toolNames.map(toolLabel).join('、'));
        else if (d.contentChars) parts.push(`输出 ${d.contentChars} 字`);
        $('#runStatus').textContent = '正在翻检目录树… ' + parts.join(' · ');
      },
    });
    $('#runStatus').textContent = `完成（${out.took_ms}ms，${out.turns} 轮）`;
    if (out.run_id) state.lastSeenTopRunId = out.run_id;
    await pollRuns({ autoSelectNewest: false });
    if (out.run_id) {
      await selectRun(out.run_id);
    } else {
      state.activeRunData = out;
      renderTrace(out);
      actions.renderToc?.();
      actions.setStageTab?.('dossier');
    }
  } catch (e) {
    $('#runStatus').textContent = '检索出错：' + e.message;
  } finally {
    btn.disabled = false;
  }
}
