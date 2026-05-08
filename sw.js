// Service Worker — Web Push para Consult Delivery
// Recebe push notifications e exibe mesmo com o app fechado

self.addEventListener('push', event => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title || 'Consult Delivery', {
      body:     data.body || 'Nova mensagem recebida',
      icon:     '/assets/logo.svg',
      badge:    '/assets/icon-rocket.svg',
      tag:      data.tag || 'cd-notif',
      renotify: true,
      data:     { route: data.route || 'chat' },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const route = event.notification.data?.route || 'chat';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      if (list.length > 0) {
        list[0].focus();
        list[0].postMessage({ type: 'navigate', route });
      } else {
        clients.openWindow('/');
      }
    })
  );
});
