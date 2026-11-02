-- ============================================================
--  10/22 정식 오픈 전에 시험으로 들어간 아이 두 마리를 지운다
--  ------------------------------------------------------------
--  대상: 「강즤」·「덕자」 (동물보호센터 다솜, 2026-10-21 에 만들어짐)
--  안전장치
--    · 보호소 이름·만든 날짜까지 맞는 것만 지운다 (같은 이름의 진짜 아이 보호)
--    · 후기에 한 번이라도 붙어 있으면 **하나도** 지우지 않고 멈춘다
--    · 두 마리보다 많이 지워질 것 같으면 되돌린다
--  두 번 돌려도 괜찮다 — 두 번째는 「지울 것이 없어요」로 지나간다.
-- ============================================================
do $$
declare
  r     record;
  n     int;
  gone  int;
  기준  timestamptz := timestamptz '2026-10-22 00:00+09';
begin
  raise notice '── 지울 후보';
  for r in
    select a.name, a.place, a.created_at,
           (select count(*) from post_animals pa where pa.animal_id = a.id) as 붙은글
      from animals a
     where a.name in ('강즤', '덕자')
       and a.place = '동물보호센터 다솜'
       and a.created_at < 기준
     order by a.created_at
  loop
    raise notice '   % · % · % · 붙은 글 %개', r.name, r.place, r.created_at, r.붙은글;
  end loop;

  select count(*) into n
    from post_animals pa
    join animals a on a.id = pa.animal_id
   where a.name in ('강즤', '덕자')
     and a.place = '동물보호센터 다솜'
     and a.created_at < 기준;
  if n > 0 then
    raise exception '후기에 붙어 있어요 (%군데) — 하나도 지우지 않았어요', n;
  end if;

  delete from animals a
   where a.name in ('강즤', '덕자')
     and a.place = '동물보호센터 다솜'
     and a.created_at < 기준;
  get diagnostics gone = row_count;

  if gone = 0 then
    raise notice '지울 것이 없어요 (이미 지워졌나 봐요)';
  elsif gone > 2 then
    raise exception '%마리나 지워질 뻔했어요 — 되돌렸어요', gone;
  else
    raise notice '%마리 지웠어요 (강즤 · 덕자)', gone;
  end if;
end $$;
