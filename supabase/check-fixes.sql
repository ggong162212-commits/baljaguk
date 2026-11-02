-- 실서버에 fix-24 · fix-25 · fix-26 · 시험 아이 지우기가 들어갔나 — 읽기만 한다
select 'fix-25 · 봉사모임 만들기' as 항목,
       case when exists (
              select 1 from pg_proc
               where pronamespace = 'public'::regnamespace
                 and prosrc ~ 'to_char\([a-zA-Z_]+\.start_time')
            or exists (
              select 1 from pg_proc
               where pronamespace = 'public'::regnamespace
                 and prosrc ~ 'start_time\s*<\s*time|start_time\s*\+\s*interval')
            then '✗ 아직이에요 — fix-25.sql'
            else '✓ 됐어요' end as 상태
union all
select 'fix-24 · 콘테스트 봉사지',
       case when exists (select 1 from pg_proc
                          where proname = 'contest_save'
                            and pronamespace = 'public'::regnamespace
                            and prosrc like '%shelterbad%')
            then '✓ 됐어요' else '✗ 아직이에요 — fix-24.sql' end
union all
select 'fix-26 · 봉사 올라왔어요 문구',
       case when exists (select 1 from pg_proc
                          where proname = 'outbox_on_event'
                            and pronamespace = 'public'::regnamespace
                            and prosrc like '%봉사가 올라왔어요%')
            then '✓ 됐어요' else '✗ 아직이에요 — fix-26.sql' end
union all
select 'fix-26 · 7시에 다시 알림',
       case when exists (select 1 from pg_proc
                          where proname = 'push_tick'
                            and pronamespace = 'public'::regnamespace
                            and prosrc like '%volopen:%')
            then '✓ 됐어요' else '✗ 아직이에요 — fix-26.sql' end
union all
select 'fix-26 · 앱이 신청 시각을 앎',
       case when exists (select 1 from pg_proc
                          where proname = 'vol_board'
                            and pronamespace = 'public'::regnamespace
                            and prosrc like '%signup_open_at%')
            then '✓ 됐어요' else '✗ 아직이에요 — fix-26.sql' end
union all
select '시험 아이 지우기 (강즤·덕자)',
       case when exists (select 1 from animals
                          where name in ('강즤', '덕자')
                            and place = '동물보호센터 다솜'
                            and created_at < timestamptz '2026-10-22 00:00+09')
            then '✗ 아직 남아 있어요 — clean-test-animals.sql'
            else '✓ 지워졌어요' end;
