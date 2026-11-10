#!/usr/bin/env node
/* ============================================================
   한 번에 여러 줄을 넣을 때 **칸 이름이 줄마다 같은가**
   ------------------------------------------------------------
   2026-11-09. 사진 3장 + 영상 1개를 같이 올린 후기가 열두 번 겹쳤다.
   까닭: post_photos 에 넣는 줄 중 사진 줄에는 poster 가 없고
         영상 줄에만 있었다. PostgREST 는 한 번에 넣는 줄들의 칸 이름이
         다르면 통째로 물리친다 — PGRST102 「All object keys must match」.
         글은 이미 생긴 뒤라 **사진 없는 글만 남고**, 화면은
         「잠시 뒤 다시 해 주세요」 라고 해서 다시 누르게 했다.

   이 검사는 db.js 를 진짜로 불러 글을 올려 보고,
   서버로 나가는 몸통을 들여다본다.
     ① post_photos 에 넣는 줄들의 칸 이름이 모두 같은가
     ② 뒤에서 터지면 글을 도로 지우는가 (겹치지 않게)

   쓰는 법:  node supabase/check-postbody.js
   ============================================================ */
const path = require('path');
const ROOT = path.join(__dirname, '..');

/* ---------- 브라우저 흉내 ---------- */
const noop = () => { };
const el = () => ({
  addEventListener: noop, removeEventListener: noop, appendChild: noop,
  setAttribute: noop, style: {}, dataset: {}, children: [], remove: noop,
  classList: { add: noop, remove: noop, toggle: noop, contains: () => false },
  querySelector: () => null, querySelectorAll: () => []
});
const doc = {
  addEventListener: noop, removeEventListener: noop,
  createElement: el, head: el(), body: el(), documentElement: el(),
  querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
  visibilityState: 'visible', cookie: ''
};
const store = {};
global.localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }, key: () => null, length: 0
};
global.sessionStorage = global.localStorage;
global.navigator = { userAgent: '', onLine: true, serviceWorker: { addEventListener: noop, ready: Promise.resolve({}) } };
global.document = doc;
global.location = { href: '', search: '', hash: '', origin: '' };
global.crypto = { randomUUID: () => '11111111-2222-3333-4444-555555555555', getRandomValues: a => a };
global.window = {
  addEventListener: noop, removeEventListener: noop, document: doc,
  location: global.location, setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval: noop,
  matchMedia: () => ({ matches: false, addEventListener: noop, addListener: noop }),
  crypto: global.crypto, Image: function () { return el(); },
  visualViewport: { addEventListener: noop, removeEventListener: noop, height: 800, offsetTop: 0 },
  innerHeight: 800, innerWidth: 400,
  /* ★ 이 두 줄이 있어야 db.js 가 「실서버」 로 돈다 */
  CONFIG: { SUPABASE_URL: 'https://시험.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_시험' }
};
global.CONFIG = global.window.CONFIG;

/* ---------- 오간 것을 적어 둔다 ---------- */
const 보낸것 = [];
let 터뜨릴곳 = null;          /* 이 주소가 나오면 400 으로 물리친다 */

function 답(status, body) {
  const txt = typeof body === 'string' ? body : JSON.stringify(body);
  return Promise.resolve({
    ok: status >= 200 && status < 300, status,
    text: () => Promise.resolve(txt),
    json: () => Promise.resolve(JSON.parse(txt || 'null')),
    blob: () => Promise.resolve({ type: 'image/jpeg', size: 1234 })
  });
}

