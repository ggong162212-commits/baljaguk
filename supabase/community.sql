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
/* 이미 만들어진 표에는 create table 이 건너뛴다 — 칸을 따로 더해 준다.
   (실서버에 posts 가 먼저 있었고 insta_ok 가 없어서 2026-10-20 배포가 멈췄다) */
alter table posts add column if not exists insta_ok boolean not null default false;

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
-- 처음이에요 Q&A (J2) — feed() 가 쓰므로 여기서 먼저 만든다
alter table posts add column if not exists is_question boolean not null default false;
alter table posts add column if not exists best_comment_id uuid references comments(id) on delete set null;
alter table posts add column if not exists solved_at timestamptz;

create index if not exists posts_question_idx on posts (is_question, created_at desc)
  where is_question;

create table if not exists reactions (
  post_id   uuid not null references posts(id) on delete cascade,
  member_id uuid not null references members(id) on delete cascade,
  kind      text not null check (kind in ('heart','paw','haha','moved','clap')),
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

-- 오늘 만난 친구 (H1) — feed() 가 쓰므로 여기서 먼저 만든다
create table if not exists animals (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  place      text not null,                 -- 어느 보호소 아이인지
  name       text not null,
  adopted_at date,                          -- 입양 간 날 (있으면 배지)
  note       text,
  unique (place, name)
);
alter table animals enable row level security;

create table if not exists post_animals (
  post_id   uuid not null references posts(id)   on delete cascade,
  animal_id uuid not null references animals(id) on delete cascade,
  primary key (post_id, animal_id)
);
alter table post_animals enable row level security;

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
    /* 퀴즈는 발표 전까지 정답도 분포도 내보내지 않는다.
       내가 뭘 골랐는지만 돌려준다 — 분포가 곧 정답 힌트가 되기 때문이다. */
    /* 질문이면 답 수와 고정된 답 한 줄을 같이 */
    'question', p.is_question,
    'solved', p.solved_at is not null,
    'answers', case when p.is_question then
                 (select count(*)::int from comments c
                   where c.post_id = p.id and not c.hidden) end,
    'best', case when p.best_comment_id is not null then
              (select left(c.body, 60) from comments c where c.id = p.best_comment_id) end,
    'best_id', p.best_comment_id,
    /* 오늘 만난 친구 — 후기에 붙은 아이들 */
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


-- ------------------------------------------------------------
-- 24) 후기 남기기 권유 — 다녀왔는데 아직 안 쓴 봉사 하나
--     봉사 날부터 7일까지만. 여러 개면 가장 최근 하나.
--     확정됐으면 확정 명단, 확정 전이면 신청자 (대기자는 뺀다).
-- ------------------------------------------------------------
create or replace function my_review_prompt()
returns json
language sql security definer stable
set search_path = public
as $$
with me_ as (select my_member_id() as id)
select case when not is_member() then null else (
  select json_build_object(
           'event_id', e.id, 'date', e.date, 'place', e.place,
           'title', e.title, 'confirmed', e.confirmed_at is not null)
    from attendance a
    join events e on e.id = a.event_id
   where a.member_id = (select id from me_)
     and e.date <= current_date
     and e.date >= current_date - 7
     /* 이미 쓴 봉사는 권하지 않는다 */
     and not exists (
       select 1 from posts p
        where p.type = 'review'
          and p.event_id = e.id
          and p.author_id = (select id from me_)
          and not p.hidden)
   order by e.date desc
   limit 1) end;
$$;

revoke all on function my_review_prompt() from public, anon;
grant execute on function my_review_prompt() to authenticated;


-- ------------------------------------------------------------
-- 25) 지난 설문을 각자 볼 수 있게
--
--  member_1365 는 이미 member_id 를 갖고 있다 (명부와 이어져 있다).
--  이어 줄 것은 survey_responses 뿐이다 — 옛 응답은 이름으로만 들어와 있다.
--  같은 이름이 둘 이상이면 절대 자동으로 잇지 않는다
--  — 남의 응답이 보이는 사고를 막으려고.
-- ------------------------------------------------------------
alter table survey_responses add column if not exists member_id uuid references members(id) on delete set null;
create index if not exists survey_member_idx on survey_responses (member_id);

-- 이름이 명부에 딱 하나일 때만 잇는다 (2026-10-20 읽기 조회: 68건 전부 하나였다)
with one as (
  /* 한 명뿐인 묶음만 고르므로 그 하나를 꺼낸다 (min(uuid) 는 없는 함수다) */
  select btrim(name) as n, (array_agg(id))[1] as id
    from members where status <> 'left'
   group by btrim(name) having count(*) = 1
)
update survey_responses s set member_id = one.id
  from one where s.member_id is null and btrim(s.name) = one.n;

