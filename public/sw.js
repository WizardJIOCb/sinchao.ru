// Only a public offline screen is stored. Live pages and API data stay on the network.
const CACHE = "sinchao-offline-v1";
const OFFLINE_ASSETS = [
  "/offline.html",
  "/offline.css",
  "/offline.js",
  "/icons/icon-192.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(OFFLINE_ASSETS)),
  );
  // Let open tabs finish their work before a future worker replaces this one.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter((key) => key.startsWith("sinchao-offline-") && key !== CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname === "/api" ||
    url.pathname.startsWith("/api/")
  ) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE);
        return (await cache.match("/offline.html")) ?? Response.error();
      }),
    );
  } else if (OFFLINE_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) =>
        (await cache.match(url.pathname)) ?? fetch(request),
      ),
    );
  }
});
