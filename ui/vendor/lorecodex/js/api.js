const IS_LOCAL_QUERY = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('local') === '1';
let forceLocalMode = IS_LOCAL_QUERY;
let browserEnginePromise = null;
const localJobsMap = new Map();
const localJobControllers = new Map();
const localAgentsCache = new Map();

async function getBrowserEngine() {
  if (!browserEnginePromise) {
    browserEnginePromise = import(new URL('../../browser_engine.js', import.meta.url).href).catch(() =>
      import(new URL('../../extension/st-tree-lore/browser_engine.js', import.meta.url).href)
    );
  }
  return browserEnginePromise;
}

async function ensureLocalDemoSeeded(be) {
  const rows = await be.idbListCorpora();
  if (rows.length > 0) return rows;
  try {
    const demoUrl = new URL('../demo-chronicles.lorepack.json', import.meta.url).href;
    const r = await fetch(demoUrl);
    if (r.ok) {
      const rawPack = await r.json();
      const pack = be.buildLoreCorpusInBrowser({
        rawJson: rawPack,
        corpusId: rawPack.id || rawPack.corpus_id || 'demo-chronicles',
        name: rawPack.corpus_name || rawPack.indexData?.corpus_name || '苍穹残响·灰烬星港编年史',
      });
      await be.idbSaveCorpus(pack);
      return await be.idbListCorpora();
    }
  } catch (_) {}
  return rows;
}

async function getLocalAgentAndPack(corpusId) {
  const be = await getBrowserEngine();
  const rows = await ensureLocalDemoSeeded(be);
  const pack = rows.find((p) => p.id === corpusId) || rows[0];
  if (!pack) {
    throw new Error('内置免服务端书库为空，请先点击顶栏「导入建树」导入小说 (.txt / .md)、世界书 (.json) 或 .lorepack.json');
  }
  const cacheKey = `${pack.id}:${pack.updatedAt || ''}`;
  if (!localAgentsCache.has(cacheKey)) {
    localAgentsCache.set(cacheKey, be.createBrowserTreeAgent(pack));
  }
  return { be, pack, agent: localAgentsCache.get(cacheKey), rows };
}

function parseOptionalTemp(val) {
  if (val === null || val === undefined || String(val).trim() === '') return null;
  const n = Number(val);
  return Number.isFinite(n) && n >= 0 && n <= 2 ? n : null;
}

function parseOptionalReasoningEffort(val) {
  const s = String(val || '').trim().toLowerCase();
  return s || null;
}

async function getLocalApiConfig(be) {
  const cfg = (await be.idbGetMeta('local_api_config', null)) || {};
  return {
    defaultCorpus: cfg.defaultCorpus || 'demo-chronicles',
    chatBase: cfg.chatBase || 'https://api.openai.com/v1',
    chatKey: cfg.chatKey || '',
    chatModel: cfg.chatModel || 'deepseek-chat',
    maxTokens: Number(cfg.maxTokens) > 0 ? Math.floor(Number(cfg.maxTokens)) : null,
    temperature: parseOptionalTemp(cfg.temperature),
    reasoningEffort: parseOptionalReasoningEffort(cfg.reasoningEffort),
    llmStream: cfg.llmStream !== false,
  };
}

function decodeBase64ToBytes(b64) {
  const clean = String(b64 || '').replace(/^data:[^;]+;base64,/i, '').trim();
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function reqJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await r.json().catch(() => ({})) : {};
  if (!r.ok) {
    throw new Error(data.error || `HTTP ${r.status}`);
  }
  if (!ct.includes('application/json')) {
    throw new Error('Non-JSON response');
  }
  return data;
}

