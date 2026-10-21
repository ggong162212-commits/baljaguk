/* ============================================================
   구성원 전용 · 내 활동
   카카오로 로그인 → 명부의 내 이름에 잇기 → 내 기록
   ============================================================ */
(function () {
  const { $, esc, toast, won, num, fmtDate } = UI;

  const KAKAO =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 3C6.5 3 2 6.58 2 11c0 2.82 1.87 5.3 4.69 6.72-.21.75-.75 2.7-.86 3.12-.13.52.19.51.4.37.17-.11 2.65-1.8 3.72-2.53.67.1 1.35.15 2.05.15 5.5 0 10-3.58 10-8S17.5 3 12 3Z"/></svg>';

  /* 로그인하고 돌아올 주소 — 주소에 ? 나 # 가 붙어 있어도 깨끗한 쪽으로 */
  const backHere = () => location.origin + location.pathname;

  /* 지금 몇 단계인지 — 처음 오는 사람이 길을 잃지 않게 */
  const steps = n =>
    '<div class="steps" style="margin:0 2px 14px">' +
    '<i class="' + (n >= 1 ? 'on' : '') + '"></i>' +
    '<i class="' + (n >= 2 ? 'on' : '') + '"></i></div>' +
    '<div class="row" style="justify-content:space-between;margin:-10px 4px 14px;font-size:12px">' +
    '<span style="' + (n >= 1 ? 'color:var(--brand-deep);font-weight:700' : 'color:var(--ink-3)') + '">1 카카오 로그인</span>' +
    '<span style="' + (n >= 2 ? 'color:var(--brand-deep);font-weight:700' : 'color:var(--ink-3)') + '">2 본인 확인</span></div>';

  UI.initTheme();
  document.addEventListener('DOMContentLoaded', boot);

  async function boot() {
    $('#brandIcon').innerHTML = ic('paw');
    $('[data-theme-btn]').addEventListener('click', UI.toggleTheme);
    UI.paintThemeButtons();
    paint('<div class="card center" style="padding:34px"><div class="mut sm">불러오는 중…</div></div>');
    await draw();
  }

  const paint = html => { $('#view').innerHTML = html; };

  const draw0 = () => draw();

  async function draw() {
    /* 로그인하다 튕긴 경우 — 카카오가 보내준 이유를 그대로 보여준다 */
    const why = DB.authError();
    if (why) return paintLogin(why);

    let me;
    try { me = await DB.me(); }
    catch (e) { return paintLogin('지금은 연결이 잘 안 돼요. 잠시 뒤 다시 해주세요.'); }

    if (!me || !me.login) return paintLogin('');
    /* 운영진이 마지막에 운영진 화면을 보고 있었다면 그쪽으로 보낸다.
       주소는 하나로 기억하고, 돌아오는 길은 상단 전환 스위치에 있다. */
    if (me.linked && me.status !== 'left') {
      let side = '';
      try { side = localStorage.getItem('baljaguk.side') || ''; } catch (e) { }
      if (side === 'admin' && !location.hash && await DB.isAdmin()) {
        location.replace('admin.html');
        return;
      }
    }
    if (!me.linked) return paintClaim();
    if (me.status === 'left') return paintLeft(me);
    return paintHome(me);
  }

  /* ---------- ① 로그인 전 ---------- */
  function paintLogin(err) {
    $('#headLead').textContent = '발자국 구성원만 쓸 수 있는 공간이에요.';
    paint(
      (err ? '<div class="pill-note">' + esc(err) + '</div>' : '') +
      steps(0) +
      '<div class="card mecard">' +
      '<span class="big" style="background:var(--brand-soft);color:var(--brand-deep)">' + ic('paw') + '</span>' +
      '<h3 style="margin-top:14px;font-size:19px">카카오로 시작하기</h3>' +
      '<p class="mut sm" style="margin-top:8px;line-height:1.6">' +
      '내 봉사 기록과 적립 내역을 볼 수 있어요.</p>' +
      '<div class="card flat" style="margin-top:16px;text-align:left;padding:14px 16px">' +
      '<div class="sm" style="font-weight:700;margin-bottom:8px">두 단계면 끝나요</div>' +
      '<div class="sm mut" style="line-height:1.9">' +
      '<b style="color:var(--brand-deep)">1</b> 카카오로 로그인하고<br>' +
      '<b style="color:var(--brand-deep)">2</b> 이름과 휴대폰 뒤 4자리로 본인 확인</div>' +
      '<div class="mut" style="font-size:11.5px;margin-top:10px;line-height:1.6">' +
      '카카오는 닉네임만 알려줘서, 명부의 누구인지 한 번만 확인해요. 다음부터는 카카오 로그인만 하면 바로 들어와요.</div>' +
      '</div>' +
      '<div style="margin-top:16px"><button class="kakao" id="go">' + KAKAO +
      '<span>카카오로 로그인</span></button></div>' +
      '<p class="mut" style="font-size:11.5px;margin-top:12px">닉네임만 받아와요. 카카오톡 친구목록이나 메시지는 보지 않습니다.</p>' +
      '</div>' +
      '<div class="linkline"><a href="guide.html?from=login">처음이신가요? 사용법 보기 →</a></div>');
    $('#go').onclick = () => DB.kakaoLogin(backHere());
  }

  /* ---------- ② 로그인했지만 아직 명부와 안 이어짐 ----------
     묻는 게 둘뿐이어도 한 번에 하나씩 묻는다. 처음 들어오는 사람이라 부담을 줄인다. */
  function paintClaim() {
    $('#headTitle').textContent = '본인 확인';
    $('#headLead').textContent = '거의 다 됐어요. 한 단계만 남았습니다.';
    const nick = DB.authNickname();
    const form = { name: '', last4: '' };
    let at = 0;

    function draw() {
      const q = at === 0
        ? {
          title: '이름을 알려주세요',
          hint: '명부에 적힌 이름 그대로 적어주세요.',
          field: '<input class="input lgin" id="nm" autocomplete="name" ' +
            'placeholder="홍길동" value="' + esc(form.name) + '">'
        }
        : {
          title: '휴대폰 뒤 4자리는요?',
          hint: '동아리에 적어낸 번호의 마지막 네 자리예요.',
          field: '<input class="input lgin" id="p4" inputmode="numeric" maxlength="4" ' +
            'placeholder="3051" value="' + esc(form.last4) + '">'
        };

      paint(
        '<div class="card" style="padding:20px 18px">' +
        '<div class="row" style="gap:7px;color:var(--brand-deep);font-weight:700;font-size:13px">' +
        ic('check') + '<span>카카오 로그인 완료' + (nick ? ' — ' + esc(nick) + '님' : '') + '</span></div>' +

        '<div class="wiz-prog" style="margin:16px 0 14px">' +
        '<div class="wiz-dots">' +
        '<i class="' + (at === 0 ? 'on' : 'done') + '"></i>' +
        '<i class="' + (at === 1 ? 'on' : '') + '"></i></div>' +
        '<span class="wiz-step">' + (at + 1) + '/2</span></div>' +

        (at === 1 && form.name
          ? '<div class="wiz-sum"><button class="it" type="button" id="goName">' +
            '<span class="k">이름</span><span class="v">' + esc(form.name) + '</span></button></div>'
          : '') +

        '<h3 class="wiz-q">' + q.title + '</h3>' +
        '<p class="wiz-hint">' + q.hint + '</p>' +
        '<label class="field">' + q.field + '</label>' +

        '<div class="sm mut" style="margin-top:4px;line-height:1.6">' +
        (at === 1
          ? '다섯 번 틀리면 한 시간 동안 쉬어야 해요.'
          : '카카오는 닉네임만 알려줘서, 명부의 누구인지 한 번만 확인해요.') +
        '</div>' +
        '<div class="sp"></div>' +
        '<div class="row" style="gap:8px">' +
        (at === 1 ? '<button class="btn ghost" type="button" id="back">이전</button>' : '') +
        '<button class="btn primary lg grow" type="button" id="go">' +
        (at === 0 ? '다음' : '확인하고 시작하기') + '</button></div>' +
        '</div>' +
        '<button class="btn ghost block sm" id="out">다른 카카오 계정으로 로그인</button>');

      const input = $(at === 0 ? '#nm' : '#p4');
      setTimeout(() => input && input.focus(), 60);
      if (at === 1) input.addEventListener('input', () => {
        input.value = input.value.replace(/[^0-9]/g, '').slice(0, 4);
      });
      /* 한글 조합 중 엔터로 「선고으」가 넘어가 잠기던 것 */
      UI.onEnter(input, () => $('#go').click());

      const bk = $('#back'); if (bk) bk.onclick = () => { at = 0; draw(); };
      const gn = $('#goName'); if (gn) gn.onclick = () => { at = 0; draw(); };
      $('#out').onclick = () => { DB.memberLogout(); draw0(); };
      $('#go').onclick = submit;
    }

    async function submit() {
      const input = $(at === 0 ? '#nm' : '#p4');
      const v = input.value.trim();
      if (at === 0) {
        if (!v) return toast('이름을 적어주세요', 'err');
        form.name = v; at = 1; return draw();
      }
      if (v.length !== 4) return toast('뒤 4자리를 적어주세요', 'err');
      form.last4 = v;

      const btn = $('#go');
      btn.disabled = true; btn.textContent = '확인 중…';
      try {
        const r = await DB.claimMember(form.name, form.last4);
        if (r && r.ok) {
          UI.cheer && UI.cheer();
          toast('반가워요, ' + r.name + '님!', 'ok');
          return draw0();
        }
        /* 「다른 카카오 계정」은 토스트 한 줄로는 뭘 해야 할지 모른다.
           갤럭시에서 많이 걸린다 — 크롬에 예전 카카오계정이 남아 있어서다. */
        if (r && r.why === 'taken') return takenSheet();
        toast(({
          nomatch: '명부에서 못 찾았어요. 이름과 뒤 4자리를 다시 봐주세요',
          many: '같은 이름이 둘 이상이에요. 운영진에게 말씀해주세요',
          locked: '여러 번 틀렸어요. 한 시간 뒤에 다시 해주세요',
          nologin: '로그인이 풀렸어요. 다시 로그인해주세요'
        }[(r && r.why) || ''] || '확인하지 못했어요'), 'err');
      } catch (e) {
        toast(e.message || '확인하지 못했어요', 'err');
      } finally {
        btn.disabled = false;
        btn.textContent = '확인하고 시작하기';
      }
    }

    /* ── 「이미 다른 카카오 계정과 이어져 있어요」
       거의 다 **카톡에서 한 번 하고, 크롬에서 다시 하는 경우**다.
       크롬에는 예전 카카오계정이 로그인돼 있어서 그쪽으로 들어간다.
       그래서 「카카오 계정 다시 고르기」를 맨 위에 둔다. */
    function takenSheet() {
      const ov = UI.sheet({
        title: '다른 카카오 계정으로 이어져 있어요',
        body:
          '<p style="margin:0 0 14px;line-height:1.7">' +
          '이 이름은 <b>다른 카카오 계정</b>으로 이미 이어져 있어요.<br>' +
          '카카오톡 안에서 먼저 하셨다면, 지금 브라우저는 <b>예전 카카오계정</b>으로 ' +
          '들어가 있을 수 있어요.</p>' +
          '<p class="mut xs" style="margin:0 0 16px;line-height:1.7">' +
          '아래 버튼을 누르면 카카오가 <b>어느 계정으로 들어갈지 다시 물어봐요.</b><br>' +
          '카카오톡에서 쓰는 계정을 고르면 바로 들어와요.</p>' +
          '<div style="display:grid;gap:8px">' +
          '<button class="btn primary lg block" type="button" id="tkRe">' +
          '카카오 계정 다시 고르기</button>' +
          '<button class="btn ghost block" type="button" id="tkAsk">' +
          '운영진에게 「연결 다시 하기」 요청</button></div>',
        noFocus: true
      });
      ov.querySelector('#tkRe').onclick = () => {
        /* 묻고 들어가게 — 브라우저에 남은 계정으로 그냥 들어가지 않게 */
        DB.kakaoLogin(location.origin + location.pathname, { pick: true });
      };
      ov.querySelector('#tkAsk').onclick = () => {
        UI.closeSheet();
        toast('운영진에게 이름을 알려주시면 연결을 풀어드려요', 'ok');
      };
    }

    draw();
  }
  function paintLeft(me) {
    $('#headLead').textContent = '';
    paint('<div class="card mecard">' +
      '<span class="big" style="background:var(--surface-2);color:var(--ink-3)">' + ic('paw') + '</span>' +
      '<h3 style="margin-top:14px;font-size:19px">' + esc(me.name) + '님</h3>' +
      '<p class="mut sm" style="margin-top:8px;line-height:1.6">' +
      '지금은 활동 중인 구성원이 아니라서 들어올 수 없어요.<br>' +
      '다시 함께하시려면 운영진에게 말씀해주세요.</p></div>' +
      '<button class="btn ghost block sm" id="out">로그아웃</button>');
    $('#out').onclick = () => { DB.memberLogout(); draw(); };
  }

  /* ---------- 4 이어진 구성원 → 커뮤니티로 넘긴다 ---------- */
  function paintHome(me) {
    if (window.Community && Community.start) return Community.start(me);
    /* community.js 를 못 읽은 경우에도 화면이 비지 않게 */
    paint('<div class="card center" style="padding:28px">' +
      '<div class="mut sm">커뮤니티를 불러오지 못했어요. 새로고침해주세요.</div></div>');
  }
})();