/* ============================================================
   발자국 서비스워커
   알림을 받아 띄우고, 누르면 그 화면으로 보낸다.
   앱 껍데기(글꼴·그림틀·프로그램 파일)는 담아 두고,
   글·사진 같은 **내용**은 늘 새로 받는다.
   ============================================================ */
/* 알림 처리 버전 — 화면 설정에서 이 숫자를 보고
   폰이 새 서비스워커로 바뀌었는지 바로 알 수 있다 */
const VERSION = 'baljaguk-3';

/* 화면이 「지금 몇 번이야?」 하고 물으면 답한다 */
self.addEventListener('message', e => {
  if (e.data && e.data.type === 'version' && e.source) {
    try { e.source.postMessage({ type: 'version', version: VERSION }); } catch (err) { }
  }
  /* 로그아웃 — 담아 둔 사진을 비운다 (다음 사람에게 남지 않게) */
  if (e.data && e.data.type === 'clearPhotos') {
    e.waitUntil(caches.delete('baljaguk-photos-1'));
  }
  /* 화면이 알려 준 「앱 껍데기」를 담아 둔다 */
  if (e.data && e.data.type === 'shell') {
    e.waitUntil(keepShell(e.data.urls));
  }
});

/* ============================================================
   앱 껍데기를 담아 둔다 — 「앱이 늦게 켜져요」
   ------------------------------------------------------------
   GitHub Pages 는 파일을 **10분만** 담아 두라고 알려 준다
   (Cache-Control: max-age=600). 그래서 10분 뒤에 앱을 열면
   브라우저가 파일 열몇 개를 **하나하나 다시 물어본다** —
   폰에서는 그 왕복만으로 1초가 넘는다.

   우리 파일 주소에는 번호가 붙어 있다 (…/community.js?v=202610212146).
   **내용이 바뀌면 번호가 바뀐다** — 그러니 번호가 같으면 다시 물어볼
   까닭이 없다. 담긴 것을 그냥 준다.

   · 번호 붙은 assets/*.js·css → 담긴 것 먼저, 없으면 받아서 담는다
   · 화면(me.html 등) → 받아 오기 먼저, 안 되면 담긴 것 (인터넷이 없을 때)
   · 새 번호가 담기면 **같은 파일의 옛 번호는 지운다** — 저절로 치워진다
   ★ 주의: 알림 설정과 상관없이 **모두** 서비스워커를 두어야 뜻이 있다
     (community.js 의 keepSwFresh 가 등록한다)
   ============================================================ */
const SHELL = 'baljaguk-shell-1';

/* ★ 담아 두기는 **없어도 되는 것**이다.
   사생활 보호 모드·저장 공간 부족·기기 문제로 caches.open 이 통째로
   실패할 수 있다. 그때 respondWith 가 거절되면 **앱이 아예 안 켜진다**
   (파일마다 ERR_FAILED). 그러니 보관함은 「열리면 쓰고 아니면 만다」. */
async function box(name) {
  try { return await caches.open(name); } catch (e) { return null; }
}

/* 번호가 붙은 우리 파일인가 */
function versioned(url) {
  try {
    const u = new URL(url);
    return u.origin === self.location.origin &&
      /\/assets\/[^/]+\.(js|css)$/.test(u.pathname) &&
      /^[0-9]{12}$/.test(u.searchParams.get('v') || '');
  } catch (e) { return false; }
}

/* 같은 파일의 **다른 번호**는 지운다 */
async function dropOld(cache, url) {
  const u = new URL(url);
  for (const k of await cache.keys()) {
    let o;
    try { o = new URL(k.url); } catch (e) { continue; }
    if (o.pathname === u.pathname && o.search !== u.search) await cache.delete(k);
  }
}

/* 화면이 「내가 쓰는 파일들이에요」 하고 알려 주면 미리 담아 둔다.
   처음 켤 때는 서비스워커가 아직 자리를 안 잡아 그 요청들을 못 본다 —
   그래서 화면이 끝나고 한 번 알려 준다. 두 번째 켤 때부터 네트워크가 0 이다. */
async function keepShell(urls) {
  const cache = await box(SHELL);
  if (!cache) return;
  for (const u of (urls || []).slice(0, 40)) {
    if (!versioned(u)) continue;
    if (await cache.match(u)) continue;
    try {
      const res = await fetch(u, { credentials: 'same-origin' });
      if (res && res.ok) { await cache.put(u, res.clone()); await dropOld(cache, u); }
    } catch (e) { /* 인터넷이 없으면 다음에 */ }
  }
}


self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  await self.clients.claim();
  /* 옛 사진 보관함은 치운다 */
  let names = [];
  try { names = await caches.keys(); } catch (e) { return; }
  await Promise.all(names
    .filter(n => (n.indexOf('baljaguk-photos-') === 0 && n !== PHOTOS) ||
                 (n.indexOf('baljaguk-shell-') === 0 && n !== SHELL))
    .map(n => caches.delete(n)));
})()));


