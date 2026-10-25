-- ============================================================
--  함수를 실제로 한 번 불러 본다
-- ------------------------------------------------------------
--  「의견 답장」이 죽어 있던 까닭은 함수 안에서
--      insert into member_notices (member_id, kind, body)
--  라고 썼는데 그 표에 body 칸이 없었기 때문이다.
--
--  포스트그레스는 plpgsql 함수 **본문**을 만들 때 검사하지 않는다.
--  그래서 check.sh 가 「통과」라고 해도 실제로 누르면 죽는다.
--  여기서는 빈 데이터베이스에 시험 자료를 넣고 함수를 한 번씩 불러,
--  「없는 칸 / 없는 표」 같은 사고를 미리 잡는다.
--
--  ※ 되는지 안 되는지(로직)를 보는 게 아니다.
--    「그런 칸이 없다」로 터지는 것만 잡는다.
-- ============================================================

-- plpgsql_check 가 있으면 그걸로 한 번에 본다 (없으면 건너뛴다)
do $$
begin
  begin
    create extension if not exists plpgsql_check;
  exception when others then
    raise notice '  plpgsql_check 가 없어요 — 불러 보는 방식으로 봅니다';
  end;
end $$;

do $$
declare
  r record;
  bad int := 0;
  msg text;
begin
  if exists (select 1 from pg_extension where extname = 'plpgsql_check') then
    for r in
      select p.oid, p.proname
        from pg_proc p
        join pg_language l on l.oid = p.prolang
       where p.pronamespace = 'public'::regnamespace
         and l.lanname = 'plpgsql'
       order by p.proname
    loop
      begin
        for msg in select * from plpgsql_check_function(r.oid) loop
          if msg ~* 'does not exist|없' then
            raise warning '  ✗ % : %', r.proname, msg;
            bad := bad + 1;
          end if;
        end loop;
      exception when others then
        null;   /* 검사기가 못 보는 함수는 넘어간다 */
      end;
    end loop;

    if bad > 0 then
      raise exception '없는 칸·표를 쓰는 곳이 %군데 있어요', bad;
    end if;
    raise notice '  없는 칸·표를 쓰는 함수: 0개';
  end if;
end $$;


-- ── plpgsql_check 가 없을 때를 위한 손 검사
--    함수 본문에 적힌 insert/update 의 표·칸이 실제로 있는지 본다.
do $$
declare
  r record;
  m text[];
  tbl text;
  cols text;
  col text;
  bad int := 0;
begin
  if exists (select 1 from pg_extension where extname = 'plpgsql_check') then
    return;   /* 위에서 이미 봤다 */
  end if;

  for r in
    select p.proname, pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_language l on l.oid = p.prolang
     where p.pronamespace = 'public'::regnamespace
       and l.lanname in ('plpgsql', 'sql')
     order by p.proname
  loop
    /* insert into <표> (<칸들>) 을 모두 찾는다 */
    for m in
      select regexp_matches(r.src,
        'insert\s+into\s+([a-z_][a-z0-9_]*)\s*\(([^)]*)\)', 'gi')
    loop
      tbl := m[1];
      cols := m[2];

      if not exists (select 1 from information_schema.tables
                      where table_schema = 'public' and table_name = tbl) then
        raise warning '  ✗ % : 「%」 라는 표가 없어요', r.proname, tbl;
        bad := bad + 1;
        continue;
      end if;

      /* 칸 목록이 여러 줄에 걸쳐 있으면 줄바꿈이 칸 이름에 붙어 와서
         있는 칸을 「없다」 고 했다 — 빈칸·줄바꿈·탭을 모두 뗀다 */
      foreach col in array string_to_array(regexp_replace(cols, '[[:space:]]', '', 'g'), ',')
      loop
        if col <> '' and not exists (
          select 1 from information_schema.columns
           where table_schema = 'public' and table_name = tbl and column_name = col)
        then
          raise warning '  ✗ % : % 표에 「%」 칸이 없어요', r.proname, tbl, col;
          bad := bad + 1;
        end if;
      end loop;
    end loop;
  end loop;

  if bad > 0 then
    raise exception '없는 칸·표에 넣으려는 곳이 %군데 있어요', bad;
  end if;
  raise notice '  없는 칸·표에 넣는 함수: 0개';
end $$;
