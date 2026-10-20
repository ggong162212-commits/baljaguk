-- ============================================================
--  발자국 🐾 동아리 사이트 · Supabase 스키마
--  사용법: Supabase 대시보드 → SQL Editor → New query →
--          이 파일 전체를 붙여넣고 Run (한 번만 실행하면 됩니다)
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1) 동아리 설정 (한 줄짜리 테이블)
-- ------------------------------------------------------------
create table if not exists club_settings (
  id          smallint primary key default 1,
  club_name   text    not null default '발자국',
  tagline     text    not null default '유기견·유기묘 봉사 동아리',
  generation  text    not null default '2기',
  notice      text    default '',
  fee         integer not null default 15000,
  bank        text    not null default '우리은행',
  account     text    not null default '1002964773832',
  holder      text    not null default '노혜림',
  recruiting  boolean not null default true,
  updated_at  timestamptz default now(),
  constraint club_settings_singleton check (id = 1)
);
insert into club_settings (id) values (1) on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 2) 가입 신청 (폼에서 들어오는 곳)
-- ------------------------------------------------------------
create table if not exists applications (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  name        text not null,
  student_id  text,
  department  text,
  phone       text,
  motivation  text,
  receipt     text,                       -- 입금증 이미지 (축소된 data URL)
  status      text not null default 'pending'
              check (status in ('pending','approved','rejected')),
  note        text,                       -- 반려 사유 / 운영진 메모
  reviewed_at timestamptz
);
create index if not exists applications_status_idx on applications (status, created_at desc);

-- ------------------------------------------------------------
-- 3) 구성원 (신청 승인 시 자동 생성)
-- ------------------------------------------------------------
create table if not exists members (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz default now(),
  name           text not null,
  student_id     text,
  department     text,
  phone          text,
  emoji          text,
  role           text not null default 'member' check (role in ('admin','member')),
  status         text not null default 'active' check (status in ('active','rest')),
  joined_on      date default current_date,
  memo           text,
  application_id uuid references applications(id) on delete set null
);

-- ------------------------------------------------------------
-- 4) 봉사 일정
-- ------------------------------------------------------------
create table if not exists events (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  date       date not null,
  title      text not null,
  place      text,
  start_time text,
  note       text
);
create index if not exists events_date_idx on events (date desc);

-- ------------------------------------------------------------
-- 5) 봉사 참여 기록 (일정 × 구성원)
-- ------------------------------------------------------------
create table if not exists attendance (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  event_id   uuid not null references events(id)  on delete cascade,
  member_id  uuid not null references members(id) on delete cascade,
  hours      numeric(4,1) not null default 0,
  unique (event_id, member_id)
);

-- ------------------------------------------------------------
-- 6) 재정 (운영진 전용)
-- ------------------------------------------------------------
create table if not exists finance (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  date       date not null default current_date,
  kind       text not null check (kind in ('income','expense')),
  category   text,
  amount     integer not null,
  memo       text,
  member_id  uuid references members(id) on delete set null
);
create index if not exists finance_date_idx on finance (date desc);

-- ============================================================
--  RLS (행 수준 보안)
--  · 신청서/구성원 연락처/재정은 운영진(로그인)만 볼 수 있습니다.
--  · 공개 페이지는 아래 members_public 뷰만 읽습니다.
-- ============================================================
alter table club_settings enable row level security;
alter table applications  enable row level security;
alter table members       enable row level security;
alter table events        enable row level security;
alter table attendance    enable row level security;
alter table finance       enable row level security;

drop policy if exists "settings read"    on club_settings;
drop policy if exists "settings write"   on club_settings;
drop policy if exists "apply insert"     on applications;
drop policy if exists "apply admin"      on applications;
drop policy if exists "members admin"    on members;
drop policy if exists "events read"      on events;
drop policy if exists "events admin"     on events;
drop policy if exists "attendance admin" on attendance;
drop policy if exists "finance admin"    on finance;

-- 동아리 정보 : 누구나 읽기 / 운영진만 수정
create policy "settings read"  on club_settings for select to anon, authenticated using (true);
create policy "settings write" on club_settings for all    to authenticated using (true) with check (true);

-- 가입 신청 : 누구나 제출(INSERT) / 조회·승인은 운영진만
create policy "apply insert" on applications for insert to anon, authenticated with check (true);
create policy "apply admin"  on applications for all    to authenticated using (true) with check (true);

-- 구성원 원본 : 운영진만 (학번·연락처 보호)
create policy "members admin" on members for all to authenticated using (true) with check (true);

-- 일정 : 누구나 읽기 / 운영진만 수정
create policy "events read"  on events for select to anon, authenticated using (true);
create policy "events admin" on events for all    to authenticated using (true) with check (true);

