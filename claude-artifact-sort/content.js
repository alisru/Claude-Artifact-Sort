// Claude Artifact Sorter — content.js
// Scans the Claude DOM for file/artifact nodes, extracts all available data,
// and exposes sort/reorder controls via injected panel.

(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────

  const PANEL_ID = 'cas-panel';
  const STORAGE_KEY = 'cas_sort_prefs';
  const SCAN_INTERVAL = 1200; // ms between rescans

  // ─── Module-level state (GAP 1: SPA nav tracking) ────────────────────────
  let artifactObserverRef = null; // kept so we can disconnect on chat change
  let currentChatId = null;
  let activeSortMode = 'dom-order';

  // Selectors to try — Claude's classes are hashed so we cast a wide net
  // and score candidates by structural likelihood.
  const CANDIDATE_SELECTORS = [
    '[data-testid*="file"]',
    '[data-testid*="artifact"]',
    '[data-testid*="attachment"]',
    '[aria-label*="file"]',
    '[aria-label*="artifact"]',
    '[aria-label*="attachment"]',
    'button[class*="file"]',
    'div[class*="file-item"]',
    'div[class*="attachment"]',
    'li[class*="file"]',
  ];

  // ─── Source Classification ────────────────────────────────────────────────
  //
  // Confirmed from DOM inspection:
  //   UPLOADS:    data-testid="file-thumbnail"  (thumbnail cards in message flow)
  //               name lives in h3 inside the button
  //   GENERATED:  role="button" + aria-label ending ". Open artifact."
  //               name lives in .leading-tight div inside artifact-block-cell
  //   PROJECT:    unknown — sidebar was collapsed in available DOM dump
  //               positional fallback only until confirmed

  function scanUploads() {
    // Scope to the sidebar "Content" section — same files appear in message flow too.
    // The sidebar Content section has an h3 with text "Content".
    let container = null;
    document.querySelectorAll('h3').forEach(h => {
      if (h.textContent.trim() === 'Content') container = h.closest('[class*="overflow"]') || h.parentElement?.parentElement;
    });

    const scope = container || document;
    return Array.from(scope.querySelectorAll('[data-testid="file-thumbnail"]'))
      .filter(node => node.querySelector('button') && !node.querySelector('a[href]'))
      .map(node => {
        const h3 = node.querySelector('h3');
        const typeBadge = node.querySelector('p.uppercase, p[class*="uppercase"]');
        return {
          node, score: 15, source: 'upload',
          data: {
            name: h3 ? h3.textContent.trim() : null,
            type: typeBadge ? typeBadge.textContent.trim().toUpperCase() : null,
            date: null, size: null, id: null,
            allAttributes: Object.fromEntries(Array.from(node.attributes).map(a => [a.name, a.value])),
            allDataAttributes: {},
            rawText: h3 ? h3.textContent.trim() : '',
            tagName: node.tagName, classes: safeClassName(node),
          }
        };
      })
      .filter(i => i.data.name);
  }

  function scanGenerated() {
    // Scope to the right sidebar artifacts panel only — not inline message flow.
    // The sidebar panel has an h3 with text "Artifacts" near the top.
    // All artifact cards sit inside div.flex.flex-col.gap-2 inside that panel.
    let container = null;
    document.querySelectorAll('h3').forEach(h => {
      if (h.textContent.trim() === 'Artifacts') container = h.closest('[class*="overflow"]') || h.parentElement?.parentElement;
    });

    const scope = container || document;
    return Array.from(scope.querySelectorAll('[role="button"][aria-label$=". Open artifact."]'))
      .map(node => {
        const nameEl = node.querySelector('.leading-tight, [class*="leading-tight"]');
        const typeEl = node.querySelector('[class*="text-text-400"]');
        let type = null;
        if (typeEl) {
          const m = typeEl.textContent.match(/\b([A-Z]{2,5})\s*$/);
          if (m) type = m[1];
        }
        const ariaLabel = node.getAttribute('aria-label') || '';
        const name = nameEl
          ? nameEl.textContent.trim()
          : ariaLabel.replace(/\. Open artifact\.$/, '').trim();
        return {
          node, score: 15, source: 'generated',
          data: {
            name: name || null, type,
            date: null, size: null, id: null,
            allAttributes: Object.fromEntries(Array.from(node.attributes).map(a => [a.name, a.value])),
            allDataAttributes: {},
            rawText: name, tagName: node.tagName, classes: safeClassName(node),
          }
        };
      })
      .filter(i => i.data.name);
  }

  function scanUploads() {
    // Uploaded files: look for role="button" with an inner SVG and no chat generation marks
    // Usually these are inside messages or in a file tray.
    return Array.from(document.querySelectorAll('[data-testid="file-thumbnail"], [class*="max-w-[12rem]"]'))
      .filter(node => !node.querySelector('a[href]') && node.querySelector('h3'))
      .map(node => {
        const h3 = node.querySelector('h3');
        const typeBadge = node.querySelector('p.uppercase, p[class*="uppercase"]');
        return {
          node, score: 0, source: 'uploaded',
          data: {
            name: h3 ? h3.textContent.trim() : null,
            type: typeBadge ? typeBadge.textContent.trim().toUpperCase() : null,
            date: null, size: null, id: null,
            allAttributes: Object.fromEntries(Array.from(node.attributes).map(a => [a.name, a.value])),
            allDataAttributes: {},
            rawText: h3 ? h3.textContent.trim() : '',
            tagName: node.tagName, classes: safeClassName(node),
          }
        };
      })
      .filter(i => i.data.name);
  }

  function scanProject() {
    // Project files: data-testid="file-thumbnail" with inner <a href> (Google Docs links)
    return Array.from(document.querySelectorAll('[data-testid="file-thumbnail"]'))
      .filter(node => node.querySelector('a[href]'))
      .map(node => {
        const h3 = node.querySelector('h3');
        const typeBadge = node.querySelector('p.uppercase, p[class*="uppercase"]');
        const link = node.querySelector('a[href]');
        return {
          node, score: 15, source: 'project',
          data: {
            name: h3 ? h3.textContent.trim() : null,
            type: typeBadge ? typeBadge.textContent.trim().toUpperCase() : null,
            date: null, size: null,
            id: link ? link.getAttribute('href') : null,
            allAttributes: Object.fromEntries(Array.from(node.attributes).map(a => [a.name, a.value])),
            allDataAttributes: {},
            rawText: h3 ? h3.textContent.trim() : '',
            tagName: node.tagName, classes: safeClassName(node),
          }
        };
      })
      .filter(i => i.data.name);
  }

  // ── Persistent storage ────────────────────────────────────────────────────
  // chrome.storage.local keys:
  //   cas_summaries   : { [name]: string }
  //   cas_first_seen  : { [name]: ISO timestamp }

  function getChatId() {
    return (window.location.href.match(/\/chat\/([a-z0-9-]+)/) || [])[1] || 'global';
  }

  function getProjectId() {
    // From URL or from the breadcrumb link in the header
    const fromUrl = (window.location.href.match(/\/project\/([a-z0-9-]+)/) || [])[1];
    if (fromUrl) return fromUrl;
    const link = document.querySelector('a[href*="/project/"]');
    if (link) return (link.getAttribute('href').match(/\/project\/([a-z0-9-]+)/) || [])[1] || null;
    return null;
  }

  function getProjectName() {
    const link = document.querySelector('a[href*="/project/"]');
    return link ? link.textContent.trim() : null;
  }

  // All per-chat data stored under proj_UUID/chat_UUID or chat_UUID
  function storageKey(key) {
    const proj = getProjectId();
    const chat = getChatId();
    return proj ? `proj_${proj}/chat_${chat}_${key}` : `chat_${chat}_${key}`;
  }

  function storageGet(key) {
    const k = storageKey(key);
    return new Promise(r => chrome.storage.local.get(k, d => r(d[k] || {})));
  }
  function storageSet(key, val) {
    const k = storageKey(key);
    return new Promise(r => chrome.storage.local.set({ [k]: val }, r));
  }

  // Record this chat into the project index
  async function registerChatInProject(items) {
    const proj = getProjectId();
    if (!proj) return;
    const indexKey = `proj_${proj}_chat_index`;
    const chatId = getChatId();
    const chatName = document.querySelector('[data-testid="chat-title-button"]')?.textContent?.trim() || chatId;
    const data = await new Promise(r => chrome.storage.local.get(indexKey, d => r(d[indexKey] || {})));
    data[chatId] = {
      name: chatName,
      projectId: proj,
      projectName: getProjectName(),
      artifactCount: items.filter(i => i.source === 'generated').length,
      lastSeen: new Date().getHours().toString().padStart(2,'0') + ':' +
                new Date().getMinutes().toString().padStart(2,'0') + ' ' +
                new Date().getDate().toString().padStart(2,'0') + '.' +
                (new Date().getMonth()+1).toString().padStart(2,'0'),
    };
    await new Promise(r => chrome.storage.local.set({ [indexKey]: data }, r));
  }

  async function recordFirstSeen(items) {
    const seen = await storageGet('cas_first_seen');
    let changed = false;
    items.forEach(item => {
      if (item.data.name && !seen[item.data.name]) {
        const now = new Date();
        seen[item.data.name] = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')} ${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}`;
        changed = true;
      }
    });
    if (changed) await storageSet('cas_first_seen', seen);
    return seen;
  }

  async function loadAndInjectStoredSummaries(items) {
    const summaries = await storageGet('cas_summaries');
    items.forEach(item => {
      const s = summaries[item.data.name];
      if (s) injectSummary(item.node, s);
    });
  }

  function injectSidebarSortBar(items) {
    if (!items || items.length === 0) return;

    // We must find the TRUE side-panel container, avoiding inline chat message containers.
    // 1. Priority check: Claude's side panel has an 'Artifacts' header above the list.
    let listContainer = null;
    document.querySelectorAll('h3').forEach(h => {
      if (h.textContent.trim().startsWith('Artifact')) {
        const section = h.closest('[class*="overflow"]') || h.parentElement?.parentElement;
        if (section) {
          // Find the wrapper using either flex classes, or simply the parent of the first button inside the section
          listContainer = section.querySelector('[class*="flex-col"][class*="gap-2"]') || section.querySelector('[role="button"]')?.parentElement;
        }
      }
    });

    // 2. Fallback: Identify the parent element holding the most artifact cards.
    // Inline messages rarely hold as many cards as the consolidated side panel list.
    if (!listContainer) {
      const parentCounts = new Map();
      items.forEach(item => {
        const p = item.node.parentElement;
        parentCounts.set(p, (parentCounts.get(p) || 0) + 1);
      });
      let maxCards = 0;
      for (const [p, count] of parentCounts.entries()) {
        if (count > maxCards) {
          maxCards = count;
          listContainer = p;
        }
      }
    }

    if (!listContainer) return;

    // If it's already properly mounted in this container, we don't need to rebuild it (prevents flickering)
    const existingBar = document.getElementById('cas-sidebar-bar');
    if (existingBar && listContainer.contains(existingBar) && listContainer.firstChild === existingBar) {
      if (activeSortMode && activeSortMode !== 'dom-order') applySort(items, activeSortMode);
      return;
    }
    existingBar?.remove();

    const bar = document.createElement('div');
    bar.id = 'cas-sidebar-bar';
    bar.style.cssText = [
      'display:flex','gap:4px','align-items:center',
      'padding:4px 4px 6px',
      'font-family:monospace','font-size:10px',
    ].join(';');

    bar.innerHTML = `
      <span style="color:#555;font-size:9px;letter-spacing:0.08em;flex-shrink:0">⬡ SORT</span>
      <button data-cas-sort="name-asc"  style="${sidebarBtnStyle()}">A→Z</button>
      <button data-cas-sort="name-desc" style="${sidebarBtnStyle()}">Z→A</button>
      <button data-cas-sort="dom-order" style="${sidebarBtnStyle()}">↺</button>
    `;

    // Apply active sort immediately if returning from closed state
    if (activeSortMode && activeSortMode !== 'dom-order') {
      applySort(items, activeSortMode);
      bar.querySelectorAll('button').forEach(b => b.style.color = '#555');
      const activeBtn = bar.querySelector(`[data-cas-sort="${activeSortMode}"]`);
      if (activeBtn) activeBtn.style.color = '#f0c040';
    }

    bar.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', e => {
        const mode = btn.getAttribute('data-cas-sort');
        applySort(items, mode);
        activeSortMode = mode; // Save global state so it survives sidebar re-opening!

        // Update active state
        bar.querySelectorAll('button').forEach(b => b.style.color = '#555');
        if (mode !== 'dom-order') btn.style.color = '#f0c040';
        
        // Also sync floating panel UI if open
        const floatSelect = document.getElementById('cas-sort-mode');
        if (floatSelect) {
          floatSelect.value = mode;
          const status = document.getElementById('cas-status');
          if (status) status.textContent = `Sorted: ${mode}`;
        }
      });
    });

    listContainer.insertBefore(bar, listContainer.firstChild);
  }

  function sidebarBtnStyle(active) {
    return [
      'background:none','border:1px solid #2a2e36',
      'color:#555','padding:2px 7px','border-radius:3px',
      'font-family:monospace','font-size:9px','cursor:pointer',
      'transition:color 0.15s,border-color 0.15s',
    ].join(';');
  }

  async function storeSummary(name, text) {
    const summaries = await storageGet('cas_summaries');
    summaries[name] = text;
    await storageSet('cas_summaries', summaries);
  }

  function scanForFileList() {
    const generated = scanGenerated();

    // Deduplicate by name and node
    const seenNames = new Set();
    const seenNodes = new Set();
    const all = generated.filter(i => {
      if (!i.data.name || seenNames.has(i.data.name) || seenNodes.has(i.node)) return false;
      seenNames.add(i.data.name);
      seenNodes.add(i.node);
      return true;
    });

    recordFirstSeen(all);
    loadAndInjectStoredSummaries(all);
    injectSidebarSortBar(all);
    registerChatInProject(all);

    return all;
  }

  function safeClassName(node) {
    const c = node.className;
    if (!c) return '';
    if (typeof c === 'string') return c.toLowerCase();
    if (typeof c.baseVal === 'string') return c.baseVal.toLowerCase();
    return '';
  }

  function scoreNode(node) {
    let score = 0;
    const text = (node.textContent || '').trim();
    const tag = node.tagName.toLowerCase();
    const cls = safeClassName(node);
    const testid = (node.getAttribute('data-testid') || '').toLowerCase();
    const aria = (node.getAttribute('aria-label') || '').toLowerCase();

    // HARD REQUIREMENT: must have a file extension somewhere visible
    // This is the primary gate — model names, UI labels, etc. fail here
    const hasExt = /\.(md|txt|pdf|docx|xlsx|pptx|csv|json|js|ts|py|html|css|zip|png|jpg|jpeg|gif|svg)(\s|$)/i;
    if (hasExt.test(text)) score += 10;
    if (hasExt.test(aria)) score += 10;
    if (hasExt.test(testid)) score += 8;

    // Explicit file/attachment signals in testid or aria
    if (/file|artifact|attachment/i.test(testid)) score += 6;
    if (/file|artifact|attachment/i.test(aria)) score += 6;

    // Text is filename-length (not a sentence, not a single word like a model name)
    const trimmed = text.trim();
    if (trimmed.length > 3 && trimmed.length < 80) score += 1;

    // Has data attributes
    const dataAttrs = Array.from(node.attributes).filter(a => a.name.startsWith('data-'));
    score += Math.min(dataAttrs.length, 4);

    return score;
  }

  function extractNodeData(node) {
    const data = {
      name: null,
      type: null,
      size: null,
      date: null,
      id: null,
      allAttributes: {},
      allDataAttributes: {},
      ariaLabel: null,
      testId: null,
      rawText: (node.textContent || '').trim().slice(0, 200),
      tagName: node.tagName,
      classes: safeClassName(node),
    };

    // All attributes
    Array.from(node.attributes).forEach(attr => {
      data.allAttributes[attr.name] = attr.value;
      if (attr.name.startsWith('data-')) {
        data.allDataAttributes[attr.name] = attr.value;
      }
    });

    // Known useful attributes
    data.ariaLabel = node.getAttribute('aria-label') || null;
    data.testId = node.getAttribute('data-testid') || null;
    data.id = node.id || node.getAttribute('data-id') || node.getAttribute('data-file-id') || null;

    // Try to extract a file name
    // Priority: aria-label > testid > text content with extension > first short text child
    if (data.ariaLabel && /\.\w{2,5}$/.test(data.ariaLabel)) {
      data.name = data.ariaLabel;
    } else if (data.testId && /\.\w{2,5}$/.test(data.testId)) {
      data.name = data.testId;
    } else {
      // Walk child text nodes for something that looks like a filename
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) {
        const t = textNode.textContent.trim();
        if (t.length > 0 && t.length < 120 && /\.\w{2,5}$/.test(t)) {
          data.name = t;
          break;
        }
      }
      // Fallback: first meaningful text content
      if (!data.name && data.rawText.length > 0 && data.rawText.length < 80) {
        data.name = data.rawText;
      }
    }

    // Try to extract file type from name or explicit attribute
    if (data.name) {
      const ext = data.name.match(/\.(\w{2,5})$/);
      if (ext) data.type = ext[1].toUpperCase();
    }
    data.type = data.type
      || node.getAttribute('data-type')
      || node.getAttribute('data-mime')
      || node.getAttribute('type')
      || null;

    // Size — look for data-size or text that looks like a file size
    data.size = node.getAttribute('data-size')
      || node.getAttribute('data-file-size')
      || extractSizeFromText(data.rawText)
      || null;

    // Date — look for data-date, data-created, data-modified, datetime, title with date
    data.date = node.getAttribute('data-date')
      || node.getAttribute('data-created')
      || node.getAttribute('data-modified')
      || node.getAttribute('data-timestamp')
      || node.getAttribute('datetime')
      || extractDateFromText(data.rawText)
      || extractDateFromChildren(node)
      || null;

    return data;
  }

  function extractSizeFromText(text) {
    const m = text.match(/(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)/i);
    return m ? m[0] : null;
  }

  function extractDateFromText(text) {
    // ISO date, relative date, or common formats
    const patterns = [
      /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
      /\d{4}-\d{2}-\d{2}/,
      /\d{1,2}\/\d{1,2}\/\d{2,4}/,
      /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2},?\s+\d{4}/i,
    ];
    for (const p of patterns) {
      const m = text.match(p);
      if (m) return m[0];
    }
    return null;
  }

  function extractDateFromChildren(node) {
    // Look for time elements or elements with datetime attributes
    const timeEl = node.querySelector('time[datetime]');
    if (timeEl) return timeEl.getAttribute('datetime');
    const titleEl = node.querySelector('[title]');
    if (titleEl) {
      const t = titleEl.getAttribute('title');
      return extractDateFromText(t) || null;
    }
    return null;
  }

  // ─── Sort Engine ──────────────────────────────────────────────────────────

  function sortItems(items, mode) {
    const sorted = [...items];
    switch (mode) {
      case 'name-asc':
        sorted.sort((a, b) => (a.data.name || '').localeCompare(b.data.name || ''));
        break;
      case 'name-desc':
        sorted.sort((a, b) => (b.data.name || '').localeCompare(a.data.name || ''));
        break;
      case 'dom-order':
      default:
        break;
    }
    return sorted;
  }

  function applySort(items, mode) {
    if (mode === 'dom-order' || items.length < 2) return;

    const groups = { upload: [], generated: [], project: [], unknown: [] };
    items.forEach(item => groups[item.source || 'unknown'].push(item));

    for (const [source, groupItems] of Object.entries(groups)) {
      if (source !== 'generated') continue;
      const sorted = sortItems(groupItems, mode);

      // Generated: node is role="button" inside data-state="closed" wrapper.
      // Move the wrapper (one level up), not the card itself.
      const movable = sorted.map(item =>
        source === 'generated' ? (item.node.parentElement || item.node) : item.node
      );

      const parent = movable[0]?.parentElement;
      if (!parent) continue;
      movable.forEach(el => parent.appendChild(el));
    }
  }

  // ─── Panel UI ─────────────────────────────────────────────────────────────

  function buildPanel() {
    if (document.getElementById(PANEL_ID)) return;

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div id="cas-header">
        <span id="cas-title">⬡ ARTIFACT SORTER</span>
        <div id="cas-controls">
          <button id="cas-scan" title="Rescan DOM">↺</button>
          <button id="cas-inspect" title="Dump raw DOM data to console">⚙</button>
          <button id="cas-toggle" title="Collapse">▾</button>
          <button id="cas-close" title="Close">✕</button>
        </div>
      </div>
      <div id="cas-body">
        <div id="cas-tabs">
          <button class="cas-tab cas-tab-active" data-tab="chat">This chat</button>
          <button class="cas-tab" data-tab="project">Project</button>
        </div>
        <div id="cas-tab-chat">
        <div id="cas-sort-row">
          <label>Sort by</label>
          <select id="cas-sort-mode">
            <option value="dom-order" ${activeSortMode === 'dom-order' ? 'selected' : ''}>Original order</option>
            <option value="name-asc" ${activeSortMode === 'name-asc' ? 'selected' : ''}>Name A→Z</option>
            <option value="name-desc" ${activeSortMode === 'name-desc' ? 'selected' : ''}>Name Z→A</option>
          </select>
          <button id="cas-apply">Apply</button>
        </div>
        <div id="cas-summary-row">
          <div style="display:flex;gap:5px;align-items:center">
            <select id="cas-sum-length">
              <option value="1">1 sentence</option>
              <option value="2">2–3 sentences</option>
              <option value="5">5 sentences</option>
            </select>
            <button id="cas-sum-copy">⎘ Copy prompt</button>
          </div>
          <div style="display:flex;gap:5px;align-items:center;margin-top:5px">
            <button id="cas-summarise">↓ Summarise</button>
            <button id="cas-inject">↓ Inject</button>
          </div>
          <textarea id="cas-paste-json" placeholder="Or paste JSON array here to inject manually…" rows="2"></textarea>
        </div>
        <div id="cas-status">Click ↺ to scan</div>
        <div id="cas-list"></div>
        <div id="cas-data-note" style="display:none">
          <span id="cas-data-summary"></span>
          <button id="cas-full-dump">Full dump to console</button>
        </div>
        </div><!-- end cas-tab-chat -->
        <div id="cas-tab-project" style="display:none">
          <div id="cas-project-list"></div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    injectStyles();
    bindPanelEvents(panel);

    // Auto-scan once panel is in DOM
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('cas-scan')?.click()));
  }

  function bindPanelEvents(panel) {
    let collapsed = false;

    const body = document.getElementById('cas-body');
    const status = document.getElementById('cas-status');
    const list = document.getElementById('cas-list');
    const dataNote = document.getElementById('cas-data-note');
    const dataSummary = document.getElementById('cas-data-summary');

    document.getElementById('cas-toggle').addEventListener('click', () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? 'none' : 'block';
      document.getElementById('cas-toggle').textContent = collapsed ? '▸' : '▾';
    });

    document.getElementById('cas-close').addEventListener('click', () => {
      panel.remove();
    });

    document.getElementById('cas-scan').addEventListener('click', () => {
      status.textContent = 'Scanning…';
      list.innerHTML = '';
      requestAnimationFrame(async () => {
        const items = scanForFileList();
        renderList(items, list, status, dataNote, dataSummary);
        await refreshSummariseBadge();
      });
    });

    document.getElementById('cas-apply').addEventListener('click', () => {
      let items = scanForFileList();
      if (items.length === 0) {
        status.textContent = 'Scan first (↺)';
        return;
      }
      const mode = document.getElementById('cas-sort-mode').value;
      applySort(items, mode);
      status.textContent = `Sorted: ${mode}`;
      // Rescan after sort
      requestAnimationFrame(() => requestAnimationFrame(async () => {
        items = scanForFileList();
        renderList(items, list, status, dataNote, dataSummary);
        await refreshSummariseBadge();
      }));
    });

    document.getElementById('cas-inspect').addEventListener('click', () => {
      const items = scanForFileList();
      console.group('[CAS] Full DOM dump — all artifact candidates');
      items.forEach(({ node, score, data, source }, i) => {
        console.group(`[${i}] Source: ${source} | Score: ${score} | Name: ${data.name}`);
        console.log('Node:', node);
        console.log('Extracted data:', data);
        console.log('All attributes:', data.allAttributes);
        console.log('Data-* attributes:', data.allDataAttributes);
        // Walk up 5 levels and log testid/aria/class for each ancestor
        console.group('Ancestor chain (for selector tuning)');
        let el = node.parentElement;
        let d = 0;
        while (el && d < 6) {
          console.log(`+${d} <${el.tagName.toLowerCase()}>`, {
            testid: el.getAttribute('data-testid'),
            aria: el.getAttribute('aria-label'),
            cls: el.className?.baseVal || el.className,
            id: el.id,
          });
          el = el.parentElement;
          d++;
        }
        console.groupEnd();
        console.groupEnd();
      });
      console.groupEnd();
      status.textContent = `Dumped ${items.length} nodes to console`;
    });

    document.getElementById('cas-full-dump')?.addEventListener('click', () => {
      document.getElementById('cas-inspect').click();
    });

    // ── ⎘ Copy prompt — clipboard only, no send (unchanged) ───────────────
    document.getElementById('cas-sum-copy').addEventListener('click', () => {
      const artifacts = scanForFileList().filter(i => i.source === 'generated');
      if (artifacts.length === 0) { status.textContent = 'Scan first (↺).'; return; }
      const sentences = document.getElementById('cas-sum-length').value;
      const lenLabel = sentences === '1' ? '1 sentence' : sentences === '2' ? '2-3 sentences' : '5 sentences';
      const names = artifacts.map(a => a.data.name).join('\n');
      const prompt = `For each file below write exactly ${lenLabel} describing what it contains.\nReply with a JSON object only — keys are the exact filenames, values are the summaries. No other text.\n\n${names}`;
      navigator.clipboard.writeText(prompt).then(() => {
        status.textContent = `✓ Prompt copied — send in chat, then click ↓ Inject`;
      });
    });

    // ── ↓ Summarise — fills input AND auto-sends (GAP 2) ──────────────────
    document.getElementById('cas-summarise').addEventListener('click', () => {
      const artifacts = currentItems.filter(i => i.source === 'generated');
      if (artifacts.length === 0) { status.textContent = 'Scan first (↺).'; return; }
      const sentences = document.getElementById('cas-sum-length').value;
      const lenLabel = sentences === '1' ? '1 sentence' : sentences === '2' ? '2-3 sentences' : '5 sentences';
      const names = artifacts.map(a => a.data.name).join('\n');
      const prompt = `For each file below write exactly ${lenLabel} describing what it contains.\nReply with a JSON object only — keys are the exact filenames, values are the summaries. No other text.\n\n${names}`;
      const input = document.querySelector('[contenteditable="true"][data-testid="composer-input"], .ProseMirror[contenteditable="true"]')
        || document.querySelector('[contenteditable="true"]');
      if (!input) { status.textContent = 'Chat input not found.'; return; }
      input.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, prompt);
      status.textContent = '↓ Sending prompt — click ↓ Inject after Claude responds.';
      setTimeout(() => {
        const sendBtn = document.querySelector('button[aria-label*="Send"], button[data-testid*="send"]');
        if (sendBtn && !sendBtn.disabled) sendBtn.click();
      }, 100);
    });

    // ── ↓ Inject — reads paste field first, then last DOM response (GAPs 2,5) ──
    document.getElementById('cas-inject').addEventListener('click', async () => {
      const artifacts = currentItems.filter(i => i.source === 'generated');
      if (artifacts.length === 0) { status.textContent = 'Scan first (↺).'; return; }
      const pasteField = document.getElementById('cas-paste-json');
      const pasteText = pasteField ? pasteField.value.trim() : '';
      let jsonText = pasteText;
      if (!jsonText) {
        const responses = document.querySelectorAll('[data-is-streaming="false"] .font-claude-response');
        if (responses.length === 0) { status.textContent = 'No Claude response found. Paste JSON above or wait for response.'; return; }
        jsonText = responses[responses.length - 1].textContent.trim();
      }
      // Match JSON object (name-keyed, new format) or array (positional fallback)
      const match = jsonText.match(/\{[\s\S]*\}/) || jsonText.match(/\[[\s\S]*\]/);
      if (!match) { status.textContent = 'No JSON found — check format.'; return; }
      try {
        const parsed = JSON.parse(match[0]);
        let count = 0;
        if (Array.isArray(parsed)) {
          // Positional fallback (old array format)
          for (let i = 0; i < artifacts.length; i++) {
            if (parsed[i]) { await injectAndStore(artifacts[i].node, artifacts[i].data.name, parsed[i]); count++; }
          }
        } else {
          // Name-keyed (safe regardless of DOM order)
          for (const artifact of artifacts) {
            const summary = parsed[artifact.data.name];
            if (summary) { await injectAndStore(artifact.node, artifact.data.name, summary); count++; }
          }
        }
        status.textContent = `✓ Injected ${count} summaries (persisted)`;
        if (pasteField) pasteField.value = '';
        document.getElementById('cas-new-badge')?.remove();
        currentItems = scanForFileList();
        renderList(currentItems, list, status, dataNote, dataSummary);
      } catch(e) {
        status.textContent = 'Could not parse JSON — check format.';
      }
    });

    // Drag to reposition panel
    let dragging = false, ox = 0, oy = 0;
    const header = document.getElementById('cas-header');
    header.addEventListener('mousedown', e => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;
      dragging = true;
      ox = e.clientX - panel.offsetLeft;
      oy = e.clientY - panel.offsetTop;
    });
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = (e.clientX - ox) + 'px';
      panel.style.top = (e.clientY - oy) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    // ── Tab switching ─────────────────────────────────────────────────────
    document.querySelectorAll('.cas-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cas-tab').forEach(t => t.classList.remove('cas-tab-active'));
        tab.classList.add('cas-tab-active');
        const which = tab.getAttribute('data-tab');
        document.getElementById('cas-tab-chat').style.display = which === 'chat' ? 'block' : 'none';
        document.getElementById('cas-tab-project').style.display = which === 'project' ? 'block' : 'none';
        if (which === 'project') renderProjectView();
      });
    });
  }

  // ── Summary helpers ──────────────────────────────────────────────────────

  function injectSummary(node, text) {
    const existing = node.querySelector('.cas-injected-summary');
    if (existing) existing.remove();
    const typeEl = node.querySelector('[class*="text-text-400"]');
    const target = typeEl || node.querySelector('.leading-tight');
    if (!target) return;
    const el = document.createElement('div');
    el.className = 'cas-injected-summary';
    el.textContent = text;
    el.style.cssText = [
      'font-size:10px','line-height:1.4','color:#8a9ab5',
      'margin-top:4px','padding:4px 6px',
      'background:rgba(255,255,255,0.04)',
      'border-left:2px solid #f0c040',
      'border-radius:0 3px 3px 0',
      'word-break:break-word','white-space:normal','max-width:100%',
    ].join(';');
    target.parentElement.insertBefore(el, target.nextSibling);
  }

  async function injectAndStore(node, name, text) {
    injectSummary(node, text);
    await storeSummary(name, text);
  }

  async function renderProjectView() {
    const el = document.getElementById('cas-project-list');
    if (!el) return;
    el.innerHTML = '';

    // To get all tracked projects, we pull ALL local storage keys
    const allData = await new Promise(r => chrome.storage.local.get(null, r));
    
    // Find all indexKeys: proj_${proj}_chat_index
    const projectIndexKeys = Object.keys(allData).filter(k => k.startsWith('proj_') && k.endsWith('_chat_index'));

    if (projectIndexKeys.length === 0) {
      el.innerHTML = '<div style="color:#555;font-size:10px;padding:8px">No recorded projects found yet.</div>';
      return;
    }

    const currentChat = getChatId();
    let anyRendered = false;

    for (const pKey of projectIndexKeys) {
      const projId = pKey.split('_')[1];
      const index = allData[pKey];
      const chats = Object.entries(index);
      
      if (chats.length === 0) continue;
      anyRendered = true;

      const projName = chats[0][1].projectName || projId.slice(0, 8);
      
      const headerContainer = document.createElement('div');
      headerContainer.style.cssText = 'margin-top: 6px; padding: 4px 6px; background: rgba(207, 207, 107, 0.05); border-radius: 4px; border: 1px solid rgba(207, 207, 107, 0.15);';
      
      const header = document.createElement('div');
      header.style.cssText = 'color:#cfcf6b;font-size:9px;letter-spacing:0.1em;padding:4px 0 6px;font-weight:600';
      header.textContent = `◈ ${projName} — ${chats.length} chat${chats.length !== 1 ? 's' : ''}`;
      headerContainer.appendChild(header);

      chats.sort((a, b) => (b[1].lastSeen || '').localeCompare(a[1].lastSeen || ''));

      chats.forEach(([chatId, meta]) => {
        const wrapper = document.createElement('div');

        const row = document.createElement('div');
        row.style.cssText = [
          'display:flex','align-items:center','gap:5px',
          'padding:4px 6px','border-radius:3px','cursor:pointer',
          'border:1px solid transparent',
          chatId === currentChat ? 'border-color:#2a2e36;background:#13161b' : '',
        ].join(';');

        const dot = chatId === currentChat ? '<span style="color:#f0c040">●</span>' : '<span style="color:#2a2e36">○</span>';
        const hasArtifacts = (meta.artifactCount || 0) > 0;
        const expandIcon = hasArtifacts ? '<span class="cas-expand-icon" style="color:#444;font-size:9px;flex-shrink:0">▶</span>' : '';
        row.innerHTML = `
          ${dot}
          <span style="flex:1;font-size:10px;color:#c8cdd6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${meta.name}">${meta.name}</span>
          <span style="font-size:9px;color:#444;flex-shrink:0">${meta.artifactCount || 0} ⬡</span>
          <span style="font-size:9px;color:#333;flex-shrink:0">${meta.lastSeen || ''}</span>
          <a href="https://claude.ai/chat/${chatId}" target="_blank" rel="noopener" title="Open in new tab" style="color:#444;font-size:11px;flex-shrink:0;text-decoration:none;padding:0 2px;line-height:1" onclick="event.stopPropagation()">↗</a>
          ${expandIcon}
        `;

        // Artifact sub-list (lazy rendered on expand)
        const artifactList = document.createElement('div');
        artifactList.style.cssText = 'display:none;padding:0 6px 4px 18px';
        let expanded = false;

        row.addEventListener('click', async (e) => {
          if (hasArtifacts) {
            expanded = !expanded;
            artifactList.style.display = expanded ? 'block' : 'none';
            const icon = row.querySelector('.cas-expand-icon');
            if (icon) icon.textContent = expanded ? '▼' : '▶';

            if (expanded && artifactList.children.length === 0) {
              const chatSumKey = `proj_${meta.projectId || projId}/chat_${chatId}_cas_summaries`;
              const chatSeenKey = `proj_${meta.projectId || projId}/chat_${chatId}_cas_first_seen`;
              
              const [sums, seen] = await Promise.all([
                new Promise(r => chrome.storage.local.get(chatSumKey, d => r(d[chatSumKey] || {}))),
                new Promise(r => chrome.storage.local.get(chatSeenKey, d => r(d[chatSeenKey] || {}))),
              ]);
              const names = Object.keys(sums).length > 0 ? Object.keys(sums) : Object.keys(seen);
              if (names.length === 0) {
                artifactList.innerHTML = '<div style="color:#444;font-size:9px;padding:3px 0">No artifact data — visit chat to record</div>';
              } else {
                names.forEach(name => {
                  const aRow = document.createElement('div');
                  aRow.style.cssText = 'padding:3px 0;border-top:1px solid #1a1d22';
                  const summary = sums[name] || '';
                  const ts = seen[name] || '';
                  aRow.innerHTML = `
                    <div style="display:flex;gap:4px;align-items:center">
                      <span style="color:#6bcf6b;font-size:9px">⬡</span>
                      <span style="font-size:9px;color:#aaa;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name.slice(0,30)}</span>
                      ${ts ? `<span style="font-size:8px;color:#333">${ts}</span>` : ''}
                    </div>
                    ${summary ? `<div style="font-size:8px;color:#666;padding-top:2px;line-height:1.3">${summary}</div>` : ''}
                  `;
                  artifactList.appendChild(aRow);
                });
              }
            }
          } else {
            history.pushState({}, '', `https://claude.ai/chat/${chatId}`);
            window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
          }
        });

        row.addEventListener('dblclick', () => {
          history.pushState({}, '', `https://claude.ai/chat/${chatId}`);
          window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
        });

        wrapper.appendChild(row);
        wrapper.appendChild(artifactList);
        headerContainer.appendChild(wrapper);
      });
      el.appendChild(headerContainer);
    }
  }

  function renderList(items, list, status, dataNote, dataSummary) {
    list.innerHTML = '';

    if (items.length === 0) {
      status.textContent = 'No file nodes found. Open a chat with files.';
      dataNote.style.display = 'none';
      return;
    }

    const sourceMeta = {
      upload:    { label: 'Uploads',   color: '#6b9bcf', icon: '↑' },
      generated: { label: 'Generated', color: '#6bcf6b', icon: '⬡' },
      project:   { label: 'Project',   color: '#cfcf6b', icon: '◈' },
      unknown:   { label: 'Unknown',   color: '#555',    icon: '?' },
    };

    const groups = { upload: [], generated: [], project: [], unknown: [] };
    items.forEach(item => groups[item.source || 'unknown'].push(item));

    const total = items.length;
    const groupCounts = Object.entries(groups)
      .filter(([, arr]) => arr.length > 0)
      .map(([k, arr]) => `${sourceMeta[k].icon} ${arr.length}`)
      .join(' · ');
    status.textContent = `${total} file${total !== 1 ? 's' : ''} — ${groupCounts}`;

    dataSummary.textContent = 'First-seen timestamps stored locally. ';
    dataNote.style.display = 'block';

    // Load first-seen timestamps for display
    storageGet('cas_first_seen').then(seen => {
      storageGet('cas_summaries').then(summaries => {
      for (const [source, groupItems] of Object.entries(groups)) {
        if (groupItems.length === 0) continue;
        const meta = sourceMeta[source];

        const header = document.createElement('div');
        header.className = 'cas-group-header';
        header.innerHTML = `<span style="color:${meta.color}">${meta.icon} ${meta.label}</span><span class="cas-group-count">${groupItems.length}</span>`;
        list.appendChild(header);

        groupItems.forEach((item, i) => {
          const { data } = item;
          const row = document.createElement('div');
          row.className = 'cas-row';
          row.style.flexDirection = 'column';
          row.style.alignItems = 'flex-start';
          const badge = data.type
            ? `<span class="cas-badge cas-type-${data.type.toLowerCase()}">${data.type}</span>`
            : '<span class="cas-badge cas-type-unknown">?</span>';
          const ts = seen[data.name] || '';
          const summary = summaries[data.name] || '';
          row.innerHTML = `
            <div style="display:flex;align-items:center;gap:5px;width:100%">
              <span class="cas-index">${i + 1}</span>
              ${badge}
              <span class="cas-name" title="${data.name || ''}">${(data.name || 'unknown').slice(0, 28)}</span>
              ${ts ? `<span class="cas-meta">${ts}</span>` : ''}
            </div>
            ${summary ? `<div style="font-size:9px;color:#666;padding:2px 0 0 20px;line-height:1.3">${summary}</div>` : ''}
          `;
          row.addEventListener('click', () => highlightNode(item.node));
          list.appendChild(row);
        });
      }
      });
    });
  }

  function highlightNode(node) {
    // Scroll node into view and flash it
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = node.style.outline;
    const prevBg = node.style.backgroundColor;
    node.style.outline = '2px solid #f0c040';
    node.style.backgroundColor = 'rgba(240,192,64,0.18)';
    setTimeout(() => {
      node.style.outline = prev;
      node.style.backgroundColor = prevBg;
    }, 1800);
  }

  // ─── Styles ───────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('cas-styles')) return;
    const s = document.createElement('style');
    s.id = 'cas-styles';
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');

      #cas-panel {
        position: fixed;
        top: 80px;
        right: 16px;
        width: 360px;
        z-index: 999999;
        background: #0d0f12;
        border: 1px solid #2a2e36;
        border-radius: 6px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04);
        font-family: 'IBM Plex Mono', 'Courier New', monospace;
        font-size: 11px;
        color: #c8cdd6;
        user-select: none;
      }

      #cas-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: #13161b;
        border-bottom: 1px solid #2a2e36;
        border-radius: 6px 6px 0 0;
        cursor: grab;
      }

      #cas-header:active { cursor: grabbing; }

      #cas-title {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.12em;
        color: #f0c040;
        text-transform: uppercase;
      }

      #cas-controls {
        display: flex;
        gap: 4px;
      }

      #cas-controls button {
        background: none;
        border: 1px solid #2a2e36;
        color: #888;
        padding: 2px 6px;
        border-radius: 3px;
        cursor: pointer;
        font-family: inherit;
        font-size: 11px;
        line-height: 1.4;
        transition: color 0.15s, border-color 0.15s;
      }

      #cas-controls button:hover {
        color: #f0c040;
        border-color: #f0c040;
      }

      #cas-body {
        padding: 10px;
      }

      #cas-sort-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
      }

      #cas-sort-row label {
        color: #666;
        font-size: 10px;
        white-space: nowrap;
        letter-spacing: 0.06em;
      }

      #cas-sort-mode {
        flex: 1;
        background: #13161b;
        border: 1px solid #2a2e36;
        color: #c8cdd6;
        padding: 4px 6px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        outline: none;
        cursor: pointer;
      }

      #cas-sort-mode:focus { border-color: #f0c040; }

      #cas-apply {
        background: #f0c040;
        border: none;
        color: #0d0f12;
        padding: 4px 10px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        letter-spacing: 0.06em;
        transition: opacity 0.15s;
      }

      #cas-apply:hover { opacity: 0.85; }

      #cas-status {
        font-size: 10px;
        color: #555;
        margin-bottom: 8px;
        padding: 4px 6px;
        background: #0a0c0f;
        border-radius: 3px;
        border-left: 2px solid #2a2e36;
        letter-spacing: 0.04em;
      }

      #cas-list {
        max-height: 280px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      #cas-list::-webkit-scrollbar { width: 4px; }
      #cas-list::-webkit-scrollbar-track { background: #0d0f12; }
      #cas-list::-webkit-scrollbar-thumb { background: #2a2e36; border-radius: 2px; }

      .cas-row {
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 5px 6px;
        border-radius: 3px;
        cursor: pointer;
        transition: background 0.1s;
        border: 1px solid transparent;
      }

      .cas-row:hover {
        background: #13161b;
        border-color: #2a2e36;
      }

      .cas-index {
        font-size: 9px;
        color: #444;
        width: 14px;
        text-align: right;
        flex-shrink: 0;
      }

      .cas-badge {
        font-size: 9px;
        font-weight: 600;
        padding: 1px 4px;
        border-radius: 2px;
        letter-spacing: 0.06em;
        flex-shrink: 0;
        min-width: 28px;
        text-align: center;
      }

      .cas-type-md, .cas-type-txt  { background: #1a2a1a; color: #6bcf6b; }
      .cas-type-pdf                 { background: #2a1a1a; color: #cf6b6b; }
      .cas-type-docx                { background: #1a1a2a; color: #6b9bcf; }
      .cas-type-xlsx, .cas-type-csv { background: #1a2a1a; color: #6bcfb0; }
      .cas-type-pptx                { background: #2a1e1a; color: #cf9b6b; }
      .cas-type-json, .cas-type-js,
      .cas-type-ts, .cas-type-py    { background: #2a2a1a; color: #cfcf6b; }
      .cas-type-unknown             { background: #1a1a1a; color: #555; }

      .cas-name {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 10.5px;
        color: #c8cdd6;
        letter-spacing: 0.02em;
      }

      .cas-meta {
        font-size: 9px;
        color: #4a5060;
        white-space: nowrap;
        flex-shrink: 0;
      }

      .cas-score {
        font-size: 8px;
        color: #2a3040;
        flex-shrink: 0;
        width: 16px;
        text-align: right;
      }

      #cas-data-note {
        margin-top: 8px;
        padding: 6px 8px;
        background: #0a0c0f;
        border-radius: 3px;
        border-left: 2px solid #2a2e36;
        font-size: 9.5px;
        color: #555;
        line-height: 1.5;
      }

      #cas-full-dump {
        background: none;
        border: 1px solid #2a2e36;
        color: #555;
        padding: 2px 7px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 9px;
        cursor: pointer;
        margin-top: 4px;
        display: block;
        transition: color 0.15s, border-color 0.15s;
        letter-spacing: 0.06em;
      }

      .cas-group-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 4px 6px 2px;
        margin-top: 6px;
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        border-bottom: 1px solid #1e2228;
      }

      .cas-group-header:first-child { margin-top: 0; }

      .cas-group-count {
        color: #333;
        font-size: 9px;
      }

      #cas-tabs {
        display: flex;
        gap: 2px;
        margin-bottom: 8px;
        border-bottom: 1px solid #1e2228;
        padding-bottom: 6px;
      }

      .cas-tab {
        background: none;
        border: 1px solid #2a2e36;
        color: #555;
        padding: 3px 10px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
        letter-spacing: 0.05em;
      }
      .cas-tab:hover { color: #c8cdd6; border-color: #c8cdd6; }
      .cas-tab-active { color: #f0c040 !important; border-color: #f0c040 !important; }

      #cas-project-list {
        max-height: 280px;
        overflow-y: auto;
        padding: 2px 0;
      }
      #cas-project-list::-webkit-scrollbar { width: 4px; }
      #cas-project-list::-webkit-scrollbar-track { background: #0d0f12; }
      #cas-project-list::-webkit-scrollbar-thumb { background: #2a2e36; border-radius: 2px; }



      #cas-sum-length {
        flex: 1;
        background: #13161b;
        border: 1px solid #2a2e36;
        color: #c8cdd6;
        padding: 4px 5px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        outline: none;
        min-width: 0;
      }
      #cas-sum-length:focus { border-color: #f0c040; }

      #cas-sum-copy {
        background: none;
        border: 1px solid #2a2e36;
        color: #888;
        padding: 4px 8px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.15s, border-color 0.15s;
      }
      #cas-sum-copy:hover { color: #f0c040; border-color: #f0c040; }

      #cas-summarise {
        background: #f0c040;
        border: none;
        color: #0d0f12;
        padding: 4px 8px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: opacity 0.15s;
      }
      #cas-summarise:hover { opacity: 0.85; }

      #cas-inject {
        flex: 1;
        background: none;
        border: 1px solid #2a2e36;
        color: #888;
        padding: 4px 8px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.15s, border-color 0.15s;
      }
      #cas-inject:hover { color: #f0c040; border-color: #f0c040; }

      #cas-paste-json {
        width: 100%;
        box-sizing: border-box;
        background: #0a0c0f;
        border: 1px solid #2a2e36;
        color: #888;
        padding: 5px 7px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 9px;
        resize: vertical;
        outline: none;
        margin-top: 5px;
        line-height: 1.4;
      }
      #cas-paste-json:focus { border-color: #f0c040; color: #c8cdd6; }
      #cas-paste-json::placeholder { color: #333; }

      #cas-summary-row {
        display: flex;
        flex-direction: column;
        gap: 0;
        margin-bottom: 8px;
        padding: 7px 8px;
        background: #0a0c0f;
        border-radius: 3px;
        border: 1px solid #1e2228;
      }

    `;
    document.head.appendChild(s);
  }

  // ─── Render panel from storage (no live DOM scan needed) ───────────────────
  // Used on chat switch so panel populates instantly even if Claude sidebar is closed

  async function renderListFromStorage() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return;
    const list = document.getElementById('cas-list');
    const status = document.getElementById('cas-status');
    if (!list || !status) return;

    const [summaries, seen] = await Promise.all([
      storageGet('cas_summaries'),
      storageGet('cas_first_seen'),
    ]);
    const names = Object.keys(seen);

    if (names.length === 0) {
      status.textContent = 'No stored artifacts for this chat.';
      list.innerHTML = '';
      return;
    }

    status.textContent = `\u2B21 ${names.length} stored artifact${names.length !== 1 ? 's' : ''} — rescanning\u2026`;
    list.innerHTML = '';
    names.forEach((name, i) => {
      const row = document.createElement('div');
      row.className = 'cas-row';
      row.style.flexDirection = 'column';
      row.style.alignItems = 'flex-start';
      const ts = seen[name] || '';
      const summary = summaries[name] || '';
      row.innerHTML = `
        <div style="display:flex;align-items:center;gap:5px;width:100%">
          <span class="cas-index">${i + 1}</span>
          <span class="cas-badge cas-type-unknown">\u2B21</span>
          <span class="cas-name" title="${name}">${name.slice(0, 28)}</span>
          ${ts ? `<span class="cas-meta">${ts}</span>` : ''}
        </div>
        ${summary ? `<div style="font-size:9px;color:#666;padding:2px 0 0 20px;line-height:1.3">${summary}</div>` : ''}
      `;
      list.appendChild(row);
    });
  }

  // ─── Message Bridge (from popup) ──────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.action === 'open_panel') {
      buildPanel();
      sendResponse({ ok: true });
    }
    if (msg.action === 'scan') {
      const items = scanForFileList();
      sendResponse({
        count: items.length,
        items: items.map(({ score, data }) => ({ score, data })),
      });
    }
    return true;
  });

  // ─── Auto-init ────────────────────────────────────────────────────────────

  // Watch for new artifact cards appearing in the sidebar
  function watchForNewArtifacts() {
    if (artifactObserverRef) return; // Prevent duplicate instantiation if already watching this chat!
    
    let knownNames = new Set();
    let lastArtifactNodes = new Set(); // Tracks structurally existing artifact nodes to prevent useless re-renders
    let debounceTimer = null;
    let reinjecting = false; // guard: prevents re-triggering from our own DOM writes

    // We MUST attach the observer to document.body!
    // If we attach it to the Sidebar container, when the user closes the sidebar, 
    // Claude destroys the container node. The observer gets disconnected forever,
    // and never fires again when the sidebar is reopened. Document.body is permanent.
    const container = document.body;

    const obs = new MutationObserver((mutations) => {
      // Ignore mutations if they are exclusively our own UI elements (e.g. summary badges)
      const isOnlyUs = mutations.every(m => {
        if (m.target?.id === 'cas-sidebar-bar' || m.target?.id === PANEL_ID) return true;
        if (m.target?.classList?.contains('cas-summary-badge')) return true;
        let onlyOurNodes = true;
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1 && !(n.id === 'cas-sidebar-bar' || n.id === PANEL_ID || n.classList?.contains('cas-summary-badge'))) onlyOurNodes = false;
        });
        m.removedNodes.forEach(n => {
          if (n.nodeType === 1 && !(n.id === 'cas-sidebar-bar' || n.id === PANEL_ID || n.classList?.contains('cas-summary-badge'))) onlyOurNodes = false;
        });
        return (m.addedNodes.length > 0 || m.removedNodes.length > 0) ? onlyOurNodes : false;
      });

      if (isOnlyUs || reinjecting) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const generated = scanGenerated();
        const firstSeen = await storageGet('cas_first_seen');
        let changed = false;

        generated.forEach(item => {
          const name = item.data.name;
          if (!name || knownNames.has(name)) return;
          knownNames.add(name);

          if (!firstSeen[name]) {
            const now = new Date();
            firstSeen[name] = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')} ${now.getDate().toString().padStart(2,'0')}.${(now.getMonth()+1).toString().padStart(2,'0')}`;
            changed = true;
          }
        });

        if (changed) await storageSet('cas_first_seen', firstSeen);

        // Check if the physical artifact nodes have actually changed or appeared
        let layoutChanged = generated.length !== lastArtifactNodes.size;
        if (!layoutChanged) {
          for (let g of generated) {
             if (!lastArtifactNodes.has(g.node)) {
                 layoutChanged = true; break;
             }
          }
        }

        // If nothing mathematically changed with the artifacts, and our bar is safely injected, 
        // silently abort. No flickering, no CPU burn.
        if (!layoutChanged && document.getElementById('cas-sidebar-bar')) {
            obs.takeRecords();
            return; 
        }
        
        lastArtifactNodes = new Set(generated.map(g => g.node));

        reinjecting = true;
        const items = scanForFileList(); // Injects into Claude DOM synchronously
        
        // Auto-refresh the floating UI panel
        if (document.getElementById(PANEL_ID)) {
          const list = document.getElementById('cas-list');
          const status = document.getElementById('cas-status');
          const dataNote = document.getElementById('cas-data-note');
          const dataSummary = document.getElementById('cas-data-summary');
          if (list && items.length > 0) {
            let finalItems = items;
            if (activeSortMode !== 'dom-order') finalItems = scanForFileList(); 
            renderList(finalItems, list, status, dataNote, dataSummary);
          }
        }
        
        // Clear all mutations caused by our synchronous reordering/injecting
        obs.takeRecords();
        reinjecting = false;

        // Fire the asynchronous badge fetches (their DOM mutations are filtered out by isOnlyUs above safely!)
        refreshSummariseBadge();

      }, 500);
    });

    obs.observe(container, { childList: true, subtree: true });

    // Robust Polling Sync (Guarantees the Sort Bar injects if sidebar is visible)
    // Sometimes React hydrates the DOM *after* the initial mutation event, causing the observer to miss it.
    const pollInterval = setInterval(() => {
      // 1. Inject Floating Panel Toggle Button next to native Claude controls
      const nativeToggle = document.querySelector('[data-testid="wiggle-controls-actions-toggle"]');
      if (nativeToggle && !document.getElementById('cas-panel-toggle')) {
         const parent = nativeToggle.parentElement?.parentElement;
         if (parent && parent.tagName !== 'BODY') {
            const btn = document.createElement('div');
            btn.id = 'cas-panel-toggle';
            btn.className = 'w-fit';
            btn.innerHTML = `<button class="inline-flex items-center justify-center relative isolate shrink-0 can-focus select-none transition duration-300 ease-[cubic-bezier(0.165,0.85,0.45,1)] h-8 w-8 rounded-md !bg-bg-400" type="button" aria-label="Open Sorter Panel" title="Open Sorter Panel" style="color:#888; border:1px solid #444; margin-right:4px;">⬡</button>`;
            
            btn.querySelector('button').addEventListener('click', () => {
                buildPanel();
                setTimeout(() => document.getElementById('cas-scan')?.click(), 50);
            });
            parent.insertBefore(btn, nativeToggle.parentElement);
         }
      }

      if (reinjecting) return;
      const hasSidebar = Array.from(document.querySelectorAll('h3')).some(h => h.textContent.trim() === 'Artifacts');
      
      // If the sidebar is visibly in the DOM, but our sort bar is entirely missing:
      if (hasSidebar && !document.getElementById('cas-sidebar-bar')) {
        reinjecting = true;
        scanForFileList(); // Forcibly re-inject it!
        // We use takeRecords and sync injection here because we don't have event context
        obs.takeRecords();
        reinjecting = false;
      }
    }, 1000);

    // Bundle disconnection methods together so SPA nav clears everything properly
    artifactObserverRef = {
      disconnect: () => {
        obs.disconnect();
        clearInterval(pollInterval);
      }
    };
  }

  async function refreshSummariseBadge() {
    const stored = await storageGet('cas_summaries');
    const generated = scanGenerated();
    
    // Only artifacts that are generated, have a name, and don't have a stored summary yet
    const unsummarised = generated.filter(i => 
      i.source === 'generated' && i.data.name && !stored[i.data.name]
    );

    const bar = document.getElementById('cas-sidebar-bar');
    if (!bar) return;
    
    let badge = document.getElementById('cas-new-badge');
    
    // If no new items, remove the badge
    if (unsummarised.length === 0) {
      if (badge) badge.remove();
      return;
    }

    if (!badge) {
      badge = document.createElement('button');
      badge.id = 'cas-new-badge';
      badge.style.cssText = [
        'background:#f0c040','border:none','color:#0d0f12',
        'padding:2px 7px','border-radius:3px','font-family:monospace',
        'font-size:9px','font-weight:600','cursor:pointer','margin-left:auto',
      ].join(';');
      bar.appendChild(badge);
    }
    badge.textContent = `${unsummarised.length} new — summarise?`;
    badge.onclick = () => sendSummaryPromptToChat(unsummarised, badge);
  }

  // GAP 3: fills input WITHOUT auto-sending — user reviews before hitting send
  // GAP 4: badge transitions to "↓ Inject" state instead of disappearing
  // GAP 6: respects length selector if panel is open
  function sendSummaryPromptToChat(items, badge) {
    const sentences = document.getElementById('cas-sum-length')?.value || '1';
    const lenLabel = sentences === '1' ? '1 sentence' : sentences === '2' ? '2-3 sentences' : '5 sentences';
    const names = items.map(a => a.data.name).join('\n');
    const prompt = `For each file below write exactly ${lenLabel} describing what it contains.\nReply with a JSON object only — keys are the exact filenames, values are the summaries. No other text.\n\n${names}`;

    // Find ProseMirror input
    const input = document.querySelector('[contenteditable="true"][data-testid="composer-input"], .ProseMirror[contenteditable="true"]')
      || document.querySelector('[contenteditable="true"]');
    if (!input) return;

    // Fill input — do NOT auto-send (GAP 3)
    input.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, prompt);

    // GAP 4: transition badge to "↓ Inject" and wire it to inject flow
    if (badge) {
      badge.textContent = '↓ Inject';
      badge.onclick = async () => {
        const artifacts = scanGenerated().filter(i => i.data.name);
        const responses = document.querySelectorAll('[data-is-streaming="false"] .font-claude-response');
        if (responses.length === 0) { return; }
        const text = responses[responses.length - 1].textContent.trim();
        const match = text.match(/\{[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
        if (!match) return;
        try {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) {
            for (let i = 0; i < artifacts.length; i++) {
              if (parsed[i]) await injectAndStore(artifacts[i].node, artifacts[i].data.name, parsed[i]);
            }
          } else {
            for (const artifact of artifacts) {
              const summary = parsed[artifact.data.name];
              if (summary) await injectAndStore(artifact.node, artifact.data.name, summary);
            }
          }
          badge.remove();
        } catch(e) { /* silent */ }
      };
    }
  }

  if (window.location.hostname === 'claude.ai') {

    // ── GAP 1: SPA chat-switch handler ─────────────────────────────────────
    // currentChatId is initialized to null globally.

    function onChatChange() {
      const newId = getChatId();
      if (newId === currentChatId) return;
      currentChatId = newId;
      
      // We intentionally do NOT reset activeSortMode here. 
      // If the user picked A->Z, we want the next chat they click to ALSO be A->Z automatically.

      // Disconnect old artifact observer
      if (artifactObserverRef) { artifactObserverRef.disconnect(); artifactObserverRef = null; }

      // Clear sidebar bar immediately — it belongs to the old chat
      document.getElementById('cas-sidebar-bar')?.remove();

      // Show switching status in panel if open
      const panelStatus = document.getElementById('cas-status');
      if (panelStatus) panelStatus.textContent = 'Chat changed — scanning…';

      // Shared: show stored data immediately, then live-scan once cards are in DOM
      // Check storage for the new chat ID
      async function initNewChat() {
        const [summaries, seen] = await Promise.all([
          storageGet('cas_summaries'),
          storageGet('cas_first_seen'),
        ]);
        const knownNames = Object.keys(seen);

        if (knownNames.length > 0) {
          // ── Known chat: render stored data into the floating panel immediately ──
          renderListFromStorage();
        } else {
          // ── Unknown chat: floating panel shows loading screen ──
          const panel = document.getElementById(PANEL_ID);
          if (panel) {
            const list = document.getElementById('cas-list');
            const status = document.getElementById('cas-status');
            if (list) list.innerHTML = '<div style="text-align:center;padding:24px 0;color:#444;font-size:18px;letter-spacing:2px">⬡</div>';
            if (status) status.textContent = 'Loading new chat…';
          }
        }

        // 1. Instant pass. Captures cached DOM elements immediately on back/forward nav
        // If DOM isn't hydrated yet (like a fresh route push), this safely does nothing.
        const items = scanForFileList(); // Injects bar & summaries if nodes exist
        if (document.getElementById(PANEL_ID) && items.length > 0) {
          const list = document.getElementById('cas-list');
          const status = document.getElementById('cas-status');
          const dataNote = document.getElementById('cas-data-note');
          const dataSummary = document.getElementById('cas-data-summary');
          if (list) {
            let finalItems = items;
            if (activeSortMode !== 'dom-order') finalItems = scanForFileList(); // Read again so Float UI gets sorted list
            renderList(finalItems, list, status, dataNote, dataSummary);
          }
        }
        await refreshSummariseBadge();

        // 2. Reactivity Observer. 
        // Handles React hydrating the chat content milliseconds/seconds into the future.
        watchForNewArtifacts();
      }



      initNewChat();
    }

    // Patch history methods to detect SPA navigation
    ['pushState', 'replaceState'].forEach(fn => {
      const orig = history[fn].bind(history);
      history[fn] = function (...args) { orig(...args); onChatChange(); };
    });
    window.addEventListener('popstate', onChatChange);

    // Fallback: observe document.title — Claude updates it on every chat switch
    // regardless of routing mechanism (Navigation API, React Router, pushState, etc.)
    // onChatChange guards against false-fires via the currentChatId equality check
    const titleEl = document.querySelector('title');
    if (titleEl) {
      new MutationObserver(onChatChange).observe(titleEl, { subtree: true, characterData: true, childList: true });
    } else {
      new MutationObserver((_, obs) => {
        const t = document.querySelector('title');
        if (!t) return;
        obs.disconnect();
        new MutationObserver(onChatChange).observe(t, { subtree: true, characterData: true, childList: true });
      }).observe(document.head || document.documentElement, { childList: true, subtree: true });
    }

    // ── Start the engine on first load ──────────────────────────────────────
    onChatChange();
  }

})();
