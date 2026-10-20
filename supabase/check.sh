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

echo ""
echo "── 만들어진 함수"
docker exec -i "$NAME" psql -U postgres -At -c \
  "select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' order by 1;" | tr '\n' ' '
echo ""
echo ""
echo "모두 통과했어요. (문법·칸 이름만 본 것이고 로직은 아니에요)"
docker rm -f "$NAME" >/dev/null 2>&1 || true
