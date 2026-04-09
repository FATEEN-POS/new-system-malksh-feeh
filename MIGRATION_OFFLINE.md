# MIGRATION_OFFLINE.md — Fateen POS Offline-First Guide

## Overview

Fateen POS has been migrated from a Supabase (cloud) backend to a fully **offline-first** architecture using **IndexedDB**. The app now runs entirely in the browser with no network dependency for normal operation.

---

## 1. IndexedDB Local Data Layer (`db.js`)

### What it does
`db.js` is a drop-in replacement for the Supabase JavaScript client. It exposes `createLocalClient()` which returns an object with the same chaining API as `supabase-js`:

```js
const _supabase = createLocalClient();

// Read
const { data, error } = await _supabase.from('products')
  .select('*')
  .eq('store_key', storeKey)
  .order('product_name');

// Write
await _supabase.from('sales').insert([{ store_key, total_amount, ... }]);

// Update
await _supabase.from('products').update({ stock: newStock }).eq('id', productId);

// Delete
await _supabase.from('sales').delete().eq('id', saleId);

// Upsert
await _supabase.from('system_settings')
  .upsert([{ key: 'setting_name', value: 'val' }], { onConflict: 'key' });
```

### Object Stores (Tables)
| Table | Purpose |
|---|---|
| `stores` | Multi-tenant store registry |
| `users` | Staff accounts and roles |
| `products` | Product catalog and stock |
| `sales` | Active sale invoices |
| `sales_archive` | Archived invoices |
| `purchases` | Purchase orders |
| `purchases_archive` | Archived purchases |
| `purchase_returns` | Return records |
| `expenses` | Business expenses |
| `expenses_archive` | Archived expenses |
| `suppliers` | Supplier directory |
| `supply_records` | Supply delivery records |
| `vendors` | Vendor records |
| `system_settings` | App configuration (key/value) |

### Tenant Isolation
All data is isolated per `store_key`. Every query must include `.eq('store_key', storeKey)` — this mirrors the previous Supabase row-level security.

### Backup & Restore
```js
// Export all data as JSON
const backup = await exportFateenDB();
const json = JSON.stringify(backup);
// Save to file / send to server

// Restore from JSON
const backup = JSON.parse(jsonString);
await importFateenDB(backup);
```

### Archive Helper
```js
// Move old sales (> 80 days) to sales_archive
await archiveFateenRecords('sales', 'sales_archive', record => {
  const age = Date.now() - new Date(record.created_at).getTime();
  return age > 80 * 24 * 60 * 60 * 1000;
});
```

---

## 2. First-Run Setup Flow

On first launch (when IndexedDB has no stores), `index.html` automatically shows a **setup wizard** instead of the login form.

The wizard collects:
- **اسم المتجر** — Store display name
- **كود المتجر** — Unique store key (letters/numbers, no spaces)
- **اسم المدير** — Manager/owner username
- **كلمة المرور** — Password

After submitting, the wizard creates:
1. A record in the `stores` table
2. A manager user in the `users` table
3. A default `sys_version` entry in `system_settings`

The login screen then appears pre-filled with the new store key.

---

## 3. Subscription Check (Every 30 Days)

On each app start, `index.html` calls `checkSubscription()`:

1. Reads `fateen_subscription_ts` from `localStorage`
2. If fewer than 30 days have elapsed → **valid**, proceed normally
3. If 30 days have elapsed:
   - If `SUBSCRIPTION_CHECK_URL` is set in `db.js` → fetch that URL
     - `200 OK` → renew timestamp, proceed
     - Any error / non-200 → show **subscription expired** overlay and block UI
   - If `SUBSCRIPTION_CHECK_URL` is empty → automatically renew (offline grace mode)

### Configuring the validation endpoint
Edit `db.js`:
```js
const SUBSCRIPTION_CHECK_URL = 'https://your-server.com/api/check-subscription';
```

The endpoint should return HTTP 200 for active subscriptions and any other status code to block access.

---

## 4. Building for Android (TWA / Bubblewrap)

### Prerequisites
- Node.js ≥ 18
- Java JDK 17
- Android SDK / Android Studio

### Steps
```bash
# Install dependencies
npm install

# Initialize TWA project (one-time)
npm run init:android
# This reads twa-manifest.json and creates the Android project

# Build APK
npm run build:android
# Output: android/app/build/outputs/apk/release/app-release.apk
```

The TWA wraps the PWA hosted at `https://fateen-pos.github.io/test-pos/` (or your custom domain). The app works fully offline thanks to the service worker cache.

#### Signing the APK
Edit `twa-manifest.json` and set your keystore details:
```json
{
  "signingKey": {
    "path": "./android.keystore",
    "alias": "fateen-pos"
  }
}
```

---

## 5. Building for Windows (Tauri)

### Prerequisites
- Node.js ≥ 18
- Rust (https://rustup.rs/)
- Microsoft C++ Build Tools (Windows)
- WebView2 Runtime (usually pre-installed on Windows 10/11)

### Steps
```bash
# Install dependencies
npm install

# Build Windows EXE / MSI
npm run build:win
# Output: src-tauri/target/release/fateen-pos.exe
#         src-tauri/target/release/bundle/msi/fateen-pos_1.0.0_x64_en-US.msi
```

The Tauri window configuration is in `src-tauri/tauri.conf.json`:
- Default size: 1280×800 (min 900×600)
- Start URL: `index.html`
- Printing: enabled via browser `Ctrl+P`

---

## 6. Running in Development

```bash
# Simple HTTP server (no install required)
npx http-server . -p 3000 -o

# Or with npm script
npm run dev
```

Open `http://localhost:3000/index.html`.

> **Note:** The service worker only activates over HTTPS or localhost. IndexedDB works normally on localhost.

---

## 7. Service Worker Cache

`sw.js` (v3) caches all HTML pages plus `db.js` and `manifest.json`. When offline, navigation falls back to cached pages. The `no-internet.html` page is served as a last resort.

New assets added to the project should be appended to `STATIC_ASSETS` in `sw.js` and the `CACHE_NAME` version bumped (e.g., `fateen-os-v4`).

---

## 8. Notes

- **Arabic UI** is fully preserved — no UI changes were made.
- **Themes**, **charts** (Chart.js), and **exports** (XLSX/jsPDF) continue to use locally fetched data from IndexedDB.
- **No Supabase network dependency** remains. The `@supabase/supabase-js` CDN script has been removed from all pages.
- The `store_key` multi-tenant pattern is preserved identically.
- Session management (`fateen_session` in `localStorage`) is unchanged.
