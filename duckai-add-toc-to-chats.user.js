// ==UserScript==
// @name         Duck.ai: Add Table of Contents (TOC) to Chats
// @namespace    https://github.com/p1usminus/userscripts
// @version      1.0
// @description  Adds a floating, draggable and resizable Table of Contents listing your prompts in each Duck.ai chat. Click an entry to jump to that message.
// @author       ReporterX, plusminus_
// @match        https://duck.ai/*
// @grant        none
// @license      MIT
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG = {
    // CSS selector matching ONE element per user prompt.
    // PLACEHOLDER: not verified against Duck.ai's live DOM. Confirm it on a real
    // chat with window.duckaiTocDiscover() in the DevTools console, then replace it.
    promptSelector: '[data-testid="user-message"]',
    storageKey: 'duckai-toc-state',
    refreshDelayMs: 400,
    defaults: { width: 250, height: 300, margin: 20 },
  };

  const TOC_ID = 'duckai-toc';
  const STYLE_ID = 'duckai-toc-style';

  let toc = null;
  let titleEl = null;
  let body = null;
  let toggleBtn = null;
  let lastSignature = null;

  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const finiteOr = (v, fallback) => (Number.isFinite(v) ? v : fallback);

  // Duck.ai sets data-theme="dark" | "light" on <html> before first paint,
  // so the dark variant keys off that attribute rather than the OS setting.
  const CSS = `
    #duckai-toc {
      position: fixed;
      z-index: 10000;
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      min-width: 160px;
      min-height: 40px;
      overflow: hidden;
      resize: both;
      border: 1px solid #c4c7c5;
      border-radius: 8px;
      background: rgba(248, 249, 250, 0.85);
      color: #1f1f1f;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: 'DuckSansProduct', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      opacity: 0.5;
      transition: opacity 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease;
      backdrop-filter: blur(8px);
    }
    #duckai-toc:hover {
      opacity: 1;
      background: rgba(255, 255, 255, 0.98);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.22);
    }
    #duckai-toc.collapsed {
      height: auto !important;
      min-height: 0;
      resize: none;
    }
    #duckai-toc.collapsed #duckai-toc-body {
      display: none;
    }
    #duckai-toc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
      padding: 6px 10px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.5px;
      color: #444746;
      background-color: rgba(230, 233, 239, 0.9);
      border-bottom: 1px solid #e1e3e1;
      cursor: move;
      user-select: none;
    }
    #duckai-toc-toggle {
      background: none;
      border: none;
      color: inherit;
      font: inherit;
      font-size: 14px;
      line-height: 1;
      padding: 0 4px;
      cursor: pointer;
    }
    #duckai-toc-body {
      flex: 1 1 auto;
      overflow-y: auto;
      padding: 8px;
    }
    .duckai-toc-item {
      margin: 4px 0;
      padding: 6px 8px;
      border-left: 3px solid #0b57d0;
      border-radius: 4px;
      background: rgba(235, 238, 243, 0.95);
      color: #1f1f1f;
      font-size: 12px;
      font-weight: 500;
      line-height: 1.4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: pointer;
      transition: background-color 0.15s ease, border-left-color 0.15s ease;
    }
    .duckai-toc-item:hover {
      background: rgba(66, 133, 244, 0.15);
      border-left-color: #1a73e8;
    }
    #duckai-toc-empty {
      padding: 12px 0;
      font-size: 12px;
      font-style: italic;
      text-align: center;
      color: #747775;
    }
    .duckai-toc-flash {
      outline: 2px solid #0b57d0;
      outline-offset: 4px;
      transition: outline-color 0.3s ease;
    }
  `;

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  // ---- Persistence -------------------------------------------------------

  function saveState() {
    if (!toc) return;
    const state = {
      left: parseFloat(toc.style.left),
      top: parseFloat(toc.style.top),
      width: parseFloat(toc.style.width),
      height: parseFloat(toc.style.height),
      collapsed: toc.classList.contains('collapsed'),
    };
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(state));
    } catch (_) {
      // Storage may be unavailable (e.g. private browsing); the TOC still works.
    }
  }

  function loadState() {
    try {
      return JSON.parse(localStorage.getItem(CONFIG.storageKey)) || null;
    } catch (_) {
      return null;
    }
  }

  // ---- Collapse / expand -------------------------------------------------

  function setCollapsed(collapsed, persist = true) {
    toc.classList.toggle('collapsed', collapsed);
    toggleBtn.textContent = collapsed ? '+' : '−';
    toggleBtn.title = collapsed ? 'Expand' : 'Collapse';
    if (persist) saveState();
  }

  // ---- Dragging (header only) -------------------------------------------

  function enableDrag(handle) {
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let origLeft = 0;
    let origTop = 0;

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || e.target.closest('button')) return;
      dragging = true;
      const rect = toc.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      origLeft = rect.left;
      origTop = rect.top;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    });

    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const maxLeft = window.innerWidth - toc.offsetWidth;
      const maxTop = window.innerHeight - handle.offsetHeight;
      toc.style.left = clamp(origLeft + e.clientX - startX, 0, maxLeft) + 'px';
      toc.style.top = clamp(origTop + e.clientY - startY, 0, maxTop) + 'px';
    });

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      saveState();
    };
    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', endDrag);
  }

  // ---- Build the panel ---------------------------------------------------

  function buildTOC() {
    const saved = loadState() || {};
    const { width: dw, height: dh, margin } = CONFIG.defaults;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const width = clamp(finiteOr(saved.width, dw), 160, vw);
    const height = clamp(finiteOr(saved.height, dh), 40, vh);
    const left = clamp(finiteOr(saved.left, vw - width - margin), 0, vw - width);
    const top = clamp(finiteOr(saved.top, margin), 0, vh - 40);

    toc = document.createElement('div');
    toc.id = TOC_ID;
    toc.style.width = width + 'px';
    toc.style.height = height + 'px';
    toc.style.left = left + 'px';
    toc.style.top = top + 'px';

    const header = document.createElement('div');
    header.id = 'duckai-toc-header';

    titleEl = document.createElement('span');
    titleEl.textContent = 'TABLE OF CONTENTS';

    toggleBtn = document.createElement('button');
    toggleBtn.id = 'duckai-toc-toggle';
    toggleBtn.type = 'button';

    header.append(titleEl, toggleBtn);

    body = document.createElement('div');
    body.id = 'duckai-toc-body';

    toc.append(header, body);
    document.body.appendChild(toc);

    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      setCollapsed(!toc.classList.contains('collapsed'));
    });

    setCollapsed(!!saved.collapsed, false);
    enableDrag(header);

    // Native CSS resize fires this on user resize; ignore it while collapsed.
    new ResizeObserver(() => {
      if (!toc.classList.contains('collapsed')) saveState();
    }).observe(toc);
  }

  // ---- Finding prompts and rendering the list ----------------------------

  function findPrompts() {
    const out = [];
    for (const el of document.querySelectorAll(CONFIG.promptSelector)) {
      if (toc && toc.contains(el)) continue;
      const last = out[out.length - 1];
      if (last && last.el.contains(el)) continue; // skip nested matches
      const text = (el.innerText || el.textContent || '')
        .replace(/^\s*You said\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (text) out.push({ el, text });
    }
    return out;
  }

  function jumpTo(el) {
    if (!el.isConnected) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('duckai-toc-flash');
    setTimeout(() => el.classList.remove('duckai-toc-flash'), 1500);
  }

  function refresh() {
    const prompts = findPrompts();
    const signature = prompts.map((p) => p.text).join('\n');

    // Only rebuild when the prompt list actually changed.
    if (signature === lastSignature) return;
    lastSignature = signature;

    titleEl.textContent = `TABLE OF CONTENTS (${prompts.length})`;
    body.replaceChildren();

    if (prompts.length === 0) {
      const empty = document.createElement('div');
      empty.id = 'duckai-toc-empty';
      empty.textContent = 'No prompts found. Run duckaiTocDiscover() in the console.';
      body.appendChild(empty);
      return;
    }

    prompts.forEach((p, i) => {
      const item = document.createElement('div');
      item.className = 'duckai-toc-item';
      item.textContent = `${i + 1}. ${p.text}`;
      item.title = p.text;
      item.addEventListener('click', () => jumpTo(p.el));
      body.appendChild(item);
    });
  }

  // ---- Console helper for finding the right selector ---------------------

  // Run window.duckaiTocDiscover() in DevTools on a chat page. It lists elements
  // whose class names or attributes mention user/human/prompt/query.
  window.duckaiTocDiscover = function () {
    const pattern = /user|human|prompt|query/i;
    const hits = [];
    document.querySelectorAll('body *').forEach((el) => {
      if (toc && toc.contains(el)) return;
      const cls = typeof el.className === 'string' ? el.className : '';
      const attrs = [...el.attributes].map((a) => `${a.name}="${a.value}"`).join(' ');
      if (pattern.test(cls) || pattern.test(attrs)) hits.push(el);
    });
    console.log(`[Duck.ai TOC] ${hits.length} candidate element(s):`);
    hits.slice(0, 40).forEach((el) => {
      console.log(el, '\n  text:', (el.innerText || '').slice(0, 60));
    });
    return hits;
  };

  // ---- Init --------------------------------------------------------------

  function init() {
    if (document.getElementById(TOC_ID)) return;
    injectStyles();
    buildTOC();
    refresh();

    // Ignore mutations inside the TOC itself to avoid a feedback loop.
    let timer = null;
    const observer = new MutationObserver((mutations) => {
      if (mutations.every((m) => toc.contains(m.target))) return;
      clearTimeout(timer);
      timer = setTimeout(refresh, CONFIG.refreshDelayMs);
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Fallback poll: refresh() returns early when nothing has changed, so this is cheap.
    setInterval(refresh, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
