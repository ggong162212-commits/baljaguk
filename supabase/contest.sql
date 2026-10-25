-- ============================================================
--  사진·영상 콘테스트 — 「내가 찍은 사진이 제일 잘나가 📸」
--  ------------------------------------------------------------
--  · contests        설정 한 줄 (제목·시작·마감·한 사람 몇 개·글자 수)
--  · contest_entries 낸 작품
--  · 투표는 이번 범위가 아니다. 나중에 contest_votes / contest_comments 를
--    여기 아래에 붙인다 (작품마다 한 표 · 익명. 표는 사람과 떼어서 담는다).
--
--  규칙을 **서버에서** 막는다 — 화면이 뚫려도 넘어가지 않게:
--    기간 아님 · 개수 넘음 · 제목/설명 길이 · 내 작품 아님 ·
--    내가 안 간 봉사를 고름
--
--  작품은 투표가 열리기 전까지 **나와 운영진만** 본다.
--  다른 사람에게는 contest_info() 가 「n작품」 숫자만 준다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 설정 — 한 줄만 둔다
-- ------------------------------------------------------------
create table if not exists contests (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  one         boolean not null default true,
  title       text not null default '내가 찍은 사진이 제일 잘나가 📸',
  subtitle    text not null default '발자국 봉사 사진·영상 콘테스트',
  /* 아직 안 정한 동안은 start_at 이 비어 있다 — 그때는 운영진만 미리 본다 */
  start_at    timestamptz,
  end_at      timestamptz,
  /* 바꾸기 쉽게 표에 둔다 (사용자가 안 정한 것들의 기본값) */
  max_entries int  not null default 3,
  title_max   int  not null default 20,
  body_max    int  not null default 200,
  updated_at  timestamptz,
  updated_by  uuid references members(id) on delete set null
);
/* 두 줄이 되지 않게 — one 은 늘 true 라서 한 줄만 들어간다 */
create unique index if not exists contests_one_idx on contests (one);

-- ------------------------------------------------------------
-- 2) 낸 작품
-- ------------------------------------------------------------
create table if not exists contest_entries (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  contest_id   uuid not null references contests(id) on delete cascade,
  member_id    uuid not null references members(id) on delete cascade,
  title        text not null,
  body         text not null,
  /* 작품 하나 = 사진 1장 또는 영상 1개 */
  media_path   text not null,
  media_kind   text not null default 'photo' check (media_kind in ('photo', 'video')),
  /* 영상일 때 첫 그림 (후기와 같은 처리) */
  poster_path  text,
  /* 봉사지 — 필수. 지난 봉사에서 고르면 보호소 이름이 자동으로 채워지고,
     목록에 없으면 직접 적는다 */
  shelter      text not null default '',
  /* 사진·영상 속 아이 이름. 비어 있으면 「이름을 몰라요」 */
  pet_names    text[] not null default '{}',
  /* 「어느 봉사에서?」 — 선택. 내가 간 지난 봉사만 고를 수 있다 */
  volunteer_id uuid references events(id) on delete set null
);
/* 이미 만들어진 표에는 create table 이 건너뛴다 — 칸을 따로 더해 준다 */
alter table contest_entries add column if not exists shelter   text   not null default '';
alter table contest_entries add column if not exists pet_names text[] not null default '{}';
create index if not exists contest_entries_mine_idx
  on contest_entries (contest_id, member_id, created_at);

-- ------------------------------------------------------------
-- 3) 권한 — 내 작품만. 운영진은 전부. 설정은 운영진만.
--    (숫자·기간은 아래 contest_info() 가 구성원에게도 준다)
-- ------------------------------------------------------------
alter table contests        enable row level security;
alter table contest_entries enable row level security;

drop policy if exists "contest cfg admin"  on contests;
create policy "contest cfg admin" on contests for all to authenticated
  using (is_admin()) with check (is_admin());

/* 읽기만 직접 허용한다. 내기·고치기·지우기는 아래 함수로만 —
   개수·기간·글자 수를 서버가 다시 보게 하려고 */
drop policy if exists "contest entry mine" on contest_entries;
create policy "contest entry mine" on contest_entries for select to authenticated
  using (member_id = my_member_id() or is_admin());

-- ------------------------------------------------------------
-- 4) 지금 어떤 상태인가 — 구성원도 부를 수 있다
--    phase: hidden(아직 안 정함) · soon(곧 시작) · open(진행 중) · closed(마감)
-- ------------------------------------------------------------
create or replace function contest_info()
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else (
    select json_build_object(
      'id',          c.id,
      'title',       c.title,
      'subtitle',    c.subtitle,
      'start_at',    c.start_at,
      'end_at',      c.end_at,
      'max_entries', c.max_entries,
      'title_max',   c.title_max,
      'body_max',    c.body_max,
      'entry_count', (select count(*) from contest_entries e where e.contest_id = c.id),
      'mine_count',  (select count(*) from contest_entries e
                       where e.contest_id = c.id and e.member_id = my_member_id()),
      'phase', case
                 when c.start_at is null then 'hidden'
                 when now() < c.start_at then 'soon'
                 when c.end_at is not null and now() > c.end_at then 'closed'
                 else 'open'
               end,
      /* 운영진은 아직 안 열린 것도 미리 본다 */
      'preview', is_admin())
      from contests c
     order by c.created_at
     limit 1) end;
