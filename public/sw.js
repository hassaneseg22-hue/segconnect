/* SEG Connect — service worker des notifications navigateur */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; }
  catch (e) { d = { title: 'SEG Connect', body: event.data ? event.data.text() : '' }; }
  event.waitUntil(self.registration.showNotification(d.title || 'SEG Connect', {
    body: d.body || '',
    icon: '/ico.jpeg',
    badge: '/ico.jpeg',
    tag: d.tag || undefined,
    renotify: Boolean(d.tag),
    requireInteraction: d.type === 'critical',
    data: { url: d.url || '/notifications' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/notifications', self.location.origin).href;
  event.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of list) {
      if (c.url.startsWith(self.location.origin)) {
        await c.focus();
        if ('navigate' in c) { try { await c.navigate(url); } catch (e) { /* onglet non contrôlé */ } }
        return;
      }
    }
    await self.clients.openWindow(url);
  })());
});