export async function fetchHealth() {
  if (!forceLocalMode) {
    try {
      const h = await reqJson('/health');
      if (h && h.ok) return h;
    } catch (_) {
      forceLocalMode = true;
    }
  }
  const be = await getBrowserEngine();
  const rows = await ensureLocalDemoSeeded(be);
  const cfg = await getLocalApiConfig(be);
  const active = rows.find((p) => p.id === cfg.defaultCorpus) || rows[0];
  return {
    ok: true,
    engine: 'lorecodex-browser',
    version: '2.1.0',
    mode: 'browser-idb',
    boot_ms: 1,
    defaultCorpus: active?.id || 'demo-chronicles',
    corpora: rows.map((p) => ({
      id: p.id,
      name: p.config?.name || p.id,
      arcs: p.indexData?.stats?.arcs || (p.indexData?.arcs || []).length,
      scenes: p.indexData?.stats?.scenes || Object.keys(p.textsData || {}).length,
      total_chars: p.indexData?.stats?.total_chars || 0,
      max_order: p.indexData?.stats?.max_order || 0,
    })),
    treeLoaded: Boolean(active),
    treeArcs: active?.indexData?.stats?.arcs || 0,
    treeScenes: active?.indexData?.stats?.scenes || 0,
    config: { ...cfg, chatKey: cfg.chatKey ? '***' : '' },
  };
}

export async function fetchCorpora() {
  if (!forceLocalMode) {
    try {
      return await reqJson('/corpora');
    } catch (_) {
      forceLocalMode = true;
    }
  }
  const be = await getBrowserEngine();
  const rows = await ensureLocalDemoSeeded(be);
  const cfg = await getLocalApiConfig(be);
  const corpora = rows.map((p) => {
    const agent = be.createBrowserTreeAgent(p);
    return {
      id: p.id,
      name: p.config?.name || p.id,
      description: p.config?.description || '',
      language: p.config?.language || 'zh-CN',
      stats: agent.stats,
      categories: agent.categories,
      series: agent.seriesList.map((s) => s.series),
      tone_tags: agent.toneTags,
      spoiler_gate: p.config?.spoiler_gate || {},
      prompt_framing: p.config?.prompt_framing || {},
    };
  });
  return {
    defaultCorpus: corpora.some((c) => c.id === cfg.defaultCorpus) ? cfg.defaultCorpus : corpora[0]?.id || '',
    corpora,
  };
}

export async function reloadCorpora() {
  if (!forceLocalMode) {
    try {
      return await reqJson('/corpora/reload', { method: 'POST' });
    } catch (_) {
      forceLocalMode = true;
    }
  }
  localAgentsCache.clear();
  const res = await fetchCorpora();
  return { ok: true, ...res };
}

export async function fetchCorpusDetail(id) {
  if (!forceLocalMode) {
    return reqJson(`/corpora/${encodeURIComponent(id)}`);
  }
  const { pack, agent } = await getLocalAgentAndPack(id);
  return {
    id: pack.id,
    name: pack.config?.name || pack.id,
    description: pack.config?.description || '',
    stats: agent.stats,
    categories: agent.categories,
    series: agent.seriesList.map((s) => s.series),
    tone_tags: agent.toneTags,
    config: pack.config,
  };
}

