/* ============================================================
   발자국 이야기 — 보호소 아이의 이야기 글
   · 글쓰기 「어떤 글인가요?」 → 발자국 이야기 (구성원 누구나)
     ① 어떤 아이인가요? — 보호소(설정의 봉사지 목록) · 이름 · 성별 · 나이(또는 모름)
     ② 어떤 이야기인가요? — 1000자까지
     ③ 사진 — 1~5장 (다른 글과 같은 사진 단계, 영상은 안 받는다)
   · 피드 카드: 사진 → 하트 줄 → 「🐾 이름 · 남아 · 2살」 「📍보호소」 → 본문(더 보기 규칙 그대로)
   · 고치기: 쓴 사람만 (운영진은 지우기만) — 아이 정보·이야기·사진을 한 시트에서
   · 서버: posts.type='story' + story(jsonb) (fix-21) — 칸 모양이 바뀌면 아래 FIELD·toRow·fromRow 만 바꾼다
     체험 모드도 db.js 가 story 칸을 저장하고 피드 줄에 넣어 준다
   쓰는 법:
     Story.write({ photoStep, done })   — community.js 글쓰기에서
     Story.line(p)                      — postCard·글 시트에서 (이야기 글일 때만, 하트 줄 다음 · 본문 앞)
     Story.edit(p, { done })            — 「…」 메뉴 고치기에서 (이야기 글일 때만)
     Story.cls                          — 카드에 붙일 class ('story')
   ============================================================ */
