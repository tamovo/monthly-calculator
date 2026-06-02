const CACHE = 'monthly-calc-v1';

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.add('/')));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);

    // Network-first for API — fall back to offline stub
    if (url.pathname.startsWith('/api/')) {
        e.respondWith(
            fetch(e.request).catch(() =>
                new Response(JSON.stringify({ ok: false, error: 'offline' }), {
                    headers: { 'Content-Type': 'application/json' },
                })
            )
        );
        return;
    }

    // Cache-first for everything else; update cache on success
    e.respondWith(
        caches.match(e.request).then(cached => {
            const network = fetch(e.request).then(res => {
                if (res.ok) caches.open(CACHE).then(c => c.put(e.request, res.clone()));
                return res;
            });
            return cached || network;
        })
    );
});
