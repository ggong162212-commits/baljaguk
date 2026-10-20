-- ============================================================
--  발자국 🐾 커뮤니티 (B·C단계) · 표와 권한
--  Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run
--
--  원칙
--   · 구성원만 읽고 쓴다 (is_member). 탈퇴하면 그날로 막힌다
--   · 글쓴이는 서버가 정한다 (my_member_id). 화면이 보낸 값은 믿지 않는다
--   · 어떤 응답에도 연락처·학번은 실리지 않는다
-- ============================================================


-- ------------------------------------------------------------
-- 0) 내가 누구인지 — 서버가 직접 찾는다
-- ------------------------------------------------------------
create or replace function my_member_id()
returns uuid
language sql security definer stable
set search_path = public
as $$
  select m.id from members m
   where m.auth_user_id = auth.uid()
     and m.status <> 'left'
   limit 1;
$$;

create or replace function is_member()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select exists (
    select 1 from members m
     where m.auth_user_id = auth.uid()
       and m.status <> 'left');
$$;

revoke all on function my_member_id() from public, anon;
revoke all on function is_member()    from public, anon;
grant execute on function my_member_id() to authenticated;
grant execute on function is_member()    to authenticated;


-- 프로필 사진 경로 (G단계에서 씁니다. 지금은 비어 있어도 됩니다)
alter table members add column if not exists photo_path text;


-- ------------------------------------------------------------
-- 1) 글 — 봉사 후기 / 투표 / 공지
-- ------------------------------------------------------------
create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  author_id   uuid not null references members(id) on delete cascade,
  type        text not null check (type in ('review','poll','notice')),
  event_id    uuid references events(id) on delete set null,
  place       text,
  date        date,
  body        text not null default '',
  pinned      boolean not null default false,
  hidden      boolean not null default false,
  hidden_by   uuid references members(id) on delete set null,
  edited_at   timestamptz,
  -- 올린 사람이 발자국 인스타그램에 써도 된다고 한 경우에만 true
  insta_ok    boolean not null default false
);
create index if not exists posts_created_idx on posts (created_at desc);
create index if not exists posts_type_idx    on posts (type, created_at desc);

-- 사진 (Storage 안의 경로만 담는다. 파일 자체는 비공개 버킷에)
create table if not exists post_photos (
  id       uuid primary key default gen_random_uuid(),
  post_id  uuid not null references posts(id) on delete cascade,
  path     text not null,
  sort     int  not null default 0
);
create index if not exists post_photos_post_idx on post_photos (post_id, sort);

-- 댓글 (대댓글은 1단계까지)
create table if not exists comments (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  post_id    uuid not null references posts(id) on delete cascade,
  parent_id  uuid references comments(id) on delete cascade,
  author_id  uuid not null references members(id) on delete cascade,
  body       text not null,
  hidden     boolean not null default false,
  edited_at  timestamptz
);
create index if not exists comments_post_idx on comments (post_id, created_at);

-- 반응 (한 사람이 여러 종류 가능 · 같은 걸 다시 누르면 취소)
create table if not exists reactions (
  post_id   uuid not null references posts(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  kind      text not null check (kind in ('heart','paw','haha','moved','clap','best')),
  created_at timestamptz not null default now(),
  primary key (post_id, member_id, kind)
);


-- ------------------------------------------------------------
-- 2) 투표
-- ------------------------------------------------------------
create table if not exists polls (
  post_id    uuid primary key references posts(id) on delete cascade,
  question   text not null,
  multi      boolean not null default false,
  anonymous  boolean not null default false,
  closes_at  timestamptz,
  closed_at  timestamptz,
  -- 퀴즈: 정답이 있으면 퀴즈다. 발표 전에는 어떤 응답에도 실리지 않는다
  answer_option_id uuid,
  reveal_at   timestamptz,
  revealed_at timestamptz
);
-- 이미 만들어진 곳에도 더해 준다 (feed() 가 아래에서 이 칸들을 쓴다)
alter table polls add column if not exists answer_option_id uuid;
alter table polls add column if not exists reveal_at   timestamptz;
alter table polls add column if not exists revealed_at timestamptz;

create table if not exists poll_options (
  id      uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  label   text not null,
  sort    int  not null default 0
);
create index if not exists poll_options_post_idx on poll_options (post_id, sort);

create table if not exists poll_votes (
  post_id   uuid not null references posts(id) on delete cascade,
  option_id uuid not null references poll_options(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, option_id, member_id)
);


