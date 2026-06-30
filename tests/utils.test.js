import { describe, it, expect } from 'vitest';
import {
  inspectUrl, isCapturableUrl, base64ToUint8Array, uint8ArrayToBase64,
  sanitizeFilename, formatBytes, base64ByteLength, clamp, pxToInches, inchesToPx,
  resolvePaper, buildFilename, hostFromUrl, truncate, withTimeout, retry,
} from '../src/shared/utils.js';

describe('inspectUrl / isCapturableUrl', () => {
  it('accepts http and https', () => {
    expect(inspectUrl('https://example.com').ok).toBe(true);
    expect(inspectUrl('http://example.com/a/b?c=1').ok).toBe(true);
    expect(isCapturableUrl('https://example.com')).toBe(true);
  });

  it('rejects browser/internal schemes with a reason', () => {
    for (const u of [
      'chrome://settings', 'edge://flags', 'about:blank',
      'chrome-extension://abc/popup.html', 'devtools://devtools/bundled',
      'view-source:https://x.com', 'brave://rewards',
    ]) {
      const r = inspectUrl(u);
      expect(r.ok).toBe(false);
      expect(typeof r.reason).toBe('string');
      expect(r.reason.length).toBeGreaterThan(0);
    }
  });

  it('rejects the chrome web store', () => {
    expect(inspectUrl('https://chromewebstore.google.com/detail/x').ok).toBe(false);
    expect(inspectUrl('https://chrome.google.com/webstore/category/extensions').ok).toBe(false);
  });

  it('allows file urls (access decided later)', () => {
    expect(inspectUrl('file:///C:/doc.html').ok).toBe(true);
  });

  it('handles empty/garbage input', () => {
    expect(inspectUrl('').ok).toBe(false);
    expect(inspectUrl(undefined).ok).toBe(false);
    expect(inspectUrl('ftp://x').ok).toBe(false);
    expect(inspectUrl('mailto:a@b.c').ok).toBe(false);
  });
});

describe('base64 <-> bytes round trips', () => {
  it('encodes and decodes ASCII', () => {
    const text = 'Hello, TabBatch PDF!';
    const bytes = new TextEncoder().encode(text);
    const b64 = uint8ArrayToBase64(bytes);
    const back = base64ToUint8Array(b64);
    expect(new TextDecoder().decode(back)).toBe(text);
  });

  it('round trips arbitrary binary including 0x00..0xff', () => {
    const bytes = new Uint8Array(256);
    for (let i = 0; i < 256; i++) bytes[i] = i;
    const b64 = uint8ArrayToBase64(bytes);
    const back = base64ToUint8Array(b64);
    expect(Array.from(back)).toEqual(Array.from(bytes));
  });

  it('handles large buffers without stack overflow', () => {
    const bytes = new Uint8Array(200000).map((_, i) => i % 256);
    const back = base64ToUint8Array(uint8ArrayToBase64(bytes));
    expect(back.length).toBe(200000);
    expect(back[123456]).toBe(123456 % 256);
  });

  it('accepts ArrayBuffer input', () => {
    const buf = new Uint8Array([1, 2, 3]).buffer;
    expect(uint8ArrayToBase64(buf)).toBe(uint8ArrayToBase64(new Uint8Array([1, 2, 3])));
  });

  it('handles empty input', () => {
    expect(base64ToUint8Array('').length).toBe(0);
    expect(uint8ArrayToBase64(new Uint8Array(0))).toBe('');
  });
});

describe('base64ByteLength', () => {
  it('matches the decoded length', () => {
    for (const text of ['', 'a', 'ab', 'abc', 'abcd', 'hello world 1234']) {
      const b64 = uint8ArrayToBase64(new TextEncoder().encode(text));
      expect(base64ByteLength(b64)).toBe(text.length);
    }
  });
});

