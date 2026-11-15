-- ============================================================
--  모임 참석 조사 (1월 엠티 · 12월 벙개)
-- ------------------------------------------------------------
--  설문 탭의 「설문」(투표)으로는 못 하는 것들이 있어서 따로 만든다.
--    · 질문이 여러 개다 — 투표는 질문 하나 + 보기뿐이다
--    · 「참석」을 고른 사람에게만 더 묻는다 (조건부)
--    · 사는 곳을 **짧은 글**로 받는다 — 투표는 보기 고르기만 된다
--    · 사는 곳·차량 지원 여부는 **운영진만** 본다.
--      투표는 익명으로 해도 화면에서만 가려지고, 응답 줄(poll_votes)은
--      로그인한 구성원 누구나 읽을 수 있다. 여기는 RLS 로 막는다
--  공개되는 것은 **참석·불참 인원 수**뿐이다.
--
--  폼의 글(안내 문구·일정·장소)은 화면 쪽(assets/meetup.js)에 있다.
--  여기에는 날짜·마감처럼 **서버가 막아야 하는 것**만 둔다.
--
--  쓰는 법:  Supabase SQL 편집기에 이 파일을 그대로 Run
-- ============================================================

-- ------------------------------------------------------------
-- 1) 어떤 조사가 있나
-- ------------------------------------------------------------
create table if not exists meetups (
  form       text primary key,            -- 'mt2701' · 'bungae2612'
  title      text not null,
  closes_at  timestamptz,                 -- 이 시각이 지나면 못 낸다
  open       boolean not null default true,
  ask_car    boolean not null default false,   -- 차량 지원 가능 여부를 묻나
  ask_area   boolean not null default false,   -- 사는 곳을 묻나
  sort       int not null default 0
);

insert into meetups (form, title, closes_at, ask_car, ask_area, sort) values
  ('mt2701',     '1월 엠티 참석 조사', '2026-11-30 23:59:59+09', true,  true,  1),
  ('bungae2612', '12월 벙개모임',      '2026-11-30 23:59:59+09', false, false, 2)
on conflict (form) do nothing;

-- ------------------------------------------------------------
-- 2) 답
--    한 사람 1번 — 다시 내면 고쳐진다 (unique + on conflict)
-- ------------------------------------------------------------
create table if not exists meetup_answers (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  form       text not null references meetups(form) on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  attend     text not null check (attend in ('yes', 'no')),
  car        text check (car in ('yes', 'no')),   -- 참석일 때만
  /* 차량 지원이 「예」일 때만 — 운전자 빼고 몇 명 태울 수 있나 (1~9) */
  seats      int check (seats is null or (seats between 1 and 9)),
  area       text,                                -- 참석일 때만 (사는 곳)
  note       text,                                -- 운영진 메모
  unique (form, member_id)
);
/* 이미 만들어진 표에는 create table 이 건너뛴다 — 칸을 따로 더해 준다 */
alter table meetup_answers add column if not exists seats int;
do $seat$
begin
  if not exists (select 1 from pg_constraint where conname = 'meetup_seats_ck') then
    alter table meetup_answers add constraint meetup_seats_ck
      check (seats is null or (seats between 1 and 9));
  end if;
end
$seat$;
create index if not exists meetup_form_idx on meetup_answers (form, created_at desc);

-- ------------------------------------------------------------
-- 3) 권한
--    · 조사 목록은 구성원 누구나 읽는다 (제목·마감)
--    · 답은 **내 것만**. 운영진은 전부
--    · 넣고 고치는 것은 아래 meetup_save() 로만 — 서버가 다시 본다
-- ------------------------------------------------------------
alter table meetups        enable row level security;
alter table meetup_answers enable row level security;

drop policy if exists "meetup read"  on meetups;
create policy "meetup read" on meetups for select to authenticated using (is_member());
drop policy if exists "meetup cfg"   on meetups;
create policy "meetup cfg" on meetups for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "meetup ans mine"  on meetup_answers;
create policy "meetup ans mine" on meetup_answers for select to authenticated
  using (member_id = my_member_id() or is_admin());
drop policy if exists "meetup ans admin" on meetup_answers;
create policy "meetup ans admin" on meetup_answers for all to authenticated
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- 4) 화면이 한 번에 받아 가는 것
--    제목·마감·참석/불참 인원 + **내 답**
--    (남의 차·사는 곳은 여기에 실리지 않는다)
-- ------------------------------------------------------------
create or replace function meetup_list()
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else
    coalesce((select json_agg(json_build_object(
      'form',      m.form,
      'title',     m.title,
      'closes_at', m.closes_at,
      'ask_car',   m.ask_car,
      'ask_area',  m.ask_area,
      'open',      m.open and (m.closes_at is null or now() <= m.closes_at),
      'why',       case when not m.open then 'manual'
                        when m.closes_at is not null and now() > m.closes_at then 'closed'
                   end,
      /* ★ 참석·불참 인원은 **운영진만** 본다.
         구성원끼리 서로 눈치 보지 않게, 화면에서 가리는 것이 아니라
         서버가 아예 안 준다 */
      'yes',       case when is_admin() then (select count(*)::int from meetup_answers a
                     where a.form = m.form and a.attend = 'yes') end,
      'no',        case when is_admin() then (select count(*)::int from meetup_answers a
                     where a.form = m.form and a.attend = 'no') end,
      'members',   (select count(*)::int from members
                     where coalesce(status, 'active') <> 'left'),
      'mine',      (select json_build_object(
                      'attend', a.attend, 'car', a.car, 'seats', a.seats,
                      'area', a.area,
                      'at', coalesce(a.updated_at, a.created_at))
                      from meetup_answers a
                     where a.form = m.form and a.member_id = my_member_id()))
      order by m.sort, m.form)
      from meetups m), '[]'::json) end;