-- ------------------------------------------------------------
-- 3) 알림 받을 기기 (E단계) — 본인 것만 읽고 쓴다
-- ------------------------------------------------------------
create table if not exists push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id  uuid not null references members(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  want_notice   boolean not null default true,
  want_comment  boolean not null default true,
  want_reaction boolean not null default true
);


-- ------------------------------------------------------------
-- 4) 권한 — 구성원만. 수정·삭제는 쓴 사람만. 숨기기는 운영진도.
-- ------------------------------------------------------------
alter table posts              enable row level security;
alter table post_photos        enable row level security;
alter table comments           enable row level security;
alter table reactions          enable row level security;
alter table polls              enable row level security;
alter table poll_options       enable row level security;
alter table poll_votes         enable row level security;
alter table push_subscriptions enable row level security;

-- 글
drop policy if exists "posts read"   on posts;
drop policy if exists "posts write"  on posts;
drop policy if exists "posts update" on posts;
drop policy if exists "posts delete" on posts;
create policy "posts read"   on posts for select to authenticated using (is_member());
create policy "posts write"  on posts for insert to authenticated with check (author_id = my_member_id());
create policy "posts update" on posts for update to authenticated
  using (author_id = my_member_id() or is_admin())
  with check (author_id = my_member_id() or is_admin());
create policy "posts delete" on posts for delete to authenticated
  using (author_id = my_member_id() or is_admin());

-- 사진 · 투표 구성요소는 글의 주인을 따라간다
drop policy if exists "photos read"  on post_photos;
drop policy if exists "photos write" on post_photos;
create policy "photos read"  on post_photos for select to authenticated using (is_member());
create policy "photos write" on post_photos for all to authenticated
  using (exists (select 1 from posts p where p.id = post_id
                  and (p.author_id = my_member_id() or is_admin())))
  with check (exists (select 1 from posts p where p.id = post_id
                  and (p.author_id = my_member_id() or is_admin())));

drop policy if exists "polls read"  on polls;
drop policy if exists "polls write" on polls;
create policy "polls read"  on polls for select to authenticated using (is_member());
create policy "polls write" on polls for all to authenticated
  using (exists (select 1 from posts p where p.id = post_id
                  and (p.author_id = my_member_id() or is_admin())))
  with check (exists (select 1 from posts p where p.id = post_id
                  and (p.author_id = my_member_id() or is_admin())));

drop policy if exists "opts read"  on poll_options;
drop policy if exists "opts write" on poll_options;
create policy "opts read"  on poll_options for select to authenticated using (is_member());
create policy "opts write" on poll_options for all to authenticated
  using (exists (select 1 from posts p where p.id = post_id
                  and (p.author_id = my_member_id() or is_admin())))
  with check (exists (select 1 from posts p where p.id = post_id
                  and (p.author_id = my_member_id() or is_admin())));

-- 내 표는 내가 넣고 내가 뺀다 (마감 전까지)
drop policy if exists "votes read"  on poll_votes;
drop policy if exists "votes mine"  on poll_votes;
create policy "votes read" on poll_votes for select to authenticated using (is_member());
create policy "votes mine" on poll_votes for all to authenticated
  using (member_id = my_member_id())
  with check (member_id = my_member_id()
    and not exists (select 1 from polls q where q.post_id = poll_votes.post_id
                     and (q.closed_at is not null
                          or (q.closes_at is not null and q.closes_at < now()))));

-- 댓글
drop policy if exists "comments read"   on comments;
drop policy if exists "comments write"  on comments;
drop policy if exists "comments update" on comments;
drop policy if exists "comments delete" on comments;
create policy "comments read"   on comments for select to authenticated using (is_member());
create policy "comments write"  on comments for insert to authenticated with check (author_id = my_member_id());
create policy "comments update" on comments for update to authenticated
  using (author_id = my_member_id() or is_admin())
  with check (author_id = my_member_id() or is_admin());
create policy "comments delete" on comments for delete to authenticated
  using (author_id = my_member_id() or is_admin());

-- 반응 — 내 것만
drop policy if exists "reactions read" on reactions;
drop policy if exists "reactions mine" on reactions;
create policy "reactions read" on reactions for select to authenticated using (is_member());
create policy "reactions mine" on reactions for all to authenticated
  using (member_id = my_member_id()) with check (member_id = my_member_id());

-- 알림 기기 — 본인 것만
drop policy if exists "push mine" on push_subscriptions;
create policy "push mine" on push_subscriptions for all to authenticated
  using (member_id = my_member_id()) with check (member_id = my_member_id());


