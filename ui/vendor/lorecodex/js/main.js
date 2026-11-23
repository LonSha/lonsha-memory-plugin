import { $, $$, esc, fmtChars, prefs, savePrefs, applyPrefs, state, actions, corpusName } from './state.js';
import { fetchHealth, fetchCorpora, reloadCorpora, fetchTreeIndex } from './api.js';
import { renderFilters, renderToc, triggerGrep, scheduleGrep } from './toc.js';
import {
  initReaderScroll,
  setStageTab,
  openCover,
  openArc,
  openScene,
  openArcRead,
  navigateSceneDelta,
  renderStage,
} from './reader.js';
import { renderPresets, renderTrace, renderRunsList, pollRuns, executeSearch } from './trace.js';
import {
  closeModal,
  openSettingsModal,
  openCorpusModal,
  openLibraryModal,
  openImportModal,
  openCommandPalette,
  openStSettingsModal,
} from './modals.js';

function renderCorpusSelect() {
  const sel = $('#corpusSelect');
  if (!state.corpora.length) {
    sel.innerHTML = '<option value="">（暂无书库，请先导入）</option>';
    return;
  }
  sel.innerHTML = state.corpora
    .map(
      (c) =>
        `<option value="${esc(c.id)}" ${c.id === state.corpusId ? 'selected' : ''}>${esc(c.name)} (${c.stats?.arcs || 0}卷)</option>`
    )
    .join('');
}

function updateQuickLlmButton(st = {}) {
  const btn = $('#llmBuildQuickBtn');
  if (!btn) return;
  const total = Number(st.scenes || 0);
  const done = Number(st.llm_scenes || 0);
  if (!state.corpusId || total === 0) {
    btn.style.display = 'none';
    return;
  }
  if (done < total) {
    btn.style.display = '';
    btn.textContent = `LLM 建目录 (${done}/${total})`;
    btn.classList.add('btn-seal-outline');
  } else {
    btn.style.display = 'none';
    btn.classList.remove('btn-seal-outline');
  }
}

function renderEmptyLibraryState() {
  state.corpusId = '';
  state.corpusMeta = null;
  state.index = null;
  state.arcMap.clear();
  state.sceneMap.clear();
  renderCorpusSelect();
  updateQuickLlmButton({});
  $('#brandTitle').querySelector('span').textContent = 'LoreCodex';
  document.title = 'LoreCodex — 典籍阅读与树检索工作台';
  $('#statMeta').textContent = '当前书库为空，点击「导入」添加小说或世界书';
  const tocList = $('#tocList');
  if (tocList) tocList.innerHTML = '<div style="padding:18px 12px;color:var(--ink-muted);font-size:12px;">暂无书库目录</div>';
  const sheet = $('#bookSheet');
  if (sheet) {
    sheet.innerHTML = `
      <div class="cover-hero" style="padding:48px 16px;">
        <h1 class="book-h1" style="font-size:24px;">书库目前为空</h1>
        <p class="prose" style="max-width:440px;margin:10px auto 18px;text-align:center;color:var(--ink-soft);font-size:14px;">
          点击下方「导入新书」上传小说 (.txt / .md / .epub)、世界书 (.json) 或 .lorepack.json 即可开始。
        </p>
        <div class="quick-actions">
          <button id="emptyImportBtn" class="btn-seal">导入新书</button>
        </div>
      </div>`;
    $('#emptyImportBtn')?.addEventListener('click', () => openImportModal());
  }
}

