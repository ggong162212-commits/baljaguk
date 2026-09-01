/* ============================================================
   데이터 계층
   · CONFIG 에 Supabase 값이 있으면 실제 DB
   · 없으면 '체험 모드' (내 브라우저 localStorage) — 화면/기능은 동일
   ============================================================ */
(function () {
  const C = window.CONFIG || {};
  const HAS_SB = !!(C.SUPABASE_URL && C.SUPABASE_ANON_KEY);
  const SKEY = 'baljaguk.session';
  const DKEY = 'baljaguk.demo';
  const uid = () => 'id-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const today = () => new Date().toISOString().slice(0, 10);

  /* ---------------- 체험 모드 저장소 ---------------- */
  function seed() {
    const d = (n) => { const t = new Date(); t.setDate(t.getDate() + n); return t.toISOString().slice(0, 10); };
    const DEPT = (C.FALLBACK && C.FALLBACK.department) || '산업경영융합학과';
    const m = (name, dept, sid, role, status, joined, phone) =>
      ({ id: uid(), name, department: dept, student_id: sid, phone, role, status, joined_on: joined, emoji: '', memo: '', created_at: new Date().toISOString() });
    const members = [
      m('김하은', DEPT, '22학번', 'admin', 'active', '2024-03-12', '010-2211-3345'),
      m('이준영', DEPT, '21학번', 'admin', 'active', '2023-09-05', '010-8842-1190'),
      m('박서연', DEPT, '23학번', 'member', 'active', '2024-06-18', '010-3320-7781'),
      m('최민재', DEPT, '24학번', 'member', 'active', '2024-09-01', '010-5567-2214'),
      m('정예린', DEPT, '22학번', 'member', 'active', '2023-04-22', '010-9901-4432'),
      m('한지우', DEPT, '24학번', 'member', 'active', '2025-03-04', '010-4412-6678'),
      m('오세훈', DEPT, '23학번', 'member', 'active', '2025-03-04', '010-7788-1123')
    ];
    const events = [
      { id: uid(), date: d(-21), title: '천보금 보호소 정기봉사', place: '경기 광주 천보금 보호소', start_time: '10:00', note: '견사 청소 · 산책', created_at: new Date().toISOString() },
      { id: uid(), date: d(-7), title: '유기묘 임보처 이동봉사', place: '서울 성북', start_time: '13:00', note: '', created_at: new Date().toISOString() },
      { id: uid(), date: d(6), title: '3월 정기봉사', place: '천보금 보호소', start_time: '10:00', note: '신입 부원 첫 봉사', created_at: new Date().toISOString() }
    ];
    const att = [];
    const push = (ev, mem, h) => att.push({ id: uid(), event_id: ev, member_id: mem, hours: h, created_at: new Date().toISOString() });
    [0, 1, 2, 3, 5].forEach(i => push(events[0].id, members[i].id, 4));
    [0, 1, 2, 6].forEach(i => push(events[1].id, members[i].id, 3));
    const apps = [
      { id: uid(), created_at: new Date(Date.now() - 864e5).toISOString(), name: '윤소민', student_id: '25학번', department: DEPT, phone: '010-2244-8890', motivation: '어릴 때부터 강아지를 키웠고, 보호소 봉사를 꾸준히 해보고 싶어서 지원합니다.', receipt: '', status: 'pending', note: '', reviewed_at: null },
      { id: uid(), created_at: new Date(Date.now() - 3600e3 * 5).toISOString(), name: '강태리', student_id: '24학번', department: DEPT, phone: '010-6677-1102', motivation: '유기동물 문제에 관심이 많아 실제로 도움이 되는 활동을 하고 싶습니다.', receipt: '', status: 'pending', note: '', reviewed_at: null }
    ];
    const fin = [
      { id: uid(), date: d(-40), kind: 'income', category: '2기 동아리비 (7명)', amount: 105000, memo: '', member_id: null, created_at: new Date().toISOString() },
      { id: uid(), date: d(-20), kind: 'expense', category: '봉사물품 (사료·배변패드)', amount: 38400, memo: '', member_id: null, created_at: new Date().toISOString() },
      { id: uid(), date: d(-8), kind: 'expense', category: '봉사물품 (미용도구)', amount: 24000, memo: '', member_id: null, created_at: new Date().toISOString() }
    ];
    return {
      settings: Object.assign({ id: 1, form_open: true, form_open_at: null, form_close_at: null, capacity: null, closed_message: '이번 기수 모집이 마감되었어요. 다음 모집 소식을 기다려주세요!' }, C.FALLBACK),
      applications: apps, members, events, attendance: att, finance: fin,
      password: C.DEMO_PASSWORD || '260324'
    };
  }
  function demoRead() {
    try {
      const raw = localStorage.getItem(DKEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { }
    const s = seed(); localStorage.setItem(DKEY, JSON.stringify(s)); return s;
  }
  function demoWrite(d) { localStorage.setItem(DKEY, JSON.stringify(d)); return d; }

  /* ---------------- Supabase ---------------- */
  let session = null;
  try { session = JSON.parse(localStorage.getItem(SKEY) || 'null'); } catch (e) { }

  async function auth(path, body) {
    const r = await fetch(C.SUPABASE_URL + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: C.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.error || '로그인에 실패했어요');
    return j;
  }
  async function refresh() {
    if (!session || !session.refresh_token) return false;
    try {
      const j = await auth('token?grant_type=refresh_token', { refresh_token: session.refresh_token });
      session = j; localStorage.setItem(SKEY, JSON.stringify(j)); return true;
    } catch (e) { session = null; localStorage.removeItem(SKEY); return false; }
  }
  async function rest(path, opts, retry) {
    opts = opts || {};
    const h = {
      apikey: C.SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + ((session && session.access_token) || C.SUPABASE_ANON_KEY),
      'Content-Type': 'application/json'
    };
    if (opts.prefer) h.Prefer = opts.prefer;
    const r = await fetch(C.SUPABASE_URL + '/rest/v1/' + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    if (r.status === 401 && !retry && session) { if (await refresh()) return rest(path, opts, true); }
    const txt = await r.text();
    let j = null; try { j = txt ? JSON.parse(txt) : null; } catch (e) { j = null; }
    if (!r.ok) {
      const msg = (j && (j.message || j.hint)) || ('요청 실패 (' + r.status + ')');
      const err = new Error(msg); err.status = r.status; throw err;
    }
    return j;
  }

  const enc = encodeURIComponent;
  function table(name, order) {
    if (HAS_SB) {
      return {
        list: () => rest(name + '?select=*' + (order ? '&order=' + order : '')),
        // 비로그인(신청자)은 SELECT 권한이 없으므로 return=minimal 로 넣는다
        create: (o) => session
          ? rest(name, { method: 'POST', body: o, prefer: 'return=representation' }).then(r => (r && r[0]) || o)
          : rest(name, { method: 'POST', body: o, prefer: 'return=minimal' }).then(() => o),
        update: (id, p) => rest(name + '?id=eq.' + enc(id), { method: 'PATCH', body: p, prefer: 'return=representation' }).then(r => r && r[0]),
        remove: (id) => rest(name + '?id=eq.' + enc(id), { method: 'DELETE' })
      };
    }
    return {
      list: async () => {
        const d = demoRead(); const rows = (d[name] || []).slice();
        if (order) {
          const [col, dir] = order.split('.');
          rows.sort((a, b) => String(a[col] ?? '').localeCompare(String(b[col] ?? '')) * (dir === 'desc' ? -1 : 1));
        }
        return rows;
      },
      create: async (o) => {
        const d = demoRead(); const row = Object.assign({ id: uid(), created_at: new Date().toISOString() }, o);
        d[name] = d[name] || []; d[name].push(row); demoWrite(d); return row;
      },
      update: async (id, p) => {
        const d = demoRead(); const row = (d[name] || []).find(x => x.id === id);
        if (row) Object.assign(row, p); demoWrite(d); return row;
      },
      remove: async (id) => { const d = demoRead(); d[name] = (d[name] || []).filter(x => x.id !== id); demoWrite(d); }
    };
  }

  /* ---------------- 공개 API ---------------- */
  const DB = {
    mode: HAS_SB ? 'supabase' : 'demo',
    isDemo: () => !HAS_SB,
    isAuthed: () => HAS_SB ? !!(session && session.access_token) : localStorage.getItem('baljaguk.demoAuth') === '1',

    async login(password) {
      if (!HAS_SB) {
        const d = demoRead();
        if (String(password) !== String(d.password)) throw new Error('비밀번호가 맞지 않아요');
        localStorage.setItem('baljaguk.demoAuth', '1'); return true;
      }
      const j = await auth('token?grant_type=password', { email: C.ADMIN_EMAIL, password: String(password) });
      session = j; localStorage.setItem(SKEY, JSON.stringify(j)); return true;
    },
    logout() {
      if (HAS_SB) { session = null; localStorage.removeItem(SKEY); }
      else localStorage.removeItem('baljaguk.demoAuth');
    },
    async changePassword(next) {
      if (!HAS_SB) { const d = demoRead(); d.password = String(next); demoWrite(d); return true; }
      const r = await fetch(C.SUPABASE_URL + '/auth/v1/user', {
        method: 'PUT',
        headers: { apikey: C.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + session.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: String(next) })
      });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.msg || '비밀번호를 바꾸지 못했어요'); }
      return true;
    },

    settings: {
      async get() {
        if (!HAS_SB) return demoRead().settings;
        const rows = await rest('club_settings?select=*&id=eq.1');
        return (rows && rows[0]) || Object.assign({ id: 1, form_open: true }, C.FALLBACK);
      },
      async save(patch) {
        if (!HAS_SB) { const d = demoRead(); Object.assign(d.settings, patch); demoWrite(d); return d.settings; }
        const rows = await rest('club_settings?id=eq.1', { method: 'PATCH', body: patch, prefer: 'return=representation' });
        return rows && rows[0];
      }
    },

    applications: table('applications', 'created_at.desc'),
    members: table('members', 'created_at.asc'),
    events: table('events', 'date.desc'),
    attendance: table('attendance'),
    finance: table('finance', 'date.desc'),

    /* 신청 접수 (비로그인 상태에서 호출) */
    async apply(form) {
      return DB.applications.create({
        name: form.name, student_id: form.student_id, department: form.department,
        phone: form.phone, motivation: form.motivation, receipt: form.receipt || '', status: 'pending'
      });
    },

    /* 승인 → 구성원 생성 (+ 회비 수입 기록) */
    async approve(app, opts) {
      opts = opts || {};
      const member = await DB.members.create({
        name: app.name, student_id: app.student_id, department: app.department, phone: app.phone,
        role: 'member', status: 'active', joined_on: today(), application_id: app.id, memo: ''
      });
      await DB.applications.update(app.id, { status: 'approved', reviewed_at: new Date().toISOString() });
      if (opts.fee > 0) {
        await DB.finance.create({
          date: today(), kind: 'income', category: app.name + ' 동아리비', amount: Number(opts.fee),
          memo: '', member_id: member.id
        });
      }
      return member;
    },
    async reject(app, reason) {
      return DB.applications.update(app.id, { status: 'rejected', note: reason || '', reviewed_at: new Date().toISOString() });
    },

    /* 일정별 참여 저장: rows = [{member_id, hours}] */
    async saveAttendance(eventId, rows) {
      const cur = (await DB.attendance.list()).filter(a => a.event_id === eventId);
      const keep = new Set(rows.map(r => r.member_id));
      for (const a of cur) if (!keep.has(a.member_id)) await DB.attendance.remove(a.id);
      for (const r of rows) {
        const ex = cur.find(a => a.member_id === r.member_id);
        if (ex) { if (Number(ex.hours) !== Number(r.hours)) await DB.attendance.update(ex.id, { hours: Number(r.hours) || 0 }); }
        else await DB.attendance.create({ event_id: eventId, member_id: r.member_id, hours: Number(r.hours) || 0 });
      }
    },

    /* ------------------------------------------------------------
       실시간 동기화
       · Supabase: Realtime 웹소켓 구독 (되면 즉시, 안 되면 폴링)
       · 체험 모드: 같은 브라우저의 다른 탭과 동기화
       onChange() 가 불리면 화면 쪽에서 다시 불러오면 됩니다.
       ------------------------------------------------------------ */
    live(onChange, pollMs) {
      let stopped = false;
      let interval = pollMs || 7000;
      let timer = null;

      const fire = () => { if (!stopped && !document.hidden) onChange(); };
      const loop = () => { clearInterval(timer); timer = setInterval(fire, interval); };
      loop();
      document.addEventListener('visibilitychange', () => { if (!document.hidden) fire(); });
      window.addEventListener('focus', fire);

      if (!HAS_SB) {
        window.addEventListener('storage', e => { if (e.key === DKEY) fire(); });
        return () => { stopped = true; clearInterval(timer); };
      }

      // --- Supabase Realtime (실패해도 위 폴링이 계속 돌아갑니다) ---
      let ws = null, hb = null, tries = 0;
      const connect = () => {
        if (stopped || tries > 3) return;
        tries++;
        try {
          const base = C.SUPABASE_URL.replace(/^http/, 'ws');
          ws = new WebSocket(base + '/realtime/v1/websocket?apikey=' + encodeURIComponent(C.SUPABASE_ANON_KEY) + '&vsn=1.0.0');
        } catch (e) { return; }
        const topic = 'realtime:baljaguk';
        let ref = 0;
        const send = (event, payload) => { try { ws.send(JSON.stringify({ topic, event, payload: payload || {}, ref: String(++ref) })); } catch (e) { } };

        ws.onopen = () => {
          tries = 0;
          send('phx_join', {
            config: {
              broadcast: { self: false }, presence: { key: '' },
              postgres_changes: [{ event: '*', schema: 'public' }]
            },
            access_token: session && session.access_token
          });
          if (session && session.access_token) send('access_token', { access_token: session.access_token });
          clearInterval(hb);
          hb = setInterval(() => {
            try { ws.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++ref) })); } catch (e) { }
          }, 25000);
          interval = 25000; loop();   // 실시간이 붙었으면 폴링은 느슨하게
        };
        ws.onmessage = (m) => {
          let msg = null; try { msg = JSON.parse(m.data); } catch (e) { return; }
          if (msg && msg.event === 'postgres_changes') fire();
        };
        const down = () => {
          clearInterval(hb);
          interval = 7000; loop();    // 실시간이 끊기면 다시 촘촘한 폴링으로
          if (!stopped) setTimeout(connect, 4000);
        };
        ws.onclose = down;
        ws.onerror = () => { try { ws.close(); } catch (e) { } };
      };
      connect();

      return () => { stopped = true; clearInterval(timer); clearInterval(hb); try { ws && ws.close(); } catch (e) { } };
    },

    resetDemo() { localStorage.removeItem(DKEY); localStorage.removeItem('baljaguk.demoAuth'); },
    uid, today
  };

  /* 폼 접수 가능 여부 (예약 마감 포함) */
  DB.formState = function (s, approvedCount) {
    const now = Date.now();
    if (s.form_open === false) return { open: false, why: 'manual' };
    if (s.form_open_at && now < Date.parse(s.form_open_at)) return { open: false, why: 'before', at: s.form_open_at };
    if (s.form_close_at && now >= Date.parse(s.form_close_at)) return { open: false, why: 'closed', at: s.form_close_at };
    if (s.capacity && approvedCount != null && approvedCount >= s.capacity) return { open: false, why: 'full' };
    return { open: true, until: s.form_close_at || null };
  };

  window.DB = DB;
})();
