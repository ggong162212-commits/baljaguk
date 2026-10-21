#!/bin/sh
# ============================================================
#  SQL 안전 점검 — 빈 포스트그레스에 한 번 돌려본다
#
#  실서버에 올리기 전에 문법과 칸 이름 오류를 잡는다.
#  로직까지 보는 건 아니다. 하지만
#  「claim_attempts 의 칸 이름을 틀렸다」 같은 사고는 여기서 걸린다.
#
#  쓰는 법:  sh supabase/check.sh
#  필요한 것: 도커 (Docker Desktop 이 켜져 있어야 한다)
# ============================================================
set -e

NAME=baljaguk_sqlcheck
PGPASS=checkonly
HERE=$(cd "$(dirname "$0")" && pwd)

if ! docker ps >/dev/null 2>&1; then
  echo "도커가 안 켜져 있어요. Docker Desktop 을 켜고 다시 해주세요."
  exit 2
fi

echo "빈 포스트그레스를 띄웁니다…"
docker rm -f "$NAME" >/dev/null 2>&1 || true
docker run -d --name "$NAME" -e POSTGRES_PASSWORD="$PGPASS" postgres:15-alpine >/dev/null

# 올라올 때까지 기다린다
i=0
while [ $i -lt 40 ]; do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  i=$((i + 1))
  sleep 1
done

run() {
  echo ""
  echo "── $1"
  if docker exec -i "$NAME" psql -U postgres -v ON_ERROR_STOP=1 -q < "$2"; then
    echo "   통과"
  else
    echo "   ✗ 여기서 멈췄어요"
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    exit 1
  fi
}

run "받침대 (Supabase 가 이미 갖고 있는 것들)" "$HERE/_test_stub.sql"
run "schema.sql" "$HERE/schema.sql"
run "community.sql" "$HERE/community.sql"
if [ -f "$HERE/feed-credit.sql" ]; then
  run "feed-credit.sql" "$HERE/feed-credit.sql"
fi
if [ -f "$HERE/fix-1.sql" ]; then
  run "fix-1.sql" "$HERE/fix-1.sql"
fi
if [ -f "$HERE/fix-2.sql" ]; then
  run "fix-2.sql" "$HERE/fix-2.sql"
fi
if [ -f "$HERE/fix-3.sql" ]; then
  run "fix-3.sql" "$HERE/fix-3.sql"
fi

# 함수 본문은 만들 때 검사되지 않는다 — 실제로 들여다본다
if [ -f "$HERE/check-calls.sql" ]; then
  run "없는 칸·표를 쓰는 함수 찾기" "$HERE/check-calls.sql"
fi

echo ""
echo "── 없는 것을 부르는 곳 (버튼이 조용히 죽는 버그)"
if node "$HERE/check-js.js"; then
  :
else
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit 1
fi

# 만들어진 함수 목록을 파일로도 남긴다 — 실서버와 대조할 때 쓴다
docker exec -i "$NAME" psql -U postgres -At -c   "select string_agg(p.proname, ',' order by p.proname) from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public';"   > "$HERE/.functions.txt" 2>/dev/null || true

echo ""
echo "── 프런트가 부르는 RPC 가 다 만들어졌나"
if node "$HERE/check-live.js" "$HERE/.functions.txt"; then
  :
else
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit 1
fi

echo ""
echo "── 만들어진 함수"
docker exec -i "$NAME" psql -U postgres -At -c \
  "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' order by 1;" | tr '\n' ' '
echo ""
echo ""
echo "모두 통과했어요. (문법·칸 이름만 본 것이고 로직은 아니에요)"
docker rm -f "$NAME" >/dev/null 2>&1 || true
