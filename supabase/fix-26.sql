-- ============================================================
--  fix-26 — 신청 시작을 예약한 봉사
--  ------------------------------------------------------------
--  지금까지는
--    · 봉사모임을 만들면 그 자리에서 「봉사 신청이 열렸어요」가 갔다.
--      오후 7시부터 신청이어도 지금 열린 것처럼 보였다.
--    · 7시가 되어도 아무 알림이 없었다.
--    · 앱 봉사 탭은 신청 시작 시각을 아예 모르고 있어서
--      「신청하기」가 눌리는 채로 있었다 (눌러도 서버가 막는다).
--  이렇게 바꾼다
--    ① outbox_on_event  — 예약이면 제목을 「봉사가 올라왔어요」로,
--                         본문 끝에 「11/02 19:00부터 신청」을 붙인다
--    ② push_tick        — 그 시각이 지나면 「지금부터 신청할 수 있어요」를
--                         한 번 보낸다 (dedupe_key volopen:<봉사 id>)
--    ③ vol_board        — 화면이 알 수 있게 signup_open·signup_open_at 을 같이 준다
--  고치는 방법: 실서버 정의를 읽어 그 조각만 바꿔 다시 올린다.
--  자리를 못 찾으면 아무것도 건드리지 않고 멈춘다. 두 번 Run 해도 괜찮다.
-- ============================================================
do $outer$
declare
  src   text;
  fixed text;
  n     int := 0;
begin
  -- ① 봉사모임을 만들 때 가는 알림 ------------------------------
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'outbox_on_event' and p.pronamespace = 'public'::regnamespace
   limit 1;
  if src is null then raise exception '실서버에 outbox_on_event() 가 없어요'; end if;
  src := replace(src, chr(13) || chr(10), chr(10));

  if position('봉사가 올라왔어요' in src) > 0 then
    raise notice '   outbox_on_event() — 이미 고쳐져 있어요';
  else
    fixed := src;

    /* 제목 */
    if position($q$'vol', '봉사 신청이 열렸어요',$q$ in fixed) = 0 then
      raise exception 'outbox_on_event() 에서 알림 제목을 못 찾았어요 — 멈췄어요';
    end if;
    fixed := replace(fixed,
      $q$'vol', '봉사 신청이 열렸어요',$q$,
      $q$'vol', case when new.signup_open_at is not null and new.signup_open_at > now() then '봉사가 올라왔어요' else '봉사 신청이 열렸어요' end,$q$);

    /* 본문 끝 — 선착순 뒤에 「…부터 신청」을 잇는다 */
    if position($q$|| new.capacity || '명' else '' end,$q$ in fixed) = 0 then
      raise exception 'outbox_on_event() 에서 본문 끝을 못 찾았어요 — 멈췄어요';
    end if;
    fixed := replace(fixed,
      $q$|| new.capacity || '명' else '' end,$q$,
      $q$|| new.capacity || '명' else '' end || case when new.signup_open_at is not null and new.signup_open_at > now() then ' · ' || to_char(new.signup_open_at at time zone 'Asia/Seoul', 'MM/DD HH24:MI') || '부터 신청' else '' end,$q$);

    execute fixed;
    n := n + 1;
    raise notice '   outbox_on_event() — 예약이면 「봉사가 올라왔어요 … 부터 신청」으로 보내요';
  end if;

  -- ② 신청이 열리는 시각에 한 번 더 ----------------------------
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'push_tick' and p.pronamespace = 'public'::regnamespace
   limit 1;
  if src is null then raise exception '실서버에 push_tick() 이 없어요'; end if;
  src := replace(src, chr(13) || chr(10), chr(10));

  if position('volopen:' in src) > 0 then
    raise notice '   push_tick() — 이미 고쳐져 있어요';
  else
    if position('/* ---- 설문 마감 하루 전' in src) = 0 then
      raise exception 'push_tick() 에서 끼워 넣을 자리(설문 마감 하루 전)를 못 찾았어요 — 멈췄어요';
    end if;
    fixed := replace(src,
      '/* ---- 설문 마감 하루 전',
      $q$/* ---- 신청이 열리는 시각 ---- */
  for r in
    select e.*
      from events e
     where e.signup_open_at is not null
       and e.signup_open_at <= kst
       and e.signup_open_at > kst - interval '2 hours'
       and coalesce(e.signup_open, true)
       and e.date >= (now() at time zone 'Asia/Seoul')::date
  loop
    insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
    values (null, 'vol', '지금부터 신청할 수 있어요',
            to_char(r.date, 'MM/DD') || '(' ||
            case extract(dow from r.date)::int
              when 0 then '일' when 1 then '월' when 2 then '화' when 3 then '수'
              when 4 then '목' when 5 then '금' else '토' end || ') ' ||
            coalesce(nullif(btrim(r.start_time), '') || ' ', '') ||
            coalesce(r.place, '') ||
            case when r.capacity > 0 then ' · 선착순 ' || r.capacity || '명' else '' end,
            'me.html#tab=vol', 'volopen:' || r.id)
    on conflict (dedupe_key) do nothing;
  end loop;

  /* ---- 설문 마감 하루 전$q$);
    execute fixed;
    n := n + 1;
    raise notice '   push_tick() — 신청이 열리는 시각에 「지금부터 신청할 수 있어요」를 보내요';
  end if;

  -- ③ 앱 봉사 탭이 신청 시작 시각을 알게 ------------------------
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.proname = 'vol_board' and p.pronamespace = 'public'::regnamespace
   limit 1;
  if src is null then raise exception '실서버에 vol_board() 가 없어요'; end if;
  src := replace(src, chr(13) || chr(10), chr(10));

  if position('signup_open_at' in src) > 0 then
    raise notice '   vol_board() — 이미 고쳐져 있어요';
  else
    if position($q$'start_time', start_time, 'capacity', capacity,$q$ in src) = 0 then
      raise exception 'vol_board() 에서 넣을 자리를 못 찾았어요 — 멈췄어요';
    end if;
    fixed := replace(src,
      $q$'start_time', start_time, 'capacity', capacity,$q$,
      $q$'start_time', start_time, 'capacity', capacity, 'signup_open', signup_open, 'signup_open_at', signup_open_at,$q$);
    execute fixed;
    n := n + 1;
    raise notice '   vol_board() — 신청 시작 시각을 같이 내려줘요';
  end if;

  if n = 0 then
    raise notice 'fix-26 — 바꾼 것이 없어요 (이미 다 고쳐져 있어요)';
  else
    raise notice 'fix-26 — %군데를 고쳤어요', n;
  end if;
end $outer$;
