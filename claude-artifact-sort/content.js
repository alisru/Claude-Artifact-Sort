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

  // ─── Source Classification — Artifact Identification ──────────────────────
  //
  // Confirmed from DOM inspection:
  //   UPLOADS:    data-testid="file-thumbnail"  (thumbnail cards in message flow)
  //   GENERATED:  role="button" + aria-label ending ". Open artifact."
  //               name lives in .leading-tight div inside artifact-block-cell
  //   PROJECT:    unknown — sidebar was collapsed in available DOM dump

  function findArtifactSidebar() {
    let container = null;
    const allHeaders = document.querySelectorAll('h3');
    for (const h of allHeaders) {
      if (h.textContent.trim().startsWith('Artifact')) {
        // ◈ CHAT SPACE PROTECTION:
        // If this header is inside a message block, it's NOT the sidebar.
        const isSecretlyAMessage = h.closest('[data-testid*="message"]') || h.closest('[class*="message"]');
        if (isSecretlyAMessage) continue;

        // Found a potential sidebar header! Locate its list container.
        container = h.closest('[class*="overflow"]') || h.parentElement?.parentElement;
        if (container) break;
      }
    }
    return container;
  }

  function scanGenerated() {
    // ◈ HYBRID RECOGNITION: Scan sidebar (modifiable) and chat flow (read-only).
    // NOTE: Claude no longer uses role="button" on artifact cards — they are plain
    // <button type="button"> elements. We match on aria-label only.
    const sidebarContainer = findArtifactSidebar();
    const allNodes = Array.from(document.querySelectorAll(
      'button[aria-label$=". Open artifact."], [role="button"][aria-label$=". Open artifact."]'
    ));

    return allNodes.map(node => {
      const isInSidebar = sidebarContainer && sidebarContainer.contains(node);
      return {
        node,
        source: 'generated',
        data: extractNodeData(node),
        isSidebar: isInSidebar
      };
    }).filter(i => i.data.name);
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
      lastSeen: new Date().getHours().toString().padStart(2, '0') + ':' +
        new Date().getMinutes().toString().padStart(2, '0') + ' ' +
        new Date().getDate().toString().padStart(2, '0') + '.' +
        (new Date().getMonth() + 1).toString().padStart(2, '0'),
    };
    await new Promise(r => chrome.storage.local.set({ [indexKey]: data }, r));
  }

  async function recordFirstSeen(items) {
    const seen = await storageGet('cas_first_seen');
    let changed = false;
    items.forEach(item => {
      if (item.data.name && !seen[item.data.name]) {
        const now = new Date();
        seen[item.data.name] = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}`;
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
      // ◈ PROTECTION: Only inject summaries into sidebar nodes
      if (s && item.isSidebar) injectSummary(item.node, s);
    });
  }

  function injectSidebarSortBar(items) {
    if (!items || items.length === 0) return;

    // We must find the TRUE side-panel container, avoiding inline chat message containers.
    // 1. Priority check: Claude's side panel has an 'Artifacts' header above the list.
    // ◈ CHAT SPACE PROTECTION
    // We strictly identify the Sidebar using our findArtifactSidebar() helper.
    let listContainer = null;
    const section = findArtifactSidebar();

    if (section) {
      // Find the flex/gap wrapper inside the section
      listContainer = section.querySelector('[class*="flex-col"][class*="gap-2"]') || section.querySelector('[role="button"]')?.parentElement;
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
      'display:flex', 'gap:4px', 'align-items:center',
      'padding:4px 4px 6px',
      'font-family:monospace', 'font-size:10px',
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

    try {
      listContainer.insertBefore(bar, listContainer.firstChild);
    } catch (e) { /* sidebar was likely closed during sync */ }
  }

  function sidebarBtnStyle(active) {
    return [
      'background:none', 'border:1px solid #2a2e36',
      'color:#888', 'padding:2px 7px', 'border-radius:3px',
      'font-family:monospace', 'font-size:9px', 'cursor:pointer',
      'transition:color 0.15s,border-color 0.15s',
    ].join(';');
  }

  async function storeSummary(name, text, { force = false } = {}) {
    // Guard: never overwrite an existing summary with blank/null unless explicitly forced.
    // This prevents selector breaks or empty parses from clobbering stored data.
    if (!text || text.trim() === '') {
      if (!force) {
        console.warn('[CAS] Blocked attempt to overwrite summary for "' + name + '" with empty text.');
        return;
      }
    }
    const summaries = await storageGet('cas_summaries');
    // Second guard: if we already have a value and the new one is blank, bail (even with force=false)
    if (summaries[name] && (!text || text.trim() === '') && !force) return;
    summaries[name] = text;
    await storageSet('cas_summaries', summaries);
  }

  function scanForFileList() {
    const generated = scanGenerated();

    // ◈ HYBRID DEDUPLICATION:
    // If an artifact exists in both sidebar and chat flow, we prefer the SIDEBAR node
    // as the "master" because it's the one we can safely modify/reorder.
    const sidebarNodesByName = new Map();
    const chatNodesByName = new Map();

    generated.forEach(i => {
      const name = i.data.name;
      if (i.isSidebar) sidebarNodesByName.set(name, i);
      else chatNodesByName.set(name, i);
    });

    const seenNames = new Set();
    const all = [];

    // Prioritize sidebar entries
    for (const [name, item] of sidebarNodesByName.entries()) {
      all.push(item);
      seenNames.add(name);
    }
    // Add chat-only entries (e.g. freshly generated, sidebar closed)
    for (const [name, item] of chatNodesByName.entries()) {
      if (!seenNames.has(name)) {
        all.push(item);
        seenNames.add(name);
      }
    }

    // Assign original index only to sidebar nodes
    all.forEach((item, idx) => {
      const p = item.node.parentElement;
      if (p && !p.hasAttribute('data-cas-orig-index') && item.isSidebar) {
        p.setAttribute('data-cas-orig-index', idx);
        item.origIndex = idx;
      }
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
      origIndex: parseInt(node.parentElement?.getAttribute('data-cas-orig-index') || '999999'),
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
    if (data.ariaLabel && (/\.\w{2,5}$/.test(data.ariaLabel.trim()) || data.ariaLabel.toLowerCase().includes('artifact'))) {
      data.name = data.ariaLabel.trim().replace(/\. Open artifact\.$/i, '').replace(/\. View artifact\.$/i, '');
    } else if (data.testId && (/\.\w{2,5}$/.test(data.testId.trim()) || data.testId.toLowerCase().includes('artifact'))) {
      data.name = data.testId.trim().replace(/\. Open artifact\.$/i, '').replace(/\. View artifact\.$/i, '');
    } else {
      // Walk child text nodes for something that looks like a filename
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) {
        const t = textNode.textContent.trim();
        if (t.length > 0 && t.length < 120 && (/\.\w{2,5}$/.test(t) || t.toLowerCase().includes('artifact'))) {
          data.name = t;
          break;
        }
      }
      // Fallback: grab name from the .leading-tight div inside the artifact card,
      // which Claude uses for the artifact title (may not have a file extension)
      if (!data.name) {
        const titleEl = node.closest('[class*="artifact-block"]')?.querySelector('[class*="leading-tight"]')
          || node.parentElement?.querySelector('[class*="leading-tight"]');
        if (titleEl) data.name = titleEl.textContent.trim() || null;
      }
      // Last resort: raw text content
      if (!data.name && data.rawText.length > 0 && data.rawText.length < 80) {
        data.name = data.rawText;
      }
    }

    // SLUG for robust matching (e.g. Marx ideology problem -> marx_ideology_problem)
    data.slug = toSlug(data.name);

    // Try to extract file type from name or explicit attribute
    if (data.name) {
      const ext = data.name.match(/\.(\w{2,5})$/);
      if (ext) data.type = ext[1].toUpperCase();
    }
    data.type = data.type
      || node.getAttribute('data-type')
      || node.getAttribute('data-mime')
      // Exclude HTML button types (e.g. type="button") — not file types
      || (node.getAttribute('type') !== 'button' ? node.getAttribute('type') : null)
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

  function toSlug(s) {
    if (!s) return '';
    return s.toLowerCase()
      .trim()
      .replace(/\.open artifact\.$/i, '')
      .replace(/\.view artifact\.$/i, '')
      .replace(/\.\w{2,5}$/, '') // remove extension
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
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
        sorted.sort((a, b) => (a.origIndex || 0) - (b.origIndex || 0));
        break;
      default:
        break;
    }
    return sorted;
  }

  function applySort(items, mode) {
    if (items.length < 2) return;

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

  // ─── UI Variables ────────────────────────────────────────────────────────
  let activeFlyoutChatId = null; // null means 'current chat'
  let activeFlyoutSumKey = null;

  // ─── Flyout UI ────────────────────────────────────────────────────────────
  window.casOpenFlyoutForChat = function (chatId, chatName, sumKey) {
    activeFlyoutChatId = chatId;
    activeFlyoutSumKey = sumKey;
    let flyout = document.getElementById('cas-flyout-panel');
    if (!flyout) {
      buildFlyout();
      flyout = document.getElementById('cas-flyout-panel');
    }
    // Update Header
    const title = document.getElementById('cas-flyout-title');
    if (title) title.textContent = `[${chatName.slice(0, 15)}...]`;

    flyout.style.display = 'flex';
    const sumToggle = document.getElementById('cas-panel-toggle-summary');
    if (sumToggle) sumToggle.style.color = '#f0c040';
    refreshFlyoutChatSelector();
    renderChatSummaries();
  };

  const applyZoom = (type, val) => {
    const el = (type === 'sorter') ? document.getElementById(PANEL_ID) : document.getElementById('cas-flyout-panel');
    const inp = (type === 'sorter') ? document.getElementById('cas-inp-zoom-sorter') : document.getElementById('cas-inp-zoom-flyout');
    if (el) el.style.zoom = val;
    if (inp) inp.value = Math.round(val * 100) + '%';
  };

  function buildFlyout() {
    if (document.getElementById('cas-flyout-panel')) return;
    injectStyles();

    // ─── First Load Pathway (Restores zoom & triggers initial scan) ───
    chrome.storage.local.get('cas_global_settings', (res) => {
      const s = res.cas_global_settings || { zoom_sorter: 1, zoom_flyout: 1 };
      applyZoom('sorter', s.zoom_sorter || 1);
      applyZoom('flyout', s.zoom_flyout || 1);
    });
    // Trigger scan and first seen population
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        renderChatSummaries();
        refreshSummariseBadge();
      });
    });
    // ─────────────────────────────────────────────────────────────────

    const flyout = document.createElement('div');
    flyout.id = 'cas-flyout-panel';
    flyout.style.display = 'none';
    flyout.innerHTML = `
      <div id="cas-flyout-header" style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:#13161b;border-bottom:1px solid #2a2e36;border-radius:6px 6px 0 0;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="font-size:10px;font-weight:600;letter-spacing:0.12em;color:hsl(var(--cas-gold));text-transform:uppercase;">⌬ SUMMARY <span id="cas-flyout-title" style="color:#888;font-weight:400;margin-left:4px;"></span></span>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <button id="cas-flyout-toggle-options" title="Summary Controls & Navigation" 
            style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.05);color:#888;cursor:pointer;font-size:10px;padding:4px 8px;border-radius:4px;transition:0.2s;">
            Admin & Nav ⎔
          </button>
          <button id="cas-flyout-close" style="background:none;border:none;color:#888;cursor:pointer;font-family:monospace;font-size:14px;padding:2px 6px;">✕</button>
        </div>
      </div>
      <div class="cas-flyout-body">
        <!-- ── Options Panel (Collapsible) ── -->
        <div id="cas-flyout-options">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(255,255,255,0.05);">
            <span style="font-size:9px;color:hsl(var(--cas-gold));letter-spacing:0.1em;font-weight:600;">CONTROLS</span>
            <span id="cas-flyout-sum-status" style="font-size:9px;color:#888;display:none;"></span>
          </div>

          <div style="display:flex; flex-direction:column; gap:12px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; gap:10px;">
                <div style="display:flex;flex-direction:column;gap:3px;">
                  <label style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Topics</label>
                  <select id="cas-flyout-topic-lines" class="cas-mini-select" style="min-width:50px;"><option value="1">1</option><option value="2" selected>2</option><option value="5">5</option></select>
                </div>
                <div style="display:flex;flex-direction:column;gap:3px;">
                  <label style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Aspects</label>
                  <select id="cas-flyout-aspect-lines" class="cas-mini-select" style="min-width:50px;"><option value="1" selected>1</option><option value="2">2</option><option value="5">5</option></select>
                </div>
              </div>
              <button id="cas-flyout-sum-copy" class="cas-premium-btn" style="height:26px; padding:0 10px; font-size:9px;">⎘ COPY PROMPT</button>
            </div>
          </div>

          <div id="cas-flyout-action-row" style="display:flex;gap:8px;align-items:center;margin-bottom:16px;">
            <button id="cas-flyout-summarise" style="flex:1;background:hsl(var(--cas-gold));border:none;color:#0d0f12;border-radius:4px;padding:8px;cursor:pointer;font-weight:600;font-family:monospace;font-size:10px;transition:0.2s;">
              ↓ SUMMARISE CHAT
            </button>
            <button id="cas-flyout-inject" style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#ccc;border-radius:4px;padding:8px;cursor:pointer;font-family:monospace;font-size:10px;transition:0.2s;">
              ↓ INJECT
            </button>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px;padding-top:10px;border-top:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:8px;color:#555;text-transform:uppercase;">Navigation (Grouped)</span>
              <button id="cas-flyout-refresh-selector" title="Refresh list" style="background:none;border:none;color:#555;cursor:pointer;font-size:10px;">↺</button>
            </div>
            <select id="cas-flyout-chat-selector" class="cas-mini-select" style="width:100%;">
              <option value="">Select chat summary...</option>
            </select>
          </div>
          
          <div id="cas-flyout-refocus" style="display:none;margin-top:12px;">
            <button id="cas-flyout-btn-refocus" style="width:100%;background:rgba(240,192,64,0.08);border:1px solid rgba(240,192,64,0.2);color:hsl(var(--cas-gold));border-radius:4px;padding:8px;cursor:pointer;font-family:monospace;font-size:10px;font-weight:600;">↶ Refocus to Current Chat</button>
          </div>
        </div>

        <!-- ── Search & Summary ── -->
        <div style="padding:0 12px 10px;">
          <div style="position:relative;margin-bottom:12px;">
            <input id="cas-flyout-search" type="text" placeholder="🔍 Search topics..."
              style="width:100%;box-sizing:border-box;background:rgba(0,0,0,0.2);border:1px solid rgba(255,255,255,0.05);color:#fff;border-radius:6px;font-family:monospace;font-size:11px;padding:8px 10px;outline:none;"/>
          </div>
          <div id="cas-flyout-sum-status" style="font-size:9px;color:#888;margin-bottom:8px;display:none;"></div>
          <div id="cas-flyout-chat-summary"></div>
        </div>
      </div>

    `;
    document.body.appendChild(flyout);

    // Unified persistence logic
    const saveGeom = () => {
      chrome.storage.local.set({
        cas_flyout_geom: {
          w: flyout.style.width,
          h: flyout.style.height,
          l: flyout.style.left,
          t: flyout.style.top
        }
      });
    };

    // Load geometry
    chrome.storage.local.get('cas_flyout_geom', (res) => {
      const g = res.cas_flyout_geom;
      if (g) {
        if (g.w) flyout.style.width = g.w;
        if (g.h) flyout.style.height = g.h;
        if (g.l) flyout.style.left = g.l;
        if (g.t) flyout.style.top = g.t;
        flyout.style.transform = 'none';
        flyout.style.right = 'auto';
      }
    });

    // Resize observer for persistence
    const ro = new ResizeObserver(() => saveGeom());
    ro.observe(flyout);

    // Draggable logic
    let dragging = false, stickyDragging = false, ox = 0, oy = 0;
    const header = flyout.querySelector('#cas-flyout-header');

    const startDrag = (e, isSticky = false) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      dragging = true;
      stickyDragging = isSticky;
      ox = e.clientX - flyout.offsetLeft;
      oy = e.clientY - flyout.offsetTop;
      if (isSticky) {
        flyout.style.transition = 'none';
        flyout.style.opacity = '0.85';
      }
    };

    header.addEventListener('mousedown', e => startDrag(e));

    flyout.addEventListener('dblclick', e => {
      // Allow dblclick on body/background (not controls)
      if (e.target === flyout || e.target.classList.contains('cas-flyout-body') || e.target.id === 'cas-flyout-chat-summary') {
        startDrag(e, true);
      }
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      flyout.style.left = (e.clientX - ox) + 'px';
      flyout.style.top = (e.clientY - oy) + 'px';
      flyout.style.transform = 'none';
      flyout.style.right = 'auto';
    });

    document.addEventListener('mousedown', () => {
      if (stickyDragging) {
        dragging = false;
        stickyDragging = false;
        flyout.style.opacity = '1';
        saveGeom();
      }
    });

    document.addEventListener('mouseup', () => {
      if (!stickyDragging && dragging) {
        dragging = false;
        saveGeom();
      }
    });

    document.getElementById('cas-flyout-close').addEventListener('click', () => {
      flyout.style.display = 'none';
      const toggleBtn = document.getElementById('cas-panel-toggle-summary');
      if (toggleBtn) toggleBtn.style.color = '#888';
    });

    document.getElementById('cas-flyout-refresh-selector').addEventListener('click', () => refreshFlyoutChatSelector());

    document.getElementById('cas-flyout-toggle-options')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = document.getElementById('cas-flyout-options');
      if (panel) {
        const isVisible = panel.style.display !== 'none';
        panel.style.display = isVisible ? 'none' : 'block';
        document.getElementById('cas-flyout-toggle-options').style.color = isVisible ? '#888' : '#f0c040';
        document.getElementById('cas-flyout-toggle-options').style.background = isVisible ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.08)';
        if (!isVisible) refreshFlyoutChatSelector();
      }
    });

    document.addEventListener('click', (e) => {
      const panel = document.getElementById('cas-flyout-options');
      const toggle = document.getElementById('cas-flyout-toggle-options');
      if (panel && panel.style.display === 'block' && !panel.contains(e.target) && !toggle.contains(e.target)) {
        panel.style.display = 'none';
        toggle.style.color = '#888';
        toggle.style.background = 'rgba(255,255,255,0.03)';
      }
    });

    document.getElementById('cas-flyout-btn-refocus')?.addEventListener('click', () => {
      activeFlyoutChatId = null;
      activeFlyoutSumKey = null;
      document.getElementById('cas-flyout-title').textContent = '';
      const refBtn = document.getElementById('cas-flyout-refocus');
      if (refBtn) refBtn.style.display = 'none';
      refreshFlyoutChatSelector();
      renderChatSummaries();
    });

    // Topic Search
    document.getElementById('cas-flyout-search')?.addEventListener('input', (e) => {
      renderChatSummaries(e.target.value.toLowerCase());
    });

    document.getElementById('cas-flyout-sum-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(buildFlyoutPrompt()).then(() => {
        const s = document.getElementById('cas-flyout-sum-status');
        if (s) { s.textContent = '✓ Copy successful'; s.style.display = 'block'; }
      });
    });

    document.getElementById('cas-flyout-summarise')?.addEventListener('click', () => {
      performChatSummarise(document.getElementById('cas-flyout-sum-status'));
    });

    document.getElementById('cas-flyout-inject')?.addEventListener('click', async () => {
      const s = document.getElementById('cas-flyout-sum-status');
      const responses = document.querySelectorAll('[data-is-streaming="false"] .font-claude-response');
      if (responses.length === 0) {
        if (s) { s.textContent = '✗ No response found'; s.style.display = 'block'; }
        return;
      }
      const text = responses[responses.length - 1].textContent.trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        if (s) { s.textContent = '✗ No JSON found'; s.style.display = 'block'; }
        return;
      }
      try {
        const parsed = JSON.parse(match[0]);
        if (!parsed.topics || !Array.isArray(parsed.topics)) throw new Error('Missing topics arr');
        const chatSumKey = storageKey('cas_chat_summary');
        await new Promise(r => chrome.storage.local.set({
          [chatSumKey]: { generated: new Date().toISOString(), topics: parsed.topics }
        }, r));
        if (s) { s.textContent = `✓ Stored (${parsed.topics.length})`; s.style.display = 'block'; }
        renderChatSummaries();
      } catch (e) {
        if (s) { s.textContent = `✗ Parse fail`; s.style.display = 'block'; }
      }
    });
  }

  async function refreshFlyoutChatSelector() {
    const selector = document.getElementById('cas-flyout-chat-selector');
    if (!selector) return;

    const allData = await new Promise(r => chrome.storage.local.get(null, r));
    const projectIndexKeys = Object.keys(allData).filter(k => k.startsWith('proj_') && k.endsWith('_chat_index'));

    selector.innerHTML = '<option value="">Select project summary...</option>';

    if (projectIndexKeys.length === 0) {
      selector.innerHTML = '<option value="">No recorded projects yet.</option>';
      return;
    }

    projectIndexKeys.forEach(pKey => {
      const projId = pKey.split('_')[1];
      const index = allData[pKey];
      const chats = Object.entries(index);

      const chatsWithSums = [];
      chats.forEach(([chatId, meta]) => {
        const sumKey = `proj_${projId}/chat_${chatId}_cas_chat_summary`;
        if (allData[sumKey]?.topics?.length > 0) {
          chatsWithSums.push({ chatId, name: meta.name || chatId, sumKey });
        }
      });

      if (chatsWithSums.length > 0) {
        const projName = chats[0][1].projectName || projId.slice(0, 8);
        const optgroup = document.createElement('optgroup');
        optgroup.label = `◈ ${projName}`;
        optgroup.style.background = '#13161b';
        optgroup.style.color = 'hsl(var(--cas-gold))';

        chatsWithSums.sort((a, b) => a.name.localeCompare(b.name)).forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.chatId;
          opt.dataset.sumKey = c.sumKey;
          opt.dataset.chatName = c.name;
          opt.textContent = c.name.slice(0, 50) + (c.name.length > 50 ? '...' : '');
          if (c.chatId === activeFlyoutChatId) opt.selected = true;
          optgroup.appendChild(opt);
        });
        selector.appendChild(optgroup);
      }
    });

    selector.onchange = (e) => {
      const opt = selector.options[selector.selectedIndex];
      if (opt && opt.value) {
        activeFlyoutChatId = opt.value;
        activeFlyoutSumKey = opt.dataset.sumKey;
        const titleEl = document.getElementById('cas-flyout-title');
        if (titleEl) titleEl.textContent = `[${opt.dataset.chatName}]`;

        // Ensure refocus is shown if we're in an external chat summary
        const refBtn = document.getElementById('cas-flyout-refocus');
        if (refBtn) refBtn.style.display = (activeFlyoutChatId !== getChatId()) ? 'block' : 'none';

        renderChatSummaries();
      }
    };
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
      <div id="cas-body" style="display:flex;flex-direction:column;flex:1;min-height:0;">
        <div id="cas-tabs" style="flex-shrink:0;">
          <button class="cas-tab cas-tab-active" data-tab="chat">This chat</button>
          <button class="cas-tab" data-tab="project">Project</button>
          <button class="cas-tab" data-tab="settings">⚙</button>
        </div>
        <div id="cas-tab-chat" style="display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;">
        <div id="cas-search-row" style="padding:4px 4px 2px;">
          <input id="cas-search" type="text" placeholder="🔍 Search artifacts…"
            style="width:100%;box-sizing:border-box;background:#0a0c0f;border:1px solid #2a2e36;color:#c8cdd6;border-radius:3px;font-family:monospace;font-size:10px;padding:4px 6px;outline:none;"/>
        </div>
        <div id="cas-sort-row">
          <label>Sort by</label>
          <select id="cas-sort-mode">
            <option value="dom-order" ${activeSortMode === 'dom-order' ? 'selected' : ''}>Original order</option>
            <option value="name-asc" ${activeSortMode === 'name-asc' ? 'selected' : ''}>Name A→Z</option>
            <option value="name-desc" ${activeSortMode === 'name-desc' ? 'selected' : ''}>Name Z→A</option>
          </select>
          <button id="cas-apply">Apply</button>
        </div>

        <!-- ── Artifact Summaries ─────────────────────────────────── -->
        <details id="cas-summary-row" class="cas-section-details">
          <summary class="cas-section-label cas-animated-arrow">Artifact Summaries</summary>
          <div style="display:flex;gap:5px;align-items:center;margin-top:6px;">
            <select id="cas-sum-length" class="cas-mini-select">
              <option value="1">1 sentence</option>
              <option value="2">2–3 sentences</option>
              <option value="5">5 sentences</option>
            </select>
            <button id="cas-sum-copy" class="cas-premium-btn">⎘ Copy Prompt</button>
          </div>
          <div style="display:flex;gap:5px;align-items:center;margin-top:5px">
            <button id="cas-summarise" class="cas-premium-btn" style="background:hsl(var(--cas-gold)); color:#0d0f12; border:none; font-weight:600;">↓ SUMMARISE ARTIFACTS</button>
            <button id="cas-inject" class="cas-premium-btn">↓ INJECT</button>
          </div>
          <textarea id="cas-paste-json" placeholder="Or paste JSON here to inject manually…" rows="2" style="margin-top:5px;"></textarea>
        </details>

        <!-- ── Chat Summary ──────────────────────────────────────── -->
        <details id="cas-chat-summary-row" class="cas-section-details">
          <summary class="cas-section-label cas-animated-arrow">Chat Summary</summary>
          <div style="display:flex; align-items:flex-end; gap:10px; margin-top:8px; padding-bottom:10px; border-bottom:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex;flex-direction:column;gap:3px;">
              <label style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Topics</label>
              <select id="cas-chat-topic-lines" class="cas-mini-select" style="min-width:60px;">
                <option value="1">1 line</option>
                <option value="2" selected>2 lines</option>
                <option value="5">5 lines</option>
              </select>
            </div>
            <div style="display:flex;flex-direction:column;gap:3px;">
              <label style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Aspects</label>
              <select id="cas-chat-aspect-lines" class="cas-mini-select" style="min-width:60px;">
                <option value="1" selected>1 line</option>
                <option value="2">2 lines</option>
                <option value="5">5 lines</option>
              </select>
            </div>
            <button id="cas-chat-sum-copy" class="cas-premium-btn" style="height:24px; margin-left:auto;">⎘ COPY PROMPT</button>
          </div>
          <div style="display:flex;gap:5px;align-items:center;margin-top:10px">
            <button id="cas-chat-summarise" class="cas-premium-btn" style="flex:1; background:hsl(var(--cas-gold)); color:#0d0f12; border:none; font-weight:600;">↓ SUMMARISE CHAT</button>
            <button id="cas-chat-inject" class="cas-premium-btn" style="flex:1;">↓ INJECT</button>
          </div>
          <div id="cas-chat-sum-status" style="font-size:9px;color:#888;margin-top:3px; margin-bottom:3px; display:none"></div>
          <div id="cas-current-chat-summary" style="display:none;margin-top:8px;"></div>
        </details>

        <div id="cas-status">Click ↺ to scan</div>
        <div id="cas-list"></div>
        <div id="cas-data-note" style="display:none">
          <span id="cas-data-summary"></span>
          <button id="cas-full-dump">Full dump to console</button>
        </div>
        </div><!-- end cas-tab-chat -->

        <div id="cas-tab-project" style="display:none;flex-direction:column;flex:1;min-height:0;overflow:hidden;">
          <div id="cas-project-search-row" style="padding:4px 4px 2px;">
            <input id="cas-project-search" type="text" placeholder="🔍 Search project artifacts…"
              style="width:100%;box-sizing:border-box;background:#0a0c0f;border:1px solid #2a2e36;color:#c8cdd6;border-radius:3px;font-family:monospace;font-size:10px;padding:4px 6px;outline:none;"/>
          </div>
          <!-- ── Project select-summarise toolbar ─────────────────── -->
          <div id="cas-project-sum-toolbar" style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;padding:4px;">
            <button id="cas-project-select-mode" style="font-size:9px;padding:2px 7px;background:#13161b;border:1px solid #2a2e36;color:#aaa;border-radius:3px;cursor:pointer;font-family:monospace;">☐ Select &amp; Open</button>
            <span id="cas-project-select-hint" style="font-size:8px;color:#555;display:none">Select chats below, then:</span>
            <button id="cas-project-open-selected" style="display:none;font-size:9px;padding:2px 7px;background:#2a2e36;border:1px solid #444;color:#ccc;border-radius:3px;cursor:pointer;font-family:monospace;">↗ Open selected tabs</button>
          </div>
          <div id="cas-project-list"></div>
        </div>
        <div id="cas-tab-settings" style="display:none;flex-direction:column;flex:1;padding:10px 4px;overflow-y:auto;min-height:0;">
          <!-- Sorter Zoom -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <label style="color:#888; font-size:10px;">Sorter UI Scale</label>
            <div style="display:flex; gap:4px; align-items:center;">
              <button id="cas-btn-zoom-sorter-dec" style="background:#13161b; border:1px solid #2a2e36; color:#ccc; border-radius:3px; width:22px; height:22px; cursor:pointer;">-</button>
              <input type="text" id="cas-inp-zoom-sorter" value="100%" style="width:40px; text-align:center; background:#0a0c0f; color:#f0c040; border:1px solid #2a2e36; border-radius:3px; outline:none; font-family:monospace; font-size:10px; padding:2px;" readonly />
              <button id="cas-btn-zoom-sorter-inc" style="background:#13161b; border:1px solid #2a2e36; color:#ccc; border-radius:3px; width:22px; height:22px; cursor:pointer;">+</button>
            </div>
          </div>
          <!-- Flyout Zoom -->
          <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
            <label style="color:#888; font-size:10px;">Flyout UI Scale</label>
            <div style="display:flex; gap:4px; align-items:center;">
              <button id="cas-btn-zoom-flyout-dec" style="background:#13161b; border:1px solid #2a2e36; color:#ccc; border-radius:3px; width:22px; height:22px; cursor:pointer;">-</button>
              <input type="text" id="cas-inp-zoom-flyout" value="100%" style="width:40px; text-align:center; background:#0a0c0f; color:#f0c040; border:1px solid #2a2e36; border-radius:3px; outline:none; font-family:monospace; font-size:10px; padding:2px;" readonly />
              <button id="cas-btn-zoom-flyout-inc" style="background:#13161b; border:1px solid #2a2e36; color:#ccc; border-radius:3px; width:22px; height:22px; cursor:pointer;">+</button>
            </div>
          </div>
          <div style="margin-top:12px;">
            <button id="cas-btn-export" style="width:100%; padding:6px; background:rgba(240,192,64,0.08); border:1px solid #f0c040; color:#f0c040; border-radius:3px; cursor:pointer; font-size:10px; letter-spacing:0.05em; margin-bottom:8px;">⤓ Export Data to JSON</button>
          </div>
          <div style="margin-top:8px;">
            <button id="cas-btn-reset-settings" style="width:100%; padding:6px; background:rgba(211,47,47,0.1); border:1px solid #d32f2f; color:#d32f2f; border-radius:3px; cursor:pointer; font-size:10px; letter-spacing:0.05em;">Reset to Defaults</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(panel);
    injectStyles();

    // ─── First Load Pathway (Restores zoom & triggers initial scan) ───
    chrome.storage.local.get('cas_global_settings', (res) => {
      const s = res.cas_global_settings || { zoom_sorter: 1, zoom_flyout: 1 };
      applyZoom('sorter', s.zoom_sorter || 1);
      applyZoom('flyout', s.zoom_flyout || 1);
    });
    // ─────────────────────────────────────────────────────────────────

    bindPanelEvents(panel);
    buildFlyout();

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
    let currentItems = [];

    document.getElementById('cas-toggle')?.addEventListener('click', () => {
      collapsed = !collapsed;
      body.style.display = collapsed ? 'none' : 'flex';
      panel.style.height = collapsed ? 'auto' : (panel.getAttribute('data-cas-expanded-h') || '500px');
      if (!collapsed && panel.style.height === 'auto') panel.style.height = '500px';
      document.getElementById('cas-toggle').textContent = collapsed ? '▸' : '▾';
    });

    // Capture height on resize to ensure collapse restoration is accurate
    const panelRO = new ResizeObserver(() => {
      if (!collapsed) {
        panel.setAttribute('data-cas-expanded-h', panel.style.height);
      }
    });
    panelRO.observe(panel);

    document.getElementById('cas-close').addEventListener('click', () => {
      panel.remove();
    });

    document.getElementById('cas-scan').addEventListener('click', () => {
      status.textContent = 'Scanning…';
      list.innerHTML = '';
      requestAnimationFrame(async () => {
        currentItems = scanForFileList();
        renderList(currentItems, list, status, dataNote, dataSummary);
        await renderChatSummaries();
      });
    });

    document.getElementById('cas-apply').addEventListener('click', () => {
      currentItems = scanForFileList();
      if (currentItems.length === 0) {
        status.textContent = 'Scan first (↺)';
        return;
      }
      const mode = document.getElementById('cas-sort-mode').value;
      applySort(currentItems, mode);
      status.textContent = `Sorted: ${mode}`;
      // Rescan after sort
      requestAnimationFrame(() => requestAnimationFrame(async () => {
        currentItems = scanForFileList();
        renderList(currentItems, list, status, dataNote, dataSummary);
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
      performSummarise(status);
    });

    // ── ↓ Inject — reads paste field first, then last DOM response (GAPs 2,5) ──
    document.getElementById('cas-inject').addEventListener('click', async () => {
      performInjection(status);
    });

    // Drag to reposition panel
    let dragging = false, stickyDragging = false, ox = 0, oy = 0;
    const header = document.getElementById('cas-header');

    const startDrag = (e, isSticky = false) => {
      if (e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.tagName === 'INPUT') return;
      dragging = true;
      stickyDragging = isSticky;
      ox = e.clientX - panel.offsetLeft;
      oy = e.clientY - panel.offsetTop;
      if (isSticky) {
        panel.style.transition = 'none';
        panel.style.opacity = '0.8';
      }
    };

    header.addEventListener('mousedown', e => startDrag(e));

    panel.addEventListener('dblclick', e => {
      if (e.target === panel || e.target.id === 'cas-body' || e.target.classList.contains('cas-flyout-body')) {
        startDrag(e, true);
      }
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      panel.style.left = (e.clientX - ox) + 'px';
      panel.style.top = (e.clientY - oy) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });

    document.addEventListener('mousedown', () => {
      if (stickyDragging) {
        dragging = false;
        stickyDragging = false;
        panel.style.opacity = '1';
      }
    });

    document.addEventListener('mouseup', () => {
      if (!stickyDragging) dragging = false;
    });

    // ── Tab switching ─────────────────────────────────────────────────────
    document.querySelectorAll('.cas-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.cas-tab').forEach(t => t.classList.remove('cas-tab-active'));
        tab.classList.add('cas-tab-active');
        const which = tab.getAttribute('data-tab');
        document.getElementById('cas-tab-chat').style.display = which === 'chat' ? 'flex' : 'none';
        document.getElementById('cas-tab-project').style.display = which === 'project' ? 'flex' : 'none';

        const settingsTab = document.getElementById('cas-tab-settings');
        if (settingsTab) settingsTab.style.display = which === 'settings' ? 'flex' : 'none';

        if (which === 'project') renderProjectView();
      });
    });

    // ── Settings Logic ───────────────────────────────────────────────────
    const zoomInpSorter = document.getElementById('cas-inp-zoom-sorter');
    const zoomInpFlyout = document.getElementById('cas-inp-zoom-flyout');

    if (zoomInpSorter) {
      chrome.storage.local.get('cas_global_settings', (res) => {
        const s = res.cas_global_settings || { zoom_sorter: 1, zoom_flyout: 1 };
        applyZoom('sorter', s.zoom_sorter || 1);
        applyZoom('flyout', s.zoom_flyout || 1);
      });
    }

    const updateZoom = (type, delta) => {
      chrome.storage.local.get('cas_global_settings', (res) => {
        const s = res.cas_global_settings || { zoom_sorter: 1, zoom_flyout: 1 };
        const key = type === 'sorter' ? 'zoom_sorter' : 'zoom_flyout';
        let val = (s[key] || 1) + delta;
        val = Math.max(0.5, Math.min(2.0, val));
        s[key] = val;
        chrome.storage.local.set({ cas_global_settings: s });
        applyZoom(type, val);
      });
    };

    document.getElementById('cas-btn-zoom-sorter-dec')?.addEventListener('click', () => updateZoom('sorter', -0.1));
    document.getElementById('cas-btn-zoom-sorter-inc')?.addEventListener('click', () => updateZoom('sorter', 0.1));
    document.getElementById('cas-btn-zoom-flyout-dec')?.addEventListener('click', () => updateZoom('flyout', -0.1));
    document.getElementById('cas-btn-zoom-flyout-inc')?.addEventListener('click', () => updateZoom('flyout', 0.1));

    document.getElementById('cas-btn-reset-settings')?.addEventListener('click', () => {
      chrome.storage.local.set({ cas_global_settings: { zoom_sorter: 1, zoom_flyout: 1 } });
      applyZoom('sorter', 1);
      applyZoom('flyout', 1);
    });

    // ── Search — filter artifact list in "This Chat" tab ─────────────────
    document.getElementById('cas-search')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const rows = list.querySelectorAll('.cas-row, .cas-group-header');
      rows.forEach(row => {
        if (row.classList.contains('cas-group-header')) { row.style.display = ''; return; }
        const name = (row.querySelector('.cas-name')?.textContent || '').toLowerCase();
        const summary = (row.querySelector('.cas-injected-summary, div[style*="color:#666"]')?.textContent || '').toLowerCase();
        row.style.display = (!q || name.includes(q) || summary.includes(q)) ? '' : 'none';
      });
    });

    // ── Project search — filter by chat name OR artifact names ───────────
    document.getElementById('cas-project-search')?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      const projectList = document.getElementById('cas-project-list');
      if (!projectList) return;
      projectList.querySelectorAll('[data-cas-chat-row]').forEach(row => {
        const chatText = row.textContent.toLowerCase();
        const artifactNames = (row.getAttribute('data-cas-artifacts') || '').toLowerCase();
        row.style.display = (!q || chatText.includes(q) || artifactNames.includes(q)) ? '' : 'none';
      });
    });

    // ── Export — download all CAS data as a JSON file ────────────────────
    document.getElementById('cas-btn-export')?.addEventListener('click', () => {
      chrome.storage.local.get(null, (all) => {
        const casData = {};
        Object.entries(all).forEach(([k, v]) => {
          if (k.startsWith('cas_') || k.startsWith('proj_') || k.startsWith('chat_')) {
            casData[k] = v;
          }
        });
        const blob = new Blob([JSON.stringify(casData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `cas-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    });

    // ── Chat Summary handlers ─────────────────────────────────────────────

    function buildChatSummaryPrompt() { return buildFlyoutPrompt(); }

    document.getElementById('cas-chat-sum-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(buildChatSummaryPrompt()).then(() => {
        const s = document.getElementById('cas-chat-sum-status');
        if (s) { s.textContent = '✓ Prompt copied — paste in chat, send, then click ↓ Inject'; s.style.display = 'block'; }
      });
    });

    document.getElementById('cas-chat-summarise')?.addEventListener('click', () => {
      const filled = fillInput(buildChatSummaryPrompt());
      const s = document.getElementById('cas-chat-sum-status');
      if (s) {
        s.textContent = filled ? '✓ Prompt ready — review and send manually' : '✗ Could not find chat input';
        s.style.display = 'block';
      }
    });

    document.getElementById('cas-chat-inject')?.addEventListener('click', async () => {
      const s = document.getElementById('cas-chat-sum-status');
      // Read last Claude response
      const responses = document.querySelectorAll('[data-is-streaming="false"] .font-claude-response');
      if (responses.length === 0) {
        if (s) { s.textContent = '✗ No Claude response found'; s.style.display = 'block'; }
        return;
      }
      const text = responses[responses.length - 1].textContent.trim();
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        if (s) { s.textContent = '✗ No JSON found in last response'; s.style.display = 'block'; }
        return;
      }
      try {
        const parsed = JSON.parse(match[0]);
        if (!parsed.topics || !Array.isArray(parsed.topics)) throw new Error('Missing topics array');
        const chatSumKey = storageKey('cas_chat_summary');
        await new Promise(r => chrome.storage.local.set({
          [chatSumKey]: { generated: new Date().toISOString(), topics: parsed.topics }
        }, r));
        if (s) { s.textContent = `✓ Chat summary stored (${parsed.topics.length} topics)`; s.style.display = 'block'; }
        // Force UI re-render for the current chat
        renderCurrentChatSummary();
      } catch (e) {
        if (s) { s.textContent = `✗ Parse error: ${e.message.slice(0, 40)}`; s.style.display = 'block'; }
      }
    });

    // ── Project: Select & Open mode ──────────────────────────────────────
    let projectSelectMode = false;
    const selectedChatIds = new Set();

    document.getElementById('cas-project-select-mode')?.addEventListener('click', () => {
      projectSelectMode = !projectSelectMode;
      selectedChatIds.clear();
      const btn = document.getElementById('cas-project-select-mode');
      const hint = document.getElementById('cas-project-select-hint');
      const openBtn = document.getElementById('cas-project-open-selected');

      if (btn) btn.textContent = projectSelectMode ? '✕ Cancel' : '☐ Select & Open';
      if (btn) btn.style.color = projectSelectMode ? '#f0c040' : '#aaa';
      if (hint) hint.style.display = projectSelectMode ? 'inline' : 'none';
      if (openBtn) openBtn.style.display = projectSelectMode ? 'inline-block' : 'none';

      // Re-render project list to show/hide checkboxes
      renderProjectView();
    });

    // Expose selectedChatIds and mode so renderProjectView can use them
    window._casProjectSelectMode = () => projectSelectMode;
    window._casSelectedChatIds = selectedChatIds;

    document.getElementById('cas-project-open-selected')?.addEventListener('click', () => {
      if (selectedChatIds.size === 0) return;

      if (confirm(`Open ${selectedChatIds.size} chats in new background tabs? (This may use a lot of RAM)`)) {
        selectedChatIds.forEach(chatId => {
          window.open(`https://claude.ai/chat/${chatId}`, '_blank');
        });

        // Reset selections
        selectedChatIds.clear();
        projectSelectMode = false;

        const btn = document.getElementById('cas-project-select-mode');
        const hint = document.getElementById('cas-project-select-hint');
        const openBtn = document.getElementById('cas-project-open-selected');
        if (btn) { btn.textContent = '☐ Select & Open'; btn.style.color = '#aaa'; }
        if (hint) hint.style.display = 'none';
        if (openBtn) openBtn.style.display = 'none';

        renderProjectView();
      }
    });
  }

  // ── Summary helpers ──────────────────────────────────────────────────────

  function injectSummary(node, text) {
    // node is the <button aria-label="... Open artifact."> overlay — it's an absolute-positioned
    // invisible element. The visible card content lives in a sibling div inside the parent wrapper.
    // We need to walk up to the card container first.
    const card = node.closest('[class*="artifact-block"]') || node.parentElement;
    if (!card) return;

    // Remove any existing injection in this card
    card.querySelector('.cas-injected-summary')?.remove();

    // Find the flex-col container that holds name + type line
    const textCol = card.querySelector('[class*="flex-col"][class*="gap-1"]')
      || card.querySelector('[class*="leading-tight"]')?.parentElement
      || card.querySelector('.artifact-block-cell');

    if (!textCol) {
      console.warn('[CAS] Injection target NOT found in artifact card:', node);
      return;
    }

    const el = document.createElement('div');
    el.className = 'cas-injected-summary';
    el.textContent = text;
    el.style.cssText = [
      'font-size:10px', 'line-height:1.4', 'color:#8a9ab5',
      'margin-top:4px', 'padding:4px 6px',
      'background:rgba(255,255,255,0.04)',
      'border-left:2px solid #f0c040',
      'border-radius:0 3px 3px 0',
      'word-break:break-word', 'white-space:normal', 'max-width:100%',
    ].join(';');
    textCol.appendChild(el);
  }

  // ─── Navigation — Jump to Chat ──────────────────────────────────────────

  function jumpToArtifact(name) {
    if (!name) return;

    // Find all potential artifact cards in the chat flow.
    // Claude no longer uses role="button" — match on button[aria-label] instead.
    const targets = Array.from(
      document.querySelectorAll(`button[aria-label*="${name}"], [role="button"][aria-label*="${name}"]`)
    ).filter(n => {
      // Exclude sidebar nodes
      const sidebar = findArtifactSidebar();
      return !(sidebar && sidebar.contains(n));
    });

    if (targets.length === 0) {
      console.warn('[CAS] Destination artifact not found in chat history:', name);
      return;
    }

    // Scroll to the LAST one (most recent)
    const target = targets[targets.length - 1];

    // Scroll container
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // Flash Highlight
    const originalBg = target.style.background;
    const originalBorder = target.style.borderColor;
    const originalTransition = target.style.transition;

    target.style.transition = 'background 0.3s, border-color 0.3s';
    target.style.background = 'rgba(240, 192, 64, 0.2)';
    target.style.borderColor = 'rgba(240, 192, 64, 0.6)';

    setTimeout(() => {
      target.style.background = originalBg;
      target.style.borderColor = originalBorder;
      setTimeout(() => {
        target.style.transition = originalTransition;
      }, 500);
    }, 2000);
  }

  async function injectAndStore(node, name, text) {
    // Guard: skip if text is empty and we already have a summary stored
    if (!text || text.trim() === '') return;
    injectSummary(node, text);
    await storeSummary(name, text);
  }

  async function performSummarise(statusTarget) {
    const freshItems = scanForFileList();
    const summaries = await storageGet('cas_summaries');
    const artifacts = freshItems.filter(i => {
      if (i.source !== 'generated' || !i.data.name || summaries[i.data.name]) return false;
      return true;
    });

    if (artifacts.length === 0) {
      if (statusTarget) statusTarget.textContent = 'Everything is summarised.';
      return;
    }
    const lenSelect = document.getElementById('cas-sum-length');
    const sentences = lenSelect ? lenSelect.value : '2';
    const lenLabel = sentences === '1' ? '1 sentence' : sentences === '2' ? '2-3 sentences' : '5 sentences';
    const names = artifacts.map(a => a.data.name).join('\n');
    const prompt = `For each file below write exactly ${lenLabel} describing what it contains.\nReply with a JSON object only — keys are the exact filenames, values are the summaries. No other text.\n\n${names}`;

    const filled = fillInput(prompt);
    if (statusTarget) {
      statusTarget.textContent = filled ? '✓ Artifact Prompt injected — send in chat, then click ↓ INJECT' : '✗ Input not found';
    }
  }

  function fillInput(text) {
    const input = document.querySelector('[contenteditable="true"][data-testid="composer-input"], .ProseMirror[contenteditable="true"]')
      || document.querySelector('[contenteditable="true"]');
    if (!input) return false;
    input.focus();
    document.execCommand('selectAll', false, null);
    document.execCommand('insertText', false, text);
    return true;
  }

  function buildFlyoutPrompt() {
    const t = document.getElementById('cas-flyout-topic-lines')?.value
           || document.getElementById('cas-chat-topic-lines')?.value
           || '2';
    const a = document.getElementById('cas-flyout-aspect-lines')?.value
           || document.getElementById('cas-chat-aspect-lines')?.value
           || '1';
    return `Analyse this conversation and identify all distinct topics discussed.\n` +
      `Focus on the human dialogue, decisions made, and conceptual evolution. ` +
      `DO NOT provide technical summaries of the code or artifacts themselves. ` +
      `For each topic write exactly ${t} line(s) summarising it.\n` +
      `For each distinct aspect or subtopic within each topic write exactly ${a} line(s).\n\n` +
      `Reply ONLY with a JSON object in this exact shape — no other text:\n` +
      `{\n  "topics": [\n    {\n      "name": "Topic name",\n      "summary": "Summary of topic.",\n` +
      `      "aspects": [\n        { "name": "Aspect name", "summary": "Summary of aspect." }\n      ]\n    }\n  ]\n}`;
  }

  function performChatSummarise(statusTarget) {
    const filled = fillInput(buildFlyoutPrompt());
    if (statusTarget) {
      statusTarget.textContent = filled ? '✓ Chat Prompt injected — send in chat, then click ↓ INJECT' : '✗ Input not found';
      statusTarget.style.display = 'block';
    }
  }

  async function performInjection(statusTarget) {
    const freshItems = scanForFileList();
    const artifacts = freshItems.filter(i => i.source === 'generated');
    if (artifacts.length === 0) {
      if (statusTarget) statusTarget.textContent = 'Scan first (↺).';
      return;
    }

    const pasteField = document.getElementById('cas-paste-json');
    const pasteText = (pasteField && pasteField.value) ? pasteField.value.trim() : '';
    let jsonText = pasteText;

    if (!jsonText) {
      const responses = document.querySelectorAll('[data-is-streaming="false"] .font-claude-response');
      if (responses.length === 0) {
        if (statusTarget) statusTarget.textContent = 'No response found. Paste JSON or wait.';
        return;
      }
      jsonText = responses[responses.length - 1].textContent.trim();
    }

    const match = jsonText.match(/\{[\s\S]*\}/) || jsonText.match(/\[[\s\S]*\]/);
    if (!match) {
      if (statusTarget) statusTarget.textContent = 'No JSON found — check format.';
      return;
    }

    try {
      let cleanMatch = match[0]
        .replace(/^```(json)?\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

      console.log('[CAS] Attempting to parse:', cleanMatch);
      const parsed = JSON.parse(cleanMatch);
      let count = 0;

      const slugMappedParsed = {};
      if (!Array.isArray(parsed)) {
        for (const k in parsed) slugMappedParsed[toSlug(k)] = parsed[k];
      }

      for (const [idx, artifact] of artifacts.entries()) {
        if (!artifact.isSidebar) continue; // ◈ PROTECTION: Skip chat flow nodes

        if (Array.isArray(parsed)) {
          if (parsed[idx]) {
            await injectAndStore(artifact.node, artifact.data.name, parsed[idx]);
            count++;
          }
        } else {
          const artifactSlug = artifact.data.slug;
          const directSummary = slugMappedParsed[artifactSlug];

          if (directSummary) {
            console.log(`[CAS] Match! ${artifact.data.name} -> Slug: ${artifactSlug}`);
            await injectAndStore(artifact.node, artifact.data.name, directSummary);
            count++;
          } else {
            // Partial slug match
            for (const sKey in slugMappedParsed) {
              if (artifactSlug && sKey && (artifactSlug.includes(sKey) || sKey.includes(artifactSlug))) {
                console.log(`[CAS] Partial Match! ${artifact.data.name} (~${sKey})`);
                await injectAndStore(artifact.node, artifact.data.name, slugMappedParsed[sKey]);
                count++;
                break;
              }
            }
          }
        }
      }

      console.log(`[CAS] Injection complete. Total: ${count}`);
      if (statusTarget) {
        statusTarget.textContent = `✓ Injected ${count} summaries (persisted)`;
      }
      if (pasteField) pasteField.value = '';

      // Update UI state
      const list = document.getElementById('cas-list');
      const dataNote = document.getElementById('cas-data-note');
      const dataSummary = document.getElementById('cas-data-summary');
      if (list) renderList(freshItems, list, statusTarget, dataNote, dataSummary);

      refreshSummariseBadge();
    } catch (e) {
      console.error('[CAS] Parse Error:', e, 'Input was:', jsonText);
      if (statusTarget) statusTarget.textContent = `Error: ${e.message.slice(0, 30)}`;
    }
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
      el.innerHTML = '<div style="color:#999;font-size:10px;padding:8px">No recorded projects found yet.</div>';
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

      // Pre-load all artifact names for this project for deep search
      // Done async per project so we don't block initial render
      chats.forEach(([chatId, meta]) => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-cas-chat-row', '1');

        const selectMode = window._casProjectSelectMode?.() || false;
        const selectedChatIds = window._casSelectedChatIds;

        // Pre-fetch artifact names to stamp on wrapper for project search
        const chatSumKey = `proj_${meta.projectId || projId}/chat_${chatId}_cas_summaries`;
        const chatSeenKey = `proj_${meta.projectId || projId}/chat_${chatId}_cas_first_seen`;
        const chatSumMapKey = `proj_${meta.projectId || projId}/chat_${chatId}_cas_chat_summary`;
        Promise.all([
          new Promise(r => chrome.storage.local.get(chatSeenKey, d => r(d[chatSeenKey] || {}))),
          new Promise(r => chrome.storage.local.get(chatSumKey, d => r(d[chatSumKey] || {}))),
        ]).then(([seen, sums]) => {
          const allNames = [...new Set([...Object.keys(seen), ...Object.keys(sums)])];
          wrapper.setAttribute('data-cas-artifacts', allNames.join(' ').toLowerCase());
        });

        const row = document.createElement('div');
        row.style.cssText = [
          'display:flex', 'align-items:center', 'gap:5px',
          'padding:4px 6px', 'border-radius:3px', 'cursor:pointer',
          'border:1px solid transparent',
          chatId === currentChat ? 'border-color:#2a2e36;background:#13161b' : '',
        ].join(';');

        // In select mode: checkbox instead of dot
        const indicator = selectMode
          ? `<input type="checkbox" data-chat-id="${chatId}" style="cursor:pointer;accent-color:#f0c040;" ${selectedChatIds?.has(chatId) ? 'checked' : ''}>`
          : (chatId === currentChat ? '<span style="color:#f0c040">●</span>' : '<span style="color:#444">○</span>');

        const hasArtifacts = (meta.artifactCount || 0) > 0;
        const expandIcon = hasArtifacts ? '<span class="cas-expand-icon" style="color:#aaa;font-size:9px;flex-shrink:0">▶</span>' : '';
        // Check if this specific chat has a summary globally
        const hasChatSummary = !!(allData[chatSumMapKey]?.topics?.length > 0);

        const summaryBtnHtml = hasChatSummary
          ? `<span class="cas-project-summary-btn" data-chat-id="${chatId}" data-chat-name="${meta.name.replace(/"/g, '&quot;')}" data-sum-key="${chatSumMapKey}" style="color:#f0c040;font-size:12px;cursor:pointer;padding:0 4px;margin-right:2px;" title="View Chat Summary">⌬</span>`
          : '';

        row.innerHTML = `
          ${indicator}
          ${summaryBtnHtml}
          <span style="flex:1;font-size:10px;color:#f5f5f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${meta.name}">${meta.name}</span>
          <span style="font-size:9px;color:#aaa;flex-shrink:0">${meta.artifactCount || 0} ⬡</span>
          <span style="font-size:9px;color:#888;flex-shrink:0">${meta.lastSeen || ''}</span>
          <a href="https://claude.ai/chat/${chatId}" target="_blank" rel="noopener" title="Open in new tab" style="color:#fff;font-size:11px;flex-shrink:0;text-decoration:none;padding:0 2px;line-height:1" onclick="event.stopPropagation()">↗</a>
          ${expandIcon}
        `;

        // Wire Summary View button
        const summaryBtn = row.querySelector('.cas-project-summary-btn');
        if (summaryBtn) {
          summaryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.casOpenFlyoutForChat(
              summaryBtn.getAttribute('data-chat-id'),
              summaryBtn.getAttribute('data-chat-name'),
              summaryBtn.getAttribute('data-sum-key')
            );
          });
        }

        // Wire checkbox in select mode
        if (selectMode && selectedChatIds) {
          const cb = row.querySelector('input[type="checkbox"]');
          cb?.addEventListener('change', (e) => {
            e.stopPropagation();
            if (e.target.checked) selectedChatIds.add(chatId);
            else selectedChatIds.delete(chatId);
          });
        }

        // Artifact sub-list (lazy rendered on expand)
        const artifactList = document.createElement('div');
        artifactList.style.cssText = 'display:none;padding:0 6px 4px 18px';
        let expanded = false;

        row.addEventListener('click', async (e) => {
          // In select mode, don't expand — let checkbox handle it
          if (selectMode) return;
          if (e.target.tagName === 'A') return;

          if (hasArtifacts) {
            expanded = !expanded;
            artifactList.style.display = expanded ? 'block' : 'none';
            const icon = row.querySelector('.cas-expand-icon');
            if (icon) icon.textContent = expanded ? '▼' : '▶';

            if (expanded && artifactList.children.length === 0) {
              const [sums, seen, chatSummaryData] = await Promise.all([
                new Promise(r => chrome.storage.local.get(chatSumKey, d => r(d[chatSumKey] || {}))),
                new Promise(r => chrome.storage.local.get(chatSeenKey, d => r(d[chatSeenKey] || {}))),
                new Promise(r => chrome.storage.local.get(chatSumMapKey, d => r(d[chatSumMapKey] || null))),
              ]);

              // Show chat summary if we have one
              if (chatSummaryData?.topics?.length > 0) {
                const sumBlock = document.createElement('div');
                sumBlock.style.cssText = 'margin-bottom:6px;padding:5px 6px;background:rgba(240,192,64,0.06);border-left:2px solid #f0c040;border-radius:0 3px 3px 0';
                sumBlock.innerHTML = `
                  <details open>
                    <summary class="cas-animated-arrow" style="font-size:8px;color:#f0c040;letter-spacing:0.06em;margin-bottom:3px;cursor:pointer;outline:none;user-select:none;">CHAT SUMMARY</summary>
                    <div style="margin-top:4px;">
                    ${chatSummaryData.topics.map(t => `
                      <details style="margin-bottom:4px">
                        <summary class="cas-animated-arrow" style="font-size:9px;color:#e0e0e0;font-weight:600;cursor:pointer;outline:none;user-select:none;">${t.name}</summary>
                        <div style="font-size:8px;color:#aaa;line-height:1.4;padding-left:12px;margin-top:4px;">
                          ${t.summary}
                          ${(t.aspects || []).map(a => `
                            <div style="margin-top:4px;">
                              <span style="font-size:8px;color:#888">└ ${a.name}: </span>
                              <span style="font-size:8px;color:#999">${a.summary}</span>
                            </div>`).join('')}
                        </div>
                      </details>`).join('')}
                    </div>
                  </details>`;
                artifactList.appendChild(sumBlock);
              }

              // Artifact list
              const allNames = [...new Set([...Object.keys(seen), ...Object.keys(sums)])];
              if (allNames.length === 0) {
                const empty = document.createElement('div');
                empty.style.cssText = 'color:#999;font-size:9px;padding:3px 0';
                empty.textContent = 'No artifact data — visit chat to record';
                artifactList.appendChild(empty);
              } else {
                allNames.forEach(name => {
                  const aRow = document.createElement('div');
                  aRow.style.cssText = 'padding:3px 0;border-top:1px solid #1a1d22';
                  const summary = sums[name] || '';
                  const ts = seen[name] || '';
                  aRow.innerHTML = `
                    <div style="display:flex;gap:4px;align-items:center">
                      <span style="color:${summary ? '#6bcf6b' : '#444'};font-size:9px">⬡</span>
                      <span style="font-size:9px;color:#f5f5f5;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name.slice(0, 30)}</span>
                      ${ts ? `<span style="font-size:8px;color:#888">${ts}</span>` : ''}
                    </div>
                    ${summary ? `<div style="font-size:8px;color:#aaa;padding-top:2px;line-height:1.3">${summary}</div>` : ''}
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

  async function renderChatSummaries(searchQuery = '') {
    const elMain = document.getElementById('cas-current-chat-summary');
    const elFlyout = document.getElementById('cas-flyout-chat-summary');
    if (!elMain && !elFlyout) return;

    const buildHtml = (data, titleLabel, filterQuery = '') => {
      if (!data?.topics?.length) return '';

      const filtered = data.topics.filter(t => {
        if (!filterQuery) return true;
        const q = filterQuery.toLowerCase();
        return t.name.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q);
      });

      if (filtered.length === 0 && filterQuery) {
        return `<div style="padding:20px;text-align:center;color:#666;font-size:10px;">No topics match "${filterQuery}"</div>`;
      }

      return `
        <details open>
          <summary class="cas-animated-arrow" style="font-size:8px;color:hsl(var(--cas-gold));letter-spacing:0.06em;margin-bottom:3px;cursor:pointer;outline:none;user-select:none;">${titleLabel}</summary>
          <div style="margin-top:4px;">
          ${filtered.map(t => `
            <details style="margin-bottom:4px">
              <summary class="cas-animated-arrow" style="font-size:9px;color:#e0e0e0;font-weight:600;cursor:pointer;outline:none;user-select:none;">${t.name}</summary>
              <div style="font-size:8px;color:#aaa;line-height:1.4;padding-left:12px;margin-top:4px;">
                ${t.summary}
                ${(t.aspects || []).map(a => `
                  <div style="margin-top:4px;">
                    <span style="font-size:8px;color:#888">└ ${a.name}: </span>
                    <span style="font-size:8px;color:#999">${a.summary}</span>
                  </div>`).join('')}
              </div>
            </details>`).join('')}
          </div>
        </details>`;
    };

    // 1. Current Chat (Main Panel)
    if (elMain) {
      const chatSumKey = storageKey('cas_chat_summary');
      const mainData = await new Promise(r => chrome.storage.local.get(chatSumKey, d => r(d[chatSumKey] || null)));
      const html = buildHtml(mainData, 'CURRENT CHAT SUMMARY');

      if (html) {
        elMain.style.display = 'block';
        elMain.style.cssText = 'margin-bottom:6px;padding:5px 6px;background:rgba(240,192,64,0.06);border-left:2px solid hsl(var(--cas-gold));border-radius:0 3px 3px 0';
        elMain.innerHTML = html;
      } else {
        elMain.style.display = 'none';
        elMain.innerHTML = '';
      }
    }

    // 2. Flyout (Universal)
    if (elFlyout) {
      const sumKey = activeFlyoutSumKey || storageKey('cas_chat_summary');
      const flyoutData = await new Promise(r => chrome.storage.local.get(sumKey, d => r(d[sumKey] || null)));

      const isExternal = activeFlyoutChatId !== null && activeFlyoutChatId !== getChatId();
      const titleLabel = isExternal ? 'PROJECT CHAT SUMMARY' : 'CURRENT CHAT SUMMARY';
      const html = buildHtml(flyoutData, titleLabel, searchQuery);

      if (html) {
        elFlyout.style.display = 'block';
        // Remove background for flyout to keep it cleaner
        elFlyout.style.background = 'none';
        elFlyout.innerHTML = html;
      } else {
        elFlyout.innerHTML = `<div style="padding:40px 10px;text-align:center;color:#666;font-size:10px;">${isExternal ? 'No summary found.' : 'No summary for current chat yet.'}</div>`;
      }

      // Flyout UX restrictions when viewing external chats
      const flyoutRefocusBtn = document.getElementById('cas-flyout-refocus');
      const flyoutActionRow = document.getElementById('cas-flyout-action-row');
      const summaryExists = !!(flyoutData?.topics?.length > 0);

      if (isExternal) {
        if (flyoutRefocusBtn) flyoutRefocusBtn.style.display = 'block';
        if (flyoutActionRow) flyoutActionRow.style.display = 'none';
      } else {
        if (flyoutRefocusBtn) flyoutRefocusBtn.style.display = 'none';
        // Hide action row if summary already exists for the current chat, as requested
        if (flyoutActionRow) flyoutActionRow.style.display = 'flex';
      }
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
      upload: { label: 'Uploads', color: '#6b9bcf', icon: '↑' },
      generated: { label: 'Generated', color: '#6bcf6b', icon: '⬡' },
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
            row.style.position = 'relative';

            const badge = data.type
              ? `<span class="cas-badge cas-type-${data.type.toLowerCase()}">${data.type}</span>`
              : '<span class="cas-badge cas-type-unknown">?</span>';
            const ts = seen[data.name] || '';
            const summary = summaries[data.name] || '';

            // ◈ NAVIGATION UI
            row.innerHTML = `
            <div style="display:flex;align-items:center;gap:5px;width:100%">
              <span class="cas-index">${i + 1}</span>

              ${badge}
              <span class="cas-name" title="Double-click to open • Single-click to find\n${data.name || ''}" style="flex:1; cursor:pointer;">${(data.name || 'unknown').slice(0, 24)}</span>
              ${ts ? `<span class="cas-meta">${ts}</span>` : ''}
              <button class="cas-jump-btn" title="Jump to point in chat" style="background:none;border:none;color:#fff;cursor:pointer;font-size:12px;padding:0 4px;margin-left:auto;transition:color 0.2s;text-shadow:0 0 2px rgba(255,255,255,0.3)">⟢</button>
            </div>
            ${summary ? `<div style="font-size:9px;color:#666;padding:2px 0 0 20px;line-height:1.3">${summary}</div>` : ''}
          `;

            // Single click: highlights and scrolls
            row.addEventListener('click', (e) => {
              if (e.target.closest('.cas-jump-btn')) return;
              highlightNode(item.node, item.isSidebar ? 'sidebar' : 'chat');
            });

            // Double click: Opens the artifact in the sidebar
            row.addEventListener('dblclick', (e) => {
              if (e.target.closest('.cas-jump-btn')) return;
              if (item.node) item.node.click();
            });

            // Clicking the Jump button specifically scrolls to chat flow
            row.querySelector('.cas-jump-btn').addEventListener('click', (e) => {
              e.stopPropagation();
              jumpToArtifact(data.name);
            });

            list.appendChild(row);
          });
        }
      });
    });
  }

  function highlightNode(node, context = 'sidebar') {
    if (!node) return;
    // Scroll node into view and flash it
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const prev = node.style.outline;
    const prevBg = node.style.backgroundColor;
    const prevTransition = node.style.transition;

    node.style.transition = 'background 0.3s, outline 0.3s';
    node.style.outline = '2px solid #f0c040';
    node.style.backgroundColor = context === 'sidebar' ? 'rgba(240,192,64,0.18)' : 'rgba(240,192,64,0.1)';

    setTimeout(() => {
      node.style.outline = prev;
      node.style.backgroundColor = prevBg;
      setTimeout(() => {
        node.style.transition = prevTransition;
      }, 500);
    }, 1800);
  }

  // ─── Styles ───────────────────────────────────────────────────────────────

  function injectStyles() {
    if (document.getElementById('cas-styles')) return;
    const s = document.createElement('style');
    s.id = 'cas-styles';
    s.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');

      :root {
        --cas-gold: 44, 87%, 60%;
        --cas-bg-raw: 216, 16%, 6%;
        --cas-border: rgba(255, 255, 255, 0.08);
        --cas-accent-glow: hsla(var(--cas-gold), 0.3);
      }

      #cas-panel {
        position: fixed;
        top: 80px;
        right: 16px;
        width: 360px;
        height: 500px;
        min-height: 40px; 
        max-height: calc(100vh - 100px);
        resize: both;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        z-index: 999999;
        background: hsl(var(--cas-bg-raw));
        border: 1px solid var(--cas-border);
        border-radius: 8px;
        box-shadow: 0 12px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.02);
        font-family: 'IBM Plex Mono', 'Courier New', monospace;
        font-size: 11px;
        color: #c8cdd6;
        user-select: none;
      }

      #cas-flyout-panel {
        position: fixed;
        right: 20px;
        top: 60px;
        width: 440px;
        height: auto;
        min-width: 350px;
        min-height: 100px;
        z-index: 1000000;
        background: hsla(var(--cas-bg-raw), 0.98);
        backdrop-filter: blur(12px);
        border: 1px solid var(--cas-border);
        border-radius: 10px;
        box-shadow: 0 16px 56px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.03);
        font-family: 'IBM Plex Mono', 'Courier New', monospace;
        font-size: 11px;
        color: #c8cdd6;
        user-select: none;
        display: none;
        flex-direction: column;
        max-height: 85vh;
        resize: both;
        overflow: hidden;
      }

      .cas-flyout-body {
        padding: 10px;
        flex: 1;
        overflow-y: auto;
        min-height: 0;
      }

      .cas-flyout-body::-webkit-scrollbar, 
      #cas-list::-webkit-scrollbar, 
      #cas-project-list::-webkit-scrollbar,
      #cas-tab-settings::-webkit-scrollbar,
      #cas-tab-chat::-webkit-scrollbar,
      #cas-paste-json::-webkit-scrollbar,
      #cas-body::-webkit-scrollbar {
        width: 8px;
      }
      .cas-flyout-body::-webkit-scrollbar-track, 
      #cas-list::-webkit-scrollbar-track, 
      #cas-project-list::-webkit-scrollbar-track,
      #cas-tab-settings::-webkit-scrollbar-track,
      #cas-tab-chat::-webkit-scrollbar-track,
      #cas-paste-json::-webkit-scrollbar-track,
      #cas-body::-webkit-scrollbar-track {
        background: transparent;
      }
      .cas-flyout-body::-webkit-scrollbar-thumb, 
      #cas-list::-webkit-scrollbar-thumb, 
      #cas-project-list::-webkit-scrollbar-thumb,
      #cas-tab-settings::-webkit-scrollbar-thumb,
      #cas-tab-chat::-webkit-scrollbar-thumb,
      #cas-paste-json::-webkit-scrollbar-thumb,
      #cas-body::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.25);
        border: 2px solid transparent;
        background-clip: padding-box;
        border-radius: 10px;
      }
      .cas-flyout-body::-webkit-scrollbar-thumb:hover, 
      #cas-list::-webkit-scrollbar-thumb:hover, 
      #cas-tab-chat::-webkit-scrollbar-thumb:hover,
      #cas-body::-webkit-scrollbar-thumb:hover {
        background: rgba(240, 192, 64, 0.4);
        background-clip: padding-box;
      }

      #cas-header, #cas-flyout-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 10px;
        background: #13161b;
        border-bottom: 1px solid #2a2e36;
        border-radius: 6px 6px 0 0;
        cursor: grab;
        flex-shrink: 0;
      }

      #cas-header:active, #cas-flyout-header:active { cursor: grabbing; }

      #cas-title {
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.12em;
        color: hsl(var(--cas-gold));
        text-shadow: 0 0 10px var(--cas-accent-glow);
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

      #cas-body {
        padding: 10px;
        flex: 1;
        overflow-y: auto;
        min-height: 0;
        display: flex;
        flex-direction: column;
      }

      #cas-sort-row {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 8px;
        flex-shrink: 0;
      }

      #cas-sort-row label {
        color: #aaa;
        font-size: 10px;
        white-space: nowrap;
        letter-spacing: 0.06em;
      }

      #cas-status {
        font-size: 10px;
        color: #999;
        margin-bottom: 8px;
        padding: 4px 6px;
        background: #0a0c0f;
        border-radius: 3px;
        border-left: 2px solid #2a2e36;
        letter-spacing: 0.04em;
        flex-shrink: 0;
      }

      #cas-list, #cas-project-list {
        flex: 1;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-height: 100px;
      }

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
        color: #aaa;
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
        color: #f5f5f5;
        letter-spacing: 0.02em;
      }

      .cas-meta {
        font-size: 9px;
        color: #888;
        white-space: nowrap;
        flex-shrink: 0;
      }

      #cas-data-note {
        margin-top: 8px;
        padding: 6px 8px;
        background: #0a0c0f;
        border-radius: 3px;
        border-left: 2px solid #2a2e36;
        font-size: 9.5px;
        color: #999;
        line-height: 1.5;
        flex-shrink: 0;
      }

      #cas-tabs {
        display: flex;
        gap: 2px;
        margin-bottom: 8px;
        border-bottom: 1px solid #1e2228;
        padding-bottom: 6px;
        flex-shrink: 0;
      }

      .cas-tab {
        background: none;
        border: 1px solid #2a2e36;
        color: #888;
        padding: 3px 10px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        cursor: pointer;
        transition: color 0.15s, border-color 0.15s;
        letter-spacing: 0.05em;
      }
      .cas-premium-btn {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #aaa;
        font-family: 'IBM Plex Mono', 'Courier New', monospace;
        font-size: 9.5px;
        font-weight: 500;
        padding: 4px 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .cas-premium-btn:hover {
        background: rgba(240, 192, 64, 0.08);
        border-color: rgba(240, 192, 64, 0.3);
        color: #fff;
        box-shadow: 0 0 12px rgba(240, 192, 64, 0.1);
      }

      .cas-section-details {
        margin-bottom: 6px;
      }
      .cas-animated-arrow {
        list-style: none;
      }
      .cas-animated-arrow::-webkit-details-marker {
        display: none;
      }
      .cas-animated-arrow::before {
        content: '▶';
        display: inline-block;
        margin-right: 6px;
        color: #f0c040;
        font-size: 8px;
        transition: transform 0.2s ease;
      }
      details[open] > .cas-animated-arrow::before {
        transform: rotate(90deg);
      }

      .cas-section-label {
        color: #f0c040;
        font-size: 9px;
        letter-spacing: 0.1em;
        text-transform: uppercase;
        margin: 6px 0;
        padding-bottom: 4px;
        border-bottom: 1px dashed #2a2e36;
        cursor: pointer;
        display: block;
        outline: none;
      }

      #cas-mini-select, .cas-mini-select {
        background: #13161b;
        border: 1px solid #2a2e36;
        color: #c8cdd6;
        padding: 4px 5px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        outline: none;
      }

      #cas-summary-row {
        display: flex;
        flex-direction: column;
        gap: 0;
        margin-bottom: 8px;
        padding: 7px 8px;
        background: #0a0c0f;
        border-radius: 3px;
        border: 1px solid #1e2228;
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

      #cas-flyout-search {
        width: 100%;
        box-sizing: border-box;
        background: rgba(0,0,0,0.2);
        border: 1px solid rgba(255,255,255,0.05);
        color: #fff;
        border-radius: 6px;
        font-family: inherit;
        font-size: 11px;
        padding: 8px 10px;
        outline: none;
        transition: border-color 0.2s, background 0.2s;
      }
      #cas-flyout-search:focus {
        border-color: rgba(240,192,64,0.3);
        background: rgba(0,0,0,0.4);
      }

      #cas-flyout-options {
        position: absolute;
        top: 38px;
        right: 10px;
        width: 320px;
        max-height: 400px;
        overflow-y: auto;
        background: #1a1d22;
        border: 1px solid #2a2e36;
        border-radius: 8px;
        box-shadow: 0 16px 48px rgba(0,0,0,0.8);
        z-index: 1000001;
        padding: 12px;
        display: none;
        flex-direction: column;
      }

      #cas-sum-copy, #cas-chat-sum-copy {
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
      #cas-sum-copy:hover, #cas-chat-sum-copy:hover { color: #f0c040; border-color: #f0c040; }

      #cas-summarise, #cas-chat-summarise {
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
      #cas-summarise:hover, #cas-chat-summarise:hover { opacity: 0.85; }

      #cas-inject, #cas-chat-inject {
        flex: 1;
        background: none;
        border: 1px solid #2a2e36;
        color: #aaa;
        padding: 4px 8px;
        border-radius: 3px;
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: color 0.15s, border-color 0.15s;
      }
      #cas-inject:hover, #cas-chat-inject:hover { color: #f0c040; border-color: #f0c040; }

      #cas-paste-json {
        width: 100%;
        box-sizing: border-box;
        background: #0a0c0f;
        border: 1px solid #2a2e36;
        color: #aaa;
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
      #cas-paste-json::placeholder { color: #555; }
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
      // Ignore mutations if they are exclusively our own UI elements
      const isOnlyUs = mutations.every(m => {
        if (m.target?.id === 'cas-sidebar-bar' || m.target?.id === PANEL_ID || m.target?.id === 'cas-panel-toggle') return true;
        if (m.target?.classList?.contains('cas-summary-badge') || m.target?.classList?.contains('cas-injected-summary')) return true;
        let onlyOurNodes = true;
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1 && !(n.id === 'cas-sidebar-bar' || n.id === PANEL_ID || n.id === 'cas-panel-toggle' || n.classList?.contains('cas-summary-badge') || n.classList?.contains('cas-injected-summary'))) onlyOurNodes = false;
        });
        return (m.addedNodes.length > 0 || m.removedNodes.length > 0) ? onlyOurNodes : false;
      });

      if (isOnlyUs || reinjecting) return;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const generated = scanGenerated();
        const firstSeen = await storageGet('cas_first_seen');
        let changed = false;

        // Update First Seen timestamps
        generated.forEach(item => {
          const name = item.data.name;
          if (!name || knownNames.has(name)) return;
          knownNames.add(name);

          if (!firstSeen[name]) {
            const now = new Date();
            firstSeen[name] = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}`;
            changed = true;
            console.log('[CAS] New artifact detected:', name);
          }
        });

        if (changed) {
          await storageSet('cas_first_seen', firstSeen);
          // Visual cue on the toggle button if it exists
          const toggle = document.querySelector('.cas-global-toggle-btn');
          if (toggle) {
            toggle.style.borderColor = '#f0c040';
            toggle.style.color = '#f0c040';
            toggle.style.boxShadow = '0 0 8px rgba(240,192,64,0.4)';
            setTimeout(() => {
              toggle.style.borderColor = '#444';
              toggle.style.color = '#888';
              toggle.style.boxShadow = 'none';
            }, 3000);
          }
        }

        // Check if the physical artifact nodes have actually changed or appeared
        let layoutChanged = generated.length !== lastArtifactNodes.size;
        if (!layoutChanged) {
          for (let g of generated) {
            if (!lastArtifactNodes.has(g.node)) {
              layoutChanged = true; break;
            }
          }
        }

        // Auto-refresh the floating UI panel if open
        if (document.getElementById(PANEL_ID)) {
          const list = document.getElementById('cas-list');
          const status = document.getElementById('cas-status');
          const dataNote = document.getElementById('cas-data-note');
          const dataSummary = document.getElementById('cas-data-summary');
          if (list && layoutChanged) {
            console.log('[CAS] Layout changed; refreshing panel list...');
            const items = scanForFileList();
            renderList(items, list, status, dataNote, dataSummary);
          }
        }

        lastArtifactNodes = new Set(generated.map(g => g.node));
        obs.takeRecords();
        reinjecting = false;
        refreshSummariseBadge();
      }, 500);
    });

    obs.observe(container, { childList: true, subtree: true });

    // Robust Polling Sync (Guarantees the Sort Bar injects if sidebar is visible)
    // Sometimes React hydrates the DOM *after* the initial mutation event, causing the observer to miss it.
    const pollInterval = setInterval(() => {
      // 1. Inject Floating Panel Toggle Button next to native Claude controls
      // [data-testid="wiggle-controls-actions-toggle"] exists in the header area.
      // We also look for the sidebar toggle or the "New Chat" area if that fails.
      const nativeToggle = document.querySelector('[data-testid="wiggle-controls-actions-toggle"]')
        || document.querySelector('[aria-label="Side menu"]')
        || document.querySelector('button[class*="sidebar-toggle"]');

      if (nativeToggle && !document.getElementById('cas-panel-toggle-group')) {
        const anchor = nativeToggle.closest('div.flex') || nativeToggle.parentElement;
        if (anchor && anchor.tagName !== 'BODY') {
          const group = document.createElement('div');
          group.id = 'cas-panel-toggle-group';
          group.className = 'flex items-center gap-1 mr-2';
          group.innerHTML = `
              <button id="cas-panel-toggle-main" 
                      class="inline-flex items-center justify-center relative isolate shrink-0 can-focus select-none transition duration-200 h-8 w-8 rounded-md hover:bg-bg-500" 
                      title="Open Sorter Panel" 
                      style="color:#aaa; border:1px solid rgba(255,255,255,0.15); background:rgba(40,44,52,0.6); box-shadow: inset 0 1px 0 rgba(255,255,255,0.1); cursor:pointer;">
                ⬡
              </button>
              <button id="cas-panel-toggle-summary" 
                      class="inline-flex items-center justify-center relative isolate shrink-0 can-focus select-none transition duration-200 h-8 w-8 rounded-md hover:bg-bg-500" 
                      title="CAS Chat Summary" 
                      style="color:#aaa; border:1px solid rgba(255,255,255,0.15); background:rgba(40,44,52,0.6); box-shadow: inset 0 1px 0 rgba(255,255,255,0.1); cursor:pointer;">
                ⌬
              </button>
            `;

          // Wire Sorter Toggle
          group.querySelector('#cas-panel-toggle-main').addEventListener('click', () => {
            buildPanel();
            setTimeout(() => {
              const scanBtn = document.getElementById('cas-scan');
              if (scanBtn) scanBtn.click();
            }, 100);
          });

          // Wire Summary Toggle
          group.querySelector('#cas-panel-toggle-summary').addEventListener('click', () => {
            const flyout = document.getElementById('cas-flyout-panel');
            if (!flyout) { buildFlyout(); }
            const el = document.getElementById('cas-flyout-panel');
            if (el) {
              const isVisible = el.style.display !== 'none';
              if (!isVisible && activeFlyoutChatId !== null && activeFlyoutChatId !== getChatId()) {
                activeFlyoutChatId = null;
                activeFlyoutSumKey = null;
                renderChatSummaries();
              }
              el.style.display = isVisible ? 'none' : 'flex';
              group.querySelector('#cas-panel-toggle-summary').style.color = isVisible ? '#888' : '#f0c040';
              if (!isVisible) refreshFlyoutChatSelector();
            }
          });

          try {
            const parent = nativeToggle.parentElement?.parentElement;
            if (parent && parent.tagName !== 'BODY') {
              parent.insertBefore(group, nativeToggle.parentElement);
            }
          } catch (err) { /* retry next interval */ }
        }
      }

      if (reinjecting) return;
      const sidebar = findArtifactSidebar();

      // If the sidebar is visibly in the DOM, but our sort bar is entirely missing:
      if (sidebar && !document.getElementById('cas-sidebar-bar')) {
        reinjecting = true;
        scanForFileList(); // Forcibly re-inject it!
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
    injectStyles();
    const stored = await storageGet('cas_summaries');
    const generated = scanGenerated();

    const unsummarisedRaw = generated.filter(i =>
      i.source === 'generated' && i.data.name && !stored[i.data.name]
    );

    const seenNames = new Set();
    const unsummarised = unsummarisedRaw.filter(i => {
      if (seenNames.has(i.data.name)) return false;
      seenNames.add(i.data.name);
      return true;
    });

    const summaryRow = document.getElementById('cas-summary-row');
    if (summaryRow) {
      // Restore lifecycle: hide if no artifacts (or keep always visible if they insist on the modal but let's stick to simple first)
      summaryRow.style.display = 'block'; 
    }

    const bar = document.getElementById('cas-sidebar-bar');
    if (!bar) return;

    let toolbar = document.getElementById('cas-sidebar-toolbar');

    // Restoration: If no new items, remove the toolbar (auto-hide)
    if (unsummarised.length === 0) {
      if (toolbar) toolbar.remove();
      return;
    }

    if (!toolbar) {
      toolbar = document.createElement('div');
      toolbar.id = 'cas-sidebar-toolbar';
      toolbar.style.cssText = 'display:flex;gap:4px;align-items:center;margin-left:auto;';

      const sBtn = document.createElement('button');
      sBtn.id = 'cas-sidebar-sum-art';
      sBtn.className = 'cas-premium-btn';
      sBtn.style.cssText = 'padding:2px 7px; background:hsl(var(--cas-gold)); color:#0d0f12; border:none;';
      sBtn.onclick = (e) => { e.stopPropagation(); performSummarise(); };

      const iBtn = document.createElement('button');
      iBtn.textContent = '↓ INJECT';
      iBtn.className = 'cas-premium-btn';
      iBtn.style.cssText = 'padding:2px 7px;';
      iBtn.onclick = (e) => { e.stopPropagation(); performInjection(); };

      toolbar.appendChild(sBtn);
      toolbar.appendChild(iBtn);
      bar.appendChild(toolbar);
    }

    const sBtn = document.getElementById('cas-sidebar-sum-art');
    if (sBtn) {
      sBtn.textContent = `⬡ SUMMARISE (${unsummarised.length})`;
      sBtn.title = `Generate prompt for ${unsummarised.length} new artifacts`;
    }
  }

  // GAP 3: fills input WITHOUT auto-sending — user reviews before hitting send
  // GAP 4: badge transitions to "↓ Inject" state instead of disappearing
  // GAP 6: respects length selector if panel is open
  async function sendSummaryPromptToChat(items, badge) {
    const summaries = await storageGet('cas_summaries');

    // Safety check: ensure we are only asking for items that still need summaries
    const unsummarisedItems = items.filter(a => !summaries[a.data.name]);
    if (unsummarisedItems.length === 0) return;

    const sentences = document.getElementById('cas-sum-length')?.value || '1';
    const lenLabel = sentences === '1' ? '1 sentence' : sentences === '2' ? '2-3 sentences' : '5 sentences';
    const names = unsummarisedItems.map(a => a.data.name).join('\n');
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
        } catch (e) { /* silent */ }
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

        // 3. UI Synchronization for Summary Flyout
        await renderChatSummaries();
        refreshFlyoutChatSelector();
      }



      initNewChat();
    }

    // ─── Flyout & Sidebar UI logic moved up to Panel UI section ───

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
