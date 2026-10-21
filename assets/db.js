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
      m('김하은', DEPT, '22', 'admin', 'active', '2024-03-12', '010-2211-3345'),
      m('이준영', DEPT, '21', 'admin', 'active', '2023-09-05', '010-8842-1190'),
      m('박서연', DEPT, '23', 'member', 'active', '2024-06-18', '010-3320-7781'),
      m('최민재', DEPT, '24', 'member', 'active', '2024-09-01', '010-5567-2214'),
      m('정예린', DEPT, '22', 'member', 'active', '2023-04-22', '010-9901-4432'),
      m('한지우', DEPT, '24', 'member', 'active', '2025-03-04', '010-4412-6678'),
      m('오세훈', DEPT, '23', 'member', 'active', '2025-03-04', '010-7788-1123')
    ];
    const events = [
      { id: uid(), date: d(-21), title: '지난달 봉사', place: '천보금 보호소', start_time: null, note: '', confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: uid(), date: d(-7), title: '지난주 봉사', place: '천보금 보호소', start_time: null, note: '', confirmed_at: new Date().toISOString(), created_at: new Date().toISOString() },
      { id: uid(), date: d(6), title: '다음 봉사', place: '천보금 보호소', start_time: null, note: '', created_at: new Date().toISOString() }
    ];
    const att = [];
    const push = (ev, mem, h) => att.push({ id: uid(), event_id: ev, member_id: mem, hours: h, created_at: new Date().toISOString() });
    [0, 1, 2, 3, 5].forEach(i => push(events[0].id, members[i].id, 4));
    [0, 1, 2, 6].forEach(i => push(events[1].id, members[i].id, 3));
    const apps = [
      { id: uid(), created_at: new Date(Date.now() - 864e5).toISOString(), name: '윤소민', student_id: '25', department: DEPT, phone: '010-2244-8890', motivation: '어릴 때부터 강아지를 키웠고, 보호소 봉사를 꾸준히 해보고 싶어서 지원합니다.', receipt: '', status: 'pending', note: '', reviewed_at: null },
      { id: uid(), created_at: new Date(Date.now() - 3600e3 * 5).toISOString(), name: '강태리', student_id: '24', department: DEPT, phone: '010-6677-1102', motivation: '유기동물 문제에 관심이 많아 실제로 도움이 되는 활동을 하고 싶습니다.', receipt: '', status: 'pending', note: '', reviewed_at: null }
    ];
    const fin = [
      { id: uid(), date: d(-40), kind: 'income', category: '2기 동아리비 (7명)', amount: 105000, memo: '', member_id: null, created_at: new Date().toISOString() },
      { id: uid(), date: d(-20), kind: 'expense', category: '봉사물품 (사료·배변패드)', amount: 38400, memo: '', member_id: null, created_at: new Date().toISOString() },
      { id: uid(), date: d(-8), kind: 'expense', category: '봉사물품 (미용도구)', amount: 24000, memo: '', member_id: null, created_at: new Date().toISOString() }
    ];
    const camp = {
      id: uid(), created_at: new Date().toISOString(),
      title: '펫발란스 X 발자국 사료 후원', partner: '펫발란스',
      goal: 1000000, starts_on: d(-10), ends_on: d(20),
      note: '모인 금액은 전액 보호소 사료 구입에 씁니다.', status: 'open'
    };
    const dons = [
      { id: uid(), created_at: new Date().toISOString(), campaign_id: camp.id, member_id: members[0].id, donor_name: null, amount: 30000, date: d(-8) },
      { id: uid(), created_at: new Date().toISOString(), campaign_id: camp.id, member_id: members[2].id, donor_name: null, amount: 20000, date: d(-6) },
      { id: uid(), created_at: new Date().toISOString(), campaign_id: camp.id, member_id: null, donor_name: '김보호 (졸업생)', amount: 100000, date: d(-3) }
    ];
    const TOPIC = C.SURVEY_TOPIC || '2026-2';
    const sv = (name, station, opinion, party) =>
      ({ id: uid(), created_at: new Date().toISOString(), topic: TOPIC, name, station, opinion, party, note: '' });
    const survey = [
      sv('박서연', '건대입구역', '집 근처에서 봉사할 수 있으면 좋을 것 같아요.', 'yes'),
      sv('최민재', '수원역', '여러 보호소를 경험해볼 수 있어서 기대돼요.', 'maybe'),
      sv('정예린', '홍대입구역', '매번 같이 봉사하던 사람들과 못 만나게 될까 봐 아쉬워요.', 'yes')
    ];
    /* ---------- 커뮤니티 예시 ----------
       체험 모드로 처음 들어온 사람이 빈 화면을 보지 않게,
       매뉴얼 캡처가 늘 같은 모습이게 — 네 가지만 담백하게 둔다. */
    const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
    const me0 = members[0].id;
    const m1 = (members[1] || members[0]).id;
    const m2 = (members[2] || members[0]).id;

    const cAnimals = [
      { id: 'seed-an1', place: '금파하우스', name: '단비', adopted_at: null,
        created_at: ago(9000) },
      { id: 'seed-an2', place: '금파하우스', name: '보리', adopted_at: null,
        created_at: ago(9000) },
      { id: 'seed-an3', place: '천사들의 보금자리', name: '코코', adopted_at: null,
        created_at: ago(9000) }
    ];

    const cPosts = [
      { id: 'seed-notice', created_at: ago(180), author_id: me0, type: 'notice',
        event_id: null, place: null, date: null,
        body: '11월 정기모임은 11/8(토) 오후 2시, 학생회관 3층이에요. 다 같이 봐요!',
        pinned: true, hidden: false, edited_at: null, insta_ok: false,
        is_question: false, best_comment_id: null, solved_at: null },

      { id: 'seed-q', created_at: ago(300), author_id: m1, type: 'free',
        event_id: null, place: null, date: null,
        body: '처음 봉사 가는데 뭐 입고 가야 하나요?',
        pinned: false, hidden: false, edited_at: null, insta_ok: false,
        is_question: true, best_comment_id: 'seed-a1', solved_at: ago(240) },

      { id: 'seed-review', created_at: ago(600), author_id: m2, type: 'review',
        event_id: null, place: '금파하우스', date: today(),
        body: '단비가 오늘 산책을 잘 따라와줬어요. 다음에 또 보고 싶어요!',
        pinned: false, hidden: false, edited_at: null, insta_ok: true,
        is_question: false, best_comment_id: null, solved_at: null },

      { id: 'seed-free', created_at: ago(900), author_id: me0, type: 'free',
        event_id: null, place: null, date: null,
        body: '다음 간식 사러 갈 건데 뭐가 좋을까요?',
        pinned: false, hidden: false, edited_at: null, insta_ok: false,
        is_question: false, best_comment_id: null, solved_at: null }
    ];

    const cComments = [
      { id: 'seed-a1', created_at: ago(280), post_id: 'seed-q', parent_id: null,
        author_id: m2, body: '편한 운동복이면 돼요. 목장갑은 보호소에 있어요!',
        hidden: false, edited_at: null },
      { id: 'seed-a2', created_at: ago(260), post_id: 'seed-q', parent_id: null,
        author_id: me0, body: '신발은 더러워져도 되는 걸로 신으세요',
        hidden: false, edited_at: null }
    ];

    const cOpts = [
      { id: 'seed-o1', post_id: 'seed-free', label: '수제 육포', sort: 0 },
      { id: 'seed-o2', post_id: 'seed-free', label: '치즈 스틱', sort: 1 },
      { id: 'seed-o3', post_id: 'seed-free', label: '단호박 큐브', sort: 2 }
    ];

    return {
      posts: cPosts,
      comments: cComments,
      post_photos: [],
      reactions: [
        { id: 'seed-r1', post_id: 'seed-review', member_id: m1, kind: 'heart',
          created_at: ago(500) }
      ],
      polls: [{
        post_id: 'seed-free', question: '다음 간식 뭐가 좋을까요?',
        multi: false, anonymous: false, closes_at: null, closed_at: null,
        reveal_at: null, revealed_at: null, answer_option_id: null
      }],
      poll_options: cOpts,
      poll_votes: [
        { id: 'seed-v1', post_id: 'seed-free', option_id: 'seed-o2', member_id: m1,
          created_at: ago(800) },
        { id: 'seed-v2', post_id: 'seed-free', option_id: 'seed-o1', member_id: m2,
          created_at: ago(700) }
      ],
      animals: cAnimals,
      post_animals: [{ post_id: 'seed-review', animal_id: 'seed-an1' }],
      campaigns: [camp], donations: dons, survey_responses: survey,
      settings: Object.assign({ id: 1, form_open: true, place: '천보금 보호소', places: [
        { name: '천사들의 보금자리', area: '', address: '', credit: 2, unit: 'kg' },
        { name: '금파하우스', area: '', address: '', credit: 2000, unit: 'won' },
        { name: '동물보호센터 다솜', area: '', address: '', credit: 2000, unit: 'won' },
        { name: '땅코볼별', area: '', address: '', credit: 2000, unit: 'won' }
      ], form_open_at: null, form_close_at: null, capacity: null, closed_message: '이번 기수 모집이 마감되었어요. 다음 모집 소식을 기다려주세요!' }, C.FALLBACK),
      applications: apps, members, events, attendance: att, finance: fin
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

  /* ---------------- 카카오 로그인에서 돌아왔을 때 ----------------
     Supabase 가 주소 뒤 #access_token=... 에 열쇠를 담아 보내준다.
     한 번 받아 보관하고 주소창은 깨끗이 지운다. */
  let authError = '';
  (function catchHash() {
    if (!HAS_SB || !location.hash || location.hash.length < 2) return;
    const p = new URLSearchParams(location.hash.slice(1));
    const tok = p.get('access_token');
    const err = p.get('error_description') || p.get('error');
    if (!tok && !err) return;
    if (tok) {
      session = {
        access_token: tok,
        refresh_token: p.get('refresh_token') || '',
        expires_at: Number(p.get('expires_at') || 0),
        token_type: p.get('token_type') || 'bearer'
      };
      try { localStorage.setItem(SKEY, JSON.stringify(session)); } catch (e) { }
    } else {
      authError = decodeURIComponent(String(err).replace(/\+/g, ' '));
    }
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { }
  })();

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
  function table(name, order, cols) {
    if (HAS_SB) {
      return {
        list: () => rest(name + '?select=' + (cols || '*') + (order ? '&order=' + order : '')),
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
        const d = demoRead();
        const rows = (d[name] || []).map(r => (('receipt' in r)
          ? Object.assign({}, r, { has_receipt: !!r.receipt, receipt: undefined }) : r));
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
  /* 사람 사진 주소 — 받아 둔 것을 다시 쓴다 (화면마다 다시 받지 않게) */
  const AVATAR_CACHE = new Map();

  const DB = {
    mode: HAS_SB ? 'supabase' : 'demo',
    isDemo: () => !HAS_SB,
    /* 로그인한 상태인가 — 운영진이든 구성원이든 열쇠는 하나다 */
    isAuthed: () => HAS_SB ? !!(session && session.access_token)
      : (localStorage.getItem('baljaguk.demoAuth') === '1' || localStorage.getItem('baljaguk.demoLogin') === '1'),

    /* 비상 로그인 — 카카오가 막혔을 때만 쓰는 공유 계정.
       이메일·비밀번호를 그때그때 받아서 쓰고, 어디에도 저장하지 않는다. */
    async login(password, email) {
      if (!HAS_SB) {
        /* 체험 모드에는 지킬 비밀이 없다. 명부의 운영진으로 들어간 것처럼 둔다 */
        const d = demoRead();
        const admin = (d.members || []).find(m => m.role === 'admin' && m.status !== 'left');
        if (!admin) throw new Error('체험 명부에 운영진이 없어요');
        localStorage.setItem('baljaguk.demoAuth', '1');
        localStorage.setItem('baljaguk.demoLogin', '1');
        localStorage.setItem('baljaguk.demoMe', admin.id);
        return true;
      }
      const j = await auth('token?grant_type=password', {
        email: String(email || C.ADMIN_EMAIL), password: String(password)
      });
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

    // 입금증(receipt)은 목록에서 제외 — 열어볼 때만 따로 받아온다
    applications: table('applications', 'created_at.desc',
      'id,created_at,name,student_id,department,phone,motivation,status,note,reviewed_at,has_receipt'),
    members: table('members', 'created_at.asc'),
    events: table('events', 'date.desc'),
    attendance: table('attendance'),
    finance: table('finance', 'date.desc',
      'id,created_at,date,kind,category,amount,memo,member_id,has_receipt'),
    campaigns: table('campaigns', 'created_at.desc'),
    donations: table('donations', 'date.desc'),
    surveys: table('survey_responses', 'created_at.desc'),
    id1365: table('member_1365', 'name.asc'),
    payouts: table('shelter_payouts', 'date.desc',
      'id,created_at,place,amount,date,memo,has_photo'),

    /* ---------------- 구성원 로그인 (카카오) ----------------
       체험 모드에서는 카카오를 거치지 않고 바로 로그인한 척한다. */
    authError: () => authError,

    kakaoLogin(returnTo) {
      const back = returnTo || (location.origin + location.pathname);
      if (!HAS_SB) {
        localStorage.setItem('baljaguk.demoLogin', '1');
        location.href = back;
        return;
      }
      /* 이메일·프로필 사진은 안 받는다 (카카오 비즈 앱이라야 주는 항목).
         scopes(복수)는 기본값에 더하기만 하고, scope(단수)라야 통째로 바뀐다. */
      location.href = C.SUPABASE_URL + '/auth/v1/authorize?provider=kakao' +
        '&scope=' + enc('profile_nickname') +
        '&redirect_to=' + enc(back);
    },

    /* 이 사람이 운영진인가 — 데이터베이스에 직접 물어본다 */
    async isAdmin() {
      if (!HAS_SB) {
        /* 체험 모드도 실제와 똑같이 명부의 역할을 따른다.
           비상 로그인(demoAuth)으로 들어온 경우만 예외로 통과시킨다. */
        const id = localStorage.getItem('baljaguk.demoMe');
        if (id) {
          const m = (demoRead().members || []).find(x => x.id === id);
          return !!(m && m.role === 'admin' && m.status !== 'left');
        }
        return localStorage.getItem('baljaguk.demoAuth') === '1';
      }
      if (!session || !session.access_token) return false;
      try { return !!(await rest('rpc/is_admin', { method: 'POST', body: {} })); }
      catch (e) { return false; }
    },

    /* 카카오에서 받아온 닉네임 — 열쇠 안에 들어 있다 */
    authNickname() {
      if (!HAS_SB) return localStorage.getItem('baljaguk.demoLogin') === '1' ? '카카오친구' : '';
      if (!session || !session.access_token) return '';
      try {
        const raw = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const txt = decodeURIComponent(Array.prototype.map.call(
          atob(raw + '='.repeat((4 - raw.length % 4) % 4)),
          c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join(''));
        const m = JSON.parse(txt).user_metadata || {};
        return String(m.name || m.full_name || m.preferred_username || '').trim();
      } catch (e) { return ''; }
    },

    memberLogout() {
      if (!HAS_SB) {
        localStorage.removeItem('baljaguk.demoLogin');
        localStorage.removeItem('baljaguk.demoMe');
        return;
      }
      session = null;
      try { localStorage.removeItem(SKEY); } catch (e) { }
    },

    /* 내가 누구인지 — 연락처·학번은 안 내려온다 */
    async me() {
      if (!HAS_SB) {
        if (localStorage.getItem('baljaguk.demoLogin') !== '1') return { login: false };
        const id = localStorage.getItem('baljaguk.demoMe');
        const m = id && (demoRead().members || []).find(x => x.id === id);
        return m
          ? {
            login: true, linked: true, id: m.id, name: m.name, role: m.role,
            status: m.status, photo: m.photo_path || null, joined_on: m.joined_on || null
          }
          : { login: true, linked: false };
      }
      if (!session) return { login: false };
      return await rest('rpc/me', { method: 'POST', body: {} });
    },

    /* 카카오 계정을 명부의 내 이름에 잇기 (이름 + 휴대폰 뒤 4자리) */
    async claimMember(name, last4) {
      if (!HAS_SB) {
        const digits = String(last4 || '').replace(/[^0-9]/g, '');
        const hit = (demoRead().members || []).filter(m =>
          String(m.name).trim() === String(name).trim() && m.status !== 'left' &&
          digits && String(m.phone || '').replace(/[^0-9]/g, '').slice(-4) === digits);
        if (hit.length !== 1) return { ok: false, why: hit.length ? 'many' : 'nomatch' };
        localStorage.setItem('baljaguk.demoMe', hit[0].id);
        return { ok: true, name: hit[0].name, role: hit[0].role };
      }
      return await rest('rpc/claim_member', {
        method: 'POST', body: { p_name: String(name || '').trim(), p_last4: String(last4 || '').trim() }
      });
    },

    /* ---------- 내 활동 (본인 것만) ---------- */
    /* 확정된 봉사만 센다. 다른 사람 기록도, 내 연락처도 내려오지 않는다 */
    async myActivity() {
      if (!HAS_SB) {
        const id = localStorage.getItem('baljaguk.demoMe');
        if (!id) return null;
        const d = demoRead();
        const mine = (d.attendance || [])
          .filter(a => a.member_id === id)
          .map(a => (d.events || []).find(e => e.id === a.event_id))
          .filter(e => e && e.confirmed_at)
          .map(e => ({
            event_id: e.id, date: e.date, title: e.title, place: e.place,
            unit: e.credit_unit === 'kg' ? 'kg' : 'won',
            per: Number(e.credit_per_person) || 0
          }))
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const byplace = {};
        mine.filter(r => r.per > 0).forEach(r => {
          const k = r.place + '|' + r.unit;
          const g = byplace[k] = byplace[k] || { place: r.place, unit: r.unit, times: 0, credit: 0 };
          g.times += 1; g.credit += r.per;
        });
        return {
          times: mine.length,
          last_date: mine.length ? mine[0].date : null,
          credit_total: mine.filter(r => r.unit !== 'kg').reduce((t, r) => t + r.per, 0),
          credit_total_kg: mine.filter(r => r.unit === 'kg').reduce((t, r) => t + r.per, 0),
          places: Object.keys(byplace).map(k => byplace[k]).sort((a, b) => b.credit - a.credit),
          records: mine
        };
      }
      return await rest('rpc/my_activity', { method: 'POST', body: {} });
    },

    /* 이번 학기 설문 회차 */
    surveyTopic: () => C.SURVEY_TOPIC || '2026-2',

    /* 신청 접수 (비로그인 상태에서 호출) */
    async apply(form) {
      const row = {
        name: form.name, student_id: form.student_id, department: form.department,
        phone: form.phone, motivation: form.motivation, receipt: form.receipt || '', status: 'pending'
      };
      /* 어느 기수의 신청인지 같이 남긴다.
         실제 데이터베이스에서는 트리거가 채워주고, 체험 모드에서는 여기서 채운다. */
      if (!HAS_SB) {
        try {
          const s = await DB.settings.get();
          row.generation = String((s && s.generation) || '').trim();
        } catch (e) { }
      }
      return DB.applications.create(row);
    },

    /* 설문 응답 접수 (비로그인 상태에서 호출) */
    async submitSurvey(form) {
      return DB.surveys.create({
        topic: DB.surveyTopic(),
        name: String(form.name || '').trim(),
        station: String(form.station || '').trim(),
        opinion: String(form.opinion || '').trim(),
        party: ['yes', 'no', 'maybe'].includes(form.party) ? form.party : 'maybe'
      });
    },

    /* ---------- 후원금 현황 (공개 페이지) ---------- */
    /* 금액·인원수만 내려받는다. 이름·연락처는 서버에서 아예 빼고 준다 */
    async publicFunds() {
      if (!HAS_SB) {
        const d = demoRead();
        const rows = (d.events || [])
          .filter(e => e.confirmed_at && Number(e.credit_per_person) > 0)
          .map(e => {
            const att = (d.attendance || []).filter(a => a.event_id === e.id);
            const nameOf = id => ((d.members || []).find(m => m.id === id) || {}).name;
            const names = att.map(a => nameOf(a.member_id)).filter(Boolean).sort();
            const per = Number(e.credit_per_person);
            const unit = e.credit_unit === 'kg' ? 'kg' : 'won';
            return { date: e.date, place: e.place, unit, people: att.length, per, amount: att.length * per, names };
          })
          .filter(r => r.people > 0)
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const pays = d.shelter_payouts || [];
        /* 돈과 사료는 섞지 않는다 — 봉사지 × 단위로 따로 센다 */
        const map = {};
        const get = (pl, u) => {
          const k = pl + '|' + u;
          return (map[k] = map[k] || { place: pl, unit: u, saved: 0, paid: 0, remain: 0 });
        };
        rows.forEach(r => { get(r.place, r.unit).saved += r.amount; });
        pays.forEach(p => { get(p.place, p.unit === 'kg' ? 'kg' : 'won').paid += Number(p.amount) || 0; });
        const places = Object.keys(map).map(k => {
          map[k].remain = map[k].saved - map[k].paid;
          return map[k];
        }).sort((a, b) => b.remain - a.remain);
        const tally = {};
        (d.events || []).filter(e => e.confirmed_at && Number(e.credit_per_person) > 0).forEach(e => {
          (d.attendance || []).filter(a => a.event_id === e.id).forEach(a => {
            const m = (d.members || []).find(x => x.id === a.member_id);
            if (m) tally[m.name] = (tally[m.name] || 0) + 1;
          });
        });
        const helpers = Object.keys(tally).map(n => ({ name: n, times: tally[n] }))
          .sort((a, b) => b.times - a.times || a.name.localeCompare(b.name, 'ko'));
        return {
          generated_at: new Date().toISOString(),
          total_saved: places.filter(p => p.unit !== 'kg').reduce((t, p) => t + p.saved, 0),
          total_paid: places.filter(p => p.unit !== 'kg').reduce((t, p) => t + p.paid, 0),
          total_saved_kg: places.filter(p => p.unit === 'kg').reduce((t, p) => t + p.saved, 0),
          total_paid_kg: places.filter(p => p.unit === 'kg').reduce((t, p) => t + p.paid, 0),
          total_helpers: helpers.length,
          total_visits: helpers.reduce((t, h) => t + h.times, 0),
          helpers,
          places, entries: rows,
          payouts: pays.map(p => ({
            id: p.id, date: p.date, place: p.place, amount: p.amount,
            unit: p.unit === 'kg' ? 'kg' : 'won',
            memo: p.memo, has_photo: !!p.photo
          })),
          campaigns: (d.campaigns || []).map(c => Object.assign({}, c, {
            raised: (d.donations || []).filter(x => x.campaign_id === c.id)
              .reduce((t, x) => t + (Number(x.amount) || 0), 0),
            donors: (d.donations || []).filter(x => x.campaign_id === c.id).length
          }))
        };
      }
      return await rest('rpc/public_funds', { method: 'POST', body: {} });
    },

    /* ---------- 1365 회원명부 등록 ---------- */
    /* 이름으로 내 정보 찾기 — 전화번호는 가운데를 가린 채로만 돌려준다 */
    async id1365Lookup(name) {
      const nm = String(name || '').trim();
      if (!nm) return [];
      if (!HAS_SB) {
        const d = demoRead();
        const mask = v => {
          const x = String(v || '').replace(/\D/g, '');
          return x.length >= 7 ? x.slice(0, 3) + '-****-' + x.slice(-4) : null;
        };
        return (d.members || []).filter(m => String(m.name).trim() === nm).map(m => {
          const r = (d.member_1365 || []).find(x => x.member_id === m.id);
          return {
            student_id: m.student_id,
            phone_mask: mask((r && r.phone) || m.phone),
            birth: (r && r.birth) || null,
            portal_id: (r && r.portal_id) || null,
            submitted: !!r,
            updated_at: (r && (r.updated_at || r.created_at)) || null
          };
        });
      }
      return await rest('rpc/id1365_lookup', { method: 'POST', body: { p_name: nm } }) || [];
    },
    /* 제출 (다시 내면 덮어쓴다) */
    async id1365Submit(v) {
      const name = String(v.name || '').trim();
      const sid = String(v.student_id || '').trim();
      const birth = String(v.birth || '').trim();
      const portal = String(v.portal_id || '').trim();
      const phone = String(v.phone || '').trim();
      if (!HAS_SB) {
        const d = demoRead();
        const st = DB.id1365State(d.settings || {});
        if (!st.open) return 'closed';
        const hits = (d.members || []).filter(m => String(m.name).trim() === name && (!sid || m.student_id === sid));
        if (!hits.length) return 'nomatch';
        if (hits.length > 1) return 'many';
        if (!birth) return 'nobirth';
        if (!portal) return 'noportal';
        const m = hits[0];
        d.member_1365 = d.member_1365 || [];
        const prev = d.member_1365.find(x => x.member_id === m.id);
        const ph = phone || (prev && prev.phone) || m.phone || '';
        if (!ph) return 'nophone';
        const row = {
          member_id: m.id, name: m.name, student_id: m.student_id,
          birth, portal_id: portal, phone: ph, updated_at: new Date().toISOString()
        };
        if (prev) Object.assign(prev, row);
        else d.member_1365.push(Object.assign({ id: uid(), created_at: new Date().toISOString() }, row));
        demoWrite(d);
        return 'ok';
      }
      return await rest('rpc/id1365_submit', {
        method: 'POST',
        body: { p_name: name, p_sid: sid, p_birth: birth || null, p_portal: portal, p_phone: phone }
      });
    },

    /* ---------- 봉사모임 신청 폼 (모임마다 고유 주소) ---------- */
    async eventPublic(id) {
      if (!HAS_SB) {
        const d = demoRead();
        const e = (d.events || []).find(x => x.id === id);
        if (!e) return null;
        const att = (d.attendance || []).filter(a => a.event_id === id);
        const names = att.map(a => ((d.members || []).find(m => m.id === a.member_id) || {}).name).filter(Boolean);
        return Object.assign({}, e, { taken: att.length, names });
      }
      const rows = await rest('rpc/event_public', { method: 'POST', body: { p_id: id } });
      return (rows && rows[0]) || null;
    },
    async eventWho(name) {
      if (!HAS_SB) {
        const d = demoRead();
        return (d.members || []).filter(m => String(m.name).trim() === String(name).trim())
          .map(m => ({ student_id: m.student_id }));
      }
      return await rest('rpc/event_who', { method: 'POST', body: { p_name: name } }) || [];
    },
    async eventSignup(eventId, name, sid) {
      if (!HAS_SB) {
        const d = demoRead();
        const e = (d.events || []).find(x => x.id === eventId);
        if (!e) return 'noevent';
        if (e.signup_open === false) return 'closed';
        if (e.signup_open_at && Date.now() < Date.parse(e.signup_open_at)) return 'before';
        const hits = (d.members || []).filter(m => String(m.name).trim() === String(name).trim()
          && (!sid || m.student_id === sid));
        if (!hits.length) return 'nomatch';
        if (hits.length > 1) return 'many';
        const att = d.attendance || (d.attendance = []);
        if (att.some(a => a.event_id === eventId && a.member_id === hits[0].id)) return 'dup';
        const taken = att.filter(a => a.event_id === eventId).length;
        if (e.capacity && taken >= e.capacity) return 'full';
        att.push({ id: uid(), event_id: eventId, member_id: hits[0].id, hours: 0, created_at: new Date().toISOString() });
        demoWrite(d); return 'ok';
      }
      return await rest('rpc/event_signup', { method: 'POST', body: { p_event: eventId, p_name: name, p_sid: sid || '' } });
    },
    async eventCancel(eventId, name, sid) {
      if (!HAS_SB) {
        const d = demoRead();
        const hits = (d.members || []).filter(m => String(m.name).trim() === String(name).trim()
          && (!sid || m.student_id === sid));
        if (!hits.length) return 'nomatch';
        if (hits.length > 1) return 'many';
        const before = (d.attendance || []).length;
        d.attendance = (d.attendance || []).filter(a => !(a.event_id === eventId && a.member_id === hits[0].id));
        demoWrite(d);
        return d.attendance.length < before ? 'ok' : 'none';
      }
      return await rest('rpc/event_cancel', { method: 'POST', body: { p_event: eventId, p_name: name, p_sid: sid || '' } });
    },

    /* 설문 응답 본인 수정 — 이름이 똑같은 응답만 찾아준다 */
    async surveyLookup(name) {
      const nm = String(name || '').trim();
      if (!nm) return [];
      if (!HAS_SB) {
        const d = demoRead();
        return (d.survey_responses || [])
          .filter(r => r.topic === DB.surveyTopic() && String(r.name || '').trim() === nm)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }
      return await rest('rpc/survey_lookup', {
        method: 'POST', body: { p_name: nm, p_topic: DB.surveyTopic() }
      }) || [];
    },
    async surveyEdit(id, patch) {
      if (!HAS_SB) {
        const d = demoRead();
        const row = (d.survey_responses || []).find(r => r.id === id);
        if (row) Object.assign(row, {
          station: String(patch.station || '').trim(),
          opinion: String(patch.opinion || '').trim(),
          party: ['yes', 'no', 'maybe'].includes(patch.party) ? patch.party : row.party
        });
        demoWrite(d); return row;
      }
      await rest('rpc/survey_edit', {
        method: 'POST', prefer: 'return=minimal',
        body: { p_id: id, p_station: patch.station || '', p_opinion: patch.opinion || '', p_party: patch.party || '' }
      });
      return true;
    },

    /* 승인 → 구성원 생성 (+ 회비 합산)
       같은 신청서를 두 번 승인해도 구성원이 중복으로 생기지 않는다 */
    async approve(app, opts) {
      opts = opts || {};
      const already = (await DB.members.list()).find(m =>
        m.application_id === app.id ||
        (m.name === app.name && String(m.student_id || '') === String(app.student_id || '')));

      const member = already || await DB.members.create({
        name: app.name, student_id: app.student_id, department: app.department, phone: app.phone,
        role: 'member', status: 'active', joined_on: today(), application_id: app.id, memo: ''
      });
      await DB.applications.update(app.id, { status: 'approved', reviewed_at: new Date().toISOString() });

      let feeError = null;
      if (opts.fee > 0 && !already) {
        try { await DB.addFeeIncome(Number(opts.fee)); }
        catch (e) { feeError = e.message || '회비를 재정에 더하지 못했어요'; }
      }
      return { member, feeError, already: !!already };
    },
    /* 가입비는 새 내역을 만들지 않고 기존 '동아리비' 수입 한 줄에 더한다 */
    async addFeeIncome(fee) {
      // 운영진 여러 명이 동시에 승인해도 금액이 덮어써지지 않도록 DB 안에서 더한다
      if (HAS_SB) {
        try {
          await rest('rpc/add_fee_income', { method: 'POST', body: { fee }, prefer: 'return=minimal' });
          return true;
        } catch (e) { /* 함수가 아직 없으면 아래 방식으로 처리 */ }
      }
      const rows = await DB.finance.list();
      const pool = rows.filter(f => f.kind === 'income' && /동아리비|회비/.test(f.category || ''));
      // 기수가 바뀌어 새 항목을 만들었다면 그 최신 항목에 더한다
      pool.sort((a, b) => String(b.date).localeCompare(String(a.date)) ||
        String(b.created_at).localeCompare(String(a.created_at)));
      const row = pool[0];
      if (!row) {
        return DB.finance.create({
          date: today(), kind: 'income', category: '동아리비 (1명)',
          amount: fee, memo: '', member_id: null
        });
      }
      const patch = { amount: (Number(row.amount) || 0) + fee };
      const m = String(row.category || '').match(/^(.*?)\((\d+)\s*명\)\s*$/);
      if (m) patch.category = m[1] + '(' + (Number(m[2]) + 1) + '명)';
      return DB.finance.update(row.id, patch);
    },

    async reject(app, reason) {
      return DB.applications.update(app.id, { status: 'rejected', note: reason || '', reviewed_at: new Date().toISOString() });
    },

    /* 일정별 참여 저장: rows = [{member_id, hours}] */
    async saveAttendance(eventId, rows) {
      const cur = (await DB.attendance.list()).filter(a => a.event_id === eventId);
      const keep = new Set(rows.map(r => r.member_id));
      let removed = 0;
      for (const a of cur) if (!keep.has(a.member_id)) { await DB.attendance.remove(a.id); removed += 1; }
      for (const r of rows) {
        const ex = cur.find(a => a.member_id === r.member_id);
        if (ex) { if (Number(ex.hours) !== Number(r.hours)) await DB.attendance.update(ex.id, { hours: Number(r.hours) || 0 }); }
        else await DB.attendance.create({ event_id: eventId, member_id: r.member_id, hours: Number(r.hours) || 0 });
      }
      /* 체험 모드도 실서버 트리거와 같게 — 누가 빠지면 대기자가 올라간다.
         (확정됐거나 지난 봉사는 promoteWait 안에서 막는다) */
      if (!HAS_SB && removed) {
        const d = cdemo();
        let moved = false;
        for (let i = 0; i < removed; i++) { if (promoteWait(d, eventId)) moved = true; else break; }
        if (moved) demoWrite(d);
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

    /* 사진 한 장만 따로 받아오기 */
    async getReceipt(table, id, col) {
      col = col || 'receipt';
      if (!HAS_SB) {
        const d = demoRead();
        const row = (d[table] || []).find(x => x.id === id);
        return (row && row[col]) || '';
      }
      const rows = await rest(table + '?select=' + col + '&id=eq.' + enc(id));
      return (rows && rows[0] && rows[0][col]) || '';
    },

    /* 전달 기록 사진 — 공개 페이지에서도 한 장씩 받아간다 */
    async payoutPhoto(id) {
      if (!HAS_SB) {
        const d = demoRead();
        const row = (d.shelter_payouts || []).find(x => x.id === id);
        return (row && row.photo) || '';
      }
      return await rest('rpc/public_payout_photo', { method: 'POST', body: { p_id: id } }) || '';
    },

    resetDemo() { localStorage.removeItem(DKEY); localStorage.removeItem('baljaguk.demoAuth'); },
    uid, today
  };

  /* 설문 접수 가능 여부 */
  DB.surveyState = function (s) {
    s = s || {};
    if (s.survey_open === false) return { open: false, why: 'manual' };
    if (s.survey_close_at && Date.now() >= Date.parse(s.survey_close_at)) return { open: false, why: 'closed', at: s.survey_close_at };
    return { open: true, until: s.survey_close_at || null };
  };

  /* 1365 명부 접수 가능 여부 */
  DB.id1365State = function (s) {
    s = s || {};
    if (s.id1365_open === false) return { open: false, why: 'manual' };
    if (s.id1365_close_at && Date.now() >= Date.parse(s.id1365_close_at)) {
      return { open: false, why: 'closed', at: s.id1365_close_at };
    }
    return { open: true, until: s.id1365_close_at || null };
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

  /* ============================================================
     커뮤니티 — 피드·댓글·반응
     실제 모드는 서버 함수가 모아서 내려준다 (연락처·학번은 안 실린다).
     체험 모드는 같은 모양을 브라우저 안에서 만든다.
     ============================================================ */

  const REACTIONS = ['heart', 'paw', 'haha', 'moved', 'clap'];

  /* 체험 모드 저장소 — 없으면 빈 칸을 만들어 둔다 */
  function cdemo() {
    const d = demoRead();
    ['posts', 'post_photos', 'comments', 'reactions',
      'polls', 'poll_options', 'poll_votes', 'event_waitlist', 'member_notices',
      'animals', 'post_animals', 'reports', 'checkins',
      'survey_responses', 'member_1365'].forEach(k => { if (!d[k]) d[k] = []; });
    return d;
  }
  const myDemoId = () => localStorage.getItem('baljaguk.demoMe') || '';
  /* 자리가 나면 먼저 신청한 대기자를 올린다 — 서버 트리거와 같은 규칙.
     확정됐거나 지난 봉사에서는 올리지 않는다. 안 간 사람이 실적에 잡히면 안 된다. */
  function promoteWait(d, eventId) {
    const e = (d.events || []).find(x => x.id === eventId);
    if (!e) return false;
    const cap = Number(e.capacity) || 0;
    if (!cap) return false;
    if (e.confirmed_at) return false;
    if (String(e.date) < today()) return false;

    const taken = (d.attendance || []).filter(a => a.event_id === eventId).length;
    if (taken >= cap) return false;
    const wl = (d.event_waitlist || []).filter(w => w.event_id === eventId)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    if (!wl.length) return false;

    d.attendance.push({ id: uid(), event_id: eventId, member_id: wl[0].member_id, hours: 0 });
    d.event_waitlist = d.event_waitlist.filter(w => w.id !== wl[0].id);
    d.member_notices = d.member_notices || [];
    d.member_notices.push({
      id: uid(), created_at: new Date().toISOString(), member_id: wl[0].member_id,
      kind: 'promoted', detail: String(e.date).slice(5).replace('-', '월 ') + '일 ' + (e.place || '봉사'),
      event_id: eventId
    });
    return true;
  }

  const pollClosed = q => !!(q && (q.closed_at ||
    (q.closes_at && Date.parse(q.closes_at) < Date.now())));
  function demoMember(id) {
    const m = (demoRead().members || []).find(x => x.id === id);
    return m ? { id: m.id, name: m.name, role: m.role, photo: m.photo_path || null } : null;
  }

  /* 체험 모드에서 글 한 줄을 실제 모드와 같은 모양으로 */
  function demoPostRow(d, p, meId) {
    const rs = d.reactions.filter(r => r.post_id === p.id);
    const counts = {};
    rs.forEach(r => { counts[r.kind] = (counts[r.kind] || 0) + 1; });
    const poll = d.polls.find(q => q.post_id === p.id);
    return {
      id: p.id, created_at: p.created_at, type: p.type, event_id: p.event_id || null,
      place: p.place || null, date: p.date || null,
      body: (p.hidden && p.author_id !== meId) ? '' : p.body,
      pinned: !!p.pinned, hidden: !!p.hidden, edited_at: p.edited_at || null,
      insta_ok: !!p.insta_ok,
      mine: p.author_id === meId,
      author: demoMember(p.author_id),
      question: !!p.is_question,
      solved: !!p.solved_at,
      answers: p.is_question
        ? d.comments.filter(c => c.post_id === p.id && !c.hidden).length : null,
      best: p.best_comment_id
        ? String((d.comments.find(c => c.id === p.best_comment_id) || {}).body || '').slice(0, 60)
        : null,
      best_id: p.best_comment_id || null,
      animals: (d.post_animals || []).filter(x => x.post_id === p.id)
        .map(x => (d.animals || []).find(a => a.id === x.animal_id))
        .filter(Boolean)
        .map(a => ({ id: a.id, name: a.name, adopted: !!a.adopted_at }))
        .sort((x, y) => x.name.localeCompare(y.name, 'ko')),
      photos: d.post_photos.filter(f => f.post_id === p.id)
        .sort((a, b) => a.sort - b.sort).map(f => f.path),
      comment_count: d.comments.filter(c => c.post_id === p.id && !c.hidden).length,
      recent_comments: d.comments
        .filter(c => c.post_id === p.id && !c.hidden)
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
        .slice(-2)
        .map(c => ({
          id: c.id, created_at: c.created_at, body: c.body,
          mine: c.author_id === meId,
          author: (demoMember(c.author_id) || {}).name || '?'
        })),
      reactions: counts,
      my_reactions: rs.filter(r => r.member_id === meId).map(r => r.kind),
      /* 퀴즈는 발표 전까지 정답도 분포도 내보내지 않는다 (실서버 feed() 와 같은 규칙) */
      poll: poll ? (function () {
        const quiz = !!poll.answer_option_id;
        const shown = !quiz || !!poll.revealed_at;
        const mine_ = d.poll_votes.filter(v => v.post_id === p.id);
        return {
          question: poll.question, multi: !!poll.multi, anonymous: !!poll.anonymous,
          closes_at: poll.closes_at || null, closed_at: poll.closed_at || null,
          quiz: quiz,
          reveal_at: poll.reveal_at || null,
          revealed: !!poll.revealed_at,
          answer: poll.revealed_at ? poll.answer_option_id : null,
          voters: shown ? new Set(mine_.map(v => v.member_id)).size : null,
          correct: quiz && poll.revealed_at
            ? mine_.filter(v => v.option_id === poll.answer_option_id).length : null,
          options: d.poll_options.filter(o => o.post_id === p.id)
            .sort((a, b) => a.sort - b.sort).map(o => ({
              id: o.id, label: o.label,
              votes: shown ? d.poll_votes.filter(v => v.option_id === o.id).length : null,
              mine: d.poll_votes.some(v => v.option_id === o.id && v.member_id === meId)
            }))
        };
      })() : null
    };
  }

  /* ---------- 운영진 할 일 ---------- */
  /* ---------- 알림 ---------- */
  DB.push = {
    async subscribe(endpoint, p256dh, auth) {
      if (!HAS_SB) {
        try { localStorage.setItem('baljaguk.pushDemo', endpoint); } catch (e) { }
        return true;
      }
      return await rest('rpc/push_subscribe', {
        method: 'POST',
        body: { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth }
      });
    },

    async unsubscribe(endpoint) {
      if (!HAS_SB) {
        try { localStorage.removeItem('baljaguk.pushDemo'); } catch (e) { }
        return true;
      }
      return await rest('rpc/push_unsubscribe', {
        method: 'POST', body: { p_endpoint: endpoint }
      });
    },

    /* 종류별 끄고 켜기 — 이 기기 것만 */
    async prefs(endpoint) {
      if (!HAS_SB) {
        try { return JSON.parse(localStorage.getItem('baljaguk.pushPrefs') || 'null'); }
        catch (e) { return null; }
      }
      return await rest('rpc/push_prefs', { method: 'POST', body: { p_endpoint: endpoint } });
    },

    async setPref(endpoint, key, on) {
      if (!HAS_SB) {
        let v = {};
        try { v = JSON.parse(localStorage.getItem('baljaguk.pushPrefs') || '{}'); } catch (e) { }
        v[key] = !!on;
        try { localStorage.setItem('baljaguk.pushPrefs', JSON.stringify(v)); } catch (e) { }
        return true;
      }
      return await rest('rpc/push_prefs_set', {
        method: 'POST', body: { p_endpoint: endpoint, p_key: key, p_on: !!on }
      });
    },

    /* 나에게만 보내 보기 */
    async test(kind, title, body) {
      if (!HAS_SB) return { demo: true };
      return await rest('rpc/push_test', {
        method: 'POST', body: { p_kind: kind, p_title: title, p_body: body }
      });
    }
  };

  /* ---------- 의견 보내기 ---------- */
  DB.feedback = {
    async send(body, anon) {
      const t = String(body || '').trim();
      if (!t) throw new Error('내용을 적어주세요');
      if (!HAS_SB) {
        const d = cdemo();
        d.feedback = d.feedback || [];
        /* 익명이면 누가 보냈는지 담지 않는다 — 실서버와 같게 */
        if (anon) {
          const today = DB.today();
          const key = 'baljaguk.anonCount.' + today;
          const n = Number(localStorage.getItem(key) || 0) + 1;
          if (n > 3) return { ok: false, why: 'toomany' };
          localStorage.setItem(key, String(n));
          d.feedback.push({
            id: uid(), created_at: new Date().toISOString(),
            member_id: null, anon: true, body: t, done_at: null
          });
          demoWrite(d);
          return { ok: true, anon: true, left: 3 - n };
        }
        d.feedback.push({
          id: uid(), created_at: new Date().toISOString(),
          member_id: myDemoId(), anon: false, body: t, done_at: null
        });
        demoWrite(d);
        return { ok: true, anon: false };
      }
      return await rest('rpc/feedback_send', {
        method: 'POST', body: { p_body: t, p_anon: !!anon }
      });
    },

    /* 내가 보낸 의견과 운영진 답장 — 답장을 볼 곳이 없었다 */
    async mine() {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        return (d.feedback || [])
          .filter(f => f.member_id === me && !f.anon)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .map(f => ({
            id: f.id, created_at: f.created_at, body: f.body,
            reply: f.reply || null, replied_at: f.replied_at || null,
            done: !!f.done_at
          }));
      }
      return await rest('rpc/my_feedback', { method: 'POST', body: {} }) || [];
    },

    async reply(id, text) {
      if (!HAS_SB) {
        const d = cdemo(), f = (d.feedback || []).find(x => x.id === id);
        if (!f) return { ok: false, why: 'notfound' };
        if (f.anon || !f.member_id) return { ok: false, why: 'anon' };
        f.reply = String(text || '').trim();
        f.replied_at = new Date().toISOString();
        d.member_notices = d.member_notices || [];
        d.member_notices.push({
          id: uid(), member_id: f.member_id, kind: 'reply',
          body: '보내 주신 의견에 운영진이 답했어요: ' + f.reply.slice(0, 40),
          created_at: new Date().toISOString(), read_at: null
        });
        demoWrite(d);
        return { ok: true };
      }
      return await rest('rpc/feedback_reply', {
        method: 'POST', body: { p_id: id, p_text: String(text || '') }
      });
    },

    async open() {
      if (!HAS_SB) {
        const d = cdemo();
        return (d.feedback || []).filter(f => !f.done_at).map(f => ({
          id: f.id, created_at: f.created_at, body: f.body,
          anon: !!f.anon,
          who: f.anon ? null : (demoMember(f.member_id) || {}).name,
          can_reply: !f.anon && !!f.member_id,
          replied: !!f.replied_at
        })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      }
      return await rest('rpc/feedback_open', { method: 'POST', body: {} });
    },

    async done(id) {
      if (!HAS_SB) {
        const d = cdemo(), f = (d.feedback || []).find(x => x.id === id);
        if (f) { f.done_at = new Date().toISOString(); demoWrite(d); }
        return true;
      }
      return await rest('rpc/feedback_done', { method: 'POST', body: { p_id: id } });
    }
  };

  /* ---------- 사용 현황 (운영진만) ---------- */
  DB.usageStats = async function () {
    if (!HAS_SB) {
      const d = cdemo();
      const wk = Date.now() - 7 * 86400000;
      const fresh = a => Date.parse(a.created_at || 0) > wk;
      return {
        members: (d.members || []).filter(m => m.status !== 'left').length,
        linked: (d.members || []).filter(m => m.status !== 'left' && m.auth_user_id).length,
        joined_week: (d.members || []).filter(m => m.linked_at && Date.parse(m.linked_at) > wk).length,
        posts_week: (d.posts || []).filter(fresh).length,
        reviews_week: (d.posts || []).filter(p => p.type === 'review' && fresh(p)).length,
        comments_week: (d.comments || []).filter(fresh).length,
        push_on: localStorage.getItem('baljaguk.pushDemo') ? 1 : 0,
        photos: (d.post_photos || []).length,
        /* 체험 모드는 글자로 담겨 있어 길이로 어림잡는다 */
        bytes: (d.post_photos || []).reduce((t, f) => t + (String(f.path || '').length * 0.75), 0),
        rows: (d.posts || []).length + (d.comments || []).length +
          (d.reactions || []).length + (d.poll_votes || []).length
      };
    }
    return await rest('rpc/usage_stats', { method: 'POST', body: {} });
  };

  /* 누가 알림을 켰나 — 운영진만. 기기 수만 받는다 (주소·키는 안 받는다) */
  DB.pushWho = async function () {
    if (!HAS_SB) {
      const d = cdemo();
      return (d.members || []).map(m => ({ id: m.id, devices: 0 }));
    }
    return await rest('rpc/push_who', { method: 'POST', body: {} }) || [];
  };

  DB.adminTodo = async function () {
    if (!HAS_SB) {
      const d = cdemo();
      const today = DB.today();
      return {
        unconfirmed: (d.events || []).filter(e => String(e.date) < today && !e.confirmed_at).length,
        applications: (d.applications || []).filter(a => (a.status || 'pending') === 'pending').length,
        reports: (d.reports || []).filter(r => !r.done_at).length,
        feedback: (d.feedback || []).filter(f => !f.done_at).length
      };
    }
    return await rest('rpc/admin_todo', { method: 'POST', body: {} });
  };

  DB.reportsOpen = async function () {
    if (!HAS_SB) {
      const d = cdemo();
      return (d.reports || []).filter(r => !r.done_at).map(r => ({
        id: r.id, created_at: r.created_at, reason: r.reason,
        post_id: r.post_id, comment_id: r.comment_id,
        reporter: (demoMember(r.reporter_id) || {}).name,
        body: (d.posts || []).concat(d.comments || [])
          .filter(x => x.id === (r.post_id || r.comment_id)).map(x => x.body)[0] || ''
      })).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    return await rest('rpc/reports_open', { method: 'POST', body: {} });
  };

  DB.reportDone = async function (id) {
    if (!HAS_SB) {
      const d = cdemo(), r = (d.reports || []).find(x => x.id === id);
      if (r) { r.done_at = new Date().toISOString(); demoWrite(d); }
      return true;
    }
    return await rest('rpc/report_done', { method: 'POST', body: { p_id: id } });
  };

  DB.community = {
    REACTIONS,

    /* ---------- 피드 ---------- */
    async feed(opt) {
      const o = opt || {};
      if (!HAS_SB) {
        const d = cdemo(), meId = myDemoId();
        let list = d.posts.slice()
          .filter(p => !p.hidden || p.author_id === meId)
          .filter(p => !o.type || p.type === o.type)
          /* 공식 설문은 설문 탭에만 */
          .filter(p => o.type || p.type !== 'poll')
          /* 맨 위에 고정된 공지는 목록에 또 넣지 않는다 */
          .filter(p => !(p.type === 'notice' && p.pinned))
          .filter(p => !o.place || p.place === o.place)
          .filter(p => !o.cursor || String(p.created_at) < String(o.cursor))
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
          .slice(0, o.limit || 20);
        const pins = o.cursor ? [] : d.posts
          .filter(p => p.type === 'notice' && p.pinned && !p.hidden)
          .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        return {
          rows: list.map(p => demoPostRow(d, p, meId)),
          cursor: list.length ? list[list.length - 1].created_at : null,
          pinned: pins.slice(0, 3).map(p => ({
            id: p.id, body: p.body, created_at: p.created_at,
            author: (demoMember(p.author_id) || {}).name
          })),
          pinned_total: pins.length
        };
      }
      return await rest('rpc/feed', {
        method: 'POST', body: {
          p_cursor: o.cursor || null, p_type: o.type || null,
          p_place: o.place || null, p_limit: o.limit || 20
        }
      });
    },

    /* ---------- 글 ---------- */
    /* 사진은 이미 줄여둔 dataURL 배열로 받는다 */
    async createPost(v) {
      const photos = (v.photos || []).slice(0, 10);
      if (!HAS_SB) {
        const d = cdemo(), meId = myDemoId();
        if (!meId) throw new Error('로그인이 풀렸어요');
        const p = {
          id: uid(), created_at: new Date().toISOString(), author_id: meId,
          type: v.type || 'review', event_id: v.event_id || null,
          place: v.place || null, date: v.date || null,
          body: String(v.body || ''), pinned: !!v.pinned, hidden: false, edited_at: null,
          insta_ok: !!v.insta_ok, is_question: !!v.is_question,
          best_comment_id: null, solved_at: null
        };
        d.posts.push(p);
        photos.forEach((src, i) => d.post_photos.push({ id: uid(), post_id: p.id, path: src, sort: i }));
        (v.animals || []).forEach(aid =>
          d.post_animals.push({ post_id: p.id, animal_id: aid }));
        if (v.poll) {
          const made = (v.poll.options || []).map((lb, i) => {
            const o = { id: uid(), post_id: p.id, label: lb, sort: i };
            d.poll_options.push(o);
            return o;
          });
          d.polls.push({
            post_id: p.id, question: v.poll.question, multi: !!v.poll.multi,
            anonymous: !!v.poll.anonymous, closes_at: v.poll.closes_at || null, closed_at: null,
            reveal_at: v.poll.reveal_at || null, revealed_at: null,
            answer_option_id: v.poll.answer_index != null && made[v.poll.answer_index]
              ? made[v.poll.answer_index].id : null
          });
        }
        demoWrite(d);
        return { id: p.id };
      }
      const rows = await rest('posts', {
        method: 'POST', prefer: 'return=representation',
        body: {
          type: v.type || 'review', event_id: v.event_id || null,
          place: v.place || null, date: v.date || null,
          body: String(v.body || ''), pinned: !!v.pinned,
          insta_ok: !!v.insta_ok, is_question: !!v.is_question,
          author_id: await DB.community.myId()
        }
      });
      const id = rows && rows[0] && rows[0].id;
      if (!id) throw new Error('글을 올리지 못했어요');
      if (photos.length) {
        const paths = [];
        for (let i = 0; i < photos.length; i++) paths.push(await DB.community.uploadPhoto(id, photos[i], i));
        await rest('post_photos', {
          method: 'POST', prefer: 'return=minimal',
          body: paths.map((pth, i) => ({ post_id: id, path: pth, sort: i }))
        });
      }
      if ((v.animals || []).length) {
        await rest('post_animals', {
          method: 'POST', prefer: 'return=minimal,resolution=ignore-duplicates',
          body: v.animals.map(aid => ({ post_id: id, animal_id: aid }))
        });
      }
      if (v.poll) {
        await rest('polls', {
          method: 'POST', prefer: 'return=minimal',
          body: {
            post_id: id, question: v.poll.question, multi: !!v.poll.multi,
            anonymous: !!v.poll.anonymous, closes_at: v.poll.closes_at || null,
            reveal_at: v.poll.reveal_at || null
          }
        });
        /* 선택지를 먼저 넣고, 그 중 몇 번째가 정답인지 뒤에 이어 붙인다.
           정답 칸은 선택지 id 를 가리키기 때문이다. */
        const opts = await rest('poll_options', {
          method: 'POST', prefer: 'return=representation',
          body: (v.poll.options || []).map((lb, i) => ({ post_id: id, label: lb, sort: i }))
        });
        if (v.poll.answer_index != null && opts && opts.length) {
          const sorted = opts.slice().sort((a, b) => (a.sort || 0) - (b.sort || 0));
          const ans = sorted[v.poll.answer_index];
          if (ans) await rest('polls?post_id=eq.' + encodeURIComponent(id), {
            method: 'PATCH', prefer: 'return=minimal',
            body: { answer_option_id: ans.id }
          });
        }
      }
      return { id };
    },

    async updatePost(id, patch) {
      if (!HAS_SB) {
        const d = cdemo(), p = d.posts.find(x => x.id === id);
        if (!p) throw new Error('글을 찾지 못했어요');
        Object.assign(p, patch, { edited_at: new Date().toISOString() });
        demoWrite(d); return true;
      }
      await rest('posts?id=eq.' + enc(id), {
        method: 'PATCH', prefer: 'return=minimal',
        body: Object.assign({}, patch, { edited_at: new Date().toISOString() })
      });
      return true;
    },

    /* 글을 지운다. 사진 파일까지 같이 치운다 —
       표의 줄은 외래키가 알아서 따라 지워지지만, Storage 파일은 안 그렇다. */
    async removePost(id, paths) {
      if (!HAS_SB) {
        const d = cdemo();
        d.posts = d.posts.filter(p => p.id !== id);
        d.post_photos = d.post_photos.filter(f => f.post_id !== id);
        d.comments = d.comments.filter(c => c.post_id !== id);
        d.reactions = d.reactions.filter(r => r.post_id !== id);
        d.post_animals = (d.post_animals || []).filter(a => a.post_id !== id);
        d.polls = (d.polls || []).filter(q => q.post_id !== id);
        d.poll_options = (d.poll_options || []).filter(o => o.post_id !== id);
        d.poll_votes = (d.poll_votes || []).filter(v => v.post_id !== id);
        (d.reports || []).forEach(r => { if (r.post_id === id) r.done_at = new Date().toISOString(); });
        demoWrite(d); return true;
      }

      /* 사진 먼저 — 줄이 사라지면 어떤 파일이었는지 알 수 없다 */
      const files = (paths || []).filter(Boolean);
      if (files.length) {
        try {
          await fetch(C.SUPABASE_URL + '/storage/v1/object/community', {
            method: 'DELETE',
            headers: {
              apikey: C.SUPABASE_ANON_KEY,
              Authorization: 'Bearer ' + session.access_token,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ prefixes: files })
          });
        } catch (e) { /* 파일이 남아도 글은 지운다 */ }
      }

      await rest('posts?id=eq.' + enc(id), { method: 'DELETE', prefer: 'return=minimal' });
      /* 이 글에 대한 신고는 처리된 것으로 */
      try {
        await rest('reports?post_id=eq.' + enc(id) + '&done_at=is.null', {
          method: 'PATCH', prefer: 'return=minimal',
          body: { done_at: new Date().toISOString() }
        });
      } catch (e) { }
      return true;
    },

    setPinned: (id, on) => DB.community.updatePost(id, { pinned: !!on }),

    /* ---------- 댓글 ---------- */
    async comments(postId) {
      if (!HAS_SB) {
        const d = cdemo(), meId = myDemoId();
        return d.comments.filter(c => c.post_id === postId)
          .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
          .map(c => ({
            id: c.id, created_at: c.created_at, parent_id: c.parent_id || null,
            body: c.hidden ? '' : c.body, hidden: !!c.hidden, edited_at: c.edited_at || null,
            mine: c.author_id === meId, author: demoMember(c.author_id)
          }));
      }
      return await rest('rpc/post_comments', { method: 'POST', body: { p_post: postId } }) || [];
    },

    async addComment(postId, body, parentId) {
      const text = String(body || '').trim();
      if (!text) throw new Error('내용을 적어주세요');
      if (!HAS_SB) {
        const d = cdemo(), meId = myDemoId();
        if (!meId) throw new Error('로그인이 풀렸어요');
        d.comments.push({
          id: uid(), created_at: new Date().toISOString(), post_id: postId,
          parent_id: parentId || null, author_id: meId, body: text, hidden: false, edited_at: null
        });
        const made = d.comments[d.comments.length - 1];
        demoWrite(d); return { id: made.id };
      }
      /* 만든 댓글의 id 를 돌려준다 — @ 로 부른 사람을 그 댓글에 매단다 */
      const r = await rest('comments', {
        method: 'POST', prefer: 'return=representation',
        body: {
          post_id: postId, parent_id: parentId || null,
          body: text, author_id: await DB.community.myId()
        }
      });
      return (Array.isArray(r) ? r[0] : r) || { id: null };
    },

    /* 댓글 좋아요 — 눌렀다 뗐다 */
    async likeComment(commentId) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        if (!me) return { ok: false, why: 'nomember' };
        d.comment_likes = d.comment_likes || [];
        const i = d.comment_likes.findIndex(x => x.comment_id === commentId && x.member_id === me);
        if (i >= 0) d.comment_likes.splice(i, 1);
        else d.comment_likes.push({ comment_id: commentId, member_id: me, created_at: new Date().toISOString() });
        demoWrite(d);
        return { ok: true, on: i < 0, n: d.comment_likes.filter(x => x.comment_id === commentId).length };
      }
      return await rest('rpc/comment_like_toggle', {
        method: 'POST', body: { p_comment: commentId }
      });
    },

    /* @ 를 칠 때 보여 줄 이름들 */
    async mentionPeople(q) {
      if (!HAS_SB) {
        const d = cdemo();
        const s2 = String(q || '').trim();
        return (d.members || [])
          .filter(m => m.status !== 'left' && (!s2 || String(m.name).indexOf(s2) >= 0))
          .slice(0, 20)
          .map(m => ({ id: m.id, name: m.name, photo: m.photo_path || null }));
      }
      return await rest('rpc/mention_people', {
        method: 'POST', body: { p_q: String(q || '') }
      }) || [];
    },

    /* 부른 사실을 적는다 — 불린 사람에게 알림이 간다 */
    async mentionAdd(ids, postId, commentId, detail) {
      if (!HAS_SB) return { ok: true, n: (ids || []).length };
      return await rest('rpc/mention_add', {
        method: 'POST',
        body: {
          p_ids: ids || [], p_post: postId || null,
          p_comment: commentId || null, p_detail: String(detail || '')
        }
      });
    },

    async updateComment(id, body) {
      const text = String(body || '').trim();
      if (!text) throw new Error('내용을 적어주세요');
      if (!HAS_SB) {
        const d = cdemo(), c = d.comments.find(x => x.id === id);
        if (c) { c.body = text; c.edited_at = new Date().toISOString(); demoWrite(d); }
        return true;
      }
      await rest('comments?id=eq.' + enc(id), {
        method: 'PATCH', prefer: 'return=minimal',
        body: { body: text, edited_at: new Date().toISOString() }
      });
      return true;
    },

    async removeComment(id) {
      if (!HAS_SB) {
        const d = cdemo(); d.comments = d.comments.filter(c => c.id !== id); demoWrite(d); return true;
      }
      await rest('comments?id=eq.' + enc(id), { method: 'DELETE', prefer: 'return=minimal' });
      return true;
    },


    /* ---------- 반응 ---------- */
    /* 같은 걸 다시 누르면 취소된다 */
    async toggleReaction(postId, kind) {
      if (REACTIONS.indexOf(kind) < 0) throw new Error('없는 반응이에요');
      if (!HAS_SB) {
        const d = cdemo(), meId = myDemoId();
        if (!meId) throw new Error('로그인이 풀렸어요');
        const i = d.reactions.findIndex(r =>
          r.post_id === postId && r.member_id === meId && r.kind === kind);
        if (i >= 0) d.reactions.splice(i, 1);
        else d.reactions.push({ post_id: postId, member_id: meId, kind, created_at: new Date().toISOString() });
        demoWrite(d);
        return i < 0;
      }
      const meId = await DB.community.myId();
      const q = 'reactions?post_id=eq.' + enc(postId) +
        '&member_id=eq.' + enc(meId) + '&kind=eq.' + enc(kind);
      const has = await rest(q + '&select=kind');
      if (has && has.length) {
        await rest(q, { method: 'DELETE', prefer: 'return=minimal' });
        return false;
      }
      await rest('reactions', {
        method: 'POST', prefer: 'return=minimal',
        body: { post_id: postId, member_id: meId, kind }
      });
      return true;
    },

    /* 길게 누르면 누가 눌렀는지 — 이름만 */
    async reactionWho(postId, kind) {
      if (!HAS_SB) {
        const d = cdemo();
        return d.reactions.filter(r => r.post_id === postId && r.kind === kind)
          .map(r => demoMember(r.member_id)).filter(Boolean)
          .map(m => ({ name: m.name, photo: m.photo_path || null }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      }
      return await rest('rpc/reaction_who', {
        method: 'POST', body: { p_post: postId, p_kind: kind }
      }) || [];
    },

    /* ---------- 설문 ---------- */
    /* 마감 전까지만 바꿀 수 있다. 하나만 고르는 설문이면 기존 답을 치우고 넣는다 */

    async vote(postId, optionId, multi) {
      if (!HAS_SB) {
        const d = cdemo(), meId = myDemoId();
        if (!meId) throw new Error('로그인이 풀렸어요');
        const q = d.polls.find(x => x.post_id === postId);
        if (pollClosed(q)) throw new Error('마감된 설문이에요');
        const mine = d.poll_votes.filter(v => v.post_id === postId && v.member_id === meId);
        const had = mine.some(v => v.option_id === optionId);
        d.poll_votes = d.poll_votes.filter(v =>
          !(v.post_id === postId && v.member_id === meId && (!multi || v.option_id === optionId)));
        if (!had) d.poll_votes.push({
          post_id: postId, option_id: optionId, member_id: meId,
          created_at: new Date().toISOString()
        });
        demoWrite(d);
        return !had;
      }
      const meId = await DB.community.myId();
      const base = 'poll_votes?post_id=eq.' + enc(postId) + '&member_id=eq.' + enc(meId);
      const mine = await rest(base + '&select=option_id');
      const had = (mine || []).some(v => v.option_id === optionId);
      /* 하나만 고르는 설문이면 내 답을 모두 치운다 */
      await rest(base + (multi ? '&option_id=eq.' + enc(optionId) : ''),
        { method: 'DELETE', prefer: 'return=minimal' });
      if (!had) {
        await rest('poll_votes', {
          method: 'POST', prefer: 'return=minimal',
          body: { post_id: postId, option_id: optionId, member_id: meId }
        });
      }
      return !had;
    },

    /* 만든 사람이나 운영진이 일찍 마감 */
    async closePoll(postId) {
      if (!HAS_SB) {
        const d = cdemo(), q = d.polls.find(x => x.post_id === postId);
        if (q) { q.closed_at = new Date().toISOString(); demoWrite(d); }
        return true;
      }
      await rest('polls?post_id=eq.' + enc(postId), {
        method: 'PATCH', prefer: 'return=minimal',
        body: { closed_at: new Date().toISOString() }
      });
      return true;
    },

    /* 익명이 아닐 때만 — 누가 이 선택지를 골랐나 (이름만) */
    async pollWho(optionId) {
      if (!HAS_SB) {
        const d = cdemo();
        return d.poll_votes.filter(v => v.option_id === optionId)
          .map(v => demoMember(v.member_id)).filter(Boolean)
          .map(m => ({ name: m.name, photo: m.photo_path || null }))
          .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      }
      return await rest('rpc/poll_who', {
        method: 'POST', body: { p_option: optionId }
      }) || [];
    },

    /* ---------- 오늘 만난 친구 ---------- */
    async animalsAt(place) {
      if (!HAS_SB) {
        const d = cdemo();
        return (d.animals || [])
          .filter(a => !place || a.place === place)
          .map(a => ({
            id: a.id, place: a.place, name: a.name,
            adopted: !!a.adopted_at, adopted_at: a.adopted_at,
            posts: (d.post_animals || []).filter(x => x.animal_id === a.id).length
          }))
          .sort((x, y) => (x.adopted - y.adopted) || x.name.localeCompare(y.name, 'ko'));
      }
      return await rest('rpc/animals_at', { method: 'POST', body: { p_place: place || null } });
    },

    /* 없는 이름이면 새로 만든다. 후기를 쓰다 바로 더할 수 있게. */
    async animalAdd(place, name) {
      if (!HAS_SB) {
        const d = cdemo();
        d.animals = d.animals || [];
        let a = d.animals.find(x => x.place === place && x.name === name);
        if (!a) {
          a = { id: uid(), place: place, name: name, adopted_at: null,
                created_at: new Date().toISOString() };
          d.animals.push(a);
          demoWrite(d);
        }
        return a;
      }
      const rows = await rest('animals', {
        method: 'POST', prefer: 'return=representation,resolution=merge-duplicates',
        body: { place: place, name: name }
      });
      return rows && rows[0];
    },

    async animalAdopted(id, yes) {
      if (!HAS_SB) {
        const d = cdemo(), a = (d.animals || []).find(x => x.id === id);
        if (a) { a.adopted_at = yes ? DB.today() : null; demoWrite(d); }
        return true;
      }
      await rest('animals?id=eq.' + encodeURIComponent(id), {
        method: 'PATCH', prefer: 'return=minimal',
        body: { adopted_at: yes ? DB.today() : null }
      });
      return true;
    },

    /* ---------- 「도움 됐어요」 ---------- */
    async markBest(postId, commentId) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        const p = (d.posts || []).find(x => x.id === postId);
        if (!p) return { ok: false, why: 'notfound' };
        if (p.author_id !== me) return { ok: false, why: 'notmine' };
        if (p.best_comment_id === commentId) {
          p.best_comment_id = null; p.solved_at = null;
          demoWrite(d); return { ok: true, solved: false };
        }
        p.best_comment_id = commentId;
        p.solved_at = new Date().toISOString();
        demoWrite(d); return { ok: true, solved: true };
      }
      return await rest('rpc/mark_best', {
        method: 'POST', body: { p_post: postId, p_comment: commentId }
      });
    },

    /* ---------- 신고 ---------- */
    async report(o) {
      if (!HAS_SB) {
        const d = cdemo();
        d.reports = d.reports || [];
        const me = myDemoId();
        const dup = d.reports.some(r => r.reporter_id === me && !r.done_at &&
          r.post_id === (o.post || null) && r.comment_id === (o.comment || null));
        if (!dup) {
          d.reports.push({
            id: uid(), created_at: new Date().toISOString(), reporter_id: me,
            post_id: o.post || null, comment_id: o.comment || null,
            reason: o.reason || '', done_at: null
          });
          demoWrite(d);
        }
        return true;
      }
      return await rest('rpc/report_send', {
        method: 'POST',
        body: { p_post: o.post || null, p_comment: o.comment || null, p_reason: o.reason || '' }
      });
    },

    /* ---------- 현장 출석 ---------- */
    async checkinOpen(eventId) {
      if (!HAS_SB) {
        const d = cdemo(), e = (d.events || []).find(x => x.id === eventId);
        if (!e) return null;
        if (!e.checkin_code) {
          e.checkin_code = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
          demoWrite(d);
        }
        return e.checkin_code;
      }
      return await rest('rpc/checkin_open', { method: 'POST', body: { p_event: eventId } });
    },

    async checkinDo(eventId, code) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        const e = (d.events || []).find(x => x.id === eventId);
        if (!e) return { ok: false, why: 'noevent' };
        if (String(e.date) !== DB.today()) return { ok: false, why: 'notToday' };
        if (!e.checkin_code || e.checkin_code !== String(code).trim()) {
          return { ok: false, why: 'wrong' };
        }
        d.checkins = d.checkins || [];
        if (!d.checkins.some(c => c.event_id === eventId && c.member_id === me)) {
          d.checkins.push({ event_id: eventId, member_id: me, created_at: new Date().toISOString() });
          demoWrite(d);
        }
        return { ok: true, place: e.place, date: e.date };
      }
      return await rest('rpc/checkin_do', {
        method: 'POST', body: { p_event: eventId, p_code: String(code).trim() }
      });
    },

    /* ---------- 내 지난 설문 ----------
       활동의견 설문과 1365 명부. 내 것만 돌려준다. */
    async surveyHistory() {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        return {
          open: true,
          survey: (d.survey_responses || []).filter(r => r.member_id === me)
            .map(r => ({
              id: r.id, at: r.created_at, topic: r.topic,
              party: r.party, station: r.station, opinion: r.opinion
            })),
          id1365: (d.member_1365 || []).filter(t => t.member_id === me)
            .map(t => ({
              id: t.id, at: t.updated_at, portal_id: t.portal_id,
              birth: t.birth, student_id: t.student_id
            })),
          ambiguous: false
        };
      }
      return await rest('rpc/my_survey_history', { method: 'POST', body: {} });
    },

    async surveyUpdate(id, v) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        const r = (d.survey_responses || []).find(x => x.id === id && x.member_id === me);
        if (!r) throw new Error('응답을 찾지 못했어요');
        if (v.party != null) r.party = v.party;
        if (v.station != null) r.station = v.station;
        if (v.opinion != null) r.opinion = v.opinion;
        demoWrite(d); return true;
      }
      return await rest('rpc/my_survey_update', {
        method: 'POST',
        body: {
          p_id: id, p_party: v.party || null,
          p_station: v.station || null, p_opinion: v.opinion || null
        }
      });
    },

    /* ---------- 후기 남기기 권유 ----------
       다녀왔는데 아직 안 쓴 봉사 하나. 7일까지만 권한다. */
    async reviewPrompt() {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        if (!me) return null;
        const today = DB.today();
        const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
        const mine = (d.attendance || []).filter(a => a.member_id === me);
        const cands = mine
          .map(a => (d.events || []).find(e => e.id === a.event_id))
          .filter(e => e && String(e.date) <= today && String(e.date) >= weekAgo)
          .filter(e => !(d.posts || []).some(p =>
            p.type === 'review' && p.event_id === e.id && p.author_id === me && !p.hidden))
          .sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const e = cands[0];
        return e ? {
          event_id: e.id, date: e.date, place: e.place, title: e.title,
          confirmed: !!e.confirmed_at
        } : null;
      }
      return await rest('rpc/my_review_prompt', { method: 'POST', body: {} });
    },

    /* ---------- 퀴즈 정답 발표 ----------
       예약 시각이 지났으면 누가 열어도, 아직이면 만든 사람만.
       E단계에 pg_cron 이 들어오면 시간 맞춰 저절로 돈다. */
    async revealQuiz(postId) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        const q = (d.polls || []).find(x => x.post_id === postId);
        if (!q || !q.answer_option_id) return null;
        if (q.revealed_at) return { ok: true, already: true };
        const post = (d.posts || []).find(x => x.id === postId);
        const early = q.reveal_at && Date.parse(q.reveal_at) > Date.now();
        if (early && (!post || post.author_id !== me)) return { ok: false, why: 'early' };

        q.revealed_at = new Date().toISOString();
        const ansOpt = (d.poll_options || []).find(o => o.id === q.answer_option_id);
        const ans = ansOpt ? ansOpt.label : '';
        const seen = {};
        (d.poll_votes || []).filter(v => v.post_id === postId).forEach(v => {
          if (seen[v.member_id]) return;
          seen[v.member_id] = true;
          d.member_notices = d.member_notices || [];
          d.member_notices.push({
            id: uid(), member_id: v.member_id, kind: 'quiz', post_id: postId,
            body: v.option_id === q.answer_option_id
              ? '정답이에요! ' + ans + ' 였어요 🐾'
              : '아쉬워요! 정답은 ' + ans + ' 였어요',
            created_at: new Date().toISOString(), read_at: null
          });
        });
        demoWrite(d);
        return { ok: true, told: Object.keys(seen).length };
      }
      return await rest('rpc/reveal_quiz', { method: 'POST', body: { p_post: postId } });
    },

    /* ---------- 봉사 탭 한 번에 ----------
       일정마다 따로 묻던 것을 하나로 모았다 */
    async volBoard() {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        const today = DB.today();
        const posts = d.posts || [];
        const wl = d.event_waitlist || [];
        const soon = (d.events || []).filter(e => String(e.date) >= today)
          .sort((a, b) => String(a.date).localeCompare(String(b.date)))
          .map(e => {
            const mineW = wl.filter(w => w.event_id === e.id)
              .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
            const idx = mineW.findIndex(w => w.member_id === me);
            return {
              id: e.id, date: e.date, title: e.title, place: e.place,
              start_time: e.start_time, capacity: e.capacity,
              taken: (d.attendance || []).filter(a => a.event_id === e.id).length,
              mine: (d.attendance || []).some(a => a.event_id === e.id && a.member_id === me),
              wait_pos: idx >= 0 ? idx + 1 : null
            };
          });
        const past = (d.events || []).filter(e => String(e.date) < today)
          .sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 12)
          .map(e => ({
            id: e.id, date: e.date, place: e.place,
            confirmed: !!e.confirmed_at,
            reviews: posts.filter(p => p.type === 'review' && p.event_id === e.id && !p.hidden).length,
            went: (d.attendance || []).some(a => a.event_id === e.id && a.member_id === me)
          }));
        return { soon, past };
      }
      return await rest('rpc/vol_board', { method: 'POST', body: { p_days: 120 } });
    },

    /* ---------- 대기 신청 ---------- */
    async myWaitlist() {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        if (!me) return [];
        const w = d.event_waitlist || [];
        return w.filter(x => x.member_id === me).map(x => ({
          event_id: x.event_id,
          pos: w.filter(y => y.event_id === x.event_id &&
            String(y.created_at) <= String(x.created_at)).length
        }));
      }
      return await rest('rpc/my_waitlist', { method: 'POST', body: {} }) || [];
    },

    async waitJoin(eventId) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        if (!me) return 'nomatch';
        const e = (d.events || []).find(x => x.id === eventId);
        if (!e) return 'noevent';
        if ((d.attendance || []).some(a => a.event_id === eventId && a.member_id === me)) return 'dup';
        const cap = Number(e.capacity) || 0;
        const taken = (d.attendance || []).filter(a => a.event_id === eventId).length;
        if (!cap || taken < cap) return 'notfull';
        d.event_waitlist = d.event_waitlist || [];
        if (!d.event_waitlist.some(w => w.event_id === eventId && w.member_id === me))
          d.event_waitlist.push({ id: uid(), event_id: eventId, member_id: me, created_at: new Date().toISOString() });
        demoWrite(d); return 'ok';
      }
      return await rest('rpc/waitlist_join', { method: 'POST', body: { p_event: eventId } });
    },

    async waitLeave(eventId) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        d.event_waitlist = (d.event_waitlist || [])
          .filter(w => !(w.event_id === eventId && w.member_id === me));
        demoWrite(d); return 'ok';
      }
      return await rest('rpc/waitlist_leave', { method: 'POST', body: { p_event: eventId } });
    },

    /* ---------- 프로필 사진 ---------- */
    /* 정사각형으로 잘라 400px 로 줄인다. 줄이면서 위치정보도 떨어진다 */
    async setMyPhoto(dataUrl) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        const m = (d.members || []).find(x => x.id === me);
        if (!m) throw new Error('로그인이 풀렸어요');
        m.photo_path = dataUrl || null;
        demoWrite(d); return dataUrl || null;
      }
      if (!dataUrl) {
        await rest('rpc/set_my_photo', { method: 'POST', body: { p_path: '' } });
        return null;
      }
      const meId = await DB.community.myId();
      const blob = await (await fetch(dataUrl)).blob();
      const path = meId + '/' + Date.now() + '.jpg';
      const r = await fetch(C.SUPABASE_URL + '/storage/v1/object/avatars/' + path, {
        method: 'POST',
        headers: {
          apikey: C.SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': blob.type || 'image/jpeg'
        },
        body: blob
      });
      if (!r.ok) throw new Error('사진을 올리지 못했어요');
      await rest('rpc/set_my_photo', { method: 'POST', body: { p_path: path } });
      return path;
    },

    /* 비공개 보관함이라 볼 때마다 서명된 주소를 받는다 */
    async avatarUrl(path) {
      if (!path) return '';
      if (!HAS_SB || /^data:/.test(path)) return path;
      /* 같은 사람 사진을 화면마다 다시 받아오지 않게 한 번만 받아 둔다.
         서명된 주소는 한 시간짜리라 55분이 지나면 다시 받는다. */
      const hit = AVATAR_CACHE.get(path);
      if (hit && hit.until > Date.now()) return hit.url;
      if (hit && hit.pending) return await hit.pending;
      const job = (async () => {
        const r = await fetch(C.SUPABASE_URL + '/storage/v1/object/sign/avatars/' + path, {
          method: 'POST',
          headers: {
            apikey: C.SUPABASE_ANON_KEY,
            Authorization: 'Bearer ' + session.access_token,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ expiresIn: 3600 })
        });
        if (!r.ok) { AVATAR_CACHE.delete(path); return ''; }
        const j = await r.json().catch(() => ({}));
        const url = j.signedURL ? C.SUPABASE_URL + '/storage/v1' + j.signedURL : '';
        AVATAR_CACHE.set(path, { url, until: Date.now() + 55 * 60 * 1000 });
        return url;
      })();
      AVATAR_CACHE.set(path, { pending: job, until: 0 });
      return await job;
    },

    /* ---------- 새 소식 ---------- */
    /* 내 글에 달린 댓글·반응. 내가 한 것은 세지 않는다 */
    async news() {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        if (!me) return [];
        const mine = d.posts.filter(p => p.author_id === me).map(p => p.id);
        const out = [];
        d.comments.filter(c => mine.indexOf(c.post_id) >= 0 && c.author_id !== me && !c.hidden)
          .forEach(c => out.push({
            kind: 'comment', at: c.created_at, post_id: c.post_id,
            who: (demoMember(c.author_id) || {}).name, detail: c.body, react: null
          }));
        d.reactions.filter(r => mine.indexOf(r.post_id) >= 0 && r.member_id !== me)
          .forEach(r => out.push({
            kind: 'reaction', at: r.created_at || new Date().toISOString(), post_id: r.post_id,
            who: (demoMember(r.member_id) || {}).name, detail: null, react: r.kind
          }));
        (d.member_notices || []).filter(n => n.member_id === me)
          .forEach(n => out.push({
            kind: n.kind, at: n.created_at, post_id: null,
            who: null, detail: n.detail, react: null
          }));
        return out.sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 30);
      }
      return await rest('rpc/my_news', { method: 'POST', body: { p_limit: 30 } }) || [];
    },

    /* ---------- 봉사 신청 (로그인한 구성원) ---------- */
    /* 이름이 아니라 내 id 로 한다. 동명이인이 있어도 섞이지 않는다 */
    async mySignups() {
      if (!HAS_SB) {
        const id = myDemoId();
        if (!id) return [];
        return (cdemo().attendance || [])
          .filter(a => a.member_id === id).map(a => a.event_id);
      }
      return await rest('rpc/my_signups', { method: 'POST', body: {} }) || [];
    },

    async signup(eventId) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        if (!me) return 'nomatch';
        const e = (d.events || []).find(x => x.id === eventId);
        if (!e) return 'noevent';
        if (e.signup_open_at && Date.now() < Date.parse(e.signup_open_at)) return 'before';
        d.attendance = d.attendance || [];
        if (d.attendance.some(a => a.event_id === eventId && a.member_id === me)) return 'dup';
        const taken = d.attendance.filter(a => a.event_id === eventId).length;
        if (Number(e.capacity) > 0 && taken >= Number(e.capacity)) return 'full';
        d.attendance.push({ id: uid(), event_id: eventId, member_id: me, hours: 0 });
        demoWrite(d); return 'ok';
      }
      return await rest('rpc/event_signup_me', { method: 'POST', body: { p_event: eventId } });
    },

    async cancelSignup(eventId) {
      if (!HAS_SB) {
        const d = cdemo(), me = myDemoId();
        d.attendance = (d.attendance || []).filter(a => !(a.event_id === eventId && a.member_id === me));
        promoteWait(d, eventId);
        demoWrite(d); return 'ok';
      }
      return await rest('rpc/event_cancel_me', { method: 'POST', body: { p_event: eventId } });
    },

    /* ---------- 사진 ---------- */
    /* 비공개 버킷에 올리고, 볼 때는 서명된 주소를 받아온다 */
    async uploadPhoto(postId, dataUrl, i) {
      const blob = await (await fetch(dataUrl)).blob();
      const path = postId + '/' + Date.now() + '-' + i + '.jpg';
      const r = await fetch(C.SUPABASE_URL + '/storage/v1/object/community/' + path, {
        method: 'POST',
        headers: {
          apikey: C.SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': blob.type || 'image/jpeg'
        },
        body: blob
      });
      if (!r.ok) throw new Error('사진을 올리지 못했어요');
      return path;
    },

    async photoUrl(path) {
      if (!HAS_SB) return path;               /* 체험 모드는 dataURL 그대로 */
      if (!path) return '';
      if (/^data:/.test(path)) return path;
      const r = await fetch(C.SUPABASE_URL + '/storage/v1/object/sign/community/' + path, {
        method: 'POST',
        headers: {
          apikey: C.SUPABASE_ANON_KEY,
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ expiresIn: 3600 })
      });
      if (!r.ok) return '';
      const j = await r.json().catch(() => ({}));
      return j.signedURL ? C.SUPABASE_URL + '/storage/v1' + j.signedURL : '';
    },

    /* 내 구성원 id — 서버가 정해준다 */
    async myId() {
      if (!HAS_SB) return myDemoId();
      const v = await rest('rpc/my_member_id', { method: 'POST', body: {} });
      if (!v) throw new Error('명부와 이어진 계정이 아니에요');
      return v;
    }
  };

  window.DB = DB;
})();
