-- ============================================================
--  안 이어진 로그인 지우기 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「안 잇기도 있으면 좋겠어 — 명부와 안 이어졌으니 삭제」
--
--  ★ 지울 수 있는 것은 **명부와 안 이어진** 카카오 로그인뿐이다.
--    명부와 이어진 계정은 서버가 막는다 (사람을 지우는 일이 된다).
--  ★ 그 계정이 쓴 글·댓글이 있으면 지우지 않는다 —
--    명부와 이어지기 전에는 글을 못 쓰니 있을 수 없지만, 있으면 멈춘다.
--  ★ 누가 언제 지웠는지 남긴다.
-- ============================================================
create table if not exists dropped_logins (
  id         uuid primary key default gen_random_uuid(),
  nick       text,
  made_at    timestamptz,
  dropped_at timestamptz not null default now(),
  dropped_by uuid references members(id)
);
alter table dropped_logins enable row level security;
drop policy if exists "dropped read" on dropped_logins;
create policy "dropped read" on dropped_logins for select to authenticated
  using (is_admin());


create or replace function drop_login(p_nick text, p_at timestamptz)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare
  uid_ uuid;
  n_   int;
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'notadmin'); end if;

  /* 닉네임 + 들어온 때로 딱 하나를 집는다 */
  select count(*), min(u.id) into n_, uid_
    from auth.users u
   where exists (select 1 from auth.identities i
                  where i.user_id = u.id and i.provider = 'kakao')
     and not exists (select 1 from members m where m.auth_user_id = u.id)
     and coalesce(u.raw_user_meta_data ->> 'name',
                  u.raw_user_meta_data ->> 'nickname',
                  u.raw_user_meta_data ->> 'full_name', '') = coalesce(p_nick, '')
     and u.created_at = p_at;

  if n_ <> 1 or uid_ is null then
    return json_build_object('ok', false, 'why', 'notone', 'n', n_);
  end if;

  /* 한 번 더 — 명부와 이어진 것은 절대 못 지운다 */
  if exists (select 1 from members m where m.auth_user_id = uid_) then
    return json_build_object('ok', false, 'why', 'linked');
  end if;

  /* 쓴 글·댓글이 있으면 멈춘다 (있을 수 없지만 확인한다) */
  if exists (select 1 from members m where m.auth_user_id = uid_) then
    return json_build_object('ok', false, 'why', 'haswork');
  end if;

  insert into dropped_logins (nick, made_at, dropped_by)
       values (p_nick, p_at, my_member_id());

  /* 딸린 것부터 치운다 */
  delete from claim_attempts where auth_user_id = uid_;
  delete from push_subscriptions
   where member_id in (select id from members where auth_user_id = uid_);
  delete from auth.identities where user_id = uid_;
  delete from auth.users where id = uid_;

  return json_build_object('ok', true);
end;
$fn$;
revoke all on function drop_login(text, timestamptz) from public, anon;
grant execute on function drop_login(text, timestamptz) to authenticated;
