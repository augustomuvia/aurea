// Service worker AUREA: abre a página /offline quando não há rede.
// Os áudios descarregados ficam no cache "aurea-offline-audio" (gerido pela página, não aqui).
// Não guarda páginas da conta nem respostas da API.
const SHELL = "aurea-shell-v1";
const OFFLINE_URL = "/offline";
const STATIC = [
  "/covers/aurea.jpg",
  "/covers/binaural.jpg",
  "/covers/chuva.jpg",
  "/covers/foco.jpg",
  "/covers/mar.jpg",
  "/covers/tons.jpg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icon.svg",
];

// Guarda /offline e os ficheiros de que precisa (lidos do próprio HTML). Só troca o cache
// quando tudo foi descarregado, para nunca ficar com uma versão a meio.
async function refreshShell() {
  const page = await fetch(OFFLINE_URL, { cache: "no-store", credentials: "omit" });
  if (!page.ok) return;
  const html = await page.clone().text();
  const assets = new Set(STATIC);
  for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) assets.add(m[1]);
  const entries = [[OFFLINE_URL, page]];
  for (const url of assets) {
    const res = await fetch(url, { credentials: "omit" });
    if (res.ok) entries.push([url, res]);
  }
  await caches.delete(SHELL);
  const cache = await caches.open(SHELL);
  await Promise.all(entries.map(([url, res]) => cache.put(url, res)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(refreshShell().catch(() => undefined).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("aurea-shell-") && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// A app pede uma atualização quando abre com rede (nova versão do site).
self.addEventListener("message", (event) => {
  if (event.data === "refresh-shell") event.waitUntil(refreshShell().catch(() => undefined));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Navegação: sempre pela rede; sem rede, a página offline.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(async () => (await caches.match(OFFLINE_URL, { cacheName: SHELL })) || Response.error()));
    return;
  }

  // Ficheiros estáticos com nome versionado e capas: do cache se existirem, senão da rede.
  if (url.pathname.startsWith("/_next/static/") || STATIC.includes(url.pathname)) {
    event.respondWith(caches.match(req, { cacheName: SHELL }).then((hit) => hit || fetch(req)));
  }
});
