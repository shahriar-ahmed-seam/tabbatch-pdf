/**
 * Centralised user-settings model.
 *
 * The DEFAULT_SETTINGS object and {@link mergeSettings} are pure and unit
 * tested. The async getters/setters touch `chrome.storage.sync` and are only
 * exercised inside the browser.
 *
 * @module shared/settings
 */

export const SETTINGS_KEY = 'tabbatch_settings_v2';

/** @typedef {keyof typeof DEFAULT_SETTINGS} SettingKey */

export const DEFAULT_SETTINGS = Object.freeze({
  // ---- Capture ----
  captureMode: 'single', // 'single' (continuous) | 'paged'
  paperSize: 'A4', // key of PAPER_SIZES
  orientation: 'portrait', // 'portrait' | 'landscape'
  margin: 0.4, // inches, used in paged mode
  scale: 1, // 0.1 - 2
  printBackground: true,
  landscapeAutoWide: true, // auto-switch wide pages to landscape in paged mode
  removeFooters: true, // hide sticky footers in single-page mode
  removeStickyHeaders: true, // hide sticky/fixed headers that repeat
  waitForContent: 1200, // ms to wait for lazy content before printing
  scrollToBottom: true, // trigger lazy-loaded content by scrolling
  maxPageHeightInches: 200, // hard cap to avoid renderer crashes
  captureScope: 'window', // 'window' | 'all' | 'selected'
  thumbnailQuality: 80, // 1-100 JPEG quality
  thumbnails: true,

  // ---- Output / merge ----
  filenameTemplate: '{title}_{datetime}',
  mergedTitle: 'TabBatch Export',
  addPageNumbers: false,
  addTableOfContents: false,
  addBookmarks: true,
  pdfAuthor: '',
  saveAsDialog: true, // show the "Save As" dialog on download

  // ---- UX ----
  theme: 'system', // 'system' | 'light' | 'dark'
  notifications: true,
  soundOnComplete: false,
  autoOpenManager: true,
  confirmBeforeClear: true,
});

const NUMERIC_BOUNDS = {
  margin: [0, 3],
  scale: [0.1, 2],
  waitForContent: [0, 15000],
  maxPageHeightInches: [11, 500],
  thumbnailQuality: [1, 100],
};

const ENUMS = {
  captureMode: ['single', 'paged'],
  orientation: ['portrait', 'landscape'],
  captureScope: ['window', 'all', 'selected'],
  theme: ['system', 'light', 'dark'],
};

/**
 * Merge a partial/stored settings object onto the defaults, coercing types
 * and clamping numbers so a corrupt store can never break the UI.
 * @param {Partial<typeof DEFAULT_SETTINGS>} [stored]
 * @returns {typeof DEFAULT_SETTINGS}
 */
export function mergeSettings(stored) {
  const result = { ...DEFAULT_SETTINGS };
  if (!stored || typeof stored !== 'object') return result;

  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (!(key in stored)) continue;
    const value = stored[key];
    const def = DEFAULT_SETTINGS[key];

    if (typeof def === 'boolean') {
      result[key] = Boolean(value);
    } else if (typeof def === 'number') {
      const num = Number(value);
      if (Number.isFinite(num)) {
        const bounds = NUMERIC_BOUNDS[key];
        result[key] = bounds ? Math.min(Math.max(num, bounds[0]), bounds[1]) : num;
      }
    } else if (key in ENUMS) {
      if (ENUMS[key].includes(value)) result[key] = value;
    } else if (typeof def === 'string') {
      result[key] = String(value);
    }
  }
  return result;
}

/* -------------------------------------------------------------------------- */
/* Browser-only async access (no-ops under test where chrome is undefined).    */
/* -------------------------------------------------------------------------- */

const hasChromeStorage = () =>
  typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

/**
 * Load settings, falling back to local storage then defaults.
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function getSettings() {
  if (!hasChromeStorage()) return { ...DEFAULT_SETTINGS };
  try {
    const synced = await chrome.storage.sync.get(SETTINGS_KEY);
    if (synced && synced[SETTINGS_KEY]) return mergeSettings(synced[SETTINGS_KEY]);
  } catch {
    /* sync may be disabled; fall through to local */
  }
  try {
    const local = await chrome.storage.local.get(SETTINGS_KEY);
    return mergeSettings(local[SETTINGS_KEY]);
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/**
 * Persist a partial settings patch.
 * @param {Partial<typeof DEFAULT_SETTINGS>} patch
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
export async function saveSettings(patch) {
  const current = await getSettings();
  const next = mergeSettings({ ...current, ...patch });
  if (hasChromeStorage()) {
    try {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: next });
    } catch {
      await chrome.storage.local.set({ [SETTINGS_KEY]: next });
    }
  }
  return next;
}

/** Reset everything back to {@link DEFAULT_SETTINGS}. */
export async function resetSettings() {
  if (hasChromeStorage()) {
    try {
      await chrome.storage.sync.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS } });
    } catch {
      await chrome.storage.local.set({ [SETTINGS_KEY]: { ...DEFAULT_SETTINGS } });
    }
  }
  return { ...DEFAULT_SETTINGS };
}

/**
 * Subscribe to settings changes. Returns an unsubscribe function.
 * @param {(settings: typeof DEFAULT_SETTINGS) => void} callback
 */
export function onSettingsChanged(callback) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.onChanged) {
    return () => {};
  }
  const listener = (changes, area) => {
    if ((area === 'sync' || area === 'local') && changes[SETTINGS_KEY]) {
      callback(mergeSettings(changes[SETTINGS_KEY].newValue));
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