async function loadCorpusIndex(cid) {
  const idx = await fetchTreeIndex(cid, state.maxOrder);
  state.index = idx;
  state.arcMap.clear();
  state.sceneMap.clear();
  let sumScenes = 0;
  let sumArcs = 0;
  for (const a of idx.arcs || []) {
    state.arcMap.set(a.arc_id, a);
    const aScenes = a.scenes || [];
    let allDone = aScenes.length > 0;
    for (const s of aScenes) {
      state.sceneMap.set(s.node_id, { ...s, arc_id: a.arc_id, arc_title: a.title });
      const sDone = s._llm_done === true || (s._llm_done !== false && Boolean(String(s.summary || '').trim()));
      if (sDone) sumScenes += 1;
      else allDone = false;
    }
    if (a._llm_done === true || (a._llm_done !== false && allDone && aScenes.length > 0)) {
      sumArcs += 1;
    }
  }
  const st = idx.stats || (idx.stats = {});
  if (typeof st.llm_scenes !== 'number') {
    st.llm_scenes = st.llm_arcs === 0 ? 0 : sumScenes;
  }
  if (typeof st.llm_arcs !== 'number') {
    st.llm_arcs = st.llm_scenes === 0 ? 0 : sumArcs;
  }
  $('#brandTitle').querySelector('span').textContent = `LoreCodex · ${corpusName()}`;
  document.title = `${corpusName()} — LoreCodex 工作台`;
  $('#statMeta').textContent = `全录 ${st.arcs || 0} 卷 · ${st.scenes || 0} 幕 · ${fmtChars(st.total_chars || 0)} · 模型 ${state.modelName}`;
  updateQuickLlmButton(st);

  const sg = idx.corpus?.spoiler_gate || {};
  const maxAvailable = st.max_order || state.corpusMeta?.stats?.max_order || 0;
  const bar = $('#spoilerBar');
  if (maxAvailable > 0 || sg.enabled) {
    bar.classList.add('visible');
    $('#spoilerLabel').textContent = `${sg.order_label || '章节进度'}上限 (0=全开${maxAvailable ? ', 全' + maxAvailable : ''})`;
  } else {
    bar.classList.remove('visible');
  }

  if ((idx.arcs || []).length > 100 && state.collapsedSeries.size === 0) {
    const seriesNames = [];
    for (const a of idx.arcs || []) {
      const sk = String(a.series || a.category || '默认分卷').trim();
      if (!seriesNames.includes(sk)) seriesNames.push(sk);
    }
    if (seriesNames.length >= 2) {
      for (const sk of seriesNames.slice(1)) state.collapsedSeries.add(sk);
    }
  }

  renderFilters();
  renderToc();
  renderStage();
}

async function setMaxOrder(val, { reloadIndex = true } = {}) {
  const n = Math.max(0, Math.floor(Number(val) || 0));
  state.maxOrder = n;
  $('#tocMaxOrder').value = n;
  $('#qMaxOrder').value = n;
  if (reloadIndex && state.corpusId) {
    await loadCorpusIndex(state.corpusId);
    if (state.searchMode === 'grep' && state.searchTerm.trim()) await triggerGrep();
  }
}

async function switchCorpus(cid, { keepRun = false } = {}) {
  state.corpusId = cid;
  state.corpusMeta = state.corpora.find((c) => c.id === cid) || null;
  state.category = '全部';
  state.tone = '全部';
  state.grepData = null;
  state.grepTerms = [];
  state.highlightTerms = [];
  state.collapsedSeries.clear();
  state.view = { type: 'cover', arcId: null, nodeId: null };
  if (!keepRun) {
    state.activeRunId = null;
    state.activeRunData = null;
  }

  const sg = state.corpusMeta?.spoiler_gate || {};
  const defOrder = sg.enabled && sg.default_max_order ? Number(sg.default_max_order) : 0;
  state.maxOrder = defOrder;
  $('#tocMaxOrder').value = defOrder;
  $('#qMaxOrder').value = defOrder;
  $('#qChar').value = state.corpusMeta?.ui?.default_char ?? '';
  $('#qUser').value = state.corpusMeta?.ui?.default_user ?? '旅人';
  $('#qMaxScenes').value = 0;

  renderCorpusSelect();
  if (document.body.classList.contains('embed-mode') && window.parent !== window && cid) {
    try {
      window.parent.postMessage({ type: 'lorecodex:st-corpus-changed', corpusId: cid }, '*');
    } catch (_) {}
  }
  await loadCorpusIndex(cid);
  renderPresets();
}

function setupResizer(resizerEl, side) {
  if (!resizerEl) return;
  let dragging = false;
  let startX = 0;
  let startW = 0;

  resizerEl.addEventListener('mousedown', (e) => {
    dragging = true;
    startX = e.clientX;
    startW = side === 'left' ? prefs.tocWidth : prefs.traceWidth;
    resizerEl.classList.add('active');
    document.body.classList.add('resizing');
  });

  window.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - startX;
    if (side === 'left') {
      prefs.tocWidth = Math.min(540, Math.max(240, startW + dx));
      document.documentElement.style.setProperty('--toc-width', `${prefs.tocWidth}px`);
    } else {
      prefs.traceWidth = Math.min(640, Math.max(300, startW - dx));
      document.documentElement.style.setProperty('--trace-width', `${prefs.traceWidth}px`);
    }
  });

  window.addEventListener('mouseup', () => {
    if (!dragging) return;
    dragging = false;
    resizerEl.classList.remove('active');
    document.body.classList.remove('resizing');
    savePrefs();
  });

  resizerEl.addEventListener('dblclick', () => {
    if (side === 'left') prefs.tocWidth = 328;
    else prefs.traceWidth = 430;
    applyPrefs();
    savePrefs();
  });
}

function setMobilePane(pane) {
  const next = pane === 'toc' || pane === 'trace' ? pane : 'stage';
  document.body.dataset.mobilePane = next;
  $$('[data-mobile-pane]').forEach((b) => b.classList.toggle('active', b.dataset.mobilePane === next));
}

