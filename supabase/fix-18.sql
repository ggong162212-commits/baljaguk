-- ============================================================
--  칭찬·명예의 전당이 「새 소식」에 안 들어가던 것 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「새 소식에 칭찬하기 알림이 없네?」 — 맞습니다.
--
--  칭찬은 push_outbox(폰 알림)에만 넣고, 앱 안의 「새 소식」
--  (my_news = 내 글 댓글·반응 + member_notices)에는 아무것도
--  안 넣었습니다. 알림을 켜 둔 사람은 일부뿐이라
--  **대부분은 칭찬받아도 앱 안에서 전혀 몰랐습니다.**
--  명예의 전당(fame_try)도 같았습니다.
--
--  · 새 소식은 **앱 안 기록**이다 — want_praise·알림 구독과 상관없이 넣는다
--  · 누르면 그 글이 열린다 (post_id)
--  · 이미 올라간 칭찬·명예의 전당 글은 소급해서 넣는다 — **알림은 안 간다**
--    (created_at 을 글 시각으로 넣으니 「모두 읽음」 기준보다 과거여서
--     빨간 점도 안 뜬다)
-- ============================================================


-- ── 1) 「누가」를 적을 칸
--    member_notices 는 운영진이 남기는 소식용이어서 「누가」가 없었다.
--    칭찬은 누가 했는지가 핵심이다.
alter table member_notices
  add column if not exists actor_id uuid references members(id) on delete set null;


-- ── 2) my_news — 소식 줄에도 「누가」를 붙인다
--    ★ 통째로 옮겨 적지 않는다 (fix-11 과 같은 방법)
do $outer$
declare src text; i int;
  anchor constant text := 'select n.kind, n.created_at, n.post_id, null::text, null::text,';
  fixed  constant text := 'select n.kind, n.created_at, n.post_id, (select m.name from members m where m.id = n.actor_id), (select m.photo_path from members m where m.id = n.actor_id),';
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname = 'my_news' limit 1;
  if src is null then raise exception 'my_news 를 못 찾았어요'; end if;
  /* ★ 「n.actor_id」 로는 못 가린다 — 「나를 부른 글」 줄이 mentions.actor_id 를
       이미 쓰고 있다. 넣을 자리가 아직 있는지로 가린다 */
  i := position(anchor in src);
  if i = 0 then
    if position(fixed in src) > 0 then
      raise notice '  my_news — 이미 되어 있어요'; return;
    end if;
    raise exception 'my_news — 넣을 자리를 못 찾았어요 (손으로 봐 주세요)';
  end if;
  src := left(src, i - 1) || fixed || substr(src, i + length(anchor));
  execute src;
  raise notice '  my_news — 소식 줄에 「누가」를 붙였어요';
end
$outer$;


-- ── 3) 칭찬 알림 — 폰 알림 + 새 소식 한 줄
--    (fix-praise.sql 판에 member_notices 한 줄을 더한 것)
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

  /* ★ 새 소식 — 알림을 안 켠 사람도 앱 안에서는 보게 한다.
       want_praise·구독 여부를 보지 않는다 (앱 안 기록이다) */
  insert into member_notices (created_at, member_id, kind, body, post_id, actor_id)
  select new.created_at, new.praised_member_id, 'praise',
         left(btrim(coalesce(new.body, '')), 40), new.id, new.author_id
   where not exists (select 1 from member_notices n
                      where n.member_id = new.praised_member_id
                        and n.kind = 'praise' and n.post_id = new.id);
  return new;
end;
$$;

drop trigger if exists outbox_praise_trg on posts;
create trigger outbox_praise_trg after insert on posts
  for each row execute function outbox_on_praise();


-- ── 4) 명예의 전당 — 주인공에게 새 소식 한 줄
--    (fix-fame.sql 판에 member_notices 한 줄을 더한 것)
--    ★ p_notify 가 거짓이어도 새 소식은 넣는다 — 폰 알림만 안 보내는 뜻이다
create or replace function fame_try(p_member uuid, p_notify boolean default true,
                                    p_at date default null)