$$;
revoke all on function contest_info() from public, anon;
grant execute on function contest_info() to authenticated;

-- ------------------------------------------------------------
-- 5) 내기 · 고치기 — 서버가 다시 막는다
--    p_id 가 있으면 고치기, 없으면 새로 내기
-- ------------------------------------------------------------
/* 칸이 늘어서 손잡이 모양이 바뀌었다 — 옛 모양이 남아 있으면 치운다 */
drop function if exists contest_save(uuid, text, text, text, text, text, uuid);

create or replace function contest_save(
  p_id          uuid,
  p_title       text,
  p_body        text,
  p_media_path  text,
  p_media_kind  text,
  p_poster_path text,
  p_shelter     text,
  p_pet_names   text[],
  p_volunteer   uuid)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare
  me_    uuid;
  c_     contests%rowtype;
  phase_ text;
  n_     int;
  ti_    text;
  bo_    text;
  ki_    text;
  sh_    text;
  pets_  text[];
  id_    uuid;
begin
  me_ := my_member_id();
  if me_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;

  select * into c_ from contests order by created_at limit 1;
  if not found then return json_build_object('ok', false, 'why', 'noconfig'); end if;

  phase_ := case
              when c_.start_at is null then 'hidden'
              when now() < c_.start_at then 'soon'
              when c_.end_at is not null and now() > c_.end_at then 'closed'
              else 'open'
            end;
  if phase_ <> 'open' then
    return json_build_object('ok', false, 'why', phase_);
  end if;

  ti_ := btrim(coalesce(p_title, ''));
  bo_ := btrim(coalesce(p_body, ''));
  ki_ := coalesce(nullif(btrim(coalesce(p_media_kind, '')), ''), 'photo');

  if ti_ = '' or char_length(ti_) > c_.title_max then
    return json_build_object('ok', false, 'why', 'title');
  end if;
  if bo_ = '' or char_length(bo_) > c_.body_max then
    return json_build_object('ok', false, 'why', 'body');
  end if;
  if ki_ not in ('photo', 'video') then
    return json_build_object('ok', false, 'why', 'kind');
  end if;
  if btrim(coalesce(p_media_path, '')) = '' then
    return json_build_object('ok', false, 'why', 'nomedia');
  end if;

  /* 봉사지 — 필수 */
  sh_ := btrim(coalesce(p_shelter, ''));
  if sh_ = '' then
    return json_build_object('ok', false, 'why', 'shelter');
  end if;
  if char_length(sh_) > 40 then
    return json_build_object('ok', false, 'why', 'shelterlong');
  end if;

  /* 아이 이름 — 앞뒤 공백을 떼고 빈 것은 버린다.
     다 비면 「이름을 몰라요」 로 둔다 (그래도 괜찮다) */
  select coalesce(array_agg(x order by i), '{}')
    into pets_
    from (select btrim(v) as x, ord as i
            from unnest(coalesce(p_pet_names, '{}'::text[])) with ordinality as u(v, ord)) y
   where x <> '';
  if array_length(pets_, 1) > 10 then
    return json_build_object('ok', false, 'why', 'pets');
  end if;
  if exists (select 1 from unnest(pets_) as z(v) where char_length(v) > 20) then
    return json_build_object('ok', false, 'why', 'petlong');
  end if;

  /* 「어느 봉사에서?」 는 내가 **간** 봉사만 */
  if p_volunteer is not null and not exists (
       select 1 from attendance a
        where a.event_id = p_volunteer and a.member_id = me_) then
    return json_build_object('ok', false, 'why', 'vol');
  end if;

  if p_id is null then
    select count(*) into n_ from contest_entries
     where contest_id = c_.id and member_id = me_;
    if n_ >= c_.max_entries then
      return json_build_object('ok', false, 'why', 'toomany');
    end if;

    insert into contest_entries
      (contest_id, member_id, title, body, media_path, media_kind, poster_path,
       shelter, pet_names, volunteer_id)
    values (c_.id, me_, ti_, bo_, btrim(p_media_path), ki_,
            nullif(btrim(coalesce(p_poster_path, '')), ''),
            sh_, pets_, p_volunteer)
    returning id into id_;
  else
    update contest_entries
       set title = ti_, body = bo_,
           media_path = btrim(p_media_path), media_kind = ki_,
           poster_path = nullif(btrim(coalesce(p_poster_path, '')), ''),
           shelter = sh_, pet_names = pets_,
           volunteer_id = p_volunteer,
           updated_at = now()
     where id = p_id and member_id = me_ and contest_id = c_.id
    returning id into id_;
    if id_ is null then
      return json_build_object('ok', false, 'why', 'notmine');
    end if;
  end if;

  return json_build_object('ok', true, 'id', id_);