-- ------------------------------------------------------------
-- 5) 공지는 운영진만 쓰고, 고정도 운영진만
-- ------------------------------------------------------------
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
  if new.pinned and not is_admin() then
    raise exception '고정은 운영진만 할 수 있어요';
  end if;
  if tg_op = 'UPDATE' and new.hidden is distinct from old.hidden
     and not is_admin() and old.author_id <> my_member_id() then
    raise exception '숨기기는 운영진만 할 수 있어요';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_guard_trg on posts;
create trigger posts_guard_trg before insert or update on posts
  for each row execute function posts_guard();


-- ------------------------------------------------------------
-- 6) 실시간 (운영진 화면과 같은 방식)
-- ------------------------------------------------------------
do $$
begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    execute 'alter publication supabase_realtime add table public.posts';
    execute 'alter publication supabase_realtime add table public.comments';
    execute 'alter publication supabase_realtime add table public.reactions';
    execute 'alter publication supabase_realtime add table public.poll_votes';
  end if;
exception when duplicate_object then null;
end $$;


-- ------------------------------------------------------------
-- 7) 피드 — 한 번에 모아서 내려준다 (이름·역할만, 연락처·학번 없음)
--    p_cursor 보다 오래된 글을 p_limit 개만큼. 고정 공지는 첫 장에만 맨 위로.
-- ------------------------------------------------------------
create or replace function feed(
  p_cursor timestamptz default null,
  p_type   text        default null,   -- review / poll / notice / null(전체)
  p_place  text        default null,
  p_limit  int         default 20)
returns json
language sql security definer stable
set search_path = public
as $$
with me_ as (select my_member_id() as id),
pick as (
  select p.*
    from posts p
   where (p_cursor is null or p.created_at < p_cursor)
     and (p_type   is null or p.type  = p_type)
     and (p_place  is null or p.place = p_place)
     /* 공식 투표는 투표 탭에만. 피드에는 글 속 투표만 보인다 */
     and (p_type is not null or p.type <> 'poll')
     /* 맨 위에 고정된 공지는 바로 위에 이미 보인다 — 목록에 또 넣지 않는다 */
     and not (p.type = 'notice' and p.pinned)
     and (not p.hidden
          or p.author_id = (select id from me_)
          or is_admin())
   order by p.created_at desc
   limit greatest(1, least(coalesce(p_limit, 20), 50))
),
rows_ as (
  select json_build_object(
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
    'author', (select json_build_object('id', m.id, 'name', m.name, 'role', m.role, 'photo', m.photo_path)
                 from members m where m.id = p.author_id),
    'photos', (select coalesce(json_agg(f.path order by f.sort), '[]'::json)
                 from post_photos f where f.post_id = p.id),
    'comment_count', (select count(*)::int from comments c
                       where c.post_id = p.id and not c.hidden),
    -- 카드 안에 바로 보여줄 최근 댓글 2개
    'recent_comments', (select coalesce(json_agg(j order by at), '[]'::json) from (
         select json_build_object(
                  'id', c.id, 'created_at', c.created_at, 'body', c.body,
                  'mine', c.author_id = (select id from me_),
                  'author', (select m.name from members m where m.id = c.author_id)) as j,
                c.created_at as at
           from comments c
          where c.post_id = p.id and not c.hidden
          order by c.created_at desc limit 2) y),
    'reactions', (select coalesce(json_object_agg(k, n), '{}'::json) from (
                    select kind as k, count(*)::int as n from reactions r
                     where r.post_id = p.id group by kind) z),
    'my_reactions', (select coalesce(json_agg(r.kind), '[]'::json) from reactions r
                      where r.post_id = p.id and r.member_id = (select id from me_)),
    /* 퀴즈는 발표 전까지 정답도 분포도 내보내지 않는다.
       내가 뭘 골랐는지만 돌려준다 — 분포가 곧 정답 힌트가 되기 때문이다. */
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
              from polls q where q.post_id = p.id)
  ) as j, p.created_at
  from pick p
)
select case when not is_member() then null else
  json_build_object(
    'rows',   (select coalesce(json_agg(j order by created_at desc), '[]'::json) from rows_),
    'cursor', (select min(created_at) from rows_),
    /* 고정 공지는 어떤 필터에서든 맨 위에. 최신순 최대 3개 */
    'pinned', case when p_cursor is null then (
                select coalesce(json_agg(json_build_object(
                         'id', z.id, 'body', z.body, 'created_at', z.created_at,
                         'author', z.who) order by z.created_at desc), '[]'::json)
                  from (select p.id, p.body, p.created_at,
                               (select m.name from members m where m.id = p.author_id) as who
                          from posts p
                         where p.type = 'notice' and p.pinned and not p.hidden
                         order by p.created_at desc limit 3) z) end,
    'pinned_total', case when p_cursor is null then (
                select count(*)::int from posts p
                 where p.type = 'notice' and p.pinned and not p.hidden) end
  )
