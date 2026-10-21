/* ============================================================
   봉사 신청자 보기
   · 다가오는 봉사 카드 「선착순 3 / 8명」 줄 옆에 신청자 얼굴 겹침(최대 5 + 「+n」)
   · 누르면 시트 — 신청한 순서대로 사진 · 이름 · 기수, 대기자는 따로
   · 이름 · 사진 · 기수만 (연락처·학번 없음 — 서버 함수에서부터 안 나온다)
   · 서버: event_signups(p_event) (supabase/fix-pastvol.sql). 체험 모드는 이 파일이 만든다
   · 신청/취소하면 봉사 탭이 다시 그려지고 그때 다시 붙는다(renderVol 연결 한 줄)
   쓰는 법: VolWho.mount(봉사 카드들이 든 상자)
   ============================================================ */
(function () {
  const MAX = 5;
  const { esc, avatar } = UI;

  async function load(eventId) {
    if (DB.isDemo && DB.isDemo()) return demo(eventId);
    return (await DB.rpc('event_signups', { p_event: eventId })) || { going: [], waiting: [] };
  }
  function demo(eventId) {
    let d = {};
    try { d = JSON.parse(localStorage.getItem('baljaguk.demo') || '{}'); } catch (e) { }
    const mem = id => (d.members || []).find(m => m.id === id);
    const gen = (d.settings && d.settings.generation) || '';
    const pick = rows => rows.map(r => mem(r.member_id)).filter(Boolean)
      .map(m => ({ id: m.id, name: m.name, photo: m.photo_path || m.photo || null, gen: gen || null }));
    const by = (a, b) => { const x = a.created_at || '~', y = b.created_at || '~'; return x < y ? -1 : x > y ? 1 : 0; };   /* 체험 모드에서 새로 넣은 줄은 created_at 이 없다 — 맨 뒤로 */
    return Promise.resolve({
      going: pick((d.attendance || []).filter(a => a.event_id === eventId).sort(by)),
      waiting: pick((d.event_waitlist || []).filter(w => w.event_id === eventId).sort(by))
    });
  }

  /* 사진 채우기 — 비공개 보관함이라 서명된 주소를 받아 온다 */
  async function fill(root) {
    const els = [...root.querySelectorAll('[data-avatar]')];
    for (const el of els) {
      const p = el.getAttribute('data-avatar'); el.removeAttribute('data-avatar');
      try {
        const url = await DB.community.avatarUrl(p);
        if (url) { el.style.backgroundImage = 'url("' + url + '")'; el.classList.add('has-photo'); el.textContent = ''; }
      } catch (e) { }
    }
  }
  const face = p => avatar({ name: p.name, photo: p.photo });
  const genOf = p => p.gen ? String(p.gen).replace(/기$/, '') + '기' : '';

  const CSS =
    '.vw-line{display:flex;align-items:center;gap:8px;flex-wrap:wrap}' +
    '.vw-faces{display:inline-flex;align-items:center;border:none;background:none;padding:0 4px;margin:0;' +
    'min-height:44px;min-width:44px;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
    '.vw-faces .avatar{width:26px;height:26px;font-size:12px;margin-left:-8px;' +
    'box-shadow:0 0 0 2px var(--surface);flex:none}' +
    '.vw-faces .avatar:first-child{margin-left:0}' +
    '.vw-faces .vw-more{margin-left:4px;font-size:12px;font-weight:700;color:var(--ink-2)}' +
    '.vw-list{display:grid;gap:2px}' +
    '.vw-row{display:flex;align-items:center;gap:12px;min-height:52px;padding:4px 0}' +
    '.vw-row .avatar{width:40px;height:40px;flex:none}' +
    '.vw-row .no{width:22px;text-align:right;font-size:12px;color:var(--ink-3);flex:none}' +
    '.vw-row .nm{font-weight:700;font-size:15px}' +
    '.vw-row .gen{font-size:12px;color:var(--ink-3);margin-left:6px;font-weight:600}' +
    '.vw-h{font-weight:800;font-size:14px;margin:14px 0 4px;color:var(--ink-2)}' +
    '.vw-h:first-child{margin-top:0}';
  function css() {
    if (document.getElementById('vwCss')) return;
    const st = document.createElement('style'); st.id = 'vwCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  async function mount(box) {
    if (!box) return;
    css();
    const cards = [...box.querySelectorAll('[data-ev]')];
    await Promise.all(cards.map(async card => {
      /* 「선착순 3 / 8명」 줄 — 카드 바로 아래 칸 중 그 글자가 있는 것 */
      const line = [...card.children].find(x => /선착순|명 신청/.test(x.textContent || ''));
      if (!line || line.querySelector('.vw-faces')) return;
      let r;
      try { r = await load(card.getAttribute('data-ev')); } catch (e) { return; }
      const going = (r && r.going) || [], waiting = (r && r.waiting) || [];
      if (!going.length && !waiting.length) return;
      const shown = going.slice(0, MAX);
      const more = going.length - shown.length;
      const txt = line.innerHTML;
      line.classList.add('vw-line');
      line.innerHTML = '<span>' + txt + '</span>' +
        (going.length
          ? '<button class="vw-faces" type="button" aria-label="신청한 사람 ' + going.length + '명 보기">' +
            shown.map(face).join('') +
            (more > 0 ? '<span class="vw-more">+' + more + '</span>' : '') + '</button>'
          : '<button class="vw-faces" type="button" aria-label="대기한 사람 보기"><span class="vw-more">대기 ' + waiting.length + '명</span></button>');
      line.querySelector('.vw-faces').onclick = () => openSheet(card, going, waiting);
      fill(line);
    }));
  }

  function openSheet(card, going, waiting) {
    css();
    const title = (card.querySelector('.grow > div') || {}).textContent || '';
    const row = (p, i) => '<div class="vw-row"><span class="no">' + (i + 1) + '</span>' + face(p) +
      '<span class="grow"><span class="nm">' + esc(p.name) + '</span>' +
      (genOf(p) ? '<span class="gen">' + esc(genOf(p)) + '</span>' : '') + '</span></div>';
    const ov = UI.sheet({
      title: '신청한 사람',
      body: (title ? '<div class="mut sm" style="margin:-6px 0 12px">' + esc(title) + '</div>' : '') +
        '<div class="vw-h">신청 ' + going.length + '명 · 신청한 순서</div>' +
        (going.length ? '<div class="vw-list">' + going.map(row).join('') + '</div>'
          : '<div class="mut sm">아직 아무도 없어요</div>') +
        (waiting.length
          ? '<div class="vw-h">대기 ' + waiting.length + '명</div><div class="vw-list">' + waiting.map(row).join('') + '</div>'
          : '')
    });
    fill(ov);
  }

  window.VolWho = { mount, load };
})();