global.fetch = (url, opts) => {
  const u = String(url);
  opts = opts || {};
  /* 사진 글자(data:) 를 파일로 바꾸는 자리 */
  if (/^data:/.test(u)) return 답(200, '');
  let body = null;
  try { body = opts.body ? JSON.parse(opts.body) : null; } catch (e) { body = '(글자 아님)'; }
  보낸것.push({ 주소: u, 방법: opts.method || 'GET', 몸통: body });

  if (터뜨릴곳 && u.indexOf(터뜨릴곳) >= 0 && (opts.method || 'GET') === 'POST') {
    return 답(400, { code: 'PGRST102', message: 'All object keys must match' });
  }
  /* 올리기 */
  if (/\/storage\/v1\/object\//.test(u)) return 답(200, { Key: 'ok' });
  if (/\/rest\/v1\/rpc\/my_member_id/.test(u)) return 답(200, '"me-1111"');
  if (/\/rest\/v1\/posts\b/.test(u) && (opts.method === 'POST'))
    return 답(201, [{ id: '11111111-2222-3333-4444-555555555555' }]);
  return 답(200, []);
};
global.window.fetch = global.fetch;

/* ---------- db.js 를 읽는다 ---------- */
require(path.join(ROOT, 'assets/db.js'));
const DB = global.window.DB;
if (!DB) { console.log('  ✗ db.js 를 읽지 못했어요'); process.exit(1); }

const 사진 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
let 틀림 = 0;

(async () => {
  console.log('── 한 번에 넣는 줄들의 칸 이름이 같은가\n');

  /* ① 사진 3장 + 영상 1개 — 예전에는 여기서 통째로 물리쳐졌다 */
  보낸것.length = 0; 터뜨릴곳 = null;
  try {
    await DB.community.createPost({
      type: 'review', place: '천보금 보호소', date: '2026-11-08',
      body: '사진이랑 영상 같이 올려요',
      photos: [사진, 사진, 사진],
      video: { file: { type: 'video/quicktime', size: 100 }, poster: 사진 }
    });
  } catch (e) {
    틀림++; console.log('  ✗ 사진+영상을 올리다 터졌어요: ' + e.message);
  }

  const 사진줄 = 보낸것.filter(x => /\/rest\/v1\/post_photos$/.test(x.주소) && x.방법 === 'POST');
  if (!사진줄.length) {
    틀림++; console.log('  ✗ post_photos 에 아무것도 안 넣었어요');
  } else {
    const rows = 사진줄[0].몸통;
    const keys = rows.map(r => Object.keys(r).sort().join(','));
    const 같나 = keys.every(k => k === keys[0]);
    const 영상줄 = rows.filter(r => r.kind === 'video').length;
    const 그림줄 = rows.filter(r => r.kind === 'photo').length;
    console.log('  줄 ' + rows.length + '개 (사진 ' + 그림줄 + ' · 영상 ' + 영상줄 + ')');
    console.log('  칸 이름: ' + keys[0]);
    if (!같나) {
      틀림++;
      console.log('  ✗ 줄마다 칸 이름이 달라요 — 서버가 통째로 물리칩니다 (PGRST102)');
      keys.forEach((k, i) => console.log('      ' + i + ': ' + k));
    } else if (영상줄 !== 1 || 그림줄 !== 3) {
      틀림++; console.log('  ✗ 사진 3 · 영상 1 이 아니에요');
    } else {
      console.log('  ✓ 모두 같아요');
    }
  }

  /* ② 뒤에서 터지면 글을 도로 지우는가 */
  보낸것.length = 0; 터뜨릴곳 = '/rest/v1/post_photos';
  let 터졌나 = false;
  try {
    await DB.community.createPost({
      type: 'review', place: '천보금 보호소', date: '2026-11-08',
      body: '일부러 터뜨리기', photos: [사진]
    });
  } catch (e) { 터졌나 = true; }
  터뜨릴곳 = null;

  const 글지움 = 보낸것.some(x => x.방법 === 'DELETE' && /\/rest\/v1\/posts\?id=eq\./.test(x.주소));
  const 파일지움 = 보낸것.some(x => x.방법 === 'DELETE' && /\/storage\/v1\/object\/community$/.test(x.주소));
  console.log('');
  if (!터졌나) { 틀림++; console.log('  ✗ 터졌는데 조용히 넘어갔어요'); }
  if (!글지움) { 틀림++; console.log('  ✗ 반쯤 생긴 글을 안 지웠어요 — 다시 누르면 겹칩니다'); }
  if (!파일지움) { 틀림++; console.log('  ✗ 올려 둔 파일을 안 치웠어요'); }
  if (터졌나 && 글지움 && 파일지움) console.log('  ✓ 터지면 글과 파일을 도로 치워요');

  /* ③ 사진만 있는 글도 그대로 올라가는가 */
  보낸것.length = 0;
  let 괜찮나 = true;
  try {
    await DB.community.createPost({
      type: 'review', place: '금파하우스', date: '2026-11-08',
      body: '사진만', photos: [사진, 사진]
    });
  } catch (e) { 괜찮나 = false; console.log('  ✗ 사진만 있는 글이 터졌어요: ' + e.message); }
  const 줄2 = 보낸것.filter(x => /\/rest\/v1\/post_photos$/.test(x.주소) && x.방법 === 'POST');
  if (!괜찮나 || !줄2.length || 줄2[0].몸통.length !== 2) {
    틀림++; console.log('  ✗ 사진만 있는 글이 이상해요');
  } else {
    console.log('  ✓ 사진만 있는 글도 그대로예요');
  }

  console.log('');
  if (틀림) { console.log('── ' + 틀림 + '곳이 틀렸어요'); process.exit(1); }
  console.log('── 모두 통과');
  process.exit(0);
})().catch(e => { console.error('오류:', e && e.stack || e); process.exit(1); });
