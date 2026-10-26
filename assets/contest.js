/* ============================================================
   사진·영상 콘테스트 — 「내가 찍은 사진이 제일 잘나가 📸」
   · 봉사에서 찍은 사진 1장 또는 영상 1개(30초)에 제목·설명을 붙여 「작품」으로 낸다
   · 한 사람 최대 3작품 · 마감 전까지 고치기·지우기 · 마감 뒤에는 보기만
   · 투표 전까지 작품은 나와 운영진만 본다 — 남에게는 「n작품 도착」 숫자만
   · 시작일이 없으면 구성원에게 안 보이고, 운영진만 「미리보기」로 본다
   · 투표·댓글은 나중에 — 자리만 잡아 둔다 (Contest.voteView 가 생기면 그것을 그린다)
   데이터 (메인 db.js 와 같은 약속):
     DB.contest.info()      → { id, title, start_at, end_at, max_entries, entry_count,
                                phase:'hidden'|'soon'|'open'|'closed' }
     DB.contest.mine()      → [{ id, title, body, media_path, media_kind:'photo'|'video',
                                poster_path, shelter, pet_names, volunteer_id,
                                created_at, updated_at }]
     DB.contest.save(entry) → 새로 내기/고치기 (id 가 있으면 고치기)
                              entry = { id?, title, body, shelter, pet_names, volunteer_id,
                                        media: null(그대로) | { kind:'photo', data:dataURL }
                                             | { kind:'video', file, poster:dataURL } }
     DB.contest.remove(id)
     shelter   — 봉사지(보호소) 이름, 필수. 내가 간 봉사에서 고르면 채워지고, 없으면 직접 적는다
     pet_names — 사진·영상 속 아이 이름들. 빈 배열이면 「이름을 몰라요」
     volunteer_id — 고른 지난 봉사(없어도 됨)
     (있으면) DB.contest.mediaUrl(path) — 없으면 DB.community.photoUrl 로 서명 주소를 받는다
   DB.contest 가 없으면: 체험 모드에서는 이 파일 안의 가짜 저장소로 돈다.
     실서버에서는 아무것도 쓰지 않고 「준비 중」만 보인다.
   쓰는 법:
     Contest.mountCard(box, { onOpen })  — 설문 탭 맨 위 큰 카드 (숨김 단계면 안 그린다)
     Contest.open(root, { onBack })      — root 안을 콘테스트 화면으로 바꾼다
   ============================================================ */
