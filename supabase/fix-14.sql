-- ============================================================
--  운영진이 「안 이어진 로그인」을 명부에 이어 주기 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「연결이 안 됐다는데 이름이랑 뒤 4자리를 알아서 넣어 줄 수 있어?」
--
--  본인 확인은 **그 사람의 카카오 계정**을 명부에 잇는 일이라
--  운영진이 대신 「넣어」 줄 수는 없다. 대신 할 수 있는 건,
--  그 사람이 **이미 한 번 카카오로 들어와서 생긴 계정**을 명부에 이어 주는 것.
--
--  ★ 안전장치
--    · 운영진만
--    · 그 auth 계정이 **아직 아무 구성원과도 안 이어져 있어야** 한다
--    · 그 구성원이 **아직 아무 계정과도 안 이어져 있어야** 한다
--      (이미 이어져 있으면 덮어쓰지 않는다 — 다른 사람 계정을 빼앗을 수 있다)
--    · 누가 언제 이었는지 남긴다
-- ============================================================
alter table members
  add column if not exists linked_by uuid references members(id);

create or replace function link_login(p_member uuid, p_nick text, p_at timestamptz)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare
  uid_ uuid;
  n_   int;
  nm_  text;
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'notadmin'); end if;

  select name into nm_ from members where id = p_member and status <> 'left';
  if nm_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;

  /* 이미 이어져 있으면 건드리지 않는다 */
  if exists (select 1 from members where id = p_member and auth_user_id is not null) then
    return json_build_object('ok', false, 'why', 'already');
  end if;

  /* 닉네임 + 들어온 때로 그 계정 하나를 집는다 (초 단위까지 같아야 한다) */
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

  update members
     set auth_user_id = uid_,
         linked_at = coalesce(linked_at, now()),
         linked_by = my_member_id()
   where id = p_member;

  /* 그 계정이 본인 확인을 틀렸던 기록은 지운다 — 잠김이 따라오지 않게 */
  delete from claim_attempts where auth_user_id = uid_;

  return json_build_object('ok', true, 'name', nm_);
end;
$fn$;
revoke all on function link_login(uuid, text, timestamptz) from public, anon;
grant execute on function link_login(uuid, text, timestamptz) to authenticated;
