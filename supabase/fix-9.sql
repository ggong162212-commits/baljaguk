-- ============================================================
--  카카오 연결 · 알림 겹침 (2026-10-21)
-- ============================================================


-- ============================================================
--  ① 「다른 카카오 계정과 이어져 있어요」
-- ------------------------------------------------------------
--  갤럭시 쓰는 구성원들이 막혔다.
--  카톡 안에서 본인 확인을 마쳤는데, 크롬에서 다시 들어가니 막힌다.
--
--  읽기 조회로 본 것 (2026-10-21):
--    카카오 연결 26개 · 카카오 번호 26가지
--    **같은 번호인데 계정이 둘로 갈린 경우 0건**
--    연결 안 된 계정 3개(모두 최근 2주, 이메일 없음) · 지금 잠긴 사람 0명
--  → 같은 번호가 갈린 게 아니라 **정말 다른 카카오 계정**이다.
--    안드로이드 크롬이 카톡 앱 계정이 아니라, 그 브라우저에 이미 로그인돼
--    있던 예전 카카오계정으로 들어간 것이다.
--
--  그래도 claim_member 에 구멍이 하나 있었다:
--  **이미 이어져 있으면 같은 사람인지 보지도 않고 막았다.**
--  카카오 번호가 같으면 같은 사람이다 — 그때는 들여보낸다.
-- ============================================================

create or replace function claim_member(p_name text, p_last4 text)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare
  m         members%rowtype;
  n         int;
  t         claim_attempts%rowtype;
  digits    text;
  me_kakao  text;
  old_kakao text;
begin
  if auth.uid() is null then
    return json_build_object('ok', false, 'why', 'nologin');
  end if;

  -- 이미 이어져 있으면 그대로
  select * into m from members where auth_user_id = auth.uid();
  if found then
    return json_build_object('ok', true, 'name', m.name, 'role', m.role, 'already', true);
  end if;

  -- 너무 많이 틀렸으면 잠근다
  select * into t from claim_attempts where auth_user_id = auth.uid();
  if found and t.tries >= 5 and t.last_at > now() - interval '1 hour' then
    return json_build_object('ok', false, 'why', 'locked');
  end if;

  digits := regexp_replace(coalesce(p_last4, ''), '[^0-9]', '', 'g');

  select count(*) into n from members
   where btrim(name) = btrim(p_name)
     and status <> 'left'
     and right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 4) = digits
     and digits <> '';

  if n <> 1 then
    insert into claim_attempts (auth_user_id, tries, last_at)
    values (auth.uid(), 1, now())
    on conflict (auth_user_id) do update
      set tries = case when claim_attempts.last_at > now() - interval '1 hour'
                       then claim_attempts.tries + 1 else 1 end,
          last_at = now();
    return json_build_object('ok', false, 'why', case when n = 0 then 'nomatch' else 'many' end);
  end if;

  select * into m from members
   where btrim(name) = btrim(p_name)
     and status <> 'left'
     and right(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 4) = digits;

  if m.auth_user_id is not null then
    /* ★ 같은 카카오 번호면 같은 사람이다 — 막지 않고 옮겨 준다.
       (한 사람에게 auth 사용자가 둘 생긴 경우) */
    select i.provider_id into me_kakao
      from auth.identities i
     where i.user_id = auth.uid() and i.provider = 'kakao' limit 1;
    select i.provider_id into old_kakao
      from auth.identities i
     where i.user_id = m.auth_user_id and i.provider = 'kakao' limit 1;

    if me_kakao is not null and me_kakao = old_kakao then
      update members set auth_user_id = auth.uid() where id = m.id;
      delete from claim_attempts where auth_user_id = auth.uid();
      return json_build_object('ok', true, 'name', m.name, 'role', m.role, 'moved', true);
    end if;

    /* 정말 다른 카카오 계정이다.
       ★ 틀린 기록은 남기지 않는다 — 이름·번호는 맞았으니
         이것 때문에 5회 잠김에 걸리면 안 된다. */
    return json_build_object('ok', false, 'why', 'taken');
  end if;

  update members set auth_user_id = auth.uid(),
                     linked_at = coalesce(linked_at, now())
   where id = m.id;
  delete from claim_attempts where auth_user_id = auth.uid();

  return json_build_object('ok', true, 'name', m.name, 'role', m.role);
end;
$fn$;


