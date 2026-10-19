/* ============================================================
   구성원 전용 · 내 활동
   카카오로 로그인 → 명부의 내 이름에 잇기 → 내 기록
   ============================================================ */
(function () {
  const { $, esc, toast } = UI;

  const KAKAO =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
    '<path d="M12 3C6.5 3 2 6.58 2 11c0 2.82 1.87 5.3 4.69 6.72-.21.75-.75 2.7-.86 3.12-.13.52.19.51.4.37.17-.11 2.65-1.8 3.72-2.53.67.1 1.35.15 2.05.15 5.5 0 10-3.58 10-8S17.5 3 12 3Z"/></svg>';

  /* 로그인하고 돌아올 주소 — 주소에 ? 나 # 가 붙어 있어도 깨끗한 쪽으로 */
  const backHere = () => location.origin + location.pathname;

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

  async function draw() {
    /* 로그인하다 튕긴 경우 — 카카오가 보내준 이유를 그대로 보여준다 */
    const why = DB.authError();
    if (why) return paintLogin(why);

    let me;
    try { me = await DB.me(); }
    catch (e) { return paintLogin('지금은 연결이 잘 안 돼요. 잠시 뒤 다시 해주세요.'); }

    if (!me || !me.login) return paintLogin('');
    if (!me.linked) return paintClaim();
    if (me.status === 'left') return paintLeft(me);
    return paintHome(me);
  }

  /* ---------- ① 로그인 전 ---------- */
  function paintLogin(err) {
    $('#headLead').textContent = '발자국 구성원만 쓸 수 있는 공간이에요.';
    paint(
      (err ? '<div class="pill-note">' + esc(err) + '</div>' : '') +
      '<div class="card mecard">' +
      '<span class="big" style="background:var(--brand-soft);color:var(--brand-deep)">' + ic('paw') + '</span>' +
      '<h3 style="margin-top:14px;font-size:19px">카카오로 시작하기</h3>' +
      '<p class="mut sm" style="margin-top:8px;line-height:1.6">' +
      '내 봉사 기록과 적립 내역을 볼 수 있어요.<br>처음 한 번만 본인 확인을 합니다.</p>' +
      '<div style="margin-top:18px"><button class="kakao" id="go">' + KAKAO +
      '<span>카카오로 로그인</span></button></div>' +
      '<p class="mut" style="font-size:11.5px;margin-top:12px">닉네임만 받아와요. 카카오톡 친구목록이나 메시지는 보지 않습니다.</p>' +
      '</div>');
    $('#go').onclick = () => DB.kakaoLogin(backHere());
  }

  /* ---------- ② 로그인했지만 아직 명부와 안 이어짐 ---------- */
  function paintClaim() {
    $('#headLead').textContent = '처음이시네요. 명부에서 본인을 찾아볼게요.';
    paint(
      '<div class="card">' +
      '<h3>본인 확인</h3>' +
      '<div class="sub">명부에 적힌 이름과 휴대폰 번호 뒤 4자리를 넣어주세요.</div>' +
      '<div class="sp"></div>' +
      '<label class="field"><span class="lb">이름</span>' +
      '<input class="input" id="nm" autocomplete="name" placeholder="홍길동"></label>' +
      '<label class="field"><span class="lb">휴대폰 뒤 4자리</span>' +
      '<input class="input" id="p4" inputmode="numeric" maxlength="4" placeholder="3051"></label>' +
      '<button class="btn primary lg block" id="ok">확인하고 시작하기</button>' +
      '<div class="sm mut" style="margin-top:12px;line-height:1.6">' +
      '한 번 이어지면 다른 카카오 계정은 그 이름을 쓸 수 없어요.<br>' +
      '안 되면 운영진에게 명부의 번호가 맞는지 물어봐주세요.</div>' +
      '</div>' +
      '<button class="btn ghost block sm" id="out">다른 카카오 계정으로 로그인</button>');

    const nm = $('#nm'), p4 = $('#p4'), ok = $('#ok');
    p4.addEventListener('input', () => { p4.value = p4.value.replace(/[^0-9]/g, '').slice(0, 4); });
    nm.addEventListener('keydown', e => { if (e.key === 'Enter') p4.focus(); });
    p4.addEventListener('keydown', e => { if (e.key === 'Enter') ok.click(); });
    $('#out').onclick = () => { DB.memberLogout(); draw(); };

    ok.onclick = async () => {
      const name = nm.value.trim(), last4 = p4.value.trim();
      if (!name) return toast('이름을 넣어주세요', 'err');
      if (last4.length !== 4) return toast('휴대폰 뒤 4자리를 넣어주세요', 'err');
      ok.disabled = true; ok.textContent = '확인 중…';
      try {
        const r = await DB.claimMember(name, last4);
        if (r && r.ok) {
          UI.cheer && UI.cheer();
          toast('반가워요, ' + r.name + '님!', 'ok');
          return draw();
        }
        toast(({
          nomatch: '명부에서 못 찾았어요. 이름과 뒤 4자리를 다시 봐주세요',
          many: '같은 이름이 둘 이상이에요. 운영진에게 말씀해주세요',
          taken: '그 이름은 이미 다른 카카오 계정과 이어져 있어요',
          locked: '여러 번 틀렸어요. 1시간 뒤에 다시 해주세요',
          nologin: '로그인이 풀렸어요. 다시 로그인해주세요'
        }[(r && r.why) || ''] || '확인하지 못했어요'), 'err');
      } catch (e) {
        toast(e.message || '확인하지 못했어요', 'err');
      } finally {
        ok.disabled = false; ok.textContent = '확인하고 시작하기';
      }
    };
  }

  /* ---------- ③ 졸업·탈퇴 ---------- */
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

  /* ---------- ④ 이어진 구성원 ---------- */
  function paintHome(me) {
    $('#headTitle').textContent = me.name + '님';
    $('#headLead').textContent = '발자국과 함께하고 있어요.';
    paint(
      '<div class="card mecard">' +
      '<span class="big" style="background:var(--brand-soft);color:var(--brand-deep)">' +
      esc(String(me.name).slice(0, 1)) + '</span>' +
      '<h3 style="margin-top:14px;font-size:19px">' + esc(me.name) +
      (me.role === 'admin' ? ' <span class="badge admin">운영진</span>' : '') + '</h3>' +
      '<p class="mut sm" style="margin-top:8px">카카오 계정과 이어졌어요.</p>' +
      '</div>' +
      '<div class="card"><h3>곧 생겨요</h3>' +
      '<div class="sub">여기에 이어서 붙습니다.</div><div class="sp"></div>' +
      '<div class="kv"><span class="k">내 봉사 횟수</span><span class="v mut">준비 중</span></div>' +
      '<div class="kv"><span class="k">내가 쌓은 적립금</span><span class="v mut">준비 중</span></div>' +
      '<div class="kv"><span class="k">봉사 후기 피드</span><span class="v mut">준비 중</span></div>' +
      '</div>' +
      (me.role === 'admin'
        ? '<a class="btn soft block" href="admin.html">운영진 화면으로</a>' : '') +
      '<button class="btn ghost block sm" id="out">로그아웃</button>');
    $('#out').onclick = () => { DB.memberLogout(); draw(); };
  }
})();
