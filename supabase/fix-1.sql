-- ============================================================
--  1차 고침 — 2026-10-21
--  ① 의견을 보내면 운영진에게 알림이 가게
-- ============================================================
--  실서버에서 읽어 확인한 것:
--    push_outbox  : id, created_at, member_id, kind, title, body, url,
--                   dedupe_key, actor_id, sent_at, tries
--    feedback     : id, created_at, member_id, body, done_at, done_by,
--                   anon, reply, replied_at
--    feedback_send() 안에는 push_outbox 가 없었다 → 알림이 쌓이지 않았다
-- ============================================================

-- ── 의견이 들어오면 운영진 한 사람 한 사람에게 알림을 쌓는다
create or replace function notify_feedback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  who text;
begin
  /* 이름 없이 보낸 것은 이름을 쓰지 않는다 */
  if new.anon or new.member_id is null then
    who := '이름 없이';
  else
    select m.name into who from members m where m.id = new.member_id;
    who := coalesce(who, '구성원');
  end if;

  insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
  select m.id,
         'feedback',
         '새 의견이 왔어요',
         who || ' · ' || left(regexp_replace(coalesce(new.body, ''), E'[\\n\\r]+', ' ', 'g'), 40),
         'admin.html#feedback',
         new.member_id,
         'feedback:' || new.id::text || ':' || m.id::text
    from members m
   where m.role = 'admin'
     and m.id is distinct from new.member_id;   -- 내가 보낸 건 나에게 안 간다

  return new;
end;
$$;

drop trigger if exists trg_notify_feedback on feedback;
create trigger trg_notify_feedback
  after insert on feedback
  for each row execute function notify_feedback();

-- ── 구독에 「의견」 칸을 더한다 (운영진만 쓰는 종류, 기본 켜짐)
alter table push_subscriptions
  add column if not exists want_feedback boolean not null default true;
