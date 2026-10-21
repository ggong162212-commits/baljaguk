-- ============================================================
--  고정 공지를 고치고 내리고 지울 수 있게 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「공지 삭제하고 싶으면 어떻게 해?」 → 방법이 아예 없었다.
--
--  고정 공지는 피드 목록(rows)에서 빠지고 pinned 에 따로 온다.
--  그런데 pinned 줄에는 id·본문·쓴사람·시각뿐이라, 화면이
--  「이게 공지인지」「내가 쓴 건지」를 알 수 없었다 —
--  「…」 메뉴를 만들어도 고를 것이 「삭제·신고」밖에 없었다.
--
--  ★ feed() 를 통째로 옮겨 적지 않는다. 이미 영상(media) 때문에
--    서버 쪽이 저장소 파일과 다르다. 서버가 **제 정의를 읽어**
--    pinned 줄에만 칸을 끼워 넣는다.
--    (실행 결과: 공지칸·영상칸·사진 모두 들어간 것 확인함)
-- ============================================================
do $outer$
declare src text; i int;
begin
  select pg_get_functiondef(p.oid) into src from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'feed' limit 1;
  if src is null then raise notice 'feed 를 못 찾았어요'; return; end if;
  if position($chk$'z_type'$chk$ in src) > 0 then
    raise notice '이미 되어 있어요'; return;
  end if;

  /* ① 내보내는 칸에 type·pinned·mine·photos·comment_count 를 더한다 */
  i := position($a$'author', z.who) order by z.created_at desc)$a$ in src);
  if i = 0 then raise exception '넣을 자리(1)를 못 찾았어요'; end if;
  src := left(src, i - 1)
      || $b$'author', z.who, 'type', 'notice', 'pinned', true, 'z_type', true, 'mine', z.mine, 'hidden', false, 'photos', z.photos, 'comment_count', z.ccount) order by z.created_at desc)$b$
      || substr(src, i + length($a$'author', z.who) order by z.created_at desc)$a$));

  /* ② 안쪽 select 에 그 값들을 만든다 */
  i := position($c$(select m.name from members m where m.id = p.author_id) as who$c$ in src);
  if i = 0 then raise exception '넣을 자리(2)를 못 찾았어요'; end if;
  src := left(src, i - 1)
      || $d$(select m.name from members m where m.id = p.author_id) as who, p.author_id = (select id from me_) as mine, (select coalesce(json_agg(f.path order by f.sort), '[]'::json) from post_photos f where f.post_id = p.id) as photos, (select count(*)::int from comments c where c.post_id = p.id and not c.hidden) as ccount$d$
      || substr(src, i + length($c$(select m.name from members m where m.id = p.author_id) as who$c$));

  execute src;
  raise notice '  공지 줄에 칸을 더했어요';
end
$outer$;
