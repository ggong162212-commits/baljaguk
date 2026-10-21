-- ============================================================
--  2차 — 2026-10-21
--   ① 사람 사진을 이름과 함께 보내 준다 (안 보내던 함수들)
--   ② 댓글 좋아요
--   ③ 답글 (한 단계만)
--   ④ @ 로 사람 부르기
--   ⑤ 운영진이 「알림 켠 사람」을 볼 수 있게
-- ============================================================
--  실서버에서 읽어 확인한 것:
--    members.photo_path  — 사진 경로가 들어 있는 칸
--    comments(id, created_at, post_id, parent_id, author_id, body, hidden, edited_at)
--      → parent_id 가 이미 있다. 답글은 이것만 쓰면 된다
--    사진을 보내던 함수: feed · me · post_comments (셋뿐)
--    안 보내던 함수: poll_who · reaction_who · my_news ·
--                    feedback_open · reports_open · admin_todo ·
--                    my_activity · vol_board · event_who
--    (vol_board·my_activity 는 사람 목록이 없고,
--     event_who 는 로그인 없이도 부르는 공개용이라 사진을 넣지 않는다)
-- ============================================================


-- ============================================================
--  ① 이름이 나오는 곳에 사진도 같이
-- ============================================================

-- 설문·퀴즈에 누가 답했나
create or replace function poll_who(p_option uuid)
returns json
language sql security definer stable
set search_path = public
as $$
  select case
    when not is_member() then null
    when exists (select 1 from poll_options o
                   join polls q on q.post_id = o.post_id
                  where o.id = p_option and q.anonymous) then '[]'::json
    else coalesce(
      (select json_agg(json_build_object('name', m.name, 'photo', m.photo_path)
                       order by m.name)
         from poll_votes v join members m on m.id = v.member_id
        where v.option_id = p_option), '[]'::json)
  end;
$$;

-- 누가 이 반응을 눌렀나
create or replace function reaction_who(p_post uuid, p_kind text)
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else coalesce(
    (select json_agg(json_build_object('name', m.name, 'photo', m.photo_path)
                     order by m.name)
       from reactions r join members m on m.id = r.member_id
      where r.post_id = p_post and r.kind = p_kind), '[]'::json)
  end;
$$;

-- 운영진 — 받은 의견
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
            'replied', f.replied_at is not null)
            order by f.created_at desc), '[]'::json)
     from feedback f where f.done_at is null)
end;
$$;

-- 운영진 — 신고
create or replace function reports_open()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'id', r.id, 'created_at', r.created_at, 'reason', r.reason,
            'post_id', r.post_id, 'comment_id', r.comment_id,
            'reporter', (select m.name from members m where m.id = r.reporter_id),
            'reporter_photo', (select m.photo_path from members m where m.id = r.reporter_id),
            'body', coalesce(
                      (select p.body from posts p    where p.id = r.post_id),
                      (select c.body from comments c where c.id = r.comment_id)))
            order by r.created_at desc), '[]'::json)
     from reports r where r.done_at is null)
end;
$$;


-- ============================================================
--  ② 댓글 좋아요
-- ============================================================
create table if not exists comment_likes (
  comment_id uuid not null references comments(id) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, member_id)
);
create index if not exists comment_likes_c_idx on comment_likes (comment_id);

alter table comment_likes enable row level security;
drop policy if exists "clike read"  on comment_likes;
drop policy if exists "clike write" on comment_likes;
create policy "clike read"  on comment_likes for select to authenticated using (is_member());
create policy "clike write" on comment_likes for all to authenticated
  using (member_id = my_member_id()) with check (member_id = my_member_id());

