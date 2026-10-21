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
--
-- ★ 후기 수 (2026-10-21 고침): 실서버 후기 글이 event_id 없이 보호소·날짜만 갖고 있다
--   (「직접 입력」으로 쓴 글). event_id 로만 세면 0 이 된다 — vol_board 도 같은 이유로 「후기 0개」.
--   그래서 event_id 가 같거나, event_id 가 비었으면 같은 보호소·같은 날짜인 후기를 센다
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
           where p.type = 'review' and not coalesce(p.hidden, false)
             and (p.event_id = f.id
                  or (p.event_id is null and p.place = f.place and p.date = f.date))) as reviews,
         (select p.id from posts p
           where p.type = 'review'
             and (p.event_id = f.id
                  or (p.event_id is null and p.place = f.place and p.date = f.date))
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

-- ============================================================
-- 봉사 신청자 보기 — 다가오는 봉사 카드의 얼굴 겹침 · 신청자 시트 (volwho.js)
-- event_signups(p_event)
--   going   : 신청한 사람 — 신청한 순서(attendance.created_at)
--   waiting : 대기자 — 대기 신청한 순서(event_waitlist.created_at)
--   한 사람에 이름 · 사진 경로 · 기수만. 기수는 가입 신청서(applications.generation)에서
--   이어 받는다(members.application_id). 없으면 null. 연락처·학번 없음
--   event_people(이름순 · 기수 없음 · 대기 없음)은 그대로 둔다 — @ 목록이 쓴다
-- ============================================================
create or replace function event_signups(p_event uuid)
returns json
language sql security definer stable
set search_path = public
as $$
  select case when not is_member() then null else json_build_object(
    'going', (select coalesce(json_agg(json_build_object(
                'id', m.id, 'name', m.name, 'photo', m.photo_path, 'gen', ap.generation)
                order by a.created_at, a.id), '[]'::json)
                from attendance a
                join members m on m.id = a.member_id
                left join applications ap on ap.id = m.application_id
               where a.event_id = p_event),
    'waiting', (select coalesce(json_agg(json_build_object(
                'id', m.id, 'name', m.name, 'photo', m.photo_path, 'gen', ap.generation)
                order by w.created_at, w.id), '[]'::json)
                from event_waitlist w
                join members m on m.id = w.member_id
                left join applications ap on ap.id = m.application_id
               where w.event_id = p_event)
  ) end;
$$;

revoke all on function event_signups(uuid) from public, anon;
grant execute on function event_signups(uuid) to authenticated;


-- ------------------------------------------------------------
-- (선택 · 쓰기 — 메인이 선고은님 확인 뒤에만) 옛 후기에 event_id 채우기
-- 같은 보호소·같은 날짜 봉사가 딱 하나일 때만. 실행하지 않아도 위 함수는 맞게 센다.
-- ------------------------------------------------------------
-- update posts p set event_id = e.id
--   from events e
--  where p.type = 'review' and p.event_id is null
--    and e.place = p.place and e.date = p.date
--    and (select count(*) from events e2 where e2.place = p.place and e2.date = p.date) = 1;
