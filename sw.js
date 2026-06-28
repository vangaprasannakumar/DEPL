// ─── DEPL HRMS — SERVICE WORKER ───────────────────────────────────────────────
// Handles caching, offline fallback, and background sync of attendance punches.
// Dada Energies Pvt. Ltd. | Muppireddypally, Telangana

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
// Google Apps Script Web App URL — the single backend endpoint for all API calls.
const GOOGLE_API_URL = "https://script.google.com/macros/s/AKfycbzsV8eP3nMkVUva7WwHkDKi820Mv0BEm0kTxxM__EamMerhKdhxQJKtVRA0mSI0_EjK/exec";

// ─── CACHE VERSIONING ─────────────────────────────────────────────────────────
// Cache name is auto-detected from <meta name="app-version" content="YYYYMMDD">
// in index.html at SW install time. Update that meta tag on every deploy.
// If the tag is absent or the fetch fails, CACHE_DATE_FALLBACK is used instead.
const CACHE_VERSION       = 'depl-hrms-v1';
const CACHE_DATE_FALLBACK = '20260628';   // ← bump this if NOT using the meta tag

// ─── INDEXED DB CONFIGURATION ────────────────────────────────────────────────
const DB_NAME    = 'DEPLOfflineDB';
const STORE_NAME = 'pending_punches';

// ─── FACE-API VERSION ─────────────────────────────────────────────────────────
// Pin weight URLs to the same tagged release used by the CDN script
// in index.html (face-api.js@0.22.2). Pinning prevents silent recognition
// failure if the upstream repo ever changes its @master weights.
const FACE_API_VERSION = '0.22.2';
const FACE_API_WEIGHTS = `https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@${FACE_API_VERSION}/weights`;

// ─── APP SHELL ASSETS ─────────────────────────────────────────────────────────
const SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// ─── AI MODEL ASSETS (pinned to @0.22.2) ─────────────────────────────────────
const AI_ASSETS = [
  `https://cdn.jsdelivr.net/npm/face-api.js@${FACE_API_VERSION}/dist/face-api.min.js`,
  `${FACE_API_WEIGHTS}/tiny_face_detector_model-weights_manifest.json`,
  `${FACE_API_WEIGHTS}/tiny_face_detector_model-shard1`,
  `${FACE_API_WEIGHTS}/face_landmark_68_model-weights_manifest.json`,
  `${FACE_API_WEIGHTS}/face_landmark_68_model-shard1`,
  `${FACE_API_WEIGHTS}/face_recognition_model-weights_manifest.json`,
  `${FACE_API_WEIGHTS}/face_recognition_model-shard1`,
  `${FACE_API_WEIGHTS}/face_recognition_model-shard2`
];

// ─── INDEXED DB HELPERS ───────────────────────────────────────────────────────
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // autoIncrement gives each punch a unique numeric `id` key
        // used for selective deletion in processBackgroundSync().
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror  = () => reject(request.error);
  });
}

// Returns all pending punches including their IDB `id` key.
async function getPendingPunches() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx      = db.transaction(STORE_NAME, 'readonly');
    const store   = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror   = () => reject(request.error);
  });
}

// Delete only a single punch record by its IDB key.
// Used for selective cleanup — avoids wiping the entire store when some
// punches are skipped or fail authentication.
async function deletePunchById(idbId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(idbId);
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}

// Bulk-clear used when ALL punches in a batch synced (fastest path).
async function clearAllPendingPunches() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = resolve;
    tx.onerror    = reject;
  });
}

