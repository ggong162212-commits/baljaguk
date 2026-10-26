-- ============================================================
--  fix-24 — 콘테스트 봉사지는 설정에 적힌 보호소만 받는다
--  ------------------------------------------------------------
--  작품 내기 폼이 너무 번거로웠다. 「내가 간 지난 봉사 고르기」와
--  「목록에 없으면 직접 적기」를 없애고, 보호소 단추 중 하나만 누르게 바꿨다.
--  화면만 바꾸면 서버는 아무 글자나 받으니, 서버에서도 **설정에 있는
--  보호소 이름만** 받게 한다 (club_settings.places 의 name).
--
--  ★ contest_save 를 이 파일의 글로 통째로 다시 쓰지 않는다 —
--    실서버에만 더해진 것이 사라질 수 있다. 지금 올라간 정의를 읽어서
--    「봉사지 40자」 검사 **바로 뒤에 한 덩이만** 끼운다.
--    끼울 자리를 못 찾으면 아무것도 바꾸지 않고 멈춘다.
--
--  · 설정의 봉사지 목록이 비어 있으면 예전처럼 둔다 (잠기지 않게).
--  · places 가 ["이름", …] 처럼 글자 배열인 옛 자료여도 알아본다.
--  · 안 되는 값이면 'shelterbad' 로 알려 준다 (화면이 「목록에 있는
--    보호소만 고를 수 있어요」 로 바꿔 말한다).
-- ============================================================

do $outer$
declare
  src text; i int;
  anchor constant text :=
    E'  if char_length(sh_) > 40 then\n' ||
    E'    return json_build_object(''ok'', false, ''why'', ''shelterlong'');\n' ||
    E'  end if;\n';
  add_ constant text :=
    E'\n  /* fix-24 — 봉사지는 설정(club_settings.places)에 적힌 보호소만 */\n' ||
    E'  if exists (select 1 from club_settings cs\n' ||
    E'              where jsonb_typeof(cs.places) = ''array'' and jsonb_array_length(cs.places) > 0)\n' ||
    E'     and not exists (select 1 from club_settings cs2,\n' ||
    E'                            jsonb_array_elements(cs2.places) pl\n' ||
    E'                      where sh_ = btrim(case when jsonb_typeof(pl) = ''string''\n' ||
    E'                                             then pl #>> ''{}''\n' ||
    E'                                             else coalesce(pl ->> ''name'', '''') end)) then\n' ||
    E'    return json_build_object(''ok'', false, ''why'', ''shelterbad'');\n' ||
    E'  end if;\n';
begin
  select pg_get_functiondef(p.oid) into src
    from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'contest_save'
   limit 1;
  if src is null then raise exception 'contest_save 를 못 찾았어요'; end if;

  /* 줄 끝을 맞춘다 — 실서버 본문은 \r\n 으로 들어가 있을 수 있다 */
  src := replace(src, E'\r\n', E'\n');

  if position('fix-24' in src) > 0 then
    raise notice '  contest_save — 이미 들어 있어요';
    return;
  end if;

  i := position(anchor in src);
  if i = 0 then
    raise exception 'contest_save — 봉사지 검사 자리를 못 찾았어요 (아무것도 바꾸지 않았어요)';
  end if;

  src := left(src, i - 1) || anchor || add_ || substr(src, i + length(anchor));
  execute src;
  raise notice '  contest_save — 설정에 있는 보호소만 받게 했어요';
end
$outer$;
