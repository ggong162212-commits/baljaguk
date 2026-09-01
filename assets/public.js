/* ============================================================
   가입 신청 페이지
   ============================================================ */
(function () {
  const { $, $$, toast, copy, won, esc, fmtDate, fmtDateTime, hyphenPhone, resizeImage, cheer, debounce } = UI;
  const DRAFT = 'baljaguk.draft';
  const APPLIED = 'baljaguk.applied';
  let settings = null, receipt = '', receiptName = '', ctaWatcher = null;

  UI.initTheme();

  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    // 아이콘
    $('#brandIcon').innerHTML = ic('paw');
    $('#pawline').innerHTML = ic('paw') + ic('paw') + ic('paw');
    $('#dropIcon').innerHTML = ic('image');
    $('#doneIcon').innerHTML = '<span style="width:56px;height:56px;border-radius:50%;background:var(--brand-soft);display:grid;place-items:center">' + ic('check') + '</span>';
    $('#closedIcon').innerHTML = '<span style="width:52px;height:52px;border-radius:50%;background:var(--surface-2);display:grid;place-items:center">' + ic('clock') + '</span>';
    $('#formTitle').innerHTML = ic('clipboard') + '<span>신청서 작성</span>';
    $('[data-theme-btn]').addEventListener('click', UI.toggleTheme);
    UI.paintThemeButtons();

    try { settings = await DB.settings.get(); }
    catch (e) { settings = Object.assign({ form_open: true }, (window.CONFIG || {}).FALLBACK); toast('안내 정보를 불러오지 못해 기본값으로 보여드려요', 'err'); }

    paintClub();
    paintStatus();
    wireForm();
    restoreDraft();
  }

  /* ---------- 동아리 정보 ---------- */
  function paintClub() {
    const s = settings;
    document.title = s.club_name + ' · 부원 모집';
    $('#brandName').textContent = s.club_name;
    $('#kicker').innerHTML = ic('sprout') + '<span>' + esc(s.generation || '') + ' 부원 모집</span>';
    $('#heroSub').innerHTML = esc(s.tagline) + '예요.<br>아래 폼을 작성해주시면 운영진이 확인 후 승인하겠습니다.';
    $('#feeAmount').textContent = won(s.fee);
    $('#deptHint').textContent = (s.department || '') + ' 학생 대상이에요.';
    $('#bankName').textContent = s.bank;
    $('#acctNo').textContent = s.account;
    $('#holderName').textContent = '예금주 ' + s.holder;
    $('#footNote').textContent = s.club_name + (s.generation ? ' ' + s.generation : '') + ' · 문의는 운영진에게 연락해주세요';
    if (!s.fee) $('#feeCard').hidden = true;
    $('#copyAcct').innerHTML = ic('clipboard') + '<span>복사</span>';
    $('#copyAcct').addEventListener('click', () => copy(String(s.account).replace(/\D/g, ''), '계좌번호를 복사했어요'));
    if (s.notice) {
      const n = document.createElement('div');
      n.className = 'pill-note';
      n.style.marginTop = '14px';
      n.textContent = s.notice;
      $('#feeCard').after(n);
    }
  }

  /* ---------- 접수 상태 ---------- */
  function paintStatus() {
    const st = DB.formState(settings, null);
    const slot = $('#statusSlot');
    if (st.open) {
      slot.innerHTML = '<div class="statusbar open">' + ic('check') + '<span>지금 신청 받는 중이에요</span></div>' +
        (st.until ? '<div class="statusbar count" id="cdBar">' + ic('clock') +
          '<span>신청 마감까지 <b id="cd">계산 중</b></span></div>' : '');
      startCountdown(st.until);
      $('#formWrap').hidden = false;
      $('#closedWrap').hidden = true;
      watchCta();
    } else {
      slot.innerHTML = '<div class="statusbar closed">' + ic('alert') + '<span>지금은 신청을 받지 않아요</span></div>';
      $('#formWrap').hidden = true;
      $('#closedWrap').hidden = false;
      $('#feeCard').hidden = true;   // 접수 안 받는 동안에는 계좌 안내를 숨긴다
      $('#cta').hidden = true;
      startCountdown(null);
      if (st.why === 'before') {
        $('#closedTitle').textContent = '아직 접수 전이에요';
        $('#closedMsg').textContent = fmtDateTime(st.at) + '부터 신청할 수 있어요. 그때 다시 들러주세요!';
      } else if (st.why === 'closed') {
        $('#closedTitle').textContent = '접수가 마감됐어요';
        $('#closedMsg').textContent = fmtDateTime(st.at) + '에 마감되었어요. ' + (settings.closed_message || '');
      } else {
        $('#closedTitle').textContent = '지금은 접수 기간이 아니에요';
        $('#closedMsg').textContent = settings.closed_message || '다음 모집 소식을 기다려주세요!';
      }
    }
  }

  /* 마감까지 남은 시간 실시간 표시 */
  let cdTimer = null;
  function startCountdown(until) {
    if (cdTimer) { clearInterval(cdTimer); cdTimer = null; }
    if (!until) return;
    const end = Date.parse(until);
    const p2 = n => String(n).padStart(2, '0');
    const tick = async () => {
      const el = $('#cd');
      if (!el) { clearInterval(cdTimer); cdTimer = null; return; }
      let left = end - Date.now();
      if (left <= 0) {
        clearInterval(cdTimer); cdTimer = null;
        try { settings = await DB.settings.get(); } catch (e) { }
        paintStatus();
        toast('신청 접수가 마감됐어요');
        return;
      }
      const d = Math.floor(left / 86400000); left -= d * 86400000;
      const h = Math.floor(left / 3600000); left -= h * 3600000;
      const m = Math.floor(left / 60000); const s = Math.floor(left % 60000 / 1000);
      el.textContent = (d > 0 ? d + '일 ' : '') + p2(h) + ':' + p2(m) + ':' + p2(s);
      const bar = $('#cdBar');
      if (bar) bar.classList.toggle('urgent', d === 0 && h < 12);
    };
    tick();
    cdTimer = setInterval(tick, 1000);
  }

  function watchCta() {
    const btn = $('#ctaBtn'), form = $('#applyForm');
    if (!form) return;
    btn.innerHTML = ic('clipboard') + '<span>신청서 작성하러 가기</span>';
    btn.addEventListener('click', () => {
      form.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTimeout(() => { const i = form.querySelector('input[name=name]'); if (i) i.focus({ preventScroll: true }); }, 420);
    });
    if (!('IntersectionObserver' in window)) return;
    ctaWatcher = new IntersectionObserver(es => {
      if ($('#formWrap').hidden) { $('#cta').hidden = true; return; }
      $('#cta').hidden = es[0].isIntersecting;
    }, { threshold: .08 });
    ctaWatcher.observe(form);
  }

  /* ---------- 폼 ---------- */
  function wireForm() {
    const form = $('#applyForm');
    if (!form) return;

    form.addEventListener('input', e => {
      if (e.target.name === 'phone') e.target.value = hyphenPhone(e.target.value);
      if (e.target.name === 'motivation') $('#motiveCount').textContent = e.target.value.length;
      clearErr(e.target.closest('.field'));
      progress();
      saveDraft();
    });

    // 동의 체크
    const agree = $('#agree');
    agree.addEventListener('click', e => {
      if (e.target.tagName !== 'INPUT') { e.preventDefault(); }
      const inp = agree.querySelector('input');
      inp.checked = !inp.checked;
      agree.classList.toggle('on', inp.checked);
      agree.querySelector('.box').innerHTML = inp.checked ? ic('check') : '';
      progress(); saveDraft();
    });

    // 입금증
    const drop = $('#drop'), file = $('#file');
    drop.addEventListener('click', () => file.click());
    drop.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); file.click(); } });
    file.addEventListener('change', () => { if (file.files[0]) takeImage(file.files[0]); });
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.style.borderColor = 'var(--brand)'; }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.style.borderColor = ''; }));
    drop.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) takeImage(f); });
    window.addEventListener('paste', e => {
      const items = (e.clipboardData || {}).items || [];
      for (const it of items) if (it.type.indexOf('image') === 0) { takeImage(it.getAsFile()); toast('붙여넣은 이미지를 첨부했어요', 'ok'); break; }
    });
    $('#receiptClear').addEventListener('click', e => { e.stopPropagation(); clearImage(); });

    form.addEventListener('submit', submit);
    $('#againBtn').addEventListener('click', () => {
      $('#doneWrap').hidden = true; $('#formWrap').hidden = false;
      $('#feeCard').hidden = !settings.fee; $('#statusSlot').hidden = false;
      watchCta();
      form.reset(); clearImage(); localStorage.removeItem(DRAFT);
      $('#agree').classList.remove('on'); $('#agree .box').innerHTML = '';
      $('#motiveCount').textContent = '0';
      progress(); window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  async function takeImage(f) {
    try {
      if (f.size > 12 * 1024 * 1024) throw new Error('12MB 이하 이미지만 올릴 수 있어요');
      toast('사진을 줄이는 중…');
      receipt = await resizeImage(f, 1280, .72);
      receiptName = f.name || '입금증';
      $('#receiptPreview').src = receipt;
      $('#receiptInfo').textContent = receiptName + ' · ' + Math.round(receipt.length / 1365) + 'KB';
      $('#dropIdle').hidden = true; $('#dropDone').hidden = false; $('#receiptActions').hidden = false;
      clearErr($('#f-receipt'));
      saveDraft(); progress();
    } catch (e) { toast(e.message || '이미지를 처리하지 못했어요', 'err'); }
  }
  function clearImage() {
    receipt = ''; receiptName = '';
    $('#file').value = '';
    $('#dropIdle').hidden = false; $('#dropDone').hidden = true; $('#receiptActions').hidden = true;
    saveDraft(); progress();
  }

  function values() {
    const f = $('#applyForm');
    return {
      name: f.name.value.trim(),
      student_id: f.student_id.value.trim(),
      department: (settings && settings.department) || '',
      phone: hyphenPhone(f.phone.value.trim()),
      motivation: f.motivation.value.trim(),
      agree: $('#agree input').checked
    };
  }

  function progress() {
    const v = values();
    const done = [v.name && v.student_id, v.phone.replace(/\D/g, '').length >= 10 && v.motivation.length >= 10, !!receipt && v.agree];
    $$('#steps i').forEach((el, i) => el.classList.toggle('on', !!done[i]));
  }

  const setErr = (id, msg) => {
    const f = $(id); f.classList.add('bad');
    if (msg) f.querySelector('.hint-inline').textContent = msg;
  };
  const clearErr = f => f && f.classList && f.classList.remove('bad');

  function validate() {
    const v = values();
    $$('.field').forEach(clearErr);
    const bad = [];
    if (!v.name) { setErr('#f-name'); bad.push('#f-name'); }
    if (!v.student_id) { setErr('#f-student'); bad.push('#f-student'); }
    if (v.phone.replace(/\D/g, '').length < 10) { setErr('#f-phone', '연락처를 정확히 입력해주세요'); bad.push('#f-phone'); }
    if (v.motivation.length < 10) { setErr('#f-motive'); bad.push('#f-motive'); }
    if (settings.fee && !receipt) { setErr('#f-receipt'); bad.push('#f-receipt'); }
    if (!v.agree) { toast('개인정보 사용 동의가 필요해요', 'err'); bad.push('#agree'); }
    if (bad.length) {
      const el = $(bad[0]);
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const inp = el.querySelector('input,textarea'); if (inp) setTimeout(() => inp.focus({ preventScroll: true }), 400);
      return false;
    }
    return true;
  }

  async function submit(e) {
    e.preventDefault();
    if (!validate()) return;
    const btn = $('#submitBtn');
    btn.disabled = true; btn.textContent = '보내는 중…';
    const v = values();
    try {
      // 접수 상태 재확인 (작성 중 마감됐을 수 있음)
      const fresh = await DB.settings.get().catch(() => settings);
      settings = fresh || settings;
      if (!DB.formState(settings, null).open) { paintStatus(); throw new Error('방금 접수가 마감됐어요. 운영진에게 문의해주세요'); }

      await DB.apply({ name: v.name, student_id: v.student_id, department: v.department, phone: v.phone, motivation: v.motivation, receipt });
      localStorage.removeItem(DRAFT);
      localStorage.setItem(APPLIED, JSON.stringify({ name: v.name, at: new Date().toISOString() }));
      $('#doneSummary').innerHTML =
        row('이름', v.name) + row('학번', v.student_id) + row('학과', v.department) +
        row('연락처', v.phone) + row('신청 시각', fmtDateTime(new Date().toISOString()));
      $('#formWrap').hidden = true;
      $('#doneWrap').hidden = false;
      $('#feeCard').hidden = true;
      $('#statusSlot').hidden = true;
      if (ctaWatcher) { ctaWatcher.disconnect(); ctaWatcher = null; }
      $('#cta').hidden = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
      cheer();
      toast('신청서를 보냈어요!', 'ok');
    } catch (err) {
      toast(err.message || '신청서를 보내지 못했어요. 잠시 후 다시 시도해주세요', 'err');
    } finally {
      btn.disabled = false; btn.textContent = '신청서 보내기';
    }
  }
  const row = (k, v) => '<div class="kv"><span class="k">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></div>';

  /* ---------- 임시저장 ---------- */
  const saveDraft = debounce(function () {
    const v = values();
    if (!v.name && !v.phone && !v.motivation && !receipt) return;
    try {
      localStorage.setItem(DRAFT, JSON.stringify(Object.assign(v, { receipt, receiptName, at: Date.now() })));
      $('#savedNote').textContent = '작성 중인 내용을 이 기기에 임시 저장했어요';
    } catch (e) { /* 용량 초과 시 무시 */ }
  }, 400);

  function restoreDraft() {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT) || 'null'); } catch (e) { }
    if (!d || !$('#applyForm')) return;
    const f = $('#applyForm');
    f.name.value = d.name || ''; f.student_id.value = d.student_id || '';
    f.phone.value = d.phone || '';
    f.motivation.value = d.motivation || '';
    $('#motiveCount').textContent = (d.motivation || '').length;
    if (d.agree) { $('#agree input').checked = true; $('#agree').classList.add('on'); $('#agree .box').innerHTML = ic('check'); }
    if (d.receipt) {
      receipt = d.receipt; receiptName = d.receiptName || '입금증';
      $('#receiptPreview').src = receipt;
      $('#receiptInfo').textContent = receiptName + ' (임시 저장됨)';
      $('#dropIdle').hidden = true; $('#dropDone').hidden = false; $('#receiptActions').hidden = false;
    }
    $('#savedNote').textContent = '이전에 작성하던 내용을 불러왔어요';
    progress();
  }


})();