-- 눌렀다 뗐다 — 돌려주는 값은 지금 켜졌는지
create or replace function comment_like_toggle(p_comment uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  me_ uuid := my_member_id();
  on_ boolean;
  n_  int;
begin
  if me_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;

  if exists (select 1 from comment_likes
              where comment_id = p_comment and member_id = me_) then
    delete from comment_likes where comment_id = p_comment and member_id = me_;
    on_ := false;
  else
    insert into comment_likes (comment_id, member_id) values (p_comment, me_)
      on conflict do nothing;
    on_ := true;
  end if;

  select count(*)::int into n_ from comment_likes where comment_id = p_comment;
  return json_build_object('ok', true, 'on', on_, 'n', n_);
end;
$$;
revoke all on function comment_like_toggle(uuid) from public, anon;
grant execute on function comment_like_toggle(uuid) to authenticated;


-- ============================================================
--  ③ @ 로 사람 부르기
-- ============================================================
create table if not exists mentions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id  uuid not null references members(id) on delete cascade,  -- 불린 사람
  actor_id   uuid references members(id) on delete set null,          -- 부른 사람
  post_id    uuid references posts(id) on delete cascade,
  comment_id uuid references comments(id) on delete cascade,
  detail     text
);
create index if not exists mentions_me_idx on mentions (member_id, created_at desc);

alter table mentions enable row level security;
drop policy if exists "mention read"  on mentions;
drop policy if exists "mention write" on mentions;
create policy "mention read"  on mentions for select to authenticated
  using (member_id = my_member_id() or actor_id = my_member_id());
create policy "mention write" on mentions for insert to authenticated
  with check (actor_id = my_member_id());

-- @ 를 칠 때 보여 줄 이름 목록 — 연락처·학번은 주지 않는다
create or replace function mention_people(p_q text default '')
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else coalesce(
    (select json_agg(json_build_object('id', m.id, 'name', m.name, 'photo', m.photo_path)
                     order by m.name)
       from (select * from members
              where status <> 'left'
                and (coalesce(p_q, '') = '' or name ilike '%' || p_q || '%')
              order by name limit 20) m), '[]'::json)
  end;
$$;
revoke all on function mention_people(text) from public, anon;
grant execute on function mention_people(text) to authenticated;

