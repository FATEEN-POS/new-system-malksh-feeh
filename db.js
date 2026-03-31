/**
 * db.js — Fateen POS Local Data Layer (IndexedDB)
 * Replaces Supabase with a fully offline-first, IndexedDB-backed client.
 * Exposes createLocalClient() with the same chaining API as supabase-js.
 */

'use strict';

const FATEEN_DB_NAME = 'fateen_pos_db';
const FATEEN_DB_VERSION = 1;

const OBJECT_STORES = [
  'stores', 'users', 'products', 'sales', 'sales_archive',
  'purchases', 'purchases_archive', 'purchase_returns',
  'expenses', 'expenses_archive', 'suppliers', 'supply_records',
  'vendors', 'system_settings'
];

// ──────────────────────────────────────────────
// DB init
// ──────────────────────────────────────────────
let _dbInstance = null;

function openFateenDB() {
  if (_dbInstance) return Promise.resolve(_dbInstance);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FATEEN_DB_NAME, FATEEN_DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      OBJECT_STORES.forEach(name => {
        if (!db.objectStoreNames.contains(name)) {
          const os = db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
          os.createIndex('store_key', 'store_key', { unique: false });
          if (name === 'users') {
            os.createIndex('username', 'username', { unique: false });
          }
          if (name === 'system_settings') {
            os.createIndex('key_idx', 'key', { unique: false });
          }
        }
      });
    };

    req.onsuccess = e => {
      _dbInstance = e.target.result;
      resolve(_dbInstance);
    };
    req.onerror = e => reject(e.target.error);
  });
}

// ──────────────────────────────────────────────
// Query Builder
// ──────────────────────────────────────────────
class QueryBuilder {
  constructor(table) {
    this._table = table;
    this._operation = 'select';
    this._selectFields = '*';
    this._countMode = false;
    this._headMode = false;
    this._filters = [];
    this._orderField = null;
    this._orderAsc = true;
    this._limitValue = null;
    this._singleMode = false;
    this._insertData = null;
    this._updateData = null;
    this._upsertOptions = null;
  }

  // ── Read ──
  select(fields, opts) {
    if (fields === undefined) fields = '*';
    if (opts === undefined) opts = {};
    this._operation = 'select';
    this._selectFields = fields;
    if (opts.count === 'exact') this._countMode = true;
    if (opts.head === true) this._headMode = true;
    return this;
  }

  // ── Write ──
  insert(data) {
    this._operation = 'insert';
    this._insertData = Array.isArray(data) ? data : [data];
    return this;
  }

  upsert(data, opts) {
    this._operation = 'upsert';
    this._insertData = Array.isArray(data) ? data : [data];
    this._upsertOptions = opts || {};
    return this;
  }

  update(data) {
    this._operation = 'update';
    this._updateData = data;
    return this;
  }

  delete() {
    this._operation = 'delete';
    return this;
  }

  // ── Filters ──
  eq(col, val)    { this._filters.push({ type: 'eq',    col, val });       return this; }
  neq(col, val)   { this._filters.push({ type: 'neq',   col, val });       return this; }
  gt(col, val)    { this._filters.push({ type: 'gt',    col, val });       return this; }
  gte(col, val)   { this._filters.push({ type: 'gte',   col, val });       return this; }
  lt(col, val)    { this._filters.push({ type: 'lt',    col, val });       return this; }
  lte(col, val)   { this._filters.push({ type: 'lte',   col, val });       return this; }
  ilike(col, val) { this._filters.push({ type: 'ilike', col, val });       return this; }
  in(col, vals)   { this._filters.push({ type: 'in',    col, vals: vals }); return this; }

  // ── Modifiers ──
  order(field, opts) {
    this._orderField = field;
    this._orderAsc = opts && opts.ascending === false ? false : true;
    return this;
  }

  limit(n) {
    this._limitValue = n;
    return this;
  }

  single() {
    this._singleMode = true;
    return this;
  }

  // ── Thenable interface (makes QueryBuilder awaitable) ──
  then(onFulfilled, onRejected) {
    return this._execute().then(onFulfilled, onRejected);
  }

