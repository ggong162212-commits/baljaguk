-- ============================================================
--  4차 — 짧은 영상 · 의견에 사진 붙이기 (2026-10-21)
-- ============================================================


-- ============================================================
--  ① 짧은 영상
-- ------------------------------------------------------------
--  글 하나에 영상 한 개. 30초 이하 · 20MB 이하.
--  사진과 같은 줄에 들어가 옆으로 넘긴다.
--
--  post_photos 에 칸을 더해 쓴다 — 새 표를 만들지 않는다.
--    kind    : 'photo' (기본) 또는 'video'
--    poster  : 영상의 첫 프레임 (불러오기 전 자리를 잡아 화면이 안 흔들리게)
-- ============================================================
alter table post_photos
  add column if not exists kind   text not null default 'photo',
  add column if not exists poster text;

alter table post_photos drop constraint if exists post_photos_kind_check;
alter table post_photos add constraint post_photos_kind_check
  check (kind in ('photo', 'video'));

/* 글 하나에 영상은 하나까지 */
create unique index if not exists post_photos_one_video
  on post_photos (post_id) where kind = 'video';

/* 올릴 수 있는 크기와 형식 — 아이폰·안드로이드 둘 다 되는 것만 */
update storage.buckets
   set file_size_limit = 20971520,        -- 20MB
       allowed_mime_types = array[
         'image/jpeg', 'image/png', 'image/webp', 'image/gif',
         'video/mp4', 'video/quicktime'   -- 아이폰에서 찍은 .mov 도
       ]
 where id = 'community';

update storage.buckets
   set file_size_limit = 5242880          -- 프로필 사진은 5MB 면 넉넉하다
 where id = 'avatars';


-- ── feed 와 post_one 이 영상 정보도 같이 보내게
--    (함수를 통째로 옮겨 적지 않고 그 줄만 바꾼다)
do $outer$
declare
  r record;
  src text;
  n int := 0;
begin
  for r in
    select p.oid, p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('feed', 'post_one')
  loop
    src := pg_get_functiondef(r.oid);
    src := replace(src,
      $a$'photos', (select coalesce(json_agg(f.path order by f.sort), '[]'::json)
                 from post_photos f where f.post_id = p.id),$a$,
      $b$'photos', (select coalesce(json_agg(f.path order by f.sort), '[]'::json)
                 from post_photos f where f.post_id = p.id),
    'media', (select coalesce(json_agg(json_build_object(
                'path', f.path, 'kind', f.kind, 'poster', f.poster)
                order by f.sort), '[]'::json)
                from post_photos f where f.post_id = p.id),$b$);
    begin
      execute src;
      n := n + 1;
    exception when others then
      raise notice '  % 는 건너뛰었어요: %', r.proname, sqlerrm;
    end;
  end loop;
  raise notice '  영상 정보를 보내게 고친 함수: %개', n;
end
$outer$;


