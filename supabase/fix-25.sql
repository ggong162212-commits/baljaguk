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

  if n = 0 then
    raise notice 'fix-25 — 바꾼 것이 없어요 (이미 다 고쳐져 있어요)';
  else
    raise notice 'fix-25 — %개 함수를 고쳤어요. 이제 봉사모임을 만들 수 있어요', n;
  end if;
end $outer$;
