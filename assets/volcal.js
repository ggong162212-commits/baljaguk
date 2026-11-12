/* ============================================================
   신청한 봉사를 내 캘린더에 담기
   ------------------------------------------------------------
   · 신청한 봉사에만 단추가 붙는다 — 신청 전 카드에는 없다
     (봉사 탭 카드 · 신청자 시트)
   · 아이폰 — .ics 를 그 자리에서 만들어(Blob) 연다.
     그러면 「캘린더에 추가」 화면이 떠서 추가만 누르면 된다
   · 안드로이드 — 구글 캘린더 「일정 만들기」 주소로 연다.
     「저장」만 누르면 된다
   · 모르는 기기 — .ics 로 간다
   · 카카오톡 안(UA 에 KAKAOTALK)에서는 .ics 가 잘 안 열린다.
     바로 열지 않고 「Safari/Chrome 으로 열어 주세요」 안내 시트를
     띄우고 주소 복사 단추를 같이 둔다
   · 구독 캘린더(webcal)·서버 주소는 만들지 않는다.
     시간이 바뀌면 지금처럼 **앱 알림**으로 알린다
   · 서버는 건드리지 않는다 — 화면 코드만으로 돈다

   쓰는 법
     VolCal.remember(봉사목록, 보호소목록)   // 봉사 탭을 그릴 때 한 번
     VolCal.btn(봉사id, { block: true })     // 단추 HTML
     VolCal.add(봉사id)                      // 눌렀을 때 (단추는 저절로 걸린다)
   ============================================================ */
