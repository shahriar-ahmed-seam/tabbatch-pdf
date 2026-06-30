import {
  getAllPdfs, deletePdf, deletePdfs, clearPdfs, updatePdf, reorderPdfs,
} from '../shared/db.js';
import { getSettings, saveSettings } from '../shared/settings.js';
import {
  base64ToUint8Array, formatBytes, buildFilename, hostFromUrl, truncate,
} from '../shared/utils.js';
import { MSG } from '../shared/messages.js';

const $ = (id) => document.getElementById(id);
const PDFLib = window.PDFLib;

const dom = {
  grid: $('grid'), loading: $('loading'), empty: $('empty'), stat: $('stat'),
  search: $('searchInput'), sort: $('sortSelect'), checkAll: $('checkAll'),
  mergeBtn: $('mergeBtn'), mergeSelectedBtn: $('mergeSelectedBtn'),
  downloadEachBtn: $('downloadEachBtn'), deleteSelectedBtn: $('deleteSelectedBtn'),
  clearBtn: $('clearBtn'),
  optPageNumbers: $('optPageNumbers'), optBookmarks: $('optBookmarks'), optToc: $('optToc'),
  themeBtn: $('themeBtn'), settingsBtn: $('settingsBtn'),
  progressModal: $('progressModal'), progTitle: $('progTitle'), progFill: $('progFill'), progText: $('progText'),
  confirmModal: $('confirmModal'), confirmTitle: $('confirmTitle'), confirmText: $('confirmText'),
  confirmOk: $('confirmOk'), confirmCancel: $('confirmCancel'),
  previewModal: $('previewModal'), previewFrame: $('previewFrame'), previewTitle: $('previewTitle'),
  previewClose: $('previewClose'), previewDownload: $('previewDownload'),
  toasts: $('toasts'),
};

let records = [];
let view = [];
const selected = new Set();
let settings = null;
let sortMode = 'manual';
let searchTerm = '';
let activeBlobUrl = null;

/* ------------------------------- init ------------------------------------- */
async function init() {
  settings = await getSettings();
  applyTheme(settings.theme);
  dom.optPageNumbers.checked = settings.addPageNumbers;
  dom.optBookmarks.checked = settings.addBookmarks;
  dom.optToc.checked = settings.addTableOfContents;
  bind();
  await load();
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
}

async function load() {
  dom.loading.classList.remove('hidden');
  dom.empty.classList.add('hidden');
  try {
    records = await getAllPdfs();
  } catch (e) {
    toast('Failed to load PDFs: ' + e.message, 'error');
    records = [];
  }
  selected.clear();
  dom.loading.classList.add('hidden');
  render();
}

/* ------------------------------ rendering --------------------------------- */
function computeView() {
  let list = records.slice();
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    list = list.filter((r) =>
      (r.title || '').toLowerCase().includes(q) || (r.url || '').toLowerCase().includes(q));
  }
  switch (sortMode) {
    case 'title': list.sort((a, b) => (a.title || '').localeCompare(b.title || '')); break;
    case 'title-desc': list.sort((a, b) => (b.title || '').localeCompare(a.title || '')); break;
    case 'newest': list.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)); break;
    case 'oldest': list.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)); break;
    case 'size': list.sort((a, b) => (b.byteSize || 0) - (a.byteSize || 0)); break;
    default: break; // manual = DB order
  }
  return list;
}

function render() {
  view = computeView();
  const totalBytes = records.reduce((s, r) => s + (r.byteSize || 0), 0);
  dom.stat.textContent = `${records.length} PDF${records.length === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`;

  if (records.length === 0) {
    dom.grid.innerHTML = '';
    dom.empty.classList.remove('hidden');
  } else {
    dom.empty.classList.add('hidden');
    dom.grid.innerHTML = '';
    view.forEach((r, i) => dom.grid.appendChild(card(r, i)));
  }
  updateButtons();
}

