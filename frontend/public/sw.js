// ponytail: hand-written SW. Swap for Serwist/Workbox if precaching or background sync is ever needed.
const CACHE = "igf-v2"; // bumping the name deletes v1, which may hold the old public lead list
// Only public, non-personal API data is ever cached. Anything else under /api/ goes straight to the network.
const API = ["/api/stats", "/api/plans", "/api/fleet"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["/", "/dashboard"])));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(Promise.all([
    self.registration.navigationPreload?.enable(), // page requests start while the worker is still booting
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))),
  ]));
  self.clients.claim();
});

// Never store a response marked no-store or fetched with credentials. Pages are exempt: they are no-store
// because they are rendered per request, and keeping the last copy is what makes the app open offline.
const storable = (req, res) =>
  res.ok && !req.headers.has("authorization") && (req.mode === "navigate" || !/no-store/.test(res.headers.get("cache-control") || ""));

const put = (req, res) => {
  if (storable(req, res)) {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copy));
  }
  return res;
};

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") && !API.includes(url.pathname)) return;
  // Hashed build assets and icons never change: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => put(req, res))));
    return;
  }
  // Pages and API data: network first, last good copy when offline (fleet data stays readable in a parking lot).
  const network = req.mode === "navigate" ? Promise.resolve(e.preloadResponse).then((p) => p || fetch(req)) : fetch(req);
  e.respondWith(
    network
      .then((res) => put(req, res))
      .catch(() => caches.match(req).then((hit) => hit || (req.mode === "navigate" ? caches.match("/") : Response.error()))),
  );
});
