-- ============================================================
--  명부와 안 이어진 로그인 보기 (2026-10-21)
-- ------------------------------------------------------------
--  알림 켬 진단에서 나온 것: 카카오로 들어왔는데 **명부와 안 이어진**
--  계정이 5개 있었다(4개는 오늘). 이 사람들은
--    · 알림을 켜도 서버에 저장되지 않고
--    · 커뮤니티도 못 본다
--  운영진이 「아직 본인 확인을 안 한 사람이 있다」를 알아야 안내할 수 있다.
--
--  ★ 이름·연락처·학번은 담지 않는다.
--    카카오가 준 **닉네임**과 **처음 들어온 날**만 보여 준다.
--    (명부와 안 이어졌으니 애초에 우리가 아는 이름이 없다)
-- ============================================================
create or replace function unlinked_logins()
returns json
language sql security definer stable
set search_path = public
as $fn$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
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
