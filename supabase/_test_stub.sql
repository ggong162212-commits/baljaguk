-- ============================================================
--  빈 포스트그레스에서 SQL 파일을 한 번 돌려보기 위한 받침대
--  (실서버에는 절대 실행하지 않는다 — Supabase 가 이미 갖고 있는 것들이다)
--
--  목적은 로직 검증이 아니라 **문법과 칸 이름 오류**를 미리 잡는 것이다.
--  claim_member 를 기억으로 다시 쓰다 claim_attempts 의 칸 이름을
--  틀렸던 사고(2026-10-20)를 같은 식으로 다시 겪지 않으려고 만들었다.
-- ============================================================

create extension if not exists pgcrypto;

-- Supabase 의 역할
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end $$;

-- auth 스키마 — 로그인한 사람이 누구인지 알려주는 자리
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;

create or replace function auth.role()
returns text
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

-- storage 스키마 — 사진이 들어가는 자리
create schema if not exists storage;

create table if not exists storage.buckets (
  id      text primary key,
  name    text not null,
  public  boolean not null default false,
  /* 실서버에 있는 칸들 — 올릴 수 있는 크기와 형식 */
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name      text,
  owner     uuid,
  /* 실제 Supabase 가 파일 크기를 여기에 담는다 ({"size": 12345, ...}) */
  metadata  jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
alter table storage.objects add column if not exists metadata jsonb;

alter table storage.objects enable row level security;

-- realtime — 실시간 발행용 발행물
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

grant usage on schema auth, storage to anon, authenticated, service_role;
