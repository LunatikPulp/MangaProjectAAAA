// Bump version on every deploy to clear stale caches
const CACHE_NAME = 'springmanga-v6';
const STATIC_CACHE = 'springmanga-static-v6';
const API_CACHE = 'springmanga-api-v6';

const API_CACHE_PATTERNS = [
  /\/api\/manga\/home-sections/,
  /\/api\/manga\/list/,
  /\/api\/manga\/[^/]+\/detail/,
  /\/api\/manga\/[^/]+\/chapters/,
  /\/api\/catalog\/chapter-pages/,
];

const STALE_WHILE_REVALIDATE = [
  /\/api\/manga\/home-sections/,
  /\/api\/manga\/list/,
];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // index.html — NEVER cache, always fetch fresh from network.
  // This ensures new deploys take effect immediately.
  if (url.pathname === '/' || url.pathname === '/index.html') {
    event.respondWith(networkOnly(event.request));
    return;
  }

  // API endpoints
  if (url.pathname.startsWith('/api/') && API_CACHE_PATTERNS.some((p) => p.test(url.pathname))) {
    if (STALE_WHILE_REVALIDATE.some((p) => p.test(url.pathname))) {
      event.respondWith(staleWhileRevalidate(event.request));
      return;
    }
    event.respondWith(networkFirst(event.request));
    return;
  }

  // Static assets: stale-while-revalidate (serve cached immediately, update in background)
  if (url.pathname.match(/\.(js|css|woff2?|ttf|webp|avif|png|jpg|jpeg|svg|json|ico|wasm)$/)) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }
});

// Always fetch from network, never cache (for index.html)
async function networkOnly(request) {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch (e) {
    // If offline, try to return cached index.html as last resort
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);
  const fresh = fetch(request).then(async (response) => {
    if (response.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => cached);

  return cached || fresh;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}
