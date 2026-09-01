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

-- 끝. 이제 Authentication → Users → Add user 로 운영진 계정을 만드세요.
--   Email    : unyoung@baljaguk.club   (아무거나 가능, config.js 와 같아야 함)
--   Password : 260324                  (운영진 페이지에서 입력할 비밀번호)
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
