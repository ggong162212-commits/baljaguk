-- ============================================================
--  3차 고침 — 2026-10-21
--   member_notices 에 없는 칸을 쓰던 함수들
-- ============================================================
--  선고은님이 실서버에서 본 오류:
--    column "body" of relation "member_notices" does not exist
--
--  실서버에서 읽어 확인한 것:
--    member_notices 칸 = id, created_at, member_id, kind, detail, event_id
--    그런데 아래 함수들이 없는 칸 body · post_id 에 넣고 있었다:
--      feedback_reply   — 의견 답장
--      mark_best        — 「도움 됐어요」 답 고르기
--      reveal_quiz      — 퀴즈 정답 발표
--      reveal_quiz_sys  — 퀴즈 정답 자동 발표
--    넣는 줄이 실패하면 그 함수가 통째로 되돌려진다.
--    그래서 답장도, 도움 됐어요도, 퀴즈 발표도 다 죽어 있었다.
--
--  고치는 방법:
--    함수를 네 개 다시 쓰는 대신 **없던 칸을 더한다.**
--    옮겨 적다 틀릴 일이 없고, 지금 쓰는 함수가 그대로 산다.
-- ============================================================

alter table member_notices
  add column if not exists body    text,
  add column if not exists post_id uuid references posts(id) on delete cascade;

create index if not exists member_notices_post_idx on member_notices (post_id);


-- ── 읽는 쪽도 새 칸을 같이 내려준다.
--    옛 줄은 detail 에, 새 줄은 body 에 들어 있으니 둘 다 본다.
--    post_id 가 있으면 누르면 그 글로 간다.
create or replace function my_news(p_limit int default 30)
returns json
language sql security definer stable
set search_path = public
as $$
with me_ as (select my_member_id() as id),
mine as (select id from posts where author_id = (select id from me_)),
rows_ as (
  select 'comment' as kind, c.created_at, c.post_id,
         (select m.name from members m where m.id = c.author_id) as who,
         (select m.photo_path from members m where m.id = c.author_id) as who_photo,
         c.body as detail, null::text as kindly
    from comments c join mine on mine.id = c.post_id
   where c.author_id <> (select id from me_) and not c.hidden
  union all
  select 'reaction', r.created_at, r.post_id,
         (select m.name from members m where m.id = r.member_id),
         (select m.photo_path from members m where m.id = r.member_id),
         null, r.kind
    from reactions r join mine on mine.id = r.post_id
   where r.member_id <> (select id from me_)
  union all
  /* 내 댓글에 달린 답글 */
  select 'reply', c.created_at, c.post_id,
         (select m.name from members m where m.id = c.author_id),
         (select m.photo_path from members m where m.id = c.author_id),
         c.body, null::text
    from comments c
    join comments par on par.id = c.parent_id
   where par.author_id = (select id from me_)
     and c.author_id <> (select id from me_) and not c.hidden
  union all
  /* 나를 부른 글·댓글 */
  select 'mention', n.created_at, n.post_id,
         (select m.name from members m where m.id = n.actor_id),
         (select m.photo_path from members m where m.id = n.actor_id),
         n.detail, null::text
    from mentions n
   where n.member_id = (select id from me_)
     and n.actor_id is distinct from (select id from me_)
  union all
  /* 운영진이 남긴 소식 — 의견 답장 · 도움 됐어요 · 퀴즈 발표 */
  select n.kind, n.created_at, n.post_id, null::text, null::text,
         coalesce(n.body, n.detail), null::text
    from member_notices n where n.member_id = (select id from me_)
)
select case when not is_member() then null else coalesce(
  (select json_agg(json_build_object(
     'kind', kind, 'at', created_at, 'post_id', post_id,
     'who', who, 'who_photo', who_photo, 'detail', detail, 'react', kindly)
     order by created_at desc)
     from (select * from rows_ order by created_at desc
            limit greatest(1, least(coalesce(p_limit, 30), 100))) z),
  '[]'::json) end;
$$;


-- ── 내가 보낸 의견과 운영진 답장 — 답장을 볼 곳이 없었다
create or replace function my_feedback()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_member() then null else
  (select coalesce(json_agg(json_build_object(
            'id', f.id, 'created_at', f.created_at, 'body', f.body,
            'reply', f.reply, 'replied_at', f.replied_at,
            'done', f.done_at is not null)
            order by f.created_at desc), '[]'::json)
     from feedback f
    where f.member_id = my_member_id() and not f.anon)
end;
$$;
revoke all on function my_feedback() from public, anon;
grant execute on function my_feedback() to authenticated;


-- ── 운영진 받은 의견 — 보낸 답장 내용도 같이 보여 준다
create or replace function feedback_open()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'id', f.id, 'created_at', f.created_at, 'body', f.body,
            'anon', f.anon,
            /* 익명이면 이름도 사진도 아예 꺼내지 않는다 */
            'who', case when f.anon then null
                        else (select m.name from members m where m.id = f.member_id) end,
            'who_photo', case when f.anon then null
                        else (select m.photo_path from members m where m.id = f.member_id) end,
            'can_reply', (not f.anon) and f.member_id is not null,
            'reply', f.reply,
            'replied', f.replied_at is not null)
            order by f.created_at desc), '[]'::json)
     from feedback f where f.done_at is null)
end;
$$;
