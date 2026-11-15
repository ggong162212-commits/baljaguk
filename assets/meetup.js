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
      note: '장소는 아직 확정이 아니라 「예정」이에요. 정해지면 공지할게요.',
      attend: { label: '참석 여부', options: [['yes', '참석'], ['no', '불참']] },
      car: {
        label: '차량 지원 가능 여부',
        options: [['yes', '예'], ['no', '아니오']],
        hint: '차를 가져와 주실 수 있는지만 알려 주세요. 배차에만 씁니다.'
      },
      seats: {
        label: '몇 명 태울 수 있어요?',
        placeholder: '3',
        hint: '운전자 빼고 탈 수 있는 사람 수예요. 숫자만 적어 주세요 (1~9).'
      },
      area: {
        label: '어디 사세요?',
        placeholder: '○○동 / ○○역 근처',
        hint: '동네나 역 정도만 적어 주세요. 예) 화양동 / 건대입구역 근처'
      },
      privacy: '답한 내용은 운영진만 봐요. 사는 곳·차량은 배차에만 씁니다. ' +
        '누가 몇 명 가는지는 서로 안 보여요.'
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
      note: '장소는 정해지는 대로 공지할게요.',
      attend: { label: '참석 여부', options: [['yes', '참석'], ['no', '미참석']] },
      privacy: '답한 내용은 운영진만 봐요. 누가 몇 명 오는지는 서로 안 보여요.'
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
        mine: mine
          ? { attend: mine.attend, car: mine.car, seats: mine.seats, area: mine.area, at: mine.at }
          : null
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
    let car = null, seats = null, area = null;
    if (v.attend === 'yes') {
      if (cfg.ask_car) {
        if (['yes', 'no'].indexOf(v.car) < 0) return { ok: false, why: 'car' };
        car = v.car;
        /* 차를 가져와 주실 때만 몇 자리인지 받는다 */
        if (car === 'yes') {
          seats = parseInt(String(v.seats || '').trim(), 10);
          if (!seats) return { ok: false, why: 'seats' };
          if (seats < 1 || seats > 9) return { ok: false, why: 'seatsrange' };
        }
      }
      if (cfg.ask_area) {
        area = String(v.area || '').trim();
        if (!area) return { ok: false, why: 'area' };
        if (area.length > 40) return { ok: false, why: 'arealong' };
      }
    }
    d.meetup_answers = d.meetup_answers || [];
    const old = d.meetup_answers.find(a => a.form === form && a.member_id === me);
    if (old) Object.assign(old, { attend: v.attend, car, seats, area, at: new Date().toISOString() });
    else d.meetup_answers.push({
      id: 'mu-' + Math.random().toString(36).slice(2, 10),
      form, member_id: me, attend: v.attend, car, seats, area,
      at: new Date().toISOString()
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
      p_car: v.car || null,
      p_seats: v.seats ? parseInt(String(v.seats).trim(), 10) : null,
      p_area: v.area || null
    })) || { ok: false, why: '' };
  }

  const WHY = {
    member: '명부와 이어진 뒤에 답할 수 있어요',
    noform: '없는 조사예요',
    closed: '마감됐어요',
    attend: '참석 여부를 골라 주세요',
    car: '차량 지원 가능 여부를 골라 주세요',
    seats: '몇 명 태울 수 있는지 적어 주세요',
    seatsrange: '탑승 인원은 1~9명 사이로 적어 주세요',
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

  /* ---------- 설문 탭 카드 ----------
     조사가 둘이어도 카드는 **하나**다. 같이 공지하니 한 번에 들어가
     두 개를 한 화면에서 답한다. */
  function cards(rows) {
    const live = (rows || []).filter(r => FORMS[r.form]);
    if (!live.length) return '';
    return '<div class="section-title">' + window.ic('calendar') +
      '<span>모임 참석 조사</span></div>' + card(live);
  }

  function card(list) {
    const 열린것 = list.filter(r => r.open);
    const 낸수 = list.filter(r => r.mine && r.mine.attend).length;
    const 끝 = !열린것.length;
    /* 남은 날은 **먼저 닫히는 것** 기준 — 급한 쪽을 보여 준다 */
    const 가까운 = 열린것.slice().sort((a, b) =>
      String(a.closes_at || '~').localeCompare(String(b.closes_at || '~')))[0];
    const 이름들 = list.map(r => FORMS[r.form].kicker).join(' · ');
    return '<button class="card" type="button" data-meetup="all"' +
      ' style="display:block;width:100%;text-align:left;margin-bottom:12px;' +
      'border:none;font:inherit;color:inherit">' +
      '<div class="row between" style="align-items:center">' +
      '<span class="badge' + (끝 ? '' : ' approved') + '">' +
      (끝 ? '마감' : esc(dday(가까운 && 가까운.closes_at))) + '</span>' +
      '<span class="mut sm">' + esc(이름들) + '</span></div>' +
      '<div style="font-weight:800;font-size:16px;margin-top:9px">모임 참석 조사</div>' +
      '<div class="mut sm" style="margin-top:5px">' +
      esc(list.map(r => FORMS[r.form].short).join('\n')).replace(/\n/g, '<br>') +
      '</div>' +
      '<div class="row" style="gap:6px;align-items:center;margin-top:11px;' +
      'color:var(--brand-deep);font-weight:700;font-size:14px">' +
      '<span>' + (끝
        ? '결과 보기'
        : (낸수 >= list.length
          ? '둘 다 답했어요 · 고치기'
          : (낸수 ? list.length + '개 중 ' + 낸수 + '개 답했어요 · 마저 답하기' : '답하러 가기'))) +
      '</span>' + window.ic('chevron') + '</div></button>';
  }

  /* ---------- 폼 화면 ----------
     ★ 두 조사를 **한 화면에** 둔다. 같이 공지하기 때문에 한 번 들어와서
       두 개를 다 답하고 나가는 것이 자연스럽다.
       보내기는 조사마다 따로다 — 하나를 보내도 다른 하나는 적던 그대로 남는다. */
  let BOX = null, ROWS = null, FOCUS = null;
  let backFn = null;                /* 「‹ 설문으로」 를 누르면 부를 것 */
  function goBack() { if (typeof backFn === 'function') backFn(); }
  const 보낸것 = {};                /* form → 방금 보냈나 (고마워요 화면) */

  async function open(box, form, opts) {
    BOX = box; backFn = (opts && opts.onBack) || null;
    /* 옛 주소(#meetup=mt2701)로 들어와도 두 개를 다 보여 주고,
       그 조사 자리로 내려 준다 — 링크가 가리키던 곳을 잃지 않게 */
    FOCUS = (form && form !== 'all' && FORMS[form]) ? form : null;
    Object.keys(보낸것).forEach(k => { delete 보낸것[k]; });
    box.innerHTML = '<div class="card center" style="padding:28px">' +
      '<div class="mut sm">불러오는 중…</div></div>';
    let rows = null;
    try { rows = await list(); } catch (e) { rows = null; }
    if (!rows) {
      box.innerHTML = backRow() +
        '<div class="card center" style="padding:28px 22px">' +
        '<h3 style="font-size:16px">불러오지 못했어요</h3>' +
        '<div style="margin-top:14px"><button class="btn primary" type="button" ' +
        'data-mretry>다시 시도</button></div></div>';
      return bind();
    }
    ROWS = rows.filter(r => FORMS[r.form]);
    if (!ROWS.length) { toast('조사를 찾지 못했어요', 'err'); return goBack(); }
    paint();
    if (FOCUS) 자리로(FOCUS);
  }

  function 자리로(form) {
    const el = BOX.querySelector('[data-mu="' + form + '"]');
    if (el) setTimeout(() => el.scrollIntoView({ block: 'start', behavior: 'smooth' }), 120);
  }

  const backRow = () =>
    '<div class="row" style="margin:2px 0 12px">' +
    '<button class="btn ghost sm" type="button" data-mback>‹ 설문으로</button></div>';

  function paint() {
    const 남은 = ROWS.filter(r => r.open && !(r.mine && r.mine.attend)).length;
    BOX.innerHTML = backRow() +
      '<section class="card" style="margin-bottom:12px">' +
      '<h3 style="font-size:19px">모임 참석 조사</h3>' +
      '<p class="mut sm" style="margin-top:5px">' +
      (남은
        ? '아래 ' + ROWS.length + '개를 한 번에 답해 주세요. 1분이면 끝나요.'
        : '다 답하셨어요. 마감 전까지 언제든 고칠 수 있어요.') +
      '</p></section>' +
      ROWS.map(섹션).join('');
    bind();
  }

  function 섹션(r) {
    const F = FORMS[r.form];
    const mine = r.mine || null;
    const 끝 = !r.open;
    const 보냄 = !!보낸것[r.form];

    return '<div data-mu="' + esc(r.form) + '" style="margin-bottom:18px">' +
      /* 머리 */
      '<section class="card" style="margin-bottom:10px">' +
      '<div class="row between" style="align-items:flex-start">' +
      '<div class="grow"><div class="mut sm">' + esc(F.kicker) + '</div>' +
      '<h3 style="margin-top:3px;font-size:18px">' + esc(F.title) + '</h3>' +
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

      (끝
        ? '<div class="card center" style="padding:24px 20px">' +
          '<h3 style="font-size:15px">지금은 답하는 기간이 아니에요</h3>' +
          '<p class="mut sm" style="margin-top:6px">' +
          (r.why === 'manual' ? '운영진이 잠시 닫아 뒀어요.' : '마감됐어요.') + '</p></div>'
        : (보냄 && mine ? 고마워요(r, mine) : 폼(r, F, mine))) +

      안내줄(F) + '</div>';
  }

  function 고마워요(r, mine) {
    return '<div class="card center" style="padding:26px 20px">' +
      '<div style="display:flex;justify-content:center;color:var(--brand)">' +
      '<span style="width:52px;height:52px;border-radius:50%;background:var(--brand-soft);' +
      'display:grid;place-items:center">' + window.ic('check') + '</span></div>' +
      '<h3 style="margin-top:11px;font-size:18px">답해 주셔서 고마워요</h3>' +
      '<p class="mut sm" style="margin-top:6px">' +
      esc(label(r.form, mine.attend)) + '(으)로 보냈어요. 마감 전까지 고칠 수 있어요.</p>' +
      '<div class="sp"></div>' +
      '<button class="btn ghost block" type="button" data-medit="' + esc(r.form) + '">고치기</button>' +
      '</div>';
  }

  /* ★ 참석·불참 인원은 **구성원에게 보여 주지 않는다** (선고은님 요청).
     누가 몇 명 간다는 걸 보고 마음을 정하지 않게, 서로 눈치 보지 않게.
     숫자는 운영진 화면에서만 본다 — 서버도 구성원에게는 안 준다. */
  function 안내줄(F) {
    return '<p class="mut xs" style="margin:10px 4px 0;line-height:1.6">' +
      esc(F.privacy) + '</p>';
  }

  function 고르기(form, name, options, picked) {
    return '<div class="stack" style="gap:8px;margin-top:6px" data-pickgroup="' + name + '">' +
      options.map(o =>
        '<label class="check' + (picked === o[0] ? ' on' : '') + '" data-pick="' + o[0] + '">' +
        '<span class="box" aria-hidden="true"></span>' +
        '<input type="radio" name="' + name + '-' + form + '" value="' + o[0] + '"' +
        (picked === o[0] ? ' checked' : '') + ' hidden>' +
        '<span class="sm">' + esc(o[1]) + '</span></label>').join('') + '</div>';
  }

  function 폼(r, F, mine) {
    const 참석 = mine ? mine.attend : '';
    const 보임 = 참석 === 'yes';
    const 차예 = 보임 && mine && mine.car === 'yes';
    return '<form class="card" data-muform="' + esc(r.form) + '" novalidate>' +
      '<div class="field">' +
      '<span class="lb">' + esc(F.attend.label) + ' <span class="req">*</span></span>' +
      고르기(r.form, 'attend', F.attend.options, 참석) +
      '</div>' +

      (F.car
        ? '<div class="field" data-only="yes"' + (보임 ? '' : ' hidden') + '>' +
          '<span class="lb">' + esc(F.car.label) + ' <span class="req">*</span></span>' +
          고르기(r.form, 'car', F.car.options, mine ? mine.car : '') +
          '<span class="hint hintline">' + esc(F.car.hint) + '</span></div>'
        : '') +

      (F.seats
        ? '<label class="field" data-only="car"' + (차예 ? '' : ' hidden') + '>' +
          '<span class="lb">' + esc(F.seats.label) + ' <span class="req">*</span></span>' +
          '<input class="input" name="seats" inputmode="numeric" maxlength="1" ' +
          'placeholder="' + esc(F.seats.placeholder) + '" value="' +
          esc((mine && mine.seats) || '') + '">' +
          '<span class="hint hintline">' + esc(F.seats.hint) + '</span></label>'
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
    if (rt) rt.onclick = () => open(BOX, FOCUS || 'all', { onBack: backFn });

    BOX.querySelectorAll('[data-medit]').forEach(e => {
      e.onclick = () => { delete 보낸것[e.getAttribute('data-medit')]; paint(); };
    });

    BOX.querySelectorAll('[data-mu]').forEach(칸 => {
      const form = 칸.getAttribute('data-mu');
      칸.querySelectorAll('[data-pickgroup]').forEach(g => {
        g.querySelectorAll('.check').forEach(c => {
          c.onclick = e => {
            e.preventDefault();
            g.querySelectorAll('.check').forEach(x => x.classList.remove('on'));
            c.classList.add('on');
            const i = c.querySelector('input'); if (i) i.checked = true;
            /* 참석을 고르면 뒤 질문이 열리고, 불참이면 닫힌다.
               차량이 「예」일 때만 탑승 인원을 묻는다 (질문 속의 질문) */
            const 이름 = g.getAttribute('data-pickgroup');
            if (이름 === 'attend') 뒷질문(칸, c.getAttribute('data-pick'));
            if (이름 === 'car') 차뒷질문(칸, c.getAttribute('data-pick'));
          };
        });
      });
      const f = 칸.querySelector('[data-muform]');
      if (f) f.onsubmit = e => { e.preventDefault(); send(form); };
    });
  }

  function 뒷질문(칸, attend) {
    const 참석 = attend === 'yes';
    칸.querySelectorAll('[data-only="yes"]').forEach(el => { el.hidden = !참석; });
    /* 참석을 껐으면 탑승 인원도 같이 닫는다 — 안 물어본 칸이 남아 있으면 안 된다 */
    차뒷질문(칸, 참석 ? 고른값(칸, 'car') : '');
  }

  function 차뒷질문(칸, car) {
    칸.querySelectorAll('[data-only="car"]').forEach(el => { el.hidden = car !== 'yes'; });
  }

  function 고른값(칸, name) {
    const g = 칸.querySelector('[data-pickgroup="' + name + '"]');
    if (!g) return '';
    const on = g.querySelector('.check.on');
    return on ? on.getAttribute('data-pick') : '';
  }

  async function send(form) {
    const r = ROWS.filter(x => x.form === form)[0];
    const 칸 = BOX.querySelector('[data-mu="' + form + '"]');
    if (!r || !칸) return;
    const 값 = el => (칸.querySelector(el) || {}).value || '';
    const v = {
      attend: 고른값(칸, 'attend'),
      car: 고른값(칸, 'car'),
      seats: 값('[name="seats"]'),
      area: 값('[name="area"]')
    };
    if (!v.attend) return toast('참석 여부를 골라 주세요', 'err');
    if (v.attend === 'yes' && r.ask_car && !v.car) return toast(WHY.car, 'err');
    if (v.attend === 'yes' && v.car === 'yes') {
      const n = parseInt(String(v.seats).trim(), 10);
      if (!n) return toast(WHY.seats, 'err');
      if (n < 1 || n > 9) return toast(WHY.seatsrange, 'err');
    }
    if (v.attend === 'yes' && r.ask_area && !String(v.area).trim()) return toast(WHY.area, 'err');

    const btn = 칸.querySelector('[data-msend]');
    if (btn) { btn.disabled = true; btn.textContent = '보내는 중…'; }
    let res = null;
    try { res = await save(form, v); } catch (e) { res = null; }
    if (!res || !res.ok) {
      if (btn) { btn.disabled = false; btn.textContent = '보내기'; }
      return toast((res && WHY[res.why]) || '보내지 못했어요. 잠시 뒤 다시 해 주세요', 'err');
    }

    /* 숫자와 내 답을 다시 받아 온다.
       ★ 다시 그릴 때 **다른 조사에 적던 것이 날아가지 않게** 먼저 적어 둔다 */
    const 적던것 = 담아두기();
    try {
      const rows = await list();
      if (rows && rows.length) ROWS = rows.filter(x => FORMS[x.form]);
    } catch (e) {
      const me = ROWS.filter(x => x.form === form)[0];
      if (me) me.mine = {
        attend: v.attend, car: v.car || null,
        seats: v.seats ? parseInt(String(v.seats).trim(), 10) : null,
        area: v.area || null
      };
    }
    보낸것[form] = true;
    paint();
    되살리기(적던것);
    자리로(form);
    if (window.UI && UI.cheer) { try { UI.cheer(); } catch (e) { } }
  }

  /* 다시 그리기 전에 **보내지 않은** 조사에 적던 것을 담아 둔다 */
  function 담아두기() {
    const 짐 = {};
    BOX.querySelectorAll('[data-mu]').forEach(칸 => {
      짐[칸.getAttribute('data-mu')] = {
        attend: 고른값(칸, 'attend'),
        car: 고른값(칸, 'car'),
        seats: (칸.querySelector('[name="seats"]') || {}).value || '',
        area: (칸.querySelector('[name="area"]') || {}).value || ''
      };
    });
    return 짐;
  }

  function 되살리기(짐) {
    Object.keys(짐 || {}).forEach(form => {
      if (보낸것[form]) return;                 /* 보낸 것은 고마워요 화면이다 */
      const 칸 = BOX.querySelector('[data-mu="' + form + '"]');
      if (!칸) return;
      const v = 짐[form];
      ['attend', 'car'].forEach(name => {
        if (!v[name]) return;
        const g = 칸.querySelector('[data-pickgroup="' + name + '"]');
        if (!g) return;
        g.querySelectorAll('.check').forEach(x =>
          x.classList.toggle('on', x.getAttribute('data-pick') === v[name]));
      });
      const se = 칸.querySelector('[name="seats"]'); if (se && v.seats) se.value = v.seats;
      const ar = 칸.querySelector('[name="area"]'); if (ar && v.area) ar.value = v.area;
      뒷질문(칸, 고른값(칸, 'attend'));
    });
  }

  window.Meetup = { FORMS, list, save, cards, card, open };
})();
