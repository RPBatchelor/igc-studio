/**
 * IGC Studio — tile cache service worker
 *
 * Strategy: cache-first for known tile CDNs.
 * On first fetch: hit network, store response in Cache API.
 * On subsequent fetches (same session or future sessions): return cached copy instantly.
 *
 * Cesium Ion terrain/imagery is intentionally excluded — its auth tokens expire.
 */

const CACHE_NAME = 'igc-tiles-v1';

/** Hostnames whose tile responses should be cached */
const TILE_HOSTS = [
  'server.arcgisonline.com',
  'tile.opentopomap.org',
  'tile.openstreetmap.org',
  'basemaps.cartocdn.com',
  // Bing Maps virtualearth CDN (shards t0–t3)
  'ecn.t0.tiles.virtualearth.net',
  'ecn.t1.tiles.virtualearth.net',
  'ecn.t2.tiles.virtualearth.net',
  'ecn.t3.tiles.virtualearth.net',
];

/** Hostnames whose responses must NEVER be cached (auth tokens expire) */
const SKIP_HOSTS = [
  'assets.cesium.com',
  'ion.cesium.com',
  'ionta.cesium.com',
];

// Take control immediately — don't wait for old SW to become inactive
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// --- Passive cache: intercept tile fetches ---
self.addEventListener('fetch', (event) => {
  let url;
  try {
    url = new URL(event.request.url);
  } catch {
    return; // non-URL (unlikely) — ignore
  }

  if (SKIP_HOSTS.some((h) => url.hostname.includes(h))) return;
  if (!TILE_HOSTS.some((h) => url.hostname.includes(h))) return;

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;

      const response = await fetch(event.request);
      if (response.ok) {
        // Store asynchronously — don't block the tile from rendering
        cache.put(event.request, response.clone());
      }
      return response;
    })
  );
});

// --- Proactive prefetch: batch URLs sent from the main thread ---
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'PREFETCH_TILES') return;

  const urls = event.data.urls;
  if (!Array.isArray(urls) || urls.length === 0) return;

  // Run in the background — no response needed
  caches.open(CACHE_NAME).then(async (cache) => {
    for (const url of urls) {
      // Skip if already cached
      const cached = await cache.match(url);
      if (cached) continue;

      try {
        const res = await fetch(url);
        if (res.ok) await cache.put(url, res);
      } catch {
        // Network error — skip silently, will retry next session
      }

      // 15 ms throttle ≈ 66 requests/second max — avoids CDN rate-limiting
      await new Promise((r) => setTimeout(r, 15));
    }
  });
});