function card(r, index) {
  const c = document.createElement('div');
  c.className = 'card' + (selected.has(r.id) ? ' selected' : '');
  c.dataset.id = r.id;
  c.draggable = sortMode === 'manual' && !searchTerm;

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  if (r.thumbnailDataUrl) thumb.style.backgroundImage = `url(${r.thumbnailDataUrl})`;
  else thumb.innerHTML = '<div class="ph">📄</div>';

  const pos = document.createElement('div');
  pos.className = 'pos';
  pos.textContent = index + 1;

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.className = 'sel-cb';
  cb.checked = selected.has(r.id);
  cb.addEventListener('click', (e) => e.stopPropagation());
  cb.addEventListener('change', () => {
    if (cb.checked) selected.add(r.id); else selected.delete(r.id);
    c.classList.toggle('selected', cb.checked);
    syncCheckAll();
    updateButtons();
  });

  const badge = document.createElement('div');
  if (r.status === 'error') { badge.className = 'errflag'; badge.textContent = 'error'; }
  else { badge.className = 'mode-badge'; badge.textContent = r.mode === 'paged' ? 'paged' : 'single'; }

  thumb.append(pos, cb, badge);

  const body = document.createElement('div');
  body.className = 'body';

  const title = document.createElement('div');
  title.className = 'title';
  title.contentEditable = 'true';
  title.spellcheck = false;
  title.textContent = r.title || 'Untitled';
  title.title = 'Click to rename';
  title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); title.blur(); } });
  title.addEventListener('blur', async () => {
    const name = title.textContent.trim() || 'Untitled';
    if (name !== r.title) { r.title = name; await updatePdf(r.id, { title: name }); toast('Renamed', 'success'); }
  });

  const url = document.createElement('div');
  url.className = 'url';
  url.textContent = hostFromUrl(r.url) || r.url;
  url.title = r.url;

  const size = document.createElement('div');
  size.className = 'size';
  size.textContent = `${formatBytes(r.byteSize || 0)} · ${new Date(r.timestamp || Date.now()).toLocaleString()}`;

  const acts = document.createElement('div');
  acts.className = 'acts';
  acts.append(
    actBtn('👁 Preview', () => preview(r)),
    actBtn('⬇ Save', () => downloadSingle(r)),
    actBtn('🔄 Recapture', () => recapture(r)),
    actBtn('🗑 Delete', () => removeOne(r), 'del'),
  );

  body.append(title, url, size, acts);
  c.append(thumb, body);

  if (c.draggable) attachDrag(c);
  return c;
}

function actBtn(label, fn, cls = '') {
  const b = document.createElement('button');
  b.className = cls;
  b.textContent = label;
  b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
  return b;
}

function updateButtons() {
  const has = records.length > 0;
  const sel = selected.size;
  dom.mergeBtn.disabled = !has;
  dom.clearBtn.disabled = !has;
  dom.downloadEachBtn.disabled = !has;
  dom.mergeBtn.textContent = `⬇ Merge & Download (${records.length})`;
  dom.mergeSelectedBtn.disabled = sel === 0;
  dom.mergeSelectedBtn.textContent = sel ? `Merge selected (${sel})` : 'Merge selected';
  dom.deleteSelectedBtn.disabled = sel === 0;
  dom.deleteSelectedBtn.textContent = sel ? `Delete selected (${sel})` : 'Delete selected';
}

function syncCheckAll() {
  const visIds = view.map((r) => r.id);
  dom.checkAll.checked = visIds.length > 0 && visIds.every((id) => selected.has(id));
}

/* --------------------------- drag reordering ------------------------------ */
let dragId = null;
function attachDrag(c) {
  c.addEventListener('dragstart', () => { dragId = Number(c.dataset.id); c.classList.add('dragging'); });
  c.addEventListener('dragend', () => { c.classList.remove('dragging'); dom.grid.querySelectorAll('.card').forEach((x) => x.classList.remove('dragover')); });
  c.addEventListener('dragover', (e) => { e.preventDefault(); c.classList.add('dragover'); });
  c.addEventListener('dragleave', () => c.classList.remove('dragover'));
  c.addEventListener('drop', async (e) => {
    e.preventDefault();
    c.classList.remove('dragover');
    const targetId = Number(c.dataset.id);
    if (dragId == null || dragId === targetId) return;
    const from = records.findIndex((r) => r.id === dragId);
    const to = records.findIndex((r) => r.id === targetId);
    if (from < 0 || to < 0) return;
    const [moved] = records.splice(from, 1);
    records.splice(to, 0, moved);
    render();
    try { await reorderPdfs(records.map((r) => r.id)); } catch (err) { toast('Reorder failed: ' + err.message, 'error'); }
  });
}