function refreshModelMeta() {
  const st = state.index?.stats || {};
  if (state.index) {
    $('#statMeta').textContent = `全录 ${st.arcs || 0} 卷 · ${st.scenes || 0} 幕 · ${fmtChars(st.total_chars || 0)} · 模型 ${state.modelName}`;
  }
  if (state.stageMode === 'book' && state.view.type === 'cover') {
    renderStage();
  }
}

// Register cross-module actions
Object.assign(actions, {
  renderFilters,
  renderToc,
  setStageTab,
  setMobilePane,
  openCover,
  openArc,
  openScene,
  openArcRead,
  setMaxOrder,
  switchCorpus,
  renderEmptyLibraryState,
  refreshModelMeta,
  openSettingsModal,
  openCorpusModal,
  openLibraryModal,
  openImportModal,
  openCommandPalette,
});

function wireEvents() {
  initReaderScroll();
  setupResizer($('#resizerLeft'), 'left');
  setupResizer($('#resizerRight'), 'right');

  $$('.stage-tab').forEach((el) => el.addEventListener('click', () => setStageTab(el.dataset.stage)));

  $$('[data-theme-btn]').forEach((b) =>
    b.addEventListener('click', () => {
      prefs.theme = b.dataset.themeBtn;
      applyPrefs();
      savePrefs();
    })
  );

  $$('[data-size]').forEach((b) =>
    b.addEventListener('click', () => {
      prefs.fontSize = b.dataset.size;
      applyPrefs();
      savePrefs();
    })
  );

  $$('[data-font-btn]').forEach((b) =>
    b.addEventListener('click', () => {
      prefs.fontFamily = b.dataset.fontBtn;
      applyPrefs();
      savePrefs();
    })
  );

  $$('[data-width-btn]').forEach((b) =>
    b.addEventListener('click', () => {
      prefs.sheetWidth = b.dataset.widthBtn;
      applyPrefs();
      savePrefs();
    })
  );

  $('#prefsToggleBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    $('#mobileMenuPopover')?.classList.remove('open');
    $('#prefsPopover').classList.toggle('open');
  });
  $('#mobileMoreBtn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    $('#prefsPopover')?.classList.remove('open');
    $('#mobileMenuPopover')?.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    const pop = $('#prefsPopover');
    if (pop.classList.contains('open') && !pop.contains(e.target) && e.target !== $('#prefsToggleBtn')) {
      pop.classList.remove('open');
    }
    const mPop = $('#mobileMenuPopover');
    if (mPop && mPop.classList.contains('open') && !mPop.contains(e.target) && e.target !== $('#mobileMoreBtn')) {
      mPop.classList.remove('open');
    }
  });

  $$('[data-mobile-pane]').forEach((b) => {
    b.addEventListener('click', () => setMobilePane(b.dataset.mobilePane));
  });

  $('#mobileMenuPopover')?.addEventListener('click', (e) => {
    if (e.target.closest('button')) $('#mobileMenuPopover').classList.remove('open');
  });

  $$('[data-mobile-action]').forEach((b) => {
    b.addEventListener('click', () => {
      $('#mobileMenuPopover')?.classList.remove('open');
      const act = b.dataset.mobileAction;
      if (act === 'import') openImportModal();
      else if (act === 'corpus') openCorpusModal();
      else if (act === 'settings') openSettingsModal();
      else if (act === 'reload') $('#reloadCorporaBtn')?.click();
    });
  });

  $('#toggleTocBtn').addEventListener('click', () => {
    prefs.tocCollapsed = !prefs.tocCollapsed;
    applyPrefs();
    savePrefs();
  });
  $('#toggleTraceBtn').addEventListener('click', () => {
    prefs.traceCollapsed = !prefs.traceCollapsed;
    applyPrefs();
    savePrefs();
  });

  $$('[data-search-mode]').forEach((b) => {
    b.addEventListener('click', () => {
      $$('[data-search-mode]').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.searchMode = b.dataset.searchMode;
      $('#tocSearch').placeholder =
        state.searchMode === 'grep'
          ? '全文扫描人物、台词原句（空格表同幕共现）...'
          : '检篇名、人物、别名、编号...';
      if (state.searchMode === 'grep') triggerGrep();
      renderToc();
    });
  });

  $('#tocSearch').addEventListener('input', (e) => {
    state.searchTerm = e.target.value;
    if (state.searchMode === 'grep') scheduleGrep();
    else renderToc();
  });

  $('#expandAllSeriesBtn').addEventListener('click', () => {
    state.collapsedSeries.clear();
    renderToc();
  });
  $('#collapseAllSeriesBtn').addEventListener('click', () => {
    for (const a of state.index?.arcs || []) {
      state.collapsedSeries.add(String(a.series || a.category || '默认分卷').trim());
    }
    renderToc();
  });

  $('#corpusSelect').addEventListener('change', (e) => {
    if (e.target.value) switchCorpus(e.target.value);
  });
  $('#reloadCorporaBtn').addEventListener('click', async () => {
    const j = await reloadCorpora();
    state.corpora = j.corpora || [];
    const next = state.corpora.some((c) => c.id === state.corpusId)
      ? state.corpusId
      : j.defaultCorpus || state.corpora[0]?.id || '';
    if (next) await switchCorpus(next);
  });

  $('#tocMaxOrder').addEventListener('change', (e) => setMaxOrder(e.target.value, { reloadIndex: true }));
  $('#qMaxOrder').addEventListener('change', (e) => setMaxOrder(e.target.value, { reloadIndex: true }));

  $('#onlyPathBtn').addEventListener('click', () => {
    state.onlyPath = !state.onlyPath;
    $('#onlyPathBtn').classList.toggle('active-toggle', state.onlyPath);
    renderToc();
  });

  $('#clearMarksBtn').addEventListener('click', () => {
    state.activeRunId = null;
    state.activeRunData = null;
    state.onlyPath = false;
    $('#onlyPathBtn').classList.remove('active-toggle');
    renderRunsList();
    renderTrace(null);
    renderToc();
    if (state.stageMode === 'dossier') renderStage();
  });

  $('#homeBtn').addEventListener('click', openCover);
  $('#runBtn').addEventListener('click', executeSearch);
  $('#qOnDemand')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  });
  $('#qText')?.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      executeSearch();
    }
  });

  $('#settingsBtn').addEventListener('click', openSettingsModal);
  $('#stSettingsBtn')?.addEventListener('click', openStSettingsModal);
  $('#corpusCfgBtn').addEventListener('click', () => openCorpusModal('basic'));
  $('#libraryBtn')?.addEventListener('click', openLibraryModal);
  $('#llmBuildQuickBtn')?.addEventListener('click', () => openCorpusModal('upgrade'));
  $('#importBtn').addEventListener('click', openImportModal);
  $('#cmdPaletteBtn').addEventListener('click', openCommandPalette);

  $('#modalBackdrop').addEventListener('click', (e) => {
    if (e.target === $('#modalBackdrop')) closeModal();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      openCommandPalette();
      return;
    }
    if (e.key === 'Escape' && $('#modalBackdrop').classList.contains('open')) {
      closeModal();
      return;
    }
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.key === 'ArrowLeft') navigateSceneDelta(-1);
    if (e.key === 'ArrowRight') navigateSceneDelta(1);
  });
}

