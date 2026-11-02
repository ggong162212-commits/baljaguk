-- ============================================================
--  fix-25 — 「봉사모임 만들기」가 「찾지 못했어요」로 막히던 것
--  ------------------------------------------------------------
--  까닭: events.start_time 은 **글자(text)** 칸인데 알림 문구를 만들 때
--        to_char(start_time, 'HH24:MI') 를 썼다. 그런 함수는 없어서
--        (SQLSTATE 42883 · function to_char(text, unknown) does not exist)
--        봉사모임을 넣는 순간 트리거가 터지고, REST 는 404 를 돌려준다.
--        화면에는 「찾지 못했어요」로만 보였다.
--
--  고치는 곳 세 군데 — 모두 같은 실수다
--    · outbox_on_event()   봉사모임을 만들 때 (지금 막히는 것)
--    · push_tick()         봉사 전날·당일 알림 (pg_cron 이 5분마다 부른다)
--    · outbox_on_promote() 대기자가 자리로 올라갔을 때
--
--  고치는 방법: 본문을 통째로 다시 쓰지 않는다.
--    실서버에 있는 정의를 그대로 읽어 to_char(…start_time…) 한 조각만
--    nullif(btrim(…start_time), '') 로 바꿔 다시 올린다.
--    바꿀 자리를 못 찾으면 아무것도 건드리지 않고 멈춘다.
--
--  바뀐 뒤 문구는 그대로다 — 「11/08(일) 10:00 천보금 보호소 · 선착순 10명」
--  시각을 안 적은 봉사는 전처럼 시각 없이 나온다.
-- ============================================================
do $outer$
declare
  f      text;
  src    text;
  fixed  text;
  n      int := 0;
begin
  foreach f in array array['outbox_on_event', 'push_tick', 'outbox_on_promote']
  loop
    select pg_get_functiondef(p.oid) into src
      from pg_proc p
     where p.proname = f
       and p.pronamespace = 'public'::regnamespace
     limit 1;

    if src is null then
      raise exception '실서버에 %() 가 없어요 — 아무것도 고치지 않았어요', f;
    end if;

    /* 줄끝이 \r\n 으로 저장된 경우가 있어 먼저 맞춘다 */
    src := replace(src, chr(13) || chr(10), chr(10));

    fixed := regexp_replace(
      src,
      $re$to_char\(\s*([a-zA-Z_]+)\.start_time\s*,\s*'HH24:MI'\s*\)$re$,
      $rp$nullif(btrim(\1.start_time), '')$rp$,
      'g');

    if fixed = src then
      /* 이미 고쳐져 있으면 그냥 지나간다. 아예 다른 본문이면 멈춘다 */
      if position('start_time' in src) = 0 then
        raise exception '%() 안에 start_time 이 없어요 — 본문이 달라요. 멈췄어요', f;
      end if;
      raise notice '   %() — 고칠 자리가 없어요 (이미 고쳐진 듯)', f;
    else
      execute fixed;
      n := n + 1;
      raise notice '   %() — 시작 시각을 글자 그대로 쓰게 고쳤어요', f;
    end if;
  end loop;

  /* ----------------------------------------------------------
     push_tick() 에는 한 군데가 더 있다 — 「봉사 당일 감사」 알림에서
       case when e.start_time is null or e.start_time < time '12:00' …
     로 글자 칸을 time 과 견준다 (operator does not exist: text < time).
     그래서 5분마다 도는 알림이 통째로 멈춘다.
     ---------------------------------------------------------- */
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'push_tick' and p.pronamespace = 'public'::regnamespace
   limit 1;
  src := replace(src, chr(13) || chr(10), chr(10));

  if position($chk$!~ '^[0-9]{1,2}:[0-9]{2}$'$chk$ in src) > 0 then
    raise notice '   push_tick() 당일 조건 — 이미 고쳐져 있어요';
  else
    fixed := regexp_replace(
      src,
      $re$case\s+when\s+e\.start_time\s+is\s+null\s+or\s+e\.start_time\s*<\s*time\s*'12:00'\s*then\s+time\s*'13:00'\s*else\s+e\.start_time\s*\+\s*interval\s*'3 hours'\s+end$re$,
      $rp$case when coalesce(btrim(e.start_time), '') !~ '^[0-9]{1,2}:[0-9]{2}$' or btrim(e.start_time) < '12:00' then time '13:00' else (btrim(e.start_time)::time + interval '3 hours')::time end$rp$,
      'g');

    if fixed = src then
      raise exception 'push_tick() 안에서 「봉사 당일」 조건을 못 찾았어요 — 본문이 달라요. 아무것도 고치지 않고 멈췄어요';
    end if;

    execute fixed;
    n := n + 1;
    raise notice '   push_tick() 당일 조건 — 글자 시각을 바르게 견주도록 고쳤어요';
  end if;

  if n = 0 then
    raise notice 'fix-25 — 바꾼 것이 없어요 (이미 다 고쳐져 있어요)';
  else
    raise notice 'fix-25 — %군데를 고쳤어요. 이제 봉사모임을 만들 수 있어요', n;
  end if;
end $outer$;