  catch(onRejected) {
    return this._execute().catch(onRejected);
  }

  _execute() {
    return this._run().then(
      result => Object.assign({ error: null }, result),
      err    => ({ data: null, count: null, error: err })
    );
  }

  _run() {
    return openFateenDB().then(db => {
      switch (this._operation) {
        case 'insert': return this._runInsert(db);
        case 'upsert': return this._runUpsert(db);
        case 'update': return this._runUpdate(db);
        case 'delete': return this._runDelete(db);
        default:       return this._runSelect(db);
      }
    });
  }

  // ── Filter evaluation ──
  _matches(record) {
    return this._filters.every(f => {
      const v = record[f.col];
      switch (f.type) {
        case 'eq':  {
          if (v === f.val) return true;
          // Allow number/string interop (e.g. autoincrement id queried as string)
          if (v == null || f.val == null) return v === f.val;
          return typeof v !== typeof f.val && String(v) === String(f.val);
        }
        case 'neq': {
          if (v === f.val) return false;
          if (v == null || f.val == null) return v !== f.val;
          return typeof v === typeof f.val || String(v) !== String(f.val);
        }
        case 'gt':    return v > f.val;
        case 'gte':   return v >= f.val;
        case 'lt':    return v < f.val;
        case 'lte':   return v <= f.val;
        case 'ilike': {
          const pat = String(f.val).replace(/%/g, '');
          return String(v == null ? '' : v).toLowerCase().includes(pat.toLowerCase());
        }
        case 'in':    return Array.isArray(f.vals) && f.vals.includes(v);
        default:      return true;
      }
    });
  }

  // ── IDB helpers ──
  _getAll(db) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this._table, 'readonly');
      const req = tx.objectStore(this._table).getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  _waitTx(tx) {
    return new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
      tx.onabort    = e => reject(e.target.error);
    });
  }

  // ── SELECT ──
  async _runSelect(db) {
    let records = await this._getAll(db);
    records = records.filter(r => this._matches(r));

    if (this._orderField) {
      const f = this._orderField, asc = this._orderAsc;
      records.sort((a, b) => {
        const av = a[f], bv = b[f];
        if (av < bv) return asc ? -1 : 1;
        if (av > bv) return asc ? 1 : -1;
        return 0;
      });
    }

    if (this._limitValue != null) records = records.slice(0, this._limitValue);

    const count = this._countMode ? records.length : null;
    if (this._headMode) return { data: null, count };

    let data = records;
    if (this._selectFields !== '*') {
      const fields = this._selectFields.split(',').map(s => s.trim()).filter(Boolean);
      data = records.map(r => {
        const obj = {};
        fields.forEach(f => { obj[f] = r[f]; });
        return obj;
      });
    }

    if (this._singleMode) return { data: data[0] != null ? data[0] : null, count };
    return { data, count };
  }

  // ── INSERT ──
  async _runInsert(db) {
    const tx = db.transaction(this._table, 'readwrite');
    const store = tx.objectStore(this._table);
    const results = [];

    for (const record of this._insertData) {
      const row = Object.assign({}, record);
      if (!row.created_at) row.created_at = new Date().toISOString();
      delete row.id; // let autoIncrement assign
      const id = await new Promise((resolve, reject) => {
        const req = store.add(row);
        req.onsuccess = e => resolve(e.target.result);
        req.onerror   = e => reject(e.target.error);
      });
      results.push(Object.assign({}, row, { id }));
    }

    await this._waitTx(tx);
    return { data: results };
  }

  // ── UPSERT ──
  async _runUpsert(db) {
    const opts = this._upsertOptions || {};
    const conflictFields = opts.onConflict
      ? opts.onConflict.split(',').map(s => s.trim())
      : ['id'];
    const ignoreDups = !!opts.ignoreDuplicates;

    const tx = db.transaction(this._table, 'readwrite');
    const store = tx.objectStore(this._table);
    const existing = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });

    const results = [];
    for (const record of this._insertData) {
      const match = existing.find(r =>
        conflictFields.every(f => {
          const rv = r[f], recv = record[f];
          return rv === recv ||
            (rv != null && recv != null && typeof rv !== typeof recv && String(rv) === String(recv));
        })
      );

      if (match) {
        if (!ignoreDups) {
          const updated = Object.assign({}, match, record);
          await new Promise((resolve, reject) => {
            const req = store.put(updated);
            req.onsuccess = () => resolve();
            req.onerror   = e => reject(e.target.error);
          });
          results.push(updated);
        }
      } else {
        const row = Object.assign({}, record);
        if (!row.created_at) row.created_at = new Date().toISOString();
        if (!row.id) delete row.id;
        const id = await new Promise((resolve, reject) => {
          const req = row.id != null ? store.put(row) : store.add(row);
          req.onsuccess = e => resolve(e.target.result);
          req.onerror   = e => reject(e.target.error);
        });
        results.push(Object.assign({}, row, { id }));
      }
    }

    await this._waitTx(tx);
    return { data: results };
  }

  // ── UPDATE ──
  async _runUpdate(db) {
    const tx = db.transaction(this._table, 'readwrite');
    const store = tx.objectStore(this._table);
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });

    const results = [];
    for (const record of all.filter(r => this._matches(r))) {
      const updated = Object.assign({}, record, this._updateData);
      await new Promise((resolve, reject) => {
        const req = store.put(updated);
        req.onsuccess = () => resolve();
        req.onerror   = e => reject(e.target.error);
      });
      results.push(updated);
    }

    await this._waitTx(tx);
    return { data: results };
  }

  // ── DELETE ──
  async _runDelete(db) {
    const tx = db.transaction(this._table, 'readwrite');
    const store = tx.objectStore(this._table);
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });

    const toDelete = all.filter(r => this._matches(r));
    for (const record of toDelete) {
      await new Promise((resolve, reject) => {
        const req = store.delete(record.id);
        req.onsuccess = () => resolve();
        req.onerror   = e => reject(e.target.error);
      });
    }

    await this._waitTx(tx);
    return { data: toDelete };
  }
}

