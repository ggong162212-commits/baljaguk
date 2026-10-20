/* ============================================================
   발자국 커뮤니티
   홈(피드) · 봉사 · 투표 · 나  — 하단 탭 4개
   me.js 가 본인 확인을 마치면 여기로 넘겨준다.
   ============================================================ */
window.Community = (function () {
  const {
    $, $$, esc, toast, sheet, closeSheet, confirmSheet,
    won, num, fmtDate, relTime, avatar, resizeImage, cheer
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

    $('#headTitle').textContent = '발자국';
    $('#footLink').hidden = true;

    const bar = $('#tabbar');
    bar.innerHTML = TABS.map(t =>
      '<button type="button" data-tab="' + t.id + '">' +
      '<span class="i">' + ic(t.icon) + '</span>' + t.label + '</button>').join('');
    $$('#tabbar [data-tab]').forEach(b =>
      b.addEventListener('click', () => go(b.dataset.tab)));
    bar.hidden = false;

    const fab = $('#fab');
    fab.innerHTML = ic('plus');
    fab.onclick = () => writeSheet();

    go('home');
  }

  function go(tab) {
    cur = tab;
    $$('#tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    $('#fab').hidden = tab !== 'home';
    window.scrollTo(0, 0);
    if (tab === 'home') return renderHome(true);
    if (tab === 'vol') return renderVol();
    if (tab === 'poll') return renderPolls();
    return renderMe();
  }

  const paint = html => { $('#view').innerHTML = html; };
  const loading = () => '<div class="card center" style="padding:30px"><div class="mut sm">불러오는 중…</div></div>';

  /* ============================================================
     홈 — 피드
     ============================================================ */
  async function renderHome(reset) {
    if (reset) { F.rows = []; F.cursor = null; F.done = false; F.pinned = null; }
    $('#headLead').textContent = '우리가 함께 걸은 기록이에요.';

    paint(
      '<div id="pin"></div>' +
      '<div class="chips" id="chips"></div>' +
      '<div id="list">' + loading() + '</div>' +
      '<div id="more"></div>');

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
      mk('photos', '사진 모아보기', false) +
      places.map(p => mk('place:' + p, p, F.place === p)).join('');

    $$('#chips [data-chip]').forEach(b => b.addEventListener('click', async () => {
      const k = b.dataset.chip;
      if (k === 'photos') return photoWall();
      if (k === 'all') { F.type = null; F.place = null; }
      else if (k.indexOf('place:') === 0) { F.type = null; F.place = k.slice(6); }
      else { F.type = k; F.place = null; }
      await renderHome(true);
    }));
  }

  /* 설정에 적힌 봉사지 목록 — 없으면 피드에 나온 곳으로 */
  function placeList() {
    const s = (window.__settings || {});
    const fromSettings = Array.isArray(s.places) ? s.places.filter(Boolean) : [];
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
      if (first) $('#list').innerHTML =
        '<div class="card center" style="padding:28px"><div class="mut sm">' +
        '피드를 불러오지 못했어요. 새로고침해주세요.</div></div>';
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
    bindCards($('#list'));
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
    return '<div class="card center" style="padding:32px 22px">' +
      '<div style="font-size:30px">🐾</div>' +
      '<h3 style="margin-top:10px;font-size:17px">아직 글이 없어요</h3>' +
      '<p class="mut sm" style="margin-top:8px;line-height:1.6">' +
      '첫 봉사 후기를 남겨보세요.<br>다녀온 날과 보호소를 고르면 돼요.</p>' +
      '<div style="margin-top:14px"><button class="btn soft" type="button" data-write>글쓰기</button></div></div>';
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
    const hiddenByAdmin = p.hidden;
    const who = p.author || { name: '?' };
    return '<article class="card post" data-post="' + esc(p.id) + '">' +
      '<div class="who">' + avatar(who) +
      '<div class="grow"><div class="nm">' + esc(who.name) +
      (who.role === 'admin' ? ' <span class="badge admin">운영진</span>' : '') + '</div>' +
      '<div class="at">' + relTime(p.created_at) +
      (p.edited_at ? ' · 수정됨' : '') + '</div></div>' +
      '<button class="iconbtn sm" type="button" data-menu="' + esc(p.id) + '" aria-label="더보기">' +
      ic('chevron') + '</button></div>' +

      (hiddenByAdmin
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
      (p.poll ? pollBlock(p) : '') +
      reactRow(p) +

      '<div class="row" style="margin-top:10px;gap:8px">' +
      '<button class="btn ghost sm grow" type="button" data-cmt="' + esc(p.id) + '">' +
      ic('mail') + '<span>댓글 ' + (p.comment_count || 0) + '</span></button></div>' +
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

  function reactRow(p) {
    const counts = p.reactions || {};
    const mine = p.my_reactions || [];
    const shown = KINDS.filter(k => counts[k]);
    return '<div class="reacts" data-reacts="' + esc(p.id) + '">' +
      shown.map(k =>
        '<button class="react' + (mine.indexOf(k) >= 0 ? ' on' : '') + '" type="button" ' +
        'data-k="' + k + '" title="' + EMOJI_NAME[k] + '">' +
        '<span>' + EMOJI[k] + '</span><span class="n">' + counts[k] + '</span></button>').join('') +
      '<button class="react add" type="button" data-pick="1" aria-label="반응 달기">' +
      ic('plus') + '</button></div>';
  }

  /* ---------- 카드 안의 버튼들 ---------- */
  function bindCards(root) {
    /* 반응 — 누르면 켜고 끈다. 길게 누르면 누가 눌렀는지 */
    root.querySelectorAll('[data-reacts]').forEach(box => {
      const id = box.dataset.reacts;
      box.querySelectorAll('[data-k]').forEach(b => {
        let timer = null, held = false;
        const who = () => { held = true; whoSheet(id, b.dataset.k); };
        b.addEventListener('pointerdown', () => { held = false; timer = setTimeout(who, 500); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev =>
          b.addEventListener(ev, () => clearTimeout(timer)));
        b.addEventListener('click', async () => {
          if (held) { held = false; return; }
          await hitReaction(id, b.dataset.k);
        });
        b.addEventListener('contextmenu', e => { e.preventDefault(); who(); });
      });
      const add = box.querySelector('[data-pick]');
      if (add) add.onclick = () => pickReaction(id);
    });

    root.querySelectorAll('[data-cmt]').forEach(b =>
      b.addEventListener('click', () => commentSheet(b.dataset.cmt)));

    root.querySelectorAll('[data-menu]').forEach(b =>
      b.addEventListener('click', () => postMenu(b.dataset.menu)));

    /* 사진을 넘기면 아래 점도 같이 움직인다 */
    root.querySelectorAll('[data-shots]').forEach(box => {
      const dots = root.querySelector('[data-dots="' + box.dataset.shots + '"]');
      if (!dots) return;
      box.addEventListener('scroll', () => {
        const i = Math.round(box.scrollLeft / Math.max(1, box.clientWidth));
        Array.prototype.forEach.call(dots.children, (d, n) => d.classList.toggle('on', n === i));
      });
    });
  }

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
      refreshReacts(id);
    } catch (e) { toast(e.message || '반응을 달지 못했어요', 'err'); }
  }

  function refreshReacts(id) {
    const row = findRow(id);
    const box = $('#view').querySelector('[data-reacts="' + id + '"]');
    if (!row || !box) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = reactRow(row);
    box.replaceWith(wrap.firstChild);
    bindCards($('#view'));
  }

  function pickReaction(id) {
    const ov = sheet({
      title: '반응 달기',
      body: '<div class="row" style="flex-wrap:wrap;gap:9px;justify-content:center;padding:6px 0">' +
        KINDS.map(k =>
          '<button class="react" type="button" data-pk="' + k + '" ' +
          'style="flex-direction:column;gap:3px;padding:12px 14px;font-size:24px">' +
          '<span>' + EMOJI[k] + '</span>' +
          '<span class="n">' + EMOJI_NAME[k] + '</span></button>').join('') + '</div>'
    });
    ov.querySelectorAll('[data-pk]').forEach(b => b.onclick = async () => {
      closeSheet(); await hitReaction(id, b.dataset.pk);
    });
  }

  async function whoSheet(id, kind) {
    const ov = sheet({
      title: EMOJI[kind] + ' ' + EMOJI_NAME[kind],
      body: '<div id="whoList" class="mut sm">불러오는 중…</div>'
    });
    try {
      const names = await DB.community.reactionWho(id, kind);
      ov.querySelector('#whoList').innerHTML = names.length
        ? names.map(n => '<div class="kv"><span class="k">' + esc(n) + '</span></div>').join('')
        : '<div class="mut sm">아직 없어요</div>';
    } catch (e) {
      ov.querySelector('#whoList').textContent = '불러오지 못했어요';
    }
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
  async function writeSheet() {
    let acts = [];
    try {
      const a = await DB.myActivity();
      acts = (a && a.records) || [];
    } catch (e) { /* 못 불러와도 직접 입력으로 쓸 수 있다 */ }

    const places = placeList();
    const ov = sheet({
      title: '봉사 후기 쓰기',
      body:
        '<label class="field"><span class="lb">어느 봉사인가요</span>' +
        '<select class="input" id="wEv">' +
        acts.map((r, i) =>
          '<option value="' + i + '">' + fmtDate(r.date) +
          (r.place ? ' · ' + esc(r.place) : '') + '</option>').join('') +
        '<option value="own">직접 입력</option></select></label>' +

        '<div id="wOwn" hidden>' +
        '<div class="grid2">' +
        '<label class="field"><span class="lb">날짜</span>' +
        '<input class="input" type="date" id="wDate"></label>' +
        '<label class="field"><span class="lb">보호소</span>' +
        '<select class="input" id="wPlace">' +
        places.map(p => '<option>' + esc(p) + '</option>').join('') +
        '</select></label></div></div>' +

        '<label class="field"><span class="lb">사진 (최대 5장)</span>' +
        '<input class="input" type="file" id="wPhotos" accept="image/*" multiple></label>' +
        '<div class="row" id="wThumbs" style="gap:6px;flex-wrap:wrap"></div>' +
        '<p class="pill-note" style="margin-top:8px">다른 부원 얼굴이 나오면 동의를 받아 주세요.</p>' +

        '<label class="field" style="margin-top:12px"><span class="lb">어떤 하루였나요</span>' +
        '<textarea class="input" id="wBody" rows="5" placeholder="오늘 만난 아이들, 기억에 남는 순간…"></textarea></label>' +

        '<button class="btn primary lg block" type="button" id="wSave">올리기</button>'
    });

    const sel = ov.querySelector('#wEv');
    const own = ov.querySelector('#wOwn');
    if (!acts.length) { sel.value = 'own'; own.hidden = false; }
    sel.addEventListener('change', () => { own.hidden = sel.value !== 'own'; });

    /* 사진은 올리기 전에 줄인다. 줄이면서 위치정보도 떨어져 나간다 */
    let shots = [];
    ov.querySelector('#wPhotos').addEventListener('change', async e => {
      const files = Array.prototype.slice.call(e.target.files || []).slice(0, 5);
      shots = [];
      ov.querySelector('#wThumbs').innerHTML = '<span class="mut sm">사진 줄이는 중…</span>';
      for (let i = 0; i < files.length; i++) {
        try { shots.push(await resizeImage(files[i], 1600, .82)); }
        catch (err) { toast(err.message || '사진 하나를 못 읽었어요', 'err'); }
      }
      ov.querySelector('#wThumbs').innerHTML = shots.map(s =>
        '<img src="' + s + '" alt="" style="width:54px;height:54px;object-fit:cover;border-radius:11px">').join('');
    });

    ov.querySelector('#wSave').onclick = async () => {
      const body = ov.querySelector('#wBody').value.trim();
      let date = null, place = null, eventId = null;
      if (sel.value === 'own') {
        date = ov.querySelector('#wDate').value || null;
        place = ov.querySelector('#wPlace').value || null;
        if (!date) return toast('날짜를 골라주세요', 'err');
      } else {
        const r = acts[Number(sel.value)];
        if (r) { date = r.date; place = r.place; eventId = r.event_id || null; }
      }
      if (!body && !shots.length) return toast('글이나 사진을 넣어주세요', 'err');

      const btn = ov.querySelector('#wSave');
      btn.disabled = true; btn.textContent = '올리는 중…';
      try {
        await DB.community.createPost({
          type: 'review', event_id: eventId, date, place, body, photos: shots
        });
        closeSheet();
        cheer && cheer();
        toast('올렸어요!', 'ok');
        renderHome(true);
      } catch (e) {
        toast(e.message || '올리지 못했어요', 'err');
        btn.disabled = false; btn.textContent = '올리기';
      }
    };
  }

  /* ============================================================
     댓글
     ============================================================ */
  async function commentSheet(postId) {
    const ov = sheet({
      title: '댓글',
      body: '<div id="cList" class="mut sm">불러오는 중…</div>' +
        '<div class="divider"></div>' +
        '<label class="field"><span class="lb">댓글 쓰기</span>' +
        '<textarea class="input" id="cBody" rows="2" placeholder="따뜻한 말 한마디"></textarea></label>' +
        '<button class="btn primary block" type="button" id="cSend">남기기</button>'
    });

    async function draw() {
      let list = [];
      try { list = await DB.community.comments(postId); }
      catch (e) { ov.querySelector('#cList').textContent = '불러오지 못했어요'; return; }
      ov.querySelector('#cList').innerHTML = list.length
        ? list.map(c =>
          '<div class="row" style="gap:8px;align-items:flex-start;padding:9px 0;' +
          'border-bottom:1px dashed var(--line-2)">' +
          avatar(c.author || { name: '?' }, 'sm') +
          '<div class="grow"><div class="sm"><b>' + esc((c.author || {}).name || '?') + '</b> ' +
          '<span class="mut" style="font-size:11.5px">' + relTime(c.created_at) +
          (c.edited_at ? ' · 수정됨' : '') + '</span></div>' +
          '<div class="sm" style="margin-top:3px;line-height:1.6;white-space:pre-wrap">' +
          (c.hidden ? '<span class="mut">운영진이 숨긴 댓글이에요</span>' : esc(c.body)) + '</div></div>' +
          (c.mine || AM_ADMIN
            ? '<button class="iconbtn sm" type="button" data-cm="' + esc(c.id) + '" aria-label="더보기">' +
            ic('chevron') + '</button>' : '') +
          '</div>').join('')
        : '<div class="mut sm">아직 댓글이 없어요. 처음 남겨보세요.</div>';

      ov.querySelectorAll('[data-cm]').forEach(b => b.onclick = () => {
        const c = list.filter(x => x.id === b.dataset.cm)[0];
        commentMenu(c, draw);
      });
    }

    ov.querySelector('#cSend').onclick = async () => {
      const t = ov.querySelector('#cBody');
      const v = t.value.trim();
      if (!v) return toast('내용을 적어주세요', 'err');
      try {
        await DB.community.addComment(postId, v);
        t.value = '';
        const row = findRow(postId);
        if (row) row.comment_count = (row.comment_count || 0) + 1;
        await draw();
      } catch (e) { toast(e.message || '남기지 못했어요', 'err'); }
    };

    draw();
  }

  function commentMenu(c, after) {
    if (!c) return;
    const btns = [];
    if (c.mine) {
      btns.push('<button class="btn ghost block" type="button" data-a="edit">고치기</button>');
      btns.push('<button class="btn ghost block" type="button" data-a="del">지우기</button>');
    }
    if (AM_ADMIN) btns.push('<button class="btn ghost block" type="button" data-a="hide">' +
      (c.hidden ? '다시 보이기' : '숨기기') + '</button>');

    const ov = sheet({ title: '댓글', body: '<div style="display:grid;gap:8px">' + btns.join('') + '</div>' });
    ov.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
      const a = b.dataset.a;
      closeSheet();
      try {
        if (a === 'edit') {
          const ov2 = sheet({
            title: '댓글 고치기',
            body: '<label class="field"><textarea class="input" id="ceB" rows="3">' +
              esc(c.body) + '</textarea></label>' +
              '<button class="btn primary block" type="button" id="ceS">저장</button>'
          });
          ov2.querySelector('#ceS').onclick = async () => {
            const v = ov2.querySelector('#ceB').value.trim();
            closeSheet();
            await DB.community.updateComment(c.id, v);
            after();
          };
          return;
        }
        if (a === 'del') {
          if (!await confirmSheet('댓글을 지울까요?', '', '지우기', true)) return;
          await DB.community.removeComment(c.id);
        }
        if (a === 'hide') await DB.community.hideComment(c.id, !c.hidden);
        after();
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
          'data-vote="' + esc(p.id) + '" data-opt="' + esc(o.id) + '"' + (closed ? ' disabled' : '') + '>' +
          '<span class="fillbar" style="width:' + pct + '%"></span>' +
          '<span class="lb"><b>' + esc(o.label) + '</b>' +
          '<span class="mut sm">' + num(o.votes || 0) + '명 · ' + pct + '%</span></span></button>';
      }).join('') +
      '<div class="mut" style="font-size:11.5px;margin-top:6px">' +
      (closed ? '마감됐어요' : (q.closes_at ? fmtDate(q.closes_at) + ' 마감' : '진행 중')) +
      (q.multi ? ' · 여러 개 고를 수 있어요' : '') +
      (q.anonymous ? ' · 익명' : '') + '</div></div>';
  }

  async function renderPolls() {
    $('#headLead').textContent = '모두의 생각을 모아요.';
    paint(loading());
    let res;
    try { res = await DB.community.feed({ type: 'poll', limit: 30 }); }
    catch (e) { return paint('<div class="card center" style="padding:28px"><div class="mut sm">불러오지 못했어요</div></div>'); }
    const rows = res.rows || [];
    if (!rows.length) return paint(
      '<div class="card center" style="padding:32px 22px">' +
      '<div style="font-size:28px">🐾</div>' +
      '<h3 style="margin-top:10px;font-size:17px">아직 투표가 없어요</h3>' +
      '<p class="mut sm" style="margin-top:8px">누구나 만들 수 있어요.</p></div>');
    paint(rows.map(postCard).join(''));
    bindCards($('#view'));
    bindVotes($('#view'));
    loadPhotos($('#view'));
  }

  function bindVotes(root) {
    root.querySelectorAll('[data-vote]').forEach(b => b.addEventListener('click', async () => {
      toast('투표는 다음 단계에서 열려요');
    }));
  }

  /* ============================================================
     봉사 탭
     ============================================================ */
  async function renderVol() {
    $('#headLead').textContent = '다가오는 봉사와 지난 기록이에요.';
    paint('<div class="card"><h3>봉사 일정</h3>' +
      '<div class="sub">신청과 취소는 봉사 화면에서 할 수 있어요.</div><div class="sp"></div>' +
      '<a class="btn primary block" href="volunteer.html">봉사 일정 열기</a></div>' +
      '<div id="past">' + loading() + '</div>');

    let a = null;
    try { a = await DB.myActivity(); } catch (e) { }
    const recs = (a && a.records) || [];
    $('#past').innerHTML = recs.length
      ? '<div class="card"><h3>내가 다녀온 봉사</h3><div class="sp"></div>' +
      recs.map(r => '<div class="kv"><span class="k">' + fmtDate(r.date) +
        (r.place ? ' · ' + esc(r.place) : '') + '</span>' +
        '<span class="v">' + (Number(r.per) > 0 ? '+' + won(r.per) : '<span class="mut">적립 없음</span>') +
        '</span></div>').join('') + '</div>'
      : '<div class="card center" style="padding:26px"><div class="mut sm">아직 다녀온 봉사가 없어요</div></div>';
  }

  /* ============================================================
     나
     ============================================================ */
  async function renderMe() {
    $('#headLead').textContent = ME.name + '님의 발자국이에요.';
    paint(
      '<div class="card mecard" style="text-align:center;padding:30px 22px">' +
      '<span class="big" style="width:72px;height:72px;border-radius:26px;display:grid;' +
      'place-items:center;margin:0 auto;font-family:var(--font-title);font-size:30px;' +
      'background:var(--brand-soft);color:var(--brand-deep)">' +
      esc(String(ME.name).slice(0, 1)) + '</span>' +
      '<h3 style="margin-top:14px;font-size:19px">' + esc(ME.name) +
      (ME.role === 'admin' ? ' <span class="badge admin">운영진</span>' : '') + '</h3>' +
      '</div>' +
      '<div id="act">' + loading() + '</div>' +
      (AM_ADMIN ? '<a class="btn soft block" href="admin.html">운영진 화면으로</a>' : '') +
      '<div class="linkline"><a href="guide.html">사용법 보기 →</a></div>' +
      '<button class="btn ghost block sm" id="out">로그아웃</button>');
    $('#out').onclick = () => { DB.memberLogout(); location.reload(); };
    await loadActivity();
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
        '<div style="font-size:30px">🐾</div>' +
        '<h3 style="margin-top:10px;font-size:17px">아직 첫 봉사 전이에요</h3>' +
        '<p class="mut sm" style="margin-top:8px;line-height:1.6">' +
        '다녀오시면 여기에 횟수와 쌓인 적립금이 모여요.</p>' +
        '<div style="margin-top:14px">' +
        '<a class="btn soft" href="volunteer.html">봉사 일정 보기</a></div></div>';
      return;
    }

    const places = Array.isArray(a.places) ? a.places : [];
    const records = Array.isArray(a.records) ? a.records : [];
    const credit = Number(a.credit_total) || 0;

    box.innerHTML =
      '<div class="card">' +
      '<div class="row" style="gap:0">' +
      '<div style="flex:1;text-align:center">' +
      '<div class="money" style="font-size:26px;color:var(--brand-deep)">' + num(times) + '</div>' +
      '<div class="mut" style="font-size:12px;margin-top:2px">봉사 횟수</div></div>' +
      '<div style="width:1px;align-self:stretch;background:var(--line-2)"></div>' +
      '<div style="flex:1;text-align:center">' +
      '<div class="money" style="font-size:26px;color:var(--brand-deep)">' + won(credit) + '</div>' +
      '<div class="mut" style="font-size:12px;margin-top:2px">내가 쌓은 적립금</div></div></div>' +
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
          '<span class="v">' + won(p.credit) + '</span></div>').join('') + '</div>'
        : '') +

      '<div class="card"><h3>내 봉사 기록</h3>' +
      '<div class="sub">운영진이 확정한 봉사만 보여요.</div><div class="sp"></div>' +
      records.map(r =>
        '<div class="kv"><span class="k">' + fmtDate(r.date) +
        (r.place ? ' · ' + esc(r.place) : '') + '</span>' +
        '<span class="v">' + (Number(r.per) > 0 ? '+' + won(r.per) : '<span class="mut">적립 없음</span>') +
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
      '<div class="row" style="gap:10px;flex-wrap:wrap">' +
      list.map(b =>
        '<div style="flex:1;min-width:66px;text-align:center;opacity:' + (b.on ? '1' : '.35') + '">' +
        '<div style="width:44px;height:44px;margin:0 auto;border-radius:16px;display:grid;' +
        'place-items:center;background:' + (b.on ? 'var(--brand-soft)' : 'var(--surface-2)') +
        ';color:' + (b.on ? 'var(--brand-deep)' : 'var(--ink-3)') + '">' + ic(b.icon) + '</div>' +
        '<div class="sm" style="margin-top:5px;font-size:11.5px;font-weight:700">' + b.label + '</div></div>').join('') +
      '</div></div>';
  }

  return { start };
})();
