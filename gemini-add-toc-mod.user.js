// ==UserScript==
// @name         Google Gemini AI: Add Table of Contents (TOC) to Chats mod
// @namespace    Violentmonkey userscripts by ReporterX
// @author       ReporterX, plusminus_
// @version      1.1
// @description  Add a floating Table of Contents (TOC) with high-contrast text to each Google Gemini chat. This would allow users to easily jump to any section of the chat with a single click. The TOC is adjustable, remembering its size and position for a consistent experience across all chats.
// @match        https://gemini.google.com/*
// @grant        none
// @icon         https://www.google.com/s2/favicons?sz=64&domain=gemini.google.com
// @license      MIT
// ==/UserScript==
 
(function () {
  "use strict";
 
  // Saves the TOC's current position and size to localStorage.
  function saveTOCState(toc, isCollapsed) {
    const state = {
      top: toc.style.top,
      left: toc.style.left,
      width: toc.style.width,
      height: isCollapsed ? (toc.dataset.expandedHeight || "300px") : toc.style.height,
      collapsed: isCollapsed,
    };
    localStorage.setItem("gemini-toc-state", JSON.stringify(state));
  }
 
  // Loads the TOC's saved state from localStorage.
  function loadTOCState() {
    const state = localStorage.getItem("gemini-toc-state");
    return state ? JSON.parse(state) : null;
  }
 
  // Creates and initializes the main TOC element.
  function createTOC() {
    const toc = document.createElement("div");
    toc.id = "gemini-toc";
 
    const savedState = loadTOCState();
    const initialState = {
      top: savedState?.top || "20px",
      left: savedState?.left || "auto",
      right: savedState?.left ? "auto" : "20px",
      width: savedState?.width || "250px",
      height: savedState?.height || "300px",
      collapsed: savedState?.collapsed || false,
    };
 
    toc.dataset.expandedHeight = initialState.height;
 
    toc.style.cssText = `
      position: fixed;
      top: ${initialState.top};
      left: ${initialState.left};
      right: ${initialState.right};
      width: ${initialState.width};
      height: ${initialState.collapsed ? "auto" : initialState.height};
      background: rgba(248, 249, 250, 0.85);
      border: 1px solid #c4c7c5;
      border-radius: 8px;
      padding: 0;
      z-index: 10000;
      opacity: 0.5;
      transition: opacity 0.25s ease, background-color 0.25s ease, box-shadow 0.25s ease;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-family: Google Sans, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      backdrop-filter: blur(8px);
    `;
 
    // Create the draggable header bar.
    const header = document.createElement("div");
    header.style.cssText = `
      margin: 0;
      padding: 6px 10px;
      font-size: 11px;
      color: #444746;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #e1e3e1;
      font-weight: 700;
      letter-spacing: 0.5px;
      cursor: move;
      background-color: rgba(230, 233, 239, 0.9);
      user-select: none;
    `;
 
    const headerTitle = document.createElement("span");
    headerTitle.textContent = "TABLE OF CONTENTS";
    headerTitle.style.pointerEvents = "none";
    header.appendChild(headerTitle);
 
    // Create the collapse/expand toggle button.
    const toggleBtn = document.createElement("button");
    toggleBtn.textContent = initialState.collapsed ? "+" : "−";
    toggleBtn.title = initialState.collapsed ? "Expand TOC" : "Collapse TOC";
    toggleBtn.style.cssText = `
      background: transparent;
      border: none;
      color: #444746;
      font-size: 14px;
      line-height: 1;
      cursor: pointer;
      padding: 0 4px;
      font-weight: bold;
      outline: none;
    `;
    header.appendChild(toggleBtn);
    toc.appendChild(header);
 
    const content = document.createElement("div");
    content.id = "gemini-toc-content";
    content.style.cssText = `
      overflow-y: auto;
      flex-grow: 1;
      padding: 8px;
      min-width: 0;
      display: ${initialState.collapsed ? "none" : "block"};
    `;
    toc.appendChild(content);
 
    // Toggle button handler.
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isCurrentlyCollapsed = content.style.display === "none";
 
      if (isCurrentlyCollapsed) {
        content.style.display = "block";
        toc.style.height = toc.dataset.expandedHeight || "300px";
        toggleBtn.textContent = "−";
        toggleBtn.title = "Collapse TOC";
        saveTOCState(toc, false);
      } else {
        toc.dataset.expandedHeight = toc.style.height;
        content.style.display = "none";
        toc.style.height = "auto";
        toggleBtn.textContent = "+";
        toggleBtn.title = "Expand TOC";
        saveTOCState(toc, true);
      }
    });
 
    // Hover effect for main TOC block
    toc.addEventListener("mouseenter", () => {
      toc.style.opacity = "1.0";
      toc.style.background = "rgba(255, 255, 255, 0.98)";
      toc.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.22)";
    });
    toc.addEventListener("mouseleave", () => {
      toc.style.opacity = "0.5";
      toc.style.background = "rgba(248, 249, 250, 0.85)";
      toc.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    });
 
    document.body.appendChild(toc);
    makeInteractive(toc, header);
 
    return toc;
  }
 
  // Interaction logic for dragging and resizing.
  function makeInteractive(element, header) {
    let action = null;
    let startX, startY, startWidth, startHeight, startLeft, startTop;
    const minWidth = 150;
    const minHeight = 100;
 
    function getResizeDirection(e) {
      const content = element.querySelector("#gemini-toc-content");
      if (content && content.style.display === "none") return null;
 
      const rect = element.getBoundingClientRect();
      const zone = 8;
      const onRight = e.clientX > rect.right - zone;
      const onLeft = e.clientX < rect.left + zone;
      const onBottom = e.clientY > rect.bottom - zone;
 
      if (onRight && onBottom) return "se";
      if (onLeft && onBottom) return "sw";
      if (onRight) return "e";
      if (onLeft) return "w";
      if (onBottom) return "s";
      return null;
    }
 
    function onMouseDown(e) {
      if (e.button !== 0) return;
 
      const resizeDir = getResizeDirection(e);
      const isHeaderClick = header.contains(e.target) && e.target.tagName !== "BUTTON";
 
      if (isHeaderClick && !resizeDir) {
        action = { type: "drag" };
      } else if (resizeDir) {
        action = { type: "resize", dir: resizeDir };
      } else {
        return;
      }
 
      e.preventDefault();
      e.stopPropagation();
 
      const rect = element.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startWidth = rect.width;
      startHeight = rect.height;
      startLeft = rect.left;
      startTop = rect.top;
 
      element.style.right = "auto";
      element.style.left = `${startLeft}px`;
      element.style.top = `${startTop}px`;
 
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    }
 
    function onMouseMove(e) {
      if (!action) return;
 
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
 
      if (action.type === "drag") {
        element.style.left = `${startLeft + dx}px`;
        element.style.top = `${startTop + dy}px`;
      } else if (action.type === "resize") {
        if (action.dir.includes("e")) {
          element.style.width = `${Math.max(minWidth, startWidth + dx)}px`;
        }
        if (action.dir.includes("w")) {
          const newWidth = Math.max(minWidth, startWidth - dx);
          element.style.width = `${newWidth}px`;
          element.style.left = `${startLeft + startWidth - newWidth}px`;
        }
        if (action.dir.includes("s")) {
          const newHeight = Math.max(minHeight, startHeight + dy);
          element.style.height = `${newHeight}px`;
          element.dataset.expandedHeight = `${newHeight}px`;
        }
      }
    }
 
    function onMouseUp() {
      if (action) {
        const content = element.querySelector("#gemini-toc-content");
        const isCollapsed = content && content.style.display === "none";
        saveTOCState(element, isCollapsed);
      }
      action = null;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
 
    function updateCursor(e) {
      if (action) return;
      const resizeDir = getResizeDirection(e);
      element.style.cursor = resizeDir ? `${resizeDir}-resize` : "default";
      header.style.cursor = "move";
    }
 
    element.addEventListener("mousedown", onMouseDown);
    element.addEventListener("mousemove", updateCursor);
  }
 
  // Scans the DOM and groups paragraphs belonging to the same user message block.
  function findUserPrompts() {
    const prompts = [];
    const queryLines = document.querySelectorAll("p.query-text-line, p[class*='query-text']");
 
    if (queryLines.length > 0) {
      const promptMap = new Map();
 
      queryLines.forEach((line) => {
        const container =
          line.closest("user-query") ||
          line.closest(".user-query-container") ||
          line.closest('[role="user"]') ||
          line.parentElement;
 
        if (container) {
          if (!promptMap.has(container)) {
            promptMap.set(container, []);
          }
          const text = line.textContent.trim();
          if (text) {
            promptMap.get(container).push(text);
          }
        }
      });
 
      promptMap.forEach((lines, container) => {
        const fullPromptText = lines.join(" ").replace(/\s+/g, " ").trim();
        if (fullPromptText) {
          prompts.push({ element: container, text: fullPromptText });
        }
      });
 
      return prompts;
    }
 
    const fallbackContainers = document.querySelectorAll("user-query");
    const seenElements = new Set();
 
    fallbackContainers.forEach((container) => {
      if (!seenElements.has(container)) {
        seenElements.add(container);
        const text = container.textContent.replace(/\s+/g, " ").trim();
        if (text) {
          prompts.push({ element: container, text });
        }
      }
    });
 
    return prompts;
  }
 
  // Populates the TOC with user prompts.
  function updateTOC(tocContainer) {
    const contentContainer = tocContainer.querySelector("#gemini-toc-content");
    const prompts = findUserPrompts();
 
    while (contentContainer.firstChild) {
      contentContainer.removeChild(contentContainer.firstChild);
    }
 
    if (prompts.length === 0) {
      const noContent = document.createElement("div");
      noContent.textContent = "No chat found";
      noContent.style.cssText = `color: #747775; font-style: italic; text-align: center; padding: 15px 0; font-size: 12px;`;
      contentContainer.appendChild(noContent);
      return;
    }
 
    prompts.forEach((prompt, index) => {
      const item = document.createElement("div");
      item.className = "toc-item";
      item.style.cssText = `
        padding: 6px 8px;
        margin: 4px 0;
        background: rgba(235, 238, 243, 0.95);
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.15s ease, border-left-color 0.15s ease;
        font-size: 12px;
        line-height: 1.4;
        border-left: 3px solid #0b57d0;
        color: #1f1f1f;
      `;
 
      const itemText = document.createElement("span");
      itemText.style.cssText = `
        display: block;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: #1f1f1f;
        font-weight: 500;
      `;
      itemText.textContent = `${index + 1}. ${prompt.text}`;
      item.appendChild(itemText);
 
      item.addEventListener("mouseenter", () => {
        item.style.backgroundColor = "rgba(66, 133, 244, 0.15)";
        item.style.borderLeftColor = "#1a73e8";
      });
      item.addEventListener("mouseleave", () => {
        item.style.backgroundColor = "rgba(235, 238, 243, 0.95)";
        item.style.borderLeftColor = "#0b57d0";
      });
 
      item.addEventListener("click", () => {
        prompt.element.scrollIntoView({ behavior: "smooth", block: "center" });
        const originalBg = prompt.element.style.backgroundColor;
        prompt.element.style.transition = "background-color 0.5s ease";
        prompt.element.style.backgroundColor = "rgba(66, 133, 244, 0.2)";
        setTimeout(() => {
          prompt.element.style.backgroundColor = originalBg;
        }, 2000);
      });
 
      contentContainer.appendChild(item);
    });
  }
 
  // Initialization function.
  function init() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
      return;
    }
 
    const tocContainer = createTOC();
 
    setTimeout(() => {
      updateTOC(tocContainer);
    }, 1000);
 
    const observer = new MutationObserver(() => {
      clearTimeout(window.tocUpdateTimeout);
      window.tocUpdateTimeout = setTimeout(() => {
        updateTOC(tocContainer);
      }, 500);
    });
 
    observer.observe(document.body, { childList: true, subtree: true });
  }
 
  init();
})();