// ─── AUTO CACHE-VERSION DETECTION ────────────────────────────────────────────
// Reads <meta name="app-version"> from index.html at SW install time.
// Update that meta tag on every deploy — no need to touch sw.js.
// Falls back to CACHE_DATE_FALLBACK when offline or the tag is absent.
async function readAppVersionFromHTML() {
  try {
    const response = await fetch('./index.html', {
      cache: 'no-store',   // bypass browser cache — we need the real file
      headers: { 'Accept': 'text/html' }
    });
    if (!response.ok) return null;

    const text = await response.text();
    // Match: <meta name="app-version" content="20260513">
    const match = text.match(/<meta[^>]+name=["']app-version["'][^>]+content=["']([^"']+)["']/i)
                || text.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']app-version["']/i);

    if (match && match[1] && /^\d{8}$/.test(match[1].trim())) {
      return match[1].trim();
    }
  } catch (err) {
    console.warn('[SW] Could not read app-version from index.html:', err.message);
  }
  return null;   // signal to caller to use the fallback
}

// ─── LIFECYCLE: INSTALL ───────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      // Resolve cache name from meta tag (or fallback) before opening the cache.
      const detectedDate = await readAppVersionFromHTML();
      const cacheDate    = detectedDate || CACHE_DATE_FALLBACK;
      const cacheName    = `${CACHE_VERSION}-${cacheDate}`;

      if (detectedDate) {
        console.log(`[SW] Auto-detected app-version: ${detectedDate} → cache: ${cacheName}`);
      } else {
        console.warn(`[SW] app-version meta tag not found — using fallback: ${CACHE_DATE_FALLBACK}`);
        console.warn('[SW] Add <meta name="app-version" content="YYYYMMDD"> to index.html <head> to enable auto-versioning.');
      }

      // Store resolved cache name in IDB so activate() can read the same value
      await storeResolvedCacheName(cacheName);

      const cache = await caches.open(cacheName);

      // 1. Shell assets — failure aborts install entirely (user gets no app)
      await cache.addAll(SHELL_ASSETS);

      // 2. AI model weights — best-effort; if CDN is unreachable they load
      //    on first use from the main thread (loadAIModels() in index.html).
      await Promise.allSettled(
        AI_ASSETS.map(url =>
          fetch(url, { mode: 'cors' })
            .then(response => {
              if (response && response.status === 200 &&
                  (response.type === 'basic' || response.type === 'cors')) {
                return cache.put(url, response);
              }
            })
            .catch(err => console.warn(`[SW] AI asset deferred (will load on first use): ${url}`, err.message))
        )
      );

      console.log(`[SW] ✅ Install complete → ${cacheName}`);

      // skipWaiting: new SW activates immediately without waiting
      // for the old tab to close. Paired with clients.claim() in activate.
      self.skipWaiting();
    })()
  );
});

// ─── CACHE NAME PERSISTENCE ───────────────────────────────────────────────────
// The install and activate events run in different call stacks.
// We persist the resolved cache name in a tiny IDB record so activate()
// can read exactly the same name without re-fetching index.html.
const META_DB_NAME  = 'DEPLSWMeta';
const META_STORE    = 'sw_meta';
const META_KEY      = 'resolved_cache_name';

function openMetaDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(META_DB_NAME, 1);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function storeResolvedCacheName(name) {
  try {
    const db = await openMetaDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readwrite');
      tx.objectStore(META_STORE).put(name, META_KEY);
      tx.oncomplete = resolve;
      tx.onerror    = reject;
    });
  } catch(e) {
    console.warn('[SW] Could not persist cache name to IDB:', e);
  }
}

async function getResolvedCacheName() {
  try {
    const db = await openMetaDB();
    return await new Promise((resolve, reject) => {
      const tx  = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get(META_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror   = () => reject(req.error);
    });
  } catch(e) {
    return null;
  }
}

// ─── LIFECYCLE: ACTIVATE ──────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Read the cache name that was resolved during install
      const resolvedName = await getResolvedCacheName();
      const currentCache = resolvedName || `${CACHE_VERSION}-${CACHE_DATE_FALLBACK}`;

      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map(name => {
          // Delete old capco-hrms caches (rebranding cleanup) and any
          // stale depl-hrms caches — keep only the current cache name.
          const isOurs = name.startsWith('depl-hrms') || name.startsWith('capco-hrms');
          if (isOurs && name !== currentCache) {
            console.log(`[SW] 🗑️ Deleting old cache: ${name}`);
            return caches.delete(name);
          }
        })
      );

      // Immediately take control of all open clients so the fresh SW
      // starts handling fetches without a manual page reload.
      await self.clients.claim();
      console.log(`[SW] ✅ Active → controlling all clients with cache: ${currentCache}`);
    })()
  );
});

