-- ============================================================
--  fix-27 — 기록 배지를 받으면 알림 (2026-11-24)
--  ------------------------------------------------------------
--  선고은님: 「봉사 5회 하면 뱃지 생기는데 뱃지 생겼다고 알람 안 가는 것 같은데?」
--
--  맞습니다. 배지 네 개(첫 봉사 · 5회 · 10회 · 보호소 3곳)는 「나」 탭을
--  열 때 **화면에서만** 셌습니다. 서버에는 배지를 받은 순간을 아는 곳이
--  없어서, 알림은 네 개를 다 모았을 때(명예의 전당)에만 갔습니다.
--
--  이렇게 바꾼다
--    ① member_badges — 누가 어느 배지를 언제 받았는지. 한 사람·한 배지에 평생 한 번
--    ② badge_try     — 배지 조건(badge_stats · 「나」 탭과 같은 규칙)을 보고
--                      새로 받은 배지만 적고, 「새 소식」 한 줄 + 폰 알림 한 번
--    ③ 언제 보나     — 명예의 전당과 같다: 봉사를 확정할 때 /
--                      확정된 봉사 명단에 사람이 더해질 때
--    ④ 이미 받은 배지 — 지금 한 번 알림을 보낸다 (선고은님 결정)
--
--  · 폰 알림 종류는 'praise' — 알림 설정의 「칭찬·축하」로 끈다 (명예의 전당과 같다)
--  · 확정을 풀었다 다시 해도, 배지가 줄었다 다시 늘어도 알림은 다시 안 간다
--  · 두 번 Run 해도 괜찮다
-- ============================================================


-- ── ① 받은 배지 기록
create table if not exists member_badges (
  member_id  uuid not null references members(id) on delete cascade,
  badge      text not null check (badge in ('first', 'five', 'ten', 'places3')),
  earned_at  timestamptz not null default now(),
  notified   boolean not null default true,
  primary key (member_id, badge)
);
alter table member_badges enable row level security;
drop policy if exists "badges mine" on member_badges;
create policy "badges mine" on member_badges for select to authenticated
  using (member_id = my_member_id());


-- ── ② 새로 받은 배지 적기 + 알림
create or replace function badge_try(p_member uuid, p_notify boolean default true)
returns int
language plpgsql security definer
set search_path = public
as $$
declare t int; pl int; b record; got int := 0; head text; tail text;
begin
  if p_member is null then return 0; end if;
  if not exists (select 1 from members where id = p_member and status <> 'left') then return 0; end if;

  select s.times, s.places into t, pl from badge_stats(p_member) s;
  t := coalesce(t, 0); pl := coalesce(pl, 0);

  for b in
    select * from (values
      ('first',   t  >= 1,  '🌱 첫 봉사 배지를 받았어요!',  '첫 발자국을 남겼어요. 「나」 탭에서 확인해 보세요'),
      ('five',    t  >= 5,  '⭐ 봉사 5회 배지를 받았어요!', '벌써 다섯 번째 봉사예요. 고마워요'),
      ('ten',     t  >= 10, '👑 봉사 10회 배지를 받았어요!', '열 번의 봉사, 정말 대단해요'),
      ('places3', pl >= 3,  '💚 보호소 3곳 배지를 받았어요!', '세 곳의 보호소에 발자국을 남겼어요')
    ) v(badge, ok, title, body)
  loop
    continue when not b.ok;

    insert into member_badges (member_id, badge, notified)
    values (p_member, b.badge, p_notify)
    on conflict (member_id, badge) do nothing;
    continue when not found;          -- 이미 받은 배지
    got := got + 1;

    if p_notify then
      /* 새 소식 — 알림을 안 켠 사람도 앱 안에서는 본다 */
      insert into member_notices (created_at, member_id, kind, body)
      values (clock_timestamp(), p_member, 'badge', b.title);

      /* 폰 알림 — 「칭찬·축하」를 끈 사람에게는 안 간다 */
      insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
      values (p_member, 'praise', b.title, b.body, 'me.html',
              'badge:' || p_member || ':' || b.badge)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
  return got;
end;
$$;
revoke all on function badge_try(uuid, boolean) from public, anon, authenticated;


-- ── ③ 언제 보나 — 명예의 전당(fame_on_confirm · fame_on_attend)과 같은 때
create or replace function badge_on_confirm()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.confirmed_at is not null and old.confirmed_at is null then
    perform badge_try(a.member_id) from attendance a where a.event_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists badge_confirm_trg on events;
create trigger badge_confirm_trg after update of confirmed_at on events
  for each row execute function badge_on_confirm();

create or replace function badge_on_attend()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from events e where e.id = new.event_id and e.confirmed_at is not null) then
    perform badge_try(new.member_id);
  end if;
  return new;
end;
$$;
drop trigger if exists badge_attend_trg on attendance;
create trigger badge_attend_trg after insert on attendance
  for each row execute function badge_on_attend();


-- ── ④ 이미 받은 배지 — 지금 알림을 보낸다 (선고은님 결정 2026-11-24:
--       「어차피 지난 배지 보내도 몇 명 안 돼서 괜찮아」)
do $back$
declare r record; n int := 0;
begin
  for r in select id from members where status <> 'left' loop
    n := n + badge_try(r.id, true);
  end loop;
  raise notice '  이미 받은 배지 % 개 — 알림을 보냈어요', n;
end
$back$;
