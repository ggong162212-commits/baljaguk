/* ============================================================
   홈 화면에 추가(앱 설치) — 버튼 한 번으로
   ------------------------------------------------------------
   · 갤럭시(크롬·삼성 인터넷): 브라우저가 주는 「설치」 창을 우리 버튼으로 바로 띄운다.
     설치하면 이어서 「알림도 켤까요?」 — 두 번 할 일을 한 흐름으로.
   · 아이폰: 사이트가 대신 추가할 방법이 없다(애플이 막음).
     화면 위에 3단계 안내를 띄우고, 눌러야 할 버튼 자리를 화살표로 가리킨다.
     사파리 26부터는 공유가 「···」 안으로 들어갔고, 아이폰 크롬은 주소창 오른쪽이다.
   · 카톡 등 앱 안 브라우저: 설치가 안 된다 — 다른 브라우저로 넘긴다(Push.openOutside).
   · 이미 홈 화면에서 연 상태면 아무것도 안 보인다.
   쓰는 법:
     Install.state()        → 'installed'|'prompt'|'ios'|'android'|'inapp'|'desktop'
     Install.show()         → 버튼을 보여도 되나(설치 전 · 휴대폰)
     Install.start()        → 버튼을 눌렀을 때. 경우에 맞게 설치 창·안내·다른 브라우저
     Install.mountCard(box) → 홈 위 작은 카드. 「나중에」 누르면 14일 동안 안 보인다
   ============================================================ */