// ─── NETWORK ROUTING: FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // 1. All POST requests → always pass directly to network.
  //    Never attempt to cache POST bodies (GAS API, form submissions etc.)
  if (event.request.method === 'POST') {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(
          JSON.stringify({ status: 'error', message: 'Network unavailable. Your punch has been saved offline.' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        )
      )
    );
    return;
  }

  // 2. AI model weights + CDN fonts → Cache-First, Network-Fallback
  //    These are large binary assets that change only when we bump the
  //    version pin. Serving from cache first keeps the kiosk snappy.
  const isDynamicAsset =
    requestUrl.pathname.includes('weights') ||
    requestUrl.hostname.includes('jsdelivr') ||
    requestUrl.hostname.includes('fonts.googleapis.com') ||
    requestUrl.hostname.includes('fonts.gstatic.com');

  if (isDynamicAsset) {
    event.respondWith(
      caches.match(event.request).then(cachedResponse => {
        if (cachedResponse) return cachedResponse;
        return fetch(event.request, { mode: 'cors' })
          .then(networkResponse => {
            if (!networkResponse || networkResponse.status !== 200 ||
                (networkResponse.type !== 'basic' && networkResponse.type !== 'cors')) {
              return networkResponse;
            }
            const responseToCache = networkResponse.clone();
            // Cache the newly fetched asset for next time
            getResolvedCacheName().then(cn => {
              const cacheName = cn || `${CACHE_VERSION}-${CACHE_DATE_FALLBACK}`;
              caches.open(cacheName).then(cache => cache.put(event.request, responseToCache));
            });
            return networkResponse;
          })
          .catch(() => new Response(
            JSON.stringify({ error: 'Offline — AI asset not cached yet. Connect to the internet once to pre-cache models.' }),
            { status: 503, headers: { 'Content-Type': 'application/json' } }
          ));
      })
    );
    return;
  }

  // 3. App shell (HTML, manifest, sw.js itself) → Stale-While-Revalidate
  //    Serve the cached version instantly (fast), then silently fetch fresh
  //    content in the background and update the cache. On the NEXT load the
  //    user gets the updated version with zero wait time.
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200 &&
              networkResponse.type !== 'opaque') {
            const responseToCache = networkResponse.clone();
            getResolvedCacheName().then(cn => {
              const cacheName = cn || `${CACHE_VERSION}-${CACHE_DATE_FALLBACK}`;
              caches.open(cacheName).then(cache => cache.put(event.request, responseToCache));
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Network failed and nothing in cache → show the branded offline page
          if (event.request.destination === 'document' && !cachedResponse) {
            return generateOfflineHTML();
          }
          // For non-document assets (images, scripts) → return undefined;
          // the browser will handle gracefully
        });

      // Return cached immediately, update silently in background
      return cachedResponse || fetchPromise;
    })
  );
});

// ─── BACKGROUND SYNC ─────────────────────────────────────────────────────────
// The OS fires this event when internet is restored — even if the browser
// tab is closed. iOS Safari does NOT support Background Sync; that case is
// handled by the `online` event listener + flushPendingPunchesManually()
// in index.html.
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-punches') {
    console.log('[SW] 📡 Background sync triggered by OS.');
    event.waitUntil(processBackgroundSync());
  }
});

async function processBackgroundSync() {
  if (!GOOGLE_API_URL || GOOGLE_API_URL.includes('YOUR_GOOGLE')) {
    console.error('[SW] Cannot sync: GOOGLE_API_URL is not configured.');
    return;
  }

  try {
    const punches = await getPendingPunches();
    if (!punches || punches.length === 0) {
      console.log('[SW] No pending punches to sync.');
      return;
    }

    console.log(`[SW] Syncing ${punches.length} pending punch(es)...`);

    // Group punches by session token.
    // Rationale: if an employee punched offline in the morning with token A,
    // and an admin punched offline in the afternoon with token B, sending all
    // punches under one token would fail auth for one of the groups.
    // Grouping ensures each batch is authenticated correctly.
    const groups = new Map();
    punches.forEach(p => {
      const key = p._token || '__no_token__';
      if (!groups.has(key)) groups.set(key, { token: p._token, user: p._u, punches: [] });
      groups.get(key).punches.push(p);
    });

    const successfulIdbIds = [];

    for (const [, group] of groups) {
      // Strip IDB metadata before sending to the server
      const payloadPunches = group.punches.map(p => {
        const clean = { ...p };
        delete clean.id;       // IDB auto-increment key — not needed by server
        delete clean._token;   // session token sent as top-level field
        delete clean._u;       // username sent as top-level field
        return clean;
      });

      const payload = {
        action:  'syncOfflineData',
        pending: payloadPunches,
        _token:  group.token || '',
        _u:      group.user  || ''
      };

      let result;
      try {
        // 25-second timeout on each sync POST — prevents stalled GAS responses
        // from holding the sync event open until the browser watchdog kills it.
        const controller  = new AbortController();
        const syncTimeout = setTimeout(() => controller.abort(), 25000);

        const response = await fetch(GOOGLE_API_URL, {
          method:  'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body:    JSON.stringify(payload),
          signal:  controller.signal
        });
        clearTimeout(syncTimeout);
        result = await response.json();
      } catch (networkErr) {
        if (networkErr.name === 'AbortError') {
          console.warn('[SW] Sync POST timed out after 25 seconds — will retry on next Background Sync event.');
        } else {
          console.warn('[SW] Network error during sync — browser will retry:', networkErr.message);
        }
        // Re-throw so the browser schedules another retry
        throw networkErr;
      }

      if (result && result.status === 'success') {
        console.log(`[SW] ✅ Group synced — ${result.synced} sent, ${result.skipped} skipped.`);

        // Selective IDB deletion:
        //   skipped === 0 → all synced cleanly.
        //   skipped > 0   → some rejected (duplicate, auth error). We still
        //     remove them to prevent an infinite retry loop; a warning is logged.
        if (result.skipped > 0) {
          console.warn(
            `[SW] ⚠️ ${result.skipped} punch(es) skipped by server ` +
            `(likely duplicates or auth mismatch). Removing from IDB to prevent infinite retry.`
          );
        }
        for (const p of group.punches) {
          successfulIdbIds.push(p.id);
        }

      } else {
        // Server returned an explicit error (e.g. session expired, script quota).
        // Do NOT delete IDB records — keep them for the next retry attempt.
        const errMsg = result ? result.message : 'No response body';
        console.warn('[SW] ❌ Server rejected sync payload:', errMsg);
        throw new Error(errMsg);
      }
    }

    // Delete all IDB records that were processed (synced or skipped)
    for (const idbId of successfulIdbIds) {
      try { await deletePunchById(idbId); } catch(e) {
        console.warn(`[SW] Could not delete IDB record ${idbId}:`, e);
      }
    }

    console.log(`[SW] 🗑️ IDB cleared — ${successfulIdbIds.length} record(s) removed.`);

    // Notify all open app windows so the UI badge and status refresh
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach(client =>
      client.postMessage({
        type:    'SYNC_COMPLETE',
        synced:  successfulIdbIds.length,
        message: `${successfulIdbIds.length} offline punch(es) synced successfully.`
      })
    );

  } catch (error) {
    console.error('[SW] ❌ Background sync failed — browser will schedule retry.', error.message || error);
    // Re-throwing signals to the browser that the sync failed
    // so it will try again when connectivity improves.
    throw error;
  }
}

