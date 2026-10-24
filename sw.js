const CACHE = 'budget-v3';
const ASSETS = [
  './', './index.html', './styles.css', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './src/app.js', './src/actions.js', './src/store.js',
  './src/core/errors.js', './src/core/decode.js', './src/core/parse-sg-csv.js', './src/core/parse-ofx.js',
  './src/core/normalize.js', './src/core/categories.js', './src/core/categorize.js', './src/core/dedupe.js',
  './src/core/mapping.js', './src/core/import.js', './src/core/stats.js', './src/core/backup.js', './src/core/demo.js',
  './src/ui/format.js', './src/ui/charts.js', './src/ui/sheet.js', './src/ui/month.js', './src/ui/category-sheet.js',
  './src/ui/trends.js', './src/ui/import.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((hit) => hit || fetch(request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy));
      }
      return response;
    }).catch(() => (request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))),
  );
});
