import { MSG } from '../shared/messages.js';
import { getSettings, saveSettings } from '../shared/settings.js';
import { truncate, hostFromUrl } from '../shared/utils.js';

const $ = (id) => document.getElementById(id);
const el = {
  setupView: $('setupView'),
  progressView: $('progressView'),
  scopeSeg: $('scopeSeg'),
  modeSeg: $('modeSeg'),
  paperRow: $('paperRow'),
  paperSel: $('paperSel'),
  orientSel: $('orientSel'),
  tabList: $('tabList'),
  selCount: $('selCount'),
  selectAll: $('selectAll'),
  selectNone: $('selectNone'),
  captureBtn: $('captureBtn'),
  captureLabel: $('captureLabel'),
  captureCurrent: $('captureCurrent'),
  openManager2: $('openManager2'),
  managerBtn: $('managerBtn'),
  optionsBtn: $('optionsBtn'),
  toast: $('toast'),
  version: $('version'),
  progTitle: $('progTitle'),
  progCur: $('progCur'),
  progFill: $('progFill'),
  progPct: $('progPct'),
  cancelBtn: $('cancelBtn'),
};

let settings = null;
let scope = 'window';
let tabs = [];
const selected = new Set();

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.dataset.theme = theme;
  } else {
    delete document.documentElement.dataset.theme;
  }
}

function send(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(res || { success: false });
    });
  });
}

function toast(msg) {
  el.toast.textContent = msg;
  el.toast.classList.remove('hidden');
  setTimeout(() => el.toast.classList.add('hidden'), 3500);
}

async function init() {
  settings = await getSettings();
  applyTheme(settings.theme);
  el.version.textContent = 'v' + (chrome.runtime.getManifest().version || '2.0.0');

  scope = settings.captureScope === 'all' ? 'all' : 'window';
  setSeg(el.scopeSeg, 'scope', scope);
  setSeg(el.modeSeg, 'mode', settings.captureMode);
  el.paperSel.value = settings.paperSize;
  el.orientSel.value = settings.orientation;
  updatePaperVisibility();

  bindEvents();

  // If a capture is already running, jump straight to progress.
  const st = await send({ action: MSG.GET_STATE });
  if (st.success && st.state.active) {
    showProgress();
    el.progPct.textContent = `${st.state.current} / ${st.state.total}`;
    el.progCur.textContent = truncate(st.state.currentTitle, 46);
  }

  await loadTabs();
}

function setSeg(seg, attr, value) {
  seg.querySelectorAll('button').forEach((b) => {
    b.classList.toggle('active', b.dataset[attr] === value);
  });
}

function updatePaperVisibility() {
  const paged = el.modeSeg.querySelector('.active')?.dataset.mode === 'paged';
  el.paperRow.style.display = paged ? 'flex' : 'none';
}

async function loadTabs() {
  const res = await send({ action: MSG.LIST_TABS, scope });
  if (!res.success) {
    el.tabList.innerHTML = `<div class="empty">Couldn't read tabs: ${res.error || 'unknown error'}</div>`;
    return;
  }
  tabs = res.tabs || [];
  selected.clear();
  tabs.forEach((t) => { if (t.capturable) selected.add(t.id); });
  renderTabs();
}

function renderTabs() {
  if (tabs.length === 0) {
    el.tabList.innerHTML = '<div class="empty">No tabs found.</div>';
    return;
  }
  el.tabList.innerHTML = '';
  for (const t of tabs) {
    const item = document.createElement('label');
    item.className = 'tab-item' + (t.capturable ? '' : ' disabled');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = selected.has(t.id);
    cb.disabled = !t.capturable;
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(t.id); else selected.delete(t.id);
      updateSelCount();
    });

    const fav = document.createElement('img');
    fav.className = 'fav';
    fav.src = t.favIconUrl || '../../icons/icon16.png';
    fav.onerror = () => { fav.src = '../../icons/icon16.png'; };

    const meta = document.createElement('div');
    meta.className = 'meta';
    const title = document.createElement('div');
    title.className = 't-title';
    title.textContent = t.title || t.url;
    const sub = document.createElement('div');
    sub.className = t.capturable ? 't-url' : 't-reason';
    sub.textContent = t.capturable ? (hostFromUrl(t.url) || t.url) : t.reason;
    meta.append(title, sub);

    item.append(cb, fav, meta);
    el.tabList.appendChild(item);
  }
  updateSelCount();
}