-- 참여 기록 · 재정 : 운영진만
create policy "attendance admin" on attendance for all to authenticated using (true) with check (true);
create policy "finance admin"    on finance    for all to authenticated using (true) with check (true);

-- ------------------------------------------------------------
--  공개용 구성원 뷰 (이름·학과·역할·봉사횟수만, 연락처 제외)
--  뷰는 소유자 권한으로 실행되므로 anon 이 안전하게 읽을 수 있습니다.
-- ------------------------------------------------------------
drop view if exists members_public;
create view members_public as
select
  m.id, m.name, m.department, m.role, m.status, m.joined_on, m.emoji, m.created_at,
  (select count(*)                     from attendance a where a.member_id = m.id) as volunteer_count,
  (select coalesce(sum(a.hours), 0)    from attendance a where a.member_id = m.id) as volunteer_hours
from members m;

grant select on members_public to anon, authenticated;

-- ------------------------------------------------------------
-- 7) 설문 응답 (survey.html 에서 들어오는 곳)
--    · 학기마다 새 설문을 돌릴 수 있게 topic 으로 구분합니다.
-- ------------------------------------------------------------
create table if not exists survey_responses (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  topic      text not null default '2026-2',   -- 설문 회차 (학기)
  name       text not null,
  station    text,                             -- 거주지 (인근 지하철역)
  opinion    text,                             -- 여러 보호소 봉사에 대한 의견
  party      text not null default 'maybe'     -- 개강파티 참여 여부
             check (party in ('yes','no','maybe')),
  note       text                              -- 운영진 메모
);
create index if not exists survey_topic_idx on survey_responses (topic, created_at desc);

-- 설문 접수도 신청 폼처럼 켜고 끌 수 있게
alter table club_settings add column if not exists survey_open     boolean default true;
alter table club_settings add column if not exists survey_close_at timestamptz;

alter table survey_responses enable row level security;

drop policy if exists "survey insert" on survey_responses;
drop policy if exists "survey admin"  on survey_responses;

-- 설문 : 누구나 제출(INSERT) / 조회는 운영진만 (이름·거주지가 담기므로)
create policy "survey insert" on survey_responses for insert to anon, authenticated with check (true);
create policy "survey admin"  on survey_responses for all    to authenticated using (true) with check (true);

-- 끝. 이제 Authentication → Users → Add user 로 운영진 계정을 만드세요.
--   Email    : unyoung@baljaguk.club   (아무거나 가능, config.js 와 같아야 함)
--   Password : 직접 정하세요 (코드에는 적지 않습니다 · 비상 로그인 전용)
--   Auto Confirm User : 켜기

-- ============================================================
--  폼(가입 신청) 접수 제어 · 예약 마감
-- ============================================================
alter table club_settings add column if not exists form_open      boolean     not null default true;
alter table club_settings add column if not exists form_open_at   timestamptz;   -- 이 시각부터 접수 (비우면 즉시)
alter table club_settings add column if not exists form_close_at  timestamptz;   -- 이 시각에 자동 마감 (비우면 수동)
alter table club_settings add column if not exists closed_message text default '이번 기수 모집이 마감되었어요. 다음 모집 소식을 기다려주세요!';
alter table club_settings add column if not exists capacity       integer;       -- 정원(선택). 승인 인원이 차면 자동 마감

-- 소속 학과 (동아리 구성원이 모두 같은 학과라 폼에서는 자동으로 채웁니다)
alter table club_settings add column if not exists department text default '산업경영융합학과';

-- ============================================================
--  실시간 동기화 (운영진 여러 명이 각자 폰에서 같은 화면을 보도록)
--  아래 테이블의 변경을 Realtime 으로 흘려보냅니다.
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['club_settings','applications','members','events','attendance','finance'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 재정 내역 증빙 사진 (선택, 축소된 data URL)
alter table finance add column if not exists receipt text;

-- ============================================================
--  후원 (운영진 전용) · 동아리 재정과는 분리해서 집계
-- ============================================================
create table if not exists campaigns (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  title      text not null,
  partner    text,                        -- 협업 브랜드 (예: 펫발란스)
  goal       integer,                     -- 목표 금액
  starts_on  date,
  ends_on    date,
  note       text,
  status     text not null default 'open' check (status in ('open','closed'))
);

create table if not exists donations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  member_id   uuid references members(id) on delete set null,   -- 구성원 후원이면
  donor_name  text,                                             -- 외부 후원자 이름
  amount      integer not null,
  date        date not null default current_date
);
create index if not exists donations_campaign_idx on donations (campaign_id, date desc);