/* ------------------------------ actions ----------------------------------- */
function preview(r) {
  revokeBlob();
  const blob = new Blob([base64ToUint8Array(r.pdfBase64)], { type: 'application/pdf' });
  activeBlobUrl = URL.createObjectURL(blob);
  dom.previewTitle.textContent = r.title || 'Preview';
  dom.previewFrame.src = activeBlobUrl;
  dom.previewDownload.onclick = () => downloadSingle(r);
  dom.previewModal.classList.remove('hidden');
}

function closePreview() {
  dom.previewModal.classList.add('hidden');
  dom.previewFrame.src = 'about:blank';
  revokeBlob();
}

function revokeBlob() {
  if (activeBlobUrl) { URL.revokeObjectURL(activeBlobUrl); activeBlobUrl = null; }
}

function downloadSingle(r) {
  const bytes = base64ToUint8Array(r.pdfBase64);
  const name = buildFilename('{title}', { title: r.title, host: hostFromUrl(r.url) }) + '.pdf';
  triggerDownload(bytes, name, false);
}

async function recapture(r) {
  toast('Recapturing… keep this tab open', 'success');
  const res = await sendMsg({ action: MSG.RECAPTURE, id: r.id });
  if (res.success) { await load(); toast('Recaptured "' + truncate(r.title, 30) + '"', 'success'); }
  else toast('Recapture failed: ' + (res.error || 'unknown'), 'error');
}

async function removeOne(r) {
  await deletePdf(r.id);
  selected.delete(r.id);
  records = records.filter((x) => x.id !== r.id);
  render();
  toast('Removed', 'success');
}

async function deleteSelected() {
  if (selected.size === 0) return;
  const ok = await confirmDialog('Delete selected', `Remove ${selected.size} selected PDF(s)? This cannot be undone.`);
  if (!ok) return;
  const ids = [...selected];
  await deletePdfs(ids);
  records = records.filter((r) => !selected.has(r.id));
  selected.clear();
  render();
  toast(`Deleted ${ids.length}`, 'success');
}

async function clearAll() {
  if (records.length === 0) return;
  if (settings.confirmBeforeClear) {
    const ok = await confirmDialog('Clear everything', `Permanently delete all ${records.length} captured PDFs?`);
    if (!ok) return;
  }
  await clearPdfs();
  records = []; selected.clear();
  render();
  toast('All cleared', 'success');
}

async function downloadEach() {
  const list = view.length ? view : records;
  for (const r of list) { downloadSingle(r); await new Promise((res) => setTimeout(res, 350)); }
  toast(`Downloading ${list.length} files`, 'success');
}

/* ------------------------------- merge ------------------------------------ */
function mergeTargets(onlySelected) {
  if (onlySelected) {
    const set = selected;
    return records.filter((r) => set.has(r.id));
  }
  // honour the current visible ordering/sort
  return view.length ? view : records;
}

