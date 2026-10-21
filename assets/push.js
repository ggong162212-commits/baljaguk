/* ============================================================
   발자국 🐾 · 알림 (웹 푸시)
   ------------------------------------------------------------
   · 아이폰은 홈 화면에 추가한 뒤에만 알림을 받을 수 있다 (iOS 16.4+).
   · 카카오톡 안에서 열면 알림도 홈 화면 추가도 안 된다 — 안내를 대신 보인다.
   · VAPID 공개 키가 없으면 알림 자리를 아예 안 보인다.
   · 「켜짐」(state 'granted')은 서버에 이 기기 구독이 저장된 게 확인됐을 때만.
     폰 허락만 있고 저장이 안 됐으면(명부 연결 안 됨 등) 'ask' — 「알림 켜기」가 다시 보이고,
     누르면 왜 안 되는지 쉬운 말로 알려 준다.
   · 앱을 열 때마다 브라우저 구독과 서버를 맞춘다(sync) — 구독 주소가 바뀌었거나
     서버에서 지워졌으면 다시 저장한다.
   ============================================================ */
window.Push = (function () {
  const KEY = (window.CONFIG && window.CONFIG.VAPID_PUBLIC_KEY) || '';

  /* ---------- 지금 어떤 상태인가 ---------- */
  const ua = navigator.userAgent || '';

  /* 카톡 안 브라우저 — 여기서는 알림을 켤 수 없다 */
  const inKakao = /KAKAOTALK/i.test(ua);
  const inNaver = /NAVER\(inapp/i.test(ua);
  const inLine = /\bLine\//i.test(ua);
  const inApp = inKakao || inNaver || inLine;

  const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  /* 홈 화면에서 연 상태인가 */
  const standalone = window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  const canPush = 'serviceWorker' in navigator && 'PushManager' in window &&
    'Notification' in window;

  /* 서버 저장이 확인된 구독 주소 — 이 기기에만 */
  const SAVED = 'baljaguk.pushSaved';
  const savedEp = () => { try { return localStorage.getItem(SAVED) || ''; } catch (e) { return ''; } };
  const setSaved = ep => { try { ep ? localStorage.setItem(SAVED, ep) : localStorage.removeItem(SAVED); } catch (e) { } };

  function state() {
    if (!KEY) return 'off';                       /* 아직 안 켠 기능 */
    if (inApp) return 'inapp';                    /* 카톡 등 앱 안 브라우저 */
    if (!canPush) return 'unsupported';
    if (isIOS && !standalone) return 'needHome';  /* 아이폰은 홈 추가가 먼저 */
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'granted') return savedEp() ? 'granted' : 'ask';
    return 'ask';
  }

  /* ---------- 서비스워커 ---------- */
  let regP = null;
  function ready() {
    if (!canPush) return Promise.reject(new Error('이 브라우저는 알림을 못 받아요'));
    if (!regP) regP = navigator.serviceWorker.register('sw.js', { scope: './' });
    return regP;
  }

  /* 서버가 주는 키는 base64url — 브라우저가 바라는 바이트로 바꾼다 */
  function toBytes(b64) {
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  async function current() {
    if (!canPush) return null;
    const reg = await ready();
    return await reg.pushManager.getSubscription();
  }

  /* ---------- 켜기 ---------- */
  async function enable() {
    const st = state();
    if (st === 'inapp') throw new Error('카카오톡 안에서는 알림을 켤 수 없어요');
    if (st === 'needHome') throw new Error('먼저 홈 화면에 추가해주세요');
    if (st === 'unsupported') throw new Error('이 브라우저는 알림을 못 받아요');
    if (!KEY) throw new Error('알림이 아직 준비 중이에요');

    const ok = await Notification.requestPermission();
    if (ok !== 'granted') throw new Error('알림이 꺼져 있어요');

    const reg = await ready();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: toBytes(KEY)
      });
    }
    await save(sub);
    return sub.endpoint;
  }

  /* ---------- 서버에 저장 — 안 되면 왜 안 되는지 ---------- */
  async function save(sub) {
    const j = sub.toJSON();
    let ok;
    try { ok = await DB.push.subscribe(sub.endpoint, j.keys.p256dh, j.keys.auth); }
    catch (e) {
      setSaved('');
      if (e && e.code === 'noauth') throw new Error('로그인이 풀렸어요. 다시 로그인한 뒤 켜 주세요');
      if (e && e.code === 'offline') throw new Error('인터넷이 끊겨 알림을 켜지 못했어요. 다시 눌러 주세요');
      throw new Error('알림을 켜지 못했어요. 잠시 뒤 다시 눌러 주세요');
    }
    /* false = 서버가 구성원으로 못 알아봄 — 카카오 계정이 명부와 안 이어졌다 */
    if (ok !== true) {
      setSaved('');
      throw new Error('알림을 켜지 못했어요. 카카오 계정이 명부와 연결되지 않았어요 — 운영진에게 연결을 부탁해 주세요');
    }
    /* 정말 들어갔나 — 서버에서 다시 읽어 본다 (체험 모드는 저장 결과로 갈음) */
    if (!(DB.isDemo && DB.isDemo())) {
      let row = null;
      try { row = await DB.push.prefs(sub.endpoint); } catch (e) { }
      if (!row) { setSaved(''); throw new Error('알림을 켜지 못했어요. 잠시 뒤 다시 눌러 주세요'); }
    }
    const old = savedEp();
    if (old && old !== sub.endpoint) { try { await DB.push.unsubscribe(old); } catch (e) { } }
    setSaved(sub.endpoint);
    return true;
  }

  /* ---------- 앱을 열 때 — 브라우저 구독과 서버 맞추기 ----------
     · 허락돼 있는데 브라우저 구독이 없어졌으면(주소 갱신 등) 새로 만들어 저장
     · 구독 주소가 저장해 둔 것과 다르거나 서버에 없으면 다시 저장
     · 로그인 전·인터넷 끊김이면 아무것도 바꾸지 않는다 */
  async function sync() {
    if (!KEY || inApp || !canPush || (isIOS && !standalone)) return;
    if (Notification.permission !== 'granted') { if (savedEp()) setSaved(''); return; }
    try {
      const reg = await ready();
      let sub = await reg.pushManager.getSubscription();
      if (!sub && !savedEp()) return;              /* 켠 적 없는 기기 */
      const me = await DB.me();                     /* 로그인 전이면 건드리지 않는다 */
      if (!me || !me.login) return;
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(KEY) });
      if (sub.endpoint === savedEp() && !(DB.isDemo && DB.isDemo())) {
        const row = await DB.push.prefs(sub.endpoint);
        if (row) return;                            /* 서버에도 있다 — 그대로 */
      } else if (sub.endpoint === savedEp()) return;
      await save(sub);
    } catch (e) {
      if (e && (e.code === 'noauth' || e.code === 'offline')) return;
      console.warn('[발자국] 알림 구독 맞추기:', e && e.message);
    }
  }
  /* 로그인·화면이 먼저 뜨게 조금 뒤에 */
  if (document.readyState === 'complete') setTimeout(sync, 2500);
  else window.addEventListener('load', () => setTimeout(sync, 2500));

  /* ---------- 끄기 ---------- */
  async function disable() {
    const sub = await current();
    if (!sub) return true;
    try { await DB.push.unsubscribe(sub.endpoint); } catch (e) { }
    setSaved('');
    await sub.unsubscribe();
    return true;
  }

  /* ---------- 다른 브라우저로 열기 ----------
     안드로이드는 크롬으로 바로 보낼 수 있다.
     아이폰은 자동으로 못 보내서 그림으로 안내한다. */
  function openOutside() {
    const url = location.href.replace(/^https?:\/\//, '');
    if (/Android/i.test(ua)) {
      location.href = 'intent://' + url +
        '#Intent;scheme=https;package=com.android.chrome;end';
      return true;
    }
    return false;   /* 아이폰 — 안내만 */
  }

  return {
    state, enable, disable, current, openOutside, sync,
    inApp: inApp, inKakao: inKakao, isIOS: isIOS, standalone: standalone,
    hasKey: !!KEY
  };
})();