end;
$$;

revoke all on function feed(timestamptz, text, text, int) from public, anon;
grant execute on function feed(timestamptz, text, text, int) to authenticated;


-- ------------------------------------------------------------
-- 8) 댓글 읽기 — 이름·역할만
-- ------------------------------------------------------------
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
       'author', (select json_build_object('id', m.id, 'name', m.name,
                         'role', m.role, 'photo', m.photo_path)
                    from members m where m.id = c.author_id))
       order by c.created_at)
       from comments c where c.post_id = p_post), '[]'::json)
  end;
$$;

revoke all on function post_comments(uuid) from public, anon;
grant execute on function post_comments(uuid) to authenticated;


-- ------------------------------------------------------------
-- 9) 누가 이 반응을 눌렀나 (길게 누르면 보는 목록) — 이름만
-- ------------------------------------------------------------
create or replace function reaction_who(p_post uuid, p_kind text)
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else coalesce(
    (select json_agg(m.name order by m.name)
       from reactions r join members m on m.id = r.member_id
      where r.post_id = p_post and r.kind = p_kind), '[]'::json)
  end;
$$;

revoke all on function reaction_who(uuid, text) from public, anon;
grant execute on function reaction_who(uuid, text) to authenticated;


-- ------------------------------------------------------------
-- 10) 사진 보관함 — 비공개 버킷. 구성원만 보고, 올린 사람만 지운다.
--     community = 후기 사진 · avatars = 프로필 사진(G단계)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
     values ('community', 'community', false)
on conflict (id) do update set public = false;

insert into storage.buckets (id, name, public)
     values ('avatars', 'avatars', false)
on conflict (id) do update set public = false;

drop policy if exists "community read"   on storage.objects;
drop policy if exists "community write"  on storage.objects;
drop policy if exists "community delete" on storage.objects;

create policy "community read" on storage.objects for select to authenticated
  using (bucket_id in ('community', 'avatars') and is_member());

create policy "community write" on storage.objects for insert to authenticated
  with check (bucket_id in ('community', 'avatars') and is_member());

create policy "community delete" on storage.objects for delete to authenticated
  using (bucket_id in ('community', 'avatars')
         and (owner = auth.uid() or is_admin()));


-- ------------------------------------------------------------
-- 11) 누가 이 선택지를 골랐나 — 이름만. 익명 투표면 아무것도 안 준다.
-- ------------------------------------------------------------
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
      (select json_agg(m.name order by m.name)
         from poll_votes v join members m on m.id = v.member_id
        where v.option_id = p_option), '[]'::json)
  end;
$$;

revoke all on function poll_who(uuid) from public, anon;
grant execute on function poll_who(uuid) to authenticated;


-- ------------------------------------------------------------
-- 12) 로그인한 구성원의 봉사 신청 — 이름이 아니라 내 id 로 한다.
--     이름으로 맞추면 동명이인이 있을 때 남의 신청이 내 것으로 보인다.
-- ------------------------------------------------------------
create or replace function my_signups()
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else coalesce(
    (select json_agg(a.event_id) from attendance a where a.member_id = my_member_id()),
    '[]'::json) end;
$$;

