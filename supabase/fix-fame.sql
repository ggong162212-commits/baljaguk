-- ============================================================
--  명예의 전당 (2026-10-21) — fix-praise.sql 다음에 실행
-- ------------------------------------------------------------
--  선고은님: 「기록 배지 4개를 모두 달성하면 자동으로 피드가 올라가게.
--  『명예의 전당』 하면서 ~번째로 배지를 모두 달성했다고, 모두 (이름)을
--  축하해 주세요. 댓글·좋아요도 되고 알림도 가게」
--
--  · 배지 4개 = 「나」 탭 규칙 그대로 (my_activity · badgeCard)
--      첫 봉사(1회) · 5회 · 10회 — 확정된 봉사 횟수
--      보호소 3곳 — 확정된 봉사 중 1인당 적립(per > 0)이 있는 것의 (보호소, 단위) 가짓수
--    → 서버에서는 badge_stats() 하나로 센다
--  · 운영진이 봉사를 확정하는 순간(또는 확정된 봉사 명단에 사람이 더해지는 순간)
--    마지막 배지가 채워지면 posts.type='fame' 글이 한 개 생긴다
--  · 한 사람에 평생 한 번 — hall_of_fame(member_id 기본키)이 지킨다.
--    확정을 풀었다 다시 해도, 배지가 줄어도 글·번호는 그대로
--  · 「○번째」 — 달성 순서. 동시에 둘이 채워져도 번호가 겹치지 않게 잠그고 센다
--  · 글쓴이 칸(author_id)은 비울 수 없어 **주인공**을 넣는다(honored_member_id 도 같은 사람).
--    화면은 「발자국」(로고)으로 보여 준다. 그래서 축하 댓글·좋아요 알림이 주인공에게 간다
--  · 누구도 고칠 수 없고, 지우기는 운영진만 (앱에서 오는 요청 기준)
--  · 알림(「칭찬·축하」 want_praise 로 끈다): 전체 한 번(주인공 빼고) + 주인공에게만 한 번
--  · 이미 네 개를 다 모은 사람: 이 파일을 돌릴 때 달성일 순서대로 번호를 매겨
--    글을 만들고 **알림도 보낸다** (선고은님 결정 — 처음엔 「안 보냄」이었다)
-- ============================================================

-- 1) 칸 · 글 종류 · 명예의 전당 표
alter table posts add column if not exists honored_member_id uuid
  references members(id) on delete cascade;

alter table posts drop constraint if exists posts_type_check;
alter table posts add constraint posts_type_check
  check (type in ('review', 'poll', 'notice', 'free', 'praise', 'fame'));

create table if not exists hall_of_fame (
  member_id   uuid primary key references members(id) on delete cascade,
  rank        int  not null unique,
  achieved_at date,
  post_id     uuid references posts(id) on delete set null,
  notified    boolean not null default false,
  created_at  timestamptz not null default now()
);
alter table hall_of_fame enable row level security;
drop policy if exists "fame read" on hall_of_fame;
create policy "fame read" on hall_of_fame for select to authenticated using (is_member());


-- 2) 배지 계산 — 「나」 탭과 같은 규칙
create or replace function badge_stats(p_member uuid)
returns table (times int, places int)
language sql security definer stable
set search_path = public
as $$
  with mine as (
    select e.place, coalesce(e.credit_unit, 'won') as unit,
           coalesce(e.credit_per_person, 0)::int as per
      from attendance a
      join events e on e.id = a.event_id
     where a.member_id = p_member and e.confirmed_at is not null
  )
  select (select count(*)::int from mine),
         (select count(*)::int from (select place, unit from mine where per > 0
                                      group by place, unit) x);
$$;
revoke all on function badge_stats(uuid) from public, anon, authenticated;


-- 3) 명예의 전당에 올리기 — 조건이 맞고 아직 없을 때만. 올렸으면 번호를 돌려준다
create or replace function fame_try(p_member uuid, p_notify boolean default true,
                                    p_at date default null)