returns int
language plpgsql security definer
set search_path = public
as $$
declare t int; pl int; r int; nm text; pid uuid; url_ text;
begin
  if p_member is null then return null; end if;
  if exists (select 1 from hall_of_fame where member_id = p_member) then return null; end if;
  if not exists (select 1 from members where id = p_member and status <> 'left') then return null; end if;

  select b.times, b.places into t, pl from badge_stats(p_member) b;
  if coalesce(t, 0) < 10 or coalesce(pl, 0) < 3 then return null; end if;

  /* 동시에 둘이 채워져도 번호가 겹치지 않게 */
  perform pg_advisory_xact_lock(hashtext('baljaguk.hall_of_fame'));
  if exists (select 1 from hall_of_fame where member_id = p_member) then return null; end if;

  select coalesce(max(rank), 0) + 1 into r from hall_of_fame;
  select name into nm from members where id = p_member;
  pid := gen_random_uuid();
  url_ := 'me.html#post=' || pid;

  insert into hall_of_fame (member_id, rank, achieved_at, notified)
  values (p_member, r, coalesce(p_at, (now() at time zone 'Asia/Seoul')::date), p_notify);

  insert into posts (id, created_at, author_id, honored_member_id, type, body)
  values (pid, clock_timestamp(), p_member, p_member, 'fame',
          coalesce(nm, '') || '님이 기록 배지 네 개를 모두 모았어요! ' ||
          '첫 봉사부터 열 번째 봉사, 보호소 세 곳까지 — 모두 ' ||
          coalesce(nm, '') || '님을 축하해 주세요 🐾');

  update hall_of_fame set post_id = pid where member_id = p_member;

  /* ★ 새 소식 — 폰 알림을 안 보내는 경우에도 넣는다 */
  insert into member_notices (created_at, member_id, kind, body, post_id)
  select clock_timestamp(), p_member, 'fame',
         r || '번째로 명예의 전당에 올랐어요', pid
   where not exists (select 1 from member_notices n
                      where n.member_id = p_member and n.kind = 'fame' and n.post_id = pid);

  if p_notify then
    /* 전체 — 주인공은 actor 로 빠진다 */
    insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
    values (null, 'praise',
            '🏆 ' || coalesce(nm, '') || '님이 명예의 전당에 올랐어요! 축하해 주세요',
            r || '번째 명예의 전당 주인공이에요', url_, p_member, 'fame:' || pid)
    on conflict (dedupe_key) do nothing;
    /* 주인공에게만 */
    insert into push_outbox (member_id, kind, title, body, url, actor_id, dedupe_key)
    values (p_member, 'praise',
            '🏆 축하해요! 회원님이 ' || r || '번째 명예의 전당 주인공이 됐어요',
            '모두가 축하 댓글을 남길 수 있어요', url_, null, 'fame:' || pid || ':me')
    on conflict (dedupe_key) do nothing;
  end if;
  return r;
end;
$$;
revoke all on function fame_try(uuid, boolean, date) from public, anon, authenticated;


-- ── 5) 소급 — 이미 올라간 칭찬 글 (숨긴 글 제외)
--    created_at 을 **글 시각**으로 넣는다 → 「모두 읽음」 기준보다 과거여서
--    빨간 점이 새로 뜨지 않고, 폰 알림도 당연히 안 간다.
do $back$
declare n1 int; n2 int;
begin
  insert into member_notices (created_at, member_id, kind, body, post_id, actor_id)
  select p.created_at, p.praised_member_id, 'praise',
         left(btrim(coalesce(p.body, '')), 40), p.id, p.author_id
    from posts p
   where p.type = 'praise'
     and not p.hidden
     and p.praised_member_id is not null
     and exists (select 1 from members m where m.id = p.praised_member_id)
     and not exists (select 1 from member_notices n
                      where n.member_id = p.praised_member_id
                        and n.kind = 'praise' and n.post_id = p.id);
  get diagnostics n1 = row_count;

  insert into member_notices (created_at, member_id, kind, body, post_id)
  select coalesce(ps.created_at, h.created_at), h.member_id, 'fame',
         h.rank || '번째로 명예의 전당에 올랐어요', h.post_id
    from hall_of_fame h
    left join posts ps on ps.id = h.post_id
   where h.post_id is not null
     and exists (select 1 from members m where m.id = h.member_id)
     and not exists (select 1 from member_notices n
                      where n.member_id = h.member_id
                        and n.kind = 'fame' and n.post_id = h.post_id);
  get diagnostics n2 = row_count;

  raise notice '  소급 — 칭찬 % 줄 · 명예의 전당 % 줄 (알림 안 감)', n1, n2;
end
$back$;
