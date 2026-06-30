import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../src/shared/settings.js';

describe('mergeSettings', () => {
  it('returns defaults for empty/invalid input', () => {
    expect(mergeSettings()).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings('nope')).toEqual(DEFAULT_SETTINGS);
    expect(mergeSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('overlays valid values', () => {
    const merged = mergeSettings({ captureMode: 'paged', paperSize: 'Letter' });
    expect(merged.captureMode).toBe('paged');
    expect(merged.paperSize).toBe('Letter');
    // untouched keys keep defaults
    expect(merged.theme).toBe(DEFAULT_SETTINGS.theme);
  });

  it('ignores unknown keys', () => {
    const merged = mergeSettings({ hackerKey: 'x', captureMode: 'single' });
    expect('hackerKey' in merged).toBe(false);
  });

  it('coerces booleans', () => {
    expect(mergeSettings({ printBackground: 0 }).printBackground).toBe(false);
    expect(mergeSettings({ printBackground: 'yes' }).printBackground).toBe(true);
    expect(mergeSettings({ notifications: '' }).notifications).toBe(false);
  });

  it('coerces and clamps numbers', () => {
    expect(mergeSettings({ scale: '1.5' }).scale).toBe(1.5);
    expect(mergeSettings({ scale: 99 }).scale).toBe(2); // upper bound
    expect(mergeSettings({ scale: 0 }).scale).toBe(0.1); // lower bound
    expect(mergeSettings({ margin: -3 }).margin).toBe(0);
    expect(mergeSettings({ thumbnailQuality: 9999 }).thumbnailQuality).toBe(100);
    expect(mergeSettings({ maxPageHeightInches: 1 }).maxPageHeightInches).toBe(11);
  });

  it('rejects out-of-enum values', () => {
    expect(mergeSettings({ captureMode: 'weird' }).captureMode).toBe(DEFAULT_SETTINGS.captureMode);
    expect(mergeSettings({ theme: 'rainbow' }).theme).toBe(DEFAULT_SETTINGS.theme);
    expect(mergeSettings({ orientation: 'sideways' }).orientation).toBe(DEFAULT_SETTINGS.orientation);
  });

  it('keeps non-finite numbers at default', () => {
    expect(mergeSettings({ scale: 'abc' }).scale).toBe(DEFAULT_SETTINGS.scale);
    expect(mergeSettings({ waitForContent: NaN }).waitForContent).toBe(DEFAULT_SETTINGS.waitForContent);
  });

  it('produces a fresh object (no shared mutation)', () => {
    const a = mergeSettings();
    a.captureMode = 'paged';
    expect(DEFAULT_SETTINGS.captureMode).toBe('single');
  });
});