returns int
language plpgsql security definer
set search_path = public
as $$
declare t int; pl int; r int; nm text; pid uuid; url_ text;
begin
  if p_member is null then return null; end if;
  if exists (select 1 from hall_of_fame where member_id = p_member) then return null; end if;
  if not exists (select 1 from members where id = p_member and status <> 'left') then return null; end if;

  select b.times, b.places into t, pl from badge_stats(p_member) b;
  if coalesce(t, 0) < 10 or coalesce(pl, 0) < 3 then return null; end if;

  /* 동시에 둘이 채워져도 번호가 겹치지 않게 */
  perform pg_advisory_xact_lock(hashtext('baljaguk.hall_of_fame'));
  if exists (select 1 from hall_of_fame where member_id = p_member) then return null; end if;

  select coalesce(max(rank), 0) + 1 into r from hall_of_fame;
  select name into nm from members where id = p_member;
  pid := gen_random_uuid();
  url_ := 'me.html#post=' || pid;

  insert into hall_of_fame (member_id, rank, achieved_at, notified)
  values (p_member, r, coalesce(p_at, (now() at time zone 'Asia/Seoul')::date), p_notify);

  insert into posts (id, created_at, author_id, honored_member_id, type, body)
  values (pid, clock_timestamp(), p_member, p_member, 'fame',
          coalesce(nm, '') || '님이 기록 배지 네 개를 모두 모았어요! ' ||
          '첫 봉사부터 열 번째 봉사, 보호소 세 곳까지 — 모두 ' ||
          coalesce(nm, '') || '님을 축하해 주세요 🐾');

  update hall_of_fame set post_id = pid where member_id = p_member;

  if p_notify then
    /* 전체 — 주인공은 actor 로 빠진다 */
    insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
    values (null, 'praise',
            '🏆 ' || coalesce(nm, '') || '님이 명예의 전당에 올랐어요! 축하해 주세요',
            r || '번째 명예의 전당 주인공이에요', url_, p_member, 'fame:' || pid)
    on conflict (dedupe_key) do nothing;
    /* 주인공에게만 */
    insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
    values (p_member, 'praise',
            '🏆 축하해요! 회원님이 ' || r || '번째 명예의 전당 주인공이 됐어요',
            '모두가 축하 댓글을 남길 수 있어요', url_, null, 'fame:' || pid || ':me')
    on conflict (dedupe_key) do nothing;
  end if;
  return r;
end;
$$;
revoke all on function fame_try(uuid, boolean, date) from public, anon, authenticated;


-- 4) 언제 보나 — 봉사를 확정할 때 / 확정된 봉사 명단에 사람이 더해질 때
create or replace function fame_on_confirm()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.confirmed_at is not null and old.confirmed_at is null then
    perform fame_try(a.member_id) from attendance a where a.event_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists fame_confirm_trg on events;
create trigger fame_confirm_trg after update of confirmed_at on events
  for each row execute function fame_on_confirm();

create or replace function fame_on_attend()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if exists (select 1 from events e where e.id = new.event_id and e.confirmed_at is not null) then
    perform fame_try(new.member_id);
  end if;
  return new;
end;
$$;
drop trigger if exists fame_attend_trg on attendance;
create trigger fame_attend_trg after insert on attendance
  for each row execute function fame_on_attend();


-- 5) 명예의 전당 글 지키기 — 앱에서 오는 요청(authenticated)만 막는다.
--    서버 함수(fame_try)·운영진 SQL 은 지나간다.
--    ★ security definer 로 만들지 않는다 — 그래야 current_user 가 요청한 쪽이다
create or replace function fame_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if new.type = 'fame' or new.honored_member_id is not null then
      raise exception '명예의 전당 글은 자동으로만 올라가요';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.type = 'fame' and not is_admin() then
      raise exception '명예의 전당 글은 운영진만 지울 수 있어요';
    end if;
    return old;
  end if;
  /* UPDATE */
  if (old.type = 'fame' or new.type = 'fame')
     and (new.body is distinct from old.body or new.type is distinct from old.type
          or new.author_id is distinct from old.author_id
          or new.honored_member_id is distinct from old.honored_member_id) then
    raise exception '명예의 전당 글은 고칠 수 없어요';
  end if;
  return new;