function updateSelCount() {
  const n = selected.size;
  el.selCount.textContent = `${n} selected`;
  el.captureBtn.disabled = n === 0;
  el.captureLabel.textContent = n === 0 ? 'Capture Selected' : `Capture ${n} Tab${n === 1 ? '' : 's'}`;
}

function currentOverrides() {
  const mode = el.modeSeg.querySelector('.active').dataset.mode;
  return {
    captureMode: mode,
    paperSize: el.paperSel.value,
    orientation: el.orientSel.value,
  };
}

function bindEvents() {
  el.scopeSeg.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    scope = btn.dataset.scope;
    setSeg(el.scopeSeg, 'scope', scope);
    await saveSettings({ captureScope: scope });
    el.tabList.innerHTML = '<div class="empty"><div class="spinner"></div>Loading…</div>';
    await loadTabs();
  });

  el.modeSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    setSeg(el.modeSeg, 'mode', btn.dataset.mode);
    updatePaperVisibility();
    saveSettings({ captureMode: btn.dataset.mode });
  });

  el.paperSel.addEventListener('change', () => saveSettings({ paperSize: el.paperSel.value }));
  el.orientSel.addEventListener('change', () => saveSettings({ orientation: el.orientSel.value }));

  el.selectAll.addEventListener('click', () => {
    tabs.forEach((t) => { if (t.capturable) selected.add(t.id); });
    renderTabs();
  });
  el.selectNone.addEventListener('click', () => { selected.clear(); renderTabs(); });

  el.captureBtn.addEventListener('click', startCapture);
  el.captureCurrent.addEventListener('click', async () => {
    const res = await send({ action: MSG.CAPTURE_CURRENT, overrides: currentOverrides() });
    if (res.success) showProgress(); else toast(res.error || 'Failed to start');
  });

  el.managerBtn.addEventListener('click', openManager);
  el.openManager2.addEventListener('click', openManager);
  el.optionsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  el.cancelBtn.addEventListener('click', async () => {
    el.cancelBtn.disabled = true;
    el.cancelBtn.textContent = 'Stopping…';
    await send({ action: MSG.CANCEL });
  });
}

async function startCapture() {
  const tabIds = [...selected];
  if (tabIds.length === 0) return;
  const res = await send({ action: MSG.CAPTURE, tabIds, overrides: currentOverrides() });
  if (res.success) {
    showProgress();
    el.progPct.textContent = `0 / ${tabIds.length}`;
  } else {
    toast(res.error || 'Failed to start capture');
  }
}

function openManager() {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/manager/manager.html') });
  window.close();
}

function showProgress() {
  el.setupView.classList.add('hidden');
  el.progressView.classList.remove('hidden');
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === MSG.PROGRESS) {
    showProgress();
    const pct = msg.total ? Math.round((msg.current / msg.total) * 100) : 0;
    el.progFill.style.width = pct + '%';
    el.progPct.textContent = `${msg.current} / ${msg.total}`;
    el.progCur.textContent = msg.title || '';
  } else if (msg.type === MSG.DONE) {
    el.progFill.style.width = '100%';
    el.progTitle.textContent = 'Done!';
    el.progCur.textContent = `${msg.captured} captured${msg.errors?.length ? `, ${msg.errors.length} skipped` : ''}`;
    setTimeout(() => window.close(), 900);
  } else if (msg.type === MSG.ERROR) {
    el.progressView.classList.add('hidden');
    el.setupView.classList.remove('hidden');
    toast(msg.error || 'Capture failed');
  }
});

init().catch((e) => toast(e.message));