create or replace function event_signup_me(p_event uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  me_  uuid := my_member_id();
  ev   events%rowtype;
  cnt  int;
begin
  if me_ is null then return 'nomatch'; end if;
  select * into ev from events where id = p_event;
  if not found then return 'noevent'; end if;
  if ev.signup_open_at is not null and now() < ev.signup_open_at then return 'before'; end if;
  if exists (select 1 from attendance where event_id = p_event and member_id = me_) then return 'dup'; end if;
  select count(*) into cnt from attendance where event_id = p_event;
  if coalesce(ev.capacity, 0) > 0 and cnt >= ev.capacity then return 'full'; end if;
  insert into attendance (event_id, member_id, hours) values (p_event, me_, 0);
  return 'ok';
end;
$$;

create or replace function event_cancel_me(p_event uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare me_ uuid := my_member_id();
begin
  if me_ is null then return 'nomatch'; end if;
  delete from attendance where event_id = p_event and member_id = me_;
  return 'ok';
end;
$$;

revoke all on function my_signups()            from public, anon;
revoke all on function event_signup_me(uuid)   from public, anon;
revoke all on function event_cancel_me(uuid)   from public, anon;
grant execute on function my_signups()          to authenticated;
grant execute on function event_signup_me(uuid) to authenticated;
grant execute on function event_cancel_me(uuid) to authenticated;


-- ------------------------------------------------------------
-- 13) 새 소식 — 내 글에 달린 댓글·반응. 내가 한 것은 빼고.
-- ------------------------------------------------------------
create or replace function my_news(p_limit int default 30)
returns json
language sql security definer stable
set search_path = public
as $$
with me_ as (select my_member_id() as id),
mine as (select id, type, body from posts where author_id = (select id from me_)),
rows_ as (
  select 'comment' as kind, c.created_at, c.post_id,
         (select m.name from members m where m.id = c.author_id) as who,
         c.body as detail, null::text as kindly
    from comments c join mine on mine.id = c.post_id
   where c.author_id <> (select id from me_) and not c.hidden
  union all
  select 'reaction', r.created_at, r.post_id,
         (select m.name from members m where m.id = r.member_id),
         null, r.kind
    from reactions r join mine on mine.id = r.post_id
   where r.member_id <> (select id from me_)
)
select case when not is_member() then null else coalesce(
  (select json_agg(json_build_object(
     'kind', kind, 'at', created_at, 'post_id', post_id,
     'who', who, 'detail', detail, 'react', kindly) order by created_at desc)
     from (select * from rows_ order by created_at desc
            limit greatest(1, least(coalesce(p_limit, 30), 100))) z),
  '[]'::json) end;
$$;

revoke all on function my_news(int) from public, anon;
grant execute on function my_news(int) to authenticated;


-- ------------------------------------------------------------
-- 14) 내가 누구인지 — 프로필에 쓸 사진·가입일까지 (연락처·학번은 여전히 안 준다)
-- ------------------------------------------------------------
create or replace function me()
returns json
language sql security definer stable
set search_path = public
as $$
  select case
    when auth.uid() is null then json_build_object('login', false)
    else coalesce(
      (select json_build_object(
                'login', true, 'linked', true,
                'id', m.id, 'name', m.name, 'role', m.role, 'status', m.status,
                'photo', m.photo_path, 'joined_on', m.joined_on)
         from members m where m.auth_user_id = auth.uid()),
      json_build_object('login', true, 'linked', false))
  end;
$$;

revoke all on function me() from public;
grant execute on function me() to anon, authenticated;