-- 내 지난 응답 — 내 것만. 이름·연락처는 돌려주지 않는다.
create or replace function my_survey_history()
returns json
language sql security definer stable
set search_path = public
as $$
with me_ as (select my_member_id() as id)
select case when not is_member() then null else
  json_build_object(
    'open', coalesce((select survey_open from club_settings where id = 1), false),
    'survey', (select coalesce(json_agg(json_build_object(
                 'id', s.id, 'at', s.created_at, 'topic', s.topic,
                 'party', s.party, 'station', s.station, 'opinion', s.opinion)
                 order by s.created_at desc), '[]'::json)
                from survey_responses s
               where s.member_id = (select id from me_)),
    'id1365', (select coalesce(json_agg(json_build_object(
                 'id', t.id, 'at', t.updated_at,
                 'portal_id', t.portal_id, 'birth', t.birth, 'student_id', t.student_id)
                 order by t.updated_at desc), '[]'::json)
                from member_1365 t
               where t.member_id = (select id from me_)),
    /* 이름이 겹쳐 아직 못 이은 것이 있으면 운영진에게 물어보라고 알린다 */
    'ambiguous', exists (
       select 1 from members m
        where m.id = (select id from me_)
          and (select count(*) from members x
                where btrim(x.name) = btrim(m.name) and x.status <> 'left') > 1)
  )
end;
$$;

revoke all on function my_survey_history() from public, anon;
grant execute on function my_survey_history() to authenticated;

-- 내 응답 고치기 — 설문이 열려 있을 때만, 내 것만
create or replace function my_survey_update(p_id uuid, p_party text, p_station text, p_opinion text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
declare ok boolean;
begin
  if not is_member() then return false; end if;
  if not coalesce((select survey_open from club_settings where id = 1), false) then
    raise exception '설문이 마감됐어요';
  end if;
  if p_party is not null and p_party not in ('yes', 'no', 'maybe') then
    raise exception '참석 답이 올바르지 않아요';
  end if;

  update survey_responses
     set party   = coalesce(p_party, party),
         station = coalesce(btrim(p_station), station),
         opinion = coalesce(btrim(p_opinion), opinion)
   where id = p_id and member_id = my_member_id()
  returning true into ok;

  return coalesce(ok, false);
end;
$$;

revoke all on function my_survey_update(uuid, text, text, text) from public, anon;
grant execute on function my_survey_update(uuid, text, text, text) to authenticated;


-- ============================================================
--  H. 더하기 — 오늘 만난 친구 · 신고 · 운영진 할 일 · 출석 체크
-- ============================================================

-- ------------------------------------------------------------
-- H1) 오늘 만난 친구 — 후기에 보호소 아이 이름을 붙인다
-- ------------------------------------------------------------
-- 표는 위(설문·투표 표 옆)에서 먼저 만든다 — feed() 가 아래에서 쓴다

drop policy if exists "animals read"  on animals;
drop policy if exists "animals write" on animals;
drop policy if exists "animals admin" on animals;
create policy "animals read"  on animals for select to authenticated using (is_member());
-- 후기를 쓰다 없는 이름을 더할 수 있어야 한다
create policy "animals write" on animals for insert to authenticated with check (is_member());
create policy "animals admin" on animals for update to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "post_animals read"  on post_animals;
drop policy if exists "post_animals write" on post_animals;
create policy "post_animals read" on post_animals for select to authenticated using (is_member());
create policy "post_animals write" on post_animals for all to authenticated
  using (exists (select 1 from posts p where p.id = post_id
                  and (p.author_id = my_member_id() or is_admin())))
  with check (exists (select 1 from posts p where p.id = post_id
                  and (p.author_id = my_member_id() or is_admin())));

-- 보호소별 아이 목록 (후기 수와 함께)
create or replace function animals_at(p_place text default null)
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_member() then null else
  (select coalesce(json_agg(json_build_object(
            'id', a.id, 'place', a.place, 'name', a.name,
            'adopted', a.adopted_at is not null, 'adopted_at', a.adopted_at,
            'posts', (select count(*)::int from post_animals pa
                       join posts p on p.id = pa.post_id
                      where pa.animal_id = a.id and not p.hidden))
            order by (a.adopted_at is not null), a.name), '[]'::json)
     from animals a
    where p_place is null or a.place = p_place)
end;
$$;

revoke all on function animals_at(text) from public, anon;
grant execute on function animals_at(text) to authenticated;

-- ------------------------------------------------------------
-- H7) 신고 — 신고한 사람은 운영진만 본다
-- ------------------------------------------------------------
create table if not exists reports (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  reporter_id uuid references members(id) on delete set null,
  post_id     uuid references posts(id)    on delete cascade,
  comment_id  uuid references comments(id) on delete cascade,
  reason      text not null default '',
  done_at     timestamptz,
  done_by     uuid references members(id) on delete set null,
  check (post_id is not null or comment_id is not null)
);
alter table reports enable row level security;
create index if not exists reports_open_idx on reports (done_at, created_at desc);

drop policy if exists "reports write" on reports;
drop policy if exists "reports admin" on reports;
-- 낸 사람도 자기 신고를 다시 읽지 못한다. 운영진만 본다.
create policy "reports write" on reports for insert to authenticated
  with check (is_member() and reporter_id = my_member_id());
create policy "reports admin" on reports for all to authenticated
  using (is_admin()) with check (is_admin());

