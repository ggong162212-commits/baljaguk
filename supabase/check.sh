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
if [ -f "$HERE/fix-4.sql" ]; then
  run "fix-4.sql" "$HERE/fix-4.sql"
fi
if [ -f "$HERE/fix-5.sql" ]; then
  run "fix-5.sql" "$HERE/fix-5.sql"
fi
if [ -f "$HERE/fix-6.sql" ]; then
  run "fix-6.sql" "$HERE/fix-6.sql"
fi
if [ -f "$HERE/fix-7.sql" ]; then
  run "fix-7.sql" "$HERE/fix-7.sql"
fi
if [ -f "$HERE/fix-8.sql" ]; then
  run "fix-8.sql" "$HERE/fix-8.sql"
fi
if [ -f "$HERE/fix-9.sql" ]; then
  run "fix-9.sql" "$HERE/fix-9.sql"
fi
if [ -f "$HERE/fix-10.sql" ]; then
  run "fix-10.sql" "$HERE/fix-10.sql"
fi
if [ -f "$HERE/fix-pastvol.sql" ]; then
  run "fix-pastvol.sql" "$HERE/fix-pastvol.sql"
fi
if [ -f "$HERE/fix-11.sql" ]; then
  run "fix-11.sql" "$HERE/fix-11.sql"
fi
if [ -f "$HERE/fix-12.sql" ]; then
  run "fix-12.sql" "$HERE/fix-12.sql"
fi
if [ -f "$HERE/fix-13.sql" ]; then
  run "fix-13.sql" "$HERE/fix-13.sql"
fi
if [ -f "$HERE/fix-14.sql" ]; then
  run "fix-14.sql" "$HERE/fix-14.sql"
fi
if [ -f "$HERE/fix-15.sql" ]; then
  run "fix-15.sql" "$HERE/fix-15.sql"
fi
if [ -f "$HERE/fix-16.sql" ]; then
  run "fix-16.sql" "$HERE/fix-16.sql"
fi
if [ -f "$HERE/fix-17.sql" ]; then
  run "fix-17.sql" "$HERE/fix-17.sql"
fi
if [ -f "$HERE/fix-praise.sql" ]; then
  run "fix-praise.sql" "$HERE/fix-praise.sql"
fi
if [ -f "$HERE/fix-fame.sql" ]; then
  run "fix-fame.sql" "$HERE/fix-fame.sql"
fi
if [ -f "$HERE/fix-18.sql" ]; then
  run "fix-18.sql" "$HERE/fix-18.sql"
fi
if [ -f "$HERE/fix-19.sql" ]; then
  run "fix-19.sql" "$HERE/fix-19.sql"
fi
if [ -f "$HERE/contest.sql" ]; then
  run "contest.sql" "$HERE/contest.sql"
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

echo ""
echo "── 댓글 그리기가 갈라지지 않았나 (들여쓰기가 한쪽만 사라지던 버그)"
if node "$HERE/check-comments.js"; then
  :
else
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit 1
fi

echo ""
echo "── 화면 안 <script> 가 아직 안 읽힌 것을 쓰나 (defer 사고)"
if node "$HERE/check-pages.js"; then
  :
else
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  exit 1
fi

echo ""
echo "── 화면 아홉 개를 띄워 콘솔 오류 보기 (헤드리스 크롬이 있을 때만)"
if node "$HERE/check-console.js"; then
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
