-- ============================================================
--  운영진 지원하기 — 2026-10-21
-- ------------------------------------------------------------
--  선고은님 요청. 새 표를 만들지 않고 feedback 을 그대로 쓴다.
--  kind 한 칸만 더하면 된다 — 받은 의견과 거의 같은 일이다.
--    kind = 'idea'  (지금까지의 의견, 기본값)
--    kind = 'apply' (운영진 지원)
--  익명은 없다 — 누가 지원했는지 알아야 하니까.
-- ============================================================

alter table feedback
  add column if not exists kind text not null default 'idea';

/* 받은 것 목록을 종류별로 빨리 찾게 */
create index if not exists feedback_kind_idx on feedback (kind, done_at, created_at desc);


-- ── 지원하기 (구성원)
create or replace function apply_staff(p_body text)
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  me_ uuid := my_member_id();
  r_  text;
begin
  if me_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;

  select role into r_ from members where id = me_;
  if r_ = 'admin' then return json_build_object('ok', false, 'why', 'already'); end if;

  /* 확인 대기 중인 지원이 있으면 또 받지 않는다 */
  if exists (select 1 from feedback f
              where f.member_id = me_ and f.kind = 'apply' and f.done_at is null) then
    return json_build_object('ok', false, 'why', 'pending');
  end if;

  insert into feedback (member_id, body, kind, anon)
       values (me_, left(btrim(coalesce(p_body, '')), 500), 'apply', false);

  /* 운영진 전원에게 알린다 */
  insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
  select m.id, 'apply',
         coalesce((select x.name from members x where x.id = me_), '구성원') || '님이 운영진에 지원했어요',
         left(btrim(coalesce(p_body, '')), 60),
         'admin.html#apply',
         me_,
         'apply:' || me_::text || ':' || to_char(now(), 'YYYYMMDDHH24MI') || ':' || m.id::text
    from members m
   where m.role = 'admin' and m.id is distinct from me_
  on conflict (dedupe_key) do nothing;

  return json_build_object('ok', true);
end;
$$;
revoke all on function apply_staff(text) from public, anon;
grant execute on function apply_staff(text) to authenticated;


-- ── 내 지원이 어떤 상태인가 (구성원 화면에서 줄을 어떻게 보일지)
create or replace function my_staff_apply()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_member() then null else
  (select json_build_object(
     'is_admin', (select m.role = 'admin' from members m where m.id = my_member_id()),
     'pending',  exists (select 1 from feedback f
                          where f.member_id = my_member_id()
                            and f.kind = 'apply' and f.done_at is null),
     'last',     (select json_build_object(
                    'created_at', f.created_at, 'body', f.body,
                    'reply', f.reply, 'done', f.done_at is not null)
                    from feedback f
                   where f.member_id = my_member_id() and f.kind = 'apply'
                   order by f.created_at desc limit 1)))
end;
$$;
revoke all on function my_staff_apply() from public, anon;
grant execute on function my_staff_apply() to authenticated;


-- ── 운영진이 보는 지원 목록
create or replace function staff_applies()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'id', f.id, 'created_at', f.created_at, 'body', f.body,
            'who', (select m.name from members m where m.id = f.member_id),
            'who_photo', (select m.photo_path from members m where m.id = f.member_id),
            'joined_on', (select m.joined_on from members m where m.id = f.member_id),
            'can_reply', f.member_id is not null,
            'reply', f.reply,
            'replied', f.replied_at is not null)
            order by f.created_at desc), '[]'::json)
     from feedback f
    where f.kind = 'apply' and f.done_at is null)
end;
$$;
revoke all on function staff_applies() from public, anon;
grant execute on function staff_applies() to authenticated;


-- ── 받은 의견은 이제 「의견」만 (지원은 따로 센다)
create or replace function feedback_open()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'id', f.id, 'created_at', f.created_at, 'body', f.body,
            'anon', f.anon,
            /* 익명이면 이름도 사진도 아예 꺼내지 않는다 */
            'who', case when f.anon then null
                        else (select m.name from members m where m.id = f.member_id) end,
            'who_photo', case when f.anon then null
                        else (select m.photo_path from members m where m.id = f.member_id) end,
            'can_reply', (not f.anon) and f.member_id is not null,
            'reply', f.reply,
            'replied', f.replied_at is not null)
            order by f.created_at desc), '[]'::json)
     from feedback f where f.done_at is null and f.kind = 'idea')
end;
$$;


-- ── 내가 보낸 의견도 「의견」만
create or replace function my_feedback()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_member() then null else
  (select coalesce(json_agg(json_build_object(
            'id', f.id, 'created_at', f.created_at, 'body', f.body,
            'reply', f.reply, 'replied_at', f.replied_at,
            'done', f.done_at is not null)
            order by f.created_at desc), '[]'::json)
     from feedback f
    where f.member_id = my_member_id() and not f.anon and f.kind = 'idea')
end;
$$;


-- ── 할 일에 「운영진 지원」을 더한다
create or replace function admin_todo()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  json_build_object(
    'unconfirmed', (select count(*)::int from events e
                     where e.date < (now() at time zone 'Asia/Seoul')::date
                       and e.confirmed_at is null),
    'applications', (select count(*)::int from applications a
                      where coalesce(a.status, 'pending') = 'pending'),
    'reports',     (select count(*)::int from reports r where r.done_at is null),
    'feedback',    (select count(*)::int from feedback f
                     where f.done_at is null and f.kind = 'idea'),
    'staff',       (select count(*)::int from feedback f
                     where f.done_at is null and f.kind = 'apply')
  )
end;
$$;

alter table push_subscriptions
  add column if not exists want_apply boolean not null default true;
