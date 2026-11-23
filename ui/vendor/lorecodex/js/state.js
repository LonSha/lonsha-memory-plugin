export const $ = (s) => document.querySelector(s);
export const $$ = (s) => document.querySelectorAll(s);

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));

export const fmtChars = (n) => {
  const num = Number(n) || 0;
  return num >= 10000 ? `${(num / 10000).toFixed(1)} 万字` : `${num.toLocaleString()} 字`;
};

const PREFS_KEY = 'lorecodex_prefs_v22';
const embedParams = (() => {
  try {
    const p = new URLSearchParams(window.location.search);
    return { isEmbed: p.get('embed') === '1', reqTheme: p.get('theme') || '' };
  } catch (_) {
    return { isEmbed: false, reqTheme: '' };
  }
})();
const defaultPrefs = {
  theme: embedParams.isEmbed ? (embedParams.reqTheme === 'paper' ? 'paper' : 'lamp') : 'paper',
  fontSize: '16.5',
  fontFamily: 'serif',
  sheetWidth: '780',
  tocWidth: 328,
  traceWidth: 430,
  tocCollapsed: false,
  traceCollapsed: true,
};

export const prefs = (() => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const merged = raw ? { ...defaultPrefs, ...JSON.parse(raw) } : { ...defaultPrefs };
    if (embedParams.isEmbed && (embedParams.reqTheme === 'paper' || embedParams.reqTheme === 'lamp')) {
      merged.theme = embedParams.reqTheme;
    }
    return merged;
  } catch (_) {
    return { ...defaultPrefs };
  }
})();

export function savePrefs() {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch (_) {}
}

export function applyPrefs() {
  const root = document.documentElement;
  if (prefs.theme === 'paper') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', prefs.theme);

  root.setAttribute('data-font', prefs.fontFamily === 'sans' ? 'sans' : 'serif');
  root.style.setProperty('--read-size', `${prefs.fontSize}px`);
  root.style.setProperty('--sheet-width', `${prefs.sheetWidth}px`);
  root.style.setProperty('--toc-width', `${prefs.tocWidth}px`);
  root.style.setProperty('--trace-width', `${prefs.traceWidth}px`);

  $$('[data-theme-btn]').forEach((b) => b.classList.toggle('active', b.dataset.themeBtn === prefs.theme));
  $$('[data-size]').forEach((b) => b.classList.toggle('active', b.dataset.size === String(prefs.fontSize)));
  $$('[data-font-btn]').forEach((b) => b.classList.toggle('active', b.dataset.fontBtn === prefs.fontFamily));
  $$('[data-width-btn]').forEach((b) => b.classList.toggle('active', b.dataset.widthBtn === String(prefs.sheetWidth)));

  const tocPane = $('#tocPane');
  const resLeft = $('#resizerLeft');
  const tracePane = $('#tracePane');
  const resRight = $('#resizerRight');

  if (tocPane && resLeft) {
    tocPane.classList.toggle('collapsed', Boolean(prefs.tocCollapsed));
    resLeft.classList.toggle('hidden', Boolean(prefs.tocCollapsed));
    $('#toggleTocBtn')?.classList.toggle('active-toggle', !prefs.tocCollapsed);
  }
  if (tracePane && resRight) {
    tracePane.classList.toggle('collapsed', Boolean(prefs.traceCollapsed));
    resRight.classList.toggle('hidden', Boolean(prefs.traceCollapsed));
    $('#toggleTraceBtn')?.classList.toggle('active-toggle', !prefs.traceCollapsed);
  }
}

export function showToast(msg, kind = '') {
  const stack = $('#toastStack');
  if (!stack) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  stack.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .25s';
    setTimeout(() => el.remove(), 260);
  }, 2600);
}

export const state = {
  corpora: [],
  corpusId: '',
  corpusMeta: null,
  index: null,
  modelName: '-',
  maxOrder: 0,
  arcMap: new Map(),
  sceneMap: new Map(),
  sceneCache: new Map(),
  collapsedSeries: new Set(),
  category: '全部',
  tone: '全部',
  searchMode: 'toc',
  searchTerm: '',
  grepData: null,
  grepTerms: [],
  highlightTerms: [],
  highlightIndex: 0,
  onlyPath: false,
  stageMode: 'book',
  view: { type: 'cover', arcId: null, nodeId: null },
  runs: [],
  runsInitialized: false,
  lastSeenTopRunId: '',
  activeRunId: null,
  activeRunData: null,
};

// Registered by main.js so sub-modules stay decoupled
export const actions = {};

export function corpusName() {
  return state.index?.corpus_name || state.corpusMeta?.name || state.corpusId || 'LoreCodex';
}

export function getMarks() {
  const tr = state.activeRunData?.traversal || {};
  return {
    listed: new Set(tr.listed_arcs || []),
    expanded: new Set(tr.expanded_arcs || []),
    read: new Set(tr.read_scenes || []),
    selected: new Set(tr.selected_nodes || []),
    rawSelected: new Set(tr.raw_selected_nodes || []),
  };
}

export function expandSearchAliases(term) {
  const t = String(term || '').trim().toLowerCase();
  if (!t || !state.index?.aliases) return t ? [t] : [];
  const out = new Set([t]);
  for (const grp of state.index.aliases) {
    if (grp.some((g) => g.toLowerCase() === t || t.includes(g.toLowerCase()) || g.toLowerCase().includes(t))) {
      for (const g of grp) out.add(g.toLowerCase());
    }
  }
  return [...out];
}

export function expandGrepQueryTerms(rawQuery) {
  const rawTokens = String(rawQuery || '')
    .trim()
    .split(/[\s,，、]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const out = new Set();
  for (const tk of rawTokens) {
    for (const expanded of expandSearchAliases(tk)) {
      if (expanded.length >= 1) out.add(expanded);
    }
  }
  return [...out].sort((a, b) => b.length - a.length);
}

// XSS-safe highlighter: splits plain text first, escapes slices, then wraps hits with <mark>
export function highlightEscapedText(rawText, terms, hitCounter = null) {
  const text = String(rawText ?? '');
  const cleanTerms = [...new Set((terms || []).map((t) => String(t || '').trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (!cleanTerms.length || !text) return esc(text);

  const escapedRe = cleanTerms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const re = new RegExp(`(${escapedRe})`, 'gi');
  const parts = text.split(re);
  if (parts.length <= 1) return esc(text);

  let html = '';
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    if (i % 2 === 1) {
      const idxAttr = hitCounter ? ` data-hit-idx="${hitCounter.count++}"` : '';
      html += `<mark class="grep-hit"${idxAttr}>${esc(part)}</mark>`;
    } else {
      html += esc(part);
    }
  }
  return html;
}