end;
$$;
drop trigger if exists fame_guard_trg on posts;
create trigger fame_guard_trg before insert or update or delete on posts
  for each row execute function fame_guard();


-- 6) 「나」 탭 — 내 번호
create or replace function fame_me()
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else
    (select json_build_object('rank', h.rank, 'achieved_at', h.achieved_at, 'post_id', h.post_id)
       from hall_of_fame h where h.member_id = my_member_id())
  end;
$$;
revoke all on function fame_me() from public, anon;
grant execute on function fame_me() to authenticated;


-- 7) 피드 · 글 하나 — 명예의 전당 글에 번호와 주인공을 붙인다 (fix-11 과 같은 방법)
do $outer$
declare src text; i int; fn text;
  ins constant text := $p$'fame', case when p.type = 'fame' then (select json_build_object('rank', h.rank, 'achieved_at', h.achieved_at, 'id', hm.id, 'name', hm.name, 'photo', hm.photo_path) from hall_of_fame h join members hm on hm.id = h.member_id where h.member_id = p.honored_member_id) end, $p$;
  anchor constant text := $a$'insta_ok', p.insta_ok,$a$;
begin
  foreach fn in array array['feed', 'post_one'] loop
    select pg_get_functiondef(p.oid) into src from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = fn limit 1;
    if src is null then raise exception '% 를 못 찾았어요', fn; end if;
    if position($c$'fame', case$c$ in src) > 0 then
      raise notice '  % — 이미 되어 있어요', fn; continue;
    end if;
    i := position(anchor in src);
    if i = 0 then raise exception '% — 넣을 자리를 못 찾았어요', fn; end if;
    src := left(src, i - 1) || anchor || ' ' || ins || substr(src, i + length(anchor));
    execute src;
    raise notice '  % — 명예의 전당 칸을 붙였어요', fn;
  end loop;
end
$outer$;


-- 8) 이미 네 개를 다 모은 사람 — 달성일 순서대로 번호, 알림 보냄 (선고은님 결정 2026-10-21)
--    달성일 = 확정된 봉사를 날짜순으로 셌을 때 10회 · 보호소 3곳이 처음 함께 채워진 날
do $outer$
declare r record; cnt int := 0;
begin
  for r in
    with mine as (
      select a.member_id, e.id as eid, e.date, e.place,
             coalesce(e.credit_unit, 'won') as unit,
             coalesce(e.credit_per_person, 0)::int as per
        from attendance a
        join events e on e.id = a.event_id
       where e.confirmed_at is not null
    ),
    seq as (
      select m.*,
             row_number() over (partition by member_id order by date, eid) as n,
             case when per > 0 and row_number() over (partition by member_id, place, unit, (per > 0)
                                                      order by date, eid) = 1 then 1 else 0 end as newplace
        from mine m
    ),
    run as (
      select member_id, date, n,
             sum(newplace) over (partition by member_id order by date, eid
                                 rows between unbounded preceding and current row) as pl
        from seq
    )
    select run.member_id, min(run.date) as at
      from run
      join members mm on mm.id = run.member_id and mm.status <> 'left'
     where run.n >= 10 and run.pl >= 3
       and not exists (select 1 from hall_of_fame h where h.member_id = run.member_id)
     group by run.member_id
     order by min(run.date), run.member_id
  loop
    if fame_try(r.member_id, true, r.at) is not null then cnt := cnt + 1; end if;
  end loop;
  raise notice '  이미 다 모은 사람 % 명을 명예의 전당에 올렸어요 (알림 보냄)', cnt;
end
$outer$;
