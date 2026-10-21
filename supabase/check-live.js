#!/usr/bin/env node
/* ============================================================
   실서버에 빠진 함수가 없는지 본다
   ------------------------------------------------------------
   「내가 보낸 의견」이 안 보이던 까닭은 fix-3.sql 을 조각내서
   올리다가 my_feedback 만 빠뜨렸기 때문이다.
   파일은 통째로 올리고, 올린 뒤에는 이걸로 대조한다.

   쓰는 법:
     node supabase/check-live.js            — 프런트가 부르는 RPC 목록만 뽑는다
     node supabase/check-live.js <조회결과>  — 실서버 목록과 대조한다

   실서버 목록은 SQL 편집기에서 이렇게 얻는다 (읽기 전용):
     select string_agg(proname, ',' order by proname)
       from pg_proc where pronamespace = 'public'::regnamespace;
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 프런트가 부르는 rpc/이름 을 모두 모은다 */
function wanted() {
  const out = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'assets'))) {
    if (!f.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(ROOT, 'assets', f), 'utf8');
    const re = /['"]rpc\/([a-z0-9_]+)['"]/g;
    let m;
    while ((m = re.exec(src))) out.add(m[1]);
  }
  return [...out].sort();
}

const want = wanted();
const arg = process.argv[2];

if (!arg) {
  console.log('프런트가 부르는 RPC ' + want.length + '개:');
  console.log(want.join(','));
  console.log('');
  console.log('실서버에서 아래를 돌려(읽기 전용) 결과를 이 스크립트에 넘겨 주세요:');
  console.log("  select string_agg(proname, ',' order by proname)");
  console.log("    from pg_proc where pronamespace = 'public'::regnamespace;");
  process.exit(0);
}

const have = new Set(
  (fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : arg)
    .split(/[,\s]+/).map(x => x.trim()).filter(Boolean)
);

const missing = want.filter(n => !have.has(n));
if (missing.length) {
  console.log('✗ 실서버에 없는 함수 ' + missing.length + '개:');
  missing.forEach(n => console.log('   ' + n));
  console.log('');
  console.log('  SQL 파일을 조각내 올리다 빠뜨린 것일 수 있어요.');
  console.log('  해당 파일을 통째로 다시 올려 주세요.');
  process.exit(1);
}
console.log('실서버에 빠진 함수: 0개 (' + want.length + '개 모두 있음)');
