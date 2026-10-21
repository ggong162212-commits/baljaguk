// ============================================================
//  발자국 · 알림 보내기 (Supabase Edge Function)
// ------------------------------------------------------------
//  push_outbox 에 쌓인 것을 가져다 구성원 기기로 보낸다.
//  pg_cron 이 1분마다 부른다.
//
//  ※ 바깥 라이브러리를 하나도 쓰지 않는다.
//    관리 API 로 올리면 의존성을 받아오지 못해서(--no-remote)
//    jsr:·npm: 을 쓰면 부팅에서 죽는다.
//    그래서 웹 푸시 암호화와 VAPID 서명을 표준 기능(Web Crypto)으로 직접 했다.
//
//  넣어야 할 값 (Edge Functions → Secrets):
//    VAPID_PUBLIC_KEY · VAPID_PRIVATE_KEY · VAPID_SUBJECT · PUSH_SECRET
// ============================================================

const SB_URL = Deno.env.get('SUPABASE_URL')!;
const SB_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const PUB = Deno.env.get('VAPID_PUBLIC_KEY') ?? '';
const PRIV = Deno.env.get('VAPID_PRIVATE_KEY') ?? '';
const SUBJ = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@example.com';
const SECRET = Deno.env.get('PUSH_SECRET') ?? '';

/* 알림 종류 → 구독자가 끈 칸 이름 */
const WANT: Record<string, string> = {
  post: 'want_post', comment: 'want_comment', reply: 'want_reply',
  reaction: 'want_reaction', notice: 'want_notice', vol: 'want_vol',
  promoted: 'want_promoted', poll: 'want_poll', quiz: 'want_quiz',
  before: 'want_before', thanks: 'want_thanks', feedback: 'want_feedback',
  /* 언급(@) · 운영진 지원 — 빠져 있어서 끈 사람에게도 가던 것 */
  mention: 'want_mention', apply: 'want_apply',
  /* 칭찬해요 · 명예의 전당 — 「칭찬·축하」 하나로 끈다 (fix-praise.sql) */
  praise: 'want_praise',
};

/* ---------- 작은 도구들 ---------- */
const enc = new TextEncoder();

function b64uToBytes(s: string): Uint8Array {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
function bytesToB64u(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function join(...parts: Uint8Array[]): Uint8Array {
  const n = parts.reduce((t, p) => t + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

/* ---------- VAPID 서명 ---------- */
async function vapidKey(): Promise<CryptoKey> {
  const pub = b64uToBytes(PUB);
  const jwk = {
    kty: 'EC', crv: 'P-256',
    x: bytesToB64u(pub.slice(1, 33)),
    y: bytesToB64u(pub.slice(33, 65)),
    d: PRIV,
    ext: true,
  };
  return await crypto.subtle.importKey(
    'jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
  );
}

async function vapidHeader(audience: string): Promise<string> {
  const header = bytesToB64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const body = bytesToB64u(enc.encode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: SUBJ,
  })));
  const data = enc.encode(header + '.' + body);
  const key = await vapidKey();
  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, key, data,
  ));
  return 'vapid t=' + header + '.' + body + '.' + bytesToB64u(sig) + ', k=' + PUB;
}

/* ---------- 내용 암호화 (RFC 8188 aes128gcm) ---------- */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number) {
  const base = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info }, base, len * 8,
  );
  return new Uint8Array(bits);
}

async function encryptPayload(text: string, p256dh: string, auth: string) {
  const uaPublic = b64uToBytes(p256dh);
  const authSecret = b64uToBytes(auth);

  /* 그때그때 새로 만드는 한 쌍 */
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'],
  ) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));

  const uaKey = await crypto.subtle.importKey(
    'raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [],
  );
  const shared = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: uaKey }, pair.privateKey, 256,
  ));

  /* 둘만 아는 값을 만든다 */
  const prkInfo = join(enc.encode('WebPush: info\0'), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, prkInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  /* 끝에 0x02 를 붙여 「여기가 마지막」임을 알린다 */
  const plain = join(enc.encode(text), new Uint8Array([2]));
  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce }, aesKey, plain,
  ));

  /* 머리말: salt(16) · 한 덩이 크기(4) · 키 길이(1) · 공개키(65) */
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return join(salt, rs, new Uint8Array([asPublic.length]), asPublic, ct);
}

/* ---------- 데이터베이스 (REST 로 직접) ---------- */
async function db(path: string, init: RequestInit = {}) {
  const r = await fetch(SB_URL + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: SB_KEY,
      Authorization: 'Bearer ' + SB_KEY,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  if (!r.ok) throw new Error(await r.text());
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

/* ---------- 본체 ---------- */
Deno.serve(async (req) => {
  if (SECRET && req.headers.get('x-push-secret') !== SECRET) {
    return new Response('no', { status: 401 });
  }
  if (!PUB || !PRIV) {
    return Response.json({ ok: false, why: 'VAPID 키가 아직 없어요' }, { status: 500 });
  }

  let rows: any[];
  try {
    rows = await db('push_outbox?sent_at=is.null&tries=lt.3&order=created_at.asc&limit=50');
  } catch (e) {
    return Response.json({ ok: false, why: String(e) }, { status: 500 });
  }
  if (!rows?.length) return Response.json({ ok: true, sent: 0 });

  let sent = 0, gone = 0, failed = 0;

  for (const row of rows) {
    const want = WANT[row.kind];
    let q = 'push_subscriptions?select=*';
    if (row.member_id) q += '&member_id=eq.' + row.member_id;
    if (want) q += '&' + want + '=not.is.false';

    let subs: any[] = [];
    try { subs = await db(q) ?? []; } catch { subs = []; }

    for (const s of subs) {
      /* 내가 한 일로 나에게 알림이 가지 않게 */
      if (!row.member_id && row.actor_id && s.member_id === row.actor_id) continue;

      try {
        const payload = JSON.stringify({
          title: row.title, body: row.body,
          url: row.url ?? 'me.html', kind: row.kind, id: row.id,
        });
        const bodyBytes = await encryptPayload(payload, s.p256dh, s.auth);
        const origin = new URL(s.endpoint).origin;

        const r = await fetch(s.endpoint, {
          method: 'POST',
          headers: {
            Authorization: await vapidHeader(origin),
            'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream',
            TTL: '43200',
          },
          body: bodyBytes,
        });

        if (r.ok) sent++;
        else if (r.status === 404 || r.status === 410) {
          await db('push_subscriptions?endpoint=eq.' + encodeURIComponent(s.endpoint),
            { method: 'DELETE' });
          gone++;
        } else failed++;
      } catch {
        failed++;
      }
    }

    await db('push_outbox?id=eq.' + row.id, {
      method: 'PATCH',
      body: JSON.stringify({ sent_at: new Date().toISOString(), tries: (row.tries ?? 0) + 1 }),
    });
  }

  return Response.json({ ok: true, sent, gone, failed, picked: rows.length });
});
