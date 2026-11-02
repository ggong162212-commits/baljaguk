-- 실서버에 fix-24 · fix-25 가 들어갔나 — 읽기만 한다 (아무것도 바꾸지 않음)
select 'fix-25 · 봉사모임 만들기' as 항목,
       case when exists (
              select 1 from pg_proc
               where pronamespace = 'public'::regnamespace
                 and prosrc ~ 'to_char\([a-zA-Z_]+\.start_time')
            or exists (
              select 1 from pg_proc
               where pronamespace = 'public'::regnamespace
                 and prosrc ~ 'start_time\s*<\s*time|start_time\s*\+\s*interval')
            then '✗ 아직이에요 — fix-25.sql 을 Run 해 주세요'
            else '✓ 됐어요 (네 군데 다 고쳐짐)' end as 상태
union all
select 'fix-24 · 콘테스트 봉사지',
       case when exists (
              select 1 from pg_proc
               where pronamespace = 'public'::regnamespace
                 and proname = 'contest_save'
                 and prosrc like '%shelterbad%')
            then '✓ 됐어요 (설정에 있는 보호소만 받아요)'
            else '✗ 아직이에요 — fix-24.sql 을 Run 해 주세요' end;
