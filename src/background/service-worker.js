/**
 * TabBatch PDF — background service worker (Manifest V3, module).
 *
 * Orchestrates multi-tab PDF capture using the Chrome DevTools Protocol
 * (`Page.printToPDF`) for true vector output, with extensive error handling,
 * cancellation, progress reporting and a keep-alive to survive long batches.
 */

import {
  inspectUrl,
  resolvePaper,
  pxToInches,
  clamp,
  sleep,
  withTimeout,
  truncate,
  base64ByteLength,
} from '../shared/utils.js';
import { getSettings } from '../shared/settings.js';
import { addPdfs, updatePdf, getPdf, countPdfs } from '../shared/db.js';
import { MSG } from '../shared/messages.js';

const DEBUGGER_PROTOCOL = '1.3';
const PRINT_TIMEOUT = 60000;
const ATTACH_TIMEOUT = 8000;

/** @type {{ active: boolean, cancelled: boolean, current: number, total: number, currentTitle: string }} */
const state = {
  active: false,
  cancelled: false,
  current: 0,
  total: 0,
  currentTitle: '',
  errors: [],
};

/* ----------------------------- keep-alive --------------------------------- */
let keepAliveTimer = null;
function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    // Touching an async API resets the service-worker idle timer.
    chrome.runtime.getPlatformInfo().catch(() => {});
  }, 20000);
}
function stopKeepAlive() {
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = null;
}

/* ----------------------------- lifecycle ---------------------------------- */
chrome.runtime.onInstalled.addListener((details) => {
  setupContextMenus();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html?welcome=1') }).catch(() => {});
  }
});
chrome.runtime.onStartup.addListener(setupContextMenus);

function setupContextMenus() {
  if (!chrome.contextMenus) return;
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'capture-current',
      title: 'Capture this page as PDF',
      contexts: ['page', 'action'],
    });
    chrome.contextMenus.create({
      id: 'capture-window',
      title: 'Capture all tabs in this window',
      contexts: ['action'],
    });
    chrome.contextMenus.create({
      id: 'open-manager',
      title: 'Open PDF Manager',
      contexts: ['action'],
    });
  });
}

chrome.contextMenus?.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'capture-current' && tab) {
    runCapture([tab.id]).catch((e) => console.error(e));
  } else if (info.menuItemId === 'capture-window') {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    runCapture(tabs.map((t) => t.id)).catch((e) => console.error(e));
  } else if (info.menuItemId === 'open-manager') {
    openManager();
  }
});

chrome.commands?.onCommand.addListener(async (command) => {
  if (command === 'capture-all') {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    runCapture(tabs.map((t) => t.id)).catch((e) => console.error(e));
  } else if (command === 'capture-current') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) runCapture([tab.id]).catch((e) => console.error(e));
  }
});

/* ----------------------------- messaging ---------------------------------- */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message?.action) {
        case MSG.LIST_TABS:
          sendResponse({ success: true, tabs: await listTabs(message.scope) });
          break;
        case MSG.GET_STATE:
          sendResponse({ success: true, state: publicState() });
          break;
        case MSG.CAPTURE:
          if (state.active) {
            sendResponse({ success: false, error: 'A capture is already running.' });
          } else {
            // Fire and forget; progress is broadcast separately.
            runCapture(message.tabIds, message.overrides).catch((e) =>
              console.error('Capture failed:', e),
            );
            sendResponse({ success: true });
          }
          break;
        case MSG.CAPTURE_CURRENT: {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (!tab) { sendResponse({ success: false, error: 'No active tab.' }); break; }
          runCapture([tab.id], message.overrides).catch((e) => console.error(e));
          sendResponse({ success: true });
          break;
        }
        case MSG.CANCEL:
          state.cancelled = true;
          sendResponse({ success: true });
          break;
        case MSG.RECAPTURE:
          await recapture(message.id);
          sendResponse({ success: true });
          break;
        default:
          sendResponse({ success: false, error: 'Unknown action' });
      }
    } catch (error) {
      console.error('Message handler error:', error);
      sendResponse({ success: false, error: error?.message || String(error) });
    }
  })();
  return true; // async
});

function publicState() {
  return {
    active: state.active,
    current: state.current,
    total: state.total,
    currentTitle: state.currentTitle,
    errors: state.errors.slice(),
  };
}

