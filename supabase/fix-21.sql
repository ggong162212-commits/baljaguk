-- ============================================================
--  fix-21 — 발자국 이야기 (보호소 아이 이야기 글)
--  ------------------------------------------------------------
--  · posts.type = 'story'
--  · posts.story = { shelter, name, sex:'m'|'f'|'u', age }   (jsonb 한 칸)
--      age 가 없으면(null) 「나이 모름」
--    따로 칸 네 개로 쪼개지 않는다 — 화면이 한 덩어리로 쓰고,
--    투표·검색처럼 칸을 따로 골라 쓸 일이 없다.
--  · 화면은 assets/story.js 가 그린다. 화면도 막지만 **서버에서 다시 막는다**:
--      보호소 필수 · 이름 1~20자 · 성별 m·f·u · 나이는 없거나 1~10자 ·
--      이야기 1~1000자 · 사진 1~5장 · 영상 없음
--  · 알림: 올라가면 모두에게 한 번
--      「🐾 금파하우스 단비의 이야기가 올라왔어요」
--      종류는 「새 글」(kind 'post') 과 같은 칸을 쓴다 — 끄는 자리를 늘리지 않는다
-- ============================================================

-- ------------------------------------------------------------
-- 1) 칸과 글 종류
-- ------------------------------------------------------------
alter table posts add column if not exists story jsonb;

alter table posts drop constraint if exists posts_type_check;
alter table posts add constraint posts_type_check
  check (type in ('review', 'poll', 'notice', 'free', 'praise', 'fame', 'story'));

-- ------------------------------------------------------------
-- 2) 서버에서 다시 막기
--    posts_guard 를 건드리지 않고 따로 둔다 — 그 함수는 이미
--    공지·설문·고정·숨기기를 보고 있고, 끼워 넣다 틀리면 글 전체가 막힌다.
-- ------------------------------------------------------------
create or replace function story_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  s    jsonb;
  nm   text;
  sh   text;
  ag   text;
  sx   text;
begin
  if new.type <> 'story' then return new; end if;

  s := coalesce(new.story, '{}'::jsonb);
  sh := btrim(coalesce(s ->> 'shelter', ''));
  nm := btrim(coalesce(s ->> 'name', ''));
  sx := btrim(coalesce(s ->> 'sex', ''));
  ag := nullif(btrim(coalesce(s ->> 'age', '')), '');

  if sh = '' then raise exception '어느 보호소 아이인지 골라 주세요'; end if;
  if char_length(sh) > 40 then raise exception '보호소 이름이 너무 길어요'; end if;
  if nm = '' then raise exception '아이 이름을 적어 주세요'; end if;
  if char_length(nm) > 20 then raise exception '아이 이름은 20자까지예요'; end if;
  if sx not in ('m', 'f', 'u') then raise exception '성별을 골라 주세요'; end if;
  if ag is not null and char_length(ag) > 10 then raise exception '나이는 10자까지예요'; end if;
  if btrim(coalesce(new.body, '')) = '' then raise exception '이야기를 적어 주세요'; end if;
  if char_length(new.body) > 1000 then raise exception '이야기는 1000자까지예요'; end if;

  /* 다듬은 것만 담는다 — 앞뒤 공백·없는 칸이 섞이지 않게 */
  new.story := jsonb_build_object('shelter', sh, 'name', nm, 'sex', sx, 'age', ag);

  return new;
end;
$fn$;

drop trigger if exists story_guard_trg on posts;
create trigger story_guard_trg before insert or update on posts
  for each row execute function story_guard();

/* 사진 — 이야기에는 사진만, 다섯 장까지.
   (「한 장 이상」 은 글이 먼저 들어오고 사진이 그다음에 오므로
    이 자리에서는 셀 수 없다. 화면이 막고, 여기서는 넘치는 것을 막는다) */
create or replace function story_photo_guard()
returns trigger
language plpgsql security definer
set search_path = public
as $fn$
declare t text; n int;
begin
  select type into t from posts where id = new.post_id;
  if t is distinct from 'story' then return new; end if;
  if coalesce(new.kind, 'photo') <> 'photo' then
    raise exception '이야기에는 사진만 넣을 수 있어요';
  end if;
  select count(*) into n from post_photos where post_id = new.post_id;
  if n >= 5 then raise exception '이야기에는 사진을 5장까지 넣을 수 있어요'; end if;
  return new;
end;
$fn$;

drop trigger if exists story_photo_guard_trg on post_photos;
create trigger story_photo_guard_trg before insert on post_photos
  for each row execute function story_photo_guard();

-- ------------------------------------------------------------
-- 3) 피드·글 하나에 story 칸을 같이 준다 (카드가 한 줄을 그린다)
--    긴 함수는 통째로 옮겨 적지 않는다 — 실서버 정의에 끼워 넣는다
-- ------------------------------------------------------------
do $outer$
declare
  src text; i int;
  a constant text := $k$'pinned', p.pinned,$k$;
  f text;
begin
  foreach f in array array['feed', 'post_one'] loop
    select pg_get_functiondef(p.oid) into src from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = f limit 1;
    if src is null then
      raise notice '  % 를 못 찾았어요 — 건너뜁니다', f; continue;
    end if;
    if position($c$'story', p.story$c$ in src) > 0 then
      raise notice '  % — 이미 되어 있어요', f; continue;
    end if;
    i := position(a in src);
    if i = 0 then raise exception '% — story 를 넣을 자리를 못 찾았어요', f; end if;
    src := left(src, i + length(a) - 1)
        || $b$
    'story', p.story,$b$
        || substr(src, i + length(a));
    execute src;
    raise notice '  % — story 칸을 붙였어요', f;
  end loop;
end
$outer$;

-- ------------------------------------------------------------
-- 4) 알림 — 「🐾 <보호소> <이름>의 이야기가 올라왔어요」
--    (보호소 이름에 「보호소」 가 안 붙은 곳이 있어 설정 이름 그대로 쓴다)
-- ------------------------------------------------------------
do $outer$
declare
  src text; i int;
  anchor constant text := $c$  else
    head := coalesce(who, '누군가') || '님이 새 글을 올렸어요';$c$;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'outbox_on_post' limit 1;
  if src is null then raise exception 'outbox_on_post 를 못 찾았어요'; end if;
  if position($c$이야기가 올라왔어요$c$ in src) > 0 then
    raise notice '  outbox_on_post — 이미 되어 있어요'; return;
  end if;
  i := position(anchor in src);
  if i = 0 then raise exception 'outbox_on_post — 이야기 갈래를 넣을 자리를 못 찾았어요'; end if;
  src := left(src, i - 1)
      || $b$  elsif new.type = 'story' then
    head := '🐾 ' || btrim(coalesce(new.story ->> 'shelter', '')) || ' '
            || btrim(coalesce(new.story ->> 'name', '')) || '의 이야기가 올라왔어요';
$b$     || substr(src, i);
  execute src;
  raise notice '  outbox_on_post — 이야기 알림 문구를 넣었어요';
end
$outer$;
