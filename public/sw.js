// Service worker: guarda o app no aparelho para funcionar sem internet (por exemplo, na igreja).
// Estratégia: entrega a cópia salva na hora e, se houver internet, atualiza em segundo plano
// (a versão nova aparece na próxima vez que o app for aberto).

const APP_CACHE = 'bbhub-app-v2';
const FONT_CACHE = 'bbhub-fonts';
const ASSETS = [
  './',
  'index.html',
  'app.css',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'js/main.js',
  'js/ui.js',
  'js/store.js',
  'js/midi.js',
  'js/packs.js',
  'js/drums/engine.js',
  'js/drums/voices.js',
  'js/drums/patterns.js',
  'js/views/common.js',
  'js/views/stage.js',
  'js/views/presets.js',
  'js/views/drums.js',
  'js/views/songs.js',
  'js/views/controls.js',
  'js/views/settings.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(APP_CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('bbhub-app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event, APP_CACHE));
  } else if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(cacheFirst(req, FONT_CACHE));
  }
});

async function staleWhileRevalidate(event, cacheName) {
  const req = event.request;
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req, { ignoreSearch: true });
  const network = fetch(req)
    .then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => null);
  event.waitUntil(network);
  if (cached) return cached;
  const fresh = await network;
  return fresh || new Response('Sem internet e sem cópia salva deste arquivo.', {
    status: 503,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
    return res;
  } catch {
    return new Response('', { status: 504 });
  }
}