create or replace function report_send(p_post uuid, p_comment uuid, p_reason text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_member() then return false; end if;
  if p_post is null and p_comment is null then return false; end if;
  /* 같은 사람이 같은 글을 여러 번 신고해도 한 번만 쌓인다 */
  if exists (select 1 from reports r
              where r.reporter_id = my_member_id()
                and r.done_at is null
                and r.post_id is not distinct from p_post
                and r.comment_id is not distinct from p_comment) then
    return true;
  end if;
  insert into reports (reporter_id, post_id, comment_id, reason)
  values (my_member_id(), p_post, p_comment, coalesce(btrim(p_reason), ''));
  return true;
end;
$$;

revoke all on function report_send(uuid, uuid, text) from public, anon;
grant execute on function report_send(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------
-- H6) 운영진 할 일 — 확정 안 한 봉사 · 가입 대기 · 신고
-- ------------------------------------------------------------
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
    'reports',     (select count(*)::int from reports r where r.done_at is null)
  )
end;
$$;
/* 받은 의견과 건의는 그 표를 만든 뒤에 더한다 — 이 파일 맨 아래에서 다시 쓴다 */

revoke all on function admin_todo() from public, anon;
grant execute on function admin_todo() to authenticated;


-- ------------------------------------------------------------
-- H5) 현장 출석 체크 — 그날만 쓰는 번호
--     부원이 찍으면 「현장 참석」이 남는다.
--     실적·적립은 지금처럼 운영진이 확정해야 쌓인다 (여기선 안 쌓인다).
-- ------------------------------------------------------------
alter table events add column if not exists checkin_code text;

create table if not exists checkins (
  event_id   uuid not null references events(id)  on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, member_id)
);
alter table checkins enable row level security;

drop policy if exists "checkins read"  on checkins;
drop policy if exists "checkins admin" on checkins;
create policy "checkins read"  on checkins for select to authenticated using (is_member());
create policy "checkins admin" on checkins for all to authenticated
  using (is_admin()) with check (is_admin());

-- 운영진이 그날 번호를 연다 (여섯 자리)
create or replace function checkin_open(p_event uuid)
returns text
language plpgsql security definer
set search_path = public
as $$
declare c text;
begin
  if not is_admin() then return null; end if;
  select checkin_code into c from events where id = p_event;
  if c is null then
    c := lpad((floor(random() * 1000000))::int::text, 6, '0');
    update events set checkin_code = c where id = p_event;
  end if;
  return c;
end;
$$;

-- 부원이 찍는다. 그날 열린 봉사에만, 번호가 맞아야 한다.
create or replace function checkin_do(p_event uuid, p_code text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare e events%rowtype;
begin
  if not is_member() then return json_build_object('ok', false, 'why', 'nologin'); end if;
  select * into e from events where id = p_event;
  if e.id is null then return json_build_object('ok', false, 'why', 'noevent'); end if;
  if e.date <> current_date then return json_build_object('ok', false, 'why', 'notToday'); end if;
  if e.checkin_code is null or e.checkin_code <> btrim(p_code) then
    return json_build_object('ok', false, 'why', 'wrong');
  end if;

  insert into checkins (event_id, member_id) values (p_event, my_member_id())
  on conflict do nothing;

  return json_build_object('ok', true, 'place', e.place, 'date', e.date);
end;
$$;

revoke all on function checkin_open(uuid) from public, anon;
revoke all on function checkin_do(uuid, text) from public, anon;
grant execute on function checkin_open(uuid) to authenticated;
grant execute on function checkin_do(uuid, text) to authenticated;


-- 신고 목록 (운영진만). 글 내용과 신고한 사람 이름을 같이 준다.
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
            'body', coalesce(
                      (select p.body from posts p    where p.id = r.post_id),
                      (select c.body from comments c where c.id = r.comment_id)))
            order by r.created_at desc), '[]'::json)
     from reports r where r.done_at is null)
end;
$$;

