/* ============================================================
   운영진 관리 화면
   ============================================================ */
(function () {
  const { $, $$, toast, sheet, closeSheet, confirmSheet, copy, won, num, esc,
    fmtDate, fmtDateTime, weekday, relTime, hyphenPhone, normSid, avatar, downloadCSV,
    debounce, toLocalInput, fromLocalInput } = UI;

  const S = { settings: null, apps: [], members: [], events: [], att: [], fin: [], camps: [], dons: [] };
  const F = { apply: 'pending', member: 'all', sort: 'name', fin: 'all', finMonth: 'all', q1: '', q2: '', day: null, month: null };
  let cur = 'form';

  const TABS = [
    { id: 'form', label: '폼', icon: 'clipboard' },
    { id: 'apply', label: '가입', icon: 'mail' },
    { id: 'members', label: '구성원', icon: 'users' },
    { id: 'vol', label: '봉사', icon: 'paw' },
    { id: 'fin', label: '재정', icon: 'wallet' },
    { id: 'donate', label: '후원', icon: 'heart' }
  ];

  const P2 = n => String(n).padStart(2, '0');
  const dkey = d => d.getFullYear() + '-' + P2(d.getMonth() + 1) + '-' + P2(d.getDate());
  const byId = (arr, id) => arr.find(x => x.id === id);
  const volCount = id => S.att.filter(a => a.member_id === id).length;
  const volHours = id => S.att.filter(a => a.member_id === id).reduce((s, a) => s + (Number(a.hours) || 0), 0);
  const approvedCount = () => S.apps.filter(a => a.status === 'approved').length;
  const balance = () => S.fin.reduce((s, f) => s + (f.kind === 'income' ? 1 : -1) * (Number(f.amount) || 0), 0);
  const autoFee = () => localStorage.getItem('baljaguk.autoFee') !== '0';
  const formURL = () => new URL('index.html', location.href).href;

  UI.initTheme();
  document.addEventListener('DOMContentLoaded', boot);

  function boot() {
    $('#brandIcon').innerHTML = ic('paw');
    $('#gearBtn').innerHTML = ic('settings');
    $('#lockIcon').innerHTML = ic('lock');
    $('#applySearchIcon').innerHTML = ic('search');
    $('#memberSearchIcon').innerHTML = ic('search');
    $('[data-theme-btn]').addEventListener('click', UI.toggleTheme);
    UI.paintThemeButtons();
    $('#gearBtn').addEventListener('click', () => go('settings'));
    $('#modeBadge').textContent = DB.isDemo() ? '체험 모드' : '연결됨';
    $('#modeBadge').className = 'badge ' + (DB.isDemo() ? 'pending' : 'approved');
    $('#loginHint').textContent = DB.isDemo()
      ? '아직 데이터베이스에 연결하지 않아 체험 모드예요. 기본 비밀번호는 260324.'
      : '';

    $('#tabbar').innerHTML = TABS.map(t =>
      '<button type="button" data-tab="' + t.id + '"><span class="i">' + ic(t.icon) + '</span>' + t.label + '</button>').join('');
    $$('#tabbar [data-tab]').forEach(b => b.addEventListener('click', () => go(b.dataset.tab)));

    $('#loginForm').addEventListener('submit', login);
    start();
  }

  // 잠금이 꺼져 있으면(기본) 주소만으로 바로 들어간다
  const locked = () => {
    const v = localStorage.getItem('baljaguk.lock');
    return v === null ? !!(window.CONFIG || {}).ADMIN_LOCK : v === '1';
  };
  async function start() {
    if (DB.isAuthed()) return enter();
    if (!locked()) {
      try { await DB.login((window.CONFIG || {}).ADMIN_PASSWORD || (window.CONFIG || {}).DEMO_PASSWORD || '260324'); return enter(); }
      catch (e) { toast('자동 입장에 실패했어요. 비밀번호로 들어와주세요', 'err'); }
    }
    $('#pw').focus();
  }

  async function login(e) {
    e.preventDefault();
    const btn = $('#loginBtn'); btn.disabled = true; btn.textContent = '확인 중…';
    try { await DB.login($('#pw').value.trim()); await enter(); toast('어서오세요!', 'ok'); }
    catch (err) { toast(err.message || '비밀번호가 맞지 않아요', 'err'); $('#pw').select(); }
    finally { btn.disabled = false; btn.textContent = '들어가기'; }
  }

  async function enter() {
    $('#login').hidden = true;
    $('#topbar').hidden = false; $('#admin').hidden = false; $('#tabbar').hidden = false;
    await load();
    go(cur);
    startLive();
  }

  /* ---------- 다른 운영진의 변경을 자동으로 받아오기 ---------- */
  let liveStop = null;
  function sig() {
    return JSON.stringify([
      S.settings,
      S.apps.map(a => a.id + a.status + a.name),
      S.members.map(m => m.id + m.name + m.role + m.student_id),
      S.events.map(e => e.id + e.date + e.title + e.place + (e.start_time || '')),
      S.att.map(a => a.event_id + a.member_id + a.hours),
      S.fin.map(f => f.id + f.kind + f.amount + f.category + f.date),
      S.camps.map(c => c.id + c.title + c.goal + c.status + c.ends_on),
      S.dons.map(d => d.id + d.amount + d.date + (d.member_id || d.donor_name || ''))
    ]);
  }
  function startLive() {
    if (liveStop) return;
    let last = sig();
    liveStop = DB.live(async () => {
      if (document.querySelector('.overlay')) return;              // 뭔가 입력 중이면 건드리지 않기
      const el = document.activeElement;
      if (el && /INPUT|TEXTAREA|SELECT/.test(el.tagName)) return;
      const beforePending = S.apps.filter(a => a.status === 'pending').length;
      await load();
      const now = sig();
      if (now === last) return;
      last = now;
      render();
      const pending = S.apps.filter(a => a.status === 'pending').length;
      if (pending > beforePending) toast('새 가입 신청이 ' + (pending - beforePending) + '건 들어왔어요', 'ok');
      else $('#syncNote') && ($('#syncNote').textContent = '방금 업데이트됨');
    });
  }

  async function load() {
    try {
      const [settings, apps, members, events, att, fin, camps, dons] = await Promise.all([
        DB.settings.get(), DB.applications.list(), DB.members.list(),
        DB.events.list(), DB.attendance.list(), DB.finance.list(),
        DB.campaigns.list(), DB.donations.list()
      ]);
      Object.assign(S, { settings, apps, members, events, att, fin, camps, dons });
    } catch (e) {
      toast(e.message || '데이터를 불러오지 못했어요', 'err');
      if (e.status === 401) { DB.logout(); location.reload(); }
    }
  }
  async function reload(renderNow) { await load(); if (renderNow !== false) render(); }

  function go(name) {
    cur = name;
    $$('.view').forEach(v => v.classList.toggle('on', v.id === 'v-' + name));
    $$('#tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
    window.scrollTo({ top: 0 });
    render();
  }
  function render() {
    ({
      form: renderForm, apply: renderApply, members: renderMembers,
      vol: renderVol, fin: renderFin, donate: renderDonate, settings: renderSettings
    }[cur] || (() => { }))();
  }

  /* ============================================================
     1. 폼 관리
     ============================================================ */
  function renderForm() {
    const s = S.settings, st = DB.formState(s, approvedCount());
    const pending = S.apps.filter(a => a.status === 'pending').length;
    const todayNew = S.apps.filter(a => (a.created_at || '').slice(0, 10) === dkey(new Date())).length;

    const why = { manual: '운영진이 접수를 꺼둔 상태예요', before: '예약된 오픈 시각을 기다리는 중이에요', closed: '예약 마감 시각이 지났어요', full: '정원이 다 찼어요' };

    $('#formPanel').innerHTML =
      '<div class="card">' +
      '<div class="row between"><div><h3>신청 접수</h3><div class="sub" id="formStateText">' +
      (st.open ? '지금 신청을 받고 있어요' : (why[st.why] || '접수를 받지 않는 중이에요')) + '</div></div>' +
      '<label class="switch"><input type="checkbox" id="openSw"' + (s.form_open !== false ? ' checked' : '') + '><span class="track"></span></label></div>' +
      '<div class="divider"></div>' +
      '<div class="field"><span class="lb">접수 시작 예약</span>' + dtField('openAt', s.form_open_at) +
      '<span class="hint">비워두면 바로 접수해요.</span></div>' +
      '<div class="field"><span class="lb">자동 마감 예약</span>' + dtField('closeAt', s.form_close_at) +
      '<span class="hint">이 시각이 지나면 폼이 스스로 닫혀요.</span></div>' +
      '<div class="row" style="gap:8px;margin:-6px 0 14px">' +
      '<button class="btn ghost sm" data-quick="1">오늘 밤 23:59</button>' +
      '<button class="btn ghost sm" data-quick="7">7일 뒤</button>' +
      '<button class="btn ghost sm" data-quick="0">지우기</button></div>' +
      '<label class="field"><span class="lb">정원 (선택)</span>' +
      '<input class="input" type="number" min="0" id="cap" placeholder="예: 30" value="' + (s.capacity || '') + '">' +
      '<span class="hint">승인 인원이 정원에 닿으면 자동으로 마감해요. 지금 승인 ' + approvedCount() + '명.</span></label>' +
      '<label class="field"><span class="lb">마감 중 안내 문구</span>' +
      '<textarea class="input" id="closedMsg" style="min-height:80px">' + esc(s.closed_message || '') + '</textarea></label>' +
      '<button class="btn primary block" id="saveForm">저장하기</button>' +
      '</div>' +

      '<div class="card">' +
      '<h3>신청 폼 주소</h3><div class="sub">구성원에게 공유할 링크예요. 운영진 주소와는 다릅니다.</div>' +
      '<div class="acct" style="margin-top:12px"><div class="sm" style="word-break:break-all">' + esc(formURL()) + '</div>' +
      '<div class="row" style="gap:8px"><button class="btn soft sm grow" id="copyLink">링크 복사</button>' +
      '<button class="btn ghost sm grow" id="openLink">폼 열어보기</button></div></div>' +
      '<button class="btn ghost block sm" id="copyNotice" style="margin-top:10px">공지 문구 통째로 복사</button>' +
      '</div>' +

      '<div class="card"><h3>한눈에 보기</h3><div class="sp"></div><div class="mini">' +
      mini('승인 대기', pending + '건') + mini('오늘 신청', todayNew + '건') +
      mini('구성원', S.members.length + '명') + mini('잔액', num(balance()) + '원') +
      '</div></div>';

    $('#openSw').addEventListener('change', async e => {
      await save({ form_open: e.target.checked });
      toast(e.target.checked ? '접수를 열었어요' : '접수를 닫았어요', 'ok');
      renderForm();
    });
    $$('[data-quick]').forEach(b => b.addEventListener('click', () => {
      const n = Number(b.dataset.quick);
      if (!n) { setDt('closeAt', null); return; }
      const d = new Date(); d.setDate(d.getDate() + (n === 1 ? 0 : n)); d.setHours(23, 59, 0, 0);
      setDt('closeAt', d.toISOString());
    }));
    $('#saveForm').addEventListener('click', async () => {
      await save({
        form_open_at: readDt('openAt', '00:00'),
        form_close_at: readDt('closeAt', '23:59'),
        capacity: $('#cap').value ? Number($('#cap').value) : null,
        closed_message: $('#closedMsg').value.trim()
      });
      toast('저장했어요', 'ok'); renderForm();
    });
    $('#copyLink').addEventListener('click', () => copy(formURL(), '폼 주소를 복사했어요'));
    $('#openLink').addEventListener('click', () => window.open(formURL(), '_blank'));
    $('#copyNotice').addEventListener('click', () => {
      const s2 = S.settings;
      const close = s2.form_close_at ? '\n마감: ' + fmtDateTime(s2.form_close_at) : '';
      copy('🐾 ' + s2.club_name + ' ' + (s2.generation || '') + ' 부원 모집\n' +
        s2.tagline + '\n\n신청 폼: ' + formURL() +
        (s2.fee ? '\n회비: ' + won(s2.fee) + ' (' + s2.bank + ' ' + s2.account + ' ' + s2.holder + ')' : '') +
        close, '공지 문구를 복사했어요');
    });
  }
  const mini = (k, v) => '<div class="b"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';

  /* 날짜 + 시각 (모바일에서 datetime-local 이 잘려 보여 둘로 나눔) */
  function dtField(id, iso) {
    const local = toLocalInput(iso);           // 2026-09-08T23:59
    const d = local ? local.slice(0, 10) : '';
    const t = local ? local.slice(11, 16) : '';
    return '<div class="dt2">' +
      '<input class="input" type="date" id="' + id + 'D" value="' + d + '" aria-label="날짜">' +
      '<input class="input" type="time" id="' + id + 'T" value="' + t + '" aria-label="시각">' +
      '</div>';
  }
  function setDt(id, iso) {
    const local = toLocalInput(iso);
    $('#' + id + 'D').value = local ? local.slice(0, 10) : '';
    $('#' + id + 'T').value = local ? local.slice(11, 16) : '';
  }
  function readDt(id, fallbackTime) {
    const d = $('#' + id + 'D').value;
    if (!d) return null;
    const t = $('#' + id + 'T').value || fallbackTime;
    return fromLocalInput(d + 'T' + t);
  }

  async function save(patch) {
    try { S.settings = await DB.settings.save(patch) || Object.assign(S.settings, patch); }
    catch (e) { toast(e.message || '저장하지 못했어요', 'err'); }
  }

  /* ============================================================
     2. 가입 신청
     ============================================================ */
  function renderApply() {
    const counts = {
      pending: S.apps.filter(a => a.status === 'pending').length,
      approved: S.apps.filter(a => a.status === 'approved').length,
      rejected: S.apps.filter(a => a.status === 'rejected').length,
      all: S.apps.length
    };
    const chips = [['pending', '대기'], ['approved', '승인'], ['rejected', '반려'], ['all', '전체']];
    $('#applyChips').innerHTML = chips.map(([k, l]) =>
      '<button class="chip' + (F.apply === k ? ' on' : '') + '" data-c="' + k + '">' + l +
      '<span class="n">' + counts[k] + '</span></button>').join('');
    $$('#applyChips [data-c]').forEach(b => b.addEventListener('click', () => { F.apply = b.dataset.c; renderApply(); }));

    const q = F.q1.trim();
    let list = S.apps.filter(a => F.apply === 'all' || a.status === F.apply);
    if (q) list = list.filter(a => (a.name + a.department + a.student_id).includes(q));
    list.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    $('#applyBulk').innerHTML = (F.apply === 'pending' && counts.pending > 1)
      ? '<button class="btn soft block sm" id="bulkOk" style="margin-bottom:10px">대기 ' + counts.pending + '건 모두 승인하기</button>' : '';
    const bulk = $('#bulkOk');
    if (bulk) bulk.addEventListener('click', bulkApprove);

    $('#applyList').innerHTML = list.length ? '<div class="list">' + list.map(a =>
      '<div class="item" data-a="' + a.id + '" tabindex="0" role="button">' +
      avatar(a) +
      '<div class="grow"><div class="nm">' + esc(a.name) +
      '<span class="badge ' + a.status + '">' + ({ pending: '대기', approved: '승인', rejected: '반려' }[a.status]) + '</span></div>' +
      '<div class="meta">' + esc(a.student_id || '') + '학번 · ' + esc(a.department || '') + '</div>' +
      '<div class="sub"><span>' + relTime(a.created_at) + '</span></div></div>' +
      '<span class="arrow">' + ic('chevron') + '</span></div>').join('') + '</div>'
      : empty('clipboard', F.apply === 'pending' ? '대기 중인 신청이 없어요' : '해당하는 신청이 없어요');

    $$('#applyList [data-a]').forEach(el => {
      const open = () => appSheet(byId(S.apps, el.dataset.a));
      el.addEventListener('click', open);
      el.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    });
  }
  $ && document.addEventListener('input', e => {
    if (e.target.id === 'applySearch') { F.q1 = e.target.value; renderApply(); $('#applySearch').focus(); }
    if (e.target.id === 'memberSearch') { F.q2 = e.target.value; renderMembers(); $('#memberSearch').focus(); }
  });

  function appSheet(a) {
    if (!a) return;
    const phone = a.phone || '';
    const body =
      '<div class="row" style="gap:12px;margin-bottom:14px">' + avatar(a, 'lg') +
      '<div><div style="font-family:var(--font-title);font-size:21px">' + esc(a.name) + '</div>' +
      '<div class="mut sm">' + esc(a.student_id || '') + '학번 · ' + esc(a.department || '') + '</div>' +
      '<div class="badge ' + a.status + '" style="margin-top:6px">' + ({ pending: '승인 대기', approved: '승인됨', rejected: '반려됨' }[a.status]) + '</div></div></div>' +
      '<div class="card flat" style="margin-bottom:12px">' +
      kv('연락처', esc(phone)) + kv('신청 시각', fmtDateTime(a.created_at)) +
      (a.reviewed_at ? kv('처리 시각', fmtDateTime(a.reviewed_at)) : '') +
      (a.note ? kv('메모', esc(a.note)) : '') + '</div>' +
      '<div class="row" style="gap:8px;margin-bottom:14px">' +
      '<a class="btn ghost sm grow" href="tel:' + esc(phone.replace(/\D/g, '')) + '">전화</a>' +
      '<a class="btn ghost sm grow" href="sms:' + esc(phone.replace(/\D/g, '')) + '">문자</a>' +
      '<button class="btn ghost sm grow" data-copyphone>번호 복사</button></div>' +
      '<div class="lb" style="font-size:13.5px;font-weight:700;color:var(--ink-2);margin-bottom:6px">지원 동기</div>' +
      '<div class="card flat sm" style="margin-bottom:14px;white-space:pre-wrap">' + esc(a.motivation || '(작성 없음)') + '</div>' +
      '<div class="lb" style="font-size:13.5px;font-weight:700;color:var(--ink-2);margin-bottom:6px">입금증</div>' +
      (a.has_receipt ? '<div id="rcBox" class="card flat center mut sm" style="padding:22px">사진 불러오는 중…</div>'
        : '<div class="card flat center mut sm" style="padding:22px">첨부된 입금증이 없어요</div>') +
      (a.status === 'pending'
        ? '<div class="divider"></div>' +
        (S.settings.fee ? '<label class="check on" data-fee style="margin-bottom:10px"><span class="box">' + ic('check') + '</span>' +
          '<span class="sm">승인하면 회비 ' + won(S.settings.fee) + '을 수입으로 기록</span></label>' : '') +
        '<div class="row" style="gap:8px"><button class="btn danger grow" data-rej>반려</button>' +
        '<button class="btn primary grow" data-ok>승인하고 구성원 추가</button></div>'
        : '<div class="divider"></div><div class="row" style="gap:8px">' +
        '<button class="btn ghost grow" data-back>대기 상태로</button>' +
        '<button class="btn danger grow" data-del>신청 삭제</button></div>');

    const ov = sheet({ title: '신청서', body, noFocus: true });
    const on = (sel, fn) => { const el = ov.querySelector(sel); if (el) el.addEventListener('click', fn); };
    on('[data-copyphone]', () => copy(phone, '연락처를 복사했어요'));
    if (a.has_receipt) {
      DB.getReceipt('applications', a.id).then(src => {
        const box = ov.querySelector('#rcBox');
        if (!box || !src) return;
        box.outerHTML = '<img class="receipt" src="' + src + '" alt="입금증" id="rcImg">';
        const img = ov.querySelector('#rcImg');
        if (img) img.addEventListener('click', () => window.open(src, '_blank'));
      }).catch(() => { const box = ov.querySelector('#rcBox'); if (box) box.textContent = '사진을 불러오지 못했어요'; });
    }
    const feeBox = ov.querySelector('[data-fee]');
    if (feeBox) feeBox.addEventListener('click', () => {
      feeBox.classList.toggle('on');
      feeBox.querySelector('.box').innerHTML = feeBox.classList.contains('on') ? ic('check') : '';
    });
    on('[data-ok]', async () => {
      closeSheet();
      const fee = (feeBox && feeBox.classList.contains('on')) ? S.settings.fee : 0;
      try {
        await DB.approve(a, { fee });
        await load();
        toast(a.name + '님을 구성원으로 추가했어요', 'ok');
        await capacityGuard();
        render();
      } catch (e) { toast(e.message || '승인하지 못했어요', 'err'); }
    });
    on('[data-rej]', () => {
      closeSheet();
      const ov2 = sheet({
        title: '반려 사유', body:
          '<label class="field"><span class="lb">신청자에게 전할 메모 (선택)</span>' +
          '<textarea class="input" id="rejMsg" placeholder="예: 입금 내역이 확인되지 않았어요"></textarea></label>' +
          '<div class="row" style="gap:8px"><button class="btn ghost grow" data-no>취소</button>' +
          '<button class="btn danger grow" data-yes>반려하기</button></div>'
      });
      ov2.querySelector('[data-no]').onclick = closeSheet;
      ov2.querySelector('[data-yes]').onclick = async () => {
        const msg = ov2.querySelector('#rejMsg').value.trim();
        closeSheet();
        try { await DB.reject(a, msg); await reload(); toast('반려 처리했어요'); }
        catch (e) { toast(e.message || '처리하지 못했어요', 'err'); }
      };
    });
    on('[data-back]', async () => {
      closeSheet();
      await DB.applications.update(a.id, { status: 'pending', note: '', reviewed_at: null });
      await reload(); toast('대기 상태로 되돌렸어요');
    });
    on('[data-del]', async () => {
      closeSheet();
      if (!await confirmSheet('신청서를 삭제할까요?', '되돌릴 수 없어요. 구성원으로 등록된 정보는 그대로 남습니다.', '삭제', true)) return;
      await DB.applications.remove(a.id); await reload(); toast('삭제했어요');
    });
  }
  const kv = (k, v) => '<div class="kv"><span class="k">' + k + '</span><span class="v">' + v + '</span></div>';

  async function bulkApprove() {
    const list = S.apps.filter(a => a.status === 'pending');
    if (!await confirmSheet('대기 ' + list.length + '건을 모두 승인할까요?',
      '모두 구성원으로 추가되고' + (S.settings.fee && autoFee() ? ', 회비 수입도 각각 기록돼요.' : '요.'), '모두 승인')) return;
    toast('처리 중이에요…');
    let ok = 0;
    for (const a of list) { try { await DB.approve(a, { fee: autoFee() ? S.settings.fee : 0 }); ok++; } catch (e) { } }
    await load(); await capacityGuard(); render();
    toast(ok + '명을 구성원으로 추가했어요', 'ok');
  }

  async function capacityGuard() {
    const s = S.settings;
    if (s.capacity && approvedCount() >= s.capacity && s.form_open !== false) {
      await save({ form_open: false });
      toast('정원 ' + s.capacity + '명이 차서 접수를 자동으로 닫았어요');
    }
  }

  /* ============================================================
     3. 구성원
     ============================================================ */
  function renderMembers() {
    const all = S.members;
    const admins = all.filter(m => m.role === 'admin').length;

    $('#memberStats').innerHTML =
      '<div class="statcard">' +
      stat('green', 'users', '전체', all.length + '명') +
      stat('gold', 'star', '운영진', admins + '명') + '</div>';

    const counts = { all: all.length, admin: admins };
    const chips = [['all', '전체'], ['admin', '운영진']];
    $('#memberChips').innerHTML = chips.map(([k, l]) =>
      '<button class="chip' + (F.member === k ? ' on' : '') + '" data-m="' + k + '">' + l + '<span class="n">' + counts[k] + '</span></button>').join('');
    $$('#memberChips [data-m]').forEach(b => b.addEventListener('click', () => { F.member = b.dataset.m; renderMembers(); }));

    const sorts = [['name', '이름순'], ['vol', '봉사 많은 순']];
    $('#memberSort').innerHTML = sorts.map(([k, l]) =>
      '<button type="button" class="' + (F.sort === k ? 'on' : '') + '" data-s="' + k + '">' + l + '</button>').join('');
    $$('#memberSort [data-s]').forEach(b => b.addEventListener('click', () => { F.sort = b.dataset.s; renderMembers(); }));

    let list = all.slice();
    if (F.member === 'admin') list = list.filter(m => m.role === 'admin');
    const q = F.q2.trim();
    if (q) list = list.filter(m => (m.name + (m.department || '') + (m.student_id || '')).includes(q));
    if (F.sort === 'name') list.sort((a, b) =>
      (b.role === 'admin') - (a.role === 'admin') || a.name.localeCompare(b.name, 'ko'));
    if (F.sort === 'vol') list.sort((a, b) => volCount(b.id) - volCount(a.id));

    const king = topMember();
    const kingHTML = king ? '<div class="kingbar" data-m2="' + king.m.id + '">' +
      '<span class="cr">' + ic('crown') + '</span>' + avatar(king.m) +
      '<div class="grow"><div class="lb">' + king.label + '</div>' +
      '<div class="nm">' + esc(king.m.name) + '</div>' +
      '<div class="mut" style="font-size:11.5px">' + esc(king.m.department || '') + '</div></div>' +
      '<div class="cnt">' + king.n + '<small>회</small><div class="mut" style="font-size:11px;font-family:var(--font-body)">' +
      king.unit + '</div></div></div>' : '';

    $('#memberList').innerHTML = kingHTML + (list.length ? '<div class="list">' + list.map(m =>
      '<div class="item" data-m2="' + m.id + '" tabindex="0" role="button">' + avatar(m) +
      '<div class="grow"><div class="nm">' + esc(m.name) +
      (m.role === 'admin' ? '<span class="badge admin">운영진</span>' : '') + '</div>' +
      '<div class="meta">' + esc(m.student_id || '') + '학번</div>' +
      '<div class="sub"><span>가입 ' + fmtDate(m.joined_on || m.created_at) + '</span>' +
      '<span>누적 봉사 ' + volCount(m.id) + '회</span></div></div>' +
      '<span class="arrow">' + ic('chevron') + '</span></div>').join('') + '</div>'
      : empty('users', '해당하는 구성원이 없어요'));

    $$('#memberList [data-m2]').forEach(el => {
      const open = () => memberSheet(byId(S.members, el.dataset.m2));
      el.addEventListener('click', open);
      el.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
    });

    $('#addMember').onclick = () => memberSheet(null);
    $('#exportMembers').onclick = () => {
      downloadCSV('발자국_구성원_' + dkey(new Date()) + '.csv',
        ['이름', '학번', '학과', '연락처', '역할', '가입일', '누적봉사(회)', '누적시간'],
        S.members.map(m => [m.name, m.student_id, m.department, m.phone,
        m.role === 'admin' ? '운영진' : '일반회원',
        m.joined_on || '', volCount(m.id), volHours(m.id)]));
      toast('명단을 내려받았어요', 'ok');
    };
  }
  const stat = (c, i, k, v) => '<div class="stat"><span class="ic ' + c + '">' + ic(i) + '</span><div><div class="lb">' + k + '</div><div class="vl">' + v + '</div></div></div>';
  const empty = (i, msg) => '<div class="card empty"><div style="display:flex;justify-content:center;color:var(--ink-3)">' + ic(i) + '</div><div style="margin-top:8px">' + msg + '</div></div>';

  function topMember() {
    const ym = dkey(new Date()).slice(0, 7);
    const pick = (filter) => {
      const cnt = {};
      S.att.forEach(a => {
        const ev = byId(S.events, a.event_id);
        if (ev && filter(ev)) cnt[a.member_id] = (cnt[a.member_id] || 0) + 1;
      });
      let best = null;
      Object.keys(cnt).forEach(id => { if (!best || cnt[id] > best.n) { const m = byId(S.members, id); if (m) best = { m, n: cnt[id] }; } });
      return best;
    };
    const month = pick(ev => String(ev.date).slice(0, 7) === ym);
    if (month) return Object.assign(month, { label: '이달의 참여왕', unit: '이번 달 봉사' });
    const all = pick(() => true);
    return all && Object.assign(all, { label: '누적 참여왕', unit: '누적 봉사' });
  }

  /* 구성원과 연결된 신청서 (승인 후에도 남아 있는 지원 동기) */
  function findApp(m) {
    if (!m || !m.id) return null;
    return (m.application_id ? byId(S.apps, m.application_id) : null) ||
      S.apps.find(a => a.status === 'approved' && a.name === m.name &&
        (!m.student_id || a.student_id === m.student_id)) || null;
  }
  function memberApplyBlock(m) {
    const app = findApp(m);
    if (!app || !app.motivation) return '';
    return '<div class="divider"></div>' +
      '<div class="row between" style="margin-bottom:8px">' +
      '<b class="sm">지원 동기</b>' +
      '<span class="mut" style="font-size:12px">' + fmtDate(app.created_at) + ' 신청</span></div>' +
      '<div class="card flat sm" style="white-space:pre-wrap">' + esc(app.motivation) + '</div>';
  }

  function memberSheet(m) {
    const isNew = !m;
    m = m || {
      name: '', student_id: '', department: (S.settings && S.settings.department) || '',
      phone: '', role: 'member', status: 'active', joined_on: DB.today(), memo: '', emoji: ''
    };
    const hist = S.att.filter(a => a.member_id === m.id)
      .map(a => ({ a, ev: byId(S.events, a.event_id) })).filter(x => x.ev)
      .sort((x, y) => String(y.ev.date).localeCompare(String(x.ev.date)));

    const body =
      '<label class="field"><span class="lb">이름</span><input class="input" id="mName" value="' + esc(m.name) + '" placeholder="이름"></label>' +
      '<div class="grid2">' +
      '<label class="field"><span class="lb">학번</span><input class="input" id="mSid" inputmode="numeric" value="' + esc(m.student_id || '') + '" placeholder="25"></label>' +
      '<label class="field"><span class="lb">역할</span><select class="input" id="mRole">' +
      '<option value="member"' + (m.role !== 'admin' ? ' selected' : '') + '>일반회원</option>' +
      '<option value="admin"' + (m.role === 'admin' ? ' selected' : '') + '>운영진</option></select></label></div>' +
      '<label class="field"><span class="lb">연락처</span><input class="input" id="mPhone" inputmode="numeric" value="' + esc(m.phone || '') + '" placeholder="010-0000-0000"></label>' +
      '<div class="grid2">' +
      '<label class="field"><span class="lb">가입일</span><input class="input" type="date" id="mJoin" value="' + esc((m.joined_on || '').slice(0, 10)) + '"></label>' +
      '<label class="field"><span class="lb">프로필 이모지 (선택)</span><input class="input" id="mEmoji" maxlength="2" value="' + esc(m.emoji || '') + '" placeholder="🐶"></label></div>' +

      (isNew ? '' : memberApplyBlock(m)) +
      (isNew ? '' :
        '<div class="divider"></div><div class="row between" style="margin-bottom:8px">' +
        '<b class="sm">봉사 이력 ' + hist.length + '회</b><span class="mut sm">누적 ' + volHours(m.id) + '시간</span></div>' +
        (hist.length ? '<div class="card flat" style="padding:4px 12px">' + hist.slice(0, 8).map(h =>
          '<div class="kv"><span class="k">' + fmtDate(h.ev.date) + '</span><span class="v">' + esc(h.ev.title) + '</span></div>').join('') + '</div>'
          : '<div class="mut sm">아직 참여 기록이 없어요</div>')) +
      '<div class="divider"></div>' +
      (isNew ? '<button class="btn primary block" data-save>추가하기</button>'
        : '<div class="row" style="gap:8px"><button class="btn danger" data-del>' + ic('trash') + '</button>' +
        '<button class="btn primary grow" data-save>저장하기</button></div>');

    const ov = sheet({ title: isNew ? '구성원 추가' : m.name, body });
    ov.querySelector('#mPhone').addEventListener('input', e => e.target.value = hyphenPhone(e.target.value));
    const rc = ov.querySelector('[data-receipt]');
    if (rc) rc.onclick = async () => {
      const a = findApp(m); if (!a) return;
      rc.disabled = true;
      try { const src = await DB.getReceipt('applications', a.id); if (src) window.open(src, '_blank'); }
      catch (e) { toast('사진을 불러오지 못했어요', 'err'); }
      rc.disabled = false;
    };
    ov.querySelector('[data-save]').onclick = async () => {
      const patch = {
        name: ov.querySelector('#mName').value.trim(),
        student_id: normSid(ov.querySelector('#mSid').value),
        phone: ov.querySelector('#mPhone').value.trim(),
        role: ov.querySelector('#mRole').value,
        department: (S.settings && S.settings.department) || m.department || '',
        status: 'active',
        joined_on: ov.querySelector('#mJoin').value || null,
        emoji: ov.querySelector('#mEmoji').value.trim(),
        memo: m.memo || ''
      };
      if (!patch.name) return toast('이름을 입력해주세요', 'err');
      closeSheet();
      try {
        if (isNew) await DB.members.create(patch); else await DB.members.update(m.id, patch);
        await reload(); toast('저장했어요', 'ok');
      } catch (e) { toast(e.message || '저장하지 못했어요', 'err'); }
    };
    const del = ov.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      closeSheet();
      if (!await confirmSheet(m.name + '님을 명단에서 지울까요?', '봉사 참여 기록도 함께 사라져요.', '삭제', true)) return;
      await DB.members.remove(m.id); await reload(); toast('삭제했어요');
    };
  }

  /* ============================================================
     4. 봉사 참여 (달력)
     ============================================================ */
  function renderVol() {
    if (!F.month) F.month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    if (!F.day) F.day = dkey(new Date());
    const y = F.month.getFullYear(), mo = F.month.getMonth();
    const first = new Date(y, mo, 1), startDay = first.getDay();
    const dim = new Date(y, mo + 1, 0).getDate();
    const rows = Math.ceil((startDay + dim) / 7);
    const todayKey = dkey(new Date());

    let cells = '';
    for (let i = 0; i < rows * 7; i++) {
      const dnum = i - startDay + 1;
      const inMonth = dnum >= 1 && dnum <= dim;
      const dt = new Date(y, mo, dnum);
      const key = dkey(dt);
      const has = S.events.some(e => e.date === key);
      cells += '<button type="button" class="day' + (inMonth ? '' : ' dim') + (dt.getDay() === 0 ? ' sun' : '') +
        (key === todayKey ? ' today' : '') + (key === F.day ? ' on' : '') + '" data-d="' + key + '">' +
        dt.getDate() + (has ? '<span class="mk"></span>' : '') + '</button>';
    }

    const dayEvents = S.events.filter(e => e.date === F.day)
      .sort((a, b) => String(a.start_time || '').localeCompare(String(b.start_time || '')));

    $('#calendar').innerHTML =
      '<div class="cal"><div class="cal-hd">' +
      '<button class="iconbtn" data-mo="-1" aria-label="이전 달" style="transform:rotate(180deg)">' + ic('chevron') + '</button>' +
      '<div class="mo">' + y + '년 ' + (mo + 1) + '월</div>' +
      '<button class="iconbtn" data-mo="1" aria-label="다음 달">' + ic('chevron') + '</button></div>' +
      '<div class="wk"><span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div>' +
      '<div class="days">' + cells + '</div>' +
      '<div class="daypanel"><div class="dt">' + ic('calendar') +
      '<span>' + fmtDate(F.day) + ' (' + weekday(F.day) + ')</span></div>' +
      (dayEvents.length ? dayEvents.map(ev => {
        const joined = S.att.filter(a => a.event_id === ev.id);
        return '<div class="evrow" data-ev="' + ev.id + '"><span class="ic green" style="width:38px;height:38px;border-radius:13px;display:grid;place-items:center">' + ic('paw') + '</span>' +
          '<div class="grow"><div class="tt">' + esc(ev.title) + '</div><div class="mt">' +
          (ev.place ? '<span>' + esc(ev.place) + '</span>' : '') +
          '<span>참여 ' + joined.length + '명</span></div></div>' +
          '<div class="faces">' + joined.slice(0, 4).map(a => { const m = byId(S.members, a.member_id); return m ? avatar(m) : ''; }).join('') + '</div>' +
          '</div>';
      }).join('') : '<div class="mut sm" style="padding:6px 2px 12px">이 날에는 봉사모임이 없어요.</div>') +
      '<button class="btn soft block" id="newEv">' + ic('plus') + '<span>이 날 봉사모임 만들기</span></button>' +
      '</div></div>';

    $$('#calendar [data-d]').forEach(b => b.addEventListener('click', () => {
      F.day = b.dataset.d;
      const d = new Date(F.day + 'T00:00:00');
      if (d.getMonth() !== F.month.getMonth()) F.month = new Date(d.getFullYear(), d.getMonth(), 1);
      renderVol();
    }));
    $$('#calendar [data-mo]').forEach(b => b.addEventListener('click', () => {
      F.month = new Date(F.month.getFullYear(), F.month.getMonth() + Number(b.dataset.mo), 1);
      renderVol();
    }));
    $$('#calendar [data-ev]').forEach(el => el.addEventListener('click', () => eventSheet(byId(S.events, el.dataset.ev))));
    $('#newEv').addEventListener('click', () => eventSheet(null));

    // 랭킹
    const rank = S.members.map(m => ({ m, n: volCount(m.id), h: volHours(m.id) }))
      .filter(r => r.n > 0).sort((a, b) => b.n - a.n || b.h - a.h).slice(0, 10);
    $('#volRank').innerHTML =
      '<div class="section-title">' + ic('crown') + '<span>누적 참여 순위</span>' +
      '<span class="more" id="exportVol">내보내기</span></div>' +
      (rank.length ? '<div class="list">' + rank.map((r, i) =>
        '<div class="item" data-m3="' + r.m.id + '"><span class="rank' + (i < 3 ? ' g' + (i + 1) : '') + '">' + (i + 1) + '</span>' +
        avatar(r.m, 'sm') + '<div class="grow"><div class="nm">' + esc(r.m.name) + '</div>' +
        '<div class="sub"><span>' + esc(r.m.department || '') + '</span></div></div>' +
        '<div style="text-align:right"><div class="money" style="color:var(--brand-deep)">' + r.n + '회</div>' +
        '<div class="mut sm">' + r.h + '시간</div></div></div>').join('') + '</div>'
        : empty('paw', '아직 봉사 참여 기록이 없어요'));
    $$('#volRank [data-m3]').forEach(el => el.addEventListener('click', () => memberSheet(byId(S.members, el.dataset.m3))));
    const ex = $('#exportVol');
    if (ex) ex.onclick = () => {
      const rows = [];
      S.events.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(ev => {
        S.att.filter(a => a.event_id === ev.id).forEach(a => {
          const m = byId(S.members, a.member_id);
          rows.push([ev.date, ev.title, ev.place || '', m ? m.name : '(삭제된 구성원)', a.hours]);
        });
      });
      downloadCSV('발자국_봉사기록_' + dkey(new Date()) + '.csv', ['날짜', '봉사명', '장소', '이름', '시간'], rows);
      toast('봉사 기록을 내려받았어요', 'ok');
    };
  }

  const volPlace = () => (S.settings && S.settings.place) || '천보금 보호소';
  function autoTitle(date, skipId) {
    const d = new Date(date + 'T00:00:00');
    const base = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 봉사';
    const same = S.events.filter(e => e.date === date && e.id !== skipId).length;
    return same ? base + ' ' + (same + 1) : base;
  }

  function eventSheet(ev) {
    const isNew = !ev;
    ev = ev || { date: F.day, title: '', place: '', start_time: '', note: '' };
    const joined = isNew ? [] : S.att.filter(a => a.event_id === ev.id);
    const picked = new Map(joined.map(a => [a.member_id, Number(a.hours) || 0]));

    const body =
      '<label class="field"><span class="lb">봉사 날짜</span>' +
      '<input class="input" type="date" id="eDate" value="' + esc(ev.date) + '">' +
      '<span class="hint">장소는 ' + esc(volPlace()) + ' 로 저장돼요.</span></label>' +
      '<div class="divider"></div>' +
      '<div class="row between" style="margin-bottom:8px"><b class="sm">참여한 구성원 <span id="pickCount">' + picked.size + '</span>명</b>' +
      '<button class="btn ghost sm" id="pickAll">전체 선택</button></div>' +
      '<div class="search" style="margin-bottom:8px">' + ic('search') + '<input id="pickSearch" placeholder="이름으로 찾기"></div>' +
      '<div class="picker" id="picker"></div>' +
      '<div class="divider"></div>' +
      (isNew ? '<button class="btn primary block" data-save>봉사모임 만들기</button>'
        : '<div class="row" style="gap:8px"><button class="btn danger" data-del>' + ic('trash') + '</button>' +
        '<button class="btn primary grow" data-save>저장하기</button></div>');

    const ov = sheet({ title: isNew ? fmtDate(F.day) + ' 봉사모임' : '봉사모임 수정', body, noFocus: true });

    function drawPicker() {
      const q = ov.querySelector('#pickSearch').value.trim();
      const list = S.members.filter(m => !q || (m.name + (m.department || '')).includes(q));
      ov.querySelector('#picker').innerHTML = list.length ? list.map(m => {
        const on = picked.has(m.id);
        return '<div class="check' + (on ? ' on' : '') + '" data-p="' + m.id + '"><span class="box">' + (on ? ic('check') : '') + '</span>' +
          avatar(m, 'sm') + '<div class="grow"><b class="sm">' + esc(m.name) + '</b>' +
          '<div class="mut" style="font-size:11.5px">' + esc(m.department || '') + ' · 누적 ' + volCount(m.id) + '회</div></div>' +
          '<span class="hr"><input type="number" min="0" max="24" step="0.5" value="' + (on && picked.get(m.id) ? picked.get(m.id) : '') +
          '" placeholder="시간" data-h="' + m.id + '" aria-label="' + esc(m.name) + ' 봉사 시간"></span></div>';
      }).join('') : '<div class="mut sm center" style="padding:14px">찾는 구성원이 없어요</div>';

      ov.querySelectorAll('[data-p]').forEach(el => el.addEventListener('click', e => {
        if (e.target.tagName === 'INPUT') return;
        const id = el.dataset.p;
        if (picked.has(id)) picked.delete(id); else picked.set(id, Number(ov.querySelector('[data-h="' + id + '"]').value) || 0);
        ov.querySelector('#pickCount').textContent = picked.size;
        drawPicker();
      }));
      ov.querySelectorAll('[data-h]').forEach(inp => inp.addEventListener('input', () => {
        const id = inp.dataset.h;
        if (!picked.has(id)) {
          picked.set(id, 0);
          ov.querySelector('#pickCount').textContent = picked.size;
          const row = ov.querySelector('[data-p="' + id + '"]');
          row.classList.add('on'); row.querySelector('.box').innerHTML = ic('check');
        }
        picked.set(id, Number(inp.value) || 0);
      }));
    }
    drawPicker();
    ov.querySelector('#pickSearch').addEventListener('input', drawPicker);
    ov.querySelector('#pickAll').addEventListener('click', () => {
      const allOn = picked.size === S.members.length;
      picked.clear();
      if (!allOn) S.members.forEach(m => picked.set(m.id, 0));
      ov.querySelector('#pickCount').textContent = picked.size;
      ov.querySelector('#pickAll').textContent = allOn ? '전체 선택' : '전체 해제';
      drawPicker();
    });

    ov.querySelector('[data-save]').onclick = async () => {
      const date = ov.querySelector('#eDate').value || F.day;
      const patch = {
        title: autoTitle(date, isNew ? null : ev.id),
        date: date, start_time: null, place: volPlace(), note: ''
      };
      closeSheet();
      try {
        let id = ev.id;
        if (isNew) { const row = await DB.events.create(patch); id = row.id; }
        else await DB.events.update(id, patch);
        await DB.saveAttendance(id, Array.from(picked, ([member_id, hours]) => ({ member_id, hours })));
        F.day = patch.date;
        await reload();
        toast(isNew ? '봉사모임을 만들었어요' : '저장했어요', 'ok');
      } catch (e) { toast(e.message || '저장하지 못했어요', 'err'); }
    };
    const del = ov.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      closeSheet();
      if (!await confirmSheet('이 봉사모임을 지울까요?', '참여 기록도 함께 사라져요.', '삭제', true)) return;
      await DB.events.remove(ev.id); await reload(); toast('삭제했어요');
    };
  }

  /* ============================================================
     5. 재정
     ============================================================ */
  function renderFin() {
    const income = S.fin.filter(f => f.kind === 'income').reduce((s, f) => s + Number(f.amount || 0), 0);
    const expense = S.fin.filter(f => f.kind === 'expense').reduce((s, f) => s + Number(f.amount || 0), 0);

    $('#finTop').innerHTML =
      '<div class="card" style="background:linear-gradient(168deg,var(--brand-soft),var(--surface))">' +
      '<div class="sub">현재 잔액</div>' +
      '<div class="money" style="font-size:32px;color:var(--brand-deep);margin:2px 0 12px">' + num(balance()) + '원</div>' +
      '<div class="mini"><div class="b"><div class="k">총 수입</div><div class="v" style="color:var(--brand-deep)">+' + num(income) + '</div></div>' +
      '<div class="b"><div class="k">총 지출</div><div class="v" style="color:var(--pink)">-' + num(expense) + '</div></div></div></div>';

    const segs = [['all', '전체'], ['income', '수입'], ['expense', '지출']];
    $('#finSeg').innerHTML = segs.map(([k, l]) => '<button type="button" class="' + (F.fin === k ? 'on' : '') + '" data-f="' + k + '">' + l + '</button>').join('');
    $$('#finSeg [data-f]').forEach(b => b.addEventListener('click', () => { F.fin = b.dataset.f; renderFin(); }));

    const months = Array.from(new Set(S.fin.map(f => String(f.date).slice(0, 7)))).sort().reverse();
    $('#finMonth').innerHTML = '<option value="all">전체 기간</option>' +
      months.map(m => '<option value="' + m + '"' + (F.finMonth === m ? ' selected' : '') + '>' + m.replace('-', '년 ') + '월</option>').join('');
    $('#finMonth').onchange = e => { F.finMonth = e.target.value; renderFin(); };

    let list = S.fin.slice();
    if (F.fin !== 'all') list = list.filter(f => f.kind === F.fin);
    if (F.finMonth !== 'all') list = list.filter(f => String(f.date).slice(0, 7) === F.finMonth);
    list.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const sum = list.reduce((s, f) => s + (f.kind === 'income' ? 1 : -1) * Number(f.amount || 0), 0);
    $('#finList').innerHTML = list.length ?
      '<div class="mut sm" style="margin:2px 4px 8px">' + list.length + '건 · 합계 ' + (sum >= 0 ? '+' : '') + num(sum) + '원</div>' +
      '<div class="list">' + list.map(f => {
        return '<div class="item" data-f2="' + f.id + '"><span class="ic ' + (f.kind === 'income' ? 'green' : 'pink') +
          '" style="width:42px;height:42px;border-radius:15px;display:grid;place-items:center">' +
          ic(f.kind === 'income' ? 'plus' : 'minus') + '</span>' +
          '<div class="grow"><div class="nm">' + esc(f.category || (f.kind === 'income' ? '수입' : '지출')) + '</div>' +
          '<div class="sub"><span>' + fmtDate(f.date) + '</span>' +
          (f.has_receipt ? '<span>증빙 있음</span>' : '') + '</div></div>' +
          '<div class="money" style="color:' + (f.kind === 'income' ? 'var(--brand-deep)' : 'var(--pink)') + '">' +
          (f.kind === 'income' ? '+' : '-') + num(f.amount) + '</div></div>';
      }).join('') + '</div>'
      : empty('wallet', '해당하는 내역이 없어요');

    $$('#finList [data-f2]').forEach(el => el.addEventListener('click', () => finSheet(byId(S.fin, el.dataset.f2))));
    $('#addFin').onclick = () => finSheet(null);
    $('#exportFin').onclick = () => {
      const rows = S.fin.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)));
      let run = 0;
      const body = rows.map(f => {
        const amount = Number(f.amount) || 0;
        run += (f.kind === 'income' ? 1 : -1) * amount;
        return [f.date, f.kind === 'income' ? '수입' : '지출', f.category,
          f.kind === 'income' ? amount : '', f.kind === 'expense' ? amount : '',
          run, f.receipt ? 'O' : ''];
      });
      body.push(['합계', '', '',
        rows.filter(f => f.kind === 'income').reduce((a, f) => a + Number(f.amount || 0), 0),
        rows.filter(f => f.kind === 'expense').reduce((a, f) => a + Number(f.amount || 0), 0),
        balance(), '']);
      downloadCSV('발자국_재정_' + dkey(new Date()) + '.csv',
        ['날짜', '구분', '내용', '수입', '지출', '잔액', '증빙'], body);
      toast('엑셀 파일을 내려받았어요', 'ok');
    };
  }

  function finSheet(f) {
    const isNew = !f;
    f = f || { date: dkey(new Date()), kind: 'expense', category: '', amount: '', memo: '', member_id: null };
    const body =
      '<div class="seg" style="margin-bottom:14px" id="kSeg">' +
      '<button type="button" data-k="income" class="' + (f.kind === 'income' ? 'on' : '') + '">수입</button>' +
      '<button type="button" data-k="expense" class="' + (f.kind === 'expense' ? 'on' : '') + '">지출</button></div>' +
      '<label class="field"><span class="lb">금액</span>' +
      '<input class="input" id="fAmt" inputmode="numeric" value="' + (f.amount ? num(f.amount) : '') + '" placeholder="0" style="font-family:var(--font-title);font-size:20px"></label>' +
      '<label class="field"><span class="lb">내용</span>' +
      '<input class="input" id="fCat" value="' + esc(f.category || '') + '" placeholder="예: 사료·배변패드 구입"></label>' +
      '<div class="tagrow" id="catTags" style="margin:-8px 0 14px"></div>' +
      '<label class="field"><span class="lb">날짜</span>' +
      '<input class="input" type="date" id="fDate" value="' + esc(String(f.date).slice(0, 10)) + '"></label>' +
      '<div class="field"><span class="lb">증빙 사진 <span class="mut" style="font-weight:400">(선택)</span></span>' +
      '<div class="dropzone" id="fDrop" tabindex="0" role="button" aria-label="증빙 사진 첨부">' +
      '<div id="fIdle"' + (f.has_receipt ? ' hidden' : '') + '><div class="big">' + ic('image') + '</div>' +
      '<div class="sm mut" style="margin-top:4px">영수증·이체 캡처를 올려두면 나중에 확인하기 좋아요</div></div>' +
      '<div id="fDone"' + (f.has_receipt ? '' : ' hidden') + '>' +
      '<img id="fPrev" alt="증빙 사진">' +
      '<div class="sm mut" style="margin-top:6px">다시 탭하면 바꿀 수 있어요</div></div></div>' +
      '<input type="file" id="fFile" accept="image/*" hidden>' +
      '<button type="button" class="btn ghost sm block" id="fClear" style="margin-top:8px"' +
      (f.has_receipt ? '' : ' hidden') + '>사진 지우기</button></div>' +
      '<div class="divider"></div>' +
      (isNew ? '<button class="btn primary block" data-save>추가하기</button>'
        : '<div class="row" style="gap:8px"><button class="btn danger" data-del>' + ic('trash') + '</button>' +
        '<button class="btn primary grow" data-save>저장하기</button></div>');

    const ov = sheet({ title: isNew ? '내역 추가' : '내역 수정', body, noFocus: true });
    let kind = f.kind;
    const quick = { income: '동아리비', expense: '봉사물품' };
    const tags = () => {
      ov.querySelector('#catTags').innerHTML =
        '<button type="button" class="chip" data-cat="' + quick[kind] + '">' + quick[kind] + '</button>';
      ov.querySelectorAll('[data-cat]').forEach(b => b.addEventListener('click', () => ov.querySelector('#fCat').value = b.dataset.cat));
    };
    tags();
    ov.querySelectorAll('#kSeg [data-k]').forEach(b => b.addEventListener('click', () => {
      kind = b.dataset.k;
      ov.querySelectorAll('#kSeg button').forEach(x => x.classList.toggle('on', x.dataset.k === kind));
      tags();
    }));
    let receipt = '';
    let receiptLoaded = !f.has_receipt;
    if (f.has_receipt) {
      DB.getReceipt('finance', f.id).then(src => {
        receipt = src || ''; receiptLoaded = true;
        const img = ov.querySelector('#fPrev'); if (img) img.src = receipt;
      }).catch(() => { receiptLoaded = true; });
    }
    const drop = ov.querySelector('#fDrop'), file = ov.querySelector('#fFile'), clr = ov.querySelector('#fClear');
    drop.addEventListener('click', () => file.click());
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    file.addEventListener('change', async () => {
      const x = file.files[0]; if (!x) return;
      try {
        receipt = await UI.resizeImage(x, 1280, .72);
        ov.querySelector('#fPrev').src = receipt;
        ov.querySelector('#fIdle').hidden = true; ov.querySelector('#fDone').hidden = false; clr.hidden = false;
      } catch (e) { toast(e.message || '사진을 처리하지 못했어요', 'err'); }
    });
    clr.addEventListener('click', e => {
      e.stopPropagation(); receipt = ''; file.value = '';
      ov.querySelector('#fIdle').hidden = false; ov.querySelector('#fDone').hidden = true; clr.hidden = true;
    });

    const amt = ov.querySelector('#fAmt');
    amt.addEventListener('input', () => {
      const n = amt.value.replace(/[^\d]/g, '');
      amt.value = n ? Number(n).toLocaleString('ko-KR') : '';
    });
    setTimeout(() => amt.focus(), 80);

    ov.querySelector('[data-save]').onclick = async () => {
      const patch = {
        kind, amount: Number(String(amt.value).replace(/[^\d]/g, '')) || 0,
        category: ov.querySelector('#fCat').value.trim() || (kind === 'income' ? '수입' : '지출'),
        date: ov.querySelector('#fDate').value || dkey(new Date()),
        memo: '', member_id: null
      };
      if (receiptLoaded) patch.receipt = receipt || null;
      if (!patch.amount) return toast('금액을 입력해주세요', 'err');
      closeSheet();
      try {
        if (isNew) await DB.finance.create(patch); else await DB.finance.update(f.id, patch);
        await reload(); toast('저장했어요', 'ok');
      } catch (e) { toast(e.message || '저장하지 못했어요', 'err'); }
    };
    const del = ov.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      closeSheet();
      if (!await confirmSheet('이 내역을 지울까요?', '', '삭제', true)) return;
      await DB.finance.remove(f.id); await reload(); toast('삭제했어요');
    };
  }

  /* ============================================================
     6. 후원 (기능 설계 중)
     ============================================================ */
  const raised = (cid) => S.dons.filter(d => d.campaign_id === cid).reduce((a, d) => a + (Number(d.amount) || 0), 0);
  const donorCount = (cid) => S.dons.filter(d => d.campaign_id === cid).length;
  const donorLabel = (d) => {
    if (d.member_id) { const m = byId(S.members, d.member_id); return m ? m.name : '(삭제된 구성원)'; }
    return d.donor_name || '익명';
  };
  function dday(c) {
    if (c.status === 'closed') return { txt: '종료됨', cls: 'rest' };
    if (!c.ends_on) return { txt: '진행 중', cls: 'on' };
    const end = new Date(c.ends_on + 'T23:59:59');
    const left = Math.ceil((end - Date.now()) / 86400000);
    if (left < 0) return { txt: '기간 지남', cls: 'off' };
    if (left === 0) return { txt: '오늘 마감', cls: 'pending' };
    return { txt: 'D-' + left, cls: 'on' };
  }

  function renderDonate() {
    const open = S.camps.filter(c => c.status !== 'closed');
    const closed = S.camps.filter(c => c.status === 'closed');

    $('#donatePanel').innerHTML =
      (S.camps.length ? '' : emptyDonate()) +
      open.map(campCard).join('') +
      (closed.length ? '<div class="section-title">' + ic('clock') + '<span>지난 후원</span></div>' +
        closed.map(campCard).join('') : '') +
      '<button class="btn soft block" id="newCamp" style="margin-top:6px">' + ic('plus') + '<span>후원 만들기</span></button>';

    $('#newCamp').onclick = () => campSheet(null);
    $$('#donatePanel [data-camp]').forEach(el => el.addEventListener('click', e => {
      if (e.target.closest('[data-add]') || e.target.closest('[data-detail]')) return;
      detailSheet(byId(S.camps, el.dataset.camp));
    }));
    $$('#donatePanel [data-add]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation(); donSheet(el.dataset.add, null);
    }));
    $$('#donatePanel [data-detail]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation(); detailSheet(byId(S.camps, el.dataset.detail));
    }));
  }

  const emptyDonate = () =>
    '<div class="card empty" style="padding:30px 20px">' +
    '<div style="display:flex;justify-content:center">' +
    '<span style="width:54px;height:54px;border-radius:19px;background:var(--pink-soft);color:var(--pink);display:grid;place-items:center">' +
    ic('heart') + '</span></div>' +
    '<div style="margin-top:12px;font-family:var(--font-title);font-size:17px;color:var(--ink)">아직 진행 중인 후원이 없어요</div>' +
    '<div class="sm" style="margin-top:6px">브랜드 협업 후원을 만들고 입금 내역을 모아보세요</div></div>';

  function campCard(c) {
    const got = raised(c.id), goal = Number(c.goal) || 0;
    const pct = goal ? Math.min(100, Math.round(got / goal * 100)) : 0;
    const dd = dday(c);
    const done = goal && got >= goal;
    return '<div class="card" data-camp="' + c.id + '" style="cursor:pointer">' +
      '<div class="row between" style="align-items:flex-start;gap:10px">' +
      '<div class="grow"><div class="row" style="gap:6px;margin-bottom:5px">' +
      (c.partner ? '<span class="badge member">' + esc(c.partner) + '</span>' : '') +
      '<span class="badge ' + dd.cls + '">' + dd.txt + '</span></div>' +
      '<h3>' + esc(c.title) + '</h3>' +
      (c.starts_on || c.ends_on ? '<div class="sub">' + fmtDate(c.starts_on) + ' ~ ' + fmtDate(c.ends_on) + '</div>' : '') +
      '</div><span class="arrow">' + ic('chevron') + '</span></div>' +
      '<div class="sp"></div>' +
      '<div class="row between" style="align-items:baseline">' +
      '<div class="money" style="font-size:24px;color:var(--brand-deep)">' + num(got) + '원</div>' +
      (goal ? '<div class="mut sm">목표 ' + num(goal) + '원</div>' : '') + '</div>' +
      (goal ? '<div class="bar" style="margin:9px 0 7px"><i style="width:' + pct + '%' +
        (done ? ';background:var(--gold)' : '') + '"></i></div>' +
        '<div class="row between sm"><span style="color:' + (done ? 'var(--gold)' : 'var(--brand-deep)') + ';font-weight:700">' +
        (done ? '목표 달성! (+' + num(got - goal) + '원)' : pct + '% 달성') + '</span>' +
        '<span class="mut">' + donorCount(c.id) + '명 참여</span></div>' +
        (done ? '' : '<div class="sm mut" style="margin-top:4px">목표까지 <b style="color:var(--ink)">' +
          num(goal - got) + '원</b> 남았어요</div>')
        : '<div class="mut sm">' + donorCount(c.id) + '명 참여</div>') +
      '<div class="sp"></div>' +
      '<div class="row" style="gap:8px">' +
      '<button class="btn soft grow sm" data-add="' + c.id + '" type="button">' + ic('plus') + '<span>입금 내역 추가</span></button>' +
      '<button class="btn ghost grow sm" data-detail="' + c.id + '" type="button">' + ic('clipboard') + '<span>세부내역</span></button>' +
      '</div></div>';
  }

  /* 세부내역 — 입금 히스토리 */
  function detailSheet(c) {
    if (!c) return;
    const list = S.dons.filter(d => d.campaign_id === c.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created_at).localeCompare(String(a.created_at)));
    const dd = dday(c);

    const body =
      '<div class="row" style="gap:6px;margin:-6px 0 12px">' +
      (c.partner ? '<span class="badge member">' + esc(c.partner) + '</span>' : '') +
      '<span class="badge ' + dd.cls + '">' + dd.txt + '</span>' +
      (c.starts_on || c.ends_on ? '<span class="mut sm">' + fmtDate(c.starts_on) + ' ~ ' + fmtDate(c.ends_on) + '</span>' : '') +
      '</div>' +
      (c.note ? '<div class="pill-note" style="margin-bottom:12px">' + esc(c.note) + '</div>' : '') +
      donationList(c, list) +
      '<div class="divider"></div>' +
      '<button class="btn ghost block" data-edit>' + ic('settings') + '<span>후원 정보 수정</span></button>';

    const ov = sheet({ title: c.title, body, noFocus: true });
    ov.querySelector('[data-addd]').onclick = () => { closeSheet(); donSheet(c.id, null); };
    ov.querySelectorAll('[data-don]').forEach(el => el.addEventListener('click', () => {
      closeSheet(); donSheet(c.id, byId(S.dons, el.dataset.don));
    }));
    const ex = ov.querySelector('[data-export]');
    if (ex) ex.onclick = () => {
      downloadCSV('발자국_후원_' + dkey(new Date()) + '.csv',
        ['날짜', '후원자', '구분', '금액'],
        list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map(d => [d.date, donorLabel(d), d.member_id ? '구성원' : '외부', d.amount])
          .concat([['합계', '', '', raised(c.id)]]));
      toast('엑셀 파일을 내려받았어요', 'ok');
    };
    ov.querySelector('[data-edit]').onclick = () => { closeSheet(); campSheet(c); };
  }

  /* 후원 만들기 / 정보 수정 */
  function campSheet(c, detail) {
    const isNew = !c;
    c = c || { title: '', partner: '', goal: '', starts_on: DB.today(), ends_on: '', note: '', status: 'open' };
    const list = isNew ? [] : S.dons.filter(d => d.campaign_id === c.id)
      .sort((a, b) => String(b.date).localeCompare(String(a.date)));

    const form =
      '<label class="field"><span class="lb">후원 이름</span>' +
      '<input class="input" id="cTitle" value="' + esc(c.title) + '" placeholder="펫발란스 X 발자국 사료 후원"></label>' +
      '<div class="grid2">' +
      '<label class="field"><span class="lb">협업 브랜드 (선택)</span>' +
      '<input class="input" id="cPartner" value="' + esc(c.partner || '') + '" placeholder="펫발란스"></label>' +
      '<label class="field"><span class="lb">목표 금액</span>' +
      '<input class="input" id="cGoal" inputmode="numeric" value="' + (c.goal ? num(c.goal) : '') + '" placeholder="1,000,000"></label></div>' +
      '<div class="grid2">' +
      '<label class="field"><span class="lb">시작일</span>' +
      '<input class="input" type="date" id="cStart" value="' + esc(c.starts_on || '') + '"></label>' +
      '<label class="field"><span class="lb">종료일</span>' +
      '<input class="input" type="date" id="cEnd" value="' + esc(c.ends_on || '') + '"></label></div>' +
      '<label class="field"><span class="lb">설명 (선택)</span>' +
      '<textarea class="input" id="cNote" style="min-height:70px" placeholder="모인 금액을 어디에 쓰는지 적어두면 좋아요">' + esc(c.note || '') + '</textarea></label>';

    const body = (detail ? donationList(c, list) + '<div class="divider"></div>' : '') + form +
      '<div class="divider"></div>' +
      (isNew ? '<button class="btn primary block" data-save>후원 만들기</button>'
        : '<div class="row" style="gap:8px"><button class="btn danger" data-del>' + ic('trash') + '</button>' +
        '<button class="btn ghost grow" data-toggle>' + (c.status === 'closed' ? '다시 열기' : '후원 종료') + '</button>' +
        '<button class="btn primary grow" data-save>저장</button></div>');

    const ov = sheet({ title: isNew ? '후원 만들기' : c.title, body, noFocus: !isNew });
    const goal = ov.querySelector('#cGoal');
    goal.addEventListener('input', () => {
      const n = goal.value.replace(/[^0-9]/g, '');
      goal.value = n ? Number(n).toLocaleString('ko-KR') : '';
    });
    const addBtn = ov.querySelector('[data-addd]');
    if (addBtn) addBtn.onclick = () => { closeSheet(); donSheet(c.id, null); };
    ov.querySelectorAll('[data-don]').forEach(el => el.addEventListener('click', () => {
      closeSheet(); donSheet(c.id, byId(S.dons, el.dataset.don));
    }));
    const ex = ov.querySelector('[data-export]');
    if (ex) ex.onclick = () => {
      downloadCSV('발자국_후원_' + dkey(new Date()) + '.csv',
        ['날짜', '후원자', '구분', '금액'],
        list.slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map(d => [d.date, donorLabel(d), d.member_id ? '구성원' : '외부', d.amount])
          .concat([['합계', '', '', raised(c.id)]]));
      toast('엑셀 파일을 내려받았어요', 'ok');
    };

    ov.querySelector('[data-save]').onclick = async () => {
      const patch = {
        title: ov.querySelector('#cTitle').value.trim() || '후원',
        partner: ov.querySelector('#cPartner').value.trim(),
        goal: Number(String(ov.querySelector('#cGoal').value).replace(/[^0-9]/g, '')) || null,
        starts_on: ov.querySelector('#cStart').value || null,
        ends_on: ov.querySelector('#cEnd').value || null,
        note: ov.querySelector('#cNote').value.trim()
      };
      closeSheet();
      try {
        if (isNew) await DB.campaigns.create(Object.assign({ status: 'open' }, patch));
        else await DB.campaigns.update(c.id, patch);
        await reload(); toast('저장했어요', 'ok');
      } catch (e) { toast(e.message || '저장하지 못했어요', 'err'); }
    };
    const tg = ov.querySelector('[data-toggle]');
    if (tg) tg.onclick = async () => {
      closeSheet();
      await DB.campaigns.update(c.id, { status: c.status === 'closed' ? 'open' : 'closed' });
      await reload(); toast(c.status === 'closed' ? '다시 열었어요' : '후원을 종료했어요');
    };
    const del = ov.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      closeSheet();
      if (!await confirmSheet('이 후원을 지울까요?', '입금 내역 ' + list.length + '건도 함께 사라져요.', '삭제', true)) return;
      await DB.campaigns.remove(c.id); await reload(); toast('삭제했어요');
    };
  }

  function donationList(c, list) {
    const got = raised(c.id), goal = Number(c.goal) || 0;
    const pct = goal ? Math.min(100, Math.round(got / goal * 100)) : 0;
    return '<div class="card flat" style="margin-bottom:14px">' +
      '<div class="row between" style="align-items:baseline">' +
      '<div class="money" style="font-size:23px;color:var(--brand-deep)">' + num(got) + '원</div>' +
      (goal ? '<div class="mut sm">목표 ' + num(goal) + '원</div>' : '') + '</div>' +
      (goal ? '<div class="bar" style="margin:8px 0 7px"><i style="width:' + pct + '%"></i></div>' +
        '<div class="row between sm"><b style="color:' + (got >= goal ? 'var(--gold)' : 'var(--brand-deep)') + '">' +
        pct + '% 달성</b><span class="mut">' +
        (got >= goal ? '목표보다 ' + num(got - goal) + '원 더!' : '목표까지 ' + num(goal - got) + '원') +
        '</span></div>' : '') +
      '</div>' +
      '<div class="row between" style="margin-bottom:8px">' +
      '<b class="sm">입금 내역 ' + list.length + '건</b>' +
      (list.length ? '<span class="sm" data-export style="cursor:pointer;color:var(--brand-deep);font-weight:700">엑셀 저장</span>' : '') +
      '</div>' +
      (list.length ? '<div class="list" style="box-shadow:none;border:1px solid var(--line-2)">' + list.map(d => {
        const m = d.member_id ? byId(S.members, d.member_id) : null;
        return '<div class="item" data-don="' + d.id + '">' + avatar(m || { name: donorLabel(d) }, 'sm') +
          '<div class="grow"><div class="nm">' + esc(donorLabel(d)) +
          (m ? '' : '<span class="badge">외부</span>') + '</div>' +
          '<div class="sub"><span>' + fmtDate(d.date) + '</span></div></div>' +
          '<div class="money" style="color:var(--brand-deep)">' + num(d.amount) + '</div></div>';
      }).join('') + '</div>' : '<div class="mut sm" style="padding:4px 2px 10px">아직 입금 내역이 없어요</div>') +
      '<button class="btn soft block sm" data-addd style="margin-top:10px">' + ic('plus') + '<span>입금 내역 추가</span></button>';
  }

  /* 입금 내역 추가 / 수정 */
  function donSheet(campaignId, d) {
    const isNew = !d;
    d = d || { member_id: null, donor_name: '', amount: '', date: dkey(new Date()) };
    let kind = isNew ? 'member' : (d.member_id ? 'member' : 'outside');
    let picked = d.member_id || null;

    const body =
      '<div class="seg" style="margin-bottom:14px" id="dSeg">' +
      '<button type="button" data-k="member" class="' + (kind === 'member' ? 'on' : '') + '">구성원</button>' +
      '<button type="button" data-k="outside" class="' + (kind === 'outside' ? 'on' : '') + '">외부 후원자</button></div>' +
      '<div id="dWho"></div>' +
      '<label class="field"><span class="lb">금액</span>' +
      '<input class="input" id="dAmt" inputmode="numeric" value="' + (d.amount ? num(d.amount) : '') + '" placeholder="0" style="font-family:var(--font-title);font-size:20px"></label>' +
      '<label class="field"><span class="lb">입금일</span>' +
      '<input class="input" type="date" id="dDate" value="' + esc(String(d.date).slice(0, 10)) + '"></label>' +
      '<div class="divider"></div>' +
      (isNew ? '<button class="btn primary block" data-save>추가하기</button>'
        : '<div class="row" style="gap:8px"><button class="btn danger" data-del>' + ic('trash') + '</button>' +
        '<button class="btn primary grow" data-save>저장</button></div>');

    const ov = sheet({ title: isNew ? '입금 내역 추가' : '입금 내역', body, noFocus: true });

    function drawPick() {
      const q = (ov.querySelector('#dSearch').value || '').trim();
      const list = S.members.filter(m => !q || m.name.includes(q));
      ov.querySelector('#dPick').innerHTML = list.length ? list.map(m =>
        '<div class="check' + (picked === m.id ? ' on' : '') + '" data-m="' + m.id + '">' +
        '<span class="box">' + (picked === m.id ? ic('check') : '') + '</span>' + avatar(m, 'sm') +
        '<div class="grow"><b class="sm">' + esc(m.name) + '</b>' +
        '<div class="mut" style="font-size:11.5px">' + esc(m.student_id || '') + '학번</div></div></div>'
      ).join('') : '<div class="mut sm center" style="padding:12px">구성원이 없어요</div>';
      ov.querySelectorAll('#dPick [data-m]').forEach(el => el.addEventListener('click', () => {
        picked = el.dataset.m === picked ? null : el.dataset.m; drawPick();
      }));
    }
    function drawWho() {
      const box = ov.querySelector('#dWho');
      if (kind === 'outside') {
        box.innerHTML = '<label class="field"><span class="lb">후원자 이름</span>' +
          '<input class="input" id="dName" value="' + esc(d.donor_name || '') + '" placeholder="예: 김보호 (졸업생)"></label>';
      } else {
        box.innerHTML = '<div class="field"><span class="lb">후원한 구성원</span>' +
          '<div class="search" style="margin-bottom:8px">' + ic('search') +
          '<input id="dSearch" placeholder="이름으로 찾기"></div>' +
          '<div class="picker" id="dPick"></div></div>';
        drawPick();
        ov.querySelector('#dSearch').addEventListener('input', drawPick);
      }
    }
    drawWho();
    ov.querySelectorAll('#dSeg [data-k]').forEach(b => b.addEventListener('click', () => {
      kind = b.dataset.k;
      ov.querySelectorAll('#dSeg button').forEach(x => x.classList.toggle('on', x.dataset.k === kind));
      drawWho();
    }));
    const amt = ov.querySelector('#dAmt');
    amt.addEventListener('input', () => {
      const n = amt.value.replace(/[^0-9]/g, '');
      amt.value = n ? Number(n).toLocaleString('ko-KR') : '';
    });
    setTimeout(() => { if (kind === 'outside') { const n = ov.querySelector('#dName'); if (n) n.focus(); } }, 80);

    ov.querySelector('[data-save]').onclick = async () => {
      const amount = Number(String(amt.value).replace(/[^0-9]/g, '')) || 0;
      if (!amount) return toast('금액을 입력해주세요', 'err');
      const nameEl = ov.querySelector('#dName');
      const name = kind === 'outside' ? ((nameEl && nameEl.value) || '').trim() : '';
      if (kind === 'outside' && !name) return toast('후원자 이름을 입력해주세요', 'err');
      if (kind === 'member' && !picked) return toast('후원한 구성원을 골라주세요', 'err');
      const patch = {
        campaign_id: campaignId,
        member_id: kind === 'member' ? picked : null,
        donor_name: kind === 'outside' ? name : null,
        amount, date: ov.querySelector('#dDate').value || dkey(new Date())
      };
      closeSheet();
      try {
        if (isNew) await DB.donations.create(patch); else await DB.donations.update(d.id, patch);
        await reload(); toast('저장했어요', 'ok');
      } catch (e) { toast(e.message || '저장하지 못했어요', 'err'); }
    };
    const del = ov.querySelector('[data-del]');
    if (del) del.onclick = async () => {
      closeSheet();
      if (!await confirmSheet('이 입금 내역을 지울까요?', '', '삭제', true)) return;
      await DB.donations.remove(d.id); await reload(); toast('삭제했어요');
    };
  }

  /* ============================================================
     7. 설정
     ============================================================ */
  function renderSettings() {
    const s = S.settings;
    $('#settingsPanel').innerHTML =
      '<div class="card"><h3>동아리 정보</h3><div class="sub">신청 폼에 그대로 보여요.</div><div class="sp"></div>' +
      '<div class="grid2">' +
      '<label class="field"><span class="lb">동아리 이름</span><input class="input" id="sName" value="' + esc(s.club_name) + '"></label>' +
      '<label class="field"><span class="lb">기수</span><input class="input" id="sGen" value="' + esc(s.generation || '') + '" placeholder="2기"></label></div>' +
      '<label class="field"><span class="lb">한 줄 소개</span><input class="input" id="sTag" value="' + esc(s.tagline || '') + '"></label>' +
      '<label class="field"><span class="lb">소속 학과</span><input class="input" id="sDept" value="' + esc(s.department || '') + '">' +
      '<span class="hint">신청 폼에 안내로 뜨고, 승인된 구성원의 학과로 자동 입력돼요.</span></label>' +
      '<label class="field"><span class="lb">봉사 장소</span>' +
      '<input class="input" id="sPlace" value="' + esc(s.place || '천보금 보호소') + '">' +
      '<span class="hint">봉사모임을 만들 때 이 장소로 자동 저장돼요.</span></label>' +
      '<label class="field"><span class="lb">공지 (선택)</span><textarea class="input" id="sNotice" style="min-height:70px" placeholder="폼 상단에 노란 박스로 보여요">' + esc(s.notice || '') + '</textarea></label>' +
      '<div class="divider"></div>' +
      '<label class="field"><span class="lb">회비</span><input class="input" id="sFee" inputmode="numeric" value="' + num(s.fee) + '"></label>' +
      '<div class="grid2">' +
      '<label class="field"><span class="lb">은행</span><input class="input" id="sBank" value="' + esc(s.bank || '') + '"></label>' +
      '<label class="field"><span class="lb">예금주</span><input class="input" id="sHolder" value="' + esc(s.holder || '') + '"></label></div>' +
      '<label class="field"><span class="lb">계좌번호</span><input class="input" id="sAcct" inputmode="numeric" value="' + esc(s.account || '') + '"></label>' +
      '<button class="btn primary block" id="saveClub">저장하기</button></div>' +

      '<div class="card"><h3>승인 옵션</h3><div class="sp"></div>' +
      '<label class="switch" style="justify-content:space-between"><span class="sm">승인할 때 회비를 수입으로 자동 기록</span>' +
      '<span style="display:flex"><input type="checkbox" id="autoFee"' + (autoFee() ? ' checked' : '') + '><span class="track"></span></span></label></div>' +

      '<div class="card"><h3>운영진 페이지 잠금</h3>' +
      '<div class="sub">꺼두면 이 주소로 들어온 사람은 비밀번호 없이 바로 보게 돼요.</div><div class="sp"></div>' +
      '<label class="switch" style="justify-content:space-between"><span class="sm">들어올 때 비밀번호 물어보기</span>' +
      '<span style="display:flex"><input type="checkbox" id="lockSw"' + (locked() ? ' checked' : '') + '><span class="track"></span></span></label>' +
      (locked() ? '' : '<p class="pill-note" style="margin-top:12px">지금은 잠금이 꺼져 있어요. 주소를 아는 사람은 신청자 연락처·입금증·재정을 볼 수 있으니 주소를 운영진끼리만 공유해주세요.</p>') +
      '</div>' +

      '<div class="card"><h3>비밀번호</h3><div class="sub">잠금을 켰을 때 쓰는 비밀번호예요.</div><div class="sp"></div>' +
      '<label class="field"><span class="lb">새 비밀번호</span><input class="input" id="pw1" type="password" inputmode="numeric" placeholder="6자 이상"></label>' +
      '<button class="btn ghost block" id="savePw">비밀번호 바꾸기</button></div>' +

      '<div class="card"><h3>데이터</h3><div class="sp"></div>' +
      '<div class="row" style="gap:8px"><button class="btn ghost grow" id="backup">전체 백업 내려받기</button>' +
      (DB.isDemo() ? '<button class="btn danger" id="resetDemo">체험 데이터 초기화</button>' : '') + '</div>' +
      '<div class="divider"></div>' +
      '<div class="kv"><span class="k">연결 상태</span><span class="v">' + (DB.isDemo() ? '체험 모드 (이 브라우저에만 저장)' : 'Supabase 연결됨') + '</span></div>' +
      (DB.isDemo() ? '<p class="sm mut" style="margin:10px 0 0">여러 운영진이 같은 데이터를 보려면 <b>assets/config.js</b>에 Supabase 주소와 키를 넣어주세요. 방법은 저장소의 README에 적어뒀어요.</p>' : '') +
      '</div>' +

      '<button class="btn ghost block" id="logout" style="margin-bottom:8px">' + ic('logout') + '<span>로그아웃</span></button>';

    $('#saveClub').onclick = async () => {
      await save({
        club_name: $('#sName').value.trim() || '발자국',
        generation: $('#sGen').value.trim(),
        tagline: $('#sTag').value.trim(),
        department: $('#sDept').value.trim(),
        place: $('#sPlace').value.trim() || '천보금 보호소',
        notice: $('#sNotice').value.trim(),
        fee: Number(String($('#sFee').value).replace(/[^\d]/g, '')) || 0,
        bank: $('#sBank').value.trim(),
        holder: $('#sHolder').value.trim(),
        account: $('#sAcct').value.trim()
      });
      toast('저장했어요', 'ok'); renderSettings();
    };
    $('#lockSw').onchange = e => {
      localStorage.setItem('baljaguk.lock', e.target.checked ? '1' : '0');
      toast(e.target.checked ? '이제 들어올 때 비밀번호를 물어봐요' : '잠금을 껐어요. 주소만 알면 바로 들어와요');
      renderSettings();
    };
    $('#autoFee').onchange = e => {
      localStorage.setItem('baljaguk.autoFee', e.target.checked ? '1' : '0');
      toast(e.target.checked ? '승인 시 회비를 자동 기록해요' : '자동 기록을 껐어요');
    };
    $('#savePw').onclick = async () => {
      const v = $('#pw1').value.trim();
      if (v.length < 6) return toast('6자 이상으로 정해주세요', 'err');
      try { await DB.changePassword(v); $('#pw1').value = ''; toast('비밀번호를 바꿨어요', 'ok'); }
      catch (e) { toast(e.message || '바꾸지 못했어요', 'err'); }
    };
    $('#backup').onclick = () => {
      const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), ...S }, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = '발자국_백업_' + dkey(new Date()) + '.json';
      document.body.appendChild(a); a.click(); a.remove();
      toast('백업 파일을 내려받았어요', 'ok');
    };
    const rd = $('#resetDemo');
    if (rd) rd.onclick = async () => {
      if (!await confirmSheet('체험 데이터를 초기화할까요?', '이 브라우저에 저장된 신청·구성원·재정 정보가 모두 지워지고 예시 데이터로 돌아가요.', '초기화', true)) return;
      DB.resetDemo(); location.reload();
    };
    $('#logout').onclick = async () => {
      if (!await confirmSheet('로그아웃할까요?', '', '로그아웃')) return;
      DB.logout(); location.reload();
    };
  }
})();
