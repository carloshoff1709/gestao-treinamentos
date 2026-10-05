/* Service Worker — Visia Produção PWA
   Estratégia: network-first para tudo. Nunca faz cache das chamadas ao
   Apps Script (dados sempre atuais). Só serve para tornar o app instalável
   e dar um fallback básico offline das telas já visitadas. */

const CACHE = 'visia-v3';
const ESSENCIAIS = [
  'index.html',
  'conferencia.html',
  'cadastro.html',
  'leitor.html',
  'abastecimento.html',
  'gantt.html',
  'setores.html',
  'manifest.json'
];

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ESSENCIAIS).catch(() => {}))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // NUNCA intercepta chamadas ao Apps Script, Google, ou proxies (dados ao vivo)
  if (url.includes('script.google.com') ||
      url.includes('googleusercontent') ||
      url.includes('corsproxy') ||
      url.includes('allorigins') ||
      url.includes('cdn.jsdelivr') ||
      url.includes('cdnjs.cloudflare')) {
    return; // deixa passar direto para a rede
  }

  // Para os arquivos do app: network-first, com fallback ao cache
  e.respondWith(
    fetch(e.request)
      .then((resp) => {
        // atualiza o cache com a versão nova
        const copia = resp.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia).catch(() => {}));
        return resp;
      })
      .catch(() => caches.match(e.request))
  );
});