create or replace function report_done(p_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then return false; end if;
  update reports set done_at = now(), done_by = my_member_id()
   where id = p_id and done_at is null;
  return true;
end;
$$;

revoke all on function reports_open() from public, anon;
revoke all on function report_done(uuid) from public, anon;
grant execute on function reports_open() to authenticated;
grant execute on function report_done(uuid) to authenticated;


-- ============================================================
--  E. 알림 — 종류별 끄고 켜기, 보낼 거리 모으기
-- ============================================================

-- 알림 종류를 늘린다. 기존 세 칸(want_notice/comment/reaction)은 그대로 두고 더한다.
alter table push_subscriptions add column if not exists want_post     boolean not null default true;  -- 새 글
alter table push_subscriptions add column if not exists want_reply    boolean not null default true;  -- 대댓글
alter table push_subscriptions add column if not exists want_vol      boolean not null default true;  -- 봉사 열림
alter table push_subscriptions add column if not exists want_promoted boolean not null default true;  -- 대기→신청
alter table push_subscriptions add column if not exists want_poll     boolean not null default true;  -- 설문 마감
alter table push_subscriptions add column if not exists want_quiz     boolean not null default true;  -- 퀴즈 결과
alter table push_subscriptions add column if not exists want_before   boolean not null default true;  -- 봉사 전날
alter table push_subscriptions add column if not exists want_thanks   boolean not null default true;  -- 봉사 감사
alter table push_subscriptions add column if not exists last_seen     timestamptz;

-- 보낼 알림을 쌓아 두는 곳. Edge Function 이 가져가 보낸다.
-- 같은 것을 두 번 보내지 않게 dedupe_key 로 막는다.
create table if not exists push_outbox (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id  uuid references members(id) on delete cascade,  -- null 이면 전체
  kind       text not null,
  title      text not null,
  body       text not null default '',
  url        text,                      -- 누르면 갈 곳
  dedupe_key text unique,
  /* 이 일을 한 사람 — 전체 알림일 때 본인에게는 안 보내려고 */
  actor_id   uuid references members(id) on delete set null,
  sent_at    timestamptz,
  tries      int not null default 0
);
alter table push_outbox add column if not exists actor_id uuid references members(id) on delete set null;
alter table push_outbox enable row level security;
create index if not exists outbox_todo_idx on push_outbox (sent_at, created_at);

-- 아무도 직접 못 읽는다. Edge Function 은 service_role 로 들어온다.
drop policy if exists "outbox admin" on push_outbox;
create policy "outbox admin" on push_outbox for select to authenticated using (is_admin());

-- 알림 설정 읽기·쓰기 (내 기기 것만)
create or replace function push_prefs(p_endpoint text)
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_member() then null else
  (select row_to_json(x) from (
     select want_post, want_comment, want_reply, want_reaction, want_notice,
            want_vol, want_promoted, want_poll, want_quiz, want_before, want_thanks
       from push_subscriptions
      where member_id = my_member_id() and endpoint = p_endpoint) x)
end;
$$;

create or replace function push_prefs_set(p_endpoint text, p_key text, p_on boolean)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_member() then return false; end if;
  /* 칸 이름을 그대로 받지 않는다 — 허용한 것만 */
  if p_key not in ('want_post','want_comment','want_reply','want_reaction','want_notice',
                   'want_vol','want_promoted','want_poll','want_quiz','want_before','want_thanks') then
    raise exception '모르는 알림 종류예요';
  end if;

  execute format(
    'update push_subscriptions set %I = $1 where member_id = $2 and endpoint = $3', p_key)
    using coalesce(p_on, true), my_member_id(), p_endpoint;
  return true;
end;
$$;

revoke all on function push_prefs(text) from public, anon;
revoke all on function push_prefs_set(text, text, boolean) from public, anon;
grant execute on function push_prefs(text) to authenticated;
grant execute on function push_prefs_set(text, text, boolean) to authenticated;

-- 이 기기를 등록한다 (같은 기기면 덮어쓴다)
create or replace function push_subscribe(p_endpoint text, p_p256dh text, p_auth text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_member() then return false; end if;
  insert into push_subscriptions (member_id, endpoint, p256dh, auth)
  values (my_member_id(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set member_id = excluded.member_id,
        p256dh    = excluded.p256dh,
        auth      = excluded.auth;
  return true;
end;
$$;

create or replace function push_unsubscribe(p_endpoint text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  delete from push_subscriptions
   where endpoint = p_endpoint and member_id = my_member_id();
  return true;
end;
$$;

revoke all on function push_subscribe(text, text, text) from public, anon;
revoke all on function push_unsubscribe(text) from public, anon;
grant execute on function push_subscribe(text, text, text) to authenticated;
grant execute on function push_unsubscribe(text) to authenticated;

-- 나에게만 보내 보기 (알림 미리보기)
create or replace function push_test(p_kind text, p_title text, p_body text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_member() then return false; end if;
  insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
  values (my_member_id(), coalesce(p_kind, 'test'),
          coalesce(p_title, '발자국'), coalesce(p_body, ''),
          'me.html', 'test:' || my_member_id() || ':' || extract(epoch from now())::bigint);
  return true;
end;
$$;

revoke all on function push_test(text, text, text) from public, anon;
grant execute on function push_test(text, text, text) to authenticated;


-- ------------------------------------------------------------
-- 알림을 쌓는 자리
--  · 글·댓글·반응은 그 자리에서 (트리거)
--  · 봉사 전날·감사·설문 마감·퀴즈 발표는 시각이 되면 (pg_cron)
-- ------------------------------------------------------------

-- 글이 올라오면 — 공지는 「공지」로만, 나머지는 「새 글」로
create or replace function outbox_on_post()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare who text; head text; tail text;
begin
  if new.hidden then return new; end if;
  select name into who from members where id = new.author_id;

  if new.type = 'notice' then
    head := '[공지] ' || left(coalesce(new.body, ''), 30);
    tail := coalesce(new.body, '');
    insert into push_outbox (member_id, kind, title, body, url, dedupe_key, actor_id)
    values (null, 'notice', head, tail, 'me.html#post=' || new.id, 'notice:' || new.id,
            new.author_id)
    on conflict (dedupe_key) do nothing;
    return new;
  end if;

  if new.type = 'review' then
    head := coalesce(who, '누군가') || '님이 ' || coalesce(new.place, '봉사') || ' 후기를 올렸어요';
  elsif exists (select 1 from polls q where q.post_id = new.id and q.answer_option_id is not null) then
    head := coalesce(who, '누군가') || '님이 퀴즈를 냈어요';
  else
    head := coalesce(who, '누군가') || '님이 새 글을 올렸어요';
  end if;

  insert into push_outbox (member_id, kind, title, body, url, dedupe_key, actor_id)
  values (null, 'post', head, left(coalesce(new.body, ''), 40),
          'me.html#post=' || new.id, 'post:' || new.id, new.author_id)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists outbox_post_trg on posts;
create trigger outbox_post_trg after insert on posts
  for each row execute function outbox_on_post();

-- 댓글 — 내 글에 달리면 글쓴이에게, 내 댓글에 달리면 그 사람에게.
-- 같은 사람이 둘 다면 한 번만.
create or replace function outbox_on_comment()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare
  who text; owner uuid; parent_owner uuid;
begin
  select name into who from members where id = new.author_id;
  select author_id into owner from posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into parent_owner from comments where id = new.parent_id;
  end if;

  /* 대댓글 — 내 댓글에 답글 */
  if parent_owner is not null and parent_owner <> new.author_id then
    insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
    values (parent_owner, 'reply',
            coalesce(who, '누군가') || '님이 내 댓글에 답글을 남겼어요',
            left(coalesce(new.body, ''), 40),
            'me.html#post=' || new.post_id, 'reply:' || new.id)
    on conflict (dedupe_key) do nothing;
  end if;

  /* 댓글 — 내 글에. 글쓴이가 위에서 이미 받았으면 안 보낸다 */
  if owner is not null and owner <> new.author_id
     and (parent_owner is null or parent_owner <> owner) then
    insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
    values (owner, 'comment',
            coalesce(who, '누군가') || '님이 댓글을 남겼어요',
            left(coalesce(new.body, ''), 40),
            'me.html#post=' || new.post_id, 'comment:' || new.id)
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists outbox_comment_trg on comments;
create trigger outbox_comment_trg after insert on comments
  for each row execute function outbox_on_comment();

-- 봉사 신청이 열리면 전체에게
create or replace function outbox_on_event()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.date < current_date then return new; end if;
  insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
  values (null, 'vol', '봉사 신청이 열렸어요',
          to_char(new.date, 'MM/DD') || '(' ||
          case extract(dow from new.date)::int
            when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
            when 4 then '목' when 5 then '금' else '토' end || ') ' ||
          coalesce(to_char(new.start_time, 'HH24:MI') || ' ', '') ||
          coalesce(new.place, '') ||
          case when new.capacity > 0 then ' · 선착순 ' || new.capacity || '명' else '' end,
          'me.html#tab=vol', 'vol:' || new.id)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists outbox_event_trg on events;
create trigger outbox_event_trg after insert on events
  for each row execute function outbox_on_event();


-- ------------------------------------------------------------
-- 시각이 되면 도는 것들 — pg_cron 이 5분마다 push_tick() 을 부른다
--   · 봉사 전날 저녁 8시
--   · 봉사 당일 (오전 시작은 13:00, 오후 시작은 시작+3시간)
--   · 설문 마감 하루 전 (아직 참여 안 한 사람에게만)
--   · 퀴즈 발표 시각
-- 모두 dedupe_key 로 막아 두 번 가지 않는다.
-- ------------------------------------------------------------
create or replace function push_tick()
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  n_before int := 0; n_thanks int := 0; n_poll int := 0; n_quiz int := 0;
  kst timestamptz := now();
  r record;
  dow text;
begin
  /* ---- 봉사 전날 저녁 8시 ---- */
  for r in
    select e.*, a.member_id
      from events e join attendance a on a.event_id = e.id
     where e.date = (current_date + 1)
       and (now() at time zone 'Asia/Seoul')::time >= time '20:00'
  loop
    dow := case extract(dow from r.date)::int
             when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
             when 4 then '목' when 5 then '금' else '토' end;
    insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
    values (r.member_id, 'before',
            '내일(' || dow || ') ' ||
            coalesce(to_char(r.start_time, 'HH24:MI') || ' ', '') ||
            coalesce(r.place, '') || ' 봉사예요',
            case when coalesce(btrim(r.note), '') <> ''
                 then '준비물: ' || r.note
                 else '잊지 말고 와 주세요 🐾' end,
            'me.html#tab=vol', 'before:' || r.id || ':' || r.member_id)
    on conflict (dedupe_key) do nothing;
    n_before := n_before + 1;
  end loop;

  /* ---- 봉사 당일 감사 ---- */
  for r in
    select e.*, a.member_id
      from events e join attendance a on a.event_id = e.id
     where e.date = current_date
       and (now() at time zone 'Asia/Seoul')::time >=
           case when e.start_time is null or e.start_time < time '12:00'
                then time '13:00'
                else e.start_time + interval '3 hours' end
  loop
    insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
    values (r.member_id, 'thanks', '오늘 와줘서 고맙다멍!',
            '덕분에 지루한 일상 속 웃음이 가득했다멍. 후기도 남겨 줄래멍?',
            'me.html#tab=home', 'thanks:' || r.id || ':' || r.member_id)
    on conflict (dedupe_key) do nothing;
    n_thanks := n_thanks + 1;
  end loop;

  /* ---- 설문 마감 하루 전 — 아직 참여 안 한 사람에게만 ---- */
  for r in
    select p.id as post_id, q.question, m.id as member_id
      from polls q
      join posts p on p.id = q.post_id
      cross join members m
     where p.type = 'poll' and not p.hidden
       and q.closed_at is null
       and q.closes_at is not null
       and q.closes_at > now()
       and q.closes_at <= now() + interval '24 hours'
       and m.status <> 'left'
       and not exists (select 1 from poll_votes v
                        where v.post_id = p.id and v.member_id = m.id)
  loop
    insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
    values (r.member_id, 'poll', '설문이 내일 마감돼요 · 아직 참여 전이에요',
            r.question, 'me.html#post=' || r.post_id,
            'poll:' || r.post_id || ':' || r.member_id)
    on conflict (dedupe_key) do nothing;
    n_poll := n_poll + 1;
  end loop;

  /* ---- 퀴즈 발표 시각이 지난 것 ---- */
  for r in
    select q.post_id from polls q
     where q.answer_option_id is not null
       and q.revealed_at is null
       and q.reveal_at is not null
       and q.reveal_at <= now()
  loop
    perform reveal_quiz_sys(r.post_id);
    n_quiz := n_quiz + 1;
  end loop;

  return json_build_object('before', n_before, 'thanks', n_thanks,
                           'poll', n_poll, 'quiz', n_quiz, 'at', kst);
end;
$$;

-- 예약 발표는 사람이 아니라 시계가 부른다 — is_member() 검사를 하지 않는 쪽
create or replace function reveal_quiz_sys(p_post uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare q polls%rowtype; ans text; qq text;
begin
  select * into q from polls where post_id = p_post;
  if q.post_id is null or q.answer_option_id is null or q.revealed_at is not null then
    return;
  end if;

  update polls set revealed_at = now() where post_id = p_post and revealed_at is null;
  if not found then return; end if;

  select label into ans from poll_options where id = q.answer_option_id;
  qq := coalesce(q.question, '');

  insert into member_notices (member_id, kind, body, post_id)
  select v.member_id, 'quiz',
         case when v.option_id = q.answer_option_id
              then '정답이에요! ' || coalesce(ans, '') || ' 였어요 🐾'
              else '아쉬워요! 정답은 ' || coalesce(ans, '') || ' 였어요' end,
         p_post
    from (select distinct on (member_id) member_id, option_id
            from poll_votes where post_id = p_post
           order by member_id, created_at) v;

  insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
  select v.member_id, 'quiz',
         case when v.option_id = q.answer_option_id then '정답이에요! 🐾' else '아쉬워요!' end,
         qq || ' → ' ||
         case when v.option_id = q.answer_option_id
              then coalesce(ans, '') || '였어요'
              else '정답은 ' || coalesce(ans, '') || '였어요' end,
         'me.html#post=' || p_post,
         'quiz:' || p_post || ':' || v.member_id
    from (select distinct on (member_id) member_id, option_id
            from poll_votes where post_id = p_post
           order by member_id, created_at) v
  on conflict (dedupe_key) do nothing;
end;
$$;

revoke all on function push_tick() from public, anon, authenticated;
revoke all on function reveal_quiz_sys(uuid) from public, anon, authenticated;

-- 대기에서 올라가면 알림
create or replace function outbox_on_promote()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare e events%rowtype; dow text;
begin
  select * into e from events where id = new.event_id;
  if e.id is null then return new; end if;
  dow := case extract(dow from e.date)::int
           when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
           when 4 then '목' when 5 then '금' else '토' end;

  insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
  values (new.member_id, 'promoted', '자리가 났어요!',
          to_char(e.date, 'MM/DD') || '(' || dow || ') ' ||
          coalesce(to_char(e.start_time, 'HH24:MI') || ' ', '') ||
          coalesce(e.place, '') || ' 봉사에 신청됐어요. 못 가면 꼭 취소해 주세요',
          'me.html#tab=vol', 'promoted:' || e.id || ':' || new.member_id)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;


-- ------------------------------------------------------------
-- 「숨기기」를 쓰지 않기로 했다 (2026-10-20)
--  지우거나 두거나 둘 중 하나다. 숨긴 글이 쌓이면
--  운영진도 구성원도 지금 무엇이 보이는지 알기 어려워진다.
--  hidden 칸은 지우지 않는다 — 이미 숨겨 둔 글이 있으면 그대로 남고,
--  읽는 함수들이 계속 걸러 준다. 새로 숨기는 길만 닫는다.
-- ------------------------------------------------------------

-- 글을 지우면 그 글에 대한 신고도 처리된 것으로
create or replace function reports_close_on_post_delete()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update reports set done_at = now()
   where post_id = old.id and done_at is null;
  return old;
end;
$$;

drop trigger if exists reports_close_trg on posts;
create trigger reports_close_trg before delete on posts
  for each row execute function reports_close_on_post_delete();

-- 댓글도 마찬가지
create or replace function reports_close_on_comment_delete()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  update reports set done_at = now()
   where comment_id = old.id and done_at is null;
  return old;
end;
$$;

drop trigger if exists reports_close_c_trg on comments;
create trigger reports_close_c_trg before delete on comments
  for each row execute function reports_close_on_comment_delete();


-- ============================================================
--  I. 운영·안전 — 의견 보내기 · 사용 현황 · 저장 공간
-- ============================================================

-- ------------------------------------------------------------
-- I1) 의견 보내기 — 「불편한 점 알려 주기」
--     신고와 같은 곳(reports)에 쌓지 않는다. 성격이 다르다.
-- ------------------------------------------------------------
create table if not exists feedback (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  member_id  uuid references members(id) on delete set null,
  body       text not null,
  done_at    timestamptz,
  done_by    uuid references members(id) on delete set null
);
alter table feedback enable row level security;
create index if not exists feedback_open_idx on feedback (done_at, created_at desc);

drop policy if exists "feedback write" on feedback;
drop policy if exists "feedback admin" on feedback;
create policy "feedback write" on feedback for insert to authenticated
  with check (is_member() and member_id = my_member_id());
create policy "feedback admin" on feedback for all to authenticated
  using (is_admin()) with check (is_admin());

create or replace function feedback_send(p_body text)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_member() then return false; end if;
  if coalesce(btrim(p_body), '') = '' then return false; end if;
  insert into feedback (member_id, body) values (my_member_id(), btrim(p_body));
  return true;
end;
$$;

create or replace function feedback_open()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'id', f.id, 'created_at', f.created_at, 'body', f.body,
            'who', (select m.name from members m where m.id = f.member_id))
            order by f.created_at desc), '[]'::json)
     from feedback f where f.done_at is null)
end;
$$;

create or replace function feedback_done(p_id uuid)
returns boolean
language plpgsql security definer
set search_path = public
as $$
begin
  if not is_admin() then return false; end if;
  update feedback set done_at = now(), done_by = my_member_id()
   where id = p_id and done_at is null;
  return true;
end;
$$;

revoke all on function feedback_send(text) from public, anon;
revoke all on function feedback_open() from public, anon;
revoke all on function feedback_done(uuid) from public, anon;
grant execute on function feedback_send(text) to authenticated;
grant execute on function feedback_open() to authenticated;
grant execute on function feedback_done(uuid) to authenticated;

-- ------------------------------------------------------------
-- I2) 사용 현황 (운영진만)
--     ★ 개인별 열람 기록은 남기지 않는다. 숫자만 센다.
-- ------------------------------------------------------------
create or replace function usage_stats()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  json_build_object(
    'members',     (select count(*)::int from members where status <> 'left'),
    'linked',      (select count(*)::int from members
                     where status <> 'left' and auth_user_id is not null),
    'joined_week', (select count(*)::int from members
                     where status <> 'left' and linked_at > now() - interval '7 days'),
    'posts_week',  (select count(*)::int from posts
                     where created_at > now() - interval '7 days' and not hidden),
    'reviews_week',(select count(*)::int from posts
                     where type = 'review' and created_at > now() - interval '7 days'
                       and not hidden),
    'comments_week',(select count(*)::int from comments
                     where created_at > now() - interval '7 days' and not hidden),
    'push_on',     (select count(distinct member_id)::int from push_subscriptions),
    /* 저장 공간 — 사진이 거의 다다 */
    'photos',      (select count(*)::int from post_photos),
    'bytes',       (select coalesce(sum((o.metadata->>'size')::bigint), 0)
                      from storage.objects o where o.bucket_id in ('community', 'avatars')),
    'rows',        (select (select count(*) from posts) + (select count(*) from comments)
                         + (select count(*) from reactions) + (select count(*) from poll_votes))
  )
end;
$$;

revoke all on function usage_stats() from public, anon;
grant execute on function usage_stats() to authenticated;


-- ============================================================
--  J1. 「운영진에게 의견 보내기」 — 이름 있는 것과 익명을 한곳에
-- ============================================================
--  표는 하나(feedback)만 쓴다. 익명이면 member_id 를 비운다.
--
--  익명으로 보낼 때는 **누가 썼는지 아무것도 담지 않는다.**
--  구성원인지만 확인하고 그 값을 버린다.
--
--  도배를 막으려면 「이 사람이 오늘 몇 번 썼는지」를 세야 하는데,
--  그 숫자를 의견 옆에 두면 익명이 아니게 된다.
--  그래서 **의견과 이어지지 않는 다른 표**에 날짜 + 흐린 값으로만 센다.
--
--  ※ 솔직하게 — 데이터베이스 대시보드에 들어갈 수 있는 사람은
--    함수 안의 고정값을 보고 같은 흐린 값을 다시 만들 수 있다.
--    「운영진 화면에서는 알 수 없다」는 확실하지만,
--    「서버를 들여다볼 수 있는 사람에게도 숨겨진다」고는 말할 수 없다.
-- ------------------------------------------------------------
alter table feedback add column if not exists anon boolean not null default false;
alter table feedback add column if not exists reply text;
alter table feedback add column if not exists replied_at timestamptz;

-- 익명으로 보낸 횟수만 센다. 의견과 이어지지 않는다.
create table if not exists feedback_quota (
  day date not null,
  tag text not null,
  n   int  not null default 0,
  primary key (day, tag)
);
alter table feedback_quota enable row level security;
-- 아무에게도 열어 주지 않는다. 아래 함수만 건드린다.

create or replace function feedback_send(p_body text, p_anon boolean default false)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  me uuid := my_member_id();
  t  text;
  c  int;
begin
  if me is null then return json_build_object('ok', false, 'why', 'nologin'); end if;
  if coalesce(btrim(p_body), '') = '' then
    return json_build_object('ok', false, 'why', 'empty');
  end if;

  if coalesce(p_anon, false) then
    /* 날짜가 바뀌면 값도 바뀐다 — 어제 것과 이어 붙일 수 없다 */
    t := encode(digest(me::text || ':' || current_date::text || ':baljaguk-anon', 'sha256'), 'hex');
    insert into feedback_quota (day, tag, n) values (current_date, t, 1)
    on conflict (day, tag) do update set n = feedback_quota.n + 1
    returning n into c;
    if c > 3 then
      return json_build_object('ok', false, 'why', 'toomany');
    end if;

    /* 여기서 me 를 버린다 — 아래 insert 에 들어가지 않는다 */
    insert into feedback (member_id, anon, body) values (null, true, btrim(p_body));
    return json_build_object('ok', true, 'anon', true, 'left', 3 - c);
  end if;

  insert into feedback (member_id, anon, body) values (me, false, btrim(p_body));
  return json_build_object('ok', true, 'anon', false);
end;
$$;

create or replace function feedback_open()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'id', f.id, 'created_at', f.created_at, 'body', f.body,
            'anon', f.anon,
            /* 익명이면 이름을 아예 꺼내지 않는다 */
            'who', case when f.anon then null
                        else (select m.name from members m where m.id = f.member_id) end,
            'can_reply', (not f.anon) and f.member_id is not null,
            'replied', f.replied_at is not null)
            order by f.created_at desc), '[]'::json)
     from feedback f where f.done_at is null)