(function () {
  const EV = Object.create(null);   /* 봉사 id → 봉사 */
  let PLACES = [];                  /* 보호소 안내 (이름 → 주소) */

  /* ---------- 기기 ---------- */
  const ua = () => String(navigator.userAgent || '');
  const isKakao = () => /KAKAOTALK/i.test(ua());
  const isAndroid = () => /Android/i.test(ua());
  /* 아이패드는 UA 에 iPad 가 안 나올 때가 있다 — 터치 되는 맥으로 보인다 */
  const isIOS = () => /iPhone|iPad|iPod/i.test(ua()) ||
    (/Macintosh/i.test(ua()) && (navigator.maxTouchPoints || 0) > 1);

  /* ---------- 때 ----------
     · DB 에 있는 것: 날짜(date) · 시작 시각(start_time).
       **끝나는 시각은 DB 에 없다** — 없는 것을 지어내지 않고
       +3시간으로 두되, 이 자리에 그렇게 적어 둔다.
     · 시작 시각이 없으면 종일 일정으로 한다. */
  const 두자리 = n => String(n).padStart(2, '0');

  function 찍기(ymd, 분) {
    const [y, m, d] = ymd.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d, 0, 0) + 분 * 60000);
    return {
      날짜: t.getUTCFullYear() + 두자리(t.getUTCMonth() + 1) + 두자리(t.getUTCDate()),
      시각: 두자리(t.getUTCHours()) + 두자리(t.getUTCMinutes()) + '00'
    };
  }

  function when(ev) {
    const d = String((ev && ev.date) || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
    const m = /^(\d{1,2}):(\d{2})/.exec(String((ev && ev.start_time) || '').trim());
    if (!m) {
      /* 종일 — 끝나는 날은 **다음 날**로 적는다 (달력 규칙) */
      const s = 찍기(d, 0), e = 찍기(d, 24 * 60);
      return { allDay: true, s: s.날짜, e: e.날짜 };
    }
    const 시작 = (+m[1]) * 60 + (+m[2]);
    const a = 찍기(d, 시작), b = 찍기(d, 시작 + 180);   /* 끝 시각이 없어 +3시간 */
    return {
      allDay: false,
      s: a.날짜 + 'T' + a.시각,
      e: b.날짜 + 'T' + b.시각
    };
  }

  /* ---------- 일정 내용 ---------- */
  const 제목 = ev => '발자국 봉사 · ' + String((ev && ev.place) || '봉사');

  function 곳(ev) {
    const nm = String((ev && ev.place) || '').trim();
    const hit = PLACES.find(p => p && String(p.name).trim() === nm);
    const addr = hit ? String(hit.address || '').trim() : '';
    return addr || nm;
  }

  function 앱주소(ev) {
    try { return new URL('me.html#vol=' + encodeURIComponent(ev.id), location.href).href; }
    catch (e) { return 'me.html#vol=' + ev.id; }
  }

  const 메모 = ev => 앱주소(ev) + '\n시간이 바뀌면 앱 알림으로 알려 드려요';

  /* ---------- .ics ---------- */
  /* 한국은 1988년을 끝으로 서머타임이 없다 — 늘 +09:00 한 칸이면 된다.
     VTIMEZONE 을 같이 넣어야 TZID 가 규격에 맞는다. */
  const TZ = [
    'BEGIN:VTIMEZONE',
    'TZID:Asia/Seoul',
    'BEGIN:STANDARD',
    'DTSTART:19881009T030000',
    'TZOFFSETFROM:+1000',
    'TZOFFSETTO:+0900',
    'TZNAME:KST',
    'END:STANDARD',
    'END:VTIMEZONE'
  ];

  /* 글자 값에 쓰면 안 되는 것들을 피한다 */
  const txt = s => String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

  const 바이트 = s => {
    try { return new TextEncoder().encode(s).length; }
    catch (e) {
      /* 아주 오래된 브라우저 — 아스키는 1, 나머지는 3으로 어림잡는다 */
      let n = 0;
      for (const ch of String(s)) n += ch.charCodeAt(0) < 128 ? 1 : 3;
      return n;
    }
  };

  /* 한 줄은 75바이트까지 — 넘으면 다음 줄에 공백 한 칸을 두고 잇는다.
     한글은 한 글자가 3바이트라 글자 수로 세면 안 된다. */
  function fold(line) {
    if (바이트(line) <= 75) return line;
    let out = '', cur = 0;
    for (const ch of String(line)) {
      const n = 바이트(ch);
      if (cur + n > 75) { out += '\r\n '; cur = 1; }
      out += ch; cur += n;
    }
    return out;
  }

  function 지금() {
    const t = new Date();
    return t.getUTCFullYear() + 두자리(t.getUTCMonth() + 1) + 두자리(t.getUTCDate()) + 'T' +
      두자리(t.getUTCHours()) + 두자리(t.getUTCMinutes()) + 두자리(t.getUTCSeconds()) + 'Z';
  }

  function ics(ev) {
    const w = when(ev);
    if (!w) return null;
    const 이름 = 제목(ev), 자리 = 곳(ev);
    const L = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//baljaguk//volunteer//KO',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH'
    ].concat(w.allDay ? [] : TZ).concat([
      'BEGIN:VEVENT',
      /* 봉사 id 로 고정 — 같은 봉사를 두 번 담아도 한 일정으로 보인다 */
      'UID:vol-' + String(ev.id) + '@baljaguk',
      'DTSTAMP:' + 지금(),
      w.allDay ? 'DTSTART;VALUE=DATE:' + w.s : 'DTSTART;TZID=Asia/Seoul:' + w.s,
      w.allDay ? 'DTEND;VALUE=DATE:' + w.e : 'DTEND;TZID=Asia/Seoul:' + w.e,
      'SUMMARY:' + txt(이름),
      자리 ? 'LOCATION:' + txt(자리) : null,
      'DESCRIPTION:' + txt(메모(ev)),
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:' + txt(이름),
      /* 전날 알림. 종일 일정은 -P1D 면 **자정**에 울려서 -PT14H(전날 오전 10시) */
      'TRIGGER:' + (w.allDay ? '-PT14H' : '-P1D'),
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR'
    ]).filter(Boolean);
    return L.map(fold).join('\r\n') + '\r\n';
  }

  /* ---------- 구글 캘린더 주소 ---------- */
  function gcal(ev) {
    const w = when(ev);
    if (!w) return null;
    const q = {
      action: 'TEMPLATE',
      text: 제목(ev),
      dates: w.s + '/' + w.e,
      details: 메모(ev),
      location: 곳(ev)
    };
    /* 시각이 있을 때만 시간대를 붙인다 (종일은 날짜 그대로) */
    if (!w.allDay) q.ctz = 'Asia/Seoul';
    return 'https://calendar.google.com/calendar/render?' +
      Object.keys(q).filter(k => q[k]).map(k => k + '=' + encodeURIComponent(q[k])).join('&');
  }

  /* ---------- 열기 ---------- */
  function openIcs(ev) {
    const body = ics(ev);
    if (!body) return false;
    let url;
    try {
      url = URL.createObjectURL(new Blob([body], { type: 'text/calendar;charset=utf-8' }));
    } catch (e) { return false; }
    if (isIOS()) {
      /* 아이폰은 이 주소로 가면 「캘린더에 추가」 화면이 뜬다.
         download 로는 파일만 받아지고 캘린더가 안 열린다. */
      location.href = url;
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'baljaguk-' + String(ev.date || '').replace(/-/g, '') + '.ics';
      document.body.appendChild(a); a.click(); a.remove();
    }
    setTimeout(() => { try { URL.revokeObjectURL(url); } catch (e) { } }, 20000);
    return true;
  }

  function kakaoSheet(ev) {
    const 주소 = 앱주소(ev);
    UI.sheet({
      title: '캘린더에 담기',
      body:
        '<p style="margin:0 0 12px">카카오톡 안에서는 캘린더가 열리지 않아요.<br>' +
        'Safari 나 Chrome 으로 열어 주세요.</p>' +
        '<div class="pill-note" style="word-break:break-all">' + UI.esc(주소) + '</div>' +
        '<p class="mut sm" style="margin-top:10px">주소를 복사해 브라우저 주소창에 붙여 넣고, ' +
        '거기서 다시 「내 캘린더에 추가」를 눌러 주세요.</p>',
      foot: '<button class="btn primary block" type="button" data-volcopy>' +
        window.ic('link') + '<span>주소 복사</span></button>',
      onMount(ov) {
        const b = ov.querySelector('[data-volcopy]');
        if (b) b.onclick = () => UI.copy(주소, '주소를 복사했어요');
      }
    });
  }

  /* ---------- 바깥에서 쓰는 것 ---------- */
  function remember(list, places) {
    (list || []).forEach(e => { if (e && e.id) EV[String(e.id)] = e; });
    if (Array.isArray(places)) PLACES = places;
  }

  function btn(id, opts) {
    const o = opts || {};
    return '<button class="btn soft' + (o.block ? ' block' : '') + '" type="button"' +
      (o.style ? ' style="' + o.style + '"' : '') +
      ' data-volcal="' + UI.esc(String(id)) + '">' +
      window.ic('calendarPlus') + '<span>내 캘린더에 추가</span></button>';
  }

  function add(id) {
    const ev = EV[String(id)];
    if (!ev) { UI.toast('봉사 정보를 찾지 못했어요. 새로고침해 주세요', 'err'); return; }
    if (!when(ev)) { UI.toast('날짜가 없어서 캘린더에 담을 수 없어요', 'err'); return; }
    if (isKakao()) return kakaoSheet(ev);
    if (isAndroid()) {
      const u = gcal(ev);
      if (u) { window.open(u, '_blank', 'noopener'); return; }
    }
    if (!openIcs(ev)) UI.toast('캘린더를 열지 못했어요', 'err');
  }

  /* 단추는 카드에도 시트에도 붙는다 — 문서 하나에 한 번만 걸어 둔다 */
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('[data-volcal]');
    if (!b) return;
    e.preventDefault();
    add(b.getAttribute('data-volcal'));
  });

  window.VolCal = { remember, btn, add, ics, gcal, when, _places: () => PLACES };
})();