(function () {
  const { esc } = UI;
  const ic = n => window.ic(n);

  /* ---------- 바꾸기 쉬운 값 ---------- */
  const TITLE = '내가 찍은 사진이 제일 잘나가 📸';
  const SUB = '발자국 봉사 사진·영상 콘테스트';
  const MAX_ENTRIES = 3;
  const TITLE_MAX = 20;
  const BODY_MAX = 200;
  const SHELTER_MAX = 30;
  const PET_MAX = 15;
  const PET_COUNT = 10;             /* 아이 이름 개수 — 서버도 11개째부터 막는다 */
  const PET_OVER = '아이 이름은 ' + PET_COUNT + '개까지 적을 수 있어요';
  const PHOTO_SIDE = 2048;          /* 후기(1280)보다 덜 줄인다 */
  const PHOTO_Q = 0.86;
  const VIDEO_MAX_SEC = 30;
  const VIDEO_MAX_MB = 20;
  const DEFAULT_END = '2026-11-30T23:59:59+09:00';
  const PRIZES = [
    { e: '🥇', t: '1등', s: '제일 잘나가' },
    { e: '🥈', t: '2등', s: '완전 잘나가' },
    { e: '🥉', t: '3등', s: '꽤 잘나가' },
    { e: '❤️', t: '인기상', s: '모두의 마음을 훔친' }
  ];

  const isDemo = () => !!(DB.isDemo && DB.isDemo());
  const chars = s => Array.from(String(s || '')).length;
  const KST = { timeZone: 'Asia/Seoul' };
  const dayKST = v => new Date(v).toLocaleDateString('sv-SE', KST);

  /* ---------- 가짜 저장소 (체험 모드 · DB.contest 가 아직 없을 때) ---------- */
  const FKEY = 'baljaguk.contestDemo';
  const fread = () => {
    let d = null;
    try { d = JSON.parse(localStorage.getItem(FKEY) || 'null'); } catch (e) { }
    return d || { start_at: null, end_at: DEFAULT_END, others: 6, entries: [] };
  };
  const fwrite = d => {
    try { localStorage.setItem(FKEY, JSON.stringify(d)); return true; } catch (e) { return false; }
  };
  const fme = () => { try { return localStorage.getItem('baljaguk.demoMe') || 'me'; } catch (e) { return 'me'; } };
  /* 영상은 체험 모드에서 브라우저 안 주소로만 — 새로고침하면 사라진다 (후기 영상과 같다) */
  const fvideo = {};
  const uidF = () => 'ct-' + Math.random().toString(36).slice(2, 10);

  const FAKE = {
    async info() {
      const d = fread(), me = fme();
      return {
        id: 'demo-contest', title: TITLE, start_at: d.start_at, end_at: d.end_at,
        max_entries: MAX_ENTRIES,
        entry_count: d.others + d.entries.filter(x => x.member_id === me).length,
        phase: phaseOf(d.start_at, d.end_at)
      };
    },
    async mine() {
      const me = fme();
      return fread().entries.filter(x => x.member_id === me)
        .map(x => Object.assign({}, x, x.media_kind === 'video' ? { media_path: fvideo[x.id] || '' } : {}))
        .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    },
    async save(v) {
      const d = fread(), me = fme(), now = new Date().toISOString();
      /* 서버가 막을 것을 똑같이 막는다 */
      const ph = phaseOf(d.start_at, d.end_at);
      if (ph !== 'open') throw new Error(ph === 'closed' ? '마감돼서 고칠 수 없어요' : '아직 시작 전이에요');
      checkText(v);
      let x = v.id ? d.entries.find(e => e.id === v.id && e.member_id === me) : null;
      if (v.id && !x) throw new Error('작품을 찾지 못했어요');
      if (!x) {
        if (d.entries.filter(e => e.member_id === me).length >= MAX_ENTRIES)
          throw new Error('작품은 ' + MAX_ENTRIES + '개까지 낼 수 있어요');
        if (!v.media) throw new Error('사진이나 영상을 골라 주세요');
        x = { id: uidF(), member_id: me, created_at: now };
        d.entries.push(x);
      }
      Object.assign(x, { title: v.title.trim(), body: v.body.trim(), shelter: String(v.shelter || '').trim(),
        pet_names: cleanNames(v.pet_names), volunteer_id: v.volunteer_id || null, updated_at: now });
      if (v.media && v.media.kind === 'photo') {
        Object.assign(x, { media_kind: 'photo', media_path: v.media.data, poster_path: null });
      } else if (v.media && v.media.kind === 'video') {
        fvideo[x.id] = URL.createObjectURL(v.media.file);
        Object.assign(x, { media_kind: 'video', media_path: '', poster_path: v.media.poster || null });
      }
      if (!fwrite(d)) {
        /* 2048px 사진 세 장이면 브라우저 저장 칸이 찰 수 있다 — 작게 줄여 다시 */
        if (x.media_kind === 'photo') x.media_path = await shrink(x.media_path, 900);
        if (!fwrite(d)) throw new Error('체험 모드 저장 칸이 가득 찼어요');
      }
      return { id: x.id };
    },
    async remove(id) {
      const d = fread(), me = fme();
      if (phaseOf(d.start_at, d.end_at) !== 'open') throw new Error('마감돼서 지울 수 없어요');
      d.entries = d.entries.filter(e => !(e.id === id && e.member_id === me));
      delete fvideo[id];
      fwrite(d);
      return { ok: true };
    }
  };

  /* 실서버인데 DB.contest 가 아직 없을 때 — 아무것도 안 쓴다 */
  const NONE = {
    async info() { return null; },
    async mine() { return []; },
    async save() { throw new Error('콘테스트를 준비하고 있어요'); },
    async remove() { throw new Error('콘테스트를 준비하고 있어요'); }
  };
  const api = () => (DB.contest ? DB.contest : (isDemo() ? FAKE : NONE));
  const usingFake = () => !DB.contest && isDemo();

  function phaseOf(start, end) {
    if (!start) return 'hidden';
    const now = Date.now();
    if (now < Date.parse(start)) return 'soon';
    if (end && now > Date.parse(end)) return 'closed';
    return 'open';
  }
  function checkText(v) {
    const t = String(v.title || '').trim(), b = String(v.body || '').trim();
    if (!t) throw new Error('제목을 적어 주세요');
    if (chars(t) > TITLE_MAX) throw new Error('제목은 ' + TITLE_MAX + '자까지예요');
    if (!b) throw new Error('설명을 적어 주세요');
    if (chars(b) > BODY_MAX) throw new Error('설명은 ' + BODY_MAX + '자까지예요');
    if (!String(v.shelter || '').trim()) throw new Error('어느 봉사지였는지 적어 주세요');
    if (chars(String(v.shelter).trim()) > SHELTER_MAX) throw new Error('봉사지는 ' + SHELTER_MAX + '자까지예요');
    if (cleanNames(v.pet_names).length > PET_COUNT) throw new Error(PET_OVER);
  }
  /* 「봄이, 여름이」 처럼 쉼표로 적어도, 칩으로 골라도 같은 모양 — 겹친 이름은 하나만 */
  function cleanNames(a) {
    const out = [];
    (Array.isArray(a) ? a : String(a || '').split(/[,，、]/)).forEach(n => {
      const t = String(n || '').trim().slice(0, PET_MAX);
      if (t && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }
  /* 작품 카드 · 크게 보기 · 축하 화면에 같이 쓰는 한 줄 */
  function whereLine(x) {
    const n = cleanNames(x.pet_names);
    return '📍' + esc(x.shelter || '봉사지 미정') + ' · 🐾' + (n.length ? esc(n.join(', ')) : '이름 몰라요');
  }

  async function mediaUrl(path) {
    if (!path) return '';
    if (/^(data:|blob:)/.test(path)) return path;
    try {
      if (DB.contest && DB.contest.mediaUrl) return await DB.contest.mediaUrl(path);
      return await DB.community.photoUrl(path);
    } catch (e) { return ''; }
  }

  function shrink(dataUrl, side) {
    return new Promise(res => {
      const im = new Image();
      im.onerror = () => res(dataUrl);
      im.onload = () => {
        const k = Math.min(1, side / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.8));
      };
      im.src = dataUrl;
    });
  }

  /* 고른 영상 — 길이·크기를 보고 첫 장면을 표지로 (후기 영상과 같은 기준) */
  function readVideo(file) {
    return new Promise((resolve, reject) => {
      if (file.size > VIDEO_MAX_MB * 1024 * 1024) return reject(new Error(VIDEO_MAX_MB + 'MB 이하로 줄여서 올려 주세요'));
      const url = URL.createObjectURL(file);
      const v = document.createElement('video');
      v.preload = 'metadata'; v.muted = true; v.playsInline = true;
      v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', '');
      let done = false;
      const end = (err, poster) => {
        if (done) return; done = true; clearTimeout(timer); URL.revokeObjectURL(url);
        err ? reject(new Error(err)) : resolve({ file, poster: poster || '' });
      };
      /* 폰에 따라 seek 가 안 끝난다 — 6초 뒤에는 표지 없이 간다 */
      const timer = setTimeout(() => end(null, ''), 6000);
      v.onerror = () => end('이 영상은 열 수 없어요');
      v.onloadedmetadata = () => {
        if (isFinite(v.duration) && v.duration > VIDEO_MAX_SEC + 0.5) return end(VIDEO_MAX_SEC + '초 이하로 잘라서 올려 주세요');
        const shoot = () => {
          let p = '';
          try {
            const c = document.createElement('canvas');
            c.width = 720; c.height = Math.max(1, Math.round(720 * (v.videoHeight / v.videoWidth || 0.75)));
            c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
            p = c.toDataURL('image/jpeg', 0.75);
          } catch (e) { }
          end(null, p);
        };
        v.onseeked = shoot;
        v.onloadeddata = () => { if (v.readyState >= 2 && v.currentTime > 0) shoot(); };
        try { v.currentTime = 0.1; } catch (e) { shoot(); }
      };
      v.src = url;
      try { v.load(); } catch (e) { }
    });
  }

  /* ---------- 날짜 ---------- */
  const md = v => {
    const d = new Date(v);
    return d.toLocaleDateString('ko-KR', Object.assign({ month: 'long', day: 'numeric', weekday: 'short' }, KST))
      .replace(/\s*\((.)\)/, '($1)').replace(/ (.)요일$/, '($1)');
  };
  const hm = v => new Date(v).toLocaleTimeString('ko-KR', Object.assign({ hour: 'numeric', minute: '2-digit' }, KST));
  function dday(end) {
    const n = Math.round((Date.parse(dayKST(end)) - Date.parse(dayKST(Date.now()))) / 864e5);
    return n > 0 ? 'D-' + n : (n === 0 ? 'D-DAY' : '');
  }

  /* ---------- 모양 ---------- */
  const CSS =
    '.ct-card{display:block;width:100%;border:none;text-align:left;cursor:pointer;color:var(--ink);' +
    'border-radius:var(--r-xl);padding:18px 18px 16px;margin-bottom:12px;position:relative;overflow:hidden;' +
    'background:linear-gradient(135deg,var(--gold-soft),var(--pink-soft) 58%,var(--sky-soft));box-shadow:var(--shadow-sm);font-family:inherit}' +
    '.ct-card .k{font-size:12px;font-weight:800;color:var(--ink-2);letter-spacing:.02em}' +
    '.ct-card .t{display:block;font-family:var(--font-title);font-size:22px;line-height:1.25;margin-top:4px;word-break:keep-all;padding-right:44px}' +
    '.ct-card .s{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:10px;font-size:13px;font-weight:700;color:var(--ink-2)}' +
    '.ct-card .go{position:absolute;right:14px;top:50%;transform:translateY(-50%);width:36px;height:36px;border-radius:50%;' +
    'display:grid;place-items:center;background:var(--surface);color:var(--ink)}' +
    '.ct-card .go svg,.ct-card .go .svg{width:18px;height:18px}' +
    '.ct-tag{display:inline-flex;align-items:center;min-height:24px;padding:2px 10px;border-radius:999px;' +
    'background:var(--ink);color:var(--surface);font-size:12px;font-weight:800;white-space:nowrap}' +
    '.ct-tag.soft{background:var(--surface);color:var(--ink-2)}' +
    '.ct-back{display:inline-flex;align-items:center;gap:4px;min-height:44px;padding:0 10px 0 4px;margin:-6px 0 4px -4px;' +
    'border:none;background:none;color:var(--ink-2);font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}' +
    '.ct-back svg,.ct-back .svg{width:18px;height:18px;transform:rotate(180deg)}' +
    '.ct-pre{background:var(--sky-soft);color:var(--ink);border-radius:14px;padding:11px 14px;font-size:13px;line-height:1.55;margin-bottom:12px;word-break:keep-all}' +
    '.ct-pre b{font-weight:800}' +
    '.ct-pre .chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}' +
    '.ct-pre .chip{min-height:36px}' +
    /* 포스터 머리 */
    '.ct-hero{position:relative;overflow:hidden;border-radius:var(--r-xl);padding:22px 20px 20px;color:var(--ink);' +
    'background:linear-gradient(150deg,var(--gold-soft) 0%,var(--pink-soft) 52%,var(--sky-soft) 100%);box-shadow:var(--shadow-sm)}' +
    '.ct-hero .cam{position:absolute;right:-12px;top:-16px;font-size:68px;line-height:1;opacity:.16;transform:rotate(14deg);pointer-events:none}' +
    '.ct-hero .k{font-size:12.5px;font-weight:800;color:var(--ink-2)}' +
    '.ct-hero h2{font-family:var(--font-title);font-size:29px;line-height:1.18;margin:6px 0 0;word-break:keep-all;letter-spacing:-.01em}' +
    '.ct-hero h2 .hl{background:linear-gradient(transparent 58%,color-mix(in srgb,var(--gold) 45%,transparent) 58%);padding:0 2px}' +
    '.ct-hero .lead{font-size:14px;line-height:1.6;color:var(--ink-2);margin:10px 0 0;word-break:keep-all}' +
    '.ct-hero .meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:14px}' +
    '.ct-dday{display:inline-flex;align-items:center;min-height:30px;padding:3px 12px;border-radius:999px;background:var(--ink);' +
    'color:var(--surface);font-family:var(--font-title);font-size:17px;transform:rotate(-3deg)}' +
    '.ct-hero .when{font-size:13px;font-weight:700;color:var(--ink-2)}' +
    '.ct-count{margin-top:14px;display:flex;align-items:baseline;gap:6px;background:var(--surface);border-radius:16px;padding:10px 14px;font-size:14px;font-weight:700}' +
    '.ct-count .n{font-family:var(--font-title);font-size:24px;color:var(--brand-deep)}' +
    /* 상 */
    '.ct-prizes{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.ct-prize{background:var(--surface);border-radius:var(--r-md);padding:12px 12px 11px;box-shadow:var(--shadow-sm);min-width:0}' +
    '.ct-prize .e{font-size:28px;line-height:1}' +
    '.ct-prize .t{font-family:var(--font-title);font-size:17px;margin-top:6px}' +
    '.ct-prize .s{font-size:12.5px;color:var(--ink-2);margin-top:2px;word-break:keep-all}' +
    '.ct-soon{text-align:center;font-size:13px;font-weight:700;color:var(--ink-2);margin-top:10px}' +
    '.ct-soon span{background:var(--gold-soft);border-radius:999px;padding:4px 12px}' +
    /* 참여 방법 */
    '.ct-steps{display:grid;gap:8px;counter-reset:ct}' +
    '.ct-step{display:flex;gap:12px;align-items:flex-start;background:var(--surface);border-radius:var(--r-md);padding:12px 14px;box-shadow:var(--shadow-sm)}' +
    '.ct-step .no{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:var(--brand-soft);' +
    'color:var(--brand-deep);font-family:var(--font-title);font-size:16px}' +
    '.ct-step .tx{font-size:14px;line-height:1.55;word-break:keep-all;padding-top:4px}' +
    '.ct-step .tx b{font-weight:800}' +
    '.ct-step .tx .mut{display:block;font-size:12.5px;color:var(--ink-3);margin-top:1px}' +
    /* 내 작품 */
    /* ★ 칸 폭을 화면에 묶는다 — 안 묶으면 한 줄로 긴 「📍·🐾」 줄이 칸을 넓혀 화면 전체가 옆으로 밀렸다(이름 10개) */
    '.ct-mine{display:grid;gap:8px;grid-template-columns:minmax(0,1fr)}' +
    '.ct-entry{display:flex;gap:12px;align-items:center;width:100%;min-width:0;border:none;text-align:left;cursor:pointer;color:var(--ink);' +
    'background:var(--surface);border-radius:var(--r-md);padding:10px;box-shadow:var(--shadow-sm);font-family:inherit;min-height:96px}' +
    '.ct-thumb{position:relative;flex:none;width:76px;height:76px;border-radius:14px;overflow:hidden;background:var(--surface-2);' +
    'display:grid;place-items:center;font-size:26px}' +
    '.ct-thumb img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.ct-thumb .play{position:absolute;inset:auto 5px 5px auto;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.55);' +
    'color:#fff;display:grid;place-items:center;font-size:11px}' +
    '.ct-entry .bd{flex:1;min-width:0}' +
    '.ct-entry .tt{font-weight:800;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.ct-entry .ds{font-size:13px;color:var(--ink-2);line-height:1.45;margin-top:2px;display:-webkit-box;-webkit-line-clamp:2;' +
    '-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}' +
    '.ct-entry .vl{font-size:12px;color:var(--ink-3);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.ct-entry .ed{flex:none;color:var(--ink-3)}' +
    '.ct-empty{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;min-height:64px;border-radius:var(--r-md);' +
    'border:2px dashed var(--line);background:transparent;color:var(--ink-2);font-weight:700;font-size:14px;cursor:pointer;font-family:inherit}' +
    '.ct-empty[disabled]{cursor:default;opacity:.65}' +
    '.ct-empty .svg,.ct-empty svg{width:18px;height:18px}' +
    '.ct-note{font-size:12.5px;color:var(--ink-3);line-height:1.55;margin:8px 2px 0;word-break:keep-all}' +
    '.ct-vote{border-radius:var(--r-md);padding:16px;background:var(--surface-2);text-align:center;font-size:14px;line-height:1.6;word-break:keep-all}' +
    '.ct-vote .big{font-size:30px}' +
    /* 내기 시트 */
    '.ct-pick{position:relative;display:grid;place-items:center;width:100%;min-height:150px;border-radius:16px;border:2px dashed var(--line);' +
    'background:var(--surface-2);color:var(--ink-2);cursor:pointer;overflow:hidden;padding:0;font-family:inherit}' +
    '.ct-pick.has{border-style:solid;border-color:transparent;background:#000}' +
    '.ct-pick img{width:100%;max-height:260px;object-fit:contain;display:block}' +
    '.ct-pick .idle{display:grid;gap:4px;justify-items:center;padding:20px;font-size:14px;font-weight:700}' +
    '.ct-pick .idle .svg,.ct-pick .idle svg{width:30px;height:30px}' +
    '.ct-pick .idle .mut{font-size:12px;font-weight:500;color:var(--ink-3)}' +
    '.ct-pick .vid{color:#fff;font-size:15px;font-weight:700;padding:30px}' +
    '.ct-pick .re{position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.6);color:#fff;border-radius:999px;padding:6px 12px;font-size:12.5px;font-weight:700}' +
    '.ct-cnt{float:right;font-weight:600;font-size:12px;color:var(--ink-3)}' +
    '.ct-cnt.over{color:var(--danger)}' +
    '.ct-view img,.ct-view video{width:100%;border-radius:14px;display:block;background:#000;max-height:62vh;object-fit:contain}' +
    '.ct-view .tt{font-family:var(--font-title);font-size:20px;margin-top:12px;word-break:keep-all}' +
    '.ct-view .ds{font-size:15px;line-height:1.6;margin-top:6px;white-space:pre-wrap;word-break:break-word;color:var(--ink-2)}' +
    '.ct-view .vl{font-size:12.5px;color:var(--ink-3);margin-top:8px}' +
    '.ct-an{min-height:24px}' +
    '.ct-yay{text-align:center}' +
    '.ct-yay .ph{position:relative;width:min(220px,70%);aspect-ratio:1;margin:0 auto;border-radius:20px;overflow:hidden;' +
    'transform:rotate(-2.5deg);box-shadow:var(--shadow-pop);border:6px solid var(--surface);background:var(--surface-2)}' +
    '.ct-yay .ph img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.ct-yay .ph .play{position:absolute;right:8px;bottom:8px;width:30px;height:30px;border-radius:50%;background:rgba(0,0,0,.55);color:#fff;display:grid;place-items:center;font-size:13px}' +
    '.ct-yay .big{font-family:var(--font-title);font-size:21px;margin-top:16px;word-break:keep-all}' +
    '.ct-yay .tt{font-weight:800;font-size:15px;margin-top:6px;word-break:break-word}' +
    '.ct-yay .vl,.ct-entry .vl{word-break:keep-all}' +
    '.ct-yay .vl{font-size:13px;color:var(--ink-2);margin-top:6px}' +
    '@media (max-width:360px){.ct-hero h2{font-size:26px}.ct-hero{padding:20px 16px 18px}.ct-card .t{font-size:20px}}';
  function css() {
    if (document.getElementById('ctCss')) return;
    const st = document.createElement('style'); st.id = 'ctCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- 불러오기 ---------- */
  async function load() {
    const [info, admin] = await Promise.all([
      api().info().catch(() => null),
      (DB.isAdmin ? DB.isAdmin() : Promise.resolve(false)).catch(() => false)
    ]);
    const i = info ? Object.assign({ max_entries: MAX_ENTRIES, entry_count: 0, end_at: DEFAULT_END }, info) : null;
    if (i && !i.phase) i.phase = phaseOf(i.start_at, i.end_at);
    return { info: i, admin: !!admin, phase: i ? i.phase : 'hidden' };
  }

  /* ---------- 설문 탭 맨 위 큰 카드 ---------- */
  async function mountCard(box, o) {
    if (!box) return;
    css();
    const st = await load();
    const old = box.querySelector('.ct-card'); if (old) old.remove();
    if (st.phase === 'hidden' && !st.admin) return;
    const i = st.info || {};
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ct-card';
    b.setAttribute('aria-label', TITLE.replace(/\s*📸/, '') + ' 콘테스트 열기');
    b.innerHTML = '<span class="k">' + esc(SUB) + '</span>' +
      '<span class="t">' + esc(TITLE) + '</span>' +
      '<span class="s">' + tagFor(st) + '</span>' +
      '<span class="go" aria-hidden="true">' + ic('chevron') + '</span>';
    b.onclick = () => (o && o.onOpen) ? o.onOpen() : open(document.getElementById('view'));
    box.insertBefore(b, box.firstChild);
    return { phase: st.phase, entry_count: i.entry_count || 0 };
  }
  function tagFor(st) {
    const i = st.info || {};
    if (st.phase === 'hidden') return '<span class="ct-tag soft">운영진 미리보기</span>';
    if (st.phase === 'soon') return '<span class="ct-tag">' + esc(md(i.start_at)) + ' 시작</span>';
    if (st.phase === 'open') return '<span class="ct-tag">' + esc(dday(i.end_at) || '진행 중') + '</span>' +
      '<span>' + (i.entry_count || 0) + '작품 도착</span>';
    return '<span class="ct-tag soft">마감</span><span>투표를 준비하고 있어요</span>';
  }

  /* ---------- 콘테스트 화면 ---------- */
  let ROOT = null, OPTS = {}, seq = 0, PHASE = null;
  async function open(root, o) {
    css();
    ROOT = root || document.getElementById('view');
    OPTS = o || {};
    if (!ROOT) return;
    ROOT.innerHTML = '<div class="mut sm" style="padding:24px 4px">불러오는 중…</div>';
    /* ★ 여기서 무엇이 잘못되면 「불러오는 중…」 에서 멈춘 **빈 화면**이 된다.
       (느린 연결·막힌 조회·아직 안 읽힌 파일 — 어느 쪽이든)
       그러니 12초만 기다리고, 안 되면 왜 안 되는지와 돌아갈 길을 보여 준다. */
    let late = null;
    try {
      await Promise.race([
        render(),
        new Promise((_, no) => { late = setTimeout(() => no(new Error('너무 오래 걸려요')), 12000); })
      ]);
    } catch (e) {
      console.warn('[발자국] 콘테스트 화면을 못 그렸어요:', e);
      return fail();
    } finally { clearTimeout(late); }
    try { window.scrollTo(0, 0); } catch (e) { }
  }

  /* 못 그렸을 때 — 빈 화면 대신 「다시 시도」와 「설문으로」.
     여기서는 ic() 같은 다른 파일을 **쓰지 않는다** (그 파일이 원인일 수도 있다) */
  function fail() {
    if (!ROOT) return;
    seq++;        /* 늦게 돌아온 render 가 이 화면을 덮지 않게 */
    ROOT.innerHTML =
      (OPTS.onBack ? '<button class="ct-back" type="button" data-ctback>‹ 설문으로</button>' : '') +
      '<div class="card center" style="padding:26px 20px">' +
      '<div style="font-size:34px" aria-hidden="true">📵</div>' +
      '<h3 style="margin-top:8px;font-size:17px">콘테스트를 불러오지 못했어요</h3>' +
      '<p class="mut sm" style="margin-top:6px;line-height:1.55">잠깐 연결이 안 됐을 수 있어요. ' +
      '다시 시도해 보고, 그래도 안 되면 조금 뒤에 열어 주세요.</p>' +
      '<div class="sp"></div>' +
      '<button class="btn primary block lg" type="button" data-ctretry>다시 시도</button>' +
      (OPTS.onBack
        ? '<button class="btn ghost block" type="button" data-ctback style="margin-top:8px">설문으로 돌아가기</button>'
        : '') +
      '</div>';
    const r = ROOT.querySelector('[data-ctretry]');
    if (r) r.onclick = () => open(ROOT, OPTS);
    ROOT.querySelectorAll('[data-ctback]').forEach(b =>
      b.onclick = () => { if (OPTS.onBack) OPTS.onBack(); });
  }

  async function render() {
    const my = ++seq;
    const st = await load();
    let mine = [];
    if (st.phase !== 'hidden' || st.admin) { try { mine = (await api().mine()) || []; } catch (e) { } }
    if (my !== seq || !ROOT) return;
    PHASE = st.phase;
    const i = st.info || { end_at: DEFAULT_END, max_entries: MAX_ENTRIES, entry_count: 0 };
    const max = i.max_entries || MAX_ENTRIES;
    const canEdit = st.phase === 'open';
    const back = OPTS.onBack
      ? '<button class="ct-back" type="button" data-ctback>' + ic('chevron') + '설문으로</button>' : '';

    /* 구성원에게 아직 안 열린 것 */
    if (st.phase === 'hidden' && !st.admin) {
      ROOT.innerHTML = back + '<div class="card center" style="padding:28px 22px">' +
        '<div style="font-size:40px">📸</div><h3 style="margin-top:8px;font-size:17px">콘테스트를 준비하고 있어요</h3>' +
        '<p class="mut sm" style="margin-top:6px">열리면 설문 탭 맨 위에 떠요.</p></div>';
      return bind(st, mine);
    }

    const pre = st.admin && st.phase !== 'open' && st.phase !== 'closed'
      ? '<div class="ct-pre"><b>운영진 미리보기</b> — ' +
        (st.phase === 'hidden'
          ? '시작일이 정해지지 않아 구성원에게는 아직 안 보여요. 운영진 화면에서 시작일·마감일을 정하면 그날부터 열려요.'
          : esc(md(i.start_at)) + '부터 구성원에게 열려요.') +
        (usingFake() ? fakeChips(st.phase) : '') + '</div>'
      : (st.admin && usingFake() ? '<div class="ct-pre"><b>체험 모드</b> — 단계 바꿔 보기' + fakeChips(st.phase) + '</div>' : '');

    const when = st.phase === 'soon'
      ? esc(md(i.start_at)) + ' 시작 · ' + esc(md(i.end_at)) + ' ' + esc(hm(i.end_at)) + ' 마감'
      : st.phase === 'closed' ? '마감됐어요 · 투표를 준비하고 있어요'
        : st.phase === 'hidden' ? '시작일 미정 · ' + esc(md(i.end_at)) + ' ' + esc(hm(i.end_at)) + ' 마감'
          : esc(md(i.end_at)) + ' ' + esc(hm(i.end_at)) + '까지';
    const dd = st.phase === 'open' ? dday(i.end_at) : (st.phase === 'closed' ? '마감' : '');

    const hero = '<section class="ct-hero">' +
      '<div class="cam" aria-hidden="true">📸</div>' +
      '<div class="k">' + esc(SUB) + '</div>' +
      '<h2>내가 찍은 사진이<br><span class="hl">제일 잘나가</span> 📸</h2>' +
      '<p class="lead">봉사하다 찍은 그 한 장, 폰 앨범에만 두기 아깝잖아요.<br>' +
      '제목 붙여서 내면 마감 뒤 <b>익명 투표</b>로 누가 제일 잘나가는지 정해요.</p>' +
      '<div class="meta">' + (dd ? '<span class="ct-dday">' + esc(dd) + '</span>' : '') +
      '<span class="when">' + when + '</span></div>' +
      '<div class="ct-count"><span>지금까지</span><span class="n">' + (i.entry_count || 0) + '</span><span>작품 도착</span></div>' +
      '</section>';

    const prizes = '<div class="section-title">' + ic('crown') + '<span>상은 네 개</span></div>' +
      '<div class="ct-prizes">' + PRIZES.map(p =>
        '<div class="ct-prize"><div class="e" aria-hidden="true">' + p.e + '</div>' +
        '<div class="t">' + esc(p.t) + '</div><div class="s">' + esc(p.s) + '</div></div>').join('') + '</div>' +
      '<div class="ct-soon"><span>🎁 상품은 곧 공개</span></div>';

    const steps = '<div class="section-title">' + ic('clipboard') + '<span>참여 방법</span></div>' +
      '<div class="ct-steps">' +
      step(1, '<b>봉사에서 찍은 사진 1장</b>이나 <b>영상 1개</b>를 골라요', '영상은 ' + VIDEO_MAX_SEC + '초 · ' + VIDEO_MAX_MB + 'MB 이하') +
      step(2, '<b>제목</b>·<b>설명</b>·<b>봉사지</b>·<b>아이 이름</b>을 붙여요', '제목 ' + TITLE_MAX + '자 · 설명 ' + BODY_MAX + '자까지 · 어느 봉사지인지, 아이 이름도 같이 적어요') +
      step(3, '한 사람 <b>' + max + '작품</b>까지, 마감 전엔 고치고 지울 수 있어요', '마감 뒤 익명 투표로 상을 정해요') +
      '</div>';

    /* 투표 자리 — 나중에 Contest.voteView(상자, info) 가 생기면 그것을 그린다 */
    const vote = st.phase === 'closed' || st.phase === 'vote' || st.phase === 'result'
      ? '<div class="section-title">' + ic('star') + '<span>투표</span></div>' +
        '<div class="ct-vote" data-ctvote><div class="big" aria-hidden="true">🗳️</div>' +
        '<b>익명 투표가 곧 열려요</b><br><span class="mut sm">열리면 알려 드릴게요.</span></div>'
      : '';

    const left = Math.max(0, max - mine.length);
    const cta = st.phase === 'open'
      ? (left
        ? '<button class="btn primary block lg" type="button" data-ctnew style="margin-top:18px">' + ic('plus') + ' 내 작품 내기</button>'
        : '<div class="pill-note" style="margin-top:18px">' + max + '작품을 다 냈어요. 마감 전까지 고치기만 할 수 있어요.</div>')
      : (st.phase === 'soon' || st.phase === 'hidden'
        ? '<button class="btn soft block lg" type="button" disabled style="margin-top:18px">' +
          (st.phase === 'soon' ? esc(md(i.start_at)) + '부터 낼 수 있어요' : '시작하면 낼 수 있어요') + '</button>' +
          /* 시작 전에는 운영진만 폼 모양을 열어 볼 수 있다 — 아무것도 저장되지 않는다 */
          (st.admin
            ? '<button class="btn ghost block lg" type="button" data-ctpreview style="margin-top:8px">' +
              '📝 작품 내기 폼 미리보기</button>' +
              '<p class="mut xs" style="margin:6px 2px 0;text-align:center">운영진만 보여요 · 낸 작품은 저장되지 않아요</p>'
            : '')
        : '');

    const slots = [];
    mine.forEach(x => slots.push(entryRow(x, canEdit)));
    if (canEdit) for (let n = mine.length; n < max; n++) {
      slots.push('<button class="ct-empty" type="button" data-ctnew>' + ic('plus') +
        (n === 0 ? '첫 작품을 내 보세요' : '한 장 더 낼 수 있어요') + '</button>');
    }
    const mineBox = '<div class="section-title">' + ic('image') + '<span>내 작품</span>' +
      '<span class="mut xs" style="margin-left:auto;font-family:var(--font-body);font-weight:700">' + mine.length + ' / ' + max + '</span></div>' +
      (slots.length ? '<div class="ct-mine">' + slots.join('') + '</div>'
        : '<div class="ct-empty" style="cursor:default" role="note">' +
          (st.phase === 'closed' ? '낸 작품이 없어요' : '아직 낸 작품이 없어요') + '</div>') +
      '<p class="ct-note">🔒 작품은 투표 전까지 <b>나와 운영진만</b> 볼 수 있어요. 다른 사람에게는 도착한 작품 수만 보여요.</p>';

    ROOT.innerHTML = back + pre + hero + cta + vote + mineBox + prizes + steps +
      '<div style="height:24px"></div>';
    bind(st, mine);
    paintThumbs(ROOT);
    const slot = ROOT.querySelector('[data-ctvote]');
    if (slot && typeof window.Contest.voteView === 'function') {
      try { window.Contest.voteView(slot, i); } catch (e) { console.warn('[발자국] 투표 화면을 못 그렸어요:', e); }
    }
  }

  /* 숫자만 조용히 맞추기 — 설문 탭(community.js)의 softRefresh 가 7초마다 부른다.
     이 화면을 통째로 다시 그리면 보던 자리와 누르던 것이 튄다.
     그래서 **바뀐 숫자만** 갈아 끼우고, 단계(phase)가 바뀌었을 때만 다시 그린다. */
  async function sync() {
    if (!ROOT || !ROOT.querySelector('.ct-hero')) return;
    let st;
    try { st = await load(); } catch (e) { return; }
    if (!ROOT || !ROOT.querySelector('.ct-hero')) return;   /* 그 사이에 떠났으면 그만 */
    if (st.phase !== PHASE) return render();                /* 열렸거나 마감됐으면 다시 */
    const i = st.info || {};
    const n = ROOT.querySelector('.ct-count .n');
    const v = String(i.entry_count || 0);
    if (n && n.textContent !== v) n.textContent = v;        /* 「지금까지 n작품 도착」 */
    const d = ROOT.querySelector('.ct-dday');
    const dd = st.phase === 'open' ? dday(i.end_at) : '';
    if (d && dd && d.textContent !== dd) d.textContent = dd; /* 「D-35」 */
  }

  function step(n, tx, sub) {
    return '<div class="ct-step"><span class="no">' + n + '</span><span class="tx">' + tx +
      (sub ? '<span class="mut">' + esc(sub) + '</span>' : '') + '</span></div>';
  }
  function fakeChips(phase) {
    const L = { hidden: '숨김', soon: '곧 시작', open: '진행 중', closed: '마감' };
    return '<div class="chips">' + Object.keys(L).map(k =>
      '<button class="chip' + (k === phase ? ' on' : '') + '" type="button" data-ctfake="' + k + '">' + L[k] + '</button>').join('') + '</div>';
  }
  function entryRow(x, canEdit) {
    const vid = x.media_kind === 'video';
    const src = vid ? x.poster_path : x.media_path;
    return '<button class="ct-entry" type="button" data-ctopen="' + esc(x.id) + '">' +
      '<span class="ct-thumb">' + (src ? '<img alt="" data-ctsrc="' + esc(src) + '">' : (vid ? '🎬' : '📷')) +
      (vid ? '<span class="play" aria-hidden="true">▶</span>' : '') + '</span>' +
      '<span class="bd"><span class="tt" style="display:block">' + esc(x.title) + '</span>' +
      '<span class="ds">' + esc(x.body) + '</span>' +
      '<span class="vl" style="display:block">' + whereLine(x) + '</span></span>' +
      (canEdit ? '<span class="ed" aria-hidden="true">' + ic('edit') + '</span>' : '') + '</button>';
  }
  async function paintThumbs(root) {
    for (const im of [...root.querySelectorAll('img[data-ctsrc]')]) {
      const p = im.getAttribute('data-ctsrc'); im.removeAttribute('data-ctsrc');
      const u = await mediaUrl(p);
      if (u) im.src = u; else im.remove();
    }
  }

  let VOLS = null;
  async function myVols() {
    if (VOLS) return VOLS;
    try {
      const r = window.PastVol ? await PastVol.load({ mine: true, limit: 50 }) : null;
      VOLS = (r && r.rows) || [];
    } catch (e) { VOLS = []; }
    return VOLS;
  }
  const volLabel = v => (UI.fmtDate ? UI.fmtDate(v.date) : v.date) + ' ' + (v.place || v.title || '');

  function bind(st, mine) {
    const $$ = s => [...ROOT.querySelectorAll(s)];
    const b = ROOT.querySelector('[data-ctback]');
    if (b) b.onclick = () => OPTS.onBack();
    $$('[data-ctnew]').forEach(x => x.onclick = () => form(null));
    /* 시작 전 — 운영진 폼 미리보기 (저장하는 길이 없는 폼) */
    $$('[data-ctpreview]').forEach(x => x.onclick = () => form(null, true));
    $$('[data-ctopen]').forEach(x => x.onclick = () => {
      const e = mine.find(m => m.id === x.dataset.ctopen);
      if (e) (st.phase === 'open' ? form(e) : view(e));
    });
    $$('[data-ctfake]').forEach(x => x.onclick = () => {
      const d = fread(), now = Date.now(), day = 864e5;
      const k = x.dataset.ctfake;
      if (k === 'hidden') { d.start_at = null; d.end_at = DEFAULT_END; }
      if (k === 'soon') { d.start_at = new Date(now + 3 * day).toISOString(); d.end_at = DEFAULT_END; }
      if (k === 'open') { d.start_at = new Date(now - day).toISOString(); d.end_at = DEFAULT_END; }
      if (k === 'closed') { d.start_at = new Date(now - 30 * day).toISOString(); d.end_at = new Date(now - 3600e3).toISOString(); }
      fwrite(d); render();
    });
  }

  /* ---------- 크게 보기 (마감 뒤 · 고치기 시트 안에서) ---------- */
  async function view(e) {
    const vid = e.media_kind === 'video';
    const ov = UI.sheet({
      title: '내 작품', noFocus: true,
      body: '<div class="ct-view"><div data-ctmedia class="mut sm" style="padding:20px 0;text-align:center">불러오는 중…</div>' +
        '<div class="tt">' + esc(e.title) + '</div><div class="ds">' + esc(e.body) + '</div>' +
        '<div class="vl">' + whereLine(e) + '</div></div>'
    });
    const box = ov.querySelector('[data-ctmedia]');
    const [u, p] = await Promise.all([mediaUrl(e.media_path), vid ? mediaUrl(e.poster_path) : '']);
    if (!box.isConnected) return;
    box.outerHTML = u
      ? (vid ? '<video src="' + esc(u) + '"' + (p ? ' poster="' + esc(p) + '"' : '') + ' controls playsinline preload="metadata"></video>'
        : '<img alt="' + esc(e.title) + '" src="' + esc(u) + '">')
      : '<div class="mut sm" style="padding:20px 0;text-align:center">' + (vid ? '영상' : '사진') + '을 불러오지 못했어요</div>';
  }

  /* ---------- 내기 · 고치기 ---------- */
  /* preview = true — 시작 전에 운영진이 폼 모양만 보는 것.
     ★ 「작품 내기」 단추를 **아예 만들지 않는다.** 그래서 save.onclick 이 없고,
       작품을 올리는 길(api().save → 사진 업로드)이 코드에 남아 있지 않다.
       사진을 골라도 그 자리에서 작게 만들어 보여 주기만 한다(업로드 아님). */
  async function form(e, preview) {
    const edit = !!e;
    let media = null;                 /* 새로 고른 것 — null 이면 그대로 */
    const ov = UI.sheet({
      title: preview ? '작품 내기 폼 미리보기' : (edit ? '작품 고치기' : '내 작품 내기'),
      noFocus: true,
      body:
        (preview
          ? '<div class="ct-pre" style="margin:0 0 12px">📝 <b>미리보기예요</b> · ' +
            '낸 작품은 저장되지 않아요. 눌러 보고 적어 봐도 아무것도 올라가지 않아요.</div>'
          : '') +
        '<button class="ct-pick" type="button" data-ctpick aria-label="사진이나 영상 고르기"></button>' +
        '<input type="file" data-ctfile accept="image/*,video/mp4,video/quicktime" hidden>' +
        '<p class="mut xs" style="margin:6px 2px 14px">사진 1장 또는 영상 1개 (' + VIDEO_MAX_SEC + '초·' + VIDEO_MAX_MB + 'MB 이하)</p>' +
        '<label class="field"><span class="lb">제목 <span class="req">*</span><span class="ct-cnt" data-ctc="t"></span></span>' +
        '<input class="input" data-ctt maxlength="' + (TITLE_MAX * 2) + '" placeholder="예) 산책 첫날 웃는 봄이" autocomplete="off" enterkeyhint="next"></label>' +
        '<label class="field"><span class="lb">설명 <span class="req">*</span><span class="ct-cnt" data-ctc="b"></span></span>' +
        '<textarea class="input" data-ctb rows="4" maxlength="' + (BODY_MAX * 2) + '" placeholder="어떤 순간이었는지 자랑해 주세요"></textarea></label>' +
        '<div class="field"><span class="lb">어느 봉사지에서? <span class="req">*</span></span>' +
        '<select class="input" data-ctv aria-label="내가 간 지난 봉사에서 고르기"><option value="">내가 간 봉사에서 고르기</option></select>' +
        '<input class="input" data-cts style="margin-top:8px" maxlength="' + SHELTER_MAX + '" placeholder="목록에 없으면 보호소 이름을 직접" ' +
        'autocomplete="off" aria-label="봉사지(보호소) 이름"></div>' +
        '<div class="field"><span class="lb">사진·영상 속 아이 이름 <span class="req">*</span><span class="ct-cnt" data-ctc="p"></span></span>' +
        '<div data-ctan class="ct-an"></div>' +
        '<div class="row" style="gap:6px;margin-top:8px">' +
        '<input class="input grow" data-ctpetin maxlength="40" placeholder="여럿이면 쉼표로 (봄이, 여름이)" autocomplete="off" enterkeyhint="done" aria-label="아이 이름">' +
        '<button type="button" class="btn ghost" data-ctadd>더하기</button></div>' +
        '<button type="button" class="check" data-ctunk style="margin-top:8px;width:100%;text-align:left" aria-pressed="false">' +
        '<span class="box tick" aria-hidden="true">' + ic('check') + '</span>' +
        '<span class="grow sm" style="font-weight:700">이름을 몰라요</span></button></div>' +
        (edit ? '<button class="btn danger block" type="button" data-ctdel style="margin-top:4px">' + ic('trash') + ' 이 작품 지우기</button>' : ''),
      foot: preview
        ? '<button class="btn soft lg" type="button" disabled>미리보기라 낼 수 없어요</button>'
        : '<button class="btn primary lg" type="button" data-ctsave>' + (edit ? '고친 것 저장' : '작품 내기') + '</button>'
    });
    const q = s => ov.querySelector(s);
    const pick = q('[data-ctpick]'), file = q('[data-ctfile]'), t = q('[data-ctt]'), b = q('[data-ctb]'), sel = q('[data-ctv]');
    const save = q('[data-ctsave]');   /* 미리보기에는 없다 */
    if (edit) { t.value = e.title || ''; b.value = e.body || ''; }

    const count = () => {
      [[t, 't', TITLE_MAX], [b, 'b', BODY_MAX]].forEach(([el, k, mx]) => {
        const n = chars(el.value), c = q('[data-ctc="' + k + '"]');
        c.textContent = n + ' / ' + mx; c.classList.toggle('over', n > mx);
      });
    };
    t.addEventListener('input', count); b.addEventListener('input', count); count();

    const paintPick = async () => {
      const kind = media ? media.kind : (edit ? e.media_kind : null);
      if (!kind) {
        pick.classList.remove('has');
        pick.innerHTML = '<span class="idle">' + ic('image') + '<span>눌러서 사진·영상 고르기</span>' +
          '<span class="mut">사진은 크게(긴 변 ' + PHOTO_SIDE + 'px) 올려요</span></span>';
        return;
      }
      pick.classList.add('has');
      let src = '';
      if (media) src = media.kind === 'photo' ? media.data : media.poster;
      else src = await mediaUrl(kind === 'video' ? e.poster_path : e.media_path);
      pick.innerHTML = (src ? '<img alt="" src="' + esc(src) + '">' : '<span class="vid">🎬 영상</span>') +
        '<span class="re">' + (kind === 'video' ? '▶ 영상 · ' : '') + '바꾸기</span>';
    };
    paintPick();
    pick.onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (!f) return;
      pick.innerHTML = '<span class="idle"><span class="mut">보는 중…</span></span>';
      try {
        if (/^video\//.test(f.type)) {
          const r = await readVideo(f);
          media = { kind: 'video', file: r.file, poster: r.poster };
        } else {
          media = { kind: 'photo', data: await UI.resizeImage(f, PHOTO_SIDE, PHOTO_Q) };
        }
      } catch (err) { UI.toast(err.message || '이 파일은 올릴 수 없어요', 'err'); }
      paintPick();
    };

    /* 봉사지 — 지난 봉사를 고르면 보호소 이름이 채워진다. 직접 고쳐 적으면 고른 봉사는 풀린다 */
    const shel = q('[data-cts]');
    let vols = [];
    if (edit) shel.value = e.shelter || '';
    myVols().then(list => {
      vols = list;
      sel.innerHTML += list.map(v => '<option value="' + esc(v.id) + '">' + esc(volLabel(v)) + '</option>').join('');
      if (edit && e.volunteer_id && list.some(v => v.id === e.volunteer_id)) sel.value = e.volunteer_id;
    });
    sel.onchange = () => {
      const v = vols.find(x => x.id === sel.value);
      if (v) { shel.value = v.place || v.title || ''; loadAn(); }
    };
    shel.addEventListener('input', () => {
      const v = vols.find(x => x.id === sel.value);
      if (v && shel.value.trim() !== (v.place || v.title || '')) sel.value = '';
      clearTimeout(anT); anT = setTimeout(loadAn, 350);
    });

    /* 아이 이름 — 후기 「만난 친구」 모양: 그 보호소 아이들 칩 + 목록에 없으면 적어서 더하기.
       여기서는 이름 글자만 담는다 (동물 명부에 새로 만들지 않는다) */
    const anBox = q('[data-ctan]'), anNew = q('[data-ctpetin]'), unk = q('[data-ctunk]');
    let names = edit ? cleanNames(e.pet_names) : [], known = [], anT = 0, anSeq = 0;
    let unknown = edit && !names.length;
    const paintAn = () => {
      const all = known.slice();
      names.forEach(n => { if (all.indexOf(n) < 0) all.push(n); });
      anBox.innerHTML = all.length
        ? '<div class="row" style="gap:7px;flex-wrap:wrap">' + all.map(n =>
          '<button type="button" class="apaw pick' + (names.indexOf(n) >= 0 ? ' on' : '') + '" data-ctpet="' + esc(n) + '" ' +
          'aria-pressed="' + (names.indexOf(n) >= 0) + '">' + ic('paw') + '<span>' + esc(n) + '</span></button>').join('') + '</div>'
        : '<div class="mut xs">' + (shel.value.trim() ? '이 보호소에 등록된 아이가 없어요. 아래에 적어 주세요.' : '봉사지를 고르면 그 보호소 아이들이 나와요.') + '</div>';
      anBox.querySelectorAll('[data-ctpet]').forEach(x => x.onclick = () => {
        const n = x.dataset.ctpet, k = names.indexOf(n);
        if (k >= 0) names.splice(k, 1);
        else if (names.length >= PET_COUNT) return UI.toast(PET_OVER, 'err');
        else { names.push(n); setUnk(false); }
        paintAn();
      });
      unk.classList.toggle('on', unknown);
      unk.setAttribute('aria-pressed', String(unknown));
      const pc = q('[data-ctc="p"]');
      pc.textContent = unknown ? '' : names.length + ' / ' + PET_COUNT;
      pc.classList.toggle('over', names.length > PET_COUNT);
    };
    const setUnk = on => { unknown = on; if (on) names = []; };
    const loadAn = async () => {
      const my = ++anSeq, place = shel.value.trim();
      let list = [];
      if (place && DB.community && DB.community.animalsAt) {
        try { list = (await DB.community.animalsAt(place)) || []; } catch (err) { }
      }
      if (my !== anSeq) return;
      known = list.filter(a => !a.adopted).map(a => String(a.name || '').trim()).filter(Boolean).slice(0, 30);
      paintAn();
    };
    /* 넘치면 하나도 안 넣고 칸에 그대로 둔다 — 몇 개를 지울지 사람이 고른다 */
    const addAn = () => {
      const add = cleanNames(anNew.value).filter(n => names.indexOf(n) < 0);
      if (!add.length) { anNew.value = ''; return true; }
      if (names.length + add.length > PET_COUNT) {
        UI.toast(PET_OVER + ' (지금 ' + names.length + '개)', 'err');
        return false;
      }
      add.forEach(n => names.push(n));
      anNew.value = ''; setUnk(false); paintAn();
      return true;
    };
    q('[data-ctadd]').onclick = addAn;
    UI.onEnter ? UI.onEnter(anNew, addAn) : anNew.addEventListener('keydown', ev => {
      if (ev.key === 'Enter' && !ev.isComposing && ev.keyCode !== 229) { ev.preventDefault(); addAn(); }
    });
    unk.onclick = () => { setUnk(!unknown); paintAn(); };
    paintAn();
    if (edit && e.shelter) loadAn();

    /* ★ 미리보기면 save 가 없다 — 여기 아래(올리기·사진 업로드)로는 들어갈 수 없다 */
    if (save) save.onclick = async () => {
      /* 적어 두고 「더하기」를 안 누른 이름도 담는다 */
      if (anNew.value.trim() && !addAn()) return;
      const v = { id: edit ? e.id : undefined, title: t.value.trim(), body: b.value.trim(),
        shelter: shel.value.trim(), pet_names: unknown ? [] : names.slice(),
        volunteer_id: sel.value || null, media };
      try {
        if (!edit && !media) throw new Error('사진이나 영상을 골라 주세요');
        checkText(v);
        if (!unknown && !v.pet_names.length) throw new Error('아이 이름을 적거나 「이름을 몰라요」를 눌러 주세요');
        if (v.pet_names.length > PET_COUNT) throw new Error(PET_OVER);
      } catch (err) { return UI.toast(err.message, 'err'); }
      save.disabled = true;
      save.textContent = media ? '올리는 중…' : '저장하는 중…';
      try {
        await api().save(v);
        UI.closeSheet();
        if (!edit) {
          UI.cheer();
          celebrate(v, media);
        } else UI.toast('고친 것을 저장했어요');
        render();
      } catch (err) {
        save.disabled = false;
        save.textContent = edit ? '고친 것 저장' : '작품 내기';
        UI.toast(UI.human ? UI.human(err.message || '') : (err.message || '저장하지 못했어요'), 'err');
      }
    };

    const del = q('[data-ctdel]');
    if (del) del.onclick = async () => {
      const ok = await UI.confirmSheet('이 작품을 지울까요?', '「' + esc(e.title) + '」을 지우면 되돌릴 수 없어요. 마감 전까지는 다시 낼 수 있어요.', '지우기', true);
      if (!ok) return;
      try { await api().remove(e.id); UI.toast('작품을 지웠어요'); }
      catch (err) { UI.toast(err.message || '지우지 못했어요', 'err'); }
      render();
    };
  }

  /* 낸 뒤 축하 — 축하 효과(cheer) 위에 작품 한 장 */
  function celebrate(v, media) {
    const src = media ? (media.kind === 'photo' ? media.data : media.poster) : '';
    const ov = UI.sheet({
      title: '작품 도착! 🎉', noFocus: true,
      body: '<div class="ct-yay">' +
        (src ? '<div class="ph"><img alt="" src="' + esc(src) + '">' +
          (media.kind === 'video' ? '<span class="play" aria-hidden="true">▶</span>' : '') + '</div>' : '') +
        '<div class="big">이 ' + (media && media.kind === 'video' ? '영상' : '사진') + ', 제일 잘나가요 📸</div>' +
        '<div class="tt">「' + esc(v.title) + '」</div>' +
        '<div class="vl">' + whereLine(v) + '</div>' +
        '<p class="mut sm" style="margin:10px 0 0;line-height:1.55;word-break:keep-all">마감 전까지 고치거나 지울 수 있어요.<br>투표가 열리면 알려 드릴게요.</p>' +
        '</div>',
      foot: '<button class="btn primary lg" type="button" data-ctok>좋아요</button>'
    });
    ov.querySelector('[data-ctok]').onclick = () => UI.closeSheet();
  }

  window.Contest = { open, sync, mountCard, info: () => load(), phaseOf, LIMITS: { MAX_ENTRIES, PET_COUNT, TITLE_MAX, BODY_MAX, PHOTO_SIDE, VIDEO_MAX_SEC, VIDEO_MAX_MB, DEFAULT_END } };
})();