// ──────────────────────────────────────────────
// createLocalClient — drop-in Supabase replacement
// ──────────────────────────────────────────────
function createLocalClient() {
  return {
    from(table) {
      return new QueryBuilder(table);
    },
    // Stub for rpc() — returns local IndexedDB estimates where possible
    rpc(funcName) {
      if (funcName === 'get_db_size') {
        return openFateenDB().then(db => {
          const stores = Array.from(db.objectStoreNames);
          const queries = stores.map(name =>
            new Promise(resolve => {
              try {
                const tx = db.transaction(name, 'readonly');
                const req = tx.objectStore(name).count();
                req.onsuccess = e => resolve(e.target.result);
                req.onerror   = () => resolve(0);
              } catch (_) { resolve(0); }
            })
          );
          return Promise.all(queries).then(counts => {
            const total = counts.reduce((s, c) => s + c, 0);
            // Assume ~500 bytes per record on average for size estimation
            const AVG_RECORD_SIZE_KB = 0.5;
            const estimatedMB = (total * AVG_RECORD_SIZE_KB / 1024).toFixed(2);
            return { data: { total_size_mb: estimatedMB }, error: null };
          });
        });
      }
      return Promise.resolve({ data: null, error: null });
    }
  };
}

// ──────────────────────────────────────────────
// First-run detection
// ──────────────────────────────────────────────
async function isFirstRun() {
  const result = await createLocalClient().from('stores').select('id');
  return !result.data || result.data.length === 0;
}

// ──────────────────────────────────────────────
// Subscription check (every 30 days)
// ──────────────────────────────────────────────
/**
 * SUBSCRIPTION_CHECK_URL — set to your validation endpoint to enforce online checks.
 * Leave empty for "offline grace mode": the 30-day timer still counts but no
 * network call is made and access is never blocked. This is safe for fully-air-gapped
 * deployments but means subscriptions cannot be revoked remotely.
 */
const SUBSCRIPTION_CHECK_URL = ''; // e.g. 'https://your-server.com/api/check-subscription'
const SUBSCRIPTION_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const SUBSCRIPTION_CHECK_TIMEOUT_MS = 6000; // 6 s — generous enough for slow connections
const SUBSCRIPTION_LS_KEY = 'fateen_subscription_ts';

