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
  edited_at   timestamptz
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
