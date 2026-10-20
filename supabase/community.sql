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
  closed_at  timestamptz
);

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
    raise exception '투표는 운영진만 만들 수 있어요';
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
    'poll', (select json_build_object(
               'question', q.question, 'multi', q.multi, 'anonymous', q.anonymous,
               'closes_at', q.closes_at, 'closed_at', q.closed_at,
               'options', (select coalesce(json_agg(json_build_object(
                             'id', o.id, 'label', o.label,
                             'votes', (select count(*)::int from poll_votes v where v.option_id = o.id),
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
    'pinned', case when p_cursor is null then (
                select json_build_object(
                  'id', p.id, 'body', p.body, 'created_at', p.created_at,
                  'author', (select m.name from members m where m.id = p.author_id))
                  from posts p
                 where p.type = 'notice' and p.pinned and not p.hidden
                 order by p.created_at desc limit 1) end
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