async function mergeAndDownload(onlySelected) {
  const targets = mergeTargets(onlySelected).filter((r) => r.pdfBase64);
  if (targets.length === 0) { toast('Nothing to merge', 'error'); return; }

  const opts = {
    pageNumbers: dom.optPageNumbers.checked,
    bookmarks: dom.optBookmarks.checked,
    toc: dom.optToc.checked,
  };
  saveSettings({ addPageNumbers: opts.pageNumbers, addBookmarks: opts.bookmarks, addTableOfContents: opts.toc });

  showProgress('Merging PDFs…', 'Loading documents…', 0);
  try {
    const { PDFDocument } = PDFLib;
    const merged = await PDFDocument.create();

    // metadata
    try {
      merged.setTitle(settings.mergedTitle || 'TabBatch Export');
      if (settings.pdfAuthor) merged.setAuthor(settings.pdfAuthor);
      merged.setCreator('TabBatch PDF');
      merged.setProducer('TabBatch PDF (pdf-lib)');
      merged.setCreationDate(new Date());
      merged.setModificationDate(new Date());
    } catch {}

    // 1) Load every source document up front.
    const loaded = [];
    for (let i = 0; i < targets.length; i++) {
      updateProgress(`Reading ${i + 1} of ${targets.length}…`, (i / targets.length) * 40);
      try {
        const doc = await PDFDocument.load(base64ToUint8Array(targets[i].pdfBase64), { ignoreEncryption: true });
        loaded.push({ rec: targets[i], doc, pageCount: doc.getPageCount() });
      } catch (e) {
        console.warn('Skipping unreadable PDF:', targets[i].title, e);
      }
    }
    if (loaded.length === 0) throw new Error('None of the PDFs could be read');

    // 2) Reserve TOC pages if requested.
    const TOC_ROWS = 28;
    const tocPageCount = opts.toc ? Math.ceil(loaded.length / TOC_ROWS) : 0;
    for (let i = 0; i < tocPageCount; i++) merged.addPage([595.28, 841.89]); // A4 portrait

    // 3) Copy content; remember where each section begins.
    const sections = [];
    for (let i = 0; i < loaded.length; i++) {
      updateProgress(`Merging ${i + 1} of ${loaded.length}…`, 40 + (i / loaded.length) * 45);
      const { rec, doc } = loaded[i];
      const startIndex = merged.getPageCount();
      const pages = await merged.copyPages(doc, doc.getPageIndices());
      pages.forEach((p) => merged.addPage(p));
      sections.push({ title: rec.title || 'Untitled', url: rec.url, pageIndex: startIndex });
    }

    // 4) Optional enhancements (each guarded so the merge never fails).
    if (opts.toc && tocPageCount > 0) {
      updateProgress('Building contents…', 88);
      try { drawTableOfContents(merged, sections, tocPageCount, TOC_ROWS); } catch (e) { console.warn('TOC failed', e); }
    }
    if (opts.bookmarks) {
      try { addOutline(merged, sections); } catch (e) { console.warn('Bookmarks failed', e); }
    }
    if (opts.pageNumbers) {
      updateProgress('Numbering pages…', 92);
      try { await stampPageNumbers(merged); } catch (e) { console.warn('Page numbers failed', e); }
    }

    updateProgress('Finalising…', 96);
    const bytes = await merged.save();
    const name = buildFilename(settings.filenameTemplate, {
      title: settings.mergedTitle || 'TabBatch', count: loaded.length,
    }) + '.pdf';

    updateProgress('Downloading…', 100);
    triggerDownload(bytes, name, settings.saveAsDialog);
    hideProgress();
    toast(`Merged ${loaded.length} document(s)`, 'success');
  } catch (e) {
    hideProgress();
    toast('Merge failed: ' + e.message, 'error');
    console.error(e);
  }
}

function drawTableOfContents(merged, sections, tocPageCount, rows) {
  const { rgb, PDFName, PDFNull } = PDFLib;
  const pages = merged.getPages();
  const W = 595.28, H = 841.89;
  const left = 56, right = W - 56;
  let entry = 0;
  for (let pi = 0; pi < tocPageCount; pi++) {
    const page = pages[pi];
    let y = H - 70;
    if (pi === 0) {
      page.drawText('Table of Contents', { x: left, y: H - 50, size: 20, color: rgb(0.31, 0.27, 0.9) });
    }
    for (let r = 0; r < rows && entry < sections.length; r++, entry++) {
      const s = sections[entry];
      const label = `${entry + 1}.  ${truncate(s.title, 64)}`;
      const pageNo = String(s.pageIndex + 1);
      page.drawText(label, { x: left, y, size: 11, color: rgb(0.12, 0.13, 0.21) });
      page.drawText(pageNo, { x: right - 24, y, size: 11, color: rgb(0.42, 0.44, 0.56) });
      // clickable link to the section
      try {
        const target = pages[s.pageIndex];
        const link = merged.context.obj({
          Type: 'Annot', Subtype: 'Link',
          Rect: [left - 4, y - 3, right, y + 12],
          Border: [0, 0, 0],
          Dest: [target.ref, PDFName.of('XYZ'), PDFNull, target.getHeight ? target.getHeight() : H, PDFNull],
        });
        const ref = merged.context.register(link);
        page.node.addAnnot(ref);
      } catch {}
      y -= 24;
    }
  }
}