alter table campaigns enable row level security;
alter table donations enable row level security;
drop policy if exists "campaigns admin" on campaigns;
drop policy if exists "donations admin" on donations;
create policy "campaigns admin" on campaigns for all to authenticated using (true) with check (true);
create policy "donations admin" on donations for all to authenticated using (true) with check (true);

do $$
declare t text;
begin
  foreach t in array array['campaigns','donations'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- 봉사 장소 기본값 (봉사모임 만들 때 자동으로 채워짐)
alter table club_settings add column if not exists place text default '천보금 보호소';

-- 사진은 목록에서 빼고 필요할 때만 받아온다 (있는지 여부만 컬럼으로)
alter table applications add column if not exists has_receipt boolean
  generated always as (receipt is not null and receipt <> '') stored;
alter table finance add column if not exists has_receipt boolean
  generated always as (receipt is not null and receipt <> '') stored;

-- ============================================================
--  가입 승인 시 회비를 '동아리비' 수입 한 줄에 안전하게 더하기
--  운영진 여러 명이 동시에 승인해도 금액이 덮어써지지 않도록
--  DB 안에서 행을 잠그고 더한다.
-- ============================================================
create or replace function add_fee_income(fee integer)
returns void
language plpgsql
as $$
declare
  target finance%rowtype;
  parts  text[];
begin
  select * into target
    from finance
   where kind = 'income'
     and (category like '%동아리비%' or category like '%회비%')
   order by date desc, created_at desc
   limit 1
   for update;

  if not found then
    insert into finance (date, kind, category, amount, memo)
    values (current_date, 'income', '동아리비 (1명)', fee, '');
    return;
  end if;

  parts := regexp_match(target.category, '^(.*?)\((\d+)\s*명\)\s*$');

  if parts is null then
    update finance set amount = amount + fee where id = target.id;
  else
    update finance
       set amount   = amount + fee,
           category = parts[1] || '(' || (parts[2]::int + 1) || '명)'
     where id = target.id;
  end if;
end $$;

revoke all on function add_fee_income(integer) from public, anon;
grant execute on function add_fee_income(integer) to authenticated;

-- 봉사지 여러 곳 (정기 봉사 장소 목록)
alter table club_settings add column if not exists places jsonb default '["천보금 보호소"]'::jsonb;
update club_settings
   set places = to_jsonb(array[coalesce(nullif(place,''), '천보금 보호소')])
 where places is null or jsonb_array_length(places) = 0;

-- ============================================================
--  설문 응답 본인 수정
--  · 이름이 정확히 일치하는 응답만 돌려준다 (부분검색 불가)
--  · 이름은 못 바꾸게 해서 남의 응답으로 덮어쓰는 걸 막는다
-- ============================================================
create or replace function survey_lookup(p_name text, p_topic text)
returns table (id uuid, name text, station text, opinion text, party text, created_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select r.id, r.name, r.station, r.opinion, r.party, r.created_at
    from survey_responses r
   where r.topic = p_topic
     and btrim(r.name) = btrim(p_name)
   order by r.created_at desc
   limit 5;
$$;

create or replace function survey_edit(p_id uuid, p_station text, p_opinion text, p_party text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update survey_responses
     set station = btrim(p_station),
         opinion = btrim(p_opinion),
         party   = case when p_party in ('yes','no','maybe') then p_party else party end
   where id = p_id;
end $$;

revoke all on function survey_lookup(text, text) from public;
revoke all on function survey_edit(uuid, text, text, text) from public;
grant execute on function survey_lookup(text, text) to anon, authenticated;
grant execute on function survey_edit(uuid, text, text, text) to anon, authenticated;

-- ============================================================
--  봉사모임 신청 폼 (모임마다 고유 주소, 선착순 마감)
-- ============================================================
alter table events add column if not exists capacity       integer;
alter table events add column if not exists signup_open     boolean not null default true;
alter table events add column if not exists signup_open_at  timestamptz;

-- 반환 열이 바뀌면 replace 가 안 되므로 먼저 지운다
drop function if exists event_public(uuid);
drop function if exists event_who(text);
drop function if exists event_signup(uuid, text, text);
drop function if exists event_cancel(uuid, text, text);

-- 모임 공개 정보 (비로그인도 볼 수 있는 것만)
create or replace function event_public(p_id uuid)
returns table (id uuid, date date, title text, place text, start_time text, note text,
               capacity integer, signup_open boolean, signup_open_at timestamptz,
               taken integer, names text[])
language sql security definer set search_path = public stable
as $$
  select e.id, e.date, e.title, e.place, e.start_time, e.note, e.capacity,
         e.signup_open, e.signup_open_at,
         (select count(*)::int from attendance a where a.event_id = e.id),
         (select coalesce(array_agg(m.name order by a.created_at), '{}')
            from attendance a join members m on m.id = a.member_id
           where a.event_id = e.id)
    from events e
   where e.id = p_id;
$$;

-- 이름이 같은 구성원 후보 (동명이인 대비, 학번만 함께 준다)
create or replace function event_who(p_name text)
returns table (student_id text)
language sql security definer set search_path = public stable
as $$
  select m.student_id from members m
   where btrim(m.name) = btrim(p_name)
   order by m.student_id;
$$;

-- 신청 (행을 잠그고 정원을 세므로 동시에 눌러도 초과되지 않는다)
create or replace function event_signup(p_event uuid, p_name text, p_sid text)
returns text
language plpgsql security definer set search_path = public
as $$
declare e events%rowtype; mid uuid; cnt int; taken int;
begin
  select * into e from events where id = p_event for update;
  if not found then return 'noevent'; end if;
  if e.signup_open is false then return 'closed'; end if;
  if e.signup_open_at is not null and now() < e.signup_open_at then return 'before'; end if;

  select count(*) into cnt from members m
   where btrim(m.name) = btrim(p_name)
     and (p_sid is null or p_sid = '' or m.student_id = p_sid);
  if cnt = 0 then return 'nomatch'; end if;
  if cnt > 1 then return 'many'; end if;

  select m.id into mid from members m
   where btrim(m.name) = btrim(p_name)
     and (p_sid is null or p_sid = '' or m.student_id = p_sid);

  if exists (select 1 from attendance a where a.event_id = p_event and a.member_id = mid) then
    return 'dup';
  end if;

  select count(*) into taken from attendance where event_id = p_event;
  if e.capacity is not null and taken >= e.capacity then return 'full'; end if;

  insert into attendance (event_id, member_id, hours) values (p_event, mid, 0);
  return 'ok';
end $$;

-- 신청 취소
create or replace function event_cancel(p_event uuid, p_name text, p_sid text)
returns text
language plpgsql security definer set search_path = public
as $$
declare mid uuid; cnt int; gone int;
begin
  select count(*) into cnt from members m
   where btrim(m.name) = btrim(p_name)
     and (p_sid is null or p_sid = '' or m.student_id = p_sid);
  if cnt = 0 then return 'nomatch'; end if;
  if cnt > 1 then return 'many'; end if;

  select m.id into mid from members m
   where btrim(m.name) = btrim(p_name)
     and (p_sid is null or p_sid = '' or m.student_id = p_sid);

  delete from attendance where event_id = p_event and member_id = mid;
  get diagnostics gone = row_count;
  if gone = 0 then return 'none'; end if;
  return 'ok';
end $$;

revoke all on function event_public(uuid)              from public;
revoke all on function event_who(text)                 from public;
revoke all on function event_signup(uuid, text, text)  from public;
revoke all on function event_cancel(uuid, text, text)  from public;
grant execute on function event_public(uuid)             to anon, authenticated;
grant execute on function event_who(text)                to anon, authenticated;
grant execute on function event_signup(uuid, text, text) to anon, authenticated;
grant execute on function event_cancel(uuid, text, text) to authenticated;   -- 취소는 운영진만

-- ============================================================
--  1365 회원명부 등록 (id1365.html)
--  · 부원이 자기 이름을 적으면 생년월일 · 1365 포털 아이디 · 휴대전화를 적어 낸다
--  · 자원봉사단체 회원 명부(별지서식 9) 3쪽에 그대로 옮겨 적는 데 쓴다
-- ============================================================
create table if not exists member_1365 (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  member_id  uuid not null unique references members(id) on delete cascade,
  name       text not null,
  student_id text,
  birth      date,          -- 생년월일
  portal_id  text,          -- 1365 포털 아이디
  phone      text,
  note       text           -- 비고 (명부의 마지막 칸)
);
create index if not exists member_1365_name_idx on member_1365 (name);

alter table club_settings add column if not exists id1365_open     boolean not null default true;
alter table club_settings add column if not exists id1365_close_at timestamptz;

alter table member_1365 enable row level security;
drop policy if exists "id1365 admin" on member_1365;
create policy "id1365 admin" on member_1365 for all to authenticated using (true) with check (true);

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.member_1365';
  exception when duplicate_object then null;
  end;
end $$;

drop function if exists id1365_lookup(text);
drop function if exists id1365_submit(text, text, date, text, text);

-- 내 정보 불러오기
--  · 이름이 정확히 일치하는 구성원만 돌려준다 (부분검색 불가)
--  · 전화번호는 가운데를 가려서 준다 — 이름만 알면 번호를 보게 되는 걸 막기 위해
create or replace function id1365_lookup(p_name text)
returns table (student_id text, phone_mask text, birth date, portal_id text,
               submitted boolean, updated_at timestamptz)
language sql security definer set search_path = public stable
as $$
  select m.student_id,
         case when length(p.d) >= 7 then left(p.d, 3) || '-****-' || right(p.d, 4) end,
         r.birth, r.portal_id, (r.id is not null), r.updated_at
    from members m
    left join member_1365 r on r.member_id = m.id
    cross join lateral (
      select regexp_replace(coalesce(r.phone, m.phone, ''), '\D', '', 'g') as d
    ) p
   where btrim(m.name) = btrim(p_name)
   order by m.student_id
   limit 5;
$$;

-- 제출 (다시 내면 덮어쓴다 — 한 사람당 한 줄)
create or replace function id1365_submit(p_name text, p_sid text, p_birth date,
                                         p_portal text, p_phone text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  s     club_settings%rowtype;
  mid   uuid;
  mname text;
  msid  text;
  ph    text;
  cnt   int;
begin
  select * into s from club_settings where id = 1;
  if s.id1365_open is false then return 'closed'; end if;
  if s.id1365_close_at is not null and now() >= s.id1365_close_at then return 'closed'; end if;

  select count(*) into cnt from members m
   where btrim(m.name) = btrim(p_name)
     and (p_sid is null or p_sid = '' or m.student_id = p_sid);
  if cnt = 0 then return 'nomatch'; end if;
  if cnt > 1 then return 'many'; end if;

  select m.id, m.name, m.student_id, m.phone
    into mid, mname, msid, ph
    from members m
   where btrim(m.name) = btrim(p_name)
     and (p_sid is null or p_sid = '' or m.student_id = p_sid);

  if p_birth is null then return 'nobirth'; end if;
  if btrim(coalesce(p_portal, '')) = '' then return 'noportal'; end if;

  -- 번호를 새로 적었으면 그걸, 아니면 이미 있던 번호를 그대로 쓴다
  ph := coalesce(
          nullif(btrim(coalesce(p_phone, '')), ''),
          (select r.phone from member_1365 r where r.member_id = mid),
          ph);
  if coalesce(btrim(ph), '') = '' then return 'nophone'; end if;

  insert into member_1365 (member_id, name, student_id, birth, portal_id, phone)
  values (mid, mname, msid, p_birth, btrim(p_portal), ph)
  on conflict (member_id) do update
     set name       = excluded.name,
         student_id = excluded.student_id,
         birth      = excluded.birth,
         portal_id  = excluded.portal_id,
         phone      = excluded.phone,
         updated_at = now();
  return 'ok';
end $$;

revoke all on function id1365_lookup(text)                          from public;
revoke all on function id1365_submit(text, text, date, text, text)  from public;
grant execute on function id1365_lookup(text)                         to anon, authenticated;
grant execute on function id1365_submit(text, text, date, text, text) to anon, authenticated;

-- ============================================================
--  봉사 실적 확정
--  · 모임을 만들고 명단을 채운 뒤 운영진이 '확정'을 눌러야
--    참여한 사람의 봉사 실적(누적 횟수)에 들어간다.
--  · 확정을 풀면 실적에서 빠지고 명단은 그대로 남는다.
-- ============================================================
alter table events add column if not exists confirmed_at timestamptz;

-- ============================================================
--  보호소 적립금
--  · 봉사를 확정하면 (참여 인원 × 1인당 적립금) 만큼 그 보호소 앞으로 쌓인다.
--  · 적립액은 따로 저장하지 않고 확정된 봉사에서 그때그때 계산한다
--    (명단을 고치면 금액도 같이 따라간다). 1인당 금액만 확정 시점에 박아둔다.
--  · 실제로 물품을 사서 전달하면 shelter_payouts 에 기록해 잔액에서 뺀다.
-- ============================================================
alter table events add column if not exists credit_per_person integer;

create table if not exists shelter_payouts (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz default now(),
  place      text not null,                 -- 보호소(봉사지) 이름
  amount     integer not null,
  date       date not null default current_date,
  memo       text
);
create index if not exists shelter_payouts_place_idx on shelter_payouts (place, date desc);

alter table shelter_payouts enable row level security;
drop policy if exists "payouts admin" on shelter_payouts;
create policy "payouts admin" on shelter_payouts for all to authenticated using (true) with check (true);

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.shelter_payouts';
  exception when duplicate_object then null;
  end;
end $$;
-- ============================================================
--  후원금 현황 공개 (fund.html)
--  · 금액 · 인원수 · 참여자 이름까지. 연락처·학번은 내려주지 않는다.
--  · 이름은 적립이 쌓이는 봉사지(1인당 금액 > 0)에 다녀온 사람만.
--  · 전달 기록에 사진을 붙일 수 있고, 사진은 목록에 싣지 않고 따로 받아간다.
-- ============================================================

-- 전달 기록 사진 (축소된 data URL)
alter table shelter_payouts add column if not exists photo text;
alter table shelter_payouts add column if not exists has_photo boolean
  generated always as (photo is not null and photo <> '') stored;

create or replace function public_funds()
returns json
language sql
security definer
set search_path = public
stable
as $$
with ent as (
  select e.id, e.date, e.place,
         (select count(*)::int from attendance a where a.event_id = e.id) as people,
         coalesce(e.credit_per_person, 0)::int as per,
         (select coalesce(array_agg(m.name order by m.name), '{}')
            from attendance a join members m on m.id = a.member_id
           where a.event_id = e.id) as names
    from events e
   where e.confirmed_at is not null
     and coalesce(e.credit_per_person, 0) > 0
),
rows_ as (
  select date, place, people, per, (people * per)::int as amount, names
    from ent where people > 0
),
saved as (select place, sum(amount)::int as saved from rows_ group by place),
paid  as (select place, sum(amount)::int as paid  from shelter_payouts group by place),
places as (
  select coalesce(s.place, p.place) as place,
         coalesce(s.saved, 0) as saved,
         coalesce(p.paid, 0)  as paid,
         coalesce(s.saved, 0) - coalesce(p.paid, 0) as remain
    from saved s
    full outer join paid p on p.place = s.place
),
-- 적립이 쌓이는 봉사지에 다녀온 사람만 (1인당 금액이 0인 천보금은 빠진다)
joined as (
  select m.id as mid, m.name
    from ent e
    join attendance a on a.event_id = e.id
    join members m    on m.id = a.member_id
),
helpers as (
  select name, count(*)::int as times
    from joined group by mid, name
)
select json_build_object(
  'generated_at', now(),
  'total_saved', (select coalesce(sum(saved), 0) from places),
  'total_paid',  (select coalesce(sum(paid), 0)  from places),
  'total_helpers', (select count(*)::int from helpers),
  'total_visits',  (select count(*)::int from joined),
  'places',  (select coalesce(json_agg(row_to_json(x) order by x.remain desc, x.place), '[]'::json)
                from places x),
  'helpers', (select coalesce(json_agg(row_to_json(h) order by h.times desc, h.name), '[]'::json)
                from helpers h),
  'entries', (select coalesce(json_agg(row_to_json(y)), '[]'::json)
                from (select date, place, people, per, amount, names
                        from rows_ order by date desc, place limit 100) y),
  'payouts', (select coalesce(json_agg(row_to_json(z)), '[]'::json)
                from (select id, date, place, amount, memo, coalesce(has_photo, false) as has_photo
                        from shelter_payouts order by date desc limit 50) z),
  'campaigns', (select coalesce(json_agg(row_to_json(c)), '[]'::json)
                  from (select c.title, c.partner, c.goal, c.starts_on, c.ends_on, c.status,
                               (select coalesce(sum(d.amount), 0)::int from donations d where d.campaign_id = c.id) as raised,
                               (select count(*)::int from donations d where d.campaign_id = c.id) as donors
                          from campaigns c
                         order by (c.status = 'closed'), c.created_at desc) c)
);
$$;

-- 전달 사진 한 장만 따로 받아가기 (목록에는 안 싣는다)
create or replace function public_payout_photo(p_id uuid)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select photo from shelter_payouts where id = p_id;
$$;

revoke all on function public_funds() from public;
revoke all on function public_payout_photo(uuid) from public;
grant execute on function public_funds() to anon, authenticated;
grant execute on function public_payout_photo(uuid) to anon, authenticated;

-- ============================================================
--  가입 신청에 기수 기록 (새 신청이 들어오면 지금 기수를 같이 저장)
-- ============================================================
alter table applications add column if not exists generation text;

create or replace function applications_set_generation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.generation is null or new.generation = '' then
    select generation into new.generation from club_settings where id = 1;
  end if;
  return new;
end;
$$;

drop trigger if exists applications_generation_trg on applications;
create trigger applications_generation_trg
  before insert on applications
  for each row execute function applications_set_generation();

create index if not exists applications_generation_idx on applications (generation, created_at desc);

-- ============================================================
--  1단계 · 권한 재설계 + 카카오 계정 연결
--  ------------------------------------------------------------
--  지금은 「로그인한 사람 = 운영진」이다.
--  카카오 로그인을 열면 부원 70명이 그 칸에 들어와 신청자 연락처·
--  입금증·재정을 보게 되므로, 그 전에 규칙을 다시 쓴다.
--
--  · 운영진 : 지금 쓰는 비밀번호 계정 + 명부에서 역할이 '운영진'인 사람
--  · 구성원 : 명부에 있고 졸업·탈퇴하지 않은 사람
--  · 그 외  : 지금과 똑같이 공개 페이지만
--
--  이 파일만 돌려도 화면은 하나도 안 바뀐다.
--  되돌리는 SQL은 맨 아래에 주석으로 넣어두었다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 명부에 카카오 계정을 이어붙일 자리
-- ------------------------------------------------------------
alter table members add column if not exists auth_user_id uuid;
create unique index if not exists members_auth_user_idx
  on members (auth_user_id) where auth_user_id is not null;

-- 졸업·탈퇴 상태를 새로 둔다 (active 활동중 / rest 휴식 / left 졸업·탈퇴)
alter table members drop constraint if exists members_status_check;
alter table members add constraint members_status_check
  check (status in ('active', 'rest', 'left'));

-- ------------------------------------------------------------
-- 2) 누가 운영진이고 누가 구성원인가
-- ------------------------------------------------------------
create or replace function is_admin()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select
    -- 지금 쓰는 운영진 계정 (config.js 의 ADMIN_EMAIL)
    coalesce((auth.jwt() ->> 'email') = 'unyoung@baljaguk.club', false)
    or exists (
      select 1 from members m
       where m.auth_user_id = auth.uid()
         and m.role = 'admin'
         and m.status <> 'left'
    );
$$;

create or replace function is_member()
returns boolean
language sql security definer stable
set search_path = public
as $$
  select is_admin() or exists (
    select 1 from members m
     where m.auth_user_id = auth.uid()
       and m.status <> 'left'      -- 졸업·탈퇴하면 그날로 막힌다
  );
$$;

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

revoke all on function is_admin()     from public;
revoke all on function is_member()    from public;
revoke all on function my_member_id() from public;
grant execute on function is_admin()     to anon, authenticated;
grant execute on function is_member()    to anon, authenticated;
grant execute on function my_member_id() to anon, authenticated;

-- ------------------------------------------------------------
-- 3) 규칙 다시 쓰기 — 11개
--    바뀌는 건 딱 하나다. authenticated(로그인한 사람) → is_admin()
--    공개 읽기 규칙(settings read, events read, apply insert,
--    survey insert)은 손대지 않는다.
-- ------------------------------------------------------------
drop policy if exists "settings write"   on club_settings;
create policy "settings write" on club_settings for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "apply admin"      on applications;
create policy "apply admin" on applications for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "members admin"    on members;
create policy "members admin" on members for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "events admin"     on events;
create policy "events admin" on events for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "attendance admin" on attendance;
create policy "attendance admin" on attendance for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "finance admin"    on finance;
create policy "finance admin" on finance for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "survey admin"     on survey_responses;
create policy "survey admin" on survey_responses for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "campaigns admin"  on campaigns;
create policy "campaigns admin" on campaigns for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "donations admin"  on donations;
create policy "donations admin" on donations for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "id1365 admin"     on member_1365;
create policy "id1365 admin" on member_1365 for all to authenticated
  using (is_admin()) with check (is_admin());

drop policy if exists "payouts admin"    on shelter_payouts;
create policy "payouts admin" on shelter_payouts for all to authenticated
  using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- 4) 규칙을 건너뛰는 함수 두 개에도 자물쇠
-- ------------------------------------------------------------
create or replace function event_cancel(p_event uuid, p_name text, p_sid text)
returns text
language plpgsql security definer set search_path = public
as $$
declare mid uuid; cnt int; gone int;
begin
  if not is_admin() then raise exception '운영진만 취소할 수 있어요'; end if;

  select count(*) into cnt from members m
   where btrim(m.name) = btrim(p_name)
     and (p_sid is null or p_sid = '' or m.student_id = p_sid);
  if cnt = 0 then return 'nomatch'; end if;
  if cnt > 1 then return 'many'; end if;

  select m.id into mid from members m
   where btrim(m.name) = btrim(p_name)
     and (p_sid is null or p_sid = '' or m.student_id = p_sid);

  delete from attendance where event_id = p_event and member_id = mid;
  get diagnostics gone = row_count;
  if gone = 0 then return 'none'; end if;
  return 'ok';
end $$;

create or replace function add_fee_income(fee integer)
returns void
language plpgsql
as $$
declare
  target finance%rowtype;
  parts  text[];
begin
  if not is_admin() then raise exception '운영진만 쓸 수 있어요'; end if;

  select * into target
    from finance
   where kind = 'income'
     and (category like '%동아리비%' or category like '%회비%')
   order by date desc, created_at desc
   limit 1
   for update;

  if not found then
    insert into finance (date, kind, category, amount, memo)
    values (current_date, 'income', '동아리비 (1명)', fee, '');
    return;
  end if;

  parts := regexp_match(target.category, '^(.*?)\((\d+)\s*명\)\s*$');

  if parts is null then
    update finance set amount = amount + fee where id = target.id;
  else
    update finance
       set amount   = amount + fee,
           category = parts[1] || '(' || (parts[2]::int + 1) || '명)'
     where id = target.id;
  end if;
end $$;

revoke all on function add_fee_income(integer) from public, anon;
grant execute on function add_fee_income(integer) to authenticated;

-- ============================================================
--  여기부터 카카오 로그인용
-- ============================================================

-- ------------------------------------------------------------
-- 5) 내가 누구인지 (연락처·학번은 절대 안 내려준다)
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
                'id', m.id, 'name', m.name, 'role', m.role, 'status', m.status)
         from members m where m.auth_user_id = auth.uid()),
      json_build_object('login', true, 'linked', false))
  end;
