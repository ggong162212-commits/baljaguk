/* ============================================================
   선 일러스트 — 빈 화면 · 오류 · 배지에만 쓴다
   아이콘(icons.js)과 같은 선 느낌. 색은 currentColor + 포인트 하나.
   이모지나 외부 이미지는 쓰지 않는다.
   ============================================================ */
(function () {
  /* viewBox 120x90 기준. 아이콘이 24에서 1.7 이니 같은 굵기로 보이게 2.2 */
  const D = {

    /* 빈 피드 — 강아지가 고개를 갸웃 */
    emptyFeed:
      '<g transform="rotate(-10 60 48)">' +
      /* 늘어진 귀 — 머리보다 먼저 그려 뒤로 보낸다 */
      '<path class="soft" d="M43 40c-8-1-13 5-13 14 0 9 5 15 11 16 4 1 6-2 6-6Z"/>' +
      '<path class="soft" d="M77 40c8-1 13 5 13 14 0 9-5 15-11 16-4 1-6-2-6-6Z"/>' +
      '<path class="soft" d="M42 44c0-11 8-19 18-19s18 8 18 19c0 13-8 21-18 21s-18-8-18-21Z"/>' +
      '<circle cx="53" cy="44" r="1.9" class="dot"/>' +
      '<circle cx="67" cy="44" r="1.9" class="dot"/>' +
      /* 주둥이 */
      '<path d="M51 54c0-4 4-6 9-6s9 2 9 6c0 4-4 7-9 7s-9-3-9-7Z"/>' +
      '<ellipse cx="60" cy="52" rx="2.8" ry="2" class="dot"/>' +
      '<path d="M60 54v2.5"/>' +
      '<path d="M56.5 58.5c1 1 2.2 1.5 3.5 1.5s2.5-.5 3.5-1.5"/>' +
      '</g>' +
      /* 갸웃하는 느낌 — 물음표 하나만 */
      '<path class="thin" d="M89 25c2.4-2.2 5.2-1.6 5.6.9.3 2-1.2 2.9-2.6 3.6"/>' +
      '<circle cx="92" cy="35" r="1.2" class="dot"/>',

    /* 빈 설문 — 고양이가 상자 안 */
    emptyPoll:
      '<path class="soft" d="M30 50h60v22a5 5 0 0 1-5 5H35a5 5 0 0 1-5-5Z"/>' +
      '<path d="M30 50 21 40M90 50l9-10"/>' +
      '<path d="M30 50h60"/>' +
      '<path d="M45 50c0-9 6.7-15 15-15s15 6 15 15"/>' +
      '<path d="M47.5 39.5 44 29l9.5 4.2"/>' +
      '<path d="M72.5 39.5 76 29l-9.5 4.2"/>' +
      '<circle cx="54" cy="44" r="1.8" class="dot"/>' +
      '<circle cx="66" cy="44" r="1.8" class="dot"/>' +
      '<path d="M57 48.5c1 1 2 1.4 3 1.4s2-.4 3-1.4"/>',

    /* 오류 — 강아지가 줄에 엉켰어요 */
    error:
      '<path class="thin" d="M16 36c8-8 14 6 22 2s10-10 18-7 9 13 17 11 11-10 17-6"/>' +
      '<path class="thin" d="M24 52c7 5 13-3 20 1s9 10 17 8 12-9 19-5"/>' +
      '<g transform="translate(0 6)">' +
      '<path class="soft" d="M46 58c0-8 6-14 14-14s14 6 14 14c0 9-6 15-14 15s-14-6-14-15Z"/>' +
      '<path d="M47 51c-4-4-9-3-9 1 0 4 3 7 7 8"/>' +
      '<path d="M73 51c4-4 9-3 9 1 0 4-3 7-7 8"/>' +
      '<circle cx="55" cy="58" r="1.7" class="dot"/>' +
      '<circle cx="65" cy="58" r="1.7" class="dot"/>' +
      '<ellipse cx="60" cy="64" rx="2.7" ry="2" class="dot"/>' +
      '<path d="M56 69c1.4 1.6 2.7 2.3 4 2.3s2.6-.7 4-2.3"/>' +
      '</g>',

    /* 배지 — 발바닥 메달 */
    badge:
      '<path d="M47 16 56 38M73 16 64 38"/>' +
      '<circle class="soft" cx="60" cy="56" r="21"/>' +
      '<circle cx="60" cy="56" r="15.5" class="thin"/>' +
      '<ellipse cx="53" cy="50" rx="2.3" ry="3" class="dot"/>' +
      '<ellipse cx="60" cy="48" rx="2.3" ry="3.1" class="dot"/>' +
      '<ellipse cx="67" cy="50" rx="2.3" ry="3" class="dot"/>' +
      '<path class="dot" d="M60 55c-3 0-5.5 2.3-5.5 5 0 2 1.5 3.1 3.4 3.1 1 0 1.5-.5 2.1-.5s1 .5 2.1.5c1.9 0 3.4-1.1 3.4-3.1 0-2.7-2.5-5-5.5-5Z"/>'
  };

  window.illus = function (name, cls) {
    const d = D[name] || D.emptyFeed;
    return '<svg class="illus' + (cls ? ' ' + cls : '') + '" viewBox="0 0 120 90" ' +
      'fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  };
})();
