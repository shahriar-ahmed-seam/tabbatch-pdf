import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import {
  addPdfs, getAllPdfs, getPdf, countPdfs, updatePdf,
  deletePdf, deletePdfs, clearPdfs, reorderPdfs,
} from '../src/shared/db.js';

function rec(title, extra = {}) {
  return {
    title, url: `https://example.com/${title}`, pdfBase64: 'AAAA',
    thumbnailDataUrl: null, byteSize: 100, pageCount: 1,
    mode: 'single', timestamp: Date.now(), status: 'ok', ...extra,
  };
}

beforeEach(async () => {
  await clearPdfs();
});

describe('db CRUD', () => {
  it('starts empty', async () => {
    expect(await countPdfs()).toBe(0);
    expect(await getAllPdfs()).toEqual([]);
  });

  it('adds records and assigns ids + order', async () => {
    const ids = await addPdfs([rec('a'), rec('b'), rec('c')]);
    expect(ids).toHaveLength(3);
    const all = await getAllPdfs();
    expect(all.map((r) => r.title)).toEqual(['a', 'b', 'c']);
    expect(all[0].order).toBe(0);
    expect(all[2].order).toBe(2);
  });

  it('appends preserving order across calls', async () => {
    await addPdfs([rec('a'), rec('b')]);
    await addPdfs([rec('c')]);
    const all = await getAllPdfs();
    expect(all.map((r) => r.title)).toEqual(['a', 'b', 'c']);
    expect(all.map((r) => r.order)).toEqual([0, 1, 2]);
  });

  it('handles empty add', async () => {
    expect(await addPdfs([])).toEqual([]);
    expect(await addPdfs(null)).toEqual([]);
  });

  it('gets a single record', async () => {
    const [id] = await addPdfs([rec('solo')]);
    const r = await getPdf(id);
    expect(r.title).toBe('solo');
  });

  it('updates in place keeping id', async () => {
    const [id] = await addPdfs([rec('old')]);
    const updated = await updatePdf(id, { title: 'new', byteSize: 999 });
    expect(updated.id).toBe(id);
    expect(updated.title).toBe('new');
    expect(updated.byteSize).toBe(999);
    expect((await getPdf(id)).title).toBe('new');
  });

  it('throws updating a missing record', async () => {
    await expect(updatePdf(99999, { title: 'x' })).rejects.toThrow();
  });

  it('deletes a single record', async () => {
    const ids = await addPdfs([rec('a'), rec('b')]);
    await deletePdf(ids[0]);
    const all = await getAllPdfs();
    expect(all.map((r) => r.title)).toEqual(['b']);
  });

  it('deletes multiple records', async () => {
    const ids = await addPdfs([rec('a'), rec('b'), rec('c')]);
    await deletePdfs([ids[0], ids[2]]);
    expect((await getAllPdfs()).map((r) => r.title)).toEqual(['b']);
  });

  it('clears all', async () => {
    await addPdfs([rec('a'), rec('b')]);
    await clearPdfs();
    expect(await countPdfs()).toBe(0);
  });
});

describe('reorderPdfs', () => {
  it('persists a new ordering', async () => {
    const ids = await addPdfs([rec('a'), rec('b'), rec('c')]);
    const reversed = [...ids].reverse();
    await reorderPdfs(reversed);
    const all = await getAllPdfs();
    expect(all.map((r) => r.title)).toEqual(['c', 'b', 'a']);
    expect(all.map((r) => r.order)).toEqual([0, 1, 2]);
  });

  it('ignores ids that no longer exist', async () => {
    const ids = await addPdfs([rec('a'), rec('b')]);
    await expect(reorderPdfs([ids[1], 4242, ids[0]])).resolves.not.toThrow();
    const all = await getAllPdfs();
    expect(all.map((r) => r.title)).toEqual(['b', 'a']);
  });
});