$$;

revoke all on function me() from public;
grant execute on function me() to anon, authenticated;

-- ------------------------------------------------------------
-- 6) 카카오 계정을 명부의 내 이름에 잇기
--    이름 + 휴대폰 뒤 4자리로 확인한다.
--    · 한 번 이어지면 다른 카카오 계정은 그 이름을 못 가져간다
--    · 1시간에 5번 틀리면 잠긴다 (뒤 4자리를 찍어서 맞히는 걸 막는다)
-- ------------------------------------------------------------
create table if not exists claim_attempts (
  auth_user_id uuid primary key,
  tries        int not null default 0,
  last_at      timestamptz not null default now()
);
alter table claim_attempts enable row level security;   -- 아무도 직접 못 읽는다

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

  update members set auth_user_id = auth.uid() where id = m.id;
  delete from claim_attempts where auth_user_id = auth.uid();

  return json_build_object('ok', true, 'name', m.name, 'role', m.role);
end $$;

revoke all on function claim_member(text, text) from public, anon;
grant execute on function claim_member(text, text) to authenticated;

-- ------------------------------------------------------------
-- 7) 확인
-- ------------------------------------------------------------
-- 규칙 11개가 모두 '운영진만' 으로 나와야 한다
select tablename as 테이블, policyname as 규칙,
       case when qual like '%is_admin%' then '운영진만' else coalesce(qual, '(없음)') end as 조건
  from pg_policies
 where schemaname = 'public'
   and (policyname like '%admin%' or policyname = 'settings write')
 order by tablename;

