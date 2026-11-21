// The app lived on this origin (tandra.uk) before it moved to app.tandra.uk, and its service
// worker (/sw.js) still runs in browsers that used or installed it here, serving the cached app.
// Browsers fetch /sw.js to check for updates, so this replacement installs over it, drops its
// caches, unregisters itself and reloads open tabs. The reload reaches the landing site, which
// forwards returning users to the app.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        (async () => {
            const keys = await caches.keys();
            await Promise.all(keys.map((key) => caches.delete(key)));
            await self.registration.unregister();
            const windows = await self.clients.matchAll({ type: 'window' });
            for (const client of windows) {
                client.navigate(client.url);
            }
        })()
    );
});
