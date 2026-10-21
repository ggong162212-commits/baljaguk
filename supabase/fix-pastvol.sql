-- ============================================================
-- 지난 봉사 정리 — 「지난 봉사 전체 보기」 페이지 함수 (w2-feat)
-- 실행: 메인이 선고은님 확인 뒤 SQL 편집기에서. 읽기 전용 함수 하나만 만든다
--       (표·칸·정책은 건드리지 않는다)
--
-- past_events(p_limit, p_before, p_before_id, p_mine, p_place)
--   · 오늘(한국 날짜)보다 앞의 봉사를 최근 것부터
--   · p_limit      한 번에 몇 개 (기본 20, 1~50)
--   · p_before     이전 페이지 마지막 봉사의 날짜 — 그보다 앞만
--   · p_before_id  같은 날 봉사가 여럿일 때 이어 받기 (마지막 봉사의 id)
--   · p_mine       true 면 내가 간 봉사만 (attendance 기준, vol_board 의 went 와 같다)
--   · p_place      보호소 이름으로 거르기 ('' 나 null 이면 전체)
-- 돌려주는 것: { rows:[{id,date,place,title,confirmed,went,reviews,my_review}],
--               total: 거른 뒤 전체 수, places:[{place,n}] (지난 봉사 전체 기준) }
-- 연락처·학번은 담지 않는다. 구성원이 아니면 null
-- ============================================================
create or replace function past_events(
  p_limit     int     default 20,
  p_before    date    default null,
  p_before_id uuid    default null,
  p_mine      boolean default false,
  p_place     text    default null
)
returns json
language sql security definer stable
set search_path = public
as $$
with me_ as (select my_member_id() as id),
today_ as (select (now() at time zone 'Asia/Seoul')::date as d),
past_all as (
  select e.id, e.date, e.place, e.title, e.confirmed_at,
         exists (select 1 from attendance a
                  where a.event_id = e.id and a.member_id = (select id from me_)) as went
    from events e
   where e.date < (select d from today_)
),
filtered as (
  select * from past_all
   where (coalesce(p_place, '') = '' or place = p_place)
     and (not coalesce(p_mine, false) or went)
),
page as (
  select f.*,
         (select count(*)::int from posts p
           where p.type = 'review' and p.event_id = f.id and not coalesce(p.hidden, false)) as reviews,
         (select p.id from posts p
           where p.type = 'review' and p.event_id = f.id
             and p.author_id = (select id from me_) and not coalesce(p.hidden, false)
           order by p.created_at desc limit 1) as my_review
    from filtered f
   where p_before is null
      or (p_before_id is null and f.date < p_before)
      or (p_before_id is not null and (f.date, f.id) < (p_before, p_before_id))
   order by f.date desc, f.id desc
   limit least(greatest(coalesce(p_limit, 20), 1), 50)
)
select case when not is_member() then null else
  json_build_object(
    'rows', (select coalesce(json_agg(json_build_object(
               'id', id, 'date', date, 'place', place, 'title', title,
               'confirmed', confirmed_at is not null, 'went', went,
               'reviews', reviews, 'my_review', my_review)
               order by date desc, id desc), '[]'::json) from page),
    'total', (select count(*)::int from filtered),
    'places', (select coalesce(json_agg(json_build_object('place', place, 'n', n)
                 order by n desc, place), '[]'::json)
                 from (select place, count(*)::int as n from past_all
                        where coalesce(place, '') <> '' group by place) x)
  )
end;
$$;

revoke all on function past_events(int, date, uuid, boolean, text) from public, anon;
grant execute on function past_events(int, date, uuid, boolean, text) to authenticated;
