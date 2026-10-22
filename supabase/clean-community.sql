-- ============================================================
--  커뮤니티 자료 비우기 — 후기만 남긴다 (2026-10-22)
-- ------------------------------------------------------------
--  선고은님: 「모든 거 다 배포하고 커뮤니티 데이터 싹 삭제(후기 빼고).
--  피드·칭찬·공지·운영진에게 할 말 등 모두 테스트였다」
--
--  ★ 되돌릴 수 없습니다. 돌리기 전에 백업이 있어야 합니다.
--    백업: Downloads\발자국_3차점검\backup_커뮤니티_<시각>\community-backup.json
--
--  ★ 통째로 **한 덩이**로 돈다 (do 블록 하나 = 한 트랜잭션).
--    중간에 하나라도 어긋나면 **아무것도 안 지워진다.**
--
--  지운다
--    · 후기(type='review')가 아닌 모든 글 — 자유글·공지(고정 공지 포함)·
--      칭찬·명예의 전당 글·투표 글·퀴즈 글
--    · 그 글에 딸린 것 — 댓글·답글·댓글 좋아요·반응·멘션·사진 행·아이 연결·신고
--    · 투표·투표 결과(polls·poll_options·poll_votes) 전부
--    · 운영진에게 할 말(feedback) 전부
--    · 새 소식(member_notices) 전부
--    · 알림 보낸 기록(push_outbox) 전부
--    · 명예의 전당(hall_of_fame) 전부
--
--  안 건드린다
--    · 후기 글과 그 댓글·하트·사진 전부
--    · 봉사 일정·신청·대기·출석·적립, 지난 봉사
--    · 구성원 명부·로그인 연결·알림 구독(push_subscriptions)
--    · survey.html 설문 응답 · 1365 · 가입 신청서 · 후원
--    · 아이들(animals) 자체 — 글과 이어진 줄만 끊긴다
--    · 보관함(Storage) 파일 — Supabase 가 SQL 로 못 지우게 막아 뒀다.
--      따로 정리해야 한다 (아래 ★보관함 참고)
--
--  ★보관함: 지운 글의 사진·영상 파일은 community 보관함에 **그대로 남는다.**
--    storage.protect_delete() 가 「Storage API 를 쓰라」며 막는다.
--    남는 파일 수는 끝에 알려 준다. 폴더 이름은 글 id 다 —
--    대시보드 Storage 화면에서 폴더째 지우면 된다.
--
--  ★알림: 지울 때 도는 트리거는 reports_close_trg · reports_close_c_trg ·
--    fame_guard_trg 셋뿐이고, 셋 다 **알림을 보내지 않는다.**
--    알림(outbox_on_*)은 모두 after insert 라 삭제로는 울리지 않는다.
-- ============================================================

do $clean$
declare
  n_post int; n_cmt int; n_like int; n_react int; n_men int;
  n_photo int; n_animal int; n_report int;
  n_pollv int; n_pollo int; n_poll int;
  n_feed int; n_notice int; n_outbox int; n_fame int;
  left_review int; left_cmt int; left_react int; left_photo int;
  left_post int; orphan_files int;
