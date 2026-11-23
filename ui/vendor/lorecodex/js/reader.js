import {
  $,
  esc,
  fmtChars,
  showToast,
  state,
  actions,
  corpusName,
  getMarks,
  highlightEscapedText,
} from './state.js';
import { fetchSceneText } from './api.js';

function formatProse(rawText, highlightTerms = []) {
  const lines = String(rawText || '').split(/\r?\n/);
  const hitCounter = highlightTerms.length ? { count: 0 } : null;
  return lines
    .map((line) => {
      const t = line.trim();
      if (!t) return '';
      if (/^[（(].*[）)]$/.test(t)) {
        return `<p class="stage-note">${highlightEscapedText(t, highlightTerms, hitCounter)}</p>`;
      }
      const sp = t.match(/^([A-Za-z0-9\u4e00-\u9fff·_-]{1,14})[：:]\s*(.+)$/);
      if (sp && !/^http/i.test(sp[1])) {
        return `<p class="dialogue"><span class="speaker">${esc(sp[1])}</span>${highlightEscapedText(sp[2], highlightTerms, hitCounter)}</p>`;
      }
      return `<p class="dialogue">${highlightEscapedText(t, highlightTerms, hitCounter)}</p>`;
    })
    .filter(Boolean)
    .join('');
}

// XSS-safe guide node linker: turns [0525] or node:0525 into interactive pill buttons
function renderGuideWithLinks(rawGuide, knownNodeIds) {
  const text = String(rawGuide || '');
  if (!text) return '（无导读）';
  const re = /(\[(?:node:)?([0-9A-Za-z_-]{3,12})\]|node:([0-9A-Za-z_-]{3,12}))/g;
  let out = '';
  let lastIdx = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIdx) out += esc(text.slice(lastIdx, m.index));
    const nid = m[2] || m[3];
    if (knownNodeIds.has(nid) || state.sceneMap.has(nid)) {
      out += `<button type="button" class="node-pill" data-guide-node="${esc(nid)}" title="定位到节点 ${esc(nid)}">${esc(m[0])}</button>`;
    } else {
      out += esc(m[0]);
    }
    lastIdx = re.lastIndex;
  }
  if (lastIdx < text.length) out += esc(text.slice(lastIdx));
  return out;
}

function buildInjectionPreview(out) {
  const pf = state.corpusMeta?.prompt_framing || state.index?.corpus?.prompt_framing || {};
  const tag = String(pf.xml_tag || 'lore_source_reference').replace(/[^a-zA-Z0-9_-]/g, '') || 'lore_source_reference';
  const header =
    pf.header ||
    `以下为《${corpusName()}》典籍中检索并核实的过往剧情原文与设定片段。请将其作为角色回忆或既有经历自然融入扮演，不要机械复读旁白。`;
  const priority =
    pf.priority_rule ||
    '【事实优先级】若原作片段细节与当前世界书/角色卡设定或本局对话已确认的新发展存在冲突，一律以本局当前时间线为准。';

  const parts = [`<${tag}>`, header, priority];
  if (out.max_order) {
    parts.push(`【防剧透进度锁定】当前仅解锁至进度序 <= ${out.max_order} 的已知章节，请严守角色当下认知边界。`);
  }
  if (out.guide) {
    parts.push(`\n【记忆导读${out.timeline_note ? ' | ' + out.timeline_note : ''}】\n${out.guide}`);
  }
  if (out.outlines?.length) {
    parts.push(
      '\n【跨篇章宏观脉络大纲】\n' +
        out.outlines
          .map((o) => `《${o.title} [${o.arc_id}]》（${o.category} · ${o.scene_count}幕）\n概要：${o.description || ''}\n${o.outline_text}`)
          .join('\n\n')
    );
  }
  if (out.scenes?.length) {
    parts.push(
      '\n' +
        out.scenes
          .map((s, i) => {
            const cat = s.category ? ` (${s.category})` : '';
            const st = s.title ? ` | ${s.title}` : '';
            const ord = s.order !== null && s.order !== undefined ? ` | 序${s.order}` : '';
            return `【原著场景 ${i + 1} | ${s.arc_title || ''}${cat}${st}${ord} [node:${s.node_id}]】\n${s.text}`;
          })
          .join('\n\n')
    );
  }
  if (out.relations?.length) {
    parts.push(`\n【实体关系图谱】\n${out.relations.slice(0, 8).join('\n')}`);
  }
  parts.push(`</${tag}>`);
  return parts.join('\n');
}