/* ------------------------------ tab listing -------------------------------- */
async function listTabs(scope = 'window') {
  const query = scope === 'all' ? {} : { currentWindow: true };
  const tabs = await chrome.tabs.query(query);
  return tabs.map((tab) => {
    const check = inspectUrl(tab.url || tab.pendingUrl || '');
    return {
      id: tab.id,
      windowId: tab.windowId,
      title: tab.title || tab.url || 'Untitled',
      url: tab.url || tab.pendingUrl || '',
      favIconUrl: tab.favIconUrl || '',
      active: tab.active,
      discarded: !!tab.discarded,
      capturable: check.ok,
      reason: check.reason || '',
    };
  });
}

/* ------------------------------ orchestration ------------------------------ */
async function runCapture(tabIds, overrides) {
  if (state.active) throw new Error('Capture already running');

  const settings = { ...(await getSettings()), ...(overrides || {}) };
  startKeepAlive();

  // Resolve the requested tabs and split capturable vs not.
  const resolved = [];
  for (const id of tabIds || []) {
    try {
      const tab = await chrome.tabs.get(id);
      resolved.push(tab);
    } catch {
      /* tab closed since selection */
    }
  }
  const targets = resolved.filter((t) => inspectUrl(t.url || '').ok);

  if (targets.length === 0) {
    stopKeepAlive();
    notify('Nothing to capture', 'No selected tabs can be captured.');
    broadcast(MSG.ERROR, { error: 'No capturable tabs were selected.' });
    return;
  }

  // Remember which tab was active so we can restore focus afterwards.
  let originalActiveId = null;
  try {
    const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
    originalActiveId = active?.id ?? null;
  } catch {}

  Object.assign(state, {
    active: true,
    cancelled: false,
    current: 0,
    total: targets.length,
    currentTitle: '',
    errors: [],
  });
  setBadge(`0/${targets.length}`, '#4f46e5');

  const captured = [];
  try {
    for (let i = 0; i < targets.length; i++) {
      if (state.cancelled) break;
      const tab = targets[i];
      state.current = i + 1;
      state.currentTitle = tab.title || tab.url;
      setBadge(`${i + 1}`, '#4f46e5');
      broadcast(MSG.PROGRESS, {
        current: i + 1,
        total: targets.length,
        title: truncate(tab.title || tab.url, 50),
      });

      try {
        const record = await withTimeout(
          captureTab(tab, settings),
          PRINT_TIMEOUT + 20000,
          `capture ${tab.id}`,
        );
        captured.push(record);
      } catch (error) {
        console.error(`Tab ${tab.id} failed:`, error);
        state.errors.push({ title: tab.title, error: error?.message || String(error) });
      }
    }

    if (captured.length > 0) {
      await addPdfs(captured);
    }

    const total = await countPdfs();
    if (state.cancelled) {
      notify('Capture cancelled', `Saved ${captured.length} before stopping.`);
    } else if (state.errors.length) {
      notify(
        'Capture finished with warnings',
        `${captured.length} captured, ${state.errors.length} skipped.`,
      );
    } else {
      notify('Capture complete', `${captured.length} page${captured.length === 1 ? '' : 's'} ready.`);
    }

    broadcast(MSG.DONE, {
      captured: captured.length,
      errors: state.errors.slice(),
      total,
    });

    if (settings.autoOpenManager && captured.length > 0) {
      await openManager();
    }
  } finally {
    // Restore the user's original tab focus.
    if (originalActiveId != null) {
      chrome.tabs.update(originalActiveId, { active: true }).catch(() => {});
    }
    state.active = false;
    state.current = 0;
    state.total = 0;
    state.currentTitle = '';
    setBadge('', '#4f46e5');
    stopKeepAlive();
  }
}

