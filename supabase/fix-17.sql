-- ============================================================
--  「반응」·「대기 → 신청」 알림이 실제로는 안 가던 것 (2026-10-21)
-- ------------------------------------------------------------
--  알림 설정에 스위치는 있는데 아무것도 안 왔다 — 「켰는데 안 와요」.
--
--  실서버 읽기 조회로 본 것:
--    · reactions 표에 트리거 **0개** — 반응 알림은 처음부터 없었다
--    · outbox_on_promote 함수는 **있는데 어느 트리거에도 안 이어져 있다**
--    · push_outbox 에 reaction·promoted 종류가 **0건**
--
--  ★ 반응은 **10분 묶음**으로 보낸다.
--    하트를 연달아 받으면 그때마다 울리면 괴롭다.
--    dedupe_key 에 10분 칸을 넣어 같은 칸이면 한 번만 쌓인다.
--  ★ 대기 → 신청은 **즉시** (자리가 났다는 건 빨리 알아야 한다)
-- ============================================================


-- ── 대기 → 신청: 이미 있는 함수를 트리거에 잇는다
--    promote_waitlist 가 attendance 에 줄을 넣을 때 울린다.
--    ★ 본인이 직접 신청한 것과 구별해야 한다 —
--      대기자가 올라온 경우에만 알린다.
create or replace function outbox_on_promote()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
declare e events%rowtype; dow text;
begin
  /* 대기에서 올라온 것이 아니면 알리지 않는다 (본인이 누른 신청) */
  if not coalesce(new.from_waitlist, false) then return new; end if;

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
$fn$;

/* 대기에서 올라온 줄인지 적어 둘 칸 */
alter table attendance
  add column if not exists from_waitlist boolean not null default false;

drop trigger if exists outbox_promote_trg on attendance;
create trigger outbox_promote_trg after insert on attendance
  for each row execute function outbox_on_promote();


-- ── 대기자를 올릴 때 그 표시를 남긴다
do $outer$
declare src text; i int;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'promote_waitlist' limit 1;
  if src is null then raise notice 'promote_waitlist 를 못 찾았어요'; return; end if;
  if position($chk$from_waitlist$chk$ in src) > 0 then
    raise notice '이미 되어 있어요'; return;
  end if;

  /* 실제 문장:
       insert into attendance (event_id, member_id, hours) values (old.event_id, nxt, 0)
     → from_waitlist 를 하나 더 넣는다 */
  i := position($a$insert into attendance (event_id, member_id, hours) values (old.event_id, nxt, 0)$a$ in src);
  if i = 0 then
    raise notice '넣을 자리를 못 찾았어요 — 손으로 봐 주세요';
    return;
  end if;
  src := left(src, i - 1)
      || $b$insert into attendance (event_id, member_id, hours, from_waitlist) values (old.event_id, nxt, 0, true)$b$
      || substr(src, i + length($a$insert into attendance (event_id, member_id, hours) values (old.event_id, nxt, 0)$a$));

  execute src;
  raise notice '  대기 → 신청에 표시를 남기게 했어요';
end
$outer$;


-- ── 반응(하트) 알림 — 10분에 한 번만
create or replace function outbox_on_reaction()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
declare
  owner_ uuid;
  who_   text;
  slot_  text;
begin
  select author_id into owner_ from posts where id = new.post_id and not hidden;
  if owner_ is null or owner_ = new.member_id then return new; end if;

  select name into who_ from members where id = new.member_id;

  /* 10분 칸 — 같은 칸 안에서는 한 번만 쌓인다 (연달아 울리지 않게) */
  slot_ := to_char(date_trunc('hour', now())
             + (floor(extract(minute from now()) / 10) * interval '10 min'),
           'YYYYMMDDHH24MI');

  insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
  values (owner_, 'reaction',
          coalesce(who_, '누군가') || '님이 내 글을 좋아해요',
          '',
          'me.html#post=' || new.post_id,
          new.member_id,
          'reaction:' || new.post_id || ':' || owner_ || ':' || slot_)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$fn$;

drop trigger if exists outbox_reaction_trg on reactions;
create trigger outbox_reaction_trg after insert on reactions
  for each row execute function outbox_on_reaction();