-- 운영진 화면(admin.html)에서 신청 목록·재정이 그대로 보이면 제대로 된 것.


--  발자국 🐾 2단계 · 내 활동 내역
--  Supabase 대시보드 → SQL Editor → New query →
--  이 파일 전체를 붙여넣고 Run (한 번만 실행하면 됩니다)
--
--  · 로그인한 본인의 기록만 내려갑니다
--  · 이름·연락처·학번은 한 글자도 나가지 않습니다
--  · 운영진이 「확정」한 봉사만 셉니다
-- ============================================================

create or replace function my_activity()
returns json
language sql
security definer
set search_path = public
stable
as $$
with me_ as (
  select m.id from members m where m.auth_user_id = auth.uid()
),
mine as (
  select e.id as event_id, e.date, e.title, e.place,
         coalesce(e.credit_per_person, 0)::int as per
    from attendance a
    join me_      on me_.id = a.member_id
    join events e on e.id    = a.event_id
   where e.confirmed_at is not null
),
byplace as (
  select place, count(*)::int as times, sum(per)::int as credit
    from mine where per > 0 group by place
)
select case when not exists (select 1 from me_) then null else
  json_build_object(
    'times',        (select count(*)::int               from mine),
    'last_date',    (select max(date)                   from mine),
    'credit_total', (select coalesce(sum(per), 0)::int  from mine),
    'places',       (select coalesce(json_agg(json_build_object(
                       'place', place, 'times', times, 'credit', credit)
                       order by credit desc), '[]'::json) from byplace),
    'records',      (select coalesce(json_agg(json_build_object(
                       'event_id', event_id, 'date', date,
                       'title', title, 'place', place, 'per', per)
                       order by date desc), '[]'::json) from mine)
  )
end;
$$;

-- 로그인한 구성원만 부를 수 있습니다 (비로그인 anon 은 제외)
revoke all on function my_activity() from public, anon;
grant execute on function my_activity() to authenticated;
