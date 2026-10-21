/* ============================================================
   발자국 서비스워커
   알림을 받아 띄우고, 누르면 그 화면으로 보낸다.
   화면을 통째로 저장해 두지는 않는다 — 글·사진은 늘 새로 받아야 하고,
   오래된 화면이 남아 있으면 더 헷갈린다.
   ============================================================ */
/* 알림 처리 버전 — 화면 설정에서 이 숫자를 보고
   폰이 새 서비스워커로 바뀌었는지 바로 알 수 있다 */
const VERSION = 'baljaguk-2';

/* 화면이 「지금 몇 번이야?」 하고 물으면 답한다 */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'version' && e.source) {
    try { e.source.postMessage({ type: 'version', version: VERSION }); } catch (err) { }
  }
});

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
    /* 이미 열려 있는 창이 있으면 그 창을 쓴다 — 창이 여러 개 생기지 않게.
       ★ 운영진 화면(admin.html)에 있으면 거기서는 글을 못 연다 —
         커뮤니티 쪽으로 옮겨 준다. */
    const mine = all.filter(c => c.url.indexOf(self.registration.scope) === 0);
    const inApp = mine.filter(c => c.url.indexOf('admin.html') < 0);
    /* ★ 보이는 창을 먼저 — 크롬 탭과 홈 화면 앱이 둘 다 열려 있으면
       눈에 보이는 쪽으로 보내야 한다 */
    const rank = c => (c.visibilityState === 'visible' ? 0 : 1) + (c.focused ? 0 : 0.5);
    const pick = (inApp.length ? inApp : mine).slice().sort((a, b) => rank(a) - rank(b));
    for (const c of pick) {
      {
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
