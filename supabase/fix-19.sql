-- ============================================================
--  아직 안 간 봉사가 「참여」로 세어지던 것 (2026-10-22)
-- ------------------------------------------------------------
--  점검 담당: 「나 탭 마지막 참여가 2026.10.25(미래)로 나옴」
--
--  my_activity 는 「확정된 봉사」만 셌다 (e.confirmed_at is not null).
--  그런데 운영진이 **아직 오지 않은 봉사를 미리 확정**해 두면
--  신청만 하고 안 간 것이 참여로 잡힌다.
--
--  → 확정됐고 **오늘(한국)까지 지난** 봉사만 센다.
--
--  ★ 같은 자리를 쓰는 것이 둘이다 — 둘 다 고친다
--    · my_activity  — 봉사 횟수 · 적립 · 사료 · 마지막 참여 · 보호소 목록
--    · badge_stats  — 기록 배지 네 개와 명예의 전당 조건
--    (past_events 는 이미 e.date < 오늘 로 거르고 있었다)
--
--  ★ 통째로 옮겨 적지 않는다 — 서버가 제 정의를 읽어 한 자리만 고친다
-- ============================================================

do $outer$
declare src text; i int; fn text;
  anchor constant text := 'e.confirmed_at is not null';
  fixed  constant text := 'e.confirmed_at is not null and e.date <= (now() at time zone ''Asia/Seoul'')::date';
begin
  foreach fn in array array['my_activity', 'badge_stats'] loop
    select pg_get_functiondef(p.oid) into src from pg_proc p
     where p.pronamespace = 'public'::regnamespace and p.proname = fn limit 1;
    if src is null then raise exception '% 를 못 찾았어요', fn; end if;

    if position('Asia/Seoul' in src) > 0 then
      raise notice '  % — 이미 되어 있어요', fn; continue;
    end if;

    i := position(anchor in src);
    if i = 0 then raise exception '% — 고칠 자리를 못 찾았어요 (손으로 봐 주세요)', fn; end if;
    /* 한 번만 나와야 한다 — 두 번이면 어디를 고칠지 알 수 없다 */
    if position(anchor in substr(src, i + length(anchor))) > 0 then
      raise exception '% — 같은 자리가 두 군데예요 (손으로 봐 주세요)', fn;
    end if;

    src := left(src, i - 1) || fixed || substr(src, i + length(anchor));
    execute src;
    raise notice '  % — 오늘까지 지난 봉사만 세게 했어요', fn;
  end loop;
end
$outer$;