(function () {
  const { esc } = UI;
  const ic = n => window.ic(n);

  /* ---------- 바꾸기 쉬운 값 ---------- */
  const FIELD = 'story';                 /* posts 의 칸 이름 (jsonb) */
  const NAME_MAX = 20, AGE_MAX = 10, BODY_MAX = 1000, PH_MIN = 1, PH_MAX = 5;
  const SEX = { m: '남아', f: '여아', u: '성별 모름' };
  const SEX_PICK = [['m', '남아'], ['f', '여아'], ['u', '모름']];
  const chars = s => Array.from(String(s || '')).length;

  /* 서버 칸 ↔ 화면 모양. 칸이 따로 생기면 여기만 고친다 */
  const toRow = m => ({ [FIELD]: { shelter: m.shelter, name: m.name, sex: m.sex, age: m.age || null } });
  const fromRow = p => (p && p[FIELD]) || {};

  /* ---------- 모양 ---------- */
  const CSS =
    /* 따뜻하게 — 노란 기운을 아주 살짝 */
    '.card.post.story{background:var(--surface);background:color-mix(in srgb,var(--gold-soft) 38%,var(--surface))}' +
    '.st-line{display:flex;flex-wrap:wrap;align-items:baseline;column-gap:10px;row-gap:2px;margin:10px 0 2px}' +
    '.st-who{font-weight:800;font-size:15.5px;color:var(--ink);word-break:keep-all;min-width:0;max-width:100%}' +
    '.st-who .nm{font-family:var(--font-title);font-size:18px;font-weight:400;margin-right:2px;overflow-wrap:anywhere}' +
    '.st-who .sx{font-weight:600;color:var(--ink-2);font-size:14px}' +
    '.st-at{font-size:13px;font-weight:700;color:var(--ink-2);white-space:nowrap}' +
    '.st-tag{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:800;color:#8a6414;' +
    'background:var(--gold-soft);border-radius:999px;padding:3px 9px;margin-bottom:8px}' +
    'html[data-theme="dark"] .st-tag{color:var(--gold)}' +
    '.st-f .seg{margin-top:0}' +
    '.st-age{display:flex;gap:6px;align-items:stretch}' +
    '.st-age .input{flex:1;min-width:0}' +
    '.st-age .chip{flex:none;min-height:44px;padding:0 16px}' +
    '.st-cnt{float:right;font-weight:600;font-size:12px;color:var(--ink-3)}' +
    '.st-cnt.over{color:var(--danger)}' +
    '.st-shots{display:flex;gap:8px;flex-wrap:wrap}' +
    '.st-shot{position:relative;width:76px;height:76px;border-radius:14px;overflow:hidden;background:var(--surface-2)}' +
    '.st-shot img{width:100%;height:100%;object-fit:cover;display:block}' +
    '.st-shot .x{position:absolute;right:3px;top:3px;width:28px;height:28px;border-radius:50%;border:none;background:rgba(0,0,0,.55);' +
    'color:#fff;display:grid;place-items:center;cursor:pointer;padding:0}' +
    '.st-shot .x::after{content:"";position:absolute;inset:-8px}' +
    '.st-shot .x svg,.st-shot .x .svg{width:14px;height:14px}' +
    '.st-add{width:76px;height:76px;border-radius:14px;border:2px dashed var(--line);background:none;color:var(--ink-2);' +
    'display:grid;place-items:center;cursor:pointer;font-size:12px;font-weight:700;font-family:inherit}';
  function css() {
    if (document.getElementById('stCss')) return;
    const st = document.createElement('style'); st.id = 'stCss'; st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* 보호소 목록 — 운영진 설정의 봉사지 */
  async function places() {
    let s = window.__settings;
    if (!s || !s.places) { try { s = await DB.settings.get(); } catch (e) { s = {}; } }
    return ((s && s.places) || []).map(p => typeof p === 'string' ? p : p.name).filter(Boolean);
  }

  /* ---------- 아이 정보 칸 (쓰기 · 고치기 같이) ---------- */
  function metaHtml() {
    return '<div class="st-f">' +
      '<label class="field"><span class="lb">보호소 <span class="req">*</span></span>' +
      '<select class="input" data-stp aria-label="보호소"><option value="">보호소 고르기</option></select></label>' +
      '<label class="field"><span class="lb">이름 <span class="req">*</span><span class="st-cnt" data-stc="n"></span></span>' +
      '<input class="input" data-stn maxlength="' + (NAME_MAX * 2) + '" placeholder="예) 단비" autocomplete="off"></label>' +
      '<div class="field"><span class="lb">성별 <span class="req">*</span></span>' +
      '<div class="seg" role="group" aria-label="성별">' + SEX_PICK.map(([k, t]) =>
        '<button type="button" data-sts="' + k + '" aria-pressed="false">' + t + '</button>').join('') + '</div></div>' +
      '<div class="field"><span class="lb">나이 <span class="req">*</span></span>' +
      '<div class="st-age"><input class="input" data-sta maxlength="' + AGE_MAX + '" placeholder="2살 · 추정 3살" autocomplete="off" aria-label="나이">' +
      '<button type="button" class="chip" data-stu aria-pressed="false">모름</button></div>' +
      '<span class="hint">짧게 적거나, 모르면 「모름」을 눌러 주세요</span></div>' +
      '</div>';
  }
  function bindMeta(r, init) {
    css();
    const q = s => r.querySelector(s);
    const P = q('[data-stp]'), N = q('[data-stn]'), A = q('[data-sta]'), U = q('[data-stu]');
    let sex = '', unknown = false;
    const setSex = k => {
      sex = k;
      r.querySelectorAll('[data-sts]').forEach(b => { const on = b.dataset.sts === k; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    };
    const setUnk = on => {
      unknown = on; U.classList.toggle('on', on); U.setAttribute('aria-pressed', String(on));
      A.disabled = on; if (on) A.value = '';
      A.placeholder = on ? '나이 모름' : '2살 · 추정 3살';
    };
    const cnt = () => { const n = chars(N.value), c = q('[data-stc="n"]'); c.textContent = n + ' / ' + NAME_MAX; c.classList.toggle('over', n > NAME_MAX); };
    r.querySelectorAll('[data-sts]').forEach(b => b.onclick = () => setSex(b.dataset.sts));
    U.onclick = () => setUnk(!unknown);
    N.addEventListener('input', cnt);
    const m = init || {};
    N.value = m.name || ''; A.value = m.age || '';
    if (m.sex) setSex(m.sex);
    if (init && init.name && !m.age) setUnk(true);
    cnt();
    places().then(list => {
      if (m.shelter && list.indexOf(m.shelter) < 0) list.unshift(m.shelter);   /* 목록에서 빠진 옛 보호소도 고칠 때 보이게 */
      P.innerHTML = '<option value="">보호소 고르기</option>' + list.map(n => '<option>' + esc(n) + '</option>').join('');
      if (m.shelter) P.value = m.shelter;
      else if (list.length === 1) P.value = list[0];
    });
    return {
      read: () => ({ shelter: P.value.trim(), name: N.value.trim(), sex, age: unknown ? null : A.value.trim(), unknown }),
      fill: v => { if (!v) return; N.value = v.name || ''; A.value = v.age || ''; if (v.sex) setSex(v.sex); setUnk(!!v.unknown); cnt();
        const t = setInterval(() => { if (P.options.length > 1 || !v.shelter) { P.value = v.shelter || ''; clearInterval(t); } }, 80); setTimeout(() => clearInterval(t), 3000); }
    };
  }
  function checkMeta(v) {
    if (!v.shelter) return '어느 보호소 아이인지 골라 주세요';
    if (!v.name) return '아이 이름을 적어 주세요';
    if (chars(v.name) > NAME_MAX) return '이름은 ' + NAME_MAX + '자까지예요';
    if (!v.sex) return '성별을 골라 주세요 (모르면 「모름」)';
    if (!v.unknown && !v.age) return '나이를 적거나 「모름」을 눌러 주세요';
    if (v.age && chars(v.age) > AGE_MAX) return '나이는 ' + AGE_MAX + '자까지 짧게 적어 주세요';
    return '';
  }
  function checkBody(b) {
    if (!b) return '아이 이야기를 적어 주세요';
    if (chars(b) > BODY_MAX) return '이야기는 ' + BODY_MAX + '자까지예요';
    return '';
  }
  const photoCount = list => (list || []).filter(x => !/^video:/.test(String(x))).length;

  /* ---------- 글쓰기 ---------- */
  function write(o) {
    css();
    let M = null;
    const whoStep = {
      key: 'who', short: '아이',
      q: '어떤 아이인가요?',
      hint: '보호소에서 만난 아이를 소개해 주세요.',
      body: metaHtml(),
      after: r => { M = bindMeta(r); },
      read: () => M.read(),
      fill: (r, v) => M.fill(v),
      valid: checkMeta,
      sum: v => v ? v.name + ' · ' + v.shelter : ''
    };
    const bodyStep = {
      key: 'body', short: '이야기',
      q: '어떤 이야기를 들려줄까요?',
      hint: '성격, 좋아하는 것, 함께한 순간… 모두에게 보여요.',
      body: '<label class="field"><span class="lb">이야기<span class="st-cnt" data-stc="b"></span></span>' +
        '<textarea class="input" data-stb rows="7" maxlength="' + (BODY_MAX * 2) + '" ' +
        'placeholder="처음엔 구석에 숨어 있던 단비가 이제는 이름을 부르면 달려와요…" aria-label="아이 이야기"></textarea></label>',
      after: r => {
        const b = r.querySelector('[data-stb]'), c = r.querySelector('[data-stc="b"]');
        const cnt = () => { const n = chars(b.value); c.textContent = n + ' / ' + BODY_MAX; c.classList.toggle('over', n > BODY_MAX); };
        b.addEventListener('input', cnt); cnt();
        r.__cnt = cnt;
      },
      read: r => r.querySelector('[data-stb]').value.trim(),
      fill: (r, v) => { r.querySelector('[data-stb]').value = v; if (r.__cnt) r.__cnt(); },
      valid: checkBody,
      sum: v => String(v || '').slice(0, 16)
    };
    const steps = [whoStep, bodyStep];
    if (o && o.photoStep) {
      const ph = o.photoStep(false, '아이 얼굴이 잘 보이는 사진으로 ' + PH_MIN + '~' + PH_MAX + '장 넣어 주세요.');
      ph.q = '아이 사진을 넣어 주세요';
      ph.valid = v => {
        if (v && v.video) return '이야기에는 사진만 넣을 수 있어요 — 영상은 빼 주세요';
        const n = photoCount(v && v.list);
        if (n < PH_MIN) return '사진을 한 장 넣어 주세요';
        if (n > PH_MAX) return '사진은 ' + PH_MAX + '장까지예요 (지금 ' + n + '장)';
        return '';
      };
      steps.push(ph);
    }
    UI.wizard({
      title: '발자국 이야기',
      doneLabel: '올리기',
      steps,
      done: async v => {
        const m = v.who, ph = v.photos || { list: [] };
        const bad = checkMeta(m) || checkBody(v.body) || (photoCount(ph.list) < PH_MIN ? '사진을 한 장 넣어 주세요' : '');
        if (bad) throw new Error(bad);
        const made = await DB.community.createPost(Object.assign({
          type: 'story', body: v.body, photos: (ph.list || []).filter(x => !/^video:/.test(String(x))).slice(0, PH_MAX)
        }, toRow(m)));
        if (o && o.done) await o.done(made, v);
      }
    });
  }

  /* ---------- 카드 한 줄 ---------- */
  function line(p) {
    css();
    const m = fromRow(p);
    if (!m.name && !m.shelter) return '';
    const bits = [SEX[m.sex] || '', m.age ? m.age : '나이 모름'].filter(Boolean);
    return '<div class="st-line">' +
      '<span class="st-who"><span class="nm">🐾 ' + esc(m.name || '') + '</span>' +
      (bits.length ? '<span class="sx"> · ' + bits.map(esc).join(' · ') + '</span>' : '') + '</span>' +
      (m.shelter ? '<span class="st-at">📍' + esc(m.shelter) + '</span>' : '') +
      '</div>';
  }

  /* ---------- 고치기 ---------- */
  async function edit(p, o) {
    css();
    const m0 = fromRow(p);
    let shots = (p.photos || []).slice(0, 10);
    const ov = UI.sheet({
      title: '이야기 고치기',
      noFocus: true,
      body: metaHtml() +
        '<label class="field"><span class="lb">이야기 <span class="req">*</span><span class="st-cnt" data-stc="b"></span></span>' +
        '<textarea class="input" data-stb rows="6" maxlength="' + (BODY_MAX * 2) + '" aria-label="아이 이야기"></textarea></label>' +
        '<div class="field"><span class="lb">사진 <span class="req">*</span> <span class="mut xs" style="font-weight:500">' + PH_MIN + '~' + PH_MAX + '장</span></span>' +
        '<div class="st-shots" data-stsh></div>' +
        '<input type="file" data-stfile accept="image/*" multiple hidden></div>',
      foot: '<button class="btn primary lg block" type="button" data-stsave>저장하기</button>'
    });
    const M = bindMeta(ov, Object.assign({}, m0, { name: m0.name || '' }));
    const B = ov.querySelector('[data-stb]'), C = ov.querySelector('[data-stc="b"]');
    B.value = p.body || '';
    const cnt = () => { const n = chars(B.value); C.textContent = n + ' / ' + BODY_MAX; C.classList.toggle('over', n > BODY_MAX); };
    B.addEventListener('input', cnt); cnt();
    if (UI.initGrow) { try { UI.initGrow(ov); } catch (e) { } }

    const box = ov.querySelector('[data-stsh]'), file = ov.querySelector('[data-stfile]');
    const draw = async () => {
      box.innerHTML = shots.map((s, i) => '<div class="st-shot"><img alt="사진 ' + (i + 1) + '" data-sti="' + i + '">' +
        '<button class="x" type="button" data-strm="' + i + '" aria-label="사진 ' + (i + 1) + ' 빼기">' + ic('x') + '</button></div>').join('') +
        (shots.length < PH_MAX ? '<button class="st-add" type="button" data-stadd aria-label="사진 더하기">' + ic('plus') + '</button>' : '');
      box.querySelectorAll('[data-strm]').forEach(b => b.onclick = () => { shots.splice(Number(b.dataset.strm), 1); draw(); });
      const add = box.querySelector('[data-stadd]'); if (add) add.onclick = () => file.click();
      for (const im of [...box.querySelectorAll('img[data-sti]')]) {
        const s = shots[Number(im.dataset.sti)];
        im.src = /^data:/.test(s) ? s : (await DB.community.photoUrl(s)) || '';
      }
    };
    draw();
    file.onchange = async () => {
      const fs = [...(file.files || [])]; file.value = '';
      const room = PH_MAX - shots.length;
      if (fs.length > room) UI.toast('사진은 ' + PH_MAX + '장까지예요', 'err');
      for (const f of fs.slice(0, Math.max(0, room))) {
        try { shots.push(await UI.resizeImage(f, 1280, .8)); } catch (e) { UI.toast(e.message || '사진 하나를 못 읽었어요', 'err'); }
      }
      draw();
    };

    const save = ov.querySelector('[data-stsave]');
    save.onclick = async () => {
      const m = M.read(), body = B.value.trim();
      const bad = checkMeta(m) || checkBody(body) ||
        (shots.length < PH_MIN ? '사진을 한 장 넣어 주세요' : (shots.length > PH_MAX ? '사진은 ' + PH_MAX + '장까지예요' : ''));
      if (bad) return UI.toast(bad, 'err');
      save.disabled = true; save.textContent = '저장하는 중…';
      try {
        await DB.community.updatePost(p.id, Object.assign({ body, photos: shots.slice() }, toRow(m)));
        UI.closeSheet();
        UI.toast('고쳤어요', 'ok');
        if (o && o.done) await o.done();
      } catch (e) {
        save.disabled = false; save.textContent = '저장하기';
        UI.toast(UI.human ? UI.human(e.message || '') : (e.message || '저장하지 못했어요'), 'err');
      }
    };
  }

  /* 알림 문구 — 서버(outbox_on_post)와 같은 말. 체험·미리보기용 */
  const pushText = m => '🐾 ' + (m.shelter || '') + ' ' + (m.name || '') + '의 이야기가 올라왔어요';

  window.Story = { write, line, edit, meta: fromRow, cls: 'story', pushText, LIMITS: { NAME_MAX, AGE_MAX, BODY_MAX, PH_MIN, PH_MAX } };
})();
