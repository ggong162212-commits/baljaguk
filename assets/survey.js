/* ============================================================
   2학기 활동 조사 페이지 (survey.html)
   · 신청 폼(index.html)과는 별도 주소, 같은 데이터베이스
   ============================================================ */
(function () {
  const { $, $$, toast, esc, fmtDateTime, cheer, debounce, sheet, closeSheet } = UI;

  const TOPIC = (window.CONFIG || {}).SURVEY_TOPIC || '2026-2';
  const DRAFT = 'baljaguk.survey.draft.' + TOPIC;
  const SENT = 'baljaguk.survey.sent.' + TOPIC;

  const LABEL = { yes: '참여합니다', no: '참여하지 않습니다', maybe: '아직 모르겠습니다' };
  const EXAMPLES = [
    '집 근처에서 봉사할 수 있어서 좋을 것 같아요.',
    '여러 보호소를 경험해볼 수 있어서 기대돼요.',
    '매번 같이 봉사하던 사람들과 봉사하기 어려워질 것 같아 아쉬워요.',
    '회장님은 어떤 지역의 보호소에 방문하나요?'
  ];

  let settings = null, ctaWatcher = null;

  UI.initTheme();
  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    $('#brandIcon').innerHTML = ic('paw');
    $('#pawline').innerHTML = ic('paw') + ic('paw') + ic('paw');
    $('#formTitle').innerHTML = ic('clipboard') + '<span>응답 작성</span>';
    $('#doneIcon').innerHTML =
      '<span style="width:56px;height:56px;border-radius:50%;background:var(--brand-soft);display:grid;place-items:center">' + ic('check') + '</span>';
    $('#closedIcon').innerHTML =
      '<span style="width:52px;height:52px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center">' + ic('clock') + '</span>';
    $('#opinionExamples').innerHTML =
      '<b>이렇게 적어주셔도 좋아요</b><br>' + EXAMPLES.map(e => '· ' + esc(e)).join('<br>');
    $('[data-theme-btn]').addEventListener('click', UI.toggleTheme);
    UI.paintThemeButtons();

    try { settings = await DB.settings.get(); }
    catch (e) { settings = Object.assign({}, (window.CONFIG || {}).FALLBACK); }
    paintClub();

    wireForm();
    $('#editBtn').addEventListener('click', openEdit);
    restoreDraft();
    if (localStorage.getItem(SENT)) showSent();
    else paintOpenState();
    watchSettings();
  }

  /* 운영진이 접수를 닫으면 폼 대신 안내를 보여준다 */
  function paintOpenState() {
    const st = DB.surveyState(settings);
    const closed = !st.open;
    $('#closedWrap').hidden = !closed;
    $('#formWrap').hidden = closed;
    $('#partyCard').hidden = closed;
    $('#editRow').hidden = closed;
    if (closed) $('#cta').hidden = true;
    if (closed && st.at) {
      $('#closedMsg').textContent = fmtDateTime(st.at) + ' 에 마감됐어요. 궁금한 건 운영진에게 알려주세요.';
    }
  }

  /* 보고 있는 중에 운영진이 열고 닫아도 반영 */
  function watchSettings() {
    let last = JSON.stringify(settings);
    DB.live(async () => {
      let next = null;
      try { next = await DB.settings.get(); } catch (e) { return; }
      const now = JSON.stringify(next);
      if (now === last) return;
      settings = next; last = now;
      if (!localStorage.getItem(SENT) && $('#doneWrap').hidden) paintOpenState();
    }, 20000);
  }

  function paintClub() {
    const s = settings || {};
    const name = s.club_name || '발자국';
    document.title = name + ' · 2학기 활동 조사';
    $('#brandName').textContent = name;
    $('#kicker').innerHTML = ic('sprout') + '<span>' + esc(s.generation || '2기') + ' 활동 조사</span>';
    $('#footNote').innerHTML =
      '<div class="sm mut">' + esc(name) + ' · ' + esc(s.tagline || '유기견·유기묘 봉사 동아리') + '</div>';
  }

  /* ---------- 폼 ---------- */
  const form = () => $('#surveyForm');
  function values() {
    const f = form();
    const picked = $('#partyOptions input:checked');
    return {
      name: f.name.value.trim(),
      station: f.station.value.trim(),
      opinion: f.opinion.value.trim(),
      party: picked ? picked.value : ''
    };
  }

  function wireForm() {
    const f = form();

    f.addEventListener('input', () => {
      $('#opinionCount').textContent = f.opinion.value.length;
      progress(); saveDraft(); clearBad();
    });
    f.addEventListener('submit', submit);

    // 참여 여부 (라디오)
    $$('#partyOptions .check').forEach(box => {
      box.addEventListener('click', e => {
        if (e.target.tagName !== 'INPUT') e.preventDefault();
        pick(box.dataset.party);
        progress(); saveDraft(); clearBad();
      });
    });

    $('#againBtn').addEventListener('click', () => {
      localStorage.removeItem(SENT);
      $('#doneWrap').hidden = true;
      paintOpenState();
      f.reset(); pick(null);
      $('#opinionCount').textContent = '0';
      localStorage.removeItem(DRAFT);
      progress(); watchCta();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    $('#ctaBtn').addEventListener('click', () => {
      $('#surveyForm').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { try { form().name.focus(); } catch (e) { } }, 400);
    });

    progress();
    watchCta();
  }

  function pick(v) {
    $$('#partyOptions .check').forEach(box => {
      const on = box.dataset.party === v;
      const inp = box.querySelector('input');
      inp.checked = on;
      box.classList.toggle('on', on);
      box.querySelector('.box').innerHTML = on ? ic('check') : '';
    });
  }

  function progress() {
    const v = values();
    const done = [!!v.name, !!v.station, !!v.opinion, !!v.party];
    $$('#steps i').forEach((el, i) => el.classList.toggle('on', done[i]));
  }

  function clearBad() {
    const v = values();
    if (v.name) $('#f-name').classList.remove('bad');
    if (v.station) $('#f-station').classList.remove('bad');
    if (v.party) $('#f-party').classList.remove('bad');
  }

  function validate() {
    const v = values();
    let first = null;
    const mark = (id, bad) => {
      const el = $(id);
      el.classList.toggle('bad', bad);
      if (bad && !first) first = el;
    };
    mark('#f-name', !v.name);
    mark('#f-station', !v.station);
    mark('#f-party', !v.party);
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const inp = first.querySelector('input,textarea');
      if (inp && inp.type !== 'radio') setTimeout(() => { try { inp.focus(); } catch (e) { } }, 300);
      toast('빠진 항목이 있어요', 'err');
      return false;
    }
    return true;
  }

  /* ---------- 임시 저장 ---------- */
  const saveDraft = debounce(() => {
    try { localStorage.setItem(DRAFT, JSON.stringify(values())); } catch (e) { }
    $('#savedNote').textContent = '작성 중인 내용을 이 기기에 임시 저장했어요';
  }, 400);

  function restoreDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { }
    if (!d) return;
    const f = form();
    f.name.value = d.name || '';
    f.station.value = d.station || '';
    f.opinion.value = d.opinion || '';
    $('#opinionCount').textContent = (d.opinion || '').length;
    if (d.party) pick(d.party);
    progress();
  }

  /* ---------- 제출 ---------- */
  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = '보내는 중…';
    const v = values();
    try {
      // 작성 중에 마감됐을 수 있으니 한 번 더 확인
      const fresh = await DB.settings.get().catch(() => settings);
      settings = fresh || settings;
      if (!DB.surveyState(settings).open) { paintOpenState(); throw new Error('방금 조사가 마감됐어요. 운영진에게 문의해주세요'); }

      await DB.submitSurvey(v);
      localStorage.removeItem(DRAFT);
      localStorage.setItem(SENT, JSON.stringify({ name: v.name, party: v.party, at: new Date().toISOString() }));
      showDone(v, new Date().toISOString());
      cheer();
      toast('응답을 보냈어요!', 'ok');
    } catch (err) {
      const m = String(err && err.message || '');
      toast(/relation|does not exist|schema cache|404/i.test(m)
        ? '설문 준비가 아직 끝나지 않았어요. 운영진에게 알려주세요'
        : (m || '응답을 보내지 못했어요. 잠시 후 다시 시도해주세요'), 'err');
    } finally {
      btn.disabled = false; btn.textContent = '응답 보내기';
    }
  }

  const row = (k, v) => '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';

  function showDone(v, at) {
    $('#doneSummary').innerHTML =
      row('이름', v.name) + row('거주지', v.station) +
      row('개강파티', LABEL[v.party] || '-') + row('보낸 시각', fmtDateTime(at));
    $('#formWrap').hidden = true;
    $('#partyCard').hidden = true;
    $('#doneWrap').hidden = false;
    if (ctaWatcher) { ctaWatcher.disconnect(); ctaWatcher = null; }
    $('#cta').hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* 이미 보낸 기기에서 다시 열었을 때 */
  function showSent() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(SENT) || 'null'); } catch (e) { }
    if (!d) return;
    $('#doneMsg').textContent = '이미 응답을 보냈어요. 고칠 게 있으면 위의 「이미 응답했어요 · 고치러 가기」 를 눌러주세요.';
    $('#doneSummary').innerHTML =
      row('이름', d.name || '') + (d.station ? row('가까운 역', d.station) : '') +
      row('개강파티', LABEL[d.party] || '-') + row('보낸 시각', fmtDateTime(d.at));
    $('#formWrap').hidden = true;
    $('#partyCard').hidden = true;
    $('#doneWrap').hidden = false;
    $('#cta').hidden = true;
  }

  /* ---------- 아래에서 떠 있는 버튼 ---------- */
  function watchCta() {
    if (!('IntersectionObserver' in window)) return;
    if (ctaWatcher) ctaWatcher.disconnect();
    const target = $('#surveyForm');
    if (!target) return;
    ctaWatcher = new IntersectionObserver(entries => {
      const seen = entries[0] && entries[0].isIntersecting;
      // 폼이 보이거나, 이미 보냈거나, 마감됐으면 버튼을 띄우지 않는다
      $('#cta').hidden = !!seen || !$('#doneWrap').hidden || !$('#closedWrap').hidden;
    }, { rootMargin: '-40% 0px -20% 0px' });
    ctaWatcher.observe(target);
  }

  /* ============================================================
     이미 낸 응답 고치기
     · 이름이 똑같은 응답만 서버에서 찾아온다 (부분 검색 불가)
     · 이름은 못 바꾼다 — 남의 응답으로 덮어쓰는 걸 막기 위해
     ============================================================ */
  function lastName() {
    try {
      const sent = JSON.parse(localStorage.getItem(SENT) || 'null');
      if (sent && sent.name) return sent.name;
      const d = JSON.parse(localStorage.getItem(DRAFT) || 'null');
      return (d && d.name) || '';
    } catch (e) { return ''; }
  }

  function openEdit() {
    const ov = sheet({
      title: '응답 고치기',
      body:
        '<p class="mut sm" style="margin:0 0 14px"><b>본인 이름</b>을 적어주세요.</p>' +
        '<label class="field"><span class="lb">이름</span>' +
        '<input class="input" id="edName" placeholder="김발자" maxlength="20" value="' + esc(lastName()) + '"></label>' +
        '<button class="btn primary block" id="edFind">내 응답 찾기</button>' +
        '<div id="edResult" style="margin-top:14px"></div>'
    });
    const find = ov.querySelector('#edFind');
    ov.querySelector('#edName').addEventListener('keydown', e => { if (e.key === 'Enter') find.click(); });
    find.onclick = async () => {
      const nm = ov.querySelector('#edName').value.trim();
      if (!nm) return toast('이름을 적어주세요', 'err');
      find.disabled = true; find.textContent = '찾는 중…';
      try {
        const rows = await DB.surveyLookup(nm);
        if (!rows.length) {
          ov.querySelector('#edResult').innerHTML =
            '<div class="card flat center sm mut" style="padding:20px">' +
            '<b>' + esc(nm) + '</b> 님으로 낸 응답이 없어요.<br>이름이 정확한지 확인해주세요.</div>';
        } else if (rows.length === 1) {
          editForm(ov, rows[0]);
        } else {
          ov.querySelector('#edResult').innerHTML =
            '<div class="sm mut" style="margin-bottom:8px">같은 이름으로 낸 응답이 ' + rows.length + '건이에요. 고칠 응답을 골라주세요.</div>' +
            '<div class="stack" style="gap:8px">' + rows.map((r, i) =>
              '<button type="button" class="check" data-pickrow="' + i + '" style="text-align:left">' +
              '<div class="grow"><b class="sm">' + esc(r.station || '거주지 없음') + '</b>' +
              '<div class="mut" style="font-size:11.5px">' + fmtDateTime(r.created_at) + ' 제출 · ' +
              (LABEL[r.party] || '') + '</div></div></button>').join('') + '</div>';
          ov.querySelectorAll('[data-pickrow]').forEach(b =>
            b.addEventListener('click', () => editForm(ov, rows[Number(b.dataset.pickrow)])));
        }
      } catch (e) {
        toast(e.message || '응답을 찾지 못했어요', 'err');
      } finally {
        find.disabled = false; find.textContent = '내 응답 찾기';
      }
    };
  }

  function editForm(ov, row) {
    const opt = (v, t, d) =>
      '<label class="check' + (row.party === v ? ' on' : '') + '" data-ed="' + v + '">' +
      '<span class="box">' + (row.party === v ? ic('check') : '') + '</span>' +
      '<div class="grow"><b class="sm">' + t + '</b>' +
      (d ? '<div class="mut" style="font-size:11.5px">' + d + '</div>' : '') + '</div></label>';

    ov.querySelector('.sheet-body').innerHTML =
      '<div class="pill-note" style="margin-bottom:14px"><b>' + esc(row.name) + '</b> 님의 응답이에요. ' +
      fmtDateTime(row.created_at) + ' 에 냈어요.</div>' +
      '<label class="field"><span class="lb">가까운 지하철역</span>' +
      '<input class="input" id="edStation" maxlength="30" value="' + esc(row.station || '') + '"></label>' +
      '<div class="field"><span class="lb">개강파티 참여</span>' +
      '<div class="stack" style="gap:8px;margin-top:6px" id="edParty">' +
      opt('yes', '참여합니다', '') +
      opt('no', '참여하지 않습니다', '') +
      opt('maybe', '아직 모르겠습니다', '') +
      '</div></div>' +
      '<label class="field"><span class="lb">의견 (선택)</span>' +
      '<textarea class="input" id="edOpinion" style="min-height:100px" maxlength="600">' + esc(row.opinion || '') + '</textarea></label>' +
      '<button class="btn primary block" id="edSave">이대로 고치기</button>';

    let party = row.party;
    ov.querySelectorAll('#edParty [data-ed]').forEach(el => el.addEventListener('click', e => {
      e.preventDefault();
      party = el.dataset.ed;
      ov.querySelectorAll('#edParty [data-ed]').forEach(x => {
        const on = x.dataset.ed === party;
        x.classList.toggle('on', on);
        x.querySelector('.box').innerHTML = on ? ic('check') : '';
      });
    }));

    ov.querySelector('#edSave').onclick = async () => {
      const btn = ov.querySelector('#edSave');
      const station = ov.querySelector('#edStation').value.trim();
      if (!station) return toast('가까운 지하철역을 적어주세요', 'err');
      btn.disabled = true; btn.textContent = '고치는 중…';
      try {
        await DB.surveyEdit(row.id, { station, opinion: ov.querySelector('#edOpinion').value.trim(), party });
        closeSheet();
        toast('응답을 고쳤어요', 'ok');
        try {
          localStorage.setItem(SENT, JSON.stringify({ name: row.name, station, party, at: new Date().toISOString() }));
        } catch (e) { }
        showSent();
      } catch (e) {
        toast(e.message || '고치지 못했어요', 'err');
        btn.disabled = false; btn.textContent = '이대로 고치기';
      }
    };
  }

})();