-- ------------------------------------------------------------
-- 15) 프로필 사진 바꾸기 — 본인만. 운영진은 지울 수만 있다.
-- ------------------------------------------------------------
create or replace function set_my_photo(p_path text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare me_ uuid := my_member_id();
begin
  if me_ is null then return false; end if;
  update members set photo_path = nullif(p_path, '') where id = me_;
  return true;
end;
$$;

create or replace function clear_photo(p_member uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then return false; end if;
  update members set photo_path = null where id = p_member;
  return true;
end;
$$;

revoke all on function set_my_photo(text)  from public, anon;
revoke all on function clear_photo(uuid)   from public, anon;
grant execute on function set_my_photo(text) to authenticated;
grant execute on function clear_photo(uuid)  to authenticated;


-- ------------------------------------------------------------
-- 16) 대기 신청
--     정원이 차면 대기로 받고, 자리가 나면 먼저 신청한 사람이 자동으로 올라간다.
-- ------------------------------------------------------------
create table if not exists event_waitlist (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event_id   uuid not null references events(id)  on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  unique (event_id, member_id)
);
create index if not exists waitlist_ev_idx on event_waitlist (event_id, created_at);

alter table event_waitlist enable row level security;
drop policy if exists "wait read" on event_waitlist;
drop policy if exists "wait mine" on event_waitlist;
create policy "wait read" on event_waitlist for select to authenticated using (is_member());
create policy "wait mine" on event_waitlist for all to authenticated
  using (member_id = my_member_id()) with check (member_id = my_member_id());

create or replace function waitlist_join(p_event uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare
  me_ uuid := my_member_id();
  ev  events%rowtype;
  cnt int;
begin
  if me_ is null then return 'nomatch'; end if;
  select * into ev from events where id = p_event;
  if not found then return 'noevent'; end if;
  if exists (select 1 from attendance where event_id = p_event and member_id = me_) then return 'dup'; end if;
  select count(*) into cnt from attendance where event_id = p_event;
  /* 아직 자리가 있으면 대기가 아니라 바로 신청이다 */
  if coalesce(ev.capacity, 0) = 0 or cnt < ev.capacity then return 'notfull'; end if;
  insert into event_waitlist (event_id, member_id) values (p_event, me_)
    on conflict (event_id, member_id) do nothing;
  return 'ok';
end;
$$;

create or replace function waitlist_leave(p_event uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare me_ uuid := my_member_id();
begin
  if me_ is null then return 'nomatch'; end if;
  delete from event_waitlist where event_id = p_event and member_id = me_;
  return 'ok';
end;
$$;

/* 내가 대기 중인 일정과 몇 번째인지 */
create or replace function my_waitlist()
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else coalesce(
    (select json_agg(json_build_object('event_id', w.event_id, 'pos', w.pos))
       from (select event_id, member_id,
                    row_number() over (partition by event_id order by created_at) as pos
               from event_waitlist) w
      where w.member_id = my_member_id()), '[]'::json) end;
$$;

/* 자리가 나면 먼저 신청한 대기자를 자동으로 올린다 */
create or replace function promote_waitlist()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  ev   events%rowtype;
  cnt  int;
  nxt  uuid;
begin
  select * into ev from events where id = old.event_id;
  if not found or coalesce(ev.capacity, 0) = 0 then return old; end if;
  select count(*) into cnt from attendance where event_id = old.event_id;
  if cnt >= ev.capacity then return old; end if;

  select member_id into nxt from event_waitlist
   where event_id = old.event_id order by created_at limit 1;
  if nxt is null then return old; end if;

  insert into attendance (event_id, member_id, hours) values (old.event_id, nxt, 0)
    on conflict (event_id, member_id) do nothing;
  delete from event_waitlist where event_id = old.event_id and member_id = nxt;
  return old;
end;
$$;

drop trigger if exists promote_waitlist_trg on attendance;
create trigger promote_waitlist_trg after delete on attendance
  for each row execute function promote_waitlist();

revoke all on function waitlist_join(uuid)  from public, anon;
revoke all on function waitlist_leave(uuid) from public, anon;
revoke all on function my_waitlist()        from public, anon;
grant execute on function waitlist_join(uuid)  to authenticated;
grant execute on function waitlist_leave(uuid) to authenticated;
grant execute on function my_waitlist()        to authenticated;


-- ------------------------------------------------------------
-- 17) 알림거리 — 시스템이 남기는 소식 (대기 승급 등). 본인만 본다.
-- ------------------------------------------------------------
create table if not exists member_notices (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id  uuid not null references members(id) on delete cascade,
  kind       text not null,
  detail     text,
  event_id   uuid references events(id) on delete cascade
);
create index if not exists notices_mem_idx on member_notices (member_id, created_at desc);

alter table member_notices enable row level security;
drop policy if exists "notices mine" on member_notices;
create policy "notices mine" on member_notices for select to authenticated
  using (member_id = my_member_id());


-- ------------------------------------------------------------
-- 18) 대기 자동 승급을 안전하게
--     확정됐거나 지난 봉사에서는 올리지 않는다.
--     확정 뒤 명단을 고치려고 사람을 빼면 안 간 사람이 실적에 잡힌다.
-- ------------------------------------------------------------
create or replace function promote_waitlist()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  ev   events%rowtype;
  cnt  int;
  nxt  uuid;
begin
  select * into ev from events where id = old.event_id;
  if not found or coalesce(ev.capacity, 0) = 0 then return old; end if;

  /* 확정된 봉사·지난 봉사는 명단을 건드려도 대기자를 올리지 않는다 */
  if ev.confirmed_at is not null then return old; end if;
  if ev.date < current_date then return old; end if;

  select count(*) into cnt from attendance where event_id = old.event_id;
  if cnt >= ev.capacity then return old; end if;

  select member_id into nxt from event_waitlist
   where event_id = old.event_id order by created_at limit 1;
  if nxt is null then return old; end if;

  insert into attendance (event_id, member_id, hours) values (old.event_id, nxt, 0)
    on conflict (event_id, member_id) do nothing;
  delete from event_waitlist where event_id = old.event_id and member_id = nxt;

  insert into member_notices (member_id, kind, detail, event_id)
       values (nxt, 'promoted',
               to_char(ev.date, 'MM월 DD일') || ' ' || coalesce(ev.place, '봉사'),
               old.event_id);
  return old;
end;
$$;


-- ------------------------------------------------------------
-- 19) 새 소식에 시스템 소식도 함께
-- ------------------------------------------------------------
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
         c.body as detail, null::text as kindly
    from comments c join mine on mine.id = c.post_id
   where c.author_id <> (select id from me_) and not c.hidden
  union all
  select 'reaction', r.created_at, r.post_id,
         (select m.name from members m where m.id = r.member_id),
         null, r.kind
    from reactions r join mine on mine.id = r.post_id
   where r.member_id <> (select id from me_)
  union all
  select n.kind, n.created_at, null::uuid, null::text, n.detail, null::text
    from member_notices n where n.member_id = (select id from me_)
)
select case when not is_member() then null else coalesce(
  (select json_agg(json_build_object(
     'kind', kind, 'at', created_at, 'post_id', post_id,
     'who', who, 'detail', detail, 'react', kindly) order by created_at desc)
     from (select * from rows_ order by created_at desc
            limit greatest(1, least(coalesce(p_limit, 30), 100))) z),
  '[]'::json) end;
