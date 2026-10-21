#!/usr/bin/env node
/* 댓글 목록을 **한 함수로만** 그리는지 지킨다.
   ------------------------------------------------------------
   예전에 댓글 시트와 글 상세(알림으로 연 글)가 서로 다르게 그려서
   답글 들여쓰기가 한쪽에만 있었다. 또 갈라지면 여기서 잡는다. */
const fs = require('fs');
const path = require('path');

const f = path.join(__dirname, '..', 'assets', 'community.js');
const s = fs.readFileSync(f, 'utf8');
const bad = [];

/* ① commentLine 을 직접 이어 붙여 목록을 만드는 곳이 또 생기면 안 된다 */
const lines = s.split('\n');
lines.forEach((ln, i) => {
  /* 카드 안 미리보기(brief)는 한 줄짜리라 일부러 다르다 — 거기는 뺀다 */
  if (/commentLine\(\s*\w+\s*,/.test(ln)) return;
  if (/\.map\(\s*c?\w*\s*=>\s*commentLine\(|\.map\(commentLine\)/.test(ln)) {
    /* 공용 함수 안쪽은 괜찮다 */
    const before = lines.slice(Math.max(0, i - 12), i).join('\n');
    if (!/function commentListHTML/.test(before)) {
      bad.push('줄 ' + (i + 1) + ' — commentLine 을 직접 이어 붙였어요. ' +
        'commentListHTML() 을 쓰세요: ' + ln.trim().slice(0, 70));
    }
  }
});

/* ② 공용 함수가 있어야 한다 */
if (!/function commentListHTML\(/.test(s)) {
  bad.push('commentListHTML() 이 없어요 — 댓글 목록 그리기는 이 함수 하나로');
}

/* ③ 답글 들여쓰기는 줄 자체가 들고 있어야 한다 */
const css = fs.readFileSync(path.join(__dirname, '..', 'assets', 'style.css'), 'utf8');
if (!/\.cline\.reply\s*\{[^}]*padding-left/.test(css)) {
  bad.push('.cline.reply 에 padding-left 가 없어요 — ' +
    '껍데기(.replies)에만 두면 그 껍데기를 안 쓰는 화면에서 들여쓰기가 사라져요');
}

if (bad.length) {
  console.log('\n  ✗ 댓글 그리기가 갈라졌어요');
  bad.forEach(b => console.log('     ' + b));
  process.exit(1);
}
console.log('  댓글 목록은 한 함수로만 그려요');
