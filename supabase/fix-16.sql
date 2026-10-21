-- ============================================================
--  안 이어진 로그인을 **id 로** 집는다 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「지우기를 누르면 찾지 못한다고 떠」
--
--  원인: 닉네임 + 들어온 시각으로 찾게 해 놨는데,
--  화면이 든 목록이 **낡으면** 그 조건에 아무것도 안 걸린다.
--  (방금 다른 곳에서 이어 준 로그인이 목록에 그대로 남아 있었다)
--  읽기 조회로 보니 SQL 조건 자체는 둘 다 1개를 정확히 찾았다 —
--  화면이 보내는 값이 그 사이에 쓸모없어진 것이다.
--
--  ★ 이제 목록이 **그 계정의 id** 를 같이 준다. id 로 집으면 흔들리지 않는다.
--    (운영진만 보는 값이고, 명부와 안 이어진 계정이라 아무 뜻이 없다)
--    그래도 서버는 「아직 아무와도 안 이어졌는지」를 매번 다시 확인한다.
-- ============================================================

create or replace function unlinked_logins()
returns json
language sql security definer stable
set search_path = public
as $fn$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'uid', u.id,
            'nick', coalesce(
                      u.raw_user_meta_data ->> 'name',
                      u.raw_user_meta_data ->> 'nickname',
                      u.raw_user_meta_data ->> 'full_name',
                      '(닉네임 없음)'),
            'at', u.created_at,
            'last_at', u.last_sign_in_at)
            order by u.created_at desc), '[]'::json)
     from auth.users u
    where exists (select 1 from auth.identities i
                   where i.user_id = u.id and i.provider = 'kakao')
      and not exists (select 1 from members m where m.auth_user_id = u.id))
end;
$fn$;
revoke all on function unlinked_logins() from public, anon;
grant execute on function unlinked_logins() to authenticated;


-- ── 잇기 — id 로
drop function if exists link_login(uuid, text, timestamptz);

create or replace function link_login(p_member uuid, p_uid uuid)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare nm_ text;
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'notadmin'); end if;

  select name into nm_ from members where id = p_member and status <> 'left';
  if nm_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;

  if exists (select 1 from members where id = p_member and auth_user_id is not null) then
    return json_build_object('ok', false, 'why', 'already');
  end if;

  /* 그 계정이 진짜 있고, 아직 아무와도 안 이어져 있어야 한다 */
  if not exists (select 1 from auth.users u where u.id = p_uid) then
    return json_build_object('ok', false, 'why', 'nologin');
  end if;
  if exists (select 1 from members m where m.auth_user_id = p_uid) then
    return json_build_object('ok', false, 'why', 'taken');
  end if;

  update members
     set auth_user_id = p_uid,
         linked_at = coalesce(linked_at, now()),
         linked_by = my_member_id()
   where id = p_member;

  delete from claim_attempts where auth_user_id = p_uid;
  return json_build_object('ok', true, 'name', nm_);
end;
$fn$;
revoke all on function link_login(uuid, uuid) from public, anon;
grant execute on function link_login(uuid, uuid) to authenticated;


-- ── 지우기 — id 로
drop function if exists drop_login(text, timestamptz);

create or replace function drop_login(p_uid uuid)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare nick_ text; made_ timestamptz;
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'notadmin'); end if;

  select coalesce(u.raw_user_meta_data ->> 'name',
                  u.raw_user_meta_data ->> 'nickname',
                  u.raw_user_meta_data ->> 'full_name', ''),
         u.created_at
    into nick_, made_
    from auth.users u where u.id = p_uid;

  if made_ is null then return json_build_object('ok', false, 'why', 'nologin'); end if;

  /* 명부와 이어진 계정은 절대 못 지운다 — 사람을 지우는 일이 된다 */
  if exists (select 1 from members m where m.auth_user_id = p_uid) then
    return json_build_object('ok', false, 'why', 'linked');
  end if;

  insert into dropped_logins (nick, made_at, dropped_by)
       values (nick_, made_, my_member_id());

  delete from claim_attempts where auth_user_id = p_uid;
  delete from auth.identities where user_id = p_uid;
  delete from auth.users where id = p_uid;

  return json_build_object('ok', true);
end;
$fn$;
revoke all on function drop_login(uuid) from public, anon;
grant execute on function drop_login(uuid) to authenticated;
