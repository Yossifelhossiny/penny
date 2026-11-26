/// <reference lib="webworker" />
/**
 * Penny service worker: offline cache + automatic SMS import.
 *
 * When the iOS Shortcut sends an SMS, a push message wakes this worker even
 * if Penny is closed. The SMS is parsed and saved straight into IndexedDB,
 * then a notification tells you what happened.
 */

import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { handlePushPayload, type PushNotice } from './services/push/pushHandler';

declare const self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let notice: PushNotice | null;
      try {
        notice = await handlePushPayload(event.data?.json());
      } catch (err) {
        console.error('[penny] push import failed', err);
        notice = {
          title: 'Penny · ماقدرتش أسجل الرسالة',
          body: 'افتح Penny وجرب Sync SMS Inbox.',
          page: 'import',
          tag: 'penny-error',
        };
      }
      // iOS stops delivering pushes to apps that receive one without showing
      // a notification, so always show something.
      notice ??= { title: 'Penny', body: 'وصلت رسالة.', page: 'dashboard', tag: 'penny-info' };

      await self.registration.showNotification(notice.title, {
        body: notice.body,
        tag: notice.tag,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: { page: notice.page, filter: notice.filter },
      });

      // Refresh any open Penny window.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const w of windows) w.postMessage({ type: 'penny:data-changed' });
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const { page, filter } = (event.notification.data ?? {}) as { page?: string; filter?: string };
  const url = `/?page=${encodeURIComponent(page ?? 'dashboard')}${filter ? `&filter=${encodeURIComponent(filter)}` : ''}`;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = windows[0];
      if (open) {
        open.postMessage({ type: 'penny:navigate', page, filter });
        await open.focus();
      } else {
        await self.clients.openWindow(url);
      }
    })()
  );
});