// ─── MESSAGE HANDLER ──────────────────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // Called from index.html when a new SW is waiting — triggers instant update
    // without requiring the user to close all tabs.
    self.skipWaiting();
  }
});

// ─── OFFLINE FALLBACK PAGE ────────────────────────────────────────────────────
// Shown when a navigation request fails with no cached version available.
// Displays the pending offline punch count so kiosk operators know their
// data is safely stored and will auto-sync on reconnect.
function generateOfflineHTML() {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>DEPL HRMS — Offline</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, 'Outfit', sans-serif;
      background: #03070f; color: #f0f4ff;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      min-height: 100vh; text-align: center; padding: 24px;
    }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h2 { font-size: 22px; color: #ef4444; margin-bottom: 10px; }
    p  { color: #6b80a4; font-size: 15px; line-height: 1.6; max-width: 340px; margin-bottom: 6px; }
    .pending-box {
      margin-top: 24px; padding: 16px 24px;
      background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3);
      border-radius: 14px; max-width: 340px; width: 100%;
    }
    .pending-box p  { color: #fcd34d; margin: 0; font-weight: 600; }
    .pending-count  { font-size: 36px; font-weight: 800; color: #fcd34d; display: block; margin-bottom: 4px; }
    .btn {
      margin-top: 28px; padding: 14px 32px;
      background: #3b82f6; color: white;
      border: none; border-radius: 14px;
      font-size: 15px; font-weight: 600;
      cursor: pointer; font-family: inherit;
      transition: opacity .2s;
    }
    .btn:hover { opacity: 0.85; }
    .safe-msg { margin-top: 14px; font-size: 12px; color: #4a5568; max-width: 300px; }
  </style>
</head>
<body>
  <div class="icon">🔴</div>
  <h2>You are Offline</h2>
  <p>The app could not be reached.<br>Check your connection and tap Retry.</p>

  <div class="pending-box" id="pending-box" style="display:none;">
    <span class="pending-count" id="pending-count">0</span>
    <p>punch(es) safely stored on this device.<br>They will sync automatically when you reconnect.</p>
  </div>

  <button class="btn" onclick="location.reload()">↺ Retry</button>
  <p class="safe-msg">Your offline punches are stored locally and will not be lost.</p>

  <script>
    // Show how many offline punches are waiting so kiosk operators feel confident
    (function checkPending() {
      try {
        const req = indexedDB.open('DEPLOfflineDB', 1);
        req.onsuccess = function() {
          const db = req.result;
          if (!db.objectStoreNames.contains('pending_punches')) return;
          const tx    = db.transaction('pending_punches', 'readonly');
          const store = tx.objectStore('pending_punches');
          const count = store.count();
          count.onsuccess = function() {
            if (count.result > 0) {
              document.getElementById('pending-box').style.display = 'block';
              document.getElementById('pending-count').textContent = count.result;
            }
          };
        };
      } catch(e) {}
    })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status:  200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}
