/* ============================================================
   발자국 커뮤니티
   홈(피드) · 봉사 · 설문 · 나  — 하단 탭 4개
   me.js 가 본인 확인을 마치면 여기로 넘겨준다.
   ============================================================ */
window.Community = (function () {
  const {
    $, $$, esc, toast, sheet, closeSheet, confirmSheet,
    won, num, credit, copy, fmtDate, fmtDateTime, relTime, avatar, resizeImage, cropSquare, cheer
  } = UI;

  const TABS = [
    { id: 'home', label: '홈', icon: 'home' },
    { id: 'vol', label: '봉사', icon: 'calendar' },
    { id: 'poll', label: '설문', icon: 'clipboard' },
    { id: 'me', label: '나', icon: 'paw' }
  ];

  /* 화면 아이콘은 SVG 만 쓴다.
     이모지는 사용자가 직접 다는 반응에만 — 규칙의 유일한 예외다. */
  /* 반응은 하트 하나뿐이다 (2026-10-21).
     여러 가지를 고르게 했더니 「뭘 눌러야 하나」 머뭇거리게 돼서
     인스타처럼 하트 하나로 줄였다. 옛 반응은 지우지 않고 하트로 옮겼다. */
  const KINDS = ['heart'];

  let ME = null;          /* { id, name, role, status } */
  let AM_ADMIN = false;
  let cur = 'home';

  /* 피드 상태 — 더 내리면 이어 붙인다 */
  const F = { rows: [], cursor: null, kind: 'all', place: '', done: false, busy: false };

  /* ---------- 들어오기 ---------- */
  async function start(me) {
    ME = me;
    try { AM_ADMIN = await DB.isAdmin(); } catch (e) { AM_ADMIN = false; }
    try { window.__settings = await DB.settings.get(); } catch (e) { }

    $('#footLink').hidden = true;

    const bar = $('#tabbar');
    /* 안쪽 틀로 한 번 감싼다 — 탭바는 화면 끝까지, 버튼은 앱 기둥 안에 */
    bar.innerHTML = '<div class="tabbar-in">' + TABS.map(t =>
      '<button type="button" data-tab="' + t.id + '" aria-label="' + t.label + '">' +
      '<span class="i">' + ic(t.icon) + '</span>' + t.label +
      '<span class="pawdot">' + ic('paw') + '</span></button>').join('') + '</div>';
    $$('#tabbar [data-tab]').forEach(b =>
      b.addEventListener('click', () => go(b.dataset.tab)));
    bar.hidden = false;

    $('#fab').innerHTML = ic('plus');

    /* 로고를 누르면 어디서든 홈 탭으로 — 막다른 곳이 없게 */
    const logo = document.querySelector('.topbar .brandmark');
    if (logo && !logo.dataset.home) {
      logo.dataset.home = '1';
      logo.style.cursor = 'pointer';
      logo.setAttribute('role', 'button');
      logo.setAttribute('tabindex', '0');
      logo.setAttribute('aria-label', '홈으로');
      const goHome = () => { closeSheet(); go('home'); };
      logo.addEventListener('click', goHome);
      logo.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); }
      });
    }

    /* 운영진에게만 「발자국 | 운영진」 전환. 구성원에게는 보이지 않는다 */
    if (AM_ADMIN) {
      const bm = document.querySelector('.topbar .brandmark');
      if (bm && !document.querySelector('.sidesw')) {
        bm.classList.remove('grow');
        const wm = bm.querySelector('.wordmark'); if (wm) wm.hidden = true;
        bm.insertAdjacentHTML('afterend',
          '<div class="sidesw grow" style="justify-content:center;flex:1">' +
          '<button type="button" class="on">발자국</button>' +
          '<button type="button" data-goadmin>운영진</button></div>');
        document.querySelector('[data-goadmin]').onclick = () => {
          try { localStorage.setItem('baljaguk.side', 'admin'); } catch (e) { }
          location.href = 'admin.html';
        };
      }
    }

    /* 다크 모드 버튼은 프로필 시트 안으로 옮기고, 그 자리에 프로필 동그라미 */
    const tb = document.querySelector('.topbar .in');
    const themeBtn = tb && tb.querySelector('[data-theme-btn]');
    if (themeBtn) themeBtn.hidden = true;
    if (tb && !tb.querySelector('#profBtn')) {
      tb.insertAdjacentHTML('beforeend',
        '<button id="profBtn" type="button" aria-label="내 프로필" ' +
        'style="border:none;background:none;padding:0;cursor:pointer">' +
        avatar(ME, 'tiny') + '</button>');
      tb.querySelector('#profBtn').onclick = profileSheet;
      loadAvatars(tb);
    }

    const sv0 = savedFilter();
    F.kind = sv0.kind; F.place = sv0.place;
    try { localStorage.setItem('baljaguk.side', 'app'); } catch (e) { }
    watchAvatars();
    /* 앱을 열었다고 적어 둔다 — 날짜 하나만, 하루 한 번 */
    DB.touchSeen && DB.touchSeen();
    go('home');
    paintTabDot();
    /* 알림을 눌러 들어왔으면 그 글·봉사·설문으로 바로 보낸다.
       (주소에 #post=… 가 붙어 오는데 아무도 읽지 않아 늘 홈만 열렸다) */
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    /* 알림을 눌렀을 때 서비스워커가 알려 준다 — 주소만 바뀌면 화면이 안 바뀌어서 */
    try {
      navigator.serviceWorker.addEventListener('message', e => {
        const u = e.data && e.data.type === 'goto' && e.data.url;
        if (!u) return;
        const i = String(u).indexOf('#');
        if (i < 0) return;
        location.hash = String(u).slice(i + 1);
        openFromHash();
      });
    } catch (e) { }
  }

  /* 주소 끝의 #post=… 를 보고 그 화면을 연다 */
  async function openFromHash() {
    const h = String(location.hash || '').replace(/^#/, '');
    if (!h) return;
    const m = /^(post|vol|poll|news)=(.+)$/.exec(h);
    /* 한 번 쓰고 지운다 — 다시 눌렀을 때 또 열리지 않게 */
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
    if (!m) return;
    const [, what, id] = m;
    if (what === 'post') { await openPost(decodeURIComponent(id)); return; }
    if (what === 'vol') { go('vol'); return; }
    if (what === 'poll') { go('poll'); return; }
    if (what === 'news') { go('me'); return; }
  }

  /* ---------- 아바타 사진 채우기 ----------
     비공개 보관함이라 볼 때마다 서명된 주소를 받아 와야 한다 */
  /* 커뮤니티도 같게 — 새로 생긴 자리를 지켜보다 알아서 채운다 */
  let avWatch = null;
  function watchAvatars() {
    if (avWatch || typeof MutationObserver !== 'function') return;
    let timer = null;
    avWatch = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (document.querySelector('[data-avatar]')) loadAvatars(document);
      }, 60);
    });
    avWatch.observe(document.body, { childList: true, subtree: true });
  }

  async function loadAvatars(root) {
    const els = Array.prototype.slice.call((root || document).querySelectorAll('[data-avatar]'));
    for (let i = 0; i < els.length; i++) {
      const el = els[i], path = el.getAttribute('data-avatar');
      el.removeAttribute('data-avatar');
      try {
        const url = await DB.community.avatarUrl(path);
        if (url) {
          el.style.backgroundImage = 'url("' + url + '")';
          el.classList.add('has-photo');
          /* 이니셜을 비운다 — CSS 로만 가리면 색조 규칙에 덮일 수 있다 */
          el.textContent = '';
        }
      } catch (e) { /* 한 장 실패해도 이니셜로 보인다 */ }
    }
  }

  /* ---------- 내 프로필 ---------- */
  /* ---------- 불편한 점 알려 주기 ----------
     운영진 할 일에 쌓인다. 신고와 섞지 않는다 — 성격이 다르다. */
  function ideaSheet() {
    const ov = sheet({
      title: '운영진에게 의견 보내기',
      body:
        '<p class="mut sm" style="margin-bottom:12px;line-height:1.65">' +
        '불편했던 것, 있었으면 하는 것을 적어주세요.<br>' +
        '운영진이 보고 하나씩 고쳐갈게요.</p>' +
        '<label class="field"><textarea class="input" id="ideaBody" rows="5" ' +
        'placeholder="예: 봉사 신청할 때 준비물이 안 보여요"></textarea></label>' +

        '<button type="button" class="check" id="ideaAnon" style="width:100%;text-align:left">' +
        '<span class="box tick" aria-hidden="true">' + ic('check') + '</span>' +
        '<span class="grow"><span class="sm" style="font-weight:700">이름 없이 보내기</span>' +
        '<span class="mut" style="display:block;font-size:11.5px;margin-top:2px;line-height:1.5">' +
        '누가 보냈는지 저장하지 않아요</span></span></button>' +
        /* 켰을 때만 보이는 한 줄 */
        '<p class="mut anonnote" id="anonNote" hidden ' +
        'style="font-size:11.5px;margin:8px 2px 0;line-height:1.55">' +
        '이름 없이 보내면 운영진이 답장할 수 없어요</p>' +

        /* 내가 보낸 의견과 답장 — 답장을 볼 곳이 없었다 */
        '<div id="myIdeas"></div>' +

        '<div class="sheet-foot">' +
        '<button class="btn primary lg block" type="button" id="ideaGo">보내기</button></div>'
    });

    const anonBtn = ov.querySelector('#ideaAnon');
    const note = ov.querySelector('#anonNote');
    anonBtn.onclick = () => {
      anonBtn.classList.toggle('on');
      note.hidden = !anonBtn.classList.contains('on');
    };

    /* 지난 의견과 답장 */
    (async () => {
      const box = ov.querySelector('#myIdeas');
      if (!box) return;
      let rows = null;
      try { rows = await DB.feedback.mine(); }
      catch (e) { console.warn('[발자국] 내 의견을 못 받아왔어요:', e); }
      const head = '<div class="divider" style="margin:18px 0 12px"></div>' +
        '<div class="sm" style="font-weight:700;margin-bottom:9px">내가 보낸 의견</div>';
      if (rows === null) {
        /* 못 받아온 것과 「없는 것」은 다르다 */
        box.innerHTML = head +
          '<div class="card center" style="padding:18px">' +
          '<div class="sm">불러오지 못했어요</div>' +
          '<button class="btn ghost sm" type="button" id="myIdeaRetry" ' +
          'style="margin-top:9px">다시 시도</button></div>';
        const rt = box.querySelector('#myIdeaRetry');
        if (rt) rt.onclick = () => { closeSheet(); setTimeout(ideaSheet, 180); };
        return;
      }
      if (!rows.length) {
        box.innerHTML = head +
          '<p class="mut sm" style="line-height:1.6">아직 보낸 의견이 없어요.<br>' +
          '이름 없이 보낸 의견은 여기 안 보여요.</p>';
        return;
      }
      box.innerHTML = head +
        '<p class="mut" style="font-size:11.5px;margin:-4px 0 9px">' +
        '이름 없이 보낸 의견은 여기 안 보여요</p>' +
        rows.map(f =>
          '<div class="card" style="padding:13px 14px;margin-bottom:8px">' +
          '<div class="sm mut" style="font-size:11.5px">' + fmtDateTime(f.created_at) + '</div>' +
          '<div class="sm" style="margin-top:5px;line-height:1.6;white-space:pre-wrap">' +
          esc(f.body) + '</div>' +
          (f.reply
            ? '<div class="replybox"><div class="lb">운영진 답장</div>' +
              '<div class="tx">' + esc(f.reply) + '</div></div>'
            : '<div class="mut" style="font-size:11.5px;margin-top:8px">' +
              (f.done ? '확인했어요' : '운영진이 확인하는 중이에요') + '</div>') +
          '</div>').join('');
    })();

    ov.querySelector('#ideaGo').onclick = async () => {
      const btn = ov.querySelector('#ideaGo');
      const t = ov.querySelector('#ideaBody').value.trim();
      if (!t) return toast('내용을 적어주세요', 'err');
      const anon = anonBtn.classList.contains('on');
      btn.disabled = true; btn.textContent = '보내는 중…';
      try {
        const r = await DB.feedback.send(t, anon);
        if (r && r.ok === false) {
          toast(r.why === 'toomany'
            ? '이름 없이 보내는 건 하루 세 번까지예요'
            : '보내지 못했어요', 'err');
          btn.disabled = false; btn.textContent = '보내기';
          return;
        }
        closeSheet();
        toast(anon ? '이름 없이 보냈어요' : '고마워요. 운영진이 볼게요', 'ok');
      } catch (e) {
        toast(e.message || '보내지 못했어요', 'err');
        btn.disabled = false; btn.textContent = '보내기';
      }
    };
  }

  /* ---------- 알림 설정 ----------
     켜고 끄기, 종류별 고르기, 나에게만 보내 보기.
     카톡 안 브라우저와 아이폰(홈 추가 전)은 받을 수 없어서 안내를 대신 보인다. */
  const NKINDS = [
    ['want_post',     '새 글',      '누가 글을 올리면'],
    ['want_comment',  '댓글',       '내 글에 댓글이 달리면'],
    ['want_reply',    '답글',       '내 댓글에 답글이 달리면'],
    ['want_reaction', '반응',       '내 글에 반응이 달리면'],
    ['want_vol',      '봉사 열림',  '새 봉사 신청이 열리면'],
    ['want_promoted', '대기 → 신청', '대기에서 자리가 나면'],
    ['want_notice',   '공지',       '운영진 공지'],
    ['want_poll',     '설문 마감',  '아직 참여 안 한 설문이 마감되기 전날'],
    ['want_quiz',     '퀴즈 결과',  '퀴즈 정답이 발표되면'],
    ['want_before',   '봉사 전날',  '전날 저녁 8시'],
    ['want_thanks',   '봉사 감사',  '다녀온 날']
  ];

  /* 미리보기 — 실제로 보내 보는 문구 */
  const NSAMPLE = {
    want_post:     ['이보호님이 새 글을 올렸어요', '오늘 처음 간 보금자리! 아이들이 생각보다 훨씬…'],
    want_comment:  ['이보호님이 댓글을 남겼어요', '다음엔 같이 가요'],
    want_reply:    ['이보호님이 내 댓글에 답글을 남겼어요', '저도요! 그날 봬요'],
    want_reaction: ['이보호님 외 2명이 내 후기에 반응했어요', '💗 🐾 👏'],
    want_vol:      ['봉사 신청이 열렸어요', '10/31(토) 13:00 금파하우스 · 선착순 8명'],
    want_promoted: ['자리가 났어요!', '10/31(토) 13:00 금파하우스 봉사에 신청됐어요. 못 가면 꼭 취소해 주세요'],
    want_notice:   ['[공지] 11월 정기모임 안내', '11/8(토) 오후 2시, 학생회관 3층이에요'],
    want_poll:     ['설문이 내일 마감돼요 · 아직 참여 전이에요', '다음 봉사는 언제가 좋을까요?'],
    want_quiz:     ['정답이에요! 🐾', '이 친구 이름은 뭘까요? → 단비였어요'],
    want_before:   ['내일(토) 13:00 금파하우스 봉사예요', '준비물: 목장갑, 편한 옷'],
    want_thanks:   ['오늘 와줘서 고맙다멍!', '덕분에 지루한 일상 속 웃음이 가득했다멍. 후기도 남겨 줄래멍?']
  };

  /* 체험 모드에서 알림이 어떻게 보이는지 — 화면 위에 띄워 준다 */
  function showBanner(title, body) {
    document.querySelectorAll('.pushban').forEach(x => x.remove());
    const el = document.createElement('div');
    el.className = 'pushban';
    el.innerHTML =
      '<span class="ic">' + ic('paw') + '</span>' +
      '<span class="tx"><span class="t">' + esc(title) + '</span>' +
      '<span class="b">' + esc(body) + '</span></span>';
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('in'));
    setTimeout(() => {
      el.classList.remove('in');
      setTimeout(() => el.remove(), 260);
    }, 4200);
    el.onclick = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 260); };
  }

  async function notifySheet() {
    const ov = sheet({ title: '알림 설정', body: '<div id="nBox">' + paws() + '</div>' });
    await paintNotify(ov.querySelector('#nBox'));
  }

  async function paintNotify(box) {
    if (!box) return;
    const st = Push.state();

    /* 받을 수 없는 경우 — 왜 그런지와 어떻게 하면 되는지만 */
    if (st !== 'granted') {
      box.innerHTML = notifyGuide(st);
      const go = box.querySelector('[data-nOn]');
      if (go) go.onclick = async () => {
        go.disabled = true; go.textContent = '여는 중…';
        try { await Push.enable(); await paintNotify(box); }
        catch (e) {
          toast(e.message || '켜지 못했어요', 'err');
          go.disabled = false; go.textContent = '알림 켜기';
        }
      };
      const out = box.querySelector('[data-nOut]');
      if (out) out.onclick = () => {
        if (!Push.openOutside()) {
          toast('오른쪽 아래 ··· 를 눌러 「Safari로 열기」를 골라주세요');
        }
      };
      return;
    }

    /* 받을 수 있는 경우 — 종류별로 */
    const sub = await Push.current();
    const ep = sub ? sub.endpoint : '';
    let prefs = null;
    try { prefs = await DB.push.prefs(ep); } catch (e) { }
    const on = k => !prefs || prefs[k] !== false;

    box.innerHTML =
      '<div class="row between" style="gap:8px;margin-bottom:14px">' +
      '<span class="sm" style="font-weight:700;color:var(--brand-deep)">' +
      ic('check') + ' 알림을 받고 있어요</span>' +
      '<button class="linkbtn" type="button" data-nOff>끄기</button></div>' +

      NKINDS.map(([k, label, when]) =>
        '<div class="nrow">' +
        '<div class="grow"><div class="t">' + label + '</div>' +
        '<div class="s">' + when + '</div></div>' +
        '<button class="linkbtn sm" type="button" data-ntest="' + k + '">보내 보기</button>' +
        '<button type="button" class="sw' + (on(k) ? ' on' : '') + '" ' +
        'data-nk="' + k + '" role="switch" aria-checked="' + (on(k) ? 'true' : 'false') +
        '" aria-label="' + label + ' 알림"><span></span></button></div>').join('') +

      '<p class="mut" style="font-size:11.5px;margin-top:14px;line-height:1.6">' +
      '이 기기에서만 적용돼요. 다른 폰에서도 받으려면 거기서도 켜주세요.</p>';

    box.querySelectorAll('[data-nk]').forEach(b => b.onclick = async () => {
      const k = b.dataset.nk;
      const next = !b.classList.contains('on');
      b.classList.toggle('on', next);
      b.setAttribute('aria-checked', next ? 'true' : 'false');
      try { await DB.push.setPref(ep, k, next); }
      catch (e) {
        b.classList.toggle('on', !next);
        toast(e.message || '바꾸지 못했어요', 'err');
      }
    });

    box.querySelectorAll('[data-ntest]').forEach(b => b.onclick = async () => {
      const k = b.dataset.ntest;
      const s = NSAMPLE[k] || ['발자국', ''];
      b.disabled = true;
      try {
        const r = await DB.push.test(k.replace('want_', ''), s[0], s[1]);
        /* 체험 모드는 실제로 못 보내니 화면 위에 배너로 보여준다 */
        if (r && r.demo) { showBanner(s[0], s[1]); }
        else toast('나에게만 보냈어요. 잠시 뒤 떠요', 'ok');
      } catch (e) {
        toast(e.message || '보내지 못했어요', 'err');
      } finally {
        setTimeout(() => { b.disabled = false; }, 1200);
      }
    });

    const off = box.querySelector('[data-nOff]');
    if (off) off.onclick = async () => {
      if (!await confirmSheet('알림을 끌까요?',
        '봉사 안내와 공지를 못 받게 돼요. 언제든 다시 켤 수 있어요.', '끄기')) return;
      try { await Push.disable(); await paintNotify(box); }
      catch (e) { toast(e.message || '끄지 못했어요', 'err'); }
    };
  }

  /* 왜 못 받는지 — 경우마다 다르게 */
  function notifyGuide(st) {
    const card = (icon, title, lines, btn) =>
      '<div class="card center" style="padding:24px 20px">' +
      '<div class="bigic">' + ic(icon) + '</div>' +
      '<h3 style="margin-top:12px;font-size:16px">' + title + '</h3>' +
      '<p class="mut sm" style="margin-top:8px;line-height:1.65">' + lines + '</p>' +
      (btn || '') + '</div>';

    if (st === 'off') {
      return card('clock', '알림은 곧 열려요',
        '준비가 끝나면 여기서 켤 수 있어요.');
    }
    if (st === 'inapp') {
      return card('alert', '카카오톡 안에서는 알림을 켤 수 없어요',
        '카카오톡 안 브라우저는 알림을 받지 못해요.<br>' +
        '크롬이나 사파리로 열어주세요.',
        '<button class="btn primary lg block" type="button" data-nOut style="margin-top:16px">' +
        '다른 브라우저로 열기</button>' +
        (Push.isIOS
          ? '<p class="mut" style="font-size:11.5px;margin-top:10px;line-height:1.6">' +
            '아이폰은 오른쪽 아래 <b>···</b> → <b>Safari로 열기</b> 를 눌러주세요.</p>'
          : ''));
    }
    if (st === 'needHome') {
      return card('download', '먼저 홈 화면에 추가해주세요',
        '아이폰은 홈 화면에 추가한 뒤에만 알림을 받을 수 있어요.<br><br>' +
        '아래 <b>공유</b> 버튼 → <b>홈 화면에 추가</b> → ' +
        '생긴 발바닥 아이콘으로 다시 들어와주세요.');
    }
    if (st === 'denied') {
      return card('alert', '알림이 꺼져 있어요',
        '브라우저 설정에서 이 사이트의 알림을 허용해주세요.<br>' +
        '주소창 왼쪽 자물쇠 → 알림 → 허용');
    }
    if (st === 'unsupported') {
      return card('alert', '이 브라우저는 알림을 못 받아요',
        '크롬이나 사파리에서 열어주세요.');
    }
    return card('alert', '알림을 켤까요?',
      '봉사 안내, 공지, 내 글에 달린 댓글을 바로 받아볼 수 있어요.<br>' +
      '종류별로 끄고 켤 수 있어요.',
      '<button class="btn primary lg block" type="button" data-nOn style="margin-top:16px">' +
      '알림 켜기</button>');
  }

  function profileSheet() {
    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    const ov = sheet({
      title: '내 프로필',
      body:
        '<div class="center">' +
        '<div class="prof-big" id="profBig"' +
        (ME.photo ? ' data-avatar="' + esc(ME.photo) + '"' : '') + '>' +
        esc(String(ME.name).slice(0, 1)) + '</div>' +
        '<div class="row center" style="gap:8px;margin-top:12px">' +
        '<button class="btn soft sm" type="button" id="pfPick">사진 바꾸기</button>' +
        (ME.photo ? '<button class="btn ghost sm" type="button" id="pfClear">사진 지우기</button>' : '') +
        '</div>' +
        '<input type="file" id="pfFile" accept="image/*" hidden>' +
        '<p class="mut" style="font-size:11.5px;margin-top:10px;line-height:1.6">' +
        '다른 사람 사진이나 부적절한 사진은 운영진이 지울 수 있어요.</p>' +
        '</div>' +

        '<div class="divider"></div>' +
        '<div class="kv"><span class="k">이름</span><span class="v">' + esc(ME.name) +
        (ME.role === 'admin' ? ' <span class="badge admin">운영진</span>' : '') + '</span></div>' +
        '<div class="kv"><span class="k">기수</span><span class="v">' + esc(genLabel()) + '</span></div>' +
        (ME.joined_on
          ? '<div class="kv"><span class="k">가입일</span><span class="v">' + fmtDate(ME.joined_on) + '</span></div>'
          : '') +

        '<button class="kv" type="button" id="pfMe" style="width:100%;border:none;background:none;' +
        'font-family:inherit;cursor:pointer;text-align:left">' +
        '<span class="k">내 활동</span><span class="v" id="pfSum">보러 가기 →</span></button>' +

        '<div class="divider"></div>' +
        '<div style="display:grid;gap:8px">' +
        (Push.hasKey
          ? '<button class="btn ghost block" type="button" id="pfBell">' +
            ic('alert') + '<span>알림 설정</span></button>'
          : '') +
        '<button class="btn ghost block" type="button" id="pfTheme">' +
        ic(dark ? 'sun' : 'moon') + '<span>' + (dark ? '밝게 보기' : '어둡게 보기') + '</span></button>' +
        '<a class="btn ghost block" href="guide.html?from=app">' + ic('clipboard') + '<span>사용법</span></a>' +
        '<button class="btn ghost block" type="button" id="pfIdea">' +
        ic('mail') + '<span>운영진에게 의견 보내기</span></button>' +
        /* 운영진 지원 — 이미 운영진이면 안 보인다 */
        '<div id="pfStaffWrap"></div>' +
        '<a class="btn ghost block" href="privacy.html?from=app">' + ic('lock') + '<span>개인정보 처리방침</span></a>' +
        '<button class="btn ghost block" type="button" id="pfOut">로그아웃</button>' +
        '</div>'
    });

    loadAvatars(ov);

    const bell = ov.querySelector('#pfBell');
    if (bell) bell.onclick = () => { closeSheet(); setTimeout(notifySheet, 180); };

    /* 운영진 지원 줄 — 상태에 따라 글이 달라진다 */
    (async () => {
      const wrap = ov.querySelector('#pfStaffWrap');
      if (!wrap) return;
      let st = null;
      try { st = await DB.feedback.myStaffApply(); }
      catch (e) { console.warn('[발자국] 지원 상태를 못 받아왔어요:', e); return; }
      if (!st || st.is_admin) return;        /* 이미 운영진이면 안 보인다 */
      if (st.pending) {
        wrap.innerHTML = '<div class="btn ghost block" style="cursor:default;opacity:.75">' +
          ic('clock') + '<span>지원 확인 중이에요</span></div>';
        return;
      }
      wrap.innerHTML = '<button class="btn ghost block" type="button" id="pfStaff">' +
        ic('star') + '<span>운영진 지원하기</span></button>';
      const b = wrap.querySelector('#pfStaff');
      if (b) b.onclick = () => { closeSheet(); setTimeout(staffApplySheet, 180); };
    })();

    const idea = ov.querySelector('#pfIdea');
    if (idea) idea.onclick = () => { closeSheet(); setTimeout(ideaSheet, 180); };

    /* 봉사 횟수·적립을 한 줄로 */
    DB.myActivity().then(a => {
      const el = ov.querySelector('#pfSum');
      if (!el || !a) return;
      const bits = [];
      if (a.times) bits.push(num(a.times) + '회');
      if (a.credit_total) bits.push(won(a.credit_total));
      if (a.credit_total_kg) bits.push(credit(a.credit_total_kg, 'kg'));
      el.textContent = (bits.length ? bits.join(' · ') + ' →' : '보러 가기 →');
    }).catch(() => { });

    ov.querySelector('#pfMe').onclick = () => { closeSheet(); go('me'); };
    ov.querySelector('#pfOut').onclick = () => { DB.memberLogout(); location.reload(); };
    ov.querySelector('#pfTheme').onclick = () => { UI.toggleTheme(); closeSheet(); };

    const file = ov.querySelector('#pfFile');
    ov.querySelector('#pfPick').onclick = () => file.click();
    file.addEventListener('change', async e => {
      const f = (e.target.files || [])[0];
      if (!f) return;
      const big = ov.querySelector('#profBig');
      try {
        const src = await cropSquare(f, 400, .86);
        big.style.backgroundImage = 'url("' + src + '")';
        big.classList.add('has-photo');
        const path = await DB.community.setMyPhoto(src);
        ME.photo = path;
        toast('사진을 바꿨어요', 'ok');
        refreshProfileBtn();
      } catch (err) { toast(err.message || '사진을 바꾸지 못했어요', 'err'); }
    });

    const clr = ov.querySelector('#pfClear');
    if (clr) clr.onclick = async () => {
      try {
        await DB.community.setMyPhoto('');
        ME.photo = null;
        closeSheet();
        toast('사진을 지웠어요');
        refreshProfileBtn();
      } catch (e) { toast(e.message || '지우지 못했어요', 'err'); }
    };
  }

  function refreshProfileBtn() {
    const btn = document.querySelector('#profBtn');
    if (!btn) return;
    btn.innerHTML = avatar(ME, 'tiny');
    loadAvatars(btn);
  }

  function go(tab) {
    cur = tab;
    $$('#tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    /* 홈에서는 후기 쓰기, 설문 탭에서는 설문 만들기 (운영진만) */
    const fab = $('#fab');
    const showFab = tab === 'home' || (tab === 'poll' && AM_ADMIN);
    fab.hidden = !showFab;
    fab.setAttribute('aria-label', tab === 'poll' ? '설문 만들기' : '글쓰기');
    fab.onclick = () => (tab === 'poll' ? pollSheet() : writeSheet());
    window.scrollTo(0, 0);
    if (tab === 'home') return renderHome(true);
    if (tab === 'vol') return renderVol();
    if (tab === 'poll') return renderPolls();
    return renderMe();
  }

  const paint = html => { $('#view').innerHTML = html; };
  /* 글자 대신 카드 모양으로 — 무엇이 올지 미리 보이게 */
  const skel = n => {
    let out = '';
    for (let i = 0; i < (n || 2); i++) {
      out += '<div class="skel" style="margin-bottom:10px">' +
        '<div class="ln w40"></div><div class="ln w70"></div>' +
        '<div class="ln tall"></div></div>';
    }
    return out;
  };
  const paws = () => '<div class="paws" role="status" aria-label="불러오는 중">' +
    '<i>' + ic('paw') + '</i><i>' + ic('paw') + '</i><i>' + ic('paw') + '</i></div>';
  const loading = n => skel(n) + paws();

  /* ============================================================
     홈 — 피드
     ============================================================ */
  async function renderHome(reset) {
    if (reset) {
      F.rows = []; F.cursor = null; F.done = false;
      const sv = savedFilter();
      if (F.kind === undefined || F.kind === null) { F.kind = sv.kind; F.place = sv.place; }
    }
    $('#headTitle').textContent = '안녕하세요, ' + ME.name + '님';
    $('#headLead').textContent = '우리가 함께 걸은 기록이에요.';

    paint(
      '<div id="pin"></div>' +
      '<div id="ask"></div>' +
      '<div class="titlerow">' +
      '<div class="chipwrap"><div class="chips" id="chips"></div></div>' +
      '<button class="iconbtn sq" type="button" id="wallBtn" aria-label="사진 모아보기">' +
      ic('grid') + '</button></div>' +
      '<div id="list">' + loading() + '</div>' +
      '<div id="more"></div>');
    $('#wallBtn').onclick = photoWall;

    paintChips();
    await loadMore(true);
  }

  /* ---------- 홈 필터 ----------
     전체 · 봉사지별 · 자유게시판 셋뿐이다.
     「후기」는 봉사지별이 하고, 「설문」은 하단 설문 탭이 한다. */
  const FKEY = 'baljaguk.homeFilter';
  function savedFilter() {
    try { return JSON.parse(localStorage.getItem(FKEY) || 'null') || { kind: 'all', place: '' }; }
    catch (e) { return { kind: 'all', place: '' }; }
  }
  function saveFilter(v) {
    try { localStorage.setItem(FKEY, JSON.stringify(v)); } catch (e) { }
  }

  function paintChips() {
    const chip = (on, label, attr) =>
      '<button type="button" class="chip' + (on ? ' on' : '') + '" ' + attr + '>' + label + '</button>';

    $('#chips').innerHTML =
      chip(F.kind === 'all', '전체', 'data-f="all"') +
      (F.kind === 'place' && F.place
        ? chip(true, '봉사지: ' + esc(F.place) + ' <span class="x">✕</span>', 'data-f="clear"')
        : chip(false, '봉사지별', 'data-f="place"')) +
      chip(F.kind === 'free', '자유게시판', 'data-f="free"');

    $$('#chips [data-f]').forEach(b => b.addEventListener('click', async () => {
      const k = b.dataset.f;
      if (k === 'place') return placeSheet();
      if (k === 'clear') { F.kind = 'all'; F.place = ''; }
      else { F.kind = k; F.place = ''; }
      saveFilter({ kind: F.kind, place: F.place });
      await renderHome(true);
    }));
  }

  /* 봉사지는 수가 늘어날 수 있어 칩으로 늘어놓지 않고 시트에서 고른다 */
  async function placeSheet() {
    const list = placeInfo();
    const ov = sheet({
      title: '어느 봉사지를 볼까요?',
      body: '<div id="plList" class="mut sm">' + paws() + '</div>'
    });
    let counts = {};
    try {
      const r = await DB.community.feed({ type: 'review', limit: 50 });
      (r && r.rows || []).forEach(x => {
        if (x.place) counts[x.place] = (counts[x.place] || 0) + 1;
      });
    } catch (e) { }
    ov.querySelector('#plList').innerHTML = list.length
      ? list.map(p =>
        '<button class="row56" type="button" data-place="' + esc(p.name) + '">' +
        '<span class="ic" style="width:38px;height:38px;border-radius:13px;display:grid;' +
        'place-items:center;background:var(--brand-soft);color:var(--brand-deep)">' +
        ic('home') + '</span>' +
        '<span class="mid"><span class="t">' + esc(p.name) + '</span>' +
        (p.area ? '<span class="s">' + esc(p.area) + '</span>' : '') + '</span>' +
        '<span class="end">후기 ' + (counts[p.name] || 0) + '개' + ic('chevron') + '</span>' +
        '</button>').join('')
      : '<div class="mut sm">봉사지가 아직 없어요</div>';

    ov.querySelectorAll('[data-place]').forEach(b => b.onclick = async () => {
      F.kind = 'place'; F.place = b.dataset.place;
      saveFilter({ kind: F.kind, place: F.place });
      closeSheet();
      await renderHome(true);
    });
  }

  /* 설정에 적힌 봉사지 전체 정보 */
  function placeInfo() {
    const s = (window.__settings || {});
    let raw = s.places;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    return (Array.isArray(raw) ? raw : []).map(x => (typeof x === 'string'
      ? { name: x, area: '', address: '', credit: 0, unit: 'won', bring: '', note: '' }
      : {
        name: String((x && x.name) || '').trim(),
        area: String((x && x.area) || ''),
        address: String((x && x.address) || ''),
        credit: Number((x && x.credit) || 0) || 0,
        unit: (x && x.unit) === 'kg' ? 'kg' : 'won',
        bring: String((x && x.bring) || ''),
        note: String((x && x.note) || '')
      })).filter(x => x.name);
  }

  function placeList() {
    const s = (window.__settings || {});
    /* 설정의 봉사지는 {name, credit, unit} 모양이다. 예전 자료는 문자열일 수 있다 */
    let raw = s.places;
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    const fromSettings = (Array.isArray(raw) ? raw : [])
      .map(x => (typeof x === 'string' ? x : String((x && x.name) || '')).trim())
      .filter(Boolean);
    if (fromSettings.length) return fromSettings;
    const seen = [];
    F.rows.forEach(r => { if (r.place && seen.indexOf(r.place) < 0) seen.push(r.place); });
    return seen;
  }

  async function loadMore(first) {
    if (F.busy || F.done) return;
    F.busy = true;
    let res;
    try {
      res = await DB.community.feed({
        cursor: F.cursor,
        type: F.kind === 'free' ? 'free' : (F.kind === 'place' ? 'review' : null),
        place: F.kind === 'place' ? F.place : null,
        limit: 20
      });
    } catch (e) {
      F.busy = false;
      /* 로그인이 풀린 것이면 「연결이 엉켰다」가 아니라 그렇다고 말한다 */
      if (e && e.code === 'noauth') {
        $('#list').innerHTML =
          '<div class="card center" style="padding:28px 22px">' +
          illus('error') +
          '<h3 style="margin-top:12px;font-size:16px">로그인이 풀렸어요</h3>' +
          '<p class="mut sm" style="margin-top:7px">다시 들어와 주세요</p>' +
          '<div style="margin-top:15px">' +
          '<button class="btn primary" type="button" data-relogin>다시 들어가기</button></div></div>';
        const lb = $('#list').querySelector('[data-relogin]');
        if (lb) lb.onclick = () => { try { DB.memberLogout(); } catch (err) { } location.reload(); };
        return;
      }
      if (first) {
        $('#list').innerHTML =
          '<div class="card center" style="padding:28px 22px">' +
          illus('error') +
          '<h3 style="margin-top:12px;font-size:16px">잠깐 연결이 엉켰어요</h3>' +
          '<p class="mut sm" style="margin-top:7px">잠시 뒤 다시 해볼까요?</p>' +
          '<div style="margin-top:15px">' +
          '<button class="btn primary" type="button" data-retry>다시 시도</button></div></div>';
        const rb = $('#list').querySelector('[data-retry]');
        if (rb) rb.onclick = () => renderHome(true);
      }
      return;
    }
    F.busy = false;
    if (!res) return;

    /* 발표 시각이 지난 퀴즈가 있으면 먼저 처리하고 다시 그린다 */
    /* 퀴즈 발표는 pg_cron(push_tick) 이 5분마다 한다 —
       보는 사람 화면이 쓰기와 알림까지 하면 두 곳이 같은 일을 한다 */

    if (first) paintReviewAsk();

    if (first) {
      /* 공지는 세 개까지라 여기에 다 보인다 — 「모두 보기」가 필요 없다 */
      const pins = res.pinned || [];
      F.pins = pins;
      $('#pin').innerHTML = pins.map(pinnedCard).join('');
    }

    const rows = res.rows || [];
    F.rows = F.rows.concat(rows);
    F.cursor = res.cursor || null;
    if (rows.length < 20) F.done = true;

    if (!F.rows.length) {
      $('#list').innerHTML = emptyFeed();
      const b = $('#list').querySelector('[data-write]');
      if (b) b.onclick = () => writeSheet();
      return;
    }
    $('#list').innerHTML = F.rows.map(postCard).join('');
    bindOnce();
    loadAvatars($('#list'));
    paintChips();
    paintMoreButton();
    loadPhotos($('#list'));
    wireCbar($('#list'));
    clipCheck($('#list'));
  }

  function paintMoreButton() {
    $('#more').innerHTML = F.done ? '' :
      '<button class="btn ghost block" id="moreBtn">더 보기</button>';
    const b = $('#moreBtn');
    if (b) b.onclick = async () => { b.disabled = true; b.textContent = '불러오는 중…'; await loadMore(false); };
  }

  function emptyFeed() {
    const free = F.kind === 'free';
    return '<div class="card center" style="padding:28px 22px">' +
      illus('emptyFeed') +
      '<h3 style="margin-top:12px;font-size:17px">' +
      (free ? '아직 올라온 글이 없어요'
        : (F.kind === 'place' ? '이 봉사지 후기가 아직 없어요' : '아직 후기가 없어요')) + '</h3>' +
      '<p class="mut sm" style="margin-top:7px;line-height:1.6">' +
      (free ? '일상도, 궁금한 것도 편하게 올려주세요.'
        : '다녀온 날과 보호소를 고르면 금방 써져요.') + '</p>' +
      '<div style="margin-top:15px">' +
      '<button class="btn primary" type="button" data-write>' +
      (free ? '첫 글 쓰기' : '첫 후기 쓰기') + '</button></div></div>';
  }

  /* 맨 위 고정 공지 — 있을 때만 */
  /* 공지는 한 줄로 접어 둔다. 셋이 펼쳐져 있으면 첫 화면이 공지로 꽉 차서
     정작 피드가 안 보인다. 누르면 그 자리에서 펼쳐진다. */
  function pinnedCard(p) {
    return '<button class="pinrow" type="button" data-pin="' + esc(p.id) + '">' +
      '<span class="ic">' + ic('megaphone') + '</span>' +
      '<span class="tx">' + esc(cut(p.body, 34)) + '</span>' +
      '<span class="ar">' + ic('chevron') + '</span></button>';
  }

  /* ---------- 후기 남기기 권유 ----------
     봉사를 다녀왔는데 아직 안 썼으면 홈 맨 위에 한 번 묻는다.
     나에게만 보이고, 쓰거나 「괜찮아요」를 누르면 사라진다. */
  const SKIP_KEY = 'baljaguk.reviewSkip';
  const skipped = () => {
    try { return JSON.parse(localStorage.getItem(SKIP_KEY) || '[]'); }
    catch (e) { return []; }
  };
  const skipReview = id => {
    try {
      const l = skipped(); l.push(String(id));
      localStorage.setItem(SKIP_KEY, JSON.stringify(l.slice(-30)));
    } catch (e) { }
  };

  /* 오늘·어제는 그렇게 부르고, 그 전은 날짜로 */
  function whenWord(date) {
    const d = String(date || '').slice(0, 10);
    const today = DB.today();
    if (d === today) return '오늘';
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (d === y) return '어제';
    const t = new Date(d + 'T00:00:00');
    return (t.getMonth() + 1) + '월 ' + t.getDate() + '일';
  }

  async function paintReviewAsk() {
    const box = $('#ask');
    if (!box) return;
    let r = null;
    try { r = await DB.community.reviewPrompt(); } catch (e) { }
    if (!r || skipped().indexOf(String(r.event_id)) >= 0) { box.innerHTML = ''; return; }

    box.innerHTML =
      '<div class="card askcard">' +
      '<span class="paw">' + ic('paw') + '</span>' +
      '<span class="tx">' + whenWord(r.date) + ' ' + esc(r.place || '') +
      ' 봉사 어땠어요?</span>' +
      '<button class="go" type="button" data-ask="' + esc(r.event_id) + '">후기 쓰기</button>' +
      '<button class="no" type="button" data-askno="' + esc(r.event_id) + '" ' +
      'aria-label="괜찮아요">✕</button>' +
      '</div>';
  }

  /* 공지 한 줄을 누르면 그 자리에서 펼친다. 다시 누르면 접는다. */
  function togglePin(id) {
    const row = $('#pin [data-pin="' + id + '"]');
    if (!row) return missWarn('공지 줄', id);
    const open = row.nextElementSibling &&
      row.nextElementSibling.classList.contains('pinfull');
    $$('#pin .pinfull').forEach(x => x.remove());
    $$('#pin .pinrow').forEach(x => x.classList.remove('on'));
    if (open) return;
    const p = (F.pins || []).find(x => String(x.id) === String(id));
    if (!p) return missWarn('공지', id);
    row.classList.add('on');
    row.insertAdjacentHTML('afterend',
      /* 「글로 열기」는 없앴다 — 펼치면 여기서 다 보이고,
         글로 가 봐야 같은 내용이라 갈 곳이 없었다 (선고은님 확인) */
      '<div class="pinfull">' + esc(p.body) +
      '<div class="who">' + esc(p.author || '운영진') + ' · ' + relTime(p.created_at) + '</div></div>');
  }

  const cut = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };

  /* ---------- 글 한 장 ---------- */
  function postCard(p) {
    const who = p.author || { name: '?' };
    /* 질문은 모양이 다르다 — 사진·반응·설문 줄 없이 한눈에 */
    if (p.question) return questionCard(p);

    /* 인스타 피드처럼 — 사람 줄 → 사진 → 아이콘 줄 → 본문 → 댓글 */
    const body = String(p.body || '');
    /* 두 줄을 넘는지는 그려 봐야 안다 — 일단 접어 두고,
       그릴 때 실제로 안 넘치면 「더 보기」를 치운다 (clipCheck) */
    const long = !!body;

    return '<article class="card post" data-post="' + esc(p.id) + '">' +
      '<div class="who">' +
      '<button class="facebtn" type="button" data-peek="' + esc(who.id || '') + '" ' +
      'data-pname="' + esc(who.name) + '" data-pphoto="' + esc(who.photo || who.photo_path || '') + '" ' +
      'data-prole="' + esc(who.role || '') + '" aria-label="' + esc(who.name) + ' 프로필">' +
      avatar(who) + '</button>' +
      '<div class="grow"><div class="nm">' + esc(who.name) +
      (who.role === 'admin' ? ' <span class="badge admin">운영진</span>' : '') + '</div>' +
      '<div class="at">' + relTime(p.created_at) +
      (p.edited_at ? ' · 수정됨' : '') + '</div></div>' +
      '<button class="iconbtn sq" type="button" data-menu="' + esc(p.id) + '" aria-label="이 글 메뉴">' +
      ic('more') + '</button></div>' +

      (p.type === 'notice'
        ? '<div class="meta">' + ic('pin') + '공지</div>'
        : (p.date || p.place
          ? '<div class="meta">' + ic('calendar') +
          (p.date ? fmtDate(p.date) : '') +
          (p.place ? (p.date ? ' · ' : '') + esc(p.place) : '') + '</div>'
          : '')) +

      /* 사진이 먼저 — 두 번 톡 누르면 하트 */
      photoStrip(p) +

      /* 하트 · 말풍선 · 좋아요 n개 */
      actionRow(p) +

      /* 본문은 두 줄까지, 길면 「더 보기」 */
      (body
        ? '<div class="bdwrap">' +
          '<div class="bd' + (long ? ' clip' : '') + '" data-body="' + esc(p.id) + '">' +
          esc(body) + '</div>' +
          (long ? '<button class="morebd" type="button" data-more="' + esc(p.id) + '">더 보기</button>' : '') +
          '</div>'
        : '') +

      /* 댓글 n개 모두 보기 — 본문 다음에 */
      ((p.comment_count || 0)
        ? '<button class="morecmt" type="button" data-cmt="' + esc(p.id) + '">' +
          '댓글 ' + num(p.comment_count) + '개 모두 보기</button>'
        : '') +

      ((p.photos || []).length && p.insta_ok
        ? '<div class="mut" style="font-size:11.5px;margin-top:7px">' +
        '인스타그램 사용에 동의한 사진이에요</div>'
        : '') +
      animalChips(p) +
      (p.poll ? pollBlock(p) : '') +
      commentBlock(p) +
      '</article>';
  }

  /* 하트 · 말풍선 한 줄 — 인스타처럼.
     하트를 길게 누르면 다른 반응(🐾👏…)을 고를 수 있다. */
  function actionRow(p) {
    const counts = p.reactions || {};
    const mine = p.my_reactions || [];
    const total = KINDS.reduce((t, k) => t + (counts[k] || 0), 0);
    const iLike = mine.indexOf('heart') >= 0;
    /* 이모지는 기기마다 모양이 달라진다 — 선 아이콘으로 그린다.
       이모지는 길게 눌러 고르는 반응 다섯 가지에만 쓴다. */
    return '<div class="acts" data-acts="' + esc(p.id) + '">' +
      '<button class="act' + (iLike ? ' on' : '') + '" type="button" ' +
      'data-heart="' + esc(p.id) + '" aria-label="좋아요" ' +
      'aria-pressed="' + (iLike ? 'true' : 'false') + '">' +
      ic('heart') + '</button>' +
      '<button class="act" type="button" data-cmt="' + esc(p.id) + '" aria-label="댓글">' +
      ic('bubble') + '</button>' +
      '</div>' +
      (total
        ? '<button class="likes" type="button" data-who="' + esc(p.id) + '">' +
          '좋아요 ' + num(total) + '개</button>'
        : '') +
      '';
  }

  /* ============================================================
     카드 아래 댓글 입력줄
     ------------------------------------------------------------
     누르고 들어가지 않고 그 자리에서 바로 쓴다.
     보낸 것은 먼저 화면에 올리고(낙관적), 실패하면 되돌린다.
     ============================================================ */
  function wireCbar(root) {
    const box = root || document;

    box.querySelectorAll('[data-cbar]').forEach(inp => {
      if (inp.__wired) return;
      inp.__wired = true;
      const id = inp.dataset.cbar;
      const send = box.querySelector('[data-csend="' + id + '"]');
      /* @ 로 사람 부르기 — 카드에서 바로 쓸 때도 */
      const ment = attachMention(inp, box.querySelector('[data-cmenu-for="' + id + '"]'));

      const refresh = () => {
        const has = !!inp.value.trim();
        if (send) { send.disabled = !has; send.classList.toggle('on', has); }
      };
      inp.addEventListener('input', refresh);

      /* 키보드가 올라오면 이 줄이 그 바로 위에 보이게 */
      inp.addEventListener('focus', () => {
        /* 쓰는 동안 + 버튼을 숨긴다 — 「게시」를 가린다 */
        const fab = $('#fab'); if (fab) fab.classList.add('typing');
        setTimeout(() => {
          try { inp.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { }
        }, 220);
      });
      inp.addEventListener('blur', () => {
        const fab = $('#fab'); if (fab) fab.classList.remove('typing');
      });

      UI.onEnter(inp, post);
      if (send) send.onclick = post;

      async function post() {
        const v = inp.value.trim();
        if (!v) return;
        const row = findRow(id);
        if (!row) return missWarn('글', id);

        /* 먼저 화면에 올린다 */
        const before = (row.recent_comments || []).slice();
        const beforeN = row.comment_count || 0;
        const mine = {
          id: 'tmp-' + Date.now(), created_at: new Date().toISOString(),
          body: v, hidden: false, mine: true,
          author: { id: ME.id, name: ME.name, role: ME.role, photo: ME.photo }
        };
        row.recent_comments = before.concat([mine]).slice(-2);
        row.comment_count = beforeN + 1;
        /* 먼저 비우고 키보드를 내린다 —
           다시 그리면 이 칸은 떨어져 나가 그때 비워도 소용없다 */
        inp.value = '';
        refresh();
        try { inp.blur(); } catch (e) { }
        paintCards(id);

        try {
          const made = await DB.community.addComment(id, v);
          const ids = ment ? ment.ids(v) : [];
          if (ids.length) {
            try { await DB.community.mentionAdd(ids, id, (made && made.id) || null, v.slice(0, 120)); }
            catch (err) { console.warn('[발자국] 언급을 못 적었어요:', err); }
          }
          if (ment) ment.clear();
          /* 보낸 뒤 그 글 댓글만 다시 받아 온다 —
             임시로 올린 줄을 진짜 줄로 바꾸고, 답글까지 센다.
             (「나갔다 들어와야 반영되는」 것을 막는다) */
          await refreshComments(id);
        } catch (e) {
          /* 되돌린다 */
          row.recent_comments = before;
          row.comment_count = beforeN;
          paintCards(id);
          const back = $('#view').querySelector('[data-cbar="' + id + '"]');
          if (back) { back.value = v; back.focus(); }
          toast(e.message || '남기지 못했어요', 'err');
        }
      }
    });
  }

  /* 그 글 댓글만 다시 받아 카드 숫자·최근 댓글을 맞춘다.
     어느 입력칸에서 달았든 이것 하나만 부르면 된다. */
  async function refreshComments(id) {
    const row = findRow(id);
    if (!row) return;
    try {
      const rows = await DB.community.comments(id);
      const live = (rows || []).filter(c => !c.hidden);
      row.comment_count = live.length;
      row.recent_comments = live.slice(-2);
      paintCards(id);
    } catch (e) {
      console.warn('[발자국] 댓글을 다시 받지 못했어요:', e);
    }
  }

  /* 한 카드의 댓글 자리만 다시 그린다 — 피드 자리를 지키려고 */
  function paintCards(id) {
    const row = findRow(id);
    if (!row) return;
    const wrap = $('#view').querySelector('[data-cmts="' + id + '"]');
    if (!wrap) return;
    /* 쓰던 글은 지키되, 방금 보낸 뒤라면 비어 있다 */
    const keep = wrap.querySelector('[data-cbar="' + id + '"]');
    const text = keep ? keep.value : '';
    const hadFocus = keep && document.activeElement === keep;
    wrap.outerHTML = commentBlock(row);
    const fresh = $('#view').querySelector('[data-cmts="' + id + '"]');
    if (fresh) {
      wireCbar(fresh);
      loadAvatars(fresh);
      clipCheck(fresh);
      const inp = fresh.querySelector('[data-cbar="' + id + '"]');
      if (inp && text) {
        inp.value = text;
        inp.dispatchEvent(new Event('input'));
        if (hadFocus) inp.focus();
      }
    }
    /* 「댓글 n개 모두 보기」 숫자도 맞춘다 */
    const acts = $('#view').querySelector('[data-acts="' + id + '"]');
    if (acts && acts.parentElement) {
      const more = acts.parentElement.querySelector('.morecmt[data-cmt="' + id + '"]');
      if (more) more.textContent = '댓글 ' + num(row.comment_count || 0) + '개 모두 보기';
    }
  }

  /* 본문이 두 줄을 정말 넘는지 보고, 안 넘치면 「더 보기」를 치운다 */
  function clipCheck(root) {
    (root || document).querySelectorAll('.bd.clip').forEach(bd => {
      if (bd.scrollHeight <= bd.clientHeight + 1) {
        bd.classList.remove('clip');
        const btn = bd.parentElement &&
          bd.parentElement.querySelector('.morebd[data-more="' + bd.dataset.body + '"]');
        if (btn) btn.remove();
      }
    });
  }

  /* ============================================================
     @ 로 사람 부르기 — 어느 입력칸에나 붙인다
     ------------------------------------------------------------
     댓글칸에도, 글쓰기 본문칸에도 같은 것을 쓴다.
     고른 사람은 이름 → id 로 챙겨 둔다 (동명이인 때문에).
     봉사 후기를 쓸 때는 그 봉사에 다녀온 사람을 맨 위에 올린다.
     ============================================================ */
  function attachMention(inp, menu, opts) {
    if (!inp || !menu) return null;
    const o = opts || {};
    const picked = new Map();     /* 이름 → id */
    let timer = null;

    /* 맨 위에 올릴 사람들 (봉사 참석자).
       ------------------------------------------------------------
       예전에는 mentionPeople('') 로 받은 **이름순 20명**에서 걸렀다.
       같이 간 사람이 21번째 뒤면 맨 위로 안 왔다.
       이제 그 사람들만 따로 받는다. */
    let first = [];
    if (o.firstIds && o.firstIds.length) {
      (async () => {
        try {
          const got = [];
          /* 참석자가 많아도 이름으로 하나씩 찾지 않는다 —
             봉사에 다녀온 사람 목록을 그대로 쓴다 */
          if (o.firstPeople && o.firstPeople.length) {
            o.firstPeople.forEach(x => got.push(x));
          } else {
            const all = await DB.community.mentionPeople('');
            (all || []).forEach(x => { if (o.firstIds.indexOf(x.id) >= 0) got.push(x); });
          }
          first = got;
        } catch (e) { }
      })();
    }

    function close() { menu.hidden = true; }

    inp.addEventListener('input', () => {
      const upto = inp.value.slice(0, inp.selectionStart);
      const m = /@([^\s@]{0,12})$/.exec(upto);
      clearTimeout(timer);
      if (!m) return close();
      timer = setTimeout(async () => {
        let people = [];
        try { people = await DB.community.mentionPeople(m[1]) || []; } catch (e) { }
        /* 같이 간 사람을 맨 위로 */
        if (first.length) {
          const q = m[1];
          const top = first.filter(x => !q || x.name.indexOf(q) >= 0);
          const ids = top.map(x => x.id);
          people = top.concat(people.filter(x => ids.indexOf(x.id) < 0));
        }
        if (!people.length) return close();
        menu.innerHTML = people.slice(0, 6).map((x, i) =>
          '<button class="mentrow" type="button" data-mid="' + esc(x.id) + '" ' +
          'data-mname="' + esc(x.name) + '">' +
          avatar(x) + '<span>' + esc(x.name) + '</span>' +
          (first.length && i < first.length
            ? '<span class="mut" style="font-size:11px">같이 간 사람</span>' : '') +
          '</button>').join('');
        menu.hidden = false;
        loadAvatars(menu);
      }, 160);
    });

    menu.addEventListener('click', e => {
      const b = e.target.closest('[data-mid]');
      if (!b) return;
      const nm = b.dataset.mname;
      picked.set(nm, b.dataset.mid);
      const at = inp.selectionStart;
      const before = inp.value.slice(0, at).replace(/@([^\s@]{0,12})$/, '@' + nm + ' ');
      const after = inp.value.slice(at);
      inp.value = before + after;
      close();
      inp.focus();
      try { inp.setSelectionRange(before.length, before.length); } catch (err) { }
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });

    return {
      /* 글에 아직 남아 있는 이름만 돌려준다 — 지웠으면 안 부른다 */
      ids(text) {
        const out = [];
        picked.forEach((id, nm) => { if (String(text || '').indexOf('@' + nm) >= 0) out.push(id); });
        return out;
      },
      add(nm, id) { picked.set(nm, id); },
      async byName(nm) {
        try {
          const people = await DB.community.mentionPeople(nm);
          const hit = (people || []).find(x => x.name === nm);
          if (hit) picked.set(nm, hit.id);
        } catch (e) { }
      },
      clear() { picked.clear(); close(); },
      close
    };
  }

  /* 글을 올린 뒤 @ 로 부른 사람에게 알린다 */
  async function tellMentioned(made, ids, text) {
    if (!ids || !ids.length) return;
    const pid = (made && made.id) || null;
    if (!pid) return;
    try {
      await DB.community.mentionAdd(ids, pid, null, String(text || '').slice(0, 120));
    } catch (e) {
      console.warn('[발자국] 언급을 못 적었어요:', e);
    }
  }

  /* ============================================================
     사람 보기 — 카카오톡처럼 프로필을 누르면 크게
     ------------------------------------------------------------
     이름·사진·기수만 보인다.
     연락처·학번·봉사 기록은 구성원끼리 보이지 않는다.
     ============================================================ */
  async function peekPerson(opts) {
    const o = opts || {};
    const name = o.name || '?';
    const ov = sheet({
      title: '',
      body:
        '<div class="peek">' +
        '<div class="peek-face" id="peekFace"' +
        (o.photo ? ' data-avatar="' + esc(o.photo) + '"' : '') + '>' +
        esc(name.slice(0, 1)) + '</div>' +
        '<div class="peek-name">' + esc(name) +
        (o.role === 'admin' ? ' <span class="badge admin">운영진</span>' : '') + '</div>' +
        '<div class="peek-sub" id="peekSub"></div>' +
        '</div>'
    });
    loadAvatars(ov);

    /* 기수는 따로 받아 온다 — 없으면 안 보인다 */
    if (o.gen) {
      ov.querySelector('#peekSub').textContent = o.gen + '기';
    } else if (o.id) {
      try {
        const people = await DB.community.mentionPeople(name);
        const hit = (people || []).find(x => x.id === o.id);
        if (hit && hit.gen) ov.querySelector('#peekSub').textContent = hit.gen + '기';
      } catch (e) { }
    }

    /* 사진을 누르면 크게 — 두 손가락으로 키울 수 있다 */
    const face = ov.querySelector('#peekFace');
    if (face && o.photo) {
      face.style.cursor = 'zoom-in';
      face.onclick = async () => {
        let url = '';
        try { url = await DB.community.avatarUrl(o.photo); } catch (e) { }
        if (!url) return;
        const big = document.createElement('div');
        big.className = 'shotview';
        big.innerHTML =
          '<button class="x" type="button" aria-label="닫기">' + ic('x') + '</button>' +
          '<div class="shotview-track"><img src="' + esc(url) + '" alt="' + esc(name) + '"></div>';
        document.body.appendChild(big);
        document.body.style.overflow = 'hidden';
        const shut = () => { big.remove(); document.body.style.overflow = ''; };
        big.querySelector('.x').onclick = shut;
        big.onclick = e => { if (e.target === big) shut(); };
      };
    }
    return ov;
  }


  /* 운영진 지원하기 — 입력칸 하나, 보내기 하나 */
  function staffApplySheet() {
    const ov = sheet({
      title: '운영진 지원하기',
      body:
        '<p class="mut sm" style="margin-bottom:12px;line-height:1.65">' +
        '지원하는 이유를 짧게 적어 주세요.<br>' +
        '운영진이 보고 연락드릴게요.</p>' +
        '<label class="field"><textarea class="input" id="saBody" rows="4" ' +
        'placeholder="예: 봉사 일정 정리를 돕고 싶어요"></textarea></label>' +
        '<div class="sheet-foot">' +
        '<button class="btn primary lg block" type="button" id="saGo">지원하기</button></div>'
    });

    ov.querySelector('#saGo').onclick = async () => {
      const btn = ov.querySelector('#saGo');
      const t = ov.querySelector('#saBody').value.trim();
      if (!t) return toast('이유를 적어주세요', 'err');
      btn.disabled = true; btn.textContent = '보내는 중…';
      try {
        const r = await DB.feedback.applyStaff(t);
        if (r && r.ok === false) {
          const why = {
            already: '이미 운영진이에요',
            pending: '이미 지원했어요. 확인 중이에요'
          }[r.why] || '보내지 못했어요';
          toast(why, 'err');
          btn.disabled = false; btn.textContent = '지원하기';
          return;
        }
        closeSheet();
        toast('지원했어요. 운영진이 확인하면 알려 드릴게요', 'ok');
      } catch (e) {
        toast(e.message || '보내지 못했어요', 'err');
        btn.disabled = false; btn.textContent = '지원하기';
      }
    };
  }

  /* 글 안의 @이름 을 초록으로 */
  function hl(text) {
    return esc(String(text || '')).replace(/@([^\s@.,!?]{1,12})/g,
      '<span class="ment">@$1</span>');
  }

  /* ============================================================
     댓글 시트 — 인스타처럼 아래에서 올라온다.
     목록은 위, 입력창은 맨 아래에 붙는다. 피드 자리는 그대로 둔다.
     ============================================================ */
  async function commentSheet(postId, focusName) {
    const ov = sheet({
      title: '댓글',
      body: '<div id="cbox" class="mut sm" style="padding:6px 0">불러오는 중…</div>',
      foot: '<div id="cmenu" class="mentbox" hidden></div>' +
        '<div class="cwrite2">' +
        avatar(ME) +
        '<div class="cfield">' +
        '<textarea id="cin" class="cinput" rows="1" placeholder="댓글 달기…" ' +
        'aria-label="댓글 쓰기"></textarea>' +
        '<button id="csend" class="csend" type="button" disabled>게시</button>' +
        '</div></div>'
    });

    let replyTo = null;          /* 답글을 달 댓글 */

    const box = ov.querySelector('#cbox');
    const inp = ov.querySelector('#cin');
    const send = ov.querySelector('#csend');
    const menu = ov.querySelector('#cmenu');
    loadAvatars(ov);
    const ment = attachMention(inp, menu);

    let kids = {};

    async function draw() {
      let rows = null;
      try { rows = await DB.community.comments(postId); }
      catch (e) { console.warn('[발자국] 댓글을 못 받아왔어요:', e); }
      if (rows === null) {
        box.innerHTML = '<div class="card center" style="padding:22px 18px">' +
          '<div class="sm">댓글을 불러오지 못했어요</div></div>';
        return;
      }
      if (!rows.length) {
        box.innerHTML = '<div class="center mut sm" style="padding:28px 0">' +
          '첫 댓글을 남겨 보세요</div>';
        return;
      }
      /* 답글은 부모 아래로 — 한 단계만 */
      /* 인스타처럼 — 답글은 원댓글 아래에 평평하게 쌓인다.
         ------------------------------------------------------------
         예전에는 parent_id 만 보고 묶어서 **답글의 답글**이
         top 에도 kids[원댓글] 에도 없어 아예 안 그려졌다.
         (「댓글 3개인데 2개만 보여」)
         이제 위로 거슬러 올라가 **원댓글**을 찾아 그 아래 붙인다. */
      const byId = {};
      rows.forEach(c => { byId[c.id] = c; });
      const rootOf = c => {
        let cur = c, hop = 0;
        while (cur.parent_id && byId[cur.parent_id] && hop < 20) {
          cur = byId[cur.parent_id]; hop++;
        }
        return cur.id;
      };

      const top = rows.filter(c => !c.parent_id);
      kids = {};
      const orphans = [];
      rows.filter(c => c.parent_id).forEach(c => {
        const root = rootOf(c);
        /* 부모를 못 찾으면 버리지 않는다 — 맨 아래에라도 보인다 */
        if (root === c.id) { orphans.push(c); return; }
        (kids[root] = kids[root] || []).push(c);
      });
      Object.keys(kids).forEach(k => kids[k].sort(
        (a, b) => String(a.created_at).localeCompare(String(b.created_at))));

      box.innerHTML = top.map(c => {
        const ks = kids[c.id] || [];
        /* 두 개까지만 먼저 — 나머지는 「더 보기」로.
           숨은 것이 있으면 버튼이 반드시 보인다 */
        const show = ks.slice(0, 2), rest = ks.length - show.length;
        return commentLine(c) +
          (ks.length
            ? '<div class="replies" data-rep="' + esc(c.id) + '">' +
              show.map(x => commentLine(x)).join('') +
              (rest > 0
                ? '<button class="morerep" type="button" data-morerep="' + esc(c.id) + '">' +
                  '답글 ' + rest + '개 더 보기</button>'
                : '') +
              '</div>'
            : '');
      }).join('') +
      (orphans.length
        ? '<div class="replies">' + orphans.map(x => commentLine(x)).join('') + '</div>'
        : '');
      loadAvatars(box);

      /* 카드 쪽 숫자도 보이는 수와 같게 맞춘다 */
      const row = findRow(postId);
      if (row) {
        row.comment_count = rows.filter(c => !c.hidden).length;
        row.recent_comments = rows.filter(c => !c.hidden).slice(-2);
        paintCards(postId);
      }
    }

    await draw();

    box.addEventListener('click', async e => {
      /* 나머지 답글까지 펴기 */
      const mr = e.target.closest('[data-morerep]');
      if (mr) {
        const id = mr.dataset.morerep;
        const wrap = box.querySelector('[data-rep="' + id + '"]');
        if (!wrap) return;
        wrap.innerHTML = (kids[id] || []).map(x => commentLine(x)).join('');
        loadAvatars(wrap);
        return;
      }
      /* 답글 달기 → 입력창에 @이름 */
      const r = e.target.closest('[data-reply]');
      if (r) {
        /* 원댓글에 붙인다 — 답글의 답글도 같은 줄기에 */
        replyTo = r.dataset.root || r.dataset.reply;
        const nm = r.dataset.rname || '';
        inp.value = '@' + nm + ' ';
        ment.byName(nm);
        inp.focus();
        grow();
        return;
      }
      /* 댓글 좋아요를 누가 눌렀나 */
      const lw = e.target.closest('[data-clwho]');
      if (lw) {
        let rows = [];
        try { rows = await DB.community.commentLikeWho(lw.dataset.clwho) || []; }
        catch (err) { return toast('불러오지 못했어요', 'err'); }
        const ov2 = sheet({
          title: '좋아요 누른 사람',
          body: rows.length
            ? '<div class="faces2">' + rows.map(x =>
                '<span class="face">' + avatar(x) +
                '<span class="sm">' + esc(x.name) + '</span></span>').join('') + '</div>'
            : '<div class="mut sm">아직 아무도 없어요</div>'
        });
        loadAvatars(ov2);
        return;
      }

      /* 댓글 좋아요 */
      const l = e.target.closest('[data-clike]');
      if (l) {
        try {
          const res = await DB.community.likeComment(l.dataset.clike);
          if (!res || !res.ok) throw new Error('눌리지 않았어요');
          await draw();
        } catch (err) { toast(err.message || '눌리지 않았어요', 'err'); }
        return;
      }
      const m = e.target.closest('[data-cmenu]');
      if (m) {
        const rows = await DB.community.comments(postId).catch(() => []);
        const c = (rows || []).filter(x => x.id === m.dataset.cmenu)[0];
        if (!c) return missWarn('댓글', m.dataset.cmenu);
        return openCommentMenu(c, draw);
      }
    });


    /* 입력창 높이를 글에 맞춰 늘린다 */
    function grow() {
      inp.style.height = 'auto';
      inp.style.height = Math.min(120, inp.scrollHeight) + 'px';
      const has = !!inp.value.trim();
      send.disabled = !has;
      send.classList.toggle('on', has);
    }

    inp.addEventListener('input', grow);

    send.onclick = async () => {
      const v = inp.value.trim();
      if (!v) return;
      send.disabled = true;
      try {
        const made = await DB.community.addComment(postId, v, replyTo);
        /* 부른 사람에게 알린다 */
        const ids = ment.ids(v);
        if (ids.length) {
          try {
            await DB.community.mentionAdd(ids, postId,
              (made && made.id) || null, v.slice(0, 120));
          } catch (e) { console.warn('[발자국] 언급을 못 적었어요:', e); }
        }
        inp.value = ''; replyTo = null; ment.clear();
        grow();
        await draw();
        box.scrollTop = box.scrollHeight;
      } catch (e) {
        toast(e.message || '남기지 못했어요', 'err');
      } finally {
        send.disabled = !inp.value.trim();
        inp.focus();
      }
    };

    UI.onEnter(inp, () => send.onclick());

    /* 키보드가 올라오면 입력줄을 그 위로 */
    if (window.visualViewport) {
      const vv = window.visualViewport;
      const foot = ov.querySelector('.sheet-foot');
      const fit = () => {
        if (!foot) return;
        const gap = Math.max(0, innerHeight - vv.height - vv.offsetTop);
        foot.style.transform = gap ? 'translateY(-' + gap + 'px)' : '';
      };
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
      ov.__fit = fit;
    }

    if (focusName) { inp.value = '@' + focusName + ' '; ment.byName(focusName); }
    setTimeout(() => { inp.focus(); grow(); }, 80);
    return ov;
  }

  /* ============================================================
     사진 크게 보기
     누르면 전체 화면. 좌우로 넘기고, 두 손가락으로 키우고,
     ✕ 나 안드로이드 뒤로 버튼으로 닫는다 — 막다른 곳이 되지 않게.
     ============================================================ */
  let lbOn = false;

  function openShots(postId, start) {
    const p = findRow(postId);
    if (!p || !(p.photos || []).length) return missWarn('사진', postId);
    const n = p.photos.length;
    let at = Math.max(0, Math.min(n - 1, Number(start) || 0));

    const box = document.createElement('div');
    box.className = 'shotview';
    box.innerHTML =
      '<div class="shotview-top">' +
      '<button class="shotview-x" type="button" aria-label="닫기">' + ic('x') + '</button>' +
      '<span class="shotview-n">' + (at + 1) + ' / ' + n + '</span>' +
      '</div>' +
      '<div class="shotview-track">' +
      p.photos.map((path, i) =>
        '<div class="shotview-cell"><img alt="봉사 사진 ' + (i + 1) + '" data-path="' + esc(path) + '"></div>'
      ).join('') + '</div>';
    document.body.appendChild(box);
    document.body.style.overflow = 'hidden';
    lbOn = true;

    const track = box.querySelector('.shotview-track');
    const nLabel = box.querySelector('.shotview-n');
    loadPhotos(box);
    requestAnimationFrame(() => { track.scrollLeft = at * track.clientWidth; });

    track.addEventListener('scroll', () => {
      const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      if (i !== at) { at = i; nLabel.textContent = (at + 1) + ' / ' + n; }
    });

    /* 두 손가락으로 키우기 — 키운 상태에서는 좌우 넘기기를 멈춘다 */
    let scale = 1, base = 1, dist0 = 0;
    const cell = () => track.children[at];
    const gap = (e) => {
      const a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    };
    track.addEventListener('touchstart', e => {
      if (e.touches.length === 2) { dist0 = gap(e); base = scale; }
    }, { passive: true });
    track.addEventListener('touchmove', e => {
      if (e.touches.length !== 2 || !dist0) return;
      e.preventDefault();
      scale = Math.max(1, Math.min(4, base * (gap(e) / dist0)));
      const c = cell(); if (c) c.firstChild.style.transform = 'scale(' + scale + ')';
      track.style.overflowX = scale > 1.02 ? 'hidden' : 'auto';
    }, { passive: false });
    track.addEventListener('touchend', e => {
      if (e.touches.length) return;
      dist0 = 0;
      if (scale < 1.1) {
        scale = 1;
        const c = cell(); if (c) c.firstChild.style.transform = '';
        track.style.overflowX = 'auto';
      }
    });

    /* 두 번 누르면 키웠다 돌아온다 — 인스타와 같게 */
    let lastTap = 0;
    track.addEventListener('click', () => {
      const now = Date.now();
      if (now - lastTap < 300) {
        const c = cell(); if (!c) return;
        scale = scale > 1.02 ? 1 : 2;
        c.firstChild.style.transform = scale > 1 ? 'scale(2)' : '';
        track.style.overflowX = scale > 1 ? 'hidden' : 'auto';
      }
      lastTap = now;
    });

    const close = () => {
      if (!lbOn) return;
      lbOn = false;
      box.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', onKey);
      /* 뒤로 버튼으로 닫혔으면 기록을 또 건드리지 않는다 */
      if (history.state && history.state.lb) history.back();
    };
    const onKey = e => { if (e.key === 'Escape') close(); };

    box.querySelector('.shotview-x').onclick = close;
    document.addEventListener('keydown', onKey);

    /* 안드로이드 뒤로 버튼으로도 닫힌다 */
    try {
      history.pushState({ lb: 1 }, '');
      window.addEventListener('popstate', function once() {
        window.removeEventListener('popstate', once);
        if (lbOn) { lbOn = false; box.remove(); document.body.style.overflow = ''; }
      });
    } catch (e) { }
  }

  /* ============================================================
     사진 옆으로 밀기 — 손가락을 직접 따라간다
     ------------------------------------------------------------
     브라우저 기본 가로 스크롤에만 맡겼더니 실제 아이폰에서
     「사진을 한 번 누른 뒤에야」 밀렸다. 첫 터치를 페이지 세로
     스크롤로 가져가 버리기 때문이다.
     그래서 첫 손가락부터 우리가 직접 scrollLeft 를 움직인다.
     세로로 미는 것이면 바로 손을 떼고 페이지에 돌려준다.
     ============================================================ */
  function wireSwipe(root) {
    const strips = (root || document).querySelectorAll('.shots');
    strips.forEach(box => {
      if (box.__swipe) return;
      box.__swipe = true;

      let id = null, x0 = 0, y0 = 0, left0 = 0, dir = '';

      box.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        id = e.pointerId; x0 = e.clientX; y0 = e.clientY;
        left0 = box.scrollLeft; dir = '';
        box.classList.add('dragging');
      }, { passive: true });

      box.addEventListener('pointermove', e => {
        if (e.pointerId !== id) return;
        const dx = e.clientX - x0, dy = e.clientY - y0;

        /* 어느 쪽으로 미는지 아직 못 정했으면 정한다 */
        if (!dir) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          dir = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
          /* 세로면 페이지에 돌려준다 */
          if (dir === 'y') { id = null; box.classList.remove('dragging'); return; }
          try { box.setPointerCapture(e.pointerId); } catch (err) { }
        }
        if (dir !== 'x') return;
        box.scrollLeft = left0 - dx;
        /* 가로로 미는 중엔 페이지가 같이 움직이지 않게 */
        if (e.cancelable) e.preventDefault();
      }, { passive: false });

      const end = e => {
        if (e.pointerId !== id && id !== null) return;
        id = null;
        box.classList.remove('dragging');
        try { box.releasePointerCapture(e.pointerId); } catch (err) { }
        if (dir !== 'x') return;
        /* 가장 가까운 사진에 딱 맞춘다 */
        const w = box.clientWidth || 1;
        const to = Math.round(box.scrollLeft / w) * w;
        box.scrollTo({ left: to, behavior: 'smooth' });
        paintDots(box, Math.round(to / w));
      };
      box.addEventListener('pointerup', end);
      box.addEventListener('pointercancel', end);

      /* 사진을 끌어 옮기려는 몸짓으로 잡히지 않게 */
      box.querySelectorAll('img').forEach(im => {
        im.draggable = false;
        im.addEventListener('dragstart', ev => ev.preventDefault());
      });
    });
  }

  /* 점·「2/5」 표시를 맞춘다 */
  function paintDots(box, i) {
    const key = box.dataset.shots;
    if (!key) return;
    const dots = document.querySelector('[data-dots="' + key + '"]');
    if (!dots) return;
    if (dots.classList.contains('shotn')) {
      dots.textContent = (i + 1) + '/' + dots.dataset.total;
    } else {
      Array.prototype.forEach.call(dots.children, (d, n) => d.classList.toggle('on', n === i));
    }
  }

  /* 사진은 주소를 따로 받아와야 해서 자리만 먼저 만든다 */
  function photoStrip(p) {
    const ph = p.photos || [];
    if (!ph.length) return '';
    return '<div class="shots" data-shots="' + esc(p.id) + '">' +
      ph.map((path, i) =>
        '<img alt="봉사 사진 ' + (i + 1) + '" draggable="false" data-path="' + esc(path) + '" ' +
        'data-big="' + esc(p.id) + '" data-at="' + i + '">').join('') +
      '</div>' +
      /* 점이 열 개면 줄이 길어져 알아보기 어렵다. 여섯 장 넘으면 숫자로 센다 */
      (ph.length > 1
        ? (ph.length > 6
          ? '<div class="shotn" data-dots="' + esc(p.id) + '" data-total="' + ph.length + '">' +
            '1/' + ph.length + '</div>'
          : '<div class="dots" data-dots="' + esc(p.id) + '">' +
            ph.map((x, i) => '<i' + (i === 0 ? ' class="on"' : '') + '></i>').join('') + '</div>')
        : '');
  }

  /* 비공개 버킷이라 볼 때마다 서명된 주소를 받는다 */
  async function loadPhotos(root) {
    /* 사진 자리가 생기자마자 밀기를 붙인다 — 첫 손가락부터 먹히게 */
    wireSwipe(root);
    const imgs = Array.prototype.slice.call(root.querySelectorAll('img[data-path]'));
    for (let i = 0; i < imgs.length; i++) {
      const el = imgs[i], path = el.getAttribute('data-path');
      el.removeAttribute('data-path');
      try {
        const url = await DB.community.photoUrl(path);
        if (url) el.src = url;
      } catch (e) { /* 한 장 실패해도 나머지는 보여준다 */ }
    }
    wireSwipe(root);
  }

  /* ---------- 반응 ---------- */
  /* 한 사람이 여러 종류를 달 수 있다. 같은 걸 다시 누르면 취소된다. */

  /* ---------- 댓글 (카드 안에서 바로) ---------- */
  function commentBlock(p) {
    /* 최근 댓글 두 개까지만 미리. 나머지는 댓글 시트에서 */
    const list = (p.recent_comments || []).slice(0, 2);
    return '<div class="cmts" data-cmts="' + esc(p.id) + '">' +
      '<div data-clist="' + esc(p.id) + '">' + list.map(c => commentLine(c, true)).join('') + '</div>' +
      /* 카드에서 바로 쓸 수 있게 입력줄을 늘 둔다 — 누를 필요 없이 */
      '<div class="mentbox" data-cmenu-for="' + esc(p.id) + '" hidden></div>' +
      '<div class="cbar">' + avatar(ME) +
      '<input class="cbarin" type="text" inputmode="text" ' +
      'data-cbar="' + esc(p.id) + '" placeholder="댓글 달기…" aria-label="댓글 쓰기">' +
      '<button class="cbarsend" type="button" data-csend="' + esc(p.id) + '" disabled>게시</button>' +
      '</div>' +
      '</div>';
  }

  function commentLine(c, brief) {
    const who = typeof c.author === 'string' ? { name: c.author } : (c.author || { name: '?' });
    const name = who.name || '?';
    const likes = Number(c.likes) || 0;
    /* 미리보기(피드 안)에서는 한 줄로 간단히 */
    if (brief) {
      return '<div class="cline brief" data-c="' + esc(c.id) + '">' +
        avatar(who) +
        '<span class="ctx"><b>' + esc(name) + '</b> ' +
        '<span class="tx">' + (c.hidden ? '<span class="mut">지운 댓글이에요</span>' : esc(c.body)) + '</span>' +
        '</span></div>';
    }
    return '<div class="cline' + (c.parent_id ? ' reply' : '') + '" data-c="' + esc(c.id) + '">' +
      '<button class="facebtn" type="button" data-peek="' + esc(who.id || '') + '" ' +
      'data-pname="' + esc(name) + '" data-pphoto="' + esc(who.photo || who.photo_path || '') + '" ' +
      'data-prole="' + esc(who.role || '') + '" aria-label="' + esc(name) + ' 프로필">' +
      avatar(who) + '</button>' +
      '<span class="ctx">' +
      '<b>' + esc(name) + '</b> ' +
      '<span class="tx">' + (c.hidden ? '<span class="mut">운영진이 숨긴 댓글이에요</span>' : hl(c.body)) + '</span>' +
      '<span class="cfoot">' +
      '<span class="at">' + relTime(c.created_at) + (c.edited_at ? ' · 수정됨' : '') + '</span>' +
      (likes
        ? '<button class="clink" type="button" data-clwho="' + esc(c.id) + '">' +
          '좋아요 ' + num(likes) + '개</button>'
        : '') +
      /* 답글에도 「답글 달기」가 있다. 데이터는 원댓글에 붙이고(data-root)
         화면은 평평하게 — 인스타와 같다. 깊이가 깊어지지 않는다. */
      '<button class="clink" type="button" data-reply="' + esc(c.id) + '" ' +
      'data-root="' + esc(c.parent_id || c.id) + '" ' +
      'data-rname="' + esc(name) + '">답글 달기</button>' +
      (c.mine || AM_ADMIN
        ? '<button class="cdots" type="button" data-cmenu="' + esc(c.id) + '" aria-label="댓글 메뉴">' +
          ic('more') + '</button>'
        : '') +
      '</span></span>' +
      '<button class="clike' + (c.liked ? ' on' : '') + '" type="button" ' +
      'data-clike="' + esc(c.id) + '" aria-label="댓글 좋아요" ' +
      'aria-pressed="' + (c.liked ? 'true' : 'false') + '">' + ic('heart') + '</button>' +
      '</div>';
  }

  /* ---------- 카드 안의 동작 — 한 곳에서 받는다 ----------
     카드마다 따로 붙이면 다시 그릴 때 핸들러가 겹쳐서
     한 번 눌렀는데 두 번 실행되는 일이 생긴다. */
  let delegated = false;
  function bindOnce() {
    if (delegated) return;
    delegated = true;
    const view = $('#view');

    /* 좌우로 밀어 사진을 넘기면 그건 클릭이 아니다.
       10px 넘게 움직였으면 누른 것으로 치지 않는다.
       (실서버 폰에서 사진을 넘기려 하면 사진 뷰어가 열렸다 — 2026-10-20) */
    let downX = 0, downY = 0, moved = false;
    view.addEventListener('pointerdown', e => {
      downX = e.clientX; downY = e.clientY; moved = false;
    }, { passive: true });
    view.addEventListener('pointermove', e => {
      if (Math.abs(e.clientX - downX) > 10 || Math.abs(e.clientY - downY) > 10) moved = true;
    }, { passive: true });

    view.addEventListener('click', async e => {
      const hit = sel => e.target.closest('[' + sel + ']');
      let b;

      /* 민 것이면 열지 않는다 */
      if (moved) { moved = false; return; }

      /* 사진은 글 상세를 여는 자리 안에 있다 — data-open 보다 먼저 본다 */
      if ((b = hit('data-big'))) return openShots(b.dataset.big, b.dataset.at);
      if ((b = hit('data-animal'))) return animalSheet(b.dataset.animal, b.dataset.aname);
      if ((b = hit('data-checkin'))) return checkinSheet(b.dataset.checkin);
      if ((b = hit('data-pin'))) return togglePin(b.dataset.pin);
      if ((b = hit('data-best'))) return markBest(b.dataset.best, b.dataset.bc);
      if (hit('data-myans')) return myAnswersSheet();
      if ((b = hit('data-ask'))) return writeSheet(b.dataset.ask);
      if ((b = hit('data-askno'))) {
        skipReview(b.dataset.askno);
        const box = $('#ask'); if (box) box.innerHTML = '';
        return;
      }
      if ((b = hit('data-react'))) { pop(b); return hitReaction(b.dataset.react, b.dataset.k); }
      /* 인스타식 — 하트 · 말풍선 · 더 보기 · 좋아요 목록 */
      if ((b = hit('data-heart'))) { pop(b); return hitReaction(b.dataset.heart, 'heart'); }
      if ((b = hit('data-cmt'))) return commentSheet(b.dataset.cmt);
      if ((b = hit('data-more'))) {
        const bd = view.querySelector('[data-body="' + b.dataset.more + '"]');
        if (!bd) return missWarn('본문', b.dataset.more);
        bd.classList.remove('clip');
        b.remove();
        return;
      }
      if ((b = hit('data-who'))) return whoSheet(b.dataset.who);
      /* 프로필을 누르면 크게 — 이름·사진·기수만 */
      if ((b = hit('data-peek'))) return peekPerson({
        id: b.dataset.peek, name: b.dataset.pname,
        photo: b.dataset.pphoto, role: b.dataset.prole
      });
      if ((b = hit('data-hint'))) {
        try { localStorage.setItem(HINT_KEY, '1'); } catch (err) { }
        return renderHome(true);
      }
      if ((b = hit('data-menu'))) return postMenu(b.dataset.menu);
      if ((b = hit('data-open'))) return openPost(b.dataset.open);
      if ((b = hit('data-cmenu'))) return feedCommentMenu(b.dataset.cmenu);
      if ((b = hit('data-vote'))) return castVote(b);
      if ((b = hit('data-close'))) return closePoll(b.dataset.close);
      if ((b = hit('data-signup'))) return doSignup(b.dataset.signup, false);
      if ((b = hit('data-cancel'))) return doSignup(b.dataset.cancel, true);
      if ((b = hit('data-retry'))) return go(cur);
      if ((b = hit('data-reveal'))) return doReveal(b.dataset.reveal);
      if ((b = hit('data-wjoin'))) return doWait(b.dataset.wjoin, false);
      if ((b = hit('data-wleave'))) return doWait(b.dataset.wleave, true);
      if ((b = hit('data-past'))) return openPast(b.dataset.past);
      if ((b = hit('data-seen'))) {
        if (b.dataset.at > newsSeen()) { markNewsSeen(b.dataset.at); paintTabDot(); loadNews(); }
        return;
      }
      if ((b = hit('data-news'))) {
        if (b.dataset.at > newsSeen()) { markNewsSeen(b.dataset.at); paintTabDot(); loadNews(); }
        return openPost(b.dataset.news);
      }
    });

    /* 길게 누르기
       ------------------------------------------------------------
       · 반응 덩이를 길게 누르면 → 누가 눌렀는지
       · 하트를 길게 누르면 → 다섯 가지 중 고르기
       아이폰은 길게 누르면 글자 고르기·확대·메뉴를 먼저 띄워서
       우리 손짓을 가로챈다. CSS 로 그걸 막고(.act, .react),
       움직이면 취소한다. */
    let hold = null, holdX = 0, holdY = 0;
    view.addEventListener('pointerdown', e => {
      const heart = e.target.closest('[data-heart]');
      const re = e.target.closest('[data-react]');
      if (!heart && !re) return;
      holdX = e.clientX; holdY = e.clientY;
      hold = setTimeout(() => {
        hold = 'done';
        whoSheet(heart ? heart.dataset.heart : re.dataset.react);
      }, 450);
    }, { passive: true });
    view.addEventListener('pointermove', e => {
      if (!hold || hold === 'done') return;
      if (Math.abs(e.clientX - holdX) > 8 || Math.abs(e.clientY - holdY) > 8) {
        clearTimeout(hold); hold = null;
      }
    }, { passive: true });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      view.addEventListener(ev, () => { if (hold && hold !== 'done') clearTimeout(hold); }));
    /* 아이폰이 띄우는 길게 누르기 메뉴를 막는다 */
    view.addEventListener('contextmenu', e => {
      if (e.target.closest('[data-heart],[data-react],[data-clike]')) e.preventDefault();
    });

    /* 길게 누른 뒤에는 그 클릭을 삼킨다 — 고르기 창이 바로 닫히지 않게 */
    view.addEventListener('click', e => {
      if (hold === 'done' && e.target.closest('[data-heart],[data-react]')) {
        hold = null;
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    /* 내려서 읽을 때는 + 버튼이 작아진다 — 칩 줄과 격자 아이콘을 가리지 않게 */
    let lastY = 0;
    view.addEventListener('scroll', () => {
      const fab = $('#fab');
      if (!fab) return;
      const y = view.scrollTop;
      if (y > 120 && y > lastY) fab.classList.add('small');
      else if (y < lastY || y <= 120) fab.classList.remove('small');
      lastY = y;
    }, { passive: true });

    /* 사진을 넘기면 아래 점도 같이 움직인다 */
    view.addEventListener('scroll', e => {
      const box = e.target.closest ? e.target.closest('[data-shots]') : null;
      if (!box) return;
      paintDots(box, Math.round(box.scrollLeft / Math.max(1, box.clientWidth)));
    }, true);
  }

  /* 누른 느낌이 바로 오게 — 이모지가 톡 튀었다 돌아온다 */
  function pop(el) {
    if (!el) return;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  /* 길게 누르기 안내는 한 번 보면 다시 띄우지 않는다 */
  const HINT_KEY = 'baljaguk.reactHint';
  const hintSeen = () => { try { return localStorage.getItem(HINT_KEY) === '1'; } catch (e) { return false; } };

  /* 글을 찾는다. 못 찾으면 **조용히 끝내지 않는다** —
     「대기 신청」이 아무 반응 없던 것과 같은 종류를 막는다.
     부른 쪽에서 챙기지 못하면 missWarn 이 사람에게 알려 준다. */
  function findRow(id) { return F.rows.filter(r => r.id === id)[0]; }

  /* 눌렀는데 찾을 게 없을 때 — 아무 일도 안 일어난 것처럼 두지 않는다 */
  let lastMiss = 0;
  function missWarn(what, id) {
    console.warn('[발자국] ' + what + ' 을(를) 못 찾았어요:', id);
    /* 토스트가 줄줄이 뜨지 않게 2초에 한 번만 */
    if (Date.now() - lastMiss < 2000) return;
    lastMiss = Date.now();
    toast('지금은 열 수 없어요. 새로고침 해주세요', 'err');
  }

  async function hitReaction(id, kind) {
    const row = findRow(id);
    if (!row) return missWarn('글', id);
    try {
      const on = await DB.community.toggleReaction(id, kind);
      row.reactions = row.reactions || {};
      row.reactions[kind] = Math.max(0, (row.reactions[kind] || 0) + (on ? 1 : -1));
      if (!row.reactions[kind]) delete row.reactions[kind];
      row.my_reactions = (row.my_reactions || []).filter(k => k !== kind);
      if (on) row.my_reactions.push(kind);
      redrawReacts(id);
    } catch (e) { toast(e.message || '반응을 달지 못했어요', 'err'); }
  }

  function redrawReacts(id) {
    const row = findRow(id);
    if (!row) return;
    /* 하트 줄 — 하트 모양과 「좋아요 n개」를 같이 맞춘다 */
    const acts = $('#view').querySelector('[data-acts="' + id + '"]');
    if (acts) {
      const wrap2 = document.createElement('div');
      wrap2.innerHTML = actionRow(row);
      /* actionRow 는 여러 덩이를 돌려준다 — 옛 덩이들을 치우고 새로 넣는다 */
      let n = acts.nextElementSibling;
      while (n && (n.classList.contains('likes') || n.classList.contains('morecmt'))) {
        const kill = n; n = n.nextElementSibling; kill.remove();
      }
      const bits = Array.prototype.slice.call(wrap2.children);
      const anchor2 = acts.nextSibling;
      const parent = acts.parentNode;
      acts.remove();
      bits.forEach(el => parent.insertBefore(el, anchor2));
    }
  }


  /* 카카오톡처럼 — 어떤 반응을 누가 달았는지 한눈에 */
  async function whoSheet(id) {
    const row = findRow(id) || {};
    const counts = row.reactions || {};
    const shown = KINDS.filter(k => counts[k]);
    /* 반응은 하트 하나뿐이다 — 이모지 줄 없이 사람만 */
    const ov = sheet({
      title: '좋아요 누른 사람',
      body: '<div id="whoList" class="mut sm">불러오는 중…</div>'
    });
    let names = [];
    try { names = await DB.community.reactionWho(id, 'heart') || []; }
    catch (e) { console.warn('[발자국] 누른 사람을 못 받아왔어요:', e); }
    ov.querySelector('#whoList').innerHTML = names.length
      ? '<div class="faces2">' + names.map(x => {
          const who2 = (typeof x === 'string') ? { name: x } : x;
          return '<span class="face">' + avatar(who2) +
            '<span class="sm">' + esc(who2.name) + '</span></span>';
        }).join('') + '</div>'
      : '<div class="mut sm">아직 아무도 없어요</div>';
    loadAvatars(ov);
  }

  /* ---------- 글 메뉴 (수정·삭제·숨기기·고정) ---------- */
  /* ---------- 현장 출석 체크 ----------
     운영진이 그날 연 여섯 자리 번호를 넣는다.
     찍어도 실적·적립은 안 쌓인다 — 그건 운영진이 확정해야 쌓인다. */
  function checkinSheet(eventId) {
    const ov = sheet({
      title: '현장 출석 체크',
      body:
        '<p class="mut sm" style="margin-bottom:14px;line-height:1.6">' +
        '운영진이 알려주는 여섯 자리 번호를 넣어주세요.<br>' +
        '찍어도 봉사 실적은 운영진이 확정해야 쌓여요.</p>' +
        '<label class="field"><input class="input lgin" id="ciCode" inputmode="numeric" ' +
        'maxlength="6" placeholder="000000" style="text-align:center;letter-spacing:.28em"></label>' +
        '<div class="sheet-foot">' +
        '<button class="btn primary lg block" type="button" id="ciGo">출석 찍기</button></div>'
    });

    const input = ov.querySelector('#ciCode');
    setTimeout(() => input && input.focus(), 80);
    input.addEventListener('input', () => {
      input.value = input.value.replace(/[^0-9]/g, '').slice(0, 6);
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing) ov.querySelector('#ciGo').click();
    });

    ov.querySelector('#ciGo').onclick = async () => {
      const btn = ov.querySelector('#ciGo');
      const code = input.value.trim();
      if (code.length !== 6) return toast('여섯 자리를 넣어주세요', 'err');
      btn.disabled = true; btn.textContent = '확인 중…';
      try {
        const r = await DB.community.checkinDo(eventId, code);
        if (r && r.ok) {
          closeSheet();
          cheer && cheer();
          toast('출석했어요. 오늘도 고마워요!', 'ok');
          return;
        }
        toast(({
          notToday: '오늘 가는 봉사가 아니에요',
          wrong: '번호가 맞지 않아요',
          noevent: '봉사를 찾지 못했어요',
          nologin: '로그인이 풀렸어요'
        }[(r && r.why) || ''] || '찍지 못했어요'), 'err');
      } catch (e) {
        toast(e.message || '찍지 못했어요', 'err');
      } finally {
        btn.disabled = false; btn.textContent = '출석 찍기';
      }
    };
  }

  /* ---------- 신고 ----------
     운영진에게만 간다. 누가 신고했는지는 글쓴이에게 보이지 않는다. */
  const REASONS = [
    '욕설이나 비방이에요',
    '사진에 다른 사람이 원치 않게 나왔어요',
    '광고나 관계없는 글이에요',
    '그 밖의 이유'
  ];

  function reportSheet(target) {
    const ov = sheet({
      title: '신고하기',
      body:
        '<p class="mut sm" style="margin-bottom:12px;line-height:1.6">' +
        '운영진만 보고 처리해요. 글쓴이에게는 누가 신고했는지 보이지 않아요.</p>' +
        '<div style="display:grid;gap:7px">' +
        REASONS.map((r, i) =>
          '<button type="button" class="check' + (i === 0 ? ' on' : '') + '" data-r="' + i + '" ' +
          'style="width:100%;text-align:left">' +
          '<span class="box tick" aria-hidden="true">' + ic('check') + '</span>' +
          '<span class="grow sm">' + r + '</span></button>').join('') +
        '</div>' +
        '<label class="field" style="margin-top:12px"><span class="lb">더 적을 말 ' +
        '<span class="mut">(선택)</span></span>' +
        '<textarea class="input" id="rNote" rows="3"></textarea></label>' +
        '<div class="sheet-foot">' +
        '<button class="btn primary lg block" type="button" id="rSend">보내기</button></div>'
    });

    ov.querySelectorAll('[data-r]').forEach(b => b.onclick = () => {
      ov.querySelectorAll('[data-r]').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });

    ov.querySelector('#rSend').onclick = async () => {
      const btn = ov.querySelector('#rSend');
      btn.disabled = true; btn.textContent = '보내는 중…';
      try {
        const on = ov.querySelector('[data-r].on');
        const why = REASONS[Number(on ? on.dataset.r : 0)];
        const note = ov.querySelector('#rNote').value.trim();
        await DB.community.report({
          post: target.post || null, comment: target.comment || null,
          reason: note ? why + ' — ' + note : why
        });
        closeSheet();
        toast('운영진에게 알렸어요', 'ok');
      } catch (e) {
        toast(e.message || '보내지 못했어요', 'err');
        btn.disabled = false; btn.textContent = '보내기';
      }
    };
  }

  function postMenu(id) {
    const p = findRow(id);
    if (!p) return missWarn('글', id);
    const btns = [];
    if (p.mine) {
      btns.push('<button class="btn ghost block" type="button" data-act="edit">글 고치기</button>');
      btns.push('<button class="btn ghost block" type="button" data-act="del">글 지우기</button>');
    }
    if (AM_ADMIN) {
      /* 공지는 운영진 누구나 고칠 수 있다 — 담당이 바뀌어도 고칠 수 있게 */
      if (p.type === 'notice' && !p.mine) {
        btns.push('<button class="btn ghost block" type="button" data-act="edit">공지 고치기</button>');
      }
      /* 남의 글도 지울 수 있다. 숨기기는 쓰지 않는다 — 지우거나 두거나 둘 중 하나다 */
      if (!p.mine) {
        btns.push('<button class="btn ghost block" type="button" data-act="del">글 삭제</button>');
      }
      if (p.type === 'notice')
        btns.push('<button class="btn ghost block" type="button" data-act="pin">' +
          (p.pinned ? '공지 내리기' : '다시 공지로 올리기') + '</button>');
    }
    /* 남의 글만 신고할 수 있다. 누가 신고했는지는 운영진만 본다 */
    if (!p.mine) {
      btns.push('<button class="btn ghost block" type="button" data-act="report">신고하기</button>');
    }
    if (!btns.length) btns.push('<div class="mut sm">할 수 있는 게 없어요</div>');

    const ov = sheet({ title: '글', body: '<div style="display:grid;gap:8px">' + btns.join('') + '</div>' });
    ov.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const act = b.dataset.act;
      closeSheet();
      try {
        if (act === 'edit') return editSheet(p);
        if (act === 'del') {
          if (!await confirmSheet('이 글을 지울까요?',
            '이 글과 댓글 · 사진 · 반응이 모두 지워져요. 되돌릴 수 없어요.',
            '삭제하기', true)) return;
          return softDelete(p);
        }
        if (act === 'report') return reportSheet({ post: id });
        if (act === 'pin') {
          /* 공지는 세 개까지 — 네 번째면 가장 오래된 것을 내릴지 묻는다 */
          if (!p.pinned) {
            const now = (F.pins || []).length;
            if (now >= 3) {
              const ok = await confirmSheet('공지는 세 개까지예요',
                '가장 오래된 공지를 내리고 이 글을 올릴까요? 내린 글은 피드에 그대로 남아요.',
                '내리고 올리기');
              if (!ok) return;
              try { await DB.community.unpinOldest(); }
              catch (e) { return toast(e.message || '바꾸지 못했어요', 'err'); }
            }
          }
          await DB.community.setPinned(id, !p.pinned);
          toast(p.pinned ? '공지를 내렸어요' : '공지로 올렸어요');
          return renderHome(true);
        }
      } catch (e) { toast(e.message || '바꾸지 못했어요', 'err'); }
    });
  }

  function editSheet(p) {
    const ov = sheet({
      title: '글 고치기',
      body: '<label class="field"><span class="lb">내용</span>' +
        '<textarea class="input" id="eBody" rows="6">' + esc(p.body || '') + '</textarea></label>' +
        '<button class="btn primary block" type="button" id="eSave">저장하기</button>'
    });
    ov.querySelector('#eSave').onclick = async () => {
      const v = ov.querySelector('#eBody').value.trim();
      if (!v) return toast('내용을 적어주세요', 'err');
      closeSheet();
      try { await DB.community.updatePost(p.id, { body: v }); toast('고쳤어요', 'ok'); renderHome(true); }
      catch (e) { toast(e.message || '고치지 못했어요', 'err'); }
    };
  }

  /* ============================================================
     글쓰기 — 봉사 후기
     ============================================================ */
  /* ---------- 오늘 만난 친구 ----------
     후기에 보호소 아이 이름을 붙인다. 이름을 누르면 그 아이가 나온 후기가 모인다. */
  function animalChips(p) {
    const list = p.animals || [];
    if (!list.length) return '';
    return '<div class="animals">' + list.map(a =>
      '<button class="apaw" type="button" data-animal="' + esc(a.id) + '" ' +
      'data-aname="' + esc(a.name) + '">' + ic('paw') +
      '<span>' + esc(a.name) + '</span>' +
      (a.adopted ? '<span class="adopted">입양</span>' : '') + '</button>').join('') + '</div>';
  }

  /* 그 아이가 나온 후기 모아보기 */
  async function animalSheet(id, name) {
    const ov = sheet({
      title: esc(name) + ' 이야기',
      body: '<div id="anBox">' + paws() + '</div>'
    });
    let rows = [];
    try {
      const r = await DB.community.feed({ limit: 50 });
      rows = (r && r.rows || []).filter(p =>
        (p.animals || []).some(a => String(a.id) === String(id)));
    } catch (e) { }

    const box = ov.querySelector('#anBox');
    if (!box) return;
    if (!rows.length) {
      box.innerHTML = '<div class="mut sm">아직 이 친구가 나온 후기가 없어요</div>';
      return;
    }
    box.innerHTML = rows.map(p =>
      '<button class="pastrow" type="button" data-open="' + esc(p.id) + '">' +
      '<span class="nm">' + esc(cut(p.body || '사진 후기', 24)) + '</span>' +
      '<span class="rt">' + fmtDate(p.date || p.created_at) + '</span></button>').join('');
  }

  /* 후기 쓰기 단계 — 오늘 만난 친구 고르기 */
  /* ---------- 처음이에요 Q&A ----------
     새 탭도 새 화면도 만들지 않는다. 자유게시판 안 「질문」 말머리다.
     카드는 눈에 바로 들어오게 — 질문 한 줄과 상태 한 줄, 그게 다다. */
  function questionCard(p) {
    const n = Number(p.answers) || 0;
    const solved = !!p.solved;
    return '<article class="card qcard" data-post="' + esc(p.id) + '">' +
      '<div class="tapzone" data-open="' + esc(p.id) + '">' +

      '<div class="qtop">' +
      '<span class="qmark">Q</span>' +
      '<h3 class="qt">' + esc(p.body || '') + '</h3>' +
      '</div>' +

      '<div class="qmeta">' +
      '<span>답 ' + num(n) + '개</span>' +
      (solved ? '<span class="qsolved">' + ic('check') + '해결됨</span>' : '') +
      '</div>' +

      /* 해결됐으면 고른 답 한 줄을 미리 보여 준다 */
      (solved && p.best
        ? '<div class="qbest"><span class="amark">A</span>' +
          '<span class="at">' + esc(cut(p.best, 44)) + '</span></div>'
        : '') +

      '</div></article>';
  }

  /* 질문 쓰기 — 단계를 두지 않는다. 칸 하나와 버튼 하나. */
  function questionSheet() {
    const ov = sheet({
      title: '질문하기',
      body:
        '<label class="field"><textarea class="input" id="qBody" rows="4" ' +
        'placeholder="궁금한 걸 짧게 물어봐요"></textarea></label>' +
        '<div id="qMenu" class="mentbox" hidden></div>' +
        '<div class="sheet-foot">' +
        '<button class="btn primary lg block" type="button" id="qGo">질문 올리기</button></div>'
    });

    /* @ 로 사람 부르기 */
    const qMent = attachMention(ov.querySelector('#qBody'), ov.querySelector('#qMenu'));

    ov.querySelector('#qGo').onclick = async () => {
      const btn = ov.querySelector('#qGo');
      const t = ov.querySelector('#qBody').value.trim();
      if (!t) return toast('궁금한 걸 적어주세요', 'err');
      btn.disabled = true; btn.textContent = '올리는 중…';
      try {
        const made = await DB.community.createPost({ type: 'free', body: t, is_question: true });
        await tellMentioned(made, qMent ? qMent.ids(t) : [], t);
        closeSheet();
        toast('질문을 올렸어요', 'ok');
        F.kind = 'free'; F.place = '';
        saveFilter({ kind: 'free', place: '' });
        renderHome(true);
      } catch (e) {
        toast(e.message || '올리지 못했어요', 'err');
        btn.disabled = false; btn.textContent = '질문 올리기';
      }
    };
  }

  /* 질문 상세 — 고른 답이 맨 위, 나머지가 아래 */
  function answerBlock(p, list) {
    const best = p.best_id;
    const mine = !!p.mine;
    const one = (c, isBest) =>
      '<div class="ans' + (isBest ? ' best' : '') + '">' +
      (isBest ? '<span class="amark">A</span>' : '') +
      '<div class="grow">' +
      '<div class="who2">' + esc((c.author && c.author.name) || '?') +
      '<span class="at2">' + relTime(c.created_at) + '</span></div>' +
      '<div class="ab">' + esc(c.body) + '</div>' +
      (mine
        ? '<button class="linkbtn sm" type="button" data-best="' + esc(p.id) +
          '" data-bc="' + esc(c.id) + '">' +
          (isBest ? '고정 풀기' : '도움 됐어요') + '</button>'
        : '') +
      '</div></div>';

    const bestOne = list.filter(c => String(c.id) === String(best))[0];
    const rest = list.filter(c => String(c.id) !== String(best));

    return (bestOne ? one(bestOne, true) : '') +
      (rest.length
        ? (bestOne ? '<div class="divider"></div>' : '') + rest.map(c => one(c, false)).join('')
        : (bestOne ? '' : '<div class="mut sm">아직 답이 없어요. 처음 답해보세요.</div>'));
  }

  async function markBest(postId, commentId) {
    try {
      const r = await DB.community.markBest(postId, commentId);
      if (r && r.ok === false) {
        return toast(r.why === 'notmine' ? '질문한 사람만 고를 수 있어요' : '바꾸지 못했어요', 'err');
      }
      toast(r && r.solved ? '고마워요! 해결됨으로 표시했어요' : '고정을 풀었어요', 'ok');
      closeSheet();
      renderHome(true);
    } catch (e) { toast(e.message || '바꾸지 못했어요', 'err'); }
  }

  /* ---------- 글쓰기 ----------
     먼저 어떤 글인지 고르고, 고른 것에 맞는 단계만 묻는다.
     후기는 봉사·사진·글·설문, 자유글은 사진·글·설문. */
  async function writeSheet(preEvent) {
    if (typeof preEvent === 'string' && preEvent) return reviewWizard(preEvent);

    const admin = ME.role === 'admin';
    const row = (key, icon, t, s) =>
      '<button class="row56" type="button" data-w="' + key + '">' +
      '<span class="ic" style="width:40px;height:40px;border-radius:14px;display:grid;' +
      'place-items:center;background:var(--brand-soft);color:var(--brand-deep)">' + ic(icon) + '</span>' +
      '<span class="mid"><span class="t">' + t + '</span><span class="s">' + s + '</span></span>' +
      '<span class="end">' + ic('chevron') + '</span></button>';

    const ov = sheet({
      title: '어떤 글인가요?',
      body: row('review', 'calendar', '봉사 후기', '다녀온 날의 기록이에요') +
        row('free', 'edit', '자유글', '일상 이야기를 나눠요') +
        row('question', 'info', '질문', '궁금한 걸 물어봐요') +
        (admin ? row('notice', 'alert', '공지', '모두에게 알리는 글이에요') : '')
    });

    ov.querySelectorAll('[data-w]').forEach(b => b.onclick = () => {
      const k = b.dataset.w;
      closeSheet();
      setTimeout(() => {
        if (k === 'review') reviewWizard(null);
        else if (k === 'free') freeWizard();
        else if (k === 'question') questionSheet();
        else noticeWizard();
      }, 180);
    });
  }

  /* 기본 발표 시각 — 내일 저녁 8시 */
  function defaultReveal() {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(20, 0, 0, 0);
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* ---------- 「더하기」 ----------
     후기를 쓰는 데 꼭 필요한 건 봉사·사진·글 셋뿐이다.
     만난 친구와 설문·퀴즈는 글 아래 칩으로 두고, 누를 때만 그 자리에서 펼친다.
     안 누르면 그냥 올라간다. */

  /* 만난 친구 고르기를 담는 칸 */
  function mountAnimals(box, getPlace, picked) {
    box.innerHTML = '<div id="anList" class="mut sm">' + paws() + '</div>' +
      '<div class="row" style="gap:6px;margin-top:10px">' +
      '<input class="input grow" id="anNew" placeholder="목록에 없으면 여기에 이름을">' +
      '<button type="button" class="btn ghost" id="anAdd">더하기</button></div>';

    const state = { picked: (picked || []).slice(), all: [] };

    const paint = () => {
      const list = state.all;
      const el = box.querySelector('#anList');
      if (!list.length) {
        el.innerHTML = '<div class="mut sm">아직 등록된 친구가 없어요. ' +
          '아래에 이름을 적어 더해주세요.</div>';
        return;
      }
      el.innerHTML = '<div class="row" style="gap:7px;flex-wrap:wrap">' +
        list.map(a =>
          '<button type="button" class="apaw pick' +
          (state.picked.some(x => String(x.id) === String(a.id)) ? ' on' : '') + '" ' +
          'data-pick-an="' + esc(a.id) + '" data-an-name="' + esc(a.name) + '">' +
          ic('paw') + '<span>' + esc(a.name) + '</span>' +
          (a.adopted ? '<span class="adopted">입양</span>' : '') +
          '</button>').join('') + '</div>';

      el.querySelectorAll('[data-pick-an]').forEach(b => b.onclick = () => {
        const id = b.dataset.pickAn, nm = b.dataset.anName;
        const i = state.picked.findIndex(x => String(x.id) === String(id));
        if (i >= 0) state.picked.splice(i, 1);
        else state.picked.push({ id: id, name: nm });
        b.classList.toggle('on');
        if (state.onChange) state.onChange(state.picked);
      });
    };

    (async () => {
      try { state.all = await DB.community.animalsAt(getPlace()) || []; } catch (e) { }
      paint();
    })();

    const add = async () => {
      const nm = box.querySelector('#anNew').value.trim();
      if (!nm) return;
      const place = getPlace();
      if (!place) return toast('먼저 봉사를 골라주세요', 'err');
      try {
        const a = await DB.community.animalAdd(place, nm);
        if (a && !state.all.some(x => String(x.id) === String(a.id))) {
          state.all.push({ id: a.id, name: a.name, adopted: false, posts: 0 });
        }
        if (a) state.picked.push({ id: a.id, name: a.name });
        box.querySelector('#anNew').value = '';
        paint();
        if (state.onChange) state.onChange(state.picked);
      } catch (e) { toast(e.message || '더하지 못했어요', 'err'); }
    };
    box.querySelector('#anAdd').onclick = add;
    box.querySelector('#anNew').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); add(); }
    });

    return state;
  }

  /* 설문·퀴즈를 담는 칸 */
  function mountPoll(box, saved) {
    box.innerHTML =
      '<div class="seg" id="pKind" style="margin-bottom:12px">' +
      '<button type="button" data-k="none" class="on">안 넣기</button>' +
      '<button type="button" data-k="poll">설문</button>' +
      '<button type="button" data-k="quiz">퀴즈</button></div>' +

      '<div id="pBox" hidden>' +
      '<label class="field"><span class="lb" id="pQL">무엇을 물어볼까요?</span>' +
      '<input class="input" id="pQ" placeholder="다음엔 어디로 갈까요?"></label>' +
      '<div class="lb" style="margin-bottom:6px" id="pOL">고를 것</div>' +
      '<div id="pOpts" style="display:grid;gap:7px"></div>' +
      '<button type="button" class="btn ghost sm block" id="pAdd" style="margin-top:8px">' +
      '하나 더 넣기</button>' +
      '<div id="pPollOnly">' +
      '<button type="button" class="check" id="pMulti" style="width:100%;text-align:left;margin-top:10px">' +
      '<span class="box tick" aria-hidden="true">' + ic('check') + '</span>' +
      '<span class="grow"><span class="sm">여러 개 고를 수 있게</span></span></button></div>' +
      '<div id="pQuizOnly" hidden>' +
      '<div class="pill-note" style="margin-top:12px">' +
      '정답은 발표 전까지 아무에게도 안 보여요. 고른 사람도 자기 답만 보여요.</div>' +
      '<label class="field" style="margin-top:12px"><span class="lb">정답 발표 시간</span>' +
      '<input class="input" type="datetime-local" id="pWhen"></label>' +
      '</div></div>';

    const seg = box.querySelector('#pKind');
    const wrap = box.querySelector('#pBox');
    const opts = box.querySelector('#pOpts');
    const quizOnly = box.querySelector('#pQuizOnly');
    const pollOnly = box.querySelector('#pPollOnly');
    const st = { kind: (saved && saved.kind) || 'none' };

    const addOpt = (val, isAns) => {
      if (opts.children.length >= 6) return;
      const i = opts.children.length;
      const w = document.createElement('div');
      w.className = 'row';
      w.style.gap = '6px';
      w.innerHTML =
        '<button type="button" class="ansdot' + (isAns ? ' on' : '') + '" data-ans ' +
        'aria-label="정답으로 고르기" title="정답">' + ic('check') + '</button>' +
        '<input class="input grow" placeholder="' + (i + 1) + '번" value="' + esc(val || '') + '">' +
        (i >= 2 ? '<button type="button" class="btn ghost sm" data-del>✕</button>' : '');
      opts.appendChild(w);
      w.querySelector('[data-ans]').onclick = () => {
        opts.querySelectorAll('[data-ans]').forEach(d => d.classList.remove('on'));
        w.querySelector('[data-ans]').classList.add('on');
      };
      const del = w.querySelector('[data-del]');
      if (del) del.onclick = () => { w.remove(); if (st.onChange) st.onChange(); };
      sync();
    };

    function sync() {
      wrap.hidden = st.kind === 'none';
      quizOnly.hidden = st.kind !== 'quiz';
      pollOnly.hidden = st.kind === 'quiz';
      opts.querySelectorAll('[data-ans]').forEach(d => { d.hidden = st.kind !== 'quiz'; });
      box.querySelector('#pQL').textContent =
        st.kind === 'quiz' ? '무엇을 맞혀볼까요?' : '무엇을 물어볼까요?';
      box.querySelector('#pQ').placeholder =
        st.kind === 'quiz' ? '이 친구 이름은 뭘까요?' : '다음엔 어디로 갈까요?';
      box.querySelector('#pOL').textContent =
        st.kind === 'quiz' ? '고를 것 — 정답 하나를 눌러주세요' : '고를 것';
      seg.querySelectorAll('[data-k]').forEach(b =>
        b.classList.toggle('on', b.dataset.k === st.kind));
      if (st.onChange) st.onChange();
    }

    const seed = (saved && saved.options && saved.options.length) ? saved.options : ['', ''];
    seed.forEach((o, i) => addOpt(typeof o === 'string' ? o : o.label,
      saved && saved.answer != null && saved.answer === i));
    box.querySelector('#pAdd').onclick = () => addOpt('', false);
    seg.querySelectorAll('[data-k]').forEach(b => b.onclick = () => { st.kind = b.dataset.k; sync(); });
    box.querySelector('#pMulti').onclick = e => e.currentTarget.classList.toggle('on');
    box.querySelector('#pWhen').value = (saved && saved.when) || defaultReveal();
    if (saved && saved.question) box.querySelector('#pQ').value = saved.question;
    if (saved && saved.multi) box.querySelector('#pMulti').classList.add('on');
    sync();

    st.read = () => {
      if (st.kind === 'none') return null;
      const rows = Array.prototype.slice.call(opts.querySelectorAll('.row'));
      const options = rows.map(w => w.querySelector('input').value.trim());
      let answer = null;
      rows.forEach((w, i) => {
        if (w.querySelector('[data-ans]').classList.contains('on')) answer = i;
      });
      return {
        kind: st.kind,
        question: box.querySelector('#pQ').value.trim(),
        multi: st.kind === 'poll' && box.querySelector('#pMulti').classList.contains('on'),
        options: options,
        answer: st.kind === 'quiz' ? answer : null,
        when: st.kind === 'quiz' ? box.querySelector('#pWhen').value : null
      };
    };
    return st;
  }

  /* 글 단계 — 여기서 올린다. 더하기 칩 둘이 아래에 붙는다. */
  function bodyStep(o) {
    const opt = o || {};
    return {
      key: 'body', short: '글',
      q: opt.q || '어떤 하루였나요?',
      hint: opt.hint || '짧아도 좋아요. 기억에 남는 순간 하나면 충분해요.',
      body: '<label class="field"><textarea class="input" id="wBody" rows="5" ' +
        'placeholder="' + esc(opt.ph || '오늘 만난 아이들, 기억에 남는 순간…') + '"></textarea></label>' +
        /* @ 를 치면 사람 이름이 뜬다 — 댓글과 같은 것 */
        '<div id="wMenu" class="mentbox" hidden></div>' +
        '<p class="mut" style="font-size:11.5px;margin:-4px 2px 10px">' +
        '@ 를 치면 같이 간 사람을 부를 수 있어요</p>' +

        '<div class="addrow">' +
        (opt.animals
          ? '<button type="button" class="addchip" data-ex="an">' + ic('paw') +
            '<span class="t">만난 친구</span><span class="v"></span></button>'
          : '') +
        '<button type="button" class="addchip" data-ex="poll">' + ic('clipboard') +
        '<span class="t">설문 · 퀴즈</span><span class="v"></span></button>' +
        '</div>' +
        '<div class="expand" id="exAn" hidden></div>' +
        '<div class="expand" id="exPoll" hidden></div>',

      after: (r, vals) => {
        r.__an = null; r.__poll = null;

        const chip = k => r.querySelector('[data-ex="' + k + '"]');
        const setV = (k, text) => {
          const c = chip(k); if (!c) return;
          c.querySelector('.v').textContent = text || '';
          c.classList.toggle('on', !!text);
        };

        const anBox = r.querySelector('#exAn');
        const pollBox = r.querySelector('#exPoll');

        const openEx = (k) => {
          const box = k === 'an' ? anBox : pollBox;
          const other = k === 'an' ? pollBox : anBox;
          other.hidden = true;
          box.hidden = !box.hidden;
          if (box.hidden) return;

          if (k === 'an' && !r.__an) {
            r.__an = mountAnimals(box, () => opt.place ? opt.place(vals) : '', vals.__an || []);
            r.__an.onChange = list =>
              setV('an', list.length ? list.map(a => a.name).join(' · ') : '');
          }
          if (k === 'poll' && !r.__poll) {
            r.__poll = mountPoll(box, vals.__poll || null);
            r.__poll.onChange = () => {
              const v = r.__poll.read();
              setV('poll', v ? (v.kind === 'quiz' ? '퀴즈' : '설문') : '');
            };
          }
        };

        r.querySelectorAll('[data-ex]').forEach(b =>
          b.onclick = () => openEx(b.dataset.ex));

        if (vals.body && vals.body.text) r.querySelector('#wBody').value = vals.body.text;

        /* @ 로 사람 부르기 — 봉사 후기면 같이 간 사람을 맨 위에 */
        if (opt.whenPicked) { try { opt.whenPicked(vals); } catch (e) { } }
        r.__ment = attachMention(
          r.querySelector('#wBody'), r.querySelector('#wMenu'),
          { firstIds: opt.firstIds || [], firstPeople: opt.firstPeople || [] });
      },

      read: r => ({
        text: r.querySelector('#wBody').value.trim(),
        animals: r.__an ? r.__an.picked : [],
        poll: r.__poll ? r.__poll.read() : null,
        /* 글에 남아 있는 @이름 만 */
        mentions: r.__ment ? r.__ment.ids(r.querySelector('#wBody').value) : []
      }),

      valid: v => {
        const p = v.poll;
        if (!p) return '';
        if (!p.question) return p.kind === 'quiz' ? '무엇을 맞혀볼지 적어주세요' : '무엇을 물어볼지 적어주세요';
        const filled = p.options.filter(Boolean);
        if (filled.length < 2) return '고를 것을 두 개 넘게 적어주세요';
        if (filled.length !== p.options.length) return '빈 칸을 채우거나 지워주세요';
        if (p.kind === 'quiz') {
          if (p.answer == null) return '정답 하나를 눌러주세요';
          if (!p.when) return '발표 시간을 골라주세요';
          if (new Date(p.when).getTime() <= Date.now()) return '발표 시간은 지금보다 뒤여야 해요';
        }
        return '';
      },

      sum: v => cut(v.text, 20)
    };
  }

  /* 사진 고르기 단계 — 후기·자유글 공용 */
  function photoStep(withInsta, hint) {
    return {
      key: 'photos', short: '사진',
      q: '사진이 있나요?',
      hint: hint || '없어도 괜찮아요. 열 장까지 넣을 수 있어요.',
      body: '<div class="dropzone" id="wDrop" tabindex="0" role="button" aria-label="사진 고르기">' +
        '<div id="wIdle"><div class="big">' + ic('image') + '</div>' +
        '<div class="sm mut" style="margin-top:4px">눌러서 고르세요. 알아서 줄여서 올려요</div></div>' +
        '<div class="row" id="wThumbs" style="gap:6px;flex-wrap:wrap;justify-content:center"></div>' +
        '</div>' +
        '<input type="file" id="wPhotos" accept="image/*" multiple hidden>' +
        (withInsta
          ? '<button type="button" class="check" id="wInsta" style="margin-top:12px;width:100%;text-align:left">' +
            '<span class="box tick" aria-hidden="true">' + ic('check') + '</span>' +
            '<span class="grow"><span class="sm" style="font-weight:700">' +
            '발자국 인스타그램에 올려도 괜찮아요</span></span></button>'
          : ''),
      after: (r, vals) => {
        const file = r.querySelector('#wPhotos');
        const drop = r.querySelector('#wDrop');
        const idle = r.querySelector('#wIdle');
        const thumbs = r.querySelector('#wThumbs');
        const insta = r.querySelector('#wInsta');
        r.__shots = (vals.photos && vals.photos.list) || [];

        /* 사진은 순서가 뜻이 있다 — 길게 눌러 끌어서 바꾼다 */
        let holdTimer = null, dragFrom = -1;

        const paintThumbs = () => {
          if (!r.__shots.length) {
            idle.hidden = false;
            thumbs.innerHTML = '';
            return;
          }
          idle.hidden = true;
          thumbs.innerHTML = r.__shots.map((src, i) =>
            '<span class="shotchip" data-i="' + i + '">' +
            '<img src="' + src + '" alt="">' +
            '<button type="button" class="rm" data-rm="' + i + '" ' +
            'aria-label="' + (i + 1) + '번째 사진 빼기">✕</button>' +
            (i === 0 ? '<span class="first">대표</span>' : '') +
            '</span>').join('') +
            '<div class="sm mut" style="width:100%;margin-top:7px;text-align:center">' +
            r.__shots.length + '장 / 10장 · 길게 눌러 끌면 순서가 바뀌어요</div>';

          thumbs.querySelectorAll('[data-rm]').forEach(b => b.onclick = ev => {
            ev.stopPropagation();
            r.__shots.splice(Number(b.dataset.rm), 1);
            paintThumbs();
          });

          thumbs.querySelectorAll('.shotchip').forEach(chip => {
            chip.addEventListener('pointerdown', ev => {
              if (ev.target.closest('[data-rm]')) return;
              holdTimer = setTimeout(() => {
                dragFrom = Number(chip.dataset.i);
                chip.classList.add('dragging');
                try { chip.setPointerCapture(ev.pointerId); } catch (e) { }
              }, 350);
            });
            chip.addEventListener('pointermove', ev => {
              if (dragFrom < 0) return;
              const el = thumbs.ownerDocument.elementFromPoint(ev.clientX, ev.clientY);
              const over = el && el.closest ? el.closest('.shotchip') : null;
              if (!over || over === chip) return;
              const to = Number(over.dataset.i);
              const moved = r.__shots.splice(dragFrom, 1)[0];
              r.__shots.splice(to, 0, moved);
              dragFrom = to;
              paintThumbs();
              const again = thumbs.querySelector('.shotchip[data-i="' + to + '"]');
              if (again) {
                again.classList.add('dragging');
                try { again.setPointerCapture(ev.pointerId); } catch (e) { }
              }
            });
            const stop = () => {
              clearTimeout(holdTimer);
              if (dragFrom >= 0) { dragFrom = -1; paintThumbs(); }
            };
            chip.addEventListener('pointerup', stop);
            chip.addEventListener('pointercancel', stop);
            chip.addEventListener('pointerleave', () => clearTimeout(holdTimer));
          });
        };

        paintThumbs();
        if (insta) insta.addEventListener('click', () => insta.classList.toggle('on'));
        drop.addEventListener('click', ev => {
          if (ev.target.closest('.shotchip')) return;
          file.click();
        });
        drop.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
        });

        file.addEventListener('change', async e => {
          const room = 10 - r.__shots.length;
          const all = Array.prototype.slice.call(e.target.files || []);
          const fs = all.slice(0, Math.max(0, room));
          if (all.length > fs.length) {
            toast('열 장까지만 넣을 수 있어요', 'err');
          }
          if (!fs.length) return;
          idle.hidden = true;

          /* 여러 장이면 줄이는 데 시간이 걸린다 — 몇 장째인지 보여준다 */
          const out = [];
          for (let i = 0; i < fs.length; i++) {
            thumbs.innerHTML = '<span class="mut sm">사진 줄이는 중… ' +
              (i + 1) + '/' + fs.length + '</span>';
            try { out.push(await resizeImage(fs[i], 1280, .8)); }
            catch (err) { toast(err.message || '사진 하나를 못 읽었어요', 'err'); }
          }
          r.__shots = r.__shots.concat(out);
          file.value = '';
          paintThumbs();
        });
      },
      read: r => ({
        list: r.__shots || [],
        insta: !!(r.querySelector('#wInsta') && r.querySelector('#wInsta').classList.contains('on'))
      }),
      fill: (r, v) => {
        const insta = r.querySelector('#wInsta');
        if (v.insta && insta) insta.classList.add('on');
      },
      sum: v => v.list.length ? v.list.length + '장' + (v.insta ? ' · 인스타 동의' : '') : '없음'
    };
  }

  /* 글에 붙일 설문/퀴즈를 서버가 받는 모양으로 */
  function pollPayload(v) {
    if (!v) return null;
    const options = v.options.filter(Boolean);
    return {
      question: v.question,
      multi: !!v.multi,
      anonymous: false,
      options: options,
      /* 퀴즈는 정답 자리와 발표 시각을 같이 보낸다 */
      answer_index: v.kind === 'quiz' ? v.answer : null,
      reveal_at: v.kind === 'quiz' && v.when ? new Date(v.when).toISOString() : null
    };
  }

  /* ---------- 자유글 ---------- */
  function freeWizard() {
    UI.wizard({
      title: '자유글 쓰기',
      doneLabel: '올리기',
      steps: [
        photoStep(false,
          '없어도 괜찮아요. 퀴즈를 낼 거면 이 친구 사진을 올리면 더 재밌어요.'),
        bodyStep({
          q: '무슨 이야기인가요?',
          hint: '일상도, 궁금한 것도 좋아요.',
          ph: '오늘 있었던 일, 궁금한 것…'
        })
      ],
      done: async v => {
        if (!v.body.text && !v.photos.list.length && !v.body.poll) {
          throw new Error('글이나 사진을 넣어주세요');
        }
        const made = await DB.community.createPost({
          type: 'free', body: v.body.text, photos: v.photos.list,
          poll: pollPayload(v.body.poll)
        });
        await tellMentioned(made, v.body.mentions, v.body.text);
        closeSheet();
        cheer && cheer();
        toast('올렸어요', 'ok');
        F.kind = 'free'; F.place = '';
        saveFilter({ kind: 'free', place: '' });
        renderHome(true);
      }
    });
  }

  /* ---------- 공지 (운영진) ---------- */
  function noticeWizard() {
    let noticeMentions = [];
    UI.wizard({
      title: '공지 쓰기',
      doneLabel: '올리기',
      steps: [
        {
          key: 'body', short: '내용',
          q: '무엇을 알릴까요?',
          hint: '모두에게 보이고, 어떤 필터에서든 맨 위에 붙어요.',
          body: '<label class="field"><textarea class="input" id="nBody" rows="5" ' +
            'placeholder="11월 정기모임 안내…"></textarea></label>' +
            '<div id="nMenu" class="mentbox" hidden></div>',
          after: r => {
            r.__ment = attachMention(r.querySelector('#nBody'), r.querySelector('#nMenu'));
          },
          read: r => {
            const t = r.querySelector('#nBody').value.trim();
            /* 부른 사람을 글과 같이 들고 간다 */
            noticeMentions = r.__ment ? r.__ment.ids(t) : [];
            return t;
          },
          fill: (r, v) => { r.querySelector('#nBody').value = v; },
          valid: v => v ? '' : '내용을 적어주세요',
          sum: v => cut(v, 20)
        },
        {
          key: 'pin', short: '맨 위 고정',
          q: '맨 위에 붙여둘까요?',
          hint: '붙여두면 모두의 홈 맨 위에 보여요. 세 개까지 붙일 수 있어요.',
          body: '<button type="button" class="check on" id="nPin" style="width:100%;text-align:left">' +
            '<span class="box tick" aria-hidden="true">' + ic('check') + '</span>' +
            '<span class="grow"><span class="sm" style="font-weight:700">맨 위에 고정</span>' +
            '<span class="mut" style="display:block;font-size:11.5px;margin-top:2px">' +
            '나중에 글에서 「공지 내리기」로 뗄 수 있어요</span></span></button>',
          after: r => {
            const b = r.querySelector('#nPin');
            b.onclick = () => b.classList.toggle('on');
          },
          read: r => r.querySelector('#nPin').classList.contains('on'),
          fill: (r, v) => { r.querySelector('#nPin').classList.toggle('on', !!v); },
          sum: v => v ? '고정함' : '고정 안 함'
        }
      ],
      done: async v => {
        const made = await DB.community.createPost({
          type: 'notice', body: v.body, pinned: v.pin
        });
        await tellMentioned(made, noticeMentions, v.body);
        closeSheet();
        toast('공지를 올렸어요', 'ok');
        F.kind = 'all'; F.place = '';
        saveFilter({ kind: 'all', place: '' });
        renderHome(true);
      }
    });
  }

  /* ---------- 봉사 후기 ---------- */
  async function reviewWizard(preEvent) {
    /* 그 봉사에 다녀온 사람들 — @ 목록 맨 위에 올리려고 미리 받아 둔다 */
    const goIds = [];
    const goPeople = [];
    if (preEvent) {
      try {
        const who = await DB.community.eventPeople(preEvent);
        (who || []).forEach(x => {
          if (x.id !== ME.id) { goIds.push(x.id); goPeople.push(x); }
        });
      } catch (e) { console.warn('[발자국] 같이 간 사람을 못 받아왔어요:', e); }
    }
    let acts = [];
    try {
      const a = await DB.myActivity();
      acts = (a && a.records) || [];
    } catch (e) { /* 못 불러와도 직접 입력으로 쓸 수 있다 */ }
    const places = placeList();

    /* 홈 권유 카드나 「나」 탭에서 들어왔으면 어느 봉사인지 이미 안다.
       그 단계는 건너뛰고 사진부터 묻는다. */
    let fixed = null;
    if (preEvent) {
      const hit = acts.filter(x => String(x.event_id) === String(preEvent))[0];
      if (hit) {
        fixed = { own: false, date: hit.date, place: hit.place, event_id: hit.event_id };
      } else {
        try {
          const r = await DB.community.reviewPrompt();
          if (r && String(r.event_id) === String(preEvent)) {
            fixed = { own: false, date: r.date, place: r.place, event_id: r.event_id };
          }
        } catch (e) { }
      }
    }

    const whenStep = {
          key: 'when', short: '봉사',
          q: '어느 봉사였나요?',
          hint: acts.length
            ? '다녀온 봉사에서 고르면 날짜와 보호소가 같이 들어가요.'
            : '아직 확정된 봉사가 없어서 직접 적어주세요.',
          body: '<label class="field"><select class="input" id="wEv">' +
            acts.map((r, i) => '<option value="' + i + '">' + fmtDate(r.date) +
              (r.place ? ' · ' + esc(r.place) : '') + '</option>').join('') +
            '<option value="own">직접 입력</option></select></label>' +
            '<div id="wOwn" hidden><div class="grid2">' +
            '<label class="field"><span class="lb">날짜</span>' +
            '<input class="input" type="date" id="wDate"></label>' +
            '<label class="field"><span class="lb">보호소</span>' +
            '<select class="input" id="wPlace">' +
            places.map(p => '<option>' + esc(p) + '</option>').join('') +
            '</select></label></div></div>',
          after: r => {
            const sel = r.querySelector('#wEv'), own = r.querySelector('#wOwn');
            const sync = () => { own.hidden = sel.value !== 'own'; };
            sel.addEventListener('change', sync);
            if (!acts.length) sel.value = 'own';
            if (preEvent) {
              const i = acts.findIndex(x => x.event_id === preEvent);
              if (i >= 0) sel.value = String(i);
            }
            sync();
          },
          read: r => {
            const sel = r.querySelector('#wEv');
            if (sel.value === 'own') {
              return {
                own: true,
                date: r.querySelector('#wDate').value || '',
                place: r.querySelector('#wPlace').value || '',
                event_id: null
              };
            }
            const x = acts[Number(sel.value)] || {};
            return { own: false, date: x.date, place: x.place, event_id: x.event_id || null };
          },
          fill: (r, v) => {
            const sel = r.querySelector('#wEv');
            if (v.own) {
              sel.value = 'own';
              r.querySelector('#wOwn').hidden = false;
              r.querySelector('#wDate').value = v.date || '';
              if (v.place) r.querySelector('#wPlace').value = v.place;
            } else {
              const i = acts.findIndex(x => x.event_id === v.event_id && x.date === v.date);
              if (i >= 0) sel.value = String(i);
            }
          },
          valid: v => v.date ? '' : '날짜를 골라주세요',
          sum: v => fmtDate(v.date) + (v.place ? ' · ' + v.place : '')
    };

    UI.wizard({
      title: '봉사 후기 쓰기',
      doneLabel: '올리기',
      steps: [
        ...(fixed ? [] : [whenStep]),
        photoStep(true),
        bodyStep({
          animals: true,
          place: v => (fixed ? fixed.place : (v.when && v.when.place)) || '',
          /* @ 목록 맨 위에 같이 간 사람.
             + 로 시작하면 봉사를 고른 뒤에야 알 수 있어 그때 채운다. */
          firstIds: goIds,
          firstPeople: goPeople,
          whenPicked: v => {
            const ev = (v.when && v.when.event_id) || (fixed && fixed.event_id);
            if (!ev || goIds.__for === ev) return;
            goIds.__for = ev;
            DB.community.eventPeople(ev).then(who => {
              goIds.length = 0; goPeople.length = 0;
              (who || []).forEach(x => {
                if (x.id !== ME.id) { goIds.push(x.id); goPeople.push(x); }
              });
            }).catch(() => { });
          }
        })
      ],
      done: async v => {
        if (!v.body.text && !v.photos.list.length) throw new Error('글이나 사진을 넣어주세요');
        const when = fixed || v.when;
        const made = await DB.community.createPost({
          type: 'review', event_id: when.event_id,
          date: when.date, place: when.place,
          body: v.body.text, photos: v.photos.list,
          insta_ok: v.photos.insta, poll: pollPayload(v.body.poll),
          animals: (v.body.animals || []).map(a => a.id)
        });
        await tellMentioned(made, v.body.mentions, v.body.text);
        closeSheet();
        cheer && cheer();
        toast('후기 고마워요', 'ok');
        renderHome(true);
      }
    });
  }

  /* ============================================================
     글 상세 — 카드를 누르면 열린다. 댓글 전체와 입력칸은 여기에만.
     ============================================================ */
  async function openPost(id) {
    let p = findRow(id);
    let gone = false;
    /* 맨 위에 고정된 공지는 목록(F.rows)에 없고 F.pins 에 따로 온다.
       그래서 「글로 열기」를 눌러도 아무 일이 없었다 — 공지를 따로 받아온다. */
    if (!p) {
      /* 화면이 가진 건 첫 20개뿐이다 — 오래된 글은 하나만 받아온다.
         (알림을 눌렀는데 「글을 찾지 못했어요」가 나던 것) */
      try {
        const one = await DB.community.postOne(id);
        if (one && one.id) { F.rows.push(one); p = one; }
        else gone = true;    /* 서버가 아무것도 안 줬다 = 지워진 글 */
      } catch (e) { console.warn('[발자국] 글을 못 받아왔어요:', e); }
    }
    if (!p) {
      /* 지워진 글과 「못 받아온 것」은 다르다 */
      toast(gone ? '지워진 글이에요' : '지금은 열 수 없어요. 잠시 뒤 다시 해주세요', 'err');
      return;
    }
    const who = p.author || { name: '?' };

    const ov = sheet({
      title: '',
      body:
        '<div class="who" style="margin-bottom:10px">' + avatar(who) +
        '<div class="grow"><div class="nm">' + esc(who.name) +
        (who.role === 'admin' ? ' <span class="badge admin">운영진</span>' : '') + '</div>' +
        '<div class="at">' + relTime(p.created_at) +
        (p.edited_at ? ' · 수정됨' : '') + '</div></div></div>' +

        (p.date || p.place
          ? '<div class="meta">' + ic('calendar') +
          (p.date ? fmtDate(p.date) : '') +
          (p.place ? (p.date ? ' · ' : '') + esc(p.place) : '') + '</div>'
          : '') +

        (p.body ? '<div class="bd">' + esc(p.body) + '</div>' : '') +
        photoStrip(p) +
        ((p.photos || []).length && p.insta_ok && (p.mine || AM_ADMIN)
          ? '<div class="mut" style="font-size:11.5px;margin-top:7px">' +
            '인스타그램 사용에 동의한 사진이에요</div>'
          : '') +

        '<div class="divider"></div>' +
        '<div id="dList" class="mut sm">' + paws() + '</div>' +
        '<div id="dMenu" class="mentbox" hidden></div>' +
        '<div class="cwrite" style="margin-top:12px">' +
        '<input class="input" type="text" id="dIn" placeholder="댓글 달기…" ' +
        'autocomplete="off" enterkeyhint="send" aria-label="댓글 입력">' +
        '<button class="btn primary sm" type="button" id="dSend">전송</button></div>'
    });

    loadPhotos(ov);
    loadAvatars(ov);   /* 글 상세에서 프로필 사진이 안 보이던 것 */
    /* @ 로 사람 부르기 — 질문의 답에도 */
    const dMent = attachMention(ov.querySelector('#dIn'), ov.querySelector('#dMenu'));

    async function draw() {
      let list = [];
      try { list = await DB.community.comments(id); }
      catch (e) {
        ov.querySelector('#dList').innerHTML =
          '<div class="mut sm">댓글을 불러오지 못했어요.</div>';
        return;
      }
      const shown = list.filter(c => !c.hidden || c.mine || AM_ADMIN);

      /* 질문이면 답을 다르게 보여 준다 — 고른 답이 맨 위 */
      if (p.question) {
        ov.querySelector('#dList').innerHTML = answerBlock(p, shown);
        ov.querySelectorAll('[data-best]').forEach(b =>
          b.onclick = () => markBest(b.dataset.best, b.dataset.bc));
      } else {
        ov.querySelector('#dList').innerHTML = shown.length
          ? shown.map(commentLine).join('')
          : '<div class="mut sm">아직 댓글이 없어요. 처음 남겨보세요.</div>';
        ov.querySelectorAll('[data-cmenu]').forEach(b =>
          b.onclick = () => openCommentMenu(
            shown.filter(c => c.id === b.dataset.cmenu)[0], draw));
      }
      /* 피드 카드도 같이 맞춰둔다 */
      const row = findRow(id);
      if (row) {
        row.comment_count = list.filter(c => !c.hidden).length;
        row.recent_comments = shown.slice(-2);
      }
    }

    const send = async () => {
      const inp = ov.querySelector('#dIn');
      const v = inp.value.trim();
      if (!v) return;
      inp.disabled = true;
      try {
        const made = await DB.community.addComment(id, v);
        const ids = dMent ? dMent.ids(v) : [];
        if (ids.length) {
          try { await DB.community.mentionAdd(ids, id, (made && made.id) || null, v.slice(0, 120)); }
          catch (err) { console.warn('[발자국] 언급을 못 적었어요:', err); }
        }
        if (dMent) dMent.clear();
        inp.value = '';
        await draw();
        await refreshComments(id);
      }
      catch (e) { toast(e.message || '남기지 못했어요', 'err'); }
      finally { inp.disabled = false; inp.focus(); }
    };
    ov.querySelector('#dSend').onclick = send;
    ov.querySelector('#dIn').addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); send(); }
    });

    draw();
  }

  /* ============================================================
     댓글 — 카드 안에서 바로 쓰고 바로 보인다
     ============================================================ */
  /* 피드 카드에 보이는 최근 댓글의 메뉴 */
  function feedCommentMenu(commentId) {
    for (let i = 0; i < F.rows.length; i++) {
      const hit = (F.rows[i].recent_comments || []).filter(c => c.id === commentId)[0];
      if (hit) return openCommentMenu(hit, () => renderHome(true));
    }
  }

  function openCommentMenu(found, after) {
    if (!found) return;
    const commentId = found.id;

    const btns = [];
    if (found.mine) {
      btns.push('<button class="btn ghost block" type="button" data-a="edit">고치기</button>');
      btns.push('<button class="btn ghost block" type="button" data-a="del">지우기</button>');
    }
    if (AM_ADMIN && !found.mine) {
      btns.push('<button class="btn ghost block" type="button" data-a="del">댓글 삭제</button>');
    }
    if (!found.mine) btns.push('<button class="btn ghost block" type="button" data-a="report">신고하기</button>');
    if (!btns.length) return;

    const ov = sheet({ title: '댓글', body: '<div style="display:grid;gap:8px">' + btns.join('') + '</div>' });
    ov.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      closeSheet();
      try {
        if (a === 'report') return reportSheet({ comment: commentId });
        if (a === 'edit') {
          const ov2 = sheet({
            title: '댓글 고치기',
            body: '<label class="field"><textarea class="input" id="ceB" rows="3">' +
              esc(found.body) + '</textarea></label>' +
              '<button class="btn primary block" type="button" id="ceS">저장</button>'
          });
          ov2.querySelector('#ceS').onclick = async () => {
            const v = ov2.querySelector('#ceB').value.trim();
            if (!v) return toast('내용을 적어주세요', 'err');
            closeSheet();
            await DB.community.updateComment(commentId, v);
            after && after();
          };
          return;
        }
        if (a === 'del') {
          if (!await confirmSheet('이 댓글을 지울까요?',
            '되돌릴 수 없어요.', '삭제하기', true)) return;
          await DB.community.removeComment(commentId);
        }
        after && after();
      } catch (e) { toast(e.message || '바꾸지 못했어요', 'err'); }
    });
  }

  /* ---------- 글 삭제 ----------
     바로 지운다. 5초 뒤에 지우게 했더니, 그 사이 화면이 새로고침되면
     타이머가 죽어 영영 안 지워졌다 (2026-10-20 실서버에서 드러남).
     확인 시트에서 「되돌릴 수 없어요」라고 이미 묻는다. */
  async function softDelete(p) {
    try {
      await DB.community.removePost(p.id, p.photos || []);
      toast('지웠어요', 'ok');
      F.rows = (F.rows || []).filter(r => String(r.id) !== String(p.id));
      renderHome(true);
    } catch (e) {
      toast(e.message || '지우지 못했어요', 'err');
    }
  }

  /* 「지금 발표하기」 — 만든 사람만 */
  async function doReveal(id) {
    if (!await confirmSheet('지금 발표할까요?',
      '참여한 사람 모두에게 정답을 알려요. 발표한 뒤에는 답을 못 바꿔요.',
      '발표하기')) return;
    try {
      const r = await DB.community.revealQuiz(id);
      if (r && r.ok) { toast('정답을 발표했어요', 'ok'); renderHome(true); }
      else toast('아직 발표할 수 없어요', 'err');
    } catch (e) { toast(e.message || '발표하지 못했어요', 'err'); }
  }

  /* 예약 시각이 지난 퀴즈를 피드를 열 때 발표한다.
     E단계에 pg_cron 이 들어오면 이 자리는 없어도 된다. */

  /* ============================================================
     사진 모아보기
     ============================================================ */
  async function photoWall() {
    const ov = sheet({ title: '사진 모아보기', body: '<div id="wall" class="mut sm">불러오는 중…</div>' });
    /* 후기만 모으면 거의 비어 보인다 — 사진은 자유글에도 올라온다.
       종류를 가리지 않고 모은다. (실서버: 사진 23장 중 후기는 1건뿐이었다) */
    let res;
    try { res = await DB.community.feed({ limit: 60 }); }
    catch (e) { ov.querySelector('#wall').textContent = '불러오지 못했어요'; return; }
    const shots = [];
    (res.rows || []).forEach(r => (r.photos || []).forEach(path => shots.push({ path, id: r.id })));
    if (!shots.length) {
      ov.querySelector('#wall').innerHTML =
        '<div class="card empty" style="padding:26px 20px">' +
        '<div style="display:flex;justify-content:center;color:var(--ink-3)">' + ic('image') + '</div>' +
        '<div style="margin-top:8px">아직 올라온 사진이 없어요</div>' +
        '<div class="sm" style="margin-top:4px">봉사 후기에 사진을 올리면 여기에 모여요</div></div>';
      return;
    }
    ov.querySelector('#wall').innerHTML =
      '<div class="mut sm" style="margin-bottom:9px">사진 ' + shots.length + '장</div>' +
      '<div class="grid-shots">' + shots.map((x, i) =>
        '<img alt="봉사 사진 ' + (i + 1) + '" data-path="' + esc(x.path) + '" ' +
        'data-big="' + esc(x.id) + '">').join('') + '</div>';
    loadPhotos(ov);
  }

  /* ============================================================
     설문 (읽고 참여하기)
     ============================================================ */
  function pollBlock(p) {
    const q = p.poll;
    const quiz = !!q.quiz;
    /* 퀴즈는 발표되기 전까지 분포를 안 보여준다. 분포가 곧 정답 힌트다. */
    const hide = quiz && !q.revealed;
    const closed = !!q.closed_at || (q.closes_at && Date.parse(q.closes_at) < Date.now()) ||
      (quiz && q.revealed);
    const total = hide ? 0 : (q.options || []).reduce((t, o) => t + (o.votes || 0), 0);
    const iVoted = (q.options || []).some(o => o.mine);

    return '<div style="margin-top:10px">' +
      '<div style="font-weight:700;font-size:14.5px;margin-bottom:9px">' +
      (quiz ? '<span class="badge" style="margin-right:6px">퀴즈</span>' : '') +
      esc(q.question) + '</div>' +

      (q.options || []).map(o => {
        const pct = total ? Math.round(o.votes / total * 100) : 0;
        const isAns = quiz && q.revealed && q.answer === o.id;
        return '<button class="opt' + (o.mine ? ' mine' : '') + (isAns ? ' answer' : '') +
          '" type="button" ' +
          'data-vote="' + esc(p.id) + '" data-opt="' + esc(o.id) + '" ' +
          'data-multi="' + (q.multi ? '1' : '') + '" data-anon="' + (q.anonymous ? '1' : '') + '"' +
          (closed ? ' disabled' : '') + '>' +
          (hide ? '' : '<span class="fillbar" style="width:' + pct + '%"></span>') +
          '<span class="lb"><span class="nm">' + ic('check') +
          '<span>' + esc(o.label) + '</span></span>' +
          '<span class="cnt">' +
          (hide ? (o.mine ? '내 답' : '') : num(o.votes || 0) + '명 · ' + pct + '%') +
          '</span></span></button>';
      }).join('') +

      /* 발표 전 — 언제 알려주는지만 */
      (hide
        ? '<div class="quizwhen">' + ic('clock') + '<span>' +
          (q.reveal_at ? '정답 발표 ' + fmtDateTime(q.reveal_at) : '정답 발표를 기다리는 중') +
          (iVoted ? ' · 그때까지 답을 바꿀 수 있어요' : '') + '</span></div>'
        : '') +

      /* 발표 뒤 — 몇 명 중 몇 명이 맞혔는지 */
      (quiz && q.revealed
        ? '<div class="quizscore">' +
          num(q.voters || 0) + '명 중 ' + num(q.correct || 0) + '명 정답' + '</div>'
        : '') +

      '<div class="row between" style="margin-top:7px;gap:8px">' +
      '<span class="mut" style="font-size:11.5px">' +
      (quiz
        ? (q.revealed ? '정답이 나왔어요' : (iVoted ? '답을 냈어요' : '아직 안 풀었어요'))
        : (closed ? '마감됐어요' : (q.closes_at ? fmtDate(q.closes_at) + ' 마감' : '진행 중')) +
          ' · ' + num(total) + '명 참여' +
          (q.multi ? ' · 여러 개' : '') +
          (q.anonymous ? ' · 익명' : '')) + '</span>' +

      (quiz && !q.revealed && p.mine
        ? '<button class="linkbtn" type="button" data-reveal="' + esc(p.id) + '">지금 발표하기</button>'
        : (!quiz && !closed && (p.mine || AM_ADMIN)
          ? '<button class="linkbtn" type="button" data-close="' + esc(p.id) + '">일찍 마감</button>'
          : '')) + '</div></div>';
  }

  /* ---------- 내 지난 응답 ----------
     옛 설문(활동의견·개강파티)과 1365 명부를 각자 자기 것만 본다.
     다른 사람 응답과 연락처는 서버 함수에서부터 나오지 않는다. */
  const PARTY = { yes: '참석해요', no: '못 가요', maybe: '아직 몰라요' };

  async function myAnswersSheet() {
    const ov = sheet({ title: '내 응답', body: '<div id="myAns">' + paws() + '</div>' });
    let h = null;
    try { h = await DB.community.surveyHistory(); } catch (e) { }
    const box = ov.querySelector('#myAns');
    if (!box) return;

    if (!h) {
      box.innerHTML = '<div class="mut sm">불러오지 못했어요</div>';
      return;
    }

    /* 이름이 겹쳐 아직 못 이은 경우 — 남의 응답이 보이면 안 되니 막아 둔다 */
    if (h.ambiguous) {
      box.innerHTML = '<div class="pill-note">명부에 같은 이름이 둘 이상이라 ' +
        '지난 응답을 안전하게 찾지 못했어요.<br>운영진에게 문의해 주세요.</div>';
      return;
    }

    const sv = h.survey || [], id1365 = h.id1365 || [];
    if (!sv.length && !id1365.length) {
      box.innerHTML = '<div class="card center" style="padding:26px 20px">' +
        illus('emptyPoll', 'sm') +
        '<h3 style="margin-top:10px;font-size:16px">아직 낸 응답이 없어요</h3>' +
        '<p class="mut sm" style="margin-top:6px">설문이 열리면 여기에 모여요.</p></div>';
      return;
    }

    box.innerHTML =
      (sv.length
        ? '<div class="section-title">' + ic('clipboard') + '<span>활동 의견</span></div>' +
          sv.map(r =>
            '<div class="card" style="margin-bottom:10px">' +
            '<div class="row between" style="gap:8px">' +
            '<span class="mut" style="font-size:11.5px">' + fmtDate(r.at) +
            (r.topic ? ' · ' + esc(r.topic) : '') + '</span>' +
            (h.open
              ? '<button class="linkbtn" type="button" data-edit="' + esc(r.id) + '">고치기</button>'
              : '<span class="badge">마감</span>') + '</div>' +
            '<div class="kv"><span class="k">개강파티</span><span class="v">' +
            (PARTY[r.party] || '-') + '</span></div>' +
            (r.station
              ? '<div class="kv"><span class="k">사는 곳</span><span class="v">' +
                esc(r.station) + '</span></div>'
              : '') +
            (r.opinion
              ? '<div style="margin-top:9px;font-size:13.5px;line-height:1.65;' +
                'white-space:pre-wrap">' + esc(r.opinion) + '</div>'
              : '') + '</div>').join('')
        : '') +

      (id1365.length
        ? '<div class="section-title" style="margin-top:14px">' + ic('school') +
          '<span>1365 정보</span></div>' +
          id1365.map(t =>
            '<div class="card">' +
            '<div class="kv"><span class="k">1365 아이디</span><span class="v">' +
            esc(t.portal_id || '-') + '</span></div>' +
            (t.birth
              ? '<div class="kv"><span class="k">생년월일</span><span class="v">' +
                fmtDate(t.birth) + '</span></div>'
              : '') +
            (t.student_id
              ? '<div class="kv"><span class="k">학번</span><span class="v">' +
                esc(t.student_id) + '</span></div>'
              : '') +
            '<div class="mut" style="font-size:11.5px;margin-top:8px">' +
            fmtDate(t.at) + '에 마지막으로 고쳤어요</div></div>').join('')
        : '');

    box.querySelectorAll('[data-edit]').forEach(b =>
      b.onclick = () => editAnswer(sv.find(x => String(x.id) === b.dataset.edit)));
  }

  /* 설문이 열려 있을 때만 고칠 수 있다 */
  function editAnswer(r) {
    if (!r) return;
    const ov = sheet({
      title: '내 응답 고치기',
      body:
        '<div class="lb" style="margin-bottom:7px">개강파티에 오시나요?</div>' +
        '<div class="seg" id="eParty" style="margin-bottom:14px">' +
        ['yes', 'maybe', 'no'].map(k =>
          '<button type="button" data-p="' + k + '"' +
          (r.party === k ? ' class="on"' : '') + '>' + PARTY[k] + '</button>').join('') +
        '</div>' +
        '<label class="field"><span class="lb">사는 곳 <span class="mut">(가까운 지하철역)</span></span>' +
        '<input class="input" id="eStation" value="' + esc(r.station || '') + '"></label>' +
        '<label class="field"><span class="lb">하고 싶은 말</span>' +
        '<textarea class="input" id="eOpinion" rows="4">' + esc(r.opinion || '') + '</textarea></label>' +
        '<div class="sheet-foot">' +
        '<button class="btn primary lg block" type="button" id="eSave">저장하기</button></div>'
    });

    ov.querySelectorAll('#eParty [data-p]').forEach(b => b.onclick = () => {
      ov.querySelectorAll('#eParty [data-p]').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
    });

    ov.querySelector('#eSave').onclick = async () => {
      const btn = ov.querySelector('#eSave');
      btn.disabled = true; btn.textContent = '저장 중…';
      try {
        const on = ov.querySelector('#eParty [data-p].on');
        await DB.community.surveyUpdate(r.id, {
          party: on ? on.dataset.p : r.party,
          station: ov.querySelector('#eStation').value.trim(),
          opinion: ov.querySelector('#eOpinion').value.trim()
        });
        closeSheet();
        toast('고쳤어요', 'ok');
        setTimeout(myAnswersSheet, 220);
      } catch (e) {
        toast(e.message || '고치지 못했어요', 'err');
        btn.disabled = false; btn.textContent = '저장하기';
      }
    };
  }

  async function renderPolls() {
    $('#headTitle').textContent = '설문';
    $('#headLead').textContent = '모두의 생각을 모아요.';
    paint(loading());
    let res;
    try { res = await DB.community.feed({ type: 'poll', limit: 30 }); }
    catch (e) { return paint('<div class="card center" style="padding:28px"><div class="mut sm">불러오지 못했어요</div></div>'); }
    const rows = res.rows || [];
    /* 카드의 동작(설문·반응·댓글)이 F.rows 를 보고 돌아간다 */
    F.rows = rows;
    /* 지난 설문은 각자 자기 것만 — 맨 위에 한 줄로 */
    const mine = '<button class="row56" type="button" data-myans style="margin-bottom:12px">' +
      '<span class="ic" style="width:38px;height:38px;border-radius:13px;display:grid;' +
      'place-items:center;background:var(--brand-soft);color:var(--brand-deep)">' +
      ic('clipboard') + '</span>' +
      '<span class="mid"><span class="t">내 응답</span>' +
      '<span class="s">지난 설문과 1365 정보를 봐요</span></span>' +
      '<span class="end">' + ic('chevron') + '</span></button>';

    if (!rows.length) return paint(mine +
      '<div class="card center" style="padding:28px 22px">' +
      illus('emptyPoll') +
      '<h3 style="margin-top:12px;font-size:17px">아직 설문이 없어요</h3></div>');
    /* 구성원에게 중요한 건 지금 참여할 수 있는 설문이다.
       마감된 것은 아래로 내린다 */
    const closedOf = p => {
      const q = p.poll || {};
      return !!(q.closed_at || (q.closes_at && Date.parse(q.closes_at) < Date.now()));
    };
    const live = rows.filter(p => !closedOf(p));
    const done = rows.filter(closedOf);

    paint(mine +
      (live.length
        ? '<div class="section-title">' + ic('clipboard') + '<span>진행 중</span></div>' +
          live.map(postCard).join('')
        : '<div class="card center" style="padding:26px 22px">' + illus('emptyPoll', 'sm') +
          '<h3 style="margin-top:10px;font-size:16px">지금 진행 중인 설문이 없어요</h3></div>') +
      (done.length
        ? '<div class="section-title" style="margin-top:16px">' + ic('check') +
          '<span>마감된 설문</span></div>' + done.map(postCard).join('')
        : ''));
    bindOnce();
    loadPhotos($('#view'));
  }

  /* ---------- 설문 응답하기 ---------- */
  /* 누르면 화면부터 바로 바꾸고, 실패하면 되돌린다 */
  async function castVote(btn) {
    const postId = btn.dataset.vote, optId = btn.dataset.opt;
    const multi = !!btn.dataset.multi;
    const row = findRow(postId);
    if (!row || !row.poll) return missWarn('설문', postId);

    /* 마감된 뒤에 누르면 서버에서 「지우기만」 되어 응답이 사라졌다.
       누르기 전에 막는다. */
    const q = row.poll;
    if (q.closed_at || (q.closes_at && Date.parse(q.closes_at) < Date.now()) || q.revealed) {
      return toast('마감됐어요', 'err');
    }

    const before = JSON.parse(JSON.stringify(row.poll.options));
    const opt = row.poll.options.filter(o => o.id === optId)[0];
    if (!opt) return;
    const turningOn = !opt.mine;

    if (!multi) {
      row.poll.options.forEach(o => {
        if (o.mine && o.id !== optId) { o.mine = false; o.votes = Math.max(0, o.votes - 1); }
      });
    }
    opt.mine = turningOn;
    opt.votes = Math.max(0, opt.votes + (turningOn ? 1 : -1));
    redrawPoll(postId);

    try {
      const r = await DB.community.vote(postId, optId, multi);
      if (r && r.ok === false) {
        row.poll.options = before;
        redrawPoll(postId);
        return toast(r.why === 'closed' ? '마감됐어요' : '응답하지 못했어요', 'err');
      }
    } catch (e) {
      row.poll.options = before;
      redrawPoll(postId);
      toast(e.message || '응답하지 못했어요', 'err');
    }
  }

  function redrawPoll(postId) {
    const row = findRow(postId);
    const card = $('#view').querySelector('[data-post="' + postId + '"]');
    if (!row || !card) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = postCard(row);
    card.replaceWith(wrap.firstChild);
    loadPhotos($('#view'));
  }

  async function closePoll(postId) {
    if (!await confirmSheet('설문을 지금 마감할까요?', '마감하면 더 이상 바꿀 수 없어요.', '마감', false)) return;
    try {
      await DB.community.closePoll(postId);
      const row = findRow(postId);
      if (row && row.poll) row.poll.closed_at = new Date().toISOString();
      redrawPoll(postId);
      toast('마감했어요', 'ok');
    } catch (e) { toast(e.message || '마감하지 못했어요', 'err'); }
  }

  /* ---------- 설문 만들기 (운영진만) ----------
     질문이 다섯 개라 한 번에 하나씩 묻는다 */
  function pollSheet() {
    const dflt = (function () {
      const t = new Date(Date.now() + 3 * 864e5);
      t.setHours(21, 0, 0, 0);
      const p2 = n => String(n).padStart(2, '0');
      return t.getFullYear() + '-' + p2(t.getMonth() + 1) + '-' + p2(t.getDate()) +
        'T' + p2(t.getHours()) + ':' + p2(t.getMinutes());
    })();
    const EG = ['예: 토요일 오전', '예: 일요일 오후', '예: 둘 다 괜찮아요',
      '예: 평일 저녁', '예: 이번엔 어려워요', '예: 아직 모르겠어요'];

    UI.wizard({
      title: '설문 만들기',
      doneLabel: '올리기',
      steps: [
        {
          key: 'q', short: '질문',
          q: '무엇을 물어볼까요?',
          hint: '짧고 분명하게 적을수록 답이 잘 모여요.',
          body: '<label class="field"><input class="input" id="wq" ' +
            'placeholder="예: 다음 봉사는 언제가 좋을까요?"></label>',
          read: r => r.querySelector('#wq').value.trim(),
          fill: (r, v) => { r.querySelector('#wq').value = v; },
          valid: v => v ? '' : '질문을 적어주세요',
          sum: v => v
        },
        {
          key: 'opts', short: '선택지',
          q: '고를 수 있는 것을 적어주세요',
          hint: '두 개부터 여섯 개까지 넣을 수 있어요.',
          body: '<div id="wOpts">' +
            [0, 1].map(n => '<label class="field" style="margin-bottom:8px">' +
              '<input class="input" data-o="' + n + '" placeholder="' + EG[n] + '"></label>').join('') +
            '</div><button class="btn ghost sm block" type="button" id="wAdd">하나 더</button>',
          after: root => {
            let n = 2;
            root.querySelector('#wAdd').onclick = () => {
              if (n >= 6) return toast('여섯 개까지예요', 'err');
              root.querySelector('#wOpts').insertAdjacentHTML('beforeend',
                '<label class="field" style="margin-bottom:8px">' +
                '<input class="input" data-o="' + n + '" placeholder="' + EG[n] + '"></label>');
              n += 1;
              if (n >= 6) root.querySelector('#wAdd').hidden = true;
            };
          },
          read: r => Array.prototype.slice.call(r.querySelectorAll('[data-o]'))
            .map(el => el.value.trim()).filter(Boolean),
          fill: (r, v) => {
            const add = r.querySelector('#wAdd');
            while (r.querySelectorAll('[data-o]').length < v.length && add) add.click();
            r.querySelectorAll('[data-o]').forEach((el, n) => { el.value = v[n] || ''; });
          },
          valid: v => v.length >= 2 ? '' : '두 개 이상 적어주세요',
          sum: v => v.join(' · ')
        },
        {
          key: 'ends', short: '마감',
          q: '언제까지 받을까요?',
          hint: '마감이 지나면 아무도 바꿀 수 없어요.',
          body: '<label class="field"><input class="input" type="datetime-local" ' +
            'id="we" value="' + dflt + '"></label>',
          read: r => r.querySelector('#we').value,
          fill: (r, v) => { r.querySelector('#we').value = v || ''; },
          sum: v => v ? fmtDate(v) : '없음'
        },
        {
          key: 'how', short: '방식',
          q: '어떻게 고르게 할까요?',
          hint: '그냥 두면 하나만 고르고, 누가 골랐는지 볼 수 있어요.',
          body: '<button type="button" class="check" data-c="multi" style="width:100%;text-align:left;margin-bottom:8px">' +
            '<span class="box tick" aria-hidden="true">' + ic('check') + '</span>' +
            '<span class="sm" style="font-weight:700">여러 개 고를 수 있게</span></button>' +
            '<button type="button" class="check" data-c="anon" style="width:100%;text-align:left">' +
            '<span class="box tick" aria-hidden="true">' + ic('check') + '</span>' +
            '<span class="grow"><span class="sm" style="font-weight:700">익명으로</span>' +
            '<span class="mut" style="display:block;font-size:11.5px;margin-top:2px">' +
            '누가 무엇을 골랐는지 아무도 못 봐요</span></span></button>',
          after: root => root.querySelectorAll('[data-c]').forEach(b =>
            b.addEventListener('click', () => b.classList.toggle('on'))),
          read: r => ({
            multi: r.querySelector('[data-c="multi"]').classList.contains('on'),
            anon: r.querySelector('[data-c="anon"]').classList.contains('on')
          }),
          fill: (r, v) => {
            r.querySelector('[data-c="multi"]').classList.toggle('on', !!v.multi);
            r.querySelector('[data-c="anon"]').classList.toggle('on', !!v.anon);
          },
          sum: v => (v.multi ? '여러 개' : '하나만') + (v.anon ? ' · 익명' : '')
        }
      ],
      done: async v => {
        await DB.community.createPost({
          type: 'poll', body: '',
          poll: {
            question: v.q, options: v.opts,
            multi: v.how.multi, anonymous: v.how.anon,
            closes_at: v.ends ? new Date(v.ends).toISOString() : null
          }
        });
        closeSheet();
        toast('올렸어요', 'ok');
        renderPolls();
      }
    });
  }

  /* ============================================================
     봉사 탭
     ============================================================ */
  async function renderVol() {
    $('#headTitle').textContent = '봉사';
    $('#headLead').textContent = '다가오는 봉사와 지난 기록이에요.';
    paint('<div id="soon">' + loading(1) + '</div><div id="past"></div>' +
      '<div id="shelters"></div>' +
      /* 후원 현황을 봉사 탭 아래에서도 바로 */
      '<button class="item linkrow" type="button" id="fundRow2" style="width:100%">' +
      '<span class="ic green" style="width:38px;height:38px;border-radius:13px;display:grid;place-items:center">' +
      ic('heart') + '</span>' +
      '<span class="grow" style="text-align:left"><span class="nm">발자국 후원 현황</span>' +
      '<span class="sub">봉사로 모인 후원금과 사료</span></span>' +
      ic('chevron') + '</button>');
    const fr2 = $('#fundRow2');
    if (fr2) fr2.onclick = fundSheet;

    let board = null;
    try { board = await DB.community.volBoard(); } catch (e) { }
    if (!board) {
      return paint('<div class="card center" style="padding:28px 22px">' + illus('error') +
        '<h3 style="margin-top:12px;font-size:16px">일정을 불러오지 못했어요</h3>' +
        '<div style="margin-top:14px">' +
        '<button class="btn primary" type="button" data-retry>다시 시도</button></div></div>');
    }

    const soon = board.soon || [];
    const past = board.past || [];

    $('#soon').innerHTML = soon.length
      ? '<div class="section-title">' + ic('calendar') + '<span>다가오는 봉사</span></div>' +
        soon.map(volCard).join('')
      : '<div class="card center" style="padding:26px 22px">' + illus('emptyFeed', 'sm') +
        '<h3 style="margin-top:10px;font-size:16px">다가오는 봉사가 없어요</h3>' +
        '<p class="mut sm" style="margin-top:6px">일정이 올라오면 여기에 보여요.</p></div>';

    $('#past').innerHTML = past.length
      ? '<div class="section-title" style="margin-top:16px">' + ic('clock') + '<span>지난 봉사</span></div>' +
        '<div class="card" style="padding:4px 16px">' + past.map(e =>
          '<button class="pastrow" type="button" data-past="' + esc(e.id) + '">' +
          '<span class="nm">' + fmtDate(e.date) +
          (e.place ? ' · ' + esc(e.place) : '') +
          (e.confirmed ? '' : ' <span class="badge">확정 전</span>') + '</span>' +
          (e.went && !e.reviews
            ? '<span class="go">후기 쓰기</span>'
            : '<span class="rt">후기 ' + e.reviews + '개</span>') + '</button>').join('') +
        '</div>'
      : '';

    paintShelters();
  }

  /* ---------- 보호소 안내 ---------- */
  async function paintShelters() {
    const box = $('#shelters');
    if (!box) return;
    const list = placeInfo();
    if (!list.length) { box.innerHTML = ''; return; }

    let reviews = [];
    try {
      const r = await DB.community.feed({ type: 'review', limit: 50 });
      reviews = (r && r.rows) || [];
    } catch (e) { }

    box.innerHTML =
      '<div class="section-title" style="margin-top:16px">' + ic('home') + '<span>보호소 안내</span></div>' +
      list.map(p => {
        const rs = reviews.filter(r => r.place === p.name).slice(0, 3);
        return '<div class="card" style="margin-bottom:12px">' +
          '<div class="row between" style="align-items:flex-start;gap:10px">' +
          '<div class="grow"><div style="font-weight:700;font-size:15px">' + esc(p.name) + '</div>' +
          (p.area ? '<div class="mut sm" style="margin-top:2px">' + esc(p.area) + '</div>' : '') +
          '</div>' +
          (p.credit
            ? '<span class="badge approved">1인당 ' + credit(p.credit, p.unit) + '</span>'
            : '') + '</div>' +

          (p.address
            ? '<a class="btn ghost sm block" style="margin-top:10px" target="_blank" rel="noopener"' +
              ' href="https://map.kakao.com/link/search/' + encodeURIComponent(p.address) + '">' +
              ic('pin') + '<span>' + esc(p.address) + '</span></a>'
            : '') +

          (p.bring
            ? '<div class="kv"><span class="k">준비물</span><span class="v">' + esc(p.bring) + '</span></div>'
            : '') +
          (p.note
            ? '<p class="pill-note" style="margin-top:10px">' + esc(p.note) + '</p>'
            : '') +

          (rs.length
            ? '<div class="divider"></div>' +
              '<div class="mut" style="font-size:11.5px;margin-bottom:6px">최근 후기</div>' +
              rs.map(r =>
                '<button class="pastrow" type="button" data-open="' + esc(r.id) + '">' +
                '<span class="nm">' + esc(cut(r.body || '사진 후기', 24)) + '</span>' +
                '<span class="rt">' + fmtDate(r.date || r.created_at) + '</span></button>').join('')
            : '') +
          '</div>';
      }).join('');
  }

  function volCard(e) {
    const taken = Number(e.taken) || 0;
    const cap = Number(e.capacity) || 0;
    const mine = !!e.mine;
    const wait = e.wait_pos ? { pos: e.wait_pos } : null;
    const full = cap > 0 && taken >= cap && !mine;

    return '<div class="card" data-ev="' + esc(e.id) + '" style="margin-bottom:12px">' +
      '<div class="row between" style="align-items:flex-start;gap:10px">' +
      '<div class="grow"><div style="font-weight:700;font-size:15px">' +
      fmtDate(e.date) + ' (' + UI.weekday(e.date) + ')' +
      (e.start_time ? ' ' + esc(e.start_time) : '') + '</div>' +
      '<div class="mut sm" style="margin-top:3px">' + esc(e.place || '') +
      (e.title ? ' · ' + esc(e.title) : '') + '</div></div>' +
      (mine ? '<span class="badge approved">신청함</span>'
        : (wait ? '<span class="badge pending">대기 ' + num(wait.pos) + '번째</span>' : '')) + '</div>' +

      '<div class="mut" style="font-size:12px;margin-top:8px">' +
      (cap ? '선착순 ' + num(taken) + ' / ' + num(cap) + '명' : num(taken) + '명 신청') + '</div>' +

      /* 오늘 가는 봉사면 현장에서 출석을 찍을 수 있다 */
      (mine && String(e.date) === DB.today()
        ? '<button class="btn soft block" type="button" style="margin-top:11px" ' +
          'data-checkin="' + esc(e.id) + '">' + ic('check') + '<span>현장 출석 체크</span></button>'
        : '') +

      '<div style="margin-top:11px">' +
      (mine
        ? '<button class="btn ghost block" type="button" data-cancel="' + esc(e.id) + '">신청 취소</button>'
        : (wait
          ? '<button class="btn ghost block" type="button" data-wleave="' + esc(e.id) + '">대기 취소</button>'
          : (full
            ? '<button class="btn soft block" type="button" data-wjoin="' + esc(e.id) + '">' +
              '대기 신청하기</button>'
            : '<button class="btn primary block" type="button" data-signup="' + esc(e.id) + '">신청하기</button>'))) +
      (full && !mine && !wait
        ? '<div class="mut" style="font-size:11.5px;margin-top:7px;text-align:center">' +
          '자리가 나면 먼저 신청한 분부터 올라가요</div>'
        : '') +
      '</div></div>';
  }

  /* 지난 봉사를 누르면 그 봉사 후기로, 안 썼으면 쓰러 간다 */
  async function openPast(eventId) {
    let reviews = [];
    try {
      const r = await DB.community.feed({ type: 'review', limit: 50 });
      reviews = (r && r.rows || []).filter(x => x.event_id === eventId);
    } catch (e) { }
    if (reviews.length) {
      F.rows = reviews;
      $('#headTitle').textContent = '봉사 후기';
      $('#headLead').textContent = fmtDate(reviews[0].date) +
        (reviews[0].place ? ' · ' + reviews[0].place : '');
      paint('<button class="btn ghost sm" type="button" id="backVol">← 봉사로</button>' +
        '<div class="sp"></div>' + reviews.map(postCard).join(''));
      $('#backVol').onclick = () => go('vol');
      loadPhotos($('#view'));
      return;
    }
    writeSheet(eventId);
  }

  /* 서버가 돌려주는 까닭을 사람 말로 */
  const SIGNUP_MSG = {
    nomatch:  '먼저 이름 확인을 해주세요',
    noevent:  '없어진 봉사예요',
    closed:   '신청이 닫혔어요',
    full:     '자리가 다 찼어요',
    dup:      '이미 신청했어요',
    notfull:  '아직 자리가 있어요. 그냥 신청하면 돼요',
    past:     '이미 지난 봉사예요'
  };

  /* 대기 신청·취소 */
  async function doWait(id, leave) {
    /* 누르는 순간 바로 바뀌게 — 기다리는 느낌이 없게 */
    const btn = document.querySelector('[data-' + (leave ? 'wleave' : 'wjoin') + '="' + id + '"]');
    if (btn) {
      if (btn.disabled) return;          /* 두 번 눌리지 않게 */
      btn.disabled = true;
      btn.classList.add('busy');
      btn.textContent = leave ? '취소 중…' : '신청 중…';
    }
    try {
      const r = leave ? await DB.community.waitLeave(id) : await DB.community.waitJoin(id);
      if (r !== 'ok') throw new Error(SIGNUP_MSG[r] || '처리하지 못했어요');
      toast(leave ? '대기를 취소했어요' : '대기 신청했어요', 'ok');
      renderVol();
    } catch (e) {
      toast(e.message || '처리하지 못했어요', 'err');
      renderVol();
    }
  }

  async function doSignup(id, cancel) {
    const btn = document.querySelector('[data-' + (cancel ? 'cancel' : 'signup') + '="' + id + '"]');
    if (btn) {
      if (btn.disabled) return;          /* 두 번 눌리지 않게 */
      btn.disabled = true;
      btn.classList.add('busy');
      btn.textContent = cancel ? '취소 중…' : '신청 중…';
    }
    try {
      const r = cancel
        ? await DB.community.cancelSignup(id)
        : await DB.community.signup(id);
      if (r !== 'ok') throw new Error(SIGNUP_MSG[r] || '처리하지 못했어요');
      toast(cancel ? '신청을 취소했어요' : '신청했어요!', 'ok');
      if (!cancel) cheer && cheer();
      renderVol();
    } catch (e) {
      toast(e.message || '처리하지 못했어요', 'err');
      renderVol();
    }
  }

  /* ============================================================
     나
     ============================================================ */
  async function renderMe() {
    $('#headTitle').textContent = '나';
    $('#headLead').textContent = ME.name + '님의 발자국이에요.';
    paint(
      '<div class="card" style="padding:14px 16px">' +
      '<div class="row" style="gap:12px">' + avatar(ME) +
      '<div class="grow"><div style="font-weight:700;font-size:16px">' + esc(ME.name) +
      (ME.role === 'admin' ? ' <span class="badge admin">운영진</span>' : '') + '</div>' +
      '<div class="mut" style="font-size:12px;margin-top:2px">' +
      esc(genLabel()) + '</div></div></div></div>' +
      '<div id="news"></div>' +
      '<div id="act">' + loading(1) + '</div>' +
      '');
    loadNews();
    await loadActivity();
  }

  /* ---------- 새 소식 ----------
     안 읽은 것은 이 기기에 마지막으로 본 시각을 적어 두고 비교한다 */
  const NEWS_KEY = 'baljaguk.newsSeen';
  const newsSeen = () => { try { return localStorage.getItem(NEWS_KEY) || ''; } catch (e) { return ''; } };
  const markNewsSeen = at => { try { localStorage.setItem(NEWS_KEY, at); } catch (e) { } };

  async function unreadCount() {
    let list = [];
    try { list = await DB.community.news(); } catch (e) { return 0; }
    const seen = newsSeen();
    return list.filter(n => String(n.at) > seen).length;
  }

  /* 안 읽은 게 있으면 「나」 탭에 점 */
  async function paintTabDot() {
    const n = await unreadCount();
    const btn = $('#tabbar [data-tab="me"]');
    if (!btn) return;
    btn.classList.toggle('dotted', n > 0);
  }

  async function loadNews() {
    const box = $('#news');
    if (!box) return;
    let list = [];
    try { list = await DB.community.news(); } catch (e) { return; }
    if (!list.length) { box.innerHTML = ''; return; }

    const seen = newsSeen();
    const fresh = list.filter(n => String(n.at) > seen).length;
    const line = n => {
      if (n.kind === 'comment')
        return '<b>' + esc(n.who || '?') + '</b>님이 댓글을 남겼어요 — ' + esc(cut(n.detail, 28));
      if (n.kind === 'reaction')
        return '<b>' + esc(n.who || '?') + '</b>님이 내 글을 좋아해요';
      if (n.kind === 'promoted')
        return '대기에서 신청으로 올라갔어요 — <b>' + esc(n.detail || '') + '</b>';
      return esc(n.detail || '새 소식이 있어요');
    };

    box.innerHTML =
      '<div class="card"><div class="row between" style="align-items:center">' +
      '<h3 style="margin:0">새 소식' +
      (fresh ? ' <span class="badge approved">' + fresh + '</span>' : '') + '</h3>' +
      (fresh ? '<button class="linkbtn" type="button" id="newsRead">모두 읽음</button>' : '') +
      '</div><div class="sp"></div>' +
      list.slice(0, 8).map(n =>
        '<button class="newsrow' + (String(n.at) > seen ? '' : ' read') + '" type="button" ' +
        (n.post_id ? 'data-news="' + esc(n.post_id) + '" ' : 'data-seen="1" ') +
        'data-at="' + esc(n.at) + '">' +
        '<span class="pt"></span>' +
        '<span class="tx">' + line(n) + '</span>' +
        '<span class="at">' + relTime(n.at) + '</span></button>').join('') +
      '</div>';

    const rb = $('#newsRead');
    if (rb) rb.onclick = () => {
      markNewsSeen(list[0].at);
      loadNews(); paintTabDot();
    };
  }

  /* 기수는 동아리 설정에 있다. 가입일은 G단계에서 me() 를 넓히면 같이 보여준다 */
  function genLabel() {
    const g = (window.__settings && window.__settings.generation) || '';
    return g ? String(g) + ' 구성원' : '발자국 구성원';
  }

  /* 화면을 먼저 띄우고 기록은 뒤따라 채운다 */
  async function loadActivity() {
    const box = $('#act');
    if (!box) return;
    let a;
    try { a = await DB.myActivity(); }
    catch (e) {
      box.innerHTML = '<div class="card"><div class="mut sm">기록을 불러오지 못했어요.</div></div>';
      return;
    }
    if (!a) { box.innerHTML = ''; return; }

    const times = Number(a.times) || 0;
    if (!times) {
      box.innerHTML =
        '<div class="card center" style="padding:28px 22px">' +
        illus('emptyFeed') +
        '<h3 style="margin-top:12px;font-size:17px">아직 첫 봉사 전이에요</h3>' +
        '<p class="mut sm" style="margin-top:7px;line-height:1.6">' +
        '다녀오시면 여기에 횟수와 쌓인 것이 모여요.</p>' +
        '<div style="margin-top:15px">' +
        '<a class="btn primary" href="volunteer.html">봉사 일정 보기</a></div></div>';
      return;
    }

    const places = Array.isArray(a.places) ? a.places : [];
    const records = Array.isArray(a.records) ? a.records : [];
    const money = Number(a.credit_total) || 0;
    const kg = Number(a.credit_total_kg) || 0;

    box.innerHTML =
      /* 봉사 횟수 · 적립 · 사료 — 세 칸을 한 줄로 */
      '<div class="card"><div class="stat3">' +
      '<div><div class="v">' + num(times) + '</div>' +
      '<div class="k">봉사 횟수</div></div>' +
      '<div><div class="v">' + num(money) + '<span class="u">원</span></div>' +
      '<div class="k">적립</div></div>' +
      '<div><div class="v">' + num(kg) + '<span class="u">kg</span></div>' +
      '<div class="k">사료</div></div>' +
      '</div>' +
      (a.last_date
        ? '<div class="divider"></div><div class="kv"><span class="k">마지막 참여</span>' +
        '<span class="v">' + fmtDate(a.last_date) + '</span></div>' : '') +
      '</div>' +

      badgeCard(times, places.length) +

      /* 후원 현황을 커뮤니티 안에서 바로 — 주소를 하나로 합쳤으니 */
      '<button class="item linkrow" type="button" id="fundRow" style="width:100%">' +
      '<span class="ic green" style="width:38px;height:38px;border-radius:13px;display:grid;place-items:center">' +
      ic('heart') + '</span>' +
      '<span class="grow" style="text-align:left"><span class="nm">발자국 후원 현황</span>' +
      '<span class="sub">우리가 모은 후원금과 사료를 모두 볼 수 있어요</span></span>' +
      ic('chevron') + '</button><div class="sp"></div>' +

      (places.length
        ? '<div class="card"><h3>보호소별 적립</h3>' +
        '<div class="sub">내가 다녀온 만큼만 모아 보여드려요.</div><div class="sp"></div>' +
        places.map(p =>
          '<div class="kv"><span class="k">' + esc(p.place || '-') +
          ' <span class="mut" style="font-size:12px">' + num(p.times) + '회</span></span>' +
          '<span class="v">' + credit(p.credit, p.unit) + '</span></div>').join('') + '</div>'
        : '') +

      '<div class="card"><h3>내 봉사 기록</h3>' +
      '<div class="sub">운영진이 확정한 봉사만 보여요.</div><div class="sp"></div>' +
      records.map(r =>
        '<div class="kv"><span class="k">' + fmtDate(r.date) +
        (r.place ? ' · ' + esc(r.place) : '') + '</span>' +
        '<span class="v">' + (Number(r.per) > 0 ? '+' + credit(r.per, r.unit) : '<span class="mut">적립 없음</span>') +
        '</span></div>').join('') + '</div>';

    const fr = $('#fundRow');
    if (fr) fr.onclick = fundSheet;
  }

  /* ============================================================
     후원 현황 — 커뮤니티 안에서 바로 본다
     바깥 공개용 fund.html 은 그대로 두고, 같은 데이터를 쓴다.
     ============================================================ */
  async function fundSheet() {
    const ov = sheet({
      title: '발자국 후원 현황',
      body: '<div id="fundBody" class="mut sm">불러오는 중…</div>'
    });
    let d;
    try { d = await DB.publicFunds(); }
    catch (e) { ov.querySelector('#fundBody').textContent = '불러오지 못했어요'; return; }

    const n = x => Number(x) || 0;
    const won2 = n(d.total_saved), kg2 = n(d.total_saved_kg);
    const paid2 = n(d.total_paid), paidKg2 = n(d.total_paid_kg);
    const places2 = d.places || [], entries = (d.entries || []).slice(0, 12);

    ov.querySelector('#fundBody').innerHTML =
      '<div class="card center" style="padding:20px 18px">' +
      '<div class="mut sm">지금까지 모인 것</div>' +
      '<div class="money" style="font-size:30px;color:var(--brand-deep);margin-top:4px">' +
      won(won2) + '</div>' +
      (kg2 ? '<div class="money" style="font-size:22px;color:var(--brand-deep);margin-top:2px">' +
        credit(kg2, 'kg') + '</div>' : '') +
      '<div class="sm mut" style="margin-top:8px">' +
      '전달 ' + won(paid2) + (paidKg2 ? ' · ' + credit(paidKg2, 'kg') : '') + '</div>' +
      '<div class="sm mut" style="margin-top:8px;line-height:1.55">' +
      '봉사에 다녀오면 참여한 인원수만큼 그 보호소 앞으로 쌓여요</div></div>' +

      (places2.length
        ? '<div class="section-title">' + ic('paw') + '<span>보호소별</span></div>' +
          '<div class="list">' + places2.map(x =>
            '<div class="item" style="cursor:default">' +
            '<span class="ic green" style="width:34px;height:34px;border-radius:12px;display:grid;place-items:center">' +
            ic('heart') + '</span>' +
            '<div class="grow"><div class="nm">' + esc(x.place) + '</div>' +
            '<div class="sub">전달 ' + credit(n(x.paid), x.unit) + '</div></div>' +
            '<div class="money" style="color:var(--brand-deep)">' + credit(n(x.saved), x.unit) + '</div>' +
            '</div>').join('') + '</div><div class="sp"></div>'
        : '') +

      (entries.length
        ? '<div class="section-title">' + ic('calendar') + '<span>최근 적립</span></div>' +
          '<div class="card" style="padding:4px 16px">' + entries.map((r, i) =>
            '<div class="kv"' + (i ? '' : ' style="border-top:none"') + '>' +
            '<span class="k">' + fmtDate(r.date) + ' · ' + esc(r.place) + '</span>' +
            '<span class="v">' + credit(n(r.amount), r.unit) + '</span></div>').join('') +
          '</div><div class="sp"></div>'
        : '') +

      '<button class="btn ghost block sm" type="button" id="fundShare">바깥에 보여줄 링크 복사</button>';

    const sb = ov.querySelector('#fundShare');
    if (sb) sb.onclick = () => {
      const url = location.origin + location.pathname.replace(/[^/]*$/, '') + 'fund.html';
      copy(url, '링크를 복사했어요');
    };
  }

  /* 기록 배지 — 확정된 기록에서만 센다 */
  function badgeCard(times, placeCount) {
    const list = [
      { on: times >= 1, label: '첫 봉사', icon: 'sprout' },
      { on: times >= 5, label: '5회', icon: 'star' },
      { on: times >= 10, label: '10회', icon: 'crown' },
      { on: placeCount >= 3, label: '보호소 3곳', icon: 'heart' }
    ];
    return '<div class="card"><h3>기록 배지</h3>' +
      '<div class="sub">확정된 봉사로만 모여요.</div><div class="sp"></div>' +
      '<div class="row" style="gap:8px;align-items:flex-start">' +
      list.map(b =>
        '<div style="flex:1;min-width:62px;text-align:center">' +
        illus('badge', 'xs' + (b.on ? ' badge-on' : ' off')) +
        '<div class="badge-nm' + (b.on ? ' on' : '') + '">' + b.label + '</div></div>').join('') +
      '</div></div>';
  }

  return { start };
})();
