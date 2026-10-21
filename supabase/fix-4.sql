-- ============================================================
--  3차 A·B — 막힘과 오작동 (2026-10-21)
-- ============================================================
--  점검 담당 세션이 실서버를 읽어 찾은 것들.
--  실서버 정의를 받아 고치는 것은 따로 적어 두었다.
-- ============================================================


-- ============================================================
--  A-1  글 하나만 받아오기
-- ------------------------------------------------------------
--  알림·새 소식·@언급으로 글을 열 때, 화면은 이미 받아 둔 피드
--  (첫 20개)에서만 찾았다. 없으면 「글을 찾지 못했어요」.
--  실서버 글이 이미 24개라 오래된 글 4개는 알림을 눌러도 못 열었다.
--
--  feed() 의 한 줄과 **같은 모양**으로 돌려준다 — 화면이 그대로 쓴다.
-- ============================================================
create or replace function post_one(p_id uuid)
returns json
language sql security definer stable
set search_path = public
as $$
with me_ as (select my_member_id() as id)
select case when not is_member() then null else
  (select json_build_object(
    'id', p.id,
    'created_at', p.created_at,
    'type', p.type,
    'event_id', p.event_id,
    'place', p.place,
    'date', p.date,
    'body', case when p.hidden and p.author_id <> (select id from me_) and not is_admin()
                 then '' else p.body end,
    'pinned', p.pinned,
    'hidden', p.hidden,
    'edited_at', p.edited_at,
    'insta_ok', p.insta_ok,
    'mine', p.author_id = (select id from me_),
    'author', (select json_build_object('id', m.id, 'name', m.name,
                        'role', m.role, 'photo', m.photo_path)
                 from members m where m.id = p.author_id),
    'photos', (select coalesce(json_agg(f.path order by f.sort), '[]'::json)
                 from post_photos f where f.post_id = p.id),
    'comment_count', (select count(*)::int from comments c
                       where c.post_id = p.id and not c.hidden),
    'recent_comments', (select coalesce(json_agg(j order by at), '[]'::json) from (
         select json_build_object(
                  'id', c.id, 'created_at', c.created_at, 'body', c.body,
                  'mine', c.author_id = (select id from me_),
                  'author', (select json_build_object('id', m.id, 'name', m.name,
                                      'role', m.role, 'photo', m.photo_path)
                               from members m where m.id = c.author_id)) as j,
                c.created_at as at
           from comments c
          where c.post_id = p.id and not c.hidden
          order by c.created_at desc limit 2) y),
    'reactions', (select coalesce(json_object_agg(k, n), '{}'::json) from (
                    select kind as k, count(*)::int as n from reactions r
                     where r.post_id = p.id group by kind) z),
    'my_reactions', (select coalesce(json_agg(r.kind), '[]'::json) from reactions r
                      where r.post_id = p.id and r.member_id = (select id from me_)),
    'question', p.is_question,
    'solved', p.solved_at is not null,
    'answers', case when p.is_question then
                 (select count(*)::int from comments c
                   where c.post_id = p.id and not c.hidden) end,
    'best', case when p.best_comment_id is not null then
              (select left(c.body, 60) from comments c where c.id = p.best_comment_id) end,
    'best_id', p.best_comment_id,
    'animals', (select coalesce(json_agg(json_build_object(
                  'id', a.id, 'name', a.name,
                  'adopted', a.adopted_at is not null) order by a.name), '[]'::json)
                  from post_animals pa join animals a on a.id = pa.animal_id
                 where pa.post_id = p.id),
    'poll', (select json_build_object(
               'question', q.question, 'multi', q.multi, 'anonymous', q.anonymous,
               'closes_at', q.closes_at, 'closed_at', q.closed_at,
               'quiz', q.answer_option_id is not null,
               'reveal_at', q.reveal_at,
               'revealed', q.revealed_at is not null,
               'answer', case when q.revealed_at is not null then q.answer_option_id end,
               'voters', case when q.answer_option_id is null or q.revealed_at is not null then (
                           select count(distinct v.member_id)::int from poll_votes v
                            where v.post_id = p.id) end,
               'correct', case when q.answer_option_id is not null and q.revealed_at is not null then (
                           select count(*)::int from poll_votes v
                            where v.option_id = q.answer_option_id) end,
               'options', (select coalesce(json_agg(json_build_object(
                             'id', o.id, 'label', o.label,
                             'votes', case when q.answer_option_id is null or q.revealed_at is not null
                                        then (select count(*)::int from poll_votes v
                                               where v.option_id = o.id) end,
                             'mine', exists (select 1 from poll_votes v
                                              where v.option_id = o.id
                                                and v.member_id = (select id from me_)))
                             order by o.sort), '[]'::json)
                           from poll_options o where o.post_id = p.id))
              from polls q where q.post_id = p.id))
    from posts p
   where p.id = p_id
     and (not p.hidden or p.author_id = (select id from me_) or is_admin()))
