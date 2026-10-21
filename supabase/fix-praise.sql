-- ============================================================
--  칭찬해요 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「+ 누르면 칭찬해요가 생겨서 구성원 한 명 검색해서
--  칭찬 이유 쓰고 올리기. 모든 사람한테 알림 가고, 그 구성원한테는
--  본인이 칭찬받았다고 알림」
--
--  · posts.type = 'praise' + praised_member_id (이름이 아니라 id — 동명이인 안전)
--  · 나를 칭찬하기 · 2자 미만 · 탈퇴한 사람 칭찬은 서버에서도 막는다
--  · 피드: 「자유게시판」 필터에도 보이고, 줄마다 칭찬받은 사람(이름·사진·기수)을 붙인다
--  · 알림: 전체(쓴 사람·칭찬받은 사람 빼고)에 한 번, 칭찬받은 사람에게만 따로 한 번
--          — 칭찬받은 사람에게는 「새 글」 알림이 겹쳐 가지 않는다
--  · 알림 설정에 「칭찬」(want_praise, 기본 켬)
--  · 나 탭 「받은 칭찬 n」 — praise_received()
--
--  ★ feed()·post_one()·outbox_on_post() 는 통째로 옮겨 적지 않는다
--    (fix-11 과 같은 방법 — 서버가 제 정의를 읽어 한 자리씩 끼워 넣는다.
--     두 번 돌려도 「이미 되어 있어요」로 지나간다)
--  ★ 보내기 함수(functions/push/index.ts) 의 WANT 에 praise 한 줄을 더했다 —
--    배포 전에는 「칭찬」을 꺼도 칭찬 알림이 간다(나머지는 그대로 동작)
-- ============================================================

-- 1) 칸 · 글 종류
alter table posts add column if not exists praised_member_id uuid
  references members(id) on delete set null;
create index if not exists posts_praised_idx on posts (praised_member_id, created_at desc)
  where praised_member_id is not null;

alter table posts drop constraint if exists posts_type_check;
alter table posts add constraint posts_type_check
  check (type in ('review', 'poll', 'notice', 'free', 'praise'));

alter table push_subscriptions
  add column if not exists want_praise boolean not null default true;


-- 2) 칭찬 글 지키기 — 쉬운 말로 막는다
create or replace function praise_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if new.type is distinct from 'praise' then
    if new.praised_member_id is not null then
      raise exception '칭찬 글이 아니면 칭찬받는 사람을 넣을 수 없어요';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.praised_member_id is distinct from old.praised_member_id then
    raise exception '칭찬받는 사람은 바꿀 수 없어요. 지우고 다시 써 주세요';
  end if;
  if new.praised_member_id is null then
    raise exception '누구를 칭찬할지 골라 주세요';
  end if;
  if new.praised_member_id = new.author_id then
    raise exception '나 자신은 칭찬할 수 없어요';
  end if;
  if not exists (select 1 from members m
                  where m.id = new.praised_member_id and m.status <> 'left') then
    raise exception '지금 활동 중인 구성원만 칭찬할 수 있어요';
  end if;
  if char_length(btrim(coalesce(new.body, ''))) < 2 then
    raise exception '고마운 점을 두 글자 이상 적어 주세요';
  end if;
  return new;
end;
$$;

drop trigger if exists praise_guard_trg on posts;
create trigger praise_guard_trg before insert or update on posts
  for each row execute function praise_guard();


-- 3) 칭찬할 사람 찾기 — 나는 빼고, 이름·사진·기수만 (연락처·학번 없음)
create or replace function praise_people(p_q text default '')
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else coalesce(
    (select json_agg(json_build_object('id', x.id, 'name', x.name, 'photo', x.photo_path,
                                       'gen', x.generation) order by x.name)
       from (select m.id, m.name, m.photo_path, ap.generation
               from members m
               left join applications ap on ap.id = m.application_id
              where m.status <> 'left'
                and m.id is distinct from my_member_id()
                and (coalesce(p_q, '') = '' or m.name ilike '%' || p_q || '%')
              order by m.name limit 30) x), '[]'::json)
  end;
$$;

revoke all on function praise_people(text) from public, anon;
grant execute on function praise_people(text) to authenticated;


-- 4) 나를 칭찬한 글 — 개수와 글 목록만 (순위·비교 없음)
create or replace function praise_received()
returns json
language sql security definer stable
set search_path = public
as $$
  with me_ as (select my_member_id() as id)
  select case when not is_member() then null else json_build_object(
    'n', (select count(*)::int from posts p
           where p.type = 'praise' and p.praised_member_id = (select id from me_)
             and not p.hidden),
    'rows', (select coalesce(json_agg(j order by at desc), '[]'::json) from (
       select json_build_object(
                'id', p.id, 'created_at', p.created_at, 'body', left(p.body, 120),
                'author', (select json_build_object('id', m.id, 'name', m.name, 'photo', m.photo_path)
                             from members m where m.id = p.author_id),
                'photo', (select f.path from post_photos f
                           where f.post_id = p.id and coalesce(f.kind, 'photo') = 'photo'
                           order by f.sort limit 1)) as j,
              p.created_at as at
         from posts p
        where p.type = 'praise' and p.praised_member_id = (select id from me_)
          and not p.hidden
        order by p.created_at desc limit 50) y)
  ) end;
$$;

revoke all on function praise_received() from public, anon;
grant execute on function praise_received() to authenticated;


