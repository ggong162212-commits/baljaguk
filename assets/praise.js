/* ============================================================
   칭찬해요
   · 글쓰기 「어떤 글인가요?」 → 칭찬해요
     ① 누구를 칭찬할까요? — 이름으로 찾기(사진·기수 같이, 나는 빼고, 한 명)
     ② 어떤 점이 고마웠나요? — 두 글자 이상
     ③ 사진 (없어도 돼요) — 다른 글과 같은 사진 단계를 그대로 쓴다
   · 피드 카드 위에 「○○님이 △△님을 칭찬해요」 줄 — △△ 사진을 누르면 그 사람 프로필
   · 나 탭 「받은 칭찬 n」 — 누르면 나를 칭찬한 글 모아 보기 (순위·비교 없음)
   · 서버: posts.type='praise' + praised_member_id, praise_people(), praise_received()
     (supabase/fix-praise.sql). 체험 모드는 이 파일이 같은 모양을 만든다
   쓰는 법:
     Praise.write({ photoStep, done })  — community.js 글쓰기에서
     Praise.head(p)                     — postCard 에서 (칭찬 글일 때만)
     Praise.mountMe(box)                — renderMe 에서
   ============================================================ */
(function () {
  const { esc, avatar, relTime } = UI;
  const isDemo = () => !!(DB.isDemo && DB.isDemo());
  const demoData = () => { try { return JSON.parse(localStorage.getItem('baljaguk.demo') || '{}'); } catch (e) { return {}; } };
  const demoMe = () => { try { return localStorage.getItem('baljaguk.demoMe'); } catch (e) { return null; } };
  const genOf = g => g ? String(g).replace(/기$/, '') + '기' : '';

  /* ---------- 서버 ---------- */
  async function people(q) {
    if (isDemo()) {
      const d = demoData(), me = demoMe(), s = String(q || '').trim();
      const gen = (d.settings && d.settings.generation) || null;
      return (d.members || [])
        .filter(m => m.status !== 'left' && m.id !== me && (!s || String(m.name).indexOf(s) >= 0))
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .slice(0, 30)
        .map(m => ({ id: m.id, name: m.name, photo: m.photo_path || m.photo || null, gen }));
    }
    return (await DB.rpc('praise_people', { p_q: String(q || '') })) || [];
  }
  async function received() {
    if (isDemo()) {
      const d = demoData(), me = demoMe();
      const mem = id => (d.members || []).find(m => m.id === id) || {};
      const rows = (d.posts || [])
        .filter(p => p.type === 'praise' && p.praised_member_id === me && !p.hidden)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
        .map(p => {
          const a = mem(p.author_id);
          const ph = (d.post_photos || []).filter(f => f.post_id === p.id).sort((x, y) => x.sort - y.sort)[0];
          return { id: p.id, created_at: p.created_at, body: String(p.body || '').slice(0, 120),
            author: { id: a.id, name: a.name, photo: a.photo_path || a.photo || null }, photo: ph ? ph.path : null };
        });
      return { n: rows.length, rows };
    }
    return (await DB.rpc('praise_received', {})) || { n: 0, rows: [] };
  }

  /* 사진 채우기 — 비공개 보관함이라 서명된 주소를 받아 온다 */
  async function fill(root) {
    for (const el of [...root.querySelectorAll('[data-avatar]')]) {
      const p = el.getAttribute('data-avatar'); el.removeAttribute('data-avatar');
      try {
        const url = await DB.community.avatarUrl(p);
        if (url) { el.style.backgroundImage = 'url("' + url + '")'; el.classList.add('has-photo'); el.textContent = ''; }
      } catch (e) { }
    }
  }

  const CSS =
    '.card.post.praise{background:var(--surface);' +
    'background:color-mix(in srgb,var(--brand-soft) 45%,var(--surface))}' +
    /* 칭찬 글 머리 — 한 줄로 [사진]이름 → [사진]이름 칭찬해요 · 12시간 전 */
    '.who.przwho{display:flex;align-items:center;gap:8px;margin-bottom:10px}' +
    '.prz-line{display:flex;align-items:center;gap:6px;flex:1;min-width:0}' +
    '.prz-one{display:flex;align-items:center;gap:6px;border:none;background:none;padding:0;' +
    'cursor:pointer;color:var(--ink);min-width:60px;font-family:inherit}' +
    '.prz-one .avatar{width:32px;height:32px;font-size:14px;flex:none}' +
    /* ★ 이름만 줄여 쓴다 — 사진·화살표·「칭찬해요 · 시간」은 늘 보인다 */
    '.prz-one .nm{font-weight:700;font-size:14px;white-space:nowrap;overflow:hidden;' +
    'text-overflow:ellipsis;min-width:0}' +
    '.prz-ar{flex:none;display:grid;place-items:center;color:var(--ink-3)}' +
    '.prz-ar svg,.prz-ar .svg{width:15px;height:15px}' +
    '.prz-tag{flex:none;font-size:12px;font-weight:800;color:var(--brand-deep);' +
    'white-space:nowrap;margin-left:2px}' +
    '.prz-at{font-size:12px;font-weight:500;color:var(--ink-3)}' +
    /* 폰(SE·Galaxy·13)은 사이를 좁히고 이름을 더 줄인다 — 「칭찬해요 · 시간」 자리를 먼저 지킨다 */
    '@media (max-width:400px){.prz-one{min-width:50px}.prz-one .nm{max-width:64px;font-size:13px}.prz-one .avatar{width:28px;height:28px}' +
    '.who.przwho{gap:4px}.who.przwho > .iconbtn.sq{margin-right:-6px}.prz-line{gap:3px}.prz-one{gap:4px}.prz-ar svg,.prz-ar .svg{width:12px;height:12px}.prz-tag{margin-left:0}}' +
    '.pr-search{position:relative}' +
    '.pr-list{display:grid;gap:2px;margin-top:10px;max-height:46vh;overflow:auto}' +
    '.pr-row{display:flex;align-items:center;gap:12px;min-height:56px;padding:6px 8px;border:none;' +
    'background:none;border-radius:14px;text-align:left;width:100%;cursor:pointer;color:var(--ink)}' +
    '.pr-row .avatar{width:40px;height:40px;flex:none}' +
    '.pr-row .nm{font-weight:700;font-size:15px}' +
    '.pr-row .gen{font-size:12px;color:var(--ink-3);margin-left:6px;font-weight:600}' +
    '.pr-row.on{background:var(--brand-soft);box-shadow:inset 0 0 0 2px var(--brand)}' +
    '.pr-row .chk{margin-left:auto;color:var(--brand-deep)}' +
    '.pr-me{display:flex;align-items:center;gap:12px;width:100%;min-height:56px;padding:12px 14px;' +
    'border:none;border-radius:16px;background:var(--brand-soft);color:var(--ink);text-align:left;cursor:pointer;margin-top:12px}' +
    '.pr-me .n{margin-left:auto;font-weight:800;font-size:17px;color:var(--brand-deep)}' +
    '.pr-item{display:flex;gap:12px;align-items:flex-start;width:100%;border:none;background:none;' +
    'padding:10px 2px;text-align:left;cursor:pointer;color:var(--ink);min-height:56px;border-bottom:1px solid var(--line)}' +
    '.pr-item .avatar{width:40px;height:40px;flex:none}' +
    '.pr-item .nm{font-weight:700;font-size:14px}' +
    '.pr-item .at{font-size:12px;color:var(--ink-3);margin-left:6px;font-weight:500}' +
    '.pr-item .bd{font-size:15px;line-height:1.5;margin-top:3px;color:var(--ink-2);' +
    'display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}';
  function css() {
    if (document.getElementById('prCss')) return;
    const st = document.createElement('style'); st.id = 'prCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- 글쓰기 ---------- */
  function write(o) {
    css();
    let pick = null;
    const rowHtml = p => '<button class="pr-row' + (pick && pick.id === p.id ? ' on' : '') + '" type="button" ' +
      'data-pr="' + esc(p.id) + '" aria-pressed="' + (pick && pick.id === p.id ? 'true' : 'false') + '">' +
      avatar({ name: p.name, photo: p.photo }) +
      '<span><span class="nm">' + esc(p.name) + '</span>' +
      (genOf(p.gen) ? '<span class="gen">' + esc(genOf(p.gen)) + '</span>' : '') + '</span>' +
      (pick && pick.id === p.id ? '<span class="chk">' + window.ic('check') + '</span>' : '') + '</button>';

    const whoStep = {
      key: 'who', short: '칭찬할 사람',
      q: '누구를 칭찬할까요?',
      hint: '이름으로 찾아서 한 명을 골라 주세요.',
      body: '<div class="pr-search"><label class="field"><input class="input" id="prQ" type="search" ' +
        'placeholder="이름 찾기" autocomplete="off" enterkeyhint="search" aria-label="칭찬할 사람 이름"></label></div>' +
        '<div class="pr-list" id="prList" role="list"><div class="mut sm">불러오는 중…</div></div>',
      after: r => {
        const q = r.querySelector('#prQ'), list = r.querySelector('#prList');
        let seq = 0, rows = [];
        const draw = () => {
          list.innerHTML = rows.length ? rows.map(rowHtml).join('')
            : '<div class="mut sm" style="padding:10px 4px">찾는 이름이 없어요</div>';
          list.querySelectorAll('[data-pr]').forEach(b => b.onclick = () => {
            pick = rows.find(x => x.id === b.dataset.pr) || null;
            draw();
          });
          fill(list);
        };
        const load = async () => {
          const my = ++seq;
          try { const r2 = await people(q.value.trim()); if (my !== seq) return; rows = r2 || []; }
          catch (e) { if (my !== seq) return; rows = []; }
          /* 고른 사람은 검색어가 바뀌어도 맨 위에 남긴다 */
          if (pick && !rows.some(x => x.id === pick.id)) rows.unshift(pick);
          draw();
        };
        let t = 0;
        q.addEventListener('input', () => { clearTimeout(t); t = setTimeout(load, 200); });
        load();
      },
      read: () => pick,
      fill: () => { },
      valid: v => v ? '' : '칭찬할 사람을 한 명 골라 주세요',
      sum: v => v ? v.name : ''
    };

    const bodyStepP = {
      key: 'body', short: '고마운 점',
      q: '어떤 점이 고마웠나요?',
      hint: '짧아도 좋아요. 모두에게 보이고, 칭찬받은 사람에게 알림이 가요.',
      body: '<label class="field"><textarea class="input" id="prBody" rows="5" maxlength="1000" ' +
        'placeholder="오늘 산책 줄 잡아 줘서 고마웠어요…" aria-label="고마운 점"></textarea></label>',
      read: r => r.querySelector('#prBody').value.trim(),
      fill: (r, v) => { r.querySelector('#prBody').value = v; },
      valid: v => (v || '').length >= 2 ? '' : '고마운 점을 두 글자 이상 적어 주세요',
      sum: v => String(v || '').slice(0, 20)
    };

    const steps = [whoStep, bodyStepP];
    if (o && o.photoStep) steps.push(o.photoStep(false, '없어도 괜찮아요. 같이 찍은 사진이 있으면 더 좋아요.'));

    UI.wizard({
      title: '칭찬해요',
      doneLabel: '올리기',
      steps,
      done: async v => {
        if (!v.who) throw new Error('칭찬할 사람을 골라 주세요');
        const ph = v.photos || { list: [] };
        const made = await DB.community.createPost({
          type: 'praise', body: v.body, praised_member_id: v.who.id,
          photos: ph.list || [], video: ph.video
        });
        if (o && o.done) await o.done(made, v);
      }
    });
  }

  /* ---------- 피드 카드 위 줄 ---------- */
  /* ── 칭찬 글의 **카드 머리** (일반 글 머리 대신 이것을 쓴다)
     선고은님: 「프로필 보이면서 『선고은 → 한예원 칭찬해요』 이런 식으로 간단하게」
       [사진] 선고은  →  [사진] 한예원 · 칭찬해요        […]
       그 아래 작은 회색 시간
     ★ 360 폭에서 이름이 길면 **이름만** 말줄임(…).
       사진·화살표·「칭찬해요」는 늘 보인다. */
  function head(p) {
    css();
    const who = p.author || {};
    const to = p.praised || (p.praised_member_id ? { id: p.praised_member_id, name: '구성원' } : null);
    if (!to) return '';
    /* 한 줄에 넣느라 올해 날짜는 연도를 뺀다 (2026.09.12 → 09.12) */
    const at = String(relTime(p.created_at) || '').replace(new Date().getFullYear() + '.', '');

    const one = (m, cls) =>
      '<button class="prz-one ' + cls + '" type="button" ' +
      'data-member="' + esc(m.id || '') + '" ' +
      'data-mname="' + esc(m.name || '') + '" ' +
      'data-mphoto="' + esc(m.photo || m.photo_path || '') + '" ' +
      'data-mrole="' + esc(m.role || '') + '" ' +
      'aria-label="' + esc(m.name || '') + ' 프로필">' +
      avatar({ name: m.name, photo: m.photo || m.photo_path }) +
      '<span class="nm">' + esc(m.name || '') + '</span></button>';

    return '<div class="who przwho">' +
      '<div class="prz-line">' +
      one(who, 'from') +
      '<span class="prz-ar" aria-hidden="true">' + window.ic('chevron') + '</span>' +
      one(to, 'to') +
      '<span class="prz-tag">칭찬해요<span class="prz-at"> · ' + at +
      (p.edited_at ? ' · 수정됨' : '') + '</span></span>' +
      '</div>' +
      '<button class="iconbtn sq" type="button" data-menu="' + esc(p.id) + '" ' +
      'aria-label="이 글 메뉴">' + window.ic('more') + '</button>' +
      '</div>';
  }

  /* ---------- 나 탭 ---------- */
  async function mountMe(box) {
    if (!box) return;
    css();
    let r;
    try { r = await received(); } catch (e) { console.warn('[발자국] 받은 칭찬을 못 받아왔어요:', e); return; }
    const old = box.querySelector('.pr-me'); if (old) old.remove();
    const b = document.createElement('button');
    b.className = 'pr-me'; b.type = 'button';
    b.innerHTML = window.ic('paw') + '<span style="font-weight:700">받은 칭찬</span><span class="n">' + ((r && r.n) || 0) + '</span>';
    b.setAttribute('aria-label', '받은 칭찬 ' + ((r && r.n) || 0) + '개 보기');
    b.onclick = () => openList(r);
    box.appendChild(b);
  }

  function openList(r) {
    const rows = (r && r.rows) || [];
    const ov = UI.sheet({
      title: '받은 칭찬',
      body: rows.length
        ? rows.map(x => '<button class="pr-item" type="button" data-prgo="' + esc(x.id) + '">' +
            avatar({ name: (x.author || {}).name, photo: (x.author || {}).photo }) +
            '<span style="min-width:0;flex:1"><span class="nm">' + esc((x.author || {}).name || '') + '</span>' +
            '<span class="at">' + esc(UI.relTime ? UI.relTime(x.created_at) : '') + '</span>' +
            '<span class="bd" style="display:-webkit-box">' + esc(x.body || '') + '</span></span></button>').join('')
        /* ★ word-break:keep-all — 낱말 **가운데**를 끊지 않는다.
             Galaxy 360 에서 「칭찬해요」의 「요」 한 글자만 다음 줄로 넘어갔다 */
        : '<div class="mut sm" style="padding:8px 2px;line-height:1.6;word-break:keep-all">' +
          '아직 받은 칭찬이 없어요.<br>' +
          '고마운 사람이 있으면 먼저 칭찬해 보세요.<br>글쓰기 + → 칭찬해요</div>'
    });
    ov.querySelectorAll('[data-prgo]').forEach(b => b.onclick = () => {
      const id = b.dataset.prgo;
      UI.closeSheet();
      /* 알림을 눌렀을 때와 같은 길로 그 글을 연다 */
      setTimeout(() => { location.hash = 'post=' + id; }, 200);
    });
    fill(ov);
  }

  window.Praise = { write, head, mountMe, people, received };
})();
