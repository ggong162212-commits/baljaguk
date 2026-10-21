-- ============================================================
--  알림 설정에 「언급(@)」 더하기 (2026-10-21)
-- ------------------------------------------------------------
--  칸(`push_subscriptions.want_mention`)은 fix-2 에서 이미 만들었는데
--  **읽는 곳과 바꾸는 곳에 빠져 있었다.**
--    · push_prefs()      → 돌려주지 않아 화면이 항상 꺼짐으로 봤다
--    · push_prefs_set()  → 「모르는 알림 종류예요」로 막혔다
--  그래서 끄고 켤 방법이 아예 없었다.
--
--  `want_apply`(운영진 지원) 도 fix-5 에서 같은 일이 났다 — 같이 고친다.
-- ============================================================

create or replace function push_prefs(p_endpoint text)
returns json
language sql security definer stable
set search_path = public
as $fn$
select case when not is_member() then null else
  (select row_to_json(x) from (
     select want_post, want_comment, want_reply, want_reaction, want_notice,
            want_vol, want_promoted, want_poll, want_quiz, want_before, want_thanks,
            want_mention, want_apply
       from push_subscriptions
      where member_id = my_member_id() and endpoint = p_endpoint) x)
end;
$fn$;


create or replace function push_prefs_set(p_endpoint text, p_key text, p_on boolean)
returns boolean
language plpgsql security definer
set search_path = public
as $fn$
begin
  if not is_member() then return false; end if;
  /* 칸 이름을 그대로 받지 않는다 — 허용한 것만 */
  if p_key not in ('want_post','want_comment','want_reply','want_reaction','want_notice',
                   'want_vol','want_promoted','want_poll','want_quiz','want_before','want_thanks',
                   'want_mention','want_apply') then
    raise exception '모르는 알림 종류예요';
  end if;

  execute format(
    'update push_subscriptions set %I = $1 where member_id = $2 and endpoint = $3', p_key)
    using coalesce(p_on, true), my_member_id(), p_endpoint;
  return true;
end;
$fn$;
