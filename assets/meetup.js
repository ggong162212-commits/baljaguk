/* ============================================================
   모임 참석 조사 (1월 엠티 · 12월 벙개)
   ------------------------------------------------------------
   설문 탭의 「설문」(투표)이 아니라 **가입 폼처럼 생긴 폼**이다.
   댓글·하트는 없다. 묻고 답만 받는다.

   · 참석을 고른 사람에게만 더 묻는다 (엠티: 차량 지원 · 사는 곳)
   · 불참이면 더 묻지 않고 바로 보낸다
   · 사는 곳·차량 지원 여부는 **운영진만** 본다 (서버 RLS · supabase/meetup.sql)
   · 보이는 것은 참석·불참 **인원 수**뿐이다
   · 한 사람 1번. 다시 들어오면 고칠 수 있다

   폼의 글은 여기 FORMS 에, 날짜·마감처럼 서버가 막아야 하는 것은
   meetups 표에 있다. 둘이 어긋나면 **서버가 이긴다.**

   쓰는 법
     Meetup.list()                     → [{form,title,closes_at,open,yes,no,mine…}]
     Meetup.cards(rows)                → 설문 탭에 놓을 카드 HTML
     Meetup.open(box, form, {onBack})  → 폼 화면
   ============================================================ */
(function () {
  const { esc, toast, fmtDate } = UI;

  /* ---------- 폼마다 다른 글 ---------- */
  const FORMS = {
    mt2701: {
      kicker: '1월 엠티',
      title: '1월 엠티 참석 조사',
      lead: '양평으로 빙어잡기 다녀와요. 1분이면 끝나요.',
      rows: [
        ['일정', '2027년 1월 9일(토) ~ 10일(일) · 1박 2일'],
        ['장소', '양평 빙어잡기 (예정)']
      ],
      short: '1/9(토)~1/10(일) · 양평 빙어잡기 (예정)',
      note: '장소는 아직 확정이 아니라 「예정」이에요. 정해지면 앱으로 알려 드릴게요.',
      attend: { label: '참석 여부', options: [['yes', '참석'], ['no', '불참']] },
      car: {
        label: '차량 지원 가능 여부',
        options: [['yes', '예'], ['no', '아니오']],
        hint: '차를 가져와 주실 수 있는지만 알려 주세요. 배차에만 씁니다.'
      },
      area: {
        label: '어디 사세요?',
        placeholder: '○○동 / ○○역 근처',
        hint: '동네나 역 정도만 적어 주세요. 예) 화양동 / 건대입구역 근처'
      },
      privacy: '사는 곳과 차량 지원 여부는 운영진만 봐요. ' +
        '다른 사람에게 보이는 건 참석·불참 인원 수뿐이에요.'
    },
    bungae2612: {
      kicker: '12월 벙개',
      title: '발자국 벙개모임',
      lead: '12월 5일(토) 저녁 7시에 모여요.',
      rows: [
        ['일시', '2026년 12월 5일(토) 오후 7:00'],
        ['장소', '추후 공지']
      ],
      short: '12/5(토) 저녁 7:00 · 장소 추후 공지',
      note: '장소는 정해지는 대로 앱으로 알려 드릴게요.',
      attend: { label: '참석 여부', options: [['yes', '참석'], ['no', '미참석']] },
      privacy: '보이는 건 참석·미참석 인원 수뿐이에요.'
    }
  };

  /* ---------- 서버 ---------- */
  const demoOn = () => !!(DB.isDemo && DB.isDemo());

  function demoRead() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem('baljaguk.demo') || '{}'); } catch (e) { }
    return d;
  }
  function demoWrite(d) {
    try { localStorage.setItem('baljaguk.demo', JSON.stringify(d)); } catch (e) { }
  }
  function demoMe() {
    try { return localStorage.getItem('baljaguk.demoMe') || ''; } catch (e) { return ''; }
  }
  /* 체험 모드 — 서버와 **같은 모양**으로 돌려준다 */
  const DEMO_CFG = [
    { form: 'mt2701', title: '1월 엠티 참석 조사', closes_at: '2026-11-30T14:59:59.000Z', ask_car: true, ask_area: true },
    { form: 'bungae2612', title: '12월 벙개모임', closes_at: '2026-11-30T14:59:59.000Z', ask_car: false, ask_area: false }
  ];

  function demoList() {
    const d = demoRead(), me = demoMe();
    const ans = d.meetup_answers || [];
    const live = (d.members || []).filter(m => m.status !== 'left').length;
    return DEMO_CFG.map(c => {
      const mine = ans.find(a => a.form === c.form && a.member_id === me);
      const past = c.closes_at && Date.now() > Date.parse(c.closes_at);
      return {
        form: c.form, title: c.title, closes_at: c.closes_at,
        ask_car: c.ask_car, ask_area: c.ask_area,
        open: !past, why: past ? 'closed' : null,
        yes: ans.filter(a => a.form === c.form && a.attend === 'yes').length,
        no: ans.filter(a => a.form === c.form && a.attend === 'no').length,
        members: live,
        mine: mine ? { attend: mine.attend, car: mine.car, area: mine.area, at: mine.at } : null
      };
    });
  }

  function demoSave(form, v) {
    const d = demoRead(), me = demoMe();
    if (!me) return { ok: false, why: 'member' };
    const cfg = DEMO_CFG.find(c => c.form === form);
    if (!cfg) return { ok: false, why: 'noform' };
    if (cfg.closes_at && Date.now() > Date.parse(cfg.closes_at)) return { ok: false, why: 'closed' };
    if (['yes', 'no'].indexOf(v.attend) < 0) return { ok: false, why: 'attend' };
    let car = null, area = null;
    if (v.attend === 'yes') {
      if (cfg.ask_car) {
        if (['yes', 'no'].indexOf(v.car) < 0) return { ok: false, why: 'car' };
        car = v.car;
      }
      if (cfg.ask_area) {
        area = String(v.area || '').trim();
        if (!area) return { ok: false, why: 'area' };
        if (area.length > 40) return { ok: false, why: 'arealong' };
      }
    }
    d.meetup_answers = d.meetup_answers || [];
    const old = d.meetup_answers.find(a => a.form === form && a.member_id === me);
    if (old) Object.assign(old, { attend: v.attend, car, area, at: new Date().toISOString() });
    else d.meetup_answers.push({
      id: 'mu-' + Math.random().toString(36).slice(2, 10),
      form, member_id: me, attend: v.attend, car, area, at: new Date().toISOString()
    });
    demoWrite(d);
    return { ok: true };
  }

  async function list() {
    if (demoOn()) return demoList();
    return (await DB.rpc('meetup_list')) || [];
  }

  async function save(form, v) {
    if (demoOn()) return demoSave(form, v);
    return (await DB.rpc('meetup_save', {
      p_form: form, p_attend: v.attend,
      p_car: v.car || null, p_area: v.area || null
    })) || { ok: false, why: '' };
  }

  const WHY = {
    member: '명부와 이어진 뒤에 답할 수 있어요',
    noform: '없는 조사예요',
    closed: '마감됐어요',
    attend: '참석 여부를 골라 주세요',
    car: '차량 지원 가능 여부를 골라 주세요',
    area: '사는 곳을 적어 주세요',
    arealong: '사는 곳은 40자까지예요'
  };

  /* ---------- 작은 도구 ---------- */
  function dday(iso) {
    if (!iso) return '';
    const end = Date.parse(iso);
    if (isNaN(end)) return '';
    const 남음 = Math.ceil((end - Date.now()) / 86400000);
    if (남음 < 0) return '마감';
    return 남음 === 0 ? 'D-day' : 'D-' + 남음;
  }
  const label = (f, v) => {
    const hit = (FORMS[f] && FORMS[f].attend.options || []).find(o => o[0] === v);
    return hit ? hit[1] : '';
  };

  /* ---------- 설문 탭 카드 ---------- */
  function cards(rows) {
    const live = (rows || []).filter(r => FORMS[r.form]);
    if (!live.length) return '';
    return '<div class="section-title">' + window.ic('calendar') +
      '<span>모임 참석 조사</span></div>' +
      live.map(card).join('');
  }

  function card(r) {
    const F = FORMS[r.form];
    const 끝 = !r.open;
    const 낸것 = r.mine && r.mine.attend;
    return '<button class="card" type="button" data-meetup="' + esc(r.form) + '"' +
      ' style="display:block;width:100%;text-align:left;margin-bottom:12px;' +
      'border:none;font:inherit;color:inherit">' +
      '<div class="row between" style="align-items:center">' +
      '<span class="badge' + (끝 ? '' : ' approved') + '">' +
      (끝 ? '마감' : esc(dday(r.closes_at))) + '</span>' +
      '<span class="mut sm">' + esc(F.kicker) + '</span></div>' +
      '<div style="font-weight:800;font-size:16px;margin-top:9px">' + esc(F.title) + '</div>' +
      '<div class="mut sm" style="margin-top:5px">' + esc(F.short) + '</div>' +
      '<div class="row" style="gap:6px;align-items:center;margin-top:11px;' +
      'color:var(--brand-deep);font-weight:700;font-size:14px">' +
      '<span>' + (낸것
        ? esc(label(r.form, r.mine.attend)) + '(으)로 답했어요 · 고치기'
        : (끝 ? '결과 보기' : '답하러 가기')) + '</span>' +
      window.ic('chevron') + '</div></button>';
  }

  /* ---------- 폼 화면 ---------- */
  let BOX = null, NOW = null;
  let backFn = null;                /* 「‹ 설문으로」 를 누르면 부를 것 */
  function goBack() { if (typeof backFn === 'function') backFn(); }

  async function open(box, form, opts) {
    BOX = box; backFn = (opts && opts.onBack) || null;
    if (!FORMS[form]) { toast('없는 조사예요', 'err'); return goBack(); }
    box.innerHTML = '<div class="card center" style="padding:28px"><div class="mut sm">불러오는 중…</div></div>';
    let rows = null;
    try { rows = await list(); } catch (e) { rows = null; }
    if (!rows) {
      box.innerHTML = backRow() +
        '<div class="card center" style="padding:28px 22px">' +
        '<h3 style="font-size:16px">불러오지 못했어요</h3>' +
        '<div style="margin-top:14px"><button class="btn primary" type="button" ' +
        'data-mretry="' + esc(form) + '">다시 시도</button></div></div>';
      return bind();
    }
    NOW = rows.find(r => r.form === form) || null;
    if (!NOW) { toast('없는 조사예요', 'err'); return goBack(); }
    paint();
  }

  const backRow = () =>
    '<div class="row" style="margin:2px 0 12px">' +
    '<button class="btn ghost sm" type="button" data-mback>‹ 설문으로</button></div>';

  function paint(sent) {
    const r = NOW, F = FORMS[r.form];
    const mine = r.mine || null;
    const 끝 = !r.open;

    /* 보낸 뒤 — 고마워요 화면 */
    if (sent && mine) {
      BOX.innerHTML = backRow() +
        '<div class="card center" style="padding:30px 20px">' +
        '<div style="display:flex;justify-content:center;color:var(--brand)">' +
        '<span style="width:56px;height:56px;border-radius:50%;background:var(--brand-soft);' +
        'display:grid;place-items:center">' + window.ic('check') + '</span></div>' +
        '<h3 style="margin-top:12px;font-size:21px">답해 주셔서 고마워요</h3>' +
        '<p class="mut sm" style="margin-top:6px">' +
        esc(label(r.form, mine.attend)) + '(으)로 보냈어요. 마감 전까지 고칠 수 있어요.</p>' +
        '<div class="sp"></div>' +
        '<button class="btn ghost block" type="button" data-medit>고치기</button>' +
        '</div>' + 숫자줄(r);
      return bind();
    }

    BOX.innerHTML = backRow() +
      /* 머리 */
      '<section class="card" style="margin-bottom:12px">' +
      '<div class="row between" style="align-items:flex-start">' +
      '<div class="grow"><div class="mut sm">' + esc(F.kicker) + '</div>' +
      '<h3 style="margin-top:3px;font-size:19px">' + esc(F.title) + '</h3>' +
      '<p class="mut sm" style="margin-top:5px">' + esc(F.lead) + '</p></div>' +
      '<span class="badge' + (끝 ? '' : ' approved') + '" style="flex:none">' +
      (끝 ? '마감' : esc(dday(r.closes_at))) + '</span></div>' +
      '<div class="sp"></div>' +
      F.rows.map(x => '<div class="kv"><span class="k">' + esc(x[0]) +
        '</span><span class="v">' + esc(x[1]) + '</span></div>').join('') +
      (r.closes_at
        ? '<div class="kv"><span class="k">마감</span><span class="v">' +
          esc(fmtDate(r.closes_at)) + ' 밤 11:59</span></div>'
        : '') +
      (F.note ? '<p class="pill-note" style="margin-top:11px">' + esc(F.note) + '</p>' : '') +
      '</section>' +

      /* 마감이면 폼 대신 안내 */
      (끝
        ? '<div class="card center" style="padding:28px 22px">' +
          '<h3 style="font-size:16px">지금은 답하는 기간이 아니에요</h3>' +
          '<p class="mut sm" style="margin-top:6px">' +
          (r.why === 'manual' ? '운영진이 잠시 닫아 뒀어요.' : '마감됐어요.') +
          ' 궁금한 건 운영진에게 알려 주세요.</p></div>'
        : form폼(r, F, mine)) +

      숫자줄(r);
    bind();
  }

  function 숫자줄(r) {
    const F = FORMS[r.form];
    const [yes, no] = [F.attend.options[0][1], F.attend.options[1][1]];
    return '<div class="card" style="margin-top:12px">' +
      '<div class="row between"><span class="mut sm">지금까지</span>' +
      '<span class="sm" style="font-weight:700">' +
      esc(yes) + ' ' + r.yes + '명 · ' + esc(no) + ' ' + r.no + '명</span></div>' +
      '<p class="mut xs" style="margin-top:7px">' + esc(F.privacy) + '</p></div>';
  }

  function 고르기(name, options, picked) {
    return '<div class="stack" style="gap:8px;margin-top:6px" data-pickgroup="' + name + '">' +
      options.map(o =>
        '<label class="check' + (picked === o[0] ? ' on' : '') + '" data-pick="' + o[0] + '">' +
        '<span class="box" aria-hidden="true"></span>' +
        '<input type="radio" name="' + name + '" value="' + o[0] + '"' +
        (picked === o[0] ? ' checked' : '') + ' hidden>' +
        '<span class="sm">' + esc(o[1]) + '</span></label>').join('') + '</div>';
  }

  function form폼(r, F, mine) {
    const 참석 = mine ? mine.attend : '';
    const 보임 = 참석 === 'yes';
    return '<form class="card" id="muForm" novalidate>' +
      '<div class="field">' +
      '<span class="lb">' + esc(F.attend.label) + ' <span class="req">*</span></span>' +
      고르기('attend', F.attend.options, 참석) +
      '</div>' +

      (F.car
        ? '<div class="field" data-only="yes"' + (보임 ? '' : ' hidden') + '>' +
          '<span class="lb">' + esc(F.car.label) + ' <span class="req">*</span></span>' +
          고르기('car', F.car.options, mine ? mine.car : '') +
          '<span class="hint hintline">' + esc(F.car.hint) + '</span></div>'
        : '') +

      (F.area
        ? '<label class="field" data-only="yes"' + (보임 ? '' : ' hidden') + '>' +
          '<span class="lb">' + esc(F.area.label) + ' <span class="req">*</span></span>' +
          '<input class="input" name="area" maxlength="40" placeholder="' +
          esc(F.area.placeholder) + '" value="' + esc((mine && mine.area) || '') + '">' +
          '<span class="hint hintline">' + esc(F.area.hint) + '</span></label>'
        : '') +

      '<div class="sp"></div>' +
      '<button class="btn primary lg block" type="submit" data-msend>' +
      (mine ? '고쳐서 보내기' : '보내기') + '</button>' +
      '</form>';
  }

  /* ---------- 손짓 ---------- */
  function bind() {
    const b = BOX.querySelector('[data-mback]');
    if (b) b.onclick = goBack;
    const rt = BOX.querySelector('[data-mretry]');
    if (rt) rt.onclick = () => open(BOX, rt.getAttribute('data-mretry'), { onBack: backFn });
    const ed = BOX.querySelector('[data-medit]');
    if (ed) ed.onclick = () => paint(false);

    BOX.querySelectorAll('[data-pickgroup]').forEach(g => {
      g.querySelectorAll('.check').forEach(c => {
        c.onclick = e => {
          e.preventDefault();
          g.querySelectorAll('.check').forEach(x => x.classList.remove('on'));
          c.classList.add('on');
          const i = c.querySelector('input'); if (i) i.checked = true;
          /* 참석을 고르면 뒤 질문이 열리고, 불참이면 닫힌다 */
          if (g.getAttribute('data-pickgroup') === 'attend') 뒷질문(c.getAttribute('data-pick'));
        };
      });
    });

    const f = BOX.querySelector('#muForm');
    if (f) f.onsubmit = e => { e.preventDefault(); send(); };
  }

  function 뒷질문(attend) {
    BOX.querySelectorAll('[data-only="yes"]').forEach(el => { el.hidden = attend !== 'yes'; });
  }

  function 고른값(name) {
    const g = BOX.querySelector('[data-pickgroup="' + name + '"]');
    if (!g) return '';
    const on = g.querySelector('.check.on');
    return on ? on.getAttribute('data-pick') : '';
  }

  async function send() {
    const r = NOW;
    const v = {
      attend: 고른값('attend'),
      car: 고른값('car'),
      area: (BOX.querySelector('[name="area"]') || {}).value || ''
    };
    if (!v.attend) return toast('참석 여부를 골라 주세요', 'err');
    if (v.attend === 'yes' && r.ask_car && !v.car) return toast(WHY.car, 'err');
    if (v.attend === 'yes' && r.ask_area && !String(v.area).trim()) return toast(WHY.area, 'err');

    const btn = BOX.querySelector('[data-msend]');
    if (btn) { btn.disabled = true; btn.textContent = '보내는 중…'; }
    let res = null;
    try { res = await save(r.form, v); }
    catch (e) { res = null; }
    if (!res || !res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = '보내기'; }
      return toast((res && WHY[res.why]) || '보내지 못했어요. 잠시 뒤 다시 해 주세요', 'err');
    }
    /* 숫자와 내 답을 다시 받아 온다 */
    try {
      const rows = await list();
      NOW = rows.find(x => x.form === r.form) || NOW;
    } catch (e) {
      NOW = Object.assign({}, NOW, {
        mine: { attend: v.attend, car: v.car || null, area: v.area || null }
      });
    }
    paint(true);
    if (window.UI && UI.cheer) { try { UI.cheer(); } catch (e) { } }
  }

  window.Meetup = { FORMS, list, save, cards, card, open };
})();