describe('sanitizeFilename', () => {
  it('strips illegal characters', () => {
    expect(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j')).not.toMatch(/[/\\:*?"<>|]/);
  });
  it('never returns empty', () => {
    expect(sanitizeFilename('')).toBe('document');
    expect(sanitizeFilename('   ')).toBe('document');
    expect(sanitizeFilename('...')).toBe('document');
  });
  it('trims trailing dots/spaces (Windows)', () => {
    expect(sanitizeFilename('report.  ')).toBe('report');
  });
  it('escapes reserved device names', () => {
    expect(sanitizeFilename('CON')).toBe('_CON');
    expect(sanitizeFilename('com1')).toBe('_com1');
  });
  it('honours max length', () => {
    expect(sanitizeFilename('x'.repeat(500), 50).length).toBeLessThanOrEqual(50);
  });
});

describe('formatBytes', () => {
  it('formats common sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048576)).toBe('1.0 MB');
  });
  it('guards against bad input', () => {
    expect(formatBytes(-5)).toBe('0 B');
    expect(formatBytes(NaN)).toBe('0 B');
  });
});

describe('clamp / unit conversions', () => {
  it('clamps within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
    expect(clamp(NaN, 2, 10)).toBe(2);
  });
  it('converts px<->inches at 96 dpi', () => {
    expect(pxToInches(96)).toBeCloseTo(1);
    expect(inchesToPx(1)).toBeCloseTo(96);
  });
});

describe('resolvePaper', () => {
  it('returns portrait by default', () => {
    const a4 = resolvePaper('A4');
    expect(a4.width).toBeLessThan(a4.height);
  });
  it('swaps dimensions for landscape', () => {
    const p = resolvePaper('A4', 'portrait');
    const l = resolvePaper('A4', 'landscape');
    expect(l.width).toBeCloseTo(p.height);
    expect(l.height).toBeCloseTo(p.width);
  });
  it('falls back to A4 for unknown size', () => {
    expect(resolvePaper('NOPE')).toEqual(resolvePaper('A4'));
  });
});

describe('buildFilename', () => {
  const date = new Date(2026, 5, 30, 9, 5, 7); // 2026-06-30 09:05:07
  it('expands tokens', () => {
    const name = buildFilename('{title}_{date}', { title: 'My Tabs', date });
    expect(name).toBe('My Tabs_2026-06-30');
  });
  it('expands datetime and count', () => {
    const name = buildFilename('{title}-{datetime}-{count}', { title: 'X', count: 3, date });
    expect(name).toBe('X-2026-06-30_09-05-07-3');
  });
  it('sanitizes the final result', () => {
    const name = buildFilename('{title}', { title: 'a/b:c' });
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
  });
  it('falls back when template empty', () => {
    expect(buildFilename('', { title: 'T', date }).length).toBeGreaterThan(0);
  });
});

describe('hostFromUrl / truncate', () => {
  it('extracts hostnames and strips www', () => {
    expect(hostFromUrl('https://www.example.com/x')).toBe('example.com');
    expect(hostFromUrl('not a url')).toBe('');
  });
  it('truncates with ellipsis', () => {
    expect(truncate('abcdefghij', 5)).toHaveLength(5);
    expect(truncate('abc', 10)).toBe('abc');
  });
});

describe('withTimeout / retry', () => {
  it('resolves before the timeout', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 100)).resolves.toBe('ok');
  });
  it('rejects after the timeout', async () => {
    const slow = new Promise((r) => setTimeout(() => r('late'), 50));
    await expect(withTimeout(slow, 10, 'slow')).rejects.toThrow(/Timed out/);
  });
  it('retries until success', async () => {
    let n = 0;
    const result = await retry(async () => { if (++n < 3) throw new Error('no'); return n; }, { retries: 5, delay: 1 });
    expect(result).toBe(3);
  });
  it('throws after exhausting retries', async () => {
    await expect(retry(async () => { throw new Error('always'); }, { retries: 2, delay: 1 })).rejects.toThrow('always');
  });
});
