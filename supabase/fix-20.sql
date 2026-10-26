-- ============================================================
--  fix-20 — 설문은 「임시 저장」 으로 먼저, 올릴 때 알림이 한 번
--  ------------------------------------------------------------
--  선고은님: 「설문은 수정 후 활성화했을 때 사람들한테 알림 가게.
--             모든 수정 후에 올라가는 게 좋겠다.」
--
--  지금 무슨 일이 있었나
--    ① 알림이 **글이 들어오는 순간** 나갔다 (after insert on posts).
--       운영진이 설문을 올리고 선택지·마감을 고치는 사이에 이미 72명에게 갔다.
--    ② 그 순간에는 polls 줄이 **아직 안 들어와 있다** — 글을 먼저 만들고
--       설문을 그다음에 넣는다. 그래서 퀴즈를 내도 늘 「새 글을 올렸어요」 였다.
--
--  그래서
--    · posts.draft — 임시 저장. 운영진만 본다. 알림 0.
--      (hidden 은 신고·운영진 숨김에 쓰고 있어서 섞지 않는다.
--       hidden 은 「글쓴이에게는 보인다」 는 규칙이 붙어 있어 더 그렇다)
--    · 알림은 **draft 가 풀리는 순간** 한 번. dedupe_key 는 그대로
--      'post:'||id 라서 두 번 나가지 않는다.
--    · 그 자리에서는 polls 줄이 이미 있으니 설문·퀴즈를 제대로 가린다.
-- ============================================================

-- ------------------------------------------------------------
-- 1) 임시 저장 칸
-- ------------------------------------------------------------
alter table posts add column if not exists draft boolean not null default false;

-- ------------------------------------------------------------
-- 2) 임시 저장한 글은 구성원이 아예 못 읽는다
--    (화면은 feed() 를 쓰지만, 표를 바로 읽는 길도 막아 둔다)
-- ------------------------------------------------------------
drop policy if exists "posts read" on posts;
create policy "posts read" on posts for select to authenticated
  using (is_member() and (not coalesce(draft, false) or is_admin()));

-- ------------------------------------------------------------
-- 3) 피드 — 임시 저장은 운영진에게만. 카드가 알아보게 draft 도 같이 준다
--    (긴 함수는 통째로 옮겨 적지 않는다 — 실서버 정의에 끼워 넣는다)
-- ------------------------------------------------------------
do $outer$
declare
  src text; i int;
  a1 constant text := 'and (not p.hidden';
  a2 constant text := $k$'pinned', p.pinned,$k$;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'feed' limit 1;
  if src is null then raise exception 'feed 를 못 찾았어요'; end if;
  if position($c$p.draft$c$ in src) > 0 then
    raise notice '  feed — 이미 되어 있어요'; return;
  end if;

  i := position(a1 in src);
  if i = 0 then raise exception 'feed — 걸러낼 자리를 못 찾았어요'; end if;
  src := left(src, i - 1)
      || $b$and (not coalesce(p.draft, false) or is_admin())
     $b$ || substr(src, i);

  i := position(a2 in src);
  if i = 0 then raise exception 'feed — draft 를 넣을 자리를 못 찾았어요'; end if;
  src := left(src, i + length(a2) - 1)
      || $b$
    'draft', coalesce(p.draft, false),$b$
      || substr(src, i + length(a2));

  execute src;
  raise notice '  feed — 임시 저장은 운영진에게만 보여요';
end
$outer$;

-- 글 하나 열기 — 카드가 쓰는 draft 를 같이 준다
do $outer$
declare
  src text; i int;
  a2 constant text := $k$'pinned', p.pinned,$k$;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'post_one' limit 1;
  if src is null then raise notice '  post_one 을 못 찾았어요 — 건너뜁니다'; return; end if;
  if position($c$p.draft$c$ in src) > 0 then
    raise notice '  post_one — 이미 되어 있어요'; return;
  end if;
  i := position(a2 in src);
  if i = 0 then raise exception 'post_one — draft 를 넣을 자리를 못 찾았어요'; end if;
  src := left(src, i + length(a2) - 1)
      || $b$
    'draft', coalesce(p.draft, false),$b$
      || substr(src, i + length(a2));
  execute src;
  raise notice '  post_one — draft 를 같이 줘요';