/* ============================================================
   사진을 기기에 담아 둔다
   ------------------------------------------------------------
   선고은님: 「앱을 껐다 켜면 사진들이 너무 늦게 보여」

   사진 주소는 **볼 때마다 토큰이 달라서** 브라우저 캐시가 못 쓴다.
   같은 사진인데 주소가 달라 보이니 매번 새로 받아 왔다.
   그래서 **토큰을 뗀 경로**를 열쇠로 삼아 우리가 담아 둔다.

   · 담긴 게 있으면 그것부터 보여 주고, 뒤에서 조용히 새로 받아 갱신
   · 150장까지, 한 장이 2MB 넘으면 안 담는다, 모두 합쳐 50MB 를 넘으면
     오래된 것부터 지운다
   · 비공개 사진이라 **이 기기·이 로그인**에서만 쓴다 —
     로그아웃하면 화면이 알려 주고 여기서 비운다
   ============================================================ */
const PHOTOS = 'baljaguk-photos-1';
const MAX_N = 150;
const MAX_ONE = 2 * 1024 * 1024;
const MAX_ALL = 50 * 1024 * 1024;

/* 토큰을 뗀 주소 — 같은 사진은 늘 같은 열쇠가 된다 */
const photoKey = url => {
  const u = new URL(url);
  return u.origin + u.pathname;
};
const isPhoto = url =>
  /\/storage\/v1\/(object|render\/image)\/(sign|public)\//.test(url);

async function trim(cache) {
  let keys = await cache.keys();
  /* 수가 넘치면 오래된 것(먼저 담은 것)부터 */
  while (keys.length > MAX_N) {
    await cache.delete(keys.shift());
  }
  /* 합쳐서 너무 크면 역시 오래된 것부터 */
  let total = 0;
  const sizes = [];
  for (const k of keys) {
    const r = await cache.match(k);
    const n = Number((r && r.headers.get('content-length')) || 0);
    sizes.push(n);
    total += n;
  }
  let i = 0;
  while (total > MAX_ALL && i < keys.length) {
    await cache.delete(keys[i]);
    total -= sizes[i];
    i++;
  }
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  /* ── 번호 붙은 앱 파일: 담긴 것을 그냥 준다 (네트워크 0) */
  if (versioned(req.url)) {
    event.respondWith((async () => {
      const cache = await box(SHELL);
      if (!cache) return fetch(req);                 /* 담아 둘 수 없으면 그냥 받아 온다 */
      let hit = null;
      try { hit = await cache.match(req); } catch (e) { }
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) {
        const copy = res.clone();
        event.waitUntil((async () => {
          try { await cache.put(req, copy); await dropOld(cache, req.url); } catch (e) { }
        })());
      }
      return res;
    })());
    return;
  }

  /* ── 화면(me.html 등): 받아 오기 먼저, 안 되면 담긴 것.
       새로 배포한 것이 **바로** 보여야 하고(번호가 여기 적혀 있다),
       인터넷이 없을 때는 지난번 화면이라도 떠야 한다. */
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        /* 담아 두는 것은 **맨 주소**뿐이다 (me.html).
           ?무엇=... 이 붙은 주소까지 담으면 보관함이 끝없이 늘어난다 */
        if (res && res.ok && !new URL(req.url).search) {
          const copy = res.clone();
          event.waitUntil((async () => {
            const c = await box(SHELL);
            if (c) { try { await c.put(req, copy); } catch (e) { } }
          })());
        }
        return res;
      } catch (e) {
        /* 인터넷이 안 될 때 — 지난번 화면이라도 */
        const cache = await box(SHELL);
        if (!cache) throw e;
        let hit = null;
        try {
          hit = (await cache.match(req)) ||
                (await cache.match(new URL('me.html', self.registration.scope).href));
        } catch (err) { }
        if (hit) return hit;
        throw e;
      }
    })());
    return;
  }

  if (!isPhoto(req.url)) return;

  event.respondWith((async () => {
    const cache = await box(PHOTOS);
    if (!cache) return fetch(req);
    const key = photoKey(req.url);
    const hit = await cache.match(key);

    /* 담긴 게 있으면 바로 준다. 뒤에서 조용히 새로 받아 둔다 */
    if (hit) {
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const n = Number(fresh.headers.get('content-length') || 0);
            if (n <= MAX_ONE) { await cache.put(key, fresh.clone()); await trim(cache); }
          } else if (fresh && (fresh.status === 404 || fresh.status === 400)) {
            /* ★ 서버에 없는 사진은 담아 둔 것도 버린다.
               안 그러면 글이 지워져도 그 사진이 폰에 계속 남아
               「지운 글 사진이 아직 보여요」가 된다. (지금 한 번은 보이고
               다음 번부터 안 보인다 — 이미 돌려준 뒤라서) */
            await cache.delete(key);
          }
        } catch (e) { /* 인터넷이 없으면 담긴 것으로 버틴다 */ }
      })());
      return hit;
    }

    const res = await fetch(req);
    if (res && res.ok) {
      const n = Number(res.headers.get('content-length') || 0);
      if (n <= MAX_ONE) {
        event.waitUntil((async () => {
          try { await cache.put(key, res.clone()); await trim(cache); } catch (e) { }
        })());
      }
    }
    return res;
  })());
});

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
