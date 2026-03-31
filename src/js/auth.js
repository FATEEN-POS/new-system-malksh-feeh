/**
 * Fateen POS — Hybrid Auth Module
 *
 * - Validates store subscription and employee credentials via Supabase.
 * - Caches a minimal session locally (IndexedDB + sessionStorage) for offline continuity.
 * - Enforces a 30-day periodic licence re-validation (grace period configurable).
 */

(function (global) {
  'use strict';

  // ─── Configuration ───────────────────────────────────────────────────────
  const LICENCE_CHECK_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
  const LICENCE_GRACE_PERIOD_MS   = 30 * 24 * 60 * 60 * 1000; // 30 days offline grace
  const SUPABASE_TIMEOUT_MS       = 5000;                       // 5 s network timeout

  // Metadata keys used in IndexedDB app_metadata store
  const META_SESSION           = 'fateen_session';
  const META_LAST_LICENCE_CHECK= 'last_licence_check';
  const META_STORE_INFO        = 'store_info';

  // ─── Supabase client (re-used if already created by the page) ────────────
  function getSupabase() {
    if (global._supabase) return global._supabase;
    if (global.supabase && global.SUPABASE_URL && global.SUPABASE_ANON_KEY) {
      global._supabase = global.supabase.createClient(global.SUPABASE_URL, global.SUPABASE_ANON_KEY);
    }
    return global._supabase || null;
  }

  // ─── Network helpers ─────────────────────────────────────────────────────

  /**
   * Race a Supabase query against a timeout, resolving null on timeout/error.
   * @param {Promise} queryPromise
   * @returns {Promise<any>}
   */
  function withTimeout(queryPromise) {
    const timer = new Promise((resolve) => setTimeout(() => resolve(null), SUPABASE_TIMEOUT_MS));
    return Promise.race([queryPromise, timer]);
  }

  // ─── Session helpers ─────────────────────────────────────────────────────

  /**
   * Persist session to IndexedDB + sessionStorage + localStorage.
   * @param {object} sessionData
   */
  async function saveSession(sessionData) {
    const payload = Object.assign({}, sessionData, { ts: Date.now() });

    // sessionStorage — fast read on same tab
    sessionStorage.setItem('username',  payload.username  || '');
    sessionStorage.setItem('userRole',  payload.userRole  || '');
    sessionStorage.setItem('store_key', payload.store_key || '');

    // localStorage — persists across tabs (for offline continuity)
    localStorage.setItem('fateen_session', JSON.stringify(payload));

    // IndexedDB — authoritative offline store
    if (global.FateenDB) {
      await global.FateenDB.setMeta(META_SESSION, payload);
    }
  }

  /**
   * Load session from sessionStorage → localStorage → IndexedDB (in that order).
   * @returns {Promise<object|null>}
   */
  async function loadSession() {
    // 1) Try fast in-memory sessionStorage
    const role = sessionStorage.getItem('userRole');
    const user = sessionStorage.getItem('username');
    const sk   = sessionStorage.getItem('store_key');
    if (role && user && sk) {
      return { userRole: role, username: user, store_key: sk, ts: null };
    }

    // 2) Try localStorage
    try {
      const raw = localStorage.getItem('fateen_session');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.userRole && parsed.username && parsed.store_key) {
          // Restore sessionStorage from localStorage
          sessionStorage.setItem('username',  parsed.username);
          sessionStorage.setItem('userRole',  parsed.userRole);
          sessionStorage.setItem('store_key', parsed.store_key);
          return parsed;
        }
      }
    } catch (_) { /* ignore */ }

    // 3) Try IndexedDB
    if (global.FateenDB) {
      try {
        const meta = await global.FateenDB.getMeta(META_SESSION);
        if (meta && meta.userRole && meta.username && meta.store_key) {
          sessionStorage.setItem('username',  meta.username);
          sessionStorage.setItem('userRole',  meta.userRole);
          sessionStorage.setItem('store_key', meta.store_key);
          return meta;
        }
      } catch (_) { /* ignore */ }
    }

    return null;
  }

  /**
   * Clear all session data.
   */
  async function clearSession() {
    sessionStorage.removeItem('username');
    sessionStorage.removeItem('userRole');
    sessionStorage.removeItem('store_key');
    localStorage.removeItem('fateen_session');
    if (global.FateenDB) {
      await global.FateenDB.removeMeta(META_SESSION);
    }
  }

  // ─── Licence check ───────────────────────────────────────────────────────

  /**
   * Perform a licence validation against Supabase.
   * Returns true if the store is active, false if not, null if offline/timeout.
   * @param {string} store_key
   * @returns {Promise<boolean|null>}
   */
  async function checkLicenceOnline(store_key) {
    const sb = getSupabase();
    if (!sb) return null;

    try {
      const result = await withTimeout(
        sb.from('stores').select('is_active').eq('store_key', store_key).single()
      );
      if (!result) return null; // timeout
      if (result.error) return null;
      return result.data ? result.data.is_active === true : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Check licence with grace-period offline support.
   * @param {string} store_key
   * @returns {Promise<{allowed: boolean, reason: string}>}
   */
  async function checkLicence(store_key) {
    const now = Date.now();
    let lastCheck = null;

    if (global.FateenDB) {
      lastCheck = await global.FateenDB.getMeta(META_LAST_LICENCE_CHECK);
    } else {
      try {
        const raw = localStorage.getItem('fateen_last_licence_check');
        if (raw) lastCheck = parseInt(raw, 10);
      } catch (_) { /* ignore */ }
    }

    // If last check was recent enough, skip network call
    if (lastCheck && (now - lastCheck) < LICENCE_CHECK_INTERVAL_MS) {
      return { allowed: true, reason: 'cached' };
    }

    // Try online validation
    const active = await checkLicenceOnline(store_key);

    if (active === true) {
      // Store successful check timestamp
      if (global.FateenDB) {
        await global.FateenDB.setMeta(META_LAST_LICENCE_CHECK, now);
      } else {
        localStorage.setItem('fateen_last_licence_check', String(now));
      }
      return { allowed: true, reason: 'online_valid' };
    }

    if (active === false) {
      return { allowed: false, reason: 'subscription_expired' };
    }

    // Offline / timeout — apply grace period
    if (lastCheck && (now - lastCheck) < LICENCE_GRACE_PERIOD_MS) {
      return { allowed: true, reason: 'offline_grace' };
    }

    if (!lastCheck) {
      // Never validated online → block
      return { allowed: false, reason: 'no_prior_check' };
    }

    return { allowed: false, reason: 'grace_period_exceeded' };
  }

  // ─── Store info helpers ───────────────────────────────────────────────────

  /**
   * Cache store info locally after a successful lookup.
   * @param {object} storeData
   */
  async function cacheStoreInfo(storeData) {
    if (global.FateenDB) {
      await global.FateenDB.setMeta(META_STORE_INFO, storeData);
    }
    localStorage.setItem('fateen_store_info', JSON.stringify(storeData));
  }

  /**
   * Retrieve cached store info (offline use).
   * @returns {Promise<object|null>}
   */
  async function getCachedStoreInfo() {
    if (global.FateenDB) {
      const meta = await global.FateenDB.getMeta(META_STORE_INFO);
      if (meta) return meta;
    }
    try {
      const raw = localStorage.getItem('fateen_store_info');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  // ─── Security check (used by every protected page) ────────────────────────

  /**
   * Ensure a valid session exists; redirect to index.html if not.
   * Also runs the periodic licence check and blocks the app if licence expired.
   * Call this at the top of every protected page's <script>.
   *
   * @param {object} [options]
   * @param {string[]} [options.allowedRoles]  If provided, also checks role.
   * @param {string}   [options.loginUrl]       Defaults to 'index.html'.
   */
  async function securityCheck(options) {
    const opts = Object.assign({ allowedRoles: null, loginUrl: 'index.html' }, options);

    // Ensure DB is open
    if (global.FateenDB) {
      try { await global.FateenDB.openDB(); } catch (_) { /* non-fatal */ }
    }

    const session = await loadSession();

    if (!session) {
      location.href = opts.loginUrl;
      return;
    }

    // Role check
    if (opts.allowedRoles && opts.allowedRoles.length > 0) {
      if (!opts.allowedRoles.includes(session.userRole)) {
        location.href = opts.loginUrl;
        return;
      }
    }

    // Periodic licence check
    const licence = await checkLicence(session.store_key);
    if (!licence.allowed) {
      _showLicenceBlock(licence.reason);
      return;
    }
  }

  /**
   * Display a full-page licence block overlay.
   * @param {string} reason
   */
  function _showLicenceBlock(reason) {
    const reasonMessages = {
      subscription_expired: 'انتهى اشتراك المتجر. تواصل مع الدعم للتجديد.',
      no_prior_check:       'لم يتم التحقق من الاشتراك قط. يرجى الاتصال بالإنترنت للبدء.',
      grace_period_exceeded:'انتهت فترة السماح الخاصة بالعمل دون اتصال. يرجى الاتصال بالإنترنت.',
    };
    const msg = reasonMessages[reason] || 'الاشتراك غير صالح. تواصل مع الدعم.';

    const overlay = document.createElement('div');
    overlay.id = 'licence-block';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'background:#050505', 'display:flex', 'flex-direction:column',
      'align-items:center', 'justify-content:center',
      'font-family:Cairo,sans-serif', 'color:#fff', 'text-align:center',
      'padding:32px',
    ].join(';');
    overlay.innerHTML = `
      <div style="font-size:52px;margin-bottom:16px;">🔒</div>
      <div style="font-size:22px;font-weight:800;color:#ff4d4d;margin-bottom:12px;">الوصول محظور</div>
      <div style="font-size:15px;color:#aaa;max-width:360px;line-height:1.7;">${msg}</div>
      <div style="margin-top:28px;font-size:12px;color:#555;">Fateen POS — Licence Error: ${reason}</div>
    `;
    document.body.appendChild(overlay);
  }

  // ─── Logout helper ────────────────────────────────────────────────────────

  /**
   * Clear session and redirect to login page.
   * @param {string} [loginUrl]
   */
  async function logout(loginUrl) {
    await clearSession();
    location.href = loginUrl || 'index.html';
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  const FateenAuth = {
    saveSession,
    loadSession,
    clearSession,
    checkLicence,
    checkLicenceOnline,
    cacheStoreInfo,
    getCachedStoreInfo,
    securityCheck,
    logout,
  };

  global.FateenAuth = FateenAuth;

}(typeof window !== 'undefined' ? window : global));