$$;
revoke all on function meetup_list() from public, anon;
grant execute on function meetup_list() to authenticated;

-- ------------------------------------------------------------
-- 5) 내기 · 고치기 — 서버가 다시 막는다
--    · 마감 뒤에는 못 낸다
--    · 참석이면 그 조사가 묻는 것(차량·사는 곳)을 꼭 채워야 한다
--    · 불참이면 차량·사는 곳은 **지운다** — 안 물어본 것을 남기지 않는다
-- ------------------------------------------------------------
/* 칸이 하나 늘어서 예전 것을 먼저 치운다 — 안 그러면 4칸짜리가 남아
   화면이 옛 길로 불렀을 때 탑승 인원이 조용히 빠진다 */
drop function if exists meetup_save(text, text, text, text);

create or replace function meetup_save(p_form text, p_attend text,
                                       p_car text, p_seats int, p_area text)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare me uuid; m meetups%rowtype; v_car text; v_area text; v_seats int;
begin
  me := my_member_id();
  if me is null then return json_build_object('ok', false, 'why', 'member'); end if;

  select * into m from meetups where form = p_form;
  if not found then return json_build_object('ok', false, 'why', 'noform'); end if;
  if not m.open or (m.closes_at is not null and now() > m.closes_at) then
    return json_build_object('ok', false, 'why', 'closed');
  end if;
  if p_attend is null or p_attend not in ('yes', 'no') then
    return json_build_object('ok', false, 'why', 'attend');
  end if;

  if p_attend = 'yes' then
    v_car  := nullif(btrim(coalesce(p_car, '')), '');
    v_area := nullif(btrim(coalesce(p_area, '')), '');
    if m.ask_car then
      if v_car is null or v_car not in ('yes', 'no') then
        return json_build_object('ok', false, 'why', 'car');
      end if;
      /* 차를 가져와 주실 때만 몇 자리인지 받는다.
         「아니오」면 적혀 있어도 지운다 — 안 물어본 것을 남기지 않는다 */
      if v_car = 'yes' then
        v_seats := p_seats;
        if v_seats is null then return json_build_object('ok', false, 'why', 'seats'); end if;
        if v_seats < 1 or v_seats > 9 then
          return json_build_object('ok', false, 'why', 'seatsrange');
        end if;
      else
        v_seats := null;
      end if;
    else
      v_car := null; v_seats := null;
    end if;
    if m.ask_area then
      if v_area is null then return json_build_object('ok', false, 'why', 'area'); end if;
      if length(v_area) > 40 then return json_build_object('ok', false, 'why', 'arealong'); end if;
    else
      v_area := null;
    end if;
  else
    v_car := null; v_seats := null; v_area := null;
  end if;

  insert into meetup_answers (form, member_id, attend, car, seats, area)
  values (p_form, me, p_attend, v_car, v_seats, v_area)
  on conflict (form, member_id) do update
    set attend = excluded.attend,
        car    = excluded.car,
        seats  = excluded.seats,
        area   = excluded.area,
        updated_at = now();

  return json_build_object('ok', true);
end;
$fn$;
revoke all on function meetup_save(text, text, text, int, text) from public, anon;
grant execute on function meetup_save(text, text, text, int, text) to authenticated;

-- ------------------------------------------------------------
-- 6) 운영진 모아보기 — 이름과 함께. 운영진이 아니면 null
--    (연락처·학번은 싣지 않는다)
-- ------------------------------------------------------------
create or replace function meetup_all(p_form text)
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_admin() then null else
    coalesce((select json_agg(json_build_object(
        'name',   mb.name,
        'attend', a.attend,
        'car',    a.car,
        'seats',  a.seats,
        'area',   a.area,
        'at',     coalesce(a.updated_at, a.created_at))
        order by a.attend, mb.name)
      from meetup_answers a
      join members mb on mb.id = a.member_id
     where a.form = p_form), '[]'::json) end;
$$;
revoke all on function meetup_all(text) from public, anon;
grant execute on function meetup_all(text) to authenticated;

-- 잘 들어갔는지 보기 (읽기 조회)
-- select form, title, closes_at, open, ask_car, ask_area from meetups order by sort;

-- ------------------------------------------------------------
-- 7) 운영진이 켜고 끄고 마감을 고친다 (폼 관리 화면)
--    · p_clear_close 가 참이면 마감을 **없앤다** (언제까지나 받음)
--    · 안 보낸 값은 그대로 둔다
-- ------------------------------------------------------------
create or replace function meetup_set(p_form text, p_open boolean,
                                      p_closes_at timestamptz,
                                      p_clear_close boolean default false)
returns json
language plpgsql security definer
set search_path = public
as $fn$
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'admin'); end if;
  if not exists (select 1 from meetups where form = p_form) then
    return json_build_object('ok', false, 'why', 'noform');
  end if;
  update meetups
     set open = coalesce(p_open, open),
         closes_at = case when coalesce(p_clear_close, false) then null
                          else coalesce(p_closes_at, closes_at) end
   where form = p_form;
  return json_build_object('ok', true);
end;
$fn$;
revoke all on function meetup_set(text, boolean, timestamptz, boolean) from public, anon;
grant execute on function meetup_set(text, boolean, timestamptz, boolean) to authenticated;
