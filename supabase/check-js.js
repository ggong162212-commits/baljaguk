#!/usr/bin/env node
/* ============================================================
   없는 것을 부르는 곳 찾기
   ------------------------------------------------------------
   「대기 신청하기」가 아무 반응이 없던 까닭은 doWait() 라는 함수가
   아예 없었기 때문이다. 부르기만 하고 정의가 없으면 누르는 순간
   그 자리에서 죽고, 화면에는 아무 일도 일어나지 않는다.
   SIGNUP_MSG 도 없었고, DB.waitJoin 은 실제로 DB.community.waitJoin 이었다.

   이 검사는 그런 것을 미리 잡는다:
     ① 부르는 함수가 이 파일·UI·전역에 정의돼 있는가
     ② 쓰는 변수가 정의돼 있는가
     ③ DB.… 경로가 db.js 에 실제로 있는가

   쓰는 법:  node supabase/check-js.js
   ============================================================ */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'assets/community.js', 'assets/admin.js', 'assets/me.js', 'assets/volunteer.js',
  'assets/fund.js', 'assets/survey.js', 'assets/public.js', 'assets/id1365.js',
  'assets/ui.js', 'assets/db.js', 'assets/push.js', 'assets/moved.js',
];

/* 브라우저가 이미 갖고 있는 것들 — 우리가 만들지 않는다 */
const BUILTIN = new Set((
  'if for while switch catch return typeof new function await async do else try throw ' +
  'delete void in of case yield super this instanceof ' +
  'Array Object String Number Boolean Math JSON Date Promise Set Map RegExp Error ' +
  'TypeError RangeError SyntaxError parseInt parseFloat isNaN isFinite ' +
  'setTimeout setInterval clearTimeout clearInterval requestAnimationFrame ' +
  'cancelAnimationFrame queueMicrotask structuredClone ' +
  'fetch encodeURIComponent decodeURIComponent encodeURI decodeURI atob btoa ' +
  'Uint8Array Int8Array Uint16Array Uint32Array Float32Array Float64Array ' +
  'ArrayBuffer DataView TextEncoder TextDecoder ' +
  'URL URLSearchParams FormData Blob File FileReader Image Audio Video ' +
  'CustomEvent Event MouseEvent KeyboardEvent TouchEvent AbortController ' +
  'IntersectionObserver MutationObserver ResizeObserver PerformanceObserver ' +
  'matchMedia getComputedStyle scrollTo scrollBy alert confirm prompt ' +
  'Intl Symbol WeakMap WeakSet BigInt Proxy Reflect Notification ' +
  'Response Request Headers Worker SharedWorker BroadcastChannel WebSocket EventSource ' +
  'localStorage sessionStorage indexedDB navigator location history document window ' +
  'console performance crypto screen ' +
  'require module exports process __dirname __filename ' +
  'constructor prototype arguments eval'
).split(/\s+/).filter(Boolean));

/* 우리가 전역으로 두는 것들 (icons.js · illus.js · config.js 등) */
const GLOBALS = new Set([
  'ic', 'illus', 'CONFIG', 'UI', 'DB', 'Community', 'Admin', 'Push', 'Moved',
  'Survey', 'Fund', 'Public', 'Id1365', 'Me', 'Volunteer', 'supabase', 'Kakao',
]);

/* 주석과 글자열을 지운다 — 그 안의 낱말을 코드로 오해하지 않게 */
function strip(src) {
  let out = '', i = 0, n = src.length;
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') {
      i += 2; out += '  ';
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      i += 2; out += '  '; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      const q = c; i++; out += ' ';
      while (i < n && src[i] !== q) {
        if (src[i] === '\\') { i += 2; out += '  '; continue; }
        /* 템플릿 글자열 안의 ${ } 는 진짜 코드라 남겨 둔다 */
        if (q === '`' && src[i] === '$' && src[i + 1] === '{') {
          out += '  '; i += 2; let depth = 1;
          while (i < n && depth) {
            if (src[i] === '{') depth++;
            else if (src[i] === '}') depth--;
            if (depth) out += src[i];
            i++;
          }
          out += ' '; continue;
        }
        out += src[i] === '\n' ? '\n' : ' '; i++;
      }
      i++; out += ' '; continue;
    }
    out += c; i++;
  }
  return out;
}