end
$outer$;

-- ------------------------------------------------------------
-- 4) 알림 — 임시 저장은 건너뛰고, 설문·퀴즈를 제대로 가린다
-- ------------------------------------------------------------
do $outer$
declare
  src text; i int;
  anchor constant text := 'if new.hidden then return new; end if;';
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'outbox_on_post' limit 1;
  if src is null then raise exception 'outbox_on_post 를 못 찾았어요'; end if;

  /* ① 임시 저장은 알리지 않는다 */
  if position($c$new.draft$c$ in src) = 0 then
    i := position(anchor in src);
    if i = 0 then raise exception 'outbox_on_post — 넣을 자리를 못 찾았어요'; end if;
    src := left(src, i - 1) || anchor
        || $b$ if coalesce(new.draft, false) then return new; end if;$b$
        || substr(src, i + length(anchor));
  end if;

  /* ② 설문 — 퀴즈가 아니면 「설문을 올렸어요」.
        예전에는 polls 줄이 아직 없어서 늘 「새 글」 이었다 */
  if position($c$설문을 올렸어요$c$ in src) = 0 then
    i := position($c$  else
    head := coalesce(who, '누군가') || '님이 새 글을 올렸어요';$c$ in src);
    if i = 0 then raise exception 'outbox_on_post — 설문 갈래를 넣을 자리를 못 찾았어요'; end if;
    src := left(src, i - 1)
        || $b$  elsif new.type = 'poll' then
    head := coalesce(who, '누군가') || '님이 설문을 올렸어요';
$b$       || substr(src, i);
  end if;

  execute src;
  raise notice '  outbox_on_post — 임시 저장은 건너뛰고, 설문은 설문이라고 말해요';
end
$outer$;

/* 임시 저장이 풀리는 순간에만 한 번 더 — dedupe_key 가 같아서 두 번 안 나간다 */
drop trigger if exists outbox_post_pub_trg on posts;
create trigger outbox_post_pub_trg after update of draft on posts
  for each row when (coalesce(old.draft, false) and not coalesce(new.draft, false))
  execute function outbox_on_post();

-- ------------------------------------------------------------
-- 5) 올리기 — 쓴 사람이나 운영진만. 한 번만 먹는다
-- ------------------------------------------------------------
create or replace function post_publish(p_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $fn$
declare p_ posts%rowtype;
begin
  select * into p_ from posts where id = p_id;
  if not found then return json_build_object('ok', false, 'why', 'nopost'); end if;
  if not (p_.author_id = my_member_id() or is_admin()) then
    return json_build_object('ok', false, 'why', 'notmine');
  end if;
  if not coalesce(p_.draft, false) then
    /* 이미 올라가 있다 — 알림은 다시 안 간다 */
    return json_build_object('ok', true, 'already', true);
  end if;
  update posts set draft = false where id = p_id;
  return json_build_object('ok', true);
end;
$fn$;
revoke all on function post_publish(uuid) from public, anon;
grant execute on function post_publish(uuid) to authenticated;

-- ------------------------------------------------------------
-- 6) 「구성원 몇 명에게 알림이 가요」 — 올리기 전에 보여 줄 숫자
--    그 종류를 켜 둔 **사람 수**(기기 수가 아니다). 나는 뺀다.
-- ------------------------------------------------------------
create or replace function push_reach(p_kind text)
returns int
language plpgsql security definer stable
set search_path = public
as $fn$
declare col text; n int;
begin
  if not is_member() then return 0; end if;
  col := case p_kind
           when 'post'   then 'want_post'
           when 'notice' then 'want_notice'
           when 'poll'   then 'want_poll'
           when 'quiz'   then 'want_quiz'
           else null
         end;
  if col is null then return 0; end if;
  execute format(
    'select count(distinct s.member_id)::int from push_subscriptions s
      where s.%I and s.member_id is distinct from $1', col)
    into n using my_member_id();
  return coalesce(n, 0);
end;
$fn$;
revoke all on function push_reach(text) from public, anon;
grant execute on function push_reach(text) to authenticated;
