// ==UserScript==
// @name         Google Gemini - Automatically select High thinking level
// @namespace    https://github.com/p1usminus/userscripts
// @author       plusminus_
// @version      1.0
// @license      MIT
// @description  Selects High thinking level in Gemini's model menu on page load.
// @match        https://gemini.google.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(async () => {
  'use strict';

  const TIMEOUT_MS = 30_000;
  const POLL_MS = 250;
  const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"], [role="option"]';

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const log = (...args) => console.log('[Gemini High Thinking]', ...args);

  async function waitFor(find) {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      const el = find();
      if (el) return el;
      await sleep(POLL_MS);
    }
    return null;
  }

  const findSwitcher = () =>
    [...document.querySelectorAll('button[aria-haspopup], [role="button"][aria-haspopup]')]
      .find((b) => /gemini|flash|pro|thinking|advanced|high/.test(norm(b.textContent)));

  // Matches items whose visible text begins with the label, e.g. "High Extra thorough".
  const findItem = (label) =>
    [...document.querySelectorAll(ITEM_SELECTOR)]
      .find((el) => norm(el.textContent).startsWith(label));

  // Click the menu item itself with the pointer sequence frameworks expect.
  function clickItem(el) {
    const opts = { bubbles: true, cancelable: true, view: window, button: 0 };
    el.dispatchEvent(new PointerEvent('pointerdown', opts));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', opts));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
  }

  const switcher = await waitFor(findSwitcher);
  if (!switcher) return log('Model switcher not found.');
  log('Switcher text before:', norm(switcher.textContent));

  switcher.click();

  // "High" may be listed directly, or sit under a "Thinking" submenu.
  await waitFor(() => findItem('high') || findItem('thinking'));

  if (!findItem('high')) {
    const submenu = findItem('thinking');
    if (!submenu) return log('Neither "High" nor "Thinking" found in menu.');
    clickItem(submenu);
    await waitFor(() => findItem('high'));
  }

  const high = findItem('high');
  if (!high) return log('"High" option did not appear.');
  clickItem(high);

  await sleep(500);
  log('Switcher text after:', norm(findSwitcher()?.textContent));
  log('Clicked High option. Check whether the selection took effect.');
})();
