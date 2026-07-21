/* ============================================================
   service-worker.js — Aluguel PWA
   Estratégia:
   - app shell (HTML/CSS/JS/ícones) fica em cache;
   - navegação: rede primeiro, cai para o cache se estiver offline;
   - demais arquivos do app: responde do cache e atualiza em segundo plano;
   - Supabase/fontes/CDN e operações de dados exigem internet.
   O build.mjs troca automaticamente a versão do cache em cada publicação.
   ============================================================ */
const CACHE = 'aluguel-v4';
const ASSETS = [
  './', './index.html', './style.css', './motion.css',
  './config.js', './utils.js', './supabase.js', './auth.js', './dashboard.js',
  './houses.js', './tenants.js', './interests.js', './contracts.js', './finance.js', './photos.js', './documents.js',
  './energy.js', './portal.js', './reports.js',
  './calendar.js', './backup.js', './app.js', './motion.js',
  './manifest.json', './icon-192.png', './icon-512.png',
  './icon-maskable-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE)
      .then(function(c){ return c.addAll(ASSETS); })
      .then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys()
      .then(function(keys){ return Promise.all(keys.filter(function(k){ return k!==CACHE; }).map(function(k){ return caches.delete(k); })); })
      .then(function(){ return self.clients.claim(); })
  );
});

function cachePut(req, res){
  caches.open(CACHE).then(function(c){ c.put(req, res); });
}

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;                  // não intercepta POST/auth do Supabase
  var url = new URL(req.url);
  if(url.origin !== self.location.origin) return;   // cross-origin (Supabase, fontes, CDN) passa direto

  // Navegação -> rede primeiro (pega atualizações), cai para o cache offline
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(r){ cachePut(req, r.clone()); return r; })
        .catch(function(){ return caches.match(req).then(function(m){ return m || caches.match('./index.html'); }); })
    );
    return;
  }

  // Demais arquivos -> cache imediato + atualização em segundo plano
  e.respondWith(
    caches.match(req).then(function(cached){
      var net = fetch(req).then(function(r){ cachePut(req, r.clone()); return r; }).catch(function(){ return cached; });
      return cached || net;
    })
  );
});
