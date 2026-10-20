// ==UserScript==
// @name         Confirm Duck.ai Chat Deletion
// @namespace    https://github.com/p1usminus/userscripts
// @author       plusminus_
// @version      1.2
// @license      MIT
// @description  Ask for confirmation before deleting a Duck.ai chat
// @match        https://duck.ai/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  // Prevent the synthetic click used after confirmation from being intercepted again.
  const approvedClicks = new WeakSet();

  // Exact accessible names for chat-deletion controls, e.g. the prompt-area button.
  const EXACT_DELETE_LABEL = /^\s*(delete|remove|burn|fire)\s+chat\s*$/i;

  // Looser matching, used only inside sidebar chat rows.
  const DELETE_WORDS = /\b(delete|remove|burn|fire)\b/i;

  // Sidebar chat rows. Class selectors are fragile because Duck.ai uses hashed
  // CSS-module class names, so only the stable attributes are used here.
  const CHAT_ROW_SELECTOR = [
    'li',
    '[data-chat-id]',
    '[data-testid*="chat" i]',
    '[data-test-id*="chat" i]'
  ].join(',');

  function getButton(target) {
    if (!(target instanceof Element)) return null;
    return target.closest('button, [role="button"]');
  }

  function getAccessibleText(button) {
    return [
      button.getAttribute('aria-label'),
      button.getAttribute('title'),
      button.getAttribute('data-testid'),
      button.getAttribute('data-test-id'),
      button.getAttribute('data-action')
    ]
      .filter(value => typeof value === 'string')
      .join(' ');
  }

  function isChatDeleteButton(button) {
    if (!button || !button.isConnected) return false;

    // Never intercept form submission or text entry.
    // Exclude explicit submit buttons. button.type is 'submit' by default for
    // buttons with no type attribute, so check the attribute instead.
    if (button.getAttribute('type') === 'submit') return false;
    if (button.closest('textarea, [contenteditable="true"]')) return false;

    // Exact match on the accessible name: works wherever the button sits,
    // including next to the reply box.
    const label = button.getAttribute('aria-label') || '';
    if (EXACT_DELETE_LABEL.test(label)) return true;

    // Looser match, restricted to sidebar chat rows so unrelated
    // "delete" or "fire" buttons elsewhere on the page are left alone.
    return DELETE_WORDS.test(getAccessibleText(button)) &&
      Boolean(button.closest(CHAT_ROW_SELECTOR));
  }

  function handleClick(event) {
    const button = getButton(event.target);
    if (!button) return;

    if (approvedClicks.has(button)) {
      approvedClicks.delete(button);
      return;
    }

    if (!isChatDeleteButton(button)) return;

    // Stop Duck.ai's original click handler until the user confirms.
    event.preventDefault();
    event.stopImmediatePropagation();

    const confirmed = window.confirm(
      'Delete this Duck.ai chat?\n\nThis action cannot be undone.'
    );

    if (!confirmed) return;

    // Run the site's own deletion logic rather than reproducing it.
    approvedClicks.add(button);
    button.click();
  }

  // Capture phase, so this runs before Duck.ai's bubbling click handlers.
  document.addEventListener('click', handleClick, true);
})();
