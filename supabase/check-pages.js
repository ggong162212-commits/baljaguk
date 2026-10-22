#!/usr/bin/env node
/* 화면 안에 직접 쓴 <script> 가 **아직 안 읽힌 것**을 쓰는지 본다
   ------------------------------------------------------------
   바깥 script 를 전부 defer 로 바꾸면서(1e9159d) 사고가 났다.
   defer 는 HTML 을 다 읽은 뒤에 돈다. 그런데 화면 안에 직접 쓴
   <script> 는 **그 자리에서 바로** 돈다. 그래서

       <script> UI.initTheme(); … </script>

   이 한 줄이 「UI is not defined」 로 터지고, 그 블록 전체가 멈춰
   사용법 화면의 달 단추와 돌아가기 단추가 안 됐다.
   (선고은님이 아니라 점검 담당이 먼저 찾았다)

   규칙: 화면 안 <script> 에서는, DOMContentLoaded 를 기다리기 **전에**
         바깥 파일이 만드는 것(UI·DB·ic…)을 쓰면 안 된다.
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 바깥 파일이 만드는 것들 — 이 이름을 바로 쓰면 안 된다 */
const 바깥것 = [
  'UI', 'DB', 'Push', 'Community', 'Admin', 'CONFIG',
  'PastVol', 'VolWho', 'AvatarView', 'Praise', 'Fame',
  'ic', 'illus', 'movedNotice', 'Survey', 'Volunteer', 'Fund', 'Id1365'
];

const 나쁨 = [];
let 본화면 = 0, 본블록 = 0;

for (const f of fs.readdirSync(ROOT)) {
  if (!f.endsWith('.html')) continue;
  본화면++;
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');

  /* src 없는 <script> 만 — 화면 안에 직접 쓴 것 */
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(src))) {
    본블록++;
    const code = m[1];
    const 줄 = src.slice(0, m.index).split('\n').length;

    /* DOMContentLoaded 를 기다리기 시작하는 자리 —
       그 앞에 있는 것만 「바로 도는 것」이다 */
    const i = code.search(/addEventListener\s*\(\s*['"](DOMContentLoaded|load)['"]/);
    const 바로도는것 = i < 0 ? code : code.slice(0, i);

    for (const 이름 of 바깥것) {
      /* window.UI 처럼 앞에 window. 가 붙었으면 괜찮다 (없으면 undefined) */
      const r = new RegExp('(^|[^.\\w$])' + 이름 + '\\s*[.(\\[]');
      if (!r.test(바로도는것)) continue;
      if (new RegExp('window\\s*\\.\\s*' + 이름).test(바로도는것)) continue;
      나쁨.push(f + ' 줄 ' + 줄 + ' — 화면 안 <script> 가 「' + 이름 +
        '」 을 기다리지 않고 바로 써요.\n        ' +
        'DOMContentLoaded 안으로 옮기세요 (바깥 script 는 defer 라 아직 안 읽혔어요).');
      break;
    }
  }
}

if (나쁨.length) {
  console.log('\n  ✗ 화면 안 <script> 가 아직 안 읽힌 것을 써요');
  나쁨.forEach(b => console.log('     ' + b));
  process.exit(1);
}
console.log('  화면 안 <script> ' + 본블록 + '개 (' + 본화면 +
  '개 화면) — 아직 안 읽힌 것을 쓰는 곳 없음');
