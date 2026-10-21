/* ============================================================
   프로필 사진 크게 보기 — 카카오톡처럼
   · 검은 배경 전체 화면, 사진은 화면 폭 가득 정사각형 가운데(둥근 모서리·테두리 없음)
   · 위 왼쪽 ✕(44px), 위 가운데 이름(흰 글씨)
   · 두 손가락 · 두 번 탭으로 확대, 확대했으면 끌어서 옮기기
   · 아래로 쓸어 닫기 — 손가락을 따라 내려가며 배경이 옅어진다
   · 뒤로 버튼으로 닫힌다. 밑에 열린 시트는 그대로 남는다
     (ui.js onPop 이 .avv 가 있으면 시트를 닫지 않는다 — 그래서 .avv 는
      뒤로 신호를 받은 다음에 지운다)
   쓰는 법: AvatarView.open(사진 경로 또는 주소, 이름)
   ============================================================ */
(function () {
  const MAX = 4;
  const CSS =
    '.avv{position:fixed;inset:0;z-index:320;background:rgba(0,0,0,1);touch-action:none;' +
    '-webkit-user-select:none;user-select:none;overflow:hidden}' +
    '.avv-hd{position:absolute;left:0;right:0;top:0;z-index:2;display:flex;align-items:center;' +
    'padding:calc(env(safe-area-inset-top,0px) + 4px) 4px 4px;transition:opacity .15s}' +
    '.avv-x{width:44px;height:44px;border:none;background:none;color:#fff;display:grid;place-items:center;' +
    'cursor:pointer;flex:none;-webkit-tap-highlight-color:transparent}' +
    '.avv-x .svg,.avv-x svg{width:24px;height:24px}' +
    '.avv-nm{position:absolute;left:56px;right:56px;text-align:center;color:#fff;font-weight:700;font-size:16px;' +
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
    '.avv-stage{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}' +
    '.avv-img{width:100vw;height:100vw;max-width:100vh;max-height:100vh;object-fit:cover;display:block;' +
    'border-radius:0;will-change:transform;transform-origin:center center}';
  function css() {
    if (document.getElementById('avvCss')) return;
    const st = document.createElement('style'); st.id = 'avvCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  async function urlOf(p) {
    if (!p) return '';
    if (/^(data:|https?:|blob:)/.test(p)) return p;
    try { return await DB.community.avatarUrl(p); } catch (e) { return ''; }
  }

  async function open(photo, name) {
    css();
    const url = await urlOf(photo);
    if (!url) return false;
    const ov = document.createElement('div');
    ov.className = 'avv';
    ov.setAttribute('role', 'dialog');
    ov.setAttribute('aria-modal', 'true');
    ov.setAttribute('aria-label', (name || '') + ' 프로필 사진');
    ov.innerHTML =
      '<div class="avv-hd"><button class="avv-x" type="button" aria-label="닫기">' + window.ic('x') + '</button>' +
      '<div class="avv-nm"></div></div>' +
      '<div class="avv-stage"><img class="avv-img" alt="" draggable="false"></div>';
    ov.querySelector('.avv-nm').textContent = name || '';
    const img = ov.querySelector('.avv-img');
    img.src = url; img.alt = (name || '') + ' 프로필 사진';
    const hd = ov.querySelector('.avv-hd');
    document.body.appendChild(ov);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    let s = 1, tx = 0, ty = 0, dy = 0, open_ = true;
    const size = () => img.getBoundingClientRect().width / (s || 1);
    function bound() {
      const sz = size(), lim = Math.max(0, (sz * s - sz) / 2);
      tx = Math.min(lim, Math.max(-lim, tx)); ty = Math.min(lim, Math.max(-lim, ty));
    }
    function paint(anim) {
      img.style.transition = anim ? 'transform .2s ease' : 'none';
      img.style.transform = 'translate(' + tx + 'px,' + (ty + dy) + 'px) scale(' + s + ')';
      const a = Math.max(0, 1 - Math.abs(dy) / 380);
      ov.style.transition = anim ? 'background-color .2s ease' : 'none';
      ov.style.backgroundColor = 'rgba(0,0,0,' + a + ')';
      hd.style.opacity = dy ? String(a) : '1';
    }
    function zoomAt(ns, px, py) {
      ns = Math.min(MAX, Math.max(1, ns));
      const r = ov.getBoundingClientRect();
      const cx = px - r.width / 2, cy = py - r.height / 2;
      tx = cx - (cx - tx) * (ns / s); ty = cy - (cy - ty) * (ns / s);
      s = ns; if (s === 1) { tx = 0; ty = 0; } bound();
    }

    /* 손가락 */
    const pts = new Map();
    let last = null, startY = 0, lastTap = 0, moved = false;
    const pair = () => { const [a, b] = [...pts.values()]; return { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; };
    ov.addEventListener('pointerdown', e => {
      if (e.target.closest('.avv-x')) return;
      ov.setPointerCapture(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      moved = false;
      if (pts.size === 2) last = pair();
      else { last = { x: e.clientX, y: e.clientY }; startY = e.clientY; }
    });
    ov.addEventListener('pointermove', e => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        const p = pair();
        if (last && last.d) { tx += p.mx - last.mx; ty += p.my - last.my; zoomAt(s * (p.d / last.d), p.mx, p.my); }
        last = p; dy = 0; moved = true; paint(false);
        return;
      }
      if (!last) return;
      const ddx = e.clientX - last.x, ddy = e.clientY - last.y;
      if (Math.abs(e.clientY - startY) > 6 || Math.abs(ddx) > 6) moved = true;
      if (s > 1) { tx += ddx; ty += ddy; bound(); }
      else { dy = Math.max(0, e.clientY - startY); }     /* 아래로만 따라 내려간다 */
      last = { x: e.clientX, y: e.clientY };
      paint(false);
    });
    const up = e => {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 1) { const p = [...pts.values()][0]; last = { x: p.x, y: p.y }; startY = p.y - dy; return; }
      if (pts.size) return;
      if (s === 1 && dy > 110) return close(true);
      /* 두 번 탭 — 확대 ↔ 원래 */
      if (!moved) {
        const now = Date.now();
        if (now - lastTap < 300) {
          if (s > 1) { s = 1; tx = 0; ty = 0; } else zoomAt(2.5, e.clientX, e.clientY);
          lastTap = 0;
        } else lastTap = now;
      }
      dy = 0; paint(true);
    };
    ov.addEventListener('pointerup', up);
    ov.addEventListener('pointercancel', up);

    /* 뒤로 버튼 */
    let slideOut = false, wait = 0;
    const onPop = () => {
      window.removeEventListener('popstate', onPop);
      clearTimeout(wait); open_ = false;
      shut(slideOut);
    };
    try { history.pushState({ avv: 1 }, ''); window.addEventListener('popstate', onPop); } catch (e) { }

    /* 쓸어서 닫을 때는 아래로 빠지며 사라지고, 그동안 화면을 덮어 둔다 —
       손가락을 뗀 탭이 밑의 시트 배경에 떨어져 시트까지 닫히지 않게 */
    function shut(slide) {
      if (!ov.isConnected || ov.dataset.out) return;
      ov.dataset.out = '1';
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (!slide) return ov.remove();
      dy = window.innerHeight; paint(true);
      ov.style.backgroundColor = 'rgba(0,0,0,0)';
      setTimeout(() => ov.remove(), 350);
    }
    /* ✕ · 쓸기 — 눌러 둔 기록을 되돌리고, 그 신호(onPop)가 오면 지운다 */
    function close(slide) {
      if (!open_) return;
      open_ = false; slideOut = !!slide;
      if (history.state && history.state.avv) {
        try { history.back(); wait = setTimeout(onPop, 600); return; } catch (e) { }
      }
      onPop();
    }
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    ov.querySelector('.avv-x').onclick = () => close();
    paint(false);
    return true;
  }

  window.AvatarView = { open };
})();
