-- ============================================================
--  사진 콘테스트 올려 달라고 알림 한 번 (2026-11-11)
--  ------------------------------------------------------------
--  글(공지)은 올리지 않는다 — **폰 알림만** 울린다.
--  그래서 posts 를 건드리지 않고 push_outbox 에 한 줄만 쌓는다.
--  baljaguk_send (1분마다) 가 가져가 보낸다.
--
--  · member_id null → 받는 사람을 한 줄로 두면 보내는 쪽이
--    「공지」 알림을 켠 사람에게 나눠 보낸다 (fix-23 과 같은 꼴)
--  · kind 'notice' → 알림 설정의 「공지 · 운영진 공지」 칸을 따른다.
--    그 칸을 끈 사람에게는 가지 않는다
--  · url 'me.html#contest=1' → 누르면 콘테스트 화면이 바로 열린다
--    (community.js 의 딥링크 #contest=… · fix-23 이 쓰는 주소와 같다)
--  · dedupe_key 로 두 번 눌러도 한 번만 나간다
-- ============================================================

insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
values (
  null,
  'notice',
  '🐾 사진 콘테스트 아직 2작품이에요!',
  '봉사 사진 한 장만 올려 주세요 · 11/30(월)까지 🏆',
  'me.html#contest=1',
  'contest-nudge:20261111'
)
on conflict (dedupe_key) do nothing;

-- 쌓였는지 보기 (읽기 조회)
-- select kind, title, url, created_at, sent_at
--   from push_outbox where dedupe_key = 'contest-nudge:20261111';
