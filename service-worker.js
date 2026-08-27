/**
 * Service Worker do app.
 * Faz cache dos arquivos estáticos (para abrir mesmo sem internet e ser
 * instalável). As chamadas à API (Apps Script) são sempre cross-origin e
 * NUNCA passam por este cache — são sempre buscadas ao vivo, pois os dados
 * da fábrica mudam a cada avaliação.
 */
const CACHE_NOME = 'app-treinamentos-v1';
const ARQUIVOS_ESTATICOS = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'api-config.js',
  'manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NOME).then(cache => cache.addAll(ARQUIVOS_ESTATICOS)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(nomes => Promise.all(nomes.filter(n => n !== CACHE_NOME).map(n => caches.delete(n))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Nunca intercepta chamadas de API fora do domínio do site (Apps Script) — sempre rede, nunca cache.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then(resp => {
        const copia = resp.clone();
        caches.open(CACHE_NOME).then(cache => cache.put(event.request, copia));
        return resp;
      })
      .catch(() => caches.match(event.request))
  );
});
