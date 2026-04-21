// Claude Artifact Sorter — content.js
// Scans the Claude DOM for file/artifact nodes, extracts all available data,
// and exposes sort/reorder controls via injected panel.

(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────

  const PANEL_ID = 'cas-panel';
  const STORAGE_KEY = 'cas_sort_prefs';
  const SCAN_INTERVAL = 1200; // ms between rescans

  const PLATFORM = window.location.hostname.includes('gemini.google.com') ? 'gemini' : 'claude';

  const TAG_CATEGORIES = {
    'Logic': ['Logic', 'Mathematics', 'Computation', 'Maths', 'Order', 'Structured Order', 'Algorithms', 'Systems', 'Calculus', 'Algebra', 'Geometry', 'Statistics', 'Programming', 'Proofs', 'Axioms', 'Deduction', 'Framework', 'Hierarchy'],
    'Spirituality': ['Spirituality', 'Mysticism', 'Transcendence', 'Faith', 'Esotericism', 'Metaphysical', 'Occult', 'Meditation', 'Divinity', 'Enlightenment', 'Sacred', 'Etheric', 'Awakening', 'Karma'],
    'Religion': ['Religion', 'Theology', 'Doctrine', 'Charity', 'Dogma', 'Scripture', 'Ritual', 'Church', 'Temple', 'Creed', 'Orthodoxy', 'Worship', 'Priesthood', 'Canon', 'Denomination'],
    'Cognition': ['Cognition', 'Reason', 'Intellect', 'Intelligence', 'Hope', 'Thought', 'Awareness', 'Perception', 'Sentience', 'Rationality', 'Neurology', 'Neuroscience', 'Idea', 'Mental', 'Focus'],
    'Physics': ['Physics', 'Mechanics', 'Matter', 'Objectivity', 'Thermodynamics', 'Quantum', 'Relativity', 'Optics', 'Gravity', 'Energy', 'Kinetics', 'Particle', 'Forces', 'Dynamics', 'Astrophysics', 'Material'],
    'Metaphysics': ['Metaphysics', 'Ontology', 'Cosmology', 'Imagination', 'Existentialism', 'Phenomenon', 'Abstract', 'Aether', 'Reality-Theory', 'Void', 'First-Principles', 'Archetypes'],
    'Ethics': ['Ethics', 'Morality', 'Values', 'Emotional-physics', 'Temperance', 'Philosophy', 'Virtue', 'Deontology', 'Utilitarianism', 'Axiology', 'Righteousness', 'Code', 'Integrity', 'Moral-Compass', 'Dilemma'],
    'Knowledge': ['Knowledge', 'Epistemology', 'Education', 'Learning', 'Prudence', 'Information', 'Data', 'Wisdom', 'Scholarship', 'Academia', 'Pedagogy', 'Instruction', 'Curriculum', 'Study', 'Literacy'],
    'Society': ['Community', 'Civic', 'Public', 'Society', 'Social', 'Populace', 'Tribe', 'Village', 'Group', 'Collective', 'Fellowship', 'Network', 'Neighborhood', 'Cohort', 'Population'],
    'Sociology': ['Sociology', 'Culture', 'Anthropology', 'Empathy', 'Demographics', 'Ethnography', 'Social-Structures', 'Customs', 'Traditions', 'Human-Ecology', 'Interpersonal', 'Norms', 'Kinship'],
    'Conscience': ['Conscience', 'Judgment', 'Principles', 'Internal Judgment', 'Justice', 'Guilt', 'Inner-Voice', 'Fairness', 'Law', 'Jurisprudence', 'Equity', 'Conviction', 'Rectitude', 'Accountability'],
    'The World': ['Nature', 'Ecology', 'Environment', 'The World', 'Fortitude', 'Biology', 'Zoology', 'Botany', 'Biosphere', 'Earth', 'Ecosystem', 'Natural-World', 'Flora', 'Fauna', 'Wilderness', 'Geology', 'Climate'],
    'Psychology': ['Psychology', 'Mind', 'Behavior', 'Understanding', 'Psychiatry', 'Therapy', 'Bychoanalysis', 'Emotion', 'Trauma', 'Personality', 'Subconscious', 'Mental-Health', 'Affect', 'Neuroscience'],
    'Communication': ['Communication', 'Expression', 'Linguistics', 'Language', 'Connection', 'Discourse', 'Dialogue', 'Semantics', 'Syntax', 'Rhetoric', 'Media', 'Transmission', 'Interaction', 'Speech', 'Writing', 'Symbology'],
    'History': ['History', 'Chronology', 'Record', 'Context', 'Antiquity', 'Archives', 'Heritage', 'Past', 'Timeline', 'Archaeology', 'Paleontology', 'Genealogy', 'Epoch', 'Era', 'Annals', 'Historiography'],
    'Reality': ['Reality', 'Existence', 'Actuality', 'Truth', 'Fact', 'Objective-Truth', 'Present', 'Universe', 'Cosmos', 'Material-World', 'Being', 'Verity', 'Tangibility', 'Substantive']
  };

  const VFT_CATEGORY_DEFINITIONS = {
    'Logic': 'Generalizes the pure intersection of concept and order; acts as the foundational logic and fundamental framework for absolute rules, algorithms, and deductive systems.',
    'Spirituality': 'Generalizes the localization of faith and belief in the abstract; acts as the internal search for unseen meaning, mysticism, and connection to the transcendent.',
    'Religion': 'Generalizes the structural application of faith; acts as an applied structure of moral order and an external, organized, dogmatic framework encompassing theology, rituals, and institutional belief systems.',
    'Cognition': 'Generalizes the purpose and nature of sentience; acts as the anchor for mechanisms of thought, rationality, intellect, and the final synthesis of conviction in a positive, integrated truth.',
    'Physics': 'Generalizes the tangible mechanics of objects; acts as the acceptance of objective fact and the objective study of matter, energy, thermodynamics, and the observable universal laws.',
    'Metaphysics': 'Generalizes the spatial and operational abstraction of existence; acts as the disciplined exploration of possibility within the theoretical realm of ontology, first principles, cosmology, and the void beyond direct physical observation.',
    'Ethics': 'Generalizes the applied temperament of morality; acts as the physics of benefit dynamics, the applied rules of internal emotional mastery, the philosophical study of values, deontology, utilitarian ethics, and behavioral codes of conduct.',
    'Knowledge': 'Generalizes the purpose of applied prudence; acts as the process of subjective modeling and the accumulation of epistemology, education, empirical data, and scholarly wisdom.',
    'Society': 'Generalizes the objective manifestation of community; acts as an applied collective structure of civic organization, populaces, and cooperative networks.',
    'Sociology': 'Generalizes the spatial mapping of empathy and culture; acts as the disciplined understanding of the other\'s state and the analytical study of demographics, human ecology, traditions, and the forces binding social groups.',
    'Conscience': 'Generalizes the applied mechanics of justice; acts as the applied moral compass for internal and systemic judgment, equity, jurisprudence, and personal accountability.',
    'The World': 'Generalizes the purpose and locus of natural fortitude; acts as the sum of all objective facts to be faced and the culmination of observable reality on a base level, encompassing the biosphere and physical environment.',
    'Psychology': 'Generalizes the objective study of understanding; acts as the synthesis of self-knowledge through the empirical and therapeutic approach to the mind, behavior, trauma, and subconscious emotional states.',
    'Communication': 'Generalizes the localized connection of expression; acts as the synthesis of shared meaning and the interactive transmission of ideas, language, semantics, and media symbology.',
    'History': 'Generalizes the applied context of the past; acts as the grounded record of action and chronological preservation of antiquity, timelines, human heritage, and historiography.',
    'Reality': 'Generalizes the ultimate purpose of truth; acts as the final, grand synthesis in perfect, integrated alignment of absolute existence, fact, objective presence, and the substantive cosmos.'
  };

  function getTagColor(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash) % 360}, 65%, 60%)`;
  }

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
    // Search for the word "Artifacts" in any header or label
    const elements = document.querySelectorAll('h2, h3, h4, [aria-label*="Artifacts" i], [class*="Artifacts"]');
    for (const el of elements) {
      // SKIP the left navigation sidebar (global nav)
      if (el.closest('[data-testid="sidebar"]')) continue;
      // SKIP the global artifacts navigation link specifically
      if (el.getAttribute('href')?.includes('/artifacts/my') || el.closest('a[href*="/artifacts/my"]')) continue;

      if (/Artifacts/i.test(el.textContent) || /Artifacts/i.test(el.getAttribute('aria-label')) || el.classList.contains('Artifacts')) {
        // Find the nearest container that actually holds the list or the whole sidebar
        return el.closest('nav') 
          || el.closest('[class*="sidebar"]') 
          || el.closest('[class*="overflow"]') 
          || el.parentElement?.parentElement;
      }
    }

    // FALLBACK: Find a container with artifact icons inside a sidebar-like area
    const icon = document.querySelector('svg.lucide-file-text, svg.lucide-external-link, svg.lucide-download');
    if (icon) {
      const possibleSidebar = icon.closest('aside, [class*="sidebar"], [class*="overflow-y-auto"]');
      if (possibleSidebar && !possibleSidebar.closest('[data-testid="sidebar"]')) return possibleSidebar;
    }

    return null;
  }

  function scanGenerated() {
    // ◈ HYBRID RECOGNITION: Scan sidebar (modifiable) and chat flow (read-only).
    // NOTE: Claude no longer uses role="button" on artifact cards — they are plain
    // <button type="button"> elements. We match on aria-label only.
    const sidebarContainer = findArtifactSidebar();
    const allNodes = Array.from(document.querySelectorAll(
      '[class*="artifact-block"] button[aria-label^="View " i], ' +
      '[class*="artifact-block"] button[aria-label*="artifact" i], ' +
      'button[aria-label*="artifact" i]:not([aria-label*="options" i]):not([aria-label*="menu" i]), ' +
      'button:has(svg.lucide-external-link), button:has(svg.lucide-file-text)'
    ));

    return allNodes.map(node => {
      const isInSidebar = sidebarContainer && sidebarContainer.contains(node);
      return {
        node,
        source: 'generated',
        data: extractNodeData(node),
        isSidebar: isInSidebar
      };
    }).filter(i => i.data.name && !i.data.name.toLowerCase().includes('more options for'));
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
    // Try breadcrumb link first
    const link = document.querySelector('a[href*="/project/"]');
    if (link) return link.textContent.trim();
    // Fallback to project header if on project page
    if (window.location.href.includes('/project/')) {
      const h1 = document.querySelector('h1');
      if (h1) return h1.textContent.trim();
    }
    return 'Project';
  }

  function fmtNow() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')} ${now.getDate().toString().padStart(2, '0')}.${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  }

  // All per-chat data stored under proj_UUID/chat_UUID or chat_UUID
  function storageKey(key) {
    const proj = getProjectId();
    const chat = getChatId();
    return proj ? `proj_${proj}/chat_${chat}_${key}` : `chat_${chat}_${key}`;
  }

  function storageGet(key) {
    const k = storageKey(key);
    return new Promise(r => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return r({});
      }
      chrome.storage.local.get(k, d => r(d[k] || {}));
    });
  }
  function storageSet(key, val) {
    const k = storageKey(key);
    return new Promise(r => {
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        return r();
      }
      chrome.storage.local.set({ [k]: val }, r);
    });
  }

  // Record this chat into the project index
  async function registerChatInProject(items) {
    const proj = getProjectId();
    const indexKey = proj ? `proj_${proj}_chat_index` : 'cas_standalone_chat_index';
    const chatId = getChatId();
    const chatName = document.querySelector('[data-testid="chat-title-button"]')?.textContent?.trim() || chatId;
    const data = await new Promise(r => chrome.storage.local.get(indexKey, d => r(d[indexKey] || {})));
    data[chatId] = {
      name: chatName,
      projectId: proj || null,
      projectName: proj ? getProjectName() : '(Standalone)',
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
        seen[item.data.name] = fmtNow();
        changed = true;
      }
    });
    if (changed) await storageSet('cas_first_seen', seen);
    return seen;
  }


  async function interceptDownloadButtons() {
    const btns = document.querySelectorAll(
      'button[aria-label*="ownload" i], button[title*="ownload" i], ' +
      '[data-testid*="ownload" i], [class*="download" i] button, ' +
      'button:has(svg.lucide-download)'
    );
    btns.forEach(btn => {
      if (btn.dataset.casIntercept) return;
      btn.dataset.casIntercept = "1";
      btn.addEventListener('click', async () => {
        // Use the master name if we've already stamped it
        const block = btn.closest('[data-cas-name]');
        const rawName = block?.getAttribute('data-cas-name')
          || btn.closest('[class*="artifact-block"]')?.querySelector('[class*="font-medium"], [class*="leading-tight"], h3')?.textContent
          || 'unknown';

        const artifactName = cleanArtifactName(rawName);

        const dls = await storageGet('cas_downloads');
        if (!dls[artifactName]) dls[artifactName] = { count: 0 };
        dls[artifactName].count += 1;
        dls[artifactName].lastAt = fmtNow();
        await storageSet('cas_downloads', dls);

        const status = document.getElementById('cas-status');
        if (status) status.textContent = `✓ Downloaded: ${artifactName.slice(0, 20)}...`;

        buildPanel();
      });
    });
  }

  async function loadAndInjectMetadata(items) {
    const [summaries, dates, tagsMap, subTagsMap, dlsMap] = await Promise.all([
      storageGet('cas_summaries'),
      storageGet('cas_first_seen'),
      storageGet('cas_tags'),
      storageGet('cas_subtags'),
      storageGet('cas_downloads')
    ]);
    items.forEach(item => {
      const name = item.data.name;
      const s = summaries[name];
      const d = dates[name];
      const t = tagsMap[name];
      const sub = subTagsMap[name];
      const dl = dlsMap[name];
      // Stamp a data-cas-name on the artifact block so jumpToArtifact can find
      // chat-flow cards by name (chat buttons only have aria-label="A. Open artifact.",
      // not the full filename, so we can't match them via CSS selector otherwise).
      const block = item.node.closest('[class*="artifact-block"]') || item.node.parentElement;
      if (block && name) block.setAttribute('data-cas-name', name);
      // Summaries: sidebar only (avoid corrupting chat flow DOM)
      if (s && item.isSidebar) injectSummary(item.node, s);
      // Dates and tags: inject on all nodes (smaller, less intrusive)
      if (d) injectDate(item.node, d);
      if (t || sub) injectTags(item.node, t, sub);
      if (dl) injectDownload(item.node, dl);
    });
  }

  function injectSidebarSortBar(items) {
    if (!items || items.length === 0) return;

    // We must find the TRUE side-panel container, avoiding inline chat message containers.
    // 1. Priority check: Claude's side panel has an 'Artifacts' header above the list.
    // ◈ CHAT SPACE PROTECTION
    // We strictly identify the Sidebar using our findArtifactSidebar() helper.
    let listContainer = null;
    let header = null;
    const section = findArtifactSidebar();

    if (section) {
      // Find the "Artifacts" header specifically to use as an anchor
      const h = section.querySelector('h2, h3, h4, [aria-label*="Artifacts" i]');
      if (h) header = h.closest('div[class*="flex-shrink-0"]') || h.parentElement;

      // Find the list wrapper by looking at the parent of the first artifact block/icon
      const firstIcon = section.querySelector('svg.lucide-file-text, svg.lucide-external-link, svg.lucide-download');
      if (firstIcon) {
        const block = firstIcon.closest('[class*="artifact-block"]') || firstIcon.closest('button')?.parentElement;
        if (block) listContainer = block.parentElement;
      }

      // Fallback to legacy gap detection if no items are present yet
      if (!listContainer) {
        listContainer = section.querySelector('[class*="flex-col"][class*="gap-1"]') 
          || section.querySelector('[class*="flex-col"][class*="gap-2"]');
      }
    }

    if (!listContainer && !header) return;

    // If it's already properly mounted, avoid flickering
    const existingBar = document.getElementById('cas-sidebar-bar');
    if (existingBar && (listContainer?.contains(existingBar) || header?.nextElementSibling === existingBar)) {
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
      <button data-cas-sort="date-desc" style="${sidebarBtnStyle()}">Newer</button>
      <button data-cas-sort="date-asc"  style="${sidebarBtnStyle()}">Older</button>
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
      if (header) {
        header.insertAdjacentElement('afterend', bar);
      } else if (listContainer) {
        listContainer.insertBefore(bar, listContainer.firstChild);
      }
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
  function cleanArtifactName(name) {
    if (!name) return 'unknown';
    return name.trim()
      .replace(/^More options for\s+/i, '')
      .replace(/^View\s+/i, '')
      .replace(/^Open\s+/i, '')
      .replace(/^Download\s+/i, '')
      .replace(/\. Open artifact\.$/i, '')
      .replace(/\. View artifact\.$/i, '')
      .replace(/\. Download artifact\.$/i, '')
      .replace(/⬇️\s*\d+/u, '')
      .replace(/⬇\s*\d+/u, '')
      .replace(/\s+Download$/i, '')
      .trim();
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
    loadAndInjectMetadata(all);
    injectSidebarSortBar(all);
    registerChatInProject(all);
    interceptDownloadButtons();

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
      data.name = cleanArtifactName(data.ariaLabel);
    } else if (data.testId && (/\.\w{2,5}$/.test(data.testId.trim()) || data.testId.toLowerCase().includes('artifact'))) {
      data.name = cleanArtifactName(data.testId);
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
        if (titleEl) data.name = cleanArtifactName(titleEl.textContent.trim()) || null;
      }
      // Last resort: raw text content
      if (!data.name && data.rawText.length > 0 && data.rawText.length < 80) {
        data.name = cleanArtifactName(data.rawText);
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

  function sortItems(items, mode, seenMap = {}) {
    const sorted = [...items];
    switch (mode) {
      case 'name-asc':
        sorted.sort((a, b) => (a.data.name || '').localeCompare(b.data.name || ''));
        break;
      case 'name-desc':
        sorted.sort((a, b) => (b.data.name || '').localeCompare(a.data.name || ''));
        break;
      case 'date-desc':
      case 'date-asc':
        sorted.sort((a, b) => {
          const ta = seenMap[a.data.name] || '0';
          const tb = seenMap[b.data.name] || '0';
          return mode === 'date-desc' ? tb.localeCompare(ta) : ta.localeCompare(tb);
        });
        break;
      case 'dom-order':
        sorted.sort((a, b) => (a.origIndex || 0) - (b.origIndex || 0));
        break;
    }
    return sorted;
  }

  async function applySort(items, mode) {
    if (items.length < 2) return;

    const groups = { upload: [], generated: [], project: [], unknown: [] };
    items.forEach(item => groups[item.source || 'unknown'].push(item));

    const res = await storageGet('cas_first_seen');
    const seenMap = res || {};

    for (const [source, groupItems] of Object.entries(groups)) {
      if (source !== 'generated') continue;
      const sorted = sortItems(groupItems, mode, seenMap);

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
        <!-- ── Collapsable Controls ── -->
        <div id="cas-flyout-options" style="display:none; padding:12px; border-bottom:1px solid rgba(255,255,255,0.08); background:rgba(0,0,0,0.15);">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
            <span style="font-size:9px;color:hsl(var(--cas-gold));letter-spacing:0.1em;font-weight:600;">CONTROLS & NAVIGATION</span>
            <span id="cas-flyout-sum-status" style="font-size:9px;color:#888;display:none;"></span>
          </div>

          <div style="display:flex; flex-direction:column; gap:8px; margin-bottom:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; gap:10px;">
                <div style="display:flex;flex-direction:column;gap:3px;">
                  <label style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Topics</label>
                  <select id="cas-flyout-topic-lines" class="cas-mini-select" style="min-width:42px;"><option value="1">1</option><option value="2" selected>2</option><option value="5">5</option></select>
                </div>
                <div style="display:flex;flex-direction:column;gap:3px;">
                  <label style="font-size:8px;color:#555;text-transform:uppercase;letter-spacing:0.08em;font-weight:600;">Aspects</label>
                  <select id="cas-flyout-aspect-lines" class="cas-mini-select" style="min-width:42px;"><option value="1" selected>1</option><option value="2">2</option><option value="5">5</option></select>
                </div>
              </div>
              <button id="cas-flyout-sum-copy" class="cas-premium-btn" style="height:22px; padding:0 8px; font-size:9px;">⎘ COPY PROMPT</button>
            </div>
          </div>

          <div id="cas-flyout-action-row" style="display:flex;gap:6px;align-items:center;margin-bottom:10px;">
            <button id="cas-flyout-summarise" style="flex:1.5;background:hsl(var(--cas-gold));border:none;color:#0d0f12;border-radius:4px;padding:6px;cursor:pointer;font-weight:600;font-family:monospace;font-size:9px;transition:0.2s;">
              ↓ SUMMARISE
            </button>
            <button id="cas-flyout-inject" style="flex:1;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.1);color:#ccc;border-radius:4px;padding:6px;cursor:pointer;font-family:monospace;font-size:9px;transition:0.2s;">
              ↓ INJECT
            </button>
          </div>

          <div class="cas-section-box" style="margin-bottom:10px; padding:6px; background:rgba(0,0,0,0.2);">
            <textarea id="cas-flyout-paste-json" placeholder="Or paste JSON here to inject manually…" rows="2" 
              style="width:100%; box-sizing:border-box; background:#0a0c0f; border:1px solid #333; color:#aaa; font-size:9px; font-family:monospace; padding:4px; border-radius:3px; outline:none; resize:vertical;"></textarea>
          </div>

          <div style="display:flex;flex-direction:column;gap:4px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.05);">
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <span style="font-size:8px;color:#555;text-transform:uppercase;">Navigation</span>
              <button id="cas-flyout-refresh-selector" title="Refresh list" style="background:none;border:none;color:#555;cursor:pointer;font-size:10px;">↺</button>
            </div>
            <select id="cas-flyout-chat-selector" class="cas-mini-select" style="width:100%;">
              <option value="">Select chat summary...</option>
            </select>
          </div>
          
          <div id="cas-flyout-refocus" style="display:none;margin-top:10px;">
            <button id="cas-flyout-btn-refocus" style="width:100%;background:rgba(240,192,64,0.08);border:1px solid rgba(240,192,64,0.2);color:hsl(var(--cas-gold));border-radius:4px;padding:6px;cursor:pointer;font-family:monospace;font-size:9px;font-weight:600;">↶ Refocus to Current Chat</button>
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
        const target = document.getElementById('cas-flyout-toggle-options');
        target.style.color = isVisible ? '#888' : '#f0c040';
        target.style.borderColor = isVisible ? 'rgba(255,255,255,0.05)' : '#f0c040';
        if (!isVisible) refreshFlyoutChatSelector();
      }
    });

    document.addEventListener('click', (e) => {
      const panel = document.getElementById('cas-flyout-options');
      const toggle = document.getElementById('cas-flyout-toggle-options');
      if (panel && panel.style.display === 'block' && !panel.contains(e.target) && !toggle?.contains(e.target)) {
        panel.style.display = 'none';
        if (toggle) {
          toggle.style.color = '#888';
          toggle.style.borderColor = 'rgba(255,255,255,0.05)';
        }
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
      const pasteField = document.getElementById('cas-flyout-paste-json');
      const pasteText = (pasteField && pasteField.value) ? pasteField.value.trim() : '';
      let text = pasteText;

      if (!text) {
        const responses = document.querySelectorAll('[data-is-streaming="false"] .font-claude-response');
        if (responses.length === 0) {
          if (s) { s.textContent = '✗ No response found'; s.style.display = 'block'; }
          return;
        }
        text = responses[responses.length - 1].textContent.trim();
      }

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
        if (pasteField) pasteField.value = '';
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

    selector.innerHTML = '<option value="">Select project summary...</option>';

    const projectIndexKeys = Object.keys(allData).filter(k => k.startsWith('proj_') && k.endsWith('_chat_index'));
    const standaloneIndex = allData['cas_standalone_chat_index'] || {};
    const standaloneChats = Object.entries(standaloneIndex);

    if (projectIndexKeys.length === 0 && standaloneChats.length === 0) {
      selector.innerHTML = '<option value="">No recorded chats yet.</option>';
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

    // ── Standalone chats ────────────────────────────────────────────────
    const standaloneWithSums = standaloneChats.filter(([chatId, meta]) => {
      const sumKey = `chat_${chatId}_cas_chat_summary`;
      return allData[sumKey]?.topics?.length > 0;
    });
    if (standaloneWithSums.length > 0) {
      const optgroup = document.createElement('optgroup');
      optgroup.label = '◈ Standalone';
      optgroup.style.background = '#13161b';
      optgroup.style.color = '#8899cc';
      standaloneWithSums.sort((a, b) => (a[1].name || '').localeCompare(b[1].name || '')).forEach(([chatId, meta]) => {
        const sumKey = `chat_${chatId}_cas_chat_summary`;
        const opt = document.createElement('option');
        opt.value = chatId;
        opt.dataset.sumKey = sumKey;
        opt.dataset.chatName = meta.name || chatId;
        opt.textContent = (meta.name || chatId).slice(0, 50);
        if (chatId === activeFlyoutChatId) opt.selected = true;
        optgroup.appendChild(opt);
      });
      selector.appendChild(optgroup);
    }

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

  async function buildFloatingTagPicker(anchorEl, type = 'artifact') {
    const existing = document.getElementById('cas-floating-picker');
    if (existing) {
      if (existing.dataset.anchor === anchorEl.id) { existing.remove(); return; }
      existing.remove();
    }

    const picker = document.createElement('div');
    picker.id = 'cas-floating-picker';
    picker.dataset.anchor = anchorEl.id;

    const rect = anchorEl.getBoundingClientRect();
    picker.style.cssText = `
      position: fixed;
      top: ${rect.bottom + 8}px;
      right: ${window.innerWidth - rect.right}px;
      width: 280px;
      background: #1e222a;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 12px;
      z-index: 1000000;
      box-shadow: 0 8px 32px rgba(0,0,0,0.6);
      display: flex;
      flex-direction: column;
      gap: 10px;
      font-size: 11px;
      color: #eee;
    `;

    const title = document.createElement('div');
    title.style.cssText = 'color:#f0c040;font-weight:700;letter-spacing:0.05em;display:flex;justify-content:space-between;align-items:center;';
    title.innerHTML = `<div><span>⬡ TAGGING SYSTEM</span><div style="font-size:8px;color:#888;font-weight:400;margin-top:2px;">(Right-click to toggle category)</div></div><span id="cas-picker-close" style="cursor:pointer;opacity:0.6">✕</span>`;
    picker.appendChild(title);

    const freshItems = scanForFileList();
    const artifacts = freshItems.filter(i => i.source === 'generated');
    let targetId = type === 'chat' ? getChatId() : (artifacts[0]?.data.name || '');

    if (type === 'artifact' && artifacts.length > 1) {
      const select = document.createElement('select');
      select.style.cssText = 'width:100%;background:#0a0c0f;color:#fff;border:1px solid #333;padding:4px;border-radius:4px;';
      artifacts.forEach(a => {
        const opt = document.createElement('option');
        opt.value = opt.textContent = a.data.name;
        if (a.data.name === targetId) opt.selected = true;
        select.appendChild(opt);
      });
      select.onchange = () => { targetId = select.value; renderCategories(); };
      picker.appendChild(select);
    } else {
      const label = document.createElement('div');
      label.style.cssText = 'color:#888;font-style:italic;padding:2px 4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
      label.textContent = `Target: ${targetId}`;
      picker.appendChild(label);
    }

    // ── Global search (across all categories + subtags) ──────────────────
    const globalSearchWrap = document.createElement('div');
    globalSearchWrap.style.cssText = 'position:relative;';
    const globalInput = document.createElement('input');
    globalInput.placeholder = 'Search or create tag...';
    globalInput.style.cssText = 'width:100%;box-sizing:border-box;background:#0a0c0f;color:#fff;border:1px solid #333;padding:4px 6px;border-radius:4px;font-size:10px;outline:none;';
    const globalDrop = document.createElement('div');
    globalDrop.style.cssText = 'position:absolute;top:100%;left:0;right:0;background:#1e222a;border:1px solid #444;border-radius:4px;display:none;flex-direction:column;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-size:10px;max-height:160px;overflow-y:auto;';
    globalSearchWrap.appendChild(globalInput);
    globalSearchWrap.appendChild(globalDrop);
    picker.appendChild(globalSearchWrap);

    globalInput.oninput = () => {
      const val = globalInput.value.toLowerCase().trim();
      if (!val) { globalDrop.style.display = 'none'; return; }
      globalDrop.innerHTML = '';
      // Search major tag names + all subtags
      const results = [];
      Object.entries(TAG_CATEGORIES).forEach(([cat, subs]) => {
        if (cat.toLowerCase().includes(val)) results.push({ label: cat, cat, sub: null });
        subs.forEach(s => { if (s.toLowerCase().includes(val)) results.push({ label: `${cat} › ${s}`, cat, sub: s }); });
      });
      // Create option if no exact match
      const exactExists = results.some(r => (r.sub || r.cat).toLowerCase() === val);
      results.slice(0, 8).forEach(r => {
        const opt = document.createElement('div');
        opt.style.cssText = 'padding:5px 8px;cursor:pointer;border-bottom:1px solid #222;';
        opt.textContent = r.label;
        opt.onmousedown = async () => {
          globalDrop.style.display = 'none';
          globalInput.value = '';
          const catData = await storageGet(catStorageKey);
          const activeCats = new Set(catData[targetId] || []);
          if (r.sub) {
            // Add subtag under its category
            const subData = await storageGet(subStorageKey);
            const current = subData[targetId] || {};
            const catSubs = new Set(current[r.cat] || []);
            catSubs.add(r.sub);
            current[r.cat] = Array.from(catSubs);
            subData[targetId] = current;
            await storageSet(subStorageKey, subData);
            activeCats.add(r.cat);
          } else {
            // Toggle major category
            if (activeCats.has(r.cat)) activeCats.delete(r.cat); else activeCats.add(r.cat);
          }
          catData[targetId] = Array.from(activeCats);
          await storageSet(catStorageKey, catData);
          renderCategories();
          if (r.sub || activeCat === r.cat) renderSubTags();
        };
        globalDrop.appendChild(opt);
      });
      if (!exactExists) {
        const create = document.createElement('div');
        create.style.cssText = 'padding:5px 8px;cursor:pointer;color:#f0c040;background:rgba(240,192,64,0.05);';
        create.textContent = `＋ Create "${globalInput.value}" under selected category`;
        create.onmousedown = async () => {
          if (!activeCat) return;
          const tag = globalInput.value.trim();
          globalDrop.style.display = 'none';
          globalInput.value = '';
          const subData = await storageGet(subStorageKey);
          const current = subData[targetId] || {};
          const catSubs = new Set(current[activeCat] || []);
          catSubs.add(tag);
          current[activeCat] = Array.from(catSubs);
          subData[targetId] = current;
          await storageSet(subStorageKey, subData);
          if (!TAG_CATEGORIES[activeCat].includes(tag)) TAG_CATEGORIES[activeCat].push(tag);
          const catData = await storageGet(catStorageKey);
          const activeCats = new Set(catData[targetId] || []);
          activeCats.add(activeCat);
          catData[targetId] = Array.from(activeCats);
          await storageSet(catStorageKey, catData);
          renderCategories();
          renderSubTags();
          buildPanel(scanForFileList());
        };
        globalDrop.appendChild(create);
      }
      globalDrop.style.display = globalDrop.children.length ? 'flex' : 'none';
    };

    const catGrid = document.createElement('div');
    catGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px;';
    picker.appendChild(catGrid);

    const subTagPanel = document.createElement('div');
    subTagPanel.id = 'cas-subtag-panel';
    subTagPanel.style.cssText = 'display:none; flex-direction:column; gap:8px; padding-top:8px; border-top:1px solid #333;';
    picker.appendChild(subTagPanel);

    let activeCat = null;
    const catStorageKey = type === 'chat' ? 'cas_chat_tags' : 'cas_tags';
    const subStorageKey = type === 'chat' ? 'cas_chat_subtags' : 'cas_subtags';
    const customKey = 'cas_custom_tags';

    async function renderCategories() {
      const catData = await storageGet(catStorageKey);
      const activeCats = new Set(catData[targetId] || []);
      catGrid.innerHTML = '';

      Object.keys(TAG_CATEGORIES).forEach(cat => {
        const isAct = activeCats.has(cat);
        const color = getTagColor(cat);
        const btn = document.createElement('div');
        btn.style.cssText = `
          padding: 6px; border-radius:4px; cursor:pointer; font-weight:600; text-align:center;
          border: 1px solid ${isAct ? color : '#333'};
          background: ${isAct ? color + '20' : '#13161b'};
          color: ${isAct ? color : '#888'};
          transition: 0.2s; font-size: 10px;
          ${activeCat === cat ? `box-shadow: 0 0 8px ${color}40; border-color:${color};` : ''}
        `;
        btn.textContent = cat;
        btn.onclick = async () => {
          activeCat = (activeCat === cat) ? null : cat;
          renderCategories();
          renderSubTags();
        };
        btn.onmousedown = async (e) => {
          if (e.altKey) {
            e.preventDefault();
            if (activeCats.has(cat)) activeCats.delete(cat); else activeCats.add(cat);
            catData[targetId] = Array.from(activeCats);
            await storageSet(catStorageKey, catData);
            renderCategories();
            buildPanel(scanForFileList());
          }
        };
        btn.oncontextmenu = async (e) => {
          e.preventDefault();
          if (activeCats.has(cat)) activeCats.delete(cat); else activeCats.add(cat);
          catData[targetId] = Array.from(activeCats);
          await storageSet(catStorageKey, catData);
          renderCategories();
          buildPanel(scanForFileList());
        };
        catGrid.appendChild(btn);
      });
    }

    async function renderSubTags() {
      if (!activeCat) {
        subTagPanel.style.display = 'none';
        return;
      }
      subTagPanel.style.display = 'flex';
      subTagPanel.innerHTML = '';

      const [subData, customRes] = await Promise.all([
        storageGet(subStorageKey),
        new Promise(r => chrome.storage.local.get(customKey, d => r(d[customKey] || {})))
      ]);

      const activeSubTags = new Set((subData[targetId] || {})[activeCat] || []);
      const presets = TAG_CATEGORIES[activeCat] || [];
      const customs = customRes[activeCat] || [];
      const color = getTagColor(activeCat);

      const head = document.createElement('div');
      head.style.cssText = `font-size:9px; color:${color}; font-weight:700; text-transform:uppercase; letter-spacing:0.05em; display:flex; justify-content:space-between;`;
      head.innerHTML = `<span>${activeCat}</span><span style="opacity:0.5; font-weight:400;">(SELECT SUB-TAGS)</span>`;
      subTagPanel.appendChild(head);

      const chips = document.createElement('div');
      chips.style.cssText = 'display:flex; flex-wrap:wrap; gap:4px; max-height:100px; overflow-y:auto; padding:2px;';

      // Global sub-tag smoothing: Fetch all sub-tags across all categories for autocomplete
      const allSubData = await new Promise(r => chrome.storage.local.get(null, d => {
        const res = {};
        Object.keys(d).forEach(k => { if (k.endsWith('_cas_subtags')) Object.assign(res, d[k]); });
        r(res);
      }));
      // Flatten all existing sub-tags across all files and categories
      const globalCustoms = new Set();
      Object.values(allSubData).forEach(fileObj => {
        Object.values(fileObj).forEach(tagList => {
          tagList.forEach(t => globalCustoms.add(t));
        });
      });
      // Also include current custom library
      const libRes = await new Promise(r => chrome.storage.local.get(customKey, d => r(d[customKey] || {})));
      Object.values(libRes).forEach(list => list.forEach(t => globalCustoms.add(t)));

      const allPossible = [...new Set([...presets, ...customs, ...activeSubTags, ...globalCustoms])];
      allPossible.forEach(tag => {
        const isAct = activeSubTags.has(tag);
        const chip = document.createElement('div');
        chip.style.cssText = `
          padding:2px 6px; border-radius:3px; font-size:9px; cursor:pointer;
          border: 1px solid ${isAct ? color : '#333'};
          background: ${isAct ? color + (isAct ? '30' : '10') : '#0a0c0f'};
          color: ${isAct ? color : '#666'};
          transition: 0.1s;
        `;
        chip.textContent = tag;
        chip.onclick = async () => {
          const current = subData[targetId] || {};
          const catSubs = new Set(current[activeCat] || []);
          if (catSubs.has(tag)) catSubs.delete(tag); else catSubs.add(tag);
          current[activeCat] = Array.from(catSubs);
          subData[targetId] = current;
          await storageSet(subStorageKey, subData);

          const catData = await storageGet(catStorageKey);
          const activeCats = new Set(catData[targetId] || []);
          if (catSubs.size > 0 && !activeCats.has(activeCat)) {
            activeCats.add(activeCat);
            catData[targetId] = Array.from(activeCats);
            await storageSet(catStorageKey, catData);
            renderCategories();
          }
          renderSubTags();
          buildPanel(scanForFileList());
        };
        chips.appendChild(chip);
      });
      subTagPanel.appendChild(chips);

      const inputWrap = document.createElement('div');
      inputWrap.style.cssText = 'position:relative;';
      const input = document.createElement('input');
      input.placeholder = 'Type to filter or create...';
      input.style.cssText = 'width:100%; background:#0a0c0f; color:#fff; border:1px solid #333; padding:4px 6px; border-radius:4px; font-size:10px; outline:none;';

      const dropdown = document.createElement('div');
      dropdown.style.cssText = 'position:absolute; bottom:100%; left:0; right:0; background:#1e222a; border:1px solid #444; border-radius:4px; display:none; flex-direction:column; z-index:10; box-shadow:0 -4px 12px rgba(0,0,0,0.5); font-size:10px;';

      input.oninput = () => {
        const val = input.value.toLowerCase().trim();
        if (!val) { dropdown.style.display = 'none'; return; }
        const matches = allPossible.filter(t => t.toLowerCase().includes(val) && !activeSubTags.has(t));
        dropdown.innerHTML = '';
        matches.slice(0, 5).forEach(m => {
          const opt = document.createElement('div');
          opt.style.cssText = 'padding:6px 8px; cursor:pointer; border-bottom:1px solid #333;';
          opt.textContent = m;
          opt.onmousedown = () => { input.value = m; confirmTag(); };
          dropdown.appendChild(opt);
        });
        if (!allPossible.find(t => t.toLowerCase() === val)) {
          const create = document.createElement('div');
          create.style.cssText = 'padding:6px 8px; cursor:pointer; color:#f0c040; background:rgba(240,192,64,0.05);';
          create.textContent = `＋ Create "${input.value}"`;
          create.onmousedown = confirmTag;
          dropdown.appendChild(create);
        }
        dropdown.style.display = dropdown.children.length ? 'flex' : 'none';
      };

      async function confirmTag() {
        const tag = input.value.trim();
        if (!tag) return;

        const current = subData[targetId] || {};
        const catSubs = new Set(current[activeCat] || []);
        catSubs.add(tag);
        current[activeCat] = Array.from(catSubs);
        subData[targetId] = current;
        await storageSet(subStorageKey, subData);

        if (!presets.includes(tag)) {
          const customRes = await new Promise(r => chrome.storage.local.get(customKey, d => r(d[customKey] || {})));
          const catCustoms = new Set(customRes[activeCat] || []);
          if (!catCustoms.has(tag)) {
            catCustoms.add(tag);
            customRes[activeCat] = Array.from(catCustoms);
            await new Promise(r => chrome.storage.local.set({ [customKey]: customRes }, r));
          }
        }

        const catData = await storageGet(catStorageKey);
        const activeCats = new Set(catData[targetId] || []);
        if (!activeCats.has(activeCat)) {
          activeCats.add(activeCat);
          catData[targetId] = Array.from(activeCats);
          await storageSet(catStorageKey, catData);
          renderCategories();
        }

        input.value = '';
        dropdown.style.display = 'none';
        renderSubTags();
        buildPanel(scanForFileList());
      }

      input.onkeydown = (e) => {
        if (e.key === 'Enter') confirmTag();
        if (e.key === 'Escape') { input.value = ''; dropdown.style.display = 'none'; }
      };
      input.onblur = () => setTimeout(() => { dropdown.style.display = 'none'; }, 200);

      inputWrap.appendChild(input);
      inputWrap.appendChild(dropdown);
      subTagPanel.appendChild(inputWrap);
    }

    await renderCategories();
    document.body.appendChild(picker);
    document.getElementById('cas-picker-close').onclick = () => picker.remove();

    const outsideClick = (e) => {
      if (!picker.contains(e.target) && !anchorEl.contains(e.target)) {
        picker.remove();
        document.removeEventListener('mousedown', outsideClick);
      }
    };
    document.addEventListener('mousedown', outsideClick);
  }


  function buildPanel() {
    const existing = document.getElementById(PANEL_ID);
    if (existing) {
      document.getElementById('cas-scan')?.click();
      return;
    }

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
            <option value="date-desc" ${activeSortMode === 'date-desc' ? 'selected' : ''}>Date Newer</option>
            <option value="date-asc" ${activeSortMode === 'date-asc' ? 'selected' : ''}>Date Older</option>
          </select>
          <button id="cas-apply">Apply</button>
        </div>

        <!-- ── Artifact Summaries ─────────────────────────────────── -->
        <div class="cas-section-box">
          <details id="cas-summary-row" class="cas-section-details">
            <summary class="cas-section-label cas-animated-arrow">Artifact Analysis & Tagging</summary>
            <div style="display:flex;gap:5px;align-items:center;margin-top:6px;">
              <select id="cas-sum-mode" class="cas-mini-select" style="flex:1">
                <option value="both">Both (Sum + Tags)</option>
                <option value="summarise">Summary only</option>
                <option value="tags">Tags only</option>
              </select>
              <select id="cas-sum-length" class="cas-mini-select">
                <option value="1">1 sentence</option>
                <option value="2">2–3 sentences</option>
                <option value="5">5 sentences</option>
              </select>
              <button id="cas-sum-copy" class="cas-premium-btn">⎘ Copy Prompt</button>
            </div>
            <div style="display:flex;gap:5px;align-items:center;margin-top:5px">
              <button id="cas-summarise" class="cas-premium-btn" style="flex:1.5; background:hsl(var(--cas-gold)); color:#0d0f12; border:none; font-weight:600;">↓ GENERATE</button>
              <button id="cas-tag-artifacts" class="cas-premium-btn" style="flex:1; border-color:#f0c040; color:#f0c040;">⊕ TAG</button>
              <button id="cas-inject" class="cas-premium-btn" style="flex:1;">↓ INJECT</button>
            </div>
            <textarea id="cas-paste-json" placeholder="Or paste JSON here to inject manually…" rows="2" style="margin-top:5px; width:100%; box-sizing:border-box;"></textarea>
            <div id="cas-sum-status" style="font-size:9px;color:#888;margin-top:3px;display:none"></div>
          </details>
        </div>

        <!-- ── Chat Summary ──────────────────────────────────────── -->
        <div class="cas-section-box">
          <details id="cas-chat-summary-row" class="cas-section-details">
            <summary class="cas-section-label cas-animated-arrow">Chat Summary & Tagging</summary>
            <div style="display:flex;gap:5px;align-items:center;margin-top:6px;">
              <div style="display:flex;flex-direction:column;gap:3px;flex:1;">
                <select id="cas-chat-topic-lines" class="cas-mini-select" style="width:100%;">
                  <option value="1">1 topic line</option>
                  <option value="2" selected>2 topic lines</option>
                  <option value="5">5 topic lines</option>
                </select>
              </div>
              <div style="display:flex;flex-direction:column;gap:3px;flex:1;">
                <select id="cas-chat-aspect-lines" class="cas-mini-select" style="width:100%;">
                  <option value="1" selected>1 aspect line</option>
                  <option value="2">2 aspect lines</option>
                  <option value="5">5 aspect lines</option>
                </select>
              </div>
              <button id="cas-chat-sum-copy" class="cas-premium-btn">⎘ Copy Prompt</button>
            </div>
            <div style="display:flex;gap:5px;align-items:center;margin-top:5px">
              <button id="cas-chat-summarise" class="cas-premium-btn" style="flex:1.5; background:hsl(var(--cas-gold)); color:#0d0f12; border:none; font-weight:600;">↓ SUMMARISE CHAT</button>
              <button id="cas-tag-chat" class="cas-premium-btn" style="flex:1; border-color:#f0c040; color:#f0c040;">⊕ TAG CHAT</button>
              <button id="cas-chat-inject" class="cas-premium-btn" style="flex:1;">↓ INJECT</button>
            </div>
            <textarea id="cas-chat-paste-json" placeholder="Or paste JSON here to inject manually…" rows="2" style="margin-top:5px; width:100%; box-sizing:border-box;"></textarea>
            <div id="cas-chat-sum-status" style="font-size:9px;color:#888;margin-top:3px; display:none"></div>
          </details>
          <div id="cas-current-chat-summary" style="display:none; margin-top:10px; border-top:1px solid rgba(255,255,255,0.05); padding-top:8px;"></div>
        </div>

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

    document.getElementById('cas-apply').addEventListener('click', async () => {
      // If we haven't scanned yet, do it once
      if (!currentItems || currentItems.length === 0) {
        currentItems = scanForFileList();
      }

      if (currentItems.length === 0) {
        status.textContent = 'Scan first (↺)';
        return;
      }

      const mode = document.getElementById('cas-sort-mode').value;
      await applySort(currentItems, mode);
      status.textContent = `Sorted: ${mode}`;

      // Render the ALREADY SORTED items instead of rescanning
      renderList(currentItems, list, status, dataNote, dataSummary);
      await refreshSummariseBadge();
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
    document.getElementById('cas-sum-copy').addEventListener('click', async () => {
      const artifacts = scanForFileList().filter(i => i.source === 'generated' && i.data.name);
      if (artifacts.length === 0) { status.textContent = 'Scan first (↺).'; return; }
      const mode = document.getElementById('cas-sum-mode')?.value || 'both';
      const sentences = document.getElementById('cas-sum-length')?.value || '2';
      const lenLabel = sentences === '1' ? '1 sentence' : sentences === '2' ? '2-3 sentences' : '5 sentences';
      const names = artifacts.map(a => a.data.name).join('\n');
      let prompt;
      if (mode === 'summarise') {
        prompt = `For each file below write exactly ${lenLabel} describing what it contains.\nReply with a JSON object only — keys are the exact filenames, values are the summaries. No other text.\n\n${names}`;
      } else {
        const defs = Object.entries(VFT_CATEGORY_DEFINITIONS).map(([k, d]) => `- ${k}: ${d}`).join('\n');
        prompt = `Analyse each file below through the VFT category lens.\n\nVFT CATEGORIES:\n${defs}\n\nINSTRUCTIONS:\n` +
          (mode === 'both' ? `1. Write exactly ${lenLabel} describing what the file contains.\n` : '') +
          `${mode === 'both' ? 2 : 1}. Assign tags as an object where keys are major VFT categories (ONLY from: Logic, Spirituality, Religion, Cognition, Physics, Metaphysics, Ethics, Knowledge, Society, Sociology, Conscience, The World, Psychology, Communication, History, Reality) and values are arrays of 1–3 short generic sub-tag words describing that aspect. Use 2–4 categories total.\n` +
          `${mode === 'both' ? 3 : 2}. Reply ONLY with a JSON object — keys are exact filenames, values are ` +
          (mode === 'both' ? `{ "summary": "...", "tags": { "CategoryName": ["subtag1", "subtag2"] } }` : `{ "CategoryName": ["subtag1", "subtag2"] }`) +
          `\nNo other text.\n\nFILES:\n${names}`;
      }
      navigator.clipboard.writeText(prompt).then(() => {
        const s = document.getElementById('cas-sum-status');
        if (s) { s.style.display = 'block'; s.textContent = '✓ Prompt copied'; }
      });
    });

    // ── ↓ Summarise — fills input AND auto-sends (GAP 2) ──────────────────
    document.getElementById('cas-summarise').addEventListener('click', () => {
      const s = document.getElementById('cas-sum-status');
      if (s) s.style.display = 'block';
      performSummarise(s || status);
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
        const summary = (row.querySelector('.cas-injected-summary, div[style*="font-size:9.5px"]')?.textContent || '').toLowerCase();
        const tags = (row.querySelector('.cas-tags-container')?.textContent || '').toLowerCase();
        row.style.display = (!q || name.includes(q) || summary.includes(q) || tags.includes(q)) ? '' : 'none';
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
      const pasteField = document.getElementById('cas-chat-paste-json');
      const pasteText = (pasteField && pasteField.value) ? pasteField.value.trim() : '';
      let text = pasteText;

      if (!text) {
        // Read last Claude response
        const responses = document.querySelectorAll('[data-is-streaming="false"] .font-claude-response');
        if (responses.length === 0) {
          if (s) { s.textContent = '✗ No Claude response found and paste field is empty'; s.style.display = 'block'; }
          return;
        }
        text = responses[responses.length - 1].textContent.trim();
      }

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        if (s) { s.textContent = '✗ No JSON found'; s.style.display = 'block'; }
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
        if (pasteField) pasteField.value = '';
        renderChatSummaries();
      } catch (e) {
        if (s) { s.textContent = `✗ Parse error: ${e.message.slice(0, 40)}`; s.style.display = 'block'; }
      }
    });

    // ── Tagging Logic ────────────────────────────────────────────────────
    const tagArtifactsBtn = panel.querySelector('#cas-tag-artifacts');
    tagArtifactsBtn?.addEventListener('click', (e) => {
      buildFloatingTagPicker(tagArtifactsBtn, 'artifact');
    });

    const tagChatBtn = panel.querySelector('#cas-tag-chat');
    tagChatBtn?.addEventListener('click', (e) => {
      buildFloatingTagPicker(tagChatBtn, 'chat');
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

    if (!textCol) return;

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

  function injectDate(node, text) {
    const card = node.closest('[class*="artifact-block"]') || node.parentElement;
    if (!card) return;
    card.querySelector('.cas-injected-date')?.remove();
    const textCol = card.querySelector('[class*="flex-col"][class*="gap-1"]')
      || card.querySelector('[class*="leading-tight"]')?.parentElement
      || card.querySelector('.artifact-block-cell');
    if (!textCol) return;

    const el = document.createElement('div');
    el.className = 'cas-injected-date';
    el.style.cssText = [
      'font-size:9px', 'line-height:1', 'color:#f0c040',
      'margin-top:2px', 'padding:2px 0',
      'letter-spacing:0.02em',
      'opacity:0.6',
      'font-family:monospace',
      'display:block',
      'text-align:left'
    ].join(';');
    // Prepend a clock symbol to make it distinct
    el.innerHTML = `<span style="margin-right:4px;opacity:0.5">◷</span>${text}`;

    textCol.appendChild(el);
  }

  function injectTags(node, tags, subTagsMap) {
    if ((!tags || tags.length === 0) && !subTagsMap) return;
    const card = node.closest('[class*="artifact-block"]') || node.parentElement;
    if (!card) return;
    card.querySelector('.cas-injected-tags')?.remove();

    const textCol = card.querySelector('[class*="flex-col"][class*="gap-1"]')
      || card.querySelector('[class*="leading-tight"]')?.parentElement
      || card.querySelector('.artifact-block-cell');
    if (!textCol) return;

    const el = document.createElement('div');
    el.className = 'cas-injected-tags';
    el.style.cssText = 'display:flex; gap:3px; flex-wrap:wrap; margin-top:4px; padding:0; justify-content:flex-start;';

    if (tags) {
      tags.forEach(tag => {
        const color = getTagColor(tag);
        const span = document.createElement('span');
        span.textContent = tag;
        span.style.cssText = `font-size:7px; font-weight:700; color:${color}; background:${color}15; border:1px solid ${color}40; padding:0 3px; border-radius:2px; text-transform:uppercase; letter-spacing:0.02em;`;
        el.appendChild(span);

        if (subTagsMap && subTagsMap[tag]) {
          subTagsMap[tag].forEach(sub => {
            const subSpan = document.createElement('span');
            subSpan.textContent = sub;
            subSpan.style.cssText = `font-size:7px; font-weight:600; color:${color}; background:transparent; border:1px solid ${color}40; padding:0 3px; border-radius:2px; letter-spacing:0.01em;`;
            el.appendChild(subSpan);
          });
        }
      });
    }

    textCol.appendChild(el);
  }

  function injectDownload(node, dlData) {
    if (!dlData || !dlData.count) return;
    const card = node.closest('[class*="artifact-block"]') || node.parentElement;
    if (!card) return;
    card.querySelector('.cas-injected-dl')?.remove();

    const nameEl = card.querySelector('h3')
      || card.querySelector('[class*="font-medium"]') 
      || card.querySelector('[class*="leading-tight"]');

    if (!nameEl) return;

    const el = document.createElement('span');
    el.className = 'cas-injected-dl';
    el.title = `Downloaded ${dlData.count} times`;
    el.style.cssText = 'margin-left:8px; color:#40f0c0; font-family:monospace; font-weight:700; font-size:10px; opacity:0.9; cursor:default; white-space:nowrap; display:inline-flex; align-items:center;';
    el.innerHTML = `<span style="margin-right:2px">⬇️</span>${dlData.count}`;

    // Just append to nameEl as an inline sibling
    nameEl.style.display = 'inline-flex';
    nameEl.style.alignItems = 'center';
    nameEl.appendChild(el);
  }

  // ─── Navigation — Jump to Chat ──────────────────────────────────────────

  function jumpToArtifact(name) {
    if (!name) return;

    // Claude's chat-flow artifact buttons have aria-label="A. Open artifact." (just a letter),
    // NOT the full filename. So we can't match by aria-label in chat.
    // Instead we rely on data-cas-name attributes stamped by loadAndInjectMetadata().
    const sidebar = findArtifactSidebar();

    // Find all artifact blocks tagged with this name that are NOT inside the sidebar
    const candidates = Array.from(
      document.querySelectorAll('[data-cas-name]')
    ).filter(el => {
      if (sidebar && sidebar.contains(el)) return false;
      return el.getAttribute('data-cas-name') === name;
    });

    // Fallback: if metadata hasn't been injected yet, scan by aria-label (old path)
    if (candidates.length === 0) {
      const byLabel = Array.from(
        document.querySelectorAll('button[aria-label], [role="button"][aria-label]')
      ).filter(n => {
        if (sidebar && sidebar.contains(n)) return false;
        return n.getAttribute('aria-label')?.includes(name);
      });
      if (byLabel.length === 0) {
        console.warn('[CAS] jumpToArtifact: no chat card found for:', name);
        return;
      }
      candidates.push(...byLabel.map(n => n.closest('[class*="artifact-block"]') || n));
    }

    // Scroll to the LAST match (most recent version in chat)
    const card = candidates[candidates.length - 1];
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const originalBg = card.style.background;
    const originalBorder = card.style.borderColor;
    const originalTransition = card.style.transition;

    card.style.transition = 'background 0.3s, border-color 0.3s';
    card.style.background = 'rgba(240, 192, 64, 0.25)';
    card.style.borderColor = 'rgba(240, 192, 64, 0.7)';

    setTimeout(() => {
      card.style.background = originalBg;
      card.style.borderColor = originalBorder;
      setTimeout(() => { card.style.transition = originalTransition; }, 500);
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

    // Choose which mode we're in: Summary, Tags, or Both
    const mode = document.getElementById('cas-sum-mode')?.value || 'both';

    const artifacts = freshItems.filter(i => i.source === 'generated' && i.data.name);

    if (artifacts.length === 0) {
      if (statusTarget) statusTarget.textContent = 'No artifacts found — scan first.';
      return;
    }

    const sentences = document.getElementById('cas-sum-length')?.value || '2';
    const lenLabel = sentences === '1' ? '1 sentence' : sentences === '2' ? '2-3 sentences' : '5 sentences';
    const names = artifacts.map(a => a.data.name).join('\n');

    let prompt = '';

    if (mode === 'summarise') {
      prompt = `For each file below write exactly ${lenLabel} describing what it contains.\nReply with a JSON object only — keys are the exact filenames, values are the summaries. No other text.\n\n${names}`;
    } else {
      const defs = Object.entries(VFT_CATEGORY_DEFINITIONS).map(([k, d]) => `- ${k}: ${d}`).join('\n');
      prompt = `Analyse each file below through the VFT category lens.\n\nVFT CATEGORIES:\n${defs}\n\nINSTRUCTIONS:\n` +
        (mode === 'both' ? `1. Write exactly ${lenLabel} describing what the file contains.\n` : '') +
        `${mode === 'both' ? 2 : 1}. Assign 2–4 semi-regular tags. Each tag must be a single generic word that reflects which VFT category best describes an aspect of the file (e.g. "Logic", "Psychology", "Ethics"). Tags should span different categories where applicable.\n` +
        `${mode === 'both' ? 3 : 2}. Reply ONLY with a JSON object — keys are exact filenames, values are ` +
        (mode === 'both' ? `{ "summary": "...", "tags": { "CategoryName": ["subtag1", "subtag2"] } }` : `{ "CategoryName": ["subtag1", "subtag2"] }`) +
        `\nNo other text.\n\nFILES:\n${names}`;
    }

    const filled = fillInput(prompt);
    if (statusTarget) {
      statusTarget.textContent = filled ? '✓ VFT Prompt injected — send in chat, then click ↓ INJECT' : '✗ Input not found';
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
      `DO NOT summarise code or artifacts themselves.\n\n` +
      `For each topic write exactly ${t} line(s) of summary.\n` +
      `For each sub-aspect within each topic write exactly ${a} line(s) of summary.\n\n` +
      `Reply ONLY with a JSON object in this exact shape:\n` +
      `{\n  "topics": [\n    {\n      "name": "Topic name",\n      "summary": "...",\n` +
      `      "aspects": [\n        { "name": "Aspect name", "summary": "..." }\n      ]\n    }\n  ]\n}`;
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

    const pasteField = document.getElementById('cas-paste-json') || document.getElementById('cas-chat-paste-json');
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

      const summaries = await storageGet('cas_summaries');
      const tagsData = await storageGet('cas_tags');

      const slugMappedParsed = {};
      if (!Array.isArray(parsed)) {
        for (const k in parsed) slugMappedParsed[toSlug(k)] = parsed[k];
      }

      const subTagsData = await storageGet('cas_subtags');

      for (const artifact of artifacts) {
        const artifactSlug = toSlug(artifact.data.name);
        const entry = slugMappedParsed[artifactSlug];
        if (!entry) continue;

        const name = artifact.data.name;
        let tagObj = null; // { "MajorCat": ["subtag",...] }

        if (typeof entry === 'string') {
          summaries[name] = entry;
        } else if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
          if (entry.summary) summaries[name] = entry.summary;
          // tags can be the new object format or old flat array
          if (entry.tags && typeof entry.tags === 'object' && !Array.isArray(entry.tags)) {
            tagObj = entry.tags;
          } else if (Array.isArray(entry.tags)) {
            tagsData[name] = entry.tags; // legacy flat array
          } else if (!entry.summary) {
            // entry itself is the tag object (tags-only mode)
            tagObj = entry;
          }
        }

        if (tagObj) {
          // Store major category keys in cas_tags
          tagsData[name] = Object.keys(tagObj);
          // Store subtags in cas_subtags
          subTagsData[name] = tagObj;
          // Append any new subtags into TAG_CATEGORIES so manual picker shows them
          Object.entries(tagObj).forEach(([cat, subs]) => {
            if (TAG_CATEGORIES[cat]) {
              subs.forEach(s => { if (!TAG_CATEGORIES[cat].includes(s)) TAG_CATEGORIES[cat].push(s); });
            }
          });
        }
        count++;
      }

      await storageSet('cas_summaries', summaries);
      await storageSet('cas_tags', tagsData);
      await storageSet('cas_subtags', subTagsData);

      if (statusTarget) {
        statusTarget.textContent = `✓ Injected ${count} items. Redrawing...`;
        statusTarget.style.display = 'block';
      }
      setTimeout(() => scanForFileList(), 300);
    } catch (e) {
      console.error('[CAS] Injection fail:', e);
      if (statusTarget) statusTarget.textContent = '✗ Parse error — check console.';
    }
  }

  async function renderProjectView() {
    const el = document.getElementById('cas-project-list');
    if (!el) return;
    el.innerHTML = '';

    // To get all tracked projects, we pull ALL local storage keys
    const allData = await new Promise(r => chrome.storage.local.get(null, r));

    // Find all indexKeys: proj_${proj}_chat_index + standalone
    const projectIndexKeys = Object.keys(allData).filter(k => k.startsWith('proj_') && k.endsWith('_chat_index'));
    const standaloneIndex = allData['cas_standalone_chat_index'] || {};
    const standaloneChats = Object.entries(standaloneIndex);

    if (projectIndexKeys.length === 0 && standaloneChats.length === 0) {
      el.innerHTML = '<div style="color:#999;font-size:10px;padding:8px">No recorded chats found yet.</div>';
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
              const [sums, seen, chatSummaryData, chatTagsAll] = await Promise.all([
                new Promise(r => chrome.storage.local.get(chatSumKey, d => r(d[chatSumKey] || {}))),
                new Promise(r => chrome.storage.local.get(chatSeenKey, d => r(d[chatSeenKey] || {}))),
                new Promise(r => chrome.storage.local.get(chatSumMapKey, d => r(d[chatSumMapKey] || null))),
                storageGet('cas_chat_tags'),
                storageGet('cas_tags'),
                storageGet('cas_subtags')
              ]);

              const chatTags = chatTagsAll[chatId] || [];

              // Show chat-level tags if we have them
              if (chatTags.length > 0) {
                const tagBlock = document.createElement('div');
                tagBlock.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px;padding:3px 0;';
                tagBlock.innerHTML = chatTags.map(tag => {
                  const c = getTagColor(tag);
                  return `<span style="font-size:7px;font-weight:700;color:${c};background:${c}20;border:1px solid ${c}50;padding:0 4px;border-radius:2px;text-transform:uppercase;letter-spacing:0.03em;">${tag}</span>`;
                }).join('');
                artifactList.appendChild(tagBlock);
              }

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
                          ${t.tags?.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px;">${t.tags.map(tag => `<span style="font-size:7px;color:hsl(var(--cas-gold));background:rgba(240,192,64,0.1);padding:0 3px;border-radius:2px;border:1px solid rgba(240,192,64,0.2)">${tag}</span>`).join('')}</div>` : ''}
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
                const artifactTags = (arguments[4] || {})[name] || [];
                const artifactSubTags = (arguments[5] || {})[name] || {};

                allNames.forEach(name => {
                  const aRow = document.createElement('div');
                  aRow.style.cssText = 'padding:3px 0;border-top:1px solid #1a1d22';
                  const summary = sums[name] || '';
                  const ts = seen[name] || '';

                  // Fetch tags for this specific artifact in project view
                  const aCats = (arguments[4] || {})[name] || [];
                  const aSubs = (arguments[5] || {})[name] || {};

                  let aTagsHtml = '';
                  if (aCats.length > 0) {
                    aTagsHtml = `<div style="display:flex;flex-direction:column;gap:3px;margin-top:2px;">`;
                    aCats.forEach(cat => {
                      const c = getTagColor(cat);
                      const sList = aSubs[cat] || [];
                      aTagsHtml += `
                        <div style="display:flex;flex-direction:column;gap:1px;">
                          <span style="font-size:7px;font-weight:700;color:${c};background:${c}15;border:1px solid ${c}40;padding:0 3px;border-radius:2px;text-transform:uppercase;align-self:flex-start;">${cat}</span>
                          ${sList.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap;padding-left:4px;">${sList.map(s => `<span style="font-size:7px;color:${c};opacity:0.7;">└ ${s}</span>`).join('')}</div>` : ''}
                        </div>`;
                    });
                    aTagsHtml += '</div>';
                  }

                  aRow.innerHTML = `
                    <div style="display:flex;gap:4px;align-items:center">
                      <span style="color:${summary ? '#6bcf6b' : '#444'};font-size:9px">⬡</span>
                      <span style="font-size:9px;color:#f5f5f5;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name.slice(0, 30)}</span>
                      ${ts ? `<span style="font-size:8px;color:#888">${ts}</span>` : ''}
                    </div>
                    ${aTagsHtml}
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

    // ── Standalone chats (no project) ────────────────────────────────────
    if (standaloneChats.length > 0) {
      standaloneChats.sort((a, b) => (b[1].lastSeen || '').localeCompare(a[1].lastSeen || ''));

      const headerContainer = document.createElement('div');
      headerContainer.style.cssText = 'margin-top:6px;padding:4px 6px;background:rgba(100,150,255,0.04);border-radius:4px;border:1px solid rgba(100,150,255,0.12);';

      const header = document.createElement('div');
      header.style.cssText = 'color:#8899cc;font-size:9px;letter-spacing:0.1em;padding:4px 0 6px;font-weight:600';
      header.textContent = `◈ Standalone — ${standaloneChats.length} chat${standaloneChats.length !== 1 ? 's' : ''}`;
      headerContainer.appendChild(header);

      standaloneChats.forEach(([chatId, meta]) => {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-cas-chat-row', '1');

        const chatSumKey = `chat_${chatId}_cas_summaries`;
        const chatSeenKey = `chat_${chatId}_cas_first_seen`;
        const chatSumMapKey = `chat_${chatId}_cas_chat_summary`;

        Promise.all([
          new Promise(r => chrome.storage.local.get(chatSeenKey, d => r(d[chatSeenKey] || {}))),
          new Promise(r => chrome.storage.local.get(chatSumKey, d => r(d[chatSumKey] || {}))),
        ]).then(([seen, sums]) => {
          const allNames = [...new Set([...Object.keys(seen), ...Object.keys(sums)])];
          wrapper.setAttribute('data-cas-artifacts', allNames.join(' ').toLowerCase());
        });

        const row = document.createElement('div');
        const selectMode = window._casProjectSelectMode?.() || false;
        const selectedChatIds = window._casSelectedChatIds;
        const hasChatSummary = !!(allData[chatSumMapKey]?.topics?.length > 0);

        const indicator = selectMode
          ? `<input type="checkbox" data-chat-id="${chatId}" style="cursor:pointer;accent-color:#f0c040;" ${selectedChatIds?.has(chatId) ? 'checked' : ''}>`
          : (chatId === currentChat ? '<span style="color:#f0c040">●</span>' : '<span style="color:#444">○</span>');

        const summaryBtnHtml = hasChatSummary
          ? `<span class="cas-project-summary-btn" data-chat-id="${chatId}" data-chat-name="${(meta.name || chatId).replace(/"/g, '&quot;')}" data-sum-key="${chatSumMapKey}" style="color:#f0c040;font-size:12px;cursor:pointer;padding:0 4px;margin-right:2px;" title="View Chat Summary">⌬</span>`
          : '';

        const hasArtifacts = (meta.artifactCount || 0) > 0;
        const expandIcon = hasArtifacts ? '<span class="cas-expand-icon" style="color:#aaa;font-size:9px;flex-shrink:0">▶</span>' : '';

        row.style.cssText = [
          'display:flex', 'align-items:center', 'gap:5px',
          'padding:4px 6px', 'border-radius:3px', 'cursor:pointer',
          'border:1px solid transparent',
          chatId === currentChat ? 'border-color:#2a2e36;background:#13161b' : '',
        ].join(';');

        row.innerHTML = `
          ${indicator}
          ${summaryBtnHtml}
          <span style="flex:1;font-size:10px;color:#f5f5f5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${meta.name || chatId}">${(meta.name || chatId)}</span>
          <span style="font-size:9px;color:#aaa;flex-shrink:0">${meta.artifactCount || 0} ⬡</span>
          <span style="font-size:9px;color:#888;flex-shrink:0">${meta.lastSeen || ''}</span>
          <a href="https://claude.ai/chat/${chatId}" target="_blank" rel="noopener" title="Open in new tab" style="color:#fff;font-size:11px;flex-shrink:0;text-decoration:none;padding:0 2px;line-height:1" onclick="event.stopPropagation()">↗</a>
          ${expandIcon}
        `;

        const summaryBtn = row.querySelector('.cas-project-summary-btn');
        if (summaryBtn) {
          summaryBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.casOpenFlyoutForChat(summaryBtn.getAttribute('data-chat-id'), summaryBtn.getAttribute('data-chat-name'), summaryBtn.getAttribute('data-sum-key'));
          });
        }

        if (selectMode && selectedChatIds) {
          row.querySelector('input[type="checkbox"]')?.addEventListener('change', (e) => {
            e.stopPropagation();
            if (e.target.checked) selectedChatIds.add(chatId); else selectedChatIds.delete(chatId);
          });
        }

        const artifactList = document.createElement('div');
        artifactList.style.cssText = 'display:none;padding:0 6px 4px 18px';
        let expanded = false;

        row.addEventListener('click', async (e) => {
          if (selectMode) return;
          if (e.target.tagName === 'A') return;
          if (hasArtifacts) {
            expanded = !expanded;
            artifactList.style.display = expanded ? 'block' : 'none';
            const icon = row.querySelector('.cas-expand-icon');
            if (icon) icon.textContent = expanded ? '▼' : '▶';
            if (expanded && artifactList.children.length === 0) {
              const [sums, seen, artifactTags, chatSummaryData, chatTagsAll] = await Promise.all([
                new Promise(r => chrome.storage.local.get(chatSumKey, d => r(d[chatSumKey] || {}))),
                new Promise(r => chrome.storage.local.get(chatSeenKey, d => r(d[chatSeenKey] || {}))),
                new Promise(r => chrome.storage.local.get(`chat_${chatId}_cas_tags`, d => r(d[`chat_${chatId}_cas_tags`] || {}))),
                new Promise(r => chrome.storage.local.get(chatSumMapKey, d => r(d[chatSumMapKey] || null))),
                storageGet('cas_chat_tags'),
              ]);
              const chatTags = chatTagsAll[chatId] || [];

              // Chat-level tags (set via ⊕ TAG CHAT picker)
              if (chatTags.length > 0) {
                const tagBlock = document.createElement('div');
                tagBlock.style.cssText = 'display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px;padding:3px 0;';
                tagBlock.innerHTML = chatTags.map(tag => {
                  const c = getTagColor(tag);
                  return `<span style="font-size:7px;font-weight:700;color:${c};background:${c}20;border:1px solid ${c}50;padding:0 4px;border-radius:2px;text-transform:uppercase;letter-spacing:0.03em;">${tag}</span>`;
                }).join('');
                artifactList.appendChild(tagBlock);
              }

              if (chatSummaryData?.topics?.length > 0) {
                const sumBlock = document.createElement('div');
                sumBlock.style.cssText = 'margin-bottom:6px;padding:5px 6px;background:rgba(240,192,64,0.06);border-left:2px solid #f0c040;border-radius:0 3px 3px 0';
                sumBlock.innerHTML = `<details open><summary class="cas-animated-arrow" style="font-size:8px;color:#f0c040;letter-spacing:0.06em;margin-bottom:3px;cursor:pointer;outline:none;user-select:none;">CHAT SUMMARY</summary><div style="margin-top:4px;">${chatSummaryData.topics.map(t => `<details style="margin-bottom:4px"><summary class="cas-animated-arrow" style="font-size:9px;color:#e0e0e0;font-weight:600;cursor:pointer;outline:none;user-select:none;">${t.name}</summary><div style="font-size:8px;color:#aaa;line-height:1.4;padding-left:12px;margin-top:4px;">${t.tags?.length ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:4px;">${t.tags.map(tag => `<span style="font-size:7px;color:hsl(var(--cas-gold));background:rgba(240,192,64,0.1);padding:0 3px;border-radius:2px;border:1px solid rgba(240,192,64,0.2)">${tag}</span>`).join('')}</div>` : ''}${t.summary}${(t.aspects || []).map(a => `<div style="margin-top:4px;"><span style="font-size:8px;color:#888">└ ${a.name}: </span><span style="font-size:8px;color:#999">${a.summary}</span></div>`).join('')}</div></details>`).join('')}</div></details>`;
                artifactList.appendChild(sumBlock);
              }
              // rename tags → artifactTags below for per-artifact display
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
                  const aTags = artifactTags[name] || [];
                  const tagsHtml = aTags.length ? `<div style="display:flex;gap:3px;margin-top:2px;">${aTags.map(tag => `<span style="font-size:7px;color:hsl(var(--cas-gold));background:rgba(240,192,64,0.1);padding:0 3px;border-radius:2px;border:1px solid rgba(240,192,64,0.2)">${tag}</span>`).join('')}</div>` : '';

                  aRow.innerHTML = `<div style="display:flex;gap:4px;align-items:center"><span style="color:${summary ? '#6bcf6b' : '#444'};font-size:9px">⬡</span><span style="font-size:9px;color:#f5f5f5;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${name}">${name.slice(0, 30)}</span>${ts ? `<span style="font-size:8px;color:#888">${ts}</span>` : ''}</div>${tagsHtml}${summary ? `<div style="font-size:8px;color:#aaa;padding-top:2px;line-height:1.3">${summary}</div>` : ''}`;
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

    const buildHtml = (data, titleLabel, filterQuery = '', dateStr = '') => {
      if (!data?.topics?.length) return '';

      const dateHtml = dateStr ? `<span style="font-size:9px;color:#f0c040;opacity:0.6;margin-left:8px;font-family:monospace;">◷ ${dateStr}</span>` : '';

      const filtered = data.topics.filter(t => {
        if (!filterQuery) return true;
        const q = filterQuery.toLowerCase();
        const tagsStr = (t.tags || []).join(' ').toLowerCase();
        return t.name.toLowerCase().includes(q) || t.summary.toLowerCase().includes(q) || tagsStr.includes(q);
      });

      if (filtered.length === 0 && filterQuery) {
        return `<div style="padding:20px;text-align:center;color:#666;font-size:10px;">No topics match "${filterQuery}"</div>`;
      }

      return `
        <details open>
          <summary class="cas-animated-arrow" style="font-size:8px;color:hsl(var(--cas-gold));letter-spacing:0.06em;margin-bottom:3px;cursor:pointer;outline:none;user-select:none;display:flex;align-items:center;">
            ${titleLabel}
            ${dateHtml}
          </summary>
          <div style="margin-top:4px;">
          ${filtered.map(t => `
            <details style="margin-bottom:4px">
              <summary class="cas-animated-arrow" style="font-size:9px;color:#e0e0e0;font-weight:600;cursor:pointer;outline:none;user-select:none;">${t.name}</summary>
              <div style="font-size:8px;color:#aaa;line-height:1.4;padding-left:12px;margin-top:4px;">
                ${t.tags?.length ? `
                  <div style="display:flex; gap:3px; flex-wrap:wrap; margin-bottom:5px;">
                    ${t.tags.map(tag => `<span style="font-size:7px; color:hsl(var(--cas-gold)); background:rgba(240,192,64,0.15); border:1px solid rgba(240,192,64,0.3); padding:0 3px; border-radius:2px;">${tag}</span>`).join('')}
                  </div>
                ` : ''}
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
      const chatId = getChatId();
      const proj = getProjectId();
      const indexKey = proj ? `proj_${proj}_chat_index` : 'cas_standalone_chat_index';

      const [mainData, chatIndex, chatTagsAll] = await Promise.all([
        new Promise(r => chrome.storage.local.get(chatSumKey, d => r(d[chatSumKey] || null))),
        new Promise(r => chrome.storage.local.get(indexKey, d => r(d[indexKey] || {}))),
        storageGet('cas_chat_tags'),
      ]);

      const chatMeta = chatIndex[chatId];
      const chatTags = chatTagsAll[chatId] || [];
      const html = buildHtml(mainData, 'CURRENT CHAT SUMMARY', '', chatMeta?.lastSeen || '');

      if (html || chatTags.length > 0) {
        elMain.style.display = 'block';
        elMain.style.cssText = 'margin-bottom:6px;padding:5px 6px;background:rgba(240,192,64,0.06);border-left:2px solid hsl(var(--cas-gold));border-radius:0 3px 3px 0';
        const tagChipsHtml = chatTags.length
          ? `<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px;">
               ${chatTags.map(tag => {
            const c = getTagColor(tag);
            return `<span style="font-size:7px;font-weight:700;color:${c};background:${c}20;border:1px solid ${c}50;padding:0 4px;border-radius:2px;text-transform:uppercase;letter-spacing:0.03em;">${tag}</span>`;
          }).join('')}
             </div>`
          : '';
        elMain.innerHTML = tagChipsHtml + (html || '');
      } else {
        elMain.style.display = 'none';
        elMain.innerHTML = '';
      }
    }

    // 2. Flyout (Universal)
    if (elFlyout) {
      const flyoutChatId = activeFlyoutChatId || getChatId();
      const flyoutSumKey = activeFlyoutSumKey || storageKey('cas_chat_summary');
      const proj = getProjectId();
      const indexKey = proj ? `proj_${proj}_chat_index` : 'cas_standalone_chat_index';

      const [flyoutData, chatIndex] = await Promise.all([
        new Promise(r => chrome.storage.local.get(flyoutSumKey, d => r(d[flyoutSumKey] || null))),
        new Promise(r => chrome.storage.local.get(indexKey, d => r(d[indexKey] || {})))
      ]);

      const chatMeta = chatIndex[flyoutChatId];
      const isExternal = activeFlyoutChatId !== null && activeFlyoutChatId !== getChatId();
      const titleLabel = isExternal ? 'PROJECT CHAT SUMMARY' : 'CURRENT CHAT SUMMARY';
      const html = buildHtml(flyoutData, titleLabel, searchQuery, chatMeta?.lastSeen || '');

      if (html) {
        elFlyout.style.display = 'block';
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

  // ─── Sorting Logic ──────────────────────────────────────────────────────────

  async function applySort(items, mode) {
    if (!items || items.length === 0) return;
    const seen = await storageGet('cas_first_seen');

    // Utility to parse our custom timestamp format: "HH:mm DD.MM"
    const parseDate = (d) => {
      if (!d) return 0;
      try {
        const [time, date] = d.split(' ');
        const [h, m] = time.split(':').map(Number);
        const [day, month] = date.split('.').map(Number);
        // Assuming current year 2026 as per user context
        return new Date(2026, month - 1, day, h, m).getTime();
      } catch (e) { return 0; }
    };

    items.sort((a, b) => {
      const nameA = (a.data.name || '').toLowerCase();
      const nameB = (b.data.name || '').toLowerCase();

      switch (mode) {
        case 'name-asc':
          return nameA.localeCompare(nameB);
        case 'name-desc':
          return nameB.localeCompare(nameA);
        case 'date-desc':
          return parseDate(seen[b.data.name]) - parseDate(seen[a.data.name]);
        case 'date-asc':
          return parseDate(seen[a.data.name]) - parseDate(seen[b.data.name]);
        case 'dom-order':
          // a.origIndex is discovery order; use its saved DOM attribute if possible
          return (a.origIndex || 0) - (b.origIndex || 0);
        default:
          return 0;
      }
    });

    // Physically reorder nodes in the sidebar if they exist
    const section = findArtifactSidebar();
    if (section) {
      const listContainer = section.querySelector('[class*="flex-col"][class*="gap-2"]') || section.querySelector('[role="button"]')?.parentElement;
      if (listContainer) {
        items.forEach(item => {
          if (item.isSidebar) {
            // Find the immediate child of listContainer that contains item.node
            let child = item.node;
            while (child && child.parentElement !== listContainer) {
              child = child.parentElement;
            }
            if (child) listContainer.appendChild(child);
          }
        });
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
      generated: { label: 'Generated', color: '#6bcf6b', icon: '⬡' },
      project: { label: 'Project', color: '#6b9bcf', icon: '⧉' },
      unknown: { label: 'Other', color: '#888', icon: '?' }
    };
    const groups = { generated: [], project: [], unknown: [] };
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
    Promise.all([
      storageGet('cas_first_seen'),
      storageGet('cas_summaries'),
      storageGet('cas_tags'),
      storageGet('cas_subtags'),
      storageGet('cas_downloads')
    ]).then(([seen, summaries, tagsMap, subTagsMap, dlsMap]) => {
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
          const categories = tagsMap[data.name] || [];
          const subTagsByCategory = subTagsMap[data.name] || {};
          const dlData = dlsMap[data.name];

          const dlBadge = dlData && dlData.count > 0
            ? `<span title="Downloaded ${dlData.count} times" style="background:#1e2a22;color:#6bcf6b;border-radius:3px;padding:1px 4px;font-size:7px;margin-left:4px;border:1px solid #285030;">⭳ ${dlData.count}</span>`
            : '';

          // Display hierarchy: Categories (Bold) + Sub-tags (Small)
          let tagsHtml = '';
          if (categories.length > 0) {
            tagsHtml = `<div class="cas-tags-container" style="display:flex;gap:4px;flex-wrap:wrap;padding:3px 0 0 20px;">`;
            categories.forEach(cat => {
              const color = getTagColor(cat);
              const subs = subTagsByCategory[cat] || [];
              tagsHtml += `
                <div style="display:flex; flex-direction:column; gap:2px;">
                  <span style="border-radius:3px;padding:1px 5px;font-size:8px;font-weight:700;background:${color}30;color:${color};border:1px solid ${color}60;">${cat}</span>
                  ${subs.length > 0 ? `
                    <div style="display:flex;gap:2px;flex-wrap:wrap;padding-left:4px;">
                      ${subs.map(s => `<span style="font-size:7px;color:${color};opacity:0.8;background:${color}10;padding:0 3px;border-radius:2px;">└ ${s}</span>`).join('')}
                    </div>
                  ` : ''}
                </div>
              `;
            });
            tagsHtml += '</div>';
          }

          // ◈ NAVIGATION UI
          row.innerHTML = `
          <div style="display:flex;align-items:center;gap:5px;width:100%">
            <span class="cas-index">${i + 1}</span>
            ${badge}
            ${dlBadge}
            <span class="cas-name" title="Double-click to open • Single-click to find\n${data.name || ''}" style="flex:1; cursor:pointer;">${(data.name || 'unknown').slice(0, 24)}</span>
            ${ts ? `<span class="cas-meta">${ts}</span>` : ''}
            <button class="cas-jump-btn" title="Jump to point in chat" style="background:none;border:none;color:#fff;cursor:pointer;font-size:12px;padding:0 4px;margin-left:auto;transition:color 0.2s;text-shadow:0 0 2px rgba(255,255,255,0.3)">⟢</button>
          </div>
          ${tagsHtml}
          ${summary ? `<div style="font-size:9px;color:#bbb;padding:3px 0 0 20px;line-height:1.4;letter-spacing:0.01em;">${summary}</div>` : ''}
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
  }

  function highlightNode(node, context = 'sidebar') {
    if (!node) return;
    // Target the visible card container if possible (usually a button or its wrapper)
    const target = node.closest('[class*="artifact-block"]')
      || node.closest('[class*="attachment"]')
      || node;

    // Scroll node into view and flash it
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });

    const prev = target.style.outline;
    const prevBg = target.style.backgroundColor;
    const prevTransition = target.style.transition;
    const prevBoxShadow = target.style.boxShadow;

    target.style.transition = 'background 0.3s, outline 0.3s, box-shadow 0.3s';
    target.style.outline = '2px solid #f0c040';
    target.style.boxShadow = '0 0 15px rgba(240,192,64,0.4)';
    target.style.backgroundColor = context === 'sidebar' ? 'rgba(240,192,64,0.3)' : 'rgba(240,192,64,0.2)';

    setTimeout(() => {
      target.style.outline = prev;
      target.style.backgroundColor = prevBg;
      target.style.boxShadow = prevBoxShadow;
      setTimeout(() => {
        target.style.transition = prevTransition;
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

      .cas-section-box {
        margin: 8px 4px;
        padding: 8px;
        background: rgba(240, 192, 64, 0.03);
        border: 1px dashed rgba(240, 192, 64, 0.2);
        border-radius: 6px;
      }
      .cas-section-label {
        font-size: 10px;
        font-weight: 700;
        color: hsl(var(--cas-gold));
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 2px;
      }
      .cas-section-details { outline: none; }
      .cas-section-details summary::-webkit-details-marker { display: none; }

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
      .cas-premium-btn:hover { background: rgba(255, 255, 255, 0.08); border-color: rgba(255, 255, 255, 0.2); color: #fff; }

      /* Animated Arrow for Collapsibles */
      .cas-animated-arrow {
        list-style: none;
        display: flex;
        align-items: center;
        width: 100%;
      }
      .cas-animated-arrow::-webkit-details-marker { display: none; }
      .cas-animated-arrow::before {
        content: '▶';
        display: inline-block;
        margin-right: 6px;
        font-size: 7px;
        transition: transform 0.2s ease-in-out;
        color: #f0c040;
      }
      details[open] > .cas-animated-arrow::before {
        transform: rotate(90deg);
      }

      .cas-section-details {
        margin-bottom: 6px;
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

      .cas-section-box {
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
        width: 100%;
        box-sizing: border-box;
        background: rgba(0,0,0,0.1);
        border-bottom: 1px solid #2a2e36;
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
      // ◈ RECURSION PROTECTION
      // We check if all added or removed nodes are OUR OWN injected markers.
      // If so, we bail out to prevent infinite loops and DOM thrashing.
      const isOnlyUs = mutations.every(m => {
        const addedOnlyUs = Array.from(m.addedNodes).every(n =>
          n.nodeType === 1 && (
            n.id === 'cas-sidebar-bar' || n.id === PANEL_ID || n.id === 'cas-panel-toggle' ||
            n.classList.contains('cas-summary-badge') ||
            n.classList.contains('cas-injected-summary') ||
            n.classList.contains('cas-injected-date') ||
            n.classList.contains('cas-injected-dl') ||
            n.classList.contains('cas-injected-tags')
          )
        );
        const removedOnlyUs = Array.from(m.removedNodes).every(n =>
          n.nodeType === 1 && (
            n.id === 'cas-sidebar-bar' || n.id === PANEL_ID || n.id === 'cas-panel-toggle' ||
            n.classList.contains('cas-summary-badge') ||
            n.classList.contains('cas-injected-summary') ||
            n.classList.contains('cas-injected-date') ||
            n.classList.contains('cas-injected-dl') ||
            n.classList.contains('cas-injected-tags')
          )
        );
        // Also check if the mutation is just on one of our nodes
        const targetIsUs = m.target?.id === 'cas-sidebar-bar' || m.target?.id === PANEL_ID || m.target?.id === 'cas-panel-toggle' ||
          m.target?.classList?.contains('cas-summary-badge') ||
          m.target?.classList?.contains('cas-injected-summary') ||
          m.target?.classList?.contains('cas-injected-date') ||
          m.target?.classList?.contains('cas-injected-dl') ||
          m.target?.classList?.contains('cas-injected-tags');

        return (addedOnlyUs && removedOnlyUs) || targetIsUs;
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

        // ALWAYS scan for metadata injection if layout changed, even if panel is closed
        if (layoutChanged) {
           console.log('[CAS] Layout changed; re-injecting metadata...');
           const items = scanForFileList(); // This handles all metadata injection!
           
           // If the floating panel IS open, also refresh its internal list
           if (document.getElementById(PANEL_ID)) {
             const list = document.getElementById('cas-list');
             const status = document.getElementById('cas-status');
             const dataNote = document.getElementById('cas-data-note');
             const dataSummary = document.getElementById('cas-data-summary');
             if (list) {
               renderList(items, list, status, dataNote, dataSummary);
             }
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

  // ─── GCS — Gemini Canvas Sorter ────────────────────────────────────────────

  if (PLATFORM === 'gemini') {
    function findGeminiFilesSidebar() {
      // Targets Gemini's sidebar (context-sidebar) and files panels
      return document.querySelector('context-sidebar') || document.querySelector('[data-panel-id="files"]') || document.querySelector('[aria-label*="Files in this conversation"]') || document.querySelector('side-panel') || null;
    }

    function scanGeminiCanvases() {
      const sidebar = findGeminiFilesSidebar();
      const results = [];
      const canvasSelectors = ['sidebar-immersive-chip', '[data-canvas-id]', '[class*="canvas-item"]', '[class*="artifact-item"]', '[aria-label*="canvas"]'];

      let nodes = [];
      if (sidebar) {
        for (const sel of canvasSelectors) {
          const found = sidebar.querySelectorAll(sel);
          if (found.length > 0) { nodes = [...found]; break; }
        }
        // Fallback for list items that look like files
        if (nodes.length === 0) {
          nodes = [...sidebar.querySelectorAll('li, [role="listitem"], [role="button"]')].filter(n => n.textContent.trim().length > 0 && n.textContent.trim().length < 100);
        }
      }

      // Also scan chat flow for canvases
      const chatCanvases = [...document.querySelectorAll('[data-canvas-id], [class*="canvas-block"], mat-card[class*="canvas"]')];
      const allNodes = [...new Set([...nodes, ...chatCanvases])];

      allNodes.forEach((node, idx) => {
        const nameEl = node.querySelector('[class*="title"], [class*="name"], h3, strong') || node;
        const rawName = nameEl.textContent?.trim() || `Canvas ${idx + 1}`;
        results.push({
          node,
          isSidebar: sidebar ? sidebar.contains(node) : false,
          source: 'generated', score: 10,
          data: {
            name: rawName, type: 'CANVAS', id: node.getAttribute('data-canvas-id') || node.id || null,
            ariaLabel: node.getAttribute('aria-label') || rawName, rawText: rawName,
            slug: rawName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, ''), _firstSeen: ''
          },
          origIndex: idx,
        });
      });
      return results;
    }

    function getGeminiChatTitle() {
      return document.querySelector('[class*="conversation-title"]')?.textContent?.trim() || document.querySelector('h1')?.textContent?.trim() || document.title.replace(' - Gemini', '').trim() || getChatId();
    }

    function injectGeminiToggleButtons() {
      if (document.getElementById('gcs-panel-toggle-group')) return;
      const toolbar = document.querySelector('.right-section') || document.querySelector('mat-toolbar') || document.querySelector('[class*="toolbar"]') || document.querySelector('header') || document.querySelector('nav');
      if (!toolbar) return;

      const group = document.createElement('div');
      group.id = 'gcs-panel-toggle-group';
      group.style.cssText = 'display:flex;align-items:center;gap:6px;margin:0 12px;';
      group.innerHTML = `
        <button id="gcs-panel-toggle-main" style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;color:#f0c040;border:1px solid rgba(240,192,64,0.3);background:rgba(20,22,26,0.8);cursor:pointer;transition:all 0.2s;" title="Open Canvas Sorter">⬡</button>
        <button id="gcs-panel-toggle-summary" style="display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:8px;color:#aaa;border:1px solid rgba(255,255,255,0.15);background:rgba(20,22,26,0.8);cursor:pointer;transition:all 0.2s;" title="GCS Chat Summary">⌬</button>
      `;

      group.querySelector('#gcs-panel-toggle-main').addEventListener('mouseover', function () { this.style.background = 'rgba(240,192,64,0.1)'; });
      group.querySelector('#gcs-panel-toggle-main').addEventListener('mouseout', function () { this.style.background = 'rgba(20,22,26,0.8)'; });

      group.querySelector('#gcs-panel-toggle-main').addEventListener('click', () => {
        buildPanel();
        setTimeout(() => document.getElementById('cas-scan')?.click(), 150);
      });

      group.querySelector('#gcs-panel-toggle-summary').addEventListener('click', () => {
        if (!document.getElementById('cas-flyout-panel')) buildFlyout();
        const el = document.getElementById('cas-flyout-panel');
        if (el) {
          const isVisible = el.style.display !== 'none';
          el.style.display = isVisible ? 'none' : 'flex';
          group.querySelector('#gcs-panel-toggle-summary').style.color = isVisible ? '#aaa' : '#f0c040';
          if (!isVisible) renderChatSummaries();
        }
      });

      // Inject before the "upsell" or help buttons if they exist
      const upsell = toolbar.querySelector('[aria-label*="Gemini Advanced"], [href*="advanced"]');
      if (upsell) {
        toolbar.insertBefore(group, upsell);
      } else {
        toolbar.appendChild(group);
      }
    }

    async function registerGeminiChat(items) {
      const chatId = getChatId();
      const indexKey = 'cas_standalone_chat_index';
      const storage = await new Promise(r => chrome.storage.local.get(indexKey, d => r(d[indexKey] || {})));

      storage[chatId] = {
        name: getGeminiChatTitle(),
        projectId: null,
        projectName: '(Gemini)',
        artifactCount: items.length,
        lastSeen: fmtNow()
      };
      await new Promise(r => chrome.storage.local.set({ [indexKey]: storage }, r));
    }

    function scanGeminiForFileList() {
      const items = scanGeminiCanvases();
      recordFirstSeen(items);
      registerGeminiChat(items);
      return items;
    }

    let gcsCurrentChatId = null;
    function onGeminiChatChange() {
      const newId = getChatId();
      if (newId === gcsCurrentChatId) return;
      gcsCurrentChatId = newId;

      const panelStatus = document.getElementById('cas-status');
      if (panelStatus) panelStatus.textContent = 'GCS: Conversation changed — scanning…';

      const items = scanGeminiForFileList();
      if (document.getElementById(PANEL_ID)) {
        const list = document.getElementById('cas-list');
        const status = document.getElementById('cas-status');
        const dataNote = document.getElementById('cas-data-note');
        const dataSummary = document.getElementById('cas-data-summary');
        if (list) renderList(items, list, status, dataNote, dataSummary);
      }
      renderChatSummaries();
    }

    // Initialize Gemini hooks
    setInterval(() => {
      injectGeminiToggleButtons();
      const sidebar = findGeminiFilesSidebar();
      if (sidebar && !sidebar.querySelector('#cas-sidebar-bar')) {
        const items = scanGeminiForFileList();
        if (items.length > 0) injectSidebarSortBar(items);
      }
    }, 1500);

    // Watch for chat changes in Gemini (SPA navigation)
    ['pushState', 'replaceState'].forEach(fn => {
      const orig = history[fn].bind(history);
      history[fn] = function (...args) {
        orig(...args);
        onGeminiChatChange();
      };
    });
    window.addEventListener('popstate', onGeminiChatChange);

    const geminiTitleEl = document.querySelector('title');
    if (geminiTitleEl) {
      new MutationObserver(onGeminiChatChange).observe(geminiTitleEl, { subtree: true, characterData: true, childList: true });
    }
  }

})();