-- 5) 피드 · 글 하나 — 칭찬받은 사람을 붙이고, 「자유게시판」에도 칭찬을 보인다
do $outer$
declare src text; i int; fn text;
  ins constant text := $p$'praised', case when p.praised_member_id is not null then (select json_build_object('id', pm.id, 'name', pm.name, 'photo', pm.photo_path, 'gen', pa.generation) from members pm left join applications pa on pa.id = pm.application_id where pm.id = p.praised_member_id) end, $p$;
  anchor constant text := $a$'insta_ok', p.insta_ok,$a$;
begin
  foreach fn in array array['feed', 'post_one'] loop
    select pg_get_functiondef(p.oid) into src from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = fn limit 1;
    if src is null then raise exception '% 를 못 찾았어요', fn; end if;
    if position($c$'praised'$c$ in src) > 0 then
      raise notice '  % — 이미 되어 있어요', fn; continue;
    end if;
    i := position(anchor in src);
    if i = 0 then raise exception '% — 넣을 자리를 못 찾았어요', fn; end if;
    src := left(src, i - 1) || anchor || ' ' || ins || substr(src, i + length(anchor));

    if fn = 'feed' then
      i := position($f$(p_type   is null or p.type  = p_type)$f$ in src);
      if i = 0 then raise exception 'feed — 종류 거르는 자리를 못 찾았어요'; end if;
      src := left(src, i - 1)
          || $g$(p_type   is null or p.type  = p_type or (p_type = 'free' and p.type = 'praise'))$g$
          || substr(src, i + length($f$(p_type   is null or p.type  = p_type)$f$));
    end if;

    execute src;
    raise notice '  % — 칭찬받은 사람을 붙였어요', fn;
  end loop;
end
$outer$;


-- 6) 알림
--  6-1) 「새 글」 트리거는 칭찬 글(과 명예의 전당 글, fix-fame.sql)을 건너뛴다 — 따로 보낸다
do $outer$
declare src text; i int;
  anchor constant text := 'if new.hidden then return new; end if;';
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'outbox_on_post' limit 1;
  if src is null then raise exception 'outbox_on_post 를 못 찾았어요'; end if;
  if position($c$'praise'$c$ in src) > 0 then raise notice '  outbox_on_post — 이미 되어 있어요'; return; end if;
  i := position(anchor in src);
  if i = 0 then raise exception 'outbox_on_post — 넣을 자리를 못 찾았어요'; end if;
  src := left(src, i - 1) || anchor
      || $b$ if new.type in ('praise', 'fame') then return new; end if;$b$
      || substr(src, i + length(anchor));
  execute src;
  raise notice '  outbox_on_post — 칭찬·명예의 전당 글은 건너뛰어요';
end
$outer$;

--  6-2) 칭찬 알림
--    전체: 「○○님이 △△님을 칭찬했어요」 / 이유 앞 20자
--          쓴 사람·칭찬받은 사람은 빼고, 알림을 켜 둔 사람에게만 한 줄씩
--    받은 사람: 「회원님이 칭찬받았어요!」 / 「○○님: 이유 앞 20자」
create or replace function outbox_on_praise()
returns trigger
language plpgsql security definer
set search_path = public
as $$
declare who text; whom text; head text; tail text; url_ text;
begin
  if new.type is distinct from 'praise' or new.hidden or new.praised_member_id is null then
    return new;
  end if;
  select name into who  from members where id = new.author_id;
  select name into whom from members where id = new.praised_member_id;
  head := coalesce(who, '누군가') || '님이 ' || coalesce(whom, '구성원') || '님을 칭찬했어요';
  tail := left(btrim(coalesce(new.body, '')), 20);
  url_ := 'me.html#post=' || new.id;

  insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
  select m.id, 'praise', head, tail, url_, new.author_id,
         'praise:' || new.id || ':' || m.id
    from members m
   where m.status <> 'left'
     and m.id <> new.author_id
     and m.id <> new.praised_member_id
     and exists (select 1 from push_subscriptions s where s.member_id = m.id)
  on conflict (dedupe_key) do nothing;

  insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
  values (new.praised_member_id, 'praise', '회원님이 칭찬받았어요!',
          coalesce(who, '누군가') || '님: ' || tail, url_, new.author_id,
          'praise:' || new.id || ':' || new.praised_member_id)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists outbox_praise_trg on posts;
create trigger outbox_praise_trg after insert on posts
  for each row execute function outbox_on_praise();


-- 7) 알림 설정 — 「칭찬」을 읽고 바꿀 수 있게 (fix-8 판에 want_praise 만 더함)
create or replace function push_prefs(p_endpoint text)
returns json
language sql security definer stable
set search_path = public
as $fn$
select case when not is_member() then null else
  (select row_to_json(x) from (
     select want_post, want_comment, want_reply, want_reaction, want_notice,
            want_vol, want_promoted, want_poll, want_quiz, want_before, want_thanks,
            want_mention, want_apply, want_praise
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
                   'want_mention','want_apply','want_praise') then
    raise exception '모르는 알림 종류예요';
  end if;

  execute format(
    'update push_subscriptions set %I = $1 where member_id = $2 and endpoint = $3', p_key)
    using coalesce(p_on, true), my_member_id(), p_endpoint;
  return true;
end;
$fn$;

revoke all on function push_prefs(text) from public, anon;
revoke all on function push_prefs_set(text, text, boolean) from public, anon;
grant execute on function push_prefs(text) to authenticated;
grant execute on function push_prefs_set(text, text, boolean) to authenticated;