end;
$fn$;
revoke all on function contest_save(uuid, text, text, text, text, text, text, text[], uuid)
  from public, anon;
grant execute on function contest_save(uuid, text, text, text, text, text, text, text[], uuid)
  to authenticated;

-- ------------------------------------------------------------
-- 6) 지우기 — 마감 전까지 내 것만. 운영진은 언제든.
--    (보관함 파일은 화면 쪽에서 먼저 지운다 — 후기 영상과 같은 순서)
-- ------------------------------------------------------------
create or replace function contest_remove(p_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare
  me_ uuid;
  c_  contests%rowtype;
  n_  int;
begin
  if is_admin() then
    delete from contest_entries where id = p_id;
    get diagnostics n_ = row_count;
    return json_build_object('ok', n_ > 0);
  end if;

  me_ := my_member_id();
  if me_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;

  select * into c_ from contests order by created_at limit 1;
  if not found then return json_build_object('ok', false, 'why', 'noconfig'); end if;
  if c_.end_at is not null and now() > c_.end_at then
    return json_build_object('ok', false, 'why', 'closed');
  end if;

  delete from contest_entries where id = p_id and member_id = me_;
  get diagnostics n_ = row_count;
  if n_ = 0 then return json_build_object('ok', false, 'why', 'notmine'); end if;
  return json_build_object('ok', true);
end;
$fn$;
revoke all on function contest_remove(uuid) from public, anon;
grant execute on function contest_remove(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7) 운영진 — 시작일·마감일 정하기
--    비워서 보내면 그 칸은 그대로 둔다 (p_clear_start 로 시작일을 다시 비운다)
-- ------------------------------------------------------------
create or replace function contest_set(
  p_start       timestamptz,
  p_end         timestamptz,
  p_title       text,
  p_subtitle    text,
  p_max         int,
  p_clear_start boolean)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare c_ contests%rowtype;
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'notadmin'); end if;

  select * into c_ from contests order by created_at limit 1;
  if not found then
    insert into contests (one) values (true) returning * into c_;
  end if;

  update contests
     set start_at    = case when coalesce(p_clear_start, false) then null
                            else coalesce(p_start, start_at) end,
         end_at      = coalesce(p_end, end_at),
         title       = coalesce(nullif(btrim(coalesce(p_title, '')), ''), title),
         subtitle    = coalesce(nullif(btrim(coalesce(p_subtitle, '')), ''), subtitle),
         max_entries = greatest(1, least(10, coalesce(p_max, max_entries))),
         updated_at  = now(),
         updated_by  = my_member_id()
   where id = c_.id;

  return json_build_object('ok', true, 'id', c_.id);
end;
$fn$;
revoke all on function contest_set(timestamptz, timestamptz, text, text, int, boolean) from public, anon;
grant execute on function contest_set(timestamptz, timestamptz, text, text, int, boolean) to authenticated;

-- ------------------------------------------------------------
-- 8) 운영진 — 낸 작품 목록. 이름만 붙인다 (연락처·학번은 안 준다)
-- ------------------------------------------------------------
create or replace function contest_all()
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_admin() then null else
    coalesce((
      select json_agg(json_build_object(
               'id',           e.id,
               'title',        e.title,
               'body',         e.body,
               'media_path',   e.media_path,
               'media_kind',   e.media_kind,
               'poster_path',  e.poster_path,
               'shelter',      e.shelter,
               'pet_names',    e.pet_names,
               'volunteer_id', e.volunteer_id,
               'place',        ev.place,
               'date',         ev.date,
               'author',       m.name,
               'created_at',   e.created_at,
               'updated_at',   e.updated_at)
               order by e.created_at desc)
        from contest_entries e
        join members m on m.id = e.member_id
        left join events ev on ev.id = e.volunteer_id), '[]'::json)
  end;
$$;
revoke all on function contest_all() from public, anon;
grant execute on function contest_all() to authenticated;

-- ------------------------------------------------------------
-- 9) 보관함 — contest/<로그인 id>/<작품 id>/파일
--    같은 community 버킷을 쓰지만, contest/ 아래는 **낸 사람과 운영진만** 본다.
--    (투표가 열리기 전에 남의 작품을 미리 보지 못하게)
--    ★ 정책은 or 로 합쳐진다 — 기존 「community read」 를 좁히지 않으면
--      새 정책을 더해도 막히지 않는다. 그래서 같은 이름으로 다시 만든다.
-- ------------------------------------------------------------
drop policy if exists "community read"  on storage.objects;
create policy "community read" on storage.objects for select to authenticated
  using (bucket_id in ('community', 'avatars') and is_member()
         and (name not like 'contest/%'
              or owner = auth.uid()
              or (storage.foldername(name))[2] = auth.uid()::text
              or is_admin()));

drop policy if exists "community write" on storage.objects;
create policy "community write" on storage.objects for insert to authenticated
  with check (bucket_id in ('community', 'avatars') and is_member()
              and (name not like 'contest/%'
                   or (storage.foldername(name))[2] = auth.uid()::text));
