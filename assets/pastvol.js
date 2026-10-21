/* ============================================================
   지난 봉사 정리
   · 봉사 탭 · 나 탭에 최근 3개 + 「지난 봉사 전체 보기 (n)」
   · 전체 보기 = 시트. 달별로 접고(이번 달만 펼침),
     칩 「내가 간 봉사만」 · 보호소, 20개씩 더 불러오기
   · 줄 모양은 봉사 탭 그대로 (.pastrow — 후기 n개 / 후기 쓰기)
   · 서버: past_events() (supabase/fix-pastvol.sql). 체험 모드는 이 파일이 같은 모양을 만든다
   쓰는 법: PastVol.mount(상자, { mine: false })            — 상자 안을 바꾼다
            PastVol.mount(상자, { mine: true, append: true }) — 상자 끝에 붙인다
   줄을 누르면 Community.openPast(id) — 봉사 탭과 같은 「지난 봉사」 시트
   ============================================================ */
(function () {
  const PAGE = 20;
  const { esc, fmtDate } = UI;
  const ic = (n) => window.ic(n);
  const todayKST = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

  /* ---------- 데이터 ---------- */
  async function load(o) {
    o = o || {};
    if (DB.isDemo && DB.isDemo()) return demo(o);
    const r = await DB.rpc('past_events', {
      p_limit: o.limit || PAGE, p_before: o.before || null, p_before_id: o.beforeId || null,
      p_mine: !!o.mine, p_place: o.place || null
    });
    return r || { rows: [], total: 0, places: [] };
  }

  /* 체험 모드 — 서버 함수와 같은 모양 */
  function demo(o) {
    let d = {};
    try { d = JSON.parse(localStorage.getItem('baljaguk.demo') || '{}'); } catch (e) { }
    const me = localStorage.getItem('baljaguk.demoMe') || '';
    const today = todayKST();
    const att = d.attendance || [], posts = d.posts || [];
    const all = (d.events || []).filter(e => String(e.date) < today).map(e => ({
      id: e.id, date: e.date, place: e.place || '', title: e.title || '',
      confirmed: !!e.confirmed_at,
      went: att.some(a => a.event_id === e.id && a.member_id === me)
    }));
    const placesMap = {};
    all.forEach(e => { if (e.place) placesMap[e.place] = (placesMap[e.place] || 0) + 1; });
    const filtered = all.filter(e => (!o.place || e.place === o.place) && (!o.mine || e.went))
      .sort((a, b) => (a.date === b.date ? (a.id < b.id ? 1 : -1) : (a.date < b.date ? 1 : -1)));
    const after = filtered.filter(e => !o.before ||
      (o.beforeId ? (e.date < o.before || (e.date === o.before && e.id < o.beforeId)) : e.date < o.before));
    const rows = after.slice(0, o.limit || PAGE).map(e => {
      const rv = posts.filter(p => p.type === 'review' && p.event_id === e.id && !p.hidden);
      const mine = rv.find(p => p.author_id === me);
      return Object.assign({}, e, { reviews: rv.length, my_review: mine ? mine.id : null });
    });
    return Promise.resolve({
      rows, total: filtered.length,
      places: Object.keys(placesMap).map(p => ({ place: p, n: placesMap[p] })).sort((a, b) => b.n - a.n)
    });
  }

  /* ---------- 줄 하나 — 봉사 탭과 같은 모양 ---------- */
  function row(e) {
    return '<button class="pastrow" type="button" data-past="' + esc(e.id) + '">' +
      '<span class="nm">' + fmtDate(e.date) +
      (e.place ? ' · ' + esc(e.place) : '') +
      (e.confirmed ? '' : ' <span class="badge">확정 전</span>') + '</span>' +
      (e.went && !e.reviews
        ? '<span class="go">후기 쓰기</span>'
        : '<span class="rt">후기 ' + (e.reviews || 0) + '개</span>') + '</button>';
  }

  const CSS =
    '.pv-more{width:100%;min-height:44px;margin-top:6px;border:none;background:none;cursor:pointer;' +
    'font:inherit;font-size:14px;font-weight:700;color:var(--brand-deep);display:flex;align-items:center;' +
    'justify-content:center;gap:4px}' +
    '.pv-chips{display:flex;gap:8px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:none}' +
    '.pv-chips::-webkit-scrollbar{display:none}' +
    '.pv-chips .chip{flex:none;min-height:44px}' +
    '.pv-month{border-bottom:1px dashed var(--line-2)}' +
    '.pv-month:last-child{border-bottom:none}' +
    '.pv-month>summary{min-height:48px;display:flex;align-items:center;gap:8px;cursor:pointer;' +
    'list-style:none;font-weight:800;font-size:15px}' +
    '.pv-month>summary::-webkit-details-marker{display:none}' +
    '.pv-month>summary .n{color:var(--ink-3);font-weight:600;font-size:13px}' +
    '.pv-month>summary .chev{margin-left:auto;transition:transform .15s}' +
    '.pv-month[open]>summary .chev{transform:rotate(90deg)}' +
    '.pv-month .pv-rows{padding:0 0 6px}' +
    '.pv-empty{padding:22px 4px;text-align:center}';
  function css() {
    if (document.getElementById('pvCss')) return;
    const st = document.createElement('style');
    st.id = 'pvCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ---------- 탭 안: 최근 3개 + 전체 보기 ---------- */
  async function mount(box, opt) {
    if (!box) return;
    css();
    opt = opt || {};
    let res;
    try { res = await load({ limit: 3, mine: !!opt.mine }); }
    catch (e) { console.warn('[발자국] 지난 봉사를 못 받아왔어요:', e); return; }
    const rows = res.rows || [];
    const html = rows.length
      ? '<div class="section-title" style="margin-top:16px">' + ic('clock') +
        '<span>' + (opt.mine ? '내가 간 봉사' : '지난 봉사') + '</span></div>' +
        '<div class="card" style="padding:4px 16px">' + rows.map(row).join('') +
        (res.total > 0
          ? '<button class="pv-more" type="button" data-pvall>지난 봉사 전체 보기 (' + res.total + ')' + ic('chevron') + '</button>'
          : '') + '</div>'
      : '';
    let host = box;
    if (opt.append) {
      host = box.querySelector(':scope > .pv-host') || document.createElement('div');
      host.className = 'pv-host';
      if (!host.parentNode) box.appendChild(host);
    }
    host.innerHTML = html;
    const all = host.querySelector('[data-pvall]');
    if (all) all.onclick = () => openAll({ mine: !!opt.mine });
  }

  /* ---------- 전체 보기 시트 ---------- */
  async function openAll(o) {
    css();
    const st = { mine: !!(o && o.mine), place: '', rows: [], total: 0, places: [], done: false, busy: false };
    const ov = UI.sheet({
      title: '지난 봉사',
      body: '<div class="pv-chips" id="pvChips"></div><div id="pvList" class="mut sm">불러오는 중…</div>'
    });
    const chips = ov.querySelector('#pvChips'), list = ov.querySelector('#pvList');

    function paintChips() {
      const chip = (on, label, attr) => '<button class="chip' + (on ? ' on' : '') + '" type="button" ' + attr + '>' + label + '</button>';
      chips.innerHTML = chip(st.mine, '내가 간 봉사만', 'data-pvmine') +
        chip(!st.place, '보호소 전체', 'data-pvplace=""') +
        st.places.map(p => chip(st.place === p.place, esc(p.place) + ' <span class="n">' + p.n + '</span>',
          'data-pvplace="' + esc(p.place) + '"')).join('');
    }
    function paintList() {
      if (!st.rows.length) {
        list.innerHTML = '<div class="pv-empty mut sm">' +
          (st.mine ? '아직 다녀온 봉사가 없어요' : '지난 봉사가 없어요') + '</div>';
        return;
      }
      /* 달별로 묶는다 — 이번 달만 펼친다 */
      const thisMonth = todayKST().slice(0, 7);
      const groups = [];
      st.rows.forEach(e => {
        const m = String(e.date).slice(0, 7);
        let g = groups[groups.length - 1];
        if (!g || g.m !== m) { g = { m, rows: [] }; groups.push(g); }
        g.rows.push(e);
      });
      list.innerHTML = '<div class="card" style="padding:0 16px">' + groups.map(g => {
        const [y, mm] = g.m.split('-');
        return '<details class="pv-month"' + (g.m === thisMonth ? ' open' : '') + '>' +
          '<summary>' + y + '년 ' + Number(mm) + '월 <span class="n">' + g.rows.length + '번</span>' +
          '<span class="chev">' + ic('chevron') + '</span></summary>' +
          '<div class="pv-rows">' + g.rows.map(row).join('') + '</div></details>';
      }).join('') + '</div>' +
        (st.done ? '' : '<button class="pv-more" type="button" data-pvnext>20개 더 보기</button>');
    }
    async function fetchPage(reset) {
      if (st.busy) return;
      st.busy = true;
      if (reset) { st.rows = []; st.done = false; list.innerHTML = '<div class="mut sm">불러오는 중…</div>'; }
      const last = st.rows[st.rows.length - 1];
      try {
        const r = await load({ limit: PAGE, mine: st.mine, place: st.place,
          before: last ? last.date : null, beforeId: last ? last.id : null });
        st.rows = st.rows.concat(r.rows || []);
        st.total = r.total || 0;
        if (r.places && r.places.length) st.places = r.places;
        st.done = (r.rows || []).length < PAGE || st.rows.length >= st.total;
        paintChips(); paintList();
      } catch (e) {
        console.warn('[발자국] 지난 봉사를 못 받아왔어요:', e);
        list.innerHTML = '<div class="pv-empty"><div class="sm">불러오지 못했어요</div>' +
          '<button class="btn soft sm" type="button" data-pvretry style="margin-top:10px">다시 시도</button></div>';
      }
      st.busy = false;
    }
    ov.addEventListener('click', e => {
      const t = e.target.closest('[data-pvmine],[data-pvplace],[data-pvnext],[data-pvretry],[data-past]');
      if (!t || !ov.contains(t)) return;
      if (t.hasAttribute('data-pvmine')) { st.mine = !st.mine; return fetchPage(true); }
      if (t.hasAttribute('data-pvplace')) { st.place = t.getAttribute('data-pvplace') || ''; return fetchPage(true); }
      if (t.hasAttribute('data-pvnext')) return fetchPage(false);
      if (t.hasAttribute('data-pvretry')) return fetchPage(true);
      if (t.hasAttribute('data-past') && window.Community && Community.openPast) Community.openPast(t.getAttribute('data-past'));
    });
    paintChips();
    fetchPage(true);
  }

  window.PastVol = { mount, openAll, load };
})();
