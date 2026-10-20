// ==UserScript==
// @name         Microsoft Copilot - Automatically select OpenAI/Think deeper
// @namespace    https://github.com/p1usminus/userscripts
// @version      2.1
// @license      MIT
// @author       Infrequent Me, plusminus_
// @description  Opens Copilot's model selector on page load and selects GPT -> Think deeper, if it is not already active.
// @icon         https://www.google.com/s2/favicons?sz=64&domain=m365.cloud.microsoft
// @match        https://m365.cloud.microsoft/*
// @match        https://copilot.microsoft.com/*
// @match        https://www.bing.com/chat*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(async () => {
  'use strict';

  const T0 = performance.now();
  const PATH = ['gpt', 'gpt-5.6 sol think deeper'];
  const FINAL = PATH[PATH.length - 1];
  const SWITCHER_LABEL = 'gpt-5.6 sol think'; // Copilot truncates the label on the switcher
  const SWITCHER_TIMEOUT_MS = 15_000; // the page can be slow to render
  const ITEM_TIMEOUT_MS = 6_000;
  const CONFIRM_TIMEOUT_MS = 4_000;
  const RUN_ATTEMPTS = 3;
  const ITEM_SELECTOR =
    '[role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], [role="option"], button';

  const norm = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const isVisible = (el) => el.getClientRects().length > 0;
  const log = (...args) =>
    console.log(`[Copilot Submenu Selector +${Math.round(performance.now() - T0)}ms]`, ...args);

  // Resolves as soon as find() is truthy, checked on DOM mutations and a fallback poll.
  function waitFor(find, timeout) {
    return new Promise((resolve) => {
      const first = find();
      if (first) return resolve(first);
      const obs = new MutationObserver(check);
      const poll = setInterval(check, 200);
      const timer = setTimeout(() => finish(null), timeout);
      function finish(v) {
        obs.disconnect();
        clearInterval(poll);
        clearTimeout(timer);
        resolve(v);
      }
      function check() {
        const v = find();
        if (v) finish(v);
      }
      obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    });
  }

  const findSwitcher = () =>
    document.querySelector('#gptModeSwitcher') ||
    document.querySelector('button[aria-label="Model Selector"]');

  // Exact match first, so "gpt" never matches "gpt-5.6 sol think deeper".
  function findItem(label) {
    const items = [...document.querySelectorAll(ITEM_SELECTOR)].filter(isVisible);
    return (
      items.find((el) => norm(el.textContent) === label) ||
      items.find((el) => norm(el.textContent).startsWith(label)) ||
      null
    );
  }

  const isOpen = (sw) => sw.getAttribute('aria-expanded') === 'true';

  async function closeMenu(sw) {
    if (!isOpen(sw)) return;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await sleep(150);
  }

  // Returns 'done', 'already', 'retry' (safe to try again), or 'clicked' (do not retry).
  async function navigate() {
    const sw = await waitFor(findSwitcher, SWITCHER_TIMEOUT_MS);
    log('Switcher', sw ? 'found' : 'NOT found');
    if (!sw) return 'retry';

    if (norm(sw.textContent).includes(SWITCHER_LABEL)) {
      log('Target already active.');
      return 'already';
    }

    await closeMenu(sw); // start from a known state
    sw.click();

    // Only open the submenu path if the target isn't already listed.
    if (!findItem(FINAL)) {
      let parent = await waitFor(() => findItem(PATH[0]), 2_000);
      if (!parent) {
        log('Menu did not open on first click; reopening.');
        await closeMenu(sw);
        await sleep(300);
        sw.click();
        parent = await waitFor(() => findItem(PATH[0]), ITEM_TIMEOUT_MS);
      }
      log(`Parent "${PATH[0]}"`, parent ? 'found' : 'NOT found');
      if (!parent) return 'retry';
      parent.click();
    }

    const target = await waitFor(() => findItem(FINAL), ITEM_TIMEOUT_MS);
    log('Target', target ? 'found' : 'NOT found');
    if (!target) return 'retry';

    target.click();
    log('Clicked target. aria-checked =', target.getAttribute('aria-checked'));

    const ok = await waitFor(
      () => (norm(findSwitcher()?.textContent).includes(SWITCHER_LABEL) ? true : null),
      CONFIRM_TIMEOUT_MS
    );
    log(ok ? 'Switcher confirms selection.' : 'Switcher text after click: ' + JSON.stringify(norm(findSwitcher()?.textContent)));
    return 'clicked';
  }

  for (let attempt = 1; attempt <= RUN_ATTEMPTS; attempt++) {
    try {
      const result = await navigate();
      if (result !== 'retry') return log('Finished:', result);
    } catch (error) {
      log('Error during navigation.', error);
    }
    if (attempt < RUN_ATTEMPTS) {
      log(`Retrying (${attempt + 1}/${RUN_ATTEMPTS})...`);
      await sleep(500);
    }
  }
  log('Gave up after retries.');
})();