end;
$$;
revoke all on function post_one(uuid) from public, anon;
grant execute on function post_one(uuid) to authenticated;


-- ============================================================
--  B-1  설문 답 바꾸기가 「지우고 넣기」라 응답이 사라지던 것
-- ------------------------------------------------------------
--  지우기(DELETE)는 정책에 마감 조건이 없고 poll_guard 는 insert 에만
--  걸려 있었다. 그래서 마감·발표 뒤에 누르면 **지우기만 성공**하고
--  내 응답이 서버에서 사라졌다. 화면은 실패로 보고 예전 표를 다시
--  그려서 본인은 모른다. 퀴즈 「몇 명 중 몇 명 정답」도 틀어진다.
--
--  한 번에 끝내는 함수로 바꾼다 — 한 트랜잭션, 왕복도 줄어든다.
-- ============================================================
create or replace function vote_set(p_post uuid, p_option uuid, p_multi boolean default false)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  me_    uuid := my_member_id();
  q      polls%rowtype;
  had    boolean;
begin
  if me_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;

  select * into q from polls where post_id = p_post;
  if q.post_id is null then return json_build_object('ok', false, 'why', 'notfound'); end if;

  /* 마감됐으면 아무것도 건드리지 않는다 — 지워지지도 않는다 */
  if q.closed_at is not null
     or (q.closes_at is not null and q.closes_at < now())
     or q.revealed_at is not null then
    return json_build_object('ok', false, 'why', 'closed');
  end if;

  if not exists (select 1 from poll_options o
                  where o.id = p_option and o.post_id = p_post) then
    return json_build_object('ok', false, 'why', 'notfound');
  end if;

  had := exists (select 1 from poll_votes v
                  where v.option_id = p_option and v.member_id = me_);

  if had then
    /* 같은 것을 다시 누르면 뺀다 */
    delete from poll_votes where option_id = p_option and member_id = me_;
  else
    /* 하나만 고르는 설문이면 먼저 고른 것을 치운다 */
    if not coalesce(p_multi, q.multi, false) then
      delete from poll_votes where post_id = p_post and member_id = me_;
    end if;
    insert into poll_votes (post_id, option_id, member_id)
         values (p_post, p_option, me_)
    on conflict do nothing;
  end if;

  return json_build_object('ok', true, 'on', not had);
end;
$$;
revoke all on function vote_set(uuid, uuid, boolean) from public, anon;
grant execute on function vote_set(uuid, uuid, boolean) to authenticated;


-- ============================================================
--  B-5  운영진이 고정한 글을 글쓴이가 못 고치던 것
-- ------------------------------------------------------------
--  고정 여부를 **바뀔 때만** 보지 않고 늘 봤다.
--  그래서 운영진이 남의 글을 고정하면 그 글쓴이가 자기 글을
--  고치려 할 때 「고정은 운영진만 할 수 있어요」로 막혔다.
-- ============================================================
create or replace function posts_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.type = 'notice' and not is_admin() then
    raise exception '공지는 운영진만 쓸 수 있어요';
  end if;
  if new.type = 'poll' and not is_admin() then
    raise exception '설문은 운영진만 만들 수 있어요';
  end if;
  /* 고정을 **새로 거는 순간**만 본다.
     이미 고정된 글을 글쓴이가 고치는 건 막지 않는다. */
  if new.pinned and not is_admin()
     and (tg_op = 'INSERT' or not coalesce(old.pinned, false)) then
    raise exception '고정은 운영진만 할 수 있어요';
  end if;
  if tg_op = 'UPDATE' and new.hidden is distinct from old.hidden
     and not is_admin() and old.author_id <> my_member_id() then
    raise exception '숨기기는 운영진만 할 수 있어요';
  end if;
  return new;
end;
$$;


-- ============================================================
--  B-16  날짜를 한국 시간으로
-- ------------------------------------------------------------
--  실서버 시간대가 UTC 라서 한국 시간 0~9시에는 「오늘」이 어제였다.
--  그 시간에 승인한 가입일이 하루 밀리고, 9시 전 현장 출석은
--  「오늘 봉사가 아니에요」가 됐다.
--
--  날짜를 비교하는 곳의 current_date 를 한국 날짜로 바꾼다.
--  (push_tick 은 이미 그렇게 하고 있었다)
-- ============================================================
do $outer$
declare
  r record;
  src text;
  n int := 0;
begin
  for r in
    select p.oid, p.proname
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and position('current_date' in pg_get_functiondef(p.oid)) > 0
  loop
    src := pg_get_functiondef(r.oid);
    src := replace(src, 'current_date', E'(now() at time zone \'Asia/Seoul\')::date');
    begin
      execute src;
      n := n + 1;
    exception when others then
      raise notice '  % 는 건너뛰었어요: %', r.proname, sqlerrm;
    end;
  end loop;
  raise notice '  한국 날짜로 바꾼 함수: %개', n;
end
$outer$;