$$;

revoke all on function my_news(int) from public, anon;
grant execute on function my_news(int) to authenticated;


-- ------------------------------------------------------------
-- 20) 봉사 탭을 한 번에 — 일정마다 따로 묻지 않는다
--     다가오는 일정 · 신청 인원 · 내 신청 · 내 대기 순번을 한 번에 준다.
-- ------------------------------------------------------------
create or replace function vol_board(p_days int default 120)
returns json
language sql security definer stable
set search_path = public
as $$
with me_ as (select my_member_id() as id),
soon as (
  select e.*,
         (select count(*)::int from attendance a where a.event_id = e.id) as taken,
         exists (select 1 from attendance a
                  where a.event_id = e.id and a.member_id = (select id from me_)) as mine,
         (select w.pos from (
            select event_id, member_id,
                   row_number() over (partition by event_id order by created_at) as pos
              from event_waitlist) w
           where w.event_id = e.id and w.member_id = (select id from me_)) as wait_pos
    from events e
   where e.date >= current_date
     and e.date <= current_date + coalesce(p_days, 120)
),
past as (
  select e.id, e.date, e.place, e.title, e.confirmed_at,
         (select count(*)::int from posts p
           where p.type = 'review' and p.event_id = e.id and not p.hidden) as reviews,
         exists (select 1 from attendance a
                  where a.event_id = e.id and a.member_id = (select id from me_)) as went
    from events e
   where e.date < current_date
   order by e.date desc limit 12
)
select case when not is_member() then null else
  json_build_object(
    'soon', (select coalesce(json_agg(json_build_object(
               'id', id, 'date', date, 'title', title, 'place', place,
               'start_time', start_time, 'capacity', capacity,
               'taken', taken, 'mine', mine, 'wait_pos', wait_pos)
               order by date), '[]'::json) from soon),
    'past', (select coalesce(json_agg(json_build_object(
               'id', id, 'date', date, 'place', place,
               'confirmed', confirmed_at is not null,
               'reviews', reviews, 'went', went)
               order by date desc), '[]'::json) from past)
  )
end;
$$;

revoke all on function vol_board(int) from public, anon;
grant execute on function vol_board(int) to authenticated;


-- ------------------------------------------------------------
-- 21) 글 종류에 「자유글」 추가, 글 속 투표에 정답(퀴즈)
--     공식 투표(type='poll')는 투표 탭에만, 글 속 투표는 피드에만 보인다.
-- ------------------------------------------------------------
alter table posts drop constraint if exists posts_type_check;
alter table posts add constraint posts_type_check
  check (type in ('review', 'poll', 'notice', 'free'));

-- 칸은 위에서 이미 만들었다. 여기서는 어느 선택지인지 이어 주기만 한다
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'polls_answer_option_fk') then
    alter table polls add constraint polls_answer_option_fk
      foreign key (answer_option_id) references poll_options(id) on delete set null;
  end if;
end $$;

-- 공지·공식투표는 운영진만. 자유글·후기는 모든 구성원.
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
  if new.pinned and not is_admin() then
    raise exception '고정은 운영진만 할 수 있어요';
  end if;
  if tg_op = 'UPDATE' and new.hidden is distinct from old.hidden
     and not is_admin() and old.author_id <> my_member_id() then
    raise exception '숨기기는 운영진만 할 수 있어요';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_guard_trg on posts;
create trigger posts_guard_trg before insert or update on posts
  for each row execute function posts_guard();


-- ------------------------------------------------------------
-- 22) 퀴즈 — 같은 투표 구조를 쓴다
--     answer_option_id 가 있으면 퀴즈. 발표 전에는 정답도 분포도 내보내지 않는다.
-- ------------------------------------------------------------
-- 발표 전에는 답을 바꿀 수 있고, 발표 뒤에는 못 바꾼다
create or replace function poll_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare q polls%rowtype;
begin
  select * into q from polls where post_id = new.post_id;
  if q.revealed_at is not null then
    raise exception '정답이 발표된 퀴즈예요';
  end if;
  if q.closed_at is not null then
    raise exception '마감된 설문이에요';
  end if;
  return new;
