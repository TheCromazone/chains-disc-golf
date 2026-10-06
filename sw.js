// Chains service worker: turn alerts for invite matches. No offline cache; the game always loads fresh.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data?.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Chains — Disc Golf', {
    body: d.body || "It's your turn.", tag: d.tag || 'chains', renotify: true, icon: '/assets/icons/icon-192.png', badge: '/icon.svg', data: { url: d.url || '/' },
  }));
});
// A tap opens the match: an open game tab is focused and told which match; otherwise a new window opens on it.
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL(e.notification.data?.url || '/', self.location.origin).href;
  e.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find(c => new URL(c.url).origin === self.location.origin);
    if (tab) { await tab.focus(); tab.postMessage({ type: 'open', url }); return; }
    await self.clients.openWindow(url);
  })());
});
