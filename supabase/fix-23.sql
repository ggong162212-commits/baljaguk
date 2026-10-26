-- ============================================================
--  fix-23 — 콘테스트가 열리면 알림이 한 번 나간다
--  ------------------------------------------------------------
--  콘테스트는 운영진이 정한 시작 시각이 되면 저절로 열린다(phase open).
--  그런데 「열렸다」고 알려 주는 것이 없었다 — 아무도 모르고 지나갈 수 있다.
--  글·댓글처럼 트리거로는 잡을 수 없다(아무 줄도 들어오지 않는 사건이다).
--  그래서 cron.sql 과 같은 방식으로 **10분마다** 들여다보고,
--  열린 것을 처음 본 그때 한 번만 쌓는다.
--
--  · 알림은 「새 글」과 같은 칸(kind 'post')을 따른다 — 그 알림을 끈 사람에게는 안 간다.
--  · member_id 는 null — 받는 사람을 한 줄로 두면 보내는 쪽(Edge Function)이
--    알림을 켠 사람에게 나눠 보낸다. 공지와 같은 꼴이다.
--  · dedupe_key 는 'contest-open:' || contests.id 다. contests 는 한 줄뿐이라
--    (one 이 늘 true) 운영진이 날짜를 고치거나 숨겼다 다시 열어도
--    같은 키가 되어 **두 번 나가지 않는다.**
--  · 한밤중에 깨우지 않으려면 **시작 시각을 아침으로** 정하면 된다.
--    열리는 시각과 알림 시각이 같다(10분 안쪽).
--
--  기존 cron 작업(baljaguk_tick·send·sweep)은 건드리지 않는다.
-- ============================================================

-- ── 1) 열렸는지 보고, 처음이면 한 줄 쌓는다
create or replace function contest_open_tick()
returns int
language plpgsql security definer
set search_path = public
as $fn$
declare n int := 0;
begin
  insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
  select null, 'post',
         '📸 사진 콘테스트가 열렸어요!',
         '봉사에서 찍은 사진·영상을 내 보세요',
         'me.html#contest=1',
         'contest-open:' || c.id
    from contests c
   where c.start_at is not null
     and now() >= c.start_at
     and (c.end_at is null or now() < c.end_at)
  on conflict (dedupe_key) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$fn$;

revoke all on function contest_open_tick() from public, anon, authenticated;


-- ── 2) 10분마다 보기 (pg_cron)
--    빈 포스트그레스에는 pg_cron 이 없다 — 그때는 예약만 건너뛴다.
do $outer$
begin
  if not exists (select 1 from pg_namespace where nspname = 'cron') then
    raise notice '  pg_cron 이 없어요 — 예약은 건너뜁니다 (여기서는 함수만 만들어요)';
    return;
  end if;

  perform cron.unschedule('baljaguk_contest')
    where exists (select 1 from cron.job where jobname = 'baljaguk_contest');

  perform cron.schedule('baljaguk_contest', '*/10 * * * *',
                        $$ select contest_open_tick(); $$);
  raise notice '  10분마다 콘테스트가 열렸는지 봅니다 (baljaguk_contest)';
end
$outer$;

-- 잘 걸렸는지 보기 (읽기 조회)
-- select jobname, schedule, active from cron.job order by jobname;
