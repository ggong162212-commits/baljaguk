/* ============================================================
   발자국 🐾 · 알림 (웹 푸시)
   ------------------------------------------------------------
   · 아이폰은 홈 화면에 추가한 뒤에만 알림을 받을 수 있다 (iOS 16.4+).
   · 카카오톡 안에서 열면 알림도 홈 화면 추가도 안 된다 — 안내를 대신 보인다.
   · VAPID 공개 키가 없으면 알림 자리를 아예 안 보인다.
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

  function state() {
    if (!KEY) return 'off';                       /* 아직 안 켠 기능 */
    if (inApp) return 'inapp';                    /* 카톡 등 앱 안 브라우저 */
    if (!canPush) return 'unsupported';
    if (isIOS && !standalone) return 'needHome';  /* 아이폰은 홈 추가가 먼저 */
    if (Notification.permission === 'denied') return 'denied';
    if (Notification.permission === 'granted') return 'granted';
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
    const j = sub.toJSON();
    await DB.push.subscribe(sub.endpoint, j.keys.p256dh, j.keys.auth);
    return sub.endpoint;
  }

  /* ---------- 끄기 ---------- */
  async function disable() {
    const sub = await current();
    if (!sub) return true;
    try { await DB.push.unsubscribe(sub.endpoint); } catch (e) { }
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
    state, enable, disable, current, openOutside,
    inApp: inApp, inKakao: inKakao, isIOS: isIOS, standalone: standalone,
    hasKey: !!KEY
  };
})();