-- 부른 사실을 적는다 (글·댓글을 쓴 뒤에 부른다)
create or replace function mention_add(p_ids uuid[], p_post uuid, p_comment uuid, p_detail text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare me_ uuid := my_member_id(); n_ int := 0;
begin
  if me_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;

  insert into mentions (member_id, actor_id, post_id, comment_id, detail)
  select x, me_, p_post, p_comment, left(coalesce(p_detail, ''), 120)
    from unnest(coalesce(p_ids, '{}'::uuid[])) x
   where x is distinct from me_                       -- 나를 부른 건 세지 않는다
     and exists (select 1 from members m where m.id = x and m.status <> 'left');
  get diagnostics n_ = row_count;

  /* 알림 — 불린 사람에게만 */
  insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
  select x, 'mention',
         coalesce((select m.name from members m where m.id = me_), '구성원') || '님이 회원님을 언급했어요',
         left(coalesce(p_detail, ''), 60),
         'me.html#post=' || coalesce(p_post::text, ''),
         me_,
         'mention:' || coalesce(p_comment::text, p_post::text, '') || ':' || x::text
    from unnest(coalesce(p_ids, '{}'::uuid[])) x
   where x is distinct from me_
     and exists (select 1 from members m where m.id = x and m.status <> 'left')
  on conflict (dedupe_key) do nothing;

  return json_build_object('ok', true, 'n', n_);
end;
$$;
revoke all on function mention_add(uuid[], uuid, uuid, text) from public, anon;
grant execute on function mention_add(uuid[], uuid, uuid, text) to authenticated;

-- 「언급」 알림 끄고 켜기
alter table push_subscriptions
  add column if not exists want_mention boolean not null default true;


-- 새 소식 — 누가 했는지 사진까지
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
  select n.kind, n.created_at, null::uuid, null::text, null::text, n.detail, null::text
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



-- ============================================================
--  ④ 댓글 목록 — 좋아요·답글까지 한 번에
-- ============================================================
create or replace function post_comments(p_post uuid)
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else coalesce(
    (select json_agg(json_build_object(
       'id', c.id, 'created_at', c.created_at, 'parent_id', c.parent_id,
       'body', case when c.hidden then '' else c.body end,
       'hidden', c.hidden, 'edited_at', c.edited_at,
       'mine', c.author_id = my_member_id(),
       'likes', (select count(*)::int from comment_likes l where l.comment_id = c.id),
       'liked', exists (select 1 from comment_likes l
                         where l.comment_id = c.id and l.member_id = my_member_id()),
       'author', (select json_build_object('id', m.id, 'name', m.name,
                         'role', m.role, 'photo', m.photo_path)
                    from members m where m.id = c.author_id))
       order by coalesce(c.parent_id, c.id), c.created_at)
       from comments c where c.post_id = p_post), '[]'::json)
  end;
$$;


-- ============================================================
--  ⑤ 댓글 좋아요 알림 — 댓글 쓴 사람에게만, 10분에 한 번만
--     (글쓴이에게는 안 보낸다. 소리가 너무 잦아진다)
-- ============================================================
create or replace function notify_comment_like()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  owner_ uuid;
  who_   text;
  post_  uuid;
begin
  select c.author_id, c.post_id into owner_, post_
    from comments c where c.id = new.comment_id;
  if owner_ is null or owner_ = new.member_id then return new; end if;

  select m.name into who_ from members m where m.id = new.member_id;

  insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
  values (owner_, 'clike', '내 댓글을 좋아해요',
          coalesce(who_, '구성원') || '님이 좋아요를 눌렀어요',
          'me.html#post=' || coalesce(post_::text, ''),
          new.member_id,
          /* 10분에 한 번만 — 같은 댓글에 여러 번 눌려도 한 번 */
          'clike:' || new.comment_id::text || ':' ||
            to_char(date_trunc('hour', now()) +
                    (floor(extract(minute from now()) / 10) * interval '10 minutes'),
                    'YYYYMMDDHH24MI'))
  on conflict (dedupe_key) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_notify_clike on comment_likes;
create trigger trg_notify_clike
  after insert on comment_likes
  for each row execute function notify_comment_like();

alter table push_subscriptions
  add column if not exists want_clike boolean not null default true;


-- ============================================================
--  ⑥ 운영진이 「알림 켠 사람」을 본다
--     ★ 구독 주소·키는 절대 내려보내지 않는다. 켰는지와 기기 수만.
-- ============================================================
create or replace function push_who()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'id', m.id,
            'devices', (select count(*)::int from push_subscriptions s
                         where s.member_id = m.id))
            order by m.name), '[]'::json)
     from members m where m.status <> 'left')
end;
$$;
revoke all on function push_who() from public, anon;
grant execute on function push_who() to authenticated;


-- ============================================================
--  ⑦ 운영진 할 일 — 받은 의견을 안 세고 있었다
--     선고은님: 「할 일이 안 뜨네」
--     의견 2건이 쌓여 있는데 admin_todo() 가 feedback 을 세지 않아
--     프런트가 읽는 t.feedback 이 늘 비어 있었다.
-- ============================================================
create or replace function admin_todo()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  json_build_object(
    'unconfirmed', (select count(*)::int from events e
                     where e.date < current_date and e.confirmed_at is null),
    'applications', (select count(*)::int from applications a
                      where coalesce(a.status, 'pending') = 'pending'),
    'reports',     (select count(*)::int from reports r where r.done_at is null),
    'feedback',    (select count(*)::int from feedback f where f.done_at is null)
  )
end;
$$;


-- ============================================================
--  ⑧ 피드의 「최근 댓글 2개」에 사람 사진이 없었다
--     선고은님: 「댓글 미리보기 두 개에서 프로필 사진이 안 보여」
--     feed() 가 recent_comments 의 author 를 이름 글자로만 보냈다.
--     (community.sql 본문도 같이 고쳐 뒀다)
-- ============================================================
--  실서버에서는 함수를 통째로 옮겨 적지 않고,
--  서버가 제 정의를 읽어 그 줄만 바꾸게 했다:
--    select pg_get_functiondef(...) into src;
--    src := replace(src, 옛줄, 새줄);
--    execute src;
--  긴 함수를 손으로 옮기다 틀리는 사고를 막는 방법이다.
