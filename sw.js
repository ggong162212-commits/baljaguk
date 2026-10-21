/* ============================================================
   발자국 서비스워커
   알림을 받아 띄우고, 누르면 그 화면으로 보낸다.
   화면을 통째로 저장해 두지는 않는다 — 글·사진은 늘 새로 받아야 하고,
   오래된 화면이 남아 있으면 더 헷갈린다.
   ============================================================ */
const VERSION = 'baljaguk-1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch (e) { d = {}; }

  const title = d.title || '발자국';
  const body = d.body || '';
  const url = d.url || 'me.html';
  const kind = d.kind || 'news';

  event.waitUntil(
    self.registration.showNotification(title, {
      body: body,
      icon: 'assets/icon-192.png',
      badge: 'assets/badge-72.png',
      tag: kind + ':' + (d.id || ''),   /* 같은 것은 겹쳐 쌓이지 않게 */
      renotify: false,
      data: { url: url }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || 'me.html';
  const full = new URL(url, self.registration.scope).href;

  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    /* 이미 열려 있는 창이 있으면 그 창을 쓴다 — 창이 여러 개 생기지 않게 */
    for (const c of all) {
      if (c.url.indexOf(self.registration.scope) === 0) {
        /* 주소가 #post=… 만 다르면 navigate 로는 화면이 안 바뀐다.
           그래서 열린 창에 직접 알려 준다.
           **둘 다 하면** 글이 두 번 열리거나 페이지가 다시 로드된다 —
           같은 페이지면 알려 주기만, 다른 페이지일 때만 navigate. */
        const samePage = c.url.split('#')[0] === full.split('#')[0];
        /* ★ 먼저 창을 앞으로 가져온 다음에 알려 준다.
           반대로 하면 아직 뒤에 있는 창이 메시지를 받아
           화면이 안 바뀐 채로 끝난다.
           (「알림이 뜨면 바로 누르는데 그 글로 안 가요」) */
        try { await c.focus(); } catch (e) { }
        if (samePage) {
          try { c.postMessage({ type: 'goto', url: url }); } catch (e) { }
          /* 앱이 아직 다 안 켜졌을 수 있다 — 조금 뒤 한 번 더 */
          setTimeout(() => { try { c.postMessage({ type: 'goto', url: url }); } catch (e) { } }, 1200);
        } else {
          try { await c.navigate(full); } catch (e) { }
        }
        return c;
      }
    }
    return self.clients.openWindow(full);
  })());
});
