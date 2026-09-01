/* ============================================================
   공통 UI 유틸
   ============================================================ */
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  /* ---------- 테마 ---------- */
  function initTheme() {
    const saved = localStorage.getItem('baljaguk.theme');
    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = saved || sys;
  }
  function toggleTheme() {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('baljaguk.theme', next);
    paintThemeButtons();
  }
  function paintThemeButtons() {
    const dark = document.documentElement.dataset.theme === 'dark';
    $$('[data-theme-btn]').forEach(b => {
      b.innerHTML = window.ic(dark ? 'sun' : 'moon');
      b.setAttribute('aria-label', dark ? '밝은 화면으로' : '어두운 화면으로');
    });
  }

  /* ---------- 토스트 ---------- */
  function toast(msg, type) {
    let box = $('.toasts');
    if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast' + (type ? ' ' + type : '');
    t.setAttribute('role', 'status');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 320); }, 2400);
  }

  /* ---------- 바텀시트 / 모달 ---------- */
  let lastFocus = null;
  function sheet(opts) {
    closeSheet();
    lastFocus = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'overlay';
    ov.innerHTML =
      '<div class="sheet" role="dialog" aria-modal="true">' +
      '<div class="hd"><h3>' + (opts.title || '') + '</h3>' +
      '<button class="iconbtn" data-close aria-label="닫기">' + window.ic('x') + '</button></div>' +
      '<div class="sheet-body"></div></div>';
    $('.sheet-body', ov).innerHTML = opts.body || '';
    document.body.appendChild(ov);
    document.body.style.overflow = 'hidden';
    ov.addEventListener('click', e => { if (e.target === ov) closeSheet(); });
    $('[data-close]', ov).addEventListener('click', closeSheet);
    document.addEventListener('keydown', escClose);
    const f = ov.querySelector('input,textarea,select,button:not([data-close])');
    if (f && !opts.noFocus) setTimeout(() => f.focus(), 60);
    if (opts.onMount) opts.onMount(ov);
    return ov;
  }
  function escClose(e) { if (e.key === 'Escape') closeSheet(); }
  function closeSheet() {
    const ov = $('.overlay');
    if (ov) ov.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', escClose);
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) { } lastFocus = null; }
  }
  function confirmSheet(title, desc, okLabel, danger) {
    return new Promise(res => {
      const ov = sheet({
        title,
        body: '<p class="mut" style="margin:0 0 18px">' + (desc || '') + '</p>' +
          '<div class="row" style="gap:8px"><button class="btn ghost grow" data-no>취소</button>' +
          '<button class="btn ' + (danger ? 'danger' : 'primary') + ' grow" data-yes>' + (okLabel || '확인') + '</button></div>'
      });
      $('[data-no]', ov).onclick = () => { closeSheet(); res(false); };
      $('[data-yes]', ov).onclick = () => { closeSheet(); res(true); };
    });
  }

  /* ---------- 복사 ---------- */
  async function copy(text, label) {
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else {
        const ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      toast((label || '복사했어요') + ' ✓', 'ok');
      return true;
    } catch (e) { toast('복사하지 못했어요. 길게 눌러 복사해주세요', 'err'); return false; }
  }

  /* ---------- 포맷 ---------- */
  const won = n => (Number(n) || 0).toLocaleString('ko-KR') + '원';
  const num = n => (Number(n) || 0).toLocaleString('ko-KR');
  function fmtDate(v) {
    if (!v) return '-';
    const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    if (isNaN(d)) return v;
    return d.getFullYear() + '.' + p2(d.getMonth() + 1) + '.' + p2(d.getDate());
  }
  function fmtDateTime(v) {
    if (!v) return '-';
    const d = new Date(v); if (isNaN(d)) return v;
    return fmtDate(v) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function weekday(v) {
    const d = new Date(v.length === 10 ? v + 'T00:00:00' : v);
    return ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
  }
  const p2 = n => String(n).padStart(2, '0');
  function relTime(v) {
    const diff = (Date.now() - Date.parse(v)) / 1000;
    if (isNaN(diff)) return '';
    if (diff < 60) return '방금';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + '일 전';
    return fmtDate(v);
  }
  /* 학번 정규화: 202311584 · 2023 → 23, 25 → 25 */
  function normSid(v) {
    const d = String(v || '').replace(/\D/g, '');
    if (d.length >= 4) {
      const y = Number(d.slice(0, 4));
      if (y >= 1990 && y <= 2099) return d.slice(2, 4);
    }
    return d;
  }
  function hyphenPhone(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function toLocalInput(iso) {
    if (!iso) return '';
    const d = new Date(iso); if (isNaN(d)) return '';
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + 'T' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  const fromLocalInput = v => v ? new Date(v).toISOString() : null;

  /* ---------- 아바타 (이니셜 + 파스텔) ---------- */
  const AV = [
    ['#E7F2DC', '#4E8C36'], ['#FBF0D8', '#9A701A'], ['#E3EFFA', '#2F6494'],
    ['#FCE6E9', '#B24A59'], ['#EFE8F8', '#6B4C9A'], ['#DFF1EE', '#256F63']
  ];
  function avatar(m, cls) {
    const name = (m && m.name) || '?';
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
    const [bg, fg] = AV[h % AV.length];
    const face = (m && m.emoji) ? m.emoji : name.slice(0, 1);
    return '<div class="avatar' + (cls ? ' ' + cls : '') + '" style="background:' + bg + ';color:' + fg + '" aria-hidden="true">' + esc(face) + '</div>';
  }

  /* ---------- 이미지 축소 ---------- */
  function resizeImage(file, maxSide, quality) {
    return new Promise((res, rej) => {
      if (!file || !/^image\//.test(file.type)) return rej(new Error('이미지 파일만 올릴 수 있어요'));
      const fr = new FileReader();
      fr.onerror = () => rej(new Error('파일을 읽지 못했어요'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => rej(new Error('이미지를 열지 못했어요'));
        img.onload = () => {
          const max = maxSide || 1280;
          let { width: w, height: h } = img;
          const r = Math.min(1, max / Math.max(w, h));
          w = Math.round(w * r); h = Math.round(h * r);
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
          ctx.drawImage(img, 0, 0, w, h);
          res(c.toDataURL('image/jpeg', quality || 0.72));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }

  /* ---------- CSV ---------- */
  function downloadCSV(filename, header, rows) {
    const q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
    const csv = '﻿' + [header.map(q).join(',')].concat(rows.map(r => r.map(q).join(','))).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1500);
  }

  /* ---------- 축하 효과 ---------- */
  function cheer() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const box = document.createElement('div'); box.className = 'confetti';
    const marks = ['🐾', '🐶', '🐱', '💚', '🌿'];
    for (let i = 0; i < 22; i++) {
      const s = document.createElement('i');
      s.textContent = marks[i % marks.length];
      s.style.left = Math.random() * 100 + 'vw';
      s.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
      s.style.animationDelay = (Math.random() * .5) + 's';
      s.style.fontSize = (14 + Math.random() * 14) + 'px';
      box.appendChild(s);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 3400);
  }

  function debounce(fn, ms) { let t; return function () { clearTimeout(t); const a = arguments; t = setTimeout(() => fn.apply(null, a), ms || 200); }; }

  window.UI = {
    $, $$, initTheme, toggleTheme, paintThemeButtons, toast, sheet, closeSheet, confirmSheet,
    copy, won, num, fmtDate, fmtDateTime, weekday, relTime, hyphenPhone, normSid, esc, avatar,
    resizeImage, downloadCSV, cheer, debounce, toLocalInput, fromLocalInput
  };
})();
