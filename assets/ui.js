/* ============================================================
   공통 UI 유틸
   ============================================================ */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- 테마 ---------- */
  function initTheme() {
    const saved = localStorage.getItem('baljaguk.theme');
    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = saved || sys;
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('baljaguk.theme', next);
    paintThemeButtons();
  }
  function paintThemeButtons() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $$('[data-theme-btn]').forEach(b => {
      b.innerHTML = window.ic(dark ? 'sun' : 'moon');
      b.setAttribute('aria-label', dark ? '밝은 화면으로' : '어두운 화면으로');
    });
  }

  /* ---------- 토스트 ---------- */
  /* 화면에 영어가 그대로 뜨지 않게 — 마지막 그물.
     ------------------------------------------------------------
     쓰는 곳마다 챙기면 꼭 빠뜨린다(비상 로그인·사진 올리기·단계형 입력에서
     「Failed to fetch」가 그대로 떴다). 토스트 한 곳에서 거른다.
     한글이 섞여 있으면 그대로 둔다 — 우리가 쓴 말이다. */
  function human(msg) {
    const m = String(msg == null ? '' : msg).trim();
    if (!m) return '잠시 뒤 다시 해 주세요';
    if (/[가-힣]/.test(m)) return m;
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return '인터넷 연결을 확인해 주세요';
    if (/row-level security|permission denied|not allowed/i.test(m)) return '권한이 없어요';
    if (/duplicate key|already exists|conflict/i.test(m)) return '이미 처리됐어요';
    if (/JWT|token|unauthorized|not authenticated/i.test(m)) return '다시 로그인해 주세요';
    if (/invalid login|invalid credentials|bad credential/i.test(m)) return '계정이나 비밀번호가 맞지 않아요';
    if (/rate limit|too many/i.test(m)) return '잠시 뒤에 다시 해 주세요';
    if (/foreign key/i.test(m)) return '없어진 것 같아요. 새로고침 해주세요';
    if (/timeout|aborted/i.test(m)) return '응답이 늦어요. 다시 해 주세요';
    /* 영어만 있는 것은 사람에게 보이지 않는다 — 콘솔에만 */
    console.warn('[발자국] 원래 오류:', m);
    return '잠시 뒤 다시 해 주세요';
  }

  function toast(msg, type) {
    if (type === 'err') msg = human(msg);
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 2400);
  }

  /* ---------- 바텀시트 / 모달 ---------- */
  let lastFocus = null;
  /* ── 키보드가 올라오면 아래 버튼줄을 그 위로 올린다.
     댓글 시트에만 있던 것을 모든 시트가 받게 옮겼다.
     아이폰 SE 처럼 화면이 짧으면 키보드가 저장 버튼을 통째로 가린다. */
  function fitKeyboard(ov) {
    if (!window.visualViewport || !ov) return;
    const vv = window.visualViewport;
    const foot = ov.querySelector('.sheet-foot');
    const fit = () => {
      if (!foot) return;
      /* ★ 본문에 아래 여백을 더하지 않는다.
         안드로이드 크롬은 키보드가 올라와도 innerHeight 가 안 줄어서
         여백을 더하면 입력칸이 화면 밖으로 밀려난다.
         (「안드로이드에서 댓글 입력창이 이상해요」) */
      const gap = Math.max(0, innerHeight - vv.height - vv.offsetTop);
      foot.style.transform = gap ? 'translateY(-' + gap + 'px)' : '';
    };
    vv.addEventListener('resize', fit);
    vv.addEventListener('scroll', fit);
    ov.__fit = fit;
    /* 시트를 닫을 때 떼어낸다 — 안 떼면 닫힌 시트를 계속 붙잡는다 */
    ov.__unfit = () => {
      vv.removeEventListener('resize', fit);
      vv.removeEventListener('scroll', fit);
    };
    fit();
  }
  window.fitKeyboard = fitKeyboard;

  function sheet(opts) {
    /* 시트를 바꿔 여는 것이라 기록은 건드리지 않는다 */
    closeSheet(true);
    lastFocus = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML =
      '<div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="hd"><h3>' + (opts.title || '') + '</h3>' +
      '<button class="iconbtn" data-close aria-label="닫기">' + window.ic('x') + '</button></div>' +
      '<div class="sheet-body"></div>' +
      /* 주 버튼은 아래에 고정한다. 키보드가 올라와도 바로 위에 남는다 */
      (opts.foot ? '<div class="sheet-foot"></div>' : '') + '</div>';
    $('.sheet-body', ov).innerHTML = opts.body || '';
    if (opts.foot) $('.sheet-foot', ov).innerHTML = opts.foot;
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    /* 안드로이드 뒤로 버튼으로도 닫힌다.
       시트를 연달아 열어도 기록은 한 칸만 쓴다 */
    try {
      if (!(history.state && history.state.sheet)) history.pushState({ sheet: 1 }, '');
      window.removeEventListener('popstate', onPop);
      window.addEventListener('popstate', onPop);
    } catch (e) { }
    ov.addEventListener('click', e => { if (e.target === ov) closeSheet(); });
    $('[data-close]', ov).addEventListener('click', closeSheet);
    document.addEventListener('keydown', escClose);
    const f = ov.querySelector('input,textarea,select,button:not([data-close])');
    if (f && !opts.noFocus) setTimeout(() => f.focus(), 60);
    initGrow(ov);
    fitKeyboard(ov);
    if (opts.onMount) opts.onMount(ov);
    return ov;
  }
  function escClose(e) { if (e.key === 'Escape') closeSheet(); }
  /* 우리가 부른 history.back() 이 돌아오는 것은 무시한다.
     안 그러면 바로 뒤에 연 시트가 그 신호에 닫혀 버린다. */
  let popGuard = 0;
  function onPop() {
    if (popGuard > 0) { popGuard--; return; }
    if (document.querySelector('.avv')) return;  /* 사진 크게 보기(avatarview.js)가 먼저 닫힌다 — 시트는 그대로 */
    closeSheet(true);
  }
  function closeSheet(fromBack) {
    const ov = $('.overlay');
    if (ov) { if (ov.__unfit) ov.__unfit(); ov.remove(); }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', escClose);
    window.removeEventListener('popstate', onPop);
    /* 버튼으로 닫았으면 눌러 둔 기록을 되돌린다 */
    if (!fromBack && history.state && history.state.sheet) {
      popGuard++;
      try { history.back(); } catch (e) { popGuard--; }
    }
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { } lastFocus = null; }
  }
  function confirmSheet(title, desc, okLabel, danger) {
    return new Promise(res => {
      const ov = sheet({
        title,
        body: '<p class="mut" style="margin:0 0 18px">' + (desc || '') + '</p>' +
          '<div class="row" style="gap:8px"><button class="btn ghost grow" data-no>취소</button>' +
          '<button class="btn ' + (danger ? 'danger' : 'primary') + ' grow" data-yes>' + (okLabel || '확인') + '</button></div>'
      });
      $('[data-no]', ov).onclick = () => { closeSheet(); res(false); };
      $('[data-yes]', ov).onclick = () => { closeSheet(); res(true); };
    });
  }

  /* ---------- 여러 줄 입력칸 자동 늘리기 ----------
     모바일 브라우저에는 크기 조절 손잡이가 없어서, 글이 길어지면
     입력칸이 스스로 커지게 한다. */
  function grow(el) {
    if (!el || el.tagName !== 'TEXTAREA') return;
    el.style.height = 'auto';
    el.style.height = (el.scrollHeight + 2) + 'px';
  }
  function initGrow(root) {
    $$('textarea', root).forEach(t => {
      t.style.overflow = 'hidden';
      t.style.resize = 'none';
      grow(t);
    });
  }
  document.addEventListener('input', e => {
    if (e.target && e.target.tagName === 'TEXTAREA') grow(e.target);
  });
  document.addEventListener('DOMContentLoaded', () => initGrow());

  /* ---------- 복사 ---------- */
  async function copy(text, label) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      toast((label || '복사했어요') + ' ✓', 'ok');
      return true;
    } catch (e) { toast('복사하지 못했어요. 길게 눌러 복사해주세요', 'err'); return false; }
  }

  /* ---------- 단계형 입력 ----------
     질문이 여러 개면 한 번에 하나씩 묻는다. 고른 값은 위에 요약으로 남는다.
     steps: [{ q, hint, body, read(root), valid(v), sum(v), skip(vals) }]
     done(values) 로 끝난다. */
  function wizard(opts) {
    const steps = (opts.steps || []).slice();
    const vals = {};
    let i = 0;

    const live = () => steps.filter(st => !(st.skip && st.skip(vals)));
    const ov = sheet({
      title: opts.title || '',
      body: '<div class="wiz-prog"><div class="wiz-dots" id="wzDots"></div>' +
        '<span class="wiz-step" id="wzStep"></span></div>' +
        '<div class="wiz-sum" id="wzSum"></div>' +
        '<h3 class="wiz-q" id="wzQ"></h3>' +
        '<p class="wiz-hint" id="wzHint"></p>' +
        '<div id="wzBody"></div>',
      foot: '<div class="row" style="gap:8px">' +
        '<button class="btn ghost" type="button" id="wzBack" hidden>이전</button>' +
        '<button class="btn primary lg grow" type="button" id="wzNext">다음</button></div>'
    });

    const $$$ = sel => ov.querySelector(sel);

    function paint() {
      const list = live();
      const st = list[i];
      if (!st) return;
      $$$('#wzDots').innerHTML = list.map((x, n) =>
        '<i class="' + (n === i ? 'on' : (n < i ? 'done' : '')) + '"></i>').join('');
      $$$('#wzStep').textContent = (i + 1) + '/' + list.length;
      /* 요약 줄을 누르면 그 단계로 돌아가 고칠 수 있다 */
      $$$('#wzSum').innerHTML = list.slice(0, i).map((x, n) =>
        (x.sum && vals[x.key] !== undefined && String(vals[x.key]).trim())
          ? '<button class="it" type="button" data-go="' + n + '">' +
            '<span class="k">' + esc(x.short || '') + '</span>' +
            '<span class="v">' + esc(x.sum(vals[x.key])) + '</span></button>'
          : '').join('');
      $$$('#wzSum').querySelectorAll('[data-go]').forEach(b =>
        b.onclick = () => { i = Number(b.dataset.go); paint(); });
      $$$('#wzQ').textContent = st.q || '';
      $$$('#wzHint').textContent = st.hint || '';
      $$$('#wzHint').hidden = !st.hint;
      $$$('#wzBody').innerHTML = typeof st.body === 'function' ? st.body(vals) : (st.body || '');
      if (st.after) st.after($$$('#wzBody'), vals);
      /* 되돌아왔을 때 쓰던 값을 다시 채운다 */
      if (st.fill && vals[st.key] !== undefined) st.fill($$$('#wzBody'), vals[st.key]);
      /* 단계를 넘기면 질문이 맨 위에 보이게 */
      const bodyEl = ov.querySelector('.sheet-body');
      if (bodyEl) bodyEl.scrollTop = 0;
      $$$('#wzBack').hidden = i === 0;
      $$$('#wzNext').textContent = i === list.length - 1 ? (opts.doneLabel || '올리기') : '다음';
      /* 입력칸에서 엔터는 「다음」. 마지막 단계는 실수로 올라가지 않게 제외한다 */
      const last = i === list.length - 1;
      $$$('#wzBody').querySelectorAll('input').forEach(el => {
        el.addEventListener('keydown', e => {
          if (e.key !== 'Enter' || last) return;
          e.preventDefault();
          $$$('#wzNext').click();
        });
      });
      const first = $$$('#wzBody').querySelector('input,textarea,select');
      if (first && !first.type.match(/file|date/)) setTimeout(() => first.focus(), 60);
    }

    function wire() {
      $$$('#wzBack').onclick = () => { if (i > 0) { i -= 1; paint(); } };
      $$$('#wzNext').onclick = onNext;
      paint();
    }

    const onNext = async () => {
      const list = live();
      const st = list[i];
      const v = st.read ? st.read($$$('#wzBody')) : null;
      if (st.valid) {
        const bad = st.valid(v);
        if (bad) return toast(bad, 'err');
      }
      vals[st.key] = v;
      if (i < list.length - 1) { i += 1; return paint(); }
      const btn = $$$('#wzNext');
      btn.disabled = true; btn.textContent = '올리는 중…';
      try { await opts.done(vals); }
      catch (e) {
        toast((e && e.message) || '올리지 못했어요', 'err');
        btn.disabled = false; btn.textContent = opts.doneLabel || '올리기';
      }
    };

    /* 쓰던 게 있으면 닫기 전에 한 번 묻는다 */
    const dirty = () => {
      if (Object.keys(vals).length) return true;
      const body = ov.querySelector('#wzBody');
      if (!body) return false;
      return Array.prototype.slice.call(body.querySelectorAll('input,textarea'))
        .some(el => el.type !== 'checkbox' && String(el.value || '').trim());
    };
    const closeBtn = ov.querySelector('[data-close]');
    if (closeBtn) {
      const fresh = closeBtn.cloneNode(true);
      closeBtn.replaceWith(fresh);
      fresh.addEventListener('click', () => {
        if (!dirty()) return closeSheet();

        /* 키보드가 올라와 있으면 아래 확인이 가려진다 — 먼저 내린다 */
        try { if (document.activeElement) document.activeElement.blur(); } catch (e) { }

        /* 확인을 새 시트로 띄우면 쓰던 시트가 닫혀버린다. 같은 시트 안에서 묻는다 */
        const foot = ov.querySelector('.sheet-foot');
        if (!foot) return closeSheet();
        if (foot.dataset.asking) return;    /* 두 번 눌러도 한 번만 */
        const keep = foot.innerHTML;
        foot.dataset.asking = '1';
        foot.innerHTML =
          '<p class="sm" style="margin:0 0 10px;font-weight:700">' +
          '그만두면 쓰던 내용이 사라져요. 그만둘까요?</p>' +
          '<div class="row" style="gap:8px">' +
          '<button class="btn ghost grow" type="button" data-keep>계속 쓰기</button>' +
          '<button class="btn danger grow" type="button" data-quit>그만두기</button></div>';
        /* 긴 시트에서는 아래가 화면 밖일 수 있다 */
        try { foot.scrollIntoView({ block: 'end', behavior: 'smooth' }); } catch (e) { }
        foot.querySelector('[data-keep]').onclick = () => {
          delete foot.dataset.asking;
          foot.innerHTML = keep;
          wire();
        };
        foot.querySelector('[data-quit]').onclick = closeSheet;
      });
    }

    wire();
    return ov;
  }

  /* ---------- 포맷 ---------- */
  const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
  const num = n => (Number(n) || 0).toLocaleString('ko-KR');
  /* 적립은 봉사지마다 단위가 다르다 — 돈이면 원, 천보금처럼 사료면 kg */
  const credit = (n, unit) => (unit === 'kg')
    ? (Number(n) || 0).toLocaleString('ko-KR') + 'kg'
    : won(n);
  const unitLabel = unit => (unit === 'kg' ? '사료' : '후원금');
  function fmtDate(v) {
    if (!v) return '-';
    const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    if (isNaN(d)) return v;
    return d.getFullYear() + '.' + p2(d.getMonth() + 1) + '.' + p2(d.getDate());
  }
  function fmtDateTime(v) {
    if (!v) return '-';
    const d = new Date(v); if (isNaN(d)) return v;
    return fmtDate(v) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function weekday(v) {
    const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  }
  const p2 = n => String(n).padStart(2, '0');
  function relTime(v) {
    const diff = (Date.now() - Date.parse(v)) / 1000;
    if (isNaN(diff)) return '';
    if (diff < 60) return '방금';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + '일 전';
    return fmtDate(v);
  }
  /* 학번 정규화: 202311584 · 2023 → 23, 25 → 25 */
  function normSid(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length >= 4) {
      const y = Number(d.slice(0, 4));
      if (y >= 1990 && y <= 2099) return d.slice(2, 4);
    }
    return d;
  }
  function hyphenPhone(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  const fromLocalInput = v => v ? new Date(v).toISOString() : null;

  /* ---------- 아바타 (이니셜 + 파스텔) ---------- */
  /* 강조는 그린 하나로. 사람 구분은 같은 계열 4단계로만 한다.
     색을 인라인으로 박으면 다크 모드에서 못 바꾸니 클래스로 준다. */
  function avatar(m, cls) {
    const name = (m && m.name) || '?';
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
    const tone = 'av' + (h % 4);
    /* 운영진 왕관 같은 그림 없이 모두 이름 첫 글자로. 구분은 이름 옆 배지로 한다 */
    const face = name.slice(0, 1);
    /* 사진은 비공개 보관함에 있어 주소를 따로 받아야 한다.
       자리만 만들어 두고 community.js 가 채운다. 공개 페이지는 사진을 안 쓴다. */
    /* 어떤 화면은 photo, 어떤 화면은 표에서 그대로 온 photo_path 로 준다.
       운영진 화면 구성원 목록이 photo_path 라 사진이 안 나왔다. */
    const path = (m && (m.photo || m.photo_path)) || '';
    const photo = path ? ' data-avatar="' + esc(path) + '"' : '';
    return '<div class="avatar ' + tone + (cls ? ' ' + cls : '') + '"' + photo +
      ' aria-hidden="true">' + esc(face) + '</div>';
  }

  /* 정사각형으로 잘라서 줄인다 (프로필 사진용).
     캔버스를 거치면 위치정보(EXIF)도 함께 떨어진다 */
  /* ============================================================
     프로필 사진 자르기 — 카톡·인스타처럼 직접 맞춘다
     ------------------------------------------------------------
     가운데 동그라미 틀, 바깥은 어둡게.
     손가락으로 끌어 옮기고, 두 손가락으로 키우고 줄인다(아래 막대도).
     틀 밖으로 빈 곳이 생기지 않게 **가장 작게 키운 상태**가 바닥이다.
     라이브러리 없이 canvas + pointer 로만.
     ============================================================ */
  async function loadBitmap(file) {
    /* 아이폰 사진은 똑바로 세워서 읽는다 (EXIF 회전) */
    if (typeof createImageBitmap === 'function') {
      try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
      catch (e) { /* 아래 길로 */ }
    }
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('파일을 읽지 못했어요'));
      fr.onload = () => {
        const im = new Image();
        im.onerror = () => rej(new Error('이미지를 열지 못했어요'));
        im.onload = () => res(im);
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* 고르면 dataURL, 취소하면 null */
  async function cropPhoto(file, outSize, quality) {
    if (!file || !/^image\//.test(file.type)) throw new Error('이미지 파일만 올릴 수 있어요');
    const img = await loadBitmap(file);
    const iw = img.width, ih = img.height;
    if (!iw || !ih) throw new Error('이미지를 열지 못했어요');

    const wrap = document.createElement('div');
    wrap.className = 'cropper';
    wrap.innerHTML =
      '<div class="crop-top">사진을 끌어서 맞춰 주세요</div>' +
      '<canvas class="crop-cv"></canvas>' +
      '<div class="crop-bar">' +
      '<span class="crop-ic" aria-hidden="true">−</span>' +
      '<input type="range" class="crop-zoom" min="1" max="4" step="0.01" value="1" ' +
      'aria-label="사진 크기">' +
      '<span class="crop-ic" aria-hidden="true">+</span></div>' +
      '<div class="crop-foot">' +
      '<button class="btn ghost grow" type="button" data-cancel>취소</button>' +
      '<button class="btn primary grow" type="button" data-ok>확인</button></div>';
    document.body.appendChild(wrap);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const cv = wrap.querySelector('.crop-cv');
    const zoom = wrap.querySelector('.crop-zoom');
    const ctx = cv.getContext('2d');

    let W = 0, H = 0, D = 0, cx = 0, cy = 0;     /* 보는 칸 · 동그라미 */
    let minS = 1, scale = 1, ox = 0, oy = 0;     /* 확대 배율 · 사진 왼쪽 위 자리 */

    function layout() {
      const r = cv.getBoundingClientRect();
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      W = Math.max(1, Math.round(r.width));
      H = Math.max(1, Math.round(r.height));
      cv.width = Math.round(W * dpr);
      cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      D = Math.max(80, Math.min(W, H) - 48);
      cx = W / 2; cy = H / 2;
      /* 동그라미를 반드시 덮는 가장 작은 배율 */
      minS = Math.max(D / iw, D / ih);
      if (scale < minS) scale = minS;
      zoom.min = '1';
      zoom.max = '4';
      clamp();
      draw();
    }

    function clamp() {
      const w = iw * scale, h = ih * scale;
      const left = cx - D / 2, right = cx + D / 2;
      const top = cy - D / 2, bottom = cy + D / 2;
      /* 사진이 동그라미를 완전히 덮게 가둔다 — 빈 곳이 생기지 않게 */
      ox = Math.min(left, Math.max(right - w, ox));
      oy = Math.min(top, Math.max(bottom - h, oy));
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, W, H);
      ctx.drawImage(img, ox, oy, iw * scale, ih * scale);
      /* 동그라미 바깥만 어둡게 — 가운데는 그대로 보인다 */
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, H);
      ctx.arc(cx, cy, D / 2, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,0,0,.58)';
      ctx.fill('evenodd');
      ctx.restore();
      ctx.beginPath();
      ctx.arc(cx, cy, D / 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    /* 가운데를 기준으로 키우고 줄인다 — 보던 자리가 안 튀게 */
    function zoomTo(next, px, py) {
      const s2 = Math.max(minS, Math.min(minS * 4, next));
      const k = s2 / scale;
      ox = px - (px - ox) * k;
      oy = py - (py - oy) * k;
      scale = s2;
      clamp();
      draw();
    }

    const pts = new Map();
    let lastMid = null, lastDist = 0;

    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastMid = null; lastDist = 0;
    });
    cv.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      e.preventDefault();
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const all = Array.from(pts.values());
      const box = cv.getBoundingClientRect();

      if (all.length === 1) {
        ox += e.clientX - prev.x;
        oy += e.clientY - prev.y;
        clamp(); draw();
        return;
      }
      /* 두 손가락 — 벌린 만큼 키운다 */
      const [a, b] = all;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2 - box.left, y: (a.y + b.y) / 2 - box.top };
      if (lastDist && lastMid) {
        ox += mid.x - lastMid.x;
        oy += mid.y - lastMid.y;
        zoomTo(scale * (dist / lastDist), mid.x, mid.y);
        zoom.value = String(Math.max(1, Math.min(4, scale / minS)));
      }
      lastDist = dist; lastMid = mid;
    });
    const up = e => {
      pts.delete(e.pointerId);
      if (pts.size < 2) { lastDist = 0; lastMid = null; }
    };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    zoom.addEventListener('input', () => {
      zoomTo(minS * Number(zoom.value), cx, cy);
    });

    const onResize = () => layout();
    window.addEventListener('resize', onResize);

    /* 칸 크기가 정해진 뒤에 자리를 잡는다 */
    requestAnimationFrame(() => {
      scale = 0;            /* layout 이 minS 로 올려 준다 */
      layout();
      ox = cx - iw * scale / 2;
      oy = cy - ih * scale / 2;
      clamp(); draw();
    });

    return await new Promise(resolve => {
      const shut = val => {
        window.removeEventListener('resize', onResize);
        wrap.remove();
        document.body.style.overflow = prevOverflow;
        resolve(val);
      };
      wrap.querySelector('[data-cancel]').onclick = () => shut(null);
      wrap.querySelector('[data-ok]').onclick = () => {
        const n = outSize || 400;
        const out = document.createElement('canvas');
        out.width = n; out.height = n;
        const o = out.getContext('2d');
        /* 동그라미가 들어 있는 네모만 잘라 낸다 (저장은 정사각형) */
        const sx = (cx - D / 2 - ox) / scale;
        const sy = (cy - D / 2 - oy) / scale;
        const sSide = D / scale;
        o.drawImage(img, sx, sy, sSide, sSide, 0, 0, n, n);
        shut(out.toDataURL('image/jpeg', quality || 0.86));
      };
    });
  }

  function cropSquare(file, size, quality) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('이미지 파일만 올릴 수 있어요'));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('파일을 읽지 못했어요'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('이미지를 열지 못했어요'));
        img.onload = () => {
          const n = size || 400;
          const side = Math.min(img.width, img.height);
          const sx = (img.width - side) / 2, sy = (img.height - side) / 2;
          const c = document.createElement('canvas'); c.width = n; c.height = n;
          c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, n, n);
          res(c.toDataURL('image/jpeg', quality || .86));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- 이미지 축소 ---------- */
  function resizeImage(file, maxSide, quality) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('이미지 파일만 올릴 수 있어요'));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('파일을 읽지 못했어요'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('이미지를 열지 못했어요'));
        img.onload = () => {
          const max = maxSide || 1280;
          let { width: w, height: h } = img;
          const r = Math.min(1, max / Math.max(w, h));
          w = Math.round(w * r); h = Math.round(h * r);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          res(c.toDataURL('image/jpeg', quality || 0.72));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- CSV ---------- */
  function downloadCSV(filename, header, rows) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '﻿' + [header.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------- 축하 효과 ---------- */
  function cheer() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div'); box.className = 'confetti';
    const marks = ['🐾', '🐶', '🐱', '💚', '🌿'];
    for (let i = 0; i < 22; i++) {
      const s = document.createElement('i');
      s.textContent = marks[i % marks.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      s.style.animationDelay = (Math.random() * .5) + 's';
      s.style.fontSize = (14 + Math.random() * 14) + 'px';
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3400);
  }

  /* 글자 입력칸에서 엔터를 받을 때 — 한글 조합 중이면 흘려보낸다.
     ------------------------------------------------------------
     한글은 자음·모음을 조합하는 중에도 엔터가 들어온다.
     그대로 받으면 마지막 글자가 덜 들어간 채 보내진다 —
     본인 확인 이름이 「선고으」로 넘어가 실패하고,
     다섯 번 틀리면 한 시간 잠긴다. 댓글은 마지막 글자가 남거나
     두 번 보내진다. */
  function onEnter(el, fn) {
    if (!el) return;
    el.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      /* 조합 중 — 아직 글자가 다 안 들어왔다 */
      if (e.isComposing || e.keyCode === 229) return;
      if (e.shiftKey) return;            /* 줄 바꾸기는 그대로 */
      e.preventDefault();
      fn(e);
    });
  }

  function debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms || 200); }; }

  window.UI = {
    $, $$, initTheme, toggleTheme, paintThemeButtons, toast, sheet, closeSheet, confirmSheet,
    copy, wizard, won, num, credit, unitLabel, fmtDate, fmtDateTime, weekday, relTime, hyphenPhone, normSid, esc, avatar, initGrow,
    resizeImage, cropSquare, cropPhoto, downloadCSV, cheer, debounce, onEnter, human, toLocalInput, fromLocalInput
  };
})();
