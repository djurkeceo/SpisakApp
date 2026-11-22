const CACHE = "spisak-shell-v1";
const isShellAsset = path => path.startsWith("/_next/static/") || path.startsWith("/icon-");

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    const response = await fetch("/", { cache: "reload" });
    if (response.ok) {
      const html = await response.clone().text();
      const assets = [...new Set(html.match(/\/_next\/static\/[^"'\s<>\\]+\.(?:js|css)(?=["'\s<>])/g) || [])];
      await cache.addAll(assets);
      await cache.put("/", response);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith("spisak-shell-") && key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === "/") {
    event.respondWith(fetch(request).catch(async () => (await caches.match("/")) || Response.error()));
  } else if (isShellAsset(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const saved = await cache.match(request);
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  }
});