begin
  /* ── 지울 글을 먼저 고른다 (후기는 절대 안 든다) */
  create temporary table _del on commit drop as
    select id from posts where type <> 'review';

  /* 그 글에 달린 댓글 */
  create temporary table _delc on commit drop as
    select c.id from comments c join _del d on d.id = c.post_id;

  /* ── 딸린 것부터 (cascade 에 맡기지 않고 직접 — 몇 줄인지 세려고) */
  delete from comment_likes l using _delc c where c.id = l.comment_id;
  get diagnostics n_like = row_count;

  delete from reports r
   where r.post_id in (select id from _del)
      or r.comment_id in (select id from _delc);
  get diagnostics n_report = row_count;

  delete from mentions m
   where m.post_id in (select id from _del)
      or m.comment_id in (select id from _delc);
  get diagnostics n_men = row_count;

  delete from comments c using _delc d where d.id = c.id;
  get diagnostics n_cmt = row_count;

  delete from reactions r using _del d where d.id = r.post_id;
  get diagnostics n_react = row_count;

  delete from post_photos f using _del d where d.id = f.post_id;
  get diagnostics n_photo = row_count;

  delete from post_animals a using _del d where d.id = a.post_id;
  get diagnostics n_animal = row_count;

  /* ── 투표·퀴즈 — 전부 (답한 기록부터) */
  delete from poll_votes;   get diagnostics n_pollv = row_count;
  delete from poll_options; get diagnostics n_pollo = row_count;
  delete from polls;        get diagnostics n_poll  = row_count;

  /* ── 명예의 전당 — 글보다 먼저 (post_id 가 글을 가리킨다) */
  delete from hall_of_fame; get diagnostics n_fame = row_count;

  /* ── 새 소식 — **글보다 먼저** 지운다.
       post_id 가 글을 가리켜서(cascade), 글을 먼저 지우면 같이 사라져
       「몇 줄 지웠나」가 실제보다 적게 나온다 */
  delete from member_notices; get diagnostics n_notice = row_count;

  /* ── 글 자체 */
  delete from posts p using _del d where d.id = p.id;
  get diagnostics n_post = row_count;

  /* ── 글과 상관없는 것들 — 전부 */
  delete from feedback;    get diagnostics n_feed   = row_count;
  delete from push_outbox; get diagnostics n_outbox = row_count;

  /* ── 남은 것을 센다 */
  select count(*) into left_post   from posts;
  select count(*) into left_review from posts where type = 'review';
  select count(*) into left_cmt    from comments;
  select count(*) into left_react  from reactions;
  select count(*) into left_photo  from post_photos;
  select count(*) into orphan_files from storage.objects o
   where o.bucket_id = 'community'
     and o.name not in (select f.path from post_photos f)
     and o.name not in (select f.thumb from post_photos f where f.thumb is not null);

  /* ── 안 지워졌어야 할 것이 지워졌으면 **통째로 되돌린다** */
  if left_post <> left_review then
    raise exception '후기가 아닌 글이 % 개 남았어요 — 되돌립니다', left_post - left_review;
  end if;
  if left_review = 0 then
    raise exception '후기가 하나도 안 남았어요 — 되돌립니다';
  end if;

  raise notice '';
  raise notice '  ── 지웠어요 ──';
  raise notice '  글(후기 아님)        % 개', n_post;
  raise notice '  댓글·답글            % 개', n_cmt;
  raise notice '  댓글 좋아요          % 개', n_like;
  raise notice '  반응(하트)           % 개', n_react;
  raise notice '  부르기(멘션)         % 개', n_men;
  raise notice '  사진 행              % 개  (보관함 파일은 안 지워짐)', n_photo;
  raise notice '  아이 연결            % 개', n_animal;
  raise notice '  신고                 % 개', n_report;
  raise notice '  투표 % · 보기 % · 답 % 개', n_poll, n_pollo, n_pollv;
  raise notice '  운영진에게 할 말     % 개', n_feed;
  raise notice '  새 소식              % 개', n_notice;
  raise notice '  알림 보낸 기록       % 개', n_outbox;
  raise notice '  명예의 전당          % 개', n_fame;
  raise notice '';
  raise notice '  ── 남았어요 ──';
  raise notice '  후기 글              % 개', left_review;
  raise notice '  그 댓글 % · 하트 % · 사진 % 개', left_cmt, left_react, left_photo;
  raise notice '';
  raise notice '  ★ 보관함(community)에 주인 없는 파일 % 개가 남습니다 —', orphan_files;
  raise notice '    Supabase 가 SQL 로 지우지 못하게 막아 둬서 따로 치워야 해요.';
end
$clean$;