function updateReadProgress() {
  const bar = $('#readProgressBar');
  const scroller = $('#bookScroll');
  if (!bar || !scroller) return;
  if (state.stageMode !== 'book' || (state.view.type !== 'arc-read' && state.view.type !== 'scene')) {
    bar.style.width = '0%';
    return;
  }
  const max = scroller.scrollHeight - scroller.clientHeight;
  const pct = max > 0 ? Math.min(100, Math.max(0, (scroller.scrollTop / max) * 100)) : 100;
  bar.style.width = `${pct.toFixed(1)}%`;
}

export function initReaderScroll() {
  $('#bookScroll')?.addEventListener('scroll', updateReadProgress);
}

export function setStageTab(mode) {
  state.stageMode = mode;
  document.querySelectorAll('.stage-tab').forEach((el) => el.classList.toggle('active', el.dataset.stage === mode));
  renderStage();
}

export function openCover() {
  state.highlightTerms = [];
  state.view = { type: 'cover', arcId: null, nodeId: null };
  setStageTab('book');
  actions.renderToc?.();
  if (window.innerWidth <= 860) actions.setMobilePane?.('stage');
}

export function openArc(aid) {
  if (!state.arcMap.has(aid)) return;
  state.highlightTerms = [];
  state.view = { type: 'arc', arcId: aid, nodeId: null };
  setStageTab('book');
  actions.renderToc?.();
  $('#bookScroll').scrollTop = 0;
  if (window.innerWidth <= 860) actions.setMobilePane?.('stage');
}

export async function openScene(nid, aid, opts = {}) {
  const meta = state.sceneMap.get(nid);
  const arcId = aid || meta?.arc_id;
  state.highlightTerms = Array.isArray(opts.highlightTerms) ? opts.highlightTerms : [];
  state.highlightIndex = 0;
  state.view = { type: 'scene', arcId, nodeId: nid };
  setStageTab('book');
  actions.renderToc?.();
  $('#bookScroll').scrollTop = 0;
  if (window.innerWidth <= 860) actions.setMobilePane?.('stage');
}

export async function openArcRead(aid) {
  if (!state.arcMap.has(aid)) return;
  state.highlightTerms = [];
  state.view = { type: 'arc-read', arcId: aid, nodeId: null };
  setStageTab('book');
  actions.renderToc?.();
  $('#bookScroll').scrollTop = 0;
  if (window.innerWidth <= 860) actions.setMobilePane?.('stage');
}

export function navigateSceneDelta(delta) {
  if (state.stageMode !== 'book' || state.view.type !== 'scene') return;
  const arc = state.arcMap.get(state.view.arcId);
  const scenes = arc?.scenes || [];
  const idx = scenes.findIndex((x) => x.node_id === state.view.nodeId);
  if (idx < 0) return;
  const next = scenes[idx + delta];
  if (next) openScene(next.node_id, arc.arc_id);
}

export async function renderStage() {
  const sheet = $('#bookSheet');
  if (state.stageMode === 'dossier') {
    $('#stageStatus').textContent = '检索选段卷宗';
    renderDossierSheet(sheet);
    updateReadProgress();
    return;
  }
  const v = state.view;
  if (v.type === 'cover' || !state.index) {
    $('#stageStatus').textContent = '扉页总目';
    renderCoverSheet(sheet);
    updateReadProgress();
    return;
  }
  if (v.type === 'arc') {
    const arc = state.arcMap.get(v.arcId);
    if (!arc) return renderCoverSheet(sheet);
    $('#stageStatus').textContent = `${arc.category} · ${arc.arc_id}`;
    renderArcOverviewSheet(sheet, arc);
    updateReadProgress();
    return;
  }
  if (v.type === 'scene') {
    const arc = state.arcMap.get(v.arcId);
    $('#stageStatus').textContent = `精读单幕 · ${v.nodeId}`;
    await renderSingleSceneSheet(sheet, v.nodeId, arc);
    updateReadProgress();
    return;
  }
  if (v.type === 'arc-read') {
    const arc = state.arcMap.get(v.arcId);
    if (!arc) return renderCoverSheet(sheet);
    $('#stageStatus').textContent = `连读全卷 · ${arc.arc_id}`;
    await renderContinuousArcSheet(sheet, arc);
    updateReadProgress();
  }
}

