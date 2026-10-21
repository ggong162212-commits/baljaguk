-- ============================================================
--  실시간 — 보이는 글의 숫자만 다시 받기 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「실시간으로 바로바로 반영되면 좋겠는데 한 발자국 느려」
--
--  재 보니 **내 동작은 10~20ms** 로 빠른데 **남이 한 것은 아예 안 떴다** —
--  커뮤니티 화면만 실시간을 안 쓰고 있었다.
--
--  이제 실시간으로 「무엇이 바뀌었는지」가 오면 그 카드만 고친다.
--  폴링으로 돌아올 때는 **보이는 글 몇 개의 숫자만** 받아온다 —
--  피드를 통째로 다시 불러오면 자리가 밀려서 읽던 글을 놓친다.
-- ============================================================

create or replace function feed_some(p_ids uuid[])
returns json
language sql security definer stable
set search_path = public
as $fn$
select case when not is_member() then null else coalesce(
  (select json_agg(json_build_object(
     'id', p.id,
     'comment_count', (select count(*)::int from comments c
                        where c.post_id = p.id and not c.hidden),
     'reactions', (select coalesce(json_object_agg(k, n), '{}'::json) from (
                     select r.kind as k, count(*)::int as n from reactions r
                      where r.post_id = p.id group by r.kind) z),
     'my_reactions', (select coalesce(json_agg(r.kind), '[]'::json) from reactions r
                       where r.post_id = p.id and r.member_id = my_member_id()),
     'recent_comments', (select coalesce(json_agg(j order by at), '[]'::json) from (
         select json_build_object(
                  'id', c.id, 'body', c.body, 'created_at', c.created_at,
                  'author', json_build_object('id', m.id, 'name', m.name,
                              'role', m.role, 'photo', m.photo_path)) as j,
                c.created_at as at
           from comments c join members m on m.id = c.author_id
          where c.post_id = p.id and not c.hidden
          order by c.created_at desc limit 2) y),
     'hidden', p.hidden,
     'edited_at', p.edited_at,
     'pinned', p.pinned))
     from posts p
    where p.id = any (coalesce(p_ids, '{}'::uuid[]))),
  '[]'::json) end;
$fn$;
revoke all on function feed_some(uuid[]) from public, anon;
grant execute on function feed_some(uuid[]) to authenticated;