async function init() {
  const urlParams = new URLSearchParams(window.location.search);
  const isEmbed = urlParams.get('embed') === '1';
  if (isEmbed) {
    document.body.classList.add('embed-mode');
    if (window.parent !== window) {
      const stBtn = $('#stSettingsBtn');
      if (stBtn) stBtn.style.display = '';
    }
  }
  setMobilePane('stage');

  applyPrefs();
  wireEvents();

  const hashRunMatch = String(window.location.hash || '').match(/run=([a-zA-Z0-9_-]+)/);
  const hashRunId = hashRunMatch ? hashRunMatch[1] : '';
  const reqCorpus = String(urlParams.get('corpus') || '').trim();
  const reqAction = String(urlParams.get('action') || '').trim().toLowerCase();

  try {
    const [h, c] = await Promise.all([fetchHealth(), fetchCorpora()]);
    state.modelName = h.config?.chatModel || '-';
    state.corpora = c.corpora || [];
    const target =
      reqCorpus && state.corpora.some((x) => x.id === reqCorpus)
        ? reqCorpus
        : c.defaultCorpus || state.corpora[0]?.id || '';
    if (target) await switchCorpus(target);
    else $('#statMeta').textContent = '未发现语料包，请点击「导入建树」';
    await pollRuns({ autoSelectNewest: Boolean(hashRunId), preferHashRunId: hashRunId });

    if (reqAction === 'settings') openSettingsModal();
    else if (reqAction === 'library') openLibraryModal();
    else if (reqAction === 'import') openImportModal();
    else if (reqAction === 'upgrade' && state.corpusId) openCorpusModal('upgrade');
    else if (reqAction === 'st-settings' && isEmbed && window.parent !== window) openStSettingsModal();
  } catch (e) {
    $('#statMeta').textContent = '连接异常：' + e.message;
  }

  setInterval(() => {
    if ($('#autoPollRuns').checked) pollRuns({ autoSelectNewest: true });
  }, 2500);
}

init();