/* --------------------------- single tab capture ---------------------------- */
async function captureTab(tab, settings) {
  // Wake discarded/sleeping tabs.
  if (tab.discarded || tab.status === 'unloaded') {
    await chrome.tabs.reload(tab.id);
    await waitForTabComplete(tab.id, 15000);
    tab = await chrome.tabs.get(tab.id);
  }

  const debuggee = { tabId: tab.id };
  let attached = false;
  let injected = false;

  try {
    await withTimeout(chrome.debugger.attach(debuggee, DEBUGGER_PROTOCOL), ATTACH_TIMEOUT, 'attach');
    attached = true;
    await sendCmd(debuggee, 'Page.enable');
    await sendCmd(debuggee, 'Emulation.setEmulatedMedia', { media: 'screen' }).catch(() => {});

    // Prepare the page: lazy-load content and optionally hide sticky chrome.
    const metrics = await preparePage(tab.id, settings).catch(() => null);
    injected = true;

    // Optional thumbnail (requires the tab to be visible).
    let thumbnailDataUrl = null;
    if (settings.thumbnails) {
      thumbnailDataUrl = await captureThumbnail(tab, settings).catch(() => null);
    }

    await sleep(clamp(settings.waitForContent, 0, 15000));

    const printParams = buildPrintParams(settings, metrics);
    const { data } = await withTimeout(
      sendCmd(debuggee, 'Page.printToPDF', printParams),
      PRINT_TIMEOUT,
      'printToPDF',
    );

    if (!data || data.length < 100) {
      throw new Error('Renderer returned an empty PDF');
    }

    return {
      title: tab.title || 'Untitled',
      url: tab.url,
      pdfBase64: data,
      thumbnailDataUrl,
      byteSize: base64ByteLength(data),
      pageCount: null,
      mode: printParams.__mode,
      timestamp: Date.now(),
      status: 'ok',
    };
  } finally {
    if (injected) {
      await restorePage(tab.id).catch(() => {});
    }
    if (attached) {
      await chrome.debugger.detach(debuggee).catch(() => {});
    }
  }
}

/** Compose `Page.printToPDF` params from settings + measured metrics. */
function buildPrintParams(settings, metrics) {
  const base = {
    printBackground: !!settings.printBackground,
    scale: clamp(Number(settings.scale) || 1, 0.1, 2),
    marginTop: 0,
    marginBottom: 0,
    marginLeft: 0,
    marginRight: 0,
    displayHeaderFooter: false,
    preferCSSPageSize: false,
    transferMode: 'ReturnAsBase64',
  };

  const fitsSinglePage =
    metrics &&
    metrics.heightInches > 0 &&
    metrics.heightInches <= Number(settings.maxPageHeightInches);

  if (settings.captureMode === 'single' && fitsSinglePage) {
    return {
      ...base,
      paperWidth: clamp(metrics.widthInches, 1, 200),
      paperHeight: clamp(metrics.heightInches, 1, Number(settings.maxPageHeightInches)),
      __mode: 'single',
    };
  }

  // Paged fallback (also used when a single page would exceed the safe cap).
  let orientation = settings.orientation;
  if (
    settings.captureMode === 'paged' &&
    settings.landscapeAutoWide &&
    metrics &&
    metrics.widthInches > metrics.heightInches
  ) {
    orientation = 'landscape';
  }
  const paper = resolvePaper(settings.paperSize, orientation);
  const margin = clamp(Number(settings.margin) || 0, 0, 3);
  return {
    ...base,
    paperWidth: paper.width,
    paperHeight: paper.height,
    marginTop: margin,
    marginBottom: margin,
    marginLeft: margin,
    marginRight: margin,
    __mode: 'paged',
  };
}

/**
 * Inject a script that (optionally) scrolls to trigger lazy content, hides
 * sticky/fixed headers & footers, and reports the full document size.
 * @returns {Promise<{ widthInches:number, heightInches:number }>}
 */
async function preparePage(tabId, settings) {
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (opts) => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));

      if (opts.scrollToBottom) {
        const originalScroll = window.scrollY;
        let last = -1;
        for (let i = 0; i < 30; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await wait(60);
          const h = document.body.scrollHeight;
          if (h === last) break;
          last = h;
        }
        // decode <img loading=lazy>
        document.querySelectorAll('img[loading="lazy"]').forEach((img) => {
          img.loading = 'eager';
        });
        window.scrollTo(0, originalScroll);
        await wait(50);
      }

      const tagHidden = (el) => {
        el.setAttribute('data-tabbatch-hidden', '1');
        el.dataset.tabbatchDisplay = el.style.display;
        el.style.setProperty('display', 'none', 'important');
      };

      if (opts.removeStickyHeaders || opts.removeFooters) {
        const all = document.querySelectorAll('body *');
        for (const el of all) {
          const cs = getComputedStyle(el);
          if (cs.position === 'fixed' || cs.position === 'sticky') {
            const rectTop = el.getBoundingClientRect().top;
            const isFooter = /footer/i.test(el.className) || /footer/i.test(el.id);
            if (opts.removeFooters && isFooter) { tagHidden(el); continue; }
            if (opts.removeStickyHeaders) tagHidden(el);
          }
        }
      }

      // Wait for outstanding images to settle (max 1.2s).
      const imgs = Array.from(document.images).filter((i) => !i.complete);
      await Promise.race([
        Promise.all(imgs.map((i) => new Promise((res) => { i.onload = i.onerror = res; }))),
        wait(1200),
      ]);

      const body = document.body;
      const html = document.documentElement;
      const height = Math.max(
        body.scrollHeight, body.offsetHeight,
        html.scrollHeight, html.offsetHeight, html.clientHeight,
      );
      const width = Math.max(
        body.scrollWidth, body.offsetWidth,
        html.scrollWidth, html.offsetWidth, html.clientWidth,
      );
      return { width, height };
    },
    args: [{
      scrollToBottom: !!settings.scrollToBottom,
      removeFooters: !!settings.removeFooters && settings.captureMode === 'single',
      removeStickyHeaders: !!settings.removeStickyHeaders && settings.captureMode === 'single',
    }],
  });

  if (!result) throw new Error('Could not measure page');
  return {
    widthInches: Math.max(pxToInches(result.width), 3),
    heightInches: Math.max(pxToInches(result.height), 1),
  };
}

