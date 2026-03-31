/**
 * Fateen POS — IndexedDB Data Layer
 * Lightweight wrapper (no framework) with versioned schema,
 * CRUD helpers, transaction helpers, and JSON backup/restore.
 */

const DB_NAME = 'fateen_pos';
const DB_VERSION = 1;

/** @type {IDBDatabase|null} */
let _db = null;

// ─────────────────────────────────────────────────────────────────────────────
// Schema definition
// ─────────────────────────────────────────────────────────────────────────────
const STORES = {
  // Operational stores
  products: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'barcode',    keyPath: 'barcode',    unique: true },
      { name: 'category',   keyPath: 'category',   unique: false },
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
    ],
  },
  sales: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'created_at', keyPath: 'created_at', unique: false },
      { name: 'cashier',    keyPath: 'cashier',    unique: false },
    ],
  },
  sales_archive: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'created_at', keyPath: 'created_at', unique: false },
    ],
  },
  purchases: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'created_at', keyPath: 'created_at', unique: false },
      { name: 'supplier_id',keyPath: 'supplier_id',unique: false },
    ],
  },
  purchases_archive: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'created_at', keyPath: 'created_at', unique: false },
    ],
  },
  expenses: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'date',       keyPath: 'date',       unique: false },
    ],
  },
  expenses_archive: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'date',       keyPath: 'date',       unique: false },
    ],
  },
  suppliers: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'name',       keyPath: 'name',       unique: false },
    ],
  },
  supply_records: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'supplier_id',keyPath: 'supplier_id',unique: false },
      { name: 'date',       keyPath: 'date',       unique: false },
    ],
  },
  purchase_returns: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'created_at', keyPath: 'created_at', unique: false },
    ],
  },
  vendors: {
    keyPath: 'id',
    autoIncrement: true,
    indexes: [
      { name: 'store_key',  keyPath: 'store_key',  unique: false },
      { name: 'created_at', keyPath: 'created_at', unique: false },
    ],
  },
  // Config / metadata store
  app_metadata: {
    keyPath: 'key',
    autoIncrement: false,
    indexes: [],
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Open / initialise DB
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Open the IndexedDB database. Safe to call multiple times — returns the
 * cached connection after the first successful open.
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  if (_db) return Promise.resolve(_db);

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = event.target.result;

      Object.entries(STORES).forEach(([storeName, config]) => {
        if (!db.objectStoreNames.contains(storeName)) {
          const store = db.createObjectStore(storeName, {
            keyPath: config.keyPath,
            autoIncrement: config.autoIncrement,
          });
          config.indexes.forEach(({ name, keyPath, unique }) => {
            store.createIndex(name, keyPath, { unique });
          });
        }
      });
    };

    req.onsuccess = (event) => {
      _db = event.target.result;
      resolve(_db);
    };

    req.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Low-level transaction helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string|string[]} storeNames
 * @param {'readonly'|'readwrite'} mode
 * @param {function(IDBTransaction): Promise<any>} fn
 */
async function withTransaction(storeNames, mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(new Error('Transaction aborted'));
    Promise.resolve(fn(tx)).then(resolve).catch((err) => {
      tx.abort();
      reject(err);
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Generic CRUD helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Wrap an IDBRequest in a Promise.
 * @param {IDBRequest} req
 */
function promisifyRequest(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

/**
 * Add a new record. Returns the generated key.
 * @param {string} storeName
 * @param {object} record
 */
async function add(storeName, record) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  return promisifyRequest(store.add(record));
}

/**
 * Put (upsert) a record.
 * @param {string} storeName
 * @param {object} record
 */
async function put(storeName, record) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  return promisifyRequest(store.put(record));
}

/**
 * Get a record by primary key.
 * @param {string} storeName
 * @param {any} key
 */
async function getByKey(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return promisifyRequest(store.get(key));
}

/**
 * Get all records from a store.
 * @param {string} storeName
 */
async function getAll(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const store = tx.objectStore(storeName);
  return promisifyRequest(store.getAll());
}

/**
 * Get all records from a store matching an index value.
 * @param {string} storeName
 * @param {string} indexName
 * @param {any} value
 */
async function getAllByIndex(storeName, indexName, value) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  const index = tx.objectStore(storeName).index(indexName);
  return promisifyRequest(index.getAll(value));
}

/**
 * Get records in a date range using an index.
 * @param {string} storeName
 * @param {string} indexName
 * @param {string} from  ISO date string
 * @param {string} to    ISO date string
 */
async function getByDateRange(storeName, indexName, from, to) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const index = tx.objectStore(storeName).index(indexName);
    const range = IDBKeyRange.bound(from, to, false, false);
    const req = index.getAll(range);
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

/**
 * Delete a record by primary key.
 * @param {string} storeName
 * @param {any} key
 */
async function remove(storeName, key) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  return promisifyRequest(store.delete(key));
}

/**
 * Clear all records from a store.
 * @param {string} storeName
 */
async function clearStore(storeName) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  return promisifyRequest(store.clear());
}

// ─────────────────────────────────────────────────────────────────────────────
// app_metadata helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Set a metadata key/value.
 * @param {string} key
 * @param {any} value
 */
async function setMeta(key, value) {
  return put('app_metadata', { key, value });
}

/**
 * Get a metadata value by key.
 * @param {string} key
 */
async function getMeta(key) {
  const record = await getByKey('app_metadata', key);
  return record ? record.value : undefined;
}

/**
 * Delete a metadata key.
 * @param {string} key
 */
async function removeMeta(key) {
  return remove('app_metadata', key);
}

// ─────────────────────────────────────────────────────────────────────────────
// Backup / Restore
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Export every store to a JSON string (backup).
 * @returns {Promise<string>}
 */
async function exportBackup() {
  const db = await openDB();
  const backup = { version: DB_VERSION, exported_at: new Date().toISOString(), stores: {} };

  for (const storeName of Object.keys(STORES)) {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    backup.stores[storeName] = await promisifyRequest(store.getAll());
  }

  return JSON.stringify(backup, null, 2);
}

/**
 * Import a JSON backup (replaces existing data).
 * Each store is cleared and repopulated in a single readwrite transaction.
 * @param {string} jsonString
 */
async function importBackup(jsonString) {
  const backup = JSON.parse(jsonString);
  const db = await openDB();

  for (const [storeName, records] of Object.entries(backup.stores || {})) {
    if (!STORES[storeName]) continue;

    await new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.onerror = () => reject(tx.error);
      tx.oncomplete = () => resolve();

      const store = tx.objectStore(storeName);
      store.clear();
      for (const record of records) {
        store.put(record);
      }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────
const FateenDB = {
  // Core
  openDB,
  withTransaction,

  // Generic CRUD
  add,
  put,
  getByKey,
  getAll,
  getAllByIndex,
  getByDateRange,
  remove,
  clearStore,

  // app_metadata shortcuts
  setMeta,
  getMeta,
  removeMeta,

  // Backup / restore
  exportBackup,
  importBackup,

  // Store names (convenience)
  STORES: Object.keys(STORES),
};

// Support both ES module import and plain <script> tag usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = FateenDB;
} else {
  window.FateenDB = FateenDB;
}
