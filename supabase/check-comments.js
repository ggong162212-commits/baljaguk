#!/usr/bin/env node
/* 댓글 목록을 **한 함수로만** 그리는지, 답글이 **제 원댓글 밑에** 붙는지 지킨다.
   ------------------------------------------------------------
   · 예전에 댓글 시트와 글 상세(알림으로 연 글)가 서로 다르게 그려서
     답글 들여쓰기가 한쪽에만 있었다.
   · 그 뒤 전부 시간순 한 줄로 늘어놓았더니, 답글이 자기 원댓글이 아니라
     **바로 위에 있던 남의 댓글** 밑에 붙어 보였다.
   둘 다 여기서 잡는다. */
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'assets', 'community.js');
const src = fs.readFileSync(file, 'utf8');
const lines = src.split('\n');
const bad = [];

/* ── 공용 함수의 범위를 찾는다 (그 안쪽은 봐준다) */
const fnStart = lines.findIndex(l => /function commentListHTML\(/.test(l));
let fnEnd = -1;
if (fnStart >= 0) {
  let depth = 0;
  for (let i = fnStart; i < lines.length; i++) {
    depth += (lines[i].match(/\{/g) || []).length - (lines[i].match(/\}/g) || []).length;
    if (i > fnStart && depth <= 0) { fnEnd = i; break; }
  }
}

/* ① 목록을 만드는 곳이 또 생기면 안 된다 */
if (fnStart < 0) {
  bad.push('commentListHTML() 이 없어요 — 댓글 목록 그리기는 이 함수 하나로');
} else {
  lines.forEach((ln, i) => {
    if (i >= fnStart && i <= fnEnd) return;              /* 공용 함수 안쪽 */
    if (/commentLine\(\s*\w+\s*,/.test(ln)) return;      /* 카드 안 한 줄 미리보기(brief) */
    if (/\.map\(\s*\w*\s*=>\s*commentLine\(|\.map\(commentLine\)/.test(ln)) {
      bad.push('줄 ' + (i + 1) + ' — commentLine 을 직접 이어 붙였어요. ' +
        'commentListHTML() 을 쓰세요: ' + ln.trim().slice(0, 70));
    }
  });
}

/* ② 답글 들여쓰기는 줄 자체가 들고 있어야 한다 */
const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'style.css'), 'utf8');
if (!/\.cline\.reply\s*\{[^}]*padding-left/.test(css)) {
  bad.push('.cline.reply 에 padding-left 가 없어요 — ' +
    '껍데기(.replies)에만 두면 그 껍데기를 안 쓰는 화면에서 들여쓰기가 사라져요');
}

/* ③ 실제로 돌려 순서를 본다
   A 댓글, B 댓글, A에 답글, B에 답글, A답글에 답글
   → 화면은 A, A답글, A답글의답글, B, B답글 */
if (fnStart >= 0 && fnEnd > fnStart) {
  try {
    const body = lines.slice(fnStart, fnEnd + 1).join('\n');
    const make = new Function('commentLine',
      body.replace('function commentListHTML', 'function __f') + '\n return __f;');
    const draw = make(c => '[' + c.id + ']');

    const got = draw([
      { id: 'A',  created_at: '2026-10-21T10:00:00Z', parent_id: null },
      { id: 'B',  created_at: '2026-10-21T10:01:00Z', parent_id: null },
      { id: 'A1', created_at: '2026-10-21T10:02:00Z', parent_id: 'A' },
      { id: 'B1', created_at: '2026-10-21T10:03:00Z', parent_id: 'B' },
      { id: 'A2', created_at: '2026-10-21T10:04:00Z', parent_id: 'A1' }
    ]);
    const want = '[A][A1][A2][B][B1]';
    if (got !== want) {
      bad.push('답글이 제 원댓글 밑에 안 붙어요.\n        나온 것   ' + got +
               '\n        와야 할 것 ' + want);
    }

    /* 부모를 못 찾는 답글은 버리지 않고 맨 아래 */
    const got2 = draw([
      { id: 'A', created_at: '2026-10-21T10:00:00Z', parent_id: null },
      { id: 'X', created_at: '2026-10-21T10:01:00Z', parent_id: '없는것' }
    ]);
    if (got2.indexOf('[X]') < 0) bad.push('부모를 못 찾은 답글이 사라져요: ' + got2);
  } catch (e) {
    bad.push('commentListHTML 을 돌려보지 못했어요: ' + e.message);
  }
}

if (bad.length) {
  console.log('\n  ✗ 댓글 그리기에 문제가 있어요');
  bad.forEach(b => console.log('     ' + b));
  process.exit(1);
}
console.log('  댓글 목록은 한 함수로만 그리고, 답글은 제 원댓글 밑에 붙어요');