async function checkSubscription() {
  const last = parseInt(localStorage.getItem(SUBSCRIPTION_LS_KEY) || '0', 10);
  const now  = Date.now();

  // Not yet 30 days — subscription still valid
  if (now - last < SUBSCRIPTION_INTERVAL_MS) return true;

  // 30 days elapsed — attempt online validation if URL is configured
  if (SUBSCRIPTION_CHECK_URL) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), SUBSCRIPTION_CHECK_TIMEOUT_MS);
      const res = await fetch(SUBSCRIPTION_CHECK_URL, {
        method: 'GET',
        signal: ctrl.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        console.warn('[Fateen] Subscription check failed: HTTP', res.status);
        return false;
      }
    } catch (err) {
      console.warn('[Fateen] Subscription check network error:', err.message || err);
      return false;
    }
  }

  // Passed (or no URL configured — offline grace mode) — reset timer
  localStorage.setItem(SUBSCRIPTION_LS_KEY, String(now));
  return true;
}

function initSubscription() {
  if (!localStorage.getItem(SUBSCRIPTION_LS_KEY)) {
    localStorage.setItem(SUBSCRIPTION_LS_KEY, String(Date.now()));
  }
}

// ──────────────────────────────────────────────
// JSON Backup / Restore
// ──────────────────────────────────────────────
async function exportFateenDB() {
  const db = await openFateenDB();
  const backup = { _version: FATEEN_DB_VERSION, _exported: new Date().toISOString() };

  for (const name of OBJECT_STORES) {
    backup[name] = await new Promise((resolve, reject) => {
      const tx = db.transaction(name, 'readonly');
      const req = tx.objectStore(name).getAll();
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }
  return backup;
}

async function importFateenDB(backup) {
  const db = await openFateenDB();
  for (const name of OBJECT_STORES) {
    if (!Array.isArray(backup[name])) continue;
    const tx = db.transaction(name, 'readwrite');
    const store = tx.objectStore(name);

    await new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = resolve;
      req.onerror   = e => reject(e.target.error);
    });

    for (const record of backup[name]) {
      await new Promise((resolve, reject) => {
        const req = store.put(record);
        req.onsuccess = () => resolve();
        req.onerror   = e => reject(e.target.error);
      });
    }

    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  }
}

// ──────────────────────────────────────────────
// Archive helpers (move records to *_archive)
// ──────────────────────────────────────────────
async function archiveRecords(sourceTable, archiveTable, filterFn) {
  const client = createLocalClient();
  const { data: all } = await client.from(sourceTable).select('*');
  if (!all || all.length === 0) return { archived: 0 };

  const toArchive = typeof filterFn === 'function' ? all.filter(filterFn) : all;
  if (toArchive.length === 0) return { archived: 0 };

  const db = await openFateenDB();
  const tx  = db.transaction([sourceTable, archiveTable], 'readwrite');
  const src  = tx.objectStore(sourceTable);
  const arch = tx.objectStore(archiveTable);

  for (const record of toArchive) {
    await new Promise((resolve, reject) => {
      const r = arch.add(Object.assign({}, record, { id: undefined }));
      r.onsuccess = () => resolve();
      r.onerror   = e => reject(e.target.error);
    });
    await new Promise((resolve, reject) => {
      const r = src.delete(record.id);
      r.onsuccess = () => resolve();
      r.onerror   = e => reject(e.target.error);
    });
  }

  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror    = e => reject(e.target.error);
  });

  return { archived: toArchive.length };
}

// ──────────────────────────────────────────────
// Global exports
// ──────────────────────────────────────────────
window.createLocalClient  = createLocalClient;
window.openFateenDB       = openFateenDB;
window.isFirstRun         = isFirstRun;
window.checkSubscription  = checkSubscription;
window.initSubscription   = initSubscription;
window.exportFateenDB     = exportFateenDB;
window.importFateenDB     = importFateenDB;
window.archiveFateenRecords = archiveRecords;
