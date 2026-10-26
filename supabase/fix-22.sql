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


-- ── 3) 댓글 알림 — draft 글이면 건너뛴다 (fix-9 에 한 겹 더)
create or replace function outbox_on_comment()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
declare
  who text; owner uuid; parent_owner uuid;
begin
  /* 아직 안 올린 글(draft)은 알림을 내지 않는다 */
  if exists (select 1 from posts where id = new.post_id and coalesce(draft, false)) then
    return new;
  end if;

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


-- ── 4) 반응 알림 — draft 글이면 건너뛴다 (fix-17 에 한 겹 더)
create or replace function outbox_on_reaction()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
declare
  owner_ uuid;
  who_   text;
  slot_  text;
begin
  select author_id into owner_ from posts
   where id = new.post_id and not hidden and not coalesce(draft, false);
  if owner_ is null or owner_ = new.member_id then return new; end if;

  select name into who_ from members where id = new.member_id;

  /* 10분 칸 — 같은 칸 안에서는 한 번만 쌓인다 (연달아 울리지 않게) */
  slot_ := to_char(date_trunc('hour', now())
             + (floor(extract(minute from now()) / 10) * interval '10 min'),
           'YYYYMMDDHH24MI');

  insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
  values (owner_, 'reaction',
          coalesce(who_, '누군가') || '님이 내 글을 좋아해요',
          '',
          'me.html#post=' || new.post_id,
          new.member_id,
          'reaction:' || new.post_id || ':' || owner_ || ':' || slot_)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$fn$;

drop trigger if exists outbox_reaction_trg on reactions;
create trigger outbox_reaction_trg after insert on reactions
  for each row execute function outbox_on_reaction();