export async function saveCorpusConfig(id, patch) {
  if (!forceLocalMode) {
    return reqJson(`/corpora/${encodeURIComponent(id)}/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }
  const { be, pack } = await getLocalAgentAndPack(id);
  pack.config = be.normalizeCorpusConfig({ ...(pack.config || {}), ...(patch || {}), id: pack.id }, pack.id);
  if (pack.config.name) pack.indexData.corpus_name = pack.config.name;
  await be.idbSaveCorpus(pack);
  localAgentsCache.clear();
  return { ok: true, corpus: await fetchCorpusDetail(pack.id) };
}

export async function fetchTreeIndex(corpusId, maxOrder = 0) {
  if (!forceLocalMode) {
    const mo = maxOrder > 0 ? `&maxOrder=${maxOrder}` : '';
    return reqJson(`/tree-index?corpus=${encodeURIComponent(corpusId)}${mo}`);
  }
  const { agent } = await getLocalAgentAndPack(corpusId);
  return agent.getTreeIndex({ maxOrder: maxOrder > 0 ? maxOrder : null });
}

export async function fetchSceneText(corpusId, nodeId, maxOrder = 0) {
  if (!forceLocalMode) {
    const mo = maxOrder > 0 ? `&maxOrder=${maxOrder}` : '';
    return reqJson(`/tree-scene?corpus=${encodeURIComponent(corpusId)}&id=${encodeURIComponent(nodeId)}${mo}`);
  }
  const { agent } = await getLocalAgentAndPack(corpusId);
  const sc = agent.getSceneText(nodeId, { maxOrder: maxOrder > 0 ? maxOrder : null });
  if (!sc) throw new Error('scene not found');
  if (sc.blocked) throw new Error(`blocked by spoiler gate (order=${sc.order} > maxOrder=${sc.max_order})`);
  return sc;
}

export async function fetchGrep(corpusId, { q, limit = 40, category = '', tone = '', maxOrder = 0 }) {
  if (!forceLocalMode) {
    const params = new URLSearchParams({
      corpus: corpusId,
      q: q || '',
      limit: String(limit),
    });
    if (category && category !== '全部') params.set('category', category);
    if (tone && tone !== '全部') params.set('tone', tone);
    if (maxOrder > 0) params.set('maxOrder', String(maxOrder));
    return reqJson(`/tree-grep?${params.toString()}`);
  }
  const { agent } = await getLocalAgentAndPack(corpusId);
  return agent.grepScenes(q || '', {
    limit,
    category: category && category !== '全部' ? category : '',
    tone: tone && tone !== '全部' ? tone : '',
    maxOrder: maxOrder > 0 ? maxOrder : null,
  });
}

export async function fetchRuns() {
  if (!forceLocalMode) {
    try {
      return await reqJson('/tree-runs');
    } catch (_) {
      forceLocalMode = true;
    }
  }
  const be = await getBrowserEngine();
  const runs = await be.idbListRuns();
  return { runs };
}

export async function runTreeSearch(payload, { onProgress = null } = {}) {
  if (!forceLocalMode) {
    return reqJson('/tree-search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  const { be, agent } = await getLocalAgentAndPack(payload.corpus);
  const cfg = await getLocalApiConfig(be);
  const out = await agent.search(payload, cfg, { onProgress });
  const run = await be.idbRecordRun(payload, out);
  return { ...out, run_id: run.id };
}

export async function fetchConfig() {
  if (!forceLocalMode) {
    return reqJson('/config');
  }
  const be = await getBrowserEngine();
  const cfg = await getLocalApiConfig(be);
  return {
    ...cfg,
    chatKey: cfg.chatKey ? '***' : '',
  };
}

export async function saveConfig(patch) {
  if (!forceLocalMode) {
    return reqJson('/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
  }
  const be = await getBrowserEngine();
  const cur = await getLocalApiConfig(be);
  const next = {
    defaultCorpus: patch.defaultCorpus || cur.defaultCorpus,
    chatBase: patch.chatBase !== undefined ? String(patch.chatBase).trim() : cur.chatBase,
    chatKey:
      patch.chatKey !== undefined && String(patch.chatKey).trim() && !/^\*+$/.test(String(patch.chatKey).trim())
        ? String(patch.chatKey).trim()
        : cur.chatKey,
    chatModel: patch.chatModel !== undefined ? String(patch.chatModel).trim() : cur.chatModel,
    maxTokens:
      patch.maxTokens !== undefined
        ? Number(patch.maxTokens) > 0
          ? Math.floor(Number(patch.maxTokens))
          : null
        : cur.maxTokens,
    temperature: patch.temperature !== undefined ? parseOptionalTemp(patch.temperature) : cur.temperature,
    reasoningEffort:
      patch.reasoningEffort !== undefined ? parseOptionalReasoningEffort(patch.reasoningEffort) : cur.reasoningEffort,
    llmStream: patch.llmStream !== undefined ? patch.llmStream !== false : cur.llmStream,
  };
  await be.idbSetMeta('local_api_config', next);
  return { ok: true, config: { ...next, chatKey: next.chatKey ? '***' : '' } };
}

export async function fetchModels(baseUrl, apiKey) {
  if (!forceLocalMode) {
    return reqJson('/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseUrl, apiKey }),
    });
  }
  const be = await getBrowserEngine();
  const cur = await getLocalApiConfig(be);
  const cleanBase = String(baseUrl || cur.chatBase || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/(?:chat\/completions|models)$/i, '')
    .replace(/\/+$/, '');
  const key = apiKey && !/^\*+$/.test(String(apiKey).trim()) ? String(apiKey).trim() : cur.chatKey;
  if (!cleanBase || !key) {
    return { ok: false, error: '请先填写 API Base URL 与 API Key' };
  }
  try {
    const r = await fetch(`${cleanBase}/models`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return { ok: false, error: `HTTP ${r.status}${txt ? ': ' + txt.slice(0, 120) : ''}` };
    }
    const j = await r.json();
    const rawList = Array.isArray(j.data) ? j.data : Array.isArray(j.models) ? j.models : [];
    const models = [
      ...new Set(
        rawList
          .map((x) => (typeof x === 'string' ? x : x?.id || String(x?.name || '').replace(/^models\//, '')))
          .map((s) => String(s || '').trim())
          .filter(Boolean)
      ),
    ];
    return { ok: true, models };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export function cancelJob(jobId) {
  const ctrl = localJobControllers.get(jobId);
  if (!ctrl) return false;
  ctrl.abort();
  return true;
}

export function findRunningJobForCorpus(corpusId) {
  const cid = String(corpusId || '').trim();
  if (!cid) return null;
  for (const job of localJobsMap.values()) {
    if (job.corpusId === cid && job.status === 'running') {
      return job;
    }
  }
  return null;
}

export async function previewLocalImportFile({ filename = 'upload.txt', buffer, kind = 'novel', corpusId = 'preview', name = '预览书库', category = '', workers = 8, cleanAds = true, stripBlocks = '', selectedUids = null, filterGameStats = false }) {
  try {
    const be = await getBrowserEngine();
    const rawBytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const fnameLower = String(filename || '').toLowerCase();
    const isLorepack = fnameLower.endsWith('.lorepack.json');
    if (isLorepack) return { ok: false, skipped: true };
    const isEpub = fnameLower.endsWith('.epub');
    const isJson = kind === 'lore' || fnameLower.endsWith('.json') || fnameLower.endsWith('.jsonl');
    const rawText = isEpub
      ? await be.extractEpubTextInBrowser(rawBytes)
      : be.decodeTextBufferAuto(rawBytes);
    const pack = isJson
      ? be.buildLoreCorpusInBrowser({
          rawJson: rawText,
          corpusId: corpusId || 'preview',
          name: name || corpusId || '预览书库',
          category: category || '档案设定',
          selectedUids,
          filterGameStats,
        })
      : be.buildNovelCorpusInBrowser({
          rawText,
          corpusId: corpusId || 'preview',
          name: name || corpusId || '预览书库',
          category: category || '正文',
          cleanAds: cleanAds !== false,
          stripBlocks,
        });
    const report = be.inspectCorpusStructure(pack);
    let loreEntries = null;
    if (isJson) {
      try { loreEntries = be.listWorldbookEntriesInBrowser(rawText); } catch (_) { loreEntries = null; }
    }
    const safeWorkers = Math.min(Math.max(Number(workers) || 8, 1), 24);
    const estimate = isJson ? null : be.estimateBrowserLlmUpgradePlan(pack, { workers: safeWorkers });
    return { ok: true, report, estimate, loreEntries };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  }
}

function buildProgressLabel(prog, fallbackLabel = '') {
  if (!prog) return fallbackLabel;
  if (prog.event === 'done' || prog.phase === 'done') return '全部构建完成';
  if (prog.phase === 'series_meta') {
    return `提炼全卷总览：${prog.series || '默认分卷'}`;
  }
  const serPrefix = prog.series ? `${prog.series} / ` : '';
  const scSuffix = prog.sceneTitle ? ` · ${prog.sceneTitle}` : '';
  return prog.arcTitle ? `${serPrefix}${prog.arcTitle}${scSuffix}` : fallbackLabel;
}

export async function importCorpus(payload) {
  if (!forceLocalMode) {
    return reqJson('/corpora/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  const be = await getBrowserEngine();
  const jobId = 'job_local_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const abortCtrl = new AbortController();
  localJobControllers.set(jobId, abortCtrl);
  const startedAtMs = Date.now();
  const job = {
    id: jobId,
    status: 'running',
    canCancel: true,
    kind: payload.kind || 'novel',
    corpusId: payload.corpusId,
    filename: payload.filename || 'upload.txt',
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: null,
    logs: [`[browser-idb] 正在浏览器内解析与切分「${payload.name || payload.corpusId}」...`],
    progress: {
      phase: 'init',
      event: 'init',
      percent: 0,
      doneArcs: 0,
      totalArcs: 0,
      doneScenes: 0,
      totalScenes: 0,
      doneCalls: 0,
      totalCalls: 0,
      doneSeries: 0,
      totalSeries: 0,
      workers: 4,
      elapsedMs: 0,
      etaMs: null,
      avgCallMs: null,
      estMinMs: 0,
      estMaxMs: 0,
      startedAtMs,
      updatedAtMs: startedAtMs,
      currentLabel: '正在解析并切分文本...',
    },
    error: '',
  };
  localJobsMap.set(jobId, job);

  (async () => {
    let pack = null;
    let buildLock = null;
    try {
      const rawBytes = decodeBase64ToBytes(payload.contentBase64);
      const fnameLower = String(payload.filename || '').toLowerCase();
      const isEpub = fnameLower.endsWith('.epub');
      const isJson = payload.kind === 'lore' || fnameLower.endsWith('.json') || fnameLower.endsWith('.jsonl');
      const rawText = isEpub
        ? await be.extractEpubTextInBrowser(rawBytes)
        : be.decodeTextBufferAuto(rawBytes);
      const existingRows = await be.idbListCorpora();
      const mergeTarget = payload.mergeInto
        ? existingRows.find((r) => r.id === payload.mergeInto) || null
        : null;
      pack = isJson
        ? be.buildLoreCorpusInBrowser({
            rawJson: rawText,
            corpusId: payload.corpusId,
            name: payload.name || payload.corpusId,
            category: payload.category || '档案设定',
            existingPack: mergeTarget,
            selectedUids: Array.isArray(payload.selectedUids) ? payload.selectedUids : null,
            filterGameStats: Boolean(payload.filterGameStats),
          })
        : be.buildNovelCorpusInBrowser({
            rawText,
            corpusId: payload.corpusId,
            name: payload.name || payload.corpusId,
            category: payload.category || '正文',
            cleanAds: payload.cleanAds !== false,
            stripBlocks: payload.stripBlocks || '',
          });
      await be.idbSaveCorpus(pack);
      localAgentsCache.clear();
      const st = pack.indexData?.stats || {};
      const report = be.inspectCorpusStructure(pack);
      job.structureReport = report;
      const cs = report.cleanedSummary;
      if (cs && cs.items.length) {
        job.logs.push(`[browser-idb] 清洗：${cs.items.map((it) => `${it.label} ${it.count} ${it.unit}`).join('，')}`);
      }
      const volStr = report.hasNamedSeries ? `${report.seriesCount} 卷 / ` : '';
      job.logs.push(
        `[browser-idb] 切分完成：${volStr}${st.arcs || 0} 章 / ${st.scenes || 0} 幕 (${(st.total_chars || 0).toLocaleString()} 字，均章 ${report.avgArcChars.toLocaleString()} 字)`
      );
      for (const w of report.warnings) {
        job.logs.push(`[${w.level === 'error' ? '高危异常' : '提示'}] ${w.message}`);
      }

      const isLorepack = fnameLower.endsWith('.lorepack.json');
      if (payload.useLlm && !isLorepack) {
        if (!isJson && report.shouldBlockAutoLlm && !payload.allowLlmOnAnomaly) {
          job.logs.push('[护栏拦截] 检测到高危切分异常，已跳过自动 LLM 构建。请检查目录结构后，在「语料配置 -> LLM 目录补全」手动确认启动。');
        } else {
          buildLock = be.acquireCorpusBuildLock(pack.id, '书阁导入');
          if (!buildLock.ok) {
            job.logs.push(`[并发保护] 书库「${pack.id}」正在「${buildLock.holder?.owner || '其他窗口'}」执行构建，已保存切分结构并跳过自动 LLM 启动。`);
          } else {
            const apiCfg = await getLocalApiConfig(be);
            if (apiCfg.chatBase && apiCfg.chatKey) {
              const workers = Math.min(Math.max(Number(payload.workers) || 8, 1), 24);
              const plan = be.estimateBrowserLlmUpgradePlan(pack, { workers });
              job.progress = {
                ...job.progress,
                phase: 'arcs',
                totalArcs: plan.totalArcs,
                totalScenes: plan.totalScenes,
                totalCalls: plan.totalCalls,
                totalSeries: plan.totalSeriesMeta,
                workers: plan.effectiveWorkers,
                estMinMs: plan.estMinMs,
                estMaxMs: plan.estMaxMs,
                updatedAtMs: Date.now(),
                currentLabel: '准备启动 LLM 目录构建...',
              };
              job.logs.push(
                `[browser-idb] 启动 LLM 智能目录构建：${plan.totalArcs} 章 / ${plan.totalScenes} 幕 / 预计 ${plan.totalCalls} 次请求（并发 ${plan.effectiveWorkers}，参考耗时 ${be.formatDurationZh(plan.estMinMs)} ~ ${be.formatDurationZh(plan.estMaxMs)}）`
              );
              const res = await be.upgradeBrowserCorpusWithLLM(pack, apiCfg, {
                workers,
                signal: abortCtrl.signal,
                onProgress(prog) {
                  job.progress = {
                    ...prog,
                    updatedAtMs: Date.now(),
                    currentLabel: buildProgressLabel(prog, job.progress.currentLabel),
                  };
                  if (prog.event === 'start') {
                    job.logs.push(`[browser-idb] 已派发首批 ${prog.workers} 路并发请求...`);
                  } else if (prog.arcCompleted) {
                    const etaStr = prog.etaMs !== null && prog.etaMs !== undefined ? ` | 剩余约 ${be.formatDurationZh(prog.etaMs)}` : '';
                    job.logs.push(`[${prog.doneArcs}/${prog.totalArcs}] 已完成《${prog.arcTitle}》(${prog.percent}%${etaStr})`);
                  } else if (prog.event === 'series_meta_start') {
                    job.logs.push(`[series_meta] 正在提炼「${prog.series}」全卷总览、人物别名与设定术语...`);
                  }
                },
                async onSave(updatedPack) {
                  await be.idbSaveCorpus(updatedPack);
                  localAgentsCache.clear();
                },
              });
              job.logs.push(
                `[browser-idb] LLM 目录构建完成（耗时 ${be.formatDurationZh(res.elapsedMs)}）：${res.upgradedArcs} 章 / ${res.upgradedScenes} 幕，${res.aliasesCount} 组别名，${res.glossaryCount} 条术语`
              );
            } else {
              job.logs.push('[提示] 尚未配置 API Key，已先保存结构树；请在右上角「模型」配置 API Key 后打开「语料配置 -> LLM 目录补全」');
            }
          }
        }
      }
      job.progress = {
        ...job.progress,
        phase: 'done',
        event: 'done',
        percent: 100,
        etaMs: 0,
        elapsedMs: Date.now() - startedAtMs,
        updatedAtMs: Date.now(),
        currentLabel: '构建完成',
      };
      job.status = 'done';
      job.finishedAt = new Date().toISOString();
    } catch (e) {
      if (pack) {
        await be.idbSaveCorpus(pack).catch(() => {});
        localAgentsCache.clear();
      }
      const aborted = abortCtrl.signal.aborted;
      job.error = e?.message || String(e);
      job.progress = {
        ...job.progress,
        phase: aborted ? 'aborted' : 'error',
        elapsedMs: Date.now() - (job.progress?.startedAtMs || startedAtMs),
        updatedAtMs: Date.now(),
        currentLabel: aborted ? '已暂停，断点已保存' : `出错中断: ${job.error}`,
      };
      if (aborted) {
        job.status = 'aborted';
        job.logs.push('[paused] 用户已暂停，当前已完成章节已写入 IndexedDB，可在「语料配置 -> LLM 目录补全」断点续传');
      } else {
        job.status = 'error';
        job.logs.push(`[error] ${job.error}`);
      }
      job.finishedAt = new Date().toISOString();
    } finally {
      buildLock?.release?.();
      localJobControllers.delete(jobId);
    }
  })();

  return { ok: true, job };
}

export async function upgradeCorpus(id, payload = {}) {
  if (!forceLocalMode) {
    return reqJson(`/corpora/${encodeURIComponent(id)}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload || {}),
    });
  }
  const { be, pack } = await getLocalAgentAndPack(id);
  const existingJob = findRunningJobForCorpus(pack.id);
  if (existingJob) {
    return { ok: true, job: existingJob, reused: true };
  }
  const apiCfg = await getLocalApiConfig(be);
  if (!apiCfg.chatBase || !apiCfg.chatKey) {
    throw new Error('请先点击右上角「模型」配置 API Base URL 与 API Key 后再执行 LLM 目录补全');
  }
  const buildLock = be.acquireCorpusBuildLock(pack.id, '书阁工作台');
  if (!buildLock.ok) {
    throw new Error(`书库「${pack.config?.name || pack.id}」正在「${buildLock.holder?.owner || '其他窗口'}」执行构建，请勿重复启动`);
  }
  const jobId = 'job_upg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const abortCtrl = new AbortController();
  localJobControllers.set(jobId, abortCtrl);
  const workers = Math.min(Math.max(Number(payload.workers) || 8, 1), 24);
  const limitArcs = Number(payload.limitArcs) || 0;
  const force = Boolean(payload.force);
  const skipMeta = Boolean(payload.skipMeta);
  const plan = be.estimateBrowserLlmUpgradePlan(pack, {
    series: payload.series || '',
    limitArcs,
    workers,
    force,
    skipMeta,
  });
  const startedAtMs = Date.now();
  const job = {
    id: jobId,
    status: 'running',
    canCancel: true,
    kind: 'upgrade',
    corpusId: pack.id,
    filename: payload.series ? `upgrade:${payload.series}` : 'upgrade:all',
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: null,
    logs: [
      plan.totalArcs > 0
        ? `[browser-idb] 开始原地补全「${pack.config?.name || pack.id}」LLM 目录：${plan.totalArcs} 章 / ${plan.totalScenes} 幕 / 预计 ${plan.totalCalls} 次请求（并发 ${plan.effectiveWorkers}，参考耗时 ${be.formatDurationZh(plan.estMinMs)} ~ ${be.formatDurationZh(plan.estMaxMs)}）`
        : `[browser-idb] 开始原地补全「${pack.config?.name || pack.id}」LLM 目录...`,
    ],
    progress: {
      phase: 'arcs',
      event: 'init',
      percent: plan.totalArcs ? 0 : 100,
      doneArcs: 0,
      totalArcs: plan.totalArcs,
      doneScenes: 0,
      totalScenes: plan.totalScenes,
      doneCalls: 0,
      totalCalls: plan.totalCalls,
      doneSeries: 0,
      totalSeries: plan.totalSeriesMeta,
      workers: plan.effectiveWorkers,
      elapsedMs: 0,
      etaMs: null,
      avgCallMs: null,
      estMinMs: plan.estMinMs,
      estMaxMs: plan.estMaxMs,
      startedAtMs,
      updatedAtMs: startedAtMs,
      currentLabel: plan.targetArcs[0]?.title ? `准备构建：${plan.targetArcs[0].title}` : '准备构建...',
    },
    error: '',
  };
  localJobsMap.set(jobId, job);

  (async () => {
    try {
      const res = await be.upgradeBrowserCorpusWithLLM(pack, apiCfg, {
        series: payload.series || '',
        limitArcs,
        force,
        skipMeta,
        workers,
        signal: abortCtrl.signal,
        onProgress(prog) {
          job.progress = {
            ...prog,
            updatedAtMs: Date.now(),
            currentLabel: buildProgressLabel(prog, job.progress.currentLabel),
          };
          if (prog.event === 'start') {
            job.logs.push(`[browser-idb] 已派发首批 ${prog.workers} 路并发请求...`);
          } else if (prog.arcCompleted) {
            const etaStr = prog.etaMs !== null && prog.etaMs !== undefined ? ` | 剩余约 ${be.formatDurationZh(prog.etaMs)}` : '';
            job.logs.push(`[${prog.doneArcs}/${prog.totalArcs}] 已补全《${prog.arcTitle}》(${prog.percent}%${etaStr})`);
          } else if (prog.event === 'series_meta_start') {
            job.logs.push(`[series_meta] 正在提炼「${prog.series}」全卷总览、人物别名与设定术语...`);
          }
        },
        async onSave(updatedPack) {
          await be.idbSaveCorpus(updatedPack);
          localAgentsCache.clear();
        },
      });
      await be.idbSaveCorpus(pack);
      localAgentsCache.clear();
      if (res.message) {
        job.logs.push(res.message);
      } else {
        job.logs.push(
          `[browser-idb] 完成（总耗时 ${be.formatDurationZh(res.elapsedMs)}）：升级 ${res.upgradedArcs} 章 / ${res.upgradedScenes} 幕，合成 ${res.synthesizedSeries} 卷总览，累计 ${res.aliasesCount} 组别名、${res.glossaryCount} 条术语`
        );
      }
      job.progress = {
        ...job.progress,
        phase: 'done',
        event: 'done',
        percent: 100,
        etaMs: 0,
        elapsedMs: res.elapsedMs ?? (Date.now() - startedAtMs),
        updatedAtMs: Date.now(),
        currentLabel: res.message || '全部补全完成',
      };
      job.status = 'done';
      job.finishedAt = new Date().toISOString();
    } catch (e) {
      await be.idbSaveCorpus(pack).catch(() => {});
      localAgentsCache.clear();
      const aborted = abortCtrl.signal.aborted;
      job.error = e?.message || String(e);
      job.progress = {
        ...job.progress,
        phase: aborted ? 'aborted' : 'error',
        elapsedMs: Date.now() - (job.progress?.startedAtMs || startedAtMs),
        updatedAtMs: Date.now(),
        currentLabel: aborted ? '已暂停，断点已保存' : `出错中断: ${job.error}`,
      };
      if (aborted) {
        job.status = 'aborted';
        job.logs.push('[paused] 用户已暂停，已完成章节已写入 IndexedDB，可随时点击开始继续断点续传');
      } else {
        job.status = 'error';
        job.logs.push(`[error] ${job.error}`);
      }
      job.finishedAt = new Date().toISOString();
    } finally {
      buildLock.release();
      localJobControllers.delete(jobId);
    }
  })();

  return { ok: true, job };
}