end;
$$;

-- 이름 있는 의견에만 답장할 수 있다. 익명에는 답장할 길이 없다.
create or replace function feedback_reply(p_id uuid, p_text text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare f feedback%rowtype;
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'notadmin'); end if;
  select * into f from feedback where id = p_id;
  if f.id is null then return json_build_object('ok', false, 'why', 'notfound'); end if;
  if f.anon or f.member_id is null then
    return json_build_object('ok', false, 'why', 'anon');
  end if;
  if coalesce(btrim(p_text), '') = '' then
    return json_build_object('ok', false, 'why', 'empty');
  end if;

  update feedback set reply = btrim(p_text), replied_at = now() where id = p_id;

  insert into member_notices (member_id, kind, body)
  values (f.member_id, 'reply', '보내 주신 의견에 운영진이 답했어요: ' || left(btrim(p_text), 40));

  insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
  values (f.member_id, 'notice', '운영진이 답했어요',
          left(btrim(p_text), 60), 'me.html#tab=me', 'freply:' || p_id)
  on conflict (dedupe_key) do nothing;

  return json_build_object('ok', true);
end;
$$;

/* 익명 칸이 없던 옛 모양은 지운다 — 둘이 남으면 어느 쪽이 불릴지 헷갈린다 */
drop function if exists feedback_send(text);

