/**
 * Pure, dependency-free helper functions shared across the extension.
 * These contain NO references to the `chrome.*` APIs so they can be
 * imported and unit-tested in a plain Node environment.
 *
 * @module shared/utils
 */

/** Standard CSS reference resolution used by Chromium's print pipeline. */
export const CSS_DPI = 96;

/** Paper size presets in inches (portrait orientation: [width, height]). */
export const PAPER_SIZES = {
  A4: { width: 8.27, height: 11.69, label: 'A4' },
  A3: { width: 11.69, height: 16.54, label: 'A3' },
  A5: { width: 5.83, height: 8.27, label: 'A5' },
  Letter: { width: 8.5, height: 11, label: 'Letter' },
  Legal: { width: 8.5, height: 14, label: 'Legal' },
  Tabloid: { width: 11, height: 17, label: 'Tabloid' },
};

/**
 * URL schemes that Chromium forbids extensions from scripting / debugging.
 * Capturing these is impossible, so we surface a friendly reason instead.
 */
const RESTRICTED_PREFIXES = [
  'chrome://',
  'chrome-untrusted://',
  'edge://',
  'brave://',
  'opera://',
  'vivaldi://',
  'about:',
  'chrome-extension://',
  'moz-extension://',
  'devtools://',
  'view-source:',
];

const RESTRICTED_HOSTS = [
  'chrome.google.com/webstore',
  'chromewebstore.google.com',
];

/**
 * Determine whether a tab URL can be captured.
 * @param {string} url
 * @returns {{ ok: boolean, reason?: string }}
 */
export function inspectUrl(url) {
  if (!url || typeof url !== 'string') {
    return { ok: false, reason: 'Tab has no URL' };
  }
  const lower = url.toLowerCase();
  for (const prefix of RESTRICTED_PREFIXES) {
    if (lower.startsWith(prefix)) {
      return { ok: false, reason: `Browser pages (${prefix}) cannot be captured` };
    }
  }
  for (const host of RESTRICTED_HOSTS) {
    if (lower.includes(host)) {
      return { ok: false, reason: 'The Web Store cannot be captured' };
    }
  }
  if (lower.startsWith('file://')) {
    // Capturable only when the user grants file access; we allow it and let
    // the capture path surface a precise error if access is denied.
    return { ok: true };
  }
  if (!/^https?:\/\//.test(lower) && !lower.startsWith('file://')) {
    return { ok: false, reason: 'Only http(s) and local files are supported' };
  }
  return { ok: true };
}

/** Convenience boolean wrapper around {@link inspectUrl}. */
export function isCapturableUrl(url) {
  return inspectUrl(url).ok;
}

/**
 * Convert a base64 string into a Uint8Array. Works in both the service
 * worker and DOM contexts (relies on the global `atob`).
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToUint8Array(base64) {
  if (!base64) return new Uint8Array(0);
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Convert a Uint8Array / ArrayBuffer into a base64 string in chunks to avoid
 * "Maximum call stack" errors on large buffers.
 * @param {Uint8Array|ArrayBuffer} input
 * @returns {string}
 */
export function uint8ArrayToBase64(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Strip characters that are illegal in filenames across Windows/macOS/Linux
 * and collapse whitespace. Always returns a non-empty string.
 * @param {string} name
 * @param {number} [maxLength=120]
 * @returns {string}
 */
export function sanitizeFilename(name, maxLength = 120) {
  let clean = String(name == null ? '' : name)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ') // illegal chars + control chars
    .replace(/[. ]+$/g, '') // trailing dots/spaces (Windows)
    .replace(/^[. ]+/g, '') // leading dots/spaces
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) clean = 'document';
  if (clean.length > maxLength) clean = clean.slice(0, maxLength).trim();
  // Avoid reserved Windows device names.
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (reserved.test(clean)) clean = `_${clean}`;
  return clean;
}

/**
 * Format a byte count as a human readable string.
 * @param {number} bytes
 * @param {number} [decimals=1]
 * @returns {string}
 */
export function formatBytes(bytes, decimals = 1) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : decimals)} ${units[i]}`;
}

/** Estimate the decoded byte size of a base64 payload without decoding it. */
export function base64ByteLength(base64) {
  if (!base64) return 0;
  const len = base64.length;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((len * 3) / 4) - padding;
}

/**
 * Clamp a number between a minimum and maximum.
 * @param {number} value
 * @param {number} min
 * @param {number} max
 */
export function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Convert a pixel measurement to inches at the standard CSS resolution. */
export function pxToInches(px) {
  return px / CSS_DPI;
}

/** Convert inches to pixels at the standard CSS resolution. */
export function inchesToPx(inches) {
  return inches * CSS_DPI;
}

/**
 * Resolve a paper size + orientation into { width, height } inches.
 * @param {string} sizeKey
 * @param {'portrait'|'landscape'} orientation
 */
export function resolvePaper(sizeKey, orientation = 'portrait') {
  const size = PAPER_SIZES[sizeKey] || PAPER_SIZES.A4;
  if (orientation === 'landscape') {
    return { width: size.height, height: size.width };
  }
  return { width: size.width, height: size.height };
}

/**
 * Build an output filename from a template. Supported tokens:
 *  {title} {date} {time} {datetime} {count} {host} {index}
 * @param {string} template
 * @param {object} ctx
 * @returns {string} filename WITHOUT extension
 */
export function buildFilename(template, ctx = {}) {
  const now = ctx.date instanceof Date ? ctx.date : new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const timeStr = `${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;
  const tokens = {
    '{title}': ctx.title || 'TabBatch',
    '{date}': dateStr,
    '{time}': timeStr,
    '{datetime}': `${dateStr}_${timeStr}`,
    '{count}': ctx.count != null ? String(ctx.count) : '',
    '{index}': ctx.index != null ? String(ctx.index) : '',
    '{host}': ctx.host || '',
  };
  let out = String(template || '{title}_{datetime}');
  for (const [token, value] of Object.entries(tokens)) {
    out = out.split(token).join(value);
  }
  return sanitizeFilename(out) || 'TabBatch';
}

/** Safely extract a hostname from a URL, returning '' on failure. */
export function hostFromUrl(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Truncate a string with an ellipsis. */
export function truncate(str, max = 60) {
  const s = String(str == null ? '' : str);
  return s.length > max ? `${s.slice(0, max - 1)}\u2026` : s;
}

/** Promise-based delay. */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run an async function with a timeout. Rejects with a TimeoutError if the
 * operation does not settle in time.
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} [label]
 * @returns {Promise<T>}
 */
export function withTimeout(promise, ms, label = 'operation') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error(`Timed out after ${ms}ms: ${label}`);
      err.name = 'TimeoutError';
      reject(err);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Retry an async function with linear backoff.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ retries?: number, delay?: number }} [opts]
 * @returns {Promise<T>}
 */
export async function retry(fn, { retries = 1, delay = 500 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(delay * (attempt + 1));
    }
  }
  throw lastErr;
}
