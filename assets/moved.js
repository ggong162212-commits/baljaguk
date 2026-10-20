/* ============================================================
   「이제 커뮤니티에서 해요」 안내
   봉사 신청·설문·1365 는 커뮤니티로 옮겼다.
   옛 링크로 들어온 사람이 길을 잃지 않게 위에 안내를 먼저 띄우고,
   옛 기능은 아래에 그대로 남겨 둔다. 닫는 시점은 나중에 정한다.
   ============================================================ */
(function () {
  const WHAT = {
    volunteer: { title: '봉사 신청', where: '커뮤니티 「봉사」 탭' },
    survey: { title: '활동 의견', where: '커뮤니티 「투표」 탭' },
    id1365: { title: '1365 정보', where: '커뮤니티 「나」 탭' }
  };

  function paint(kind) {
    const w = WHAT[kind];
    if (!w) return;
    const app = document.querySelector('.app');
    if (!app || document.querySelector('#movedCard')) return;

    const html =
      '<div class="card" id="movedCard" style="margin-bottom:14px">' +
      '<div class="row" style="gap:10px;align-items:flex-start">' +
      '<span style="width:38px;height:38px;border-radius:13px;flex:none;display:grid;' +
      'place-items:center;background:var(--brand-soft);color:var(--brand-deep)">' +
      window.ic('paw') + '</span>' +
      '<div class="grow">' +
      '<div style="font-weight:700;font-size:15px">이제 발자국 커뮤니티에서 해요</div>' +
      '<div class="mut sm" style="margin-top:4px;line-height:1.6">' +
      '「' + w.title + '」은 ' + w.where + '으로 옮겼어요.<br>' +
      '카카오로 한 번만 들어오면 봉사·후기·투표를 한곳에서 볼 수 있어요.</div>' +
      '</div></div>' +
      '<div class="sp"></div>' +
      '<a class="btn primary lg block" href="me.html">카카오로 들어가기</a>' +
      '</div>' +
      '<details id="oldWrap" style="margin-bottom:14px">' +
      '<summary class="linkbtn" style="font-size:13px">예전 방식으로 하기</summary>' +
      '</details>';

    app.insertAdjacentHTML('afterbegin', html);

    /* 옛 화면은 접은 칸 안으로 옮긴다 */
    const wrap = document.querySelector('#oldWrap');
    const card = document.querySelector('#movedCard');
    let el = wrap.nextElementSibling;
    while (el) {
      const next = el.nextElementSibling;
      wrap.appendChild(el);
      el = next;
    }
    if (card && wrap) card.after(wrap);
  }

  window.movedNotice = paint;
})();