revoke all on function feedback_send(text, boolean) from public, anon;
revoke all on function feedback_reply(uuid, text) from public, anon;
grant execute on function feedback_send(text, boolean) to authenticated;
grant execute on function feedback_reply(uuid, text) to authenticated;


-- ============================================================
--  J2. 처음이에요 Q&A — 자유게시판 안 「질문」 말머리
-- ============================================================
--  새 표도 새 탭도 만들지 않는다. 자유글에 표시만 더한다.
--  답은 그냥 댓글이고, 글쓴이가 하나를 「도움 됐어요」로 고정한다.
-- ------------------------------------------------------------
-- 칸은 위(posts 표 옆)에서 먼저 만든다 — feed() 가 아래에서 쓴다

-- 글쓴이만, 하나만 고른다. 다시 누르면 푼다.
create or replace function mark_best(p_post uuid, p_comment uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare owner uuid; cur uuid;
begin
  if not is_member() then return json_build_object('ok', false, 'why', 'nologin'); end if;
  select author_id, best_comment_id into owner, cur from posts where id = p_post;
  if owner is null then return json_build_object('ok', false, 'why', 'notfound'); end if;
  if owner <> my_member_id() then
    return json_build_object('ok', false, 'why', 'notmine');
  end if;

  if cur is not null and cur = p_comment then
    /* 같은 걸 다시 누르면 푼다 */
    update posts set best_comment_id = null, solved_at = null where id = p_post;
    return json_build_object('ok', true, 'solved', false);
  end if;

  if not exists (select 1 from comments c where c.id = p_comment and c.post_id = p_post) then
    return json_build_object('ok', false, 'why', 'notfound');
  end if;

  update posts set best_comment_id = p_comment, solved_at = now() where id = p_post;

  /* 답을 쓴 사람에게 알린다 */
  insert into member_notices (member_id, kind, body, post_id)
  select c.author_id, 'best', '내 답이 도움이 됐대요 🐾', p_post
    from comments c where c.id = p_comment and c.author_id <> my_member_id();

  return json_build_object('ok', true, 'solved', true);
end;
$$;

revoke all on function mark_best(uuid, uuid) from public, anon;
grant execute on function mark_best(uuid, uuid) to authenticated;
