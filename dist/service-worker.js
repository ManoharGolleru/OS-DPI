/* ------------------------------------------------------------------
   OS-DPI – minimal, bullet-proof PWA worker
   • No wild-cards
   • Network-first, cache-fallback strategy
------------------------------------------------------------------- */

const CACHE = "osdpi-v1";

/* exact files we really need offline */
const PRECACHE = [
  "/",                       // index.html
  "/index.html",
  "/client.html",
  "/service-worker.js",
  "/css/site.css",
  // add more built files here IF you need them offline
];

/* ---------- install ----------------------------------------------------- */
self.addEventListener("install", (evt) => {
  evt.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .catch((err) => console.warn("SW precache failed:", err))
      .then(() => self.skipWaiting())
  );
});

/* ---------- activate ---------------------------------------------------- */
self.addEventListener("activate", (evt) => {
  evt.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : undefined)))
    )
  );
  self.clients.claim();
});

/* ---------- fetch ------------------------------------------------------- */
self.addEventListener("fetch", (evt) => {
  const { request } = evt;

  /* only cache same-origin GET over http/https */
  if (
    request.method !== "GET" ||
    !request.url.startsWith(self.location.origin)
  ) {
    return;                          // just let it pass through
  }

  evt.respondWith(
    fetch(request)
      .then((netResp) => {
        const clone = netResp.clone();
        caches.open(CACHE).then((c) => c.put(request, clone));
        return netResp;
      })
      .catch(() => caches.match(request))
  );
});


/* ---------- messages ---------------------------------------------------- */
self.addEventListener("message", (evt) => {
  if (evt.data === "SKIP_WAITING") self.skipWaiting();
});
//# sourceMappingURL=service-worker.js.map
