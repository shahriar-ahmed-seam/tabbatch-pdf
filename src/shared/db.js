/**
 * Promise-based IndexedDB data layer for captured PDF records.
 *
 * A record looks like:
 * {
 *   id?: number,            // auto-increment primary key
 *   order: number,          // user-controlled sort position
 *   title: string,
 *   url: string,
 *   pdfBase64: string,      // the captured document
 *   thumbnailDataUrl: string|null,
 *   byteSize: number,
 *   pageCount: number,
 *   mode: 'single'|'paged',
 *   timestamp: number,
 *   status: 'ok'|'error',
 *   error?: string
 * }
 *
 * @module shared/db
 */

const DB_NAME = 'TabBatchPDF';
const DB_VERSION = 2;
const STORE = 'pdfs';

/** Open (and upgrade) the database. */
export function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      let store;
      if (!db.objectStoreNames.contains(STORE)) {
        store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
      } else {
        store = event.target.transaction.objectStore(STORE);
      }
      if (!store.indexNames.contains('order')) {
        store.createIndex('order', 'order', { unique: false });
      }
      if (!store.indexNames.contains('timestamp')) {
        store.createIndex('timestamp', 'timestamp', { unique: false });
      }
    };
  });
}

/** Wrap an IDBRequest in a promise. */
function reqToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Run a callback within a transaction and resolve on completion. */
async function withStore(mode, fn) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction([STORE], mode);
      const store = tx.objectStore(STORE);
      let result;
      Promise.resolve(fn(store))
        .then((r) => {
          result = r;
        })
        .catch(reject);
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  } finally {
    db.close();
  }
}

/** Return all records sorted by `order` (then id) ascending. */
export async function getAllPdfs() {
  const records = await withStore('readonly', (store) => reqToPromise(store.getAll()));
  return records.sort((a, b) => {
    const ao = a.order ?? a.id ?? 0;
    const bo = b.order ?? b.id ?? 0;
    if (ao !== bo) return ao - bo;
    return (a.id ?? 0) - (b.id ?? 0);
  });
}

/** Number of stored records. */
export async function countPdfs() {
  return withStore('readonly', (store) => reqToPromise(store.count()));
}

/** Fetch a single record by id. */
export async function getPdf(id) {
  return withStore('readonly', (store) => reqToPromise(store.get(id)));
}

/**
 * Append records to the end of the current ordering.
 * @param {object[]} records
 * @returns {Promise<number[]>} assigned ids
 */
export async function addPdfs(records) {
  if (!records || records.length === 0) return [];
  const existing = await countPdfs();
  return withStore('readwrite', async (store) => {
    const ids = [];
    let order = existing;
    for (const record of records) {
      const toStore = { ...record, order: order++ };
      delete toStore.id;
      const id = await reqToPromise(store.add(toStore));
      ids.push(id);
    }
    return ids;
  });
}

/** Replace a record in place (keeps id + order). */
export async function updatePdf(id, patch) {
  return withStore('readwrite', async (store) => {
    const existing = await reqToPromise(store.get(id));
    if (!existing) throw new Error(`Record ${id} not found`);
    const merged = { ...existing, ...patch, id };
    await reqToPromise(store.put(merged));
    return merged;
  });
}

/** Delete a single record. */
export async function deletePdf(id) {
  return withStore('readwrite', (store) => reqToPromise(store.delete(id)));
}

/** Delete several records. */
export async function deletePdfs(ids) {
  return withStore('readwrite', async (store) => {
    for (const id of ids) await reqToPromise(store.delete(id));
  });
}

/** Remove every record. */
export async function clearPdfs() {
  return withStore('readwrite', (store) => reqToPromise(store.clear()));
}

/**
 * Persist a new ordering. `orderedIds` is the desired sequence of ids.
 * @param {number[]} orderedIds
 */
export async function reorderPdfs(orderedIds) {
  return withStore('readwrite', async (store) => {
    for (let i = 0; i < orderedIds.length; i++) {
      const record = await reqToPromise(store.get(orderedIds[i]));
      if (record) {
        record.order = i;
        await reqToPromise(store.put(record));
      }
    }
  });
}

export const __testing = { DB_NAME, DB_VERSION, STORE };