-- ── 운영진이 카카오 연결만 푼다 (글·댓글·봉사 기록은 그대로)
create or replace function unlink_member(p_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare old_ uuid; nm text;
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'notadmin'); end if;
  select auth_user_id, name into old_, nm from members where id = p_id;
  if nm is null then return json_build_object('ok', false, 'why', 'nomember'); end if;
  if old_ is null then return json_build_object('ok', false, 'why', 'notlinked'); end if;

  update members set auth_user_id = null where id = p_id;
  /* 그 계정이 들고 있던 잠김도 푼다 — 다시 할 때 막히지 않게 */
  delete from claim_attempts where auth_user_id = old_;
  return json_build_object('ok', true, 'name', nm);
end;
$fn$;
revoke all on function unlink_member(uuid) from public, anon;
grant execute on function unlink_member(uuid) to authenticated;


-- ============================================================
--  ② 한 동작에 알림이 두 개 가던 것
-- ------------------------------------------------------------
--  선고은님: 「언급(@) + 댓글을 남기면 알림이 두 개 가요」
--
--  내 글에 누가 「@선고은 고마워요」 댓글을 달면
--    · 댓글 알림 (outbox_on_comment 트리거)
--    · 언급 알림 (mention_add)
--  둘 다 간다. 한 동작이니 **하나만** 간다.
--
--  어느 것을 남길지: 언급 > 답글 > 댓글.
--  언급이 가장 콕 집어 부른 것이라 그것만 남긴다.
--
--  어떻게: dedupe_key 를 **받는 사람 + 원인(댓글) id** 로 맞춘다.
--  이미 `on conflict (dedupe_key) do nothing` 이 걸려 있으니
--  키만 같게 하면 **먼저 들어간 것이 남는다**.
--  댓글 트리거가 먼저 돌고(댓글이 저장될 때), 언급은 그 뒤에 온다.
--  그래서 언급이 들어올 때 **같은 키의 댓글 알림을 걷어내고** 넣는다.
--  아직 안 보낸 것(sent_at is null)만 걷어낸다 — 이미 보낸 걸 지우지 않는다.
-- ============================================================

/* 한 동작을 가리키는 키 — 받는 사람 + 원인 id */
create or replace function notice_key(p_to uuid, p_cause uuid)
returns text
language sql immutable
set search_path = public
as $fn$
  select 'one:' || coalesce(p_cause::text, '') || ':' || coalesce(p_to::text, '')
$fn$;


create or replace function mention_add(p_ids uuid[], p_post uuid, p_comment uuid, p_detail text)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare
  me_    uuid := my_member_id();
  n_     int := 0;
  cause_ uuid := coalesce(p_comment, p_post);
begin
  if me_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;

  insert into mentions (member_id, actor_id, post_id, comment_id, detail)
  select x, me_, p_post, p_comment, left(coalesce(p_detail, ''), 120)
    from unnest(coalesce(p_ids, '{}'::uuid[])) x
   where x is distinct from me_
     and exists (select 1 from members m where m.id = x and m.status <> 'left');
  get diagnostics n_ = row_count;

  /* ★ 같은 동작으로 이미 들어간 댓글·답글 알림을 걷어낸다.
     아직 안 보낸 것만 — 이미 보낸 알림을 지우지는 않는다. */
  delete from push_outbox o
   where o.sent_at is null
     and o.kind in ('comment', 'reply')
     and o.member_id = any (coalesce(p_ids, '{}'::uuid[]))
     and o.dedupe_key = notice_key(o.member_id, cause_);

  insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
  select x, 'mention',
         coalesce((select m.name from members m where m.id = me_), '구성원') || '님이 회원님을 언급했어요',
         left(coalesce(p_detail, ''), 60),
         'me.html#post=' || coalesce(p_post::text, ''),
         me_,
         notice_key(x, cause_)
    from unnest(coalesce(p_ids, '{}'::uuid[])) x
   where x is distinct from me_
     and exists (select 1 from members m where m.id = x and m.status <> 'left')
  on conflict (dedupe_key) do nothing;

  return json_build_object('ok', true, 'n', n_);
end;
$fn$;
revoke all on function mention_add(uuid[], uuid, uuid, text) from public, anon;
grant execute on function mention_add(uuid[], uuid, uuid, text) to authenticated;


-- ── 댓글·답글 알림도 같은 키를 쓴다
--    (예전 키 `comment:<id>` 는 받는 사람이 안 들어 있어 언급과 부딪히지 못했다)
create or replace function outbox_on_comment()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
declare
  who text; owner uuid; parent_owner uuid;