function renderCoverSheet(sheet) {
  if (!state.index) {
    sheet.innerHTML = `<div class="cover-hero"><p style="color:var(--ink-muted);">正在展卷载入典籍索引...</p></div>`;
    return;
  }
  const st = state.index.stats || {};
  const byCat = new Map();
  for (const a of state.index.arcs || []) {
    const cur = byCat.get(a.category || '默认') || { arcs: 0, scenes: 0, chars: 0, firstArc: a.arc_id };
    cur.arcs += 1;
    cur.scenes += (a.scenes || []).length;
    cur.chars += a.total_chars || 0;
    byCat.set(a.category || '默认', cur);
  }
  const cards = [...byCat.entries()]
    .map(
      ([cat, info]) => `
    <div class="vol-card" data-jump-cat="${esc(cat)}" data-first="${esc(info.firstArc)}">
      <div class="vol-cat">${esc(cat)}</div>
      <div class="vol-stat">${info.arcs} 卷 · ${info.scenes} 幕 · ${fmtChars(info.chars)}</div>
    </div>
  `
    )
    .join('');

  const aliases = state.index.aliases || [];
  const aliasPreview = aliases.length
    ? `<details class="colophon-box" style="margin-top:22px;text-align:left;">
        <summary style="cursor:pointer;font-weight:600;">人物别名展开组（共 ${aliases.length} 组）</summary>
        <div class="colophon-tags">${aliases
          .slice(0, 14)
          .map((g) => `<span class="colophon-tag">${esc(g.slice(0, 3).join(' / '))}</span>`)
          .join('')}${aliases.length > 14 ? `<span class="colophon-tag">…+${aliases.length - 14}</span>` : ''}</div>
      </details>`
    : '';

  const desc =
    state.index.corpus?.description ||
    '左侧浏览目录与全文检索，中央阅读原著与检索选段，右侧可测试 Agent 翻书过程。';

  const firstArc = (state.index.arcs || [])[0];
  const totalScenes = st.scenes || 0;
  const llmScenes = st.llm_scenes || 0;
  const pendingLlm = Math.max(0, totalScenes - llmScenes);
  const llmBtnLabel =
    totalScenes === 0
      ? 'LLM 建立目录'
      : pendingLlm > 0
      ? `LLM 建立目录 (${llmScenes}/${totalScenes} 幕)`
      : `LLM 目录已就绪 (${llmScenes}/${totalScenes} 幕)`;

  sheet.innerHTML = `
    <div class="running-head">
      <span>${esc(corpusName())} · 典籍档案总目</span>
      <span>LoreCodex v2.2 · 模型 ${esc(state.modelName)}</span>
    </div>
    <div class="cover-hero">
      <h1 class="book-h1" style="font-size:28px;">${esc(corpusName())}</h1>
      <p class="prose" style="max-width:560px;margin:8px auto 0;text-align:center;color:var(--ink-soft);font-size:14px;">${esc(desc)}</p>
      <div class="cover-ornament"></div>

      <div class="kpi-grid">
        <div class="kpi-card"><div class="kpi-val">${st.arcs || 0}</div><div class="kpi-lbl">收录篇章卷宗</div></div>
        <div class="kpi-card"><div class="kpi-val">${totalScenes}</div><div class="kpi-lbl">无截断原场景幕</div></div>
        <div class="kpi-card"><div class="kpi-val">${fmtChars(st.total_chars || 0)}</div><div class="kpi-lbl">典籍总字数</div></div>
        <div class="kpi-card"><div class="kpi-val">${llmScenes}/${totalScenes}</div><div class="kpi-lbl">LLM 智能目录覆盖</div></div>
      </div>

      <div class="quick-actions">
        ${firstArc ? `<button id="covReadBtn" class="btn-seal">开始阅读</button>` : ''}
        <button id="covUpgradeBtn" class="${pendingLlm > 0 && !firstArc ? 'btn-seal' : ''}">${esc(llmBtnLabel)}</button>
        <button id="covManageBtn" class="btn-ghost" title="管理全部书库、导出或删除">管理 / 删除书库</button>
      </div>

      <div class="vol-grid">${cards}</div>
      ${aliasPreview}
    </div>
  `;

  sheet.querySelectorAll('.vol-card').forEach((el) => {
    el.addEventListener('click', () => {
      state.category = el.dataset.jumpCat;
      actions.renderFilters?.();
      openArc(el.dataset.first);
    });
  });
  $('#covReadBtn')?.addEventListener('click', () => {
    if (firstArc) openArc(firstArc.arc_id);
  });
  $('#covUpgradeBtn')?.addEventListener('click', () => actions.openCorpusModal?.('upgrade'));
  $('#covManageBtn')?.addEventListener('click', () => actions.openLibraryModal?.());
}

