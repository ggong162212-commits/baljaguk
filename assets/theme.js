/* ============================================================
   상단 어둡게/밝게 스위치
   · 상단바 프로필 동그라미 바로 왼쪽에 달·해 아이콘 버튼(누르는 자리 44px)
     — html 상단바에 원래 있던 [data-theme-btn] 을 그 자리로 옮겨 다시 보인다
       (화면 아이콘은 SVG 만 쓴다는 규칙대로 ic('moon'|'sun'))
   · 처음엔 폰 설정을 따르고, 누르면 기억한다(baljaguk.theme).
     기억한 값이 없으면 폰 설정이 바뀔 때 같이 바뀐다
   · 주소창 색(theme-color)도 같이 맞춘다
   · 깜빡임은 각 html <head> 의 인라인 한 줄이 막는다 — 이 파일은 그 뒤 일
   커뮤니티(me.html)·운영진(admin.html) 둘 다. community.js·admin.js 는 손대지 않는다
   ============================================================ */
(function () {
  const KEY = 'baljaguk.theme';
  const COLOR = { light: '#F6F5EC', dark: '#191E18' };
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  const saved = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  const current = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

  function apply(t) {
    document.documentElement.dataset.theme = t;
    const m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', COLOR[t]);
    if (window.UI && UI.paintThemeButtons) UI.paintThemeButtons();
  }

  /* 폰 설정이 바뀌면 — 직접 고른 적이 없을 때만 따라간다 */
  if (mq) {
    const follow = () => { if (!saved()) apply(mq.matches ? 'dark' : 'light'); };
    if (mq.addEventListener) mq.addEventListener('change', follow);
    else if (mq.addListener) mq.addListener(follow);
  }

  /* 상단바 — 프로필 동그라미가 생기면 테마 버튼을 바로 왼쪽으로 */
  function place() {
    const tb = document.querySelector('.topbar .in');
    if (!tb) return;
    const prof = tb.querySelector('#profBtn');
    const btn = tb.querySelector('[data-theme-btn]');
    if (!prof || !btn) return;
    if (btn.nextElementSibling !== prof) tb.insertBefore(btn, prof);
    if (btn.hidden) btn.hidden = false;
    btn.classList.add('themebtn');
    if (!btn.dataset.wired) {
      btn.dataset.wired = '1';
      /* me.js·admin.js 가 이미 UI.toggleTheme 를 붙여 두었다 — 옮겨도 그대로 산다.
         여기서는 주소창 색만 맞춘다 */
      btn.addEventListener('click', () => setTimeout(() => apply(current()), 0));
    }
    if (window.UI && UI.paintThemeButtons) UI.paintThemeButtons();
  }

  const CSS =
    '.topbar .themebtn{width:44px;height:44px;border:none;background:none;box-shadow:none;' +
    'border-radius:14px;color:var(--ink-2);flex:none;margin-right:2px}' +
    '.topbar .themebtn::after{inset:0}' +
    '.topbar .themebtn .svg,.topbar .themebtn svg{width:21px;height:21px}';

  function boot() {
    if (!document.getElementById('themeCss')) {
      const st = document.createElement('style');
      st.id = 'themeCss'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    apply(current());
    place();
    const tb = document.querySelector('.topbar');
    if (tb && window.MutationObserver) {
      new MutationObserver(place).observe(tb, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.Theme = { apply, place };
})();
