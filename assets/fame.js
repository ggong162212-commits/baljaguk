/* ============================================================
   명예의 전당
   · 기록 배지 네 개(첫 봉사 · 5회 · 10회 · 보호소 3곳)를 다 모으면 서버가 글을 올린다
     (supabase/fix-fame.sql — 글쓴이 칸엔 주인공이 들어가지만 화면은 「발자국」으로 보인다)
   · 피드 카드: 은은한 금색 · 「명예의 전당 · ○번째 주인공」 · 주인공 사진 크게 · 배지 네 개
     아래 하트 · 댓글은 다른 글과 같다
   · 「나」 탭 기록 배지 칸 아래 「명예의 전당 ○번째」
   쓰는 법:
     Fame.who(p)      — postCard 의 글쓴이 자리 (명예의 전당 글이면 「발자국」)
     Fame.head(p)     — postCard 에서 (명예의 전당 글일 때만)
     Fame.mountMe(box) — renderMe 에서
   ============================================================ */
(function () {
  const { esc, avatar } = UI;
  const isDemo = () => !!(DB.isDemo && DB.isDemo());
  const BADGES = [['sprout', '첫 봉사'], ['star', '5회'], ['crown', '10회'], ['heart', '보호소 3곳']];

  const CSS =
    '.card.post.fame{background:var(--surface);' +
    'background:color-mix(in srgb,var(--gold-soft) 55%,var(--surface));' +
    'box-shadow:var(--shadow-sm),inset 0 0 0 1.5px color-mix(in srgb,var(--gold) 45%,transparent)}' +
    /* 글쓴이 「발자국」 — 로고 동그라미, 눌러도 프로필이 안 열린다 */
    '.card.post.fame .who .facebtn{pointer-events:none}' +
    '.card.post.fame .who .avatar,.avatar.fame-logo{background:#fff url("assets/icon-192.png") center/cover no-repeat;' +
    'color:transparent;box-shadow:0 0 0 1px var(--line)}' +
    '.famebar{margin:2px 0 12px;padding:14px 12px 12px;border-radius:18px;text-align:center;' +
    'background:var(--gold-soft)}' +
    '.famebar .ttl{display:inline-flex;align-items:center;gap:6px;font-weight:800;font-size:14px;' +
    'color:var(--ink);font-family:var(--font-title)}' +
    '.famebar .ttl svg,.famebar .ttl .svg{width:18px;height:18px;color:var(--gold)}' +
    '.famebar .facebtn{display:block;margin:10px auto 6px;border:none;background:none;padding:0;' +
    'border-radius:50%;cursor:pointer;min-width:84px;min-height:84px}' +
    '.famebar .avatar{width:84px;height:84px;font-size:30px;box-shadow:0 0 0 3px var(--gold)}' +
    '.famebar .nm{font-weight:800;font-size:16px;color:var(--ink)}' +
    '.famebar .bdg{display:flex;justify-content:center;gap:10px;margin-top:10px}' +
    '.famebar .bdg span{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:12px;' +
    'font-weight:700;color:var(--ink-2);min-width:52px}' +
    '.famebar .bdg i{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;' +
    'background:var(--surface);color:var(--gold);box-shadow:0 0 0 1.5px var(--gold)}' +
    '.famebar .bdg i svg,.famebar .bdg i .svg{width:18px;height:18px}' +
    '.fame-me{display:flex;align-items:center;gap:8px;margin-top:12px;padding:10px 12px;border-radius:14px;' +
    'background:var(--gold-soft);font-weight:800;font-size:14px;color:var(--ink);width:100%;border:none;' +
    'text-align:left;min-height:44px;cursor:pointer}' +
    '.fame-me svg,.fame-me .svg{width:18px;height:18px;color:var(--gold)}';
  function css() {
    if (document.getElementById('fameCss')) return;
    const st = document.createElement('style'); st.id = 'fameCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* 글쓴이 자리 — 명예의 전당 글은 「발자국」 */
  function who(p) {
    return p && p.type === 'fame' ? { id: '', name: '발자국', role: '' } : null;
  }

  function head(p) {
    css();
    const f = p.fame || {};
    const hero = f.name ? { id: f.id, name: f.name, photo: f.photo } : (p.author || {});
    return '<div class="famebar">' +
      '<div class="ttl">' + window.ic('crown') + '<span>명예의 전당' +
      (f.rank ? ' · ' + Number(f.rank) + '번째 주인공' : '') + '</span></div>' +
      '<button class="facebtn" type="button" data-peek="' + esc(hero.id || '') + '" ' +
      'data-pname="' + esc(hero.name || '') + '" data-pphoto="' + esc(hero.photo || hero.photo_path || '') + '" ' +
      'aria-label="' + esc(hero.name || '') + ' 프로필">' + avatar({ name: hero.name, photo: hero.photo || hero.photo_path }) + '</button>' +
      '<div class="nm">' + esc(hero.name || '') + '</div>' +
      '<div class="bdg">' + BADGES.map(b => '<span><i>' + window.ic(b[0]) + '</i>' + b[1] + '</span>').join('') + '</div>' +
      '</div>';
  }

  async function mine() {
    if (isDemo()) {
      let d = {}; try { d = JSON.parse(localStorage.getItem('baljaguk.demo') || '{}'); } catch (e) { }
      const me = localStorage.getItem('baljaguk.demoMe');
      const p = (d.posts || []).find(x => x.type === 'fame' && x.honored_member_id === me);
      return p ? { rank: p.fame_rank || null, post_id: p.id } : null;
    }
    return await DB.rpc('fame_me', {});
  }

  /* 「나」 탭 기록 배지 칸 아래 */
  async function mountMe(box) {
    if (!box) return;
    css();
    let r = null;
    try { r = await mine(); } catch (e) { console.warn('[발자국] 명예의 전당 번호를 못 받아왔어요:', e); return; }
    if (!r || !r.rank) return;
    const card = [...box.querySelectorAll('.card')].find(c => /기록 배지/.test((c.querySelector('h3') || {}).textContent || ''));
    if (!card || card.querySelector('.fame-me')) return;
    const b = document.createElement('button');
    b.className = 'fame-me'; b.type = 'button';
    b.innerHTML = window.ic('crown') + '<span>명예의 전당 ' + Number(r.rank) + '번째</span>';
    b.setAttribute('aria-label', '명예의 전당 ' + Number(r.rank) + '번째 — 그 글 열기');
    if (r.post_id) b.onclick = () => { location.hash = 'post=' + r.post_id; };
    card.appendChild(b);
  }

  window.Fame = { who, head, mountMe };
})();