/** Undo any DOM changes made by {@link preparePage}. */
async function restorePage(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      document.querySelectorAll('[data-tabbatch-hidden="1"]').forEach((el) => {
        el.style.display = el.dataset.tabbatchDisplay || '';
        el.removeAttribute('data-tabbatch-hidden');
        delete el.dataset.tabbatchDisplay;
      });
    },
  });
}

async function captureThumbnail(tab, settings) {
  await chrome.tabs.update(tab.id, { active: true });
  await sleep(250);
  return chrome.tabs.captureVisibleTab(tab.windowId, {
    format: 'jpeg',
    quality: clamp(settings.thumbnailQuality, 1, 100),
  });
}

/* ------------------------------ recapture ---------------------------------- */
async function recapture(id) {
  const record = await getPdf(id);
  if (!record) throw new Error('Record not found');
  const settings = { ...(await getSettings()), captureMode: record.mode || 'single' };

  let [tab] = await chrome.tabs.query({ url: record.url });
  let createdTab = false;
  if (!tab) {
    tab = await chrome.tabs.create({ url: record.url, active: false });
    createdTab = true;
    await waitForTabComplete(tab.id, 20000);
    tab = await chrome.tabs.get(tab.id);
  }

  startKeepAlive();
  try {
    const fresh = await captureTab(tab, settings);
    await updatePdf(id, {
      pdfBase64: fresh.pdfBase64,
      thumbnailDataUrl: fresh.thumbnailDataUrl,
      byteSize: fresh.byteSize,
      timestamp: Date.now(),
      mode: fresh.mode,
      status: 'ok',
    });
  } finally {
    stopKeepAlive();
    if (createdTab) chrome.tabs.remove(tab.id).catch(() => {});
  }
}

/* ------------------------------- helpers ----------------------------------- */
function sendCmd(debuggee, method, params) {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, method, params || {}, (result) => {
      const err = chrome.runtime.lastError;
      if (err) reject(new Error(`${method}: ${err.message}`));
      else resolve(result || {});
    });
  });
}

function waitForTabComplete(tabId, timeout = 15000) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') finish();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((t) => {
      if (t && t.status === 'complete') finish();
    }).catch(finish);
    setTimeout(finish, timeout);
  });
}

async function openManager() {
  const url = chrome.runtime.getURL('src/manager/manager.html');
  const existing = await chrome.tabs.query({ url });
  if (existing.length > 0) {
    await chrome.tabs.update(existing[0].id, { active: true });
    await chrome.tabs.reload(existing[0].id);
  } else {
    await chrome.tabs.create({ url });
  }
}

function broadcast(type, payload) {
  chrome.runtime.sendMessage({ type, ...payload }).catch(() => {});
}

async function notify(title, message) {
  const settings = await getSettings().catch(() => ({ notifications: true }));
  if (!settings.notifications || !chrome.notifications) return;
  chrome.notifications.create({
    type: 'basic',
    iconUrl: chrome.runtime.getURL('icons/icon128.png'),
    title,
    message,
    priority: 0,
    silent: !settings.soundOnComplete,
  }, () => void chrome.runtime.lastError);
}

function setBadge(text, color) {
  if (!chrome.action) return;
  chrome.action.setBadgeText({ text: text || '' }).catch(() => {});
  if (color) chrome.action.setBadgeBackgroundColor({ color }).catch(() => {});
}