function renderArcOverviewSheet(sheet, arc) {
  const { read, selected } = getMarks();
  const scenesHtml = (arc.scenes || [])
    .map((s, i) => {
      const isSel = selected.has(s.node_id);
      const isRead = read.has(s.node_id);
      const cls = isSel ? 'mark-selected' : isRead ? 'mark-read' : '';
      const stamp = isSel ? '<span class="stamp sel">入选</span>' : isRead ? '<span class="stamp read">已阅</span>' : '';
      const tones = (s.tone_tags || []).map((t) => `<span class="tone-pill">${esc(t)}</span>`).join('');
      return `
      <div class="arc-scene-card ${cls}" data-nid="${esc(s.node_id)}">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
          <span style="font-family:var(--heading-font);font-weight:700;font-size:14.5px;">第 ${i + 1} 幕 · ${esc(s.title || s.group_title)}</span>
          <span style="font-family:var(--mono);font-size:11px;color:var(--ink-muted);display:flex;gap:5px;align-items:center;">
            ${tones}${stamp} ${esc(s.node_id)} · ${s.chars} 字
          </span>
        </div>
        <div style="font-size:12.5px;line-height:1.6;color:var(--ink-soft);">${esc(s.summary)}</div>
      </div>
    `;
    })
    .join('');

  sheet.innerHTML = `
    <div class="running-head">
      <span>${arc.series ? esc(arc.series) + ' · ' : ''}${esc(arc.category)} · 卷号 ${esc(arc.arc_id)}</span>
      <span>共 ${arc.scenes.length} 幕 · ${(arc.total_chars || 0).toLocaleString()} 字${arc.order != null ? ` · 序 ${arc.order}` : ''}</span>
    </div>
    <h1 class="book-h1">${esc(arc.title)}</h1>
    <div class="book-subtitle">档案键 ${esc(arc.arc_key || arc.arc_id)}</div>

    <div class="colophon-box">
      <div><strong>本卷题要：</strong>${esc(arc.description || '无题要记录')}</div>
      ${(arc.tone_tags || []).length ? `<div class="colophon-tags"><span style="font-size:11px;color:var(--ink-muted);align-self:center;">氛围：</span>${arc.tone_tags.map((t) => `<span class="colophon-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      ${(arc.characters || []).length ? `<div class="colophon-tags"><span style="font-size:11px;color:var(--ink-muted);align-self:center;">出场：</span>${arc.characters.map((c) => `<span class="colophon-tag">${esc(c)}</span>`).join('')}</div>` : ''}
      ${(arc.key_items || []).length ? `<div class="colophon-tags"><span style="font-size:11px;color:var(--ink-muted);align-self:center;">索引节要：</span>${arc.key_items.map((k) => `<span class="colophon-tag">${esc(k)}</span>`).join('')}</div>` : ''}
    </div>

    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
      <span style="font-family:var(--heading-font);font-weight:700;font-size:15px;">分幕目录</span>
      <div style="display:flex;gap:8px;">
        ${arc.scenes.length ? `<button id="startReadFirstBtn">从第一幕精读</button>` : ''}
        ${arc.scenes.length ? `<button id="readContinuousBtn" class="btn-seal">连读整卷正文</button>` : ''}
      </div>
    </div>

    ${scenesHtml}
  `;

  sheet.querySelectorAll('.arc-scene-card').forEach((el) => {
    el.addEventListener('click', () => openScene(el.dataset.nid, arc.arc_id));
  });
  $('#startReadFirstBtn')?.addEventListener('click', () => openScene(arc.scenes[0].node_id, arc.arc_id));
  $('#readContinuousBtn')?.addEventListener('click', () => openArcRead(arc.arc_id));
}

async function renderSingleSceneSheet(sheet, nid, arc) {
  sheet.innerHTML = `<div style="padding:48px 0;text-align:center;color:var(--ink-muted);">正在展卷调取第 ${esc(nid)} 幕原文...</div>`;
  try {
    const mo = state.maxOrder > 0 ? state.maxOrder : 0;
    const cacheKey = `${state.corpusId}:${mo}:${nid}`;
    let sc = state.sceneCache.get(cacheKey);
    if (!sc) {
      sc = await fetchSceneText(state.corpusId, nid, mo);
      state.sceneCache.set(cacheKey, sc);
    }
    const parentArc = arc || state.arcMap.get(sc.arc_id);
    const scenes = parentArc?.scenes || [];
    const idx = scenes.findIndex((x) => x.node_id === nid);
    const prev = idx > 0 ? scenes[idx - 1] : null;
    const next = idx >= 0 && idx < scenes.length - 1 ? scenes[idx + 1] : null;
    const { read, selected } = getMarks();
    const stamp = selected.has(nid)
      ? '<span class="stamp sel">本次检索入选</span>'
      : read.has(nid)
        ? '<span class="stamp read">Agent 已翻阅</span>'
        : '';
    const tones = (sc.tone_tags || []).map((t) => `<span class="tone-pill">${esc(t)}</span>`).join('');
    const proseHtml = formatProse(sc.text, state.highlightTerms);

    sheet.innerHTML = `
      <div class="running-head">
        <span><a href="javascript:void(0)" id="crumbArc" style="color:var(--ink-soft);text-decoration:none;">${esc(sc.category)} · ${esc(sc.arc_title)}</a></span>
        <span>${idx >= 0 ? `第 ${idx + 1} / ${scenes.length} 幕 · ` : ''}节点 ${esc(sc.node_id)} · ${sc.chars} 字</span>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:6px;flex-wrap:wrap;">
        <span style="font-family:var(--mono);font-size:11.5px;color:var(--ink-muted);">${sc.order != null ? `ORDER ${sc.order} · ` : ''}GROUP ${esc(sc.group)} ${sc.group_title && sc.group_title !== sc.group ? '· ' + esc(sc.group_title) : ''}</span>
        <div style="display:flex;gap:6px;align-items:center;">
          ${tones}${stamp}
          ${parentArc ? `<button id="switchContBtn" class="btn-sm">连读整卷</button>` : ''}
        </div>
      </div>
      <h1 class="book-h1">${esc(sc.title)}</h1>
      ${sc.summary ? `<div class="colophon-box" style="margin-top:12px;"><strong>幕要：</strong>${esc(sc.summary)}</div>` : '<div style="height:10px;"></div>'}

      <div id="hitNavBar" class="hit-nav-bar">
        <span id="hitNavLabel">命中 0 处</span>
        <div style="display:flex;gap:6px;">
          <button id="hitPrevBtn" class="btn-sm">↑ 上一处</button>
          <button id="hitNextBtn" class="btn-sm">↓ 下一处</button>
          <button id="hitClearBtn" class="btn-sm">清除高亮</button>
        </div>
      </div>

      <div class="prose" id="proseContainer">${proseHtml}</div>

      <div class="page-turner">
        ${prev ? `<button class="turn-btn" id="prevSceneBtn" title="${esc(prev.title)}">← 上一幕：${esc(prev.title)}</button>` : `<button class="turn-btn" id="backArcBtn">← 返回本卷目录</button>`}
        <span style="font-size:12px;color:var(--ink-muted);">${idx >= 0 ? `${idx + 1} / ${scenes.length}` : sc.node_id}</span>
        ${next ? `<button class="turn-btn" id="nextSceneBtn" title="${esc(next.title)}">下一幕：${esc(next.title)} →</button>` : `<button class="turn-btn" id="endArcBtn">本卷已终 · 返回目录</button>`}
      </div>
    `;

    const hitEls = [...sheet.querySelectorAll('#proseContainer mark.grep-hit')];
    if (hitEls.length) {
      $('#hitNavBar').classList.add('visible');
      const focusHit = (newIdx) => {
        state.highlightIndex = ((newIdx % hitEls.length) + hitEls.length) % hitEls.length;
        hitEls.forEach((el, i) => el.classList.toggle('current-hit', i === state.highlightIndex));
        $('#hitNavLabel').textContent = `全文检索命中 ${state.highlightIndex + 1} / ${hitEls.length} 处`;
        hitEls[state.highlightIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
      };
      focusHit(0);
      $('#hitPrevBtn').addEventListener('click', () => focusHit(state.highlightIndex - 1));
      $('#hitNextBtn').addEventListener('click', () => focusHit(state.highlightIndex + 1));
      $('#hitClearBtn').addEventListener('click', () => {
        state.highlightTerms = [];
        renderSingleSceneSheet(sheet, nid, arc);
      });
    }

    $('#crumbArc')?.addEventListener('click', () => openArc(sc.arc_id));
    $('#switchContBtn')?.addEventListener('click', () => openArcRead(sc.arc_id));
    $('#prevSceneBtn')?.addEventListener('click', () => openScene(prev.node_id, sc.arc_id));
    $('#nextSceneBtn')?.addEventListener('click', () => openScene(next.node_id, sc.arc_id));
    $('#backArcBtn')?.addEventListener('click', () => openArc(sc.arc_id));
    $('#endArcBtn')?.addEventListener('click', () => openArc(sc.arc_id));
  } catch (e) {
    sheet.innerHTML = `<div style="padding:36px;color:var(--seal);">读取失败：${esc(e.message)}</div>`;
  }
}

async function renderContinuousArcSheet(sheet, arc) {
  sheet.innerHTML = `<div style="padding:48px 0;text-align:center;color:var(--ink-muted);">正在汇编《${esc(arc.title)}》全卷 ${arc.scenes.length} 幕正文...</div>`;
  try {
    const mo = state.maxOrder > 0 ? state.maxOrder : 0;
    const loaded = await Promise.all(
      (arc.scenes || []).map(async (s) => {
        const key = `${state.corpusId}:${mo}:${s.node_id}`;
        if (!state.sceneCache.has(key)) {
          state.sceneCache.set(key, await fetchSceneText(state.corpusId, s.node_id, mo));
        }
        return state.sceneCache.get(key);
      })
    );
    const { read, selected } = getMarks();
    const sections = loaded
      .map((sc, idx) => {
        const stamp = selected.has(sc.node_id)
          ? '<span class="stamp sel">入选</span>'
          : read.has(sc.node_id)
            ? '<span class="stamp read">已阅</span>'
            : '';
        return `
        <section class="chapter-break" id="sec-${esc(sc.node_id)}">
          <div class="chapter-break-meta">
            <span>第 ${idx + 1} 幕</span>
            <span>节点 ${esc(sc.node_id)}</span>
            <span>${sc.chars} 字</span>
            ${stamp}
          </div>
          <h2 class="chapter-break-title">${esc(sc.title)}</h2>
          <div class="prose">${formatProse(sc.text)}</div>
        </section>
      `;
      })
      .join('');

    sheet.innerHTML = `
      <div class="running-head">
        <span><a href="javascript:void(0)" id="contBackArc" style="color:var(--ink-soft);text-decoration:none;">← 返回《${esc(arc.title)}》目录页</a></span>
        <span>全卷连读 · ${arc.scenes.length} 幕 · ${(arc.total_chars || 0).toLocaleString()} 字</span>
      </div>
      <h1 class="book-h1">${esc(arc.title)}</h1>
      <div class="colophon-box">
        <div>${esc(arc.description || '')}</div>
        <div class="colophon-tags" style="margin-top:10px;">
          ${loaded.map((s, idx) => `<a href="#sec-${esc(s.node_id)}" class="colophon-tag" style="text-decoration:none;">${idx + 1}. ${esc(s.title)}</a>`).join('')}
        </div>
      </div>
      ${sections}
      <div class="page-turner">
        <button class="turn-btn" id="contTopBtn">↑ 回到卷首</button>
        <span style="font-size:12px;color:var(--ink-muted);">《${esc(arc.title)}》全卷毕</span>
        <button class="turn-btn" id="contDoneBtn">返回目录页</button>
      </div>
    `;
    $('#contBackArc')?.addEventListener('click', () => openArc(arc.arc_id));
    $('#contDoneBtn')?.addEventListener('click', () => openArc(arc.arc_id));
    $('#contTopBtn')?.addEventListener('click', () => {
      $('#bookScroll').scrollTop = 0;
    });
  } catch (e) {
    sheet.innerHTML = `<div style="padding:36px;color:var(--seal);">汇编失败：${esc(e.message)}</div>`;
  }
}

function renderDossierSheet(sheet) {
  const out = state.activeRunData;
  if (!out) {
    sheet.innerHTML = `<div class="cover-hero"><p style="color:var(--ink-muted);">尚无检索记录。请在右侧检索台执行一次测试，或等待外部请求同步。</p></div>`;
    return;
  }
  if (out.skip) {
    sheet.innerHTML = `
      <div class="running-head">
        <span>检索判定卷宗 · ${esc(out.corpus_name || out.corpus_id || '')}</span>
        <span>耗时 ${out.took_ms} ms · ${out.turns} 轮</span>
      </div>
      <div class="guide-card" style="border-left-color:var(--ochre);">
        <div style="font-family:var(--heading-font);font-weight:700;font-size:16px;margin-bottom:8px;">本轮判定跳过记忆注入（skip = true）</div>
        <div style="line-height:1.7;color:var(--ink-soft);"><strong>判定理据：</strong>${esc(out.reason || '无需检索')}</div>
      </div>
    `;
    return;
  }

  const totalChars = (out.scenes || []).reduce((a, b) => a + (b.chars || b.text?.length || 0), 0);
  const tr = out.traversal || {};
  const knownNodeIds = new Set((out.scenes || []).map((s) => s.node_id));

  const excerpts = (out.scenes || [])
    .map((s, idx) => {
      const tones = (s.tone_tags || []).map((t) => `<span class="tone-pill">${esc(t)}</span>`).join('');
      const povNote = s.present === false ? '<span class="stamp exp">POV缺席·转述</span>' : '';
      return `
      <div class="excerpt-block" id="dossier-scene-${esc(s.node_id)}">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px;flex-wrap:wrap;">
          <span style="font-family:var(--mono);font-size:11px;color:var(--ink-muted);">摘录 ${idx + 1} · 节点 ${esc(s.node_id)} · ${esc(s.category)}${s.order != null ? ` · 序${s.order}` : ''} · ${s.chars} 字 ${tones} ${povNote}</span>
          <div style="display:flex;gap:6px;">
            <button class="dos-open-scene btn-sm" data-nid="${esc(s.node_id)}" data-aid="${esc(s.arc_id)}">单幕阅读</button>
            <button class="dos-open-arc btn-sm" data-aid="${esc(s.arc_id)}">连读整卷 →</button>
          </div>
        </div>
        <h2 class="chapter-break-title" style="margin-bottom:4px;">${esc(s.title)}</h2>
        <div style="font-size:12px;color:var(--ink-muted);margin-bottom:14px;">出处：[${esc(s.arc_id)}] ${esc(s.arc_title)}</div>
        <div class="prose">${formatProse(s.text)}</div>
      </div>
    `;
    })
    .join('');

  const outlinesHtml = (out.outlines || [])
    .map(
      (o) => `
    <div class="excerpt-block">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:6px;">
        <span style="font-family:var(--mono);font-size:11px;color:var(--ochre);">宏观脉络大纲 · 卷 ${esc(o.arc_id)} · ${esc(o.category)} · ${o.scene_count} 幕</span>
        <button class="dos-open-arc btn-sm" data-aid="${esc(o.arc_id)}">连读本卷正文 →</button>
      </div>
      <h2 class="chapter-break-title" style="margin-bottom:6px;">${esc(o.title)}</h2>
      ${o.description ? `<div style="font-size:12.5px;color:var(--ink-soft);margin-bottom:10px;">${esc(o.description)}</div>` : ''}
      <pre class="raw-pre" style="max-height:none;font-family:var(--body-font);font-size:13.5px;line-height:1.75;padding:12px;">${esc(o.outline_text)}</pre>
    </div>
  `
    )
    .join('');

  const relHtml = (out.relations || []).length
    ? `<div class="colophon-box" style="margin-top:18px;">
        <strong>实体关系图谱参考：</strong>
        <div style="margin-top:6px;font-family:var(--mono);font-size:11.5px;line-height:1.6;">${out.relations.map(esc).join('<br/>')}</div>
      </div>`
    : '';

  const previewText = buildInjectionPreview(out);
  const estTokens = Math.ceil(previewText.length / 1.8);

  sheet.innerHTML = `
    <div class="running-head">
      <span>检索选段与记忆导读卷宗 · ${esc(out.corpus_name || out.corpus_id || '')}</span>
      <span>入选 ${(out.scenes || []).length} 幕${(out.outlines || []).length ? ` · ${out.outlines.length} 卷大纲` : ''} · ${totalChars.toLocaleString()} 字 · ${out.took_ms} ms${out.max_order ? ` · 序<=${out.max_order}` : ''}</span>
    </div>
    <div class="guide-card">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
        <span style="font-family:var(--heading-font);font-weight:700;font-size:15.5px;">记忆导读（点击节点胶囊定位对应原文）</span>
        ${out.timeline_note ? `<span class="stamp sel">${esc(out.timeline_note)}</span>` : ''}
      </div>
      <div style="line-height:1.78;font-family:var(--body-font);font-size:15px;white-space:pre-line;">${renderGuideWithLinks(out.guide, knownNodeIds)}</div>
      ${(tr.raw_selected_nodes || []).length ? `<div style="margin-top:10px;font-size:11.5px;color:var(--ink-muted);">模型点选节点：${tr.raw_selected_nodes.map((x) => `<button type="button" class="node-pill" data-guide-node="${esc(x)}">${esc(x)}</button>`).join(' ')}</div>` : ''}
    </div>

    <details class="colophon-box" style="padding:10px 14px;margin-bottom:18px;">
      <summary style="cursor:pointer;font-weight:600;display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <span>酒馆实际注入上下文预览（${previewText.length.toLocaleString()} 字符 · 约 ${estTokens.toLocaleString()} tokens）</span>
        <button type="button" id="copyInjectionBtn" class="btn-sm">复制完整注入文本</button>
      </summary>
      <pre class="raw-pre" style="max-height:300px;margin-top:10px;">${esc(previewText)}</pre>
    </details>

    ${outlinesHtml}
    ${excerpts}
    ${relHtml}
  `;

  $('#copyInjectionBtn')?.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(previewText);
      showToast('已复制酒馆注入文本到剪贴板', 'ok');
    } catch (_) {
      showToast('复制失败，请手动展开选中复制', 'err');
    }
  });

  sheet.querySelectorAll('[data-guide-node]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nid = btn.dataset.guideNode;
      const target = document.getElementById(`dossier-scene-${nid}`);
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('flash-focus');
        setTimeout(() => target.classList.remove('flash-focus'), 1100);
      } else {
        openScene(nid);
      }
    });
  });

  sheet.querySelectorAll('.dos-open-scene').forEach((el) => {
    el.addEventListener('click', () => openScene(el.dataset.nid, el.dataset.aid));
  });
  sheet.querySelectorAll('.dos-open-arc').forEach((el) => {
    el.addEventListener('click', () => openArcRead(el.dataset.aid));
  });
}
