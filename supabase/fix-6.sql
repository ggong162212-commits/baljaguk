-- ============================================================
--  최근 접속 — 날짜만 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「구성원들 최근 로그인 기록도 운영진 탭에서 볼 수 있을까?」
--
--  ★ 남기는 것은 **날짜 하나**뿐이다.
--    몇 시에 들어왔는지, 몇 번 들어왔는지, 무엇을 봤는지는 안 남긴다.
--    SPEC 의 「개인별 열람 기록은 남기지 않는다」를 지킨다.
--
--  카카오 로그인은 한 번 해 두면 오래 남아서
--  auth.users.last_sign_in_at 은 실제로 쓴 날과 다르다.
--  그래서 **앱을 연 날**을 기준으로 한다.
-- ============================================================

alter table members
  add column if not exists last_seen_on date;


-- ── 앱을 열면 하루 한 번만 날짜를 적는다
create or replace function touch_seen()
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  me_ uuid := my_member_id();
  d_  date := (now() at time zone 'Asia/Seoul')::date;
begin
  if me_ is null then return; end if;
  /* 이미 오늘로 적혀 있으면 아무것도 하지 않는다 */
  update members set last_seen_on = d_
   where id = me_ and (last_seen_on is null or last_seen_on < d_);
end;
$$;
revoke all on function touch_seen() from public, anon;
grant execute on function touch_seen() to authenticated;


-- ── 운영진만 본다. 구성원끼리는 서로 안 보인다.
create or replace function seen_who()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'id', m.id,
            'last_seen_on', m.last_seen_on,
            'days', case when m.last_seen_on is null then null
                         else ((now() at time zone 'Asia/Seoul')::date - m.last_seen_on) end)
            order by m.name), '[]'::json)
     from members m where m.status <> 'left')
end;
$$;
revoke all on function seen_who() from public, anon;
grant execute on function seen_who() to authenticated;


-- ============================================================
--  고정 공지는 세 개까지 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「공지는 최대 3개까지로 하자」
--  세 개면 홈에서 다 보이니 「모두 보기」가 필요 없다.
--  네 번째를 고정하려 하면 서버가 막는다 —
--  화면이 먼저 물어보고, 예면 가장 오래된 것을 내린 뒤 올린다.
--
--  읽기 조회로 먼저 확인: 지금 실서버 고정 공지는 1개 (풀릴 것 0개)
-- ============================================================
create or replace function posts_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare n int;
begin
  if new.type = 'notice' and not is_admin() then
    raise exception '공지는 운영진만 쓸 수 있어요';
  end if;
  if new.type = 'poll' and not is_admin() then
    raise exception '설문은 운영진만 만들 수 있어요';
  end if;
  /* 고정을 **새로 거는 순간**만 본다.
     이미 고정된 글을 글쓴이가 고치는 건 막지 않는다. */
  if new.pinned and not is_admin()
     and (tg_op = 'INSERT' or not coalesce(old.pinned, false)) then
    raise exception '고정은 운영진만 할 수 있어요';
  end if;

  /* 세 개를 넘기지 않는다 — 새로 고정할 때만 센다 */
  if new.pinned and (tg_op = 'INSERT' or not coalesce(old.pinned, false)) then
    select count(*) into n from posts
     where type = 'notice' and pinned and not hidden
       and id is distinct from new.id;
    if n >= 3 then
      raise exception '공지는 세 개까지예요';
    end if;
  end if;

  if tg_op = 'UPDATE' and new.hidden is distinct from old.hidden
     and not is_admin() and old.author_id <> my_member_id() then
    raise exception '숨기기는 운영진만 할 수 있어요';
  end if;
  return new;
end;
$$;


-- ── 가장 오래된 고정 공지를 내린다 (글은 그대로 남는다)
create or replace function unpin_oldest()
returns json
language plpgsql security definer
set search_path = public
as $$
declare old_ uuid;
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'notadmin'); end if;
  select id into old_ from posts
   where type = 'notice' and pinned and not hidden
   order by created_at asc limit 1;
  if old_ is null then return json_build_object('ok', false, 'why', 'none'); end if;
  update posts set pinned = false where id = old_;
  return json_build_object('ok', true, 'id', old_);
end;
$$;
revoke all on function unpin_oldest() from public, anon;
grant execute on function unpin_oldest() to authenticated;
