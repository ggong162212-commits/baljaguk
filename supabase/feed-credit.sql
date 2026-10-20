-- ============================================================
--  발자국 🐾 · 사료 적립 (천사들의 보금자리)
--  Supabase 대시보드 → SQL Editor → New query → 붙여넣고 Run
--
--  천보금은 돈 대신 사료로 후원하기로 해서
--  적립에 '단위'를 붙인다. 원(won) 또는 킬로그램(kg).
--  기존 기록은 모두 원이므로 기본값이 won 이다.
-- ============================================================

alter table events
  add column if not exists credit_unit text not null default 'won';
alter table events drop constraint if exists events_credit_unit_check;
alter table events add constraint events_credit_unit_check
  check (credit_unit in ('won', 'kg'));

alter table shelter_payouts
  add column if not exists unit text not null default 'won';
alter table shelter_payouts drop constraint if exists shelter_payouts_unit_check;
alter table shelter_payouts add constraint shelter_payouts_unit_check
  check (unit in ('won', 'kg'));


-- ------------------------------------------------------------
-- 후원 현황 — 단위별로 따로 모은다
-- ------------------------------------------------------------
create or replace function public_funds()
returns json
language sql
security definer
set search_path = public
stable
as $$
with ent as (
  select e.id, e.date, e.place,
         coalesce(e.credit_unit, 'won') as unit,
         (select count(*)::int from attendance a where a.event_id = e.id) as people,
         coalesce(e.credit_per_person, 0)::int as per,
         (select coalesce(array_agg(m.name order by m.name), '{}')
            from attendance a join members m on m.id = a.member_id
           where a.event_id = e.id) as names
    from events e
   where e.confirmed_at is not null
     and coalesce(e.credit_per_person, 0) > 0
),
rows_ as (
  select date, place, unit, people, per, (people * per)::int as amount, names
    from ent where people > 0
),
saved as (select place, unit, sum(amount)::int as saved from rows_ group by place, unit),
paid  as (select place, coalesce(unit, 'won') as unit, sum(amount)::int as paid
            from shelter_payouts group by place, coalesce(unit, 'won')),
places as (
  select coalesce(s.place, p.place) as place,
         coalesce(s.unit,  p.unit)  as unit,
         coalesce(s.saved, 0) as saved,
         coalesce(p.paid, 0)  as paid,
         coalesce(s.saved, 0) - coalesce(p.paid, 0) as remain
    from saved s
    full outer join paid p on p.place = s.place and p.unit = s.unit
),
-- 적립이 쌓이는 봉사지에 다녀온 사람 (사료로 쌓이는 천보금도 이제 포함된다)
joined as (
  select m.id as mid, m.name
    from ent e
    join attendance a on a.event_id = e.id
    join members m    on m.id = a.member_id
),
helpers as (
  select name, count(*)::int as times
    from joined group by mid, name
)
select json_build_object(
  'generated_at', now(),
  'total_saved',    (select coalesce(sum(saved), 0) from places where unit = 'won'),
  'total_paid',     (select coalesce(sum(paid),  0) from places where unit = 'won'),
  'total_saved_kg', (select coalesce(sum(saved), 0) from places where unit = 'kg'),
  'total_paid_kg',  (select coalesce(sum(paid),  0) from places where unit = 'kg'),
  'total_helpers', (select count(*)::int from helpers),
  'total_visits',  (select count(*)::int from joined),
  'places',  (select coalesce(json_agg(row_to_json(x) order by x.remain desc, x.place), '[]'::json)
                from places x),
  'helpers', (select coalesce(json_agg(row_to_json(h) order by h.times desc, h.name), '[]'::json)
                from helpers h),
  'entries', (select coalesce(json_agg(row_to_json(y)), '[]'::json)
                from (select date, place, unit, people, per, amount, names
                        from rows_ order by date desc, place limit 100) y),
  'payouts', (select coalesce(json_agg(row_to_json(z)), '[]'::json)
                from (select id, date, place, amount, coalesce(unit, 'won') as unit,
                             memo, coalesce(has_photo, false) as has_photo
                        from shelter_payouts order by date desc limit 50) z),
  'campaigns', (select coalesce(json_agg(row_to_json(c)), '[]'::json)
                  from (select c.id, c.title, c.goal, c.status, c.ends_on, c.note,
                               (select coalesce(sum(d.amount), 0)::int from donations d
                                 where d.campaign_id = c.id) as raised,
                               (select count(*)::int from donations d
                                 where d.campaign_id = c.id) as donors
                          from campaigns c order by c.created_at desc) c)
);
$$;

revoke all on function public_funds() from public;
grant execute on function public_funds() to anon, authenticated;


-- ------------------------------------------------------------
-- 내 활동 — 원과 사료를 따로 센다
-- ------------------------------------------------------------
create or replace function my_activity()
returns json
language sql
security definer
set search_path = public
stable
as $$
with me_ as (
  select m.id from members m where m.auth_user_id = auth.uid()
),
mine as (
  select e.id as event_id, e.date, e.title, e.place,
         coalesce(e.credit_unit, 'won') as unit,
         coalesce(e.credit_per_person, 0)::int as per
    from attendance a
    join me_      on me_.id = a.member_id
    join events e on e.id    = a.event_id
   where e.confirmed_at is not null
),
byplace as (
  select place, unit, count(*)::int as times, sum(per)::int as credit
    from mine where per > 0 group by place, unit
)
select case when not exists (select 1 from me_) then null else
  json_build_object(
    'times',        (select count(*)::int from mine),
    'last_date',    (select max(date)     from mine),
    'credit_total',    (select coalesce(sum(per), 0)::int from mine where unit = 'won'),
    'credit_total_kg', (select coalesce(sum(per), 0)::int from mine where unit = 'kg'),
    'places',       (select coalesce(json_agg(json_build_object(
                       'place', place, 'unit', unit, 'times', times, 'credit', credit)
                       order by credit desc), '[]'::json) from byplace),
    'records',      (select coalesce(json_agg(json_build_object(
                       'event_id', event_id, 'date', date, 'title', title,
                       'place', place, 'unit', unit, 'per', per)
                       order by date desc), '[]'::json) from mine)
  )
end;
$$;

revoke all on function my_activity() from public, anon;
grant execute on function my_activity() to authenticated;