window.Install = (function () {
  const ua = navigator.userAgent || '';
  const isIOS = /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isIPad = /iPad/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosChrome = /CriOS/i.test(ua);
  const safariVer = +((ua.match(/Version\/(\d+)/) || [])[1] || 0);
  const isSamsung = /SamsungBrowser/i.test(ua);
  const inApp = /KAKAOTALK|NAVER\(inapp|\bLine\/|Instagram|FBAN|FBAV|FB_IAB/i.test(ua);

  const standalone = () => window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  /* ★ 브라우저가 「설치할 수 있어요」를 알려 주는 순간을 붙잡아 둔다.
     그대로 두면 크롬이 아래에 작은 띠를 잠깐 띄우고 사라진다 — 우리 버튼에서 쓴다. */
  let deferred = null;
  let installedNow = false;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferred = e;
    paintCards();
  });
  window.addEventListener('appinstalled', () => {
    installedNow = true; deferred = null;
    paintCards();
  });

  function state() {
    if (standalone() || installedNow) return 'installed';
    if (inApp) return 'inapp';
    if (deferred) return 'prompt';
    if (isIOS) return 'ios';
    if (isAndroid) return 'android';
    return 'desktop';
  }
  const show = () => !/installed|desktop/.test(state());

  /* ---------- 버튼을 눌렀을 때 ---------- */
  async function start() {
    const st = state();
    if (st === 'installed') { toast('이미 홈 화면에서 쓰고 있어요', 'ok'); return 'installed'; }
    if (st === 'inapp') {
      if (window.Push && Push.openOutside && Push.openOutside()) return 'outside';
      guide('inapp'); return 'guide';
    }
    if (st === 'prompt') {
      const ev = deferred;
      deferred = null;                       /* 한 번 쓴 창은 다시 못 띄운다 */
      try {
        await ev.prompt();
        const ch = await ev.userChoice;
        if (ch && ch.outcome === 'accepted') {
          installedNow = true; paintCards();
          toast('홈 화면에 발자국이 생겼어요', 'ok');
          setTimeout(offerNotify, 700);
          return 'accepted';
        }
        paintCards();
        return 'dismissed';
      } catch (e) {
        guide('android'); return 'guide';
      }
    }
    guide(st);
    return 'guide';
  }

  /* 설치 직후 — 알림이 아직이면 이어서 켜게 한다 */
  async function offerNotify() {
    const P = window.Push;
    if (!P || !P.hasKey || P.state() !== 'ask') return;
    const ok = await UI.confirmSheet('알림도 켤까요?',
      '봉사 안내와 공지, 내 글에 달린 댓글을 바로 받아볼 수 있어요. 휴대폰이 물으면 「허용」을 눌러 주세요.',
      '알림 켜기');
    if (!ok) return;
    try { await P.enable(); toast('알림을 켰어요', 'ok'); }
    catch (e) { toast(e.message || '알림을 켜지 못했어요', 'err'); }
  }

  const toast = (m, t) => (window.UI && UI.toast ? UI.toast(m, t) : alert(m));
  const ic = n => (window.ic ? window.ic(n) : '');

  /* ---------- 따라 하기 안내 ----------
     바텀 시트로 띄우면 사파리 아래 막대를 가린다 — 화면 가운데 카드로 띄우고,
     눌러야 할 자리를 화살표로 가리킨다. */
  function steps(st) {
    if (st === 'inapp') return {
      title: '다른 브라우저에서 열어 주세요',
      lines: [
        '이 앱 안에서는 홈 화면에 추가할 수 없어요',
        isIOS ? '오른쪽 아래 <b>···</b> → <b>Safari로 열기</b>' : '오른쪽 위 <b>⋮</b> → <b>다른 브라우저로 열기</b>',
        '열린 화면에서 이 버튼을 다시 눌러 주세요'
      ],
      arrow: isIOS ? 'br' : 'tr'
    };
    if (st === 'android') return {
      title: '홈 화면에 추가하기',
      lines: [
        isSamsung ? '아래 <b>≡</b> 메뉴를 눌러요' : '오른쪽 위 <b>⋮</b> 메뉴를 눌러요',
        isSamsung ? '<b>현재 페이지 추가</b> → <b>홈 화면</b>' : '<b>홈 화면에 추가</b> 또는 <b>앱 설치</b>',
        '<b>설치</b>(또는 <b>추가</b>)를 누르면 끝이에요'
      ],
      arrow: isSamsung ? 'br' : 'tr'
    };
    /* 아이폰 */
    if (iosChrome) return {
      title: '홈 화면에 추가하기',
      lines: [
        '주소창 오른쪽 <b>공유</b> ' + share() + ' 를 눌러요',
        '목록을 올려 <b>홈 화면에 추가</b>를 눌러요',
        '오른쪽 위 <b>추가</b> → 생긴 <b>발바닥 아이콘</b>으로 들어와요'
      ],
      arrow: 'tr'
    };
    if (isIPad) return {
      title: '홈 화면에 추가하기',
      lines: [
        '위쪽 <b>공유</b> ' + share() + ' 를 눌러요',
        '<b>홈 화면에 추가</b>를 눌러요',
        '<b>추가</b> → 생긴 <b>발바닥 아이콘</b>으로 들어와요'
      ],
      arrow: 'tr'
    };
    if (safariVer >= 26) return {
      title: '홈 화면에 추가하기',
      lines: [
        '오른쪽 아래 <b>···</b> → <b>공유</b> ' + share() + ' 를 눌러요',
        '목록을 위로 올려 <b>홈 화면에 추가</b>를 눌러요',
        '<b>추가</b> → 생긴 <b>발바닥 아이콘</b>으로 들어와요'
      ],
      arrow: 'br'
    };
    return {
      title: '홈 화면에 추가하기',
      lines: [
        '아래 가운데 <b>공유</b> ' + share() + ' 를 눌러요',
        '목록을 위로 올려 <b>홈 화면에 추가</b>를 눌러요',
        '오른쪽 위 <b>추가</b> → 생긴 <b>발바닥 아이콘</b>으로 들어와요'
      ],
      arrow: 'bc'
    };
  }
  /* 사파리 공유 모양(네모에 위 화살표) */
  const share = () => '<svg class="ins-share" viewBox="0 0 24 24" aria-label="공유"><path d="M12 3v11M8 6.5 12 3l4 3.5"/><path d="M8.5 10H6.5a1.5 1.5 0 0 0-1.5 1.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17.5 10h-2"/></svg>';

  function guide(st) {
    css();
    close();
    const s = steps(st);
    const ov = document.createElement('div');
    ov.className = 'ins-ov';
    ov.innerHTML =
      '<div class="ins-card" role="dialog" aria-modal="true" aria-label="' + s.title + '">' +
      '<button class="iconbtn ins-x" type="button" data-insx aria-label="닫기">' + ic('x') + '</button>' +
      '<div class="ins-ic">' + ic('paw') + '</div>' +
      '<h3>' + s.title + '</h3>' +
      '<ol>' + s.lines.map((l, i) => '<li><span class="n">' + (i + 1) + '</span><span>' + l + '</span></li>').join('') + '</ol>' +
      (isIOS && st !== 'inapp'
        ? '<p class="ins-note">홈 화면 아이콘으로 들어와야 <b>알림</b>도 켤 수 있어요.</p>' : '') +
      '<button class="btn primary lg block" type="button" data-insx>알겠어요</button>' +
      '</div>' +
      '<div class="ins-arrow ' + s.arrow + '" aria-hidden="true">' + ic('down') + '</div>';
    document.body.appendChild(ov);
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-insx]')) close(); });
    document.addEventListener('keydown', esc1);
    setTimeout(() => { const b = ov.querySelector('.btn'); if (b) b.focus(); }, 60);
  }
  function esc1(e) { if (e.key === 'Escape') close(); }
  function close() {
    document.querySelectorAll('.ins-ov').forEach(x => x.remove());
    document.removeEventListener('keydown', esc1);
  }

  /* ---------- 홈 위 작은 카드 ---------- */
  const SNOOZE = 'baljaguk.installLater';
  const DAYS = 14;
  const snoozed = () => {
    try { const t = +localStorage.getItem(SNOOZE) || 0; return Date.now() - t < DAYS * 864e5; }
    catch (e) { return false; }
  };
  const boxes = new Set();
  function mountCard(box) {
    if (!box) return;
    css();
    boxes.add(box);
    paint(box);
  }
  function paintCards() { boxes.forEach(b => { if (b.isConnected) paint(b); else boxes.delete(b); }); }
  function paint(box) {
    if (!show() || snoozed()) { box.innerHTML = ''; return; }
    const st = state();
    const btn = st === 'prompt' ? '앱으로 설치' : st === 'inapp' ? '브라우저로 열기' : '추가하는 법';
    box.innerHTML =
      '<div class="ins-bar">' +
      '<div class="ins-bic">' + ic('paw') + '</div>' +
      '<div class="ins-bt"><b>홈 화면에 발자국 추가</b>' +
      '<span>' + (st === 'prompt' ? '한 번 누르면 앱처럼 열려요' : '앱처럼 열리고 알림도 받을 수 있어요') + '</span></div>' +
      '<button class="btn primary sm" type="button" data-insgo>' + btn + '</button>' +
      '<button class="iconbtn ins-later" type="button" data-inslater aria-label="나중에">' + ic('x') + '</button>' +
      '</div>';
    box.querySelector('[data-insgo]').onclick = () => start();
    box.querySelector('[data-inslater]').onclick = () => {
      try { localStorage.setItem(SNOOZE, String(Date.now())); } catch (e) { }
      box.innerHTML = '';
      toast('2주 뒤에 다시 알려 드릴게요. 「내 프로필」에서도 추가할 수 있어요');
    };
  }

  let cssDone = false;
  function css() {
    if (cssDone) return; cssDone = true;
    const st = document.createElement('style');
    st.textContent =
      '.ins-bar{display:flex;align-items:center;gap:10px;padding:12px 10px 12px 14px;margin:0 0 12px;' +
      'background:var(--surface);border:1px solid var(--line);border-radius:var(--r-lg);box-shadow:var(--shadow-sm)}' +
      '.ins-bic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand-deep)}' +
      '.ins-bic svg{width:22px;height:22px}' +
      '.ins-bt{flex:1;min-width:0;display:grid;gap:2px;line-height:1.35}' +
      '.ins-bt b{font-size:14px;color:var(--ink)}.ins-bt span{font-size:12px;opacity:.7}' +
      '.ins-bar .btn{flex:none;min-height:40px;white-space:nowrap}' +
      '.ins-later{flex:none;width:36px;height:40px;opacity:.55}' +
      '.ins-ov{position:fixed;inset:0;z-index:300;background:rgba(15,20,12,.55);display:grid;place-items:center;' +
      'padding:16px;padding-bottom:max(96px,calc(env(safe-area-inset-bottom) + 96px));animation:insIn .18s ease}' +
      '.ins-card{position:relative;width:100%;max-width:380px;background:var(--surface);color:var(--ink);' +
      'border-radius:var(--r-xl);padding:24px 20px 20px;box-shadow:var(--shadow-pop);text-align:center}' +
      '.ins-x{position:absolute;top:8px;right:8px;width:44px;height:44px}' +
      '.ins-ic{width:54px;height:54px;margin:0 auto;border-radius:18px;display:grid;place-items:center;background:var(--brand-soft);color:var(--brand-deep)}' +
      '.ins-ic svg{width:28px;height:28px}' +
      '.ins-card h3{margin-top:12px;font-size:18px}' +
      '.ins-card ol{list-style:none;margin:16px 0 0;padding:0;display:grid;gap:10px;text-align:left}' +
      '.ins-card li{display:flex;gap:10px;align-items:flex-start;font-size:15px;line-height:1.55}' +
      '.ins-card li .n{flex:none;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;' +
      'background:var(--brand);color:#fff;font-size:13px;font-weight:700;margin-top:1px}' +
      '.ins-share{width:18px;height:18px;vertical-align:-3px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}' +
      '.ins-note{margin:14px 0 0;font-size:13px;line-height:1.55;padding:10px 12px;border-radius:var(--r-md);background:var(--gold-soft);text-align:left}' +
      '.ins-card .btn{margin-top:16px}' +
      '.ins-arrow{position:fixed;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;' +
      'background:var(--brand);color:#fff;box-shadow:0 6px 18px rgba(0,0,0,.3);animation:insBob 1s ease-in-out infinite}' +
      '.ins-arrow svg{width:28px;height:28px}' +
      '.ins-arrow.bc{left:calc(50% - 26px);bottom:max(14px,env(safe-area-inset-bottom))}' +
      '.ins-arrow.br{right:16px;bottom:max(14px,env(safe-area-inset-bottom))}' +
      '.ins-arrow.tr{right:16px;top:max(10px,env(safe-area-inset-top))}' +
      '.ins-arrow.tr svg{transform:rotate(180deg)}' +
      '@keyframes insBob{0%,100%{transform:translateY(0)}50%{transform:translateY(8px)}}' +
      '.ins-arrow.tr{animation-name:insBobUp}' +
      '@keyframes insBobUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}' +
      '@keyframes insIn{from{opacity:0}to{opacity:1}}' +
      '@media (prefers-reduced-motion:reduce){.ins-arrow,.ins-ov{animation:none}}';
    document.head.appendChild(st);
  }

  return { state, show, start, guide, mountCard, offerNotify };
})();