function addOutline(pdfDoc, sections) {
  const { PDFName, PDFHexString } = PDFLib;
  const context = pdfDoc.context;
  const pages = pdfDoc.getPages();
  const outlinesRef = context.nextRef();
  const refs = sections.map(() => context.nextRef());

  sections.forEach((s, i) => {
    const dict = {
      Title: PDFHexString.fromText(s.title || `Section ${i + 1}`),
      Parent: outlinesRef,
      Dest: [pages[s.pageIndex].ref, PDFName.of('Fit')],
    };
    if (i > 0) dict.Prev = refs[i - 1];
    if (i < sections.length - 1) dict.Next = refs[i + 1];
    context.assign(refs[i], context.obj(dict));
  });

  const outlines = context.obj({
    Type: PDFName.of('Outlines'),
    First: refs[0],
    Last: refs[refs.length - 1],
    Count: sections.length,
  });
  context.assign(outlinesRef, outlines);
  pdfDoc.catalog.set(PDFName.of('Outlines'), outlinesRef);
}

async function stampPageNumbers(merged) {
  const { StandardFonts, rgb } = PDFLib;
  const font = await merged.embedFont(StandardFonts.Helvetica);
  const pages = merged.getPages();
  const total = pages.length;
  pages.forEach((page, i) => {
    const { width } = page.getSize();
    const text = `${i + 1} / ${total}`;
    const size = 9;
    const w = font.widthOfTextAtSize(text, size);
    page.drawText(text, { x: width / 2 - w / 2, y: 16, size, font, color: rgb(0.5, 0.5, 0.55) });
  });
}

/* ------------------------------ downloads --------------------------------- */
function triggerDownload(bytes, filename, saveAs) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: !!saveAs }, () => {
    if (chrome.runtime.lastError) toast('Download error: ' + chrome.runtime.lastError.message, 'error');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  });
}

/* ------------------------------ progress/UI ------------------------------- */
function showProgress(title, text, pct) { dom.progTitle.textContent = title; updateProgress(text, pct); dom.progressModal.classList.remove('hidden'); }
function updateProgress(text, pct) { dom.progText.textContent = text; dom.progFill.style.width = Math.max(0, Math.min(100, pct)) + '%'; }
function hideProgress() { dom.progressModal.classList.add('hidden'); }

function confirmDialog(title, text) {
  return new Promise((resolve) => {
    dom.confirmTitle.textContent = title;
    dom.confirmText.textContent = text;
    dom.confirmModal.classList.remove('hidden');
    const done = (val) => {
      dom.confirmModal.classList.add('hidden');
      dom.confirmOk.onclick = dom.confirmCancel.onclick = null;
      resolve(val);
    };
    dom.confirmOk.onclick = () => done(true);
    dom.confirmCancel.onclick = () => done(false);
  });
}

function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ' ' + type : '');
  t.textContent = msg;
  dom.toasts.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 250); }, 3200);
}

function sendMsg(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (res) => {
      if (chrome.runtime.lastError) resolve({ success: false, error: chrome.runtime.lastError.message });
      else resolve(res || { success: false });
    });
  });
}

/* ------------------------------ events ------------------------------------ */
function bind() {
  dom.search.addEventListener('input', () => { searchTerm = dom.search.value.trim(); render(); });
  dom.sort.addEventListener('change', () => { sortMode = dom.sort.value; render(); });
  dom.checkAll.addEventListener('change', () => {
    if (dom.checkAll.checked) view.forEach((r) => selected.add(r.id));
    else view.forEach((r) => selected.delete(r.id));
    render();
  });
  dom.mergeBtn.addEventListener('click', () => mergeAndDownload(false));
  dom.mergeSelectedBtn.addEventListener('click', () => mergeAndDownload(true));
  dom.downloadEachBtn.addEventListener('click', downloadEach);
  dom.deleteSelectedBtn.addEventListener('click', deleteSelected);
  dom.clearBtn.addEventListener('click', clearAll);
  dom.previewClose.addEventListener('click', closePreview);
  dom.previewModal.addEventListener('click', (e) => { if (e.target === dom.previewModal) closePreview(); });
  dom.settingsBtn.addEventListener('click', () => chrome.runtime.openOptionsPage());
  dom.themeBtn.addEventListener('click', async () => {
    const order = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(settings.theme) + 1) % order.length];
    settings = await saveSettings({ theme: next });
    applyTheme(next);
    toast('Theme: ' + next, 'success');
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closePreview(); } });

  // Auto-refresh when a capture finishes elsewhere.
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === MSG.DONE) load();
  });
}

init();