end;
$$;

drop trigger if exists poll_guard_trg on poll_votes;
create trigger poll_guard_trg before insert on poll_votes
  for each row execute function poll_guard();

-- 정답 발표. 예약 시각이 지났거나, 만든 사람이 「지금 발표하기」를 누르면.
-- 참여한 사람마다 새 소식을 남긴다. 두 번 발표되지 않는다.
create or replace function reveal_quiz(p_post uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  q polls%rowtype;
  owner uuid;
  ans text;
  n int;
begin
  if not is_member() then return null; end if;
  select * into q from polls where post_id = p_post;
  if q.post_id is null or q.answer_option_id is null then return null; end if;
  if q.revealed_at is not null then return json_build_object('ok', true, 'already', true); end if;

  select author_id into owner from posts where id = p_post;
  /* 예약 시각이 지났으면 누가 열어도 발표된다.
     아직이면 만든 사람만 「지금 발표하기」를 할 수 있다. */
  if coalesce(q.reveal_at, now()) > now() and owner <> my_member_id() then
    return json_build_object('ok', false, 'why', 'early');
  end if;

  update polls set revealed_at = now() where post_id = p_post and revealed_at is null;
  if not found then return json_build_object('ok', true, 'already', true); end if;

  select label into ans from poll_options where id = q.answer_option_id;

  insert into member_notices (member_id, kind, body, post_id)
  select v.member_id, 'quiz',
         case when v.option_id = q.answer_option_id
              then '정답이에요! ' || coalesce(ans, '') || ' 였어요 🐾'
              else '아쉬워요! 정답은 ' || coalesce(ans, '') || ' 였어요' end,
         p_post
    from (select distinct on (member_id) member_id, option_id
            from poll_votes where post_id = p_post
           order by member_id, created_at) v;
  get diagnostics n = row_count;

  return json_build_object('ok', true, 'told', n);
end;
$$;

revoke all on function reveal_quiz(uuid) from public, anon;
grant execute on function reveal_quiz(uuid) to authenticated;


-- ------------------------------------------------------------
-- 23) 명부 연결 날짜 — 운영진 화면에서 누가 들어왔는지 보려고
--     읽기는 기존 운영진 정책 그대로. 새 공개 경로를 만들지 않는다.
-- ------------------------------------------------------------
alter table members add column if not exists linked_at timestamptz;

-- claim_member 가 이어줄 때 날짜를 같이 남긴다 (schema.sql 원본에서 이 줄만 고침)
create or replace function claim_member(p_name text, p_last4 text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  m     members%rowtype;
  n     int;
  t     claim_attempts%rowtype;
  digits text;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'why', 'nologin');
  end if;

  -- 이미 이어져 있으면 그대로
  select * into m from members where auth_user_id = auth.uid();
  if found then
    return json_build_object('ok', true, 'name', m.name, 'role', m.role, 'already', true);
  end if;

  -- 너무 많이 틀렸으면 잠근다
  select * into t from claim_attempts where auth_user_id = auth.uid();
  if found and t.tries >= 5 and t.last_at > now() - interval '1 hour' then
    return json_build_object('ok', false, 'why', 'locked');
  end if;

  digits := regexp_replace(coalesce(p_last4, ''), '[^0-9]', '', 'g');

  select count(*) into n from members
   where btrim(name) = btrim(p_name)
     and status <> 'left'
     and right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 4) = digits
     and digits <> '';

  if n <> 1 then
    insert into claim_attempts (auth_user_id, tries, last_at)
    values (auth.uid(), 1, now())
    on conflict (auth_user_id) do update
      set tries = case when claim_attempts.last_at > now() - interval '1 hour'
                       then claim_attempts.tries + 1 else 1 end,
          last_at = now();
    return json_build_object('ok', false, 'why', case when n = 0 then 'nomatch' else 'many' end);
  end if;

  select * into m from members
   where btrim(name) = btrim(p_name)
     and status <> 'left'
     and right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 4) = digits;

  -- 이미 다른 카카오 계정이 그 이름을 쓰고 있으면 막는다
  if m.auth_user_id is not null then
    return json_build_object('ok', false, 'why', 'taken');
  end if;

  update members set auth_user_id = auth.uid(),
                     linked_at = coalesce(linked_at, now())
   where id = m.id;
  delete from claim_attempts where auth_user_id = auth.uid();

  return json_build_object('ok', true, 'name', m.name, 'role', m.role);
end $$;

revoke all on function claim_member(text, text) from public, anon;
grant execute on function claim_member(text, text) to authenticated;
