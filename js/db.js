/* SnapBill by Silsilara — Copyright (c) 2026 Risyad Abdala Ramadhan. All rights reserved.
 * Penyimpanan lokal berbasis IndexedDB. Tidak ada data yang dikirim ke server. */

const DB_NAME = 'snapbill';
const DB_VERSION = 1;
export const STORES = ['meta', 'clients', 'services', 'invoices'];

let dbPromise;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('clients')) db.createObjectStore('clients', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('services')) db.createObjectStore('services', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('invoices')) {
        const s = db.createObjectStore('invoices', { keyPath: 'id' });
        s.createIndex('status', 'status');
        s.createIndex('issueDate', 'issueDate');
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Database sedang dipakai tab lain. Tutup tab SnapBill lainnya lalu muat ulang.'));
  });
  return dbPromise;
}

const wrap = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaksi dibatalkan'));
  });

async function os(name, mode = 'readonly') {
  const db = await openDB();
  return db.transaction(name, mode).objectStore(name);
}

export const db = {
  get: async (store, key) => wrap((await os(store)).get(key)),
  all: async (store) => wrap((await os(store)).getAll()),
  count: async (store) => wrap((await os(store)).count()),
  put: async (store, value) => {
    await wrap((await os(store, 'readwrite')).put(value));
    return value;
  },
  del: async (store, key) => wrap((await os(store, 'readwrite')).delete(key)),

  async putMany(store, values) {
    const conn = await openDB();
    const tx = conn.transaction(store, 'readwrite');
    const s = tx.objectStore(store);
    values.forEach((v) => s.put(v));
    return done(tx);
  },

  /**
   * Tulis data restore dalam satu transaksi. Store data (klien, layanan, tagihan)
   * dikosongkan dulu bila `clear` true; baris meta hanya ditimpa per key
   * (PIN di perangkat ini tidak pernah ikut tertimpa).
   */
  async restore(data, { clear = true } = {}) {
    const conn = await openDB();
    const tx = conn.transaction(STORES, 'readwrite');
    for (const name of STORES) {
      if (!Array.isArray(data[name])) continue;
      const s = tx.objectStore(name);
      if (clear && name !== 'meta') s.clear();
      data[name].forEach((v) => s.put(v));
    }
    return done(tx);
  },

  async wipe() {
    const conn = await openDB();
    const tx = conn.transaction(STORES, 'readwrite');
    STORES.forEach((n) => tx.objectStore(n).clear());
    return done(tx);
  },
};

export const meta = {
  async get(key, fallback) {
    const row = await db.get('meta', key);
    return row === undefined ? fallback : row.value;
  },
  set: (key, value) => db.put('meta', { key, value }),
  del: (key) => db.del('meta', key),
};
