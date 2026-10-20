/* ============================================================
   발자국 커뮤니티
   홈(피드) · 봉사 · 투표 · 나  — 하단 탭 4개
   me.js 가 본인 확인을 마치면 여기로 넘겨준다.
   ============================================================ */
window.Community = (function () {
  const {
    $, $$, esc, toast, sheet, closeSheet, confirmSheet,
    won, num, credit, fmtDate, relTime, avatar, resizeImage, cropSquare, cheer
  } = UI;

  const TABS = [
    { id: 'home', label: '홈', icon: 'home' },
    { id: 'vol', label: '봉사', icon: 'calendar' },
    { id: 'poll', label: '투표', icon: 'clipboard' },
    { id: 'me', label: '나', icon: 'paw' }
  ];

  /* 화면 아이콘은 SVG 만 쓴다.
     이모지는 사용자가 직접 다는 반응에만 — 규칙의 유일한 예외다. */
  const EMOJI = {
    heart: '❤️', paw: '🐾', haha: '😆', moved: '🥹', clap: '👏', best: '👍'
  };
  const EMOJI_NAME = {
    heart: '하트', paw: '발바닥', haha: '웃음', moved: '감동', clap: '박수', best: '최고'
  };
  const KINDS = ['heart', 'paw', 'haha', 'moved', 'clap', 'best'];

  let ME = null;          /* { id, name, role, status } */
  let AM_ADMIN = false;
  let cur = 'home';

  /* 피드 상태 — 더 내리면 이어 붙인다 */
  const F = { rows: [], cursor: null, type: null, place: null, done: false, busy: false, pinned: null };

  /* ---------- 들어오기 ---------- */
  async function start(me) {
    ME = me;
    try { AM_ADMIN = await DB.isAdmin(); } catch (e) { AM_ADMIN = false; }
    try { window.__settings = await DB.settings.get(); } catch (e) { }

    $('#footLink').hidden = true;

    const bar = $('#tabbar');
    bar.innerHTML = TABS.map(t =>
      '<button type="button" data-tab="' + t.id + '" aria-label="' + t.label + '">' +
      '<span class="i">' + ic(t.icon) + '</span>' + t.label +
      '<span class="pawdot">' + ic('paw') + '</span></button>').join('');
    $$('#tabbar [data-tab]').forEach(b =>
      b.addEventListener('click', () => go(b.dataset.tab)));
    bar.hidden = false;

    $('#fab').innerHTML = ic('plus');

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

    go('home');
    paintTabDot();
  }

  /* ---------- 아바타 사진 채우기 ----------
     비공개 보관함이라 볼 때마다 서명된 주소를 받아 와야 한다 */
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
        '<button class="btn ghost block" type="button" id="pfTheme">' +
        ic(dark ? 'sun' : 'moon') + '<span>' + (dark ? '밝게 보기' : '어둡게 보기') + '</span></button>' +
        '<a class="btn ghost block" href="guide.html">' + ic('clipboard') + '<span>사용법</span></a>' +
        (AM_ADMIN ? '<a class="btn soft block" href="admin.html">운영진 화면으로</a>' : '') +
        '<button class="btn ghost block" type="button" id="pfOut">로그아웃</button>' +
        '</div>'
    });

    loadAvatars(ov);

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
    /* 홈에서는 후기 쓰기, 투표 탭에서는 투표 만들기 (운영진만) */
    const fab = $('#fab');
    const showFab = tab === 'home' || (tab === 'poll' && AM_ADMIN);
    fab.hidden = !showFab;
    fab.setAttribute('aria-label', tab === 'poll' ? '투표 만들기' : '글쓰기');
    fab.onclick = tab === 'poll' ? pollSheet : writeSheet;
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
    if (reset) { F.rows = []; F.cursor = null; F.done = false; F.pinned = null; }
    $('#headTitle').textContent = '안녕하세요, ' + ME.name + '님';
    $('#headLead').textContent = '우리가 함께 걸은 기록이에요.';

    paint(
      '<div id="pin"></div>' +
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

  function paintChips() {
    const places = placeList();
    const mk = (key, label, on) =>
      '<button type="button" class="chip' + (on ? ' on' : '') + '" data-chip="' + key + '">' + esc(label) + '</button>';
    $('#chips').innerHTML =
      mk('all', '전체', !F.type && !F.place) +
      mk('review', '후기', F.type === 'review') +
      mk('poll', '투표', F.type === 'poll') +
      places.map(p => mk('place:' + p, p, F.place === p)).join('');

    $$('#chips [data-chip]').forEach(b => b.addEventListener('click', async () => {
      const k = b.dataset.chip;
      if (k === 'all') { F.type = null; F.place = null; }
      else if (k.indexOf('place:') === 0) { F.type = null; F.place = k.slice(6); }
      else { F.type = k; F.place = null; }
      await renderHome(true);
    }));
  }

  /* 설정에 적힌 봉사지 목록 — 없으면 피드에 나온 곳으로 */
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
        cursor: F.cursor, type: F.type, place: F.place, limit: 20
      });
    } catch (e) {
      F.busy = false;
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

    if (first && res.pinned) {
      F.pinned = res.pinned;
      $('#pin').innerHTML = pinnedCard(res.pinned);
      $('#pin').querySelectorAll('[data-open]').forEach(b =>
        b.addEventListener('click', () => openPost(b.dataset.open)));
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
  }

  function paintMoreButton() {
    $('#more').innerHTML = F.done ? '' :
      '<button class="btn ghost block" id="moreBtn">더 보기</button>';
    const b = $('#moreBtn');
    if (b) b.onclick = async () => { b.disabled = true; b.textContent = '불러오는 중…'; await loadMore(false); };
  }

  function emptyFeed() {
    return '<div class="card center" style="padding:28px 22px">' +
      illus('emptyFeed') +
      '<h3 style="margin-top:12px;font-size:17px">아직 후기가 없어요</h3>' +
      '<p class="mut sm" style="margin-top:7px;line-height:1.6">' +
      '다녀온 날과 보호소를 고르면 금방 써져요.</p>' +
      '<div style="margin-top:15px">' +
      '<button class="btn primary" type="button" data-write>첫 후기 쓰기</button></div></div>';
  }

  /* 맨 위 고정 공지 — 있을 때만 */
  function pinnedCard(p) {
    return '<button class="card" type="button" data-open="' + esc(p.id) + '" ' +
      'style="width:100%;text-align:left;border:none;cursor:pointer;' +
      'background:var(--gold-soft);display:block;margin-bottom:10px">' +
      '<div class="row" style="gap:7px;color:#8a6414;font-weight:700;font-size:12.5px">' +
      ic('pin') + '<span>공지</span></div>' +
      '<div style="margin-top:7px;font-size:14px;line-height:1.6;color:var(--ink)">' +
      esc(cut(p.body, 90)) + '</div></button>';
  }

  const cut = (s, n) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n) + '…' : t;
  };

  /* ---------- 글 한 장 ---------- */
  function postCard(p) {
    const who = p.author || { name: '?' };
    return '<article class="card post" data-post="' + esc(p.id) + '">' +
      '<div class="who">' + avatar(who) +
      '<div class="grow"><div class="nm">' + esc(who.name) +
      (who.role === 'admin' ? ' <span class="badge admin">운영진</span>' : '') + '</div>' +
      '<div class="at">' + relTime(p.created_at) +
      (p.edited_at ? ' · 수정됨' : '') + '</div></div>' +
      '<button class="iconbtn sq" type="button" data-menu="' + esc(p.id) + '" aria-label="이 글 메뉴">' +
      ic('more') + '</button></div>' +

      '<div class="tapzone" data-open="' + esc(p.id) + '">' +

      (p.hidden
        ? '<div class="pill-note">운영진이 숨긴 글이에요. 나와 운영진에게만 보여요.</div>'
        : '') +

      (p.type === 'notice'
        ? '<div class="meta">' + ic('pin') + '공지</div>'
        : (p.date || p.place
          ? '<div class="meta">' + ic('calendar') +
          (p.date ? fmtDate(p.date) : '') +
          (p.place ? ' · ' + esc(p.place) : '') + '</div>'
          : '')) +

      (p.body ? '<div class="bd">' + esc(p.body) + '</div>' : '') +

      photoStrip(p) +
      /* 인스타에 써도 되는 사진인지 — 피드 만드는 사람이 바로 알 수 있게 */
      ((p.photos || []).length && p.insta_ok
        ? '<div class="mut" style="font-size:11.5px;margin-top:7px">' +
        '인스타그램 사용에 동의한 사진이에요</div>'
        : '') +
      '</div>' +
      (p.poll ? pollBlock(p) : '') +
      reactRow(p) +
      commentBlock(p) +
      '</article>';
  }

  /* 사진은 주소를 따로 받아와야 해서 자리만 먼저 만든다 */
  function photoStrip(p) {
    const ph = p.photos || [];
    if (!ph.length) return '';
    return '<div class="shots" data-shots="' + esc(p.id) + '">' +
      ph.map((path, i) =>
        '<img alt="봉사 사진 ' + (i + 1) + '" data-path="' + esc(path) + '">').join('') +
      '</div>' +
      (ph.length > 1
        ? '<div class="dots" data-dots="' + esc(p.id) + '">' +
        ph.map((x, i) => '<i' + (i === 0 ? ' class="on"' : '') + '></i>').join('') + '</div>'
        : '');
  }

  /* 비공개 버킷이라 볼 때마다 서명된 주소를 받는다 */
  async function loadPhotos(root) {
    const imgs = Array.prototype.slice.call(root.querySelectorAll('img[data-path]'));
    for (let i = 0; i < imgs.length; i++) {
      const el = imgs[i], path = el.getAttribute('data-path');
      el.removeAttribute('data-path');
      try {
        const url = await DB.community.photoUrl(path);
        if (url) el.src = url;
      } catch (e) { /* 한 장 실패해도 나머지는 보여준다 */ }
    }
  }

  /* ---------- 반응 ---------- */
  /* 한 사람이 여러 종류를 달 수 있다. 같은 걸 다시 누르면 취소된다. */
  function reactRow(p) {
    const counts = p.reactions || {};
    const mine = p.my_reactions || [];
    const shown = KINDS.filter(k => counts[k]);
    const total = shown.reduce((t, k) => t + counts[k], 0);
    return '<div class="reacts" data-reacts="' + esc(p.id) + '">' +
      shown.map(k =>
        '<button class="react' + (mine.indexOf(k) >= 0 ? ' on' : '') + '" type="button" ' +
        'data-react="' + esc(p.id) + '" data-k="' + k + '" title="' + EMOJI_NAME[k] + '">' +
        '<span>' + EMOJI[k] + '</span><span class="n">' + counts[k] + '</span></button>').join('') +
      '<button class="react add" type="button" data-pick="' + esc(p.id) + '" aria-label="반응 달기">' +
      ic('plus') + (shown.length ? '' : '<span class="lbl">반응</span>') + '</button>' +
      '</div>' +
      (total && !hintSeen()
        ? '<div class="mut" style="font-size:11.5px;margin-top:6px">' +
          '반응을 길게 누르면 누가 눌렀는지 볼 수 있어요 ' +
          '<button class="linkbtn" type="button" data-hint="1">알겠어요</button></div>'
        : '');
  }

  /* ---------- 댓글 (카드 안에서 바로) ---------- */
  function commentBlock(p) {
    const list = p.recent_comments || [];
    const more = (p.comment_count || 0) - list.length;
    return '<div class="cmts" data-cmts="' + esc(p.id) + '">' +
      (more > 0
        ? '<button class="morecmt" type="button" data-open="' + esc(p.id) + '">' +
        '댓글 ' + (p.comment_count || 0) + '개 모두 보기</button>'
        : '') +
      '<div data-clist="' + esc(p.id) + '">' + list.map(commentLine).join('') + '</div>' +
      (list.length || more > 0 ? '' :
        '<button class="morecmt" type="button" data-open="' + esc(p.id) + '">댓글 남기기</button>') +
      '</div>';
  }

  function commentLine(c) {
    const name = typeof c.author === 'string' ? c.author : ((c.author || {}).name || '?');
    return '<div class="cline" data-c="' + esc(c.id) + '">' +
      '<b>' + esc(name) + '</b> ' +
      '<span class="tx">' + (c.hidden ? '<span class="mut">운영진이 숨긴 댓글이에요</span>' : esc(c.body)) + '</span> ' +
      '<span class="at">' + relTime(c.created_at) + (c.edited_at ? ' · 수정됨' : '') + '</span>' +
      (c.mine || AM_ADMIN
        ? ' <button class="linkbtn" type="button" data-cmenu="' + esc(c.id) + '">⋯</button>'
        : '') +
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

    view.addEventListener('click', async e => {
      const hit = sel => e.target.closest('[' + sel + ']');
      let b;

      if ((b = hit('data-react'))) { pop(b); return hitReaction(b.dataset.react, b.dataset.k); }
      if ((b = hit('data-hint'))) {
        try { localStorage.setItem(HINT_KEY, '1'); } catch (err) { }
        return renderHome(true);
      }
      if ((b = hit('data-pick'))) return pickReaction(b.dataset.pick);
      if ((b = hit('data-menu'))) return postMenu(b.dataset.menu);
      if ((b = hit('data-open'))) return openPost(b.dataset.open);
      if ((b = hit('data-cmenu'))) return feedCommentMenu(b.dataset.cmenu);
      if ((b = hit('data-vote'))) return castVote(b);
      if ((b = hit('data-close'))) return closePoll(b.dataset.close);
      if ((b = hit('data-signup'))) return doSignup(b.dataset.signup, false);
      if ((b = hit('data-cancel'))) return doSignup(b.dataset.cancel, true);
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

    /* 반응을 길게 누르면 누가 눌렀는지 */
    let hold = null;
    view.addEventListener('pointerdown', e => {
      const b = e.target.closest('[data-react]');
      if (!b) return;
      hold = setTimeout(() => { hold = 'done'; whoSheet(b.dataset.react); }, 500);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
      view.addEventListener(ev, () => { if (hold && hold !== 'done') clearTimeout(hold); }));

    /* 사진을 넘기면 아래 점도 같이 움직인다 */
    view.addEventListener('scroll', e => {
      const box = e.target.closest ? e.target.closest('[data-shots]') : null;
      if (!box) return;
      const dots = view.querySelector('[data-dots="' + box.dataset.shots + '"]');
      if (!dots) return;
      const i = Math.round(box.scrollLeft / Math.max(1, box.clientWidth));
      Array.prototype.forEach.call(dots.children, (d, n) => d.classList.toggle('on', n === i));
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

  function findRow(id) { return F.rows.filter(r => r.id === id)[0]; }

  async function hitReaction(id, kind) {
    const row = findRow(id);
    if (!row) return;
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
    const box = $('#view').querySelector('[data-reacts="' + id + '"]');
    if (!row || !box) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = reactRow(row);
    box.replaceWith(wrap.firstChild);
  }

  function pickReaction(id) {
    const ov = sheet({
      title: '반응 달기',
      body: '<p class="mut sm" style="margin:0 0 10px">여러 개 골라도 괜찮아요.</p>' +
        '<div class="row" style="flex-wrap:wrap;gap:9px;justify-content:center;padding:6px 0">' +
        KINDS.map(k =>
          '<button class="react" type="button" data-pk="' + k + '" ' +
          'style="flex-direction:column;gap:3px;padding:12px 14px;font-size:24px">' +
          '<span>' + EMOJI[k] + '</span>' +
          '<span class="n">' + EMOJI_NAME[k] + '</span></button>').join('') + '</div>'
    });
    const mark = () => {
      const row = findRow(id) || {};
      const mine = row.my_reactions || [];
      ov.querySelectorAll('[data-pk]').forEach(b =>
        b.classList.toggle('on', mine.indexOf(b.dataset.pk) >= 0));
    };
    mark();
    /* 시트를 열어둔 채로 여러 개 고를 수 있게 둔다 */
    ov.querySelectorAll('[data-pk]').forEach(b => b.onclick = async () => {
      await hitReaction(id, b.dataset.pk);
      mark();
    });
  }

  /* 카카오톡처럼 — 어떤 반응을 누가 달았는지 한눈에 */
  async function whoSheet(id) {
    const row = findRow(id) || {};
    const counts = row.reactions || {};
    const shown = KINDS.filter(k => counts[k]);
    const ov = sheet({
      title: '반응한 사람',
      body: '<div id="whoList" class="mut sm">불러오는 중…</div>'
    });
    if (!shown.length) {
      ov.querySelector('#whoList').innerHTML = '<div class="mut sm">아직 없어요</div>';
      return;
    }
    const parts = [];
    for (let i = 0; i < shown.length; i++) {
      const k = shown[i];
      let names = [];
      try { names = await DB.community.reactionWho(id, k); } catch (e) { }
      parts.push(
        '<div style="padding:11px 0;border-bottom:1px dashed var(--line-2)">' +
        '<div class="row" style="gap:7px;align-items:center">' +
        '<span style="font-size:19px">' + EMOJI[k] + '</span>' +
        '<b class="sm">' + EMOJI_NAME[k] + '</b>' +
        '<span class="mut sm">' + names.length + '</span></div>' +
        '<div class="sm" style="margin-top:5px;line-height:1.7;color:var(--ink-3)">' +
        (names.length ? names.map(esc).join(' · ') : '—') + '</div></div>');
    }
    ov.querySelector('#whoList').innerHTML = parts.join('');
  }

  /* ---------- 글 메뉴 (수정·삭제·숨기기·고정) ---------- */
  function postMenu(id) {
    const p = findRow(id);
    if (!p) return;
    const btns = [];
    if (p.mine) {
      btns.push('<button class="btn ghost block" type="button" data-act="edit">글 고치기</button>');
      btns.push('<button class="btn ghost block" type="button" data-act="del">글 지우기</button>');
    }
    if (AM_ADMIN) {
      btns.push('<button class="btn ghost block" type="button" data-act="hide">' +
        (p.hidden ? '다시 보이기' : '숨기기') + '</button>');
      if (p.type === 'notice')
        btns.push('<button class="btn ghost block" type="button" data-act="pin">' +
          (p.pinned ? '고정 풀기' : '맨 위에 고정') + '</button>');
    }
    if (!btns.length) btns.push('<div class="mut sm">할 수 있는 게 없어요</div>');

    const ov = sheet({ title: '글', body: '<div style="display:grid;gap:8px">' + btns.join('') + '</div>' });
    ov.querySelectorAll('[data-act]').forEach(b => b.onclick = async () => {
      const act = b.dataset.act;
      closeSheet();
      try {
        if (act === 'edit') return editSheet(p);
        if (act === 'del') {
          if (!await confirmSheet('글을 지울까요?', '댓글과 반응도 함께 사라져요.', '지우기', true)) return;
          await DB.community.removePost(id);
          toast('지웠어요'); return renderHome(true);
        }
        if (act === 'hide') { await DB.community.setHidden(id, !p.hidden); toast(p.hidden ? '다시 보여요' : '숨겼어요'); return renderHome(true); }
        if (act === 'pin') { await DB.community.setPinned(id, !p.pinned); toast(p.pinned ? '고정을 풀었어요' : '맨 위에 고정했어요'); return renderHome(true); }
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
  async function writeSheet(preEvent) {
    let acts = [];
    try {
      const a = await DB.myActivity();
      acts = (a && a.records) || [];
    } catch (e) { /* 못 불러와도 직접 입력으로 쓸 수 있다 */ }
    const places = placeList();

    UI.wizard({
      title: '봉사 후기 쓰기',
      doneLabel: '올리기',
      steps: [
        {
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
        },
        {
          key: 'photos', short: '사진',
          q: '사진이 있나요?',
          hint: '없어도 괜찮아요. 다섯 장까지 넣을 수 있어요.',
          body: '<div class="dropzone" id="wDrop" tabindex="0" role="button" aria-label="사진 고르기">' +
            '<div id="wIdle"><div class="big">' + ic('image') + '</div>' +
            '<div class="sm mut" style="margin-top:4px">눌러서 고르세요. 알아서 줄여서 올려요</div></div>' +
            '<div class="row" id="wThumbs" style="gap:6px;flex-wrap:wrap;justify-content:center"></div>' +
            '</div>' +
            '<input type="file" id="wPhotos" accept="image/*" multiple hidden>' +
            '<button type="button" class="check" id="wInsta" style="margin-top:12px;width:100%;text-align:left">' +
            '<span class="box tick" aria-hidden="true">' + ic('check') + '</span>' +
            '<span class="grow"><span class="sm" style="font-weight:700">' +
            '발자국 인스타그램에 올려도 괜찮아요</span>' +
            '<span class="mut" style="display:block;font-size:11.5px;margin-top:2px;line-height:1.5">' +
            '다른 부원 얼굴이 나오면 그 부원에게도 물어봐 주세요.<br>' +
            '고르지 않으면 커뮤니티 안에서만 보여요</span></span></button>',
          after: (r, vals) => {
            const file = r.querySelector('#wPhotos');
            const drop = r.querySelector('#wDrop');
            const idle = r.querySelector('#wIdle');
            const thumbs = r.querySelector('#wThumbs');
            const insta = r.querySelector('#wInsta');
            r.__shots = (vals.photos && vals.photos.list) || [];

            const paintThumbs = () => {
              if (!r.__shots.length) { idle.hidden = false; thumbs.innerHTML = ''; return; }
              idle.hidden = true;
              thumbs.innerHTML = r.__shots.map(src =>
                '<img src="' + src + '" alt="" style="width:54px;height:54px;object-fit:cover;' +
                'border-radius:11px">').join('') +
                '<div class="sm mut" style="width:100%;margin-top:6px">' +
                r.__shots.length + '장 · 다시 눌러 바꿀 수 있어요</div>';
            };
            paintThumbs();
            insta.addEventListener('click', () => insta.classList.toggle('on'));
            drop.addEventListener('click', () => file.click());
            drop.addEventListener('keydown', e => {
              if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); }
            });
            file.addEventListener('change', async e => {
              const fs = Array.prototype.slice.call(e.target.files || []).slice(0, 5);
              if (!fs.length) return;
              idle.hidden = true;
              thumbs.innerHTML = '<span class="mut sm">사진 줄이는 중…</span>';
              const out = [];
              for (let i = 0; i < fs.length; i++) {
                try { out.push(await resizeImage(fs[i], 1600, .82)); }
                catch (err) { toast(err.message || '사진 하나를 못 읽었어요', 'err'); }
              }
              r.__shots = out;
              paintThumbs();
            });
          },
          read: r => ({
            list: r.__shots || [],
            insta: r.querySelector('#wInsta').classList.contains('on')
          }),
          fill: (r, v) => { if (v.insta) r.querySelector('#wInsta').classList.add('on'); },
          sum: v => v.list.length ? v.list.length + '장' + (v.insta ? ' · 인스타 동의' : '') : '없음'
        },
        {
          key: 'body', short: '글',
          q: '어떤 하루였나요?',
          hint: '짧아도 좋아요. 기억에 남는 순간 하나면 충분해요.',
          body: '<label class="field"><textarea class="input" id="wBody" rows="5" ' +
            'placeholder="오늘 만난 아이들, 기억에 남는 순간…"></textarea></label>',
          read: r => r.querySelector('#wBody').value.trim(),
          fill: (r, v) => { r.querySelector('#wBody').value = v; },
          sum: v => cut(v, 20)
        }
      ],
      done: async v => {
        if (!v.body && !v.photos.list.length) throw new Error('글이나 사진을 넣어주세요');
        await DB.community.createPost({
          type: 'review', event_id: v.when.event_id,
          date: v.when.date, place: v.when.place,
          body: v.body, photos: v.photos.list,
          insta_ok: v.photos.insta
        });
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
    const p = findRow(id);
    if (!p) return;
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
          (p.place ? ' · ' + esc(p.place) : '') + '</div>'
          : '') +

        (p.body ? '<div class="bd">' + esc(p.body) + '</div>' : '') +
        photoStrip(p) +
        ((p.photos || []).length && p.insta_ok && (p.mine || AM_ADMIN)
          ? '<div class="mut" style="font-size:11.5px;margin-top:7px">' +
            '인스타그램 사용에 동의한 사진이에요</div>'
          : '') +

        '<div class="divider"></div>' +
        '<div id="dList" class="mut sm">' + paws() + '</div>' +
        '<div class="cwrite" style="margin-top:12px">' +
        '<input class="input" type="text" id="dIn" placeholder="댓글 달기…" ' +
        'autocomplete="off" enterkeyhint="send" aria-label="댓글 입력">' +
        '<button class="btn primary sm" type="button" id="dSend">전송</button></div>'
    });

    loadPhotos(ov);

    async function draw() {
      let list = [];
      try { list = await DB.community.comments(id); }
      catch (e) {
        ov.querySelector('#dList').innerHTML =
          '<div class="mut sm">댓글을 불러오지 못했어요.</div>';
        return;
      }
      const shown = list.filter(c => !c.hidden || c.mine || AM_ADMIN);
      ov.querySelector('#dList').innerHTML = shown.length
        ? shown.map(commentLine).join('')
        : '<div class="mut sm">아직 댓글이 없어요. 처음 남겨보세요.</div>';
      ov.querySelectorAll('[data-cmenu]').forEach(b =>
        b.onclick = () => openCommentMenu(
          shown.filter(c => c.id === b.dataset.cmenu)[0], draw));
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
      try { await DB.community.addComment(id, v); inp.value = ''; await draw(); }
      catch (e) { toast(e.message || '남기지 못했어요', 'err'); }
      finally { inp.disabled = false; inp.focus(); }
    };
    ov.querySelector('#dSend').onclick = send;
    ov.querySelector('#dIn').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); send(); }
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
    if (AM_ADMIN) btns.push('<button class="btn ghost block" type="button" data-a="hide">' +
      (found.hidden ? '다시 보이기' : '숨기기') + '</button>');
    if (!btns.length) return;

    const ov = sheet({ title: '댓글', body: '<div style="display:grid;gap:8px">' + btns.join('') + '</div>' });
    ov.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      closeSheet();
      try {
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
          if (!await confirmSheet('댓글을 지울까요?', '', '지우기', true)) return;
          await DB.community.removeComment(commentId);
        }
        if (a === 'hide') await DB.community.hideComment(commentId, !found.hidden);
        after && after();
      } catch (e) { toast(e.message || '바꾸지 못했어요', 'err'); }
    });
  }

  /* ============================================================
     사진 모아보기
     ============================================================ */
  async function photoWall() {
    const ov = sheet({ title: '사진 모아보기', body: '<div id="wall" class="mut sm">불러오는 중…</div>' });
    let res;
    try { res = await DB.community.feed({ type: 'review', limit: 50 }); }
    catch (e) { ov.querySelector('#wall').textContent = '불러오지 못했어요'; return; }
    const shots = [];
    (res.rows || []).forEach(r => (r.photos || []).forEach(p => shots.push(p)));
    if (!shots.length) { ov.querySelector('#wall').innerHTML = '<div class="mut sm">아직 사진이 없어요</div>'; return; }
    ov.querySelector('#wall').innerHTML =
      '<div class="grid-shots">' + shots.map(p =>
        '<img alt="봉사 사진" data-path="' + esc(p) + '">').join('') + '</div>';
    loadPhotos(ov);
  }

  /* ============================================================
     투표 (읽고 참여하기)
     ============================================================ */
  function pollBlock(p) {
    const q = p.poll;
    const closed = !!q.closed_at || (q.closes_at && Date.parse(q.closes_at) < Date.now());
    const total = (q.options || []).reduce((t, o) => t + (o.votes || 0), 0);
    return '<div style="margin-top:10px">' +
      '<div style="font-weight:700;font-size:14.5px;margin-bottom:9px">' + esc(q.question) + '</div>' +
      (q.options || []).map(o => {
        const pct = total ? Math.round(o.votes / total * 100) : 0;
        return '<button class="opt' + (o.mine ? ' mine' : '') + '" type="button" ' +
          'data-vote="' + esc(p.id) + '" data-opt="' + esc(o.id) + '" ' +
          'data-multi="' + (q.multi ? '1' : '') + '" data-anon="' + (q.anonymous ? '1' : '') + '"' +
          (closed ? ' disabled' : '') + '>' +
          '<span class="fillbar" style="width:' + pct + '%"></span>' +
          '<span class="lb"><span class="nm">' + ic('check') + '<span>' + esc(o.label) + '</span></span>' +
          '<span class="cnt">' + num(o.votes || 0) + '명 · ' + pct + '%</span></span></button>';
      }).join('') +
      '<div class="row between" style="margin-top:7px;gap:8px">' +
      '<span class="mut" style="font-size:11.5px">' +
      (closed ? '마감됐어요' : (q.closes_at ? fmtDate(q.closes_at) + ' 마감' : '진행 중')) +
      ' · ' + num(total) + '명 참여' +
      (q.multi ? ' · 여러 개' : '') +
      (q.anonymous ? ' · 익명' : '') + '</span>' +
      (!closed && (p.mine || AM_ADMIN)
        ? '<button class="linkbtn" type="button" data-close="' + esc(p.id) + '">일찍 마감</button>'
        : '') + '</div></div>';
  }

  async function renderPolls() {
    $('#headTitle').textContent = '투표';
    $('#headLead').textContent = '모두의 생각을 모아요.';
    paint(loading());
    let res;
    try { res = await DB.community.feed({ type: 'poll', limit: 30 }); }
    catch (e) { return paint('<div class="card center" style="padding:28px"><div class="mut sm">불러오지 못했어요</div></div>'); }
    const rows = res.rows || [];
    /* 카드의 동작(투표·반응·댓글)이 F.rows 를 보고 돌아간다 */
    F.rows = rows;
    if (!rows.length) return paint(
      '<div class="card center" style="padding:28px 22px">' +
      illus('emptyPoll') +
      '<h3 style="margin-top:12px;font-size:17px">아직 투표가 없어요</h3></div>');
    /* 구성원에게 중요한 건 지금 참여할 수 있는 투표다.
       마감된 것은 아래로 내린다 */
    const closedOf = p => {
      const q = p.poll || {};
      return !!(q.closed_at || (q.closes_at && Date.parse(q.closes_at) < Date.now()));
    };
    const live = rows.filter(p => !closedOf(p));
    const done = rows.filter(closedOf);

    paint(
      (live.length
        ? '<div class="section-title">' + ic('clipboard') + '<span>진행 중</span></div>' +
          live.map(postCard).join('')
        : '<div class="card center" style="padding:26px 22px">' + illus('emptyPoll', 'sm') +
          '<h3 style="margin-top:10px;font-size:16px">지금 진행 중인 투표가 없어요</h3></div>') +
      (done.length
        ? '<div class="section-title" style="margin-top:16px">' + ic('check') +
          '<span>마감된 투표</span></div>' + done.map(postCard).join('')
        : ''));
    bindOnce();
    loadPhotos($('#view'));
  }

  /* ---------- 투표하기 ---------- */
  /* 누르면 화면부터 바로 바꾸고, 실패하면 되돌린다 */
  async function castVote(btn) {
    const postId = btn.dataset.vote, optId = btn.dataset.opt;
    const multi = !!btn.dataset.multi;
    const row = findRow(postId);
    if (!row || !row.poll) return;

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

    try { await DB.community.vote(postId, optId, multi); }
    catch (e) {
      row.poll.options = before;
      redrawPoll(postId);
      toast(e.message || '투표하지 못했어요', 'err');
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
    if (!await confirmSheet('투표를 지금 마감할까요?', '마감하면 더 이상 바꿀 수 없어요.', '마감', false)) return;
    try {
      await DB.community.closePoll(postId);
      const row = findRow(postId);
      if (row && row.poll) row.poll.closed_at = new Date().toISOString();
      redrawPoll(postId);
      toast('마감했어요', 'ok');
    } catch (e) { toast(e.message || '마감하지 못했어요', 'err'); }
  }

  /* ---------- 투표 만들기 (운영진만) ----------
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
      title: '투표 만들기',
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
      '<div id="shelters"></div>');

    let evs = [];
    try { evs = await DB.events.list(); } catch (e) {
      return paint('<div class="card center" style="padding:28px 22px">' + illus('error') +
        '<h3 style="margin-top:12px;font-size:16px">일정을 불러오지 못했어요</h3>' +
        '<div style="margin-top:14px"><button class="btn primary" type="button" id="rt">다시 시도</button></div></div>');
    }

    const today = new Date().toISOString().slice(0, 10);
    const soon = evs.filter(e => String(e.date) >= today)
      .sort((x, y) => String(x.date).localeCompare(String(y.date)));
    const past = evs.filter(e => String(e.date) < today)
      .sort((x, y) => String(y.date).localeCompare(String(x.date))).slice(0, 12);

    /* 신청 현황은 일정마다, 내 신청 여부는 id 로 한 번에 */
    const info = {};
    for (let i = 0; i < soon.length; i++) {
      try { info[soon[i].id] = await DB.eventPublic(soon[i].id); } catch (e) { }
    }
    let mineIds = [], waits = [];
    try { mineIds = await DB.community.mySignups(); } catch (e) { }
    try { waits = await DB.community.myWaitlist(); } catch (e) { }
    const waitOf = id => (waits.filter(w => w.event_id === id)[0] || null);

    $('#soon').innerHTML = soon.length
      ? '<div class="section-title">' + ic('calendar') + '<span>다가오는 봉사</span></div>' +
        soon.map(e => volCard(e, info[e.id], mineIds.indexOf(e.id) >= 0, waitOf(e.id))).join('')
      : '<div class="card center" style="padding:26px 22px">' + illus('emptyFeed', 'sm') +
        '<h3 style="margin-top:10px;font-size:16px">다가오는 봉사가 없어요</h3>' +
        '<p class="mut sm" style="margin-top:6px">일정이 올라오면 여기에 보여요.</p></div>';

    /* 지난 봉사에 후기가 몇 개 달렸는지 */
    let reviews = [];
    try {
      const r = await DB.community.feed({ type: 'review', limit: 50 });
      reviews = (r && r.rows) || [];
    } catch (e) { }
    const cnt = id => reviews.filter(x => x.event_id === id).length;

    paintShelters(reviews);

    $('#past').innerHTML = past.length
      ? '<div class="section-title" style="margin-top:16px">' + ic('clock') + '<span>지난 봉사</span></div>' +
        '<div class="card" style="padding:4px 16px">' + past.map(e => {
          const n = cnt(e.id);
          const went = mineIds.indexOf(e.id) >= 0;
          return '<button class="pastrow" type="button" data-past="' + esc(e.id) + '">' +
            '<span class="nm">' + fmtDate(e.date) +
            (e.place ? ' · ' + esc(e.place) : '') +
            (e.confirmed_at ? '' : ' <span class="badge">확정 전</span>') + '</span>' +
            (went && !n
              ? '<span class="go">후기 쓰기</span>'
              : '<span class="rt">후기 ' + n + '개</span>') + '</button>';
        }).join('') +
        '</div>'
      : '';
  }

  /* ---------- 보호소 안내 ---------- */
  function paintShelters(reviews) {
    const box = $('#shelters');
    if (!box) return;
    const list = placeInfo();
    if (!list.length) { box.innerHTML = ''; return; }

    const recent = p => (reviews || [])
      .filter(r => r.place === p.name).slice(0, 3);

    box.innerHTML =
      '<div class="section-title" style="margin-top:16px">' + ic('home') + '<span>보호소 안내</span></div>' +
      list.map(p => {
        const rs = recent(p);
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

  function volCard(e, pub, mine, wait) {
    const taken = (pub && Number(pub.taken)) || 0;
    const cap = Number(e.capacity) || 0;
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

  /* 누르면 바로 바뀌고, 안 되면 쉬운 말로 알린다 */
  const SIGNUP_MSG = {
    dup: '이미 신청하셨어요', full: '자리가 다 찼어요',
    closed: '아직 신청을 받지 않아요', before: '아직 신청 기간이 아니에요',
    nomatch: '로그인이 풀렸어요. 다시 들어와주세요',
    noevent: '없는 일정이에요'
  };

  async function doWait(id, leave) {
    try {
      const r = leave ? await DB.community.waitLeave(id) : await DB.community.waitJoin(id);
      if (r === 'notfull') { return doSignup(id, false); }
      if (r !== 'ok') throw new Error(SIGNUP_MSG[r] || '처리하지 못했어요');
      toast(leave ? '대기를 취소했어요' : '대기 신청했어요', 'ok');
      renderVol();
    } catch (e) { toast(e.message || '처리하지 못했어요', 'err'); renderVol(); }
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

  async function doSignup(id, cancel) {
    const btn = $('#view').querySelector('[data-' + (cancel ? 'cancel' : 'signup') + '="' + id + '"]');
    if (btn) { btn.disabled = true; btn.textContent = cancel ? '취소 중…' : '신청 중…'; }
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
      (AM_ADMIN ? '<a class="btn soft block" href="admin.html">운영진 화면으로</a>' : '') +
      '<div class="linkline"><a href="guide.html">사용법 보기 →</a></div>' +
      '<button class="btn ghost block sm" id="out">로그아웃</button>');
    $('#out').onclick = () => { DB.memberLogout(); location.reload(); };
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
        return '<b>' + esc(n.who || '?') + '</b>님이 ' + (EMOJI[n.react] || '') + ' 반응을 달았어요';
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
