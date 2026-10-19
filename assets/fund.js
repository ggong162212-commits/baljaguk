/* ============================================================
   후원금 현황 (fund.html)
   · 부원·외부에 그대로 공유하는 공개 페이지
   · 금액 · 인원수 · 참여자 이름까지. 연락처·학번은 서버에서 안 내려온다
   ============================================================ */
(function () {
  const { $, $$, esc, won, num, fmtDate, fmtDateTime } = UI;

  const OPEN = 'baljaguk.fund.entriesOpen';
  let data = null;
  let entriesOpen = false;

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

    try {
      const s = await DB.settings.get();
      if (s && s.club_name) {
        $('#brandName').textContent = s.club_name;
        document.title = s.club_name + ' · 후원금 현황';
      }
    } catch (e) { }

    await load();
    setInterval(load, 60000);               // 1분마다 조용히 갱신
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

  const int = v => Number(v) || 0;
  const names = r => (r && Array.isArray(r.names)) ? r.names : [];

  function paint() {
    const saved = int(data.total_saved);
    const paid = int(data.total_paid);
    const remain = saved - paid;

    /* ---------- 합계 ---------- */
    $('#totalCard').innerHTML =
      '<div class="card">' +
      '<div class="center" style="padding:6px 0 2px">' +
      '<div class="sm mut">지금까지 모인 후원금</div>' +
      '<div class="money" style="font-size:34px;color:var(--brand-deep);margin-top:4px">' + won(saved) + '</div>' +
      '</div>' +
      '<div class="divider"></div>' +
      '<div class="kv"><span class="k">보호소에 전달 완료</span><span class="v">' + won(paid) + '</span></div>' +
      '<div class="kv"><span class="k">전달 예정 (모으는 중)</span><span class="v">' + won(remain) + '</span></div>' +
      (saved > 0
        ? '<div class="bar" style="margin-top:12px"><i style="width:' +
          Math.max(2, Math.min(100, Math.round(paid / saved * 100))) + '%"></i></div>' +
          '<div class="sm mut center" style="margin-top:7px">' +
          Math.round(paid / saved * 100) + '% 전달 완료</div>'
        : '') +
      '</div>';

    /* ---------- 어떻게 모이나 ---------- */
    const per = (data.entries || []).reduce((t, r) => Math.max(t, int(r.per)), 0);
    $('#howCard').innerHTML =
      '<div class="pill-note">' +
      '봉사를 다녀오면 <b>참여한 인원수 × ' + (per ? num(per) + '원' : '정해진 금액') + '</b> 만큼 ' +
      '그 보호소 앞으로 적립돼요.<br>' +
      '모인 돈은 사료·배변패드처럼 보호소에 필요한 물품으로 전달합니다.' +
      '</div>';

    /* ---------- 함께한 사람들 ---------- */
    const helpers = data.helpers || [];
    const visits = int(data.total_visits);
    $('#helperList').innerHTML = helpers.length
      ? '<div class="section-title">' + ic('users') + '<span>함께한 사람들</span></div>' +
        '<div class="card">' +
        '<div class="sm mut" style="margin-bottom:12px">' +
        '<b style="color:var(--ink)">' + helpers.length + '명</b>이 모두 <b style="color:var(--ink)">' +
        visits + '번</b> 봉사에 다녀왔어요.</div>' +
        '<div style="display:flex;flex-wrap:wrap;gap:7px">' +
        helpers.map(h =>
          '<span style="display:inline-flex;align-items:center;gap:5px;background:var(--surface-2);' +
          'border-radius:999px;padding:6px 12px;font-size:13.5px;font-weight:600">' +
          esc(h.name) +
          (int(h.times) > 1
            ? '<span style="background:var(--brand-soft);color:var(--brand-deep);border-radius:999px;' +
              'padding:0 7px;font-size:11.5px">' + h.times + '번</span>'
            : '') +
          '</span>').join('') +
        '</div></div>'
      : '';

    /* ---------- 보호소별 ---------- */
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

    /* ---------- 브랜드 후원 ---------- */
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

    /* ---------- 봉사별 적립 내역 (접었다 펴기) ---------- */
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
            (names(r).length
              ? '<div class="sm" style="margin-top:5px;line-height:1.6">' +
                names(r).map(n => esc(n)).join(', ') + '</div>'
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

    /* ---------- 전달 내역 ---------- */
    const payouts = data.payouts || [];
    $('#payoutList').innerHTML =
      '<div class="section-title">' + ic('check') + '<span>보호소에 전달한 내역</span></div>' +
      (payouts.length
        ? '<div class="card flat" style="padding:4px 12px">' + payouts.map(p =>
            '<div class="kv"><span class="k">' + fmtDate(p.date) + ' · ' + esc(p.place) + '</span>' +
            '<span class="v">' + won(p.amount) + (p.memo ? ' <span class="mut">' + esc(p.memo) + '</span>' : '') +
            '</span></div>').join('') + '</div>'
        : '<div class="card empty" style="padding:24px 20px">아직 전달한 내역이 없어요<br>' +
          '<span class="sm">모이는 대로 물품으로 전달하고 여기에 적어둘게요</span></div>');

    $('#footNote').innerHTML =
      '<div class="sm mut">' + ($('#brandName').textContent || '발자국') + ' · 후원금 현황<br>' +
      (data.generated_at ? fmtDateTime(data.generated_at) + ' 기준' : '') + '</div>';
  }

})();
