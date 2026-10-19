/* ============================================================
   후원금 현황 (fund.html)
   · 부원·외부에 그대로 공유하는 공개 페이지
   · 금액 · 인원수 · 참여자 이름까지. 연락처·학번은 서버에서 안 내려온다
   · 이름은 적립이 쌓이는 봉사지(1인당 금액 > 0)에 다녀온 사람만
   ============================================================ */
(function () {
  const { $, $$, esc, won, num, fmtDate, fmtDateTime, toast, copy, debounce } = UI;

  const OPEN = 'baljaguk.fund.entriesOpen';
  const NEW_DAYS = 14;                       // 최근 며칠까지 NEW 로 볼지

  let data = null;
  let entriesOpen = false;
  let groupByPlace = false;                  // 칩 묶어 보기
  let me = '';                               // 내 이름 찾기
  let counted = false;                       // 숫자 올라가는 효과는 한 번만

  try { entriesOpen = localStorage.getItem(OPEN) === '1'; } catch (e) { }

  UI.initTheme();
  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    $('#brandIcon').innerHTML = ic('paw');
    $('#pawline').innerHTML = ic('paw') + ic('paw') + ic('paw');
    $('#kicker').innerHTML = ic('heart') + '<span>투명하게 공개해요</span>';
    $('#errIcon').innerHTML =
      '<span style="width:52px;height:52px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center">' +
      ic('alert') + '</span>';
    $('[data-theme-btn]').addEventListener('click', UI.toggleTheme);
    UI.paintThemeButtons();

    me = (new URLSearchParams(location.search).get('name') || '').trim();

    try {
      const s = await DB.settings.get();
      if (s && s.club_name) {
        $('#brandName').textContent = s.club_name;
        document.title = s.club_name + ' · 후원금 현황';
      }
    } catch (e) { }

    await load();
    setInterval(load, 60000);                // 1분마다 조용히 갱신
    document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); });
  }

  async function load() {
    try {
      data = await DB.publicFunds();
      $('#loadWrap').hidden = true;
      $('#errWrap').hidden = true;
      $('#mainWrap').hidden = false;
      paint();
    } catch (e) {
      if (data) return;                      // 한 번이라도 그렸으면 화면은 그대로 둔다
      const m = String((e && e.message) || '');
      $('#loadWrap').hidden = true;
      $('#errWrap').hidden = false;
      $('#errMsg').textContent = /function|schema cache|404|PGRST202/i.test(m)
        ? '현황 공개 준비가 아직 끝나지 않았어요. 운영진에게 알려주세요.'
        : '잠시 후 다시 들어와주세요.';
    }
  }

  /* ---------- 작은 도구들 ---------- */
  const int = v => Number(v) || 0;
  const nameList = r => (r && Array.isArray(r.names)) ? r.names : [];
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dayKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
    '-' + String(d.getDate()).padStart(2, '0');

  /* 적립 내역 → 사람별 집계 (적립이 쌓이는 봉사만 담겨 있다) */
  function tally() {
    const map = new Map();
    (data.entries || []).forEach(r => {
      nameList(r).forEach(n => {
        if (!map.has(n)) map.set(n, { name: n, times: 0, amount: 0, rows: [], places: new Set() });
        const h = map.get(n);
        h.times += 1;
        h.amount += int(r.per);              // 한 사람 몫은 1인당 금액
        h.rows.push(r);
        h.places.add(r.place);
      });
    });
    return Array.from(map.values())
      .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name, 'ko'));
  }

  function paint() {
    const saved = int(data.total_saved);
    const paid = int(data.total_paid);
    const remain = saved - paid;
    const helpers = tally();
    const meetings = (data.entries || []).length;   // 적립이 쌓인 봉사 건수

    paintTotal(saved, paid, remain, helpers.length, meetings);
    paintHow();
    paintPeople(helpers, meetings);
    paintPlaces();
    paintCampaigns();
    paintEntries();
    paintPayouts();

    $('#footNote').innerHTML =
      '<div class="sm mut">' + esc($('#brandName').textContent || '발자국') + ' · 후원금 현황<br>' +
      (data.generated_at ? fmtDateTime(data.generated_at) + ' 기준' : '') + '</div>';
  }

  /* ============================================================
     ① 합계
     ============================================================ */
  function paintTotal(saved, paid, remain, people, meetings) {
    const ym = dayKey(new Date()).slice(0, 7);
    const thisMonth = (data.entries || [])
      .filter(r => String(r.date).slice(0, 7) === ym)
      .reduce((t, r) => t + int(r.amount), 0);
    const pct = saved > 0 ? Math.round(paid / saved * 100) : 0;

    $('#totalCard').innerHTML =
      '<div class="card">' +
      '<div class="center" style="padding:6px 0 2px">' +
      '<div class="sm mut">지금까지 모인 후원금</div>' +
      '<div class="money" style="font-size:34px;color:var(--brand-deep);margin-top:4px" id="bigSum">' +
      won(saved) + '</div>' +
      (people
        ? '<div class="sm mut" style="margin-top:6px">' + people + '명이 ' + meetings + '번의 봉사로 모았어요' +
          (paid ? ' · ' + won(paid) + ' 전달 완료' : '') + '</div>'
        : '') +
      (thisMonth
        ? '<div style="margin-top:9px"><span class="badge approved">이번 달 +' + won(thisMonth) + '</span></div>'
        : '') +
      '</div>' +
      (saved > 0
        ? '<div class="divider"></div>' +
          '<div class="bar"><i style="width:' + Math.max(2, Math.min(100, pct)) + '%"></i></div>' +
          '<div class="sm mut center" style="margin-top:8px;line-height:1.6">' +
          (paid
            ? '<b style="color:var(--ink)">' + won(paid) + '</b>은 보호소에 전달했고,<br>' +
              '<b style="color:var(--ink)">' + won(remain) + '</b>은 모으는 중이에요.'
            : '<b style="color:var(--ink)">' + won(remain) + '</b>을 모아 보호소에 전달할 예정이에요.') +
          '</div>'
        : '') +
      '</div>';

    if (!counted && saved > 0) { counted = true; countUp($('#bigSum'), saved); }
  }

  /* 0에서 올라가는 짧은 효과 — 동작 줄이기가 켜져 있으면 건너뛴다 */
  function countUp(el, to) {
    if (!el || reduceMotion() || document.hidden) return;
    const dur = 800, t0 = performance.now();
    // 탭이 가려져 있으면 rAF 가 안 돌 수 있어 끝값은 따로 한 번 더 박아둔다
    setTimeout(() => { el.textContent = won(to); }, dur + 300);
    const tick = now => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = won(Math.round(to * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    el.textContent = won(0);
    requestAnimationFrame(tick);
  }

  /* ============================================================
     ② 적립 방식
     ============================================================ */
  function paintHow() {
    const per = (data.entries || []).reduce((t, r) => Math.max(t, int(r.per)), 0);
    $('#howCard').innerHTML =
      '<div class="pill-note">' +
      '봉사를 다녀오면 <b>참여한 인원수 × ' + (per ? num(per) + '원' : '정해진 금액') + '</b> 만큼 ' +
      '그 보호소 앞으로 적립돼요.<br>' +
      '모인 돈은 사료·배변패드처럼 보호소에 필요한 물품으로 전달합니다.' +
      '</div>';
  }

  /* ============================================================
     ③ 후원금을 쌓아준 사람들 + 내 이름 찾기
     ============================================================ */
  function paintPeople(helpers, meetings) {
    if (!helpers.length) { $('#helperList').innerHTML = ''; return; }

    const places = (data.places || []).filter(p => int(p.saved) > 0).map(p => p.place)
      .filter(Boolean).sort((a, b) => String(a).localeCompare(String(b), 'ko'));

    $('#helperList').innerHTML =
      '<div class="section-title">' + ic('users') + '<span>후원금을 쌓아준 사람들</span></div>' +
      '<div class="search" style="margin-bottom:12px">' + ic('search') +
      '<input id="meInput" placeholder="내 이름 찾기" aria-label="이름으로 찾기" value="' + esc(me) + '"></div>' +
      '<div id="meSlot"></div>' +
      '<div class="card">' +
      '<div class="sm mut" style="margin-bottom:12px">' +
      '이분들이 함께한 <b style="color:var(--ink)">' + meetings + '번의 봉사</b>로 후원금이 쌓였어요.' +
      (places.length
        ? '<br>' + places.map(esc).join(' · ') + ' 봉사에 다녀온 ' +
          '<b style="color:var(--ink)">' + helpers.length + '명</b>이에요.'
        : '') + '</div>' +
      (places.length > 1
        ? '<div class="seg" id="chipSeg" style="margin-bottom:12px">' +
          '<button type="button" data-g="all"' + (groupByPlace ? '' : ' class="on"') + '>전체</button>' +
          '<button type="button" data-g="place"' + (groupByPlace ? ' class="on"' : '') + '>봉사지별</button></div>'
        : '') +
      '<div id="chipBody"></div>' +
      '</div>';

    paintChips(helpers, places);
    paintMe(helpers);

    const inp = $('#meInput');
    if (inp) {
      inp.addEventListener('input', debounce(() => {
        me = inp.value.trim();
        paintChips(tally(), places);
        paintMe(tally());
      }, 180));
    }
    $$('#chipSeg [data-g]').forEach(b => b.addEventListener('click', () => {
      groupByPlace = b.dataset.g === 'place';
      $$('#chipSeg [data-g]').forEach(x => x.classList.toggle('on', x === b));
      paintChips(tally(), places);
    }));
  }

  /* 최근에 다녀온 사람 */
  function freshNames() {
    const limit = new Date();
    limit.setDate(limit.getDate() - NEW_DAYS);
    const key = dayKey(limit);
    const set = new Set();
    (data.entries || []).forEach(r => {
      if (String(r.date) >= key) nameList(r).forEach(n => set.add(n));
    });
    return set;
  }

  function chip(h, fresh) {
    const on = me && h.name === me;
    const dim = me && h.name !== me;
    return '<span class="pchip' + (on ? ' on' : '') + (dim ? ' off' : '') + '">' + esc(h.name) +
      (h.times > 1 ? '<span class="n">' + h.times + '번</span>' : '') +
      (fresh.has(h.name) ? '<span class="new">NEW</span>' : '') + '</span>';
  }

  function paintChips(helpers, places) {
    const body = $('#chipBody');
    if (!body) return;
    const fresh = freshNames();

    if (!groupByPlace) {
      body.innerHTML = '<div class="chipwrap">' + helpers.map(h => chip(h, fresh)).join('') + '</div>';
      return;
    }
    body.innerHTML = places.map(pl => {
      const who = helpers.filter(h => h.places.has(pl));
      if (!who.length) return '';
      return '<div style="margin-bottom:14px">' +
        '<div class="sm" style="font-weight:700;margin-bottom:7px">' + esc(pl) +
        ' <span class="mut" style="font-weight:500">' + who.length + '명</span></div>' +
        '<div class="chipwrap">' + who.map(h => chip(h, fresh)).join('') + '</div></div>';
    }).join('');
  }

  /* 내 카드 */
  function paintMe(helpers) {
    const slot = $('#meSlot');
    if (!slot) return;
    if (!me) { slot.innerHTML = ''; return; }

    const hit = helpers.find(h => h.name === me);
    if (!hit) {
      slot.innerHTML =
        '<div class="card center" style="padding:22px 18px">' +
        '<div class="sm"><b>' + esc(me) + '</b> 님은 아직 기록이 없어요.</div>' +
        '<div class="sm mut" style="margin-top:5px">봉사 확정 뒤에 반영돼요.</div></div>' +
        '<div class="sp"></div>';
      return;
    }

    slot.innerHTML =
      '<div class="mecard">' +
      '<div class="row between" style="align-items:flex-start">' +
      '<div><div class="sm" style="color:var(--brand-deep);font-weight:700">' + esc(hit.name) + ' 님</div>' +
      '<div class="money" style="font-size:24px;color:var(--brand-deep);margin-top:2px">' + won(hit.amount) + '</div>' +
      '<div class="sm" style="margin-top:2px">' + hit.times + '번 다녀와서 쌓은 후원금이에요</div></div>' +
      '<span style="color:var(--brand-deep)">' + ic('heart') + '</span></div>' +
      '<div class="divider"></div>' +
      hit.rows.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(r =>
        '<div class="kv"><span class="k">' + fmtDate(r.date) + ' · ' + esc(r.place) + '</span>' +
        '<span class="v">' + won(int(r.per)) + '</span></div>').join('') +
      '<div class="sp"></div>' +
      '<button class="btn soft block sm" id="meShare">공유하기</button>' +
      '</div><div class="sp"></div>';

    const btn = $('#meShare');
    if (btn) btn.onclick = async () => {
      const url = location.origin + location.pathname + '?name=' + encodeURIComponent(hit.name);
      const text = hit.name + ' 님이 ' + hit.times + '번 봉사에 다녀와서 ' + won(hit.amount) + '을 모았어요 🐾';
      if (navigator.share) {
        try { await navigator.share({ title: '발자국 후원금 현황', text, url }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      copy(url, '링크를 복사했어요');
    };
  }

  /* ============================================================
     ④ 보호소별
     ============================================================ */
  function paintPlaces() {
    const places = data.places || [];
    $('#placeList').innerHTML = places.length
      ? '<div class="section-title">' + ic('paw') + '<span>보호소별 현황</span></div>' +
        '<div class="list">' + places.map(p =>
          '<div class="item" style="cursor:default">' +
          '<span class="ic green" style="width:38px;height:38px;border-radius:13px;display:grid;place-items:center">' +
          ic('heart') + '</span>' +
          '<div class="grow"><div class="nm">' + esc(p.place) + '</div>' +
          '<div class="sub"><span>모인 돈 ' + won(p.saved) + '</span>' +
          '<span>전달 ' + won(p.paid) + '</span></div></div>' +
          '<div style="text-align:right"><div class="money" style="color:var(--brand-deep)">' + won(p.remain) + '</div>' +
          '<div class="mut sm">전달 예정</div></div></div>').join('') + '</div>'
      : '';
  }

  /* ============================================================
     ⑤ 함께하는 후원
     ============================================================ */
  function paintCampaigns() {
    const camps = (data.campaigns || []).filter(c => c.title);
    $('#campList').innerHTML = camps.length
      ? '<div class="section-title">' + ic('star') + '<span>함께하는 후원</span></div>' +
        camps.map(c => {
          const raised = int(c.raised), goal = int(c.goal);
          const pct = goal ? Math.min(100, Math.round(raised / goal * 100)) : 0;
          return '<div class="card">' +
            '<div class="row between" style="align-items:flex-start">' +
            '<div><h3>' + esc(c.title) + '</h3>' +
            (c.partner ? '<div class="sub">' + esc(c.partner) + ' 와 함께</div>' : '') + '</div>' +
            (c.status === 'closed' ? '<span class="badge">마감</span>' : '') + '</div>' +
            '<div class="sp"></div>' +
            '<div class="row between"><b class="money" style="color:var(--brand-deep);font-size:19px">' +
            won(raised) + '</b>' +
            (goal ? '<span class="mut sm">목표 ' + won(goal) + '</span>' : '') + '</div>' +
            (goal ? '<div class="bar" style="margin-top:9px"><i style="width:' + Math.max(2, pct) + '%"></i></div>' +
              '<div class="sm mut" style="margin-top:6px">' + pct + '% 달성' +
              (raised < goal ? ' · ' + won(goal - raised) + ' 남았어요' : ' · 목표 달성!') + '</div>' : '') +
            (c.donors ? '<div class="sm mut" style="margin-top:6px">' + c.donors + '분이 함께했어요</div>' : '') +
            '</div>';
        }).join('') + '<div class="sp"></div>'
      : '';
  }

  /* ============================================================
     ⑥ 봉사별 적립 내역 (접었다 펴기)
     ============================================================ */
  function paintEntries() {
    const entries = data.entries || [];
    const shown = entries.slice(0, 30);
    $('#entryList').innerHTML =
      '<div class="section-title">' + ic('calendar') + '<span>봉사별 적립 내역</span></div>' +
      (entries.length
        ? '<button type="button" class="foldbtn' + (entriesOpen ? ' on' : '') + '" id="entryFold">' +
          '<span>' + (entriesOpen ? '접기' : '자세히 보기 (' + entries.length + '건)') + '</span>' + ic('down') + '</button>' +
          '<div id="entryBody" style="margin-top:12px"' + (entriesOpen ? '' : ' hidden') + '>' +
          '<div class="card" style="padding:4px 16px">' + shown.map((r, i) =>
            '<div style="padding:12px 0' + (i < shown.length - 1 ? ';border-bottom:1px solid var(--line-2)' : '') + '">' +
            '<div class="row between"><b class="sm">' + fmtDate(r.date) + ' · ' + esc(r.place) + '</b>' +
            '<span class="money" style="color:var(--brand-deep)">' + won(r.amount) + '</span></div>' +
            '<div class="sm mut" style="margin-top:3px">' + r.people + '명 × ' + num(r.per) + '원</div>' +
            (nameList(r).length
              ? '<div class="sm" style="margin-top:5px;line-height:1.6">' +
                nameList(r).map(n => me && n === me
                  ? '<b style="color:var(--brand-deep)">' + esc(n) + '</b>' : esc(n)).join(', ') + '</div>'
              : '') +
            '</div>').join('') + '</div>' +
          (entries.length > 30 ? '<div class="sm mut center" style="margin-top:8px">최근 30건만 보여요</div>' : '') +
          '</div>'
        : '<div class="card empty" style="padding:24px 20px">아직 적립된 봉사가 없어요</div>');

    const fold = $('#entryFold');
    if (fold) fold.onclick = () => {
      entriesOpen = !entriesOpen;
      try { localStorage.setItem(OPEN, entriesOpen ? '1' : '0'); } catch (e) { }
      const body = $('#entryBody');
      body.hidden = !entriesOpen;
      fold.classList.toggle('on', entriesOpen);
      fold.querySelector('span').textContent =
        entriesOpen ? '접기' : '자세히 보기 (' + entries.length + '건)';
    };
  }

  /* ============================================================
     ⑦ 전달 내역
     · 전달일 이전에 그 보호소에 다녀온 분들을 '이 돈을 모은 사람'으로 본다
     ============================================================ */
  function moversOf(p) {
    const set = new Set();
    (data.entries || []).forEach(r => {
      if (r.place === p.place && String(r.date) <= String(p.date)) {
        nameList(r).forEach(n => set.add(n));
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ko'));
  }

  function paintPayouts() {
    const payouts = data.payouts || [];
    $('#payoutList').innerHTML =
      '<div class="section-title">' + ic('check') + '<span>보호소에 전달한 내역</span></div>' +
      (payouts.length
        ? '<div class="card" style="padding:4px 16px">' + payouts.map((p, i) => {
            const who = moversOf(p);
            return '<div style="padding:12px 0' +
              (i < payouts.length - 1 ? ';border-bottom:1px solid var(--line-2)' : '') + '">' +
              '<div class="row between"><b class="sm">' + fmtDate(p.date) + ' · ' + esc(p.place) + '</b>' +
              '<span class="money" style="color:var(--brand-deep)">' + won(p.amount) + '</span></div>' +
              (p.memo ? '<div class="sm mut" style="margin-top:3px">' + esc(p.memo) + '</div>' : '') +
              (who.length
                ? '<div class="sm" style="margin-top:4px">' + esc(who[0]) + ' 님' +
                  (who.length > 1 ? ' 외 ' + (who.length - 1) + '명' : '') + '의 봉사로 모은 돈이에요</div>'
                : '') +
              (p.has_photo && p.id
                ? '<img class="thumb" data-photo="' + esc(p.id) + '" alt="' + esc(p.place) + ' 전달 사진" hidden>'
                : '') +
              '</div>';
          }).join('') + '</div>'
        : '<div class="card empty" style="padding:24px 20px">아직 전달한 내역이 없어요<br>' +
          '<span class="sm">모이는 대로 물품으로 전달하고 여기에 적어둘게요</span></div>');

    // 사진은 목록에 안 실려 있어서 한 장씩 따로 받아온다
    $$('#payoutList [data-photo]').forEach(img => {
      if (img.dataset.done) return;
      img.dataset.done = '1';
      DB.payoutPhoto(img.dataset.photo).then(src => {
        if (!src) return;
        img.src = src;
        img.hidden = false;
      }).catch(() => { });
    });
  }

})();
