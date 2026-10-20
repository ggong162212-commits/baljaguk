-- ============================================================
--  발자국 · 예약 작업 (pg_cron)
--  이 파일은 community.sql 을 돌린 뒤 한 번만 실행한다.
--
--  ★ 아래 두 곳을 먼저 채운다
--     <PROJECT-REF> : Supabase 프로젝트 주소 앞부분
--     <PUSH-SECRET> : Edge Function Secrets 의 PUSH_SECRET 과 같은 값
--
--  ★ 이 파일에는 비밀값이 남는다. 저장소에 올리기 전에 지우거나,
--    SQL Editor 에 붙여 넣을 때만 채워서 쓴다.
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ① 5분마다 — 봉사 전날·감사, 설문 마감, 퀴즈 발표를 쌓는다
select cron.unschedule('baljaguk_tick')
 where exists (select 1 from cron.job where jobname = 'baljaguk_tick');

select cron.schedule(
  'baljaguk_tick',
  '*/5 * * * *',
  $$ select push_tick(); $$
);

-- ② 1분마다 — 쌓인 것을 실제로 보낸다 (Edge Function 호출)
select cron.unschedule('baljaguk_send')
 where exists (select 1 from cron.job where jobname = 'baljaguk_send');

select cron.schedule(
  'baljaguk_send',
  '* * * * *',
  $$
  select net.http_post(
    url     := 'https://<PROJECT-REF>.supabase.co/functions/v1/push',
    headers := jsonb_build_object(
                 'Content-Type',   'application/json',
                 'x-push-secret',  '<PUSH-SECRET>'),
    body    := '{}'::jsonb
  );
  $$
);

-- ③ 보낸 지 30일 지난 기록은 치운다 (매일 새벽 4시)
select cron.unschedule('baljaguk_sweep')
 where exists (select 1 from cron.job where jobname = 'baljaguk_sweep');

select cron.schedule(
  'baljaguk_sweep',
  '0 19 * * *',   -- UTC 19:00 = KST 04:00
  $$ delete from push_outbox where sent_at < now() - interval '30 days'; $$
);

-- 잘 걸렸는지 보기
-- select jobname, schedule, active from cron.job order by jobname;