begin
  select name into who from members where id = new.author_id;
  select author_id into owner from posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into parent_owner from comments where id = new.parent_id;
  end if;

  /* 대댓글 — 내 댓글에 답글 */
  if parent_owner is not null and parent_owner <> new.author_id then
    insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
    values (parent_owner, 'reply',
            coalesce(who, '누군가') || '님이 내 댓글에 답글을 남겼어요',
            left(coalesce(new.body, ''), 40),
            'me.html#post=' || new.post_id, notice_key(parent_owner, new.id))
    on conflict (dedupe_key) do nothing;
  end if;

  /* 댓글 — 내 글에. 글쓴이가 위에서 이미 받았으면 안 보낸다 */
  if owner is not null and owner <> new.author_id
     and (parent_owner is null or parent_owner <> owner) then
    insert into push_outbox (member_id, kind, title, body, url, dedupe_key)
    values (owner, 'comment',
            coalesce(who, '누군가') || '님이 댓글을 남겼어요',
            left(coalesce(new.body, ''), 40),
            'me.html#post=' || new.post_id, notice_key(owner, new.id))
    on conflict (dedupe_key) do nothing;
  end if;
  return new;
end;
$fn$;

drop trigger if exists outbox_comment_trg on comments;
create trigger outbox_comment_trg after insert on comments
  for each row execute function outbox_on_comment();


-- ── 새 소식도 한 줄만
--    같은 댓글이 「댓글」로도 「언급」으로도 나와 두 줄이었다.
--    언급이 있으면 댓글·답글 줄은 빼고 언급만 남긴다.
create or replace function my_news(p_limit int default 30)
returns json
language sql security definer stable
set search_path = public
as $fn$
with me_ as (select my_member_id() as id),
mine as (select id from posts where author_id = (select id from me_)),
rows_ as (
  select 'comment' as kind, c.created_at, c.post_id,
         (select m.name from members m where m.id = c.author_id) as who,
         (select m.photo_path from members m where m.id = c.author_id) as who_photo,
         c.body as detail, null::text as kindly
    from comments c join mine on mine.id = c.post_id
   where c.author_id <> (select id from me_) and not c.hidden
     /* 같은 댓글에서 나를 불렀으면 「언급」 줄만 남긴다 */
     and not exists (select 1 from mentions n
                      where n.member_id = (select id from me_) and n.comment_id = c.id)
  union all
  select 'reaction', r.created_at, r.post_id,
         (select m.name from members m where m.id = r.member_id),
         (select m.photo_path from members m where m.id = r.member_id),
         null, r.kind
    from reactions r join mine on mine.id = r.post_id
   where r.member_id <> (select id from me_)
  union all
  /* 내 댓글에 달린 답글 */
  select 'reply', c.created_at, c.post_id,
         (select m.name from members m where m.id = c.author_id),
         (select m.photo_path from members m where m.id = c.author_id),
         c.body, null::text
    from comments c
    join comments par on par.id = c.parent_id
   where par.author_id = (select id from me_)
     and c.author_id <> (select id from me_) and not c.hidden
     and not exists (select 1 from mentions n
                      where n.member_id = (select id from me_) and n.comment_id = c.id)
  union all
  /* 나를 부른 글·댓글 */
  select 'mention', n.created_at, n.post_id,
         (select m.name from members m where m.id = n.actor_id),
         (select m.photo_path from members m where m.id = n.actor_id),
         n.detail, null::text
    from mentions n
   where n.member_id = (select id from me_)
     and n.actor_id is distinct from (select id from me_)
  union all
  /* 운영진이 남긴 소식 — 의견 답장 · 도움 됐어요 · 퀴즈 발표 */
  select n.kind, n.created_at, n.post_id, null::text, null::text,
         coalesce(n.body, n.detail), null::text
    from member_notices n where n.member_id = (select id from me_)
)
select case when not is_member() then null else coalesce(
  (select json_agg(json_build_object(
     'kind', kind, 'at', created_at, 'post_id', post_id,
     'who', who, 'who_photo', who_photo, 'detail', detail, 'react', kindly)
     order by created_at desc)
     from (select * from rows_ order by created_at desc
            limit greatest(1, least(coalesce(p_limit, 30), 100))) z),
  '[]'::json) end;
$fn$;
