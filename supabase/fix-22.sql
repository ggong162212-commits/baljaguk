-- ============================================================
--  fix-22 — 아직 안 올린 설문(draft)에는 댓글·하트가 아예 안 쌓인다
--  ------------------------------------------------------------
--  fix-20 에서 설문을 「임시 저장 → 올리기」 두 걸음으로 나눴다.
--  올리기 전 글은 운영진에게만 보이는데, 그 글에 댓글이나 하트가 달리면
--  글쓴이(다른 운영진)에게 **알림이 그대로 갔다.**
--  아직 아무에게도 안 보여 준 글인데 알림이 먼저 나가는 셈이다.
--
--  화면에서는 하트·댓글 줄을 아예 안 그리고(community.js),
--  서버에서도 두 겹으로 막는다.
--    1) draft 글에는 댓글·반응을 못 넣는다 (before insert)
--    2) 혹시 1) 이 풀려도 알림은 안 나간다 (outbox 트리거에서 건너뛴다)
--  올린 뒤(draft = false)에는 모두 예전과 똑같다.
-- ============================================================

-- ── 1) 댓글 — 아직 안 올린 글에는 못 단다
create or replace function draft_no_comment()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
begin
  if exists (select 1 from posts where id = new.post_id and coalesce(draft, false)) then
    raise exception '아직 올리지 않은 글에는 댓글을 달 수 없어요';
  end if;
  return new;
end;
$fn$;

drop trigger if exists draft_no_comment_trg on comments;
create trigger draft_no_comment_trg before insert on comments
  for each row execute function draft_no_comment();


-- ── 2) 반응(하트) — 아직 안 올린 글에는 못 누른다
create or replace function draft_no_react()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
begin
  if exists (select 1 from posts where id = new.post_id and coalesce(draft, false)) then
    raise exception '아직 올리지 않은 글에는 반응을 남길 수 없어요';
  end if;
  return new;
end;
$fn$;

drop trigger if exists draft_no_react_trg on reactions;
create trigger draft_no_react_trg before insert on reactions
  for each row execute function draft_no_react();


-- ── 3) 알림도 한 겹 더 — **실서버 정의에 draft 확인 줄만 끼워 넣는다**
--    ★ 두 함수(outbox_on_comment · outbox_on_reaction)를 이 파일의 글로
--      통째로 다시 쓰면 안 된다. 실서버 쪽에 이 저장소에 없는 것이
--      (예: actor_id — 「새 소식」 얼굴) 더해져 있으면 그게 사라진다.
--      그래서 fix-20 처럼 지금 올라간 정의를 읽어서 **한 줄만** 끼운다.
--      끼울 자리를 못 찾으면 아무것도 바꾸지 않고 멈춘다.
do $outer$
declare
  src text; i int; n int := 0;
  fn  text;
  fns constant text[] := array['outbox_on_comment', 'outbox_on_reaction'];
  anchor constant text := E'\nbegin\n';
  line   constant text :=
    E'\n  /* fix-22 — 아직 안 올린 글(draft)은 알림을 내지 않는다 */\n'
    || '  if exists (select 1 from posts where id = new.post_id'
    || E' and coalesce(draft, false)) then return new; end if;\n';
begin
  foreach fn in array fns loop
    select pg_get_functiondef(p.oid) into src from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = fn limit 1;
    if src is null then raise exception '% 를 못 찾았어요', fn; end if;

    /* 이미 끼워져 있으면 그냥 둔다 (두 번 Run 해도 안전하게) */
    if position('fix-22' in src) > 0 then
      raise notice '  % — 이미 들어 있어요', fn;
      continue;
    end if;

    i := position(anchor in src);
    if i = 0 then
      raise exception '% — draft 확인 줄을 넣을 자리(begin)를 못 찾았어요', fn;
    end if;
    src := left(src, i - 1) || anchor || line || substr(src, i + length(anchor));
    execute src;
    n := n + 1;
    raise notice '  % — draft 글이면 알림을 건너뛰게 했어요', fn;
  end loop;
  raise notice '  알림 함수 % 개를 고쳤어요 (나머지 본문은 실서버 그대로)', n;
end
$outer$;
