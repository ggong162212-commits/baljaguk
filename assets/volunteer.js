/* ============================================================
   봉사모임 신청 폼 (volunteer.html?e=<모임 id>)
   · 모임을 만들면 이 주소가 같이 생긴다
   · 선착순 — 정원이 차면 스스로 닫힌다
   ============================================================ */
(function () {
  const { $, $$, toast, esc, fmtDate, fmtDateTime, weekday, cheer } = UI;

  const EV = new URLSearchParams(location.search).get('e') || '';
  const MINE = 'baljaguk.vol.' + EV;      // 이 기기에서 신청한 이름
  let ev = null, timer = null;

  UI.initTheme();
  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    $('#brandIcon').innerHTML = ic('paw');
    $('#pawline').innerHTML = ic('paw') + ic('paw') + ic('paw');
    $('#formTitle').innerHTML = ic('clipboard') + '<span>참여 신청</span>';
    $('#errIcon').innerHTML = circle('alert', 'var(--surface-2)');
    $('#closedIcon').innerHTML = circle('clock', 'var(--surface-2)');
    $('#doneIcon').innerHTML = circle('check', 'var(--brand-soft)');
    $('[data-theme-btn]').addEventListener('click', UI.toggleTheme);
    UI.paintThemeButtons();

    let settings = null;
    try { settings = await DB.settings.get(); } catch (e) { }
    if (settings) {
      $('#brandName').textContent = settings.club_name || '발자국';
      $('#footNote').textContent = (settings.club_name || '발자국') + ' · 궁금한 건 운영진에게 알려주세요';
    }

    if (!EV) return fail();
    await load();
    wire();
    setInterval(load, 15000);   // 남은 자리를 계속 맞춰준다
  }
  const circle = (name, bg) =>
    '<span style="width:54px;height:54px;border-radius:50%;background:' + bg +
    ';display:grid;place-items:center">' + ic(name) + '</span>';

  function fail() {
    $('#loadWrap').hidden = true;
    $('#errWrap').hidden = false;
  }

  async function load() {
    let row = null;
    try { row = await DB.eventPublic(EV); } catch (e) { }
    if (!row) return fail();
    ev = row;
    $('#loadWrap').hidden = true;
    $('#mainWrap').hidden = false;
    paint();
  }

  /* ---------- 화면 ---------- */
  function state() {
    const taken = Number(ev.taken) || 0;
    const cap = Number(ev.capacity) || 0;
    if (ev.signup_open === false) return { open: false, why: 'manual', taken, cap };
    if (ev.signup_open_at && Date.now() < Date.parse(ev.signup_open_at))
      return { open: false, why: 'before', at: ev.signup_open_at, taken, cap };
    if (cap && taken >= cap) return { open: false, why: 'full', taken, cap };
    return { open: true, taken, cap };
  }

  function paint() {
    const st = state();
    const mine = localStorage.getItem(MINE);

    $('#kicker').innerHTML = ic('paw') + '<span>' + esc(ev.place || '봉사') + '</span>';
    $('#evTitle').textContent = ev.title || '봉사 신청';
    $('#evLead').textContent = st.cap
      ? '선착순 ' + st.cap + '명이에요. 이름을 적고 신청해주세요.'
      : '이름을 적고 신청해주세요.';

    $('#evDetail').innerHTML =
      row2('날짜', fmtDate(ev.date) + ' (' + weekday(ev.date) + ')') +
      row2('장소', ev.place || '-') +
      (ev.start_time ? row2('시간', timeLabel(ev.start_time)) : '') +
      row2('인원', st.cap ? st.taken + ' / ' + st.cap + '명' : st.taken + '명 신청');
    $('#evNote').innerHTML = ev.note
      ? '<div class="pill-note" style="margin-top:12px;white-space:pre-wrap">' + esc(ev.note) + '</div>' : '';

    // 남은 자리 막대
    const slot = $('#statusSlot');
    if (st.cap) {
      const pct = Math.min(100, Math.round(st.taken / st.cap * 100));
      const left = Math.max(0, st.cap - st.taken);
      slot.innerHTML =
        '<div class="card tight">' +
        '<div class="row between sm" style="margin-bottom:7px">' +
        '<b style="color:' + (left ? 'var(--brand-deep)' : 'var(--danger)') + '">' +
        (left ? '자리 ' + left + '개 남았어요' : '자리가 다 찼어요') + '</b>' +
        '<span class="mut">' + st.taken + '/' + st.cap + '</span></div>' +
        '<div class="bar"><i style="width:' + pct + '%' + (left ? '' : ';background:var(--danger)') + '"></i></div></div>';
    } else {
      slot.innerHTML = '<div class="statusbar open">' + ic('check') +
        '<span>' + (st.open ? '신청 받는 중이에요' : '신청을 받지 않아요') + '</span></div>';
    }

    // 신청자 명단
    const names = ev.names || [];
    $('#peopleSlot').innerHTML = names.length
      ? '<div class="card tight"><div class="row between" style="margin-bottom:8px">' +
        '<b class="sm">신청한 사람 ' + names.length + '명</b></div>' +
        '<div class="tagrow">' + names.map(n => '<span class="chip">' + esc(n) + '</span>').join('') + '</div></div>'
      : '';

    // 이미 신청한 사람 / 마감 / 신청 가능
    if (mine && names.includes(mine)) return showDone(mine);
    $('#doneWrap').hidden = true;

    if (st.open) {
      $('#formWrap').hidden = false;
      $('#closedWrap').hidden = true;
      countdown(null);
    } else {
      $('#formWrap').hidden = true;
      $('#closedWrap').hidden = false;
      if (st.why === 'before') {
        $('#closedTitle').textContent = '곧 신청이 열려요';
        $('#closedMsg').innerHTML = fmtDateTime(st.at) + ' 부터 신청할 수 있어요.<br>' +
          '<b id="cd" style="font-family:var(--font-title);font-size:17px">계산 중</b> 남았어요';
        countdown(st.at);
      } else if (st.why === 'full') {
        $('#closedTitle').textContent = '자리가 다 찼어요';
        $('#closedMsg').textContent = '선착순 ' + st.cap + '명이 모두 신청했어요. 다음 봉사에서 만나요!';
        countdown(null);
      } else {
        $('#closedTitle').textContent = '지금은 신청을 받지 않아요';
        $('#closedMsg').textContent = '운영진이 신청을 닫아둔 상태예요.';
        countdown(null);
      }
    }
  }
  const row2 = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + esc(v) + '</span></div>';
  function timeLabel(t) {
    const [h, m] = String(t).split(':');
    const hh = Number(h);
    return (hh < 12 ? '오전 ' : '오후 ') + (hh % 12 === 0 ? 12 : hh % 12) + '시' + (m && m !== '00' ? ' ' + m + '분' : '');
  }

  /* 열리기까지 남은 시간 */
  function countdown(at) {
    if (timer) { clearInterval(timer); timer = null; }
    if (!at) return;
    const end = Date.parse(at);
    const p2 = n => String(n).padStart(2, '0');
    const tick = () => {
      const el = $('#cd');
      if (!el) { clearInterval(timer); timer = null; return; }
      let left = end - Date.now();
      if (left <= 0) { clearInterval(timer); timer = null; load(); return; }
      const d = Math.floor(left / 86400000); left -= d * 86400000;
      const h = Math.floor(left / 3600000); left -= h * 3600000;
      const m = Math.floor(left / 60000), s = Math.floor(left % 60000 / 1000);
      el.textContent = (d ? d + '일 ' : '') + p2(h) + ':' + p2(m) + ':' + p2(s);
    };
    tick(); timer = setInterval(tick, 1000);
  }

  function showDone(name) {
    $('#formWrap').hidden = true;
    $('#closedWrap').hidden = true;
    $('#doneWrap').hidden = false;
    $('#doneMsg').textContent = '봉사 당일에 만나요! 못 가게 되면 운영진에게 개인적으로 연락해주세요.';
    $('#doneSummary').innerHTML =
      row2('이름', name) + row2('날짜', fmtDate(ev.date) + ' (' + weekday(ev.date) + ')') +
      row2('장소', ev.place || '-') + (ev.start_time ? row2('시간', timeLabel(ev.start_time)) : '');
  }

  /* ---------- 동작 ---------- */
  function wire() {
    const f = $('#signForm');
    f.addEventListener('submit', submit);
    f.name.addEventListener('input', () => {
      $('#f-name').classList.remove('bad');
      $('#f-sid').hidden = true;
    });
  }

  function nameValue() { return $('#signForm').name.value.trim(); }
  function sidValue() {
    const el = $('#f-sid');
    return el.hidden ? '' : ($('#signForm').student_id.value || '');
  }

  async function askSid(name) {
    let who = [];
    try { who = await DB.eventWho(name); } catch (e) { }
    if (who.length < 2) return false;
    const sel = $('#signForm').student_id;
    sel.innerHTML = who.map(w => '<option value="' + esc(w.student_id || '') + '">' +
      esc(w.student_id || '(학번 없음)') + '학번</option>').join('');
    $('#f-sid').hidden = false;
    toast('같은 이름이 ' + who.length + '명이에요. 학번을 골라주세요');
    return true;
  }

  async function submit(e) {
    e.preventDefault();
    const name = nameValue();
    if (!name) { $('#f-name').classList.add('bad'); return; }
    const btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = '신청하는 중…';
    try {
      const r = await DB.eventSignup(EV, name, sidValue());
      if (r === 'ok') {
        localStorage.setItem(MINE, name);
        await load();
        cheer();
        toast('신청됐어요!', 'ok');
      } else if (r === 'many') {
        await askSid(name);
      } else {
        toast(MSG[r] || '신청하지 못했어요', 'err');
        if (r === 'full' || r === 'closed' || r === 'before') await load();
      }
    } catch (err) {
      toast(err.message || '신청하지 못했어요', 'err');
    } finally {
      btn.disabled = false; btn.textContent = '신청하기';
    }
  }

  const MSG = {
    closed: '지금은 신청을 받지 않아요',
    before: '아직 신청이 열리지 않았어요',
    full: '방금 자리가 다 찼어요',
    dup: '이미 신청되어 있어요',
    nomatch: '구성원 명단에 없는 이름이에요. 운영진에게 알려주세요',
    none: '신청한 기록이 없어요',
    noevent: '봉사모임을 찾지 못했어요'
  };
})();
