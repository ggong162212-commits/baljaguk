/* ============================================================
   1365 회원명부 등록 (id1365.html)
   · 부원이 자기 이름으로 찾아 들어와 생년월일 · 1365 아이디 · 휴대전화를 적는다
   · 전화번호는 이미 있으면 가운데를 가린 채 보여주고, 바뀐 사람만 새로 적는다
   ============================================================ */
(function () {
  const { $, $$, toast, esc, fmtDate, fmtDateTime, hyphenPhone, cheer } = UI;

  const SENT = 'baljaguk.id1365.sent';
  let settings = null;
  let found = null;      // { name, student_id, phone_mask, birth, portal_id, submitted }
  let cdTimer = null;

  UI.initTheme();
  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    $('#brandIcon').innerHTML = ic('paw');
    $('#pawline').innerHTML = ic('paw') + ic('paw') + ic('paw');
    $('#findTitle').innerHTML = ic('search') + '<span>내 정보 찾기</span>';
    $('#formTitle').innerHTML = ic('clipboard') + '<span>명부에 적을 내용</span>';
    $('#doneIcon').innerHTML =
      '<span style="width:56px;height:56px;border-radius:50%;background:var(--brand-soft);display:grid;place-items:center">' + ic('check') + '</span>';
    $('#closedIcon').innerHTML =
      '<span style="width:52px;height:52px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center">' + ic('clock') + '</span>';
    $('[data-theme-btn]').addEventListener('click', UI.toggleTheme);
    UI.paintThemeButtons();

    try { settings = await DB.settings.get(); }
    catch (e) { settings = Object.assign({}, (window.CONFIG || {}).FALLBACK); }

    paintClub();
    paintDeadline();
    wire();
    paintOpenState();
    watchSettings();
  }

  function paintClub() {
    const s = settings || {};
    const name = s.club_name || '발자국';
    document.title = name + ' · 1365 명부 등록';
    $('#brandName').textContent = name;
    $('#kicker').innerHTML = ic('sprout') + '<span>금파하우스 봉사</span>';
    $('#footNote').innerHTML = '<div class="sm mut">' + esc(name) + ' · 1365 자원봉사단체 회원 명부</div>';
  }

  /* 마감 안내 — 언제까지 낸 사람만 시간을 받을 수 있는지 */
  function paintDeadline() {
    const until = (settings || {}).id1365_close_at;
    $('#deadlineNote').innerHTML = until
      ? '<b>' + fmtDateTime(until) + '</b> 까지 낸 분만 명부에 올라가요.<br>' +
      '그 뒤에 내시면 이번 제출분에는 못 들어가서 금파하우스 봉사 1365 시간 지급이 어려워요.'
      : '<b>명부에 올라간 분만</b> 금파하우스 봉사 1365 시간 지급이 가능해요.<br>' +
      '운영진이 센터에 제출하기 전까지 적어주세요.';
  }

  function paintOpenState() {
    const st = DB.id1365State(settings);
    const closed = !st.open;
    const onDone = !$('#doneWrap').hidden;
    $('#closedWrap').hidden = !closed;
    if (!onDone) $('#whyCard').hidden = closed;
    if (closed) {
      $('#findWrap').hidden = true;
      $('#formWrap').hidden = true;
      $('#closedMsg').textContent = st.at
        ? fmtDateTime(st.at) + ' 에 마감됐어요. 아직 못 내셨다면 운영진에게 개인적으로 연락해주세요.'
        : '지금은 등록을 받지 않아요. 운영진에게 문의해주세요.';
      stopCountdown();
      return;
    }
    if (!onDone) {
      $('#findWrap').hidden = !!found;
      $('#formWrap').hidden = !found;
    }
    startCountdown(st.until);
  }

  /* 보고 있는 중에 운영진이 열고 닫아도 반영 */
  function watchSettings() {
    let last = JSON.stringify([settings && settings.id1365_open, settings && settings.id1365_close_at]);
    DB.live(async () => {
      let next = null;
      try { next = await DB.settings.get(); } catch (e) { return; }
      const now = JSON.stringify([next.id1365_open, next.id1365_close_at]);
      settings = next;
      if (now === last) return;
      last = now;
      paintDeadline();
      paintOpenState();
    }, 20000);
  }

  function stopCountdown() { if (cdTimer) { clearInterval(cdTimer); cdTimer = null; } }
  function startCountdown(until) {
    stopCountdown();
    const slot = $('#deadlineNote');
    if (!until || !slot) return;
    const end = Date.parse(until);
    if (isNaN(end)) return;
    const p2 = n => String(n).padStart(2, '0');
    const tick = async () => {
      let left = end - Date.now();
      const el = $('#cdLeft');
      if (left <= 0) {
        stopCountdown();
        try { settings = await DB.settings.get(); } catch (e) { }
        paintOpenState();
        return;
      }
      if (!el) return;
      const d = Math.floor(left / 86400000); left -= d * 86400000;
      const h = Math.floor(left / 3600000); left -= h * 3600000;
      const m = Math.floor(left / 60000); const s = Math.floor(left % 60000 / 1000);
      el.textContent = (d > 0 ? d + '일 ' : '') + p2(h) + ':' + p2(m) + ':' + p2(s);
    };
    if (!$('#cdLeft')) slot.insertAdjacentHTML('beforeend',
      '<div class="sm" style="margin-top:8px">마감까지 <b id="cdLeft">계산 중</b></div>');
    tick();
    cdTimer = setInterval(tick, 1000);
  }

  /* ============================================================
     ① 이름으로 내 정보 찾기
     ============================================================ */
  function wire() {
    const ff = $('#findForm');
    ff.addEventListener('submit', find);
    ff.name.addEventListener('input', () => {
      $('#f-name').classList.remove('bad');
      $('#f-sid').hidden = true;         // 이름을 고치면 학번 선택은 다시 감춘다
      $('#findMsg').innerHTML = '';
    });

    const f = $('#idForm');
    f.addEventListener('submit', submit);
    f.addEventListener('input', () => { progress(); clearBad(); });
    f.phone.addEventListener('input', e => {
      const p = e.target.selectionStart === e.target.value.length;
      e.target.value = hyphenPhone(e.target.value);
      if (p) { try { e.target.setSelectionRange(e.target.value.length, e.target.value.length); } catch (err) { } }
    });

    $('#phoneEdit').addEventListener('click', () => {
      $('#phoneKnown').hidden = true;
      $('#phoneNew').hidden = false;
      setTimeout(() => { try { f.phone.focus(); } catch (e) { } }, 60);
    });

    $('#agree').addEventListener('click', e => {
      if (e.target.tagName !== 'INPUT') e.preventDefault();
      const box = $('#agree');
      const inp = box.querySelector('input');
      inp.checked = !inp.checked;
      box.classList.toggle('on', inp.checked);
      box.querySelector('.box').innerHTML = inp.checked ? ic('check') : '';
      box.classList.remove('bad');
      progress();
    });

    $('#backBtn').addEventListener('click', reset);
    $('#againBtn').addEventListener('click', () => { $('#doneWrap').hidden = true; reset(); });

    // 이 기기에서 이미 낸 적이 있으면 이름을 채워둔다
    try {
      const d = JSON.parse(localStorage.getItem(SENT) || 'null');
      if (d && d.name) ff.name.value = d.name;
    } catch (e) { }
  }

  function reset() {
    found = null;
    $('#formWrap').hidden = true;
    $('#findWrap').hidden = false;
    $('#whyCard').hidden = false;
    $('#findMsg').innerHTML = '';
    $('#f-sid').hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function find(e) {
    e.preventDefault();
    const ff = $('#findForm');
    const nm = ff.name.value.trim();
    if (!nm) {
      $('#f-name').classList.add('bad');
      return toast('이름을 적어주세요', 'err');
    }
    const btn = $('#findBtn');
    btn.disabled = true; btn.textContent = '찾는 중…';
    try {
      const rows = await DB.id1365Lookup(nm);
      if (!rows.length) {
        $('#findMsg').innerHTML =
          '<div class="card flat center sm mut" style="padding:20px;margin:0">' +
          '<b>' + esc(nm) + '</b> 님은 구성원 명단에 없어요.<br>' +
          '이름이 정확한지 확인하고, 그래도 안 되면 운영진에게 알려주세요.</div>';
        return;
      }
      // 동명이인이면 학번을 골라야 한다
      const sidSel = ff.student_id;
      if (rows.length > 1) {
        const picked = sidSel.value;
        if (!$('#f-sid').hidden && picked) {
          const hit = rows.find(r => String(r.student_id || '') === picked);
          if (hit) return open(nm, hit);
        }
        $('#f-sid').hidden = false;
        sidSel.innerHTML = rows.map(r =>
          '<option value="' + esc(r.student_id || '') + '">' + esc(r.student_id || '학번 없음') + '학번</option>').join('');
        $('#findMsg').innerHTML =
          '<div class="pill-note" style="margin:0">같은 이름이 ' + rows.length + '명이에요. 학번을 고르고 다시 눌러주세요.</div>';
        return;
      }
      open(nm, rows[0]);
    } catch (err) {
      const m = String(err && err.message || '');
      toast(/relation|does not exist|schema cache|404|PGRST202/i.test(m)
        ? '명부 등록 준비가 아직 끝나지 않았어요. 운영진에게 알려주세요'
        : (m || '정보를 불러오지 못했어요'), 'err');
    } finally {
      btn.disabled = false; btn.textContent = '내 정보 불러오기';
    }
  }

  /* ============================================================
     ② 적기
     ============================================================ */
  function open(name, row) {
    found = Object.assign({ name }, row);
    const f = $('#idForm');

    $('#whoBox').innerHTML =
      '<div class="row between"><div>' +
      '<div class="sm mut">등록할 사람</div>' +
      '<div style="font-weight:800;font-size:17px">' + esc(name) +
      (row.student_id ? ' <span class="mut sm" style="font-weight:600">' + esc(row.student_id) + '학번</span>' : '') + '</div>' +
      '</div>' +
      (row.submitted
        ? '<span class="badge approved">등록됨</span>'
        : '<span class="badge pending">미등록</span>') + '</div>' +
      (row.submitted && row.updated_at
        ? '<div class="sm mut" style="margin-top:8px">' + fmtDateTime(row.updated_at) +
        ' 에 낸 내용이에요. 고치면 그대로 덮어써요.</div>' : '');

    f.birth.value = row.birth || '';
    f.portal_id.value = row.portal_id || '';
    f.phone.value = '';

    const hasPhone = !!row.phone_mask;
    $('#phoneKnown').hidden = !hasPhone;
    $('#phoneNew').hidden = hasPhone;
    if (hasPhone) $('#phoneMask').textContent = row.phone_mask;

    // 이미 낸 사람은 동의를 다시 받을 필요가 없다
    const agreeOn = !!row.submitted;
    const inp = $('#agree').querySelector('input');
    inp.checked = agreeOn;
    $('#agree').classList.toggle('on', agreeOn);
    $('#agree .box').innerHTML = agreeOn ? ic('check') : '';

    $('#submitBtn').textContent = row.submitted ? '이대로 고치기' : '명부에 올리기';
    $('#findWrap').hidden = true;
    $('#formWrap').hidden = false;
    $$('#idForm .bad').forEach(el => el.classList.remove('bad'));
    progress();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => { if (!f.birth.value) { try { f.birth.focus(); } catch (e) { } } }, 300);
  }

  function values() {
    const f = $('#idForm');
    return {
      name: (found && found.name) || '',
      student_id: (found && found.student_id) || '',
      birth: f.birth.value,
      portal_id: f.portal_id.value.trim(),
      phone: $('#phoneNew').hidden ? '' : hyphenPhone(f.phone.value)
    };
  }

  function progress() {
    const v = values();
    const hasPhone = !!(found && found.phone_mask) || String(v.phone).replace(/\D/g, '').length >= 10;
    const ok = $('#agree').querySelector('input').checked;
    const done = [!!v.birth, !!v.portal_id, hasPhone && ok];
    $$('#steps i').forEach((el, i) => el.classList.toggle('on', done[i]));
  }

  function clearBad() {
    const v = values();
    if (v.birth) $('#f-birth').classList.remove('bad');
    if (v.portal_id) $('#f-portal').classList.remove('bad');
    if (v.phone) $('#f-phone').classList.remove('bad');
  }

  function validate() {
    const v = values();
    let first = null;
    const mark = (id, bad) => {
      const el = $(id);
      el.classList.toggle('bad', bad);
      if (bad && !first) first = el;
    };
    const year = Number(String(v.birth).slice(0, 4));
    mark('#f-birth', !v.birth || !(year >= 1940 && year <= new Date().getFullYear()));
    mark('#f-portal', !v.portal_id);
    mark('#f-phone', !$('#phoneNew').hidden && String(v.phone).replace(/\D/g, '').length < 10);
    if (first) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('빠진 항목이 있어요', 'err');
      return false;
    }
    if (!$('#agree').querySelector('input').checked) {
      $('#agree').classList.add('bad');
      $('#agree').scrollIntoView({ behavior: 'smooth', block: 'center' });
      toast('개인정보 제공에 동의해주세요', 'err');
      return false;
    }
    return true;
  }

  const MSG = {
    closed: '방금 등록이 마감됐어요. 운영진에게 개인적으로 연락해주세요',
    nomatch: '구성원 명단에서 이름을 찾지 못했어요. 운영진에게 알려주세요',
    many: '같은 이름이 여러 명이에요. 학번을 골라 다시 찾아주세요',
    nobirth: '생년월일을 골라주세요',
    noportal: '1365 아이디를 적어주세요',
    nophone: '연락처를 적어주세요'
  };

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const btn = $('#submitBtn');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = '보내는 중…';
    const v = values();
    try {
      const r = await DB.id1365Submit(v);
      if (r !== 'ok') {
        if (r === 'closed') { settings = await DB.settings.get().catch(() => settings); paintOpenState(); }
        if (r === 'many') reset();
        throw new Error(MSG[r] || '등록하지 못했어요');
      }
      try {
        localStorage.setItem(SENT, JSON.stringify({ name: v.name, at: new Date().toISOString() }));
      } catch (err) { }
      showDone(v);
      cheer();
      toast('명부에 올렸어요!', 'ok');
    } catch (err) {
      const m = String(err && err.message || '');
      toast(/relation|does not exist|schema cache|404|PGRST202/i.test(m)
        ? '명부 등록 준비가 아직 끝나지 않았어요. 운영진에게 알려주세요'
        : (m || '등록하지 못했어요. 잠시 후 다시 시도해주세요'), 'err');
    } finally {
      btn.disabled = false; btn.textContent = label;
    }
  }

  const row = (k, v) => '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';

  function showDone(v) {
    const shownPhone = v.phone
      ? hyphenPhone(v.phone).replace(/^(\d{3})-(\d{3,4})-/, '$1-****-')
      : ((found && found.phone_mask) || '-');
    $('#doneSummary').innerHTML =
      row('이름', v.name) +
      row('생년월일', fmtDate(v.birth)) +
      row('1365 아이디', v.portal_id) +
      row('휴대전화', shownPhone);
    $('#doneMsg').textContent = (settings || {}).id1365_close_at
      ? '운영진이 ' + fmtDateTime(settings.id1365_close_at) + ' 이후에 모아서 자원봉사센터에 제출할게요.'
      : '운영진이 모아서 자원봉사센터에 제출할게요.';
    $('#findWrap').hidden = true;
    $('#formWrap').hidden = true;
    $('#whyCard').hidden = true;
    $('#doneWrap').hidden = false;
    found = null;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

})();