export async function fetchJob(jobId) {
  if (!forceLocalMode && !String(jobId).startsWith('job_local_') && !String(jobId).startsWith('job_upg_')) {
    return reqJson(`/jobs/${encodeURIComponent(jobId)}`);
  }
  const job = localJobsMap.get(jobId);
  if (!job) throw new Error('job not found');
  return { ok: true, job };
}

export async function exportCorpusLorepack(id) {
  if (!forceLocalMode) {
    window.open(`/corpora/${encodeURIComponent(id)}/export`, '_blank');
    return;
  }
  const { pack } = await getLocalAgentAndPack(id);
  const blob = new Blob([JSON.stringify({ format: 'lorecodex-pack-v2', ...pack }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${pack.id}.lorepack.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function deleteCorpus(id) {
  const cid = String(id || '').trim();
  if (!cid) throw new Error('书库 ID 不能为空');
  if (!forceLocalMode) {
    return reqJson(`/corpora/${encodeURIComponent(cid)}`, { method: 'DELETE' });
  }
  const be = await getBrowserEngine();
  await be.idbDeleteCorpus(cid);
  for (const key of Array.from(localAgentsCache.keys())) {
    if (key.startsWith(`${cid}:`)) localAgentsCache.delete(key);
  }
  const listRes = await fetchCorpora();
  return { ok: true, deleted: cid, ...listRes };
}