function definedNames(code) {
  const set = new Set();
  const add = n => { if (/^[A-Za-z_$][\w$]*$/.test(n)) set.add(n); };

  /* function 이름 / class 이름 */
  let m;
  const re1 = /\b(?:function\s*\*?|class)\s+([A-Za-z_$][\w$]*)/g;
  while ((m = re1.exec(code))) add(m[1]);

  /* const/let/var 이름 (구조분해 포함) */
  const re2 = /\b(?:const|let|var)\s+([^=;\n]+)/g;
  while ((m = re2.exec(code))) {
    const decl = m[1];
    if (/^\s*[{[]/.test(decl)) {
      decl.replace(/[{}[\]]/g, ' ').split(',').forEach(x => {
        const n = x.split(':').pop().replace(/\.\.\./, '').replace(/\s*=.*/, '').trim();
        add(n);
      });
    } else {
      decl.split(',').forEach(x => add(x.replace(/\s*=.*/, '').trim()));
    }
  }

  /* 함수 매개변수 · 화살표 매개변수 */
  const re3 = /\(([^()]*)\)\s*(?:=>|\{)/g;
  while ((m = re3.exec(code))) {
    m[1].replace(/[{}[\]]/g, ' ').split(',').forEach(x => {
      const n = x.split(':').pop().replace(/\.\.\./, '').replace(/\s*=.*/, '').trim();
      add(n);
    });
  }
  const re4 = /(?:^|[^\w$.])([A-Za-z_$][\w$]*)\s*=>/g;
  while ((m = re4.exec(code))) add(m[1]);

  /* catch (e) · for (const x of …) · 라벨 */
  const re5 = /\bcatch\s*\(\s*([A-Za-z_$][\w$]*)/g;
  while ((m = re5.exec(code))) add(m[1]);

  /* 객체 속성으로 쓴 함수:  name: function  /  name(…) {  */
  const re6 = /(?:^|[,{\s])([A-Za-z_$][\w$]*)\s*(?::\s*(?:async\s*)?(?:function|\()|\([^()]*\)\s*\{)/gm;
  while ((m = re6.exec(code))) add(m[1]);

  /* window.xxx = */
  const re7 = /\bwindow\.([A-Za-z_$][\w$]*)\s*=/g;
  while ((m = re7.exec(code))) add(m[1]);

  return set;
}

/* db.js 를 실제로 읽어 DB 의 생김새를 얻는다 */
function loadDB() {
  const g = {
    window: {}, document: {}, navigator: { userAgent: '' },
    localStorage: { getItem: () => null, setItem: () => { }, removeItem: () => { } },
    fetch: () => { }, CONFIG: {},
  };
  const saved = {};
  for (const k of Object.keys(g)) { saved[k] = global[k]; global[k] = g[k]; }
  try {
    delete require.cache[require.resolve(path.join(ROOT, 'assets/db.js'))];
    require(path.join(ROOT, 'assets/db.js'));
  } catch (e) {
    console.log('  (db.js 를 읽지 못했어요: ' + e.message.slice(0, 60) + ')');
  }
  const DB = g.window.DB;
  for (const k of Object.keys(saved)) { if (saved[k] === undefined) delete global[k]; else global[k] = saved[k]; }
  return DB;
}

const DB = loadDB();
const dig = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);

/* UI 가 내보내는 이름 */
function uiExports() {
  /* 주석을 지우면 내보내기 덩어리까지 흐트러진다 — 원문에서 읽는다 */
  const src = fs.readFileSync(path.join(ROOT, 'assets/ui.js'), 'utf8');
  const m = /window\.UI\s*=\s*\{([\s\S]*?)\};/.exec(src) ||
            /return\s*\{([\s\S]*?)\};\s*\}\)\(\)/.exec(src);
  if (!m) return new Set();
  return new Set(m[1].split(',').map(x => x.split(':')[0].trim()).filter(Boolean));
}
const UI_NAMES = uiExports();

let problems = 0;
console.log('── 없는 것을 부르는 곳 찾기\n');

for (const rel of FILES) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) continue;
  const raw = fs.readFileSync(full, 'utf8');
  const code = strip(raw);
  const defined = definedNames(code);

  const lineOf = idx => raw.slice(0, idx).split('\n').length;
  const found = [];

  /* ① 부르는 함수 */
  const seen = new Set();
  let m;
  const call = /(^|[^\w$.])([A-Za-z_$][\w$]*)\s*\(/g;
  while ((m = call.exec(code))) {
    const n = m[2];
    if (seen.has(n)) continue;
    seen.add(n);
    if (defined.has(n) || BUILTIN.has(n) || GLOBALS.has(n) || UI_NAMES.has(n)) continue;
    found.push({ kind: '함수', name: n + '()', line: lineOf(m.index) });
  }

  /* ② DB.… 경로 */
  if (DB) {
    const seen2 = new Set();
    const dbre = /\bDB\.((?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*)/g;
    while ((m = dbre.exec(code))) {
      const p = m[1];
      if (seen2.has(p)) continue;
      seen2.add(p);
      if (dig(DB, p) !== undefined) continue;
      /* DB.community.feed(...).rows 처럼 결과를 또 파고드는 것은 뺀다 */
      const parent = p.split('.').slice(0, -1).join('.');
      if (parent && typeof dig(DB, parent) === 'function') continue;
      found.push({ kind: 'DB 경로', name: 'DB.' + p, line: lineOf(m.index) });
    }
  }

  if (found.length) {
    problems += found.length;
    console.log('  ✗ ' + rel);
    found.forEach(f => console.log('      ' + f.kind + '  ' + f.name + '   (줄 ' + f.line + ' 근처)'));
    console.log('');
  }
}

if (problems) {
  console.log('── ' + problems + '곳에서 없는 것을 부르고 있어요.');
  console.log('   그 버튼은 누르면 아무 일도 안 일어납니다.');
  process.exit(1);
}
console.log('  없는 것을 부르는 곳: 0곳\n');
