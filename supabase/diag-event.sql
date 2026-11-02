-- ============================================================
--  진단 — 「봉사모임 만들기」가 「찾지 못했어요」(404) 로 막히는 까닭
--  ------------------------------------------------------------
--  · 아무것도 저장하지 않는다. 마지막에 일부러 예외를 던져 전부 되돌린다.
--  · 넣어 보는 줄(제목 「진단용-되돌림」)도 남지 않는다.
--  · 404 는 서버가 **없는 함수·없는 표**를 만났다는 뜻이라,
--    events 에 걸린 트리거가 무엇을 부르는지부터 본다.
--  쓰는 법: Supabase SQL 편집기에 이 파일을 열어 그대로 Run.
--          맨 끝에 「진단 끝 — 되돌렸어요」 가 뜨면 정상이다.
-- ============================================================
do $$
declare
  r      record;
  s      text;
  m      text;
  dt     text;
  ok     boolean := false;
  줄     text := '';
begin
  raise notice ' ';
  raise notice '① events 에 걸린 트리거';
  for r in
    select t.tgname, p.proname, t.tgenabled,
           (t.tgtype::int & 4) > 0 as 넣을때, (t.tgtype::int & 16) > 0 as 고칠때
      from pg_trigger t
      join pg_proc p on p.oid = t.tgfoid
     where t.tgrelid = 'events'::regclass
       and not t.tgisinternal
     order by t.tgname
  loop
    raise notice '   % → %()  넣을때=% 고칠때=% 켜짐=%',
      r.tgname, r.proname, r.넣을때, r.고칠때, r.tgenabled;
  end loop;

  raise notice ' ';
  raise notice '② events 쓰기 정책';
  for r in
    select policyname, cmd, roles::text as roles
      from pg_policies where schemaname = 'public' and tablename = 'events'
     order by cmd, policyname
  loop
    raise notice '   % (%) %', r.policyname, r.cmd, r.roles;
  end loop;

  raise notice ' ';
  raise notice '③ 트리거가 건드리는 표가 있나';
  for r in
    select x.nm, to_regclass('public.' || x.nm) is not null as 있음
      from (values ('push_outbox'), ('hall_of_fame'), ('posts'), ('attendance'), ('members')) as x(nm)
  loop
    raise notice '   % — %', r.nm, case when r.있음 then '있음' else '★ 없음' end;
  end loop;

  raise notice ' ';
  raise notice '④ 진짜로 한 줄 넣어 보고 되돌리기';
  begin
    insert into events (title, date, place, capacity, credit_per_person, credit_unit, signup_open_at)
    values ('진단용-되돌림', (now() at time zone 'Asia/Seoul')::date + 7,
            '천보금 보호소', 1, 0, 'won', null);
    ok := true;
  exception when others then
    get stacked diagnostics s = returned_sqlstate, m = message_text, dt = pg_exception_detail;
  end;

  if ok then
    줄 := '들어갔어요 — 트리거는 멀쩡해요. 막는 것은 권한(RLS)이나 REST 쪽이에요';
  else
    줄 := '막혔어요 → SQLSTATE ' || s || ' · ' || m || coalesce(' · ' || dt, '');
  end if;
  raise notice '   %', 줄;

  /* 여기서 일부러 멈춘다 — 위에서 넣어 본 줄까지 전부 되돌아간다 */
  raise exception '진단 끝 — 되돌렸어요 (저장된 것 없음) · %', 줄;
end $$;
