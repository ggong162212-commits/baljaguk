-- ============================================================
--  ② 의견에 사진 붙이기
-- ------------------------------------------------------------
--  구성원 의견: 「어느 단계에서 고쳐 달라는 건지 보여 주고 싶다」
--  사진 세 장까지. **운영진만** 볼 수 있다.
--
--  ★ 이름 없이 보낼 때는 경로에 member_id 를 쓰지 않는다 —
--    경로만 봐도 누가 보냈는지 알 수 있으면 익명이 아니다.
-- ============================================================
alter table feedback
  add column if not exists photos text[] not null default '{}';

/* 의견 사진은 따로 담는다 — 구성원이 서로 못 보게 */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
     values ('feedback', 'feedback', false, 5242880,
             array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
   set public = false,
       file_size_limit = 5242880,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists "feedback shot read"   on storage.objects;
drop policy if exists "feedback shot write"  on storage.objects;
drop policy if exists "feedback shot delete" on storage.objects;

/* 올리기는 구성원 누구나, 보기는 운영진만 */
create policy "feedback shot write" on storage.objects for insert to authenticated
  with check (bucket_id = 'feedback' and is_member());
create policy "feedback shot read" on storage.objects for select to authenticated
  using (bucket_id = 'feedback' and is_admin());
create policy "feedback shot delete" on storage.objects for delete to authenticated
  using (bucket_id = 'feedback' and is_admin());


-- ── 의견 보내기 — 사진 경로를 같이 받는다
--    인자가 늘어 옛 함수와 겹친다. 옛 것을 먼저 치운다.
drop function if exists feedback_send(text, boolean);
drop function if exists feedback_send(text);

create or replace function feedback_send(p_body text, p_anon boolean default false,
                                         p_photos text[] default '{}')
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  me_  uuid := my_member_id();
  day_ date := (now() at time zone 'Asia/Seoul')::date;
  tag_ text;
  n_   int;
begin
  if coalesce(btrim(p_body), '') = '' and coalesce(array_length(p_photos, 1), 0) = 0 then
    return json_build_object('ok', false, 'why', 'empty');
  end if;

  if p_anon then
    /* 이름 없이 — 누가 보냈는지 적지 않는다.
       하루 세 번까지만 받는다 (날짜 + 흐린 자국으로만 센다) */
    tag_ := encode(digest(coalesce(me_::text, '') || day_::text || 'baljaguk', 'sha256'), 'hex');
    insert into feedback_quota (day, tag, n) values (day_, tag_, 1)
    on conflict (day, tag) do update set n = feedback_quota.n + 1
    returning n into n_;
    if n_ > 3 then
      return json_build_object('ok', false, 'why', 'toomany');
    end if;
    insert into feedback (member_id, body, anon, kind, photos)
         values (null, btrim(coalesce(p_body, '')), true, 'idea', coalesce(p_photos, '{}'));
  else
    if me_ is null then return json_build_object('ok', false, 'why', 'nomember'); end if;
    insert into feedback (member_id, body, anon, kind, photos)
         values (me_, btrim(coalesce(p_body, '')), false, 'idea', coalesce(p_photos, '{}'));
  end if;

  return json_build_object('ok', true);
end;
$$;
revoke all on function feedback_send(text, boolean, text[]) from public, anon;
grant execute on function feedback_send(text, boolean, text[]) to authenticated;


-- ── 운영진 목록에 사진도
create or replace function feedback_open()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'id', f.id, 'created_at', f.created_at, 'body', f.body,
            'anon', f.anon,
            /* 익명이면 이름도 사진도 아예 꺼내지 않는다 */
            'who', case when f.anon then null
                        else (select m.name from members m where m.id = f.member_id) end,
            'who_photo', case when f.anon then null
                        else (select m.photo_path from members m where m.id = f.member_id) end,
            'can_reply', (not f.anon) and f.member_id is not null,
            'reply', f.reply,
            'replied', f.replied_at is not null,
            'shots', f.photos)
            order by f.created_at desc), '[]'::json)
     from feedback f where f.done_at is null and f.kind = 'idea')
end;
$$;


-- ── 의견을 정리하면 사진 경로를 돌려준다 (화면이 파일을 지운다)
drop function if exists feedback_done(uuid);

create or replace function feedback_done(p_id uuid)
returns json
language plpgsql security definer
set search_path = public
as $$
declare shots text[];
begin
  if not is_admin() then return json_build_object('ok', false, 'why', 'notadmin'); end if;
  select photos into shots from feedback where id = p_id;
  update feedback set done_at = now(), done_by = my_member_id() where id = p_id;
  /* 파일은 Edge 쪽에서 지우는 게 맞지만, 경로를 돌려줘
     화면이 지우게 한다 — 남아 있으면 저장 공간만 먹는다 */
  return json_build_object('ok', true, 'shots', coalesce(shots, '{}'));
end;
$$;
revoke all on function feedback_done(uuid) from public, anon;
grant execute on function feedback_done(uuid) to authenticated;


-- ── 저장 공간에 영상을 따로 센다
create or replace function usage_stats()
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  json_build_object(
    'members',     (select count(*)::int from members where status <> 'left'),
    'linked',      (select count(*)::int from members
                     where status <> 'left' and auth_user_id is not null),
    'joined_week', (select count(*)::int from members
                     where status <> 'left' and linked_at > now() - interval '7 days'),
    'posts_week',  (select count(*)::int from posts
                     where created_at > now() - interval '7 days' and not hidden),
    'reviews_week',(select count(*)::int from posts
                     where type = 'review' and created_at > now() - interval '7 days'
                       and not hidden),
    'comments_week',(select count(*)::int from comments
                     where created_at > now() - interval '7 days' and not hidden),
    'push_on',     (select count(distinct member_id)::int from push_subscriptions),
    'photos',      (select count(*)::int from post_photos where kind = 'photo'),
    'videos',      (select count(*)::int from post_photos where kind = 'video'),
    'video_bytes', (select coalesce(sum((o.metadata->>'size')::bigint), 0)
                      from storage.objects o
                      join post_photos f on f.path = o.name and f.kind = 'video'
                     where o.bucket_id = 'community'),
    'bytes',       (select coalesce(sum((o.metadata->>'size')::bigint), 0)
                      from storage.objects o
                     where o.bucket_id in ('community', 'avatars', 'feedback')),
    'rows',        (select (select count(*) from posts) + (select count(*) from comments)
                         + (select count(*) from reactions) + (select count(*) from poll_votes))
  )
end;
$$;


-- ── 오래된 영상부터 정리 (영상만 지우고 글은 남긴다)
create or replace function old_videos(p_limit int default 20)
returns json
language sql security definer stable
set search_path = public
as $$
select case when not is_admin() then null else
  (select coalesce(json_agg(json_build_object(
            'path', f.path, 'post_id', f.post_id,
            'created_at', p.created_at,
            'body', left(p.body, 40),
            'bytes', (select (o.metadata->>'size')::bigint from storage.objects o
                       where o.bucket_id = 'community' and o.name = f.path))
            order by p.created_at), '[]'::json)
     from (select * from post_photos where kind = 'video') f
     join posts p on p.id = f.post_id
    limit greatest(1, least(coalesce(p_limit, 20), 100)))
end;
$$;
revoke all on function old_videos(int) from public, anon;
grant execute on function old_videos(int) to authenticated;
