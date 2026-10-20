// ============================================================
//  발자국 · 알림 보내기 (Supabase Edge Function)
// ------------------------------------------------------------
//  push_outbox 에 쌓인 것을 가져다 구성원 기기로 보낸다.
//  pg_cron 이 1분마다 부른다.
//
//  올리기:
//    supabase functions deploy push --no-verify-jwt
//
//  먼저 넣을 것 (Edge Functions → Secrets):
//    VAPID_PUBLIC_KEY   — assets/config.js 에 넣은 것과 같은 값
//    VAPID_PRIVATE_KEY  — 이것만 비밀. 어디에도 적지 않는다
//    VAPID_SUBJECT      — mailto:운영진메일 (예: mailto:unyoung@baljaguk.club)
//    PUSH_SECRET        — pg_cron 이 부를 때 쓰는 암호. 아무 긴 문자열
//
//  만드는 법:  npx web-push generate-vapid-keys
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUB = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIV = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUBJ = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const SECRET = Deno.env.get('PUSH_SECRET') ?? '';

if (PUB && PRIV) webpush.setVapidDetails(SUBJ, PUB, PRIV);

const db = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });

/* 알림 종류 → 구독자가 끈 칸 이름 */
const WANT: Record<string, string> = {
  post: 'want_post',
  comment: 'want_comment',
  reply: 'want_reply',
  reaction: 'want_reaction',
  notice: 'want_notice',
  vol: 'want_vol',
  promoted: 'want_promoted',
  poll: 'want_poll',
  quiz: 'want_quiz',
  before: 'want_before',
  thanks: 'want_thanks',
};

Deno.serve(async (req) => {
  /* 아무나 부르지 못하게 */
  if (SECRET && req.headers.get('x-push-secret') !== SECRET) {
    return new Response('no', { status: 401 });
  }
  if (!PUB || !PRIV) {
    return Response.json({ ok: false, why: 'VAPID 키가 아직 없어요' }, { status: 500 });
  }

  /* 아직 안 보낸 것 — 한 번에 너무 많이 집지 않는다 */
  const { data: rows, error } = await db
    .from('push_outbox')
    .select('*')
    .is('sent_at', null)
    .lt('tries', 3)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return Response.json({ ok: false, why: error.message }, { status: 500 });
  if (!rows?.length) return Response.json({ ok: true, sent: 0 });

  let sent = 0, gone = 0;

  for (const row of rows) {
    /* 받을 사람의 기기들 — 그 종류를 끈 사람은 빼고 */
    let q = db.from('push_subscriptions').select('*');
    if (row.member_id) q = q.eq('member_id', row.member_id);
    const want = WANT[row.kind];
    if (want) q = q.neq(want, false);

    const { data: subs } = await q;

    for (const s of subs ?? []) {
      /* 내가 한 일로 나에게 알림이 가지 않게 */
      if (!row.member_id && row.actor_id && s.member_id === row.actor_id) continue;

      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify({
            title: row.title,
            body: row.body,
            url: row.url ?? 'me.html',
            kind: row.kind,
            id: row.id,
          }),
          { TTL: 60 * 60 * 12 },
        );
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        /* 410·404 는 기기가 사라진 것 — 치운다 */
        if (code === 410 || code === 404) {
          await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
          gone++;
        }
      }
    }

    await db.from('push_outbox')
      .update({ sent_at: new Date().toISOString(), tries: (row.tries ?? 0) + 1 })
      .eq('id', row.id);
  }

  return Response.json({ ok: true, sent, gone, picked: rows.length });
});
