-- ============================================================
--  사진 썸네일 — 피드에는 작은 것만 (2026-10-21)
-- ------------------------------------------------------------
--  선고은님: 「사진이 바로바로 안 뜨고 스크롤하면 렉 걸려」
--
--  올릴 때 1280px 한 장만 저장하고 피드에서도 그걸 썼다.
--  폰 화면 폭이 360~430 이라 **네 배쯤 큰 사진**을 받아
--  그리고 있었다 — 늦게 뜨고, 그릴 때도 무겁다.
--
--  이제 올릴 때 640px 짜리를 같이 저장하고, 피드는 그것만 쓴다.
--  크게 보기에서만 원본을 받는다.
--  ★ 전에 올린 사진은 thumb 이 비어 있다 — 그때는 원본을 쓴다.
-- ============================================================
alter table post_photos
  add column if not exists thumb text;


-- ── feed · post_one 의 media 에 thumb 를 더한다
--    (함수를 통째로 옮겨 적지 않는다 — 서버 쪽이 이미 여러 번 고쳐졌다)
do $outer$
declare src text; i int; n int := 0; r record;
  needle text := $x$'path', f.path, 'kind', f.kind, 'poster', f.poster$x$;
begin
  for r in
    select p.oid, p.proname from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('feed', 'post_one')
  loop
    src := pg_get_functiondef(r.oid);
    if position($chk$'thumb', f.thumb$chk$ in src) > 0 then continue; end if;
    i := position(needle in src);
    if i = 0 then
      raise notice '  % — 넣을 자리를 못 찾았어요', r.proname;
      continue;
    end if;
    src := left(src, i - 1)
        || needle || $y$, 'thumb', f.thumb$y$
        || substr(src, i + length(needle));
    begin
      execute src;
      n := n + 1;
    exception when others then
      raise notice '  % 는 건너뛰었어요: %', r.proname, sqlerrm;
    end;
  end loop;
  raise notice '  thumb 를 보내게 고친 함수: %개', n;
end
$outer$;
